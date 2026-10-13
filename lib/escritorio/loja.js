// A loja do Escritório (ADR-149): o estado persistente, em dois arquivos na
// pasta de dados do Hub, com escrita atômica como a rodada em massa
// (ADR-096): grava num temporário e troca, para um desligamento no meio não
// deixar JSON pela metade.
//
//   escritorio.json         ligado (geral, observação, por agente), tarefas
//                           (por Id do Salesforce, com histórico), pendências,
//                           contadores do dia (chamadas e tokens do modelo),
//                           última varredura.
//   escritorio-regras.json  a base de conhecimento (regras aprendidas).
//
// Só Node (processo principal e testes). Recebe `fs` e `agora` por injeção.
const path = require('path');
const Estados = require('./estados');

const VERSAO = 1;
const DIAS_GUARDAR_CONCLUIDAS = 30;

function hoje(agora) { return String(agora()).slice(0, 10); }

function criarLoja({ pasta, fs = require('fs'), agora = () => new Date().toISOString() } = {}) {
  if (!pasta) throw new Error('criarLoja: sem pasta');
  const arquivo = path.join(pasta, 'escritorio.json');
  const arquivoRegras = path.join(pasta, 'escritorio-regras.json');

  let estado = vazio();
  let regras = [];
  let avisos = [];

  function vazio() {
    return {
      versao: VERSAO,
      ligado: { geral: false, observacao: true, agentes: {} },
      tarefas: {},
      pendencias: [],
      contadores: { dia: hoje(agora), chamadas: 0, tokensEntrada: 0, tokensSaida: 0, tokensPensamento: 0 },
      ultimaVarredura: null,
      seqPendencia: 0,
    };
  }

  function lerJson(caminho) {
    if (!fs.existsSync(caminho)) return null;
    return JSON.parse(fs.readFileSync(caminho, 'utf-8'));
  }

  function gravarJson(caminho, dados) {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    const tmp = `${caminho}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf-8');
    fs.renameSync(tmp, caminho);
  }

  function carregar() {
    avisos = [];
    try {
      const lido = lerJson(arquivo);
      estado = lido && typeof lido === 'object' ? { ...vazio(), ...lido } : vazio();
      if (!estado.ligado || typeof estado.ligado !== 'object') estado.ligado = vazio().ligado;
      if (!estado.ligado.agentes || typeof estado.ligado.agentes !== 'object') estado.ligado.agentes = {};
      if (typeof estado.ligado.observacao !== 'boolean') estado.ligado.observacao = true;
      if (!estado.tarefas || typeof estado.tarefas !== 'object') estado.tarefas = {};
      if (!Array.isArray(estado.pendencias)) estado.pendencias = [];
    } catch (e) {
      avisos.push(`não consegui ler ${path.basename(arquivo)} (${e.message}); começando do zero`);
      estado = vazio();
    }
    try {
      const lido = lerJson(arquivoRegras);
      regras = lido && Array.isArray(lido.regras) ? lido.regras : [];
    } catch (e) {
      avisos.push(`não consegui ler ${path.basename(arquivoRegras)} (${e.message}); sem regras aprendidas`);
      regras = [];
    }
    // O Hub fechou com tarefa executando: ela vira "interrompida" e o
    // orquestrador abre a pendência "retomar?" (nunca retoma sozinho, ADR-096).
    const interrompidas = [];
    for (const t of Object.values(estado.tarefas)) {
      if (t && t.estado === Estados.TAREFA.EXECUTANDO) {
        Estados.transicionar(t, Estados.TAREFA.INTERROMPIDA, 'o Hub fechou com a tarefa executando', {}, agora);
        interrompidas.push(t.id);
      }
    }
    zerarContadoresSeMudouODia();
    return { ok: true, avisos, interrompidas };
  }

  function salvar() {
    gravarJson(arquivo, estado);
    return { ok: true };
  }

  function salvarRegras() {
    gravarJson(arquivoRegras, { versao: VERSAO, regras });
    return { ok: true };
  }

  function zerarContadoresSeMudouODia() {
    const d = hoje(agora);
    if (!estado.contadores || estado.contadores.dia !== d) {
      estado.contadores = { dia: d, chamadas: 0, tokensEntrada: 0, tokensSaida: 0, tokensPensamento: 0 };
    }
  }

  // ---------- tarefas ----------
  function tarefa(id) { return estado.tarefas[id] || null; }
  function tarefas() { return Object.values(estado.tarefas); }
  function tarefasAbertas() { return tarefas().filter(Estados.estaAberta); }
  function tarefasComDominio(dominio) {
    const d = String(dominio || '').toLowerCase();
    if (!d) return [];
    return tarefas().filter((t) => t && t.plano && String(t.plano.parametros && t.plano.parametros.dominio || '').toLowerCase() === d);
  }

  // Cria (ou atualiza o que veio do Salesforce em) uma tarefa, sem mexer no
  // estado nem no plano. `sf` é a tarefa como o salesforce:tarefas devolve.
  function registrarDaFila(sf, extras = {}) {
    const existente = estado.tarefas[sf.id];
    const base = {
      id: sf.id, assunto: sf.assunto || '', descricao: sf.descricao || '', link: extras.link || sf.link || '',
      fila: sf.fila || null, empresaFila: extras.empresaFila || null, dono: sf.dono || '', donoTipo: sf.donoTipo || '',
      prioridade: sf.prioridade || '', prazo: sf.prazo || null, relativo: sf.relativo || '', relativoTipo: sf.relativoTipo || '', relativoId: sf.relativoId || null,
      criada: sf.criada || null, alterada: sf.alterada || null, fechadaNoSalesforce: !!sf.fechada, status: sf.status || '',
    };
    if (!existente) {
      const t = { ...base, estado: Estados.TAREFA.NA_FILA, estadoDesde: agora(), vistaEm: agora(), plano: null, agente: null, tentativas: 0, pendenciaId: null, historico: [] };
      Estados.registrar(t, { tipo: 'fila', motivo: 'lida da fila do Salesforce' }, agora());
      estado.tarefas[sf.id] = t;
      return { tarefa: t, nova: true };
    }
    const mudou = existente.alterada !== base.alterada || existente.assunto !== base.assunto || existente.descricao !== base.descricao;
    Object.assign(existente, base, { vistaEm: agora() });
    return { tarefa: existente, nova: false, mudou };
  }

  // Concluídas, ignoradas e fechadas há mais de 30 dias saem do arquivo.
  function podar() {
    const limite = Date.parse(agora()) - DIAS_GUARDAR_CONCLUIDAS * 86400000;
    let n = 0;
    for (const [id, t] of Object.entries(estado.tarefas)) {
      if (!Estados.estaAberta(t) && Date.parse(t.estadoDesde || 0) < limite) { delete estado.tarefas[id]; n++; }
    }
    return n;
  }

  // ---------- pendências ----------
  //
  // { id: 'P-7', tipo: 'pergunta' | 'confirmacao' | 'retomar' | 'sugestao',
  //   padrao, pergunta, contexto, tarefas: [ids], criadaEm, respondidaEm,
  //   resposta, proposta (regra sugerida), status: 'aberta' | 'respondida' |
  //   'fechada' }
  function pendencias() { return estado.pendencias; }
  function pendenciasAbertas() { return estado.pendencias.filter((p) => p.status === 'aberta' || p.status === 'respondida'); }
  function pendencia(id) { return estado.pendencias.find((p) => p.id === id) || null; }
  function pendenciaAbertaPorPadrao(padrao) {
    return estado.pendencias.find((p) => p.status === 'aberta' && p.padrao && p.padrao === padrao) || null;
  }
  function criarPendencia({ tipo = 'pergunta', padrao = '', pergunta = '', contexto = {}, tarefas: ids = [], agente = null }) {
    estado.seqPendencia = (estado.seqPendencia || 0) + 1;
    const p = { id: `P-${estado.seqPendencia}`, tipo, padrao, pergunta, contexto, agente, tarefas: [...ids], criadaEm: agora(), respondidaEm: null, resposta: null, proposta: null, status: 'aberta' };
    estado.pendencias.unshift(p);
    return p;
  }
  function anexarTarefaNaPendencia(p, tarefaId) {
    if (p && !p.tarefas.includes(tarefaId)) p.tarefas.push(tarefaId);
  }

  // ---------- regras ----------
  function listarRegras() { return regras; }
  function regra(id) { return regras.find((r) => r.id === id) || null; }
  function salvarRegra(r) {
    if (!r.id) r.id = `R-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    if (!r.criadaEm) r.criadaEm = agora();
    const i = regras.findIndex((x) => x.id === r.id);
    if (i >= 0) regras[i] = { ...regras[i], ...r };
    else regras.push(r);
    salvarRegras();
    return regras.find((x) => x.id === r.id);
  }
  function apagarRegra(id) {
    const antes = regras.length;
    regras = regras.filter((r) => r.id !== id);
    if (regras.length !== antes) salvarRegras();
    return regras.length !== antes;
  }

  // ---------- contadores do modelo ----------
  function registrarChamada(uso) {
    zerarContadoresSeMudouODia();
    const c = estado.contadores;
    c.chamadas += 1;
    c.tokensEntrada += Number(uso && uso.entrada) || 0;
    c.tokensSaida += Number(uso && uso.saida) || 0;
    c.tokensPensamento += Number(uso && uso.pensamento) || 0;
  }
  function contadores() { zerarContadoresSeMudouODia(); return { ...estado.contadores }; }

  return {
    arquivo, arquivoRegras,
    carregar, salvar, salvarRegras,
    get estado() { return estado; },
    get ligado() { return estado.ligado; },
    tarefa, tarefas, tarefasAbertas, tarefasComDominio, registrarDaFila, podar,
    pendencias, pendenciasAbertas, pendencia, pendenciaAbertaPorPadrao, criarPendencia, anexarTarefaNaPendencia,
    listarRegras, regra, salvarRegra, apagarRegra,
    registrarChamada, contadores,
    marcarVarredura(info) { estado.ultimaVarredura = { quando: agora(), ...(info || {}) }; },
  };
}

module.exports = { criarLoja, VERSAO, DIAS_GUARDAR_CONCLUIDAS };
