// Gera (ou refaz) o índice no alto de docs/ADR.md (ADR-156): uma linha por
// ADR, na ordem em que estão no arquivo, entre as marcas
// <!-- indice:inicio --> e <!-- indice:fim -->. O resto do arquivo não é
// tocado. Rode depois de escrever uma ADR nova:
//
//     node tools/indice-adr.js
//     node tools/indice-adr.js --conferir   (sai com 1 se o índice está desatualizado)

const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '..', 'docs', 'ADR.md');
const INICIO = '<!-- indice:inicio (gerado por tools/indice-adr.js; não edite à mão) -->';
const FIM = '<!-- indice:fim -->';

function montarIndice(texto) {
  const linhas = texto.split('\n');
  const itens = [];
  for (const l of linhas) {
    const m = /^## (ADR-\d+) — (.+)$/.exec(l);
    if (m) itens.push(`- **${m[1]}** — ${m[2].trim()}`);
    else if (/^## Pendências conhecidas/.test(l)) itens.push('- **Pendências conhecidas** (não são decisões — são dívidas)');
  }
  return `${INICIO}\n## Índice\n\n${itens.length} entrada(s), na ordem do arquivo. Ctrl+F pelo número leva à decisão.\n\n${itens.join('\n')}\n${FIM}`;
}

function aplicar(texto) {
  const bloco = montarIndice(texto);
  const i = texto.indexOf(INICIO), f = texto.indexOf(FIM);
  if (i >= 0 && f > i) return texto.slice(0, i) + bloco + texto.slice(f + FIM.length);
  // Primeira vez: logo depois do primeiro "---" do cabeçalho.
  const sep = texto.indexOf('\n---\n');
  if (sep < 0) throw new Error('não achei o "---" do cabeçalho da ADR');
  return texto.slice(0, sep + 5) + '\n' + bloco + '\n' + texto.slice(sep + 5);
}

if (require.main === module) {
  const texto = fs.readFileSync(ARQUIVO, 'utf-8');
  const novo = aplicar(texto);
  if (process.argv.includes('--conferir')) {
    if (novo === texto) { console.log('Índice da ADR em dia.'); process.exit(0); }
    console.log('Índice da ADR desatualizado: rode node tools/indice-adr.js'); process.exit(1);
  }
  if (novo === texto) { console.log('Índice da ADR já estava em dia.'); }
  else { fs.writeFileSync(ARQUIVO, novo); console.log('Índice da ADR refeito.'); }
}

module.exports = { montarIndice, aplicar, INICIO, FIM };
