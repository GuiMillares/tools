// Publicação MPI+ de ponta a ponta (ADR-058): Cloudflare simulada, segredos
// por empresa e guardas do painel. Nada de rede.
//
//     node tools/test-publicacao.js

process.env.HUB_GTM_INTERVAL_MS = '1';
const path = require('path');
const Module = require('module');
const fs = require('fs');

const handlers = {};
let janelas = 0;
const DIR = '/tmp/hub-pub';
const cofre = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('enc:' + s), decryptString: (b) => String(b).replace(/^enc:/, '') };
// Uma janela de mentira para o cache do painel (ADR-072): carrega na hora,
// nunca pede login, e conta quantas vezes foi criada e destruída.
const janelasFake = [];
function JanelaFake() {
  janelas++;
  const listeners = {};
  const win = {
    destruida: false,
    webContents: {
      on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      removeListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
      setWindowOpenHandler() {},
      async executeJavaScript(script) {
        if (/input\[type=password\]/.test(script)) return { login: false };
        return { ok: true, estado: { siteStatus: 'approved', concluido: false } };
      },
    },
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    loadURL() { setImmediate(() => (listeners['did-finish-load'] || []).forEach((f) => f())); },
    isDestroyed() { return win.destruida; },
    destroy() { win.destruida = true; (listeners.closed || []).forEach((f) => f()); },
  };
  janelasFake.push(win);
  return win;
}
let janelaModo = 'proibida'; // 'proibida' (guardas) ou 'fake' (cache)
const dialogStub = { proximoCaminho: null, async showSaveDialog() { return dialogStub.proximoCaminho ? { canceled: false, filePath: dialogStub.proximoCaminho } : { canceled: true }; } };
const electronStub = {
  app: { getPath: () => DIR, whenReady: () => ({ then: () => ({}) }), on() {} },
  BrowserWindow: Object.assign(function () { if (janelaModo === 'fake') return new JanelaFake(); janelas++; throw new Error('não deveria abrir janela'); }, { getAllWindows: () => [] }),
  dialog: dialogStub,
  ipcMain: { handle(n, f) { handlers[n] = f; } },
  safeStorage: cofre,
  clipboard: { writeText() {} },
  session: { fromPartition: () => ({ clearStorageData: async () => {} }) },
};

// Cloudflare de mentira: guarda zonas e registros em memória.
const cf = { zonas: [], registros: {}, chamadas: [] };
let proximoId = 1;
const cfResponder = (method, urlPath, body) => {
  cf.chamadas.push(`${method} ${urlPath.replace(/\?.*$/, '')}`);
  const u = new URL('https://api.cloudflare.com' + urlPath);
  const p = u.pathname.replace('/client/v4', '');
  if (p === '/user/tokens/verify') return { status: 200, json: { success: true, result: { status: 'active' } } };
  if (p === '/accounts') return { status: 200, json: { success: true, result: [{ id: 'acc1', name: 'Busca Cliente' }] } };
  if (p === '/zones' && method === 'GET') {
    const nome = u.searchParams.get('name');
    return { status: 200, json: { success: true, result: cf.zonas.filter((z) => z.name === nome) } };
  }
  if (p === '/zones' && method === 'POST') {
    const z = { id: 'z' + proximoId++, name: body.name, status: 'pending', name_servers: ['ana.ns.cloudflare.com', 'bob.ns.cloudflare.com'], account: body.account };
    cf.zonas.push(z); cf.registros[z.id] = [];
    return { status: 200, json: { success: true, result: z } };
  }
  let m;
  if ((m = p.match(/^\/zones\/([^/]+)\/dns_records$/))) {
    const zid = m[1];
    if (method === 'GET') return { status: 200, json: { success: true, result: cf.registros[zid] || [], result_info: { total_pages: 1 } } };
    if (method === 'POST') { const r = { id: 'r' + proximoId++, ...body }; cf.registros[zid].push(r); return { status: 200, json: { success: true, result: r } }; }
  }
  if ((m = p.match(/^\/zones\/([^/]+)\/dns_records\/scan$/)) && method === 'POST') {
    // O scan da Cloudflare: grava na zona o que "achou" (o que o teste
    // deixou em cf.scanDevolve), inclusive com proxy ligado, como ela faz.
    const zid = m[1];
    for (const r of cf.scanDevolve || []) cf.registros[zid].push({ id: 'r' + proximoId++, ...r });
    return { status: 200, json: { success: true, result: { recs_added: (cf.scanDevolve || []).length } } };
  }
  if ((m = p.match(/^\/zones\/([^/]+)\/dns_records\/([^/]+)$/)) && method === 'PUT') {
    const lista = cf.registros[m[1]]; const i = lista.findIndex((r) => r.id === m[2]);
    lista[i] = { id: m[2], ...body }; return { status: 200, json: { success: true, result: lista[i] } };
  }
  if ((m = p.match(/^\/zones\/([^/]+)\/dns_records\/([^/]+)$/)) && method === 'DELETE') {
    const lista = cf.registros[m[1]]; const i = lista.findIndex((r) => r.id === m[2]);
    if (i < 0) return { status: 404, json: { success: false, errors: [{ code: 81044, message: 'Record does not exist.' }] } };
    lista.splice(i, 1); return { status: 200, json: { success: true, result: { id: m[2] } } };
  }
  if ((m = p.match(/^\/zones\/([^/]+)$/)) && method === 'GET') {
    const z = cf.zonas.find((x) => x.id === m[1]); return { status: 200, json: { success: true, result: z } };
  }
  return { status: 404, json: { success: false, errors: [{ code: 7003, message: 'rota desconhecida no fake: ' + method + ' ' + p }] } };
};
const httpsStub = {
  request(options, cb) {
    let corpo = '';
    const req = {
      on() { return req; }, setTimeout() { return req; }, destroy() {},
      write(c) { corpo += c; },
      end() {
        const r = cfResponder(options.method, options.path, corpo ? JSON.parse(corpo) : null);
        const txt = JSON.stringify(r.json);
        const res = { statusCode: r.status, headers: {}, setEncoding() {}, resume() {}, on(ev, fn) { if (ev === 'data') fn(txt); if (ev === 'end') setImmediate(fn); return res; } };
        setImmediate(() => cb(res));
      },
    };
    return req;
  },
};

// DNS de mentira: os autoritativos "respondem" o que o teste deixou em dnsFake.
const dnsFake = { ns: ['ns1.antigo.com.br', 'ns2.antigo.com.br'], respostas: {} };
const semDados = () => { const e = new Error('ENODATA'); e.code = 'ENODATA'; return e; };
const resolverFake = {
  setServers() {},
  async resolveCname(n) { const v = dnsFake.respostas[`CNAME ${n}`]; if (!v) throw semDados(); return v; },
  async resolve4(n) { const v = dnsFake.respostas[`A ${n}`]; if (!v) throw semDados(); return v; },
  async resolve6(n) { const v = dnsFake.respostas[`AAAA ${n}`]; if (!v) throw semDados(); return v; },
  async resolveMx(n) { const v = dnsFake.respostas[`MX ${n}`]; if (!v) throw semDados(); return v; },
  async resolveTxt(n) { const v = dnsFake.respostas[`TXT ${n}`]; if (!v) throw semDados(); return v; },
  async resolveCaa() { throw semDados(); },
  async resolveSrv() { throw semDados(); },
};
const dnsStub = { promises: { Resolver: function () { return resolverFake; }, async resolveNs() { return dnsFake.ns; }, async resolve4() { return ['9.9.9.9']; } } };

const orig = Module._load;
Module._load = (r, p, i) =>
  r === 'electron' ? electronStub
  : r === 'googleapis' ? { google: { auth: { GoogleAuth: function () {}, OAuth2: function () {} }, options() {} } }
  : r === 'https' ? httpsStub
  : r === 'dns' ? dnsStub
  : orig(r, p, i);

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const mod = { exports: {} };
new Function('require','module','exports','__dirname','__filename', src + ';module.exports={readEmpresaSegredos,readPublicacaoConfig,abrirPainelLogado,painelSoltarJanela,painelDescartarJanela,segundosDeTransicao};')
  (require, mod, mod.exports, path.join(__dirname, '..'), path.join(__dirname, '..', 'main.js'));
const M = mod.exports;

let falhas = 0;
const check = (n, c, d = '') => { if (!c) falhas++; console.log(`${c ? '  ok  ' : ' FALHA'} ${n}${!c && d ? ' → ' + d : ''}`); };
const texto = (r) => (r.log || []).map((l) => l.message).join(' | ');

(async () => {
  console.log('\n=== Segredos por empresa ===');
  let r = await handlers['publicacao:setConfig'](null, { config: { hestiaIpPublico: '149.18.102.39', hestiaServidorPadrao: '11' }, empresas: { bc: { cloudflareToken: 'tok-bc', registrobrUsuario: 'ABC123', registrobrSenha: 's3nha' }, mpisolutions: { cloudflareToken: 'tok-mpi' } } });
  check('grava', r.ok === true, JSON.stringify(r));
  check('criptografado no disco', fs.readFileSync(path.join(DIR, 'empresa-bc.enc')).toString().startsWith('enc:'));
  check('lê de volta', M.readEmpresaSegredos('bc').cloudflareToken === 'tok-bc' && M.readEmpresaSegredos('mpisolutions').cloudflareToken === 'tok-mpi');
  r = await handlers['publicacao:setConfig'](null, { empresas: { bc: { cloudflareToken: '', registrobrSenha: '' } } });
  check('campo em branco não apaga o que está salvo', M.readEmpresaSegredos('bc').cloudflareToken === 'tok-bc' && M.readEmpresaSegredos('bc').registrobrSenha === 's3nha');
  const st = await handlers['publicacao:getConfig']();
  check('status diz que existe sem devolver o valor', st.empresas.bc.cloudflareToken === true && !JSON.stringify(st).includes('tok-bc') && !JSON.stringify(st).includes('s3nha'), JSON.stringify(st));
  check('config padrão do Hestia', st.config.hestiaIpPublico === '149.18.102.39' && st.config.hestiaServidorPadrao === '11');
  r = await handlers['publicacao:setConfig'](null, { empresas: { xpto: { cloudflareToken: 'a' } } });
  check('empresa desconhecida é ignorada', !fs.existsSync(path.join(DIR, 'empresa-xpto.enc')));

  console.log('\n=== Cloudflare: zona nova ===');
  const registros = [
    { type: 'A', name: 'cliente.com.br', content: '149.18.102.39', ttl: 1, proxied: false },
    { type: 'CNAME', name: 'www.cliente.com.br', content: 'cliente.com.br', ttl: 1, proxied: false },
    { type: 'A', name: 'webmail.cliente.com.br', content: '200.1.1.1', ttl: 1, proxied: false },
    { type: 'MX', name: 'cliente.com.br', content: 'mail.cliente.com.br', priority: 10, ttl: 1 },
    { type: 'A', name: 'mail.cliente.com.br', content: '200.1.1.1', ttl: 1, proxied: false },
    { type: 'TXT', name: 'cliente.com.br', content: 'v=spf1 a mx ~all', ttl: 1 },
  ];
  r = await handlers['cloudflare:aplicar'](null, { empresa: 'bc', dominio: 'cliente.com.br', registros });
  check('aplica', r.ok === true, r.error || texto(r));
  check('criou a zona', r.criada === true && cf.zonas.length === 1);
  check('na conta que o token enxerga', cf.zonas[0].account?.id === 'acc1');
  check('devolve os nameservers', r.nameservers.join() === 'ana.ns.cloudflare.com,bob.ns.cloudflare.com', JSON.stringify(r.nameservers));
  check('todos os registros entraram', cf.registros[cf.zonas[0].id].length === 6 && r.faltando === 0);
  check('nada com proxy', cf.registros[cf.zonas[0].id].every((x) => !x.proxied));
  check('MX com prioridade', cf.registros[cf.zonas[0].id].find((x) => x.type === 'MX')?.priority === 10);
  check('e conferiu depois de escrever', /Conferido: os 6 registros/.test(texto(r)), texto(r).slice(-200));

  console.log('\n=== Cloudflare: zona que já existe ===');
  cf.chamadas.length = 0;
  const mudados = registros.map((x) => (x.type === 'A' && x.name === 'cliente.com.br' ? { ...x, content: '149.18.102.40' } : x));
  r = await handlers['cloudflare:aplicar'](null, { empresa: 'bc', dominio: 'cliente.com.br', registros: mudados });
  check('reaproveita', r.ok === true && r.criada === false, r.error);
  check('não criou zona nova', cf.zonas.length === 1 && !cf.chamadas.includes('POST /client/v4/zones'));
  const raiz = cf.registros[cf.zonas[0].id].filter((x) => x.type === 'A' && x.name === 'cliente.com.br');
  check('A da raiz foi atualizado, não duplicado', raiz.length === 1 && raiz[0].content === '149.18.102.40', JSON.stringify(raiz));
  check('os iguais ficaram como estavam', cf.registros[cf.zonas[0].id].length === 6);

  console.log('\n=== Cloudflare: sem token ===');
  r = await handlers['cloudflare:aplicar'](null, { empresa: 'mpisolutions', dominio: 'x.com.br', registros });
  // MPI Solutions TEM token neste teste; troque para uma empresa sem nada:
  fs.unlinkSync(path.join(DIR, 'empresa-mpisolutions.enc'));
  r = await handlers['cloudflare:aplicar'](null, { empresa: 'mpisolutions', dominio: 'x.com.br', registros });
  check('sem token, recusa e diz de quem', r.ok === false && /MPI Solutions/.test(r.error) && /token da Cloudflare/.test(r.error), r.error);

  console.log('\n=== Cloudflare: zona montada pelo scan + fotografia (ADR-071) ===');
  {
    // A zona antiga do cliente, como o scan da Cloudflare a copiaria: raiz
    // com proxy ligado, AAAA na raiz, MX para a própria raiz, um erp que a
    // nossa lista de hosts não adivinharia.
    cf.scanDevolve = [
      { type: 'A', name: 'novo.com.br', content: '200.9.9.9', proxied: true },
      { type: 'AAAA', name: 'novo.com.br', content: '2001:db8::9' },
      { type: 'CNAME', name: 'www.novo.com.br', content: 'novo.com.br', proxied: true },
      { type: 'MX', name: 'novo.com.br', content: 'novo.com.br', priority: 10 },
      { type: 'A', name: 'erp.novo.com.br', content: '10.1.1.1' },
    ];
    // E o que só os autoritativos mostram: DKIM.
    dnsFake.respostas = {
      'A novo.com.br': ['200.9.9.9'],
      'MX novo.com.br': [{ exchange: 'novo.com.br', priority: 10 }],
      'TXT default._domainkey.novo.com.br': [['v=DKIM1; p=abc']],
    };
    cf.chamadas.length = 0;
    r = await handlers['cloudflare:montarZona'](null, { empresa: 'bc', dominio: 'novo.com.br', hostsExtras: ['correio'] });
    check('monta', r.ok === true, r.error || texto(r));
    check('criou a zona e rodou o scan', r.criada === true && cf.chamadas.some((c) => /dns_records\/scan$/.test(c)));
    check('scan contou 5', r.escaneados === 5, String(r.escaneados));
    check('devolve os nameservers já na montagem', r.nameservers.length === 2);
    const z = r.zona;
    check('raiz vai para o IP novo', z.registros.some((x) => x.type === 'A' && x.name === 'novo.com.br' && x.content === '149.18.102.39'));
    check('erp que só o scan viu é replicado', z.registros.some((x) => x.name === 'erp.novo.com.br' && x.content === '10.1.1.1'));
    check('DKIM que só a fotografia viu entra', z.registros.some((x) => x.type === 'TXT' && x.name === 'default._domainkey.novo.com.br'));
    check('MX vira mail.<dominio> e mail A aponta para o IP antigo', z.registros.some((x) => x.type === 'MX' && x.content === 'mail.novo.com.br') && z.registros.some((x) => x.type === 'A' && x.name === 'mail.novo.com.br' && x.content === '200.9.9.9'));
    check('AAAA e MX antigos estão para sair', z.remover.some((x) => x.type === 'AAAA') && z.remover.some((x) => x.type === 'MX'));
    check('plano: muda raiz e desliga proxy do www, remove 2', r.plano.atualizar.length === 2 && r.plano.remover.length === 2, JSON.stringify({ a: r.plano.atualizar.map((x) => x.name), rm: r.plano.remover.map((x) => x.type) }));
    check('nada escrito além do scan: só GET, POST zona, POST scan', !cf.chamadas.some((c) => /^(PUT|DELETE)/.test(c)) && cf.chamadas.filter((c) => c.startsWith('POST')).length === 2, cf.chamadas.join(' '));

    // Aplica o que a montagem propôs.
    cf.chamadas.length = 0;
    const ap = await handlers['cloudflare:aplicar'](null, { empresa: 'bc', dominio: 'novo.com.br', registros: z.registros, remover: z.remover });
    check('aplica sem faltar nada', ap.ok === true && ap.faltando === 0, ap.error || texto(ap));
    const zid = cf.zonas.find((x) => x.name === 'novo.com.br').id;
    const depois = cf.registros[zid];
    check('AAAA da raiz saiu', !depois.some((x) => x.type === 'AAAA'));
    check('MX para a raiz saiu, MX para mail ficou', depois.filter((x) => x.type === 'MX').length === 1 && depois.find((x) => x.type === 'MX').content === 'mail.novo.com.br');
    check('www sem proxy', depois.find((x) => x.type === 'CNAME' && x.name === 'www.novo.com.br').proxied === false);
    check('raiz no IP novo, sem proxy', depois.find((x) => x.type === 'A' && x.name === 'novo.com.br').content === '149.18.102.39' && depois.find((x) => x.type === 'A' && x.name === 'novo.com.br').proxied === false);
    check('erp intocado', depois.some((x) => x.name === 'erp.novo.com.br' && x.content === '10.1.1.1'));
    // Ordem das remoções (ADR-085): o AAAA da raiz disputa o nome com o A novo,
    // então sai antes dos PUT/POST; o MX antigo só sai depois de o MX novo
    // entrar, para o e-mail nunca ficar sem MX.
    const idxDeleteMx = cf.chamadas.map((c, i) => [c, i]).filter(([c]) => c.startsWith('DELETE')).map(([, i]) => i).pop();
    check('o último DELETE (MX antigo) veio depois dos POST', idxDeleteMx > cf.chamadas.findIndex((c) => /^POST .*dns_records$/.test(c)), cf.chamadas.join(' '));

    // Segunda montagem na mesma zona: não roda o scan de novo, não propõe nada.
    cf.chamadas.length = 0;
    const r2 = await handlers['cloudflare:montarZona'](null, { empresa: 'bc', dominio: 'novo.com.br', hostsExtras: [] });
    check('zona reaproveitada, sem scan', r2.ok && r2.criada === false && !cf.chamadas.some((c) => /scan$/.test(c)));
    check('e sem nada a mudar', r2.plano.atualizar.length === 0 && r2.plano.criar.length === 0 && r2.plano.remover.length === 0, JSON.stringify(r2.plano));
    cf.scanDevolve = [];
    dnsFake.respostas = {};
  }

  console.log('\n=== Cloudflare: aplicar troca de tipo CNAME -> A (ADR-076) ===');
  {
    cf.scanDevolve = [
      { type: 'A', name: 'dclima.com.br', content: '151.106.100.16', proxied: true },
      { type: 'CNAME', name: 'ftp.dclima.com.br', content: 'dclima.com.br' },
      { type: 'CNAME', name: 'mail.dclima.com.br', content: 'dclima.com.br' },
      { type: 'MX', name: 'dclima.com.br', content: 'dclima.com.br', priority: 0 },
    ];
    dnsFake.respostas = { 'A dclima.com.br': ['151.106.100.16'] };
    r = await handlers['cloudflare:montarZona'](null, { empresa: 'bc', dominio: 'dclima.com.br', hostsExtras: [] });
    check('monta', r.ok === true, r.error || texto(r));
    check('plano não tem sobras nem cria A ao lado do CNAME', r.plano.sobras.length === 0 && !r.plano.criar.some((x) => /^(ftp|mail)\./.test(x.name)), JSON.stringify(r.plano));
    const ap = await handlers['cloudflare:aplicar'](null, { empresa: 'bc', dominio: 'dclima.com.br', registros: r.zona.registros, remover: r.zona.remover });
    check('aplica sem faltar nada', ap.ok === true && ap.faltando === 0 && ap.falhas.length === 0, ap.error || texto(ap));
    const zid = cf.zonas.find((x) => x.name === 'dclima.com.br').id;
    const depois = cf.registros[zid];
    check('ftp e mail são A para o IP antigo, sem CNAME sobrando', depois.filter((x) => /^(ftp|mail)\./.test(x.name)).every((x) => x.type === 'A' && x.content === '151.106.100.16') && depois.filter((x) => /^(ftp|mail)\./.test(x.name)).length === 2, JSON.stringify(depois.filter((x) => /^(ftp|mail)\./.test(x.name))));
    // Segunda passada: nada a fazer.
    const r2 = await handlers['cloudflare:montarZona'](null, { empresa: 'bc', dominio: 'dclima.com.br', hostsExtras: [] });
    check('segunda montagem não propõe nada', r2.plano.atualizar.length === 0 && r2.plano.criar.length === 0 && r2.plano.remover.length === 0, JSON.stringify(r2.plano));
    cf.scanDevolve = [];
    dnsFake.respostas = {};
  }

  console.log('\n=== Planilha: exportar .xlsx (ADR-072) ===');
  {
    dialogStub.proximoCaminho = path.join(DIR, 'fora-de-casa');
    r = await handlers['planilha:exportar'](null, { nomeSugerido: 'x.xlsx', colunas: ['Razão social', 'Domínio', 'Situação', 'Painel'], linhas: [['Cliente A', 'a.com.br', 'contato técnico XPTO', 'https://painel/1'], ['Cliente B', 'b.com.br', 'não está nas contas', '']], aba: 'Fora de casa' });
    check('salva e completa a extensão', r.ok === true && /\.xlsx$/.test(r.caminho) && fs.existsSync(r.caminho), JSON.stringify(r));
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(r.caminho);
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    check('aba e conteúdo', wb.SheetNames[0] === 'Fora de casa' && linhas.length === 3 && linhas[1][1] === 'a.com.br' && linhas[2][0] === 'Cliente B', JSON.stringify(linhas));
    dialogStub.proximoCaminho = null;
    r = await handlers['planilha:exportar'](null, { nomeSugerido: 'x.xlsx', colunas: ['a'], linhas: [['b']] });
    check('cancelar no diálogo não é erro', r.ok === true && r.cancelado === true);
    // Pasta fixa: sem diálogo, em Músicas\apontamentos, sem sobrescrever.
    r = await handlers['planilha:exportar'](null, { nomeSugerido: 'fora.xlsx', colunas: ['a'], linhas: [['b']], pasta: 'apontamentos' });
    const r2 = await handlers['planilha:exportar'](null, { nomeSugerido: 'fora.xlsx', colunas: ['a'], linhas: [['c']], pasta: 'apontamentos' });
    check('pasta fixa salva sem diálogo em <musicas>/apontamentos', r.ok === true && /apontamentos[\\/]fora\.xlsx$/.test(r.caminho) && fs.existsSync(r.caminho), JSON.stringify(r));
    check('segundo arquivo com o mesmo nome ganha sufixo', r2.ok === true && /fora \(2\)\.xlsx$/.test(r2.caminho), JSON.stringify(r2));
    r = await handlers['planilha:exportar'](null, { nomeSugerido: 'x.xlsx', colunas: ['a'], linhas: [] });
    check('sem linhas, recusa', r.ok === false && /Sem linhas/.test(r.error), r.error);
  }

  console.log('\n=== Painel: a janela é reaproveitada entre etapas (ADR-072) ===');
  {
    await handlers['painel:setCreds'](null, { email: 'a@b.c', senha: 's' });
    janelaModo = 'fake';
    janelas = 0;
    const URL1 = 'https://idealplus.idealtrends.io/clientes/1/hub?projeto=2&tab=publicacao';
    const log1 = [];
    const w1 = await M.abrirPainelLogado(URL1, (m, t) => log1.push(m));
    M.painelSoltarJanela(w1, URL1);
    const w2 = await M.abrirPainelLogado(URL1, (m, t) => log1.push(m));
    check('segunda chamada devolve a mesma janela', w1 === w2 && janelas === 1, `janelas=${janelas}`);
    check('e diz que reaproveitou', log1.some((m) => /reaproveitando/.test(m)));
    M.painelSoltarJanela(w2, URL1);
    const w3 = await M.abrirPainelLogado('https://idealplus.idealtrends.io/clientes/9/hub?projeto=9&tab=publicacao', () => {});
    check('outra URL abre janela nova e destrói a antiga', w3 !== w1 && janelas === 2 && w1.isDestroyed());
    M.painelSoltarJanela(w3, 'x', { descartar: true });
    check('erro descarta a janela', w3.isDestroyed());
    const w4 = await M.abrirPainelLogado(URL1, () => {});
    check('depois de descartar, abre de novo', janelas === 3 && !w4.isDestroyed());
    M.painelDescartarJanela();
    check('descartar limpa', w4.isDestroyed());
    janelaModo = 'proibida';
    janelas = 0;
    fs.unlinkSync(path.join(DIR, 'painel-creds.enc'));
  }

  console.log('\n=== Painel: guardas antes de abrir a janela ===');
  r = await handlers['painel:publicar'](null, { url: 'https://outro.com/x', etapa: 'aprovar' });
  check('endereço errado é recusado', r.ok === false && /idealplus/.test(r.error), r.error);
  r = await handlers['painel:publicar'](null, { url: 'https://idealplus.idealtrends.io/clientes/1/hub?projeto=2&tab=publicacao', etapa: 'aprovar' });
  check('sem login do painel, recusa', r.ok === false && /não configurado/.test(r.error), r.error);
  check('e nenhuma janela abriu', janelas === 0);

  console.log('\n=== Registro.br: handles por empresa (ADR-061) ===');
  {
    const cfg = M.readPublicacaoConfig();
    check('Busca Cliente é BCTDL', cfg.registrobrHandles.bc === 'BCTDL', JSON.stringify(cfg.registrobrHandles));
    check('MPI Solutions é MPSOL83', cfg.registrobrHandles.mpisolutions === 'MPSOL83');
  }
  r = await handlers['registrobr:consultar'](null, { empresa: 'mpisolutions', dominio: 'x.com.br' });
  check('consultar sem login configurado recusa antes de abrir janela', r.ok === false && /Registro\.br/.test(r.error) && janelas === 0, r.error);

  console.log('\n=== Registro.br: tempo de transição (ADR-080) ===');
  check('1h58m15s', M.segundosDeTransicao('1h58m15s') === 7095);
  check('45m', M.segundosDeTransicao('45m') === 2700);
  check('vazio é um minuto', M.segundosDeTransicao('') === 60);
  check('lixo é um minuto', M.segundosDeTransicao('em breve') === 60);

  console.log('\n=== Registro.br: guardas antes de abrir a janela ===');
  r = await handlers['registrobr:trocarNs'](null, { empresa: 'mpisolutions', dominio: 'x.com.br', nameservers: ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'] });
  check('sem login configurado, recusa e diz de quem', r.ok === false && /MPI Solutions/.test(r.error) && /Registro\.br/.test(r.error), r.error);
  r = await handlers['registrobr:trocarNs'](null, { empresa: 'bc', dominio: 'x.com.br', nameservers: ['a.ns.cloudflare.com'] });
  check('um nameserver só é recusado', r.ok === false && /dois nameservers/.test(r.error), r.error);
  r = await handlers['registrobr:trocarNs'](null, { empresa: 'xpto', dominio: 'x.com.br', nameservers: ['a', 'b'] });
  check('empresa desconhecida é recusada', r.ok === false && /Empresa desconhecida/.test(r.error), r.error);
  check('e nenhuma janela abriu', janelas === 0);

  Module._load = orig;
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
