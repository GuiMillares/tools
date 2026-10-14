// ADR-156: a fila de PRs sobrevive ao fechar. Recorta do app.js o bloco da
// fila (adicionarPrNaFila, salvarFilaPrs, restaurarFilaPrs) e roda com o
// window.api simulado: cada mudança na fila grava os links no hub-state; ao
// abrir, os links voltam buscados de novo (sem repetir quem já está); PR
// mergeado não volta; sem credencial, nada é buscado.
//
//     node tools/test-fila-prs.js

const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');
function recorta(inicio, fim) { const i = app.indexOf(inicio); const f = app.indexOf(fim, i); if (i < 0 || f < 0) throw new Error(`não achei "${inicio}"`); return app.slice(i, f); }

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

function montar({ creds = { email: 'e', token: 't' }, fetchPr } = {}) {
  const salvos = [];
  const logs = [];
  const corpo = `
    const state = { queue: [], creds: ${JSON.stringify(creds)} };
    const log = (m, t) => logs.push([m, t]);
    const withBusy = (_r, fn) => fn();
    const renderQueue = () => {};
    let n = 0; const genId = () => 'L' + (++n);
    const saveHubState = async () => { salvos.push(state.queue.filter((q) => q.url && q.status !== 'merged').map((q) => q.url)); };
    const window = { api: { fetchPr } };
    ${recorta('async function adicionarPrNaFila(url)', '// (fim: fila de PRs persistida, ADR-156)')}
    return { state, adicionarPrNaFila, salvarFilaPrs, restaurarFilaPrs };`;
  const m = new Function('logs', 'salvos', 'fetchPr', corpo)(logs, salvos, fetchPr);
  return { ...m, logs, salvos };
}

(async () => {
  console.log('\n=== Cada mudança grava os links ===');
  {
    const m = montar({ fetchPr: async ({ url }) => (url.includes('ruim') ? { ok: false, error: 'não achei' } : { ok: true, pr: { id: Number(url.slice(-2)), title: 'T', approvals: 1, buildState: 'SUCCESSFUL', repo: 'r' } }) });
    await m.adicionarPrNaFila('https://bitbucket.org/x/r/pull-requests/41');
    await m.adicionarPrNaFila('https://bitbucket.org/x/r/pull-requests/42');
    check('dois PRs na fila, o último no topo', m.state.queue.length === 2 && m.state.queue[0].url.endsWith('42') && m.state.queue[0].status === 'ready');
    check('gravou os links a cada entrada', m.salvos.length === 2 && m.salvos[1].length === 2 && m.salvos[1][0].endsWith('42'), JSON.stringify(m.salvos));
    await m.adicionarPrNaFila('https://bitbucket.org/x/r/pull-requests/ruim');
    check('PR que não carregou fica na fila com erro e também é gravado (você decide se tira)', m.state.queue[0].status === 'error' && m.salvos[2].length === 3);
    m.state.queue[1].status = 'merged';
    m.salvarFilaPrs();
    await new Promise((r) => setTimeout(r, 0));
    check('PR mergeado não vai para o hub-state', m.salvos[3].length === 2 && !m.salvos[3].some((u) => u.endsWith('42')), JSON.stringify(m.salvos[3]));
  }

  console.log('\n=== Ao abrir, os links voltam ===');
  {
    const buscados = [];
    const m = montar({ fetchPr: async ({ url }) => { buscados.push(url); return { ok: true, pr: { id: 1, title: 'T', approvals: 0, buildState: 'INPROGRESS' } }; } });
    m.state.queue.push({ localId: 'X', url: 'https://b/pr/7', status: 'ready' });
    const n = await m.restaurarFilaPrs(['https://b/pr/9', 'https://b/pr/7', 'https://b/pr/8']);
    check('busca de novo só os que não estão na fila, na ordem de antes (o primeiro gravado volta ao topo)', n === 2 && buscados.join(',') === 'https://b/pr/8,https://b/pr/9' && m.state.queue[0].url === 'https://b/pr/9', JSON.stringify({ n, buscados, fila: m.state.queue.map((q) => q.url) }));
    check('avisa quantos voltaram', m.logs.some(([msg]) => /2 PR\(s\) da fila de antes voltaram/.test(msg)));
    check('lista vazia ou inválida não faz nada', (await m.restaurarFilaPrs([])) === 0 && (await m.restaurarFilaPrs(null)) === 0);
  }
  {
    const buscados = [];
    const m = montar({ creds: null, fetchPr: async ({ url }) => { buscados.push(url); return { ok: true, pr: {} }; } });
    check('sem credencial do Bitbucket, não busca nada (os links continuam gravados)', (await m.restaurarFilaPrs(['https://b/pr/1'])) === 0 && buscados.length === 0);
  }
  check('o saveHubState do app grava filaPrs sem os mergeados', /filaPrs: state\.queue\.filter\(\(q\) => q\.url && q\.status !== 'merged'\)\.map\(\(q\) => q\.url\)/.test(app));
  check('a abertura lê filaPrs do hub-state e restaura depois de carregar a credencial', /state\.filaPrsSalva = Array\.isArray\(hubRes\.state\.filaPrs\)/.test(app) && /state\.creds = res\.creds;\n\s*restaurarFilaPrs\(state\.filaPrsSalva\)/.test(app));
  check('remover e mergear também gravam', (app.match(/salvarFilaPrs\(\);/g) || []).length >= 4);

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
