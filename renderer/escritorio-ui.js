// Escritório (ADR-149, ADR-153) — a tela principal do Hub, de tela cheia: o
// escritório em 3D isométrico (renderer/escritorio-cena.js, com a planta de
// lib/escritorio/planta.js) com o orquestrador e os agentes nas salas, os
// cartões presos às figuras, o HUD do Comando por cima e uma gaveta à
// direita com as pendências, a fila, as regras e as concluídas. O menu do
// Hub e o topo somem e voltam quando o mouse encosta na borda esquerda ou
// na de cima.
//
// Carregado por <script> DEPOIS do app.js, como o automacao-ui.js: não mexe
// no corpo do app.js, só registra `renderEscritorioTool` (que o render() do
// app chama quando state.view === 'escritorio'), injeta o chip de status no
// topo e conversa com o processo principal pelo preload.
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
  const PREFS_CHAVE = 'hub.escritorio.tela';
  const ALTURA_CARTAO = 3.2;  // o cartão, no alto do fio, em metros da planta
  const ALTURA_LOSANGO = 2.1; // o losango com o ícone, logo acima da cabeça

  const ui = { snap: null, carregando: false, erro: '', aba: 'tudo', gaveta: null, historico: null, editando: null, pendenciaAberta: null, timerRefresh: null, ultimaEsperas: '', paineis: true, motorPreferido: '3d', terminal: false };
  let motor = null;          // o motor da cena (3D ou 2D), vive enquanto o Hub estiver aberto
  const cartoes = new Map(); // id da figura → elemento do cartão
  const losangos = new Map(); // id da figura → o losango com o ícone da função
  const selos = new Map();    // id do pacote em viagem → o selo que viaja com ele
  const rotulos = new Map(); // número da sala → elemento do rótulo
  const contadores = new Map(); // lugar → elemento "+n"

  function lerPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_CHAVE) || '{}');
      if (typeof p.paineis === 'boolean') ui.paineis = p.paineis;
      if (p.motor === '2d' || p.motor === '3d') ui.motorPreferido = p.motor;
    } catch (e) { /* sem armazenamento: fica o padrão */ }
  }
  function gravarPrefs() { try { localStorage.setItem(PREFS_CHAVE, JSON.stringify({ paineis: ui.paineis, motor: ui.motorPreferido })); } catch (e) {} }

  function hora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    return (mesmoDia ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ') + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  const badge = (texto, tom) => `<span class="badge ${tom === 'ok' ? 'ok' : tom === 'warn' ? 'warn' : tom === 'err' ? 'err' : tom === 'run' ? 'run' : 'neutral'}">${esc(texto)}</span>`;
  const fmtK = (n) => (n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n || 0));
  // "Thor · Publicador MPI+ · Publicar MPI+ / Publicação em Massa", para os seletores.
  const rotuloAg = (a) => `${a.nome}${a.papel ? ' · ' + a.papel : ''}${a.modulosNomes ? ' · ' + a.modulosNomes : ''}`;

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
  document.addEventListener('hub:esperas', () => { mandarEsperas(); if (ativa() && ui.gaveta === 'comando') desenhar(); });

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

  // ---------- a moldura de tela cheia: menu e topo nas bordas ----------
  const appEl = () => document.querySelector('.app');
  function montarBordas() {
    if (document.querySelector('.esc-borda-menu')) return;
    const app = appEl();
    if (!app) return;
    const bordaMenu = document.createElement('div');
    bordaMenu.className = 'esc-borda esc-borda-menu';
    bordaMenu.title = 'Menu do Hub';
    const bordaTopo = document.createElement('div');
    bordaTopo.className = 'esc-borda esc-borda-topo';
    // Dentro do .app: é a classe esc-cheia dele que as mostra.
    app.append(bordaMenu, bordaTopo);
    bordaMenu.addEventListener('mouseenter', () => app.classList.add('menu-aberto'));
    bordaTopo.addEventListener('mouseenter', () => app.classList.add('topo-aberto'));
    // Fecham quando o mouse sai deles (e não só quando sai da borda que os
    // abriu: quem encosta na borda e volta sem entrar no menu também fecha).
    document.addEventListener('mousemove', (e) => {
      if (!app.classList.contains('esc-cheia')) return;
      const alvo = e.target instanceof Element ? e.target : null;
      if (app.classList.contains('menu-aberto') && !(alvo && alvo.closest('.app-nav, .esc-borda-menu'))) app.classList.remove('menu-aberto');
      if (app.classList.contains('topo-aberto') && !(alvo && alvo.closest('.topbar, .esc-borda-topo'))) app.classList.remove('topo-aberto');
    });
    // Esc fecha o que estiver aberto por cima da cena.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !ativa()) return;
      if (ui.historico) { ui.historico = null; desenhar(); return; }
      if (app.classList.contains('menu-aberto') || app.classList.contains('topo-aberto')) { app.classList.remove('menu-aberto', 'topo-aberto'); return; }
      if (ui.gaveta) { ui.gaveta = null; desenhar(); }
    });
  }
  // O app.js chama ao sair do Escritório: a cena para de pedir quadros; o
  // canvas fica guardado no motor e volta quando a tela voltar.
  window.hubEscritorioSair = function () {
    const app = appEl();
    if (app) app.classList.remove('menu-aberto', 'topo-aberto', 'esc-terminal');
    if (motor) motor.desligar();
  };

  // ---------- a tela ----------
  async function renderEscritorioTool() {
    const painel = (typeof el !== 'undefined' && el.leftPanel) || document.getElementById('leftPanel');
    if (!painel) return;
    montarBordas();
    if (!ui.snap && !ui.carregando) { painel.innerHTML = '<div class="empty-state"><p>Lendo o Escritório…</p></div>'; await carregar(); }
    desenhar();
    mandarEsperas();
  }
  window.renderEscritorioTool = renderEscritorioTool;

  function esqueleto() {
    return `
      <div class="esc-cena" id="escCena">
        <div class="esc-palco" id="escPalco"><div class="esc-overlay ${ui.paineis ? '' : 'sem-paineis'}" id="escOverlay"></div></div>
        <div class="esc-hud esc-hud-topo" id="escHudTopo"></div>
        <div class="esc-hud esc-hud-comando" id="escHudComando"></div>
        <div class="esc-hud esc-hud-rodape" id="escHudRodape"></div>
        <aside class="esc-gaveta" id="escGaveta" hidden></aside>
        <div id="escHist"></div>
      </div>`;
  }

  function desenhar() {
    const painel = (typeof el !== 'undefined' && el.leftPanel) || document.getElementById('leftPanel');
    if (!painel || !ativa()) return;
    const s = ui.snap;
    if (!s) { painel.innerHTML = `<div class="empty-state"><p><strong>Escritório indisponível.</strong> ${esc(ui.erro || '')}</p></div>`; return; }
    let cena = painel.querySelector('#escCena');
    if (!cena) {
      painel.innerHTML = esqueleto();
      cena = painel.querySelector('#escCena');
      cartoes.clear(); rotulos.clear(); contadores.clear(); losangos.clear(); selos.clear();
      montarCena(cena.querySelector('#escPalco'));
    }
    const dir = window.Planta ? window.Planta.dirigir(s) : null;
    atualizarHud(cena, s);
    atualizarCartoes(cena, s);
    atualizarGaveta(cena, s);
    cena.querySelector('#escHist').innerHTML = ui.historico ? htmlHistorico(ui.historico) : '';
    ligarEventos(cena.querySelector('#escHist'));
    if (motor && dir) {
      motor.atualizar(dir, { concluidas: new Set(s.tarefas.filter((t) => t.estado === 'concluida').map((t) => t.id)) });
      atualizarContadores(dir);
    }
  }

  // ----- a cena -----
  function montarCena(palco) {
    if (!window.hubEscritorioCena || !window.Planta) { palco.insertAdjacentHTML('beforeend', '<div class="esc-sem-cena">A cena não carregou (escritorio-cena.js ou planta.js ausentes).</div>'); return; }
    if (motor) {
      // Voltando de outra tela: o mesmo canvas, o mesmo contexto.
      palco.insertBefore(motor.canvas, palco.firstChild);
      motor.redimensionar();
      motor.ligar();
      return;
    }
    const aoFalhar = (e) => logar(`Escritório: o 3D não abriu (${e && e.message ? e.message : e}); a planta em 2D cobre.`, 'warn');
    motor = window.hubEscritorioCena.montar(palco, { preferir: ui.motorPreferido, aoClicarFigura: (id) => { ui.gaveta = 'agente:' + id; desenhar(); }, aoViajar: atualizarSelosDeViagem, aoEscalar: aoEscalar, aoFalhar });
    palco.insertBefore(motor.canvas, palco.firstChild);
    if (ui.motorPreferido === '3d' && motor.tipo === '2d') logar('Escritório: sem WebGL nesta máquina; a planta em 2D cobre.', 'warn');
    motor.ligar();
    window.addEventListener('resize', () => { if (motor && ativa()) motor.redimensionar(); });
  }
  function trocarMotor(tipo) {
    ui.motorPreferido = tipo;
    gravarPrefs();
    const palco = document.getElementById('escPalco');
    if (!palco) return;
    if (motor) { motor.destruir(); motor = null; }
    cartoes.clear(); rotulos.clear(); contadores.clear(); losangos.clear(); selos.clear();
    const overlay = palco.querySelector('#escOverlay');
    if (overlay) overlay.innerHTML = '';
    montarCena(palco);
    desenhar();
  }

  // ----- HUD -----
  function atualizarHud(cena, s) {
    const pendAbertas = s.pendencias.filter((p) => p.status !== 'fechada');
    const abertas = s.tarefas.filter((t) => !['concluida', 'ignorada'].includes(t.estado));
    const modo = !s.ligado.geral ? 'MANUAL' : s.ligado.observacao ? 'OBSERVAÇÃO' : 'AUTOMÁTICO';
    const v = s.ultimaVarredura;
    const trabalhando = s.agentes.filter((a) => a.estado === 'trabalhando').length;
    cena.querySelector('#escHudTopo').innerHTML = `
      <button class="esc-menu-btn" id="escMenuBtn" title="Menu do Hub (ou encoste o mouse na borda esquerda)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <div class="esc-titulo">
        <div class="esc-titulo-linha"><span class="home-hi__ola">Escritório</span><span class="home-pill ${s.ligado.geral ? (s.ligado.observacao ? 'cyan' : '') : 'dim'}">${modo}</span><span class="home-pill ${pendAbertas.length ? 'warn' : 'dim'}">${pendAbertas.length} pendência(s)</span></div>
        <div class="home-hi__sub">01 / SALA DE COMANDO · ${esc((s.orquestrador && s.orquestrador.nome) || 'Odin')}, o orquestrador${s.modelo.configurado ? ` · ${esc(s.modelo.orquestrador)}` : ' · sem modelo'} · ${v ? `última varredura ${hora(v.quando)}${v.ok === false ? ' · falhou: ' + esc(v.erro || '') : ''}` : 'nenhuma varredura ainda'}${s.rodando ? ' · <b class="esc-vivo">varrendo…</b>' : ''}${trabalhando ? ` · ${trabalhando} trabalhando` : ''}</div>
      </div>`;
    cena.querySelector('#escHudComando').innerHTML = `
      <div class="esc-hud-switches">
        <label class="esc-switch mini ${s.ligado.geral ? 'on' : ''}" title="Lê a fila a cada 5 min e encaminha sozinho"><input type="checkbox" id="escGeral" ${s.ligado.geral ? 'checked' : ''}><span class="esc-switch-k"></span><span><b>Automático</b></span></label>
        <label class="esc-switch mini ${s.ligado.observacao ? 'on' : ''}" title="Só anota o que faria; nada executa"><input type="checkbox" id="escObs" ${s.ligado.observacao ? 'checked' : ''}><span class="esc-switch-k"></span><span><b>Observação</b></span></label>
        <label class="esc-switch mini ${s.modelo.ligado ? 'on' : ''}" title="${s.modelo.temChave ? 'Ligado, o que a triagem não reconhece vai ao Gemini (custa tokens). Desligado, vira pendência e você ensina pela regra.' : 'Sem chave do Gemini gravada: ligar não chama nada. Configure em Configurações › Escritório & IA.'}"><input type="checkbox" id="escModelo" ${s.modelo.ligado ? 'checked' : ''}><span class="esc-switch-k"></span><span><b>Gemini</b><small>${s.modelo.ligado ? (s.modelo.temChave ? 'ligado' : 'sem chave') : 'sem custo'}</small></span></label>
      </div>
      <div class="esc-hud-botoes">
        <button class="btn compact ghost" id="escRodar" ${s.rodando ? 'disabled' : ''}>${s.rodando ? 'varrendo…' : 'Rodar agora'}</button>
        <button class="btn compact danger" id="escFreio" title="Desliga o modo automático e, se houver publicação no meio, interrompe (ADR-102)">Freio</button>
      </div>`;
    const g = ui.gaveta || '';
    const aba = (id, nome, n) => `<button class="esc-rodape-btn ${g === id ? 'active' : ''}" data-gaveta="${id}">${nome}${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
    cena.querySelector('#escHudRodape').innerHTML = `
      <div class="esc-rodape-grupo">
        <button class="esc-rodape-btn ${ui.paineis ? 'active' : ''}" id="escPaineis" title="Mostra ou esconde os cartões dos agentes"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>${ui.paineis ? 'Esconder painéis' : 'Mostrar painéis'}</button>
      </div>
      <div class="esc-rodape-grupo">
        ${aba('pendencias', 'Pendências', pendAbertas.length)}
        ${aba('fila', 'Fila', abertas.length)}
        ${aba('regras', 'Regras', s.regras.length)}
        ${aba('historico', 'Concluídas', null)}
        ${aba('comando', 'Comando', null)}
        <button class="esc-rodape-btn ${appEl() && appEl().classList.contains('esc-terminal') ? 'active' : ''}" id="escTerminal" title="A Atividade (o log do Hub) por cima da cena">Atividade</button>
      </div>
      <div class="esc-rodape-grupo">
        <button class="esc-rodape-btn" id="escRecentrar" title="Volta ao enquadramento inicial (ou duplo clique na cena)">⌖ Recentrar</button>
        <button class="esc-rodape-btn" id="escMotor" title="${motor && motor.tipo === '3d' ? 'Trocar para a planta em 2D (mais leve)' : 'Tentar o 3D (precisa de WebGL)'}">${motor && motor.tipo === '3d' ? '3D' : '2D'}</button>
      </div>`;
    ligarEventos(cena.querySelector('#escHudTopo'));
    ligarEventos(cena.querySelector('#escHudComando'));
    ligarEventos(cena.querySelector('#escHudRodape'));
  }

  // ----- os cartões presos às figuras, os losangos e os rótulos das salas -----
  // O ícone da função, como na referência: o do primeiro módulo do agente (os
  // mesmos da barra lateral); o Odin leva o do Escritório.
  function iconeDaFigura(a) {
    const icones = typeof NAV_ICON !== 'undefined' ? NAV_ICON : null;
    if (!icones) return `<b>${esc((a.nome || '?').charAt(0))}</b>`;
    if (a.id === 'orquestrador') return icones.escritorio || '';
    const modulo = (a.modulos || [])[0];
    const chave = modulo === 'newproject' ? 'google' : modulo;
    return icones[chave] || `<b>${esc((a.nome || '?').charAt(0))}</b>`;
  }
  // Nome curto da tarefa e para onde ela vai, para o selo que viaja com ela.
  function textoDoSelo(t, s) {
    if (!t) return '';
    const assunto = String(t.assunto || '').replace(/\s+/g, ' ').trim();
    const curto = assunto.length > 34 ? assunto.slice(0, 33) + '…' : assunto;
    const ag = t.agente ? s.agentes.find((a) => a.id === t.agente) : null;
    const destino = t.estado === 'pendente' ? 'reunião' : ag ? ag.nome : ((s.orquestrador && s.orquestrador.nome) || 'Odin');
    return `${curto} → ${destino}`;
  }
  // A cena avisa quando os cartões ficam pequenos demais para o papel e a
  // função: viram compactos (avatar e nome), e voltam quando sobra espaço.
  function aoEscalar(e) {
    const overlay = document.getElementById('escOverlay');
    if (overlay) overlay.classList.toggle('compacto', !!(e && e.compacto));
  }
  // Os selos dos pacotes em viagem: a cena avisa quando o conjunto muda.
  function atualizarSelosDeViagem(ids) {
    const overlay = document.getElementById('escOverlay');
    if (!overlay || !motor) return;
    const vivos = new Set(ids);
    for (const [id, el] of selos) if (!vivos.has(id)) { el.remove(); selos.delete(id); motor.ancorar('pacote:' + id, null); }
    for (const id of ids) {
      if (selos.has(id)) continue;
      const t = ui.snap && ui.snap.tarefas.find((x) => x.id === id);
      const el = document.createElement('div');
      el.className = 'esc-selo viagem';
      el.dataset.pacote = id;
      el.textContent = textoDoSelo(t, ui.snap || { agentes: [] });
      overlay.appendChild(el);
      selos.set(id, el);
      motor.ancorar('pacote:' + id, el, 0.7);
    }
  }
  function atualizarCartoes(cena, s) {
    const overlay = cena.querySelector('#escOverlay');
    if (!overlay) return;
    overlay.classList.toggle('sem-paineis', !ui.paineis);
    const figuras = [{ id: 'orquestrador', nome: (s.orquestrador && s.orquestrador.nome) || 'Odin', papel: (s.orquestrador && s.orquestrador.papel) || 'Orquestrador', modo: 'orquestrador', estado: s.rodando ? 'trabalhando' : s.pendencias.some((p) => p.status !== 'fechada' && !p.agente && p.tipo !== 'sugestao') ? 'aguardando' : 'ocioso', atividade: s.rodando ? 'lendo a fila' : '', sala: { numero: '01', nome: 'SALA DE COMANDO' }, ligado: true, tarefas: s.tarefas.filter((t) => ['na_fila', 'em_analise', 'escalada'].includes(t.estado)).length }, ...s.agentes];
    const vistos = new Set();
    for (const a of figuras) {
      vistos.add(a.id);
      let c = cartoes.get(a.id);
      if (!c) {
        c = document.createElement('button');
        c.className = 'esc-agente';
        c.dataset.agente = a.id;
        c.addEventListener('click', () => { ui.gaveta = 'agente:' + a.id; desenhar(); });
        overlay.appendChild(c);
        cartoes.set(a.id, c);
        if (motor) motor.ancorar(a.id, c, ALTURA_CARTAO, { empurrar: true });
      }
      let l = losangos.get(a.id);
      if (!l) {
        l = document.createElement('div');
        l.className = 'esc-losango';
        l.dataset.losango = a.id;
        l.innerHTML = iconeDaFigura(a);
        overlay.appendChild(l);
        losangos.set(a.id, l);
        if (motor) motor.ancorar('losango:' + a.id, l, ALTURA_LOSANGO, { centro: true });
      }
      l.className = `esc-losango ${a.modo} est-${esc(a.estado)}`;
      const [rot, tom] = ESTADO_AGENTE[a.estado] || [a.estado, 'neutral'];
      c.className = `esc-agente ${a.modo} est-${esc(a.estado)} ${ui.gaveta === 'agente:' + a.id ? 'aberto' : ''}`;
      c.title = `${a.nome} · ${a.papel}${a.modulosNomes ? ' · ' + a.modulosNomes : ''} · ${rot}`;
      c.innerHTML = `
        <span class="esc-agente-avatar">${esc((a.nome || '?').charAt(0))}</span>
        <span class="esc-agente-texto">
          <span class="esc-agente-nome">${esc(a.nome)}<span class="esc-agente-papel"> · ${esc(a.papel || '')}</span></span>
          <span class="esc-agente-funcao">${esc(a.funcao || (a.sala ? a.sala.nome : ''))}</span>
          ${a.estado === 'trabalhando' ? `<span class="esc-agente-atividade">${esc(a.atividade || 'trabalhando')}</span>` : a.estado === 'aguardando' ? '<span class="esc-agente-atividade aguarda">aguardando você</span>' : a.estado === 'erro' ? '<span class="esc-agente-atividade erro">com erro</span>' : ''}
        </span>
        <span class="esc-agente-dot ${tom}"></span>`;
    }
    for (const [id, c] of cartoes) if (!vistos.has(id)) { c.remove(); cartoes.delete(id); if (motor) motor.ancorar(id, null); }
    for (const [id, l] of losangos) if (!vistos.has(id)) { l.remove(); losangos.delete(id); if (motor) motor.ancorar('losango:' + id, null); }
    if (window.Planta && !rotulos.size) {
      for (const sl of window.Planta.SALAS) {
        const r = document.createElement('div');
        r.className = 'esc-sala-rotulo';
        r.dataset.sala = sl.numero;
        r.textContent = `${sl.numero} / ${sl.nome}`;
        overlay.appendChild(r);
        rotulos.set(sl.numero, r);
        if (motor) motor.ancorar('sala:' + sl.numero, r, 0, { fixo: true });
      }
    }
  }
  // "+n" em cima da mesa que tem mais tarefas do que cabem.
  function atualizarContadores(dir) {
    const overlay = document.getElementById('escOverlay');
    if (!overlay) return;
    const vistos = new Set();
    for (const l of dir.lugares) {
      if (l.total <= l.visiveis) continue;
      vistos.add(l.lugar);
      let c = contadores.get(l.lugar);
      if (!c) { c = document.createElement('div'); c.className = 'esc-lugar-n'; overlay.appendChild(c); contadores.set(l.lugar, c); if (motor) motor.ancorar('lugar:' + l.lugar, c, 0); }
      c.textContent = `+${l.total - l.visiveis}`;
      c.title = `${l.total} tarefa(s) nesta mesa`;
    }
    for (const [lugar, c] of contadores) if (!vistos.has(lugar)) { c.remove(); contadores.delete(lugar); if (motor) motor.ancorar('lugar:' + lugar, null); }
  }

  // ----- a gaveta -----
  function atualizarGaveta(cena, s) {
    const gaveta = cena.querySelector('#escGaveta');
    if (!gaveta) return;
    if (!ui.gaveta) { gaveta.hidden = true; gaveta.innerHTML = ''; return; }
    const pendAbertas = s.pendencias.filter((p) => p.status !== 'fechada');
    const abertas = s.tarefas.filter((t) => !['concluida', 'ignorada'].includes(t.estado));
    let titulo = '', corpo = '';
    if (ui.gaveta === 'pendencias') { titulo = `Pendências <span class="n">${pendAbertas.length}</span>`; corpo = htmlPendencias(pendAbertas); }
    else if (ui.gaveta === 'fila') { titulo = `Fila de tarefas <span class="n">${abertas.length}</span>`; corpo = htmlFila(abertas); }
    else if (ui.gaveta === 'regras') { titulo = `Regras aprendidas <span class="n">${s.regras.length}</span>`; corpo = htmlRegras(s.regras); }
    else if (ui.gaveta === 'historico') { titulo = 'Concluídas e ignoradas'; corpo = htmlFila(s.tarefas.filter((t) => ['concluida', 'ignorada'].includes(t.estado)), true); }
    else if (ui.gaveta === 'comando') { titulo = 'Comando'; corpo = htmlComando(s); }
    else if (ui.gaveta.startsWith('agente:')) { const r = htmlAgente(s, ui.gaveta.slice(7)); titulo = r.titulo; corpo = r.corpo; }
    gaveta.hidden = false;
    gaveta.innerHTML = `<div class="esc-gaveta-head"><span class="sec-title">${titulo}</span><button class="text-btn" id="escGavetaFechar" title="Fechar (Esc)">fechar</button></div><div class="esc-gaveta-corpo">${corpo}</div>`;
    ligarEventos(gaveta);
  }

  function htmlComando(s) {
    const abertas = s.tarefas.filter((t) => !['concluida', 'ignorada'].includes(t.estado));
    return `<div class="sec esc-comando">
      <div class="esc-switches">
        <label class="esc-switch ${s.ligado.geral ? 'on' : ''}"><input type="checkbox" data-ligar="geral" ${s.ligado.geral ? 'checked' : ''}><span class="esc-switch-k"></span><span><b>Modo automático</b><small>lê a fila a cada 5 min e encaminha sozinho</small></span></label>
        <label class="esc-switch ${s.ligado.observacao ? 'on' : ''}"><input type="checkbox" data-ligar="observacao" ${s.ligado.observacao ? 'checked' : ''}><span class="esc-switch-k"></span><span><b>Modo observação</b><small>só anota o que faria; nada executa</small></span></label>
        <label class="esc-switch ${s.modelo.ligado ? 'on' : ''}"><input type="checkbox" data-ligar="modelo" ${s.modelo.ligado ? 'checked' : ''}><span class="esc-switch-k"></span><span><b>Perguntar ao Gemini</b><small>${s.modelo.ligado ? (s.modelo.temChave ? 'o que a triagem não reconhece vai ao modelo' : 'ligado, mas sem chave: não chama') : 'desligado: sem custo; o desconhecido vira pendência'}</small></span></label>
        <div class="esc-stat"><b>${s.contadores.chamadas}</b><small>chamadas ao modelo hoje</small></div>
        <div class="esc-stat"><b>${fmtK(s.contadores.tokensEntrada + s.contadores.tokensSaida + s.contadores.tokensPensamento)}</b><small>tokens hoje</small></div>
        <div class="esc-stat"><b>${abertas.length}</b><small>tarefa(s) em aberto</small></div>
        <div class="esc-stat"><b>${s.regras.filter((r) => r.ativa !== false).length}</b><small>regra(s) ativa(s)</small></div>
      </div>
      ${linhaEsperas()}
      ${!s.modelo.configurado ? '<p class="hint mt8">Sem modelo: tarefa que a triagem não reconhece vira pendência, e você decide uma vez (Ignorar sempre, Avisar sempre, Encaminhar sempre). Os agentes não usam modelo nunca.</p>' : ''}
    </div>
    <div class="home-sec-title">Agentes <span class="r">${s.agentes.filter((a) => a.modo === 'auto').length} automáticos · ${s.agentes.filter((a) => a.modo === 'standby').length} em standby</span></div>
    <div class="esc-agentes">${s.agentes.map(cardAgente).join('')}</div>`;
  }

  function htmlAgente(s, id) {
    if (id === 'orquestrador') {
      const naMesa = s.tarefas.filter((t) => ['na_fila', 'em_analise', 'escalada'].includes(t.estado));
      const pend = s.pendencias.filter((p) => p.status !== 'fechada' && !p.agente);
      return { titulo: `${esc((s.orquestrador && s.orquestrador.nome) || 'Odin')} · Orquestrador`, corpo: `
        <p class="esc-pergunta">${esc((s.orquestrador && s.orquestrador.descricao) || 'Lê a fila, decide e distribui; vê tudo da Sala de Comando.')}</p>
        <div class="esc-pend-acoes"><button class="btn compact ghost" data-gaveta="comando">Abrir o Comando</button><button class="btn compact ghost" id="escRodar2" ${s.rodando ? 'disabled' : ''}>${s.rodando ? 'varrendo…' : 'Rodar agora'}</button></div>
        <div class="home-sec-title">Na mesa dele <span class="r">${naMesa.length} tarefa(s) · ${pend.length} pendência(s) sem agente</span></div>
        ${htmlFila(naMesa)}
        ${pend.length ? htmlPendencias(pend) : ''}` };
    }
    const a = s.agentes.find((x) => x.id === id);
    if (!a) return { titulo: 'Agente', corpo: '<div class="empty-state"><p>Agente não encontrado.</p></div>' };
    const minhas = s.tarefas.filter((t) => t.agente === a.id && !['concluida', 'ignorada'].includes(t.estado));
    const feitas = s.tarefas.filter((t) => t.agente === a.id && t.estado === 'concluida').slice(0, 10);
    const pend = s.pendencias.filter((p) => p.status !== 'fechada' && p.agente === a.id);
    return { titulo: `${esc(a.nome)} · ${esc(a.papel || '')}`, corpo: `
      <div class="esc-agentes um">${cardAgente(a)}</div>
      ${pend.length ? `<div class="home-sec-title">Pendências <span class="r">${pend.length}</span></div>${htmlPendencias(pend)}` : ''}
      <div class="home-sec-title">Tarefas em aberto <span class="r">${minhas.length}</span></div>
      ${htmlFila(minhas)}
      ${feitas.length ? `<div class="home-sec-title">Últimas concluídas</div>${htmlFila(feitas, true)}` : ''}` };
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

  function cardAgente(a) {
    const [rot, tom] = ESTADO_AGENTE[a.estado] || [a.estado, 'neutral'];
    return `<div class="esc-agente-card ${a.modo} est-${esc(a.estado)}" data-agente-card="${esc(a.id)}">
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

  // As opções do "Encaminhar sempre": um agente, ou um agente com um preset
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

  function htmlPendencias(lista) {
    if (!lista.length) return '<div class="empty-state"><p><strong>Nenhuma pendência.</strong> O orquestrador não tem pergunta para você.</p></div>';
    const s = ui.snap;
    return lista.map((p) => {
      const tarefas = p.tarefas.map((id) => s.tarefas.find((t) => t.id === id)).filter(Boolean);
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
            <span class="esc-encaminhar"><select data-agente-sel>${opcoesEncaminhar(agentesAuto, '')}</select>
            <button class="btn compact ghost" data-acao="encaminhar" title="Propõe uma regra para encaminhar sempre">Encaminhar sempre</button>
            <button class="btn compact ghost" data-acao="so-desta-vez" title="Encaminha só estas, sem regra">Só desta vez</button></span>
            <button class="btn compact ghost" data-acao="ignorar-estas" title="Só estas tarefas">Ignorar estas</button>` : ''}
          ${p.tipo === 'pergunta' ? `
            <input type="text" class="esc-resposta" placeholder="Responda em texto (o modelo propõe a regra) ou use os botões" data-texto>
            <button class="btn compact primary" data-acao="texto">Responder</button>
            <button class="btn compact ghost" data-acao="ignorar-estas" title="Só estas tarefas">Ignorar estas</button>
            <button class="btn compact ghost" data-acao="ignorar-sempre" title="Propõe uma regra para ignorar sempre tarefas assim">Ignorar sempre</button>
            <button class="btn compact ghost" data-acao="avisar-sempre" title="Propõe uma regra: pedidos assim sempre vêm para você, sem passar pelo modelo">Avisar sempre</button>
            <span class="esc-encaminhar"><select data-agente-sel>${opcoesEncaminhar(agentesAuto, p.agente || '')}</select>
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
  async function freio() {
    // Desliga o modo automático (nada novo começa) e, se há uma publicação
    // no meio, puxa o freio do Hub (ADR-102), que o próprio fluxo solta ao
    // terminar de parar.
    const publicando = typeof pub !== 'undefined' && pub && (pub.emAndamento || pub.rodando);
    if (publicando && typeof pararAgora === 'function') { try { pararAgora(); } catch (e) {} }
    logar(`Freio: modo automático desligado${publicando ? '; interrompendo a publicação em andamento' : ''}.`, 'warn');
    await chamar('escritorioLigar', { geral: false });
  }
  function alternarTerminal() {
    const app = appEl();
    if (!app) return;
    const aberto = app.classList.contains('esc-terminal') && (typeof terminais === 'undefined' || terminais.atividade === 'aberto');
    if (aberto) app.classList.remove('esc-terminal');
    else { app.classList.add('esc-terminal'); if (typeof mudarAtividade === 'function' && typeof terminais !== 'undefined' && terminais.atividade !== 'aberto') mudarAtividade('aberto'); }
    // Só o botão muda de cara: redesenhar o rodapé no meio do clique trocaria o
    // elemento clicado por outro.
    const b = document.getElementById('escTerminal');
    if (b) b.classList.toggle('active', app.classList.contains('esc-terminal'));
  }

  // Liga os eventos de um pedaço da tela (HUD, gaveta ou histórico): cada
  // seletor só acha o que está dentro daquele pedaço.
  function ligarEventos(raiz) {
    if (!raiz) return;
    const painel = raiz;
    painel.querySelector('#escMenuBtn')?.addEventListener('click', () => appEl()?.classList.toggle('menu-aberto'));
    painel.querySelector('#escRodar')?.addEventListener('click', async () => { ui.snap.rodando = true; desenhar(); await chamar('escritorioRodar'); });
    painel.querySelector('#escRodar2')?.addEventListener('click', async () => { ui.snap.rodando = true; desenhar(); await chamar('escritorioRodar'); });
    painel.querySelector('#escFreio')?.addEventListener('click', freio);
    painel.querySelector('#escGeral')?.addEventListener('change', (e) => chamar('escritorioLigar', { geral: e.target.checked }));
    painel.querySelector('#escObs')?.addEventListener('change', (e) => chamar('escritorioLigar', { observacao: e.target.checked }));
    painel.querySelector('#escModelo')?.addEventListener('change', (e) => chamar('iaUsarModelo', { ligar: e.target.checked }));
    painel.querySelectorAll('[data-ligar]').forEach((c) => c.addEventListener('change', (e) => { const k = c.dataset.ligar; if (k === 'modelo') chamar('iaUsarModelo', { ligar: e.target.checked }); else chamar('escritorioLigar', { [k]: e.target.checked }); }));
    painel.querySelector('#escPaineis')?.addEventListener('click', () => { ui.paineis = !ui.paineis; gravarPrefs(); desenhar(); });
    painel.querySelector('#escTerminal')?.addEventListener('click', alternarTerminal);
    painel.querySelector('#escRecentrar')?.addEventListener('click', () => { if (motor) motor.recentrar(); });
    painel.querySelector('#escMotor')?.addEventListener('click', () => trocarMotor(motor && motor.tipo === '3d' ? '2d' : '3d'));
    painel.querySelector('#escGavetaFechar')?.addEventListener('click', () => { ui.gaveta = null; ui.editando = null; desenhar(); });
    painel.querySelectorAll('[data-gaveta]').forEach((b) => b.addEventListener('click', () => { const g = b.dataset.gaveta; ui.gaveta = ui.gaveta === g ? null : g; ui.editando = null; desenhar(); }));
    painel.querySelectorAll('[data-agente-toggle]').forEach((c) => c.addEventListener('change', (e) => chamar('escritorioLigar', { agente: c.dataset.agenteToggle, valor: e.target.checked })));
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
      if (acao === 'encaminhar') { const e = lerEncaminhar(pendEl.querySelector('[data-agente-sel]'), ui.snap.agentes); await chamar('escritorioResponder', { id, resposta: { acao: 'encaminhar', agente: e.agente, parametros: e.parametros } }); return; }
      if (acao === 'so-desta-vez') { const e = lerEncaminhar(pendEl.querySelector('[data-agente-sel]'), ui.snap.agentes); await chamar('escritorioAplicarSemRegra', { id, agente: e.agente, parametros: e.parametros }); return; }
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
    lerPrefs();
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

  // Os módulos acionados pela mão avisam quando começam e terminam (ADR-152):
  // o cartão do agente mostra "trabalhando" com o módulo.
  window.hubEscritorioAtividade = function (agente, ligado, detalhe) {
    if (!api().escritorioAtividade) return;
    api().escritorioAtividade({ agente, ligado: !!ligado, detalhe: detalhe || '' }).catch(() => {});
  };

  window.hubEscritorio = { ui, carregar, desenhar, abrir, lerFormRegra, atenderPonte, get motor() { return motor; }, trocarMotor };
})();
