// Posse da propriedade do Search Console (ADR-028) e diagnósticos do Bitbucket
// (ADR-029), com as APIs simuladas. Não chama nada de verdade.
//
//     node tools/test-search-console.js

const path = require('path');
const Module = require('module');
const fs = require('fs');

const handlers = {};
const chamadas = [];
let insertResp = () => ({ data: { id: 'https%3A%2F%2Fteste.com.br%2F', site: { type: 'SITE', identifier: 'https://teste.com.br/' }, owners: ['bot@proj.iam.gserviceaccount.com'] } });
let updateErro = null;

// O que o Search Console recebeu, e COM QUAL identidade — que é a coisa toda
// que a ADR-049 conserta.
let scChamadas = [];
let scListaResp = () => ({ data: { siteEntry: [] } });

const googleFake = {
  auth: {
    GoogleAuth: function () { this.getClient = async () => ({}); },
    OAuth2: function () {
      this.marcador = 'oauth-de-usuario';
      this.setCredentials = () => {};
      this.on = () => {};
    },
  },
  options() {},
  searchconsole: () => ({
    sites: {
      add: async (p) => { scChamadas.push({ op: 'sites.add', auth: p.auth?.marcador || null, siteUrl: p.siteUrl }); return { data: {} }; },
      list: async (p) => { scChamadas.push({ op: 'sites.list', auth: p.auth?.marcador || null }); return scListaResp(); },
    },
    sitemaps: {
      submit: async (p) => { scChamadas.push({ op: 'sitemaps.submit', auth: p.auth?.marcador || null, feedpath: p.feedpath }); return { data: {} }; },
    },
  }),
  analyticsadmin: () => ({ accountSummaries: { list: async () => ({ data: {} }) } }),
  tagmanager: () => ({ accounts: { list: async () => ({ data: {} }) } }),
  recaptchaenterprise: () => ({ projects: { keys: {} } }),
  siteVerification: () => ({
    webResource: {
      getToken: async () => ({ data: { token: '<meta name="google-site-verification" content="TK" />' } }),
      insert: async (p) => { chamadas.push({ op: 'insert', p }); return insertResp(); },
      update: async (p) => {
        chamadas.push({ op: 'update', p });
        if (updateErro) throw new Error(updateErro);
        return { data: { owners: p.requestBody.owners } };
      },
    },
  }),
};

const DIR = '/tmp/hub-sc';
const electronStub = {
  app: { getPath: () => DIR, whenReady: () => ({ then: () => ({}) }), on() {} },
  BrowserWindow: Object.assign(function () {}, { getAllWindows: () => [] }),
  ipcMain: { handle(n, f) { handlers[n] = f; } },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => String(b) },
  clipboard: { writeText() {} },
};

// HTTPS simulado para os testes do Bitbucket.
let httpResponder = () => ({ statusCode: 404, body: '{}' });
const httpsStub = {
  request(options, cb) {
    const url = `https://${options.hostname}${options.path}`;
    let corpo = '';
    const req = {
      on() { return req; },
      // buscarInicioDaPagina põe um timeout na requisição; sem isto o teste
      // morre antes de chegar no Search Console.
      setTimeout() { return req; },
      destroy() {},
      write(c) { corpo += c; },
      end() {
        const r = httpResponder(url, options.method, corpo);
        const res = {
          statusCode: r.statusCode, headers: r.headers || {}, setEncoding() {}, resume() {},
          on(ev, fn) { if (ev === 'data' && r.body) fn(r.body); if (ev === 'end') setImmediate(fn); return res; },
        };
        setImmediate(() => cb(res));
      },
    };
    return req;
  },
};

const orig = Module._load;
Module._load = (r, p, i) =>
  r === 'electron' ? electronStub
  : r === 'googleapis' ? { google: googleFake }
  : r === 'https' ? httpsStub
  : orig(r, p, i);

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const mod = { exports: {} };
new Function('require','module','exports','__dirname','__filename',
  src + ';module.exports={googleAccountFor,bitbucketError,resolveRepo,listBitbucketWorkspaces,searchConsoleSiteUrl,searchConsoleMethodFor,searchConsoleVerifyMethodFor,painelScValueMethodFor,buildFileVerificationValue,brandHasBitbucket,BITBUCKET_SCOPE_HINT};')
  (require, mod, mod.exports, path.join(__dirname, '..'), path.join(__dirname, '..', 'main.js'));
const M = mod.exports;

let falhas = 0;
const check = (n, c, d = '') => { if (!c) falhas++; console.log(`${c ? '  ok  ' : ' FALHA'} ${n}${!c && d ? ' → ' + d : ''}`); };

fs.mkdirSync(DIR, { recursive: true });
const SA = path.join(DIR, 'sa.json');
fs.writeFileSync(SA, JSON.stringify({ project_id: 'proj', client_email: 'bot@proj.iam.gserviceaccount.com' }));
const escreveConfig = (cfg) => fs.writeFileSync(path.join(DIR, 'google-config.json'), JSON.stringify(cfg));

const verificar = (brand) => {
  chamadas.length = 0;
  return handlers['google:verifySearchConsole'](null, { siteUrl: 'https://teste.com.br/', saPath: SA, brand });
};
const texto = (r) => (r.log || []).map((l) => l.message).join(' | ');

(async () => {
  console.log('\n=== Endereço da propriedade (com www) ===');
  const U = M.searchConsoleSiteUrl;
  check('acrescenta o www', U('nobrefrutas.com.br') === 'https://www.nobrefrutas.com.br/', U('nobrefrutas.com.br'));
  check('não duplica www', U('www.nobrefrutas.com.br') === 'https://www.nobrefrutas.com.br/', U('www.nobrefrutas.com.br'));
  check('tira o https colado', U('https://nobrefrutas.com.br') === 'https://www.nobrefrutas.com.br/', U('https://nobrefrutas.com.br'));
  check('tira a barra do fim', U('nobrefrutas.com.br/') === 'https://www.nobrefrutas.com.br/', U('nobrefrutas.com.br/'));
  check('tira caminho colado', U('nobrefrutas.com.br/pagina') === 'https://www.nobrefrutas.com.br/', U('nobrefrutas.com.br/pagina'));
  check('normaliza maiúscula', U('NobreFrutas.COM.BR') === 'https://www.nobrefrutas.com.br/', U('NobreFrutas.COM.BR'));
  // Comportamento assumido, não desejado: separar "loja.x.com.br" de "x.com.br"
  // exigiria lista de sufixos públicos, e o app só recebe domínio raiz (o slug
  // do repositório). Fica registrado para quem mexer aqui depois.
  check('subdomínio também ganha www', U('loja.nobrefrutas.com.br') === 'https://www.loja.nobrefrutas.com.br/', U('loja.nobrefrutas.com.br'));
  check('vazio devolve vazio', U('') === '');

  // A MPI+ é o domínio puro no Search Console, e por arquivo em vez de meta.
  check('MPI+ sem www', U('nobrefrutas.com.br', 'mpiplus') === 'https://nobrefrutas.com.br/', U('nobrefrutas.com.br', 'mpiplus'));
  check('MPI+ tira o www que veio junto', U('www.nobrefrutas.com.br', 'mpiplus') === 'https://nobrefrutas.com.br/', U('www.nobrefrutas.com.br', 'mpiplus'));
  check('Busca Cliente continua com www', U('nobrefrutas.com.br', 'bc') === 'https://www.nobrefrutas.com.br/');
  check('MPI Solutions continua com www', U('nobrefrutas.com.br', 'mpisolutions') === 'https://www.nobrefrutas.com.br/');
  // Duas perguntas separadas (ADR-040): o TOKEN é sempre META — é ele que vai
  // para o geral.php e para o campo do painel; o MÉTODO de verificação é que
  // muda por marca.
  check('token é META em todas', M.searchConsoleMethodFor('mpiplus') === 'META' && M.searchConsoleMethodFor('bc') === 'META');
  check('MPI+ verifica pelo Analytics', M.searchConsoleVerifyMethodFor('mpiplus') === 'ANALYTICS');
  check('Busca Cliente verifica por META', M.searchConsoleVerifyMethodFor('bc') === 'META');
  check('MPI Solutions verifica por META', M.searchConsoleVerifyMethodFor('mpisolutions') === 'META');
  check('marca desconhecida verifica por META', M.searchConsoleVerifyMethodFor('xpto') === 'META');
  check('marca desconhecida usa www', U('x.com.br', 'xpto') === 'https://www.x.com.br/');

  console.log('\n=== Valor que vai para o campo do painel ===');
  // Três coisas diferentes que já foram confundidas entre si (ADR-039, 040, 043):
  // o token do geral.php, o método de verificação, e o valor do campo do painel.
  check('MPI+ manda a linha do arquivo', M.painelScValueMethodFor('mpiplus') === 'FILE');
  check('as outras mandam o token da meta', M.painelScValueMethodFor('bc') === 'META' && M.painelScValueMethodFor('mpisolutions') === 'META');
  const F = M.buildFileVerificationValue;
  check('monta a linha a partir do nome do arquivo',
    F('google8349c1294923c797.html') === 'google-site-verification: google8349c1294923c797.html', F('google8349c1294923c797.html'));
  check('linha pronta passa direto',
    F('google-site-verification: google8349.html') === 'google-site-verification: google8349.html');
  check('vazio devolve vazio', F('') === '');

  console.log('\n=== Dono por marca, lido da config ===');
  escreveConfig({ saPath: SA, ownerEmail: 'dono@empresa.com.br', brandAccounts: {
    bc: 'bcrelatorios@buscacliente.com.br',
    mpisolutions: 'ferramentasmpisolutions@buscacliente.com.br',
    mpiplus: 'bcrelatoriostags@buscacliente.com.br',
  } });
  check('bc', M.googleAccountFor('bc') === 'bcrelatorios@buscacliente.com.br');
  check('mpisolutions', M.googleAccountFor('mpisolutions') === 'ferramentasmpisolutions@buscacliente.com.br');
  check('mpiplus', M.googleAccountFor('mpiplus') === 'bcrelatoriostags@buscacliente.com.br');
  check('marca sem dono devolve vazio', M.googleAccountFor('inexistente') === '');
  check('a conta da marca ganha do campo global', M.googleAccountFor('bc') !== 'dono@empresa.com.br');

  // scOwners é o nome antigo do mesmo campo: quem já tinha configurado não
  // pode perder o valor por causa da renomeação.
  escreveConfig({ saPath: SA, scOwners: { bc: 'antigo@gmail.com' } });
  check('lê o nome antigo como reserva', M.googleAccountFor('bc') === 'antigo@gmail.com', M.googleAccountFor('bc'));
  escreveConfig({ saPath: SA, brandAccounts: { bc: 'novo@gmail.com' }, scOwners: { bc: 'antigo@gmail.com' } });
  check('com os dois, o nome novo ganha', M.googleAccountFor('bc') === 'novo@gmail.com', M.googleAccountFor('bc'));

  // Volta a config de verdade para as seções seguintes.
  escreveConfig({ saPath: SA, ownerEmail: 'dono@empresa.com.br', brandAccounts: {
    bc: 'bcrelatorios@buscacliente.com.br',
    mpisolutions: 'ferramentasmpisolutions@buscacliente.com.br',
    mpiplus: 'bcrelatoriostags@buscacliente.com.br',
  } });

  console.log('\n=== Verificar + passar a posse ===');
  let r = await verificar('bc');
  check('verificação ok', r.ok === true, r.error);
  check('chamou insert e update', chamadas.map((c) => c.op).join() === 'insert,update', chamadas.map((c) => c.op).join());
  const up = chamadas.find((c) => c.op === 'update');
  check('usou o id devolvido pelo insert', up.p.id === 'https%3A%2F%2Fteste.com.br%2F', up.p.id);
  check('MANTEVE a service account na lista', up.p.requestBody.owners.includes('bot@proj.iam.gserviceaccount.com'),
    JSON.stringify(up.p.requestBody.owners));
  check('adicionou o dono da marca', up.p.requestBody.owners.includes('bcrelatorios@buscacliente.com.br'));
  check('devolve quem foi adicionado', r.ownerAdded === 'bcrelatorios@buscacliente.com.br', r.ownerAdded);
  check('site vai no corpo do update', up.p.requestBody.site?.identifier === 'https://teste.com.br/');

  console.log('\n=== Já é proprietário ===');
  insertResp = () => ({ data: { id: 'x', site: {}, owners: ['bot@proj.iam.gserviceaccount.com', 'BCRelatorios@buscacliente.com.br'] } });
  r = await verificar('bc');
  check('não chama update de novo', chamadas.filter((c) => c.op === 'update').length === 0);
  check('compara sem ligar para maiúscula', /já é proprietário/.test(texto(r)), texto(r));
  insertResp = () => ({ data: { id: 'https%3A%2F%2Fteste.com.br%2F', site: { type: 'SITE', identifier: 'https://teste.com.br/' }, owners: ['bot@proj.iam.gserviceaccount.com'] } });

  console.log('\n=== Marca sem dono configurado ===');
  escreveConfig({ saPath: SA, brandAccounts: { bc: '' } });
  r = await verificar('bc');
  check('verifica mesmo assim', r.ok === true);
  check('não chama update', chamadas.filter((c) => c.op === 'update').length === 0);
  check('avisa que ficou só com a service account', /service account/.test(texto(r)), texto(r));
  check('e diz onde preencher', /configuraç/i.test(texto(r)));

  console.log('\n=== Falha ao passar a posse não apaga a verificação ===');
  escreveConfig({ saPath: SA, brandAccounts: { bc: 'bcrelatorios@buscacliente.com.br' } });
  updateErro = 'Insufficient Permission';
  r = await verificar('bc');
  check('devolve erro', r.ok === false);
  check('mas o log mostra que verificou antes', /Site verificado/.test(texto(r)), texto(r));
  updateErro = null;

  console.log('\n=== Bitbucket: mensagem de erro ===');
  check('usa error.message quando existe',
    M.bitbucketError({ status: 403, text: '{"error":{"message":"Branch restriction"}}' }) === 'Branch restriction');
  let msg = M.bitbucketError({ status: 403, text: '<html>Forbidden</html>' });
  check('sem JSON, mostra o corpo cru', /Forbidden/.test(msg), msg);
  check('e a dica de escopo no 403', /write:repository/.test(msg), msg);
  msg = M.bitbucketError({ status: 404, text: '' });
  check('sem dica de escopo no 404', !/write:repository/.test(msg), msg);

  console.log('\n=== Bitbucket: 403 não vira "repositório não existe" ===');
  const creds = { email: 'a@b.c', token: 't' };
  httpResponder = (url) => {
    if (url.includes('/2.0/workspaces')) return { statusCode: 200, body: JSON.stringify({ values: [{ slug: 'idealtrends' }] }) };
    return { statusCode: 403, body: '' };
  };
  let erro = null;
  try { await M.resolveRepo({ repo: 'site.com.br', workspace: '', creds }); } catch (e) { erro = e.message; }
  check('erro fala de permissão', /não pode lê-lo|403/.test(erro || ''), erro);
  check('erro NÃO culpa o slug', !/Nenhum repositório com o slug/.test(erro || ''), erro);
  check('erro traz a dica de escopo', /read:repository/.test(erro || ''), erro);

  httpResponder = (url) => {
    if (url.includes('/2.0/workspaces')) return { statusCode: 200, body: JSON.stringify({ values: [{ slug: 'idealtrends' }] }) };
    return { statusCode: 404, body: '' };
  };
  erro = null;
  try { await M.resolveRepo({ repo: 'site.com.br', workspace: '', creds }); } catch (e) { erro = e.message; }
  check('404 continua sendo "não existe"', /Nenhum repositório com o slug/.test(erro || ''), erro);

  console.log('\n=== Descoberta de workspaces: as duas rotas ===');
  const chamadasWs = [];
  httpResponder = (url) => {
    chamadasWs.push(new URL(url).pathname);
    if (url.includes('/2.0/user/permissions/workspaces')) {
      return { statusCode: 200, body: JSON.stringify({ values: [{ workspace: { slug: 'idealtrends' } }] }) };
    }
    if (url.includes('/2.0/workspaces')) return { statusCode: 404, body: '{"error":{"message":"Resource not found"}}' };
    return { statusCode: 404, body: '' };
  };
  chamadasWs.length = 0;
  let ws = await M.listBitbucketWorkspaces(creds);
  check('cai na rota de associação quando a direta 404', ws.join() === 'idealtrends', ws.join());
  check('tentou a direta primeiro', chamadasWs[0] === '/2.0/workspaces', chamadasWs.join());
  check('e depois a de permissões', chamadasWs[1] === '/2.0/user/permissions/workspaces', chamadasWs.join());

  httpResponder = (url) => {
    chamadasWs.push(new URL(url).pathname);
    return { statusCode: 200, body: JSON.stringify({ values: [{ slug: 'idealtrends' }, { slug: 'outra' }] }) };
  };
  chamadasWs.length = 0;
  ws = await M.listBitbucketWorkspaces(creds);
  check('rota direta funcionando não chama a segunda', chamadasWs.length === 1, chamadasWs.join());
  check('devolve todas as workspaces', ws.join() === 'idealtrends,outra', ws.join());

  httpResponder = () => ({ statusCode: 404, body: '{"error":{"message":"Resource not found"}}' });
  erro = null;
  try { await M.listBitbucketWorkspaces(creds); } catch (e) { erro = e.message; }
  check('as duas falhando, erro manda preencher a workspace', /Workspace do Bitbucket/.test(erro || ''), erro);
  check('e nomeia o escopo que falta', /read:workspace/.test(erro || ''), erro);
  check('e cita os dois caminhos tentados',
    /\/2\.0\/workspaces/.test(erro || '') && /permissions\/workspaces/.test(erro || ''), erro);

  console.log('\n=== Marca sem Bitbucket ===');
  check('bc tem', M.brandHasBitbucket('bc') === true);
  check('mpisolutions tem', M.brandHasBitbucket('mpisolutions') === true);
  check('mpiplus NÃO tem', M.brandHasBitbucket('mpiplus') === false);
  check('marca desconhecida assume que tem', M.brandHasBitbucket('xpto') === true);

  // A tela já esconde o botão, mas o processo principal recusa de novo: sem
  // repositório, procurar um pelo nome do domínio poderia commitar no
  // repositório de outra marca com o mesmo slug.
  let rc = await handlers['bitbucket:commitGeral'](null, {
    repo: 'site.com.br', brand: 'mpiplus', creds, values: { idAnalytics: 'G-X' },
  });
  check('commit de MPI+ é recusado', rc.ok === false, JSON.stringify(rc));
  check('erro diz que não tem repositório', /não tem repositório/.test(rc.error || ''), rc.error);

  // Sem brand no payload, nada muda — chamada antiga segue valendo.
  httpResponder = () => ({ statusCode: 404, body: '{"error":{"message":"Resource not found"}}' });
  rc = await handlers['bitbucket:commitGeral'](null, {
    repo: 'site.com.br', creds, values: { idAnalytics: 'G-X' },
  });
  check('sem brand, segue o fluxo normal', /workspace/i.test(rc.error || ''), rc.error);

  console.log('\n=== Quem registra a propriedade é quem a enxerga (ADR-049) ===');
  {
    const tokenMpiPlus = path.join(DIR, 'oauth-token-mpiplus.json');
    const limpaToken = () => { try { fs.unlinkSync(tokenMpiPlus); } catch (e) {} };
    limpaToken();
    fs.writeFileSync(path.join(DIR, 'oauth-config.json'), JSON.stringify({ clientId: 'x.apps.googleusercontent.com', clientSecret: 'GOCSPX-y' }));
    escreveConfig({ saPath: SA, brandAccounts: { mpiplus: 'bcrelatoriotags@gmail.com' } });
    // A verificação da MPI+ é pelo Analytics: a página precisa ter a tag.
    httpResponder = () => ({ statusCode: 200, body: '<html><head><script src="https://www.googletagmanager.com/gtm.js"></script></head></html>' });

    const preparar = () => {
      scChamadas = [];
      return handlers['searchconsole:prepare'](null, {
        siteUrl: 'https://teste.com.br/', saPath: SA, brand: 'mpiplus', analyticsId: 'G-X',
      });
    };

    let r = await preparar();
    const semSessao = (r.log || []).map((l) => l.message).join(' | ');
    check('sem sessão da marca, registra assim mesmo', scChamadas.some((c) => c.op === 'sites.add'), JSON.stringify(scChamadas));
    check('mas SEM a identidade da marca', scChamadas.find((c) => c.op === 'sites.add')?.auth === null, JSON.stringify(scChamadas));
    check('e avisa que não vai aparecer sozinha', /NÃO vai aparecer sozinha/.test(semSessao), semSessao.slice(0, 200));
    check('dizendo qual conta', /bcrelatoriotags@gmail\.com/.test(semSessao));
    check('não confere lista nenhuma sem sessão', !scChamadas.some((c) => c.op === 'sites.list'), JSON.stringify(scChamadas));

    // Agora com a sessão da marca conectada.
    fs.writeFileSync(tokenMpiPlus, JSON.stringify({ access_token: 'a', refresh_token: 'r', email: 'bcrelatoriotags@gmail.com' }));
    scListaResp = () => ({ data: { siteEntry: [{ siteUrl: 'https://teste.com.br/', permissionLevel: 'siteOwner' }] } });

    r = await preparar();
    const comSessao = (r.log || []).map((l) => l.message).join(' | ');
    check('com sessão, registra COMO a marca', scChamadas.find((c) => c.op === 'sites.add')?.auth === 'oauth-de-usuario', JSON.stringify(scChamadas));
    check('e manda o sitemap como a marca', scChamadas.find((c) => c.op === 'sitemaps.submit')?.auth === 'oauth-de-usuario', JSON.stringify(scChamadas));
    check('confere a lista da conta depois', scChamadas.some((c) => c.op === 'sites.list'), JSON.stringify(scChamadas));
    check('e diz que conferiu', /Conferido na conta/.test(comSessao), comSessao.slice(-250));
    check('sem o aviso de "à mão"', !/NÃO vai aparecer sozinha/.test(comSessao));
    check('o resultado nomeia quem registrou', r.registradaPor === 'bcrelatoriotags@gmail.com', String(r.registradaPor));

    // Registrou, mas a conta não lista: é exatamente o sintoma que o usuário
    // relatou, e não pode passar por sucesso.
    scListaResp = () => ({ data: { siteEntry: [] } });
    r = await preparar();
    const semLista = (r.log || []).map((l) => l.message).join(' | ');
    check('lista vazia vira aviso, não silêncio', /não lista/.test(semLista), semLista.slice(-250));

    limpaToken();
  }

  console.log('\n=== Site que redireciona para www (ADR-084) ===');
  {
    escreveConfig({ saPath: SA, brandAccounts: { mpiplus: 'bcrelatoriotags@gmail.com' } });
    const HTML = '<html><head><script src="https://www.googletagmanager.com/gtm.js"></script></head></html>';
    // Raiz responde 301 para www; www responde a página com a tag.
    httpResponder = (url) => (/^https:\/\/teste\.com\.br\//.test(url)
      ? { statusCode: 301, headers: { location: 'https://www.teste.com.br/' }, body: '' }
      : { statusCode: 200, body: HTML });
    scChamadas = [];
    let r = await handlers['searchconsole:prepare'](null, { siteUrl: 'https://teste.com.br/', saPath: SA, brand: 'mpiplus', analyticsId: 'G-X' });
    const t = (r.log || []).map((l) => l.message).join(' | ');
    check('segue o 301 e verifica', r.ok === true, r.error || t.slice(-200));
    check('a propriedade passa a ser o www', r.siteUrl === 'https://www.teste.com.br/' && r.redirecionou === true, JSON.stringify({ s: r.siteUrl, p: r.siteUrlPedido }));
    check('avisou do redirecionamento', /redireciona \(301\) para https:\/\/www\.teste\.com\.br\//.test(t), t.slice(0, 300));
    check('registrou o www no Search Console', scChamadas.find((c) => c.op === 'sites.add')?.siteUrl === 'https://www.teste.com.br/' || JSON.stringify(scChamadas).includes('www.teste.com.br'), JSON.stringify(scChamadas));

    // Redirecionamento para OUTRO domínio não é seguido.
    httpResponder = () => ({ statusCode: 301, headers: { location: 'https://outrodominio.com.br/' }, body: '' });
    r = await handlers['searchconsole:prepare'](null, { siteUrl: 'https://teste.com.br/', saPath: SA, brand: 'mpiplus', analyticsId: 'G-X' });
    check('outro domínio: não segue e explica', r.ok === false && /outro domínio: https:\/\/outrodominio\.com\.br/.test(r.error), r.error);

    // Sem tag no destino continua sendo recusa, agora com o status certo.
    httpResponder = () => ({ statusCode: 200, body: '<html></html>' });
    r = await handlers['searchconsole:prepare'](null, { siteUrl: 'https://teste.com.br/', saPath: SA, brand: 'mpiplus', analyticsId: 'G-X' });
    check('sem tag: recusa dizendo que não achou a tag', r.ok === false && /não achei nem a tag/.test(r.error), r.error);
  }

  Module._load = orig;
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
