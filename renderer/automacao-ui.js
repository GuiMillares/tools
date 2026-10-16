// A automação da fila (ADR-120, de volta pela ADR-164) — cola do renderer.
//
// Carregado por <script> DEPOIS do app.js. Não mexe no corpo do app.js: injeta
// o próprio controle (o interruptor "Fila automática" no topo) e usa
// window.Triagem / window.Automacao / window.BuscaOne (módulos duais) +
// window.api.* (preload) + window.log (terminal do app).
// Um interruptor só liga a fila inteira: bloqueio de contatos, publicação MPI+
// (ADR-122) e publicação Busca One (ADR-132). Fica gravado no hub-state
// (state.automacaoFila): reabrir o Asgard volta como estava.
//
// De 13/10 a 16/10/2026 (ADR-149 a 163) isto morou no Escritório (orquestrador,
// agentes, regras, Gemini), e antes num painel flutuante. A ADR-164 tirou o
// Escritório e devolveu a automação a este arquivo, com o interruptor; o que
// melhorou na publicação nesse meio tempo (subdomínio, domínio novo no
// Registro.br, erro passageiro, erro que repetir não resolve, IP atrás do
// proxy) está no driver e no app.js e ficou.
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
    // As tentativas por tarefa precisam viver entre as varreduras: até 05/10
    // o mapa nascia a cada varredura e o teto de 3 nunca chegava (ADR-142).
    tentativas: new Map(),
    // A anotação das tarefas que esperam o DNS (id → { dominio, motivo, cliente }).
    aguardando: new Map(),
    timer: null,
    ultima: null,
  };

  // A lista de espera do app (`esperas`, let de topo do app.js, visível por
  // identificador): quem está nela já foi publicado e só espera o DNS — a
  // propagação do Registro.br (ADR-103) ou o apontamento do cliente
  // (ADR-142). A varredura anota e pula; o vigia da lista termina.
  function listaDeEspera() {
    return (typeof esperas !== 'undefined' && Array.isArray(esperas)) ? esperas : [];
  }
  function textoEspera(e) {
    const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const falta = Array.isArray(e.falta) && e.falta.length ? e.falta.join(', ') : 'o SSL e fechar a tarefa';
    if (e.status === 'falhou') return `já publicado e na lista de espera com pendência (${e.detalhe || 'veja a lista'}); resolva pela lista do Publicar MPI+ ("Tentar de novo")`;
    if (e.status === 'rodando') return `já publicado; o vigia está terminando o que faltava (${falta})`;
    const passo = typeof ESPERA_CLIENTE_PASSO_MS !== 'undefined' ? Math.round(ESPERA_CLIENTE_PASSO_MS / 60000) : 60;
    if (e.cliente) return `já publicado; o DNS é do cliente e ${e.detalhe || 'ainda não aponta'}${e.ip ? ` (precisa apontar para ${e.ip})` : ''}; falta ${falta}, que o vigia faz quando apontar (confere a cada ${passo >= 60 ? passo / 60 + ' h' : passo + ' min'}, a próxima ~${hora(e.ate)})`;
    return `já publicado; esperando a propagação do Registro.br (previsão ${hora(e.ate)}) para ${falta}`;
  }
  function emEspera(dominio) {
    const d = String(dominio || '').toLowerCase();
    if (!d) return null;
    const e = listaDeEspera().find((x) => x && String(x.dominio || '').toLowerCase() === d && x.status !== 'concluido');
    return e ? { motivo: textoEspera(e), cliente: !!e.cliente, pendencia: e.status === 'falhou' } : null;
  }

  // Para quem vai o e-mail de vhost da Busca One (ADR-132): o que foi gravado
  // nas Configurações (aba Automação da fila, hub-state mailVhost); senão o
  // mesmo destino e cópia do e-mail de ativação de SSL (suporte da M3, cópia
  // para o Everton), como foi confirmado em 01/10/2026.
  function emailVhostConfig() {
    const st = typeof state !== 'undefined' && state ? state : null;
    if (st && st.mailVhost && typeof st.mailVhost === 'object') return { to: String(st.mailVhost.to || ''), cc: String(st.mailVhost.cc || '') };
    const ssl = (st && st.mailSsl) || (typeof MAIL_MODOS !== 'undefined' && MAIL_MODOS.ssl && MAIL_MODOS.ssl.defaults) || {};
    const padrao = (window.BuscaOne && window.BuscaOne.EMAIL_VHOST_PADRAO) || { to: '', cc: '' };
    return { to: String(ssl.to || padrao.to), cc: String(ssl.cc != null ? ssl.cc : padrao.cc) };
  }

  // Log: o terminal do Asgard quando existir; senão, console.
  function log(msg, tipo) {
    try { if (typeof window.log === 'function') { window.log(msg, tipo); return; } } catch (e) {}
    console.log('[automação] ' + msg);
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

  // Mensagens de etapa que não mudam tentando de novo (ADR-162).
  const ERROS_SEM_SAIDA = [
    /n[ãa]o vai passar/i,            // verificação do Search Console: o site redireciona ou não tem a tag
    /CanEditDNS=false/i,             // a conta não pode editar o DNS (não é domínio novo, que é espera)
    /driver desconhecido/i,
  ];
  // Erro passageiro (o painel ou o Salesforce demoraram, rede, sessão): não é
  // "não achei", é "não deu para olhar agora". Vira "adiada" (pulou), e a
  // próxima varredura tenta sem contar tentativa (ADR-162).
  const passageiro = (msg) => /demorou|timeout|tempo esgotado|n[ãa]o respondeu|ECONN|ETIMEDOUT|ENOTFOUND|net::|sess[ãa]o/i.test(String(msg || ''));
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
    if (typeof pub !== 'undefined' && pub && (pub.emAndamento || pub.rodando)) return { ok: false, pulou: true, motivo: 'já há uma publicação em andamento no Asgard; tento na próxima varredura' };
    if (typeof bulkRodando !== 'undefined' && bulkRodando) return { ok: false, pulou: true, motivo: 'o Publicar em massa está rodando; tento na próxima varredura' };
    if (typeof state !== 'undefined' && !state.googleSaPath) return { ok: false, desistir: true, motivo: 'service account do Google não configurada (as tags precisam dela)' };
    const dom = normalizeDomain(p.dominio);
    if (!dom) return { ok: false, desistir: true, motivo: 'sem domínio final na tarefa' };
    // Já publicado e na lista de espera (SSL + fechar a tarefa ficam com o
    // vigia): a tarefa ainda está aberta no Salesforce, mas NÃO é para publicar
    // de novo (ADR-124/142). O motor já pula antes de chegar aqui
    // (deps.emEspera, ADR-142); esta é a segunda trava.
    const naEspera = emEspera(dom);
    if (naEspera) return { ok: false, aguardando: true, dominio: dom, cliente: naEspera.cliente, motivo: naEspera.motivo };

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
      else if (passageiro(rz && rz.error)) return { ok: false, pulou: true, motivo: 'o Salesforce não respondeu ao procurar a conta do domínio (' + rz.error + ')' };
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
    if (!(ach && ach.ok && ach.url) && passageiro(ach && ach.error)) return { ok: false, pulou: true, motivo: 'o painel não respondeu ao procurar o contrato de ' + dom + ' (' + ach.error + ')' };
    if (!(ach && ach.ok && ach.url)) return { ok: false, desistir: true, motivo: 'não achei o contrato de ' + dom + ' no painel' + ((ach && ach.error) ? ': ' + ach.error : '') + '; publicar à mão' };
    pub.painelUrl = ach.url; pub.painelConferido = ach.url; pub.painelAchado = true;
    log(`Publicação automática de ${dom} (${pub.razao}): painel ${ach.url}. Começando as etapas.`, 'cmd');

    // 4) Etapas, uma a uma.
    pub.emAndamento = true;
    try {
      while (pub.etapa) {
        if (typeof paradaAgora !== 'undefined' && paradaAgora) return { ok: false, motivo: 'parado pelo freio do Asgard' };
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
        // Tudo feito menos o SSL (e, com ele, o Search Console e a tarefa), e
        // o que falta é o DNS apontar — isso não depende do Asgard (ADR-142):
        //   - DNS do cliente (ou fora do .br): o site vai para a lista de
        //     espera como "aguardando o cliente", sem prazo; o vigia confere
        //     a cada 30 min e termina quando apontar. A tarefa fica anotada e
        //     a fila segue para a próxima;
        //   - DNS nosso que não propagou nos 30 min da etapa: lista de espera
        //     normal (o vigia confere a cada minuto, com a folga de 30 min);
        //   - Registro.br não respondeu e o DNS não foi tocado: repetir não
        //     resolve; fica para a mão (a parte da Cloudflare).
        if (antes === 'salesforce' && pub.sslPendente && typeof pubMandarParaEspera === 'function') {
          if (pub.dnsNosso === false) {
            pubMandarParaEspera({ cliente: true });
            const e = emEspera(dom);
            return { ok: false, aguardando: true, dominio: dom, cliente: true, motivo: (e && e.motivo) || 'publicado; o DNS é do cliente e ainda não aponta; o vigia termina quando apontar' };
          }
          if (pub.dnsNosso === true) {
            pubMandarParaEspera({ ate: Date.now() });
            const e = emEspera(dom);
            return { ok: false, aguardando: true, dominio: dom, motivo: (e && e.motivo) || 'publicado; o DNS ainda não propagou; o vigia termina quando apontar' };
          }
          return { ok: false, desistir: true, motivo: `publicado, tags e planilha feitos, mas o Registro.br não respondeu na hora do contato e o DNS não foi tocado (${pub.sslPendente}); rode o Publicar MPI+ à mão para a parte da Cloudflare — o SSL e a tarefa saem depois` };
        }
        // Etapa que precisa de uma escolha humana (dois servidores de produção
        // no painel, ADR-140): repetir não resolve, desiste de primeira.
        if (pub.semSaida) return { ok: false, desistir: true, motivo: `${etapa.nome}: ${pub.semSaida}` };
        if (!f || f.ok) return { ok: false, motivo: `parou em "${etapa.nome}"` };
        // Erro que não muda tentando de novo (o site redireciona para outro
        // domínio, a conta não pode editar o DNS…): desiste de primeira, em
        // vez de três tentativas iguais (ADR-162).
        if (ERROS_SEM_SAIDA.some((re) => re.test(String(f.detalhe || '')))) return { ok: false, desistir: true, motivo: `${etapa.nome} falhou e repetir não resolve: ${f.detalhe}` };
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
    if (typeof pub !== 'undefined' && pub && (pub.emAndamento || pub.rodando)) return { ok: false, pulou: true, motivo: 'já há uma publicação em andamento no Asgard; tento na próxima varredura' };
    if (typeof bulkRodando !== 'undefined' && bulkRodando) return { ok: false, pulou: true, motivo: 'o Publicar em massa está rodando; tento na próxima varredura' };
    const dom = normalizeDomain(p.dominio);
    if (!dom) return { ok: false, desistir: true, motivo: 'sem domínio final na tarefa' };
    // Configuração que falta é erro comum (fica para a próxima varredura, até
    // o teto), não "desistir": arrumar nas Configurações resolve.
    if (!state.googleSaPath) return { ok: false, motivo: 'service account do Google não configurada (Configurações); as propriedades precisam dela' };
    if (!state.creds) return { ok: false, motivo: 'Bitbucket não configurado (e-mail e API token, Configurações); o geral.php é commitado lá' };
    if (!(state.ms && state.ms.connected)) return { ok: false, motivo: 'conta Microsoft não conectada (Configurações); o e-mail de vhost sai pela sua caixa' };
    const email = emailVhostConfig();
    if (!window.BuscaOne.listaEmails(email.to).length) return { ok: false, motivo: 'destinatário do e-mail de vhost em branco (Configurações › Automação da fila)' };

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
      // O freio do painel (e o do Asgard) param ENTRE as etapas desta tarefa:
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
    emEspera,
  };

  async function rodarVarredura(manual) {
    if (estado.rodando) { if (manual) log('Automação: já está rodando uma varredura.', 'warn'); return; }
    if (!estado.ligado.bloqueio && !estado.ligado.publicacao && !estado.ligado.buscaone) { if (manual) log('Automação: a fila automática está desligada (interruptor no topo).', 'warn'); return; }
    // Leve em 2º plano (ADR-124): com uma publicação ou o Publicar em massa
    // rodando, a varredura só empilharia trabalho e consultas. Pula a rodada.
    const ocupado = (typeof pub !== 'undefined' && pub && (pub.emAndamento || pub.rodando)) || (typeof bulkRodando !== 'undefined' && bulkRodando);
    if (ocupado) { if (manual) log('Automação: o Asgard está publicando agora; a varredura fica para a próxima rodada.', 'info'); return; }
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
      const res = await window.Automacao.varrerFila(dados, deps, { processados: estado.processados, tentativas: estado.tentativas, aguardando: estado.aguardando, parar: () => estado.parar });
      const feitas = res.filter((r) => r.ok).length;
      const aguardando = res.filter((r) => !r.ok && r.aguardando).length;
      const puladas = res.filter((r) => !r.ok && !r.aguardando && r.pulou).length;
      const erros = res.filter((r) => !r.ok && !r.aguardando && !r.pulou).length;
      estado.ultima = { quando: new Date(), feitas, aguardando, puladas, erros, total: res.length };
      log(`Automação: varredura concluída — ${feitas} feita(s), ${aguardando} aguardando o DNS, ${puladas} pulada(s), ${erros} erro(s).`, feitas || erros ? 'success' : 'info');
    } catch (e) {
      log('Automação: erro na varredura — ' + e.message, 'error');
    } finally {
      estado.rodando = false; atualizarPainel();
    }
  }

  // Com a automação ligada, a janela não desacelera em segundo plano: ela
  // trabalha sozinha, com o Asgard atrás de outras janelas (ADR-126).
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

  // ---------- O interruptor do topo (ADR-164) ----------
  //
  // Um só, deslizante, à esquerda do MEM/CPU, em qualquer tela: liga a fila
  // inteira (publicação MPI+, Busca One e bloqueio de contatos). Ligar lê a
  // fila na hora e depois a cada 5 min; desligar é o freio: a varredura para
  // entre uma tarefa e outra, e nada novo começa. Passar o mouse mostra a
  // última varredura e quem está na lista de espera; o detalhe de cada tarefa
  // vai para o terminal.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // A primeira leitura depois de reabrir espera a sessão do Salesforce e a
  // lista de espera acordarem (como o Escritório fazia).
  const RETOMAR_MS = 15000;
  let chave = null;
  const ligada = () => !!(estado.ligado.bloqueio && estado.ligado.publicacao && estado.ligado.buscaone);

  function textoDica() {
    const partes = [ligada()
      ? 'Fila automática LIGADA: publicação MPI+, Busca One e bloqueio de contatos saem sozinhos; a fila é lida a cada 5 min. Clique para desligar (para entre uma tarefa e outra).'
      : 'Fila automática desligada. Clique para ligar a publicação MPI+, a Busca One e o bloqueio de contatos da fila de uma vez.'];
    const u = estado.ultima;
    if (u) partes.push(`Última varredura (${u.quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}): ${u.feitas} feita(s), ${u.aguardando} aguardando o DNS, ${u.puladas} pulada(s), ${u.erros} erro(s).`);
    const abertas = listaDeEspera().filter((e) => e && e.status !== 'concluido');
    const cli = abertas.filter((e) => e.cliente).map((e) => e.dominio + (e.status === 'falhou' ? ' (falta algo)' : ''));
    const prop = abertas.filter((e) => !e.cliente).map((e) => e.dominio + (e.status === 'falhou' ? ' (falta algo)' : ''));
    if (cli.length) partes.push(`Aguardando o cliente apontar (${cli.length}): ${cli.join(', ')}.`);
    if (prop.length) partes.push(`Aguardando a propagação (${prop.length}): ${prop.join(', ')}.`);
    return partes.join('\n');
  }

  function atualizarPainel() {
    if (!chave) return;
    const on = ligada();
    const u = estado.ultima;
    chave.classList.toggle('on', on);
    chave.classList.toggle('rodando', estado.rodando);
    const input = chave.querySelector('input');
    if (input) { input.checked = on; input.setAttribute('aria-checked', on ? 'true' : 'false'); }
    const sub = chave.querySelector('small');
    if (sub) sub.textContent = estado.rodando ? 'lendo…' : !on ? 'desligada' : u ? `${u.feitas}✓ ${u.aguardando}⏳ ${u.erros}✗` : 'ligada';
    chave.title = textoDica();
  }
  document.addEventListener('hub:esperas', () => { try { atualizarPainel(); } catch (e) {} });

  // origem: 'clique' grava no hub-state; 'gravado' é a volta depois de
  // reabrir (já está gravado).
  function ligarFila(on, { origem = 'clique' } = {}) {
    estado.ligado = { bloqueio: on, publicacao: on, buscaone: on };
    if (!on) estado.parar = true;
    revisarTimer();
    atualizarPainel();
    if (origem === 'clique' && typeof state !== 'undefined' && state) {
      state.automacaoFila = on;
      if (typeof saveHubState === 'function') { try { Promise.resolve(saveHubState()).catch(() => {}); } catch (e) {} }
    }
    if (on) {
      log(origem === 'gravado'
        ? `Fila automática: volta ligada, como ficou gravada; a primeira leitura da fila sai em ${RETOMAR_MS / 1000}s.`
        : 'Fila automática LIGADA: publicação MPI+ (com backup do DNS antes de aplicar), Busca One e bloqueio de contatos saem sozinhos; leio a fila agora e a cada 5 min.', 'success');
      if (origem === 'gravado') setTimeout(() => { if (ligada()) rodarVarredura(false); }, RETOMAR_MS);
      else rodarVarredura(false);
    } else {
      log(estado.rodando ? 'Fila automática desligada: a varredura em andamento para depois da tarefa atual.' : 'Fila automática desligada.', 'warn');
    }
  }

  function montarInterruptor() {
    const direita = document.querySelector('.tb-right');
    if (!direita || document.getElementById('autoFila')) return;
    chave = document.createElement('label');
    chave.className = 'tb-auto';
    chave.id = 'autoFilaChave';
    chave.innerHTML = '<input type="checkbox" id="autoFila" role="switch" aria-checked="false" aria-label="Fila automática"><span class="tb-auto-k"></span><span>FILA AUTOMÁTICA</span><small>desligada</small>';
    direita.insertBefore(chave, direita.firstChild);
    chave.querySelector('input').addEventListener('change', (e) => ligarFila(e.target.checked));
    atualizarPainel();
  }

  // Volta como ficou gravado, quando o app.js terminar de carregar o estado
  // (credenciais, service account, conta Microsoft e lista de espera).
  function retomarGravado() {
    if (typeof state !== 'undefined' && state && state.automacaoFila === true && !ligada()) ligarFila(true, { origem: 'gravado' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarInterruptor);
  else montarInterruptor();
  if (window.__hubPronto) retomarGravado();
  else document.addEventListener('hub:pronto', retomarGravado, { once: true });

  // Exposto para depuração, para a tela e para os testes.
  window.hubAutomacao = { rodar: () => rodarVarredura(true), ligar: (on) => ligarFila(!!on), estado, emEspera, listaDeEspera };
  // Atalho para validar o bloqueio no painel MPI+ ao vivo (ex.: no console do
  // Asgard): hubBloquearPainel({ dominio, url|cnpj, acao:'bloquear'|'desbloquear' }).
  // Loga o passo a passo no terminal do Asgard.
  window.hubBloquearPainel = async (p) => {
    try {
      const r = await window.api.bloquearPainel(p || {});
      (r.log || []).forEach((l) => log(l.message, l.type));
      log(r.ok ? ('Painel MPI+: ' + ((p && p.acao === 'desbloquear') ? 'desbloqueio' : 'bloqueio') + ' OK.') : ('Painel MPI+: ' + (r.error || (r.incerto ? 'resultado incerto, confira no painel' : 'falhou'))), r.ok ? 'success' : 'error');
      return r;
    } catch (e) { log('Painel MPI+: ' + e.message, 'error'); return { ok: false, error: e.message }; }
  };
})();
