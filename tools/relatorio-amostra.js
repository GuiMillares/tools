// Amostra da Planilha do Relatório (ADR-148), fora da tela do Hub.
//
// Roda a mesma rodada (lib/relatorio-rodada.js + lib/relatorio-fontes.js) para
// alguns clientes, com as sessões que o Hub instalado já guardou (Salesforce,
// service account do Google, logins OAuth, Bitbucket), e grava o resultado em
// JSON e .xlsx. Precisa do Electron (as sessões estão cifradas com o
// safeStorage do Windows):
//
//     npx electron tools/relatorio-amostra.js --dominio jrplasticos.com.br --dominio 3rsustentavel.com.br
//     npx electron tools/relatorio-amostra.js --planilha "C:\...\Domínios e Analytics.ods" --linhas Busca:2,Busca:3,MPI:2
//     npx electron tools/relatorio-amostra.js --planilha ... --linhas Busca:2 --saida C:\temp\amostra
//
// --dominio: a conta é achada pelo domínio no Salesforce (como a Ouvidoria faz);
// --linhas: as linhas da planilha (aba:nº, com o cabeçalho na linha 1).
// Nada é gravado no Salesforce, no Google nem no painel: é só leitura.

const path = require('path');
const fs = require('fs');
const { app, safeStorage } = require('electron');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : ''; };
const opts = (nome) => args.map((a, i) => (a === nome ? args[i + 1] : null)).filter(Boolean);

// A mesma pasta de dados do Hub instalado (%APPDATA%\pr-merge-tool).
app.setPath('userData', path.join(app.getPath('appData'), 'pr-merge-tool'));
const userData = () => app.getPath('userData');
const lerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch (e) { return null; } };
const lerCifrado = (f) => { try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(f))); } catch (e) { return null; } };

app.whenReady().then(async () => {
  const { google } = require('googleapis');
  const { criarSalesforce, SalesforceErro } = require(path.join(ROOT, 'lib', 'salesforce'));
  const { criarBitbucket } = require(path.join(ROOT, 'lib', 'quando-publicou'));
  const { criarFontes } = require(path.join(ROOT, 'lib', 'relatorio-fontes'));
  const Rodada = require(path.join(ROOT, 'lib', 'relatorio-rodada'));
  const R = require(path.join(ROOT, 'lib', 'relatorio'));
  const https = require('https');

  const saida = opt('--saida') || path.join(ROOT, 'docs', 'metricas', 'relatorio-amostra');
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  const cor = { cmd: '\x1b[36m', info: '', warn: '\x1b[33m', error: '\x1b[31m', success: '\x1b[32m' };
  const log = (m, t = 'info') => console.log(`${cor[t] || ''}${t === 'cmd' ? '$ ' : ''}${m}\x1b[0m`);

  // ---------- Salesforce (token cifrado; renova com o refresh token) ----------
  const sfCfg = lerJson(path.join(userData(), 'salesforce-config.json')) || {};
  const sfTokenPath = path.join(userData(), 'salesforce-token.enc');
  const sfLoginUrl = `https://${String(sfCfg.dominio || '').replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  function sfRefresh(refresh) {
    return new Promise((resolve, reject) => {
      const corpo = new URLSearchParams({ grant_type: 'refresh_token', client_id: 'PlatformCLI', refresh_token: refresh }).toString();
      const u = new URL(`${sfLoginUrl}/services/oauth2/token`);
      const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corpo), Accept: 'application/json' } }, (res) => {
        let txt = ''; res.on('data', (c) => { txt += c; }); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(txt) }); } catch (e) { resolve({ status: res.statusCode, body: {} }); } });
      });
      req.on('error', reject); req.write(corpo); req.end();
    });
  }
  let sfToken = lerCifrado(sfTokenPath);
  const sfReal = () => (sfToken && sfToken.access_token ? criarSalesforce(sfToken.instance_url, sfToken.access_token) : null);
  // Um cliente que renova a sessão uma vez quando ela vence, como o sfComSessao do Hub.
  const sf = sfToken ? {
    async consultar(...a) { return comSessao((c) => c.consultar(...a)); },
    async buscar(...a) { return comSessao((c) => c.buscar(...a)); },
    async descrever(...a) { return comSessao((c) => c.descrever(...a)); },
    get instanceUrl() { return sfToken.instance_url; },
  } : null;
  async function comSessao(fn) {
    try { return await fn(sfReal()); } catch (e) {
      if (!(e instanceof SalesforceErro) || !e.sessaoInvalida || !sfToken.refresh_token) throw e;
      const r = await sfRefresh(sfToken.refresh_token);
      if (r.status !== 200 || !r.body.access_token) throw new Error(`não consegui renovar a sessão do Salesforce (${r.status})`);
      sfToken = { ...sfToken, ...r.body };
      try { fs.writeFileSync(sfTokenPath, safeStorage.encryptString(JSON.stringify(sfToken))); } catch (e2) { /* a sessão renovada vale só nesta rodada */ }
      return fn(sfReal());
    }
  }
  if (!sf) log('Salesforce: sem sessão guardada (conecte no Hub).', 'warn');

  // ---------- Google: service account e sessões OAuth ----------
  const gCfg = lerJson(path.join(userData(), 'google-config.json')) || {};
  const oauthCfg = lerJson(path.join(userData(), 'oauth-config.json')) || {};
  const SCOPES_SA = [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/analytics.manage.users.readonly',
    'https://www.googleapis.com/auth/tagmanager.readonly',
    'https://www.googleapis.com/auth/webmasters.readonly',
  ];
  const limparEmail = (e) => String(e || '').replace(/[​-‏⁠﻿ ]/g, '').trim().toLowerCase();
  let saClient = null;
  const authSa = async () => {
    if (saClient) return saClient;
    if (!gCfg.saPath || !fs.existsSync(gCfg.saPath)) throw new Error('service account não configurada (google-config.json: saPath)');
    saClient = await new google.auth.GoogleAuth({ keyFile: gCfg.saPath, scopes: SCOPES_SA }).getClient();
    return saClient;
  };
  const brandAccounts = gCfg.brandAccounts || {};
  const contasRelatorio = (Array.isArray(gCfg.contasRelatorio) ? gCfg.contasRelatorio : []).map(limparEmail).filter(Boolean);
  const slots = [
    { slot: 'bc', email: brandAccounts.bc || '', analytics: false, searchConsole: true },
    { slot: 'mpiplus', email: brandAccounts.mpiplus || '', analytics: false, searchConsole: true },
    { slot: 'mpisolutions', email: brandAccounts.mpisolutions || '', analytics: false, searchConsole: true },
    ...contasRelatorio.map((email, i) => ({ slot: `rel-${i + 1}`, email, analytics: true, searchConsole: true, tagManager: true })),
  ].filter((s) => s.email);
  const authDoSlot = async (slot) => {
    const f = path.join(userData(), slot ? `oauth-token-${slot}.json` : 'oauth-token.json');
    const token = lerJson(f);
    if (!token || !token.access_token || !oauthCfg.clientId) return null;
    const c = new google.auth.OAuth2(oauthCfg.clientId, oauthCfg.clientSecret);
    c.setCredentials(token);
    c.on('tokens', (fresh) => { try { fs.writeFileSync(f, JSON.stringify({ ...token, ...fresh, refresh_token: fresh.refresh_token || token.refresh_token }, null, 2)); } catch (e) { /* ok */ } });
    return c;
  };
  const cachePath = path.join(userData(), 'analytics-streams-cache.json');
  const cache = { ler: () => lerJson(cachePath) || {}, gravar: (obj) => { try { fs.writeFileSync(cachePath, JSON.stringify(obj)); } catch (e) { /* ok */ } } };

  // ---------- Bitbucket ----------
  const creds = lerCifrado(path.join(userData(), 'credentials.enc'));
  const st = lerJson(path.join(userData(), 'hub-state.json')) || {};
  const workspaces = [...new Set([...Object.values(st.bitbucketWorkspaces || {}), st.bitbucketWorkspace].map((w) => String(w || '').trim()).filter(Boolean))];
  const bitbucket = creds && creds.email && creds.token && workspaces.length ? criarBitbucket({ creds, workspaces }) : null;
  if (!bitbucket) log('Bitbucket: sem credencial ou workspace; o geral.php fica de fora.', 'warn');

  const fontes = criarFontes({
    sf, google, authSa, authDoSlot, slots, cache, bitbucket, painel: null,
    // A sessão principal do Google (oauth-token.json), para ler os acessos
    // das contas em que a service account não administra.
    authPrincipal: () => authDoSlot(''),
    contasConhecidas: [...Object.values(brandAccounts), ...contasRelatorio],
    padraoMarca: { Busca: { ga: brandAccounts.bc || '', gsc: brandAccounts.mpiplus || brandAccounts.bc || '' }, MPI: { ga: brandAccounts.mpisolutions || '', gsc: brandAccounts.mpisolutions || '' }, 'MPI+': { ga: brandAccounts.mpiplus || '', gsc: brandAccounts.mpiplus || '' } },
  });
  log(`Logins: ${slots.map((s) => `${s.email} (${s.slot}${fs.existsSync(path.join(userData(), `oauth-token-${s.slot}.json`)) ? ', conectado' : ', sem sessão'})`).join('; ') || 'nenhum'}.`, 'info');

  // ---------- --acessos: o que a service account e cada login enxergam ----------
  //
  // Para saber em que contas do Analytics e do Tag Manager a service account
  // ainda precisa de acesso: lista as contas dela (e se é administradora, pelo
  // accessBindings) e as de cada login de relatório conectado, e aponta as
  // contas que o login vê e ela não.
  if (args.includes('--acessos')) {
    const auth = await authSa();
    const ga = google.analyticsadmin('v1beta');
    const gaAlpha = google.analyticsadmin('v1alpha');
    const gtm = google.tagmanager('v2');
    const listarGa = async (a) => { const out = new Map(); let pageToken; do { const r = await ga.accountSummaries.list({ pageSize: 200, pageToken, auth: a }); for (const x of r.data.accountSummaries || []) out.set(x.account, { nome: x.displayName, props: (x.propertySummaries || []).length }); pageToken = r.data.nextPageToken; } while (pageToken); return out; };
    const listarGtm = async (a) => { const out = new Map(); let pageToken; do { const r = await gtm.accounts.list({ pageToken, auth: a }); for (const x of r.data.account || []) out.set(x.path, x.name); pageToken = r.data.nextPageToken; } while (pageToken); return out; };
    const saGa = await listarGa(auth);
    log(`Service account: ${saGa.size} conta(s) do Analytics.`, 'cmd');
    let admin = 0;
    for (const [id, c] of [...saGa.entries()].sort((x, y) => x[1].nome.localeCompare(y[1].nome))) {
      let quem = '';
      try { const r = await gaAlpha.accounts.accessBindings.list({ parent: id, pageSize: 200, auth }); quem = (r.data.accessBindings || []).map((b) => b.user).filter(Boolean).filter((e) => /bcrelatorio|ferramentasmpi/i.test(e)).join(', ') || '(nenhum login de relatório)'; admin++; } catch (e) { quem = 'SEM permissão para ler os acessos (não é administradora)'; }
      log(`  ${c.nome} (${id}, ${c.props} propriedades): ${quem}`, /SEM/.test(quem) ? 'warn' : 'info');
    }
    log(`Administradora em ${admin} de ${saGa.size} conta(s).`, 'info');
    let saGtm = new Map();
    try { saGtm = await listarGtm(auth); log(`Service account: ${saGtm.size} conta(s) do Tag Manager: ${[...saGtm.values()].join(', ')}`, 'cmd'); } catch (e) { log(`Tag Manager pela service account: ${e.message}`, 'warn'); }
    for (const s of slots.filter((x) => x.analytics)) {
      const a = await authDoSlot(s.slot);
      if (!a) { log(`${s.email}: sem sessão conectada.`, 'warn'); continue; }
      try {
        const lg = await listarGa(a);
        const falta = [...lg.entries()].filter(([id]) => !saGa.has(id));
        log(`${s.email}: vê ${lg.size} conta(s) do Analytics; a service account NÃO vê ${falta.length}: ${falta.map(([id, c]) => `${c.nome} (${id.split('/').pop()})`).join(', ') || 'nenhuma'}`, falta.length ? 'warn' : 'success');
      } catch (e) { log(`${s.email}: Analytics: ${e.message.slice(0, 120)}`, 'warn'); }
      try {
        const lt = await listarGtm(a);
        const falta = [...lt.entries()].filter(([p]) => !saGtm.has(p));
        log(`${s.email}: vê ${lt.size} conta(s) do Tag Manager; a service account NÃO vê ${falta.length}: ${falta.map(([p, n]) => `${n} (${p.split('/').pop()})`).join(', ') || 'nenhuma'}`, falta.length ? 'warn' : 'success');
      } catch (e) { log(`${s.email}: Tag Manager: ${e.message.slice(0, 120)} (a sessão precisa do escopo tagmanager.readonly: reconecte o login)`, 'warn'); }
    }
    app.exit(0);
    return;
  }

  // ---------- Os itens ----------
  const itens = [];
  for (const dom of opts('--dominio')) {
    const d = R.limparDominio(dom);
    itens.push({ aba: 'Busca', empresa: opt('--empresa') === 'MPI' ? 'MPI' : 'Busca', linha: 0, original: { bu_nome: opt('--empresa') === 'MPI' ? 'MPI Solutions' : 'Busca Cliente', contract_type: opt('--empresa') === 'MPI' ? 'mpi_solutions' : 'busca_cliente' }, cnpj: '', razao: '', numeroContrato: '', dominio: d });
  }
  const planilha = opt('--planilha');
  if (planilha) {
    const XLSX = require('xlsx');
    const wb = XLSX.read(fs.readFileSync(planilha), { type: 'buffer' });
    const abas = wb.SheetNames.map((n) => ({ aba: n, linhas: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }).map((l) => l.map((c) => String(c ?? '').trim())) }));
    const ent = R.lerEntrada(abas);
    const pedidas = (opt('--linhas') || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const p of pedidas) {
      // "Busca:2" ou "Busca=2" (o Git Bash converte listas com ":" como se fossem caminhos).
      const [aba, n] = p.split(/[:=]/);
      const it = ent.itens.find((x) => R.empresaDaAba(x.aba) === R.empresaDaAba(aba) && String(x.linha) === String(n));
      if (it) itens.push(it); else log(`linha ${p} não achada na planilha.`, 'warn');
    }
    if (!pedidas.length) itens.push(...ent.itens.slice(0, Number(opt('--primeiras') || 3)));
  }
  if (!itens.length) { log('Nada para rodar: use --dominio ou --planilha.', 'error'); app.exit(1); return; }

  const resultados = [];
  for (const it of itens) {
    log(`\n=== ${it.razao || it.dominio || it.cnpj} (${it.empresa}${it.linha ? `, linha ${it.linha}` : ''}) ===`, 'cmd');
    const r = await Rodada.preencherItem(it, fontes, log);
    resultados.push(r);
    log(R.textoLinha(r), r.situacao === 'completo' ? 'success' : r.situacao === 'erro' ? 'error' : 'warn');
    const s = r.saida;
    log(`  nome_fantasia=${s[2]} | responsavel=${s[3]} <${s[4]}> ${s[5]} | contrato=${s[7]} | external_id=${s[9]} | ga=${s[11]} / ${s[12]} / ${s[13]} | gsc=${s[14]} ${s[15]} | pacote=${s[16]} | valor=${s[17]} | tipo=${r.dados.tipo} (${r.dados.tipoOrigem}) | palavras=${s[18] ? s[18].split('|').length : 0}`, 'info');
    if (r.observacoes.length) log(`  obs: ${r.observacoes.join('; ')}`, 'info');
  }

  fs.writeFileSync(`${saida}.json`, JSON.stringify(resultados, null, 2));
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  for (const a of R.montarAbasXlsx(resultados)) if (a.linhas.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([a.colunas, ...a.linhas]), a.aba);
  XLSX.writeFile(wb, `${saida}.xlsx`);
  log(`\n${R.textoResumo(resultados)}. Gravei ${saida}.json e ${saida}.xlsx`, 'success');
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
