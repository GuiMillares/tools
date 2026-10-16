// Cores de fundo e de texto num .xlsx gerado pelo SheetJS (ADR-148, 16/10/2026).
//
// A edição gratuita do SheetJS (o `xlsx` do package.json) não grava estilo de
// célula. Aqui o .xlsx que ele gerou é aberto (é um .zip), o styles.xml ganha
// as fontes, os preenchimentos e os formatos de célula das cores pedidas, e as
// células recebem o atributo s="N". Só Node (zlib), sem dependência nova.
//
// aplicarCores(buffer, abas) — abas: uma entrada por planilha, na ordem do
// arquivo: { colunas: nº de colunas, cores: [{ linha, coluna, fundo, texto }] }
//   linha  = índice entre as linhas de dados (0 = a 1ª abaixo do cabeçalho);
//   coluna = índice da coluna, ou null para a linha inteira (até `colunas`);
//   fundo/texto = 'RRGGBB'.
// Entrada sem cores fica como está.

const zlib = require('zlib');

// ---------- .zip ----------

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// [{ nome, dados }] na ordem do diretório central.
function lerZip(buf) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error('o .xlsx não é um .zip válido (sem diretório central)');
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const entradas = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('diretório central do .zip corrompido');
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const lenNome = buf.readUInt16LE(p + 28);
    const lenExtra = buf.readUInt16LE(p + 30);
    const lenComent = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.slice(p + 46, p + 46 + lenNome).toString('utf-8');
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const bruto = buf.slice(ini, ini + tamComp);
    const dados = metodo === 0 ? Buffer.from(bruto) : metodo === 8 ? zlib.inflateRawSync(bruto) : null;
    if (!dados) throw new Error(`método de compressão ${metodo} não suportado (${nome})`);
    entradas.push({ nome, dados });
    p += 46 + lenNome + lenExtra + lenComent;
  }
  return entradas;
}

function gravarZip(entradas) {
  const locais = [];
  const centrais = [];
  let offset = 0;
  for (const e of entradas) {
    const nome = Buffer.from(e.nome, 'utf-8');
    const comp = zlib.deflateRawSync(e.dados);
    const crc = crc32(e.dados);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.dados.length, 22); lh.writeUInt16LE(nome.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(e.dados.length, 24); ch.writeUInt16LE(nome.length, 28); ch.writeUInt32LE(offset, 42);
    locais.push(lh, nome, comp);
    centrais.push(ch, nome);
    offset += 30 + nome.length + comp.length;
  }
  const dir = Buffer.concat(centrais);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entradas.length, 8); eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, dir, eocd]);
}

// ---------- Planilha ----------

const letraColuna = (i) => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const indiceColuna = (letras) => { let n = 0; for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const corOk = (c) => /^[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toUpperCase() : '';

// Os caminhos das planilhas na ordem do workbook.xml (pelos rels).
function caminhosDasPlanilhas(arquivos) {
  const wb = (arquivos.get('xl/workbook.xml') || Buffer.alloc(0)).toString('utf-8');
  const rels = (arquivos.get('xl/_rels/workbook.xml.rels') || Buffer.alloc(0)).toString('utf-8');
  const alvo = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/\bId="([^"]+)"/) || [])[1];
    const t = (m[0].match(/\bTarget="([^"]+)"/) || [])[1];
    if (id && t) alvo[id] = t.startsWith('/') ? t.slice(1) : `xl/${t}`;
  }
  const out = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const id = (m[0].match(/\br:id="([^"]+)"/) || [])[1];
    if (id && alvo[id]) out.push(alvo[id]);
  }
  return out;
}

// Acrescenta fonte, preenchimento e formato para cada par (fundo, texto) e
// devolve o índice do formato (o s="N" da célula).
function prepararEstilos(xml, pares) {
  const contar = (tag) => { const m = xml.match(new RegExp(`<${tag} count="(\\d+)"`)); return m ? Number(m[1]) : 0; };
  let fontes = contar('fonts');
  let fills = contar('fills');
  let xfs = contar('cellXfs');
  const novasFontes = [];
  const novosFills = [];
  const novosXfs = [];
  const indice = new Map();
  for (const chave of pares) {
    const [fundo, texto] = chave.split('/');
    let fontId = 0;
    if (texto) { novasFontes.push(`<font><sz val="12"/><color rgb="FF${texto}"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`); fontId = fontes++; }
    let fillId = 0;
    if (fundo) { novosFills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${fundo}"/><bgColor indexed="64"/></patternFill></fill>`); fillId = fills++; }
    novosXfs.push(`<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"${texto ? ' applyFont="1"' : ''}${fundo ? ' applyFill="1"' : ''}/>`);
    indice.set(chave, xfs++);
  }
  const anexar = (x, tag, novos, total) => {
    if (!novos.length) return x;
    if (!new RegExp(`<${tag} count="\\d+"`).test(x)) throw new Error(`styles.xml sem <${tag}>`);
    return x.replace(new RegExp(`<${tag} count="\\d+"`), `<${tag} count="${total}"`).replace(`</${tag}>`, `${novos.join('')}</${tag}>`);
  };
  let out = anexar(xml, 'fonts', novasFontes, fontes);
  out = anexar(out, 'fills', novosFills, fills);
  out = anexar(out, 'cellXfs', novosXfs, xfs);
  return { xml: out, indice };
}

// Põe s="N" nas células pedidas, criando as vazias que faltam na linha.
function pintarPlanilha(xml, alvos) {
  // alvos: Map(nº da linha no Excel → Map(índice da coluna → s))
  const reLinha = /<row\b[^>]*\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
  const vistas = new Set();
  let out = xml.replace(reLinha, (inteira, nStr, conteudo) => {
    const n = Number(nStr);
    const pedido = alvos.get(n);
    if (!pedido) return inteira;
    vistas.add(n);
    const abre = inteira.match(/^<row\b[^>]*?(?=\/?>)/)[0];
    const celulas = [];
    for (const m of String(conteudo || '').matchAll(/<c\b[^>]*?\br="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) celulas.push({ col: indiceColuna(m[1]), xml: m[0] });
    const porCol = new Map(celulas.map((c) => [c.col, c]));
    for (const [col, s] of pedido) {
      const c = porCol.get(col);
      if (c) {
        c.xml = /^<c\b[^>]*?\ss="\d+"/.test(c.xml) ? c.xml.replace(/^(<c\b[^>]*?\s)s="\d+"/, `$1s="${s}"`) : c.xml.replace(/^<c\b/, `<c s="${s}"`);
      } else {
        const nova = { col, xml: `<c r="${letraColuna(col)}${n}" s="${s}"/>` };
        celulas.push(nova); porCol.set(col, nova);
      }
    }
    celulas.sort((a, b) => a.col - b.col);
    return `${abre}>${celulas.map((c) => c.xml).join('')}</row>`;
  });
  // Linha pedida que não existe no arquivo (toda vazia): cria no lugar certo.
  const faltam = [...alvos.keys()].filter((n) => !vistas.has(n)).sort((a, b) => a - b);
  for (const n of faltam) {
    const cel = [...alvos.get(n)].sort((a, b) => a[0] - b[0]).map(([col, s]) => `<c r="${letraColuna(col)}${n}" s="${s}"/>`).join('');
    const nova = `<row r="${n}">${cel}</row>`;
    const depois = [...out.matchAll(/<row\b[^>]*\br="(\d+)"/g)].find((m) => Number(m[1]) > n);
    if (depois) out = out.slice(0, depois.index) + nova + out.slice(depois.index);
    else if (out.includes('</sheetData>')) out = out.replace('</sheetData>', `${nova}</sheetData>`);
    else out = out.replace(/<sheetData\s*\/>/, `<sheetData>${nova}</sheetData>`);
  }
  return out;
}

function aplicarCores(buffer, abas) {
  const lista = Array.isArray(abas) ? abas : [];
  if (!lista.some((a) => a && Array.isArray(a.cores) && a.cores.length)) return buffer;
  const entradas = lerZip(buffer);
  const arquivos = new Map(entradas.map((e) => [e.nome, e.dados]));
  const planilhas = caminhosDasPlanilhas(arquivos);
  const pares = [];
  for (const a of lista) for (const c of (a && a.cores) || []) {
    const k = `${corOk(c.fundo)}/${corOk(c.texto)}`;
    if (k !== '/' && !pares.includes(k)) pares.push(k);
  }
  const estilos = arquivos.get('xl/styles.xml');
  if (!estilos) throw new Error('o .xlsx não tem xl/styles.xml');
  const { xml: novoEstilo, indice } = prepararEstilos(estilos.toString('utf-8'), pares);
  arquivos.set('xl/styles.xml', Buffer.from(novoEstilo, 'utf-8'));
  lista.forEach((a, i) => {
    const caminho = planilhas[i];
    if (!a || !caminho || !arquivos.has(caminho) || !(a.cores || []).length) return;
    const alvos = new Map();
    for (const c of a.cores) {
      const s = indice.get(`${corOk(c.fundo)}/${corOk(c.texto)}`);
      if (s === undefined || !(Number.isInteger(c.linha) && c.linha >= 0)) continue;
      const n = c.linha + 2;
      const linha = alvos.get(n) || new Map();
      const cols = c.coluna === null || c.coluna === undefined ? Array.from({ length: Math.max(1, Number(a.colunas) || 1) }, (_, j) => j) : [c.coluna];
      for (const col of cols) linha.set(col, s);
      alvos.set(n, linha);
    }
    arquivos.set(caminho, Buffer.from(pintarPlanilha(arquivos.get(caminho).toString('utf-8'), alvos), 'utf-8'));
  });
  return gravarZip(entradas.map((e) => ({ nome: e.nome, dados: arquivos.get(e.nome) })));
}

module.exports = { aplicarCores, lerZip, gravarZip, crc32, letraColuna, indiceColuna, pintarPlanilha, prepararEstilos };
