// ADR-124: o vigia da lista de espera não confere antes da previsão do
// Registro.br e dorme até a previsão mais próxima. Recorta a decisão exata do
// vigiarEsperas (app.js) para testar sem o app.
//
//     node tools/test-vigia.js

const fs = require('fs');
const path = require('path');

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const src = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');
const MIN = 60 * 1000;
// As constantes são expressões (30 * 60 * 1000): avalia como o app avalia.
const constante = (nome) => { const m = src.match(new RegExp('const ' + nome + ' = ([^;]+);')); return m ? new Function('return (' + m[1] + ')')() : NaN; };
const ESPERA_PASSO_MS = constante('ESPERA_PASSO_MS');
const ESPERA_DORMIR_MAX_MS = constante('ESPERA_DORMIR_MAX_MS');
check('ESPERA_PASSO_MS é 1 min', ESPERA_PASSO_MS === MIN, String(ESPERA_PASSO_MS));
check('ESPERA_DORMIR_MAX_MS existe no app.js (teto de 30 min)', ESPERA_DORMIR_MAX_MS === 30 * MIN, String(ESPERA_DORMIR_MAX_MS));

// As duas decisões, como estão no vigiarEsperas.
const quemConferir = (esperas, t) => esperas.filter((e) => e.status === 'esperando' && !(e.ate > t)).sort((a, b) => a.ate - b.ate).map((e) => e.dominio);
const quantoDormir = (esperas, agora) => {
  const esperando = esperas.filter((e) => e.status === 'esperando');
  const algumaVencida = esperando.some((e) => !(e.ate > agora));
  if (algumaVencida) return ESPERA_PASSO_MS;
  const proxima = Math.min(...esperando.map((e) => e.ate));
  return Math.max(ESPERA_PASSO_MS, Math.min(proxima - agora, ESPERA_DORMIR_MAX_MS));
};

const agora = Date.now();
const em = (min) => agora + min * MIN;

console.log('\n=== Quem é conferido ===');
check('site com previsão daqui a 2h NÃO é conferido agora', quemConferir([{ dominio: 'a', status: 'esperando', ate: em(120) }], agora).length === 0);
check('site cuja previsão já passou É conferido', quemConferir([{ dominio: 'b', status: 'esperando', ate: em(-1) }], agora).join() === 'b');
check('sem previsão (ate ausente) é conferido (comportamento antigo)', quemConferir([{ dominio: 'c', status: 'esperando' }], agora).join() === 'c');
check('mistura: só os vencidos, do mais cedo para o mais tarde', quemConferir([
  { dominio: 'tarde', status: 'esperando', ate: em(-5) }, { dominio: 'futuro', status: 'esperando', ate: em(90) }, { dominio: 'cedo', status: 'esperando', ate: em(-20) },
], agora).join() === 'cedo,tarde');
check('concluído/falhou não entram', quemConferir([{ dominio: 'x', status: 'concluido', ate: em(-9) }, { dominio: 'y', status: 'falhou', ate: em(-9) }], agora).length === 0);

console.log('\n=== Quanto dormir ===');
check('todos no futuro (2h): dorme o teto de 30 min, não 1 min', quantoDormir([{ status: 'esperando', ate: em(120) }], agora) === 30 * MIN);
check('previsão daqui a 7 min: dorme 7 min', quantoDormir([{ status: 'esperando', ate: em(7) }], agora) === 7 * MIN);
check('previsão daqui a 20 s: dorme no mínimo 1 min', quantoDormir([{ status: 'esperando', ate: agora + 20000 }], agora) === ESPERA_PASSO_MS);
check('algum já vencido: cadência de 1 min (está conferindo)', quantoDormir([{ status: 'esperando', ate: em(-1) }, { status: 'esperando', ate: em(120) }], agora) === ESPERA_PASSO_MS);
check('dois no futuro: dorme até o mais próximo', quantoDormir([{ status: 'esperando', ate: em(50) }, { status: 'esperando', ate: em(12) }], agora) === 12 * MIN);

// Conta: num site de 2h, quantas conferências DNS antes da previsão?
console.log('\n=== Custo numa espera de 2h ===');
let t = agora, conferencias = 0, ciclos = 0;
const lista = [{ dominio: 'z', status: 'esperando', ate: em(120) }];
while (t < em(120) && ciclos < 1000) { conferencias += quemConferir(lista, t).length; t += quantoDormir(lista, t); ciclos++; }
check('ZERO conferências DNS antes da previsão (antes eram ~120)', conferencias === 0, String(conferencias));
check('acorda poucas vezes (≤ 5) em vez de 120', ciclos <= 5, String(ciclos));

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
