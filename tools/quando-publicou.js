// "Quando publicou" pela linha de comando (ADR-135): uma lista de domínios,
// um por linha, e a resposta de cada um — tarefa de publicação concluída no
// Salesforce, senão o commit do geral.php / client.inc.php no Bitbucket.
//
// Roda SOB O ELECTRON, porque as credenciais do Hub (token do Salesforce e
// API token do Bitbucket) estão cifradas pelo safeStorage e só ele as abre:
//
//     node_modules\.bin\electron tools\quando-publicou.js lista.txt [saida.xlsx]
//
// (com ELECTRON_RUN_AS_NODE fora do ambiente, senão o Electron vira Node puro).
// Usa um perfil temporário com a cópia do "Local State" do Hub — é de lá que o
// safeStorage tira a chave no Windows — para não mexer no perfil do Hub
// aberto. Nada é gravado no perfil do Hub; o token do Salesforce, se
// expirado, é renovado só na memória deste processo.

const { app, safeStorage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const RAIZ = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf-8'));
const userDataReal = path.join(app.getPath('appData'), pkg.name);
const perfilTmp = path.join(os.tmpdir(), 'hub-quando-publicou');
fs.mkdirSync(perfilTmp, { recursive: true });
try { fs.copyFileSync(path.join(userDataReal, 'Local State'), path.join(perfilTmp, 'Local State')); } catch (e) { /* sem Local State: o DPAPI puro resolve */ }
app.setPath('userData', perfilTmp);
app.disableHardwareAcceleration();

function lerCifrado(nome) {
  const p = path.join(userDataReal, nome);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(safeStorage.decryptString(fs.readFileSync(p)));
}

function postForm(url, form) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = new URLSearchParams(form).toString();
    const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), Accept: 'application/json' } }, (res) => {
      let txt = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) {} resolve({ status: res.statusCode, json, text: txt }); });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const [lista, saida] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!lista || !fs.existsSync(lista)) {
    console.error('Uso: electron tools/quando-publicou.js lista.txt [saida.xlsx]');
    app.exit(2);
    return;
  }
  const { criarSalesforce } = require(path.join(RAIZ, 'lib', 'salesforce'));
  const Q = require(path.join(RAIZ, 'lib', 'quando-publicou'));
  const { limparDominio } = require(path.join(RAIZ, 'lib', 'triagem'));

  const dominios = [...new Set(fs.readFileSync(lista, 'utf-8').split(/\r?\n/).map((l) => limparDominio(l.split(/[\s,;|]+/)[0])).filter(Boolean))];

  // Salesforce: o token do Hub; expirado, renova na memória (mesmo app
  // conectado do Hub, PlatformCLI).
  let sf = null;
  try {
    const token = lerCifrado('salesforce-token.enc');
    if (token && token.access_token) {
      sf = criarSalesforce(token.instance_url, token.access_token);
      try {
        await sf.identidade();
      } catch (e) {
        if (!token.refresh_token) throw e;
        const cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(userDataReal, 'salesforce-config.json'), 'utf-8')); } catch (x) { return {}; } })();
        const login = cfg.dominio ? `https://${String(cfg.dominio).replace(/^https?:\/\//, '').replace(/\/$/, '')}` : 'https://login.salesforce.com';
        const r = await postForm(`${login}/services/oauth2/token`, { grant_type: 'refresh_token', client_id: 'PlatformCLI', refresh_token: token.refresh_token });
        if (r.status !== 200 || !r.json || !r.json.access_token) throw new Error(`não consegui renovar a sessão do Salesforce (HTTP ${r.status})`);
        sf = criarSalesforce(r.json.instance_url || token.instance_url, r.json.access_token);
        await sf.identidade();
        console.log('Sessão do Salesforce renovada na memória.');
      }
    } else {
      console.log('Salesforce: sem token gravado; só o Bitbucket será consultado.');
    }
  } catch (e) {
    console.log(`Salesforce fora (${e.message}); só o Bitbucket será consultado.`);
    sf = null;
  }

  // Bitbucket: as credenciais e as workspaces das marcas (hub-state).
  let bb = null;
  try {
    const creds = lerCifrado('credentials.enc');
    const st = JSON.parse(fs.readFileSync(path.join(userDataReal, 'hub-state.json'), 'utf-8'));
    const workspaces = [...new Set([...Object.values(st.bitbucketWorkspaces || {}), st.bitbucketWorkspace].map((w) => String(w || '').trim()).filter(Boolean))];
    if (creds && creds.email && creds.token && workspaces.length) bb = Q.criarBitbucket({ creds, workspaces });
    else console.log('Bitbucket: sem credenciais ou sem workspace configurada; só o Salesforce será consultado.');
  } catch (e) {
    console.log(`Bitbucket fora (${e.message}).`);
  }

  console.log(`\n${dominios.length} domínio(s). Salesforce: ${sf ? 'sim' : 'não'}. Bitbucket: ${bb ? bb.workspaces.join(', ') : 'não'}.\n`);
  const linhas = [];
  const verboso = process.argv.includes('--log');
  for (const dominio of dominios) {
    const log = (m, t) => { if (verboso || t === 'error') console.log(`    [${t || 'info'}] ${m}`); };
    let r;
    try {
      r = await Q.quandoPublicou(dominio, { sf, bb, log });
    } catch (e) {
      r = { dominio, situacao: 'erro', quando: '', fonte: '', detalhe: e.message, texto: `erro: ${e.message}` };
    }
    linhas.push(r);
    console.log(`${dominio} - ${r.texto}${r.detalhe && !verboso ? `\n    ${r.detalhe}` : ''}`);
  }

  const resumo = linhas.reduce((s, l) => { s[l.situacao] = (s[l.situacao] || 0) + 1; return s; }, {});
  console.log(`\nResumo: ${Object.entries(resumo).map(([k, v]) => `${v} ${k}`).join(', ')}.`);

  if (saida) {
    const XLSX = require(path.join(RAIZ, 'node_modules', 'xlsx'));
    const ws = XLSX.utils.aoa_to_sheet([
      ['Domínio', 'Resposta', 'Situação', 'Publicado em', 'Fonte', 'Detalhe'],
      ...linhas.map((l) => [l.dominio, l.texto, l.situacao, l.quando, l.fonte, l.detalhe]),
    ]);
    ws['!cols'] = [{ wch: 36 }, { wch: 60 }, { wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 90 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Quando publicou');
    XLSX.writeFile(wb, saida);
    console.log(`Planilha: ${saida}`);
  }
  app.exit(0);
}

app.whenReady().then(main).catch((e) => { console.error('x ' + (e && e.stack || e)); app.exit(1); });
