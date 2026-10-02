// ADR-138: os indicadores da tela inicial — janelas de período, buckets,
// agregação (criadas, concluídas, publicações, SLA) e o SVG das colunas.
//
//     node tools/test-metricas.js

const path = require('path');
const M = require(path.join(__dirname, '..', 'lib', 'metricas'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// Uma quinta-feira, 01/10/2026 às 14:30 local.
const AGORA = new Date(2026, 9, 1, 14, 30);
const iso = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi).toISOString();

console.log('\n=== Janelas ===');
{
  const dia = M.janela('dia', AGORA);
  check('dia: 24 buckets de uma hora, começando à meia-noite de hoje', dia.buckets.length === 24 && dia.inicio.getHours() === 0 && dia.inicio.getDate() === 1 && dia.buckets[8].rotulo === '08h', JSON.stringify(dia.buckets[8]));
  const sem = M.janela('semana', AGORA);
  check('semana: 7 dias terminando hoje', sem.buckets.length === 7 && sem.buckets[6].inicio.getDate() === 1 && sem.buckets[0].inicio.getDate() === 25 && sem.buckets[0].inicio.getMonth() === 8, sem.buckets.map((b) => b.rotulo).join(','));
  check('  rótulo com o dia da semana', sem.buckets[6].rotulo === 'qui 01' && sem.buckets[0].rotulo === 'sex 25', sem.buckets.map((b) => b.rotulo).join(','));
  const mes = M.janela('mes', AGORA);
  check('mês: 30 dias, rótulo dd/mm', mes.buckets.length === 30 && mes.buckets[0].rotulo === '02/09' && mes.buckets[29].rotulo === '01/10', mes.buckets[0].rotulo);
  const ano = M.janela('ano', AGORA);
  check('ano: 12 meses, do mesmo mês do ano passado até este', ano.buckets.length === 12 && ano.buckets[0].rotulo === 'nov/25' && ano.buckets[11].rotulo === 'out/26', ano.buckets.map((b) => b.rotulo).join(','));
  check('  último bucket termina no mês que vem', ano.buckets[11].fim.getMonth() === 10 && ano.buckets[11].fim.getDate() === 1);
  check('período desconhecido vira semana', M.janela('xpto', AGORA).periodo === 'semana');
}

console.log('\n=== indiceBucket ===');
{
  const sem = M.janela('semana', AGORA);
  check('hoje de manhã cai no último bucket', M.indiceBucket(sem, iso(2026, 10, 1, 9)) === 6);
  check('há 6 dias cai no primeiro', M.indiceBucket(sem, iso(2026, 9, 25, 23, 59)) === 0);
  check('há 7 dias fica fora', M.indiceBucket(sem, iso(2026, 9, 24, 23, 59)) === -1);
  check('no futuro fica fora', M.indiceBucket(sem, iso(2026, 10, 1, 15)) === -1);
  check('data inválida fica fora', M.indiceBucket(sem, 'nada') === -1);
  const dia = M.janela('dia', AGORA);
  check('dia: 14:05 cai no bucket das 14h', M.indiceBucket(dia, iso(2026, 10, 1, 14, 5)) === 14);
  const ano = M.janela('ano', AGORA);
  check('ano: 15/11/2025 cai no primeiro mês', M.indiceBucket(ano, iso(2025, 11, 15)) === 0);
  check('ano: 31/10/2025 fica fora', M.indiceBucket(ano, iso(2025, 10, 31)) === -1);
}

console.log('\n=== Agregação ===');
{
  const T = (criada, concluida, over = {}) => ({ fechada: !!concluida, criada, concluida: concluida || null, publicacao: false, ...over });
  const tarefas = [
    T(iso(2026, 9, 28, 9), iso(2026, 9, 30, 9), { publicacao: true }),      // 48h, concluída ter 30
    T(iso(2026, 9, 29, 10), iso(2026, 9, 30, 12)),                           // 26h, concluída ter 30
    T(iso(2026, 9, 30, 8), iso(2026, 10, 1, 8), { publicacao: true }),       // 24h, concluída qui 01
    T(iso(2026, 9, 30, 15), null),                                            // aberta, criada ter 30
    T(iso(2026, 9, 1, 9), iso(2026, 9, 26, 9), { publicacao: true }),        // criada fora da semana, concluída sáb 26 (600h)
    T(iso(2026, 9, 1, 9), null),                                              // aberta, criada fora da semana
    { fechada: true, criada: iso(2026, 9, 29, 9), concluida: null },          // fechada sem data de conclusão: não conta
  ];
  const sem = M.janela('semana', AGORA);
  const a = M.agregar(tarefas, sem);
  check('criadas por dia: 1 (seg 28) 2 (ter 29) 2 (qua 30)', a.criadas.join() === '0,0,0,1,2,2,0', a.criadas.join());
  check('concluídas por dia', a.concluidas.join() === '0,1,0,0,0,2,1', a.concluidas.join());
  check('publicações por dia (só as concluídas de publicação)', a.publicacoes.join() === '0,1,0,0,0,1,1', a.publicacoes.join());
  check('totais', a.totais.criadas === 5 && a.totais.concluidas === 4 && a.totais.publicacoes === 3 && a.totais.abertasAgora === 2, JSON.stringify(a.totais));
  check('SLA médio = média de 48, 26, 24, 600 horas', Math.round(a.totais.slaMediaHoras) === 175 && a.totais.slaN === 4, String(a.totais.slaMediaHoras));
  check('SLA mediana = (26+48)/2 = 37h', a.totais.slaMedianaHoras === 37, String(a.totais.slaMedianaHoras));
  check('SLA por bucket: ter 30 = (48+26)/2 = 37; qui 01 = 24; sem conclusão = null', a.slaHoras[5] === 37 && a.slaHoras[6] === 24 && a.slaHoras[0] === null, a.slaHoras.join());
  check('abertasAgora não depende do período', M.agregar(tarefas, M.janela('dia', AGORA)).totais.abertasAgora === 2);
  const dia = M.agregar(tarefas, M.janela('dia', AGORA));
  check('dia: só a concluída de hoje às 08h', dia.concluidas[8] === 1 && dia.totais.concluidas === 1 && dia.totais.publicacoes === 1, dia.concluidas.join());
  check('vazio não quebra', M.agregar([], sem).totais.slaMediaHoras === null && M.agregar(null, sem).totais.criadas === 0);
}

console.log('\n=== Formatação ===');
{
  check('formatarHoras', M.formatarHoras(0.5) === '30min' && M.formatarHoras(3.25) === '3h 15min' && M.formatarHoras(5) === '5h' && M.formatarHoras(52) === '2d 4h' && M.formatarHoras(48) === '2d' && M.formatarHoras(null) === '—', [0.5, 3.25, 5, 52, 48].map(M.formatarHoras).join(' | '));
  check('formatarHoras arredonda 23h59min59 para 1d', M.formatarHoras(23.9999) === '1d' && M.formatarHoras(47.9999) === '2d' && M.formatarHoras(0.9999) === '1h', [23.9999, 47.9999, 0.9999].map(M.formatarHoras).join(' | '));
  check('tetoBonito', M.tetoBonito(7) === 10 && M.tetoBonito(13) === 20 && M.tetoBonito(42) === 50 && M.tetoBonito(3) === 5 && M.tetoBonito(1) === 1 && M.tetoBonito(0) === 1 && M.tetoBonito(175) === 200);
  check('horasAte: conclusão antes da criação é null', M.horasAte(iso(2026, 1, 2), iso(2026, 1, 1)) === null && M.horasAte(iso(2026, 1, 1, 0), iso(2026, 1, 1, 6)) === 6);
}

console.log('\n=== SVG das colunas ===');
{
  const svg = M.svgColunas({ valores: [0, 3, 7, 2], rotulos: ['a', 'b', 'c', 'd'] });
  check('um grupo por bucket, cada um com alvo de hover (data-i)', (svg.match(/class="mt-col" data-i=/g) || []).length === 4 && (svg.match(/class="mt-hit"/g) || []).length === 4);
  check('coluna zero não desenha barra; as outras sim', (svg.match(/class="mt-bar"/g) || []).length === 3);
  check('rótulo direto só na maior coluna', (svg.match(/mt-val/g) || []).length === 1 && /mt-val"[^>]*>7</.test(svg));
  check('grade hairline em 0, metade e teto (teto 10)', (svg.match(/class="mt-grid"/g) || []).length === 3 && /mt-tick"[^>]*>10</.test(svg) && /mt-tick"[^>]*>5</.test(svg));
  check('rótulos do eixo x', /mt-rot"[^>]*>a</.test(svg) && /mt-rot"[^>]*>d</.test(svg));
  check('sem linha quando não há segunda série', !/mt-line/.test(svg));
  const comLinha = M.svgColunas({ valores: [1, 2], linha: [3, 1], rotulos: ['x', 'y'] });
  check('com a segunda série: polyline + ponto no fim, teto pelo maior dos dois (5)', /mt-line/.test(comLinha) && /mt-dot/.test(comLinha) && /mt-tick"[^>]*>5</.test(comLinha));
  const cada = M.svgColunas({ valores: new Array(24).fill(1), rotulos: Array.from({ length: 24 }, (_, i) => `${i}h`), cadaRotulo: 6 });
  check('cadaRotulo: 24 horas viram 4 rótulos', (cada.match(/mt-rot/g) || []).length === 4);
  check('texto escapado', /&lt;b&gt;/.test(M.svgColunas({ valores: [1], rotulos: ['<b>'] })));
  check('largura das colunas respeita o teto de 24px', !/H\d+\.?\d*/.test(svg) || (svg.match(/class="mt-bar" d="M([\d.]+),[\d.]+ V[\d.]+ Q[\d.]+,[\d.]+ [\d.]+,[\d.]+ H([\d.]+)/) || []).length > 0);
  const larga = M.svgColunas({ valores: [5, 2], largura: 320 });
  const m = larga.match(/class="mt-bar" d="M([\d.]+),[\d.]+ V[\d.]+ Q[\d.]+,[\d.]+ ([\d.]+),[\d.]+ H([\d.]+)/);
  check('  com 2 colunas a barra tem 24px (4 de raio de cada lado + 16 de topo reto)', m && Math.round(Number(m[3]) - Number(m[1])) === 20, m && (Number(m[3]) - Number(m[1])));
  check('vazio devolve um svg válido sem colunas', /<svg/.test(M.svgColunas({ valores: [] })) && !/mt-col/.test(M.svgColunas({ valores: [] })));
  const cont = M.svgColunas({ valores: [1, 0], inteiros: true });
  check('contagem com teto 1: sem rótulo "0.5" no meio (a linha fica)', !/>0\.5</.test(cont) && (cont.match(/class="mt-grid"/g) || []).length === 3 && /mt-tick"[^>]*>1</.test(cont), cont.match(/mt-tick"[^>]*>[^<]*</g).join(' '));
  check('contagem com teto 10: o rótulo 5 do meio aparece', /mt-tick"[^>]*>5</.test(M.svgColunas({ valores: [7], inteiros: true })));
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
