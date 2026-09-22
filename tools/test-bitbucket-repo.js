// Descoberta de repositório no Bitbucket (ADR-021), com o HTTPS simulado.
//
//     node tools/test-bitbucket-repo.js
//
// O caso que quebrou em produção: sem workspace configurada, a busca global
// GET /2.0/repositories?q=… responde "CHANGE-2770 - Functionality has been
// deprecated". Aqui se verifica que esse endpoint não é mais chamado e que a
// descoberta por workspace encontra o mesmo repositório.

const path = require('path');
const Module = require('module');
const fs = require('fs');

const handlers = {};
const chamadas = [];
let responder = () => ({ statusCode: 404, body: '{}' });

// Dublê do módulo https: registra cada URL pedida e responde pelo `responder`.
const httpsStub = {
  request(options, cb) {
    const url = `https://${options.hostname}${options.path}`;
    chamadas.push({ url, method: options.method });
    const r = responder(url, options.method);
    const res = {
      statusCode: r.statusCode,
      headers: r.headers || {},
      setEncoding() {},
      resume() {},
      on(ev, fn) {
        if (ev === 'data' && r.body) fn(r.body);
        if (ev === 'end') setImmediate(fn);
        return res;
      },
    };
    setImmediate(() => cb(res));
    return { on() { return this; }, write() {}, end() {} };
  },
};

const electronStub = {
  app: { getPath: () => '/tmp/hub-test', whenReady: () => ({ then: () => ({}) }), on() {} },
  BrowserWindow: Object.assign(function () {}, { getAllWindows: () => [] }),
  ipcMain: { handle(n, f) { handlers[n] = f; } },
  safeStorage: { isEncryptionAvailable: () => false }, clipboard: { writeText() {} },
};
const googleFake = { auth: { GoogleAuth: function(){}, OAuth2: function(){} }, options(){} };

const orig = Module._load;
Module._load = (r, p, i) =>
  r === 'electron' ? electronStub : r === 'googleapis' ? { google: googleFake } : r === 'https' ? httpsStub : orig(r, p, i);

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const mod = { exports: {} };
new Function('require','module','exports','__dirname','__filename',
  src + ';module.exports={resolveRepo,listBitbucketWorkspaces};')
  (require, mod, mod.exports, path.join(__dirname,'..'), path.join(__dirname,'..','main.js'));
const M = mod.exports;

let falhas = 0;
const check = (n,c,d='') => { if(!c) falhas++; console.log(`${c?'  ok  ':' FALHA'} ${n}${!c&&d?' → '+d:''}`); };
const creds = { email: 'a@b.c', token: 't' };
const j = (o) => ({ statusCode: 200, body: JSON.stringify(o) });

(async () => {
  console.log('\n=== Sem workspace: descobre pelas workspaces do usuário ===');
  {
    chamadas.length = 0;
    responder = (url) => {
      if (url.includes('/2.0/workspaces')) return j({ values: [{ slug: 'outra' }, { slug: 'idealtrends' }] });
      if (url.endsWith('/repositories/idealtrends/qualisoldamg.com.br')) return j({ mainbranch: { name: 'master' } });
      return { statusCode: 404, body: '{}' };
    };
    const r = await M.resolveRepo({ repo: 'qualisoldamg.com.br', workspace: '', creds });
    check('achou o repositório', r.workspace === 'idealtrends' && r.repo === 'qualisoldamg.com.br');
    check('trouxe a branch principal', r.mainBranch === 'master');
    check('marca que foi descoberta procurando', r.descoberta === 'idealtrends');
    check('NÃO chamou o endpoint descontinuado',
      !chamadas.some(c => /\/2\.0\/repositories\?/.test(c.url)),
      chamadas.map(c=>c.url).join(' | '));
    check('listou workspaces primeiro', /\/2\.0\/workspaces/.test(chamadas[0].url), chamadas[0].url);
    check('tentou a workspace errada antes e seguiu',
      chamadas.some(c => c.url.endsWith('/repositories/outra/qualisoldamg.com.br')));
  }

  console.log('\n=== Com workspace configurada: vai direto ===');
  {
    chamadas.length = 0;
    responder = (url) =>
      url.endsWith('/repositories/idealtrends/site.com.br') ? j({ mainbranch: { name: 'main' } }) : { statusCode: 404, body: '{}' };
    const r = await M.resolveRepo({ repo: 'site.com.br', workspace: 'idealtrends', creds });
    check('achou sem procurar', r.workspace === 'idealtrends' && r.mainBranch === 'main');
    check('uma chamada só', chamadas.length === 1, String(chamadas.length));
    check('não listou workspaces', !chamadas.some(c => /workspaces/.test(c.url)));
    check('sem marca de descoberta', r.descoberta === undefined);
  }

  console.log('\n=== Repositório inexistente ===');
  {
    responder = (url) => (url.includes('/2.0/workspaces') ? j({ values: [{ slug: 'idealtrends' }] }) : { statusCode: 404, body: '{}' });
    let erro = null;
    try { await M.resolveRepo({ repo: 'naoexiste.com.br', workspace: '', creds }); } catch (e) { erro = e; }
    check('falha com mensagem clara', !!erro && /Nenhum repositório com o slug/.test(erro.message), erro?.message);
    check('e lista onde procurou', /idealtrends/.test(erro.message), erro?.message);
  }

  console.log('\n=== Sem permissão de listar workspaces ===');
  {
    responder = () => ({ statusCode: 403, body: JSON.stringify({ error: { message: 'sem escopo read:workspace' } }) });
    let erro = null;
    try { await M.resolveRepo({ repo: 'x.com.br', workspace: '', creds }); } catch (e) { erro = e; }
    check('erro menciona o que fazer', !!erro && /Workspace do Bitbucket|listar workspaces/.test(erro.message), erro?.message);
  }

  console.log('\n=== Paginação das workspaces ===');
  {
    let pagina = 0;
    responder = (url) => {
      if (url.includes('/2.0/workspaces')) {
        pagina++;
        return pagina === 1
          ? j({ values: [{ slug: 'w1' }], next: 'https://api.bitbucket.org/2.0/workspaces?page=2' })
          : j({ values: [{ slug: 'w2' }] });
      }
      return { statusCode: 404, body: '{}' };
    };
    const ws = await M.listBitbucketWorkspaces(creds);
    check('junta as páginas', JSON.stringify(ws) === JSON.stringify(['w1','w2']), JSON.stringify(ws));
  }

  console.log(falhas ? `\n${falhas} falharam\n` : '\nTodas passaram\n');
  process.exitCode = falhas ? 1 : 0;
})();
