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
  // A lista de espera do app.js (let de topo, visível por identificador): um
  // site já publicado cujo DNS é do cliente (ADR-142).
  var esperas = [{ id: 'e', dominio: 'e.com.br', status: 'esperando', cliente: true, ip: '149.18.102.60', ate: Date.now() + 1800000, detalhe: 'ainda aponta para 149.18.102.39, não para 149.18.102.60', falta: ['o SSL de produção', 'fechar a tarefa do Salesforce'] }];
  window.api = {
    salesforceGetConfig: async () => ({ ok: true, conectado: true }),
    salesforceTarefas: async () => { window.__chamadas.salesforceTarefas++; return {
      instancia: 'https://sf',
      tarefas: [
        { id: 'b1', assunto: 'BLOQUEIO DE CONTATOS - a.com.br', descricao: '', fechada: false },
        { id: 'p1', assunto: 'Publicação (Troca de DNS) MPI+ - b.com.br', descricao: 'http://b.mpitemporario.com.br/ https://b.com.br/', fechada: false },
        { id: 'o1', assunto: 'Publicação (Troca de DNS) - c.com.br', descricao: 'link temporário - http://producao.mpitemporario.com.br/c/ ID 321', fechada: false },
        { id: 'p2', assunto: 'Publicação (Troca de DNS) [MPI+] - e.com.br', descricao: 'http://e.mpitemporario.com.br/ https://e.com.br/', fechada: false },
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
    check('window.Triagem exposto', await page.evaluate(() => !!window.Triagem && typeof window.Triagem.triar === 'function'));
    check('window.Automacao exposto', await page.evaluate(() => !!window.Automacao && typeof window.Automacao.varrerFila === 'function'));
    check('triagem funciona no navegador', await page.evaluate(() => window.Triagem.triar({ assunto: 'BLOQUEIO DE CONTATOS - x.com.br' }).tipo === 'bloqueio'));
    check('painel flutuante injetado', await page.evaluate(() => !!document.getElementById('automacaoPainel')));
    check('publicação começa DESLIGADA mas habilitada (ADR-122)', await page.evaluate(() => { const p = document.getElementById('autoPub'); return p.disabled === false && p.checked === false; }));
    check('driver de publicação automática exposto (window.hubPublicarTarefaAuto)', await page.evaluate(() => typeof window.hubPublicarTarefaAuto === 'function'));
    check('começa desligado (bloqueio não marcado)', await page.evaluate(() => document.getElementById('autoBloq').checked === false));
    // Busca One (ADR-132)
    check('window.BuscaOne exposto', await page.evaluate(() => !!window.BuscaOne && typeof window.BuscaOne.publicarBuscaOne === 'function'));
    check('Busca One começa DESLIGADA mas habilitada', await page.evaluate(() => { const o = document.getElementById('autoBuscaOne'); return !!o && o.disabled === false && o.checked === false; }));
    check('driver Busca One exposto (window.hubPublicarBuscaOneAuto)', await page.evaluate(() => typeof window.hubPublicarBuscaOneAuto === 'function'));
    check('campos do e-mail de vhost com o destinatário padrão (suporte da M3)', await page.evaluate(() => document.getElementById('autoVhostPara').value === 'suporte@m3solutions.com.br' && document.getElementById('autoVhostCc').value === 'everton.lima@buscacliente.com.br'), await page.evaluate(() => document.getElementById('autoVhostPara').value));

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
    // ADR-142: e.com.br está na lista de espera (DNS do cliente) → anotada como
    // aguardando, sem passar pelo driver; a varredura seguiu.
    await page.waitForFunction(() => window.hubAutomacao.estado.rodando === false, { timeout: 5000 });
    check('a anotação da fila sai no log, com os domínios por tipo e quem está na espera', await page.evaluate(() => (window.__logs || []).some((l) => /^Fila: 5 aberta\(s\) — publicação MPI\+ 2: b\.com\.br, e\.com\.br · Busca One 1: c\.com\.br · bloqueio 1: a\.com\.br · 1 outra\(s\)\. Na lista de espera, não mexo: e\.com\.br \(cliente\)\./.test(l[0]))), await page.evaluate(() => (window.__logs || []).filter((l) => /^Fila:/.test(l[0])).map((l) => l[0]).join(' | ')));
    check('e.com.br (DNS do cliente, na lista de espera) fica anotada como aguardando, sem publicar de novo', await page.evaluate(() => (window.__logs || []).some((l) => /e\.com\.br: aguardando — já publicado; o DNS é do cliente e ainda aponta para 149\.18\.102\.39.*precisa apontar para 149\.18\.102\.60.*Sigo para a próxima tarefa/.test(l[0])) && window.hubAutomacao.estado.aguardando.get('p2') && window.hubAutomacao.estado.aguardando.get('p2').cliente === true), await page.evaluate(() => (window.__logs || []).filter((l) => /e\.com\.br/.test(l[0])).map((l) => l[0]).join(' | ')));
    check('o resumo da varredura conta "aguardando o DNS" à parte', await page.evaluate(() => (window.__logs || []).some((l) => /varredura concluída — \d+ feita\(s\), 1 aguardando o DNS, /.test(l[0]))), await page.evaluate(() => (window.__logs || []).filter((l) => /varredura concluída/.test(l[0])).map((l) => l[0]).join(' | ')));
    check('o painel mostra a anotação "Aguardando o cliente apontar (1): e.com.br"', await page.evaluate(() => { const el = document.getElementById('autoEsperas'); return !!el && el.style.display !== 'none' && /Aguardando o cliente apontar \(1\):<\/span> e\.com\.br/.test(el.innerHTML); }), await page.evaluate(() => document.getElementById('autoEsperas') && document.getElementById('autoEsperas').innerHTML));
    check('o mapa de tentativas vive no estado (não nasce a cada varredura)', await page.evaluate(() => window.hubAutomacao.estado.tentativas instanceof Map));
    check('a Busca One c.com.br fica na fila com o interruptor dela desligado', !ch.doutorBloquear.some((x) => x.dominio === 'c.com.br') && !(await page.evaluate(() => (window.__logs || []).some((l) => /app\.js não carregado/.test(l[0])))));

    // Liga a Busca One → o driver dela é chamado para c.com.br; sem o app.js
    // (state, workspace, ID fixo) ele PULA com elegância, sem exceção e sem
    // tocar no Salesforce.
    await page.waitForFunction(() => window.hubAutomacao.estado.rodando === false, { timeout: 5000 });
    await page.click('#autoBuscaOne');
    await page.waitForFunction(() => (window.__logs || []).some((l) => /c\.com\.br: pulei — app\.js não carregado/.test(l[0])), { timeout: 5000 });
    check('ligar Busca One chama o driver dela, que pula sem exceção quando o app.js não está', erros.length === 0, erros.join(' | '));
    check('a Busca One não mexeu no Salesforce (nada fechado, nada movido)', (await page.evaluate(() => window.__chamadas.salesforceFecharTarefa.length)) === 1);
    check('o log da varredura anuncia a Busca One com temporário, empresa e ID do painel', await page.evaluate(() => (window.__logs || []).some((l) => /Publicação Busca One: c\.com\.br \(temporário producao\.mpitemporario\.com\.br, MPI Solutions\); ID do painel 321/.test(l[0]))), await page.evaluate(() => (window.__logs || []).filter((l) => /Busca One:/.test(l[0])).map((l) => l[0]).join(' | ')));

    // Editar o destinatário do vhost não quebra sem o app.js (sem state, só memória).
    await page.fill('#autoVhostPara', 'infra@exemplo.test');
    await page.dispatchEvent('#autoVhostPara', 'change');
    check('editar o destinatário do vhost loga e não dá exceção', erros.length === 0 && await page.evaluate(() => (window.__logs || []).some((l) => /E-mail de vhost: para infra@exemplo\.test/.test(l[0]))), erros.join(' | '));

    // Freio de emergência desliga tudo.
    await page.click('#autoParar');
    check('freio de emergência desliga bloqueio, publicação e Busca One', await page.evaluate(() => document.getElementById('autoBloq').checked === false && document.getElementById('autoPub').checked === false && document.getElementById('autoBuscaOne').checked === false));
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
