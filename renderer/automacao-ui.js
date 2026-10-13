// O driver da publicação MPI+ automática (ADR-122) e a lista de espera do
// DNS, do lado do renderer. Carregado por <script> DEPOIS do app.js, sem mexer
// no corpo dele: usa os globais da máquina de etapas do Publicar MPI+ (`pub`,
// `pubNovo`, `pubRodarEtapa`, `PUB_ETAPAS`…) e window.api.* (preload).
//
// Até a 1.0.76 este arquivo também era o painel flutuante da automação da
// fila (ADR-120): três interruptores, o relógio de 5 min e o motor. Na fase 2
// do Escritório (ADR-150) tudo isso mora no orquestrador do processo
// principal: ele lê a fila, decide, valida e manda executar. O que fica aqui
// é só o que PRECISA do renderer — a máquina de etapas, chamada pela ponte
// (escritorio-ui.js → window.hubPublicarTarefaAuto) — e a lista de espera,
// que vive no localStorage do app.js e é consultada aqui e mandada ao
// processo principal pelo escritorio-ui.js. A publicação Busca One passou a
// rodar inteira no processo principal (lib/escritorio/executores.js).
(function () {
  'use strict';
  if (window.__automacaoIniciada) return;
  window.__automacaoIniciada = true;

  // A lista de espera do app (`esperas`, let de topo do app.js, visível por
  // identificador): quem está nela já foi publicado e só espera o DNS — a
  // propagação do Registro.br (ADR-103) ou o apontamento do cliente
  // (ADR-142). O vigia da lista termina.
  function listaDeEspera() {
    return (typeof esperas !== 'undefined' && Array.isArray(esperas)) ? esperas : [];
  }
  function textoEspera(e) {
    const hora = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const falta = Array.isArray(e.falta) && e.falta.length ? e.falta.join(', ') : 'o SSL e fechar a tarefa';
    if (e.status === 'falhou') return `já publicado e na lista de espera com pendência (${e.detalhe || 'veja a lista'}); resolva pela lista do Publicar MPI+ ("Tentar de novo")`;
    if (e.status === 'rodando') return `já publicado; o vigia está terminando o que faltava (${falta})`;
    if (e.cliente) return `já publicado; o DNS é do cliente e ${e.detalhe || 'ainda não aponta'}${e.ip ? ` (precisa apontar para ${e.ip})` : ''}; falta ${falta}, que o vigia faz quando apontar (confere a cada 30 min, a próxima ~${hora(e.ate)})`;
    return `já publicado; esperando a propagação do Registro.br (previsão ${hora(e.ate)}) para ${falta}`;
  }
  function emEspera(dominio) {
    const d = String(dominio || '').toLowerCase();
    if (!d) return null;
    const e = listaDeEspera().find((x) => x && String(x.dominio || '').toLowerCase() === d && x.status !== 'concluido');
    return e ? { motivo: textoEspera(e), cliente: !!e.cliente, pendencia: e.status === 'falhou' } : null;
  }

  // Log: o terminal do Hub quando existir; senão, console.
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
  //   - falha de etapa: não pergunta "tentar/pular"; devolve o erro e o
  //     orquestrador decide (tenta de novo até o teto, ou desiste).
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
    // Já publicado e na lista de espera (SSL + fechar a tarefa ficam com o
    // vigia): a tarefa ainda está aberta no Salesforce, mas NÃO é para publicar
    // de novo (ADR-124/142). O orquestrador já barra pela regra "fora da lista
    // de espera"; esta é a segunda trava.
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
        // Tudo feito menos o SSL (e, com ele, o Search Console e a tarefa), e
        // o que falta é o DNS apontar — isso não depende do Hub (ADR-142):
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

  // Exposto para a tela e para os testes: a consulta à lista de espera.
  window.hubAutomacao = { emEspera, listaDeEspera };
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
