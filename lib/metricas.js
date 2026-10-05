// Indicadores do Salesforce na tela inicial (ADR-138).
//
// Puro e dual (Node para os testes, <script> no renderer): as janelas de
// período (dia, semana, mês, ano) com seus buckets, a agregação das tarefas
// (criadas, concluídas, publicações, SLA de criação até conclusão) e o SVG das
// colunas. Nada aqui fala com a rede: as tarefas vêm do salesforce:metricas
// como { fechada, criada, concluida, publicacao }.
//
// Tudo em hora local: "hoje" e "esta semana" são os da pessoa, não os de UTC.

(function () {
// Os períodos são a GRANULARIDADE das colunas, não uma janela ("no mês quero
// ver o mês inteiro de janeiro, de fevereiro, tudo em uma linha só", 05/10):
//   dia    → uma coluna por dia, os últimos 30 dias
//   semana → uma coluna por semana (segunda a domingo), as últimas 12
//   mes    → uma coluna por mês inteiro, os últimos 12
//   ano    → uma coluna por ano, os últimos 3
// E o número grande do cartão é o PERÍODO CORRENTE — a última coluna: hoje,
// esta semana, este mês, este ano ("quando eu clico no filtro do dia eu quero
// ver o dia de hoje", 05/10); o total da janela fica no texto ao lado.
// `atual` é o rótulo dessa coluna ("hoje"), `em` a forma com preposição
// ("hoje", "nesta semana"). `dias` é quanto de histórico a consulta precisa.
const PERIODOS = {
  dia: { rotulo: 'Dia', passo: 'dia', n: 30, dias: 30, janela: 'últimos 30 dias', atual: 'hoje', em: 'hoje' },
  semana: { rotulo: 'Semana', passo: 'semana', n: 12, dias: 7 * 12, janela: 'últimas 12 semanas', atual: 'esta semana', em: 'nesta semana' },
  mes: { rotulo: 'Mês', passo: 'mes', n: 12, dias: 366, janela: 'últimos 12 meses', atual: 'este mês', em: 'neste mês' },
  ano: { rotulo: 'Ano', passo: 'ano', n: 3, dias: 1100, janela: 'últimos 3 anos', atual: 'este ano', em: 'neste ano' },
};
const PERIODO_PADRAO = 'mes';
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const n2 = (x) => String(x).padStart(2, '0');

function inicioDoDia(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Segunda-feira 00:00 da semana de uma data.
function inicioDaSemana(d) {
  const x = inicioDoDia(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

// A janela de um período: início, fim (agora) e os buckets — um por dia,
// semana, mês inteiro ou ano inteiro — cada um com início, fim e rótulo curto.
function janela(periodo, agora = new Date()) {
  const p = PERIODOS[periodo] ? periodo : PERIODO_PADRAO;
  const def = PERIODOS[p];
  const fim = new Date(agora);
  const buckets = [];
  let inicio;
  if (def.passo === 'dia') {
    inicio = inicioDoDia(agora);
    inicio.setDate(inicio.getDate() - (def.n - 1));
    for (let i = 0; i < def.n; i++) {
      const a = new Date(inicio); a.setDate(inicio.getDate() + i);
      const b = new Date(a); b.setDate(a.getDate() + 1);
      buckets.push({ inicio: a, fim: b, rotulo: `${n2(a.getDate())}/${n2(a.getMonth() + 1)}` });
    }
  } else if (def.passo === 'semana') {
    inicio = inicioDaSemana(agora);
    inicio.setDate(inicio.getDate() - 7 * (def.n - 1));
    for (let i = 0; i < def.n; i++) {
      const a = new Date(inicio); a.setDate(inicio.getDate() + 7 * i);
      const b = new Date(a); b.setDate(a.getDate() + 7);
      buckets.push({ inicio: a, fim: b, rotulo: `${n2(a.getDate())}/${n2(a.getMonth() + 1)}` });
    }
  } else if (def.passo === 'mes') {
    inicio = new Date(agora.getFullYear(), agora.getMonth() - (def.n - 1), 1);
    for (let i = 0; i < def.n; i++) {
      const a = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
      const b = new Date(inicio.getFullYear(), inicio.getMonth() + i + 1, 1);
      buckets.push({ inicio: a, fim: b, rotulo: `${MESES[a.getMonth()]}/${String(a.getFullYear()).slice(2)}` });
    }
  } else {
    inicio = new Date(agora.getFullYear() - (def.n - 1), 0, 1);
    for (let i = 0; i < def.n; i++) {
      const a = new Date(inicio.getFullYear() + i, 0, 1);
      const b = new Date(inicio.getFullYear() + i + 1, 0, 1);
      buckets.push({ inicio: a, fim: b, rotulo: String(a.getFullYear()) });
    }
  }
  return { periodo: p, passo: def.passo, inicio, fim, buckets, descricao: def.janela, atual: def.atual, em: def.em };
}

// Quantos dias de histórico a consulta precisa para preencher o período.
function diasNecessarios(periodo) {
  return (PERIODOS[periodo] || PERIODOS[PERIODO_PADRAO]).dias;
}

// Em que bucket cai uma data; -1 fora da janela (antes do início ou depois de
// agora). O último bucket pode terminar no futuro (a hora/dia/mês corrente).
function indiceBucket(j, data) {
  const t = data instanceof Date ? data.getTime() : new Date(data).getTime();
  if (isNaN(t) || t < j.inicio.getTime() || t > j.fim.getTime()) return -1;
  for (let i = 0; i < j.buckets.length; i++) {
    if (t >= j.buckets[i].inicio.getTime() && t < j.buckets[i].fim.getTime()) return i;
  }
  return j.buckets.length - 1;
}

// Horas da criação à conclusão, ou null (a medida antiga, corrida).
function horasAte(criada, concluida) {
  const a = new Date(criada).getTime();
  const b = new Date(concluida).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return null;
  return (b - a) / 3600000;
}

// O SLA como o relatório "Done -- Deploy - BC / MPI" do Salesforce calcula
// (fórmula de linha CDF1, ADR-143): DIAS ÚTEIS entre a data de criação e a de
// conclusão, sem olhar a hora. É a diferença entre os "índices de dia útil"
// das duas datas, onde o índice de um dia é
//     5 * floor(n / 7) + min(5, n mod 7),  n = dias desde segunda 08/01/1900
// — segunda a sexta valem 0..4 na semana, sábado e domingo valem 5 (o fim da
// semana). Mesmo dia = 0; sexta → segunda = 1; quinta → sexta da semana
// seguinte = 6. A data é a local (a do usuário), como o DATEVALUE do relatório.
const EPOCA_DIA_UTIL = Date.UTC(1900, 0, 8);
function indiceDiaUtil(data) {
  const d = data instanceof Date ? data : new Date(data);
  if (isNaN(d.getTime())) return null;
  const n = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCA_DIA_UTIL) / 86400000);
  return 5 * Math.floor(n / 7) + Math.min(5, ((n % 7) + 7) % 7);
}
function diasUteisEntre(criada, concluida) {
  const a = indiceDiaUtil(criada);
  const b = indiceDiaUtil(concluida);
  if (a === null || b === null || b < a) return null;
  return b - a;
}

function media(xs) { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null; }
function mediana(xs) {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

// As séries por bucket e os totais do período, contadas como o relatório do
// painel do Salesforce (ADR-143):
//   criadas:     tarefas criadas no bucket (canceladas inclusive)
//   concluidas:  tarefas concluídas no bucket (pela data de conclusão; a
//                cancelada não tem data de conclusão e não entra)
//   publicacoes: as concluídas que são de publicação
//   sla:         média dos dias úteis criação→conclusão das concluídas no bucket
//   totais.abertasAgora não depende do período: é o que está aberto hoje.
//   atual:       a última coluna (hoje / esta semana / este mês / este ano),
//                com as mesmas contas — é o número grande do cartão.
function agregar(tarefas, j) {
  const n = j.buckets.length;
  const zeros = () => new Array(n).fill(0);
  const r = {
    criadas: zeros(), concluidas: zeros(), publicacoes: zeros(), sla: new Array(n).fill(null),
    totais: { criadas: 0, concluidas: 0, publicacoes: 0, abertasAgora: 0, slaMedia: null, slaMediana: null, slaN: 0 },
    atual: { indice: n - 1, rotulo: j.atual || '', criadas: 0, concluidas: 0, publicacoes: 0, slaMedia: null, slaMediana: null, slaN: 0 },
  };
  const porBucket = Array.from({ length: n }, () => []);
  const todas = [];
  for (const t of tarefas || []) {
    if (!t) continue;
    if (!t.fechada) r.totais.abertasAgora++;
    const ic = indiceBucket(j, t.criada);
    if (ic >= 0) { r.criadas[ic]++; r.totais.criadas++; }
    if (t.fechada && t.concluida && !t.cancelada) {
      const ix = indiceBucket(j, t.concluida);
      if (ix >= 0) {
        r.concluidas[ix]++; r.totais.concluidas++;
        if (t.publicacao) { r.publicacoes[ix]++; r.totais.publicacoes++; }
        const d = diasUteisEntre(t.criada, t.concluida);
        if (d !== null) { porBucket[ix].push(d); todas.push(d); }
      }
    }
  }
  r.sla = porBucket.map((xs) => media(xs));
  r.totais.slaMedia = media(todas);
  r.totais.slaMediana = mediana(todas);
  r.totais.slaN = todas.length;
  const u = n - 1;
  if (u >= 0) {
    r.atual.criadas = r.criadas[u];
    r.atual.concluidas = r.concluidas[u];
    r.atual.publicacoes = r.publicacoes[u];
    r.atual.slaMedia = media(porBucket[u]);
    r.atual.slaMediana = mediana(porBucket[u]);
    r.atual.slaN = porBucket[u].length;
  }
  return r;
}

// Dias úteis como o relatório mostra: "0,94", "1", "6". Com duas casas quando
// não é inteiro; vírgula decimal. A forma curta (eixo) arredonda a uma casa.
function formatarDias(dias, { curto = false } = {}) {
  if (dias === null || dias === undefined || isNaN(dias)) return '—';
  const v = Number(dias);
  if (Number.isInteger(v)) return String(v);
  return (curto ? (Math.round(v * 10) / 10).toFixed(1) : v.toFixed(2)).replace('.', ',');
}

// "45min", "3h 20min", "2d 4h".
function formatarHoras(horas) {
  if (horas === null || horas === undefined || isNaN(horas)) return '—';
  // Arredonda ao minuto antes de decidir a faixa: 23h59min59 é 1d, não "24h".
  const h = Math.max(0, Math.round(horas * 60) / 60);
  if (h < 1) return `${Math.round(h * 60)}min`;
  if (h < 24) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return mm ? `${hh}h ${n2(mm)}min` : `${hh}h`;
  }
  const d = Math.floor(h / 24);
  const resto = Math.round(h - d * 24);
  if (resto >= 24) return `${d + 1}d`;
  return resto ? `${d}d ${resto}h` : `${d}d`;
}

// O teto "redondo" do eixo: 1, 2, 5 × potência de 10.
function tetoBonito(v) {
  if (!v || v <= 0 || !isFinite(v)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const t = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return t * p;
}

const f = (x) => Math.round(x * 10) / 10;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Colunas de uma série (e uma linha opcional por cima, a série de contexto),
// como string SVG. Marcas finas (≤ 24px), topo arredondado 4px e base reta,
// 2px de folga entre colunas, grade hairline sólida (0, metade, teto), rótulo
// direto só na maior coluna; o resto fica no tooltip (cada coluna tem um alvo
// invisível da largura da faixa, data-i) e na tabela. `destacar` é o índice
// da coluna corrente (hoje): ela ganha a classe <prefixo>-bar--atual e o
// rótulo do eixo mesmo quando `cadaRotulo` o pularia. Cores e fontes vêm do
// CSS (classes <prefixo>-*), nunca daqui.
function svgColunas({ valores, linha = null, rotulos = [], cadaRotulo = 1, largura = 320, altura = 132, formatar = (v) => String(v), formatarEixo = null, prefixo = 'mt', inteiros = false, destacar = -1 } = {}) {
  const vals = (valores || []).map((v) => (v === null || v === undefined || isNaN(v) ? 0 : Number(v)));
  const n = vals.length;
  const lin = Array.isArray(linha) && linha.length === n ? linha.map((v) => (v === null || v === undefined || isNaN(v) ? 0 : Number(v))) : null;
  const maxDados = Math.max(0, ...vals, ...(lin || []));
  const max = tetoBonito(maxDados);
  // Os rótulos do eixo y (0, metade, teto), no formato curto quando houver;
  // a margem esquerda é a do mais largo (≈5,6px por caractere a 9,5px), para
  // nada vazar do cartão.
  const fEixo = typeof formatarEixo === 'function' ? formatarEixo : formatar;
  const ticks = [0, 0.5, 1].map((frac) => ({ frac, texto: (inteiros && !Number.isInteger(max * frac)) ? null : String(fEixo(max * frac)) }));
  const maisLargo = Math.max(1, ...ticks.map((t) => (t.texto ? t.texto.length : 0)));
  const mt = 16, mb = 18, mr = 6;
  const ml = Math.min(Math.round(largura / 3), Math.max(22, 8 + Math.ceil(maisLargo * 5.6)));
  const plotW = largura - ml - mr;
  const plotH = altura - mt - mb;
  const band = plotW / Math.max(1, n);
  const bw = Math.max(2, Math.min(24, band - 2));
  const yb = mt + plotH;
  const y = (v) => yb - (v / max) * plotH;
  const x0 = (i) => ml + i * band + (band - bw) / 2;
  const partes = [];
  for (const t of ticks) {
    const yy = yb - t.frac * plotH;
    partes.push(`<line class="${prefixo}-grid" x1="${ml}" x2="${largura - mr}" y1="${f(yy)}" y2="${f(yy)}"/>`);
    // Contagem não tem "0.5": a linha do meio fica, o rótulo só se for inteiro.
    if (t.texto === null) continue;
    partes.push(`<text class="${prefixo}-txt ${prefixo}-tick" x="${ml - 4}" y="${f(yy + 3)}" text-anchor="end">${esc(t.texto)}</text>`);
  }
  const maior = Math.max(...vals);
  const iMax = vals.indexOf(maior);
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    const xa = x0(i);
    const yt = y(v);
    const h = yb - yt;
    const r = Math.max(0, Math.min(4, h, bw / 2));
    const d = h <= 0 ? '' : `M${f(xa)},${f(yb)} V${f(yt + r)} Q${f(xa)},${f(yt)} ${f(xa + r)},${f(yt)} H${f(xa + bw - r)} Q${f(xa + bw)},${f(yt)} ${f(xa + bw)},${f(yt + r)} V${f(yb)} Z`;
    const atual = i === destacar;
    partes.push(`<g class="${prefixo}-col${atual ? ` ${prefixo}-col--atual` : ''}" data-i="${i}">`);
    partes.push(`<rect class="${prefixo}-hit" x="${f(ml + i * band)}" y="${mt}" width="${f(band)}" height="${f(plotH)}" fill="transparent"/>`);
    if (d) partes.push(`<path class="${prefixo}-bar${atual ? ` ${prefixo}-bar--atual` : ''}" d="${d}"/>`);
    partes.push('</g>');
    if (i === iMax && v > 0) partes.push(`<text class="${prefixo}-txt ${prefixo}-val" x="${f(xa + bw / 2)}" y="${f(yt - 4)}" text-anchor="middle">${esc(formatar(v))}</text>`);
    // O rótulo da coluna corrente sempre aparece; para não encostar nele, o
    // rótulo periódico imediatamente anterior sai quando está a 1 faixa.
    const periodico = i % Math.max(1, cadaRotulo) === 0 && !(destacar >= 0 && i !== destacar && Math.abs(destacar - i) === 1);
    if (rotulos[i] && (atual || periodico)) partes.push(`<text class="${prefixo}-txt ${prefixo}-rot${atual ? ` ${prefixo}-rot--atual` : ''}" x="${f(xa + bw / 2)}" y="${altura - 5}" text-anchor="middle">${esc(rotulos[i])}</text>`);
  }
  if (lin) {
    const pts = lin.map((v, i) => `${f(x0(i) + bw / 2)},${f(y(v))}`);
    partes.push(`<polyline class="${prefixo}-line" points="${pts.join(' ')}"/>`);
    const u = n - 1;
    if (u >= 0) partes.push(`<circle class="${prefixo}-dot" cx="${f(x0(u) + bw / 2)}" cy="${f(y(lin[u]))}" r="4"/>`);
  }
  return `<svg class="${prefixo}-svg" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="gráfico de colunas">${partes.join('')}</svg>`;
}

const _exports = { PERIODOS, PERIODO_PADRAO, janela, inicioDaSemana, diasNecessarios, indiceBucket, agregar, horasAte, indiceDiaUtil, diasUteisEntre, media, mediana, formatarHoras, formatarDias, tetoBonito, svgColunas };
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.Metricas = _exports;
})();
