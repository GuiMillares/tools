// Pedidos ao suporte da hospedagem (ADR-152): os modelos de e-mail de
// suspensão e de ativação de SSL, os mesmos da tela "Suspender sites /
// Ativar SSL" (ADR-023, ADR-057), para o Huginn mandar pela fila o que a
// tela manda à mão. Só o domínio (e, no SSL, o projeto) muda no modelo.
//
// Puro e dual (Node e navegador). O que o usuário editou na tela fica no
// hub-state (`mail` para a suspensão, `mailSsl` para o SSL) e vence o padrão.
(function () {
const Triagem = (typeof require !== 'undefined' ? require('./triagem') : window.Triagem);

const MODELOS = {
  suspensao: {
    chaveEstado: 'mail',
    rotulo: 'pedido de suspensão',
    defaults: { to: 'suporte@m3solutions.com.br', cc: 'everton.lima@buscacliente.com.br', subject: 'Suspensão de site - {dominio}', body: 'Solicito a suspensão do site {dominio}' },
    projeto: false,
  },
  ssl: {
    chaveEstado: 'mailSsl',
    rotulo: 'pedido de ativação de SSL',
    defaults: { to: 'suporte@m3solutions.com.br', cc: 'everton.lima@buscacliente.com.br', subject: 'Ativação SSL - {projeto} - {dominio}', body: 'Solicito ativação SSL do projeto {dominio}' },
    projeto: true,
  },
};
const PROJETOS = { bc: 'Busca Cliente', mpisolutions: 'MPI Solutions' };

function acaoNormalizada(v) {
  const s = String(v || '').toLowerCase().trim();
  if (/^(ssl|ativa)/.test(s)) return 'ssl';
  if (/^susp/.test(s)) return 'suspensao';
  return '';
}

// "a.com.br, b.com.br" ou ['a.com.br'] → domínios limpos, únicos, de cliente.
function listaDominios(v) {
  const brutos = Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/);
  const saida = [];
  for (const b of brutos) {
    const d = Triagem.limparDominio(b);
    if (!d || !Triagem.pareceDominio(d) || Triagem.ehHostInfra(d) || saida.includes(d)) continue;
    saida.push(d);
  }
  return saida;
}

// Os domínios de uma tarefa: o da triagem primeiro, depois os outros hosts
// de cliente do assunto e do comentário (sem e-mails, sem os nossos).
function dominiosDaTarefa(tarefa, tri) {
  const t = tarefa || {};
  const texto = `${t.assunto || ''}\n${String(t.descricao || '').replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, ' ')}`;
  return listaDominios([tri && tri.dominio, ...Triagem.hostsDoTexto(texto)].filter(Boolean));
}

const lista = (v) => (Array.isArray(v) ? v : String(v || '').split(/[;,]+/)).map((s) => String(s).trim()).filter(Boolean);

// O pedido pronto para o mail:sendBatch: destinatários e modelos (o
// {dominio} é preenchido lá, um e-mail por domínio; o {projeto} aqui).
function montarPedido({ acao, projeto = '', cfg = {} } = {}) {
  const a = acaoNormalizada(acao);
  const m = MODELOS[a];
  if (!m) return null;
  // O que a tela gravou vence, inclusive em branco (cc vazio = sem cópia), como
  // o mailSettings() do renderer; só chave ausente cai no padrão.
  const editado = cfg && cfg[m.chaveEstado] && typeof cfg[m.chaveEstado] === 'object' ? cfg[m.chaveEstado] : {};
  const v = { ...m.defaults, ...Object.fromEntries(Object.entries(editado).filter(([, x]) => x != null)) };
  const proj = m.projeto ? (PROJETOS[projeto] || projeto || PROJETOS.bc) : '';
  const comProjeto = (s) => String(s || '').replace(/\{\s*projeto\s*\}/gi, proj);
  return { acao: a, rotulo: m.rotulo, projeto: proj, to: lista(v.to), cc: lista(v.cc), subjectTemplate: comProjeto(v.subject), bodyTemplate: comProjeto(v.body) };
}

// Os domínios para os quais esta tarefa já mandou e-mail (pelo histórico do
// Escritório), para não mandar duas vezes.
function jaEnviados(tarefa) {
  const h = tarefa && Array.isArray(tarefa.historico) ? tarefa.historico : [];
  const saida = [];
  for (const e of h) {
    if (e && e.tipo === 'execucao' && e.detalhe && Array.isArray(e.detalhe.enviados)) for (const d of e.detalhe.enviados) if (!saida.includes(d)) saida.push(d);
  }
  return saida;
}

const _exports = { MODELOS, PROJETOS, acaoNormalizada, listaDominios, dominiosDaTarefa, montarPedido, jaEnviados };
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.Hospedagem = _exports;
})();
