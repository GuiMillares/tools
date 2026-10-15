// O orquestrador do Escritório (ADR-149, ADR-161): lê a fila do Salesforce,
// decide o que cada tarefa precisa (triagem em código → modelo opcional →
// pendência), valida em código, e manda para o agente ou abre uma pendência
// para você.
//
// Puro e injetável, como lib/automacao.js: recebe a loja, o adaptador do
// modelo (opcional), a leitura da fila, o log e o executor (fase 2). O
// processo principal é quem o instancia, liga o relógio de 5 min e expõe os
// canais IPC; os testes passam tudo falso.
//
// A ordem de decisão por tarefa, sempre:
//   1. triagem determinística (lib/triagem.js) — publicação MPI+, Busca One,
//      bloqueio, SSL, suspensão e o que é ignorado por ADR: sem modelo;
//   2. modelo (Gemini) — só para o que sobrou, e ele pode responder "pergunta";
//   3. sem modelo configurado (o normal) — pendência "para você".
// O que o Asgard aprende entra como código na triagem, com a decisão na ADR
// (ADR-161); não há mais regras editadas na tela.
// Depois do plano, a VALIDAÇÃO DE EXECUÇÃO (regras do catálogo) decide se o
// agente pode agir; em modo observação ela roda a seco e só anota.
const Estados = require('./estados');
const Catalogo = require('./catalogo');
const Regras = require('./regras');
const Resumo = require('./resumo');
const TriagemIa = require('./triagem-ia');
const Triagem = require('../triagem');
const Automacao = require('../automacao');

const T = Estados.TAREFA;
const MAX_FALHAS_ANALISE = 3;

function criarOrquestrador(deps = {}) {
  const loja = deps.loja;
  if (!loja) throw new Error('criarOrquestrador: sem loja');
  const log = typeof deps.log === 'function' ? deps.log : () => {};
  const agora = typeof deps.agora === 'function' ? deps.agora : () => new Date().toISOString();
  const emitir = typeof deps.emitir === 'function' ? deps.emitir : () => {};
  const triar = typeof deps.triar === 'function' ? deps.triar : Triagem.triar;
  let ia = deps.ia || null;
  let rodando = false;

  const ctxExecucao = () => ({ ...(deps.ctxExecucao || {}), tarefasComDominio: (d) => loja.tarefasComDominio(d), tarefa: (id) => loja.tarefa(id) });
  const nomeAgente = (id) => { const a = Catalogo.agentePorId(id); return a ? `${a.nome} (${a.papel})` : String(id || '?'); };
  const rotulo = (t) => (t.plano && t.plano.parametros && t.plano.parametros.dominio) || t.assunto || t.id;

  function trocarIa(nova) { ia = nova || null; }

  // Sem o modelo, a "leitura" de uma tarefa é o começo do comentário: o
  // suficiente para a pendência dizer do que se trata.
  function resumoComentario(descricao) {
    const linhas = String(descricao || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^(bom dia|boa tarde|boa noite|ol[áa])\b/i.test(l));
    return linhas.join(' ').replace(/\s+/g, ' ').slice(0, 200);
  }

  function registrar(t, evento) { Estados.registrar(t, evento, agora()); }
  function ir(t, para, motivo, extra) {
    const r = Estados.transicionar(t, para, motivo, extra, agora);
    if (!r.ok) log(`Escritório: ${t.id} ${r.erro}`, 'error');
    return r.ok;
  }

  // ---------- ligar / desligar ----------
  function ligar({ geral, observacao, agente, valor } = {}) {
    const l = loja.ligado;
    if (typeof geral === 'boolean') { l.geral = geral; log(`Escritório: modo automático ${geral ? 'LIGADO' : 'desligado'}${geral && l.observacao ? ' (em observação: só anota, não executa)' : ''}.`, geral ? 'success' : 'info'); }
    if (typeof observacao === 'boolean') { l.observacao = observacao; log(`Escritório: modo observação ${observacao ? 'ligado (só anota)' : 'desligado (executa o que validar)'}.`, observacao ? 'info' : 'warn'); }
    if (agente && Catalogo.agentePorId(agente) && typeof valor === 'boolean') { l.agentes[agente] = valor; log(`Escritório: ${nomeAgente(agente)} ${valor ? 'ligado' : 'desligado'}.`, 'info'); }
    loja.salvar();
    emitir({ tipo: 'ligado', ligado: { ...l } });
    return { ok: true, ligado: l };
  }

  function agenteLigado(id) {
    const a = Catalogo.agentePorId(id);
    if (!a) return false;
    return loja.ligado.agentes[id] !== false; // ligado por padrão; desligar é explícito
  }

  // ---------- a varredura ----------
  async function varrer({ manual = false } = {}) {
    if (rodando) { if (manual) log('Escritório: já há uma varredura rodando.', 'warn'); return { ok: false, motivo: 'rodando' }; }
    if (!manual && !loja.ligado.geral) return { ok: false, motivo: 'desligado' };
    rodando = true;
    emitir({ tipo: 'varredura', fase: 'inicio' });
    const resumo = { lidas: 0, novas: 0, analisadas: 0, planejadas: 0, pendencias: 0, ignoradas: 0, executariam: 0, executadas: 0, erros: 0, fechadas: 0 };
    try {
      log(`Escritório: lendo a fila do Salesforce${manual ? ' (rodar agora)' : ''}…`, 'cmd');
      let dados;
      try { dados = await deps.lerFila(); } catch (e) { dados = { ok: false, error: e && e.message ? e.message : String(e) }; }
      if (!dados || !dados.ok || !Array.isArray(dados.tarefas)) {
        log(`Escritório: não consegui ler a fila (${(dados && dados.error) || 'sem resposta'}).`, 'error');
        loja.marcarVarredura({ ok: false, erro: (dados && dados.error) || 'sem resposta' });
        loja.salvar();
        return { ok: false, motivo: (dados && dados.error) || 'fila' };
      }
      const abertasSf = dados.tarefas.filter((t) => t && !t.fechada);
      resumo.lidas = abertasSf.length;
      const vistas = new Set();
      for (const sf of abertasSf) {
        const { tarefa, nova, mudou } = loja.registrarDaFila(sf, { link: Automacao.linkDaTarefa(dados, sf), empresaFila: Automacao.empresaDaFila(dados, sf) });
        vistas.add(tarefa.id);
        if (nova) resumo.novas++;
        else if (mudou && [T.PENDENTE, T.IGNORADA, T.ESCALADA].includes(tarefa.estado)) {
          // A tarefa mudou no Salesforce (comentário novo, por exemplo): vale
          // olhar de novo, inclusive a que estava ignorada ou parada.
          registrar(tarefa, { tipo: 'fila', motivo: 'a tarefa mudou no Salesforce; reanalisando' });
          ir(tarefa, T.EM_ANALISE, 'mudou no Salesforce');
        }
      }
      // Quem estava aberta aqui e sumiu da fila foi fechada ou movida lá.
      for (const t of loja.tarefasAbertas()) {
        if (vistas.has(t.id) || t.estado === T.EXECUTANDO || t.estado === T.INTERROMPIDA) continue;
        const fechadaSf = dados.tarefas.find((x) => x && x.id === t.id && x.fechada);
        ir(t, T.CONCLUIDA, fechadaSf ? 'fechada no Salesforce' : 'saiu da fila do Salesforce');
        if (t.pendenciaId) soltarDaPendencia(t);
        resumo.fechadas++;
      }
      // Análise do que está esperando decisão.
      for (const t of loja.tarefas()) {
        if (![T.NA_FILA, T.EM_ANALISE].includes(t.estado)) continue;
        const r = await analisar(t);
        resumo.analisadas++;
        if (r === 'plano') resumo.planejadas++;
        else if (r === 'pendencia') resumo.pendencias++;
        else if (r === 'ignorada') resumo.ignoradas++;
        else if (r === 'erro') resumo.erros++;
      }
      // Execução (ou a seco) do que está planejado, do que falhou (nova
      // tentativa) e do que esperava confirmação com o modo automático agora
      // ligado.
      for (const t of loja.tarefas()) {
        if (![T.PLANEJADA, T.FALHOU, T.AGUARDANDO_CONFIRMACAO].includes(t.estado)) continue;
        if (t.estado === T.AGUARDANDO_CONFIRMACAO && !loja.ligado.geral) continue;
        const r = await tratarPlanejada(t);
        if (r === 'executaria') resumo.executariam++;
        else if (r === 'executada') resumo.executadas++;
        else if (r === 'adiada') resumo.adiadas = (resumo.adiadas || 0) + 1;
        else if (r === 'erro') resumo.erros++;
      }
      loja.podar();
      loja.marcarVarredura({ ok: true, ...resumo, manual });
      loja.salvar();
      const partes = [`${resumo.lidas} aberta(s) na fila`, `${resumo.novas} nova(s)`, `${resumo.planejadas} planejada(s)`, `${resumo.pendencias} pendência(s)`, `${resumo.ignoradas} ignorada(s)`];
      if (resumo.executariam) partes.push(`${resumo.executariam} executaria(m) (observação)`);
      if (resumo.executadas) partes.push(`${resumo.executadas} executada(s)`);
      if (resumo.adiadas) partes.push(`${resumo.adiadas} adiada(s)`);
      if (resumo.fechadas) partes.push(`${resumo.fechadas} fechada(s) no Salesforce`);
      if (resumo.erros) partes.push(`${resumo.erros} erro(s)`);
      log(`Escritório: varredura concluída — ${partes.join(', ')}.`, resumo.erros ? 'warn' : 'info');
      return { ok: true, resumo };
    } catch (e) {
      log(`Escritório: erro na varredura — ${e && e.message ? e.message : e}`, 'error');
      try { loja.salvar(); } catch (e2) { /* a próxima varredura grava */ }
      return { ok: false, motivo: e && e.message ? e.message : String(e) };
    } finally {
      rodando = false;
      emitir({ tipo: 'varredura', fase: 'fim' });
    }
  }

  // ---------- a decisão por tarefa ----------
  // Devolve 'plano' | 'pendencia' | 'ignorada' | 'erro'.
  async function analisar(t) {
    if (t.estado === T.NA_FILA) ir(t, T.EM_ANALISE, 'analisando');
    const tri = triar(t);
    t.triagem = { tipo: tri.tipo, plataforma: tri.plataforma || '', dominio: tri.dominio || '', temporario: tri.temporario || '', elegivel: !!tri.elegivel, motivo: tri.motivo || '' };

    // 1. o que a triagem decide ignorar por ADR
    if (tri.ignorar) {
      registrar(t, { tipo: 'decisao', origem: 'triagem', decisao: 'ignorar', motivo: tri.motivo || '' });
      ir(t, T.IGNORADA, `triagem: ${tri.motivo || 'ignorada por ADR'}`);
      log(`${rotulo(t)}: ignorada pela triagem (${tri.motivo || 'ADR'}).`, 'info');
      return 'ignorada';
    }

    // 2. triagem determinística
    const agente = Catalogo.agentePorTriagem(tri);
    if (agente && tri.elegivel) {
      registrar(t, { tipo: 'decisao', origem: 'triagem', motivo: `${tri.tipo}${tri.plataforma ? ' ' + tri.plataforma : ''} reconhecido pela triagem do Hub` });
      return planejar(t, { agente: agente.id, parametros: Catalogo.parametrosDaTriagem(tri, t), etapas: [], origem: 'triagem', motivo: `${tri.tipo}${tri.plataforma ? ' ' + tri.plataforma : ''} reconhecido pela triagem` });
    }
    if (agente && !tri.elegivel) {
      // Tipo conhecido, parâmetro faltando: pergunta específica desta tarefa.
      return abrirPendencia(t, {
        padrao: `${agente.id}:${TriagemIa.padraoDoAssunto(t.assunto)}`,
        pergunta: `Reconheci "${t.assunto}" como ${agente.nome}, mas ${tri.motivo || 'faltou um parâmetro'}. O que faço? Se a tarefa for corrigida no Salesforce, eu releio sozinho.`,
        agente: agente.id, origem: 'triagem',
      });
    }

    // 3. modelo — opcional (ADR-152): desligado ou sem chave (o normal), a
    //    tarefa vira pendência "para você": encaminhe, marque como tratada ou
    //    ignore; para o Asgard aprender, a regra entra na ADR (ADR-161).
    if (!ia || !ia.configurada) {
      if (!t.leitura) t.leitura = resumoComentario(t.descricao);
      return abrirPendencia(t, {
        padrao: TriagemIa.padraoDoAssunto(t.assunto),
        pergunta: `Não reconheci "${t.assunto}"${ia && ia.temChave ? ' (o modelo está desligado)' : ''}. Encaminhe para um agente, marque como tratada ou ignore. Para tarefas assim entrarem sozinhas, diga a regra ao Claude: ela vira código de triagem, com a decisão na ADR.`,
        origem: 'sem-modelo', leitura: t.leitura,
      });
    }
    let contexto = null;
    if (typeof deps.contexto === 'function' && t.link) {
      try { contexto = await deps.contexto(t); } catch (e) { contexto = null; }
    }
    const pedido = TriagemIa.montarPedidoTriagem({ tarefa: t, tri, contexto });
    log(`${rotulo(t)}: perguntando ao modelo (${ia.modeloDo('orquestrador')})…`, 'cmd');
    const resp = await ia.gerarJson({ papel: 'orquestrador', ...pedido });
    if (!resp.ok) {
      t.falhasAnalise = (Number(t.falhasAnalise) || 0) + 1;
      registrar(t, { tipo: 'erro', origem: 'modelo', codigo: resp.codigo, motivo: resp.erro });
      log(`${rotulo(t)}: o modelo não respondeu (${resp.codigo}: ${resp.erro}).`, 'error');
      if (['sem-chave', 'chave', 'teto', 'modelo'].includes(resp.codigo) || t.falhasAnalise >= MAX_FALHAS_ANALISE) {
        return abrirPendencia(t, { padrao: `modelo:${resp.codigo}`, pergunta: `O modelo não respondeu (${resp.erro}). Resolva nas Configurações e clique em "Reanalisar", ou diga o que fazer com "${t.assunto}".`, origem: 'modelo-falhou' });
      }
      ir(t, T.NA_FILA, 'modelo falhou; tento na próxima varredura');
      return 'erro';
    }
    const dec = TriagemIa.interpretarDecisao(resp.dados);
    // O que o modelo LEU no comentário fica na tarefa: a tela mostra, e a
    // pendência agrupa pelo tipo do pedido, não só pelo assunto (que costuma
    // ser genérico: "Ajuste Site MPI" serve para pedidos diferentes).
    t.leitura = dec.leitura || resumoComentario(t.descricao);
    t.categoria = dec.categoria || '';
    registrar(t, { tipo: 'decisao', origem: 'modelo', modelo: resp.modelo, decisao: dec.decisao, confianca: dec.confianca, motivo: dec.motivo, leitura: dec.leitura, categoria: dec.categoria, uso: resp.uso });
    const extras = { leitura: t.leitura, categoria: t.categoria };
    if (dec.decisao === 'avisar') {
      log(`${rotulo(t)}: precisa de você (modelo, confiança ${Math.round(dec.confianca * 100)}%): ${dec.leitura || dec.motivo}`, 'warn');
      return abrirPendencia(t, {
        tipo: 'humano',
        padrao: `humano:${TriagemIa.padraoDoAssunto(t.assunto)}:${t.categoria}`,
        pergunta: `Precisa de você: ${dec.leitura || t.assunto}. ${dec.motivo || 'O Hub não tem agente para isso.'} Marque como tratada quando fizer.`,
        origem: 'modelo', sugestaoStandby: dec.sugestaoStandby, ...extras,
      });
    }
    if (dec.decisao === 'ignorar') {
      ir(t, T.IGNORADA, `modelo: ${dec.motivo}`);
      log(`${rotulo(t)}: ignorada (modelo, confiança ${Math.round(dec.confianca * 100)}%): ${dec.motivo}`, 'info');
      return 'ignorada';
    }
    if (dec.decisao === 'plano' && dec.agente) {
      const parametros = { ...Catalogo.parametrosDaTriagem(tri, t), ...dec.parametros };
      return planejar(t, { agente: dec.agente, parametros, etapas: dec.etapas, origem: 'modelo', motivo: dec.motivo, confianca: dec.confianca, sugestaoStandby: dec.sugestaoStandby });
    }
    return abrirPendencia(t, {
      padrao: `${TriagemIa.padraoDoAssunto(t.assunto)}${t.categoria ? ':' + t.categoria : ''}`,
      pergunta: `${dec.pergunta || `Não sei o que fazer com "${t.assunto}": ${dec.motivo || 'sem motivo'}`}${dec.leitura ? ` (o comentário pede: ${dec.leitura})` : ''}`,
      origem: 'modelo', sugestaoStandby: dec.sugestaoStandby, ...extras,
    });
  }

  // Confere a forma do plano e muda o estado. Agente em standby não executa:
  // vira sugestão (pendência), como você pediu.
  function planejar(t, plano) {
    const v = Regras.validarPlano(plano);
    if (!v.ok) {
      registrar(t, { tipo: 'plano-invalido', origem: plano.origem, erros: v.erros });
      return abrirPendencia(t, {
        padrao: `${plano.agente || '?'}:${TriagemIa.padraoDoAssunto(t.assunto)}`,
        pergunta: `O plano para "${t.assunto}" (${nomeAgente(plano.agente)}, via ${plano.origem}) não fechou: ${v.erros.join('; ')}. Como preencher?`,
        agente: plano.agente, origem: plano.origem,
      });
    }
    if (v.agente.modo === 'standby') {
      return abrirPendencia(t, {
        tipo: 'sugestao',
        padrao: `standby:${v.agente.id}:${TriagemIa.padraoDoAssunto(t.assunto)}`,
        pergunta: `"${t.assunto}" parece trabalho do ${nomeAgente(v.agente.id)}, que fica em standby: acione pelo módulo ${v.agente.modulosNomes || (v.agente.modulos || []).join(' / ')} quando quiser. Marque como tratada quando fizer.`,
        agente: v.agente.id, origem: plano.origem,
      });
    }
    t.plano = { agente: plano.agente, parametros: plano.parametros || {}, etapas: plano.etapas || [], origem: plano.origem, motivo: plano.motivo || '', confianca: plano.confianca, sugestaoStandby: plano.sugestaoStandby || '', criadoEm: agora(), validacao: null };
    t.agente = plano.agente;
    if (t.pendenciaId) soltarDaPendencia(t);
    ir(t, T.PLANEJADA, `plano via ${plano.origem}: ${nomeAgente(plano.agente)}`, { agente: plano.agente });
    log(`${rotulo(t)}: plano → ${nomeAgente(plano.agente)} (via ${plano.origem}${plano.confianca != null ? `, confiança ${Math.round(plano.confianca * 100)}%` : ''}).`, 'info');
    if (plano.sugestaoStandby && Catalogo.agentePorId(plano.sugestaoStandby)) log(`${rotulo(t)}: o modelo sugere também o ${nomeAgente(plano.sugestaoStandby)} (standby; acione pelo módulo).`, 'info');
    emitir({ tipo: 'tarefa', id: t.id, estado: t.estado });
    return 'plano';
  }

  // Uma pendência para você. Tarefas com o mesmo padrão de assunto entram na
  // mesma pendência: uma pergunta por tipo, não por tarefa.
  function abrirPendencia(t, { tipo = 'pergunta', padrao = '', pergunta = '', agente = null, origem = '', sugestaoStandby = '', leitura = '', categoria = '' } = {}) {
    let p = padrao ? loja.pendenciaAbertaPorPadrao(padrao) : null;
    let nova = false;
    if (p) {
      loja.anexarTarefaNaPendencia(p, t.id);
    } else {
      nova = true;
      p = loja.criarPendencia({ tipo, padrao, pergunta, agente, contexto: { origem, assuntoExemplo: t.assunto, sugestaoStandby, leitura, categoria }, tarefas: [t.id] });
      log(`Pendência ${p.id}: ${pergunta}`, 'warn');
    }
    t.pendenciaId = p.id;
    registrar(t, { tipo: 'pendencia', pendenciaId: p.id, origem, motivo: pergunta });
    ir(t, T.PENDENTE, `pendência ${p.id}`, { pendenciaId: p.id });
    emitir({ tipo: 'pendencia', id: p.id, nova });
    return 'pendencia';
  }

  function soltarDaPendencia(t) {
    const p = loja.pendencia(t.pendenciaId);
    if (p) {
      p.tarefas = p.tarefas.filter((id) => id !== t.id);
      if (!p.tarefas.length && p.status === 'aberta') p.status = 'fechada';
    }
    t.pendenciaId = null;
  }

  // ---------- o que está planejado ----------
  // Devolve 'executaria' | 'executada' | 'aguardando' | 'barrada' | 'erro' | 'parada'.
  async function tratarPlanejada(t) {
    const a = Catalogo.agentePorId(t.plano && t.plano.agente);
    if (!a) return 'erro';
    const l = loja.ligado;
    // Validação de execução: a seco em observação (uma vez por plano), de
    // verdade antes de executar.
    if (!t.plano.validacao || !l.observacao) {
      const v = await Regras.validarExecucao(a.id, { ...t.plano.parametros, tarefaId: t.id }, ctxExecucao());
      t.plano.validacao = { quando: agora(), ok: v.ok, resultados: v.resultados };
      registrar(t, { tipo: 'validacao', ok: v.ok, resultados: v.resultados.map((r) => `${r.ok ? 'ok' : 'FALHOU'} ${r.nome}${r.motivo ? ': ' + r.motivo : ''}`) });
      const falhas = v.resultados.filter((r) => !r.ok);
      if (l.observacao) {
        log(`${rotulo(t)}: em observação — ${nomeAgente(a.id)} executaria${falhas.length ? `, mas ${falhas.length} regra(s) barraria(m): ${falhas.map((r) => r.nome + (r.motivo ? ' (' + r.motivo + ')' : '')).join('; ')}` : ' (todas as regras passaram)'}.`, falhas.length ? 'warn' : 'info');
        emitir({ tipo: 'tarefa', id: t.id, estado: t.estado });
        return 'executaria';
      }
      if (!v.ok && falhas.length === 1 && falhas[0].id === 'nao-em-espera') {
        // O domínio já está na lista de espera: o site foi publicado e só
        // espera o DNS (do cliente, do Registro.br). Não é pendência, é
        // "aguardando externo", como se o agente tivesse respondido isso
        // (ADR-162). O vigia da lista termina e fecha a tarefa.
        ir(t, T.AGUARDANDO_EXTERNO, falhas[0].motivo || 'o domínio está na lista de espera');
        log(`${rotulo(t)}: já está na lista de espera (${falhas[0].motivo || ''}); fica aguardando o DNS, sem pendência.`, 'info');
        emitir({ tipo: 'tarefa', id: t.id, estado: t.estado });
        return 'aguardando';
      }
      if (!v.ok) {
        registrar(t, { tipo: 'barrada', motivo: falhas.map((r) => `${r.nome}: ${r.motivo}`).join('; ') });
        return abrirPendencia(t, {
          padrao: `barrada:${a.id}:${t.id}`,
          pergunta: `${nomeAgente(a.id)} não pode agir em "${t.assunto}": ${falhas.map((r) => `${r.nome} (${r.motivo})`).join('; ')}. Resolva e clique em "Reanalisar", ou diga o que fazer.`,
          agente: a.id, origem: 'validacao',
        }) && 'barrada';
      }
    }
    if (l.observacao) return 'executaria';
    if (!l.geral) {
      if (t.estado !== T.AGUARDANDO_CONFIRMACAO) ir(t, T.AGUARDANDO_CONFIRMACAO, 'modo manual: espera o seu "executar"');
      return 'aguardando';
    }
    if (!agenteLigado(a.id)) { log(`${rotulo(t)}: ${nomeAgente(a.id)} está desligado; a tarefa espera.`, 'info'); return 'parada'; }
    if (typeof deps.executar !== 'function') {
      if (!t.plano.aguardaExecutor) { t.plano.aguardaExecutor = true; log(`${rotulo(t)}: ${nomeAgente(a.id)} ainda não executa nesta versão (fase 2); o plano fica guardado.`, 'warn'); }
      return 'aguardando';
    }
    return executarPlano(t, a);
  }

  // Fase 2: chama o executor do agente e trata o desfecho. Já fica aqui para
  // o teste provar os estados; o processo principal só liga deps.executar
  // quando os agentes existirem.
  async function executarPlano(t, a) {
    ir(t, T.EXECUTANDO, `executando pelo ${nomeAgente(a.id)}`, { agente: a.id });
    emitir({ tipo: 'tarefa', id: t.id, estado: t.estado });
    loja.salvar();
    let r;
    try { r = await deps.executar({ agente: a.id, parametros: t.plano.parametros, tarefa: t }); } catch (e) { r = { ok: false, motivo: e && e.message ? e.message : String(e) }; }
    r = r || { ok: false, motivo: 'o agente não devolveu nada' };
    registrar(t, { tipo: 'execucao', agente: a.id, ok: !!r.ok, motivo: r.mensagem || r.motivo || '', detalhe: r.detalhe });
    if (r.ok) { ir(t, T.CONCLUIDA, r.mensagem || 'concluída'); log(`${rotulo(t)}: ${r.mensagem || 'concluída'}.`, 'success'); return 'executada'; }
    if (r.aguardando) { ir(t, T.AGUARDANDO_EXTERNO, r.motivo || 'aguardando o DNS'); log(`${rotulo(t)}: aguardando — ${r.motivo || ''}.`, 'info'); return 'aguardando'; }
    if (r.pulou) {
      // O agente não chegou a agir (o Hub estava ocupado com outra publicação,
      // o freio estava puxado…): não é falha, volta para a fila sem contar.
      ir(t, T.PLANEJADA, `adiada: ${r.motivo || 'o agente não pôde agir agora'}`);
      log(`${rotulo(t)}: adiada — ${r.motivo || ''}; tento na próxima varredura.`, 'info');
      return 'adiada';
    }
    t.tentativas = (Number(t.tentativas) || 0) + 1;
    if (r.desistir || t.tentativas >= Automacao.MAX_TENTATIVAS) {
      ir(t, T.ESCALADA, r.motivo || 'falhou');
      // Falha não é assunto de regra (ADR-161): é pendência "para você", com
      // "Tentar de novo" (zera as tentativas e replaneja) e "Marcar como tratada".
      abrirPendencia(t, { tipo: 'humano', padrao: `escalada:${t.id}`, pergunta: `${nomeAgente(a.id)} ${r.desistir ? 'desistiu' : `falhou ${t.tentativas} vezes`} em "${t.assunto}": ${r.motivo || 'sem motivo'}. Resolva a causa e use "Tentar de novo", ou faça à mão e marque como tratada.`, agente: a.id, origem: 'execucao', leitura: t.leitura || '' });
      return 'erro';
    }
    // Fica em "falhou": a próxima varredura valida e tenta de novo, até o teto.
    ir(t, T.FALHOU, r.motivo || 'falhou');
    log(`${rotulo(t)}: ERRO — ${r.motivo || 'sem detalhe'} (tentativa ${t.tentativas} de ${Automacao.MAX_TENTATIVAS}; tento de novo na próxima varredura).`, 'error');
    return 'erro';
  }

  // ---------- pendências ----------
  // resposta: { acao: 'ignorar-estas' | 'tratada' | 'retomar' | 'descartar' |
  //             'tentar-de-novo' }  (encaminhar é `encaminhar()`, abaixo)
  async function responder(pendenciaId, resposta = {}) {
    const p = loja.pendencia(pendenciaId);
    if (!p) return { ok: false, erro: 'pendência não encontrada' };
    if (p.status === 'fechada') return { ok: false, erro: 'pendência já fechada' };
    const acao = String(resposta.acao || '');
    if (!['ignorar-estas', 'tratada', 'retomar', 'descartar', 'tentar-de-novo'].includes(acao)) return { ok: false, erro: `resposta desconhecida "${acao}" (as regras aprendidas saíram na ADR-161; para ensinar o Asgard, a regra vai para a ADR)` };
    p.resposta = { acao, quando: agora() };
    p.respondidaEm = agora();
    const tarefas = p.tarefas.map((id) => loja.tarefa(id)).filter(Boolean);
    log(`Pendência ${p.id}: resposta "${acao}".`, 'info');

    if (acao === 'ignorar-estas' || acao === 'tratada' || acao === 'descartar') {
      for (const t of tarefas) { t.pendenciaId = null; if (t.estado !== T.CONCLUIDA) ir(t, acao === 'tratada' ? T.CONCLUIDA : T.IGNORADA, acao === 'tratada' ? 'tratada por você' : `pendência ${p.id}: ${acao}`); }
      p.status = 'fechada';
      loja.salvar(); emitir({ tipo: 'pendencia', id: p.id });
      return { ok: true, pendencia: p };
    }
    if (acao === 'retomar') {
      for (const t of tarefas) { t.pendenciaId = null; if ([T.INTERROMPIDA, T.PENDENTE].includes(t.estado)) ir(t, T.EM_ANALISE, 'retomar: replanejando'); }
      p.status = 'fechada';
      loja.salvar(); emitir({ tipo: 'pendencia', id: p.id });
      return { ok: true, pendencia: p };
    }
    // Tentar de novo (ADR-161): a causa foi resolvida; as tentativas zeram e
    // a tarefa volta à análise (mesmo plano, validação de novo, execução).
    p.status = 'fechada';
    for (const t of tarefas) {
      t.pendenciaId = null; t.tentativas = 0; t.falhasAnalise = 0;
      if ([T.PENDENTE, T.ESCALADA, T.FALHOU, T.IGNORADA, T.INTERROMPIDA].includes(t.estado)) { ir(t, T.EM_ANALISE, 'tentar de novo, a seu pedido'); await analisar(t); }
    }
    loja.salvar(); emitir({ tipo: 'pendencia', id: p.id });
    return { ok: true, pendencia: p };
  }
  // Encaminhar as tarefas da pendência para um agente (com os parâmetros do
  // preset, se houver). Só estas: tarefa nova do mesmo tipo volta a perguntar,
  // até a regra entrar na triagem pela ADR.
  async function encaminhar(pendenciaId, { agente, parametros = {} } = {}) {
    const p = loja.pendencia(pendenciaId);
    if (!p) return { ok: false, erro: 'pendência não encontrada' };
    if (!Catalogo.agentePorId(agente)) return { ok: false, erro: `agente desconhecido "${agente}"` };
    p.status = 'fechada';
    for (const id of [...p.tarefas]) {
      const t = loja.tarefa(id);
      if (!t) continue;
      t.pendenciaId = null;
      if (![T.PENDENTE, T.ESCALADA, T.IGNORADA].includes(t.estado)) continue;
      t.tentativas = 0;
      ir(t, T.EM_ANALISE, `encaminhada por você para ${nomeAgente(agente)}`);
      const tri = triar(t);
      registrar(t, { tipo: 'decisao', origem: 'operador', motivo: `você escolheu ${nomeAgente(agente)}` });
      planejar(t, { agente, parametros: { ...Catalogo.parametrosDaTriagem(tri, t), ...parametros }, etapas: [], origem: 'operador', motivo: 'escolha sua' });
    }
    loja.salvar(); emitir({ tipo: 'pendencia', id: p.id });
    return { ok: true };
  }

  function descartarPendencia(pendenciaId) { return responder(pendenciaId, { acao: 'descartar' }); }

  async function reanalisar(tarefaId) {
    const t = loja.tarefa(tarefaId);
    if (!t) return { ok: false, erro: 'tarefa não encontrada' };
    if (t.estado === T.EXECUTANDO) return { ok: false, erro: 'a tarefa está executando' };
    // Primeiro confere se dá para voltar à análise; só depois mexe na tarefa.
    // Antes (ADR-160) o plano era limpo e a transição recusada deixava a tarefa
    // parada no estado antigo, com o log acusando transição inválida.
    if (t.estado !== T.EM_ANALISE && !Estados.podeIr(t.estado, T.EM_ANALISE)) return { ok: false, erro: `a tarefa está "${Estados.ROTULOS[t.estado] || t.estado}" e não volta para análise` };
    if (t.pendenciaId) soltarDaPendencia(t);
    t.plano = null; t.agente = null; t.falhasAnalise = 0; t.tentativas = 0;
    if (t.estado !== T.EM_ANALISE) ir(t, T.EM_ANALISE, 'reanálise pedida por você');
    const r = await analisar(t);
    loja.salvar(); emitir({ tipo: 'tarefa', id: t.id, estado: t.estado });
    return { ok: true, resultado: r, estado: t.estado };
  }

  // Modo manual: você aprovou o plano de uma tarefa (fase 2 executa).
  async function confirmar(tarefaId) {
    const t = loja.tarefa(tarefaId);
    if (!t) return { ok: false, erro: 'tarefa não encontrada' };
    if (![T.AGUARDANDO_CONFIRMACAO, T.PLANEJADA, T.FALHOU].includes(t.estado)) return { ok: false, erro: `a tarefa está "${Estados.ROTULOS[t.estado] || t.estado}"` };
    const a = Catalogo.agentePorId(t.plano && t.plano.agente);
    if (!a) return { ok: false, erro: 'sem plano' };
    const v = await Regras.validarExecucao(a.id, { ...t.plano.parametros, tarefaId: t.id }, ctxExecucao());
    t.plano.validacao = { quando: agora(), ok: v.ok, resultados: v.resultados };
    registrar(t, { tipo: 'validacao', ok: v.ok, resultados: v.resultados.map((r) => `${r.ok ? 'ok' : 'FALHOU'} ${r.nome}${r.motivo ? ': ' + r.motivo : ''}`), confirmadaPor: 'você' });
    if (!v.ok) { loja.salvar(); return { ok: false, erro: v.resultados.filter((r) => !r.ok).map((r) => `${r.nome}: ${r.motivo}`).join('; '), resultados: v.resultados }; }
    if (typeof deps.executar !== 'function') { loja.salvar(); return { ok: false, erro: 'execução ainda não disponível nesta versão (fase 2)' }; }
    const r = await executarPlano(t, a);
    loja.salvar();
    return { ok: r === 'executada' || r === 'aguardando', resultado: r, estado: t.estado };
  }

  // Ao abrir o Hub: tarefas interrompidas viram pendência "retomar?".
  function tratarInterrompidas(ids = []) {
    for (const id of ids) {
      const t = loja.tarefa(id);
      if (!t || t.estado !== T.INTERROMPIDA) continue;
      abrirPendenciaInterrompida(t);
    }
    if (ids.length) loja.salvar();
  }
  function abrirPendenciaInterrompida(t) {
    const p = loja.criarPendencia({ tipo: 'retomar', padrao: `retomar:${t.id}`, pergunta: `O Hub fechou enquanto ${nomeAgente(t.agente)} executava "${t.assunto}". Retomar (replaneja e valida de novo) ou descartar?`, agente: t.agente, contexto: { origem: 'interrompida', assuntoExemplo: t.assunto }, tarefas: [t.id] });
    t.pendenciaId = p.id;
    registrar(t, { tipo: 'pendencia', pendenciaId: p.id, origem: 'interrompida', motivo: p.pergunta });
    log(`Pendência ${p.id}: ${p.pergunta}`, 'warn');
  }

  // ---------- o que a tela mostra ----------
  function estadoAgente(a) {
    // Um módulo rodando pela mão (Conferir Vínculos, Planilha do Relatório…)
    // é o agente trabalhando, mesmo em standby (ADR-152).
    const manual = typeof deps.atividadeManual === 'function' ? deps.atividadeManual(a.id) : null;
    if (manual) return 'trabalhando';
    if (a.modo === 'standby') return 'standby';
    if (!agenteLigado(a.id)) return 'desligado';
    const tarefas = loja.tarefas().filter((t) => t.agente === a.id);
    if (tarefas.some((t) => t.estado === T.EXECUTANDO)) return 'trabalhando';
    if (tarefas.some((t) => [T.PENDENTE, T.AGUARDANDO_CONFIRMACAO, T.ESCALADA, T.INTERROMPIDA].includes(t.estado)) || loja.pendenciasAbertas().some((p) => p.agente === a.id)) return 'aguardando';
    if (tarefas.some((t) => [T.FALHOU].includes(t.estado))) return 'erro';
    return 'ocioso';
  }

  function snapshot() {
    const tarefas = loja.tarefas().map((t) => ({
      id: t.id, assunto: t.assunto, link: t.link, fila: t.fila, empresaFila: t.empresaFila, dono: t.dono, prioridade: t.prioridade, prazo: t.prazo,
      estado: t.estado, rotulo: Estados.ROTULOS[t.estado] || t.estado, tom: Estados.TOM[t.estado] || 'neutral', estadoDesde: t.estadoDesde,
      agente: t.agente, agenteNome: t.agente ? nomeAgente(t.agente) : '', pendenciaId: t.pendenciaId, tentativas: t.tentativas || 0,
      leitura: t.leitura || '', categoria: t.categoria || '',
      triagem: t.triagem || null,
      plano: t.plano ? { agente: t.plano.agente, origem: t.plano.origem, motivo: t.plano.motivo, confianca: t.plano.confianca, parametros: t.plano.parametros, etapas: t.plano.etapas, validacao: t.plano.validacao } : null,
      ultimo: Array.isArray(t.historico) && t.historico.length ? t.historico[t.historico.length - 1] : null,
    }));
    tarefas.sort((a, b) => String(b.estadoDesde || '').localeCompare(String(a.estadoDesde || '')));
    return {
      ligado: { ...loja.ligado, agentes: { ...loja.ligado.agentes } },
      rodando,
      modelo: ia ? { configurado: !!ia.configurada, temChave: !!ia.temChave, ligado: !!ia.ligada, orquestrador: ia.modeloDo('orquestrador'), agentes: ia.modeloDo('agentes') } : { configurado: false, temChave: false, ligado: false },
      contadores: loja.contadores(),
      resumo: Resumo.resumir(loja.tarefas(), loja.pendencias()),
      ultimaVarredura: loja.estado.ultimaVarredura,
      orquestrador: Catalogo.ORQUESTRADOR,
      agentes: Catalogo.AGENTES.map((a) => {
        const manual = typeof deps.atividadeManual === 'function' ? deps.atividadeManual(a.id) : null;
        return { id: a.id, nome: a.nome, papel: a.papel, modulosNomes: a.modulosNomes, funcao: a.funcao, modo: a.modo, modulos: a.modulos, presets: a.presets || [], sala: Catalogo.salaDe(a.id), ligado: agenteLigado(a.id), estado: estadoAgente(a), atividade: manual ? String(manual.detalhe || '') : '', tarefas: tarefas.filter((t) => t.agente === a.id && Estados.ABERTOS.includes(t.estado)).length };
      }),
      salas: Catalogo.SALAS,
      tarefas,
      pendencias: loja.pendencias().filter((p) => p.status !== 'fechada').concat(loja.pendencias().filter((p) => p.status === 'fechada').slice(0, 20)),
    };
  }

  function historico(tarefaId) {
    const t = loja.tarefa(tarefaId);
    return t ? { ok: true, tarefa: t } : { ok: false, erro: 'tarefa não encontrada' };
  }

  return { varrer, analisar, ligar, responder, encaminhar, descartarPendencia, reanalisar, confirmar, tratarInterrompidas, snapshot, historico, trocarIa, get rodando() { return rodando; } };
}

module.exports = { criarOrquestrador, MAX_FALHAS_ANALISE };
