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

console.log('\n=== Janelas (granularidade das colunas) ===');
{
  const dia = M.janela('dia', AGORA);
  check('dia: 30 colunas de um dia, de 02/09 a 01/10', dia.buckets.length === 30 && dia.buckets[0].rotulo === '02/09' && dia.buckets[29].rotulo === '01/10' && dia.inicio.getHours() === 0, dia.buckets.map((b) => b.rotulo).join(','));
  const sem = M.janela('semana', AGORA);
  check('semana: 12 colunas de 7 dias, segunda a domingo; a última começa em 28/09 (segunda)', sem.buckets.length === 12 && sem.buckets[11].inicio.getDate() === 28 && sem.buckets[11].inicio.getDay() === 1 && sem.buckets[11].rotulo === '28/09', sem.buckets.map((b) => b.rotulo).join(','));
  check('  a primeira começa 11 semanas antes (13/07) e cada uma dura 7 dias', sem.buckets[0].rotulo === '13/07' && (sem.buckets[0].fim - sem.buckets[0].inicio) === 7 * 86400000, sem.buckets[0].rotulo);
  const mes = M.janela('mes', AGORA);
  check('mês: 12 colunas de mês inteiro, nov/25 a out/26', mes.buckets.length === 12 && mes.buckets[0].rotulo === 'nov/25' && mes.buckets[11].rotulo === 'out/26' && mes.buckets[11].inicio.getDate() === 1, mes.buckets.map((b) => b.rotulo).join(','));
  check('  o último mês termina no dia 1 do mês seguinte', mes.buckets[11].fim.getMonth() === 10 && mes.buckets[11].fim.getDate() === 1);
  const ano = M.janela('ano', AGORA);
  check('ano: 3 colunas de ano inteiro, 2024 a 2026', ano.buckets.length === 3 && ano.buckets.map((b) => b.rotulo).join() === '2024,2025,2026' && ano.buckets[0].inicio.getMonth() === 0 && ano.buckets[2].fim.getFullYear() === 2027, ano.buckets.map((b) => b.rotulo).join(','));
  check('período desconhecido vira mês', M.janela('xpto', AGORA).periodo === 'mes');
  check('descrição da janela', mes.descricao === 'últimos 12 meses' && dia.descricao === 'últimos 30 dias');
  check('diasNecessarios: dia 30, semana 84, mês 366, ano 1100', M.diasNecessarios('dia') === 30 && M.diasNecessarios('semana') === 84 && M.diasNecessarios('mes') === 366 && M.diasNecessarios('ano') === 1100);
  check('inicioDaSemana de uma quinta é a segunda', M.inicioDaSemana(AGORA).getDate() === 28 && M.inicioDaSemana(new Date(2026, 9, 4)).getDate() === 28 && M.inicioDaSemana(new Date(2026, 9, 5)).getDate() === 5);
}

console.log('\n=== indiceBucket ===');
{
  const dia = M.janela('dia', AGORA);
  check('dia: hoje de manhã cai na última coluna', M.indiceBucket(dia, iso(2026, 10, 1, 9)) === 29);
  check('dia: 02/09 cai na primeira; 01/09 fica fora', M.indiceBucket(dia, iso(2026, 9, 2, 0, 1)) === 0 && M.indiceBucket(dia, iso(2026, 9, 1, 23, 59)) === -1);
  check('no futuro fica fora', M.indiceBucket(dia, iso(2026, 10, 1, 15)) === -1);
  check('data inválida fica fora', M.indiceBucket(dia, 'nada') === -1);
  const sem = M.janela('semana', AGORA);
  check('semana: domingo 27/09 é a penúltima; segunda 28/09 é a última', M.indiceBucket(sem, iso(2026, 9, 27, 23)) === 10 && M.indiceBucket(sem, iso(2026, 9, 28, 0, 1)) === 11);
  check('semana: 12/07 fica fora', M.indiceBucket(sem, iso(2026, 7, 12, 23)) === -1);
  const mes = M.janela('mes', AGORA);
  check('mês: 15/11/2025 cai no primeiro; 31/10/2025 fica fora', M.indiceBucket(mes, iso(2025, 11, 15)) === 0 && M.indiceBucket(mes, iso(2025, 10, 31)) === -1);
  const ano = M.janela('ano', AGORA);
  check('ano: 2024 é a primeira coluna, 2026 a última', M.indiceBucket(ano, iso(2024, 6, 1)) === 0 && M.indiceBucket(ano, iso(2026, 10, 1, 9)) === 2 && M.indiceBucket(ano, iso(2023, 12, 31)) === -1);
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
  // Colunas de um dia (02/09 … 01/10): o dia d/09 é a coluna d-2; 01/10 é a 29.
  const dia = M.janela('dia', AGORA);
  const a = M.agregar(tarefas, dia);
  const soma = (xs) => xs.reduce((s, x) => s + x, 0);
  check('criadas por dia: 1 em 28/09, 2 em 29/09, 2 em 30/09; as de 01/09 ficam fora', a.criadas[26] === 1 && a.criadas[27] === 2 && a.criadas[28] === 2 && soma(a.criadas) === 5, a.criadas.join());
  check('concluídas por dia: 1 em 26/09, 2 em 30/09, 1 em 01/10', a.concluidas[24] === 1 && a.concluidas[28] === 2 && a.concluidas[29] === 1 && soma(a.concluidas) === 4, a.concluidas.join());
  check('publicações por dia (só as concluídas de publicação)', a.publicacoes[24] === 1 && a.publicacoes[28] === 1 && a.publicacoes[29] === 1 && soma(a.publicacoes) === 3, a.publicacoes.join());
  check('totais', a.totais.criadas === 5 && a.totais.concluidas === 4 && a.totais.publicacoes === 3 && a.totais.abertasAgora === 2, JSON.stringify(a.totais));
  check('SLA médio = média de 48, 26, 24, 600 horas', Math.round(a.totais.slaMediaHoras) === 175 && a.totais.slaN === 4, String(a.totais.slaMediaHoras));
  check('SLA mediana = (26+48)/2 = 37h', a.totais.slaMedianaHoras === 37, String(a.totais.slaMedianaHoras));
  check('SLA por coluna: 30/09 = (48+26)/2 = 37; 01/10 = 24; 26/09 = 600; sem conclusão = null', a.slaHoras[28] === 37 && a.slaHoras[29] === 24 && a.slaHoras[24] === 600 && a.slaHoras[0] === null, a.slaHoras.join());
  check('abertasAgora não depende do período', M.agregar(tarefas, M.janela('ano', AGORA)).totais.abertasAgora === 2);
  // Colunas de mês inteiro: setembro é a 10, outubro a 11.
  const mes = M.agregar(tarefas, M.janela('mes', AGORA));
  check('mês: setembro junta tudo (criadas 7, concluídas 3, publicações 2); outubro 1 concluída', mes.criadas[10] === 7 && mes.concluidas[10] === 3 && mes.publicacoes[10] === 2 && mes.concluidas[11] === 1 && mes.publicacoes[11] === 1, JSON.stringify({ c: mes.criadas, k: mes.concluidas, p: mes.publicacoes }));
  check('mês: SLA médio de setembro = média de 48, 26, 600', Math.round(mes.slaHoras[10]) === 225 && mes.slaHoras[11] === 24, mes.slaHoras.join());
  const ano = M.agregar(tarefas, M.janela('ano', AGORA));
  check('ano: tudo em 2026', ano.concluidas.join() === '0,0,4' && ano.criadas.join() === '0,0,7');
  check('vazio não quebra', M.agregar([], dia).totais.slaMediaHoras === null && M.agregar(null, dia).totais.criadas === 0);
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
