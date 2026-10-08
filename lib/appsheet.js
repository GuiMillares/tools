// AppSheet "Backup Informações Busca Cliente" (ADR-147): a parte pura.
//
// O app não tem API aberta: o Hub abre a view "Informações Cliente" numa
// janela própria (login com o Google, uma vez), digita o domínio na busca e
// traz o que a página mostra — as LINHAS que citam o domínio (texto de cada
// bloco) e as FOLHAS de texto da tela de detalhe (rótulos e valores, na ordem
// em que aparecem). Aqui, sem DOM nem rede, decide qual é a razão social.
// Testável com texto cru (tools/test-appsheet.js).

const RE_LIMPA = /^(https?:\/\/)?(www\.)?/i;
const normaliza = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const limparDominio = (d) => normaliza(d).replace(RE_LIMPA, '').replace(/\/.*$/, '');

// Rótulos que costumam guardar a razão social, do mais ao menos provável. No
// "Backup Informações Busca Cliente" o campo é "Cliente" (print de 08/10:
// ID Original / Cliente / CNPJ, um rótulo em cima de cada valor).
const ROTULOS_RAZAO = [/raz[aã]o\s*social/i, /^cliente$/i, /nome\s*(da\s*)?empresa/i, /^empresa$/i, /^nome\s*fantasia$/i, /^nome$/i];
// O que NÃO é nome de empresa, mesmo estando na linha.
const RE_NAO_NOME = /^(https?:\/\/|www\.)|@|^\+?\d[\d\s().-]{6,}$|^\d{2}\/\d{2}\/\d{4}|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d+([.,]\d+)?$/i;
const RE_SUFIXO_EMPRESA = /\b(ltda|me|epp|eireli|s\/?a|sa|mei|cia|ltd|inc)\b\.?$/i;

function pareceDominioTexto(txt, dominio) {
  const t = limparDominio(txt);
  return !!t && (t === dominio || t.startsWith(dominio + '/') || t.endsWith('.' + dominio));
}
function textoCitaDominio(txt, dominio) {
  const t = normaliza(txt);
  if (!t.includes(dominio)) return false;
  // O domínio tem de aparecer inteiro (não "cliente.com.br" dentro de "outrocliente.com.br").
  const i = t.indexOf(dominio);
  const antes = i > 0 ? t[i - 1] : ' ';
  return !/[a-z0-9-]/.test(antes);
}

// Um pedaço de linha parece nome de empresa?
function pareceRazaoSocial(txt, dominio) {
  const t = String(txt || '').trim();
  if (t.length < 4 || t.length > 120) return false;
  if (RE_NAO_NOME.test(t)) return false;
  if (pareceDominioTexto(t, dominio) || textoCitaDominio(t, dominio)) return false;
  if (!/[a-zÀ-ÿ]/i.test(t)) return false;
  // Rótulo de campo ("Razão Social:") não é valor.
  if (/:$/.test(t) && t.split(/\s+/).length <= 3) return false;
  return true;
}

// A razão social pelo rótulo, nas folhas de texto da tela de detalhe: o valor
// é a primeira folha depois do rótulo que não é outro rótulo. O detalhe tem de
// ser do domínio certo: ou ele cita o domínio, ou foi aberto a partir da linha
// que o citava (`confiavel`) — a tela de detalhe nem sempre mostra o site.
function razaoPelasFolhas(folhas, dominio, { confiavel = false } = {}) {
  const lista = (folhas || []).map((f) => String(f || '').trim()).filter(Boolean);
  if (!confiavel && !lista.some((f) => textoCitaDominio(f, dominio))) return null;
  for (const re of ROTULOS_RAZAO) {
    for (let i = 0; i < lista.length; i++) {
      const rot = lista[i].replace(/:$/, '').trim();
      if (!re.test(rot)) continue;
      // "Razão Social: ACME LTDA" numa folha só.
      const junto = lista[i].match(/^[^:]{2,40}:\s*(.+)$/);
      if (junto && pareceRazaoSocial(junto[1], dominio)) return { razao: junto[1].trim(), via: `campo "${rot}"` };
      for (let k = i + 1; k < Math.min(lista.length, i + 4); k++) {
        if (pareceRazaoSocial(lista[k], dominio)) return { razao: lista[k], via: `campo "${rot}"` };
      }
    }
  }
  return null;
}

// A razão social pela linha da lista que cita o domínio: entre os pedaços da
// linha (um por quebra), o que parece nome de empresa — com preferência para
// quem termina em LTDA/ME/EIRELI/S.A. e, depois, para o primeiro que sobrar.
function razaoPelaLinha(linhas, dominio) {
  for (const l of linhas || []) {
    const texto = typeof l === 'string' ? l : (l && l.texto) || '';
    if (!textoCitaDominio(texto, dominio)) continue;
    const pedacos = texto.split(/\r?\n|\s{2,}|\s[|·•]\s/).map((p) => p.trim()).filter(Boolean);
    const cand = pedacos.filter((p) => pareceRazaoSocial(p, dominio));
    if (!cand.length) continue;
    const comSufixo = cand.find((p) => RE_SUFIXO_EMPRESA.test(p));
    return { razao: comSufixo || cand[0], via: 'linha da lista', linha: texto };
  }
  return null;
}

// O que o Hub leu da página → a razão social (ou não). `detalheDe` é o texto
// do elemento clicado para abrir o detalhe: citando o domínio, o detalhe é
// confiável mesmo sem mostrar o site.
function acharRazaoNoAppSheet({ linhas = [], folhas = [], detalheDe = '' } = {}, dominio) {
  const dom = limparDominio(dominio);
  if (!dom) return { achou: false, motivo: 'domínio vazio' };
  const porCampo = razaoPelasFolhas(folhas, dom, { confiavel: textoCitaDominio(detalheDe, dom) });
  if (porCampo) return { achou: true, razao: porCampo.razao, via: porCampo.via };
  const porLinha = razaoPelaLinha(linhas, dom);
  if (porLinha) return { achou: true, razao: porLinha.razao, via: porLinha.via, linha: porLinha.linha };
  const citou = (linhas || []).some((l) => textoCitaDominio(typeof l === 'string' ? l : (l && l.texto), dom)) || (folhas || []).some((f) => textoCitaDominio(f, dom));
  return { achou: false, motivo: citou ? 'o domínio aparece no AppSheet, mas não reconheci a razão social na linha' : 'o domínio não aparece no AppSheet' };
}

// ----- A view de verdade (vista logado em 08/10/2026) -----
//
// "Informações Cliente" é um painel com quatro tabelas (Busca Cliente,
// Doutores da Web / Ideal Marketing, Soluções Industriais, Clínica Ideal),
// cada linha `.TableViewRow` com 116 colunas `.TableViewRow__column` (as de
// fora da tela viram `__column-placeholder`, sem texto) e o cabeçalho em
// `.TableView__header-column`. A caixa "Search Informações Cliente" FILTRA
// as tabelas pelo texto de todas as colunas, inclusive as que a tela não
// mostra (o domínio costuma estar na ação "Open Url (Domínio Principal)",
// que não é texto). Então o jeito é: digitar o domínio, esperar o filtro e
// ler a coluna "Cliente" das linhas que sobraram — sem clicar em nada.
// Quem desempata e decide é `escolherLinhaAppSheet`, abaixo.

// O script que roda DENTRO da página (string; o Hub injeta pelo
// executeJavaScript, que já embrulha num async). Devolve
// { semCaixa } quando a view não carregou, senão { base, n, linhas }.
function JS_BUSCAR(dominio) {
  return `
  const dom = ${JSON.stringify(String(dominio || '').toLowerCase())};
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (el) => { try { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (e) { return false; } };
  const txt = (el) => String((el && (el.innerText !== undefined ? el.innerText : el.textContent)) || '').trim();
  const acharCaixa = () => [...document.querySelectorAll('input')].find((i) => vis(i) && /search|pesquis|procur/i.test((i.getAttribute('aria-label') || '') + ' ' + (i.placeholder || '')));
  let caixa = acharCaixa();
  for (let i = 0; i < 100 && !caixa; i++) { await espera(250); caixa = acharCaixa(); }
  if (!caixa) return { semCaixa: true, texto: txt(document.body).slice(0, 1200), url: location.href };
  const setar = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const digitar = (v) => { caixa.focus(); setar.call(caixa, v); caixa.dispatchEvent(new Event('input', { bubbles: true })); };
  const linhasVisiveis = () => [...document.querySelectorAll('.TableViewRow')].filter(vis);
  const lerLinhas = () => linhasVisiveis().slice(0, 12).map((row) => {
    const tabela = row.closest('.TableView');
    const entrada = row.closest('.DashboardView__entry');
    const cabs = tabela ? [...tabela.querySelectorAll('.TableView__header-column')].map((h) => txt(h)) : [];
    const cels = [...row.querySelectorAll('.TableViewRow__column, .TableViewRow__column-placeholder')].map((c) => txt(c));
    const col = (nome) => { const i = cabs.findIndex((h) => h.toLowerCase() === nome.toLowerCase()); return i >= 0 ? (cels[i] || '') : ''; };
    return { tabela: entrada ? txt(entrada.querySelector('.DashboardView__entry-header')).slice(0, 60) : '', id: row.id || '', cliente: col('Cliente'), dominio: col('Domínio'), ftp: col('FTP'), descricao: col('Descrição Cliente'), texto: cels.filter(Boolean).join(' | ').slice(0, 400) };
  });
  digitar('');
  await espera(700);
  const base = linhasVisiveis().length;
  digitar(dom);
  const fim = Date.now() + 6000;
  while (Date.now() < fim && linhasVisiveis().length === base) await espera(150);
  await espera(900);
  const linhas = lerLinhas();
  const n = linhasVisiveis().length;
  digitar('');
  return { base, n, linhas, url: location.href };
  `;
}

// As linhas que o filtro deixou → a razão social (ou não). Uma linha, ou
// várias do mesmo cliente: é ele. Várias de clientes diferentes: fica com as
// que citam o domínio em alguma coluna visível (Domínio, FTP, descrição…);
// se ainda sobrar mais de um cliente, é ambíguo e vai para revisão — a busca
// do AppSheet é por substring em todas as colunas e pode pegar outro cliente
// (um e-mail @mpr.com.br na ROMA, por exemplo).
function escolherLinhaAppSheet(linhas, dominio) {
  const dom = limparDominio(dominio);
  if (!dom) return { achou: false, motivo: 'domínio vazio' };
  const lista = (linhas || []).filter((l) => l && String(l.cliente || '').trim());
  if (!lista.length) return { achou: false, motivo: (linhas || []).length ? 'a busca do AppSheet devolveu linha(s) sem o campo Cliente' : 'o domínio não aparece no AppSheet' };
  const chave = (l) => normaliza(l.cliente);
  const distintos = (xs) => [...new Map(xs.map((l) => [chave(l), l])).values()];
  const cita = (l) => [l.dominio, l.ftp, l.descricao, l.texto].some((t) => textoCitaDominio(t, dom));
  const todos = distintos(lista);
  if (todos.length === 1) return { achou: true, razao: todos[0].cliente.trim(), via: `${lista.length > 1 ? lista.length + ' linhas' : 'linha'} do AppSheet (${todos[0].tabela || 'tabela'})${cita(todos[0]) ? ', citando o domínio' : ''}`, tabela: todos[0].tabela || '', id: todos[0].id || '' };
  const citam = distintos(lista.filter(cita));
  if (citam.length === 1) return { achou: true, razao: citam[0].cliente.trim(), via: `linha do AppSheet (${citam[0].tabela || 'tabela'}) que cita o domínio, entre ${todos.length} clientes filtrados`, tabela: citam[0].tabela || '', id: citam[0].id || '' };
  return { achou: false, ambiguo: true, motivo: `a busca do AppSheet devolveu ${todos.length} clientes (${todos.slice(0, 3).map((l) => l.cliente.trim()).join('; ')}${todos.length > 3 ? '; …' : ''}); revisar`, candidatos: todos.map((l) => l.cliente.trim()) };
}

module.exports = { acharRazaoNoAppSheet, razaoPelasFolhas, razaoPelaLinha, pareceRazaoSocial, textoCitaDominio, limparDominio, JS_BUSCAR, escolherLinhaAppSheet };
