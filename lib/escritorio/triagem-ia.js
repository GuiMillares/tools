// A triagem pelo modelo (ADR-149): o que o orquestrador pergunta ao Gemini
// quando a triagem determinística e as regras aprendidas não resolvem, e como
// a resposta é lida. Só monta pedidos e interpreta respostas; quem chama o
// modelo é lib/escritorio/ia.js, e quem decide o que fazer com a resposta é
// o orquestrador, depois de validar em código.
//
// Puro e dual (Node e navegador).
(function () {
const Catalogo = (typeof require !== 'undefined' ? require('./catalogo') : window.EscritorioCatalogo);
const Regras = (typeof require !== 'undefined' ? require('./regras') : window.EscritorioRegras);

// O formato Schema do Gemini (subconjunto do OpenAPI). "parametros" vai como
// lista de pares nome/valor porque objeto livre não cabe no responseSchema.
const PARES = { type: 'ARRAY', items: { type: 'OBJECT', required: ['nome', 'valor'], properties: { nome: { type: 'STRING' }, valor: { type: 'STRING' } } } };

const SCHEMA_DECISAO = {
  type: 'OBJECT',
  required: ['decisao', 'motivo', 'confianca'],
  propertyOrdering: ['decisao', 'motivo', 'confianca', 'agente', 'parametros', 'etapas', 'pergunta', 'sugestaoStandby'],
  properties: {
    decisao: { type: 'STRING', enum: ['plano', 'pergunta', 'ignorar'], description: 'plano: sei o que fazer e com qual agente; pergunta: não sei ou tenho dúvida razoável; ignorar: não é tarefa para o Hub' },
    motivo: { type: 'STRING', description: 'uma ou duas frases, em português, explicando a decisão' },
    confianca: { type: 'NUMBER', description: 'de 0 a 1' },
    agente: { type: 'STRING', nullable: true, description: 'id do agente do catálogo, quando decisao = plano' },
    parametros: { ...PARES, description: 'os parâmetros do agente, tirados da tarefa (nunca inventados)' },
    etapas: { type: 'ARRAY', items: { type: 'OBJECT', required: ['agente', 'acao'], properties: { agente: { type: 'STRING' }, acao: { type: 'STRING' }, parametros: PARES } }, description: 'quando a tarefa envolve mais de um agente em sequência' },
    pergunta: { type: 'STRING', nullable: true, description: 'a pergunta para o operador, quando decisao = pergunta' },
    sugestaoStandby: { type: 'STRING', nullable: true, description: 'id de um agente em standby que esta tarefa parece precisar, se houver' },
  },
};

const SCHEMA_REGRA = {
  type: 'OBJECT',
  required: ['descricao', 'quando', 'acao'],
  propertyOrdering: ['descricao', 'quando', 'acao', 'agente', 'parametros', 'justificativa'],
  properties: {
    descricao: { type: 'STRING', description: 'uma linha, em português, do que a regra faz' },
    quando: { type: 'ARRAY', items: { type: 'OBJECT', required: ['campo', 'op', 'valor'], properties: { campo: { type: 'STRING', enum: Regras.CAMPOS }, op: { type: 'STRING', enum: Regras.OPS }, valor: { type: 'STRING' } } } },
    acao: { type: 'STRING', enum: ['encaminhar', 'ignorar'] },
    agente: { type: 'STRING', nullable: true },
    parametros: PARES,
    justificativa: { type: 'STRING' },
  },
};

// O padrão de um assunto, para agrupar numa pendência só as tarefas que são
// "do mesmo tipo": domínios viram {dominio}, números viram #, acentos saem.
function padraoDoAssunto(assunto) {
  let s = Regras.normalizar(assunto);
  s = s.replace(/[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}(?:\.[a-z]{2,})?/g, '{dominio}');
  s = s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  return s;
}

// O trecho do assunto que identifica o tipo (antes do primeiro " - " ou do
// domínio), para a regra deterministica de "ignorar sempre / encaminhar".
function prefixoDoAssunto(assunto) {
  const s = String(assunto || '').trim();
  const corte = s.search(/\s-\s|[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}/i);
  return (corte > 0 ? s.slice(0, corte) : s).trim();
}

function textoTarefa(t) {
  return [
    `Id: ${t.id}`,
    `Assunto: ${t.assunto || ''}`,
    `Fila (empresa): ${t.empresaFila === 'bc' ? 'Busca Cliente' : t.empresaFila === 'mpisolutions' ? 'MPI Solutions' : 'nenhuma'}`,
    `Dono: ${t.dono || ''}${t.donoTipo ? ' (' + t.donoTipo + ')' : ''}`,
    `Prioridade: ${t.prioridade || ''} · Prazo: ${t.prazo || 'sem'}`,
    `Relacionado a: ${t.relativo || ''}${t.relativoTipo ? ' (' + t.relativoTipo + ')' : ''}`,
    `Comentário:\n${String(t.descricao || '').slice(0, 4000)}`,
  ].join('\n');
}

const SISTEMA_TRIAGEM = [
  'Você é o orquestrador do Hub, uma ferramenta interna de uma agência que publica sites de clientes (marcas Busca Cliente, MPI Solutions e MPI+).',
  'Sua função: ler UMA tarefa da fila de deploy do Salesforce e decidir se ela vai para um agente do catálogo (com quais parâmetros e em que ordem), se precisa de uma pergunta ao operador, ou se deve ser ignorada.',
  'Regras inegociáveis:',
  '- Nunca chute. Parâmetro que não está escrito na tarefa não existe: se faltar, a decisão é "pergunta".',
  '- Dúvida razoável também é "pergunta". Uma pergunta custa minutos; uma ação errada custa um site de cliente.',
  '- Só encaminhe para agentes do catálogo, pelo id exato. Agente em standby pode ser sugerido em sugestaoStandby, nunca escolhido como agente do plano.',
  '- Domínio é sempre o do cliente, nunca um host de infraestrutura (mpitemporario, buscacliente, idealtrends, bitbucket, salesforce, google).',
  '- "ignorar" é só para tarefa que claramente não é operação do Hub (reunião, cobrança, pedido comercial). Em dúvida, pergunte.',
  '- Responda em português, no JSON do schema, sem texto fora dele.',
].join('\n');

// Monta o pedido de triagem. `tri` é a saída de lib/triagem.js; `regras` são
// as aprendidas ativas (só descrições, para o modelo saber o que já foi
// decidido); `contexto` é o que o Salesforce disse do caso (razão social,
// empresa), quando houver.
function montarPedidoTriagem({ tarefa, tri, contexto = null, regras = [] } = {}) {
  const sistema = `${SISTEMA_TRIAGEM}\n\nCatálogo de agentes (JSON):\n${JSON.stringify(Catalogo.catalogoParaModelo())}`;
  const partes = [];
  partes.push('TAREFA DA FILA:\n' + textoTarefa(tarefa || {}));
  partes.push('TRIAGEM DETERMINÍSTICA (regex do Hub): ' + JSON.stringify({ tipo: tri && tri.tipo, plataforma: tri && tri.plataforma, dominio: tri && tri.dominio, temporario: tri && tri.temporario, elegivel: !!(tri && tri.elegivel), motivo: tri && tri.motivo }));
  if (contexto && (contexto.razao || contexto.empresa)) partes.push('CONTEXTO DO CASO NO SALESFORCE: ' + JSON.stringify({ razaoSocial: contexto.razao || '', empresa: contexto.empresa || '', via: contexto.via || '' }));
  const ativas = (regras || []).filter((r) => r && r.ativa !== false).map((r) => '- ' + (r.descricao || Regras.descreverRegra(r)));
  partes.push(ativas.length ? 'REGRAS APRENDIDAS JÁ EXISTENTES (nenhuma casou com esta tarefa):\n' + ativas.join('\n') : 'REGRAS APRENDIDAS: nenhuma ainda.');
  partes.push('Decida conforme as regras inegociáveis.');
  return { sistema, conteudo: partes.join('\n\n'), schema: SCHEMA_DECISAO };
}

function paresParaObjeto(lista) {
  const o = {};
  for (const p of Array.isArray(lista) ? lista : []) {
    if (p && typeof p.nome === 'string' && p.nome.trim()) o[p.nome.trim()] = p.valor == null ? '' : String(p.valor);
  }
  return o;
}

// A resposta do modelo, normalizada. Decisão desconhecida vira "pergunta".
function interpretarDecisao(dados) {
  const d = dados && typeof dados === 'object' ? dados : {};
  const decisao = ['plano', 'pergunta', 'ignorar'].includes(d.decisao) ? d.decisao : 'pergunta';
  const conf = Number(d.confianca);
  return {
    decisao,
    motivo: String(d.motivo || '').trim(),
    confianca: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0,
    agente: d.agente ? String(d.agente).trim() : '',
    parametros: paresParaObjeto(d.parametros),
    etapas: (Array.isArray(d.etapas) ? d.etapas : []).filter((e) => e && e.agente).map((e) => ({ agente: String(e.agente).trim(), acao: String(e.acao || '').trim(), parametros: paresParaObjeto(e.parametros) })),
    pergunta: String(d.pergunta || '').trim(),
    sugestaoStandby: d.sugestaoStandby ? String(d.sugestaoStandby).trim() : '',
  };
}

const SISTEMA_REGRA = [
  'Você escreve regras de encaminhamento para o Hub a partir da resposta de um operador humano a uma pergunta sobre tarefas da fila do Salesforce.',
  'Uma regra é: condições (todas verdadeiras) sobre os campos da tarefa → ação (encaminhar para um agente do catálogo, ou ignorar).',
  `Campos disponíveis: ${Regras.CAMPOS.join(', ')}. Operadores: ${Regras.OPS.join(', ')}.`,
  'Escreva a condição mais específica que cubra TODAS as tarefas de exemplo e nenhuma outra: prefira "assunto contem <trecho fixo do assunto>" a regex; nunca use o domínio ou o número de um caso como condição.',
  'Parâmetros fixos só quando a resposta do operador os deu explicitamente (uma empresa, uma ação); o resto vem da própria tarefa.',
  'Responda em português, no JSON do schema.',
].join('\n');

function montarPedidoRegra({ pendencia, resposta, tarefas = [] } = {}) {
  const sistema = `${SISTEMA_REGRA}\n\nCatálogo de agentes (JSON):\n${JSON.stringify(Catalogo.catalogoParaModelo())}`;
  const exemplos = (tarefas || []).slice(0, 5).map((t) => textoTarefa(t)).join('\n---\n');
  const conteudo = [
    `PERGUNTA FEITA AO OPERADOR: ${pendencia && pendencia.pergunta ? pendencia.pergunta : ''}`,
    `PADRÃO DO ASSUNTO: ${pendencia && pendencia.padrao ? pendencia.padrao : ''}`,
    `RESPOSTA DO OPERADOR: ${String(resposta || '')}`,
    `TAREFAS DE EXEMPLO:\n${exemplos || '(nenhuma)'}`,
    'Escreva a regra.',
  ].join('\n\n');
  return { sistema, conteudo, schema: SCHEMA_REGRA };
}

function interpretarRegra(dados, { origem = '' } = {}) {
  const d = dados && typeof dados === 'object' ? dados : {};
  return {
    descricao: String(d.descricao || '').trim(),
    origem,
    quando: Array.isArray(d.quando) ? d.quando : [],
    entao: { acao: d.acao === 'ignorar' ? 'ignorar' : 'encaminhar', agente: d.agente ? String(d.agente).trim() : '', parametros: paresParaObjeto(d.parametros) },
    justificativa: String(d.justificativa || '').trim(),
  };
}

// Regra determinística (sem modelo) para as respostas rápidas da tela:
// "ignorar sempre" e "encaminhar sempre para X" tarefas com o mesmo prefixo
// de assunto. Quem quiser mais fino edita na tela.
function regraRapida({ assuntoExemplo, acao, agente = '', parametros = {}, origem = '' } = {}) {
  const prefixo = prefixoDoAssunto(assuntoExemplo);
  return {
    descricao: '',
    origem,
    quando: [{ campo: 'assunto', op: 'comeca', valor: prefixo }],
    entao: { acao: acao === 'ignorar' ? 'ignorar' : 'encaminhar', agente, parametros: parametros || {} },
  };
}

const _exports = { SCHEMA_DECISAO, SCHEMA_REGRA, SISTEMA_TRIAGEM, SISTEMA_REGRA, padraoDoAssunto, prefixoDoAssunto, textoTarefa, montarPedidoTriagem, interpretarDecisao, montarPedidoRegra, interpretarRegra, regraRapida, paresParaObjeto };
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.EscritorioTriagemIa = _exports;
})();
