// ADR-149: o orquestrador do Escritório com fila, modelo e executor falsos.
// Prova a ordem de decisão (triagem em código → modelo → pendência, ADR-161),
// o agrupamento das pendências, as respostas (encaminhar, tentar de novo…),
// a validação de execução, os estados da execução (fase 2, com executor
// falso) e o que a tela recebe. Sem rede e sem Electron.
//
//     node tools/test-escritorio-orquestrador.js

const path = require('path');
const fs = require('fs');
const os = require('os');
const LIB = path.join(__dirname, '..', 'lib', 'escritorio');
const { criarLoja } = require(path.join(LIB, 'loja'));
const { criarOrquestrador } = require(path.join(LIB, 'orquestrador'));
const Estados = require(path.join(LIB, 'estados'));
const T = Estados.TAREFA;

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const FILAS = [{ id: 'F-BC', nome: 'Deploy Busca Cliente', marca: 'bc' }, { id: 'F-MPI', nome: 'Deploy MPI Solutions', marca: 'mpisolutions' }];
const sf = (id, assunto, descricao = '', extra = {}) => ({ id, assunto, descricao, fechada: false, fila: 'F-BC', donoId: 'F-BC', dono: 'Deploy Busca Cliente', donoTipo: 'Queue', alterada: '1', ...extra });
const MPI = sf('00T-MPI', 'Publicação (Troca de DNS) [MPI+] - cliente.com.br', 'https://cliente.mpitemporario.com.br/');
const BO = sf('00T-BO', 'Publicação (Troca de DNS) - loja.com.br', 'link temporário: https://deploy.buscaclientes.com.br/loja.com.br/\nID do painel 4521');
const BLOQ = sf('00T-BLQ', 'BLOQUEIO DE CONTATOS - bc.com.br');
const SSL1 = sf('00T-SSL1', 'Ativação de SSL - a.com.br', 'por favor ativar');
const SSL2 = sf('00T-SSL2', 'Ativação de SSL - b.com.br', 'ativar também');
const REUNIAO = sf('00T-REU', 'Reunião de alinhamento com o cliente');
// Tarefa que a triagem em código não reconhece (vira pendência para você).
const DESC1 = sf('00T-DESC1', 'Solicitação do cliente - a.com.br', 'por favor ajustar');
const DESC2 = sf('00T-DESC2', 'Solicitação do cliente - b.com.br', 'ajustar também');

function montar({ tarefas = [], ia = 'padrao', executar = undefined, ctx = undefined } = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-orq-'));
  let relogio = Date.parse('2026-10-13T10:00:00.000Z');
  const agora = () => new Date(relogio).toISOString();
  const loja = criarLoja({ pasta, agora });
  const carga = loja.carregar();
  const logs = [];
  const eventos = [];
  const fila = { tarefas: [...tarefas], falhar: false, leituras: 0 };
  const chamadasIa = [];
  const respostasIa = [];
  const iaFalsa = ia === null ? null : {
    configurada: ia !== 'sem-chave', temChave: ia !== 'sem-chave', ligada: true,
    modeloDo: (p) => (p === 'agentes' ? 'flash' : 'pro'),
    gerarJson: async (pedido) => { chamadasIa.push(pedido); const r = respostasIa.length ? respostasIa.shift() : { ok: true, dados: { decisao: 'pergunta', motivo: 'não sei', confianca: 0.3, pergunta: 'O que faço com isso?' }, uso: { entrada: 10, saida: 5, pensamento: 0 }, modelo: 'pro' }; return typeof r === 'function' ? r(pedido) : r; },
  };
  const execucoes = [];
  const orq = criarOrquestrador({
    loja, ia: iaFalsa, agora,
    log: (m, t) => logs.push([String(m), t || 'info']),
    emitir: (e) => eventos.push(e),
    lerFila: async () => { fila.leituras++; if (fila.falhar) return { ok: false, error: 'sem sessão' }; return { ok: true, filas: FILAS, instancia: 'https://sf', tarefas: fila.tarefas.map((t) => ({ ...t })) }; },
    ctxExecucao: ctx || { configurado: () => true, emEspera: () => null, marcaDoDominio: async (d) => (['bc.com.br', 'bc2.com.br'].includes(d) ? { marca: 'bc', ips: ['149.18.103.98'] } : { marca: null, ips: [] }) },
    executar: executar ? async (p) => { execucoes.push(p); return executar(p); } : undefined,
  });
  return { pasta, loja, carga, orq, logs, eventos, fila, chamadasIa, respostasIa, execucoes, avancar: (ms) => { relogio += ms; }, limpar: () => fs.rmSync(pasta, { recursive: true, force: true }) };
}
const temLog = (logs, re) => logs.some((l) => re.test(l[0]));

(async () => {
  console.log('\n=== Desligado, manual e a triagem em código ===');
  {
    const m = montar({ tarefas: [MPI, BO, BLOQ] });
    let r = await m.orq.varrer();
    check('desligado: a varredura automática não lê a fila', r.ok === false && r.motivo === 'desligado' && m.fila.leituras === 0);
    r = await m.orq.varrer({ manual: true });
    check('rodar agora lê a fila mesmo desligado', r.ok && m.fila.leituras === 1 && r.resumo.lidas === 3 && r.resumo.novas === 3, JSON.stringify(r));
    const t = m.loja.tarefa('00T-MPI');
    check('publicação MPI+ → plano pelo Publicador MPI+ via triagem, sem chamar o modelo', t.estado === T.PLANEJADA && t.plano.agente === 'publicador-mpiplus' && t.plano.origem === 'triagem' && t.plano.parametros.dominio === 'cliente.com.br' && t.plano.parametros.temporario === 'cliente.mpitemporario.com.br' && t.plano.parametros.empresaFila === 'bc' && t.plano.parametros.link === 'https://sf/lightning/r/Task/00T-MPI/view' && m.chamadasIa.length === 0, JSON.stringify(t.plano));
    check('Busca One → Publicador Busca One com ID e repositório', m.loja.tarefa('00T-BO').plano.agente === 'publicador-buscaone' && m.loja.tarefa('00T-BO').plano.parametros.idPainel === '4521');
    check('bloqueio → Bloqueador', m.loja.tarefa('00T-BLQ').plano.agente === 'bloqueador');
    check('em observação: validou a seco e anotou "executaria", sem executar', t.plano.validacao && t.plano.validacao.ok === true && t.estado === T.PLANEJADA && temLog(m.logs, /cliente\.com\.br: em observação — Thor \(Publicador MPI\+\) executaria \(todas as regras passaram\)/) && m.execucoes.length === 0);
    check('histórico da tarefa tem fila, decisão, estado e validação', t.historico.map((h) => h.tipo).join() === 'fila,estado,decisao,estado,validacao', t.historico.map((h) => h.tipo).join());
    check('resumo no log', temLog(m.logs, /varredura concluída — 3 aberta\(s\) na fila, 3 nova\(s\), 3 planejada\(s\), 0 pendência\(s\), 0 ignorada\(s\), 3 executaria\(m\)/), m.logs.filter((l) => /varredura concluída/.test(l[0])).map((l) => l[0]).join());
    check('segunda varredura não repete decisão nem validação', (await m.orq.varrer({ manual: true })).resumo.analisadas === 0 && t.historico.filter((h) => h.tipo === 'validacao').length === 1);
    check('a loja foi gravada', fs.existsSync(m.loja.arquivo));
    // Tarefa some da fila (fechada por fora): concluída.
    m.fila.tarefas = [MPI, BO];
    await m.orq.varrer({ manual: true });
    check('tarefa que saiu da fila vira concluída com o motivo', m.loja.tarefa('00T-BLQ').estado === T.CONCLUIDA && /saiu da fila/.test(m.loja.tarefa('00T-BLQ').historico.slice(-1)[0].motivo));
    m.fila.tarefas = [MPI, { ...BO, fechada: true }];
    await m.orq.varrer({ manual: true });
    check('tarefa fechada no Salesforce vira concluída "fechada no Salesforce"', m.loja.tarefa('00T-BO').estado === T.CONCLUIDA && /fechada no Salesforce/.test(m.loja.tarefa('00T-BO').historico.slice(-1)[0].motivo));
    // Fila falha: não derruba nada.
    m.fila.falhar = true;
    const rf = await m.orq.varrer({ manual: true });
    check('fila indisponível: varredura falha com motivo e anota', !rf.ok && /sem sessão/.test(rf.motivo) && m.loja.estado.ultimaVarredura.ok === false);
    m.limpar();
  }

  console.log('\n=== Modelo: pergunta, ignorar, plano, standby, falhas ===');
  {
    const m = montar({ tarefas: [DESC1, DESC2, REUNIAO] });
    m.respostasIa.push({ ok: true, dados: { decisao: 'pergunta', motivo: 'não sei o que o cliente quer', confianca: 0.2, pergunta: 'Solicitação do cliente vai para quem?' }, uso: { entrada: 1, saida: 1 }, modelo: 'pro' });
    m.respostasIa.push({ ok: true, dados: { decisao: 'pergunta', motivo: 'idem', confianca: 0.2, pergunta: 'Solicitação do cliente vai para quem?' }, uso: { entrada: 1, saida: 1 }, modelo: 'pro' });
    m.respostasIa.push({ ok: true, dados: { decisao: 'ignorar', motivo: 'reunião não é operação', confianca: 0.95 }, uso: { entrada: 1, saida: 1 }, modelo: 'pro' });
    await m.orq.varrer({ manual: true });
    const pend = m.loja.pendenciasAbertas();
    check('duas tarefas do mesmo tipo → UMA pendência com as duas', pend.length === 1 && pend[0].tarefas.join() === '00T-DESC1,00T-DESC2' && pend[0].pergunta === 'Solicitação do cliente vai para quem?' && pend[0].padrao === 'solicitacao do cliente - {dominio}', JSON.stringify(pend));
    check('as duas tarefas ficam pendentes apontando para a pendência', m.loja.tarefa('00T-DESC1').estado === T.PENDENTE && m.loja.tarefa('00T-DESC2').pendenciaId === pend[0].id);
    check('reunião → ignorada pelo modelo, com o motivo no histórico', m.loja.tarefa('00T-REU').estado === T.IGNORADA && /reunião não é operação/.test(m.loja.tarefa('00T-REU').historico.slice(-1)[0].motivo));
    check('o modelo recebeu o pedido de triagem com a tarefa e o catálogo', m.chamadasIa.length === 3 && /Assunto: Solicitação do cliente - a\.com\.br/.test(m.chamadasIa[0].conteudo) && /publicador-mpiplus/.test(m.chamadasIa[0].sistema) && m.chamadasIa[0].papel === 'orquestrador');
    check('a decisão do modelo entrou no histórico com o uso', m.loja.tarefa('00T-DESC1').historico.some((h) => h.tipo === 'decisao' && h.origem === 'modelo' && h.decisao === 'pergunta' && h.uso.entrada === 1));
    // Plano do modelo para um agente auto.
    m.fila.tarefas.push(sf('00T-SUSP', 'Desativar site - c.com.br', 'cliente inadimplente'));
    m.respostasIa.push({ ok: true, dados: { decisao: 'plano', motivo: 'é suspensão', confianca: 0.9, agente: 'hospedagem', parametros: [{ nome: 'dominios', valor: 'c.com.br' }, { nome: 'acao', valor: 'suspensao' }] }, uso: {}, modelo: 'pro' });
    await m.orq.varrer({ manual: true });
    const ts = m.loja.tarefa('00T-SUSP');
    check('plano do modelo → planejada via modelo, com os parâmetros', ts.estado === T.PLANEJADA && ts.plano.origem === 'modelo' && ts.plano.agente === 'hospedagem' && ts.plano.parametros.acao === 'suspensao' && ts.plano.confianca === 0.9, JSON.stringify(ts.plano));
    check('validação a seco da hospedagem barra (fase 3) e anota no log, sem executar', ts.plano.validacao.ok === false && temLog(m.logs, /Huginn \(Hospedagem & E-mails\) executaria, mas .*regra\(s\) barraria/));
    // Plano para agente em standby → sugestão.
    m.fila.tarefas.push(sf('00T-REL', 'Preencher planilha do relatório - d.com.br'));
    m.respostasIa.push({ ok: true, dados: { decisao: 'plano', motivo: 'planilha', confianca: 0.8, agente: 'relator', parametros: [] }, uso: {}, modelo: 'pro' });
    await m.orq.varrer({ manual: true });
    const ps = m.loja.pendenciasAbertas().find((p) => p.tipo === 'sugestao');
    check('plano para agente em standby vira pendência de sugestão, não execução', ps && ps.agente === 'relator' && /Bragi \(Relator\), que fica em standby/.test(ps.pergunta) && m.loja.tarefa('00T-REL').estado === T.PENDENTE, JSON.stringify(ps));
    // Plano do modelo sem o obrigatório → pendência com os erros.
    m.fila.tarefas.push(sf('00T-PRC', 'Publicar site novo - e.com.br'));
    m.respostasIa.push({ ok: true, dados: { decisao: 'plano', motivo: 'x', confianca: 0.7, agente: 'publicador-mpiplus', parametros: [{ nome: 'dominio', valor: 'e.com.br' }] }, uso: {}, modelo: 'pro' });
    await m.orq.varrer({ manual: true });
    const pp = m.loja.pendenciasAbertas().find((p) => p.tarefas.includes('00T-PRC'));
    check('plano incompleto do modelo vira pendência dizendo o que falta', pp && /falta o parâmetro obrigatório "temporario"/.test(pp.pergunta));
    // Modelo com erro passageiro: volta para a fila e conta; chave ruim: pendência direta.
    m.fila.tarefas.push(sf('00T-ERR', 'Coisa estranha - f.com.br'));
    m.respostasIa.push({ ok: false, codigo: 'rede', erro: 'sem resposta' });
    await m.orq.varrer({ manual: true });
    check('erro de rede do modelo: tarefa volta para a fila com 1 falha', m.loja.tarefa('00T-ERR').estado === T.NA_FILA && m.loja.tarefa('00T-ERR').falhasAnalise === 1);
    m.respostasIa.push({ ok: false, codigo: 'rede', erro: 'sem resposta' });
    m.respostasIa.push({ ok: false, codigo: 'rede', erro: 'sem resposta' });
    await m.orq.varrer({ manual: true });
    await m.orq.varrer({ manual: true });
    const pe = m.loja.pendenciasAbertas().find((p) => p.tarefas.includes('00T-ERR'));
    check('três falhas do modelo → pendência', m.loja.tarefa('00T-ERR').estado === T.PENDENTE && pe && /O modelo não respondeu/.test(pe.pergunta));
    m.fila.tarefas.push(sf('00T-KEY', 'Outra coisa - g.com.br'));
    m.respostasIa.push({ ok: false, codigo: 'chave', erro: 'chave recusada' });
    await m.orq.varrer({ manual: true });
    check('chave recusada → pendência de primeira', m.loja.tarefa('00T-KEY').estado === T.PENDENTE && m.loja.pendenciasAbertas().some((p) => p.padrao === 'modelo:chave'));
    m.limpar();
  }

  console.log('\n=== O comentário manda: mesmo assunto, pedidos diferentes ===');
  {
    const COMENT1 = 'Boa tarde time, tudo bem?\n\nEsse cliente possui dois contratos conosco, um Doutores da Web e um Busca Clientes.\n\nAparentemente, dentro do Doutores ele recebeu uma bonificação de palavra, que é a mesma do nosso subdiretório. Com isso, o nosso site acabou caindo.\n\nAnteriormente o nosso site era: www.adetech.com.br/eletromecanicos\n\nPoderiam verificar e republicar o site novamente?';
    const COMENT2 = 'Favor trocar o DNS do cliente para o servidor novo, o temporário é cliente2.mpitemporario.com.br';
    const m = montar({ tarefas: [sf('00T-AJ1', 'Ajuste Site MPI - adetech.com.br', COMENT1), sf('00T-AJ2', 'Ajuste Site MPI - cliente2.com.br', COMENT2)] });
    m.respostasIa.push({ ok: true, dados: { leitura: 'Republicar o site Busca One que sumiu em www.adetech.com.br/eletromecanicos por conflito com palavra bonificada no Doutores', categoria: 'republicar-site-subdiretorio', trechoChave: 'republicar o site novamente', decisao: 'avisar', motivo: 'nenhum agente publica site em subdiretório', confianca: 0.85 }, uso: { entrada: 1, saida: 1 }, modelo: 'pro' });
    m.respostasIa.push({ ok: true, dados: { leitura: 'Trocar o DNS do cliente2.com.br para o servidor novo', categoria: 'trocar-dns', trechoChave: 'trocar o DNS', decisao: 'pergunta', motivo: 'é publicação MPI+ sem o padrão do assunto?', confianca: 0.5, pergunta: 'Ajuste de site pedindo troca de DNS é publicação MPI+?' }, uso: { entrada: 1, saida: 1 }, modelo: 'pro' });
    await m.orq.varrer({ manual: true });
    const t1 = m.loja.tarefa('00T-AJ1'); const t2 = m.loja.tarefa('00T-AJ2');
    check('o modelo recebeu o comentário inteiro das duas', m.chamadasIa.length === 2 && /republicar o site novamente/.test(m.chamadasIa[0].conteudo) && /cliente2\.mpitemporario/.test(m.chamadasIa[1].conteudo));
    check('a leitura e a categoria ficam na tarefa', /Republicar o site Busca One/.test(t1.leitura) && t1.categoria === 'republicar-site-subdiretorio' && t2.categoria === 'trocar-dns');
    const pend = m.loja.pendenciasAbertas();
    check('mesmo assunto, pedidos diferentes → DUAS pendências, não uma', pend.length === 2 && pend.every((p) => p.tarefas.length === 1), JSON.stringify(pend.map((p) => [p.tipo, p.padrao, p.tarefas])));
    const ph = pend.find((p) => p.tipo === 'humano'); const pq = pend.find((p) => p.tipo === 'pergunta');
    check('"avisar" vira pendência para você, com a leitura e o motivo', ph && ph.tarefas[0] === '00T-AJ1' && /Precisa de você: Republicar o site Busca One/.test(ph.pergunta) && /subdiretório/.test(ph.pergunta) && t1.estado === T.PENDENTE, ph && ph.pergunta);
    check('a pergunta leva a leitura do comentário e agrupa por categoria', pq && /o comentário pede: Trocar o DNS/.test(pq.pergunta) && pq.padrao === 'ajuste site mpi - {dominio}:trocar-dns', pq && pq.padrao);
    check('o log avisa que precisa de você', temLog(m.logs, /adetech\.com\.br: precisa de você/));
    // Mais uma tarefa do primeiro tipo entra na mesma pendência; de outro tipo, não.
    m.fila.tarefas.push(sf('00T-AJ3', 'Ajuste Site MPI - outro.com.br', 'Outro cliente com site em subdiretório que sumiu, favor republicar o site novamente'));
    m.respostasIa.push({ ok: true, dados: { leitura: 'Republicar site em subdiretório', categoria: 'republicar-site-subdiretorio', trechoChave: 'republicar o site novamente', decisao: 'avisar', motivo: 'idem', confianca: 0.8 }, uso: {}, modelo: 'pro' });
    await m.orq.varrer({ manual: true });
    check('tarefa do mesmo tipo (pela categoria) entra na pendência existente', m.loja.pendencia(ph.id).tarefas.join() === '00T-AJ1,00T-AJ3' && m.loja.pendenciasAbertas().length === 2);
    // Mais uma do mesmo tipo entra na mesma pendência (pela categoria que o modelo leu).
    m.fila.tarefas.push(sf('00T-AJ4', 'Ajuste Site MPI - mais.com.br', 'Cliente pede para republicar o site novamente, sumiu do ar'));
    m.respostasIa.push({ ok: true, dados: { leitura: 'Republicar site em subdiretório', categoria: 'republicar-site-subdiretorio', decisao: 'avisar', motivo: 'idem', confianca: 0.8 }, uso: {}, modelo: 'pro' });
    await m.orq.varrer({ manual: true });
    check('a terceira do mesmo tipo entra na mesma pendência', m.loja.pendencia(ph.id).tarefas.join() === '00T-AJ1,00T-AJ3,00T-AJ4');
    let r = await m.orq.responder(ph.id, { acao: 'tratada' });
    check('"tratada" conclui as três e fecha a pendência', r.ok && ['00T-AJ1', '00T-AJ3', '00T-AJ4'].every((id) => m.loja.tarefa(id).estado === T.CONCLUIDA) && m.loja.pendencia(ph.id).status === 'fechada');
    check('resposta de regra ("ignorar sempre", texto) é recusada: as regras saíram (ADR-161)', !(await m.orq.responder(pq.id, { acao: 'ignorar-sempre' })).ok && /ADR-161/.test((await m.orq.responder(pq.id, { acao: 'texto', texto: 'x' })).erro));
    check('snapshot leva leitura e categoria da tarefa', m.orq.snapshot().tarefas.find((x) => x.id === '00T-AJ2').leitura === 'Trocar o DNS do cliente2.com.br para o servidor novo' && m.orq.snapshot().tarefas.find((x) => x.id === '00T-AJ2').categoria === 'trocar-dns');
    m.limpar();
  }

  console.log('\n=== Sem modelo configurado ===');
  {
    const m = montar({ tarefas: [DESC1, MPI], ia: null });
    await m.orq.varrer({ manual: true });
    check('conhecida pela triagem segue sem modelo', m.loja.tarefa('00T-MPI').estado === T.PLANEJADA);
    const p = m.loja.pendenciasAbertas()[0];
    check('desconhecida vira pendência para você (encaminhar, tratar ou ignorar; a regra vai para a ADR), com a leitura do começo do comentário', p && /Não reconheci/.test(p.pergunta) && /Encaminhe para um agente, marque como tratada ou ignore/.test(p.pergunta) && /ADR/.test(p.pergunta) && m.loja.tarefa('00T-DESC1').estado === T.PENDENTE && m.loja.tarefa('00T-DESC1').leitura === 'por favor ajustar', p && p.pergunta);
    // Modelo com chave mas DESLIGADO (ADR-152): mesma coisa, sem chamada.
    {
      const m2 = montar({ tarefas: [DESC1] });
      m2.orq.trocarIa({ configurada: false, temChave: true, ligada: false, modeloDo: () => 'pro', gerarJson: async () => { throw new Error('não era para chamar'); } });
      await m2.orq.varrer({ manual: true });
      const p2 = m2.loja.pendenciasAbertas()[0];
      check('modelo desligado: pendência diz que está desligado e nada é chamado', p2 && /o modelo está desligado/.test(p2.pergunta) && m2.orq.snapshot().modelo.ligado === false && m2.orq.snapshot().modelo.temChave === true, p2 && p2.pergunta);
      // Encaminhar com preset (Huginn · SSL): só estas tarefas, via operador.
      const r3 = await m2.orq.encaminhar(p2.id, { agente: 'hospedagem', parametros: { acao: 'ssl' } });
      const t2 = m2.loja.tarefa('00T-DESC1');
      check('encaminhar com preset: planejada para o Huginn via operador, com os domínios da tarefa e a ação do preset; pendência fechada', r3.ok && t2.estado === T.PLANEJADA && t2.plano.agente === 'hospedagem' && t2.plano.origem === 'operador' && t2.plano.parametros.acao === 'ssl' && t2.plano.parametros.dominios.join() === 'a.com.br' && m2.loja.pendencia(p2.id).status === 'fechada', JSON.stringify(t2.plano));
      m2.limpar();
    }
    const r = await m.orq.responder(p.id, { acao: 'texto', texto: 'manda para a hospedagem' });
    check('resposta em texto não existe mais: recusada com o motivo', !r.ok && /desconhecida/.test(r.erro) && m.loja.pendencia(p.id).status === 'aberta');
    const snap = m.orq.snapshot();
    check('snapshot diz que o modelo não está configurado', snap.modelo.configurado === false);
    m.limpar();
  }

  console.log('\n=== Triagem em código no lugar das regras (ADR-161) ===');
  {
    const m = montar({ tarefas: [SSL1, SSL2, sf('00T-FORA', 'Site fora do ar - q.com.br', 'caiu'), sf('00T-MPI3', 'Publicação MPI+ - www.nv.com.br', 'temporário nv.mpitemporario.com.br')], ia: null });
    await m.orq.varrer({ manual: true });
    const s1 = m.loja.tarefa('00T-SSL1');
    check('Ativação de SSL vai ao Huginn pela triagem, com acao=ssl e os domínios, sem modelo nem pendência', s1.estado === T.PLANEJADA && s1.plano.agente === 'hospedagem' && s1.plano.origem === 'triagem' && s1.plano.parametros.acao === 'ssl' && s1.plano.parametros.dominios.join() === 'a.com.br' && m.loja.tarefa('00T-SSL2').estado === T.PLANEJADA, JSON.stringify(s1.plano));
    check('"Site fora do ar" é ignorado de vez pela triagem (ADR), sem pendência', m.loja.tarefa('00T-FORA').estado === T.IGNORADA && m.loja.tarefa('00T-FORA').historico.some((h) => h.tipo === 'decisao' && h.origem === 'triagem' && h.decisao === 'ignorar') && m.loja.pendenciasAbertas().length === 0);
    check('publicação com o temporário MPI+ no comentário e assunto fora do padrão vai ao Thor', m.loja.tarefa('00T-MPI3').estado === T.PLANEJADA && m.loja.tarefa('00T-MPI3').plano.agente === 'publicador-mpiplus');
    check('o orquestrador não tem mais regras aprendidas (sem aprovarRegra/salvarRegra; snapshot sem regras)', typeof m.orq.aprovarRegra === 'undefined' && typeof m.orq.salvarRegra === 'undefined' && m.orq.snapshot().regras === undefined && !('regraId' in (m.orq.snapshot().tarefas[0].plano || {})));
    m.limpar();
  }

  console.log('\n=== Encaminhar e as outras respostas ===');
  {
    const m = montar({ tarefas: [MPI, DESC1] });
    await m.orq.varrer({ manual: true });
    check('a triagem planeja o MPI+; a desconhecida vira pergunta', m.loja.tarefa('00T-MPI').estado === T.PLANEJADA && m.loja.tarefa('00T-DESC1').estado === T.PENDENTE);
    const p = m.loja.pendenciasAbertas()[0];
    let r = await m.orq.encaminhar(p.id, { agente: 'hospedagem', parametros: { dominios: 'a.com.br', acao: 'ssl' } });
    check('encaminhar: planejada via operador, pendência fechada', r.ok && m.loja.tarefa('00T-DESC1').estado === T.PLANEJADA && m.loja.tarefa('00T-DESC1').plano.origem === 'operador' && m.loja.pendencia(p.id).status === 'fechada');
    check('encaminhar para agente desconhecido é recusado', !(await m.orq.encaminhar(p.id, { agente: 'ninguem' })).ok);
    // ignorar-estas e tratada
    m.fila.tarefas.push(sf('00T-X1', 'Cobrança - h.com.br'), sf('00T-X2', 'Cobrança - i.com.br'));
    await m.orq.varrer({ manual: true });
    const p2 = m.loja.pendenciasAbertas().find((x) => x.tarefas.includes('00T-X1'));
    r = await m.orq.responder(p2.id, { acao: 'ignorar-estas' });
    check('ignorar-estas: as tarefas ficam ignoradas e a pendência fecha', r.ok && m.loja.tarefa('00T-X1').estado === T.IGNORADA && m.loja.tarefa('00T-X2').estado === T.IGNORADA && m.loja.pendencia(p2.id).status === 'fechada');
    check('responder pendência fechada é recusado', !(await m.orq.responder(p2.id, { acao: 'texto', texto: 'x' })).ok);
    // Tarefa mudou no Salesforce enquanto ignorada: reanalisa.
    m.fila.tarefas = m.fila.tarefas.map((t) => (t.id === '00T-X1' ? { ...t, descricao: 'agora é um pedido novo', alterada: '2' } : t));
    m.respostasIa.push({ ok: true, dados: { decisao: 'ignorar', motivo: 'continua cobrança', confianca: 0.9 }, uso: {}, modelo: 'pro' });
    await m.orq.varrer({ manual: true });
    check('tarefa que mudou no Salesforce foi reanalisada', m.loja.tarefa('00T-X1').historico.some((h) => h.tipo === 'fila' && /mudou no Salesforce/.test(h.motivo)) && m.chamadasIa.slice(-1)[0].conteudo.includes('agora é um pedido novo'));
    // reanalisar
    r = await m.orq.reanalisar('00T-DESC1');
    check('reanalisar limpa o plano e decide de novo', r.ok && (m.loja.tarefa('00T-DESC1').plano === null || m.loja.tarefa('00T-DESC1').plano.origem !== 'operador'));
    m.limpar();
  }

  console.log('\n=== Execução (executor falso): sucesso, aguardando, falha, escalada, barrada ===');
  {
    const respostas = {};
    const m = montar({ tarefas: [MPI, BLOQ], executar: async ({ agente, parametros }) => respostas[parametros.dominio] || { ok: true, mensagem: 'feito' } });
    m.orq.ligar({ geral: true, observacao: false });
    check('ligar gravou e avisou', m.loja.ligado.geral === true && m.loja.ligado.observacao === false && m.eventos.some((e) => e.tipo === 'ligado') && temLog(m.logs, /modo automático LIGADO/));
    respostas['bc.com.br'] = { ok: false, aguardando: true, motivo: 'esperando o DNS' };
    await m.orq.varrer();
    const t = m.loja.tarefa('00T-MPI');
    check('automático: executou o Publicador MPI+ depois de validar, e concluiu', t.estado === T.CONCLUIDA && m.execucoes.length === 2 && m.execucoes.find((e) => e.agente === 'publicador-mpiplus').parametros.dominio === 'cliente.com.br' && t.historico.some((h) => h.tipo === 'validacao' && h.ok) && t.historico.some((h) => h.tipo === 'execucao' && h.ok), JSON.stringify(t.historico.map((h) => h.tipo)));
    check('estados passaram por executando', t.historico.some((h) => h.tipo === 'estado' && h.para === T.EXECUTANDO));
    check('aguardando: vira aguardando externo', m.loja.tarefa('00T-BLQ').estado === T.AGUARDANDO_EXTERNO);
    // Reanalisar quem já foi publicado e espera o DNS (ADR-160): volta à
    // análise, ganha plano de novo e, na varredura seguinte, o executor (que
    // reconhece "já publicado") responde aguardando outra vez.
    let r2 = await m.orq.reanalisar('00T-BLQ');
    check('reanalisar uma tarefa aguardando externo é aceito: volta à análise e ganha plano de novo, sem transição inválida no log', r2.ok && !!m.loja.tarefa('00T-BLQ').plano && m.loja.tarefa('00T-BLQ').historico.some((h) => h.tipo === 'estado' && h.de === T.AGUARDANDO_EXTERNO && h.para === T.EM_ANALISE) && !temLog(m.logs, /transição inválida/), JSON.stringify(r2));
    await m.orq.varrer();
    check('na varredura seguinte o executor responde aguardando e ela volta a aguardando externo', m.loja.tarefa('00T-BLQ').estado === T.AGUARDANDO_EXTERNO);
    const planoMpi = m.loja.tarefa('00T-MPI').plano;
    r2 = await m.orq.reanalisar('00T-MPI');
    check('reanalisar uma concluída é recusado antes de mexer nela: o plano fica e o log não acusa transição inválida', !r2.ok && /concluída/.test(r2.erro) && m.loja.tarefa('00T-MPI').plano === planoMpi && m.loja.tarefa('00T-MPI').estado === T.CONCLUIDA && !temLog(m.logs, /transição inválida/), JSON.stringify(r2));
    // Falha até o teto → escalada + pendência.
    m.fila.tarefas.push(sf('00T-BL2', 'BLOQUEIO DE CONTATOS - bc.com.br', '', { id: '00T-BL2' }));
    respostas['bc.com.br'] = { ok: false, motivo: 'painel fora do ar' };
    await m.orq.varrer();
    const b2 = m.loja.tarefa('00T-BL2');
    check('falha comum: fica em falhou com 1 tentativa', b2.estado === T.FALHOU && b2.tentativas === 1);
    await m.orq.varrer();
    check('segunda varredura tenta de novo', b2.tentativas === 2 && b2.estado === T.FALHOU);
    await m.orq.varrer();
    const pEsc = m.loja.pendenciasAbertas().find((p) => p.tarefas.includes('00T-BL2'));
    check('terceira falha: pendência "para você" com o motivo e "Tentar de novo"; a tarefa fica pendente, sem transição inválida (ADR-161)', !!pEsc && pEsc.tipo === 'humano' && /falhou 3 vezes/.test(pEsc.pergunta) && /Tentar de novo/.test(pEsc.pergunta) && b2.estado === T.PENDENTE && b2.historico.some((h) => h.tipo === 'estado' && h.de === T.ESCALADA && h.para === T.PENDENTE) && !temLog(m.logs, /transição inválida/), JSON.stringify([pEsc && pEsc.tipo, b2.estado]));
    respostas['bc.com.br'] = { ok: false, aguardando: true, motivo: 'esperando o DNS' };
    await m.orq.responder(pEsc.id, { acao: 'tentar-de-novo' });
    check('tentar de novo: zera as tentativas, fecha a pendência e replaneja', b2.tentativas === 0 && m.loja.pendencia(pEsc.id).status === 'fechada' && b2.estado === T.PLANEJADA, b2.estado);
    await m.orq.varrer();
    check('na varredura seguinte o agente executa de novo (aqui, responde aguardando)', b2.estado === T.AGUARDANDO_EXTERNO && b2.tentativas === 0, b2.estado);
    // desistir de primeira
    m.fila.tarefas.push(sf('00T-BL3', 'BLOQUEIO DE CONTATOS - bc.com.br', '', { id: '00T-BL3' }));
    respostas['bc.com.br'] = { ok: false, desistir: true, motivo: 'contrato não achado' };
    await m.orq.varrer();
    check('desistir: escalada de primeira, que vira pendência "para você" dizendo que desistiu', m.loja.tarefa('00T-BL3').estado === T.PENDENTE && m.loja.tarefa('00T-BL3').tentativas === 1 && m.loja.pendenciasAbertas().some((p) => p.tarefas.includes('00T-BL3') && p.tipo === 'humano' && /desistiu/.test(p.pergunta)));
    // Agente desligado: espera.
    m.orq.ligar({ agente: 'bloqueador', valor: false });
    m.fila.tarefas.push(sf('00T-BL4', 'BLOQUEIO DE CONTATOS - bc.com.br', '', { id: '00T-BL4' }));
    respostas['bc.com.br'] = { ok: true, mensagem: 'ok' };
    const antes = m.execucoes.length;
    await m.orq.varrer();
    check('agente desligado: planejada, sem executar', m.loja.tarefa('00T-BL4').estado === T.PLANEJADA && m.execucoes.length === antes && temLog(m.logs, /Tyr \(Bloqueador de Contatos\) está desligado/));
    m.orq.ligar({ agente: 'bloqueador', valor: true });
    await m.orq.varrer();
    check('religado: executa na varredura seguinte', m.loja.tarefa('00T-BL4').estado === T.CONCLUIDA);
    // Validação barra: pendência, sem executar.
    m.fila.tarefas.push(sf('00T-BL5', 'BLOQUEIO DE CONTATOS - desconhecido.com.br', '', { id: '00T-BL5' }));
    const antes2 = m.execucoes.length;
    await m.orq.varrer();
    const b5 = m.loja.tarefa('00T-BL5');
    check('regra de execução barrou: pendência com a regra e o motivo, nada executado', b5.estado === T.PENDENTE && m.execucoes.length === antes2 && m.loja.pendenciasAbertas().some((p) => p.tarefas.includes('00T-BL5') && /Marca pelo apontamento/.test(p.pergunta)));
    // Duplicidade: domínio já concluído pelo mesmo agente barra.
    m.fila.tarefas.push(sf('00T-MPI2', 'Publicação (Troca de DNS) [MPI+] - cliente.com.br', 'https://cliente.mpitemporario.com.br/', { id: '00T-MPI2' }));
    await m.orq.varrer();
    check('mesmo domínio já concluído: barrado pela regra de duplicidade', m.loja.tarefa('00T-MPI2').estado === T.PENDENTE && m.loja.pendenciasAbertas().some((p) => p.tarefas.includes('00T-MPI2') && /Sem duplicidade/.test(p.pergunta)));
    // Atividade manual (ADR-152): um módulo rodando pela mão é o agente trabalhando.
    const atividades = { relator: { detalhe: 'Planilha do Relatório', desde: 'x' } };
    const orqAt = criarOrquestrador({ loja: m.loja, lerFila: async () => ({ ok: true, filas: FILAS, instancia: 'https://sf', tarefas: [] }), atividadeManual: (id) => atividades[id] || null });
    const sa = orqAt.snapshot().agentes;
    check('agente em standby com o módulo rodando pela mão aparece trabalhando, com o módulo', sa.find((a) => a.id === 'relator').estado === 'trabalhando' && sa.find((a) => a.id === 'relator').atividade === 'Planilha do Relatório' && sa.find((a) => a.id === 'auditor').estado === 'standby');
    check('o snapshot leva os presets do Huginn', sa.find((a) => a.id === 'hospedagem').presets.map((p) => p.id).join() === 'ssl,suspensao');
    const snap = m.orq.snapshot();
    check('snapshot: agentes com estado, tarefas, pendências, regras, contadores', snap.agentes.length === 8 && snap.agentes.find((a) => a.id === 'relator').estado === 'standby' && snap.agentes.find((a) => a.id === 'bloqueador').estado === 'aguardando' && snap.tarefas.length >= 7 && snap.pendencias.length >= 3 && snap.regras === undefined && typeof snap.contadores.chamadas === 'number' && snap.ligado.geral === true);
    check('snapshot: tarefa leva plano com validação e o último evento', snap.tarefas.find((x) => x.id === '00T-MPI').plano.validacao.ok === true && snap.tarefas.find((x) => x.id === '00T-MPI').ultimo.tipo === 'estado');
    m.limpar();
  }

  console.log('\n=== Domínio já na lista de espera: aguardando externo, não pendência (ADR-162) ===');
  {
    const m = montar({ tarefas: [MPI], executar: async () => ({ ok: true, mensagem: 'não era para executar' }), ctx: { configurado: () => true, emEspera: (d) => (d === 'cliente.com.br' ? { motivo: 'aguardando o cliente apontar' } : null), marcaDoDominio: async () => ({ marca: 'bc', ips: [] }) } });
    m.orq.ligar({ geral: true, observacao: false });
    await m.orq.varrer();
    const t = m.loja.tarefa('00T-MPI');
    check('a validação "Fora da lista de espera" leva a tarefa a aguardando externo, sem pendência e sem executar', t.estado === T.AGUARDANDO_EXTERNO && m.execucoes.length === 0 && m.loja.pendenciasAbertas().length === 0 && temLog(m.logs, /já está na lista de espera/) && !temLog(m.logs, /transição inválida/), JSON.stringify([t.estado, m.loja.pendenciasAbertas().length]));
    m.limpar();
  }

  console.log('\n=== Modo manual e tarefa interrompida ===');
  {
    const m = montar({ tarefas: [BLOQ], executar: async () => ({ ok: true, mensagem: 'feito' }) });
    m.orq.ligar({ observacao: false });
    await m.orq.varrer({ manual: true });
    check('manual (geral desligado, sem observação): fica aguardando confirmação', m.loja.tarefa('00T-BLQ').estado === T.AGUARDANDO_CONFIRMACAO && m.execucoes.length === 0);
    const r = await m.orq.confirmar('00T-BLQ');
    check('confirmar valida e executa', r.ok && m.loja.tarefa('00T-BLQ').estado === T.CONCLUIDA && m.execucoes.length === 1);
    check('confirmar tarefa concluída é recusado', !(await m.orq.confirmar('00T-BLQ')).ok);
    // Interrompida: a loja marca ao carregar; o orquestrador abre a pendência.
    m.fila.tarefas.push(sf('00T-BL9', 'BLOQUEIO DE CONTATOS - bc2.com.br', '', { id: '00T-BL9' }));
    await m.orq.varrer({ manual: true });
    const t9 = m.loja.tarefa('00T-BL9');
    Estados.transicionar(t9, T.EXECUTANDO, 'simulando');
    m.loja.salvar();
    const loja2 = criarLoja({ pasta: m.pasta });
    const c2 = loja2.carregar();
    const logs2 = [];
    const orq2 = criarOrquestrador({ loja: loja2, lerFila: async () => ({ ok: true, filas: FILAS, instancia: 'https://sf', tarefas: m.fila.tarefas }), log: (x) => logs2.push(String(x)), ctxExecucao: { configurado: () => true, emEspera: () => null, marcaDoDominio: async () => ({ marca: 'bc', ips: [] }) } });
    orq2.tratarInterrompidas(c2.interrompidas);
    const pr = loja2.pendenciasAbertas().find((p) => p.tipo === 'retomar');
    check('ao reabrir, a interrompida vira pendência "retomar?"', loja2.tarefa('00T-BL9').estado === T.INTERROMPIDA && pr && /O Hub fechou enquanto Tyr \(Bloqueador de Contatos\) executava/.test(pr.pergunta));
    await orq2.responder(pr.id, { acao: 'retomar' });
    check('retomar: volta para análise (replaneja e valida de novo)', loja2.tarefa('00T-BL9').estado === T.EM_ANALISE);
    await orq2.varrer({ manual: true });
    check('na varredura seguinte, replanejada e validada; sem o modo automático, espera a sua confirmação', loja2.tarefa('00T-BL9').estado === T.AGUARDANDO_CONFIRMACAO, loja2.tarefa('00T-BL9').estado);
    m.limpar();
  }

  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo ok.');
  process.exit(falhas ? 1 : 0);
})();
