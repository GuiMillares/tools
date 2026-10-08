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

module.exports = { acharRazaoNoAppSheet, razaoPelasFolhas, razaoPelaLinha, pareceRazaoSocial, textoCitaDominio, limparDominio };
