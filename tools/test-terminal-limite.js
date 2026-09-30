// ADR-109: o terminal guarda na tela só as últimas linhas. Vai até
// LOG_TELA_MAX + LOG_TELA_FOLGA e volta a LOG_TELA_MAX de uma vez (corte em
// lote, que custa o mesmo que só acrescentar), com um aviso no topo dizendo
// onde está o resto; pergunta sem resposta nunca sai. Recorta o log() e o
// corte do renderer/app.js e roda com um DOM de mentira.
//
//     node tools/test-terminal-limite.js

const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');
const recorta = (fonte, a, b) => { const i = fonte.indexOf(a); const f = fonte.indexOf(b, i); if (i < 0 || f < 0) throw new Error('não achei ' + a); return fonte.slice(i, f); };

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// O mínimo de DOM que o log() e o corte usam.
class El {
  constructor() { this.children = []; this.parentNode = null; this.classes = new Set(); this.html = ''; this.scrollTop = 0; }
  set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  get classList() { return { contains: (c) => this.classes.has(c), add: (c) => this.classes.add(c) }; }
  set innerHTML(v) { this.html = String(v); if (this.html === '') { for (const c of this.children) c.parentNode = null; this.children = []; } }
  get innerHTML() { return this.html; }
  set textContent(v) { this.html = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  get childElementCount() { return this.children.length; }
  get firstElementChild() { return this.children[0] || null; }
  get nextElementSibling() { return this.parentNode ? this.parentNode.children[this.parentNode.children.indexOf(this) + 1] || null : null; }
  get scrollHeight() { return this.children.length * 18; }
  appendChild(c) { c.remove(); c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) { c.remove(); c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
}

const T = new Function('el', 'document', 'window', `
  ${recorta(app, 'function escapeHtml(', '\nfunction genId(')}
  ${recorta(app, 'const LOG_GLYPH = {', '\n// Uma pergunta dentro do terminal')}
  return { log, logBuffer, apararTerminal, LOG_TELA_MAX, LOG_TELA_FOLGA, LOG_BUFFER_MAX, LOG_AVISO_CORTE };
`);
const terminal = new El();
const R = T({ terminal }, { createElement: () => new El() }, { api: { gravarLog: async () => ({ ok: true }) } });
const MAX = R.LOG_TELA_MAX;
const FOLGA = R.LOG_TELA_FOLGA;
const linhas = () => terminal.children;
const avisos = () => linhas().filter((l) => l.classList.contains('log-cortado'));
const texto = (l) => (l ? l.innerHTML : '');
const numero = (l) => Number((texto(l).match(/\[(\d+)\]/) || [])[1]);

console.log('\n=== Até o limite com a folga, nada sai ===');
check('o limite da tela é o mesmo do buffer do recorte (3.000), com folga de 300', MAX === R.LOG_BUFFER_MAX && MAX === 3000 && FOLGA === 300, `${MAX} / ${R.LOG_BUFFER_MAX} / ${FOLGA}`);
for (let i = 1; i <= MAX + FOLGA; i++) R.log(`[${i}] linha`, i % 7 ? 'info' : 'warn');
check(`${MAX + FOLGA} linhas, ${MAX + FOLGA} na tela`, linhas().length === MAX + FOLGA, String(linhas().length));
check('sem aviso de corte', avisos().length === 0);

console.log('\n=== Passou: volta a 3.000 de uma vez, e o topo avisa ===');
R.log(`[${MAX + FOLGA + 1}] linha`, 'info');
check('a tela volta ao limite, mais o aviso', linhas().length === MAX + 1, String(linhas().length));
check('o aviso é a primeira linha', linhas()[0].classList.contains('log-cortado'));
check('e diz onde está o resto (o arquivo do dia)', /Documentos\\Hub\\logs/.test(texto(linhas()[0])) && /Documentos\\Hub\\logs/.test(R.LOG_AVISO_CORTE), texto(linhas()[0]));
check('saíram as 301 mais velhas', numero(linhas()[1]) === FOLGA + 2, texto(linhas()[1]));
check('a nova está no fim', numero(linhas()[linhas().length - 1]) === MAX + FOLGA + 1);

console.log('\n=== Entre um corte e outro, nada sai (é o que mantém o log() barato) ===');
for (let i = MAX + FOLGA + 2; i < MAX + 2 * FOLGA + 1; i++) R.log(`[${i}] linha`, 'info');
check('299 linhas depois, a tela só cresceu', linhas().length === MAX + FOLGA, String(linhas().length));
R.log(`[${MAX + 2 * FOLGA + 1}] linha`, 'info');
check('na seguinte, volta ao limite de uma vez', linhas().length === MAX + 1, String(linhas().length));

console.log('\n=== Rodando horas: a tela não cresce e o aviso não repete ===');
const ultima = MAX + 2 * FOLGA + 1 + 5000;
for (let i = MAX + 2 * FOLGA + 2; i <= ultima; i++) R.log(`[${i}] linha`, 'info');
const naTela = linhas().length - 1;
check(`fica entre ${MAX} e ${MAX + FOLGA} linhas`, naTela >= MAX && naTela <= MAX + FOLGA, String(naTela));
check('um aviso só', avisos().length === 1, String(avisos().length));
check('são as últimas, em sequência, até a mais nova', numero(linhas()[linhas().length - 1]) === ultima && numero(linhas()[1]) === ultima - naTela + 1, `${texto(linhas()[1])} ... ${texto(linhas()[linhas().length - 1])}`);
check('o buffer do recorte do histórico segue igual (3.000)', R.logBuffer.length === 3000 && R.logBuffer[0].message === `[${ultima - 2999}] linha`, `${R.logBuffer.length} ${R.logBuffer[0] && R.logBuffer[0].message}`);

console.log('\n=== Pergunta sem resposta nunca sai ===');
terminal.innerHTML = '';
const aberta = new El(); aberta.className = 'log-line ask'; aberta.html = 'De qual empresa é x.com.br?';
const respondida = new El(); respondida.className = 'log-line ask answered'; respondida.html = 'Pergunta de antes, já respondida';
terminal.appendChild(respondida);
terminal.appendChild(aberta);
// Com as duas perguntas já na tela, o corte cai exatamente na última destas.
for (let i = 1; i <= MAX + FOLGA - 1; i++) R.log(`[${i}] enquanto espera`, 'info');
check('a pergunta aberta continua na tela', linhas().includes(aberta));
check('logo depois do aviso, no topo', linhas()[1] === aberta, texto(linhas()[1]));
check('a já respondida saiu como qualquer linha', !linhas().includes(respondida));
check('e a tela voltou ao limite mesmo com ela', linhas().length === MAX + 1, String(linhas().length));

console.log('\n=== "Limpar" recomeça do zero ===');
terminal.innerHTML = '';
for (let i = 1; i <= MAX + FOLGA; i++) R.log(`[${i}] depois de limpar`, 'info');
check('limpo e cheio até o limite com a folga: sem aviso', avisos().length === 0 && linhas().length === MAX + FOLGA);
R.log('mais uma', 'info');
check('passou de novo: o aviso volta, uma vez', avisos().length === 1 && linhas()[0].classList.contains('log-cortado') && linhas().length === MAX + 1);

console.log('\n=== Corte grande não é quadrático ===');
{
  // Um terminal que já passou muito do limite (não acontece pelo log(), mas
  // é o pior caso do laço): 5 mil linhas cortadas numa chamada só. O que
  // prova é quantas vezes os filhos são contados, não o tamanho.
  terminal.innerHTML = '';
  for (let i = 1; i <= 8000; i++) { const l = new El(); l.className = 'log-line info'; l.html = `[${i}]`; terminal.children.push(l); l.parentNode = terminal; }
  let contagens = 0;
  const desc = Object.getOwnPropertyDescriptor(El.prototype, 'childElementCount');
  Object.defineProperty(terminal, 'childElementCount', { get() { contagens++; return desc.get.call(this); } });
  R.apararTerminal();
  delete terminal.childElementCount;
  check('volta ao limite', linhas().length === MAX + 1, String(linhas().length));
  check('contando os filhos só duas vezes, não a cada linha cortada', contagens <= 2, String(contagens));
}

console.log('\n=== Todo lugar que põe linha no terminal corta ===');
for (const [nome, inicio, fim] of [
  ['log()', 'function log(message', '\n}'],
  ['perguntarNoTerminal()', 'function perguntarNoTerminal(', '\n// Pergunta com resposta escrita'],
  ['perguntarTextoNoTerminal()', 'function perguntarTextoNoTerminal(', '\n// Marca o ponto atual do terminal'],
]) {
  const corpo = recorta(app, inicio, fim);
  check(`${nome} corta logo depois de pôr a linha`, /el\.terminal\.appendChild\([^;]+;\s*\n\s*apararTerminal\(\);/.test(corpo));
}
const appends = (app.match(/el\.terminal\.appendChild\(/g) || []).length;
check(`nenhum outro appendChild no terminal (${appends} no total)`, appends === 3, String(appends));

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
