// O mapa de fluxo do Escritório (ADR-157): a segunda visão, inspirada na tela
// "SQUAD" do vídeo de referência. Odin no centro, cada agente num hexágono em
// volta, uma linha de Odin a cada um, mais grossa quanto mais tarefas abertas
// o agente tem. Quando uma tarefa é encaminhada, um pulso corre de Odin ao
// agente; quando é concluída, volta verde. SVG puro, sem dependência; o laço
// de quadros só gira enquanto há pulso correndo (ADR-126).
//
// `montar(host, { aoClicarFigura })` desenha; `atualizar(snapshot)` compara
// com o snapshot anterior e dispara os pulsos; `desligar()` para o laço.
(function () {
  'use strict';
  if (window.hubEscritorioMapa) return;

  const NS = 'http://www.w3.org/2000/svg';
  const LARGURA = 1000, ALTURA = 640, CENTRO = { x: 500, y: 330 }, RAIO = 235;
  const COR = { ocioso: '#3ee97d', trabalhando: '#22f2ef', aguardando: '#f2c155', erro: '#ff6b6b', standby: '#4f7d69', desligado: '#1e5443', orquestrador: '#f2c155', ok: '#3ee97d' };
  const PULSO_MS = 1400;
  const ABERTAS_DO_AGENTE = ['planejada', 'aguardando_confirmacao', 'executando', 'falhou', 'aguardando_externo', 'pendente'];

  const el = (tag, attrs, pai) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v)); if (pai) pai.appendChild(e); return e; };
  const hexagono = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i - Math.PI / 6; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');

  function montar(host, opcoes) {
    const op = opcoes || {};
    const svg = el('svg', { viewBox: `0 0 ${LARGURA} ${ALTURA}`, class: 'esc-mapa-svg', preserveAspectRatio: 'xMidYMid meet' });
    host.appendChild(svg);
    const gFundo = el('g', { class: 'esc-mapa-fundo' }, svg);
    const gLinhas = el('g', { class: 'esc-mapa-linhas' }, svg);
    const gPulsos = el('g', { class: 'esc-mapa-pulsos' }, svg);
    const gNos = el('g', { class: 'esc-mapa-nos' }, svg);
    // A grade de hexágonos do fundo, bem apagada.
    for (let y = 40; y < ALTURA; y += 70) for (let x = 40 + ((y / 70) % 2) * 40; x < LARGURA; x += 80) el('polygon', { points: hexagono(x, y, 36), class: 'esc-mapa-celula' }, gFundo);

    const nos = new Map();     // id → { g, hex, contador, pos, estado }
    const linhas = new Map();  // id → path
    const pulsos = [];         // { de, para, cor, t0 }
    let anterior = null, raf = 0, ultimoQuadro = 0;
    const posDe = (i, n) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n); return { x: CENTRO.x + RAIO * Math.cos(a), y: CENTRO.y + RAIO * Math.sin(a) }; };

    function no(id, pos, r) {
      const g = el('g', { class: 'esc-mapa-no', 'data-no': id, transform: `translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})` }, gNos);
      const hex = el('polygon', { points: hexagono(0, 0, r), class: 'esc-mapa-hex' }, g);
      const inicial = el('text', { class: 'esc-mapa-inicial', 'text-anchor': 'middle', y: r * 0.18 }, g);
      const nome = el('text', { class: 'esc-mapa-nome', 'text-anchor': 'middle', y: r + 20 }, g);
      const papel = el('text', { class: 'esc-mapa-papel', 'text-anchor': 'middle', y: r + 34 }, g);
      const badge = el('g', { class: 'esc-mapa-badge', transform: `translate(${(r * 0.75).toFixed(1)}, ${(-r * 0.8).toFixed(1)})` }, g);
      el('circle', { r: 11 }, badge);
      const n = el('text', { 'text-anchor': 'middle', y: 4 }, badge);
      g.addEventListener('click', () => { if (op.aoClicarFigura) op.aoClicarFigura(id); });
      const item = { g, hex, inicial, nome, papel, badge, n, pos, r };
      nos.set(id, item);
      return item;
    }

    function atualizar(s) {
      if (!s) return;
      const agentes = Array.isArray(s.agentes) ? s.agentes : [];
      const tarefas = Array.isArray(s.tarefas) ? s.tarefas : [];
      const pend = (Array.isArray(s.pendencias) ? s.pendencias : []).filter((p) => p && p.status !== 'fechada').length;
      // Odin.
      let odin = nos.get('orquestrador');
      if (!odin) odin = no('orquestrador', CENTRO, 52);
      const odinEstado = s.rodando ? 'trabalhando' : pend ? 'aguardando' : 'ocioso';
      odin.g.setAttribute('class', `esc-mapa-no orquestrador est-${odinEstado}`);
      odin.hex.setAttribute('stroke', odinEstado === 'ocioso' ? COR.orquestrador : COR[odinEstado]);
      odin.inicial.textContent = ((s.orquestrador && s.orquestrador.nome) || 'Odin').charAt(0);
      odin.nome.textContent = (s.orquestrador && s.orquestrador.nome) || 'Odin';
      odin.papel.textContent = s.rodando ? 'lendo a fila' : pend ? `${pend} pendência(s)` : 'orquestrador';
      const naMesa = tarefas.filter((t) => ['na_fila', 'em_analise', 'escalada'].includes(t.estado)).length;
      odin.badge.style.display = naMesa ? '' : 'none';
      odin.n.textContent = String(naMesa);
      // Agentes, em roda.
      const vistos = new Set(['orquestrador']);
      agentes.forEach((a, i) => {
        vistos.add(a.id);
        const pos = posDe(i, agentes.length);
        let item = nos.get(a.id);
        if (!item) item = no(a.id, pos, 38);
        else if (item.pos.x !== pos.x || item.pos.y !== pos.y) { item.pos = pos; item.g.setAttribute('transform', `translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`); }
        const abertas = tarefas.filter((t) => t.agente === a.id && ABERTAS_DO_AGENTE.includes(t.estado)).length;
        item.g.setAttribute('class', `esc-mapa-no ${a.modo} est-${a.estado}`);
        item.hex.setAttribute('stroke', COR[a.estado] || COR.ocioso);
        item.inicial.textContent = (a.nome || '?').charAt(0);
        item.nome.textContent = a.nome || a.id;
        item.papel.textContent = a.estado === 'trabalhando' ? (a.atividade || 'trabalhando') : a.estado === 'aguardando' ? 'aguardando você' : (a.papel || '');
        item.badge.style.display = abertas ? '' : 'none';
        item.n.textContent = String(abertas);
        let linha = linhas.get(a.id);
        if (!linha) { linha = el('path', { class: 'esc-mapa-linha', 'data-linha': a.id }, gLinhas); linhas.set(a.id, linha); }
        linha.setAttribute('d', curva(CENTRO, pos));
        linha.setAttribute('stroke-width', String(1 + Math.min(4, abertas)));
        linha.setAttribute('class', `esc-mapa-linha ${a.modo} est-${a.estado}`);
      });
      for (const [id, item] of nos) if (!vistos.has(id)) { item.g.remove(); nos.delete(id); const l = linhas.get(id); if (l) { l.remove(); linhas.delete(id); } }
      // Os pulsos: o que mudou de mãos desde o snapshot anterior.
      if (anterior) {
        const antes = new Map(anterior.tarefas.map((t) => [t.id, t]));
        for (const t of tarefas) {
          const a = antes.get(t.id);
          const chegouNoAgente = t.agente && ['planejada', 'executando', 'aguardando_confirmacao'].includes(t.estado) && (!a || a.agente !== t.agente || ['na_fila', 'em_analise', 'pendente', 'escalada'].includes(a.estado));
          if (chegouNoAgente && nos.has(t.agente)) pulsar('orquestrador', t.agente, COR.trabalhando);
          const concluiu = t.estado === 'concluida' && a && a.estado !== 'concluida';
          if (concluiu && t.agente && nos.has(t.agente)) pulsar(t.agente, 'orquestrador', COR.ok);
        }
      }
      anterior = { tarefas: tarefas.map((t) => ({ id: t.id, agente: t.agente, estado: t.estado })) };
    }
    function curva(a, b) { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const dx = b.y - a.y, dy = a.x - b.x; const k = 0.12; return `M ${a.x} ${a.y} Q ${(mx + dx * k).toFixed(1)} ${(my + dy * k).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`; }
    function pontoNaCurva(a, b, t) { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const cx = mx + (b.y - a.y) * 0.12, cy = my + (a.x - b.x) * 0.12; const u = 1 - t; return { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y }; }

    function pulsar(de, para, cor) {
      const p = { de, para, cor, t0: performance.now(), el: el('circle', { r: 6, fill: cor, class: 'esc-mapa-pulso' }, gPulsos) };
      pulsos.push(p);
      pedir();
    }
    const visivel = () => !document.hidden && !document.documentElement.classList.contains('sem-foco') && host.isConnected && !host.hidden;
    function quadro(ts) {
      raf = 0;
      if (!visivel()) return;
      if (ts - ultimoQuadro < 32) { raf = requestAnimationFrame(quadro); return; }
      ultimoQuadro = ts;
      for (let i = pulsos.length - 1; i >= 0; i--) {
        const p = pulsos[i];
        const k = (ts - p.t0) / PULSO_MS;
        const de = nos.get(p.de), para = nos.get(p.para);
        if (k >= 1 || !de || !para) { p.el.remove(); pulsos.splice(i, 1); continue; }
        const pt = pontoNaCurva(de.pos, para.pos, k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
        p.el.setAttribute('cx', pt.x.toFixed(1)); p.el.setAttribute('cy', pt.y.toFixed(1));
        p.el.setAttribute('opacity', String(1 - k * 0.6));
      }
      if (pulsos.length) raf = requestAnimationFrame(quadro);
    }
    const pedir = () => { if (!raf && pulsos.length && visivel()) raf = requestAnimationFrame(quadro); };
    const acordar = () => pedir();
    document.addEventListener('visibilitychange', acordar);
    window.addEventListener('focus', acordar);

    return {
      svg, atualizar, pulsar,
      get pulsos() { return pulsos.length; },
      get rodando() { return !!raf; },
      ligar() { pedir(); },
      desligar() { if (raf) cancelAnimationFrame(raf); raf = 0; },
      destruir() { this.desligar(); document.removeEventListener('visibilitychange', acordar); window.removeEventListener('focus', acordar); svg.remove(); },
    };
  }

  window.hubEscritorioMapa = { montar, COR, LARGURA, ALTURA };
})();
