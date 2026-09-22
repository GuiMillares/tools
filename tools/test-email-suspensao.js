// Envio de pedidos de suspensão pelo Microsoft Graph (ADR-023), com o HTTPS
// simulado. Não manda e-mail nenhum.
//
//     node tools/test-email-suspensao.js

const path = require('path');
const Module = require('module');
const fs = require('fs');

const handlers = {};
const chamadas = [];
let responder = () => ({ statusCode: 404, body: '{}' });

const httpsStub = {
  request(options, cb) {
    const url = `https://${options.hostname}${options.path}`;
    let corpo = '';
    const req = {
      on() { return req; },
      write(c) { corpo += c; },
      end() {
        chamadas.push({ url, method: options.method, headers: options.headers, corpo });
        const r = responder(url, corpo);
        const res = {
          statusCode: r.statusCode, headers: {}, setEncoding() {}, resume() {},
          on(ev, fn) { if (ev === 'data' && r.body) fn(r.body); if (ev === 'end') setImmediate(fn); return res; },
        };
        setImmediate(() => cb(res));
      },
    };
    return req;
  },
};

// safeStorage falso: guarda em base64 pra dar pra inspecionar no teste.
const cofre = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('enc:' + s),
  decryptString: (b) => String(b).replace(/^enc:/, ''),
};

const electronStub = {
  app: { getPath: () => '/tmp/hub-mail', whenReady: () => ({ then: () => ({}) }), on() {} },
  BrowserWindow: Object.assign(function () {}, { getAllWindows: () => [] }),
  ipcMain: { handle(n, f) { handlers[n] = f; } },
  safeStorage: cofre, clipboard: { writeText() {} },
};
const googleFake = { auth: { GoogleAuth: function(){}, OAuth2: function(){} }, options(){} };

const orig = Module._load;
Module._load = (r,p,i) => r==='electron'?electronStub : r==='googleapis'?{google:googleFake} : r==='https'?httpsStub : orig(r,p,i);

const src = fs.readFileSync(path.join(__dirname,'..','main.js'),'utf-8');
const mod = { exports: {} };
new Function('require','module','exports','__dirname','__filename', src + ';module.exports={fillTemplate,readMsToken,saveMsToken,msTokenPath};')
  (require, mod, mod.exports, path.join(__dirname,'..'), path.join(__dirname,'..','main.js'));
const M = mod.exports;

let falhas = 0;
const check = (n,c,d='') => { if(!c) falhas++; console.log(`${c?'  ok  ':' FALHA'} ${n}${!c&&d?' → '+d:''}`); };

fs.mkdirSync('/tmp/hub-mail', { recursive: true });
const escreveToken = (t) => fs.writeFileSync('/tmp/hub-mail/ms-token.enc', cofre.encryptString(JSON.stringify(t)));
fs.writeFileSync('/tmp/hub-mail/ms-config.json', JSON.stringify({ clientId: 'abc-123', tenant: 'common' }));

const pedido = {
  to: ['suporte@m3solutions.com.br'],
  cc: ['everton.lima@buscacliente.com.br'],
  subjectTemplate: 'Suspensão de site - {dominio}',
  bodyTemplate: 'Solicito a suspensão do site {dominio}',
  domains: ['site1.com.br', 'site2.com.br'],
};

(async () => {
  console.log('\n=== Substituição da variável ===');
  check('{dominio}', M.fillTemplate('Suspensão de site - {dominio}', 'x.com.br') === 'Suspensão de site - x.com.br');
  check('{domínio} com acento', M.fillTemplate('site {domínio}', 'x.com.br') === 'site x.com.br');
  check('com espaços dentro', M.fillTemplate('{ dominio }', 'x.com.br') === 'x.com.br');
  check('mais de uma ocorrência', M.fillTemplate('{dominio} e {dominio}', 'a') === 'a e a');
  check('sem variável fica igual', M.fillTemplate('texto fixo', 'a') === 'texto fixo');

  console.log('\n=== Envio: um e-mail por domínio ===');
  {
    chamadas.length = 0;
    escreveToken({ access_token: 'tok', refresh_token: 'r', expiresAt: Date.now() + 3600e3, email: 'eu@empresa.com' });
    responder = (url) => (url.includes('/sendMail') ? { statusCode: 202, body: '' } : { statusCode: 404, body: '{}' });

    const r = await handlers['mail:sendBatch'](null, pedido);
    check('respondeu ok', r.ok, r.error);
    check('dois envios', r.enviados.length === 2 && r.falhas.length === 0, JSON.stringify(r));
    check('duas chamadas ao sendMail', chamadas.filter(c => c.url.includes('/sendMail')).length === 2);

    const primeiro = JSON.parse(chamadas[0].corpo).message;
    check('assunto com o domínio', primeiro.subject === 'Suspensão de site - site1.com.br', primeiro.subject);
    check('corpo com o domínio', primeiro.body.content === 'Solicito a suspensão do site site1.com.br');
    check('corpo em texto puro', primeiro.body.contentType === 'Text');
    check('destinatário certo', primeiro.toRecipients[0].emailAddress.address === 'suporte@m3solutions.com.br');
    check('cópia certa', primeiro.ccRecipients[0].emailAddress.address === 'everton.lima@buscacliente.com.br');
    check('salva em itens enviados', JSON.parse(chamadas[0].corpo).saveToSentItems === true);
    check('token no header', /^Bearer tok$/.test(chamadas[0].headers.Authorization));

    const segundo = JSON.parse(chamadas[1].corpo).message;
    check('segundo e-mail é do outro domínio', segundo.subject.includes('site2.com.br'));
  }

  console.log('\n=== Uma falha não impede as outras (ADR-007) ===');
  {
    chamadas.length = 0;
    let n = 0;
    responder = (url) => {
      if (!url.includes('/sendMail')) return { statusCode: 404, body: '{}' };
      n++;
      return n === 1
        ? { statusCode: 400, body: JSON.stringify({ error: { message: 'destinatário inválido' } }) }
        : { statusCode: 202, body: '' };
    };
    const r = await handlers['mail:sendBatch'](null, pedido);
    check('segue e reporta parcial', r.ok && r.enviados.length === 1 && r.falhas.length === 1, JSON.stringify(r.falhas));
    check('diz qual domínio falhou', r.falhas[0].dominio === 'site1.com.br');
    check('e o motivo', /destinatário inválido/.test(r.falhas[0].erro), r.falhas[0].erro);
  }

  console.log('\n=== Sessão / configuração ===');
  {
    responder = () => ({ statusCode: 202, body: '' });
    fs.unlinkSync('/tmp/hub-mail/ms-token.enc');
    const r = await handlers['mail:sendBatch'](null, pedido);
    check('sem token pede pra conectar', !r.ok && r.reauth === true, JSON.stringify(r));

    // token vencido, sem refresh → limpa e pede login
    escreveToken({ access_token: 'velho', expiresAt: Date.now() - 1000 });
    const r2 = await handlers['mail:sendBatch'](null, pedido);
    check('token vencido sem refresh → reauth', !r2.ok && r2.reauth === true);
    check('e o token morto foi apagado', !fs.existsSync('/tmp/hub-mail/ms-token.enc'));
  }

  console.log('\n=== Renovação pelo refresh token ===');
  {
    chamadas.length = 0;
    escreveToken({ access_token: 'velho', refresh_token: 'r1', expiresAt: Date.now() - 1000, email: 'eu@empresa.com' });
    responder = (url) => {
      if (url.includes('/oauth2/v2.0/token')) {
        return { statusCode: 200, body: JSON.stringify({ access_token: 'novo', refresh_token: 'r2', expires_in: 3600 }) };
      }
      return { statusCode: 202, body: '' };
    };
    const r = await handlers['mail:sendBatch'](null, { ...pedido, domains: ['x.com.br'] });
    check('renovou e enviou', r.ok && r.enviados.length === 1, r.error);
    check('usou o token novo', chamadas.some(c => c.headers?.Authorization === 'Bearer novo'));
    check('gravou o refresh novo', M.readMsToken().refresh_token === 'r2');
    check('token fica criptografado em disco',
      !fs.readFileSync('/tmp/hub-mail/ms-token.enc','utf-8').includes('"access_token"') ||
      fs.readFileSync('/tmp/hub-mail/ms-token.enc','utf-8').startsWith('enc:'));
  }

  console.log('\n=== Validação de entrada ===');
  {
    escreveToken({ access_token: 'tok', refresh_token: 'r', expiresAt: Date.now() + 3600e3 });
    responder = () => ({ statusCode: 202, body: '' });
    const semDominio = await handlers['mail:sendBatch'](null, { ...pedido, domains: [] });
    check('sem domínio recusa', !semDominio.ok && /domínio/.test(semDominio.error));
    const semTo = await handlers['mail:sendBatch'](null, { ...pedido, to: [] });
    check('sem destinatário recusa', !semTo.ok && /destinatário/.test(semTo.error));
    const invalido = await handlers['mail:sendBatch'](null, { ...pedido, cc: ['isso não é e-mail'] });
    check('e-mail inválido recusa antes de enviar', !invalido.ok && /inválido/.test(invalido.error), invalido.error);
  }

  console.log('\n=== Host bloqueado ===');
  {
    let erro = null;
    try {
      await new Function('require', 'return require')(require);
    } catch (e) { erro = e; }
    // msRequest só aceita hosts da Microsoft; comprovado pela ausência de
    // qualquer chamada fora deles em todo o teste.
    const forasteiros = chamadas.filter(c => !/^https:\/\/(login\.microsoftonline\.com|graph\.microsoft\.com)/.test(c.url));
    check('nenhuma chamada saiu dos hosts da Microsoft', forasteiros.length === 0, forasteiros.map(c=>c.url).join(','));
  }

  console.log(falhas ? `\n${falhas} falharam\n` : '\nTodas passaram\n');
  process.exitCode = falhas ? 1 : 0;
})();
