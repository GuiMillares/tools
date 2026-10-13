// Regras do Escritório (ADR-149), todas em código:
//
//   1. REGRAS APRENDIDAS (base de conhecimento): "tarefa com tal cara vai para
//      tal agente, com tais parâmetros". Nascem de uma pendência que você
//      respondeu, ficam num JSON e são casadas aqui por predicados simples,
//      nunca pelo modelo.
//   2. VALIDAÇÃO DO PLANO: o plano (do modelo, de uma regra ou da triagem)
//      aponta um agente que existe, com os parâmetros obrigatórios.
//   3. VALIDAÇÃO DE EXECUÇÃO: as regras de execução do agente (catálogo),
//      conferidas uma a uma antes de agir, com o resultado de cada uma.
//
// Puro e dual (Node e navegador).
(function () {
const Catalogo = (typeof require !== 'undefined' ? require('./catalogo') : window.EscritorioCatalogo);

// ---------- 1. regras aprendidas ----------
//
// Uma regra:
// {
//   id, criadaEm, origem (texto: "pendência P-3, respondida em 14/10/2026"),
//   ativa: true,
//   quando: [ { campo, op, valor } ],   // todos têm que valer (E lógico)
//   entao: { acao: 'encaminhar' | 'ignorar', agente, parametros: {…}, etapas: [...] },
//   descricao (uma linha, como você vê na tela), usos (contador)
// }
// Campos do FATO que as condições enxergam: assunto, descricao, fila
// ('bc' | 'mpisolutions' | ''), tipo, plataforma, dominio, temporario,
// marca, elegivel, dono, prioridade, relativoTipo.
const OPS = ['igual', 'diferente', 'contem', 'naoContem', 'comeca', 'termina', 'regex', 'vazio', 'naoVazio'];
const CAMPOS = ['assunto', 'descricao', 'fila', 'tipo', 'plataforma', 'dominio', 'temporario', 'marca', 'elegivel', 'dono', 'prioridade', 'relativoTipo'];

function normalizar(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function testarCondicao(cond, fato) {
  if (!cond || !CAMPOS.includes(cond.campo) || !OPS.includes(cond.op)) return false;
  const bruto = fato ? fato[cond.campo] : undefined;
  const v = normalizar(bruto === true ? 'sim' : bruto === false ? 'nao' : bruto);
  const alvo = normalizar(cond.valor);
  switch (cond.op) {
    case 'igual': return v === alvo;
    case 'diferente': return v !== alvo;
    case 'contem': return !!alvo && v.includes(alvo);
    case 'naoContem': return !alvo || !v.includes(alvo);
    case 'comeca': return !!alvo && v.startsWith(alvo);
    case 'termina': return !!alvo && v.endsWith(alvo);
    case 'vazio': return v === '';
    case 'naoVazio': return v !== '';
    case 'regex': {
      try { return new RegExp(String(cond.valor || ''), 'i').test(String(bruto == null ? '' : bruto)); } catch (e) { return false; }
    }
    default: return false;
  }
}

// Uma regra sem condição não casa com nada: regra vazia encaminharia a fila
// inteira para um agente por engano.
function regraCasa(regra, fato) {
  if (!regra || regra.ativa === false) return false;
  const conds = Array.isArray(regra.quando) ? regra.quando : [];
  if (!conds.length) return false;
  return conds.every((c) => testarCondicao(c, fato));
}

// A primeira regra ativa que casa, na ordem: prioridade (maior primeiro) e
// depois a mais antiga. Devolve a regra ou null.
function casarRegra(regras, fato) {
  const lista = (Array.isArray(regras) ? regras : []).filter((r) => r && r.ativa !== false);
  lista.sort((a, b) => (Number(b.prioridade) || 0) - (Number(a.prioridade) || 0) || String(a.criadaEm || '').localeCompare(String(b.criadaEm || '')));
  return lista.find((r) => regraCasa(r, fato)) || null;
}

// Confere a forma de uma regra antes de gravar (vinda do modelo ou editada na
// tela). Devolve { ok, erros[] , regra (normalizada) }.
function validarRegra(bruta) {
  const erros = [];
  const r = bruta && typeof bruta === 'object' ? bruta : {};
  const quando = Array.isArray(r.quando) ? r.quando : [];
  if (!quando.length) erros.push('a regra precisa de ao menos uma condição');
  quando.forEach((c, i) => {
    if (!c || !CAMPOS.includes(c.campo)) erros.push(`condição ${i + 1}: campo inválido "${c && c.campo}"`);
    if (!c || !OPS.includes(c.op)) erros.push(`condição ${i + 1}: operador inválido "${c && c.op}"`);
    if (c && c.op === 'regex') { try { new RegExp(String(c.valor || '')); } catch (e) { erros.push(`condição ${i + 1}: expressão inválida`); } }
    if (c && !['vazio', 'naoVazio'].includes(c.op) && String(c.valor == null ? '' : c.valor).trim() === '') erros.push(`condição ${i + 1}: sem valor`);
  });
  const entao = r.entao && typeof r.entao === 'object' ? r.entao : {};
  const acao = entao.acao === 'ignorar' ? 'ignorar' : 'encaminhar';
  if (acao === 'encaminhar') {
    if (!entao.agente || !Catalogo.agentePorId(entao.agente)) erros.push(`agente desconhecido "${entao.agente || ''}"`);
  }
  const regra = {
    id: String(r.id || '').trim() || null,
    criadaEm: r.criadaEm || null,
    origem: String(r.origem || ''),
    descricao: String(r.descricao || '').trim(),
    ativa: r.ativa !== false,
    prioridade: Number(r.prioridade) || 0,
    usos: Number(r.usos) || 0,
    quando: quando.map((c) => ({ campo: c && c.campo, op: c && c.op, valor: c && c.valor == null ? '' : String(c.valor) })),
    entao: {
      acao,
      agente: acao === 'encaminhar' ? String(entao.agente || '') : '',
      parametros: entao.parametros && typeof entao.parametros === 'object' && !Array.isArray(entao.parametros) ? { ...entao.parametros } : {},
      etapas: Array.isArray(entao.etapas) ? entao.etapas.filter(Boolean).map(String) : [],
    },
  };
  if (!regra.descricao) regra.descricao = descreverRegra(regra);
  return { ok: !erros.length, erros, regra };
}

const ROTULO_OP = { igual: '=', diferente: '≠', contem: 'contém', naoContem: 'não contém', comeca: 'começa com', termina: 'termina com', regex: 'bate com', vazio: 'está vazio', naoVazio: 'não está vazio' };
function descreverRegra(regra) {
  const conds = (regra.quando || []).map((c) => `${c.campo} ${ROTULO_OP[c.op] || c.op}${['vazio', 'naoVazio'].includes(c.op) ? '' : ` "${c.valor}"`}`).join(' e ');
  const e = regra.entao || {};
  const acao = e.acao === 'ignorar' ? 'ignorar' : `${(Catalogo.agentePorId(e.agente) || { nome: e.agente }).nome}`;
  const params = e.parametros && Object.keys(e.parametros).length ? ` com ${Object.entries(e.parametros).map(([k, v]) => `${k}=${v}`).join(', ')}` : '';
  return `Quando ${conds} → ${acao}${params}`;
}

// O "fato" que as condições enxergam, a partir da tarefa (como o
// salesforce:tarefas devolve) e da triagem.
function fatoDaTarefa(tarefa, tri) {
  const t = tarefa || {};
  const r = tri || {};
  return {
    assunto: t.assunto || '',
    descricao: t.descricao || '',
    fila: t.empresaFila || '',
    tipo: r.tipo || '',
    plataforma: r.plataforma || '',
    dominio: r.dominio || '',
    temporario: r.temporario || '',
    marca: r.marca || '',
    elegivel: !!r.elegivel,
    dono: t.dono || '',
    prioridade: t.prioridade || '',
    relativoTipo: t.relativoTipo || '',
  };
}

// ---------- 2. validação do plano ----------
//
// plano: { agente, parametros: {…}, etapas: [{ agente, acao, parametros }],
//          origem: 'triagem' | 'regra' | 'modelo', motivo }
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

// ---------- 3. validação de execução ----------
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

const _exports = { OPS, CAMPOS, ROTULO_OP, normalizar, testarCondicao, regraCasa, casarRegra, validarRegra, descreverRegra, fatoDaTarefa, validarPlano, validarExecucao };
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.EscritorioRegras = _exports;
})();
