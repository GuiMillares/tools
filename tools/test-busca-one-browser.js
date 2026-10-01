// ADR-132: o driver da publicação Busca One automática com o renderer INTEIRO
// (index.html: app.js + terminais.js + automacao-ui.js) num Chromium, com
// window.api falso. Prova o que o test-automacao-browser (sem app.js) não
// prova: que o driver enxerga o `state`, a workspace da marca, o ID fixo do
// painel (BRANDS) e o mailVhost do hub-state, e que chama as APIs certas na
// ordem certa.
//
//     node tools/test-busca-one-browser.js

const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// Toda chamada ao preload vira { ok: true }, menos as que o driver e a carga
// do app.js precisam de verdade. `on*` devolve uma função de cancelar.
const STUB = `
  window.__calls = [];
  window.__ctx = { ok: true, razao: 'CLIENTE X LTDA', empresa: 'bc', via: 'projeto do caso (Busca Cliente)', log: [] };
  const respostas = {
    getHubState: () => ({ ok: true, state: { bitbucketWorkspaces: { bc: 'bcws', mpisolutions: 'mpiws' }, mailVhost: { to: 'infra@m3.test', cc: '' } } }),
    loadCreds: () => ({ ok: true, creds: { email: 'eu@x.test', token: 'tok' } }),
    getGoogleConfig: () => ({ ok: true, config: { saPath: 'C:/sa.json' } }),
    msStatus: () => ({ ok: true, connected: true, email: 'eu@x.test' }),
    salesforceGetConfig: () => ({ ok: true, conectado: true }),
    salesforceContexto: () => window.__ctx,
    createGoogleProject: (p) => ({ ok: true, log: [{ message: 'fake google ' + p.brand, type: 'info' }], result: { domain: p.domain, reaproveitados: [], faltando: [], idAnalytics: 'G-1', tagmanager: 'GTM-1', googleSearchConsole: 'sc', siteKey: 'sk', secretKey: 'sec' } }),
    commitGeralPhp: (p) => ({ ok: true, log: [], workspace: p.workspace, repo: p.repo, branch: 'main', applied: Object.keys(p.values) }),
    sendMailBatch: (p) => ({ ok: true, log: [], enviados: p.domains, falhas: [], total: 1 }),
    salesforceMoverTarefa: () => ({ ok: true, log: [] }),
    salesforceFecharTarefa: () => ({ ok: true, log: [] }),
    salesforceTarefas: () => ({ ok: true, tarefas: [], filas: [], instancia: 'https://sf' }),
    usuarioLogado: () => ({ ok: true, nome: 'Teste', email: 'eu@x.test' }),
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
  const page = await browser.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  try {
    await page.addInitScript(STUB);
    await page.goto('file://' + path.join(ROOT, 'renderer', 'index.html').replace(/\\/g, '/'));
    await page.waitForFunction(() => window.hubAutomacao && typeof window.hubPublicarBuscaOneAuto === 'function', { timeout: 8000 });
    // O hub-state chega depois de o painel nascer; o painel se atualiza uma
    // vez, 3 s depois (automacao-ui.js).
    await page.waitForFunction(() => document.getElementById('autoVhostPara').value === 'infra@m3.test', { timeout: 6000 }).catch(() => {});

    check('index.html inteiro carrega sem erro de página com api falsa', erros.length === 0, erros.join(' | '));
    check('state do app.js visível, com workspaces e mailVhost do hub-state', await page.evaluate(() => typeof state !== 'undefined' && state.bitbucketWorkspaces.bc === 'bcws' && state.mailVhost && state.mailVhost.to === 'infra@m3.test'));
    check('o campo "Vhost para" do painel mostra o destinatário do hub-state', await page.evaluate(() => document.getElementById('autoVhostPara').value === 'infra@m3.test'), await page.evaluate(() => document.getElementById('autoVhostPara').value));
    check('pré-requisitos do driver no state (service account, Bitbucket, Microsoft)', await page.evaluate(() => !!state.googleSaPath && !!state.creds && state.ms.connected === true), await page.evaluate(() => JSON.stringify({ sa: state.googleSaPath, creds: !!state.creds, ms: state.ms })));

    // 1) Busca Cliente pelo temporário (deploy.buscaclientes), com o caso e a
    //    fila dizendo MPI Solutions → o temporário vence, com aviso (ADR-133).
    //    O repositório (x.com) vem do caminho do temporário; o domínio real é
    //    x.com.br.
    const r1 = await page.evaluate(async () => {
      window.__ctx = { ok: true, razao: 'CLIENTE X LTDA', empresa: 'mpisolutions', via: 'projeto do caso (MPI Solutions)', log: [] };
      window.__calls.length = 0; window.__logs2 = [];
      const antes = window.log; window.log = (m, t) => { window.__logs2.push([m, t]); };
      const r = await window.hubPublicarBuscaOneAuto({ id: '00T1', link: 'https://sf/lightning/r/Task/00T1/view', assunto: 'Publicação (Troca de DNS) - x.com.br', dominio: 'https://www.x.com.br/', repositorio: 'x.com', empresa: 'mpisolutions', empresaTemporario: 'bc', idPainel: '12', temporario: 'deploy.buscaclientes.com.br' });
      window.log = antes;
      return { r, calls: window.__calls, logs: window.__logs2 };
    });
    const nomes = r1.calls.map((c) => c.name);
    check('BC: driver devolve ok', r1.r.ok === true, JSON.stringify(r1.r));
    check('BC: ordem contexto → propriedades → commit → e-mail → mover a tarefa (sem comentar no Salesforce, ADR-134)', nomes.join(',') === 'salesforceContexto,createGoogleProject,commitGeralPhp,sendMailBatch,salesforceMoverTarefa', nomes.join(','));
    const g = (r1.calls.find((c) => c.name === 'createGoogleProject') || { args: [{}] }).args[0];
    check('BC: createGoogleProject com o saPath do state, marca bc (o temporário vence caso e fila), domínio real normalizado', g.saPath === 'C:/sa.json' && g.brand === 'bc' && g.domain === 'x.com.br' && (g.steps || []).join() === 'analytics,gtm,recaptcha,searchconsole', JSON.stringify(g));
    const c = (r1.calls.find((c) => c.name === 'commitGeralPhp') || { args: [{}] }).args[0];
    check('BC: commit no repositório do temporário (x.com), workspace da marca, credenciais do state, $idProjetoBusca = 12', c.repo === 'x.com' && c.workspace === 'bcws' && c.creds && c.creds.token === 'tok' && c.brand === 'bc' && c.values && c.values.idProjetoBusca === '12' && c.values.idAnalytics === 'G-1', JSON.stringify(c));
    const m = (r1.calls.find((c) => c.name === 'sendMailBatch') || { args: [{}] }).args[0];
    check('BC: e-mail para o destinatário do hub-state, modelo Busca Cliente, com o domínio real', (m.to || []).join() === 'infra@m3.test' && (m.cc || []).length === 0 && /Busca Cliente - \{dominio\}/.test(m.subjectTemplate) && (m.domains || []).join() === 'x.com.br', JSON.stringify(m));
    const mv = (r1.calls.find((c) => c.name === 'salesforceMoverTarefa') || { args: [{}] }).args[0];
    check('BC: tarefa movida para andamento; nenhum comentário no Salesforce', mv.id === '00T1' && mv.coluna === 'andamento' && !r1.calls.some((c) => c.name === 'salesforceFecharTarefa' || c.name === 'salesforceCriarTarefaNoCaso'), JSON.stringify(mv));
    check('BC: o resumo com as chaves saiu no terminal', r1.logs.some((l) => /Analytics \(GA4\): G-1/.test(l[0])) && r1.logs.some((l) => /Tag Manager: GTM-1/.test(l[0])), JSON.stringify(r1.logs.map((l) => l[0]).filter((m) => /GA4|Tag Manager:/.test(m))));
    check('BC: avisou que o caso discorda do temporário, e seguiu pelo temporário', r1.logs.some((l) => l[1] === 'warn' && /diz MPI Solutions, mas o temporário deploy\.buscaclientes\.com\.br é da Busca Cliente; seguindo pelo temporário/.test(l[0])), JSON.stringify(r1.logs.filter((l) => l[1] === 'warn')));
    check('BC: o log do processo principal foi para o terminal', r1.logs.some((l) => /fake google bc/.test(l[0])));

    // 2) Sem temporário ("Apontado via registro."): a empresa vem do caso →
    //    MPI Solutions, ID fixo 39 pelo BRANDS do app.js, workspace mpiws,
    //    commit no próprio domínio.
    const r2 = await page.evaluate(async () => {
      window.__ctx = { ok: true, razao: 'CLIENTE Y', empresa: 'mpisolutions', via: 'projeto do caso (MPI Solutions)', log: [] };
      window.__calls.length = 0;
      const r = await window.hubPublicarBuscaOneAuto({ id: '00T2', link: 'https://sf/lightning/r/Task/00T2/view', dominio: 'y.com.br', repositorio: '', empresa: null, empresaTemporario: null, idPainel: '777', temporario: '' });
      return { r, calls: window.__calls };
    });
    const c2 = (r2.calls.find((c) => c.name === 'commitGeralPhp') || { args: [{}] }).args[0];
    const m2 = (r2.calls.find((c) => c.name === 'sendMailBatch') || { args: [{}] }).args[0];
    check('MPI: ok', r2.r.ok === true, JSON.stringify(r2.r));
    check('MPI: empresa pelo caso, $idProjetoBusca = 39 (fixedPanelId do app.js vence o 777 da tarefa), workspace mpiws, commit no domínio', c2.repo === 'y.com.br' && c2.values && c2.values.idProjetoBusca === '39' && c2.workspace === 'mpiws' && c2.brand === 'mpisolutions', JSON.stringify(c2));
    check('MPI: modelo "MPI" no assunto', /- MPI - \{dominio\}/.test(m2.subjectTemplate || ''));

    // 3) Sem conta Microsoft: nada é feito (nem as propriedades).
    const r3 = await page.evaluate(async () => {
      state.ms.connected = false; window.__calls.length = 0;
      const r = await window.hubPublicarBuscaOneAuto({ id: '00T3', link: 'https://sf/lightning/r/Task/00T3/view', dominio: 'z.com.br', empresa: 'bc', idPainel: '1' });
      state.ms.connected = true;
      return { r, calls: window.__calls.map((c) => c.name) };
    });
    check('sem Microsoft: erro comum (tenta depois), nenhuma chamada feita', r3.r.ok === false && !r3.r.desistir && /Microsoft/.test(r3.r.motivo) && r3.calls.length === 0, JSON.stringify(r3));

    // 4) Editar o destinatário no painel grava no state e no hub-state.
    const r4 = await page.evaluate(async () => {
      window.__calls.length = 0;
      const el = document.getElementById('autoVhostPara'); el.value = 'novo@m3.test'; el.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 50));
      return { mailVhost: state.mailVhost, saved: window.__calls.filter((c) => c.name === 'setHubState').map((c) => c.args[0].mailVhost) };
    });
    check('editar "Vhost para" grava state.mailVhost e chama setHubState com ele', r4.mailVhost && r4.mailVhost.to === 'novo@m3.test' && r4.saved.length === 1 && r4.saved[0] && r4.saved[0].to === 'novo@m3.test', JSON.stringify(r4));

    check('nenhum erro de página durante o roteiro', erros.length === 0, erros.join(' | '));
  } catch (e) {
    falhas++; console.log('  FALHOU  exceção: ' + e.message);
  } finally {
    await browser.close();
  }
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
