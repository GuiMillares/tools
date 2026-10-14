// ADR-158: na primeira abertura como Asgard, os dados de %APPDATA%\pr-merge-tool
// são copiados para a pasta nova (sem os caches do Chromium), a antiga fica
// como reserva, e nada é feito quando a pasta nova já tem hub-state ou quando
// o nome ainda é o antigo. Recorta migrarDadosDoNomeAntigo do main.js e roda
// com pastas temporárias.
//
//     node tools/test-migracao-asgard.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const i = src.indexOf("const NOME_ANTIGO = 'pr-merge-tool';");
const f = src.indexOf('\nconst credsPath', i);
if (i < 0 || f < 0) throw new Error('não achei a migração');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-migra-'));
const appData = path.join(raiz, 'AppData');
const antiga = path.join(appData, 'pr-merge-tool');
let nova = path.join(appData, 'asgard');
fs.mkdirSync(path.join(antiga, 'Cache'), { recursive: true });
fs.mkdirSync(path.join(antiga, 'Local Storage', 'leveldb'), { recursive: true });
fs.mkdirSync(path.join(antiga, 'Partitions', 'painel-mpi', 'Network'), { recursive: true });
fs.writeFileSync(path.join(antiga, 'hub-state.json'), '{"recents":["merge"]}');
fs.writeFileSync(path.join(antiga, 'credentials.enc'), Buffer.from([1, 2, 3]));
fs.writeFileSync(path.join(antiga, 'escritorio.json'), '{"tarefas":[]}');
fs.writeFileSync(path.join(antiga, 'Cache', 'index'), 'cache');
fs.writeFileSync(path.join(antiga, 'Local Storage', 'leveldb', '000.log'), 'ls');
fs.writeFileSync(path.join(antiga, 'Partitions', 'painel-mpi', 'Network', 'Cookies'), 'cookies');
fs.writeFileSync(path.join(antiga, 'lockfile'), '');

const ctx = { fs, path, Set, Date, app: { getPath: (k) => (k === 'userData' ? nova : appData) } };
vm.createContext(ctx);
vm.runInContext(src.slice(i, f), ctx);

console.log('\n=== Primeira abertura como Asgard ===');
check('copia e devolve true', ctx.migrarDadosDoNomeAntigo() === true);
check('hub-state, credenciais e escritório chegaram', fs.readFileSync(path.join(nova, 'hub-state.json'), 'utf8') === '{"recents":["merge"]}' && fs.readFileSync(path.join(nova, 'credentials.enc'))[2] === 3 && fs.existsSync(path.join(nova, 'escritorio.json')));
check('Local Storage e os logins dos painéis (Partitions) também', fs.existsSync(path.join(nova, 'Local Storage', 'leveldb', '000.log')) && fs.readFileSync(path.join(nova, 'Partitions', 'painel-mpi', 'Network', 'Cookies'), 'utf8') === 'cookies');
check('os caches do Chromium e o lockfile não', !fs.existsSync(path.join(nova, 'Cache')) && !fs.existsSync(path.join(nova, 'lockfile')));
check('deixa a marca de onde veio', /Copiado de .*pr-merge-tool/.test(fs.readFileSync(path.join(nova, 'migrado-de.txt'), 'utf8')));
check('a pasta antiga fica intacta', fs.existsSync(path.join(antiga, 'hub-state.json')) && fs.existsSync(path.join(antiga, 'Cache', 'index')));

console.log('\n=== Aberturas seguintes e casos em que não mexe ===');
fs.writeFileSync(path.join(antiga, 'hub-state.json'), '{"recents":["outro"]}');
check('com a pasta nova já populada, não copia de novo (o que você mudou depois fica)', ctx.migrarDadosDoNomeAntigo() === false && fs.readFileSync(path.join(nova, 'hub-state.json'), 'utf8') === '{"recents":["merge"]}');
nova = path.join(appData, 'vazia');
fs.rmSync(antiga, { recursive: true, force: true });
check('sem a pasta antiga, não faz nada', ctx.migrarDadosDoNomeAntigo() === false && !fs.existsSync(nova));
nova = path.join(appData, 'pr-merge-tool');
check('com o nome antigo ainda em uso, não faz nada', ctx.migrarDadosDoNomeAntigo() === false);
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
check('o package.json já é asgard, com o appId novo e o productName Asgard', pkg.name === 'asgard' && pkg.build.appId === 'com.castrotech.asgard' && pkg.build.productName === 'Asgard');

fs.rmSync(raiz, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
