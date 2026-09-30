// Benchmark do que o Hub faz na própria máquina (ADR-106): ler a planilha,
// reconhecer as colunas, montar a lista do lote, montar e planejar a zona da
// Cloudflare, e o custo de carregar as dependências na abertura.
//
//     node tools/bench.js                 no Node do sistema
//     node tools/bench.js --electron      no Node do Electron (o V8 do app)
//     node tools/bench.js --rapido        amostras menores, ~1/3 do tempo
//     node tools/bench.js --json b.json   guarda o resultado em JSON
//
// O que vem da rede (painel, Registro.br, Cloudflare, Google) não entra: o
// tempo ali é do outro lado, e medir a nossa latência de casa não diz nada
// sobre o app. As funções são recortadas do main.js e do renderer/app.js pelo
// mesmo marcador dos testes: se alguém renomear, o benchmark morre em vez de
// medir uma cópia velha.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);

// --electron: roda este mesmo arquivo com o Node que vem dentro do Electron.
if (args.includes('--electron') && !process.versions.electron) {
  const electron = require('electron'); // fora do Electron, é o caminho do executável
  const r = spawnSync(electron, [__filename, ...args.filter((a) => a !== '--electron')], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  process.exit(r.status ?? 1);
}

const RAPIDO = args.includes('--rapido');
const iJson = args.indexOf('--json');
const saidaJson = iJson >= 0 ? args[iJson + 1] : '';

// ---------- recortes do código de verdade ----------

const fonteApp = fs.readFileSync(path.join(ROOT, 'renderer', 'app.js'), 'utf-8');
const fonteMain = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf-8');
function recorta(fonte, inicio, fim) {
  const i = fonte.indexOf(inicio);
  const f = fonte.indexOf(fim, i);
  if (i < 0 || f < 0) throw new Error(`não achei o trecho "${inicio}"`);
  return fonte.slice(i, f);
}

const A = new Function([
  `const PAINEL_MPI_HOST = '${(fonteApp.match(/const PAINEL_MPI_HOST = '([^']+)'/) || [])[1]}';`,
  recorta(fonteApp, 'function normalizePainelUrl(', '\nfunction brandHasBitbucket('),
  recorta(fonteApp, 'function normalizeDomain(', '\nfunction panelIdForBrand('),
  recorta(fonteApp, 'const BULK_PAPEIS = {', '\n// Da planilha crua para a lista de sites'),
  'let bulkLinhas = [], bulkMapa = null, bulkTemCabecalho = false;',
  recorta(fonteApp, 'function bulkMontarLinhas()', '\nconst BULK_STATUS'),
  `return {
    normalizeDomain, normalizePainelUrl, bulkDetectarCabecalho, bulkDetectarColunas,
    detectar: (linhas) => { const cab = bulkDetectarCabecalho(linhas); return bulkDetectarColunas(linhas, cab); },
    montar: (linhas, mapa, cab) => { bulkLinhas = linhas; bulkMapa = mapa; bulkTemCabecalho = cab; return bulkMontarLinhas(); },
  };`,
].join('\n\n'))();

const M = new Function('require', [
  recorta(fonteMain, 'function separadorDeTexto(', '\nipcMain.handle(\'planilha:ler\''),
  'return { lerTextoTabular, lerPlanilhaBinaria };',
].join('\n\n'))(require);

const Z = require(path.join(ROOT, 'lib', 'zona'));
const SF = require(path.join(ROOT, 'lib', 'salesforce'));
const XLSX = require('xlsx');

// ---------- dados com a cara dos de verdade ----------

// A planilha do Publicar em massa: razão social, domínio, painel, caso e
// temporário. 32 é o tamanho da maior rodada registrada (ADR-092); 300 e 3000
// são folga para saber onde a coisa começa a doer.
function gerarLinhas(n) {
  const linhas = [['Razão Social', 'Domínio', 'Link do painel', 'Link do caso', 'Link temporário']];
  for (let i = 1; i <= n; i++) {
    const k = String(i).padStart(5, '0');
    linhas.push([
      i % 3 ? `Clínica São João ${i} Ltda - ME` : `COMERCIO DE PECAS ${i} EIRELI`,
      i % 4 === 0 ? `https://www.cliente${i}.com.br/` : `cliente${i}.com.br`,
      `https://idealplus.idealtrends.io/clientes/${2000 + i}/hub?projeto=${3000 + i}&tab=publicacao`,
      i % 2 ? `https://buscacliente.lightning.force.com/lightning/r/Case/500Hs00001${k}AAA/view` : '',
      `cliente${i}.mpitemporario.com.br`,
    ]);
  }
  return linhas;
}
const comoTsv = (linhas) => linhas.map((l) => l.join('\t')).join('\r\n');
const comoCsv = (linhas) => linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
function comoXlsx(linhas) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Sites');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// A fotografia do DNS de um cliente: raiz, www, e-mail, SPF/DKIM/DMARC, SRV do
// Teams, e `extras` subdomínios de todo tipo (inclusive atrás do proxy).
function gerarSnapshot(dom, extras) {
  const ANT = '200.147.10.20';
  const registros = [
    { type: 'A', name: dom, content: ANT, ttl: 3600 },
    { type: 'AAAA', name: dom, content: '2804:14c::20' },
    { type: 'CNAME', name: `www.${dom}`, content: dom },
    { type: 'CNAME', name: `webmail.${dom}`, content: dom },
    { type: 'CNAME', name: `ftp.${dom}`, content: dom },
    { type: 'CNAME', name: `autodiscover.${dom}`, content: 'autodiscover.outlook.com' },
    { type: 'MX', name: dom, content: dom, priority: 10 },
    { type: 'MX', name: dom, content: 'aspmx.l.google.com', priority: 1 },
    { type: 'TXT', name: dom, content: 'v=spf1 a mx include:_spf.google.com ~all' },
    { type: 'TXT', name: `_dmarc.${dom}`, content: `v=DMARC1; p=none; rua=mailto:dmarc@${dom}` },
    { type: 'TXT', name: `default._domainkey.${dom}`, content: `v=DKIM1; k=rsa; p=${'MIIBIjANBgkqh'.repeat(30)}` },
    { type: 'SRV', name: `_sip._tls.${dom}`, content: '100 1 443 sipdir.online.lync.com', priority: 100 },
    { type: 'NS', name: dom, content: 'a.sec.dns.br' },
  ];
  for (let k = 0; k < extras; k++) {
    if (k % 5 === 0) registros.push({ type: 'CNAME', name: `s${k}.${dom}`, content: dom });
    else if (k % 5 === 1) registros.push({ type: 'A', name: `s${k}.${dom}`, content: `200.147.11.${k % 250}` });
    else if (k % 5 === 2) registros.push({ type: 'A', name: `p${k}.${dom}`, content: `104.21.${k % 250}.10` });
    else if (k % 5 === 3) registros.push({ type: 'TXT', name: `t${k}.${dom}`, content: `google-site-verification=${'x'.repeat(43)}` });
    else registros.push({ type: 'CNAME', name: `c${k}.${dom}`, content: 'ghs.googlehosted.com' });
  }
  return { registros };
}

// ---------- medidor ----------

const agora = () => Number(process.hrtime.bigint());
let sink = 0; // o resultado vai para cá, senão o V8 pode jogar a chamada fora
const consome = (r) => { sink ^= (r && typeof r === 'object' ? (r.length | 0) + 1 : 1); };

const resultados = [];
function medir(grupo, nome, fn, { linhas = 0 } = {}) {
  const minMs = RAPIDO ? 150 : 500;
  // Aquecimento: o V8 otimiza depois de algumas voltas; medir antes disso é
  // medir o interpretador.
  let n = 0;
  const tA = agora();
  while ((agora() - tA < 150e6 && n < 5000) || n < 3) { consome(fn()); n++; }
  const porExecucao = (agora() - tA) / n;
  const lote = Math.max(1, Math.round(2e6 / porExecucao)); // cada amostra com ~2 ms
  const minAmostras = porExecucao > 20e6 ? 8 : 30;

  const amostras = [];
  const t0 = agora();
  while (amostras.length < minAmostras || agora() - t0 < minMs * 1e6) {
    const a = agora();
    for (let i = 0; i < lote; i++) consome(fn());
    amostras.push((agora() - a) / lote);
    if (amostras.length >= 3000) break;
  }
  amostras.sort((x, y) => x - y);
  const media = amostras.reduce((s, x) => s + x, 0) / amostras.length;
  const dp = Math.sqrt(amostras.reduce((s, x) => s + (x - media) ** 2, 0) / Math.max(1, amostras.length - 1));
  const r = {
    grupo,
    nome,
    mediaNs: media,
    medianaNs: amostras[Math.floor(amostras.length / 2)],
    p95Ns: amostras[Math.min(amostras.length - 1, Math.floor(amostras.length * 0.95))],
    minNs: amostras[0],
    opsPorSegundo: 1e9 / media,
    margem: (1.96 * dp) / Math.sqrt(amostras.length) / media, // ± da média, 95%
    amostras: amostras.length,
    porLinhaNs: linhas ? media / linhas : null,
  };
  resultados.push(r);
  return r;
}

function fmtTempo(ns) {
  if (ns < 1e3) return `${ns.toFixed(0)} ns`;
  if (ns < 1e6) return `${(ns / 1e3).toFixed(ns < 1e4 ? 2 : 1)} µs`;
  if (ns < 1e9) return `${(ns / 1e6).toFixed(ns < 1e7 ? 2 : 1)} ms`;
  return `${(ns / 1e9).toFixed(2)} s`;
}
function fmtOps(x) {
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)} mi/s`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)} mil/s`;
  return `${x.toFixed(x < 10 ? 1 : 0)}/s`;
}

let grupoAtual = '';
function imprimir(r) {
  if (r.grupo !== grupoAtual) {
    grupoAtual = r.grupo;
    console.log(`\n${r.grupo}`);
    console.log(`  ${'caso'.padEnd(58)} ${'média'.padStart(9)} ${'p95'.padStart(9)} ${'por linha'.padStart(10)} ${'vazão'.padStart(10)}   ±`);
  }
  console.log(`  ${r.nome.padEnd(58)} ${fmtTempo(r.mediaNs).padStart(9)} ${fmtTempo(r.p95Ns).padStart(9)} ${(r.porLinhaNs ? fmtTempo(r.porLinhaNs) : '').padStart(10)} ${fmtOps(r.opsPorSegundo).padStart(10)}  ${(r.margem * 100).toFixed(1)}%`);
}

// ---------- casos ----------

const cpu = os.cpus();
console.log(`\nBenchmark do Hub — ${new Date().toLocaleString('pt-BR')}`);
console.log(`${process.versions.electron ? `Node do Electron ${process.versions.electron}` : 'Node do sistema'} ${process.versions.node} · V8 ${process.versions.v8}`);
console.log(`${cpu[0].model.trim()} · ${cpu.length} núcleos lógicos · ${(os.totalmem() / 2 ** 30).toFixed(1)} GB · ${os.type()} ${os.release()}`);

const TAMANHOS = [32, 300, 3000];
const planilhas = Object.fromEntries(TAMANHOS.map((n) => [n, gerarLinhas(n)]));
const tsv = Object.fromEntries(TAMANHOS.map((n) => [n, comoTsv(planilhas[n])]));
const xlsx = Object.fromEntries(TAMANHOS.map((n) => [n, comoXlsx(planilhas[n])]));
const csv300 = comoCsv(planilhas[300]);

const G1 = 'Planilha: texto e .xlsx viram linhas (main.js, processo principal)';
for (const n of TAMANHOS) imprimir(medir(G1, `texto colado do Excel, ${n} linhas`, () => M.lerTextoTabular(tsv[n]), { linhas: n }));
imprimir(medir(G1, 'CSV com ; e aspas, 300 linhas', () => M.lerTextoTabular(csv300), { linhas: 300 }));
for (const n of TAMANHOS) imprimir(medir(G1, `.xlsx, ${n} linhas`, () => M.lerPlanilhaBinaria(xlsx[n]), { linhas: n }));

const G2 = 'Planilha: colunas e lista do lote (renderer/app.js)';
for (const n of TAMANHOS) imprimir(medir(G2, `reconhecer cabeçalho e colunas, ${n} linhas`, () => A.detectar(planilhas[n]), { linhas: n }));
for (const n of TAMANHOS) {
  const mapa = A.detectar(planilhas[n]);
  imprimir(medir(G2, `montar a lista do lote, ${n} linhas`, () => A.montar(planilhas[n], mapa, true).rows, { linhas: n }));
}
for (const n of [32, 300]) {
  imprimir(medir(G2, `do texto colado à lista pronta, ${n} linhas`, () => {
    const linhas = M.lerTextoTabular(tsv[n]);
    const cab = A.bulkDetectarCabecalho(linhas);
    return A.montar(linhas, A.bulkDetectarColunas(linhas, cab), cab).rows;
  }, { linhas: n }));
}

const G3 = 'Zona da Cloudflare (lib/zona.js)';
const snapPequeno = gerarSnapshot('cliente.com.br', 0);
const snapGrande = gerarSnapshot('cliente.com.br', 140);
const IP_NOVO = '149.18.102.39';
imprimir(medir(G3, `montar a zona proposta, ${snapPequeno.registros.length} registros (típico)`, () => Z.montarZonaProposta({ dominio: 'cliente.com.br', snapshot: snapPequeno, ipNovo: IP_NOVO }).registros));
imprimir(medir(G3, `montar a zona proposta, ${snapGrande.registros.length} registros`, () => Z.montarZonaProposta({ dominio: 'cliente.com.br', snapshot: snapGrande, ipNovo: IP_NOVO }).registros));
const scan = snapGrande.registros.filter((r, i) => i % 2 === 0);
imprimir(medir(G3, `unir scan (${scan.length}) e fotografia (${snapGrande.registros.length})`, () => Z.unirRegistros(scan, snapGrande.registros)));
const proposta = Z.montarZonaProposta({ dominio: 'cliente.com.br', snapshot: snapGrande, ipNovo: IP_NOVO });
const existentes = snapGrande.registros.map((r, i) => ({ ...r, id: `id${i}`, proxied: i % 7 === 0 }));
imprimir(medir(G3, `planejar a aplicação, ${existentes.length} existentes × ${proposta.registros.length} propostos`, () => Z.planejarAplicacao(existentes, proposta.registros, { remover: proposta.remover }).criar));

const G4 = 'Texto e domínio (renderer e lib/salesforce.js)';
const entradas = Array.from({ length: 1000 }, (_, i) => [
  `cliente${i}.com.br`, `https://www.cliente${i}.com.br/contato?x=1`, `  WWW.CLIENTE${i}.COM.BR. `, `cliente${i}`, '',
][i % 5]);
imprimir(medir(G4, 'normalizar 1000 domínios de todo jeito', () => entradas.map(A.normalizeDomain), { linhas: 1000 }));
const links = Array.from({ length: 1000 }, (_, i) => (i % 3 ? `https://idealplus.idealtrends.io/clientes/${i}/hub?projeto=${i}` : `https://outro.site/${i}`));
imprimir(medir(G4, 'conferir 1000 links do painel', () => links.map(A.normalizePainelUrl), { linhas: 1000 }));
const comentario = `Publicação do site clinicasaojoao.com.br concluída. ${'Ajustes de SEO, formulário e Analytics. '.repeat(50)}`;
imprimir(medir(G4, 'achar o domínio num comentário de 2 KB (tarefa antiga)', () => SF.textoTemDominio(comentario, 'clinicasaojoao.com.br')));
imprimir(medir(G4, 'nome base da empresa (sem LTDA, ME, acento)', () => SF.nomeBaseEmpresa('CLÍNICA SÃO JOÃO DE ODONTOLOGIA LTDA - ME')));

// ---------- dependências: cada medida num processo novo ----------
//
// require() fica em cache, então medir aqui dentro mediria a segunda vez. Cada
// rodada abre um processo do zero, igual à abertura do app.
const G5 = 'Carregar dependências (processo novo a cada rodada, como na abertura do app)';
// A versão que o main.js pede de cada API (lib/google.js carrega no primeiro uso).
const VERSOES_USADAS = { tagmanager: 'v2', analyticsadmin: 'v1beta', siteVerification: 'v1', searchconsole: 'v1', recaptchaenterprise: 'v1', oauth2: 'v2' };
const DEPENDENCIAS = [
  { nome: 'googleapis inteiro (o main.js até a ADR-107)', codigo: "require('googleapis');" },
  { nome: 'lib/google.js ao abrir (o main.js hoje)', codigo: "require('./lib/google');" },
  { nome: 'lib/google.js no primeiro uso das 6 APIs e do auth', codigo: `const { google } = require('./lib/google'); google.auth.GoogleAuth; for (const [n, v] of Object.entries(${JSON.stringify(VERSOES_USADAS)})) google[n](v);` },
  { nome: 'xlsx', codigo: "require('xlsx');" },
  { nome: 'lib/ do Hub (zona, salesforce, painel-achar, cloudflare)', codigo: "for (const f of ['zona','salesforce','painel-achar','cloudflare']) require('./lib/' + f);" },
];
const RODADAS_DEP = RAPIDO ? 3 : 5;
const dependencias = [];
console.log(`\n${G5}`);
console.log(`  ${'o que'.padEnd(58)} ${'mediana'.padStart(9)} ${'1ª vez'.padStart(9)} ${'heap JS'.padStart(10)} ${'RAM (RSS)'.padStart(10)}`);
for (const d of DEPENDENCIAS) {
  const codigo = `const m0 = process.memoryUsage(); const t = process.hrtime.bigint(); ${d.codigo}
const ms = Number(process.hrtime.bigint() - t) / 1e6; global.gc && gc(); const m1 = process.memoryUsage();
process.stdout.write(JSON.stringify({ ms, heap: m1.heapUsed - m0.heapUsed, rss: m1.rss - m0.rss }));`;
  const medidas = [];
  for (let i = 0; i < RODADAS_DEP; i++) {
    const r = spawnSync(process.execPath, ['--expose-gc', '-e', codigo], { cwd: ROOT, encoding: 'utf-8', env: process.env, windowsHide: true });
    try { medidas.push(JSON.parse(r.stdout)); } catch (e) { throw new Error(`falhou ao medir ${d.nome}: ${r.stderr || r.stdout}`); }
  }
  const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const res = { nome: d.nome, rodadas: medidas, medianaMs: mediana(medidas.map((m) => m.ms)), primeiraMs: medidas[0].ms, heapMB: mediana(medidas.map((m) => m.heap)) / 2 ** 20, rssMB: mediana(medidas.map((m) => m.rss)) / 2 ** 20 };
  dependencias.push(res);
  console.log(`  ${d.nome.padEnd(58)} ${`${res.medianaMs.toFixed(0)} ms`.padStart(9)} ${`${res.primeiraMs.toFixed(0)} ms`.padStart(9)} ${`${res.heapMB >= 0 ? "+" : ""}${res.heapMB.toFixed(1)} MB`.padStart(10)} ${`${res.rssMB >= 0 ? "+" : ""}${res.rssMB.toFixed(1)} MB`.padStart(10)}`);
}

console.log(`\n± é a margem da média com 95% de confiança. "por linha" é a média dividida pelas linhas da planilha.`);
if (saidaJson) {
  fs.writeFileSync(path.resolve(saidaJson), JSON.stringify({
    quando: new Date().toISOString(),
    runtime: { electron: process.versions.electron || null, node: process.versions.node, v8: process.versions.v8 },
    maquina: { cpu: cpu[0].model.trim(), nucleos: cpu.length, memoriaGB: os.totalmem() / 2 ** 30, so: `${os.type()} ${os.release()}` },
    resultados,
    dependencias,
  }, null, 2));
  console.log(`Resultado em ${path.resolve(saidaJson)}`);
}
if (sink === 0.5) console.log(''); // nunca: só para o sink ser lido
