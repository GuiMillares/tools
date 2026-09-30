// Consumo de CPU e memória do Hub de verdade (ADR-106). Abre o Electron com o
// main.js e o renderer reais e mede a abertura, o app parado, a navegação
// pelas ferramentas, o terminal cheio, o IPC e a planilha do lote.
//
//     node tools/medir-recursos.js                  rodada completa (~4 min)
//     node tools/medir-recursos.js --aberturas 5    + 5 aberturas com o perfil já usado (padrão 3)
//     node tools/medir-recursos.js --so-abertura    só as aberturas (~1 min), para mudanças no main.js
//     node tools/medir-recursos.js --cenarios ocioso,minimizado   só esses cenários
//     node tools/medir-recursos.js --throttling     religa a desaceleração em 2º plano (ADR-094)
//     node tools/medir-recursos.js --por-cima       janela de teste sempre na frente (medida limpa)
//     node tools/medir-recursos.js --ocioso 120     app parado por 120 s (padrão 60)
//     node tools/medir-recursos.js --linhas 1000,5500,20000,50000
//     node tools/medir-recursos.js --css ".layout{grid-template-rows:minmax(0,1fr)}"
//                                                   mede com um CSS a mais, sem editar o app
//     node tools/medir-recursos.js --json r.json    guarda tudo em JSON
//     node tools/medir-recursos.js --manter         não apaga a pasta descartável
//
// Nada do Hub instalado é tocado. A pasta de dados (--user-data-dir, a mesma
// saída da ADR-088), Documentos (onde vão os logs, ADR-096), Músicas e
// Downloads apontam para uma pasta temporária sem credencial nenhuma, então
// nenhuma etapa consegue mexer em produção. Além disso, toda rede (http, https,
// tls, dns, fetch, e o que as janelas pedirem), a área de transferência e o
// shell.openExternal ficam bloqueados e contados: o relatório diz se houve
// alguma tentativa.
//
// Uma janela do Hub abre e se mexe sozinha durante a medição. Não mexa nela:
// clique e rolagem entram na conta, e minimizada ela não desenha. Minimizada
// no meio da navegação, do terminal ou da planilha, que esperam a janela
// desenhar, a medição para na hora e diz por quê.
//
// Consumo "na tela" só vale com prova de que a janela desenhou (ADR-126 e
// ADR-130). Antes da janela de CPU do parado e do minimizado, o motor conta os
// quadros que a janela apresenta em 2 s e anota se ela estava minimizada,
// visível e em foco, o tamanho dela e a frequência da tela. Parada e na tela,
// ela apresenta 1 quadro; com uma animação infinita suave, ~60; em degraus,
// ~4. Minimizada, 0 ou 1: a contagem sozinha não separa a janela parada da
// minimizada, e por isso o estado entra junto. O parado com a janela
// minimizada ou escondida na hora da prova, ou minimizada no meio, sai no
// relatório como inválido, não como consumo: sem essa prova, a janela de
// teste que alguém minimizou mede ~0,2% com qualquer animação.
//
// Como funciona: este arquivo é carregado com `electron -r` ANTES do main.js
// (o mesmo jeito que o Playwright usa) e, dentro do Electron, vira o "motor",
// que redireciona as pastas, cronometra os require() do main.js, dirige a tela
// por executeJavaScript e lê CPU e memória por app.getAppMetrics() e pelo
// protocolo do DevTools. Fora do Electron, é o orquestrador que abre e lê.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// A planilha do Publicar em massa, a mesma do bench.js.
function gerarLinhas(n) {
  const linhas = [['Razão Social', 'Domínio', 'Link do painel', 'Link do caso', 'Link temporário']];
  for (let i = 1; i <= n; i++) {
    const k = String(i).padStart(5, '0');
    linhas.push([
      i % 3 ? `Clínica São João ${i} Ltda - ME` : `COMERCIO DE PECAS ${i} EIRELI`,
      i % 4 === 0 ? `https://www.cliente${i}.com.br/` : `cliente${i}.com.br`,
      `https://idealplus.idealtrends.io/clientes/${2000 + i}/hub?projeto=${3000 + i}&tab=publicacao`,
      i % 2 ? `https://buscacliente.lightning.force.com/lightning/r/Case/500Hs00001${k}AAA/view` : '',
      `cliente${i}.mpitemporario.com.br`,
    ]);
  }
  return linhas;
}

if (process.versions.electron && process.env.HUB_MEDIR_SAIDA) {
  motor();
} else if (require.main === module) {
  orquestrador().catch((e) => { console.error(e); process.exit(1); });
}

// =====================================================================
// Motor: roda dentro do processo principal do Electron, antes do main.js.
// =====================================================================

function motor() {
  const { app, session } = require('electron');
  const Module = require('module');

  const SANDBOX = process.env.HUB_MEDIR_SANDBOX;
  const SAIDA = process.env.HUB_MEDIR_SAIDA;
  const CFG = JSON.parse(process.env.HUB_MEDIR_CFG || '{}');
  const epoch = () => performance.timeOrigin + performance.now();
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  // Cenários que esperam a janela desenhar (requestAnimationFrame): com ela
  // minimizada, eles não andam.
  const PRECISA_DESENHAR = new Set(['navegacao', 'terminal', 'planilha']);

  const out = {
    versoes: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, v8: process.versions.v8 },
    cfg: CFG,
    marcos: { shim: epoch() },
    requires: [],
    fotos: [],
    cenarios: [],
    amostras: [],
    bloqueios: [],
    // Janela minimizada, restaurada, escondida ou mostrada, e tela bloqueada ou
    // desbloqueada, com a hora: a prova de quadros é só do começo do cenário.
    janelaMudou: [],
    erros: [],
  };
  const marcos = out.marcos;

  process.on('uncaughtException', (e) => out.erros.push(`exceção não tratada: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`));
  process.on('unhandledRejection', (e) => out.erros.push(`promessa rejeitada sem catch: ${e && e.message ? e.message : e}`));

  // 1. Tudo que é do usuário vai para a pasta descartável.
  const PASTAS = { userData: 'userData', documents: 'Documentos', music: 'Musicas', downloads: 'Downloads', desktop: 'Desktop' };
  for (const [nome, sub] of Object.entries(PASTAS)) {
    const p = path.join(SANDBOX, sub);
    fs.mkdirSync(p, { recursive: true });
    app.setPath(nome, p);
  }

  // 2. gc() no processo principal, para medir o que fica vivo.
  let gcPrincipal = typeof global.gc === 'function' ? global.gc : null;
  if (!gcPrincipal) {
    try { require('v8').setFlagsFromString('--expose_gc'); gcPrincipal = require('vm').runInNewContext('gc'); } catch (e) { /* segue sem */ }
  }

  // 3. Rede, área de transferência e navegador externo: bloqueados e contados.
  bloquearSaidas(out.bloqueios);
  app.on('session-created', (ses) => guardarSessao(ses));

  // 4. Quanto custa o main.js inteiro e cada require() que ele faz.
  const MAIN = path.join(ROOT, 'main.js');
  const carregar = Module._load;
  Module._load = function (request, parent, isMain) {
    if (isMain === true || request === MAIN) {
      if (!marcos.mainJsInicio) marcos.mainJsInicio = epoch();
      try { return carregar.apply(this, arguments); } finally { if (!marcos.mainJs) marcos.mainJs = epoch(); }
    }
    if (!parent || parent.filename !== MAIN) return carregar.apply(this, arguments);
    const t = performance.now();
    const h = process.memoryUsage().heapUsed;
    try {
      return carregar.apply(this, arguments);
    } finally {
      const modulo = path.isAbsolute(request) ? path.relative(ROOT, request).replace(/\\/g, '/') : request;
      out.requires.push({ modulo, ms: performance.now() - t, heapMB: (process.memoryUsage().heapUsed - h) / 2 ** 20, quando: epoch() });
    }
  };

  app.once('ready', () => { marcos.ready = epoch(); });

  let janela = null;
  app.on('browser-window-created', (e, w) => {
    if (janela) return;
    janela = w;
    marcos.janela = epoch();
    // --throttling: religa a desaceleração do Chromium em segundo plano, que o
    // main.js desliga (backgroundThrottling: false, ADR-094), sem editar o app.
    if (CFG.throttling) w.webContents.setBackgroundThrottling(true);
    // --por-cima: a janela de teste fica na frente de tudo. Encoberta pelas
    // janelas de quem está usando a máquina, ela desenha menos e o que depende
    // de quadro (até aparecer, até o quadro) mede a espera, não o Hub.
    if (CFG.porCima) w.setAlwaysOnTop(true, 'floating');
    // Minimizar ou esconder a janela no meio de um cenário tira o valor dele,
    // e a prova de quadros não vê: ela é contada antes. Os eventos não custam
    // nada e cobrem o resto; o relatório diz em que cenário foi.
    for (const ev of ['minimize', 'restore', 'hide', 'show']) w.on(ev, () => out.janelaMudou.push({ ev, t: epoch(), cenario: cenarioAtual }));
    // Minimizada por fora num cenário que espera a janela desenhar, a medição
    // não anda e ficaria parada até o prazo de 20 min. Como com a janela
    // fechada, grava o que já foi medido e diz por que parou. (O cenário
    // minimizado minimiza entre os cenários, fora desta conta.)
    w.on('minimize', () => {
      if (out.marcos.fim || !PRECISA_DESENHAR.has(cenarioAtual)) return;
      out.erros.push(`a janela de teste foi minimizada no meio do cenário "${cenarioAtual}", que espera a janela desenhar: a medição parou`);
      terminar(1);
    });
    w.webContents.once('did-finish-load', () => { marcos.carregou = epoch(); });
    w.webContents.on('console-message', (ev, nivel, mensagem) => { if (nivel >= 3) out.erros.push(`console da janela: ${mensagem}`); });
    w.webContents.on('render-process-gone', (ev, d) => out.erros.push(`a janela caiu: ${d.reason}`));
    // Fechada por fora (alguém clicou no X da janela de teste): grava o que já
    // foi medido e diz por que parou, em vez de sair calado sem resultado.
    w.on('closed', () => {
      if (out.marcos.fim) return;
      out.erros.push('a janela de teste foi fechada antes do fim da medição');
      terminar(1);
    });
  });

  let amostrador = null;
  let cenarioAtual = 'abertura';
  let tAnterior = 0;
  // Um lugar só chama getAppMetrics: o percentCPUUsage é "desde a última
  // chamada", então cada amostra guarda a própria janela de tempo (dt).
  const amostrar = () => {
    const t = epoch();
    const dt = tAnterior ? t - tAnterior : 0;
    tAnterior = t;
    const procs = app.getAppMetrics().map((p) => ({
      pid: p.pid,
      tipo: p.type,
      nome: p.serviceName || p.name || '',
      criado: p.creationTime,
      cpu: p.cpu.percentCPUUsage,
      ws: p.memory.workingSetSize,
      pico: p.memory.peakWorkingSetSize,
      priv: p.memory.privateBytes ?? null,
    }));
    out.amostras.push({ t, dt, cenario: cenarioAtual, procs });
    return procs;
  };

  app.whenReady().then(() => {
    guardarSessao(session.defaultSession);
    // Com a tela bloqueada, o Windows também não mostra a janela.
    const { powerMonitor } = require('electron');
    for (const ev of ['lock-screen', 'unlock-screen']) powerMonitor.on(ev, () => out.janelaMudou.push({ ev, t: epoch(), cenario: cenarioAtual }));
    amostrar();
    amostrador = setInterval(amostrar, CFG.intervaloMs || 1000);
    setTimeout(() => rodar().catch((e) => { out.erros.push(`medição parou: ${e.stack || e.message}`); terminar(1); }), 0);
  });

  function terminar(codigo = 0) {
    if (out.marcos.fim) return; // já gravou: a janela fechando depois não reescreve o motivo
    if (amostrador) clearInterval(amostrador);
    try { amostrar(); } catch (e) { /* a janela pode já ter ido */ }
    out.marcos.fim = epoch();
    fs.writeFileSync(SAIDA, JSON.stringify(out));
    app.exit(codigo);
  }

  async function ate(cond, prazoMs, motivo, passoMs = 25) {
    const fim = Date.now() + prazoMs;
    while (Date.now() < fim) {
      if (await cond()) return;
      await dormir(passoMs);
    }
    throw new Error(motivo);
  }

  async function rodar() {
    setTimeout(() => { out.erros.push('passou do prazo total da medição'); terminar(1); }, CFG.prazoMs || 20 * 60e3).unref();

    await ate(() => janela && marcos.carregou, 90e3, 'a janela do Hub não carregou');
    const wc = janela.webContents;
    const naJanela = (fn, ...a) => wc.executeJavaScript(`(${fn})(...${JSON.stringify(a)})`, true);
    // A tela inicial desenhada (o campo do WHOIS) é o sinal de que o init() terminou.
    await ate(() => naJanela(() => typeof state !== 'undefined' && !!document.getElementById('whoisDominio')).catch(() => false), 90e3, 'o init() do renderer não terminou');
    marcos.pronto = epoch();
    marcos.processo = (app.getAppMetrics().find((p) => p.type === 'Browser') || {}).creationTime || performance.timeOrigin;
    const cpuAbertura = process.cpuUsage();
    // --css: mede uma mudança de estilo proposta sem editar o app (antes/depois).
    if (CFG.css) await wc.insertCSS(CFG.css);

    // Protocolo do DevTools na janela: heap, nós do DOM, listeners, tempo de
    // layout e de script, CPU do processo da janela, e GC sob demanda.
    // O HeapProfiler fica ligado só durante o GC: ligado o tempo todo, ele
    // deixa o layout ~40% mais lento com o terminal cheio e distorce a medida.
    const dbg = wc.debugger;
    dbg.attach('1.3');
    await dbg.sendCommand('Performance.enable');
    const perf = async () => Object.fromEntries((await dbg.sendCommand('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const gcNaJanela = async () => {
      await dbg.sendCommand('HeapProfiler.enable');
      await dbg.sendCommand('HeapProfiler.collectGarbage');
      await dbg.sendCommand('HeapProfiler.disable');
    };

    const p0 = await perf();
    out.abertura = {
      cpuPrincipalMs: (cpuAbertura.user + cpuAbertura.system) / 1000,
      cpuJanelaMs: (p0.ProcessTime || 0) * 1000,
    };

    // A foto força GC nos dois lados: o que sobra é o que está vivo. A CPU que
    // ela gasta é descontada do cenário em que ela foi tirada.
    const desconto = { principalMs: 0, janelaMs: 0 };
    const foto = async (rotulo, { gc = true } = {}) => {
      const c0 = process.cpuUsage();
      const q0 = await perf();
      if (gc) {
        for (let i = 0; i < 2; i++) {
          await gcNaJanela();
          if (gcPrincipal) gcPrincipal();
        }
        // O GC pelo DevTools às vezes não finaliza os nós do DOM já soltos, e a
        // contagem sai velha; o gc() da própria janela (--expose-gc) finaliza.
        await naJanela(() => { if (window.gc) { gc(); gc(); } return true; });
        await dormir(250);
      }
      const q = await perf();
      const dom = await naJanela(() => ({ elementos: document.getElementsByTagName('*').length, linhasTerminal: el.terminal.childElementCount, buffer: logBuffer.length }));
      const mem = process.memoryUsage();
      const c = process.cpuUsage(c0);
      desconto.principalMs += (c.user + c.system) / 1000;
      desconto.janelaMs += ((q.ProcessTime || 0) - (q0.ProcessTime || 0)) * 1000;
      const f = {
        rotulo,
        cenario: cenarioAtual,
        gc,
        t: epoch(),
        procs: amostrar(),
        janela: { heapMB: q.JSHeapUsedSize / 2 ** 20, heapTotalMB: q.JSHeapTotalSize / 2 ** 20, nos: q.Nodes, listeners: q.JSEventListeners, layoutObjects: q.LayoutObjects, documentos: q.Documents },
        principal: { heapMB: mem.heapUsed / 2 ** 20, heapTotalMB: mem.heapTotal / 2 ** 20, rssMB: mem.rss / 2 ** 20, externoMB: mem.external / 2 ** 20 },
        dom,
      };
      out.fotos.push(f);
      return f;
    };

    const cenario = async (nome, fn) => {
      if (PRECISA_DESENHAR.has(nome) && janela.isMinimized()) {
        out.erros.push(`a janela de teste estava minimizada quando o cenário "${nome}" ia começar, e ele espera a janela desenhar: a medição parou`);
        terminar(1);
        return;
      }
      amostrar(); // fecha a janela de CPU do trecho anterior, que é dele
      cenarioAtual = nome;
      const t0 = epoch();
      const c0 = process.cpuUsage();
      const q0 = await perf();
      const d0 = { ...desconto };
      let extra = {};
      try {
        extra = (await fn()) || {};
      } catch (e) {
        extra = { erro: e.message };
        out.erros.push(`${nome}: ${e.stack || e.message}`);
      }
      amostrar();
      const q1 = await perf();
      const c = process.cpuUsage(c0);
      const dif = (k) => ((q1[k] || 0) - (q0[k] || 0)) * 1000;
      out.cenarios.push({
        nome,
        inicio: t0,
        fim: epoch(),
        ms: epoch() - t0,
        cpuPrincipalMs: (c.user + c.system) / 1000 - (desconto.principalMs - d0.principalMs),
        cpuJanelaMs: dif('ProcessTime') - (desconto.janelaMs - d0.janelaMs),
        scriptMs: dif('ScriptDuration'),
        layoutMs: dif('LayoutDuration'),
        estiloMs: dif('RecalcStyleDuration'),
        layouts: (q1.LayoutCount || 0) - (q0.LayoutCount || 0),
        ...extra,
      });
      cenarioAtual = 'entre cenários';
    };

    // Prova de que a janela desenhou (ADR-126): quantos quadros ela apresenta
    // em 2 s. É contada ANTES da janela de CPU do cenário, porque a captura
    // custa CPU, e guarda o que explica o número: minimizada, visível, em
    // foco, o tamanho da janela e a frequência da tela.
    const { screen } = require('electron');
    const provaDeQuadros = async () => {
      const t0 = epoch();
      let quadros = 0;
      wc.beginFrameSubscription(false, () => { quadros++; });
      await dormir(2000);
      wc.endFrameSubscription();
      // Cada quadro chega ao processo principal como uma imagem da janela
      // inteira: o GC delas fica aqui, fora da conta do cenário.
      if (gcPrincipal) gcPrincipal();
      await dormir(500);
      const b = janela.getBounds();
      const tela = screen.getDisplayMatching(b);
      return {
        t0,
        segundos: 2,
        quadros,
        minimizada: janela.isMinimized(),
        visivel: janela.isVisible(),
        foco: janela.isFocused(),
        janela: { largura: b.width, altura: b.height },
        tela: { largura: tela.size.width, altura: tela.size.height, escala: tela.scaleFactor, hz: tela.displayFrequency },
      };
    };

    const cenarios = CFG.cenarios || ['abertura', 'ocioso', 'minimizado', 'navegacao', 'terminal', 'ipc', 'planilha'];

    // ---- abertura: memória 3 s depois de pronta ----
    await cenario('abertura', async () => {
      await dormir(3000);
      await foto('pronto + 3 s, como a pessoa vê', { gc: false });
      await foto('pronto + 3 s, só o que está vivo');
    });

    if (cenarios.includes('ocioso')) {
      const prova = await provaDeQuadros();
      await cenario('ocioso', async () => {
        await dormir((CFG.ocioso || 60) * 1000);
        await foto('fim do ocioso', { gc: false });
        return { prova };
      });
    }

    // O Hub minimizado enquanto a pessoa usa outra coisa. Com a janela fora da
    // tela não há o que desenhar; o que gastar aqui é gasto à toa. Ela
    // minimiza antes da prova de quadros e só volta depois da janela de CPU:
    // a prova e o redesenho da volta ficam fora da conta.
    if (cenarios.includes('minimizado')) {
      janela.minimize();
      await dormir(1000);
      const prova = await provaDeQuadros();
      await cenario('minimizado', async () => {
        await dormir((CFG.ocioso || 60) * 1000);
        await foto('fim do minimizado', { gc: false });
        return { prova };
      });
      janela.restore();
      await dormir(800);
    }

    if (cenarios.includes('navegacao')) {
      await cenario('navegacao', async () => {
        const ids = await naJanela(() => TOOLS.map((t) => t.id));
        const voltas = CFG.navegacao || 15;
        const tempos = {};
        const marcas = new Set([1, Math.ceil(voltas / 2), voltas]);
        const vazamento = [];
        for (let v = 1; v <= voltas; v++) {
          const r = await naJanela(umaVoltaDeNavegacao, ids);
          for (const [id, par] of Object.entries(r)) (tempos[id] ||= []).push(par);
          if (marcas.has(v)) {
            const f = await foto(`navegação, volta ${v}`);
            vazamento.push({ volta: v, heapJanelaMB: f.janela.heapMB, nos: f.janela.nos, listeners: f.janela.listeners, heapPrincipalMB: f.principal.heapMB });
          }
        }
        return { voltas, ferramentas: ids, tempos, vazamento };
      });
    }

    if (cenarios.includes('terminal')) {
      await cenario('terminal', async () => {
        await naJanela(() => { el.clearLogBtn.click(); return true; });
        const base = await foto('terminal limpo');
        const marcasLinhas = CFG.linhas || [1000, 5500, 20000];
        const pontos = [];
        let semente = 0;
        for (const alvo of marcasLinhas) {
          // Enche com o mesmo logLineElement() que o log() usa (o DOM é o
          // mesmo), mas de uma vez: pelo log() linha a linha, chegar a 20 mil
          // levaria horas, que é justamente o problema medido logo abaixo.
          const enche = await naJanela(encherTerminal, alvo, semente);
          semente = enche.proximo;
          const inicioRajada = epoch();
          const rajada = await naJanela(rajadaNoTerminal, 10, 5, semente);
          const fimRajada = epoch();
          semente += 100;
          const f = await foto(`terminal com ${alvo} linhas`);
          const ws = somaProcs(f.procs, 'Tab');
          // Pico da janela enquanto os log() rodavam (antes do GC da foto).
          const picoRajada = out.amostras.filter((a) => a.t >= inicioRajada && a.t <= fimRajada + 1500).reduce((m, a) => Math.max(m, somaProcs(a.procs, 'Tab').ws), 0);
          pontos.push({ encheuAte: alvo, linhas: f.dom.linhasTerminal, encherMs: enche.ms, ...rajada, nos: f.janela.nos, heapJanelaMB: f.janela.heapMB, wsJanelaMB: ws.ws / 1024, privJanelaMB: ws.priv / 1024, picoJanelaDuranteLogMB: picoRajada / 1024, heapPrincipalMB: f.principal.heapMB, buffer: f.dom.buffer });
        }
        await naJanela(() => { el.clearLogBtn.click(); return true; });
        const limpo = await foto('depois de limpar o terminal');
        await dormir(1200); // a fila do arquivo grava a cada 0,5 s
        const dirLogs = path.join(SANDBOX, 'Documentos', 'Hub', 'logs');
        const arquivos = fs.existsSync(dirLogs) ? fs.readdirSync(dirLogs).map((f) => ({ arquivo: f, bytes: fs.statSync(path.join(dirLogs, f)).size, linhas: fs.readFileSync(path.join(dirLogs, f), 'utf-8').split('\n').filter(Boolean).length })) : [];
        return {
          pontos,
          base: { heapJanelaMB: base.janela.heapMB, nos: base.janela.nos, wsJanelaMB: somaProcs(base.procs, 'Tab').ws / 1024 },
          depoisDeLimpar: { heapJanelaMB: limpo.janela.heapMB, nos: limpo.janela.nos, wsJanelaMB: somaProcs(limpo.procs, 'Tab').ws / 1024, privJanelaMB: somaProcs(limpo.procs, 'Tab').priv / 1024, buffer: limpo.dom.buffer },
          arquivoDeLog: arquivos,
        };
      });
    }

    if (cenarios.includes('ipc')) {
      await cenario('ipc', async () => {
        const r = await naJanela(medirIpc, CFG.ipc || 500);
        return { ipc: { hubState: resumir(r.hubState), rodada: resumir(r.rodada) } };
      });
    }

    if (cenarios.includes('planilha')) {
      await cenario('planilha', async () => {
        const XLSX = require('xlsx');
        const tamanhos = CFG.planilhas || [32, 300, 3000];
        const cargas = [];
        for (const n of tamanhos) {
          const linhas = gerarLinhas(n);
          const texto = linhas.map((l) => l.join('\t')).join('\r\n');
          const r = await naJanela(carregarPlanilhaNoLote, { texto }, `bench ${n} linhas`);
          const f = await foto(`lote com ${n} linhas (texto colado)`);
          cargas.push({ origem: 'texto colado', n, ...r, heapJanelaMB: f.janela.heapMB, nos: f.janela.nos, wsJanelaMB: somaProcs(f.procs, 'Tab').ws / 1024 });
        }
        for (const n of tamanhos.filter((x) => x >= 300)) {
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gerarLinhas(n)), 'Sites');
          const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
          const r = await naJanela(carregarPlanilhaNoLote, { nome: 'planilha.xlsx', base64 }, `bench ${n} linhas xlsx`);
          const f = await foto(`lote com ${n} linhas (.xlsx)`);
          cargas.push({ origem: '.xlsx', n, ...r, heapJanelaMB: f.janela.heapMB, nos: f.janela.nos, wsJanelaMB: somaProcs(f.procs, 'Tab').ws / 1024 });
        }
        await naJanela(() => { goHome(); return true; });
        return { cargas };
      });
    }

    if (cenarios.length > 1) {
      await cenario('final', async () => {
        await dormir(2000);
        await foto('fim, como a pessoa vê', { gc: false });
        await foto('fim, só o que está vivo');
      });
    }

    // Prova de que as pastas foram redirecionadas: o que o Hub gravou está aqui.
    out.gravadoNaPastaDescartavel = listarArquivos(SANDBOX).filter((f) => !/[\\/](Cache|Code Cache|GPUCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache|blob_storage|Shared Dictionary|Session Storage|Local Storage)[\\/]/.test(f)).slice(0, 40);
    terminar(0);
  }

  function guardarSessao(ses) {
    if (!ses || ses.__hubMedir) return;
    ses.__hubMedir = true;
    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => {
      out.bloqueios.push({ origem: 'janela', alvo: String(d.url).replace(/([?&](token|key|access_token|code)=)[^&]+/gi, '$1…').slice(0, 200), quando: epoch() });
      cb({ cancel: true });
    });
  }

  function bloquearSaidas(registro) {
    const { EventEmitter } = require('events');
    const anota = (origem, alvo) => {
      registro.push({ origem, alvo: String(alvo || '?').slice(0, 200), quando: epoch() });
      const e = new Error(`bloqueado pela medição de recursos (${origem})`);
      e.code = 'EHUBMEDIR';
      return e;
    };
    // Nunca lança na hora: devolve algo com cara de requisição que falha no
    // tique seguinte, para o main.js tratar como erro de rede comum.
    const falsa = (e) => {
      const r = new EventEmitter();
      for (const m of ['write', 'setHeader', 'removeHeader', 'flushHeaders', 'setNoDelay', 'setSocketKeepAlive']) r[m] = () => true;
      for (const m of ['end', 'setTimeout', 'destroy', 'abort']) r[m] = () => r;
      r.getHeader = () => undefined;
      process.nextTick(() => { if (r.listenerCount('error')) r.emit('error', e); });
      return r;
    };
    const alvoDe = (a) => (typeof a === 'string' ? a : a instanceof URL ? a.href : a ? `${a.protocol || ''}//${a.hostname || a.host || '?'}${a.path || ''}` : '?');
    for (const nome of ['http', 'https']) {
      const mod = require(nome);
      mod.request = (a) => falsa(anota(`${nome}.request`, alvoDe(a)));
      mod.get = (a) => falsa(anota(`${nome}.get`, alvoDe(a)));
    }
    const tls = require('tls');
    tls.connect = (a, b) => falsa(anota('tls.connect', typeof a === 'object' ? a.servername || a.host : b || a));
    const dns = require('dns');
    const nomesDns = ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveAny', 'resolveCname', 'resolveMx', 'resolveNs', 'resolveTxt', 'resolveSoa', 'resolveSrv', 'resolveCaa', 'reverse'];
    for (const f of nomesDns) {
      if (typeof dns[f] === 'function') dns[f] = (h, ...resto) => { const cb = resto.pop(); const e = anota(`dns.${f}`, h); process.nextTick(() => typeof cb === 'function' && cb(e)); };
      if (typeof dns.promises[f] === 'function') dns.promises[f] = async (h) => { throw anota(`dns.promises.${f}`, h); };
      const R = dns.promises.Resolver;
      if (R && typeof R.prototype[f] === 'function') R.prototype[f] = async function (h) { throw anota(`Resolver.${f}`, h); };
      const Rc = dns.Resolver;
      if (Rc && typeof Rc.prototype[f] === 'function') Rc.prototype[f] = function (h, ...resto) { const cb = resto.pop(); const e = anota(`dns.Resolver.${f}`, h); process.nextTick(() => typeof cb === 'function' && cb(e)); };
    }
    if (typeof globalThis.fetch === 'function') globalThis.fetch = async (u) => { throw anota('fetch', alvoDe(u)); };
    const { shell, clipboard } = require('electron');
    try { shell.openExternal = async (u) => { anota('shell.openExternal', u); }; } catch (e) { /* segue */ }
    try { clipboard.writeText = (t) => { anota('clipboard.writeText', `${String(t).length} caracteres`); }; } catch (e) { /* segue */ }
  }
}

function somaProcs(procs, tipo) {
  return procs.filter((p) => !tipo || p.tipo === tipo).reduce((s, p) => ({ ws: s.ws + (p.ws || 0), priv: s.priv + (p.priv || 0) }), { ws: 0, priv: 0 });
}

function resumir(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { n: s.length, medianaMs: q(0.5), p95Ms: q(0.95), p99Ms: q(0.99), maxMs: s[s.length - 1], mediaMs: s.reduce((a, b) => a + b, 0) / Math.max(1, s.length) };
}

function listarArquivos(dir, base = dir) {
  let r = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) r = r.concat(listarArquivos(p, base));
    else r.push(path.relative(base, p));
  }
  return r;
}

// ---- funções que rodam DENTRO da janela (vão como texto, sem closure) ----

async function umaVoltaDeNavegacao(ids) {
  const quadro = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const tempos = {};
  for (const id of ids) {
    const t0 = performance.now();
    await openTool(id);
    const t1 = performance.now();
    await quadro();
    tempos[id] = [t1 - t0, performance.now() - t0];
    goHome();
    await quadro();
  }
  const t0 = performance.now();
  openSettings();
  await quadro();
  tempos.configuracoes = [0, performance.now() - t0];
  closeSettings();
  await quadro();
  return tempos;
}

async function encherTerminal(ate, semente) {
  const tipos = ['info', 'info', 'info', 'info', 'info', 'info', 'cmd', 'cmd', 'success', 'success', 'warn', 'error'];
  const frases = [
    'GET https://api.cloudflare.com/client/v4/zones?name=DOM',
    'Zona de DOM já existe na Cloudflare com 14 registros; o A da raiz está no IP antigo 149.18.102.58.',
    'Painel: DOM já está publicado em produção, só vinculo.',
    'Registro.br: o contato técnico de DOM é nosso; o DNS entra.',
    'Analytics: propriedade achada pelo data stream https://www.DOM (G-ABC123XYZ9); reaproveito.',
    'Tag Manager: container GTM-5XK2L9P publicado com 15 tags, 15 acionadores e 4 variáveis.',
    'SSL: DOM ainda resolve para 200.147.10.20; o certificado fica para depois da propagação, que leva até 2 horas no Registro.br.',
    'Planilha: linha escrita na aba MPI.',
  ];
  const t0 = performance.now();
  let n = 0;
  let i = semente || 0;
  const hora = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  while (el.terminal.childElementCount < ate) {
    const frag = document.createDocumentFragment();
    for (let k = 0; k < 500 && el.terminal.childElementCount + k < ate; k++, i++, n++) {
      frag.appendChild(logLineElement({ seq: i, ts: hora, message: `[${i}] ${frases[i % frases.length].replace(/DOM/g, `cliente${i % 97}.com.br`)}`, type: tipos[i % tipos.length] }));
    }
    el.terminal.appendChild(frag);
    await new Promise((r) => setTimeout(r, 0));
  }
  el.terminal.scrollTop = el.terminal.scrollHeight;
  return { adicionadas: n, ms: performance.now() - t0, proximo: i };
}

// log() de verdade com o terminal já cheio: `n` seguidas (o custo de cada
// uma) e `isoladas` esperando o quadro (quanto demora para aparecer).
async function rajadaNoTerminal(n, isoladas, semente) {
  const quadro = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  await quadro();
  const cada = [];
  for (let k = 0; k < n; k++) {
    const a = performance.now();
    log(`[rajada ${semente + k}] Painel: cliente${k}.com.br sincronizado (Integrações, Search Console e Relatório).`, 'success');
    cada.push(performance.now() - a);
  }
  await quadro();
  const ate = [];
  for (let k = 0; k < isoladas; k++) {
    const a = performance.now();
    log(`[isolada ${semente + k}] Aguardando cliente${k}.com.br: ainda resolve para 200.147.10.20. Confiro de novo em 1 min.`, 'info');
    await quadro();
    ate.push(performance.now() - a);
  }
  cada.sort((a, b) => a - b);
  ate.sort((a, b) => a - b);
  return { porLinhaMs: cada[Math.floor(cada.length / 2)], porLinhaMaxMs: cada[cada.length - 1], isoladaMedianaMs: ate[Math.floor(ate.length / 2)], isoladaMaxMs: ate[ate.length - 1] };
}

async function medirIpc(n) {
  const r = { hubState: [], rodada: [] };
  for (let i = 0; i < n; i++) { const t = performance.now(); await window.api.getHubState(); r.hubState.push(performance.now() - t); }
  for (let i = 0; i < Math.round(n / 2); i++) { const t = performance.now(); await window.api.lerRodada(); r.rodada.push(performance.now() - t); }
  return r;
}

async function carregarPlanilhaNoLote(payload, nome) {
  const quadro = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  if (state.view !== 'bulk') { await openTool('bulk'); await quadro(); }
  const t0 = performance.now();
  const res = await window.api.lerPlanilha(payload);
  const t1 = performance.now();
  if (!res.ok) return { erro: res.error };
  carregarBulk(res.linhas, nome);
  const t2 = performance.now();
  await quadro();
  const t3 = performance.now();
  return { linhas: res.linhas.length, ipcMs: t1 - t0, montarMs: t2 - t1, quadroMs: t3 - t2, totalMs: t3 - t0, elementos: document.getElementsByTagName('*').length };
}

// =====================================================================
// Orquestrador: roda no Node, abre o Electron, lê o resultado e resume.
// =====================================================================

async function orquestrador() {
  const { spawn } = require('child_process');
  const args = process.argv.slice(2);
  const valor = (nome, padrao) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : padrao; };
  const aberturas = Number(valor('--aberturas', 3));
  const cfg = {
    ocioso: Number(valor('--ocioso', 60)),
    navegacao: Number(valor('--navegacao', 15)),
    linhas: String(valor('--linhas', '1000,5500,20000')).split(',').map(Number).filter(Boolean),
    css: valor('--css', ''),
    throttling: args.includes('--throttling'),
    porCima: args.includes('--por-cima'),
    prazoMs: 20 * 60e3,
  };
  // --cenarios ocioso,minimizado: só esses (a abertura sempre roda).
  if (valor('--cenarios', '')) cfg.cenarios = ['abertura', ...String(valor('--cenarios')).split(',').map((s) => s.trim()).filter(Boolean)];
  const saidaJson = valor('--json', '');
  const manter = args.includes('--manter');
  const soAbertura = args.includes('--so-abertura');

  const electron = require('electron'); // fora do Electron, é o caminho do executável
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-medir-'));
  const so = cfg.cenarios || [];
  const segundos = soAbertura ? 15
    : cfg.cenarios ? 15 + cfg.ocioso * so.filter((c) => c === 'ocioso' || c === 'minimizado').length + (so.includes('navegacao') ? cfg.navegacao * 2 : 0) + (so.includes('terminal') ? cfg.linhas.reduce((s, n) => s + n, 0) / 700 : 0) + (so.includes('planilha') ? 10 : 0)
    : cfg.ocioso * 2 + 60 + cfg.navegacao * 2 + cfg.linhas.reduce((s, n) => s + n, 0) / 700;
  const minutos = Math.ceil((segundos + aberturas * 15) / 60);
  console.log(`\nMedição de recursos do Hub — ${new Date().toLocaleString('pt-BR')}`);
  console.log(`Uma janela do Hub de teste vai abrir e se mexer sozinha por uns ${minutos} min. Não mexa nela.`);
  if (cfg.css) console.log(`CSS injetado depois de abrir (comparação antes/depois): ${cfg.css}`);
  if (cfg.throttling) console.log('Com a desaceleração do Chromium em segundo plano religada (--throttling).');
  console.log(`Pasta descartável: ${sandbox}\n`);

  const rodarElectron = (cfgRodada, rotulo) => new Promise((resolve) => {
    const saida = path.join(sandbox, `resultado-${rotulo}.json`);
    const env = { ...process.env, HUB_MEDIR_SAIDA: saida, HUB_MEDIR_SANDBOX: sandbox, HUB_MEDIR_CFG: JSON.stringify(cfgRodada) };
    delete env.ELECTRON_RUN_AS_NODE;
    const t0 = Date.now();
    const filho = spawn(electron, ['-r', __filename, `--user-data-dir=${path.join(sandbox, 'userData')}`, '--js-flags=--expose-gc', ROOT], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    filho.stdout.on('data', (d) => { log += d; });
    filho.stderr.on('data', (d) => { log += d; });
    const prazo = setTimeout(() => filho.kill(), cfgRodada.prazoMs + 60e3);
    filho.on('exit', (codigo) => {
      clearTimeout(prazo);
      fs.writeFileSync(path.join(sandbox, `electron-${rotulo}.log`), log);
      let r = null;
      try { r = JSON.parse(fs.readFileSync(saida, 'utf-8')); } catch (e) { /* sem resultado */ }
      resolve({ codigo, r, spawnEm: t0, log });
    });
  });

  process.stdout.write(soAbertura ? 'Abertura com perfil novo… ' : 'Rodada completa (perfil novo)… ');
  const completa = await rodarElectron(soAbertura ? { cenarios: ['abertura'], css: cfg.css, prazoMs: 3 * 60e3 } : cfg, 'completa');
  if (!completa.r) {
    console.log(`\nO Electron saiu com código ${completa.codigo} sem resultado. Saída:\n${completa.log.slice(-3000)}`);
    process.exit(1);
  }
  console.log(`ok (${((completa.r.marcos.fim - completa.r.marcos.processo) / 1000).toFixed(0)} s)`);

  const aberturasUsado = [];
  for (let i = 1; i <= aberturas; i++) {
    process.stdout.write(`Abertura ${i} de ${aberturas} (perfil já usado)… `);
    const a = await rodarElectron({ cenarios: ['abertura'], css: cfg.css, prazoMs: 3 * 60e3 }, `abertura-${i}`);
    if (a.r) { aberturasUsado.push(a.r); console.log(`ok (${((a.r.marcos.pronto - a.r.marcos.processo) / 1000).toFixed(1)} s até pronta)`); }
    else console.log(`falhou (código ${a.codigo})`);
  }

  const relatorio = montarRelatorio(completa.r, aberturasUsado);
  console.log(relatorio.texto);

  if (saidaJson) {
    fs.writeFileSync(path.resolve(saidaJson), JSON.stringify({ quando: new Date().toISOString(), maquina: maquina(), resumo: relatorio.resumo, completa: completa.r, aberturasPerfilUsado: aberturasUsado }, null, 2));
    console.log(`\nResultado completo em ${path.resolve(saidaJson)}`);
  }
  if (manter) console.log(`Pasta descartável mantida: ${sandbox}`);
  else fs.rmSync(sandbox, { recursive: true, force: true });
  const problemas = completa.r.erros.length + completa.r.bloqueios.length;
  process.exit(problemas ? 2 : 0);
}

function maquina() {
  const c = os.cpus();
  return { cpu: c[0].model.trim(), nucleos: c.length, memoriaGB: +(os.totalmem() / 2 ** 30).toFixed(1), livreGB: +(os.freemem() / 2 ** 30).toFixed(1), so: `${os.type()} ${os.release()}` };
}

// ---------- relatório ----------

const ROTULO_TIPO = { Browser: 'principal', Tab: 'janela', GPU: 'GPU', Utility: 'utilitário' };
function rotuloProc(p) {
  if (p.tipo === 'Utility') {
    if (/network/i.test(p.nome)) return 'rede';
    if (/storage/i.test(p.nome)) return 'armazenamento';
    return `utilitário${p.nome ? ` (${p.nome.replace(/\.mojom\..*$/i, '')})` : ''}`;
  }
  return ROTULO_TIPO[p.tipo] || p.tipo;
}

function porRotulo(procs) {
  const m = {};
  for (const p of procs) {
    const k = rotuloProc(p);
    const x = (m[k] ||= { ws: 0, priv: 0, cpu: 0, n: 0 });
    x.ws += p.ws || 0;
    x.priv += p.priv || 0;
    x.cpu += p.cpu || 0;
    x.n++;
  }
  return m;
}

// CPU média de cada processo num cenário, ponderada pela janela de cada
// amostra. O percentCPUUsage do Electron já vem dividido pelo número de
// núcleos: 100% = a máquina inteira, a mesma conta do Gerenciador de Tarefas
// (conferido contra o tempo de CPU do DevTools e do process.cpuUsage).
function cpuDoCenario(amostras, nome) {
  const doCenario = amostras.filter((a) => a.cenario === nome && a.dt > 0);
  const soma = {};
  const max = {};
  let tempo = 0;
  for (const a of doCenario) {
    tempo += a.dt;
    let total = 0;
    for (const [k, v] of Object.entries(porRotulo(a.procs))) {
      soma[k] = (soma[k] || 0) + v.cpu * a.dt;
      max[k] = Math.max(max[k] || 0, v.cpu);
      total += v.cpu;
    }
    soma.total = (soma.total || 0) + total * a.dt;
    max.total = Math.max(max.total || 0, total);
  }
  const media = Object.fromEntries(Object.entries(soma).map(([k, v]) => [k, tempo ? v / tempo : 0]));
  return { media, max, amostras: doCenario.length, segundos: tempo / 1000 };
}

// Consumo "na tela" só vale com prova de que a janela desenhou (ADR-126). Tira
// o valor de um cenário: no parado na tela, a janela minimizada ou escondida
// na hora da prova; no minimizado, a janela que não minimizou; em qualquer
// um, mexerem na janela ou bloquearem a tela no meio dele. Sem motivo
// conhecido, 0 quadros com a janela na tela é só aviso: pode ser outra janela
// por cima, ou a tela bloqueada antes de o cenário começar.
const NOME_MUDANCA = { minimize: 'minimizada', restore: 'restaurada', hide: 'escondida', show: 'mostrada', 'lock-screen': 'tela bloqueada', 'unlock-screen': 'tela desbloqueada' };
function validadeDoCenario(c, mudancas) {
  const p = c.prova;
  const motivos = [];
  if (p) {
    const q = `${p.quadros} ${p.quadros === 1 ? 'quadro' : 'quadros'} em ${p.segundos} s`;
    if (c.nome === 'minimizado') {
      if (!p.minimizada) motivos.push(`a janela não estava minimizada (${q})`);
    } else if (p.minimizada || !p.visivel) {
      const estado = p.minimizada ? 'minimizada' : 'escondida';
      motivos.push(p.quadros ? `a janela estava ${estado} (${q})` : `${q} com a janela ${estado}: ela não desenhou`);
    }
  }
  const noMeio = (mudancas || []).filter((x) => x.t >= (p ? p.t0 : c.inicio) && x.t <= c.fim);
  if (noMeio.length) motivos.push(`a janela mudou no meio da medida (${noMeio.map((x) => `${NOME_MUDANCA[x.ev] || x.ev} ${x.t < c.inicio ? 'durante a prova de quadros' : `aos ${((x.t - c.inicio) / 1000).toFixed(0)} s`}`).join(', ')})`);
  if (motivos.length) return { invalido: motivos.join('; ') };
  if (p && !p.quadros && c.nome !== 'minimizado') return { aviso: `0 quadros em ${p.segundos} s com a janela nem minimizada nem escondida (outra janela por cima? tela bloqueada?): nada prova que ela desenhou; meça com --por-cima` };
  return {};
}

// A prova de quadros de um cenário, numa linha do relatório.
function linhaDaProva(p) {
  const sn = (b) => (b ? 'sim' : 'não');
  const escala = p.tela.escala && p.tela.escala !== 1 ? ` (escala ${p.tela.escala})` : '';
  return `quadros em ${p.segundos} s (antes da medida): ${p.quadros} · minimizada: ${sn(p.minimizada)} · visível: ${sn(p.visivel)} · em foco: ${sn(p.foco)} · janela ${p.janela.largura}×${p.janela.altura} · tela ${p.tela.largura}×${p.tela.altura}${escala}, ${p.tela.hz} Hz`;
}

function montarRelatorio(r, aberturasUsado) {
  const L = [];
  const mb = (kb) => `${(kb / 1024).toFixed(0)} MB`;
  const ms = (x) => (x >= 1000 ? `${(x / 1000).toFixed(2)} s` : `${x.toFixed(x < 10 ? 2 : 0)} ms`);
  const pct = (x) => `${x.toFixed(x < 10 ? 1 : 0)}%`;
  const m = r.marcos;
  const nucleos = os.cpus().length;
  const resumo = {};

  L.push(`\n${'='.repeat(78)}\nHub ${require(path.join(ROOT, 'package.json')).version} · Electron ${r.versoes.electron} (Chromium ${r.versoes.chrome}, Node ${r.versoes.node})`);
  const mq = maquina();
  L.push(`${mq.cpu} · ${mq.nucleos} núcleos lógicos · ${mq.memoriaGB} GB (${mq.livreGB} GB livres agora) · ${mq.so}`);

  // ---- abertura ----
  const fase = (a, b, mm = m) => (mm[a] && mm[b] ? mm[b] - mm[a] : NaN);
  if (r.cfg && r.cfg.css) L.push(`CSS injetado depois de abrir: ${r.cfg.css}`);
  if (r.cfg && r.cfg.throttling) L.push('Desaceleração do Chromium em segundo plano religada (--throttling)');
  L.push(`\nABERTURA (perfil novo, primeira vez)`);
  L.push(`  processo → Electron pronto para JS   ${ms(fase('processo', 'shim')).padStart(9)}`);
  L.push(`  → main.js começa                     ${ms(fase('shim', 'mainJsInicio')).padStart(9)}`);
  L.push(`  main.js (topo do arquivo e requires)  ${ms(fase('mainJsInicio', 'mainJs')).padStart(9)}`);
  L.push(`  → app pronto (ready)                 ${ms(fase('mainJs', 'ready')).padStart(9)}`);
  L.push(`  → janela criada                      ${ms(fase('ready', 'janela')).padStart(9)}`);
  L.push(`  → página carregada                   ${ms(fase('janela', 'carregou')).padStart(9)}`);
  L.push(`  → tela inicial pronta (init)         ${ms(fase('carregou', 'pronto')).padStart(9)}`);
  L.push(`  TOTAL até a tela inicial pronta      ${ms(fase('processo', 'pronto')).padStart(9)}`);
  const reqs = r.requires.filter((q) => q.quando <= (m.ready || Infinity)).sort((a, b) => b.ms - a.ms).slice(0, 5);
  L.push(`  require() mais caros do main.js na abertura:`);
  for (const q of reqs) L.push(`    ${q.modulo.padEnd(22)} ${ms(q.ms).padStart(9)}   heap ${q.heapMB >= 0 ? '+' : ''}${q.heapMB.toFixed(1)} MB`);
  resumo.abertura = { perfilNovoMs: fase('processo', 'pronto'), fases: { electron: fase('processo', 'shim'), ateMainJs: fase('shim', 'mainJsInicio'), mainJs: fase('mainJsInicio', 'mainJs'), ready: fase('mainJs', 'ready'), janela: fase('ready', 'janela'), carregou: fase('janela', 'carregou'), pronto: fase('carregou', 'pronto') }, requires: reqs };
  if (aberturasUsado.length) {
    const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const totais = aberturasUsado.map((a) => a.marcos.pronto - a.marcos.processo).sort((a, b) => a - b);
    const mainJs = aberturasUsado.map((a) => fase('mainJsInicio', 'mainJs', a.marcos));
    // O require mais caro de cada abertura (hoje é o que domina o main.js).
    const maisCaros = aberturasUsado.map((a) => a.requires.filter((q) => q.quando <= (a.marcos.ready || Infinity)).sort((x, y) => y.ms - x.ms)[0] || { modulo: '?', ms: NaN });
    const nomeMaisCaro = maisCaros[0].modulo;
    const fotosUsado = aberturasUsado.map((a) => a.fotos.find((f) => f.rotulo.startsWith('pronto + 3 s, como'))).filter(Boolean);
    const heapPrincipal = fotosUsado.map((f) => f.principal.heapMB);
    const wsPrincipal = fotosUsado.map((f) => somaProcs(f.procs, 'Browser').ws / 1024);
    const wsTotal = fotosUsado.map((f) => somaProcs(f.procs).ws / 1024);
    L.push(`  Perfil já usado (${totais.length}x): mediana ${ms(med(totais))} até pronta (de ${ms(totais[0])} a ${ms(totais[totais.length - 1])}); main.js ${ms(med(mainJs))}; require mais caro: ${nomeMaisCaro} ${ms(med(maisCaros.map((q) => q.ms)))}`);
    if (fotosUsado.length) L.push(`  Memória 3 s depois de abrir (mediana): principal ${med(wsPrincipal).toFixed(0)} MB de working set e ${med(heapPrincipal).toFixed(1)} MB de heap JS; total ${med(wsTotal).toFixed(0)} MB`);
    resumo.abertura.perfilUsadoMedianaMs = med(totais);
    resumo.abertura.perfilUsadoMainJsMs = med(mainJs);
    resumo.abertura.perfilUsadoRequireMaisCaro = { modulo: nomeMaisCaro, ms: med(maisCaros.map((q) => q.ms)) };
    if (fotosUsado.length) resumo.abertura.perfilUsadoMemoria = { wsPrincipalMB: med(wsPrincipal), heapPrincipalMB: med(heapPrincipal), wsTotalMB: med(wsTotal) };
    resumo.abertura.perfilUsadoTodosMs = totais;
  }
  if (r.abertura) L.push(`  CPU gasta até pronta: principal ${ms(r.abertura.cpuPrincipalMs)} · janela ${ms(r.abertura.cpuJanelaMs)}`);

  // ---- memória por processo ----
  const fotoDe = (rotulo) => r.fotos.find((f) => f.rotulo.startsWith(rotulo));
  const tabelaMem = (f, titulo) => {
    L.push(`\n${titulo}`);
    L.push(`  ${'processo'.padEnd(26)} ${'working set'.padStart(11)} ${'privada'.padStart(9)}`);
    const pr = porRotulo(f.procs);
    let tw = 0;
    let tp = 0;
    for (const [k, v] of Object.entries(pr).sort((a, b) => b[1].ws - a[1].ws)) {
      L.push(`  ${`${k}${v.n > 1 ? ` (${v.n})` : ''}`.padEnd(26)} ${mb(v.ws).padStart(11)} ${mb(v.priv).padStart(9)}`);
      tw += v.ws;
      tp += v.priv;
    }
    L.push(`  ${'TOTAL'.padEnd(26)} ${mb(tw).padStart(11)} ${mb(tp).padStart(9)}`);
    L.push(`  heap JS: principal ${f.principal.heapMB.toFixed(1)} MB · janela ${f.janela.heapMB.toFixed(1)} MB · ${f.janela.nos} nós no DOM · ${f.janela.listeners} listeners`);
    return { totalWsMB: tw / 1024, totalPrivMB: tp / 1024, porProcesso: Object.fromEntries(Object.entries(pr).map(([k, v]) => [k, { wsMB: v.ws / 1024, privMB: v.priv / 1024 }])), heapPrincipalMB: f.principal.heapMB, heapJanelaMB: f.janela.heapMB, nos: f.janela.nos, listeners: f.janela.listeners };
  };
  const fAbertura = fotoDe('pronto + 3 s, como');
  if (fAbertura) resumo.memoriaAbertura = tabelaMem(fAbertura, 'MEMÓRIA 3 s DEPOIS DE ABRIR (sem forçar GC, como o Gerenciador de Tarefas vê)');

  // ---- parado: na tela e minimizado ----
  for (const [nomeC, titulo] of [['ocioso', 'PARADO NA TELA INICIAL'], ['minimizado', 'PARADO E MINIMIZADO']]) {
    const ocioso = r.cenarios.find((c) => c.nome === nomeC);
    if (!ocioso) continue;
    const c = cpuDoCenario(r.amostras, nomeC);
    const v = validadeDoCenario(ocioso, r.janelaMudou);
    L.push(`\n${titulo} (${c.segundos.toFixed(0)} s, ${c.amostras} amostras; % da máquina inteira, como o Gerenciador de Tarefas; ${nucleos} núcleos = 100%)`);
    if (ocioso.prova) L.push(`  ${linhaDaProva(ocioso.prova)}`);
    if (v.invalido) {
      // Não é consumo do Hub: os números ficam numa linha só, para quem for
      // investigar, e não na tabela.
      L.push(`  INVÁLIDO: ${v.invalido}. Não é o consumo do Hub ${nomeC === 'minimizado' ? 'minimizado' : 'na tela'}; meça de novo sem mexer na janela de teste.`);
      L.push(`  (o que se mediu assim: ${Object.entries(c.media).filter(([k]) => k !== 'total').sort((a, b) => b[1] - a[1]).map(([k, x]) => `${k} ${pct(x)}`).join(' · ')} · total ${pct(c.media.total || 0)})`);
    } else {
      if (v.aviso) L.push(`  SEM PROVA: ${v.aviso}.`);
      for (const [k, x] of Object.entries(c.media).filter(([k]) => k !== 'total').sort((a, b) => b[1] - a[1])) L.push(`  ${k.padEnd(26)} média ${pct(x).padStart(6)}   pico ${pct(c.max[k] || 0).padStart(6)}`);
      L.push(`  ${'TOTAL'.padEnd(26)} média ${pct(c.media.total || 0).padStart(6)}   pico ${pct(c.max.total || 0).padStart(6)}   (≈ ${((c.media.total || 0) * nucleos / 100).toFixed(2)} núcleo)`);
      L.push(`  conferência pelo tempo de CPU: principal ${ms(ocioso.cpuPrincipalMs)} em ${ms(ocioso.ms)} (${pct((ocioso.cpuPrincipalMs / ocioso.ms) * 100 / nucleos)} da máquina); janela ${ms(ocioso.cpuJanelaMs)} (${pct((ocioso.cpuJanelaMs / ocioso.ms) * 100 / nucleos)})`);
    }
    resumo[nomeC] = { segundos: c.segundos, cpuMediaPorProcesso: c.media, cpuPicoPorProcesso: c.max, cpuPrincipalPeloTempoPctMaquina: (ocioso.cpuPrincipalMs / ocioso.ms) * 100 / nucleos, cpuJanelaPeloTempoPctMaquina: (ocioso.cpuJanelaMs / ocioso.ms) * 100 / nucleos, prova: ocioso.prova || null, valido: !v.invalido, invalido: v.invalido || null, semProva: v.aviso || null };
  }

  // ---- navegação ----
  const nav = r.cenarios.find((c) => c.nome === 'navegacao');
  if (nav && nav.tempos) {
    L.push(`\nNAVEGAÇÃO (${nav.voltas} voltas pelas ${nav.ferramentas.length} ferramentas + configurações; clique até o quadro na tela)`);
    L.push(`  ${'ferramenta'.padEnd(26)} ${'1ª vez'.padStart(9)} ${'mediana'.padStart(9)} ${'pior'.padStart(9)}`);
    const tabela = {};
    for (const [id, pares] of Object.entries(nav.tempos)) {
      const vals = pares.map((p) => p[1]);
      const resto = vals.slice(1).sort((a, b) => a - b);
      const med = resto.length ? resto[Math.floor(resto.length / 2)] : vals[0];
      tabela[id] = { primeiraMs: vals[0], medianaMs: med, piorMs: Math.max(...vals) };
      L.push(`  ${id.padEnd(26)} ${ms(vals[0]).padStart(9)} ${ms(med).padStart(9)} ${ms(Math.max(...vals)).padStart(9)}`);
    }
    const c = cpuDoCenario(r.amostras, 'navegacao');
    L.push(`  CPU durante a navegação (média, % da máquina): principal ${pct(c.media.principal || 0)} · janela ${pct(c.media.janela || 0)} · GPU ${pct(c.media.GPU || 0)}`);
    L.push(`  Vazamento? Heap e DOM depois de GC, por volta:`);
    for (const v of nav.vazamento) L.push(`    volta ${String(v.volta).padStart(2)}: janela ${v.heapJanelaMB.toFixed(2)} MB · ${v.nos} nós · ${v.listeners} listeners · principal ${v.heapPrincipalMB.toFixed(2)} MB`);
    const a = nav.vazamento[0];
    const b = nav.vazamento[nav.vazamento.length - 1];
    const voltas = Math.max(1, b.volta - a.volta);
    L.push(`    por volta: heap da janela ${(((b.heapJanelaMB - a.heapJanelaMB) * 1024) / voltas).toFixed(0)} KB · ${((b.nos - a.nos) / voltas).toFixed(1)} nós · ${((b.listeners - a.listeners) / voltas).toFixed(1)} listeners · principal ${(((b.heapPrincipalMB - a.heapPrincipalMB) * 1024) / voltas).toFixed(0)} KB`);
    resumo.navegacao = { tabela, cpuMedia: c.media, vazamento: nav.vazamento, porVolta: { heapJanelaKB: ((b.heapJanelaMB - a.heapJanelaMB) * 1024) / voltas, nos: (b.nos - a.nos) / voltas, listeners: (b.listeners - a.listeners) / voltas, heapPrincipalKB: ((b.heapPrincipalMB - a.heapPrincipalMB) * 1024) / voltas } };
  }

  // ---- terminal ----
  const term = r.cenarios.find((c) => c.nome === 'terminal');
  if (term && term.pontos) {
    L.push(`\nTERMINAL CHEIO (cada linha nova pelo log() de verdade; memória depois de GC)`);
    // "encheu até" é quantas linhas o cenário mandou; "na tela" é quantas
    // ficaram (o terminal guarda só as últimas, ADR-109).
    L.push(`  ${'encheu até'.padStart(10)} ${'na tela'.padStart(8)} ${'log() cada'.padStart(11)} ${'até aparecer'.padStart(13)} ${'nós DOM'.padStart(9)} ${'heap JS'.padStart(8)} ${'RAM janela'.padStart(11)} ${'pico nos log()'.padStart(15)} ${'privada'.padStart(9)}`);
    for (const p of term.pontos) L.push(`  ${String(p.encheuAte ?? '').padStart(10)} ${String(p.linhas).padStart(8)} ${ms(p.porLinhaMs).padStart(11)} ${ms(p.isoladaMedianaMs).padStart(13)} ${String(p.nos).padStart(9)} ${`${p.heapJanelaMB.toFixed(1)} MB`.padStart(8)} ${`${p.wsJanelaMB.toFixed(0)} MB`.padStart(11)} ${`${(p.picoJanelaDuranteLogMB || 0).toFixed(0)} MB`.padStart(15)} ${`${p.privJanelaMB.toFixed(0)} MB`.padStart(9)}`);
    if (term.pontos.length > 1) {
      const a = term.pontos[0];
      const b = term.pontos[term.pontos.length - 1];
      const porLinha = (b.porLinhaMs - a.porLinhaMs) / Math.max(1, b.linhas - a.linhas);
      L.push(`  cada linha que já está no terminal encarece o próximo log() em ${(porLinha * 1000).toFixed(1)} µs; cada mil linhas custam ${(((b.wsJanelaMB - a.wsJanelaMB) / Math.max(1, b.linhas - a.linhas)) * 1000).toFixed(1)} MB de RAM na janela`);
    }
    L.push(`  terminal limpo antes: ${term.base.nos} nós · heap ${term.base.heapJanelaMB.toFixed(1)} MB · RAM ${term.base.wsJanelaMB.toFixed(0)} MB`);
    L.push(`  depois de "Limpar":   ${term.depoisDeLimpar.nos} nós · heap ${term.depoisDeLimpar.heapJanelaMB.toFixed(1)} MB · RAM ${term.depoisDeLimpar.wsJanelaMB.toFixed(0)} MB · privada ${term.depoisDeLimpar.privJanelaMB.toFixed(0)} MB (buffer de recorte: ${term.depoisDeLimpar.buffer} linhas)`);
    const c = cpuDoCenario(r.amostras, 'terminal');
    L.push(`  CPU no cenário (média, % da máquina): janela ${pct(c.media.janela || 0)} (≈ ${((c.media.janela || 0) * nucleos / 100).toFixed(1)} núcleo) · principal ${pct(c.media.principal || 0)} · GPU ${pct(c.media.GPU || 0)}`);
    for (const a of term.arquivoDeLog || []) L.push(`  arquivo de log (na pasta descartável): ${a.arquivo}, ${a.linhas} linhas, ${(a.bytes / 1024).toFixed(0)} KB`);
    resumo.terminal = { pontos: term.pontos, base: term.base, depoisDeLimpar: term.depoisDeLimpar, cpuMedia: c.media, arquivoDeLog: term.arquivoDeLog };
  }

  // ---- IPC ----
  const ipc = r.cenarios.find((c) => c.nome === 'ipc');
  if (ipc && ipc.ipc) {
    L.push(`\nIPC (janela → processo principal → janela)`);
    for (const [k, v] of Object.entries(ipc.ipc)) L.push(`  ${(k === 'hubState' ? 'getHubState (lê hub-state.json)' : 'lerRodada (lê rodada-em-massa.json)').padEnd(38)} mediana ${ms(v.medianaMs)} · p95 ${ms(v.p95Ms)} · p99 ${ms(v.p99Ms)} · pior ${ms(v.maxMs)} (${v.n}x)`);
    resumo.ipc = ipc.ipc;
  }

  // ---- planilha ----
  const pl = r.cenarios.find((c) => c.nome === 'planilha');
  if (pl && pl.cargas) {
    L.push(`\nPLANILHA NO PUBLICAR EM MASSA (lerPlanilha no principal + carregarBulk na janela)`);
    L.push(`  ${'entrada'.padEnd(22)} ${'ler (IPC)'.padStart(10)} ${'montar'.padStart(9)} ${'até o quadro'.padStart(13)} ${'total'.padStart(9)} ${'elementos'.padStart(10)} ${'heap'.padStart(9)}`);
    for (const x of pl.cargas) {
      if (x.erro) { L.push(`  ${`${x.n} (${x.origem})`.padEnd(22)} erro: ${x.erro}`); continue; }
      L.push(`  ${`${x.n} linhas, ${x.origem}`.padEnd(22)} ${ms(x.ipcMs).padStart(10)} ${ms(x.montarMs).padStart(9)} ${ms(x.quadroMs).padStart(13)} ${ms(x.totalMs).padStart(9)} ${String(x.elementos).padStart(10)} ${`${x.heapJanelaMB.toFixed(1)} MB`.padStart(9)}`);
    }
    resumo.planilha = pl.cargas;
  }

  // ---- CPU por cenário ----
  L.push(`\nCPU POR CENÁRIO (tempo de CPU gasto; GC forçado das fotos descontado)`);
  L.push(`  ${'cenário'.padEnd(14)} ${'duração'.padStart(9)} ${'principal'.padStart(10)} ${'janela'.padStart(9)} ${'script'.padStart(9)} ${'layout'.padStart(9)} ${'GPU % máq.'.padStart(10)}`);
  resumo.cpuPorCenario = {};
  for (const c of r.cenarios) {
    const g = cpuDoCenario(r.amostras, c.nome);
    const v = validadeDoCenario(c, r.janelaMudou);
    L.push(`  ${c.nome.padEnd(14)} ${ms(c.ms).padStart(9)} ${ms(c.cpuPrincipalMs).padStart(10)} ${ms(c.cpuJanelaMs).padStart(9)} ${ms(c.scriptMs).padStart(9)} ${ms(c.layoutMs).padStart(9)} ${pct(g.media.GPU || 0).padStart(10)}${v.invalido ? '   inválido' : v.aviso ? '   sem prova' : ''}`);
    resumo.cpuPorCenario[c.nome] = { ms: c.ms, cpuPrincipalMs: c.cpuPrincipalMs, cpuJanelaMs: c.cpuJanelaMs, scriptMs: c.scriptMs, layoutMs: c.layoutMs, layouts: c.layouts, gpuMediaPct: g.media.GPU || 0, ...(v.invalido ? { invalido: v.invalido } : {}) };
  }

  // ---- pico e fim ----
  let pico = { total: 0 };
  for (const a of r.amostras) {
    const t = a.procs.reduce((s, p) => s + (p.ws || 0), 0);
    if (t > pico.total) pico = { total: t, cenario: a.cenario, procs: a.procs };
  }
  const picoPor = pico.procs ? Object.entries(porRotulo(pico.procs)).sort((a, b) => b[1].ws - a[1].ws).map(([k, v]) => `${k} ${mb(v.ws)}`).join(' · ') : '';
  L.push(`\nPICO DE MEMÓRIA NA RODADA: ${mb(pico.total)} somando os processos (no cenário "${pico.cenario}": ${picoPor})`);
  resumo.picoTotalMB = pico.total / 1024;
  resumo.picoCenario = pico.cenario;
  const fFim = fotoDe('fim, como');
  if (fFim) resumo.memoriaFim = tabelaMem(fFim, 'MEMÓRIA NO FIM (tela inicial, depois de tudo, sem forçar GC)');

  // ---- segurança da medição ----
  L.push(`\nSEGURANÇA DA MEDIÇÃO`);
  L.push(`  tentativas de rede / área de transferência / navegador externo: ${r.bloqueios.length}${r.bloqueios.length ? '' : ' (nenhuma)'}`);
  for (const b of r.bloqueios.slice(0, 10)) L.push(`    ${b.origem}: ${b.alvo}`);
  // Mexer na janela no meio de um cenário atrapalha qualquer medida dele, não
  // só o parado. O que o próprio motor faz (minimizar e restaurar em volta do
  // minimizado) fica entre os cenários e não entra aqui. O cenário em que a
  // medição parou não chega a r.cenarios: vale o nome anotado no evento.
  const cenarioDe = (x) => r.cenarios.find((c) => x.t >= (c.prova ? c.prova.t0 : c.inicio) && x.t <= c.fim);
  const naoTerminou = (x) => x.t >= (m.pronto || Infinity) && x.cenario !== 'entre cenários' && !r.cenarios.some((c) => c.nome === x.cenario);
  const mexeram = (r.janelaMudou || []).filter((x) => cenarioDe(x) || naoTerminou(x)).map((x) => ({ ...x, cenario: cenarioDe(x) ? cenarioDe(x).nome : `${x.cenario}, que não terminou` }));
  L.push(`  janela minimizada, restaurada ou escondida, ou tela bloqueada, no meio de um cenário: ${mexeram.length ? mexeram.map((x) => `${NOME_MUDANCA[x.ev] || x.ev} (${x.cenario})`).join(', ') : 'não'}`);
  resumo.janelaMudou = mexeram;
  L.push(`  o que o Hub gravou foi para a pasta descartável: ${(r.gravadoNaPastaDescartavel || []).filter((f) => /hub-state|Hub[\\/]logs/.test(f)).join(', ') || '(nada reconhecido)'}`);
  L.push(`  erros: ${r.erros.length}${r.erros.length ? '' : ' (nenhum)'}`);
  for (const e of r.erros.slice(0, 10)) L.push(`    ${e}`);
  resumo.bloqueios = r.bloqueios;
  resumo.erros = r.erros;

  return { texto: L.join('\n'), resumo };
}

// O tools/test-medir-recursos.js monta o relatório sem abrir o Electron.
module.exports = { montarRelatorio, validadeDoCenario, linhaDaProva };
