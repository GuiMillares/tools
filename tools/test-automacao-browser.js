// ADR-122 / ADR-150: o que sobrou do lado do renderer da automação — o driver
// do Publicar MPI+ (window.hubPublicarTarefaAuto, chamado pela ponte do
// Escritório) e a consulta à lista de espera — carregado de verdade num
// Chromium, sem o app.js. Garante que os <script> não colidem, que o painel
// flutuante NÃO existe mais (absorvido pelo Escritório) e que o driver pula
// com elegância quando a máquina de etapas não está carregada.
//
//     NODE_PATH=... PLAYWRIGHT_BROWSERS_PATH=... node tools/test-automacao-browser.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const htmlPath = path.join(ROOT, 'renderer', '_autotest.html');

const STUB = `
  window.__chamadas = [];
  window.log = (m, t) => { (window.__logs = window.__logs || []).push([m, t]); };
  // A lista de espera do app.js (let de topo, visível por identificador): um
  // site já publicado cujo DNS é do cliente (ADR-142).
  var esperas = [{ id: 'e', dominio: 'e.com.br', status: 'esperando', cliente: true, ip: '149.18.102.60', ate: Date.now() + 1800000, detalhe: 'ainda aponta para 149.18.102.39, não para 149.18.102.60', falta: ['o SSL de produção', 'fechar a tarefa do Salesforce'] }];
  window.api = new Proxy({}, { get: (t, name) => (...args) => { window.__chamadas.push({ name, args }); return Promise.resolve({ ok: true }); } });
`;

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>${STUB}</script>
<script src="../lib/triagem.js"></script>
<script src="../lib/busca-one.js"></script>
<script src="../lib/automacao.js"></script>
<script src="automacao-ui.js"></script>
</body></html>`;

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

(async () => {
  fs.writeFileSync(htmlPath, HTML);
  // Mora em renderer/ (os <script> são relativos), que vai inteiro para o
  // instalador: sai na saída, mesmo que o Chromium nem abra.
  process.on('exit', () => fs.rmSync(htmlPath, { force: true }));
  const browser = await chromium.launch({ executablePath: process.env.HUB_CHROME || undefined });
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  try {
    await page.goto('file://' + htmlPath);
    await page.waitForFunction(() => window.Triagem && window.Automacao && window.hubAutomacao, { timeout: 5000 });

    check('sem erro de console/colisão de nomes ao carregar', erros.length === 0, erros.join(' | '));
    check('window.Triagem, window.Automacao e window.BuscaOne expostos (módulos duais)', await page.evaluate(() => typeof window.Triagem.triar === 'function' && typeof window.Automacao.varrerFila === 'function' && typeof window.BuscaOne.publicarBuscaOne === 'function'));
    check('o painel flutuante da automação não existe mais (absorvido pelo Escritório, ADR-150)', await page.evaluate(() => !document.getElementById('automacaoPainel') && !document.getElementById('autoBloq') && !document.getElementById('autoVhostPara')));
    check('nenhum relógio de varredura do lado do renderer (nada chamou salesforceTarefas nem manterAcordado)', await page.evaluate(() => !window.__chamadas.some((c) => c.name === 'salesforceTarefas' || c.name === 'manterAcordado')));
    check('o driver Busca One saiu do renderer (roda no processo principal)', await page.evaluate(() => typeof window.hubPublicarBuscaOneAuto === 'undefined'));
    check('driver de publicação MPI+ exposto (window.hubPublicarTarefaAuto)', await page.evaluate(() => typeof window.hubPublicarTarefaAuto === 'function'));
    check('o atalho do bloqueio no painel segue exposto (window.hubBloquearPainel)', await page.evaluate(() => typeof window.hubBloquearPainel === 'function'));

    // A lista de espera: quem está nela vem com o motivo pronto (ADR-142).
    const esp = await page.evaluate(() => window.hubAutomacao.emEspera('E.com.br'));
    check('emEspera acha o domínio sem ligar para a caixa e diz que é do cliente, com o IP', esp && esp.cliente === true && /DNS é do cliente/.test(esp.motivo) && /149\.18\.102\.60/.test(esp.motivo), JSON.stringify(esp));
    check('emEspera devolve null para quem não está na lista', await page.evaluate(() => window.hubAutomacao.emEspera('x.com.br') === null));

    // Sem o app.js (a máquina de etapas) o driver PULA com elegância, sem
    // exceção e sem tocar em nada.
    const r = await page.evaluate(() => window.hubPublicarTarefaAuto({ dominio: 'b.com.br', temporario: 'b.mpitemporario.com.br', link: 'https://sf/x', empresa: 'bc' }));
    check('sem a máquina de etapas, o driver pula com o motivo (ferramenta não carregada)', r && r.ok === false && r.pulou === true && /Publicar MPI\+ não carregada/.test(r.motivo), JSON.stringify(r));
    check('e não chamou nenhuma API', await page.evaluate(() => window.__chamadas.length === 0));
    check('sem erro de página no fim', erros.length === 0, erros.join(' | '));
  } catch (e) {
    falhas++; console.log('  FALHOU  exceção: ' + e.message);
  } finally {
    await browser.close();
  }
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
