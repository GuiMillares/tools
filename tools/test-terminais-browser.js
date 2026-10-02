// ADR-127 e ADR-128: a tela inicial sem a grade de ferramentas, a busca do
// topo e os dois terminais (Atividade e Git Bash), no renderer de verdade,
// num Chromium, com o xterm.js de verdade e um window.api falso (o bash é um
// dublê que registra o que recebe e devolve o que o teste manda).
//
//     node tools/test-terminais-browser.js

const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PAGINA = 'file://' + path.join(ROOT, 'renderer', 'index.html');

// Só o que o teste precisa responder de um jeito certo; o resto do window.api
// devolve { ok: true } (e os on*, uma função de cancelar).
const STUB = () => {
  const b = window.__bash = { abrir: [], escrito: [], tamanhos: [], fechar: 0, copiado: [], dados: null, saiu: null, whois: [] };
  const base = {
    loadCreds: async () => ({ ok: true, creds: { email: 'guilherme.millares@buscacliente.com.br', token: 'x' } }),
    getHubState: async () => ({ ok: true, state: { recents: [], brand: 'bc' } }),
    getMergeHistory: async () => ({ ok: true, entries: [] }),
    telemetria: async () => ({ ok: true, memMb: 300, cpuPct: 0.4, processos: 5, pid: 1 }),
    salesforceGetConfig: async () => ({ ok: true, conectado: false }),
    usuarioLogado: async () => ({ ok: true, nome: 'Guilherme Millares' }),
    // A tela de Configurações lê o config (a busca "conceder acesso" abre ela).
    getPublicacaoConfig: async () => ({ ok: true, config: { hestiaIpPublico: '149.18.102.39', hestiaServidorPadrao: '11', hestiaServidores: { 11: '192.168.3.143', 13: '192.168.3.157' } }, empresas: {} }),
    whois: async (p) => { b.whois.push(p); return { ok: true, dominio: p.dominio, dns: { ns: ['ns1.x.com'], a: ['1.2.3.4'], mx: [] }, whois: { campos: {} } }; },
    copyToClipboard: async (t) => { b.copiado.push(t); return { ok: true }; },
    // b.segurar (uma promessa) deixa a abertura pendurada, para o teste mandar
    // saída enquanto o Hub ainda espera o bash abrir.
    bashAbrir: async (p) => { b.abrir.push(p); if (b.segurar) await b.segurar; return { ok: true, shell: 'C:\\Git\\bin\\bash.exe', pid: 4242, build: 26200, conpty: 'node-pty' }; },
    bashEscrever: (d) => { b.escrito.push(d); },
    bashTamanho: (p) => { b.tamanhos.push(p); },
    bashFechar: async () => { b.fechar++; return { ok: true, fechou: true }; },
    onBashDados: (cb) => { b.dados = cb; return () => {}; },
    onBashSaiu: (cb) => { b.saiu = cb; return () => {}; },
  };
  window.api = new Proxy(base, {
    get: (alvo, nome) => (nome in alvo ? alvo[nome] : (typeof nome === 'string' && /^on[A-Z]/.test(nome) ? () => () => {} : async () => ({ ok: true }))),
  });
};

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HUB_CHROME || undefined });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  // A home pronta é a dos indicadores (ADR-138); o cartão de WHOIS saiu.
  const pronto = () => page.waitForFunction(() => typeof render === 'function' && !!document.getElementById('homeMetricas'), null, { timeout: 15000 });
  const colunas = () => page.evaluate(() => getComputedStyle(document.querySelector('.app-body')).gridTemplateColumns.split(' ').length);
  try {
    await page.addInitScript(STUB);
    await page.goto(PAGINA);
    await pronto();

    console.log('\n=== Tela inicial sem a grade de ferramentas (ADR-127) ===');
    check('não tem mais "Automações & scripts" (grade, busca, recentes)', await page.evaluate(() => !document.querySelector('.home-tools, #toolGrid, #hubSearch, .chip-row') && !/Automações &/.test(document.getElementById('leftPanel').textContent)));
    check('os indicadores e as filas estão na home; o cartão de WHOIS não (ADR-138)', await page.evaluate(() => !!document.getElementById('homeMetricas') && !!document.getElementById('homeFilas') && !document.getElementById('whoisDominio')));

    console.log('\n=== Busca do topo (Ctrl+K) ===');
    const busca = async (texto) => {
      await page.fill('#tbSearch', texto);
      await page.press('#tbSearch', 'Enter');
      await page.waitForTimeout(150);
      return page.evaluate(() => state.view);
    };
    check('"ouvid" abre a Ouvidoria', (await busca('ouvid')) === 'ouvidoria');
    check('sem acento conta igual: "publicacao em massa"', (await busca('publicacao em massa')) === 'bulk');
    check('acha também o que não tem atalho na lateral: "buscar propriedades"', (await busca('buscar propriedades')) === 'newproject' && (await page.evaluate(() => state.npTab)) === 'find');
    check('"conceder acesso" abre a aba das Configurações', (await busca('conceder acesso')) === 'config' && (await page.evaluate(() => state.cfgTab)) === 'acesso');
    check('e limpa a busca depois de abrir', (await page.inputValue('#tbSearch')) === '');
    // Um domínio não muda de tela: vira "whois <domínio>" no terminal (ADR-138).
    const antesDom = await page.evaluate(() => logBuffer.length);
    const viewDepois = await busca('https://www.cliente-teste.com.br/contato');
    check('um domínio consulta o WHOIS no terminal, sem sair da tela', viewDepois === 'config' && (await page.evaluate(() => window.__bash.whois.map((w) => w.dominio))).includes('cliente-teste.com.br') && (await page.evaluate((n) => logBuffer.slice(n).some((e) => e.type === 'cmd' && /^whois cliente-teste\.com\.br$/.test(e.message)), antesDom)));
    await page.evaluate(() => goHome());
    const n0 = await page.evaluate(() => logBuffer.length);
    await busca('zzqqxx');
    check('nada batendo: avisa no terminal, sem sair da tela', await page.evaluate((n) => logBuffer.slice(n).some((e) => e.type === 'warn' && /Nada no Hub/.test(e.message)) && state.view === 'home', n0));

    console.log('\n=== Atividade: minimizar, fechar, voltar ===');
    check('começa aberta, à direita (3 colunas)', (await colunas()) === 3 && (await page.isVisible('.terminal-header')));
    // O título numa linha e inteiro (quem encolhe primeiro é o PID ao lado).
    const titulo = () => page.evaluate(() => {
      const t = document.getElementById('terminalTitle');
      const caixa = t.getBoundingClientRect();
      const esquerda = t.parentElement.getBoundingClientRect();
      return { altura: Math.round(caixa.height), inteiro: t.scrollWidth <= t.clientWidth + 1 && caixa.right <= esquerda.right + 1 };
    });
    let tt = await titulo();
    check('o título fica numa linha e inteiro, mesmo com os botões novos', tt.altura <= 20 && tt.inteiro, JSON.stringify(tt));
    await page.setViewportSize({ width: 1240, height: 800 });
    tt = await titulo();
    check('também na janela padrão do Hub (1240 px)', tt.altura <= 20 && tt.inteiro, JSON.stringify(tt));
    // Onde não cabe tudo (1500 px), o PID some e o título termina em "…", sem quebrar.
    await page.setViewportSize({ width: 1500, height: 900 });
    const aperto = await page.evaluate(() => {
      const t = document.getElementById('terminalTitle');
      const m = document.getElementById('terminalMeta');
      return { altura: Math.round(t.getBoundingClientRect().height), reticencias: getComputedStyle(t).textOverflow, pid: Math.round(m.getBoundingClientRect().width), botoes: document.getElementById('atividadeFecharBtn').getBoundingClientRect().right <= window.innerWidth };
    });
    check('apertado, o PID some primeiro, o título termina em "…" e os botões ficam na tela', aperto.altura <= 20 && aperto.reticencias === 'ellipsis' && aperto.pid <= 2 && aperto.botoes, JSON.stringify(aperto));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.click('#atividadeMinBtn');
    check('minimizar deixa só um trilho', (await page.evaluate(() => document.querySelector('.app-body').classList.contains('atividade-min'))) && (await page.isVisible('#atividadeTrilho')) && !(await page.isVisible('.terminal-header')));
    const trilho = await page.evaluate(() => Math.round(document.querySelector('.terminal-panel').getBoundingClientRect().width));
    check('fino (38 px)', trilho <= 40, String(trilho));
    await page.evaluate(() => { log('linha 1'); log('linha 2', 'warn'); log('deu erro', 'error'); });
    check('o que chega minimizado vira um número no trilho e na lateral', await page.evaluate(() => document.getElementById('atividadeTrilhoN').textContent === '3' && !document.getElementById('atividadeTrilhoN').hidden && document.getElementById('navAtividadeN').textContent === '3'));
    check('vermelho, porque veio erro', await page.evaluate(() => document.getElementById('atividadeTrilhoN').classList.contains('erro')));
    await page.click('#atividadeTrilho');
    check('clicar no trilho devolve a Atividade e zera o número', (await colunas()) === 3 && (await page.evaluate(() => document.getElementById('navAtividadeN').hidden)));
    await page.click('#atividadeFecharBtn');
    check('fechar tira a coluna inteira', (await colunas()) === 2 && !(await page.isVisible('.terminal-panel')));
    const meio = await page.evaluate(() => Math.round(document.getElementById('leftPanel').getBoundingClientRect().width));
    check('e o painel do meio fica com a largura toda', meio >= 1600 - 236 - 2, String(meio));
    check('fica guardado nesta máquina', await page.evaluate(() => JSON.parse(localStorage.getItem('hub.terminais')).atividade === 'fechado'));
    await page.reload();
    await pronto();
    check('reabrindo o Hub, continua fechada', (await colunas()) === 2);
    await page.evaluate(() => { window.__resposta = perguntarNoTerminal('Continuar?', [{ valor: 's', rotulo: 'Sim' }]); });
    check('uma pergunta no terminal traz a Atividade de volta', (await colunas()) === 3 && (await page.isVisible('[data-ask="s"]')));
    await page.click('[data-ask="s"]');
    check('e a resposta chega a quem perguntou', (await page.evaluate(() => window.__resposta)) === 's');
    await page.click('#navAtividadeBtn');
    check('o botão da lateral esconde…', (await colunas()) === 2);
    await page.click('#navAtividadeBtn');
    check('…e mostra', (await colunas()) === 3);

    console.log('\n=== Git Bash ===');
    check('o xterm.js não carrega na abertura do Hub', await page.evaluate(() => typeof Terminal === 'undefined'));
    await page.click('#navBashBtn');
    await page.waitForFunction(() => window.__bash.abrir.length === 1, null, { timeout: 10000 });
    const aberto = await page.evaluate(() => ({
      visivel: !document.getElementById('bashDock').classList.contains('hidden'),
      xterm: !!document.querySelector('#bashCorpo .xterm'),
      pedido: window.__bash.abrir[0],
      altura: Math.round(document.getElementById('bashDock').getBoundingClientRect().height),
      vivo: !document.getElementById('navBashVivo').hidden,
    }));
    check('a lateral abre o Git Bash (o xterm.js carrega agora)', aberto.visivel && aberto.xterm && aberto.vivo, JSON.stringify(aberto));
    check('pede o bash já com o tamanho do painel', aberto.pedido.cols > 40 && aberto.pedido.rows > 5, JSON.stringify(aberto.pedido));
    await page.waitForTimeout(300);
    // Cada aviso de tamanho é um redesenho a mais do ConPTY (ADR-129).
    check('e não manda o tamanho de novo logo depois (o bash já nasceu com ele)', (await page.evaluate(() => window.__bash.tamanhos.length)) === 0, JSON.stringify(await page.evaluate(() => window.__bash.tamanhos)));
    check('300 px de altura na primeira vez', Math.abs(aberto.altura - 300) <= 2, String(aberto.altura));
    const pos = await page.evaluate(() => {
      const a = document.getElementById('leftPanel').getBoundingClientRect();
      const d = document.getElementById('bashDock').getBoundingClientRect();
      return { mesmaColuna: Math.abs(a.left - d.left) < 2 && Math.abs(a.width - d.width) < 2, embaixo: Math.abs(a.bottom - d.top) < 3, rodape: Math.round(window.innerHeight - d.bottom) };
    });
    check('embaixo do painel do meio, na mesma coluna, até o pé da janela', pos.mesmaColuna && pos.embaixo && pos.rodape <= 1, JSON.stringify(pos));
    check('a Atividade continua à direita', (await colunas()) === 3 && (await page.isVisible('.terminal-header')));
    // O xterm.js põe a classe "terminal" no elemento dele, a mesma do log: sem
    // o CSS do log ser só do #terminal, ele herdava recuo e rolagem e passava
    // da largura (barra de rolagem para o lado).
    const encaixe = await page.evaluate(() => { const x = document.querySelector('#bashCorpo .xterm'); const cs = getComputedStyle(x); return { sw: x.scrollWidth, cw: x.clientWidth, ox: cs.overflowX, oy: cs.overflowY }; });
    check('o terminal cabe no painel, sem rolar para o lado, e não herda o estilo do log', encaixe.sw <= encaixe.cw + 1 && encaixe.ox === 'visible' && encaixe.oy === 'visible', JSON.stringify(encaixe));

    await page.evaluate(() => window.__bash.dados('\u001b[32mguilherme.millares@PAT-02131 \u001b[35mMINGW64 \u001b[33m~/Pictures\u001b[36m (master)\u001b[0m\r\n$ '));
    await page.waitForTimeout(150);
    const linha = await page.evaluate(() => { const l = bashTerm.buffer.active.getLine(0); const c = l.getCell(0); return { texto: l.translateToString(true), cor: c.getFgColor(), paleta: c.isFgPalette() }; });
    check('a saída do bash aparece no terminal', /guilherme\.millares@PAT-02131 MINGW64 ~\/Pictures \(master\)/.test(linha.texto), linha.texto);
    check('com as cores do prompt (o usuário em verde)', linha.paleta === true && linha.cor === 2, JSON.stringify(linha));
    await page.evaluate(() => bashTerm.input('ls -la\r'));
    check('o que se digita vai para o bash', (await page.evaluate(() => window.__bash.escrito.join(''))).includes('ls -la\r'));

    await page.evaluate(() => { bashTerm.selectAll(); bashTerm.focus(); });
    await page.keyboard.press('Control+c');
    const copia = await page.evaluate(() => ({ copiado: window.__bash.copiado.slice(-1)[0] || '', ctrlc: window.__bash.escrito.includes('\u0003') }));
    check('Ctrl+C com texto selecionado copia (e não interrompe)', /MINGW64/.test(copia.copiado) && !copia.ctrlc, JSON.stringify(copia));
    await page.keyboard.press('Control+c');
    check('Ctrl+C sem seleção interrompe (o ^C vai para o bash)', await page.evaluate(() => window.__bash.escrito.includes('\u0003')));
    await page.keyboard.press('Control+k');
    const k = await page.evaluate(() => ({ foco: document.activeElement && document.activeElement.id, escrito: window.__bash.escrito.includes('\u000b') }));
    check('Ctrl+K digitando no bash é do bash, não da busca do Hub', k.foco !== 'tbSearch' && k.escrito, JSON.stringify(k));

    const alca = await page.locator('#bashArrasto').boundingBox();
    const x = alca.x + alca.width / 2;
    const y = alca.y + alca.height / 2;
    const linhasAntes = await page.evaluate(() => bashTerm.rows);
    const avisosAntes = await page.evaluate(() => window.__bash.tamanhos.length);
    // Como a mão: sobe devagar, passa do ponto e volta um pouco, ~30 ms por passo.
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (const alvo of [...Array(12).keys()].map((i) => y - (200 * (i + 1)) / 12).concat([...Array(8).keys()].map((i) => y - 200 + (80 * (i + 1)) / 8))) {
      await page.mouse.move(x, alvo);
      await page.waitForTimeout(30);
    }
    const avisosNoArrasto = await page.evaluate(() => window.__bash.tamanhos.length);
    const linhasNoArrasto = await page.evaluate(() => bashTerm.rows);
    await page.mouse.up();
    await page.waitForTimeout(300);
    const depois = await page.evaluate(() => ({
      altura: Math.round(document.getElementById('bashDock').getBoundingClientRect().height),
      salvo: JSON.parse(localStorage.getItem('hub.terminais')).bashAltura,
      linhas: bashTerm.rows,
      avisado: window.__bash.tamanhos.slice(-1)[0] || null,
      avisos: window.__bash.tamanhos.length,
    }));
    check('arrastar a borda de cima aumenta o Git Bash e guarda a altura', Math.abs(depois.altura - 420) <= 3 && Math.abs(depois.salvo - 420) <= 3, JSON.stringify(depois));
    // ADR-129: cada aviso de tamanho faz o ConPTY redesenhar a tela; dezenas
    // seguidas duplicavam e picavam as linhas.
    check('durante o arrasto o terminal se ajusta, mas o bash ainda não é avisado', linhasNoArrasto !== linhasAntes && avisosNoArrasto === avisosAntes, JSON.stringify({ linhasAntes, linhasNoArrasto, avisosAntes, avisosNoArrasto }));
    check('a mão parou: o bash fica sabendo do tamanho novo, uma vez só', depois.linhas > linhasAntes && depois.avisos === avisosAntes + 1 && !!depois.avisado && depois.avisado.rows === depois.linhas, JSON.stringify({ linhasAntes, avisosAntes, ...depois }));

    // O arrasto que não termina com "soltar" (Alt+Tab no meio, o mouse solto
    // fora): se o fim se perdesse, o bash nunca mais saberia do tamanho.
    const alca2 = await page.locator('#bashArrasto').boundingBox();
    await page.mouse.move(alca2.x + alca2.width / 2, alca2.y + alca2.height / 2);
    await page.mouse.down();
    await page.mouse.move(alca2.x + alca2.width / 2, alca2.y + alca2.height / 2 + 60, { steps: 4 });
    const antesDoBlur = await page.evaluate(() => ({ arrastando: bashArrastando, avisos: window.__bash.tamanhos.length }));
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(300);
    const depoisDoBlur = await page.evaluate(() => ({ arrastando: bashArrastando, avisos: window.__bash.tamanhos.length, linhas: bashTerm.rows, avisado: window.__bash.tamanhos.slice(-1)[0] }));
    await page.mouse.up();
    check('a janela perdeu o foco no meio do arrasto: o arrasto termina e o bash é avisado', antesDoBlur.arrastando === true && depoisDoBlur.arrastando === false && depoisDoBlur.avisos === antesDoBlur.avisos + 1 && depoisDoBlur.avisado.rows === depoisDoBlur.linhas, JSON.stringify({ antesDoBlur, depoisDoBlur }));
    // A borda desceu 60 px no caso acima: a posição dela é outra agora.
    const alca3 = await page.locator('#bashArrasto').boundingBox();
    await page.mouse.move(alca3.x + alca3.width / 2, alca3.y + alca3.height / 2);
    await page.mouse.down();
    await page.mouse.move(alca3.x + alca3.width / 2, alca3.y + alca3.height / 2 - 60, { steps: 4 });
    const comecou = await page.evaluate(() => bashArrastando);
    await page.evaluate(() => document.getElementById('bashArrasto').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 0, pointerId: 1, clientY: 10 })));
    const semBotao = await page.evaluate(() => bashArrastando);
    await page.mouse.up();
    await page.waitForTimeout(250);
    check('um movimento já sem o botão apertado também encerra o arrasto', comecou === true && semBotao === false, JSON.stringify({ comecou, semBotao }));

    // Redimensionar não descola a vista do fim (o prompt), e a saída nova
    // continua rolando sozinha; quem rolou para ler o histórico fica onde estava.
    await page.evaluate(() => new Promise((ok) => { let s = ''; for (let i = 1; i <= 120; i++) s += `hist-${i} ${'x'.repeat(60)}\r\n`; bashTerm.write(s + '$ ', ok); }));
    const vista = () => page.evaluate(() => { const v = bashTerm.buffer.active; return { viewportY: v.viewportY, baseY: v.baseY, linhas: bashTerm.rows }; });
    const arrastarBorda = async (dy) => {
      const a = await page.locator('#bashArrasto').boundingBox();
      const bx = a.x + a.width / 2; const by = a.y + a.height / 2;
      await page.mouse.move(bx, by); await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(bx, by + (dy * i) / 8); await page.waitForTimeout(20); }
      await page.mouse.up(); await page.waitForTimeout(250);
    };
    await arrastarBorda(-150);
    const v1 = await vista();
    await arrastarBorda(200);
    const v2 = await vista();
    await page.evaluate(() => new Promise((ok) => bashTerm.write('saída nova\r\n$ ', ok)));
    await page.waitForTimeout(80);
    const v3 = await vista();
    check('depois de aumentar e diminuir, a vista continua no fim (no prompt)', v1.viewportY === v1.baseY && v2.viewportY === v2.baseY && v1.linhas !== v2.linhas, JSON.stringify({ v1, v2 }));
    check('e a saída nova continua rolando sozinha', v3.viewportY === v3.baseY, JSON.stringify(v3));
    // Com a roda do mouse de verdade: ela rola a vista sem disparar o onScroll do xterm.js.
    const caixaBash = await page.locator('#bashCorpo').boundingBox();
    await page.mouse.move(caixaBash.x + caixaBash.width / 2, caixaBash.y + caixaBash.height / 2);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(250);
    const lendo = await vista();
    await arrastarBorda(-100);
    const v4 = await vista();
    check('quem rolou para ler o histórico não é jogado para o fim ao redimensionar', lendo.viewportY < lendo.baseY && v4.viewportY < v4.baseY, JSON.stringify({ lendo, v4 }));
    await page.evaluate(() => bashTerm.scrollToBottom());
    await arrastarBorda(100);
    const v5 = await vista();
    check('voltou para o fim: grudou de novo', v5.viewportY === v5.baseY, JSON.stringify(v5));

    await page.click('#bashMin');
    check('minimizar deixa só a barra', (await page.evaluate(() => document.getElementById('bashDock').classList.contains('min'))) && !(await page.isVisible('#bashCorpo')));
    await page.click('.bash-aba');
    check('clicar na barra devolve o terminal', await page.isVisible('#bashCorpo'));
    await page.click('#bashMax');
    const max = await page.evaluate(() => ({
      classe: document.querySelector('.app-body').classList.contains('bash-max'),
      meio: getComputedStyle(document.getElementById('leftPanel')).display,
      altura: Math.round(document.getElementById('bashDock').getBoundingClientRect().height),
      corpo: Math.round(document.querySelector('.app-body').getBoundingClientRect().height),
    }));
    check('maximizar ocupa a coluna do meio de cima a baixo', max.classe && max.meio === 'none' && Math.abs(max.altura - max.corpo) <= 2, JSON.stringify(max));
    await page.click('#bashMax');
    check('e restaura', await page.evaluate(() => !document.querySelector('.app-body').classList.contains('bash-max') && getComputedStyle(document.getElementById('leftPanel')).display !== 'none'));

    await page.click('#bashFechar');
    check('o × esconde o painel, mas o bash continua vivo', await page.evaluate(() => document.getElementById('bashDock').classList.contains('hidden') && !document.getElementById('navBashVivo').hidden && window.__bash.fechar === 0));
    await page.click('#navBashBtn');
    await page.waitForTimeout(150);
    check('reabrir volta ao mesmo bash (não abre outro)', await page.evaluate(() => !document.getElementById('bashDock').classList.contains('hidden') && window.__bash.abrir.length === 1));
    await page.keyboard.press('Control+Shift+Backquote');
    check("Ctrl+Shift+' esconde o Git Bash…", await page.evaluate(() => document.getElementById('bashDock').classList.contains('hidden')));
    await page.keyboard.press('Control+Shift+Backquote');
    await page.waitForTimeout(100);
    check('…e mostra de novo', await page.evaluate(() => !document.getElementById('bashDock').classList.contains('hidden')));

    await page.evaluate(() => window.__bash.saiu({ codigo: 0 }));
    await page.waitForTimeout(150);
    const fim = await page.evaluate(() => {
      const buf = bashTerm.buffer.active;
      const texto = [...Array(buf.length).keys()].map((i) => buf.getLine(i).translateToString(true)).join('\n');
      return { terminou: /o bash terminou/.test(texto), vivo: !document.getElementById('navBashVivo').hidden, nome: document.getElementById('bashNome').textContent };
    });
    check('o bash saindo sozinho avisa no terminal', fim.terminou && !fim.vivo && /encerrado/.test(fim.nome), JSON.stringify(fim));
    // O + com a abertura pendurada: enquanto o Hub espera, o ConPTY pergunta
    // quem é o terminal (ESC [ c). A resposta do xterm.js tem que ir; sem ela,
    // o ConPTY espera ~3 s para mostrar o prompt (ADR-129).
    await page.evaluate(() => { window.__bash.segurar = new Promise((r) => { window.__bash.soltar = r; }); });
    await page.click('#bashNovo');
    await page.waitForFunction(() => window.__bash.abrir.length === 2, null, { timeout: 5000 }).then(() => true, () => false).then((v) => check('o + abre outro bash', v));
    const escritoAntes = await page.evaluate(() => window.__bash.escrito.length);
    await page.evaluate(() => window.__bash.dados(String.fromCharCode(27) + '[c'));
    await page.waitForTimeout(150);
    const resposta = await page.evaluate((n) => window.__bash.escrito.slice(n).join(''), escritoAntes);
    check('a resposta do xterm.js à pergunta do ConPTY vai mesmo com o bash ainda abrindo', resposta.startsWith(String.fromCharCode(27) + '[?') && resposta.endsWith('c'), JSON.stringify(resposta));
    await page.evaluate(() => { window.__bash.segurar = null; window.__bash.soltar(); });
    await page.waitForTimeout(100);
    await page.click('#bashLixo');
    await page.waitForTimeout(150);
    check('a lixeira encerra o bash e fecha o painel', await page.evaluate(() => window.__bash.fechar === 1 && document.getElementById('bashDock').classList.contains('hidden') && document.getElementById('navBashVivo').hidden));

    const infinitas = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations === Infinity).length);
    check('nada anima para sempre com os terminais parados', infinitas === 0, String(infinitas));
    check('sem erro de console', erros.length === 0, erros.join(' | '));
  } catch (e) {
    falhas++;
    console.log(`  FALHOU  o teste quebrou no meio: ${e.message}`);
  } finally {
    await browser.close();
  }
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
