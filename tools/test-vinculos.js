// ADR-144: conferir os vínculos dos clientes MPI+ no painel. Testa a parte
// pura (lib/vinculos.js): quem é MPI+ na planilha de publicações, o veredito
// por cliente a partir do que o painel mostrou, e as linhas do .xlsx. Sem rede.
//
//     node tools/test-vinculos.js

const path = require('path');
const V = require(path.join(__dirname, '..', 'lib', 'vinculos'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// O que o painel devolve quando está tudo certo (painelConferirVinculo).
const PAINEL_OK = () => ({
  ok: true, achouConfig: true,
  integracoes: { recaptcha: true, gtm: true, ga: true, gsc: true },
  valores: { ga: 'G-ABC123', gtm: 'GTM-XYZ9', gscPreenchido: true, recaptcha: true },
  relatorio: {
    pronto: true, conexaoOk: true, ga: 'ok', gsc: 'ok', leads: null, legado: false, projeto: 'cliente.com.br', carregouContrato: true,
    config: { ga_connection_id: '12', ga_account_key: '123456', ga_property_id: 'properties/987', gsc_connection_id: '12', gsc_site_url: 'sc-domain:cliente.com.br', leads_external_id: '' },
    contas: { ga: 'bcrelatoriotags@gmail.com', gsc: 'bcrelatoriotags@gmail.com' },
    lastError: '',
  },
});

(async () => {
  console.log('\n=== Quem é MPI+ na planilha ===');
  check('MPI+ em várias grafias', ['MPI+', 'mpi+', 'MPI +', 'MPI PLUS', ' Mpi Plus '].every(V.ehMpiPlus));
  check('MPI, Busca e vazio não são', !V.ehMpiPlus('MPI') && !V.ehMpiPlus('Busca') && !V.ehMpiPlus('') && !V.ehMpiPlus(null));
  check('limpa o domínio como a planilha grava', V.limparDominio('https://www.Cliente.com.br/') === 'cliente.com.br' && V.limparDominio('Domínio') === '');
  check('a aba diz a empresa', V.empresaDaAba('MPI') === 'MPI Solutions' && V.empresaDaAba('Busca Cliente') === 'Busca Cliente' && V.empresaDaAba('BUSCA', 'Busca Cliente 2025') === 'Busca Cliente');

  const abas = [
    { aba: 'MPI', abaPedida: 'MPI', primeiraLinha: 1, valores: [
      ['Data', 'Domínio', 'Razão Social', 'Chave Única', 'Tipo'],
      ['01/02/2026', 'https://asasys.com.br/', 'ASASYS LTDA', '', 'MPI+'],
      ['02/02/2026', 'https://outro.com.br/', 'OUTRO LTDA', '', 'MPI'],
      ['03/02/2026', 'https://www.terceiro.com.br/', 'TERCEIRO ME', '', 'mpi +'],
      ['', '', '', '', ''],
      ['04/02/2026', '', 'SEM DOMINIO', '', 'MPI+'],
      ['05/02/2026', 'https://asasys.com.br/', 'ASASYS LTDA (de novo)', '', 'MPI+'],
    ] },
    { aba: 'Busca Cliente', abaPedida: 'Busca Cliente', primeiraLinha: 1, valores: [
      ['Data', 'Domínio', 'Razão Social', 'Chave Única', 'Tipo'],
      ['06/02/2026', 'https://karollinefigueiredo.com.br/', 'KAROLLINE FIGUEIREDO DERMATOLOGIA LTDA', '', 'MPI+'],
      ['07/02/2026', 'https://busca.com.br/', 'BUSCA LTDA', '', 'Busca'],
    ] },
  ];
  {
    const r = V.clientesDaPlanilha(abas);
    check('só os MPI+, nas duas abas', r.clientes.length === 3 && r.clientes.map((c) => c.dominio).join() === 'asasys.com.br,terceiro.com.br,karollinefigueiredo.com.br', JSON.stringify(r.clientes.map((c) => c.dominio)));
    check('com a empresa pela aba', r.clientes[0].empresa === 'MPI Solutions' && r.clientes[2].empresa === 'Busca Cliente');
    check('com a linha de origem', r.clientes[0].origemLinha === 'MPI!2' && r.clientes[1].origemLinha === 'MPI!4' && r.clientes[2].origemLinha === 'Busca Cliente!2', JSON.stringify(r.clientes.map((c) => c.origemLinha)));
    check('razão social e data', r.clientes[0].razao === 'ASASYS LTDA' && r.clientes[0].data === '01/02/2026');
    check('conta os tipos, inclusive os que ficaram de fora', r.tipos['MPI+'] === 4 && r.tipos.MPI === 1 && r.tipos.Busca === 1, JSON.stringify(r.tipos));
    check('domínio repetido fica com a primeira e avisa', r.duplicados.length === 1 && r.duplicados[0].dominio === 'asasys.com.br' && r.duplicados[0].repetida === 'MPI!7', JSON.stringify(r.duplicados));
    check('linha sem domínio é contada, não inventada', r.semDominio === 1);
    const todos = V.clientesDaPlanilha(abas, { apenasMpiPlus: false });
    check('com apenasMpiPlus=false vêm todos os tipos', todos.clientes.length === 5);
  }
  {
    const semCabecalho = V.clientesDaPlanilha([{ aba: 'MPI', abaPedida: 'MPI', primeiraLinha: 3, valores: [['01/02/2026', 'https://x.com.br/', 'X LTDA', '', 'MPI+']] }]);
    check('sem cabeçalho valem as posições, e a linha conta a partir do intervalo', semCabecalho.clientes.length === 1 && semCabecalho.clientes[0].origemLinha === 'MPI!3');
    const colunasTrocadas = V.clientesDaPlanilha([{ aba: 'MPI', abaPedida: 'MPI', primeiraLinha: 1, valores: [['Tipo', 'Cliente', 'Site'], ['MPI+', 'Y LTDA', 'y.com.br']] }]);
    check('cabeçalho fora de ordem é respeitado', colunasTrocadas.clientes.length === 1 && colunasTrocadas.clientes[0].dominio === 'y.com.br' && colunasTrocadas.clientes[0].razao === 'Y LTDA', JSON.stringify(colunasTrocadas.clientes));
  }

  console.log('\n=== O veredito ===');
  {
    const r = V.avaliarConferencia(PAINEL_OK(), { dominio: 'cliente.com.br' });
    check('tudo certo: vinculado, sem falta', r.situacao === 'vinculado' && r.faltando.length === 0 && r.rotulo === 'Vinculado', JSON.stringify(r));
  }
  {
    const p = PAINEL_OK(); p.integracoes.gtm = false; p.valores.gtm = '';
    const r = V.avaliarConferencia(p, { dominio: 'cliente.com.br' });
    check('sem GTM nas Integrações: incompleto, e diz qual', r.situacao === 'incompleto' && r.faltando.join() === 'Tag Manager nas Integrações', JSON.stringify(r.faltando));
  }
  {
    const p = PAINEL_OK(); p.integracoes.recaptcha = false; p.valores.recaptcha = false;
    const r = V.avaliarConferencia(p, { dominio: 'cliente.com.br' });
    check('reCAPTCHA não é tag: vinculado, com observação', r.situacao === 'vinculado' && r.observacoes.some((o) => /reCAPTCHA/.test(o)), JSON.stringify(r));
  }
  {
    const p = PAINEL_OK(); p.relatorio.config.ga_property_id = ''; p.relatorio.conexaoOk = false; p.relatorio.pronto = false;
    const r = V.avaliarConferencia(p, { dominio: 'cliente.com.br' });
    check('Relatório sem propriedade: falta Analytics no Relatório (e não acusa a conexão por cima)', r.situacao === 'incompleto' && r.faltando.join() === 'Analytics no Relatório', JSON.stringify(r.faltando));
  }
  {
    const p = PAINEL_OK(); p.relatorio.conexaoOk = false;
    const r = V.avaliarConferencia(p, { dominio: 'cliente.com.br' });
    check('tudo preenchido mas selo Pendente: incompleto por conexão não validada', r.situacao === 'incompleto' && /Conexão do Relatório não validada/.test(r.faltando.join()), JSON.stringify(r.faltando));
  }
  {
    const p = PAINEL_OK(); p.relatorio.legado = true;
    const r = V.avaliarConferencia(p, { dominio: 'cliente.com.br' });
    check('cliente legado sem External ID: falta', r.situacao === 'incompleto' && /External ID/.test(r.faltando.join()), JSON.stringify(r.faltando));
    p.relatorio.config.leads_external_id = 'cliente-123';
    check('com External ID: vinculado', V.avaliarConferencia(p, { dominio: 'cliente.com.br' }).situacao === 'vinculado');
  }
  {
    const p = PAINEL_OK(); p.relatorio.config.gsc_site_url = 'https://www.outrosite.com.br/';
    const r = V.avaliarConferencia(p, { dominio: 'cliente.com.br' });
    check('Search Console do Relatório apontando para outro site: incompleto, dizendo qual', r.situacao === 'incompleto' && /aponta para https:\/\/www\.outrosite\.com\.br\/, não para cliente\.com\.br/.test(r.faltando.join()), JSON.stringify(r.faltando));
    check('sc-domain do próprio domínio passa', V.siteDoRelatorioEhDoDominio('sc-domain:cliente.com.br', 'cliente.com.br') && V.siteDoRelatorioEhDoDominio('https://cliente.com.br/', 'www.cliente.com.br'));
    check('subdomínio passa', V.siteDoRelatorioEhDoDominio('https://loja.cliente.com.br/', 'cliente.com.br'));
    check('sem domínio para comparar não acusa', V.siteDoRelatorioEhDoDominio('https://x.com.br/', ''));
  }
  {
    const p = PAINEL_OK(); p.relatorio = null;
    const r = V.avaliarConferencia(p, { dominio: 'cliente.com.br' });
    check('Relatório não lido: "não consegui ler", nunca vinculado', r.situacao === 'nao-lido' && /Relatório \(não consegui ler/.test(r.faltando.join()), JSON.stringify(r));
    const q = PAINEL_OK(); q.relatorio = null; q.integracoes.ga = false;
    check('não lido E faltando tag: incompleto (há falta certa)', V.avaliarConferencia(q, { dominio: 'cliente.com.br' }).situacao === 'incompleto');
    const s = PAINEL_OK(); s.relatorio.carregouContrato = false; s.relatorio.config = { ga_connection_id: '', ga_account_key: '', ga_property_id: '', gsc_connection_id: '', gsc_site_url: '', leads_external_id: '' };
    const rs = V.avaliarConferencia(s, { dominio: 'cliente.com.br' });
    check('contrato remoto não carregou: não lido, não "incompleto" (ADR-050)', rs.situacao === 'nao-lido' || rs.faltando.some((f) => /não carregou/.test(f)), JSON.stringify(rs));
    check('Integrações não lidas', V.avaliarConferencia({ achouConfig: false, relatorio: PAINEL_OK().relatorio }, { dominio: 'cliente.com.br' }).situacao === 'nao-lido');
  }
  {
    const p = PAINEL_OK(); p.valores.ga = 'UA-123'; p.relatorio.lastError = 'quota';
    const r = V.avaliarConferencia(p, { dominio: 'cliente.com.br' });
    check('GA fora do formato G- e último erro viram observação', r.situacao === 'vinculado' && r.observacoes.some((o) => /G-/.test(o)) && r.observacoes.some((o) => /quota/.test(o)), JSON.stringify(r.observacoes));
  }

  console.log('\n=== A planilha de saída ===');
  const itens = [
    { empresa: 'MPI Solutions', razao: 'ASASYS LTDA', dominio: 'asasys.com.br', situacao: 'vinculado', faltando: [], observacoes: [], conferencia: PAINEL_OK(), painelUrl: 'https://idealplus.idealtrends.io/clientes/1/hub?projeto=2&contrato=3&tab=publicacao', contrato: 'ASASYS / asasys.com.br / contrato 3', comoAchou: 'publicado no domínio da planilha', origemLinha: 'MPI!2', conferidoEm: '07/10/2026 10:00' },
    { empresa: 'Busca Cliente', razao: 'KAROLLINE LTDA', dominio: 'karollinefigueiredo.com.br', situacao: 'incompleto', faltando: ['Tag Manager nas Integrações', 'Conexão do Relatório não validada (selo Pendente)'], observacoes: [], conferencia: (() => { const p = PAINEL_OK(); p.integracoes.gtm = false; p.valores.gtm = ''; p.relatorio.conexaoOk = false; return p; })(), painelUrl: 'https://idealplus.idealtrends.io/clientes/4/hub?projeto=5&contrato=6&tab=publicacao', contrato: '', comoAchou: 'link da planilha', origemLinha: 'Busca Cliente!2', conferidoEm: '07/10/2026 10:01' },
    { empresa: 'MPI Solutions', razao: 'NINGUEM LTDA', dominio: 'ninguem.com.br', situacao: 'nao-achou', faltando: [], observacoes: [], erro: 'nenhum cliente no painel com "NINGUEM LTDA"', origemLinha: 'MPI!9', conferidoEm: '07/10/2026 10:02' },
  ];
  {
    const l = V.linhaCliente(itens[0]);
    check('uma célula por coluna', l.length === V.COLUNAS_CLIENTES.length, `${l.length} x ${V.COLUNAS_CLIENTES.length}`);
    const col = (nome) => l[V.COLUNAS_CLIENTES.indexOf(nome)];
    check('situação em português', col('Situação') === 'Vinculado');
    check('GA e GTM das Integrações', col('Analytics (Integrações)') === 'G-ABC123' && col('Tag Manager (Integrações)') === 'GTM-XYZ9');
    check('propriedade, site e contas do Relatório', col('Relatório: propriedade GA4') === 'properties/987' && col('Relatório: site do Search Console') === 'sc-domain:cliente.com.br' && col('Relatório: conta do Analytics') === 'bcrelatoriotags@gmail.com');
    check('conexão OK', col('Relatório: conexão') === 'OK');
    check('link do painel e como achou', col('Link do painel').startsWith('https://idealplus.idealtrends.io/') && col('Como achou o contrato') === 'publicado no domínio da planilha');
    const l2 = V.linhaCliente(itens[1]);
    check('o que falta, separado por ponto-e-vírgula', l2[V.COLUNAS_CLIENTES.indexOf('O que falta')] === 'Tag Manager nas Integrações; Conexão do Relatório não validada (selo Pendente)' && l2[V.COLUNAS_CLIENTES.indexOf('Tag Manager (Integrações)')] === '(vazio)' && l2[V.COLUNAS_CLIENTES.indexOf('Relatório: conexão')] === 'Pendente');
    const l3 = V.linhaCliente(itens[2]);
    check('não achado: o erro vai para "O que falta" e as colunas do painel ficam vazias', l3[V.COLUNAS_CLIENTES.indexOf('Situação')] === 'Não achei no painel' && /nenhum cliente/.test(l3[V.COLUNAS_CLIENTES.indexOf('O que falta')]) && l3[V.COLUNAS_CLIENTES.indexOf('Analytics (Integrações)')] === '');
    check('as colunas de entrada da próxima rodada existem (razão social, domínio, link do painel)', ['Razão social', 'Domínio', 'Link do painel'].every((c) => V.COLUNAS_CLIENTES.includes(c)));
  }
  {
    const resumo = V.linhasResumo(itens, { origem: 'planilha Book.xlsx', geradoEm: '07/10/2026 10:05' });
    const linha = (nome) => resumo.find((l) => String(l[0]).startsWith(nome));
    check('total e vinculados', linha('Clientes MPI+ conferidos')[1] === 3 && linha('Vinculados')[1] === 1 && linha('Vinculados')[2] === '33%', JSON.stringify(resumo));
    check('incompletos e não achados', linha('Incompletos')[1] === 1 && linha('Não achei')[1] === 1);
    check('por empresa', linha('MPI Solutions: vinculados')[1] === 1 && linha('MPI Solutions: vinculados')[2] === 'de 2' && linha('Busca Cliente: vinculados')[1] === 0);
    check('o que mais falta, contado', linha('Falta: Tag Manager nas Integrações')[1] === 1 && linha('Falta: Conexão do Relatório')[1] === 1);
    check('gerado em', linha('Gerado em')[1] === '07/10/2026 10:05');
    const abasX = V.montarAbasXlsx(itens, { origem: 'x' });
    check('três abas: Resumo, Clientes, Pendências', abasX.map((a) => a.aba).join() === 'Resumo,Clientes,Pendências');
    check('Pendências só com quem não está vinculado', abasX[2].linhas.length === 2 && abasX[1].linhas.length === 3);
    check('texto de uma linha', V.textoLinha(itens[0]) === 'ASASYS LTDA — asasys.com.br: Vinculado' && /Incompleto \(Tag Manager nas Integrações, Conexão/.test(V.textoLinha(itens[1])) && /Não achei no painel \(nenhum cliente/.test(V.textoLinha(itens[2])));
    check('texto do resumo', V.textoResumo(itens) === '1 vinculado(s), 1 incompleto(s), 0 sem leitura, 1 não achado(s) no painel, 0 erro(s), de 3', V.textoResumo(itens));
  }

  console.log('\n=== ADR-145: as tags no HTML do site e a leitura suspeita ===');
  {
    const html = '<html><head><script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script><script>gtag("config","G-ABC123");</script>' +
      '<script>(function(w,d,s,l,i){})(window,document,"script","dataLayer","GTM-XYZ9");</script><meta name="google-site-verification" content="abc" /></head></html>';
    const t = V.tagsDoHtml(html);
    check('acha G- e GTM- sem repetir, e a meta', t.ga.join() === 'G-ABC123' && t.gtm.join() === 'GTM-XYZ9' && t.metaVerificacao === 'abc', JSON.stringify(t));
    check('página sem tags', V.tagsDoHtml('<html></html>').ga.length === 0 && V.tagsDoHtml('').gtm.length === 0);

    const vazio = () => { const p = PAINEL_OK(); p.integracoes = { ga: false, gtm: false, gsc: false, recaptcha: true }; p.valores = { ga: '', gtm: '', gscPreenchido: false, recaptcha: true }; return p; };
    const r = V.avaliarConferencia(vazio(), { dominio: 'cliente.com.br', site: { ok: true, ga: ['G-ABC123'], gtm: ['GTM-XYZ9'], metaVerificacao: '' } });
    check('painel vazio com tag no ar: leitura suspeita, não incompleto', r.situacao === 'nao-lido' && r.suspeita === true && r.observacoes.some((o) => /leitura suspeita/.test(o)), JSON.stringify(r));
    const r2 = V.avaliarConferencia(vazio(), { dominio: 'cliente.com.br', site: { ok: true, ga: [], gtm: [], metaVerificacao: '' } });
    check('painel vazio e site sem tags: incompleto mesmo', r2.situacao === 'incompleto' && !r2.suspeita, JSON.stringify(r2));
    const r3 = V.avaliarConferencia(PAINEL_OK(), { dominio: 'cliente.com.br', site: { ok: true, ga: ['G-OUTRA'], gtm: [], metaVerificacao: '' } });
    check('painel cheio mas o site mostra outra tag: vinculado, com observação', r3.situacao === 'vinculado' && r3.observacoes.some((o) => /G-ABC123 do painel não aparece/.test(o) && /G-OUTRA/.test(o)) && r3.observacoes.some((o) => /GTM-XYZ9 do painel não aparece/.test(o)), JSON.stringify(r3.observacoes));
    const r4 = V.avaliarConferencia(PAINEL_OK(), { dominio: 'cliente.com.br', site: { ok: false, erro: 'tempo esgotado' } });
    check('site fora do ar vira observação', r4.situacao === 'vinculado' && r4.observacoes.some((o) => /não acessível/.test(o)), JSON.stringify(r4.observacoes));
    const s = vazio(); s.integracoesProntas = false;
    const r5 = V.avaliarConferencia(s, { dominio: 'cliente.com.br' });
    check('painel não liberou a configuração e veio vazio: não lido', r5.situacao === 'nao-lido' && /não liberou/.test(r5.faltando.join()), JSON.stringify(r5));
    const u = PAINEL_OK(); u.releitura = true;
    check('2ª leitura vira observação', V.avaliarConferencia(u, { dominio: 'cliente.com.br' }).observacoes.some((o) => /2ª leitura/.test(o)));
    check('texto das tags do site', V.textoTagsDoSite({ ok: true, ga: ['G-1'], gtm: ['GTM-2'], metaVerificacao: 'x' }) === 'G-1, GTM-2 · meta Search Console' && V.textoTagsDoSite({ ok: true, ga: [], gtm: [] }) === 'nenhuma tag' && /não acessível/.test(V.textoTagsDoSite({ ok: false, erro: 'x' })) && V.textoTagsDoSite(null) === '');
    check('texto da publicação', V.textoPublicacao({ concluido: true, sslAtivo: true, urlProducao: 'https://x.com.br' }) === 'Sim, SSL ativo (https://x.com.br)' && /^Não \(approved\)/.test(V.textoPublicacao({ concluido: false, siteStatus: 'approved' })) && V.textoPublicacao(null) === '');
    const linha = V.linhaCliente({ ...itens[0], site: { ok: true, ga: ['G-ABC123'], gtm: ['GTM-XYZ9'] }, acao: 'vinculou agora: G-ABC123', conferencia: { ...PAINEL_OK(), publicacao: { concluido: true, sslAtivo: false } } });
    check('colunas novas na planilha: ação do Hub, tags no site, publicado', linha.length === V.COLUNAS_CLIENTES.length && linha[V.COLUNAS_CLIENTES.indexOf('Ação do Hub')] === 'vinculou agora: G-ABC123' && linha[V.COLUNAS_CLIENTES.indexOf('Tags no site (HTML)')] === 'G-ABC123, GTM-XYZ9' && linha[V.COLUNAS_CLIENTES.indexOf('Publicado em produção')] === 'Sim, sem SSL', JSON.stringify(linha));
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
