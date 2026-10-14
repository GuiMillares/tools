// A cena do Escritório (ADR-153): o escritório em 3D isométrico, de tela
// cheia, onde cada agente é uma figura na própria sala, cada tarefa é um
// pacote em cima de uma mesa e o que muda de estado anda de um lugar ao
// outro pelo corredor (lib/escritorio/planta.js diz por onde). Três partes:
//
// - a SIMULAÇÃO (criarSimulacao): recebe o que o diretor da planta mandou
//   (onde cada figura e cada pacote deve estar), compara com onde está e
//   anda até lá; é compartilhada pelos dois motores e não sabe desenhar;
// - o MOTOR 3D (criarMotor3d): Three.js (renderer/vendor/three.min.js, build
//   clássico, sem módulo), câmera ortográfica, luz com sombra, vidro nas
//   paredes, monitores que acendem; pan, zoom e giro limitado pelo mouse;
// - o MOTOR 2D (criarMotor2d): a mesma planta em canvas 2D isométrico, para
//   quando o WebGL não existe (máquina sem GPU, modo seguro); ninguém fica
//   sem a tela.
//
// Nada roda para sempre (ADR-126): o laço de quadros só gira enquanto alguém
// anda, um ícone de trabalho gira ou a câmera se move, e para com a janela
// sem foco ou escondida; parado, a cena é desenhada uma vez e fica.
//
// Os cartões dos agentes e os rótulos das salas são HTML (a tela pede
// `ancorar(id, elemento, altura)`) e o motor os posiciona a cada quadro em
// cima do ponto 3D projetado: texto nítido, clicável, com o CSS do Hub.
(function () {
  'use strict';
  if (window.hubEscritorioCena) return;

  const CORES = {
    // Salas mais iluminadas (pedido de 14/10): piso das salas e tampos mais
    // claros que o corredor e o fundo, para a divisão entre salas aparecer.
    fundo: 0x040a0a, piso: 0x0a1a16, sala: 0x14362c, corredor: 0x0c211c, grade: 0x18453a, borda: 0x1e5443,
    parede: 0x22f2ef, mesa: 0x1a4238, mesaTampo: 0x245a4b, cadeira: 0x163b31, monitor: 0x0e241d, vaso: 0x1b2f2a, folha: 0x3aa86b,
    tela: { ligada: 0x3ee97d, trabalhando: 0x22f2ef, standby: 0x1e5443, desligada: 0x061210 },
    corpo: { auto: 0x1f6b47, standby: 0x2a4a3f, orquestrador: 0x8a6d2a }, cabeca: 0xd9c7a0,
    icone: { trabalho: 0x22f2ef, pergunta: 0xf2c155, erro: 0xff6b6b, fila: 0x3ee97d, ok: 0x3ee97d },
    pacote: { na_fila: 0x93b5a7, em_analise: 0x93b5a7, planejada: 0x22f2ef, aguardando_confirmacao: 0xf2c155, executando: 0x22f2ef, falhou: 0xff6b6b, aguardando_externo: 0x6aa3ff, escalada: 0xff6b6b, pendente: 0xf2c155, interrompida: 0xff6b6b },
  };
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const ALTURA_PAREDE = 1.5;
  const VELOCIDADE = 7;        // metros por segundo, andando
  const VELOCIDADE_PACOTE = 11; // o pacote voa mais rápido que a figura anda
  const FPS_MAX = 30;
  const DESLOCAMENTO_Y = 26;    // a cena fica este tanto de px abaixo do meio: sobra espaço aos cartões do fundo
  // Os cartões encolhem junto com a cena: tamanho cheio a partir de 24 px/m,
  // nunca menos que 55 %. (Numa janela de 1170 px a cena cabe com ~16 px/m.)
  const escalaDosCartoes = (zoom) => Math.max(0.55, Math.min(1, zoom / 24));
  const LIMIAR_COMPACTO = 0.75;  // abaixo disso o cartão mostra só avatar e nome

  // ---------- simulação ----------
  function criarSimulacao() {
    const Planta = window.Planta;
    const figuras = new Map();
    const pacotes = new Map();
    const pops = [];
    let relogio = 0;

    function andarAte(ent, alvo, velocidade) {
      const de = { x: ent.pos.x, z: ent.pos.z };
      ent.caminho = Planta.caminho(de, alvo);
      ent.alvo = alvo;
      ent.seg = 1;
      ent.velocidade = velocidade;
      ent.andando = ent.caminho.length > 1;
      if (!ent.andando) { ent.pos.x = alvo.x; ent.pos.z = alvo.z; if (alvo.rot != null) ent.rot = alvo.rot; }
    }
    const mesmoLugar = (a, b) => a && b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;

    // O que o diretor mandou: quem chegou aparece onde deve estar; quem já
    // estava e tem alvo novo anda até lá; quem saiu some.
    function aplicar(dir, opcoes) {
      const op = opcoes || {};
      const vistos = new Set();
      for (const f of dir.figuras) {
        vistos.add(f.id);
        let ent = figuras.get(f.id);
        if (!ent) {
          ent = { id: f.id, pos: { x: f.alvo.x, z: f.alvo.z }, rot: f.alvo.rot || 0, alvo: f.alvo, caminho: [], seg: 0, andando: false, opacidade: f.presente ? 1 : 0, passo: 0, iconeAng: 0 };
          figuras.set(f.id, ent);
        } else if (!mesmoLugar(ent.alvo, f.alvo)) {
          if (ent.opacidade < 0.05 && f.presente) { ent.pos = { x: f.alvo.x, z: f.alvo.z }; ent.alvo = f.alvo; ent.andando = false; ent.rot = f.alvo.rot || 0; }
          else andarAte(ent, f.alvo, VELOCIDADE);
        }
        ent.dados = f;
        ent.presente = !!f.presente;
        ent.icone = f.presente ? f.icone : null;
        ent.tela = f.tela;
      }
      for (const id of [...figuras.keys()]) if (!vistos.has(id)) figuras.delete(id);

      const vistosP = new Set();
      for (const p of dir.pacotes) {
        vistosP.add(p.id);
        let ent = pacotes.get(p.id);
        const alvo = { x: p.x, z: p.z, y: p.y };
        if (!ent) {
          ent = { id: p.id, pos: { x: p.x, z: p.z, y: p.y }, alvo, lugar: p.lugar, caminho: [], seg: 0, andando: false, escala: 0, nascido: relogio };
          pacotes.set(p.id, ent);
        } else if (ent.lugar !== p.lugar) {
          // Mudou de mesa: viaja pelo corredor, como quem anda, só que no ar.
          andarAte(ent, alvo, VELOCIDADE_PACOTE);
          ent.lugar = p.lugar;
        } else if (!mesmoLugar(ent.alvo, alvo)) {
          // Só se rearranjou na mesma mesa.
          ent.alvo = alvo; ent.caminho = [ent.pos, alvo]; ent.seg = 1; ent.andando = true; ent.velocidade = 2; ent.lugar = p.lugar;
        }
        ent.dados = p;
      }
      for (const id of [...pacotes.keys()]) {
        if (vistosP.has(id)) continue;
        const ent = pacotes.get(id);
        if (op.concluidas && op.concluidas.has(id)) pops.push({ x: ent.pos.x, z: ent.pos.z, y: (ent.pos.y || 0.76) + 0.3, t: 0, tipo: 'ok' });
        pacotes.delete(id);
      }
    }

    function avancarEntidade(ent, dt) {
      if (!ent.andando) return false;
      let resto = (ent.velocidade || VELOCIDADE) * dt;
      while (resto > 0 && ent.seg < ent.caminho.length) {
        const alvo = ent.caminho[ent.seg];
        const dx = alvo.x - ent.pos.x, dz = alvo.z - ent.pos.z;
        const d = Math.hypot(dx, dz);
        if (d <= resto) { ent.pos.x = alvo.x; ent.pos.z = alvo.z; resto -= d; ent.seg++; }
        else { ent.pos.x += (dx / d) * resto; ent.pos.z += (dz / d) * resto; ent.rot = Math.atan2(dx, dz); resto = 0; }
      }
      if (ent.seg >= ent.caminho.length) {
        ent.andando = false;
        ent.pos.x = ent.alvo.x; ent.pos.z = ent.alvo.z;
        if (ent.alvo.rot != null) ent.rot = ent.alvo.rot;
      }
      return true;
    }

    // Avança o relógio; diz se alguma coisa ainda se move (para a tela saber
    // se pede outro quadro).
    function avancar(dt) {
      relogio += dt;
      let movendo = false;
      for (const f of figuras.values()) {
        if (avancarEntidade(f, dt)) { movendo = true; f.passo += dt * 9; }
        const alvoOp = f.presente ? 1 : 0;
        if (Math.abs(f.opacidade - alvoOp) > 0.01) { f.opacidade += (alvoOp - f.opacidade) * Math.min(1, dt * 4); movendo = true; } else f.opacidade = alvoOp;
        if (f.icone === 'trabalho' || f.icone === 'fila') { f.iconeAng += dt * 1.6; movendo = true; }
      }
      for (const p of pacotes.values()) {
        if (avancarEntidade(p, dt)) movendo = true;
        if (p.escala < 1) { p.escala = Math.min(1, p.escala + dt * 3); movendo = true; }
        if (p.pos.y == null) p.pos.y = p.alvo.y;
        const yAlvo = p.andando ? 1.6 : p.alvo.y;
        if (Math.abs(p.pos.y - yAlvo) > 0.01) { p.pos.y += (yAlvo - p.pos.y) * Math.min(1, dt * 6); movendo = true; }
        if (p.dados && p.dados.estado === 'executando') movendo = true; // pulsa
      }
      for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t > 1.6) pops.splice(i, 1); else movendo = true; }
      return { movendo };
    }

    return { figuras, pacotes, pops, aplicar, avancar, get relogio() { return relogio; } };
  }

  // ---------- câmera (comum aos dois motores) ----------
  function criarCamera(Planta) {
    const centro = { x: (Planta.PISO.x0 + Planta.PISO.x1) / 2, z: (Planta.PISO.z0 + Planta.PISO.z1) / 2 };
    const AZ0 = Math.PI / 4, EL = 0.62;
    const cam = { az: AZ0, azAlvo: AZ0, el: EL, zoom: 10, zoomAlvo: 10, zoomBase: 10, alvo: { ...centro }, alvoAlvo: { ...centro }, centro };
    cam.suavizar = (dt) => {
      const k = Math.min(1, dt * 8);
      let mudou = false;
      for (const [a, b] of [['az', 'azAlvo'], ['zoom', 'zoomAlvo']]) { if (Math.abs(cam[a] - cam[b]) > 1e-4 * cam[b]) { cam[a] += (cam[b] - cam[a]) * k; mudou = true; } else cam[a] = cam[b]; }
      for (const e of ['x', 'z']) { if (Math.abs(cam.alvo[e] - cam.alvoAlvo[e]) > 1e-3) { cam.alvo[e] += (cam.alvoAlvo[e] - cam.alvo[e]) * k; mudou = true; } else cam.alvo[e] = cam.alvoAlvo[e]; }
      return mudou;
    };
    cam.recentrar = () => { cam.azAlvo = AZ0; cam.zoomAlvo = cam.zoomBase; cam.alvoAlvo = { ...centro }; };
    // A câmera só se move pela mão (pedido de 14/10/2026): sem entrada
    // animada e sem acompanhar quem anda.
    cam.limitarAlvo = () => { cam.alvoAlvo.x = Math.max(Planta.PISO.x0, Math.min(Planta.PISO.x1, cam.alvoAlvo.x)); cam.alvoAlvo.z = Math.max(Planta.PISO.z0, Math.min(Planta.PISO.z1, cam.alvoAlvo.z)); };
    // Arrasto com o botão esquerdo move; com o direito (ou Shift) gira um pouco;
    // a roda aproxima; duplo clique volta ao enquadramento inicial.
    cam.ligarMouse = (el, aoMudar, aoClicar) => {
      let arrasto = null;
      el.addEventListener('pointerdown', (e) => { if (e.button !== 0 && e.button !== 2) return; arrasto = { x: e.clientX, y: e.clientY, girar: e.button === 2 || e.shiftKey, moveu: false }; el.setPointerCapture(e.pointerId); });
      el.addEventListener('pointermove', (e) => {
        if (!arrasto) return;
        const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) arrasto.moveu = true;
        arrasto.x = e.clientX; arrasto.y = e.clientY;
        if (arrasto.girar) { cam.azAlvo = Math.max(AZ0 - 0.75, Math.min(AZ0 + 0.75, cam.azAlvo - dx * 0.005)); cam.az = cam.azAlvo; }
        else {
          // No chão: a direita da tela é (cos az, -sin az); o "para cima" da tela é (-sin az, -cos az) dividido pelo seno da elevação.
          const d = { x: Math.cos(cam.az), z: -Math.sin(cam.az) }, f = { x: -Math.sin(cam.az), z: -Math.cos(cam.az) };
          const px = -dx / cam.zoom, py = dy / (cam.zoom * Math.sin(cam.el));
          cam.alvoAlvo.x += d.x * px - f.x * py; cam.alvoAlvo.z += d.z * px - f.z * py;
          cam.limitarAlvo(); cam.alvo = { ...cam.alvoAlvo };
        }
        aoMudar();
      });
      const soltar = (e) => { if (!arrasto) return; const foiClique = !arrasto.moveu && !arrasto.girar; arrasto = null; if (foiClique && aoClicar) aoClicar(e); };
      el.addEventListener('pointerup', soltar);
      el.addEventListener('pointercancel', () => { arrasto = null; });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('wheel', (e) => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0012); cam.zoomAlvo = Math.max(cam.zoomBase * 0.55, Math.min(cam.zoomBase * 4, cam.zoomAlvo * f)); aoMudar(); }, { passive: false });
      el.addEventListener('dblclick', () => { cam.recentrar(); aoMudar(); });
    };
    return cam;
  }

  // Clique e passagem do mouse, iguais nos dois motores: figura abre o agente,
  // pacote abre a tarefa (ADR-156); passar o mouse num pacote mostra a dica.
  function ligarCliqueEHover(canvas, cam, laco, alvoEm, opcoes) {
    cam.ligarMouse(canvas, () => laco.pedir(), (e) => {
      const a = alvoEm(e);
      if (!a) return;
      if (a.figura && opcoes.aoClicarFigura) opcoes.aoClicarFigura(a.figura);
      else if (a.pacote && opcoes.aoClicarPacote) opcoes.aoClicarPacote(a.pacote);
    });
    let ultimoHover = 0, apontado = null;
    const apontar = (id) => { if (id === apontado) return; apontado = id; if (opcoes.aoApontarPacote) opcoes.aoApontarPacote(id); };
    canvas.addEventListener('pointermove', (e) => {
      const t = performance.now();
      if (t - ultimoHover < 80) return;
      ultimoHover = t;
      const a = alvoEm(e);
      canvas.style.cursor = a ? 'pointer' : 'grab';
      apontar(a && a.pacote ? a.pacote : null);
    });
    canvas.addEventListener('pointerleave', () => apontar(null));
  }

  // Quantos pixels por metro para o piso inteiro caber na tela, com folga.
  function zoomParaCaber(Planta, largura, altura, az, el) {
    const cantos = [[Planta.PISO.x0, Planta.PISO.z0], [Planta.PISO.x1, Planta.PISO.z0], [Planta.PISO.x0, Planta.PISO.z1], [Planta.PISO.x1, Planta.PISO.z1]];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, z] of cantos) {
      const sx = x * Math.cos(az) - z * Math.sin(az);
      const sy = (x * Math.sin(az) + z * Math.cos(az)) * Math.sin(el);
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    }
    const alturaCena = ALTURA_PAREDE * Math.cos(el) + 2.4; // paredes e cartões acima do chão
    return Math.max(2, Math.min((largura * 0.9) / (maxX - minX), (altura * 0.8) / (maxY - minY + alturaCena)));
  }

  // Laço de quadros com teto de FPS, que para sozinho quando nada se move e
  // quando a janela perde o foco ou é escondida.
  function criarLaco(host, desenharQuadro) {
    let raf = 0, ultimo = 0, ativo = false, pendente = false;
    const visivel = () => !document.hidden && !document.documentElement.classList.contains('sem-foco') && host.isConnected;
    function quadro(ts) {
      raf = 0;
      if (!ativo) return;
      if (!visivel()) { pendente = true; return; }
      if (ts - ultimo < 1000 / FPS_MAX - 1) { raf = requestAnimationFrame(quadro); return; }
      const dt = ultimo ? Math.min(0.1, (ts - ultimo) / 1000) : 1 / FPS_MAX;
      ultimo = ts;
      const continua = desenharQuadro(dt);
      pendente = false;
      if (continua) raf = requestAnimationFrame(quadro);
    }
    const pedir = () => { pendente = true; if (ativo && !raf && visivel()) raf = requestAnimationFrame(quadro); };
    const acordar = () => { if (pendente) pedir(); };
    document.addEventListener('visibilitychange', acordar);
    window.addEventListener('focus', acordar);
    return {
      pedir,
      ligar() { ativo = true; ultimo = 0; pedir(); },
      desligar() { ativo = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
      destruir() { this.desligar(); document.removeEventListener('visibilitychange', acordar); window.removeEventListener('focus', acordar); },
      get rodando() { return !!raf; },
    };
  }

  // Avisa a tela quando a escala dos cartões cruza o limiar do compacto.
  function criarVigiaDeEscala(aoEscalar) {
    let ultimo = null;
    return (escala) => {
      const compacto = escala < LIMIAR_COMPACTO;
      if (compacto === ultimo) return;
      ultimo = compacto;
      if (typeof aoEscalar === 'function') aoEscalar({ escala, compacto });
    };
  }
  // Avisa a tela quando muda o conjunto de pacotes em viagem (os selos).
  function criarVigiaDeViagens(sim, aoViajar) {
    let ultimo = '';
    return () => {
      if (typeof aoViajar !== 'function') return;
      const ids = [...sim.pacotes.values()].filter((p) => p.andando).map((p) => p.id).sort();
      const chave = ids.join(',');
      if (chave === ultimo) return;
      ultimo = chave;
      aoViajar(ids);
    };
  }
  // Os pontos da cena que a tela pode ancorar: figuras (pelo id, ou 'losango:id'),
  // rótulos de sala ('sala:nn'), contadores de mesa ('lugar:x'), pacotes em
  // viagem ('pacote:id').
  function criarPontoDe(sim, Planta, dirAtual) {
    return (id) => {
      if (id.startsWith('sala:')) { const s = Planta.salaPorNumero(id.slice(5)); return s ? { x: s.rotulo.x, y: 0, z: s.rotulo.z } : null; }
      if (id.startsWith('lugar:')) { const d = dirAtual(); const l = d && d.lugares.find((x) => x.lugar === id.slice(6)); return l ? { x: l.x, y: l.y + 0.5, z: l.z } : null; }
      if (id.startsWith('pacote:')) { const p = sim.pacotes.get(id.slice(7)); return p && p.andando ? { x: p.pos.x, y: p.pos.y || 0.76, z: p.pos.z } : null; }
      if (id.startsWith('dica:')) { const p = sim.pacotes.get(id.slice(5)); return p ? { x: p.pos.x, y: (p.pos.y || 0.76) + 0.3, z: p.pos.z } : null; }
      const losango = id.startsWith('losango:');
      const f = sim.figuras.get(losango ? id.slice(8) : id);
      if (!f || f.opacidade <= 0.02) return null;
      // O losango de quem trabalha flutua: o ângulo só avança enquanto o laço roda.
      const flutua = losango && (f.icone === 'trabalho' || f.icone === 'fila') ? Math.sin(f.iconeAng * 2) * 0.25 : 0;
      return { x: f.pos.x, y: flutua, z: f.pos.z };
    };
  }

  // Os elementos HTML presos a pontos da cena.
  function criarAncoras() {
    const lista = new Map();
    return {
      // `empurrar`: cartões que não podem se cobrir (duas figuras lado a lado
      // na reunião): o de baixo sobe até desencostar do outro.
      // `fixo`: um obstáculo que não se move (o rótulo da sala) e que os
      // cartões evitam. `centro`: ancorado pelo centro (o losango); senão,
      // pelo pé. `escala` encolhe tudo junto com a cena.
      // Ancorar de novo o mesmo elemento (depois de mudar o texto) manda medir
      // o tamanho outra vez; fora isso, a medida fica guardada (ler offsetWidth
      // a cada quadro força o layout).
      ancorar(id, el, altura, op) { if (el) lista.set(id, { el, altura: altura == null ? 0 : altura, empurrar: !!(op && op.empurrar), centro: !!(op && op.centro), fixo: !!(op && op.fixo), w: 0, h: 0 }); else lista.delete(id); },
      posicionar(pontoDe, projetar, escala) {
        const k = escala || 1;
        const caixas = [];
        const postos = [];
        for (const [id, a] of lista) {
          const p = pontoDe(id);
          if (!p) { a.el.style.display = 'none'; continue; }
          const s = projetar(p.x, (p.y || 0) + a.altura, p.z);
          a.el.style.display = '';
          if (!a.w) { a.w = a.el.offsetWidth || 160; a.h = a.el.offsetHeight || 40; }
          const w = a.w * k, h = a.h * k;
          if (a.empurrar) { caixas.push({ a, x: s.x, y: s.y, w, h }); continue; }
          // O rótulo é ancorado pela esquerda, no pé: a caixa dele é [x, y - h, x + w, y].
          if (a.fixo) postos.push({ x: s.x + w / 2, y: s.y, w, h });
          a.el.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(${a.fixo ? '0' : '-50%'}, ${a.centro ? '-50%' : '-100%'}) scale(${k})`;
        }
        // A caixa de cada cartão é [x - w/2, y - h, x + w/2, y]. De cima para
        // baixo, quem cobre um já colocado (ou um rótulo) sai do caminho pelo
        // lado mais barato: um pouco para cima, ou para a direita/esquerda,
        // para não virar uma torre longe da figura.
        caixas.sort((u, v) => u.y - v.y);
        const bateEm = (c, x, y) => postos.find((o) => Math.abs(o.x - x) < (o.w + c.w) / 2 && y > o.y - o.h - 4 && y - c.h < o.y + 4);
        for (const c of caixas) {
          let melhor = { x: c.x, y: c.y, custo: 0 };
          if (bateEm(c, c.x, c.y)) {
            const cands = [];
            let y = c.y;
            for (let t = 0; t < 8; t++) { const o = bateEm(c, c.x, y); if (!o) break; y = o.y - o.h - 6; }
            cands.push({ x: c.x, y, custo: c.y - y });
            for (const lado of [1, -1]) {
              let x = c.x;
              for (let t = 0; t < 8; t++) { const o = bateEm(c, x, c.y); if (!o) break; x = o.x + lado * ((o.w + c.w) / 2 + 8); }
              cands.push({ x, y: c.y, custo: Math.abs(x - c.x) * 1.15 });
            }
            cands.sort((u, v) => u.custo - v.custo);
            melhor = cands[0];
          }
          postos.push({ x: melhor.x, y: melhor.y, w: c.w, h: c.h });
          c.a.el.style.transform = `translate(${Math.round(melhor.x)}px, ${Math.round(melhor.y)}px) translate(-50%, -100%) scale(${k})`;
        }
      },
      limpar() { lista.clear(); },
    };
  }

  // ---------- motor 3D ----------
  function criarMotor3d(host, sim, opcoes) {
    const THREE = window.THREE, Planta = window.Planta;
    if (!THREE || !Planta) return null;
    let renderer;
    try {
      // GPU dedicada quando houver (a de baixo consumo deixava a cena travada).
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false });
    } catch (e) { return null; }
    const canvas = renderer.domElement;
    canvas.className = 'esc-canvas';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setClearColor(CORES.fundo, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // A sombra é só da parte fixa (mesas, cadeiras, plantas) e é calculada uma
    // vez: as figuras têm o anel no chão no lugar da sombra.
    renderer.shadowMap.autoUpdate = false;
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CORES.fundo);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
    const cam = criarCamera(Planta);
    const ancoras = criarAncoras();

    scene.add(new THREE.HemisphereLight(0x5c9c86, 0x0a1f18, 1.7));
    const sol = new THREE.DirectionalLight(0xd6fff0, 1.6);
    sol.position.set(28, 60, 22);
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    Object.assign(sol.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 200 });
    sol.shadow.bias = -0.0006;
    scene.add(sol);
    const luzFria = new THREE.DirectionalLight(0x22f2ef, 0.3);
    luzFria.position.set(-30, 20, -10);
    scene.add(luzFria);

    const mat = (cor, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: cor, roughness: 0.82, metalness: 0.08 }, extra || {}));
    const materiais = {
      piso: mat(CORES.piso, { roughness: 0.95 }), sala: mat(CORES.sala, { roughness: 0.95 }), corredor: mat(CORES.corredor, { roughness: 0.95 }),
      mesa: mat(CORES.mesa), tampo: mat(CORES.mesaTampo, { roughness: 0.6 }), cadeira: mat(CORES.cadeira), monitor: mat(CORES.monitor, { roughness: 0.5, metalness: 0.2 }),
      vaso: mat(CORES.vaso), folha: mat(CORES.folha, { roughness: 0.9 }),
      parede: new THREE.MeshStandardMaterial({ color: CORES.parede, transparent: true, opacity: 0.12, roughness: 0.2, metalness: 0, side: THREE.DoubleSide, depthWrite: false }),
      aresta: new THREE.LineBasicMaterial({ color: CORES.parede, transparent: true, opacity: 0.45 }),
      grade: new THREE.LineBasicMaterial({ color: CORES.grade, transparent: true, opacity: 0.5 }),
      cabeca: mat(CORES.cabeca, { roughness: 0.7 }),
      corpo: { auto: mat(CORES.corpo.auto, { emissive: CORES.corpo.auto, emissiveIntensity: 0.12 }), standby: mat(CORES.corpo.standby), orquestrador: mat(CORES.corpo.orquestrador, { emissive: CORES.corpo.orquestrador, emissiveIntensity: 0.15 }) },
      tela: Object.fromEntries(Object.entries(CORES.tela).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: k === 'desligada' ? 0x030806 : c, emissive: c, emissiveIntensity: k === 'desligada' ? 0 : k === 'standby' ? 0.3 : k === 'ligada' ? 0.6 : 1.3, roughness: 0.3 })])),
      icone: Object.fromEntries(Object.entries(CORES.icone).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.3 })])),
      pacote: Object.fromEntries(Object.entries(CORES.pacote).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.4 })])),
    };
    const geo = {
      cabeca: new THREE.SphereGeometry(0.26, 14, 12), corpo: new THREE.CapsuleGeometry(0.3, 0.55, 4, 10),
      pacote: new THREE.BoxGeometry(0.3, 0.3, 0.3), pop: new THREE.OctahedronGeometry(0.3),
      anel: new THREE.RingGeometry(0.42, 0.58, 36),
      fio: new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.3, 0), new THREE.Vector3(0, 2.95, 0)]),
    };
    materiais.fio = new THREE.LineBasicMaterial({ color: 0x22f2ef, transparent: true, opacity: 0.4 });

    // ----- a parte fixa: piso, salas, mesas, cadeiras, plantas -----
    const estatico = new THREE.Group();
    scene.add(estatico);
    const P = Planta.PISO;
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0 + 6, P.z1 - P.z0 + 6), materiais.piso);
    piso.rotation.x = -Math.PI / 2; piso.position.set((P.x0 + P.x1) / 2, -0.02, (P.z0 + P.z1) / 2); piso.receiveShadow = true;
    estatico.add(piso);
    const corredor = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0, Planta.CORREDOR.z1 - Planta.CORREDOR.z0), materiais.corredor);
    corredor.rotation.x = -Math.PI / 2; corredor.position.set((P.x0 + P.x1) / 2, 0.0, 0); corredor.receiveShadow = true;
    estatico.add(corredor);
    // A grade do piso.
    {
      const pts = [];
      for (let x = P.x0; x <= P.x1 + 1e-6; x += 2) pts.push(x, 0.005, P.z0, x, 0.005, P.z1);
      for (let z = P.z0; z <= P.z1 + 1e-6; z += 2) pts.push(P.x0, 0.005, z, P.x1, 0.005, z);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      estatico.add(new THREE.LineSegments(g, materiais.grade));
    }
    function parede(x0, z0, x1, z1) {
      const c = Math.hypot(x1 - x0, z1 - z0);
      if (c < 0.05) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(c, ALTURA_PAREDE, 0.06), materiais.parede);
      m.position.set((x0 + x1) / 2, ALTURA_PAREDE / 2, (z0 + z1) / 2);
      m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      estatico.add(m);
      const ar = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), materiais.aresta);
      ar.position.copy(m.position); ar.rotation.copy(m.rotation);
      estatico.add(ar);
    }
    function mesa(d, dim) {
      const g = new THREE.Group();
      const tampo = new THREE.Mesh(new THREE.BoxGeometry(dim.largura, 0.08, dim.profundidade), materiais.tampo);
      tampo.position.y = dim.altura - 0.04; tampo.castShadow = true; tampo.receiveShadow = true;
      g.add(tampo);
      for (const s of [-1, 1]) {
        const pe = new THREE.Mesh(new THREE.BoxGeometry(0.08, dim.altura - 0.08, dim.profundidade * 0.9), materiais.mesa);
        pe.position.set(s * (dim.largura / 2 - 0.1), (dim.altura - 0.08) / 2, 0); pe.castShadow = true;
        g.add(pe);
      }
      g.position.set(d.x, 0, d.z); g.rotation.y = d.rot || 0;
      estatico.add(g);
      return g;
    }
    function cadeira(c) {
      const g = new THREE.Group();
      const assento = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.58), materiais.cadeira); assento.position.y = 0.46; assento.castShadow = true;
      const encosto = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.55, 0.08), materiais.cadeira); encosto.position.set(0, 0.76, 0.27); encosto.castShadow = true;
      const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8), materiais.mesa); pe.position.y = 0.21;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 10), materiais.mesa); base.position.y = 0.02;
      g.add(assento, encosto, pe, base);
      g.position.set(c.x, 0, c.z); g.rotation.y = c.rot || 0;
      estatico.add(g);
    }
    function monitor(m, dim) {
      const g = new THREE.Group();
      const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.22, 8), materiais.monitor); haste.position.y = dim.altura + 0.11;
      const moldura = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.58, 0.05), materiais.monitor); moldura.position.y = dim.altura + 0.5; moldura.castShadow = true;
      const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.48), materiais.tela.desligada); tela.position.set(0, dim.altura + 0.5, 0.03);
      g.add(haste, moldura, tela);
      g.position.set(m.x, 0, m.z); g.rotation.y = m.rot || 0;
      estatico.add(g);
      return tela;
    }
    function planta(p) {
      const g = new THREE.Group();
      const vaso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.38, 10), materiais.vaso); vaso.position.y = 0.19; vaso.castShadow = true;
      const f1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), materiais.folha); f1.position.y = 0.72; f1.castShadow = true;
      const f2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), materiais.folha); f2.position.set(0.18, 1.0, 0.1); f2.castShadow = true;
      g.add(vaso, f1, f2); g.position.set(p.x, 0, p.z);
      estatico.add(g);
    }
    const telas = new Map(); // sala → mesh da tela do monitor do ocupante
    for (const s of Planta.SALAS) {
      const chao = new THREE.Mesh(new THREE.PlaneGeometry(s.x1 - s.x0 - 0.1, s.z1 - s.z0 - 0.1), materiais.sala);
      chao.rotation.x = -Math.PI / 2; chao.position.set(s.cx, 0.0, (s.z0 + s.z1) / 2); chao.receiveShadow = true;
      estatico.add(chao);
      // Paredes: a do corredor com o vão da porta, a da direita, a do fundo e,
      // na primeira coluna, a da esquerda. As vizinhas da mesma fila dividem a
      // parede direita/esquerda, por isso só uma delas desenha.
      const zCorr = s.frente ? s.z0 : s.z1, zFundo = s.frente ? s.z1 : s.z0;
      const meiaPorta = Planta.PORTA_LARGURA / 2;
      parede(s.x0, zCorr, s.porta.x - meiaPorta, zCorr);
      parede(s.porta.x + meiaPorta, zCorr, s.x1, zCorr);
      parede(s.x1, s.z0, s.x1, s.z1);
      parede(s.x0, zFundo, s.x1, zFundo);
      if (Math.abs(s.x0 - P.x0) < 1e-6) parede(s.x0, s.z0, s.x0, s.z1);
      if (s.mesa) {
        mesa(s.mesa, s.mesa);
        cadeira(s.cadeira);
        telas.set(s.numero, monitor(s.monitor, s.mesa));
      }
      for (const m of s.mesasExtras) { mesa(m, Planta.MESA); cadeira({ x: m.x, z: s.cadeira ? s.cadeira.z : m.z, rot: m.rot }); monitor({ x: m.x, z: s.frente ? m.z - 0.32 : m.z + 0.32, rot: m.rot }, Planta.MESA); }
      if (s.mesaReuniao) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(s.mesaReuniao.raio, s.mesaReuniao.raio, 0.08, 36), materiais.tampo); t.position.set(s.mesaReuniao.x, 0.74, s.mesaReuniao.z); t.castShadow = true; t.receiveShadow = true;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, 0.7, 12), materiais.mesa); col.position.set(s.mesaReuniao.x, 0.35, s.mesaReuniao.z);
        estatico.add(t, col);
        for (const l of s.lugares) cadeira(l);
      }
      planta(s.planta);
    }

    // ----- a parte viva: figuras, ícones, pacotes, pops -----
    renderer.shadowMap.needsUpdate = true; // uma vez, com a parte fixa pronta
    const dinamico = new THREE.Group();
    scene.add(dinamico);
    const figurasMesh = new Map();
    const pacotesMesh = new Map();
    const popsMesh = [];
    const clicaveis = [];
    function figura(ent) {
      const g = new THREE.Group();
      const tipo = ent.id === Planta.ORQUESTRADOR ? 'orquestrador' : (ent.dados && ent.dados.modo === 'standby') ? 'standby' : 'auto';
      const corpo = new THREE.Mesh(geo.corpo, materiais.corpo[tipo].clone()); corpo.position.y = 0.72;
      const cabeca = new THREE.Mesh(geo.cabeca, materiais.cabeca.clone()); cabeca.position.y = 1.5;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.06), materiais.monitor); visor.position.set(0, 1.54, 0.24);
      // O anel luminoso no chão (a cor diz o estado) e o fio que sobe até o
      // cartão, como na referência; o losango com o ícone é HTML, ancorado.
      const anel = new THREE.Mesh(geo.anel, new THREE.MeshBasicMaterial({ color: CORES.icone.ok, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
      anel.rotation.x = -Math.PI / 2; anel.position.y = 0.02;
      const fio = new THREE.Line(geo.fio, materiais.fio);
      g.add(corpo, cabeca, visor, anel, fio);
      g.userData = { id: ent.id, corpo, cabeca, anel, fio, tipo };
      corpo.userData.figura = ent.id; cabeca.userData.figura = ent.id;
      clicaveis.push(corpo, cabeca);
      dinamico.add(g);
      return g;
    }
    function sincronizar() {
      for (const [id, ent] of sim.figuras) {
        let g = figurasMesh.get(id);
        if (!g) { g = figura(ent); figurasMesh.set(id, g); }
        const bob = ent.andando ? Math.abs(Math.sin(ent.passo)) * 0.07 : 0;
        g.position.set(ent.pos.x, bob, ent.pos.z);
        g.rotation.y = ent.rot || 0;
        g.visible = ent.opacidade > 0.02;
        const u = g.userData;
        u.corpo.material.opacity = ent.opacidade; u.corpo.material.transparent = ent.opacidade < 1;
        u.cabeca.material.opacity = ent.opacidade; u.cabeca.material.transparent = ent.opacidade < 1;
        const corAnel = ent.icone ? (CORES.icone[ent.icone] || CORES.icone.trabalho) : u.tipo === 'orquestrador' ? CORES.corpo.orquestrador : u.tipo === 'standby' ? 0x4f7d69 : CORES.icone.ok;
        u.anel.material.color.setHex(corAnel);
        u.anel.material.opacity = 0.72 * ent.opacidade;
        u.anel.scale.setScalar(ent.icone === 'trabalho' || ent.icone === 'fila' ? 1 + 0.08 * Math.sin(ent.iconeAng * 2.2) : 1);
        u.fio.visible = ent.opacidade > 0.5;
        const tela = ent.dados && telas.get(ent.dados.sala);
        if (tela && ent.dados.sala !== Planta.REUNIAO) tela.material = materiais.tela[ent.tela] || materiais.tela.desligada;
      }
      for (const [id, g] of figurasMesh) if (!sim.figuras.has(id)) { dinamico.remove(g); figurasMesh.delete(id); }
      for (const [id, ent] of sim.pacotes) {
        let m = pacotesMesh.get(id);
        if (!m) { m = new THREE.Mesh(geo.pacote, materiais.pacote.na_fila); m.userData.pacote = id; dinamico.add(m); pacotesMesh.set(id, m); }
        const estado = ent.dados ? ent.dados.estado : 'na_fila';
        const base = materiais.pacote[estado] || materiais.pacote.na_fila;
        if (estado === 'executando') {
          if (!m.userData.pulso) m.userData.pulso = base.clone();
          m.userData.pulso.emissiveIntensity = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(sim.relogio * 5));
          m.material = m.userData.pulso;
        } else m.material = base;
        m.position.set(ent.pos.x, (ent.pos.y || 0.76) + 0.15, ent.pos.z);
        m.scale.setScalar(Math.max(0.01, ent.escala));
        m.rotation.y = ent.andando ? sim.relogio * 3 : 0;
      }
      for (const [id, m] of pacotesMesh) if (!sim.pacotes.has(id)) { dinamico.remove(m); pacotesMesh.delete(id); }
      while (popsMesh.length < sim.pops.length) { const m = new THREE.Mesh(geo.pop, materiais.icone.ok.clone()); m.material.transparent = true; dinamico.add(m); popsMesh.push(m); }
      while (popsMesh.length > sim.pops.length) dinamico.remove(popsMesh.pop());
      sim.pops.forEach((p, i) => { const m = popsMesh[i]; const k = p.t / 1.6; m.position.set(p.x, p.y + k * 1.4, p.z); m.scale.setScalar(0.3 + k * 1.1); m.rotation.y = k * 4; m.material.opacity = 1 - k; });
    }

    // ----- câmera e projeção -----
    let largura = 1, altura = 1;
    function aplicarCamera() {
      // O centro do frustum é em metros (o zoom só divide o tamanho): o
      // deslocamento em px vira metros dividindo pelo zoom.
      const desloca = DESLOCAMENTO_Y / cam.zoom;
      camera.left = -largura / 2; camera.right = largura / 2; camera.top = altura / 2 + desloca; camera.bottom = -altura / 2 + desloca;
      camera.zoom = cam.zoom;
      const d = 150;
      camera.position.set(cam.alvo.x + d * Math.cos(cam.el) * Math.sin(cam.az), d * Math.sin(cam.el), cam.alvo.z + d * Math.cos(cam.el) * Math.cos(cam.az));
      camera.lookAt(cam.alvo.x, 0, cam.alvo.z);
      camera.updateProjectionMatrix();
    }
    const v3 = new THREE.Vector3();
    function projetar(x, y, z) {
      v3.set(x, y, z).project(camera);
      return { x: (v3.x + 1) / 2 * largura, y: (1 - v3.y) / 2 * altura };
    }
    function redimensionar() {
      const r = host.getBoundingClientRect();
      largura = Math.max(1, Math.round(r.width)); altura = Math.max(1, Math.round(r.height));
      renderer.setSize(largura, altura, false);
      canvas.style.width = largura + 'px'; canvas.style.height = altura + 'px';
      const zoomBaseAntes = cam.zoomBase;
      cam.zoomBase = zoomParaCaber(Planta, largura, altura, Math.PI / 4, cam.el);
      // Primeira vez: enquadra. Depois, se ninguém mexeu no zoom, reenquadra
      // ao redimensionar a janela.
      if (!cam._enquadrou) { cam.zoom = cam.zoomAlvo = cam.zoomBase; cam._enquadrou = true; }
      else if (Math.abs(cam.zoomAlvo - zoomBaseAntes) < 1e-6) { cam.zoom = cam.zoomAlvo = cam.zoomBase; }
      laco.pedir();
    }

    let ultimoDir = null;
    const pontoDe = criarPontoDe(sim, Planta, () => ultimoDir);
    const vigiarViagens = criarVigiaDeViagens(sim, opcoes.aoViajar);
    const vigiarEscala = criarVigiaDeEscala(opcoes.aoEscalar);
    const laco = criarLaco(host, (dt) => {
      const { movendo } = sim.avancar(dt);
      const camMudou = cam.suavizar(dt);
      aplicarCamera();
      sincronizar();
      renderer.render(scene, camera);
      vigiarViagens();
      const escala = escalaDosCartoes(cam.zoom);
      vigiarEscala(escala);
      ancoras.posicionar(pontoDe, projetar, escala);
      return movendo || camMudou;
    });

    // Clique numa figura abre o agente (a tela decide o que fazer).
    const raycaster = new THREE.Raycaster();
    const ponteiro = new THREE.Vector2();
    // O que está sob o mouse: uma figura ({ figura }) ou um pacote ({ pacote }).
    function alvoEm(e) {
      const r = canvas.getBoundingClientRect();
      ponteiro.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ponteiro, camera);
      const alvos = clicaveis.filter((m) => m.parent && m.parent.visible).concat([...pacotesMesh.values()]);
      const hit = raycaster.intersectObjects(alvos, false)[0];
      if (!hit) return null;
      if (hit.object.userData.figura) return { figura: hit.object.userData.figura };
      if (hit.object.userData.pacote) return { pacote: hit.object.userData.pacote };
      return null;
    }
    ligarCliqueEHover(canvas, cam, laco, alvoEm, opcoes);

    redimensionar();
    return {
      tipo: '3d',
      canvas,
      atualizar(dir, op) { ultimoDir = dir; sim.aplicar(dir, op); laco.pedir(); },
      redimensionar,
      ancorar: (id, el, altura, op) => { ancoras.ancorar(id, el, altura, op); laco.pedir(); },
      recentrar() { cam.recentrar(); laco.pedir(); },
      ligar() { laco.ligar(); },
      desligar() { laco.desligar(); },
      pedirQuadro() { laco.pedir(); },
      projetarPonto(x, y, z) { return projetar(x, y, z); },
      get rodando() { return laco.rodando; },
      destruir() { laco.destruir(); ancoras.limpar(); renderer.dispose(); if (canvas.parentNode) canvas.parentNode.removeChild(canvas); },
    };
  }

  // ---------- motor 2D (sem WebGL) ----------
  function criarMotor2d(host, sim, opcoes) {
    const Planta = window.Planta;
    const canvas = document.createElement('canvas');
    canvas.className = 'esc-canvas esc-canvas-2d';
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const cam = criarCamera(Planta);
    const ancoras = criarAncoras();
    let largura = 1, altura = 1, dpr = 1;
    let ultimoDir = null;

    // Projeção: gira pelo azimute, achata pela elevação.
    function projetar(x, y, z) {
      const dx = x - cam.alvo.x, dz = z - cam.alvo.z;
      const sx = dx * Math.cos(cam.az) - dz * Math.sin(cam.az);
      const sy = (dx * Math.sin(cam.az) + dz * Math.cos(cam.az)) * Math.sin(cam.el) - y * Math.cos(cam.el);
      return { x: largura / 2 + sx * cam.zoom, y: altura / 2 + DESLOCAMENTO_Y + sy * cam.zoom };
    }
    const prof = (x, z) => x * Math.sin(cam.az) + z * Math.cos(cam.az); // quem está mais perto da câmera desenha por último
    function poligono(pontos, preenchimento, traco) {
      ctx.beginPath();
      pontos.forEach((p, i) => { const s = projetar(p[0], p[1], p[2]); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); });
      ctx.closePath();
      if (preenchimento) { ctx.fillStyle = preenchimento; ctx.fill(); }
      if (traco) { ctx.strokeStyle = traco; ctx.stroke(); }
    }
    function caixa(x, y, z, l, a, p, rot, cor, corTopo) {
      const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
      const canto = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
      const [a1, a2, a3, a4] = [canto(-l / 2, -p / 2), canto(l / 2, -p / 2), canto(l / 2, p / 2), canto(-l / 2, p / 2)];
      const topo = [[a1[0], y + a, a1[1]], [a2[0], y + a, a2[1]], [a3[0], y + a, a3[1]], [a4[0], y + a, a4[1]]];
      const lados = [[a1, a2], [a2, a3], [a3, a4], [a4, a1]].sort((u, v) => (prof(u[0][0], u[0][1]) + prof(u[1][0], u[1][1])) - (prof(v[0][0], v[0][1]) + prof(v[1][0], v[1][1])));
      for (const [u, v] of lados) poligono([[u[0], y, u[1]], [v[0], y, v[1]], [v[0], y + a, v[1]], [u[0], y + a, u[1]]], cor, 'rgba(0,0,0,0.25)');
      poligono(topo, corTopo || cor, 'rgba(255,255,255,0.08)');
    }
    function desenhar() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = hex(CORES.fundo); ctx.fillRect(0, 0, largura, altura);
      const P = Planta.PISO;
      poligono([[P.x0, 0, P.z0], [P.x1, 0, P.z0], [P.x1, 0, P.z1], [P.x0, 0, P.z1]], hex(CORES.piso));
      poligono([[P.x0, 0, Planta.CORREDOR.z0], [P.x1, 0, Planta.CORREDOR.z0], [P.x1, 0, Planta.CORREDOR.z1], [P.x0, 0, Planta.CORREDOR.z1]], hex(CORES.corredor));
      ctx.lineWidth = 1;
      for (const s of Planta.SALAS) poligono([[s.x0, 0, s.z0], [s.x1, 0, s.z0], [s.x1, 0, s.z1], [s.x0, 0, s.z1]], hex(CORES.sala), 'rgba(34,242,239,0.35)');
      ctx.strokeStyle = 'rgba(17,49,40,0.6)';
      for (let x = P.x0; x <= P.x1 + 1e-6; x += 2) { const a = projetar(x, 0, P.z0), b = projetar(x, 0, P.z1); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      for (let z = P.z0; z <= P.z1 + 1e-6; z += 2) { const a = projetar(P.x0, 0, z), b = projetar(P.x1, 0, z); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      // Tudo que tem altura, do fundo para a frente.
      const itens = [];
      for (const s of Planta.SALAS) {
        const zCorr = s.frente ? s.z0 : s.z1, zFundo = s.frente ? s.z1 : s.z0, mp = Planta.PORTA_LARGURA / 2;
        for (const [x0, z0, x1, z1] of [[s.x0, zCorr, s.porta.x - mp, zCorr], [s.porta.x + mp, zCorr, s.x1, zCorr], [s.x1, s.z0, s.x1, s.z1], [s.x0, zFundo, s.x1, zFundo], ...(Math.abs(s.x0 - P.x0) < 1e-6 ? [[s.x0, s.z0, s.x0, s.z1]] : [])]) {
          itens.push({ d: prof((x0 + x1) / 2, (z0 + z1) / 2) - 0.5, f: () => poligono([[x0, 0, z0], [x1, 0, z1], [x1, ALTURA_PAREDE, z1], [x0, ALTURA_PAREDE, z0]], 'rgba(34,242,239,0.07)', 'rgba(34,242,239,0.45)') });
        }
        const mesas = s.mesa ? [{ ...s.mesa, dim: s.mesa }] : [];
        for (const m of s.mesasExtras) mesas.push({ ...m, dim: Planta.MESA });
        for (const m of mesas) itens.push({ d: prof(m.x, m.z), f: () => { caixa(m.x, 0, m.z, m.dim.largura, m.dim.altura, m.dim.profundidade, m.rot, hex(CORES.mesa), hex(CORES.mesaTampo)); } });
        if (s.mesaReuniao) itens.push({ d: prof(s.mesaReuniao.x, s.mesaReuniao.z), f: () => { caixa(s.mesaReuniao.x, 0, s.mesaReuniao.z, s.mesaReuniao.raio * 2, 0.76, s.mesaReuniao.raio * 2, 0, hex(CORES.mesa), hex(CORES.mesaTampo)); } });
        itens.push({ d: prof(s.planta.x, s.planta.z), f: () => { const b = projetar(s.planta.x, 0.7, s.planta.z); ctx.fillStyle = hex(CORES.folha); ctx.beginPath(); ctx.arc(b.x, b.y, 0.42 * cam.zoom, 0, Math.PI * 2); ctx.fill(); } });
      }
      for (const f of sim.figuras.values()) {
        if (f.opacidade < 0.02) continue;
        itens.push({ d: prof(f.pos.x, f.pos.z) + 0.01, f: () => {
          ctx.globalAlpha = f.opacidade;
          const tipo = f.id === Planta.ORQUESTRADOR ? 'orquestrador' : (f.dados && f.dados.modo === 'standby') ? 'standby' : 'auto';
          const pe = projetar(f.pos.x, 0, f.pos.z), cabeca = projetar(f.pos.x, 1.5, f.pos.z);
          ctx.strokeStyle = hex(CORES.corpo[tipo]); ctx.lineWidth = Math.max(3, 0.55 * cam.zoom); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(pe.x, pe.y - 0.2 * cam.zoom); ctx.lineTo(cabeca.x, cabeca.y + 0.3 * cam.zoom); ctx.stroke();
          ctx.fillStyle = hex(CORES.cabeca); ctx.beginPath(); ctx.arc(cabeca.x, cabeca.y, Math.max(2.5, 0.26 * cam.zoom), 0, Math.PI * 2); ctx.fill();
          // O anel no chão e o fio até o cartão (o losango é HTML).
          const corAnel = f.icone ? (CORES.icone[f.icone] || CORES.icone.trabalho) : tipo === 'orquestrador' ? CORES.corpo.orquestrador : tipo === 'standby' ? 0x4f7d69 : CORES.icone.ok;
          ctx.strokeStyle = hex(corAnel); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(pe.x, pe.y, 0.5 * cam.zoom, 0.5 * cam.zoom * Math.sin(cam.el), 0, 0, Math.PI * 2); ctx.stroke();
          const f1 = projetar(f.pos.x, 2.3, f.pos.z), f2 = projetar(f.pos.x, 2.95, f.pos.z);
          ctx.strokeStyle = 'rgba(34,242,239,0.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(f1.x, f1.y); ctx.lineTo(f2.x, f2.y); ctx.stroke();
          ctx.globalAlpha = 1; ctx.lineWidth = 1;
        } });
      }
      for (const p of sim.pacotes.values()) {
        itens.push({ d: prof(p.pos.x, p.pos.z) + 0.02, f: () => { const estado = p.dados ? p.dados.estado : 'na_fila'; caixa(p.pos.x, p.pos.y || 0.76, p.pos.z, 0.3 * p.escala, 0.3 * p.escala, 0.3 * p.escala, 0, hex(CORES.pacote[estado] || CORES.pacote.na_fila)); } });
      }
      for (const pop of sim.pops) itens.push({ d: 1e9, f: () => { const k = pop.t / 1.6; const s = projetar(pop.x, pop.y + k * 1.4, pop.z); ctx.globalAlpha = 1 - k; ctx.fillStyle = hex(CORES.icone.ok); ctx.beginPath(); ctx.arc(s.x, s.y, (0.3 + k) * cam.zoom * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; } });
      itens.sort((a, b) => a.d - b.d);
      for (const it of itens) it.f();
    }
    function redimensionar() {
      const r = host.getBoundingClientRect();
      largura = Math.max(1, Math.round(r.width)); altura = Math.max(1, Math.round(r.height));
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(largura * dpr); canvas.height = Math.round(altura * dpr);
      canvas.style.width = largura + 'px'; canvas.style.height = altura + 'px';
      const zoomBaseAntes = cam.zoomBase;
      cam.zoomBase = zoomParaCaber(Planta, largura, altura, Math.PI / 4, cam.el);
      // Primeira vez: enquadra. Depois, se ninguém mexeu no zoom, reenquadra
      // ao redimensionar a janela.
      if (!cam._enquadrou) { cam.zoom = cam.zoomAlvo = cam.zoomBase; cam._enquadrou = true; }
      else if (Math.abs(cam.zoomAlvo - zoomBaseAntes) < 1e-6) { cam.zoom = cam.zoomAlvo = cam.zoomBase; }
      laco.pedir();
    }
    const pontoDe = criarPontoDe(sim, Planta, () => ultimoDir);
    const vigiarViagens = criarVigiaDeViagens(sim, opcoes.aoViajar);
    const vigiarEscala = criarVigiaDeEscala(opcoes.aoEscalar);
    const laco = criarLaco(host, (dt) => {
      const { movendo } = sim.avancar(dt);
      const camMudou = cam.suavizar(dt);
      desenhar();
      vigiarViagens();
      const escala = escalaDosCartoes(cam.zoom);
      vigiarEscala(escala);
      ancoras.posicionar(pontoDe, projetar, escala);
      return movendo || camMudou;
    });
    function alvoEm(e) {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let melhor = null, dist = 18;
      for (const f of sim.figuras.values()) { if (f.opacidade < 0.5) continue; const s = projetar(f.pos.x, 1.0, f.pos.z); const d = Math.hypot(s.x - mx, s.y - my); if (d < dist) { dist = d; melhor = { figura: f.id }; } }
      if (melhor) return melhor;
      dist = 12;
      for (const p of sim.pacotes.values()) { const s = projetar(p.pos.x, (p.pos.y || 0.76) + 0.15, p.pos.z); const d = Math.hypot(s.x - mx, s.y - my); if (d < dist) { dist = d; melhor = { pacote: p.id }; } }
      return melhor;
    }
    ligarCliqueEHover(canvas, cam, laco, alvoEm, opcoes);
    redimensionar();
    return {
      tipo: '2d', canvas,
      atualizar(dir, op) { ultimoDir = dir; sim.aplicar(dir, op); laco.pedir(); },
      redimensionar, ancorar: (id, el, altura, op) => { ancoras.ancorar(id, el, altura, op); laco.pedir(); },
      recentrar() { cam.recentrar(); laco.pedir(); },
      ligar() { laco.ligar(); }, desligar() { laco.desligar(); }, pedirQuadro() { laco.pedir(); },
      get rodando() { return laco.rodando; },
      destruir() { laco.destruir(); ancoras.limpar(); if (canvas.parentNode) canvas.parentNode.removeChild(canvas); },
    };
  }

  // Monta o motor que der: 3D com WebGL; sem ele, o 2D. `preferir` força um.
  function montar(host, opcoes) {
    const op = opcoes || {};
    const sim = criarSimulacao();
    let motor = null;
    if (op.preferir !== '2d') { try { motor = criarMotor3d(host, sim, op); } catch (e) { motor = null; if (op.aoFalhar) op.aoFalhar(e); } }
    if (!motor) motor = criarMotor2d(host, sim, op);
    motor.sim = sim;
    return motor;
  }

  window.hubEscritorioCena = { montar, criarSimulacao, criarCamera, zoomParaCaber, escalaDosCartoes, LIMIAR_COMPACTO, CORES };
})();
