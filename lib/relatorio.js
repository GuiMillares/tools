// Planilha do Relatório (ADR-148) — lógica pura.
//
// A planilha "Domínios e Analytics" tem as 19 colunas do `config` do Relatório
// do painel idealplus, uma linha por contrato (aba Busca = Busca Cliente, aba
// MPI = MPI Solutions). Vem com os fixos preenchidos (bu_nome,
// usuario_responsavel_id, contract_type) e o Hub preenche o resto: Salesforce
// (nome fantasia, 1º contato, contrato, pacote, valor), o site (ID do cliente,
// tags, tipo, categorias e palavras-chave) e o Google (conta e propriedade do
// GA4, site do Search Console e qual login enxerga cada um).
//
// Aqui fica o que decide sem rede e sem tela:
//   - ler a planilha de entrada (as duas abas) e normalizar CNPJ e nº do contrato;
//   - ler o HTML dos sites Busca One: os campos ocultos (idProjeto, tipoProjeto),
//     as tags, o menu (categoria → palavras), os cartões de /categorias e das
//     páginas de categoria, e o sitemap;
//   - a regra das palavras: One = as categorias; Híbrido = categorias + palavras;
//   - as linhas de saída (as mesmas 19 colunas) e as abas do .xlsx.
//
// Roda no processo principal (require), no renderer (window.Relatorio) e no
// script de amostra, como o lib/vinculos.js.

(function () {
  'use strict';

  const DIACRITICOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
  const texto = (v) => String(v == null ? '' : v).trim();
  const semAcento = (s) => texto(s).normalize('NFD').replace(DIACRITICOS, '');
  const chave = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9+]/g, '');
  const umEspaco = (s) => texto(s).replace(/\s+/g, ' ');
  const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // As 19 colunas, na ordem da planilha. O cabeçalho da saída é este, sempre.
  const COLUNAS = [
    'cnpj', 'razao_social', 'nome_fantasia', 'nome_responsavel', 'email_responsavel', 'telefone_responsavel',
    'bu_nome', 'numero_contrato', 'usuario_responsavel_id', 'external_id', 'contract_type',
    'ga_account_key', 'ga_property_id', 'ga_oauth_connection_name', 'gsc_oauth_connection_name', 'gsc_site_url',
    'pacote_palavras', 'valor_mensal', 'palavras',
  ];
  // O que o Hub preenche; o resto vem da planilha como está.
  const COLUNAS_PREENCHIDAS = [
    'nome_fantasia', 'nome_responsavel', 'email_responsavel', 'telefone_responsavel', 'numero_contrato', 'external_id',
    'ga_account_key', 'ga_property_id', 'ga_oauth_connection_name', 'gsc_oauth_connection_name', 'gsc_site_url',
    'pacote_palavras', 'valor_mensal', 'palavras',
  ];

  // ---------- Entrada ----------

  // "Busca", "Busca Cliente", "BC" → Busca; "MPI", "MPI Solutions" → MPI. MPI+ não entra.
  function empresaDaAba(nome) {
    const k = chave(nome);
    if (!k) return '';
    if (k === 'mpi+' || k === 'mpiplus') return '';
    if (k.startsWith('busca') || k === 'bc') return 'Busca';
    if (k.startsWith('mpi')) return 'MPI';
    return '';
  }

  function limparCnpj(v) { return texto(v).replace(/\D/g, ''); }

  // 14 dígitos → 00.000.000/0000-00; 11 → 000.000.000-00 (há CPF na planilha).
  function formatarCnpj(v) {
    const d = limparCnpj(v);
    if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    return texto(v);
  }

  // O ContractNumber do Salesforce tem 8 dígitos com zero à esquerda
  // ("02007819"); a planilha traz 7 ("2041343").
  function numeroContratoSalesforce(v) {
    const d = texto(v).replace(/\D/g, '');
    if (!d) return '';
    return d.length < 8 ? d.padStart(8, '0') : d;
  }

  // O cabeçalho da aba manda; sem ele, valem as posições de COLUNAS.
  function mapaDoCabecalho(linha) {
    const l = (linha || []).map((c) => chave(c).replace(/\+/g, ''));
    const mapa = {};
    let achou = 0;
    COLUNAS.forEach((col) => {
      const i = l.indexOf(chave(col));
      if (i >= 0) { mapa[col] = i; achou++; }
    });
    if (achou < 3) return null;
    return mapa;
  }

  // abas: [{ aba, linhas: [[...], ...] }] (o que planilha:lerAbas devolve).
  // Devolve os itens, um por linha com razão social, com a aba e a empresa.
  function lerEntrada(abas) {
    const itens = [];
    const ignoradas = [];
    const avisos = [];
    for (const a of abas || []) {
      const empresa = empresaDaAba(a && a.aba);
      const linhas = Array.isArray(a && a.linhas) ? a.linhas : [];
      if (!empresa) { if (linhas.length) ignoradas.push(`${texto(a.aba)} (${linhas.length} linha(s))`); continue; }
      if (!linhas.length) continue;
      let mapa = mapaDoCabecalho(linhas[0]);
      let inicio = 1;
      if (!mapa) { mapa = {}; COLUNAS.forEach((c, i) => { mapa[c] = i; }); inicio = 0; avisos.push(`a aba ${a.aba} não tem o cabeçalho das 19 colunas; usei as posições.`); }
      for (let i = inicio; i < linhas.length; i++) {
        const l = Array.isArray(linhas[i]) ? linhas[i] : [];
        const original = {};
        for (const c of COLUNAS) original[c] = mapa[c] === undefined ? '' : texto(l[mapa[c]]);
        if (!original.razao_social && !original.cnpj && !original.numero_contrato) continue;
        itens.push({
          aba: a.aba, empresa, linha: i + 1, original,
          cnpj: limparCnpj(original.cnpj), razao: original.razao_social, numeroContrato: numeroContratoSalesforce(original.numero_contrato),
        });
      }
    }
    return { itens, ignoradas, avisos };
  }

  function chaveItem(it) { return `${it.aba}!${it.linha}`; }

  // ---------- Valores ----------

  // "R$2034,24", como o usuário pediu (09/10/2026): sem espaço e sem ponto de milhar.
  function formatarValorMensal(v) {
    if (v === null || v === undefined || v === '') return '';
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    if (!isFinite(n)) return texto(v);
    return `R$${n.toFixed(2).replace('.', ',')}`;
  }

  function primeiroNome(nome) { return texto(nome).split(/\s+/)[0] || ''; }

  // ---------- O HTML dos sites Busca One ----------

  // Os campos ocultos da barra do /doutor: idProjeto é o ID do cliente no
  // painel (o que a extensão do Busca mostra), tipoProjeto diz "Busca One
  // (BuscaMax 3.0)" ou "Busca One Híbrido (BuscaMax 3.0)".
  function camposOcultos(html) {
    const h = String(html || '');
    const campo = (nome) => {
      const m = h.match(new RegExp('<input[^>]+name=["\']' + nome + '["\'][^>]*value=["\']([^"\']*)["\']', 'i'))
        || h.match(new RegExp('<input[^>]+value=["\']([^"\']*)["\'][^>]*name=["\']' + nome + '["\']', 'i'));
      return m ? texto(m[1]) : '';
    };
    return { idProjeto: campo('idProjeto').replace(/\D/g, ''), tipoProjeto: campo('tipoProjeto'), urlProjeto: campo('urlProjeto'), emailProjeto: campo('emailProjeto') };
  }

  // "Busca One Híbrido (BuscaMax 3.0)" → hibrido; "Busca One (BuscaMax 3.0)" → one.
  function tipoDoTexto(t) {
    const k = chave(t);
    if (!k) return '';
    if (k.includes('hibrid')) return 'hibrido';
    if (k === 'mpi+' || k === 'mpiplus') return 'mpi+';
    if (k.includes('one') || k.includes('busca')) return 'one';
    return '';
  }
  const TIPO_ROTULO = { one: 'Busca One', hibrido: 'Busca One Híbrido', 'mpi+': 'MPI+' };

  const unicos = (arr) => [...new Set(arr)];

  // Todos os G-… e GTM-… do HTML (como o lib/vinculos faz).
  function tagsDoHtml(html) {
    const h = String(html || '');
    return {
      ga: unicos((h.match(/\bG-[A-Z0-9]{5,}\b/g) || []).map((x) => x.toUpperCase())),
      gtm: unicos((h.match(/\bGTM-[A-Z0-9]{4,}\b/g) || []).map((x) => x.toUpperCase())),
    };
  }

  // "https://www.cliente.com.br/" → "cliente.com.br".
  function limparDominio(valor) {
    let s = texto(valor).toLowerCase();
    if (!s) return '';
    s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '').replace(/^www\./, '');
    return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s) ? s : '';
  }

  // O host como aparece nos links do site: com ou sem www, http ou https.
  function reHost(host) {
    const h = limparDominio(host) || texto(host).toLowerCase();
    return 'https?:\\/\\/(?:www\\.)?' + escapeRe(h) + '\\/';
  }

  // Páginas da raiz que não são categoria nem palavra.
  const INSTITUCIONAIS = new Set([
    'empresa', 'contato', 'categorias', 'produtos', 'servicos', 'blog', 'sobre', 'sobre-nos', 'orcamento', 'fale-conosco',
    'cobertura', 'duvidas-frequentes', 'politica-de-privacidade', 'trabalhe-conosco', 'portfolio', 'clientes', 'depoimentos',
    'sustentabilidade', 'certificacoes', 'planos', 'quem-somos', 'noticias', 'informacoes', 'localizacao', 'mapa-do-site',
    'home', 'index', 'busca', 'search', 'cadastro', 'login', 'obrigado', 'parceiros', 'galeria', 'unidades', 'lojas', 'promocoes',
  ]);
  const ehSlugDePagina = (s) => /^[a-z0-9][a-z0-9-]*$/.test(s) && !INSTITUCIONAIS.has(s) && !/\.(php|html?|xml|txt|pdf|jpe?g|png|webp|gif|svg|css|js)$/.test(s);

  // O menu "Categorias" dos sites híbridos: <a href="…/categoria">nome</a>
  // seguido de <ul class="sub-menu"> com as palavras-chave (links da raiz).
  function menuDoHtml(html, host) {
    const h = String(html || '');
    const base = reHost(host);
    const re = new RegExp('<a\\s[^>]*href="' + base + '([a-z0-9-]+)\\/?"[^>]*>([^<]*)<\\/a>\\s*<ul class="sub-menu">([\\s\\S]*?)<\\/ul>', 'g');
    const reItem = new RegExp('<a\\s[^>]*href="' + base + '([a-z0-9-]+)\\/?"[^>]*>([^<]*)<\\/a>', 'g');
    const categorias = [];
    const palavras = [];
    let m;
    while ((m = re.exec(h))) {
      const slug = m[1];
      if (!ehSlugDePagina(slug)) continue;
      const titulo = umEspaco(m[2]) || tituloDoSlug(slug);
      categorias.push({ slug, titulo });
      let it;
      reItem.lastIndex = 0;
      while ((it = reItem.exec(m[3]))) {
        if (!ehSlugDePagina(it[1]) || it[1] === slug) continue;
        palavras.push({ slug: it[1], titulo: umEspaco(it[2]) || tituloDoSlug(it[1]), categoria: slug });
      }
    }
    return { categorias, palavras };
  }

  // Os cartões (<a href="…/slug"> … <h2 class="card__title">título</h2>) de
  // /categorias e das páginas de categoria. Só links da raiz do site.
  function cardsDoHtml(html, host) {
    const h = String(html || '');
    const re = new RegExp('<a\\s[^>]*href="' + reHost(host) + '([a-z0-9-]+)\\/?"[^>]*>(?:(?!<\\/a>)[\\s\\S]){0,900}?<h2 class="card__title">\\s*([^<]*?)\\s*<\\/h2>', 'g');
    const out = [];
    const vistos = new Set();
    let m;
    while ((m = re.exec(h))) {
      const slug = m[1];
      if (!ehSlugDePagina(slug) || vistos.has(slug)) continue;
      vistos.add(slug);
      out.push({ slug, titulo: umEspaco(m[2]) || tituloDoSlug(slug) });
    }
    return out;
  }

  // Os links data-mpi da raiz (o menu dos sites One lista as categorias assim).
  function linksDataMpi(html, host) {
    const h = String(html || '');
    const re = new RegExp('<a\\s[^>]*data-mpi[^>]*href="' + reHost(host) + '([a-z0-9-]+)\\/?"[^>]*>([^<]*)<\\/a>', 'g');
    const out = [];
    const vistos = new Set();
    let m;
    while ((m = re.exec(h))) {
      if (!ehSlugDePagina(m[1]) || vistos.has(m[1])) continue;
      vistos.add(m[1]);
      out.push({ slug: m[1], titulo: umEspaco(m[2]) || tituloDoSlug(m[1]) });
    }
    return out;
  }

  // O <h1 class="bread__title"> (ou o <title> sem o " - Empresa") de uma página.
  function tituloDaPagina(html) {
    const h = String(html || '');
    const m = h.match(/<h1[^>]*class="[^"]*bread__title[^"]*"[^>]*>\s*([^<]*?)\s*<\/h1>/i);
    if (m && umEspaco(m[1])) return umEspaco(m[1]);
    const t = h.match(/<title>\s*([^<]*?)\s*<\/title>/i);
    if (!t) return '';
    return umEspaco(t[1]).replace(/\s+[-|–]\s+[^-|–]+$/, '');
  }

  // sitemap.xml: as URLs; se for um índice, os sitemaps filhos.
  function lerSitemap(xml) {
    const x = String(xml || '');
    const locs = [];
    const re = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
    let m;
    while ((m = re.exec(x))) locs.push(m[1].replace(/&amp;/g, '&'));
    const indice = /<sitemapindex[\s>]/i.test(x);
    return { indice, urls: indice ? [] : locs, filhos: indice ? locs : [] };
  }

  // Nos híbridos, as páginas de cidade são /categoria/palavra/palavra-cidade:
  // o meio da URL é a palavra-chave e o começo a categoria.
  function paresDoSitemap(urls, host) {
    const base = new RegExp('^' + reHost(host) + '([a-z0-9-]+)\\/([a-z0-9-]+)\\/[a-z0-9-]+\\/?$');
    const raiz = new RegExp('^' + reHost(host) + '([a-z0-9-]+)\\/?$');
    const pares = new Map();
    const nivel1 = new Set();
    for (const u of urls || []) {
      const m = String(u).match(base);
      if (m) { if (ehSlugDePagina(m[1]) && ehSlugDePagina(m[2])) pares.set(`${m[1]}/${m[2]}`, { categoria: m[1], slug: m[2] }); continue; }
      const r = String(u).match(raiz);
      if (r && ehSlugDePagina(r[1])) nivel1.add(r[1]);
    }
    return { pares: [...pares.values()], nivel1: [...nivel1] };
  }

  // "banqueta-baixa-de-plastico" → "banqueta baixa de plastico" (sem acento: é
  // o que dá para saber só pelo slug; a página tem o título certo).
  function tituloDoSlug(slug) { return String(slug || '').replace(/-+/g, ' ').trim(); }

  // Junta as fontes num conjunto só, sem repetir slug. Título: o dos cartões
  // ou do menu (como o site escreve); quem só está no sitemap fica com o
  // título pelo slug, marcado, até a página dizer o certo.
  //
  //   fontes = { menu, cardsCategorias, cardsPorCategoria: { slug: [cards] },
  //              dataMpi, sitemap: { pares, nivel1 }, titulos: { slug: título } }
  function juntarFontes(f) {
    const fontes = f || {};
    const cats = new Map();   // slug → { slug, titulo, fontes:Set }
    const pals = new Map();   // slug → { slug, titulo, categoria, fontes:Set, tituloPeloSlug }
    const addCat = (c, fonte) => {
      if (!c || !c.slug) return;
      const e = cats.get(c.slug) || { slug: c.slug, titulo: '', fontes: new Set() };
      if (!e.titulo && c.titulo) e.titulo = c.titulo;
      e.fontes.add(fonte);
      cats.set(c.slug, e);
    };
    const addPal = (p, fonte, { peloSlug = false } = {}) => {
      if (!p || !p.slug) return;
      const e = pals.get(p.slug) || { slug: p.slug, titulo: '', categoria: '', fontes: new Set(), tituloPeloSlug: false };
      if (p.titulo && (!e.titulo || e.tituloPeloSlug)) { e.titulo = p.titulo; e.tituloPeloSlug = peloSlug; }
      if (!e.categoria && p.categoria) e.categoria = p.categoria;
      e.fontes.add(fonte);
      pals.set(p.slug, e);
    };

    const menu = fontes.menu || { categorias: [], palavras: [] };
    for (const c of menu.categorias || []) addCat(c, 'menu');
    for (const p of menu.palavras || []) addPal(p, 'menu');
    for (const c of fontes.cardsCategorias || []) addCat(c, 'categorias');
    const porCat = fontes.cardsPorCategoria || {};
    for (const slug of Object.keys(porCat)) {
      for (const p of porCat[slug] || []) {
        if (cats.has(p.slug)) continue; // um cartão para outra categoria, não palavra
        addPal({ ...p, categoria: slug }, 'pagina da categoria');
      }
    }
    const sm = fontes.sitemap || { pares: [], nivel1: [] };
    const temCategorias = cats.size > 0;
    for (const par of sm.pares || []) {
      // Só vale par cuja categoria é conhecida; sem categoria nenhuma
      // conhecida (sem /categorias), vale tudo que não é institucional.
      if (temCategorias && !cats.has(par.categoria)) continue;
      if (cats.has(par.slug)) continue;
      addPal({ slug: par.slug, titulo: tituloDoSlug(par.slug), categoria: par.categoria }, 'sitemap', { peloSlug: true });
    }
    // Os links data-mpi do menu dos sites One são as categorias; nos híbridos
    // o menu já foi lido com a estrutura (categoria → palavras), e o data-mpi
    // só confirma. Um link que já é palavra não vira categoria.
    for (const l of fontes.dataMpi || []) if (!pals.has(l.slug)) addCat(l, 'menu');
    // Títulos lidos das páginas (para quem só estava no sitemap).
    const titulos = fontes.titulos || {};
    for (const slug of Object.keys(titulos)) {
      const t = umEspaco(titulos[slug]);
      if (!t) continue;
      if (pals.has(slug)) { const e = pals.get(slug); e.titulo = t; e.tituloPeloSlug = false; }
      else if (cats.has(slug)) cats.get(slug).titulo = t;
    }
    const lista = (m) => [...m.values()].map((e) => ({ ...e, fontes: [...e.fontes] }));
    return { categorias: lista(cats), palavras: lista(pals) };
  }

  // A regra: One = as categorias; Híbrido = categorias + palavras-chave.
  // Separadas por "|" sem espaço, sem repetir (sem acento e caixa para
  // comparar), na ordem em que o site lista.
  function montarPalavras(tipo, achado) {
    const a = achado || { categorias: [], palavras: [] };
    const itens = tipo === 'hibrido' ? [...(a.categorias || []), ...(a.palavras || [])] : [...(a.categorias || [])];
    const vistos = new Set();
    const out = [];
    for (const it of itens) {
      const t = umEspaco(it && it.titulo).replace(/\|/g, '/');
      if (!t) continue;
      const k = chave(t);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      out.push(t);
    }
    return out.join('|');
  }

  // O tipo pela estrutura, quando nem o site nem a planilha de fluxo dizem:
  // palavras embaixo de categorias é híbrido; só categorias é One.
  function tipoPelaEstrutura(achado) {
    const a = achado || {};
    if ((a.palavras || []).length) return 'hibrido';
    if ((a.categorias || []).length) return 'one';
    return '';
  }

  // Escada do tipo: o próprio site (tipoProjeto), a planilha de fluxo, a estrutura.
  function decidirTipo({ tipoProjeto, tipoFluxo, achado } = {}) {
    const doSite = tipoDoTexto(tipoProjeto);
    if (doSite) return { tipo: doSite, origem: 'o site diz (tipoProjeto)' };
    const daPlanilha = tipoDoTexto(tipoFluxo);
    if (daPlanilha) return { tipo: daPlanilha, origem: 'planilha de fluxo de publicação' };
    const pela = tipoPelaEstrutura(achado);
    if (pela) return { tipo: pela, origem: 'deduzido pela estrutura do site' };
    return { tipo: '', origem: 'não deu para saber' };
  }

  // ---------- Saída ----------

  const PENDENCIA_ROTULO = {
    conta: 'conta não achada no Salesforce',
    contrato: 'contrato não achado',
    site: 'sem site',
    contato: 'sem contato',
    id: 'sem ID do cliente',
    ga: 'sem propriedade do GA4',
    gaConexao: 'sem login do GA4',
    gsc: 'sem site no Search Console',
    gscConexao: 'sem login do Search Console',
    palavras: 'sem palavras',
    pacote: 'sem pacote',
    valor: 'sem valor mensal',
    tipo: 'tipo do site desconhecido',
  };

  // dados = o que a rodada achou para o item: { contaNome, nomeFantasia,
  //   contato:{nome,email,telefone}, numeroContrato, site, idProjeto, ga:{accountId,
  //   propertyId, conexao}, gsc:{siteUrl, conexao}, pacote, valor, palavras, tipo, ... }
  function linhaSaida(item, dados) {
    const o = (item && item.original) || {};
    const d = dados || {};
    const v = {
      ...o,
      cnpj: o.cnpj || (d.cnpj ? formatarCnpj(d.cnpj) : ''),
      razao_social: o.razao_social || d.contaNome || '',
      nome_fantasia: texto(d.nomeFantasia) || o.nome_fantasia || '',
      nome_responsavel: primeiroNome(d.contato && d.contato.nome) || o.nome_responsavel || '',
      email_responsavel: texto(d.contato && d.contato.email) || o.email_responsavel || '',
      telefone_responsavel: texto(d.contato && d.contato.telefone) || o.telefone_responsavel || '',
      numero_contrato: o.numero_contrato || texto(d.numeroContrato) || '',
      external_id: texto(d.idProjeto) || o.external_id || '',
      ga_account_key: texto(d.ga && d.ga.accountId) || o.ga_account_key || '',
      ga_property_id: texto(d.ga && d.ga.propertyId) || o.ga_property_id || '',
      ga_oauth_connection_name: texto(d.ga && d.ga.conexao) || o.ga_oauth_connection_name || '',
      gsc_oauth_connection_name: texto(d.gsc && d.gsc.conexao) || o.gsc_oauth_connection_name || '',
      gsc_site_url: texto(d.gsc && d.gsc.siteUrl) || o.gsc_site_url || '',
      pacote_palavras: texto(d.pacote) || o.pacote_palavras || '',
      valor_mensal: d.valor === undefined || d.valor === null || d.valor === '' ? (o.valor_mensal || '') : formatarValorMensal(d.valor),
      palavras: texto(d.palavras) || o.palavras || '',
    };
    return COLUNAS.map((c) => v[c] === undefined ? '' : v[c]);
  }

  // O que ficou vazio do que o Hub deveria preencher.
  function pendenciasDaLinha(item, dados) {
    const d = dados || {};
    const p = [];
    if (!d.contaId) { p.push('conta'); return p; }
    if (!d.numeroContrato) p.push('contrato');
    if (!d.site) p.push('site');
    if (!(d.contato && (d.contato.nome || d.contato.email))) p.push('contato');
    if (d.site) {
      if (!d.idProjeto) p.push('id');
      if (!(d.ga && d.ga.propertyId)) p.push('ga');
      else if (!(d.ga && d.ga.conexao)) p.push('gaConexao');
      if (!(d.gsc && d.gsc.siteUrl)) p.push('gsc');
      else if (!(d.gsc && d.gsc.conexao)) p.push('gscConexao');
      if (!d.palavras) p.push('palavras');
      if (!d.tipo) p.push('tipo');
    }
    if (!texto(d.pacote)) p.push('pacote');
    if (d.valor === undefined || d.valor === null || d.valor === '') p.push('valor');
    return p;
  }

  function situacao(item, dados) {
    const p = pendenciasDaLinha(item, dados);
    if (!p.length) return 'completo';
    if (p.includes('conta')) return 'erro';
    return 'parcial';
  }
  const SITUACOES = { completo: 'Completo', parcial: 'Parcial', erro: 'Sem conta' };

  const COLUNAS_DIAGNOSTICO = [
    'Aba', 'Linha', 'Razão social', 'Situação', 'Pendências', 'Domínio', 'Tipo', 'Tipo (origem)', 'Conta (como achou)', 'Contrato (como escolheu)',
    'Contratos vistos', 'ID (origem)', 'Tags no site', 'GA4 (como)', 'Search Console (como)', 'Categorias', 'Palavras', 'Fontes das palavras',
    'Pacote x achado', 'Observações', 'Preenchido em',
  ];

  function linhaDiagnostico(r) {
    const d = r.dados || {};
    const nCat = (d.achado && d.achado.categorias || []).length;
    const nPal = (d.achado && d.achado.palavras || []).length;
    const total = d.palavras ? d.palavras.split('|').length : 0;
    const pacote = Number(String(d.pacote || '').replace(/\D/g, '')) || 0;
    return [
      r.aba, r.linha, r.razao, SITUACOES[r.situacao] || r.situacao, (r.pendencias || []).map((p) => PENDENCIA_ROTULO[p] || p).join('; '),
      d.site || '', TIPO_ROTULO[d.tipo] || d.tipo || '', d.tipoOrigem || '', d.comoAchouConta || '', d.comoEscolheuContrato || '',
      d.contratosVistos || '', d.idOrigem || '', [...(d.tags && d.tags.ga || []), ...(d.tags && d.tags.gtm || [])].join(', '),
      d.ga && d.ga.como || '', d.gsc && d.gsc.como || '', nCat, nPal, d.fontesPalavras || '',
      pacote ? `${pacote} contratadas, ${total} na coluna` : (total ? `${total} na coluna` : ''),
      (r.observacoes || []).join('; '), r.preenchidoEm || '',
    ];
  }

  // As abas do .xlsx: Busca e MPI com as 19 colunas (prontas para importar),
  // Diagnóstico (como cada dado foi achado) e Pendências (só quem faltou algo).
  function montarAbasXlsx(resultados) {
    const lista = resultados || [];
    const linhasDe = (empresa) => lista.filter((r) => r.empresa === empresa).map((r) => r.saida || linhaSaida(r, r.dados));
    const pend = lista.filter((r) => r.situacao !== 'completo');
    return [
      { aba: 'Busca', colunas: COLUNAS, linhas: linhasDe('Busca') },
      { aba: 'MPI', colunas: COLUNAS, linhas: linhasDe('MPI') },
      { aba: 'Diagnóstico', colunas: COLUNAS_DIAGNOSTICO, linhas: lista.map(linhaDiagnostico) },
      { aba: 'Pendências', colunas: COLUNAS_DIAGNOSTICO, linhas: pend.map(linhaDiagnostico) },
    ];
  }

  function contagem(resultados) {
    const c = { completo: 0, parcial: 0, erro: 0, total: 0 };
    for (const r of resultados || []) { c.total++; c[r.situacao] = (c[r.situacao] || 0) + 1; }
    return c;
  }

  function textoLinha(r) {
    const d = (r && r.dados) || {};
    const quem = `${texto(r.razao) || '(sem razão social)'}${d.site ? ` — ${d.site}` : ''}`;
    const pend = (r.pendencias || []).map((p) => PENDENCIA_ROTULO[p] || p);
    if (r.situacao === 'completo') return `${quem}: completo${d.palavras ? ` (${d.palavras.split('|').length} palavras)` : ''}`;
    return `${quem}: ${SITUACOES[r.situacao] || r.situacao}${pend.length ? ` (${pend.join(', ')})` : ''}${r.erro ? ` — ${r.erro}` : ''}`;
  }

  function textoResumo(resultados) {
    const c = contagem(resultados);
    return `${c.completo} completa(s), ${c.parcial} parcial(is), ${c.erro} sem conta, de ${c.total}`;
  }

  const _exports = {
    COLUNAS, COLUNAS_PREENCHIDAS, COLUNAS_DIAGNOSTICO, SITUACOES, PENDENCIA_ROTULO, TIPO_ROTULO, INSTITUCIONAIS,
    empresaDaAba, limparCnpj, formatarCnpj, numeroContratoSalesforce, mapaDoCabecalho, lerEntrada, chaveItem,
    formatarValorMensal, primeiroNome,
    camposOcultos, tipoDoTexto, tagsDoHtml, limparDominio, menuDoHtml, cardsDoHtml, linksDataMpi, tituloDaPagina,
    lerSitemap, paresDoSitemap, tituloDoSlug, juntarFontes, montarPalavras, tipoPelaEstrutura, decidirTipo, ehSlugDePagina,
    linhaSaida, pendenciasDaLinha, situacao, linhaDiagnostico, montarAbasXlsx, contagem, textoLinha, textoResumo,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
  if (typeof window !== 'undefined') window.Relatorio = _exports;
})();
