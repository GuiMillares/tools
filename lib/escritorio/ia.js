// O modelo por trás do Escritório (ADR-149): adaptador do Gemini, pelo SDK
// oficial @google/genai, só no processo principal (toda rede no main,
// ADR-002). A chave vem de fora (safeStorage), o cliente é criado no primeiro
// uso (ADR-107) e pode ser injetado nos testes; nada aqui decide o que o Hub
// faz, só pergunta ao modelo e devolve JSON conferido.
//
// Dois papéis, dois modelos: 'orquestrador' (o Pro) e 'agentes' (o Flash). O
// nome de cada um vem da configuração, escolhido num seletor que lista os
// modelos pela API; nenhum nome de modelo é fixo no código, porque preview
// muda de nome. Os sugeridos abaixo são só o padrão do seletor.
const MODELOS_SUGERIDOS = { orquestrador: 'gemini-3.1-pro-preview', agentes: 'gemini-3.8-flash' };
const NIVEIS_PENSAMENTO = ['', 'MINIMAL', 'LOW', 'MEDIUM', 'HIGH'];
const TETO_CHAMADAS_DIA_PADRAO = 200;

function configPadrao() {
  return {
    // Desligado por padrão (ADR-152): sem chamada nenhuma ao modelo até você
    // ligar no Comando do Escritório. Os agentes nunca usam modelo.
    usarModelo: false,
    modeloOrquestrador: MODELOS_SUGERIDOS.orquestrador,
    modeloAgentes: MODELOS_SUGERIDOS.agentes,
    nivelPensamento: 'HIGH',
    tetoChamadasDia: TETO_CHAMADAS_DIA_PADRAO,
    temperatura: 0.2,
    // Notificação do Windows quando nasce uma pendência (ADR-155).
    notificar: true,
  };
}

function normalizarConfig(c) {
  const p = configPadrao();
  const cfg = c && typeof c === 'object' ? c : {};
  const teto = Number(cfg.tetoChamadasDia);
  return {
    usarModelo: cfg.usarModelo === true,
    modeloOrquestrador: String(cfg.modeloOrquestrador || p.modeloOrquestrador).trim(),
    modeloAgentes: String(cfg.modeloAgentes || p.modeloAgentes).trim(),
    nivelPensamento: NIVEIS_PENSAMENTO.includes(String(cfg.nivelPensamento || '').toUpperCase()) ? String(cfg.nivelPensamento || '').toUpperCase() : p.nivelPensamento,
    tetoChamadasDia: Number.isFinite(teto) && teto >= 0 ? Math.floor(teto) : p.tetoChamadasDia,
    temperatura: Number.isFinite(Number(cfg.temperatura)) ? Math.min(2, Math.max(0, Number(cfg.temperatura))) : p.temperatura,
    notificar: cfg.notificar !== false,
  };
}

// O JSON que o modelo devolve pode vir cercado de ```json … ```; tira isso
// antes de interpretar.
function extrairJson(texto) {
  let s = String(texto == null ? '' : texto).trim();
  const cerca = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (cerca) s = cerca[1].trim();
  return JSON.parse(s);
}

// Classifica o erro do SDK/da API num código curto, para a tela e a
// pendência dizerem o que fazer, não o texto cru do HTTP.
function classificarErro(e) {
  const msg = String((e && e.message) || e || '');
  const status = Number((e && (e.status || e.code || (e.response && e.response.status))) || (msg.match(/\b(400|401|403|404|429|500|503)\b/) || [])[1] || 0);
  if (status === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(msg)) return { codigo: 'cota', erro: 'o Gemini recusou por cota ou limite de taxa; tente mais tarde, ou vincule o faturamento ao projeto da chave' };
  if (status === 404 || /not found|is not found|NOT_FOUND/i.test(msg)) return { codigo: 'modelo', erro: 'o modelo configurado não existe para esta chave; escolha outro nas Configurações' };
  if (status === 401 || status === 403 || /API key|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg)) return { codigo: 'chave', erro: 'a chave do Gemini foi recusada; confira nas Configurações' };
  if (status === 400) return { codigo: 'pedido', erro: `o Gemini recusou o pedido: ${msg.slice(0, 300)}` };
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|network/i.test(msg)) return { codigo: 'rede', erro: `sem resposta do Gemini (${msg.slice(0, 120)})` };
  return { codigo: 'erro', erro: msg.slice(0, 300) || 'erro desconhecido' };
}

function usoDe(resp) {
  const u = (resp && resp.usageMetadata) || {};
  return {
    entrada: Number(u.promptTokenCount) || 0,
    saida: Number(u.candidatesTokenCount) || 0,
    pensamento: Number(u.thoughtsTokenCount) || 0,
    total: Number(u.totalTokenCount) || 0,
  };
}

// criarIa({ chave, config, criarCliente, contador, log })
//   chave        a API key (string vazia = não configurada)
//   config       ver configPadrao()
//   criarCliente ({ apiKey }) → cliente com .models.generateContent/.models.list
//                (padrão: o GoogleGenAI do SDK, carregado no primeiro uso)
//   contador     { podeChamar() → { ok, motivo }, registrar(uso) } (a loja)
//   log          (mensagem, tipo) → void
function criarIa({ chave = '', config = {}, criarCliente = null, contador = null, log = () => {} } = {}) {
  const cfg = normalizarConfig(config);
  let cliente = null;

  function obterCliente() {
    if (cliente) return cliente;
    if (!chave) throw Object.assign(new Error('chave do Gemini não configurada'), { codigo: 'sem-chave' });
    if (criarCliente) cliente = criarCliente({ apiKey: chave });
    else {
      const { GoogleGenAI } = require('@google/genai');
      cliente = new GoogleGenAI({ apiKey: chave });
    }
    return cliente;
  }

  function modeloDo(papel) { return papel === 'agentes' ? cfg.modeloAgentes : cfg.modeloOrquestrador; }

  // Os modelos que a chave enxerga e que geram conteúdo.
  async function listarModelos() {
    try {
      const c = obterCliente();
      const pager = await c.models.list({ config: { pageSize: 100 } });
      const lista = [];
      for await (const m of pager) {
        const acoes = Array.isArray(m.supportedActions) ? m.supportedActions : [];
        if (acoes.length && !acoes.includes('generateContent')) continue;
        lista.push({ id: String(m.name || '').replace(/^models\//, ''), nome: m.displayName || m.name || '', descricao: m.description || '', entrada: m.inputTokenLimit || null, saida: m.outputTokenLimit || null });
      }
      lista.sort((a, b) => a.id.localeCompare(b.id));
      return { ok: true, modelos: lista };
    } catch (e) {
      if (e && e.codigo === 'sem-chave') return { ok: false, codigo: 'sem-chave', erro: e.message };
      return { ok: false, ...classificarErro(e) };
    }
  }

  // Uma pergunta com resposta em JSON conferido contra `schema` (o formato
  // Schema do Gemini: { type: 'OBJECT', properties, required… }).
  // Devolve { ok, dados, uso, modelo } ou { ok:false, codigo, erro, uso? }.
  async function gerarJson({ papel = 'orquestrador', sistema = '', conteudo = '', schema = null, temperatura = cfg.temperatura, semPensamento = false } = {}) {
    if (contador && typeof contador.podeChamar === 'function') {
      const pode = contador.podeChamar();
      if (!pode.ok) return { ok: false, codigo: 'teto', erro: pode.motivo || 'teto diário de chamadas atingido' };
    }
    let c;
    try { c = obterCliente(); } catch (e) { return { ok: false, codigo: e.codigo || 'erro', erro: e.message }; }
    const modelo = modeloDo(papel);
    const config = { temperature: temperatura, responseMimeType: 'application/json' };
    if (sistema) config.systemInstruction = sistema;
    if (schema) config.responseSchema = schema;
    const nivel = cfg.nivelPensamento;
    if (nivel && !semPensamento) config.thinkingConfig = { thinkingLevel: nivel };

    let resp;
    try {
      resp = await c.models.generateContent({ model: modelo, contents: conteudo, config });
    } catch (e) {
      const cls = classificarErro(e);
      // Nem todo modelo aceita o nível de pensamento pedido (o Pro só LOW/HIGH,
      // modelos antigos nenhum): sem ele, uma vez.
      if (cls.codigo === 'pedido' && config.thinkingConfig && /thinking/i.test(String(e && e.message))) {
        log(`Gemini (${modelo}) recusou o nível de pensamento ${nivel}; repetindo sem ele.`, 'warn');
        const semNivel = { ...config };
        delete semNivel.thinkingConfig;
        try { resp = await c.models.generateContent({ model: modelo, contents: conteudo, config: semNivel }); } catch (e2) { return { ok: false, ...classificarErro(e2), modelo }; }
      } else {
        return { ok: false, ...cls, modelo };
      }
    }
    const uso = usoDe(resp);
    if (contador && typeof contador.registrar === 'function') contador.registrar(uso);
    const cand = resp && Array.isArray(resp.candidates) ? resp.candidates[0] : null;
    const fim = cand && cand.finishReason ? String(cand.finishReason) : '';
    if (fim && fim !== 'STOP') {
      return { ok: false, codigo: fim === 'MAX_TOKENS' ? 'cortado' : 'bloqueado', erro: `o Gemini parou com ${fim}${cand && cand.finishMessage ? ': ' + cand.finishMessage : ''}`, uso, modelo };
    }
    let dados;
    try { dados = extrairJson(resp.text); } catch (e) {
      return { ok: false, codigo: 'json', erro: `a resposta do Gemini não é JSON válido (${e.message})`, bruto: String(resp && resp.text || '').slice(0, 500), uso, modelo };
    }
    return { ok: true, dados, uso, modelo };
  }

  // `configurada` = pode ser chamada (tem chave E está ligada); `temChave` é só
  // o que a tela precisa para dizer o que falta.
  return { config: cfg, configurada: !!chave && cfg.usarModelo, temChave: !!chave, ligada: cfg.usarModelo, listarModelos, gerarJson, modeloDo };
}

module.exports = { criarIa, configPadrao, normalizarConfig, extrairJson, classificarErro, usoDe, MODELOS_SUGERIDOS, NIVEIS_PENSAMENTO, TETO_CHAMADAS_DIA_PADRAO };
