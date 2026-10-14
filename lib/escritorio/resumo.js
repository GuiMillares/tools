// O resumo do Escritório (ADR-155): o que os agentes fizeram sozinhos, o que
// você fez à mão, o que falhou e o que ficou pendente, hoje e nos últimos 7
// dias. É o que diz se vale tirar um agente do standby ou ligar o modo
// automático. Puro, calculado do histórico das tarefas e das pendências que a
// loja guarda; a tela só mostra.
//
// Dual (Node e navegador), como lib/triagem.js.
(function () {
const DIA_MS = 24 * 60 * 60 * 1000;

function inicioDoDia(agora) { const d = new Date(agora); d.setHours(0, 0, 0, 0); return d.getTime(); }
const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : 0; };

// Conta num período [desde, agora] o que aconteceu com cada tarefa, pelo
// histórico (não pelo estado atual, que muda).
function contar(tarefas, pendencias, desde, agora) {
  const r = { pelosAgentes: 0, pelaMao: 0, ignoradas: 0, falhas: 0, execucoes: 0, pendenciasAbertas: 0, pendenciasCriadas: 0, tempoMedioMin: null, porAgente: {} };
  const duracoes = [];
  for (const t of tarefas || []) {
    const hist = Array.isArray(t.historico) ? t.historico : [];
    let entrou = 0;
    let feitaPorAgente = false, feitaPelaMao = false, ignorada = false;
    for (const h of hist) {
      const q = ms(h.quando);
      if (!entrou && h.tipo === 'fila') entrou = q;
      if (q < desde || q > agora) continue;
      if (h.tipo === 'execucao') {
        r.execucoes++;
        if (h.ok) { feitaPorAgente = true; if (h.agente) r.porAgente[h.agente] = (r.porAgente[h.agente] || 0) + 1; if (entrou) duracoes.push(Math.max(0, q - entrou)); }
        else r.falhas++;
      }
      if (h.tipo === 'estado' && h.para === 'concluida' && /tratada por você/.test(String(h.motivo || ''))) feitaPelaMao = true;
      if (h.tipo === 'estado' && h.para === 'ignorada') ignorada = true;
    }
    if (feitaPorAgente && t.estado === 'concluida') r.pelosAgentes++;
    else if (feitaPelaMao) r.pelaMao++;
    if (ignorada && t.estado === 'ignorada') r.ignoradas++;
  }
  for (const p of pendencias || []) {
    if (!p) continue;
    const c = ms(p.criadaEm);
    if (c >= desde && c <= agora) r.pendenciasCriadas++;
    if (p.status !== 'fechada') r.pendenciasAbertas++;
  }
  if (duracoes.length) r.tempoMedioMin = Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length / 60000);
  return r;
}

function resumir(tarefas, pendencias, agora) {
  const t = Number.isFinite(agora) ? agora : Date.now();
  return {
    hoje: contar(tarefas, pendencias, inicioDoDia(t), t),
    semana: contar(tarefas, pendencias, t - 7 * DIA_MS, t),
    calculadoEm: new Date(t).toISOString(),
  };
}

// Uma frase curta para o HUD: "hoje: 3 pelos agentes · 1 à mão · 2 pendências".
function frase(resumo) {
  const h = resumo && resumo.hoje;
  if (!h) return '';
  const partes = [];
  if (h.pelosAgentes) partes.push(`${h.pelosAgentes} pelos agentes`);
  if (h.pelaMao) partes.push(`${h.pelaMao} à mão`);
  if (h.falhas) partes.push(`${h.falhas} falha(s)`);
  if (h.pendenciasAbertas) partes.push(`${h.pendenciasAbertas} pendência(s)`);
  return partes.length ? `hoje: ${partes.join(' · ')}` : 'hoje: nada ainda';
}

const _exports = { resumir, contar, frase, inicioDoDia };
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
else window.EscritorioResumo = _exports;
})();
