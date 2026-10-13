// O orquestrador do Escritório (ADR-149): lê a fila do Salesforce, decide o
// que cada tarefa precisa (triagem em código → regra aprendida → modelo),
// valida em código, e manda para o agente ou abre uma pendência para você.
//
// Puro e injetável, como lib/automacao.js: recebe a loja, o adaptador do
// modelo (opcional), a leitura da fila, o log e o executor (fase 2). O
// processo principal é quem o instancia, liga o relógio de 5 min e expõe os
// canais IPC; os testes passam tudo falso.
//
// A ordem de decisão por tarefa, sempre:
//   1. regra aprendida (base de conhecimento) — o que você já decidiu manda;
//   2. triagem determinística (lib/triagem.js) — publicação MPI+, Busca One,
//      bloqueio: sem chamada ao modelo;
//   3. modelo (Gemini) — só para o que sobrou, e ele pode responder "pergunta";
//   4. sem modelo configurado — pendência.
// Depois do plano, a VALIDAÇÃO DE EXECUÇÃO (regras do catálogo) decide se o
// agente pode agir; em modo observação ela roda a seco e só anota.
const Estados = require('./estados');
const Catalogo = require('./catalogo');
const Regras = require('./regras');
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

  const ctxExecucao = () => ({ ...(deps.ctxExecucao || {}), tarefasComDominio: (d) => loja.tarefasComDominio(d) });
  const nomeAgente = (id) => (Catalogo.agentePorId(id) || { nome: id }).nome;
  const rotulo = (t) => (t.plano && t.plano.parametros && t.plano.parametros.dominio) || t.assunto || t.id;

  function trocarIa(nova) { ia = nova || null; }

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
        else if (r === 'erro') resumo.erros++;
      }
      loja.podar();
      loja.marcarVarredura({ ok: true, ...resumo, manual });
      loja.salvar();
      const partes = [`${resumo.lidas} aberta(s) na fila`, `${resumo.novas} nova(s)`, `${resumo.planejadas} planejada(s)`, `${resumo.pendencias} pendência(s)`, `${resumo.ignoradas} ignorada(s)`];
      if (resumo.executariam) partes.push(`${resumo.executariam} executaria(m) (observação)`);
      if (resumo.executadas) partes.push(`${resumo.executadas} executada(s)`);
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
    const fato = Regras.fatoDaTarefa(t, tri);
    t.triagem = { tipo: tri.tipo, plataforma: tri.plataforma || '', dominio: tri.dominio || '', temporario: tri.temporario || '', elegivel: !!tri.elegivel, motivo: tri.motivo || '' };

    // 1. regra aprendida
    const regra = Regras.casarRegra(loja.listarRegras(), fato);
    if (regra) {
      regra.usos = (Number(regra.usos) || 0) + 1;
      loja.salvarRegras();
      registrar(t, { tipo: 'decisao', origem: 'regra', regraId: regra.id, motivo: regra.descricao || Regras.descreverRegra(regra) });
      if (regra.entao.acao === 'ignorar') {
        ir(t, T.IGNORADA, `regra ${regra.id}: ${regra.descricao}`);
        log(`${rotulo(t)}: ignorada pela regra "${regra.descricao}".`, 'info');
        return 'ignorada';
      }
      const parametros = { ...Catalogo.parametrosDaTriagem(tri, t), ...(regra.entao.parametros || {}) };
      return planejar(t, { agente: regra.entao.agente, parametros, etapas: (regra.entao.etapas || []).map((a) => ({ agente: a, acao: '' })), origem: 'regra', regraId: regra.id, motivo: regra.descricao });
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

    // 3. modelo
    if (!ia || !ia.configurada) {
      return abrirPendencia(t, {
        padrao: TriagemIa.padraoDoAssunto(t.assunto),
        pergunta: `Não reconheci "${t.assunto}" e o modelo não está configurado (Configurações › IA & Escritório). O que fazer com tarefas assim?`,
        origem: 'sem-modelo',
      });
    }
    let contexto = null;
    if (typeof deps.contexto === 'function' && t.link) {
      try { contexto = await deps.contexto(t); } catch (e) { contexto = null; }
    }
    const pedido = TriagemIa.montarPedidoTriagem({ tarefa: t, tri, contexto, regras: loja.listarRegras() });
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
    registrar(t, { tipo: 'decisao', origem: 'modelo', modelo: resp.modelo, decisao: dec.decisao, confianca: dec.confianca, motivo: dec.motivo, uso: resp.uso });
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
      padrao: TriagemIa.padraoDoAssunto(t.assunto),
      pergunta: dec.pergunta || `Não sei o que fazer com "${t.assunto}": ${dec.motivo || 'sem motivo'}`,
      origem: 'modelo', sugestaoStandby: dec.sugestaoStandby,
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
        pergunta: `"${t.assunto}" parece trabalho do ${v.agente.nome}, que fica em standby: acione pelo módulo ${(v.agente.modulos || []).join(' / ')} quando quiser. Marque como tratada quando fizer.`,
        agente: v.agente.id, origem: plano.origem,
      });
    }
    t.plano = { agente: plano.agente, parametros: plano.parametros || {}, etapas: plano.etapas || [], origem: plano.origem, regraId: plano.regraId || null, motivo: plano.motivo || '', confianca: plano.confianca, sugestaoStandby: plano.sugestaoStandby || '', criadoEm: agora(), validacao: null };
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
  function abrirPendencia(t, { tipo = 'pergunta', padrao = '', pergunta = '', agente = null, origem = '', sugestaoStandby = '' } = {}) {
    let p = padrao ? loja.pendenciaAbertaPorPadrao(padrao) : null;
    if (p) {
      loja.anexarTarefaNaPendencia(p, t.id);
    } else {
      p = loja.criarPendencia({ tipo, padrao, pergunta, agente, contexto: { origem, assuntoExemplo: t.assunto, sugestaoStandby }, tarefas: [t.id] });
      log(`Pendência ${p.id}: ${pergunta}`, 'warn');
    }
    t.pendenciaId = p.id;
    registrar(t, { tipo: 'pendencia', pendenciaId: p.id, origem, motivo: pergunta });
    ir(t, T.PENDENTE, `pendência ${p.id}`, { pendenciaId: p.id });
    emitir({ tipo: 'pendencia', id: p.id });
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
    t.tentativas = (Number(t.tentativas) || 0) + 1;
    if (r.desistir || t.tentativas >= Automacao.MAX_TENTATIVAS) {
      ir(t, T.ESCALADA, r.motivo || 'falhou');
      abrirPendencia(t, { tipo: 'pergunta', padrao: `escalada:${t.id}`, pergunta: `${nomeAgente(a.id)} ${r.desistir ? 'desistiu' : `falhou ${t.tentativas} vezes`} em "${t.assunto}": ${r.motivo || 'sem motivo'}. O que faço?`, agente: a.id, origem: 'execucao' });
      return 'erro';
    }
    // Fica em "falhou": a próxima varredura valida e tenta de novo, até o teto.
    ir(t, T.FALHOU, r.motivo || 'falhou');
    log(`${rotulo(t)}: ERRO — ${r.motivo || 'sem detalhe'} (tentativa ${t.tentativas} de ${Automacao.MAX_TENTATIVAS}; tento de novo na próxima varredura).`, 'error');
    return 'erro';
  }

  // ---------- pendências ----------
  // resposta: { texto, acao: 'texto' | 'ignorar-estas' | 'ignorar-sempre' |
  //             'encaminhar' | 'tratada' | 'retomar' | 'descartar', agente }
  async function responder(pendenciaId, resposta = {}) {
    const p = loja.pendencia(pendenciaId);
    if (!p) return { ok: false, erro: 'pendência não encontrada' };
    if (p.status === 'fechada') return { ok: false, erro: 'pendência já fechada' };
    const acao = String(resposta.acao || 'texto');
    p.resposta = { texto: String(resposta.texto || ''), acao, agente: resposta.agente || '', quando: agora() };
    p.respondidaEm = agora();
    const tarefas = p.tarefas.map((id) => loja.tarefa(id)).filter(Boolean);
    const origem = `pendência ${p.id}, respondida em ${new Date(agora()).toLocaleDateString('pt-BR')}`;
    log(`Pendência ${p.id}: resposta "${acao}"${resposta.texto ? ' — ' + resposta.texto : ''}.`, 'info');

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
    if (acao === 'ignorar-sempre' || acao === 'encaminhar') {
      const bruta = TriagemIa.regraRapida({ assuntoExemplo: p.contexto && p.contexto.assuntoExemplo, acao: acao === 'ignorar-sempre' ? 'ignorar' : 'encaminhar', agente: resposta.agente || '', parametros: resposta.parametros || {}, origem });
      const v = Regras.validarRegra(bruta);
      p.proposta = { regra: v.regra, erros: v.erros, justificativa: 'regra montada pelo prefixo do assunto (sem modelo)' };
      p.status = 'respondida';
      loja.salvar(); emitir({ tipo: 'pendencia', id: p.id });
      return { ok: true, pendencia: p };
    }
    // Texto livre: o modelo propõe a regra; sem modelo, você monta na tela.
    if (ia && ia.configurada) {
      const pedido = TriagemIa.montarPedidoRegra({ pendencia: p, resposta: resposta.texto, tarefas });
      const r = await ia.gerarJson({ papel: 'orquestrador', ...pedido });
      if (r.ok) {
        const bruta = TriagemIa.interpretarRegra(r.dados, { origem });
        const v = Regras.validarRegra(bruta);
        p.proposta = { regra: v.regra, erros: v.erros, justificativa: bruta.justificativa, modelo: r.modelo };
        log(`Pendência ${p.id}: o modelo propôs "${v.regra.descricao}"${v.erros.length ? ' (com problemas: ' + v.erros.join('; ') + ')' : ''}. Aprove ou edite na tela.`, 'info');
      } else {
        p.proposta = { regra: null, erros: [`o modelo não respondeu (${r.codigo}: ${r.erro})`], justificativa: '' };
        log(`Pendência ${p.id}: o modelo não propôs regra (${r.erro}). Monte à mão na tela.`, 'warn');
      }
    } else {
      p.proposta = { regra: null, erros: ['sem modelo configurado: monte a regra à mão'], justificativa: '' };
    }
    p.status = 'respondida';
    loja.salvar(); emitir({ tipo: 'pendencia', id: p.id });
    return { ok: true, pendencia: p };
  }

  // Aprova (gravando) a regra proposta — editada ou não — e reanalisa as
  // tarefas da pendência na hora.
  async function aprovarRegra(pendenciaId, regraBruta) {
    const p = loja.pendencia(pendenciaId);
    if (!p) return { ok: false, erro: 'pendência não encontrada' };
    const v = Regras.validarRegra(regraBruta || (p.proposta && p.proposta.regra));
    if (!v.ok) return { ok: false, erro: v.erros.join('; '), erros: v.erros };
    if (!v.regra.origem) v.regra.origem = `pendência ${p.id}`;
    const salva = loja.salvarRegra(v.regra);
    p.status = 'fechada';
    p.regraId = salva.id;
    log(`Regra ${salva.id} gravada: ${salva.descricao}`, 'success');
    const ids = [...p.tarefas];
    for (const id of ids) {
      const t = loja.tarefa(id);
      if (!t) continue;
      t.pendenciaId = null;
      if ([T.PENDENTE, T.IGNORADA, T.ESCALADA].includes(t.estado)) { ir(t, T.EM_ANALISE, `regra ${salva.id} aprovada; reanalisando`); await analisar(t); }
    }
    loja.salvar(); emitir({ tipo: 'regras' });
    return { ok: true, regra: salva };
  }

  // Só desta vez: encaminha as tarefas da pendência sem gravar regra.
  async function aplicarSemRegra(pendenciaId, { agente, parametros = {} } = {}) {
    const p = loja.pendencia(pendenciaId);
    if (!p) return { ok: false, erro: 'pendência não encontrada' };
    if (!Catalogo.agentePorId(agente)) return { ok: false, erro: `agente desconhecido "${agente}"` };
    p.status = 'fechada';
    for (const id of [...p.tarefas]) {
      const t = loja.tarefa(id);
      if (!t) continue;
      t.pendenciaId = null;
      if (t.estado !== T.PENDENTE) continue;
      ir(t, T.EM_ANALISE, `encaminhada por você para ${nomeAgente(agente)}`);
      const tri = triar(t);
      registrar(t, { tipo: 'decisao', origem: 'operador', motivo: `você escolheu ${nomeAgente(agente)} só desta vez` });
      planejar(t, { agente, parametros: { ...Catalogo.parametrosDaTriagem(tri, t), ...parametros }, etapas: [], origem: 'operador', motivo: 'escolha sua, só desta vez' });
    }
    loja.salvar(); emitir({ tipo: 'pendencia', id: p.id });
    return { ok: true };
  }

  function descartarPendencia(pendenciaId) { return responder(pendenciaId, { acao: 'descartar' }); }

  // ---------- regras (edição pela tela) ----------
  function salvarRegra(regraBruta) {
    const v = Regras.validarRegra(regraBruta);
    if (!v.ok) return { ok: false, erro: v.erros.join('; '), erros: v.erros };
    const salva = loja.salvarRegra(v.regra);
    log(`Regra ${salva.id} ${regraBruta && regraBruta.id ? 'alterada' : 'criada'}: ${salva.descricao}`, 'info');
    emitir({ tipo: 'regras' });
    return { ok: true, regra: salva };
  }
  function apagarRegra(id) {
    const ok = loja.apagarRegra(id);
    if (ok) { log(`Regra ${id} apagada.`, 'info'); emitir({ tipo: 'regras' }); }
    return { ok };
  }

  async function reanalisar(tarefaId) {
    const t = loja.tarefa(tarefaId);
    if (!t) return { ok: false, erro: 'tarefa não encontrada' };
    if (t.estado === T.EXECUTANDO) return { ok: false, erro: 'a tarefa está executando' };
    if (t.pendenciaId) soltarDaPendencia(t);
    t.plano = null; t.agente = null; t.falhasAnalise = 0;
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
      triagem: t.triagem || null,
      plano: t.plano ? { agente: t.plano.agente, origem: t.plano.origem, motivo: t.plano.motivo, confianca: t.plano.confianca, parametros: t.plano.parametros, etapas: t.plano.etapas, validacao: t.plano.validacao, regraId: t.plano.regraId } : null,
      ultimo: Array.isArray(t.historico) && t.historico.length ? t.historico[t.historico.length - 1] : null,
    }));
    tarefas.sort((a, b) => String(b.estadoDesde || '').localeCompare(String(a.estadoDesde || '')));
    return {
      ligado: { ...loja.ligado, agentes: { ...loja.ligado.agentes } },
      rodando,
      modelo: ia ? { configurado: !!ia.configurada, orquestrador: ia.modeloDo('orquestrador'), agentes: ia.modeloDo('agentes') } : { configurado: false },
      contadores: loja.contadores(),
      ultimaVarredura: loja.estado.ultimaVarredura,
      agentes: Catalogo.AGENTES.map((a) => ({ id: a.id, nome: a.nome, funcao: a.funcao, modo: a.modo, modulos: a.modulos, sala: Catalogo.salaDe(a.id), ligado: agenteLigado(a.id), estado: estadoAgente(a), tarefas: tarefas.filter((t) => t.agente === a.id && Estados.ABERTOS.includes(t.estado)).length })),
      salas: Catalogo.SALAS,
      tarefas,
      pendencias: loja.pendencias().filter((p) => p.status !== 'fechada').concat(loja.pendencias().filter((p) => p.status === 'fechada').slice(0, 20)),
      regras: loja.listarRegras(),
    };
  }

  function historico(tarefaId) {
    const t = loja.tarefa(tarefaId);
    return t ? { ok: true, tarefa: t } : { ok: false, erro: 'tarefa não encontrada' };
  }

  return { varrer, analisar, ligar, responder, aprovarRegra, aplicarSemRegra, descartarPendencia, salvarRegra, apagarRegra, reanalisar, confirmar, tratarInterrompidas, snapshot, historico, trocarIa, get rodando() { return rodando; } };
}

module.exports = { criarOrquestrador, MAX_FALHAS_ANALISE };
