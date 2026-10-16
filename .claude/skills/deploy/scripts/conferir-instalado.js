// Confere o Hub instalado contra o repositório: versão do app.asar x
// package.json, pastas de build.files dentro do asar, e arquivos do último
// commit que ficaram fora do instalador (não estão em build.files).
//
//     node .claude/skills/deploy/scripts/conferir-instalado.js
//
// Sai com código 1 quando a versão instalada não é a do package.json ou falta
// pasta de build.files no asar. Arquivo fora de build.files é só aviso: docs,
// tools e testes não vão para o instalador de propósito.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf-8'));
const asarPath = path.join(process.env.LOCALAPPDATA || '', 'Programs', pkg.name, 'resources', 'app.asar');

let falhas = 0;
const ok = (m) => console.log('  ok    ' + m);
const falha = (m) => { falhas++; console.log('  FALHOU ' + m); };
const aviso = (m) => console.log('  !     ' + m);

if (!fs.existsSync(asarPath)) {
  console.log(`x Não achei o Hub instalado em ${asarPath}.`);
  process.exit(1);
}

const asar = require(path.join(RAIZ, 'node_modules', '@electron', 'asar'));
const instalado = JSON.parse(asar.extractFile(asarPath, 'package.json').toString());
const lista = asar.listPackage(asarPath).map((x) => x.replace(/\\/g, '/'));

console.log(`\nHub instalado: ${instalado.version} · package.json: ${pkg.version}`);
if (instalado.version === pkg.version) ok('a versão instalada é a do package.json');
else falha(`versão instalada (${instalado.version}) não é a do package.json (${pkg.version}) — rode npm run atualizar`);

// Cada entrada positiva de build.files tem que existir dentro do asar.
for (const f of pkg.build.files) {
  if (f.startsWith('!')) continue;
  const base = '/' + f.replace(/\/\*\*.*$/, '').replace(/\/\*$/, '');
  const existe = lista.some((x) => x === base || x.startsWith(base + '/'));
  if (existe) ok(`${f} está no instalador`); else falha(`${f} não está no instalador`);
}

// Arquivos do último commit de trabalho (o anterior ao commit de versão, se o
// HEAD for só package.json/lock) que não entram em build.files.
function arquivosDoCommit(ref) {
  return execSync(`git show --name-only --format= ${ref}`, { cwd: RAIZ, encoding: 'utf-8' }).split(/\r?\n/).filter(Boolean);
}
let ref = 'HEAD';
let arquivos = arquivosDoCommit(ref);
if (arquivos.every((a) => /^package(-lock)?\.json$/.test(a))) { ref = 'HEAD~1'; arquivos = arquivosDoCommit(ref); }
// Arquivo apagado no commit tem que estar FORA do asar, não dentro (ADR-159
// apagou a cena 3D e este script cobrava a presença dela).
const apagados = new Set(execSync(`git show --name-status --diff-filter=D --format= ${ref}`, { cwd: RAIZ, encoding: 'utf-8' }).split(/\r?\n/).map((l) => l.replace(/^D\s+/, '').trim()).filter(Boolean));
const cobre = (a) => pkg.build.files.some((f) => {
  if (f.startsWith('!')) return false;
  const base = f.replace(/\/\*\*.*$/, '').replace(/\/\*$/, '');
  return a === f || a === base || a.startsWith(base + '/');
});
const fora = arquivos.filter((a) => !cobre(a));
const dentro = arquivos.filter(cobre);
console.log(`\nÚltimo commit de trabalho (${ref}): ${arquivos.length} arquivo(s), ${dentro.length} no instalador, ${fora.length} fora.`);
for (const a of fora) aviso(`${a} não vai para o instalador (fora de build.files) — esperado para docs, tools e testes`);
// Os que entram têm que estar no asar com o conteúdo do repositório.
for (const a of dentro) {
  if (apagados.has(a)) { if (lista.includes('/' + a)) falha(`${a} foi apagado no commit e ainda está no asar`); else ok(`${a} apagado no commit, e fora do asar`); continue; }
  if (!lista.includes('/' + a)) { falha(`${a} deveria estar no asar e não está`); continue; }
  // O leitor do asar separa o caminho pelo separador do sistema: com barra
  // normal, "lib/x/y.js" (dois níveis) não é achado no Windows.
  const doAsar = asar.extractFile(asarPath, a.split('/').join(path.sep));
  const doRepo = fs.readFileSync(path.join(RAIZ, a));
  // O electron-builder reescreve o package.json dentro do asar (tira scripts e
  // devDependencies): compara o que importa, versão e dependências.
  if (a === 'package.json') {
    const pa = JSON.parse(doAsar.toString('utf-8'));
    const pr = JSON.parse(doRepo.toString('utf-8'));
    const depsIguais = JSON.stringify(pa.dependencies || {}) === JSON.stringify(pr.dependencies || {});
    if (pa.version === pr.version && depsIguais) ok(`${a}: versão ${pa.version} e dependências iguais às do repositório`);
    else falha(`${a} no asar (versão ${pa.version}) difere do repositório (versão ${pr.version}${depsIguais ? '' : ', dependências diferentes'})`);
    continue;
  }
  if (Buffer.compare(doAsar, doRepo) === 0) ok(`${a} igual ao do repositório`);
  else falha(`${a} no asar é DIFERENTE do repositório — a instalação não é a do commit`);
}

console.log(falhas ? `\n${falhas} problema(s).\n` : '\nInstalado confere com o repositório.\n');
process.exit(falhas ? 1 : 0);
