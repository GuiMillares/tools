// Harness de verificação visual (ADR-012).
//
// Carrega o renderer REAL no Chromium com um window.api falso, dirige cada tela
// com dados de mentira e tira screenshot — inclusive dos hovers de cada variante
// de botão. Serve pra mexer no CSS sem abrir o Electron a cada ajuste.
//
// Não faz parte do app empacotado. Pra usar:
//
//     npm i -D playwright && npx playwright install chromium
//     node tools/preview.js [pasta-de-saida]
//
// Sai com código 1 se aparecer erro de console em qualquer tela.
//
// ATENÇÃO: o preload.js real não roda aqui. Quando window.api ganhar um método
// novo, ele precisa ser adicionado no STUB abaixo — senão a tela quebra no
// preview e não no app.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = process.argv[2] || 'shots';
const ROOT = path.join(__dirname, '..');
const RENDERER = 'file://' + path.join(ROOT, 'renderer', 'index.html');

const STUB = () => {
  const noop = async () => ({ ok: true });
  window.api = {
    saveCreds: noop,
    loadCreds: async () => ({ ok: true, creds: { email: 'guilherme@idealtrends.com.br', token: 'x' } }),
    clearCreds: noop,
    fetchPr: async () => ({ ok: true, pr: {} }),
    mergePr: noop,
    copyToClipboard: noop,
    getMergeHistory: async () => ({ ok: true, entries: [] }),
    getMsConfig: async () => ({ ok: true, config: { clientId: 'abc-123', tenant: 'common' } }),
    setMsConfig: noop,
    msStatus: async () => ({ ok: true, connected: true, email: 'everton.lima@buscacliente.com.br' }),
    msLogin: noop,
    msLogout: noop,
    cancelMsLogin: noop,
    onMsUrl: () => () => {},
    sendMailBatch: async () => ({ ok: true, enviados: [], falhas: [], total: 0, log: [] }),
    checkDnsBatch: async ({ domains }) => ({
      ok: true, log: [],
      resultados: domains.map((d, i) => {
        const cenarios = [
          { status: 'm3', label: 'M3 Solutions', ips: ['149.18.103.30'] },
          { status: 'vesta', label: 'Vesta', ips: ['169.57.141.12'] },
          { status: 'outro', label: 'Não aponta para nós', ips: ['203.0.113.9'] },
          { status: 'erro', label: 'Não resolveu', ips: [], detail: 'ENOTFOUND' },
          { status: 'misto', label: 'IPs em faixas diferentes', ips: ['149.18.103.4', '203.0.113.9'] },
        ];
        return { dominio: d, host: d, ...cenarios[i % cenarios.length] };
      }),
    }),
    dnsHistory: async ({ domains }) => ({
      ok: true, log: [],
      resultados: domains.map((d) => ({
        dominio: d, ok: true,
        linhas: [], nossas: [{ ips: ['149.18.103.7'], first_seen: '2022-05-10', last_seen: '2025-01-31', grupos: ['M3 Solutions'], nosso: true }],
      })),
    }),
    dnsHistStatus: async () => ({ ok: true, configured: true }),
    setDnsHistKey: noop,
    painelStatus: async () => ({ ok: true, configured: true, email: 'guilherme@idealtrends.com.br' }),
    salesforceGetConfig: async () => ({
      ok: true,
      conectado: true,
      usuario: 'Guilherme Millares',
      email: 'guilherme.millares@buscacliente.com.br',
      config: { dominio: 'grupo-ideal-trends.my.salesforce.com', assuntoMigracao: 'Publicação (troca de DNS) - {dominio}', comentarioMigracao: '{dominio}', textoFeed: 'Site publicado' },
    }),
    salesforceSetConfig: async () => ({ ok: true }),
    salesforceConectar: async () => ({ ok: true, nome: 'Guilherme Millares' }),
    salesforceDesconectar: async () => ({ ok: true }),
    salesforceDiagnostico: async () => ({ ok: true, log: [] }),
    salesforceFecharTarefa: async () => ({ ok: true, log: [] }),
    salesforceCriarTarefaNoCaso: async () => ({ ok: true, log: [], taskId: '00Tstub', casoNumero: '00088671' }),
    onSalesforceUrl: () => () => {},
    setPainelCreds: noop,
    clearPainelSession: noop,
    prepareSearchConsole: async () => ({ ok: true, log: [], ownerAdded: 'bcrelatoriotags@gmail.com', sitemapOk: true }),
    syncPainel: async () => ({ ok: true, log: [], feitos: [{ bloco: 'google-analytics', mensagem: 'Sincronizado.' }], falhas: [], relatorio: null }),
    addMergeHistory: async (entry) => ({ ok: true, entry }),
    removeMergeHistory: noop,
    clearMergeHistory: noop,
    getHubState: async () => ({ ok: true, state: { recents: ['newproject', 'merge'], bitbucketWorkspace: 'idealtrends', brand: 'bc' } }),
    setHubState: noop,
    getGoogleConfig: async () => ({ ok: true, config: { saPath: 'C:\\Users\\guilherme\\sa.json' } }),
    setGoogleConfig: noop,
    createGoogleProject: noop,
    getPublicacaoConfig: async () => ({ ok: true, config: { hestiaIpPublico: '149.18.102.39', hestiaServidorPadrao: '11', hestiaServidores: { 11: '192.168.3.143', 13: '192.168.3.157' } }, empresas: { bc: { cloudflareToken: true, registrobrUsuario: 'ABC123', registrobrSenha: true }, mpisolutions: {} } }),
    setPublicacaoConfig: async () => ({ ok: true }),
    fotografarDns: noop, conferirNs: noop, verificarCloudflare: noop, aplicarCloudflare: noop, publicarPainel: noop, registrobrConsultar: noop, registrobrTrocarNs: noop, registrarPlanilha: noop,
    lerPlanilha: async ({ texto }) => ({ ok: true, linhas: String(texto || '').split(/\r?\n/).filter(Boolean).map((l) => l.split(/[;\t,]/)) }),
    verifySearchConsole: noop,
    findExistingGoogle: noop,
    commitGeralPhp: noop,
    getOauthConfig: async () => ({ ok: true, config: { clientId: 'a.apps.googleusercontent.com', clientSecret: 's' } }),
    setOauthConfig: noop,
    oauthStatus: async () => ({ ok: true, connected: true, email: 'guilherme@idealtrends.com.br' }),
    brandOauthStatus: async () => ({ ok: true, marcas: {
      bc: { connected: true, durable: true, email: 'bcrelatorios@gmail.com', esperado: 'bcrelatorios@gmail.com' },
      mpisolutions: { connected: false, esperado: 'ferramentasmpisolutions@gmail.com' },
      mpiplus: { connected: true, durable: false, email: 'bcrelatoriotags@gmail.com', esperado: 'bcrelatoriotags@gmail.com' },
    } }),
    oauthLogin: noop,
    cancelOauthLogin: noop,
    onOauthUrl: () => () => {},
    oauthLogout: noop,
    listBrandAccounts: noop,
    grantAccessBulk: noop,
  };
};

// Dados de mentira para as telas que só existem depois de uma chamada de rede.
const FIXTURES = {
  queue: [
    { id: 'a1', localOnly: true, url: 'u', status: 'ready', workspace: 'idealtrends', repo: 'layoutcenografia.com.br', title: 'Ajustes na home e no formulário de contato', author: 'Guilherme Millares', sourceBranch: 'feature/home', destBranch: 'master', approvals: 1, buildState: 'SUCCESSFUL' },
    { id: 'a2', url: 'u', status: 'merged', workspace: 'idealtrends', repo: 'clinicasaovicente.com.br', title: 'Sobe páginas internas', author: 'Ana Paula', sourceBranch: 'develop', destBranch: 'master', approvals: 2, buildState: 'SUCCESSFUL' },
    { id: 'a3', url: 'u', status: 'ready', workspace: 'idealtrends', repo: 'transportesnorte.com.br', title: 'Correção do reCAPTCHA', author: 'Rafael', sourceBranch: 'fix/recaptcha', destBranch: 'master', approvals: 0, buildState: 'FAILED' },
    { id: 'a4', url: 'https://bitbucket.org/x/y/pull-requests/9', status: 'error', error: 'Falha ao buscar PR #9: HTTP 404' },
  ],
  createResult: {
    domain: 'layoutcenografia.com.br',
    steps: ['analytics', 'gtm', 'recaptcha', 'searchconsole'],
    idAnalytics: 'G-7HQ2M4XKPL',
    tagmanager: 'GTM-N9WK4T2',
    googleSearchConsole: 'x8Kd2mQvR7pLnT4wZs1YbG5hJc3eA6fU',
    siteKey: '6Lc9xYzAAAAAJk2mNp4qRs7tUv0wXy1zAbCdEfGh',
    secretKey: '6Lc9xYzAAAAAB2cD3eF4gH5iJ6kL7mN8oP9qRsT',
    siteUrl: 'https://layoutcenografia.com.br/',
    gtmSummary: { builtIn: 10, variables: 1, triggers: 15, tags: 15, falhas: [] },
  },
  find: {
    ok: true,
    query: 'clinicasaovicente.com.br',
    analytics: [
      { account: 'BC Relatórios 3', property: 'properties/1', displayName: 'clinicasaovicente.com.br', measurementIds: [{ measurementId: 'G-4KP8N2WQXR', uri: 'https://clinicasaovicente.com.br', displayName: 'Site' }] },
    ],
    gtm: [
      { account: 'BC Relatórios 3', name: 'clinicasaovicente.com.br', publicId: 'GTM-KX7M9P4', path: 'p', domains: ['clinicasaovicente.com.br', 'www.clinicasaovicente.com.br'] },
    ],
  },
  history: [
    {
      id: 'h1', at: new Date(Date.now() - 45 * 60000).toISOString(),
      workspace: 'idealtrends', repo: 'layoutcenografia.com.br', prId: '42',
      title: 'Ajustes na home e no formulário de contato', author: 'Guilherme Millares',
      sourceBranch: 'feature/home', destBranch: 'master',
      approvals: 1, buildState: 'SUCCESSFUL', strategy: 'merge_commit', closeSourceBranch: true,
      ok: true, mergedHash: '9f2c1ab7d4e6', error: null,
      log: [
        { ts: '14:12:03', message: 'POST merge → idealtrends/layoutcenografia.com.br #42 (merge_commit)', type: 'cmd' },
        { ts: '14:12:05', message: 'PR #42 mergeado com sucesso (9f2c1ab7)', type: 'success' },
      ],
    },
    {
      id: 'h2', at: new Date(Date.now() - 26 * 3600000).toISOString(),
      workspace: 'idealtrends', repo: 'transportesnorte.com.br', prId: '17',
      title: 'Correção do reCAPTCHA', author: 'Rafael',
      sourceBranch: 'fix/recaptcha', destBranch: 'master',
      approvals: 0, buildState: 'FAILED', strategy: 'squash', closeSourceBranch: false,
      ok: false, mergedHash: null,
      error: 'o branch de destino foi atualizado desde o último push, refaça o merge',
      log: [
        { ts: '09:41:18', message: 'POST merge → idealtrends/transportesnorte.com.br #17 (squash)', type: 'cmd' },
        { ts: '09:41:20', message: 'Falha ao mergear PR #17: o branch de destino foi atualizado desde o último push, refaça o merge', type: 'error' },
      ],
    },
  ],
  logs: [
    ['Hub iniciado.', 'info'],
    ['Sessão do Bitbucket carregada para guilherme@idealtrends.com.br.', 'info'],
    ['Iniciando criação de propriedades para layoutcenografia.com.br', 'cmd'],
    ['Projeto: Busca Cliente', 'info'],
    ['GET contas do Analytics de Busca Cliente', 'cmd'],
    ['Conta do Analytics: BC Relatórios 4 (37 propriedades) — a mais vazia entre as 5 da marca', 'info'],
    ['POST criar propriedade GA4 → layoutcenografia.com.br', 'cmd'],
    ['Propriedade GA4 criada: properties/512883014', 'success'],
    ['POST criar data stream web', 'cmd'],
    ['Measurement ID: G-7HQ2M4XKPL', 'success'],
    ['GET containers existentes (checando duplicidade)', 'cmd'],
    ['JÁ EXISTE um container chamado "layoutcenografia.com.br" (GTM-T4R8K2M). Criando um novo mesmo assim — confira e limpe manualmente depois.', 'warn'],
    ['POST criar container GTM → layoutcenografia.com.br', 'cmd'],
    ['GTM publicado: GTM-N9WK4T2', 'success'],
    ['ETAPA DO RECAPTCHA FALHOU: Permission denied on resource project hub-automacao. Pulando pra próxima etapa — crie a chave manualmente depois.', 'warn'],
    ['Commitando geral.php de layoutcenografia.com.br — mensagem "Ajustes para publicação"', 'cmd'],
    ['Repositório: idealtrends/layoutcenografia.com.br (branch master)', 'info'],
    ['Commit "Ajustes para publicação" enviado ($idAnalytics, $tagmanager).', 'success'],
    ['Falha ao mergear PR #42: o branch de destino foi atualizado, refaça o merge.', 'error'],
  ],
};

const SCENES = {
  home: async (page) => {
    await page.evaluate(() => { state.view = 'home'; render(); });
  },
  historico: async (page, f) => {
    await page.evaluate((f) => {
      state.view = 'merge'; state.mergeMode = 'history'; state.history = f.history; render();
    }, f);
    await page.locator('.log-excerpt').first().click();
  },
  merge: async (page, f) => {
    await page.evaluate(() => { state.mergeMode = 'queue'; });
    await page.evaluate((f) => { state.view = 'merge'; state.queue = f.queue; render(); }, f);
  },
  criar: async (page, f) => {
    await page.evaluate((f) => {
      state.view = 'newproject'; render();
      renderNpCreateResult(document.getElementById('npResult'), f.createResult);
    }, f);
  },
  'criar-mpiplus': async (page, f) => {
    await page.evaluate((f) => {
      state.brand = 'mpiplus';
      state.view = 'newproject'; render();
      renderNpCreateResult(document.getElementById('npResult'), {
        ...f.createResult,
        domain: 'clinicahumanizzi.com.br',
        steps: ['analytics', 'recaptcha', 'searchconsole'],
        tagmanager: '',
        gtmSummary: null,
        searchConsolePainel: 'google-site-verification: google8349c1294923c797.html',
      });
      document.getElementById('npResult').scrollIntoView({ block: 'start' });
    }, f);
  },
  buscar: async (page, f) => {
    await page.evaluate((f) => {
      state.brand = 'bc';
      state.view = 'findproject';
      state.npFind = f.find; state.npPicked = autoPickedValues(f.find);
      render();
      document.getElementById('npSearchInput').value = f.find.query;
    }, f);
  },
  acesso: async (page) => {
    await page.evaluate(() => {
      state.view = 'grantaccess'; render();
      document.getElementById('gaAccountIds').value = '312884706\n298117403\n455920188\n501773624';
    });
  },
  suspender: async (page) => {
    await page.evaluate(() => {
      state.view = 'suspender'; render();
      document.getElementById('mailDomains').value =
        'layoutcenografia.com.br\nclinicasaovicente.com.br\ntransportesnorte.com.br\n' +
        'padariadobairro.com.br\nmetalurgicasul.com.br';
    });
    await page.click('#mailCheckBtn');
    await page.waitForSelector('#mailSendBtn');
    await page.click('[data-historico="outro"]');
  },
  vincular: async (page) => {
    await page.evaluate(() => {
      state.brand = 'mpiplus';
      state.view = 'bulk';
      render();
      const P = 'https://idealplus.idealtrends.io/clientes/2775/hub?projeto=2851&tab=publicacao';
      const C = 'https://grupo-ideal-trends.lightning.force.com/lightning/r/Case/500bL00000cWRcEQAW/view';
      carregarBulk(
        [
          ['Razão Social', 'Domínio', 'Link do painel', 'Link do caso'],
          ['Serviços 2EMS Ltda', 'servicos2ems.com.br', P, C],
          ['Starex Emergências', 'starexemergencias.com.br', P, C],
          ['Carste Engenharia', 'carste.com.br', P, ''],
          ['Nobre Frutas', 'nobrefrutas.com.br', P, C],
          ['Sem Link Comércio', 'semlink.com.br', '', ''],
        ],
        'clientes-mpiplus.xlsx'
      );
      // Uma rodada pela metade, que é o estado em que a tela mais é lida.
      bulkRows[0].status = 'ok'; bulkRows[0].detalhe = 'G-7HQ2M4XKPL';
      bulkRows[1].status = 'parcial'; bulkRows[1].detalhe = 'não existia: reCAPTCHA';
      bulkRows[2].status = 'rodando';
      renderBulkLista();
    });
  },
  publicar: async (page) => {
    await page.evaluate(() => {
      state.view = 'publish'; render();
      const D = 'clinicahumanizzi.com.br';
      pub.dominio = D;
      pub.painelUrl = 'https://idealplus.idealtrends.io/clientes/2621/hub?projeto=2682&tab=publicacao';
      // O que a Cloudflare varreu (com proxy ligado, como ela faz) e o que a
      // fotografia acrescentou (DKIM).
      pub.existentes = [
        { id: 'r1', type: 'A', name: D, content: '200.1.1.1', proxied: true },
        { id: 'r2', type: 'CNAME', name: `www.${D}`, content: D, proxied: true },
        { id: 'r3', type: 'CNAME', name: `webmail.${D}`, content: D },
        { id: 'r4', type: 'MX', name: D, content: D, priority: 10 },
        { id: 'r5', type: 'TXT', name: D, content: 'v=spf1 a mx ~all' },
        { id: 'r6', type: 'A', name: `erp.${D}`, content: '10.0.0.7' },
      ];
      pub.foto = { registros: [
        { type: 'A', name: D, content: '200.1.1.1' },
        { type: 'TXT', name: `default._domainkey.${D}`, content: 'v=DKIM1; k=rsa; p=MIGf...' },
      ] };
      pub.zona = { ipAntigo: '200.1.1.1', ipNovo: '149.18.102.39', avisos: [], remover: [{ type: 'MX', name: D, content: D }], registros: [
        { type: 'A', name: D, content: '149.18.102.39', origem: 'raiz para o servidor novo' },
        { type: 'CNAME', name: `www.${D}`, content: D, origem: 'www acompanha a raiz' },
        { type: 'A', name: `webmail.${D}`, content: '200.1.1.1', origem: 'era CNAME para a raiz, virou A para o IP antigo' },
        { type: 'MX', name: D, content: `mail.${D}`, priority: 10, origem: 'MX era a raiz, virou mail.<dominio>' },
        { type: 'TXT', name: D, content: 'v=spf1 a mx ~all', origem: 'copiado' },
        { type: 'A', name: `erp.${D}`, content: '10.0.0.7', origem: 'copiado' },
        { type: 'TXT', name: `default._domainkey.${D}`, content: 'v=DKIM1; k=rsa; p=MIGf...', origem: 'copiado' },
        { type: 'A', name: `mail.${D}`, content: '200.1.1.1', origem: 'criado para o MX: IP antigo' },
      ] };
      pub.plano = {
        atualizar: [
          { id: 'r1', type: 'A', name: D, content: '149.18.102.39', antes: '200.1.1.1' },
          { id: 'r2', type: 'CNAME', name: `www.${D}`, content: D, antes: D, motivo: 'desligar o proxy' },
          { id: 'r3', type: 'A', name: `webmail.${D}`, content: '200.1.1.1', antes: D },
        ],
        criar: [
          { type: 'MX', name: D, content: `mail.${D}`, priority: 10 },
          { type: 'TXT', name: `default._domainkey.${D}`, content: 'v=DKIM1; k=rsa; p=MIGf...' },
          { type: 'A', name: `mail.${D}`, content: '200.1.1.1' },
        ],
        remover: [{ id: 'r4', type: 'MX', name: D, content: D, priority: 10, motivo: 'MX substituído pela proposta' }],
        manter: [{ id: 'r5' }, { id: 'r6' }],
        sobras: [],
      };
      pub.cloudflare = { zoneId: 'z1', nameservers: ['ana.ns.cloudflare.com', 'bob.ns.cloudflare.com'], status: 'pending', criada: true };
      pub.feitas.contato = { ok: true, detalhe: 'contato técnico BCTDL, Busca Cliente; DNS por nossa conta' };
      pub.empresa = 'bc';
      pub.dnsNosso = true;
      pub.feitas.dns = { ok: true, detalhe: 'zona criada, scan trouxe 6; 8 registro(s) na zona final, muda 3, cria 3, remove 1, mantém 2; IP antigo 200.1.1.1' };
      pub.etapa = 'cloudflare';
      renderPublishTool();
    });
  },
  pergunta: async (page) => {
    await page.evaluate(() => {
      state.view = 'publish'; render();
      perguntarNoTerminal('De qual empresa é clinicahumanizzi.com.br? O contato técnico no Registro.br não é nosso, então não dá para descobrir. Isso decide a aba da planilha.', [{ valor: 'bc', rotulo: 'Busca Cliente (aba Busca Cliente)' }, { valor: 'mpisolutions', rotulo: 'MPI Solutions (aba MPI)' }]);
    });
  },
  ssl: async (page) => {
    await page.evaluate(() => {
      suspendCheck = null;
      state.view = 'ssl'; render();
      document.getElementById('mailDomains').value =
        'layoutcenografia.com.br\nclinicasaovicente.com.br\ntransportesnorte.com.br';
    });
    await page.click('#mailCheckBtn');
    await page.waitForSelector('#mailSendBtn');
  },
  config: async (page) => {
    await page.evaluate(() => { state.view = 'home'; render(); openSettings(); });
  },
  'config-salesforce': async (page) => {
    await page.evaluate(() => { state.view = 'home'; render(); openSettings(); });
    await page.waitForTimeout(250);
    await page.evaluate(() => { document.getElementById('sfStatus')?.scrollIntoView({ block: 'center' }); });
  },
  'config-contas': async (page) => {
    await page.evaluate(async () => {
      state.view = 'home'; render(); openSettings();
      state.brandAccounts = {
        bc: 'bcrelatorios@gmail.com',
        mpisolutions: 'ferramentasmpisolutions@gmail.com',
        mpiplus: 'bcrelatoriotags@gmail.com',
      };
      await renderBrandOauth();
      // Mostra o marco de cima ("Conta do Google, por marca") junto, para dar
      // para achar a seção rolando a tela.
      const rotulos = Array.from(document.querySelectorAll('.modal .section-label'));
      const alvo = rotulos.find((x) => /Conta do Google/i.test(x.textContent));
      if (alvo) alvo.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(200);
  },
};

(async () => {
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.HUB_CHROME || undefined });
  const page = await browser.newPage({ viewport: { width: 1240, height: Number(process.env.HUB_ALTURA) || 800 }, deviceScaleFactor: 2 });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.addInitScript(STUB);
  await page.goto(RENDERER);
  await page.waitForFunction(() => typeof render === 'function' && document.getElementById('toolGrid'));

  // Terminal com histórico realista em todas as telas.
  await page.evaluate((f) => {
    document.getElementById('terminal').innerHTML = '';
    for (const [m, t] of f.logs) log(m, t);
  }, FIXTURES);

  for (const [name, run] of Object.entries(SCENES)) {
    await run(page, FIXTURES);
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(ROOT, OUT, `${name}.png`) });
    // Rolagem lateral no painel esquerdo é defeito de layout, não de dado:
    // um botão a mais na linha já provoca (ADR-072). Conta como erro.
    const estouro = await page.evaluate(() => {
      const p = document.getElementById('leftPanel');
      return p && p.scrollWidth > p.clientWidth + 1 ? `${p.scrollWidth} > ${p.clientWidth}` : '';
    });
    if (estouro) errors.push(`rolagem lateral no painel esquerdo na cena "${name}" (${estouro})`);
  }

  // Hovers: prova que cada variante de botão reage de um jeito diferente.
  // A cena do vínculo em massa troca a marca; os hovers são da Busca Cliente,
  // que é quem tem botão de commit.
  await page.evaluate(() => { closeSettings(); state.brand = 'bc'; });
  await SCENES.criar(page, FIXTURES);
  for (const [name, sel] of [
    ['hover-primary', '#npCommitBtn'],
    ['hover-copy', '#npCopyTemplateBtn'],
    ['hover-ghost', '#npVerifyBtn'],
  ]) {
    await page.hover(sel);
    await page.waitForTimeout(250);
    const box = await page.locator('#npResult').boundingBox();
    await page.screenshot({ path: path.join(ROOT, OUT, `${name}.png`), clip: box });
  }

  await browser.close();
  if (errors.length) {
    console.log('ERROS NO CONSOLE:\n' + errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('ok — sem erros de console');
  }
})();
