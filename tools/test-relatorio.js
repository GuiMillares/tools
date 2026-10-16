// ADR-148: a Planilha do Relatório. Testa a parte pura (lib/relatorio.js) e a
// rodada de uma linha (lib/relatorio-rodada.js) com fontes falsas. Sem rede.
// Os trechos de HTML são dos sites reais vistos em 09/10/2026
// (3rsustentavel.com.br, One; jrplasticos.com.br e 3rinformatica, híbridos).
//
//     node tools/test-relatorio.js

const path = require('path');
const R = require(path.join(__dirname, '..', 'lib', 'relatorio'));
const Rodada = require(path.join(__dirname, '..', 'lib', 'relatorio-rodada'));

let falhas = 0;
const C = (l, nome) => l[R.COLUNAS.indexOf(nome)];
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// ---------- Fixtures ----------

const HOST_ONE = 'www.3rsustentavel.com.br';
const HOME_ONE = `<html><head><title>Mobiliário urbano - 3R Sustentável</title>
<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-WT6WL42M');</script></head><body>
<nav><ul>
<li><a data-mpi href="https://www.3rsustentavel.com.br/abrigo-onibus" title="Abrigo de onibus">Abrigo de onibus</a></li>
<li><a data-mpi href="https://www.3rsustentavel.com.br/deck-madeira-plastica" title="Deck de madeira plástica">Deck de madeira plástica</a></li>
<li><a data-mpi href="https://www.3rsustentavel.com.br/empresa" title="Empresa">Empresa</a></li>
</ul></nav>
<div class="barra_doutor"><form>
<input id="idProjeto" type="hidden" name="idProjeto" value="6452">
<input id="tipoProjeto" type="hidden" name="tipoProjeto" value="Busca One (BuscaMax 3.0)">
<input id="urlProjeto" type="hidden" name="urlProjeto" value="www.3rsustentavel.com.br">
<input id="emailProjeto" type="hidden" name="emailProjeto" value="comercial@3rsustentavel.com.br">
</form></div></body></html>`;
const CATEGORIAS_ONE = `<div class="col-3 col-md-6"><div class="card card--categorias card--page">
<a class="card__link" href="https://www.3rsustentavel.com.br/abrigo-onibus" title="">
<img width="300" height="300" class="card__cover" src="https://www.3rsustentavel.com.br/imagens/categorias/abrigo-onibus-01.webp" alt="" title="">
<h2 class="card__title">Abrigo de onibus</h2></a></div></div>
<div class="col-3 col-md-6"><div class="card card--categorias card--page">
<a class="card__link" href="https://www.3rsustentavel.com.br/abrigo-onibus-sao-paulo" title="">
<h2 class="card__title">Abrigo de onibus  em São Paulo</h2></a></div></div>
<div class="col-3 col-md-6"><div class="card card--categorias card--page">
<a class="card__link" href="https://www.3rsustentavel.com.br/deck-madeira-plastica" title="">
<h2 class="card__title">Deck de madeira plástica</h2></a></div></div>
<a class="card__link" href="https://www.3rsustentavel.com.br/produtos/bancos"><h2 class="card__title">Bancos</h2></a>`;

const HOST_HIB = 'www.jrplasticos.com.br';
const HOME_HIB = `<html><head><title>Móveis - JR PLASTICOS</title><script>'GTM-KMVTSPZM'</script></head><body>
<li class='dropdown' data-icon-menu>
<a href="https://www.jrplasticos.com.br/categorias" title="Categorias"><i class='fas fa-bars fa-xl'></i> </a>
<ul class="sub-menu-info">
<li ><a data-mpi href="https://www.jrplasticos.com.br/banquetas-de-plastico" title="banquetas de plástico">banquetas de plástico</a>
<ul class="sub-menu">
<li><a data-mpi href="https://www.jrplasticos.com.br/banqueta-de-plastico-pequena" title="banqueta de plástico pequena">banqueta de plástico pequena</a></li>
<li><a data-mpi href="https://www.jrplasticos.com.br/banqueta-de-plastico-baixa" title="banqueta de plástico baixa">banqueta de plástico baixa</a></li>
</ul></li>
<li ><a data-mpi href="https://www.jrplasticos.com.br/cadeiras-de-plastico" title="cadeiras de plástico">cadeiras de plástico</a>
<ul class="sub-menu">
<li><a data-mpi href="https://www.jrplasticos.com.br/cadeira-plastico-branca" title="cadeira plástico branca">cadeira plástico branca</a></li>
</ul></li>
</ul></li>
<li class="dropdown"><a href="https://www.jrplasticos.com.br/produtos" title="Produtos">Produtos</a>
<ul class="sub-menu"><li><a href="https://www.jrplasticos.com.br/produtos/poltrona-diamond" title="Poltrona">Poltrona Diamond</a></li></ul></li>
<div class="barra_doutor"><form>
<input id="idProjeto" type="hidden" name="idProjeto" value="4675">
<input id="tipoProjeto" type="hidden" name="tipoProjeto" value="Busca One Híbrido (BuscaMax 3.0)">
</form></div></body></html>`;
const CATEGORIAS_HIB = `<a class="card__link" href="https://www.jrplasticos.com.br/banquetas-de-plastico"><h2 class="card__title">banquetas de plástico</h2></a>
<a class="card__link" href="https://www.jrplasticos.com.br/cadeiras-de-plastico"><h2 class="card__title">cadeiras de plástico</h2></a>`;
const CAT_CADEIRAS = `<h1 class="bread__title">Cadeiras de Plástico</h1>
<a class="card__link" href="https://www.jrplasticos.com.br/cadeira-plastico-branca"><h2 class="card__title">cadeira plástico branca</h2></a>
<a class="card__link" href="https://www.jrplasticos.com.br/cadeira-de-bar-plastico"><h2 class="card__title">cadeira de bar plástico</h2></a>
<a class="card__link" href="https://www.jrplasticos.com.br/banquetas-de-plastico"><h2 class="card__title">banquetas de plástico</h2></a>`;
const SITEMAP_INDICE = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://www.jrplasticos.com.br/sitemap-1.xml</loc></sitemap><sitemap><loc>https://www.jrplasticos.com.br/sitemap-2.xml</loc></sitemap></sitemapindex>`;
const SITEMAP_1 = `<?xml version="1.0"?><urlset><url><loc>https://www.jrplasticos.com.br/empresa</loc></url>
<url><loc>https://www.jrplasticos.com.br/cadeiras-de-plastico</loc></url>
<url><loc>https://www.jrplasticos.com.br/cadeiras-de-plastico/cadeira-plastico-resistente/empresa-de-cadeira-plastico-resistente-contagem</loc></url>
<url><loc>https://www.jrplasticos.com.br/cadeiras-de-plastico/cadeira-plastico-resistente/empresa-de-cadeira-plastico-resistente-maua</loc></url>
<url><loc>https://www.jrplasticos.com.br/banquetas-de-plastico/banqueta-baixa-de-plastico/valor-de-banqueta-baixa-aquidauana</loc></url>
<url><loc>https://www.jrplasticos.com.br/produtos/caixa-a-23/caixa-a-23-azul</loc></url>
<url><loc>https://www.jrplasticos.com.br/sumida/palavra-x/palavra-x-cidade</loc></url></urlset>`;

(async () => {
  console.log('\n=== Entrada: as duas abas ===');
  const ent = R.lerEntrada([
    { aba: 'Busca', linhas: [R.COLUNAS_CONFIG, ['34.199.037/0001-02', 'L.C DA SILVA REMOCOES', '', '', '', '', 'Busca Cliente', '', 'd8d1', '', 'busca_cliente'], ['', '', '', '', '', '', 'Busca Cliente'], ['118.022.678-08', 'NANCY', '', '', '', '', 'Busca Cliente', '', 'd8d1', '', 'busca_cliente']] },
    { aba: 'MPI', linhas: [R.COLUNAS_CONFIG, ['', 'MOREIRA LOPES CONFECCAO LTDA', '', '', '', '', 'MPI Solutions', '2041343', 'd8d1', '', 'mpi_solutions']] },
    { aba: 'Resumo', linhas: [['x', 'y'], ['1', '2']] },
  ]);
  check('lê as duas abas e ignora a que não é Busca/MPI', ent.itens.length === 3 && ent.ignoradas.length === 1 && /Resumo/.test(ent.ignoradas[0]));
  check('linha vazia (só o fixo) fica de fora', !ent.itens.some((i) => !i.razao));
  check('CNPJ limpo e CPF aceito', ent.itens[0].cnpj === '34199037000102' && ent.itens[1].cnpj === '11802267808');
  check('nº do contrato com 8 dígitos para o Salesforce', ent.itens[2].numeroContrato === '02041343' && ent.itens[2].empresa === 'MPI' && ent.itens[2].original.numero_contrato === '2041343');
  check('empresa pela aba', R.empresaDaAba('Busca Cliente') === 'Busca' && R.empresaDaAba('BC') === 'Busca' && R.empresaDaAba('MPI Solutions') === 'MPI' && R.empresaDaAba('MPI+') === '' && R.empresaDaAba('Resumo') === '');
  check('cabeçalho fora de ordem ainda mapeia', (() => { const m = R.mapaDoCabecalho(['razao_social', 'cnpj', 'palavras', 'numero_contrato']); return m && m.cnpj === 1 && m.razao_social === 0 && m.palavras === 2; })());
  check('formata CNPJ e CPF', R.formatarCnpj('34199037000102') === '34.199.037/0001-02' && R.formatarCnpj('11802267808') === '118.022.678-08');
  check('valor mensal contábil R$2034,24', R.formatarValorMensal(2034.24) === 'R$2034,24' && R.formatarValorMensal('R$ 2.034,24') === 'R$2034,24' && R.formatarValorMensal(150) === 'R$150,00' && R.formatarValorMensal('') === '');

  console.log('\n=== O HTML do site One ===');
  const oc = R.camposOcultos(HOME_ONE);
  check('campos ocultos: idProjeto, tipoProjeto, urlProjeto', oc.idProjeto === '6452' && /One \(BuscaMax/.test(oc.tipoProjeto) && oc.urlProjeto === 'www.3rsustentavel.com.br');
  check('tipo pelo tipoProjeto', R.tipoDoTexto(oc.tipoProjeto) === 'one' && R.tipoDoTexto('Busca One Híbrido (BuscaMax 3.0)') === 'hibrido' && R.tipoDoTexto('Busca One Hibrido') === 'hibrido' && R.tipoDoTexto('MPI+') === 'mpi+' && R.tipoDoTexto('') === '');
  check('tags: só o GTM está no HTML', R.tagsDoHtml(HOME_ONE).gtm[0] === 'GTM-WT6WL42M' && R.tagsDoHtml(HOME_ONE).ga.length === 0);
  const mpi = R.linksDataMpi(HOME_ONE, HOST_ONE);
  check('links data-mpi da raiz, sem as páginas institucionais', mpi.length === 2 && mpi[0].slug === 'abrigo-onibus');
  const cards = R.cardsDoHtml(CATEGORIAS_ONE, HOST_ONE);
  check('cartões de /categorias: título do h2, espaço duplo limpo, /produtos/x fora', cards.length === 3 && cards[1].titulo === 'Abrigo de onibus em São Paulo' && !cards.some((c) => c.slug === 'bancos'));
  const achadoOne = R.juntarFontes({ menu: R.menuDoHtml(HOME_ONE, HOST_ONE), cardsCategorias: cards, dataMpi: mpi, sitemap: { pares: [], nivel1: [] } });
  check('One: só categorias, sem palavras', achadoOne.categorias.length === 3 && achadoOne.palavras.length === 0);
  check('One: palavras = as categorias, separadas por |', R.montarPalavras('one', achadoOne) === 'Abrigo de onibus|Abrigo de onibus em São Paulo|Deck de madeira plástica');
  check('decide o tipo pelo site antes da planilha', R.decidirTipo({ tipoProjeto: oc.tipoProjeto, tipoFluxo: 'Busca One Hibrido', achado: achadoOne }).tipo === 'one');

  console.log('\n=== O HTML do site híbrido ===');
  const menu = R.menuDoHtml(HOME_HIB, HOST_HIB);
  check('menu: categoria → palavras do sub-menu; o menu de Produtos fica fora', menu.categorias.length === 2 && menu.palavras.length === 3 && menu.palavras[0].categoria === 'banquetas-de-plastico' && !menu.categorias.some((c) => c.slug === 'produtos'));
  const sm = R.lerSitemap(SITEMAP_INDICE);
  check('sitemap índice → filhos', sm.indice && sm.filhos.length === 2 && sm.urls.length === 0);
  const urls = R.lerSitemap(SITEMAP_1).urls;
  const pares = R.paresDoSitemap(urls, HOST_HIB);
  check('sitemap: /categoria/palavra/cidade vira o par categoria+palavra, sem repetir', pares.pares.length === 3 && pares.pares.some((p) => p.slug === 'cadeira-plastico-resistente' && p.categoria === 'cadeiras-de-plastico') && pares.nivel1.includes('cadeiras-de-plastico') && !pares.nivel1.includes('empresa'));
  const achadoHib = R.juntarFontes({
    menu, cardsCategorias: R.cardsDoHtml(CATEGORIAS_HIB, HOST_HIB), cardsPorCategoria: { 'cadeiras-de-plastico': R.cardsDoHtml(CAT_CADEIRAS, HOST_HIB) },
    dataMpi: R.linksDataMpi(HOME_HIB, HOST_HIB), sitemap: pares,
  });
  const slugs = achadoHib.palavras.map((p) => p.slug);
  check('junta menu + cartões + sitemap sem repetir', achadoHib.categorias.length === 2 && slugs.length === 6 && slugs.includes('cadeira-de-bar-plastico') && slugs.includes('cadeira-plastico-resistente') && slugs.includes('banqueta-baixa-de-plastico'));
  check('cartão que é outra categoria não vira palavra; par de categoria desconhecida (sumida, produtos) fica fora', !slugs.includes('banquetas-de-plastico') && !slugs.includes('palavra-x') && !slugs.includes('caixa-a-23'));
  const soSitemap = achadoHib.palavras.filter((p) => p.tituloPeloSlug);
  check('quem só está no sitemap fica com o título pelo slug, marcado', soSitemap.length === 2 && soSitemap[0].titulo === 'cadeira plastico resistente');
  const comTitulos = R.juntarFontes({ menu, cardsCategorias: R.cardsDoHtml(CATEGORIAS_HIB, HOST_HIB), cardsPorCategoria: { 'cadeiras-de-plastico': R.cardsDoHtml(CAT_CADEIRAS, HOST_HIB) }, dataMpi: [], sitemap: pares, titulos: { 'cadeira-plastico-resistente': 'Cadeira Plástico Resistente' } });
  check('o título lido da página substitui o do slug', comTitulos.palavras.find((p) => p.slug === 'cadeira-plastico-resistente').titulo === 'Cadeira Plástico Resistente' && !comTitulos.palavras.find((p) => p.slug === 'cadeira-plastico-resistente').tituloPeloSlug);
  const pal = R.montarPalavras('hibrido', achadoHib);
  check('híbrido: categorias e depois as palavras, sem repetir', pal.startsWith('banquetas de plástico|cadeiras de plástico|banqueta de plástico pequena|') && pal.split('|').length === 8);
  check('tipo deduzido pela estrutura quando nada diz', R.decidirTipo({ achado: achadoHib }).tipo === 'hibrido' && R.decidirTipo({ achado: achadoOne }).tipo === 'one' && R.decidirTipo({ tipoFluxo: 'Busca One', achado: achadoHib }).tipo === 'one');
  // Template antigo (artesaodaslatas, 09/10/2026): sem /categorias, sem menu
  // data-mpi, e o índice do sitemap com <loc> relativo ("sitemap-1.xml"); as
  // categorias são as que o sitemap cita, com o título pelo slug até a página dizer.
  const idxRel = R.lerSitemap('<sitemapindex><sitemap><loc>sitemap-1.xml</loc></sitemap></sitemapindex>');
  check('índice com <loc> relativo devolve o filho como veio (quem resolve é quem baixa)', idxRel.indice && idxRel.filhos[0] === 'sitemap-1.xml' && new URL(idxRel.filhos[0], 'https://www.x.com.br/sitemap.xml').toString() === 'https://www.x.com.br/sitemap-1.xml');
  const antigo = R.juntarFontes({ menu: { categorias: [], palavras: [] }, cardsCategorias: [], cardsPorCategoria: {}, dataMpi: [], sitemap: R.paresDoSitemap(R.lerSitemap('<urlset><url><loc>https://www.artesaodaslatas.com.br/cristalizacao-automotiva/cristalizacao-carro/cristalizacao-carro-vila-medeiros</loc></url><url><loc>https://www.artesaodaslatas.com.br/cristalizacao-automotiva/cristalizacao-pintura-carro/cristalizacao-pintura-osasco</loc></url><url><loc>https://www.artesaodaslatas.com.br/farois/polimento-de-farol/polimento-de-farol-osasco</loc></url></urlset>').urls, 'www.artesaodaslatas.com.br') });
  const relativo = R.paresDoSitemap(['contato', 'cristalizacao-automotiva', 'cristalizacao-automotiva/cristalizacao-carro/cristalizacao-carro-vila-medeiros', '/farois/polimento-de-farol/polimento-de-farol-osasco'], 'artesaodaslatas.com.br');
  check('<loc> sem o domínio é completado com o host do site', relativo.pares.length === 2 && relativo.pares[0].categoria === 'cristalizacao-automotiva' && relativo.nivel1.includes('cristalizacao-automotiva') && !relativo.nivel1.includes('contato'));
  check('sem fonte de categorias, as do sitemap valem, marcadas como título pelo slug', antigo.categorias.length === 2 && antigo.categorias[0].slug === 'cristalizacao-automotiva' && antigo.categorias[0].tituloPeloSlug === true && antigo.palavras.length === 3);
  const antigoCom = R.juntarFontes({ menu: { categorias: [], palavras: [] }, dataMpi: [], sitemap: { pares: [{ categoria: 'farois', slug: 'polimento-de-farol' }], nivel1: [] }, titulos: { farois: 'Faróis', 'polimento-de-farol': 'Polimento de Farol' } });
  check('o título da página substitui o do slug também na categoria', antigoCom.categorias[0].titulo === 'Faróis' && !antigoCom.categorias[0].tituloPeloSlug && R.montarPalavras('hibrido', antigoCom) === 'Faróis|Polimento de Farol');
  check('com links data-mpi (site One), categoria só do sitemap continua fora', R.juntarFontes({ menu: { categorias: [], palavras: [] }, dataMpi: [{ slug: 'a', titulo: 'A' }], sitemap: { pares: [{ categoria: 'sumida', slug: 'x' }], nivel1: [] } }).categorias.length === 1);
  // "Plataforma" (ctaltovale, 13/10/2026): não é Busca One nem híbrido, mas
  // segue a regra do híbrido. O menu lista as categorias embaixo de "Serviços",
  // as palavras vivem em /prefixo/palavra (só no sitemap) e as páginas de
  // cidade em /prefixo/categoria/palavra/palavra-cidade dizem a categoria.
  const HOME_PLAT = `<nav id="menu"><ul><li><a href="https://www.ctaltovale.com.br/" title="Home">Home</a></li>
<li class="dropdown"><a href="https://www.ctaltovale.com.br/servicos" title="Serviços">Serviços</a>
<ul class="sub-menu"><li><a href="https://www.ctaltovale.com.br/casas-de-reabilitacao" title="Casas de reabilitação">Casas de reabilitação</a></li>
<li><a href="https://www.ctaltovale.com.br/clinicas-para-alcoolatras" title="Clínicas para alcoólatras">Clínicas para alcoólatras</a></li></ul></li></ul></nav>`;
  const menuPlat = R.menuDoHtml(HOME_PLAT, 'www.ctaltovale.com.br');
  check('menu com pai institucional (Serviços): os filhos são categorias, não palavras', menuPlat.categorias.length === 2 && menuPlat.palavras.length === 0 && menuPlat.categorias[0].titulo === 'Casas de reabilitação');
  const smPlat = R.paresDoSitemap([
    'https://www.ctaltovale.com.br/casas-de-reabilitacao', 'https://www.ctaltovale.com.br/clinica/casa-de-reabilitacao', 'https://www.ctaltovale.com.br/clinica/casa-sem-cidade',
    'https://www.ctaltovale.com.br/clinica/casas-de-reabilitacao/casa-de-reabilitacao/casa-de-reabilitacao-blumenau',
    'https://www.ctaltovale.com.br/clinica/casas-de-reabilitacao/casa-de-reabilitacao/casa-de-reabilitacao-itajai',
    'https://www.ctaltovale.com.br/clinica/clinicas-para-alcoolatras/clinica-para-alcoolatras-24h/clinica-para-alcoolatras-24h-rio-do-sul',
    'https://www.ctaltovale.com.br/produtos/x/y/z',
  ], 'www.ctaltovale.com.br');
  check('sitemap de 4 níveis: prefixo aprendido, par categoria/palavra, caminho /prefixo/palavra', smPlat.prefixo === 'clinica' && smPlat.pares.length === 3 && smPlat.pares.some((p) => p.categoria === 'casas-de-reabilitacao' && p.slug === 'casa-de-reabilitacao' && p.caminho === 'clinica/casa-de-reabilitacao') && smPlat.pares.some((p) => p.slug === 'casa-sem-cidade' && p.categoria === '' && p.caminho === 'clinica/casa-sem-cidade') && !smPlat.pares.some((p) => p.categoria === 'x'));
  const achadoPlat = R.juntarFontes({ menu: menuPlat, cardsCategorias: [], cardsPorCategoria: {}, dataMpi: [], sitemap: smPlat });
  const tipoPlat = R.decidirTipo({ tipoFluxo: 'Busca One', achado: achadoPlat });
  check('plataforma: tipo pela estrutura ganha da planilha de fluxo; palavras = categorias + palavras', tipoPlat.tipo === 'plataforma' && achadoPlat.categorias.length === 2 && achadoPlat.palavras.length === 3 && achadoPlat.palavras.find((p) => p.slug === 'casa-de-reabilitacao').caminho === 'clinica/casa-de-reabilitacao' && R.montarPalavras(tipoPlat.tipo, achadoPlat).split('|').length === 5);
  check('o campo oculto do site ainda ganha da estrutura', R.decidirTipo({ tipoProjeto: 'Busca One (BuscaMax 3.0)', achado: achadoPlat }).tipo === 'one');
  // Templates novos (13/10/2026): telassinop (cartões com link relativo e h2 em
  // /categorias; categorias no "Menu de categorias") e romastands (cartões em
  // /informacoes com o grupo em data-info-group).
  const tela = R.cardsGenericos('<a href="/alambrado" class="group"><div><img alt="x"></div><div><h2 class="font-display">alambrado</h2></div></a><a href="/arame-farpado" class="group"><h2>arame &amp; farpado</h2></a><a href="https://outro.com.br/x"><h2>fora</h2></a><a href="/empresa"><h2>Empresa</h2></a>', 'www.telassinop.com.br');
  const navCat = R.categoriasDoNav('<nav aria-label="Menu de categorias" class="x"><div><a href="/telas/tipos-de-tela" class="a">Tipos de Tela<svg></svg></a><ul><li><a href="/telas/tipos-de-tela#x">sub</a></li></ul></div><div><a href="/telas/gradil">Gradil<svg></svg></a></div></nav>', 'www.telassinop.com.br');
  check('template novo: cartões relativos com h2 (outro site e institucional fora) e o 1º nível do menu de categorias', tela.length === 2 && tela[1].titulo === 'arame & farpado' && navCat.length === 2 && navCat[0].titulo === 'Tipos de Tela' && navCat[1].slug === 'gradil');
  const info = R.cardsGenericos('<a class="information-card" href="comprar-escaninho" data-info-card data-info-group="Escaninhos e Mostruários"><span><h2>Comprar escaninho</h2></span></a><a class="information-card" href="gondola" data-info-group="Gôndolas e Capelas"><h2>Gôndola</h2></a>', 'romastands.com.br');
  const achadoInfo = R.juntarFontes({ menu: { categorias: [], palavras: [] }, dataMpi: [], sitemap: { pares: [], nivel1: [] }, genericos: { cartoes: info, categorias: [], fonte: '/informacoes' } });
  check('template novo: os grupos dos cartões viram categorias; tipo plataforma, regra do híbrido', achadoInfo.categorias.length === 2 && achadoInfo.palavras.length === 2 && R.decidirTipo({ tipoFluxo: 'Busca One', achado: achadoInfo }).tipo === 'plataforma' && R.montarPalavras('plataforma', achadoInfo) === 'Escaninhos e Mostruários|Gôndolas e Capelas|Comprar escaninho|Gôndola');
  check('genéricos só entram quando o resto não achou nada', R.juntarFontes({ menu: { categorias: [{ slug: 'a', titulo: 'A' }], palavras: [] }, dataMpi: [], sitemap: { pares: [], nivel1: [] }, genericos: { cartoes: info } }).categorias.length === 1);
  // Tema antigo numa subpasta (bbbfestas: /locacoes-de-barracas/): o host com
  // a subpasta manda em todos os leitores, e o Site do contrato pode trazê-la.
  check('host com subpasta: domínio e base separados; caminho do Site do contrato', JSON.stringify(R.partesDoHost('www.bbbfestas.com.br/locacoes-de-barracas/')) === '{"dominio":"bbbfestas.com.br","base":"locacoes-de-barracas"}' && R.caminhoDoSite('artfitacademia.com.br/aulas-de-tenis/') === 'aulas-de-tenis' && R.caminhoDoSite('https://www.x.com.br/') === '' && R.caminhoDoSite('x.com.br/index.php') === '');
  const subMenu = R.menuDoHtml('<a href="https://www.bbbfestas.com.br/locacoes-de-barracas/servicos">Serviços</a><ul class="sub-menu"><li><a href="https://www.bbbfestas.com.br/locacoes-de-barracas/barracas">Barracas</a></li></ul>', 'www.bbbfestas.com.br/locacoes-de-barracas');
  const subSm = R.paresDoSitemap(['https://www.bbbfestas.com.br/locacoes-de-barracas/barracas/barraca-de-pipoca/barraca-de-pipoca-osasco', 'barracas/barraca-de-crepe/barraca-de-crepe-sp'], 'www.bbbfestas.com.br/locacoes-de-barracas');
  check('leitores com subpasta: menu, sitemap absoluto e relativo', subMenu.categorias.length === 1 && subMenu.categorias[0].slug === 'barracas' && subSm.pares.length === 2 && subSm.pares.every((p) => p.categoria === 'barracas'));
  check('célula acima do limite do Excel é cortada e a aba Palavras recebe a lista', (() => { const pal = Array.from({ length: 3000 }, (_, i) => `palavra chave numero ${i}`); const achado = { categorias: [{ slug: 'c', titulo: 'Cat' }], palavras: pal.map((t, i) => ({ slug: 'p' + i, titulo: t, categoria: 'c' })) }; const r = { empresa: 'Busca', aba: 'Busca', linha: 2, razao: 'X', situacao: 'completo', pendencias: [], observacoes: [], dados: { tipo: 'plataforma', site: 'x.com.br', achado, palavras: R.montarPalavras('plataforma', achado) } }; const abas = R.montarAbasXlsx([r]); const cel = abas[0].linhas[0][R.COLUNAS.indexOf('palavras')]; return cel.length <= R.LIMITE_CELULA + 60 && /aba Palavras\)$/.test(cel) && abas[4].aba === 'Palavras' && abas[4].linhas.length === 3001 && abas[4].linhas[0][5] === 'categoria'; })());
  check('título da página pelo breadcrumb, senão pelo <title> sem a empresa', R.tituloDaPagina(CAT_CADEIRAS) === 'Cadeiras de Plástico' && R.tituloDaPagina('<title>Comodato de Impressora - 3R informática</title>') === 'Comodato de Impressora');
  check('host com ou sem www e http', R.cardsDoHtml('<a href="http://jrplasticos.com.br/x-y"><h2 class="card__title">X</h2></a>', HOST_HIB).length === 1);

  console.log('\n=== Saída e pendências ===');
  const item = ent.itens[0];
  const dados = {
    contaId: '001', contaNome: 'L.C DA SILVA REMOCOES', nomeFantasia: 'LC Remoções', contato: { nome: 'Sergio AparecidoDeSouza', email: 'esergio@x.com.br', telefone: '551142492430' },
    numeroContrato: '02007819', site: '3rsustentavel.com.br', idProjeto: '6452', ga: { accountId: '389582297', propertyId: 'properties/536412612', conexao: 'bcrelatorios2@gmail.com' },
    gsc: { siteUrl: 'https://www.3rsustentavel.com.br', conexao: 'bcrelatoriotags@gmail.com' }, pacote: '150', valor: 2034.24, palavras: 'a|b', tipo: 'one',
  };
  const linha = R.linhaSaida(item, { ...dados, statusContrato: 'Activated' });
  check('as 19 colunas do Relatório + Situação do Contrato e Modelo depois da razão social', linha.length === 21 && R.COLUNAS.slice(0, 5).join(',') === 'cnpj,razao_social,Situação do Contrato,Modelo,nome_fantasia' && R.COLUNAS.filter((c) => R.COLUNAS_CONFIG.includes(c)).join() === R.COLUNAS_CONFIG.join() && linha[0] === '34.199.037/0001-02' && C(linha, 'bu_nome') === 'Busca Cliente' && C(linha, 'contract_type') === 'busca_cliente');
  check('situação do contrato e modelo', C(linha, 'Situação do Contrato') === 'Ativo' && C(linha, 'Modelo') === 'Busca One' && R.situacaoDoContrato('Desativado') === 'Desativado' && R.situacaoDoContrato('Draft') === 'Rascunho' && C(R.linhaSaida(item, { ...dados, tipo: 'hibrido' }), 'Modelo') === 'Busca One Híbrido' && C(R.linhaSaida(item, { ...dados, tipo: '' }), 'Modelo') === '');
  check('primeiro nome do contato, contrato, ID, GA, GSC, pacote, valor, palavras', C(linha, 'nome_responsavel') === 'Sergio' && C(linha, 'email_responsavel') === 'esergio@x.com.br' && C(linha, 'numero_contrato') === '02007819' && C(linha, 'external_id') === '6452' && C(linha, 'ga_account_key') === '389582297' && C(linha, 'ga_property_id') === 'properties/536412612' && C(linha, 'ga_oauth_connection_name') === 'bcrelatorios2@gmail.com' && C(linha, 'gsc_oauth_connection_name') === 'bcrelatoriotags@gmail.com' && C(linha, 'gsc_site_url') === 'https://www.3rsustentavel.com.br' && C(linha, 'pacote_palavras') === '150' && C(linha, 'valor_mensal') === 'R$2034,24' && C(linha, 'palavras') === 'a|b');
  check('o nº do contrato da planilha MPI fica como veio (7 dígitos)', C(R.linhaSaida(ent.itens[2], { ...dados, numeroContrato: '02041343' }), 'numero_contrato') === '2041343');
  check('contrato desativado: sem pendência, situação própria; MPI+ sem ID e palavras não é pendência', R.pendenciasDaLinha(item, { ...dados, statusContrato: 'Desativado', ga: {}, palavras: '' }).length === 0 && R.situacao(item, { ...dados, statusContrato: 'Desativado' }) === 'desativado' && R.pendenciasDaLinha(item, { ...dados, tipo: 'mpi+', idProjeto: '', palavras: '' }).length === 0 && R.pendenciasDaLinha(item, { ...dados, tipo: 'one', idProjeto: '' }).includes('id'));
  check('completo sem pendências', R.pendenciasDaLinha(item, dados).length === 0 && R.situacao(item, dados) === 'completo');
  check('sem conta = erro; faltando GA e palavras = parcial', R.situacao(item, { ...dados, contaId: '' }) === 'erro' && R.situacao(item, { ...dados, ga: {}, palavras: '' }) === 'parcial' && R.pendenciasDaLinha(item, { ...dados, ga: { propertyId: 'properties/1' } }).includes('gaConexao'));
  const abas = R.montarAbasXlsx([
    { empresa: 'Busca', aba: 'Busca', linha: 2, razao: 'A', situacao: 'completo', pendencias: [], observacoes: [], dados, saida: linha },
    { empresa: 'MPI', aba: 'MPI', linha: 2, razao: 'B', situacao: 'parcial', pendencias: ['ga'], observacoes: ['x'], dados: { ...dados, ga: {} } },
  ]);
  check('abas Busca, MPI, Diagnóstico e Pendências', abas.map((a) => a.aba).join(',') === 'Busca,MPI,Diagnóstico,Pendências,Palavras,GA4 duplicados' && abas[0].linhas.length === 1 && abas[1].linhas.length === 1 && abas[2].linhas.length === 2 && abas[3].linhas.length === 1 && abas[3].linhas[0][4] === 'sem propriedade do GA4');
  const dup = [{ account: 'BC 1', accountId: '1', property: 'properties/10', displayName: 'x.com.br', measurementIds: ['G-AAAAAAA'], uris: ['https://x.com.br'], porque: 'data stream e nome' }, { account: 'Busca Cliente 01', accountId: '2', property: 'properties/20', displayName: 'x.com.br', measurementIds: ['G-BBBBBBB'], uris: ['https://www.x.com.br'], porque: 'data stream', viaLogin: 'bcrelatorios2@gmail.com' }];
  const abas2 = R.montarAbasXlsx([
    { empresa: 'Busca', aba: 'Busca', linha: 2, razao: 'A', situacao: 'completo', pendencias: [], observacoes: [], dados: { ...dados, tipo: 'hibrido', tags: { ga: ['G-BBBBBBB'], gtm: [] }, ga: { ...dados.ga, propertyId: 'properties/20', duplicadas: dup } } },
    { empresa: 'Busca', aba: 'Busca', linha: 3, razao: 'D', situacao: 'desativado', pendencias: [], observacoes: [], dados: { ...dados, statusContrato: 'Desativado' } },
    { empresa: 'Busca', aba: 'Busca', linha: 4, razao: 'S', situacao: 'parcial', pendencias: ['tipo'], observacoes: [], dados: { ...dados, tipo: '' } },
  ]);
  const iMod = R.COLUNAS.indexOf('Modelo');
  check('cores: Modelo pela cor do modelo, linha do desativado inteira em vermelho; desativado fora das Pendências', JSON.stringify(abas2[0].cores) === JSON.stringify([{ linha: 0, coluna: iMod, fundo: '33B833', texto: 'FFFFFF' }, { linha: 1, coluna: null, fundo: 'C00000', texto: 'FFFFFF' }]) && abas2[3].linhas.length === 1 && abas2[3].linhas[0][2] === 'S');
  check('aba GA4 duplicados: uma linha por propriedade, marcando a da planilha e a da tag do site', abas2[5].linhas.length === 2 && abas2[5].linhas[1][4] === 2 && abas2[5].linhas[1][13] === 'sim' && abas2[5].linhas[1][14] === 'sim' && abas2[5].linhas[0][13] === 'não' && abas2[5].linhas[1][12] === 'bcrelatorios2@gmail.com');
  check('resumo e linha de texto', /1 completa\(s\), 1 parcial\(is\), 0 sem conta, 1 com contrato desativado/.test(R.textoResumo([{ situacao: 'completo' }, { situacao: 'parcial' }, { situacao: 'desativado' }])) && /completo \(2 palavras\)/.test(R.textoLinha({ razao: 'A', situacao: 'completo', dados })));

  console.log('\n=== A rodada de uma linha, com fontes falsas ===');
  const chamadas = [];
  const deps = {
    salesforce: async (p) => { chamadas.push('salesforce'); return { ok: true, achou: true, conta: { Id: '001', Name: 'JR PLASTICOS LTDA', nomeFantasia: 'JR', website: '' }, comoAchou: 'CNPJ', contato: { nome: 'Ana Silva', email: 'ana@jr.com', telefone: '11' }, contratos: [{ numero: '02000001', status: 'Ativo', site: 'jrplasticos.com.br' }], escolhido: { numero: '02000001', site: 'https://www.jrplasticos.com.br/', pacote: '150', valor: 2034.24, projeto: 'Busca Cliente', status: 'Activated' }, comoEscolheu: 'único ativo', log: [{ message: 'sf ok', type: 'info' }] }; },
    site: async (p) => { chamadas.push('site:' + p.dominio); return { ok: true, host: HOST_HIB, ehBuscaOne: true, ocultos: R.camposOcultos(HOME_HIB), tags: R.tagsDoHtml(HOME_HIB), achado: achadoHib, fontes: ['menu', '/categorias', 'sitemap'], categoriasForaDoSite: ['sumida'] }; },
    geralPhp: async () => { chamadas.push('geralPhp'); return { ok: true, idProjetoBusca: '9999' }; },
    painelId: async () => { chamadas.push('painelId'); return { ok: true, cliente: '8888' }; },
    google: async (p) => { chamadas.push('google:' + (p.gtm || []).join(',')); return { ok: true, ga: { accountId: '1', propertyId: 'properties/2', conexao: 'bcrelatorios@gmail.com', como: 'acesso', measurementId: 'G-ABC12345' }, gsc: { siteUrl: 'https://www.jrplasticos.com.br', conexao: 'bcrelatoriotags@gmail.com', como: 'listado' } }; },
    tipoFluxo: async () => ({ tipo: 'Busca One' }),
  };
  const logs = [];
  const r = await Rodada.preencherItem(ent.itens[0], deps, (m, t) => logs.push(`${t}:${m}`));
  check('ordem: Salesforce, site, Google; ID do site dispensa geral.php e painel', chamadas.join(' ') === 'salesforce site:jrplasticos.com.br google:GTM-KMVTSPZM');
  check('o site diz híbrido e ganha da planilha de fluxo', r.dados.tipo === 'hibrido' && /site diz/.test(r.dados.tipoOrigem));
  check('ID do campo oculto, G- vindo do Google entra nas tags', r.dados.idProjeto === '4675' && /campo oculto/.test(r.dados.idOrigem) && r.dados.tags.ga.includes('G-ABC12345'));
  check('linha completa, com as palavras do híbrido', r.situacao === 'completo' && C(r.saida, 'palavras').split('|').length === 8 && C(r.saida, 'valor_mensal') === 'R$2034,24' && C(r.saida, 'nome_responsavel') === 'Ana' && C(r.saida, 'Situação do Contrato') === 'Ativo' && C(r.saida, 'Modelo') === 'Busca One Híbrido');
  check('observa a categoria fora de /categorias e as palavras só do sitemap', r.observacoes.some((o) => /sumida/.test(o)) && r.observacoes.some((o) => /2 palavra\(s\) só no sitemap/.test(o)));
  check('o log das fontes passa adiante', logs.includes('info:sf ok'));

  chamadas.length = 0;
  const semId = { ...deps, site: async (p) => ({ ok: true, host: HOST_HIB, ehBuscaOne: true, ocultos: { idProjeto: '', tipoProjeto: '' }, tags: { ga: [], gtm: [] }, achado: achadoHib, fontes: [] }) };
  const r2 = await Rodada.preencherItem(ent.itens[0], semId, () => {});
  check('sem ID no site: geral.php responde e o painel não é chamado', r2.dados.idProjeto === '9999' && /geral\.php/.test(r2.dados.idOrigem) && chamadas.includes('geralPhp') && !chamadas.includes('painelId'));
  check('sem tipo no site: vale a planilha de fluxo', r2.dados.tipo === 'one' && /fluxo/.test(r2.dados.tipoOrigem));
  const r3 = await Rodada.preencherItem(ent.itens[0], { ...semId, geralPhp: async () => ({ ok: true, idProjetoBusca: '39' }) }, () => {});
  check('39 (fixo da MPI Solutions) não é ID de cliente: cai para o painel', r3.dados.idProjeto === '8888' && /painel/.test(r3.dados.idOrigem));

  // O Site do contrato é o domínio raiz, mas o Busca One mora no subdomínio
  // citado nas tarefas: o Hub tenta o raiz, vê que não tem cara de Busca One
  // e passa ao subdomínio.
  chamadas.length = 0;
  const escada = {
    ...deps,
    salesforce: async () => ({ ok: true, achou: true, conta: { Id: '001', Name: '3R INFORMATICA LTDA', nomeFantasia: '', website: 'https://www.3rinformatica.com.br' }, comoAchou: 'CNPJ', contato: null, contratos: [], escolhido: { numero: '02009908', site: '3rinformatica.com.br', pacote: '7000', valor: 847.91 }, comoEscolheu: 'único ativo', dominiosCitados: ['informatica.3rinformatica.com.br', 'outrocliente.com.br'], log: [] }),
    site: async (p) => { chamadas.push('site:' + p.dominio); return p.dominio === 'informatica.3rinformatica.com.br' ? { ok: true, ehBuscaOne: true, ocultos: {}, tags: { ga: [], gtm: ['GTM-5KW2PF5L'] }, achado: achadoHib, fontes: ['menu'] } : { ok: true, ehBuscaOne: false, ocultos: {}, tags: { ga: [], gtm: [] }, achado: { categorias: [], palavras: [] }, fontes: [] }; },
    geralPhp: async () => ({ ok: true, idProjetoBusca: '' }),
    painelId: async () => ({ ok: true, cliente: '7777' }),
    tipoFluxo: async () => ({ tipo: '' }),
  };
  const r6 = await Rodada.preencherItem(ent.itens[0], escada, () => {});
  check('escada de domínios: raiz sem cara de Busca One → subdomínio citado nas tarefas; outro cliente fica fora', chamadas.filter((c) => c.startsWith('site:')).join(' ') === 'site:3rinformatica.com.br site:informatica.3rinformatica.com.br' && r6.dados.site === 'informatica.3rinformatica.com.br' && r6.observacoes.some((o) => /achado em informatica\.3rinformatica/.test(o)));
  check('o Google e o ID são procurados para o site Busca One achado', r6.dados.idProjeto === '7777' && r6.dados.tags.gtm[0] === 'GTM-5KW2PF5L' && r6.dados.tipo === 'hibrido');

  const r4 = await Rodada.preencherItem(ent.itens[1], { ...deps, salesforce: async () => ({ ok: true, achou: false, motivo: 'nenhuma conta com esse CNPJ', log: [] }) }, () => {});
  check('conta não achada: situação erro, nada mais é chamado, a linha sai com os fixos', r4.situacao === 'erro' && /CNPJ/.test(r4.erro) && C(r4.saida, 'bu_nome') === 'Busca Cliente' && C(r4.saida, 'palavras') === '' && C(r4.saida, 'Situação do Contrato') === '');
  const r5 = await Rodada.preencherItem(ent.itens[0], { ...deps, site: async () => { throw new Error('tempo esgotado'); } }, () => {});
  check('fonte que lança não derruba a linha: vira observação e pendência', r5.situacao === 'parcial' && r5.observacoes.some((o) => /tempo esgotado/.test(o)) && r5.pendencias.includes('palavras'));

  console.log('\n=== Regras de 16/10/2026: contrato desativado, MPI+, ID do formulário, subpasta, cores ===');
  chamadas.length = 0;
  const desativado = { ...deps, salesforce: async (p) => { chamadas.push('salesforce'); const base = await deps.salesforce(p); chamadas.pop(); return { ...base, contratos: [{ numero: '02000001', status: 'Desativado' }, { numero: '02000009', status: 'Activated', projeto: 'MPI Solutions' }], escolhido: { ...base.escolhido, status: 'Desativado' } }; } };
  const r7 = await Rodada.preencherItem(ent.itens[0], desativado, () => {});
  check('contrato desativado: só o Salesforce, a linha diz Desativado e a situação é desativado', chamadas.join(' ') === 'salesforce' && r7.situacao === 'desativado' && r7.pendencias.length === 0 && C(r7.saida, 'Situação do Contrato') === 'Desativado' && C(r7.saida, 'nome_fantasia') === 'JR' && r7.observacoes.some((o) => /desativado.*outro contrato ativo: 02000009/.test(o)));
  chamadas.length = 0;
  const mpiPlus = { ...deps, tipoFluxo: async () => ({ tipo: 'MPI+' }), site: async (p) => { chamadas.push('site:' + p.dominio); return { ok: true, host: 'x.com.br', ehBuscaOne: false, ocultos: { idProjeto: '', tipoProjeto: '', projeto: '' }, tags: { ga: ['G-ABC12345'], gtm: [] }, achado: null, fontes: [] }; } };
  const r8 = await Rodada.preencherItem(ent.itens[0], mpiPlus, () => {});
  check('MPI+: sem geral.php nem painel, sem ID e sem palavras, e isso não é pendência', r8.dados.tipo === 'mpi+' && !chamadas.includes('geralPhp') && !chamadas.includes('painelId') && C(r8.saida, 'external_id') === '' && C(r8.saida, 'Modelo') === 'MPI+' && !r8.pendencias.includes('id') && !r8.pendencias.includes('palavras'));
  const kaizen = '<input type="hidden" name="site" value="https://familiakaizen.com.br/">\n<input type="hidden" name="projeto" value="6318">';
  const cabflix = '<input type="hidden" name="projeto" value="5451">\n<input type="hidden" name="projeto" id="idProjeto" value="">';
  check('ID do formulário do site (name="projeto"); o 2º vazio não apaga o 1º', R.camposOcultos(kaizen).projeto === '6318' && R.camposOcultos(cabflix).projeto === '5451' && R.camposOcultos(HOME_ONE).projeto === '');
  chamadas.length = 0;
  const peloForm = { ...deps, site: async (p) => ({ ok: true, host: HOST_HIB, ehBuscaOne: true, ocultos: R.camposOcultos(kaizen), tags: { ga: [], gtm: [] }, achado: achadoHib, fontes: [] }), geralPhp: async () => { chamadas.push('geralPhp'); return { ok: true }; }, painelId: async () => ({ ok: true }) };
  const r9 = await Rodada.preencherItem(ent.itens[0], peloForm, () => {});
  check('o ID do formulário fica por último: o geral.php vem antes e, sem ID nele, vale o do formulário', r9.dados.idProjeto === '6318' && /formulário/.test(r9.dados.idOrigem) && r9.dados.idDoSite === '6318' && chamadas.includes('geralPhp'));
  const r10 = await Rodada.preencherItem(ent.itens[0], { ...peloForm, geralPhp: async () => ({ ok: true, idProjetoBusca: '4084' }) }, () => {});
  check('formulário copiado de outro cliente não ganha do geral.php: fica o 4084 e a observação', r10.dados.idProjeto === '4084' && /geral\.php/.test(r10.dados.idOrigem) && r10.observacoes.some((o) => /formulário do site diz projeto 6318/.test(o)));
  const menuCab = R.menuDoHtml('<li class="dropdown"><a href="https://cabflix.com.br/teleinformatica/servicos" title="Serviços">Serviços</a> <ul class="sub-menu "><li><a href="https://cabflix.com.br/teleinformatica/sistemas-cftv">Sistemas cftv</a></li></ul>', 'cabflix.com.br/teleinformatica');
  const achadoCab = R.juntarFontes({ menu: menuCab, dataMpi: [], sitemap: { pares: [{ categoria: 'sistemas-cftv', slug: 'sistema-cftv' }], nivel1: [] } });
  check('categorias só embaixo de Serviços no menu, sem o site nem a planilha de fluxo dizerem: Plataforma', menuCab.institucional === true && achadoCab.menuInstitucional === true && R.decidirTipo({ achado: achadoCab }).tipo === 'plataforma' && R.decidirTipo({ tipoFluxo: 'Busca One Hibrido', achado: achadoCab }).tipo === 'hibrido' && R.menuDoHtml(HOME_HIB, HOST_HIB).institucional === false);
  check('subpasta já extraída não some (cabflix.com.br/teleinformatica)', R.caminhoDoSite('teleinformatica') === 'teleinformatica' && R.caminhoDoSite('/aulas-de-tenis/') === 'aulas-de-tenis' && R.caminhoDoSite('https://www.cabflix.com.br/teleinformatica/') === 'teleinformatica' && R.caminhoDoSite('') === '');

  // Links de dois níveis e de outro host do mesmo domínio (16/10/2026).
  check('registrável e caminho interno', R.registravel('moveiscorporativos.interioresmoveis.com.br') === 'interioresmoveis.com.br' && R.registravel('medicina.semework.com.br') === 'semework.com.br' && R.registravel('www.x.com') === 'x.com'
    && R.caminhoInterno('https://www.bbbfestas.com.br/contato', 'www.bbbfestas.com.br/locacoes-de-barracas') === null && R.caminhoInterno('barracas', 'www.bbbfestas.com.br/locacoes-de-barracas').caminho === 'barracas'
    && R.caminhoInterno('https://outro.com/x', 'x.com.br') === null && R.caminhoInterno('/servicos/calibracao', 'www.horahhospitalar.com.br').segmentos.length === 2
    && R.caminhoInterno('https://moveiscorporativos.interioresmoveis.com.br/mobiliario/assentos', 'www.interioresmoveis.com.br').urlAbs === 'https://moveiscorporativos.interioresmoveis.com.br/mobiliario/assentos');
  const menuHorah = R.menuDoHtml('<li class="dropdown"> <!-- Nível --> <a href="https://www.horahhospitalar.com.br/servicos" title="Serviços">Serviços</a> <!-- end --> <ul class="sub-menu"> <li><a class="submenu-item" href="https://www.horahhospitalar.com.br/servicos/calibracao" title="Calibração">Calibração</a></li><li><a href="https://www.horahhospitalar.com.br/servicos/manutencao-corretiva">Manutenção corretiva</a></li></ul></li>', 'www.horahhospitalar.com.br');
  check('menu com comentário entre o pai e a lista e filhos de dois níveis: categorias com caminho', menuHorah.categorias.length === 2 && menuHorah.categorias[0].caminho === 'servicos/calibracao' && menuHorah.institucional === true);
  const menuMc = R.menuDoHtml('<a class="nav-link" title="Serviços" href=\'https://moveiscorporativos.interioresmoveis.com.br/mobiliario/servicos\'> Serviços </a> <span id="sub-menu_ico"></span> <div class="dark-mobile"> <ul class="sub-menu"> <li><a href="https://moveiscorporativos.interioresmoveis.com.br/mobiliario/cadeiras-corporativas">Cadeiras corporativas</a></li></ul></div>', 'moveiscorporativos.interioresmoveis.com.br/mobiliario');
  check('menu com span e div entre o pai e a lista, host com subpasta', menuMc.categorias.length === 1 && menuMc.categorias[0].slug === 'cadeiras-corporativas');
  const cardsOutroHost = R.cardsDoHtml('<div class="card"><a class="card__link" href="https://moveiscorporativos.interioresmoveis.com.br/mobiliario/cadeiras-com-pranchetas" title="x"><h2 class="card__title"> cadeiras com pranchetas </h2></a></div><a href="/produtos/bancos"><h2 class="card__title">Bancos</h2></a>', 'www.interioresmoveis.com.br');
  check('cartões para outro host do mesmo domínio (com urlAbs); /produtos/x fica fora', cardsOutroHost.length === 1 && cardsOutroHost[0].urlAbs.endsWith('/mobiliario/cadeiras-com-pranchetas') && cardsOutroHost[0].caminho === 'mobiliario/cadeiras-com-pranchetas');
  const palCat = R.palavrasDaCategoria('<div class="category__container__keywords"> <a href="https://www.horahhospitalar.com.br/hospitalar/calibracao-hospitalar" title="calibração hospitalar" class="category__keyword" >calibração hospitalar</a> <a href="https://www.horahhospitalar.com.br/hospitalar/calibracao-de-autoclave" class="category__keyword">calibração de autoclave</a></div>', 'www.horahhospitalar.com.br');
  const comTitulo = R.linksComTitulo('<div class="card"><a href="https://moveiscorporativos.interioresmoveis.com.br/mobiliario/cadeira-corporativa-bh" title="Cadeira Corporativa BH "><figure></figure></a><a href="https://moveiscorporativos.interioresmoveis.com.br/mobiliario/cadeira-corporativa-bh" class="btn" title="Cadeira Corporativa BH ">Ver Mais</a></div><a href="https://moveiscorporativos.interioresmoveis.com.br/mobiliario/contato" title="Contato">Contato</a><a href="https://moveiscorporativos.interioresmoveis.com.br/mobiliario/blog/post-x" title="Post">Post</a>', 'moveiscorporativos.interioresmoveis.com.br/mobiliario');
  check('links com title (cartões Bootstrap): um por slug, institucional e blog fora', comTitulo.length === 1 && comTitulo[0].titulo === 'Cadeira Corporativa BH' && comTitulo[0].caminho === 'cadeira-corporativa-bh');
  check('formulário do BuscaZap sem tipoProjeto = Plataforma; com tipoProjeto, vale o site', R.decidirTipo({ tipoFluxo: 'Busca One Hibrido', achado: achadoHib, buscaZap: true }).tipo === 'plataforma' && R.decidirTipo({ tipoProjeto: 'Busca One Híbrido (BuscaMax 3.0)', achado: achadoHib, buscaZap: true }).tipo === 'hibrido' && R.decidirTipo({ tipoFluxo: 'Busca One', achado: { categorias: [], palavras: [] }, buscaZap: true }).tipo === 'one');
  check('palavras de página de categoria dos temas antigos (category__keyword)', palCat.length === 2 && palCat[0].slug === 'calibracao-hospitalar' && palCat[0].caminho === 'hospitalar/calibracao-hospitalar');
  const irv = '<input type="hidden" name="urlProject" value="https://www.irvnatal.com.br/"><input type="hidden" name="idProject" value="6461"><nav><a class="font-display" href="/">Início</a><a class="font-display" href="/conheca-o-irv-natal">Conheça o IRV</a><div><a class="font-display" href="/lista-de-exames-de-imagem">Exames de Imagem</a><a class="pl-4 font-body" href="/exame-cistocentese">Cistocentese</a><a class="pl-4 font-body" href="/exame-raio-x">Raio-X</a></div><a class="font-display" href="/blog">Blog</a></nav>';
  const ocIrv = R.camposOcultos(irv); const menuIrv = R.menuIndentado(irv, 'www.irvnatal.com.br');
  const achadoIrv = R.juntarFontes({ menu: { categorias: [], palavras: [] }, menuNovo: menuIrv, dataMpi: [], sitemap: { pares: [], nivel1: [] }, templateNovo: ocIrv.templateNovo });
  check('template novo: idProject vira o ID, menu recuado dá categoria + palavras, tipo plataforma (regra do híbrido)', ocIrv.idProjeto === '6461' && ocIrv.templateNovo && menuIrv.categorias.length === 1 && menuIrv.palavras.length === 2 && menuIrv.palavras[1].categoria === 'lista-de-exames-de-imagem'
    && R.decidirTipo({ tipoFluxo: 'Busca One', achado: achadoIrv }).tipo === 'plataforma' && R.montarPalavras('plataforma', achadoIrv) === 'Exames de Imagem|Cistocentese|Raio-X');

  // 2ª passada pelo Search Console: a raiz não tem cara, o GSC aponta a pasta.
  chamadas.length = 0;
  const lidos = [];
  const pelaGsc = {
    ...deps,
    site: async (p) => { lidos.push(`${p.dominio}/${p.caminho || ''}`); if (p.caminho === 'coberturas-para-eventos') return { ok: true, host: 'www.cobeve.com.br/coberturas-para-eventos', ehBuscaOne: true, subpasta: 'coberturas-para-eventos', ocultos: { idProjeto: '', tipoProjeto: '', projeto: '1647' }, tags: { ga: [], gtm: ['GTM-WFVNJ2C'] }, achado: achadoHib, fontes: ['menu'] }; return { ok: true, host: 'cobeve.com.br', ehBuscaOne: false, ocultos: {}, tags: { ga: [], gtm: [] }, achado: null, fontes: [] }; },
    google: async (p) => { chamadas.push('google:' + p.dominio + ':' + (p.gtm || []).join(',')); return { ok: true, ga: { accountId: '1', propertyId: 'properties/2', conexao: 'bcrelatorios@gmail.com', como: 'x' }, gsc: { siteUrl: 'https://www.cobeve.com.br/coberturas-para-eventos', conexao: 'bcrelatorios2@gmail.com', como: 'listado' } }; },
    geralPhp: async () => ({ ok: true }), painelId: async () => ({ ok: true }), tipoFluxo: async () => ({ tipo: '' }),
  };
  const r11 = await Rodada.preencherItem({ ...ent.itens[0], dominio: 'cobeve.com.br' }, pelaGsc, () => {});
  check('Search Console aponta a pasta: 2ª leitura do site lá, Google refeito com as tags do tema, ID do formulário, tema antigo = Plataforma', lidos[0] === 'cobeve.com.br/' && lidos[lidos.length - 1] === 'cobeve.com.br/coberturas-para-eventos' && chamadas.filter((c) => c.startsWith('google')).length === 2 && chamadas[chamadas.length - 1] === 'google:cobeve.com.br:GTM-WFVNJ2C' && r11.dados.idProjeto === '1647' && r11.dados.tipo === 'plataforma' && r11.observacoes.some((o) => /Search Console/.test(o)) && !r11.observacoes.some((o) => /não tem cara/.test(o)) && C(r11.saida, 'palavras').split('|').length === 8);
  const placeholder = await Rodada.preencherItem(ent.itens[0], { ...deps, site: async () => ({ ok: true, host: 'x', ehBuscaOne: false, ocultos: {}, tags: { ga: [], gtm: [] }, achado: null, fontes: [], placeholder: 'Something amazing will be constructed here' }), google: async () => ({ ok: true, ga: {}, gsc: {} }) }, () => {});
  check('página padrão da hospedagem vira observação', placeholder.observacoes.some((o) => /ainda não publicado/.test(o)));

  // As cores no .xlsx (lib/xlsx-cores.js): o SheetJS lê de volta o fundo pedido.
  const XLSX = require('xlsx');
  const Cores = require(path.join(__dirname, '..', 'lib', 'xlsx-cores'));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 'b', 'c'], ['x', '', 'y'], ['z', null, 'w']]), 'Busca');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['h'], ['1']]), 'MPI');
  const pintado = Cores.aplicarCores(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), [{ colunas: 3, cores: [{ linha: 0, coluna: null, fundo: 'C00000', texto: 'FFFFFF' }, { linha: 1, coluna: 1, fundo: '006400', texto: 'FFFFFF' }] }, { colunas: 1, cores: [] }]);
  const relido = XLSX.read(pintado, { type: 'buffer', cellStyles: true });
  const fundo = (ref) => { const c = relido.Sheets.Busca[ref]; return c && c.s && c.s.fgColor && c.s.fgColor.rgb; };
  check('xlsx-cores: linha inteira e célula vazia pintadas, conteúdo e abas intactos', fundo('A2') === 'C00000' && fundo('C2') === 'C00000' && fundo('B3') === '006400' && !fundo('A3') && !fundo('A1') && relido.SheetNames.join() === 'Busca,MPI' && XLSX.utils.sheet_to_json(relido.Sheets.Busca, { header: 1, defval: '' })[2].join('|') === 'z||w');
  check('xlsx-cores: sem cores, o arquivo volta igual', Cores.aplicarCores(Buffer.from('x'), [{ colunas: 1, cores: [] }]).toString() === 'x' && Cores.crc32(Buffer.from('123456789')) === 0xcbf43926);

  console.log(falhas ? `\n${falhas} verificação(ões) FALHOU(ARAM)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
