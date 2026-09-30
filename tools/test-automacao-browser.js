// ADR-120: valida a cola do renderer (triagem.js + automacao.js + automacao-ui.js)
// carregando de verdade num Chromium, com window.api falso. Garante que os
// <script> não colidem, expõem os globais, injetam o painel e a varredura chama
// as APIs certas.
//
//     NODE_PATH=... PLAYWRIGHT_BROWSERS_PATH=... node tools/test-automacao-browser.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const htmlPath = path.join(ROOT, 'renderer', '_autotest.html');

const STUB = `
  window.__chamadas = { resolverMarca: [], doutorBloquear: [], salesforceFecharTarefa: [], salesforceTarefas: 0, manterAcordado: [] };
  window.log = (m, t) => { (window.__logs = window.__logs || []).push([m, t]); };
  window.api = {
    salesforceGetConfig: async () => ({ ok: true, conectado: true }),
    salesforceTarefas: async () => { window.__chamadas.salesforceTarefas++; return {
      instancia: 'https://sf',
      tarefas: [
        { id: 'b1', assunto: 'BLOQUEIO DE CONTATOS - a.com.br', descricao: '', fechada: false },
        { id: 'p1', assunto: 'Publicação (Troca de DNS) MPI+ - b.com.br', descricao: 'http://b.mpitemporario.com.br/ https://b.com.br/', fechada: false },
        { id: 'x1', assunto: 'Ligar para o cliente', descricao: '', fechada: false },
      ],
    }; },
    resolverMarca: async (p) => { window.__chamadas.resolverMarca.push(p); return { ok: true, ips: ['149.18.103.98'], marca: 'bc' }; },
    doutorBloquear: async (p) => { window.__chamadas.doutorBloquear.push(p); return { ok: true, empresa: 'CLIENTE A' }; },
    salesforceFecharTarefa: async (p) => { window.__chamadas.salesforceFecharTarefa.push(p); return { ok: true }; },
    manterAcordado: async (ligar, motivo) => { window.__chamadas.manterAcordado.push([ligar, motivo]); return { ok: true }; },
  };
`;

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>${STUB}</script>
<script src="../lib/triagem.js"></script>
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
    check('window.Triagem exposto', await page.evaluate(() => !!window.Triagem && typeof window.Triagem.triar === 'function'));
    check('window.Automacao exposto', await page.evaluate(() => !!window.Automacao && typeof window.Automacao.varrerFila === 'function'));
    check('triagem funciona no navegador', await page.evaluate(() => window.Triagem.triar({ assunto: 'BLOQUEIO DE CONTATOS - x.com.br' }).tipo === 'bloqueio'));
    check('painel flutuante injetado', await page.evaluate(() => !!document.getElementById('automacaoPainel')));
    check('publicação começa DESLIGADA mas habilitada (ADR-122)', await page.evaluate(() => { const p = document.getElementById('autoPub'); return p.disabled === false && p.checked === false; }));
    check('driver de publicação automática exposto (window.hubPublicarTarefaAuto)', await page.evaluate(() => typeof window.hubPublicarTarefaAuto === 'function'));
    check('começa desligado (bloqueio não marcado)', await page.evaluate(() => document.getElementById('autoBloq').checked === false));

    // Liga o bloqueio → dispara uma varredura.
    await page.click('#autoBloq');
    await page.waitForFunction(() => window.__chamadas.doutorBloquear.length > 0, { timeout: 5000 });
    const ch = await page.evaluate(() => window.__chamadas);
    check('ligar bloqueio dispara varredura (lê a fila)', ch.salesforceTarefas >= 1);
    check('resolve a marca do domínio de bloqueio', ch.resolverMarca.length === 1 && ch.resolverMarca[0].dominio === 'a.com.br', JSON.stringify(ch.resolverMarca));
    check('chama doutorBloquear com marca bc e ação bloquear', ch.doutorBloquear.length === 1 && ch.doutorBloquear[0].marca === 'bc' && ch.doutorBloquear[0].acao === 'bloquear', JSON.stringify(ch.doutorBloquear));
    check('fecha a tarefa comentando "Contatos removidos"', ch.salesforceFecharTarefa.length === 1 && ch.salesforceFecharTarefa[0].texto === 'Contatos removidos', JSON.stringify(ch.salesforceFecharTarefa));
    check('publicação NÃO roda com o toggle desligado', !ch.doutorBloquear.some((x) => x.dominio === 'b.com.br') && !(await page.evaluate(() => (window.__logs || []).some((l) => /Publicar MPI\+ não carregada/.test(l[0])))));
    check('ligada, a automação segura a janela sem desacelerar (ADR-126)', ch.manterAcordado.some((x) => x[0] === true && x[1] === 'automacao'), JSON.stringify(ch.manterAcordado));

    // Liga a publicação → o driver é chamado para a tarefa MPI+; sem o app.js
    // (a máquina de etapas) ele DESISTE com elegância, sem exceção.
    await page.click('#autoPub');
    await page.waitForFunction(() => (window.__logs || []).some((l) => /Publicar MPI\+ não carregada/.test(l[0])), { timeout: 5000 });
    check('ligar publicação chama o driver, que pula sem exceção quando o app.js não está', erros.length === 0, erros.join(' | '));
    check('a tarefa MPI+ b.com.br não foi bloqueada nem fechada por engano', !ch.doutorBloquear.some((x) => x.dominio === 'b.com.br') && (await page.evaluate(() => window.__chamadas.salesforceFecharTarefa.length)) === 1);

    // Freio de emergência desliga tudo.
    await page.click('#autoParar');
    check('freio de emergência desliga bloqueio e publicação', await page.evaluate(() => document.getElementById('autoBloq').checked === false && document.getElementById('autoPub').checked === false));
    const acordado = await page.evaluate(() => window.__chamadas.manterAcordado);
    check('e solta a janela para desacelerar de novo (ADR-126)', JSON.stringify(acordado[acordado.length - 1]) === JSON.stringify([false, 'automacao']), JSON.stringify(acordado));
  } catch (e) {
    falhas++; console.log('  FALHOU  exceção: ' + e.message);
  } finally {
    await browser.close();
  }
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
