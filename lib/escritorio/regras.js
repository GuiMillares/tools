// Regras do Escritório (ADR-149, ADR-161), todas em código:
//
//   1. VALIDAÇÃO DO PLANO: o plano (do modelo ou da triagem) aponta um
//      agente que existe, com os parâmetros obrigatórios.
//   2. VALIDAÇÃO DE EXECUÇÃO: as regras de execução do agente (catálogo),
//      conferidas uma a uma antes de agir, com o resultado de cada uma.
//
// As "regras aprendidas" (base de conhecimento editada na tela) saíram na
// ADR-161: o que o Asgard aprende entra como código em lib/triagem.js, com
// a decisão registrada na ADR.
//
// Puro e dual (Node e navegador).
(function () {
const Catalogo = (typeof require !== 'undefined' ? require('./catalogo') : window.EscritorioCatalogo);

// Texto sem acento, minúsculo e sem espaços repetidos: o padrão do assunto
// das pendências (triagem-ia) usa isto.
function normalizar(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ---------- 1. validação do plano ----------
//
// plano: { agente, parametros: {…}, etapas: [{ agente, acao, parametros }],
//          origem: 'triagem' | 'modelo' | 'operador', motivo }
// Só a forma: o agente existe, os obrigatórios estão lá, as etapas apontam
// agentes que existem. Standby é aceito no plano (vira sugestão, nunca
// execução automática): quem barra a execução é o orquestrador.
function validarPlano(plano) {
  const erros = [];
  const p = plano && typeof plano === 'object' ? plano : {};
  const agente = Catalogo.agentePorId(p.agente);
  if (!agente) erros.push(`agente desconhecido "${p.agente || ''}"`);
  const params = p.parametros && typeof p.parametros === 'object' ? p.parametros : {};
  if (agente) {
    for (const k of agente.parametros.obrigatorios || []) {
      const v = params[k];
      if (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) erros.push(`falta o parâmetro obrigatório "${k}" do ${agente.nome}`);
    }
  }
  const etapas = Array.isArray(p.etapas) ? p.etapas : [];
  etapas.forEach((e, i) => {
    if (!e || !Catalogo.agentePorId(e.agente)) erros.push(`etapa ${i + 1}: agente desconhecido "${e && e.agente}"`);
  });
  return { ok: !erros.length, erros, agente };
}

// ---------- 2. validação de execução ----------
//
// Roda as regras de execução do agente, em ordem, e devolve o resultado de
// cada uma (vai para o histórico da tarefa). Para na primeira que falha?
// Não: confere todas, para a pendência dizer tudo que falta de uma vez.
async function validarExecucao(agenteId, parametros, ctx) {
  const agente = Catalogo.agentePorId(agenteId);
  if (!agente) return { ok: false, resultados: [], erro: `agente desconhecido "${agenteId}"` };
  const resultados = [];
  for (const r of agente.regrasExecucao || []) {
    let res;
    try { res = await r.testar(parametros || {}, ctx || {}, agente); } catch (e) { res = { ok: false, motivo: `erro ao conferir: ${e && e.message ? e.message : e}` }; }
    resultados.push({ id: r.id, nome: r.nome, ok: !!(res && res.ok), motivo: (res && res.motivo) || '', detalhe: (res && res.detalhe) || '' });
  }
  return { ok: resultados.every((x) => x.ok), resultados };
}

const _exports = { normalizar, validarPlano, validarExecucao };
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.EscritorioRegras = _exports;
})();
