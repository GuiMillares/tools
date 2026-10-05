// Monitor da automação da fila (ADR-120) — cola do renderer.
//
// Carregado por <script> DEPOIS do app.js. Não mexe no corpo do app.js: injeta
// o próprio controle (um painel flutuante) e usa window.Triagem / window.Automacao
// / window.BuscaOne (módulos duais) + window.api.* (preload) + window.log
// (terminal do app, se existir). Começa SEMPRE desligado: um publicador/
// bloqueador autônomo não deve religar sozinho depois de reiniciar o app.
// Três interruptores: bloqueio de contatos, publicação MPI+ (ADR-122) e
// publicação Busca One (ADR-132).
(function () {
  'use strict';
  if (!window.Automacao || !window.Triagem) { console.warn('[automação] triagem/automacao não carregados'); return; }
  if (window.__automacaoIniciada) return;
  window.__automacaoIniciada = true;

  const INTERVALO_MS = 5 * 60 * 1000;
  const estado = {
    ligado: { bloqueio: false, publicacao: false, buscaone: false },
    rodando: false,
    parar: false,
    processados: new Set(),
    timer: null,
    ultima: null,
    emailVhost: null, // { to, cc } editados nesta sessão (espelho do state.mailVhost)
  };

  // Para quem vai o e-mail de vhost da Busca One (ADR-132): o que foi editado
  // no painel (gravado no hub-state como mailVhost); senão o mesmo destino e
  // cópia do e-mail de ativação de SSL (suporte da M3, cópia para o Everton),
  // como foi confirmado em 01/10/2026.
  const VHOST_PADRAO = { to: 'suporte@m3solutions.com.br', cc: 'everton.lima@buscacliente.com.br' };
  function emailVhostConfig() {
    if (estado.emailVhost) return estado.emailVhost;
    const st = typeof state !== 'undefined' && state ? state : null;
    if (st && st.mailVhost && typeof st.mailVhost === 'object') return { to: String(st.mailVhost.to || ''), cc: String(st.mailVhost.cc || '') };
    const ssl = (st && st.mailSsl) || (typeof MAIL_MODOS !== 'undefined' && MAIL_MODOS.ssl && MAIL_MODOS.ssl.defaults) || {};
    return { to: String(ssl.to || VHOST_PADRAO.to), cc: String(ssl.cc != null ? ssl.cc : VHOST_PADRAO.cc) };
  }
  function guardarEmailVhost(to, cc) {
    estado.emailVhost = { to: String(to || '').trim(), cc: String(cc || '').trim() };
    if (typeof state !== 'undefined' && state) {
      state.mailVhost = { ...estado.emailVhost };
      if (typeof saveHubState === 'function') { try { Promise.resolve(saveHubState()).catch(() => {}); } catch (e) {} }
    }
  }

  // Log: usa o terminal do Hub quando existir; senão, console + o mini-log do
  // painel.
  function log(msg, tipo) {
    try { if (typeof window.log === 'function') { window.log(msg, tipo); return; } } catch (e) {}
    const cor = tipo === 'error' ? 'color:#ff6b6b' : tipo === 'warn' ? 'color:#e9b84a' : tipo === 'success' ? 'color:#5EE970' : '';
    console.log('%c[automação] ' + msg, cor);
    miniLog(msg, tipo);
  }

  // ---------- Driver de publicação automática (ADR-122) ----------
  //
  // Reaproveita a máquina de etapas do "Publicar MPI+" do app.js (script
  // clássico: `pub`, `pubNovo`, `pubRodarEtapa`, `PUB_ETAPAS`… são globais),
  // rodando etapa por etapa em vez do pubRodarTudo, para que NADA pergunte no
  // terminal — em modo automático ninguém responde:
  //   - o link do painel é resolvido antes (acharContratoNoPainel) e, se não
  //     achar, desiste em vez de pedir o link;
  //   - a parada "confirmar e aplicar o DNS" vira: BACKUP do DNS atual do
  //     cliente (Música/backup dns/{domínio}.txt) e segue; sem backup, não aplica;
  //   - contato técnico que não é nosso (DNS do cliente / fora do .br): desiste
  //     e deixa para a mão (a etapa da planilha perguntaria a empresa);
  //   - falha de etapa: não pergunta "tentar/pular"; devolve o erro e o motor
  //     decide (tenta de novo até o teto, ou desiste).
  // Quem fecha a tarefa é a própria etapa "salesforce" (pub.sfTarefa = link).
  // Se o SSL ficar adiado (Registro.br demora), entra na lista de espera do app
  // (pubMandarParaEspera), cujo vigia termina SSL + tarefa depois.
  function textoBackupDns(p) {
    const foto = p.foto || {};
    const regs = Array.isArray(foto.registros) ? foto.registros : [];
    const linha = (r) => ['type', 'tipo'].map((k) => r[k]).find(Boolean) + '\t' + (['name', 'nome', 'host'].map((k) => r[k]).find(Boolean) || '@') + '\t' + (['content', 'conteudo', 'valor', 'value', 'data'].map((k) => r[k]).find(Boolean) || '') + (r.ttl !== undefined ? '\tTTL ' + r.ttl : '') + (r.priority !== undefined ? '\tprio ' + r.priority : '');
    return [
      `Domínio: ${p.dominio}`,
      `Nameservers atuais: ${(Array.isArray(foto.nameservers) ? foto.nameservers : []).join(', ') || '(não lidos)'}`,
      '',
      `Registros DNS atuais do cliente (${regs.length}):`,
      ...regs.map(linha),
      '',
      '--- Dados completos (JSON) ---',
      JSON.stringify({ foto: p.foto, existentesNaCloudflare: p.existentes, zonaProposta: p.zona, plano: p.plano }, null, 2),
    ].join('\n');
  }

  window.hubPublicarTarefaAuto = async function hubPublicarTarefaAuto(payload) {
    const p = payload || {};
    // const/let de topo do app.js (PUB_ETAPAS, pub, state…) não viram window.X,
    // mas são visíveis por identificador entre scripts clássicos: checa assim.
    const faltam = [];
    if (typeof pubNovo !== 'function') faltam.push('pubNovo');
    if (typeof pubRodarEtapa !== 'function') faltam.push('pubRodarEtapa');
    if (typeof PUB_ETAPAS === 'undefined') faltam.push('PUB_ETAPAS');
    if (typeof normalizeDomain !== 'function') faltam.push('normalizeDomain');
    if (typeof normalizarTemporario !== 'function') faltam.push('normalizarTemporario');
    if (faltam.length) return { ok: false, pulou: true, motivo: 'ferramenta Publicar MPI+ não carregada (' + faltam.join(', ') + ')' };
    if (typeof pub !== 'undefined' && pub && (pub.emAndamento || pub.rodando)) return { ok: false, pulou: true, motivo: 'já há uma publicação em andamento no Hub; tento na próxima varredura' };
    if (typeof bulkRodando !== 'undefined' && bulkRodando) return { ok: false, pulou: true, motivo: 'o Publicar em massa está rodando; tento na próxima varredura' };
    if (typeof state !== 'undefined' && !state.googleSaPath) return { ok: false, desistir: true, motivo: 'service account do Google não configurada (as tags precisam dela)' };
    const dom = normalizeDomain(p.dominio);
    if (!dom) return { ok: false, desistir: true, motivo: 'sem domínio final na tarefa' };
    // Já publicado e esperando a propagação (SSL + fechar a tarefa ficam com o
    // vigia): a tarefa ainda está aberta no Salesforce, mas NÃO é para publicar
    // de novo — a cada Ctrl+R a lista de processadas zera e isso re-rodava o
    // fluxo inteiro (ADR-124).
    if (typeof esperas !== 'undefined' && Array.isArray(esperas)) {
      const naEspera = esperas.find((e) => e && e.dominio === dom && (e.status === 'esperando' || e.status === 'rodando'));
      if (naEspera) return { ok: true, jaEstava: true, mensagem: `já publicado; esperando a propagação do Registro.br (previsão ${new Date(naEspera.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}) para SSL e fechar a tarefa` };
    }

    // 1) Razão social e empresa pelo caminho direto: a tarefa já está pendurada
    //    no caso, e o caso tem a conta (razão social) e o projeto (empresa).
    //    Não depende do domínio (que a triagem pode ler diferente do cadastro).
    let razao = '';
    let empresaFila = (p.empresa === 'bc' || p.empresa === 'mpisolutions') ? p.empresa : null;
    if (p.link) {
      const ctx = await window.api.salesforceContexto({ tarefa: p.link }).catch((e) => ({ ok: false, error: e.message }));
      if (ctx && ctx.log) ctx.log.forEach((l) => log(l.message, l.type));
      if (ctx && ctx.ok) {
        if (ctx.razao) razao = ctx.razao;
        if (ctx.empresa && !empresaFila) empresaFila = ctx.empresa; // projeto do caso, ou a fila
        if (ctx.empresa && ctx.via) log(`${dom}: empresa pelo ${ctx.via}.`, 'info');
      } else if (ctx && ctx.reauth) {
        return { ok: false, motivo: 'Salesforce pede reconexão (Configurações); tento de novo depois' };
      }
    }
    // Reserva: busca por domínio (só quando a tarefa não deu a conta).
    if (!razao) {
      const rz = await window.api.salesforceContaPorDominio({ dominio: dom }).catch((e) => ({ ok: false, error: e.message }));
      if (rz && rz.log) rz.log.forEach((l) => log(l.message, l.type));
      if (rz && rz.ok && rz.achou && rz.razao) razao = rz.razao;
      else return { ok: false, desistir: !(rz && rz.reauth), motivo: 'não achei a razão social: a tarefa não está ligada a um caso com conta, e o domínio não achou conta' + ((rz && (rz.error || rz.motivo)) ? ' (' + (rz.error || rz.motivo) + ')' : '') };
    }

    // 2) Estado da publicação, em modo automático. A empresa fica 'auto' para a
    // etapa do contato consultar as DUAS contas do Registro.br (um valor fixo
    // consultaria só uma); a empresa do caso/fila entra como reserva depois.
    pub = Object.assign(pubNovo(), { dominio: dom, temporario: p.temporario || '', razao, sfTarefa: p.link || '', empresa: 'auto', auto: true });
    const temp = normalizarTemporario(pub.temporario);

    // 3) Link do painel sem perguntar: acha pelo contrato (razão + temporário).
    const ach = await window.api.acharContratoNoPainel({ razao: pub.razao, temporario: temp, dominio: dom }).catch((e) => ({ ok: false, error: e.message }));
    if (ach && ach.log) ach.log.forEach((l) => log(l.message, l.type));
    if (!(ach && ach.ok && ach.url)) return { ok: false, desistir: true, motivo: 'não achei o contrato de ' + dom + ' no painel' + ((ach && ach.error) ? ': ' + ach.error : '') + '; publicar à mão' };
    pub.painelUrl = ach.url; pub.painelConferido = ach.url; pub.painelAchado = true;
    log(`Publicação automática de ${dom} (${pub.razao}): painel ${ach.url}. Começando as etapas.`, 'cmd');

    // 4) Etapas, uma a uma.
    pub.emAndamento = true;
    try {
      while (pub.etapa) {
        if (typeof paradaAgora !== 'undefined' && paradaAgora) return { ok: false, motivo: 'parado pelo freio do Hub' };
        const etapa = PUB_ETAPAS.find((e) => e.id === pub.etapa);
        if (!etapa) break;

        if (etapa.parada && pub.zona && !pub.confirmado) {
          // Parada do DNS → backup obrigatório e segue.
          const bk = await window.api.backupDns({ dominio: dom, conteudo: textoBackupDns(pub) }).catch((e) => ({ ok: false, error: e.message }));
          if (!(bk && bk.ok)) return { ok: false, desistir: true, motivo: 'não consegui gravar o backup do DNS (' + ((bk && bk.error) || '?') + '); não aplico o DNS sem backup' };
          log(`Backup do DNS atual de ${dom} salvo em ${bk.caminho}. Aplicando a zona na Cloudflare.`, 'success');
          pub.confirmado = true;
        }
        if (etapa.id === 'planilha' && typeof PLANILHA_ABA_POR_EMPRESA !== 'undefined' && !PLANILHA_ABA_POR_EMPRESA[pub.empresa]) {
          return { ok: false, desistir: true, motivo: 'site publicado, mas a empresa (Busca Cliente/MPI Solutions) não foi determinada — nem pelo contato técnico nem pela fila da tarefa: registre na planilha e feche a tarefa à mão' };
        }

        const antes = pub.etapa;
        await pubRodarEtapa(antes);

        if (pub.etapa !== antes) {
          if (antes === 'contato' && pub.empresa === 'auto' && empresaFila) {
            // O Registro.br não disse a empresa (fora do .br, DNS do cliente ou
            // consulta falhou): a fila da tarefa decide, e o fluxo segue 100%
            // (aprovar, publicar, tags, planilha, fechar). O DNS fica com o
            // cliente e o SSL sai depois do apontamento — igual ao manual.
            pub.empresa = empresaFila;
            const sel = document.getElementById('pubEmpresa'); if (sel) sel.value = empresaFila;
            log(`${dom}: empresa pela fila da tarefa → ${empresaFila === 'bc' ? 'Busca Cliente' : 'MPI Solutions'} (aba ${PLANILHA_ABA_POR_EMPRESA[empresaFila]} da planilha). Seguindo sem parar.`, 'info');
          }
          continue;
        }
        const f = pub.feitas[antes];
        // Etapa que precisa de uma escolha humana (dois servidores de produção
        // no painel, ADR-140): repetir não resolve, desiste de primeira.
        if (pub.semSaida) return { ok: false, desistir: true, motivo: `${etapa.nome}: ${pub.semSaida}` };
        if (!f || f.ok) return { ok: false, motivo: `parou em "${etapa.nome}"` };
        return { ok: false, motivo: `${etapa.nome} falhou: ${f.detalhe || 'sem detalhe'}` };
      }
      if (pub.sslAdiado) {
        if (typeof pubMandarParaEspera === 'function') pubMandarParaEspera();
        return { ok: true, mensagem: 'publicado; SSL e fechamento da tarefa ficam com o vigia da propagação' };
      }
      return { ok: true, mensagem: 'publicação concluída' + (pub.scPendente ? ' (Search Console e relatório pendentes do SSL)' : '') };
    } catch (e) {
      return { ok: false, motivo: e && e.message ? e.message : String(e) };
    } finally {
      pub.emAndamento = false;
      try { if (typeof renderPubEtapas === 'function') renderPubEtapas(); if (typeof renderPubDetalhe === 'function') renderPubDetalhe(); } catch (e) {}
    }
  };

  // ---------- Driver da publicação Busca One automática (ADR-132) ----------
  //
  // Busca Cliente / MPI Solutions: o site mora num repositório do Bitbucket e
  // é posto no ar por um humano. O que dá para fazer sozinho está em
  // lib/busca-one.js (puro, testado): propriedades no Google, geral.php
  // commitado, e-mail de vhost ao suporte, e a tarefa em "Em andamento"; o
  // resumo com as chaves sai no terminal, não no Salesforce (ADR-134) — ela
  // fica aberta. Aqui é só a cola: as funções
  // reais (window.api.*) e o que o app.js sabe (service account, credenciais
  // do Bitbucket, workspace da marca, $idProjetoBusca fixo da marca). Tudo
  // que pode faltar é conferido ANTES de qualquer efeito.
  window.hubPublicarBuscaOneAuto = async function hubPublicarBuscaOneAuto(payload) {
    const p = payload || {};
    if (!window.BuscaOne || typeof window.BuscaOne.publicarBuscaOne !== 'function') return { ok: false, pulou: true, motivo: 'lib/busca-one.js não carregada' };
    const faltam = [];
    if (typeof state === 'undefined') faltam.push('state');
    if (typeof workspaceForBrand !== 'function') faltam.push('workspaceForBrand');
    if (typeof normalizeDomain !== 'function') faltam.push('normalizeDomain');
    if (faltam.length) return { ok: false, pulou: true, motivo: 'app.js não carregado (' + faltam.join(', ') + ')' };
    if (typeof pub !== 'undefined' && pub && (pub.emAndamento || pub.rodando)) return { ok: false, pulou: true, motivo: 'já há uma publicação em andamento no Hub; tento na próxima varredura' };
    if (typeof bulkRodando !== 'undefined' && bulkRodando) return { ok: false, pulou: true, motivo: 'o Publicar em massa está rodando; tento na próxima varredura' };
    const dom = normalizeDomain(p.dominio);
    if (!dom) return { ok: false, desistir: true, motivo: 'sem domínio final na tarefa' };
    // Configuração que falta é erro comum (fica para a próxima varredura, até
    // o teto), não "desistir": arrumar nas Configurações resolve.
    if (!state.googleSaPath) return { ok: false, motivo: 'service account do Google não configurada (Configurações); as propriedades precisam dela' };
    if (!state.creds) return { ok: false, motivo: 'Bitbucket não configurado (e-mail e API token, Configurações); o geral.php é commitado lá' };
    if (!(state.ms && state.ms.connected)) return { ok: false, motivo: 'conta Microsoft não conectada (Configurações); o e-mail de vhost sai pela sua caixa' };
    const email = emailVhostConfig();
    if (!window.BuscaOne.listaEmails(email.to).length) return { ok: false, motivo: 'destinatário do e-mail de vhost em branco (painel da automação)' };

    // A empresa é a do TEMPORÁRIO (deploy.buscacliente = Busca Cliente,
    // producao.mpitemporario = MPI Solutions, ADR-133). Sem temporário
    // ("Apontado via registro."), vale o caso da tarefa (ADR-123) e depois a
    // fila. A razão social vem do caso de qualquer jeito.
    const nome = window.BuscaOne.nomeEmpresa;
    let empresa = null, razao = '', via = '', doCaso = null, viaCaso = '';
    if (p.link) {
      const ctx = await window.api.salesforceContexto({ tarefa: p.link }).catch((e) => ({ ok: false, error: e.message }));
      if (ctx && ctx.log) ctx.log.forEach((l) => log(l.message, l.type));
      if (ctx && ctx.ok) {
        razao = ctx.razao || '';
        if (ctx.empresa) { doCaso = ctx.empresa; viaCaso = ctx.via || 'caso da tarefa'; }
      } else if (ctx && ctx.reauth) {
        return { ok: false, motivo: 'Salesforce pede reconexão (Configurações); tento de novo depois' };
      }
    }
    if (p.empresaTemporario === 'bc' || p.empresaTemporario === 'mpisolutions') { empresa = p.empresaTemporario; via = 'temporário ' + (p.temporario || ''); }
    if (!empresa && doCaso) { empresa = doCaso; via = viaCaso; }
    if (!empresa && (p.empresa === 'bc' || p.empresa === 'mpisolutions')) { empresa = p.empresa; via = 'fila da tarefa'; }
    if (empresa) {
      log(`${dom}: empresa ${nome(empresa)} (pelo ${via})${razao ? '; razão social ' + razao : ''}${p.repositorio && p.repositorio !== dom ? '; repositório ' + p.repositorio : ''}.`, 'info');
      const outra = doCaso && doCaso !== empresa ? `o ${viaCaso} diz ${nome(doCaso)}` : (p.empresa && p.empresa !== empresa ? `a fila da tarefa diz ${nome(p.empresa)}` : '');
      if (outra) log(`${dom}: ${outra}, mas o ${via} é da ${nome(empresa)}; seguindo pelo ${via}.`, 'warn');
    }

    // As respostas do processo principal trazem o log de cada chamada: vai
    // tudo para o terminal, como nas ferramentas manuais.
    const encaminha = (r) => { if (r && Array.isArray(r.log)) r.log.forEach((l) => log(l.message, l.type)); return r; };
    const deps = {
      log,
      email,
      // O freio do painel (e o do Hub) param ENTRE as etapas desta tarefa:
      // nada de e-mail depois de alguém ter apertado "Parar".
      parar: () => !!estado.parar || (typeof paradaAgora !== 'undefined' && !!paradaAgora),
      idPainelFixo: (emp) => (typeof fixedPanelId === 'function' ? fixedPanelId(emp) : ''),
      criarPropriedades: (q) => window.api.createGoogleProject({ domain: q.domain, saPath: state.googleSaPath, brand: q.brand, steps: q.steps }).then(encaminha),
      commitGeral: (q) => window.api.commitGeralPhp({ repo: q.repo, brand: q.brand, workspace: workspaceForBrand(q.brand), values: q.values, creds: state.creds }).then(encaminha),
      enviarEmail: (q) => window.api.sendMailBatch(q).then(encaminha),
      moverTarefa: (q) => window.api.salesforceMoverTarefa(q).then(encaminha),
    };
    try {
      return await window.BuscaOne.publicarBuscaOne({ ...p, dominio: dom, empresa, razao }, deps);
    } catch (e) {
      return { ok: false, motivo: e && e.message ? e.message : String(e) };
    }
  };

  async function publicar(payload) {
    return window.hubPublicarTarefaAuto(payload);
  }

  const deps = {
    log,
    get ligado() { return estado.ligado; },
    resolverMarca: (p) => window.api.resolverMarca(p),
    bloquear: (p) => window.api.doutorBloquear(p),
    bloquearPainel: (p) => window.api.bloquearPainel(p),
    fecharTarefa: (p) => window.api.salesforceFecharTarefa(p),
    publicar,
    publicarBuscaOne: (p) => window.hubPublicarBuscaOneAuto(p),
  };

  async function rodarVarredura(manual) {
    if (estado.rodando) { if (manual) log('Automação: já está rodando uma varredura.', 'warn'); return; }
    if (!estado.ligado.bloqueio && !estado.ligado.publicacao && !estado.ligado.buscaone) { if (manual) log('Automação: nada ligado (ligue Bloqueio, Publicação MPI+ e/ou Publicação Busca One).', 'warn'); return; }
    // Leve em 2º plano (ADR-124): com uma publicação ou o Publicar em massa
    // rodando, a varredura só empilharia trabalho e consultas. Pula a rodada.
    const ocupado = (typeof pub !== 'undefined' && pub && (pub.emAndamento || pub.rodando)) || (typeof bulkRodando !== 'undefined' && bulkRodando);
    if (ocupado) { if (manual) log('Automação: o Hub está publicando agora; a varredura fica para a próxima rodada.', 'info'); return; }
    // Precisa do Salesforce conectado.
    try {
      const sf = await window.api.salesforceGetConfig();
      if (!(sf && sf.ok && sf.conectado)) { log('Automação: conecte o Salesforce antes (Configurações).', 'error'); return; }
    } catch (e) {}
    estado.rodando = true; estado.parar = false; atualizarPainel();
    log(`Automação: lendo a fila do Salesforce${manual ? ' (rodar agora)' : ''}…`, 'cmd');
    try {
      const dados = await window.api.salesforceTarefas();
      if (!(dados && dados.tarefas)) { log('Automação: não consegui ler a fila.', 'error'); return; }
      const res = await window.Automacao.varrerFila(dados, deps, { processados: estado.processados, parar: () => estado.parar });
      const feitas = res.filter((r) => r.ok).length;
      const puladas = res.filter((r) => r.pulou).length;
      const erros = res.filter((r) => !r.ok && !r.pulou).length;
      estado.ultima = { quando: new Date(), feitas, puladas, erros, total: res.length };
      log(`Automação: varredura concluída — ${feitas} feita(s), ${puladas} pulada(s), ${erros} erro(s).`, feitas || erros ? 'success' : 'info');
    } catch (e) {
      log('Automação: erro na varredura — ' + e.message, 'error');
    } finally {
      estado.rodando = false; atualizarPainel();
    }
  }

  // Com a automação ligada, a janela não desacelera em segundo plano: ela
  // trabalha sozinha, com o Hub atrás de outras janelas (ADR-126).
  function ligarTimer() {
    if (estado.timer) return;
    estado.timer = setInterval(() => { rodarVarredura(false); }, INTERVALO_MS);
    window.api.manterAcordado(true, 'automacao').catch(() => {});
  }
  function desligarTimer() {
    if (estado.timer) { clearInterval(estado.timer); estado.timer = null; }
    window.api.manterAcordado(false, 'automacao').catch(() => {});
  }
  function revisarTimer() {
    if (estado.ligado.bloqueio || estado.ligado.publicacao || estado.ligado.buscaone) ligarTimer(); else desligarTimer();
  }

  // ---------- Painel flutuante ----------
  let painel, miniLogEl;
  function miniLog(msg, tipo) {
    if (!miniLogEl) return;
    const linha = document.createElement('div');
    linha.textContent = msg;
    linha.style.cssText = 'padding:2px 0;border-bottom:1px solid rgba(94,233,112,.08);' + (tipo === 'error' ? 'color:#ff6b6b' : tipo === 'warn' ? 'color:#e9b84a' : tipo === 'success' ? 'color:#5EE970' : 'color:#9fb9ad');
    miniLogEl.appendChild(linha);
    miniLogEl.scrollTop = miniLogEl.scrollHeight;
    while (miniLogEl.children.length > 40) miniLogEl.removeChild(miniLogEl.firstChild);
  }

  function atualizarPainel() {
    if (!painel) return;
    const b = painel.querySelector('#autoBloq');
    const p = painel.querySelector('#autoPub');
    const o = painel.querySelector('#autoBuscaOne');
    const st = painel.querySelector('#autoStatus');
    if (b) b.checked = estado.ligado.bloqueio;
    if (p) p.checked = estado.ligado.publicacao;
    if (o) o.checked = estado.ligado.buscaone;
    // Os campos do e-mail de vhost seguem a configuração (o hub-state chega
    // depois de o painel nascer) enquanto ninguém os editou nem está neles.
    if (!estado.emailVhost) {
      const cfg = emailVhostConfig();
      for (const [id, valor] of [['#autoVhostPara', cfg.to], ['#autoVhostCc', cfg.cc]]) {
        const campo = painel.querySelector(id);
        if (campo && document.activeElement !== campo && campo.value !== valor) campo.value = valor;
      }
    }
    if (st) {
      const on = estado.ligado.bloqueio || estado.ligado.publicacao || estado.ligado.buscaone;
      st.textContent = estado.rodando ? 'rodando…' : on ? `ligado · monitor a cada 5 min${estado.ultima ? ` · última: ${estado.ultima.feitas}✓ ${estado.ultima.puladas}↷ ${estado.ultima.erros}✗` : ''}` : 'desligado';
      st.style.color = estado.rodando ? '#22F2EF' : on ? '#5EE970' : '#9fb9ad';
    }
  }

  function montarPainel() {
    painel = document.createElement('div');
    painel.id = 'automacaoPainel';
    painel.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99999;width:280px;background:#0A1C17;border:1px solid rgba(94,233,112,.35);border-radius:12px;padding:12px 14px;font:12px/1.4 system-ui,Segoe UI,sans-serif;color:#dcefe4;box-shadow:0 10px 30px rgba(0,0,0,.5)';
    painel.innerHTML = [
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">',
      '  <strong style="color:#5EE970;font-size:12px;letter-spacing:.3px">AUTOMAÇÃO DA FILA</strong>',
      '  <button id="autoMin" title="Minimizar" style="background:none;border:none;color:#9fb9ad;cursor:pointer;font-size:14px">–</button>',
      '</div>',
      '<div id="autoBody">',
      '  <label style="display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer"><input type="checkbox" id="autoBloq"><span>Bloqueio de contatos automático</span></label>',
      '  <label style="display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer" title="Tarefa de publicação MPI+ na fila: acha o contrato no painel, faz backup do DNS do cliente, aplica DNS, aprova, publica, SSL, tags, planilha e fecha a tarefa"><input type="checkbox" id="autoPub"><span>Publicação MPI+ automática <em style="color:#e9b84a;font-style:normal">(beta)</em></span></label>',
      '  <label style="display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer" title="Tarefa de publicação Busca One (Busca Cliente / MPI Solutions) na fila: cria ou acha as propriedades no Google, commita o geral.php no repositório do Bitbucket (ID do painel pelo “ID do painel xxxx” da tarefa), manda o e-mail de vhost ao suporte e move a tarefa para Em andamento no seu nome; as chaves saem no terminal. A tarefa fica aberta: vhost, clone no servidor e DNS continuam manuais"><input type="checkbox" id="autoBuscaOne"><span>Publicação Busca One automática <em style="color:#e9b84a;font-style:normal">(beta)</em></span></label>',
      '  <div id="autoVhost" style="margin:0 0 4px 24px;display:grid;gap:4px;color:#9fb9ad" title="Para quem vai o pedido de vhost e banco da Busca One. Fica gravado nesta máquina.">',
      '    <label style="display:flex;align-items:center;gap:6px"><span style="width:62px;flex:none">Vhost para</span><input id="autoVhostPara" type="text" spellcheck="false" style="flex:1;min-width:0;background:#07130f;border:1px solid rgba(94,233,112,.25);color:#dcefe4;border-radius:6px;padding:3px 6px;font:11px ui-monospace,Consolas,monospace"></label>',
      '    <label style="display:flex;align-items:center;gap:6px"><span style="width:62px;flex:none">Cc</span><input id="autoVhostCc" type="text" spellcheck="false" style="flex:1;min-width:0;background:#07130f;border:1px solid rgba(94,233,112,.25);color:#dcefe4;border-radius:6px;padding:3px 6px;font:11px ui-monospace,Consolas,monospace"></label>',
      '  </div>',
      '  <div style="display:flex;gap:6px;margin:10px 0 6px">',
      '    <button id="autoRodar" style="flex:1;background:#123;border:1px solid rgba(34,242,239,.4);color:#22F2EF;border-radius:8px;padding:6px;cursor:pointer">Rodar agora</button>',
      '    <button id="autoParar" style="flex:1;background:#210f0f;border:1px solid rgba(255,107,107,.4);color:#ff6b6b;border-radius:8px;padding:6px;cursor:pointer">Parar</button>',
      '  </div>',
      '  <div id="autoStatus" style="margin:4px 0 8px;color:#9fb9ad">desligado</div>',
      '  <div id="autoMiniLog" style="max-height:120px;overflow:auto;font:11px/1.35 ui-monospace,Consolas,monospace;background:#07130f;border-radius:8px;padding:6px"></div>',
      '</div>',
    ].join('');
    document.body.appendChild(painel);
    miniLogEl = painel.querySelector('#autoMiniLog');

    painel.querySelector('#autoBloq').addEventListener('change', (e) => { estado.ligado.bloqueio = e.target.checked; revisarTimer(); atualizarPainel(); log(`Bloqueio automático ${e.target.checked ? 'LIGADO' : 'desligado'}.`, e.target.checked ? 'success' : 'info'); if (e.target.checked) rodarVarredura(false); });
    painel.querySelector('#autoPub').addEventListener('change', (e) => { estado.ligado.publicacao = e.target.checked; revisarTimer(); atualizarPainel(); log(`Publicação MPI+ automática ${e.target.checked ? 'LIGADA (beta): tarefas de publicação MPI+ da fila serão publicadas sozinhas, com backup do DNS antes de aplicar' : 'desligada'}.`, e.target.checked ? 'success' : 'info'); if (e.target.checked) rodarVarredura(false); });
    painel.querySelector('#autoBuscaOne').addEventListener('change', (e) => {
      estado.ligado.buscaone = e.target.checked; revisarTimer(); atualizarPainel();
      const cfg = emailVhostConfig();
      log(`Publicação Busca One automática ${e.target.checked ? `LIGADA (beta): tarefas de publicação Busca Cliente / MPI Solutions da fila ganham propriedades no Google, geral.php commitado e e-mail de vhost para ${cfg.to || '(destinatário em branco!)'}; a tarefa vai para Em andamento e fica aberta; as chaves saem aqui no terminal` : 'desligada'}.`, e.target.checked ? 'success' : 'info');
      if (e.target.checked) rodarVarredura(false);
    });
    const vhostPara = painel.querySelector('#autoVhostPara');
    const vhostCc = painel.querySelector('#autoVhostCc');
    const gravarVhost = () => { guardarEmailVhost(vhostPara.value, vhostCc.value); log(`E-mail de vhost: para ${vhostPara.value.trim() || '(em branco)'}${vhostCc.value.trim() ? ', cc ' + vhostCc.value.trim() : ''}.`, 'info'); };
    vhostPara.addEventListener('change', gravarVhost);
    vhostCc.addEventListener('change', gravarVhost);
    painel.querySelector('#autoRodar').addEventListener('click', () => rodarVarredura(true));
    painel.querySelector('#autoParar').addEventListener('click', () => { estado.parar = true; desligarTimer(); estado.ligado.bloqueio = false; estado.ligado.publicacao = false; estado.ligado.buscaone = false; atualizarPainel(); log('Automação: PARADA (freio de emergência). Tudo desligado.', 'warn'); });
    let min = false;
    painel.querySelector('#autoMin').addEventListener('click', () => { min = !min; painel.querySelector('#autoBody').style.display = min ? 'none' : 'block'; painel.querySelector('#autoMin').textContent = min ? '+' : '–'; });
    atualizarPainel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarPainel);
  else montarPainel();
  // O hub-state (com o mailVhost gravado) chega depois de o painel nascer: uma
  // atualização única, mais tarde, põe o destinatário certo nos campos.
  setTimeout(atualizarPainel, 3000);

  // Exposto para depuração/uso externo.
  window.hubAutomacao = { rodar: () => rodarVarredura(true), estado };
  // Atalho para validar o bloqueio no painel MPI+ ao vivo (ex.: no console do
  // Hub): hubBloquearPainel({ dominio, url|cnpj, acao:'bloquear'|'desbloquear' }).
  // Loga o passo a passo no terminal do Hub.
  window.hubBloquearPainel = async (p) => {
    try {
      const r = await window.api.bloquearPainel(p || {});
      (r.log || []).forEach((l) => log(l.message, l.type));
      log(r.ok ? ('Painel MPI+: ' + ((p && p.acao === 'desbloquear') ? 'desbloqueio' : 'bloqueio') + ' OK.') : ('Painel MPI+: ' + (r.error || (r.incerto ? 'resultado incerto, confira no painel' : 'falhou'))), r.ok ? 'success' : 'error');
      return r;
    } catch (e) { log('Painel MPI+: ' + e.message, 'error'); return { ok: false, error: e.message }; }
  };
})();
