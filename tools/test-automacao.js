// ADR-120: motor da automação da fila. Testa a lógica de decisão/execução com
// dependências falsas (sem Electron).
//
//     node tools/test-automacao.js

const path = require('path');
const A = require(path.join(__dirname, '..', 'lib', 'automacao'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// Fábrica de deps falsas, registrando as chamadas.
function fakeDeps(over = {}) {
  const chamadas = { resolverMarca: [], bloquear: [], fecharTarefa: [], publicar: [], publicarBuscaOne: [] };
  const deps = {
    log: () => {},
    ligado: { bloqueio: true, publicacao: true },
    resolverMarca: async (p) => { chamadas.resolverMarca.push(p); return over.marca !== undefined ? { ok: true, ips: over.ips || ['149.18.103.98'], marca: over.marca } : { ok: true, ips: ['149.18.103.98'], marca: 'bc' }; },
    bloquear: async (p) => { chamadas.bloquear.push(p); return over.bloquear || { ok: true, empresa: 'CLIENTE' }; },
    fecharTarefa: async (p) => { chamadas.fecharTarefa.push(p); return over.fechar || { ok: true }; },
    publicar: async (p) => { chamadas.publicar.push(p); return over.publicar || { ok: true, dominio: p.dominio }; },
    publicarBuscaOne: async (p) => { chamadas.publicarBuscaOne.push(p); return over.publicarBuscaOne || { ok: true, dominio: p.dominio }; },
    ...over.deps,
  };
  return { deps, chamadas };
}

(async () => {
  console.log('\n=== Bloqueio de contatos ===');
  {
    const bloq = { assunto: 'BLOQUEIO DE CONTATOS - x.com.br', descricao: '', id: '00T1', link: 'https://sf/Task/00T1/view' };
    const tri = require(path.join(__dirname, '..', 'lib', 'triagem')).triar(bloq);

    // marca desconhecida → pula, não bloqueia
    let { deps, chamadas } = fakeDeps({ marca: null, ips: ['1.2.3.4'] });
    let r = await A.processarBloqueio(bloq, tri, deps);
    check('marca desconhecida: pula e não bloqueia', r.pulou === true && chamadas.bloquear.length === 0, JSON.stringify(r));

    // mpiplus → pula (não tem /doutor)
    ({ deps, chamadas } = fakeDeps({ marca: 'mpiplus' }));
    r = await A.processarBloqueio(bloq, tri, deps);
    check('MPI+ no bloqueio: pula, não usa /doutor', r.pulou === true && chamadas.bloquear.length === 0, JSON.stringify(r));

    // bc → bloqueia com a marca certa e fecha a tarefa
    ({ deps, chamadas } = fakeDeps({ marca: 'bc' }));
    r = await A.processarBloqueio(bloq, tri, deps);
    check('Busca Cliente: bloqueia com a marca e fecha a tarefa', r.ok === true && chamadas.bloquear[0].marca === 'bc' && chamadas.bloquear[0].acao === 'bloquear' && chamadas.fecharTarefa.length === 1, JSON.stringify(r));
    check('fecha a tarefa comentando "Contatos removidos"', chamadas.fecharTarefa[0].texto === 'Contatos removidos' && chamadas.fecharTarefa[0].concluir === true);

    // mpisolutions → usa a marca mpisolutions
    ({ deps, chamadas } = fakeDeps({ marca: 'mpisolutions' }));
    r = await A.processarBloqueio(bloq, tri, deps);
    check('MPI Solutions: bloqueia com a marca mpisolutions', r.ok === true && chamadas.bloquear[0].marca === 'mpisolutions');

    // bloqueio falha → não fecha a tarefa
    ({ deps, chamadas } = fakeDeps({ marca: 'bc', bloquear: { ok: false, error: 'incerto' } }));
    r = await A.processarBloqueio(bloq, tri, deps);
    check('bloqueio não confirmado: não fecha a tarefa', r.ok === false && chamadas.fecharTarefa.length === 0, JSON.stringify(r));
  }

  console.log('\n=== Publicação MPI+ ===');
  {
    const pub = { assunto: 'Publicação (Troca de DNS) MPI+ - y.com.br', descricao: 'http://y.mpitemporario.com.br/ https://y.com.br/', id: '00T2', link: 'https://sf/Task/00T2/view' };
    const tri = require(path.join(__dirname, '..', 'lib', 'triagem')).triar(pub);
    let { deps, chamadas } = fakeDeps();
    const r = await A.processarPublicacao(pub, tri, deps);
    check('MPI+ elegível: chama o driver de publicação com domínio e temporário', r.ok === true && chamadas.publicar[0].dominio === 'y.com.br' && chamadas.publicar[0].temporario === 'y.mpitemporario.com.br', JSON.stringify(r));

    // não elegível
    const tri2 = { tipo: 'publicacao', elegivel: false, motivo: 'Busca One' };
    ({ deps, chamadas } = fakeDeps());
    const r2 = await A.processarPublicacao(pub, tri2, deps);
    check('não elegível: pula, não publica', r2.pulou === true && chamadas.publicar.length === 0);
  }

  console.log('\n=== Varredura da fila ===');
  {
    const dados = {
      instancia: 'https://sf',
      tarefas: [
        { id: 'b1', assunto: 'BLOQUEIO DE CONTATOS - a.com.br', descricao: '', fechada: false },
        { id: 'p1', assunto: 'Publicação (Troca de DNS) MPI+ - b.com.br', descricao: 'http://b.mpitemporario.com.br/ https://b.com.br/', fechada: false },
        { id: 'p2', assunto: 'Publicação (Troca de DNS) - c.com.br', descricao: 'Apontado via registro.', fechada: false }, // Busca One, não elegível
        { id: 'x1', assunto: 'Ligar para o cliente', descricao: '', fechada: false }, // ignorar
        { id: 'f1', assunto: 'BLOQUEIO DE CONTATOS - d.com.br', fechada: true }, // fechada
      ],
    };

    // Tudo ligado
    let { deps, chamadas } = fakeDeps({ marca: 'bc' });
    let processados = new Set();
    let res = await A.varrerFila(dados, deps, { processados });
    check('processa o bloqueio e a publicação elegível', res.some((r) => r.tipo === 'bloqueio' && r.ok) && res.some((r) => r.tipo === 'publicacao' && r.ok), JSON.stringify(res.map((r) => r.id + ':' + r.tipo)));
    check('constrói o link da tarefa a partir da instância', chamadas.fecharTarefa[0].link === 'https://sf/lightning/r/Task/b1/view', chamadas.fecharTarefa[0].link);
    check('a Busca One NÃO vai para o driver MPI+ e, com o interruptor dela desligado, fica na fila (não marcada)', chamadas.publicar.length === 1 && chamadas.publicarBuscaOne.length === 0 && !processados.has('p2'));
    check('ignora tarefa que não é publicação nem bloqueio', !res.some((r) => r.id === 'x1'));
    check('não mexe em tarefa fechada', !res.some((r) => r.id === 'f1'));

    // Interruptor de publicação desligado: só bloqueio roda
    ({ deps, chamadas } = fakeDeps({ marca: 'bc' }));
    deps.ligado = { bloqueio: true, publicacao: false };
    res = await A.varrerFila(dados, deps, { processados: new Set() });
    check('publicação desligada: não chama o driver', chamadas.publicar.length === 0 && chamadas.bloquear.length === 1);

    // "parar" interrompe
    ({ deps, chamadas } = fakeDeps({ marca: 'bc' }));
    res = await A.varrerFila(dados, deps, { processados: new Set(), parar: () => true });
    check('parar() interrompe antes de agir', chamadas.bloquear.length === 0 && chamadas.publicar.length === 0);

    // não repete o que já foi processado
    ({ deps, chamadas } = fakeDeps({ marca: 'bc' }));
    const jaFeito = new Set(['b1', 'p1']);
    res = await A.varrerFila(dados, deps, { processados: jaFeito });
    check('não repete tarefas já processadas', chamadas.bloquear.length === 0 && chamadas.publicar.length === 0);
  }

  console.log('\n=== Publicação Busca One (ADR-132) ===');
  {
    const filas = [{ id: 'Q_BC', nome: 'Deploy Busca Cliente', marca: 'bc' }, { id: 'Q_MPI', nome: 'Deploy MPI Solutions', marca: 'mpisolutions' }];
    const dados = {
      instancia: 'https://sf', filas,
      tarefas: [
        { id: 'o1', fila: 'Q_MPI', assunto: 'Publicação (Troca de DNS) - c.com.br', descricao: 'link temporário - http://producao.mpitemporario.com.br/c.com/\nID 321', fechada: false },
        { id: 'o2', assunto: 'Publicação (Troca de DNS) - Padaria do Zé', descricao: 'Apontado via registro.', fechada: false }, // sem domínio
        { id: 'p1', assunto: 'Publicação (Troca de DNS) MPI+ - b.com.br', descricao: 'http://b.mpitemporario.com.br/ https://b.com.br/', fechada: false },
      ],
    };

    // Só a Busca One ligada: a MPI+ fica na fila.
    let { deps, chamadas } = fakeDeps();
    deps.ligado = { bloqueio: false, publicacao: false, buscaone: true };
    let processados = new Set();
    let res = await A.varrerFila(dados, deps, { processados });
    check('Busca One ligada: chama o driver dela com domínio, repositório, ID do painel, temporário, empresa do temporário e da fila', chamadas.publicarBuscaOne.length === 1 && chamadas.publicarBuscaOne[0].dominio === 'c.com.br' && chamadas.publicarBuscaOne[0].repositorio === 'c.com' && chamadas.publicarBuscaOne[0].idPainel === '321' && chamadas.publicarBuscaOne[0].temporario === 'producao.mpitemporario.com.br' && chamadas.publicarBuscaOne[0].empresa === 'mpisolutions' && chamadas.publicarBuscaOne[0].empresaTemporario === 'mpisolutions', JSON.stringify(chamadas.publicarBuscaOne));
    check('  leva id e link da tarefa', chamadas.publicarBuscaOne[0].id === 'o1' && chamadas.publicarBuscaOne[0].link === 'https://sf/lightning/r/Task/o1/view');
    check('  a MPI+ não roda com só a Busca One ligada', chamadas.publicar.length === 0 && !processados.has('p1'));
    check('  sucesso marca a tarefa como processada', processados.has('o1') && res.some((r) => r.id === 'o1' && r.ok));
    check('  Busca One sem domínio: registra e marca, sem chamar o driver', processados.has('o2') && !chamadas.publicarBuscaOne.some((p) => p.id === 'o2'));

    // Só a MPI+ ligada: a Busca One fica na fila.
    ({ deps, chamadas } = fakeDeps());
    deps.ligado = { bloqueio: false, publicacao: true, buscaone: false };
    processados = new Set();
    await A.varrerFila(dados, deps, { processados });
    check('só MPI+ ligada: Busca One não roda e não é marcada', chamadas.publicarBuscaOne.length === 0 && !processados.has('o1') && chamadas.publicar.length === 1);

    // Sem o driver: pula sem exceção.
    ({ deps, chamadas } = fakeDeps({ deps: { publicarBuscaOne: undefined } }));
    deps.ligado = { buscaone: true };
    const tri = require(path.join(__dirname, '..', 'lib', 'triagem')).triar(dados.tarefas[0]);
    const r = await A.processarPublicacao({ ...dados.tarefas[0], link: '' }, tri, deps);
    check('sem driver Busca One: pula com motivo', r.pulou === true && /Busca One/.test(r.motivo), JSON.stringify(r));

    // Desistir e tentativas valem igual para a Busca One.
    ({ deps } = fakeDeps({ publicarBuscaOne: { ok: false, desistir: true, motivo: 'sem empresa' } }));
    deps.ligado = { buscaone: true };
    processados = new Set();
    await A.varrerFila(dados, deps, { processados });
    check('desistir marca a Busca One como processada', processados.has('o1'));
    ({ deps } = fakeDeps({ publicarBuscaOne: { ok: false, motivo: 'e-mail não saiu' } }));
    deps.ligado = { buscaone: true };
    processados = new Set(); const tent = new Map();
    await A.varrerFila(dados, deps, { processados, tentativas: tent });
    check('erro comum conta tentativa e não marca', !processados.has('o1') && tent.get('o1') === 1);
  }

  console.log('\n=== Empresa pela fila da tarefa (ADR-122) ===');
  {
    const filas = [{ id: 'Q_BC', nome: 'Deploy Busca Cliente', marca: 'bc' }, { id: 'Q_MPI', nome: 'Deploy MPI Solutions', marca: 'mpisolutions' }];
    check('fila Deploy Busca Cliente → bc', A.empresaDaFila({ filas }, { fila: 'Q_BC' }) === 'bc');
    check('fila Deploy MPI Solutions → mpisolutions', A.empresaDaFila({ filas }, { fila: 'Q_MPI' }) === 'mpisolutions');
    check('fila desconhecida / tarefa minha → null', A.empresaDaFila({ filas }, { fila: null, donoId: 'EU' }) === null);
    check('cai no donoId quando fila não veio', A.empresaDaFila({ filas }, { donoId: 'Q_MPI' }) === 'mpisolutions');

    // A varredura leva a empresa da fila até o driver de publicação.
    const dados = { instancia: 'https://sf', filas, tarefas: [{ id: 'p7', fila: 'Q_BC', assunto: 'Publicação (Troca de DNS) MPI+ - w.com', descricao: 'http://w.mpitemporario.com.br/ https://w.com/', fechada: false }] };
    const { deps, chamadas } = fakeDeps();
    await A.varrerFila(dados, deps, { processados: new Set() });
    check('publicar recebe empresa=bc vinda da fila (domínio .com)', chamadas.publicar.length === 1 && chamadas.publicar[0].empresa === 'bc' && chamadas.publicar[0].dominio === 'w.com', JSON.stringify(chamadas.publicar));
  }

  console.log('\n=== Desistir e teto de tentativas (ADR-122) ===');
  {
    const dados = { instancia: 'https://sf', tarefas: [{ id: 'p9', assunto: 'Publicação (Troca de DNS) MPI+ - z.com.br', descricao: 'http://z.mpitemporario.com.br/ https://z.com.br/', fechada: false }] };

    // "desistir": falha que não se resolve sozinha → marcada como processada de primeira
    let { deps } = fakeDeps({ publicar: { ok: false, desistir: true, motivo: 'contato técnico do cliente' } });
    let processados = new Set();
    await A.varrerFila(dados, deps, { processados });
    check('desistir marca a tarefa como processada na 1ª falha', processados.has('p9'));

    // erro comum: tenta de novo até MAX_TENTATIVAS, depois desiste
    ({ deps } = fakeDeps({ publicar: { ok: false, motivo: 'painel fora do ar' } }));
    processados = new Set(); const tentativas = new Map();
    for (let i = 1; i < A.MAX_TENTATIVAS; i++) await A.varrerFila(dados, deps, { processados, tentativas });
    check(`erro comum NÃO marca antes de ${A.MAX_TENTATIVAS} tentativas`, !processados.has('p9') && tentativas.get('p9') === A.MAX_TENTATIVAS - 1);
    await A.varrerFila(dados, deps, { processados, tentativas });
    check(`na ${A.MAX_TENTATIVAS}ª falha desiste (marca processada)`, processados.has('p9'));

    // pulou não conta tentativa nem marca
    ({ deps } = fakeDeps({ publicar: { ok: false, pulou: true, motivo: 'publicação já em andamento' } }));
    processados = new Set(); const t2 = new Map();
    await A.varrerFila(dados, deps, { processados, tentativas: t2 });
    check('pulou não conta tentativa nem marca', !processados.has('p9') && !t2.has('p9'));
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
