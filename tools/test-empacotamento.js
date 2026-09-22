// O instalador só leva o que está em package.json > build.files. Um require por
// caminho em main.js para algo fora dessa lista abre o app com "Cannot find
// module" e mais nada (foi o que aconteceu com lib/zona). Este teste confere.
//
//     node tools/test-empacotamento.js

const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf-8'));
const lista = pkg.build.files;
const main = fs.readFileSync(path.join(raiz, 'main.js'), 'utf-8');

let falhas = 0;
const check = (n, c, d) => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// require(path.join(__dirname, 'a', 'b')) e require('./a/b')
const pastas = new Set();
for (const m of main.matchAll(/require\(path\.join\(__dirname,\s*'([^']+)'/g)) pastas.add(m[1]);
for (const m of main.matchAll(/require\('\.\/([^'/]+)/g)) pastas.add(m[1]);

console.log('\n=== Tudo que main.js requer por caminho está no instalador ===');
check('achou requires por caminho', pastas.size > 0, 'nenhum? o padrão do teste ficou velho');
for (const pasta of pastas) {
  const coberta = lista.some((f) => f === pasta || f.startsWith(pasta + '/') || f === pasta + '.js');
  check(`${pasta} está em build.files`, coberta, `lista: ${lista.join(', ')}`);
}

console.log('\n=== Dependências de runtime não estão em devDependencies ===');
for (const dep of ['googleapis', 'xlsx']) {
  check(`${dep} em dependencies`, !!pkg.dependencies[dep] && !(pkg.devDependencies || {})[dep]);
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
