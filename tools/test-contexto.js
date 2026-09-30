// ADR-123: contexto da tarefa/caso no Salesforce. O handler roda no Electron;
// aqui testo as peças puras: o roteamento de link (tarefa x caso) que o handler
// faz com idDoLink/ehIdDeCaso, e o mapeamento texto → empresa (marcaDeTexto,
// recortado do main.js para não divergir).
//
//     node tools/test-contexto.js

const fs = require('fs');
const path = require('path');
const { idDoLink, ehIdDeCaso } = require(path.join(__dirname, '..', 'lib', 'salesforce'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// marcaDeTexto, exatamente como está no main.js.
const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const m = src.match(/const marcaDeTexto = (\([^)]*\) => [^\n]+);/);
if (!m) { console.log('  FALHOU  não achei marcaDeTexto no main.js'); process.exit(1); }
const marcaDeTexto = new Function('return ' + m[1])();

console.log('\n=== Texto → empresa ===');
check('"Busca Cliente" → bc', marcaDeTexto('Busca Cliente') === 'bc');
check('"MPI Solutions" → mpisolutions', marcaDeTexto('MPI Solutions') === 'mpisolutions');
check('"Deploy busca cliente" (fila) → bc', marcaDeTexto('Deploy busca cliente') === 'bc');
check('"Deploy MPI Solutions" (fila) → mpisolutions', marcaDeTexto('Deploy MPI Solutions') === 'mpisolutions');
check('vazio / outro → null', marcaDeTexto('') === null && marcaDeTexto('Ideal Marketing') === null);

console.log('\n=== Roteamento do link (o que o handler faz antes de consultar) ===');
const rotear = (tarefa, caso) => {
  let idTarefa = idDoLink(tarefa);
  let idCaso = idDoLink(caso);
  if (idTarefa && ehIdDeCaso(idTarefa)) { idCaso = idCaso || idTarefa; idTarefa = null; }
  if (idCaso && !ehIdDeCaso(idCaso)) idCaso = null;
  return { idTarefa, idCaso };
};
const T = 'https://x.lightning.force.com/lightning/r/Task/00TbL00000fLQ3EUAW/view';
const C = 'https://x.lightning.force.com/lightning/r/Case/500bL00000ABCDEUAW/view';
let r = rotear(T, null);
check('link de tarefa → consulta a tarefa (caso vem do WhatId)', r.idTarefa === '00TbL00000fLQ3EUAW' && r.idCaso === null);
r = rotear(null, C);
check('link de caso → vai direto ao caso', r.idTarefa === null && r.idCaso === '500bL00000ABCDEUAW');
r = rotear(C, null);
check('link de CASO colado no campo da tarefa → trata como caso', r.idTarefa === null && r.idCaso === '500bL00000ABCDEUAW');
r = rotear(null, T);
check('link de tarefa no campo do caso → não é caso (descartado)', r.idCaso === null);
r = rotear('', '');
check('sem link nenhum → nada', r.idTarefa === null && r.idCaso === null);

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
