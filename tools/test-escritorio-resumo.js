// ADR-155: o resumo "Hoje / 7 dias" do Escritório conta pelo histórico:
// feita por agente (execução ok e estado concluída), feita à mão ("tratada
// por você"), ignorada, falhas, pendências criadas e abertas, tempo médio da
// fila até a execução. O que aconteceu fora do período não conta.
//
//     node tools/test-escritorio-resumo.js

const R = require('../lib/escritorio/resumo');

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const agora = new Date('2026-10-14T15:00:00.000Z').getTime();
const h = (horasAtras) => new Date(agora - horasAtras * 3600000).toISOString();
const tarefas = [
  // Feita pelo Thor hoje, 20 min depois de entrar na fila.
  { id: 'a', estado: 'concluida', historico: [{ quando: h(2), tipo: 'fila' }, { quando: h(2 - 20 / 60), tipo: 'execucao', agente: 'publicador-mpiplus', ok: true, motivo: 'publicado' }, { quando: h(2 - 20 / 60), tipo: 'estado', de: 'executando', para: 'concluida' }] },
  // Feita pelo Tyr hoje, 40 min depois.
  { id: 'b', estado: 'concluida', historico: [{ quando: h(3), tipo: 'fila' }, { quando: h(3 - 40 / 60), tipo: 'execucao', agente: 'bloqueador', ok: true }] },
  // Falhou uma vez hoje e depois foi feita à mão (tratada).
  { id: 'c', estado: 'concluida', historico: [{ quando: h(5), tipo: 'fila' }, { quando: h(4), tipo: 'execucao', agente: 'hospedagem', ok: false, motivo: 'erro' }, { quando: h(1), tipo: 'estado', de: 'pendente', para: 'concluida', motivo: 'tratada por você' }] },
  // Ignorada hoje.
  { id: 'd', estado: 'ignorada', historico: [{ quando: h(6), tipo: 'fila' }, { quando: h(5.5), tipo: 'estado', de: 'em_analise', para: 'ignorada', motivo: 'regra' }] },
  // Feita por agente há 3 dias (conta na semana, não hoje).
  { id: 'e', estado: 'concluida', historico: [{ quando: h(72), tipo: 'fila' }, { quando: h(71), tipo: 'execucao', agente: 'publicador-mpiplus', ok: true }] },
  // Feita há 10 dias: fora dos dois períodos.
  { id: 'f', estado: 'concluida', historico: [{ quando: h(240), tipo: 'fila' }, { quando: h(239), tipo: 'execucao', agente: 'bloqueador', ok: true }] },
  // Executada ok mas depois reaberta (estado não é concluída): não conta como feita.
  { id: 'g', estado: 'pendente', historico: [{ quando: h(2), tipo: 'fila' }, { quando: h(1.5), tipo: 'execucao', agente: 'bloqueador', ok: true }] },
];
const pendencias = [
  { id: 'P-1', status: 'aberta', criadaEm: h(1) },
  { id: 'P-2', status: 'fechada', criadaEm: h(4) },
  { id: 'P-3', status: 'aberta', criadaEm: h(50) },
  { id: 'P-4', status: 'fechada', criadaEm: h(300) },
];

console.log('\n=== Hoje ===');
const r = R.resumir(tarefas, pendencias, agora);
check('2 feitas pelos agentes hoje (a e b); a reaberta não conta', r.hoje.pelosAgentes === 2, JSON.stringify(r.hoje));
check('1 feita à mão (tratada por você)', r.hoje.pelaMao === 1);
check('1 ignorada', r.hoje.ignoradas === 1);
check('1 falha e 4 execuções no dia (a, b, c falhou, g)', r.hoje.falhas === 1 && r.hoje.execucoes === 4, JSON.stringify(r.hoje));
check('por agente: Thor 1, Tyr 2 (b e g)', r.hoje.porAgente['publicador-mpiplus'] === 1 && r.hoje.porAgente.bloqueador === 2, JSON.stringify(r.hoje.porAgente));
check('tempo médio da fila à execução ≈ 30 min (20, 40 e 30 da g)', r.hoje.tempoMedioMin === 30, String(r.hoje.tempoMedioMin));
check('pendências: 2 criadas hoje, 2 abertas no total', r.hoje.pendenciasCriadas === 2 && r.hoje.pendenciasAbertas === 2);

console.log('\n=== Semana ===');
check('na semana entram também a de 3 dias (3 pelos agentes), não a de 10', r.semana.pelosAgentes === 3, String(r.semana.pelosAgentes));
check('3 pendências criadas na semana', r.semana.pendenciasCriadas === 3);
check('tempo médio da semana inclui a de 3 dias (60 min)', r.semana.tempoMedioMin === Math.round((20 + 40 + 30 + 60) / 4), String(r.semana.tempoMedioMin));

console.log('\n=== Frase e bordas ===');
check('a frase do HUD resume o dia', R.frase(r) === 'hoje: 2 pelos agentes · 1 à mão · 1 falha(s) · 2 pendência(s)', R.frase(r));
check('sem nada hoje, a frase diz isso', R.frase(R.resumir([], [], agora)) === 'hoje: nada ainda');
check('tarefas sem histórico e pendências nulas não quebram', R.resumir([{ id: 'x', estado: 'na_fila' }], [null], agora).hoje.pelosAgentes === 0);
check('calculadoEm é o instante pedido', r.calculadoEm === new Date(agora).toISOString());
check('o início do dia é meia-noite local', new Date(R.inicioDoDia(agora)).getHours() === 0);

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
