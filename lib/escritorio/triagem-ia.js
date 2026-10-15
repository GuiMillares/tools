// A triagem pelo modelo (ADR-149, ADR-161): o que o orquestrador pergunta ao
// Gemini quando a triagem em código não resolve, e como a resposta é lida.
// (A proposta de regra pelo modelo saiu na ADR-161: o aprendizado é por ADR.) Só monta pedidos e interpreta respostas; quem chama o
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
  required: ['leitura', 'categoria', 'decisao', 'motivo', 'confianca'],
  propertyOrdering: ['leitura', 'categoria', 'decisao', 'motivo', 'confianca', 'agente', 'parametros', 'etapas', 'pergunta', 'sugestaoStandby'],
  properties: {
    leitura: { type: 'STRING', description: 'uma linha, em português, dizendo o que o COMENTÁRIO da tarefa pede de fato (o assunto costuma ser genérico)' },
    categoria: { type: 'STRING', description: 'o tipo do pedido lido no comentário, em 2 a 5 palavras minúsculas separadas por hífen (ex.: republicar-site-subdiretorio, trocar-dns, bloquear-contatos)' },
    decisao: { type: 'STRING', enum: ['plano', 'pergunta', 'avisar', 'ignorar'], description: 'plano: sei o que fazer e com qual agente; pergunta: não sei ou tenho dúvida razoável; avisar: é operação real, mas nenhum agente do catálogo faz isso, o operador precisa ser avisado; ignorar: não é tarefa para o Hub' },
    motivo: { type: 'STRING', description: 'uma ou duas frases, em português, explicando a decisão' },
    confianca: { type: 'NUMBER', description: 'de 0 a 1' },
    agente: { type: 'STRING', nullable: true, description: 'id do agente do catálogo, quando decisao = plano' },
    parametros: { ...PARES, description: 'os parâmetros do agente, tirados da tarefa (nunca inventados)' },
    etapas: { type: 'ARRAY', items: { type: 'OBJECT', required: ['agente', 'acao'], properties: { agente: { type: 'STRING' }, acao: { type: 'STRING' }, parametros: PARES } }, description: 'quando a tarefa envolve mais de um agente em sequência' },
    pergunta: { type: 'STRING', nullable: true, description: 'a pergunta para o operador, quando decisao = pergunta' },
    sugestaoStandby: { type: 'STRING', nullable: true, description: 'id de um agente em standby que esta tarefa parece precisar, se houver' },
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
  'O ASSUNTO da tarefa costuma ser genérico ("Ajuste Site MPI", "Solicitação") e o pedido de verdade está no COMENTÁRIO: leia o comentário inteiro antes de decidir, resuma em uma linha (leitura) e classifique o tipo do pedido (categoria). Tarefas com o mesmo assunto podem pedir coisas diferentes.',
  'Regras inegociáveis:',
  '- Nunca chute. Parâmetro que não está escrito na tarefa não existe: se faltar, a decisão é "pergunta".',
  '- "avisar" é para pedido que é operação real (republicar site, corrigir página, conflito entre produtos), mas que nenhum agente do catálogo faz: o operador precisa saber e tratar à mão. Diga na leitura o que ele precisa fazer.',
  '- Dúvida razoável também é "pergunta". Uma pergunta custa minutos; uma ação errada custa um site de cliente.',
  '- Só encaminhe para agentes do catálogo, pelo id exato. Agente em standby pode ser sugerido em sugestaoStandby, nunca escolhido como agente do plano.',
  '- Domínio é sempre o do cliente, nunca um host de infraestrutura (mpitemporario, buscacliente, idealtrends, bitbucket, salesforce, google).',
  '- "ignorar" é só para tarefa que claramente não é operação do Hub (reunião, cobrança, pedido comercial). Em dúvida, pergunte.',
  '- Responda em português, no JSON do schema, sem texto fora dele.',
].join('\n');

// Monta o pedido de triagem. `tri` é a saída de lib/triagem.js; `contexto`
// é o que o Salesforce disse do caso (razão social, empresa), quando houver.
function montarPedidoTriagem({ tarefa, tri, contexto = null } = {}) {
  const sistema = `${SISTEMA_TRIAGEM}\n\nCatálogo de agentes (JSON):\n${JSON.stringify(Catalogo.catalogoParaModelo())}`;
  const partes = [];
  partes.push('TAREFA DA FILA:\n' + textoTarefa(tarefa || {}));
  partes.push('TRIAGEM DETERMINÍSTICA (regex do Hub): ' + JSON.stringify({ tipo: tri && tri.tipo, plataforma: tri && tri.plataforma, dominio: tri && tri.dominio, temporario: tri && tri.temporario, elegivel: !!(tri && tri.elegivel), motivo: tri && tri.motivo }));
  if (contexto && (contexto.razao || contexto.empresa)) partes.push('CONTEXTO DO CASO NO SALESFORCE: ' + JSON.stringify({ razaoSocial: contexto.razao || '', empresa: contexto.empresa || '', via: contexto.via || '' }));
  partes.push('Decida conforme as regras inegociáveis.');
  return { sistema, conteudo: partes.join('\n\n'), schema: SCHEMA_DECISAO };
}

// "Republicar site em subdiretório" → "republicar-site-em-subdiretorio".
function slug(v) {
  return Regras.normalizar(v).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
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
  const decisao = ['plano', 'pergunta', 'avisar', 'ignorar'].includes(d.decisao) ? d.decisao : 'pergunta';
  const conf = Number(d.confianca);
  return {
    decisao,
    leitura: String(d.leitura || '').trim(),
    categoria: slug(d.categoria),
    motivo: String(d.motivo || '').trim(),
    confianca: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0,
    agente: d.agente ? String(d.agente).trim() : '',
    parametros: paresParaObjeto(d.parametros),
    etapas: (Array.isArray(d.etapas) ? d.etapas : []).filter((e) => e && e.agente).map((e) => ({ agente: String(e.agente).trim(), acao: String(e.acao || '').trim(), parametros: paresParaObjeto(e.parametros) })),
    pergunta: String(d.pergunta || '').trim(),
    sugestaoStandby: d.sugestaoStandby ? String(d.sugestaoStandby).trim() : '',
  };
}

const _exports = { SCHEMA_DECISAO, SISTEMA_TRIAGEM, padraoDoAssunto, slug, textoTarefa, montarPedidoTriagem, interpretarDecisao, paresParaObjeto };
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.EscritorioTriagemIa = _exports;
})();
