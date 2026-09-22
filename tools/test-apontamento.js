// Verificação de apontamento (DNS) e histórico de DNS (WhoisXML DNS Chronicle),
// com o DNS e o HTTPS simulados. Não consulta nada de verdade.
//
//     node tools/test-apontamento.js

const path = require('path');
const Module = require('module');
const fs = require('fs');

const handlers = {};
let respostaDns = {};        // host -> array de IPs, ou Error
let responder = () => ({ statusCode: 404, body: '{}' });
const chamadas = [];

class ResolverFake {
  constructor(opts) { this.opts = opts; }
  async resolve4(host) {
    const r = respostaDns[host];
    if (r === undefined) { const e = new Error('nxdomain'); e.code = 'ENOTFOUND'; throw e; }
    if (r instanceof Error) throw r;
    return r;
  }
}
const dnsStub = { promises: { Resolver: ResolverFake } };

const httpsStub = {
  request(options, cb) {
    const url = `https://${options.hostname}${options.path}`;
    let corpo = '';
    const req = {
      on() { return req; },
      write(c) { corpo += c; },
      end() {
        chamadas.push({ url, headers: options.headers, corpo: corpo ? JSON.parse(corpo) : null });
        const r = responder(url, chamadas[chamadas.length - 1].corpo);
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

const cofre = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('enc:' + s),
  decryptString: (b) => String(b).replace(/^enc:/, ''),
};

const DIR = '/tmp/hub-dns';
const electronStub = {
  app: { getPath: () => DIR, whenReady: () => ({ then: () => ({}) }), on() {} },
  BrowserWindow: Object.assign(function () {}, { getAllWindows: () => [] }),
  ipcMain: { handle(n, f) { handlers[n] = f; } },
  safeStorage: cofre, clipboard: { writeText() {} },
};
const googleFake = { auth: { GoogleAuth: function(){}, OAuth2: function(){} }, options(){} };

const orig = Module._load;
Module._load = (r, p, i) =>
  r === 'electron' ? electronStub
  : r === 'googleapis' ? { google: googleFake }
  : r === 'https' ? httpsStub
  : r === 'dns' ? dnsStub
  : orig(r, p, i);

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const mod = { exports: {} };
new Function('require','module','exports','__dirname','__filename',
  src + ';module.exports={classifyIps,groupForIp,resumirHistorico,HOSTING_GROUPS};')
  (require, mod, mod.exports, path.join(__dirname, '..'), path.join(__dirname, '..', 'main.js'));
const M = mod.exports;

let falhas = 0;
const check = (n, c, d = '') => { if (!c) falhas++; console.log(`${c ? '  ok  ' : ' FALHA'} ${n}${!c && d ? ' → ' + d : ''}`); };

fs.mkdirSync(DIR, { recursive: true });
try { fs.unlinkSync(path.join(DIR, 'dns-history-key.enc')); } catch (e) {}

const porDominio = (res) => Object.fromEntries(res.resultados.map((r) => [r.dominio, r]));

(async () => {
  console.log('\n=== Faixa de IP → grupo ===');
  check('149.18.103.x é M3', M.groupForIp('149.18.103.20')?.id === 'm3');
  check('169.57.169.x é Vesta', M.groupForIp('169.57.169.5')?.id === 'vesta');
  check('169.57.141.x é Vesta', M.groupForIp('169.57.141.99')?.id === 'vesta');
  check('8.8.8.8 não é nosso', M.groupForIp('8.8.8.8') === null);
  // O prefixo tem que terminar no ponto, senão 169.57.14.10 passaria por
  // 169.57.141.x — é a pegadinha clássica de comparar string de IP.
  check('169.57.14.10 NÃO é Vesta', M.groupForIp('169.57.14.10') === null, 'prefixo casou parcialmente');
  check('149.18.10.35 NÃO é M3', M.groupForIp('149.18.10.35') === null);
  check('1149.18.103.5 NÃO é M3', M.groupForIp('1149.18.103.5') === null);

  console.log('\n=== Vários registros A ===');
  check('todos na M3 → m3', M.classifyIps(['149.18.103.1', '149.18.103.2']).status === 'm3');
  check('M3 + terceiro → misto', M.classifyIps(['149.18.103.1', '8.8.8.8']).status === 'misto');
  check('M3 + Vesta → misto', M.classifyIps(['149.18.103.1', '169.57.169.1']).status === 'misto');
  check('só terceiros → outro', M.classifyIps(['8.8.8.8', '1.1.1.1']).status === 'outro');

  console.log('\n=== Consulta em lote ===');
  respostaDns = {
    'clientem3.com.br': ['149.18.103.30'],
    'clientevesta.com.br': ['169.57.141.12'],
    'outravesta.com.br': ['169.57.169.7'],
    'terceiro.com.br': ['203.0.113.9'],
    'misturado.com.br': ['149.18.103.4', '203.0.113.9'],
    'www.soweb.com.br': ['149.18.103.55'],
  };
  const timeout = new Error('query timed out'); timeout.code = 'ETIMEOUT';
  respostaDns['lento.com.br'] = timeout;

  const res = await handlers['dns:checkBatch'](null, {
    domains: ['clientem3.com.br', 'clientevesta.com.br', 'outravesta.com.br', 'terceiro.com.br',
              'misturado.com.br', 'soweb.com.br', 'sumiu.com.br', 'lento.com.br', 'CLIENTEM3.com.br'],
  });
  const r = porDominio(res);
  check('lote respondeu ok', res.ok === true, res.error);
  check('domínio repetido conta uma vez', res.resultados.length === 8, `veio ${res.resultados.length}`);
  check('M3 classificado', r['clientem3.com.br'].status === 'm3');
  check('Vesta 141 classificado', r['clientevesta.com.br'].status === 'vesta');
  check('Vesta 169 classificado', r['outravesta.com.br'].status === 'vesta');
  check('terceiro classificado', r['terceiro.com.br'].status === 'outro');
  check('misto classificado', r['misturado.com.br'].status === 'misto');
  check('apex sem A cai no www', r['soweb.com.br'].status === 'm3' && r['soweb.com.br'].host === 'www.soweb.com.br');
  check('domínio inexistente vira erro', r['sumiu.com.br'].status === 'erro');
  check('timeout não vira "não aponta"', r['lento.com.br'].status === 'erro', r['lento.com.br'].status);
  check('timeout guarda o motivo', /ETIMEOUT/.test(r['lento.com.br'].detail || ''), r['lento.com.br'].detail);
  check('IPs voltam para a tela', r['clientem3.com.br'].ips.join() === '149.18.103.30');

  console.log('\n=== Histórico: observações viram janelas ===');
  // A API devolve uma linha por data observada; o resumo tem que juntar datas
  // seguidas na mesma faixa, senão a tela não responde "quando saiu".
  const linhas = M.resumirHistorico([
    { date: '2020-01-01', ips: [{ ip: '169.57.169.3' }] },
    { date: '2021-06-02', ips: [{ ip: '169.57.169.3' }] },
    { date: '2022-05-10', ips: [{ ip: '149.18.103.7' }] },
    { date: '2023-08-01', ips: [{ ip: '149.18.103.7' }] },
    { date: '2025-01-31', ips: [{ ip: '149.18.103.7' }] },
    { date: '2025-02-01', ips: [{ ip: '203.0.113.9' }] },
    { date: '2019-01-01', ips: [] },
  ]);
  check('observação sem IP é descartada', linhas.length === 3, `veio ${linhas.length}`);
  check('mais recente primeiro', linhas[0].ips[0] === '203.0.113.9');
  check('datas seguidas viram uma janela só', linhas[1].first_seen === '2022-05-10' && linhas[1].last_seen === '2025-01-31',
    `${linhas[1].first_seen} → ${linhas[1].last_seen}`);
  check('janela anterior separada', linhas[2].first_seen === '2020-01-01' && linhas[2].last_seen === '2021-06-02');
  check('marca o que é nosso', linhas.filter((l) => l.nosso).length === 2);
  check('nomeia a faixa', linhas[1].grupos.join() === 'M3 Solutions', linhas[1].grupos.join());
  check('faixa do Vesta nomeada', linhas[2].grupos.join() === 'Vesta');
  // Registros fora de ordem não podem inverter a janela.
  const fora = M.resumirHistorico([
    { date: '2023-08-01', ips: [{ ip: '149.18.103.7' }] },
    { date: '2022-05-10', ips: [{ ip: '149.18.103.7' }] },
  ]);
  check('ordena antes de agrupar', fora[0].first_seen === '2022-05-10' && fora[0].last_seen === '2023-08-01');

  console.log('\n=== Histórico: chamada à API ===');
  let r2 = await handlers['dns:history'](null, { domains: ['terceiro.com.br'] });
  check('sem chave, recusa com instrução', r2.ok === false && /engrenagem/.test(r2.error), r2.error);

  await handlers['dnshist:setKey'](null, { key: 'CHAVE-SECRETA' });
  const st = await handlers['dnshist:status']();
  check('status diz que existe', st.configured === true);
  check('status NÃO devolve a chave', !JSON.stringify(st).includes('CHAVE-SECRETA'));
  check('chave gravada criptografada',
    !fs.readFileSync(path.join(DIR, 'dns-history-key.enc')).toString().startsWith('CHAVE-SECRETA'));

  responder = () => ({
    statusCode: 200,
    body: JSON.stringify({ result: { count: 3, records: [
      { date: '2022-05-10', ips: [{ ip: '149.18.103.7' }] },
      { date: '2025-01-31', ips: [{ ip: '149.18.103.7' }] },
      { date: '2025-02-01', ips: [{ ip: '203.0.113.9' }] },
    ] } }),
  });
  chamadas.length = 0;
  r2 = await handlers['dns:history'](null, { domains: ['terceiro.com.br'] });
  check('consulta ok', r2.ok === true, r2.error);
  check('endpoint certo', chamadas[0].url === 'https://dns-history.whoisxmlapi.com/api/v1', chamadas[0]?.url);
  check('POST com os campos da API',
    chamadas[0].corpo.searchType === 'forward' && chamadas[0].corpo.recordType === 'a' && chamadas[0].corpo.domainName === 'terceiro.com.br',
    JSON.stringify(chamadas[0].corpo));
  check('chave vai no corpo', chamadas[0].corpo.apiKey === 'CHAVE-SECRETA');
  check('sem "after", uma página só', chamadas.length === 1, `${chamadas.length} chamadas`);
  check('achou a janela na M3', r2.resultados[0].nossas.length === 1);
  check('com data de saída', r2.resultados[0].nossas[0].last_seen === '2025-01-31');
  check('conta os créditos gastos', r2.creditos === 1, String(r2.creditos));

  // Paginação: enquanto vier "after", segue — até o teto, e avisa que truncou.
  responder = () => ({
    statusCode: 200,
    body: JSON.stringify({ result: { count: 99, records: [
      { date: '2022-05-10', ips: [{ ip: '149.18.103.7' }] },
    ], after: { date: '2022-05-10', ip: '149.18.103.7' } } }),
  });
  chamadas.length = 0;
  r2 = await handlers['dns:history'](null, { domains: ['grande.com.br'] });
  check('para no teto de páginas', chamadas.length === 3, `${chamadas.length} chamadas`);
  check('manda o cursor de volta', chamadas[1].corpo.after?.date === '2022-05-10', JSON.stringify(chamadas[1].corpo.after));
  check('avisa que truncou', r2.resultados[0].parcial === true);

  responder = () => ({ statusCode: 403, body: '{"messages":"insufficient credits"}' });
  r2 = await handlers['dns:history'](null, { domains: ['a.com.br', 'b.com.br', 'c.com.br'] });
  check('crédito acabado interrompe o lote', r2.resultados.length === 1, `veio ${r2.resultados.length}`);
  check('e explica as três causas', /créditos/.test(r2.interrompido || ''), r2.interrompido);

  responder = () => ({ statusCode: 401, body: '{}' });
  r2 = await handlers['dns:history'](null, { domains: ['a.com.br', 'b.com.br'] });
  check('chave recusada interrompe o lote', r2.resultados.length === 1);
  check('e aponta as configurações', /configurações/.test(r2.interrompido || ''), r2.interrompido);

  Module._load = orig;
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
