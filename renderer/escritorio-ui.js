// Escritório (ADR-149, ADR-159, ADR-161) — a tela do orquestrador e dos
// agentes, em HTML puro: o Comando, os cartões dos agentes, as abas de
// pendências, fila e concluídas, e o histórico de cada tarefa. As regras
// aprendidas (aba e formulários) saíram na ADR-161: o aprendizado é por ADR. A tela em 3D de tela
// cheia (ADR-153/157) saiu em 15/10/2026 por peso; o Início voltou a ser a
// abertura e esta tela é a segunda da barra lateral.
// Carregado por <script> DEPOIS do app.js, como o automacao-ui.js:
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

  const ESTADO_AGENTE = { ocioso: ['ocioso', 'neutral'], standby: ['standby', 'neutral'], trabalhando: ['trabalhando', 'run'], aguardando: ['aguardando você', 'warn'], erro: ['com erro', 'err'], desligado: ['desligado', 'off'] };

  const ui = { snap: null, carregando: false, erro: '', aba: 'tudo', historico: null, pendenciaAberta: null, timerRefresh: null, ultimaEsperas: '' };

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
      const inteiro = !!(r && r.ok && r.ligado && r.modelo && r.contadores && Array.isArray(r.agentes) && Array.isArray(r.tarefas) && Array.isArray(r.pendencias));
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
  document.addEventListener('hub:esperas', () => { mandarEsperas(); if (ativa()) desenhar(); });

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
            <span class="home-hi__sub">01 / SALA DE COMANDO · ${esc((s.orquestrador && s.orquestrador.nome) || 'Odin')}, o orquestrador${s.modelo.configurado ? ` · ${esc(s.modelo.orquestrador)}` : ' · sem modelo'}${s.resumo && window.EscritorioResumo ? ' · ' + esc(window.EscritorioResumo.frase(s.resumo)) : ''}</span>
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
          <label class="esc-switch ${s.modelo.ligado ? 'on' : ''}" title="${s.modelo.temChave ? 'Ligado, o que a triagem não reconhece vai ao Gemini (custa tokens). Desligado, vira pendência para você.' : 'Sem chave do Gemini gravada: ligar não chama nada. Configure em Configurações › Escritório & IA.'}"><input type="checkbox" id="escModelo" ${s.modelo.ligado ? 'checked' : ''}><span class="esc-switch-k"></span><span><b>Perguntar ao Gemini</b><small>${s.modelo.ligado ? (s.modelo.temChave ? 'o que a triagem não reconhece vai ao modelo' : 'ligado, mas sem chave: não chama') : 'desligado: sem custo; o desconhecido vira pendência'}</small></span></label>
          <div class="esc-stat"><b>${s.contadores.chamadas}</b><small>chamadas ao modelo hoje</small></div>
          <div class="esc-stat"><b>${fmtK(s.contadores.tokensEntrada + s.contadores.tokensSaida + s.contadores.tokensPensamento)}</b><small>tokens hoje</small></div>
          <div class="esc-stat"><b>${abertas.length}</b><small>tarefa(s) em aberto</small></div>
          <div class="esc-stat"><b>${s.tarefas.filter((t) => t.estado === 'aguardando_externo').length}</b><small>aguardando externo (DNS)</small></div>
        </div>
        ${linhaEsperas()}
        ${!s.modelo.configurado ? '<p class="hint mt8">Sem modelo: tarefa que a triagem não reconhece vira pendência para você (encaminhar, tratar ou ignorar). Para ela entrar sozinha da próxima vez, a regra vai para a ADR e para o código de triagem. Os agentes não usam modelo nunca.</p>' : ''}
      </div>

      <div class="home-sec-title anim-in">Agentes <span class="r">${s.agentes.filter((a) => a.modo === 'auto').length} automáticos · ${s.agentes.filter((a) => a.modo === 'standby').length} em standby</span></div>
      <div class="esc-agentes anim-in">${s.agentes.map(cardAgente).join('')}</div>
      ${htmlResumo(s)}

      <div class="esc-tabs anim-in">
        ${[['tudo', `Pendências <span class="n">${pendAbertas.length}</span>`], ['fila', `Fila de tarefas <span class="n">${abertas.length}</span>`], ['historico', 'Concluídas e ignoradas']].map(([id, nome]) => `<button class="esc-tab ${ui.aba === id ? 'active' : ''}" data-aba="${id}">${nome}</button>`).join('')}
      </div>
      <div id="escCorpo" class="anim-in">${ui.aba === 'tudo' ? htmlPendencias(pendAbertas) : ui.aba === 'fila' ? htmlFila(abertas) : htmlFila(s.tarefas.filter((t) => ['concluida', 'ignorada'].includes(t.estado)), true)}</div>
      ${ui.historico ? htmlHistorico(ui.historico) : ''}
    `;
    ligarEventos(painel);
  }
  const fmtK = (n) => (n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n || 0));
  // "Thor · Publicador MPI+ · Publicar MPI+ / Publicação em Massa", para os seletores.
  const rotuloAg = (a) => `${a.nome}${a.papel ? ' · ' + a.papel : ''}${a.modulosNomes ? ' · ' + a.modulosNomes : ''}`;
  // As opções do "Encaminhar": um agente, ou um agente com um preset
  // (Huginn · Ativação de SSL / Huginn · Suspensão). Valor "agente|preset".
  function opcoesEncaminhar(agentes, selecionado) {
    const out = [];
    for (const a of agentes) {
      const presets = Array.isArray(a.presets) ? a.presets : [];
      if (!presets.length) out.push(`<option value="${esc(a.id)}" ${selecionado === a.id ? 'selected' : ''}>${esc(rotuloAg(a))}</option>`);
      for (const p of presets) out.push(`<option value="${esc(a.id)}|${esc(p.id)}" ${selecionado === a.id + '|' + p.id ? 'selected' : ''}>${esc(a.nome)} · ${esc(p.nome)} · ${esc(a.modulosNomes || '')}</option>`);
    }
    return out.join('');
  }
  function lerEncaminhar(sel, agentes) {
    const [agente, preset] = String(sel && sel.value || '').split('|');
    const a = agentes.find((x) => x.id === agente);
    const p = a && preset ? (a.presets || []).find((x) => x.id === preset) : null;
    return { agente, parametros: p ? { ...p.parametros } : {} };
  }
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

  // O que os agentes fizeram hoje e nos últimos 7 dias (ADR-155).
  function htmlResumo(s) {
    const r = s.resumo;
    if (!r || !r.hoje || !r.semana) return '';
    const nome = (id) => { const a = s.agentes.find((x) => x.id === id); return a ? a.nome : id; };
    const linha = (titulo, x) => `<tr><td><b>${titulo}</b></td><td>${x.pelosAgentes}</td><td>${x.pelaMao}</td><td>${x.falhas}</td><td>${x.ignoradas}</td><td>${x.pendenciasCriadas}</td><td>${x.tempoMedioMin == null ? '—' : x.tempoMedioMin + ' min'}</td></tr>`;
    const porAgente = Object.entries(r.semana.porAgente || {}).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${esc(nome(id))} ${n}`).join(' · ');
    return `<div class="home-sec-title anim-in" id="escResumo">Hoje e últimos 7 dias <span class="r">o que os agentes fizeram sozinhos</span></div>
      <div class="table-wrap anim-in"><table class="table esc-tabela"><thead><tr><th></th><th>Pelos agentes</th><th>À mão</th><th>Falhas</th><th>Ignoradas</th><th>Pendências</th><th>Da fila à execução</th></tr></thead><tbody>${linha('Hoje', r.hoje)}${linha('7 dias', r.semana)}</tbody></table></div>
      ${porAgente ? `<p class="hint">Por agente (7 dias): ${porAgente}</p>` : ''}`;
  }

  function cardAgente(a) {
    const [rot, tom] = ESTADO_AGENTE[a.estado] || [a.estado, 'neutral'];
    return `<div class="esc-agente ${a.modo} est-${esc(a.estado)}" data-agente="${esc(a.id)}">
      <div class="esc-agente-sala">${esc(a.sala ? a.sala.numero + ' / ' + a.sala.nome : '')}</div>
      <div class="esc-agente-nome">${esc(a.nome)}${a.papel ? `<span class="esc-agente-papel"> · ${esc(a.papel)}</span>` : ''}</div>
      <div class="esc-agente-funcao">${esc(a.funcao)}</div>
      ${a.modulosNomes ? `<div class="esc-agente-modulos">${esc(a.modulosNomes)}</div>` : ''}
      ${a.atividade ? `<div class="esc-agente-atividade">${esc(a.atividade)}</div>` : ''}
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
      const encaminhar = (sel) => `<span class="esc-encaminhar"><select data-agente-sel>${opcoesEncaminhar(agentesAuto, sel)}</select><button class="btn compact ghost" data-acao="encaminhar" title="Manda estas tarefas para o agente escolhido (só estas; para o tipo entrar sozinho, a regra vai para a ADR)">Encaminhar</button></span>`;
      return `<div class="sec esc-pend tipo-${esc(p.tipo)}" data-pend="${esc(p.id)}">
        <div class="sec-head"><span class="sec-title">${esc(p.id)} · ${p.tipo === 'retomar' ? 'retomar?' : p.tipo === 'sugestao' ? 'sugestão' : p.tipo === 'humano' ? 'para você' : 'pergunta'}</span><span class="sec-meta">${hora(p.criadaEm)} · ${tarefas.length} tarefa(s)${p.agente ? ' · ' + esc((s.agentes.find((a) => a.id === p.agente) || { nome: p.agente }).nome) : ''}${p.contexto && p.contexto.categoria ? ' · ' + esc(p.contexto.categoria) : ''}</span></div>
        <p class="esc-pergunta">${esc(p.pergunta)}</p>
        <div class="esc-pend-tarefas">${tarefas.slice(0, 8).map((t) => `<div class="esc-pend-tarefa" title="${esc(t.id)}"><span class="esc-chip">${esc(t.assunto)}</span>${t.leitura ? `<span class="esc-leitura">${esc(t.leitura)}</span>` : ''}${t.link ? `<button class="text-btn" data-link="${esc(t.link)}">abrir</button>` : ''}</div>`).join('')}${tarefas.length > 8 ? `<span class="dim">+${tarefas.length - 8}</span>` : ''}</div>
        <div class="esc-pend-acoes">
          ${p.tipo === 'retomar' ? `<button class="btn compact primary" data-acao="retomar">Retomar</button><button class="btn compact ghost" data-acao="descartar">Descartar</button>` : ''}
          ${p.tipo === 'sugestao' ? `<button class="btn compact primary" data-acao="tratada">Marcar como tratada</button><button class="btn compact ghost" data-acao="ignorar-estas">Ignorar estas</button>` : ''}
          ${p.tipo === 'humano' ? `
            <button class="btn compact primary" data-acao="tratada" title="Você fez à mão: conclui as tarefas e fecha">Marcar como tratada</button>
            <button class="btn compact ghost" data-acao="tentar-de-novo" title="A causa foi resolvida: zera as tentativas e o agente tenta de novo">Tentar de novo</button>
            ${encaminhar(p.agente || '')}
            <button class="btn compact ghost" data-acao="ignorar-estas" title="Só estas tarefas">Ignorar estas</button>
            <button class="btn compact ghost" data-acao="descartar" title="Fecha a pendência e ignora as tarefas">Descartar</button>` : ''}
          ${p.tipo === 'pergunta' ? `
            ${encaminhar(p.agente || '')}
            <button class="btn compact ghost" data-acao="tratada" title="Você fez à mão: conclui as tarefas e fecha">Marcar como tratada</button>
            <button class="btn compact ghost" data-acao="ignorar-estas" title="Só estas tarefas">Ignorar estas</button>
            <button class="btn compact ghost" data-acao="descartar" title="Fecha a pendência e ignora as tarefas">Descartar</button>` : ''}
        </div>
        ${p.tipo === 'pergunta' ? '<p class="hint esc-aprender">Para tarefas assim entrarem sozinhas, diga a regra ao Claude: ela vira código de triagem, com a decisão na ADR (ADR-161).</p>' : ''}
      </div>`;
    }).join('');
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
    painel.querySelector('#escModelo')?.addEventListener('change', (e) => chamar('iaUsarModelo', { ligar: e.target.checked }));
    painel.querySelectorAll('[data-agente-toggle]').forEach((c) => c.addEventListener('change', (e) => chamar('escritorioLigar', { agente: c.dataset.agenteToggle, valor: e.target.checked })));
    painel.querySelectorAll('.esc-tab').forEach((b) => b.addEventListener('click', () => { ui.aba = b.dataset.aba; desenhar(); }));
    painel.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', async () => { const r = await chamar('escritorioTarefa', { id: b.dataset.hist }, { recarregar: false }); if (r.ok) { ui.historico = r.tarefa; desenhar(); } }));
    painel.querySelector('#escHistFechar')?.addEventListener('click', () => { ui.historico = null; desenhar(); });
    painel.querySelector('#escHistFundo')?.addEventListener('click', (e) => { if (e.target.id === 'escHistFundo') { ui.historico = null; desenhar(); } });
    painel.querySelectorAll('[data-reanalisar]').forEach((b) => b.addEventListener('click', () => chamar('escritorioReanalisar', { id: b.dataset.reanalisar })));
    painel.querySelectorAll('[data-confirmar]').forEach((b) => b.addEventListener('click', () => chamar('escritorioConfirmar', { id: b.dataset.confirmar })));
    painel.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () => { if (api().abrirLink) api().abrirLink({ url: b.dataset.link }); }));
    painel.querySelectorAll('[data-acao]').forEach((b) => b.addEventListener('click', async () => {
      const acao = b.dataset.acao;
      const pendEl = b.closest('[data-pend]');
      const id = pendEl ? pendEl.dataset.pend : null;
      if (!id) return;
      if (['ignorar-estas', 'tratada', 'retomar', 'descartar', 'tentar-de-novo'].includes(acao)) { b.disabled = true; await chamar('escritorioResponder', { id, resposta: { acao } }); return; }
      if (acao === 'encaminhar') { const e = lerEncaminhar(pendEl.querySelector('[data-agente-sel]'), ui.snap.agentes); b.disabled = true; await chamar('escritorioEncaminhar', { id, agente: e.agente, parametros: e.parametros }); return; }
    }));
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
    // A notificação do Windows clicada (ADR-155): abre o Escritório nas pendências.
    if (api().onEscritorioAbrir) api().onEscritorioAbrir(() => { ui.aba = 'tudo'; abrir(); carregar().then(() => desenhar()); });
    // O app.js pode ter desenhado antes de este script existir (o render()
    // cai no Início): com o snapshot na mão, a tela certa entra no lugar.
    carregar().then(() => { atualizarChip(); if (ativa()) renderEscritorioTool(); });
    setTimeout(mandarEsperas, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  // Os módulos acionados pela mão avisam quando começam e terminam (ADR-152):
  // o cartão do agente mostra "trabalhando" com o módulo.
  window.hubEscritorioAtividade = function (agente, ligado, detalhe) {
    if (!api().escritorioAtividade) return;
    api().escritorioAtividade({ agente, ligado: !!ligado, detalhe: detalhe || '' }).catch(() => {});
  };

  window.hubEscritorio = { ui, carregar, desenhar, abrir, atenderPonte };
})();
