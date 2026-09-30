// ADR-098: achar sozinho o link do painel MPI+ de um site da planilha.
//
// Mapeado em 23/09/2026 no painel, só leitura:
//   GET /clientes?busca=<razão social>  → tabela (ID, Empresa, CNPJ, …, Contratos).
//        A busca acha pela razão social mesmo quando o nome do cliente é outro
//        ("confeccoeshp" ← "HP - CONFECCOES HUMBERTO PASCUINI LTDA"). Domínio não acha.
//   GET /clientes/<c>                   → um cartão por projeto: <h3> com o nome
//        (quase sempre o domínio) e o link /clientes/<c>/hub?projeto=<p>.
//   GET /clientes/<c>/hub?projeto=<p>   → cartões dos contratos, links
//        …hub?projeto=<p>&contrato=<k>. A página é pesada (2 MB, ~20 s até o
//        primeiro byte), então só lemos o começo, até as abas.
//   GET /clientes/<c>/projetos/<p>/contratos/<k>/wordpress-full-install/status
//        → JSON com wordpress_temporary_url, wordpress_production_url,
//        wordpress_site_status. É o mesmo "link temporário" do alto da aba
//        Publicação (root.wordpressTemporaryUrl).
//
// O link temporário da planilha é o que confirma o contrato certo: cliente com
// vários projetos ou contratos não tem outro jeito seguro de escolher.

const PAINEL_HOST = 'idealplus.idealtrends.io';
const DOMINIO_TEMPORARIO = 'mpitemporario.com.br';
const MAX_CLIENTES = 5;

// "http://turbogeraiscomerciol-migra.mpitemporario.com.br/" → "turbogeraiscomerciol-migra.mpitemporario.com.br"
function normalizarTemporario(valor) {
  let s = String(valor || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '').replace(/^www\./, '');
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s) ? s : '';
}

function pareceTemporario(valor) {
  const h = normalizarTemporario(valor);
  return !!h && (h === DOMINIO_TEMPORARIO || h.endsWith(`.${DOMINIO_TEMPORARIO}`));
}

function linkDoContrato({ cliente, projeto, contrato }) {
  return `https://${PAINEL_HOST}/clientes/${cliente}/hub?projeto=${projeto}${contrato ? `&contrato=${contrato}` : ''}&tab=publicacao`;
}

// Projetos cujo nome cita o domínio vão primeiro: cada um custa ~20 s.
function ordenarProjetos(projetos, dominio) {
  const d = String(dominio || '').toLowerCase().replace(/^www\./, '');
  const cita = (p) => (d && String(p.nome || '').toLowerCase().replace(/^www\./, '') === d ? 0 : d && String(p.nome || '').toLowerCase().includes(d) ? 1 : 2);
  return [...projetos].sort((a, b) => cita(a) - cita(b));
}

// A decisão. contratos: [{ cliente, empresa, projeto, projetoNome, contrato, temporario, producao, status }]
function escolherContrato({ contratos = [], temporario = '', nClientes = 0 }) {
  const alvo = normalizarTemporario(temporario);
  const lista = contratos.map((c) => `${c.empresa || c.cliente} / ${c.projetoNome || c.projeto} / contrato ${c.contrato}: ${normalizarTemporario(c.temporario) || 'sem site temporário'}`);
  if (!contratos.length) return { erro: 'o cliente não tem contrato com projeto no painel' };
  if (alvo) {
    const iguais = contratos.filter((c) => normalizarTemporario(c.temporario) === alvo);
    if (iguais.length === 1) return { ok: true, contrato: iguais[0], url: linkDoContrato(iguais[0]), conferidoPeloTemporario: true };
    if (iguais.length > 1) return { erro: `${iguais.length} contratos com o temporário ${alvo}`, lista };
    return { erro: `nenhum contrato com o temporário ${alvo}`, lista };
  }
  if (nClientes === 1 && contratos.length === 1) {
    return { ok: true, contrato: contratos[0], url: linkDoContrato(contratos[0]), conferidoPeloTemporario: false };
  }
  return { erro: `${contratos.length} contratos em ${nClientes} cliente(s) e sem link temporário na planilha para saber qual é o certo`, lista };
}

// ----- Scripts que rodam dentro da janela do painel (logada). Só GET. -----

const JS_BUSCAR_CLIENTES = (razao) => `
  const r = await fetch('/clientes?per_page=50&busca=' + encodeURIComponent(${JSON.stringify(String(razao || ''))}), { credentials: 'same-origin' });
  if (/\\/login/.test(r.url)) return { erro: 'o painel pediu login de novo' };
  if (!r.ok) return { erro: 'a busca de clientes respondeu ' + r.status };
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  const clientes = [];
  for (const tr of doc.querySelectorAll('tbody tr')) {
    const tds = [...tr.querySelectorAll('td')].map((t) => t.textContent.replace(/\\s+/g, ' ').trim());
    const a = tr.querySelector('a[href*="/clientes/"]');
    const id = ((a && a.getAttribute('href')) || '').match(/\\/clientes\\/(\\d+)/);
    if (!id) continue;
    clientes.push({ id: id[1], empresa: tds[1] || '', cnpj: tds[2] || '', contratos: Number(tds[5]) || null, etapa: tds[7] || '' });
  }
  return { ok: true, clientes };
`;

const JS_PROJETOS_DO_CLIENTE = (cliente) => `
  const r = await fetch('/clientes/' + ${JSON.stringify(String(cliente))}, { credentials: 'same-origin' });
  if (!r.ok) return { erro: 'a página do cliente respondeu ' + r.status };
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  const vistos = new Set();
  const projetos = [];
  for (const a of doc.querySelectorAll('a[href*="hub?projeto="]')) {
    const m = (a.getAttribute('href') || '').match(/hub\\?projeto=(\\d+)/);
    if (!m || vistos.has(m[1])) continue;
    vistos.add(m[1]);
    let card = a;
    while (card.parentElement && !card.querySelector('h3')) card = card.parentElement;
    projetos.push({ projeto: m[1], nome: ((card.querySelector('h3') || {}).textContent || '').trim() });
  }
  return { ok: true, projetos };
`;

// Lê só até as abas (os contratos vêm antes), com prazo próprio.
const JS_CONTRATOS_DO_PROJETO = (cliente, projeto) => `
  const p = ${JSON.stringify(String(projeto))};
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 150000);
  let s = '';
  try {
    const r = await fetch('/clientes/' + ${JSON.stringify(String(cliente))} + '/hub?projeto=' + p, { credentials: 'same-origin', signal: ctl.signal });
    if (!r.ok) return { erro: 'a página do projeto respondeu ' + r.status };
    const rd = r.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await rd.read();
      if (done) break;
      s += dec.decode(value, { stream: true });
      if (s.indexOf("setHubTab(") > 0 && /contrato=\\d+/.test(s)) break;
    }
    rd.cancel().catch(() => {});
  } catch (e) {
    return { erro: 'a página do projeto não carregou em 150s' };
  } finally { clearTimeout(t); }
  const re = new RegExp('hub\\\\?projeto=' + p + '(?:&amp;|&)contrato=(\\\\d+)', 'g');
  let ks = [...new Set([...s.matchAll(re)].map((m) => m[1]))];
  if (!ks.length) ks = [...new Set([...s.matchAll(new RegExp('projetos\\\\\\\\?/' + p + '\\\\\\\\?/contratos\\\\\\\\?/(\\\\d+)', 'g'))].map((m) => m[1]))];
  return { ok: true, contratos: ks };
`;

const JS_SITE_DO_CONTRATO = (cliente, projeto, contrato) => `
  const r = await fetch('/clientes/' + ${JSON.stringify(String(cliente))} + '/projetos/' + ${JSON.stringify(String(projeto))} + '/contratos/' + ${JSON.stringify(String(contrato))} + '/wordpress-full-install/status', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!r.ok) return { erro: 'o status do contrato respondeu ' + r.status };
  const j = await r.json();
  return { ok: true, temporario: j.wordpress_temporary_url || '', producao: j.wordpress_production_url || '', status: j.wordpress_site_status || '' };
`;

// Orquestra. rodar(script) roda na janela logada e devolve o objeto (ou estoura).
async function acharContratoNoPainel(rodar, { razao, temporario, dominio }, push = () => {}) {
  const nome = String(razao || '').trim().replace(/\s+/g, ' ');
  if (!nome) return { erro: 'sem razão social na planilha para buscar no painel' };
  const alvo = normalizarTemporario(temporario);

  push(`Painel: buscando o cliente "${nome}"`, 'cmd');
  const busca = await rodar(JS_BUSCAR_CLIENTES(nome));
  let clientes = busca.clientes || [];
  // Várias respostas: fica a de nome idêntico, se houver.
  const identicos = clientes.filter((c) => c.empresa.trim().toLowerCase() === nome.toLowerCase());
  if (clientes.length > 1 && identicos.length === 1) clientes = identicos;
  if (!clientes.length) return { erro: `nenhum cliente no painel com "${nome}"` };
  if (clientes.length > MAX_CLIENTES) return { erro: `a busca por "${nome}" trouxe ${clientes.length} clientes; confira a razão social` };
  push(`Painel: ${clientes.length} cliente(s): ${clientes.map((c) => `${c.empresa} (${c.id})`).join(', ')}`, 'info');

  const contratos = [];
  for (const cli of clientes) {
    const { projetos = [] } = await rodar(JS_PROJETOS_DO_CLIENTE(cli.id));
    for (const pj of ordenarProjetos(projetos, dominio)) {
      push(`Painel: lendo os contratos do projeto ${pj.nome || pj.projeto} (a página do painel leva de 20 a 50s)`, 'cmd');
      const { contratos: ks = [] } = await rodar(JS_CONTRATOS_DO_PROJETO(cli.id, pj.projeto));
      for (const k of ks) {
        const site = await rodar(JS_SITE_DO_CONTRATO(cli.id, pj.projeto, k));
        const c = { cliente: cli.id, empresa: cli.empresa, projeto: pj.projeto, projetoNome: pj.nome, contrato: k, temporario: site.temporario, producao: site.producao, status: site.status };
        contratos.push(c);
        push(`Painel: ${pj.nome || pj.projeto} / contrato ${k}: temporário ${normalizarTemporario(site.temporario) || '(nenhum)'}`, 'info');
        // Temporário bateu: é esse. Não precisa abrir os outros projetos.
        if (alvo && normalizarTemporario(site.temporario) === alvo) {
          return { ...escolherContrato({ contratos: [c], temporario, nClientes: clientes.length }), contratos };
        }
      }
    }
  }
  return { ...escolherContrato({ contratos, temporario, nClientes: clientes.length }), contratos };
}

module.exports = {
  PAINEL_HOST, DOMINIO_TEMPORARIO, normalizarTemporario, pareceTemporario, linkDoContrato, ordenarProjetos,
  escolherContrato, acharContratoNoPainel,
  JS_BUSCAR_CLIENTES, JS_PROJETOS_DO_CLIENTE, JS_CONTRATOS_DO_PROJETO, JS_SITE_DO_CONTRATO,
};
