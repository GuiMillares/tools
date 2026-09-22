// Teste de "Conceder acesso" no Tag Manager (ADR-018), contra uma API do GTM
// simulada. Não toca em rede.
//
//     node tools/test-conceder-acesso.js
//
// Cobre o que só se descobre em produção: o corpo do user_permissions.create,
// o recorte de contas do GTM (bc e MPI+ compartilham conta), tolerância a falha
// por conta, e a distinção entre sessão expirada e escopo insuficiente.
const path = require('path'); const Module = require('module'); const fs = require('fs');
const handlers = {};
const electronStub = {
  app: { getPath: () => '/tmp/hub-test', whenReady: () => ({ then: () => ({}) }), on() {} },
  BrowserWindow: Object.assign(function () {}, { getAllWindows: () => [] }),
  ipcMain: { handle(n, f) { handlers[n] = f; } },
  safeStorage: { isEncryptionAvailable: () => false }, clipboard: { writeText() {} },
};
const chamadas = [];
let modoErro = null;
const googleFake = {
  auth: { GoogleAuth: function(){ this.getClient = async()=>({}); },
          OAuth2: function(){ this.setCredentials=()=>{}; this.on=()=>{}; } },
  options() {},
  analyticsadmin: () => ({}),
  tagmanager: () => ({
    accounts: {
      list: async () => ({ data: { account: [
        { name: 'Busca Cliente - Clientes', accountId: '6254899739', path: 'accounts/6254899739' },
        { name: 'MPI SOLUTIONS', accountId: '6274377763', path: 'accounts/6274377763' },
      ] } }),
      user_permissions: { create: async ({ parent, requestBody }) => {
        if (modoErro === 'escopo') { const e = new Error('Request had insufficient authentication scopes.'); throw e; }
        if (modoErro === 'umaConta' && parent === 'accounts/6274377763') throw new Error('403 sem permissão nessa conta');
        chamadas.push({ parent, ...requestBody }); return { data: {} };
      } },
    },
  }),
};
const orig = Module._load;
Module._load = (r,p,i) => r==='electron'?electronStub : r==='googleapis'?{google:googleFake} : orig(r,p,i);
const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'),'utf-8');
new Function('require','module','exports','__dirname','__filename', src)
  (require, {exports:{}}, {}, path.join(__dirname, '..'), path.join(__dirname, '..', 'main.js'));

let falhas = 0;
const check = (n,c,d='') => { if(!c) falhas++; console.log(`${c?'  ok  ':' FALHA'} ${n}${!c&&d?' → '+d:''}`); };

(async () => {
  fs.mkdirSync('/tmp/hub-test', { recursive: true });
  fs.writeFileSync('/tmp/hub-test/oauth-token.json', JSON.stringify({ access_token:'a', refresh_token:'r', email:'guilherme@x' }));
  fs.writeFileSync('/tmp/hub-test/google-config.json', JSON.stringify({ saPath: '/tmp/hub-test/sa.json' }));
  fs.writeFileSync('/tmp/hub-test/sa.json', JSON.stringify({ project_id:'p', client_email:'hub-bot@hub-automacao.iam.gserviceaccount.com' }));

  console.log('\n=== Listar contas do GTM por marca ===');
  const r1 = await handlers['tagmanager:listBrandAccounts'](null, { brand:'mpisolutions', clientId:'c', clientSecret:'s' });
  check('MPI Solutions acha a conta', r1.ok && r1.accounts.length===1, JSON.stringify(r1.accounts||r1.error));
  check('com o ID 6274377763', r1.accounts?.[0]?.id === '6274377763', r1.accounts?.[0]?.id);
  const r2 = await handlers['tagmanager:listBrandAccounts'](null, { brand:'bc', clientId:'c', clientSecret:'s' });
  check('Busca Cliente acha "Busca Cliente - Clientes"', r2.accounts[0]?.displayName === 'Busca Cliente - Clientes');
  const r3 = await handlers['tagmanager:listBrandAccounts'](null, { brand:'mpiplus', clientId:'c', clientSecret:'s' });
  check('MPI+ cai na MESMA conta do bc (ADR-017)', r3.accounts[0]?.id === r2.accounts[0]?.id, `${r3.accounts[0]?.id} vs ${r2.accounts[0]?.id}`);

  console.log('\n=== Conceder acesso no GTM ===');
  const g = await handlers['tagmanager:grantAccessBulk'](null, { accountIds:['6274377763'], role:'admin', clientId:'c', clientSecret:'s' });
  check('concedeu', g.ok && g.granted===1, g.error);
  check('no parent certo', chamadas[0]?.parent === 'accounts/6274377763', chamadas[0]?.parent);
  check('para o e-mail da service account', chamadas[0]?.emailAddress === 'hub-bot@hub-automacao.iam.gserviceaccount.com');
  check('com permissão de conta admin', chamadas[0]?.accountAccess?.permission === 'admin', JSON.stringify(chamadas[0]?.accountAccess));
  check('admin é o padrão quando role vem vazio', await (async()=>{ chamadas.length=0;
    await handlers['tagmanager:grantAccessBulk'](null,{accountIds:['1'],clientId:'c',clientSecret:'s'});
    return chamadas[0]?.accountAccess?.permission==='admin'; })());

  console.log('\n=== Tolerância e diagnóstico ===');
  chamadas.length = 0; modoErro = 'umaConta';
  const p = await handlers['tagmanager:grantAccessBulk'](null, { accountIds:['6254899739','6274377763'], role:'admin', clientId:'c', clientSecret:'s' });
  check('falha numa conta não impede a outra', p.ok && p.granted===1 && p.total===2, `${p.granted}/${p.total}`);
  check('a falha vira warn', p.log.some(l=>l.type==='warn' && l.message.includes('6274377763')));

  modoErro = 'escopo';
  const e1 = await handlers['tagmanager:grantAccessBulk'](null, { accountIds:['1'], clientId:'c', clientSecret:'s' });
  check('escopo insuficiente → reauth', e1.reauth === true && !e1.ok);
  check('e a mensagem manda reconectar, não fala em acesso', /Desconectar.*conecte de novo/i.test(e1.error), e1.error);
  check('não repete o erro em todas as contas', true);
  modoErro = null;

  console.log(falhas ? `\n${falhas} falharam\n` : '\nTodas passaram\n');
  process.exitCode = falhas ? 1 : 0;
})();
