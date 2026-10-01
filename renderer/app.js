// ---------- Definição das ferramentas do hub ----------

const ICONS = {
  merge: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/>
    <path d="M6 8.5V15.5" stroke-linecap="round"/>
    <path d="M6 8.5c0 5 4 7.5 9.5 7.5" stroke-linecap="round"/>
  </svg>`,
  hub: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  newproject: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
    <path d="M17.5 14v7M14 17.5h7" stroke-linecap="round"/>
  </svg>`,
  findproject: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="10.5" cy="10.5" r="6.5"/>
    <path d="M15.5 15.5L21 21" stroke-linecap="round"/>
  </svg>`,
  search: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="10.5" cy="10.5" r="6.5"/>
    <path d="M15.5 15.5L21 21" stroke-linecap="round"/>
  </svg>`,
  plus: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
  </svg>`,
  publish: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 19V6" stroke-linecap="round"/>
    <path d="M7 11l5-5 5 5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 20h16" stroke-linecap="round"/>
  </svg>`,
  ssl: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="4" y="10.5" width="16" height="10" rx="1.5"/>
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke-linecap="round"/>
    <path d="M12 14.5v2.5" stroke-linecap="round"/>
  </svg>`,
  suspender: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="2.5" y="5" width="19" height="14" rx="2"/>
    <path d="M3 7l9 6 9-6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  historyBig: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" stroke-linecap="round"/>
    <path d="M3 4v4.5h4.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 7.5V12l3 1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  history: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" stroke-linecap="round"/>
    <path d="M3 4v4.5h4.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 7.5V12l3 1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  bulk: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M9.5 14.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-1 1" stroke-linecap="round"/>
    <path d="M14.5 9.5a3.5 3.5 0 0 0-5 0L7 12a3.5 3.5 0 0 0 5 5l1-1" stroke-linecap="round"/>
  </svg>`,
  grantaccess: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="8" cy="9" r="3.2"/>
    <path d="M3 20a5.5 5.5 0 0 1 10 0" stroke-linecap="round"/>
    <path d="M17 11v6M14 14h6" stroke-linecap="round"/>
  </svg>`,
};

// A categoria define a cor da ferramenta no hub (git = violeta, deploy = verde, google = azul).
const TOOLS = [
  { id: 'merge', category: 'git', name: 'Mergear PRs', desc: 'Cola o link do PR do Bitbucket, confere aprovações e build, e mergeia.' },
  { id: 'newproject', category: 'google', name: 'Criar propriedades', desc: 'Cria (ou reaproveita) Analytics, Tag Manager, reCAPTCHA e Search Console, e publica: commit do geral.php ou painel MPI+.' },
  { id: 'findproject', category: 'google', name: 'Buscar propriedades', desc: 'Para reformulações: acha o Analytics e o Tag Manager que o cliente já tem, com o ID pronto para copiar.' },
  { id: 'grantaccess', category: 'google', name: 'Conceder acesso', desc: 'Dá acesso da service account em várias contas do Analytics ou do Tag Manager de uma vez.' },
  { id: 'bulk', category: 'google', name: 'Publicar em massa', desc: 'Planilha de sites da MPI+: publica quem ainda não foi publicado e vincula todos, reaproveitando o que já existe no Google e criando o que faltar.' },
  { id: 'publish', category: 'google', name: 'Publicar MPI+', desc: 'Do DNS às tags: zona na Cloudflare, nameservers, aprovar, publicar em produção, SSL e propriedades.' },
  { id: 'ssl', category: 'hosting', name: 'Ativar SSL', desc: 'Confere onde cada domínio está hospedado e pede a ativação do SSL de quem é da M3.' },
  { id: 'suspender', category: 'hosting', name: 'Suspender sites', desc: 'Confere onde cada domínio está hospedado e envia o pedido de suspensão de quem é da M3.' },
  { id: 'doutor', category: 'hosting', name: 'Bloquear contatos', desc: 'Entra no /doutor do site com a credencial da marca e bloqueia os contatos da empresa (o telefone vira ##).' },
  { id: 'ouvidoria', category: 'hosting', name: 'Ouvidoria / SSL', desc: 'Planilha de domínios: acha a conta no Salesforce, lê o caso de Ouvidoria (Definição e Data de Conclusão) e devolve a Situação e se deve ativar o SSL.' },
  { id: 'quando', category: 'hosting', name: 'Quando publicou', desc: 'Lista de domínios: a data de publicação pela tarefa concluída no Salesforce ou, sem ela, pelo commit do geral.php / client.inc.php no Bitbucket.' },
];

function toolCategory(id) {
  return TOOLS.find((t) => t.id === id)?.category || 'git';
}

// Cada projeto é de uma marca, e cada marca mora em contas do Google diferentes.
// Quem sabe em quais contas é o main.js, aqui só os rótulos do seletor.
const BRANDS = [
  { id: 'bc', name: 'Busca Cliente' },
  // idProjetoBusca fixo: projeto de MPI Solutions é sempre o painel 39, então o
  // campo nem aparece (ADR-034). Sem a chave, a marca pergunta.
  { id: 'mpisolutions', name: 'MPI Solutions', idProjetoBusca: '39' },
  // A MPI+ não tem repositório no Bitbucket (ADR-033) nem painel do cliente
  // (ADR-036): o projeto dela não passa por nenhum dos dois.
  // Em vez do commit, o projeto dela é sincronizado no painel MPI+ (ADR-036), // e o link do projeto é colado na tela, não descoberto.
  { id: 'mpiplus', name: 'MPI+', bitbucket: false, semPainel: true, painelMpi: true },
];

// Valor fixo de $idProjetoBusca da marca, ou '' quando ela pergunta.
function fixedPanelId(id) {
  const b = BRANDS.find((x) => x.id === id);
  return (b && b.idProjetoBusca) || '';
}

// Marca em que $idProjetoBusca não existe. Diferente de "pergunta e ficou
// vazio": aqui não há o que preencher, então nem campo nem aviso.
function brandHasPanel(id) {
  const b = BRANDS.find((x) => x.id === id);
  return !b || b.semPainel !== true;
}

// Marca cujo projeto é sincronizado no painel MPI+ em vez de commitado.
function brandUsesMpiPanel(id) {
  return BRANDS.find((x) => x.id === id)?.painelMpi === true;
}

const PAINEL_MPI_HOST = 'idealplus.idealtrends.io';

// Aceita o link inteiro que você copia da barra de endereços. Devolve '' quando
// não é do painel, endereço errado aqui viraria automação clicando no lugar
// errado, que é pior que não rodar.
function normalizePainelUrl(valor) {
  const bruto = String(valor || '').trim();
  if (!bruto) return '';
  try {
    const u = new URL(bruto.startsWith('http') ? bruto : `https://${bruto}`);
    if (u.hostname !== PAINEL_MPI_HOST) return '';
    return u.toString();
  } catch (e) {
    return '';
  }
}

function brandHasBitbucket(id) {
  const b = BRANDS.find((x) => x.id === id);
  return !b || b.bitbucket !== false;
}

function brandName(id) {
  return BRANDS.find((b) => b.id === id)?.name || id;
}

function brandSelectHtml(selectId) {
  return `
    <label class="field">
      <span>Projeto</span>
      <select id="${selectId}" class="brand-select" data-brand="${state.brand}">
        ${BRANDS.map((b) => `<option value="${b.id}" ${state.brand === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
      </select>
    </label>`;
}

function wireBrandSelect(selectId, onChange) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.addEventListener('change', async () => {
    state.brand = sel.value;
    sel.dataset.brand = sel.value;
    await saveHubState();
    if (onChange) onChange();
  });
}

// ---------- Estado ----------

const state = {
  view: 'home', // 'home' | 'merge' | 'deploy' | 'newproject'
  recents: [],
  creds: null,
  strategy: 'merge_commit',
  closeSourceBranch: true,
  queue: [], // fila de PRs da ferramenta "merge"
  mergeMode: 'queue', // 'queue' | 'history', abas da ferramenta "Mergear PRs"
  history: [], // merges já feitos, com o trecho do terminal de cada um
  historyFilter: '',
  googleSaPath: '', // caminho do JSON da service account
  googleOwnerEmail: '', // conta humana que recebe acesso aos containers criados
  // A conta do Google de cada marca (ADR-035): recebe o container do Tag Manager
  // e a posse da propriedade do Search Console. Era só do Search Console, e por
  // isso o container ia parar na conta errada.
  brandAccounts: { bc: '', mpisolutions: '', mpiplus: '' },
  bitbucketWorkspace: '', // padrão, quando a marca não tem workspace própria
  // Workspace do Bitbucket por marca (ADR-032): busca-clientes e mpi-solutions
  // são workspaces diferentes, e o repositório de um projeto só existe na sua.
  bitbucketWorkspaces: { bc: '', mpisolutions: '' },
  brand: 'bc', // marca do projeto, decide em quais contas do Google mexer
  npAutoCommit: true, // commitar o geral.php logo depois de criar as propriedades
  // Painel do cliente ($idProjetoBusca). De propósito fora do hub-state: é de um
  // projeto só, e reaparecer preenchido no próximo seria erro silencioso.
  npPanelId: '',
  // Link do projeto no painel MPI+. Também fora do hub-state: é de um projeto só.
  npPainelUrl: '',
  // Razão social do projeto, só para a linha da planilha de publicações.
  npRazao: '',
  // O que a aba "Criar novo" vai criar. Tudo marcado por padrão: o caso comum
  // é projeto novo, que precisa das quatro coisas.
  npSteps: { analytics: true, gtm: true, recaptcha: true, searchconsole: true },
  // Publicar em massa: criar a tarefa "Publicação V1 -> V2" no Salesforce de
  // cada site publicado, achando o caso sozinho (ADR-097). Lembrado.
  sfTarefasAuto: false,
  npFind: null, // resultado da busca por propriedades existentes
  npPicked: { idAnalytics: '', tagmanager: '' }, // o que foi escolhido pra reaproveitar
  oauthClientId: '', // credenciais do login manual (ferramenta "Conceder acesso")
  oauthClientSecret: '',
  grantTarget: 'analytics', // 'analytics' | 'tagmanager', onde conceder acesso
  oauth: { connected: false, email: null, durable: false, expiresAt: null },
  ms: { connected: false, email: null }, // conta Microsoft, pra enviar e-mail
  msPending: null,
  msClientId: '',
  msTenant: '',
  mail: null, // destinatários e modelos da ferramenta de suspensão
  mailSsl: null, // idem, da ativação de SSL (ADR-057)
  // Para quem vai o e-mail de vhost da publicação Busca One automática
  // (ADR-132): { to, cc }. Editado no painel da automação; os modelos de
  // assunto e corpo são fixos, em lib/busca-one.js.
  mailVhost: null,
  sslProjeto: 'Busca Cliente', // vira {projeto} no assunto da ativação de SSL
  oauthPending: null, // { url } enquanto o login está aberto esperando o callback
};

const el = {
  navList: document.getElementById('navList'),
  // Redesign v2.4 (ADR-115)
  tbCpu: document.getElementById('tbCpu'),
  tbUserInicial: document.getElementById('tbUserInicial'),
  navOnline: document.getElementById('navOnline'),
  terminalMeta: document.getElementById('terminalMeta'),
  copyLogBtn: document.getElementById('copyLogBtn'),
  termAtalhos: document.getElementById('termAtalhos'),
  termInput: document.getElementById('termInput'),
  termRun: document.getElementById('termRun'),
  termPrompt: document.getElementById('termPrompt'),
  settingsHost: document.getElementById('settingsHost'),
  cfgTabs: document.getElementById('cfgTabs'),
  tbUserNome: document.getElementById('tbUserNome'),
  tbUserMarca: document.getElementById('tbUserMarca'),
  tbMem: document.getElementById('tbMem'),
  tbSearch: document.getElementById('tbSearch'),
  terminalTitle: document.getElementById('terminalTitle'),
  leftPanel: document.getElementById('leftPanel'),
  terminal: document.getElementById('terminal'),
  terminalPanel: document.querySelector('.terminal-panel'),
  terminalStatus: document.getElementById('terminalStatus'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  emailInput: document.getElementById('emailInput'),
  tokenInput: document.getElementById('tokenInput'),
  strategySelect: document.getElementById('strategySelect'),
  closeBranchInput: document.getElementById('closeBranchInput'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
  clearCredsBtn: document.getElementById('clearCredsBtn'),
  googleSaPathInput: document.getElementById('googleSaPathInput'),
  googleOwnerEmailInput: document.getElementById('googleOwnerEmailInput'),
  bitbucketWorkspaceInput: document.getElementById('bitbucketWorkspaceInput'),
  wsBcInput: document.getElementById('wsBcInput'),
  wsMpiSolutionsInput: document.getElementById('wsMpiSolutionsInput'),
  brandOauthList: document.getElementById('brandOauthList'),
  oauthClientIdInput: document.getElementById('oauthClientIdInput'),
  oauthClientSecretInput: document.getElementById('oauthClientSecretInput'),
  msClientIdInput: document.getElementById('msClientIdInput'),
  msTenantInput: document.getElementById('msTenantInput'),
  dnsHistKeyInput: document.getElementById('dnsHistKeyInput'),
  pubIpInput: document.getElementById('pubIpInput'),
  planilhaUrlInput: document.getElementById('planilhaUrlInput'),
  desenvolvedorInput: document.getElementById('desenvolvedorInput'),
  sfDominioInput: document.getElementById('sfDominioInput'),
  sfAssuntoInput: document.getElementById('sfAssuntoInput'),
  sfComentarioInput: document.getElementById('sfComentarioInput'),
  sfTextoFeedInput: document.getElementById('sfTextoFeedInput'),
  pubServidorSelect: document.getElementById('pubServidorSelect'),
  cfTokenBcInput: document.getElementById('cfTokenBcInput'),
  cfAccountBcInput: document.getElementById('cfAccountBcInput'),
  rbrUserBcInput: document.getElementById('rbrUserBcInput'),
  rbrSenhaBcInput: document.getElementById('rbrSenhaBcInput'),
  cfTokenMpiInput: document.getElementById('cfTokenMpiInput'),
  cfAccountMpiInput: document.getElementById('cfAccountMpiInput'),
  rbrUserMpiInput: document.getElementById('rbrUserMpiInput'),
  rbrSenhaMpiInput: document.getElementById('rbrSenhaMpiInput'),
  painelEmailInput: document.getElementById('painelEmailInput'),
  painelSenhaInput: document.getElementById('painelSenhaInput'),
  doutorEmailMpiInput: document.getElementById('doutorEmailMpiInput'),
  doutorEmailBuscaInput: document.getElementById('doutorEmailBuscaInput'),
  doutorSenhaInput: document.getElementById('doutorSenhaInput'),
  brandAccountBcInput: document.getElementById('brandAccountBcInput'),
  brandAccountMpiSolutionsInput: document.getElementById('brandAccountMpiSolutionsInput'),
  brandAccountMpiPlusInput: document.getElementById('brandAccountMpiPlusInput'),
};

// ---------- Terminal / log ----------

// Um glifo por tipo, pra dar pra varrer a coluna da esquerda sem ler o texto.
// Caracteres tipográficos, não emoji, o app inteiro usa ícone, não figurinha.
const LOG_GLYPH = { cmd: '>', success: 'ok', warn: '!', error: 'x', info: '·' };

// Buffer do que o terminal mostrou, pra dar pra recortar o trecho de uma
// operação depois (o histórico de merges guarda esse recorte). O `seq` é
// monotônico de propósito: índice de array não serve, porque o buffer descarta
// as linhas mais velhas e os índices andariam.
const LOG_BUFFER_MAX = 3000;
const logBuffer = [];
let logSeq = 0;

// A tela guarda só as últimas linhas (ADR-109). Com tudo, a janela crescia
// ~13 MB por mil linhas e cada log() ficava um pouco mais lento a cada linha,
// por quantos dias o Hub ficasse aberto. O arquivo do dia em
// Documentos\Hub\logs guarda tudo (ADR-096), e o buffer acima já parava aqui.
// O corte é em lote: a tela vai até LOG_TELA_MAX + LOG_TELA_FOLGA e volta a
// LOG_TELA_MAX de uma vez. Tirar uma linha do topo a cada log() obriga o
// Chromium a reposicionar todas as de baixo e triplicava o custo de cada
// linha (33 ms contra 12 ms, com 3.000 na tela).
const LOG_TELA_MAX = LOG_BUFFER_MAX;
const LOG_TELA_FOLGA = 300;
const LOG_AVISO_CORTE = 'As linhas mais antigas saíram da tela para ela não ficar lenta. O arquivo do dia, em Documentos\\Hub\\logs, tem todas.';

function logLineElement(entry) {
  const line = document.createElement('div');
  line.className = `log-line ${entry.type}`;
  line.innerHTML =
    `<span class="log-glyph">${LOG_GLYPH[entry.type] || LOG_GLYPH.info}</span>` +
    `<span class="ts">${escapeHtml(entry.ts)}</span>` +
    `<span class="log-msg">${escapeHtml(entry.message)}</span>`;
  return line;
}

// Tira do começo do terminal o que passou do limite e deixa no topo uma linha
// dizendo onde está o resto. Pergunta ainda sem resposta nunca sai: é por ela
// que a rodada está esperando (ADR-064).
function apararTerminal() {
  const t = el.terminal;
  if (t.childElementCount <= LOG_TELA_MAX + LOG_TELA_FOLGA) return;
  let aviso = t.firstElementChild;
  if (!aviso.classList.contains('log-cortado')) {
    aviso = document.createElement('div');
    aviso.className = 'log-line info log-cortado';
    aviso.innerHTML =
      `<span class="log-glyph">${LOG_GLYPH.info}</span>` +
      `<span class="ts"></span>` +
      `<span class="log-msg">${escapeHtml(LOG_AVISO_CORTE)}</span>`;
    t.insertBefore(aviso, t.firstElementChild);
  }
  // O excesso é contado uma vez: childElementCount percorre os filhos, e
  // perguntar a cada volta deixaria um corte grande quadrático.
  let sobra = t.childElementCount - 1 - LOG_TELA_MAX;
  let linha = aviso.nextElementSibling;
  while (linha && sobra > 0) {
    const proxima = linha.nextElementSibling;
    if (!linha.classList.contains('ask') || linha.classList.contains('answered')) {
      linha.remove();
      sobra--;
    }
    linha = proxima;
  }
}

function log(message, type = 'info') {
  const entry = {
    seq: ++logSeq,
    ts: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
    message: String(message),
    type,
  };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
  logParaArquivo(entry);

  el.terminal.appendChild(logLineElement(entry));
  apararTerminal();
  el.terminal.scrollTop = el.terminal.scrollHeight;
  // Com a Atividade minimizada ou fechada, conta o que chegou (ADR-128).
  if (typeof avisarLinhaNova === 'function') avisarLinhaNova(type);
}

// Tudo que aparece no terminal vai também para Documentos\Hub\logs, um arquivo
// por dia. Se o Windows fechar o Hub de madrugada, o que aconteceu até ali
// fica gravado (ADR-096). Junta as linhas por meio segundo para não abrir o
// arquivo a cada linha.
const logFilaArquivo = [];
let logArquivoTimer = null;
function logParaArquivo(entry) {
  logFilaArquivo.push({ ts: `${new Date().toLocaleDateString('pt-BR')} ${entry.ts}`, type: entry.type, message: entry.message });
  if (logArquivoTimer) return;
  logArquivoTimer = setTimeout(() => {
    logArquivoTimer = null;
    const linhas = logFilaArquivo.splice(0, logFilaArquivo.length);
    if (linhas.length && window.api && window.api.gravarLog) window.api.gravarLog(linhas).catch(() => {});
  }, 500);
}

// Uma pergunta dentro do terminal, com botões (ADR-064). Devolve a opção
// escolhida. É para o que o app não consegue descobrir sozinho e não pode
// chutar: a pergunta fica na linha do tempo, com a resposta logo abaixo.
// ----- Parar no meio (ADR-102) -----
// O botão "Parar" liga isto, avisa o processo principal (que interrompe as
// esperas e as janelas do painel) e fecha as perguntas abertas no terminal.
// Quem rodava termina de parar e desliga no fim (pararTerminou).
let paradaAgora = false;
const perguntasAbertas = new Set(); // funções que fecham uma pergunta aberta
const ehParada = (e) => /parado por você/i.test(String((e && e.message) || e || ''));

async function pararAgora() {
  if (paradaAgora) return;
  paradaAgora = true;
  log('Parando: o que está no meio é interrompido; uma gravação que já saiu (um registro na Cloudflare, por exemplo) termina, mas o passo seguinte não começa.', 'warn');
  for (const fechar of [...perguntasAbertas]) fechar();
  perguntasAbertas.clear();
  try { await window.api.pararProcesso(); } catch (e) {}
}

async function pararTerminou() {
  if (!paradaAgora) return;
  paradaAgora = false;
  try { await window.api.liberarProcesso(); } catch (e) {}
}

// Espera da tela que a parada interrompe.
function esperarOuParar(ms) {
  if (paradaAgora) return Promise.reject(new Error('parado por você'));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { perguntasAbertas.delete(fechar); resolve(); }, ms);
    const fechar = () => { clearTimeout(t); reject(new Error('parado por você')); };
    perguntasAbertas.add(fechar);
  });
}

function perguntarNoTerminal(mensagem, opcoes) {
  return new Promise((resolve, reject) => {
    if (paradaAgora) { reject(new Error('parado por você')); return; }
    // A rodada espera esta resposta: a Atividade escondida volta (ADR-128).
    if (typeof mostrarAtividade === 'function') mostrarAtividade();
    const line = document.createElement('div');
    line.className = 'log-line ask';
    const ts = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.innerHTML =
      `<span class="log-glyph">?</span>` +
      `<span class="ts">${escapeHtml(ts)}</span>` +
      `<span class="log-msg">${escapeHtml(mensagem)}<span class="ask-opcoes">` +
      opcoes.map((o) => `<button class="btn compact" data-ask="${escapeHtml(o.valor)}">${escapeHtml(o.rotulo)}</button>`).join('') +
      `</span></span>`;
    el.terminal.appendChild(line);
    apararTerminal();
    el.terminal.scrollTop = el.terminal.scrollHeight;
    const fechar = () => {
      line.querySelectorAll('[data-ask]').forEach((x) => { x.disabled = true; });
      line.classList.add('answered');
      reject(new Error('parado por você'));
    };
    perguntasAbertas.add(fechar);
    line.querySelectorAll('[data-ask]').forEach((b) => {
      b.addEventListener('click', () => {
        perguntasAbertas.delete(fechar);
        line.querySelectorAll('[data-ask]').forEach((x) => { x.disabled = true; });
        line.classList.add('answered');
        const escolhida = opcoes.find((o) => o.valor === b.dataset.ask);
        log(`Resposta: ${escolhida ? escolhida.rotulo : b.dataset.ask}`, 'info');
        resolve(b.dataset.ask);
      });
    });
  });
}

// Pergunta com resposta escrita, no terminal (o link do painel quando o Hub
// não acha o cliente, ADR-098). validar(texto) devolve '' quando serve, ou o
// motivo, que aparece embaixo do campo sem fechar a pergunta. Devolve o texto,
// ou null quando a pessoa cancela.
function perguntarTextoNoTerminal(mensagem, { placeholder = '', rotuloOk = 'Usar', validar = () => '' } = {}) {
  return new Promise((resolve) => {
    if (typeof mostrarAtividade === 'function') mostrarAtividade();
    const line = document.createElement('div');
    line.className = 'log-line ask';
    const ts = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    line.innerHTML =
      `<span class="log-glyph">?</span>` +
      `<span class="ts">${escapeHtml(ts)}</span>` +
      `<span class="log-msg">${escapeHtml(mensagem)}` +
      `<span class="ask-texto"><input type="text" placeholder="${escapeHtml(placeholder)}" autocomplete="off" spellcheck="false" />` +
      `<button class="btn compact primary" data-ask="ok">${escapeHtml(rotuloOk)}</button>` +
      `<button class="btn compact" data-ask="cancelar">Cancelar</button></span>` +
      `<span class="ask-erro" hidden></span></span>`;
    el.terminal.appendChild(line);
    apararTerminal();
    el.terminal.scrollTop = el.terminal.scrollHeight;
    const input = line.querySelector('input');
    const erro = line.querySelector('.ask-erro');
    if (paradaAgora) { resolve(null); return; }
    const fechar = (valor) => {
      perguntasAbertas.delete(aoParar);
      line.querySelectorAll('button, input').forEach((x) => { x.disabled = true; });
      line.classList.add('answered');
      resolve(valor);
    };
    const aoParar = () => fechar(null);
    perguntasAbertas.add(aoParar);
    const confirmar = () => {
      const texto = input.value.trim();
      const motivo = validar(texto);
      if (motivo) { erro.textContent = motivo; erro.hidden = false; input.focus(); return; }
      log(`Resposta: ${texto}`, 'info');
      fechar(texto);
    };
    line.querySelector('[data-ask="ok"]').addEventListener('click', confirmar);
    line.querySelector('[data-ask="cancelar"]').addEventListener('click', () => { log('Resposta: cancelado', 'info'); fechar(null); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmar(); });
    setTimeout(() => input.focus(), 0);
  });
}

// Marca o ponto atual do terminal; logSince(marca) devolve tudo que saiu
// depois. "Limpar" apaga a tela, não o buffer, o recorte continua íntegro.
function logMark() {
  return logSeq;
}

function logSince(mark) {
  return logBuffer
    .filter((e) => e.seq > mark)
    .map(({ ts, message, type }) => ({ ts, message, type }));
}

// Indicador de "tem coisa rodando" no cabeçalho do terminal. Conta chamadas
// aninhadas (criar propriedades já dispara o commit por dentro), então só
// volta pra "ocioso" quando a última terminar.
let busyDepth = 0;

function setBusy(label) {
  busyDepth++;
  el.terminalPanel.classList.add('busy');
  el.terminalStatus.textContent = label;
}

function clearBusy() {
  busyDepth = Math.max(0, busyDepth - 1);
  if (busyDepth > 0) return;
  el.terminalPanel.classList.remove('busy');
  el.terminalStatus.textContent = 'ocioso';
}

// Envolve uma operação assíncrona no indicador sem repetir try/finally.
async function withBusy(label, fn) {
  setBusy(label);
  try {
    return await fn();
  } finally {
    clearBusy();
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- Roteamento ----------

function goHome() {
  state.view = 'home';
  render();
}

function saveHubState() {
  return window.api.setHubState({
    recents: state.recents,
    bitbucketWorkspace: state.bitbucketWorkspace,
    bitbucketWorkspaces: state.bitbucketWorkspaces,
    brand: state.brand,
    mail: state.mail,
    mailSsl: state.mailSsl,
    mailVhost: state.mailVhost,
    sslProjeto: state.sslProjeto,
    npSteps: state.npSteps,
    sfTarefasAuto: state.sfTarefasAuto,
  });
}

async function openTool(id) {
  if (id === 'findproject') { state.npTab = 'find'; id = 'newproject'; }
  if (id === 'grantaccess') { openSettings('acesso'); return; }
  if (id === 'newproject' && !state.npTab) state.npTab = 'create';
  state.view = id;
  state.recents = [id, ...state.recents.filter((r) => r !== id)].slice(0, 4);
  await saveHubState();
  render();
}

function render() {
  // As configurações moram num nó fixo (ids e listeners não se perdem);
  // antes de qualquer tela sobrescrever o painel, ele volta para o esconderijo.
  guardarSettingsBox();
  el.leftPanel.classList.toggle('wide', state.view === 'home' || state.view === 'kanban' || state.view === 'config');
  document.querySelector('.app-body')?.classList.toggle('home', state.view === 'home');
  renderChrome();
  // Os atalhos leem os campos da tela nova, então esperam ela existir.
  queueMicrotask(renderAtalhosTerminal);
  if (state.view === 'home') { renderHome(); return; }
  if (state.view === 'kanban') { renderKanbanTool(); return; }
  if (state.view === 'config') { renderConfigTool(); return; }
  if (state.view === 'merge') renderMergeTool();
  if (state.view === 'newproject') renderNewProjectTool();
  if (state.view === 'findproject') { state.view = 'newproject'; state.npTab = 'find'; renderNewProjectTool(); }
  if (state.view === 'grantaccess') { openSettings('acesso'); return; }
  if (state.view === 'suspender') renderSuspendTool();
  if (state.view === 'ssl') renderSuspendTool();
  if (state.view === 'publish') renderPublishTool();
  if (state.view === 'bulk') renderBulkTool();
  if (state.view === 'doutor') renderDoutorTool();
  if (state.view === 'ouvidoria') renderOuvidoriaTool();
  if (state.view === 'quando') renderQuandoTool();
}

// ---------- Moldura v2.4: sidebar de módulos + topo + rodapé (ADR-114) ----------

const NAV_ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  deploy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19l3-3M12 3s5 2 5 8c0 3-2 6-2 6l-5-5s3-2 3-5c0-2-1-4-1-4z"/><circle cx="14.5" cy="8.5" r="1.2" fill="currentColor"/></svg>',
  kanban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="5" height="14" rx="1"/><rect x="10" y="4" width="5" height="9" rx="1"/><rect x="17" y="4" width="4" height="12" rx="1"/></svg>',
  publish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 8l5-5 5 5M5 21h14"/></svg>',
  bulk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16"/></svg>',
  google: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  ouvidoria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/></svg>',
  doutor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  ssl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l8-3 8 3v6c0 5-4 8-8 9-4-1-8-4-8-9z"/></svg>',
  suspender: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v12H5.2L4 18z"/><path d="M9 9h6"/></svg>',
  terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>',
  quando: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

NAV_ICON.merge = ICONS.merge;
NAV_ICON.config = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

// A sidebar espelha os mockups (ADR-115): só módulo que existe. As
// configurações ficam no pé da sidebar, fora desta lista.
const MODULES = [
  { id: 'home', nome: 'Início', icon: 'home', tag: 'HOME' },
  { id: 'merge', nome: 'Mergear PRs', icon: 'merge', tag: 'MOD_GIT_MERGE' },
  { id: 'kanban', nome: 'Salesforce Kanban', icon: 'kanban', tag: 'MOD_SF_KANBAN' },
  { id: 'publish', nome: 'Publicar MPI+', icon: 'publish', tag: 'MOD_PUBLISH_MPI' },
  { id: 'bulk', nome: 'Publicação em Massa', icon: 'bulk', tag: 'MOD_BULK' },
  { id: 'newproject', nome: 'Propriedades Google', icon: 'google', tag: 'MOD_GOOGLE_PROPS' },
  { id: 'ouvidoria', nome: 'Ouvidoria & Auditoria', icon: 'ouvidoria', tag: 'MOD_OUVIDORIA' },
  { id: 'quando', nome: 'Quando publicou', icon: 'quando', tag: 'MOD_QUANDO_PUB' },
  { id: 'doutor', nome: 'Bloquear Contatos', icon: 'doutor', tag: 'MOD_AUTO_LOCK' },
  { id: 'ssl', nome: 'Ativação SSL / E-mails', icon: 'ssl', tag: 'MOD_SSL_MAIL_DISPATCH' },
  { id: 'suspender', nome: 'Suspensão & E-mails', icon: 'suspender', tag: 'MOD_SUSPEND_MAIL' },
  { id: 'config', nome: 'Configurações', icon: 'config', tag: 'MOD_CONFIG_VAULT', oculto: true },
];

function renderChrome() {
  if (el.navList) {
    el.navList.innerHTML = MODULES.filter((m) => !m.oculto).map((m) => `
      <button class="nav-item ${state.view === m.id ? 'active' : ''}" data-mod="${m.id}">
        ${NAV_ICON[m.icon] || ''}<span>${escapeHtml(m.nome)}</span>
        ${state.view === m.id ? '<span class="nav-dot"></span>' : ''}
      </button>`).join('');
    el.navList.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.mod;
      if (id === 'home') return goHome();
      openTool(id);
    }));
  }
  if (el.settingsBtn) el.settingsBtn.classList.toggle('active', state.view === 'config');
  if (el.terminalTitle) {
    const m = MODULES.find((x) => x.id === state.view);
    el.terminalTitle.textContent = m && m.id !== 'home' ? 'Atividade · ' + m.nome : 'Atividade em tempo real';
  }
  atualizarTopbar();
}

function atualizarTopbar() {
  const nome = hubUsuario || nomeDoEmailLocal(state.creds?.email) || '';
  if (el.tbUserNome) el.tbUserNome.textContent = nome || '—';
  if (el.tbUserInicial) el.tbUserInicial.textContent = (primeiroNome(nome) || '·').charAt(0).toUpperCase();
  if (el.tbUserMarca) el.tbUserMarca.textContent = brandName(state.brand) || '';
  if (el.navOnline) el.navOnline.classList.toggle('off', !navigator.onLine);
}

// A busca do topo (Ctrl+K). Ela filtrava a grade de ferramentas da tela
// inicial, que saiu (ADR-127); agora o Enter abre direto o módulo cujo nome
// bate com o texto (sem acento conta igual), depois pelas descrições, e, se
// nada bater e o texto for um domínio, consulta o WHOIS/DNS na tela inicial.
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function buscarNoTopo(texto) {
  const q = semAcento(texto).trim();
  if (!q) return;
  const limpar = () => { if (el.tbSearch) { el.tbSearch.value = ''; el.tbSearch.blur(); } };
  const achado = MODULES.find((m) => semAcento(m.nome).includes(q))
    || TOOLS.find((t) => semAcento(t.name).includes(q))
    || TOOLS.find((t) => semAcento(t.desc).includes(q));
  if (achado) {
    limpar();
    if (achado.id === 'home') goHome();
    else if (achado.id === 'config') openSettings();
    else openTool(achado.id);
    return;
  }
  const dominio = normalizeDomain(texto);
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dominio)) {
    limpar();
    whoisEstado.dominio = dominio;
    goHome();
    consultarWhois();
    return;
  }
  log(`Nada no Hub com "${String(texto).trim()}". Digite o nome de um módulo (publicar, kanban, ouvidoria…) ou um domínio.`, 'warn');
}

// Telemetria de verdade (ADR-115): memória e CPU somando os processos do
// Electron, e o estado da sessão do Salesforce, repolados de tempos em tempos.
// Com a janela escondida (minimizada ou atrás de outra), não há quem leia:
// o tick não trabalha, e volta na hora em que ela aparece (ADR-126).
let hubSfConectado = false;
let hubCredenciais = null;
function iniciarTopbarLive() {
  const tick = async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const r = await window.api.telemetria();
      if (r && r.ok) {
        if (el.tbMem) el.tbMem.textContent = `${r.memMb} MB`;
        if (el.tbCpu) {
          const pct = Number(r.cpuPct) || 0;
          el.tbCpu.textContent = `${pct < 5 ? 'Ocioso' : 'Ativo'} (${pct.toFixed(1)}%)`;
          el.tbCpu.classList.toggle('quente', pct >= 40);
        }
        if (el.terminalMeta) el.terminalMeta.innerHTML = `PID: <b>${escapeHtml(String(r.pid))}</b> · ${r.processos} processo(s)`;
      }
    } catch (e) {}
    try { const sf = await window.api.salesforceGetConfig(); hubSfConectado = !!(sf && sf.ok && sf.conectado); } catch (e) {}
    atualizarTopbar();
  };
  tick();
  setInterval(tick, 10000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  window.addEventListener('online', atualizarTopbar);
  window.addEventListener('offline', atualizarTopbar);
  // Sem foco, os indicadores de "ocupado" param de piscar (ADR-126): mesmo em
  // degraus, cada piscada redesenha a janela, e com o foco em outro programa
  // ninguém está olhando para o Hub.
  const marcarFoco = () => document.documentElement.classList.toggle('sem-foco', !document.hasFocus());
  window.addEventListener('focus', marcarFoco);
  window.addEventListener('blur', marcarFoco);
  marcarFoco();
}

// ---------- Terminal: comando manual e atalhos (ADR-115) ----------

// O terminal aceita comando digitado, para testar direto dali: nslookup,
// ping, curl, git… rodam no shell do Windows e a saída chega linha a linha.
// Alguns são do próprio Hub (dns, whois, limpar, ajuda), porque o Windows não
// tem whois e o Hub já sabe consultar.
let comandoRodando = null;
let cancelarEscutaComando = null;
const SHELL_MAX_LINHAS = 400;

const AJUDA_TERMINAL = [
  'Comandos do Hub: dns <domínio> · whois <domínio> · limpar · parar · ajuda',
  'Qualquer outra coisa roda no shell do Windows: nslookup, ping, tracert, curl, git…',
  'Os atalhos (#) preenchem o comando com o domínio da tela e já executam.',
];

function logShell(texto, err) {
  const linhas = String(texto).replace(/\r/g, '').split('\n');
  if (linhas.length && linhas[linhas.length - 1] === '') linhas.pop();
  for (const l of linhas) {
    if (comandoRodando && ++comandoRodando.linhas > SHELL_MAX_LINHAS) {
      if (comandoRodando.linhas === SHELL_MAX_LINHAS + 1) log(`(saída cortada em ${SHELL_MAX_LINHAS} linhas; o arquivo do dia não tem o resto)`, 'warn');
      return;
    }
    log(l, err ? 'shell err' : 'shell');
  }
}

function iniciarTerminalComando() {
  if (!el.termInput) return;
  const rodar = () => { const t = el.termInput.value; el.termInput.value = ''; executarNoTerminal(t); };
  el.termInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); rodar(); }
    if (e.key === 'Escape') { el.termInput.blur(); }
    if (e.key === 'ArrowUp' && histCmd.length) { e.preventDefault(); histIdx = Math.max(0, histIdx - 1); el.termInput.value = histCmd[histIdx] || ''; }
    if (e.key === 'ArrowDown' && histCmd.length) { e.preventDefault(); histIdx = Math.min(histCmd.length, histIdx + 1); el.termInput.value = histCmd[histIdx] || ''; }
  });
  el.termRun.addEventListener('click', () => { if (comandoRodando) pararComandoTerminal(); else rodar(); });
  if (window.api.onComandoSaida) {
    cancelarEscutaComando = window.api.onComandoSaida((d) => {
      if (!comandoRodando || d.id !== comandoRodando.id) return;
      if (d.tipo === 'stdout') logShell(d.texto, false);
      else if (d.tipo === 'stderr') logShell(d.texto, true);
      else if (d.tipo === 'fim') {
        let fim = {};
        try { fim = JSON.parse(d.texto); } catch (e) {}
        const seg = ((fim.ms || 0) / 1000).toFixed(1);
        if (fim.erro) log(`Não consegui rodar: ${fim.erro}`, 'error');
        else log(`Terminou com código ${fim.codigo === null ? '?' : fim.codigo} em ${seg}s.`, fim.codigo === 0 ? 'success' : 'warn');
        comandoRodando = null;
        clearBusy();
        atualizarBotaoTerminal();
      }
    });
  }
  // Ctrl+` foca o terminal de qualquer tela (e o mostra, se estava escondido).
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      if (typeof mostrarAtividade === 'function') mostrarAtividade();
      el.termInput.focus();
    }
  });
}

const histCmd = [];
let histIdx = 0;

function atualizarBotaoTerminal() {
  if (!el.termRun) return;
  el.termRun.textContent = comandoRodando ? 'PARAR ■' : 'ENTER ↵';
  el.termRun.classList.toggle('parar', !!comandoRodando);
}

async function pararComandoTerminal() {
  if (!comandoRodando) return;
  log('Parando o comando…', 'warn');
  try { await window.api.pararComando(); } catch (e) {}
}

async function executarNoTerminal(entrada) {
  const texto = String(entrada || '').trim();
  if (!texto) return;
  histCmd.push(texto);
  histIdx = histCmd.length;
  if (texto.startsWith('#')) {
    const a = atalhosDaTela().find((x) => x.rotulo === texto.split(/\s+/)[0]);
    if (!a) { log(`Atalho desconhecido: ${texto}. Os desta tela: ${atalhosDaTela().map((x) => x.rotulo).join(' ') || 'nenhum'}.`, 'warn'); return; }
    if (typeof a.comando === 'function') { log(`${a.rotulo}`, 'cmd'); await a.comando(); return; }
    return executarNoTerminal(a.comando);
  }
  const [cmd, ...args] = texto.split(/\s+/);
  const c = cmd.toLowerCase();
  if (['limpar', 'clear', 'cls'].includes(c)) { el.terminal.innerHTML = ''; return; }
  if (['ajuda', 'help', '?'].includes(c)) { for (const l of AJUDA_TERMINAL) log(l, 'info'); return; }
  if (['parar', 'stop'].includes(c)) { await pararComandoTerminal(); return; }
  if (['dns', 'whois'].includes(c)) {
    const alvos = args.map((a) => normalizeDomain(a)).filter(Boolean);
    if (!alvos.length) { log(`Uso: ${c} <domínio> [outro domínio…]`, 'warn'); return; }
    for (const d of alvos) await consultarDnsNoTerminal(d, c === 'whois');
    return;
  }
  if (comandoRodando) { log('Já tem um comando rodando. Espere terminar ou clique em PARAR.', 'warn'); return; }
  const id = genId();
  comandoRodando = { id, texto, linhas: 0 };
  log(`$ ${texto}`, 'cmd');
  setBusy(`rodando ${cmd}`);
  atualizarBotaoTerminal();
  const res = await window.api.executarComando({ comando: texto, id }).catch((e) => ({ ok: false, error: e.message }));
  if (!res || !res.ok) {
    comandoRodando = null;
    clearBusy();
    atualizarBotaoTerminal();
    log(`Não consegui rodar: ${(res && res.error) || 'erro'}`, 'error');
  }
}

// dns/whois pelo próprio Hub (mesma consulta da tela inicial), impressos no
// terminal em vez do cartão.
async function consultarDnsNoTerminal(dominio, comWhois) {
  log(`${comWhois ? 'whois' : 'dns'} ${dominio}`, 'cmd');
  const r = await withBusy(`consultando ${dominio}`, () => window.api.whois({ dominio }));
  if (!r || !r.ok) { log(`Falhou: ${(r && r.error) || 'erro'}`, 'error'); return; }
  const dns = r.dns || {};
  log(`NS: ${(dns.ns || []).join(', ') || '(nenhum)'}`, dns.ns && dns.ns.length ? 'info' : 'warn');
  log(`A (raiz): ${(dns.a || []).join(', ') || '(não resolve)'}`, dns.a && dns.a.length ? 'info' : 'warn');
  if (dns.mx && dns.mx.length) log(`MX: ${dns.mx.join(' · ')}`, 'info');
  if (comWhois) {
    const w = r.whois || {};
    if (w.erro) log(`WHOIS indisponível: ${w.erro}`, 'warn');
    else {
      const c = w.campos || {};
      for (const [k, v] of [['Titular', c.titular], ['Registrador', c.registrador], ['Criado', c.criado], ['Expira', c.expira], ['Status', c.status]]) if (v) log(`${k}: ${v}`, 'info');
      if (w.texto) logShell(w.texto, false);
    }
  }
  log(`${dominio}: consulta concluída.`, 'success');
}

// O domínio que a tela atual está olhando, para os atalhos preencherem.
function dominioDaTela() {
  const v = state.view;
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  let d = '';
  if (v === 'home') d = whoisEstado.dominio || val('whoisDominio');
  else if (v === 'doutor') d = doutorEstado.dominio || val('doutorDominio');
  else if (v === 'publish') d = (pub && pub.dominio) || val('pubDominio');
  else if (v === 'ssl' || v === 'suspender') d = parseDomains(val('mailDomains'))[0] || '';
  else if (v === 'ouvidoria') d = (ouvEstado.dominios || [])[0] || '';
  else if (v === 'quando') d = (qpEstado.dominios || [])[0] || '';
  else if (v === 'newproject') d = val('npDomainInput') || val('npSearchInput');
  else if (v === 'bulk') d = (bulkRows[0] && bulkRows[0].dominio) || '';
  else if (v === 'merge') d = (state.queue[0] && state.queue[0].repo) || '';
  return normalizeDomain(d) || '';
}

function atalhosDaTela() {
  const d = dominioDaTela();
  const v = state.view;
  const lista = [];
  if (d) {
    lista.push({ rotulo: '#dns', comando: `dns ${d}` });
    lista.push({ rotulo: '#whois', comando: `whois ${d}` });
    lista.push({ rotulo: '#nslookup', comando: `nslookup ${d}` });
    lista.push({ rotulo: '#ping', comando: `ping -n 2 ${d}` });
  }
  if (v === 'ssl' || v === 'suspender') {
    lista.push({ rotulo: '#testar-dns-todos', comando: async () => {
      const ds = parseDomains(document.getElementById('mailDomains')?.value || '');
      if (!ds.length) { log('Cole os domínios na lista primeiro.', 'warn'); return; }
      for (const x of ds) await consultarDnsNoTerminal(x, false);
    } });
  }
  if (v === 'doutor' && d) lista.push({ rotulo: '#abrir-doutor', comando: `start https://${d}/doutor/` });
  if (v === 'publish' && d) lista.push({ rotulo: '#ns-no-pai', comando: `nslookup -type=NS ${d}` });
  if (v === 'kanban' || v === 'home') lista.push({ rotulo: '#recarregar-filas', comando: async () => { await carregarTarefasSf(true); render(); } });
  if (v === 'config') lista.push({ rotulo: '#testar-credenciais', comando: async () => testarCredenciais() });
  if (v === 'merge') lista.push({ rotulo: '#git-version', comando: 'git --version' });
  lista.push({ rotulo: '#limpar', comando: 'limpar' });
  lista.push({ rotulo: '#ajuda', comando: 'ajuda' });
  return lista;
}

function renderAtalhosTerminal() {
  if (!el.termAtalhos) return;
  el.termAtalhos.innerHTML = atalhosDaTela().map((a) => `<button class="term-chip" data-atalho="${escapeHtml(a.rotulo)}">${escapeHtml(a.rotulo)}</button>`).join('');
  el.termAtalhos.querySelectorAll('[data-atalho]').forEach((b) => b.addEventListener('click', () => executarNoTerminal(b.dataset.atalho)));
  if (el.termPrompt) {
    const nome = primeiroNome(hubUsuario || nomeDoEmailLocal(state.creds?.email) || 'hub').toLowerCase();
    const m = MODULES.find((x) => x.id === state.view);
    el.termPrompt.textContent = `${nome}@hub:~/${m && m.id !== 'home' ? m.id : ''}$`;
  }
}

function copiarTerminal() {
  const linhas = [...el.terminal.querySelectorAll('.log-line')].map((l) => {
    const ts = l.querySelector('.ts')?.textContent || '';
    const msg = l.querySelector('.log-msg')?.textContent || '';
    return `${ts ? `[${ts}] ` : ''}${msg}`;
  });
  if (!linhas.length) { log('Nada para copiar.', 'info'); return; }
  window.api.copyToClipboard(linhas.join('\n')).then(() => {
    log(`${linhas.length} linha(s) copiadas.`, 'success');
    flashCopied(el.copyLogBtn, 'Copiado!');
  });
}

// ---------- Tarefas e filas do Salesforce (home + kanban) (ADR-115) ----------

let sfKanban = { dados: null, carregando: false, erro: null, quando: 0, fila: 'todas', movendo: new Set() };

async function carregarTarefasSf(forcar) {
  if (sfKanban.carregando) return sfKanban.dados;
  if (!forcar && sfKanban.dados && Date.now() - sfKanban.quando < 60000) return sfKanban.dados;
  if (!hubSfConectado) {
    try { const sf = await window.api.salesforceGetConfig(); hubSfConectado = !!(sf && sf.ok && sf.conectado); } catch (e) {}
    if (!hubSfConectado) { sfKanban.dados = null; sfKanban.erro = 'Salesforce desconectado'; return null; }
  }
  sfKanban.carregando = true;
  renderFilasSePossivel();
  const r = await withBusy('lendo as filas do Salesforce', () => window.api.salesforceTarefas()).catch((e) => ({ ok: false, error: e.message }));
  sfKanban.carregando = false;
  sfKanban.quando = Date.now();
  if (r && r.log && forcar) for (const e of r.log) log(e.message, e.type);
  if (!r || !r.ok) {
    sfKanban.erro = (r && r.error) || 'falhou';
    log(`Filas do Salesforce: ${sfKanban.erro}${r && r.precisaReconectar ? ' (reconecte nas configurações)' : ''}`, 'warn');
  } else {
    sfKanban.erro = null;
    sfKanban.dados = r;
    if (forcar) log(`Salesforce: ${r.filas.length} fila(s), ${r.tarefas.filter((t) => !t.fechada).length} tarefa(s) aberta(s).`, 'success');
  }
  renderFilasSePossivel();
  return sfKanban.dados;
}

function renderFilasSePossivel() {
  if (state.view === 'home') { const w = document.getElementById('homeFilas'); if (w) renderHomeFilas(); }
  if (state.view === 'kanban') renderKanbanTool();
}

const hoje = () => new Date().toISOString().slice(0, 10);
function prazoInfo(t) {
  if (!t.prazo) return { texto: 'sem prazo', cls: 'dim', critica: false };
  const h = hoje();
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (t.prazo < h) return { texto: `atrasada (${formatarDataCurta(t.prazo)})`, cls: 'warn', critica: true };
  if (t.prazo === h) return { texto: 'Hoje', cls: 'warn', critica: true };
  if (t.prazo === amanha) return { texto: 'Amanhã', cls: 'cyan', critica: false };
  return { texto: formatarDataCurta(t.prazo), cls: '', critica: false };
}
function formatarDataCurta(iso) {
  const [a, m, d] = String(iso).split('-');
  return d && m ? `${d}/${m}` : iso;
}

function tarefasDaFila(filaId) {
  const d = sfKanban.dados;
  if (!d) return [];
  if (filaId === 'todas') return d.tarefas;
  if (filaId === 'minhas') return d.tarefas.filter((t) => t.minha);
  return d.tarefas.filter((t) => t.fila === filaId);
}

function linkDaTarefa(t) {
  const base = (sfKanban.dados && sfKanban.dados.instancia) || '';
  if (!base) return '';
  return `${base.replace('.my.salesforce.com', '.lightning.force.com')}/lightning/r/Task/${t.id}/view`;
}

// A tarefa aberta num cartão por cima do quadro: título, comentário e autor
// (o que o Guilherme pediu), mais o resto que já veio na consulta.
function abrirTarefaNoSalesforce(t) {
  fecharTarefaAberta();
  const p = prazoInfo(t);
  const url = linkDaTarefa(t);
  const data = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const col = KB_COLUNAS.find((c) => c.id === t.coluna);
  const box = document.createElement('div');
  box.className = 'modal tarefa-modal';
  box.innerHTML = `<div class="modal-box tarefa-box anim-in">
    <div class="tarefa-head">
      <span class="sec-title">Tarefa do Salesforce</span>
      <span class="spacer"></span>
      <span class="badge ${t.fechada ? 'ok' : p.critica ? 'warn' : 'neutral'}">${escapeHtml(col ? col.nome : t.status)}</span>
      <button class="text-btn" data-fechar title="Fechar (Esc)">✕</button>
    </div>
    <h2 class="tarefa-titulo">${escapeHtml(t.assunto)}</h2>
    <div class="tarefa-meta">
      <div><span class="k">Autor</span><span class="v">${escapeHtml(t.autor || '—')}</span></div>
      <div><span class="k">Responsável</span><span class="v">${escapeHtml(t.dono || '—')}${t.minha ? ' <span class="badge ok raw">você</span>' : ''}</span></div>
      <div><span class="k">Prazo</span><span class="v ${p.cls === 'warn' ? 'warn-text' : ''}">${escapeHtml(t.prazo ? `${formatarDataCurta(t.prazo)} (${p.texto})` : 'sem prazo')}</span></div>
      <div><span class="k">Status</span><span class="v mono">${escapeHtml(t.status || '')}</span></div>
      ${t.relativo ? `<div><span class="k">Relacionado</span><span class="v">${escapeHtml(`${t.relativoTipo === 'Case' ? 'Caso' : t.relativoTipo || ''} ${t.relativo}`.trim())}</span></div>` : ''}
      <div><span class="k">Criada em</span><span class="v mono">${escapeHtml(data(t.criada))}</span></div>
    </div>
    <div class="section-label">Comentário</div>
    <div class="tarefa-comentario">${t.descricao ? escapeHtml(t.descricao) : '<span class="dim">(sem comentário)</span>'}</div>
    <div class="modal-actions">
      <span class="kb-mover" style="margin:0">
        ${KB_COLUNAS.filter((c) => c.id !== t.coluna).map((c) => `<button class="btn compact ghost" data-mover="${c.id}">Mover para ${escapeHtml(c.nome)}</button>`).join('')}
      </span>
      <div class="spacer"></div>
      <button class="btn ghost" data-copiar ${url ? '' : 'disabled'}>Copiar link</button>
      <button class="btn primary" data-abrir ${url ? '' : 'disabled'}>Abrir no Salesforce</button>
    </div>
  </div>`;
  document.body.appendChild(box);
  const fechar = () => fecharTarefaAberta();
  box.addEventListener('click', (e) => { if (e.target === box) fechar(); });
  box.querySelector('[data-fechar]').addEventListener('click', fechar);
  box.querySelector('[data-copiar]').addEventListener('click', (e) => { window.api.copyToClipboard(url).then(() => { log(`Link da tarefa copiado: ${url}`, 'success'); flashCopied(e.currentTarget, 'Copiado!'); }); });
  box.querySelector('[data-abrir]').addEventListener('click', async () => {
    const r = window.api.abrirLink ? await window.api.abrirLink({ url }) : { ok: false, error: 'sem API' };
    if (r && r.ok) log(`Abrindo a tarefa no navegador: ${url}`, 'info');
    else log(`Não consegui abrir: ${(r && r.error) || 'erro'}`, 'error');
  });
  box.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () => { fechar(); moverTarefaKanban(t.id, b.dataset.mover); }));
  tarefaAbertaEsc = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', tarefaAbertaEsc);
}

let tarefaAbertaEsc = null;
function fecharTarefaAberta() {
  document.querySelectorAll('.tarefa-modal').forEach((m) => m.remove());
  if (tarefaAbertaEsc) { document.removeEventListener('keydown', tarefaAbertaEsc); tarefaAbertaEsc = null; }
}

function renderHomeFilas() {
  const wrap = document.getElementById('homeFilas');
  if (!wrap) return;
  const d = sfKanban.dados;
  if (!hubSfConectado || (!d && !sfKanban.carregando)) {
    wrap.innerHTML = `<div class="fila" style="grid-column: 1 / -1; min-height: 0">
      <div class="fila-head"><span class="fila-nome">${NAV_ICON.kanban}Filas do Salesforce</span><span class="fila-n dim">offline</span></div>
      <div class="fila-vazia">${hubSfConectado ? `Não consegui ler as filas: ${escapeHtml(sfKanban.erro || 'erro')}.` : 'Conecte o Salesforce nas configurações para ver as filas de deploy aqui.'}</div>
      <div class="fila-foot">${hubSfConectado ? '<button class="btn compact ghost" id="filasTentar">Tentar de novo</button>' : '<button class="btn compact ghost" id="filasConfig">Abrir configurações</button>'}</div>
    </div>`;
    document.getElementById('filasTentar')?.addEventListener('click', () => carregarTarefasSf(true));
    document.getElementById('filasConfig')?.addEventListener('click', () => openSettings('salesforce'));
    return;
  }
  if (!d) {
    wrap.innerHTML = `<div class="fila" style="grid-column: 1 / -1; min-height: 0"><div class="fila-vazia">Lendo as filas do Salesforce…</div></div>`;
    return;
  }
  const filas = d.filas.length ? d.filas : [{ id: 'minhas', nome: 'Minhas tarefas', marca: null }];
  wrap.innerHTML = filas.map((f, i) => {
    const abertas = tarefasDaFila(f.id).filter((t) => !t.fechada);
    const lista = abertas.slice(0, 4);
    return `<div class="fila ${i % 2 ? 'cyan' : ''}">
      <div class="fila-head"><span class="fila-nome" title="${escapeHtml(f.nome)}">${NAV_ICON.deploy}<span>${escapeHtml(f.nome)}</span></span><span class="fila-n">${abertas.length} na fila</span></div>
      <div class="fila-itens">
        ${lista.length ? lista.map((t) => {
          const p = prazoInfo(t);
          return `<div class="fila-item" data-tarefa="${escapeHtml(t.id)}" title="${escapeHtml(t.assunto)}">${t.coluna === 'andamento' ? ICONS.history : NAV_ICON.ouvidoria}<span class="t">${escapeHtml(t.assunto)}</span><span class="m ${p.cls}">${t.coluna === 'andamento' ? 'em andamento' : escapeHtml(p.texto)}</span></div>`;
        }).join('') : '<div class="fila-vazia">Nada na fila.</div>'}
        ${abertas.length > 4 ? `<div class="fila-vazia">+ ${abertas.length - 4} tarefa(s)</div>` : ''}
      </div>
      <div class="fila-foot"><button class="btn compact ghost" data-kanban="${escapeHtml(f.id)}">${NAV_ICON.kanban} Kanban</button></div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('[data-kanban]').forEach((b) => b.addEventListener('click', () => { sfKanban.fila = b.dataset.kanban; openTool('kanban'); }));
  wrap.querySelectorAll('[data-tarefa]').forEach((b) => b.addEventListener('click', () => { const t = sfKanban.dados?.tarefas.find((x) => x.id === b.dataset.tarefa); if (t) abrirTarefaNoSalesforce(t); }));
  renderHomeResumoSf();
}

function renderHomeResumoSf() {
  const wrap = document.getElementById('homeSf');
  if (!wrap) return;
  const d = sfKanban.dados;
  const nome = hubUsuario || '';
  if (!d) { wrap.innerHTML = ''; return; }
  const abertas = d.tarefas.filter((t) => !t.fechada);
  const proximas = abertas.filter((t) => prazoInfo(t).critica || (t.prazo && t.prazo <= new Date(Date.now() + 86400000).toISOString().slice(0, 10)));
  const semPrazo = abertas.filter((t) => !t.prazo);
  const destaque = [...abertas].filter((t) => t.prazo).sort((a, b) => a.prazo.localeCompare(b.prazo)).slice(0, 3);
  wrap.innerHTML = `<div class="sf-resumo">
    <div class="sf-resumo-head">
      <span class="home-sec-title">${NAV_ICON.ouvidoria}Tarefas do Salesforce <span class="r">· ${escapeHtml(primeiroNome(nome) || d.eu.nome || '')}</span></span>
      <span class="home-pill cyan">sessão ativa</span>
      <button class="btn compact ghost" id="homeAbrirKanban">${NAV_ICON.kanban} Abrir no quadro Kanban</button>
    </div>
    <div class="sf-nums">
      <div class="sf-num"><div class="sf-num-l">Tarefas abertas</div><div class="sf-num-v"><b>${String(abertas.length).padStart(2, '0')}</b><span class="badge ok">em fila</span></div></div>
      <div class="sf-num"><div class="sf-num-l">Próximas entregas</div><div class="sf-num-v"><b>${String(proximas.length).padStart(2, '0')}</b><span class="badge warn">&lt; 24h</span></div></div>
      <div class="sf-num"><div class="sf-num-l">Sem prazo fixado</div><div class="sf-num-v"><b>${String(semPrazo.length).padStart(2, '0')}</b><span class="badge neutral">backlog</span></div></div>
    </div>
    ${destaque.length ? `<div class="sf-lista">${destaque.map((t) => {
      const p = prazoInfo(t);
      return `<div class="sf-tarefa ${p.critica ? 'critica' : ''}" data-tarefa="${escapeHtml(t.id)}"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${p.critica ? '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>' : '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'}</svg><span class="t">${escapeHtml(t.assunto)}</span><span class="p">${escapeHtml(p.texto)}</span><span class="badge ${p.critica ? 'warn' : t.coluna === 'andamento' ? 'ok' : 'neutral'}">${p.critica ? 'Crítico' : t.coluna === 'andamento' ? 'Em andamento' : 'A fazer'}</span></div>`;
    }).join('')}</div>` : ''}
  </div>`;
  document.getElementById('homeAbrirKanban')?.addEventListener('click', () => { sfKanban.fila = 'todas'; openTool('kanban'); });
  wrap.querySelectorAll('[data-tarefa]').forEach((b) => b.addEventListener('click', () => { const t = sfKanban.dados?.tarefas.find((x) => x.id === b.dataset.tarefa); if (t) abrirTarefaNoSalesforce(t); }));
}

// ----- Kanban -----

const KB_COLUNAS = [
  { id: 'afazer', nome: 'A fazer' },
  { id: 'andamento', nome: 'Em andamento' },
  { id: 'concluido', nome: 'Concluído' },
];

function renderKanbanTool() {
  const d = sfKanban.dados;
  const filas = d ? d.filas : [];
  const opcoes = [{ id: 'todas', nome: 'Todas' }, ...filas, { id: 'minhas', nome: 'Minhas' }];
  if (!opcoes.some((o) => o.id === sfKanban.fila)) sfKanban.fila = 'todas';
  const tarefas = tarefasDaFila(sfKanban.fila);
  el.leftPanel.innerHTML = `
    ${backButtonHtml()}
    <div class="kanban-head">
      <div class="kanban-filas">${opcoes.map((o) => `<button class="term-chip ${sfKanban.fila === o.id ? 'active' : ''}" data-fila="${escapeHtml(o.id)}" style="${sfKanban.fila === o.id ? 'color:var(--accent);border-color:var(--accent-line)' : ''}">${escapeHtml(o.nome)}${d ? ` <span class="dim">${tarefasDaFila(o.id).filter((t) => !t.fechada).length}</span>` : ''}</button>`).join('')}</div>
      <span class="spacer"></span>
      <button class="btn compact ghost" id="kbRecarregar" ${sfKanban.carregando ? 'disabled' : ''}>${sfKanban.carregando ? 'Lendo…' : 'Recarregar'}</button>
    </div>
    ${!hubSfConectado ? `<div class="sec"><div class="sec-title">Salesforce desconectado</div><p class="hint">Conecte o Salesforce nas configurações para ver e mover as tarefas.</p><button class="btn ghost compact mt8" id="kbConfig">Abrir configurações</button></div>` : ''}
    <div class="kanban" id="kanban">
      ${KB_COLUNAS.map((c) => {
        const itens = tarefas.filter((t) => t.coluna === c.id);
        return `<div class="kb-col" data-col="${c.id}">
          <div class="kb-col-head"><span>${c.nome}</span><span class="n">${itens.length}</span></div>
          <div class="kb-itens">
            ${itens.length ? itens.map((t) => kbCardHtml(t)).join('') : `<div class="kb-vazio">${d ? 'Nada aqui.' : sfKanban.carregando ? 'Lendo…' : ''}</div>`}
          </div>
        </div>`;
      }).join('')}
    </div>
    <p class="hint mt12">Arraste um cartão entre as colunas (ou use as setas) para trocar o status da tarefa no Salesforce. Mover para "Em andamento" também assume a tarefa no seu nome. "Concluído" mostra o que fechou nos últimos 7 dias. Clicar no cartão abre a tarefa (título, comentário e autor).</p>
  `;
  document.getElementById('backToHub').addEventListener('click', goHome);
  document.getElementById('kbConfig')?.addEventListener('click', () => openSettings('salesforce'));
  document.getElementById('kbRecarregar').addEventListener('click', () => carregarTarefasSf(true));
  el.leftPanel.querySelectorAll('[data-fila]').forEach((b) => b.addEventListener('click', () => { sfKanban.fila = b.dataset.fila; renderKanbanTool(); }));
  wireKanbanDnd();
  if (!d && !sfKanban.carregando && hubSfConectado) carregarTarefasSf(false);
}

function kbCardHtml(t) {
  const p = prazoInfo(t);
  const idx = KB_COLUNAS.findIndex((c) => c.id === t.coluna);
  const fila = sfKanban.dados?.filas.find((f) => f.id === t.fila);
  return `<div class="kb-card ${t.minha ? 'minha' : ''} ${p.critica && !t.fechada ? 'critica' : ''} ${t.fechada ? 'fechada' : ''} ${sfKanban.movendo.has(t.id) ? 'movendo' : ''}" draggable="true" data-id="${escapeHtml(t.id)}">
    <div class="kb-t">${escapeHtml(t.assunto)}</div>
    <div class="kb-s">${escapeHtml(t.relativo ? `${t.relativoTipo === 'Case' ? 'Caso' : t.relativoTipo || ''} ${t.relativo}`.trim() : t.dono || '')}</div>
    <div class="kb-m">
      ${!t.fechada ? `<span class="badge ${p.cls === 'warn' ? 'warn' : 'neutral'}">${escapeHtml(p.texto)}</span>` : `<span class="badge ok">${escapeHtml(t.status)}</span>`}
      ${fila ? `<span class="badge neutral raw">${escapeHtml(fila.nome.replace(/^deploy\s*/i, ''))}</span>` : t.minha ? '<span class="badge neutral raw">minha</span>' : ''}
      <span class="kb-mover">
        ${idx > 0 ? `<button data-mover="${KB_COLUNAS[idx - 1].id}" title="Mover para ${KB_COLUNAS[idx - 1].nome}">←</button>` : ''}
        ${idx < KB_COLUNAS.length - 1 ? `<button data-mover="${KB_COLUNAS[idx + 1].id}" title="Mover para ${KB_COLUNAS[idx + 1].nome}">→</button>` : ''}
      </span>
    </div>
  </div>`;
}

function wireKanbanDnd() {
  const board = document.getElementById('kanban');
  if (!board) return;
  let arrastando = null;
  board.querySelectorAll('.kb-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => { arrastando = card.dataset.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', arrastando); } catch (x) {} });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); board.querySelectorAll('.kb-col').forEach((c) => c.classList.remove('over')); });
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-mover]')) return;
      const t = sfKanban.dados?.tarefas.find((x) => x.id === card.dataset.id);
      if (t) abrirTarefaNoSalesforce(t);
    });
    card.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); moverTarefaKanban(card.dataset.id, b.dataset.mover); }));
  });
  board.querySelectorAll('.kb-col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('over'); const id = arrastando || e.dataTransfer.getData('text/plain'); arrastando = null; if (id) moverTarefaKanban(id, col.dataset.col); });
  });
}

async function moverTarefaKanban(id, coluna) {
  const t = sfKanban.dados?.tarefas.find((x) => x.id === id);
  if (!t || t.coluna === coluna || sfKanban.movendo.has(id)) return;
  const de = t.coluna;
  sfKanban.movendo.add(id);
  renderKanbanTool();
  const r = await withBusy(`movendo "${t.assunto}"`, () => window.api.salesforceMoverTarefa({ id, coluna })).catch((e) => ({ ok: false, error: e.message }));
  sfKanban.movendo.delete(id);
  if (r && r.log) for (const e of r.log) log(e.message, e.type);
  if (r && r.ok) {
    t.coluna = coluna;
    t.status = r.status;
    t.fechada = coluna === 'concluido';
    if (r.assumida) { t.minha = true; t.fila = null; t.dono = (sfKanban.dados.eu && sfKanban.dados.eu.nome) || t.dono; }
    log(`"${t.assunto}": ${KB_COLUNAS.find((c) => c.id === de)?.nome} → ${KB_COLUNAS.find((c) => c.id === coluna)?.nome}.`, 'success');
  } else {
    log(`Não movi "${t.assunto}": ${(r && r.error) || 'erro'}`, 'error');
  }
  renderKanbanTool();
}

// ---------- Configurações como tela (ADR-115) ----------

function guardarSettingsBox() {
  if (el.settingsModal && el.settingsHost && el.settingsModal.parentElement !== el.settingsHost) el.settingsHost.appendChild(el.settingsModal);
}

const CFG_TABS = ['geral', 'google', 'cloudflare', 'salesforce', 'paineis', 'acesso'];

function renderConfigTool() {
  const m = MODULES.find((x) => x.id === 'config');
  el.leftPanel.innerHTML = `
    ${backButtonHtml()}
    <div class="tool-sub">Credenciais criptografadas nesta máquina (Windows DPAPI) · host: localhost</div>
    <div class="cfg-audit" id="cfgAudit"></div>
    <div id="cfgMount"></div>
  `;
  document.getElementById('backToHub').addEventListener('click', goHome);
  document.getElementById('cfgMount').appendChild(el.settingsModal);
  el.settingsModal.classList.remove('hidden');
  ativarCfgTab(state.cfgTab || 'geral');
  el.cfgTabs.querySelectorAll('[data-cfg-tab]').forEach((b) => { b.onclick = () => ativarCfgTab(b.dataset.cfgTab); });
  hubCredenciais = null; // a cada abertura, o estado de agora
  renderCfgAudit();
  renderGrantAccessTool();
}

function ativarCfgTab(tab) {
  if (!CFG_TABS.includes(tab)) tab = 'geral';
  state.cfgTab = tab;
  el.cfgTabs.querySelectorAll('[data-cfg-tab]').forEach((b) => b.classList.toggle('active', b.dataset.cfgTab === tab));
  el.settingsModal.querySelectorAll('[data-cfg-pane]').forEach((p) => p.classList.toggle('active', p.dataset.cfgPane === tab));
}

function renderCfgAudit() {
  const wrap = document.getElementById('cfgAudit');
  if (!wrap) return;
  const c = hubCredenciais;
  const itens = (c && c.itens) || [];
  const ok = itens.filter((i) => i.ok).length;
  wrap.innerHTML = `
    <div class="cfg-audit-head">
      <span class="home-sec-title">${NAV_ICON.ouvidoria}Telemetria &amp; auditoria de credenciais <span class="r">· ${c ? `${ok} de ${itens.length} integradas` : 'lendo…'}</span></span>
      <span class="home-head-right"><span class="home-pill ${c ? '' : 'dim'}">engine: DPAPI</span><button class="btn compact ghost" id="cfgTestar">Testar todas</button></span>
    </div>
    <div class="cfg-audit-grid">${itens.map((i) => `<div class="cred ${i.ok ? 'ok' : 'off'}"><div style="min-width:0"><div class="n">${escapeHtml(i.nome)}</div><div class="d">${escapeHtml(i.detalhe)}</div></div><span class="s">${i.ok ? '[OK]' : '[--]'}</span></div>`).join('')}</div>`;
  document.getElementById('cfgTestar').addEventListener('click', testarCredenciais);
  if (!c) carregarCredenciaisDaAuditoria();
}

// Sem o rodapé de status, ninguém mais lê as credenciais de minuto em minuto
// (ADR-126): a auditoria busca quando a tela das Configurações abre.
let credenciaisLendo = false;
async function carregarCredenciaisDaAuditoria() {
  if (credenciaisLendo) return;
  credenciaisLendo = true;
  try {
    const r = await window.api.statusCredenciais();
    if (r && r.ok) { hubCredenciais = r; renderCfgAudit(); }
  } catch (e) {
    // fica "lendo…"; o "Testar todas" tenta de novo
  } finally {
    credenciaisLendo = false;
  }
}

// "Testar todas": o que o Hub sabe conferir de verdade, cada um no terminal.
async function testarCredenciais() {
  log('Conferindo as credenciais desta máquina…', 'cmd');
  try { const r = await window.api.statusCredenciais(); if (r && r.ok) { hubCredenciais = r; renderCfgAudit(); for (const i of r.itens) log(`${i.nome}: ${i.ok ? 'ok' : 'não configurado'}${i.detalhe ? ` (${i.detalhe})` : ''}`, i.ok ? 'info' : 'warn'); } } catch (e) {}
  await refreshOauthStatus().catch(() => {});
  log(`Google (login manual): ${state.oauth.connected ? `conectado${state.oauth.email ? ' como ' + state.oauth.email : ''}` : 'sem sessão'}`, state.oauth.connected ? 'success' : 'warn');
  await refreshMsStatus().catch(() => {});
  log(`Microsoft Graph: ${state.ms.connected ? `conectado${state.ms.email ? ' como ' + state.ms.email : ''}` : 'sem sessão'}`, state.ms.connected ? 'success' : 'warn');
  try {
    const sf = await window.api.salesforceGetConfig();
    hubSfConectado = !!(sf && sf.ok && sf.conectado);
    if (hubSfConectado) {
      const r = await window.api.salesforceTarefas();
      if (r && r.ok) { sfKanban.dados = r; sfKanban.quando = Date.now(); log(`Salesforce: sessão válida, ${r.filas.length} fila(s) de deploy encontrada(s).`, 'success'); }
      else log(`Salesforce: ${r.error}`, 'error');
    } else log('Salesforce: não conectado.', 'warn');
  } catch (e) { log(`Salesforce: ${e.message}`, 'error'); }
  try {
    const p = await window.api.painelStatus();
    log(`Painel MPI+: ${p.configured ? `login gravado (${p.email || '?'})` : 'sem login'}`, p.configured ? 'success' : 'warn');
  } catch (e) {}
  if (window.api.doutorStatus) {
    try { const d = await window.api.doutorStatus(); log(`Painel /doutor: ${d.temSenha ? 'senha gravada' : 'sem senha'}`, d.temSenha ? 'success' : 'warn'); } catch (e) {}
  }
  atualizarTopbar();
  log('Conferência das credenciais concluída.', 'success');
}

// ---------- Ferramenta: bloquear contatos no /doutor (ADR-105) ----------

let doutorEstado = { marca: 'mpisolutions', dominio: '', acao: 'bloquear', tarefa: '', rodando: false, ultimo: null };

function renderDoutorTool() {
  const desb = doutorEstado.acao === 'desbloquear';
  el.leftPanel.innerHTML = `
    ${backButtonHtml()}
    <div class="sec anim-in">
    <div class="sec-head"><span class="sec-title">Bloquear contatos (Doutor &amp; Marcas)</span><span class="sec-meta">Selenium / CF_Worker</span></div>
    <div class="tool-sub" style="margin:0 0 12px">TARGET: /doutor/ · timeout: 45s · idempotente</div>
    <label class="field">
      <span>Marca (decide o e-mail do login) <span class="tag">auth profile</span></span>
      <select id="doutorMarca">
        <option value="mpisolutions" ${doutorEstado.marca === 'mpisolutions' ? 'selected' : ''}>MPI Solutions</option>
        <option value="bc" ${doutorEstado.marca === 'bc' ? 'selected' : ''}>Busca Cliente</option>
      </select>
    </label>
    <label class="field">
      <span>Domínio do cliente <span class="tag cyan">https://</span></span>
      <input id="doutorDominio" type="text" placeholder="ex: cliente.com.br" value="${escapeHtml(doutorEstado.dominio)}" autocomplete="off" />
    </label>
    <label class="field">
      <span>Ação <span class="tag">target state</span></span>
      <select id="doutorAcao">
        <option value="bloquear" ${doutorEstado.acao === 'bloquear' ? 'selected' : ''}>Bloquear contatos</option>
        <option value="desbloquear" ${doutorEstado.acao === 'desbloquear' ? 'selected' : ''}>Desbloquear contatos</option>
      </select>
    </label>
    ${!desb ? `<label class="field">
      <span>Link da tarefa no Salesforce <span class="tag cyan">opcional</span></span>
      <input id="doutorTarefa" type="text" placeholder='cole o link da tarefa (conclui e comenta "Contatos removidos" ao autor)' value="${escapeHtml(doutorEstado.tarefa || '')}" autocomplete="off" />
    </label>` : ''}
    <button id="doutorBtn" class="btn ${desb ? 'primary' : 'caution'} full-width" ${doutorEstado.rodando ? 'disabled' : ''}>${ICONS.ssl} ${doutorEstado.rodando ? (desb ? 'Desbloqueando...' : 'Bloqueando...') : (desb ? 'Desbloquear contatos' : 'Bloquear contatos')}</button>
    <div class="btn-meta"><span>timeout: 45s</span><span>idempotente (já no estado pedido = nada a fazer)</span></div>
    <div id="doutorResultado"></div>
    </div>
    ${infoBoxHtml('<p>O Hub abre <strong>https://&lt;domínio&gt;/doutor/</strong>, entra com a credencial da marca (uma senha só, configurada em Configurações), acha a empresa do cliente e <strong>esvazia os telefones/WhatsApp no cadastro e salva</strong> — é isso que tira o contato do site. Ao bloquear, guarda os números (criptografados) para o desbloquear repor. O painel costuma responder <strong>504</strong> e concluir mesmo assim; o Hub confere relendo o cadastro, não pelo 504.</p><p>Com o link da tarefa preenchido, ao terminar ele conclui a tarefa no Salesforce e comenta <strong>"Contatos removidos"</strong> ao autor. Se já estiver no estado pedido, não faz nada.</p>')}
    <div class="stat-grid" id="doutorStats"></div>
  `;
  document.getElementById('backToHub').addEventListener('click', goHome);
  renderDoutorStats();
  document.getElementById('doutorMarca').addEventListener('change', (e) => { doutorEstado.marca = e.target.value; renderDoutorStats(); });
  document.getElementById('doutorDominio').addEventListener('input', (e) => { doutorEstado.dominio = e.target.value.trim(); renderAtalhosTerminal(); });
  document.getElementById('doutorAcao').addEventListener('change', (e) => { doutorEstado.acao = e.target.value; renderDoutorTool(); });
  const tf = document.getElementById('doutorTarefa'); if (tf) tf.addEventListener('input', (e) => { doutorEstado.tarefa = e.target.value.trim(); });
  document.getElementById('doutorBtn').addEventListener('click', bloquearContatosDoutor);
  renderDoutorResultado();
}

// Os dois cartões de estado do mockup: credencial da marca e último resultado.
function renderDoutorStats() {
  const wrap = document.getElementById('doutorStats');
  if (!wrap) return;
  const marca = doutorEstado.marca === 'bc' ? 'Busca Cliente' : 'MPI Solutions';
  const u = doutorEstado.ultimo;
  const ultimo = !u
    ? statCardHtml({ rotulo: 'Último estado', titulo: 'Nenhuma ação nesta sessão', dot: 'off', sub: 'o resultado aparece aqui e no terminal', subCls: 'dim' })
    : statCardHtml({ rotulo: 'Último estado', titulo: u.titulo, dot: u.ok ? '' : u.incerto ? 'warn' : 'err', sub: u.sub || '', subCls: u.ok ? '' : 'warn', foot: `há pouco via Hub` });
  const cred = (r) => statCardHtml({ rotulo: 'Credencial ativa', titulo: marca, dot: r && r.temSenha ? '' : 'off', sub: r && r.temSenha ? 'chave criptografada OK' : 'sem senha do /doutor nas configurações', subCls: r && r.temSenha ? '' : 'warn', foot: (r && (doutorEstado.marca === 'bc' ? r.emailBusca : r.emailMpi)) || 'e-mail não configurado' });
  wrap.innerHTML = cred(null) + ultimo;
  if (window.api.doutorStatus) window.api.doutorStatus().then((r) => { if (document.getElementById('doutorStats')) wrap.innerHTML = cred(r) + ultimo; }).catch(() => {});
}

function renderDoutorResultado() {
  renderDoutorStats();
  const wrap = document.getElementById('doutorResultado');
  if (!wrap) return;
  const r = doutorEstado.ultimo;
  if (!r) { wrap.innerHTML = ''; return; }
  const cls = r.ok ? 'is-ok' : r.incerto ? 'is-warn' : 'is-err';
  wrap.innerHTML = `<div class="row ${cls}" style="margin-top:10px"><div class="row__main">
    <div class="row__title">${escapeHtml(r.titulo)}</div>
    ${r.sub ? `<div class="row__sub">${escapeHtml(r.sub)}</div>` : ''}
  </div></div>`;
}

async function bloquearContatosDoutor() {
  const marca = doutorEstado.marca;
  const acao = doutorEstado.acao === 'desbloquear' ? 'desbloquear' : 'bloquear';
  const desb = acao === 'desbloquear';
  const dominio = normalizeDomain(doutorEstado.dominio);
  if (!dominio) { log('Informe o domínio do cliente.', 'error'); return; }
  const nomeMarca = marca === 'bc' ? 'Busca Cliente' : 'MPI Solutions';
  const pergunta = desb
    ? `Desbloquear os contatos de ${dominio} no /doutor (${nomeMarca})?\n\nOs telefones/WhatsApp da empresa voltam a aparecer no site.`
    : `Bloquear os contatos de ${dominio} no /doutor (${nomeMarca})?\n\nOs telefones/WhatsApp da empresa são removidos do site.`;
  if (!confirm(pergunta)) { log('Ação cancelada.', 'info'); return; }
  doutorEstado.rodando = true;
  doutorEstado.ultimo = null;
  renderDoutorTool();
  log(`/doutor: ${desb ? 'desbloqueando' : 'bloqueando'} os contatos de ${dominio} (${nomeMarca}).`, 'cmd');
  const res = await withBusy(`${desb ? 'desbloqueando' : 'bloqueando'} contatos de ${dominio}`, () => window.api.doutorBloquear({ dominio, marca, acao }));
  if (res.log) for (const e of res.log) log(e.message, e.type);
  doutorEstado.rodando = false;
  const alvo = res.empresa || dominio;
  if (res.ok && res.jaEstava) doutorEstado.ultimo = { ok: true, titulo: `${alvo}: já estava ${desb ? 'com contatos no ar' : 'sem contatos'}`, sub: 'nada a fazer' };
  else if (res.ok) doutorEstado.ultimo = { ok: true, titulo: `Contatos ${desb ? 'restaurados' : 'removidos'}: ${alvo}`, sub: desb ? 'os telefones voltam ao site' : 'os telefones saem do site (o painel pode ter mostrado 504)' };
  else if (res.incerto) doutorEstado.ultimo = { incerto: true, titulo: `Não confirmei em ${alvo}`, sub: res.error || 'confira no /doutor' };
  else doutorEstado.ultimo = { ok: false, titulo: `Não ${desb ? 'desbloqueou' : 'bloqueou'} ${dominio}`, sub: res.error || 'veja o log' };

  // Bloqueio concluído + link da tarefa = conclui a tarefa e comenta ao autor.
  if (res.ok && !desb && doutorEstado.tarefa) {
    log('Salesforce: concluindo a tarefa e comentando "Contatos removidos" ao autor.', 'cmd');
    try {
      const ft = await withBusy('concluindo a tarefa no Salesforce', () => window.api.salesforceFecharTarefa({ link: doutorEstado.tarefa, texto: 'Contatos removidos', assumir: true, concluir: true, comentar: true }));
      if (ft && ft.log) for (const e of ft.log) log(e.message, e.type);
      if (ft && ft.ok) { log('Tarefa concluída e comentada.', 'success'); doutorEstado.ultimo.sub = `${doutorEstado.ultimo.sub} · tarefa concluída`; }
      else { log(`Não consegui concluir a tarefa: ${(ft && ft.error) || 'veja o log'}`, 'error'); doutorEstado.ultimo.sub = `${doutorEstado.ultimo.sub} · tarefa NÃO concluída`; }
    } catch (e) { log(`Falha ao concluir a tarefa: ${e.message}`, 'error'); }
  }
  renderDoutorTool();
}

// ---------- Ferramenta: Ouvidoria / SSL (ADR-111) ----------

let ouvEstado = { dominios: [], outros: [], meta: {}, temCliente: false, origem: '', rodando: false, parar: false, linhas: [], feito: false };

function renderOuvidoriaTool() {
  el.leftPanel.innerHTML = `
    ${backButtonHtml()}
    <div class="sec anim-in">
    <div class="sec-head"><span class="sec-title">Auditoria de Ouvidoria &amp; status SSL</span><span class="sec-meta">${hubSfConectado ? 'automatizado · SFDC' : 'salesforce desconectado'}</span></div>
    <div class="tool-sub" style="margin:0 0 12px">Validação cruzada de casos de Ouvidoria vs regra de publicação SSL</div>
    <label class="field">
      <span>Planilha de domínios (.xlsx, .csv ou colado)</span>
      <input id="ouvFile" type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
    </label>
    <label class="field">
      <span>ou cole os domínios (um por linha) <span class="tag" id="ouvContagem">${ouvEstado.dominios.length ? `${ouvEstado.dominios.length} domínios informados` : ''}</span></span>
      <textarea id="ouvTexto" rows="5" placeholder="cliente1.com.br\ncliente2.com.br" autocomplete="off">${escapeHtml(ouvEstado.texto || '')}</textarea>
    </label>
    </div>
    <div class="sec anim-in">
      <div class="sec-head"><span class="sec-title">Parâmetros &amp; filtros de auditoria SFDC</span></div>
      <label class="checkbox-field"><input type="checkbox" checked disabled /><span>Consultar casos de Ouvidoria vinculados ao domínio</span></label>
      <label class="checkbox-field"><input type="checkbox" checked disabled /><span>Validar campos <strong>Definição</strong> e <strong>Data de Conclusão</strong></span></label>
      <label class="checkbox-field"><input type="checkbox" checked disabled /><span>Regra SSL: Ativar SSL = <strong>não</strong> se Cancelado/Jurídico; <strong>sim</strong> no restante</span></label>
      <label class="checkbox-field"><input type="checkbox" checked disabled /><span>Marcar domínios não localizados para revisão manual</span></label>
    </div>
    <div id="ouvResumo"></div>
    <div id="ouvAcoes"></div>
    <div id="ouvLista"></div>
    ${infoBoxHtml('<p>Com a coluna <strong>cliente</strong> na planilha, o Hub confere só <strong>Busca Cliente</strong> e <strong>MPI Solutions</strong>. Soluções Industriais, Doutores da Web e o resto ficam de fora, na aba <strong>"Outros clientes"</strong> do arquivo final. Sem coluna cliente (domínios colados), confere todos.</p><p>Para achar a conta, usa confiança graduada: <strong>razão social</strong> (se vier na planilha) &gt; <strong>Website da conta</strong> &gt; domínio no <strong>assunto do caso</strong> &gt; <strong>contato</strong> com e-mail do domínio &gt; <strong>tarefa de publicação</strong>. Só resolve com uma conta clara; senão marca revisar (não chuta conta errada). Aí lê os casos de <strong>Ouvidoria</strong> (Definição e Data de Conclusão): Situação = a Definição; Ativar SSL = <strong>não</strong> se Cancelado/Jurídico, <strong>sim</strong> no resto.</p>', 'Protocolo de auditoria e regras da Ouvidoria')}
  `;
  document.getElementById('backToHub').addEventListener('click', goHome);
  document.getElementById('ouvFile').addEventListener('change', async (e) => {
    const arquivo = e.target.files && e.target.files[0];
    if (!arquivo) return;
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const res = await window.api.lerPlanilha({ nome: arquivo.name, base64: btoa(bin) });
    if (!res.ok) { log(res.error, 'error'); return; }
    ouvCarregar(res.linhas, arquivo.name);
  });
  document.getElementById('ouvTexto').addEventListener('change', async (e) => {
    ouvEstado.texto = e.target.value;
    const res = await window.api.lerPlanilha({ texto: e.target.value });
    if (!res.ok) { log(res.error, 'error'); return; }
    ouvCarregar(res.linhas, 'texto colado');
  });
  renderOuvidoria();
}

// Classifica o valor da coluna "cliente" (ADR-117). Só Busca Cliente e MPI
// Solutions entram no SSL; Soluções Industriais, Doutores da Web e o resto
// (inclusive em branco) ficam de fora, na aba "Outros clientes".
function ouvClienteCat(txt) {
  const n = String(txt || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!n) return 'outro';
  if (n === 'bc' || n.includes('busca cliente') || n.includes('buscacliente')) return 'bc';
  if (n === 'mpi' || n.includes('mpi solutions') || n.includes('mpisolutions') || n.includes('mpi solu')) return 'mpi';
  return 'outro';
}

// Da planilha crua: acha o cabeçalho e as colunas (domínio, cliente, razão
// social). Com coluna "cliente", separa BC/MPI (para conferir) dos demais
// (ignorados). Sem coluna "cliente" (ex.: domínios colados), confere todos.
function ouvCarregar(linhas, origem) {
  linhas = linhas || [];
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const ehCab = (cel) => /dom[ií]?nio|site|url|cliente|produto|marca|raz[aã]o|conta|empresa/i.test(String(cel || ''));
  let cab = -1;
  for (let i = 0; i < Math.min(linhas.length, 6); i++) { if ((linhas[i] || []).some(ehCab)) { cab = i; break; } }
  let domIdx = -1, cliIdx = -1, razaoIdx = -1;
  if (cab >= 0) {
    const H = (linhas[cab] || []).map(norm);
    domIdx = H.findIndex((h) => /dominio|site|url/.test(h));
    cliIdx = H.findIndex((h) => /cliente|produto|marca/.test(h));
    razaoIdx = H.findIndex((h) => /razao|conta|empresa/.test(h));
  }
  const inicio = cab >= 0 ? cab + 1 : 0;
  const vistos = new Set();
  const dominios = [];
  const outros = [];
  const meta = {};
  for (let i = inicio; i < linhas.length; i++) {
    const linha = linhas[i] || [];
    let dom = domIdx >= 0 ? normalizeDomain(String(linha[domIdx] || '').trim()) : '';
    if (!dom || !pareceDominio(dom)) {
      for (const cel of linha) { const d = normalizeDomain(String(cel || '').trim()); if (d && pareceDominio(d)) { dom = d; break; } }
    }
    if (!dom || !pareceDominio(dom) || vistos.has(dom)) continue;
    vistos.add(dom);
    const cliente = cliIdx >= 0 ? String(linha[cliIdx] || '').trim() : '';
    const razao = razaoIdx >= 0 ? String(linha[razaoIdx] || '').trim() : '';
    meta[dom] = { cliente, razao };
    if (cliIdx >= 0 && ouvClienteCat(cliente) === 'outro') outros.push({ dominio: dom, cliente });
    else dominios.push(dom);
  }
  ouvEstado = { ...ouvEstado, dominios, outros, meta, temCliente: cliIdx >= 0, origem, rodando: false, parar: false, linhas: [], feito: false };
  const cont = document.getElementById('ouvContagem');
  if (cont) cont.textContent = dominios.length ? `${dominios.length} domínios para conferir` : '';
  log(`Ouvidoria: ${dominios.length} para conferir (BC/MPI)${cliIdx >= 0 ? `, ${outros.length} ignorado(s) (não BC/MPI)` : ''}, de ${origem}.`, dominios.length ? 'info' : 'warn');
  renderAtalhosTerminal();
  renderOuvidoria();
}

function renderOuvidoria() {
  const resumo = document.getElementById('ouvResumo');
  const acoes = document.getElementById('ouvAcoes');
  const lista = document.getElementById('ouvLista');
  if (!resumo || !acoes || !lista) return;

  const outrosN = (ouvEstado.outros || []).length;
  resumo.innerHTML = ouvEstado.dominios.length || outrosN
    ? `<div class="section-label">${ouvEstado.dominios.length} para conferir${ouvEstado.linhas.length ? `, ${ouvEstado.linhas.length} conferido(s)` : ''}${outrosN ? ` · ${outrosN} ignorado(s) (não BC/MPI)` : ''}</div>`
    : '';

  if (ouvEstado.rodando) {
    acoes.innerHTML = `<button id="ouvParar" class="btn caution full-width">Parar depois deste</button>`;
    document.getElementById('ouvParar').addEventListener('click', () => { ouvEstado.parar = true; log('Vou parar depois do domínio atual.', 'warn'); });
  } else {
    let h = '';
    if (ouvEstado.dominios.length) h += `<button id="ouvRun" class="btn primary full-width">${ICONS.search} Processar e auditar Ouvidoria (${ouvEstado.dominios.length} domínio${ouvEstado.dominios.length > 1 ? 's' : ''})</button>`;
    if (ouvEstado.linhas.length || (ouvEstado.outros || []).length) h += `<button id="ouvExport" class="btn ghost full-width" style="margin-top:6px">Salvar planilha (.xlsx)</button>`;
    acoes.innerHTML = h;
    const run = document.getElementById('ouvRun');
    if (run) run.addEventListener('click', rodarOuvidoria);
    const exp = document.getElementById('ouvExport');
    if (exp) exp.addEventListener('click', exportarOuvidoria);
  }

  const badge = (l) => l.erro ? ['err', 'erro'] : !l.achou ? ['warn', 'revisar'] : l.ativarSsl === 'não' ? ['warn', 'SSL: não'] : ['ok', 'SSL: sim'];
  lista.innerHTML = ouvEstado.linhas.length
    ? '<div class="rows">' + ouvEstado.linhas.map((l) => {
        const [cls, txt] = badge(l);
        return `<div class="row is-${cls === 'err' ? 'err' : cls === 'warn' ? 'warn' : 'ok'}"><div class="row__main"><div class="row__title">${escapeHtml(l.razao || l.dominio)}</div><div class="row__sub">${escapeHtml(l.razao ? l.dominio + ' · ' : '')}${escapeHtml(l.situacao || l.motivo || '')}</div></div><span class="badge ${cls}">${escapeHtml(txt)}</span></div>`;
      }).join('') + '</div>'
    : '';
}

async function rodarOuvidoria() {
  if (ouvEstado.rodando || !ouvEstado.dominios.length) return;
  const sf = await window.api.salesforceGetConfig();
  if (!(sf && sf.ok && sf.conectado)) { log('Conecte o Salesforce nas configurações antes de conferir a Ouvidoria.', 'error'); return; }
  ouvEstado.rodando = true;
  ouvEstado.parar = false;
  ouvEstado.linhas = [];
  ouvEstado.feito = false;
  renderOuvidoria();
  log(`Conferindo a Ouvidoria de ${ouvEstado.dominios.length} domínio(s) no Salesforce.`, 'cmd');
  for (const dominio of ouvEstado.dominios) {
    if (ouvEstado.parar) { log('Parado por você.', 'warn'); break; }
    const info = ouvEstado.meta[dominio] || {};
    const cliente = info.cliente || '';
    const res = await withBusy(`conferindo ${dominio}`, () => window.api.checarOuvidoria({ dominio, razao: info.razao || '' }));
    if (res.log) for (const e of res.log) log(e.message, e.type);
    if (!res.ok) {
      ouvEstado.linhas.push({ dominio, cliente, erro: true, motivo: res.error || 'erro', situacao: res.error || 'erro', ativarSsl: '' });
      if (res.precisaReconectar) { log('Salesforce recusou o acesso. Reconecte e rode de novo.', 'error'); break; }
    } else if (!res.achou) {
      ouvEstado.linhas.push({ dominio, cliente, achou: false, motivo: res.motivo, situacao: `não encontrado no Salesforce (${res.motivo})`, ativarSsl: 'revisar' });
    } else {
      ouvEstado.linhas.push({ dominio, cliente, achou: true, razao: res.razao, situacao: res.situacao, ativarSsl: res.ativarSsl });
    }
    renderOuvidoria();
  }
  ouvEstado.rodando = false;
  ouvEstado.parar = false;
  ouvEstado.feito = true;
  const achados = ouvEstado.linhas.filter((l) => l.achou).length;
  const revisar = ouvEstado.linhas.filter((l) => !l.achou && !l.erro).length;
  log(`Ouvidoria: ${achados} achado(s), ${revisar} para revisão manual, de ${ouvEstado.linhas.length} conferido(s). Clique em "Salvar planilha" para exportar.`, 'success');
  renderOuvidoria();
}

async function exportarOuvidoria() {
  const outros = ouvEstado.outros || [];
  if (!ouvEstado.linhas.length && !outros.length) { log('Nada para exportar ainda.', 'warn'); return; }
  // Aba 1: o resultado dos BC/MPI conferidos. Aba 2: os ignorados (não BC/MPI).
  const abas = [
    {
      aba: 'Resultado',
      colunas: ['Razão Social', 'Domínio', 'Cliente', 'Situação', 'Ativar SSL?'],
      linhas: ouvEstado.linhas.map((l) => [l.razao || '', l.dominio, l.cliente || '', l.situacao || '', l.ativarSsl || '']),
    },
    {
      aba: 'Outros clientes',
      colunas: ['Domínio', 'Cliente'],
      linhas: outros.map((o) => [o.dominio, o.cliente || '']),
    },
  ];
  const res = await window.api.exportarPlanilha({ nomeSugerido: 'ouvidoria-ssl.xlsx', abas });
  if (!res.ok) { log(res.error, 'error'); return; }
  if (res.cancelado) { log('Exportação cancelada.', 'info'); return; }
  log(`Planilha salva em ${res.caminho} (${res.linhas} linha(s), ${outros.length ? 'com aba "Outros clientes"' : 'aba única'}).`, 'success');
}

// ---------- Ferramenta: Quando publicou (ADR-135) ----------
//
// Lista de domínios → para cada um, a tarefa de publicação concluída no
// Salesforce (data de conclusão) e, sem ela, o commit do geral.php /
// client.inc.php no Bitbucket. Quem decide é o processo principal
// (publicacao:quando); aqui é a lista, a tabela e a planilha.

let qpEstado = { dominios: [], texto: '', origem: '', rodando: false, parar: false, linhas: [] };

function renderQuandoTool() {
  el.leftPanel.innerHTML = `
    ${backButtonHtml()}
    <div class="sec anim-in">
    <div class="sec-head"><span class="sec-title">Quando foi publicado</span><span class="sec-meta">${hubSfConectado ? 'SFDC + Bitbucket' : 'salesforce desconectado · só Bitbucket'}</span></div>
    <div class="tool-sub" style="margin:0 0 12px">Por domínio: a tarefa de publicação concluída no Salesforce; sem ela, o commit do geral.php / client.inc.php no Bitbucket</div>
    <label class="field">
      <span>Planilha de domínios (.xlsx, .csv ou colado)</span>
      <input id="qpFile" type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
    </label>
    <label class="field">
      <span>ou cole os domínios (um por linha; o resto da linha é ignorado) <span class="tag" id="qpContagem">${qpEstado.dominios.length ? `${qpEstado.dominios.length} domínios` : ''}</span></span>
      <textarea id="qpTexto" rows="6" placeholder="cliente1.com.br\ncliente2.com.br - anotação qualquer" autocomplete="off">${escapeHtml(qpEstado.texto || '')}</textarea>
    </label>
    </div>
    <div id="qpResumo"></div>
    <div id="qpAcoes"></div>
    <div id="qpLista"></div>
    ${infoBoxHtml('<p><strong>Salesforce primeiro:</strong> busca global pelo domínio (assunto e comentários) e pega a tarefa de publicação <strong>concluída</strong> mais recente; a data é a de conclusão. Sem tarefa que cite o domínio, acha a <strong>conta</strong> do cliente e olha as tarefas de publicação dos casos dela — serve para quem trocou de domínio.</p><p><strong>Depois o Bitbucket:</strong> o repositório com o nome do domínio nas workspaces das marcas e o commit que mexeu no <strong>geral.php</strong> ou no <strong>client.inc.php</strong> — o mais recente que fala em publicação, senão o mais recente. Sem repositório: <em>sem repositório</em>. Repositório sem esses commits: <em>não encontrado</em>.</p>', 'Como a data é descoberta')}
  `;
  document.getElementById('backToHub').addEventListener('click', goHome);
  document.getElementById('qpFile').addEventListener('change', async (e) => {
    const arquivo = e.target.files && e.target.files[0];
    if (!arquivo) return;
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const res = await window.api.lerPlanilha({ nome: arquivo.name, base64: btoa(bin) });
    if (!res.ok) { log(res.error, 'error'); return; }
    qpCarregar(res.linhas, arquivo.name);
  });
  const texto = document.getElementById('qpTexto');
  const doTexto = () => { qpEstado.texto = texto.value; qpCarregar(texto.value.split(/\r?\n/).map((l) => [l]), 'texto colado'); };
  texto.addEventListener('change', doTexto);
  texto.addEventListener('blur', doTexto);
  renderQuando();
}

// De cada linha, o PRIMEIRO domínio: a lista costuma vir anotada
// ("x.com.br - publicado dia 25/03", "x.com.br - domínio correto y.com.br"),
// e o resto da linha é observação, não outro domínio para consultar.
function qpCarregar(linhas, origem) {
  const vistos = new Set();
  const dominios = [];
  for (const linha of linhas || []) {
    const celulas = Array.isArray(linha) ? linha : [linha];
    let achou = '';
    for (const cel of celulas) {
      for (const tok of String(cel || '').split(/[\s,;|]+/)) {
        const d = normalizeDomain(tok);
        if (d && pareceDominio(d)) { achou = d; break; }
      }
      if (achou) break;
    }
    if (achou && !vistos.has(achou)) { vistos.add(achou); dominios.push(achou); }
  }
  qpEstado = { ...qpEstado, dominios, origem, rodando: false, parar: false, linhas: [] };
  const cont = document.getElementById('qpContagem');
  if (cont) cont.textContent = dominios.length ? `${dominios.length} domínios` : '';
  if (dominios.length) log(`Quando publicou: ${dominios.length} domínio(s) de ${origem}.`, 'info');
  renderAtalhosTerminal();
  renderQuando();
}

function qpBadge(l) {
  if (l.erro) return ['err', 'erro'];
  if (l.situacao === 'publicado') return ['ok', l.fonte === 'salesforce' ? 'Salesforce' : 'Bitbucket'];
  if (l.situacao === 'sem repositório') return ['warn', 'sem repositório'];
  return ['warn', 'não encontrado'];
}

function renderQuando() {
  const resumo = document.getElementById('qpResumo');
  const acoes = document.getElementById('qpAcoes');
  const lista = document.getElementById('qpLista');
  if (!resumo || !acoes || !lista) return;

  const n = qpEstado.linhas.length;
  const pub = qpEstado.linhas.filter((l) => l.situacao === 'publicado').length;
  resumo.innerHTML = qpEstado.dominios.length
    ? `<div class="section-label">${qpEstado.dominios.length} domínio(s)${n ? ` · ${n} consultado(s), ${pub} com data` : ''}</div>`
    : '';

  if (qpEstado.rodando) {
    acoes.innerHTML = `<button id="qpParar" class="btn caution full-width">Parar depois deste</button>`;
    document.getElementById('qpParar').addEventListener('click', () => { qpEstado.parar = true; log('Vou parar depois do domínio atual.', 'warn'); });
  } else {
    let h = '';
    if (qpEstado.dominios.length) h += `<button id="qpRun" class="btn primary full-width">${ICONS.search} Descobrir quando publicou (${qpEstado.dominios.length} domínio${qpEstado.dominios.length > 1 ? 's' : ''})</button>`;
    if (n) h += `<div style="display:flex;gap:6px;margin-top:6px"><button id="qpCopiar" class="btn ghost" style="flex:1">Copiar resultado</button><button id="qpExport" class="btn ghost" style="flex:1">Salvar planilha (.xlsx)</button></div>`;
    acoes.innerHTML = h;
    const run = document.getElementById('qpRun');
    if (run) run.addEventListener('click', rodarQuando);
    const cp = document.getElementById('qpCopiar');
    if (cp) cp.addEventListener('click', (e) => copiarQuando(e.currentTarget));
    const exp = document.getElementById('qpExport');
    if (exp) exp.addEventListener('click', exportarQuando);
  }

  lista.innerHTML = n
    ? '<div class="rows">' + qpEstado.linhas.map((l) => {
        const [cls, txt] = qpBadge(l);
        return `<div class="row is-${cls}"><div class="row__main"><div class="row__title">${escapeHtml(l.dominio)} — ${escapeHtml(l.texto || '')}</div><div class="row__sub">${escapeHtml(l.detalhe || '')}</div></div><span class="badge ${cls}">${escapeHtml(txt)}</span></div>`;
      }).join('') + '</div>'
    : '';
}

async function rodarQuando() {
  if (qpEstado.rodando || !qpEstado.dominios.length) return;
  qpEstado.rodando = true;
  qpEstado.parar = false;
  qpEstado.linhas = [];
  renderQuando();
  log(`Quando publicou: consultando ${qpEstado.dominios.length} domínio(s) no Salesforce e no Bitbucket.`, 'cmd');
  let avisouSf = false;
  for (const dominio of qpEstado.dominios) {
    if (qpEstado.parar) { log('Parado por você.', 'warn'); break; }
    const res = await withBusy(`consultando ${dominio}`, () => window.api.quandoPublicou({ dominio }));
    if (res.log) for (const e of res.log) log(e.message, e.type);
    if (!res.ok) {
      qpEstado.linhas.push({ dominio, erro: true, situacao: 'erro', texto: `erro: ${res.error || 'sem detalhe'}`, detalhe: '' });
    } else {
      if (res.semSalesforce && !avisouSf) { avisouSf = true; log('Salesforce fora nesta rodada: as datas vêm só do Bitbucket. Reconecte nas Configurações para consultar as tarefas.', 'warn'); }
      qpEstado.linhas.push({ dominio, situacao: res.situacao, quando: res.quando, fonte: res.fonte, detalhe: res.detalhe, texto: res.texto });
    }
    renderQuando();
  }
  qpEstado.rodando = false;
  qpEstado.parar = false;
  const c = (s) => qpEstado.linhas.filter((l) => l.situacao === s).length;
  log(`Quando publicou: ${c('publicado')} com data, ${c('sem repositório')} sem repositório, ${c('não encontrado')} não encontrado(s), ${c('erro')} erro(s), de ${qpEstado.linhas.length}.`, 'success');
  renderQuando();
}

function qpTextoResultado() {
  return qpEstado.linhas.map((l) => `${l.dominio} - ${l.texto}`).join('\n');
}

async function copiarQuando(btn) {
  if (!qpEstado.linhas.length) { log('Nada para copiar ainda.', 'warn'); return; }
  try {
    await window.api.copyToClipboard(qpTextoResultado());
    log(`${qpEstado.linhas.length} linha(s) copiadas ("domínio - resposta").`, 'success');
    flashCopied(btn);
  } catch (e) {
    log(`Falha ao copiar: ${e.message}`, 'error');
  }
}

async function exportarQuando() {
  if (!qpEstado.linhas.length) { log('Nada para exportar ainda.', 'warn'); return; }
  const res = await window.api.exportarPlanilha({
    nomeSugerido: 'quando-publicou.xlsx',
    colunas: ['Domínio', 'Resposta', 'Situação', 'Publicado em', 'Fonte', 'Detalhe'],
    linhas: qpEstado.linhas.map((l) => [l.dominio, l.texto || '', l.situacao || '', l.quando || '', l.fonte || '', l.detalhe || '']),
    aba: 'Quando publicou',
  });
  if (!res.ok) { log(res.error, 'error'); return; }
  if (res.cancelado) { log('Exportação cancelada.', 'info'); return; }
  log(`Planilha salva em ${res.caminho} (${res.linhas} linha(s)).`, 'success');
}

// ---------- Tela inicial (Hub) ----------

// O nome do usuário logado para a saudação (ADR-113). Vem do processo (Salesforce
// se conectado, senão do e-mail); enquanto não chega, mostra o que dá para
// derivar do e-mail do Bitbucket aqui mesmo.
let hubUsuario = null;
function nomeDoEmailLocal(email) {
  const local = String(email || '').split('@')[0] || '';
  return local.split(/[._-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function primeiroNome(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }

function renderHome() {
  const nome = hubUsuario || nomeDoEmailLocal(state.creds?.email) || '';
  const marca = brandName(state.brand);
  const nFilas = sfKanban.dados ? sfKanban.dados.filas.length : 0;

  el.leftPanel.innerHTML = `
    <div class="home-head anim-in">
      <div class="home-head-left">
        ${NAV_ICON.terminal}
        <div class="home-hi">
          <span class="home-hi__ola">Bem-vindo(a), <span class="home-hi__nome">${escapeHtml(primeiroNome(nome) || 'você')}</span>${marca ? ` <span class="dim" style="font-weight:500">(${escapeHtml(marca)})</span>` : ''}</span>
          <span class="home-hi__sub">${escapeHtml(nome || 'Hub')} · ambiente local</span>
        </div>
      </div>
      <div class="home-head-right">
        <span class="home-pill ${hubSfConectado ? 'cyan' : 'dim'}">${hubSfConectado ? `${nFilas} fila(s) online` : 'SFDC off'}</span>
        <span class="home-pill ${state.creds ? '' : 'dim'}">${state.creds ? 'Bitbucket ativo' : 'Bitbucket off'}</span>
      </div>
    </div>

    <div class="home-grid">
      <div class="home-col">
        <div class="home-sec-title anim-in">${NAV_ICON.deploy}Filas ativas de produção <span class="r">${sfKanban.carregando ? 'lendo…' : hubSfConectado ? 'salesforce' : 'offline'}</span></div>
        <div class="filas anim-in" id="homeFilas"></div>
        <div id="homeSf" class="anim-in"></div>
      </div>
      <div class="home-col">
        <div class="whois-card anim-in">
          <div class="whois-head">${ICONS.search || ''}<div class="section-label">Pesquisa de apontamento &amp; DNS</div><span class="spacer"></span><span class="home-pill cyan">whois/dns</span></div>
          <div class="whois-row">
            <input id="whoisDominio" type="text" placeholder="ex: cliente.com.br" value="${escapeHtml(whoisEstado.dominio || '')}" autocomplete="off" />
            <button id="whoisBtn" class="btn primary" ${whoisEstado.rodando ? 'disabled' : ''}>${whoisEstado.rodando ? 'Consultando...' : 'Consultar'}</button>
          </div>
          <div id="whoisResultado"></div>
        </div>
      </div>
    </div>
  `;
  // A grade "Automações & scripts" saiu daqui (ADR-127): as ferramentas estão
  // na barra lateral, e a busca do topo (Ctrl+K) abre qualquer uma pelo nome.

  renderWhois();
  renderHomeFilas();
  renderHomeResumoSf();
  if (hubSfConectado && !sfKanban.dados && !sfKanban.carregando) carregarTarefasSf(false);

  const wd = document.getElementById('whoisDominio');
  wd.addEventListener('input', (e) => { whoisEstado.dominio = e.target.value.trim(); renderAtalhosTerminal(); });
  wd.addEventListener('keydown', (e) => { if (e.key === 'Enter') consultarWhois(); });
  document.getElementById('whoisBtn').addEventListener('click', consultarWhois);

  // Puxa o nome de verdade (Salesforce/e-mail) uma vez e re-renderiza a saudação.
  if (hubUsuario === null && window.api.usuarioLogado) {
    hubUsuario = '';
    window.api.usuarioLogado().then((r) => {
      if (r && r.ok && r.nome) {
        hubUsuario = r.nome;
        atualizarTopbar();
        renderAtalhosTerminal();
        if (state.view === 'home') { const el2 = document.querySelector('.home-hi__nome'); const sub = document.querySelector('.home-hi__sub'); if (el2) el2.textContent = primeiroNome(r.nome); if (sub) sub.textContent = `${r.nome} · ambiente local`; }
      }
    }).catch(() => {});
  }
}

// ---------- WHOIS + DNS na tela inicial (ADR-113) ----------

let whoisEstado = { dominio: '', rodando: false, resultado: null };

async function consultarWhois() {
  const dominio = normalizeDomain(whoisEstado.dominio);
  if (!dominio) { log('Informe um domínio para consultar.', 'error'); return; }
  whoisEstado.rodando = true;
  whoisEstado.resultado = null;
  renderHome();
  const res = await withBusy(`consultando ${dominio}`, () => window.api.whois({ dominio }));
  whoisEstado.rodando = false;
  if (!res || !res.ok) { whoisEstado.resultado = { erro: (res && res.error) || 'falhou' }; log(`WHOIS/DNS: ${(res && res.error) || 'falhou'}`, 'error'); }
  else { whoisEstado.resultado = res; log(`WHOIS/DNS de ${dominio}: ${res.dns.ns.length} nameserver(s), ${res.dns.a.length} A.`, 'success'); }
  renderHome();
}

function renderWhois() {
  const wrap = document.getElementById('whoisResultado');
  if (!wrap) return;
  const r = whoisEstado.resultado;
  if (!r) { wrap.innerHTML = ''; return; }
  if (r.erro) { wrap.innerHTML = `<div class="whois-res"><div class="whois-bloco">Não consegui consultar: ${escapeHtml(r.erro)}</div></div>`; return; }
  const dns = r.dns || {};
  const w = r.whois || {};
  const c = w.campos || {};
  const linha = (rot, val) => val ? `<dt>${escapeHtml(rot)}</dt><dd>${escapeHtml(val)}</dd>` : '';
  const nsDns = (dns.ns || []);
  const nsWhois = (c.nameservers || []);
  const nsMostrar = nsDns.length ? nsDns : nsWhois;
  wrap.innerHTML = `<div class="whois-res">
    <div class="whois-bloco">
      <h4>DNS em uso <span class="ns-cyan">(nameservers)</span></h4>
      ${nsMostrar.length ? `<ul class="whois-list">${nsMostrar.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : '<div class="whois-kv"><dt>—</dt><dd>não achei nameservers (o domínio existe e está delegado?)</dd></div>'}
      <dl class="whois-kv" style="margin-top:8px">
        ${dns.a && dns.a.length ? `<dt>A (raiz)</dt><dd>${escapeHtml(dns.a.join(', '))}</dd>` : ''}
        ${dns.mx && dns.mx.length ? `<dt>MX</dt><dd>${escapeHtml(dns.mx.join(' · '))}</dd>` : ''}
      </dl>
    </div>
    <div class="whois-bloco">
      <h4>WHOIS</h4>
      ${w.erro ? `<div class="whois-kv"><dt>—</dt><dd>WHOIS indisponível: ${escapeHtml(w.erro)}</dd></div>` : `<dl class="whois-kv">
        ${linha('Titular', c.titular)}
        ${linha('Registrador', c.registrador)}
        ${linha('Criado', c.criado)}
        ${linha('Expira', c.expira)}
        ${linha('Status', c.status)}
      </dl>`}
      ${w.aviso ? `<div class="whois-kv" style="margin-top:6px"><dt>nota</dt><dd>${escapeHtml(w.aviso)}</dd></div>` : ''}
      ${w.texto ? `<details class="whois-raw"><summary>Ver WHOIS completo</summary><pre>${escapeHtml(w.texto)}</pre></details>` : ''}
    </div>
  </div>`;
}

function backButtonHtml({ tabs = '' } = {}) {
  const m = MODULES.find((x) => x.id === state.view);
  const nome = (m && m.nome) || (TOOLS.find((t) => t.id === state.view) || {}).name || '';
  const tag = (m && m.tag) || 'MOD_' + String(state.view || '').toUpperCase();
  return `<div class="tool-head anim-in">
    <button class="th-back" id="backToHub">${ICONS.hub}<span>Hub</span></button>
    <span class="th-sep">/</span><span class="th-name">${escapeHtml(nome)}</span>
    ${tabs}
    <span class="th-tag" ${tabs ? 'style="margin-left:8px"' : ''}>${escapeHtml(tag)}</span>
  </div>`;
}

// Abas no cabeçalho da ferramenta (Parâmetros | Etapas, Fila | Histórico…).
function toolTabsHtml(abas, ativa, attr) {
  return `<div class="tool-tabs">${abas.map((a) => `<button class="${a.id === ativa ? 'active' : ''}" data-${attr}="${escapeHtml(a.id)}">${escapeHtml(a.nome)}${a.n !== undefined ? `<span class="n">(${a.n})</span>` : ''}</button>`).join('')}</div>`;
}

// O texto explicativo de cada ferramenta vira uma caixa dobrável, como nos
// mockups: "Como funciona essa automação", fechada por padrão.
function infoBoxHtml(corpoHtml, titulo = 'Como funciona essa automação', aberta = false) {
  return `<details class="info-box anim-in" ${aberta ? 'open' : ''}><summary>${escapeHtml(titulo)}</summary><div class="info-body">${corpoHtml}</div></details>`;
}

function statCardHtml({ rotulo, titulo, dot = '', sub = '', subCls = '', foot = '' }) {
  return `<div class="stat anim-in"><div class="stat-label"><span>${escapeHtml(rotulo)}</span></div><div class="stat-title"><span class="dot ${dot}"></span>${escapeHtml(titulo)}</div>${sub ? `<div class="stat-sub ${subCls}">${escapeHtml(sub)}</div>` : ''}${foot ? `<div class="stat-foot">${escapeHtml(foot)}</div>` : ''}</div>`;
}

// ---------- Ferramenta: Mergear PRs ----------

function renderMergeTool() {
  const abas = toolTabsHtml([{ id: 'queue', nome: 'Fila', n: state.queue.length }, { id: 'history', nome: 'Histórico', n: state.history.length }], state.mergeMode, 'merge-mode');
  el.leftPanel.innerHTML = `
    ${backButtonHtml({ tabs: abas })}
    <div class="sec anim-in" id="mergeBody"></div>
  `;

  document.getElementById('backToHub').addEventListener('click', goHome);
  el.leftPanel.querySelectorAll('[data-merge-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mergeMode = btn.dataset.mergeMode;
      renderMergeTool();
    });
  });

  if (state.mergeMode === 'queue') renderMergeQueueTab();
  else renderMergeHistoryTab();
}

function renderMergeQueueTab() {
  document.getElementById('mergeBody').innerHTML = `
    <div class="add-row">
      <input id="prUrlInput" type="text" placeholder="Cole o link do PR e pressione Enter" autocomplete="off" />
      <button id="addBtn" class="btn primary">Adicionar</button>
    </div>
    <div id="queue" class="queue"></div>
  `;

  document.getElementById('addBtn').addEventListener('click', addPr);
  document.getElementById('prUrlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPr();
  });

  renderQueue();
}

function renderQueue() {
  const queueEl = document.getElementById('queue');
  if (!queueEl) return;

  if (state.queue.length === 0) {
    queueEl.innerHTML = `
      <div class="empty-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M6 3v12a3 3 0 0 0 3 3h9" stroke-linecap="round"/>
          <circle cx="6" cy="18" r="2.5"/>
          <circle cx="18" cy="6" r="2.5"/>
        </svg>
        <p>Nenhum PR na fila ainda.<br/>Cole um link acima para começar.</p>
      </div>`;
    return;
  }

  queueEl.innerHTML = '';
  for (const item of state.queue) {
    queueEl.appendChild(renderCard(item));
  }
}

function badge(text, kind) {
  return `<span class="badge ${kind}">${text}</span>`;
}

function buildStateBadge(buildState) {
  switch (buildState) {
    case 'SUCCESSFUL': return badge('Build ok', 'ok');
    case 'FAILED': return badge('Build falhou', 'err');
    case 'INPROGRESS': return badge('Build em andamento', 'warn');
    default: return badge('Sem build', 'neutral');
  }
}

function approvalsBadge(approvals) {
  return approvals > 0
    ? badge(`${approvals} aprovaç${approvals > 1 ? 'ões' : 'ão'}`, 'ok')
    : badge('Sem aprovação', 'warn');
}

function buildDeployCommand(domain, variant) {
  const base = `cd web/${domain}/public_html`;
  switch (variant) {
    case 'no-rebase':
      return `${base} && git pull --no-rebase`;
    case 'full':
      return `${base} && git add -A && (git commit -m "wip: ajustes locais no servidor" || true) && git pull --no-rebase && git push`;
    default:
      return `${base} && git pull`;
  }
}

function renderCard(item) {
  const wrap = document.createElement('div');
  wrap.className = `card card--pr ${item.status === 'loading' ? 'loading' : ''} ${item.status === 'merged' ? 'merged' : ''}`;

  if (item.status === 'loading') {
    wrap.innerHTML = `
      <div class="card__meta">${item.workspace || ''}${item.repo ? '/' + item.repo : ''}</div>
      <div class="card__title">Buscando informações do PR...</div>`;
    return wrap;
  }

  if (item.status === 'error') {
    // O card de erro sai do eixo "categoria" e entra no de estado: vermelho.
    wrap.className = 'card card--error';
    wrap.innerHTML = `
      <div class="card__meta">${escapeHtml(item.url)}</div>
      <div class="card__title">${escapeHtml(item.error || 'Erro ao carregar PR')}</div>
      <div class="card__actions">
        <button class="btn danger" data-action="remove" data-id="${item.localId}">Remover</button>
      </div>`;
    attachCardEvents(wrap);
    return wrap;
  }

  const merged = item.status === 'merged';
  const mergeDisabled = item.status === 'merging' || merged;
  const mergeLabel =
    item.status === 'merging' ? 'Mergeando...' :
    merged ? 'Mergeado' : 'Mergear';

  // PR sem aprovação ou com build quebrado ganha o botão âmbar: o aviso
  // aparece antes de clicar, não só no confirm() depois.
  const risky = !merged && (item.approvals === 0 || item.buildState === 'FAILED');
  // Mergeado vira estado, não ação, sai do botão preenchido pra parar de ser
  // a coisa mais chamativa de um card que já terminou.
  const mergeVariant = merged ? 'ghost' : risky ? 'caution' : 'primary';

  const deployBtn = item.status === 'merged'
    ? `<div class="deploy-row">
        <select class="deploy-select" data-role="deploy-variant" data-id="${item.localId}">
          <option value="pull">Pull simples</option>
          <option value="no-rebase">Pull --no-rebase (divergência)</option>
          <option value="full">Add + commit + pull + push (alterações locais)</option>
        </select>
        <button class="btn copy full-width" data-action="deploy" data-id="${item.localId}">Copiar comando</button>
      </div>`
    : '';

  wrap.innerHTML = `
    <div class="card__meta">${item.workspace}/${item.repo} · #${item.id}</div>
    <div class="card__title">${escapeHtml(item.title)} <span class="card__author">por ${escapeHtml(item.author)}</span></div>
    <div class="card__branches">${escapeHtml(item.sourceBranch)} → ${escapeHtml(item.destBranch)}</div>
    <div class="badges">
      ${approvalsBadge(item.approvals)}
      ${buildStateBadge(item.buildState)}
    </div>
    <div class="card__actions">
      <button class="btn danger" data-action="remove" data-id="${item.localId}" ${mergeDisabled && item.status !== 'merged' ? 'disabled' : ''}>Remover</button>
      <button class="btn ${mergeVariant}" data-action="merge" data-id="${item.localId}" ${mergeDisabled ? 'disabled' : ''}${risky ? ' title="Sem aprovação ou build falhou, o app confirma antes de mergear."' : ''}>${mergeLabel}</button>
    </div>
    ${deployBtn}`;

  attachCardEvents(wrap);
  return wrap;
}

function attachCardEvents(wrap) {
  wrap.querySelectorAll('[data-action="remove"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.queue = state.queue.filter((q) => q.localId !== btn.dataset.id);
      renderQueue();
    });
  });
  wrap.querySelectorAll('[data-action="merge"]').forEach((btn) => {
    btn.addEventListener('click', () => mergeItem(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="deploy"]').forEach((btn) => {
    btn.addEventListener('click', () => copyPrDeployCommand(btn.dataset.id));
  });
}

async function copyPrDeployCommand(localId) {
  const item = state.queue.find((q) => q.localId === localId);
  if (!item) return;

  const select = document.querySelector(`[data-role="deploy-variant"][data-id="${localId}"]`);
  const variant = select ? select.value : 'pull';
  const command = buildDeployCommand(item.repo, variant);
  const btn = document.querySelector(`[data-action="deploy"][data-id="${localId}"]`);
  await copyCommandWithFeedback(command, btn);
}

const GUACAMOLE_HINT = 'Cole no terminal do Guacamole (Ctrl+Shift+V ou colar pelo menu lateral) e pressione Enter.';

async function copyCommandWithFeedback(command, btn, hint = GUACAMOLE_HINT) {
  try {
    await window.api.copyToClipboard(command);
    log(`Copiado para a área de transferência: ${command}`, 'success');
    if (hint) log(hint, 'info');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'Copiado!';
      btn.classList.add('copied');
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
        btn.disabled = false;
      }, 1500);
    }
  } catch (e) {
    log(`Falha ao copiar para a área de transferência: ${e.message}`, 'error');
  }
}

async function addPr() {
  const input = document.getElementById('prUrlInput');
  const url = input.value.trim();
  if (!url) return;
  if (!state.creds) {
    log('Configure seu e-mail e API token antes de buscar PRs (ícone de engrenagem).', 'error');
    openSettings();
    return;
  }

  input.value = '';
  // `localId` identifica a linha da fila; `id` (que chega no res.pr) é o número
  // do PR. Eram a mesma chave, e o spread abaixo sobrescrevia uma pela outra, // com dois PRs #42 de repositórios diferentes na fila, mergear ou remover um
  // acertava o outro.
  const localId = genId();
  state.queue.unshift({ localId, url, status: 'loading' });
  renderQueue();

  log(`GET pull request → ${url}`, 'cmd');
  const res = await withBusy('buscando pr', () => window.api.fetchPr({ url, creds: state.creds }));
  const idx = state.queue.findIndex((q) => q.localId === localId);
  if (idx === -1) return;

  if (!res.ok) {
    state.queue[idx] = { ...state.queue[idx], status: 'error', error: res.error };
    log(res.error, 'error');
    renderQueue();
    return;
  }

  state.queue[idx] = { ...state.queue[idx], ...res.pr, localId, status: 'ready' };
  log(`PR #${res.pr.id} carregado: "${res.pr.title}" (${res.pr.approvals} aprovação/ões, build: ${res.pr.buildState})`, 'success');
  renderQueue();
}

async function mergeItem(localId) {
  const idx = state.queue.findIndex((q) => q.localId === localId);
  if (idx === -1) return;
  const item = state.queue[idx];

  if (item.approvals === 0) {
    const proceed = confirm(`O PR #${item.id} não tem aprovações. Mergear mesmo assim?`);
    if (!proceed) return;
  }
  if (item.buildState === 'FAILED') {
    const proceed = confirm(`O build do PR #${item.id} falhou. Mergear mesmo assim?`);
    if (!proceed) return;
  }

  state.queue[idx] = { ...item, status: 'merging' };
  renderQueue();

  // Tudo que sair no terminal a partir daqui é o registro deste merge.
  const marca = logMark();

  log(`POST merge → ${item.workspace}/${item.repo} #${item.id} (${state.strategy})`, 'cmd');
  const res = await withBusy('mergeando', () =>
    window.api.mergePr({
      workspace: item.workspace,
      repo: item.repo,
      id: item.id,
      strategy: state.strategy,
      closeSourceBranch: state.closeSourceBranch,
      creds: state.creds,
    })
  );

  if (!res.ok) {
    log(`Falha ao mergear PR #${item.id}: ${res.error}`, 'error');
  } else {
    log(`PR #${item.id} mergeado com sucesso (${res.mergedHash ? res.mergedHash.slice(0, 8) : 'ok'})`, 'success');
  }

  // Registra tentativa que deu certo E tentativa que falhou: saber por que um
  // merge não passou é justamente o que some quando o terminal é limpo.
  await recordMerge(item, res, logSince(marca));

  // Só depois do await, senão o card pode ter sido removido nesse meio-tempo.
  const idx2 = state.queue.findIndex((q) => q.localId === localId);
  if (idx2 !== -1) {
    state.queue[idx2] = { ...state.queue[idx2], status: res.ok ? 'merged' : 'ready' };
  }
  renderQueue();
}

async function recordMerge(item, res, logLines) {
  const entry = {
    id: genId(),
    at: new Date().toISOString(),
    workspace: item.workspace,
    repo: item.repo,
    prId: item.id,
    title: item.title,
    author: item.author,
    sourceBranch: item.sourceBranch,
    destBranch: item.destBranch,
    approvals: item.approvals,
    buildState: item.buildState,
    strategy: state.strategy,
    closeSourceBranch: state.closeSourceBranch,
    url: item.url,
    ok: !!res.ok,
    mergedHash: res.mergedHash || null,
    error: res.ok ? null : res.error || 'erro desconhecido',
    log: logLines,
  };

  const saved = await window.api.addMergeHistory(entry);
  if (!saved.ok) {
    // Falhar em gravar o histórico não pode contaminar o resultado do merge.
    log(`Não consegui gravar no histórico: ${saved.error}`, 'warn');
    return;
  }
  state.history.unshift(saved.entry || entry);
}

// ----- Aba "Histórico" -----

function formatHistoryDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (mesmoDia) return `hoje ${hora}`;
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `ontem ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })} ${hora}`;
}

function historyMatches(entry, filtro) {
  if (!filtro) return true;
  const alvo = [entry.repo, entry.title, entry.author, entry.sourceBranch, entry.destBranch, `#${entry.prId}`]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return alvo.includes(filtro);
}

function renderMergeHistoryTab() {
  document.getElementById('mergeBody').innerHTML = `
    <div class="search-wrap">
      ${ICONS.search}
      <input id="historySearch" class="search-input" type="text" placeholder="Filtrar por repositório, título, autor ou branch..." autocomplete="off" value="${escapeHtml(state.historyFilter)}" />
    </div>
    <div class="history-toolbar">
      <span id="historyCount" class="history-count"></span>
      <button id="historyClearBtn" class="btn danger compact">Limpar histórico</button>
    </div>
    <div id="historyList" class="queue"></div>
  `;

  const search = document.getElementById('historySearch');
  search.addEventListener('input', () => {
    state.historyFilter = search.value.trim().toLowerCase();
    renderHistoryList();
  });

  document.getElementById('historyClearBtn').addEventListener('click', async () => {
    if (!state.history.length) return;
    if (!confirm(`Apagar as ${state.history.length} entradas do histórico? Não dá pra desfazer.`)) return;
    const res = await window.api.clearMergeHistory();
    if (!res.ok) {
      log(`Não consegui limpar o histórico: ${res.error}`, 'error');
      return;
    }
    state.history = [];
    log('Histórico de merges apagado.', 'info');
    renderHistoryList();
  });

  renderHistoryList();
}

function renderHistoryList() {
  const wrap = document.getElementById('historyList');
  if (!wrap) return;

  const filtrados = state.history.filter((e) => historyMatches(e, state.historyFilter));
  const contador = document.getElementById('historyCount');
  if (contador) {
    contador.textContent = state.historyFilter
      ? `${filtrados.length} de ${state.history.length}`
      : `${state.history.length} merge${state.history.length === 1 ? '' : 's'}`;
  }

  if (!state.history.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        ${ICONS.historyBig}
        <p>Nenhum merge registrado ainda.<br/>Cada merge feito na aba <strong>Fila</strong> entra aqui com o trecho do terminal daquele momento.</p>
      </div>`;
    return;
  }

  if (!filtrados.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <p>Nada no histórico bate com <strong>${escapeHtml(state.historyFilter)}</strong>.</p>
      </div>`;
    return;
  }

  wrap.innerHTML = '';
  for (const entry of filtrados) wrap.appendChild(renderHistoryCard(entry));
}

function renderHistoryCard(entry) {
  const card = document.createElement('div');
  card.className = `card ${entry.ok ? 'card--result' : 'card--error'}`;

  const estrategia = { merge_commit: 'merge commit', squash: 'squash', fast_forward: 'fast forward' }[entry.strategy] || entry.strategy;

  const badges = [
    entry.ok ? badge('Mergeado', 'ok') : badge('Falhou', 'err'),
    approvalsBadge(entry.approvals),
    buildStateBadge(entry.buildState),
    badge(estrategia, 'neutral'),
    entry.mergedHash ? badge(entry.mergedHash.slice(0, 8), 'neutral raw') : '',
  ].join('');

  const erro = entry.ok
    ? ''
    : `<div class="history-error">${escapeHtml(entry.error || '')}</div>`;

  const linhas = entry.log || [];
  const trecho = linhas.length
    ? `<details class="log-excerpt">
         <summary>Terminal no momento do merge · ${linhas.length} linha${linhas.length === 1 ? '' : 's'}${entry.logTrimmed ? ' (cortado)' : ''}</summary>
         <div class="log-excerpt-body" data-role="excerpt"></div>
       </details>`
    : `<div class="pick-empty">Sem trecho de terminal guardado.</div>`;

  card.innerHTML = `
    <div class="card__meta">${escapeHtml(entry.workspace)}/${escapeHtml(entry.repo)} · #${escapeHtml(String(entry.prId))} · ${escapeHtml(formatHistoryDate(entry.at))}</div>
    <div class="card__title">${escapeHtml(entry.title || 'PR sem título')} <span class="card__author">${entry.author ? 'por ' + escapeHtml(entry.author) : ''}</span></div>
    <div class="card__branches">${escapeHtml(entry.sourceBranch)} → ${escapeHtml(entry.destBranch)}</div>
    <div class="badges">${badges}</div>
    ${erro}
    ${trecho}
    <div class="card__actions">
      <button class="btn danger compact" data-history-remove="${entry.id}">Remover</button>
      <button class="btn ghost compact" data-history-copy="${entry.id}">Copiar log</button>
      <button class="btn copy compact" data-history-deploy="${entry.id}">Comando de deploy</button>
    </div>`;

  // As linhas do terminal são montadas pelo mesmo código do terminal ao vivo,
  // pra ficarem idênticas, e porque assim o texto nunca entra por innerHTML.
  const corpo = card.querySelector('[data-role="excerpt"]');
  if (corpo) for (const linha of linhas) corpo.appendChild(logLineElement(linha));

  card.querySelector('[data-history-remove]').addEventListener('click', async () => {
    const res = await window.api.removeMergeHistory(entry.id);
    if (!res.ok) {
      log(`Não consegui remover do histórico: ${res.error}`, 'error');
      return;
    }
    state.history = state.history.filter((e) => e.id !== entry.id);
    renderHistoryList();
  });

  card.querySelector('[data-history-copy]').addEventListener('click', async (e) => {
    const texto = linhas.map((l) => `${l.ts} ${l.message}`).join('\n');
    try {
      await window.api.copyToClipboard(texto);
      log(`Log do merge de ${entry.repo} #${entry.prId} copiado.`, 'success');
      flashCopied(e.currentTarget);
    } catch (err) {
      log(`Falha ao copiar: ${err.message}`, 'error');
    }
  });

  card.querySelector('[data-history-deploy]').addEventListener('click', (e) =>
    copyCommandWithFeedback(buildDeployCommand(entry.repo, 'pull'), e.currentTarget)
  );

  return card;
}

// ---------- Ferramenta: Criar propriedades (GA + GTM + reCAPTCHA + Search Console) ----------

function geralPhpTemplate(v) {
  // 'xxxx' continua sendo o marcador de "preencha à mão", é o que aparece
  // quando ninguém informou o painel.
  return `$idProjetoBusca = '${v.idProjetoBusca || 'xxxx'}';
$idCliente = '';


// GOOGLE
$idAnalytics = '${v.idAnalytics || ''}';
$tagmanager = '${v.tagmanager || ''}';
$googleSearchConsole = '${v.googleSearchConsole || ''}';

// RECAPTCHA
$siteKey = '${v.siteKey || ''}';
$secretKey = '${v.secretKey || ''}';`;
}

function flashCopied(btn, label = 'Copiado!') {
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = label;
  btn.classList.add('copied');
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copied');
    btn.disabled = false;
  }, 1500);
}

async function copyGeralTemplate(template, btn) {
  try {
    await window.api.copyToClipboard(template);
    log('Template do geral.php copiado para a área de transferência.', 'success');
    flashCopied(btn);
  } catch (e) {
    log(`Falha ao copiar: ${e.message}`, 'error');
  }
}

// Commita o geral.php do repositório do domínio direto no Bitbucket.
// Nunca trava o fluxo: qualquer falha vira aviso destacado no terminal.
// A workspace da marca; o campo "Padrão" só entra quando ela está vazia. Vazio
// nos dois, o processo principal tenta descobrir, que é o caminho que falha
// quando o token não tem read:workspace.
// O valor que vai para $idProjetoBusca: o fixo da marca, ou o que foi digitado.
// Mesma limpeza que o processo principal faz (ADR-044), aqui só para a pessoa
// VER o domínio corrigido antes de apertar o botão.
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

function panelIdForBrand(brand) {
  if (!brandHasPanel(brand)) return '';
  return fixedPanelId(brand) || (state.npPanelId || '').trim();
}

function workspaceForBrand(brand) {
  return (state.bitbucketWorkspaces?.[brand] || '').trim() || (state.bitbucketWorkspace || '').trim();
}

// A sequência da MPI+, e a ordem importa (ADR-038): as integrações primeiro,
// porque é o painel quem publica o arquivo de verificação no site; só então
// dá para verificar no Search Console e mandar o sitemap; e só com a
// propriedade verificada o trilho do Search Console no relatório passa.
async function publicarMpiPlus(v, btn, opts = {}) {
  const integracoes = await sincronizarPainel(v, btn, ['integracoes'], opts);
  if (!integracoes.ok) {
    log('Parei aqui: sem as integrações no painel, verificar o Search Console não tem como dar certo.', 'warn');
    return integracoes;
  }
  // SSL ainda não ativo (o Publicar MPI+ sabe): as tags já estão no painel; o
  // Search Console e o relatório ficam para depois do SSL (ADR-100).
  if (opts.semVerificar) return { ...integracoes, scAdiado: true };
  return verificarScERelatorio(v, btn, opts);
}

// Verificar o Search Console e, só com a propriedade verificada, sincronizar
// o relatório do painel. Separado para o Publicar MPI+ rodar depois do SSL.
async function verificarScERelatorio(v, btn, opts = {}) {
  const marca = opts.brand || state.brand;
  log(`Verificando o Search Console de ${v.siteUrl}`, 'cmd');
  const prep = await withBusy('verificando o Search Console', () =>
    window.api.prepareSearchConsole({
      siteUrl: v.siteUrl,
      saPath: state.googleSaPath,
      brand: marca,
      verificationValue: v.googleSearchConsole || '',
      analyticsId: v.idAnalytics || '',
    })
  );
  if (prep.log) for (const entry of prep.log) log(entry.message, entry.type);

  if (!prep.ok) {
    log(
      prep.sslPendente
        ? 'Search Console e relatório do painel ficam para depois do SSL de produção (sem ele o trilho do Search Console nasce "fail").'
        : `Search Console não verificado: ${prep.error}, o relatório do painel ficaria com o trilho em "fail", ` +
            'então não vou sincronizá-lo agora. Publique o site e use "Sincronizar no painel" de novo.',
      'warn'
    );
    return prep;
  }

  // O site redirecionou para a variante com/sem www e a propriedade ficou
  // no destino (ADR-084): o relatório do painel precisa apontar para o mesmo
  // endereço, senão o trilho do Search Console nasce "fail".
  const vRelatorio = prep.redirecionou && prep.siteUrl ? { ...v, siteUrl: prep.siteUrl } : v;
  if (prep.redirecionou) log(`Relatório do painel vai usar ${prep.siteUrl} no Search Console, que é a propriedade verificada.`, 'info');

  const relatorio = await sincronizarPainel(vRelatorio, btn, ['relatorio'], opts);
  return relatorio;
}

// O que substitui o commit nos projetos da MPI+ (ADR-037): leva as chaves para
// o painel e confere a mensagem verde de cada bloco.
async function sincronizarPainel(v, btn, etapas, opts = {}) {
  // Em massa o link vem da planilha, linha a linha; na tela de um projeto só,
  // vem do campo. Quem chama diz qual é, o estado não serve para os dois.
  const bruto = opts.painelUrl !== undefined ? opts.painelUrl : state.npPainelUrl;
  const marca = opts.brand || state.brand;
  const url = normalizePainelUrl(bruto);
  if (!url) {
    log(
      bruto
        ? `O link do painel não é do ${PAINEL_MPI_HOST}, não vou sincronizar em endereço desconhecido.`
        : 'Cole o link do painel do projeto antes de sincronizar.',
      'error'
    );
    return { ok: false };
  }

  const conta = (state.brandAccounts?.[marca] || '').trim();
  if (!conta) {
    log(
      `Sem conta do Google configurada para ${brandName(marca)}, a aba Relatório do painel precisa dela. ` +
        'Vou sincronizar só as integrações.',
      'warn'
    );
  }

  const original = btn ? btn.textContent : null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sincronizando...';
  }

  log(`Sincronizando ${v.domain} no painel MPI+`, 'cmd');
  const res = await withBusy('sincronizando no painel', () =>
    window.api.syncPainel({
      url,
      etapas,
      recaptcha: { site_key: v.siteKey || '', secret_key: v.secretKey || '' },
      analyticsKey: v.idAnalytics || '',
      tagmanagerKey: v.tagmanager || '',
      // A MPI+ manda para o painel a linha do arquivo, não o token da meta
      // (ADR-043). Quando a marca não pede nada diferente, vai o token mesmo.
      searchConsoleKey: v.searchConsolePainel || v.googleSearchConsole || '',
      contaEmail: conta,
      gaAccountKey: v.analyticsAccountId || '',
      gaPropertyId: v.analyticsPropertyId || '',
      // O painel quer o domínio puro, sem a barra final da propriedade.
      gscSiteUrl: (v.siteUrl || '').replace(/\/+$/, ''),
      // Só usado quando o painel diz que o projeto é cliente legado, e mesmo
      // aí ele costuma vir do servidor. Sem campo na tela (a equipe nunca o
      // preenche); a planilha pode trazer, se um dia precisar.
      leadsExternalId: opts.externalId || '',
    })
  );

  if (res.log) for (const entry of res.log) log(entry.message, entry.type);

  if (btn) {
    btn.disabled = false;
    btn.textContent = original;
  }

  if (!res.ok) {
    log(`Sincronização no painel falhou: ${res.error}`, 'error');
    return res;
  }

  // Resposta ok sem estas listas viraria TypeError logo depois de o painel ter
  // aceitado, e derrubaria a rodada inteira em vez de só esta linha.
  const falhas = res.falhas || [];
  const feitos = res.feitos || [];
  if (!falhas.length) {
    const partes = feitos.map((f) => f.bloco);
    if (res.relatorio) partes.push('relatório');
    log(`Painel sincronizado: ${partes.join(', ') || 'nada a fazer'}.`, 'success');
  } else {
    log(
      `Painel parcialmente sincronizado. Não entraram: ${falhas.map((f) => f.bloco).join(', ')}, ` +
        'os que faltaram têm que ser feitos à mão no painel.',
      'warn'
    );
  }
  return res;
}

async function commitGeralPhp(domain, values, btn) {
  if (!brandHasBitbucket(state.brand)) {
    log(
      `${brandName(state.brand)} não tem repositório no Bitbucket, o template do geral.php está aí para copiar, ` +
        'mas não há onde commitar.',
      'warn'
    );
    return { ok: false };
  }
  if (!state.creds) {
    log('Commit automático do geral.php pulado: configure e-mail e API token do Bitbucket.', 'warn');
    return { ok: false };
  }

  const original = btn ? btn.textContent : null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Commitando...';
  }

  log(`Commitando geral.php de ${domain} com a mensagem "Ajustes para publicação"`, 'cmd');

  const workspace = workspaceForBrand(state.brand);
  if (workspace) {
    const daMarca = (state.bitbucketWorkspaces?.[state.brand] || '').trim();
    log(`Workspace: ${workspace} (${daMarca ? brandName(state.brand) : 'padrão das configurações'})`, 'info');
  } else {
    log(
      `Nenhuma workspace configurada para ${brandName(state.brand)}, vou tentar descobrir, ` +
        'o que depende de escopo que o token pode não ter.',
      'warn'
    );
  }

  const res = await withBusy('commitando', () =>
    window.api.commitGeralPhp({
      repo: domain,
      brand: state.brand,
      workspace,
      values,
      creds: state.creds,
    })
  );

  if (res.log) {
    for (const entry of res.log) log(entry.message, entry.type);
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = original;
  }

  if (res.ok && !res.skipped) {
    log(`geral.php atualizado em ${res.workspace}/${res.repo} (branch ${res.branch}).`, 'success');
  }
  return res;
}

// Criar e buscar eram abas de uma ferramenta só. Viraram duas: quem chega para
// uma reformulação não quer ver botão de criar, e vice-versa (ADR-052).
function renderNewProjectTool() {
  if (!state.npTab) state.npTab = 'create';
  const abas = toolTabsHtml([{ id: 'create', nome: 'Criar novo' }, { id: 'find', nome: 'Buscar existente' }], state.npTab, 'np-tab');
  el.leftPanel.innerHTML = `
    ${backButtonHtml({ tabs: abas })}
    <div class="sec anim-in" id="npBody"></div>
  `;
  document.getElementById('backToHub').addEventListener('click', goHome);
  el.leftPanel.querySelectorAll('[data-np-tab]').forEach((b) => b.addEventListener('click', () => { state.npTab = b.dataset.npTab; renderNewProjectTool(); }));
  if (state.npTab === 'find') renderNpFind();
  else renderNpCreate();
}

function renderFindProjectTool() {
  state.npTab = 'find';
  renderNewProjectTool();
}

// ----- Aba "Criar novo" -----

// As mesmas etapas do main.js, com o rótulo curto que cabe no botão. A
// dependência do GTM no GA4 mora aqui e lá: a tela evita a combinação
// impossível, e o processo principal recusa se ela chegar de qualquer jeito.
const NP_STEPS = [
  { id: 'analytics', label: 'Propriedade GA4 + data stream', curto: 'GA' },
  { id: 'gtm', label: 'Container do Tag Manager', curto: 'GTM', requires: 'analytics' },
  { id: 'recaptcha', label: 'Chave do reCAPTCHA', curto: 'reCAPTCHA' },
  { id: 'searchconsole', label: 'Token do Search Console', curto: 'Search Console' },
];

function npSelectedSteps() {
  const marcados = NP_STEPS.filter((e) => state.npSteps?.[e.id]).map((e) => e.id);
  // Dependência não satisfeita não vai para o pedido: sem GA4 o container
  // sairia com a variável de medição vazia.
  return marcados.filter((id) => {
    const e = NP_STEPS.find((x) => x.id === id);
    return !e.requires || marcados.includes(e.requires);
  });
}

function npCreateLabel() {
  const ids = npSelectedSteps();
  if (!ids.length) return 'Selecione o que criar';
  if (ids.length === NP_STEPS.length) return 'Criar tudo (GA + GTM + reCAPTCHA + Search Console)';
  return 'Criar ' + ids.map((id) => NP_STEPS.find((e) => e.id === id).curto).join(' + ');
}

function renderNpCreate() {
  const temBitbucket = brandHasBitbucket(state.brand);
  const painelFixo = fixedPanelId(state.brand);
  const temPainel = brandHasPanel(state.brand);
  const usaPainelMpi = brandUsesMpiPanel(state.brand);

  const stepsHtml = NP_STEPS.map((e) => {
    const marcado = !!state.npSteps?.[e.id];
    const travado = e.requires && !state.npSteps?.[e.requires];
    const dep = e.requires ? NP_STEPS.find((x) => x.id === e.requires) : null;
    return `
      <label class="checkbox-field step ${travado ? 'disabled' : ''}">
        <input type="checkbox" data-step="${e.id}" ${marcado && !travado ? 'checked' : ''} ${travado ? 'disabled' : ''} />
        <span>${escapeHtml(e.label)}${travado ? `, precisa de "${escapeHtml(dep.curto)}"` : ''}</span>
      </label>`;
  }).join('');

  document.getElementById('npBody').innerHTML = `
    ${brandSelectHtml('npBrandSelect')}
    <label class="field">
      <span>Domínio do novo projeto</span>
      <input id="npDomainInput" type="text" placeholder="ex: meusite.com.br" autocomplete="off" />
    </label>
    <label class="field">
      <span>Razão social (para a planilha de publicações, opcional)</span>
      <input id="npRazaoInput" type="text" placeholder="ex: EMPRESA EXEMPLO LTDA" value="${escapeHtml(state.npRazao || '')}" autocomplete="off" />
    </label>
    ${usaPainelMpi
      ? `<label class="field">
      <span>Link do painel do projeto</span>
      <input id="npPainelUrlInput" type="text" placeholder="https://${PAINEL_MPI_HOST}/clientes/.../hub?projeto=...&tab=publicacao" value="${escapeHtml(state.npPainelUrl || '')}" autocomplete="off" />
    </label>
    <p class="hint">Esta tela só cria as propriedades e sincroniza as tags no painel. A publicação inteira de um MPI+ (contato técnico no Registro.br, zona na Cloudflare, aprovar, publicar, SSL, tags e a linha na planilha) é o <strong>Publicar MPI+</strong>, que reaproveita tudo que já existir. <button type="button" class="btn ghost compact" id="npIrPublicar">Abrir Publicar MPI+ com estes dados</button></p>`
      : ''}
    ${!temPainel
      ? ''
      : painelFixo
      ? `<p class="hint">Painel do cliente: <code>$idProjetoBusca = '${escapeHtml(painelFixo)}'</code>, fixo para ${escapeHtml(brandName(state.brand))}.</p>`
      : `<label class="field">
      <span>Painel do cliente (<code>$idProjetoBusca</code>)</span>
      <input id="npPanelInput" type="text" inputmode="numeric" placeholder="ex: 24" value="${escapeHtml(state.npPanelId || '')}" autocomplete="off" />
    </label>`}
    <div class="section-label">O que criar</div>
    ${stepsHtml}
    ${temBitbucket
      ? `<label class="checkbox-field after-steps">
      <input id="npAutoCommitInput" type="checkbox" ${state.npAutoCommit ? 'checked' : ''} />
      <span>Commitar o geral.php no Bitbucket ao terminar</span>
    </label>`
      : ''}
    <button id="npCreateBtn" class="btn primary full-width" ${npSelectedSteps().length ? '' : 'disabled'}>${npCreateLabel()}</button>
    <p class="hint">${usaPainelMpi
      ? 'Cria nas contas da MPI+ (reaproveitando o que já existir) e, ao terminar, sincroniza no painel do projeto: Integrações, Search Console e Relatório, nessa ordem. As chaves aparecem abaixo para conferência.'
      : 'Cria nas contas do projeto escolhido. Quando a marca tem mais de uma conta, vai na mais vazia, o terminal diz qual. O repositório é o próprio domínio, e o commit vai para a branch principal com a mensagem <code>Ajustes para publicação</code>.'}</p>
    <div id="npResult"></div>
  `;

  // Trocar a marca muda a caixa do commit (MPI+ não tem Bitbucket), então a aba
  // é redesenhada, preservando o domínio já digitado.
  wireBrandSelect('npBrandSelect', () => {
    const digitado = document.getElementById('npDomainInput').value;
    renderNpCreate();
    document.getElementById('npDomainInput').value = digitado;
  });

  const domainInput = document.getElementById('npDomainInput');
  domainInput.addEventListener('change', () => {
    const limpo = normalizeDomain(domainInput.value);
    if (limpo && limpo !== domainInput.value) {
      log(`Domínio ajustado para "${limpo}".`, 'info');
      domainInput.value = limpo;
    }
  });
  const autoCommitInput = document.getElementById('npAutoCommitInput');
  const createBtn = document.getElementById('npCreateBtn');
  const resultEl = document.getElementById('npResult');

  if (autoCommitInput) {
    autoCommitInput.addEventListener('change', () => {
      state.npAutoCommit = autoCommitInput.checked;
    });
  }

  const razaoInput = document.getElementById('npRazaoInput');
  if (razaoInput) razaoInput.addEventListener('input', () => { state.npRazao = razaoInput.value.trim(); });

  const irPublicar = document.getElementById('npIrPublicar');
  if (irPublicar) irPublicar.addEventListener('click', () => irParaPublicar({
    dominio: document.getElementById('npDomainInput')?.value || '',
    razao: state.npRazao || '',
    painelUrl: state.npPainelUrl || '',
  }));

  const painelUrlInput = document.getElementById('npPainelUrlInput');
  if (painelUrlInput) {
    painelUrlInput.addEventListener('change', () => {
      state.npPainelUrl = painelUrlInput.value.trim();
      if (state.npPainelUrl && !normalizePainelUrl(state.npPainelUrl)) {
        log(`Esse link não é do painel (${PAINEL_MPI_HOST}), confira antes de criar.`, 'warn');
      }
    });
    painelUrlInput.addEventListener('input', () => {
      state.npPainelUrl = painelUrlInput.value.trim();
    });
  }

  const painelInput = document.getElementById('npPanelInput');
  if (painelInput) {
    painelInput.addEventListener('input', () => {
      // Só dígito: o valor vai virar string PHP, e letra ali é engano de digitação.
      const limpo = painelInput.value.replace(/\D/g, '');
      if (limpo !== painelInput.value) painelInput.value = limpo;
      state.npPanelId = limpo;
    });
  }

  // Redesenha porque desmarcar o GA4 trava o GTM e muda o rótulo do botão, // guardar o domínio digitado antes, senão o campo esvazia na cara da pessoa.
  document.querySelectorAll('#npBody [data-step]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      state.npSteps = { ...state.npSteps, [cb.dataset.step]: cb.checked };
      const digitado = domainInput.value;
      await saveHubState();
      renderNpCreate();
      const campo = document.getElementById('npDomainInput');
      campo.value = digitado;
      campo.focus();
    });
  });

  createBtn.addEventListener('click', async () => {
    const domain = normalizeDomain(domainInput.value);
    domainInput.value = domain;
    if (!domain) {
      domainInput.focus();
      return;
    }
    if (!state.googleSaPath) {
      log('Configure o caminho do arquivo da service account do Google (ícone de engrenagem).', 'error');
      openSettings();
      return;
    }

    const etapas = npSelectedSteps();
    if (!etapas.length) {
      log('Marque pelo menos uma coisa para criar.', 'warn');
      return;
    }

    // Sem painel, o geral.php sai com 'xxxx', o app não inventa número, mas
    // também não deixa passar calado.
    const painel = panelIdForBrand(state.brand);
    if (!painel && brandHasPanel(state.brand)) {
      log(
        `Painel do cliente em branco, $idProjetoBusca vai continuar como 'xxxx' e ` +
          'não entra no commit. Preencha o campo se quiser que ele vá junto.',
        'warn'
      );
    }

    createBtn.disabled = true;
    createBtn.textContent = 'Criando... isso leva alguns segundos';
    log(`Iniciando criação de propriedades para ${domain}`, 'cmd');

    const res = await withBusy('criando propriedades', () =>
      window.api.createGoogleProject({ domain, saPath: state.googleSaPath, brand: state.brand, steps: etapas })
    );

    if (res.log) {
      for (const entry of res.log) log(entry.message, entry.type);
    }

    createBtn.disabled = false;
    createBtn.textContent = npCreateLabel();

    if (!res.ok) {
      resultEl.innerHTML = `<div class="card card--error"><div class="card__title">Falha ao criar: ${escapeHtml(res.error || 'erro desconhecido')}</div></div>`;
      return;
    }

    // O painel não vem do Google: é o que a marca fixa ou o que foi digitado.
    const v = { ...res.result, idProjetoBusca: painel };
    renderNpCreateResult(resultEl, v);

    if (brandUsesMpiPanel(state.brand)) {
      await publicarMpiPlus(v, document.getElementById('npPainelBtn'));
    } else if (state.npAutoCommit && brandHasBitbucket(state.brand)) {
      await commitGeralPhp(v.domain, geralValues(v), document.getElementById('npCommitBtn'));
    }
  });

  domainInput.focus();
}

function geralValues(v) {
  return {
    idProjetoBusca: v.idProjetoBusca || '',
    idAnalytics: v.idAnalytics || '',
    tagmanager: v.tagmanager || '',
    googleSearchConsole: v.googleSearchConsole || '',
    siteKey: v.siteKey || '',
    secretKey: v.secretKey || '',
  };
}

// As chaves como lista, para quem não tem geral.php (MPI+): o que foi criado,
// com botão de copiar em cada uma. Um template PHP ali era ruído, dizia
// "$idProjetoBusca = 'xxxx'" para uma marca que nem tem painel do cliente.
function chavesDoProjeto(v) {
  const scPainel = v.searchConsolePainel || '';
  return [
    { rotulo: 'Analytics', sub: 'Measurement ID', valor: v.idAnalytics || '' },
    { rotulo: 'Tag Manager', sub: 'Container', valor: v.tagmanager || '' },
    { rotulo: 'reCAPTCHA', sub: 'Site key', valor: v.siteKey || '' },
    { rotulo: 'reCAPTCHA', sub: 'Secret key', valor: v.secretKey || '', sigilo: true },
    { rotulo: 'Search Console', sub: scPainel ? 'valor do campo no painel' : 'token da meta', valor: scPainel || v.googleSearchConsole || '' },
  ];
}

function chavesComoTexto(v) {
  return chavesDoProjeto(v)
    .filter((c) => c.valor)
    .map((c) => `${c.rotulo} (${c.sub}): ${c.valor}`)
    .join('\n');
}

function renderChavesHtml(v, pedidas) {
  const pediu = (id) => pedidas.includes(id);
  const linhas = chavesDoProjeto(v).filter((c) => {
    if (c.rotulo === 'Analytics') return pediu('analytics');
    if (c.rotulo === 'Tag Manager') return pediu('gtm');
    if (c.rotulo === 'reCAPTCHA') return pediu('recaptcha');
    return pediu('searchconsole');
  });
  return linhas
    .map((c) => {
      const mostra = c.valor ? (c.sigilo ? c.valor.slice(0, 6) + '...' + c.valor.slice(-4) : c.valor) : '';
      return `<div class="pick-row">
        <div class="pick-info">
          <span class="mono-id ${c.valor ? '' : 'faint'}">${escapeHtml(mostra)}</span>
          <span class="pick-sub">${escapeHtml(c.rotulo)} · ${escapeHtml(c.sub)}</span>
        </div>
        ${c.valor ? copyIdButton(c.valor) : '<span class="badge warn">não criado</span>'}
      </div>`;
    })
    .join('');
}

function renderNpCreateResult(resultEl, v) {
  const template = geralPhpTemplate(v);
  const semGeral = !brandHasBitbucket(state.brand);

  // As etapas de GTM/reCAPTCHA/Search Console não travam o fluxo quando falham,
  // então o título não pode prometer mais do que foi criado de fato.
  // Template do GTM aplicado pela metade também é resultado parcial: o título
  // não pode dizer "tudo criado" se três tags de evento falharam.
  const gtmParcial = v.gtmSummary?.falhas?.length
    ? `${v.gtmSummary.falhas.length} item(ns) do template do GTM`
    : null;

  // Etapa que ninguém pediu não "faltou". Sem essa distinção, criar só o
  // reCAPTCHA de propósito apareceria como três falhas.
  const pedidas = Array.isArray(v.steps) ? v.steps : NP_STEPS.map((e) => e.id);
  const pediu = (id) => pedidas.includes(id);

  const faltando = [
    pediu('analytics') && !v.idAnalytics && 'Analytics',
    pediu('gtm') && !v.tagmanager && 'Tag Manager',
    gtmParcial,
    pediu('recaptcha') && !v.siteKey && 'reCAPTCHA',
    pediu('searchconsole') && !v.googleSearchConsole && 'Search Console',
  ].filter(Boolean);

  const naoPedidas = NP_STEPS.filter((e) => !pediu(e.id)).map((e) => e.curto);

  const titulo = faltando.length
    ? `Criado parcialmente para ${escapeHtml(v.domain)}: faltou ${faltando.join(', ')}`
    : naoPedidas.length
      ? `Criado o que você pediu para ${escapeHtml(v.domain)}`
      : `Tudo criado para ${escapeHtml(v.domain)}`;

  const corpo = semGeral
    ? renderChavesHtml(v, pedidas)
    : `<pre class="code-block">${escapeHtml(template)}</pre>`;

  const acoes = semGeral
    ? `<button class="btn copy" id="npCopyChavesBtn">Copiar todas</button>
       ${brandUsesMpiPanel(state.brand) ? '<button class="btn primary" id="npPainelBtn">Sincronizar no painel</button>' : ''}`
    : `<button class="btn copy" id="npCopyTemplateBtn">Copiar template</button>
       <button class="btn primary" id="npCommitBtn">Commitar no Bitbucket</button>`;

  resultEl.innerHTML = `
    <div class="card card--result">
      <div class="card__meta">${semGeral ? 'chaves' : 'geral.php'} · ${escapeHtml(v.domain)}</div>
      <div class="card__title">${titulo}</div>
      ${naoPedidas.length ? `<div class="card__branches">não pedido: ${naoPedidas.join(' · ')}</div>` : ''}
      ${v.gtmSummary
        ? `<div class="card__branches">GTM: ${v.gtmSummary.tags} tag(s) · ${v.gtmSummary.triggers} trigger(s) · ${v.gtmSummary.variables} variável(is) · ${v.gtmSummary.builtIn} embutida(s)</div>`
        : ''}
      ${corpo}
      <div class="card__actions">${acoes}</div>
      ${semGeral && !brandUsesMpiPanel(state.brand)
        ? `<div class="pick-empty">${escapeHtml(brandName(state.brand))} não tem repositório no Bitbucket, copie as chaves e cole à mão.</div>`
        : ''}
      <div class="deploy-row">
        <button class="btn ghost full-width" id="npVerifyBtn">Verificar Search Console (depois do deploy)</button>
      </div>
      ${brandUsesMpiPanel(state.brand)
        ? `<div class="deploy-row"><button class="btn primary full-width" id="npPublicarTudoBtn">Publicar do começo ao fim: Registro.br, Cloudflare, painel, SSL e planilha</button></div>`
        : `<div class="deploy-row"><button class="btn ghost full-width" id="npPlanilhaBtn">Registrar na planilha de publicações (aba ${PLANILHA_ABA_POR_MARCA[state.brand] || 'MPI'})</button></div>`}
    </div>
  `;

  const planilhaBtn = document.getElementById('npPlanilhaBtn');
  if (planilhaBtn) planilhaBtn.addEventListener('click', (e) => registrarPlanilhaCriacao(v, e.currentTarget));

  // O MPI+ não termina aqui: as chaves são uma parte. O botão leva para o
  // Publicar MPI+ com domínio, razão social e link já preenchidos e começa
  // (ADR-073); o que já foi feito aqui é reaproveitado lá.
  const publicarTudo = document.getElementById('npPublicarTudoBtn');
  if (publicarTudo) publicarTudo.addEventListener('click', () => irParaPublicar({ dominio: v.domain, razao: state.npRazao || '', painelUrl: state.npPainelUrl || '', iniciar: true }));

  const copyTemplateBtn = document.getElementById('npCopyTemplateBtn');
  if (copyTemplateBtn) {
    copyTemplateBtn.addEventListener('click', (e) => copyGeralTemplate(template, e.currentTarget));
  }

  const copyChavesBtn = document.getElementById('npCopyChavesBtn');
  if (copyChavesBtn) {
    // Sem ecoar no terminal: a secret key do reCAPTCHA vai junto.
    copyChavesBtn.addEventListener('click', async (e) => {
      try {
        await window.api.copyToClipboard(chavesComoTexto(v));
        log(`Chaves de ${v.domain} copiadas (uma por linha).`, 'success');
        flashCopied(e.currentTarget);
      } catch (err) {
        log(`Falha ao copiar: ${err.message}`, 'error');
      }
    });
  }

  resultEl.querySelectorAll('[data-copy-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const value = btn.dataset.copyId;
      try {
        await window.api.copyToClipboard(value);
        log(`Copiado: ${value.length > 24 ? value.slice(0, 24) + '...' : value}`, 'success');
        flashCopied(btn);
      } catch (e) {
        log(`Falha ao copiar: ${e.message}`, 'error');
      }
    });
  });

  const commitBtn = document.getElementById('npCommitBtn');
  if (commitBtn) {
    commitBtn.addEventListener('click', (e) => commitGeralPhp(v.domain, geralValues(v), e.currentTarget));
  }

  const painelBtn = document.getElementById('npPainelBtn');
  if (painelBtn) {
    painelBtn.addEventListener('click', (e) => publicarMpiPlus(v, e.currentTarget));
  }

  document.getElementById('npVerifyBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = 'Verificando...';
    btn.disabled = true;
    log(`Verificando propriedade do Search Console: ${v.siteUrl}`, 'cmd');
    // Na MPI+ a verificação é por arquivo: antes de chamar o Google, confere se
    // o arquivo está mesmo no ar, e de quebra manda o sitemap (ADR-038).
    const verifyRes = await withBusy('verificando', () =>
      brandUsesMpiPanel(state.brand)
        ? window.api.prepareSearchConsole({
            siteUrl: v.siteUrl,
            saPath: state.googleSaPath,
            brand: state.brand,
            verificationValue: v.googleSearchConsole || '',
            analyticsId: v.idAnalytics || '',
          })
        : window.api.verifySearchConsole({ siteUrl: v.siteUrl, saPath: state.googleSaPath, brand: state.brand })
    );
    btn.textContent = original;
    btn.disabled = false;

    if (verifyRes.log) for (const entry of verifyRes.log) log(entry.message, entry.type);

    if (!verifyRes.ok) {
      log(`Falha ao verificar: ${verifyRes.error}. Confirme que a tag já está publicada no site.`, 'error');
      return;
    }
    log(
      verifyRes.ownerAdded
        ? `Search Console verificado e a propriedade é de ${verifyRes.ownerAdded}.`
        : 'Search Console verificado.',
      'success'
    );
  });
}

// ----- Aba "Buscar existente" (reformulação de site) -----

const NP_SEARCH_LABEL = 'Buscar Analytics e Tag Manager existentes';

function renderNpFind() {
  document.getElementById('npBody').innerHTML = `
    ${brandSelectHtml('npFindBrandSelect')}
    <label class="field">
      <span>Domínio ou nome do cliente</span>
      <input id="npSearchInput" type="text" placeholder="ex: meusite.com.br ou Nome do Cliente" autocomplete="off" />
    </label>
    <button id="npSearchBtn" class="btn primary full-width">${NP_SEARCH_LABEL}</button>
    <p class="hint">Para reformulações: procura o que o cliente já tem em vez de criar propriedades novas. A busca varre só as contas do projeto escolhido.</p>
    <div id="npFindResult"></div>
  `;

  // Trocar de marca invalida o resultado anterior, ele era de outras contas.
  wireBrandSelect('npFindBrandSelect', () => {
    state.npFind = null;
    state.npPicked = { idAnalytics: '', tagmanager: '' };
    document.getElementById('npFindResult').innerHTML = '';
  });

  const searchInput = document.getElementById('npSearchInput');
  const searchBtn = document.getElementById('npSearchBtn');

  const doSearch = async () => {
    const query = searchInput.value.trim();
    if (!query) {
      searchInput.focus();
      return;
    }
    if (!state.googleSaPath) {
      log('Configure o caminho do arquivo da service account do Google (ícone de engrenagem).', 'error');
      openSettings();
      return;
    }

    searchBtn.disabled = true;
    searchBtn.textContent = 'Buscando...';
    log(`Procurando Analytics e Tag Manager de "${query}" em ${brandName(state.brand)}`, 'cmd');

    const res = await withBusy('buscando', () =>
      window.api.findExistingGoogle({ query, saPath: state.googleSaPath, brand: state.brand })
    );

    if (res.log) {
      for (const entry of res.log) log(entry.message, entry.type);
    }

    searchBtn.disabled = false;
    searchBtn.textContent = NP_SEARCH_LABEL;

    if (!res.ok) {
      document.getElementById('npFindResult').innerHTML =
        `<div class="card card--error"><div class="card__title">${escapeHtml(res.error || 'erro desconhecido')}</div></div>`;
      return;
    }

    state.npFind = res;
    state.npPicked = autoPickedValues(res);
    renderNpFindResults();
  };

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  if (state.npFind) renderNpFindResults();
  searchInput.focus();
}

function copyIdButton(value) {
  return `<button class="btn copy compact" data-copy-id="${escapeHtml(value)}">Copiar</button>`;
}

// Com o filtro estrito, o normal é vir um resultado de cada. Quando vem
// exatamente um, ele já entra no geral.php; se vier mais de um, fica de fora
// (não dá pra adivinhar qual é o certo) e o aviso aparece no painel.
function autoPickedValues(res) {
  const gaIds = res.analytics.flatMap((p) => p.measurementIds.map((m) => m.measurementId));
  const gtmIds = res.gtm.map((c) => c.publicId);
  return {
    idAnalytics: gaIds.length === 1 ? gaIds[0] : '',
    tagmanager: gtmIds.length === 1 ? gtmIds[0] : '',
  };
}

function renderNpFindResults() {
  const wrap = document.getElementById('npFindResult');
  if (!wrap || !state.npFind) return;

  const { analytics, gtm, query } = state.npFind;

  if (!analytics.length && !gtm.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <p>Nada encontrado para <strong>${escapeHtml(query)}</strong>.<br/>Tente um pedaço do nome do cliente em vez do domínio inteiro.</p>
      </div>`;
    return;
  }

  const gaCards = analytics
    .map((p) => {
      const rows = p.measurementIds.length
        ? p.measurementIds
            .map(
              (m) => `
              <div class="pick-row">
                <div class="pick-info">
                  <span class="mono-id">${escapeHtml(m.measurementId)}</span>
                  <span class="pick-sub">${escapeHtml(m.uri || m.displayName || '')}</span>
                </div>
                ${copyIdButton(m.measurementId)}
              </div>`
            )
            .join('')
        : `<div class="pick-empty">Sem data stream web nessa propriedade.</div>`;

      return `
        <div class="card card--pick">
          <div class="card__meta">conta ${escapeHtml(p.account)}</div>
          <div class="card__title">${escapeHtml(p.displayName)}</div>
          ${rows}
        </div>`;
    })
    .join('');

  const gtmCards = gtm
    .map(
      (c) => `
      <div class="card card--pick">
        <div class="card__meta">conta ${escapeHtml(c.account)}</div>
        <div class="card__title">${escapeHtml(c.name)}</div>
        <div class="pick-row">
          <div class="pick-info">
            <span class="mono-id">${escapeHtml(c.publicId)}</span>
            <span class="pick-sub">${escapeHtml((c.domains || []).join(', '))}</span>
          </div>
          ${copyIdButton(c.publicId)}
        </div>
      </div>`
    )
    .join('');

  const gaHtml = analytics.length ? `<div class="section-label">Analytics (${analytics.length})</div>${gaCards}` : '';
  const gtmHtml = gtm.length ? `<div class="section-label">Tag Manager (${gtm.length})</div>${gtmCards}` : '';

  const picked = state.npPicked;

  // Quando a busca traz mais de um candidato, não dá pra escolher sozinho, // avisa que essa variável fica de fora em vez de chutar.
  const gaCount = analytics.reduce((n, p) => n + p.measurementIds.length, 0);
  const ambiguous = [];
  if (!picked.idAnalytics && gaCount > 1) ambiguous.push('Analytics');
  if (!picked.tagmanager && gtm.length > 1) ambiguous.push('Tag Manager');
  const ambiguousHtml = ambiguous.length
    ? `<p class="hint">Mais de um resultado de ${ambiguous.join(' e de ')}, copie o ID certo à mão. Só o que aparece acima vai no commit.</p>`
    : '';

  const reuseHtml =
    picked.idAnalytics || picked.tagmanager
      ? `
      <div class="section-label">Reaproveitar no geral.php</div>
      <div class="card card--result">
        <pre class="code-block">${escapeHtml(geralPhpTemplate(picked))}</pre>
        ${ambiguousHtml}
        <label class="field">
          <span>Repositório (domínio) para o commit</span>
          <input id="npReuseDomain" type="text" value="${escapeHtml(query)}" autocomplete="off" />
        </label>
        <div class="card__actions">
          <button class="btn copy" id="npReuseCopyBtn">Copiar template</button>
          <button class="btn primary" id="npReuseCommitBtn">Commitar no Bitbucket</button>
        </div>
      </div>`
      : '';

  wrap.innerHTML = gaHtml + gtmHtml + reuseHtml;

  wrap.querySelectorAll('[data-copy-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const value = btn.dataset.copyId;
      try {
        await window.api.copyToClipboard(value);
        log(`Copiado: ${value}`, 'success');
        flashCopied(btn);
      } catch (e) {
        log(`Falha ao copiar: ${e.message}`, 'error');
      }
    });
  });

  const copyBtn = document.getElementById('npReuseCopyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', (e) => copyGeralTemplate(geralPhpTemplate(state.npPicked), e.currentTarget));
  }

  const commitBtn = document.getElementById('npReuseCommitBtn');
  if (commitBtn) {
    commitBtn.addEventListener('click', (e) => {
      const domain = document.getElementById('npReuseDomain').value.trim();
      if (!domain) {
        log('Informe o domínio do repositório antes de commitar.', 'warn');
        return;
      }
      // Só manda o que foi escolhido, o resto do geral.php fica intacto.
      commitGeralPhp(domain, state.npPicked, e.currentTarget);
    });
  }
}

// ---------- Ferramenta: Conceder acesso (GA) ----------

// Papéis do Analytics Admin. Editor já basta pra "Criar propriedades" funcionar;
// Administrador é o padrão porque é o que costuma destravar tudo de uma vez.
const GA_ROLES = [
  { value: 'predefinedRoles/admin', label: 'Administrador' },
  { value: 'predefinedRoles/editor', label: 'Editor (suficiente pra criar propriedades)' },
  { value: 'predefinedRoles/analyst', label: 'Analista' },
  { value: 'predefinedRoles/viewer', label: 'Leitor' },
];

// No Tag Manager a permissão é de CONTA, e criar container exige Administrador
//, permissão de container não basta, por mais alta que seja.
const GTM_ROLES = [
  { value: 'admin', label: 'Administrador (necessário pra criar containers)' },
  { value: 'user', label: 'Usuário (só enxerga a conta)' },
];

// As duas superfícies do Google onde a service account precisa ser adicionada.
// São hierarquias separadas: acesso numa não implica acesso na outra.
const GRANT_TARGETS = {
  analytics: {
    label: 'Google Analytics',
    roles: GA_ROLES,
    list: (p) => window.api.listBrandAccounts(p),
    grant: (p) => window.api.grantAccessBulk(p),
    idHint: 'o número em Administrador > Detalhes da conta, no Analytics',
  },
  tagmanager: {
    label: 'Tag Manager',
    roles: GTM_ROLES,
    list: (p) => window.api.listGtmBrandAccounts(p),
    grant: (p) => window.api.grantGtmAccessBulk(p),
    idHint: 'o número embaixo do nome da conta, na tela de contas do Tag Manager',
  },
};

// ---------- Ferramenta: Vincular em massa ----------
//
// Sites que já têm Analytics, Tag Manager e Search Console e só precisam ser
// ligados ao painel. Não cria nada (ADR-047): acha o que existe, inclusive as
// propriedades batizadas "dominio.com.br - GA4", pelo domínio do data stream
// (ADR-046), e roda os mesmos dois blocos do painel que a tela de um projeto
// só roda: Configuração > Integrações e Relatório > Conexão.
//
// A planilha entra como a equipe a tem (razão social, domínio, link do painel,
// em qualquer ordem, .xlsx ou .csv ou colada do Excel). O app adivinha o que é
// cada coluna e mostra a prévia; a pessoa corrige se errou (ADR-053).

// Fora do hub-state de propósito: é uma rodada, não uma preferência.
let bulkLinhas = [];      // a planilha crua: string[][]
let bulkOrigem = '';      // nome do arquivo (ou "texto colado"), para a rodada salva
let bulkMapa = null;      // { razao, dominio, painel } -> índice da coluna, ou -1
let bulkTemCabecalho = false;
let bulkRows = [];
let bulkRodando = false;
let bulkParar = false;
let bulkParouNoMeio = false; // "Parar agora": o site do meio fica para retomar (ADR-102)
let bulkCriar = true;       // criar no Google o que não existir
// O SSL não sai antes do DNS apontar, e quem publica em lote não fica olhando
// linha por linha. O que ficou sem certificado é anotado aqui e sai junto no
// resumo do fim (ADR-069).
let bulkSslPendentes = [];
let bulkSslAtivados = [];
// Domínios cujo contato técnico não é nosso: o Hub não mexe no DNS deles, e a
// lista vai para o atendimento falar com o cliente (ADR-072). Sai em .xlsx.
let bulkForaDeCasa = [];
let bulkGoogleQuebrado = null; // motivo, quando a chave do Google foi recusada nesta rodada (ADR-092)
let bulkSfConectado = false;   // Salesforce ligado nesta rodada? (ADR-090)
let bulkSfCriadas = [];        // domínios cuja tarefa foi criada no caso
let bulkSfPendentes = [];      // linhas cuja tarefa não saiu e dá para tentar de novo (ADR-093)

const BULK_PAPEIS = {
  razao: { rotulo: 'Razão social', cabecalhos: ['razao social', 'razão social', 'razao', 'cliente', 'empresa', 'nome', 'nome fantasia', 'projeto'] },
  dominio: { rotulo: 'Domínio', cabecalhos: ['dominio', 'domínio', 'domain', 'site', 'url', 'url do site', 'endereco', 'endereço'] },
  painel: { rotulo: 'Link do painel', cabecalhos: ['painel', 'link', 'link do painel', 'hub', 'painel mpi', 'url do painel', 'mpi+'] },
  caso: { rotulo: 'Link do caso', cabecalhos: ['caso', 'link do caso', 'link caso', 'caso salesforce', 'salesforce', 'sf', 'link do caso salesforce'] },
  temporario: { rotulo: 'Link temporário', cabecalhos: ['temporario', 'temporário', 'link temporario', 'link temporário', 'site temporario', 'site temporário', 'url temporaria', 'url temporária', 'temp', 'dominio temporario', 'domínio temporário'] },
};

// O site temporário do painel (…mpitemporario.com.br). Confirma o contrato
// certo quando o Hub acha o link do painel sozinho (ADR-098).
const DOMINIO_TEMPORARIO = 'mpitemporario.com.br';
function normalizarTemporario(valor) {
  let s = String(valor || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '').replace(/^www\./, '');
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s) ? s : '';
}
const pareceTemporario = (v) => { const h = normalizarTemporario(v); return !!h && (h === DOMINIO_TEMPORARIO || h.endsWith(`.${DOMINIO_TEMPORARIO}`)); };

const pareceDominio = (v) => /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(normalizeDomain(v) || '') && !/idealplus\.idealtrends\.io/i.test(v) && !pareceTemporario(v);
const parecePainel = (v) => !!normalizePainelUrl(v);
// Link do caso do Salesforce: ou um link Lightning com /r/Case/, ou um Id que
// começa com 500. Não confundir com o link do painel (esse é do idealplus).
const pareceCaso = (v) => /\/r\/Case\//i.test(String(v || '')) || /(^|[/=])500[a-zA-Z0-9]{12,15}(?:[/?#]|$)/.test(String(v || ''));

// Um cabeçalho é uma linha em que pelo menos uma célula se chama como uma
// coluna conhecida e nenhuma célula parece dado (domínio ou link).
function bulkDetectarCabecalho(linhas) {
  if (!linhas.length) return false;
  const l = linhas[0].map((c) => String(c || '').trim().toLowerCase());
  const conhecidas = l.filter((c) => Object.values(BULK_PAPEIS).some((p) => p.cabecalhos.includes(c))).length;
  const dados = l.filter((c) => pareceDominio(c) || parecePainel(c) || pareceTemporario(c)).length;
  return conhecidas > 0 && dados === 0;
}

// Pontua cada coluna para cada papel: pelo nome do cabeçalho, quando há, e pelo
// conteúdo, sempre. Razão social é o que sobra e tem texto.
function bulkDetectarColunas(linhas, temCabecalho) {
  const corpo = temCabecalho ? linhas.slice(1) : linhas;
  const nCols = Math.max(0, ...linhas.map((l) => l.length));
  const mapa = { razao: -1, dominio: -1, painel: -1, caso: -1, temporario: -1 };
  if (!nCols) return mapa;

  const cabecalho = temCabecalho ? linhas[0].map((c) => String(c || '').trim().toLowerCase()) : [];
  const amostra = corpo.slice(0, 50);
  const pontos = [];
  for (let c = 0; c < nCols; c++) {
    const valores = amostra.map((l) => String(l[c] || '').trim()).filter(Boolean);
    const n = valores.length || 1;
    const p = {
      dominio: valores.filter(pareceDominio).length / n,
      painel: valores.filter((v) => parecePainel(v) && !pareceCaso(v)).length / n,
      caso: valores.filter(pareceCaso).length / n,
      temporario: valores.filter(pareceTemporario).length / n,
      razao: valores.filter((v) => !pareceDominio(v) && !parecePainel(v) && !pareceCaso(v) && !pareceTemporario(v) && /[a-zà-ú]/i.test(v)).length / n,
    };
    for (const papel of Object.keys(BULK_PAPEIS)) {
      if (BULK_PAPEIS[papel].cabecalhos.includes(cabecalho[c] || '')) p[papel] += 1; // o nome vale mais que a amostra
    }
    pontos.push(p);
  }

  // Um papel por coluna, e uma coluna por papel: o caso e os links primeiro,
  // que são inconfundíveis; a razão social fica com o que sobrou. O caso vem
  // antes do painel porque os dois são links e o caso é o mais específico.
  const usadas = new Set();
  for (const papel of ['caso', 'painel', 'temporario', 'dominio', 'razao']) {
    let melhor = -1;
    let melhorPonto = papel === 'razao' ? 0.3 : 0.5;
    pontos.forEach((p, c) => {
      if (usadas.has(c)) return;
      if (p[papel] > melhorPonto) { melhorPonto = p[papel]; melhor = c; }
    });
    if (melhor >= 0) { mapa[papel] = melhor; usadas.add(melhor); }
  }
  return mapa;
}

// Da planilha crua para a lista de sites, com o mapa atual.
function bulkMontarLinhas() {
  const corpo = bulkTemCabecalho ? bulkLinhas.slice(1) : bulkLinhas;
  const rows = [];
  const erros = [];
  const vistos = new Set();
  const cel = (l, i) => (i >= 0 ? String(l[i] || '').trim() : '');

  corpo.forEach((l, n) => {
    const numero = n + (bulkTemCabecalho ? 2 : 1);
    const razao = cel(l, bulkMapa.razao);
    const dominio = normalizeDomain(cel(l, bulkMapa.dominio));
    const painel = cel(l, bulkMapa.painel);
    const caso = cel(l, bulkMapa.caso);
    const temporarioBruto = cel(l, bulkMapa.temporario);
    let temporario = normalizarTemporario(temporarioBruto);
    const dominioBruto = cel(l, bulkMapa.dominio);

    // O temporário na coluna do domínio publicaria o site no endereço errado
    // e mexeria no DNS do mpitemporario: fica de fora.
    if (dominio && pareceTemporario(dominio)) {
      erros.push(`linha ${numero}: o domínio "${dominioBruto}" é o endereço temporário, não o do cliente. Coloque o domínio de verdade; a linha ficou de fora`);
      return;
    }
    if (!dominio) {
      if (razao || painel) erros.push(`linha ${numero}: sem domínio`);
      return;
    }
    // Na coluna do temporário, só vale endereço do mpitemporario. Outra coisa
    // (o próprio site do cliente, por exemplo) não confere contrato nenhum.
    if (temporarioBruto && !pareceTemporario(temporarioBruto)) {
      erros.push(`linha ${numero}: "${temporarioBruto}" não é um link temporário (…${DOMINIO_TEMPORARIO}); ignorei. ${painel ? 'Vale o link do painel' : 'Sem ele, a linha só segue se o cliente tiver um contrato só'}`);
      temporario = '';
    } else if (/^https?[a-z0-9]/i.test(String(temporarioBruto).trim().replace(/^https?:\/\//i, ''))) {
      erros.push(`linha ${numero}: o link temporário "${temporarioBruto}" começa com "http" colado no endereço. Se estiver assim na aba Publicação do painel, está certo (é o que o Hub compara); se não, corrija na planilha`);
    }
    if (vistos.has(dominio)) {
      erros.push(`linha ${numero}: ${dominio} repetido, contei só a primeira`);
      return;
    }
    vistos.add(dominio);

    const painelOk = painel ? !!normalizePainelUrl(painel) : false;
    // Sem link, mas com razão social: o Hub procura no painel (ADR-098).
    const painelAchar = !painel && !!razao;
    rows.push({
      razao,
      dominio,
      painel,
      caso,
      temporario,
      externalId: '',
      painelOk,
      painelAchar,
      status: painel && !painelOk ? 'invalido' : 'pendente',
      detalhe: painel
        ? (painelOk ? '' : `o link não é do ${PAINEL_MPI_HOST}`)
        : painelAchar
          ? `painel: vou procurar pela razão social${temporario ? ' e conferir o temporário' : ''}`
          : 'sem link do painel e sem razão social para procurar',
    });
  });

  return { rows, erros };
}

const BULK_STATUS = {
  pendente: { badge: 'neutral', texto: 'na fila' },
  invalido: { badge: 'err', texto: 'link inválido' },
  rodando: { badge: 'neutral', texto: 'rodando' },
  ok: { badge: 'ok', texto: 'vinculado' },
  parcial: { badge: 'warn', texto: 'parcial' },
  falhou: { badge: 'err', texto: 'falhou' },
  pulado: { badge: 'neutral', texto: 'pulado' },
  apublicar: { badge: 'warn', texto: 'a publicar' },
  publicado: { badge: 'ok', texto: 'já publicado' },
};

function renderBulkTool() {
  el.leftPanel.innerHTML = `
    ${backButtonHtml()}
    <div id="bulkRetomar"></div>
    <div class="sec anim-in">
      <div class="sec-head"><span class="sec-title">Projeto alvo</span><span class="sec-meta dim">Motor v2.x</span></div>
      ${brandSelectHtml('bulkBrand')}
    </div>
    <div class="sec anim-in">
      <div class="sec-head"><span class="sec-title">Arquivo de entrada (.xlsx / .csv)</span><span class="sec-meta dim">Colunas: Domínio, Link do painel</span></div>
      <label class="field">
        <span>Planilha</span>
        <input id="bulkFile" type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
      </label>
    </div>
    <div class="sec anim-in">
      <div class="sec-head"><span class="sec-title">Colar células diretamente (Excel / Google Sheets)</span><span class="sec-meta">Tab-separated OK</span></div>
      <label class="field">
        <span>Selecione as células na planilha, copie e cole aqui. Pode vir com cabeçalho ou sem.</span>
        <textarea id="bulkTexto" rows="4" placeholder="Ex: cliente.com.br&#9;cliente-temp.mpitemporario.com.br&#9;https://painel..." autocomplete="off"></textarea>
      </label>
    </div>
    <div class="sec anim-in">
      <div class="sec-head"><span class="sec-title">Gatilhos de automação concorrente</span></div>
      <label class="checkbox-field">
        <input id="bulkCriar" type="checkbox" ${bulkCriar ? 'checked' : ''} />
        <span>Criar no Google o que não existir (<strong>Analytics, Tag Manager, reCAPTCHA</strong>)</span>
      </label>
      <label class="checkbox-field">
        <input id="bulkSfAuto" type="checkbox" ${state.sfTarefasAuto ? 'checked' : ''} />
        <span>Criar no Salesforce a tarefa <strong>"Publicação V1 -&gt; V2"</strong> de cada site publicado, achando o caso sozinho (pela tarefa antiga ou razão social)</span>
      </label>
    </div>
    <div id="bulkPrevia"></div>
    <div id="bulkLista"></div>
    <div id="bulkDetalhe"></div>
    ${infoBoxHtml(`<p class="hint">Cada site, na ordem que a publicação exige. Primeiro o contato técnico no Registro.br: se for nosso, o DNS entra; se não, o domínio vai para a lista dos que não estão conosco, que sai em .xlsx no fim para o atendimento. Zona que já existe na Cloudflare: só o A da raiz troca do IP antigo para o novo, e você confirma. Zona nova: a Cloudflare varre o DNS atual, o Hub completa com os autoritativos, replica tudo e troca só a raiz e o www; você confirma, e os nameservers vão para o Registro.br. Depois o painel: quem já está publicado é só vinculado; quem não está é aprovado e publicado. O SSL só é pedido quando o domínio já resolve para o servidor de produção; senão fica no aviso do fim. Por fim Analytics, Tag Manager e reCAPTCHA (reaproveita o que existe, cria o que faltar se a caixa estiver marcada), o painel (Integrações, Search Console, Relatório) e a linha na planilha. A única parada é a do DNS, uma por domínio. Com a opção do Salesforce marcada, no fim o Hub cria a tarefa "Publicação V1 -&gt; V2" de cada site publicado, já concluída e no seu nome, sem marcar ninguém. O caso ele acha sozinho: pela tarefa de publicação antiga que cita o domínio (no assunto ou nos comentários) ou pela conta com a razão social e o caso "Ongoing CS" dela. Quem ele não achar fica listado no fim; para esses, preencha a coluna <strong>Link do caso</strong>, que sempre tem prioridade. Use "Conferir os casos" antes, para ver o que ele escolheria sem criar nada.</p>
    <p class="hint">Sem <strong>Link do painel</strong>, o Hub procura sozinho: busca a razão social no painel, abre os projetos e contratos do cliente e fica com o contrato cujo site temporário é o da coluna <strong>Link temporário</strong> (o link do alto da aba Publicação, …mpitemporario.com.br). Isso acontece antes do DNS: se não achar, a linha falha sem mexer em nada. Sem link temporário, só segue quando o cliente tem um contrato só. Com link do painel <em>e</em> link temporário, o Hub confere que o link abre o contrato desse temporário.</p>
    <p class="hint">Tudo o que aparece no terminal também fica gravado em Documentos\Hub\logs, um arquivo por dia, e a rodada é salva a cada site: se o Windows fechar o Hub, abra de novo e retome de onde parou.</p>`, 'Protocolo de execução técnica & dependências')}
    <div class="action-bar"><button type="button" class="btn ghost" id="bulkLogsBtn">${NAV_ICON.bulk} Abrir pasta de logs</button><span class="spacer"></span><span class="dim mono" style="font-size:11px">a rodada é salva a cada site</span></div>
  `;

  document.getElementById('backToHub').addEventListener('click', goHome);
  wireBrandSelect('bulkBrand', () => renderBulkLista());
  const logsBtn = document.getElementById('bulkLogsBtn');
  if (logsBtn) logsBtn.addEventListener('click', async () => {
    const r = await window.api.abrirPastaLogs().catch((e) => ({ ok: false, error: e.message }));
    if (!r.ok) log(`Não consegui abrir a pasta de logs: ${r.error}`, 'warn');
  });

  const criar = document.getElementById('bulkCriar');
  if (criar) criar.addEventListener('change', (e) => { bulkCriar = e.target.checked; renderBulkLista(); });
  const sfAuto = document.getElementById('bulkSfAuto');
  if (sfAuto) sfAuto.addEventListener('change', (e) => { state.sfTarefasAuto = e.target.checked; saveHubState(); renderBulkLista(); });

  document.getElementById('bulkFile').addEventListener('change', async (e) => {
    const arquivo = e.target.files && e.target.files[0];
    if (!arquivo) return;
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const res = await window.api.lerPlanilha({ nome: arquivo.name, base64: btoa(bin) });
    if (!res.ok) { log(res.error, 'error'); return; }
    carregarBulk(res.linhas, arquivo.name);
  });

  document.getElementById('bulkTexto').addEventListener('change', async (e) => {
    const res = await window.api.lerPlanilha({ texto: e.target.value });
    if (!res.ok) { log(res.error, 'error'); return; }
    carregarBulk(res.linhas, 'texto colado');
  });

  renderBulkPrevia();
  renderBulkLista();
  renderBulkRetomar();
}

function carregarBulk(linhas, origem) {
  if (bulkRodando) {
    log('A rodada ainda está em andamento. Espere terminar ou pare antes de trocar a lista.', 'warn');
    return;
  }
  bulkSfPendentes = []; // planilha nova, lista nova
  bulkOrigem = origem || '';
  bulkLinhas = (linhas || []).filter((l) => Array.isArray(l) && l.some((c) => String(c || '').trim()));
  bulkTemCabecalho = bulkDetectarCabecalho(bulkLinhas);
  bulkMapa = bulkDetectarColunas(bulkLinhas, bulkTemCabecalho);

  const achou = Object.keys(bulkMapa).filter((k) => bulkMapa[k] >= 0).map((k) => BULK_PAPEIS[k].rotulo);
  log(
    `Planilha (${origem}): ${bulkLinhas.length - (bulkTemCabecalho ? 1 : 0)} linha(s)` +
      (bulkTemCabecalho ? ', com cabeçalho' : ', sem cabeçalho') +
      (achou.length ? `. Reconheci: ${achou.join(', ')}.` : '. Não reconheci nenhuma coluna, marque na prévia.'),
    achou.length ? 'info' : 'warn'
  );
  aplicarBulkMapa();
}

function aplicarBulkMapa() {
  if (!bulkMapa || bulkMapa.dominio < 0) {
    bulkRows = [];
  } else {
    const { rows, erros } = bulkMontarLinhas();
    bulkRows = rows;
    for (const e of erros) log(`Planilha: ${e}`, 'warn');
    const semLink = rows.filter((r) => !bulkTemPainel(r)).length;
    if (semLink) log(`${semLink} linha(s) sem link válido do painel (e sem razão social para procurar) ficam de fora da rodada.`, 'warn');
    const aProcurar = rows.filter((r) => r.painelAchar);
    if (aProcurar.length) {
      const semTemp = aProcurar.filter((r) => !r.temporario).length;
      log(`${aProcurar.length} linha(s) sem link do painel: o Hub procura pela razão social no começo de cada site${semTemp ? `. ${semTemp} sem link temporário: só seguem se o cliente tiver um contrato só` : ', e o link temporário confirma o contrato'}.`, 'info');
    }
  }
  renderBulkPrevia();
  renderBulkLista();
}

// A prévia mostra as primeiras linhas com um seletor por coluna. É aqui que a
// pessoa vê se o app entendeu a planilha antes de qualquer coisa rodar.
function renderBulkPrevia() {
  const wrap = document.getElementById('bulkPrevia');
  if (!wrap) return;
  if (!bulkLinhas.length) { wrap.innerHTML = ''; return; }

  const nCols = Math.max(0, ...bulkLinhas.map((l) => l.length));
  const corpo = bulkTemCabecalho ? bulkLinhas.slice(1) : bulkLinhas;
  const amostra = corpo.slice(0, 4);
  const papelDe = (c) => Object.keys(bulkMapa).find((k) => bulkMapa[k] === c) || '';

  const cabecalhos = Array.from({ length: nCols }, (_, c) => `
    <th>
      <select data-bulk-col="${c}">
        <option value="" ${papelDe(c) === '' ? 'selected' : ''}>ignorar</option>
        ${Object.keys(BULK_PAPEIS).map((k) => `<option value="${k}" ${papelDe(c) === k ? 'selected' : ''}>${BULK_PAPEIS[k].rotulo}</option>`).join('')}
      </select>
      ${bulkTemCabecalho ? `<div class="th-orig">${escapeHtml(bulkLinhas[0][c] || '')}</div>` : ''}
    </th>`).join('');

  const linhasHtml = amostra.map((l) => `<tr>${Array.from({ length: nCols }, (_, c) => `<td class="${papelDe(c) ? '' : 'faint'}">${escapeHtml(String(l[c] || ''))}</td>`).join('')}</tr>`).join('');

  // Só o domínio é obrigatório. O link do painel pode faltar quando há razão
  // social (o Hub procura, ADR-098); o temporário confirma o contrato; o link
  // do caso é da tarefa do Salesforce.
  const faltando = [];
  if (bulkMapa.dominio < 0) faltando.push(BULK_PAPEIS.dominio.rotulo);
  if (bulkMapa.painel < 0 && bulkMapa.razao < 0) faltando.push(`${BULK_PAPEIS.painel.rotulo} ou ${BULK_PAPEIS.razao.rotulo}`);
  const semTemporario = bulkMapa.painel < 0 && bulkMapa.razao >= 0 && bulkMapa.temporario < 0;

  wrap.innerHTML = `
    <div class="section-label">Prévia, ${corpo.length} linha(s)</div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr>${cabecalhos}</tr></thead>
        <tbody>${linhasHtml}</tbody>
      </table>
    </div>
    <label class="checkbox-field">
      <input id="bulkCabecalho" type="checkbox" ${bulkTemCabecalho ? 'checked' : ''} />
      <span>A primeira linha é cabeçalho</span>
    </label>
    ${faltando.length ? `<p class="hint warn-text">Falta marcar: ${faltando.join(' e ')}. Use os seletores no topo de cada coluna.</p>` : ''}
    ${!faltando.length && bulkMapa.painel < 0 ? `<p class="hint">Sem a coluna do link do painel: o Hub procura cada cliente no painel pela razão social${semTemporario ? '. Sem a coluna do link temporário, só seguem os clientes que têm um contrato só' : ' e confirma o contrato pelo link temporário'}.</p>` : ''}
  `;

  wrap.querySelectorAll('[data-bulk-col]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const c = Number(sel.dataset.bulkCol);
      const papel = sel.value;
      for (const k of Object.keys(bulkMapa)) if (bulkMapa[k] === c) bulkMapa[k] = -1;
      if (papel) bulkMapa[papel] = c;
      aplicarBulkMapa();
    });
  });
  document.getElementById('bulkCabecalho').addEventListener('change', (e) => {
    bulkTemCabecalho = e.target.checked;
    aplicarBulkMapa();
  });
}

// O que a rodada vai tocar: linha com link válido que ainda tem algo a fazer.
// Só sai de fora quem já terminou bem nesta sessão. Quem a conferência deu
// como publicado CONTINUA na fila, mas pelo caminho barato: não republica, só
// confere se falta vincular, e passa direto quando não falta (ADR-087).
const BULK_NADA_A_FAZER = ['ok'];

// Entra na rodada quem tem link válido ou dá para procurar (ADR-098).
function bulkTemPainel(r) {
  return !!(r.painelOk || r.painelAchar);
}

function bulkFilaAtual() {
  return bulkRows.filter((r) => bulkTemPainel(r) && !BULK_NADA_A_FAZER.includes(r.status));
}

// Antes de tocar em qualquer coisa do site (DNS inclusive): o link do painel
// tem que estar certo. Sem link, procura pela razão social e confirma pelo
// temporário. Com link e temporário na planilha, confere se o contrato aberto
// é o do temporário. Estoura quando não dá: a linha falha sem ter mexido em nada.
async function garantirLinkDoPainel(row) {
  if (!row.painelOk && row.painelAchar) {
    const res = await withBusy(`procurando ${row.razao} no painel`, () =>
      window.api.acharContratoNoPainel({ razao: row.razao, temporario: row.temporario, dominio: row.dominio })
    );
    if (res.log) for (const e of res.log) log(e.message, e.type);
    if (!res.ok) throw new Error(`painel: ${res.error || 'não achei o contrato'}`);
    row.painel = res.url;
    row.painelOk = true;
    row.painelAchado = res.url;
    row.painelConferido = !!res.conferidoPeloTemporario;
    return;
  }
  if (row.painelOk && row.temporario && !row.painelConferido) {
    const res = await withBusy(`conferindo o contrato de ${row.dominio}`, () =>
      window.api.publicarPainel({ url: normalizePainelUrl(row.painel), etapa: 'estado', dominio: row.dominio })
    );
    if (res.log) for (const e of res.log) log(e.message, e.type);
    if (!res.ok) throw new Error(res.error || 'não consegui ler o painel');
    conferirTemporario(row, res.estado);
    row.painelConferido = true;
  }
}

// O temporário do contrato aberto tem que ser o da planilha.
function conferirTemporario(row, estado) {
  if (!row.temporario || !estado) return;
  const noPainel = normalizarTemporario(estado.urlTemporaria);
  if (noPainel === row.temporario) {
    log(`${row.dominio}: o contrato do painel é o do temporário ${row.temporario}.`, 'info');
    return;
  }
  throw new Error(`o link do painel abre o contrato do temporário ${noPainel || '(nenhum)'}, e a planilha diz ${row.temporario}: é outro contrato, não mexi em nada`);
}

// O site está publicado, mas o vínculo do Google não saiu. Isso é parcial, não
// falha: a publicação vale, a linha vai para a planilha, a tarefa do Salesforce
// sai no fim, e o vínculo roda de novo na próxima rodada, porque parcial não
// sai da fila (ADR-092).
async function fecharPublicadoSemVinculo(row, motivo) {
  row.status = 'parcial';
  row.detalhe = `${row.publicadoDetalhe || 'publicado'} · ${motivo}`;
  renderBulkLista();
  try {
    const pl = await registrarLinhaDaPlanilha(row);
    if (pl.jaExistia) row.detalhe += ' · já estava na planilha';
    else if (pl.onde) row.detalhe += ` · planilha ${pl.aba}`;
  } catch (e) {
    log(`Planilha de ${row.dominio}: ${e.message}`, 'warn');
  }
  renderBulkLista();
}

// Depois de publicar todos, cria automaticamente a tarefa no Salesforce de
// cada linha que tenha link do caso — 100% sozinho, sem botão (ADR-090). Cobre
// todos os da planilha: recém-publicados e já publicados. Não cria para quem
// falhou na publicação (marcar como concluída uma tarefa de um site que não
// subiu seria mentira). Não duplica (o main confere no caso) e nunca derrubou
// a publicação: aqui a rodada já acabou, isto é só o registro no fim.
async function criarTarefasSalesforceNoFim() {
  // Critério: o Hub confirmou que o site está no ar (já estava ou subiu agora).
  // Falha de vínculo do Google não impede — a tarefa é da publicação (ADR-092).
  // Pede tarefa: quem tem Link do caso, ou todos, com a opção ligada (ADR-097).
  const comCaso = bulkRows.filter((r) => r.dominio && (r.caso || state.sfTarefasAuto));
  const alvo = comCaso.filter((r) => r.publicado);
  const pularam = comCaso.filter((r) => !r.publicado && r.status === 'falhou');
  const foraDaRodada = comCaso.filter((r) => !r.publicado && r.status !== 'falhou');
  if (!comCaso.length) return; // ninguém pediu tarefa

  if (!bulkSfConectado) {
    // Nada foi tentado: ficam todas pendentes, para criar depois de conectar.
    bulkSfPendentes = alvo.slice();
    log(`${comCaso.length} linha(s) têm link do caso, mas o Salesforce não está conectado — não criei tarefa nenhuma. Conecte nas configurações e use "Criar as tarefas pendentes".`, 'warn');
    return;
  }
  for (const r of pularam) log(`${r.dominio}: não consegui confirmar que o site está publicado, não criei a tarefa no Salesforce (para não marcar como concluída sem o site no ar).`, 'warn');
  for (const r of foraDaRodada) log(`${r.dominio}: não entrou na rodada (${r.detalhe || 'sem link válido do painel'}), então não criei a tarefa no Salesforce.`, 'warn');
  if (!alvo.length) return;

  log(`Salesforce: criando a tarefa de ${alvo.length} site(s) publicado(s), cada uma no seu caso.`, 'cmd');
  await criarTarefasSalesforce(alvo);
}

// O laço de criação, usado no fim da rodada e na ação de pendentes. O que não
// sai por um motivo que se resolve (sessão, rede) fica em bulkSfPendentes; link
// errado não fica, porque tentar de novo não muda nada até corrigir a planilha.
// 403 para na hora: é o token, vale para todas (ADR-093).
async function criarTarefasSalesforce(linhas) {
  bulkSfPendentes = [];
  const semCaso = [];
  let criadas = 0;
  let jaExistiam = 0;
  for (let i = 0; i < linhas.length; i++) {
    const row = linhas[i];
    const res = await withBusy(`criando a tarefa no Salesforce de ${row.dominio}`, () =>
      window.api.salesforceCriarTarefaNoCaso({ casoLink: row.caso, dominio: row.dominio, razao: row.razao })
    );
    if (res.log) for (const e of res.log) log(e.message, e.type);
    row.detalhe = String(row.detalhe || '').replace(/ · tarefa SF (falhou|pendente|: caso não encontrado)$/, '');
    if (res.ok) {
      if (res.jaExistia) { row.detalhe += ' · tarefa SF já existia'; jaExistiam++; }
      else { row.detalhe += ` · tarefa SF no caso ${res.casoNumero || ''}`.trimEnd(); bulkSfCriadas.push(row.dominio); criadas++; }
    } else if (res.precisaReconectar) {
      const resto = linhas.slice(i);
      bulkSfPendentes.push(...resto);
      for (const r of resto) { r.detalhe = String(r.detalhe || '').replace(/ · tarefa SF (falhou|pendente)$/, '') + ' · tarefa SF pendente'; }
      log(`Parei as tarefas do Salesforce: ${resto.length} ficaram pendentes. Reconecte o Salesforce nas configurações e clique em "Criar as ${resto.length} tarefas pendentes".`, 'warn');
      renderBulkLista();
      break;
    } else if (res.casoNaoEncontrado) {
      // Tentar de novo não muda nada: falta o Link do caso na planilha.
      row.detalhe += ' · tarefa SF: caso não encontrado';
      semCaso.push({ dominio: row.dominio, motivo: res.error });
    } else if (res.linkInvalido) {
      row.detalhe += ' · tarefa SF: link do caso errado';
      log(`Tarefa do Salesforce de ${row.dominio} não foi criada: ${res.error} Corrija a planilha e carregue de novo.`, 'warn');
    } else {
      row.detalhe += ' · tarefa SF pendente';
      bulkSfPendentes.push(row);
      log(`Tarefa do Salesforce de ${row.dominio} não foi criada: ${res.error}`, 'warn');
    }
    renderBulkLista();
  }
  if (criadas || jaExistiam) {
    log(`Salesforce: ${criadas} tarefa(s) criada(s)${jaExistiam ? `, ${jaExistiam} já existia(m)` : ''}${bulkSfPendentes.length ? `, ${bulkSfPendentes.length} pendente(s)` : ''}.`, bulkSfPendentes.length ? 'warn' : 'success');
  }
  if (semCaso.length) {
    log(`Salesforce: ${semCaso.length} site(s) sem caso encontrado, sem tarefa. Preencha o "Link do caso" deles na planilha e rode de novo:`, 'warn');
    for (const x of semCaso) log(`  ${x.dominio}: ${x.motivo}`, 'warn');
  }
  renderBulkLista();
}

// Conferência só de leitura (ADR-097): para cada site da planilha, diz qual
// caso o Hub usaria e como achou, e se a tarefa V1 -> V2 já está lá. Não cria
// nada. Serve para validar o padrão antes de deixar criar sozinho.
async function conferirCasosSalesforce() {
  if (bulkRodando) return;
  const linhas = bulkRows.filter((r) => r.dominio);
  if (!linhas.length) return;
  const sf = await window.api.salesforceGetConfig().catch(() => null);
  if (!sf || !sf.ok || !sf.conectado) { log('O Salesforce não está conectado. Conecte nas configurações e tente de novo.', 'error'); return; }
  bulkRodando = true;
  renderBulkLista();
  log(`Conferindo no Salesforce o caso de ${linhas.length} site(s). Só leitura: nada é criado.`, 'cmd');
  const achados = [];
  const semCaso = [];
  try {
    for (const row of linhas) {
      const res = await withBusy(`procurando o caso de ${row.dominio}`, () =>
        window.api.salesforceCriarTarefaNoCaso({ casoLink: row.caso, dominio: row.dominio, razao: row.razao, apenasConferir: true })
      );
      if (res.log) for (const e of res.log) log(e.message, e.type === 'success' ? 'info' : e.type);
      if (res.ok) {
        achados.push(row.dominio);
        log(`${row.dominio} → caso ${res.casoNumero} "${res.casoAssunto}"${res.casoStatus ? ` (${res.casoStatus})` : ''}${res.conta ? `, conta ${res.conta}` : ''}, ${res.como}${res.jaExistia ? ' · a tarefa V1 -> V2 já existe nele' : ''}.`, 'success');
      } else if (res.precisaReconectar) {
        log('Parei a conferência: reconecte o Salesforce nas configurações e confira de novo.', 'warn');
        break;
      } else {
        semCaso.push({ dominio: row.dominio, motivo: res.error });
      }
    }
  } finally {
    bulkRodando = false;
    renderBulkLista();
  }
  log(`Conferência: ${achados.length} com caso encontrado, ${semCaso.length} sem.`, semCaso.length ? 'warn' : 'success');
  for (const x of semCaso) log(`  ${x.dominio}: ${x.motivo}`, 'warn');
}

// Só aparece quando alguma tarefa não saiu: cria só as pendentes, sem refazer
// a rodada de publicação. A criação normal continua automática (ADR-093).
async function criarTarefasPendentes() {
  if (bulkRodando || !bulkSfPendentes.length) return;
  const sf = await window.api.salesforceGetConfig().catch(() => null);
  if (!sf || !sf.ok || !sf.conectado) {
    log('O Salesforce não está conectado. Conecte nas configurações e clique de novo.', 'error');
    return;
  }
  bulkSfConectado = true;
  const linhas = bulkSfPendentes.slice();
  bulkRodando = true;
  renderBulkLista();
  log(`Salesforce: criando as ${linhas.length} tarefa(s) pendente(s).`, 'cmd');
  try {
    await criarTarefasSalesforce(linhas);
  } finally {
    bulkRodando = false;
    renderBulkLista();
  }
  await fecharRodadaSalva();
}

// ---------- Rodada salva em disco (ADR-096) ----------

function salvarRodada(fase) {
  if (!window.api || !window.api.salvarRodada) return Promise.resolve();
  const estado = {
    versao: 1,
    fase,
    marca: state.brand,
    origem: bulkOrigem,
    linhas: bulkLinhas,
    mapa: bulkMapa,
    temCabecalho: bulkTemCabecalho,
    criar: bulkCriar,
    sites: bulkRows.map((r) => ({
      dominio: r.dominio,
      status: r.status,
      detalhe: r.detalhe || '',
      publicado: !!r.publicado,
      publicadoDetalhe: r.publicadoDetalhe || '',
      empresa: r.empresa || '',
      dnsNosso: r.dnsNosso === undefined ? null : r.dnsNosso,
      painelAchado: r.painelAchado || '',
    })),
    sslPendentes: bulkSslPendentes,
    sslAtivados: bulkSslAtivados,
    foraDeCasa: bulkForaDeCasa,
    sfPendentes: bulkSfPendentes.map((r) => r.dominio),
  };
  return window.api.salvarRodada(estado).catch(() => {});
}

// Fim da rodada: sem tarefa pendente, o arquivo some; com pendente, fica, para
// o botão das pendentes sobreviver a um reinício.
async function fecharRodadaSalva() {
  if (bulkSfPendentes.length) await salvarRodada('tarefas-pendentes');
  else if (window.api && window.api.apagarRodada) await window.api.apagarRodada().catch(() => {});
  renderBulkRetomar();
}

// Resumo de uma rodada salva, para o aviso e para o teste.
function resumoRodada(estado) {
  const sites = Array.isArray(estado?.sites) ? estado.sites : [];
  const feitos = sites.filter((x) => ['ok', 'parcial'].includes(x.status)).length;
  const publicados = sites.filter((x) => x.publicado).length;
  const quando = estado?.salvoEm ? new Date(estado.salvoEm).toLocaleString('pt-BR', { hour12: false }) : 'antes';
  return { total: sites.length, feitos, publicados, quando, pendentesSf: (estado?.sfPendentes || []).length };
}

// Remonta a lista da rodada salva: a planilha e o mapa de colunas voltam como
// estavam, e cada site recupera o estado (quem já terminou, quem já está
// publicado). Um site que estava "rodando" quando tudo fechou volta para a fila.
function restaurarRodada(estado) {
  bulkLinhas = Array.isArray(estado.linhas) ? estado.linhas : [];
  bulkMapa = estado.mapa || null;
  bulkTemCabecalho = !!estado.temCabecalho;
  bulkOrigem = estado.origem || '';
  if (typeof estado.criar === 'boolean') bulkCriar = estado.criar;
  if (estado.marca && BRANDS.some((b) => b.id === estado.marca)) state.brand = estado.marca;
  const { rows } = bulkMontarLinhas();
  const salvos = new Map((estado.sites || []).map((x) => [x.dominio, x]));
  for (const r of rows) {
    const x = salvos.get(r.dominio);
    if (!x || r.status === 'invalido') continue;
    r.status = x.status === 'rodando' ? 'pendente' : (x.status || r.status);
    r.detalhe = x.detalhe || r.detalhe;
    r.publicado = !!x.publicado;
    r.publicadoDetalhe = x.publicadoDetalhe || '';
    if (x.empresa) r.empresa = x.empresa;
    if (x.dnsNosso !== null && x.dnsNosso !== undefined) r.dnsNosso = x.dnsNosso;
    // O link que o Hub achou no painel volta junto: não procura de novo.
    if (x.painelAchado && !r.painelOk && normalizePainelUrl(x.painelAchado)) {
      r.painel = x.painelAchado;
      r.painelAchado = x.painelAchado;
      r.painelOk = true;
      r.painelConferido = !!r.temporario;
    }
  }
  bulkRows = rows;
  bulkSslPendentes = Array.isArray(estado.sslPendentes) ? estado.sslPendentes : [];
  bulkSslAtivados = Array.isArray(estado.sslAtivados) ? estado.sslAtivados : [];
  bulkForaDeCasa = Array.isArray(estado.foraDeCasa) ? estado.foraDeCasa : [];
  const pend = new Set(estado.sfPendentes || []);
  bulkSfPendentes = rows.filter((r) => pend.has(r.dominio));
}

async function retomarRodada() {
  if (bulkRodando) return;
  const r = await window.api.lerRodada().catch(() => null);
  const estado = r && r.estado;
  if (!estado) { log('Não há rodada salva para retomar.', 'warn'); renderBulkRetomar(); return; }
  restaurarRodada(estado);
  const res = resumoRodada(estado);
  log(`Retomando a rodada de ${res.quando} (${bulkOrigem || 'planilha'}): ${res.feitos} de ${res.total} site(s) já tinham terminado, ${res.publicados} publicado(s).`, 'cmd');
  renderBulkTool();

  if (estado.fase === 'tarefas-pendentes') {
    log(`Ficaram ${bulkSfPendentes.length} tarefa(s) do Salesforce pendente(s). Clique em "Criar as tarefas pendentes".`, 'warn');
    return;
  }
  if (estado.fase === 'publicando' && bulkFilaAtual().length) {
    await rodarBulk({ retomando: true });
    return;
  }
  // Todos já tinham terminado; faltava só o fim (tarefas do Salesforce).
  const sf = await window.api.salesforceGetConfig().catch(() => null);
  bulkSfConectado = !!(sf && sf.ok && sf.conectado);
  await criarTarefasSalesforceNoFim();
  await fecharRodadaSalva();
}

async function descartarRodada() {
  if (bulkRodando) return;
  await window.api.apagarRodada().catch(() => {});
  log('Rodada salva descartada.', 'info');
  renderBulkRetomar();
}

// O aviso no topo do Publicar em massa, quando há rodada salva.
async function renderBulkRetomar() {
  const wrap = document.getElementById('bulkRetomar');
  if (!wrap) return;
  if (bulkRodando) { wrap.innerHTML = ''; return; }
  const r = await window.api.lerRodada().catch(() => null);
  const estado = r && r.estado;
  if (!estado) { wrap.innerHTML = ''; return; }
  const res = resumoRodada(estado);
  const texto = estado.fase === 'tarefas-pendentes'
    ? `A rodada de ${res.quando} terminou com ${res.pendentesSf} tarefa(s) do Salesforce pendente(s).`
    : `A rodada de ${res.quando} (${escapeHtml(estado.origem || 'planilha')}) não terminou: ${res.feitos} de ${res.total} site(s) já feitos. Retomando, ele continua de onde parou e cria as tarefas do Salesforce no fim.`;
  wrap.innerHTML = `
    <div class="aviso-rodada">
      <div>${texto}</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px">
        <button id="bulkRetomarBtn" type="button" class="btn primary compact">${estado.fase === 'tarefas-pendentes' ? 'Abrir as pendentes' : 'Retomar de onde parou'}</button>
        <button id="bulkDescartarBtn" type="button" class="btn ghost compact">Descartar</button>
      </div>
    </div>`;
  document.getElementById('bulkRetomarBtn').addEventListener('click', retomarRodada);
  document.getElementById('bulkDescartarBtn').addEventListener('click', descartarRodada);
}

function renderBulkLista() {
  const wrap = document.getElementById('bulkLista');
  if (!wrap) return;

  if (!bulkRows.length) {
    wrap.innerHTML = '';
    return;
  }

  const prontos = bulkRows.filter(bulkTemPainel);
  const fila = bulkFilaAtual();
  const foraDaRodada = prontos.length - fila.length;
  const feitos = bulkRows.filter((r) => ['ok', 'parcial', 'falhou', 'pulado'].includes(r.status)).length;

  let html = `<div class="section-label">Sites: ${bulkRows.length}${feitos ? `, ${feitos} processado(s)` : ''}</div><div class="rows">`;

  for (const r of bulkRows) {
    const meta = BULK_STATUS[r.status] || BULK_STATUS.pendente;
    const estado = r.status === 'rodando' ? 'is-running' : ['ok'].includes(r.status) ? 'is-ok' : ['parcial'].includes(r.status) ? 'is-warn' : ['falhou', 'invalido'].includes(r.status) ? 'is-err' : '';
    html += `<div class="row ${estado}">
      <div class="row__main">
        <div class="row__title">${escapeHtml(r.razao || r.dominio)}</div>
        <div class="row__sub">${escapeHtml(r.razao ? r.dominio : '')}${r.detalhe ? `${r.razao ? ' · ' : ''}${escapeHtml(r.detalhe)}` : ''}</div>
      </div>
      <span class="badge ${meta.badge}">${escapeHtml(meta.texto)}</span>
    </div>`;
  }
  html += '</div>';

  if (!brandUsesMpiPanel(state.brand)) {
    html += `<p class="hint">${escapeHtml(brandName(state.brand))} não usa o painel MPI+. O vínculo em massa só existe para quem sincroniza por lá.</p>`;
  }

  const podeRodar = fila.length && brandUsesMpiPanel(state.brand);

  if (bulkRodando) {
    html += `<button id="bulkStopBtn" class="btn caution full-width" ${bulkParar ? 'disabled' : ''}>${bulkParar ? 'Para depois deste site' : 'Parar depois deste site'}</button>`;
    html += `<button id="bulkStopNowBtn" class="btn ghost full-width" style="margin-top:6px" ${paradaAgora ? 'disabled' : ''}>${paradaAgora ? 'Parando...' : 'Parar agora (no meio deste site)'}</button>`;
  } else {
    const jaPublicados = fila.filter((r) => r.status === 'publicado').length;
    const aPublicar = fila.length - jaPublicados;
    html += `<button id="bulkRunBtn" class="btn caution full-width" ${podeRodar ? '' : 'disabled'}>
         ${!prontos.length
           ? 'Nenhuma linha com link válido ou razão social'
           : !fila.length
             ? 'Nada a fazer: todos já foram feitos'
             : jaPublicados
               ? `Publicar ${aPublicar} e conferir ${jaPublicados} site(s)`
               : `Publicar e vincular ${fila.length} site(s)`}
       </button>`;
    if (jaPublicados) {
      html += `<p class="hint">Os ${jaPublicados} já publicados não são republicados: o Hub abre o painel de cada um, vê se o vínculo já está feito e só sincroniza quem precisa.</p>`;
    }
    if (foraDaRodada) {
      html += `<p class="hint">${foraDaRodada} site(s) já terminaram nesta sessão e ficam de fora. <button type="button" class="btn ghost compact" id="bulkLimparConf">Incluir todos de novo</button></p>`;
    }
    // Conferir é opcional: a rodada confere sozinha, site a site. Serve para
    // ver quem já está publicado antes de mandar qualquer coisa para produção.
    html += `<button id="bulkCheckBtn" class="btn ghost full-width" style="margin-top:6px" ${podeRodar ? '' : 'disabled'}>
        Só conferir quem já está publicado
      </button>`;
    if (state.sfTarefasAuto && bulkRows.some((r) => r.dominio)) {
      html += `<button id="bulkSfConfBtn" class="btn ghost full-width" style="margin-top:6px">
        Conferir os casos no Salesforce (só leitura, não cria nada)
      </button>`;
    }
    if (bulkSfPendentes.length) {
      html += `<button id="bulkSfPendBtn" class="btn primary full-width" style="margin-top:6px">
        Criar as ${bulkSfPendentes.length} tarefa(s) pendente(s) no Salesforce
      </button>`;
    }
    if (bulkForaDeCasa.length) {
      html += `<button id="bulkForaBtn" class="btn ghost full-width" style="margin-top:6px">
        Salvar .xlsx dos ${bulkForaDeCasa.length} que não estão conosco
      </button>`;
    }
  }

  wrap.innerHTML = html;

  const run = document.getElementById('bulkRunBtn');
  if (run) run.addEventListener('click', rodarBulk);
  const check = document.getElementById('bulkCheckBtn');
  if (check) check.addEventListener('click', conferirBulkPublicacao);
  const sfConf = document.getElementById('bulkSfConfBtn');
  if (sfConf) sfConf.addEventListener('click', conferirCasosSalesforce);
  const sfPend = document.getElementById('bulkSfPendBtn');
  if (sfPend) sfPend.addEventListener('click', criarTarefasPendentes);
  const fora = document.getElementById('bulkForaBtn');
  if (fora) fora.addEventListener('click', () => exportarForaDeCasa());
  const limpar = document.getElementById('bulkLimparConf');
  if (limpar) {
    limpar.addEventListener('click', () => {
      for (const r of bulkRows) {
        if (BULK_NADA_A_FAZER.includes(r.status)) { r.status = 'pendente'; r.detalhe = ''; }
      }
      log('Conferência limpa: todos os sites voltaram para a fila.', 'info');
      renderBulkLista();
    });
  }
  const stop = document.getElementById('bulkStopBtn');
  if (stop) {
    stop.addEventListener('click', () => {
      bulkParar = true;
      log('Vou parar quando este site terminar. Não corto no meio do painel.', 'warn');
      renderBulkLista();
    });
  }
  const stopNow = document.getElementById('bulkStopNowBtn');
  if (stopNow) {
    stopNow.addEventListener('click', async () => {
      bulkParar = true;
      bulkParouNoMeio = true;
      await pararAgora();
      renderBulkLista();
    });
  }
}

async function rodarBulk({ retomando = false } = {}) {
  if (bulkRodando) return;
  if (!state.googleSaPath) {
    log('Configure o caminho da service account antes de rodar em massa.', 'error');
    return;
  }

  // A mesma conta do botão: quem já está publicado ou já foi feito não entra.
  const fila = bulkFilaAtual();
  if (!fila.length) return;

  const cfg = await window.api.getPublicacaoConfig();
  const servidorId = String(cfg?.config?.hestiaServidorPadrao || '11');
  const host = cfg?.config?.hestiaServidores?.[servidorId] || servidorId;

  // Sem confirmação de lista (ADR-072): o botão diz o que vai acontecer, e a
  // lista já está na tela. A parada que fica é a do DNS, uma por domínio.
  bulkRodando = true;
  bulkParar = false;
  bulkParouNoMeio = false;
  // Rodada longa: o Windows não pode suspender o app no meio (ADR-094).
  window.api.manterAcordado(true).catch(() => {});
  // Retomando uma rodada interrompida, as listas do fim (SSL, fora de casa)
  // vêm do arquivo salvo e não podem ser zeradas (ADR-096).
  if (!retomando) {
    bulkSslPendentes = [];
    bulkSslAtivados = [];
    bulkForaDeCasa = [];
  }
  bulkSfCriadas = [];
  bulkSfPendentes = [];
  bulkGoogleQuebrado = null;
  // Alguma linha pede tarefa no Salesforce? Só então conferimos a conexão, uma
  // vez, para não incomodar quem não usa essa coluna (ADR-090).
  bulkSfConectado = false;
  if (state.sfTarefasAuto || bulkRows.some((r) => r.caso)) {
    try {
      const sf = await window.api.salesforceGetConfig();
      bulkSfConectado = !!(sf && sf.ok && sf.conectado);
      if (!bulkSfConectado) log('Há linhas com link do caso, mas o Salesforce não está conectado. Vou publicar normalmente e, no fim, não crio as tarefas. Conecte nas configurações se quiser que ele crie sozinho.', 'warn');
    } catch (e) { bulkSfConectado = false; }
  }
  const marca = state.brand;
  log(`Publicar e vincular: ${fila.length} site(s) de ${brandName(marca)}, um por vez, no servidor Hestia ${host} (id ${servidorId}). Quem já estiver publicado é só vinculado.`, 'cmd');
  log(fila.map((r) => r.dominio).join(', '), 'info');
  renderBulkLista();

  let ok = 0;
  let parciais = 0;
  let falhas = 0;

  await salvarRodada('publicando');
  for (const row of fila) {
    // Salva antes de cada site: o que já terminou fica gravado, e se o Windows
    // fechar tudo no meio, a rodada volta daqui (ADR-096).
    await salvarRodada('publicando');
    if (bulkParar) {
      row.status = 'pulado';
      row.detalhe = 'parada pedida antes de começar este';
      continue;
    }

    row.status = 'rodando';
    row.detalhe = '';
    renderBulkLista();
    log(`${row.razao ? row.razao + ' · ' : ''}${row.dominio}`, 'cmd');

    // DNS antes de tudo: o SSL só emite com o domínio apontando para o servidor
    // novo, e a propagação leva tempo (ADR-058). Quem decide se mexemos é o
    // contato técnico (ADR-061).
    let publicou = null;
    try {
      // O contrato certo antes de tudo: sem ele não mexe nem no DNS (ADR-098).
      await garantirLinkDoPainel(row);
      await salvarRodada('publicando');
      const quem = await descobrirEmpresaDoDominio(row);
      row.empresa = quem.empresa;
      row.dnsNosso = quem.dnsNosso;

      if (quem.dnsNosso) {
        await cuidarDoDnsEmMassa(row, quem.empresa);
      } else if (quem.dnsNosso === null) {
        log(`${row.dominio}: ${quem.motivo}. Não mexo no DNS e não afirmo que ele é do cliente; sigo para o painel.`, 'warn');
      } else if (quem.foraDoBr) {
        // Já avisado acima. Só quem não aponta vai para a planilha do
        // atendimento: é o que precisa de alguém falando com o cliente.
        if (!row.foraDoBr?.apontando) bulkForaDeCasa.push({ razao: row.razao || '', dominio: row.dominio, painel: row.painel || '', motivo: quem.motivo });
      } else {
        bulkForaDeCasa.push({ razao: row.razao || '', dominio: row.dominio, painel: row.painel || '', motivo: quem.motivo || 'contato técnico não é nosso' });
        log(
          `O DNS de ${row.dominio} é do cliente (${quem.motivo}): pulo Cloudflare e Registro.br. ` +
            'Ele entra na lista dos que não estão conosco, para o atendimento.',
          'warn'
        );
      }

      publicou = await publicarSeNecessario(row, servidorId);
      // Voltou sem erro = o site está no ar (já estava, ou acabou de subir).
      // Daqui para frente, o que falhar é vínculo, não publicação (ADR-092).
      row.publicado = true;
      row.publicadoDetalhe = publicou?.jaEstava ? 'já estava publicado' : (publicou?.detalhe || 'publicado');
    } catch (e) {
      row.status = 'falhou';
      row.detalhe = ehParada(e) || paradaAgora ? 'parado por você no meio; volta para a fila ao retomar' : e.message;
      falhas++;
      renderBulkLista();
      continue;
    }

    // Já estava publicado: antes de procurar qualquer coisa no Google, abre o
    // painel e vê se o vínculo já está lá. Estando, não há o que fazer, e a
    // linha termina sem gastar chamada nenhuma (ADR-087).
    if (publicou?.jaEstava) {
      const conf = await withBusy(`conferindo o vínculo de ${row.dominio}`, () =>
        window.api.syncPainel({ url: normalizePainelUrl(row.painel), etapas: ['conferir'] })
      );
      if (conf.log) for (const e of conf.log) log(e.message, e.type);
      if (conf.ok && conf.conferencia?.completo) {
        row.status = 'ok';
        row.detalhe = 'já publicado e já vinculado, não mexi';
        ok++;
        renderBulkLista();
        try {
          const pl = await registrarLinhaDaPlanilha(row);
          if (pl.jaExistia) row.detalhe += ' · já estava na planilha';
          else if (pl.onde) row.detalhe += ` · planilha ${pl.aba}`;
        } catch (e) {
          log(`Planilha de ${row.dominio}: ${e.message}`, 'warn');
        }
        renderBulkLista();
        continue;
      }
      if (conf.ok) log(`${row.dominio}: falta ${(conf.conferencia?.faltando || []).join(', ') || 'parte do vínculo'}. Vou sincronizar.`, 'info');
      else log(`Não consegui conferir o vínculo de ${row.dominio} (${conf.error}). Vou sincronizar do mesmo jeito.`, 'warn');
    }

    // A chave do Google já foi recusada nesta rodada: ela vale para todos os
    // sites, então não adianta tentar de novo a cada um. O site está publicado;
    // o vínculo fica pendente para a próxima rodada (ADR-092).
    if (bulkGoogleQuebrado) {
      await fecharPublicadoSemVinculo(row, 'vínculo do Google pendente (chave da service account recusada)');
      parciais++;
      continue;
    }

    const res = await withBusy(`vinculando ${row.dominio}`, () =>
      window.api.createGoogleProject({
        domain: row.dominio,
        saPath: state.googleSaPath,
        brand: marca,
        // Com a caixa marcada, o que não existir é criado; sem ela, só relatado.
        // Em qualquer um dos dois, o que já existe é reaproveitado.
        steps: ['analytics', 'gtm', 'recaptcha', 'searchconsole'],
        apenasExistentes: !bulkCriar,
        // A empresa veio do contato técnico: decide só a conta do Tag Manager.
        empresaGtm: row.empresa || '',
      })
    );
    if (res.log) for (const entry of res.log) log(entry.message, entry.type);

    if (!res.ok) {
      if (res.saInvalida && !bulkGoogleQuebrado) {
        bulkGoogleQuebrado = res.error || 'chave da service account recusada';
        log('Parei de chamar o Google nesta rodada: a chave da service account foi recusada, e ela é a mesma para todos os sites. Sigo publicando e registrando na planilha e no Salesforce; os vínculos ficam pendentes para rodar de novo depois de trocar a chave.', 'warn');
      }
      // O site está publicado (publicarSeNecessario voltou sem erro): falhou o
      // vínculo, não a publicação. Parcial, não falha (ADR-092).
      await fecharPublicadoSemVinculo(row, res.saInvalida
        ? 'vínculo do Google pendente (chave da service account recusada)'
        : `vínculo do Google falhou: ${res.error || 'erro ao procurar no Google'}`);
      parciais++;
      continue;
    }

    const v = { ...res.result, idProjetoBusca: '' };

    // Sem Measurement ID o painel não tem o que guardar, e o relatório
    // reprovaria com uma frase genérica. Melhor dizer aqui o que faltou.
    if (!v.idAnalytics) {
      await fecharPublicadoSemVinculo(row, bulkCriar
        ? 'sem Measurement ID: a etapa do Analytics falhou, veja o terminal'
        : 'sem propriedade GA4, e a criação está desmarcada');
      parciais++;
      continue;
    }

    const painel = await publicarMpiPlus(v, null, {
      painelUrl: row.painel,
      brand: marca,
      externalId: row.externalId || '',
    });

    if (!painel || !painel.ok) {
      // Publicado, mas o painel não guardou o vínculo: parcial, e a planilha e
      // o Salesforce seguem (ADR-092).
      row.status = 'parcial';
      row.detalhe = `${row.publicadoDetalhe || 'publicado'} · o painel não aceitou o vínculo: ${painel?.error || 'sem resposta'}`;
      parciais++;
    } else if ((painel.falhas || []).length || (res.result.faltando || []).length) {
      row.status = 'parcial';
      const pedacos = [];
      if ((res.result.faltando || []).length) pedacos.push(`não existia: ${res.result.faltando.join(', ')}`);
      if ((painel.falhas || []).length) pedacos.push(`painel: ${painel.falhas.map((f) => f.bloco).join(', ')}`);
      row.detalhe = pedacos.join(' · ');
      parciais++;
    } else {
      row.status = 'ok';
      // O resumo diz as duas coisas: o que aconteceu na publicação e o que
      // ficou vinculado. "já estava publicado" é informação, não falha.
      row.detalhe = `${publicou?.jaEstava ? 'já estava publicado' : publicou?.detalhe || 'publicado'} · ${v.idAnalytics}`;
      ok++;
    }

    // A linha na planilha fecha o site, e só depois de ele ter dado certo.
    if (row.status === 'ok' || row.status === 'parcial') {
      try {
        const pl = await registrarLinhaDaPlanilha(row);
        if (pl.jaExistia) row.detalhe += ' · já estava na planilha';
        else if (pl.onde) row.detalhe += ` · planilha ${pl.aba}`;
      } catch (e) {
        log(`Planilha de ${row.dominio}: ${e.message}`, 'warn');
      }
    }
    renderBulkLista();
  }

  bulkRodando = false;
  bulkParar = false;
  window.api.manterAcordado(false).catch(() => {});
  if (bulkParouNoMeio) {
    // Parou no meio: sem tarefas do Salesforce nem resumo do fim. A rodada
    // fica salva, e o "Retomar" continua de onde parou e faz o fim.
    bulkParouNoMeio = false;
    await pararTerminou();
    await salvarRodada('publicando');
    renderBulkLista();
    renderBulkRetomar();
    log(`Publicar em massa parado por você: ${ok} completo(s), ${parciais} parcial(is). As tarefas do Salesforce não foram criadas. A rodada ficou salva: "Retomar" continua de onde parou (o site do meio volta para a fila) e faz as tarefas no fim.`, 'warn');
    return;
  }
  renderBulkLista();

  log(
    `Publicar em massa terminou: ${ok} completo(s), ${parciais} parcial(is), ${falhas} com falha.` +
      (parciais || falhas ? ' Os que não fecharam estão marcados na lista, com o motivo.' : ''),
    falhas ? 'warn' : 'success'
  );

  if (bulkGoogleQuebrado) {
    log(`Os vínculos do Google ficaram pendentes nesta rodada. ${bulkGoogleQuebrado} Depois de trocar a chave, rode o Publicar em massa de novo com a mesma planilha: os parciais voltam para a fila, nada é republicado e só o vínculo é refeito.`, 'warn');
  }

  // Publicou todos: agora as tarefas no Salesforce, sozinho, sem botão (ADR-090).
  await salvarRodada('tarefas');
  await criarTarefasSalesforceNoFim();
  await fecharRodadaSalva();

  // O SSL é a única etapa que depende de um relógio que não é nosso, então ele
  // tem o próprio resumo, no fim, onde não se perde no meio do log.
  if (bulkSslPendentes.length) {
    log(`Falta ativar o SSL de ${bulkSslPendentes.length} site(s), no painel, depois que o DNS propagar:`, 'warn');
    for (const p of bulkSslPendentes) log(`  ${p.dominio}: ${p.motivo}`, 'warn');
    await window.api.copyToClipboard(bulkSslPendentes.map((x) => x.dominio).join('\n'));
    log('Os domínios estão na sua área de transferência.', 'info');
  }
  if (bulkSslAtivados.length) {
    log(`SSL ativado em ${bulkSslAtivados.length} site(s): ${bulkSslAtivados.join(', ')}.`, 'success');
  }
  if (!bulkSslPendentes.length && !bulkSslAtivados.length) {
    log('SSL: nada a fazer nesta rodada (ninguém precisou publicar).', 'info');
  }

  // Quem não está conosco sai em planilha, para o atendimento falar com o
  // cliente. Pergunta onde salvar; o botão da lista refaz quando quiser.
  if (bulkForaDeCasa.length) {
    log(`${bulkForaDeCasa.length} domínio(s) não estão conosco no Registro.br: ${bulkForaDeCasa.map((x) => x.dominio).join(', ')}.`, 'warn');
    await exportarForaDeCasa();
  }
}

const FORA_DE_CASA_COLUNAS = ['Razão social', 'Domínio', 'Situação no Registro.br', 'Link do painel'];

function linhasForaDeCasa(lista) {
  return (lista || []).map((x) => [x.razao || '', x.dominio || '', x.motivo || '', x.painel || '']);
}

async function exportarForaDeCasa() {
  if (!bulkForaDeCasa.length) { log('Nenhum domínio fora de casa nesta rodada.', 'info'); return; }
  const d = new Date();
  const nome = `dominios-fora-de-casa-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`;
  // Sem diálogo: vai direto para Músicas\apontamentos (ADR-082).
  const res = await window.api.exportarPlanilha({ nomeSugerido: nome, colunas: FORA_DE_CASA_COLUNAS, linhas: linhasForaDeCasa(bulkForaDeCasa), aba: 'Fora de casa', pasta: 'apontamentos' });
  if (!res.ok) { log(res.error, 'error'); return; }
  log(`Planilha salva em ${res.caminho} (${res.linhas} linha(s)). É a lista para o atendimento pedir o apontamento ou o contato técnico ao cliente.`, 'success');
}

// ----- Modo publicar: aprovar, publicar em produção e ativar o SSL -----
//
// Só os passos do painel. DNS, Cloudflare e Registro.br ficam de fora: a
// planilha não traz essa informação, e essas etapas têm parada obrigatória por
// projeto (ADR-058). Antes de mudar qualquer coisa, uma passada só de leitura
// diz quem já está publicado, que é o que "publicar só quem falta" precisa.

async function conferirBulkPublicacao() {
  if (bulkRodando) return;
  const fila = bulkRows.filter(bulkTemPainel);
  if (!fila.length) return;

  bulkRodando = true;
  bulkParar = false;
  bulkParouNoMeio = false;
  renderBulkLista();
  log(`Conferindo no painel o estado de ${fila.length} site(s). Só leitura, nada muda.`, 'cmd');

  let jaPublicados = 0;
  for (const row of fila) {
    if (bulkParar) { row.status = 'pulado'; row.detalhe = 'parada pedida antes deste'; continue; }
    row.status = 'rodando';
    row.detalhe = '';
    renderBulkLista();

    try {
      await garantirLinkDoPainel(row);
    } catch (e) {
      row.status = 'falhou';
      row.detalhe = e.message;
      renderBulkLista();
      continue;
    }
    const res = await withBusy(`conferindo ${row.dominio}`, () =>
      window.api.publicarPainel({ url: normalizePainelUrl(row.painel), etapa: 'estado', dominio: row.dominio })
    );
    if (res.log) for (const e of res.log) log(e.message, e.type);
    let divergiu = null;
    if (res.ok) { try { conferirTemporario(row, res.estado); } catch (e) { divergiu = e.message; } }

    if (!res.ok || divergiu) {
      row.status = 'falhou';
      row.detalhe = divergiu || res.error || 'não consegui ler o painel';
    } else {
      // "Publicado" é o mesmo teste que o painel usa para responder jaEstava.
      const e = res.estado || {};
      if (e.concluido && !e.falhou) {
        row.status = 'publicado';
        row.detalhe = e.urlProducao || 'produção concluída';
        jaPublicados++;
      } else {
        row.status = 'apublicar';
        row.detalhe = `site ${e.siteStatus || '?'}${e.falhou ? ', a publicação anterior falhou' : ''}`;
      }
    }
    renderBulkLista();
  }

  bulkRodando = false;
  bulkParar = false;
  if (bulkParouNoMeio) { bulkParouNoMeio = false; await pararTerminou(); log('Conferência parada por você.', 'warn'); }
  renderBulkLista();
  const aPublicar = bulkRows.filter((r) => r.status === 'apublicar').length;
  log(`Conferência: ${jaPublicados} já publicado(s), ${aPublicar} a publicar.`, 'info');
}

// O contato técnico no Registro.br decide duas coisas de uma vez: se o DNS é
// nosso (ADR-061) e de que empresa é o projeto, que é a aba da planilha
// (ADR-063). Pergunta às duas contas, na ordem, como o Publicar MPI+ faz.
async function descobrirEmpresaDoDominio(row) {
  // Fora do .br não há Registro.br para perguntar (ADR-079): o DNS é do
  // cliente. Se já aponta, segue calado; se não, é aviso para o analista.
  if (!dominioBr(row.dominio)) {
    const c = await conferirForaDoBr(row.dominio);
    row.foraDoBr = c;
    if (c.apontando) {
      log(`${row.dominio} não é .br e já aponta para ${c.ip}. Sem Registro.br nem Cloudflare; sigo para o painel.`, 'info');
      return { empresa: '', dnsNosso: false, foraDoBr: true, motivo: `fora do .br, já aponta para ${c.ip}` };
    }
    log(`ATENÇÃO: ${row.dominio} não é .br e ainda NÃO aponta para o servidor de produção (${c.motivo}). Avise o analista para pedir o apontamento. Sigo com o painel; o SSL fica para depois.`, 'warn');
    return { empresa: '', dnsNosso: false, foraDoBr: true, motivo: `fora do .br, ainda não aponta: ${c.motivo}. Pedir o apontamento do A da raiz para 149.18.102.39` };
  }

  // As duas contas juntas: são janelas separadas, e em série era o dobro.
  const respostas = await consultarRegistrobr(row.dominio, ['bc', 'mpisolutions']);
  const nossa = respostas.find((r) => r.res.ok && r.res.nosso);
  if (nossa) return { empresa: nossa.empresa, dnsNosso: true };
  // O motivo vai para a planilha do atendimento: o que o Registro.br disse.
  const vistas = respostas.filter((r) => r.res.ok);
  const naConta = vistas.filter((r) => r.res.naConta);
  if (vistas.length < respostas.length) {
    // Falha de consulta em qualquer conta não é "DNS do cliente": não dá para
    // afirmar nada (ADR-074).
    return { empresa: '', dnsNosso: null, motivo: `não consegui consultar o Registro.br: ${respostas.filter((r) => !r.res.ok).map((r) => `${brandName(r.empresa)}: ${r.res.error}`).join(' | ')}` };
  }
  const motivo = naConta.length
      ? naConta.map((r) => `na conta ${brandName(r.empresa)}: titular ${r.res.holder || '?'}, contato técnico ${r.res.tec || '(vazio)'} (esperado ${r.res.handle})`).join('; ')
      : 'domínio não está em nenhuma das duas contas do Registro.br';
  return { empresa: '', dnsNosso: false, motivo };
}

// O DNS de hoje, com o A da raiz destacado: é o único registro que o lote
// mexe numa zona que já existe, e é ele que a pessoa precisa olhar antes de
// confirmar.
function renderBulkDns(row, registros, { atual, ipAntigo, ipNovo }) {
  const wrap = document.getElementById('bulkDetalhe');
  if (!wrap) return;
  const ehRaiz = (r) => String(r.type).toUpperCase() === 'A' && normalizeDomain(r.name) === row.dominio;
  const linhas = (registros || [])
    .map(
      (r) =>
        `<tr class="${ehRaiz(r) ? 'is-changed' : ''}">` +
        `<td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.name)}</td>` +
        `<td>${escapeHtml(r.content)}${r.priority !== undefined && r.priority !== null ? ` (${r.priority})` : ''}</td>` +
        `<td class="faint">${ehRaiz(r) ? (atual === ipAntigo ? `vira ${escapeHtml(ipNovo)}` : 'fora do IP antigo, não mexo') : 'fica como está'}</td>` +
        '</tr>'
    )
    .join('');

  wrap.innerHTML = `
    <div class="section-label">${escapeHtml(row.dominio)}: zona na Cloudflare hoje (${(registros || []).length})</div>
    <div class="table-wrap"><table class="table"><tbody>${linhas || '<tr><td class="faint">nada encontrado</td></tr>'}</tbody></table></div>
    <p class="hint">Só o A da raiz muda, e só quando ele está em ${escapeHtml(ipAntigo)}. O resto da zona, inclusive o e-mail, fica como está.</p>
  `;
}

// Zona nova no lote: o antes (scan da Cloudflare mais a fotografia) e o depois
// (a zona final), com o que muda marcado. É a mesma leitura do Publicar MPI+.
function renderBulkZonaNova(row, res) {
  const wrap = document.getElementById('bulkDetalhe');
  if (!wrap) return;
  const chave = (r) => `${String(r.type).toUpperCase()}|${String(r.name).toLowerCase()}|${String(r.content).toLowerCase().replace(/\.$/, '')}|${r.priority ?? ''}`;
  const p = res.plano || { atualizar: [], criar: [], remover: [] };
  const muda = new Set(p.atualizar.map(chave));
  const novo = new Set(p.criar.map(chave));
  const cel = (r, extra) => `<td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.content)}${r.priority !== undefined && r.priority !== null ? ` (${r.priority})` : ''}</td>${extra || ''}`;
  const vistos = new Set();
  const antes = [...(res.existentes || []), ...((res.foto && res.foto.registros) || [])].filter((r) => { const k = chave(r); if (vistos.has(k)) return false; vistos.add(k); return true; });
  const hoje = antes.map((r) => `<tr>${cel(r)}</tr>`).join('');
  const depois = res.zona.registros.map((r) => {
    const k = chave(r);
    const estado = muda.has(k) ? 'muda' : novo.has(k) ? 'novo' : 'fica';
    return `<tr class="${estado === 'fica' ? '' : 'is-changed'}">${cel(r, `<td class="faint">${estado}${/copiado/.test(r.origem || '') ? '' : `, ${escapeHtml(r.origem || '')}`}</td>`)}</tr>`;
  }).join('');
  const sai = (p.remover || []).map((r) => `<tr class="is-changed">${cel(r, `<td class="faint">sai, ${escapeHtml(r.motivo || '')}</td>`)}</tr>`).join('');
  wrap.innerHTML = `
    <div class="section-label">${escapeHtml(row.dominio)}: DNS hoje (${antes.length}), zona nova na Cloudflare</div>
    <div class="table-wrap"><table class="table"><tbody>${hoje || '<tr><td class="faint">nada encontrado</td></tr>'}</tbody></table></div>
    <div class="section-label">Zona final (${res.zona.registros.length}), IP antigo ${escapeHtml(res.zona.ipAntigo || '?')}, IP novo ${escapeHtml(res.zona.ipNovo)}</div>
    <div class="table-wrap"><table class="table"><tbody>${depois}${sai}</tbody></table></div>
    ${res.zona.avisos.length ? `<p class="hint warn-text">${res.zona.avisos.map(escapeHtml).join('<br>')}</p>` : ''}
  `;
}

// DNS no lote (ADR-067, ADR-071). A zona é montada pela Cloudflare: acha ou
// cria, deixa ela varrer o DNS atual, completa com a fotografia. Daí dois
// caminhos:
//
//   - zona que já existia: só a troca do IP da raiz, e só quando ela está no
//     IP antigo conhecido. É o caso dos sites MPI+ que já estão na Cloudflare
//     e só precisam sair do servidor antigo; reescrever o resto seria mexer
//     no que ninguém pediu.
//   - zona nova: tudo replicado, só a raiz e o www vão para o servidor novo,
//     e-mail preservado no antigo; e os nameservers vão para o Registro.br,
//     senão a zona não vale nada.
//
// Nos dois, uma confirmação: a do DNS, uma por domínio.
async function cuidarDoDnsEmMassa(row, empresa) {
  const cfg = await window.api.getPublicacaoConfig();
  const ipAntigo = String(cfg?.config?.ipAntigoMpiMassa || '149.18.102.58').trim();
  const ipNovo = String(cfg?.config?.hestiaIpPublico || '149.18.102.39').trim();

  const res = await withBusy(`montando a zona de ${row.dominio} na Cloudflare`, () =>
    window.api.montarZonaCloudflare({ empresa, dominio: row.dominio, hostsExtras: [] })
  );
  if (res.log) for (const e of res.log) log(e.message, e.type);
  if (!res.ok) throw new Error(res.error);

  const zonaTinhaRegistros = !res.criada && (res.existentes || []).length > 0;

  if (zonaTinhaRegistros) {
    const raiz = (res.existentes || []).filter((r) => String(r.type).toUpperCase() === 'A' && normalizeDomain(r.name) === row.dominio);
    const atual = raiz[0]?.content || '';
    renderBulkDns(row, res.existentes, { atual, ipAntigo, ipNovo });

    if (!atual) {
      log(`${row.dominio} não tem registro A na raiz na Cloudflare, não mexo no DNS.`, 'warn');
      return { aplicado: false, motivo: 'sem A na raiz' };
    }
    if (atual === ipNovo) {
      log(`${row.dominio} já aponta para ${ipNovo} na Cloudflare. Nada a fazer no DNS.`, 'info');
      return { aplicado: false, motivo: 'já no IP novo' };
    }
    if (atual !== ipAntigo) {
      log(`${row.dominio} está em ${atual}, não em ${ipAntigo}. Não mexo no DNS dele.`, 'warn');
      return { aplicado: false, motivo: `está em ${atual}` };
    }
    if (raiz.length > 1) {
      log(`${row.dominio} tem ${raiz.length} registros A na raiz. Vou trocar só o primeiro; confira os outros.`, 'warn');
    }

    const segue = confirm(
      `Trocar o IP de ${row.dominio}?\n\n${ipAntigo}   ->   ${ipNovo}\n\n` +
        'Só o registro A da raiz muda. O resto da zona (MX, CNAME, TXT, e-mail) fica exatamente como está.'
    );
    if (!segue) {
      log(`IP de ${row.dominio} não trocado: você cancelou. Sigo para publicar e vincular.`, 'warn');
      return { aplicado: false, motivo: 'cancelado' };
    }

    // Um registro só: o aplicador deixa intacto o que a proposta não menciona.
    const cf = await withBusy(`trocando o IP de ${row.dominio}`, () =>
      window.api.aplicarCloudflare({
        empresa,
        dominio: row.dominio,
        registros: [{ type: 'A', name: row.dominio, content: ipNovo, ttl: 1, proxied: false }],
      })
    );
    if (cf.log) for (const e of cf.log) log(e.message, e.type);
    if (!cf.ok) throw new Error(cf.error);
    log(`${row.dominio}: ${ipAntigo} trocado por ${ipNovo}.`, 'success');
    return { aplicado: true, de: ipAntigo, para: ipNovo };
  }

  // Zona nova (ou vazia): a zona inteira, como o Publicar MPI+ faz.
  renderBulkZonaNova(row, res);
  const p = res.plano || { atualizar: [], criar: [], remover: [], manter: [] };
  const mudancas = [
    ...p.atualizar.map((r) => `${r.type} ${r.name}: ${r.antes} -> ${r.content}`),
    ...p.criar.map((r) => `novo ${r.type} ${r.name} -> ${r.content}`),
    ...p.remover.map((r) => `sai ${r.type} ${r.name} -> ${r.content}`),
  ];
  const segue = confirm(
    `Aplicar a zona de ${row.dominio} na Cloudflare de ${brandName(empresa)} e apontar os nameservers no Registro.br?\n\n` +
      `IP antigo ${res.zona.ipAntigo || '?'}, IP novo ${res.zona.ipNovo}. ${res.zona.registros.length} registro(s) na zona final, ${p.manter.length} ficam como estão.\n\n` +
      (mudancas.length ? `O que muda:\n${mudancas.join('\n')}` : 'Nada muda nos registros.') +
      (res.zona.avisos.length ? `\n\nAvisos:\n${res.zona.avisos.join('\n')}` : '') +
      '\n\nA tabela ao lado tem a zona inteira, antes e depois.'
  );
  if (!segue) {
    log(`Zona de ${row.dominio} não aplicada: você cancelou. A zona fica na Cloudflare como o scan deixou, sem nameserver apontado. Sigo para publicar e vincular.`, 'warn');
    return { aplicado: false, motivo: 'cancelado' };
  }

  if (mudancas.length) {
    const cf = await withBusy(`aplicando a zona de ${row.dominio}`, () =>
      window.api.aplicarCloudflare({ empresa, dominio: row.dominio, registros: res.zona.registros, remover: res.zona.remover || [] })
    );
    if (cf.log) for (const e of cf.log) log(e.message, e.type);
    if (!cf.ok) throw new Error(cf.error);
    if (cf.faltando) throw new Error(`${cf.faltando} registro(s) não ficaram como a proposta na zona de ${row.dominio}; veja o terminal`);
  }

  const ns = res.nameservers || [];
  if (ns.length < 2) {
    log(`A Cloudflare ainda não deu os nameservers da zona de ${row.dominio}; troque no Registro.br depois.`, 'warn');
    return { aplicado: true, zonaNova: true, nsPendente: true };
  }
  // Nameserver que não troca não desfaz a zona (ADR-066): avisa e a rodada segue.
  const tr = await withBusy(`trocando os nameservers de ${row.dominio} no Registro.br`, () =>
    window.api.registrobrTrocarNs({ empresa, dominio: row.dominio, nameservers: ns })
  );
  if (tr.log) for (const e of tr.log) log(e.message, e.type);
  if (!tr.ok) {
    log(`Nameservers de ${row.dominio} não trocados (${tr.error}). Coloque no Registro.br: ${ns.join(' e ')}. A zona já está na Cloudflare.`, 'warn');
    return { aplicado: true, zonaNova: true, nsPendente: true, ns };
  }
  log(`${row.dominio}: zona aplicada e nameservers ${ns.join(' e ')} no Registro.br.`, 'success');
  return { aplicado: true, zonaNova: true, ns };
}

// A linha na planilha de publicações (ADR-062), sem duplicar o que já está lá.
// A razão social vem da planilha de entrada; sem ela não há o que escrever.
async function registrarLinhaDaPlanilha(row) {
  // Sem razão social na planilha de entrada mas com o link do caso: o caso
  // tem a conta — pega de lá em vez de pular (ADR-123).
  if (!row.razao && row.caso) {
    const ctx = await withBusy(`lendo a conta pelo caso de ${row.dominio}`, () => window.api.salesforceContexto({ caso: row.caso })).catch((e) => ({ ok: false, error: e.message }));
    if (ctx?.log) for (const e of ctx.log) log(e.message, e.type);
    if (ctx?.ok && ctx.razao) { row.razao = ctx.razao; log(`${row.dominio}: razão social pelo caso: ${ctx.razao}.`, 'info'); }
    if (ctx?.ok && ctx.empresa && !PLANILHA_ABA_POR_EMPRESA[row.empresa]) row.empresa = ctx.empresa;
  }
  if (!row.razao) {
    log(`${row.dominio}: sem razão social na planilha de entrada (e o caso não deu a conta), não registro na planilha de publicações.`, 'warn');
    return { pulado: true };
  }

  let empresa = row.empresa;
  if (!PLANILHA_ABA_POR_EMPRESA[empresa]) {
    // Sem contato técnico nosso, o Registro.br não diz a empresa. Mas se o site
    // já está registrado numa das abas, a resposta está ali: procuro nas duas
    // antes de perguntar, para a rodada não parar esperando alguém (ADR-095).
    const busca = await withBusy(`procurando ${row.dominio} na planilha`, () =>
      window.api.procurarNaPlanilha({ dominio: row.dominio })
    ).catch((e) => ({ ok: false, error: e.message }));
    if (busca?.log) for (const e of busca.log) log(e.message, e.type);
    if (busca?.ok && busca.achado) {
      const achouEmpresa = Object.keys(PLANILHA_ABA_POR_EMPRESA).find((k) => PLANILHA_ABA_POR_EMPRESA[k] === busca.achado.abaPedida);
      if (achouEmpresa) row.empresa = achouEmpresa;
      log(`${row.dominio}: já está na aba ${busca.achado.aba}, linha ${busca.achado.linha}. Não precisei perguntar a empresa nem vou duplicar.`, 'info');
      return { jaExistia: true, onde: busca.achado.onde, aba: busca.achado.aba };
    }
    if (busca && !busca.ok) log(`Não consegui procurar ${row.dominio} na planilha (${busca.error}).`, 'warn');
    // Com o link do caso na planilha de entrada, o caso diz a empresa (campo
    // "Projeto") — sem parar a rodada perguntando (ADR-123).
    if (row.caso) {
      const ctx = await withBusy(`lendo a empresa pelo caso de ${row.dominio}`, () => window.api.salesforceContexto({ caso: row.caso })).catch((e) => ({ ok: false, error: e.message }));
      if (ctx?.log) for (const e of ctx.log) log(e.message, e.type);
      if (ctx?.ok && ctx.empresa) {
        empresa = ctx.empresa;
        row.empresa = empresa;
        if (!row.razao && ctx.razao) row.razao = ctx.razao;
        log(`${row.dominio}: empresa pelo ${ctx.via}.`, 'info');
      }
    }
    if (!PLANILHA_ABA_POR_EMPRESA[empresa]) {
      // Nem planilha nem caso disseram: aí sim pergunta (ADR-064).
      empresa = await perguntarNoTerminal(
        `De qual empresa é ${row.dominio}? O contato técnico no Registro.br não é nosso e o caso não diz. Isso decide a aba da planilha.`,
        [
          { valor: 'bc', rotulo: 'Busca Cliente (aba Busca Cliente)' },
          { valor: 'mpisolutions', rotulo: 'MPI Solutions (aba MPI)' },
        ]
      );
      row.empresa = empresa;
    }
  }

  const aba = PLANILHA_ABA_POR_EMPRESA[empresa];
  const cfg = await window.api.getPublicacaoConfig();
  const servidorId = String(cfg?.config?.hestiaServidorPadrao || '11');
  const servidor = cfg?.config?.hestiaServidores?.[servidorId] || servidorId;
  const linha = montarLinhaPlanilha({
    dominio: row.dominio,
    razao: row.razao,
    marca: 'mpiplus',
    desenvolvedor: cfg?.config?.desenvolvedor || '',
    servidor: `Hestia ${servidor}`,
    // Só "Finalizado" quando o DNS foi de fato nosso; sem consulta é "Não se aplica".
    dnsNosso: row.dnsNosso === true,
  });

  const res = await withBusy(`registrando ${row.dominio} na planilha`, () =>
    window.api.registrarPlanilha({ aba, linha, pularSeExistir: true })
  );
  if (res.log) for (const e of res.log) log(e.message, e.type);
  if (!res.ok) {
    log(`Planilha: ${res.error}`, res.reauth ? 'warn' : 'error');
    return { erro: res.error };
  }
  return { jaExistia: !!res.jaExistia, onde: res.onde, aba };
}

// Dá para pedir o SSL agora? O painel só emite o certificado depois que o
// domínio resolve para o servidor de produção; pedir antes disso devolve
// sempre "Não foi possível ativar o SSL de produção", uma mensagem que não
// diz o que falta. Então o Hub pergunta ao DNS primeiro (ADR-069).
async function conferirApontamentoDeProducao(dominio) {
  const cfg = await window.api.getPublicacaoConfig();
  const ip = String(cfg?.config?.hestiaIpPublico || '149.18.102.39').trim();

  const r = await window.api.conferirApontamento({ dominio, ip });
  if (!r.ok) return { pronto: false, ip, motivo: `não consegui consultar o DNS (${r.error})` };
  if (r.apontando) return { pronto: true, ip, motivo: `visto em ${(r.vistoEm || []).join(', ') || 'DNS'}`, www: r.wwwApontando };

  // Sem resposta é espera; resposta com outro IP é DNS que ninguém trocou. As
  // duas pulam o SSL, mas quem lê o resumo precisa saber qual das duas é.
  const motivo = r.resolveu
    ? `ainda aponta para ${r.raiz.join(', ')}, não para ${ip}`
    : 'ainda não resolve nos DNS públicos; a troca no Registro.br leva até 2 horas para publicar';
  return { pronto: false, ip, motivo };
}

function anotarSslPendente(dominio, motivo) {
  bulkSslPendentes.push({ dominio, motivo });
  log(`SSL de ${dominio} ficou para depois: ${motivo}. Anotei para o resumo do fim.`, 'warn');
}

// Publica o site se ele ainda não estiver publicado. Devolve o que aconteceu,
// para o resumo da linha; estoura quando a publicação falha, e aí a linha não
// segue para o vínculo (vincular um site que não subiu daria erro pior adiante).
async function publicarSeNecessario(row, servidorId) {
  const url = normalizePainelUrl(row.painel);
  const passo = async (etapa, rotulo, extra = {}) => {
    const res = await withBusy(`${rotulo} ${row.dominio}`, () =>
      window.api.publicarPainel({ url, etapa, dominio: row.dominio, ...extra })
    );
    if (res.log) for (const e of res.log) log(e.message, e.type);
    if (!res.ok) throw new Error(res.error || `falhou ao ${rotulo}`);
    return res.estado || {};
  };

  const antes = await passo('estado', 'conferindo');
  conferirTemporario(row, antes);
  // O mesmo teste que o painel usa para responder "já estava".
  if (antes.concluido && !antes.falhou) {
    log(`${row.dominio} já está publicado, vou direto para o vínculo.`, 'info');
    return { jaEstava: true, detalhe: antes.urlProducao || 'já publicado' };
  }

  await passo('aprovar', 'aprovando');
  const depois = await passo('publicar', 'publicando', { servidorId });
  let detalhe = depois.urlProducao || 'publicado';

  // O SSL falhar não desfaz a publicação nem impede o vínculo: registra e segue.
  // E, antes de pedir, confere o apontamento: sem ele o pedido é falha certa.
  const ap = await withBusy(`conferindo o apontamento de ${row.dominio}`, () =>
    conferirApontamentoDeProducao(row.dominio)
  );
  if (!ap.pronto) {
    detalhe += ', SSL pendente';
    anotarSslPendente(row.dominio, ap.motivo);
    return { jaEstava: false, detalhe, sslPendente: ap.motivo };
  }
  log(`${row.dominio} já aponta para ${ap.ip}. Posso pedir o SSL.`, 'info');
  try {
    const e = await passo('ssl', 'ativando o SSL de');
    if (e.sslAtivo) {
      bulkSslAtivados.push(row.dominio);
    } else {
      detalhe += ', SSL não ativou';
      anotarSslPendente(row.dominio, e.sslErro || 'o painel não confirmou o certificado');
    }
  } catch (e) {
    detalhe += `, SSL falhou: ${e.message}`;
    anotarSslPendente(row.dominio, e.message);
  }
  return { jaEstava: false, detalhe };
}

// ---------- Ferramenta: Publicar MPI+ (ponta a ponta, ADR-058) ----------
//
// Um projeto MPI+ do começo ao fim, na ordem em que as coisas dependem umas
// das outras: DNS primeiro (o SSL precisa do domínio apontando), painel no
// meio (aprovar, publicar, SSL), tags no fim. Duas paradas obrigatórias, as
// que o Everton pediu: antes de aplicar o DNS e antes de publicar.

// Um projeto MPI+ pode ser da Busca Cliente ou da MPI Solutions, e quem diz é
// o contato técnico do domínio no Registro.br: BCTDL ou MPSOL83 (ADR-063). O
// padrão é descobrir; escolher à mão fica para quando o domínio não está em
// nenhuma das duas contas.
const PUB_EMPRESAS = [
  { id: 'auto', nome: 'Descobrir pelo contato técnico no Registro.br' },
  { id: 'bc', nome: 'Busca Cliente' },
  { id: 'mpisolutions', nome: 'MPI Solutions' },
];
const PLANILHA_ABA_POR_EMPRESA = { bc: 'Busca Cliente', mpisolutions: 'MPI' };

const PUB_ETAPAS = [
  { id: 'contato', nome: 'Conferir no Registro.br se o contato técnico é nosso' },
  { id: 'dns', nome: 'Criar a zona na Cloudflare e levantar o DNS atual' },
  { id: 'cloudflare', nome: 'Aplicar a zona na Cloudflare', parada: true },
  { id: 'registro', nome: 'Trocar os nameservers no Registro.br' },
  { id: 'aprovar', nome: 'Aprovar o site no painel' },
  { id: 'publicar', nome: 'Publicar em produção' },
  { id: 'propagacao', nome: 'Esperar o DNS apontar para o servidor novo' },
  { id: 'ssl', nome: 'Ativar o SSL de produção' },
  { id: 'tags', nome: 'Criar as propriedades e sincronizar as tags' },
  { id: 'planilha', nome: 'Registrar na planilha de publicações' },
  { id: 'salesforce', nome: 'Fechar a tarefa no Salesforce e comentar marcando quem criou' },
];

// As etapas que só fazem sentido quando o DNS do domínio é nosso (ADR-061).
// Quando o contato técnico é do cliente, elas são puladas em bloco: o cliente
// aponta o domínio por conta dele, e o SSL só dá para ativar depois disso.
const PUB_ETAPAS_DNS = ['dns', 'cloudflare', 'registro', 'propagacao', 'ssl'];

// Etapas que, quando falham, podem ser puladas sem deixar o site pela metade:
// a conferência do contato (o DNS passa a ser tratado como nosso) e a troca de
// nameservers (a zona já está na Cloudflare, a troca pode ser feita depois).
// A pergunta é feita no terminal, só na falha; não há botão fixo (ADR-072).
const PUB_PULAVEIS = ['contato', 'registro', 'salesforce'];

// Estado de uma publicação. Fora do hub-state: é de um projeto só, agora.
let pub = null;

function pubNovo() {
  return {
    empresa: 'auto',
    dominio: '',
    razao: '',
    painelUrl: '',
    temporario: '',      // link temporário: confirma o contrato do painel (ADR-098)
    painelConferido: '', // o link do painel que já foi achado/conferido
    painelAchado: false, // o link veio da busca (não colado): refaz se mudar a razão ou o temporário
    sfTarefa: '',        // link da tarefa no Salesforce (ADR-089)
    hostsExtras: '',
    etapa: 'contato',       // a próxima a rodar
    dnsNosso: null,         // true, false, ou null quando não deu para saber
    feitas: {},             // id -> { ok, detalhe }
    rodando: false,         // uma etapa em execução
    emAndamento: false,     // o encadeamento inteiro em execução
    confirmado: false,      // a parada do DNS foi confirmada
    foto: null,             // { registros } dos autoritativos
    existentes: [],         // o que a zona já tinha na Cloudflare (scan incluso)
    zona: null,             // a proposta: { registros, remover, ipAntigo, ipNovo, avisos }
    plano: null,            // { criar, atualizar, remover, manter, sobras }
    cloudflare: null,       // { zoneId, nameservers, status, criada }
    propagado: false,
    sslPendente: null,      // motivo, quando o SSL ficou para depois (ADR-069)
    foraDoBr: null,         // { apontando, motivo } quando o domínio não é .br (ADR-079)
    transicaoAte: null,     // quando o Registro.br publica a troca de NS (ADR-080)
    sslAdiado: null,        // { ate } quando propagação e SSL ficaram para o fim
    apontando: false,
    scPendente: false,      // Search Console e relatório esperando o SSL (ADR-100)
    sfAdiado: false,        // a tarefa do Salesforce esperando o SSL adiado (ADR-101)
    v: null,                // o que o createGoogleProject devolveu
  };
}

function renderPublishTool() {
  if (!pub) pub = pubNovo();
  if (!pub.aba) pub.aba = Object.keys(pub.feitas || {}).length || pub.emAndamento ? 'etapas' : 'parametros';
  const abas = toolTabsHtml([{ id: 'parametros', nome: 'Parâmetros' }, { id: 'etapas', nome: 'Etapas', n: PUB_ETAPAS.length }], pub.aba, 'pub-aba');
  el.leftPanel.innerHTML = `
    ${backButtonHtml({ tabs: abas })}
    <div class="pub-tab ${pub.aba === 'parametros' ? 'active' : ''}" id="pubTabParametros">
    <div class="sec anim-in">
    <label class="field">
      <span>Empresa (decide a conta da Cloudflare e do Registro.br, e a aba da planilha)</span>
      <select id="pubEmpresa">
        ${PUB_EMPRESAS.map((e) => `<option value="${e.id}" ${pub.empresa === e.id ? 'selected' : ''}>${e.nome}</option>`).join('')}
      </select>
    </label>
    <label class="field">
      <span>Domínio</span>
      <input id="pubDominio" type="text" placeholder="ex: cliente.com.br" value="${escapeHtml(pub.dominio)}" autocomplete="off" />
    </label>
    <label class="field">
      <span>Razão social (vai para a planilha de publicações)</span>
      <input id="pubRazao" type="text" placeholder="ex: KAROLLINE FIGUEIREDO DERMATOLOGIA LTDA" value="${escapeHtml(pub.razao)}" autocomplete="off" />
    </label>
    <label class="field">
      <span>Link temporário (o do alto da aba Publicação; confirma o contrato certo)</span>
      <input id="pubTemporario" type="text" placeholder="ex: http://cliente-migra.mpitemporario.com.br" value="${escapeHtml(pub.temporario || '')}" autocomplete="off" />
    </label>
    <label class="field">
      <span>Link da tarefa no Salesforce (no fim da publicação, o Hub assume, conclui e comenta no feed marcando quem criou)</span>
      <input id="pubSfTarefa" type="text" placeholder="cole o link da tarefa de publicação" value="${escapeHtml(pub.sfTarefa || '')}" autocomplete="off" />
    </label>
    <div class="field" style="gap:6px">
      <span class="hint">Teste isolado (não publica nada): cada botão roda um passo sozinho no link acima.</span>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button id="pubSfAssumir" type="button" class="btn ghost compact">Assumir e concluir a tarefa</button>
        <button id="pubSfComentar" type="button" class="btn ghost compact">Comentar no feed (marca quem criou)</button>
      </div>
      <div id="pubSfTesteStatus" class="hint"></div>
    </div>
    <label class="field">
      <span>Outros hosts do DNS para conferir (opcional; pode separar por linha, vírgula ou ponto e vírgula)</span>
      <textarea id="pubHosts" rows="2" placeholder="ex: correio, erp, vpn" autocomplete="off">${escapeHtml(pub.hostsExtras)}</textarea>
    </label>
    <button id="pubIrEtapas" class="btn primary full-width">Continuar para validação de etapas →</button>
    </div>
    </div>
    <div class="pub-tab ${pub.aba === 'etapas' ? 'active' : ''}" id="pubTabEtapas">
    <div id="pubEsperas"></div>
    <div id="pubEtapas"></div>
    <div id="pubDetalhe"></div>
    </div>
    ${infoBoxHtml(`<p>Um botão, uma parada. O Hub procura o domínio nas duas contas do Registro.br (contato técnico BCTDL é Busca Cliente, MPSOL83 é MPI Solutions), cria a zona na Cloudflare e deixa a própria Cloudflare varrer o DNS atual, completa com a fotografia dos autoritativos e monta a zona final: tudo replicado, só a raiz e o www vão para o servidor novo, e-mail e o resto ficam onde estão. Aí ele para e mostra o antes e o depois; você confirma e o resto segue sozinho: nameservers, aprovar, publicar, SSL quando o DNS apontar, tags e planilha. Contato técnico do cliente: pula Cloudflare, Registro.br e SSL, faz o resto e pergunta a empresa antes da planilha. Domínio fora do .br (.com, por exemplo): não há Registro.br para perguntar; o Hub confere se a raiz já aponta para o servidor de produção e segue para aprovar e publicar; se não aponta, avisa em destaque para você pedir o apontamento ao analista. O campo de hosts é para subdomínio que só aquele cliente usa e nenhuma varredura adivinharia. Antes de tudo o Hub procura o cliente no painel pela razão social e fica com o contrato do link temporário; não achando, pede o link do painel no terminal e segue por ele. Com o link da tarefa, a última etapa assume e conclui a tarefa no seu nome e comenta "Site publicado" no caso, marcando quem criou. Quando o Registro.br só publica a troca de DNS daqui a horas, o site vai para a lista "Aguardando a propagação" com o que falta, e a tela fica livre para outro site; o Hub termina cada um sozinho quando o DNS apontar, um de cada vez, primeiro o de previsão mais cedo.</p>`)}
  `;

  document.getElementById('backToHub').addEventListener('click', goHome);
  const trocarAba = (aba) => { pub.aba = aba; el.leftPanel.querySelectorAll('[data-pub-aba]').forEach((b) => b.classList.toggle('active', b.dataset.pubAba === aba)); document.getElementById('pubTabParametros').classList.toggle('active', aba === 'parametros'); document.getElementById('pubTabEtapas').classList.toggle('active', aba === 'etapas'); };
  el.leftPanel.querySelectorAll('[data-pub-aba]').forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.pubAba)));
  document.getElementById('pubIrEtapas').addEventListener('click', () => {
    const d = normalizeDomain(document.getElementById('pubDominio').value);
    if (!d) { log('Preencha o domínio antes de ir para as etapas.', 'warn'); document.getElementById('pubDominio').focus(); return; }
    if (d !== pub.dominio) document.getElementById('pubDominio').dispatchEvent(new Event('change'));
    trocarAba('etapas');
  });
  document.getElementById('pubEmpresa').addEventListener('change', (e) => { pub.empresa = e.target.value; });
  document.getElementById('pubDominio').addEventListener('change', (e) => {
    const limpo = normalizeDomain(e.target.value);
    if (limpo && limpo !== e.target.value.trim()) { e.target.value = limpo; log(`Domínio normalizado: ${limpo}`, 'info'); }
    if (limpo !== pub.dominio && !pub.emAndamento) { pub = { ...pubNovo(), empresa: pub.empresa, razao: pub.razao, temporario: pub.temporario, sfTarefa: pub.sfTarefa, hostsExtras: pub.hostsExtras, dominio: limpo, aba: pub.aba }; renderPubEtapas(); renderPubDetalhe(); }
    renderAtalhosTerminal();
  });
  document.getElementById('pubTemporario').addEventListener('input', (e) => {
    pub.temporario = e.target.value.trim();
    // Outro temporário é outro contrato: o link achado antes não vale mais.
    if (!pub.emAndamento && pub.painelAchado) { pub.painelUrl = ''; pub.painelAchado = false; }
    pub.painelConferido = '';
  });
  document.getElementById('pubRazao').addEventListener('change', () => {
    if (!pub.emAndamento && pub.painelAchado) { pub.painelUrl = ''; pub.painelAchado = false; pub.painelConferido = ''; }
  });
  document.getElementById('pubRazao').addEventListener('input', (e) => { pub.razao = e.target.value.trim(); });
  const sfT = document.getElementById('pubSfTarefa');
  if (sfT) sfT.addEventListener('input', (e) => { pub.sfTarefa = e.target.value.trim(); });
  wireTesteSalesforce();
  document.getElementById('pubHosts').addEventListener('input', (e) => { pub.hostsExtras = e.target.value; });

  renderPubEtapas();
  renderPubDetalhe();
  renderEsperas();
}

// Os dois botões de teste do fechamento da tarefa no Salesforce (ADR-089).
// Cada um roda um passo sozinho, sem publicar nada, para conferir no link
// colado que o Hub assume/conclui e que o comentário marca quem criou.
function wireTesteSalesforce() {
  const status = document.getElementById('pubSfTesteStatus');
  const linkAtual = () => (document.getElementById('pubSfTarefa')?.value || '').trim() || (pub && pub.sfTarefa) || '';

  const rodar = async (btn, opcoes, rotuloBusy) => {
    const link = linkAtual();
    if (!link) { log('Cole o link da tarefa no campo acima antes de testar.', 'warn'); return; }
    const original = btn.textContent;
    const assumir = document.getElementById('pubSfAssumir');
    const comentar = document.getElementById('pubSfComentar');
    if (assumir) assumir.disabled = true;
    if (comentar) comentar.disabled = true;
    btn.textContent = 'Rodando...';
    if (status) status.textContent = rotuloBusy;
    const res = await withBusy(rotuloBusy, () => window.api.salesforceFecharTarefa({ link, ...opcoes }));
    if (assumir) assumir.disabled = false;
    if (comentar) comentar.disabled = false;
    btn.textContent = original;
    if (res.log) for (const e of res.log) log(e.message, e.type);
    if (!res.ok) { log(`Salesforce: ${res.error}`, 'error'); if (status) status.textContent = `Falhou: ${res.error}`; return; }
    if (status) status.textContent = 'Pronto. Veja o resultado no terminal.';
  };

  const assumir = document.getElementById('pubSfAssumir');
  if (assumir) assumir.addEventListener('click', () => rodar(assumir, { assumir: true, concluir: true }, 'assumindo e concluindo a tarefa'));
  const comentar = document.getElementById('pubSfComentar');
  if (comentar) comentar.addEventListener('click', () => rodar(comentar, { comentar: true, texto: 'Site publicado' }, 'comentando no feed da tarefa'));
}

// Entrada pelo "Criar propriedades" (ADR-073): chega com os campos prontos e,
// se pedido, já começa. Publicação em andamento não é interrompida.
async function irParaPublicar({ dominio, razao, painelUrl, iniciar = false }) {
  if (pub && pub.emAndamento) {
    log(`Já existe uma publicação em andamento (${pub.dominio}). Termine ou espere antes de começar outra.`, 'warn');
    await openTool('publish');
    return;
  }
  pub = { ...pubNovo(), dominio: normalizeDomain(dominio) || '', razao: (razao || '').trim(), painelUrl: (painelUrl || '').trim() };
  await openTool('publish');
  if (iniciar && pub.dominio && (normalizePainelUrl(pub.painelUrl) || pub.razao)) {
    log(`Publicar MPI+: ${pub.dominio}, vindo do Criar propriedades. Começando.`, 'cmd');
    pubRodarTudo();
  } else if (iniciar) {
    log('Confira domínio e link do painel e clique em Publicar.', 'warn');
  }
}

// Um botão só, que muda de nome conforme o momento (ADR-072): Publicar,
// Rodando, Confirmar e aplicar o DNS, Tentar de novo. Sem "Pular": pular é
// pergunta do terminal, na hora da falha, e só onde não deixa nada pela metade.
function pubRotuloBotao(atual) {
  if (pub.emAndamento || pub.rodando) return { texto: 'Rodando...', classe: 'primary', desabilitado: true };
  const falhou = pub.feitas[atual.id] && !pub.feitas[atual.id].ok;
  if (falhou) return { texto: 'Tentar de novo', classe: 'primary', desabilitado: false };
  if (atual.parada && pub.zona && !pub.confirmado) return { texto: 'Confirmar e aplicar o DNS na Cloudflare', classe: 'caution', desabilitado: false };
  const comecou = Object.keys(pub.feitas).length > 0;
  return { texto: comecou ? 'Continuar' : 'Publicar', classe: 'primary', desabilitado: false };
}

function renderPubEtapas() {
  const wrap = document.getElementById('pubEtapas');
  if (!wrap) return;
  const idx = PUB_ETAPAS.findIndex((e) => e.id === pub.etapa);
  let html = '<div class="section-label">Etapas</div><div class="rows">';
  PUB_ETAPAS.forEach((e, i) => {
    const feita = pub.feitas[e.id];
    const cls = feita ? (feita.ok ? 'is-ok' : 'is-err') : i === idx ? (pub.rodando ? 'is-running' : '') : '';
    const badge = feita
      ? `<span class="badge ${feita.ok ? 'ok' : 'err'}">${feita.ok ? (feita.pulada ? 'pulada' : 'feita') : 'falhou'}</span>`
      : i === idx
        ? `<span class="badge neutral">${pub.rodando ? 'rodando' : e.parada && pub.zona ? 'aguarda seu ok' : 'próxima'}</span>`
        : '';
    html += `<div class="row ${cls}">
      <div class="row__main">
        <div class="row__title">${i + 1}. ${escapeHtml(e.nome)}</div>
        ${feita?.detalhe ? `<div class="row__sub">${escapeHtml(feita.detalhe)}</div>` : ''}
      </div>
      ${badge}
    </div>`;
  });
  html += '</div>';

  const atual = PUB_ETAPAS[idx];
  if (atual) {
    const b = pubRotuloBotao(atual);
    html += `<button id="pubProximo" class="btn ${b.classe} full-width" style="margin-top:10px" ${b.desabilitado ? 'disabled' : ''}>${escapeHtml(b.texto)}</button>`;
    // Parar no meio (ADR-102): enquanto roda. Parado ou com algo feito,
    // dá para descartar a publicação e começar outra.
    if (pub.emAndamento || pub.rodando) {
      html += `<button id="pubParar" class="btn caution full-width" style="margin-top:6px" ${paradaAgora ? 'disabled' : ''}>${paradaAgora ? 'Parando...' : 'Parar agora'}</button>`;
    } else if (Object.keys(pub.feitas).length) {
      html += `<button id="pubDescartar" class="btn ghost full-width" style="margin-top:6px">Descartar esta publicação e começar de novo</button>`;
    }
  } else {
    html += `<div class="card card--result"><div class="card__title">Publicação concluída para ${escapeHtml(pub.dominio)}</div>
      ${pub.foraDoBr && !pub.foraDoBr.apontando ? `<div class="pick-empty">AVISE O ANALISTA: ${escapeHtml(pub.dominio)} não é .br e ainda não aponta para o servidor de produção (${escapeHtml(pub.foraDoBr.motivo)}). O cliente precisa apontar o A da raiz para 149.18.102.39; depois disso, ative o SSL de produção no painel.</div>` : ''}
      ${pub.dnsNosso === false && !pub.foraDoBr ? `<div class="pick-empty">O DNS é do cliente: peça a ele para apontar ${escapeHtml(pub.dominio)} para o servidor novo e, depois disso, ative o SSL de produção no painel.</div>` : ''}
      ${pub.sslPendente ? `<div class="pick-empty">Falta o SSL de ${escapeHtml(pub.dominio)}: ${escapeHtml(pub.sslPendente)}. Ative o SSL de produção no painel quando o domínio estiver apontando.</div>` : ''}
      <div class="card__actions"><button id="pubReiniciar" class="btn ghost full-width">Começar outro projeto</button></div></div>`;
  }
  wrap.innerHTML = html;

  const prox = document.getElementById('pubProximo');
  if (prox) prox.addEventListener('click', () => {
    if (atual.parada && pub.zona && !pub.confirmado) pub.confirmado = true;
    pubRodarTudo();
  });
  const rein = document.getElementById('pubReiniciar');
  if (rein) rein.addEventListener('click', () => { pub = pubNovo(); renderPublishTool(); });
  const parar = document.getElementById('pubParar');
  if (parar) parar.addEventListener('click', async () => { await pararAgora(); renderPubEtapas(); });
  const descartar = document.getElementById('pubDescartar');
  if (descartar) descartar.addEventListener('click', () => {
    log(`Publicação de ${pub.dominio || 'este projeto'} descartada. O que já tinha sido feito (DNS, painel, tags) não é desfeito.`, 'warn');
    pub = pubNovo();
    renderPublishTool();
  });
}

function pubAvancar(id, ok, detalhe, extra = {}) {
  pub.feitas[id] = { ok, detalhe: detalhe || '', ...extra };
  if (ok) {
    const i = PUB_ETAPAS.findIndex((e) => e.id === id);
    pub.etapa = PUB_ETAPAS[i + 1]?.id || null;
  }
  renderPubEtapas();
  renderPubDetalhe();
}

function pubPular(id) {
  const motivo = {
    contato: 'Conferência do contato pulada: vou tratar o DNS como nosso e seguir para a zona.',
    registro: 'Registro.br pulado: os nameservers não foram trocados por aqui. Troque à mão quando puder; o SSL só sai depois disso.',
    salesforce: 'Tarefa do Salesforce pulada: o site está publicado; feche a tarefa à mão ou pelos botões de teste.',
  }[id] || `${id} pulada.`;
  log(motivo, 'warn');
  if (id === 'contato') pub.dnsNosso = true;
  pubAvancar(id, true, 'pulada por você', { pulada: true });
}

function pubPrecisa() {
  pub.dominio = normalizeDomain(document.getElementById('pubDominio')?.value || pub.dominio);
  if (!pub.dominio) { log('Informe o domínio.', 'error'); return false; }
  return true;
}

function pubPrecisaPainel() {
  if (!normalizePainelUrl(pub.painelUrl)) {
    log(pub.painelUrl ? `O link do painel não é do ${PAINEL_MPI_HOST}.` : 'Sem o link do painel do projeto.', 'error');
    return false;
  }
  return true;
}

// Antes da primeira etapa (o DNS inclusive): o link do painel tem que ser o
// do contrato certo. O Hub procura pela razão social e confirma pelo
// temporário (ADR-098); não achando, pede o link no terminal. Link que chegou
// pronto (do Criar propriedades) é conferido pelo temporário, se houver.
// Sem link certo, não começa nada.
async function pubGarantirPainel() {
  pub.temporario = (document.getElementById('pubTemporario')?.value || pub.temporario || '').trim();
  pub.razao = (document.getElementById('pubRazao')?.value || pub.razao || '').trim();
  const temp = normalizarTemporario(pub.temporario);
  if (pub.temporario && !pareceTemporario(pub.temporario)) {
    log(`"${pub.temporario}" não é um link temporário (…${DOMINIO_TEMPORARIO}). Copie o link do alto da aba Publicação do painel.`, 'error');
    return false;
  }
  if (pub.painelUrl && pub.painelConferido === pub.painelUrl) return true;

  // O temporário do contrato que o link abre tem que ser o informado.
  const conferirLink = async (url) => {
    if (!temp) return '';
    const res = await withBusy('conferindo o contrato no painel', () =>
      window.api.publicarPainel({ url: normalizePainelUrl(url), etapa: 'estado', dominio: pub.dominio })
    );
    logTudo(res);
    if (!res.ok) return `não consegui ler o painel nesse link: ${res.error}`;
    const noPainel = normalizarTemporario(res.estado?.urlTemporaria);
    if (noPainel !== temp) return `esse link abre o contrato do temporário ${noPainel || '(nenhum)'}, e o informado é ${temp}: é outro contrato`;
    log(`O link do painel é o do contrato do temporário ${temp}.`, 'info');
    return '';
  };

  if (normalizePainelUrl(pub.painelUrl)) {
    const problema = await conferirLink(pub.painelUrl);
    if (!problema) { pub.painelConferido = pub.painelUrl; return true; }
    log(`O link do painel que veio junto: ${problema}.`, 'warn');
    pub.painelUrl = '';
  }

  // Sem razão social mas com o link da tarefa: a tarefa está pendurada no caso,
  // e o caso tem a conta — pega de lá em vez de parar (ADR-123). Guarda também
  // a empresa do caso/fila para a planilha não precisar perguntar.
  if (!pub.razao && pub.sfTarefa) {
    const ctx = await withBusy('lendo a conta pela tarefa no Salesforce', () => window.api.salesforceContexto({ tarefa: pub.sfTarefa })).catch((e) => ({ ok: false, error: e.message }));
    logTudo(ctx);
    if (ctx?.ok && ctx.razao) {
      pub.razao = ctx.razao;
      const inp = document.getElementById('pubRazao'); if (inp) inp.value = ctx.razao;
      log(`Razão social pela tarefa → caso: ${ctx.razao}.`, 'success');
    }
    if (ctx?.ok && ctx.empresa) pub.empresaDoCaso = ctx.empresa;
  }

  let motivo = '';
  if (!pub.razao) {
    motivo = 'sem razão social para procurar';
  } else {
    if (!temp) log('Sem link temporário: só uso o que achar se o cliente tiver um contrato só no painel.', 'warn');
    const res = await withBusy(`procurando ${pub.razao} no painel`, () =>
      window.api.acharContratoNoPainel({ razao: pub.razao, temporario: temp, dominio: pub.dominio })
    );
    logTudo(res);
    if (res.ok) {
      pub.painelUrl = res.url;
      pub.painelConferido = res.url;
      pub.painelAchado = true;
      log(`Link do painel: ${res.url}`, 'success');
      return true;
    }
    motivo = res.error || 'não achei o contrato';
  }

  // Não achou: pede o link, confere e segue por ele.
  let pergunta = `Não achei o contrato de ${pub.dominio} no painel (${motivo}). Cole o link do painel do projeto:`;
  while (true) {
    const link = await perguntarTextoNoTerminal(pergunta, {
      placeholder: `https://${PAINEL_MPI_HOST}/clientes/.../hub?projeto=...`,
      rotuloOk: 'Usar este link',
      validar: (t) => (!t ? 'Cole o link.' : normalizePainelUrl(t) ? '' : `Esse link não é do ${PAINEL_MPI_HOST}.`),
    });
    if (link === null) {
      log('Sem o link do painel, não comecei nada. Clique em Publicar de novo quando tiver o link.', 'warn');
      return false;
    }
    const problema = await conferirLink(link);
    if (!problema) {
      pub.painelUrl = normalizePainelUrl(link);
      pub.painelConferido = pub.painelUrl;
      pub.painelAchado = false;
      log(`Vou pelo link colado: ${pub.painelUrl}`, 'success');
      return true;
    }
    pergunta = `Esse link não serve: ${problema}. Cole outro link do painel:`;
  }
}

// O encadeamento: roda as etapas em sequência a partir de onde a publicação
// está, para na parada do DNS até o clique, e para na falha. Falha em etapa
// pulável vira pergunta no terminal (tentar de novo ou pular); nas outras, o
// botão vira "Tentar de novo" (ADR-072).
async function pubRodarTudo() {
  if (pub.rodando || pub.emAndamento) return;
  if (!pubPrecisa()) return;
  if (!state.googleSaPath) { log('Configure o caminho da service account do Google antes: as tags precisam dela.', 'error'); return; }

  pub.emAndamento = true;
  renderPubEtapas();
  try {
    // O painel entra na etapa 5, mas o contrato errado não pode nem começar.
    if (!(await pubGarantirPainel())) return;
    while (pub.etapa) {
      if (paradaAgora) return;
      const etapa = PUB_ETAPAS.find((e) => e.id === pub.etapa);
      if (etapa.parada && pub.zona && !pub.confirmado) {
        log(`Zona de ${pub.dominio} pronta para revisão. Confira o antes e o depois ao lado e clique em "Confirmar e aplicar o DNS na Cloudflare".`, 'warn');
        return;
      }
      const antes = pub.etapa;
      await pubRodarEtapa(antes);
      if (pub.etapa !== antes) continue;

      // Não avançou: falhou (feitas[antes].ok === false) ou parou de propósito.
      const falha = pub.feitas[antes];
      if (!falha || falha.ok || paradaAgora) return;
      if (PUB_PULAVEIS.includes(antes)) {
        const r = await perguntarNoTerminal(
          `${etapa.nome} falhou: ${falha.detalhe}. O que faço?`,
          [{ valor: 'tentar', rotulo: 'Tentar de novo' }, { valor: 'pular', rotulo: 'Pular esta etapa' }]
        );
        if (r === 'pular') { pubPular(antes); continue; }
        delete pub.feitas[antes];
        continue;
      }
      if (antes === 'cloudflare') {
        // A zona pode ter mudado entre a revisão e a falha: levanta de novo e
        // pede a confirmação outra vez.
        pub.confirmado = false;
        pub.etapa = 'dns';
        delete pub.feitas.dns;
      }
      return;
    }
    if (pub.sslAdiado) {
      // Não prende a tela por horas (ADR-103): anota o que falta, põe na lista
      // de espera e libera para publicar outro site.
      pubMandarParaEspera();
      return;
    }
    if (pub.etapa || paradaAgora) return; // a tarefa adiada falhou, ou parou: o botão está na tela
    if (pub.scPendente) log(`${pub.dominio}: o Search Console e o relatório do painel ficaram sem fazer porque o SSL de produção não foi ativado. Ative o SSL e use "Sincronizar no painel".`, 'warn');
    log(`Publicação de ${pub.dominio} concluída.`, 'success');
  } catch (e) {
    if (!ehParada(e)) throw e;
  } finally {
    const parou = paradaAgora;
    pub.emAndamento = false;
    await pararTerminou();
    if (parou) log(`Publicação de ${pub.dominio} parada. O que já foi feito continua feito; "Continuar" retoma da etapa em que parou, ou descarte e comece de novo.`, 'warn');
    renderPubEtapas();
    renderPubDetalhe();
  }
}

// ----- Sites esperando a propagação (ADR-103) -----
//
// Quando o Registro.br publica a troca de DNS só daqui a horas, o site sai da
// tela e entra nesta lista com o que falta: o SSL, o Search Console e o
// relatório (se ficaram para depois dele) e a tarefa do Salesforce. A tela fica
// livre para outro site. O vigia confere o DNS de todos a cada minuto e, quando
// um aponta, termina esse site; com vários prontos, um de cada vez, primeiro o
// que o Registro.br previa para mais cedo. A lista sobrevive a fechar o app
// (só campos sem segredo: a chave secreta do reCAPTCHA não vai para o disco).
const ESPERAS_CHAVE = 'hub.esperasPropagacao.v1';
const ESPERA_FOLGA_MS = 30 * 60 * 1000;   // depois da previsão do Registro.br
const ESPERA_PASSO_MS = 60 * 1000;
let esperas = [];
let vigiaRodando = false;
let vigiaTimer = null;

// O que o Search Console e o relatório precisam, sem segredo nenhum.
function vSemSegredos(v) {
  if (!v) return null;
  const campos = ['domain', 'siteUrl', 'idAnalytics', 'analyticsAccountId', 'analyticsPropertyId', 'googleSearchConsole', 'searchConsolePainel', 'tagmanager', 'idProjetoBusca'];
  const out = {};
  for (const c of campos) if (v[c] !== undefined) out[c] = v[c];
  return out;
}

function salvarEsperas() {
  try { localStorage.setItem(ESPERAS_CHAVE, JSON.stringify(esperas)); } catch (e) {}
}

function carregarEsperas() {
  try {
    const lidas = JSON.parse(localStorage.getItem(ESPERAS_CHAVE) || '[]');
    esperas = Array.isArray(lidas) ? lidas : [];
  } catch (e) {
    esperas = [];
  }
  // Quem estava no meio quando o app fechou volta a esperar.
  for (const e of esperas) if (e.status === 'rodando') e.status = 'esperando';
  if (esperas.some((e) => e.status === 'esperando')) {
    log(`${esperas.filter((e) => e.status === 'esperando').length} site(s) esperando a propagação: ${esperas.filter((e) => e.status === 'esperando').map((e) => e.dominio).join(', ')}. Continuo conferindo.`, 'info');
    vigiarEsperas();
  }
}

function pubMandarParaEspera() {
  const falta = ['o SSL de produção'];
  if (pub.scPendente) falta.push('o Search Console e o relatório do painel');
  if (pub.sfTarefa) falta.push('fechar a tarefa do Salesforce');
  const e = {
    id: `${pub.dominio}-${Date.now()}`,
    dominio: pub.dominio,
    painelUrl: pub.painelUrl,
    sfTarefa: pub.sfTarefa || '',
    ate: pub.sslAdiado.ate,
    scPendente: !!pub.scPendente,
    sslFeito: false,
    v: vSemSegredos(pub.v),
    falta,
    status: 'esperando',
    detalhe: '',
    desde: Date.now(),
  };
  esperas = esperas.filter((x) => x.dominio !== e.dominio);
  esperas.push(e);
  salvarEsperas();
  const hora = new Date(e.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  log(`${e.dominio} foi para a lista de espera: o Registro.br publica a troca de DNS por volta de ${hora}. Falta ${falta.join(', ')}; faço sozinho quando o DNS apontar. Pode publicar outro site.`, 'success');
  const empresa = pub.empresa;
  pub = { ...pubNovo(), empresa };
  if (state.view === 'publish' || document.getElementById('pubEtapas')) renderPublishTool();
  vigiarEsperas();
}

function renderEsperas() {
  const wrap = document.getElementById('pubEsperas');
  if (!wrap) return;
  if (!esperas.length) { wrap.innerHTML = ''; return; }
  const badge = { esperando: ['neutral', 'esperando'], rodando: ['neutral', 'terminando'], concluido: ['ok', 'concluído'], falhou: ['err', 'falta algo'] };
  let html = `<div class="section-label">Aguardando a propagação (${esperas.filter((e) => e.status !== 'concluido').length})</div><div class="rows">`;
  for (const e of [...esperas].sort((a, b) => a.ate - b.ate)) {
    const [cls, texto] = badge[e.status] || badge.esperando;
    const hora = new Date(e.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const sub = e.status === 'concluido' ? (e.detalhe || 'tudo feito') : `${e.status === 'esperando' ? `previsto ~${hora} · ` : ''}falta ${e.falta.join(', ')}${e.detalhe ? ` · ${e.detalhe}` : ''}`;
    html += `<div class="row ${e.status === 'concluido' ? 'is-ok' : e.status === 'falhou' ? 'is-err' : e.status === 'rodando' ? 'is-running' : ''}">
      <div class="row__main"><div class="row__title">${escapeHtml(e.dominio)}</div><div class="row__sub">${escapeHtml(sub)}</div></div>
      <span class="badge ${cls}">${texto}</span>
      ${e.status === 'falhou' ? `<button class="btn ghost compact" data-espera-tentar="${escapeHtml(e.id)}">Tentar de novo</button>` : ''}
      ${e.status !== 'rodando' ? `<button class="btn ghost compact" data-espera-remover="${escapeHtml(e.id)}">${e.status === 'concluido' ? 'Tirar da lista' : 'Remover'}</button>` : ''}
    </div>`;
  }
  html += '</div>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-espera-tentar]').forEach((b) => b.addEventListener('click', () => {
    const e = esperas.find((x) => x.id === b.dataset.esperaTentar);
    if (!e) return;
    e.status = 'esperando';
    e.detalhe = 'tentando de novo';
    // Nova chance: a folga recomeça a contar agora.
    e.ate = Math.max(e.ate, Date.now());
    salvarEsperas();
    renderEsperas();
    vigiarEsperas({ agora: true });
  }));
  wrap.querySelectorAll('[data-espera-remover]').forEach((b) => b.addEventListener('click', () => {
    const e = esperas.find((x) => x.id === b.dataset.esperaRemover);
    if (!e) return;
    if (e.status !== 'concluido') log(`${e.dominio} saiu da lista de espera sem terminar: falta ${e.falta.join(', ')}. Faça à mão.`, 'warn');
    esperas = esperas.filter((x) => x.id !== e.id);
    salvarEsperas();
    renderEsperas();
  }));
}

// O vigia: um só, confere todos, termina um de cada vez (o de previsão mais
// cedo primeiro). Não atrapalha o Publicar em massa: enquanto ele roda, espera.
// Dorme no máximo isto de uma vez, mesmo com a previsão mais longe: dá para
// reavaliar a lista e mostrar que está vivo (ADR-124).
const ESPERA_DORMIR_MAX_MS = 30 * 60 * 1000;

async function vigiarEsperas({ agora = false } = {}) {
  if (vigiaRodando) { if (agora) { clearTimeout(vigiaTimer); vigiaTimer = null; vigiaAcordar?.(); } return; }
  vigiaRodando = true;
  try {
    while (esperas.some((e) => e.status === 'esperando')) {
      const t = Date.now();
      if (!bulkRodando) {
        // Só confere quem JÁ passou da previsão do Registro.br (e.ate). Quem
        // ainda está na janela das ~2h espera sem gastar DNS a cada minuto:
        // conferir antes não adianta nada e deixa a máquina lenta (ADR-124).
        const fila = esperas.filter((e) => e.status === 'esperando' && !(e.ate > t)).sort((a, b) => a.ate - b.ate);
        for (const e of fila) {
          if (bulkRodando) break;
          // Um erro numa espera não pode matar o vigia das outras (ADR-104).
          try {
            await vigiarUma(e);
          } catch (err) {
            e.detalhe = `erro ao conferir (${err && err.message}); tento de novo no próximo minuto`;
            log(`Aguardando ${e.dominio}: ${e.detalhe}`, 'warn');
          }
        }
        // Quem ainda espera a previsão: avisa uma vez quando é a primeira conferência.
        for (const e of esperas.filter((x) => x.status === 'esperando' && x.ate > t)) {
          if (!e.avisouAdiado) {
            e.avisouAdiado = true;
            e.detalhe = `aguardando a previsão do Registro.br (${new Date(e.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})`;
            log(`Aguardando ${e.dominio}: o Registro.br publica a troca por volta de ${new Date(e.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Não confiro antes disso; a primeira conferência é nessa hora.`, 'info');
          }
        }
        salvarEsperas();
        renderEsperas();
      }
      if (!esperas.some((e) => e.status === 'esperando')) break;
      // Quanto dormir: 1 min se alguma já passou da previsão (está sendo
      // conferida); senão, até a previsão mais próxima (no máximo 30 min).
      const agora2 = Date.now();
      const esperando = esperas.filter((e) => e.status === 'esperando');
      const algumaVencida = esperando.some((e) => !(e.ate > agora2));
      let dormir = ESPERA_PASSO_MS;
      if (!algumaVencida) {
        const proxima = Math.min(...esperando.map((e) => e.ate));
        dormir = Math.max(ESPERA_PASSO_MS, Math.min(proxima - agora2, ESPERA_DORMIR_MAX_MS));
      }
      await new Promise((r) => { vigiaAcordar = r; vigiaTimer = setTimeout(r, dormir); });
      vigiaAcordar = null;
    }
  } finally {
    vigiaRodando = false;
  }
}
let vigiaAcordar = null;

async function vigiarUma(e) {
  const ap = await conferirApontamentoDeProducao(e.dominio);
  // Aviso na primeira conferência, quando o motivo muda, e a cada 10 min, para
  // dar para ver que o vigia está vivo sem encher o terminal (ADR-104).
  const agora = Date.now();
  const mudou = e.ultimoMotivo !== ap.motivo;
  if (!ap.pronto && (mudou || !e.ultimoAviso || agora - e.ultimoAviso > 10 * 60 * 1000)) {
    log(`Aguardando ${e.dominio}: ${ap.motivo}. Confiro de novo em 1 min.`, 'info');
    e.ultimoAviso = agora;
  }
  e.ultimoMotivo = ap.motivo;
  if (!ap.pronto) {
    if (agora > e.ate + ESPERA_FOLGA_MS) {
      e.status = 'falhou';
      e.detalhe = `não apontou até 30 min depois da previsão (${ap.motivo})`;
      log(`${e.dominio}: ${e.detalhe}. Confira o DNS e use "Tentar de novo" na lista de espera.`, 'warn');
    } else {
      e.detalhe = ap.motivo;
    }
    return;
  }
  e.status = 'rodando';
  e.detalhe = `aponta para ${ap.ip}`;
  renderEsperas();
  log(`${e.dominio} aponta para ${ap.ip}: terminando o que faltava.`, 'cmd');
  const r = await terminarEspera(e, {
    ativarSsl: () => window.api.publicarPainel({ url: normalizePainelUrl(e.painelUrl), etapa: 'ssl', dominio: e.dominio }),
    verificarSc: () => verificarScERelatorio(e.v, null, { painelUrl: normalizePainelUrl(e.painelUrl), brand: 'mpiplus' }),
    fecharTarefa: () => window.api.salesforceFecharTarefa({ link: e.sfTarefa, assumir: true, concluir: true, comentar: true, texto: 'Site publicado' }),
  });
  if (r.ok) log(`${e.dominio}: ${r.detalhe}.`, 'success');
  else log(`${e.dominio}: ${r.detalhe}. Use "Tentar de novo" na lista de espera quando quiser.`, 'warn');
}

// O que falta, na ordem, com a regra de sempre: a tarefa só fecha com tudo
// concluído (ADR-101). Recebe as ações para dar para testar sem o app.
async function terminarEspera(e, acoes) {
  const feitos = [];
  if (!e.sslFeito) {
    const ssl = await acoes.ativarSsl();
    if (ssl?.log) for (const x of ssl.log) log(x.message, x.type);
    if (!ssl || !ssl.ok) {
      e.status = 'falhou';
      e.detalhe = `o SSL não ficou ativo: ${ssl?.error || 'sem resposta'}`;
      return { ok: false, detalhe: e.detalhe };
    }
    e.sslFeito = true;
    e.falta = e.falta.filter((f) => f !== 'o SSL de produção');
    feitos.push('SSL ativo');
  }
  if (e.scPendente) {
    const sc = e.v ? await acoes.verificarSc() : { ok: false, error: 'sem os dados das propriedades' };
    if (!sc || !sc.ok) {
      e.status = 'falhou';
      e.detalhe = `${feitos.length ? feitos.join(', ') + '; ' : ''}o Search Console não verificou: ${sc?.error || 'veja o log'}`;
      return { ok: false, detalhe: e.detalhe };
    }
    e.scPendente = false;
    e.falta = e.falta.filter((f) => f !== 'o Search Console e o relatório do painel');
    feitos.push('Search Console e relatório');
  }
  if (e.sfTarefa && e.falta.includes('fechar a tarefa do Salesforce')) {
    const t = await acoes.fecharTarefa();
    if (t?.log) for (const x of t.log) log(x.message, x.type);
    if (!t || !t.ok) {
      e.status = 'falhou';
      e.detalhe = `${feitos.length ? feitos.join(', ') + '; ' : ''}a tarefa não fechou: ${t?.precisaReconectar ? 'o Salesforce recusou o acesso (403), reconecte' : t?.error || 'sem resposta'}`;
      return { ok: false, detalhe: e.detalhe };
    }
    e.falta = e.falta.filter((f) => f !== 'fechar a tarefa do Salesforce');
    feitos.push(t.comentado && typeof t.comentado === 'object' ? `tarefa fechada, comentário marcando ${t.comentado.pessoa}` : 'tarefa fechada (sem comentário)');
  }
  e.status = 'concluido';
  e.detalhe = feitos.length ? feitos.join(', ') : 'nada faltava';
  return { ok: true, detalhe: `concluído: ${e.detalhe}` };
}

// A espera adiada: até o fim da transição (mais 30 min de folga), conferindo
// a raiz a cada minuto. Quando aponta, pede o SSL. Se estourar, marca o SSL
// como pendente e diz quando voltar.
async function pubEsperarSslAdiado() {
  const ate = pub.sslAdiado.ate;
  const limite = ate + 30 * 60 * 1000;
  const ipNovo = pub.zona?.ipNovo;
  log(`Tags e planilha prontas. Agora espero o DNS de ${pub.dominio} apontar para ${ipNovo || 'o servidor novo'} (previsto em ~${Math.max(1, Math.ceil((ate - Date.now()) / 60000))} min; confiro a cada minuto).`, 'cmd');
  // Volta a etapa para a lista, como "rodando": o cartão de concluída só
  // aparece quando o SSL for resolvido, num sentido ou no outro.
  delete pub.feitas.propagacao;
  delete pub.feitas.ssl;
  pub.etapa = 'propagacao';
  renderPubEtapas();
  let ultimoAviso = 0;
  while (Date.now() < limite) {
    if (!pub || !pub.sslAdiado) return;
    const c = await pubConferirApontamento();
    if (c.pronto) {
      pub.propagado = true;
      pub.apontando = true;
      pub.feitas.propagacao = { ok: true, detalhe: `${pub.dominio} → ${c.ips.join(', ')}` };
      delete pub.feitas.ssl;
      pub.etapa = 'ssl';
      renderPubEtapas();
      await pubRodarEtapa('ssl');
      pub.sslAdiado = null;
      pub.etapa = null;
      renderPubEtapas();
      await pubFecharTarefaAdiada();
      return;
    }
    if (Date.now() - ultimoAviso > 10 * 60 * 1000) {
      ultimoAviso = Date.now();
      const falta = Math.ceil((ate - Date.now()) / 60000);
      log(`Ainda não aponta (A ${c.ips.join(', ') || 'sem resposta'}). ${falta > 0 ? `O Registro.br previa publicar em ~${falta} min.` : 'O prazo do Registro.br passou; sigo conferindo por mais um pouco.'}`, 'info');
    }
    await esperarOuParar(60000);
  }
  pub.sslPendente = 'o DNS não apontou para o servidor novo nem 30 min depois do prazo do Registro.br';
  pub.feitas.propagacao = { ok: true, pulada: true, detalhe: 'não propagou no prazo' };
  pub.feitas.ssl = { ok: true, pulada: true, detalhe: 'pendente: ative no painel quando o DNS apontar' };
  pub.sslAdiado = null;
  pub.etapa = null;
  log(`${pub.dominio} não apontou no prazo. Ative o SSL de produção no painel quando apontar.`, 'warn');
  renderPubEtapas();
  await pubFecharTarefaAdiada();
}

// A tarefa que esperou o SSL adiado: roda a etapa agora. Com algo pendente,
// ela falha dizendo o quê, e o botão vira "Tentar de novo" (ADR-101).
async function pubFecharTarefaAdiada() {
  if (!pub || !pub.sfAdiado) return;
  pub.sfAdiado = false;
  delete pub.feitas.salesforce;
  pub.etapa = 'salesforce';
  renderPubEtapas();
  await pubRodarEtapa('salesforce');
}

// A conferência que a propagação e a espera adiada usam: NS (informativo) e
// o A da raiz contra o IP novo.
async function pubConferirApontamento() {
  const ns = pub.cloudflare?.nameservers || [];
  const ipNovo = pub.zona?.ipNovo;
  const conf = ns.length ? await window.api.conferirNs({ dominio: pub.dominio, esperados: ns }).catch(() => ({ propagado: false })) : { ok: true, propagado: true };
  const dns = await window.api.checkDnsBatch({ domains: [pub.dominio] });
  const r = dns.ok ? dns.resultados[0] : null;
  const ips = r?.ips || [];
  const aponta = ipNovo ? ips.includes(ipNovo) : ips.length > 0;
  return { pronto: aponta, nsOk: !!conf.propagado, ips, nsAtuais: conf.atuais || [] };
}

async function pubRodarEtapa(id) {
  if (pub.rodando) return;
  if (!pubPrecisa()) return;
  pub.rodando = true;
  // Enquanto a etapa roda, a janela não desacelera em segundo plano (ADR-126).
  window.api.manterAcordado(true, 'publicacao').catch(() => {});
  renderPubEtapas();
  try {
    if (id === 'planilha') await pubEtapaPlanilha();
    else if (id === 'contato') await pubEtapaContato();
    else if (id === 'dns') await pubEtapaDns();
    else if (id === 'cloudflare') await pubEtapaCloudflare();
    else if (id === 'registro') await pubEtapaRegistro();
    else if (id === 'aprovar') await pubEtapaPainel('aprovar');
    else if (id === 'publicar') await pubEtapaPublicar();
    else if (id === 'propagacao') await pubEtapaPropagacao();
    else if (id === 'ssl') await pubEtapaPainel('ssl');
    else if (id === 'tags') await pubEtapaTags();
    else if (id === 'salesforce') await pubEtapaSalesforce();
  } catch (e) {
    const parado = ehParada(e) || paradaAgora;
    log(`${PUB_ETAPAS.find((x) => x.id === id)?.nome}: ${parado ? 'parado por você' : e.message}`, parado ? 'warn' : 'error');
    pubAvancar(id, false, parado ? 'parado por você' : e.message);
  } finally {
    pub.rodando = false;
    window.api.manterAcordado(false, 'publicacao').catch(() => {});
    renderPubEtapas();
  }
}

const logTudo = (res) => { if (res?.log) for (const entry of res.log) log(entry.message, entry.type); };

// Consulta o domínio nas contas do Registro.br. Descobrir: as duas juntas, são
// janelas e sessões separadas, e em série era o dobro do tempo (ADR-072).
// Devolve { empresa, res } por conta consultada, na ordem bc, mpisolutions.
async function consultarRegistrobr(dominio, candidatas) {
  const nomeDe = (id) => PUB_EMPRESAS.find((e) => e.id === id)?.nome || brandName(id);
  const respostas = await withBusy(`consultando o Registro.br (${candidatas.map(nomeDe).join(' e ')})`, () =>
    Promise.all(candidatas.map((empresa) => window.api.registrobrConsultar({ empresa, dominio }).then((res) => ({ empresa, res }))))
  );
  for (const r of respostas) logTudo(r.res);
  return respostas;
}

// Só domínio .br tem contato técnico no Registro.br. Um .com (ou qualquer
// outro) está num registrador que o Hub não alcança: o cliente costuma ter
// feito o apontamento antes, e quando não fez, quem pede é o analista
// (ADR-079).
const dominioBr = (d) => /\.br$/i.test(String(d || ''));

// Fora do .br: nada de Registro.br nem Cloudflare. Confere se a raiz já
// aponta para o servidor de produção e devolve o que dizer.
async function conferirForaDoBr(dominio) {
  const ap = await withBusy(`conferindo o apontamento de ${dominio}`, () => conferirApontamentoDeProducao(dominio));
  return { apontando: !!ap.pronto, ip: ap.ip, motivo: ap.motivo || '' };
}

async function pubEtapaContato() {
  if (!dominioBr(pub.dominio)) {
    const c = await conferirForaDoBr(pub.dominio);
    pub.dnsNosso = false;
    pub.foraDoBr = { apontando: c.apontando, motivo: c.motivo };
    for (const id of ['dns', 'cloudflare', 'registro', 'propagacao']) {
      pub.feitas[id] = { ok: true, pulada: true, detalhe: 'domínio fora do .br: o DNS fica com o cliente' };
    }
    if (c.apontando) {
      log(`${pub.dominio} não é .br e já aponta para ${c.ip}. Pulo Registro.br e Cloudflare; sigo para aprovar, publicar, SSL, tags e planilha.`, 'info');
      pub.feitas.contato = { ok: true, detalhe: `fora do .br, já aponta para ${c.ip}` };
    } else {
      log(`ATENÇÃO: ${pub.dominio} não é .br e ainda NÃO aponta para o servidor de produção (${c.motivo}). Avise o analista para pedir o apontamento ao cliente. Sigo com aprovar, publicar e tags; o SSL só sai depois do apontamento.`, 'warn');
      pub.feitas.contato = { ok: true, detalhe: `fora do .br, ainda não aponta: ${c.motivo}` };
    }
    if (pub.empresa === 'auto') log('Sem Registro.br não dá para saber a empresa; na hora da planilha eu pergunto aqui no terminal.', 'warn');
    pub.etapa = 'aprovar';
    renderPubEtapas();
    renderPubDetalhe();
    return;
  }

  // Descobrir: pergunta às duas contas, juntas. Escolhida à mão: só àquela.
  const candidatas = pub.empresa === 'auto' ? ['bc', 'mpisolutions'] : [pub.empresa];
  const nomeDe = (id) => PUB_EMPRESAS.find((e) => e.id === id)?.nome || id;
  const respostas = await consultarRegistrobr(pub.dominio, candidatas);
  const nossa = respostas.find((r) => r.res.ok && r.res.nosso);
  if (nossa) {
    pub.empresa = nossa.empresa;
    pub.dnsNosso = true;
    const sel = document.getElementById('pubEmpresa');
    if (sel) sel.value = nossa.empresa;
    log(`${pub.dominio} é da ${nomeDe(nossa.empresa)}: contato técnico ${nossa.res.handle}. Vai para a aba ${PLANILHA_ABA_POR_EMPRESA[nossa.empresa]} da planilha.`, 'success');
    pubAvancar('contato', true, `contato técnico ${nossa.res.handle}, ${nomeDe(nossa.empresa)}; DNS por nossa conta`);
    return;
  }
  // Uma consulta que falhou já basta para não concluir nada: "não está na
  // conta A" mais "não consegui ver a conta B" não é "é do cliente" (ADR-074).
  // Consulta que falhou não para a publicação (ADR-083): o painel não depende
  // do Registro.br. O DNS fica sem mexer, com o motivo escrito, e a empresa é
  // perguntada na hora da planilha.
  const falhas = respostas.filter((r) => !r.res.ok);
  if (falhas.length) {
    const motivo = falhas.map((f) => `${nomeDe(f.empresa)}: ${f.res.error}`).join(' | ');
    pub.dnsNosso = null;
    log(`Não consegui consultar o Registro.br (${motivo}). Não mexo no DNS: sigo para aprovar, publicar e tags. Se o DNS for nosso, rode o Publicar MPI+ de novo depois para a parte da Cloudflare.`, 'warn');
    if (pub.empresa === 'auto') log('Sem resposta do Registro.br não dá para saber a empresa; na hora da planilha eu pergunto aqui no terminal.', 'warn');
    pub.feitas.contato = { ok: true, pulada: true, detalhe: `Registro.br não respondeu: ${motivo}` };
    for (const id of PUB_ETAPAS_DNS) pub.feitas[id] = { ok: true, pulada: true, detalhe: 'Registro.br não respondeu; DNS não tocado' };
    pub.etapa = 'aprovar';
    renderPubEtapas();
    renderPubDetalhe();
    return;
  }
  // DNS do cliente: as etapas de DNS saem do caminho, com o motivo escrito em
  // cada uma. Aprovar, publicar e tags seguem normalmente.
  pub.dnsNosso = false;
  const vistas = respostas.filter((r) => r.res.ok);
  const motivo = vistas.some((r) => r.res.naConta)
    ? vistas.filter((r) => r.res.naConta).map((r) => `na conta ${nomeDe(r.empresa)} o contato técnico é ${r.res.tec || '(vazio)'}, não ${r.res.handle}`).join('; ')
    : `domínio não está em nenhuma das contas consultadas (${vistas.map((r) => nomeDe(r.empresa)).join(', ')})`;
  if (pub.empresa === 'auto') {
    log('Não deu para saber se o projeto é Busca Cliente ou MPI Solutions. Na hora da planilha eu pergunto aqui no terminal.', 'warn');
  }
  pub.feitas.contato = { ok: true, detalhe: `DNS do cliente: ${motivo}` };
  for (const id of PUB_ETAPAS_DNS) pub.feitas[id] = { ok: true, pulada: true, detalhe: 'DNS do cliente, etapa não se aplica' };
  pub.etapa = 'aprovar';
  log(`O DNS de ${pub.dominio} é do cliente. Vou aprovar, publicar em produção e fazer as tags; o apontamento e o SSL ficam com quem cuida do DNS.`, 'warn');
  renderPubEtapas();
  renderPubDetalhe();
}

// A zona nasce na Cloudflare e é ela quem varre o DNS atual; a fotografia dos
// autoritativos completa o que o scan não vê (DKIM, DMARC, SRV, os hosts do
// campo). A regra de preservação roda em cima da união (ADR-071). Nada é
// alterado aqui além do que o scan gravou: aplicar é a etapa seguinte.
async function pubEtapaDns() {
  if (!PLANILHA_ABA_POR_EMPRESA[pub.empresa]) throw new Error('escolha a empresa (Busca Cliente ou MPI Solutions) no seletor: é a conta da Cloudflare que vai receber a zona');
  const hosts = String(pub.hostsExtras || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  const res = await withBusy('montando a zona na Cloudflare', () => window.api.montarZonaCloudflare({ empresa: pub.empresa, dominio: pub.dominio, hostsExtras: hosts }));
  logTudo(res);
  if (!res.ok) throw new Error(res.error);
  pub.foto = res.foto;
  pub.existentes = res.existentes || [];
  pub.zona = res.zona;
  pub.plano = res.plano;
  pub.cloudflare = { zoneId: res.zoneId, nameservers: res.nameservers || [], status: res.status, criada: !!res.criada };
  pub.confirmado = false;
  const p = res.plano || { atualizar: [], criar: [], remover: [], manter: [] };
  pubAvancar(
    'dns', true,
    `zona ${res.criada ? 'criada' : 'reaproveitada'}${res.escaneados ? `, scan trouxe ${res.escaneados}` : ''}; ${res.zona.registros.length} registro(s) na zona final, ` +
      `muda ${p.atualizar.length}, cria ${p.criar.length}, remove ${p.remover.length}, mantém ${p.manter.length}; IP antigo ${res.zona.ipAntigo || '?'}`
  );
}

async function pubEtapaCloudflare() {
  if (!pub.zona || !pub.plano) throw new Error('Monte a zona antes.');
  if (!PLANILHA_ABA_POR_EMPRESA[pub.empresa]) throw new Error('escolha a empresa (Busca Cliente ou MPI Solutions) no seletor: é a conta da Cloudflare que vai receber a zona');
  const p = pub.plano;
  const nada = !p.atualizar.length && !p.criar.length && !p.remover.length;
  if (nada) {
    log(`A zona de ${pub.dominio} na Cloudflare já está exatamente como a proposta. Nada a aplicar.`, 'info');
    pubAvancar('cloudflare', true, `nada a mudar, NS ${pub.cloudflare?.nameservers?.join(' e ') || '?'}`);
    return;
  }
  const res = await withBusy('aplicando na Cloudflare', () => window.api.aplicarCloudflare({ empresa: pub.empresa, dominio: pub.dominio, registros: pub.zona.registros, remover: pub.zona.remover || [] }));
  logTudo(res);
  if (!res.ok) throw new Error(res.error);
  pub.cloudflare = { ...(pub.cloudflare || {}), zoneId: res.zoneId, nameservers: res.nameservers || [], status: res.status };
  if (res.faltando) throw new Error(`${res.faltando} registro(s) não ficaram como a proposta; veja o terminal`);
  pubAvancar('cloudflare', true, `${p.atualizar.length} alterado(s), ${p.criar.length} criado(s), ${p.remover.length} removido(s); NS ${pub.cloudflare.nameservers.join(' e ') || '?'}`);
}

async function pubEtapaRegistro() {
  if (!PLANILHA_ABA_POR_EMPRESA[pub.empresa]) throw new Error('escolha a empresa no seletor: é a conta do Registro.br que vai receber os nameservers');
  const ns = pub.cloudflare?.nameservers || [];
  if (ns.length < 2) throw new Error('Sem os nameservers da Cloudflare. Aplique a zona antes (ou pule, se já estiver feito).');
  const res = await withBusy('trocando os nameservers no Registro.br', () =>
    window.api.registrobrTrocarNs ? window.api.registrobrTrocarNs({ empresa: pub.empresa, dominio: pub.dominio, nameservers: ns }) : Promise.resolve({ ok: false, manual: true })
  );
  if (res && res.ok) {
    logTudo(res);
    if (res.emTransicao) {
      // Saiu do DNS do Registro.br: a troca publica em até 2h. A propagação
      // vai saber esperar até lá, e o SSL vem depois (ADR-080).
      pub.transicaoAte = Date.now() + (Number(res.transicaoSegundos) || 7200) * 1000;
      pubAvancar('registro', true, `ns1 ${ns[0]}, ns2 ${ns[1]}; em transição no Registro.br, publica em ~${res.transicaoTempo || '2h'}`);
      return;
    }
    pubAvancar('registro', true, `ns1 ${ns[0]}, ns2 ${ns[1]}`);
    return;
  }
  if (res && !res.manual) logTudo(res);
  // Ainda sem automação do Registro.br: o passo fica manual, com o que colar.
  await window.api.copyToClipboard(ns.join('\n'));
  log(`Registro.br: entre na conta de ${PUB_EMPRESAS.find((e) => e.id === pub.empresa)?.nome}, abra ${pub.dominio} e troque os servidores DNS para:`, 'warn');
  log(`  ns1: ${ns[0]}`, 'info');
  log(`  ns2: ${ns[1]}`, 'info');
  log('Os dois já estão na sua área de transferência.', 'warn');
  const conf = await window.api.conferirNs({ dominio: pub.dominio, esperados: ns });
  if (conf.ok && conf.propagado) {
    pub.propagado = true;
    pubAvancar('registro', true, `nameservers já apontam para a Cloudflare`);
    return;
  }
  throw new Error(`os nameservers de ${pub.dominio} ainda são ${(conf.atuais || []).join(', ') || 'nenhum'}. Troque no Registro.br e tente de novo, ou pule e troque depois`);
}

// Espera longa conhecida (transição do Registro.br, até 2h): propagação e SSL
// são adiados para depois de tags e planilha, que não dependem do DNS, e a
// espera acontece no fim, conferindo a cada minuto (ADR-080).
const ADIAR_A_PARTIR_DE_MS = 5 * 60 * 1000;

async function pubEtapaPropagacao() {
  const ns = pub.cloudflare?.nameservers || [];
  const ipNovo = pub.zona?.ipNovo;
  if (pub.transicaoAte && pub.transicaoAte - Date.now() > ADIAR_A_PARTIR_DE_MS && !pub.sslAdiado) {
    const min = Math.ceil((pub.transicaoAte - Date.now()) / 60000);
    pub.sslAdiado = { ate: pub.transicaoAte };
    log(`O Registro.br publica a troca de DNS de ${pub.dominio} em ~${min} min. Não vou ficar parado: faço tags e planilha agora e volto para o SSL quando o DNS apontar.`, 'warn');
    pub.feitas.propagacao = { ok: true, pulada: true, detalhe: `adiada: o Registro.br publica em ~${min} min` };
    pub.feitas.ssl = { ok: true, pulada: true, detalhe: 'adiado para depois da propagação' };
    pub.etapa = 'tags';
    renderPubEtapas();
    return;
  }
  const inicio = Date.now();
  const maxMs = 30 * 60 * 1000;
  log(`Esperando ${pub.dominio} apontar para ${ipNovo || 'o servidor novo'} (até 30 min, conferindo a cada 30s).`, 'cmd');
  while (Date.now() - inicio < maxMs) {
    const conf = ns.length ? await window.api.conferirNs({ dominio: pub.dominio, esperados: ns }) : { ok: true, propagado: true };
    const dns = await window.api.checkDnsBatch({ domains: [pub.dominio] });
    const r = dns.ok ? dns.resultados[0] : null;
    const ips = r?.ips || [];
    const aponta = ipNovo ? ips.includes(ipNovo) : ips.length > 0;
    // O que o SSL precisa é a raiz resolver para o servidor novo. O NS é
    // informação: o resolvedor pode guardar o antigo em cache por horas
    // enquanto o A já responde certo em todo lugar (ADR-077).
    if (aponta) {
      pub.propagado = !!conf.propagado;
      pub.apontando = true;
      pubAvancar('propagacao', true, `${pub.dominio} → ${ips.join(', ')}${conf.propagado ? '' : ' (NS ainda em cache em alguns resolvedores)'}`);
      return;
    }
    log(`Ainda não: A ${ips.join(', ') || 'sem resposta'}, NS ${conf.propagado ? 'já são os da Cloudflare' : `ainda ${(conf.atuais || []).join(', ') || 'sem resposta'}`}${conf.fonte ? ` (${conf.fonte})` : ''}. Tento de novo em 30s.`, 'info');
    await esperarOuParar(30000);
    if (!pub || pub.etapa !== 'propagacao') return;
  }
  // Meia hora é o que vale a pena esperar olhando; o .br leva até 2 horas para
  // publicar a troca. Derrubar a publicação por causa disso seria refazer tudo
  // à toa: marca o SSL como pendente e deixa tags e planilha seguirem.
  pub.sslPendente = 'o DNS não apontou para o servidor novo em 30 minutos; a troca no Registro.br leva até 2 horas para publicar';
  log(`${pub.dominio} ainda não aponta para o servidor novo. Sigo sem o SSL: ative no painel quando propagar.`, 'warn');
  pubAvancar('propagacao', true, 'ainda não propagou', { pulada: true });
}

async function pubEtapaPainel(etapa) {
  if (!pubPrecisaPainel()) throw new Error('link do painel inválido');

  // Sem apontamento não há certificado. Pular aqui é melhor que falhar: a
  // publicação está feita, e o que falta é o relógio do DNS (ADR-069).
  if (etapa === 'ssl') {
    const ap = await withBusy(`conferindo o apontamento de ${pub.dominio}`, () =>
      conferirApontamentoDeProducao(pub.dominio)
    );
    if (!ap.pronto) {
      pub.sslPendente = ap.motivo;
      log(`SSL de ${pub.dominio} pulado: ${ap.motivo}.`, 'warn');
      log(`Quando o domínio estiver apontando, ative o SSL de produção no painel, ou rode esta etapa de novo.`, 'warn');
      pubAvancar('ssl', true, `pulado: ${ap.motivo}`, { pulada: true });
      return;
    }
    log(`${pub.dominio} já aponta para ${ap.ip}. Posso pedir o SSL.`, 'info');
  }

  const res = await withBusy(etapa === 'aprovar' ? 'aprovando no painel' : 'ativando o SSL', () =>
    window.api.publicarPainel({ url: normalizePainelUrl(pub.painelUrl), etapa, dominio: pub.dominio })
  );
  logTudo(res);
  if (!res.ok) {
    if (etapa !== 'ssl') throw new Error(res.error);
    // O painel recusou mesmo com o DNS de pé: anota e segue, em vez de parar a
    // publicação inteira num passo que dá para refazer a qualquer hora.
    pub.sslPendente = res.error;
    log(`SSL de ${pub.dominio}: ${res.error}. Ative no painel depois; o resto segue.`, 'warn');
    pubAvancar('ssl', true, `não ativou: ${res.error}`, { pulada: true });
    return;
  }
  if (etapa === 'ssl') pub.sslPendente = null;
  pubAvancar(etapa, true, etapa === 'aprovar' ? `status ${res.estado?.siteStatus || 'approved'}` : 'SSL ativo');
  if (etapa === 'ssl') await pubVerificarScPendente();
}

async function pubEtapaPublicar() {
  if (!pubPrecisaPainel()) throw new Error('link do painel inválido');
  const cfg = await window.api.getPublicacaoConfig();
  const servidor = String(cfg?.config?.hestiaServidorPadrao || '11');
  const host = cfg?.config?.hestiaServidores?.[servidor] || servidor;
  // Sem parada aqui (ADR-072): a única confirmação da publicação é a do DNS.
  // O que vai acontecer fica dito no terminal, antes de acontecer.
  log(`Publicando ${pub.dominio} em produção no servidor Hestia ${host} (id ${servidor}), sem www, como o painel espera.`, 'cmd');
  const res = await withBusy('publicando em produção', () =>
    window.api.publicarPainel({ url: normalizePainelUrl(pub.painelUrl), etapa: 'publicar', dominio: pub.dominio, servidorId: servidor })
  );
  logTudo(res);
  if (!res.ok) throw new Error(res.error);
  pubAvancar('publicar', true, res.estado?.urlProducao || 'concluída');
}

async function pubEtapaTags() {
  if (!pubPrecisaPainel()) throw new Error('link do painel inválido');
  if (!state.googleSaPath) throw new Error('configure a service account do Google antes');
  // As tags são da marca MPI+: a empresa do DNS não muda a conta do Google.
  const res = await withBusy('criando as propriedades', () =>
    window.api.createGoogleProject({
      domain: pub.dominio,
      saPath: state.googleSaPath,
      brand: 'mpiplus',
      steps: ['analytics', 'gtm', 'recaptcha', 'searchconsole'],
      // O contato técnico já foi consultado na etapa 1: se este MPI+ é da MPI
      // Solutions, o Tag Manager nasce na conta dela (ADR-067).
      empresaGtm: pub.empresa === 'mpisolutions' ? 'mpisolutions' : '',
    })
  );
  logTudo(res);
  if (!res.ok) throw new Error(res.error);
  pub.v = { ...res.result, idProjetoBusca: '' };
  // O Search Console só verifica com o SSL de produção ativo. Quando ele ficou
  // para depois (adiado para a propagação, ou pulado), as tags entram no
  // painel agora e a verificação roda quando o SSL sair (ADR-100).
  const sslAtivo = !!(pub.feitas.ssl && pub.feitas.ssl.ok && !pub.feitas.ssl.pulada) && !pub.sslPendente && !pub.sslAdiado;
  const painel = await publicarMpiPlus(pub.v, null, { painelUrl: normalizePainelUrl(pub.painelUrl), brand: 'mpiplus', semVerificar: !sslAtivo });
  if (painel && !painel.ok && painel.sslPendente) {
    pub.scPendente = true;
  } else {
    if (!painel || !painel.ok) throw new Error(painel?.error || 'o painel não aceitou as tags');
    if ((painel.falhas || []).length) throw new Error(`não entraram no painel: ${painel.falhas.map((f) => f.bloco).join(', ')}`);
    pub.scPendente = !!painel.scAdiado;
  }
  if (pub.scPendente) log(`Tags de ${pub.dominio} no painel. O Search Console e o relatório esperam o SSL de produção: rodam sozinhos quando ele for ativado.`, 'info');
  pubAvancar('tags', true, `GA ${pub.v.idAnalytics || '?'}, GTM ${pub.v.tagmanager || '?'}${pub.scPendente ? ' · Search Console depois do SSL' : ''}`);
}

// Depois do SSL: a verificação do Search Console e o relatório que ficaram
// esperando por ele. Falhar aqui não desfaz nada: fica o aviso.
async function pubVerificarScPendente() {
  if (!pub.scPendente || !pub.v) return;
  const r = await verificarScERelatorio(pub.v, null, { painelUrl: normalizePainelUrl(pub.painelUrl), brand: 'mpiplus' });
  if (r && r.ok) {
    pub.scPendente = false;
    log(`Search Console e relatório de ${pub.dominio} feitos depois do SSL.`, 'success');
  } else {
    log(`O Search Console de ${pub.dominio} continua sem verificar: ${r?.error || 'veja acima'}. Use "Sincronizar no painel" no Criar propriedades quando der.`, 'warn');
  }
}

// Do "Criar propriedades": a mesma linha, na aba da marca. Aqui o Hub não
// publicou o site (isso é feito no servidor); a linha registra o dia em que
// as propriedades foram criadas e o geral.php commitado, como a equipe já faz.
async function registrarPlanilhaCriacao(v, btn) {
  const marca = state.brand;
  const aba = PLANILHA_ABA_POR_MARCA[marca] || 'MPI';
  const razao = (state.npRazao || '').trim();
  if (!razao) {
    log('Preencha a razão social (campo abaixo do domínio) antes de registrar na planilha.', 'error');
    return;
  }
  const cfg = await window.api.getPublicacaoConfig();
  const linha = montarLinhaPlanilha({ dominio: v.domain, razao, marca, desenvolvedor: cfg?.config?.desenvolvedor || '', servidor: '', dnsNosso: null });
  const resumo = linha.map((x, i) => PLANILHA_ROTULOS[i] + ': ' + (x || '(vazio)')).join('\n');
  if (!confirm('Registrar na aba ' + aba + ' da planilha?\n\n' + resumo)) { log('Registro na planilha cancelado.', 'info'); return; }
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Registrando...';
  const res = await withBusy('registrando na planilha', () => window.api.registrarPlanilha({ aba, linha }));
  logTudo(res);
  btn.disabled = false; btn.textContent = original;
  if (!res.ok) { log(`Planilha: ${res.error}`, res.reauth ? 'warn' : 'error'); return; }
  log(`Registrado na planilha: ${res.onde}.`, 'success');
}

// ----- Planilha de publicações (ADR-062) -----
//
// Uma linha por site, na aba MPI ou BUSCA, com as 26 colunas na ordem da
// planilha. O que o Hub fez vai como "Finalizado"; o que não se aplicou
// (DNS do cliente) vai como "Não se aplica", nunca como feito.

const PLANILHA_ABA_POR_MARCA = { mpiplus: 'MPI', mpisolutions: 'MPI', bc: 'Busca Cliente' };
const PLANILHA_TIPO_POR_MARCA = { mpiplus: 'MPI+', mpisolutions: 'MPI', bc: 'Busca' };

function dataHojeBr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function montarLinhaPlanilha({ dominio, razao, marca, desenvolvedor, servidor, dnsNosso, validacao, correcoes }) {
  const feito = 'Finalizado';
  const dns = dnsNosso === false ? 'Não se aplica' : feito;
  return [
    dataHojeBr(),
    `https://${dominio}/`,
    razao || '',
    '',                                  // Chave Única
    PLANILHA_TIPO_POR_MARCA[marca] || marca,
    '',                                  // Rediect
    desenvolvedor || '',
    servidor || '',
    validacao || 'NÃO CONTÉM ERROS',
    feito, feito, feito, feito, feito, feito, feito, feito, feito, feito, feito, feito, feito,
    dns,                                 // Cloudflare
    dns,                                 // Registro.BR
    feito,                               // Site publicado e 100% funcional?
    correcoes || feito,                  // Correções pendentes?
  ];
}

// Última etapa: o site está publicado, a tarefa de publicação é fechada no
// nome de quem roda, e o comentário "Site publicado" vai embaixo da linha
// "Tarefa criada" do caso, marcando quem criou (ADR-089). Sem link, pula.
async function pubEtapaSalesforce() {
  const link = (document.getElementById('pubSfTarefa')?.value || '').trim() || pub.sfTarefa || '';
  if (!link) {
    pubAvancar('salesforce', true, 'sem link da tarefa, nada a fechar', { pulada: true });
    return;
  }
  pub.sfTarefa = link;
  // A tarefa só fecha com tudo concluído (ADR-101). SSL esperando a
  // propagação: a etapa volta depois dele, sozinha.
  if (pub.sslAdiado) {
    pub.sfAdiado = true;
    log('A tarefa do Salesforce fica para depois do SSL e do Search Console: fecho quando eles terminarem.', 'info');
    pubAvancar('salesforce', true, 'fica para depois do SSL', { pulada: true });
    return;
  }
  // O que ficou pendente, tenta de novo agora (é o que o "Tentar de novo"
  // desta etapa faz): o SSL, se o domínio já aponta, e depois o Search Console.
  if (pub.sslPendente) {
    const ap = await withBusy(`conferindo o apontamento de ${pub.dominio}`, () => conferirApontamentoDeProducao(pub.dominio));
    if (ap.pronto) {
      log(`O SSL de ${pub.dominio} estava pendente e o domínio aponta para ${ap.ip}: tentando ativar de novo.`, 'cmd');
      const r = await withBusy('ativando o SSL', () =>
        window.api.publicarPainel({ url: normalizePainelUrl(pub.painelUrl), etapa: 'ssl', dominio: pub.dominio })
      );
      logTudo(r);
      if (r.ok) {
        pub.sslPendente = null;
        pub.feitas.ssl = { ok: true, detalhe: 'SSL ativo (na nova tentativa)' };
      } else {
        pub.sslPendente = r.error || pub.sslPendente;
      }
    } else {
      pub.sslPendente = ap.motivo || pub.sslPendente;
    }
  }
  if (!pub.sslPendente && pub.scPendente) await pubVerificarScPendente();
  const faltando = [];
  if (pub.sslPendente) faltando.push(`o SSL de produção (${pub.sslPendente})`);
  if (pub.scPendente) faltando.push('a verificação do Search Console e o relatório do painel');
  if (faltando.length) {
    throw new Error(`não fechei a tarefa: falta ${faltando.join(' e ')}. Ela só é fechada com tudo concluído; "Tentar de novo" tenta o que falta outra vez`);
  }
  const res = await withBusy('fechando a tarefa no Salesforce', () =>
    window.api.salesforceFecharTarefa({ link, assumir: true, concluir: true, comentar: true, texto: 'Site publicado' })
  );
  logTudo(res);
  if (!res.ok) {
    throw new Error(res.precisaReconectar
      ? 'o Salesforce recusou o acesso (403): reconecte nas configurações e tente de novo'
      : (res.error || 'não consegui fechar a tarefa'));
  }
  const comentou = res.comentado && typeof res.comentado === 'object';
  const partes = [
    res.assumido === 'já era' ? 'já era sua' : res.assumido ? 'assumida' : null,
    res.concluido ? 'concluída' : null,
    comentou ? `comentário marcando ${res.comentado.pessoa}` : `sem comentário (${res.comentado || 'não comentei'})`,
  ].filter(Boolean);
  if (!comentou) log(`A tarefa ${res.assunto || ''} foi fechada, mas o comentário não saiu: ${res.comentado || 'motivo no log acima'}. Comente à mão no caso.`, 'warn');
  pubAvancar('salesforce', true, partes.join(', '));
}

async function pubEtapaPlanilha() {
  const cfg = await window.api.getPublicacaoConfig();
  const razao = pub.razao || document.getElementById('pubRazao')?.value.trim() || '';
  if (!razao) throw new Error('preencha a razão social antes de registrar na planilha');
  let aba = PLANILHA_ABA_POR_EMPRESA[pub.empresa];
  if (!aba) {
    // O Registro.br não disse de quem é o projeto (fora do .br, DNS do cliente).
    // Antes de perguntar, lê no Salesforce: o caso da tarefa tem o campo
    // "Projeto" (Busca Cliente / MPI Solutions) e a fila da tarefa também diz
    // (ADR-123). Só pergunta se nada disso existir.
    let doCaso = pub.empresaDoCaso || null;
    if (!doCaso && pub.sfTarefa) {
      const ctx = await withBusy('lendo a empresa pela tarefa no Salesforce', () => window.api.salesforceContexto({ tarefa: pub.sfTarefa })).catch((e) => ({ ok: false, error: e.message }));
      logTudo(ctx);
      if (ctx?.ok && ctx.empresa) { doCaso = ctx.empresa; log(`${pub.dominio}: empresa pelo ${ctx.via}.`, 'info'); }
    }
    if (doCaso) {
      pub.empresa = doCaso;
      const sel = document.getElementById('pubEmpresa');
      if (sel) sel.value = doCaso;
      aba = PLANILHA_ABA_POR_EMPRESA[doCaso];
    }
  }
  if (!aba) {
    // Nem o caso nem a fila disseram: aí sim pergunta, aqui no terminal (ADR-064).
    const escolha = await perguntarNoTerminal(
      `De qual empresa é ${pub.dominio}? O contato técnico no Registro.br não é nosso, então não dá para descobrir. Isso decide a aba da planilha.`,
      [{ valor: 'bc', rotulo: 'Busca Cliente (aba Busca Cliente)' }, { valor: 'mpisolutions', rotulo: 'MPI Solutions (aba MPI)' }]
    );
    pub.empresa = escolha;
    const sel = document.getElementById('pubEmpresa');
    if (sel) sel.value = escolha;
    aba = PLANILHA_ABA_POR_EMPRESA[escolha];
  }
  const servidorId = String(cfg?.config?.hestiaServidorPadrao || '11');
  const servidor = cfg?.config?.hestiaServidores?.[servidorId] || servidorId;
  const linha = montarLinhaPlanilha({
    dominio: pub.dominio, razao, marca: 'mpiplus',
    desenvolvedor: cfg?.config?.desenvolvedor || '',
    servidor: `Hestia ${servidor}`,
    // Só "Finalizado" quando o DNS foi de fato nosso e feito por aqui.
    dnsNosso: pub.dnsNosso === true,
  });
  log(`Planilha, aba ${aba}: ${linha[0]} | ${linha[1]} | ${razao} | ${linha[4]} | ${linha[7]}`, 'cmd');
  const res = await withBusy('registrando na planilha', () => window.api.registrarPlanilha({ aba, linha, pularSeExistir: true }));
  logTudo(res);
  if (!res.ok) throw new Error(res.error);
  pubAvancar('planilha', true, res.jaExistia ? `aba ${aba}, o domínio já estava lá, não dupliquei` : `aba ${aba}, ${res.onde || 'linha registrada'}`);
}

const PLANILHA_ROTULOS = [
  'Data', 'Domínio', 'Razão Social', 'Chave Única', 'Tipo', 'Rediect', 'Desenvolvedor', 'Servidor', 'Validação do Site',
  'Sitemap', 'Tag Manager', 'Search Console', 'Envio do sitemap', 'Painel BC', 'Google Analytics', '.htaccess', 'Redirecionamentos',
  'PUSH Bitbucket', 'Perfil no Vesta', 'Clonagem', 'Exclusão deploy', 'Exclusão .htaccess/robots', 'Cloudflare', 'Registro.BR',
  '100% funcional?', 'Correções pendentes?',
];

// O detalhe da etapa atual: o antes e o depois da zona, os nameservers.
//
// "Antes" é o que a Cloudflare já tem (o scan dela incluso) mais o que a
// fotografia dos autoritativos achou; "depois" é a zona final, com cada
// registro dizendo se muda, se é novo ou se fica, e o que sai (ADR-071).
function pubLinhaRegistro(r, extra = '') {
  return `<td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.content)}${r.priority !== undefined && r.priority !== null ? ` (${r.priority})` : ''}</td>${extra}`;
}

function renderPubDetalhe() {
  const wrap = document.getElementById('pubDetalhe');
  if (!wrap) return;
  let html = '';

  if (pub.zona && (pub.etapa === 'cloudflare' || pub.etapa === 'dns')) {
    const chave = (r) => `${String(r.type).toUpperCase()}|${String(r.name).toLowerCase()}|${String(r.content).toLowerCase().replace(/\.$/, '')}|${r.priority ?? ''}`;
    const p = pub.plano || { atualizar: [], criar: [], remover: [], manter: [] };
    const muda = new Set(p.atualizar.map(chave));
    const novo = new Set(p.criar.map(chave));

    const antes = [];
    const vistos = new Set();
    for (const r of [...(pub.existentes || []), ...((pub.foto && pub.foto.registros) || [])]) {
      const k = chave(r);
      if (vistos.has(k)) continue;
      vistos.add(k);
      antes.push(r);
    }
    const hoje = antes.map((r) => `<tr>${pubLinhaRegistro(r)}</tr>`).join('');
    const nova = pub.zona.registros.map((r) => {
      const k = chave(r);
      const estado = muda.has(k) ? 'muda' : novo.has(k) ? 'novo' : 'fica';
      return `<tr class="${estado === 'fica' ? '' : 'is-changed'}">${pubLinhaRegistro(r, `<td class="faint">${estado}${/copiado/.test(r.origem || '') ? '' : `, ${escapeHtml(r.origem || '')}`}</td>`)}</tr>`;
    }).join('');
    const sai = (p.remover || []).map((r) => `<tr class="is-changed">${pubLinhaRegistro(r, `<td class="faint">sai, ${escapeHtml(r.motivo || '')}</td>`)}</tr>`).join('');

    html += `<div class="section-label">DNS hoje (${antes.length})${pub.cloudflare?.criada ? ', zona nova na Cloudflare' : ', zona já existia na Cloudflare'}</div>
      <div class="table-wrap"><table class="table"><tbody>${hoje || '<tr><td class="faint">nada encontrado</td></tr>'}</tbody></table></div>
      <div class="section-label">Zona final (${pub.zona.registros.length}), IP antigo ${escapeHtml(pub.zona.ipAntigo || '?')}, IP novo ${escapeHtml(pub.zona.ipNovo)}</div>
      <div class="table-wrap"><table class="table"><tbody>${nova}${sai}</tbody></table></div>
      ${pub.zona.avisos.length ? `<p class="hint warn-text">${pub.zona.avisos.map(escapeHtml).join('<br>')}</p>` : ''}`;
  }

  if (pub.cloudflare?.nameservers?.length && ['registro', 'aprovar', 'publicar', 'propagacao'].includes(pub.etapa)) {
    html += `<div class="card card--status ${pub.propagado ? '' : 'pending'}">
      <div class="card__meta">nameservers da Cloudflare</div>
      <div class="card__title">${pub.propagado ? 'Registro.br já aponta para a Cloudflare' : 'Colocar no Registro.br'}</div>
      <pre class="code-block">${escapeHtml(pub.cloudflare.nameservers.join('\n'))}</pre>
      <div class="card__actions"><button class="btn copy" id="pubCopiarNs">Copiar</button></div>
    </div>`;
  }

  wrap.innerHTML = html;
  const cp = document.getElementById('pubCopiarNs');
  if (cp) cp.addEventListener('click', async (e) => { await window.api.copyToClipboard(pub.cloudflare.nameservers.join('\n')); flashCopied(e.currentTarget); });
}

function grantTarget() {
  return GRANT_TARGETS[state.grantTarget] || GRANT_TARGETS.analytics;
}

async function refreshOauthStatus() {
  const res = await window.api.oauthStatus();
  state.oauth = {
    connected: !!res.connected,
    email: res.email || null,
    durable: !!res.durable,
    expiresAt: res.expiresAt || null,
  };
}

// Handler devolveu reauth: a sessão do Google acabou e o main.js já apagou o
// token. Reflete isso na tela na hora, senão o card fica dizendo "Conectado"
// e o próximo clique erra igual.
async function handleReauth(res) {
  if (!res || !res.reauth) return false;
  await refreshOauthStatus();
  renderOauthStatus();
  return true;
}

function renderGrantAccessTool() {
  const alvo = grantTarget();
  const mount = document.getElementById('cfgGrant');
  if (!mount) return;
  mount.innerHTML = `
    <div class="sec"><div class="sec-head"><span class="sec-title">Conceder acesso da service account</span><span class="sec-meta">Analytics / Tag Manager</span></div>
    <div id="gaStatus"></div>
    <label class="field">
      <span>Onde conceder</span>
      <select id="gaTargetSelect">
        ${Object.entries(GRANT_TARGETS)
          .map(([id, t]) => `<option value="${id}" ${state.grantTarget === id ? 'selected' : ''}>${t.label}</option>`)
          .join('')}
      </select>
    </label>
    ${brandSelectHtml('gaBrandSelect')}
    <button id="gaLoadAccountsBtn" class="btn ghost full-width">Carregar contas do projeto</button>
    <label class="field">
      <span>IDs das contas do ${alvo.label} (um por linha)</span>
      <textarea id="gaAccountIds" rows="6" placeholder="123456789&#10;987654321" autocomplete="off"></textarea>
    </label>
    <label class="field">
      <span>Papel a conceder</span>
      <select id="gaRoleSelect">
        ${alvo.roles.map((r) => `<option value="${r.value}">${r.label}</option>`).join('')}
      </select>
    </label>
    <button id="gaGrantBtn" class="btn primary full-width">Conceder acesso da service account</button>
    <p class="hint">Contorna o bug do Google em que a tela normal de "adicionar usuário" rejeita e-mails de service account, vale para o Analytics e para o Tag Manager. "Carregar contas do projeto" busca os IDs da marca escolhida; se preferir, cole à mão, o ID é ${alvo.idHint}. Analytics e Tag Manager são hierarquias separadas: conceder numa não concede na outra, então rode uma vez para cada.</p>
    </div>
  `;

  renderOauthStatus();

  // Trocar de superfície troca os papéis e o rótulo, e invalida os IDs, são
  // numerações independentes: o ID 123 do Analytics não é o 123 do GTM.
  document.getElementById('gaTargetSelect').addEventListener('change', (e) => {
    state.grantTarget = e.target.value;
    renderGrantAccessTool();
  });

  // Trocar de marca zera a lista, os IDs carregados eram de outras contas.
  wireBrandSelect('gaBrandSelect', () => {
    document.getElementById('gaAccountIds').value = '';
  });

  document.getElementById('gaLoadAccountsBtn').addEventListener('click', loadBrandAccounts);
  document.getElementById('gaGrantBtn').addEventListener('click', grantAccess);
}

function renderOauthStatus() {
  const wrap = document.getElementById('gaStatus');
  if (!wrap) return;

  // Enquanto o login está aberto, o card vira a tela de espera com o link.
  if (state.oauthPending) {
    renderOauthPending(wrap);
    return;
  }

  const { connected, email } = state.oauth;
  wrap.innerHTML = `
    <div class="card card--status ${connected ? '' : 'off'}">
      <div class="card__meta">conta google (login manual)</div>
      <div class="card__title">${connected ? `Conectado${email ? ' como ' + escapeHtml(email) : ''}` : 'Nenhuma conta conectada'}</div>
      ${connected && !state.oauth.durable ? '<p class="hint">Sessão temporária (sem refresh token), vale cerca de uma hora.</p>' : ''}
      <div class="card__actions">
        ${connected
          ? '<button class="btn danger" id="gaLogoutBtn">Desconectar</button>'
          : '<button class="btn primary" id="gaLoginBtn">Conectar com sua conta Google</button>'}
      </div>
    </div>
  `;

  const loginBtn = document.getElementById('gaLoginBtn');
  if (loginBtn) loginBtn.addEventListener('click', oauthLogin);

  const logoutBtn = document.getElementById('gaLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await window.api.oauthLogout();
      await refreshOauthStatus();
      log('Conta Google desconectada.', 'info');
      renderOauthStatus();
    });
  }
}

function renderOauthPending(wrap) {
  const url = state.oauthPending.url;

  wrap.innerHTML = `
    <div class="card card--status pending">
      <div class="card__meta">conta google (login manual)</div>
      <div class="card__title">Aguardando o login no navegador...</div>
      ${url
        ? `<pre class="code-block wrap">${escapeHtml(url)}</pre>
           <div class="card__actions">
             <button class="btn copy" id="gaCopyUrlBtn">Copiar link</button>
             <button class="btn danger" id="gaCancelLoginBtn">Cancelar</button>
           </div>
           <p class="hint">Se o navegador que abriu não é o certo, copie o link e cole no navegador em que você está logado na conta que administra o Analytics. O link só vale enquanto esta espera estiver aberta.</p>`
        : `<p class="hint">Gerando o link...</p>`}
    </div>
  `;

  const copyBtn = document.getElementById('gaCopyUrlBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await window.api.copyToClipboard(url);
        log('Link do login copiado, cole no navegador certo e conclua por lá.', 'success');
        flashCopied(copyBtn);
      } catch (e) {
        log(`Falha ao copiar: ${e.message}`, 'error');
      }
    });
  }

  const cancelBtn = document.getElementById('gaCancelLoginBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      cancelBtn.disabled = true;
      window.api.cancelOauthLogin();
    });
  }
}

async function oauthLogin() {
  if (!state.oauthClientId || !state.oauthClientSecret) {
    log('Configure o OAuth Client ID e o Client Secret nas configurações (ícone de engrenagem).', 'error');
    openSettings();
    return;
  }

  if (!/\.apps\.googleusercontent\.com$/.test(state.oauthClientId)) {
    log('O Client ID não termina em ".apps.googleusercontent.com", confira se copiou o valor inteiro, e só ele.', 'warn');
  }

  state.oauthPending = { url: '' };
  renderOauthStatus();
  log('Abrindo o navegador para o login do Google, conclua por lá e volte pro Hub.', 'cmd');

  const stopListening = window.api.onOauthUrl((url) => {
    state.oauthPending = { url };
    renderOauthStatus();
  });

  const res = await withBusy('aguardando login', () =>
    window.api.oauthLogin({
      clientId: state.oauthClientId,
      clientSecret: state.oauthClientSecret,
    })
  );

  stopListening();
  state.oauthPending = null;

  if (!res.ok) {
    log(res.canceled ? res.error : `Login falhou: ${res.error}`, res.canceled ? 'warn' : 'error');
    renderOauthStatus();
    return;
  }

  await refreshOauthStatus();
  log(`Conectado${res.email ? ' como ' + res.email : ''}.`, 'success');
  if (res.warning) log(res.warning, 'warn');
  renderOauthStatus();
}

// ---------- Sessão do Google de cada marca (ADR-049) ----------
//
// Quem registra a propriedade no Search Console é quem chama a API. A service
// account registra na lista dela; para a propriedade nascer na conta da marca,
// quem chama tem que ser a conta da marca.

async function renderBrandOauth() {
  if (!el.brandOauthList) return;
  const res = await window.api.brandOauthStatus();
  const marcas = (res && res.marcas) || {};

  el.brandOauthList.innerHTML = BRANDS.map((b) => {
    const m = marcas[b.id] || {};
    const conta = (state.brandAccounts?.[b.id] || m.esperado || '').trim();
    // A bolinha do cartão é verde por padrão: sem a classe certa, "não
    // conectada" apareceria com cara de conectada.
    let estado;
    if (!conta) estado = { badge: 'neutral', texto: 'sem conta configurada', cls: 'off' };
    else if (!m.connected) estado = { badge: 'warn', texto: 'não conectada', cls: 'off' };
    else if (m.email && conta && m.email.toLowerCase() !== conta.toLowerCase())
      estado = { badge: 'err', texto: `conectada como ${m.email}`, cls: 'pending' };
    else if (!m.durable) estado = { badge: 'warn', texto: 'sessão curta (≈1h)', cls: 'pending' };
    else estado = { badge: 'ok', texto: 'conectada', cls: '' };

    return `<div class="card card--status ${estado.cls}">
      <div class="card__meta">${escapeHtml(b.name)}</div>
      <div class="card__title">${escapeHtml(conta || 'sem conta configurada')}</div>
      <div class="badges" style="margin:6px 0 0 0">
        <span class="badge ${estado.badge}">${escapeHtml(estado.texto)}</span>
      </div>
      <div class="card__actions">
        <button class="btn ghost" data-brand-oauth="${b.id}" ${conta ? '' : 'disabled'}>
          ${m.connected ? 'Reconectar' : 'Conectar'}
        </button>
        ${m.connected ? `<button class="btn ghost" data-brand-oauth-out="${b.id}">Desconectar</button>` : ''}
      </div>
    </div>`;
  }).join('');

  el.brandOauthList.querySelectorAll('[data-brand-oauth]').forEach((btn) => {
    btn.addEventListener('click', () => conectarMarca(btn.dataset.brandOauth));
  });
  el.brandOauthList.querySelectorAll('[data-brand-oauth-out]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.api.oauthLogout({ slot: btn.dataset.brandOauthOut });
      log(`Sessão de ${brandName(btn.dataset.brandOauthOut)} desconectada.`, 'info');
      renderBrandOauth();
    });
  });
}

async function conectarMarca(brand) {
  const conta = (state.brandAccounts?.[brand] || '').trim();
  if (!conta) {
    log(`Preencha a conta do Google de ${brandName(brand)} antes de conectar.`, 'error');
    return;
  }
  if (!state.oauthClientId || !state.oauthClientSecret) {
    log('Configure o OAuth Client ID e o Client Secret, a sessão da marca usa os mesmos.', 'error');
    return;
  }

  log(`Abrindo o login do Google, entre como ${conta}. Se outra conta estiver logada, escolha "Usar outra conta".`, 'cmd');
  const parar = window.api.onOauthUrl((url) => log(`Se o navegador não abrir, use este link: ${url}`, 'info'));

  const res = await withBusy(`conectando ${conta}`, () =>
    window.api.oauthLogin({
      clientId: state.oauthClientId,
      clientSecret: state.oauthClientSecret,
      slot: brand,
    })
  );
  parar();

  if (!res.ok) {
    log(res.canceled ? res.error : `Não conectei ${conta}: ${res.error}`, res.canceled ? 'warn' : 'error');
  } else {
    log(`${brandName(brand)} conectada como ${res.email}.`, 'success');
    if (res.warning) log(res.warning, 'warn');
  }
  renderBrandOauth();
}

async function loadBrandAccounts() {
  const btn = document.getElementById('gaLoadAccountsBtn');
  if (!state.oauth.connected) {
    log('Conecte sua conta Google antes de carregar as contas.', 'error');
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Carregando...';
  const alvo = grantTarget();
  log(`Listando contas do ${alvo.label} de ${brandName(state.brand)}`, 'cmd');

  const res = await withBusy('listando contas', () =>
    alvo.list({
      brand: state.brand,
      clientId: state.oauthClientId,
      clientSecret: state.oauthClientSecret,
    })
  );

  btn.disabled = false;
  btn.textContent = original;

  if (!res.ok) {
    const expirou = await handleReauth(res);
    log(`Não consegui listar as contas: ${res.error}`, expirou ? 'warn' : 'error');
    return;
  }
  if (!res.accounts.length) {
    log(`Nenhuma conta de ${brandName(state.brand)} casou com o filtro da marca.`, 'warn');
    // O main.js manda a lista do que a API devolveu: sem isso não dá pra saber
    // se falta acesso ou se o padrão da marca é que não bate com o nome real.
    if (res.hint) log(res.hint, 'warn');
    return;
  }

  document.getElementById('gaAccountIds').value = res.accounts.map((a) => a.id).join('\n');
  log(
    `${res.accounts.length} conta(s) de ${brandName(state.brand)}: ` +
      res.accounts.map((a) => `${a.displayName} (${a.id})`).join(', '),
    'success'
  );
}

async function grantAccess() {
  const btn = document.getElementById('gaGrantBtn');
  const textarea = document.getElementById('gaAccountIds');
  const role = document.getElementById('gaRoleSelect').value;

  const accountIds = textarea.value
    .split(/[\r\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const alvo = grantTarget();

  if (!accountIds.length) {
    textarea.focus();
    log(`Cole pelo menos um ID de conta do ${alvo.label} (um por linha).`, 'warn');
    return;
  }
  if (!state.oauth.connected) {
    log('Conecte sua conta Google antes de conceder acesso.', 'error');
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = `Concedendo em ${accountIds.length} conta(s)...`;
  log(`Concedendo acesso no ${alvo.label} em ${accountIds.length} conta(s) de ${brandName(state.brand)} (${role})`, 'cmd');

  const res = await withBusy('concedendo acesso', () =>
    alvo.grant({
      accountIds,
      role,
      clientId: state.oauthClientId,
      clientSecret: state.oauthClientSecret,
    })
  );

  if (res.log) {
    for (const entry of res.log) log(entry.message, entry.type);
  }

  btn.disabled = false;
  btn.textContent = original;

  if (!res.ok) {
    const expirou = await handleReauth(res);
    log(`Falha ao conceder acesso: ${res.error}`, expirou ? 'warn' : 'error');
    return;
  }
  if (res.granted === res.total) {
    log(`Acesso concedido em todas as ${res.total} conta(s).`, 'success');
  } else {
    log(`Acesso concedido em ${res.granted} de ${res.total} conta(s), veja os avisos acima.`, 'warn');
  }
}

// ---------- Ferramenta: Suspender sites ----------

// Padrões do fluxo de hoje. Ficam editáveis na tela e são gravados no
// hub-state, nada aqui é fixo no código.
// Duas ferramentas com o mesmo miolo (ADR-057): consultar o DNS, separar por
// hospedagem, mandar e-mail para a M3 sobre quem está lá. O que muda é o
// pedido: suspender, ou ativar o SSL. Cada modo tem seus modelos e guarda
// suas edições em separado no hub-state.
const MAIL_MODOS = {
  suspender: {
    chaveEstado: 'mail',
    pedido: 'suspensão',
    acaoM3: 'e-mail de suspensão para o suporte',
    acaoVesta: 'Suspender no painel do Vesta',
    botao: (n) => `Enviar ${n} pedido(s) de suspensão`,
    defaults: {
      to: 'suporte@m3solutions.com.br',
      cc: 'everton.lima@buscacliente.com.br',
      subject: 'Suspensão de site - {dominio}',
      body: 'Solicito a suspensão do site {dominio}',
    },
    projeto: false,
  },
  ssl: {
    chaveEstado: 'mailSsl',
    pedido: 'ativação de SSL',
    acaoM3: 'e-mail de ativação de SSL para o suporte',
    acaoVesta: 'Ativar o SSL no painel do Vesta',
    botao: (n) => `Enviar ${n} pedido(s) de ativação de SSL`,
    defaults: {
      to: 'suporte@m3solutions.com.br',
      cc: 'everton.lima@buscacliente.com.br',
      subject: 'Ativação SSL - {projeto} - {dominio}',
      body: 'Solicito ativação SSL do projeto {dominio}',
    },
    projeto: true,
  },
};
// O que vai no assunto é o nome da marca, não o rótulo do seletor.
const SSL_PROJETOS = ['Busca Cliente', 'MPI Solutions'];

function mailModo() {
  return MAIL_MODOS[state.view] || MAIL_MODOS.suspender;
}

function mailSettings() {
  const modo = mailModo();
  return { ...modo.defaults, ...(state[modo.chaveEstado] || {}) };
}

// O que entra no lugar de {projeto}: só a ativação de SSL tem, e é o seletor.
function mailExtras() {
  return mailModo().projeto ? { projeto: state.sslProjeto || SSL_PROJETOS[0] } : {};
}

function parseDomains(texto) {
  return String(texto || '')
    .split(/[\r\n,;]+/)
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0])
    .filter(Boolean);
}

function fillTemplate(texto, dominio, extras = {}) {
  return String(texto || '')
    .replace(/\{\s*dom[ií]nio\s*\}/gi, dominio)
    .replace(/\{\s*projeto\s*\}/gi, extras.projeto || '');
}

async function refreshMsStatus() {
  const res = await window.api.msStatus();
  state.ms = { connected: !!res.connected, email: res.email || null };
}

// Resultado da última verificação de apontamento. Não é gravado no hub-state:
// DNS muda, e resultado velho reaparecendo amanhã é pior do que tela vazia.
let suspendCheck = null; // { lista, resultados, marcados: Set, historico: {} }

const APONTAMENTO = {
  m3:    { titulo: 'M3 Solutions',              acao: null /* vem do modo */,                  badge: 'ok',      marcar: true },
  vesta: { titulo: 'Vesta',                     acao: null /* vem do modo */,                  badge: 'warn',    marcar: false },
  misto: { titulo: 'IPs em faixas diferentes',  acao: 'olhe antes de decidir',                badge: 'warn',    marcar: false },
  erro:  { titulo: 'Não resolveu',              acao: 'sem registro A, pode já estar fora',  badge: 'err',     marcar: false },
  outro: { titulo: 'Não aponta para nós',       acao: 'nada a fazer por aqui',                badge: 'neutral', marcar: false },
};
const ORDEM_APONTAMENTO = ['m3', 'vesta', 'misto', 'erro', 'outro'];

function renderSuspendTool() {
  const modo = mailModo();
  const m = mailSettings();
  // O resultado de uma ferramenta não serve na outra: a marcação de quem
  // recebe e-mail é a mesma, mas o pedido não.
  if (suspendCheck && suspendCheck.modo !== state.view) suspendCheck = null;

  const ehSsl = state.view === 'ssl';
  el.leftPanel.innerHTML = `
    ${backButtonHtml()}
    <div class="sec anim-in">
    <div class="sec-head"><span class="sec-title">${ehSsl ? 'Ativação SSL &amp; e-mails de apontamento' : 'Suspensão de sites &amp; e-mails'}</span><span class="sec-meta">DNS_PROBE / MS_GRAPH</span></div>
    <div class="tool-sub" style="margin:0 0 12px">M3 Solutions (faixa 149.18.x) · Graph API v1.0 · envio pela sua caixa</div>
    <div id="msStatus"></div>
    ${modo.projeto
      ? `<label class="field">
      <span>Projeto (vira {projeto} no assunto)</span>
      <select id="mailProjeto">
        ${SSL_PROJETOS.map((p) => `<option value="${escapeHtml(p)}" ${(state.sslProjeto || SSL_PROJETOS[0]) === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
      </select>
    </label>`
      : ''}
    <label class="field">
      <span>Para</span>
      <input id="mailTo" type="text" value="${escapeHtml(m.to)}" autocomplete="off" />
    </label>
    <label class="field">
      <span>Cc</span>
      <input id="mailCc" type="text" value="${escapeHtml(m.cc)}" autocomplete="off" />
    </label>
    <label class="field">
      <span>Assunto</span>
      <input id="mailSubject" type="text" value="${escapeHtml(m.subject)}" autocomplete="off" />
    </label>
    <label class="field">
      <span>Corpo</span>
      <textarea id="mailBody" rows="4">${escapeHtml(m.body)}</textarea>
    </label>
    <label class="field">
      <span>Domínios (um por linha) <span class="tag" id="mailContagem"></span></span>
      <textarea id="mailDomains" rows="8" placeholder="cliente1.com.br&#10;cliente2.com.br" autocomplete="off"></textarea>
    </label>
    <button id="mailCheckBtn" class="btn primary full-width">Verificar apontamento</button>
    </div>
    <div id="mailCheck"></div>
    ${infoBoxHtml(`<p>O Hub consulta o DNS autoritativo de cada domínio na fila, checa se o registro A aponta para o servidor da <strong>M3 Solutions</strong> e marca automaticamente como seguro. IPs externos (Google, Vesta, terceiros) são desmarcados por segurança; o resto você decide.</p><div class="destaque">As tags <code>{dominio}</code>${modo.projeto ? ' e <code>{projeto}</code>' : ''} são interpoladas para cada destinatário individual antes da transmissão via Microsoft Graph API.</div>`)}
    <div class="stat-grid" id="mailStats"></div>
  `;

  document.getElementById('backToHub').addEventListener('click', goHome);
  renderMsStatus();
  renderMailStats();

  const guardar = async () => {
    state[modo.chaveEstado] = {
      to: document.getElementById('mailTo').value,
      cc: document.getElementById('mailCc').value,
      subject: document.getElementById('mailSubject').value,
      body: document.getElementById('mailBody').value,
    };
    await saveHubState();
    renderSuspendResults();
  };
  for (const id of ['mailTo', 'mailCc', 'mailSubject', 'mailBody']) {
    document.getElementById(id).addEventListener('change', guardar);
  }

  const projetoSel = document.getElementById('mailProjeto');
  if (projetoSel) {
    projetoSel.addEventListener('change', async () => {
      state.sslProjeto = projetoSel.value;
      await saveHubState();
      renderSuspendResults();
    });
  }

  // Mexeu na lista? O resultado anterior deixa de valer, mas só se a lista
  // realmente mudou, senão cada tecla apagaria a verificação.
  document.getElementById('mailDomains').addEventListener('input', () => {
    const cont = document.getElementById('mailContagem');
    const n = parseDomains(document.getElementById('mailDomains').value).length;
    if (cont) cont.textContent = n ? `${n} domínio${n > 1 ? 's' : ''}` : '';
    renderAtalhosTerminal();
    if (!suspendCheck) return;
    const agora = parseDomains(document.getElementById('mailDomains').value).join('\n');
    if (agora !== suspendCheck.lista.join('\n')) {
      suspendCheck = null;
      renderSuspendResults();
    }
  });

  document.getElementById('mailCheckBtn').addEventListener('click', checkApontamento);
  renderSuspendResults();
}

async function checkApontamento() {
  const btn = document.getElementById('mailCheckBtn');
  const dominios = parseDomains(document.getElementById('mailDomains').value);

  if (!dominios.length) {
    document.getElementById('mailDomains').focus();
    log('Informe pelo menos um domínio.', 'warn');
    return;
  }

  const repetidos = [...new Set(dominios.filter((d, i) => dominios.indexOf(d) !== i))];
  if (repetidos.length) log(`Domínio repetido na lista, contei só uma vez: ${repetidos.join(', ')}`, 'warn');

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = `Consultando ${dominios.length}...`;

  const res = await withBusy('consultando DNS', () => window.api.checkDnsBatch({ domains: dominios }));
  if (res.log) for (const entry of res.log) log(entry.message, entry.type);

  btn.disabled = false;
  btn.textContent = original;

  if (!res.ok) {
    log(`Falha na verificação: ${res.error}`, 'error');
    return;
  }

  const marcados = new Set(res.resultados.filter((r) => APONTAMENTO[r.status]?.marcar).map((r) => r.dominio));
  suspendCheck = {
    modo: state.view,
    lista: res.resultados.map((r) => r.dominio),
    resultados: res.resultados,
    marcados,
    historico: {},
  };

  const contagem = {};
  for (const r of res.resultados) contagem[r.status] = (contagem[r.status] || 0) + 1;
  log(
    'Verificação concluída: ' +
      ORDEM_APONTAMENTO.filter((s) => contagem[s]).map((s) => `${contagem[s]} ${APONTAMENTO[s].titulo}`).join(' · '),
    'success'
  );

  renderSuspendResults();
}

// Os cartões "status do envio" e "última fila" do mockup.
function renderMailStats() {
  const wrap = document.getElementById('mailStats');
  if (!wrap) return;
  const ms = state.ms || {};
  const envio = statCardHtml({ rotulo: 'Status do envio', titulo: ms.connected ? 'Microsoft Graph pronto' : 'Microsoft desconectado', dot: ms.connected ? '' : 'off', sub: ms.connected ? `sessão de ${ms.email || 'sua conta'}` : 'conecte a conta acima para enviar', subCls: ms.connected ? '' : 'warn', foot: 'escopo Mail.Send' });
  let fila;
  if (!suspendCheck) fila = statCardHtml({ rotulo: 'Última fila', titulo: 'Nenhuma verificação ainda', dot: 'off', sub: 'cole os domínios e verifique o apontamento', subCls: 'dim' });
  else {
    const prontas = suspendCheck.marcados.size;
    const total = suspendCheck.resultados.length;
    fila = statCardHtml({ rotulo: 'Última fila', titulo: `${prontas} pronta(s), ${total - prontas} com ressalva`, dot: total - prontas ? 'warn' : '', sub: `${total} domínio(s) verificado(s)`, foot: 'via DNS_PROBE' });
  }
  wrap.innerHTML = envio + fila;
}

function renderSuspendResults() {
  renderMailStats();
  const wrap = document.getElementById('mailCheck');
  if (!wrap) return;
  if (!suspendCheck) {
    wrap.innerHTML = '';
    return;
  }

  const modo = mailModo();
  const m = mailSettings();
  const extras = mailExtras();
  const acaoDe = (status) => (status === 'm3' ? modo.acaoM3 : status === 'vesta' ? modo.acaoVesta.replace(/^\w/, (c) => c.toLowerCase()) : APONTAMENTO[status].acao);
  const porStatus = {};
  for (const r of suspendCheck.resultados) (porStatus[r.status] ||= []).push(r);

  let html = '';

  for (const status of ORDEM_APONTAMENTO) {
    const itens = porStatus[status];
    if (!itens || !itens.length) continue;
    const meta = APONTAMENTO[status];

    html += `<div class="section-label">${escapeHtml(meta.titulo)}: ${itens.length}</div>`;

    if (status === 'vesta') {
      html += `<div class="card card--status pending">
        <div class="card__meta">ação manual</div>
        <div class="card__title">${escapeHtml(modo.acaoVesta)}</div>
        <pre class="code-block">${escapeHtml(itens.map((r) => r.dominio).join('\n'))}</pre>
        <div class="card__actions">
          <button class="btn copy" data-copy-vesta="1">Copiar a lista</button>
        </div>
      </div>`;
    }

    for (const r of itens) {
      const marcado = suspendCheck.marcados.has(r.dominio);
      const detalhe = r.ips && r.ips.length ? r.ips.join(', ') : r.detail || 'sem detalhe';
      const viaWww = r.host && r.host !== r.dominio ? ` · via ${escapeHtml(r.host)}` : '';
      html += `<div class="card card--pick">
        <label class="checkbox-field" style="margin:0">
          <input type="checkbox" data-dominio="${escapeHtml(r.dominio)}" ${marcado ? 'checked' : ''} />
          <span class="card__title" style="margin:0">${escapeHtml(r.dominio)}</span>
        </label>
        <div class="badges" style="margin:6px 0 0 0">
          <span class="badge ${meta.badge}">${escapeHtml(acaoDe(status))}</span>
          <span class="badge neutral raw">${escapeHtml(detalhe)}${viaWww}</span>
        </div>
        ${renderHistoricoHtml(r.dominio)}
      </div>`;
    }

    if (status === 'outro' || status === 'erro') {
      html += `<button class="btn ghost full-width" data-historico="${status}">
        Histórico de DNS: ${itens.length} domínio(s)
      </button>`;
    }
  }

  const escolhidos = suspendCheck.resultados.filter((r) => suspendCheck.marcados.has(r.dominio));

  if (escolhidos.length) {
    html += `<div class="section-label">Prévia: ${escolhidos.length} e-mail${escolhidos.length > 1 ? 's' : ''}</div>
      <div class="card">
        <div class="card__meta">para ${escapeHtml(m.to)}${m.cc ? ' · cc ' + escapeHtml(m.cc) : ''}</div>
        <div class="card__title">${escapeHtml(fillTemplate(m.subject, escolhidos[0].dominio, extras))}</div>
        <pre class="code-block">${escapeHtml(fillTemplate(m.body, escolhidos[0].dominio, extras))}</pre>
        ${escolhidos.length > 1 ? `<div class="pick-sub">e mais ${escolhidos.length - 1} igual${escolhidos.length > 2 ? 'is' : ''}, um por domínio.</div>` : ''}
      </div>`;
  }

  html += `<button id="mailSendBtn" class="btn caution full-width" ${escolhidos.length ? '' : 'disabled'}>
    ${escolhidos.length ? modo.botao(escolhidos.length) : 'Nenhum domínio marcado'}
  </button>`;

  wrap.innerHTML = html;

  wrap.querySelectorAll('input[type="checkbox"][data-dominio]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const d = cb.getAttribute('data-dominio');
      if (cb.checked) suspendCheck.marcados.add(d);
      else suspendCheck.marcados.delete(d);
      renderSuspendResults();
    });
  });

  const copiarVesta = wrap.querySelector('[data-copy-vesta]');
  if (copiarVesta) {
    copiarVesta.addEventListener('click', async () => {
      const lista = (porStatus.vesta || []).map((r) => r.dominio).join('\n');
      await window.api.copyToClipboard(lista);
      log('Lista do Vesta copiada.', 'success');
    });
  }

  wrap.querySelectorAll('[data-historico]').forEach((b) => {
    b.addEventListener('click', () => consultarHistorico(b.getAttribute('data-historico')));
  });

  const enviar = document.getElementById('mailSendBtn');
  if (enviar) enviar.addEventListener('click', sendSuspensions);
}

function renderHistoricoHtml(dominio) {
  const h = suspendCheck?.historico?.[dominio];
  if (!h) return '';
  if (!h.ok) return `<div class="pick-empty">${escapeHtml(h.error)}</div>`;
  if (!h.nossas || !h.nossas.length) {
    return `<div class="pick-empty">Nunca esteve em nossas faixas (${h.linhas.length} registro(s) no histórico).</div>`;
  }
  const linhas = h.nossas
    .map((l) => `${l.first_seen} → ${l.last_seen}  ${l.ips.join(', ')}  ${l.grupos.join('/')}`)
    .join('\n');
  return `<pre class="code-block">${escapeHtml(linhas)}</pre>` +
    (h.parcial ? '<div class="pick-empty">Histórico truncado, pode haver registro mais antigo.</div>' : '');
}

// Cada consulta gasta um crédito da conta (o plano gratuito são 500), então
// ela é sob demanda, nunca junto com a verificação de DNS.
async function consultarHistorico(status) {
  if (!suspendCheck) return;
  const dominios = suspendCheck.resultados.filter((r) => r.status === status).map((r) => r.dominio);
  if (!dominios.length) return;

  const st = await window.api.dnsHistStatus();
  if (!st.configured) {
    log('Nenhuma chave de histórico configurada, coloque na engrenagem, em "Chave da API de histórico de DNS".', 'error');
    return;
  }

  const res = await withBusy('consultando histórico', () => window.api.dnsHistory({ domains: dominios }));
  if (res.log) for (const entry of res.log) log(entry.message, entry.type);

  if (!res.ok) {
    log(`Falha no histórico: ${res.error}`, 'error');
    return;
  }
  for (const r of res.resultados) suspendCheck.historico[r.dominio] = r;
  if (res.interrompido) log(`Parei no meio: ${res.interrompido}`, 'warn');
  renderSuspendResults();
}

function renderMsStatus() {
  const wrap = document.getElementById('msStatus');
  if (!wrap) return;

  if (state.msPending) {
    const url = state.msPending.url;
    wrap.innerHTML = `
      <div class="card card--status pending">
        <div class="card__meta">conta microsoft</div>
        <div class="card__title">Aguardando o login no navegador...</div>
        ${url
          ? `<pre class="code-block wrap">${escapeHtml(url)}</pre>
             <div class="card__actions">
               <button class="btn copy" id="msCopyUrlBtn">Copiar link</button>
               <button class="btn danger" id="msCancelBtn">Cancelar</button>
             </div>`
          : '<p class="hint">Gerando o link...</p>'}
      </div>`;

    const copiar = document.getElementById('msCopyUrlBtn');
    if (copiar) {
      copiar.addEventListener('click', async () => {
        await window.api.copyToClipboard(url);
        log('Link do login copiado.', 'success');
        flashCopied(copiar);
      });
    }
    const cancelar = document.getElementById('msCancelBtn');
    if (cancelar) cancelar.addEventListener('click', () => { cancelar.disabled = true; window.api.cancelMsLogin(); });
    return;
  }

  const { connected, email } = state.ms;
  wrap.innerHTML = `
    <div class="card card--status ${connected ? '' : 'off'}">
      <div class="card__meta">conta microsoft (envio dos e-mails)</div>
      <div class="card__title">${connected ? `Conectado${email ? ' como ' + escapeHtml(email) : ''}` : 'Nenhuma conta conectada'}</div>
      <div class="card__actions">
        ${connected
          ? '<button class="btn danger" id="msLogoutBtn">Desconectar</button>'
          : '<button class="btn primary" id="msLoginBtn">Conectar com sua conta Microsoft</button>'}
      </div>
    </div>`;

  const entrar = document.getElementById('msLoginBtn');
  if (entrar) entrar.addEventListener('click', msLogin);

  if (!connected && !state.msClientId) {
    wrap.insertAdjacentHTML(
      'beforeend',
      '<p class="hint">Falta o <strong>Client ID do Azure</strong> nas configurações. Sem ele não há como conectar.</p>'
    );
  }

  const sair = document.getElementById('msLogoutBtn');
  if (sair) {
    sair.addEventListener('click', async () => {
      await window.api.msLogout();
      await refreshMsStatus();
      log('Conta Microsoft desconectada.', 'info');
      renderMsStatus();
    });
  }
}

async function msLogin() {
  state.msPending = { url: '' };
  renderMsStatus();
  log('Abrindo o navegador para o login da Microsoft.', 'cmd');

  const parar = window.api.onMsUrl((url) => {
    state.msPending = { url };
    renderMsStatus();
  });

  const res = await withBusy('aguardando login', () => window.api.msLogin());

  parar();
  state.msPending = null;

  if (!res.ok) {
    log(res.canceled ? res.error : `Login da Microsoft falhou: ${res.error}`, res.canceled ? 'warn' : 'error');
    renderMsStatus();
    return;
  }

  await refreshMsStatus();
  log(`Conectado${res.email ? ' como ' + res.email : ''}.`, 'success');
  if (res.warning) log(res.warning, 'warn');
  renderMsStatus();
}

async function sendSuspensions() {
  const btn = document.getElementById('mailSendBtn');
  const modo = mailModo();
  const m = mailSettings();
  const extras = mailExtras();
  // {projeto} é resolvido aqui, uma vez: o processo principal só conhece
  // {dominio}, que varia por e-mail.
  const assunto = fillTemplate(m.subject, '{dominio}', extras);
  const corpo = fillTemplate(m.body, '{dominio}', extras);

  if (!suspendCheck) {
    log('Verifique o apontamento antes de enviar.', 'warn');
    return;
  }
  const dominios = suspendCheck.resultados
    .filter((r) => suspendCheck.marcados.has(r.dominio))
    .map((r) => r.dominio);

  if (!dominios.length) {
    log('Nenhum domínio marcado para envio.', 'warn');
    return;
  }
  if (!state.ms.connected) {
    log('Conecte sua conta Microsoft antes de enviar.', 'error');
    return;
  }

  // Marcar algo que não é da M3 é legítimo (IP misto, domínio fora do ar),
  // mas tem que ser decisão consciente, então aparece no aviso.
  const forade = suspendCheck.resultados
    .filter((r) => suspendCheck.marcados.has(r.dominio) && r.status !== 'm3')
    .map((r) => `${r.dominio} (${APONTAMENTO[r.status]?.titulo || r.status})`);

  const confirmar = confirm(
    `Enviar ${dominios.length} pedido(s) de ${modo.pedido}?\n\n` +
      `Para: ${m.to}\nCc: ${m.cc}\n\n` +
      `Primeiro assunto: ${fillTemplate(assunto, dominios[0])}\n\n` +
      (forade.length
        ? `Fora da faixa da M3 Solutions:\n${forade.join('\n')}\n\n`
        : '') +
      'Envia de verdade, pela sua caixa. Não dá pra desfazer.'
  );
  if (!confirmar) {
    log('Envio cancelado.', 'info');
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = `Enviando ${dominios.length}...`;

  const res = await withBusy('enviando e-mails', () =>
    window.api.sendMailBatch({
      to: m.to.split(/[;,]+/).map((x) => x.trim()).filter(Boolean),
      cc: m.cc.split(/[;,]+/).map((x) => x.trim()).filter(Boolean),
      subjectTemplate: assunto,
      bodyTemplate: corpo,
      domains: dominios,
    })
  );

  if (res.log) for (const entry of res.log) log(entry.message, entry.type);

  btn.disabled = false;
  btn.textContent = original;

  if (!res.ok) {
    if (res.reauth) {
      await refreshMsStatus();
      renderMsStatus();
    }
    log(`Falha no envio: ${res.error}`, res.reauth ? 'warn' : 'error');
    return;
  }

  if (!res.falhas.length) {
    log(`Todos os ${res.total} e-mails enviados.`, 'success');
  } else {
    log(`${res.enviados.length} de ${res.total} enviados. Não foram: ${res.falhas.map((f) => f.dominio).join(', ')}`, 'warn');
  }
}

// ---------- Terminal ----------

el.clearLogBtn.addEventListener('click', () => {
  el.terminal.innerHTML = '';
});

// ---------- Configurações ----------

// Campo das configurações ↔ marca. Uma lista só, para não haver dois lugares
// onde esquecer uma marca nova.
const WORKSPACE_FIELDS = [
  { brand: 'bc', el: 'wsBcInput' },
  { brand: 'mpisolutions', el: 'wsMpiSolutionsInput' },
];

const BRAND_ACCOUNT_FIELDS = [
  { brand: 'bc', el: 'brandAccountBcInput' },
  { brand: 'mpisolutions', el: 'brandAccountMpiSolutionsInput' },
  { brand: 'mpiplus', el: 'brandAccountMpiPlusInput' },
];

// Cartão do Salesforce nas configurações (ADR-086): conectar, desconectar e
// uma leitura de reconhecimento que serve de teste da sessão.
let sfLoginPendente = null;

async function renderSalesforce() {
  const wrap = document.getElementById('sfStatus');
  if (!wrap) return;
  const r = await window.api.salesforceGetConfig();
  const cfg = (r && r.config) || {};
  if (el.sfDominioInput && document.activeElement !== el.sfDominioInput) el.sfDominioInput.value = cfg.dominio || '';
  if (el.sfAssuntoInput) el.sfAssuntoInput.value = cfg.assuntoMigracao || '';
  if (el.sfComentarioInput) el.sfComentarioInput.value = cfg.comentarioMigracao || '';
  if (el.sfTextoFeedInput) el.sfTextoFeedInput.value = cfg.textoFeed || '';

  if (sfLoginPendente) {
    wrap.innerHTML = `
      <div class="card card--status pending">
        <div class="card__meta">salesforce</div>
        <div class="card__title">Aguardando o login no navegador...</div>
        ${sfLoginPendente.url ? `<pre class="code-block wrap">${escapeHtml(sfLoginPendente.url)}</pre>` : '<p class="hint">Gerando o link...</p>'}
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="card card--status ${r.conectado ? '' : 'off'}">
      <div class="card__meta">salesforce</div>
      <div class="card__title">${r.conectado ? `Conectado como ${escapeHtml(r.usuario || r.email || '?')}` : 'Não conectado'}</div>
      <div class="card__actions">
        ${r.conectado
          ? '<button class="btn ghost" id="sfDiagBtn">Conferir a conexão</button><button class="btn danger" id="sfSairBtn">Desconectar</button>'
          : '<button class="btn primary" id="sfEntrarBtn">Conectar com sua conta Salesforce</button>'}
      </div>
    </div>`;

  const entrar = document.getElementById('sfEntrarBtn');
  if (entrar) entrar.addEventListener('click', conectarSalesforce);
  const sair = document.getElementById('sfSairBtn');
  if (sair) {
    sair.addEventListener('click', async () => {
      await window.api.salesforceDesconectar();
      log('Salesforce desconectado.', 'info');
      renderSalesforce();
    });
  }
  const diag = document.getElementById('sfDiagBtn');
  if (diag) diag.addEventListener('click', () => diagnosticoSalesforce(diag));
}

async function conectarSalesforce() {
  const dominio = el.sfDominioInput.value.trim();
  if (!dominio) { log('Informe o domínio do Salesforce da empresa antes de conectar.', 'error'); return; }
  await window.api.salesforceSetConfig({ dominio });

  sfLoginPendente = { url: null };
  const parar = window.api.onSalesforceUrl((url) => {
    if (sfLoginPendente) { sfLoginPendente.url = url; renderSalesforce(); }
  });
  renderSalesforce();
  log('Abrindo o navegador para o login do Salesforce. O retorno vem pela porta 1717.', 'cmd');

  const res = await window.api.salesforceConectar();
  parar();
  sfLoginPendente = null;
  renderSalesforce();
  if (res.ok) log(`Salesforce conectado como ${res.nome || res.email}.`, 'success');
  else log(`Login do Salesforce falhou: ${res.error}`, res.canceled ? 'warn' : 'error');
}

// Só leitura. É daqui que sai o que o código não vai chutar: valor real do
// status de concluída, tipos de registro, campos próprios e as filas.
async function diagnosticoSalesforce(btn) {
  // Um domínio qualquer que esteja à mão serve de exemplo para ler uma tarefa
  // de verdade. Sem nenhum, o diagnóstico ainda roda, só não mostra exemplo.
  const dominio = (document.getElementById('npDomainInput')?.value || '').trim()
    || (document.getElementById('pubDominio')?.value || '').trim()
    || (pub && pub.dominio) || '';
  const tarefaLink = (document.getElementById('pubSfTarefa')?.value || '').trim() || (pub && pub.sfTarefa) || '';
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Conferindo...';
  const res = await withBusy('conferindo o Salesforce', () => window.api.salesforceDiagnostico({ dominioExemplo: dominio, tarefaLink }));
  btn.disabled = false;
  btn.textContent = original;
  if (res.log) for (const e of res.log) log(e.message, e.type);
  if (!res.ok) { log(`Salesforce: ${res.error}`, 'error'); return; }
  log('Conexão com o Salesforce conferida. O resumo acima é o que o Hub vai usar.', 'success');
}

function openSettings(tab) {
  // Abre a tela primeiro: se qualquer preenchimento abaixo falhar (uma API do
  // preload ausente num build antigo, por exemplo), a tela ainda abre e os
  // campos continuam editáveis, em vez de as configurações não abrirem (ADR-106).
  if (tab) state.cfgTab = tab;
  if (state.view !== 'config') { state.viewAnterior = state.view; state.view = 'config'; }
  render();
  el.emailInput.value = state.creds?.email || '';
  el.tokenInput.value = state.creds?.token || '';
  el.strategySelect.value = state.strategy;
  el.closeBranchInput.checked = state.closeSourceBranch;
  el.googleSaPathInput.value = state.googleSaPath || '';
  el.googleOwnerEmailInput.value = state.googleOwnerEmail || '';
  for (const campo of BRAND_ACCOUNT_FIELDS) el[campo.el].value = state.brandAccounts?.[campo.brand] || '';
  el.bitbucketWorkspaceInput.value = state.bitbucketWorkspace || '';
  for (const campo of WORKSPACE_FIELDS) el[campo.el].value = state.bitbucketWorkspaces?.[campo.brand] || '';
  el.oauthClientIdInput.value = state.oauthClientId || '';
  el.oauthClientSecretInput.value = state.oauthClientSecret || '';
  el.msClientIdInput.value = state.msClientId || '';
  el.msTenantInput.value = state.msTenant || '';
  // A chave de histórico nunca volta do processo principal, o campo só
  // diz se existe uma gravada. Vazio no salvar significa "não mexe".
  el.painelSenhaInput.value = '';
  window.api.painelStatus().then((r) => {
    el.painelEmailInput.value = r.email || '';
    el.painelSenhaInput.placeholder = r.configured ? 'Já configurada, digite para trocar' : '••••••••';
  });
  el.doutorSenhaInput.value = '';
  if (window.api.doutorStatus) {
    window.api.doutorStatus().then((r) => {
      el.doutorEmailMpiInput.value = r.emailMpi || '';
      el.doutorEmailBuscaInput.value = r.emailBusca || '';
      el.doutorSenhaInput.placeholder = r.temSenha ? 'Já configurada, digite para trocar' : '••••••••';
    }).catch(() => {});
  }

  // Publicação MPI+: o que é segredo só diz se existe (ADR-058).
  window.api.getPublicacaoConfig().then((r) => {
    if (!r || !r.ok) return;
    el.pubIpInput.value = r.config.hestiaIpPublico || '';
    el.pubServidorSelect.value = String(r.config.hestiaServidorPadrao || '11');
    el.planilhaUrlInput.value = r.config.planilhaUrl || '';
    el.desenvolvedorInput.value = r.config.desenvolvedor || '';
    const marca = (input, tem, texto) => { input.value = ''; input.placeholder = tem ? texto : '••••••••'; };
    const bc = r.empresas.bc || {};
    const mpi = r.empresas.mpisolutions || {};
    marca(el.cfTokenBcInput, bc.cloudflareToken, 'Já configurado, digite para trocar');
    marca(el.cfTokenMpiInput, mpi.cloudflareToken, 'Já configurado, digite para trocar');
    marca(el.rbrSenhaBcInput, bc.registrobrSenha, 'Já configurada, digite para trocar');
    marca(el.rbrSenhaMpiInput, mpi.registrobrSenha, 'Já configurada, digite para trocar');
    el.cfAccountBcInput.value = bc.cloudflareAccountId || '';
    el.cfAccountMpiInput.value = mpi.cloudflareAccountId || '';
    el.rbrUserBcInput.value = bc.registrobrUsuario || '';
    el.rbrUserMpiInput.value = mpi.registrobrUsuario || '';
  });

  renderSalesforce();

  el.dnsHistKeyInput.value = '';
  window.api.dnsHistStatus().then((r) => {
    el.dnsHistKeyInput.placeholder = r.configured
      ? 'Já configurada, digite para trocar, ou use "Remover credenciais"'
      : 'Opcional, só para consultar para onde o domínio já apontou';
  });
  renderBrandOauth();
}

function closeSettings() {
  if (state.view !== 'config') return;
  const volta = state.viewAnterior && !['config', 'grantaccess', 'findproject'].includes(state.viewAnterior) ? state.viewAnterior : 'home';
  state.viewAnterior = null;
  state.view = volta;
  render();
}

el.settingsBtn.addEventListener('click', () => openSettings());
el.cancelSettingsBtn.addEventListener('click', closeSettings);

el.saveSettingsBtn.addEventListener('click', async () => {
  const email = el.emailInput.value.trim();
  const token = el.tokenInput.value.trim();
  state.strategy = el.strategySelect.value;
  state.closeSourceBranch = el.closeBranchInput.checked;

  const saPath = el.googleSaPathInput.value.trim();
  const ownerEmail = el.googleOwnerEmailInput.value.trim();
  const brandAccounts = {};
  for (const campo of BRAND_ACCOUNT_FIELDS) brandAccounts[campo.brand] = el[campo.el].value.trim();

  const contasMudaram = BRAND_ACCOUNT_FIELDS.some(
    (c) => brandAccounts[c.brand] !== (state.brandAccounts?.[c.brand] || '')
  );
  if (saPath !== state.googleSaPath || ownerEmail !== state.googleOwnerEmail || contasMudaram) {
    state.googleSaPath = saPath;
    state.googleOwnerEmail = ownerEmail;
    state.brandAccounts = brandAccounts;
    // A config do Google é um objeto só, gravar um campo sozinho apagaria os
    // outros, porque setGoogleConfig sobrescreve o arquivo inteiro.
    await window.api.setGoogleConfig({ saPath, ownerEmail, brandAccounts });
  }

  const workspace = el.bitbucketWorkspaceInput.value.trim();
  const workspaces = {};
  for (const campo of WORKSPACE_FIELDS) workspaces[campo.brand] = el[campo.el].value.trim();
  const wsMudou = WORKSPACE_FIELDS.some((c) => workspaces[c.brand] !== (state.bitbucketWorkspaces?.[c.brand] || ''));

  if (workspace !== state.bitbucketWorkspace || wsMudou) {
    state.bitbucketWorkspace = workspace;
    state.bitbucketWorkspaces = workspaces;
    await saveHubState();
  }

  const clientId = el.oauthClientIdInput.value.trim();
  const clientSecret = el.oauthClientSecretInput.value.trim();
  if (clientId !== state.oauthClientId || clientSecret !== state.oauthClientSecret) {
    state.oauthClientId = clientId;
    state.oauthClientSecret = clientSecret;
    await window.api.setOauthConfig({ clientId, clientSecret });
  }

  const msClientId = el.msClientIdInput.value.trim();
  const msTenant = el.msTenantInput.value.trim();
  if (msClientId !== state.msClientId || msTenant !== state.msTenant) {
    state.msClientId = msClientId;
    state.msTenant = msTenant;
    await window.api.setMsConfig({ clientId: msClientId, tenant: msTenant || 'common' });
  }

  const painelEmail = el.painelEmailInput.value.trim();
  const painelSenha = el.painelSenhaInput.value;
  if (painelSenha) {
    const res = await window.api.setPainelCreds({ email: painelEmail, senha: painelSenha });
    if (!res.ok) {
      log(`Erro ao salvar o login do painel: ${res.error}`, 'error');
      return;
    }
    log('Login do painel salvo, criptografado nesta máquina.', 'success');
  }

  {
    // /doutor: a senha nunca volta do processo, então gravar exige digitá-la.
    // Trocar só os e-mails também pede a senha de novo (grava tudo junto).
    const emailMpi = el.doutorEmailMpiInput.value.trim();
    const emailBusca = el.doutorEmailBuscaInput.value.trim();
    const senha = el.doutorSenhaInput.value;
    const st = await window.api.doutorStatus();
    const emailMudou = emailMpi !== (st.emailMpi || '') || emailBusca !== (st.emailBusca || '');
    if (senha) {
      const res = await window.api.doutorSetCreds({ senha, emailMpi, emailBusca });
      if (!res.ok) { log(`Erro ao salvar o /doutor: ${res.error}`, 'error'); return; }
      log('Credenciais do /doutor salvas, criptografadas nesta máquina.', 'success');
    } else if (emailMudou) {
      log('Para trocar o e-mail do /doutor, digite a senha de novo (ela não fica guardada em texto para reenviar sozinha).', 'warn');
    }
  }

  {
    const resPub = await window.api.setPublicacaoConfig({
      config: {
        hestiaIpPublico: el.pubIpInput.value.trim() || undefined,
        hestiaServidorPadrao: el.pubServidorSelect.value,
        planilhaUrl: el.planilhaUrlInput.value.trim(),
        desenvolvedor: el.desenvolvedorInput.value.trim(),
      },
      empresas: {
        bc: {
          cloudflareToken: el.cfTokenBcInput.value.trim(),
          cloudflareAccountId: el.cfAccountBcInput.value.trim(),
          registrobrUsuario: el.rbrUserBcInput.value.trim(),
          registrobrSenha: el.rbrSenhaBcInput.value,
        },
        mpisolutions: {
          cloudflareToken: el.cfTokenMpiInput.value.trim(),
          cloudflareAccountId: el.cfAccountMpiInput.value.trim(),
          registrobrUsuario: el.rbrUserMpiInput.value.trim(),
          registrobrSenha: el.rbrSenhaMpiInput.value,
        },
      },
    });
    if (!resPub.ok) {
      log(`Erro ao salvar a configuração de publicação: ${resPub.error}`, 'error');
      return;
    }
  }

  {
    const resSf = await window.api.salesforceSetConfig({
      dominio: el.sfDominioInput.value.trim(),
      assuntoMigracao: el.sfAssuntoInput.value.trim(),
      comentarioMigracao: el.sfComentarioInput.value.trim(),
      textoFeed: el.sfTextoFeedInput.value.trim(),
    });
    if (!resSf.ok) {
      log(`Erro ao salvar a configuração do Salesforce: ${resSf.error}`, 'error');
      return;
    }
  }

  const dnsHistKey = el.dnsHistKeyInput.value.trim();
  if (dnsHistKey) {
    const res = await window.api.setDnsHistKey({ key: dnsHistKey });
    if (!res.ok) {
      log(`Erro ao salvar a chave de histórico: ${res.error}`, 'error');
      return;
    }
    log('Chave de histórico de DNS salva, criptografada nesta máquina.', 'success');
  }

  if (email && token) {
    const res = await window.api.saveCreds({ email, token });
    if (!res.ok) {
      log(`Erro ao salvar credenciais: ${res.error}`, 'error');
      return;
    }
    state.creds = { email, token };
    log('Credenciais salvas nesta máquina.', 'success');
  }
  closeSettings();
});

el.clearCredsBtn.addEventListener('click', async () => {
  await window.api.clearCreds();
  await window.api.setDnsHistKey({ key: '' });
  await window.api.setPainelCreds({ email: '', senha: '' });
  await window.api.clearPainelSession();
  state.creds = null;
  el.emailInput.value = '';
  el.tokenInput.value = '';
  el.dnsHistKeyInput.value = '';
  el.dnsHistKeyInput.placeholder = 'Opcional, só para consultar para onde o domínio já apontou';
  el.painelEmailInput.value = '';
  el.painelSenhaInput.value = '';
  log('Credenciais removidas.', 'info');
});

// ---------- Inicialização ----------

async function init() {
  log('Hub iniciado.', 'info');
  // Rodada em massa que ficou pela metade (o Windows fechou tudo, por exemplo).
  window.api.lerRodada().then((r) => {
    const estado = r && r.estado;
    if (!estado) return;
    const res = resumoRodada(estado);
    log(estado.fase === 'tarefas-pendentes'
      ? `Da rodada em massa de ${res.quando} ficaram ${res.pendentesSf} tarefa(s) do Salesforce pendente(s). Abra o Publicar em massa para criar.`
      : `A rodada em massa de ${res.quando} não terminou (${res.feitos} de ${res.total} site(s) feitos). Abra o Publicar em massa e clique em "Retomar de onde parou".`, 'warn');
  }).catch(() => {});

  const hubRes = await window.api.getHubState();
  if (hubRes.ok && hubRes.state) {
    state.recents = hubRes.state.recents || [];
    state.bitbucketWorkspace = hubRes.state.bitbucketWorkspace || '';
    // Só as marcas que existem, sempre string.
    const wss = hubRes.state.bitbucketWorkspaces || {};
    for (const b of BRANDS) if (b.id in wss) state.bitbucketWorkspaces[b.id] = String(wss[b.id] || '');
    if (BRANDS.some((b) => b.id === hubRes.state.brand)) state.brand = hubRes.state.brand;
    // Só as chaves conhecidas, e sempre booleano: hub-state velho ou editado à
    // mão não pode injetar etapa que não existe nem valor estranho.
    if (typeof hubRes.state.sfTarefasAuto === 'boolean') state.sfTarefasAuto = hubRes.state.sfTarefasAuto;
    if (hubRes.state.npSteps && typeof hubRes.state.npSteps === 'object') {
      for (const e of NP_STEPS) {
        if (e.id in hubRes.state.npSteps) state.npSteps[e.id] = !!hubRes.state.npSteps[e.id];
      }
    }
    if (hubRes.state.mail) state.mail = hubRes.state.mail;
    if (hubRes.state.mailSsl) state.mailSsl = hubRes.state.mailSsl;
    if (hubRes.state.mailVhost && typeof hubRes.state.mailVhost === 'object') {
      state.mailVhost = { to: String(hubRes.state.mailVhost.to || ''), cc: String(hubRes.state.mailVhost.cc || '') };
    }
    if (SSL_PROJETOS.includes(hubRes.state.sslProjeto)) state.sslProjeto = hubRes.state.sslProjeto;
  }

  const googleRes = await window.api.getGoogleConfig();
  if (googleRes.ok && googleRes.config) {
    state.googleSaPath = googleRes.config.saPath || '';
    state.googleOwnerEmail = googleRes.config.ownerEmail || '';
    // scOwners é o nome antigo do mesmo campo (ADR-035), lido como reserva para
    // não perder o que já estava configurado. Só as marcas que existem.
    const contas = googleRes.config.brandAccounts || googleRes.config.scOwners || {};
    for (const b of BRANDS) if (b.id in contas) state.brandAccounts[b.id] = String(contas[b.id] || '');
  }

  const oauthRes = await window.api.getOauthConfig();
  if (oauthRes.ok && oauthRes.config) {
    state.oauthClientId = oauthRes.config.clientId || '';
    state.oauthClientSecret = oauthRes.config.clientSecret || '';
  }
  const msRes = await window.api.getMsConfig();
  if (msRes.ok && msRes.config) {
    state.msClientId = msRes.config.clientId || '';
    state.msTenant = msRes.config.tenant || '';
  }

  await refreshOauthStatus();
  await refreshMsStatus();

  const historyRes = await window.api.getMergeHistory();
  if (historyRes.ok) state.history = historyRes.entries || [];

  const res = await window.api.loadCreds();
  if (res.ok && res.creds) {
    state.creds = res.creds;
    log(`Sessão do Bitbucket carregada para ${res.creds.email}.`, 'info');
  } else {
    log('Nenhuma credencial do Bitbucket configurada ainda. Abra as configurações quando for usar "Mergear PRs".', 'info');
  }

  render();
  carregarEsperas();
  iniciarTopbarLive();
  iniciarTerminalComando();
  el.copyLogBtn?.addEventListener('click', copiarTerminal);
  el.tbSearch?.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarNoTopo(el.tbSearch.value); });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); el.tbSearch?.focus(); el.tbSearch?.select(); }
    if (e.ctrlKey && (e.key === 's' || e.key === 'S') && state.view === 'config') { e.preventDefault(); el.saveSettingsBtn.click(); }
  });
  // As filas do Salesforce entram na home assim que a sessão for confirmada.
  setTimeout(() => { if (hubSfConectado && state.view === 'home') carregarTarefasSf(false); }, 1200);
}

init();
