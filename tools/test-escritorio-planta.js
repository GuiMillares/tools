// ADR-153: a planta do Escritório fecha (salas dentro do piso, sem
// sobreposição, mesa e cadeira dentro da sala, porta no corredor), o caminho
// entre dois pontos nunca atravessa parede (só anda pela pista da sala, pela
// porta e pelo corredor) e o diretor de cena manda cada estado para o lugar
// certo: desligado some, pendência vai para a sala de reunião, escalada vai
// reportar na sala de comando, trabalhando gira o ícone, Odin vai para a
// reunião quando a pendência não é de agente nenhum, e cada tarefa aberta
// vira um pacote na mesa de quem cuida dela.
//
//     node tools/test-escritorio-planta.js

const P = require('../lib/escritorio/planta');

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };
const dentro = (p, s) => p.x >= s.x0 - 1e-9 && p.x <= s.x1 + 1e-9 && p.z >= s.z0 - 1e-9 && p.z <= s.z1 + 1e-9;

console.log('\n=== As salas ===');
{
  check('10 salas, numeradas de 01 a 10, sem repetição', P.SALAS.length === 10 && new Set(P.SALAS.map((s) => s.numero)).size === 10 && P.SALAS.every((s) => /^(0[1-9]|10)$/.test(s.numero)));
  check('a 01 é a sala de comando, com o orquestrador; a 10 é a sala de reunião, sem ocupante', P.salaPorNumero('01').ocupante === 'orquestrador' && /COMANDO/.test(P.salaPorNumero('01').nome) && !P.salaPorNumero('10').ocupante && /REUNIÃO/.test(P.salaPorNumero('10').nome));
  check('todas dentro do piso', P.SALAS.every((s) => s.x0 >= P.PISO.x0 && s.x1 <= P.PISO.x1 && s.z0 >= P.PISO.z0 && s.z1 <= P.PISO.z1));
  check('nenhuma invade o corredor', P.SALAS.every((s) => s.z0 >= P.CORREDOR.z1 - 1e-9 || s.z1 <= P.CORREDOR.z0 + 1e-9));
  let sobrepoe = false;
  for (const a of P.SALAS) for (const b of P.SALAS) if (a !== b && a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6) sobrepoe = true;
  check('nenhuma sobrepõe outra', !sobrepoe);
  check('a porta de cada sala fica no lado do corredor, dentro da largura da sala', P.SALAS.every((s) => (s.frente ? s.porta.z === P.CORREDOR.z1 : s.porta.z === P.CORREDOR.z0) && s.porta.x - P.PORTA_LARGURA / 2 >= s.x0 && s.porta.x + P.PORTA_LARGURA / 2 <= s.x1));
  check('mesa, cadeira e monitor do ocupante ficam dentro da sala; as mesas extras também', P.SALAS.filter((s) => s.mesa).every((s) => dentro(s.mesa, s) && dentro(s.cadeira, s) && dentro(s.monitor, s) && s.mesasExtras.every((m) => dentro(m, s))));
  check('a cadeira fica atrás da mesa, do lado oposto ao corredor', P.SALAS.filter((s) => s.mesa).every((s) => (s.frente ? s.cadeira.z > s.mesa.z : s.cadeira.z < s.mesa.z)));
  check('a pista (x = cx + 1.7) passa entre a mesa do ocupante e a mesa extra da direita', P.SALAS.filter((s) => s.mesa).every((s) => s.pista > s.mesa.x + s.mesa.largura / 2 + 0.35 && s.pista < s.mesasExtras[1].x - P.MESA.largura / 2 - 0.35));
  const r = P.salaPorNumero('10');
  check('a sala de reunião tem mesa redonda e seis lugares, três de frente para o corredor e três atrás, todos fora da mesa', r.mesaReuniao && r.lugares.length === 6 && r.lugares.filter((l) => l.z > r.mesaReuniao.z).length === 3 && r.lugares.every((l) => Math.hypot(l.x - r.mesaReuniao.x, l.z - r.mesaReuniao.z) > r.mesaReuniao.raio + 0.5 && dentro(l, r)));
  const c = P.salaPorNumero('01');
  check('a sala de comando tem postos de pé perto da porta, fora da mesa e da pista', c.postos.length >= 3 && c.postos.every((p) => dentro(p, c) && p.z < c.mesa.z - c.mesa.profundidade && Math.abs(p.x - c.pista) > 0.6));
  check('a mesa do comando é maior que as outras', c.mesa.largura > P.MESA.largura);
  check('salaDoPonto acha a sala e devolve null no corredor', P.salaDoPonto({ x: 20, z: 8 }).numero === '01' && P.salaDoPonto({ x: 0, z: 0 }) === null && P.dentroDoCorredor({ x: 0, z: 0 }));
}

console.log('\n=== Os caminhos ===');
{
  // Um trecho é válido se os dois pontos estão na mesma sala (andando pela
  // pista, pela lateral ou pela linha da cadeira) ou os dois no corredor, ou
  // se é a passagem pela porta.
  function trechoValido(a, b) {
    const sa = P.salaDoPonto(a), sb = P.salaDoPonto(b);
    const corredorA = P.dentroDoCorredor(a), corredorB = P.dentroDoCorredor(b);
    if (corredorA && corredorB) return true;
    if (sa && sb && sa.numero === sb.numero) return true;
    // A passagem pela porta: um ponto na porta (no corredor) e o outro na sala, no mesmo x da porta.
    const porta = (s, p) => Math.abs(p.x - s.porta.x) < 1e-6 && Math.abs(p.z - s.porta.z) < 1e-6;
    if (sa && corredorB && porta(sa, b) && Math.abs(a.x - sa.porta.x) < 1e-6) return true;
    if (sb && corredorA && porta(sb, a) && Math.abs(b.x - sb.porta.x) < 1e-6) return true;
    return false;
  }
  function caminhoValido(c) { for (let i = 1; i < c.length; i++) if (!trechoValido(c[i - 1], c[i])) return `trecho ${i}: ${JSON.stringify(c[i - 1])} → ${JSON.stringify(c[i])}`; return ''; }
  const s05 = P.salaPorNumero('05'), s10 = P.salaPorNumero('10'), s01 = P.salaPorNumero('01'), s02 = P.salaPorNumero('02');
  const c1 = P.caminho(s05.cadeira, s10.lugares[0]);
  check('da cadeira da 05 ao lugar da frente da reunião: pista, porta, corredor, porta, pista, lugar', caminhoValido(c1) === '' && c1.length >= 6 && c1[0].x === s05.cadeira.x && c1[c1.length - 1].x === s10.lugares[0].x, caminhoValido(c1) || JSON.stringify(c1));
  check('o caminho começa pela pista da sala (não atravessa a mesa)', Math.abs(c1[1].x - s05.pista) < 1e-9 && Math.abs(c1[1].z - s05.cadeira.z) < 1e-9);
  check('anda pelo meio do corredor (z = 0)', c1.some((p) => p.z === 0) && c1.filter((p) => p.z === 0).length === 2);
  const c2 = P.caminho(s02.cadeira, s10.lugares[4]);
  check('para um lugar do fundo da reunião entra pela lateral, sem cruzar a mesa redonda', caminhoValido(c2) === '' && c2.some((p) => Math.abs(p.x - s10.lateral) < 1e-9) && c2.every((p, i) => i === 0 || !(Math.hypot(p.x - s10.mesaReuniao.x, p.z - s10.mesaReuniao.z) < s10.mesaReuniao.raio)), caminhoValido(c2) || JSON.stringify(c2));
  const c3 = P.caminho(s01.cadeira, s01.postos[0]);
  check('dentro da mesma sala vai pela pista: cadeira → pista → pista na altura do posto → posto', caminhoValido(c3) === '' && c3.length === 4 && Math.abs(c3[1].x - s01.pista) < 1e-9 && Math.abs(c3[2].z - s01.postos[0].z) < 1e-9, JSON.stringify(c3));
  const c4 = P.caminho(s02.cadeira, s01.postos[1]);
  check('da 02 ao posto da sala de comando', caminhoValido(c4) === '', caminhoValido(c4));
  const todos = [];
  for (const a of P.SALAS) for (const b of P.SALAS) {
    const de = a.cadeira || a.lugares[0], para = b.cadeira || b.lugares[5];
    const c = P.caminho(de, para);
    const erro = caminhoValido(c);
    if (erro) todos.push(`${a.numero}→${b.numero}: ${erro}`);
  }
  check('todos os pares de salas têm caminho válido (100 combinações)', todos.length === 0, todos.slice(0, 3).join(' | '));
  check('sem pontos repetidos em sequência', P.caminho(s05.cadeira, s05.cadeira).length === 1 || P.caminho(s05.cadeira, s05.cadeira).every((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.z !== arr[i - 1].z));
  check('comprimento soma os trechos', Math.abs(P.comprimento([{ x: 0, z: 0 }, { x: 3, z: 4 }, { x: 3, z: 10 }]) - 11) < 1e-9);
  check('lugaresNaMesa dá no máximo 6 posições, em cima do tampo', P.lugaresNaMesa(s02.mesa, 9).length === 6 && P.lugaresNaMesa(s02.mesa, 2).length === 2 && P.lugaresNaMesa(s02.mesa, 2).every((p) => p.y === s02.mesa.altura && Math.abs(p.x - s02.mesa.x) < s02.mesa.largura / 2 && Math.abs(p.z - s02.mesa.z) < s02.mesa.profundidade / 2));
}

console.log('\n=== O diretor de cena ===');
{
  const ag = (id, nome, numero, estado, modo = 'auto', extra = {}) => ({ id, nome, papel: 'p', sala: { numero, nome: 'x' }, estado, modo, ...extra });
  const snap = {
    rodando: false,
    orquestrador: { id: 'orquestrador', nome: 'Odin', papel: 'Orquestrador' },
    agentes: [
      ag('publicador-mpiplus', 'Thor', '02', 'trabalhando', 'auto', { atividade: 'Publicação em Massa' }),
      ag('publicador-buscaone', 'Freyr', '03', 'ocioso'),
      ag('bloqueador', 'Tyr', '04', 'desligado'),
      ag('hospedagem', 'Huginn', '05', 'aguardando'),
      ag('integrador', 'Ratatoskr', '06', 'standby', 'standby'),
      ag('auditor', 'Mímir', '07', 'erro'),
      ag('relator', 'Bragi', '09', 'aguardando'),
    ],
    tarefas: [
      { id: 't1', estado: 'executando', agente: 'publicador-mpiplus', tom: 'run' },
      { id: 't2', estado: 'planejada', agente: 'publicador-mpiplus' },
      { id: 't3', estado: 'pendente', agente: 'hospedagem' },
      { id: 't4', estado: 'escalada', agente: 'auditor' },
      { id: 't5', estado: 'na_fila', agente: null },
      { id: 't6', estado: 'em_analise', agente: null },
      { id: 't7', estado: 'concluida', agente: 'publicador-buscaone' },
      { id: 't8', estado: 'ignorada', agente: null },
      { id: 't9', estado: 'pendente', agente: null },
      { id: 't10', estado: 'aguardando_confirmacao', agente: 'bloqueador' },
    ],
    pendencias: [
      { id: 'P-1', tipo: 'pergunta', agente: null, status: 'aberta' },
      { id: 'P-2', tipo: 'pergunta', agente: 'relator', status: 'aberta' },
      { id: 'P-3', tipo: 'sugestao', agente: 'integrador', status: 'aberta' },
      { id: 'P-0', tipo: 'pergunta', agente: 'publicador-buscaone', status: 'fechada' },
    ],
  };
  const d = P.dirigir(snap);
  const fig = (id) => d.figuras.find((f) => f.id === id);
  check('uma figura por agente, mais o Odin, e nenhum aviso', d.figuras.length === 8 && fig('orquestrador') && d.avisos.length === 0, d.avisos.join('; '));
  check('o Odin vem primeiro e vai para a sala de reunião, porque há pendência sem agente', d.figuras[0].id === 'orquestrador' && fig('orquestrador').alvo.tipo === 'reuniao' && fig('orquestrador').icone === 'pergunta');
  check('Odin ocupa o primeiro lugar da reunião; Huginn (tarefa pendente) e Bragi (pendência dele) os seguintes', fig('orquestrador').alvo.x === P.salaPorNumero('10').lugares[0].x && fig('hospedagem').alvo.tipo === 'reuniao' && fig('relator').alvo.tipo === 'reuniao' && fig('hospedagem').alvo.x === P.salaPorNumero('10').lugares[1].x && fig('relator').alvo.x === P.salaPorNumero('10').lugares[2].x);
  check('sugestão para agente em standby não leva ninguém à reunião', fig('integrador').alvo.tipo === 'mesa');
  check('trabalhando fica na mesa com o ícone de trabalho girando e a tela "trabalhando"', fig('publicador-mpiplus').alvo.tipo === 'mesa' && fig('publicador-mpiplus').icone === 'trabalho' && fig('publicador-mpiplus').tela === 'trabalhando' && fig('publicador-mpiplus').atividade === 'Publicação em Massa');
  check('ocioso fica na mesa, sem ícone, tela ligada', fig('publicador-buscaone').alvo.tipo === 'mesa' && fig('publicador-buscaone').icone === null && fig('publicador-buscaone').tela === 'ligada');
  check('desligado está ausente, sem ícone, tela desligada', !fig('bloqueador').presente && fig('bloqueador').alvo.tipo === 'ausente' && fig('bloqueador').icone === null && fig('bloqueador').tela === 'desligada');
  check('standby fica na mesa, com a tela em standby', fig('integrador').alvo.tipo === 'mesa' && fig('integrador').tela === 'standby');
  check('tarefa escalada manda o agente reportar na sala de comando, com o ícone de erro', fig('auditor').alvo.tipo === 'comando' && fig('auditor').icone === 'erro' && fig('auditor').alvo.x === P.salaPorNumero('01').postos[0].x);
  check('a reunião lista quem está lá e quantas pendências abertas há', d.reuniao.ocupantes.join(',') === 'orquestrador,hospedagem,relator' && d.reuniao.pendencias === 3);
  const pac = (id) => d.pacotes.find((p) => p.id === id);
  check('executando e planejada ficam na mesa do Thor (sala 02)', pac('t1').lugar === 'sala:02' && pac('t2').lugar === 'sala:02' && Math.abs(pac('t1').z - P.salaPorNumero('02').mesa.z) < 1);
  check('pendentes ficam na mesa de reunião', pac('t3').lugar === 'reuniao' && pac('t9').lugar === 'reuniao');
  check('na fila, em análise e escalada ficam na mesa do Odin', pac('t5').lugar === 'comando' && pac('t6').lugar === 'comando' && pac('t4').lugar === 'comando');
  check('aguardando confirmação fica na mesa do agente, mesmo desligado', pac('t10').lugar === 'sala:04');
  check('concluída e ignorada não viram pacote', !pac('t7') && !pac('t8'));
  check('os lugares contam o total e o visível por mesa', d.lugares.find((l) => l.lugar === 'comando').total === 3 && d.lugares.find((l) => l.lugar === 'sala:02').visiveis === 2);
  check('os rótulos das 10 salas, na posição do canto', d.rotulos.length === 10 && d.rotulos.every((r) => /\d\d/.test(r.numero) && typeof r.x === 'number'));
  check('puro: a mesma entrada dá a mesma saída', JSON.stringify(P.dirigir(snap)) === JSON.stringify(d));

  const d2 = P.dirigir({ ...snap, rodando: true, pendencias: [] });
  check('varrendo, o Odin fica na mesa com o ícone da fila e a tela trabalhando', d2.figuras[0].alvo.tipo === 'mesa' && d2.figuras[0].icone === 'fila' && d2.figuras[0].tela === 'trabalhando' && d2.figuras[0].estado === 'trabalhando');
  check('sem pendência, Bragi volta para a mesa, mas o Huginn (tarefa pendente) continua na reunião', d2.figuras.find((f) => f.id === 'relator').alvo.tipo === 'mesa' && d2.figuras.find((f) => f.id === 'hospedagem').alvo.tipo === 'reuniao');
  const d3 = P.dirigir({ agentes: [ag('x', 'X', '42', 'ocioso')], tarefas: [], pendencias: [] });
  check('agente com sala desconhecida vira aviso, não exceção', d3.figuras.length === 1 && d3.avisos.length === 1 && /sem sala/.test(d3.avisos[0]));
  check('mais de 6 tarefas numa mesa: 6 visíveis e o total certo', (() => { const t = []; for (let i = 0; i < 9; i++) t.push({ id: 'q' + i, estado: 'na_fila' }); const dd = P.dirigir({ agentes: [], tarefas: t, pendencias: [] }); const l = dd.lugares.find((x) => x.lugar === 'comando'); return dd.pacotes.length === 6 && l.total === 9 && l.visiveis === 6; })());
  check('snapshot vazio não quebra', P.dirigir(null).figuras.length === 1 && P.dirigir({}).pacotes.length === 0);
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
