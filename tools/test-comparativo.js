// ADR-146: a comparação antes/depois do Hub nas publicações MPI+. Tarefas
// sintéticas, corte em 22/09/2026, "agora" fixo, e as regras conferidas uma a
// uma: classificação, períodos de mesma duração, contagens, SLA em dias úteis,
// percentuais e a série por mês.
//
//     node tools/test-comparativo.js

const path = require('path');
const C = require(path.join(__dirname, '..', 'lib', 'comparativo'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const EU = '005EU';
const corte = '2026-09-22';
const agora = new Date(2026, 9, 8, 12, 0, 0); // 08/10/2026 12:00 → 16 dias depois do corte
const t = (over) => ({ id: 'x', assunto: 'Publicação (Troca de DNS) [MPI+] - cliente.com.br', descricao: '', status: 'Concluído', fechada: true, cancelada: false, criada: null, concluida: null, donoId: EU, donoTipo: 'User', ...over });
const d = (y, m, dd, h = 10) => new Date(y, m - 1, dd, h).toISOString();

console.log('\n=== Classificação ===');
check('"[MPI+]" no assunto → MPI+', C.classificar(t({})).mpiplus === true);
check('temporário *.mpitemporario no comentário → MPI+ mesmo sem [MPI+]', C.classificar(t({ assunto: 'Publicação (Troca de DNS) - cliente.com.br', descricao: 'http://cliente.mpitemporario.com.br/ https://cliente.com.br' })).mpiplus === true);
check('producao.mpitemporario (Busca One) NÃO é MPI+', C.classificar(t({ assunto: 'Publicação (Troca de DNS) - c.com.br', descricao: 'producao.mpitemporario.com.br/c/' })).mpiplus === false);
check('"Apontado via registro." (Busca One) NÃO é MPI+ e não é "sem marca"', (() => { const c = C.classificar(t({ assunto: 'Publicação (Troca de DNS) - c.com.br', descricao: 'Apontado via registro.' })); return c.mpiplus === false && c.semMarca === false; })());
check('publicação sem marcador nenhum → semMarca (contada à parte)', (() => { const c = C.classificar(t({ assunto: 'Publicação (Troca de DNS) - c.com.br', descricao: '' })); return c.publicacao && !c.mpiplus && c.semMarca === true; })());
check('"Publicação V1 -> V2" (registro em massa) NÃO é publicação (troca de DNS)', C.classificar(t({ assunto: 'Publicação V1 -> V2 - c.com.br' })).publicacao === false);
check('cancelada não tem data de conclusão', C.classificar(t({ status: 'Cancelada', concluida: d(2026, 9, 25) })).concluida === null);
check('aberta não tem conclusão', C.classificar(t({ fechada: false, status: 'Em andamento', concluida: null })).concluida === null);

console.log('\n=== Períodos: mesma duração, definidos pelo corte ===');
const p = C.periodos(new Date(2026, 8, 22), agora);
check('depois = do corte (00:00) até agora: 16,5 dias', Math.abs(p.dias - 16.5) < 1e-9 && p.depois.rotulo === '22/09/2026 a 08/10/2026', p.depois.rotulo + ' ' + p.dias);
check('antes = os mesmos 16,5 dias terminando no corte', p.antes.rotulo === '05/09/2026 a 21/09/2026' && Math.abs((p.antes.fim - p.antes.inicio) - (p.depois.fim - p.depois.inicio)) < 1000, p.antes.rotulo);
const pStr = C.comparar([], { corte: '2026-09-22', agora, euId: EU });
check('corte "AAAA-MM-DD" é dia local (não meia-noite UTC): 22/09, em qualquer fuso', pStr.corte === '22/09/2026' && pStr.periodos.depois === '22/09/2026 a 08/10/2026', pStr.corte + ' ' + pStr.periodos.depois);
check('corte como ISO com hora também vira o dia local', C.comparar([], { corte: new Date(2026, 8, 22, 15, 30), agora, euId: EU }).periodos.depois === '22/09/2026 a 08/10/2026');

console.log('\n=== Contagens, SLA e percentuais ===');
const tarefas = [
  // ANTES (06/09–21/09): 2 minhas concluídas (SLA 2 e 4 dias úteis), 1 de outro, 3 criadas
  t({ id: 'a1', criada: d(2026, 9, 7), concluida: d(2026, 9, 9) }),          // seg→qua = 2
  t({ id: 'a2', criada: d(2026, 9, 10), concluida: d(2026, 9, 16) }),        // qui→qua seguinte = 4
  t({ id: 'a3', criada: d(2026, 9, 8), concluida: d(2026, 9, 10), donoId: '005OUTRO' }),
  t({ id: 'a4', criada: d(2026, 9, 15), fechada: false, status: 'A fazer', donoId: '00GFILA', donoTipo: 'Queue' }), // criada antes, aberta
  // DEPOIS (22/09–08/10): 4 minhas concluídas (SLA 0,0,1,1), 1 cancelada, 5 criadas
  t({ id: 'd1', criada: d(2026, 9, 23), concluida: d(2026, 9, 23) }),        // mesmo dia = 0
  t({ id: 'd2', criada: d(2026, 9, 24), concluida: d(2026, 9, 24) }),
  t({ id: 'd3', criada: d(2026, 9, 25), concluida: d(2026, 9, 28) }),        // sex→seg = 1
  t({ id: 'd4', criada: d(2026, 10, 1), concluida: d(2026, 10, 2) }),        // qui→sex = 1
  t({ id: 'd5', criada: d(2026, 9, 29), concluida: d(2026, 9, 30), status: 'Cancelada', cancelada: true }),
  // fora dos dois períodos (agosto): não entra na comparação, só na série
  t({ id: 'f1', criada: d(2026, 8, 3), concluida: d(2026, 8, 5) }),
  // Busca One concluída depois: entra em "qualquer marca", não em MPI+
  t({ id: 'b1', assunto: 'Publicação (Troca de DNS) - b.com.br', descricao: 'Apontado via registro.', criada: d(2026, 9, 26), concluida: d(2026, 9, 29) }),
];
const r = C.comparar(tarefas, { corte, agora, euId: EU, serieDesde: new Date(2026, 7, 1) });
check('antes: 2 MPI+ minhas concluídas, 3 de todos, 4 criadas', r.antes.mpiplus.concluidasMinhas === 2 && r.antes.mpiplus.concluidasTodas === 3 && r.antes.mpiplus.criadasTodas === 4, JSON.stringify(r.antes.mpiplus));
check('depois: 4 MPI+ minhas concluídas (cancelada fora), 5 criadas', r.depois.mpiplus.concluidasMinhas === 4 && r.depois.mpiplus.criadasTodas === 5, JSON.stringify(r.depois.mpiplus));
check('SLA antes = média de 2 e 4 = 3 dias úteis', r.antes.mpiplus.slaMediaMinhas === 3, String(r.antes.mpiplus.slaMediaMinhas));
check('SLA depois = média de 0,0,1,1 = 0,5', r.depois.mpiplus.slaMediaMinhas === 0.5, String(r.depois.mpiplus.slaMediaMinhas));
check('por mês = contagem ÷ (16,5 dias / 30,44)', Math.abs(r.depois.mpiplus.porMesMinhas - 4 / (16.5 / C.MES_DIAS)) < 1e-9, String(r.depois.mpiplus.porMesMinhas));
check('melhora de publicações/mês = +100% (2 → 4 no mesmo nº de dias)', Math.abs(r.melhora.publicacoesPorMesMinhas - 100) < 1e-9, String(r.melhora.publicacoesPorMesMinhas));
check('melhora do SLA = redução de 3 → 0,5 = +83,3%', Math.abs(r.melhora.slaMinhas - (100 * (3 - 0.5) / 3)) < 1e-9, String(r.melhora.slaMinhas));
check('criadas por mês: +25% (4 → 5) — o controle de demanda', Math.abs(r.melhora.criadasPorMes - 25) < 1e-9, String(r.melhora.criadasPorMes));
check('Busca One conta em "qualquer marca" do depois, não em MPI+', r.depois.publicacoesQualquerMarca.concluidasMinhas === 5 && r.depois.mpiplus.concluidasMinhas === 4);

console.log('\n=== Série por mês ===');
const set = r.serie.find((m) => m.mes === '2026-09');
const out = r.serie.find((m) => m.mes === '2026-10');
const ago = r.serie.find((m) => m.mes === '2026-08');
check('série começa em ago/2026 e vai até out/2026', r.serie[0].mes === '2026-08' && r.serie[r.serie.length - 1].mes === '2026-10');
check('setembro: 6 MPI+ minhas concluídas (a1,a2,d1,d2,d3) → 5, criadas 8', set.concluidasMpiMinhas === 5 && set.criadasMpiTodas === 8, JSON.stringify(set));
check('outubro: 1 concluída (d4), 1 criada', out.concluidasMpiMinhas === 1 && out.criadasMpiTodas === 1);
check('agosto: 1 concluída fora da comparação aparece na série', ago.concluidasMpiMinhas === 1);
check('linhas para conferência não trazem assunto nem comentário', r.linhas.length === tarefas.filter((x) => /troca de dns/i.test(x.assunto)).length && !('assunto' in r.linhas[0]) && !('descricao' in r.linhas[0]));

console.log('\n=== Salvaguardas ===');
let erro = null; try { C.comparar(tarefas, { agora, euId: EU }); } catch (e) { erro = e.message; }
check('sem corte, recusa', /corte/.test(erro || ''));
check('variação com antes = 0 não divide por zero', C.variacao(0, 0) === 0 && C.variacao(0, 3) === null);

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
