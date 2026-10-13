// Escritório (ADR-149) — a tela principal, em 2D, do orquestrador e dos
// agentes. Carregado por <script> DEPOIS do app.js, como o automacao-ui.js:
// não mexe no corpo do app.js, só registra `renderEscritorioTool` (que o
// render() do app chama quando state.view === 'escritorio'), injeta o chip
// de status no topo e conversa com o processo principal pelo preload.
//
// Tudo que aparece aqui vem de `escritorio:estado` (o snapshot do
// orquestrador); a tela nunca decide nada sozinha. A lista de espera do DNS,
// que mora no localStorage do app.js, é mandada para o processo principal ao
// abrir e a cada mudança (evento hub:esperas), para a regra "fora da lista de
// espera".
(function () {
  'use strict';
  if (window.__escritorioIniciado) return;
  window.__escritorioIniciado = true;

  const esc = (s) => (typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const logar = (m, t) => { try { if (typeof log === 'function') log(m, t, { arquivo: false }); } catch (e) { console.log('[escritório]', m); } };
  const api = () => window.api || {};

  const CAMPOS = ['assunto', 'descricao', 'fila', 'tipo', 'plataforma', 'dominio', 'temporario', 'marca', 'elegivel', 'dono', 'prioridade', 'relativoTipo'];
  const OPS = [['igual', '='], ['diferente', '≠'], ['contem', 'contém'], ['naoContem', 'não contém'], ['comeca', 'começa com'], ['termina', 'termina com'], ['regex', 'bate com (regex)'], ['vazio', 'está vazio'], ['naoVazio', 'não está vazio']];
  const ESTADO_AGENTE = { ocioso: ['ocioso', 'neutral'], standby: ['standby', 'neutral'], trabalhando: ['trabalhando', 'run'], aguardando: ['aguardando você', 'warn'], erro: ['com erro', 'err'], desligado: ['desligado', 'off'] };

  const ui = { snap: null, carregando: false, erro: '', aba: 'tudo', historico: null, editando: null, pendenciaAberta: null, timerRefresh: null, ultimaEsperas: '' };

  function hora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    return (mesmoDia ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ') + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  const badge = (texto, tom) => `<span class="badge ${tom === 'ok' ? 'ok' : tom === 'warn' ? 'warn' : tom === 'err' ? 'err' : tom === 'run' ? 'run' : 'neutral'}">${esc(texto)}</span>`;

  // ---------- dados ----------
  async function carregar() {
    if (!api().escritorioEstado) { ui.erro = 'preload sem o Escritório (versão antiga)'; return; }
    ui.carregando = true;
    try {
      const r = await api().escritorioEstado();
      // Só um snapshot inteiro serve: resposta pela metade (um preload antigo,
      // um erro no meio) vira "indisponível", nunca uma tela quebrada.
      const inteiro = !!(r && r.ok && r.ligado && r.modelo && r.contadores && Array.isArray(r.agentes) && Array.isArray(r.tarefas) && Array.isArray(r.pendencias) && Array.isArray(r.regras));
      if (inteiro) { ui.snap = r; ui.erro = ''; } else { ui.snap = null; ui.erro = (r && (r.error || r.erro)) || 'o Escritório não respondeu com o estado completo'; }
    } catch (e) { ui.snap = null; ui.erro = e.message; }
    ui.carregando = false;
  }
  function agendarRefresh() {
    if (ui.timerRefresh) return;
    ui.timerRefresh = setTimeout(async () => { ui.timerRefresh = null; await carregar(); atualizarChip(); if (ativa()) desenhar(); }, 400);
  }
  const ativa = () => typeof state !== 'undefined' && state && state.view === 'escritorio';

  // A lista de espera do app.js (ADR-103/142), para o processo principal.
  function mandarEsperas() {
    if (!api().escritorioEsperas) return;
    const lista = (typeof esperas !== 'undefined' && Array.isArray(esperas)) ? esperas.map((e) => ({ dominio: e && e.dominio, status: e && e.status, cliente: !!(e && e.cliente) })) : [];
    const chave = JSON.stringify(lista);
    if (chave === ui.ultimaEsperas) return;
    ui.ultimaEsperas = chave;
    api().escritorioEsperas({ lista }).catch(() => {});
  }
  document.addEventListener('hub:esperas', mandarEsperas);

  // ---------- chip no topo ----------
  let chip = null;
  function montarChip() {
    const direita = document.querySelector('.tb-right');
    if (!direita || chip) return;
    chip = document.createElement('button');
    chip.id = 'tbEscritorio';
    chip.className = 'tb-esc';
    chip.title = 'Escritório: o orquestrador e os agentes';
    chip.addEventListener('click', () => abrir());
    direita.insertBefore(chip, direita.firstChild);
    atualizarChip();
  }
  function atualizarChip() {
    if (!chip) return;
    const s = ui.snap;
    if (!s) { chip.innerHTML = '<span class="tb-esc-dot off"></span>ESCRITÓRIO'; return; }
    const pend = s.pendencias.filter((p) => p.status !== 'fechada').length;
    const modo = !s.ligado.geral ? 'manual' : s.ligado.observacao ? 'observação' : 'automático';
    chip.innerHTML = `<span class="tb-esc-dot ${!s.ligado.geral ? 'off' : s.ligado.observacao ? 'obs' : 'on'}"></span>ESCRITÓRIO · ${esc(modo)}${pend ? ` · <b>${pend}</b> pend.` : ''}`;
    chip.classList.toggle('tem-pend', pend > 0);
  }

  function abrir() {
    if (typeof state === 'undefined') return;
    if (typeof openTool === 'function') openTool('escritorio');
    else { state.view = 'escritorio'; if (typeof render === 'function') render(); }
  }

  // ---------- a tela ----------
  async function renderEscritorioTool() {
    const painel = (typeof el !== 'undefined' && el.leftPanel) || document.getElementById('leftPanel');
    if (!painel) return;
    if (!ui.snap && !ui.carregando) { painel.innerHTML = '<div class="empty-state"><p>Lendo o Escritório…</p></div>'; await carregar(); }
    desenhar();
    mandarEsperas();
  }
  window.renderEscritorioTool = renderEscritorioTool;

  function desenhar() {
    const painel = (typeof el !== 'undefined' && el.leftPanel) || document.getElementById('leftPanel');
    if (!painel || !ativa()) return;
    const s = ui.snap;
    if (!s) { painel.innerHTML = `<div class="empty-state"><p><strong>Escritório indisponível.</strong> ${esc(ui.erro || '')}</p></div>`; return; }
    const pendAbertas = s.pendencias.filter((p) => p.status !== 'fechada');
    const abertas = s.tarefas.filter((t) => !['concluida', 'ignorada'].includes(t.estado));
    const modo = !s.ligado.geral ? 'MANUAL' : s.ligado.observacao ? 'OBSERVAÇÃO' : 'AUTOMÁTICO';
    const v = s.ultimaVarredura;
    painel.innerHTML = `
      <div class="home-head anim-in">
        <div class="home-head-left">
          <div class="home-hi">
            <span class="home-hi__ola">Escritório</span>
            <span class="home-hi__sub">01 / SALA DE COMANDO · ${esc((s.orquestrador && s.orquestrador.nome) || 'Odin')}, o orquestrador${s.modelo.configurado ? ` · ${esc(s.modelo.orquestrador)}` : ' · sem modelo'}</span>
          </div>
        </div>
        <div class="home-head-right">
          <span class="home-pill ${s.ligado.geral ? (s.ligado.observacao ? 'cyan' : '') : 'dim'}">${modo}</span>
          <span class="home-pill ${pendAbertas.length ? 'warn' : 'dim'}">${pendAbertas.length} pendência(s)</span>
          <button class="btn compact ghost" id="escRodar" ${s.rodando ? 'disabled' : ''}>${s.rodando ? 'varrendo…' : 'Rodar agora'}</button>
          <button class="btn compact danger" id="escFreio" title="Desliga o modo automático e, se houver publicação no meio, interrompe (ADR-102)">Freio</button>
        </div>
      </div>

      <div class="sec anim-in esc-comando">
        <div class="sec-head"><span class="sec-title">Comando</span><span class="sec-meta">${v ? `última varredura ${hora(v.quando)}${v.ok === false ? ' · falhou: ' + esc(v.erro || '') : ''}` : 'nenhuma varredura ainda'}</span></div>
        <div class="esc-switches">
          <label class="esc-switch ${s.ligado.geral ? 'on' : ''}"><input type="checkbox" id="escGeral" ${s.ligado.geral ? 'checked' : ''}><span class="esc-switch-k"></span><span><b>Modo automático</b><small>lê a fila a cada 5 min e encaminha sozinho</small></span></label>
          <label class="esc-switch ${s.ligado.observacao ? 'on' : ''}"><input type="checkbox" id="escObs" ${s.ligado.observacao ? 'checked' : ''}><span class="esc-switch-k"></span><span><b>Modo observação</b><small>só anota o que faria; nada executa</small></span></label>
          <div class="esc-stat"><b>${s.contadores.chamadas}</b><small>chamadas ao modelo hoje</small></div>
          <div class="esc-stat"><b>${fmtK(s.contadores.tokensEntrada + s.contadores.tokensSaida + s.contadores.tokensPensamento)}</b><small>tokens hoje</small></div>
          <div class="esc-stat"><b>${abertas.length}</b><small>tarefa(s) em aberto</small></div>
          <div class="esc-stat"><b>${s.regras.filter((r) => r.ativa !== false).length}</b><small>regra(s) ativa(s)</small></div>
        </div>
        ${linhaEsperas()}
        ${!s.modelo.configurado ? '<p class="hint warn-text mt8">Sem chave do Gemini: tarefa que a triagem do Hub não reconhece vira pendência. Configure em Configurações › Escritório &amp; IA.</p>' : ''}
      </div>

      <div class="home-sec-title anim-in">Agentes <span class="r">${s.agentes.filter((a) => a.modo === 'auto').length} automáticos · ${s.agentes.filter((a) => a.modo === 'standby').length} em standby</span></div>
      <div class="esc-agentes anim-in">${s.agentes.map(cardAgente).join('')}</div>

      <div class="esc-tabs anim-in">
        ${[['tudo', `Pendências <span class="n">${pendAbertas.length}</span>`], ['fila', `Fila de tarefas <span class="n">${abertas.length}</span>`], ['regras', `Regras aprendidas <span class="n">${s.regras.length}</span>`], ['historico', 'Concluídas e ignoradas']].map(([id, nome]) => `<button class="esc-tab ${ui.aba === id ? 'active' : ''}" data-aba="${id}">${nome}</button>`).join('')}
      </div>
      <div id="escCorpo" class="anim-in">${ui.aba === 'tudo' ? htmlPendencias(pendAbertas) : ui.aba === 'fila' ? htmlFila(abertas) : ui.aba === 'regras' ? htmlRegras(s.regras) : htmlFila(s.tarefas.filter((t) => ['concluida', 'ignorada'].includes(t.estado)), true)}</div>
      ${ui.historico ? htmlHistorico(ui.historico) : ''}
    `;
    ligarEventos(painel);
  }
  const fmtK = (n) => (n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n || 0));
  // "Thor · Publicador MPI+ · Publicar MPI+ / Publicação em Massa", para os seletores.
  const rotuloAg = (a) => `${a.nome}${a.papel ? ' · ' + a.papel : ''}${a.modulosNomes ? ' · ' + a.modulosNomes : ''}`;
  // A lista de espera do Publicar MPI+ (ADR-103/142), que o painel flutuante
  // mostrava: quem aguarda o cliente apontar e quem aguarda a propagação.
  function linhaEsperas() {
    const lista = (typeof esperas !== 'undefined' && Array.isArray(esperas)) ? esperas.filter((e) => e && e.status !== 'concluido') : [];
    if (!lista.length) return '';
    const cli = lista.filter((e) => e.cliente).map((e) => e.dominio);
    const prop = lista.filter((e) => !e.cliente).map((e) => e.dominio);
    const falta = lista.filter((e) => e.status === 'falhou').length;
    return `<p class="hint mt8" id="escEsperas">Aguardando DNS (o vigia do Publicar MPI+ termina quando apontar): ${cli.length ? `<b>o cliente apontar</b> ${esc(cli.join(', '))}` : ''}${cli.length && prop.length ? ' · ' : ''}${prop.length ? `<b>a propagação</b> ${esc(prop.join(', '))}` : ''}${falta ? ` · <span class="warn-text">${falta} com pendência (ver a lista do Publicar MPI+)</span>` : ''}</p>`;
  }

  function cardAgente(a) {
    const [rot, tom] = ESTADO_AGENTE[a.estado] || [a.estado, 'neutral'];
    return `<div class="esc-agente ${a.modo} est-${esc(a.estado)}" data-agente="${esc(a.id)}">
      <div class="esc-agente-sala">${esc(a.sala ? a.sala.numero + ' / ' + a.sala.nome : '')}</div>
      <div class="esc-agente-nome">${esc(a.nome)}${a.papel ? `<span class="esc-agente-papel"> · ${esc(a.papel)}</span>` : ''}</div>
      <div class="esc-agente-funcao">${esc(a.funcao)}</div>
      ${a.modulosNomes ? `<div class="esc-agente-modulos">${esc(a.modulosNomes)}</div>` : ''}
      <div class="esc-agente-rodape">
        ${badge(rot, tom === 'off' ? 'neutral' : tom)}
        ${a.tarefas ? `<span class="dim">${a.tarefas} tarefa(s)</span>` : ''}
        ${a.modo === 'auto' ? `<label class="esc-mini-switch" title="Liga ou desliga só este agente"><input type="checkbox" data-agente-toggle="${esc(a.id)}" ${a.ligado ? 'checked' : ''}><span></span></label>` : '<span class="esc-standby" title="Só roda quando você aciona pelo módulo">standby</span>'}
      </div>
    </div>`;
  }

  function htmlPendencias(lista) {
    if (!lista.length) return '<div class="empty-state"><p><strong>Nenhuma pendência.</strong> O orquestrador não tem pergunta para você.</p></div>';
    const s = ui.snap;
    return lista.map((p) => {
      const tarefas = p.tarefas.map((id) => s.tarefas.find((t) => t.id === id)).filter(Boolean);
      const aberta = ui.pendenciaAberta === p.id;
      const agentesAuto = s.agentes.filter((a) => a.modo === 'auto');
      return `<div class="sec esc-pend tipo-${esc(p.tipo)} ${p.status === 'respondida' ? 'respondida' : ''}" data-pend="${esc(p.id)}">
        <div class="sec-head"><span class="sec-title">${esc(p.id)} · ${p.tipo === 'retomar' ? 'retomar?' : p.tipo === 'sugestao' ? 'sugestão' : p.tipo === 'humano' ? 'para você' : p.status === 'respondida' ? 'proposta de regra' : 'pergunta'}</span><span class="sec-meta">${hora(p.criadaEm)} · ${tarefas.length} tarefa(s)${p.agente ? ' · ' + esc((s.agentes.find((a) => a.id === p.agente) || { nome: p.agente }).nome) : ''}${p.contexto && p.contexto.categoria ? ' · ' + esc(p.contexto.categoria) : ''}</span></div>
        <p class="esc-pergunta">${esc(p.pergunta)}</p>
        <div class="esc-pend-tarefas">${tarefas.slice(0, 8).map((t) => `<div class="esc-pend-tarefa" title="${esc(t.id)}"><span class="esc-chip">${esc(t.assunto)}</span>${t.leitura ? `<span class="esc-leitura">${esc(t.leitura)}</span>` : ''}${t.link ? `<button class="text-btn" data-link="${esc(t.link)}">abrir</button>` : ''}</div>`).join('')}${tarefas.length > 8 ? `<span class="dim">+${tarefas.length - 8}</span>` : ''}</div>
        ${p.status === 'respondida' ? htmlProposta(p) : `
        <div class="esc-pend-acoes">
          ${p.tipo === 'retomar' ? `<button class="btn compact primary" data-acao="retomar">Retomar</button><button class="btn compact ghost" data-acao="descartar">Descartar</button>` : ''}
          ${p.tipo === 'sugestao' ? `<button class="btn compact primary" data-acao="tratada">Marcar como tratada</button><button class="btn compact ghost" data-acao="ignorar-estas">Ignorar estas</button>` : ''}
          ${p.tipo === 'humano' ? `
            <button class="btn compact primary" data-acao="tratada" title="Você fez à mão: conclui as tarefas e fecha">Marcar como tratada</button>
            <input type="text" class="esc-resposta" placeholder="Ou diga o que fazer com pedidos assim (o modelo propõe a regra)" data-texto>
            <button class="btn compact ghost" data-acao="texto">Responder</button>
            ${!p.regraId ? '<button class="btn compact ghost" data-acao="avisar-sempre" title="Propõe uma regra: pedidos assim sempre vêm para você, sem passar pelo modelo">Avisar sempre</button>' : ''}
            <span class="esc-encaminhar"><select data-agente-sel>${agentesAuto.map((a) => `<option value="${esc(a.id)}">${esc(rotuloAg(a))}</option>`).join('')}</select>
            <button class="btn compact ghost" data-acao="encaminhar" title="Propõe uma regra para encaminhar sempre">Encaminhar sempre</button>
            <button class="btn compact ghost" data-acao="so-desta-vez" title="Encaminha só estas, sem regra">Só desta vez</button></span>
            <button class="btn compact ghost" data-acao="ignorar-estas" title="Só estas tarefas">Ignorar estas</button>` : ''}
          ${p.tipo === 'pergunta' ? `
            <input type="text" class="esc-resposta" placeholder="Responda em texto (o modelo propõe a regra) ou use os botões" data-texto>
            <button class="btn compact primary" data-acao="texto">Responder</button>
            <button class="btn compact ghost" data-acao="ignorar-estas" title="Só estas tarefas">Ignorar estas</button>
            <button class="btn compact ghost" data-acao="ignorar-sempre" title="Propõe uma regra para ignorar sempre tarefas assim">Ignorar sempre</button>
            <button class="btn compact ghost" data-acao="avisar-sempre" title="Propõe uma regra: pedidos assim sempre vêm para você, sem passar pelo modelo">Avisar sempre</button>
            <span class="esc-encaminhar"><select data-agente-sel>${agentesAuto.map((a) => `<option value="${esc(a.id)}" ${p.agente === a.id ? 'selected' : ''}>${esc(rotuloAg(a))}</option>`).join('')}</select>
            <button class="btn compact ghost" data-acao="encaminhar" title="Propõe uma regra para encaminhar sempre">Encaminhar sempre</button>
            <button class="btn compact ghost" data-acao="so-desta-vez" title="Encaminha só estas, sem regra">Só desta vez</button></span>
            <button class="btn compact ghost" data-acao="descartar" title="Fecha a pendência e ignora as tarefas">Descartar</button>` : ''}
        </div>`}
      </div>`;
    }).join('');
  }

  function htmlProposta(p) {
    const prop = p.proposta || {};
    const regra = ui.editando && ui.editando.pendenciaId === p.id ? ui.editando.regra : (prop.regra || { quando: [{ campo: 'assunto', op: 'comeca', valor: (p.contexto && p.contexto.assuntoExemplo) || '' }], entao: { acao: 'encaminhar', agente: p.agente || '', parametros: {} }, descricao: '' });
    return `<div class="esc-proposta">
      <div class="esc-proposta-head">${prop.regra ? `<b>Regra proposta</b> ${prop.justificativa ? '<span class="dim">· ' + esc(prop.justificativa) + '</span>' : ''}` : `<b>Monte a regra</b> <span class="dim">· ${esc((prop.erros || []).join('; ') || 'o modelo não propôs')}</span>`}</div>
      ${formRegra(regra, 'pend-' + p.id)}
      <div class="esc-pend-acoes">
        <button class="btn compact primary" data-acao="aprovar-regra">Aprovar e gravar a regra</button>
        <button class="btn compact ghost" data-acao="descartar-proposta">Descartar proposta</button>
        <button class="btn compact ghost" data-acao="descartar">Fechar e ignorar as tarefas</button>
      </div>
    </div>`;
  }

  // O formulário de regra: condições (campo, operador, valor), ação, agente,
  // parâmetros fixos (chave=valor por linha) e descrição.
  function formRegra(r, idBase) {
    const s = ui.snap;
    const conds = Array.isArray(r.quando) && r.quando.length ? r.quando : [{ campo: 'assunto', op: 'contem', valor: '' }];
    const entao = r.entao || {};
    const params = Object.entries(entao.parametros || {}).map(([k, v]) => `${k}=${v}`).join('\n');
    return `<div class="esc-regra-form" data-form="${esc(idBase)}" ${r.id ? `data-regra-id="${esc(r.id)}"` : ''}>
      <div class="esc-conds">${conds.map((c, i) => linhaCond(c, i)).join('')}</div>
      <button class="text-btn" data-add-cond>+ condição</button>
      <div class="esc-regra-entao">
        <label>então <select data-acao-sel>${[['encaminhar', 'encaminhar para'], ['avisar', 'avisar você (o Hub não faz)'], ['ignorar', 'ignorar']].map(([v, n]) => `<option value="${v}" ${entao.acao === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <select data-agente-regra ${entao.acao !== 'encaminhar' ? 'disabled' : ''}>${s.agentes.map((a) => `<option value="${esc(a.id)}" ${entao.agente === a.id ? 'selected' : ''}>${esc(rotuloAg(a))}${a.modo === 'standby' ? ' (standby: vira sugestão)' : ''}</option>`).join('')}</select>
      </div>
      <div class="grid-2">
        <label class="field"><span>Parâmetros fixos (chave=valor, um por linha; o resto vem da tarefa)</span><textarea rows="2" data-params>${esc(params)}</textarea></label>
        <label class="field"><span>Descrição (uma linha; em branco, o Hub escreve)</span><input type="text" data-descricao value="${esc(r.descricao || '')}"></label>
      </div>
    </div>`;
  }
  function linhaCond(c, i) {
    return `<div class="esc-cond" data-cond="${i}">
      <select data-campo>${CAMPOS.map((k) => `<option value="${k}" ${c.campo === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
      <select data-op>${OPS.map(([v, n]) => `<option value="${v}" ${c.op === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <input type="text" data-valor value="${esc(c.valor || '')}" placeholder="valor" ${['vazio', 'naoVazio'].includes(c.op) ? 'disabled' : ''}>
      <button class="text-btn danger" data-del-cond title="Tirar esta condição">×</button>
    </div>`;
  }
  function lerFormRegra(form) {
    const quando = [...form.querySelectorAll('[data-cond]')].map((l) => ({ campo: l.querySelector('[data-campo]').value, op: l.querySelector('[data-op]').value, valor: l.querySelector('[data-valor]').value }));
    const acao = form.querySelector('[data-acao-sel]').value;
    const parametros = {};
    for (const linha of form.querySelector('[data-params]').value.split(/\r?\n/)) {
      const m = linha.match(/^\s*([^=\s]+)\s*=\s*(.*?)\s*$/);
      if (m) parametros[m[1]] = m[2];
    }
    return { id: form.dataset.regraId || null, quando, entao: { acao, agente: acao !== 'encaminhar' ? '' : form.querySelector('[data-agente-regra]').value, parametros }, descricao: form.querySelector('[data-descricao]').value.trim() };
  }

  function htmlFila(lista, fechadas = false) {
    if (!lista.length) return `<div class="empty-state"><p>${fechadas ? 'Nada concluído ou ignorado ainda.' : '<strong>Fila vazia.</strong> Ligue o modo automático ou clique em "Rodar agora" para ler a fila do Salesforce.'}</p></div>`;
    return `<div class="table-wrap"><table class="table esc-tabela"><thead><tr><th>Tarefa</th><th>Estado</th><th>Agente</th><th>Plano</th><th>Último evento</th><th></th></tr></thead><tbody>
      ${lista.map((t) => `<tr data-tarefa="${esc(t.id)}">
        <td title="${esc(t.id)}"><span class="esc-assunto">${esc(t.assunto)}</span>${t.empresaFila ? `<span class="dim"> · ${t.empresaFila === 'bc' ? 'BC' : 'MPI'}</span>` : ''}${t.leitura ? `<div class="esc-leitura">${esc(t.leitura)}</div>` : ''}</td>
        <td>${badge(t.rotulo, t.tom)}${t.tentativas ? `<span class="dim"> ${t.tentativas}×</span>` : ''}</td>
        <td>${esc(t.agenteNome || '—')}</td>
        <td class="faint">${t.plano ? `via ${esc(t.plano.origem)}${t.plano.validacao ? (t.plano.validacao.ok ? ' · regras ok' : ' · <span class="warn-text">regra barrou</span>') : ''}` : (t.pendenciaId ? esc(t.pendenciaId) : '—')}</td>
        <td class="faint" title="${esc(t.ultimo ? t.ultimo.motivo || '' : '')}">${t.ultimo ? `${hora(t.ultimo.quando)} ${esc(t.ultimo.tipo)}${t.ultimo.motivo ? ': ' + esc(String(t.ultimo.motivo).slice(0, 80)) : ''}` : ''}</td>
        <td class="esc-tarefa-acoes">
          <button class="text-btn" data-hist="${esc(t.id)}" title="Histórico auditável">histórico</button>
          ${t.estado === 'aguardando_confirmacao' ? `<button class="btn compact primary" data-confirmar="${esc(t.id)}">Executar</button>` : ''}
          ${!['executando', 'concluida'].includes(t.estado) ? `<button class="text-btn" data-reanalisar="${esc(t.id)}">reanalisar</button>` : ''}
          ${t.link ? `<button class="text-btn" data-link="${esc(t.link)}">abrir</button>` : ''}
        </td>
      </tr>`).join('')}
    </tbody></table></div>`;
  }

  function htmlRegras(regras) {
    const form = ui.editando && !ui.editando.pendenciaId ? `<div class="sec"><div class="sec-head"><span class="sec-title">${ui.editando.regra.id ? 'Editar regra' : 'Nova regra'}</span></div>${formRegra(ui.editando.regra, 'regra')}<div class="esc-pend-acoes"><button class="btn compact primary" data-acao="salvar-regra">Salvar</button><button class="btn compact ghost" data-acao="cancelar-regra">Cancelar</button></div></div>` : `<div class="esc-pend-acoes"><button class="btn compact ghost" data-acao="nova-regra">+ Nova regra</button></div>`;
    if (!regras.length) return form + '<div class="empty-state"><p><strong>Nenhuma regra aprendida.</strong> Elas nascem das pendências que você responde.</p></div>';
    return form + `<div class="table-wrap"><table class="table esc-tabela"><thead><tr><th>Regra</th><th>Ativa</th><th>Usos</th><th>Origem</th><th></th></tr></thead><tbody>
      ${regras.map((r) => `<tr class="${r.ativa === false ? 'inativa' : ''}" data-regra="${esc(r.id)}">
        <td title="${esc(r.id)}"><span class="esc-assunto">${esc(r.descricao)}</span></td>
        <td><label class="esc-mini-switch"><input type="checkbox" data-regra-toggle="${esc(r.id)}" ${r.ativa !== false ? 'checked' : ''}><span></span></label></td>
        <td>${r.usos || 0}</td>
        <td class="faint">${esc(r.origem || '')}${r.criadaEm ? ' · ' + hora(r.criadaEm) : ''}</td>
        <td class="esc-tarefa-acoes"><button class="text-btn" data-editar-regra="${esc(r.id)}">editar</button><button class="text-btn danger" data-apagar-regra="${esc(r.id)}">apagar</button></td>
      </tr>`).join('')}
    </tbody></table></div>`;
  }

  function htmlHistorico(t) {
    const linhas = (t.historico || []).slice().reverse();
    return `<div class="esc-hist-fundo" id="escHistFundo"><div class="esc-hist">
      <div class="sec-head"><span class="sec-title">Histórico · ${esc(t.assunto)}</span><button class="text-btn" id="escHistFechar">fechar</button></div>
      <div class="esc-hist-meta mono">${esc(t.id)} · estado ${esc(t.estado)} · ${t.agente ? 'agente ' + esc(t.agente) : 'sem agente'}${t.plano ? ` · plano via ${esc(t.plano.origem)}` : ''}</div>
      ${t.plano ? `<div class="esc-hist-plano"><b>Parâmetros:</b> <code>${esc(JSON.stringify(t.plano.parametros))}</code>${t.plano.etapas && t.plano.etapas.length ? `<br><b>Etapas:</b> ${esc(t.plano.etapas.map((e) => e.agente + (e.acao ? ' (' + e.acao + ')' : '')).join(' → '))}` : ''}${t.plano.validacao ? `<br><b>Validação ${hora(t.plano.validacao.quando)}:</b> ${t.plano.validacao.resultados.map((r) => `<span class="${r.ok ? 'ok-text' : 'warn-text'}">${r.ok ? '✓' : '✗'} ${esc(r.nome)}${r.motivo ? ' (' + esc(r.motivo) + ')' : ''}</span>`).join(' · ')}` : ''}</div>` : ''}
      <div class="esc-hist-linhas">${linhas.map((h) => `<div class="esc-hist-linha tipo-${esc(h.tipo)}"><span class="mono dim">${hora(h.quando)}</span><span class="esc-hist-tipo">${esc(h.tipo)}</span><span>${esc(descreverEvento(h))}</span></div>`).join('')}</div>
    </div></div>`;
  }
  function descreverEvento(h) {
    if (h.tipo === 'estado') return `${h.de} → ${h.para}${h.motivo ? ': ' + h.motivo : ''}`;
    if (h.tipo === 'validacao') return (h.resultados || []).join(' · ');
    if (h.tipo === 'decisao') return `${h.origem}${h.decisao ? ' ' + h.decisao : ''}${h.confianca != null ? ' (' + Math.round(h.confianca * 100) + '%)' : ''}${h.motivo ? ': ' + h.motivo : ''}${h.uso ? ` · ${h.uso.entrada || 0}+${h.uso.saida || 0} tokens` : ''}`;
    if (h.tipo === 'execucao') return `${h.agente} ${h.ok ? 'ok' : 'falhou'}${h.motivo ? ': ' + h.motivo : ''}`;
    if (h.tipo === 'plano-invalido') return (h.erros || []).join('; ');
    return h.motivo || JSON.stringify(Object.fromEntries(Object.entries(h).filter(([k]) => !['quando', 'tipo'].includes(k))));
  }

  // ---------- eventos ----------
  async function chamar(nome, payload, { recarregar = true } = {}) {
    const fn = api()[nome];
    if (typeof fn !== 'function') { logar(`Escritório: ${nome} indisponível no preload.`, 'error'); return { ok: false }; }
    let r;
    try { r = await fn(payload); } catch (e) { r = { ok: false, error: e.message }; }
    if (!r || !r.ok) logar(`Escritório: ${(r && (r.error || r.erro)) || 'falhou'}`, 'error');
    if (recarregar) { await carregar(); atualizarChip(); if (ativa()) desenhar(); }
    return r || { ok: false };
  }

  function ligarEventos(painel) {
    painel.querySelector('#escRodar')?.addEventListener('click', async () => { ui.snap.rodando = true; desenhar(); await chamar('escritorioRodar'); });
    painel.querySelector('#escFreio')?.addEventListener('click', async () => {
      // Desliga o modo automático (nada novo começa) e, se há uma publicação
      // no meio, puxa o freio do Hub (ADR-102), que o próprio fluxo solta ao
      // terminar de parar.
      const publicando = typeof pub !== 'undefined' && pub && (pub.emAndamento || pub.rodando);
      if (publicando && typeof pararAgora === 'function') { try { pararAgora(); } catch (e) {} }
      logar(`Freio: modo automático desligado${publicando ? '; interrompendo a publicação em andamento' : ''}.`, 'warn');
      await chamar('escritorioLigar', { geral: false });
    });
    painel.querySelector('#escGeral')?.addEventListener('change', (e) => chamar('escritorioLigar', { geral: e.target.checked }));
    painel.querySelector('#escObs')?.addEventListener('change', (e) => chamar('escritorioLigar', { observacao: e.target.checked }));
    painel.querySelectorAll('[data-agente-toggle]').forEach((c) => c.addEventListener('change', (e) => chamar('escritorioLigar', { agente: c.dataset.agenteToggle, valor: e.target.checked })));
    painel.querySelectorAll('.esc-tab').forEach((b) => b.addEventListener('click', () => { ui.aba = b.dataset.aba; desenhar(); }));
    painel.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', async () => { const r = await chamar('escritorioTarefa', { id: b.dataset.hist }, { recarregar: false }); if (r.ok) { ui.historico = r.tarefa; desenhar(); } }));
    painel.querySelector('#escHistFechar')?.addEventListener('click', () => { ui.historico = null; desenhar(); });
    painel.querySelector('#escHistFundo')?.addEventListener('click', (e) => { if (e.target.id === 'escHistFundo') { ui.historico = null; desenhar(); } });
    painel.querySelectorAll('[data-reanalisar]').forEach((b) => b.addEventListener('click', () => chamar('escritorioReanalisar', { id: b.dataset.reanalisar })));
    painel.querySelectorAll('[data-confirmar]').forEach((b) => b.addEventListener('click', () => chamar('escritorioConfirmar', { id: b.dataset.confirmar })));
    painel.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () => { if (api().abrirLink) api().abrirLink({ url: b.dataset.link }); }));
    painel.querySelectorAll('[data-regra-toggle]').forEach((c) => c.addEventListener('change', (e) => { const r = ui.snap.regras.find((x) => x.id === c.dataset.regraToggle); if (r) chamar('escritorioRegraSalvar', { regra: { ...r, ativa: e.target.checked } }); }));
    painel.querySelectorAll('[data-editar-regra]').forEach((b) => b.addEventListener('click', () => { const r = ui.snap.regras.find((x) => x.id === b.dataset.editarRegra); if (r) { ui.editando = { regra: JSON.parse(JSON.stringify(r)) }; desenhar(); } }));
    painel.querySelectorAll('[data-apagar-regra]').forEach((b) => b.addEventListener('click', () => { if (confirm('Apagar esta regra?')) chamar('escritorioRegraApagar', { id: b.dataset.apagarRegra }); }));

    // Formulários de regra (nas pendências e na aba de regras): condições.
    painel.querySelectorAll('[data-form]').forEach((form) => {
      form.querySelector('[data-add-cond]')?.addEventListener('click', () => { const r = lerFormRegra(form); r.quando.push({ campo: 'assunto', op: 'contem', valor: '' }); guardarEdicao(form, r); desenhar(); });
      form.querySelectorAll('[data-del-cond]').forEach((b) => b.addEventListener('click', () => { const r = lerFormRegra(form); const i = Number(b.closest('[data-cond]').dataset.cond); r.quando.splice(i, 1); guardarEdicao(form, r); desenhar(); }));
      form.querySelector('[data-acao-sel]')?.addEventListener('change', () => { const r = lerFormRegra(form); guardarEdicao(form, r); desenhar(); });
      form.querySelectorAll('[data-op]').forEach((sel) => sel.addEventListener('change', () => { const r = lerFormRegra(form); guardarEdicao(form, r); desenhar(); }));
    });

    painel.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', async () => {
      const acao = b.dataset.acao;
      const pendEl = b.closest('[data-pend]');
      const id = pendEl ? pendEl.dataset.pend : null;
      if (acao === 'nova-regra') { ui.editando = { regra: { quando: [{ campo: 'assunto', op: 'contem', valor: '' }], entao: { acao: 'encaminhar', agente: ui.snap.agentes[0].id, parametros: {} }, descricao: '' } }; desenhar(); return; }
      if (acao === 'cancelar-regra') { ui.editando = null; desenhar(); return; }
      if (acao === 'salvar-regra') { const form = painel.querySelector('[data-form="regra"]'); const r = await chamar('escritorioRegraSalvar', { regra: lerFormRegra(form) }); if (r.ok) ui.editando = null; else guardarEdicao(form, lerFormRegra(form)); desenhar(); return; }
      if (!id) return;
      if (acao === 'texto') { const texto = pendEl.querySelector('[data-texto]').value.trim(); if (!texto) { logar('Escreva a resposta antes de enviar.', 'warn'); return; } b.disabled = true; b.textContent = 'enviando…'; await chamar('escritorioResponder', { id, resposta: { acao: 'texto', texto } }); return; }
      if (['ignorar-estas', 'ignorar-sempre', 'avisar-sempre', 'tratada', 'retomar', 'descartar'].includes(acao)) { await chamar('escritorioResponder', { id, resposta: { acao } }); return; }
      if (acao === 'encaminhar') { await chamar('escritorioResponder', { id, resposta: { acao: 'encaminhar', agente: pendEl.querySelector('[data-agente-sel]').value } }); return; }
      if (acao === 'so-desta-vez') { await chamar('escritorioAplicarSemRegra', { id, agente: pendEl.querySelector('[data-agente-sel]').value, parametros: {} }); return; }
      if (acao === 'aprovar-regra') { const form = pendEl.querySelector('[data-form]'); const regra = lerFormRegra(form); const r = await chamar('escritorioAprovarRegra', { id, regra }); if (!r.ok) { guardarEdicao(form, regra, id); desenhar(); } else ui.editando = null; return; }
      if (acao === 'descartar-proposta') { ui.editando = null; await chamar('escritorioResponder', { id, resposta: { acao: 'descartar' } }); return; }
    }));
  }
  function guardarEdicao(form, regra, pendenciaId) {
    const pend = form.closest('[data-pend]');
    ui.editando = { regra, pendenciaId: pendenciaId || (pend ? pend.dataset.pend : null) };
  }

  // ---------- início ----------
  // A ponte (ADR-150): o orquestrador do processo principal pede, esta tela
  // roda o driver do Publicar MPI+ (automacao-ui.js) e devolve o desfecho.
  async function atenderPonte(d) {
    const pedido = d || {};
    let resultado;
    try {
      if (pedido.driver === 'publicarMpiPlus' && typeof window.hubPublicarTarefaAuto === 'function') resultado = await window.hubPublicarTarefaAuto(pedido.payload || {});
      else resultado = { ok: false, desistir: true, motivo: `driver desconhecido na tela: ${pedido.driver || '?'}` };
    } catch (e) {
      resultado = { ok: false, motivo: e && e.message ? e.message : String(e) };
    }
    if (api().escritorioResultado) api().escritorioResultado({ id: pedido.id, resultado }).catch(() => {});
    agendarRefresh();
    return resultado;
  }

  function iniciar() {
    montarChip();
    if (api().onEscritorioExecutar) api().onEscritorioExecutar(atenderPonte);
    if (api().escritorioRendererPronto) api().escritorioRendererPronto().catch(() => {});
    if (api().onEscritorioLog) api().onEscritorioLog((d) => logar(d && d.message, (d && d.type) || 'info'));
    if (api().onEscritorioEvento) api().onEscritorioEvento(() => agendarRefresh());
    // O app.js pode ter desenhado antes de este script existir (o render()
    // cai no Início): com o snapshot na mão, a tela certa entra no lugar.
    carregar().then(() => { atualizarChip(); if (ativa()) renderEscritorioTool(); });
    setTimeout(mandarEsperas, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  window.hubEscritorio = { ui, carregar, desenhar, abrir, lerFormRegra, atenderPonte };
})();
