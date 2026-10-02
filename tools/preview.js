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
    manterAcordado: async () => ({ ok: true }),
    gravarLog: async () => ({ ok: true }),
    abrirPastaLogs: async () => ({ ok: true }),
    salvarRodada: async () => ({ ok: true }),
    lerRodada: async () => ({ ok: true, estado: null }),
    apagarRodada: async () => ({ ok: true }),
    procurarNaPlanilha: async () => ({ ok: true, log: [], achado: null }),
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
    // O que o preload.js ganhou depois e faltava aqui (ADR-012): sem o
    // doutorStatus, a tela de configurações quebrava no preview.
    doutorStatus: async () => ({ ok: true, configured: true, emailMpi: 'doutor@mpisolutions.com.br', emailBusca: 'doutor@buscacliente.com.br', temSenha: true }),
    doutorSetCreds: noop,
    doutorBloquear: noop,
    pararProcesso: noop,
    liberarProcesso: noop,
    clearEmpresa: noop,
    conferirApontamento: noop,
    montarZonaCloudflare: noop,
    exportarPlanilha: noop,
    acharContratoNoPainel: noop,
    listGtmBrandAccounts: noop,
    grantGtmAccessBulk: noop,
    usuarioLogado: async () => ({ ok: true, nome: 'Guilherme Millares', fonte: 'salesforce' }),
    recursos: async () => ({ ok: true, memMb: 420 }),
    // Redesign v2.4 (ADR-115)
    telemetria: async () => ({ ok: true, memMb: 420, cpuPct: 1.2, processos: 6, pid: 18492 }),
    executarComando: async () => ({ ok: true, pid: 1 }),
    pararComando: async () => ({ ok: true }),
    abrirLink: async () => ({ ok: true }),
    onComandoSaida: () => () => {},
    // Git Bash (ADR-128): o dublê guarda quem recebe a saída, e a cena manda
    // um prompt de mentira por ele.
    bashAbrir: async () => ({ ok: true, shell: 'C:\\Git\\bin\\bash.exe', pid: 4242, build: 26200 }),
    bashEscrever: () => {},
    bashTamanho: () => {},
    bashFechar: async () => ({ ok: true, fechou: true }),
    onBashDados: (cb) => { window.__bashDados = cb; return () => {}; },
    onBashSaiu: () => () => {},
    statusCredenciais: async () => ({ ok: true, hestia: { ip: '149.18.102.39', servidor: '192.168.3.143' }, itens: [
      { id: 'bitbucket', nome: 'Bitbucket API', ok: true, detalhe: 'API Token gravado (DPAPI)' },
      { id: 'google_sa', nome: 'Google Service Account', ok: true, detalhe: 'hub-automacao.json' },
      { id: 'google_oauth', nome: 'Google OAuth Client', ok: true, detalhe: 'Client ID + Secret' },
      { id: 'salesforce', nome: 'Salesforce', ok: true, detalhe: 'Guilherme Millares' },
      { id: 'microsoft', nome: 'Microsoft Graph', ok: true, detalhe: 'guilherme.millares@buscacliente.com.br' },
      { id: 'cloudflare_bc', nome: 'Cloudflare · Busca Cliente', ok: true, detalhe: 'token gravado' },
      { id: 'cloudflare_mpi', nome: 'Cloudflare · MPI Solutions', ok: true, detalhe: 'token gravado' },
      { id: 'registrobr_bc', nome: 'Registro.br · Busca Cliente', ok: true, detalhe: 'BCTDL' },
      { id: 'registrobr_mpi', nome: 'Registro.br · MPI Solutions', ok: false, detalhe: 'sem login' },
      { id: 'painel', nome: 'Painel MPI+', ok: true, detalhe: 'guilherme@idealtrends.com.br' },
      { id: 'doutor', nome: 'Painel /doutor', ok: true, detalhe: 'sig@mpisolutions.com.br' },
      { id: 'dnshist', nome: 'Histórico de DNS (WhoisXML)', ok: false, detalhe: 'opcional' },
    ] }),
    salesforceMoverTarefa: async () => ({ ok: true, log: [], status: 'In Progress', rotulo: 'Em andamento', assumida: true }),
    // Indicadores da home (ADR-138): 160 tarefas suas espalhadas pelo último
    // ano, determinísticas, um terço de publicação, um quarto ainda aberta.
    salesforceMetricas: async () => {
      const t = [];
      const agora = Date.now();
      for (let i = 0; i < 160; i++) {
        const criada = new Date(agora - ((i * 37) % 360) * 86400000 - (i % 24) * 3600000 - 5 * 3600000);
        const fechada = i % 4 !== 0;
        const dur = (6 + (i * 13) % 90) * 3600000;
        t.push({ id: 'T' + i, assunto: i % 3 === 0 ? 'Publicação (Troca de DNS) - site' + i + '.com.br' : 'Alt - site' + i + '.com.br', fechada, status: fechada ? 'Completed' : 'Not Started', criada: criada.toISOString(), concluida: fechada ? new Date(Math.min(agora - 3600000, criada.getTime() + dur)).toISOString() : null, publicacao: i % 3 === 0, dono: 'Guilherme Millares', donoTipo: 'User' });
      }
      return { ok: true, log: [], eu: { id: '005A', nome: 'Guilherme Millares' }, tarefas: t, dias: 366, comConclusao: true, agora: new Date().toISOString() };
    },
    salesforceTarefas: async () => ({ ok: true, log: [], instancia: 'https://grupo-ideal-trends.my.salesforce.com',
      eu: { id: '005A', nome: 'Guilherme Millares', email: 'guilherme.millares@buscacliente.com.br' },
      filas: [{ id: '00GA', nome: 'Deploy Busca Cliente', marca: 'bc' }, { id: '00GB', nome: 'Deploy MPI Solutions', marca: 'mpisolutions' }],
      colunas: { afazer: { api: 'Not Started', rotulo: 'A fazer' }, andamento: { api: 'In Progress', rotulo: 'Em andamento' }, concluido: { api: 'Completed', rotulo: 'Concluído' } },
      tarefas: [
        { id: '00T1', assunto: 'Site Pisteker Eletricidade', status: 'Not Started', coluna: 'afazer', fechada: false, prazo: new Date().toISOString().slice(0, 10), fila: '00GA', donoId: '00GA', dono: 'Deploy Busca Cliente', relativo: 'Pisteker Eletricidade', relativoTipo: 'Case', minha: false, autor: 'Ana Paula', criada: '2026-09-25T13:10:00.000Z', descricao: 'Publicar o site novo em pisteker.com.br.\nDNS já está na Cloudflare da Busca Cliente; falta aprovar no painel, ativar o SSL e vincular as tags.\nCliente pediu retorno até sexta.' },
        { id: '00T2', assunto: 'PR #412 aprovado - layoutcenografia.com.br', status: 'In Progress', coluna: 'andamento', fechada: false, prazo: null, fila: '00GA', donoId: '00GA', dono: 'Deploy Busca Cliente', relativo: 'Layout Cenografia', relativoTipo: 'Case', minha: false },
        { id: '00T3', assunto: 'Commit geral.php - clinicasaovicente.com.br', status: 'Not Started', coluna: 'afazer', fechada: false, prazo: '2026-10-02', fila: '00GA', donoId: '00GA', dono: 'Deploy Busca Cliente', relativo: '', relativoTipo: '', minha: false },
        { id: '00T4', assunto: 'BFW Soluções - publicação', status: 'Not Started', coluna: 'afazer', fechada: false, prazo: new Date(Date.now() + 86400000).toISOString().slice(0, 10), fila: '00GB', donoId: '00GB', dono: 'Deploy MPI Solutions', relativo: 'BFW Soluções', relativoTipo: 'Case', minha: false },
        { id: '00T5', assunto: 'DNS Cloudflare - anrservicos.com.br', status: 'In Progress', coluna: 'andamento', fechada: false, prazo: null, fila: '00GB', donoId: '00GB', dono: 'Deploy MPI Solutions', relativo: 'ANR Serviços', relativoTipo: 'Case', minha: false },
        { id: '00T6', assunto: 'Tags GA4 / GTM - bfwsolucoes.com.br', status: 'Not Started', coluna: 'afazer', fechada: false, prazo: null, fila: '00GB', donoId: '00GB', dono: 'Deploy MPI Solutions', relativo: '', relativoTipo: '', minha: false },
        { id: '00T7', assunto: 'reCAPTCHA v3 - pisteker.com.br', status: 'Not Started', coluna: 'afazer', fechada: false, prazo: null, fila: '00GB', donoId: '00GB', dono: 'Deploy MPI Solutions', relativo: '', relativoTipo: '', minha: false },
        { id: '00T8', assunto: 'Ajuste de SSL e certificado wildcard Pisteker', status: 'In Progress', coluna: 'andamento', fechada: false, prazo: new Date().toISOString().slice(0, 10), fila: null, donoId: '005A', dono: 'Guilherme Millares', relativo: 'Pisteker Eletricidade', relativoTipo: 'Case', minha: true },
        { id: '00T9', assunto: 'Subdomínio institucional BFW Soluções e landing page', status: 'Not Started', coluna: 'afazer', fechada: false, prazo: new Date(Date.now() + 86400000).toISOString().slice(0, 10), fila: null, donoId: '005A', dono: 'Guilherme Millares', relativo: 'BFW Soluções', relativoTipo: 'Case', minha: true },
        { id: '00TA', assunto: 'Publicação V1 -> V2 - nobrefrutas.com.br', status: 'Completed', coluna: 'concluido', fechada: true, prazo: null, fila: null, donoId: '005A', dono: 'Guilherme Millares', relativo: 'Nobre Frutas', relativoTipo: 'Case', minha: true },
        { id: '00TB', assunto: 'Publicação V1 -> V2 - carste.com.br', status: 'Completed', coluna: 'concluido', fechada: true, prazo: null, fila: null, donoId: '005A', dono: 'Guilherme Millares', relativo: 'Carste Engenharia', relativoTipo: 'Case', minha: true },
      ] }),
    whois: async ({ dominio }) => ({ ok: true, dominio, dns: { ns: ['ns1.cloudflare.com', 'ns2.cloudflare.com'], a: ['149.18.102.39'], mx: ['10 mx.'+dominio], resolveu: true }, whois: { host: 'whois.registro.br', texto: 'owner: CLIENTE LTDA\nstatus: published', campos: { titular: 'CLIENTE LTDA', registrador: '', criado: '20180312', expira: '20260312', status: 'published', nameservers: ['ns1.cloudflare.com'] } } }),
    checarOuvidoria: async ({ dominio }) => ({ ok: true, achou: true, razao: 'CLIENTE LTDA', situacao: 'Cancelado — 05/08/2026 [00085674]', ativarSsl: 'não', temOuvidoria: true, log: [] }),
    quandoPublicou: async ({ dominio }) => ({ ok: true, dominio, situacao: 'publicado', quando: '14/11/2025', fonte: 'salesforce', detalhe: 'tarefa "Publicação (Troca de DNS) - ' + dominio + '" concluída em 14/11/2025', texto: 'publicado em 14/11/2025 (Salesforce: tarefa de publicação concluída)', log: [] }),
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
    await page.evaluate(async () => { hubSfConectado = true; await carregarTarefasSf(true); await carregarMetricas(true); state.view = 'home'; render(); });
    await page.waitForTimeout(200);
  },
  // Os dois terminais (ADR-128): o Git Bash aberto embaixo do meio, com o
  // prompt do Git for Windows, e a Atividade minimizada no trilho.
  terminais: async (page) => {
    await page.evaluate(async () => {
      await abrirBash();
      const e = String.fromCharCode(27);
      window.__bashDados(`${e}[36m"Embora ninguém possa voltar e fazer um novo começo, qualquer um pode começar a partir de agora e fazer um novo final."${e}[0m ${e}[35m— Carl Bard${e}[0m\r\n\r\n${e}[32mguilherme.millares@PAT-02131 ${e}[35mMINGW64 ${e}[33m~/Pictures/pr-merge-tool${e}[36m (master)${e}[0m\r\n$ git status -sb\r\n${e}[32m## master...origin/master${e}[0m\r\n ${e}[31mM${e}[0m renderer/app.js\r\n${e}[31m??${e}[0m renderer/terminais.js\r\n\r\n${e}[32mguilherme.millares@PAT-02131 ${e}[35mMINGW64 ${e}[33m~/Pictures/pr-merge-tool${e}[36m (master)${e}[0m\r\n$ `);
    });
    await page.waitForTimeout(250);
  },
  'terminais-atividade-min': async (page) => {
    await page.evaluate(() => { mudarAtividade('minimizado'); log('Chegou enquanto estava minimizada.', 'warn'); });
    await page.waitForTimeout(250);
  },
  'home-sem-terminais': async (page) => {
    await page.evaluate(() => { mudarAtividade('fechado'); mudarBash('fechado'); state.view = 'home'; render(); });
    await page.waitForTimeout(250);
  },
  'home-de-volta': async (page) => {
    await page.evaluate(() => { mudarAtividade('aberto'); });
    await page.waitForTimeout(150);
  },
  kanban: async (page) => {
    await page.evaluate(async () => { hubSfConectado = true; await carregarTarefasSf(true); sfKanban.fila = 'todas'; state.view = 'kanban'; render(); });
    await page.waitForTimeout(200);
  },
  'kanban-tarefa': async (page) => {
    await page.evaluate(async () => { hubSfConectado = true; await carregarTarefasSf(true); sfKanban.fila = 'todas'; state.view = 'kanban'; render(); abrirTarefaNoSalesforce(sfKanban.dados.tarefas[0]); });
    await page.waitForTimeout(250);
  },
  'config-cloudflare': async (page) => {
    await page.evaluate(() => { fecharTarefaAberta(); });
    await page.evaluate(() => { state.view = 'home'; render(); openSettings('cloudflare'); });
    await page.waitForTimeout(250);
  },
  'config-acesso': async (page) => {
    await page.evaluate(() => { state.view = 'home'; render(); openSettings('acesso'); document.getElementById('gaAccountIds').value = '312884706\n298117403'; });
    await page.waitForTimeout(250);
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
      state.view = 'newproject'; state.npTab = 'create'; render();
      renderNpCreateResult(document.getElementById('npResult'), f.createResult);
    }, f);
  },
  'criar-mpiplus': async (page, f) => {
    await page.evaluate((f) => {
      state.brand = 'mpiplus';
      state.view = 'newproject'; state.npTab = 'create'; render();
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
      openSettings('acesso');
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
      state.sfTarefasAuto = true;
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
  retomar: async (page) => {
    await page.evaluate(async () => {
      const P = 'https://idealplus.idealtrends.io/clientes/2775/hub?projeto=2851&tab=publicacao';
      window.api.lerRodada = async () => ({ ok: true, estado: {
        versao: 1, fase: 'publicando', marca: 'mpiplus', origem: 'Publicação em Massa.xlsx', salvoEm: '2026-09-22T23:41:00.000Z',
        linhas: [['Razão Social', 'Domínio', 'Link do painel'], ['A', 'a.com.br', P], ['B', 'b.com.br', P], ['C', 'c.com.br', P]],
        mapa: { razao: 0, dominio: 1, painel: 2, caso: -1 }, temCabecalho: true,
        sites: [{ dominio: 'a.com.br', status: 'ok', publicado: true }, { dominio: 'b.com.br', status: 'rodando', publicado: true }, { dominio: 'c.com.br', status: 'pendente' }],
      } });
      state.brand = 'mpiplus';
      state.view = 'bulk';
      render();
      await new Promise((r) => setTimeout(r, 100));
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
  doutor: async (page) => {
    await page.evaluate(() => {
      state.view = 'doutor';
      doutorEstado.marca = 'mpisolutions';
      doutorEstado.dominio = 'clinicasaovicente.com.br';
      doutorEstado.acao = 'bloquear';
      doutorEstado.ultimo = { ok: true, titulo: 'Contatos bloqueados: Cl\u00ednica S\u00e3o Vicente', sub: 'o telefone passa a aparecer como ## no site' };
      render();
    });
  },
  ouvidoria: async (page) => {
    await page.evaluate(() => {
      state.view = 'ouvidoria';
      ouvEstado = {
        dominios: ['layoutcenografia.com.br', 'clinicasaovicente.com.br', 'transportesnorte.com.br', 'adifertampoes.com.br'],
        origem: 'clientes-ssl.xlsx',
        rodando: false, parar: false, feito: true,
        linhas: [
          { dominio: 'layoutcenografia.com.br', achou: true, razao: 'Layout Cenografia Ltda', situacao: 'Conclu\u00eddo', ativarSsl: 'sim' },
          { dominio: 'clinicasaovicente.com.br', achou: true, razao: 'Cl\u00ednica S\u00e3o Vicente', situacao: 'Cancelado', ativarSsl: 'n\u00e3o' },
          { dominio: 'transportesnorte.com.br', achou: true, razao: 'Transportes Norte S.A.', situacao: 'Jur\u00eddico', ativarSsl: 'n\u00e3o' },
          { dominio: 'adifertampoes.com.br', achou: false, motivo: 'nenhuma tarefa cita o dom\u00ednio', situacao: 'n\u00e3o encontrado no Salesforce (nenhuma tarefa cita o dom\u00ednio)', ativarSsl: 'revisar' },
        ],
      };
      render();
    });
  },
  config: async (page) => {
    await page.evaluate(() => { state.view = 'home'; render(); openSettings('geral'); });
    await page.waitForTimeout(250);
  },
  'config-salesforce': async (page) => {
    await page.evaluate(() => { state.view = 'home'; render(); openSettings('salesforce'); });
    await page.waitForTimeout(250);
  },
  'config-contas': async (page) => {
    await page.evaluate(async () => {
      state.view = 'home'; render(); openSettings('google');
      state.brandAccounts = {
        bc: 'bcrelatorios@gmail.com',
        mpisolutions: 'ferramentasmpisolutions@gmail.com',
        mpiplus: 'bcrelatoriotags@gmail.com',
      };
      await renderBrandOauth();
      // Mostra o marco de cima ("Conta do Google, por marca") junto, para dar
      // para achar a seção rolando a tela.
      const alvo = document.getElementById('brandOauthList');
      if (alvo) alvo.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(200);
  },
};

(async () => {
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.HUB_CHROME || undefined });
  const page = await browser.newPage({ viewport: { width: Number(process.env.HUB_LARGURA) || 1600, height: Number(process.env.HUB_ALTURA) || 1000 }, deviceScaleFactor: 1 });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.addInitScript(STUB);
  await page.goto(RENDERER);
  await page.waitForFunction(() => typeof render === 'function' && document.getElementById('leftPanel'));

  // Terminal com histórico realista em todas as telas.
  await page.evaluate((f) => {
    document.getElementById('terminal').innerHTML = '';
    for (const [m, t] of f.logs) log(m, t);
  }, FIXTURES);

  for (const [name, run] of Object.entries(SCENES)) {
    await run(page, FIXTURES);
    await page.waitForTimeout(450);
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
