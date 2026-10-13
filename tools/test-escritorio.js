// ADR-149: as peças puras do Escritório — estados, regras aprendidas e de
// execução, loja em disco (escrita atômica), triagem pelo modelo (pedido e
// leitura da resposta) e o adaptador do Gemini com cliente falso. Sem rede e
// sem Electron.
//
//     node tools/test-escritorio.js

const path = require('path');
const fs = require('fs');
const os = require('os');
const LIB = path.join(__dirname, '..', 'lib', 'escritorio');
const Estados = require(path.join(LIB, 'estados'));
const Catalogo = require(path.join(LIB, 'catalogo'));
const Regras = require(path.join(LIB, 'regras'));
const { criarLoja } = require(path.join(LIB, 'loja'));
const TriagemIa = require(path.join(LIB, 'triagem-ia'));
const Ia = require(path.join(LIB, 'ia'));
const Triagem = require(path.join(__dirname, '..', 'lib', 'triagem'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

(async () => {
  console.log('\n=== Estados ===');
  {
    const T = Estados.TAREFA;
    check('todo estado tem transições declaradas', Object.values(T).every((e) => Array.isArray(Estados.TRANSICOES[e])), Object.values(T).filter((e) => !Estados.TRANSICOES[e]).join(','));
    check('toda transição aponta para um estado que existe', Object.values(Estados.TRANSICOES).flat().every((e) => Object.values(T).includes(e)));
    check('concluída é terminal', Estados.TRANSICOES[T.CONCLUIDA].length === 0);
    check('concluída não volta a executando', !Estados.podeIr(T.CONCLUIDA, T.EXECUTANDO));
    check('na fila → executando é inválido (tem que planejar antes)', !Estados.podeIr(T.NA_FILA, T.EXECUTANDO));
    const t = { id: 'x', estado: T.NA_FILA };
    const ag = () => '2026-10-13T12:00:00.000Z';
    check('transicionar válida muda o estado e registra', Estados.transicionar(t, T.EM_ANALISE, 'teste', {}, ag).ok && t.estado === T.EM_ANALISE && t.historico.length === 1 && t.historico[0].de === T.NA_FILA && t.historico[0].quando === ag());
    const r = Estados.transicionar(t, T.CONCLUIDA, 'pulo');
    check('em análise → concluída é permitido (fechada no Salesforce)', r.ok && t.estado === T.CONCLUIDA);
    const r2 = Estados.transicionar(t, T.EXECUTANDO, 'não pode');
    check('transição inválida é recusada com erro, sem mudar o estado', !r2.ok && /inválida/.test(r2.erro) && t.estado === T.CONCLUIDA);
    check('transição repetida é ok sem registrar', Estados.transicionar(t, T.CONCLUIDA).repetida === true && t.historico.length === 2);
    const h = { id: 'h', estado: T.NA_FILA, historico: [] };
    for (let i = 0; i < Estados.HISTORICO_MAX + 50; i++) Estados.registrar(h, { tipo: 'x', i });
    check('histórico tem teto', h.historico.length === Estados.HISTORICO_MAX && h.historico[0].i === 50);
    check('rótulo e tom para todo estado', Object.values(T).every((e) => Estados.ROTULOS[e] && Estados.TOM[e]));
    check('estaAberta: pendente sim, ignorada não', Estados.estaAberta({ estado: T.PENDENTE }) && !Estados.estaAberta({ estado: T.IGNORADA }));
  }

  console.log('\n=== Catálogo ===');
  {
    const ids = Catalogo.AGENTES.map((a) => a.id);
    check('8 agentes, ids únicos', ids.length === 8 && new Set(ids).size === 8, ids.join(','));
    check('cada agente tem sala, modo, módulos e parâmetros', Catalogo.AGENTES.every((a) => Catalogo.salaDe(a.id) && ['auto', 'standby'].includes(a.modo) && a.modulos.length && a.parametros && Array.isArray(a.parametros.obrigatorios)));
    check('o orquestrador tem a sala de comando', Catalogo.SALAS[0].nome === 'SALA DE COMANDO' && Catalogo.SALAS[0].ocupante === 'orquestrador');
    check('standby: auditor, conferente, relator, integrador', ['auditor', 'conferente', 'relator', 'integrador'].every((id) => Catalogo.agentePorId(id).modo === 'standby'));
    const triPub = Triagem.triar({ assunto: 'Publicação (Troca de DNS) [MPI+] - cliente.com.br', descricao: 'https://cliente.mpitemporario.com.br/' });
    check('triagem MPI+ → publicador-mpiplus', Catalogo.agentePorTriagem(triPub).id === 'publicador-mpiplus');
    const triBo = Triagem.triar({ assunto: 'Publicação (Troca de DNS) - x.com.br', descricao: 'link temporário: https://deploy.buscaclientes.com.br/x.com.br/\nID do painel 4521' });
    check('triagem Busca One → publicador-buscaone', Catalogo.agentePorTriagem(triBo).id === 'publicador-buscaone');
    const triBl = Triagem.triar({ assunto: 'BLOQUEIO DE CONTATOS - y.com.br' });
    check('triagem bloqueio → bloqueador', Catalogo.agentePorTriagem(triBl).id === 'bloqueador');
    check('tarefa que a triagem ignora → sem agente', Catalogo.agentePorTriagem(Triagem.triar({ assunto: 'Reunião com o cliente' })) === null);
    const p = Catalogo.parametrosDaTriagem(triBo, { link: 'https://sf/x', empresaFila: 'bc' });
    check('parâmetros da triagem Busca One: domínio, temporário, repositório, ID, marca, link, fila', p.dominio === 'x.com.br' && p.temporario === 'deploy.buscaclientes.com.br' && p.repositorio === 'x.com.br' && p.idPainel === '4521' && p.marca === 'bc' && p.link === 'https://sf/x' && p.empresaFila === 'bc', JSON.stringify(p));
    const cm = Catalogo.catalogoParaModelo();
    check('catálogo para o modelo não leva funções nem canais', cm.every((a) => !a.ferramentas && !a.regrasExecucao && Array.isArray(a.regras) && typeof a.descricao === 'string'));
  }

  console.log('\n=== Regras aprendidas ===');
  {
    const fato = Regras.fatoDaTarefa({ assunto: 'Ativação de SSL - cliente.com.br', descricao: 'por favor', empresaFila: 'bc', dono: 'Fila' }, Triagem.triar({ assunto: 'Ativação de SSL - cliente.com.br' }));
    check('fato: assunto, fila, tipo ignorar', fato.assunto === 'Ativação de SSL - cliente.com.br' && fato.fila === 'bc' && fato.tipo === 'ignorar');
    check('contem sem acento e sem caixa', Regras.testarCondicao({ campo: 'assunto', op: 'contem', valor: 'ATIVACAO DE SSL' }, fato));
    check('comeca', Regras.testarCondicao({ campo: 'assunto', op: 'comeca', valor: 'Ativação' }, fato) && !Regras.testarCondicao({ campo: 'assunto', op: 'comeca', valor: 'SSL' }, fato));
    check('regex inválida não casa (e não estoura)', !Regras.testarCondicao({ campo: 'assunto', op: 'regex', valor: '(' }, fato));
    check('vazio / naoVazio', Regras.testarCondicao({ campo: 'dominio', op: 'vazio' }, fato) && Regras.testarCondicao({ campo: 'fila', op: 'naoVazio' }, fato));
    check('campo desconhecido não casa', !Regras.testarCondicao({ campo: 'senha', op: 'igual', valor: 'x' }, fato));
    check('regra sem condição nunca casa', !Regras.regraCasa({ ativa: true, quando: [], entao: { acao: 'ignorar' } }, fato));
    const regras = [
      { id: 'a', ativa: true, criadaEm: '2026-10-01', quando: [{ campo: 'assunto', op: 'contem', valor: 'ssl' }], entao: { acao: 'encaminhar', agente: 'hospedagem', parametros: { acao: 'ssl' } } },
      { id: 'b', ativa: true, criadaEm: '2026-09-01', prioridade: 5, quando: [{ campo: 'assunto', op: 'contem', valor: 'ssl' }, { campo: 'fila', op: 'igual', valor: 'bc' }], entao: { acao: 'ignorar' } },
      { id: 'c', ativa: false, criadaEm: '2026-08-01', prioridade: 9, quando: [{ campo: 'assunto', op: 'contem', valor: 'ssl' }], entao: { acao: 'ignorar' } },
    ];
    check('casa a de maior prioridade; inativa não conta', Regras.casarRegra(regras, fato).id === 'b');
    check('sem a fila, casa a outra', Regras.casarRegra(regras, { ...fato, fila: 'mpisolutions' }).id === 'a');
    check('nada casa → null', Regras.casarRegra(regras, { ...fato, assunto: 'Outra coisa' }) === null);
    const v = Regras.validarRegra({ quando: [{ campo: 'assunto', op: 'comeca', valor: 'Ativação de SSL' }], entao: { acao: 'encaminhar', agente: 'hospedagem', parametros: { acao: 'ssl' } } });
    check('validarRegra normaliza e descreve', v.ok && v.regra.ativa === true && /Quando assunto começa com "Ativação de SSL" → Huginn \(Hospedagem & E-mails\) com acao=ssl/.test(v.regra.descricao), v.regra.descricao);
    const v2 = Regras.validarRegra({ quando: [{ campo: 'x', op: 'igual', valor: '' }], entao: { acao: 'encaminhar', agente: 'ninguem' } });
    check('validarRegra acusa campo, valor e agente inválidos', !v2.ok && v2.erros.length === 3, v2.erros.join(' | '));
    check('validarRegra: regra vazia falha', !Regras.validarRegra({}).ok);
  }

  console.log('\n=== Validação de plano e de execução ===');
  {
    check('plano com agente desconhecido falha', !Regras.validarPlano({ agente: 'x' }).ok);
    check('plano sem o obrigatório falha com o nome do parâmetro', /obrigatório "temporario"/.test(Regras.validarPlano({ agente: 'publicador-mpiplus', parametros: { dominio: 'a.com.br' } }).erros.join()));
    check('plano completo passa', Regras.validarPlano({ agente: 'publicador-mpiplus', parametros: { dominio: 'a.com.br', temporario: 'a.mpitemporario.com.br' } }).ok);
    check('etapa com agente desconhecido falha', !Regras.validarPlano({ agente: 'bloqueador', parametros: { dominio: 'a.com.br' }, etapas: [{ agente: 'zzz' }] }).ok);
    const ctx = { configurado: (id) => ['google_sa', 'painel', 'salesforce', 'doutor'].includes(id), emEspera: (d) => (d === 'espera.com.br' ? { motivo: 'aguardando o cliente' } : null), marcaDoDominio: async (d) => (d === 'bc.com.br' ? { marca: 'bc', ips: ['149.18.103.98'] } : { marca: null, ips: ['1.2.3.4'] }), tarefasComDominio: (d) => (d === 'dup.com.br' ? [{ id: 'T9', agente: 'publicador-mpiplus', estado: 'concluida' }] : []) };
    let r = await Regras.validarExecucao('publicador-mpiplus', { dominio: 'a.com.br', temporario: 'a.mpitemporario.com.br', tarefaId: 'T1' }, ctx);
    check('MPI+ com tudo certo: todas as regras passam', r.ok && r.resultados.length === 7, JSON.stringify(r.resultados.filter((x) => !x.ok)));
    r = await Regras.validarExecucao('publicador-mpiplus', { dominio: 'espera.com.br', temporario: 'producao.mpitemporario.com.br', tarefaId: 'T1' }, ctx);
    check('MPI+ na lista de espera e com temporário errado: duas regras falham, com motivo', !r.ok && r.resultados.filter((x) => !x.ok).map((x) => x.id).join() === 'temporario-mpiplus,nao-em-espera', JSON.stringify(r.resultados.filter((x) => !x.ok)));
    r = await Regras.validarExecucao('publicador-mpiplus', { dominio: 'dup.com.br', temporario: 'd.mpitemporario.com.br', tarefaId: 'T1' }, ctx);
    check('domínio já concluído por este agente é duplicidade', r.resultados.find((x) => x.id === 'nao-duplicada').ok === false && /T9/.test(r.resultados.find((x) => x.id === 'nao-duplicada').motivo));
    r = await Regras.validarExecucao('bloqueador', { dominio: 'bc.com.br', tarefaId: 'T2' }, ctx);
    check('bloqueador: marca pelo IP e credencial do /doutor passam', r.ok, JSON.stringify(r.resultados.filter((x) => !x.ok)));
    r = await Regras.validarExecucao('bloqueador', { dominio: 'desconhecido.com.br', tarefaId: 'T2' }, ctx);
    check('bloqueador: IP desconhecido barra (não chuta a marca)', !r.ok && /não descobri a marca/.test(r.resultados.find((x) => x.id === 'marca-pelo-ip').motivo));
    r = await Regras.validarExecucao('publicador-mpiplus', { dominio: 'a.com.br', temporario: 'a.mpitemporario.com.br' }, {});
    check('sem contexto, verificação indisponível barra em vez de aprovar', !r.ok && r.resultados.filter((x) => /indisponível/.test(x.motivo)).length >= 3);
    r = await Regras.validarExecucao('hospedagem', { dominios: ['a.com.br'], acao: 'ssl' }, ctx);
    check('hospedagem: as verificações da fase 3 barram com aviso claro', !r.ok && r.resultados.some((x) => /fase 3/.test(x.motivo)));
    r = await Regras.validarExecucao('relator', {}, ctx);
    check('standby sem regras de execução passa (quem barra é o modo)', r.ok && r.resultados.length === 0);
  }

  console.log('\n=== Loja ===');
  {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-escritorio-'));
    let relogio = Date.parse('2026-10-13T10:00:00.000Z');
    const agora = () => new Date(relogio).toISOString();
    const loja = criarLoja({ pasta, agora });
    const c = loja.carregar();
    check('carrega vazia sem aviso', c.ok && c.avisos.length === 0 && loja.ligado.geral === false && loja.ligado.observacao === true);
    const { tarefa, nova } = loja.registrarDaFila({ id: '00T1', assunto: 'A', descricao: 'd', alterada: '1', fila: 'F' }, { link: 'L', empresaFila: 'bc' });
    check('registra tarefa nova na fila', nova && tarefa.estado === 'na_fila' && tarefa.link === 'L' && tarefa.empresaFila === 'bc' && tarefa.historico.length === 1);
    const r2 = loja.registrarDaFila({ id: '00T1', assunto: 'A', descricao: 'd2', alterada: '2' }, {});
    check('a mesma tarefa de novo não é nova, e nota que mudou', !r2.nova && r2.mudou && r2.tarefa.descricao === 'd2');
    const p = loja.criarPendencia({ padrao: 'x', pergunta: 'q?', tarefas: ['00T1'] });
    check('pendência com id sequencial', p.id === 'P-1' && loja.pendenciaAbertaPorPadrao('x') === p);
    const rg = loja.salvarRegra({ descricao: 'r', quando: [{ campo: 'assunto', op: 'contem', valor: 'a' }], entao: { acao: 'ignorar' } });
    check('regra ganha id e criadaEm', /^R-/.test(rg.id) && rg.criadaEm === agora());
    loja.registrarChamada({ entrada: 100, saida: 10, pensamento: 5 });
    loja.salvar();
    check('arquivos gravados, sem .tmp sobrando', fs.existsSync(loja.arquivo) && fs.existsSync(loja.arquivoRegras) && !fs.existsSync(loja.arquivo + '.tmp'));
    // Reabre: tudo volta, inclusive a pendência e a regra.
    const loja2 = criarLoja({ pasta, agora });
    loja2.carregar();
    check('reabrir devolve tarefa, pendência, regra e contadores', loja2.tarefa('00T1').descricao === 'd2' && loja2.pendencia('P-1').pergunta === 'q?' && loja2.listarRegras().length === 1 && loja2.contadores().chamadas === 1 && loja2.contadores().tokensEntrada === 100);
    // Tarefa executando ao fechar vira interrompida.
    Estados.transicionar(loja2.tarefa('00T1'), 'em_analise'); Estados.transicionar(loja2.tarefa('00T1'), 'planejada'); Estados.transicionar(loja2.tarefa('00T1'), 'executando');
    loja2.salvar();
    const loja3 = criarLoja({ pasta, agora });
    const c3 = loja3.carregar();
    check('executando ao reabrir vira interrompida', c3.interrompidas.join() === '00T1' && loja3.tarefa('00T1').estado === 'interrompida');
    // Contadores zeram quando muda o dia.
    relogio += 86400000;
    check('contadores zeram no dia seguinte', loja3.contadores().chamadas === 0);
    // Poda: concluída há mais de 30 dias sai.
    Estados.transicionar(loja3.tarefa('00T1'), 'concluida', 'fim', {}, () => '2026-08-01T00:00:00.000Z');
    check('poda tira concluída antiga', loja3.podar() === 1 && loja3.tarefa('00T1') === null);
    check('apagarRegra', loja3.apagarRegra(rg.id) === true && loja3.listarRegras().length === 0 && loja3.apagarRegra('nada') === false);
    // Arquivo estragado não trava: começa do zero com aviso.
    fs.writeFileSync(loja.arquivo, '{ isso não é json', 'utf-8');
    const loja4 = criarLoja({ pasta, agora });
    const c4 = loja4.carregar();
    check('JSON estragado: aviso e começa do zero', c4.ok && c4.avisos.length === 1 && Object.keys(loja4.estado.tarefas).length === 0);
    fs.rmSync(pasta, { recursive: true, force: true });
  }

  console.log('\n=== Triagem pelo modelo (pedido e resposta) ===');
  {
    check('padrão do assunto troca domínio e números', TriagemIa.padraoDoAssunto('Ativação de SSL - cliente.com.br (caso 00087159)') === 'ativacao de ssl - {dominio} (caso #)', TriagemIa.padraoDoAssunto('Ativação de SSL - cliente.com.br (caso 00087159)'));
    check('prefixo do assunto para a regra rápida', TriagemIa.prefixoDoAssunto('Ativação de SSL - cliente.com.br') === 'Ativação de SSL' && TriagemIa.prefixoDoAssunto('Trocar DNS cliente.com.br') === 'Trocar DNS');
    const tarefa = { id: '00T5', assunto: 'Ativação de SSL - cliente.com.br', descricao: 'Por favor ativar. Senha: segredo', empresaFila: 'bc', dono: 'Fila BC', donoTipo: 'Queue' };
    const tri = Triagem.triar(tarefa);
    const pedido = TriagemIa.montarPedidoTriagem({ tarefa, tri, contexto: { razao: 'CLIENTE LTDA', empresa: 'bc' }, regras: [{ ativa: true, descricao: 'Quando x → y' }, { ativa: false, descricao: 'desligada' }] });
    check('pedido: sistema com as regras inegociáveis e o catálogo', /Nunca chute/.test(pedido.sistema) && /publicador-mpiplus/.test(pedido.sistema) && !/testar/.test(pedido.sistema));
    check('pedido: conteúdo com a tarefa, a triagem, o contexto e só as regras ativas', /Assunto: Ativação de SSL/.test(pedido.conteudo) && /"tipo":"ignorar"/.test(pedido.conteudo) && /CLIENTE LTDA/.test(pedido.conteudo) && /Quando x → y/.test(pedido.conteudo) && !/desligada/.test(pedido.conteudo));
    check('pedido: schema de decisão com enum (plano, pergunta, avisar, ignorar) e a leitura do comentário obrigatória', pedido.schema.properties.decisao.enum.join() === 'plano,pergunta,avisar,ignorar' && pedido.schema.required.includes('decisao') && pedido.schema.required.includes('leitura') && pedido.schema.required.includes('categoria'));
    check('pedido: o sistema manda ler o comentário e explica "avisar"', /pedido de verdade está no COMENTÁRIO/.test(pedido.sistema) && /"avisar" é para pedido que é operação real/.test(pedido.sistema));
    const da = TriagemIa.interpretarDecisao({ leitura: 'Republicar o site em subdiretório que sumiu', categoria: 'Republicar Site (Subdiretório)!', trechoChave: 'republicar o site novamente', decisao: 'avisar', motivo: 'o Hub não publica subdiretório', confianca: 0.8 });
    check('decisão avisar: leitura, categoria em slug e trecho do comentário', da.decisao === 'avisar' && da.leitura === 'Republicar o site em subdiretório que sumiu' && da.categoria === 'republicar-site-subdiretorio' && da.trechoChave === 'republicar o site novamente', JSON.stringify(da));
    check('slug tira acento e pontuação', TriagemIa.slug('Troca de DNS: cliente') === 'troca-de-dns-cliente' && TriagemIa.slug('') === '');
    const ra = Regras.validarRegra(TriagemIa.interpretarRegra({ descricao: 'subdiretório → avisar', quando: [{ campo: 'assunto', op: 'comeca', valor: 'Ajuste Site MPI' }, { campo: 'descricao', op: 'contem', valor: 'republicar o site' }], acao: 'avisar', justificativa: 'j' }));
    check('regra "avisar" passa sem agente e descreve como avisar você', ra.ok && ra.regra.entao.acao === 'avisar' && /avisar você/.test(Regras.descreverRegra(ra.regra)), ra.erros.join());
    const rt = Regras.validarRegra(TriagemIa.regraRapida({ assuntoExemplo: 'Ajuste Site MPI - cliente.com.br', trechoChave: 'republicar o site novamente', acao: 'avisar', origem: 'P-3' }));
    check('regra rápida com trecho do comentário: assunto começa com + comentário contém, ação avisar', rt.ok && rt.regra.quando.length === 2 && rt.regra.quando[1].campo === 'descricao' && rt.regra.quando[1].op === 'contem' && rt.regra.quando[1].valor === 'republicar o site novamente' && rt.regra.entao.acao === 'avisar', JSON.stringify(rt.regra.quando));
    const d = TriagemIa.interpretarDecisao({ decisao: 'plano', motivo: 'é SSL', confianca: 0.9, agente: ' hospedagem ', parametros: [{ nome: 'dominios', valor: 'cliente.com.br' }, { nome: 'acao', valor: 'ssl' }], etapas: [{ agente: 'hospedagem', acao: 'enviar', parametros: [{ nome: 'a', valor: 'b' }] }, { agente: '' }], sugestaoStandby: 'auditor' });
    check('decisão plano: pares viram objeto, agente sem espaços, etapas limpas', d.decisao === 'plano' && d.agente === 'hospedagem' && d.parametros.dominios === 'cliente.com.br' && d.parametros.acao === 'ssl' && d.etapas.length === 1 && d.etapas[0].parametros.a === 'b' && d.sugestaoStandby === 'auditor');
    const d2 = TriagemIa.interpretarDecisao({ decisao: 'sei lá', confianca: 7 });
    check('decisão desconhecida vira pergunta; confiança limitada a 1', d2.decisao === 'pergunta' && d2.confianca === 1);
    check('resposta vazia vira pergunta', TriagemIa.interpretarDecisao(null).decisao === 'pergunta');
    const pr = TriagemIa.montarPedidoRegra({ pendencia: { pergunta: 'q?', padrao: 'p' }, resposta: 'sempre mandar para a hospedagem', tarefas: [tarefa] });
    check('pedido de regra leva pergunta, resposta e exemplos; schema com campos e operadores', /RESPOSTA DO OPERADOR: sempre mandar/.test(pr.conteudo) && /Assunto: Ativação/.test(pr.conteudo) && pr.schema.properties.quando.items.properties.campo.enum.includes('assunto') && pr.schema.properties.quando.items.properties.op.enum.includes('contem'));
    const rr = TriagemIa.interpretarRegra({ descricao: 'SSL → hospedagem', quando: [{ campo: 'assunto', op: 'comeca', valor: 'Ativação de SSL' }], acao: 'encaminhar', agente: 'hospedagem', parametros: [{ nome: 'acao', valor: 'ssl' }], justificativa: 'j' }, { origem: 'P-1' });
    const vr = Regras.validarRegra(rr);
    check('regra do modelo passa pela validação', vr.ok && vr.regra.entao.agente === 'hospedagem' && vr.regra.entao.parametros.acao === 'ssl' && vr.regra.origem === 'P-1', vr.erros.join());
    const rq = Regras.validarRegra(TriagemIa.regraRapida({ assuntoExemplo: 'Ativação de SSL - cliente.com.br', acao: 'ignorar', origem: 'P-2' }));
    check('regra rápida "ignorar sempre" pelo prefixo do assunto', rq.ok && rq.regra.quando[0].op === 'comeca' && rq.regra.quando[0].valor === 'Ativação de SSL' && rq.regra.entao.acao === 'ignorar');
    check('textoTarefa corta comentário longo', TriagemIa.textoTarefa({ id: 'x', descricao: 'a'.repeat(5000) }).length < 4300);
  }

  console.log('\n=== Adaptador do Gemini (cliente falso) ===');
  {
    check('config padrão: sugeridos, HIGH, teto 200', Ia.configPadrao().modeloOrquestrador === Ia.MODELOS_SUGERIDOS.orquestrador && Ia.configPadrao().nivelPensamento === 'HIGH' && Ia.configPadrao().tetoChamadasDia === 200);
    const n = Ia.normalizarConfig({ modeloOrquestrador: ' x ', nivelPensamento: 'low', tetoChamadasDia: '15', temperatura: 9 });
    check('normalizarConfig: apara, aceita nível em minúsculas, teto inteiro, temperatura no limite', n.modeloOrquestrador === 'x' && n.nivelPensamento === 'LOW' && n.tetoChamadasDia === 15 && n.temperatura === 2);
    check('normalizarConfig: nível inválido cai no padrão', Ia.normalizarConfig({ nivelPensamento: 'turbo' }).nivelPensamento === 'HIGH');
    check('extrairJson aceita cerca ```json', Ia.extrairJson('```json\n{"a":1}\n```').a === 1 && Ia.extrairJson(' {"b":2} ').b === 2);
    check('classificarErro: 429 é cota, 404 é modelo, 403 é chave, rede', Ia.classificarErro({ status: 429 }).codigo === 'cota' && Ia.classificarErro(new Error('got status: 404 Not Found')).codigo === 'modelo' && Ia.classificarErro({ message: 'API key not valid', status: 400 }).codigo === 'chave' && Ia.classificarErro(new Error('fetch failed')).codigo === 'rede');

    const chamadas = [];
    let proxima = () => ({ text: JSON.stringify({ decisao: 'plano' }), usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 50, totalTokenCount: 200 }, candidates: [{ finishReason: 'STOP' }] });
    const clienteFalso = () => ({
      models: {
        generateContent: async (p) => { chamadas.push(p); return proxima(p); },
        list: async () => {
          const itens = [{ name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedActions: ['generateContent'], inputTokenLimit: 1000 }, { name: 'models/embedding-001', displayName: 'Embedding', supportedActions: ['embedContent'] }, { name: 'models/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro', supportedActions: ['generateContent'] }];
          return { [Symbol.asyncIterator]: async function* () { for (const i of itens) yield i; } };
        },
      },
    });
    const registradas = [];
    let teto = { ok: true };
    const contador = { podeChamar: () => teto, registrar: (u) => registradas.push(u) };
    const ia = Ia.criarIa({ chave: 'k', config: { nivelPensamento: 'HIGH' }, criarCliente: clienteFalso, contador });
    check('configurada com chave', ia.configurada === true && ia.modeloDo('orquestrador') === Ia.MODELOS_SUGERIDOS.orquestrador && ia.modeloDo('agentes') === Ia.MODELOS_SUGERIDOS.agentes);
    const lm = await ia.listarModelos();
    check('listarModelos: só os que geram conteúdo, sem o prefixo models/, em ordem', lm.ok && lm.modelos.map((m) => m.id).join() === 'gemini-3.1-pro-preview,gemini-3.8-flash' && lm.modelos[1].entrada === 1000, JSON.stringify(lm));
    const r = await ia.gerarJson({ papel: 'orquestrador', sistema: 'S', conteudo: 'C', schema: { type: 'OBJECT' } });
    check('gerarJson: ok, dados, uso e modelo', r.ok && r.dados.decisao === 'plano' && r.uso.entrada === 120 && r.uso.pensamento === 50 && r.modelo === Ia.MODELOS_SUGERIDOS.orquestrador, JSON.stringify(r));
    const p = chamadas[0];
    check('gerarJson: pedido com modelo do papel, sistema, JSON, schema e nível de pensamento', p.model === Ia.MODELOS_SUGERIDOS.orquestrador && p.config.systemInstruction === 'S' && p.config.responseMimeType === 'application/json' && p.config.responseSchema.type === 'OBJECT' && p.config.thinkingConfig.thinkingLevel === 'HIGH' && p.contents === 'C', JSON.stringify(p.config));
    check('contador registrou o uso', registradas.length === 1 && registradas[0].saida === 30);
    const ra = await ia.gerarJson({ papel: 'agentes', conteudo: 'C' });
    check('papel agentes usa o modelo dos agentes', ra.ok && chamadas[1].model === Ia.MODELOS_SUGERIDOS.agentes);
    // Nível de pensamento recusado: repete sem ele.
    let vez = 0;
    proxima = () => { vez++; if (vez === 1) throw Object.assign(new Error('got status: 400 Bad Request. thinking level not supported'), { status: 400 }); return { text: '{"x":1}', candidates: [{ finishReason: 'STOP' }] }; };
    const rt = await ia.gerarJson({ conteudo: 'C' });
    check('nível de pensamento recusado: repete sem thinkingConfig e dá certo', rt.ok && rt.dados.x === 1 && !chamadas[chamadas.length - 1].config.thinkingConfig && chamadas[chamadas.length - 2].config.thinkingConfig);
    proxima = () => { throw Object.assign(new Error('429 Too Many Requests'), { status: 429 }); };
    const rc = await ia.gerarJson({ conteudo: 'C' });
    check('429 vira codigo cota com texto para a tela', !rc.ok && rc.codigo === 'cota' && /faturamento/.test(rc.erro));
    proxima = () => ({ text: 'isso não é json', candidates: [{ finishReason: 'STOP' }] });
    const rj = await ia.gerarJson({ conteudo: 'C' });
    check('resposta que não é JSON vira codigo json com o bruto', !rj.ok && rj.codigo === 'json' && rj.bruto === 'isso não é json');
    proxima = () => ({ text: '{"a":1', candidates: [{ finishReason: 'MAX_TOKENS' }] });
    const rm = await ia.gerarJson({ conteudo: 'C' });
    check('MAX_TOKENS vira cortado', !rm.ok && rm.codigo === 'cortado');
    teto = { ok: false, motivo: 'teto de 200 chamadas hoje' };
    const rteto = await ia.gerarJson({ conteudo: 'C' });
    check('teto diário barra antes de chamar', !rteto.ok && rteto.codigo === 'teto' && /200/.test(rteto.erro));
    const semChave = Ia.criarIa({ chave: '', criarCliente: clienteFalso });
    const rs = await semChave.gerarJson({ conteudo: 'C' });
    check('sem chave: codigo sem-chave, sem criar cliente', !semChave.configurada && !rs.ok && rs.codigo === 'sem-chave' && !(await semChave.listarModelos()).ok);
  }

  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo ok.');
  process.exit(falhas ? 1 : 0);
})();
