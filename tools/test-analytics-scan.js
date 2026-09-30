// ADR-131: a varredura de data streams do Analytics. Recorta varrerDataStreams
// e mapLimit do main.js e roda com uma API falsa: prova que o cliente que fica
// depois da 600ª propriedade É achado, que a ordem é inversa (contas novas
// primeiro), que para ao achar e que o cache evita chamadas na 2ª busca.
//
//     node tools/test-analytics-scan.js

const fs = require('fs');
const path = require('path');
const os = require('os');

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
function funcao(nome) {
  let ini = src.indexOf('function ' + nome + '(');
  if (ini < 0) throw new Error('não achei function ' + nome);
  if (src.slice(ini - 6, ini) === 'async ') ini -= 6;
  // Pula a lista de parâmetros (pode ter `{ x = 1 } = {}`) até o `)` que fecha,
  // e só então casa as chaves do corpo.
  const abreParen = src.indexOf('(', ini); let np = 0, fechaParen = -1;
  for (let i = abreParen; i < src.length; i++) { if (src[i] === '(') np++; else if (src[i] === ')') { np--; if (np === 0) { fechaParen = i; break; } } }
  const abre = src.indexOf('{', fechaParen); let n = 0;
  for (let i = abre; i < src.length; i++) { if (src[i] === '{') n++; else if (src[i] === '}') { n--; if (n === 0) return src.slice(ini, i + 1); } }
  throw new Error('sem fechamento: ' + nome);
}
const constante = (nome) => { const m = src.match(new RegExp('const ' + nome + ' = ([^;]+);')); return m ? new Function('return (' + m[1] + ')')() : undefined; };

// Cache num arquivo temporário, em vez do userData do Electron.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-cache-'));
const cachePath = path.join(tmp, 'analytics-streams-cache.json');
const ctx = {
  fs, path, JSON, Array, Date, Math, Promise, String, Object, console, URL,
  app: { getPath: () => tmp },
  ANALYTICS_SCAN_LIMIT: constante('ANALYTICS_SCAN_LIMIT'),
  ANALYTICS_SCAN_CONCURRENCY: constante('ANALYTICS_SCAN_CONCURRENCY'),
  ANALYTICS_CACHE_VALIDO_MS: constante('ANALYTICS_CACHE_VALIDO_MS'),
  analyticsStreamsCachePath: () => cachePath,
};
const vm = require('vm');
vm.createContext(ctx);
for (const f of ['mapLimit', 'readAnalyticsStreamsCache', 'saveAnalyticsStreamsCache', 'varrerDataStreams', 'dominioDeUri']) vm.runInContext(f + ' = ' + funcao(f), ctx);

// 4844 propriedades em 83 contas ("Busca Cliente 01".."83"); o cliente
// procurado fica na "Busca Cliente 18" — depois das 600 primeiras.
const candidatas = [];
let n = 0;
for (let conta = 1; conta <= 83; conta++) for (let p = 0; p < 58 && candidatas.length < 4844; p++) {
  n++;
  candidatas.push({ account: `Busca Cliente ${String(conta).padStart(2, '0')}`, property: `properties/${n}`, displayName: `Busca Cliente ${conta}` });
}
const ALVO = 'properties/' + (17 * 58 + 30); // na conta 18
const posAlvo = candidatas.findIndex((c) => c.property === ALVO);
check('cenário: o alvo está depois da 600ª propriedade', posAlvo > 600, String(posAlvo));

let chamadas = 0;
const api = { properties: { dataStreams: { list: async ({ parent }) => {
  chamadas++;
  const dom = parent === ALVO ? 'www.polimentoalleanza.com.br' : `cliente${parent.split('/')[1]}.com.br`;
  return { data: { dataStreams: [{ displayName: dom, webStreamData: { measurementId: 'G-' + parent.split('/')[1], defaultUri: 'https://' + dom } }] } };
} } } };
const casa = (item, web) => web.some((w) => ctx.dominioDeUri(w.uri) === 'polimentoalleanza.com.br');
const push = () => {};

(async () => {
  console.log('\n=== 1ª busca (cache vazio) ===');
  const v1 = await ctx.varrerDataStreams(api, candidatas, casa, push);
  check('ACHA o cliente da "Busca Cliente 18" (antes: parava em 600 sem achar)', v1.achadas.length === 1 && v1.achadas[0].property === ALVO, JSON.stringify(v1.achadas.map((a) => a.property)));
  const TOTAL = candidatas.length;
  check('ordem inversa + parada: leu MUITO menos que o total (contas novas primeiro)', chamadas < TOTAL - posAlvo + 20, `chamadas=${chamadas} de ${TOTAL}`);
  check('ordem inversa de fato: leu ~ (total - posição) e não ~ posição', chamadas <= (TOTAL - posAlvo) + ctx.ANALYTICS_SCAN_CONCURRENCY + 1, `chamadas=${chamadas} esperado≈${TOTAL - posAlvo}`);
  check('devolve o measurementId do stream', v1.achadas[0].measurementIds[0].measurementId === 'G-' + ALVO.split('/')[1]);
  check('gravou o cache em disco', fs.existsSync(cachePath) && Object.keys(JSON.parse(fs.readFileSync(cachePath, 'utf8'))).length === v1.lidas);

  console.log('\n=== 2ª busca do MESMO cliente (cache quente) ===');
  const antes = chamadas;
  const v2 = await ctx.varrerDataStreams(api, candidatas, casa, push);
  check('acha pelo cache sem nenhuma chamada à API', v2.achadas.length === 1 && chamadas === antes, `chamadas novas=${chamadas - antes}`);

  console.log('\n=== Busca de outro cliente, das contas antigas (cache parcial) ===');
  const alvo2 = 'properties/5'; // conta 01, nunca lida (a 1ª busca parou ao achar na 18)
  const antes2 = chamadas;
  const v3 = await ctx.varrerDataStreams(api, candidatas, (i, web) => web.some((w) => ctx.dominioDeUri(w.uri) === 'cliente5.com.br'), push);
  check('acha um cliente que ainda não estava no cache', v3.achadas.length === 1 && v3.achadas[0].property === alvo2);
  check('só leu as que faltavam (não releu as já cacheadas)', chamadas - antes2 <= (posAlvo + 1) + ctx.ANALYTICS_SCAN_CONCURRENCY, `novas=${chamadas - antes2}`);

  console.log('\n=== Não existe ===');
  const antes3 = chamadas;
  const v4 = await ctx.varrerDataStreams(api, candidatas, () => false, push);
  check('sem casamento: varre tudo que falta e devolve 0, com o cache completo', v4.achadas.length === 0 && Object.keys(JSON.parse(fs.readFileSync(cachePath, 'utf8'))).length === candidatas.length, `lidas agora=${chamadas - antes3}`);
  check('parar() do mapLimit é respeitado (nada além do escopo)', chamadas <= candidatas.length + ctx.ANALYTICS_SCAN_CONCURRENCY * 3, String(chamadas));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
