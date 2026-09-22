// Seleção de etapas da aba "Criar novo" (ADR-027), com as APIs do Google
// simuladas. Não cria nada de verdade.
//
//     node tools/test-etapas-criar.js


// Sem cota para respeitar: a API aqui é de mentira, e esperar 2,1s entre
// chamadas só faria o teste demorar minutos.
process.env.HUB_GTM_INTERVAL_MS = '1';

const path = require('path');
const Module = require('module');
const fs = require('fs');

const handlers = {};
// O pacer do Tag Manager espera ~2,1s entre chamadas. Para a seção que só quer
// saber QUEM recebeu a permissão, o template é interrompido logo depois da
// permissão ser concedida — senão o teste levaria minutos aplicando template.
let abortarTemplate = false;
// O que "já existe" no Google, para os testes de reaproveitamento (ADR-041).
let gaExistentes = [];
let gtmExistentes = [];
let recaptchaExistentes = [];
const chamadas = [];   // nomes das chamadas de API feitas
const marca = (n) => { chamadas.push(n); };

// Cada API do Google devolve o mínimo que o handler precisa para seguir.
const googleFake = {
  auth: { GoogleAuth: function () { this.getClient = async () => ({}); }, OAuth2: function () {} },
  options() {},
  analyticsadmin: () => ({
    // Uma conta por marca: buscacliente01 (bc), MPI Solutions, e a "Busca
    // Cliente - MPI+" — senão o teste de uma marca morre na etapa do Analytics
    // e nunca chega no Tag Manager.
    accountSummaries: { list: async () => { marca('ga:accountSummaries'); return { data: { accountSummaries: [
      { account: 'accounts/1', displayName: 'Busca Cliente 01', propertySummaries: gaExistentes },
      { account: 'accounts/2', displayName: 'MPI Solutions', propertySummaries: [] },
      { account: 'accounts/3', displayName: 'Busca Cliente - MPI+', propertySummaries: [] },
    ] } }; } },
    properties: {
      create: async () => { marca('ga:properties.create'); return { data: { name: 'properties/9' } }; },
      dataStreams: {
        create: async () => { marca('ga:dataStreams.create'); return { data: { webStreamData: { measurementId: 'G-TESTE' } } }; },
        list: async () => {
          marca('ga:dataStreams.list');
          // com defaultUri: é por ele que a varredura acha a propriedade cujo
          // nome fugiu do padrão (ADR-046)
          return { data: { dataStreams: [{ webStreamData: { measurementId: 'G-JAEXISTIA', defaultUri: 'https://teste.com.br' } }] } };
        },
      },
    },
  }),
  tagmanager: () => ({
    accounts: {
      list: async () => { marca('gtm:accounts.list'); return { data: { account: [
        { name: 'Busca Cliente - Clientes', path: 'accounts/7' },
        { name: 'MPI SOLUTIONS', path: 'accounts/8' },
      ] } }; },
      containers: {
        list: async () => { marca('gtm:containers.list'); return { data: { container: gtmExistentes } }; },
        create: async () => { marca('gtm:containers.create'); return { data: { publicId: 'GTM-XYZ', containerId: '55', path: 'accounts/7/containers/55' } }; },
        workspaces: {
          list: async () => {
            if (abortarTemplate) throw new Error('parando aqui — o teste só queria a permissão');
            return { data: { workspace: [{ path: 'accounts/7/containers/55/workspaces/1' }] } };
          },
          create_version: async () => ({ data: { containerVersion: { path: 'v1' } } }),
          built_in_variables: { create: async () => ({ data: {} }) },
          variables: { create: async () => ({ data: { variableId: '1', name: 'x' } }) },
          triggers: { create: async () => ({ data: { triggerId: '1', name: 't' } }) },
          tags: { create: async () => ({ data: { tagId: '1' } }) },
        },
        versions: { publish: async () => ({ data: {} }) },
      },
      user_permissions: {
        list: async () => ({ data: { userPermission: [] } }),
        create: async ({ requestBody }) => { marca(`gtm:permissions.create:${requestBody?.emailAddress}`); return { data: {} }; },
      },
    },
  }),
  recaptchaenterprise: () => ({
    projects: { keys: {
      list: async () => { marca('recaptcha:keys.list'); return { data: { keys: recaptchaExistentes } }; },
      create: async () => { marca('recaptcha:keys.create'); return { data: { name: 'projects/p/keys/6Lc-TESTE' } }; },
      retrieveLegacySecretKey: async () => ({ data: { legacySecretKey: 'SEGREDO' } }),
    } },
  }),
  siteVerification: () => ({
    webResource: {
      getToken: async () => { marca('sc:getToken'); return { data: { token: '<meta name="google-site-verification" content="TOKEN-TESTE" />' } }; },
      insert: async () => ({ data: {} }),
    },
  }),
};

const DIR = '/tmp/hub-etapas';
const electronStub = {
  app: { getPath: () => DIR, whenReady: () => ({ then: () => ({}) }), on() {} },
  BrowserWindow: Object.assign(function () {}, { getAllWindows: () => [] }),
  ipcMain: { handle(n, f) { handlers[n] = f; } },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => String(b) },
  clipboard: { writeText() {} },
};

const orig = Module._load;
Module._load = (r, p, i) =>
  r === 'electron' ? electronStub
  : r === 'googleapis' ? { google: googleFake }
  : orig(r, p, i);

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const mod = { exports: {} };
new Function('require','module','exports','__dirname','__filename',
  src + ';module.exports={CREATE_STEPS,CREATE_STEP_IDS,normalizeCreateSteps,nomeCasaComDominio,dominioDoStream};')
  (require, mod, mod.exports, path.join(__dirname, '..'), path.join(__dirname, '..', 'main.js'));
const M = mod.exports;

let falhas = 0;
const check = (n, c, d = '') => { if (!c) falhas++; console.log(`${c ? '  ok  ' : ' FALHA'} ${n}${!c && d ? ' → ' + d : ''}`); };

fs.mkdirSync(DIR, { recursive: true });
const SA = path.join(DIR, 'sa.json');
fs.writeFileSync(SA, JSON.stringify({ project_id: 'proj-teste', client_email: 'bot@proj.iam.gserviceaccount.com' }));
const escreveConfig = (cfg) => fs.writeFileSync(path.join(DIR, 'google-config.json'), JSON.stringify(cfg));
escreveConfig({
  ownerEmail: 'dono@empresa.com.br',
  brandAccounts: { bc: 'bcrelatorios@gmail.com', mpisolutions: 'ferramentasmpisolutions@gmail.com' },
});

const criar = (steps, extra) => {
  chamadas.length = 0;
  return handlers['google:createProject'](null, { domain: 'teste.com.br', saPath: SA, brand: 'bc', steps, ...extra });
};

(async () => {
  console.log('\n=== normalizeCreateSteps ===');
  check('sem lista, roda tudo', M.normalizeCreateSteps(undefined).length === 4);
  check('null também roda tudo', M.normalizeCreateSteps(null).length === 4);
  check('lista vazia é vazia', M.normalizeCreateSteps([]).length === 0);
  check('ignora etapa inventada', M.normalizeCreateSteps(['analytics', 'foo']).join() === 'analytics');
  check('devolve na ordem de execução', M.normalizeCreateSteps(['searchconsole', 'analytics']).join() === 'analytics,searchconsole');
  check('não duplica', M.normalizeCreateSteps(['analytics', 'analytics']).join() === 'analytics');

  console.log('\n=== Só o que foi pedido roda ===');
  let r = await criar(['recaptcha']);
  check('recaptcha sozinho: ok', r.ok === true, r.error);
  check('não chamou o Analytics', !chamadas.some((c) => c.startsWith('ga:')), chamadas.join());
  check('não chamou o Tag Manager', !chamadas.some((c) => c.startsWith('gtm:')), chamadas.join());
  check('não chamou o Search Console', !chamadas.some((c) => c.startsWith('sc:')), chamadas.join());
  check('criou a chave', chamadas.includes('recaptcha:keys.create'));
  check('resultado traz a siteKey', r.result.siteKey === '6Lc-TESTE', r.result.siteKey);
  check('resultado sem measurement id', r.result.idAnalytics === '', JSON.stringify(r.result.idAnalytics));
  check('resultado devolve as etapas pedidas', r.result.steps.join() === 'recaptcha', r.result.steps?.join());
  check('terminal diz o que não foi pedido', r.log.some((l) => /não pedido/.test(l.message)));

  r = await criar(['searchconsole']);
  check('search console sozinho: ok', r.ok === true, r.error);
  check('token limpo, sem a tag meta', r.result.googleSearchConsole === 'TOKEN-TESTE', r.result.googleSearchConsole);
  // Com www: é o endereço em que o site responde, e propriedade de prefixo de
  // URL no Search Console é por prefixo exato (ADR-030).
  check('siteUrl vem com www', r.result.siteUrl === 'https://www.teste.com.br/', r.result.siteUrl);

  console.log('\n=== GA + GTM ===');
  r = await criar(['analytics', 'gtm']);
  check('ok', r.ok === true, r.error);
  check('container criado', chamadas.includes('gtm:containers.create'));
  check('sem reCAPTCHA', !chamadas.includes('recaptcha:keys.create'));
  check('measurement id no resultado', r.result.idAnalytics === 'G-TESTE');
  check('GTM-ID no resultado', r.result.tagmanager === 'GTM-XYZ');

  console.log('\n=== Quem administra o container é a conta DA MARCA ===');
  {
    abortarTemplate = true;
    chamadas.length = 0;
    await handlers['google:createProject'](null, {
      domain: 'teste.com.br', saPath: SA, brand: 'mpisolutions', steps: ['analytics', 'gtm'],
    });
    const perm = chamadas.find((c) => c.startsWith('gtm:permissions.create:'));
    check('MPI Solutions usa a conta dela',
      perm === 'gtm:permissions.create:ferramentasmpisolutions@gmail.com', perm);

    // A Busca Cliente divide a conta do Tag Manager com a MPI+, e quem opera é
    // o login da MPI+ (ADR-067). Sem ele configurado, NÃO cai na conta
    // principal: a MPI+ não aceita substituto (ADR-035 e ADR-070).
    const rBcSem = await criar(['analytics', 'gtm']); // marca bc
    const permBcSem = chamadas.find((c) => c.startsWith('gtm:permissions.create:'));
    check('Busca Cliente sem o login da MPI+ não cai na conta principal',
      permBcSem === undefined, permBcSem);
    check('e o aviso diz de quem é o login que falta',
      rBcSem.log.some((l) => l.type === 'warn' && /MPI\+/.test(l.message) && /Tag Manager/.test(l.message)),
      rBcSem.log.filter((l) => l.type === 'warn').map((l) => l.message).join(' | '));

    escreveConfig({
      ownerEmail: 'dono@empresa.com.br',
      brandAccounts: {
        bc: 'bcrelatorios@gmail.com',
        mpisolutions: 'ferramentasmpisolutions@gmail.com',
        mpiplus: 'bcrelatoriotags@gmail.com',
      },
    });
    await criar(['analytics', 'gtm']); // marca bc
    const permBc = chamadas.find((c) => c.startsWith('gtm:permissions.create:'));
    check('Busca Cliente manda o container para o login da MPI+',
      permBc === 'gtm:permissions.create:bcrelatoriotags@gmail.com', permBc);
    // Volta a conta da MPI+ a não existir: o próximo caso depende disso.
    escreveConfig({
      ownerEmail: 'dono@empresa.com.br',
      brandAccounts: { bc: 'bcrelatorios@gmail.com', mpisolutions: 'ferramentasmpisolutions@gmail.com' },
    });

    // MPI+ sem conta configurada NÃO cai na conta principal: ela só opera pela
    // conta dela, e usar outra aqui é justamente o erro da ADR-035.
    chamadas.length = 0;
    const rMais = await handlers['google:createProject'](null, {
      domain: 'teste.com.br', saPath: SA, brand: 'mpiplus', steps: ['analytics', 'gtm'],
    });
    const permMais = chamadas.find((c) => c.startsWith('gtm:permissions.create:'));
    check('MPI+ sem conta não usa a principal', permMais === undefined, permMais);
    check('e diz por que recusou',
      rMais.log.some((l) => l.type === 'warn' && /só opera pela conta dela/.test(l.message)),
      rMais.log.filter((l) => l.type === 'warn').map((l) => l.message).join(' | '));

    // Com a conta dela configurada, usa a dela.
    escreveConfig({
      ownerEmail: 'dono@empresa.com.br',
      brandAccounts: {
        bc: 'bcrelatorios@gmail.com',
        mpisolutions: 'ferramentasmpisolutions@gmail.com',
        mpiplus: 'bcrelatoriotags@gmail.com',
      },
    });
    chamadas.length = 0;
    await handlers['google:createProject'](null, {
      domain: 'teste.com.br', saPath: SA, brand: 'mpiplus', steps: ['analytics', 'gtm'],
    });
    const permMais2 = chamadas.find((c) => c.startsWith('gtm:permissions.create:'));
    check('MPI+ usa bcrelatoriotags', permMais2 === 'gtm:permissions.create:bcrelatoriotags@gmail.com', permMais2);
    abortarTemplate = false;
  }

  console.log('\n=== Casar o nome da propriedade com o domínio ===');
  {
    const N = M.nomeCasaComDominio;
    check('nome igual', N('cliente.com.br', 'cliente.com.br') === true);
    // O padrão da equipe: "dominio.com.br - GA4" (ADR-046).
    check('com sufixo " - GA4"', N('cliente.com.br - GA4', 'cliente.com.br') === true);
    check('com sufixo " | GA4"', N('cliente.com.br | GA4', 'cliente.com.br') === true);
    check('com sufixo colado por espaço', N('cliente.com.br GA4', 'cliente.com.br') === true);
    check('ignora maiúsculas', N('CLIENTE.COM.BR - GA4', 'cliente.com.br') === true);
    // O que NÃO pode casar: outro domínio que começa igual.
    check('não casa com .old', N('cliente.com.br.old', 'cliente.com.br') === false);
    check('não casa com domínio maior', N('cliente.com.brasil', 'cliente.com.br') === false);
    check('não casa com outro cliente', N('outrocliente.com.br', 'cliente.com.br') === false);
    check('vazio não casa', N('', 'cliente.com.br') === false && N('x', '') === false);

    const S = M.dominioDoStream;
    check('lê o domínio do stream', S({ webStreamData: { defaultUri: 'https://cliente.com.br' } }) === 'cliente.com.br');
    check('tira o www do stream', S({ webStreamData: { defaultUri: 'https://www.cliente.com.br/' } }) === 'cliente.com.br');
    check('aceita sem protocolo', S({ webStreamData: { defaultUri: 'cliente.com.br' } }) === 'cliente.com.br');
    check('stream sem uri devolve vazio', S({ webStreamData: {} }) === '' && S(null) === '');
  }

  console.log('\n=== Rodar de novo reaproveita, não duplica ===');
  {
    gaExistentes = [{ property: 'properties/555', displayName: 'teste.com.br' }];
    gtmExistentes = [{ name: 'teste.com.br', publicId: 'GTM-JAEXISTIA', containerId: '9', path: 'accounts/7/containers/9' }];
    recaptchaExistentes = [{ name: 'projects/p/keys/6Lc-JAEXISTIA', displayName: 'teste.com.br' }];

    const r2 = await criar(['analytics', 'gtm', 'recaptcha']);
    check('ok', r2.ok === true, r2.error);
    check('NÃO criou propriedade nova', !chamadas.includes('ga:properties.create'), chamadas.join());
    check('NÃO criou data stream novo', !chamadas.includes('ga:dataStreams.create'), chamadas.join());
    check('usou o measurement id que já existia', r2.result.idAnalytics === 'G-JAEXISTIA', r2.result.idAnalytics);
    check('NÃO criou container novo', !chamadas.includes('gtm:containers.create'), chamadas.join());
    check('usou o GTM que já existia', r2.result.tagmanager === 'GTM-JAEXISTIA', r2.result.tagmanager);
    check('NÃO criou chave reCAPTCHA nova', !chamadas.includes('recaptcha:keys.create'), chamadas.join());
    check('usou a chave que já existia', r2.result.siteKey === '6Lc-JAEXISTIA', r2.result.siteKey);
    check('relata o que reaproveitou',
      ['Analytics', 'Tag Manager', 'reCAPTCHA'].every((x) => r2.result.reaproveitados.includes(x)),
      JSON.stringify(r2.result.reaproveitados));

    // Nome fora de qualquer padrão: só o data stream salva. É o caso do
    // servicos2ems.com.br, que foi criado duas vezes por causa disso.
    gaExistentes = [{ property: 'properties/777', displayName: 'Cliente Antigo (migrado)' }];
    gtmExistentes = []; recaptchaExistentes = [];
    const rStream = await criar(['analytics']);
    check('varreu os data streams quando o nome não bateu', chamadas.includes('ga:dataStreams.list'), chamadas.join());
    check('achou pelo domínio do stream e não criou', !chamadas.includes('ga:properties.create'), chamadas.join());
    check('e reaproveitou', rStream.result?.reaproveitados.includes('Analytics'), JSON.stringify(rStream.result?.reaproveitados));

        // Duplicata é ambígua: não escolhe nem cria.
    gaExistentes = [
      { property: 'properties/555', displayName: 'teste.com.br' },
      { property: 'properties/556', displayName: 'teste.com.br' },
    ];
    const r3 = await criar(['analytics']);
    check('duas propriedades iguais param a etapa', r3.ok === false, JSON.stringify(r3.result));
    check('e o erro diz para apagar a que não serve', /ambíguo|apague/i.test(r3.error || ''), r3.error);
    check('sem criar nada no meio', !chamadas.includes('ga:properties.create'), chamadas.join());

    gaExistentes = []; gtmExistentes = []; recaptchaExistentes = [];
    const r4 = await criar(['analytics', 'recaptcha']);
    check('sem nada existindo, volta a criar', chamadas.includes('ga:properties.create') && chamadas.includes('recaptcha:keys.create'));
    check('e não relata reaproveitamento', r4.result.reaproveitados.length === 0, JSON.stringify(r4.result.reaproveitados));
  }

  console.log('\n=== Modo vincular: acha, mas não cria (ADR-047) ===');
  {
    gaExistentes = []; gtmExistentes = []; recaptchaExistentes = [];
    const v1 = await criar(['analytics', 'gtm', 'recaptcha'], { apenasExistentes: true });
    check('não cria propriedade quando não achou', !chamadas.includes('ga:properties.create'), chamadas.join());
    check('nem data stream', !chamadas.includes('ga:dataStreams.create'), chamadas.join());
    check('nem container', !chamadas.includes('gtm:containers.create'), chamadas.join());
    check('nem chave reCAPTCHA', !chamadas.includes('recaptcha:keys.create'), chamadas.join());
    check('e devolve vazio em vez de id novo', !v1.result.idAnalytics, v1.result.idAnalytics);
    check('relata o que faltou',
      ['Analytics', 'Tag Manager', 'reCAPTCHA'].every((x) => v1.result.faltando.includes(x)),
      JSON.stringify(v1.result.faltando));

    // O caso real do vínculo em massa: a propriedade se chama "x - GA4".
    gaExistentes = [{ property: 'properties/555', displayName: 'teste.com.br - GA4' }];
    gtmExistentes = [{ name: 'teste.com.br', publicId: 'GTM-JAEXISTIA', containerId: '9', path: 'accounts/7/containers/9' }];
    recaptchaExistentes = [{ name: 'projects/p/keys/6Lc-JAEXISTIA', displayName: 'teste.com.br' }];
    const v2 = await criar(['analytics', 'gtm', 'recaptcha'], { apenasExistentes: true });
    check('acha a propriedade com sufixo " - GA4"', v2.result.idAnalytics === 'G-JAEXISTIA', v2.result.idAnalytics);
    check('acha o container', v2.result.tagmanager === 'GTM-JAEXISTIA', v2.result.tagmanager);
    check('acha a chave', v2.result.siteKey === '6Lc-JAEXISTIA', v2.result.siteKey);
    check('sem faltar nada', v2.result.faltando.length === 0, JSON.stringify(v2.result.faltando));
    check('e sem criar nada',
      !['ga:properties.create', 'gtm:containers.create', 'recaptcha:keys.create'].some((c) => chamadas.includes(c)),
      chamadas.join());

    // Container batizado pelo domínio declarado, não pelo nome.
    gaExistentes = [{ property: 'properties/555', displayName: 'teste.com.br' }];
    gtmExistentes = [{ name: 'Container antigo', domainName: ['www.teste.com.br'], publicId: 'GTM-PORDOMINIO', containerId: '9', path: 'accounts/7/containers/9' }];
    const v3 = await criar(['analytics', 'gtm'], { apenasExistentes: true });
    check('acha o container pelo domínio declarado', v3.result.tagmanager === 'GTM-PORDOMINIO', v3.result.tagmanager);

    // Sem o modo ligado, nada muda: continua criando.
    gaExistentes = []; gtmExistentes = []; recaptchaExistentes = [];
    const v4 = await criar(['analytics', 'recaptcha']);
    check('fora do modo vincular, cria como sempre', chamadas.includes('ga:properties.create'), chamadas.join());
    check('e faltando vem vazio', v4.result.faltando.length === 0, JSON.stringify(v4.result.faltando));
  }

  console.log('\n=== Dependência do GTM ===');
  r = await criar(['gtm']);
  check('GTM sem GA4 é recusado', r.ok === false, JSON.stringify(r.result));
  check('erro nomeia as duas etapas', /Tag Manager/.test(r.error) && /GA4/.test(r.error), r.error);
  check('e não chamou nada antes de recusar', !chamadas.includes('gtm:containers.create'), chamadas.join());

  console.log('\n=== Nenhuma etapa ===');
  r = await criar([]);
  check('lista vazia é recusada', r.ok === false);
  check('com instrução no erro', /marque/i.test(r.error), r.error);
  check('sem nenhuma chamada de API', chamadas.length === 0, chamadas.join());

  console.log('\n=== Compatibilidade ===');
  r = await handlers['google:createProject'](null, { domain: 'teste.com.br', saPath: SA, brand: 'bc' });
  check('chamada antiga (sem steps) roda tudo', r.ok === true && r.result.steps.length === 4, r.result?.steps?.join());

  Module._load = orig;
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
