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
    { aba: 'Busca', linhas: [R.COLUNAS, ['34.199.037/0001-02', 'L.C DA SILVA REMOCOES', '', '', '', '', 'Busca Cliente', '', 'd8d1', '', 'busca_cliente'], ['', '', '', '', '', '', 'Busca Cliente'], ['118.022.678-08', 'NANCY', '', '', '', '', 'Busca Cliente', '', 'd8d1', '', 'busca_cliente']] },
    { aba: 'MPI', linhas: [R.COLUNAS, ['', 'MOREIRA LOPES CONFECCAO LTDA', '', '', '', '', 'MPI Solutions', '2041343', 'd8d1', '', 'mpi_solutions']] },
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
  check('título da página pelo breadcrumb, senão pelo <title> sem a empresa', R.tituloDaPagina(CAT_CADEIRAS) === 'Cadeiras de Plástico' && R.tituloDaPagina('<title>Comodato de Impressora - 3R informática</title>') === 'Comodato de Impressora');
  check('host com ou sem www e http', R.cardsDoHtml('<a href="http://jrplasticos.com.br/x-y"><h2 class="card__title">X</h2></a>', HOST_HIB).length === 1);

  console.log('\n=== Saída e pendências ===');
  const item = ent.itens[0];
  const dados = {
    contaId: '001', contaNome: 'L.C DA SILVA REMOCOES', nomeFantasia: 'LC Remoções', contato: { nome: 'Sergio AparecidoDeSouza', email: 'esergio@x.com.br', telefone: '551142492430' },
    numeroContrato: '02007819', site: '3rsustentavel.com.br', idProjeto: '6452', ga: { accountId: '389582297', propertyId: 'properties/536412612', conexao: 'bcrelatorios2@gmail.com' },
    gsc: { siteUrl: 'https://www.3rsustentavel.com.br', conexao: 'bcrelatoriotags@gmail.com' }, pacote: '150', valor: 2034.24, palavras: 'a|b', tipo: 'one',
  };
  const linha = R.linhaSaida(item, dados);
  check('19 colunas na ordem da planilha', linha.length === 19 && linha[0] === '34.199.037/0001-02' && linha[6] === 'Busca Cliente' && linha[10] === 'busca_cliente');
  check('primeiro nome do contato, contrato, ID, GA, GSC, pacote, valor, palavras', linha[3] === 'Sergio' && linha[4] === 'esergio@x.com.br' && linha[7] === '02007819' && linha[9] === '6452' && linha[11] === '389582297' && linha[12] === 'properties/536412612' && linha[13] === 'bcrelatorios2@gmail.com' && linha[14] === 'bcrelatoriotags@gmail.com' && linha[15] === 'https://www.3rsustentavel.com.br' && linha[16] === '150' && linha[17] === 'R$2034,24' && linha[18] === 'a|b');
  check('o nº do contrato da planilha MPI fica como veio (7 dígitos)', R.linhaSaida(ent.itens[2], { ...dados, numeroContrato: '02041343' })[7] === '2041343');
  check('completo sem pendências', R.pendenciasDaLinha(item, dados).length === 0 && R.situacao(item, dados) === 'completo');
  check('sem conta = erro; faltando GA e palavras = parcial', R.situacao(item, { ...dados, contaId: '' }) === 'erro' && R.situacao(item, { ...dados, ga: {}, palavras: '' }) === 'parcial' && R.pendenciasDaLinha(item, { ...dados, ga: { propertyId: 'properties/1' } }).includes('gaConexao'));
  const abas = R.montarAbasXlsx([
    { empresa: 'Busca', aba: 'Busca', linha: 2, razao: 'A', situacao: 'completo', pendencias: [], observacoes: [], dados, saida: linha },
    { empresa: 'MPI', aba: 'MPI', linha: 2, razao: 'B', situacao: 'parcial', pendencias: ['ga'], observacoes: ['x'], dados: { ...dados, ga: {} } },
  ]);
  check('abas Busca, MPI, Diagnóstico e Pendências', abas.map((a) => a.aba).join(',') === 'Busca,MPI,Diagnóstico,Pendências' && abas[0].linhas.length === 1 && abas[1].linhas.length === 1 && abas[2].linhas.length === 2 && abas[3].linhas.length === 1 && abas[3].linhas[0][4] === 'sem propriedade do GA4');
  check('resumo e linha de texto', /1 completa\(s\), 1 parcial/.test(R.textoResumo([{ situacao: 'completo' }, { situacao: 'parcial' }])) && /completo \(2 palavras\)/.test(R.textoLinha({ razao: 'A', situacao: 'completo', dados })));

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
  check('linha completa, com as palavras do híbrido', r.situacao === 'completo' && r.saida[18].split('|').length === 8 && r.saida[17] === 'R$2034,24' && r.saida[3] === 'Ana');
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
  check('conta não achada: situação erro, nada mais é chamado, a linha sai com os fixos', r4.situacao === 'erro' && /CNPJ/.test(r4.erro) && r4.saida[6] === 'Busca Cliente' && r4.saida[18] === '');
  const r5 = await Rodada.preencherItem(ent.itens[0], { ...deps, site: async () => { throw new Error('tempo esgotado'); } }, () => {});
  check('fonte que lança não derruba a linha: vira observação e pendência', r5.situacao === 'parcial' && r5.observacoes.some((o) => /tempo esgotado/.test(o)) && r5.pendencias.includes('palavras'));

  console.log(falhas ? `\n${falhas} verificação(ões) FALHOU(ARAM)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
