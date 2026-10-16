// ADR-165: o botão "Parar tudo" com o renderer INTEIRO (index.html: app.js +
// terminais.js + automacao-ui.js) num Chromium, com window.api falso. Prova
// que ele fica ao lado do interruptor da fila, desliga a fila (gravada
// desligada), pausa a lista de espera, pede às rodadas que parem, puxa o
// freio do processo principal e solta quando tudo parou, zera a memória da
// fila, tira da tela a publicação automática interrompida e deixa a manual; e
// que o site da lista interrompido no meio volta a esperar, não "falta algo".
//
//     node tools/test-parar-tudo-browser.js

const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const STUB = `
  window.__calls = [];
  const respostas = {
    getHubState: () => ({ ok: true, state: { bitbucketWorkspaces: { bc: 'bcws', mpisolutions: 'mpiws' } } }),
    loadCreds: () => ({ ok: true, creds: { email: 'eu@x.test', token: 'tok' } }),
    getGoogleConfig: () => ({ ok: true, config: { saPath: 'C:/sa.json' } }),
    msStatus: () => ({ ok: true, connected: true, email: 'eu@x.test' }),
    salesforceGetConfig: () => ({ ok: true, conectado: true }),
    salesforceTarefas: () => ({ ok: true, tarefas: [], filas: [], instancia: 'https://sf' }),
    usuarioLogado: () => ({ ok: true, nome: 'Teste', email: 'eu@x.test' }),
    getPublicacaoConfig: () => ({ ok: true, config: {}, empresas: {} }),
    // O SSL da lista de espera, cortado pelo freio no meio.
    publicarPainel: () => ({ ok: false, error: 'parado por você', log: [] }),
  };
  window.api = new Proxy({}, { get: (t, name) => (...args) => {
    window.__calls.push({ name, args });
    if (String(name).startsWith('on')) return () => {};
    const r = respostas[name] ? respostas[name](...args) : { ok: true };
    return Promise.resolve(r);
  } });
`;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HUB_CHROME || undefined });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  const logs = (re) => page.evaluate((src) => [...document.querySelectorAll('.log-line')].map((l) => l.textContent).filter((t) => new RegExp(src).test(t)), re.source);
  const chamadas = (nome) => page.evaluate((n) => window.__calls.filter((c) => c.name === n).length, nome);
  try {
    await page.addInitScript(STUB);
    await page.goto('file://' + path.join(ROOT, 'renderer', 'index.html').replace(/\\/g, '/'));
    await page.waitForFunction(() => window.hubAutomacao && window.__hubPronto && document.getElementById('pararTudoBtn'), { timeout: 10000 });

    check('o botão "Parar tudo" fica logo depois do interruptor da fila, no topo', await page.evaluate(() => { const c = document.getElementById('autoFilaChave'); const b = document.getElementById('pararTudoBtn'); return !!c && !!b && c.nextElementSibling === b && b.parentElement.classList.contains('tb-right') && /PARAR TUDO/.test(b.textContent) && !b.disabled; }));
    check('pararTudo é a função do app.js (a cola usa ela)', await page.evaluate(() => typeof pararTudo === 'function' && typeof pausarVigia === 'function' && typeof retomarVigia === 'function'));

    // Cenário: fila ligada (com memória), uma publicação AUTOMÁTICA no meio,
    // uma rodada de vínculos rodando e um site esperando na lista.
    await page.evaluate(async () => {
      window.hubAutomacao.ligar(true);
      for (let i = 0; i < 40 && (window.hubAutomacao.estado.rodando || !window.hubAutomacao.estado.ultima); i++) await new Promise((r) => setTimeout(r, 50));
      window.hubAutomacao.estado.processados.add('00T-velha');
      window.hubAutomacao.estado.tentativas.set('00T-falhou', 2);
      esperas = [{ id: 'w', dominio: 'w.com.br', painelUrl: 'https://idealplus.idealtrends.io/clientes/1/hub?projeto=1&contrato=1&tab=publicacao', status: 'esperando', cliente: true, ip: '149.18.102.60', ate: Date.now() + 3600000, falta: ['o SSL de produção'], desde: Date.now() }];
      pub = Object.assign(pubNovo(), { dominio: 'auto.com.br', auto: true, etapa: 'dns', emAndamento: true });
      vincEstado.rodando = true;
      // Quem roda de verdade para quando o freio é puxado (ou o "parar" pedido).
      const iv = setInterval(() => {
        if (paradaAgora) pub.emAndamento = false;
        if (vincEstado.parar) vincEstado.rodando = false;
        if (!pub.emAndamento && !vincEstado.rodando) clearInterval(iv);
      }, 100);
      window.__calls.length = 0;
    });
    check('antes: fila ligada, com memória da sessão', await page.evaluate(() => document.getElementById('autoFila').checked && window.hubAutomacao.estado.processados.size === 1 && window.hubAutomacao.estado.ultima !== null));

    await page.click('#pararTudoBtn');
    await page.waitForFunction(() => [...document.querySelectorAll('.log-line')].some((l) => /Parar tudo: tudo parado\./.test(l.textContent)), null, { timeout: 15000 });

    check('anunciou o que interrompeu (a publicação e o Conferir Vínculos)', (await logs(/Parar tudo: interrompendo .*a publicação de auto\.com\.br.*o Conferir Vínculos/)).length === 1, (await logs(/Parar tudo:/)).join(' | '));
    check('a fila automática desligou e ficou gravada desligada', await page.evaluate(() => !document.getElementById('autoFila').checked && state.automacaoFila === false && window.__calls.some((c) => c.name === 'setHubState' && c.args[0].automacaoFila === false)));
    check('a varredura recebeu o pedido de parar', await page.evaluate(() => window.hubAutomacao.estado.parar === true));
    check('o freio do processo principal foi puxado e solto no fim (ADR-102)', (await chamadas('pararProcesso')) === 1 && (await chamadas('liberarProcesso')) === 1 && await page.evaluate(() => paradaAgora === false));
    check('a rodada de vínculos recebeu "parar depois do item atual"', await page.evaluate(() => vincEstado.parar === true && vincEstado.rodando === false));
    check('a memória da fila foi zerada: religar começa do zero', await page.evaluate(() => window.hubAutomacao.estado.processados.size === 0 && window.hubAutomacao.estado.tentativas.size === 0 && window.hubAutomacao.estado.ultima === null));
    check('a publicação automática interrompida saiu da tela', await page.evaluate(() => !pub.dominio && !pub.auto) && (await logs(/A publicação automática de auto\.com\.br, que parou no meio, saiu da tela/)).length === 1);
    check('a lista de espera ficou pausada, e o log diz como volta', await page.evaluate(() => vigiaPausado === true) && (await logs(/A lista de espera está pausada/)).length === 1);
    check('o botão volta a aceitar clique no fim', await page.evaluate(() => { const b = document.getElementById('pararTudoBtn'); return !b.disabled && /PARAR TUDO/.test(b.textContent); }));

    // A lista mostra a pausa com o botão de retomar.
    await page.evaluate(() => openTool('publish'));
    await page.waitForFunction(() => !!document.getElementById('pubEsperas'), null, { timeout: 5000 });
    await page.evaluate(() => renderEsperas());
    check('no Publicar MPI+, a lista diz que está pausada, com "Retomar a conferência"', await page.evaluate(() => !!document.getElementById('esperasRetomar') && /pausada pelo "Parar tudo"/.test(document.getElementById('esperasPausada').textContent)));
    check('a dica do interruptor também avisa que a lista está pausada', await page.evaluate(() => /lista de espera está pausada/.test(document.getElementById('autoFilaChave').title)));

    // O site da lista cortado no meio do SSL volta a esperar, não "falta algo".
    const e = await page.evaluate(async () => {
      const antes = conferirApontamentoDeProducao;
      conferirApontamentoDeProducao = async () => ({ pronto: true, ip: '149.18.102.60', motivo: '' });
      const alvo = esperas[0];
      await vigiarUma(alvo);
      conferirApontamentoDeProducao = antes;
      return { status: alvo.status, detalhe: alvo.detalhe };
    });
    check('site da lista interrompido no SSL volta a "esperando", com o motivo', e.status === 'esperando' && /parado por você no meio/.test(e.detalhe), JSON.stringify(e));

    // Ligar a fila de novo retoma a lista de espera.
    await page.evaluate(() => { conferirApontamentoDeProducao = async () => ({ pronto: false, ip: '', motivo: 'ainda não aponta' }); });
    await page.click('#autoFilaChave');
    check('ligar a fila de novo retoma a lista de espera', await page.evaluate(() => vigiaPausado === false) && (await logs(/Lista de espera: volto a conferir \(a fila automática foi ligada\)/)).length === 1);
    await page.click('#autoFilaChave');
    await page.waitForFunction(() => !window.hubAutomacao.estado.rodando, null, { timeout: 5000 });

    // Publicação que VOCÊ começou: fica, com Continuar / Descartar.
    await page.evaluate(() => { pub = Object.assign(pubNovo(), { dominio: 'manual.com.br', etapa: 'aprovar' }); window.__calls.length = 0; });
    await page.click('#pararTudoBtn');
    await page.waitForFunction(() => [...document.querySelectorAll('.log-line')].filter((l) => /Parar tudo: tudo parado\./.test(l.textContent)).length === 2, null, { timeout: 15000 });
    check('a publicação que você começou fica, e o log diz como continuar', await page.evaluate(() => pub.dominio === 'manual.com.br' && pub.etapa === 'aprovar') && (await logs(/A publicação de manual\.com\.br que você começou ficou no Publicar MPI\+/)).length === 1);
    check('nada rodando: anuncia isso, e o freio é puxado e solto mesmo assim', (await logs(/Parar tudo: nada estava rodando/)).length === 1 && (await chamadas('pararProcesso')) === 1 && (await chamadas('liberarProcesso')) === 1);

    check('nenhum erro de página durante o roteiro', erros.length === 0, erros.join(' | '));
  } catch (err) {
    falhas++; console.log('  FALHOU  exceção: ' + err.message);
  } finally {
    await browser.close();
  }
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
