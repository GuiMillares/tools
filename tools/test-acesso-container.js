// Acesso da conta principal ao container recém-criado (ADR-020).
//
//     node tools/test-acesso-container.js
//
// O caso que dói: a service account cria o container e o humano abre em
// "somente leitura". Aqui se verifica que o acesso é concedido, que quem já é
// membro é ATUALIZADO (não recriado), e que os containers antigos da pessoa não
// são perdidos no caminho.

const path = require('path');
const Module = require('module');
const fs = require('fs');

const handlers = {};
const electronStub = {
  app: { getPath: () => '/tmp/hub-test', whenReady: () => ({ then: () => ({}) }), on() {} },
  BrowserWindow: Object.assign(function () {}, { getAllWindows: () => [] }),
  ipcMain: { handle(n, f) { handlers[n] = f; } },
  safeStorage: { isEncryptionAvailable: () => false }, clipboard: { writeText() {} },
};
const googleFake = {
  auth: { GoogleAuth: function(){ this.getClient = async()=>({}); },
          OAuth2: function(){ this.setCredentials=()=>{}; this.on=()=>{}; } },
  options() {}, analyticsadmin: () => ({}), tagmanager: () => ({}),
};
const orig = Module._load;
Module._load = (r,p,i) => r==='electron'?electronStub : r==='googleapis'?{google:googleFake} : orig(r,p,i);
const src = fs.readFileSync(path.join(__dirname,'..','main.js'),'utf-8');
const mod = { exports: {} };
new Function('require','module','exports','__dirname','__filename',
  src + ';module.exports={grantOwnerContainerAccess,GTM_CONTAINER_PERMISSION};')
  (require, mod, mod.exports, path.join(__dirname,'..'), path.join(__dirname,'..','main.js'));
const M = mod.exports;

let falhas = 0;
const check = (n,c,d='') => { if(!c) falhas++; console.log(`${c?'  ok  ':' FALHA'} ${n}${!c&&d?' → '+d:''}`); };
const ritmo = async (_l, fn) => fn();

function fakeTm(permissoes) {
  const chamadas = { create: [], update: [] };
  return {
    chamadas,
    api: { accounts: { user_permissions: {
      list: async () => ({ data: { userPermission: permissoes } }),
      create: async ({ parent, requestBody }) => { chamadas.create.push({ parent, ...requestBody }); return { data: {} }; },
      update: async ({ path, requestBody }) => { chamadas.update.push({ path, ...requestBody }); return { data: {} }; },
    } } },
  };
}

(async () => {
  console.log('\n=== Pessoa ainda não é membro da conta ===');
  {
    const { api, chamadas } = fakeTm([]);
    const r = await M.grantOwnerContainerAccess({
      tagmanager: api, accountPath: 'accounts/1', containerId: '999',
      email: 'guilherme@idealtrends.com.br', ritmo, push: () => {},
    });
    check('cria a permissão', r.estado === 'criado' && chamadas.create.length === 1);
    check('entra como usuário da conta, não admin', chamadas.create[0].accountAccess.permission === 'user',
      chamadas.create[0].accountAccess.permission);
    check('com publish no container novo',
      chamadas.create[0].containerAccess[0].permission === 'publish' &&
      chamadas.create[0].containerAccess[0].containerId === '999');
    check('não usou update', chamadas.update.length === 0);
  }

  console.log('\n=== Pessoa já é membro, com outros containers ===');
  {
    const { api, chamadas } = fakeTm([{
      path: 'accounts/1/user_permissions/77',
      emailAddress: 'Guilherme@IdealTrends.com.BR', // caixa diferente de propósito
      accountAccess: { permission: 'user' },
      containerAccess: [
        { containerId: '111', permission: 'publish' },
        { containerId: '222', permission: 'read' },
      ],
    }]);
    const r = await M.grantOwnerContainerAccess({
      tagmanager: api, accountPath: 'accounts/1', containerId: '999',
      email: 'guilherme@idealtrends.com.br', ritmo, push: () => {},
    });
    check('atualiza em vez de criar', r.estado === 'atualizado' && chamadas.update.length === 1 && chamadas.create.length === 0);
    check('casa e-mail ignorando maiúsculas', chamadas.update.length === 1);
    check('no path da permissão existente', chamadas.update[0].path === 'accounts/1/user_permissions/77');
    const ca = chamadas.update[0].containerAccess;
    check('preserva os containers antigos', ca.some(c=>c.containerId==='111'&&c.permission==='publish') &&
      ca.some(c=>c.containerId==='222'&&c.permission==='read'), JSON.stringify(ca));
    check('adiciona o novo com publish', ca.some(c=>c.containerId==='999'&&c.permission==='publish'));
    check('não duplica nada', ca.length === 3, String(ca.length));
    check('informa quantos havia antes', r.containersAntes === 2);
  }

  console.log('\n=== Container repetido não vira entrada dupla ===');
  {
    const { api, chamadas } = fakeTm([{
      path: 'accounts/1/user_permissions/77', emailAddress: 'a@b.c',
      accountAccess: { permission: 'user' },
      containerAccess: [{ containerId: '999', permission: 'read' }],
    }]);
    await M.grantOwnerContainerAccess({ tagmanager: api, accountPath: 'accounts/1',
      containerId: '999', email: 'a@b.c', ritmo, push: () => {} });
    const ca = chamadas.update[0].containerAccess;
    check('uma entrada só para o container', ca.filter(c=>c.containerId==='999').length === 1);
    check('e promovida de read para publish', ca[0].permission === 'publish');
  }

  console.log('\n=== Já é admin da conta: nada a fazer ===');
  {
    const { api, chamadas } = fakeTm([{
      path: 'accounts/1/user_permissions/1', emailAddress: 'a@b.c',
      accountAccess: { permission: 'admin' }, containerAccess: [],
    }]);
    const r = await M.grantOwnerContainerAccess({ tagmanager: api, accountPath: 'accounts/1',
      containerId: '999', email: 'a@b.c', ritmo, push: () => {} });
    check('detecta admin e não mexe', r.estado === 'jaAdmin');
    check('nenhuma escrita gasta', chamadas.create.length === 0 && chamadas.update.length === 0);
  }

  console.log('\n=== Sem e-mail configurado ===');
  {
    const { api, chamadas } = fakeTm([]);
    const r = await M.grantOwnerContainerAccess({ tagmanager: api, accountPath: 'accounts/1',
      containerId: '999', email: '   ', ritmo, push: () => {} });
    check('não chama a API à toa', r.estado === 'semEmail' && chamadas.create.length === 0);
  }

  console.log(falhas ? `\n${falhas} falharam\n` : '\nTodas passaram\n');
  process.exitCode = falhas ? 1 : 0;
})();
