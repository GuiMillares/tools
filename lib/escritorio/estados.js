// Estados do Escritório (ADR-149): o que uma tarefa e uma etapa podem ser, e
// para onde cada estado pode ir. Puro, sem efeito colateral: o orquestrador e
// a tela consultam daqui, e o teste prova que nenhuma transição esquisita
// passa (uma tarefa concluída nunca volta a "executando", por exemplo).
//
// Dual (Node e navegador), como lib/triagem.js.
(function () {
const TAREFA = {
  NA_FILA: 'na_fila',                     // lida da fila do Salesforce, ainda não analisada
  EM_ANALISE: 'em_analise',               // triagem, regras ou modelo decidindo
  PLANEJADA: 'planejada',                 // tem plano (agente + parâmetros + etapas); espera a vez
  PENDENTE: 'pendente',                   // o orquestrador tem uma pergunta aberta para você
  AGUARDANDO_CONFIRMACAO: 'aguardando_confirmacao', // modo manual: plano pronto, espera o seu "executar"
  EXECUTANDO: 'executando',               // um agente está trabalhando nela
  CONCLUIDA: 'concluida',                 // tudo feito (ou fechada no Salesforce por fora)
  FALHOU: 'falhou',                       // a etapa falhou; pode tentar de novo até o teto
  AGUARDANDO_EXTERNO: 'aguardando_externo', // publicado; só falta o DNS (lista de espera)
  ESCALADA: 'escalada',                   // esgotou as tentativas; virou pendência para você
  IGNORADA: 'ignorada',                   // não é tarefa do Hub (decidido por regra ou por você)
  INTERROMPIDA: 'interrompida',           // o Hub fechou no meio da execução; pergunta "retomar?"
};

const ETAPA = {
  PENDENTE: 'pendente',
  VALIDANDO: 'validando',
  EXECUTANDO: 'executando',
  CONCLUIDA: 'concluida',
  FALHOU: 'falhou',
  PULADA: 'pulada',
  BARRADA: 'barrada', // uma regra de execução não passou
};

// Para onde cada estado pode ir. O que não está aqui é erro de programa, não
// um caso de uso: `transicionar` recusa e deixa registrado.
const TRANSICOES = {
  [TAREFA.NA_FILA]: [TAREFA.EM_ANALISE, TAREFA.CONCLUIDA, TAREFA.IGNORADA],
  [TAREFA.EM_ANALISE]: [TAREFA.PLANEJADA, TAREFA.PENDENTE, TAREFA.IGNORADA, TAREFA.CONCLUIDA, TAREFA.NA_FILA],
  [TAREFA.PLANEJADA]: [TAREFA.AGUARDANDO_CONFIRMACAO, TAREFA.EXECUTANDO, TAREFA.PENDENTE, TAREFA.EM_ANALISE, TAREFA.CONCLUIDA, TAREFA.IGNORADA],
  [TAREFA.PENDENTE]: [TAREFA.EM_ANALISE, TAREFA.IGNORADA, TAREFA.CONCLUIDA, TAREFA.PLANEJADA],
  [TAREFA.AGUARDANDO_CONFIRMACAO]: [TAREFA.EXECUTANDO, TAREFA.EM_ANALISE, TAREFA.IGNORADA, TAREFA.CONCLUIDA, TAREFA.PENDENTE],
  [TAREFA.EXECUTANDO]: [TAREFA.CONCLUIDA, TAREFA.FALHOU, TAREFA.AGUARDANDO_EXTERNO, TAREFA.ESCALADA, TAREFA.PENDENTE, TAREFA.INTERROMPIDA],
  [TAREFA.FALHOU]: [TAREFA.EXECUTANDO, TAREFA.ESCALADA, TAREFA.EM_ANALISE, TAREFA.CONCLUIDA, TAREFA.IGNORADA, TAREFA.PENDENTE, TAREFA.AGUARDANDO_CONFIRMACAO],
  [TAREFA.AGUARDANDO_EXTERNO]: [TAREFA.EXECUTANDO, TAREFA.CONCLUIDA, TAREFA.FALHOU, TAREFA.PENDENTE],
  [TAREFA.ESCALADA]: [TAREFA.EM_ANALISE, TAREFA.EXECUTANDO, TAREFA.CONCLUIDA, TAREFA.IGNORADA],
  [TAREFA.IGNORADA]: [TAREFA.EM_ANALISE, TAREFA.CONCLUIDA],
  [TAREFA.INTERROMPIDA]: [TAREFA.EXECUTANDO, TAREFA.EM_ANALISE, TAREFA.CONCLUIDA, TAREFA.IGNORADA],
  [TAREFA.CONCLUIDA]: [],
};

const TRANSICOES_ETAPA = {
  [ETAPA.PENDENTE]: [ETAPA.VALIDANDO, ETAPA.EXECUTANDO, ETAPA.PULADA, ETAPA.BARRADA],
  [ETAPA.VALIDANDO]: [ETAPA.EXECUTANDO, ETAPA.BARRADA, ETAPA.PULADA],
  [ETAPA.EXECUTANDO]: [ETAPA.CONCLUIDA, ETAPA.FALHOU, ETAPA.PULADA],
  [ETAPA.FALHOU]: [ETAPA.VALIDANDO, ETAPA.EXECUTANDO, ETAPA.PULADA],
  [ETAPA.BARRADA]: [ETAPA.VALIDANDO, ETAPA.PULADA],
  [ETAPA.CONCLUIDA]: [],
  [ETAPA.PULADA]: [ETAPA.VALIDANDO],
};

// Rótulos para a tela, em português e curtos.
const ROTULOS = {
  [TAREFA.NA_FILA]: 'na fila',
  [TAREFA.EM_ANALISE]: 'em análise',
  [TAREFA.PLANEJADA]: 'planejada',
  [TAREFA.PENDENTE]: 'pendente',
  [TAREFA.AGUARDANDO_CONFIRMACAO]: 'aguardando confirmação',
  [TAREFA.EXECUTANDO]: 'executando',
  [TAREFA.CONCLUIDA]: 'concluída',
  [TAREFA.FALHOU]: 'falhou',
  [TAREFA.AGUARDANDO_EXTERNO]: 'aguardando externo',
  [TAREFA.ESCALADA]: 'escalada',
  [TAREFA.IGNORADA]: 'ignorada',
  [TAREFA.INTERROMPIDA]: 'interrompida',
};

// Cor semântica de cada estado (ADR-010: cor é informação, e só duas eixos).
const TOM = {
  [TAREFA.CONCLUIDA]: 'ok',
  [TAREFA.EXECUTANDO]: 'run',
  [TAREFA.PLANEJADA]: 'run',
  [TAREFA.PENDENTE]: 'warn',
  [TAREFA.AGUARDANDO_CONFIRMACAO]: 'warn',
  [TAREFA.AGUARDANDO_EXTERNO]: 'warn',
  [TAREFA.INTERROMPIDA]: 'warn',
  [TAREFA.FALHOU]: 'err',
  [TAREFA.ESCALADA]: 'err',
  [TAREFA.IGNORADA]: 'neutral',
  [TAREFA.NA_FILA]: 'neutral',
  [TAREFA.EM_ANALISE]: 'neutral',
};

const ABERTOS = [TAREFA.NA_FILA, TAREFA.EM_ANALISE, TAREFA.PLANEJADA, TAREFA.PENDENTE, TAREFA.AGUARDANDO_CONFIRMACAO, TAREFA.EXECUTANDO, TAREFA.FALHOU, TAREFA.AGUARDANDO_EXTERNO, TAREFA.ESCALADA, TAREFA.INTERROMPIDA];

function podeIr(de, para) {
  return !!(TRANSICOES[de] && TRANSICOES[de].includes(para));
}

function podeIrEtapa(de, para) {
  return !!(TRANSICOES_ETAPA[de] && TRANSICOES_ETAPA[de].includes(para));
}

// Muda o estado da tarefa registrando no histórico dela: quando, de onde,
// para onde e por quê. Devolve { ok } ou { ok:false, erro }. O histórico tem
// teto para o arquivo não crescer para sempre (ADR-109: as linhas antigas
// ficam no log do dia, não no estado).
const HISTORICO_MAX = 200;
function transicionar(tarefa, para, motivo, extra, agora) {
  if (!tarefa || typeof tarefa !== 'object') return { ok: false, erro: 'sem tarefa' };
  const de = tarefa.estado || TAREFA.NA_FILA;
  if (de === para) return { ok: true, repetida: true };
  if (!podeIr(de, para)) return { ok: false, erro: `transição inválida: ${de} → ${para}` };
  const ts = agora ? agora() : new Date().toISOString();
  tarefa.estado = para;
  tarefa.estadoDesde = ts;
  registrar(tarefa, { tipo: 'estado', de, para, motivo: String(motivo || ''), ...(extra || {}) }, ts);
  return { ok: true };
}

// Um evento no histórico da tarefa (decisão, regra validada, etapa, erro…).
function registrar(tarefa, evento, ts) {
  if (!Array.isArray(tarefa.historico)) tarefa.historico = [];
  tarefa.historico.push({ quando: ts || new Date().toISOString(), ...evento });
  if (tarefa.historico.length > HISTORICO_MAX) tarefa.historico.splice(0, tarefa.historico.length - HISTORICO_MAX);
}

function estaAberta(tarefa) {
  return !!tarefa && ABERTOS.includes(tarefa.estado);
}

const _exports = { TAREFA, ETAPA, TRANSICOES, TRANSICOES_ETAPA, ROTULOS, TOM, ABERTOS, HISTORICO_MAX, podeIr, podeIrEtapa, transicionar, registrar, estaAberta };
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.EscritorioEstados = _exports;
})();
