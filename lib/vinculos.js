// Conferir vínculos no painel MPI+ (ADR-144) — lógica pura.
//
// A pergunta do líder é uma só: "quais clientes MPI+ estão com o painel
// vinculado certinho?". Aqui fica o que decide isso sem rede e sem tela:
//   - quem é MPI+ na planilha de publicações (as abas MPI e Busca Cliente têm
//     a coluna Tipo: MPI+, MPI ou Busca; só o MPI+ mora no painel);
//   - o veredito de um cliente a partir do que o painel mostrou (Configuração
//     → 5. Integrações e Relatório → Conexão), com o que falta dito pelo nome;
//   - as linhas e o resumo do .xlsx que vai para a apresentação.
//
// Roda no processo principal (require) e no renderer (window.Vinculos), como o
// lib/painel-mpiplus.js. Nada aqui escreve no painel: é leitura e julgamento.

(function () {
  'use strict';

  const DIACRITICOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
  const texto = (v) => String(v == null ? '' : v).trim();
  const chave = (s) => texto(s).normalize('NFD').replace(DIACRITICOS, '').toLowerCase().replace(/[^a-z0-9+]/g, '');

  // "MPI+", "mpi +", "MPI PLUS" → é MPI+. "MPI" e "Busca" não.
  function ehMpiPlus(tipo) {
    const k = chave(tipo);
    return k === 'mpi+' || k === 'mpiplus';
  }

  // "https://www.cliente.com.br/" → "cliente.com.br". Lixo vira vazio.
  function limparDominio(valor) {
    let s = texto(valor).toLowerCase();
    if (!s) return '';
    s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '').replace(/^www\./, '');
    return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s) ? s : '';
  }

  // A aba diz a empresa (ADR-063): MPI é da MPI Solutions, Busca Cliente é da
  // Busca Cliente. O nome da aba na planilha pode variar; o pedido não.
  function empresaDaAba(abaPedida, aba) {
    const k = chave(abaPedida || aba);
    if (k === 'mpi') return 'MPI Solutions';
    if (k.startsWith('busca') || k === 'bc') return 'Busca Cliente';
    return texto(aba || abaPedida);
  }

  // Colunas da planilha de publicações (ADR-062): Data, Domínio, Razão Social,
  // Chave Única, Tipo. Quando a aba tem cabeçalho, ele manda; sem ele, valem
  // as posições.
  const COLUNAS_PADRAO = { data: 0, dominio: 1, razao: 2, tipo: 4 };
  function mapaDoCabecalho(linha) {
    const l = (linha || []).map((c) => chave(c));
    const acha = (...nomes) => l.findIndex((c) => nomes.includes(c));
    const dominio = acha('dominio', 'site', 'url');
    if (dominio < 0) return null;
    const razao = acha('razaosocial', 'razao', 'cliente', 'empresa');
    const tipo = acha('tipo');
    const data = acha('data', 'datadepublicacao');
    return { dominio, razao: razao < 0 ? COLUNAS_PADRAO.razao : razao, tipo: tipo < 0 ? COLUNAS_PADRAO.tipo : tipo, data: data < 0 ? COLUNAS_PADRAO.data : data };
  }

  // abas: [{ aba, abaPedida, primeiraLinha, valores }] (o usedRange de cada
  // uma). Devolve os sites, um por domínio, com a aba, a linha e o tipo. Com
  // apenasMpiPlus (padrão), os outros tipos ficam só na contagem.
  function clientesDaPlanilha(abas, opcoes) {
    const opts = Object.assign({ apenasMpiPlus: true }, opcoes || {});
    const clientes = [];
    const tipos = {};
    const duplicados = [];
    let semDominio = 0;
    const vistos = new Map();
    for (const a of abas || []) {
      const valores = Array.isArray(a && a.valores) ? a.valores : [];
      const primeira = Number(a && a.primeiraLinha) || 1;
      const empresa = empresaDaAba(a.abaPedida, a.aba);
      let mapa = Object.assign({}, COLUNAS_PADRAO);
      valores.forEach((linha, i) => {
        if (!Array.isArray(linha)) return;
        if (i === 0) {
          const doCabecalho = mapaDoCabecalho(linha);
          if (doCabecalho) { mapa = doCabecalho; return; }
        }
        const temAlgo = linha.slice(0, 5).some((v) => texto(v));
        if (!temAlgo) return;
        const dominio = limparDominio(linha[mapa.dominio]);
        if (!dominio) { semDominio++; return; }
        const tipo = texto(linha[mapa.tipo]);
        const rotuloTipo = ehMpiPlus(tipo) ? 'MPI+' : (tipo || '(sem tipo)');
        tipos[rotuloTipo] = (tipos[rotuloTipo] || 0) + 1;
        if (opts.apenasMpiPlus && !ehMpiPlus(tipo)) return;
        const numero = primeira + i;
        const item = {
          empresa, aba: a.aba, abaPedida: a.abaPedida, linha: numero, origemLinha: `${a.aba}!${numero}`,
          data: texto(linha[mapa.data]), dominio, razao: texto(linha[mapa.razao]), tipo: rotuloTipo,
        };
        if (vistos.has(dominio)) { duplicados.push({ dominio, primeira: vistos.get(dominio), repetida: item.origemLinha }); return; }
        vistos.set(dominio, item.origemLinha);
        clientes.push(item);
      });
    }
    return { clientes, tipos, duplicados, semDominio };
  }

  // ----- O veredito de um cliente -----
  //
  // "Vinculado certinho" é: as três tags nas Integrações (Analytics, Tag
  // Manager, Search Console) E o Relatório com Analytics e Search Console
  // preenchidos e a conexão validada pelo próprio painel (o selo OK). O
  // reCAPTCHA não é tag: entra como observação. Não conseguir ler nunca vira
  // "está pronto" (ADR-087): vira "não consegui ler", para conferir à mão.

  const SITUACOES = {
    vinculado: 'Vinculado',
    incompleto: 'Incompleto',
    'nao-lido': 'Não consegui ler',
    'nao-achou': 'Não achei no painel',
    erro: 'Erro',
  };

  function siteDoRelatorioEhDoDominio(siteUrl, dominio) {
    const d = limparDominio(dominio);
    if (!d || !texto(siteUrl)) return true; // sem o que comparar, não acuso
    const s = texto(siteUrl).toLowerCase().replace(/^sc-domain:/, '');
    const host = limparDominio(s) || s.replace(/^www\./, '');
    return host === d || host.endsWith('.' + d) || d.endsWith('.' + host);
  }

  // conf: o que painelConferirVinculo devolveu. opts.dominio: o da planilha.
  // opts.site: as tags que estão de fato no HTML do site ({ ok, ga: [], gtm:
  // [], metaVerificacao, erro }), lidas fora do painel; é a prova que não
  // depende do Alpine carregar: painel vazio com tag no ar é leitura suspeita,
  // não cliente sem nada.
  function avaliarConferencia(conf, opcoes) {
    const opts = opcoes || {};
    const site = opts.site || null;
    const faltando = [];
    const observacoes = [];
    let naoLeu = false;
    let suspeita = false;
    const c = conf || {};
    const integ = c.integracoes || {};
    const val = c.valores || {};
    const up = (s) => texto(s).toUpperCase();
    const siteGa = site && site.ok ? (site.ga || []).map(up) : [];
    const siteGtm = site && site.ok ? (site.gtm || []).map(up) : [];

    if (!c.achouConfig) { faltando.push('Integrações (não consegui ler a aba Configuração)'); naoLeu = true; }
    else {
      const tudoVazio = !integ.ga && !integ.gtm && !integ.gsc;
      if (tudoVazio && c.integracoesProntas === false) { faltando.push('Integrações (o painel não liberou a configuração a tempo)'); naoLeu = true; }
      else {
        if (!integ.ga) faltando.push('Analytics nas Integrações');
        if (!integ.gtm) faltando.push('Tag Manager nas Integrações');
        if (!integ.gsc) faltando.push('Search Console nas Integrações');
      }
      if (!integ.recaptcha) observacoes.push('reCAPTCHA sem chaves nas Integrações');
      if (val.ga && !/^G-[A-Z0-9]+$/i.test(val.ga)) observacoes.push(`Analytics nas Integrações fora do formato G-…: ${val.ga}`);
      if (val.gtm && !/^GTM-[A-Z0-9]+$/i.test(val.gtm)) observacoes.push(`Tag Manager nas Integrações fora do formato GTM-…: ${val.gtm}`);
      if (c.releitura) observacoes.push('Integrações lidas na 2ª leitura (a 1ª veio vazia)');
      if (site && site.ok) {
        if ((!integ.ga && siteGa.length) || (!integ.gtm && siteGtm.length)) {
          suspeita = true;
          observacoes.push(`o site tem ${[...siteGa, ...siteGtm].join(', ')} no HTML, mas o painel leu vazio: leitura suspeita, conferir de novo`);
        }
        if (integ.ga && val.ga && !siteGa.includes(up(val.ga))) observacoes.push(`a tag ${val.ga} do painel não aparece no HTML do site${siteGa.length ? ` (no ar: ${siteGa.join(', ')})` : ''}`);
        if (integ.gtm && val.gtm && !siteGtm.includes(up(val.gtm))) observacoes.push(`o container ${val.gtm} do painel não aparece no HTML do site${siteGtm.length ? ` (no ar: ${siteGtm.join(', ')})` : ''}`);
      } else if (site && site.erro) {
        observacoes.push(`site não acessível para conferir as tags no HTML (${site.erro})`);
      }
    }

    const rel = c.relatorio;
    if (!rel) { faltando.push('Relatório (não consegui ler a aba)'); naoLeu = true; }
    else {
      const cfg = rel.config || {};
      if (rel.carregouContrato === false) { faltando.push('Relatório (o contrato do painel não carregou a tempo)'); naoLeu = true; }
      const gaCompleto = !!(cfg.ga_connection_id && cfg.ga_account_key && cfg.ga_property_id);
      const gscCompleto = !!(cfg.gsc_connection_id && cfg.gsc_site_url);
      if (!gaCompleto) faltando.push('Analytics no Relatório');
      if (!gscCompleto) faltando.push('Search Console no Relatório');
      if (rel.legado && !cfg.leads_external_id) faltando.push('External ID no Relatório (cliente legado)');
      if (gscCompleto && !siteDoRelatorioEhDoDominio(cfg.gsc_site_url, opts.dominio)) {
        faltando.push(`Search Console do Relatório aponta para ${cfg.gsc_site_url}, não para ${limparDominio(opts.dominio)}`);
      }
      if (gaCompleto && gscCompleto && !rel.conexaoOk) faltando.push('Conexão do Relatório não validada (selo Pendente)');
      if (rel.conexaoOk) {
        if (rel.ga && rel.ga !== 'ok') observacoes.push(`trilho do Analytics no Relatório: ${rel.ga}`);
        if (rel.gsc && rel.gsc !== 'ok') observacoes.push(`trilho do Search Console no Relatório: ${rel.gsc}`);
      }
      if (rel.lastError) observacoes.push(`último erro do Relatório: ${rel.lastError}`);
    }

    const soLeitura = faltando.every((f) => /não consegui ler|não carregou|não liberou/.test(f));
    const situacao = !faltando.length ? 'vinculado' : ((naoLeu && soLeitura) || suspeita ? 'nao-lido' : 'incompleto');
    return { situacao, rotulo: SITUACOES[situacao], faltando, observacoes, suspeita };
  }

  // As tags que estão no HTML de uma página: todos os G-… e GTM-… que
  // aparecem (sem repetir) e a meta de verificação do Search Console.
  function tagsDoHtml(html) {
    const h = String(html || '');
    const unicos = (lista) => [...new Set(lista.map((s) => s.toUpperCase()))];
    const ga = unicos(h.match(/\bG-[A-Z0-9]{5,}\b/gi) || []);
    const gtm = unicos(h.match(/\bGTM-[A-Z0-9]{4,}\b/gi) || []);
    const m = h.match(/<meta[^>]+name=["']google-site-verification["'][^>]*content=["']([^"']*)["']/i) || h.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']google-site-verification["']/i);
    return { ga, gtm, metaVerificacao: m ? m[1].trim() : '' };
  }

  function textoTagsDoSite(site) {
    if (!site) return '';
    if (!site.ok) return `não acessível${site.erro ? ` (${site.erro})` : ''}`;
    const t = [...(site.ga || []), ...(site.gtm || [])];
    return (t.length ? t.join(', ') : 'nenhuma tag') + (site.metaVerificacao ? ' · meta Search Console' : '');
  }

  // ----- O que vai para a planilha e para o terminal -----

  const COLUNAS_CLIENTES = [
    'Empresa', 'Razão social', 'Domínio', 'Situação', 'O que falta', 'Observações', 'Ação do Hub',
    'Analytics (Integrações)', 'Tag Manager (Integrações)', 'Search Console (Integrações)', 'reCAPTCHA (Integrações)',
    'Relatório: propriedade GA4', 'Relatório: conta do Analytics', 'Relatório: site do Search Console', 'Relatório: conta do Search Console', 'Relatório: conexão',
    'Cliente legado / External ID', 'Tags no site (HTML)', 'Publicado em produção',
    'Link do painel', 'Contrato no painel', 'Como achou o contrato', 'Linha na planilha', 'Conferido em',
  ];

  const simNao = (v) => (v ? 'Sim' : 'Não');

  function textoPublicacao(pub) {
    if (!pub) return '';
    if (pub.concluido && !pub.falhou) return `Sim${pub.sslAtivo ? ', SSL ativo' : ', sem SSL'}${pub.urlProducao ? ` (${pub.urlProducao})` : ''}`;
    return `Não (${pub.siteStatus || 'status desconhecido'}${pub.falhou ? ', a publicação falhou' : ''})`;
  }

  // item: { empresa, razao, dominio, situacao, faltando, observacoes, acao, conferencia,
  //         site, painelUrl, contrato, comoAchou, origemLinha, conferidoEm, erro }
  function linhaCliente(item) {
    const it = item || {};
    const conf = it.conferencia || {};
    const integ = conf.integracoes || {};
    const val = conf.valores || {};
    const rel = conf.relatorio || null;
    const cfg = (rel && rel.config) || {};
    const contas = (rel && rel.contas) || {};
    const faltando = [...(it.faltando || [])];
    if (it.erro) faltando.push(it.erro);
    const legado = rel ? (rel.legado ? `Legado · External ID ${cfg.leads_external_id ? 'preenchido' : 'em branco'}` : 'Não') : '';
    return [
      texto(it.empresa), texto(it.razao), texto(it.dominio), SITUACOES[it.situacao] || texto(it.situacao),
      faltando.join('; '), (it.observacoes || []).join('; '), texto(it.acao),
      conf.achouConfig ? (val.ga || '(vazio)') : '', conf.achouConfig ? (val.gtm || '(vazio)') : '',
      conf.achouConfig ? simNao(integ.gsc) : '', conf.achouConfig ? simNao(integ.recaptcha) : '',
      rel ? (cfg.ga_property_id || '(vazio)') : '', rel ? (contas.ga || (cfg.ga_connection_id ? `conexão ${cfg.ga_connection_id}` : '(vazia)')) : '',
      rel ? (cfg.gsc_site_url || '(vazio)') : '', rel ? (contas.gsc || (cfg.gsc_connection_id ? `conexão ${cfg.gsc_connection_id}` : '(vazia)')) : '',
      rel ? (rel.conexaoOk ? 'OK' : 'Pendente') : '',
      legado, textoTagsDoSite(it.site), textoPublicacao(conf.publicacao),
      texto(it.painelUrl), texto(it.contrato), texto(it.comoAchou), texto(it.origemLinha), texto(it.conferidoEm),
    ];
  }

  function contagem(itens) {
    const c = { total: 0, vinculado: 0, incompleto: 0, 'nao-lido': 0, 'nao-achou': 0, erro: 0 };
    for (const it of itens || []) { c.total++; c[it.situacao] = (c[it.situacao] || 0) + 1; }
    return c;
  }

  const COLUNAS_RESUMO = ['Indicador', 'Quantidade', 'Detalhe'];
  function linhasResumo(itens, opcoes) {
    const opts = opcoes || {};
    const c = contagem(itens);
    const pct = (n) => (c.total ? `${Math.round((n / c.total) * 100)}%` : '');
    const linhas = [
      ['Clientes MPI+ conferidos', c.total, opts.origem ? `origem: ${opts.origem}` : ''],
      ['Vinculados (Integrações + Relatório OK)', c.vinculado, pct(c.vinculado)],
      ['Incompletos (falta algo no painel)', c.incompleto, pct(c.incompleto)],
      ['Não consegui ler (conferir à mão)', c['nao-lido'], pct(c['nao-lido'])],
      ['Não achei no painel', c['nao-achou'], pct(c['nao-achou'])],
      ['Erros', c.erro, pct(c.erro)],
    ];
    const porEmpresa = {};
    for (const it of itens || []) {
      const e = texto(it.empresa) || '(sem empresa)';
      porEmpresa[e] = porEmpresa[e] || { total: 0, vinculado: 0 };
      porEmpresa[e].total++;
      if (it.situacao === 'vinculado') porEmpresa[e].vinculado++;
    }
    for (const e of Object.keys(porEmpresa).sort()) {
      linhas.push([`${e}: vinculados`, porEmpresa[e].vinculado, `de ${porEmpresa[e].total}`]);
    }
    const oQueFalta = {};
    for (const it of itens || []) for (const f of it.faltando || []) { const k = f.replace(/ aponta para .*$/, ' aponta para outro site'); oQueFalta[k] = (oQueFalta[k] || 0) + 1; }
    for (const k of Object.keys(oQueFalta).sort((a, b) => oQueFalta[b] - oQueFalta[a])) linhas.push([`Falta: ${k}`, oQueFalta[k], '']);
    if (opts.geradoEm) linhas.push(['Gerado em', opts.geradoEm, 'pelo Hub, lendo o painel MPI+ (só leitura)']);
    return linhas;
  }

  // As abas do .xlsx: Resumo (para o líder), Clientes (tudo) e Pendências (só
  // quem não está vinculado). "Clientes" tem Razão social, Domínio e Link do
  // painel: serve de entrada para a próxima conferência, sem procurar de novo.
  function montarAbasXlsx(itens, opcoes) {
    const lista = itens || [];
    const pend = lista.filter((it) => it.situacao !== 'vinculado');
    return [
      { aba: 'Resumo', colunas: COLUNAS_RESUMO, linhas: linhasResumo(lista, opcoes) },
      { aba: 'Clientes', colunas: COLUNAS_CLIENTES, linhas: lista.map(linhaCliente) },
      { aba: 'Pendências', colunas: COLUNAS_CLIENTES, linhas: pend.map(linhaCliente) },
    ];
  }

  function textoLinha(item) {
    const it = item || {};
    const quem = `${texto(it.razao) || '(sem razão social)'} — ${texto(it.dominio)}`;
    if (it.situacao === 'vinculado') return `${quem}: Vinculado`;
    const motivo = [...(it.faltando || []), it.erro].filter(Boolean).join(', ');
    return `${quem}: ${SITUACOES[it.situacao] || it.situacao}${motivo ? ` (${motivo})` : ''}`;
  }

  function textoResumo(itens) {
    const c = contagem(itens);
    return `${c.vinculado} vinculado(s), ${c.incompleto} incompleto(s), ${c['nao-lido']} sem leitura, ${c['nao-achou']} não achado(s) no painel, ${c.erro} erro(s), de ${c.total}`;
  }

  const _exports = {
    ehMpiPlus, limparDominio, empresaDaAba, clientesDaPlanilha, mapaDoCabecalho,
    avaliarConferencia, siteDoRelatorioEhDoDominio, tagsDoHtml, textoTagsDoSite, textoPublicacao, SITUACOES,
    COLUNAS_CLIENTES, COLUNAS_RESUMO, linhaCliente, linhasResumo, montarAbasXlsx, contagem, textoLinha, textoResumo,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
  if (typeof window !== 'undefined') window.Vinculos = _exports;
})();
