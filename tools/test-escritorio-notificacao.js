// ADR-155: a notificação do Windows quando nasce uma pendência. Recorta
// notificarEscritorio do main.js e roda com uma Notification falsa: avisa só
// na pendência NOVA (não quando outra tarefa entra numa já aberta), com a
// pergunta no corpo; respeita o desligado da configuração; o clique traz a
// janela e manda abrir as pendências; sem suporte a notificação, não quebra.
//
//     node tools/test-escritorio-notificacao.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const i = src.indexOf('function notificarEscritorio(');
const f = src.indexOf('\n}\n', i);
if (i < 0 || f < 0) throw new Error('não achei notificarEscritorio');
const corpo = src.slice(i, f + 2);

const mostradas = [];
let suportada = true;
class Notification {
  static isSupported() { return suportada; }
  constructor(op) { this.op = op; this.handlers = {}; }
  on(ev, fn) { this.handlers[ev] = fn; }
  show() { mostradas.push(this); }
  clicar() { this.handlers.click && this.handlers.click(); }
}
const win = { minimizada: true, mostrada: false, focada: false, isMinimized() { return this.minimizada; }, restore() { this.minimizada = false; }, show() { this.mostrada = true; }, focus() { this.focada = true; } };
const enviados = [];
let configIa = { notificar: true };
const ctx = {
  String, Notification, console,
  readIaConfig: () => configIa,
  escritorio: { loja: { pendencias: () => [{ id: 'P-7', pergunta: 'Ativação de SSL vai para quem?' }] } },
  janelaPrincipal: () => win,
  escritorioEnviar: (canal, dados) => enviados.push([canal, dados]),
};
vm.createContext(ctx);
vm.runInContext(corpo, ctx);

console.log('\n=== Quando avisa ===');
check('pendência nova: mostra a notificação com o id no título e a pergunta no corpo', ctx.notificarEscritorio({ tipo: 'pendencia', id: 'P-7', nova: true }) === true && mostradas.length === 1 && /P-7/.test(mostradas[0].op.title) && mostradas[0].op.body === 'Ativação de SSL vai para quem?');
check('tarefa entrando numa pendência já aberta (nova: false) não avisa', ctx.notificarEscritorio({ tipo: 'pendencia', id: 'P-7', nova: false }) === false && mostradas.length === 1);
check('outros eventos não avisam', ctx.notificarEscritorio({ tipo: 'tarefa', id: 'x' }) === false && ctx.notificarEscritorio(null) === false && mostradas.length === 1);
check('pendência que a loja não acha ainda avisa, com um corpo genérico', ctx.notificarEscritorio({ tipo: 'pendencia', id: 'P-99', nova: true }) === true && /pergunta para você/.test(mostradas[1].op.body));

console.log('\n=== O clique ===');
mostradas[0].clicar();
check('o clique restaura, mostra e foca a janela', !win.minimizada && win.mostrada && win.focada);
check('e manda a tela abrir o Escritório nas pendências', enviados.length === 1 && enviados[0][0] === 'escritorio:abrir' && enviados[0][1].gaveta === 'pendencias');

console.log('\n=== Desligado e sem suporte ===');
configIa = { notificar: false };
check('com notificar: false na configuração, não avisa', ctx.notificarEscritorio({ tipo: 'pendencia', id: 'P-7', nova: true }) === false && mostradas.length === 2);
configIa = { notificar: true };
suportada = false;
check('sem suporte do sistema, não avisa e não quebra', ctx.notificarEscritorio({ tipo: 'pendencia', id: 'P-7', nova: true }) === false);

console.log('\n=== O orquestrador marca a pendência nova ===');
const orq = fs.readFileSync(path.join(__dirname, '..', 'lib', 'escritorio', 'orquestrador.js'), 'utf8');
check('abrirPendencia emite nova: true só quando cria a pendência', /let nova = false;[\s\S]*?nova = true;[\s\S]*?emitir\(\{ tipo: 'pendencia', id: p\.id, nova \}\)/.test(orq));
check('a configuração da IA nasce com notificar ligado e aceita desligar', (() => { const Ia = require('../lib/escritorio/ia'); return Ia.configPadrao().notificar === true && Ia.normalizarConfig({ notificar: false }).notificar === false && Ia.normalizarConfig({}).notificar === true; })());

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
