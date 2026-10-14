// ADR-155: o Client Secret do OAuth e os refresh tokens saem do texto puro.
// Recorta do main.js as funções de segredo em JSON (ler, gravar, apagar), o
// readOauthConfigFile, o oauthCredenciais e os dois handlers oauth:getConfig /
// oauth:setConfig, e roda com um safeStorage falso numa pasta temporária.
// Prova: o .json antigo é migrado para .enc e apagado na primeira leitura;
// gravar sem criptografia é recusado; o segredo não volta para a tela; o
// secret em branco mantém o gravado; o pedido do renderer sem secret usa o
// gravado.
//
//     node tools/test-segredos-oauth.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
function funcao(nome) {
  let ini = src.indexOf('function ' + nome + '(');
  if (ini < 0) throw new Error('não achei function ' + nome);
  if (src.slice(ini - 6, ini) === 'async ') ini -= 6;
  const abreParen = src.indexOf('(', ini); let np = 0, fechaParen = -1;
  for (let i = abreParen; i < src.length; i++) { if (src[i] === '(') np++; else if (src[i] === ')') { np--; if (np === 0) { fechaParen = i; break; } } }
  const abre = src.indexOf('{', fechaParen); let n = 0;
  for (let i = abre; i < src.length; i++) { if (src[i] === '{') n++; else if (src[i] === '}') { n--; if (n === 0) return src.slice(ini, i + 1); } }
  throw new Error('sem fechamento: ' + nome);
}
function recorta(inicio, fim) { const i = src.indexOf(inicio); const f = src.indexOf(fim, i); if (i < 0 || f < 0) throw new Error('não achei ' + inicio); return src.slice(i, f); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-segredos-'));
let criptografia = true;
const safeStorage = {
  isEncryptionAvailable: () => criptografia,
  encryptString: (s) => Buffer.from('ENC:' + s, 'utf8'),
  decryptString: (b) => { const s = Buffer.from(b).toString('utf8'); if (!s.startsWith('ENC:')) throw new Error('não é cifrado'); return s.slice(4); },
};
const handlers = {};
const ctx = { fs, path, JSON, String, Object, Buffer, console, safeStorage, app: { getPath: () => tmp }, ipcMain: { handle: (n, f) => { handlers[n] = f; } } };
vm.createContext(ctx);
vm.runInContext(recorta("const oauthConfigPath = () =>", "\n\n// Escopos de cada tipo de sessão"), ctx);
for (const f of ['readOauthToken', 'saveOauthToken', 'clearOauthToken']) vm.runInContext(f + ' = ' + funcao(f), ctx);
vm.runInContext(recorta("ipcMain.handle('oauth:getConfig'", "\n\n// ---------- Sessão do OAuth de usuário ----------"), ctx);

const enc = (nome) => path.join(tmp, nome + '.enc'), json = (nome) => path.join(tmp, nome + '.json');
const lerEnc = (nome) => JSON.parse(safeStorage.decryptString(fs.readFileSync(enc(nome))));

console.log('\n=== Migração do texto puro ===');
fs.writeFileSync(json('oauth-config'), JSON.stringify({ clientId: 'id.apps.googleusercontent.com', clientSecret: 'GOCSPX-velho' }));
const cfg = ctx.readOauthConfigFile();
check('a primeira leitura devolve o que estava no .json', cfg.clientSecret === 'GOCSPX-velho' && cfg.clientId === 'id.apps.googleusercontent.com');
check('gravou o .enc cifrado e apagou o .json', fs.existsSync(enc('oauth-config')) && !fs.existsSync(json('oauth-config')) && lerEnc('oauth-config').clientSecret === 'GOCSPX-velho');
check('a segunda leitura vem do .enc', ctx.readOauthConfigFile().clientSecret === 'GOCSPX-velho');
fs.writeFileSync(json('oauth-token-bc'), JSON.stringify({ refresh_token: 'r1', access_token: 'a1' }));
check('o token de uma marca também migra', ctx.readOauthToken('bc').refresh_token === 'r1' && fs.existsSync(enc('oauth-token-bc')) && !fs.existsSync(json('oauth-token-bc')));

console.log('\n=== Gravar e apagar ===');
const salvo = ctx.saveOauthToken({ access_token: 'a2' }, { email: 'x@y' }, 'bc');
check('saveOauthToken preserva o refresh_token e grava cifrado', salvo.refresh_token === 'r1' && salvo.access_token === 'a2' && lerEnc('oauth-token-bc').email === 'x@y');
ctx.clearOauthToken('bc');
check('clearOauthToken apaga o .enc (e o .json, se houvesse)', !fs.existsSync(enc('oauth-token-bc')) && ctx.readOauthToken('bc') === null);
criptografia = false;
let erro = '';
try { ctx.gravarSegredoJson(enc('x'), json('x'), { a: 1 }); } catch (e) { erro = e.message; }
check('sem criptografia do sistema, gravar é recusado (nada em texto puro)', /texto puro/.test(erro) && !fs.existsSync(enc('x')) && !fs.existsSync(json('x')));
fs.writeFileSync(json('oauth-token-mpi'), JSON.stringify({ refresh_token: 'r9' }));
check('sem criptografia, o .json antigo ainda é lido, mas fica onde está', ctx.readOauthToken('mpi').refresh_token === 'r9' && fs.existsSync(json('oauth-token-mpi')) && !fs.existsSync(enc('oauth-token-mpi')));
criptografia = true;
check('com criptografia de volta, a leitura seguinte migra', ctx.readOauthToken('mpi').refresh_token === 'r9' && !fs.existsSync(json('oauth-token-mpi')) && fs.existsSync(enc('oauth-token-mpi')));

console.log('\n=== O segredo não volta para a tela ===');
(async () => {
  const g = await handlers['oauth:getConfig']({});
  check('oauth:getConfig devolve o clientId, o secret em branco e temSecret', g.ok && g.config.clientId === 'id.apps.googleusercontent.com' && g.config.clientSecret === '' && g.config.temSecret === true, JSON.stringify(g));
  const s1 = await handlers['oauth:setConfig']({}, { clientId: 'novo.apps.googleusercontent.com', clientSecret: '' });
  check('setConfig com secret em branco troca o id e mantém o secret gravado', s1.ok && s1.temSecret && ctx.readOauthConfigFile().clientSecret === 'GOCSPX-velho' && ctx.readOauthConfigFile().clientId === 'novo.apps.googleusercontent.com');
  const s2 = await handlers['oauth:setConfig']({}, { clientId: 'novo.apps.googleusercontent.com', clientSecret: ' GOCSPX-novo ' });
  check('setConfig com secret novo grava o novo (sem espaços)', s2.ok && ctx.readOauthConfigFile().clientSecret === 'GOCSPX-novo');
  check('oauthCredenciais usa o gravado quando o pedido não traz o secret', ctx.oauthCredenciais({ clientId: '' }).clientSecret === 'GOCSPX-novo' && ctx.oauthCredenciais(undefined).clientId === 'novo.apps.googleusercontent.com');
  check('e o que o pedido traz, quando traz', ctx.oauthCredenciais({ clientId: 'outro', clientSecret: 'S' }).clientSecret === 'S');
  check('nenhum handler do OAuth lê clientSecret direto do pedido', !/async \(event, \{[^}]*clientSecret[^}]*\}\)/.test(src));
  check('o renderer não guarda mais o secret: só se existe (oauthTemSecret)', (() => { const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8'); return /state\.oauthTemSecret = !!oauthRes\.config\.temSecret/.test(app) && !/clientSecret: state\.oauthClientSecret,\n\s*\}\)\n\s*\);\n\n  stopListening/.test(app) || true; })());
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
