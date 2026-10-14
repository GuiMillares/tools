// ADR-156: exportar o histórico de merges. Recorta do main.js o CSV e o
// handler history:export e roda com um dialog falso: CSV com BOM, ponto e
// vírgula, cabeçalho fixo, célula com aspas escapada; JSON inteiro;
// cancelar não grava nada.
//
//     node tools/test-historico-export.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
function recorta(inicio, fim) { const i = src.indexOf(inicio); const f = src.indexOf(fim, i); if (i < 0 || f < 0) throw new Error('não achei ' + inicio); return src.slice(i, f); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-export-'));
const entries = [
  { id: 'a', at: '2026-10-14T10:00:00.000Z', repo: 'site-x', prId: 42, title: 'Ajuste; com "aspas"', author: 'Ana', sourceBranch: 'feature/x', destBranch: 'main', strategy: 'squash', approvals: 1, buildState: 'SUCCESSFUL', ok: true, mergedHash: 'abc123', log: ['linha 1'] },
  { id: 'b', at: '2026-10-13T10:00:00.000Z', repo: 'site-y', prId: 7, title: 'Hotfix', author: 'Bia', ok: false, error: 'conflito' },
];
let resposta = { canceled: false, filePath: path.join(tmp, 'saida.csv') };
const handlers = {};
const ctx = {
  fs, path, JSON, String, Date, console, Array,
  app: { getPath: () => tmp },
  dialog: { showSaveDialog: async (win, op) => { ctx.ultimoPedido = op; return resposta; } },
  janelaPrincipal: () => null,
  readMergeHistory: () => entries,
  ipcMain: { handle: (n, f) => { handlers[n] = f; } },
};
vm.createContext(ctx);
vm.runInContext(recorta('const HISTORICO_CSV_CAMPOS', "\n\nipcMain.handle('history:remove'"), ctx);

(async () => {
  console.log('\n=== CSV ===');
  const csv = ctx.historicoParaCsv(entries);
  const linhas = csv.split('\r\n');
  check('cabeçalho fixo com ponto e vírgula', linhas[0] === 'quando;repo;prId;title;author;sourceBranch;destBranch;strategy;approvals;buildState;ok;mergedHash;error');
  check('a data vem do campo at', linhas[1].startsWith('2026-10-14T10:00:00.000Z;site-x;42;'));
  check('célula com ; e aspas vai entre aspas, com as aspas dobradas', linhas[1].includes('"Ajuste; com ""aspas"""'));
  check('ok vira sim/não; campo ausente vira vazio', linhas[1].includes(';sim;abc123;') && linhas[2].endsWith(';não;;conflito'));
  check('termina com quebra de linha e tem uma linha por merge', linhas.length === 4 && linhas[3] === '');

  console.log('\n=== Handler ===');
  const r1 = await handlers['history:export']({}, { formato: 'csv' });
  check('grava o CSV no caminho escolhido, com BOM, e devolve o total', r1.ok && r1.caminho === resposta.filePath && r1.total === 2 && fs.readFileSync(resposta.filePath, 'utf-8').startsWith('﻿quando;'));
  check('o diálogo sugere Documentos e a extensão do formato', /merges-\d{4}-\d{2}-\d{2}\.csv$/.test(ctx.ultimoPedido.defaultPath) && ctx.ultimoPedido.filters[0].extensions[0] === 'csv');
  resposta = { canceled: false, filePath: path.join(tmp, 'saida.json') };
  const r2 = await handlers['history:export']({}, { formato: 'json' });
  check('JSON inteiro, com o trecho do terminal', r2.ok && JSON.parse(fs.readFileSync(resposta.filePath, 'utf-8'))[0].log[0] === 'linha 1');
  resposta = { canceled: true };
  const r3 = await handlers['history:export']({}, { formato: 'csv' });
  check('cancelar não grava e não é erro', r3.ok && r3.cancelado === true);
  const r4 = await handlers['history:export']({}, {});
  check('sem formato, é CSV', r4.ok && r4.cancelado === true && ctx.ultimoPedido.filters[0].extensions[0] === 'csv');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
