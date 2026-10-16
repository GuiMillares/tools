// ADR-120 / ADR-164: valida a cola do renderer (triagem.js + automacao.js +
// automacao-ui.js) carregando de verdade num Chromium, com window.api falso.
// Garante que os <script> não colidem, expõem os globais, põem o interruptor
// "Fila automática" no topo (que substituiu o Escritório e o painel
// flutuante) e que uma varredura chama as APIs certas para os três tipos.
//
//     NODE_PATH=... PLAYWRIGHT_BROWSERS_PATH=... node tools/test-automacao-browser.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const htmlPath = path.join(ROOT, 'renderer', '_autotest.html');

const STUB = `
  window.__chamadas = { resolverMarca: [], doutorBloquear: [], salesforceFecharTarefa: [], salesforceTarefas: 0, manterAcordado: [] };
  window.__salvos = [];
  window.log = (m, t) => { (window.__logs = window.__logs || []).push([m, t]); };
  // O que o app.js tem e a automação usa por identificador: o estado (com o
  // interruptor gravado) e quem grava o hub-state.
  var state = { automacaoFila: __GRAVADO__, automacaoTipos: __TIPOS__ };
  function saveHubState() { window.__salvos.push(state.automacaoFila); return Promise.resolve({ ok: true }); }
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

const html = ({ gravado = false, pronto = false, tipos = { publicacao: true, buscaone: true, bloqueio: true } } = {}) => `<!doctype html><html><head><meta charset="utf-8"></head><body>
<header class="topbar"><div class="tb-right"><span class="tb-sys">MEM</span></div></header>
<script>${STUB.replace('__GRAVADO__', gravado ? 'true' : 'false').replace('__TIPOS__', JSON.stringify(tipos))}${pronto ? 'window.__hubPronto = true;' : ''}</script>
<script src="../lib/triagem.js"></script>
<script src="../lib/busca-one.js"></script>
<script src="../lib/automacao.js"></script>
<script src="automacao-ui.js"></script>
</body></html>`;

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

(async () => {
  // Mora em renderer/ (os <script> são relativos), que vai inteiro para o
  // instalador: sai na saída, mesmo que o Chromium nem abra.
  process.on('exit', () => fs.rmSync(htmlPath, { force: true }));
  const browser = await chromium.launch({ executablePath: process.env.HUB_CHROME || undefined });
  const erros = [];
  const abrir = async (opcoes) => {
    fs.writeFileSync(htmlPath, html(opcoes));
    const page = await browser.newPage();
    page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
    await page.goto('file://' + htmlPath);
    await page.waitForFunction(() => window.Triagem && window.Automacao && window.hubAutomacao, { timeout: 5000 });
    return page;
  };
  const logs = (page, re) => page.evaluate((src) => (window.__logs || []).filter((l) => new RegExp(src).test(l[0])).map((l) => l[0]), re.source);
  try {
    const page = await abrir();

    check('sem erro de console/colisão de nomes ao carregar', erros.length === 0, erros.join(' | '));
    check('window.Triagem, window.Automacao e window.BuscaOne expostos (módulos duais)', await page.evaluate(() => typeof window.Triagem.triar === 'function' && typeof window.Automacao.varrerFila === 'function' && typeof window.BuscaOne.publicarBuscaOne === 'function'));
    check('triagem funciona no navegador', await page.evaluate(() => window.Triagem.triar({ assunto: 'BLOQUEIO DE CONTATOS - x.com.br' }).tipo === 'bloqueio'));
    check('drivers expostos: publicação MPI+ e Busca One', await page.evaluate(() => typeof window.hubPublicarTarefaAuto === 'function' && typeof window.hubPublicarBuscaOneAuto === 'function'));
    check('o atalho do bloqueio no painel MPI+ segue exposto (window.hubBloquearPainel)', await page.evaluate(() => typeof window.hubBloquearPainel === 'function'));
    check('o interruptor "Fila automática" está no topo, antes do MEM/CPU', await page.evaluate(() => { const c = document.getElementById('autoFilaChave'); return !!c && c.parentElement.classList.contains('tb-right') && c === c.parentElement.firstElementChild && c.querySelector('input').getAttribute('role') === 'switch'; }));
    check('nem painel flutuante nem Escritório (ADR-164)', await page.evaluate(() => !document.getElementById('automacaoPainel') && !document.getElementById('autoPub') && !document.getElementById('autoVhostPara') && typeof window.hubEscritorio === 'undefined'));
    check('começa desligado, habilitado, e nada lê a fila antes de ligar', await page.evaluate(() => { const i = document.getElementById('autoFila'); return i.checked === false && i.disabled === false && !document.getElementById('autoFilaChave').classList.contains('on') && window.__chamadas.salesforceTarefas === 0 && window.__chamadas.manterAcordado.length === 0; }));

    // A lista de espera: quem está nela vem com o motivo pronto (ADR-142), e
    // o cliente é conferido de hora em hora (ADR-162).
    const esp = await page.evaluate(() => window.hubAutomacao.emEspera('E.com.br'));
    check('emEspera acha o domínio sem ligar para a caixa e diz que é do cliente, com o IP e a conferência de hora em hora', esp && esp.cliente === true && /DNS é do cliente/.test(esp.motivo) && /149\.18\.102\.60/.test(esp.motivo) && /confere a cada 1 h/.test(esp.motivo), JSON.stringify(esp));
    check('emEspera devolve null para quem não está na lista', await page.evaluate(() => window.hubAutomacao.emEspera('x.com.br') === null));

    // Ligar → uma varredura só trata os três tipos.
    await page.click('#autoFilaChave');
    await page.waitForFunction(() => window.hubAutomacao.estado.ultima && window.hubAutomacao.estado.rodando === false, { timeout: 8000 });
    const ch = await page.evaluate(() => window.__chamadas);
    check('ligar marca o interruptor e liga os três tipos', await page.evaluate(() => document.getElementById('autoFila').checked && document.getElementById('autoFilaChave').classList.contains('on') && JSON.stringify(window.hubAutomacao.estado.ligado) === '{"bloqueio":true,"publicacao":true,"buscaone":true}'));
    check('ligar grava no hub-state (state.automacaoFila = true)', await page.evaluate(() => state.automacaoFila === true && window.__salvos.join() === 'true'));
    check('ligar dispara a varredura na hora (lê a fila)', ch.salesforceTarefas === 1, String(ch.salesforceTarefas));
    check('ligada, a automação segura a janela sem desacelerar (ADR-126)', ch.manterAcordado.some((x) => x[0] === true && x[1] === 'automacao'), JSON.stringify(ch.manterAcordado));
    check('bloqueio: resolve a marca, censura no /doutor e fecha a tarefa com "Contatos removidos"', ch.resolverMarca.length === 1 && ch.resolverMarca[0].dominio === 'a.com.br' && ch.doutorBloquear.length === 1 && ch.doutorBloquear[0].marca === 'bc' && ch.doutorBloquear[0].acao === 'bloquear' && ch.salesforceFecharTarefa.length === 1 && ch.salesforceFecharTarefa[0].texto === 'Contatos removidos', JSON.stringify(ch));
    check('MPI+ b.com.br: o driver é chamado e, sem o app.js, pula sem exceção', (await logs(page, /b\.com\.br: pulei — ferramenta Publicar MPI\+ não carregada/)).length === 1, (await logs(page, /b\.com\.br/)).join(' | '));
    check('Busca One c.com.br: anunciada com temporário, empresa e ID do painel, e o driver pula sem o app.js', (await logs(page, /Publicação Busca One: c\.com\.br \(temporário producao\.mpitemporario\.com\.br, MPI Solutions\); ID do painel 321/)).length === 1 && (await logs(page, /c\.com\.br: pulei — app\.js não carregado/)).length === 1, (await logs(page, /c\.com\.br/)).join(' | '));
    check('a anotação da fila sai no log, com os domínios por tipo e quem está na espera', (await logs(page, /^Fila: 5 aberta\(s\) — publicação MPI\+ 2: b\.com\.br, e\.com\.br · Busca One 1: c\.com\.br · bloqueio 1: a\.com\.br · 1 outra\(s\)\. Na lista de espera, não mexo: e\.com\.br \(cliente\)\./)).length === 1, (await logs(page, /^Fila:/)).join(' | '));
    check('e.com.br (DNS do cliente, na lista de espera) fica anotada como aguardando, sem publicar de novo', (await logs(page, /e\.com\.br: aguardando — já publicado; o DNS é do cliente e ainda aponta para 149\.18\.102\.39.*precisa apontar para 149\.18\.102\.60.*Sigo para a próxima tarefa/)).length === 1 && await page.evaluate(() => window.hubAutomacao.estado.aguardando.get('p2') && window.hubAutomacao.estado.aguardando.get('p2').cliente === true), (await logs(page, /e\.com\.br/)).join(' | '));
    check('o resumo da varredura conta "aguardando o DNS" à parte', (await logs(page, /varredura concluída — 1 feita\(s\), 1 aguardando o DNS, 2 pulada\(s\), 0 erro\(s\)/)).length === 1, (await logs(page, /varredura concluída/)).join(' | '));
    check('o mapa de tentativas vive no estado (não nasce a cada varredura)', await page.evaluate(() => window.hubAutomacao.estado.tentativas instanceof Map));
    const dica = await page.evaluate(() => document.getElementById('autoFilaChave').title);
    check('passar o mouse mostra a última varredura e quem espera o cliente apontar', /LIGADA/.test(dica) && /Última varredura \(\d\d:\d\d\): 1 feita\(s\), 1 aguardando o DNS, 2 pulada\(s\), 0 erro\(s\)/.test(dica) && /Aguardando o cliente apontar \(1\): e\.com\.br\./.test(dica), dica);
    check('o rótulo curto mostra o placar da última varredura', await page.evaluate(() => document.querySelector('#autoFilaChave small').textContent === '1✓ 1⏳ 0✗'), await page.evaluate(() => document.querySelector('#autoFilaChave small').textContent));

    // Desligar é o freio: para, solta a janela e grava.
    await page.click('#autoFilaChave');
    check('desligar desmarca e desliga os três tipos', await page.evaluate(() => !document.getElementById('autoFila').checked && !document.getElementById('autoFilaChave').classList.contains('on') && JSON.stringify(window.hubAutomacao.estado.ligado) === '{"bloqueio":false,"publicacao":false,"buscaone":false}' && window.hubAutomacao.estado.parar === true));
    const acordado = await page.evaluate(() => window.__chamadas.manterAcordado);
    check('e solta a janela para desacelerar de novo (ADR-126)', JSON.stringify(acordado[acordado.length - 1]) === JSON.stringify([false, 'automacao']), JSON.stringify(acordado));
    check('e grava desligado no hub-state', await page.evaluate(() => state.automacaoFila === false && window.__salvos.join() === 'true,false'));
    check('rodar agora com tudo desligado só avisa', await page.evaluate(async () => { const n = window.__chamadas.salesforceTarefas; await window.hubAutomacao.rodar(); return window.__chamadas.salesforceTarefas === n; }) && (await logs(page, /a fila automática está desligada \(interruptor no topo\)/)).length === 1);

    // O "Parar tudo" (ADR-165) fica logo depois do interruptor. Sem o app.js
    // (só a cola), ele para pelo menos a fila: desliga, grava e zera.
    check('o botão "Parar tudo" fica depois do interruptor e do "▾"', await page.evaluate(() => { const b = document.getElementById('pararTudoBtn'); return !!b && document.getElementById('autoFilaChave').nextElementSibling.nextElementSibling === b && /PARAR TUDO/.test(b.textContent); }));
    await page.click('#autoFilaChave');
    await page.waitForFunction(() => window.hubAutomacao.estado.rodando === false && window.__chamadas.salesforceTarefas === 2, { timeout: 8000 });
    check('religada, a fila lembra o que tratou nesta sessão', await page.evaluate(() => window.hubAutomacao.estado.processados.size > 0 && window.hubAutomacao.estado.ultima !== null));
    await page.click('#pararTudoBtn');
    await page.waitForFunction(() => (window.__logs || []).some((l) => /Parar tudo: a fila automática parou e começa do zero/.test(l[0])), { timeout: 8000 });
    check('"Parar tudo" desliga a fila, grava desligada e zera a memória da sessão', await page.evaluate(() => !document.getElementById('autoFila').checked && state.automacaoFila === false && window.__salvos[window.__salvos.length - 1] === false && window.hubAutomacao.estado.processados.size === 0 && window.hubAutomacao.estado.tentativas.size === 0 && window.hubAutomacao.estado.ultima === null));
    check('e o botão volta a aceitar clique', await page.evaluate(() => !document.getElementById('pararTudoBtn').disabled));
    await page.close();

    // Reabrir com o interruptor gravado ligado: volta ligado sozinho, sem
    // gravar de novo, e a primeira leitura espera a sessão acordar.
    const p2 = await abrir({ gravado: true, pronto: true });
    check('reaberto com a fila gravada ligada, o interruptor volta ligado', await p2.evaluate(() => document.getElementById('autoFila').checked && window.hubAutomacao.estado.ligado.publicacao === true));
    check('avisa no terminal que voltou como estava, e não lê a fila na hora', (await logs(p2, /Fila automática: volta ligada, como ficou gravada \(tudo\); a primeira leitura da fila sai em 15s/)).length === 1 && await p2.evaluate(() => window.__chamadas.salesforceTarefas === 0 && window.__salvos.length === 0));
    await p2.close();

    // Gravado ligado, mas o app.js ainda carregando: espera o "hub:pronto".
    const p3 = await abrir({ gravado: true, pronto: false });
    check('antes do hub:pronto, continua desligado', await p3.evaluate(() => !document.getElementById('autoFila').checked));
    await p3.evaluate(() => document.dispatchEvent(new CustomEvent('hub:pronto')));
    check('com o hub:pronto, volta ligado', await p3.evaluate(() => document.getElementById('autoFila').checked));
    await p3.close();

    // O que a fila cobre (ADR-166): o "▾" entre o interruptor e o "Parar tudo".
    const p4 = await abrir();
    check('o "▾" fica entre o interruptor e o "Parar tudo", com o menu fechado e tudo marcado', await p4.evaluate(() => { const c = document.getElementById('autoFilaChave'); const t = c.nextElementSibling; return t.classList.contains('tb-auto-tipos') && t.nextElementSibling.id === 'pararTudoBtn' && document.getElementById('autoTiposMenu').hidden && [...document.querySelectorAll('#autoTiposMenu input[data-tipo]')].every((i) => i.checked) && document.querySelector('.tb-auto-escopo').hidden; }));
    await p4.click('#autoTiposBtn');
    check('clicar no "▾" abre o menu com os três tipos', await p4.evaluate(() => !document.getElementById('autoTiposMenu').hidden && document.querySelectorAll('#autoTiposMenu input[data-tipo]').length === 3));
    await p4.click('#autoTiposMenu input[data-tipo="buscaone"]');
    await p4.click('#autoTiposMenu input[data-tipo="bloqueio"]');
    check('desmarcar Busca One e bloqueio deixa só MPI+, grava no hub-state e o rótulo diz "só MPI+"', await p4.evaluate(() => JSON.stringify(window.hubAutomacao.estado.tipos) === '{"publicacao":true,"buscaone":false,"bloqueio":false}' && JSON.stringify(state.automacaoTipos) === '{"publicacao":true,"buscaone":false,"bloqueio":false}' && window.__salvos.length === 2 && /só MPI\+/.test(document.querySelector('.tb-auto-escopo').textContent) && !document.querySelector('.tb-auto-escopo').hidden));
    await p4.click('#autoTiposMenu input[data-tipo="publicacao"]');
    check('o último tipo não sai: o MPI+ continua marcado e o log explica', await p4.evaluate(() => window.hubAutomacao.estado.tipos.publicacao === true && document.querySelector('#autoTiposMenu input[data-tipo="publicacao"]').checked) && (await logs(p4, /precisa cobrir pelo menos um tipo/)).length === 1);
    await p4.mouse.click(5, 300);
    check('clicar fora fecha o menu', await p4.evaluate(() => document.getElementById('autoTiposMenu').hidden));
    await p4.click('#autoFilaChave');
    await p4.waitForFunction(() => window.hubAutomacao.estado.ultima && window.hubAutomacao.estado.rodando === false, { timeout: 8000 });
    const ch4 = await p4.evaluate(() => window.__chamadas);
    check('ligada "só MPI+": liga só a publicação MPI+', await p4.evaluate(() => JSON.stringify(window.hubAutomacao.estado.ligado) === '{"bloqueio":false,"publicacao":true,"buscaone":false}'));
    check('o log de ligar diz o que fica de fora', (await logs(p4, /Fila automática LIGADA para publicação MPI\+ \(com backup do DNS antes de aplicar\) \(fica de fora: publicação Busca One e bloqueio de contatos\)/)).length === 1, (await logs(p4, /LIGADA/)).join(' | '));
    check('a varredura publica o MPI+ e deixa o bloqueio e a Busca One na fila', ch4.doutorBloquear.length === 0 && ch4.resolverMarca.length === 0 && (await logs(p4, /b\.com\.br: pulei — ferramenta Publicar MPI\+ não carregada/)).length === 1 && (await logs(p4, /Publicação Busca One: c\.com\.br/)).length === 0, JSON.stringify(ch4));
    check('a dica diz que está ligada só para MPI+ e o que fica de fora', await p4.evaluate(() => /LIGADA para publicação MPI\+; a fila é lida a cada 5 min\..*Fica de fora: publicação Busca One e bloqueio de contatos\./.test(document.getElementById('autoFilaChave').title)), await p4.evaluate(() => document.getElementById('autoFilaChave').title));
    // Pôr um tipo de volta com a fila ligada vale na hora: varre de novo.
    await p4.click('#autoTiposBtn');
    await p4.click('#autoTiposMenu input[data-tipo="bloqueio"]');
    await p4.waitForFunction(() => window.__chamadas.doutorBloquear.length === 1 && window.hubAutomacao.estado.rodando === false, { timeout: 8000 });
    check('marcar o bloqueio com a fila ligada vale na hora: varre e bloqueia', await p4.evaluate(() => window.hubAutomacao.estado.ligado.bloqueio === true && window.__chamadas.salesforceTarefas === 2));
    await p4.close();

    // Reaberto com "só MPI+" gravado e a fila ligada: volta assim.
    const p5 = await abrir({ gravado: true, pronto: true, tipos: { publicacao: true, buscaone: false, bloqueio: false } });
    check('reaberto com "só MPI+" gravado, volta ligado só para MPI+, com o menu e o rótulo certos', await p5.evaluate(() => document.getElementById('autoFila').checked && JSON.stringify(window.hubAutomacao.estado.ligado) === '{"bloqueio":false,"publicacao":true,"buscaone":false}' && !document.querySelector('#autoTiposMenu input[data-tipo="buscaone"]').checked && /só MPI\+/.test(document.querySelector('.tb-auto-escopo').textContent)));
    check('e o log da volta diz "só publicação MPI+"', (await logs(p5, /volta ligada, como ficou gravada \(só publicação MPI\+\)/)).length === 1, (await logs(p5, /volta ligada/)).join(' | '));
    await p5.close();

    check('sem erro de página no fim', erros.length === 0, erros.join(' | '));
  } catch (e) {
    falhas++; console.log('  FALHOU  exceção: ' + e.message);
  } finally {
    await browser.close();
  }
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
