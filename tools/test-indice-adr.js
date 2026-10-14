// ADR-156: o índice no alto da ADR. Monta o bloco a partir dos títulos "##
// ADR-NNN — …", entra depois do "---" do cabeçalho na primeira vez, é
// refeito no lugar nas seguintes (idempotente) e o --conferir do arquivo
// real está em dia.
//
//     node tools/test-indice-adr.js

const { execFileSync } = require('child_process');
const path = require('path');
const { montarIndice, aplicar, INICIO, FIM } = require('./indice-adr');

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const texto = '# ADR\n\nIntro.\n\n---\n\n## ADR-001 — Primeira\n\nx\n\n## ADR-002 — Segunda: com dois-pontos\n\ny\n\n## Pendências conhecidas (não são decisões — são dívidas)\n\n- z\n';
const bloco = montarIndice(texto);
check('lista cada ADR na ordem do arquivo e as pendências', /- \*\*ADR-001\*\* — Primeira\n- \*\*ADR-002\*\* — Segunda: com dois-pontos\n- \*\*Pendências conhecidas\*\*/.test(bloco) && /3 entrada\(s\)/.test(bloco));
const v1 = aplicar(texto);
check('na primeira vez entra logo depois do --- do cabeçalho', v1.indexOf(INICIO) > v1.indexOf('\n---\n') && v1.indexOf(INICIO) < v1.indexOf('## ADR-001'));
check('o resto do arquivo fica igual', v1.endsWith('\n- z\n') && v1.startsWith('# ADR\n\nIntro.'));
const v2 = aplicar(v1 + '\n## ADR-003 — Terceira\n');
check('na segunda vez refaz o bloco no lugar, sem duplicar as marcas', v2.split(INICIO).length === 2 && v2.split(FIM).length === 2 && /ADR-003\*\* — Terceira/.test(v2.slice(0, v2.indexOf(FIM))));
check('idempotente', aplicar(v2) === v2);
let saida = '';
try { saida = execFileSync(process.execPath, [path.join(__dirname, 'indice-adr.js'), '--conferir'], { encoding: 'utf-8' }); } catch (e) { saida = (e.stdout || '') + (e.stderr || ''); }
check('o índice do docs/ADR.md de verdade está em dia (rode node tools/indice-adr.js se não)', /em dia/.test(saida), saida.trim());

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
