// O google do Hub (lib/google.js, ADR-107): só as 6 APIs, carregadas no
// primeiro uso, com o mesmo google.options() global do googleapis inteiro.
// Roda o mesmo roteiro no pacote inteiro e no leve e compara o que cada
// cliente mandou, e com qual autenticação. Nada sai da máquina: a
// autenticação é de mentira e responde na hora.
//
//     node tools/test-google-leve.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const raiz = path.join(__dirname, '..');
let falhas = 0;
const check = (n, c, d) => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const carregados = () => Object.keys(require.cache).map((f) => f.replace(/\\/g, '/'));
const apisCarregadas = () => [...new Set(carregados().map((f) => (f.match(/googleapis\/build\/src\/apis\/([^/]+)\//) || [])[1]).filter(Boolean))].sort();
const pacoteInteiro = () => carregados().some((f) => /googleapis\/build\/src\/(index|googleapis)\.js$/.test(f));

// Autenticação de mentira. Classe, e não objeto literal, porque o
// googleapis-common copia a fundo (extend) o que é objeto simples.
class AuthFalsa {
  constructor(nome, registro) { this.nome = nome; this.registro = registro; }
  async request(opcoes) {
    this.registro.push({ auth: this.nome, metodo: opcoes.method || 'GET', url: String(opcoes.url).replace(/\?.*$/, ''), timeout: opcoes.timeout });
    return { data: { ok: true }, status: 200, headers: {}, config: opcoes };
  }
}

// O roteiro do main.js: a service account liga o global com prazo
// (buildGoogleAuthClient), o OAuth global troca tudo e fica sem prazo
// (loadUserOauthClient), e cliente com autenticação própria não é sequestrado.
async function roteiro(google) {
  const reg = [];
  const antes = google.tagmanager('v2'); // criado antes de haver autenticação
  google.options({ auth: new AuthFalsa('service account', reg), timeout: 60000 });
  await antes.accounts.list();
  const admin = google.analyticsadmin('v1beta');
  await admin.accountSummaries.list();
  google.options({ auth: new AuthFalsa('oauth', reg) });
  await antes.accounts.list();
  await admin.accountSummaries.list();
  await google.oauth2({ version: 'v2', auth: new AuthFalsa('própria', reg) }).userinfo.get();
  await google.siteVerification('v1').webResource.list();
  await google.searchconsole('v1').sites.list();
  await google.recaptchaenterprise('v1').projects.keys.list({ parent: 'projects/hub' });
  await google.analyticsadmin('v1alpha').accountSummaries.list();
  return reg;
}

(async () => {
  console.log('\n=== Abrir não carrega nada do Google ===');
  const { google: leve, APIS } = require(path.join(raiz, 'lib', 'google'));
  check('lib/google.js não carrega o pacote inteiro', !pacoteInteiro());
  check('nem API nenhuma', apisCarregadas().length === 0, apisCarregadas().join(', '));
  check('tem a cara do google do pacote', typeof leve.options === 'function' && APIS.every((n) => typeof leve[n] === 'function'));

  // O main.js inteiro, com o electron de mentira do test-painel: o topo do
  // arquivo não pode puxar nada do Google.
  const electron = {
    app: { getPath: () => path.join(os.tmpdir(), 'hub-google-leve'), whenReady: () => ({ then: () => ({}) }), on() {} },
    BrowserWindow: Object.assign(function () { throw new Error('não deveria abrir janela'); }, { getAllWindows: () => [] }),
    ipcMain: { handle() {} },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => String(b) },
    clipboard: { writeText() {} },
    session: { fromPartition: () => ({ clearStorageData: async () => {} }) },
  };
  const src = fs.readFileSync(path.join(raiz, 'main.js'), 'utf-8');
  const orig = Module._load;
  Module._load = (r, p, i) => (r === 'electron' ? electron : orig(r, p, i));
  try {
    new Function('require', 'module', 'exports', '__dirname', '__filename', src)(require, { exports: {} }, {}, raiz, path.join(raiz, 'main.js'));
  } finally {
    Module._load = orig;
  }
  check('o main.js não usa mais require(\'googleapis\')', !/require\(\s*['"]googleapis['"]\s*\)/.test(src));
  check('abrir o main.js não carrega o pacote inteiro', !pacoteInteiro());
  check('nem API nenhuma', apisCarregadas().length === 0, apisCarregadas().join(', '));
  const usadas = [...new Set([...src.matchAll(/\bgoogle\.([a-zA-Z0-9]+)\(/g)].map((m) => m[1]))].filter((n) => n !== 'options');
  const faltam = usadas.filter((n) => !APIS.includes(n));
  check(`toda API que o main.js chama está no lib/google.js (${usadas.join(', ')})`, usadas.length > 0 && faltam.length === 0, faltam.length ? `faltam: ${faltam.join(', ')}` : 'o padrão do teste não achou nenhuma');

  console.log('\n=== Cada API no primeiro uso ===');
  leve.tagmanager('v2');
  check('google.tagmanager() carrega só o tagmanager', apisCarregadas().join(',') === 'tagmanager', apisCarregadas().join(', '));
  const { GoogleAuth, OAuth2 } = leve.auth;
  check('google.auth traz GoogleAuth e OAuth2', typeof GoogleAuth === 'function' && typeof OAuth2 === 'function');
  check('e continua sem o pacote inteiro', !pacoteInteiro());

  console.log('\n=== Mesmo comportamento do googleapis inteiro ===');
  const inteiro = require('googleapis').google;
  check('GoogleAuth é a mesma classe do pacote', leve.auth.GoogleAuth === inteiro.auth.GoogleAuth);
  check('OAuth2 é a mesma classe do pacote', leve.auth.OAuth2 === inteiro.auth.OAuth2);
  const esperado = await roteiro(inteiro);
  const obtido = await roteiro(leve);
  check('as mesmas requisições, com a mesma autenticação e o mesmo prazo', JSON.stringify(obtido) === JSON.stringify(esperado), `\n    inteiro: ${JSON.stringify(esperado)}\n    leve:    ${JSON.stringify(obtido)}`);
  const auths = obtido.map((x) => x.auth).join(' > ');
  check('cliente criado antes do google.options() usa a autenticação posta depois', obtido[0] && obtido[0].auth === 'service account', auths);
  check('o prazo de 60 s vai junto com a service account', obtido[0] && obtido[0].timeout === 60000 && obtido[1].timeout === 60000);
  check('o OAuth global troca a autenticação de todos, inclusive dos que já existiam', obtido[2] && obtido[2].auth === 'oauth' && obtido[3].auth === 'oauth', auths);
  check('e substitui as opções inteiras: o prazo sai, como no pacote', obtido[2] && obtido[2].timeout === undefined, obtido[2] && String(obtido[2].timeout));
  check('cliente com autenticação própria não é sequestrado pelo global', obtido[4] && obtido[4].auth === 'própria', auths);
  check('as seis APIs responderam pelo leve (9 requisições)', obtido.length === 9, String(obtido.length));

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
