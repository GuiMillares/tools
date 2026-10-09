const { app, BrowserWindow, ipcMain, safeStorage, clipboard, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const tls = require('tls');
const crypto = require('crypto');
// Só as 6 APIs do Google que o Hub usa, cada uma no primeiro uso, em vez das
// 335 do googleapis na abertura (ADR-107). Mesma cara e mesmo google.options().
const { google } = require(path.join(__dirname, 'lib', 'google'));

const credsPath = () => path.join(app.getPath('userData'), 'credentials.enc');
const hubStatePath = () => path.join(app.getPath('userData'), 'hub-state.json');
const googleConfigPath = () => path.join(app.getPath('userData'), 'google-config.json');
const mergeHistoryPath = () => path.join(app.getPath('userData'), 'merge-history.json');

function httpRequest(method, url, auth, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${auth.email}:${auth.token}`).toString('base64'),
        Accept: 'application/json',
      },
    };

    let data;
    if (body) {
      data = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        let parsed;
        try {
          parsed = chunks ? JSON.parse(chunks) : {};
        } catch (e) {
          parsed = { raw: chunks };
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#15171c',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // A janela desacelera em segundo plano como qualquer página, e só deixa
      // de desacelerar enquanto algo roda sozinho (rodada em massa, automação,
      // publicação): o energia:manterAcordado liga e desliga (ADR-126). Com a
      // desaceleração desligada o tempo todo (ADR-094), ela desenhava mesmo
      // escondida atrás de outras janelas.
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// Uma instância por pasta de dados (ADR-088). Duas cópias do Hub no mesmo
// perfil escrevem no mesmo hub-state.json, nos mesmos tokens criptografados e
// na mesma sessão de navegador em disco (o painel MPI+ e o Registro.br), e
// disputam a porta 1717 do login do Salesforce. A segunda abertura traz a
// janela que já existe para a frente em vez de abrir uma cópia que corrompe a
// outra.
//
// Quem precisar mesmo de duas rodando ao mesmo tempo abre a segunda com
// --user-data-dir apontando para outra pasta: a trava é por pasta de dados,
// então as duas convivem, cada uma com a sua configuração.
// A checagem por typeof é para os testes, que executam este arquivo com um
// `app` mínimo: sem a API, segue como antes em vez de estourar.
const instanciaUnica = typeof app.requestSingleInstanceLock === 'function' ? app.requestSingleInstanceLock() : true;
if (!instanciaUnica) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const janelas = BrowserWindow.getAllWindows();
    const principal = janelas.find((w) => !w.isDestroyed() && w.isVisible()) || janelas[0];
    if (principal) {
      if (principal.isMinimized()) principal.restore();
      principal.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- Credenciais (criptografadas via DPAPI no Windows) ----------

ipcMain.handle('creds:save', (event, { email, token }) => {
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'Criptografia do sistema operacional indisponível nesta máquina.' };
  }
  const payload = JSON.stringify({ email, token });
  const encrypted = safeStorage.encryptString(payload);
  fs.writeFileSync(credsPath(), encrypted);
  return { ok: true };
});

ipcMain.handle('creds:load', () => {
  try {
    if (!fs.existsSync(credsPath())) return { ok: true, creds: null };
    const encrypted = fs.readFileSync(credsPath());
    const decrypted = safeStorage.decryptString(encrypted);
    return { ok: true, creds: JSON.parse(decrypted) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('creds:clear', () => {
  try {
    if (fs.existsSync(credsPath())) fs.unlinkSync(credsPath());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- Área de transferência ----------

ipcMain.handle('clipboard:write', (event, text) => {
  clipboard.writeText(text);
  return { ok: true };
});

// ---------- Estado do hub (recentes, favoritos) ----------

ipcMain.handle('hubstate:get', () => {
  try {
    if (!fs.existsSync(hubStatePath())) return { ok: true, state: {} };
    const raw = fs.readFileSync(hubStatePath(), 'utf-8');
    return { ok: true, state: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('hubstate:set', (event, newState) => {
  try {
    fs.writeFileSync(hubStatePath(), JSON.stringify(newState, null, 2));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- Pull Requests ----------

function parsePrUrl(rawUrl) {
  const match = rawUrl
    .trim()
    .match(/bitbucket\.org\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/i);
  if (!match) return null;
  return { workspace: match[1], repo: match[2], id: match[3] };
}

ipcMain.handle('pr:fetch', async (event, { url, creds }) => {
  const parsed = parsePrUrl(url);
  if (!parsed) {
    return { ok: false, error: 'Link não reconhecido. Cole a URL completa do pull request do Bitbucket.' };
  }
  const { workspace, repo, id } = parsed;
  const base = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests/${id}`;

  const prRes = await httpRequest('GET', base, creds);
  if (prRes.status !== 200) {
    const msg = prRes.body?.error?.message || `HTTP ${prRes.status}`;
    return { ok: false, error: `Falha ao buscar PR #${id}: ${msg}` };
  }
  const pr = prRes.body;

  let buildState = 'NONE';
  try {
    const commitHash = pr.source?.commit?.hash;
    if (commitHash) {
      const statusesUrl = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/commit/${commitHash}/statuses`;
      const stRes = await httpRequest('GET', statusesUrl, creds);
      if (stRes.status === 200 && Array.isArray(stRes.body.values) && stRes.body.values.length) {
        const states = stRes.body.values.map((v) => v.state);
        if (states.includes('FAILED') || states.includes('STOPPED')) buildState = 'FAILED';
        else if (states.includes('INPROGRESS')) buildState = 'INPROGRESS';
        else if (states.every((s) => s === 'SUCCESSFUL')) buildState = 'SUCCESSFUL';
      }
    }
  } catch (e) {
    // sem pipeline configurado, segue sem bloquear
  }

  const approvals = (pr.participants || []).filter((p) => p.approved).length;

  return {
    ok: true,
    pr: {
      workspace,
      repo,
      id,
      title: pr.title,
      author: pr.author?.display_name || ', ',
      state: pr.state,
      sourceBranch: pr.source?.branch?.name || ', ',
      destBranch: pr.destination?.branch?.name || ', ',
      approvals,
      buildState,
      url,
    },
  };
});

ipcMain.handle('pr:merge', async (event, { workspace, repo, id, strategy, closeSourceBranch, creds }) => {
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests/${id}/merge`;
  const res = await httpRequest('POST', url, creds, {
    type: 'pullrequest',
    merge_strategy: strategy || 'merge_commit',
    close_source_branch: !!closeSourceBranch,
  });
  if (res.status === 200) {
    return { ok: true, mergedHash: res.body.merge_commit?.hash };
  }
  const msg = res.body?.error?.message || JSON.stringify(res.body);
  return { ok: false, status: res.status, error: msg };
});

// ---------- Histórico de merges ----------
//
// Fica em arquivo próprio, e não no hub-state.json, porque cresce: cada entrada
// carrega o trecho do terminal daquele merge. Os dois tetos abaixo existem pra
// isso não virar um arquivo de dezenas de MB depois de um ano de uso.

const HISTORY_MAX_ENTRIES = 300;
const HISTORY_MAX_LOG_LINES = 200;

function readMergeHistory() {
  try {
    if (!fs.existsSync(mergeHistoryPath())) return [];
    const parsed = JSON.parse(fs.readFileSync(mergeHistoryPath(), 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // Arquivo corrompido não pode impedir de mergear, histórico é registro,
    // não caminho crítico.
    return [];
  }
}

function writeMergeHistory(entries) {
  fs.writeFileSync(mergeHistoryPath(), JSON.stringify(entries.slice(0, HISTORY_MAX_ENTRIES), null, 2));
}

ipcMain.handle('history:list', () => {
  try {
    return { ok: true, entries: readMergeHistory() };
  } catch (e) {
    return { ok: false, error: e.message, entries: [] };
  }
});

ipcMain.handle('history:add', (event, entry) => {
  try {
    const lines = Array.isArray(entry?.log) ? entry.log : [];
    const trimmed = lines.length > HISTORY_MAX_LOG_LINES;
    const record = {
      ...entry,
      log: lines.slice(0, HISTORY_MAX_LOG_LINES),
      logTrimmed: trimmed,
    };
    const entries = readMergeHistory();
    entries.unshift(record);
    writeMergeHistory(entries);
    return { ok: true, entry: record };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('history:remove', (event, id) => {
  try {
    writeMergeHistory(readMergeHistory().filter((e) => e.id !== id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('history:clear', () => {
  try {
    if (fs.existsSync(mergeHistoryPath())) fs.unlinkSync(mergeHistoryPath());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- Google (Analytics, Tag Manager, reCAPTCHA, Search Console) ----------

ipcMain.handle('google:getConfig', () => {
  try {
    if (!fs.existsSync(googleConfigPath())) return { ok: true, config: {} };
    return { ok: true, config: JSON.parse(fs.readFileSync(googleConfigPath(), 'utf-8')) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('google:setConfig', (event, config) => {
  try {
    fs.writeFileSync(googleConfigPath(), JSON.stringify(config, null, 2));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/analytics.edit',
  // Ler quem tem acesso a uma conta do GA4 (accessBindings), para a Planilha
  // do Relatório dizer qual login enxerga a propriedade (ADR-148).
  'https://www.googleapis.com/auth/analytics.manage.users.readonly',
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.publish',
  'https://www.googleapis.com/auth/tagmanager.manage.accounts',
  // Necessário para dar acesso da conta principal ao container recém-criado
  // (ADR-020). Foi esquecido quando o escopo entrou no login OAuth (ADR-018):
  // são duas listas separadas, e quem concede ali é a SERVICE ACCOUNT, não o
  // login. Escopo de service account não precisa de novo consentimento, vale
  // assim que o app reinicia.
  'https://www.googleapis.com/auth/tagmanager.manage.users',
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/siteverification',
  // Enviar sitemap e registrar a propriedade são da Search Console API, que é
  // OUTRA API e outro escopo, verificar não basta (ADR-038). Exige também
  // habilitar "Google Search Console API" no projeto do Google Cloud.
  'https://www.googleapis.com/auth/webmasters',
];

// ---------- Marcas: em que contas do Google cada projeto mora ----------

// O nome da conta é o que identifica a marca, tanto no Analytics quanto no
// Tag Manager. Comparação feita sobre o nome normalizado (sem acento, sem
// pontuação, minúsculo), então "BC Relatórios 2" também casa com bcrelatorios2.
//
// ATENÇÃO ao que estes padrões comparam: o NOME DE EXIBIÇÃO da conta
// (displayName no Analytics, account.name no Tag Manager), normalizado.
// NÃO o e-mail que administra a conta.
//
// Os padrões antigos (bcrelatorios*, ferramentasmpisolutions, bcrelatoriotags)
// eram os e-mails de login, que nunca aparecem como nome de conta. Resultado:
// nenhum predicado casava com nada, e o app dizia "a service account não tem
// acesso" quando o problema era o filtro. Ver ADR-017.
//
// Login nunca entra em predicado aqui. Ele só existe no contexto do OAuth
// (qual e-mail o humano usa pra conceder acesso).
const BRANDS = {
  bc: {
    name: 'Busca Cliente',
    // "Busca Cliente 01" ... "Busca Cliente 82" → buscacliente01 ... buscacliente82.
    // O \d+ é obrigatório de propósito: deixa de fora "Busca Cliente REDES"
    // (buscaclienteredes) e "Busca Cliente - MPI+" (buscaclientempi), que não
    // são slots de projeto novo.
    matches: (n) => /^buscacliente\d+$/.test(n),
    // No Tag Manager NÃO há uma conta por slot: Busca Cliente e MPI+ dividem a
    // mesma conta, "Busca Cliente - Clientes". Confirmado em tela.
    matchesGtm: (n) => n === 'buscaclienteclientes',
    // As tags da Busca Cliente são operadas por OUTRO login: o mesmo da MPI+
    // (bcrelatoriotags). Faz sentido com a linha acima: as duas marcas dividem
    // a conta "Busca Cliente - Clientes" no Tag Manager, então é o mesmo login
    // abrindo a mesma conta. Analytics e Search Console seguem no login da
    // própria marca (ADR-067).
    contaGtmDe: 'mpiplus',
  },
  mpisolutions: {
    name: 'MPI Solutions',
    // Aqui as duas superfícies coincidem: a conta se chama "MPI Solutions"
    // tanto no Analytics quanto no Tag Manager. Sem matchesGtm de propósito, // duplicar o padrão só criaria dois lugares para esquecer de atualizar.
    matches: (n) => n === 'mpisolutions',
  },
  mpiplus: {
    name: 'MPI+',
    // A MPI+ não tem repositório no Bitbucket: os projetos dela não passam pelo
    // commit do geral.php (ADR-033). O template continua sendo gerado, só o
    // commit é que não tem para onde ir.
    bitbucket: false,
    // E não tem painel do cliente: $idProjetoBusca não existe nos projetos dela
    // (ADR-036).
    semPainel: true,
    // No Search Console a MPI+ é o domínio sem www (ADR-030), e a verificação é
    // pelo GOOGLE ANALYTICS, não por arquivo nem por meta tag (ADR-040). É o
    // que já validava esses sites na prática: a tag do GA está no ar pelo
    // painel, e quem criou a propriedade do GA foi a própria service account.
    searchConsoleWww: false,
    searchConsoleVerify: 'ANALYTICS',
    // O campo "Key" do painel recebe o CONTEÚDO DO ARQUIVO do Search Console
    // (`google-site-verification: google....html`), que é o que a equipe cola
    // ali à mão hoje (ADR-043). A verificação não depende disso (é pelo
    // Analytics), então mandar o que eles já mandam não custa nada.
    painelScValue: 'FILE',
    // A conta da MPI+ é sempre a dela. Sem conta configurada, o app NÃO cai na
    // conta principal nem no login OAuth, recusa, porque usar outra conta aqui
    // é o erro que a ADR-035 corrigiu, e nesta marca ele foi proibido em voz
    // alta.
    contaObrigatoria: true,
    // No Analytics a conta se chama "Busca Cliente - MPI+" → buscaclientempi
    // (a normalização come o "+" e o hífen). O \d* opcional cobre uma eventual
    // segunda conta numerada, sem exigir número.
    //
    matches: (n) => /^buscaclientempi\d*$/.test(n),
    // A MPI+ tem conta PRÓPRIA no Analytics, mas divide a conta do Tag Manager
    // com a Busca Cliente. É por isso que a superfície existe: aqui as duas
    // hierarquias do Google não têm nem o mesmo nome nem o mesmo recorte.
    matchesGtm: (n) => n === 'buscaclienteclientes',
  },
};

// Escopo de BUSCA ≠ escopo de CRIAÇÃO.
//
// BRANDS acima é a regra estrita: onde criar e onde conceder acesso. Ela não
// serve para buscar, porque muita coisa foi criada antes dessa convenção de
// contas existir e ficaria invisível. Aqui a regra é deliberadamente frouxa:
// Busca Cliente varre tudo que não é exclusivo de outra marca; as duas marcas
// com conta própria varrem só a delas.
const SEARCH_SCOPE = {
  bc: {
    describe: 'todas as contas, exceto a exclusiva da MPI Solutions',
    // A conta da MPI Solutions se chama igual nas duas superfícies, então a
    // exclusão vale para Analytics e Tag Manager sem override.
    matches: (n) => n !== 'mpisolutions',
  },
  mpisolutions: {
    describe: 'conta "MPI Solutions"',
    matches: (n) => n === 'mpisolutions',
  },
  mpiplus: {
    describe: 'conta "Busca Cliente - MPI+" (Analytics) / "Busca Cliente - Clientes" (Tag Manager)',
    matches: (n) => /^buscaclientempi\d*$/.test(n),
    matchesGtm: (n) => n === 'buscaclienteclientes',
  },
};

function searchScopeFilter(brandId, surface = 'analytics') {
  const scope = SEARCH_SCOPE[brandId];
  if (!scope) {
    throw new Error(`Projeto não informado ou desconhecido ("${brandId}"). Escolha Busca Cliente, MPI Solutions ou MPI+.`);
  }
  const pred = pickPredicate(scope, surface);
  return (displayName) => pred(normalizeName(displayName));
}

function searchScopeName(brandId) {
  return SEARCH_SCOPE[brandId]?.describe || brandId;
}

// ---------- Templates de container do GTM ----------
//
// Cada marca reproduz um container-modelo exportado do próprio Tag Manager.
// O da Busca Cliente é o caso mínimo (1 tag, 0 triggers próprios); o da MPI
// Solutions tem 15 tags de evento e 15 triggers de clique. O motor é o mesmo.
//
// MPI+ ainda não tem modelo próprio, usa o da Busca Cliente até receber um.
const GTM_TEMPLATES = {
  bc: 'gtm-busca-cliente.json',
  mpisolutions: 'gtm-mpi-solutions.json',
  mpiplus: 'gtm-busca-cliente.json',
};

const GTM_TEMPLATE_SHARED = { mpiplus: 'bc' };

function gtmTemplatePath(file) {
  return path.join(__dirname, 'templates', file);
}

function loadGtmTemplate(brandId) {
  const file = GTM_TEMPLATES[brandId];
  if (!file) throw new Error(`Nenhum template de GTM mapeado para "${brandId}".`);
  const full = gtmTemplatePath(file);
  if (!fs.existsSync(full)) throw new Error(`Template do GTM não encontrado: ${full}`);
  const parsed = JSON.parse(fs.readFileSync(full, 'utf-8'));
  const containerVersion = parsed.containerVersion || parsed;
  if (!containerVersion.tag && !containerVersion.trigger && !containerVersion.variable) {
    throw new Error(`Template ${file} não parece uma exportação de container do Tag Manager.`);
  }
  return { file, containerVersion, borrowedFrom: GTM_TEMPLATE_SHARED[brandId] || null };
}

// Quando um filtro de marca não casa com nada, o erro sozinho não diz por quê, // "a service account não tem acesso" e "o padrão não bate com o nome real" dão
// exatamente a mesma mensagem. Listar o que a API devolveu separa os dois casos
// na primeira execução, em vez de virar uma sessão de debug.
const ACCOUNT_HINT_LIMIT = 15;

function describeVisibleAccounts(nomes, identidade) {
  const quem = identidade || 'a credencial usada';
  const lista = (nomes || []).filter(Boolean);

  if (!lista.length) {
    return `A API não devolveu nenhuma conta, ${quem} não tem acesso a nada aqui.`;
  }

  const mostrar = lista.slice(0, ACCOUNT_HINT_LIMIT).map((n) => `"${n}"`).join(', ');
  const resto = lista.length > ACCOUNT_HINT_LIMIT ? ` ... e mais ${lista.length - ACCOUNT_HINT_LIMIT}` : '';

  // As duas hipóteses, sempre as duas. A versão anterior só enunciava a
  // primeira, e quando o caso era o segundo a mensagem apontava pro lugar
  // errado, que é exatamente o tipo de erro que este diagnóstico existe pra
  // evitar.
  return (
    `Contas visíveis (${lista.length}): ${mostrar}${resto}. ` +
    'Se a conta certa ESTÁ nessa lista, o padrão da marca é que não bate com o nome dela. ' +
    `Se NÃO está, ${quem} não foi adicionada nela, é acesso que falta, não filtro.`
  );
}

// Devolve um predicado que recebe o displayName cru da conta.
//
// `surface` existe porque Analytics e Tag Manager são hierarquias separadas do
// Google, e nada obriga a conta a ter o mesmo nome nas duas. Na prática elas
// divergem: o container do GTM da MPI Solutions é criado sob o login
// ferramentasmpisolutions e o da MPI+ sob bcrelatoriotags, enquanto as contas
// do Analytics se chamam "MPI Solutions" e "Busca Cliente - MPI+".
//
// Enquanto não houver `matchesGtm`, as duas superfícies usam o mesmo padrão, // o comportamento é idêntico ao de antes deste parâmetro existir.
// Marca sem repositório no Bitbucket. Ausência da chave significa "tem", o
// caso normal não precisa declarar nada.
function brandHasBitbucket(brandId) {
  const entry = BRANDS[brandId];
  return !entry || entry.bitbucket !== false;
}

// Marca que só pode operar pela própria conta, sem reserva.
function brandRequiresOwnAccount(brandId) {
  return BRANDS[brandId]?.contaObrigatoria === true;
}

function pickPredicate(entry, surface) {
  return surface === 'gtm' && entry.matchesGtm ? entry.matchesGtm : entry.matches;
}

function brandFilter(brandId, surface = 'analytics') {
  const brand = BRANDS[brandId];
  if (!brand) {
    throw new Error(`Projeto não informado ou desconhecido ("${brandId}"). Escolha Busca Cliente, MPI Solutions ou MPI+.`);
  }
  const pred = pickPredicate(brand, surface);
  return (displayName) => pred(normalizeName(displayName));
}

function brandName(brandId) {
  if (ehSlotRelatorio(brandId)) return contaRelatorioDoSlot(brandId) || `login de relatório ${String(brandId).slice(4)}`;
  return BRANDS[brandId]?.name || brandId;
}

// Os logins de relatório (ADR-148): as contas do Google que enxergam as
// propriedades dos clientes (bcrelatorios, bcrelatorios2…, bcrelatoriotags),
// além das três marcas. Cada uma vira uma sessão OAuth própria, no slot
// rel-N, só leitura (Analytics e Search Console).
const ehSlotRelatorio = (slot) => /^rel-\d+$/.test(String(slot || ''));
const limparEmail = (e) => String(e || '').replace(/[​-‏⁠﻿ ]/g, '').trim().toLowerCase();
function contasRelatorio() {
  try {
    if (!fs.existsSync(googleConfigPath())) return [];
    const cfg = JSON.parse(fs.readFileSync(googleConfigPath(), 'utf-8'));
    // E-mail colado do Teams/WhatsApp vem com caractere invisível na frente
    // (U+2060, zero-width): sem limpar, o login nunca "é" o e-mail esperado.
    return (Array.isArray(cfg.contasRelatorio) ? cfg.contasRelatorio : []).map((e) => limparEmail(e)).filter(Boolean);
  } catch (e) { return []; }
}
function contaRelatorioDoSlot(slot) {
  const n = Number(String(slot).slice(4));
  return contasRelatorio()[n - 1] || '';
}

// O endpoint de token devolve o detalhe em response.data, sem isso sobra só
// "invalid_client", que não diz qual das duas credenciais está errada.
function describeOauthError(e) {
  const data = e?.response?.data || {};
  const code = data.error || '';
  const desc = data.error_description || '';
  const base = [code, desc].filter(Boolean).join(', ') || e.message;

  if (code === 'invalid_client') {
    const qual = /unauthorized/i.test(desc)
      ? 'O Client ID existe, mas o Client Secret não confere.'
      : 'O Google não encontrou esse Client ID.';
    return `${base}. ${qual} Confira se os dois vieram da MESMA credencial, do tipo "Aplicativo para computador", e se não colou espaço ou texto extra junto.`;
  }
  if (code === 'redirect_uri_mismatch') {
    return `${base}. A credencial precisa ser do tipo "Aplicativo para computador", as do tipo "Aplicativo da Web" não aceitam retorno em 127.0.0.1.`;
  }
  if (code === 'invalid_grant') {
    return `${base}. O código do login expirou ou já foi usado, conecte de novo.`;
  }
  return base;
}

async function buildGoogleAuthClient(keyFile) {
  const auth = new google.auth.GoogleAuth({ keyFile, scopes: GOOGLE_SCOPES });
  const client = await auth.getClient();
  // Sem prazo, uma requisição que o Google não responde prende a rodada para
  // sempre. 60s por chamada sobra para qualquer uma delas (ADR-094).
  google.options({ auth: client, timeout: 60000 });
  return client;
}

// ---------- Ritmo das chamadas ao Tag Manager ----------
//
// A API do Tag Manager tem cota POR MINUTO POR USUÁRIO, na prática 30
// requisições. O template da MPI Solutions são 32 escritas (1 lote de
// embutidas + 1 variável + 15 triggers + 15 tags), mais 6 do container e da
// publicação: ~38 no total. Em rajada isso estoura no meio e deixa o container
// pela metade, que foi exatamente o que aconteceu.
//
// Duas defesas, porque uma só não basta:
//   1. Intervalo mínimo entre chamadas, para ficar abaixo do teto de propósito.
//   2. Backoff LONGO quando estoura mesmo assim, a janela é de um minuto,
//      então esperar 2s e tentar de novo só gasta outra tentativa.
//
// E o intervalo é adaptativo: se estourar, ele afrouxa para o resto da
// operação, em vez de insistir num ritmo que já se provou rápido demais.

// ~28 chamadas/min, logo abaixo do teto. A variável de ambiente existe para os
// testes com API simulada, onde não há cota nenhuma para respeitar, em uso real
// não se mexe nela, sob pena de bater na parede da API.
const GTM_MIN_INTERVAL_MS = Number(process.env.HUB_GTM_INTERVAL_MS) || 2100;
const GTM_QUOTA_BACKOFF_MS = [20000, 40000, 60000, 60000];

// O Microsoft Graph limita ~30 mensagens por minuto por caixa. Mesmo problema,
// mesmo remédio, por isso o pacer não se chama mais "Gtm".
const MAIL_MIN_INTERVAL_MS = 2200;
const MAIL_BACKOFF_MS = [20000, 40000, 60000];

// ----- Parar no meio (ADR-102) -----
//
// O botão "Parar" pede a parada: toda espera em andamento (dormir, script na
// janela oculta do painel) é interrompida com "parado por você", e as novas
// também, até a tela dizer que terminou de parar (processo:liberar). O que é
// uma escrita só (um registro na Cloudflare, o PATCH de um campo) termina: não
// se corta uma requisição no meio, corta-se o passo seguinte.
let paradaPedida = false;
const aoParar = new Set();
class ParadaPedida extends Error {
  constructor() { super('parado por você'); this.parado = true; }
}
// Uma promessa que é rejeitada quando pedirem a parada. Devolve { promessa, soltar }.
function promessaDeParada() {
  let rej = null;
  const promessa = new Promise((_, r) => { rej = r; });
  promessa.catch(() => {});
  if (paradaPedida) rej(new ParadaPedida());
  else aoParar.add(rej);
  return { promessa, soltar: () => aoParar.delete(rej) };
}
const dormir = (ms) => {
  if (paradaPedida) return Promise.reject(new ParadaPedida());
  return new Promise((resolve, reject) => {
    const parar = (e) => { clearTimeout(t); reject(e); };
    const t = setTimeout(() => { aoParar.delete(parar); resolve(); }, ms);
    aoParar.add(parar);
  });
};
ipcMain.handle('processo:parar', () => {
  paradaPedida = true;
  const erro = new ParadaPedida();
  for (const rej of [...aoParar]) { try { rej(erro); } catch (e) {} }
  aoParar.clear();
  return { ok: true };
});
ipcMain.handle('processo:liberar', () => {
  paradaPedida = false;
  aoParar.clear();
  return { ok: true };
});

function isQuotaError(e) {
  const status = e?.code || e?.response?.status;
  const texto = `${e?.message || ''} ${e?.response?.data?.error?.status || ''}`;
  return (
    status === 429 ||
    /RESOURCE_EXHAUSTED/i.test(texto) ||
    /quota exceeded/i.test(texto) ||
    /rate limit/i.test(texto) ||
    /userRateLimitExceeded/i.test(texto)
  );
}

// Serializa e ritma as chamadas. Uma instância por operação, o intervalo é
// contado globalmente, senão cada etapa recomeçaria o relógio e a rajada
// voltaria.
function createApiPacer(push, opts = {}) {
  let intervalo = opts.minIntervalMs === undefined ? GTM_MIN_INTERVAL_MS : opts.minIntervalMs;
  const backoff = opts.backoff || GTM_QUOTA_BACKOFF_MS;
  let ultima = 0;
  let esperas = 0;

  const paced = async function paced(label, fn) {
    for (let tentativa = 0; ; tentativa++) {
      const falta = intervalo - (Date.now() - ultima);
      if (falta > 0) await dormir(falta);
      ultima = Date.now();

      try {
        return await fn();
      } catch (e) {
        if (!isQuotaError(e) || tentativa >= backoff.length) throw e;

        // Estourou: afrouxa o ritmo para o resto da operação. Insistir no
        // mesmo intervalo só produziria a mesma parede daqui a pouco.
        intervalo = Math.round(intervalo * 1.5);
        esperas++;
        const pausa = backoff[tentativa] + Math.floor(Math.random() * 3000);
        push(
          `Cota do Tag Manager estourada em ${label}. Esperando ${Math.round(pausa / 1000)}s ` +
            `e seguindo mais devagar (tentativa ${tentativa + 1} de ${backoff.length}).`,
          'warn'
        );
        await dormir(pausa);
        ultima = Date.now();
      }
    }
  };

  paced.stats = () => ({ esperas, intervalo });
  return paced;
}

// ---------- Acesso da conta principal ao container recém-criado ----------
//
// Quem cria o container é a service account. Um humano que seja membro da conta
// em nível de "usuário" (e não admin) NÃO herda acesso ao container novo: ele
// abre e vê "Sua conta de usuário está configurada como somente leitura".
//
// Admin de conta enxergaria tudo sem isso, daí a checagem no meio: se a pessoa
// já é admin, não há o que fazer.
//
// No nível de container a permissão mais alta é 'publish' (não existe "admin"
// de container). É ela que dá edição e publicação.
const GTM_CONTAINER_PERMISSION = 'publish';

async function grantOwnerContainerAccess({ tagmanager, accountPath, containerId, email, ritmo, push }) {
  const alvo = String(email || '').trim().toLowerCase();
  if (!alvo) return { estado: 'semEmail' };

  const res = await ritmo('listar permissões da conta', () =>
    tagmanager.accounts.user_permissions.list({ parent: accountPath })
  );
  const atual = (res.data.userPermission || []).find(
    (u) => String(u.emailAddress || '').toLowerCase() === alvo
  );

  // Ser admin DA CONTA não dá acesso ao container: no Tag Manager a permissão
  // de container (leitura / edição / aprovação / publicação) é por container,
  // e um admin sem ela abre o container novo em somente leitura. Era o que
  // acontecia com bcrelatoriotags e ferramentasmpisolutions (ADR-139): o Hub
  // pulava este passo para admins. Agora a conta da marca sempre recebe
  // publicação no container, admin ou não.
  if (!atual) {
    // Ainda não é membro da conta: entra como usuário, com acesso a este
    // container. Não promovemos a admin da conta sem pedir, isso daria poder
    // sobre TODOS os containers dela.
    await ritmo('conceder acesso ao container', () =>
      tagmanager.accounts.user_permissions.create({
        parent: accountPath,
        requestBody: {
          emailAddress: email,
          accountAccess: { permission: 'user' },
          containerAccess: [{ containerId, permission: GTM_CONTAINER_PERMISSION }],
        },
      })
    );
    return { estado: 'criado' };
  }

  // Já é membro: ATUALIZA a permissão existente. Um create com e-mail repetido
  // é recusado pela API, e sobrescrever containerAccess sem preservar o que já
  // estava lá tiraria o acesso da pessoa aos containers antigos.
  const containers = (atual.containerAccess || []).filter((c) => String(c.containerId) !== String(containerId));
  containers.push({ containerId: String(containerId), permission: GTM_CONTAINER_PERMISSION });

  await ritmo('atualizar acesso ao container', () =>
    tagmanager.accounts.user_permissions.update({
      path: atual.path,
      requestBody: { ...atual, containerAccess: containers },
    })
  );
  return { estado: 'atualizado', containersAntes: (atual.containerAccess || []).length, admin: atual.accountAccess?.permission === 'admin' };
}

// ---------- Motor: reproduzir um template de container no GTM ----------
//
// A exportação do Tag Manager traz campos que o servidor atribui e que a API
// recusa (ou ignora) na criação. Precisam sair antes do POST.
const GTM_SERVER_FIELDS = [
  'accountId', 'containerId', 'workspaceId', 'fingerprint', 'path', 'tagManagerUrl',
  'tagId', 'triggerId', 'variableId', 'folderId', 'parentFolderId',
];

function stripGtmServerFields(obj) {
  const out = { ...obj };
  for (const field of GTM_SERVER_FIELDS) delete out[field];
  return out;
}

// Troca {{NomeAntigo}} por {{NomeNovo}} em qualquer string da árvore de
// parâmetros. Parâmetro do GTM aninha em `list` e `map`, então é recursivo.
function remapGtmParameters(parameters, oldName, newName) {
  if (!Array.isArray(parameters)) return parameters;
  if (!oldName || oldName === newName) return parameters;
  const alvo = `{{${oldName}}}`;
  const troca = `{{${newName}}}`;
  return parameters.map((param) => {
    const out = { ...param };
    if (typeof out.value === 'string') out.value = out.value.split(alvo).join(troca);
    if (Array.isArray(out.list)) out.list = remapGtmParameters(out.list, oldName, newName);
    if (Array.isArray(out.map)) out.map = remapGtmParameters(out.map, oldName, newName);
    return out;
  });
}

// A variável que carrega o Measurement ID: constante (type 'c') cujo valor é um
// ID de GA4. É a convenção dos dois modelos, e o nome dela é o que as tags
// referenciam via {{...}}.
function findMeasurementVariable(containerVersion) {
  return (
    (containerVersion.variable || []).find(
      (v) =>
        v.type === 'c' &&
        (v.parameter || []).some((p) => p.key === 'value' && /^G-[A-Z0-9]+$/i.test(String(p.value || '')))
    ) || null
  );
}

// Sai de uma etapa no meio sem que isso seja falha. Erro de verdade e "já está
// pronto, pode pular" precisavam parar de usar o mesmo caminho.
class PulaEtapa extends Error {
  constructor(motivo) {
    super(motivo || 'etapa pulada');
    this.name = 'PulaEtapa';
  }
}

// Reproduz o template inteiro dentro de um workspace recém-criado.
// Falha em um item vira aviso e o motor segue, nunca aborta o container por
// causa de uma tag (ADR-007).
async function applyGtmTemplate({ tagmanager, workspacePath, containerVersion, measurementId, push, paced }) {
  const ws = tagmanager.accounts.containers.workspaces;
  // Sem pacer explícito vale o ritmo seguro, quem quiser correr (teste) opta
  // por isso de forma visível, não por esquecimento.
  const ritmo = paced || createApiPacer(push);
  const resumo = { builtIn: 0, variables: 0, triggers: 0, tags: 0, falhas: [] };
  const falhou = (item, e) => {
    resumo.falhas.push(`${item}: ${e.message}`);
    push(`Não consegui criar ${item}: ${e.message}. Sigo com o resto do template.`, 'warn');
  };

  // 1. Variáveis embutidas, não se criam, se habilitam, e por um endpoint
  //    próprio (built_in_variables.create), não pelo variables.create.
  const tiposEmbutidos = [...new Set((containerVersion.builtInVariable || []).map((v) => v.type).filter(Boolean))];

  // Estimativa honesta antes de começar: numa cota de 30/min, 32 escritas são
  // mais de um minuto de relógio. Melhor dizer isso do que parecer travado.
  const totalChamadas =
    (tiposEmbutidos.length ? 1 : 0) +
    (containerVersion.variable || []).length +
    (containerVersion.trigger || []).length +
    (containerVersion.tag || []).length;
  if (totalChamadas > 10) {
    push(
      `${totalChamadas} chamadas a fazer. A API do Tag Manager limita ~30 por minuto, ` +
        'então isto vai levar cerca de ' + Math.ceil((totalChamadas * GTM_MIN_INTERVAL_MS) / 60000) + ' min.',
      'info'
    );
  }
  if (tiposEmbutidos.length) {
    push(`Habilitando ${tiposEmbutidos.length} variáveis embutidas`, 'cmd');
    try {
      await ritmo('variáveis embutidas', () =>
        ws.built_in_variables.create({ parent: workspacePath, type: tiposEmbutidos })
      );
      resumo.builtIn = tiposEmbutidos.length;
    } catch (e) {
      // Em lote a API recusa tudo se um tipo for inválido, repete uma a uma
      // pra salvar as válidas.
      push(`Lote de variáveis embutidas recusado (${e.message}). Tentando uma a uma.`, 'warn');
      for (const type of tiposEmbutidos) {
        try {
          await ritmo(`embutida ${type}`, () =>
            ws.built_in_variables.create({ parent: workspacePath, type: [type] })
          );
          resumo.builtIn++;
        } catch (e2) {
          falhou(`variável embutida ${type}`, e2);
        }
      }
    }
  }

  // 2. Variável do Measurement ID, o nome dela no container novo é o próprio
  //    ID novo, e é esse nome que as tags passam a referenciar.
  const varMedicao = findMeasurementVariable(containerVersion);
  const nomeAntigo = varMedicao?.name || null;
  const nomeNovo = measurementId;

  if (varMedicao) {
    push(`Criando variável do Measurement ID (${nomeNovo})`, 'cmd');
    try {
      await ritmo(`variável ${nomeNovo}`, () =>
        ws.variables.create({
          parent: workspacePath,
          requestBody: {
            ...stripGtmServerFields(varMedicao),
            name: nomeNovo,
            parameter: (varMedicao.parameter || []).map((p) =>
              p.key === 'value' ? { ...p, value: measurementId } : p
            ),
          },
        })
      );
      resumo.variables++;
    } catch (e) {
      falhou(`variável ${nomeNovo}`, e);
    }
  } else {
    push('O template não tem variável constante de Measurement ID, as tags podem ficar sem referência.', 'warn');
  }

  // 3. Demais variáveis do template, se houver.
  for (const variavel of containerVersion.variable || []) {
    if (varMedicao && variavel.variableId === varMedicao.variableId) continue;
    try {
      await ritmo(`variável ${variavel.name}`, () =>
        ws.variables.create({
          parent: workspacePath,
          requestBody: {
            ...stripGtmServerFields(variavel),
            parameter: remapGtmParameters(variavel.parameter, nomeAntigo, nomeNovo),
          },
        })
      );
      resumo.variables++;
    } catch (e) {
      falhou(`variável ${variavel.name}`, e);
    }
  }

  // 4. Triggers. O GTM atribui IDs novos, então guarda o de-para, as tags
  //    referenciam os IDs do template, que não valem mais nada aqui.
  const mapaTriggers = new Map();
  const triggers = containerVersion.trigger || [];
  if (triggers.length) push(`Criando ${triggers.length} triggers do template`, 'cmd');
  for (const trigger of triggers) {
    try {
      const res = await ritmo(`trigger "${trigger.name}"`, () =>
        ws.triggers.create({
          parent: workspacePath,
          requestBody: {
            ...stripGtmServerFields(trigger),
            // Os filtros referenciam variáveis embutidas pelo nome literal
            // ({{Click ID}}), isso não muda de container pra container.
            filter: trigger.filter,
          },
        })
      );
      const novoId = res?.data?.triggerId;
      if (novoId) mapaTriggers.set(String(trigger.triggerId), String(novoId));
      resumo.triggers++;
    } catch (e) {
      falhou(`trigger "${trigger.name}"`, e);
    }
  }

  // Trigger que não está no template é built-in (o "All Pages", 2147479553, é
  // o mesmo número em todo container), esse passa direto, sem tradução.
  const traduzTriggers = (ids) =>
    (ids || []).map((id) => mapaTriggers.get(String(id)) || String(id));

  // 5. Tags, com os dois remapeamentos: trigger e nome da variável.
  const tags = containerVersion.tag || [];
  if (tags.length) push(`Criando ${tags.length} tags do template`, 'cmd');
  for (const tag of tags) {
    const corpo = {
      ...stripGtmServerFields(tag),
      parameter: remapGtmParameters(tag.parameter, nomeAntigo, nomeNovo),
    };
    if (tag.firingTriggerId) corpo.firingTriggerId = traduzTriggers(tag.firingTriggerId);
    if (tag.blockingTriggerId) corpo.blockingTriggerId = traduzTriggers(tag.blockingTriggerId);

    // Tag cujo trigger falhou no passo anterior ficaria pendurada num ID do
    // template, que aponta pra outra coisa no container novo. Melhor não criar.
    const orfaos = (tag.firingTriggerId || []).filter(
      (id) => triggers.some((t) => String(t.triggerId) === String(id)) && !mapaTriggers.has(String(id))
    );
    if (orfaos.length) {
      push(`Tag "${tag.name}" pulada: o trigger dela não foi criado.`, 'warn');
      resumo.falhas.push(`tag ${tag.name}: trigger ausente`);
      continue;
    }

    try {
      await ritmo(`tag "${tag.name}"`, () => ws.tags.create({ parent: workspacePath, requestBody: corpo }));
      resumo.tags++;
    } catch (e) {
      falhou(`tag "${tag.name}"`, e);
    }
  }

  resumo.esperasDeCota = ritmo.stats ? ritmo.stats().esperas : 0;
  return resumo;
}

// As etapas que a aba "Criar novo" pode rodar. A ordem é a de execução, e é
// ela que a tela usa para montar as caixas, uma lista, não dois lugares para
// esquecer de mexer.
const CREATE_STEPS = [
  { id: 'analytics', label: 'Propriedade GA4 + data stream' },
  { id: 'gtm', label: 'Container do Tag Manager', requires: 'analytics' },
  { id: 'recaptcha', label: 'Chave do reCAPTCHA' },
  { id: 'searchconsole', label: 'Token do Search Console' },
];
const CREATE_STEP_IDS = CREATE_STEPS.map((e) => e.id);

// Sem lista, roda tudo, é o comportamento de antes, e chamada antiga não pode
// virar "não criou nada" calada.
function normalizeCreateSteps(steps) {
  if (!Array.isArray(steps)) return [...CREATE_STEP_IDS];
  const pedidos = steps.map((x) => String(x));
  return CREATE_STEP_IDS.filter((id) => pedidos.includes(id));
}

ipcMain.handle('google:createProject', async (event, { domain: dominioBruto, saPath, brand, steps, apenasExistentes, empresaGtm }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });

  const domain = normalizeDomain(dominioBruto);

  try {
    if (!domain) throw new Error('Domínio vazio ou inválido.');
    if (domain !== String(dominioBruto || '').trim()) {
      push(`Domínio normalizado: "${dominioBruto}" → "${domain}"`, 'info');
    }
    if (!saPath || !fs.existsSync(saPath)) {
      return { ok: false, error: 'Arquivo da service account não encontrado. Configure o caminho nas configurações.', log };
    }
    const saJson = JSON.parse(fs.readFileSync(saPath, 'utf-8'));
    const gcpProjectId = saJson.project_id;
    if (!gcpProjectId) throw new Error('Não achei "project_id" no arquivo da service account.');
    // Aparece nos diagnósticos: saber QUAL e-mail precisa ser adicionado é
    // metade da solução quando o problema é acesso.
    const identidadeSa = saJson.client_email ? `a service account ${saJson.client_email}` : 'a service account';

    // A conta humana que precisa enxergar os containers criados. Configurável,
    // com o login OAuth como plano B.
    const gConfigCriar = fs.existsSync(googleConfigPath())
      ? JSON.parse(fs.readFileSync(googleConfigPath(), 'utf-8'))
      : {};
    const ownerEmail = (gConfigCriar.ownerEmail || '').trim();

    const matchesBrand = brandFilter(brand);
    push(`Projeto: ${brandName(brand)}`, 'info');

    // Um projeto MPI+ pode ser da Busca Cliente ou da MPI Solutions, e quem diz
    // é o contato técnico no Registro.br (ADR-063). Quando é da MPI Solutions,
    // as tags têm que nascer na conta DELA e ficar com o login dela: é lá que a
    // equipe da MPI Solutions procura o container (ADR-067). Analytics e Search
    // Console não mudam, continuam na conta da marca.
    const marcaGtm = brand === 'mpiplus' && empresaGtm === 'mpisolutions' ? 'mpisolutions' : brand;
    if (marcaGtm !== brand) {
      push(
        `O Registro.br diz que este projeto ${brandName(brand)} é da ${brandName(marcaGtm)}: ` +
          'o Tag Manager vai para a conta e o login dela. O resto segue na conta da marca.',
        'info'
      );
    }

    const etapas = normalizeCreateSteps(steps);
    const quer = (id) => etapas.includes(id);
    if (!etapas.length) {
      return { ok: false, error: 'Nenhuma etapa selecionada, marque pelo menos uma coisa para criar.', log };
    }
    // O container reproduz o modelo da marca com a variável de medição
    // apontando para o GA4 recém-criado. Sem o GA4, essa variável sairia vazia
    // e o container ficaria com cara de pronto rastreando nada, recuso a
    // combinação em vez de entregar isso.
    for (const etapa of CREATE_STEPS) {
      if (etapa.requires && quer(etapa.id) && !quer(etapa.requires)) {
        const dep = CREATE_STEPS.find((e) => e.id === etapa.requires);
        return {
          ok: false,
          error: `"${etapa.label}" depende de "${dep.label}", marque as duas ou desmarque as duas.`,
          log,
        };
      }
    }
    push(
      `Etapas: ${etapas.map((id) => CREATE_STEPS.find((e) => e.id === id).label).join(' · ')}` +
        (etapas.length < CREATE_STEP_IDS.length ? ` (${CREATE_STEP_IDS.length - etapas.length} não pedida(s))` : ''),
      'info'
    );

    await buildGoogleAuthClient(saPath);

    let measurementId = '';
    let analyticsAccountId = '';
    let analyticsPropertyId = '';
    // O que foi reaproveitado em vez de criado, vira resumo no fim (ADR-041).
    const reaproveitados = [];
    // Modo "só vincular" (ADR-047): não cria nada, e o que não existir entra
    // aqui em vez de virar recurso novo.
    const soVincular = apenasExistentes === true;
    const faltando = [];
    if (soVincular) {
      push('Modo vincular: não vou criar nada, só procuro o que já existe e levo adiante.', 'info');
    }

    if (quer('analytics')) {
      // 1. Google Analytics, cria na conta da marca. Quando a marca tem várias
      // (o caso do Busca Cliente), vai na mais vazia, que é onde tem folga.
      const analyticsadmin = google.analyticsadmin('v1beta');
      push(`GET contas do Analytics de ${brandName(brand)}`, 'cmd');

      const gaCandidates = [];
      const gaExistentes = [];
      const gaTodasAsProps = [];
      const gaVistas = [];
      let gaPageToken;
      do {
        const res = await analyticsadmin.accountSummaries.list({ pageSize: 200, pageToken: gaPageToken });
        for (const summary of res.data.accountSummaries || []) {
          gaVistas.push(summary.displayName);
          if (!matchesBrand(summary.displayName)) continue;
          gaCandidates.push({
            name: summary.account,
            displayName: summary.displayName,
            properties: (summary.propertySummaries || []).length,
          });
          // O Hub batiza a propriedade com o domínio, então reaproveitar sai de
          // graça aqui, sem uma chamada a mais por propriedade (ADR-041).
          for (const ps of summary.propertySummaries || []) {
            gaTodasAsProps.push({
              property: ps.property,
              displayName: ps.displayName,
              conta: summary.displayName,
              contaName: summary.account,
            });
            if (nomeCasaComDominio(ps.displayName, domain)) {
              gaExistentes.push({
                property: ps.property,
                displayName: ps.displayName,
                conta: summary.displayName,
                contaName: summary.account,
              });
            }
          }
        }
        gaPageToken = res.data.nextPageToken;
      } while (gaPageToken);

      if (!gaCandidates.length) {
        push(describeVisibleAccounts(gaVistas, identidadeSa), 'warn');
        throw new Error(
          `Nenhuma conta do Analytics de "${brandName(brand)}" casou com o filtro da marca. ` +
            'Confira a lista de contas visíveis acima: se a conta certa está lá, o padrão da marca no main.js é que não bate com o nome dela.'
        );
      }
      gaCandidates.sort((a, b) => a.properties - b.properties);
      const gaAccount = gaCandidates[0];
      push(
        `Conta do Analytics: ${gaAccount.displayName} (${gaAccount.properties} propriedades)` +
          (gaCandidates.length > 1 ? `, a mais vazia entre as ${gaCandidates.length} da marca` : ''),
        'info'
      );

      // O nome não achou? Procura pelo domínio declarado no data stream. É mais
      // caro (uma chamada por propriedade), mas é o único jeito de achar quem
      // foi batizado fora de qualquer padrão, e foi o que deixou o
      // servicos2ems.com.br ser criado duas vezes (ADR-046).
      if (!gaExistentes.length && gaTodasAsProps.length) {
        push(`Nenhuma propriedade com o nome "${domain}"; procurando pelo domínio dos data streams (cache + contas mais novas primeiro, ADR-131)`, 'cmd');
        // Para no primeiro casamento: uma existente já basta para não criar
        // outra (o que importa). Duplicatas entre as que já estão no cache são
        // vistas de graça na passada do cache, e o cache só cresce.
        const v = await varrerDataStreams(analyticsadmin, gaTodasAsProps, (item, web) => web.some((w) => dominioDeUri(w.uri) === domain), push);
        for (const p of v.achadas) gaExistentes.push({ property: p.property, displayName: p.displayName, conta: p.conta, contaName: p.contaName });
        if (gaExistentes.length) {
          push(`Achei pelo domínio do data stream: ${gaExistentes.map((p) => p.property).join(', ')}`, 'success');
        }
      }

      // Já existe? Então não cria outra. Rodar de novo com propriedade nova
      // mandaria um Measurement ID novo para o site e deixaria órfã a que está
      // coletando, estrago que só aparece quando alguém abre o relatório.
      if (gaExistentes.length > 1) {
        push(
          `${gaExistentes.length} propriedades GA4 já se chamam "${domain}" ` +
            `(${gaExistentes.map((p) => `${p.property} em ${p.conta}`).join('; ')}). ` +
            'Não vou escolher nem criar outra, apague a que não serve e rode de novo.',
          'warn'
        );
        throw new Error(`Analytics ambíguo: ${gaExistentes.length} propriedades com o nome "${domain}".`);
      }

      if (!gaExistentes.length && soVincular) {
        push(
          `Nenhuma propriedade GA4 para "${domain}", nem pelo nome, nem pelo domínio do data stream. ` +
            'No modo vincular eu não crio: esse site precisa passar pelo "Criar novo" antes.',
          'warn'
        );
        faltando.push('Analytics');
      }

      let property;
      if (!gaExistentes.length && soVincular) {
        property = null;
      } else if (gaExistentes.length === 1) {
        property = { name: gaExistentes[0].property };
        push(`Propriedade GA4 já existe em ${gaExistentes[0].conta}: ${property.name}, reaproveitando.`, 'success');
        push('GET data streams da propriedade', 'cmd');
        const streamsRes = await analyticsadmin.properties.dataStreams.list({ parent: property.name });
        const web = (streamsRes.data.dataStreams || []).find((st) => st.webStreamData?.measurementId);
        if (web) {
          measurementId = web.webStreamData.measurementId;
          // A conta é a em que a propriedade REALMENTE está, não a mais vazia
          // que seria escolhida para criar.
          analyticsAccountId = String(gaExistentes[0].contaName || '').split('/').pop() || '';
          analyticsPropertyId = property.name;
          push(`Measurement ID: ${measurementId} (do stream que já existia)`, 'success');
          reaproveitados.push('Analytics');
        } else {
          if (soVincular) {
            push(
              'A propriedade existe mas não tem data stream web, e sem stream não há Measurement ID para vincular. ' +
                'No modo vincular eu não crio o stream: abra a propriedade e crie, ou use "Criar novo".',
              'warn'
            );
            faltando.push('data stream do Analytics');
          } else {
            push('A propriedade existe mas não tem data stream web, vou criar o stream.', 'warn');
          }
        }
      } else {
        push(`POST criar propriedade GA4 → ${domain}`, 'cmd');
        const propertyRes = await analyticsadmin.properties.create({
          requestBody: {
            parent: gaAccount.name,
            displayName: domain,
            timeZone: 'America/Sao_Paulo',
            currencyCode: 'BRL',
            industryCategory: 'OTHER',
          },
        });
        property = propertyRes.data;
        push(`Propriedade GA4 criada: ${property.name}`, 'success');
      }

      if (!measurementId && property) {
      push('POST criar data stream web', 'cmd');
      const streamRes = await analyticsadmin.properties.dataStreams.create({
        parent: property.name,
        requestBody: {
          type: 'WEB_DATA_STREAM',
          displayName: domain,
          webStreamData: { defaultUri: `https://${domain}` },
        },
      });
      measurementId = streamRes.data.webStreamData.measurementId;
      // O painel da MPI+ pede os dois: o id numérico da CONTA e o nome da
      // propriedade. Até agora só o Measurement ID saía daqui.
      analyticsAccountId = String(gaAccount.name || '').split('/').pop() || '';
      analyticsPropertyId = property.name || '';
      push(`Measurement ID: ${measurementId}`, 'success');
      }
    } else {
      push('Analytics não pedido, nenhuma propriedade GA4 criada.', 'info');
    }

    // 2. Google Tag Manager
    let tagmanagerPublicId = '';
    let gtmSummary = null;
    if (quer('gtm')) {
      try {
        const tagmanager = google.tagmanager('v2');
        // Um pacer para a etapa inteira: listar, criar, aplicar o template e
        // publicar dividem a mesma cota por minuto. Contadores separados
        // recomeçariam o relógio e a rajada voltaria na publicação, que foi
        // justamente onde a primeira tentativa morreu.
        const ritmo = createApiPacer(push);

        push(`GET contas do Tag Manager de ${brandName(brand)}`, 'cmd');
        const gtmAccountsRes = await ritmo('listar contas', () => tagmanager.accounts.list());
        const matchesBrandGtm = brandFilter(marcaGtm, 'gtm');
        const gtmVistas = (gtmAccountsRes.data.account || []).map((a) => a.name);
        const gtmCandidates = (gtmAccountsRes.data.account || []).filter((a) => matchesBrandGtm(a.name));
        if (!gtmCandidates.length) {
          push(describeVisibleAccounts(gtmVistas, identidadeSa), 'warn');
          throw new Error(
            `Nenhuma conta do Tag Manager de "${brandName(brand)}" casou com o filtro da marca. ` +
              'Se a conta certa aparece na lista acima, o padrão da marca é que não bate com o nome dela.'
          );
        }
        const gtmAccount = gtmCandidates[0];
        push(`Conta do Tag Manager: ${gtmAccount.name}`, 'info');

        push('GET containers existentes (checando duplicidade)', 'cmd');
        const existingRes = await ritmo('listar containers', () =>
          tagmanager.accounts.containers.list({ parent: gtmAccount.path })
        );
        // Mesma regra do Analytics (ADR-046): o nome pode ter sufixo, e o
        // container também declara os domínios dele, qualquer um dos dois serve.
        const iguais = (existingRes.data.container || []).filter(
          (c) =>
            nomeCasaComDominio(c.name, domain) ||
            (c.domainName || []).some((d) => normalizeDomain(d) === domain)
        );
        if (iguais.length > 1) {
          throw new Error(
            `${iguais.length} containers já se chamam "${domain}" (${iguais.map((c) => c.publicId).join(', ')}). ` +
              'Não vou escolher nem criar outro, apague o que não serve e rode de novo.'
          );
        }
        const duplicate = iguais[0] || null;

        if (!duplicate && soVincular) {
          push(
            `Nenhum container do Tag Manager para "${domain}" nesta conta, nem pelo nome, nem pelos domínios declarados. ` +
              'No modo vincular eu não crio.',
            'warn'
          );
          faltando.push('Tag Manager');
          throw new PulaEtapa();
        }

        let container;
        if (duplicate) {
          container = duplicate;
          push(`Container GTM já existe: ${container.publicId}, reaproveitando, não vou criar outro.`, 'success');
          reaproveitados.push('Tag Manager');
        } else {
          push(`POST criar container GTM → ${domain}`, 'cmd');
          const containerRes = await ritmo('criar container', () =>
            tagmanager.accounts.containers.create({
              parent: gtmAccount.path,
              requestBody: { name: domain, usageContext: ['WEB'] },
            })
          );
          container = containerRes.data;
          push(`Container criado: ${container.publicId}`, 'success');
        }

        // Antes de aplicar o template, não depois: se o template falhar no meio,
        // a pessoa precisa conseguir abrir o container e terminar à mão.
        try {
          // A conta da marca primeiro: é ela que opera o Tag Manager desse
          // projeto. O campo global e o login OAuth ficam como reserva, antes
          // eles vinham primeiro, e um projeto de MPI Solutions acabava com a
          // conta da Busca Cliente como administradora (ADR-035).
          const contaDaMarca = googleAccountFor(marcaGtm, 'gtm');
          // Quem decide o "sem reserva" é a marca dona do LOGIN, não a do
          // projeto: as tags da Busca Cliente são operadas pelo login da MPI+
          // (ADR-067), e a MPI+ não aceita substituto (ADR-035). Perguntando
          // pela marca do projeto, um container de busca com o login da MPI+
          // não configurado cairia na conta principal — exatamente o erro que
          // a ADR-035 fechou (ADR-070).
          const marcaDoLogin = BRANDS[marcaGtm]?.contaGtmDe || marcaGtm;
          const soDaMarca = brandRequiresOwnAccount(marcaDoLogin);
          const dono = contaDaMarca || (soDaMarca ? '' : ownerEmail || readOauthToken()?.email || '');
          if (!contaDaMarca && soDaMarca) {
            push(
              (marcaDoLogin === brand
                ? `${brandName(brand)} só opera pela conta dela`
                : `O Tag Manager de ${brandName(brand)} é operado pelo login da ${brandName(marcaDoLogin)}, que só opera pela conta dela`) +
                ', e ela não está configurada, não vou usar a conta principal no lugar. ' +
                'Preencha a conta da marca nas configurações.',
              'warn'
            );
          }
          if (dono) {
            push(
              `Conta que vai administrar o container: ${dono} ` +
                (contaDaMarca
                  ? `(conta de ${brandName(marcaDoLogin)})`
                  : ownerEmail
                    ? '(conta principal, padrão, a marca não tem conta configurada)'
                    : '(do login OAuth, nem a marca nem a conta principal estão configuradas)'),
              contaDaMarca ? 'info' : 'warn'
            );
          }
          if (!dono) {
            push(
              `Nenhuma conta configurada para ${brandName(brand)}, o container vai ficar somente leitura. ` +
                'Preencha a conta da marca nas configurações.',
              'warn'
            );
          } else {
            const r = await grantOwnerContainerAccess({
              tagmanager,
              accountPath: gtmAccount.path,
              containerId: container.containerId,
              email: dono,
              ritmo,
              push,
            });
            if (r.estado === 'criado') {
              push(`${dono} adicionado na conta com acesso de publicação neste container.`, 'success');
            } else if (r.estado === 'atualizado') {
              push(`${dono} agora tem acesso de publicação neste container${r.admin ? ' (é admin da conta, mas a permissão de container é separada)' : ''} (${r.containersAntes} outros preservados).`, 'success');
            }
          }
        } catch (e) {
          // Aqui quem chama é a service account, não o login OAuth, mandar
          // "reconecte sua conta Google" seria apontar pro lugar errado.
          const porEscopo = scopeFailureMessage(e)
            ? ' A service account está sem o escopo tagmanager.manage.users, feche e abra o app para pegar a lista de escopos atualizada.'
            : '';
          push(
            `Não consegui dar acesso da conta principal ao container: ${e.message}.${porEscopo} ` +
              'O container foi criado, ajuste a permissão à mão no Tag Manager.',
            'warn'
          );
        }

        if (duplicate) {
          // Aplicar o template num container que já tem tags duplicaria as 15.
          tagmanagerPublicId = container.publicId;
          push('Container reaproveitado, não vou aplicar o template nem republicar.', 'info');
          throw new PulaEtapa();
        }

        const workspacesRes = await ritmo('listar workspaces', () =>
          tagmanager.accounts.containers.workspaces.list({ parent: container.path })
        );
        const workspace = workspacesRes.data.workspace[0];

        // A estrutura do container vem de um modelo exportado do próprio Tag
        // Manager, por marca, o antigo "1 tag + 1 variável" virou o caso mínimo
        // desse motor, não um caminho separado.
        const modelo = loadGtmTemplate(brand);
        push(
          `Template do GTM: ${modelo.file}` +
            (modelo.borrowedFrom ? ` (emprestado de ${brandName(modelo.borrowedFrom)}, ${brandName(brand)} ainda não tem modelo próprio)` : ''),
          modelo.borrowedFrom ? 'warn' : 'info'
        );

        gtmSummary = await applyGtmTemplate({
          tagmanager,
          workspacePath: workspace.path,
          containerVersion: modelo.containerVersion,
          measurementId,
          push,
          paced: ritmo,
        });
        push(
          `Template aplicado: ${gtmSummary.tags} tag(s), ${gtmSummary.triggers} trigger(s), ` +
            `${gtmSummary.variables} variável(is), ${gtmSummary.builtIn} embutida(s)` +
            (gtmSummary.esperasDeCota ? `, com ${gtmSummary.esperasDeCota} pausa(s) por cota` : '') +
            '.',
          gtmSummary.falhas.length ? 'warn' : 'success'
        );

        // Container publicado pela metade é pior que container nenhum: o site
        // acaba com rastreamento parcial e ninguém percebe. Diz o que fazer.
        if (gtmSummary.falhas.length) {
          push(
            `${gtmSummary.falhas.length} item(ns) do template não entraram neste container. ` +
              `Apague o container ${container.publicId} no Tag Manager e rode de novo, ou complete à mão, ` +
              'rodar a ferramenta outra vez cria um container NOVO, não completa este.',
            'warn'
          );
        }

        push('Publicando container', 'cmd');
        const versionRes = await ritmo('criar versão', () =>
          tagmanager.accounts.containers.workspaces.create_version({
            path: workspace.path,
            requestBody: { name: `Publicação automática, ${domain}` },
          })
        );
        await ritmo('publicar', () =>
          tagmanager.accounts.containers.versions.publish({
            path: versionRes.data.containerVersion.path,
          })
        );
        tagmanagerPublicId = container.publicId;
        push(`GTM publicado: ${container.publicId}`, 'success');
      } catch (e) {
        // Container reaproveitado sai por PulaEtapa: não é falha, e dizer
        // "FALHOU" aqui era mentir sobre o que aconteceu (princípio 2 do PRD).
        if (e instanceof PulaEtapa) {
          if (tagmanagerPublicId) push('Tag Manager: container existente reaproveitado, etapa concluída sem criar nada.', 'success');
          // O outro caminho (modo vincular sem container) já avisou acima.
        }
        else push(`ETAPA DO TAG MANAGER FALHOU: ${e.message}. Pulando pra próxima etapa, configure o GTM manualmente depois.`, 'warn');
      }
    } else {
      push('Tag Manager não pedido, nenhum container criado.', 'info');
    }

    // 3. reCAPTCHA (Enterprise API, chave compatível com siteverify clássico)
    let siteKey = '';
    let secretKey = '';
    if (quer('recaptcha')) {
      try {
          const recaptcha = google.recaptchaenterprise('v1');

        push('GET chaves reCAPTCHA existentes', 'cmd');
        const jaExistem = [];
        try {
          let tokenPagina;
          do {
            const lista = await recaptcha.projects.keys.list({
              parent: `projects/${gcpProjectId}`,
              pageSize: 200,
              pageToken: tokenPagina,
            });
            for (const k of lista.data.keys || []) {
              if (normalizeName(k.displayName) === normalizeName(domain)) jaExistem.push(k);
            }
            tokenPagina = lista.data.nextPageToken;
          } while (tokenPagina);
        } catch (e) {
          push(`Não consegui listar as chaves existentes (${e.message}), vou criar uma nova.`, 'warn');
        }

        if (jaExistem.length > 1) {
          throw new Error(
            `${jaExistem.length} chaves reCAPTCHA já se chamam "${domain}". ` +
              'Não vou escolher nem criar outra, apague a que não serve e rode de novo.'
          );
        }

        if (jaExistem.length === 1) {
          siteKey = jaExistem[0].name.split('/').pop();
          const segredoRes = await recaptcha.projects.keys.retrieveLegacySecretKey({ key: jaExistem[0].name });
          secretKey = segredoRes.data.legacySecretKey;
          push(`Chave reCAPTCHA já existe: ${siteKey}, reaproveitando.`, 'success');
          reaproveitados.push('reCAPTCHA');
          throw new PulaEtapa();
        }

        if (soVincular) {
          push(
            `Nenhuma chave reCAPTCHA chamada "${domain}", no modo vincular eu não crio. ` +
              'Se o site usa formulário, crie a chave pelo "Criar novo".',
            'warn'
          );
          faltando.push('reCAPTCHA');
          throw new PulaEtapa();
        }

        push(`POST criar chave reCAPTCHA (v2 checkbox) → ${domain}`, 'cmd');
        const keyRes = await recaptcha.projects.keys.create({
          parent: `projects/${gcpProjectId}`,
          requestBody: {
            displayName: domain,
            webSettings: { integrationType: 'CHECKBOX', allowedDomains: [domain] },
          },
        });
        const keyName = keyRes.data.name;
        siteKey = keyName.split('/').pop();

        const secretRes = await recaptcha.projects.keys.retrieveLegacySecretKey({ key: keyName });
        secretKey = secretRes.data.legacySecretKey;
        push(`reCAPTCHA criado: ${siteKey}`, 'success');
      } catch (e) {
        if (!(e instanceof PulaEtapa)) {
          push(`ETAPA DO RECAPTCHA FALHOU: ${e.message}. Pulando pra próxima etapa, crie a chave manualmente depois.`, 'warn');
        }
      }
    } else {
      push('reCAPTCHA não pedido, nenhuma chave criada.', 'info');
    }

    // 4. Search Console (token de verificação, a confirmação em si acontece depois do deploy)
    let googleSearchConsole = '';
    // O que vai para o campo do painel, quando for diferente do token da meta.
    let searchConsolePainel = '';
    const siteUrl = searchConsoleSiteUrl(domain, brand);
    const scMetodo = searchConsoleMethodFor(brand);
    if (quer('searchconsole')) {
      try {
        const siteVerification = google.siteVerification('v1');
        push(`Gerando token de verificação do Search Console (${scMetodo}) para ${siteUrl}`, 'cmd');
        const tokenRes = await siteVerification.webResource.getToken({
          requestBody: { site: { type: 'SITE', identifier: siteUrl }, verificationMethod: scMetodo },
        });
        const tokenBruto = tokenRes.data.token;
        googleSearchConsole = extractSiteVerificationToken(tokenBruto);

        // Para o painel, a marca pode querer outro valor, a MPI+ quer a linha
        // do arquivo, que é o que a equipe cola ali hoje (ADR-043). São tokens
        // diferentes, emitidos separadamente: não dá para converter um no outro.
        if (painelScValueMethodFor(brand) === 'FILE') {
          push('GET token de ARQUIVO do Search Console (é o que vai para o campo do painel)', 'cmd');
          const arquivoRes = await siteVerification.webResource.getToken({
            requestBody: { site: { type: 'SITE', identifier: siteUrl }, verificationMethod: 'FILE' },
          });
          searchConsolePainel = buildFileVerificationValue(arquivoRes.data.token);
          push(`Valor para o painel: ${searchConsolePainel}`, 'success');
          push(
            'O painel injeta isso como meta tag. A verificação não depende dela, ' +
              'é pelo Analytics (ADR-040), então a tag ficar "estranha" no site não quebra nada.',
            'info'
          );
        }

        if (googleSearchConsole) {
          push(`Token do Search Console: ${googleSearchConsole}, verifique depois do deploy`, 'success');
          if (!googleAccountFor(brand)) {
            push(
              `Sem proprietário do Search Console configurado para ${brandName(brand)}: na hora de verificar, ` +
                'a propriedade vai ficar só com a service account. Preencha o campo da marca nas configurações.',
              'warn'
            );
          }
        } else {
          push(`O Search Console devolveu um formato que não reconheci e não consegui extrair o token: ${tokenBruto}`, 'warn');
        }
      } catch (e) {
        push(`ETAPA DO SEARCH CONSOLE FALHOU: ${e.message}. Gere o token manualmente depois.`, 'warn');
      }
    } else {
      push('Search Console não pedido, nenhum token gerado.', 'info');
    }

    if (reaproveitados.length) {
      push(`Reaproveitado (não criei de novo): ${reaproveitados.join(', ')}.`, 'success');
    }
    if (faltando.length) {
      push(`Não existia e eu não criei (modo vincular): ${faltando.join(', ')}.`, 'warn');
    }

    return {
      ok: true,
      log,
      result: {
        domain, steps: etapas, reaproveitados, faltando, soVincular, idAnalytics: measurementId, analyticsAccountId, analyticsPropertyId,
        searchConsolePainel,
        tagmanager: tagmanagerPublicId, googleSearchConsole, siteKey, secretKey, siteUrl, gtmSummary,
      },
    };
  } catch (e) {
    const sa = diagnosticoChaveSa(e);
    if (sa) {
      push(sa, 'error');
      return { ok: false, error: sa, saInvalida: true, log };
    }
    push(`Erro: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// O Google recusou a chave da service account? "Invalid JWT Signature" quer
// dizer que a chave do arquivo configurado não existe mais no Google Cloud
// (revogada ou apagada, como na troca de credenciais). Outro "Invalid JWT" é
// relógio fora de hora. Nos dois casos não adianta tentar site a site: a
// rodada em massa para de chamar o Google e segue o resto (ADR-092). Erro de
// login OAuth (token revogado) não tem "JWT" e não cai aqui.
function diagnosticoChaveSa(e) {
  const dados = e?.response?.data || {};
  const texto = `${e?.message || ''} ${dados.error || ''} ${dados.error_description || ''}`;
  if (!/invalid_grant/i.test(texto)) return null;
  if (/Invalid JWT Signature/i.test(texto)) {
    return 'O Google recusou a chave da service account (invalid_grant: Invalid JWT Signature). A chave do arquivo configurado foi revogada ou apagada no Google Cloud — foi o que aconteceu na troca das credenciais. Gere uma chave nova para a service account, salve o JSON FORA da pasta do projeto e aponte o caminho em Configurações > "Caminho do arquivo da Service Account".';
  }
  if (/Invalid JWT/i.test(texto)) {
    return 'O Google recusou o token da service account por causa do horário (invalid_grant: Invalid JWT). Confira se o relógio do Windows está certo: Configurações > Hora e idioma > Sincronizar agora.';
  }
  return null;
}

// invalid_grant numa sessão OAuth (conta da marca): o Google não aceita mais o
// refresh token guardado. Revogado, senha trocada, ou o app OAuth está em modo
// "Teste" no Google Cloud, que derruba o token a cada 7 dias (ADR-099). Não
// tem nada a ver com API desabilitada, que é outro erro (SERVICE_DISABLED).
function ehSessaoOauthRecusada(e) {
  const dados = e?.response?.data || {};
  const texto = `${e?.message || ''} ${dados.error || ''} ${dados.error_description || ''}`;
  return /invalid_grant/i.test(texto) && !/JWT/i.test(texto);
}

function ehApiDesabilitada(e) {
  const dados = e?.response?.data?.error || {};
  const texto = `${e?.message || ''} ${dados.status || ''} ${JSON.stringify(dados.details || '')}`;
  return /SERVICE_DISABLED|has not been used in project|is disabled|accessNotConfigured/i.test(texto);
}

// "cliente.com.br", "cliente.com.br - GA4", "cliente.com.br | GA4", o mesmo
// site. O que NÃO pode casar é "cliente.com.br.old" ou "cliente.com.brasil":
// depois do domínio tem que vir um separador, não mais letra (ADR-046).
function nomeCasaComDominio(nome, domain) {
  const n = String(nome || '').trim().toLowerCase();
  const d = String(domain || '').trim().toLowerCase();
  if (!n || !d) return false;
  if (n === d) return true;
  if (!n.startsWith(d)) return false;
  // Ponto NÃO serve de separador: "cliente.com.br.old" é outro domínio, não o
  // mesmo com sufixo. Hífen, barra, pipe, parêntese e espaço servem.
  return /^[\s\-|(\[_/]/.test(n.slice(d.length));
}

// O domínio que um data stream declara. É aqui que o domínio realmente mora, // o nome da propriedade é convenção de quem criou, e varia (ADR-016).
function dominioDoStream(stream) {
  const uri = stream?.webStreamData?.defaultUri || '';
  if (!uri) return '';
  try {
    return new URL(uri.includes('://') ? uri : `https://${uri}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch (e) {
    return '';
  }
}

// O domínio como o resto do mundo espera: sem protocolo, sem www, sem caminho,
// sem barra no fim. É ele que vira nome de propriedade, nome de container,
// domínio permitido do reCAPTCHA e slug do repositório, colar o endereço da
// barra do navegador ("http://site.com.br/") estragava os quatro de uma vez,
// e ainda fazia o reaproveitamento não achar o que já existia (ADR-044).
function normalizeDomain(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    // "//site.com.br" (sem esquema) sobrava: o split por "/" devolvia string
    // vazia e o domínio sumia inteiro.
    .replace(/^\/+/, '')
    .split(/[/?#]/)[0]
    .replace(/^www\./, '')
    .replace(/\.+$/, '');
}

// A propriedade do Search Console é do endereço COM www, é nele que o site
// responde. Propriedade de prefixo de URL é por prefixo exato: verificar
// "https://dominio/" não dá nada em "https://www.dominio/", são duas
// propriedades diferentes para o Google.
function searchConsoleSiteUrl(domain, brand) {
  const limpo = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .split('/')[0];
  if (!limpo) return '';

  // A marca decide se a propriedade é a do www ou a do domínio puro. São duas
  // propriedades diferentes para o Google, e usar a errada é verificar um
  // endereço que ninguém consulta.
  const querWww = BRANDS[brand]?.searchConsoleWww !== false;
  const semWww = limpo.replace(/^www\./, '');
  const host = querWww ? (limpo.startsWith('www.') ? limpo : `www.${limpo}`) : semWww;
  return `https://${host}/`;
}

// Duas perguntas diferentes, que eu tratei como uma só e me custou caro:
//
//   1. Que TOKEN o app gera? Sempre META, é ele que vai para o geral.php das
//      outras marcas e para o campo "Key" do painel da MPI+, que injeta uma
//      meta tag com o valor que receber.
//   2. Por qual MÉTODO o Google verifica? Aí depende da marca.
//
// Misturar as duas foi o que produziu a meta tag com a linha do arquivo dentro
// (ADR-039).
function searchConsoleMethodFor() {
  return 'META';
}

function searchConsoleVerifyMethodFor(brand) {
  return BRANDS[brand]?.searchConsoleVerify || 'META';
}

// O que vai para o campo do painel: o conteúdo do arquivo, ou o token da meta.
function painelScValueMethodFor(brand) {
  return BRANDS[brand]?.painelScValue === 'FILE' ? 'FILE' : 'META';
}

const SC_FILE_PREFIX = 'google-site-verification: ';

// A linha de dentro do arquivo que o Search Console manda baixar. Idempotente:
// nome de arquivo ganha o prefixo, valor já pronto passa direto.
function buildFileVerificationValue(tokenBruto) {
  const texto = String(tokenBruto || '').trim();
  if (!texto) return '';
  if (texto.toLowerCase().startsWith(SC_FILE_PREFIX.trim().toLowerCase())) return texto;
  return `${SC_FILE_PREFIX}${texto}`;
}

// A conta humana DA MARCA. Vale para as duas coisas que precisam de um dono de
// verdade: o acesso ao container do Tag Manager recém-criado (ADR-020) e a posse
// da propriedade do Search Console (ADR-028), quem faz as duas é a service
// account, que não tem login de navegador. Cada marca opera pela sua conta, e
// por isso isto é por marca e não global (ADR-035).
// A superfície importa: a Busca Cliente opera o Tag Manager por um login
// diferente do que usa no Analytics e no Search Console (ADR-067). Quando a
// marca não declara nada, as três superfícies usam a mesma conta, como antes.
function googleAccountFor(brand, surface = 'analytics') {
  if (ehSlotRelatorio(brand)) return contaRelatorioDoSlot(brand);
  try {
    if (!fs.existsSync(googleConfigPath())) return '';
    const cfg = JSON.parse(fs.readFileSync(googleConfigPath(), 'utf-8'));
    const marcaDaConta = surface === 'gtm' ? BRANDS[brand]?.contaGtmDe || brand : brand;
    if (marcaDaConta !== brand) {
      const mapaGtm = cfg.brandAccounts || cfg.scOwners || {};
      return String(mapaGtm[marcaDaConta] || '').trim();
    }
    // scOwners é o nome antigo, de quando isto só servia ao Search Console
    // (ADR-035). Lido como reserva para não perder o que já estava configurado.
    const mapa = cfg.brandAccounts || cfg.scOwners || {};
    return String(mapa[brand] || '').trim();
  } catch (e) {
    return '';
  }
}

ipcMain.handle('google:verifySearchConsole', async (event, { siteUrl, saPath, brand }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });

  try {
    await buildGoogleAuthClient(saPath);
    const siteVerification = google.siteVerification('v1');

    const metodo = searchConsoleVerifyMethodFor(brand);
    push(`POST verificar ${siteUrl} (${metodo})`, 'cmd');
    const insercao = await siteVerification.webResource.insert({
      verificationMethod: metodo,
      requestBody: { site: { type: 'SITE', identifier: siteUrl } },
    });
    const recurso = insercao.data || {};
    const donosAtuais = (recurso.owners || []).filter(Boolean);
    push(`Site verificado. Proprietário hoje: ${donosAtuais.join(', ') || 'a service account'}.`, 'success');

    const dono = googleAccountFor(brand);
    if (!dono) {
      push(
        `Nenhuma conta configurada para ${brandName(brand)}, a propriedade ficou ` +
          'só com a service account, que não tem login de navegador. Preencha o campo da marca nas ' +
          'configurações e clique em verificar de novo.',
        'warn'
      );
      return { ok: true, log, owners: donosAtuais, ownerAdded: null };
    }

    if (donosAtuais.some((e) => e.toLowerCase() === dono.toLowerCase())) {
      push(`${dono} já é proprietário desta propriedade.`, 'info');
      return { ok: true, log, owners: donosAtuais, ownerAdded: null };
    }

    if (!recurso.id) {
      push('A verificação não devolveu o id do recurso, não consigo adicionar o proprietário.', 'warn');
      return { ok: true, log, owners: donosAtuais, ownerAdded: null };
    }

    // A lista é substituída inteira, então os donos atuais vão junto: mandar só
    // o novo tentaria remover a service account, e a API recusa isso enquanto o
    // token dela estiver no site.
    push(`PUT adicionar ${dono} como proprietário`, 'cmd');
    const atualizacao = await siteVerification.webResource.update({
      id: recurso.id,
      requestBody: {
        site: recurso.site || { type: 'SITE', identifier: siteUrl },
        owners: [...donosAtuais, dono],
      },
    });
    const donosFinais = (atualizacao.data?.owners || []).filter(Boolean);
    push(`${dono} agora é proprietário de ${siteUrl}.`, 'success');
    push(
      'Se a propriedade não aparecer sozinha na lista do Search Console dessa conta, adicione o ' +
        'domínio por lá: como ela já é proprietária, a verificação passa sem pedir tag nova.',
      'info'
    );
    return { ok: true, log, owners: donosFinais, ownerAdded: dono };
  } catch (e) {
    push(`Erro: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// ---------- Search Console: verificar de fato e mandar o sitemap ----------
//
// Na MPI+ a verificação é por ARQUIVO, e quem publica o arquivo no site é o
// painel. Isso cria uma ordem que não existia nas outras marcas (ADR-038):
//
//   sincronizar as integrações → o arquivo vai ao ar → VERIFICAR → sitemap →
//   sincronizar o relatório
//
// Verificar antes do arquivo estar no ar dá "The necessary verification token
// could not be found on your site", e o trilho do Search Console no painel
// nasce "fail" porque a propriedade nunca foi validada.

const SC_ESPERAS_MS = [0, 5000, 10000, 20000, 30000];

// O HTTPS do domínio responde com o certificado de outro nome (o do servidor,
// srv-wp-02…) ou sem certificado válido: o SSL de produção ainda não foi
// ativado. Esperar segundos não resolve, e o Google não verifica sem ele
// (ADR-100).
function ehErroDeCertificado(msg) {
  return /altnames|certificate|CERT_|self[- ]signed|unable to verify|SSL routines|ERR_TLS/i.test(String(msg || ''));
}

function erroSslPendente(siteUrl, msg) {
  let host = siteUrl;
  try { host = new URL(siteUrl).hostname; } catch (e) {}
  const doServidor = (String(msg || '').match(/DNS:([^\s,]+)/) || [])[1];
  const e = new Error(
    `o HTTPS de ${host} ainda não tem o certificado do domínio${doServidor ? ` (o servidor responde com o de ${doServidor.replace(/\.$/, '')})` : ''}: ` +
      'o SSL de produção não está ativo. O Google não verifica a propriedade sem ele. Ative o SSL e verifique de novo'
  );
  e.sslPendente = true;
  return e;
}
const SC_HTML_MAX = 60000; // o head vem no começo; baixar o site inteiro é desperdício

// Baixa o começo do HTML da página. Serve para uma pergunta só: a meta tag de
// verificação já está lá, e com o valor certo?
// O host para onde um site pode redirecionar sem deixar de ser o mesmo site:
// ele mesmo, ou a variante com/sem www (ADR-084). Qualquer outro destino é
// outro site, e aí o redirecionamento é reportado, não seguido.
function mesmoSite(hostA, hostB) {
  const tira = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
  return tira(hostA) === tira(hostB);
}

function buscarInicioDaPagina(url, { saltos = 5 } = {}) {
  const redirecionamentos = [];
  const um = (atual) => new Promise((resolve) => {
    const u = new URL(atual);
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search || '/', method: 'GET', headers: { Accept: 'text/html' } },
      (res) => {
        let corpo = '';
        res.setEncoding('utf-8');
        res.on('data', (c) => {
          if (corpo.length < SC_HTML_MAX) corpo += c;
          else res.destroy();
        });
        const fim = () => resolve({ status: res.statusCode, html: corpo, location: res.headers.location || '' });
        res.on('end', fim);
        res.on('close', fim);
      }
    );
    req.on('error', (e) => resolve({ status: 0, erro: e.message }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: 0, erro: 'tempo esgotado' }); });
    req.end();
  });
  return (async () => {
    let atual = url;
    for (let i = 0; i <= saltos; i++) {
      const r = await um(atual);
      const ehRedirect = [301, 302, 303, 307, 308].includes(r.status) && r.location;
      if (!ehRedirect) return { ...r, urlFinal: atual, redirecionamentos };
      let destino;
      try { destino = new URL(r.location, atual).toString(); } catch (e) { return { ...r, urlFinal: atual, redirecionamentos, erro: `redirecionou para um endereço inválido (${r.location})` }; }
      const hostDe = new URL(atual).hostname;
      const hostPara = new URL(destino).hostname;
      redirecionamentos.push({ de: atual, para: destino, status: r.status });
      if (!mesmoSite(hostDe, hostPara)) {
        return { status: r.status, html: '', urlFinal: atual, redirecionamentos, erro: `o site redireciona (${r.status}) para outro domínio: ${destino}` };
      }
      if (!/^https:/i.test(destino)) destino = destino.replace(/^http:/i, 'https:');
      atual = destino;
    }
    return { status: 0, erro: `mais de ${saltos} redirecionamentos seguidos`, urlFinal: atual, redirecionamentos };
  })();
}

// As tags que estão de fato no HTML do site (ADR-145): todos os G-… e GTM-…
// da página inicial e a meta de verificação. É a prova que não depende de o
// painel carregar o estado: painel vazio com tag no ar é leitura suspeita.
// Só GET, seguindo redirecionamentos do mesmo site; outro domínio é avisado.
ipcMain.handle('site:tags', async (event, { dominio } = {}) => {
  const d = normalizeDomain(String(dominio || ''));
  if (!d) return { ok: false, erro: 'domínio inválido' };
  try {
    const Vinculos = require(path.join(__dirname, 'lib', 'vinculos'));
    let r = await buscarInicioDaPagina(`https://${d}/`);
    if ((r.erro || !r.html) && !/outro domínio/.test(r.erro || '')) {
      const www = await buscarInicioDaPagina(`https://www.${d}/`);
      if (www.html && !www.erro) r = www;
    }
    if (r.erro && !r.html) return { ok: false, erro: r.erro, status: r.status || 0, urlFinal: r.urlFinal || '' };
    if (!r.html) return { ok: false, erro: `o site respondeu ${r.status} sem HTML`, status: r.status, urlFinal: r.urlFinal || '' };
    return { ok: true, status: r.status, urlFinal: r.urlFinal || '', ...Vinculos.tagsDoHtml(r.html) };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

// O conteúdo da meta tag de verificação que está no ar, ou ''.
function metaVerificacaoDaPagina(html) {
  const m = String(html || '').match(
    /<meta[^>]+name=["']google-site-verification["'][^>]*content=["']([^"']*)["']/i
  ) || String(html || '').match(
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']google-site-verification["']/i
  );
  return m ? m[1].trim() : '';
}

ipcMain.handle('searchconsole:prepare', async (event, payload) => {
  let { siteUrl } = payload || {};
  const { saPath, brand, verificationValue, analyticsId, sitemapUrl } = payload || {};
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  const siteUrlPedido = siteUrl;

  // Site que redireciona para a variante com/sem www (ADR-084): a página, a
  // tag e a propriedade do Search Console estão no destino, então o destino
  // vira o siteUrl daqui em diante. Outro domínio não é seguido.
  const adotarDestino = (r) => {
    if (!r.redirecionamentos || !r.redirecionamentos.length) return;
    const final = new URL(r.urlFinal);
    final.pathname = '/'; final.search = ''; final.hash = '';
    const novo = final.toString();
    if (novo !== siteUrl) {
      push(`${siteUrl} redireciona (${r.redirecionamentos[0].status}) para ${novo}. A propriedade do Search Console vai ser ${novo}, que é onde o site está.`, 'warn');
      siteUrl = novo;
    }
  };

  try {
    if (!siteUrl) throw new Error('Sem endereço do site, não sei o que verificar.');
    await buildGoogleAuthClient(saPath);
    const siteVerification = google.siteVerification('v1');
    const metodo = searchConsoleVerifyMethodFor(brand);

    // 1. O que precisa estar no ar depende do método. Conferir antes de chamar
    // o Google é o que transforma um erro genérico dele em instrução (ADR-039).
    if (metodo === 'ANALYTICS') {
      let achou = null;
      let ultimo = 'o site não respondeu';
      for (let i = 0; i < SC_ESPERAS_MS.length; i++) {
        if (SC_ESPERAS_MS[i]) {
          push(`Tag do Google ainda não apareceu, esperando ${SC_ESPERAS_MS[i] / 1000}s`, 'info');
          await dormir(SC_ESPERAS_MS[i]);
        }
        push(`GET ${siteUrl}`, 'cmd');
        const r = await buscarInicioDaPagina(siteUrl);
        if (r.erro && ehErroDeCertificado(r.erro)) throw erroSslPendente(siteUrl, r.erro);
        if (r.erro && r.status !== 200) { ultimo = r.erro; continue; }
        if (r.status !== 200) { ultimo = `o site respondeu ${r.status || r.erro}`; continue; }
        adotarDestino(r);
        // O G- pode não aparecer no HTML cru quando o GA entra pelo GTM: achar
        // qualquer um dos dois já basta para valer a pena chamar o Google.
        const temGa = analyticsId && r.html.includes(analyticsId);
        const temGtm = /googletagmanager\.com|GTM-[A-Z0-9]+/i.test(r.html);
        if (temGa || temGtm) { achou = temGa ? 'tag do GA4' : 'container do GTM'; break; }
        ultimo = 'não achei nem a tag do GA4 nem o container do GTM na página';
      }
      if (!achou) {
        throw new Error(
          `A verificação por Google Analytics não vai passar: ${ultimo}. ` +
            'Sincronize as integrações no painel e publique o site antes de verificar.'
        );
      }
      push(`${achou} no ar, dá para verificar pelo Analytics.`, 'success');
    } else if (verificationValue) {
      let achou = null;
      let ultimo = null;
      for (let i = 0; i < SC_ESPERAS_MS.length; i++) {
        if (SC_ESPERAS_MS[i]) {
          push(`Ainda não achei a tag, esperando ${SC_ESPERAS_MS[i] / 1000}s (o site pode estar publicando)`, 'info');
          await dormir(SC_ESPERAS_MS[i]);
        }
        push(`GET ${siteUrl}`, 'cmd');
        const r = await buscarInicioDaPagina(siteUrl);
        if (r.erro && ehErroDeCertificado(r.erro)) throw erroSslPendente(siteUrl, r.erro);
        if (r.erro && r.status !== 200) { ultimo = r.erro; continue; }
        if (r.status !== 200) { ultimo = `o site respondeu ${r.status || r.erro}`; continue; }
        adotarDestino(r);
        const noAr = metaVerificacaoDaPagina(r.html);
        if (noAr === verificationValue) { achou = noAr; break; }
        ultimo = noAr
          ? `a tag no ar diz "${noAr}", e o token é "${verificationValue}"`
          : 'não há meta tag de verificação na página';
        // Valor diferente não melhora esperando: alguém gravou outra coisa.
        if (noAr) break;
      }
      if (!achou) {
        throw new Error(
          `A verificação não vai passar: ${ultimo}. ` +
            'Confira o campo "Key" do Google Search Console no painel, ele injeta uma meta tag, ' +
            'e o valor tem que ser o token puro.'
        );
      }
      push('Meta tag de verificação no ar, com o valor certo.', 'success');
    }

    // 2. Verificar
    push(`POST verificar ${siteUrl} (${metodo})`, 'cmd');
    const insercao = await siteVerification.webResource.insert({
      verificationMethod: metodo,
      requestBody: { site: { type: 'SITE', identifier: siteUrl } },
    });
    const recurso = insercao.data || {};
    const donosAtuais = (recurso.owners || []).filter(Boolean);
    push(`Site verificado. Proprietário: ${donosAtuais.join(', ') || 'a service account'}.`, 'success');

    // 3. Passar a posse para a conta da marca (mesmo passo da ADR-028)
    let ownerAdded = null;
    const dono = googleAccountFor(brand);
    if (dono && !donosAtuais.some((e) => e.toLowerCase() === dono.toLowerCase()) && recurso.id) {
      push(`PUT adicionar ${dono} como proprietário`, 'cmd');
      await siteVerification.webResource.update({
        id: recurso.id,
        requestBody: {
          site: recurso.site || { type: 'SITE', identifier: siteUrl },
          owners: [...donosAtuais, dono],
        },
      });
      ownerAdded = dono;
      push(`${dono} agora é proprietário de ${siteUrl}.`, 'success');
    }

    // 4. Registrar a propriedade e mandar o sitemap.
    //
    // sites.add adiciona a propriedade na lista de QUEM CHAMA (ADR-049). Feito
    // pela service account, ela nasce na lista da service account, por isso
    // ela aparecia "já validada" para a conta da marca, mas só depois que
    // alguém a adicionasse à mão. Com a sessão da marca conectada, quem chama
    // é a própria conta, e a propriedade nasce lá.
    let sitemapOk = false;
    let registradaPor = null;
    const searchconsole = google.searchconsole('v1');

    let authMarca = null;
    const contaMarca = googleAccountFor(brand);
    try {
      const cfgOauth = readOauthConfigFile();
      if (contaMarca && readOauthToken(brand)) {
        authMarca = loadUserOauthClient(cfgOauth.clientId, cfgOauth.clientSecret, brand, { global: false });
      }
    } catch (e) {
      push(`A sessão de ${contaMarca || brandName(brand)} não serve agora: ${e.message}`, 'warn');
    }

    if (!authMarca) {
      push(
        contaMarca
          ? `Sem sessão conectada de ${contaMarca}: vou registrar a propriedade pela service account, e ela ` +
              `NÃO vai aparecer sozinha no Search Console de ${contaMarca}, vai continuar precisando ser adicionada à mão. ` +
              'Conecte a conta da marca nas configurações para isso virar automático.'
          : `${brandName(brand)} não tem conta do Google configurada, a propriedade fica só com a service account.`,
        'warn'
      );
    }

    const comoMarca = () => (authMarca ? { auth: authMarca } : {});
    const quem = () => (authMarca ? contaMarca : 'a service account');
    let sessaoMarcaRecusada = false;
    // A sessão da marca caiu (invalid_grant): avisa uma vez, apaga o token
    // morto (a tela passa a mostrar "desconectado") e o resto desta etapa vai
    // pela service account, que já é dona do site (ADR-099).
    const sessaoCaiu = (e) => {
      if (!authMarca || !ehSessaoOauthRecusada(e)) return false;
      sessaoMarcaRecusada = true;
      authMarca = null;
      clearOauthToken(brand);
      const motivo = e?.response?.data?.error_description || 'Token has been expired or revoked';
      push(
        `O Google não aceita mais a sessão de ${contaMarca} (invalid_grant: ${motivo}). Não é a API: é o login dessa conta no Hub, ` +
          `que foi revogado ou expirou. Reconecte ${contaMarca} em Configurações. Se isso volta a cada 7 dias, o app OAuth está em modo ` +
          '"Teste" no Google Cloud (Tela de consentimento OAuth): publicado ("Em produção"), o login para de expirar. ' +
          'Desta vez sigo pela service account.',
        'warn'
      );
      return true;
    };

    const registrar = async () => {
      push(`PUT registrar a propriedade ${siteUrl} no Search Console de ${quem()}`, 'cmd');
      await searchconsole.sites.add({ siteUrl, ...comoMarca() });
      registradaPor = quem();
      push(`Propriedade registrada na conta de ${quem()}.`, 'success');
    };
    try {
      await registrar();
    } catch (e) {
      let erro = e;
      if (sessaoCaiu(e)) {
        try { await registrar(); erro = null; } catch (e2) { erro = e2; }
      }
      if (erro) push(`Não consegui registrar a propriedade: ${erro.message}. Seguindo para o sitemap mesmo assim.`, 'warn');
    }

    // Conferência: o que a lista da conta REALMENTE tem. É barato, e é a
    // diferença entre "mandei" e "está lá", que é onde esta etapa já errou
    // três vezes (ADR-040).
    if (authMarca) {
      try {
        const lista = await searchconsole.sites.list({ auth: authMarca });
        const achou = (lista.data.siteEntry || []).find(
          (x) => String(x.siteUrl).replace(/\/+$/, '') === String(siteUrl).replace(/\/+$/, '')
        );
        if (achou) {
          push(`Conferido na conta ${contaMarca}: ${achou.siteUrl} (${achou.permissionLevel}).`, 'success');
        } else {
          push(
            `A conta ${contaMarca} não lista ${siteUrl} depois do registro, abra o Search Console dela e confira.`,
            'warn'
          );
        }
      } catch (e) {
        if (!sessaoCaiu(e)) push(`Não consegui conferir a lista de propriedades de ${contaMarca}: ${e.message}`, 'warn');
      }
    }

    const sitemap = sitemapUrl || new URL('sitemap.xml', siteUrl).toString();
    const enviarSitemap = async () => {
      push(`PUT enviar sitemap ${sitemap}${authMarca ? '' : ' (pela service account)'}`, 'cmd');
      await searchconsole.sitemaps.submit({ siteUrl, feedpath: sitemap, ...comoMarca() });
      sitemapOk = true;
      push('Sitemap enviado.', 'success');
    };
    try {
      await enviarSitemap();
    } catch (e) {
      let erro = e;
      if (sessaoCaiu(e)) {
        try { await enviarSitemap(); erro = null; } catch (e2) { erro = e2; }
      }
      if (erro) {
        push(
          `Falha ao enviar o sitemap: ${erro.message}.` +
            (ehApiDesabilitada(erro) ? ' A "Google Search Console API" está desabilitada no projeto do Google Cloud: habilite e rode de novo.' : ''),
          'warn'
        );
      }
    }

    return { ok: true, log, ownerAdded, sitemapOk, sitemap, registradaPor, siteUrl, siteUrlPedido, redirecionou: siteUrl !== siteUrlPedido, sessaoMarcaRecusada, contaMarca: sessaoMarcaRecusada ? contaMarca : undefined };
  } catch (e) {
    push(`${e.sslPendente ? 'Search Console: ' : 'Erro: '}${e.message}`, e.sslPendente ? 'warn' : 'error');
    return { ok: false, error: e.message, sslPendente: !!e.sslPendente, log };
  }
});

// ---------- Planilhas (vínculo em massa) ----------
//
// A planilha chega como a equipe a tem: .xlsx exportado do sistema, .csv com
// ponto-e-vírgula, ou o que veio colado do Excel (tabulação). Aqui ela vira
// só linhas e colunas; quem decide o que cada coluna significa é a tela, com
// a pessoa olhando (ADR-053).

function separadorDeTexto(linha) {
  const contagem = { '\t': (linha.match(/\t/g) || []).length, ';': (linha.match(/;/g) || []).length, ',': (linha.match(/,/g) || []).length };
  // Tabulação ganha sempre que aparece: é o que o Excel/Sheets colam, e nunca
  // aparece por acaso num nome de empresa.
  if (contagem['\t']) return '\t';
  return contagem[';'] >= contagem[','] ? ';' : ',';
}

function dividirLinhaCsv(linha, sep) {
  const saida = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else aspas = !aspas;
    } else if (c === sep && !aspas) {
      saida.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  saida.push(atual);
  return saida.map((x) => x.trim().replace(/^"|"$/g, '').trim());
}

function lerTextoTabular(texto) {
  const linhas = String(texto || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return [];
  const sep = separadorDeTexto(linhas[0]);
  return linhas.map((l) => dividirLinhaCsv(l, sep));
}

function lerPlanilhaBinaria(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const primeira = wb.SheetNames[0];
  if (!primeira) return [];
  const ws = wb.Sheets[primeira];
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  return linhas
    .map((l) => (Array.isArray(l) ? l.map((c) => String(c ?? '').trim()) : []))
    .filter((l) => l.some(Boolean));
}

ipcMain.handle('planilha:ler', async (event, { nome, base64, texto }) => {
  try {
    if (texto !== undefined) {
      return { ok: true, linhas: lerTextoTabular(texto), origem: 'texto' };
    }
    const buffer = Buffer.from(String(base64 || ''), 'base64');
    const ext = String(nome || '').toLowerCase().split('.').pop();
    if (['xlsx', 'xlsm', 'xls', 'ods'].includes(ext)) {
      return { ok: true, linhas: lerPlanilhaBinaria(buffer), origem: ext };
    }
    // Texto: tenta UTF-8; se vier com caracteres de substituição, é Latin-1
    // (o Excel brasileiro ainda exporta assim).
    let txt = buffer.toString('utf-8');
    if (txt.includes('\uFFFD')) txt = buffer.toString('latin1');
    return { ok: true, linhas: lerTextoTabular(txt), origem: ext || 'csv' };
  } catch (e) {
    return { ok: false, error: `Não consegui ler a planilha: ${e.message}` };
  }
});

// Gera um .xlsx com cabeçalho e linhas e pergunta onde salvar (ADR-072). É o
// caminho para o que sai do Hub e vai para outra equipe: a lista dos domínios
// cujo DNS não é nosso, por exemplo, que o atendimento leva ao cliente.
function anexarAba(wb, colunas, linhas, aba) {
  const XLSX = require('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([colunas, ...linhas]);
  ws['!cols'] = colunas.map((c, i) => ({ wch: Math.min(60, Math.max(String(c).length, ...linhas.map((l) => String(l[i] ?? '').length), 0) + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, String(aba || 'Planilha').slice(0, 31));
}

function montarXlsx(colunas, linhas, aba) {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  anexarAba(wb, colunas, linhas, aba);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Várias abas num arquivo só: [{ aba, colunas, linhas }]. Abas sem linhas são
// puladas (não crio "Outros clientes" vazia, por exemplo).
function montarXlsxAbas(abas) {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  for (const a of abas || []) if (a && Array.isArray(a.colunas) && a.colunas.length && (a.linhas || []).length) anexarAba(wb, a.colunas, a.linhas, a.aba);
  if (!wb.SheetNames.length) throw new Error('Sem dados para exportar.');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

ipcMain.handle('planilha:exportar', async (event, { nomeSugerido, colunas, linhas, aba, abas, pasta }) => {
  try {
    const multi = Array.isArray(abas) && abas.length;
    if (!multi) {
      if (!Array.isArray(colunas) || !colunas.length) throw new Error('Sem colunas para exportar.');
      if (!Array.isArray(linhas) || !linhas.length) throw new Error('Sem linhas para exportar.');
    }
    const montar = () => (multi ? montarXlsxAbas(abas) : montarXlsx(colunas, linhas, aba));
    const totalLinhas = multi ? abas.reduce((s, a) => s + ((a.linhas || []).length), 0) : linhas.length;

    // Pasta fixa (ADR-082): sem diálogo, o arquivo vai para Músicas\<pasta>,
    // que é onde a equipe combinou guardar os apontamentos. Nome já existente
    // ganha sufixo numérico; nada é sobrescrito.
    if (pasta) {
      const dir = path.join(app.getPath('music'), String(pasta));
      fs.mkdirSync(dir, { recursive: true });
      const base = String(nomeSugerido || 'planilha.xlsx').replace(/\.xlsx$/i, '');
      let destino = path.join(dir, `${base}.xlsx`);
      for (let n = 2; fs.existsSync(destino); n++) destino = path.join(dir, `${base} (${n}).xlsx`);
      fs.writeFileSync(destino, montar());
      return { ok: true, caminho: destino, linhas: totalLinhas };
    }

    const { dialog } = require('electron');
    const janela = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible()) || null;
    const escolha = await dialog.showSaveDialog(janela, {
      title: 'Salvar planilha',
      defaultPath: path.join(app.getPath('documents'), String(nomeSugerido || 'planilha.xlsx')),
      filters: [{ name: 'Planilha do Excel', extensions: ['xlsx'] }],
    });
    if (escolha.canceled || !escolha.filePath) return { ok: true, cancelado: true };
    const destino = /\.xlsx$/i.test(escolha.filePath) ? escolha.filePath : `${escolha.filePath}.xlsx`;
    fs.writeFileSync(destino, montar());
    return { ok: true, caminho: destino, linhas: totalLinhas };
  } catch (e) {
    return { ok: false, error: `Não consegui salvar a planilha: ${e.message}` };
  }
});

// ---------- Publicação MPI+ de ponta a ponta (ADR-058) ----------
//
// DNS (fotografia e zona na Cloudflare), Registro.br, e os passos do painel
// que antes eram cliques: aprovar, publicar em produção, ativar SSL. Cada
// empresa (Busca Cliente, MPI Solutions) tem a sua conta da Cloudflare e do
// Registro.br; a marca escolhida na tela decide qual entra.

const { montarZonaProposta, planejarAplicacao, unirRegistros } = require(path.join(__dirname, 'lib', 'zona'));
const { criarCloudflare } = require(path.join(__dirname, 'lib', 'cloudflare'));

const EMPRESAS = ['bc', 'mpisolutions'];
const empresaOk = (e) => EMPRESAS.includes(String(e || ''));

// Segredos por empresa, criptografados como os outros do app.
const empresaSegredosPath = (empresa) => path.join(app.getPath('userData'), `empresa-${empresa}.enc`);

function readEmpresaSegredos(empresa) {
  try {
    if (!empresaOk(empresa) || !fs.existsSync(empresaSegredosPath(empresa))) return {};
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(empresaSegredosPath(empresa)))) || {};
  } catch (e) {
    return {};
  }
}

function writeEmpresaSegredos(empresa, patch) {
  if (!empresaOk(empresa)) throw new Error(`Empresa desconhecida: ${empresa}`);
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia do sistema indisponível; não vou gravar segredo em texto puro.');
  const atual = readEmpresaSegredos(empresa);
  const novo = { ...atual };
  for (const [k, v] of Object.entries(patch || {})) {
    // Campo vazio = "não mexe", igual às outras senhas do app.
    if (v === undefined || v === null || v === '') continue;
    novo[k] = String(v);
  }
  fs.writeFileSync(empresaSegredosPath(empresa), safeStorage.encryptString(JSON.stringify(novo)));
  return novo;
}

// Configuração não sigilosa da publicação: IP público de produção e afins.
const publicacaoConfigPath = () => path.join(app.getPath('userData'), 'publicacao-config.json');
// IPs de produção que já valeram e não valem mais para projeto novo: quem
// tinha um deles gravado passa a ler o padrão atual (ADR-141). O servidor de
// produção que o painel lista hoje (Idealplus 03) responde em .60; o .39 era
// o servidor 11, que saiu do painel em 10/2026.
const IPS_PRODUCAO_ANTIGOS = ['149.18.102.39'];
const PUBLICACAO_PADRAO = {
  // Reserva: o DNS dos projetos MPI+ novos usa o IP do servidor de produção
  // que o painel lista (painel:servidores); este valor entra quando o painel
  // não dá o IP ou lista mais de um servidor (ADR-141).
  hestiaIpPublico: '149.18.102.60',
  // O IP em que os sites MPI+ da planilha estão hoje. No lote a única mudança
  // de DNS é a troca deste pelo de cima, e só quando a raiz está exatamente
  // nele (ADR-067). A regra cheia de preservação de e-mail continua sendo do
  // "Publicar MPI+", um projeto por vez.
  ipAntigoMpiMassa: '149.18.102.58',
  hestiaServidorPadrao: '11', // 192.168.3.143
  hestiaServidores: { 11: '192.168.3.143', 13: '192.168.3.157' },
  // O identificador (handle) de cada empresa no Registro.br. Só mexemos no DNS
  // de um domínio quando o contato TÉCNICO é um desses (ADR-061); senão o DNS
  // é do cliente e a publicação segue sem ele.
  registrobrHandles: { bc: 'BCTDL', mpisolutions: 'MPSOL83' },
};
function readPublicacaoConfig() {
  try {
    if (!fs.existsSync(publicacaoConfigPath())) return { ...PUBLICACAO_PADRAO };
    const cfg = { ...PUBLICACAO_PADRAO, ...JSON.parse(fs.readFileSync(publicacaoConfigPath(), 'utf-8')) };
    // Cura o IP de produção antigo gravado (ADR-141): projeto novo não pode
    // mais apontar para ele.
    if (IPS_PRODUCAO_ANTIGOS.includes(String(cfg.hestiaIpPublico || '').trim())) cfg.hestiaIpPublico = PUBLICACAO_PADRAO.hestiaIpPublico;
    return cfg;
  } catch (e) {
    return { ...PUBLICACAO_PADRAO };
  }
}

ipcMain.handle('publicacao:getConfig', () => {
  const cfg = readPublicacaoConfig();
  const empresas = {};
  for (const e of EMPRESAS) {
    const s = readEmpresaSegredos(e);
    empresas[e] = {
      cloudflareToken: !!s.cloudflareToken,
      cloudflareAccountId: s.cloudflareAccountId || '',
      registrobrUsuario: s.registrobrUsuario || '',
      registrobrSenha: !!s.registrobrSenha,
    };
  }
  return { ok: true, config: cfg, empresas };
});

ipcMain.handle('publicacao:setConfig', (event, { config, empresas }) => {
  try {
    if (config && typeof config === 'object') {
      const atual = readPublicacaoConfig();
      fs.writeFileSync(publicacaoConfigPath(), JSON.stringify({ ...atual, ...config }, null, 2));
    }
    for (const [empresa, patch] of Object.entries(empresas || {})) {
      if (!empresaOk(empresa)) continue;
      writeEmpresaSegredos(empresa, patch);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('publicacao:clearEmpresa', (event, { empresa, campos }) => {
  try {
    if (!empresaOk(empresa)) throw new Error('Empresa desconhecida.');
    const atual = readEmpresaSegredos(empresa);
    for (const c of campos || Object.keys(atual)) delete atual[c];
    if (Object.keys(atual).length) {
      fs.writeFileSync(empresaSegredosPath(empresa), safeStorage.encryptString(JSON.stringify(atual)));
    } else if (fs.existsSync(empresaSegredosPath(empresa))) {
      fs.unlinkSync(empresaSegredosPath(empresa));
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ----- Fotografia do DNS -----
//
// Pergunta aos autoritativos de HOJE, não ao resolvedor da máquina: é o que o
// cliente tem de fato, sem cache. Não existe "listar tudo" em DNS (AXFR é
// fechado), então a lista de hosts é a dos serviços que costumam existir, mais
// o que a pessoa acrescentar na tela.
const DNS_HOSTS_COMUNS = [
  'www', 'mail', 'webmail', 'smtp', 'pop', 'pop3', 'imap', 'ftp', 'cpanel', 'webdisk',
  'autodiscover', 'autoconfig', 'painel', 'blog', 'loja', 'app', 'api', 'cdn', 'intranet', 'sistema',
];
const DNS_TXT_COMUNS = ['_dmarc', 'default._domainkey', 'mail._domainkey', 'google._domainkey', 'selector1._domainkey', 'selector2._domainkey', 'k1._domainkey'];
const DNS_SRV_COMUNS = ['_autodiscover._tcp', '_sip._tls', '_sipfederationtls._tcp'];

async function fotografarDns(dominio, hostsExtras = [], push = () => {}) {
  const dnsp = require('dns').promises;
  const { Resolver } = dnsp;
  const registros = [];
  const erros = [];

  // Quem responde por esse domínio hoje.
  let nsNomes = [];
  try {
    nsNomes = await dnsp.resolveNs(dominio);
  } catch (e) {
    throw new Error(`Não achei os servidores DNS de ${dominio} (${e.code || e.message}). O domínio existe e está delegado?`);
  }
  const nsIps = [];
  for (const ns of nsNomes) {
    try { nsIps.push(...(await dnsp.resolve4(ns))); } catch (e) { /* um NS fora do ar não derruba a foto */ }
  }
  if (!nsIps.length) throw new Error(`Os servidores DNS de ${dominio} (${nsNomes.join(', ')}) não resolveram para IP nenhum.`);

  const r = new Resolver({ timeout: 4000, tries: 2 });
  r.setServers(nsIps.slice(0, 4));
  push(`DNS autoritativo de ${dominio}: ${nsNomes.join(', ')}`, 'info');

  const tenta = async (fn, tipo, nome) => {
    try {
      return await fn();
    } catch (e) {
      if (!['ENODATA', 'ENOTFOUND', 'NXDOMAIN', 'ESERVFAIL'].includes(e.code)) erros.push(`${tipo} ${nome}: ${e.code || e.message}`);
      return null;
    }
  };

  const addA = async (nome) => {
    const cname = await tenta(() => r.resolveCname(nome), 'CNAME', nome);
    if (cname && cname.length) {
      for (const c of cname) registros.push({ type: 'CNAME', name: nome, content: c });
      return; // CNAME exclui A/AAAA no mesmo nome
    }
    const a = await tenta(() => r.resolve4(nome), 'A', nome);
    for (const ip of a || []) registros.push({ type: 'A', name: nome, content: ip });
    const aaaa = await tenta(() => r.resolve6(nome), 'AAAA', nome);
    for (const ip of aaaa || []) registros.push({ type: 'AAAA', name: nome, content: ip });
  };

  // Raiz: as cinco consultas são independentes, então vão juntas. Cada uma
  // custa uma ida ao autoritativo; em série eram cinco idas, agora é uma.
  const [a, aaaa, mx, txt, caa] = await Promise.all([
    tenta(() => r.resolve4(dominio), 'A', dominio),
    tenta(() => r.resolve6(dominio), 'AAAA', dominio),
    tenta(() => r.resolveMx(dominio), 'MX', dominio),
    tenta(() => r.resolveTxt(dominio), 'TXT', dominio),
    tenta(() => r.resolveCaa(dominio), 'CAA', dominio),
  ]);
  for (const ip of a || []) registros.push({ type: 'A', name: dominio, content: ip });
  for (const ip of aaaa || []) registros.push({ type: 'AAAA', name: dominio, content: ip });
  for (const m of mx || []) registros.push({ type: 'MX', name: dominio, content: m.exchange, priority: m.priority });
  for (const t of txt || []) registros.push({ type: 'TXT', name: dominio, content: t.join('') });
  for (const c of caa || []) {
    const tag = Object.keys(c).find((k) => k !== 'critical');
    if (tag) registros.push({ type: 'CAA', name: dominio, content: `${c.critical || 0} ${tag} "${c[tag]}"` });
  }

  // Hosts, TXT de e-mail (DKIM, DMARC) e SRV: três listas, uma passada só.
  const hosts = [...new Set([...DNS_HOSTS_COMUNS, ...hostsExtras.map((h) => String(h || '').trim().toLowerCase().replace(new RegExp(`\\.${dominio.replace(/\./g, '\\.')}$`), '')).filter(Boolean)])];
  await Promise.all([
    mapLimit(hosts, 10, (h) => addA(`${h}.${dominio}`)),
    mapLimit(DNS_TXT_COMUNS, 6, async (h) => {
      const nome = `${h}.${dominio}`;
      const t = await tenta(() => r.resolveTxt(nome), 'TXT', nome);
      for (const v of t || []) registros.push({ type: 'TXT', name: nome, content: v.join('') });
    }),
    mapLimit(DNS_SRV_COMUNS, 4, async (h) => {
      const nome = `${h}.${dominio}`;
      const s = await tenta(() => r.resolveSrv(nome), 'SRV', nome);
      for (const v of s || []) registros.push({ type: 'SRV', name: nome, content: `${v.weight} ${v.port} ${v.name}`, priority: v.priority });
    }),
  ]);

  return { dominio, ns: nsNomes, registros, erros };
}

ipcMain.handle('dns:fotografar', async (event, { dominio: bruto, hostsExtras, ipNovo }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  try {
    const dominio = normalizeDomain(bruto);
    if (!dominio) throw new Error('Domínio vazio.');
    push(`Fotografando o DNS atual de ${dominio}`, 'cmd');
    const foto = await fotografarDns(dominio, Array.isArray(hostsExtras) ? hostsExtras : [], push);
    push(`${foto.registros.length} registro(s) encontrados` + (foto.erros.length ? `, ${foto.erros.length} consulta(s) com erro` : ''), foto.erros.length ? 'warn' : 'success');
    for (const e of foto.erros) push(`DNS: ${e}`, 'warn');
    const cfg = readPublicacaoConfig();
    const zona = montarZonaProposta({ dominio, snapshot: foto, ipNovo: ipNovo || cfg.hestiaIpPublico });
    for (const a of zona.avisos) push(`Zona: ${a}`, 'warn');
    push(`Zona proposta: ${zona.registros.length} registro(s). IP antigo ${zona.ipAntigo || 'desconhecido'}, IP novo ${zona.ipNovo}.`, 'info');
    return { ok: true, log, foto, zona };
  } catch (e) {
    push(`Erro: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// ----- Cloudflare -----

function cloudflareDaEmpresa(empresa) {
  const s = readEmpresaSegredos(empresa);
  if (!s.cloudflareToken) {
    throw new Error(`${brandName(empresa)} não tem token da Cloudflare configurado. Preencha nas configurações.`);
  }
  return { cf: criarCloudflare(s.cloudflareToken), accountId: s.cloudflareAccountId || '' };
}

ipcMain.handle('cloudflare:verificar', async (event, { empresa }) => {
  try {
    const { cf } = cloudflareDaEmpresa(empresa);
    const t = await cf.verificarToken();
    const contas = await cf.contas();
    return { ok: true, status: t.status, contas: contas.map((c) => ({ id: c.id, name: c.name })) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Acha a zona do domínio na conta da empresa, ou cria. Devolve também a
// conta usada, para o terminal dizer onde a zona nasceu.
async function acharOuCriarZona(cf, accountId, dominio, empresa, push) {
  push(`Cloudflare (${brandName(empresa)}): procurando a zona ${dominio}`, 'cmd');
  let zona = await cf.acharZona(dominio);
  if (zona) {
    push(`Zona já existe (${zona.id}, status ${zona.status}).`, 'success');
    return { zona, criada: false };
  }
  let conta = accountId;
  if (!conta) {
    const contas = await cf.contas();
    if (!contas.length) throw new Error('O token não enxerga conta nenhuma na Cloudflare.');
    if (contas.length > 1) {
      throw new Error(`O token enxerga ${contas.length} contas (${contas.map((c) => c.name).join(', ')}). Informe o ID da conta certa nas configurações.`);
    }
    conta = contas[0].id;
    push(`Conta da Cloudflare: ${contas[0].name}`, 'info');
  }
  push(`POST criar zona ${dominio}`, 'cmd');
  zona = await cf.criarZona(dominio, conta);
  push(`Zona criada: ${zona.id}`, 'success');
  return { zona, criada: true };
}

const registroSimples = (r) => ({ id: r.id, type: String(r.type || '').toUpperCase(), name: r.name, content: r.content, priority: r.priority, ttl: r.ttl, proxied: !!r.proxied });

// A zona montada pela Cloudflare (ADR-071): acha ou cria a zona, deixa a
// própria Cloudflare varrer o DNS atual (é o que o painel dela faz ao
// adicionar um site), une isso com a nossa fotografia dos autoritativos e
// aplica a regra de preservação em cima do conjunto. O que sai é a zona
// inteira replicada, com só o necessário trocado: raiz e www para o servidor
// novo, e-mail preservado no antigo. Nada é escrito além do que o scan da
// Cloudflare gravou; aplicar é o passo seguinte, depois da confirmação.
ipcMain.handle('cloudflare:montarZona', async (event, { empresa, dominio: bruto, hostsExtras, ipNovo }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  try {
    const dominio = normalizeDomain(bruto);
    if (!dominio) throw new Error('Domínio vazio.');
    const { cf, accountId } = cloudflareDaEmpresa(empresa);
    const cfg = readPublicacaoConfig();

    const { zona, criada } = await acharOuCriarZona(cf, accountId, dominio, empresa, push);

    push('GET registros que a zona já tem', 'cmd');
    let existentes = (await cf.listarRegistros(zona.id)).map(registroSimples);
    const semNs = (l) => l.filter((r) => r.type !== 'NS');
    let escaneados = 0;
    if (!semNs(existentes).length) {
      // Zona vazia: a varredura da Cloudflare. Numa zona que já tem registros
      // ela duplicaria o que está lá, então só roda na vazia.
      push('POST scan: a Cloudflare varre o DNS atual do domínio e grava o que achar', 'cmd');
      try {
        escaneados = await cf.escanearRegistros(zona.id);
        existentes = (await cf.listarRegistros(zona.id)).map(registroSimples);
        push(`Scan da Cloudflare: ${semNs(existentes).length} registro(s) na zona.`, 'success');
      } catch (e) {
        push(`Scan da Cloudflare não rodou (${e.message}); sigo só com a fotografia dos autoritativos.`, 'warn');
      }
    } else {
      push(`A zona já tem ${semNs(existentes).length} registro(s); não rodo o scan para não duplicar.`, 'info');
    }

    // A nossa fotografia, pelos autoritativos de hoje. Falhar aqui não
    // derruba: o scan já trouxe o grosso, e o aviso diz o que faltou olhar.
    let foto = { registros: [], erros: [], ns: [] };
    try {
      push(`Fotografando o DNS atual de ${dominio}`, 'cmd');
      foto = await fotografarDns(dominio, Array.isArray(hostsExtras) ? hostsExtras : [], push);
      push(`Fotografia: ${foto.registros.length} registro(s)` + (foto.erros.length ? `, ${foto.erros.length} consulta(s) com erro` : ''), foto.erros.length ? 'warn' : 'success');
      for (const e of foto.erros) push(`DNS: ${e}`, 'warn');
    } catch (e) {
      push(`Fotografia dos autoritativos falhou: ${e.message}. A zona sai só do que a Cloudflare varreu.`, 'warn');
    }

    // Se a Cloudflare já responde por este domínio, o que está nela É o DNS
    // atual, e a fotografia é a mesma coisa vista de fora.
    const nsAtuais = (foto.ns || []).map((x) => String(x).toLowerCase());
    const jaNaCloudflare = nsAtuais.length > 0 && nsAtuais.every((n) => /\.ns\.cloudflare\.com$/.test(n));
    const snapshot = { registros: unirRegistros(semNs(existentes), foto.registros) };
    const proposta = montarZonaProposta({ dominio, snapshot, ipNovo: ipNovo || cfg.hestiaIpPublico });
    for (const a of proposta.avisos) push(`Zona: ${a}`, 'warn');
    const plano = planejarAplicacao(existentes, proposta.registros, { remover: proposta.remover });
    push(
      `Zona proposta: ${proposta.registros.length} registro(s), IP antigo ${proposta.ipAntigo || 'desconhecido'}, IP novo ${proposta.ipNovo}. ` +
        `Muda ${plano.atualizar.length}, cria ${plano.criar.length}, remove ${plano.remover.length}, mantém ${plano.manter.length}.`,
      'info'
    );
    for (const s of plano.sobras) push(`Fica na zona sem mexer: ${s.type} ${s.name} → ${s.content}`, 'info');

    const detalhe = criada ? zona : await cf.zona(zona.id);
    const nameservers = detalhe.name_servers || zona.name_servers || [];
    return {
      ok: true, log,
      zoneId: zona.id, criada, status: detalhe.status, nameservers, escaneados, jaNaCloudflare,
      existentes: semNs(existentes),
      foto: { registros: foto.registros, ns: foto.ns || [] },
      zona: proposta,
      plano,
    };
  } catch (e) {
    push(`Erro: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

ipcMain.handle('cloudflare:aplicar', async (event, { empresa, dominio: bruto, registros, remover }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  try {
    const dominio = normalizeDomain(bruto);
    if (!dominio) throw new Error('Domínio vazio.');
    if (!Array.isArray(registros) || !registros.length) throw new Error('Sem registros para aplicar. Fotografe o DNS antes.');
    const { cf, accountId } = cloudflareDaEmpresa(empresa);

    const { zona, criada } = await acharOuCriarZona(cf, accountId, dominio, empresa, push);

    push('GET registros que a zona já tem', 'cmd');
    const existentes = await cf.listarRegistros(zona.id);
    const plano = planejarAplicacao(existentes, registros, { remover: Array.isArray(remover) ? remover : [] });
    push(
      `Plano: ${plano.criar.length} criar, ${plano.atualizar.length} atualizar, ${plano.remover.length} remover, ${plano.manter.length} já iguais` +
        (plano.sobras.length ? `, ${plano.sobras.length} registro(s) na zona que a proposta não menciona (ficam como estão)` : ''),
      'info'
    );
    for (const s of plano.sobras) push(`Fica na zona sem mexer: ${s.type} ${s.name} → ${s.content}`, 'warn');

    const feitos = [];
    const falhas = [];
    const apagar = async (r) => {
      try {
        push(`DELETE ${r.type} ${r.name} → ${r.content} (${r.motivo})`, 'cmd');
        await cf.apagarRegistro(zona.id, r.id);
        feitos.push(r);
      } catch (e) { falhas.push({ ...r, erro: e.message }); push(`Falhou: ${e.message}`, 'warn'); }
    };
    // Primeiro sai o que conflita por nome com o que vai entrar (AAAA e A a
    // mais na raiz e no www): CNAME não convive com A/AAAA, e a Cloudflare
    // recusa o PUT/POST enquanto eles estiverem lá (81053, ADR-085).
    for (const r of plano.remover.filter((x) => x.antes)) await apagar(r);
    for (const r of plano.atualizar) {
      try {
        push(`PUT ${r.type} ${r.name}: ${r.antes} → ${r.content}${r.motivo ? ` (${r.motivo})` : ''}`, 'cmd');
        await cf.atualizarRegistro(zona.id, r.id, r);
        feitos.push(r);
      } catch (e) {
        // Troca de tipo (CNAME virando A, por exemplo) que o PUT recusou: sai
        // o antigo e entra o novo, nessa ordem, porque CNAME não convive com
        // nada no mesmo nome (ADR-076).
        if (r.trocaTipo) {
          try {
            push(`PUT recusado (${e.message}); DELETE do ${r.antes} e POST ${r.type} ${r.name} → ${r.content}`, 'cmd');
            await cf.apagarRegistro(zona.id, r.id);
            await cf.criarRegistro(zona.id, r);
            feitos.push(r);
            continue;
          } catch (e2) { e = e2; }
        }
        falhas.push({ ...r, erro: e.message }); push(`Falhou: ${e.message}`, 'warn');
      }
    }
    for (const r of plano.criar) {
      try {
        push(`POST ${r.type} ${r.name} → ${r.content}${r.priority !== undefined ? ` (prio ${r.priority})` : ''}`, 'cmd');
        await cf.criarRegistro(zona.id, r);
        feitos.push(r);
      } catch (e) { falhas.push({ ...r, erro: e.message }); push(`Falhou: ${e.message}`, 'warn'); }
    }
    // O resto (MX antigo) sai só depois de criar o que substitui: se o POST
    // do MX novo falhar, o antigo continua lá e o e-mail não fica sem MX.
    for (const r of plano.remover.filter((x) => !x.antes)) await apagar(r);

    // Conferência: o que a zona tem de fato depois.
    const depois = await cf.listarRegistros(zona.id);
    const mesmo = (d, p) => d.type === p.type && d.name.toLowerCase() === p.name.toLowerCase() && String(d.content).toLowerCase().replace(/\.$/, '') === String(p.content).toLowerCase().replace(/\.$/, '');
    const faltando = registros.filter((p) => !depois.some((d) => mesmo(d, p)));
    const sobraram = plano.remover.filter((p) => depois.some((d) => d.id === p.id));
    if (faltando.length || sobraram.length) {
      for (const f of faltando) push(`Conferência: ${f.type} ${f.name} → ${f.content} NÃO está na zona.`, 'warn');
      for (const f of sobraram) push(`Conferência: ${f.type} ${f.name} → ${f.content} devia ter saído e ainda está na zona.`, 'warn');
    } else {
      push(`Conferido: os ${registros.length} registros propostos estão na zona` + (plano.remover.length ? ` e os ${plano.remover.length} que deviam sair saíram` : '') + '.', 'success');
    }

    const detalhe = await cf.zona(zona.id);
    const nameservers = detalhe.name_servers || zona.name_servers || [];
    push(`Nameservers da Cloudflare: ${nameservers.join(' e ') || '(a zona ainda não recebeu)'}`, nameservers.length ? 'success' : 'warn');

    return { ok: true, log, zoneId: zona.id, criada, nameservers, status: detalhe.status, feitos, falhas, faltando: faltando.length + sobraram.length };
  } catch (e) {
    push(`Erro: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// Os nameservers já trocaram no registro? Pergunta à raiz (.br) por meio do
// resolvedor do sistema, depois confere na Cloudflare.
// Os nameservers já trocaram? A pergunta certa é ao PAI do domínio (os
// servidores do .br), que responde a delegação sem cache. O resolvedor da
// máquina guarda o NS antigo pelo TTL inteiro, e foi isso que manteve o
// "NS antigos" por minutos com o A já apontando (ADR-077). Quando o pai não
// responde, cai no resolvedor da máquina, e diz que foi por cache.
async function nsNoPai(dominio) {
  const dnsp = require('dns').promises;
  const partes = dominio.split('.');
  // O pai pode ser com.br (dominio.com.br) ou br (dominio.br); tenta do mais
  // próximo para o mais distante até achar quem tem NS.
  for (let i = 1; i < partes.length; i++) {
    const pai = partes.slice(i).join('.');
    let nsPai = [];
    try { nsPai = await dnsp.resolveNs(pai); } catch (e) { continue; }
    const ips = [];
    for (const n of nsPai.slice(0, 4)) { try { ips.push(...(await dnsp.resolve4(n))); } catch (e) { /* segue */ } }
    if (!ips.length) continue;
    const r = new dnsp.Resolver({ timeout: 4000, tries: 2 });
    r.setServers(ips.slice(0, 4));
    try {
      const ns = await r.resolveNs(dominio);
      if (ns && ns.length) return { ns, fonte: `delegação em ${pai}` };
    } catch (e) {
      // O pai responde a delegação na seção de autoridade, que o resolveNs
      // pode não devolver (ENODATA); tenta o resolvedor do sistema abaixo.
    }
  }
  return null;
}

ipcMain.handle('dns:conferirNs', async (event, { dominio: bruto, esperados }) => {
  const dnsp = require('dns').promises;
  try {
    const dominio = normalizeDomain(bruto);
    const pai = await nsNoPai(dominio);
    const atuais = (pai ? pai.ns : await dnsp.resolveNs(dominio).catch(() => [])).map((x) => x.toLowerCase().replace(/\.$/, ''));
    const alvo = (esperados || []).map((x) => String(x).toLowerCase().replace(/\.$/, ''));
    const ok = alvo.length > 0 && alvo.every((n) => atuais.includes(n));
    return { ok: true, propagado: ok, atuais, fonte: pai ? pai.fonte : 'resolvedor da máquina (pode estar em cache)' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- Painel MPI+ ----------
//
// Em vez do commit no Bitbucket, os projetos da MPI+ são sincronizados no
// painel (ADR-037). O contrato das telas está em docs/painel-mpi.md.
//
// A automação roda numa BrowserWindow oculta, o mesmo Chromium que já vem com
// o app, e NÃO simula digitação: o painel é Alpine.js, então ela escreve no
// estado do componente e chama as mesmas funções que os botões chamam. Digitar
// num framework reativo exige disparar os eventos certos, e errar isso deixa o
// campo preenchido na tela e vazio no envio: a falha que parece sucesso.

const painelConfigPath = () => path.join(app.getPath('userData'), 'painel-config.json');
const painelCredsPath = () => path.join(app.getPath('userData'), 'painel-creds.enc');
const PAINEL_HOST = 'idealplus.idealtrends.io';
const PAINEL_PARTITION = 'persist:painel-mpi';
const PAINEL_TIMEOUT_MS = 45000;

function readPainelCreds() {
  try {
    if (!fs.existsSync(painelCredsPath())) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(painelCredsPath())));
  } catch (e) {
    return null;
  }
}

// Uma chamada ao painel por vez (ADR-103). A janela oculta é uma só e é
// reaproveitada por URL: um segundo site abrindo o painel no meio do primeiro
// fechava a janela que o primeiro estava usando. Com a espera da propagação
// rodando em segundo plano enquanto outro site é publicado, isso passa a
// acontecer, então as chamadas entram numa fila e rodam na ordem.
let filaDoPainel = Promise.resolve();
function naFilaDoPainel(fn) {
  const vez = filaDoPainel.then(fn, fn);
  filaDoPainel = vez.catch(() => {});
  return vez;
}
function handleNoPainel(canal, fn) {
  ipcMain.handle(canal, (event, payload) => naFilaDoPainel(() => fn(event, payload)));
}

ipcMain.handle('painel:setCreds', (event, { email, senha }) => {
  try {
    const e = String(email || '').trim();
    const p = String(senha || '');
    if (!e && !p) {
      if (fs.existsSync(painelCredsPath())) fs.unlinkSync(painelCredsPath());
      return { ok: true, configured: false };
    }
    if (!e || !p) return { ok: false, error: 'Informe e-mail e senha do painel, ou deixe os dois vazios para remover.' };
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'Criptografia do sistema indisponível, não vou gravar sua senha em texto puro.' };
    }
    fs.writeFileSync(painelCredsPath(), safeStorage.encryptString(JSON.stringify({ email: e, senha: p })));
    return { ok: true, configured: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Devolve o e-mail (para a tela mostrar quem está configurado) e NUNCA a senha.
ipcMain.handle('painel:status', () => {
  const c = readPainelCreds();
  return { ok: true, configured: !!c, email: c?.email || null };
});

// ----- Painel /doutor: bloquear contatos (ADR-105) -----
//
// Automação do MESMO tipo que a do painel MPI+: uma credencial guardada
// (safeStorage), login direto, sem tentar senha nenhuma. O e-mail é escolhido
// pela marca (MPI Solutions ou Busca Cliente); a senha é a mesma para as duas.
// Depois do login, acha a empresa do cliente na listagem e clica no cadeado se
// ele estiver desbloqueado (verde); já bloqueado (laranja) não faz nada.
const doutorCredsPath = () => path.join(app.getPath('userData'), 'doutor-creds.enc');
const DOUTOR_PARTITION = 'persist:doutor';

function readDoutorCreds() {
  try {
    if (!fs.existsSync(doutorCredsPath())) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(doutorCredsPath())));
  } catch (e) {
    return null;
  }
}

// A senha é uma só; muda só o e-mail, pela marca. Sem adivinhar domínio: os
// dois e-mails vêm da configuração, exatamente como a equipe os digitou.
function doutorEmailDaMarca(creds, marca) {
  if (!creds) return '';
  return marca === 'bc' ? (creds.emailBusca || '') : (creds.emailMpi || '');
}

// Backup criptografado dos telefones/WhatsApp de cada empresa. O bloqueio
// apaga esses campos no /doutor (é isso que tira o contato do site); para o
// desbloquear conseguir restaurar, guardo os números aqui antes de apagar,
// chaveados pelo domínio. safeStorage, nunca em texto puro (ADR-116).
const doutorContatosPath = () => path.join(app.getPath('userData'), 'doutor-contatos.enc');

function readDoutorContatos() {
  try {
    if (!fs.existsSync(doutorContatosPath())) return {};
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(doutorContatosPath()))) || {};
  } catch (e) {
    return {};
  }
}

function salvarDoutorContatos(dominio, campos) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  const todos = readDoutorContatos();
  todos[dominio] = { campos, salvoEm: new Date().toISOString() };
  fs.writeFileSync(doutorContatosPath(), safeStorage.encryptString(JSON.stringify(todos)));
  return true;
}

// Apaga o backup de um domínio (depois do desbloqueio, para liberar memória).
// Se ficou sem nenhum, remove o arquivo inteiro.
function apagarDoutorContatos(dominio) {
  const todos = readDoutorContatos();
  if (!(dominio in todos)) return false;
  delete todos[dominio];
  try {
    if (!Object.keys(todos).length) { if (fs.existsSync(doutorContatosPath())) fs.unlinkSync(doutorContatosPath()); }
    else if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(doutorContatosPath(), safeStorage.encryptString(JSON.stringify(todos)));
  } catch (e) { return false; }
  return true;
}

ipcMain.handle('doutor:setCreds', (event, { senha, emailMpi, emailBusca } = {}) => {
  try {
    const dados = { senha: String(senha || ''), emailMpi: String(emailMpi || '').trim(), emailBusca: String(emailBusca || '').trim() };
    if (!dados.senha && !dados.emailMpi && !dados.emailBusca) {
      if (fs.existsSync(doutorCredsPath())) fs.unlinkSync(doutorCredsPath());
      return { ok: true, configured: false };
    }
    if (!dados.senha || (!dados.emailMpi && !dados.emailBusca)) {
      return { ok: false, error: 'Informe a senha e ao menos um e-mail (MPI e/ou Busca), ou deixe tudo vazio para remover.' };
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'Criptografia do sistema indisponível, não vou gravar a senha em texto puro.' };
    }
    fs.writeFileSync(doutorCredsPath(), safeStorage.encryptString(JSON.stringify(dados)));
    return { ok: true, configured: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Devolve os e-mails (para a tela mostrar o que está configurado) e se há
// senha gravada, NUNCA a senha.
ipcMain.handle('doutor:status', () => {
  const c = readDoutorCreds();
  return { ok: true, configured: !!(c && c.senha), emailMpi: c?.emailMpi || '', emailBusca: c?.emailBusca || '', temSenha: !!(c && c.senha) };
});

// O script que roda na página do /doutor: acha a empresa do cliente (a que não
// é "Doutores da Web") e devolve o estado do cadeado. Bloquear é clicar quando
// está verde e confirmar o modal (SweetAlert2 nesta versão; a v1 fica de
// reserva). Ler o estado e agir sobre ele é mais seguro que clicar no escuro.
// Lê a listagem de empresas: nome, id (rel), status atual (val) e se o cadeado
// está fechado. val="2" é desbloqueado (btn-success/fa-unlock); "1" é
// bloqueado (btn-warning/fa-lock). O bloqueio é feito pela MESMA chamada AJAX
// que o botão dispara (UpStatus), então não depende de clique nem da versão do
// SweetAlert (ADR-110).
const JS_DOUTOR_LISTAR = `
  const linhas = Array.from(document.querySelectorAll('table tbody tr'));
  const rows = [];
  const vistos = new Set();
  for (const tr of linhas) {
    const b = tr.querySelector('.j_AlteraStatus');
    if (!b) continue;
    const rel = b.getAttribute('rel') || tr.getAttribute('id') || '';
    if (vistos.has(rel)) continue;   // FixedHeader/responsive pode duplicar a linha
    vistos.add(rel);
    // O nome vem do alt/title do avatar (ou do botão "ver"), que é confiável;
    // a coluna de texto varia de posição entre versões e pegava o id (ADR-112).
    let nome = '';
    const img = tr.querySelector('img[alt], img[title]');
    if (img) nome = (img.getAttribute('alt') || img.getAttribute('title') || '').trim();
    if (!nome) { const vb = tr.querySelector('.j_view[alt]'); if (vb) nome = (vb.getAttribute('alt') || '').trim(); }
    if (!nome) nome = Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').replace(/\s+/g, ' ').trim()).find(t => t && !/^\d+$/.test(t)) || '';
    const cls = b.getAttribute('class') || '';
    rows.push({ nome, rel, val: b.value, bloqueado: /btn-warning/.test(cls) || !!b.querySelector('.fa-lock') });
  }
  return { rows };
`;

// Clica no "Voltar" (button.j_view no topo, action setEmpresa para o SIG) e
// confirma o aviso, seja SweetAlert v1 (.sweet-alert button.confirm) ou v2
// (.swal2-confirm). Depois disso a página recarrega no contexto do SIG, que é
// quem lista todas as empresas.
const JS_DOUTOR_VOLTAR = `
  const espera = (ms) => new Promise(r => setTimeout(r, ms));
  const ate = async (cond, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { const v = cond(); if (v) return v; await espera(80); } return null; };
  const v = document.querySelector('button.j_view, a.j_view');
  if (!v) return { semVoltar: true };
  v.click();
  const conf = await ate(() => document.querySelector('.swal2-confirm, .sweet-alert.visible button.confirm, .sweet-alert.showSweetAlert button.confirm'), 8000);
  if (!conf) return { semModal: true };
  conf.click();
  return { confirmou: true };
`;

// Acha o link "Listar" de Empresa (…exe=CMSemp/index ou parecido), para as
// versões em que o endereço não é exatamente esse.
const JS_DOUTOR_LINK_EMPRESAS = `
  const a = Array.from(document.querySelectorAll('a')).find(x => /exe=CMS?emp\w*\/index/i.test(x.getAttribute('href') || ''));
  return { href: a ? a.getAttribute('href') : null };
`;

function jsDoutorBloquearFetch(id, status) {
  return `
    const dados = new URLSearchParams({ action: 'UpStatus', empresa_id: ${JSON.stringify(String(id))}, empresa_status: ${JSON.stringify(String(status))} });
    const r = await fetch('_cdn/ajax/functions.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }, body: dados.toString(), credentials: 'same-origin' });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    return { http: r.status, j, txt: txt.slice(0, 200) };
  `;
}

// O bloqueio de verdade (ADR-116): abrir o formulário da empresa e CENSURAR os
// contatos com "##" (o e-mail principal vira o da marca), guardando os valores
// originais no backup, e Salvar. O UpStatus da lista só ativa/desativa a
// empresa, nunca tira o contato do site. Grupos de campos censurados (ADR-118):
const DOUTOR_FONE_CAMPOS = ['empresa_fone', 'empresa_fone2', 'empresa_fone3', 'empresa_fone4', 'empresa_fone5', 'empresa_fone6'];
const DOUTOR_EMAIL_CAMPOS = ['empresa_email', 'empresa_email2', 'empresa_email3'];
const DOUTOR_REDES_CAMPOS = ['empresa_facebook', 'empresa_instagram', 'empresa_twitter', 'empresa_linkedin', 'empresa_youtube', 'empresa_threads', 'empresa_tiktok', 'empresa_pinterest'];
const DOUTOR_ENDERECO_CAMPOS = ['empresa_endereco', 'empresa_bairro', 'empresa_cep'];
const DOUTOR_CENSURA = '##';

// O e-mail que entra no lugar do contato do cliente ao bloquear, pela marca.
function doutorEmailContato(marca) {
  return marca === 'bc' ? 'contato@buscacliente.com.br' : 'contato@mpisolutions.com.br';
}

// Lê os contatos do formulário de edição da empresa (o maior form). temForm
// falso quando não é o formulário (ex.: a página veio 504). "bloqueado" = o
// telefone principal já está censurado (##).
const JS_DOUTOR_LER_CONTATOS = `
  const alvos = ${JSON.stringify([...DOUTOR_FONE_CAMPOS, ...DOUTOR_EMAIL_CAMPOS, ...DOUTOR_REDES_CAMPOS, ...DOUTOR_ENDERECO_CAMPOS])};
  const censura = ${JSON.stringify(DOUTOR_CENSURA)};
  const form = Array.from(document.querySelectorAll('form')).find(f => f.querySelectorAll('input,select,textarea').length > 5);
  if (!form) return { temForm: false };
  const campos = {};
  for (const n of alvos) { const el = form.querySelector('[name="' + n + '"]'); if (el) campos[n] = el.value; }
  const bloqueado = String(campos['empresa_fone'] || '').trim() === censura;
  return { temForm: true, campos, bloqueado };
`;

// Censura os contatos com "##" (telefones/WhatsApp, e-mails extras, redes
// sociais e endereço), põe o e-mail da marca no e-mail principal, e Salva
// (UpdateEmp). Guarda os valores originais em "antes" (para o backup e o
// desbloqueio). Clona cada input para driblar máscara/validação (jmask nos
// telefones apaga valor posto por script no blur). O painel costuma dar 504 e
// completar mesmo assim.
function jsDoutorBloquearSalvar(emailContato) {
  return `
    const fone = ${JSON.stringify(DOUTOR_FONE_CAMPOS)};
    const redes = ${JSON.stringify(DOUTOR_REDES_CAMPOS)};
    const endereco = ${JSON.stringify(DOUTOR_ENDERECO_CAMPOS)};
    const censura = ${JSON.stringify(DOUTOR_CENSURA)};
    const form = Array.from(document.querySelectorAll('form')).find(f => f.querySelectorAll('input,select,textarea').length > 5);
    if (!form) return { erro: 'não achei o formulário da empresa' };
    // O que censurar e com o quê: tudo vira ##, menos o e-mail principal (marca).
    const plano = {};
    for (const n of [...fone, ...redes, ...endereco, 'empresa_email2', 'empresa_email3']) plano[n] = censura;
    plano['empresa_email'] = ${JSON.stringify(emailContato)};
    // Endereços extras de texto (rua/bairro/CEP) também, quando existirem.
    for (const el of form.querySelectorAll('input[name]')) {
      if (/empresa_enderecos_extras\\[[0-9]+\\]\\[empresa_(endereco|bairro|cep)\\]/.test(el.name)) plano[el.name] = censura;
    }
    const antes = {};
    const setCampo = (n, v) => { const el = form.querySelector('[name="' + n + '"]'); if (!el) return; antes[n] = el.value; const c = el.cloneNode(true); c.value = v; c.setAttribute('value', v); el.parentNode.replaceChild(c, el); };
    for (const [n, v] of Object.entries(plano)) setCampo(n, v);
    const btn = form.querySelector('button[name="UpdateEmp"], input[name="UpdateEmp"]') || document.querySelector('button[name="UpdateEmp"], input[name="UpdateEmp"], button[type=submit]');
    if (!btn) return { erro: 'não achei o botão Salvar da empresa' };
    let hidden = form.querySelector('input[type=hidden][name="UpdateEmp"]');
    if (!hidden) { hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = 'UpdateEmp'; hidden.value = ''; form.appendChild(hidden); }
    btn.click();
    return { submetido: true, antes };
  `;
}

// Restaura os campos salvos (telefones e e-mails) e Salva. Os telefones têm
// máscara (jmask) que apaga valor posto por script no blur; clonar o input tira
// os listeners e o valor sobrevive ao submit.
function jsDoutorRestaurarSalvar(campos) {
  return `
    const dados = ${JSON.stringify(campos || {})};
    const form = Array.from(document.querySelectorAll('form')).find(f => f.querySelectorAll('input,select,textarea').length > 5);
    if (!form) return { erro: 'não achei o formulário da empresa' };
    for (const [n, v] of Object.entries(dados)) {
      const el = form.querySelector('[name="' + n + '"]');
      if (!el) continue;
      const clone = el.cloneNode(true);
      clone.value = v; clone.setAttribute('value', v);
      el.parentNode.replaceChild(clone, el);
    }
    const btn = form.querySelector('button[name="UpdateEmp"], input[name="UpdateEmp"]') || document.querySelector('button[name="UpdateEmp"], input[name="UpdateEmp"], button[type=submit]');
    if (!btn) return { erro: 'não achei o botão Salvar da empresa' };
    let hidden = form.querySelector('input[type=hidden][name="UpdateEmp"]');
    if (!hidden) { hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = 'UpdateEmp'; hidden.value = ''; form.appendChild(hidden); }
    btn.click();
    return { submetido: true };
  `;
}

// A agência (a própria conta que loga) não é alvo: nas versões novas o nome é
// "SIG - Busca Cliente"/"SIG - MPI Solutions"; nas antigas, "Doutores da Web".
function doutorEhAgencia(nome) {
  return /^\s*sig\b/i.test(nome || '') || /doutores da web/i.test(nome || '');
}

function doutorNormalizarNome(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Entre as empresas que não são a agência, escolhe a do cliente. Uma só: ela.
// Várias: a que casa com o domínio; sem casar, devolve a lista para a pessoa
// decidir, em vez de chutar.
function doutorEscolherEmpresa(rows, dominio) {
  const candidatas = (rows || []).filter((r) => r.nome && !doutorEhAgencia(r.nome));
  if (!candidatas.length) return { erro: 'a listagem só tem a agência; não achei a empresa do cliente' };
  if (candidatas.length === 1) return { alvo: candidatas[0] };
  const base = doutorNormalizarNome(String(dominio).replace(/\.(com|net|org|gov|edu)?\.?(br)?$/i, '').replace(/^www\./, ''));
  const casa = candidatas.find((r) => { const n = doutorNormalizarNome(r.nome); return n && (base.includes(n) || n.includes(base)); });
  if (casa) return { alvo: casa };
  return { erro: `mais de uma empresa na listagem e nenhuma casou com o domínio: ${candidatas.map((r) => '"' + r.nome + '"').join(', ')}` };
}

handleNoPainel('doutor:bloquear', async (event, { dominio: bruto, marca, acao = 'bloquear' } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  const desbloquear = acao === 'desbloquear';
  const verbo = desbloquear ? 'desbloquear' : 'bloquear';
  const dominio = normalizeDomain(bruto);
  if (!dominio) return { ok: false, error: 'Informe o domínio do cliente.', log };
  const creds = readDoutorCreds();
  const email = doutorEmailDaMarca(creds, marca);
  if (!creds || !creds.senha) return { ok: false, error: 'Configure a senha do /doutor nas configurações.', log };
  if (!email) return { ok: false, error: `Sem e-mail do /doutor para ${marca === 'bc' ? 'Busca Cliente' : 'MPI Solutions'} nas configurações.`, log };

  const base = `https://${dominio}/doutor/`;
  const urlListagem = `${base}painel.php?exe=CMSemp/index`;
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      webPreferences: { partition: DOUTOR_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const irPara = async (u) => { const c = aguardarCarregar(win); win.loadURL(u); await c; };

    push(`Abrindo ${base}`, 'cmd');
    await irPara(base);

    // Login, se a página pedir. Uma credencial só, escolhida pela marca.
    const precisaLogin = await rodarNoPainel(win, `return { form: !!document.querySelector('input[name="pass"]') };`);
    if (precisaLogin.form) {
      push(`Entrando no /doutor como ${email}`, 'cmd');
      const r = await rodarNoPainel(win, `
        const u = document.querySelector('input[name="user"]');
        const p = document.querySelector('input[name="pass"]');
        if (!u || !p) return { erro: 'não achei os campos de login do /doutor' };
        u.value = ${JSON.stringify(email)}; p.value = ${JSON.stringify(creds.senha)};
        const btn = document.querySelector('input[name="AdminLogin"], input[type=submit][value="Acessar"], button[name="AdminLogin"]');
        if (!btn) return { erro: 'não achei o botão Acessar do /doutor' };
        btn.click();
        return { enviou: true };
      `);
      if (r.erro) throw new Error(r.erro);
      const c = aguardarCarregar(win); await c;
      const depois = await rodarNoPainel(win, `return { temForm: !!document.querySelector('input[name="pass"]') };`);
      if (depois.temForm) throw new Error(`o /doutor não aceitou o login de ${email}. Confira a senha nas configurações.`);
      push('Login aceito.', 'success');
    }

    // A listagem de empresas fica no contexto do SIG (admin). Depois do login
    // o acesso é o da empresa do cliente, então tenta a listagem direto e, se
    // vier vazia, faz o "Voltar" para o SIG e tenta de novo (ADR-110).
    await irPara(urlListagem);
    let { rows } = await rodarNoPainel(win, JS_DOUTOR_LISTAR);
    if (!rows.length) {
      push('Listagem vazia no acesso do cliente; voltando para o SIG.', 'info');
      await irPara(`${base}painel.php`);
      const v = await rodarNoPainel(win, JS_DOUTOR_VOLTAR);
      if (v.semVoltar) throw new Error('não achei o botão "Voltar" para chegar na listagem de empresas (versão diferente do /doutor?)');
      if (v.semModal) throw new Error('cliquei em "Voltar" mas o aviso de confirmação não apareceu');
      const c = aguardarCarregar(win).catch(() => {}); await c;
      await irPara(urlListagem);
      ({ rows } = await rodarNoPainel(win, JS_DOUTOR_LISTAR));
      if (!rows.length) {
        // Última tentativa: achar o link de "Listar" empresas nesta versão.
        const lk = await rodarNoPainel(win, JS_DOUTOR_LINK_EMPRESAS);
        if (lk.href) { await irPara(new URL(lk.href, `${base}painel.php`).toString()); ({ rows } = await rodarNoPainel(win, JS_DOUTOR_LISTAR)); }
      }
    }
    if (!rows.length) throw new Error('não achei a listagem de empresas depois do login (o /doutor deste site pode ser de uma versão diferente; me avise para eu mapear)');

    const escolha = doutorEscolherEmpresa(rows, dominio);
    if (escolha.erro) throw new Error(escolha.erro);
    const alvo = escolha.alvo;

    // O bloqueio de verdade é no CADASTRO da empresa: esvaziar os telefones e
    // Salvar (o site regenera sem o contato). Abro o formulário pelo id (rel).
    const urlForm = `${base}painel.php?exe=CMSemp/update&id=${encodeURIComponent(alvo.rel)}`;
    push(`Abrindo o cadastro de "${alvo.nome}" (empresa ${alvo.rel}).`, 'cmd');
    await irPara(urlForm);
    const atual = await rodarNoPainel(win, JS_DOUTOR_LER_CONTATOS);
    if (!atual.temForm) throw new Error('não achei o formulário de edição da empresa (o /doutor pode estar lento ou ser de uma versão diferente; me avise para eu mapear).');

    // O estado real é se o telefone principal já está censurado (##) — não o
    // cadeado da lista (aquilo ativa/desativa a empresa, não some o contato).
    if (desbloquear && !atual.bloqueado) { push(`"${alvo.nome}" já está com os contatos no ar.`, 'info'); return { ok: true, jaEstava: true, empresa: alvo.nome, log }; }
    if (!desbloquear && atual.bloqueado) { push(`"${alvo.nome}" já estava com os contatos censurados (bloqueada).`, 'info'); return { ok: true, jaEstava: true, empresa: alvo.nome, log }; }

    // Salvar no /doutor devolve 504 e completa mesmo assim; não trato a falha de
    // carregamento como erro — confirmo depois relendo o cadastro (ADR-116).
    const salvarEsperar = async () => { await aguardarCarregar(win).catch(() => {}); };

    if (desbloquear) {
      const bkp = readDoutorContatos()[dominio];
      const campos = bkp && (bkp.campos || bkp.fones);
      if (!campos || !Object.values(campos).some((v) => String(v || '').trim())) {
        throw new Error('não tenho os contatos guardados desta empresa para restaurar (foi bloqueada fora do Hub ou antes desta versão). Reponha os telefones/e-mail à mão no /doutor.');
      }
      push(`Restaurando os contatos de "${alvo.nome}".`, 'cmd');
      const r = await rodarNoPainel(win, jsDoutorRestaurarSalvar(campos));
      if (r.erro) throw new Error(r.erro);
      await salvarEsperar();
    } else {
      const emailContato = doutorEmailContato(marca);
      push(`Censurando os contatos de "${alvo.nome}" com "##" (e-mail principal → ${emailContato}).`, 'cmd');
      const r = await rodarNoPainel(win, jsDoutorBloquearSalvar(emailContato));
      if (r.erro) throw new Error(r.erro);
      // Guarda telefones e e-mails originais (criptografado) para o desbloquear reverter.
      if (r.antes && Object.values(r.antes).some((v) => String(v || '').trim())) {
        if (!salvarDoutorContatos(dominio, r.antes)) push('Aviso: não consegui guardar os contatos (criptografia indisponível); o desbloquear pelo Hub não terá o que restaurar.', 'warn');
      }
      await salvarEsperar();
    }

    // Confirma relendo o cadastro (o 504 não prova nada). Tolera a lentidão:
    // tenta algumas vezes até o estado bater com o pedido.
    let confirmado = null;
    for (let i = 0; i < 6; i++) {
      await irPara(urlForm).catch(() => {});
      const chk = await rodarNoPainel(win, JS_DOUTOR_LER_CONTATOS).catch(() => ({ temForm: false }));
      if (chk.temForm) { confirmado = chk; if (desbloquear ? !chk.bloqueado : chk.bloqueado) break; }
      await new Promise((res) => setTimeout(res, 3000));
    }
    if (!confirmado) { push('Salvei, mas o painel está lento e não deu para reler o cadastro para confirmar. Confira no /doutor.', 'warn'); return { ok: false, incerto: true, empresa: alvo.nome, log }; }
    if (!desbloquear && !confirmado.bloqueado) { push(`Atenção: os contatos de "${alvo.nome}" ainda aparecem no cadastro; não confirmei o bloqueio.`, 'warn'); return { ok: false, incerto: true, empresa: alvo.nome, error: 'os contatos continuam sem censura', log }; }
    if (desbloquear && confirmado.bloqueado) { push(`Atenção: os contatos de "${alvo.nome}" continuam censurados; não confirmei o desbloqueio.`, 'warn'); return { ok: false, incerto: true, empresa: alvo.nome, error: 'os contatos continuam censurados', log }; }

    // Desbloqueio confirmado: o backup não é mais necessário, apaga para liberar
    // memória (ADR-118).
    if (desbloquear) { try { apagarDoutorContatos(dominio); push('Backup dos contatos apagado (não é mais necessário).', 'info'); } catch (e) {} }

    push(`Contatos de "${alvo.nome}" ${desbloquear ? 'restaurados' : 'censurados com ##'}. O site regenera em seguida (o painel pode ter mostrado 504).`, 'success');
    return { ok: true, empresa: alvo.nome, desbloqueou: desbloquear, log };
  } catch (e) {
    push(`/doutor: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
});

ipcMain.handle('painel:clearSession', async () => {
  try {
    const ses = session.fromPartition(PAINEL_PARTITION);
    await ses.clearStorageData();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

function painelUrlValida(url) {
  try {
    return new URL(String(url || '')).hostname === PAINEL_HOST;
  } catch (e) {
    return false;
  }
}

// Espera a página parar de navegar. did-finish-load sozinho não basta: o login
// faz um POST que troca de página, e sem esperar o app rodaria o script na
// página errada.
function aguardarCarregar(win) {
  return new Promise((resolve, reject) => {
    const limpar = () => {
      clearTimeout(t);
      win.webContents.removeListener('did-finish-load', ok);
      win.webContents.removeListener('did-fail-load', falhou);
    };
    const ok = () => { limpar(); resolve(); };
    const falhou = (_e, code, desc) => {
      // -3 é ABORTED, que acontece em redirecionamento, não é erro.
      if (code === -3) return;
      limpar();
      reject(new Error(`Falha ao carregar (${code}): ${desc}`));
    };
    const t = setTimeout(() => { limpar(); reject(new Error('A página do painel demorou demais para carregar.')); }, PAINEL_TIMEOUT_MS);
    win.webContents.on('did-finish-load', ok);
    win.webContents.on('did-fail-load', falhou);
  });
}

// Nenhum script das janelas ocultas espera mais que 90s de propósito. Passou
// disso, a página congelou (o Windows pausa janela oculta com a tela
// bloqueada, por exemplo) e a promessa nunca voltaria: a rodada inteira ficava
// parada para sempre. Com prazo, a etapa falha com motivo e a rodada segue
// para o próximo site (ADR-094).
const JANELA_OCULTA_PRAZO_MS = 3 * 60 * 1000;

async function rodarNoPainel(win, script, { prazoMs = JANELA_OCULTA_PRAZO_MS } = {}) {
  let timer = null;
  const prazo = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`a janela oculta não respondeu em ${Math.round(prazoMs / 1000)}s e foi fechada (a página travou; costuma acontecer com a tela bloqueada). A rodada segue para o próximo.`);
      e.detalhe = { travou: true };
      if (win && !win.isDestroyed()) win.destroy();
      reject(e);
    }, prazoMs);
  });
  let bruto;
  const parada = promessaDeParada();
  try {
    bruto = await Promise.race([
      win.webContents.executeJavaScript(`(async () => { try { ${script} } catch (e) { return { erro: String(e && e.message || e) }; } })()`, true),
      prazo,
      parada.promessa,
    ]);
  } catch (e) {
    // Parou no meio de um script: a janela fica num estado desconhecido.
    if (e && e.parado && win && !win.isDestroyed()) win.destroy();
    throw e;
  } finally {
    clearTimeout(timer);
    parada.soltar();
  }
  if (bruto && bruto.erro) {
    // O que o script viu junto do erro (o config do formulário, por exemplo)
    // vale mais que a frase, e vinha se perdendo aqui (ADR-048).
    const e = new Error(bruto.erro);
    e.detalhe = bruto;
    throw e;
  }
  return bruto;
}

// Script injetado: o painel é Alpine, então tudo passa pelo $data da raiz.
const JS_HELPERS = `
  const raizDe = (sel) => { const el = document.querySelector(sel); return el ? el.closest('[x-data]') : null; };
  const dados = (sel) => { const r = raizDe(sel); return r && window.Alpine ? window.Alpine.$data(r) : null; };
  const espera = (ms) => new Promise(r => setTimeout(r, ms));
  const ate = async (cond, ms = 30000) => {
    const fim = Date.now() + ms;
    while (Date.now() < fim) { const v = cond(); if (v) return v; await espera(60); }
    return null;
  };
`;

// Escolhe a conexão OAuth do painel pelo e-mail, a partir do ESTADO do
// componente (connectionOptions: [{ name, value }]), não do <select>. É pura
// e sem fechamento de propósito: vai serializada para dentro da página, e é
// testada aqui fora (ADR-051).
function escolherConexao(opcoes, conta) {
  const alvo = String(conta || '').trim().toLowerCase();
  const lista = Array.isArray(opcoes) ? opcoes : [];
  const nomes = lista.map((o) => String((o && o.name) || '').trim()).filter(Boolean);
  if (!alvo) return { erro: 'nenhuma conta informada para procurar entre as conexões' };
  const op = lista.find((o) => String((o && o.name) || '').trim().toLowerCase() === alvo);
  if (!op) {
    return { erro: 'a conta ' + alvo + ' não está entre as ' + nomes.length + ' conexões do painel: ' + nomes.join(', ') };
  }
  const valor = op.value === undefined || op.value === null ? '' : String(op.value).trim();
  if (!valor) {
    return { erro: 'a conexão de ' + alvo + ' existe no painel mas veio sem id (value=' + JSON.stringify(op.value) + ')' };
  }
  return { valor };
}

async function painelPrecisaLogin(win) {
  return rodarNoPainel(win, `return { login: !!document.querySelector('input[type=password]') };`).then((r) => !!r.login);
}

async function painelLogar(win, creds, push) {
  push('Painel pedindo login, entrando com a conta configurada', 'cmd');
  const r = await rodarNoPainel(win, `
    const senha = document.querySelector('input[type=password]');
    const email = document.querySelector('input[type=email]');
    if (!senha || !email) return { erro: 'Não achei os campos de login no painel.' };
    const form = senha.closest('form');
    if (!form) return { erro: 'Não achei o formulário de login.' };
    const setar = (el, v) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setar(email, ${JSON.stringify(creds.email)});
    setar(senha, ${JSON.stringify(creds.senha)});
    const manter = form.querySelector('input[type=checkbox]');
    if (manter && !manter.checked) manter.click();
    form.requestSubmit ? form.requestSubmit() : form.submit();
    return { enviado: true };
  `);
  if (!r.enviado) throw new Error('Não consegui enviar o login do painel.');
  await aguardarCarregar(win);
}

// Leitura pura do painel: o que as Integrações já têm preenchido e como está o
// trilho do Relatório. Serve para não refazer o vínculo de um site que já
// estava publicado e já vinculado (ADR-087) e para a conferência em massa dos
// vínculos (ADR-144), que precisa dos VALORES (G-, GTM-, propriedade, site,
// contas, selo) e não só de "tem/não tem". Não escreve nada.
async function painelConferirVinculo(win, push) {
  push('Painel: conferindo o que já está preenchido', 'cmd');
  const r = await rodarNoPainel(win, `
    ${JS_HELPERS}
    const texto = (v) => String(v == null ? '' : v).trim();
    const preenchido = (v) => !!texto(v);

    // A página se monta sozinha depois de carregar (ADR-050, ADR-121): o
    // componente da configuração busca o contrato no servidor e troca o config
    // inteiro. Ler no mesmo segundo em que a página abriu é ler o vazio e
    // acusar "incompleto" um cliente certo (ADR-145). Então: espera a aba
    // Publicação expor o gancho (prova de que os scripts subiram), espera o
    // componente dizer que está liberado (enabled), e lê; se vier tudo vazio,
    // espera mais um pouco e lê de novo.
    const P = await ate(() => window.__mpiHubPubPublication, 20000);
    let publicacao = null;
    try {
      const botaoRaiz = P ? await ate(() => Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('@click')||'').includes('openSiteAprovarDlg')), 10000) : null;
      if (botaoRaiz) {
        const root = window.Alpine.$data(botaoRaiz.closest('[x-data]'));
        publicacao = {
          siteStatus: String(root.wordpressSiteStatus || ''),
          concluido: !!root.productionPublishCompleted,
          falhou: !!root.productionPublishFailed,
          urlProducao: root.wordpressProductionUrl || null,
          sslAtivo: !!root.wpProductionSslActive,
          urlTemporaria: root.wordpressTemporaryUrl || null,
        };
      }
    } catch (e) { publicacao = null; }

    const dConfig = () => dados('#hub-pub-config-accordion-trigger-integrations');
    const integracoesProntas = !!(await ate(() => { const d = dConfig(); return d && d.enabled === true ? d : null; }, 10000));
    const lerIntegracoes = () => {
      const d = dConfig();
      const integracoes = { recaptcha: false, gtm: false, ga: false, gsc: false };
      const valores = { ga: '', gtm: '', gscPreenchido: false, recaptcha: false };
      let achouConfig = false;
      if (d && d.config && d.config.integrations) {
        achouConfig = true;
        const i = d.config.integrations;
        const bloco = (nome) => i[nome] || {};
        integracoes.recaptcha = preenchido(bloco('recaptcha').site_key) && preenchido(bloco('recaptcha').secret_key);
        integracoes.gtm = preenchido(bloco('google-tag-manager').key);
        integracoes.ga = preenchido(bloco('google-analytics').key);
        integracoes.gsc = preenchido(bloco('google-search-console').key);
        valores.ga = texto(bloco('google-analytics').key);
        valores.gtm = texto(bloco('google-tag-manager').key);
        valores.gscPreenchido = integracoes.gsc;
        valores.recaptcha = integracoes.recaptcha;
      }
      return { achouConfig, integracoes, valores };
    };
    let lido = lerIntegracoes();
    let releitura = false;
    if (lido.achouConfig && !lido.integracoes.ga && !lido.integracoes.gtm && !lido.integracoes.gsc) {
      await espera(4000);
      const denovo = lerIntegracoes();
      if (denovo.integracoes.ga || denovo.integracoes.gtm || denovo.integracoes.gsc) { lido = denovo; releitura = true; }
    }
    const { achouConfig, integracoes, valores } = lido;

    // O relatório é outro componente. Sem ele na página, devolvo desconhecido
    // em vez de inventar que está pronto.
    let relatorio = null;
    const botaoGa = await ate(() => Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('@click')||'') === "openModal('ga')"), 8000);
    if (botaoGa) {
      const dr = window.Alpine.$data(botaoGa.closest('[x-data]'));
      // O contrato chega depois e troca o config inteiro (ADR-050). Ler antes
      // dele é ler o vazio da partição do Hub e acusar "incompleto" à toa:
      // connectionOptions cheio prova que o init() rodou; o remotePayload é o
      // contrato que chegou (applyRemoteData guarda ele); sem ele, vale o
      // loadingRemoteContract === false como antes.
      const temOpcoes = () => Array.isArray(dr.connectionOptions) && dr.connectionOptions.length > 0;
      await ate(temOpcoes, 15000);
      const chegouContrato = !!(await ate(() => (dr.remotePayload !== undefined && dr.remotePayload !== null) ? true : null, 20000));
      if (!chegouContrato) await ate(() => dr.loadingRemoteContract === false, 5000);
      const cfg = dr.config || {};
      const opcoes = temOpcoes() ? dr.connectionOptions : [];
      const nomeConexao = (id) => { const op = opcoes.find((o) => String(o && o.value) === String(id)); return op ? texto(op.name) : ''; };
      const ultimoErro = typeof dr.lastError === 'string' ? dr.lastError : (dr.lastError ? JSON.stringify(dr.lastError) : '');
      relatorio = {
        pronto: dr.localReady === true,
        conexaoOk: !!dr.integrationConnectionOk,
        ga: typeof dr.gaLane === 'function' ? dr.gaLane() : null,
        gsc: typeof dr.gscLane === 'function' ? dr.gscLane() : null,
        leads: typeof dr.leadsLane === 'function' ? dr.leadsLane() : null,
        legado: dr.isClienteLegado === true,
        projeto: texto(dr.projectName),
        carregouContrato: chegouContrato || (temOpcoes() && dr.loadingRemoteContract === false),
        chegouContrato,
        config: {
          ga_connection_id: texto(cfg.ga_connection_id), ga_account_key: texto(cfg.ga_account_key), ga_property_id: texto(cfg.ga_property_id),
          gsc_connection_id: texto(cfg.gsc_connection_id), gsc_site_url: texto(cfg.gsc_site_url), leads_external_id: texto(cfg.leads_external_id),
        },
        contas: { ga: nomeConexao(cfg.ga_connection_id), gsc: nomeConexao(cfg.gsc_connection_id) },
        lastError: texto(ultimoErro),
      };
    }
    return { ok: true, achouConfig, integracoes, valores, relatorio, publicacao, integracoesProntas, releitura };
  `);

  const faltando = [];
  if (!r.achouConfig) faltando.push('não achei as Integrações na página');
  else {
    if (!r.integracoes.recaptcha) faltando.push('reCAPTCHA');
    if (!r.integracoes.gtm) faltando.push('Tag Manager');
    if (!r.integracoes.ga) faltando.push('Analytics');
    if (!r.integracoes.gsc) faltando.push('Search Console');
  }
  // Trilho do relatório: só conta como feito quando o painel diz que a conexão
  // foi validada. "Não achei o componente" não é "está pronto".
  if (!r.relatorio) faltando.push('relatório (não consegui ler)');
  else if (!r.relatorio.conexaoOk) faltando.push('relatório');

  const completo = faltando.length === 0;
  push(
    completo
      ? 'Painel: integrações e relatório já estão feitos, não há o que sincronizar.'
      : `Painel: falta ${faltando.join(', ')}.`,
    completo ? 'success' : 'info'
  );
  return { completo, faltando, ...r };
}

// Um bloco de "5. Integrações": preenche o estado e chama o mesmo saveBlock do
// botão, esperando a mensagem verde. Sem a mensagem, isto NÃO é sucesso.
async function painelSincronizarBloco(win, bloco, valores, push) {
  push(`Painel: sincronizando ${bloco}`, 'cmd');
  const r = await rodarNoPainel(win, `
    ${JS_HELPERS}
    const d = dados('#hub-pub-config-accordion-trigger-integrations');
    if (!d) return { erro: 'Não achei o componente de configuração do painel.' };

    const bloco = ${JSON.stringify(bloco)};
    const chave = 'integrations.' + bloco;
    const valores = ${JSON.stringify(valores)};
    Object.assign(d.config.integrations[bloco], valores);

    d.blockFeedback[chave] = { ok: '', error: '' };
    if (typeof d.canSyncIntegrationsBlock === 'function' && !d.canSyncIntegrationsBlock(bloco)) {
      return { erro: 'O painel recusou sincronizar ' + bloco + ' (botão desabilitado), confira os campos obrigatórios.' };
    }
    await d.saveBlock('integrations', bloco);
    await ate(() => d.blockSaving[chave] === false, 30000);
    const fb = await ate(() => (d.blockFeedback[chave]?.ok || d.blockFeedback[chave]?.error) ? d.blockFeedback[chave] : null, 30000);
    if (!fb) return { erro: 'O painel não respondeu nada em ' + bloco + ' (nem verde nem vermelho).' };
    return { ok: fb.ok || '', error: fb.error || '' };
  `);
  if (r.error) throw new Error(`${bloco}: ${r.error}`);
  push(`Painel: ${bloco}, ${r.ok}`, 'success');
  return r.ok;
}

// A aba Relatório: dois modais e um "Sincronizar" que valida a conexão.
async function painelSincronizarRelatorio(win, { contaEmail, gaAccountKey, gaPropertyId, gscSiteUrl, leadsExternalId }, push) {
  // Campo vazio passava pela conferência do salvarModal (mandei '' e ele ficou
  // com '': "igual"), e o painel só reclamava depois, sem dizer de quê. Recusa
  // antes de abrir modal nenhum (ADR-048).
  const obrigatorios = {
    'conta do Google (conexão OAuth do painel)': contaEmail,
    'ID da conta do Analytics': gaAccountKey,
    'ID da propriedade do Analytics': gaPropertyId,
    'endereço do site no Search Console': gscSiteUrl,
  };
  const vazios = Object.keys(obrigatorios).filter((k) => !String(obrigatorios[k] || '').trim());
  if (vazios.length) {
    throw new Error(
      `Relatório: não vou abrir o painel sem ${vazios.join(', ')}, o painel aceitaria o campo vazio e só ` +
        'reclamaria depois, com uma frase que não diz qual campo faltou.'
    );
  }

  push('Painel: abrindo a aba Relatório', 'cmd');
  const r = await rodarNoPainel(win, `
    ${JS_HELPERS}
    // A janela pode ser nova ou reaproveitada (ADR-072); nos dois casos a
    // página pode não ter terminado de montar a aba, então espera pelo botão.
    const botaoGa = await ate(
      () => Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('@click')||'') === "openModal('ga')"),
      20000
    );
    if (!botaoGa) return { erro: 'Não achei a aba Relatório (o cartão do Analytics) em 20s.' };
    const d = window.Alpine.$data(botaoGa.closest('[x-data]'));

    // O painel carrega o contrato do servidor DEPOIS de montar, e o retorno
    // chama persistConfig(remoteToConfig(...)), que TROCA o config inteiro.
    // Salvar antes disso é escrever em cima de algo que vai ser jogado fora
    // segundos depois, e foi isso que passou a derrubar o relatório (ADR-050).
    //
    // connectionOptions só enche quando o init() já rodou: é a prova de que
    // loadRemoteContract também já começou, e aí dá para esperar ele terminar.
    const opcoesChegaram = await ate(() => (d.connectionOptions || []).length > 0 || d.optionsError, 20000);
    if (!opcoesChegaram) {
      return { erro: 'o painel não carregou a lista de conexões OAuth em 20s, não dá para saber se ele terminou de carregar o contrato' };
    }
    const contratoParado = await ate(() => d.loadingRemoteContract === false, 20000);
    if (!contratoParado) {
      return { erro: 'o painel ficou 20s carregando o contrato do servidor (loadingRemoteContract=true), parei para não escrever por cima' };
    }

    // O select é por id numérico, e o id não é estável entre ambientes: casa
    // pelo rótulo, que é o e-mail da conta.
    const conta = ${JSON.stringify(contaEmail)}.toLowerCase();

    // A conexão sai do ESTADO (connectionOptions), não do <select>: a versão
    // anterior lia o DOM e devolvia o campo errado do próprio objeto que tinha
    // acabado de montar, ga_connection_id ia em branco (ADR-051). As opções
    // já chegaram: foi a primeira coisa que esperamos acima.
    ${escolherConexao.toString()}
    const acharConexao = async () => {
      const lista = JSON.parse(JSON.stringify(d.connectionOptions || []));
      return escolherConexao(lista, conta);
    };

    // saveModal() começa com "if (!this.modal) return", e volta CALADO.
    // Salvar com o modal já fechado não grava nada e não avisa: é a falha
    // silenciosa que derrubou a etapa do relatório (ADR-045).
    const salvarModal = async (qual, valores) => {
      if (d.modal !== qual) {
        return { erro: 'o modal de ' + qual + ' não estava aberto na hora de salvar (modal=' + JSON.stringify(d.modal) + ')' };
      }
      const semValor = Object.keys(valores).filter((k) => !String(valores[k] ?? '').trim());
      if (semValor.length) {
        return { erro: 'mandei ' + semValor.join(', ') + ' em branco, o painel guardaria vazio e a conferência passaria' };
      }
      Object.assign(d.draft, valores);
      await d.saveModal();
      // O saveModal grava no config de forma síncrona ao voltar; a espera
      // curta é só para o Alpine assentar a reatividade.
      await espera(120);
      // Confere no config, que é o que o painel valida, não no draft.
      const faltou = Object.keys(valores).filter((k) => String(d.config?.[k] ?? '') !== String(valores[k] ?? ''));
      if (faltou.length) {
        return {
          erro: 'o painel não guardou ' + faltou.join(', ') +
            '. Mandei ' + JSON.stringify(valores) + ' e ele ficou com ' + JSON.stringify(d.config),
        };
      }
      return { ok: true };
    };

    const avisos = [];

    d.openModal('ga');
    await ate(() => d.modal === 'ga', 5000);
    const ga = await acharConexao();
    if (ga.erro) { d.modal = null; return { erro: 'Analytics: ' + ga.erro }; }
    const salvouGa = await salvarModal('ga', {
      ga_connection_id: ga.valor,
      ga_account_key: ${JSON.stringify(gaAccountKey)},
      ga_property_id: ${JSON.stringify(gaPropertyId)},
    });
    if (salvouGa.erro) { d.modal = null; return { erro: 'Analytics: ' + salvouGa.erro, estadoDepois: JSON.parse(JSON.stringify(d.config || {})) }; }

    d.openModal('gsc');
    await ate(() => d.modal === 'gsc', 5000);
    const gsc = await acharConexao();
    if (gsc.erro) { d.modal = null; return { erro: 'Search Console: ' + gsc.erro }; }
    const salvouGsc = await salvarModal('gsc', {
      gsc_connection_id: gsc.valor,
      gsc_site_url: ${JSON.stringify(gscSiteUrl)},
    });
    if (salvouGsc.erro) { d.modal = null; return { erro: 'Search Console: ' + salvouGsc.erro, estadoDepois: JSON.parse(JSON.stringify(d.config || {})) }; }

    // Mesmo esperando, o contrato pode chegar no meio (rede lenta, ou o painel
    // recarregando sozinho). Então confere de novo depois de salvar: se o que
    // gravamos sumiu, quem apagou foi o servidor, não nós (ADR-050).
    const meuConfig = {
      ga_connection_id: ga.valor,
      ga_account_key: ${JSON.stringify(gaAccountKey)},
      ga_property_id: ${JSON.stringify(gaPropertyId)},
      gsc_connection_id: gsc.valor,
      gsc_site_url: ${JSON.stringify(gscSiteUrl)},
    };
    const sumiram = () => Object.keys(meuConfig).filter((k) => String(d.config?.[k] ?? '') !== String(meuConfig[k]));

    await espera(600);
    if (sumiram().length) {
      const perdidos = sumiram();
      // Uma segunda tentativa: o contrato já chegou, agora o que gravarmos fica.
      d.openModal('ga');
      await ate(() => d.modal === 'ga', 5000);
      const r1 = await salvarModal('ga', {
        ga_connection_id: meuConfig.ga_connection_id,
        ga_account_key: meuConfig.ga_account_key,
        ga_property_id: meuConfig.ga_property_id,
      });
      if (r1.erro) { d.modal = null; return { erro: 'Analytics (2ª tentativa): ' + r1.erro, estadoDepois: JSON.parse(JSON.stringify(d.config || {})) }; }
      d.openModal('gsc');
      await ate(() => d.modal === 'gsc', 5000);
      const r2 = await salvarModal('gsc', {
        gsc_connection_id: meuConfig.gsc_connection_id,
        gsc_site_url: meuConfig.gsc_site_url,
      });
      if (r2.erro) { d.modal = null; return { erro: 'Search Console (2ª tentativa): ' + r2.erro, estadoDepois: JSON.parse(JSON.stringify(d.config || {})) }; }
      await espera(600);
      if (sumiram().length) {
        return {
          erro: 'o painel apagou o que eu gravei duas vezes (' + sumiram().join(', ') +
            '), ele recarregou o contrato do servidor por cima do formulário',
          estadoDepois: JSON.parse(JSON.stringify(d.config || {})),
          sobrescrito: true,
        };
      }
      avisos.push('o painel recarregou o contrato por cima de ' + perdidos.join(', ') + ', regravei e conferi');
    }

    // Cliente legado tem um TERCEIRO modal: sem o External ID, localReady nunca
    // vira true, e a mensagem do painel não conta isso (ADR-048).
    const legado = d.isClienteLegado === true;
    const externalId = ${JSON.stringify(leadsExternalId || '')};
    if (legado && !d.leadsComplete) {
      if (!externalId) {
        return {
          erro: 'este projeto está marcado como cliente legado e o painel exige o "External ID (sistema legado)", ' +
            'que normalmente vem preenchido do servidor, aqui veio vazio. Confira o terceiro cartão da aba ' +
            'Relatório no painel; se ele estiver vazio lá também, preencha o External ID no Hub',
          estadoDepois: JSON.parse(JSON.stringify(d.config || {})),
          legado: true,
          faltaExternalId: true,
        };
      }
      d.openModal('leads');
      await ate(() => d.modal === 'leads', 5000);
      const salvouLeads = await salvarModal('leads', { leads_external_id: externalId });
      if (salvouLeads.erro) {
        d.modal = null;
        return { erro: 'External ID: ' + salvouLeads.erro, estadoDepois: JSON.parse(JSON.stringify(d.config || {})) };
      }
    }

    // O painel só sincroniza com localReady. A frase dele ("Preencha Analytics,
    // Search Console...") não diz o que ele tem, então quem diz somos nós, campo
    // a campo, com o nome do que travou.
    if (d.localReady === false) {
      const partes = [];
      if (!d.gaComplete) partes.push('Analytics (gaComplete=false)');
      if (!d.gscComplete) partes.push('Search Console (gscComplete=false)');
      if (legado && !d.leadsComplete) partes.push('External ID do sistema legado (leadsComplete=false)');
      return {
        erro: 'o painel não se considera pronto, falta ' +
          (partes.length ? partes.join(' e ') : 'algo que ele não expõe em gaComplete/gscComplete/leadsComplete') +
          (legado ? ' (projeto marcado como cliente legado)' : ''),
        estadoDepois: JSON.parse(JSON.stringify(d.config || {})),
        legado,
      };
    }

    d.feedback = { ok: '', error: '' };
    await d.salvarEValidarConexao();
    const fb = await ate(() => (d.feedback?.ok || d.feedback?.error) ? d.feedback : null, 40000);
    if (!fb) return { erro: 'O painel não respondeu à sincronização do relatório.' };
    return {
      ok: fb.ok || '',
      error: fb.error || '',
      avisos,
      conexaoOk: !!d.integrationConnectionOk,
      ga: typeof d.gaLane === 'function' ? d.gaLane() : null,
      gsc: typeof d.gscLane === 'function' ? d.gscLane() : null,
    };
  `);
  if (r.error) {
    throw new Error(`Relatório: ${r.error}`);
  }
  for (const aviso of r.avisos || []) push(`Painel: ${aviso}`, 'warn');
  push(`Painel: relatório, ${r.ok}${r.conexaoOk ? ' (conexão validada)' : ' (conexão ainda pendente)'}`, r.conexaoOk ? 'success' : 'warn');
  if (r.ga || r.gsc) push(`Painel: trilhos, Analytics ${r.ga || '?'} · Search Console ${r.gsc || '?'}`, 'info');
  return r;
}

handleNoPainel('painel:sync', async (event, payload) => {
  const { url, recaptcha, analyticsKey, tagmanagerKey, searchConsoleKey, contaEmail, gaAccountKey, gaPropertyId, gscSiteUrl, leadsExternalId } = payload || {};
  // Na MPI+ as duas telas acontecem em momentos diferentes: entre elas o app
  // precisa verificar o Search Console e mandar o sitemap (ADR-038). Sem essa
  // divisão, o trilho do Search Console no relatório nasce "fail".
  const etapas = Array.isArray(payload?.etapas) && payload.etapas.length
    ? payload.etapas
    : ['integracoes', 'relatorio'];
  const quer = (e) => etapas.includes(e);
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });

  let win = null;
  let erroFatal = false;
  try {
    if (!painelUrlValida(url)) {
      throw new Error(`O link do painel precisa ser do ${PAINEL_HOST}. Recebi: ${url || '(vazio)'}`);
    }
    const creds = readPainelCreds();
    if (!creds) {
      throw new Error('Login do painel não configurado, preencha e-mail e senha nas configurações.');
    }

    // Tudo que dá para recusar antes de abrir navegador e fazer login, se
    // recusa aqui: não faz sentido logar para descobrir que não há o que mandar.
    const blocos = [];
    if (recaptcha?.site_key && recaptcha?.secret_key) {
      blocos.push(['recaptcha', { enabled: true, site_key: recaptcha.site_key, secret_key: recaptcha.secret_key }]);
    }
    if (tagmanagerKey) blocos.push(['google-tag-manager', { key: tagmanagerKey }]);
    if (analyticsKey) blocos.push(['google-analytics', { key: analyticsKey }]);
    if (searchConsoleKey) blocos.push(['google-search-console', { key: searchConsoleKey }]);

    if (quer('integracoes') && !blocos.length) {
      throw new Error('Nenhum valor para sincronizar, o projeto não produziu chave nenhuma.');
    }
    if (!quer('integracoes') && !quer('relatorio') && !quer('conferir')) {
      throw new Error('Nenhuma etapa do painel pedida.');
    }

    // A mesma janela (e a mesma sessão persistente) da publicação: aberta uma
    // vez, reaproveitada pelas etapas seguintes (ADR-072).
    win = await abrirPainelLogado(url, push);

    // Só conferir: lê e devolve, sem escrever nada.
    if (quer('conferir') && !quer('integracoes') && !quer('relatorio')) {
      const conferencia = await painelConferirVinculo(win, push);
      return { ok: true, log, conferencia, feitos: [], falhas: [] };
    }

    const feitos = [];
    const falhas = [];
    // 504 e companhia no salvar de um bloco são do gateway do painel, não do
    // valor: uma repetição depois de 10 s costuma passar (ADR-145). Erro de
    // validação (vermelho do painel) não se repete.
    const passageiro = (m) => /\b50[234]\b|gateway|timeout|tempo esgotado|não respondeu/i.test(String(m || ''));
    for (const [bloco, valores] of (quer('integracoes') ? blocos : [])) {
      try {
        feitos.push({ bloco, mensagem: await painelSincronizarBloco(win, bloco, valores, push) });
      } catch (e) {
        if (passageiro(e.message)) {
          push(`Painel: ${e.message}; tento ${bloco} de novo em 10 s.`, 'warn');
          await dormir(10000);
          try {
            feitos.push({ bloco, mensagem: await painelSincronizarBloco(win, bloco, valores, push) });
            continue;
          } catch (e2) { e = e2; }
        }
        falhas.push({ bloco, erro: e.message });
        push(`Painel: ${e.message}`, 'warn');
      }
    }

    let relatorio = null;
    if (!quer('relatorio')) {
      // silêncio proposital: quem pediu só as integrações não quer aviso sobre
      // uma etapa que não pediu.
    } else if (contaEmail && gaPropertyId) {
      try {
        relatorio = await painelSincronizarRelatorio(
          win,
          { contaEmail, gaAccountKey, gaPropertyId, gscSiteUrl, leadsExternalId },
          push
        );
      } catch (e) {
        // O que o painel tinha no formulário na hora da recusa: é isso que diz
        // se o campo chegou vazio ou se o painel pede algo a mais (ADR-048).
        if (e.detalhe?.estadoDepois) {
          push(`Painel: formulário do relatório na hora da recusa: ${JSON.stringify(e.detalhe.estadoDepois)}`, 'warn');
        }
        if (e.detalhe?.faltaExternalId) {
          push(
            'Painel: esse projeto é cliente legado. Preencha "External ID (sistema legado)" no Hub, ' +
              'é o mesmo valor que você digitaria no terceiro cartão da aba Relatório.',
            'warn'
          );
        }
        falhas.push({ bloco: 'relatorio', erro: e.message, faltaExternalId: !!e.detalhe?.faltaExternalId });
        push(`Painel: ${e.message}`, 'warn');
      }
    } else {
      push('Painel: aba Relatório pulada, faltou a conta ou o ID da propriedade.', 'warn');
    }

    return { ok: true, log, feitos, falhas, relatorio };
  } catch (e) {
    erroFatal = true;
    push(`Painel: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  } finally {
    painelSoltarJanela(win, url, { descartar: erroFatal });
  }
});


// ----- Publicação no painel: aprovar, publicar em produção, SSL (ADR-058) -----
//
// A mesma janela oculta das integrações. O painel expõe tudo em
// window.__mpiHubPubPublication, e usa alert() para erro: aqui o alert é
// trocado por uma função que guarda a mensagem, senão a janela oculta travaria
// esperando um clique que ninguém pode dar.

// A janela do painel fica viva entre as etapas de uma mesma publicação
// (ADR-072). Antes cada etapa (estado, aprovar, publicar, SSL, integrações,
// relatório) abria uma janela, carregava a página e esperava o Alpine subir:
// de 2 a 4 segundos cada, seis vezes por site. Agora a primeira abre e as
// seguintes reaproveitam, enquanto a URL for a mesma e a última chamada tiver
// sido há menos de PAINEL_JANELA_TTL_MS. Erro na etapa destrói a janela: o
// estado dela deixou de ser confiável.
const PAINEL_JANELA_TTL_MS = 3 * 60 * 1000;
let painelJanela = null; // { win, url, timer }

function painelDescartarJanela() {
  if (!painelJanela) return;
  clearTimeout(painelJanela.timer);
  const { win } = painelJanela;
  painelJanela = null;
  if (win && !win.isDestroyed()) win.destroy();
}

// Devolve a janela ao cache (ou descarta, quando a etapa deu erro).
function painelSoltarJanela(win, url, { descartar = false } = {}) {
  if (!win || win.isDestroyed()) { if (painelJanela && painelJanela.win === win) painelJanela = null; return; }
  if (descartar || (painelJanela && painelJanela.win !== win)) {
    if (painelJanela && painelJanela.win === win) painelDescartarJanela();
    else win.destroy();
    return;
  }
  if (!painelJanela) painelJanela = { win, url, timer: null };
  clearTimeout(painelJanela.timer);
  painelJanela.timer = setTimeout(painelDescartarJanela, PAINEL_JANELA_TTL_MS);
  if (typeof painelJanela.timer.unref === 'function') painelJanela.timer.unref();
}

async function abrirPainelLogado(url, push) {
  if (!painelUrlValida(url)) {
    throw new Error(`O link do painel precisa ser do ${PAINEL_HOST}. Recebi: ${url || '(vazio)'}`);
  }
  const creds = readPainelCreds();
  if (!creds) throw new Error('Login do painel não configurado. Preencha e-mail e senha nas configurações.');

  if (painelJanela && painelJanela.win && !painelJanela.win.isDestroyed() && painelJanela.url === url) {
    clearTimeout(painelJanela.timer);
    push('Painel: reaproveitando a janela já aberta.', 'info');
    return painelJanela.win;
  }
  painelDescartarJanela();

  const win = new BrowserWindow({
    show: false,
    webPreferences: { partition: PAINEL_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.webContents.on('will-navigate', (e, destino) => { if (!painelUrlValida(destino)) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => { if (painelJanela && painelJanela.win === win) painelJanela = null; });

  push(`Abrindo o painel: ${url}`, 'cmd');
  try {
    const carregou = aguardarCarregar(win);
    win.loadURL(url);
    await carregou;

    if (await painelPrecisaLogin(win)) {
      await painelLogar(win, creds, push);
      const voltou = aguardarCarregar(win);
      win.loadURL(url);
      await voltou;
      if (await painelPrecisaLogin(win)) throw new Error('O painel continuou pedindo login. Confira e-mail e senha nas configurações.');
      push('Login do painel aceito.', 'success');
    }
  } catch (e) {
    // Janela que não chegou a servir não fica viva: nem no cache, nem solta.
    if (!win.isDestroyed()) win.destroy();
    throw e;
  }
  painelJanela = { win, url, timer: null };
  return win;
}

// ----- Painel MPI+ (idealplus): bloquear/desbloquear contatos (ADR-121) -----
//
// O MPI+ não tem /doutor: os contatos ficam no painel central (idealplus), num
// componente Alpine com `addresses[]` (endereço, redes, telefones, e-mails) e
// `config.integrations.whatsapp`. Salvar é chamar as PRÓPRIAS funções do painel,
// saveSection('settings') e saveBlock('integrations','whatsapp') — idêntico a
// clicar "Sincronizar". A censura (## + e-mail da marca + placeholder de
// telefone) é montada pelo módulo puro e testado lib/painel-mpiplus.
const painelMpiplus = require(path.join(__dirname, 'lib', 'painel-mpiplus'));
// E-mail que entra no lugar do e-mail real quando é MPI+ (as marcas Busca
// Cliente/MPI Solutions usam os delas no /doutor; MPI+ usa este).
const PAINEL_EMAIL_BLOQUEIO = 'contato@idealtrends.com.br';

// Backup criptografado do {addresses, whatsapp} original, chaveado pelo domínio.
// É o que o desbloqueio reescreve verbatim. safeStorage, nunca em texto puro.
const painelContatosPath = () => path.join(app.getPath('userData'), 'painel-contatos.enc');
function readPainelContatos() {
  try {
    if (!fs.existsSync(painelContatosPath())) return {};
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(painelContatosPath()))) || {};
  } catch (e) { return {}; }
}
function salvarPainelContatos(dominio, dados) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  const todos = readPainelContatos();
  todos[dominio] = { dados, salvoEm: new Date().toISOString() };
  fs.writeFileSync(painelContatosPath(), safeStorage.encryptString(JSON.stringify(todos)));
  return true;
}
function apagarPainelContatos(dominio) {
  const todos = readPainelContatos();
  if (!(dominio in todos)) return false;
  delete todos[dominio];
  try {
    if (!Object.keys(todos).length) { if (fs.existsSync(painelContatosPath())) fs.unlinkSync(painelContatosPath()); }
    else if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(painelContatosPath(), safeStorage.encryptString(JSON.stringify(todos)));
  } catch (e) { return false; }
  return true;
}

// Acha o componente Alpine mestre do hub (o que tem saveSection/saveBlock e
// addresses). Reusado nos scripts de leitura e de escrita.
const JS_ACHAR_MESTRE_PAINEL = `
  const acharMestre = () => { for (const c of document.querySelectorAll('[x-data]')) { try { const d = window.Alpine && window.Alpine.$data(c); if (d && typeof d.saveSection === 'function' && typeof d.saveBlock === 'function' && ('addresses' in d)) return d; } catch (e) {} } return null; };
`;

// Lê o estado atual dos contatos (para backup e para confirmar).
const JS_PAINEL_LER_CONTATOS = `
  ${JS_HELPERS}
  ${JS_ACHAR_MESTRE_PAINEL}
  const m = await ate(acharMestre, 40000);
  if (!m) return { erro: 'não achei o componente do painel (o Alpine não subiu ou a aba de publicação não abriu)' };
  const addresses = JSON.parse(JSON.stringify(m.addresses || []));
  const whatsapp = JSON.parse(JSON.stringify((m.config && m.config.integrations && m.config.integrations.whatsapp) || { numbers: [] }));
  let canSync = null; try { canSync = typeof m.canSyncInEditor === 'function' ? !!m.canSyncInEditor() : null; } catch (e) {}
  return { ok: true, addresses, whatsapp, enabled: !!m.enabled, canSync };
`;

// Escreve o estado dado ({addresses, whatsapp}) e chama os salvamentos do painel.
// Serve tanto para bloquear (plano censurado) quanto para restaurar (backup).
function jsPainelEscreverSalvar(dados) {
  return `
    ${JS_HELPERS}
    ${JS_ACHAR_MESTRE_PAINEL}
    const m = await ate(acharMestre, 40000);
    if (!m) return { erro: 'não achei o componente do painel para salvar' };
    if (typeof m.canSyncInEditor === 'function' && !m.canSyncInEditor()) return { erro: 'o painel não permite sincronizar agora (canSyncInEditor=false)' };
    if (!m.config) return { erro: 'o painel não expôs a config do cliente' };
    // "novoEstado", não "dados": JS_HELPERS já declara "const dados" neste
    // mesmo escopo, e redeclarar dava SyntaxError no script inteiro (ADR-121).
    const novoEstado = ${JSON.stringify(dados)};
    const erros = [];
    // ORDEM IMPORTA: salvar os endereços (saveSection) re-hidrata a config
    // INTEIRA com a resposta do servidor (applyLoadedConfig), o que apagaria um
    // WhatsApp censurado só em memória. Então: WhatsApp primeiro, e cada estado
    // é re-aplicado logo antes do seu próprio save.
    // 1) WhatsApp (Integrações)
    if (!m.config.integrations) m.config.integrations = {};
    m.config.integrations.whatsapp = novoEstado.whatsapp;
    await espera(80);
    let key = ''; try { key = m.blockKey('integrations', 'whatsapp'); } catch (e) {}
    try { await m.saveBlock('integrations', 'whatsapp'); } catch (e) { erros.push('whatsapp: ' + (e && e.message || e)); }
    if (key) await ate(() => (m.blockSaving && (key in m.blockSaving)) ? (m.blockSaving[key] === false) : true, 40000);
    const fbB = (m.blockFeedback && key && m.blockFeedback[key]) || {};
    if (fbB.error) erros.push('whatsapp: ' + fbB.error);
    // 2) Endereços / redes / telefones / e-mails (re-aplica antes de salvar)
    m.addresses = novoEstado.addresses;
    await espera(80);
    try { await m.saveSection('settings'); } catch (e) { erros.push('endereços: ' + (e && e.message || e)); }
    await ate(() => (m.sectionSaving && ('settings' in m.sectionSaving)) ? (m.sectionSaving.settings === false) : true, 40000);
    const fbS = (m.sectionFeedback && m.sectionFeedback.settings) || {};
    if (fbS.error) erros.push('endereços: ' + fbS.error);
    // IMPORTANTE: retornar só TEXTO PURO. fbS/fbB são objetos reativos do Alpine
    // (Proxy); devolver o proxy pelo executeJavaScript falha na serialização
    // ("Script failed to execute").
    return {
      ok: erros.length === 0,
      erros: erros.map((x) => String(x)),
      feedback: {
        settings: { ok: String(fbS.ok || ''), error: String(fbS.error || '') },
        whatsapp: { ok: String(fbB.ok || ''), error: String(fbB.error || '') },
      },
    };
  `;
}

// Resolve a URL do hub do cliente. A busca do painel (/clientes?busca=) é por
// NOME (razão social) ou CNPJ. Prefere a razão social (= nome da conta no
// Salesforce); cai para o CNPJ se não achar 1 único. Pega /clientes/{id} e
// extrai o link hub?projeto={pid}. Roda na sessão logada do painel.
async function resolverPainelUrl(win, termo) {
  const razao = String((termo && termo.razao) || '').trim();
  const cnpj8 = String((termo && termo.cnpj) || '').replace(/\D/g, '').slice(0, 8);
  const termos = [];
  if (razao) {
    termos.push(razao);
    const enxuto = razao.replace(/\b(ltda|me|epp|eireli|mei|s\.?a\.?)\b\.?/gi, '').replace(/[.\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
    if (enxuto && enxuto.toLowerCase() !== razao.toLowerCase()) termos.push(enxuto);
  }
  if (cnpj8.length >= 8) termos.push(cnpj8);
  if (!termos.length) throw new Error('sem razão social nem CNPJ para achar o cliente no painel');

  const r = await rodarNoPainel(win, `
    const termos = ${JSON.stringify(termos)};
    const buscar = async (t) => {
      const resp = await fetch('/clientes?busca=' + encodeURIComponent(t), { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      if (!resp.ok) return { erro: 'HTTP ' + resp.status };
      const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
      const hrefs = [...new Set([...doc.querySelectorAll('a[href*="/clientes/"]')].map((a) => a.getAttribute('href')).filter((h) => /\\/clientes\\/\\d+(?:$|[\\/?])/.test(h || '')))];
      return { hrefs };
    };
    let escolhido = null; const motivos = [];
    for (const t of termos) {
      const b = await buscar(t);
      if (b.erro) { motivos.push(t + ': ' + b.erro); continue; }
      if (b.hrefs.length === 1) { escolhido = b.hrefs[0]; break; }
      motivos.push(t + ': ' + b.hrefs.length + ' resultado(s)');
    }
    if (!escolhido) return { erro: 'não achei 1 cliente único no painel (' + motivos.join('; ') + ')' };
    const id = (escolhido.match(/\\/clientes\\/(\\d+)/) || [])[1];
    const resp2 = await fetch('/clientes/' + id, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const hub = ((await resp2.text()).match(/\\/clientes\\/\\d+\\/hub\\?projeto=\\d+/) || [])[0];
    return { id, hub: hub ? ('https://${PAINEL_HOST}' + hub) : null };
  `);
  if (r.erro) throw new Error(r.erro);
  if (!r.hub) throw new Error(`achei o cliente ${r.id} no painel, mas não o link do projeto/hub`);
  return r.hub + (r.hub.includes('?') ? '&' : '?') + 'tab=publicacao';
}

// Handler: bloquear/desbloquear contatos no painel MPI+. Aceita url direta do
// hub OU cnpj (para resolver sozinho). Faz backup antes de bloquear, tenta o
// endereço todo censurado (modo A) e cai para B (mantém CEP/cidade/UF) se o
// servidor recusar; confirma relendo.
const executarPainelBloqueio = async (event, { dominio: bruto, cnpj, url, razao: razaoParam, marca, acao = 'bloquear' } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  const desbloquear = acao === 'desbloquear';
  const dominio = normalizeDomain(bruto) || String(bruto || '').trim();
  if (!dominio && !url && !cnpj) return { ok: false, error: 'Informe o domínio (ou o link/CNPJ do cliente no painel).', log };
  if (!dominio) return { ok: false, error: 'Preciso do domínio do cliente para chavear o backup.', log };

  const opts = { emailMarca: PAINEL_EMAIL_BLOQUEIO, tel: painelMpiplus.TEL_PLACEHOLDER, censura: painelMpiplus.CENSURA };
  let win = null;
  let alvoUrl = String(url || '').trim();
  let erroFatal = false;
  try {
    if (alvoUrl && !painelUrlValida(alvoUrl)) throw new Error(`o link do painel precisa ser do ${PAINEL_HOST}. Recebi: ${alvoUrl}`);
    if (!alvoUrl) {
      // Sem link pronto: acha a razão social (nome da conta no Salesforce) pelo
      // domínio, se não veio, e busca o cliente no painel por ela (CNPJ reserva).
      let razao = String(razaoParam || '').trim();
      if (!razao && !cnpj) {
        push('Descobrindo a razão social do cliente no Salesforce…', 'cmd');
        const rc = await sfComSessao((sf) => acharContaPorDominio(sf, dominio, push)).catch((e) => ({ erro: e.message }));
        if (rc && rc.conta && rc.conta.Name) { razao = rc.conta.Name; push(`Razão social: ${razao}${rc.via ? ' (por ' + rc.via + ')' : ''}.`, 'info'); }
        else throw new Error('não consegui a razão social no Salesforce para achar o cliente no painel' + ((rc && (rc.motivo || rc.erro)) ? `: ${rc.motivo || rc.erro}` : ''));
      }
      push('Procurando o cliente no painel (razão social / CNPJ)…', 'cmd');
      win = await abrirPainelLogado(`https://${PAINEL_HOST}/clientes`, push);
      alvoUrl = await resolverPainelUrl(win, { razao, cnpj });
      push(`Cliente encontrado no painel: ${alvoUrl}`, 'info');
      const c = aguardarCarregar(win); win.loadURL(alvoUrl); await c;
    } else {
      win = await abrirPainelLogado(alvoUrl, push);
    }

    push('Lendo os contatos do cliente no painel.', 'cmd');
    const antes = await rodarNoPainel(win, JS_PAINEL_LER_CONTATOS);
    if (antes.erro) throw new Error(antes.erro);
    const estadoAtual = { addresses: antes.addresses, whatsapp: antes.whatsapp };
    // Dois blocos independentes: endereços/contatos e WhatsApp (Integrações).
    // "Bloqueado" de verdade só com os dois; um bloqueio parcial (ex.: uma
    // execução antiga que só pegou os endereços) segue para completar.
    const enderecosCensurados = painelMpiplus.estaBloqueado(estadoAtual, opts);
    const whatsCensurado = painelMpiplus.whatsappBloqueado(estadoAtual, opts);
    const bloqueadoAgora = enderecosCensurados && whatsCensurado;

    if (!desbloquear && bloqueadoAgora) { push('Os contatos deste cliente já estão censurados no painel (endereços e WhatsApp).', 'info'); return { ok: true, jaEstava: true, dominio, log }; }
    if (desbloquear && !enderecosCensurados && !whatsCensurado) { push('Os contatos deste cliente já estão no ar (não estava bloqueado).', 'info'); return { ok: true, jaEstava: true, dominio, log }; }

    if (desbloquear) {
      const bkp = readPainelContatos()[dominio];
      if (!bkp || !bkp.dados || !((bkp.dados.addresses || []).length)) {
        throw new Error('não tenho o backup dos contatos deste cliente para restaurar (foi bloqueado fora do Hub?). Reponha à mão no painel.');
      }
      push('Restaurando os contatos originais no painel…', 'cmd');
      const r = await rodarNoPainel(win, jsPainelEscreverSalvar(bkp.dados));
      if (r.erro) throw new Error(r.erro);
      if (!r.ok) throw new Error('o painel recusou a restauração: ' + (r.erros || []).join(' | '));
    } else {
      // Backup: só quando o estado atual ainda é o ORIGINAL. Se os endereços já
      // estão censurados (bloqueio parcial), o backup bom já existe e NÃO pode
      // ser sobrescrito com dados censurados — senão o desbloqueio perderia os
      // contatos de verdade.
      const jaTemBackup = !!readPainelContatos()[dominio];
      if (!enderecosCensurados) {
        if (!salvarPainelContatos(dominio, estadoAtual)) {
          throw new Error('não consegui guardar o backup dos contatos (criptografia do sistema indisponível). Abortei para não bloquear sem ter como reverter.');
        }
        push('Backup dos contatos guardado (criptografado) para o desbloqueio.', 'info');
      } else if (jaTemBackup) {
        push(`Endereços já censurados; mantendo o backup original guardado e completando o WhatsApp${whatsCensurado ? '' : ' (Integrações)'}.`, 'info');
      } else {
        push('Atenção: os endereços já estão censurados e não tenho backup deles (bloqueado fora do Hub?). Vou completar o bloqueio, mas o desbloqueio não terá os endereços originais.', 'warn');
      }

      const tentar = async (modo) => {
        const plano = painelMpiplus.planoCensura(estadoAtual, Object.assign({}, opts, { modoEndereco: modo }));
        push(`Censurando os contatos (## + e-mail ${opts.emailMarca}; telefone/WhatsApp → ${opts.tel}; endereço modo ${modo})…`, 'cmd');
        return rodarNoPainel(win, jsPainelEscreverSalvar(plano));
      };
      let r = await tentar('A');
      if (r.erro) throw new Error(r.erro);
      if (!r.ok && /(cep|endere|cidade|\buf\b|geo|logrador|bairro)/i.test((r.erros || []).join(' '))) {
        push('O servidor recusou o endereço todo censurado; tentando manter CEP/cidade/UF (modo B).', 'warn');
        r = await tentar('B');
        if (r.erro) throw new Error(r.erro);
      }
      if (!r.ok) throw new Error('o painel recusou o bloqueio: ' + (r.erros || []).join(' | '));
    }

    // Confirma relendo do SERVIDOR: recarrega a página do hub (não confio só no
    // estado local pós-save, que pode não ter re-hidratado da resposta).
    try { const cc = aguardarCarregar(win); win.loadURL(alvoUrl); await cc; } catch (e) {}
    const depois = await rodarNoPainel(win, JS_PAINEL_LER_CONTATOS).catch(() => null);
    if (!depois || depois.erro) { push('Salvei, mas não consegui reler para confirmar. Confira no painel.', 'warn'); return { ok: false, incerto: true, dominio, log }; }
    const estadoDepois = { addresses: depois.addresses, whatsapp: depois.whatsapp };
    const endDepois = painelMpiplus.estaBloqueado(estadoDepois, opts);
    const waDepois = painelMpiplus.whatsappBloqueado(estadoDepois, opts);
    if (!desbloquear && !(endDepois && waDepois)) {
      push(`Atenção: reli e ${!endDepois ? 'os endereços/contatos' : 'o WhatsApp (Integrações)'} ainda aparece(m); não confirmei o bloqueio.`, 'warn');
      return { ok: false, incerto: true, dominio, log };
    }
    if (desbloquear && (endDepois || waDepois)) {
      push(`Atenção: reli e ${endDepois ? 'os endereços/contatos' : 'o WhatsApp (Integrações)'} continua(m) censurado(s); não confirmei o desbloqueio.`, 'warn');
      return { ok: false, incerto: true, dominio, log };
    }

    if (desbloquear) { try { apagarPainelContatos(dominio); push('Backup dos contatos apagado (não é mais necessário).', 'info'); } catch (e) {} }
    push(`Contatos ${desbloquear ? 'restaurados' : 'censurados'} no painel MPI+. O site regenera em seguida.`, 'success');
    return { ok: true, dominio, via: 'painel', desbloqueou: desbloquear, log };
  } catch (e) {
    erroFatal = true;
    push(`Painel MPI+: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  } finally {
    painelSoltarJanela(win, alvoUrl || null, { descartar: erroFatal });
  }
};
handleNoPainel('painel:bloquear', executarPainelBloqueio);

const JS_PUBLICACAO = `
  ${JS_HELPERS}
  // O painel define o gancho depois que os scripts da página sobem. Olhar uma
  // vez só, logo no load, falhava quando a página demorava um pouco (ADR-092):
  // espera como já espera o botão, até 20s.
  const P = await ate(() => window.__mpiHubPubPublication, 20000);
  if (!P) return { erro: 'a aba Publicação não carregou em 20s (o painel não expôs window.__mpiHubPubPublication)', abaNaoCarregou: true };
  const botaoRaiz = await ate(() => Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('@click')||'').includes('openSiteAprovarDlg')), 20000);
  if (!botaoRaiz) return { erro: 'não achei a aba Publicação (o botão Aprovar) em 20s' };
  const root = window.Alpine.$data(botaoRaiz.closest('[x-data]'));
  const alertas = [];
  window.alert = (m) => { alertas.push(String(m)); };
  const estado = () => ({
    etapas: JSON.parse(JSON.stringify(root.pubStepStatus || {})),
    siteStatus: String(root.wordpressSiteStatus || ''),
    podePublicar: !!root.canStartProductionPublish,
    job: JSON.parse(JSON.stringify(root.productionPublishJob || null)),
    emAndamento: !!root.productionPublishInProgress,
    concluido: !!root.productionPublishCompleted,
    falhou: !!root.productionPublishFailed,
    erroPublicacao: root.productionPublishError || null,
    urlProducao: root.wordpressProductionUrl || null,
    sslAtivo: !!root.wpProductionSslActive,
    sslErro: root.wpProductionSslError || null,
    urlTemporaria: root.wordpressTemporaryUrl || null,
    servidores: JSON.parse(JSON.stringify(root.servidores || [])),
    alertas,
  });
`;

async function painelEstadoPublicacao(win) {
  return rodarNoPainel(win, `${JS_PUBLICACAO} return { ok: true, estado: estado() };`);
}

async function painelAprovar(win, push) {
  push('Painel: aprovando o site', 'cmd');
  const r = await rodarNoPainel(win, `${JS_PUBLICACAO}
    const antes = estado();
    if (antes.siteStatus === 'approved') return { ok: true, jaEstava: true, estado: antes };
    if (!P.siteAprovarDisponivel(root)) {
      return { erro: 'o painel não deixa aprovar agora: etapas ' + JSON.stringify(antes.etapas) + ', status do site ' + antes.siteStatus, estado: antes };
    }
    await P.confirmSiteAprovar(root);
    const depois = await ate(() => String(root.wordpressSiteStatus || '') === 'approved' ? estado() : null, 20000);
    if (!depois) {
      return { erro: 'aprovei, mas o status não virou approved em 20s' + (root.wpSiteApproveDialogError ? ': ' + root.wpSiteApproveDialogError : ''), estado: estado() };
    }
    return { ok: true, estado: depois };
  `);
  if (r.jaEstava) push('Painel: o site já estava aprovado.', 'info');
  else push('Painel: site aprovado (status approved).', 'success');
  return r.estado;
}

// O servidor de produção é o que o PAINEL lista na hora (ADR-140): com `tipo`,
// só os de produção; sem (painel antigo), todos. Um só: é ele. Dois ou mais e
// ninguém escolheu (`servidorId` vazio): devolve a lista para o Hub perguntar.
// A configuração não decide mais — em 05/10/2026 o servidor 11 configurado
// tinha sumido do painel e toda publicação falhava.
async function painelPublicarProducao(win, { dominio, servidorId }, push) {
  const cfg = readPublicacaoConfig();
  const pedido = servidorId ? String(servidorId) : '';
  push(`Painel: publicando em produção ${dominio}${pedido ? ' no servidor ' + pedido : ' no servidor de produção que o painel lista'}`, 'cmd');
  const r = await rodarNoPainel(win, `${JS_PUBLICACAO}
    const antes = estado();
    if (antes.concluido && !antes.falhou) return { ok: true, jaEstava: true, estado: antes };
    if (!antes.podePublicar) {
      return { erro: 'o painel não deixa publicar agora (canStartProductionPublish=false). Status do site: ' + antes.siteStatus + ', job: ' + JSON.stringify(antes.job), estado: antes };
    }
    const lista = (root.servidores || []).map(s => ({ id: String(s.id), nome: String(s.nome || ''), tipo: String(s.tipo || ''), host: String(s.host || ''), ip: String(s.ip || '') }));
    const producao = lista.filter(s => !s.tipo || s.tipo === 'production');
    const pedido = ${JSON.stringify(pedido)};
    let escolhido = pedido ? lista.find(s => s.id === pedido) : null;
    if (pedido && !escolhido) {
      return { erro: 'servidor ' + pedido + ' não está na lista do painel: ' + (lista.map(s => s.id + ' ' + (s.nome || s.host)).join(', ') || 'lista vazia'), estado: antes };
    }
    if (!escolhido) {
      if (!producao.length) return { erro: 'o painel não lista nenhum servidor de produção (lista: ' + (lista.map(s => s.id + ' ' + (s.nome || s.host) + (s.tipo ? ' [' + s.tipo + ']' : '')).join(', ') || 'vazia') + ')', estado: antes };
      if (producao.length > 1) return { ok: true, escolher: producao, estado: antes };
      escolhido = producao[0];
    }
    root.publicarProducaoForm = { dominio: ${JSON.stringify(dominio)}, servidorId: escolhido.id };
    root.publicarProducaoModalOpen = true;
    await espera(80);
    const dominioOk = await P.validarDominioProducao(root);
    if (!dominioOk) {
      root.publicarProducaoModalOpen = false;
      return { erro: 'o painel recusou o domínio: ' + (root.publicarProducaoDomainError || 'sem mensagem'), estado: estado() };
    }
    await P.salvarPublicacaoProducao(root);
    await espera(400);
    if (alertas.length) return { erro: 'o painel respondeu: ' + alertas.join(' | '), estado: estado() };
    const comecou = await ate(() => (root.productionPublishInProgress || (root.productionPublishJob && root.productionPublishJob.status)) ? estado() : null, 20000);
    if (!comecou) return { erro: 'enfileirei a publicação, mas o painel não registrou job nenhum em 20s', estado: estado() };
    return { ok: true, estado: comecou, servidor: escolhido };
  `);
  if (r.jaEstava) { push('Painel: produção já estava publicada.', 'info'); return { estado: r.estado, servidor: null }; }
  if (r.escolher) {
    push(`Painel: a lista tem ${r.escolher.length} servidores de produção (${r.escolher.map((s) => `${s.nome || s.host}, id ${s.id}`).join('; ')}). Preciso que alguém escolha.`, 'warn');
    return { precisaEscolher: true, servidores: r.escolher, estado: r.estado };
  }
  const s = r.servidor || {};
  push(`Painel: servidor de produção ${s.nome || s.host || s.id} (id ${s.id}${s.host ? ', ' + s.host : ''}${s.ip ? ', IP ' + s.ip : ''}), o que o painel lista.`, 'info');
  if (s.ip && cfg.hestiaIpPublico && s.ip !== cfg.hestiaIpPublico) {
    push(`O servidor escolhido tem IP público ${s.ip} e a configuração diz ${cfg.hestiaIpPublico}. O DNS deste projeto usou o IP do servidor do painel (ADR-141); atualize o IP nas Configurações para a reserva não ficar velha.`, 'warn');
  }
  push(`Painel: publicação enfileirada (job ${r.estado.job?.id || '?'}, passo ${r.estado.job?.step || '?'}).`, 'success');
  return { estado: r.estado, servidor: r.servidor || null };
}

// Espera o job terminar, lendo o snapshot do painel a cada 2s.
async function painelEsperarPublicacao(win, push, { maxMs = 20 * 60 * 1000 } = {}) {
  const inicio = Date.now();
  let ultimoPasso = null;
  while (Date.now() - inicio < maxMs) {
    const r = await rodarNoPainel(win, `${JS_PUBLICACAO}
      await P.refreshWpInstallSnapshot(root);
      return { ok: true, estado: estado() };
    `);
    const e = r.estado;
    const passo = e.job?.step || null;
    if (passo && passo !== ultimoPasso) {
      ultimoPasso = passo;
      push(`Painel: ${passoLabel(passo)}`, 'info');
    }
    if (e.falhou || e.job?.status === 'failed') {
      throw new Error(`a publicação em produção falhou${e.erroPublicacao || e.job?.error_message ? ': ' + (e.erroPublicacao || e.job.error_message) : ''}`);
    }
    if (e.concluido || e.job?.status === 'completed') {
      push(`Painel: publicação em produção concluída${e.urlProducao ? ' (' + e.urlProducao + ')' : ''}.`, 'success');
      return e;
    }
    await dormir(2000);
  }
  throw new Error('a publicação em produção não terminou em 20 minutos; confira no painel');
}

function passoLabel(step) {
  return {
    web_domain_database: 'criando domínio e banco no servidor',
    export_db_sync: 'sincronizando banco e arquivos',
    config_wp: 'configurando o WordPress para produção',
  }[step] || `passo ${step}`;
}

// O certificado que o domínio entrega de verdade, na porta 443. É a prova de
// que o SSL de produção está ativo: a resposta do painel não é (ADR-101).
// rejectUnauthorized:false só para poder LER o certificado errado e dizer de
// quem ele é; nada é enviado nessa conexão.
function certificadoDoDominio(host, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    let feito = false;
    let sock = null;
    const fim = (r) => {
      if (feito) return;
      feito = true;
      try { if (sock) sock.destroy(); } catch (e) {}
      resolve(r);
    };
    try {
      sock = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
        const cert = sock.getPeerCertificate() || {};
        const erroNome = cert.subject ? tls.checkServerIdentity(host, cert) : new Error('sem certificado');
        const ok = !!sock.authorized && !erroNome;
        const nomes = String(cert.subjectaltname || '').replace(/DNS:/g, '').split(/,\s*/).filter(Boolean);
        fim({
          ok,
          nomes,
          emissor: (cert.issuer && (cert.issuer.O || cert.issuer.CN)) || '',
          ate: cert.valid_to || '',
          erro: ok ? '' : erroNome ? `o certificado é de ${nomes.join(', ') || 'outro nome'}` : `certificado não confiável (${sock.authorizationError || 'sem motivo'})`,
        });
      });
      sock.setTimeout(timeoutMs, () => fim({ ok: false, erro: 'a porta 443 não respondeu' }));
      sock.on('error', (e) => fim({ ok: false, erro: e.message }));
    } catch (e) {
      fim({ ok: false, erro: e.message });
    }
  });
}

// Confere o certificado a cada passoMs, por até maxMs (em número de
// tentativas, para não depender do relógio). Devolve o último resultado.
async function esperarCertificado(host, push, { maxMs = 5 * 60 * 1000, passoMs = 15000 } = {}) {
  const tentativas = Math.max(1, Math.ceil(maxMs / passoMs) + 1);
  let ultimo = null;
  for (let i = 0; i < tentativas; i++) {
    ultimo = await certificadoDoDominio(host);
    if (ultimo.ok || i === tentativas - 1) return ultimo;
    if (i % 4 === 0) push(`${host} ainda entrega ${ultimo.erro}; confiro de novo a cada ${Math.round(passoMs / 1000)}s (até ${Math.round(maxMs / 60000)} min).`, 'info');
    await dormir(passoMs);
  }
  return ultimo;
}

// Texto de erro do painel, que às vezes é a página HTML inteira do 504.
function limparErroDoPainel(t) {
  const s = String(t || '');
  const titulo = (s.match(/<title>([^<]*)<\/title>/i) || [])[1];
  const limpo = (titulo || s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return limpo.slice(0, 200);
}

// Ativar o SSL de produção. O painel costuma responder erro (504 Gateway
// Timeout e outros) e ativar mesmo assim; então a resposta dele não decide.
// Decide o certificado do domínio: antes (já estava?), e depois do pedido, por
// alguns minutos, com ou sem erro do painel (ADR-101).
async function painelAtivarSsl(win, push, dominio) {
  if (dominio) {
    const antes = await certificadoDoDominio(dominio);
    if (antes.ok) {
      push(`SSL de produção já ativo: ${dominio} entrega o próprio certificado (${antes.emissor || 'emissor ?'}, válido até ${antes.ate || '?'}).`, 'info');
      return { sslAtivo: true, jaEstava: true, certificado: antes };
    }
  }
  push('Painel: ativando o SSL de produção', 'cmd');
  let r = null;
  let painelErro = null;
  try {
    r = await rodarNoPainel(win, `${JS_PUBLICACAO}
      const antes = estado();
      if (antes.sslAtivo) return { ok: true, jaEstava: true, estado: antes };
      root.wpProductionSslError = null;
      let excecao = null;
      try { await P.activateProductionSsl(root); } catch (e) { excecao = String(e && e.message || e); }
      const depois = await ate(() => (root.wpProductionSslActive || root.wpProductionSslError) ? estado() : null, 90000) || estado();
      const aviso = excecao || (depois.alertas && depois.alertas.length ? depois.alertas.join(' | ') : null) || (depois.sslAtivo ? null : (depois.sslErro || 'o painel não confirmou em 90s'));
      return { ok: true, estado: depois, painelErro: aviso };
    `);
    painelErro = r.painelErro || null;
  } catch (e) {
    painelErro = e.message;
  }
  if (r && r.jaEstava && !dominio) { push('Painel: SSL de produção já estava ativo.', 'info'); return r.estado; }
  if (!dominio) {
    if (painelErro) throw new Error(`o painel não ativou o SSL: ${limparErroDoPainel(painelErro)}`);
    push('Painel: SSL de produção ativo.', 'success');
    return r.estado;
  }
  if (painelErro) {
    push(`O painel respondeu erro ao ativar o SSL (${limparErroDoPainel(painelErro)}). Ele costuma ativar mesmo assim: vou conferir o certificado de ${dominio}.`, 'warn');
  } else {
    push(`Painel: SSL pedido. Conferindo o certificado de ${dominio}.`, 'info');
  }
  const cert = await esperarCertificado(dominio, push);
  if (cert.ok) {
    push(`SSL de produção ativo: ${dominio} entrega o próprio certificado (${cert.emissor || 'emissor ?'}, válido até ${cert.ate || '?'})${painelErro ? '. O erro do painel foi só na resposta' : ''}.`, 'success');
    return { ...(r && r.estado ? r.estado : {}), sslAtivo: true, certificado: cert };
  }
  const e = new Error(`o SSL não ficou ativo: ${dominio} ainda entrega ${cert.erro} depois de 5 min${painelErro ? `, e o painel respondeu "${limparErroDoPainel(painelErro)}"` : ''}`);
  e.detalhe = { estado: r && r.estado };
  throw e;
}

handleNoPainel('painel:publicar', async (event, payload) => {
  const { url, etapa, dominio: bruto, servidorId } = payload || {};
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  let win = null;
  let erroFatal = false;
  try {
    const dominio = normalizeDomain(bruto);
    win = await abrirPainelLogado(url, push);

    if (etapa === 'estado') {
      let r;
      try {
        r = await painelEstadoPublicacao(win);
      } catch (e) {
        if (!e.detalhe?.abaNaoCarregou) throw e;
        // Página lenta: uma segunda chance com a página recarregada do zero,
        // antes de dar o site como falho (ADR-092).
        push('Painel: a aba Publicação demorou para carregar; recarregando a página e tentando de novo.', 'warn');
        painelDescartarJanela();
        if (win && !win.isDestroyed()) win.destroy();
        win = await abrirPainelLogado(url, push);
        r = await painelEstadoPublicacao(win);
      }
      return { ok: true, log, estado: r.estado };
    }
    if (etapa === 'aprovar') {
      const estado = await painelAprovar(win, push);
      return { ok: true, log, estado };
    }
    if (etapa === 'publicar') {
      if (!dominio) throw new Error('Sem domínio para publicar.');
      // O servidor vem da lista do painel (ADR-140); servidorId só vem
      // preenchido quando a pessoa escolheu entre dois.
      const r = await painelPublicarProducao(win, { dominio, servidorId: servidorId ? String(servidorId) : '' }, push);
      if (r.precisaEscolher) {
        return { ok: false, precisaEscolher: true, servidores: r.servidores, error: `o painel lista ${r.servidores.length} servidores de produção; escolha um`, log, estado: r.estado };
      }
      const estado = await painelEsperarPublicacao(win, push);
      return { ok: true, log, estado, servidor: r.servidor || null };
    }
    if (etapa === 'ssl') {
      const estado = await painelAtivarSsl(win, push, dominio);
      return { ok: true, log, estado };
    }
    throw new Error(`Etapa desconhecida: ${etapa}`);
  } catch (e) {
    erroFatal = true;
    if (e.detalhe?.estado) push(`Painel: estado na hora do erro: ${JSON.stringify(e.detalhe.estado)}`, 'warn');
    push(`Painel: ${e.message}`, 'error');
    return { ok: false, error: e.message, log, estado: e.detalhe?.estado || null };
  } finally {
    painelSoltarJanela(win, url, { descartar: erroFatal });
  }
});


// ----- Achar o link do painel pela razão social (ADR-098) -----
//
// Só leitura: busca o cliente, lê os projetos e os contratos, e fica com o
// contrato cujo site temporário é o da planilha. A janela abre em /clientes
// (logada como as outras) e cada leitura é uma chamada separada, cada uma com
// o prazo de sempre: a página do projeto sozinha leva uns 20s.
const painelAchar = require(path.join(__dirname, 'lib', 'painel-achar'));

handleNoPainel('painel:acharContrato', async (event, payload) => {
  const { razao, temporario, dominio } = payload || {};
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  const url = `https://${PAINEL_HOST}/clientes`;
  let win = null;
  let erroFatal = false;
  try {
    win = await abrirPainelLogado(url, push);
    const rodar = (script) => rodarNoPainel(win, script);
    const r = await painelAchar.acharContratoNoPainel(rodar, { razao, temporario, dominio: normalizeDomain(dominio) || dominio }, push);
    if (!r.ok) {
      push(`Painel: não achei o contrato de ${dominio || razao}: ${r.erro}.`, 'warn');
      for (const l of r.lista || []) push(`  ${l}`, 'info');
      return { ok: false, naoAchou: true, error: r.erro, lista: r.lista || [], log };
    }
    const c = r.contrato;
    // Como o contrato foi confirmado: pelo temporário da planilha, pela URL de
    // produção igual ao domínio (ADR-144), ou por ser o único do cliente.
    const como = r.conferidoPeloTemporario
      ? `temporário ${painelAchar.normalizarTemporario(c.temporario)} confere`
      : r.conferidoPelaProducao
        ? `publicado em ${painelAchar.normalizarProducao(c.producao)}, que é o domínio da planilha`
        : 'o único do cliente (sem temporário na planilha e sem produção no domínio para conferir)';
    if (r.aviso) push(`Painel: ${r.aviso}.`, 'warn');
    push(`Painel: ${dominio || razao} → ${c.empresa} / ${c.projetoNome || c.projeto} / contrato ${c.contrato}, ${como}.`, r.conferidoPeloTemporario || r.conferidoPelaProducao ? 'success' : 'warn');
    return { ok: true, url: r.url, contrato: c, conferidoPeloTemporario: r.conferidoPeloTemporario, conferidoPelaProducao: !!r.conferidoPelaProducao, aviso: r.aviso || '', log };
  } catch (e) {
    erroFatal = true;
    push(`Painel: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  } finally {
    painelSoltarJanela(win, url, { descartar: erroFatal });
  }
});

// Os servidores que o painel lista, e o IP de produção para o DNS de um
// projeto novo (ADR-141): o do único servidor de produção com IP; null quando
// o painel não dá IP ou lista mais de um (aí vale a configuração, e a escolha
// do servidor fica para a hora de publicar, ADR-140). Fica depois do
// painel:publicar porque o test-ssl-painel recorta o main.js até ele.
handleNoPainel('painel:servidores', async (event, payload) => {
  const { url } = payload || {};
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  let win = null;
  let erroFatal = false;
  try {
    win = await abrirPainelLogado(url, push);
    const r = await painelEstadoPublicacao(win);
    const servidores = ((r.estado && r.estado.servidores) || []).map((s) => ({ id: String(s.id), nome: String(s.nome || ''), tipo: String(s.tipo || ''), host: String(s.host || ''), ip: String(s.ip || '') }));
    const producao = servidores.filter((s) => !s.tipo || s.tipo === 'production');
    const ipProducao = producao.length === 1 && producao[0].ip ? producao[0].ip : null;
    push(`Painel: ${servidores.length} servidor(es) na lista, ${producao.length} de produção${ipProducao ? `; IP de produção ${ipProducao} (${producao[0].nome || producao[0].host})` : ''}.`, 'info');
    return { ok: true, log, servidores, producao, ipProducao };
  } catch (e) {
    erroFatal = true;
    push(`Painel: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  } finally {
    painelSoltarJanela(win, url, { descartar: erroFatal });
  }
});

// ----- Registro.br: trocar os servidores DNS (ADR-059) -----
//
// Mapeado com a conta da Busca Cliente logada, só leitura. O painel deles é
// uma SPA em Vue que fala com /v2/ajax: o domínio é lido em
// GET /v2/ajax/domain/<fqdn> (Hosts, CanEditDNS, DSSet) e os servidores são
// gravados em POST /v2/ajax/domain/<fqdn>/dns com { hosts, dsSet }. Toda
// chamada leva o cabeçalho X-XSRF-TOKEN, copiado do cookie XSRF-TOKEN. O login
// é o formulário normal (login.user, login.password); se aparecer segundo
// fator, a janela é mostrada para a pessoa resolver.

const REGISTROBR_HOST = 'registro.br';
const registrobrPartition = (empresa) => `persist:registrobr-${empresa}`;

function registrobrUrlValida(url) {
  try { return new URL(url).hostname === REGISTROBR_HOST; } catch (e) { return false; }
}

async function registrobrAbrir(empresa, dominio, push) {
  const seg = readEmpresaSegredos(empresa);
  if (!seg.registrobrUsuario || !seg.registrobrSenha) {
    throw new Error(`${brandName(empresa)} não tem login do Registro.br configurado. Preencha nas configurações.`);
  }
  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 800,
    webPreferences: { partition: registrobrPartition(empresa), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.webContents.on('will-navigate', (e, destino) => { if (!registrobrUrlValida(destino)) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const url = `https://${REGISTROBR_HOST}/painel/dominios/?dominio=${encodeURIComponent(dominio)}`;
  push(`Registro.br (${brandName(empresa)}): abrindo ${url}`, 'cmd');
  const carregou = aguardarCarregar(win);
  win.loadURL(url);
  await carregou;
  // A SPA deles termina de montar depois do load: espera o formulário de login
  // ou o cookie de sessão aparecer, em vez de um tempo fixo (ADR-072).
  await rodarNoPainel(win, `
    const fim = Date.now() + 4000;
    while (Date.now() < fim) {
      if (document.querySelector('input[type=password]') || document.cookie.includes('XSRF-TOKEN')) break;
      await new Promise(r => setTimeout(r, 80));
    }
    await new Promise(r => setTimeout(r, 150));
    return { ok: true };
  `);

  const precisaLogin = await rodarNoPainel(win, `return { login: !!document.querySelector('input[type=password]'), url: location.href };`);
  if (precisaLogin.login) {
    push('Registro.br pedindo login, entrando com a conta configurada', 'cmd');
    const r = await rodarNoPainel(win, `
      const senha = document.querySelector('input[type=password]');
      const user = document.querySelector('#login\\\\.user, input[name="login.user"], input[type=text]');
      if (!senha || !user) return { erro: 'não achei os campos de login do Registro.br' };
      const setar = (el, v) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setar(user, ${JSON.stringify(seg.registrobrUsuario)});
      setar(senha, ${JSON.stringify(seg.registrobrSenha)});
      const form = senha.closest('form');
      const botao = form ? form.querySelector('button[type=submit], button:not([type=button])') : null;
      if (botao) botao.click(); else if (form) (form.requestSubmit ? form.requestSubmit() : form.submit());
      else return { erro: 'não achei o formulário de login' };
      return { enviado: true };
    `);
    if (!r.enviado) throw new Error('Não consegui enviar o login do Registro.br.');

    // Login pronto é a API respondendo, não a tela mudando (ADR-075). O
    // formulário deles troca os campos por um "carregando" enquanto consulta
    // /v2/ajax/checklogin, e foi esse piscar que o código antigo leu como
    // "saiu da tela de login". Daqui em diante a prova é GET /v2/ajax/domains
    // responder 200. CAPTCHA (Turnstile) ou segundo fator: a janela é mostrada
    // para a pessoa resolver; o Hub não contorna nenhum dos dois.
    const inicio = Date.now();
    let mostrada = false;
    let estado = null;
    for (;;) {
      const limite = mostrada ? 4 * 60 * 1000 : 40000;
      if (Date.now() - inicio > limite) break;
      await dormir(700);
      estado = await rodarNoPainel(win, `
        const q = (sel) => document.querySelector(sel);
        const textos = (sel) => Array.from(document.querySelectorAll(sel)).map(e => (e.textContent || '').trim()).filter(Boolean);
        let logado = false;
        try {
          const m = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/);
          const x = m ? decodeURIComponent(m[1]) : '';
          const r = await fetch('/v2/ajax/domains', { credentials: 'same-origin', headers: { Accept: 'application/json', 'X-XSRF-TOKEN': x } });
          logado = r.status === 200;
        } catch (e) {}
        const avisos = textos('.sr-only, .txt-alert, [role=alert], [class*="error"]').filter(t => t.length < 240);
        return {
          logado,
          captcha: !!q('#turnstile-box iframe') || avisos.some(t => /preencha o captcha/i.test(t)),
          segundoFator: !!(q('#login\\\\.totp') || q('#login\\\\.challenge') || q('#login\\\\.hotp') || q('input[autocomplete="one-time-code"]')),
          senha: !!q('input[type=password]'),
          erros: textos('.txt-alert, [role=alert], [class*="error"]').filter(t => t.length < 240),
          url: location.href,
        };
      `).catch(() => null);
      if (!estado) continue;
      if (estado.logado) break;
      if ((estado.erros || []).some((t) => /senha|inválid|incorret|bloquead|tentativas|expirou/i.test(t))) {
        throw new Error(`O Registro.br recusou o login: ${estado.erros.join(' | ')}`);
      }
      if ((estado.captcha || estado.segundoFator) && !mostrada) {
        mostrada = true;
        push(
          estado.captcha
            ? 'O Registro.br pediu o CAPTCHA. Abri a janela: resolva lá (e clique em Avançar, se precisar) que eu continuo. Tenho 4 minutos.'
            : 'O Registro.br pediu o segundo fator. Abri a janela: digite o código lá e eu continuo. Tenho 4 minutos.',
          'warn'
        );
        win.show();
      }
    }
    if (mostrada) win.hide();
    if (!estado || !estado.logado) {
      throw new Error(
        mostrada
          ? 'O login do Registro.br não foi concluído em 4 minutos (CAPTCHA ou segundo fator ficaram pendentes).'
          : `O Registro.br não completou o login em 40s${estado && estado.senha ? ', a tela continuou pedindo senha' : ''}. Confira código e senha nas configurações; se a conta pede CAPTCHA a cada login, a janela vai aparecer para você resolver.`
      );
    }
    push('Login do Registro.br aceito.', 'success');

    // Volta para a página do domínio, se o login mandou para o painel geral.
    const agora = await rodarNoPainel(win, `return { url: location.href };`);
    if (!/painel\/dominios/.test(agora.url)) {
      const volta = aguardarCarregar(win);
      win.loadURL(url);
      await volta;
    }
  } else {
    push('Sessão do Registro.br ainda válida, não precisou logar.', 'info');
  }
  // Logado não é o mesmo que sessão ativa para o /v2/ajax: logo depois do
  // login a API respondia 403 "Por favor, informe a sessão", e isso estava
  // sendo lido como "o domínio não está na conta" (ADR-074). Prova a sessão
  // com a própria API antes de perguntar qualquer coisa.
  await registrobrEsperarSessao(win, url, push);
  return win;
}

// Espera a sessão do Registro.br valer para a API: GET /v2/ajax/domains
// respondendo 200. Tenta por até 20s; na metade recarrega a página do painel,
// que é o que a pessoa faria. Sem sessão, erro claro, nunca "não está na conta".
async function registrobrEsperarSessao(win, url, push) {
  const inicio = Date.now();
  let recarregou = false;
  let ultimo = null;
  while (Date.now() - inicio < 20000) {
    ultimo = await rodarNoPainel(win, `
      const m = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/);
      const xsrf = m ? decodeURIComponent(m[1]) : '';
      if (!xsrf) return { status: 0, motivo: 'sem cookie XSRF-TOKEN' };
      try {
        const res = await fetch('/v2/ajax/domains', { credentials: 'same-origin', headers: { Accept: 'application/json', 'X-XSRF-TOKEN': xsrf } });
        let txt = ''; try { txt = await res.text(); } catch (e) {}
        return { status: res.status, motivo: txt.slice(0, 160) };
      } catch (e) { return { status: -1, motivo: String(e && e.message || e) }; }
    `).catch((e) => ({ status: -1, motivo: e.message }));
    if (ultimo.status === 200) return;
    if (!recarregou && Date.now() - inicio > 6000) {
      recarregou = true;
      push('Registro.br: a sessão ainda não vale para a API; recarregando o painel.', 'warn');
      const volta = aguardarCarregar(win);
      win.loadURL(url);
      await volta;
      continue;
    }
    await dormir(700);
  }
  throw new Error(`a sessão do Registro.br não ficou ativa em 20s (última resposta ${ultimo ? ultimo.status : '?'}: ${ultimo ? ultimo.motivo : ''}). Abra o Registro.br nas configurações e confira o login.`);
}

// Roda dentro da página: as chamadas ao /v2/ajax com o cookie de sessão e o XSRF.
const JS_REGISTROBR = `
  const xsrf = (() => { const m = document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/); return m ? decodeURIComponent(m[1]) : ''; })();
  if (!xsrf) return { erro: 'não achei o cookie XSRF-TOKEN; a sessão do Registro.br não está ativa' };
  const api = async (metodo, caminho, corpo) => {
    const res = await fetch(caminho, {
      method: metodo,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    let json = null; const txt = await res.text();
    try { json = txt ? JSON.parse(txt) : {}; } catch (e) { json = { bruto: txt.slice(0, 300) }; }
    return { status: res.status, json };
  };
  const mensagens = (j) => (j && Array.isArray(j.messages)) ? j.messages.map(m => (m.field ? m.field + ': ' : '') + (m.message || m.code)).join(' | ') : '';
`;

// Lê o domínio e diz se o DNS é nosso: contato técnico ou administrativo com o
// handle da empresa. Quem decide o que fazer com a resposta é a tela.
ipcMain.handle('registrobr:consultar', async (event, { empresa, dominio: bruto }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  let win = null;
  try {
    const dominio = normalizeDomain(bruto);
    if (!dominio) throw new Error('Domínio vazio.');
    if (!empresaOk(empresa)) throw new Error('Empresa desconhecida.');
    const cfg = readPublicacaoConfig();
    const handle = String((cfg.registrobrHandles || {})[empresa] || PUBLICACAO_PADRAO.registrobrHandles[empresa] || '').toUpperCase();

    win = await registrobrAbrir(empresa, dominio, push);
    push(`GET /v2/ajax/domain/${dominio}`, 'cmd');
    const r = await rodarNoPainel(win, `${JS_REGISTROBR}
      const r = await api('GET', '/v2/ajax/domain/' + ${JSON.stringify(dominio)});
      // 403 "informe a sessão" é sessão, não é "domínio de outra conta": tem
      // que virar erro, senão o DNS do cliente é decidido por um login lento.
      if (r.status === 403 && /sess/i.test(mensagens(r.json) + JSON.stringify(r.json))) {
        return { erro: 'o Registro.br não reconheceu a sessão (' + (mensagens(r.json) || '403') + '). Tente de novo; se repetir, confira o login nas configurações.' };
      }
      // "Operação não autorizada" (400, código unauthorized-operation) é a
      // resposta do Registro.br para domínio que não está nesta conta: o
      // painel deles trata esse código voltando para a lista (ADR-081). Não é
      // erro de consulta, é "não está aqui".
      const codigos = (r.json && Array.isArray(r.json.messages)) ? r.json.messages.map(m => String(m.code || '')) : [];
      const naoAutorizada = codigos.includes('unauthorized-operation') || /opera[çc][ãa]o n[ãa]o autorizada/i.test(mensagens(r.json));
      if (r.status === 400 && naoAutorizada) return { ok: true, naConta: false, status: r.status, detalhe: mensagens(r.json) };
      if (r.status === 403 || r.status === 404) return { ok: true, naConta: false, status: r.status, detalhe: mensagens(r.json) };
      if (r.status !== 200) return { erro: 'o Registro.br respondeu ' + r.status + ': ' + (mensagens(r.json) || JSON.stringify(r.json).slice(0, 200)) };
      const d = r.json;
      return { ok: true, naConta: true, status: d.Status, tec: d.TecHandle || '', adm: d.AdmHandle || '', canEditDNS: !!d.CanEditDNS, hosts: (d.Hosts || []).map(h => h.Hostname), holder: d.Holder ? d.Holder.Name : '' };
    `);
    if (!r.naConta) {
      push(`${dominio} não aparece na conta de ${brandName(empresa)} no Registro.br (${r.status}${r.detalhe ? ': ' + r.detalhe : ''}).`, 'warn');
      return { ok: true, log, naConta: false, nosso: false, handle };
    }
    // É o contato TÉCNICO que decide, e só ele: é o que o cliente delega para
    // nós quando quer que a gente cuide do DNS. Administrativo é outra coisa.
    const nosso = String(r.tec || '').toUpperCase() === handle;
    push(
      `${dominio}: titular ${r.holder || '?'}, contato técnico ${r.tec || '(vazio)'}, administrativo ${r.adm || '(vazio)'}, DNS ${r.hosts.join(' e ') || '(nenhum)'}.`,
      'info'
    );
    push(
      nosso
        ? `Contato técnico ${handle} é da ${brandName(empresa)}: o DNS é nosso, a publicação inclui Cloudflare e Registro.br.`
        : `O contato técnico é ${r.tec || '(vazio)'}, não ${handle}: o DNS é do cliente. A publicação segue sem Cloudflare e sem Registro.br.`,
      nosso ? 'success' : 'warn'
    );
    return { ok: true, log, naConta: true, nosso, handle, tec: r.tec, adm: r.adm, canEditDNS: r.canEditDNS, hosts: r.hosts, holder: r.holder, status: r.status };
  } catch (e) {
    push(`Registro.br: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
});

// "1h58m15s" -> 7095. O Registro.br devolve o tempo que falta assim; vazio
// quer dizer "menos de um minuto".
function segundosDeTransicao(texto) {
  const t = String(texto || '').trim();
  if (!t) return 60;
  let total = 0;
  const h = t.match(/(\d+)h/); const m = t.match(/(\d+)m/); const sg = t.match(/(\d+)s/);
  if (h) total += Number(h[1]) * 3600;
  if (m) total += Number(m[1]) * 60;
  if (sg) total += Number(sg[1]);
  return total || 60;
}

ipcMain.handle('registrobr:trocarNs', async (event, { empresa, dominio: bruto, nameservers }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  let win = null;
  try {
    const dominio = normalizeDomain(bruto);
    if (!dominio) throw new Error('Domínio vazio.');
    if (!empresaOk(empresa)) throw new Error('Empresa desconhecida.');
    const ns = (nameservers || []).map((n) => String(n || '').trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
    if (ns.length < 2) throw new Error('Preciso de dois nameservers da Cloudflare.');

    win = await registrobrAbrir(empresa, dominio, push);

    push(`GET /v2/ajax/domain/${dominio}`, 'cmd');
    const antes = await rodarNoPainel(win, `${JS_REGISTROBR}
      const r = await api('GET', '/v2/ajax/domain/' + ${JSON.stringify(dominio)});
      if (r.status !== 200) return { erro: 'o Registro.br respondeu ' + r.status + ' ao ler o domínio: ' + (mensagens(r.json) || JSON.stringify(r.json).slice(0, 200)) };
      const d = r.json;
      return {
        ok: true, status: d.Status, canEditDNS: !!d.CanEditDNS, hosts: (d.Hosts || []).map(h => h.Hostname), dsSet: d.DSSet || d.dss || [],
        contato: { adm: d.AdmHandle, tec: d.TecHandle }, freeDNS: d.FreeDNSStatus,
        // Saindo do DNS do próprio Registro.br, a troca fica "em transição" por
        // até 2h: Hosts continua com os antigos, FreednsHosts guarda os novos,
        // CanEditDNS vira false até publicar (ADR-080).
        transicao: !!d.FreednsTransition, transicaoTempo: String(d.FreednsTransitionTime || ''), hostsPendentes: (d.FreednsHosts || []).map(h => h.Hostname || h),
      };
    `);
    const minusc = (l) => (l || []).map((h) => String(h).toLowerCase().replace(/\.$/, ''));
    const iguais = (l) => ns.every((n) => minusc(l).includes(n)) && minusc(l).length === ns.length;
    push(`Domínio ${dominio}: status ${antes.status}, DNS atual ${antes.hosts.join(' e ') || '(nenhum)'}, contatos adm ${antes.contato.adm} / tec ${antes.contato.tec}`, 'info');

    if (antes.transicao) {
      const segundos = segundosDeTransicao(antes.transicaoTempo);
      if (iguais(antes.hostsPendentes)) {
        push(`A troca para ${ns.join(' e ')} já foi feita e está em transição no Registro.br: publica em aproximadamente ${antes.transicaoTempo || 'alguns minutos'}. Nada a refazer.`, 'success');
        return { ok: true, log, jaEstava: true, emTransicao: true, transicaoSegundos: segundos, transicaoTempo: antes.transicaoTempo, antes: antes.hosts, depois: antes.hostsPendentes };
      }
      throw new Error(`o Registro.br está em transição de DNS para ${antes.hostsPendentes.join(' e ') || '(outros servidores)'} (publica em ${antes.transicaoTempo || '?'}) e não aceita outra troca até terminar. Espere e rode a etapa de novo.`);
    }
    if (iguais(antes.hosts)) {
      push('Os nameservers já são os da Cloudflare. Nada a fazer.', 'success');
      return { ok: true, log, jaEstava: true, antes: antes.hosts, depois: antes.hosts };
    }
    if (!antes.canEditDNS) {
      const handle = String((readPublicacaoConfig().registrobrHandles || {})[empresa] || '').toUpperCase();
      throw new Error(`a conta de ${brandName(empresa)} (${handle}) não pode alterar o DNS de ${dominio}: o Registro.br respondeu CanEditDNS=false. Contatos do domínio: técnico ${antes.contato.tec}, administrativo ${antes.contato.adm}.`);
    }
    if (antes.freeDNS && antes.freeDNS !== 'not-using') {
      push(`O domínio usa o DNS do próprio Registro.br (${antes.freeDNS}). Trocar os servidores desliga isso.`, 'warn');
    }
    if ((antes.dsSet || []).some((d) => d && d.keyTag)) {
      push(`O domínio tem DNSSEC (DS) do provedor antigo. Vou remover o DS junto com a troca, senão o domínio para de resolver. Ative o DNSSEC de novo na Cloudflare depois, se quiser.`, 'warn');
    }

    push(`POST /v2/ajax/domain/${dominio}/dns → ${ns.join(', ')}`, 'cmd');
    const r = await rodarNoPainel(win, `${JS_REGISTROBR}
      const hosts = ${JSON.stringify(ns)}.map(h => ({ Hostname: h, IPv4: '', IPv6: '' }));
      const res = await api('POST', '/v2/ajax/domain/' + ${JSON.stringify(dominio)} + '/dns', { hosts, dsSet: [] });
      if (res.status < 200 || res.status >= 300) return { erro: 'o Registro.br recusou a troca (' + res.status + '): ' + (mensagens(res.json) || JSON.stringify(res.json).slice(0, 300)) };
      await new Promise(r => setTimeout(r, 1500));
      const conf = await api('GET', '/v2/ajax/domain/' + ${JSON.stringify(dominio)});
      const d = conf.json || {};
      return {
        ok: true, resposta: res.json,
        depois: (d.Hosts || []).map(h => h.Hostname),
        transicao: !!d.FreednsTransition, transicaoTempo: String(d.FreednsTransitionTime || ''), hostsPendentes: (d.FreednsHosts || []).map(h => h.Hostname || h),
      };
    `);
    // Saindo do DNS do Registro.br a resposta é "em transição": os novos ficam
    // em FreednsHosts e só entram em Hosts quando publicar, em até 2h.
    if (r.transicao && iguais(r.hostsPendentes)) {
      const segundos = segundosDeTransicao(r.transicaoTempo);
      push(`Registro.br aceitou a troca para ${ns.join(' e ')}. O domínio saía do DNS do próprio Registro.br, então a publicação leva aproximadamente ${r.transicaoTempo || '2 horas'}; até lá os servidores antigos continuam respondendo.`, 'success');
      return { ok: true, log, emTransicao: true, transicaoSegundos: segundos, transicaoTempo: r.transicaoTempo, antes: antes.hosts, depois: r.hostsPendentes, dnssecRemovido: (antes.dsSet || []).some((d) => d && d.keyTag) };
    }
    if (!iguais(r.depois)) {
      throw new Error(`gravei, mas ao reler o domínio os servidores são ${(r.depois || []).join(', ') || '(nenhum)'}, não ${ns.join(', ')}`);
    }
    push(`Conferido no Registro.br: ${dominio} agora aponta para ${minusc(r.depois).join(' e ')}.`, 'success');
    push('A publicação no .br leva alguns minutos. A etapa de propagação confere, e o SSL espera por ela.', 'info');
    return { ok: true, log, antes: antes.hosts, depois: minusc(r.depois), dnssecRemovido: (antes.dsSet || []).some((d) => d && d.keyTag) };
  } catch (e) {
    push(`Registro.br: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
});

// ---------- Bitbucket: commit automático do geral.php ----------

const BITBUCKET_HOSTS = ['bitbucket.org', 'api.bitbucket.org'];

function isBitbucketHost(hostname) {
  return BITBUCKET_HOSTS.includes(hostname) || hostname.endsWith('.bitbucket.org');
}

// Variante do httpRequest que devolve o corpo cru (o endpoint /src responde texto,
// não JSON) e segue redirecionamentos, mas só dentro do próprio Bitbucket, pra
// nunca vazar o header de autenticação pra outro host.
function httpRaw(method, url, auth, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (!isBitbucketHost(u.hostname)) {
      reject(new Error(`Host inesperado na requisição: ${u.hostname}`));
      return;
    }

    const headers = {
      Authorization: 'Basic ' + Buffer.from(`${auth.email}:${auth.token}`).toString('base64'),
      Accept: opts.accept || '*/*',
    };
    if (opts.contentType) headers['Content-Type'] = opts.contentType;
    if (opts.body) headers['Content-Length'] = Buffer.byteLength(opts.body);

    const remaining = opts.redirects === undefined ? 3 : opts.redirects;

    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && remaining > 0) {
          res.resume();
          const next = new URL(res.headers.location, url);
          if (!isBitbucketHost(next.hostname)) {
            reject(new Error(`Redirecionamento para fora do Bitbucket (${next.hostname}), abortado.`));
            return;
          }
          httpRaw(method, next.toString(), auth, { ...opts, redirects: remaining - 1 }).then(resolve, reject);
          return;
        }
        let chunks = '';
        res.setEncoding('utf-8');
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode, text: chunks }));
      }
    );

    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function parseMaybeJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

// Dica de escopo: o token de API do Bitbucket tem permissões por área, e as de
// pull request NÃO implicam as de repositório (nem write implica read). Token
// feito só para mergear PR lê e grava PR, e mais nada.
const BITBUCKET_SCOPE_HINT =
  ' Se o token foi criado só para mergear PRs, faltam os escopos de repositório: ' +
  'read:repository:bitbucket para ler o geral.php e write:repository:bitbucket para commitar ' +
  '(escopo de pull request não dá nenhum dos dois).';

function bitbucketError(res) {
  const parsed = parseMaybeJson(res.text);
  const msg = parsed?.error?.message || parsed?.error?.detail || parsed?.message;
  if (msg) return String(msg);

  // Sem JSON no formato esperado, o antigo "HTTP 403" escondia a resposta, // e era justamente ela que dizia se o problema era escopo ou branch.
  const cru = String(res.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const dica = res.status === 401 || res.status === 403 ? BITBUCKET_SCOPE_HINT : '';
  return `HTTP ${res.status}${cru ? `, ${cru}` : ''}${dica}`;
}

function buildMultipart(fields) {
  const boundary = '----hubform' + crypto.randomBytes(12).toString('hex');
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`, 'utf-8'));
    parts.push(Buffer.from(String(value), 'utf-8'));
    parts.push(Buffer.from('\r\n', 'utf-8'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// A Site Verification API, com verificationMethod 'META', devolve a TAG INTEIRA:
//
//   <meta name="google-site-verification" content="sJM3ayPdMd9HBEq8bmUn..." />
//
// O geral.php quer só o miolo do content, o resto do markup quem monta é o
// template do site. Isto normaliza os dois formatos, então é idempotente: valor
// já limpo passa direto, tag inteira vira valor.
function extractSiteVerificationToken(raw) {
  const texto = String(raw || '').trim();
  if (!texto) return '';

  const comContent = texto.match(/content\s*=\s*(["'])([\s\S]*?)\1/i);
  if (comContent) return comContent[2].trim();

  // Parece markup mas não tem content=: não dá pra adivinhar qual pedaço é o
  // token, e gravar HTML dentro de uma string PHP é pior que não gravar nada.
  if (texto.startsWith('<')) return '';

  return texto;
}

// Variáveis do geral.php que a ferramenta sabe preencher.
// Ordem igual à do arquivo, só para o relatório do commit sair na ordem em que
// a pessoa lê. $idProjetoBusca é o painel do cliente (ADR-034), vem da tela,
// não do Google, e por isso é o único que não nasce de uma API.
const GERAL_VARS = ['idProjetoBusca', 'idAnalytics', 'tagmanager', 'googleSearchConsole', 'siteKey', 'secretKey'];

const GERAL_CANDIDATE_PATHS = [
  'geral.php',
  'inc/geral.php',
  'includes/geral.php',
  'include/geral.php',
  '_inc/geral.php',
  'app/geral.php',
  'config/geral.php',
  'public_html/geral.php',
];

function escapePhpString(value, quote) {
  return String(value).replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote);
}

// Reescreve o geral.php preenchendo só as variáveis que receberam valor.
function applyGeralValues(content, values) {
  let out = content;
  const applied = [];
  const missing = [];
  const overwritten = [];

  for (const key of GERAL_VARS) {
    // Vale para qualquer origem, inclusive um valor colado à mão numa tela
    // futura. O geral.php nunca recebe markup.
    const value = key === 'googleSearchConsole'
      ? extractSiteVerificationToken(values[key])
      : values[key];
    if (!value) continue;

    const re = new RegExp(`(\\$${key}\\s*=\\s*)(['"])([^'"\\r\\n]*)\\2(\\s*;)`);
    const match = out.match(re);
    if (!match) {
      missing.push(key);
      continue;
    }
    if (match[3] && match[3] !== value) overwritten.push({ key, previous: match[3] });

    out = out.replace(re, (full, prefix, quote, old, suffix) =>
      `${prefix}${quote}${escapePhpString(value, quote)}${quote}${suffix}`
    );
    applied.push(key);
  }

  return { content: out, applied, missing, overwritten, changed: out !== content };
}

// Descobre em qual workspace mora o repositório (o slug é sempre o domínio).
async function resolveRepo({ repo, workspace, creds }) {
  if (workspace) {
    const res = await httpRaw('GET', `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}`, creds, {
      accept: 'application/json',
    });
    if (res.status === 200) {
      const body = parseMaybeJson(res.text) || {};
      return { workspace, repo, mainBranch: body.mainbranch?.name || 'master' };
    }
    if (res.status !== 404) throw new Error(`Falha ao consultar ${workspace}/${repo}: ${bitbucketError(res)}`);
  }

  // Sem workspace configurada, procura em cada uma de que você é membro.
  //
  // O caminho antigo era GET /2.0/repositories?role=member&q=slug="...", uma
  // busca global. O Bitbucket descontinuou isso (CHANGE-2770) e passou a
  // responder "Functionality has been deprecated". Agora toda consulta a
  // repositório exige a workspace no caminho, então a listagem vem primeiro.
  const workspaces = await listBitbucketWorkspaces(creds);
  if (!workspaces.length) {
    throw new Error(
      'Não consegui listar suas workspaces do Bitbucket. Preencha "Workspace do Bitbucket" nas configurações ' +
        'e o app vai direto no repositório, sem precisar procurar.'
    );
  }

  // 403 e 404 dizem coisas diferentes: "existe e você não pode ver" contra
  // "não existe". Tratar os dois como "não é aqui" fazia falta de permissão
  // sair como "nenhum repositório com esse slug", culpando o domínio.
  const semPermissao = [];

  for (const ws of workspaces) {
    const res = await httpRaw('GET', `https://api.bitbucket.org/2.0/repositories/${ws}/${repo}`, creds, {
      accept: 'application/json',
    });
    if (res.status === 200) {
      const body = parseMaybeJson(res.text) || {};
      return { workspace: ws, repo, mainBranch: body.mainbranch?.name || 'master', descoberta: ws };
    }
    if (res.status === 401 || res.status === 403) {
      semPermissao.push(ws);
      continue;
    }
    if (res.status !== 404) {
      throw new Error(`Falha ao consultar ${ws}/${repo}: ${bitbucketError(res)}`);
    }
  }

  if (semPermissao.length) {
    throw new Error(
      `O Bitbucket recusou a consulta de "${repo}" em ${semPermissao.join(', ')} com 403, ` +
        'não é que o repositório não exista, é que a credencial não pode lê-lo.' +
        BITBUCKET_SCOPE_HINT
    );
  }

  throw new Error(
    `Nenhum repositório com o slug "${repo}" nas suas workspaces (${workspaces.join(', ')}). ` +
      'Confira o domínio, ou preencha "Workspace do Bitbucket" nas configurações se o repositório estiver em outra.'
  );
}

// Duas rotas para a mesma pergunta: "de que workspaces esta credencial é
// membro?". A primeira é a direta; a segunda é a de associação do usuário, que
// responde em conta onde a primeira não responde. Cada uma devolve o slug em
// lugar diferente do JSON, por isso o extrator vem junto.
const WORKSPACE_ENDPOINTS = [
  {
    url: 'https://api.bitbucket.org/2.0/workspaces?pagelen=100&fields=values.slug,next',
    slug: (v) => v.slug,
  },
  {
    url: 'https://api.bitbucket.org/2.0/user/permissions/workspaces?pagelen=100&fields=values.workspace.slug,next',
    slug: (v) => v.workspace?.slug,
  },
];

// Paginado porque quem tem várias contas de cliente passa fácil da primeira
// página.
async function listBitbucketWorkspaces(creds) {
  const falhas = [];

  for (const endpoint of WORKSPACE_ENDPOINTS) {
    const nomes = [];
    let url = endpoint.url;
    let quebrou = null;

    for (let pagina = 0; pagina < 5 && url; pagina++) {
      const res = await httpRaw('GET', url, creds, { accept: 'application/json' });
      if (res.status !== 200) {
        quebrou = `${new URL(url).pathname} → ${bitbucketError(res)}`;
        break;
      }
      const body = parseMaybeJson(res.text) || {};
      for (const v of body.values || []) {
        const slug = endpoint.slug(v);
        if (slug) nomes.push(slug);
      }
      url = body.next || null;
    }

    if (!quebrou && nomes.length) return nomes;
    if (quebrou) falhas.push(quebrou);
  }

  // O Bitbucket devolve 404 "Resource not found" tanto para o que não existe
  // quanto para o que a credencial não pode ver, então esta falha quase sempre
  // é escopo, não endpoint errado. E ela é evitável: com a workspace preenchida
  // nas configurações, este passo nem acontece.
  throw new Error(
    'Não consegui descobrir suas workspaces do Bitbucket' +
      (falhas.length ? ` (${falhas.join('; ')})` : '') +
      '. O caminho curto é preencher "Workspace do Bitbucket" nas configurações, com ela, o app vai ' +
      'direto no repositório e não precisa listar nada. Se preferir resolver na origem, falta o escopo ' +
      'read:workspace:bitbucket no token (o Bitbucket responde 404, não 403, para o que a credencial ' +
      'não pode ver).'
  );
}

// Procura o geral.php: primeiro nos caminhos usuais, depois listando o repositório.
async function findGeralFile({ workspace, repo, branch, creds, explicitPath }) {
  const base = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${encodeURIComponent(branch)}`;

  const candidates = explicitPath ? [explicitPath] : GERAL_CANDIDATE_PATHS;
  for (const candidate of candidates) {
    const res = await httpRaw('GET', `${base}/${candidate}`, creds);
    if (res.status === 200) return { path: candidate, content: res.text };
    if (res.status !== 404) throw new Error(`Falha ao ler ${candidate}: ${bitbucketError(res)}`);
  }
  if (explicitPath) return null;

  // Fallback: varre o repositório até 4 níveis atrás de qualquer geral.php.
  let url = `${base}/?max_depth=4&pagelen=100&fields=values.path,values.type,next`;
  for (let page = 0; page < 5 && url; page++) {
    const res = await httpRaw('GET', url, creds, { accept: 'application/json' });
    if (res.status !== 200) break;
    const body = parseMaybeJson(res.text) || {};
    const hit = (body.values || []).find(
      (v) => v.type === 'commit_file' && (v.path === 'geral.php' || v.path.endsWith('/geral.php'))
    );
    if (hit) {
      const fileRes = await httpRaw('GET', `${base}/${hit.path}`, creds);
      if (fileRes.status === 200) return { path: hit.path, content: fileRes.text };
    }
    url = body.next || null;
  }

  return null;
}

ipcMain.handle('bitbucket:commitGeral', async (event, payload) => {
  const { repo, workspace, values, creds, filePath, branch, message, brand } = payload;
  const log = [];
  const push = (m, type = 'info') => log.push({ message: m, type });

  try {
    // A tela já não oferece o commit para marca sem Bitbucket, mas o processo
    // principal não confia na tela: sem repositório, tentar descobrir um pelo
    // nome do domínio acabaria commitando no repositório errado de outra marca.
    if (brand && !brandHasBitbucket(brand)) {
      throw new Error(`${brandName(brand)} não tem repositório no Bitbucket, não há onde commitar o geral.php.`);
    }
    if (!creds?.email || !creds?.token) {
      throw new Error('Credenciais do Bitbucket não configuradas.');
    }
    if (!repo) throw new Error('Domínio (slug do repositório) não informado.');

    push(`GET repositório → ${repo}`, 'cmd');
    const target = await resolveRepo({ repo, workspace, creds });
    const targetBranch = branch || target.mainBranch;
    push(`Repositório: ${target.workspace}/${target.repo} (branch ${targetBranch})`, 'info');
    if (target.descoberta) {
      push(
        `Workspace descoberta procurando: "${target.descoberta}". Preencha isso em "Workspace do Bitbucket" ` +
          'nas configurações para o app ir direto da próxima vez.',
        'info'
      );
    }

    push(`GET geral.php em ${target.workspace}/${target.repo}`, 'cmd');
    const file = await findGeralFile({
      workspace: target.workspace,
      repo: target.repo,
      branch: targetBranch,
      creds,
      explicitPath: filePath,
    });
    if (!file) {
      throw new Error(`Não encontrei o geral.php em ${target.workspace}/${target.repo} (branch ${targetBranch}).`);
    }
    push(`Arquivo encontrado: ${file.path}`, 'info');

    const result = applyGeralValues(file.content, values || {});
    for (const key of result.missing) {
      push(`Variável $${key} não existe no geral.php, pulei essa.`, 'warn');
    }
    for (const item of result.overwritten) {
      push(`$${item.key} já tinha o valor "${item.previous}" e foi substituída.`, 'warn');
    }

    if (!result.changed) {
      // Duas situações muito diferentes davam a mesma frase: "já estava igual"
      // e "não achei nenhuma das variáveis". A segunda não é nada a commitar,
      // é arquivo em formato inesperado.
      push(
        result.applied.length || !result.missing.length
          ? 'O geral.php já estava com esses valores, nada a commitar.'
          : `Nenhuma das variáveis (${result.missing.map((k) => '$' + k).join(', ')}) apareceu no ` +
              `${file.path} no formato \`$nome = 'valor';\`, não commitei nada. Confira o arquivo.`,
        'warn'
      );
      return { ok: true, skipped: true, log, path: file.path, workspace: target.workspace, repo: target.repo, branch: targetBranch };
    }

    const { body, contentType } = buildMultipart({
      [file.path]: result.content,
      message: message || 'Ajustes para publicação',
      branch: targetBranch,
    });

    push(`POST commit → ${target.workspace}/${target.repo} (${file.path})`, 'cmd');
    const commitRes = await httpRaw(
      'POST',
      `https://api.bitbucket.org/2.0/repositories/${target.workspace}/${target.repo}/src`,
      creds,
      { body, contentType, accept: 'application/json' }
    );

    if (commitRes.status < 200 || commitRes.status >= 300) {
      // Chegamos aqui tendo LIDO o arquivo, então leitura e slug estão certos.
      // Sobram duas causas, e elas se resolvem em lugares diferentes.
      if (commitRes.status === 401 || commitRes.status === 403) {
        push(
          `Ler o ${file.path} funcionou e gravar não. Só duas coisas explicam isso: ` +
            'o token não tem write:repository:bitbucket, ou a branch ' +
            `"${targetBranch}" tem restrição que exige pull request para qualquer mudança. ` +
            'Confira os escopos em id.atlassian.com/manage-profile/security/api-tokens e as ' +
            'restrições em Repository settings › Branch restrictions.',
          'warn'
        );
      }
      throw new Error(`Commit recusado pelo Bitbucket: ${bitbucketError(commitRes)}`);
    }

    push(`Commit "Ajustes para publicação" enviado (${result.applied.map((k) => '$' + k).join(', ')}).`, 'success');
    return {
      ok: true,
      log,
      path: file.path,
      workspace: target.workspace,
      repo: target.repo,
      branch: targetBranch,
      applied: result.applied,
    };
  } catch (e) {
    push(`Commit automático do geral.php falhou: ${e.message}`, 'warn');
    return { ok: false, error: e.message, log };
  }
});

// ---------- Google: consulta de propriedades/containers existentes ----------

// Normaliza pra comparar nome de cliente com domínio: tira acento, pontuação e o TLD.
function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function queryTerms(rawQuery) {
  const raw = String(rawQuery || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const terms = new Set();
  const full = normalizeName(raw);
  if (full) terms.add(full);
  const base = normalizeName(raw.split('.')[0]);
  if (base) terms.add(base);
  return { raw, terms: [...terms].filter((t) => t.length >= 3) };
}

// Casa só quando o termo buscado aparece dentro do nome do candidato.
// Nada de casamento invertido ("ABC" casando com a busca "clienteabc"):
// a busca tem que mostrar o que foi pesquisado, e mais nada.
function matchesQuery(candidateNames, terms) {
  const normalized = candidateNames.filter(Boolean).map(normalizeName);
  return terms.some((term) => normalized.some((name) => name && name.includes(term)));
}

// Roda `fn` sobre os itens com no máximo `limit` chamadas em voo. A varredura
// de data streams é 1 request por propriedade, em série levaria minutos.
// `parar()` verdadeiro faz os trabalhadores não pegarem mais itens (o que já
// está em voo termina): é a saída antecipada de quem procura UM cliente.
async function mapLimit(items, limit, fn, parar = () => false) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      if (parar()) return;
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// Varredura de data streams (ADR-131). Antes: teto de 600 propriedades e
// parava em silêncio — com 4844 no escopo, um cliente na "Busca Cliente 18"
// nunca era achado. Agora:
//   - cache em disco do domínio de cada data stream (uma leitura por
//     propriedade, uma vez; propriedade já lida não gasta API de novo);
//   - as não lidas são varridas em ordem INVERSA (as contas mais novas, de
//     número maior, recebem os clientes novos) e a busca PARA no primeiro
//     casamento — quem procura um domínio quer um cliente;
//   - o teto sobe para o escopo inteiro, com aviso claro quando não achou.
const ANALYTICS_SCAN_LIMIT = 6000;
const ANALYTICS_SCAN_CONCURRENCY = 8;
const analyticsStreamsCachePath = () => path.join(app.getPath('userData'), 'analytics-streams-cache.json');
function readAnalyticsStreamsCache() {
  try { return JSON.parse(fs.readFileSync(analyticsStreamsCachePath(), 'utf-8')) || {}; } catch (e) { return {}; }
}
function saveAnalyticsStreamsCache(cache) {
  try { fs.writeFileSync(analyticsStreamsCachePath(), JSON.stringify(cache)); } catch (e) { /* cache é conveniência */ }
}
const ANALYTICS_CACHE_VALIDO_MS = 30 * 24 * 60 * 60 * 1000; // relê o que tem mais de 30 dias

// A varredura de data streams, compartilhada pela busca (findExisting) e pela
// conferência antes de criar propriedade (ADR-046). `casa(item, web)` decide o
// casamento; `web` é [{ measurementId, uri, displayName }] por propriedade.
// Devolve { achadas: [{...item, measurementIds: web}], lidas, doCache, erros, teto }.
async function varrerDataStreams(analyticsadmin, candidatas, casa, push, { pararAoAchar = true } = {}) {
  const cache = readAnalyticsStreamsCache();
  const achadas = [];
  const naoLidas = [];
  let doCache = 0;
  for (const item of candidatas) {
    const c = cache[item.property];
    if (c && Array.isArray(c.web) && Date.now() - (c.at || 0) < ANALYTICS_CACHE_VALIDO_MS) {
      doCache++;
      if (casa(item, c.web)) achadas.push({ ...item, measurementIds: c.web });
    } else {
      naoLidas.push(item);
    }
  }
  if (doCache) push(`${doCache} propriedade(s) conferidas pelo cache local (sem chamada à API)${achadas.length ? `: ${achadas.length} casa(m)` : ''}.`, 'info');

  // Só vai à API se o cache não achou. Ordem inversa: as contas mais novas (de
  // número maior) recebem os clientes novos, então o que se procura costuma
  // estar no fim. E para no primeiro casamento.
  let aVarrer = achadas.length ? [] : naoLidas.slice().reverse();
  let teto = false;
  if (aVarrer.length > ANALYTICS_SCAN_LIMIT) { teto = true; aVarrer = aVarrer.slice(0, ANALYTICS_SCAN_LIMIT); }
  if (aVarrer.length) push(`${candidatas.length} propriedade(s) no escopo, ${naoLidas.length} sem cache: lendo o domínio de cada data stream, das contas mais novas para as mais antigas${pararAoAchar ? ', e paro ao achar' : ''}`, 'cmd');

  let erros = 0, lidas = 0, achou = false, novas = 0;
  await mapLimit(aVarrer, ANALYTICS_SCAN_CONCURRENCY, async (item) => {
    let streams = [];
    try {
      const res = await analyticsadmin.properties.dataStreams.list({ parent: item.property });
      streams = res.data.dataStreams || [];
    } catch (e) { erros++; return; } // sem permissão não derruba a varredura
    lidas++;
    const web = streams.filter((s) => s.webStreamData?.measurementId).map((s) => ({
      measurementId: s.webStreamData.measurementId, uri: s.webStreamData.defaultUri || '', displayName: s.displayName || '',
    }));
    cache[item.property] = { web, account: item.account, displayName: item.displayName, at: Date.now() };
    novas++;
    if (novas % 200 === 0) saveAnalyticsStreamsCache(cache); // não perde o índice se cair no meio
    if (!casa(item, web)) return;
    achadas.push({ ...item, measurementIds: web });
    if (pararAoAchar) achou = true;
  }, () => achou);
  if (novas) saveAnalyticsStreamsCache(cache);

  if (lidas) push(`${lidas} propriedade(s) lidas na API nesta busca${achou ? ' (parei ao achar)' : ''}; ficam no cache para as próximas.`, 'info');
  if (erros) push(`${erros} propriedade(s) não puderam ser lidas (sem permissão) e ficaram de fora.`, 'warn');
  if (teto && !achadas.length) push(`Varri ${ANALYTICS_SCAN_LIMIT} propriedades sem achar e parei no teto.`, 'warn');
  return { achadas, lidas, doCache, erros, teto };
}

// O domínio (sem www) de um uri de data stream, como o dominioDoStream faz.
function dominioDeUri(uri) {
  if (!uri) return '';
  try { return new URL(String(uri).includes('://') ? uri : `https://${uri}`).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
}

ipcMain.handle('google:findExisting', async (event, { query, saPath, brand }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });

  try {
    if (!saPath || !fs.existsSync(saPath)) {
      return { ok: false, error: 'Arquivo da service account não encontrado. Configure o caminho nas configurações.', log };
    }
    if (!query || !query.trim()) {
      return { ok: false, error: 'Informe um domínio ou nome de cliente para buscar.', log };
    }

    // Buscar usa o escopo frouxo, não a regra de criação, ver ADR-016.
    const dentroDoEscopo = searchScopeFilter(brand);
    let identidadeBusca = 'a service account';
    try {
      const email = JSON.parse(fs.readFileSync(saPath, 'utf-8')).client_email;
      if (email) identidadeBusca = `a service account ${email}`;
    } catch (e) {
      // sem o e-mail o diagnóstico ainda funciona, só fica menos específico
    }

    await buildGoogleAuthClient(saPath);
    const { raw, terms } = queryTerms(query);
    if (!terms.length) {
      return { ok: false, error: 'Termo de busca curto demais.', log };
    }
    push(`Projeto: ${brandName(brand)}, buscando em ${searchScopeName(brand)}`, 'info');

    const analyticsProperties = [];
    const gtmContainers = [];

    // 1. Google Analytics.
    //
    // As propriedades são slots genéricos e permanentes ("Busca Cliente 01",
    // "Busca Cliente 02"...): o nome nunca vira o domínio do cliente. Quem
    // carrega o domínio é o defaultUri do data stream, e ele só sai numa
    // chamada por propriedade. Então: lista tudo pelo accountSummaries (barato)
    // e varre os data streams em paralelo (caro, mas é o único jeito).
    try {
      const analyticsadmin = google.analyticsadmin('v1beta');
      push(`GET contas do Analytics (filtrando por "${raw}")`, 'cmd');

      const candidatas = [];
      const todasAsContas = [];
      let pageToken;
      let accountsSeen = 0;
      do {
        const res = await analyticsadmin.accountSummaries.list({ pageSize: 200, pageToken });
        for (const account of res.data.accountSummaries || []) {
          todasAsContas.push(account.displayName);
          if (!dentroDoEscopo(account.displayName)) continue;
          accountsSeen++;
          for (const property of account.propertySummaries || []) {
            candidatas.push({
              account: account.displayName,
              property: property.property,
              displayName: property.displayName,
            });
          }
        }
        pageToken = res.data.nextPageToken;
      } while (pageToken);

      if (!accountsSeen) {
        push(`Nenhuma conta do Analytics casou com o escopo de busca (${searchScopeName(brand)}).`, 'warn');
        push(describeVisibleAccounts(todasAsContas, identidadeBusca), 'warn');
      }

      // Casa pelo nome da propriedade OU pelo domínio configurado no stream.
      // Na prática o segundo é que resolve, o primeiro só serve pros casos
      // antigos, em que alguém nomeou a propriedade com o domínio.
      const casa = (item, web) => matchesQuery([item.displayName, ...web.map((w) => w.uri), ...web.map((w) => w.displayName)], terms);

      push(`${accountsSeen} conta(s) no escopo.`, 'info');
      const v = await varrerDataStreams(analyticsadmin, candidatas, casa, push);
      analyticsProperties.push(...v.achadas);
      if (v.teto && !v.achadas.length) push('Refine a busca ou escolha o projeto certo.', 'warn');
      push(`${analyticsProperties.length} propriedade(s) correspondem à busca.`, 'info');
    } catch (e) {
      push(`Não consegui consultar o Analytics: ${e.message}`, 'warn');
    }

    // 2. Tag Manager, mesmo escopo de busca. Antes esta varredura usava o
    // filtro de criação, que escondia container antigo.
    try {
      const tagmanager = google.tagmanager('v2');
      push(`GET containers do Tag Manager (filtrando por "${raw}")`, 'cmd');
      const noEscopoGtm = searchScopeFilter(brand, 'gtm');
      const accountsRes = await tagmanager.accounts.list();
      const todasGtm = (accountsRes.data.account || []).map((a) => a.name);
      let scanned = 0;
      let contasVistas = 0;
      for (const account of accountsRes.data.account || []) {
        if (!noEscopoGtm(account.name)) continue;
        contasVistas++;
        const containersRes = await tagmanager.accounts.containers.list({ parent: account.path });
        for (const container of containersRes.data.container || []) {
          scanned++;
          const domains = container.domainName || [];
          if (!matchesQuery([container.name, ...domains], terms)) continue;
          gtmContainers.push({
            account: account.name,
            name: container.name,
            publicId: container.publicId,
            path: container.path,
            domains,
          });
        }
      }
      if (!contasVistas) {
        push(`Nenhuma conta do Tag Manager casou com o escopo de busca (${searchScopeName(brand)}).`, 'warn');
        push(describeVisibleAccounts(todasGtm, identidadeBusca), 'warn');
      }
      push(`${contasVistas} conta(s) no escopo, ${scanned} containers varridos, ${gtmContainers.length} correspondem à busca.`, 'info');
    } catch (e) {
      push(`Não consegui consultar o Tag Manager: ${e.message}`, 'warn');
    }

    if (!analyticsProperties.length && !gtmContainers.length) {
      push(`Nada encontrado para "${raw}" em ${searchScopeName(brand)}. Tente um pedaço do nome do cliente, ou confira se o projeto escolhido é o certo.`, 'warn');
    }

    return { ok: true, log, query: raw, analytics: analyticsProperties, gtm: gtmContainers };
  } catch (e) {
    push(`Erro na busca: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// ---------- Microsoft 365: enviar e-mail pela caixa do usuário ----------
//
// Envio real pelo Microsoft Graph (/me/sendMail), não um mailto. O app é um
// "cliente público" registrado no Azure AD: sem client secret, autorização por
// código + PKCE, retorno em loopback, o mesmo desenho do login do Google, e
// pela mesma razão (não há onde guardar segredo num app que roda na máquina do
// usuário).
//
// O token vai criptografado pelo safeStorage, não em JSON puro. Mail.Send
// permite enviar e-mail EM SEU NOME: é a credencial mais perigosa do app, e
// merece o tratamento que o token do Bitbucket já tinha (ADR-004).

class MsReauthNeeded extends Error {
  constructor(message) {
    super(message);
    this.name = 'MsReauthNeeded';
    this.reauth = true;
  }
}

const msConfigPath = () => path.join(app.getPath('userData'), 'ms-config.json');
const msTokenPath = () => path.join(app.getPath('userData'), 'ms-token.enc');

const MS_HOSTS = ['login.microsoftonline.com', 'graph.microsoft.com'];
// Files.ReadWrite entrou para a planilha de publicações (ADR-062). Quem
// conectou antes dessa versão tem um token sem esse escopo: a chamada ao Graph
// devolve 403 e o app pede para reconectar, dizendo o motivo.
const MS_SCOPES = 'openid profile offline_access User.Read Mail.Send Files.ReadWrite';

// HTTPS restrito à Microsoft. Cliente separado do httpRaw do Bitbucket de
// propósito: cada um só sabe falar com o seu host, então um bug num não vaza
// credencial pro outro.
function msRequest(method, url, { headers = {}, body, form } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (!MS_HOSTS.includes(u.hostname)) {
      reject(new Error(`Host inesperado na requisição Microsoft: ${u.hostname}`));
      return;
    }

    let payload = null;
    const h = { Accept: 'application/json', ...headers };
    if (form) {
      payload = new URLSearchParams(form).toString();
      h['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      h['Content-Type'] = 'application/json';
    }
    if (payload !== null) h['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers: h },
      (res) => {
        let chunks = '';
        res.setEncoding('utf-8');
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = chunks ? JSON.parse(chunks) : {}; } catch (e) { parsed = { raw: chunks }; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function msError(res) {
  const b = res.body || {};
  return (
    b.error_description ||
    b.error?.message ||
    (typeof b.error === 'string' ? b.error : '') ||
    `HTTP ${res.status}`
  );
}

function readMsConfig() {
  try {
    if (!fs.existsSync(msConfigPath())) return {};
    return JSON.parse(fs.readFileSync(msConfigPath(), 'utf-8'));
  } catch (e) {
    return {};
  }
}

function readMsToken() {
  try {
    if (!fs.existsSync(msTokenPath())) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(msTokenPath())));
  } catch (e) {
    return null;
  }
}

function saveMsToken(tokens, extra = {}) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Criptografia do sistema indisponível, não vou gravar um token de envio de e-mail em texto puro.');
  }
  const anterior = readMsToken() || {};
  const merged = {
    ...anterior,
    ...tokens,
    ...extra,
    // expires_in vem em segundos a partir de agora; guardamos o instante.
    expiresAt: tokens.expires_in ? Date.now() + (tokens.expires_in - 60) * 1000 : anterior.expiresAt,
  };
  if (!merged.refresh_token && anterior.refresh_token) merged.refresh_token = anterior.refresh_token;
  fs.writeFileSync(msTokenPath(), safeStorage.encryptString(JSON.stringify(merged)));
  return merged;
}

function clearMsToken() {
  try {
    if (fs.existsSync(msTokenPath())) fs.unlinkSync(msTokenPath());
  } catch (e) {
    // segue: o status ainda vai reportar desconectado
  }
}

function msAuthority(tenant) {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant || 'common')}`;
}

// Devolve um access token válido, renovando pelo refresh quando preciso.
async function msAccessToken() {
  const cfg = readMsConfig();
  if (!cfg.clientId) throw new MsReauthNeeded('Configure o Client ID do Azure nas configurações.');

  const token = readMsToken();
  if (!token?.access_token) throw new MsReauthNeeded('Conecte sua conta Microsoft primeiro.');

  if (token.expiresAt && token.expiresAt > Date.now()) return token.access_token;

  if (!token.refresh_token) {
    clearMsToken();
    throw new MsReauthNeeded('Sua sessão da Microsoft expirou. Conecte de novo.');
  }

  const res = await msRequest('POST', `${msAuthority(cfg.tenant)}/oauth2/v2.0/token`, {
    form: {
      client_id: cfg.clientId,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      scope: MS_SCOPES,
    },
  });
  if (res.status !== 200) {
    clearMsToken();
    const detalhe = msError(res);
    // 65001 é consentimento, não credencial vencida: o app está pedindo um
    // escopo que a conta nunca aprovou. Reconectar só resolve depois de a
    // permissão existir no registro do Entra, e o caso concreto foi o
    // Files.ReadWrite, que entrou com a planilha (ADR-062). Mandar só
    // "conecte de novo" aqui é mandar a pessoa repetir o que não funciona.
    const dica = /AADSTS65001/.test(detalhe)
      ? ' Isso é consentimento, não sessão vencida: confira se Files.ReadWrite está em Permissões de API do registro "Hub" no Entra, como permissão delegada, conceda o consentimento e só então conecte de novo.'
      : ' Conecte de novo.';
    throw new MsReauthNeeded(`Não consegui renovar a sessão da Microsoft (${detalhe}).${dica}`);
  }
  return saveMsToken(res.body).access_token;
}

ipcMain.handle('ms:getConfig', () => ({ ok: true, config: readMsConfig() }));

ipcMain.handle('ms:setConfig', (event, config) => {
  try {
    fs.writeFileSync(msConfigPath(), JSON.stringify(config, null, 2));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('ms:status', () => {
  const token = readMsToken();
  const conectado = !!token?.refresh_token || (!!token?.access_token && token.expiresAt > Date.now());
  return { ok: true, connected: conectado, email: token?.email || null };
});

ipcMain.handle('ms:logout', () => {
  clearMsToken();
  return { ok: true };
});

let pendingMsLogin = null;

ipcMain.handle('ms:cancelLogin', () => {
  if (pendingMsLogin) pendingMsLogin.cancel('Login da Microsoft cancelado.');
  return { ok: true };
});

ipcMain.handle('ms:login', async (event) => {
  const { shell } = require('electron');
  const http = require('http');

  const cfg = readMsConfig();
  if (!cfg.clientId) {
    return { ok: false, error: 'Configure o Client ID do Azure nas configurações antes de conectar.' };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'Criptografia do sistema indisponível, não vou guardar um token de envio de e-mail sem ela.' };
  }

  if (pendingMsLogin) pendingMsLogin.cancel('Login anterior descartado, comecei outro.');

  // PKCE: cliente público não tem segredo, então o que amarra o código ao
  // pedido original é o verifier.
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const estado = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve) => {
    let redirectUri = null;
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      pendingMsLogin = null;
      try { server.close(); } catch (_) {}
      resolve(result);
    }

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, redirectUri);
        const erro = reqUrl.searchParams.get('error');
        const code = reqUrl.searchParams.get('code');

        if (erro) {
          const desc = reqUrl.searchParams.get('error_description') || erro;
          res.end('Login cancelado. Pode fechar esta aba.');
          finish({ ok: false, error: `Login recusado: ${desc}` });
          return;
        }
        if (!code) {
          res.end('Nenhum código recebido.');
          return;
        }
        // O state protege contra um código injetado por outra aba.
        if (reqUrl.searchParams.get('state') !== estado) {
          res.end('Retorno inesperado.');
          finish({ ok: false, error: 'O retorno do login não bateu com o pedido (state diferente). Tente de novo.' });
          return;
        }

        res.end('Login concluído! Pode fechar esta aba e voltar pro Hub.');

        const tokenRes = await msRequest('POST', `${msAuthority(cfg.tenant)}/oauth2/v2.0/token`, {
          form: {
            client_id: cfg.clientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: verifier,
            scope: MS_SCOPES,
          },
        });
        if (tokenRes.status !== 200) {
          finish({ ok: false, error: `Troca do código falhou: ${msError(tokenRes)}` });
          return;
        }

        let email = null;
        try {
          const me = await msRequest('GET', 'https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${tokenRes.body.access_token}` },
          });
          email = me.body?.mail || me.body?.userPrincipalName || null;
        } catch (e) {
          // segue sem o e-mail
        }

        const salvo = saveMsToken(tokenRes.body, { email });
        finish({
          ok: true,
          email,
          durable: !!salvo.refresh_token,
          warning: salvo.refresh_token
            ? null
            : 'A Microsoft não devolveu refresh token, a sessão vale só cerca de uma hora. Confira se o escopo offline_access está no registro do app.',
        });
      } catch (e) {
        try { res.end('Erro no login: ' + e.message); } catch (_) {}
        finish({ ok: false, error: e.message });
      }
    });

    pendingMsLogin = { cancel: (motivo) => finish({ ok: false, error: motivo, canceled: true }) };
    server.on('error', (e) => finish({ ok: false, error: `Não consegui abrir a porta local: ${e.message}` }));

    server.listen(0, '127.0.0.1', () => {
      // O Azure aceita loopback com porta arbitrária, desde que o redirect
      // cadastrado seja http://localhost (plataforma "Aplicativos móveis e
      // computador"). Usar 'localhost' e não '127.0.0.1' porque é assim que
      // ele exige o cadastro.
      redirectUri = `http://localhost:${server.address().port}`;
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: MS_SCOPES,
        state: estado,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      const authUrl = `${msAuthority(cfg.tenant)}/oauth2/v2.0/authorize?${params}`;
      if (!event.sender.isDestroyed()) event.sender.send('ms:url', authUrl);
      shell.openExternal(authUrl);
    });
  });
});

// ---------- Salesforce (ADR-086) ----------
//
// A organização não libera criar aplicativo conectado, e autenticação por
// cookie de sessão está desligada na API deles: testamos de dentro de uma
// página logada e voltou 401. O que funciona é o aplicativo conectado que a
// própria Salesforce distribui com a ferramenta de linha de comando, que já
// existe em toda organização e não precisa de ninguém no Setup. Fluxo padrão:
// código de autorização com PKCE e retorno em loopback, o mesmo desenho do
// login do Google e do Microsoft aqui do lado.
//
// Consequência honesta: o histórico de login do Salesforce registra
// "Salesforce CLI" como o aplicativo, não "Hub". Está dito no README.
//
// O token vai criptografado pelo safeStorage. Ele age EM SEU NOME no CRM da
// empresa: mesmo cuidado do token de e-mail (ADR-004).

const { criarSalesforce, idDoLink, ehIdDeCaso, escaparSoql, normalizarTexto, acharCasoDaPublicacao, acharContaPorDominio, acharCampoPorRotulo, avaliarOuvidoria, avaliarContratos, linkDaConta, mascararSegredos, SalesforceErro } =
  require(path.join(__dirname, 'lib', 'salesforce'));

const SF_CLIENT_ID = 'PlatformCLI';
// A porta e o caminho não são escolha nossa: é o retorno que o aplicativo da
// Salesforce aceita. Porta ocupada (a ferramenta deles rodando junto) é erro
// claro, não um retorno que se perde.
const SF_PORTA = 1717;
const SF_REDIRECT = `http://localhost:${SF_PORTA}/OauthRedirect`;
const SF_ESCOPOS = 'api refresh_token';

const sfConfigPath = () => path.join(app.getPath('userData'), 'salesforce-config.json');
const sfTokenPath = () => path.join(app.getPath('userData'), 'salesforce-token.enc');

const SF_PADRAO = {
  dominio: '',
  assuntoMigracao: 'Publicação V1 -> V2 - {dominio}',
  comentarioMigracao: '{dominio}',
  textoFeed: 'Site publicado',
};

// Assuntos padrão antigos que podem ter ficado gravados no config de quem já
// usou o Hub (o valor padrão vazava para o arquivo ao salvar). Se o que está
// salvo é um deles, é porque ninguém personalizou de verdade — troco pelo novo
// padrão sozinho, para o título mudar sem o Guilherme ter que mexer nas
// configurações (ADR-090).
const SF_ASSUNTOS_ANTIGOS = [
  'Publicação (troca de DNS) - {dominio}',
  'Publicação (Troca de DNS) - {dominio}',
];

class SfReauthNeeded extends Error {
  constructor(message) {
    super(message);
    this.name = 'SfReauthNeeded';
    this.reauth = true;
  }
}

function readSfConfig() {
  try {
    if (!fs.existsSync(sfConfigPath())) return { ...SF_PADRAO };
    const cfg = { ...SF_PADRAO, ...JSON.parse(fs.readFileSync(sfConfigPath(), 'utf-8')) };
    // Cura o assunto padrão antigo que ficou gravado (ADR-090).
    if (SF_ASSUNTOS_ANTIGOS.includes(String(cfg.assuntoMigracao || '').trim())) {
      cfg.assuntoMigracao = SF_PADRAO.assuntoMigracao;
    }
    return cfg;
  } catch (e) {
    return { ...SF_PADRAO };
  }
}

function readSfToken() {
  try {
    if (!fs.existsSync(sfTokenPath())) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(sfTokenPath())));
  } catch (e) {
    return null;
  }
}

function saveSfToken(tokens, extra = {}) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Criptografia do sistema indisponível, não vou gravar um token do Salesforce em texto puro.');
  }
  const anterior = readSfToken() || {};
  const merged = { ...anterior, ...tokens, ...extra };
  if (!merged.refresh_token && anterior.refresh_token) merged.refresh_token = anterior.refresh_token;
  fs.writeFileSync(sfTokenPath(), safeStorage.encryptString(JSON.stringify(merged)));
  return merged;
}

function clearSfToken() {
  try { if (fs.existsSync(sfTokenPath())) fs.unlinkSync(sfTokenPath()); } catch (e) { /* o status já reporta desconectado */ }
}

// O domínio da organização, sem esquema e sem barra. Aceita colar a URL
// inteira do Lightning, que é o que a pessoa tem na mão.
function sfDominioLimpo(bruto) {
  let d = String(bruto || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  d = d.replace(/\.lightning\.force\.com$/i, '.my.salesforce.com');
  if (d && !/\./.test(d)) d = `${d}.my.salesforce.com`;
  return d.toLowerCase();
}

function sfLoginUrl() {
  const d = sfDominioLimpo(readSfConfig().dominio);
  if (!d) throw new SfReauthNeeded('Informe o domínio do Salesforce da empresa nas configurações (ex: grupo-ideal-trends.my.salesforce.com).');
  return `https://${d}`;
}

function sfRequest(method, url, { form } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (!/(^|\.)salesforce\.com$/i.test(u.hostname) && !/(^|\.)force\.com$/i.test(u.hostname)) {
      reject(new Error(`Host inesperado numa chamada ao Salesforce: ${u.hostname}`));
      return;
    }
    const payload = form ? new URLSearchParams(form).toString() : null;
    const headers = { Accept: 'application/json' };
    if (payload !== null) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers }, (res) => {
      let txt = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { txt += c; });
      res.on('end', () => {
        let json = null;
        try { json = txt ? JSON.parse(txt) : {}; } catch (e) { json = { raw: txt.slice(0, 400) }; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('O Salesforce não respondeu em 30s.')); });
    if (payload !== null) req.write(payload);
    req.end();
  });
}

const sfErro = (res) => res.body?.error_description || res.body?.error || `HTTP ${res.status}`;

// Devolve um cliente pronto, renovando a sessão quando ela vence. O refresh
// token do Salesforce não expira por tempo, só se for revogado.
async function sfCliente() {
  const token = readSfToken();
  if (!token?.access_token) throw new SfReauthNeeded('Conecte sua conta do Salesforce nas configurações.');
  return criarSalesforce(token.instance_url, token.access_token);
}

async function sfRenovar() {
  const token = readSfToken();
  if (!token?.refresh_token) {
    clearSfToken();
    throw new SfReauthNeeded('Sua sessão do Salesforce expirou e não há como renovar. Conecte de novo.');
  }
  const res = await sfRequest('POST', `${sfLoginUrl()}/services/oauth2/token`, {
    form: { grant_type: 'refresh_token', client_id: SF_CLIENT_ID, refresh_token: token.refresh_token },
  });
  if (res.status !== 200) {
    clearSfToken();
    throw new SfReauthNeeded(`Não consegui renovar a sessão do Salesforce (${sfErro(res)}). Conecte de novo.`);
  }
  return saveSfToken(res.body);
}

// Roda a operação e, se a sessão tiver vencido, renova uma vez e repete. Uma
// só: se falhar de novo, é outra coisa, e insistir esconde o motivo.
async function sfComSessao(fn) {
  try {
    return await fn(await sfCliente());
  } catch (e) {
    if (!(e instanceof SalesforceErro) || !e.sessaoInvalida) throw e;
    await sfRenovar();
    return fn(await sfCliente());
  }
}

// Coisas que não mudam no meio de uma rodada: quem sou eu e qual Status é
// "concluída". Numa criação em massa de 76 tarefas, perguntar isso a cada
// linha seriam 150 chamadas à toa. Guardo na memória do processo e limpo ao
// desconectar (ADR-090).
let sfSessaoCache = { eu: null, statusFechado: null, statusCaso: null, camposOuvidoria: null };
function limparSfCache() { sfSessaoCache = { eu: null, statusFechado: null, statusCaso: null, camposOuvidoria: null }; }

// O status "Reunião de Nutrição" do caso pode ter outro nome por dentro (o
// valor da API): lido da configuração do Caso uma vez por sessão (ADR-097).
const SF_STATUS_CASO_PREFERIDO = 'Reunião de Nutrição';
async function sfStatusCasoPreferido(sf) {
  if (!sfSessaoCache.statusCaso) {
    let achado = null;
    try {
      const d = await sf.descrever('Case');
      const campo = (d.fields || []).find((f) => f.name === 'Status');
      const alvo = normalizarTexto(SF_STATUS_CASO_PREFERIDO);
      achado = (campo?.picklistValues || []).find((v) => normalizarTexto(v.label) === alvo || normalizarTexto(v.value) === alvo) || null;
    } catch (e) {
      if (e && (e.sessaoInvalida || e.status === 403)) throw e;
    }
    sfSessaoCache.statusCaso = achado ? { api: achado.value, rotulo: achado.label } : { api: null, rotulo: SF_STATUS_CASO_PREFERIDO };
  }
  return sfSessaoCache.statusCaso;
}
// Os nomes internos dos campos "Definição" e "Data de Conclusão" do Caso,
// descobertos pelo rótulo via describe, uma vez por sessão (ADR-111).
async function sfCamposOuvidoria(sf) {
  if (!sfSessaoCache.camposOuvidoria) {
    const d = await sf.descrever('Case');
    sfSessaoCache.camposOuvidoria = {
      campoDef: acharCampoPorRotulo(d, 'Definição'),
      campoData: acharCampoPorRotulo(d, 'Data de Conclusão'),
    };
  }
  return sfSessaoCache.camposOuvidoria;
}

// O campo do Caso que diz de qual empresa é o projeto ("Sel. Projeto" = Busca
// Cliente / MPI Solutions; "Projeto" é o lookup). Descoberto pelo rótulo, uma
// vez por sessão (ADR-123). Lookup é selecionado como Relacao__r.Name.
async function sfCampoProjetoCaso(sf) {
  if (sfSessaoCache.campoProjetoCaso === undefined) {
    const d = await sf.descrever('Case');
    const porRotulo = (rot) => (d.fields || []).find((f) => normalizarTexto(f.label) === normalizarTexto(rot)) || null;
    const f = porRotulo('Sel. Projeto') || porRotulo('Projeto') || null;
    sfSessaoCache.campoProjetoCaso = f
      ? (f.type === 'reference' && f.relationshipName
        ? { nome: f.name, selecao: `${f.relationshipName}.Name`, ler: (c) => (c[f.relationshipName] && c[f.relationshipName].Name) || '' }
        : { nome: f.name, selecao: f.name, ler: (c) => c[f.name] || '' })
      : null;
  }
  return sfSessaoCache.campoProjetoCaso;
}

// "Busca Cliente" → bc, "MPI Solutions" → mpisolutions (mesma regra das filas).
const marcaDeTexto = (s) => (/busca/i.test(String(s || '')) ? 'bc' : /mpi/i.test(String(s || '')) ? 'mpisolutions' : null);

// O token que temos foi recusado (403): só reconectar resolve (ADR-093).
function sfPrecisaReconectar(e) {
  return !!e && (e.reauth === true || (e instanceof SalesforceErro && e.status === 403));
}
async function sfQuemSouEu(sf) {
  if (!sfSessaoCache.eu) sfSessaoCache.eu = await sf.identidade();
  return sfSessaoCache.eu;
}
async function sfStatusConcluida(sf) {
  if (!sfSessaoCache.statusFechado) {
    const status = await sf.consultar('SELECT ApiName, MasterLabel, IsClosed FROM TaskStatus ORDER BY SortOrder');
    const fechado = status.find((s) => s.IsClosed);
    sfSessaoCache.statusFechado = fechado?.ApiName || fechado?.MasterLabel || 'Completed';
  }
  return sfSessaoCache.statusFechado;
}

// ---------- Log em arquivo e rodada em massa que sobrevive a um reinício (ADR-096) ----------
//
// O Windows reinicia ou encerra a sessão de madrugada (atualização, política da
// TI) e fecha tudo, o Hub junto. O log e o progresso da rodada moravam só na
// memória: sumiam, e as tarefas do Salesforce, que saem no fim, nunca saíam.
// Agora o log vai para um arquivo por dia, e o estado da rodada é salvo a cada
// site, para retomar de onde parou.

const pastaLogs = () => path.join(app.getPath('documents'), 'Hub', 'logs');
function arquivoLogDoDia(d = new Date()) {
  const n = (x) => String(x).padStart(2, '0');
  return path.join(pastaLogs(), `hub-${d.getFullYear()}-${n(d.getMonth() + 1)}-${n(d.getDate())}.txt`);
}

ipcMain.handle('log:gravar', async (event, { linhas } = {}) => {
  try {
    if (!Array.isArray(linhas) || !linhas.length) return { ok: true };
    fs.mkdirSync(pastaLogs(), { recursive: true });
    const texto = linhas
      .map((l) => `${String(l.ts || '')} ${String(l.type || 'info').padEnd(7)} ${String(l.message || '').replace(/\r?\n/g, ' ')}`)
      .join('\n') + '\n';
    await fs.promises.appendFile(arquivoLogDoDia(), texto, 'utf-8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('log:abrirPasta', async () => {
  try {
    fs.mkdirSync(pastaLogs(), { recursive: true });
    const { shell } = require('electron');
    const erro = await shell.openPath(pastaLogs());
    return erro ? { ok: false, error: erro } : { ok: true, pasta: pastaLogs() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

const rodadaPath = () => path.join(app.getPath('userData'), 'rodada-em-massa.json');

// Escrita atômica: grava num temporário e troca. Desligar no meio da gravação
// deixa o arquivo anterior inteiro, nunca um JSON pela metade.
ipcMain.handle('rodada:salvar', (event, estado) => {
  try {
    const destino = rodadaPath();
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const tmp = `${destino}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...(estado || {}), salvoEm: new Date().toISOString() }), 'utf-8');
    fs.renameSync(tmp, destino);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('rodada:ler', () => {
  try {
    if (!fs.existsSync(rodadaPath())) return { ok: true, estado: null };
    return { ok: true, estado: JSON.parse(fs.readFileSync(rodadaPath(), 'utf-8')) };
  } catch (e) {
    // Arquivo estragado não pode travar a abertura da ferramenta.
    return { ok: true, estado: null, aviso: `não consegui ler a rodada salva (${e.message})` };
  }
});

ipcMain.handle('rodada:apagar', () => {
  try {
    if (fs.existsSync(rodadaPath())) fs.unlinkSync(rodadaPath());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// A conferência dos vínculos (ADR-145) também sobrevive a fechar o Hub: a
// lista e os resultados ficam num arquivo próprio, gravados a cada cliente,
// para a segunda passada e o vínculo dos incompletos não dependerem de a
// janela ter ficado aberta. Mesma escrita atômica da rodada em massa.
const vinculosPath = () => path.join(app.getPath('userData'), 'conferir-vinculos.json');

ipcMain.handle('vinculos:salvar', (event, estado) => {
  try {
    const destino = vinculosPath();
    const tmp = `${destino}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...(estado || {}), salvoEm: new Date().toISOString() }), 'utf-8');
    fs.renameSync(tmp, destino);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('vinculos:ler', () => {
  try {
    if (!fs.existsSync(vinculosPath())) return { ok: true, estado: null };
    return { ok: true, estado: JSON.parse(fs.readFileSync(vinculosPath(), 'utf-8')) };
  } catch (e) {
    return { ok: true, estado: null, aviso: `não consegui ler a conferência salva (${e.message})` };
  }
});

ipcMain.handle('vinculos:apagar', () => {
  try {
    if (fs.existsSync(vinculosPath())) fs.unlinkSync(vinculosPath());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- Planilha do Relatório (ADR-148) ----------
//
// A planilha "Domínios e Analytics" (abas Busca e MPI, as 19 colunas do
// Relatório do painel) preenchida pelo Hub: Salesforce, o site do cliente,
// o geral.php e o Google. A rodada é da tela (lib/relatorio-rodada.js, um
// item por vez, salva em arquivo); aqui ficam as fontes (lib/relatorio-fontes.js)
// montadas com as sessões do Hub, e o estado salvo.
const relatorioPath = () => path.join(app.getPath('userData'), 'relatorio-planilha.json');

ipcMain.handle('relatorio:salvar', (event, estado) => {
  try {
    const destino = relatorioPath();
    const tmp = `${destino}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...(estado || {}), salvoEm: new Date().toISOString() }), 'utf-8');
    fs.renameSync(tmp, destino);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('relatorio:ler', () => {
  try {
    if (!fs.existsSync(relatorioPath())) return { ok: true, estado: null };
    return { ok: true, estado: JSON.parse(fs.readFileSync(relatorioPath(), 'utf-8')) };
  } catch (e) {
    return { ok: true, estado: null, aviso: `não consegui ler a rodada salva (${e.message})` };
  }
});
ipcMain.handle('relatorio:apagar', () => {
  try {
    if (fs.existsSync(relatorioPath())) fs.unlinkSync(relatorioPath());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Todas as abas de uma planilha (.ods, .xlsx, .csv): [{ aba, linhas }].
ipcMain.handle('planilha:lerAbas', async (event, { nome, base64 } = {}) => {
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.read(Buffer.from(String(base64 || ''), 'base64'), { type: 'buffer', cellDates: false });
    const abas = wb.SheetNames.map((n) => ({
      aba: n,
      linhas: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' })
        .map((l) => (Array.isArray(l) ? l.map((c) => String(c ?? '').trim()) : []))
        .filter((l) => l.some(Boolean)),
    }));
    return { ok: true, abas, nome };
  } catch (e) {
    return { ok: false, error: `Não consegui ler a planilha: ${e.message}` };
  }
});

// As fontes, montadas uma vez por rodada (os resumos do Google ficam em
// memória entre as linhas) e refeitas no "Iniciar".
let relatorioFontes = null;
function criarFontesDoHub() {
  const { criarFontes } = require(path.join(__dirname, 'lib', 'relatorio-fontes'));
  const QuandoPublicou = require(path.join(__dirname, 'lib', 'quando-publicou'));
  let gcfg = {};
  try { gcfg = JSON.parse(fs.readFileSync(googleConfigPath(), 'utf-8')) || {}; } catch (e) { gcfg = {}; }
  const oauthCfg = readOauthConfigFile();
  // O Salesforce com a sessão renovada quando vence (sfComSessao), chamada a chamada.
  const sf = {
    consultar: (...a) => sfComSessao((c) => c.consultar(...a)),
    buscar: (...a) => sfComSessao((c) => c.buscar(...a)),
    descrever: (...a) => sfComSessao((c) => c.descrever(...a)),
  };
  let saClient = null;
  const authSa = async () => {
    if (saClient) return saClient;
    if (!gcfg.saPath || !fs.existsSync(gcfg.saPath)) throw new Error('Arquivo da service account não encontrado. Configure o caminho nas configurações.');
    saClient = await buildGoogleAuthClient(gcfg.saPath);
    return saClient;
  };
  const authDoSlot = async (slot) => {
    try { return loadUserOauthClient(oauthCfg.clientId, oauthCfg.clientSecret, slot, { global: false }); } catch (e) { return null; }
  };
  const contas = gcfg.brandAccounts || gcfg.scOwners || {};
  const relatorio = contasRelatorio();
  const slots = [
    ...Object.keys(BRANDS).map((b) => ({ slot: b, email: String(contas[b] || '').toLowerCase(), analytics: false, searchConsole: true })),
    ...relatorio.map((email, i) => ({ slot: `rel-${i + 1}`, email, analytics: true, searchConsole: true, tagManager: true })),
  ].filter((s) => s.email);
  let creds = null;
  try { if (fs.existsSync(credsPath())) creds = JSON.parse(safeStorage.decryptString(fs.readFileSync(credsPath()))); } catch (e) { creds = null; }
  let workspaces = [];
  try {
    const st = fs.existsSync(hubStatePath()) ? JSON.parse(fs.readFileSync(hubStatePath(), 'utf-8')) : {};
    workspaces = [...new Set([...Object.values(st.bitbucketWorkspaces || {}), st.bitbucketWorkspace].map((w) => String(w || '').trim()).filter(Boolean))];
  } catch (e) { workspaces = []; }
  const bitbucket = creds && creds.email && creds.token && workspaces.length ? QuandoPublicou.criarBitbucket({ creds, workspaces }) : null;
  const bc = String(contas.bc || '').toLowerCase();
  const mpiplus = String(contas.mpiplus || '').toLowerCase();
  const mpisolutions = String(contas.mpisolutions || '').toLowerCase();
  return criarFontes({
    sf, google, authSa, authDoSlot, slots, bitbucket, painel: null,
    // A sessão principal (quem usa o Hub) lê os acessos das contas do GA4 em
    // que a service account não administra.
    authPrincipal: async () => { try { return loadUserOauthClient(oauthCfg.clientId, oauthCfg.clientSecret, null, { global: false }); } catch (e) { return null; } },
    cache: { ler: readAnalyticsStreamsCache, gravar: saveAnalyticsStreamsCache },
    contasConhecidas: [...Object.values(contas), ...relatorio],
    // O padrão de cada empresa quando nada prova: Analytics da Busca é o
    // bcrelatorios; o Search Console mora no login das tags (bcrelatoriotags).
    padraoMarca: { Busca: { ga: bc, gsc: mpiplus || bc }, MPI: { ga: mpisolutions, gsc: mpisolutions }, 'MPI+': { ga: mpiplus, gsc: mpiplus } },
  });
}
ipcMain.handle('relatorio:iniciar', () => {
  try {
    relatorioFontes = criarFontesDoHub();
    const relatorio = contasRelatorio();
    return { ok: true, logins: relatorio.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
const comFontes = (nome) => async (event, payload) => {
  try {
    if (!relatorioFontes) relatorioFontes = criarFontesDoHub();
    return await relatorioFontes[nome](payload || {});
  } catch (e) {
    return { ok: false, erro: e.message, log: [{ message: `${nome}: ${e.message}`, type: 'error' }] };
  }
};
ipcMain.handle('relatorio:salesforce', comFontes('salesforce'));
ipcMain.handle('relatorio:site', comFontes('site'));
ipcMain.handle('relatorio:geralPhp', comFontes('geralPhp'));
ipcMain.handle('relatorio:google', comFontes('google'));

// Durante uma rodada em massa, o Windows não pode suspender o app (ADR-094).
// Não impede a tela de bloquear, só que o sistema durma com a rodada no meio.
//
// E enquanto qualquer coisa roda sozinha (a rodada, a automação ligada, uma
// etapa da publicação), a janela não desacelera em segundo plano: com a tela
// bloqueada, o Chromium segurava os timers e a rodada parava. Parada, ela
// desacelera como qualquer página (ADR-126). Os motivos são contados à parte
// para um não soltar o outro: a automação ligada durante uma rodada em massa
// continua valendo quando a rodada termina.
let bloqueioEnergia = null;
const semDesacelerar = new Set();
ipcMain.handle('energia:manterAcordado', (event, { ligar, motivo = 'rodada' } = {}) => {
  const { powerSaveBlocker } = require('electron');
  if (motivo === 'rodada') {
    if (ligar) {
      if (bloqueioEnergia === null || !powerSaveBlocker.isStarted(bloqueioEnergia)) {
        bloqueioEnergia = powerSaveBlocker.start('prevent-app-suspension');
      }
    } else if (bloqueioEnergia !== null) {
      if (powerSaveBlocker.isStarted(bloqueioEnergia)) powerSaveBlocker.stop(bloqueioEnergia);
      bloqueioEnergia = null;
    }
  }
  if (ligar) semDesacelerar.add(String(motivo));
  else semDesacelerar.delete(String(motivo));
  try {
    if (event && event.sender && !event.sender.isDestroyed()) event.sender.setBackgroundThrottling(semDesacelerar.size === 0);
  } catch (e) {
    // a janela pode ter fechado no meio; o próximo pedido acerta
  }
  return { ok: true, ativo: bloqueioEnergia !== null, semDesacelerar: [...semDesacelerar] };
});

ipcMain.handle('salesforce:getConfig', () => {
  const cfg = readSfConfig();
  const token = readSfToken();
  return {
    ok: true,
    config: cfg,
    conectado: !!token?.access_token,
    usuario: token?.nome || null,
    email: token?.email || null,
    instancia: token?.instance_url || null,
  };
});

ipcMain.handle('salesforce:setConfig', (event, config) => {
  try {
    const atual = readSfConfig();
    const novo = { ...atual, ...(config || {}) };
    novo.dominio = sfDominioLimpo(novo.dominio);
    fs.writeFileSync(sfConfigPath(), JSON.stringify(novo, null, 2));
    return { ok: true, config: novo };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('salesforce:desconectar', () => {
  clearSfToken();
  limparSfCache();
  return { ok: true };
});

let sfLoginPendente = null;

ipcMain.handle('salesforce:conectar', async (event) => {
  const { shell } = require('electron');
  const http = require('http');
  if (sfLoginPendente) sfLoginPendente.cancel('Outro login do Salesforce foi iniciado.');

  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const estado = crypto.randomBytes(16).toString('hex');
  let loginUrl;
  try { loginUrl = sfLoginUrl(); } catch (e) { return { ok: false, error: e.message }; }

  return new Promise((resolve) => {
    let settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      sfLoginPendente = null;
      try { server.close(); } catch (_) {}
      resolve(result);
    }

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, SF_REDIRECT);
        const erro = reqUrl.searchParams.get('error');
        const code = reqUrl.searchParams.get('code');
        if (erro) {
          res.end('Login cancelado. Pode fechar esta aba.');
          finish({ ok: false, error: `Login recusado: ${reqUrl.searchParams.get('error_description') || erro}` });
          return;
        }
        if (!code) { res.end('Nenhum código recebido.'); return; }
        if (reqUrl.searchParams.get('state') !== estado) {
          res.end('Retorno inesperado.');
          finish({ ok: false, error: 'O retorno do login não bateu com o pedido (state diferente). Tente de novo.' });
          return;
        }
        res.end('Salesforce conectado! Pode fechar esta aba e voltar pro Hub.');

        const tokenRes = await sfRequest('POST', `${loginUrl}/services/oauth2/token`, {
          form: {
            grant_type: 'authorization_code',
            code,
            client_id: SF_CLIENT_ID,
            redirect_uri: SF_REDIRECT,
            code_verifier: verifier,
          },
        });
        if (tokenRes.status !== 200) {
          finish({ ok: false, error: `Troca do código falhou: ${sfErro(tokenRes)}` });
          return;
        }
        if (!tokenRes.body.refresh_token) {
          finish({ ok: false, error: 'O Salesforce não devolveu refresh token. Sem ele a sessão morre em poucas horas; confira se o escopo refresh_token foi autorizado.' });
          return;
        }

        let quem = {};
        try {
          const sf = criarSalesforce(tokenRes.body.instance_url, tokenRes.body.access_token);
          const id = await sf.identidade();
          quem = { userId: id.id, nome: id.nome, email: id.email };
        } catch (e) {
          finish({ ok: false, error: `Conectou, mas a API recusou a primeira leitura: ${e.message}` });
          return;
        }

        saveSfToken(tokenRes.body, quem);
        finish({ ok: true, ...quem, instancia: tokenRes.body.instance_url });
      } catch (e) {
        try { res.end('Erro no login: ' + e.message); } catch (_) {}
        finish({ ok: false, error: e.message });
      }
    });

    sfLoginPendente = { cancel: (motivo) => finish({ ok: false, error: motivo, canceled: true }) };
    server.on('error', (e) => {
      finish({
        ok: false,
        error: e.code === 'EADDRINUSE'
          ? `A porta ${SF_PORTA} está ocupada. O Salesforce só aceita o retorno nela, então feche o que estiver usando essa porta (a ferramenta de linha de comando do Salesforce, por exemplo) e tente de novo.`
          : `Não consegui abrir a porta local: ${e.message}`,
      });
    });

    server.listen(SF_PORTA, '127.0.0.1', () => {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: SF_CLIENT_ID,
        redirect_uri: SF_REDIRECT,
        scope: SF_ESCOPOS,
        state: estado,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'login',
      });
      const authUrl = `${loginUrl}/services/oauth2/authorize?${params}`;
      if (!event.sender.isDestroyed()) event.sender.send('salesforce:url', authUrl);
      shell.openExternal(authUrl);
    });
  });
});

// Leitura de reconhecimento: é daqui que sai o que o código NÃO vai chutar.
// Valores reais de Status, tipos de registro da Tarefa, e uma tarefa de
// exemplo com o feed dela. Tudo só leitura.
ipcMain.handle('salesforce:diagnostico', async (event, { dominioExemplo, tarefaLink } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  try {
    const resumo = await sfComSessao(async (sf) => {
      push(`GET userinfo`, 'cmd');
      const eu = await sf.identidade();
      push(`Conectado como ${eu.nome} (${eu.email}), usuário ${eu.id}.`, 'success');

      push('GET describe da Tarefa', 'cmd');
      const d = await sf.descrever('Task');
      const campo = (nome) => (d.fields || []).find((f) => f.name === nome);
      const status = campo('Status');
      const valores = (status?.picklistValues || []).map((v) => `${v.value}${v.defaultValue ? ' (padrão)' : ''}${v.active ? '' : ' [inativo]'}`);
      push(`Status aceita: ${valores.join(', ') || '(não é picklist)'}`, 'info');

      push('SOQL TaskStatus (qual valor significa concluída)', 'cmd');
      const fechados = await sf.consultar('SELECT MasterLabel, ApiName, IsClosed, IsDefault FROM TaskStatus ORDER BY SortOrder');
      const concluido = fechados.find((s) => s.IsClosed);
      push(`Concluída é "${concluido?.ApiName || concluido?.MasterLabel || '?'}" (IsClosed=true).`, concluido ? 'success' : 'warn');

      const tipos = (d.recordTypeInfos || []).filter((t) => t.available).map((t) => `${t.name}${t.defaultRecordTypeMapping ? ' (padrão)' : ''}`);
      push(`Tipos de registro da Tarefa: ${tipos.join(', ') || 'nenhum'}`, 'info');

      // Obrigatório de verdade é createable && !nillable && !defaultedOnCreate:
      // um campo com valor padrão na criação (como o "Atualização Automática")
      // o Salesforce preenche sozinho, então não trava nada (ADR-089).
      const personalizados = (d.fields || []).filter((f) => f.custom).map((f) => `${f.label} [${f.name}]${f.createable && !f.nillable && !f.defaultedOnCreate ? ' OBRIGATÓRIO' : ''}`);
      push(`Campos próprios de vocês: ${personalizados.join(', ') || 'nenhum'}`, 'info');

      push('SOQL filas de Deploy', 'cmd');
      const filas = await sf.consultar("SELECT Id, Name, DeveloperName FROM Group WHERE Type = 'Queue' AND Name LIKE '%Deploy%'");
      for (const f of filas) push(`Fila: ${f.Name} (${f.Id})`, 'info');

      // O que a criação em massa precisa saber: os campos obrigatórios de
      // verdade, com o tipo, para não descobrir na 1a de 76 que falta um.
      const obrigatorios = (d.fields || [])
        .filter((f) => f.createable && !f.nillable && !f.defaultedOnCreate && f.name !== 'Subject')
        .map((f) => {
          const lista = (f.picklistValues || []).filter((v) => v.active).map((v) => v.value);
          return `${f.label} [${f.name}] tipo ${f.type}${lista.length ? ` valores: ${lista.join(', ')}` : ''}`;
        });
      push(`Obrigatórios na criação: ${obrigatorios.join(' | ') || 'só o assunto'}`, obrigatorios.length ? 'warn' : 'info');

      // Inspeção de uma tarefa real (por link ou por domínio no assunto). É o
      // que faltava para saber ONDE comentar marcando a pessoa (ADR-089).
      let exemplo = null;
      const CAMPOS_TAREFA = 'Id, Subject, Status, IsClosed, OwnerId, Owner.Name, Owner.Type, WhatId, What.Name, What.Type, WhoId, Who.Name, CreatedById, CreatedBy.Name, CreatedDate, Description';
      const idLink = idDoLink(tarefaLink);
      if (idLink) {
        push(`GET tarefa ${idLink} (do link)`, 'cmd');
        const linha = await sf.consultar(`SELECT ${CAMPOS_TAREFA} FROM Task WHERE Id = '${escaparSoql(idLink)}' LIMIT 1`);
        exemplo = linha[0] || null;
        if (!exemplo) push('O link não é de uma Tarefa que eu consiga ler (confira se é mesmo o link da tarefa, não do caso).', 'warn');
      } else if (String(dominioExemplo || '').trim()) {
        const alvo = String(dominioExemplo).trim();
        push(`SOQL tarefa de exemplo com "${alvo}" no assunto`, 'cmd');
        const tarefas = await sf.consultar(`SELECT ${CAMPOS_TAREFA} FROM Task WHERE Subject LIKE '%${escaparSoql(alvo)}%' ORDER BY CreatedDate DESC LIMIT 1`);
        exemplo = tarefas[0] || null;
        if (!exemplo) push(`Nenhuma tarefa com "${alvo}" no assunto. Cole o link de uma tarefa real no campo do Publicar MPI+ e confira de novo.`, 'warn');
      }

      if (exemplo) {
        push(`Tarefa: ${exemplo.Subject}`, 'success');
        push(`  status ${exemplo.Status} (fechada=${exemplo.IsClosed}) | dono ${exemplo.Owner?.Name} (${exemplo.Owner?.Type}) | criada por ${exemplo.CreatedBy?.Name} [${exemplo.CreatedById}] | relativo a ${exemplo.What?.Type || '(nada)'} ${exemplo.What?.Name || ''} [${exemplo.WhatId || ''}]`, 'info');
        if (exemplo.Description) push(`  Comentários: ${mascararSegredos(exemplo.Description).slice(0, 200)}`, 'info');

        // O feed pode estar na própria Tarefa ou no Caso. Leio os dois e mostro
        // o tipo de cada item, para saber onde o "Tarefa criada" mora e comentar
        // ali, marcando o criador.
        const mostrarFeed = async (parentId, rotulo) => {
          push(`GET feed de ${rotulo} (${parentId})`, 'cmd');
          try {
            const itens = await sf.itensDeFeed(parentId, { limite: 25 });
            push(`  ${rotulo}: ${itens.length} item(ns).`, itens.length ? 'info' : 'warn');
            for (const it of itens.slice(0, 10)) {
              const texto = (it.body?.text || '').replace(/\s+/g, ' ').slice(0, 60);
              const rel = it.relatedRecordId || it.parent?.id || '';
              push(`    [${it.id}] ${it.type} | de ${it.actor?.name || '?'} | rel ${rel} | ${texto}`, 'info');
            }
          } catch (e) {
            push(`  ${rotulo}: não consegui ler (${e.message}).`, 'warn');
          }
        };
        await mostrarFeed(exemplo.Id, 'da própria tarefa');
        if (exemplo.WhatId) await mostrarFeed(exemplo.WhatId, 'do caso');
      }

      return {
        eu,
        statusValores: valores,
        statusConcluido: concluido?.ApiName || concluido?.MasterLabel || null,
        tipos,
        obrigatorios,
        personalizados,
        filas: filas.map((f) => ({ id: f.Id, nome: f.Name })),
        exemplo: exemplo ? { id: exemplo.Id, assunto: exemplo.Subject, casoId: exemplo.WhatId, criadoPorId: exemplo.CreatedById } : null,
      };
    });
    return { ok: true, log, ...resumo };
  } catch (e) {
    push(`Salesforce: ${e.message}`, 'error');
    return { ok: false, error: e.message, reauth: !!e.reauth, log };
  }
});

// Fecha uma tarefa de publicação: assume para o seu nome, marca como
// concluída e (opcional) comenta no feed marcando quem criou. Cada passo é
// ligado por uma flag para o teste rodar um de cada vez sem publicar nada e
// sem cutucar colega à toa (ADR-089). O comentário nunca marca você mesmo.
ipcMain.handle('salesforce:fecharTarefa', async (event, opcoes = {}) => {
  const { link, texto, assumir = false, concluir = false, comentar = false } = opcoes || {};
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  const id = idDoLink(link);
  if (!id) {
    push('Não consegui achar o Id da tarefa no link. Cole o link da tarefa (não o do caso).', 'error');
    return { ok: false, error: 'Link de tarefa inválido.', log };
  }
  try {
    const saida = await sfComSessao(async (sf) => {
      const eu = await sf.identidade();
      push(`Conectado como ${eu.nome} (${eu.id}).`, 'info');

      push(`GET tarefa ${id}`, 'cmd');
      const linhas = await sf.consultar(
        `SELECT Id, Subject, Status, IsClosed, OwnerId, Owner.Name, CreatedById, CreatedBy.Name, WhatId, What.Name, What.Type FROM Task WHERE Id = '${escaparSoql(id)}' LIMIT 1`
      );
      const t = linhas[0];
      if (!t) {
        push('Não li nenhuma tarefa com esse Id (confira se o link é mesmo da tarefa).', 'error');
        throw new Error('Tarefa não encontrada.');
      }
      push(`Tarefa: ${t.Subject}`, 'success');
      push(`  status ${t.Status} (fechada=${t.IsClosed}) | dono ${t.Owner?.Name} | criada por ${t.CreatedBy?.Name} [${t.CreatedById}] | relativo a ${t.What?.Type || '(nada)'} ${t.What?.Name || ''} [${t.WhatId || ''}]`, 'info');

      const resultado = { id, assunto: t.Subject, criadoPorId: t.CreatedById, criadoPor: t.CreatedBy?.Name };

      if (assumir) {
        if (t.OwnerId === eu.id) {
          push('Você já é o dono da tarefa, não precisei assumir.', 'info');
          resultado.assumido = 'já era';
        } else {
          push(`PATCH OwnerId = ${eu.id} (assumir)`, 'cmd');
          await sf.atualizar('Task', id, { OwnerId: eu.id });
          push('Tarefa está no seu nome.', 'success');
          resultado.assumido = 'sim';
        }
      }

      if (concluir) {
        push('SOQL TaskStatus (qual valor é concluída)', 'cmd');
        const status = await sf.consultar('SELECT ApiName, MasterLabel, IsClosed FROM TaskStatus ORDER BY SortOrder');
        const fechado = status.find((s) => s.IsClosed);
        const valor = fechado?.ApiName || fechado?.MasterLabel || 'Completed';
        push(`PATCH Status = "${valor}" (concluir)`, 'cmd');
        await sf.atualizar('Task', id, { Status: valor });
        push('Tarefa marcada como concluída.', 'success');
        resultado.concluido = valor;
      }

      if (comentar) {
        // A Tarefa não tem feed nesta org (POST no feed dela devolve "Task is
        // not enabled for feeds", ADR-089). O feed vivo é o do Caso: a linha
        // "Tarefa criada" desta tarefa aparece lá. Comento embaixo dela; se
        // não achar ou não deixar, posto no feed do caso. Nos dois casos marco
        // quem criou — e nunca a mim mesmo.
        const marcarId = t.CreatedById === eu.id ? null : t.CreatedById;
        if (!marcarId) push('Quem criou a tarefa é você — vou comentar sem menção.', 'warn');
        const caseId = t.WhatId;
        if (!caseId) {
          push('A tarefa não está ligada a um caso e o feed da própria tarefa está desativado — não há onde comentar marcando.', 'error');
          resultado.comentado = 'sem lugar (tarefa sem caso)';
        } else {
          push(`GET feed do caso ${caseId} (procurando a linha "Tarefa criada" desta tarefa)`, 'cmd');
          // A linha é o CreateRecordEvent cujo registro relacionado é ESTA
          // tarefa. Um caso tem vários, então caso o relatedRecordId com o Id
          // da tarefa, não pego o primeiro que aparecer.
          const daTarefa = (it) => (it.relatedRecordId || it.parent?.id) === id;
          const evento = await sf.acharNoFeed(caseId, (it) => daTarefa(it) && it.type === 'CreateRecordEvent')
            || await sf.acharNoFeed(caseId, daTarefa);
          let feito = false;
          if (evento) {
            push(`Achei a linha da tarefa [${evento.id}] (${evento.type}).`, 'info');
            push(`POST comentário embaixo dela${marcarId ? ' marcando ' + t.CreatedBy?.Name : ''}`, 'cmd');
            await sf.comentarMarcando(evento.id, marcarId, texto || 'Site publicado');
            push('Comentei embaixo da "Tarefa criada", exatamente na linha desta tarefa.', 'success');
            resultado.comentado = { onde: 'comentário na linha da tarefa', item: evento.id, pessoa: marcarId ? t.CreatedBy?.Name || marcarId : 'sem menção' };
            feito = true;
          }
          if (!feito) {
            // Sem a linha não dá para comentar "exatamente nela". Não invento um
            // post solto no caso: aviso, para o Guilherme decidir (ADR-089).
            push('Não achei a linha "Tarefa criada" desta tarefa no feed do caso (nas primeiras páginas). Não comentei para não pôr o recado no lugar errado — me avise se ela existe e eu amplio a busca.', 'error');
            resultado.comentado = 'não achei a linha da tarefa';
          }
        }
      }

      return resultado;
    });
    return { ok: true, log, ...saida };
  } catch (e) {
    if (sfPrecisaReconectar(e)) {
      limparSfCache();
      const msg = 'O Salesforce recusou o acesso (403). Reconecte o Salesforce nas configurações (Desconectar e Conectar de novo) e tente outra vez.';
      push(msg, 'error');
      return { ok: false, error: msg, precisaReconectar: true, log };
    }
    push(`Salesforce: ${e.message}`, 'error');
    return { ok: false, error: e.message, reauth: !!e.reauth, log };
  }
});

// Cria UMA tarefa de publicação, já concluída, dentro do caso apontado pelo
// link. É o que roda por linha no "Publicar em massa" para os sites já
// publicados (migração V1->V2 e afins): a tarefa nasce no caso certo, no seu
// nome, com o domínio nos comentários, e SEM marcar ninguém no feed — a
// marcação é só no fechamento pelo Publicar MPI+ (ADR-090).
ipcMain.handle('salesforce:criarTarefaNoCaso', async (event, opcoes = {}) => {
  const { casoLink, dominio, razao, assunto, comentario, apenasConferir = false } = opcoes || {};
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });

  const dom = String(dominio || '').trim();
  if (!dom) {
    push('Sem domínio para essa linha.', 'error');
    return { ok: false, error: 'Sem domínio.', linkInvalido: true, log };
  }
  // Com "Link do caso" na planilha, ele manda. Sem, o Hub procura o caso
  // sozinho pelo padrão (ADR-097).
  let casoDoLink = null;
  if (String(casoLink || '').trim()) {
    casoDoLink = idDoLink(casoLink);
    if (!casoDoLink) {
      push('Não achei o Id do caso no link. Confira a coluna "Link do caso".', 'error');
      return { ok: false, error: 'Link do caso inválido.', linkInvalido: true, log };
    }
    if (!ehIdDeCaso(casoDoLink)) {
      push(`Esse link não é de um Caso (o Id ${casoDoLink} não começa com 500). Na coluna "Link do caso" tem que ir o link do caso, não da tarefa nem da conta.`, 'error');
      return { ok: false, error: 'O link não é de um caso.', linkInvalido: true, log };
    }
  }

  try {
    const saida = await sfComSessao(async (sf) => {
      let casoId = casoDoLink;
      let como = 'pelo Link do caso da planilha';
      if (!casoId) {
        const status = await sfStatusCasoPreferido(sf);
        const achado = await acharCasoDaPublicacao(sf, { dominio: dom, razao, statusCasoApi: status.api, statusCasoRotulo: status.rotulo }, push);
        if (!achado.casoId) {
          const e = new Error(`não achei o caso: ${achado.motivo}. Preencha o "Link do caso" dessa linha na planilha.`);
          e.casoNaoEncontrado = true;
          throw e;
        }
        casoId = achado.casoId;
        como = achado.como;
      }
      const eu = await sfQuemSouEu(sf);
      const cfg = readSfConfig();
      const assuntoFinal = String(assunto || cfg.assuntoMigracao || 'Publicação V1 -> V2 - {dominio}').replace(/\{dominio\}/gi, dom);
      const comentarioFinal = String(comentario || cfg.comentarioMigracao || '{dominio}').replace(/\{dominio\}/gi, dom);

      // Confere que o caso existe e é acessível antes de criar, para a tarefa
      // não nascer órfã num Id que não abre.
      push(`GET caso ${casoId}`, 'cmd');
      const casos = await sf.consultar(`SELECT Id, CaseNumber, Subject, Status, Account.Name FROM Case WHERE Id = '${escaparSoql(casoId)}' LIMIT 1`);
      const caso = casos[0];
      if (!caso) {
        push('Não consegui ler esse caso (confira se o link é de um caso que você acessa).', 'error');
        throw new Error('Caso não encontrado.');
      }
      push(`Caso ${caso.CaseNumber}${caso.Subject ? ' — ' + caso.Subject : ''}${caso.Status ? ` (${caso.Status})` : ''}, achado ${como}.`, 'info');

      // Não cria duas vezes a mesma tarefa no mesmo caso: se já existe uma com
      // esse assunto ali, pula. Deixa o botão "todos da planilha" e a criação
      // durante a publicação conviverem sem duplicar (ADR-090).
      const jaTem = await sf.consultar(
        `SELECT Id FROM Task WHERE WhatId = '${escaparSoql(casoId)}' AND Subject = '${escaparSoql(assuntoFinal)}' LIMIT 1`
      );
      const infoCaso = { casoId, casoNumero: caso.CaseNumber, casoAssunto: caso.Subject || '', casoStatus: caso.Status || '', conta: caso.Account?.Name || '', como, assunto: assuntoFinal };
      if (apenasConferir) {
        // Só leitura: diz qual caso usaria e se a tarefa já está lá (ADR-097).
        return { ...infoCaso, conferido: true, jaExistia: !!jaTem[0] };
      }
      if (jaTem[0]) {
        push(`Já existe uma tarefa "${assuntoFinal}" nesse caso (${jaTem[0].Id}); não criei outra.`, 'warn');
        return { ...infoCaso, taskId: jaTem[0].id || jaTem[0].Id, jaExistia: true };
      }

      const statusConcluida = await sfStatusConcluida(sf);
      const hoje = new Date();
      const dataHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      push(`POST criar Task no caso ${caso.CaseNumber} (dona ${eu.nome}, status ${statusConcluida}, data ${dataHoje}, sem marcar ninguém)`, 'cmd');
      const criada = await sf.criar('Task', {
        Subject: assuntoFinal,
        WhatId: casoId,
        OwnerId: eu.id,
        Status: statusConcluida,
        Description: comentarioFinal,
        ActivityDate: dataHoje,
      });
      push(`Tarefa criada: ${criada.id} — "${assuntoFinal}"`, 'success');
      return { ...infoCaso, taskId: criada.id };
    });
    return { ok: true, log, ...saida };
  } catch (e) {
    // 403 é o Salesforce recusando o token que temos: não é sessão expirada
    // (essa é 401 e renova sozinha). Reconectar gera um token novo. Quem chama
    // para na primeira, em vez de repetir o mesmo erro linha a linha (ADR-093).
    if (e.casoNaoEncontrado) {
      push(`${dom}: ${e.message}`, 'warn');
      return { ok: false, error: e.message, casoNaoEncontrado: true, log };
    }
    if (sfPrecisaReconectar(e)) {
      limparSfCache();
      const msg = 'O Salesforce recusou o acesso (403). Reconecte o Salesforce nas configurações (Desconectar e Conectar de novo) e tente outra vez.';
      push(msg, 'error');
      return { ok: false, error: msg, precisaReconectar: true, log };
    }
    push(`Salesforce: ${e.message}`, 'error');
    return { ok: false, error: e.message, reauth: !!e.reauth, precisaReconectar: !!e.reauth, log };
  }
});

// A conta (razão social = Account.Name) de um domínio, para a automação achar
// o cliente no painel MPI+ sem ninguém digitar (ADR-122). Mesma busca por
// confiança do acharContaPorDominio; sem conta, devolve o motivo.
ipcMain.handle('salesforce:contaPorDominio', async (event, { dominio } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  const dom = normalizeDomain(dominio) || String(dominio || '').trim();
  if (!dom) return { ok: false, error: 'Sem domínio.', log };
  try {
    return await sfComSessao(async (sf) => {
      const r = await acharContaPorDominio(sf, dom, push);
      if (!r.conta) { push(`${dom}: ${r.motivo}.`, 'warn'); return { ok: true, achou: false, motivo: r.motivo, ambiguo: !!r.ambiguo, log }; }
      push(`${dom} → conta ${r.conta.Name}${r.via ? ' (por ' + r.via + ')' : ''}.`, 'info');
      return { ok: true, achou: true, razao: r.conta.Name, contaId: r.conta.Id, via: r.via || '', log };
    });
  } catch (e) {
    push(`Salesforce: ${e.message}`, 'error');
    return { ok: false, error: e.message, reauth: !!e.reauth, precisaReconectar: !!e.reauth, log };
  }
});

// O contexto de uma tarefa OU de um caso (ADR-123): tarefa → caso → conta
// (razão social) + projeto (empresa: Busca Cliente / MPI Solutions), com a fila
// da tarefa como reserva da empresa. É o caminho direto e confiável — a tarefa
// já está pendurada no caso; não precisa procurar por domínio.
ipcMain.handle('salesforce:contexto', async (event, { tarefa, caso } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  let idTarefa = idDoLink(tarefa);
  let idCaso = idDoLink(caso);
  if (idTarefa && ehIdDeCaso(idTarefa)) { idCaso = idCaso || idTarefa; idTarefa = null; } // link de caso no lugar da tarefa
  if (idCaso && !ehIdDeCaso(idCaso)) { push('O link informado como caso não é de um caso (id não começa com 500).', 'warn'); idCaso = null; }
  if (!idTarefa && !idCaso) return { ok: false, error: 'Sem link de tarefa nem de caso.', log };
  try {
    return await sfComSessao(async (sf) => {
      let filaNome = '';
      if (idTarefa) {
        push(`SOQL tarefa ${idTarefa} (caso e dono)`, 'cmd');
        const t = (await sf.consultar(`SELECT Id, Subject, WhatId, What.Type, OwnerId, Owner.Name, Owner.Type FROM Task WHERE Id = '${escaparSoql(idTarefa)}'`))[0];
        if (!t) return { ok: false, error: 'tarefa não encontrada no Salesforce', log };
        if (t.Owner && t.Owner.Type === 'Queue') filaNome = t.Owner.Name || '';
        if (!idCaso) {
          if (t.WhatId && ehIdDeCaso(t.WhatId)) idCaso = t.WhatId;
          else push('A tarefa não está ligada a um caso.', 'warn');
        }
      }
      let razao = '', contaId = null, casoNumero = '', projeto = '', empresa = null, via = '';
      if (idCaso) {
        const campo = await sfCampoProjetoCaso(sf);
        push(`SOQL caso ${idCaso} (conta${campo ? ' e ' + campo.nome : ''})`, 'cmd');
        const c = (await sf.consultar(`SELECT Id, CaseNumber, AccountId, Account.Name${campo ? ', ' + campo.selecao : ''} FROM Case WHERE Id = '${escaparSoql(idCaso)}'`))[0];
        if (!c) return { ok: false, error: 'caso não encontrado no Salesforce', log };
        casoNumero = c.CaseNumber || '';
        contaId = c.AccountId || null;
        razao = (c.Account && c.Account.Name) || '';
        projeto = campo ? String(campo.ler(c) || '') : '';
        empresa = marcaDeTexto(projeto);
        if (empresa) via = `projeto do caso (${projeto})`;
        push(`Caso ${casoNumero} → conta ${razao || '(sem conta)'}${projeto ? `, projeto ${projeto}` : ' (sem projeto no caso)'}.`, razao ? 'info' : 'warn');
      }
      if (!empresa && filaNome) { empresa = marcaDeTexto(filaNome); if (empresa) { via = `fila da tarefa (${filaNome})`; push(`Empresa pela fila da tarefa: ${filaNome}.`, 'info'); } }
      return { ok: true, razao, contaId, casoId: idCaso, casoNumero, projeto, empresa, fila: filaNome, via, log };
    });
  } catch (e) {
    push(`Salesforce: ${e.message}`, 'error');
    return { ok: false, error: e.message, reauth: !!e.reauth, precisaReconectar: !!e.reauth, log };
  }
});

// Checa a Ouvidoria de um domínio (ADR-111): acha a conta pelo domínio, lê os
// casos de Ouvidoria e devolve a Situação (Definição + data) e o Ativar SSL.
ipcMain.handle('salesforce:ouvidoria', async (event, { dominio, razao } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  const dom = String(dominio || '').trim();
  if (!dom) return { ok: false, error: 'Sem domínio.', log };
  try {
    return await sfComSessao(async (sf) => {
      const r = await acharContaPorDominio(sf, dom, push, { razao: razao || '' });
      if (!r.conta) {
        push(`${dom}: ${r.motivo}.`, 'warn');
        return { ok: true, achou: false, motivo: r.motivo, ambiguo: !!r.ambiguo, log };
      }
      push(`${dom} → conta ${r.conta.Name}${r.via ? ' (por ' + r.via + ')' : ''}.`, 'info');
      const campos = await sfCamposOuvidoria(sf);
      if (!campos.campoDef) push('Aviso: não achei o campo "Definição" no Caso; a situação pode sair vazia.', 'warn');
      const selDef = campos.campoDef ? `, ${campos.campoDef}` : '';
      const selData = campos.campoData ? `, ${campos.campoData}` : '';
      push(`SOQL casos da conta ${r.conta.Name}`, 'cmd');
      const casos = await sf.consultar(`SELECT Id, CaseNumber, RecordType.Name, RecordType.DeveloperName${selDef}${selData} FROM Case WHERE AccountId = '${escaparSoql(r.conta.Id)}' ORDER BY CreatedDate DESC LIMIT 200`);
      const av = avaliarOuvidoria(casos, campos);
      push(`${dom}: ${av.situacao} → Ativar SSL: ${av.ativarSsl}.`, av.temOuvidoria ? 'info' : 'info');
      // Os contratos da conta (a aba "Contratos", ADR-147): Ativo ou Desativado,
      // e o link da conta para a planilha.
      let contrato = { status: 'erro', rotulo: '?', ativo: false, detalhe: '', n: 0 };
      try {
        push(`SOQL contratos da conta ${r.conta.Name}`, 'cmd');
        const contratos = await sf.consultar(`SELECT Id, Status, StartDate, EndDate FROM Contract WHERE AccountId = '${escaparSoql(r.conta.Id)}' ORDER BY StartDate DESC NULLS LAST LIMIT 50`);
        contrato = avaliarContratos(contratos);
        push(`${dom}: contrato ${contrato.rotulo}${contrato.n > 1 ? ` (${contrato.n} contratos: ${contrato.detalhe})` : contrato.detalhe && contrato.n ? ` (${contrato.detalhe})` : ''}.`, contrato.ativo ? 'success' : 'warn');
      } catch (e) {
        if (e && (e.sessaoInvalida || e.status === 403)) throw e;
        contrato = { status: 'erro', rotulo: 'erro ao ler', ativo: false, detalhe: e.message, n: 0 };
        push(`${dom}: não consegui ler os contratos (${e.message}).`, 'warn');
      }
      const linkConta = linkDaConta(sf.instanceUrl, r.conta.Id);
      return { ok: true, achou: true, razao: r.conta.Name, contaId: r.conta.Id, linkConta, via: r.via || '', situacao: av.situacao, ativarSsl: av.ativarSsl, temOuvidoria: av.temOuvidoria, contrato, log };
    });
  } catch (e) {
    if (sfPrecisaReconectar(e)) {
      limparSfCache();
      const msg = 'O Salesforce recusou o acesso (403). Reconecte o Salesforce nas configurações e tente de novo.';
      push(msg, 'error');
      return { ok: false, error: msg, precisaReconectar: true, log };
    }
    push(`Salesforce: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// ---------- AppSheet "Backup Informações Busca Cliente" (ADR-147) ----------
//
// Quando o Salesforce não acha a conta pelo domínio, a razão social pode
// estar no app do AppSheet (view "Informações Cliente"). Não há API: o Hub
// abre a view numa janela própria (sessão persistente; o login é com o
// Google, feito pela pessoa uma vez, na janela), digita o domínio na busca e
// lê o que a página mostra; quem decide a razão social é lib/appsheet.js
// (puro). A janela fica em cache entre domínios, como a do painel.
const APPSHEET_PARTITION = 'persist:appsheet';
const APPSHEET_URL = 'https://www.appsheet.com/start/0d908d41-bb1a-4289-941d-a84a985bcd67?newUser=true&onboarding=true&platform=desktop#appName=BackupInforma%C3%A7%C3%B5esBuscaCliente-29-10-2025-290535480-25-10-31&vss=H4sIAAAAAAAAA63PPQ7CMAwF4KsgzzlB1oqhQrCAWEiH0DhSRJpUTQpUUc7DCThBL4bLj1jYymY_S5-eE5wNXrZR1ifgh_TdVjgAhyRgN7QogAsovIudtwKYgI1sXmHptO8aOd7GO4ZFYQ26SJcMuWIfLGIAnmZY_I-9GBhFs9EGuwmeGALfCJ0ngoKfAGQGTR_l0eLzLwJypkz7ug-o9lRybrlQuuW1lU6tvSJfSxswPwCDuHlIpgEAAA==&view=Informa%C3%A7%C3%B5es%20Cliente';
const APPSHEET_LOGIN_PRAZO_MS = 5 * 60 * 1000;
const APPSHEET_JANELA_TTL_MS = 3 * 60 * 1000;
let appsheetJanela = null; // { win, timer }

// O Google recusa login num navegador que se apresenta como Electron: a
// janela se apresenta como o Chrome que ela é.
const uaSemElectron = (ua) => String(ua || '').replace(/\s*(Electron|pr-merge-tool|PR Merge Tool|Hub)\/[\d.]+/gi, '').replace(/\s{2,}/g, ' ').trim();
const appsheetEhLogin = (url) => /appsheet\.com\/Account\/Login|accounts\.google\.com/i.test(String(url || ''));

function appsheetDescartarJanela() {
  const j = appsheetJanela;
  appsheetJanela = null;
  if (j) { clearTimeout(j.timer); if (j.win && !j.win.isDestroyed()) j.win.destroy(); }
}
function appsheetSoltarJanela(win) {
  if (!win || win.isDestroyed()) { if (appsheetJanela && appsheetJanela.win === win) appsheetJanela = null; return; }
  if (!appsheetJanela || appsheetJanela.win !== win) { if (appsheetJanela) appsheetDescartarJanela(); appsheetJanela = { win, timer: null }; }
  clearTimeout(appsheetJanela.timer);
  appsheetJanela.timer = setTimeout(appsheetDescartarJanela, APPSHEET_JANELA_TTL_MS);
  if (typeof appsheetJanela.timer.unref === 'function') appsheetJanela.timer.unref();
}

async function appsheetPedeLogin(win) {
  if (appsheetEhLogin(win.webContents.getURL())) return true;
  const r = await rodarNoPainel(win, `return { login: /sign in with|entrar com o google|fa[çc]a login/i.test((document.body && document.body.innerText || '').slice(0, 3000)) && !!document.querySelector('a[href*="Login"], a[href*="google"], button') };`, { prazoMs: 20000 }).catch(() => ({ login: false }));
  return !!(r && r.login);
}

// Abre (ou reaproveita) a janela do AppSheet já na view. Pedindo login, mostra
// a janela e espera a pessoa entrar com o Google (até 5 min); `mostrar: true`
// é o botão "Entrar no AppSheet": deixa a janela visível e volta.
async function abrirAppSheet(push, { mostrar = false } = {}) {
  if (appsheetJanela && appsheetJanela.win && !appsheetJanela.win.isDestroyed()) {
    clearTimeout(appsheetJanela.timer);
    const win = appsheetJanela.win;
    if (mostrar) { win.show(); win.focus(); }
    else push('AppSheet: reaproveitando a janela já aberta.', 'info');
    return win;
  }
  const win = new BrowserWindow({
    show: false, width: 1180, height: 820, title: 'AppSheet — Backup Informações (entre com o Google, se pedir)',
    webPreferences: { partition: APPSHEET_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setUserAgent(uaSemElectron(win.webContents.getUserAgent()));
  // O login do Google pode abrir um popup: nasce na mesma sessão, para o
  // retorno chegar ao app.
  win.webContents.setWindowOpenHandler(({ url }) => (/google\.com|appsheet\.com/i.test(url)
    ? { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { partition: APPSHEET_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true } } }
    : { action: 'deny' }));
  win.on('closed', () => { if (appsheetJanela && appsheetJanela.win === win) appsheetJanela = null; });
  push('Abrindo o AppSheet (Backup Informações, view "Informações Cliente").', 'cmd');
  try {
    const carregou = aguardarCarregar(win);
    win.loadURL(APPSHEET_URL);
    await carregou;
    await new Promise((r) => setTimeout(r, 1500));
    if (await appsheetPedeLogin(win)) {
      push(mostrar
        ? 'O AppSheet pede login. Entre com o Google na janela; a sessão fica guardada nesta máquina.'
        : 'O AppSheet pede login com o Google. Abri a janela: entre lá que eu continuo. Tenho 5 minutos.', 'warn');
      win.show(); win.focus();
      const fim = Date.now() + APPSHEET_LOGIN_PRAZO_MS;
      let logado = false;
      while (Date.now() < fim) {
        await new Promise((r) => setTimeout(r, 2000));
        if (win.isDestroyed()) throw new Error('a janela do AppSheet foi fechada antes do login');
        const url = win.webContents.getURL();
        if (!appsheetEhLogin(url) && /appsheet\.com\/start\//i.test(url) && !(await appsheetPedeLogin(win))) { logado = true; break; }
      }
      if (!logado) { const e = new Error('o login no AppSheet não foi concluído em 5 minutos'); e.precisaLogin = true; throw e; }
      push('Login no AppSheet aceito; a sessão fica guardada nesta máquina.', 'success');
      if (!mostrar) win.hide();
      // A view pode não ser a de "Informações Cliente" depois do login: volta a ela.
      if (!/view=Informa/i.test(win.webContents.getURL())) { const volta = aguardarCarregar(win); win.loadURL(APPSHEET_URL); await volta; }
    } else if (mostrar) {
      win.show(); win.focus();
      push('AppSheet já logado nesta máquina: a janela está aberta só para você ver.', 'success');
    }
  } catch (e) {
    if (!win.isDestroyed()) win.destroy();
    throw e;
  }
  appsheetJanela = { win, timer: null };
  return win;
}

// O script que roda dentro da view está em lib/appsheet.js (JS_BUSCAR):
// digita o domínio na busca, espera o filtro e lê a coluna "Cliente" das
// linhas que sobraram. Aqui é só a cola com a janela.

ipcMain.handle('appsheet:buscar', async (event, { dominio } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  const dom = String(dominio || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  if (!dom) return { ok: false, error: 'Sem domínio.', log };
  let win = null;
  try {
    const Apps = require(path.join(__dirname, 'lib', 'appsheet'));
    win = await abrirAppSheet(push);
    push(`AppSheet: procurando "${dom}" na view.`, 'cmd');
    let r = await rodarNoPainel(win, Apps.JS_BUSCAR(dom), { prazoMs: 90000 });
    if (r && r.semCaixa) {
      // A view pode não ter carregado (ou ter saído da lista): recarrega uma vez.
      push('AppSheet: a view não mostrou a caixa de busca; recarregando a view.', 'info');
      const volta = aguardarCarregar(win);
      win.loadURL(APPSHEET_URL);
      await volta;
      await new Promise((x) => setTimeout(x, 3000));
      if (await appsheetPedeLogin(win)) { appsheetDescartarJanela(); const e = new Error('o AppSheet voltou a pedir login'); e.precisaLogin = true; throw e; }
      r = await rodarNoPainel(win, Apps.JS_BUSCAR(dom), { prazoMs: 90000 });
      if (r && r.semCaixa) throw new Error(`não achei a caixa de busca na view do AppSheet (a página mostra: ${String(r.texto || '').replace(/\s+/g, ' ').slice(0, 160)})`);
    }
    const res = Apps.escolherLinhaAppSheet(r.linhas || [], dom);
    const resumoLinhas = (r.linhas || []).slice(0, 4).map((l) => `${l.cliente || '(sem Cliente)'}${l.tabela ? ' [' + l.tabela + ']' : ''}`).join('; ');
    if (res.achou) push(`AppSheet: ${dom} → "${res.razao}" (${res.via}).`, 'success');
    else push(`AppSheet: ${dom}: ${res.motivo}.${resumoLinhas && !res.ambiguo ? ' Linhas: ' + resumoLinhas : ''}`, 'warn');
    appsheetSoltarJanela(win);
    return { ok: true, achou: !!res.achou, razao: res.razao || '', via: res.via || '', motivo: res.motivo || '', ambiguo: !!res.ambiguo, candidatos: res.candidatos || [], linhas: (r.linhas || []).length, log };
  } catch (e) {
    if (win && !win.isDestroyed() && !(appsheetJanela && appsheetJanela.win === win)) win.destroy();
    if (e && e.detalhe && e.detalhe.travou) appsheetDescartarJanela();
    push(`AppSheet: ${e.message}`, 'error');
    return { ok: false, error: e.message, precisaLogin: !!(e && e.precisaLogin), log };
  }
});

ipcMain.handle('appsheet:abrir', async () => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  try {
    const win = await abrirAppSheet(push, { mostrar: true });
    appsheetSoltarJanela(win);
    return { ok: true, log };
  } catch (e) {
    push(`AppSheet: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// ---------- Quando foi publicado (ADR-135) ----------
//
// Por domínio: a tarefa de publicação concluída no Salesforce (busca global,
// com a conta do cliente como reserva) e, sem ela, o commit do geral.php ou do
// client.inc.php no repositório do Bitbucket (slug = domínio, nas workspaces
// das marcas). O núcleo está em lib/quando-publicou.js; aqui é a cola com a
// sessão do Salesforce (renova sozinha) e as credenciais do Bitbucket. Com o
// Salesforce fora, consulta só o Bitbucket e avisa.
ipcMain.handle('publicacao:quando', async (event, { dominio } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  try {
    const QuandoPublicou = require('./lib/quando-publicou');
    let creds = null;
    try { if (fs.existsSync(credsPath())) creds = JSON.parse(safeStorage.decryptString(fs.readFileSync(credsPath()))); } catch (e) { creds = null; }
    let workspaces = [];
    try {
      const st = fs.existsSync(hubStatePath()) ? JSON.parse(fs.readFileSync(hubStatePath(), 'utf-8')) : {};
      workspaces = [...new Set([...Object.values(st.bitbucketWorkspaces || {}), st.bitbucketWorkspace].map((w) => String(w || '').trim()).filter(Boolean))];
    } catch (e) { workspaces = []; }
    const bb = creds && creds.email && creds.token && workspaces.length ? QuandoPublicou.criarBitbucket({ creds, workspaces }) : null;
    if (!bb) push(creds && creds.token ? 'Sem "Workspace do Bitbucket" configurada (Configurações): a busca por commit fica de fora.' : 'Bitbucket não configurado: a busca por commit fica de fora.', 'warn');

    let resultado;
    try {
      resultado = await sfComSessao((sf) => QuandoPublicou.quandoPublicou(dominio, { sf, bb, log: push }));
    } catch (e) {
      if (!(e instanceof SfReauthNeeded) && !sfPrecisaReconectar(e)) throw e;
      push(`Salesforce fora (${e.message}); procurando só no Bitbucket.`, 'warn');
      resultado = await QuandoPublicou.quandoPublicou(dominio, { sf: null, bb, log: push });
      resultado.semSalesforce = true;
    }
    return { ok: true, log, ...resultado };
  } catch (e) {
    push(`Erro em ${dominio}: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// ---------- WHOIS + DNS da tela inicial (ADR-113) ----------
//
// WHOIS é uma consulta de texto na porta 43. Para .br vai direto no
// whois.registro.br; para o resto, pergunta ao whois.iana.org quem responde
// pelo TLD (linha "refer:") e consulta lá. DNS: nameservers, A e MX, pelo
// resolvedor da máquina.
function whoisBruto(host, consulta, { timeoutMs = 8000 } = {}) {
  const net = require('net');
  return new Promise((resolve, reject) => {
    let dados = '';
    let feito = false;
    const fim = (fn, arg) => { if (feito) return; feito = true; try { s.destroy(); } catch (e) {} fn(arg); };
    const s = net.connect(43, host, () => s.write(consulta + '\r\n'));
    s.setTimeout(timeoutMs, () => fim(reject, new Error(`o WHOIS ${host} não respondeu em ${Math.round(timeoutMs / 1000)}s`)));
    s.on('data', (d) => { dados += d.toString('utf8'); });
    s.on('end', () => fim(resolve, dados));
    s.on('error', (e) => fim(reject, e));
  });
}

// Puxa alguns campos conhecidos do texto do WHOIS (.br e genérico). Devolve o
// que achar; o texto cru vai junto para quem quiser ver tudo.
function parseWhois(texto) {
  const linhas = String(texto || '').split(/\r?\n/);
  const primeiro = (rotulos) => {
    for (const l of linhas) {
      const m = l.match(/^\s*([\w .\/-]+?):\s*(.+?)\s*$/);
      if (m && rotulos.some((r) => r.toLowerCase() === m[1].trim().toLowerCase())) return m[2];
    }
    return '';
  };
  const todos = (rotulos) => linhas
    .map((l) => l.match(/^\s*([\w .\/-]+?):\s*(.+?)\s*$/))
    .filter((m) => m && rotulos.some((r) => r.toLowerCase() === m[1].trim().toLowerCase()))
    .map((m) => m[2]);
  return {
    titular: primeiro(['owner', 'Registrant Name', 'Registrant Organization', 'org']),
    registrador: primeiro(['Registrar', 'registrar']),
    criado: primeiro(['created', 'Creation Date', 'Registered On']),
    expira: primeiro(['expires', 'Registry Expiry Date', 'Expiration Date', 'expiration date', 'Expiry Date']),
    status: [...new Set(todos(['status', 'Domain Status', 'domain status']))].join(', '),
    nameservers: [...new Set(todos(['nserver', 'Name Server', 'name server']).map((n) => n.split(/\s+/)[0].toLowerCase().replace(/\.$/, '')))],
  };
}

async function whoisConsulta(dominio) {
  if (/\.br$/i.test(dominio)) {
    const texto = await whoisBruto('whois.registro.br', dominio);
    return { host: 'whois.registro.br', texto: String(texto).slice(0, 10000), campos: parseWhois(texto) };
  }
  const iana = await whoisBruto('whois.iana.org', dominio);
  const refer = (iana.match(/refer:\s*(\S+)/i) || [])[1];
  if (refer) {
    try {
      const texto = await whoisBruto(refer, dominio);
      return { host: refer, texto: String(texto).slice(0, 10000), campos: parseWhois(texto) };
    } catch (e) {
      return { host: refer, texto: String(iana).slice(0, 10000), campos: parseWhois(iana), aviso: `não consegui consultar ${refer} (${e.message}); mostrando o que o IANA respondeu` };
    }
  }
  return { host: 'whois.iana.org', texto: String(iana).slice(0, 10000), campos: parseWhois(iana) };
}

ipcMain.handle('dns:whois', async (event, { dominio: bruto } = {}) => {
  const dominio = normalizeDomain(bruto);
  if (!dominio) return { ok: false, error: 'Informe um domínio válido.' };
  const dnsp = require('dns').promises;
  const safe = async (fn) => { try { return await fn(); } catch (e) { return null; } };
  const [ns, a, mxBruto] = await Promise.all([
    safe(() => dnsp.resolveNs(dominio)),
    safe(() => dnsp.resolve4(dominio)),
    safe(() => dnsp.resolveMx(dominio)),
  ]);
  const dns = {
    ns: (ns || []).map((x) => x.toLowerCase().replace(/\.$/, '')).sort(),
    a: a || [],
    mx: (mxBruto || []).sort((x, y) => x.priority - y.priority).map((m) => `${m.priority} ${m.exchange}`),
    resolveu: !!(ns && ns.length),
  };
  let whois = null;
  try { whois = await whoisConsulta(dominio); } catch (e) { whois = { erro: e.message }; }
  return { ok: true, dominio, dns, whois };
});

// Nome do usuário logado, para a saudação da tela inicial (ADR-113). Preferência:
// o nome do Salesforce (nome e sobrenome de verdade); senão, derivado do e-mail
// do Bitbucket/painel; senão, o usuário do sistema.
ipcMain.handle('sistema:recursos', () => {
  const mem = process.memoryUsage();
  return { ok: true, memMb: Math.round((mem.rss || mem.heapUsed) / (1024 * 1024)) };
});

ipcMain.handle('sistema:usuario', async () => {
  const tituloCase = (s) => String(s || '').split(/[._-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  // Salesforce, se conectado (não força login).
  try {
    const token = readSfToken();
    if (token && token.access_token && token.instance_url) {
      const sf = criarSalesforce(token.instance_url, token.access_token);
      const eu = await sf.identidade();
      if (eu && eu.nome) return { ok: true, nome: eu.nome, fonte: 'salesforce' };
    }
  } catch (e) { /* sem SF, cai para o e-mail */ }
  const creds = readPainelCreds();
  const emails = [creds && creds.email].filter(Boolean);
  for (const e of emails) { const n = tituloCase(String(e).split('@')[0]); if (n) return { ok: true, nome: n, fonte: 'email' }; }
  try { return { ok: true, nome: tituloCase(require('os').userInfo().username), fonte: 'sistema' }; } catch (e) {}
  return { ok: true, nome: '' };
});

// ---------- Apontamento de DNS (ferramenta "Suspender sites") ----------

// Faixas de hospedagem conhecidas. Só o último octeto varia, então a
// comparação é por prefixo /24. Mudou faixa? Muda aqui, é a única fonte da
// verdade; a tela só exibe o que este bloco devolve.
const HOSTING_GROUPS = [
  {
    id: 'm3',
    label: 'M3 Solutions',
    action: 'email',
    prefixes: ['149.18.103.'],
    hint: 'suspensão por e-mail para o suporte',
  },
  {
    id: 'vesta',
    label: 'Vesta',
    action: 'manual',
    prefixes: ['169.57.169.', '169.57.141.'],
    hint: 'suspender manualmente no painel do Vesta',
  },
];

const DNS_TIMEOUT_MS = 5000;
const DNS_CONCURRENCY = 8;

function groupForIp(ip) {
  return HOSTING_GROUPS.find((g) => g.prefixes.some((p) => ip.startsWith(p))) || null;
}

// Um domínio pode ter vários registros A. Se todos caem no mesmo grupo a
// resposta é esse grupo; se caem em grupos diferentes ninguém decide por você
//, vira "misto" e some da lista de envio automático.
function classifyIps(ips) {
  const grupos = [...new Set(ips.map((ip) => groupForIp(ip)?.id || 'outro'))];
  if (!grupos.length) return { status: 'erro', label: 'Sem registro A' };
  if (grupos.length > 1) {
    return { status: 'misto', label: 'IPs em faixas diferentes' };
  }
  if (grupos[0] === 'outro') return { status: 'outro', label: 'Não aponta para nós' };
  const g = HOSTING_GROUPS.find((x) => x.id === grupos[0]);
  return { status: g.id, label: g.label, action: g.action, hint: g.hint };
}

function resolveA(host) {
  const { Resolver } = require('dns').promises;
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 });
  return resolver.resolve4(host);
}

// Resolvedores públicos, para enxergar o que o mundo já vê, e não o que o
// cache do Windows ainda guarda (ADR-104). A troca de DNS propaga nos públicos
// (Google, Cloudflare, Quad9, OpenDNS) horas antes de o resolvedor da máquina
// soltar o valor antigo, então a espera do SSL não pode depender só do local.
const DNS_PUBLICOS = [['8.8.8.8', '8.8.4.4'], ['1.1.1.1', '1.0.0.1'], ['9.9.9.9'], ['208.67.222.222']];

async function resolveAEm(servidores, host) {
  const { Resolver } = require('dns').promises;
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
  resolver.setServers(servidores);
  return resolver.resolve4(host);
}

// Junta o resolvedor da máquina com os públicos. Devolve os IPs vistos e de
// onde. Um público que responde já basta; o local entra junto por educação.
async function resolveATodos(host) {
  const fontes = [['local', null], ...DNS_PUBLICOS.map((srv) => [srv[0], srv])];
  const ips = new Set();
  const vistos = [];
  const resultados = await Promise.all(fontes.map(async ([nome, srv]) => {
    try {
      const r = srv ? await resolveAEm(srv, host) : await resolveA(host);
      return { nome, ips: r || [] };
    } catch (e) {
      return { nome, ips: [], erro: e.code || e.message };
    }
  }));
  for (const r of resultados) { for (const ip of r.ips) ips.add(ip); if (r.ips.length) vistos.push(r.nome); }
  return { ips: [...ips], vistos, resultados };
}

// O domínio já aponta para o servidor de produção? É a pergunta que o SSL
// precisa responder antes de existir: o painel só emite o certificado depois
// que a raiz resolve para cá, e antes disso ele devolve apenas "Não foi
// possível ativar o SSL de produção", que não explica nada (ADR-069).
//
// Aqui a raiz é a raiz: nada de cair para o www como o resolveDomain faz. O
// certificado é do domínio, e www apontando certo com a raiz errada continua
// sendo SSL que não sai.
ipcMain.handle('dns:apontando', async (event, { dominio: bruto, ip }) => {
  try {
    const dominio = normalizeDomain(bruto);
    if (!dominio) return { ok: false, error: 'Domínio vazio.' };
    const alvo = String(ip || '').trim();
    if (!alvo) return { ok: false, error: 'Sem IP de produção para comparar.' };

    // Local + públicos: o certificado só sai quando o servidor de produção
    // recebe o tráfego, e isso segue o DNS público, não o cache da máquina.
    const raiz = await resolveATodos(dominio);
    const www = await resolveATodos(`www.${dominio}`);

    return {
      ok: true,
      dominio,
      ip: alvo,
      apontando: raiz.ips.includes(alvo),
      wwwApontando: www.ips.includes(alvo),
      raiz: raiz.ips,
      www: www.ips,
      // Quem já vê o IP NOVO (o que importa para o log), não quem respondeu.
      vistoEm: (raiz.resultados || []).filter((x) => x.ips.includes(alvo)).map((x) => x.nome),
      // Sem resposta nenhuma é diferente de resposta errada: uma é espera, a
      // outra é DNS que ninguém trocou.
      resolveu: raiz.ips.length > 0,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Resolve o domínio; se o apex não existir, tenta o www antes de desistir, // tem cliente que só publicou o www, e chamar isso de "não aponta para nós"
// seria mentira.
async function resolveDomain(dominio) {
  const tentativas = [dominio, `www.${dominio}`];
  let ultimoErro = null;

  for (const host of tentativas) {
    try {
      const ips = await resolveA(host);
      if (ips && ips.length) {
        return { host, ips, ...classifyIps(ips) };
      }
      ultimoErro = 'sem registro A';
    } catch (e) {
      ultimoErro = e.code || e.message;
      // NXDOMAIN/sem dados: vale tentar o www. Timeout ou falha de rede não
      // vira "não existe", não adianta insistir no mesmo problema.
      if (!['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(e.code)) break;
    }
  }

  return {
    host: dominio,
    ips: [],
    status: 'erro',
    label: 'Não resolveu',
    detail: String(ultimoErro || 'falha desconhecida'),
  };
}

// A marca do cliente pelo IP do apontamento (ADR-119): resolve a raiz (e o www
// se a raiz não resolver) e casa com as faixas conhecidas. 149.18.103.138 = MPI
// Solutions; .98–.106 = Busca Cliente; 149.18.102.39 = MPI+.
ipcMain.handle('dns:marca', async (event, { dominio: bruto } = {}) => {
  try {
    const { marcaPorIps } = require(path.join(__dirname, 'lib', 'triagem'));
    const dominio = normalizeDomain(bruto);
    if (!dominio) return { ok: false, error: 'Domínio vazio.' };
    const raiz = await resolveATodos(dominio);
    const www = raiz.ips.length ? { ips: [] } : await resolveATodos(`www.${dominio}`);
    const ips = [...new Set([...(raiz.ips || []), ...(www.ips || [])])];
    return { ok: true, dominio, ips, marca: marcaPorIps(ips), resolveu: ips.length > 0 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Backup do DNS antes de trocar o apontamento (ADR-119): grava o conteúdo num
// .txt em Música\backup dns\{dominio}.txt. Sem esse backup, a automação NÃO
// troca o DNS. Nome já existente é sobrescrito (o backup mais novo vale).
ipcMain.handle('dns:backup', async (event, { dominio: bruto, conteudo } = {}) => {
  try {
    const dominio = normalizeDomain(bruto);
    if (!dominio) return { ok: false, error: 'Domínio vazio.' };
    const dir = path.join(app.getPath('music'), 'backup dns');
    fs.mkdirSync(dir, { recursive: true });
    const seguro = dominio.replace(/[^a-z0-9.\-]/gi, '_');
    const destino = path.join(dir, `${seguro}.txt`);
    const cabecalho = `Backup DNS de ${dominio}\nGerado pelo Hub em ${new Date().toLocaleString('pt-BR')}\n\n`;
    fs.writeFileSync(destino, cabecalho + String(conteudo || ''), 'utf-8');
    return { ok: true, caminho: destino };
  } catch (e) {
    return { ok: false, error: `Não consegui gravar o backup do DNS: ${e.message}` };
  }
});

ipcMain.handle('dns:checkBatch', async (event, { domains }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });

  try {
    const lista = [...new Set((domains || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
    if (!lista.length) return { ok: false, error: 'Informe pelo menos um domínio.', log };

    push(`Consultando o DNS de ${lista.length} domínio(s)`, 'info');

    const resultados = new Array(lista.length);
    let cursor = 0;

    const worker = async () => {
      while (cursor < lista.length) {
        const i = cursor++;
        const dominio = lista[i];
        const r = await resolveDomain(dominio);
        resultados[i] = { dominio, ...r };
        const detalhe = r.ips.length ? r.ips.join(', ') : r.detail;
        const marca = r.host !== dominio ? ` (via ${r.host})` : '';
        push(
          `${dominio}${marca} → ${detalhe} · ${r.label}`,
          r.status === 'm3' || r.status === 'vesta' ? 'success' : r.status === 'erro' ? 'warn' : 'info'
        );
      }
    };

    await Promise.all(Array.from({ length: Math.min(DNS_CONCURRENCY, lista.length) }, worker));

    return { ok: true, log, resultados, grupos: HOSTING_GROUPS };
  } catch (e) {
    push(`Erro: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});


// ---------- Histórico de DNS (WhoisXML DNS Chronicle) ----------
//
// Para o domínio que hoje NÃO aponta para nós: já apontou algum dia? Quando
// deixou de apontar? A chave fica criptografada pelo sistema, como a do
// Bitbucket, é credencial, não configuração.
//
// A API devolve OBSERVAÇÕES por data, não janelas. Quem junta datas
// consecutivas na mesma faixa em "esteve aqui de X a Y" é o resumirHistorico
// aqui embaixo.

const dnsHistKeyPath = () => path.join(app.getPath('userData'), 'dns-history-key.enc');
const DNSH_HOST = 'dns-history.whoisxmlapi.com';
const DNSH_MIN_INTERVAL_MS = 1200;
const DNSH_MAX_PAGES = 3; // cada página é mais um crédito, o plano gratuito são 500

function readDnsHistKey() {
  try {
    if (!fs.existsSync(dnsHistKeyPath())) return null;
    return safeStorage.decryptString(fs.readFileSync(dnsHistKeyPath())) || null;
  } catch (e) {
    return null;
  }
}

ipcMain.handle('dnshist:setKey', (event, { key }) => {
  try {
    const limpa = String(key || '').trim();
    if (!limpa) {
      if (fs.existsSync(dnsHistKeyPath())) fs.unlinkSync(dnsHistKeyPath());
      return { ok: true, configured: false };
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'Criptografia do sistema indisponível, não vou gravar a chave em texto puro.' };
    }
    fs.writeFileSync(dnsHistKeyPath(), safeStorage.encryptString(limpa));
    return { ok: true, configured: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Nunca devolve a chave para a tela, só se existe.
ipcMain.handle('dnshist:status', () => ({ ok: true, configured: !!readDnsHistKey() }));

function dnsHistRequest(corpo) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(corpo);
    const req = https.request(
      {
        hostname: DNSH_HOST,
        path: '/api/v1',
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let chunks = '';
        res.setEncoding('utf-8');
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = chunks ? JSON.parse(chunks) : {}; } catch (e) { parsed = { raw: chunks }; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function dnsHistError(res) {
  const b = res.body || {};
  if (res.status === 401) return 'Chave recusada, confira o valor nas configurações.';
  if (res.status === 403) {
    return 'Acesso negado: créditos esgotados, chave incorreta, ou seu IP fora da allowlist da conta.';
  }
  if (res.status === 429) return 'Muitas consultas seguidas, a API pediu para esperar.';
  return b.messages || b.message || b.error || `HTTP ${res.status}`;
}

// Junta observações consecutivas na mesma faixa numa janela só. Sem isso a
// tela viraria uma lista de datas soltas, que não responde "quando saiu".
function resumirHistorico(records) {
  const obs = (records || [])
    .map((r) => ({ date: r.date, ips: (r.ips || []).map((i) => i.ip).filter(Boolean) }))
    .filter((o) => o.date && o.ips.length);
  obs.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const janelas = [];
  for (const o of obs) {
    const ids = [...new Set(o.ips.map((ip) => groupForIp(ip)?.id || 'outro'))].sort();
    const chave = ids.join('+');
    const ultima = janelas[janelas.length - 1];
    if (ultima && ultima.chave === chave) {
      ultima.fim = o.date;
      for (const ip of o.ips) ultima.ips.add(ip);
    } else {
      janelas.push({ chave, inicio: o.date, fim: o.date, ips: new Set(o.ips) });
    }
  }

  return janelas
    .map((j) => {
      const ids = j.chave.split('+');
      return {
        first_seen: j.inicio,
        last_seen: j.fim,
        ips: [...j.ips],
        grupos: ids
          .filter((id) => id !== 'outro')
          .map((id) => HOSTING_GROUPS.find((g) => g.id === id).label),
        nosso: ids.some((id) => id !== 'outro'),
      };
    })
    .reverse(); // mais recente primeiro
}

ipcMain.handle('dns:history', async (event, { domains }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });

  try {
    const key = readDnsHistKey();
    if (!key) {
      return {
        ok: false,
        error: 'Nenhuma chave de histórico configurada, coloque na engrenagem, em "Chave da API de histórico de DNS".',
        log,
      };
    }

    const lista = [...new Set((domains || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
    if (!lista.length) return { ok: false, error: 'Informe pelo menos um domínio.', log };

    const resultados = [];
    let ultima = 0;
    let creditos = 0;

    for (const dominio of lista) {
      let records = [];
      let after = null;
      let parcial = false;
      let erro = null;

      for (let pagina = 0; pagina < DNSH_MAX_PAGES; pagina++) {
        const falta = DNSH_MIN_INTERVAL_MS - (Date.now() - ultima);
        if (falta > 0) await dormir(falta);
        ultima = Date.now();

        const corpo = { apiKey: key, searchType: 'forward', recordType: 'a', domainName: dominio };
        if (after) corpo.after = after;

        push(`POST dns-history ${dominio}${pagina ? ` (página ${pagina + 1})` : ''}`, 'cmd');
        const res = await dnsHistRequest(corpo);
        creditos++;

        if (res.status !== 200) {
          erro = dnsHistError(res);
          // Chave ruim, crédito acabado ou excesso de chamadas não melhora no
          // próximo domínio, parar aqui poupa o resto dos créditos.
          if ([401, 403, 429].includes(res.status)) {
            resultados.push({ dominio, ok: false, error: erro });
            push(`${dominio}: ${erro}`, 'error');
            return { ok: true, log, resultados, creditos, interrompido: erro };
          }
          break;
        }

        const novos = res.body?.result?.records || [];
        records = records.concat(novos);
        after = res.body?.result?.after || null;
        if (!novos.length || !after) { after = null; break; }
        parcial = pagina === DNSH_MAX_PAGES - 1;
      }

      if (erro && !records.length) {
        resultados.push({ dominio, ok: false, error: erro });
        push(`${dominio}: ${erro}`, 'warn');
        continue;
      }

      const linhas = resumirHistorico(records);
      const nossas = linhas.filter((l) => l.nosso);
      resultados.push({ dominio, ok: true, linhas, nossas, parcial });

      if (!nossas.length) {
        push(`${dominio}: nunca apareceu em nossas faixas (${linhas.length} período(s) no histórico)`, 'info');
      } else {
        const n = nossas[0];
        push(`${dominio}: esteve em ${n.grupos.join('/')} de ${n.first_seen} a ${n.last_seen}`, 'success');
      }
      if (parcial) push(`${dominio}: histórico truncado em ${DNSH_MAX_PAGES} páginas, pode haver registro mais antigo.`, 'warn');
    }

    push(`${creditos} consulta(s) gastas nesta rodada.`, 'info');
    return { ok: true, log, resultados, creditos };
  } catch (e) {
    push(`Erro: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// Substitui {dominio} (e {domínio}, com acento) no assunto e no corpo.
function fillTemplate(texto, dominio) {
  return String(texto || '').replace(/\{\s*dom[ií]nio\s*\}/gi, dominio);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

ipcMain.handle('mail:sendBatch', async (event, { to, cc, subjectTemplate, bodyTemplate, domains }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });

  try {
    const destinos = (to || []).map((s) => String(s).trim()).filter(Boolean);
    const copias = (cc || []).map((s) => String(s).trim()).filter(Boolean);
    const lista = (domains || []).map((s) => String(s).trim()).filter(Boolean);

    if (!destinos.length) return { ok: false, error: 'Informe pelo menos um destinatário.', log };
    if (!lista.length) return { ok: false, error: 'Informe pelo menos um domínio.', log };

    const invalidos = [...destinos, ...copias].filter((e) => !EMAIL_RE.test(e));
    if (invalidos.length) {
      return { ok: false, error: `E-mail inválido: ${invalidos.join(', ')}`, log };
    }

    const token = await msAccessToken();
    const ritmo = createApiPacer(push, { minIntervalMs: MAIL_MIN_INTERVAL_MS, backoff: MAIL_BACKOFF_MS });

    push(`Enviando ${lista.length} e-mail(s) para ${destinos.join(', ')}${copias.length ? ' (cc ' + copias.join(', ') + ')' : ''}`, 'info');

    const enviados = [];
    const falhas = [];

    for (const dominio of lista) {
      const assunto = fillTemplate(subjectTemplate, dominio);
      try {
        push(`POST sendMail → ${dominio}`, 'cmd');
        const res = await ritmo(`e-mail de ${dominio}`, () =>
          msRequest('POST', 'https://graph.microsoft.com/v1.0/me/sendMail', {
            headers: { Authorization: `Bearer ${token}` },
            body: {
              message: {
                subject: assunto,
                body: { contentType: 'Text', content: fillTemplate(bodyTemplate, dominio) },
                toRecipients: destinos.map((address) => ({ emailAddress: { address } })),
                ccRecipients: copias.map((address) => ({ emailAddress: { address } })),
              },
              saveToSentItems: true,
            },
          })
        );

        // sendMail responde 202 Accepted, sem corpo.
        if (res.status !== 202 && res.status !== 200) {
          throw new Error(msError(res));
        }
        enviados.push(dominio);
        push(`Enviado: "${assunto}"`, 'success');
      } catch (e) {
        if (e instanceof MsReauthNeeded) throw e;
        falhas.push({ dominio, erro: e.message });
        push(`Falha em ${dominio}: ${e.message}`, 'warn');
      }
    }

    return { ok: true, log, enviados, falhas, total: lista.length };
  } catch (e) {
    if (e instanceof MsReauthNeeded) {
      push(e.message, 'warn');
      return { ok: false, reauth: true, error: e.message, log };
    }
    push(`Erro: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// ---------- Planilha de publicações no SharePoint (ADR-062) ----------
//
// Toda publicação vira uma linha no Book.xlsx do OneDrive do Guilherme, na aba
// MPI ou BUSCA. Pelo Microsoft Graph, com a mesma sessão do envio de e-mail
// (escopo Files.ReadWrite). O link de compartilhamento vira o item do drive
// por /shares/{u!base64url}; a linha entra na tabela da aba quando há uma, ou
// logo abaixo do intervalo usado quando não há.

const PLANILHA_COLUNAS = [
  'Data', 'Domínio', 'Razão Social', 'Chave Única', 'Tipo', 'Rediect', 'Desenvolvedor',
  'Em Qual Servidor o Projeto Foi Publicado?', 'Validação do Site', 'Criação de Sitemap (sitemap.xml)',
  'Configuração do Tag Manager (geral.php)', 'Configuração do Search Console (geral.php)', 'Envio de Sitemap ao Search Console',
  'Configuração do Painel BC (geral.php)', 'Configuração do Google Analytics (Google Tag Manager)', 'Correção de .htaccess',
  'Redirecionamentos (.htaccess)', 'PUSH no Bitbucket ([BUILD] Configuração Final > Main)', 'Criação de Perfil no Vesta',
  'Clonagem do Projeto do Bitbucket no Servidor de Publicação', 'Exclusão do Projeto na Pasta de Deploy',
  'Exclusão arquivos .htaccess e robots.txt', 'Apontamento de Domínio no Cloudflare.com', 'Apontamento de Domínio no Registro.BR',
  'Site publicado e 100% funcional?', 'Existem correções pendentes pela equipe de Produção?',
];
// A aba da Busca Cliente se chama "Busca Cliente" na planilha — e o Hub
// gravava "BUSCA", que era o nome antigo. O Graph responde 404 para aba que
// não existe, e a publicação terminava sem linha. Em vez de fixar um nome, ele
// pergunta à planilha quais abas existem e casa por aproximação (ADR-069).
const PLANILHA_ABAS = ['MPI', 'Busca Cliente'];
const PLANILHA_ABA_APELIDOS = {
  'Busca Cliente': ['BUSCA', 'BC'],
  MPI: ['MPI+', 'MPI SOLUTIONS'],
};

const chaveAba = (nome) =>
  String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9+]/g, '');

// Qual das abas que existem de verdade é a que foi pedida: nome exato, depois
// apelido, depois começo do nome — "Busca Cliente 2024" ainda é a de busca.
function escolherAba(pedida, existentes) {
  const chaves = [pedida, ...(PLANILHA_ABA_APELIDOS[pedida] || [])].map(chaveAba).filter(Boolean);
  if (!chaves.length) return null;
  const por = (teste) => (existentes || []).find((n) => teste(chaveAba(n))) || null;
  return (
    por((n) => n === chaves[0]) ||
    por((n) => chaves.includes(n)) ||
    por((n) => chaves.some((c) => n.startsWith(c) || c.startsWith(n)))
  );
}

function shareIdDoLink(link) {
  const b64 = Buffer.from(String(link || '').trim(), 'utf-8').toString('base64')
    .replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  return `u!${b64}`;
}

// "MPI!A1:Z57" -> { primeiraLinha: 1, ultimaLinha: 57 }
function linhasDoEndereco(address) {
  const m = String(address || '').split('!').pop().match(/[A-Z]+(\d+)(?::[A-Z]+(\d+))?/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return { primeiraLinha: Math.min(a, b), ultimaLinha: Math.max(a, b) };
}

// A próxima linha livre é a seguinte à última que tem CONTEÚDO nas colunas
// que identificam um site (Data, Domínio, Razão Social). O intervalo usado do
// Excel conta célula formatada, validação de dados e fórmula vazia, e numa
// planilha com formatação arrastada até a linha 600 ele mandou a linha para
// lá, 400 abaixo do último site (ADR-078). `valores` é a matriz do
// usedRange, `primeiraLinha` a linha em que ela começa.
function proximaLinhaLivre(valores, primeiraLinha = 1) {
  const linhas = Array.isArray(valores) ? valores : [];
  const temConteudo = (l) => Array.isArray(l) && l.slice(0, 3).some((v) => String(v ?? '').trim() !== '');
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (temConteudo(linhas[i])) return { proxima: primeiraLinha + i + 1, ultimaComConteudo: primeiraLinha + i };
  }
  return { proxima: primeiraLinha, ultimaComConteudo: null };
}

function colunaLetra(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Procura o domínio nas duas abas (MPI e Busca Cliente) de uma vez. Serve para
// o Publicar em massa não parar perguntando "de qual empresa é?" quando o site
// já está registrado numa delas — a resposta já está na planilha (ADR-095).
// Só leitura: não escreve nada.
ipcMain.handle('planilha:procurar', async (event, { dominio } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  try {
    const alvo = normalizeDomain(String(dominio || ''));
    if (!alvo) return { ok: false, error: 'Sem domínio para procurar.', log };
    const cfg = readPublicacaoConfig();
    const link = String(cfg.planilhaUrl || '').trim();
    if (!link) return { ok: false, error: 'Link da planilha de publicações não configurado.', log };

    const token = await msAccessToken();
    const graph = (metodo, caminho) =>
      msRequest(metodo, `https://graph.microsoft.com/v1.0${caminho}`, { headers: { Authorization: `Bearer ${token}` } });

    const item = await graph('GET', `/shares/${shareIdDoLink(link)}/driveItem?$select=id,name,parentReference`);
    if (item.status !== 200) throw new Error(`Não achei a planilha pelo link (${item.status}): ${msError(item)}`);
    const driveId = item.body?.parentReference?.driveId;
    const itemId = item.body?.id;
    if (!driveId || !itemId) throw new Error('O Graph devolveu o item sem driveId/id.');

    const abas = await graph('GET', `/drives/${driveId}/items/${itemId}/workbook/worksheets?$select=name`);
    if (abas.status !== 200) throw new Error(`Não consegui listar as abas (${abas.status}): ${msError(abas)}`);
    const nomes = (abas.body?.value || []).map((w) => w.name).filter(Boolean);

    push(`Procurando ${alvo} nas abas ${PLANILHA_ABAS.join(' e ')} antes de perguntar a empresa`, 'cmd');
    for (const abaPedida of PLANILHA_ABAS) {
      const aba = escolherAba(abaPedida, nomes);
      if (!aba) continue;
      const base = `/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(aba)}')`;
      const usado = await graph('GET', `${base}/usedRange(valuesOnly=true)?$select=values,address`);
      if (usado.status !== 200) throw new Error(`Não consegui ler a aba ${aba} (${usado.status}): ${msError(usado)}`);
      const valores = usado.body?.values || [];
      const faixa = linhasDoEndereco(usado.body?.address) || { primeiraLinha: 1 };
      const i = valores.findIndex((l) => normalizeDomain(String(l?.[1] || '')) === alvo);
      if (i >= 0) {
        const numero = faixa.primeiraLinha + i;
        push(`${alvo} já está na aba ${aba}, linha ${numero}.`, 'info');
        return { ok: true, log, achado: { aba, abaPedida, linha: numero, onde: `${aba}!${numero}` } };
      }
    }
    push(`${alvo} não está em nenhuma das duas abas.`, 'info');
    return { ok: true, log, achado: null };
  } catch (e) {
    return { ok: false, error: e.message, reauth: !!e.reauth, log };
  }
});

// Lê as duas abas da planilha de publicações e devolve os sites com a aba, a
// linha e o tipo (MPI+, MPI, Busca): é a entrada da conferência dos vínculos no
// painel (ADR-144). Quem é MPI+ decide o lib/vinculos; aqui é só o Graph.
// Só leitura: nada é escrito.
ipcMain.handle('planilha:listar', async () => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  try {
    const cfg = readPublicacaoConfig();
    const link = String(cfg.planilhaUrl || '').trim();
    if (!link) return { ok: false, error: 'Link da planilha de publicações não configurado. Cole o link de compartilhamento nas configurações.', log };

    const token = await msAccessToken();
    const graph = async (metodo, caminho) => {
      const res = await msRequest(metodo, `https://graph.microsoft.com/v1.0${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403 || res.status === 401) {
        throw new MsReauthNeeded(`O Microsoft Graph recusou (${res.status}): ${msError(res)}. Desconecte e conecte a Microsoft de novo em "Suspender sites" para a permissão de arquivos (Files.ReadWrite).`);
      }
      return res;
    };

    push('GET item da planilha pelo link de compartilhamento', 'cmd');
    const item = await graph('GET', `/shares/${shareIdDoLink(link)}/driveItem?$select=id,name,parentReference,webUrl`);
    if (item.status !== 200) throw new Error(`Não achei a planilha pelo link (${item.status}): ${msError(item)}`);
    const driveId = item.body?.parentReference?.driveId;
    const itemId = item.body?.id;
    if (!driveId || !itemId) throw new Error('O Graph devolveu o item sem driveId/id.');

    const abas = await graph('GET', `/drives/${driveId}/items/${itemId}/workbook/worksheets?$select=name`);
    if (abas.status !== 200) throw new Error(`Não consegui listar as abas (${abas.status}): ${msError(abas)}`);
    const nomes = (abas.body?.value || []).map((w) => w.name).filter(Boolean);

    const lidas = [];
    for (const abaPedida of PLANILHA_ABAS) {
      const aba = escolherAba(abaPedida, nomes);
      if (!aba) { push(`A aba de ${abaPedida} não existe na planilha (abas: ${nomes.join(', ') || 'nenhuma'}).`, 'warn'); continue; }
      const base = `/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(aba)}')`;
      push(`GET linhas da aba ${aba}`, 'cmd');
      const usado = await graph('GET', `${base}/usedRange(valuesOnly=true)?$select=values,address`);
      if (usado.status !== 200) throw new Error(`Não consegui ler a aba ${aba} (${usado.status}): ${msError(usado)}`);
      const faixa = linhasDoEndereco(usado.body?.address) || { primeiraLinha: 1 };
      lidas.push({ aba, abaPedida, primeiraLinha: faixa.primeiraLinha, valores: usado.body?.values || [] });
    }
    if (!lidas.length) throw new Error(`Nenhuma das abas ${PLANILHA_ABAS.join(' e ')} existe na planilha. As abas são: ${nomes.join(', ') || '(nenhuma)'}.`);

    const Vinculos = require(path.join(__dirname, 'lib', 'vinculos'));
    const r = Vinculos.clientesDaPlanilha(lidas, { apenasMpiPlus: false });
    const tipos = Object.keys(r.tipos).map((t) => `${r.tipos[t]} ${t}`).join(', ');
    push(`Planilha ${item.body.name}: ${r.clientes.length} site(s) em ${lidas.map((a) => a.aba).join(' e ')} (${tipos || 'sem tipo'}).`, 'info');
    for (const d of r.duplicados) push(`${d.dominio} aparece duas vezes (${d.primeira} e ${d.repetida}); vale a primeira.`, 'warn');
    return { ok: true, log, nome: item.body.name, webUrl: item.body.webUrl, abas: lidas.map((a) => ({ aba: a.aba, abaPedida: a.abaPedida, linhas: a.valores.length })), ...r };
  } catch (e) {
    return { ok: false, error: e.message, reauth: !!e.reauth, log };
  }
});

ipcMain.handle('planilha:registrar', async (event, { aba, linha, pularSeExistir }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  try {
    const abaPedida = escolherAba(aba, PLANILHA_ABAS);
    if (!abaPedida) throw new Error(`Aba desconhecida: ${aba}. Use MPI ou Busca Cliente.`);
    if (!Array.isArray(linha) || linha.length !== PLANILHA_COLUNAS.length) {
      throw new Error(`A linha precisa ter ${PLANILHA_COLUNAS.length} colunas; veio com ${Array.isArray(linha) ? linha.length : 'nada'}.`);
    }
    const cfg = readPublicacaoConfig();
    const link = String(cfg.planilhaUrl || '').trim();
    if (!link) throw new Error('Link da planilha de publicações não configurado. Cole o link de compartilhamento nas configurações.');

    const token = await msAccessToken();
    const graph = async (metodo, caminho, body) => {
      const res = await msRequest(metodo, `https://graph.microsoft.com/v1.0${caminho}`, { headers: { Authorization: `Bearer ${token}` }, body });
      if (res.status === 403 || res.status === 401) {
        throw new MsReauthNeeded(
          `O Microsoft Graph recusou (${res.status}): ${msError(res)}. A sessão da Microsoft foi conectada antes da permissão de arquivos (Files.ReadWrite); ` +
            'desconecte e conecte de novo em "Suspender sites" para a tela de consentimento pedir a permissão nova.'
        );
      }
      return res;
    };

    push('GET item da planilha pelo link de compartilhamento', 'cmd');
    const item = await graph('GET', `/shares/${shareIdDoLink(link)}/driveItem?$select=id,name,parentReference,webUrl`);
    if (item.status !== 200) throw new Error(`Não achei a planilha pelo link (${item.status}): ${msError(item)}`);
    const driveId = item.body?.parentReference?.driveId;
    const itemId = item.body?.id;
    if (!driveId || !itemId) throw new Error('O Graph devolveu o item sem driveId/id.');
    push(`Planilha: ${item.body.name}`, 'info');

    // O nome da aba vem da planilha, não do código: quem renomeia uma aba não
    // tem como saber que o Hub tinha o nome antigo escrito dentro dele.
    push('GET as abas da planilha', 'cmd');
    const abas = await graph('GET', `/drives/${driveId}/items/${itemId}/workbook/worksheets?$select=name`);
    if (abas.status !== 200) throw new Error(`Não consegui listar as abas da planilha (${abas.status}): ${msError(abas)}`);
    const nomes = (abas.body?.value || []).map((w) => w.name).filter(Boolean);
    aba = escolherAba(abaPedida, nomes);
    if (!aba) {
      throw new Error(`A aba "${abaPedida}" não existe na planilha. As abas são: ${nomes.join(', ') || '(nenhuma)'}.`);
    }
    if (aba !== abaPedida) push(`A aba de ${abaPedida} se chama "${aba}" nesta planilha.`, 'info');

    const base = `/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(aba)}')`;

    // Uma leitura só do intervalo usado, com os valores: serve para conferir
    // duplicado e para achar a linha livre. A linha livre é por CONTEÚDO
    // (ADR-078): o intervalo usado do Excel conta célula formatada e fórmula
    // vazia, e isso mandou uma linha para a 600 numa aba com 196 sites.
    push(`GET linhas da aba ${aba}`, 'cmd');
    const usadoTudo = await graph('GET', `${base}/usedRange(valuesOnly=true)?$select=values,address`);
    if (usadoTudo.status !== 200) throw new Error(`Não consegui ler a aba ${aba} (${usadoTudo.status}): ${msError(usadoTudo)}`);
    const valores = usadoTudo.body?.values || [];
    const faixa = linhasDoEndereco(usadoTudo.body?.address) || { primeiraLinha: 1, ultimaLinha: 1 };

    // Já está na planilha? A conferência mora aqui dentro, no mesmo handler que
    // escreve: conferir de fora abriria uma janela entre ler e gravar, e em
    // lote isso vira linha duplicada. O domínio está na coluna B, como
    // `https://dominio/`, então a comparação é pelo domínio normalizado.
    if (pularSeExistir) {
      const alvo = normalizeDomain(String(linha[1] || ''));
      const achada = alvo ? valores.findIndex((l) => normalizeDomain(String(l?.[1] || '')) === alvo) : -1;
      if (achada >= 0) {
        const numero = faixa.primeiraLinha + achada;
        push(`${alvo} já está na aba ${aba}, linha ${numero}. Não vou duplicar.`, 'warn');
        return { ok: true, log, jaExistia: true, onde: `${aba}!${numero}`, webUrl: item.body.webUrl };
      }
      push(`${alvo} ainda não está na aba ${aba}.`, 'info');
    }

    const { proxima, ultimaComConteudo } = proximaLinhaLivre(valores, faixa.primeiraLinha);
    push(
      ultimaComConteudo
        ? `Último site na aba ${aba}: linha ${ultimaComConteudo}. Vou escrever na ${proxima}` + (faixa.ultimaLinha > ultimaComConteudo ? ` (o intervalo usado ia até a ${faixa.ultimaLinha}, por formatação; ignorei).` : '.')
        : `A aba ${aba} não tem site nenhum; vou escrever na linha ${proxima}.`,
      'info'
    );

    // Tabela na aba? Se a linha livre é a seguinte ao fim da tabela, a linha
    // entra nela (a tabela cresce certo). Se cai dentro da tabela (linhas em
    // branco no fim dela) ou fora, escreve pelo endereço, que é a linha certa.
    const tabelas = await graph('GET', `${base}/tables?$select=id,name`);
    if (tabelas.status === 404) throw new Error(`A aba "${aba}" sumiu entre listar e escrever.`);
    if (tabelas.status !== 200) throw new Error(`Não consegui ler a aba ${aba} (${tabelas.status}): ${msError(tabelas)}`);
    const lista = tabelas.body?.value || [];

    let onde;
    let porTabela = false;
    if (lista.length === 1) {
      const t = lista[0];
      const faixaT = await graph('GET', `${base}/tables/${encodeURIComponent(t.id)}/range?$select=address`);
      const linhasT = faixaT.status === 200 ? linhasDoEndereco(faixaT.body?.address) : null;
      if (linhasT && proxima === linhasT.ultimaLinha + 1) porTabela = true;
      else if (linhasT) push(`A tabela ${t.name} vai da linha ${linhasT.primeiraLinha} à ${linhasT.ultimaLinha}; a linha livre é a ${proxima}, então escrevo pelo endereço.`, 'info');
      if (porTabela) {
        push(`POST linha na tabela ${t.name} da aba ${aba} (linha ${proxima})`, 'cmd');
        const r = await graph('POST', `${base}/tables/${encodeURIComponent(t.id)}/rows`, { values: [linha] });
        if (r.status !== 201 && r.status !== 200) throw new Error(`A tabela recusou a linha (${r.status}): ${msError(r)}`);
        onde = `${aba}!${proxima} (tabela ${t.name})`;
      }
    } else if (lista.length > 1) {
      push(`A aba ${aba} tem ${lista.length} tabelas; escrevo pelo endereço.`, 'warn');
    }

    if (!porTabela) {
      const endereco = `A${proxima}:${colunaLetra(PLANILHA_COLUNAS.length)}${proxima}`;
      push(`PATCH ${aba}!${endereco}`, 'cmd');
      const r = await graph('PATCH', `${base}/range(address='${endereco}')`, { values: [linha] });
      if (r.status !== 200) throw new Error(`A planilha recusou a escrita em ${endereco} (${r.status}): ${msError(r)}`);
      onde = `${aba}!${endereco}`;

      // Conferência: o que ficou lá.
      const volta = await graph('GET', `${base}/range(address='${endereco}')?$select=values`);
      const gravado = volta.body?.values?.[0] || [];
      const difere = linha.findIndex((v, i) => String(v ?? '') !== String(gravado[i] ?? ''));
      if (difere >= 0) {
        push(`Conferência: a coluna "${PLANILHA_COLUNAS[difere]}" ficou "${gravado[difere]}" em vez de "${linha[difere]}".`, 'warn');
      } else {
        push('Conferido: a linha está na planilha como foi mandada.', 'success');
      }
    }

    push(`Registrado na planilha (${onde}).`, 'success');
    return { ok: true, log, onde, webUrl: item.body.webUrl };
  } catch (e) {
    if (e instanceof MsReauthNeeded) {
      push(e.message, 'warn');
      return { ok: false, reauth: true, error: e.message, log };
    }
    push(`Planilha: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// ---------- OAuth de usuário (login manual, pra conceder acesso em contas que a service account ainda não tem) ----------

const oauthConfigPath = () => path.join(app.getPath('userData'), 'oauth-config.json');

// Uma sessão por "slot": a principal (slot vazio) é a do "Conceder acesso", e
// cada marca tem a sua, porque registrar a propriedade no Search Console só
// funciona autenticado COMO a conta que vai enxergá-la (ADR-049).
const oauthTokenPath = (slot) =>
  path.join(app.getPath('userData'), slot ? `oauth-token-${String(slot).replace(/[^a-z0-9_-]/gi, '')}.json` : 'oauth-token.json');

function readOauthConfigFile() {
  try {
    if (!fs.existsSync(oauthConfigPath())) return {};
    return JSON.parse(fs.readFileSync(oauthConfigPath(), 'utf-8'));
  } catch (e) {
    return {};
  }
}

// Escopos de cada tipo de sessão. A da marca não precisa mexer em usuário
// nenhum: ela só registra a propriedade e manda o sitemap.
const OAUTH_SCOPES_PRINCIPAL = [
  'https://www.googleapis.com/auth/analytics.manage.users',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/tagmanager.manage.users',
  'https://www.googleapis.com/auth/tagmanager.manage.accounts',
  'https://www.googleapis.com/auth/userinfo.email',
];
const OAUTH_SCOPES_MARCA = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/userinfo.email',
];
// Os logins de relatório (ADR-148) só leem: que contas do Analytics e que
// sites do Search Console aquele login enxerga.
const OAUTH_SCOPES_RELATORIO = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/tagmanager.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

ipcMain.handle('oauth:getConfig', () => {
  try {
    if (!fs.existsSync(oauthConfigPath())) return { ok: true, config: {} };
    return { ok: true, config: JSON.parse(fs.readFileSync(oauthConfigPath(), 'utf-8')) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('oauth:setConfig', (event, config) => {
  try {
    fs.writeFileSync(oauthConfigPath(), JSON.stringify(config, null, 2));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- Sessão do OAuth de usuário ----------
//
// Erro que só se resolve conectando de novo. Vale pra token ausente, expirado
// sem refresh, ou revogado do lado do Google.
class ReauthNeeded extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReauthNeeded';
    this.reauth = true;
  }
}

function readOauthToken(slot) {
  if (!fs.existsSync(oauthTokenPath(slot))) return null;
  try {
    return JSON.parse(fs.readFileSync(oauthTokenPath(slot), 'utf-8'));
  } catch (e) {
    return null;
  }
}

// Guarda o token preservando o refresh_token que já estava lá: o Google só
// devolve refresh_token na PRIMEIRA autorização de um client pra um usuário.
// Sobrescrever com o retorno cru de um segundo login apaga o que servia.
function saveOauthToken(tokens, extra = {}, slot) {
  const previous = readOauthToken(slot) || {};
  const merged = { ...previous, ...tokens, ...extra };
  if (!merged.refresh_token && previous.refresh_token) {
    merged.refresh_token = previous.refresh_token;
  }
  fs.writeFileSync(oauthTokenPath(slot), JSON.stringify(merged, null, 2));
  return merged;
}

function clearOauthToken(slot) {
  try {
    if (fs.existsSync(oauthTokenPath(slot))) fs.unlinkSync(oauthTokenPath(slot));
  } catch (e) {
    // se não der pra apagar, o status ainda vai reportar expirado
  }
}

// Uma sessão só é utilizável se tiver refresh_token (renova sozinha) ou se o
// access token ainda não venceu. Sem isso a tela dizia "Conectado" com um token
// morto, e o erro só aparecia na primeira chamada.
function oauthSessionState(token) {
  if (!token || !token.access_token) return { connected: false };
  if (token.refresh_token) return { connected: true, durable: true };
  const expiresAt = token.expiry_date || 0;
  // 60s de folga pra não entregar um token que vence no meio da chamada.
  if (expiresAt && expiresAt - 60000 > Date.now()) {
    return { connected: true, durable: false, expiresAt };
  }
  return { connected: false, expired: true };
}

// Monta o client OAuth do usuário já pronto pra uso, e falha cedo e claro
// quando a sessão não dá mais. Persiste o token renovado (o googleapis emite
// 'tokens' quando troca o access token usando o refresh).
function loadUserOauthClient(clientId, clientSecret, slot, { global = true } = {}) {
  if (!clientId || !clientSecret) {
    throw new Error('Configure o OAuth Client ID e o Client Secret nas configurações.');
  }

  const token = readOauthToken(slot);
  const session = oauthSessionState(token);
  const quem = slot ? `a conta de ${brandName(slot)}` : 'sua conta Google';

  if (!session.connected) {
    clearOauthToken(slot);
    throw new ReauthNeeded(
      session.expired
        ? `A sessão de ${quem} expirou. Conecte de novo nas configurações.`
        : `Conecte ${quem} primeiro.`
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials(token);
  oauth2Client.on('tokens', (fresh) => saveOauthToken(fresh, {}, slot));
  // A sessão da marca é usada em chamadas pontuais, no meio de um fluxo que
  // roda pela service account: trocar o auth global aqui sequestraria o resto.
  if (global) google.options({ auth: oauth2Client });
  return oauth2Client;
}

// Escopo que o login antigo não pediu. Diferente de sessão expirada: o token é
// válido, só não autoriza esta chamada. A saída é a mesma (reconectar), mas o
// motivo é outro e a mensagem precisa dizer qual, senão vira o mesmo tipo de
// diagnóstico ambíguo que a ADR-017 já custou caro.
function scopeFailureMessage(e) {
  const detalhe = e?.response?.data?.error_description || e?.response?.data?.error?.message || '';
  const texto = `${e?.message || ''} ${detalhe}`;
  const insuficiente =
    /ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(texto) ||
    /insufficient (authentication )?scopes?/i.test(texto) ||
    /request had insufficient authentication/i.test(texto);
  if (!insuficiente) return null;
  return (
    'Sua conexão com o Google é anterior a esta versão e não inclui as permissões do Tag Manager. ' +
    'Clique em "Desconectar" e conecte de novo, a tela de consentimento vai pedir as permissões novas.'
  );
}

// Traduz a falha de sessão pra algo acionável e apaga o token morto, pra tela
// parar de anunciar uma conexão que não existe mais.
function handleOauthFailure(e) {
  const detail = e?.response?.data?.error_description || e?.response?.data?.error || '';
  const text = `${e.message || ''} ${detail}`;

  const semSessao =
    e instanceof ReauthNeeded ||
    /no refresh token is set/i.test(text) ||
    /invalid_grant/i.test(text) ||
    /token has been expired or revoked/i.test(text) ||
    /invalid_rapt|reauth/i.test(text);

  if (!semSessao) return null;

  clearOauthToken();
  return {
    ok: false,
    reauth: true,
    error:
      e instanceof ReauthNeeded
        ? e.message
        : 'Sua sessão do Google expirou ou foi revogada. Clique em "Conectar com sua conta Google" pra entrar de novo.',
  };
}

ipcMain.handle('oauth:status', (event, arg) => {
  try {
    const slot = arg && arg.slot ? arg.slot : null;
    const token = readOauthToken(slot);
    const session = oauthSessionState(token);
    return {
      ok: true,
      connected: session.connected,
      durable: !!session.durable,
      expiresAt: session.expiresAt || null,
      email: token?.email || null,
      slot,
    };
  } catch (e) {
    return { ok: true, connected: false };
  }
});

// Status de todas as marcas de uma vez, a tela de configurações mostra as três.
ipcMain.handle('oauth:brandStatus', () => {
  const marcas = {};
  for (const slot of Object.keys(BRANDS)) {
    const token = readOauthToken(slot);
    const session = oauthSessionState(token);
    marcas[slot] = {
      connected: session.connected,
      durable: !!session.durable,
      email: token?.email || null,
      esperado: googleAccountFor(slot),
    };
  }
  // Os logins de relatório (ADR-148), um slot rel-N por e-mail configurado.
  const relatorio = contasRelatorio().map((email, i) => {
    const slot = `rel-${i + 1}`;
    const token = readOauthToken(slot);
    const session = oauthSessionState(token);
    return { slot, email, connected: session.connected, durable: !!session.durable, conectadoComo: token?.email || null };
  });
  return { ok: true, marcas, relatorio };
});

// Login em andamento (servidor local escutando o callback do Google). Fica aqui
// fora pra dar pra cancelar e pra não deixar dois logins concorrendo pela porta.
let pendingOauthLogin = null;

ipcMain.handle('oauth:cancelLogin', () => {
  if (pendingOauthLogin) pendingOauthLogin.cancel('Login cancelado.');
  return { ok: true };
});

ipcMain.handle('oauth:login', async (event, { clientId, clientSecret, slot }) => {
  const { shell } = require('electron');
  const http = require('http');

  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Configure o Client ID e o Client Secret nas configurações antes de conectar.' };
  }

  if (pendingOauthLogin) pendingOauthLogin.cancel('Login anterior descartado, comecei outro.');

  return new Promise((resolve) => {
    // O redirect_uri tem que ser idêntico no authUrl e na troca do código, e
    // server.address() vira null depois do close(), então guarda aqui.
    let redirectUri = null;
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      pendingOauthLogin = null;
      try { server.close(); } catch (_) {}
      resolve(result);
    }

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, redirectUri);
        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');

        if (error) {
          res.end('Login cancelado. Pode fechar essa aba.');
          finish({ ok: false, error: `Login cancelado: ${error}` });
          return;
        }
        if (!code) {
          res.end('Nenhum código recebido.');
          return;
        }

        res.end('Login concluído! Pode fechar essa aba e voltar pro Hub.');

        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        let email = null;
        try {
          const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
          const info = await oauth2.userinfo.get();
          email = info.data.email;
        } catch (e) {
          // segue sem o e-mail se essa chamada falhar
        }

        // Entrar com a conta errada aqui é pior que não entrar: as propriedades
        // iriam parar no Search Console de outra pessoa, e o sintoma seria
        // exatamente o que estamos consertando (ADR-049).
        if (slot) {
          const esperado = googleAccountFor(slot);
          if (!esperado) {
            finish({ ok: false, error: `${brandName(slot)} não tem conta do Google configurada, preencha o e-mail da marca antes de conectar.` });
            return;
          }
          if (!email) {
            finish({ ok: false, error: 'O Google não devolveu o e-mail desse login, então não dá para confirmar que é a conta certa. Tente de novo.' });
            return;
          }
          if (email.toLowerCase() !== esperado.toLowerCase()) {
            finish({
              ok: false,
              error: `Você entrou como ${email}, e ${brandName(slot)} usa ${esperado}. Não gravei essa sessão, ` +
                'entre de novo escolhendo a conta certa.',
            });
            return;
          }
        }

        const saved = saveOauthToken(tokens, { email }, slot);
        if (!saved.refresh_token) {
          // Acontece quando o Google já tinha consentimento gravado e não
          // reemite o refresh. A sessão funciona, mas morre em ~1h.
          finish({
            ok: true,
            email,
            slot: slot || null,
            durable: false,
            warning:
              'O Google não devolveu refresh token nesse login, a sessão vale só cerca de uma hora. ' +
              'Pra resolver de vez, remova o acesso do app em myaccount.google.com/permissions e conecte de novo.',
          });
          return;
        }
        finish({ ok: true, email, slot: slot || null, durable: true });
      } catch (e) {
        const detalhe = describeOauthError(e);
        try { res.end('Erro no login: ' + detalhe); } catch (_) {}
        finish({ ok: false, error: detalhe });
      }
    });

    pendingOauthLogin = { cancel: (motivo) => finish({ ok: false, error: motivo, canceled: true }) };

    server.on('error', (e) => finish({ ok: false, error: `Não consegui abrir a porta local: ${e.message}` }));

    server.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${server.address().port}`;
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      const authUrl = oauth2Client.generateAuthUrl({
        // 'offline' + prompt de consentimento é o que faz o Google emitir o
        // refresh token. Sem ele o access token vence em ~1h e a próxima
        // chamada morre com "No refresh token is set".
        access_type: 'offline',
        scope: ehSlotRelatorio(slot) ? OAUTH_SCOPES_RELATORIO : slot ? OAUTH_SCOPES_MARCA : OAUTH_SCOPES_PRINCIPAL,
        // 'consent' junto de 'select_account': sem forçar o consentimento o
        // Google pula a tela e devolve o login SEM refresh token.
        prompt: 'consent select_account',
      });
      // O link só existe depois que o servidor sobe (a porta entra no redirect_uri),
      // então manda pro renderer poder copiar e abrir no navegador certo.
      if (!event.sender.isDestroyed()) event.sender.send('oauth:url', authUrl);
      shell.openExternal(authUrl);
    });
  });
});

ipcMain.handle('oauth:logout', (event, arg) => {
  clearOauthToken(arg && arg.slot ? arg.slot : null);
  return { ok: true };
});

// Resolve os nomes das contas da marca em IDs numéricos, usando o token do
// usuário (a service account ainda não tem acesso nelas, é esse o problema
// que a ferramenta resolve, então não dá pra listar com ela).
ipcMain.handle('analytics:listBrandAccounts', async (event, { brand, clientId, clientSecret }) => {
  try {
    const matchesBrand = brandFilter(brand);
    loadUserOauthClient(clientId, clientSecret);

    const analyticsadmin = google.analyticsadmin('v1beta');
    const accounts = [];
    const vistas = [];
    let pageToken;
    do {
      const res = await analyticsadmin.accounts.list({ pageSize: 200, pageToken });
      for (const account of res.data.accounts || []) {
        vistas.push(account.displayName);
        if (!matchesBrand(account.displayName)) continue;
        accounts.push({ id: String(account.name).split('/').pop(), displayName: account.displayName });
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    // Sem isso, "nenhuma conta apareceu" é indistinguível de "o padrão não bate".
    const tokenAtual = readOauthToken();
    const identidadeLogin = tokenAtual?.email
      ? `a conta Google conectada (${tokenAtual.email})`
      : 'a conta Google conectada';
    const hint = accounts.length ? null : describeVisibleAccounts(vistas, identidadeLogin);
    return { ok: true, accounts, brand: brandName(brand), hint };
  } catch (e) {
    const sessao = handleOauthFailure(e);
    if (sessao) return sessao;

    const escopo = scopeFailureMessage(e);
    if (escopo) return { ok: false, reauth: true, error: escopo };
    return { ok: false, error: e.message };
  }
});

// Lista as contas do Tag Manager da marca usando o LOGIN do usuário, mesma
// razão do lado do Analytics: a service account não enxerga uma conta em que
// ainda não foi adicionada, que é justamente o que se quer resolver.
ipcMain.handle('tagmanager:listBrandAccounts', async (event, { brand, clientId, clientSecret }) => {
  try {
    // No Tag Manager o recorte das contas é outro (ADR-017): a mesma conta
    // atende Busca Cliente e MPI+.
    const matchesBrand = brandFilter(brand, 'gtm');
    loadUserOauthClient(clientId, clientSecret);

    const tagmanager = google.tagmanager('v2');
    const accounts = [];
    const vistas = [];
    let pageToken;
    do {
      const res = await tagmanager.accounts.list({ pageToken });
      for (const account of res.data.account || []) {
        vistas.push(account.name);
        if (!matchesBrand(account.name)) continue;
        accounts.push({
          id: String(account.accountId || String(account.path || '').split('/').pop()),
          displayName: account.name,
        });
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    const tokenAtual = readOauthToken();
    const identidadeLogin = tokenAtual?.email
      ? `a conta Google conectada (${tokenAtual.email})`
      : 'a conta Google conectada';
    const hint = accounts.length ? null : describeVisibleAccounts(vistas, identidadeLogin);
    return { ok: true, accounts, brand: brandName(brand), hint };
  } catch (e) {
    const sessao = handleOauthFailure(e);
    if (sessao) return sessao;
    const escopo = scopeFailureMessage(e);
    if (escopo) return { ok: false, reauth: true, error: escopo };
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('tagmanager:grantAccessBulk', async (event, { accountIds, role, clientId, clientSecret }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });

  try {
    const gConfig = fs.existsSync(googleConfigPath()) ? JSON.parse(fs.readFileSync(googleConfigPath(), 'utf-8')) : {};
    if (!gConfig.saPath || !fs.existsSync(gConfig.saPath)) {
      return { ok: false, error: 'Configure o caminho do JSON da service account primeiro.', log };
    }
    const saEmail = JSON.parse(fs.readFileSync(gConfig.saPath, 'utf-8')).client_email;
    if (!saEmail) {
      return { ok: false, error: 'Não achei "client_email" no arquivo da service account.', log };
    }
    push(`Concedendo acesso no Tag Manager para ${saEmail}`, 'info');

    loadUserOauthClient(clientId, clientSecret);
    const tagmanager = google.tagmanager('v2');

    const ids = (accountIds || []).map((s) => String(s).trim()).filter(Boolean);
    if (!ids.length) {
      return { ok: false, error: 'Nenhum ID de conta informado.', log };
    }

    // 'admin' é o padrão porque criar container exige Administrador no nível da
    // CONTA, permissão de container não basta.
    const permission = role || 'admin';
    let granted = 0;

    for (const id of ids) {
      try {
        push(`POST conceder acesso → accounts/${id} (${permission})`, 'cmd');
        await tagmanager.accounts.user_permissions.create({
          parent: `accounts/${id}`,
          requestBody: {
            emailAddress: saEmail,
            accountAccess: { permission },
          },
        });
        granted++;
        push(`Acesso concedido em accounts/${id}`, 'success');
      } catch (e) {
        // Sessão morta erra em todas as contas pelo mesmo motivo, para o laço.
        if (handleOauthFailure(e) || scopeFailureMessage(e)) throw e;
        push(`Falha em accounts/${id}: ${e.message}`, 'warn');
      }
    }

    return { ok: true, log, granted, total: ids.length };
  } catch (e) {
    const sessao = handleOauthFailure(e);
    if (sessao) {
      push(sessao.error, 'warn');
      return { ...sessao, log };
    }
    const escopo = scopeFailureMessage(e);
    if (escopo) {
      push(escopo, 'warn');
      return { ok: false, reauth: true, error: escopo, log };
    }
    push(`Erro: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

ipcMain.handle('analytics:grantAccessBulk', async (event, { accountIds, role, clientId, clientSecret }) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });

  try {
    const gConfig = fs.existsSync(googleConfigPath()) ? JSON.parse(fs.readFileSync(googleConfigPath(), 'utf-8')) : {};
    if (!gConfig.saPath || !fs.existsSync(gConfig.saPath)) {
      return { ok: false, error: 'Configure o caminho do JSON da service account primeiro.', log };
    }
    const saEmail = JSON.parse(fs.readFileSync(gConfig.saPath, 'utf-8')).client_email;
    if (!saEmail) {
      return { ok: false, error: 'Não achei "client_email" no arquivo da service account.', log };
    }
    push(`Concedendo acesso para ${saEmail}`, 'info');

    loadUserOauthClient(clientId, clientSecret);

    const analyticsadmin = google.analyticsadmin('v1alpha');
    const ids = (accountIds || []).map((s) => String(s).trim()).filter(Boolean);
    if (!ids.length) {
      return { ok: false, error: 'Nenhum ID de conta informado.', log };
    }

    let granted = 0;
    for (const id of ids) {
      try {
        push(`POST conceder acesso → accounts/${id}`, 'cmd');
        await analyticsadmin.accounts.accessBindings.create({
          parent: `accounts/${id}`,
          requestBody: { user: saEmail, roles: [role || 'predefinedRoles/admin'] },
        });
        granted++;
        push(`Acesso concedido em accounts/${id}`, 'success');
      } catch (e) {
        // Sessão morta erra em TODAS as contas restantes pelo mesmo motivo, // não adianta insistir 80 vezes pra mostrar o mesmo erro.
        if (handleOauthFailure(e)) throw e;
        push(`Falha em accounts/${id}: ${e.message}`, 'warn');
      }
    }

    return { ok: true, log, granted, total: ids.length };
  } catch (e) {
    const sessao = handleOauthFailure(e);
    if (sessao) {
      push(sessao.error, 'warn');
      return { ...sessao, log };
    }
    push(`Erro: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// ---------- Redesign v2.4 (ADR-115): telemetria, terminal, filas e auditoria ----------

// Memória e CPU de verdade, somando todos os processos do Electron (janela,
// GPU, utilitários). A CPU é a diferença desde a última leitura, como o
// Gerenciador de Tarefas faz; por isso a primeira leitura sai zero.
ipcMain.handle('sistema:telemetria', () => {
  try {
    const metricas = typeof app.getAppMetrics === 'function' ? app.getAppMetrics() : [];
    let memKb = 0;
    let cpu = 0;
    for (const m of metricas) {
      memKb += (m.memory && m.memory.workingSetSize) || 0;
      cpu += (m.cpu && m.cpu.percentCPUUsage) || 0;
    }
    if (!memKb) memKb = Math.round(process.memoryUsage().rss / 1024);
    const nucleos = Math.max(1, require('os').cpus().length);
    // percentCPUUsage é por núcleo (100 = um núcleo inteiro); normalizo para o
    // total da máquina, que é o número que a pessoa compara com o Windows.
    const cpuPct = Math.round((cpu / nucleos) * 10) / 10;
    return { ok: true, memMb: Math.round(memKb / 1024), cpuPct, processos: metricas.length, pid: process.pid };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Comando manual no terminal do Hub. Roda no shell do Windows, um por vez,
// e a saída vai chegando por evento, linha a linha, como num terminal de
// verdade. É para teste rápido (nslookup, ping, curl, git) sem sair do app.
let comandoAtual = null;
ipcMain.handle('terminal:executar', (event, { comando, id } = {}) => {
  const texto = String(comando || '').trim();
  if (!texto) return { ok: false, error: 'Comando vazio.' };
  if (comandoAtual) return { ok: false, error: 'Já tem um comando rodando. Espere terminar ou pare com "parar".' };
  const { spawn } = require('child_process');
  const cwd = require('os').homedir();
  let filho;
  try {
    filho = spawn(texto, { shell: true, cwd, windowsHide: true, env: process.env });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  comandoAtual = { id, filho, inicio: Date.now() };
  const enviar = (tipo, dados) => {
    if (event.sender.isDestroyed()) return;
    event.sender.send('terminal:saida', { id, tipo, texto: String(dados) });
  };
  // O Windows imprime na página de código do console (850/1252 no Brasil);
  // decodifico como latin1 quando não for UTF-8 válido, para acento não virar
  // interrogação.
  const decodificar = (buf) => {
    const utf8 = buf.toString('utf8');
    return utf8.includes('�') ? buf.toString('latin1') : utf8;
  };
  filho.stdout.on('data', (d) => enviar('stdout', decodificar(d)));
  filho.stderr.on('data', (d) => enviar('stderr', decodificar(d)));
  const limite = setTimeout(() => { enviar('stderr', 'Passou de 120 s; encerrando o comando.\n'); try { filho.kill(); } catch (e) {} }, 120000);
  filho.on('error', (e) => { clearTimeout(limite); comandoAtual = null; enviar('fim', JSON.stringify({ codigo: null, ms: 0, erro: e.message })); });
  filho.on('close', (codigo) => {
    clearTimeout(limite);
    const ms = Date.now() - (comandoAtual ? comandoAtual.inicio : Date.now());
    comandoAtual = null;
    enviar('fim', JSON.stringify({ codigo, ms }));
  });
  return { ok: true, pid: filho.pid };
});

// Abre um link no navegador padrão. Só http(s), e só para o que o Hub
// mesmo montou (o link da tarefa do Salesforce).
ipcMain.handle('sistema:abrirLink', (event, { url } = {}) => {
  try {
    const u = new URL(String(url || ''));
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: 'Só abro links http(s).' };
    require('electron').shell.openExternal(u.toString());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('terminal:parar', () => {
  if (!comandoAtual) return { ok: true, parou: false };
  try {
    if (process.platform === 'win32') require('child_process').spawn('taskkill', ['/pid', String(comandoAtual.filho.pid), '/T', '/F'], { windowsHide: true });
    else comandoAtual.filho.kill('SIGTERM');
  } catch (e) { /* já morreu */ }
  return { ok: true, parou: true };
});

// ---------- Git Bash dentro do Hub (ADR-128) ----------
// Um bash de verdade, o do Git for Windows, num pseudoterminal do próprio
// Windows (ConPTY, pelo node-pty): prompt colorido, setas, Tab, histórico e
// programas interativos, como o terminal do Antigravity. É outro terminal, ao
// lado do de atividade: aquele roda um comando por vez e mostra a saída como
// linhas do log; este é o shell inteiro. Um por janela, que morre com ela e
// com o Hub. O node-pty só carrega quando o bash abre.

// Onde está o bash.exe: nas pastas de instalação do Git (a do usuário, em
// AppData\Local\Programs, é a desta máquina) e, se não, ao lado do git do PATH.
function acharGitBash(env = process.env, existe = (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) {
  const candidatos = [];
  for (const base of [env.ProgramW6432, env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs')]) {
    if (base) candidatos.push(path.join(base, 'Git', 'bin', 'bash.exe'));
  }
  // O git do PATH mora em <Git>\cmd (ou <Git>\bin); o bash fica em <Git>\bin.
  for (const dir of String(env.PATH || env.Path || '').split(path.delimiter)) {
    const d = dir.trim().replace(/[\\/]+$/, '');
    if (/[\\/](cmd|bin)$/i.test(d) && existe(path.join(d, 'git.exe'))) candidatos.push(path.join(path.dirname(d), 'bin', 'bash.exe'));
  }
  return candidatos.find((p) => existe(p)) || null;
}

// O número de build do Windows, que o xterm.js usa para acertar a quebra de
// linha do ConPTY ao redimensionar.
const buildDoWindows = () => Number(String(require('os').release()).split('.')[2]) || 0;

const bashes = new Map(); // id do webContents -> { pty, shell, fila, timer, soltar }
function fecharBash(id) {
  const s = bashes.get(id);
  if (!s) return false;
  bashes.delete(id);
  if (s.timer) clearTimeout(s.timer);
  if (s.soltar) s.soltar();
  try { s.pty.kill(); } catch (e) { /* já tinha saído */ }
  return true;
}

ipcMain.handle('bash:abrir', (event, { cols, rows } = {}) => {
  const wc = event.sender;
  const ja = bashes.get(wc.id);
  // A página recarregou com o bash vivo: segue o mesmo, a saída nova vai para ela.
  if (ja) return { ok: true, jaAberto: true, shell: ja.shell, pid: ja.pty.pid, build: buildDoWindows() };
  const shell = acharGitBash();
  if (!shell) return { ok: false, error: 'Não achei o Git Bash nesta máquina. Instale o Git for Windows (git-scm.com) e abra de novo.' };
  let pty;
  try { pty = require('node-pty'); } catch (e) { return { ok: false, error: `o terminal não carregou (node-pty): ${e.message}` }; }
  const tam = (n, padrao) => (Number.isFinite(n) && n >= 2 && n <= 1000 ? Math.floor(n) : padrao);
  const cwd = require('os').homedir();
  const opcoes = {
    name: 'xterm-256color',
    cols: tam(cols, 80),
    rows: tam(rows, 24),
    cwd,
    // CHERE_INVOKING: o /etc/profile do Git fica na pasta em que abriu.
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', CHERE_INVOKING: '1', TERM_PROGRAM: 'hub' },
  };
  // O ConPTY que vem com o node-pty (o conpty.dll do Windows Terminal), não o
  // do Windows: com o do Windows, cada passo de redimensionar redesenhava a
  // tela e as linhas saíam duplicadas e picadas (ADR-129). Ele pergunta ao
  // terminal quem ele é (ESC [ c) e o xterm.js responde; sem resposta, espera
  // ~3 s. Sem o conpty.dll (ou com o caminho até ele passando dos 260
  // caracteres: erro 206), fica o do Windows, e a página avisa o motivo.
  let p;
  let conpty = 'node-pty';
  let conptyErro = '';
  try {
    try {
      p = pty.spawn(shell, ['--login', '-i'], { ...opcoes, useConptyDll: true });
    } catch (e) {
      conpty = 'windows';
      conptyErro = e.message;
      p = pty.spawn(shell, ['--login', '-i'], opcoes);
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const sessao = { pty: p, shell, fila: '', timer: null, soltar: null };
  bashes.set(wc.id, sessao);
  // A saída chega em rajadas de pedacinhos; junta por 8 ms para não mandar uma
  // mensagem para a janela a cada pedaço.
  const despejar = () => {
    sessao.timer = null;
    if (!sessao.fila) return;
    const dados = sessao.fila;
    sessao.fila = '';
    if (!wc.isDestroyed()) wc.send('bash:dados', dados);
  };
  p.onData((d) => {
    sessao.fila += d;
    if (!sessao.timer) sessao.timer = setTimeout(despejar, 8);
  });
  p.onExit(({ exitCode }) => {
    if (bashes.get(wc.id) !== sessao) return; // fechado pelo Hub: ninguém espera o aviso
    if (sessao.timer) { clearTimeout(sessao.timer); despejar(); }
    bashes.delete(wc.id);
    if (sessao.soltar) sessao.soltar();
    if (!wc.isDestroyed()) wc.send('bash:saiu', { codigo: exitCode });
  });
  const aoFecharJanela = () => fecharBash(wc.id);
  wc.once('destroyed', aoFecharJanela);
  sessao.soltar = () => { try { wc.removeListener('destroyed', aoFecharJanela); } catch (e) {} };
  return { ok: true, shell, pid: p.pid, cwd, build: buildDoWindows(), conpty, conptyErro };
});

// Cada tecla é uma chamada; a página não espera a volta (não atrasa a digitação).
ipcMain.handle('bash:escrever', (event, dados) => {
  const s = bashes.get(event.sender.id);
  if (!s || typeof dados !== 'string') return { ok: false };
  s.pty.write(dados);
  return { ok: true };
});
ipcMain.handle('bash:tamanho', (event, { cols, rows } = {}) => {
  const s = bashes.get(event.sender.id);
  if (!s || !(cols >= 2 && rows >= 2 && cols <= 1000 && rows <= 1000)) return { ok: false };
  try { s.pty.resize(Math.floor(cols), Math.floor(rows)); } catch (e) { return { ok: false }; /* saiu no meio */ }
  return { ok: true };
});
ipcMain.handle('bash:fechar', (event) => ({ ok: true, fechou: fecharBash(event.sender.id) }));
app.on('before-quit', () => { for (const id of [...bashes.keys()]) fecharBash(id); });

// As filas de Deploy do Salesforce (Group do tipo Queue) e as tarefas de cada
// uma, mais as suas. É o que a tela inicial lista e o Kanban movimenta.
// Colunas: "A fazer" é o status padrão da Tarefa, "Concluído" é o que tem
// IsClosed, e "Em andamento" é qualquer outro aberto. Os nomes reais vêm
// do TaskStatus da org, nunca de valor chutado aqui.
async function sfColunasDeStatus(sf) {
  const lista = await sf.consultar('SELECT MasterLabel, ApiName, IsClosed, IsDefault FROM TaskStatus ORDER BY SortOrder');
  const fechado = lista.find((s) => s.IsClosed) || null;
  const padrao = lista.find((s) => s.IsDefault && !s.IsClosed) || lista.find((s) => !s.IsClosed) || null;
  const andamento = lista.find((s) => !s.IsClosed && !s.IsDefault && /andamento|progress|execu/i.test(`${s.MasterLabel} ${s.ApiName}`))
    || lista.find((s) => !s.IsClosed && s.ApiName !== (padrao && padrao.ApiName)) || null;
  const colunaDe = (status) => {
    const s = lista.find((x) => x.ApiName === status || x.MasterLabel === status);
    if (s && s.IsClosed) return 'concluido';
    if (s && padrao && s.ApiName === padrao.ApiName) return 'afazer';
    if (!s) return 'afazer';
    return 'andamento';
  };
  return { lista, fechado, padrao, andamento, colunaDe };
}

const SF_CAMPOS_TAREFA_KANBAN = 'Id, Subject, Status, IsClosed, Priority, ActivityDate, OwnerId, Owner.Name, Owner.Type, WhatId, What.Name, What.Type, CreatedDate, CreatedById, CreatedBy.Name, LastModifiedDate, Description';

ipcMain.handle('salesforce:tarefas', async () => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  try {
    const saida = await sfComSessao(async (sf) => {
      const eu = await sf.identidade();
      const colunas = await sfColunasDeStatus(sf);
      push("SOQL filas de Deploy (Group WHERE Type = 'Queue')", 'cmd');
      const grupos = await sf.consultar("SELECT Id, Name, DeveloperName FROM Group WHERE Type = 'Queue' AND (Name LIKE '%Deploy%' OR Name LIKE '%Publica%')");
      // Só as filas das marcas que o Hub atende (Busca Cliente e MPI
      // Solutions). As outras (Ideal Marketing…) existem na org, mas não são
      // do Guilherme, então não entram na home nem no Kanban.
      const filas = grupos.map((g) => ({
        id: g.Id,
        nome: g.Name,
        marca: /busca/i.test(g.Name) ? 'bc' : /mpi/i.test(g.Name) ? 'mpisolutions' : null,
      })).filter((f) => f.marca);
      for (const g of grupos) if (!filas.some((f) => f.id === g.Id)) push(`Fila ignorada (não é de uma marca do Hub): ${g.Name}`, 'info');
      const donos = [eu.id, ...filas.map((f) => f.id)].map((id) => `'${escaparSoql(id)}'`).join(', ');
      push(`SOQL tarefas abertas de ${filas.length} fila(s) e suas`, 'cmd');
      const abertas = await sf.consultar(`SELECT ${SF_CAMPOS_TAREFA_KANBAN} FROM Task WHERE IsClosed = false AND OwnerId IN (${donos}) ORDER BY ActivityDate ASC NULLS LAST, CreatedDate DESC LIMIT 400`);
      push('SOQL tarefas concluídas nos últimos 7 dias', 'cmd');
      const fechadas = await sf.consultar(`SELECT ${SF_CAMPOS_TAREFA_KANBAN} FROM Task WHERE IsClosed = true AND OwnerId IN (${donos}) AND LastModifiedDate = LAST_N_DAYS:7 ORDER BY LastModifiedDate DESC LIMIT 200`);
      const mapear = (t) => ({
        id: t.Id,
        assunto: t.Subject || '(sem assunto)',
        status: t.Status,
        coluna: colunas.colunaDe(t.Status),
        fechada: !!t.IsClosed,
        prioridade: t.Priority || '',
        prazo: t.ActivityDate || null,
        donoId: t.OwnerId,
        dono: (t.Owner && t.Owner.Name) || '',
        donoTipo: (t.Owner && t.Owner.Type) || '',
        fila: filas.find((f) => f.id === t.OwnerId) ? t.OwnerId : null,
        relativo: (t.What && t.What.Name) || '',
        relativoTipo: (t.What && t.What.Type) || '',
        relativoId: t.WhatId || null,
        criada: t.CreatedDate,
        alterada: t.LastModifiedDate,
        // O comentário inteiro: é o que a tela da tarefa mostra (ADR-115).
        descricao: mascararSegredos(String(t.Description || '')),
        autor: (t.CreatedBy && t.CreatedBy.Name) || '',
        autorId: t.CreatedById || null,
        minha: t.OwnerId === eu.id,
      });
      const tarefas = [...abertas, ...fechadas].map(mapear);
      push(`${abertas.length} aberta(s), ${fechadas.length} concluída(s) na semana.`, 'success');
      return {
        eu: { id: eu.id, nome: eu.nome, email: eu.email },
        filas,
        tarefas,
        colunas: {
          afazer: colunas.padrao ? { api: colunas.padrao.ApiName, rotulo: colunas.padrao.MasterLabel } : null,
          andamento: colunas.andamento ? { api: colunas.andamento.ApiName, rotulo: colunas.andamento.MasterLabel } : null,
          concluido: colunas.fechado ? { api: colunas.fechado.ApiName, rotulo: colunas.fechado.MasterLabel } : null,
        },
        instancia: sf.instanceUrl,
      };
    });
    return { ok: true, log, ...saida };
  } catch (e) {
    push(`Salesforce: ${e.message}`, 'error');
    return { ok: false, error: e.message, precisaReconectar: !!(e && (e.sessaoInvalida || e.status === 403 || e.reauth)), log };
  }
});

// Indicadores da tela inicial (ADR-138): as SUAS tarefas (OwnerId = você) do
// último ano, com data de criação e de conclusão. Uma consulta só; quem corta
// por dia/semana/mês/ano é o renderer (lib/metricas.js), para trocar o período
// sem voltar ao Salesforce. CompletedDateTime quando a org tem; sem ele, a
// última modificação da tarefa fechada vale como conclusão.
ipcMain.handle('salesforce:metricas', async (event, { dias } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  const n = Math.max(1, Math.min(732, Number(dias) || 366));
  try {
    const saida = await sfComSessao(async (sf) => {
      const eu = await sfQuemSouEu(sf);
      const campos = (comConclusao) => `Id, Subject, IsClosed, Status, CreatedDate, LastModifiedDate${comConclusao ? ', CompletedDateTime' : ''}, OwnerId, Owner.Name, Owner.Type`;
      const where = `OwnerId = '${escaparSoql(eu.id)}' AND (CreatedDate = LAST_N_DAYS:${n} OR LastModifiedDate = LAST_N_DAYS:${n})`;
      push(`SOQL suas tarefas dos últimos ${n} dias (${eu.nome})`, 'cmd');
      let linhas;
      let comConclusao = true;
      try {
        linhas = await sf.consultar(`SELECT ${campos(true)} FROM Task WHERE ${where} ORDER BY CreatedDate DESC`, { maximo: 20000 });
      } catch (e) {
        if (e && e.sessaoInvalida) throw e;
        if (!/CompletedDateTime/i.test(String(e && e.message))) throw e;
        comConclusao = false;
        linhas = await sf.consultar(`SELECT ${campos(false)} FROM Task WHERE ${where} ORDER BY CreatedDate DESC`, { maximo: 20000 });
      }
      // Como o relatório "Done -- Deploy - BC / MPI" do painel do Salesforce
      // (ADR-143): concluída é só Status = Concluído (API "Completed"); a
      // fechada como Cancelada conta como criada e como fechada, mas não como
      // concluída — fica sem data de conclusão.
      const tarefas = linhas.map((t) => {
        const cancelada = /cancel/i.test(t.Status || '');
        return {
          id: t.Id,
          assunto: t.Subject || '',
          fechada: !!t.IsClosed,
          cancelada,
          status: t.Status || '',
          criada: t.CreatedDate,
          concluida: t.IsClosed && !cancelada ? (t.CompletedDateTime || t.LastModifiedDate) : null,
          dono: (t.Owner && t.Owner.Name) || '',
          donoTipo: (t.Owner && t.Owner.Type) || '',
          publicacao: /publica/i.test(t.Subject || ''),
        };
      });
      push(`${tarefas.length} tarefa(s) suas lidas${comConclusao ? '' : ' (a org não tem CompletedDateTime: conclusão = última modificação)'}.`, 'success');
      return { eu: { id: eu.id, nome: eu.nome }, tarefas, dias: n, comConclusao, agora: new Date().toISOString() };
    });
    return { ok: true, log, ...saida };
  } catch (e) {
    push(`Salesforce: ${e.message}`, 'error');
    return { ok: false, error: e.message, precisaReconectar: !!(e && (e.sessaoInvalida || e.status === 403 || e.reauth)), log };
  }
});

// Comparação antes/depois do Hub nas publicações MPI+ (ADR-146). SÓ LEITURA:
// uma SOQL das tarefas de publicação (qualquer dono, para a fila inteira servir
// de contexto) desde o começo do histórico, as mesmas regras do
// salesforce:metricas (Concluído, CompletedDateTime, cancelada fora) e a conta
// em lib/comparativo.js. Grava o resultado em docs/metricas/ (agregados e, para
// conferência, só datas e flags por tarefa — sem assunto nem comentário) e o
// devolve. Nada é alterado, comentado ou fechado no Salesforce.
ipcMain.handle('salesforce:comparativoMpiPlus', async (event, { corte, serieDesde, historicoDesde, salvarEm } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  const dataCorte = String(corte || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataCorte)) return { ok: false, error: 'Informe o corte como AAAA-MM-DD (o dia em que o Hub passou a publicar MPI+).', log };
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(historicoDesde || '')) ? historicoDesde : '2025-09-01';
  if (salvarEm !== undefined && (typeof salvarEm !== 'string' || !path.isAbsolute(salvarEm))) return { ok: false, error: 'salvarEm precisa ser uma pasta com caminho completo (ex.: C:\\Users\\eu\\Documentos).', log };
  try {
    const Comparativo = require(path.join(__dirname, 'lib', 'comparativo'));
    const saida = await sfComSessao(async (sf) => {
      const eu = await sfQuemSouEu(sf);
      const campos = (comConclusao) => `Id, Subject, Description, IsClosed, Status, CreatedDate, LastModifiedDate${comConclusao ? ', CompletedDateTime' : ''}, OwnerId, Owner.Name, Owner.Type, CreatedById`;
      // Qualquer dono: a concluída é de quem concluiu, a aberta é da fila.
      const where = `Subject LIKE '%ublica%' AND CreatedDate >= ${desde}T00:00:00Z`;
      push(`SOQL tarefas de publicação (qualquer dono) desde ${desde} — só leitura`, 'cmd');
      let linhas;
      let comConclusao = true;
      try {
        linhas = await sf.consultar(`SELECT ${campos(true)} FROM Task WHERE ${where} ORDER BY CreatedDate ASC`, { maximo: 20000 });
      } catch (e) {
        if (e && e.sessaoInvalida) throw e;
        if (!/CompletedDateTime/i.test(String(e && e.message))) throw e;
        comConclusao = false;
        linhas = await sf.consultar(`SELECT ${campos(false)} FROM Task WHERE ${where} ORDER BY CreatedDate ASC`, { maximo: 20000 });
      }
      const tarefas = linhas.map((t) => {
        const cancelada = /cancel/i.test(t.Status || '');
        return {
          id: t.Id, assunto: t.Subject || '', descricao: String(t.Description || ''), fechada: !!t.IsClosed, cancelada, status: t.Status || '',
          criada: t.CreatedDate, concluida: t.IsClosed && !cancelada ? (t.CompletedDateTime || t.LastModifiedDate) : null,
          donoId: t.OwnerId || '', donoTipo: (t.Owner && t.Owner.Type) || '', criadoPorId: t.CreatedById || '',
        };
      });
      push(`${tarefas.length} tarefa(s) de publicação lidas${comConclusao ? '' : ' (sem CompletedDateTime: conclusão = última modificação)'}.`, 'success');
      const r = Comparativo.comparar(tarefas, { corte: dataCorte, agora: new Date(), euId: eu.id, serieDesde: serieDesde || undefined });
      const resultado = { geradoEm: new Date().toISOString(), eu: { id: eu.id, nome: eu.nome }, corte: dataCorte, historicoDesde: desde, comConclusao, filtros: { soql: `SELECT ${campos(comConclusao)} FROM Task WHERE ${where} ORDER BY CreatedDate ASC`, concluida: "IsClosed = true AND Status <> Cancelada, pela CompletedDateTime", mpiplus: "assunto 'Publicação (Troca de DNS)…' e (MPI+ no assunto ou *.mpitemporario.com.br no comentário, exceto producao.)", sla: 'dias úteis criação→conclusão, fórmula do relatório "Done -- Deploy - BC / MPI" (ADR-143)', minhas: `OwnerId = ${eu.id}` }, ...r };
      // Onde gravar: a pasta pedida (salvarEm), senão docs/metricas do
      // repositório (quando o Hub roda do código), senão a pasta de dados do
      // app: o Hub instalado roda de dentro do app.asar, que é só leitura.
      const candidatos = [salvarEm, path.join(__dirname, 'docs', 'metricas'), path.join(app.getPath('userData'), 'metricas')].filter(Boolean);
      const nomeArquivo = `comparativo-mpiplus-${dataCorte}.json`;
      const texto = JSON.stringify(resultado, null, 2);
      for (const dir of candidatos) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          const destino = path.join(dir, nomeArquivo);
          fs.writeFileSync(destino, texto, 'utf-8');
          push(`Resultado gravado em ${destino}`, 'success');
          resultado.arquivo = destino;
          break;
        } catch (e) {
          push(`Não deu para gravar em ${dir} (${e.message}).`, 'warn');
        }
      }
      if (!resultado.arquivo) push('O resultado está só no retorno; passe { salvarEm: "C:\\\\pasta" } para gravar noutro lugar.', 'warn');
      return resultado;
    });
    return { ok: true, log, ...saida };
  } catch (e) {
    push(`Salesforce: ${e.message}`, 'error');
    return { ok: false, error: e.message, precisaReconectar: !!(e && (e.sessaoInvalida || e.status === 403 || e.reauth)), log };
  }
});

// Mover um cartão no Kanban = trocar o Status da tarefa para o valor real da
// coluna. Ir para "Em andamento" também assume a tarefa para você, porque
// tarefa em andamento numa fila sem dono é ninguém fazendo.
ipcMain.handle('salesforce:moverTarefa', async (event, { id, coluna } = {}) => {
  const log = [];
  const push = (message, type = 'info') => log.push({ message, type });
  if (!/^00T[a-zA-Z0-9]{12,15}$/.test(String(id || ''))) return { ok: false, error: 'Id de tarefa inválido.', log };
  if (!['afazer', 'andamento', 'concluido'].includes(coluna)) return { ok: false, error: 'Coluna desconhecida.', log };
  try {
    const saida = await sfComSessao(async (sf) => {
      const colunas = await sfColunasDeStatus(sf);
      const alvo = coluna === 'concluido' ? colunas.fechado : coluna === 'andamento' ? colunas.andamento : colunas.padrao;
      if (!alvo) throw new Error(`A org não tem um status de Tarefa para "${coluna}".`);
      const campos = { Status: alvo.ApiName };
      if (coluna === 'andamento') {
        const eu = await sf.identidade();
        campos.OwnerId = eu.id;
      }
      push(`PATCH Task ${id} -> ${alvo.MasterLabel}${campos.OwnerId ? ' (assumida por você)' : ''}`, 'cmd');
      await sf.atualizar('Task', id, campos);
      push(`Tarefa movida para ${alvo.MasterLabel}.`, 'success');
      return { status: alvo.ApiName, rotulo: alvo.MasterLabel, assumida: !!campos.OwnerId };
    });
    return { ok: true, log, ...saida };
  } catch (e) {
    push(`Salesforce: ${e.message}`, 'error');
    return { ok: false, error: e.message, log };
  }
});

// O que está configurado nesta máquina, sem revelar nada: só "tem" ou "não
// tem". É o painel de auditoria das Configurações.
ipcMain.handle('sistema:credenciais', () => {
  const tenta = (f, padrao) => { try { return f() || padrao; } catch (e) { return padrao; } };
  const gcfg = tenta(() => fs.existsSync(googleConfigPath()) ? JSON.parse(fs.readFileSync(googleConfigPath(), 'utf-8')) : null, {});
  const oauthCfg = tenta(() => readOauthConfigFile(), {});
  const msCfg = tenta(() => readMsConfig(), {});
  const msTok = tenta(() => readMsToken(), null);
  const sfTok = tenta(() => readSfToken(), null);
  const sfCfg = tenta(() => readSfConfig(), {});
  const bc = tenta(() => readEmpresaSegredos('bc'), {});
  const mpi = tenta(() => readEmpresaSegredos('mpisolutions'), {});
  const pub = tenta(() => readPublicacaoConfig(), {});
  const painel = tenta(() => readPainelCreds(), null);
  const doutor = tenta(() => readDoutorCreds(), null);
  const dnsHist = tenta(() => readDnsHistKey(), null);
  const item = (id, nome, ok, detalhe) => ({ id, nome, ok: !!ok, detalhe: detalhe || '' });
  return {
    ok: true,
    itens: [
      item('bitbucket', 'Bitbucket API', fs.existsSync(credsPath()), 'API Token gravado (DPAPI)'),
      item('google_sa', 'Google Service Account', gcfg.saPath && fs.existsSync(gcfg.saPath), gcfg.saPath ? path.basename(gcfg.saPath) : 'sem caminho'),
      item('google_oauth', 'Google OAuth Client', oauthCfg.clientId && oauthCfg.clientSecret, oauthCfg.clientId ? 'Client ID + Secret' : 'sem Client ID'),
      item('salesforce', 'Salesforce', sfTok && sfTok.access_token, sfTok && sfTok.access_token ? (sfTok.nome || sfTok.email || 'conectado') : (sfCfg.dominio ? 'domínio salvo, sem sessão' : 'não configurado')),
      item('microsoft', 'Microsoft Graph', msTok && (msTok.refresh_token || msTok.access_token), msTok ? (msTok.email || 'sessão ativa') : (msCfg.clientId ? 'app registrado, sem sessão' : 'sem registro no Azure')),
      item('cloudflare_bc', 'Cloudflare · Busca Cliente', bc.cloudflareToken, bc.cloudflareToken ? 'token gravado' : 'sem token'),
      item('cloudflare_mpi', 'Cloudflare · MPI Solutions', mpi.cloudflareToken, mpi.cloudflareToken ? 'token gravado' : 'sem token'),
      item('registrobr_bc', 'Registro.br · Busca Cliente', bc.registrobrUsuario && bc.registrobrSenha, bc.registrobrUsuario || 'sem login'),
      item('registrobr_mpi', 'Registro.br · MPI Solutions', mpi.registrobrUsuario && mpi.registrobrSenha, mpi.registrobrUsuario || 'sem login'),
      item('painel', 'Painel MPI+', painel && painel.email && painel.senha, painel && painel.email ? painel.email : 'sem login'),
      item('doutor', 'Painel /doutor', doutor && doutor.senha, doutor && doutor.emailMpi ? doutor.emailMpi : 'sem senha'),
      item('dnshist', 'Histórico de DNS (WhoisXML)', dnsHist, dnsHist ? 'chave gravada' : 'opcional'),
    ],
    hestia: {
      ip: pub.hestiaIpPublico || '',
      // O servidor de produção não é mais configurado: é o que o painel lista (ADR-140).
      servidor: 'o de produção que o painel lista',
    },
  };
});
