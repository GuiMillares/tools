// Planilha do Relatório (ADR-148) — as fontes de cada dado.
//
// Aqui mora o que fala com o mundo: o Salesforce (conta, contato, contratos),
// o site do cliente (HTML, /categorias, páginas de categoria, sitemap), o
// geral.php no Bitbucket, e o Google (GA4 pela tag, Tag Manager, acesso das
// contas e Search Console). Cada função devolve { ok, log, ... } e não lança:
// a rodada (lib/relatorio-rodada.js) decide o que fazer com o que faltou.
//
// Os clientes de baixo nível são injetados (criarFontes), para o processo
// principal e o script de amostra montarem os mesmos a partir das sessões
// guardadas, e para os testes usarem falsos:
//   sf           cliente do lib/salesforce.js (consultar, buscar, descrever)
//   google       o objeto `google` do googleapis
//   authSa       () => auth da service account (GoogleAuth client)
//   authDoSlot   (slot) => auth OAuth da sessão daquele login, ou null
//   slots        [{ slot, email, analytics: bool, searchConsole: bool }] os logins conectáveis
//   contasConhecidas  e-mails que o painel conhece como conexão (bcrelatorios…, bcrelatoriotags…)
//   padraoMarca  { Busca: { ga, gsc }, MPI: { ga, gsc } } a conta padrão de cada empresa
//   cache        { ler(), gravar(obj) } o analytics-streams-cache.json (ADR-131)
//   bitbucket    o criarBitbucket do lib/quando-publicou.js, ou null
//   painel       ({ razao, dominio }) => { ok, cliente }, ou null
//   baixar       (url, opts) => { status, html, urlFinal, erro } (padrão: o daqui)

const https = require('https');
const http = require('http');
const R = require('./relatorio');
const { escaparSoql, acharContaPorDominio, acharCampoPorRotulo, normalizarTexto, nomeBaseEmpresa } = require('./salesforce');

const texto = (v) => String(v == null ? '' : v).trim();

// ---------- HTTP: baixar uma página inteira ----------

// Diferente do buscarInicioDaPagina do main (60 KB, só o <head>): aqui o
// menu e os campos ocultos ficam no fim da página, então vem tudo, até 4 MB.
function baixar(url, { max = 4 * 1024 * 1024, saltos = 5, timeoutMs = 25000 } = {}) {
  const redirecionamentos = [];
  const um = (atual) => new Promise((resolve) => {
    let u;
    try { u = new URL(atual); } catch (e) { resolve({ status: 0, erro: `endereço inválido: ${atual}` }); return; }
    const mod = u.protocol === 'http:' ? http : https;
    const req = mod.request(
      { hostname: u.hostname, port: u.port || undefined, path: (u.pathname || '/') + (u.search || ''), method: 'GET', headers: { Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Hub' } },
      (res) => {
        let corpo = '';
        res.setEncoding('utf-8');
        res.on('data', (c) => { if (corpo.length < max) corpo += c; else res.destroy(); });
        const fim = () => resolve({ status: res.statusCode, html: corpo, location: res.headers.location || '' });
        res.on('end', fim);
        res.on('close', fim);
      }
    );
    req.on('error', (e) => resolve({ status: 0, erro: e.message }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0, erro: 'tempo esgotado' }); });
    req.end();
  });
  return (async () => {
    let atual = url;
    for (let i = 0; i <= saltos; i++) {
      const r = await um(atual);
      const ehRedirect = [301, 302, 303, 307, 308].includes(r.status) && r.location;
      if (!ehRedirect) return { ...r, urlFinal: atual, redirecionamentos };
      let destino;
      try { destino = new URL(r.location, atual).toString(); } catch (e) { return { ...r, urlFinal: atual, redirecionamentos, erro: `redirecionou para um endereço inválido (${r.location})` }; }
      redirecionamentos.push({ de: atual, para: destino, status: r.status });
      atual = destino;
    }
    return { status: 0, erro: `mais de ${saltos} redirecionamentos seguidos`, urlFinal: atual, redirecionamentos };
  })();
}

async function emParalelo(itens, limite, fn) {
  const fila = [...itens];
  const out = [];
  const corre = async () => { while (fila.length) { const it = fila.shift(); out.push(await fn(it)); } };
  await Promise.all(Array.from({ length: Math.min(limite, fila.length || 1) }, corre));
  return out;
}

function criarFontes(deps) {
  const d = deps || {};
  const baixarUrl = d.baixar || baixar;
  const log = () => {};

  // ---------- Salesforce ----------

  let camposSf = null;
  // Os nomes internos dos campos, pelo rótulo (ADR-111), uma vez por rodada:
  // Account: CNPJ, Nome Fantasia; Contract: Projeto, Site, Pacote Contratado,
  // Valor da Parcela Mensal (Novo).
  async function campos(sf, push) {
    if (camposSf) return camposSf;
    const acc = await sf.descrever('Account');
    const con = await sf.descrever('Contract');
    const porRotulo = (desc, rotulos) => {
      for (const r of rotulos) { const n = acharCampoPorRotulo(desc, r); if (n) return n; }
      const alvo = normalizarTexto(rotulos[0]);
      const f = (desc.fields || []).find((x) => normalizarTexto(x.label).includes(alvo));
      return f ? f.name : null;
    };
    const campo = (desc, nome) => (desc.fields || []).find((f) => f.name === nome) || null;
    const selecao = (desc, nome) => {
      const f = campo(desc, nome);
      if (!f) return null;
      if (f.type === 'reference' && f.relationshipName) return { nome, selecao: `${f.relationshipName}.Name`, ler: (r) => (r[f.relationshipName] && r[f.relationshipName].Name) || '' };
      return { nome, selecao: nome, ler: (r) => r[nome] };
    };
    const cnpj = porRotulo(acc, ['CNPJ', 'CNPJ/CPF', 'CPF/CNPJ']);
    const fantasia = porRotulo(acc, ['Nome Fantasia', 'Nome fantasia']);
    const projeto = porRotulo(con, ['Projeto', 'Sel. Projeto']);
    const site = porRotulo(con, ['Site', 'Site do contrato', 'Domínio', 'URL']);
    const pacote = porRotulo(con, ['Pacote Contratado', 'Pacote']);
    const valor = porRotulo(con, ['Valor da Parcela Mensal (Novo)', 'Valor da Parcela Mensal', 'Valor Mensal']);
    camposSf = {
      cnpj: cnpj ? selecao(acc, cnpj) : null, fantasia: fantasia ? selecao(acc, fantasia) : null,
      projeto: projeto ? selecao(con, projeto) : null, site: site ? selecao(con, site) : null, pacote: pacote ? selecao(con, pacote) : null, valor: valor ? selecao(con, valor) : null,
    };
    const faltam = Object.keys(camposSf).filter((k) => !camposSf[k]);
    push(`Salesforce: campos pelo rótulo: CNPJ=${cnpj || '?'}, Nome Fantasia=${fantasia || '?'}, Projeto=${projeto || '?'}, Site=${site || '?'}, Pacote=${pacote || '?'}, Valor=${valor || '?'}.`, faltam.length ? 'warn' : 'info');
    return camposSf;
  }

  const CONTRATO_ATIVO = /^(activated|ativo)$/i;
  const rotuloEmpresa = { Busca: 'busca cliente', MPI: 'mpi solutions' };

  async function salesforce({ empresa, cnpj, razao, numeroContrato, dominio } = {}) {
    const logs = [];
    const push = (message, type = 'info') => logs.push({ message, type });
    const sf = d.sf;
    if (!sf) return { ok: false, erro: 'Salesforce não conectado', log: logs };
    try {
      const c = await campos(sf, push);
      const selAcc = ['Id', 'Name', 'Website', c.cnpj && c.cnpj.selecao, c.fantasia && c.fantasia.selecao].filter(Boolean).join(', ');
      let conta = null;
      let comoAchou = '';
      let aviso = '';
      const porId = async (id) => (await sf.consultar(`SELECT ${selAcc} FROM Account WHERE Id = '${escaparSoql(id)}' LIMIT 1`))[0] || null;

      // MPI: o contrato pelo número, que a planilha traz.
      if (!conta && numeroContrato) {
        push(`SOQL contrato ${numeroContrato}`, 'cmd');
        const cs = await sf.consultar(`SELECT Id, AccountId, ContractNumber FROM Contract WHERE ContractNumber = '${escaparSoql(numeroContrato)}' LIMIT 2`);
        if (cs.length && cs[0].AccountId) { conta = await porId(cs[0].AccountId); comoAchou = `contrato ${numeroContrato}`; }
        else push(`nenhum contrato com o número ${numeroContrato}.`, 'warn');
      }
      // Busca: a conta pelo CNPJ (formatado ou só dígitos).
      if (!conta && cnpj && c.cnpj) {
        const dig = R.limparCnpj(cnpj);
        const fmt = R.formatarCnpj(dig);
        push(`SOQL conta pelo CNPJ ${fmt}`, 'cmd');
        const contas = await sf.consultar(`SELECT ${selAcc} FROM Account WHERE ${c.cnpj.nome} = '${escaparSoql(fmt)}' OR ${c.cnpj.nome} = '${escaparSoql(dig)}' LIMIT 5`);
        if (contas.length === 1) { conta = contas[0]; comoAchou = 'CNPJ'; }
        else if (contas.length > 1) {
          const pelaRazao = contas.find((a) => normalizarTexto(a.Name) === normalizarTexto(razao));
          conta = pelaRazao || contas[0];
          comoAchou = pelaRazao ? 'CNPJ (várias contas; a da razão social)' : 'CNPJ (várias contas; a primeira)';
          aviso = `${contas.length} contas com o CNPJ ${fmt}: ${contas.map((a) => a.Name).join(' / ')}`;
        } else push(`nenhuma conta com o CNPJ ${fmt}.`, 'warn');
      }
      // Pela razão social: igual, depois pelo começo sem o sufixo (LTDA, ME…).
      if (!conta && razao) {
        push(`SOQL conta pelo nome "${razao}"`, 'cmd');
        let contas = await sf.consultar(`SELECT ${selAcc} FROM Account WHERE Name = '${escaparSoql(razao)}' LIMIT 5`);
        if (!contas.length) {
          const base = nomeBaseEmpresa(razao);
          if (base && base.length >= 4) contas = await sf.consultar(`SELECT ${selAcc} FROM Account WHERE Name LIKE '${escaparSoql(base)}%' LIMIT 10`);
          const exata = contas.filter((a) => nomeBaseEmpresa(a.Name) === base);
          if (exata.length) contas = exata;
        }
        if (contas.length === 1) { conta = contas[0]; comoAchou = 'razão social'; }
        else if (contas.length > 1) {
          // Várias com o mesmo nome: a que tem contrato ativo, senão a primeira, avisando.
          const ids = contas.map((a) => `'${escaparSoql(a.Id)}'`).join(', ');
          const ativos = await sf.consultar(`SELECT AccountId FROM Contract WHERE AccountId IN (${ids}) AND Status = 'Activated'`);
          const comAtivo = contas.filter((a) => ativos.some((x) => x.AccountId === a.Id));
          conta = (comAtivo.length === 1 ? comAtivo[0] : null) || contas[0];
          comoAchou = comAtivo.length === 1 ? 'razão social (a conta com contrato ativo)' : 'razão social (várias contas; a primeira)';
          aviso = `${contas.length} contas com o nome ${razao}`;
        } else push(`nenhuma conta com o nome "${razao}".`, 'warn');
      }
      // Pelo domínio (ADR-117), quando a linha traz um.
      if (!conta && dominio) {
        const r = await acharContaPorDominio(sf, dominio, push, { razao: razao || '' });
        if (r.conta) { conta = await porId(r.conta.Id); comoAchou = `domínio (${r.via})`; }
      }
      if (!conta) return { ok: true, achou: false, motivo: `conta não achada no Salesforce (${[cnpj && 'CNPJ', razao && 'razão social', numeroContrato && 'nº do contrato', dominio && 'domínio'].filter(Boolean).join(', ')})`, log: logs };

      push(`conta ${conta.Name} (por ${comoAchou}).`, 'info');
      const contaOut = { Id: conta.Id, Name: conta.Name, website: conta.Website || '', nomeFantasia: c.fantasia ? texto(c.fantasia.ler(conta)) : '', cnpj: c.cnpj ? texto(c.cnpj.ler(conta)) : '' };

      // O primeiro contato (o mais antigo com e-mail; senão o mais antigo).
      push(`SOQL contatos da conta`, 'cmd');
      const contatos = await sf.consultar(`SELECT Id, Name, FirstName, Email, Phone, MobilePhone, CreatedDate FROM Contact WHERE AccountId = '${escaparSoql(conta.Id)}' ORDER BY CreatedDate ASC LIMIT 20`);
      const ct = contatos.find((x) => x.Email) || contatos[0] || null;
      const contato = ct ? { nome: ct.FirstName || ct.Name || '', nomeCompleto: ct.Name || '', email: ct.Email || '', telefone: ct.Phone || ct.MobilePhone || '' } : null;
      if (!contato) push('a conta não tem contatos.', 'warn');

      // Os contratos: o pedido, senão o ativo da empresa da aba.
      const selCon = ['Id', 'ContractNumber', 'Status', 'StartDate', 'EndDate', c.projeto && c.projeto.selecao, c.site && c.site.selecao, c.pacote && c.pacote.selecao, c.valor && c.valor.selecao].filter(Boolean).join(', ');
      push(`SOQL contratos da conta`, 'cmd');
      const brutos = await sf.consultar(`SELECT ${selCon} FROM Contract WHERE AccountId = '${escaparSoql(conta.Id)}' ORDER BY StartDate DESC NULLS LAST LIMIT 50`);
      const contratos = brutos.map((x) => ({
        id: x.Id, numero: x.ContractNumber || '', status: x.Status || '', inicio: x.StartDate || '', fim: x.EndDate || '',
        projeto: c.projeto ? texto(c.projeto.ler(x)) : '', site: c.site ? texto(c.site.ler(x)) : '', pacote: c.pacote ? texto(c.pacote.ler(x)) : '',
        valor: c.valor ? c.valor.ler(x) : '',
      }));
      let escolhido = null;
      let comoEscolheu = '';
      if (numeroContrato) { escolhido = contratos.find((x) => x.numero === numeroContrato) || null; if (escolhido) comoEscolheu = 'o número da planilha'; }
      if (!escolhido && contratos.length) {
        const ativos = contratos.filter((x) => CONTRATO_ATIVO.test(x.status));
        const daEmpresa = ativos.filter((x) => normalizarTexto(x.projeto).includes(rotuloEmpresa[empresa] || '\u0000'));
        let cand = daEmpresa.length ? daEmpresa : ativos;
        if (cand.length > 1 && cand.some((x) => x.site)) cand = cand.filter((x) => x.site);
        if (cand.length === 1) { escolhido = cand[0]; comoEscolheu = daEmpresa.length ? `único contrato ativo de ${empresa === 'MPI' ? 'MPI Solutions' : 'Busca Cliente'}` : 'único contrato ativo'; }
        else if (cand.length > 1) { escolhido = cand[0]; comoEscolheu = `${cand.length} contratos ativos; fiquei com o mais recente`; aviso = aviso || `${cand.length} contratos ativos: ${cand.map((x) => x.numero + (x.site ? ' ' + x.site : '')).join(' / ')}`; }
        else { escolhido = contratos[0]; comoEscolheu = 'nenhum ativo; o mais recente'; aviso = aviso || `nenhum contrato ativo (${contratos.map((x) => x.numero + ' ' + x.status).join(' / ')})`; }
      }
      if (!contratos.length) push('a conta não tem contratos.', 'warn');
      else push(`contrato ${escolhido ? escolhido.numero : '?'} (${comoEscolheu})${escolhido && escolhido.site ? `, site ${escolhido.site}` : ''}${escolhido && escolhido.pacote ? `, pacote ${escolhido.pacote}` : ''}.`, 'info');

      // Os domínios que os casos e as tarefas de publicação da conta citam
      // ("Publicação (Troca de DNS) - informatica.3rinformatica.com.br"): é
      // onde o Busca One mora quando o Site do contrato é só o domínio raiz.
      let dominiosCitados = [];
      try {
        const casos = await sf.consultar(`SELECT Subject FROM Case WHERE AccountId = '${escaparSoql(conta.Id)}' ORDER BY CreatedDate DESC LIMIT 100`);
        const tarefas = await sf.consultar(`SELECT Subject FROM Task WHERE WhatId IN (SELECT Id FROM Case WHERE AccountId = '${escaparSoql(conta.Id)}') ORDER BY CreatedDate DESC LIMIT 200`);
        const textos = [...casos, ...tarefas].map((x) => String(x.Subject || ''));
        const vistos = new Set();
        for (const t of textos) for (const m of t.toLowerCase().match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/g) || []) { const dd = R.limparDominio(m); if (dd && !vistos.has(dd)) { vistos.add(dd); dominiosCitados.push(dd); } }
      } catch (e) { push(`não li os domínios dos casos/tarefas (${e.message.slice(0, 80)}).`, 'info'); }
      return { ok: true, achou: true, conta: contaOut, comoAchou, contato, contratos, escolhido, comoEscolheu, aviso, dominiosCitados, log: logs };
    } catch (e) {
      const reauth = !!(e && (e.sessaoInvalida || e.status === 403 || e.reauth));
      push(`Salesforce: ${e.message}`, 'error');
      return { ok: false, erro: e.message, reauth, log: logs };
    }
  }

  // ---------- O site ----------

  const MAX_CATEGORIAS_PARA_ABRIR = 40;
  const MAX_SITEMAPS = 40;
  const MAX_TITULOS = 40;

  async function site({ dominio } = {}) {
    const logs = [];
    const push = (message, type = 'info') => logs.push({ message, type });
    const dom = R.limparDominio(dominio);
    if (!dom) return { ok: false, erro: 'domínio inválido', log: logs };
    try {
      push(`GET https://${dom}/`, 'cmd');
      let home = await baixarUrl(`https://${dom}/`);
      if ((home.erro || !home.html || home.status >= 400)) {
        const www = await baixarUrl(`https://www.${dom}/`);
        if (www.html && !www.erro && www.status < 400) home = www;
      }
      if (home.erro && !home.html) return { ok: false, erro: home.erro, log: logs };
      if (!home.html || home.status >= 400) return { ok: false, erro: `o site respondeu ${home.status} sem HTML`, log: logs };
      let origin;
      try { origin = new URL(home.urlFinal).origin; } catch (e) { origin = `https://${dom}`; }
      const host = origin.replace(/^https?:\/\//, '');
      const ocultos = R.camposOcultos(home.html);
      const tags = R.tagsDoHtml(home.html);
      const menu = R.menuDoHtml(home.html, host);
      const dataMpi = R.linksDataMpi(home.html, host);
      const fontes = [];
      if (menu.categorias.length) fontes.push(`menu (${menu.categorias.length} categorias, ${menu.palavras.length} palavras)`);
      if (dataMpi.length) fontes.push(`links data-mpi (${dataMpi.length})`);

      push(`GET ${origin}/categorias`, 'cmd');
      const cat = await baixarUrl(`${origin}/categorias`);
      const cardsCategorias = cat.html && cat.status < 400 ? R.cardsDoHtml(cat.html, host) : [];
      if (cardsCategorias.length) fontes.push(`/categorias (${cardsCategorias.length} cartões)`);
      else push(`/categorias ${cat.status || cat.erro || 'sem cartões'}.`, 'info');

      // As categorias conhecidas até aqui. Poucas (≤ 40) é jeito de híbrido:
      // abre cada página de categoria para ler as palavras; muitas é One.
      const conhecidas = new Map();
      for (const c of [...menu.categorias, ...cardsCategorias]) if (!conhecidas.has(c.slug)) conhecidas.set(c.slug, c);
      if (!conhecidas.size) for (const c of dataMpi) conhecidas.set(c.slug, c);
      const cardsPorCategoria = {};
      if (conhecidas.size && conhecidas.size <= MAX_CATEGORIAS_PARA_ABRIR) {
        const slugs = [...conhecidas.keys()];
        push(`GET ${slugs.length} página(s) de categoria`, 'cmd');
        await emParalelo(slugs, 4, async (slug) => {
          const r = await baixarUrl(`${origin}/${slug}`);
          if (r.html && r.status < 400) cardsPorCategoria[slug] = R.cardsDoHtml(r.html, host).filter((x) => x.slug !== slug);
        });
        const n = Object.values(cardsPorCategoria).reduce((s, l) => s + l.length, 0);
        if (n) fontes.push(`páginas de categoria (${n} cartões)`);
      }

      // O sitemap (e os filhos, se for índice).
      let sitemap = { pares: [], nivel1: [] };
      const sm = await baixarUrl(`${origin}/sitemap.xml`);
      if (sm.html && sm.status < 400) {
        const lido = R.lerSitemap(sm.html);
        let urls = lido.urls;
        if (lido.indice) {
          const filhos = lido.filhos.slice(0, MAX_SITEMAPS);
          push(`sitemap índice com ${lido.filhos.length} filho(s); lendo ${filhos.length}`, 'cmd');
          const partes = await emParalelo(filhos, 4, async (u) => { const r = await baixarUrl(u, { max: 3 * 1024 * 1024 }); return r.html && r.status < 400 ? R.lerSitemap(r.html).urls : []; });
          urls = partes.flat();
        }
        sitemap = R.paresDoSitemap(urls, host);
        if (sitemap.pares.length) fontes.push(`sitemap (${sitemap.pares.length} pares categoria/palavra)`);
      }

      let achado = R.juntarFontes({ menu, cardsCategorias, cardsPorCategoria, dataMpi, sitemap });
      // Categorias que só o sitemap cita: ficaram fora, mas vão para o diagnóstico.
      const categoriasForaDoSite = [...new Set(sitemap.pares.map((p) => p.categoria))].filter((c) => achado.categorias.length && !achado.categorias.some((x) => x.slug === c));

      // Quem só estava no sitemap tem o título pelo slug: a página diz o certo.
      const semTitulo = achado.palavras.filter((p) => p.tituloPeloSlug).slice(0, MAX_TITULOS);
      if (semTitulo.length) {
        push(`GET ${semTitulo.length} página(s) de palavra para ler o título`, 'cmd');
        const titulos = {};
        await emParalelo(semTitulo, 4, async (p) => {
          const r = await baixarUrl(`${origin}/${p.slug}`);
          const t = r.html && r.status < 400 ? R.tituloDaPagina(r.html) : '';
          if (t) titulos[p.slug] = t;
        });
        achado = R.juntarFontes({ menu, cardsCategorias, cardsPorCategoria, dataMpi, sitemap, titulos });
      }
      // Cara de Busca One: os campos ocultos da barra do /doutor, o menu
      // data-mpi, os cartões de /categorias ou pares no sitemap.
      const ehBuscaOne = !!(ocultos.tipoProjeto || ocultos.idProjeto || dataMpi.length || cardsCategorias.length || sitemap.pares.length || menu.categorias.length);
      push(`${dom}: ${achado.categorias.length} categoria(s), ${achado.palavras.length} palavra(s)${ocultos.tipoProjeto ? `; o site diz "${ocultos.tipoProjeto}"` : ''}${ocultos.idProjeto ? `; idProjeto ${ocultos.idProjeto}` : ''}; tags ${[...tags.ga, ...tags.gtm].join(', ') || 'nenhuma'}${ehBuscaOne ? '' : '; sem cara de Busca One'}.`, ehBuscaOne ? 'info' : 'warn');
      return { ok: true, host, origin, urlFinal: home.urlFinal, ocultos, tags, achado, fontes, categoriasForaDoSite, ehBuscaOne, log: logs };
    } catch (e) {
      push(`${dom}: ${e.message}`, 'error');
      return { ok: false, erro: e.message, log: logs };
    }
  }

  // ---------- geral.php no Bitbucket ----------

  async function geralPhp({ dominio } = {}) {
    const logs = [];
    const push = (message, type = 'info') => logs.push({ message, type });
    const bb = d.bitbucket;
    const dom = R.limparDominio(dominio);
    if (!bb || !dom) return { ok: false, erro: bb ? 'domínio inválido' : 'Bitbucket não configurado', log: logs };
    try {
      // O slug é o domínio (PRD §9); com subdomínio, vale também o registrável.
      const partes = dom.split('.');
      const registravel = partes.length > 2 && !/^(com|net|org|gov|edu|ind|art|eng|adv|med|odo|psc|vet|eco|agr)$/.test(partes[partes.length - 2]) ? partes.slice(1).join('.') : '';
      let repo = await bb.acharRepo(dom);
      if (!repo && registravel && registravel !== dom) repo = await bb.acharRepo(registravel);
      if (!repo) { push(`${dom}: sem repositório no Bitbucket.`, 'info'); return { ok: true, repo: '', idProjetoBusca: '', idAnalytics: '', tagmanager: '', log: logs }; }
      // As chaves moram no geral.php ou, nos sites mais antigos, no client.inc.php
      // (ADR-135). Os caminhos usuais vão direto (a listagem do repositório
      // para no teto antes de chegar ao inc/, com as centenas de páginas de
      // palavra e de cidade na raiz); a listagem é a reserva.
      let caminho = '';
      let php = '';
      for (const p of ['inc/geral.php', 'geral.php', 'inc/client.inc.php', 'client.inc.php']) {
        const t = await bb.lerArquivo(repo, p);
        if (t) { caminho = p; php = t; break; }
      }
      if (!caminho) {
        const arquivos = await bb.acharArquivos(repo, ['geral.php', 'client.inc.php']);
        caminho = arquivos['geral.php'] || arquivos['client.inc.php'] || '';
        if (caminho) php = await bb.lerArquivo(repo, caminho);
      }
      if (!caminho) { push(`${dom}: o repositório ${repo.workspace}/${repo.repo} não tem geral.php nem client.inc.php.`, 'info'); return { ok: true, repo: `${repo.workspace}/${repo.repo}`, idProjetoBusca: '', idAnalytics: '', tagmanager: '', log: logs }; }
      const pega = (nome) => { const m = php.match(new RegExp('\\$' + nome + '\\s*=\\s*["\']([^"\']*)["\']')); return m ? texto(m[1]) : ''; };
      const r = { ok: true, repo: `${repo.workspace}/${repo.repo}`, arquivo: caminho, idProjetoBusca: pega('idProjetoBusca').replace(/\D/g, ''), idAnalytics: pega('idAnalytics').toUpperCase(), tagmanager: pega('tagmanager').toUpperCase(), log: logs };
      push(`${dom}: ${caminho} em ${r.repo}: $idProjetoBusca=${r.idProjetoBusca || '?'}, $idAnalytics=${r.idAnalytics || '?'}, $tagmanager=${r.tagmanager || '?'}.`, 'info');
      return r;
    } catch (e) {
      push(`Bitbucket: ${e.message}`, 'warn');
      return { ok: false, erro: e.message, log: logs };
    }
  }

  // ---------- O painel (ID do cliente) ----------

  async function painelId({ razao, dominio } = {}) {
    if (!d.painel) return { ok: false, erro: 'painel indisponível', log: [] };
    try { return await d.painel({ razao, dominio }); } catch (e) { return { ok: false, erro: e.message, log: [] }; }
  }

  // ---------- Google ----------

  const memo = { resumo: null, containers: null, acessos: new Map(), resumoPorSlot: new Map(), sitesPorSlot: new Map() };
  const ANALYTICS_CACHE_VALIDO_MS = 30 * 24 * 60 * 60 * 1000;

  // Todas as contas e propriedades que a service account enxerga, uma vez por rodada.
  async function resumoContas(push) {
    if (memo.resumo) return memo.resumo;
    const auth = await d.authSa();
    const analyticsadmin = d.google.analyticsadmin('v1beta');
    const lista = [];
    let pageToken;
    push('GET contas e propriedades do Analytics (accountSummaries)', 'cmd');
    do {
      const res = await analyticsadmin.accountSummaries.list({ pageSize: 200, pageToken, auth });
      for (const a of res.data.accountSummaries || []) {
        const accountId = String(a.account || '').split('/').pop();
        for (const p of a.propertySummaries || []) lista.push({ account: a.displayName, accountName: a.account, accountId, property: p.property, displayName: p.displayName });
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    memo.resumo = lista;
    push(`${lista.length} propriedade(s) em ${new Set(lista.map((x) => x.accountName)).size} conta(s).`, 'info');
    return lista;
  }

  // A propriedade cujo data stream tem o measurementId (ou o domínio): pelo
  // cache (ADR-131), senão varrendo da conta mais nova para a mais antiga, e
  // parando ao achar.
  async function acharPropriedade({ measurementId, dominio }, push) {
    const resumo = await resumoContas(push);
    const cache = (d.cache && d.cache.ler()) || {};
    const casa = (web) => (web || []).some((w) => (measurementId && String(w.measurementId).toUpperCase() === measurementId) || (!measurementId && dominio && dominioDeUri(w.uri) === dominio));
    const porProperty = new Map(resumo.map((x) => [x.property, x]));
    for (const prop of Object.keys(cache)) {
      const c = cache[prop];
      if (c && Array.isArray(c.web) && casa(c.web)) {
        const item = porProperty.get(prop) || { property: prop, account: c.account || '', accountName: c.accountName || '', accountId: c.accountName ? String(c.accountName).split('/').pop() : '' };
        return { ...item, como: 'cache dos data streams' };
      }
    }
    const auth = await d.authSa();
    const analyticsadmin = d.google.analyticsadmin('v1beta');
    const naoLidas = resumo.filter((x) => { const c = cache[x.property]; return !(c && Array.isArray(c.web) && Date.now() - (c.at || 0) < ANALYTICS_CACHE_VALIDO_MS); }).reverse();
    push(`procurando ${measurementId || dominio} nos data streams: ${naoLidas.length} propriedade(s) sem cache, das contas mais novas para as mais antigas, paro ao achar`, 'cmd');
    let achada = null;
    let lidas = 0;
    let novas = 0;
    await emParalelo(naoLidas, 8, async (item) => {
      if (achada) return;
      let streams = [];
      try { const res = await analyticsadmin.properties.dataStreams.list({ parent: item.property, auth }); streams = res.data.dataStreams || []; } catch (e) { return; }
      lidas++;
      const web = streams.filter((s) => s.webStreamData && s.webStreamData.measurementId).map((s) => ({ measurementId: s.webStreamData.measurementId, uri: s.webStreamData.defaultUri || '', displayName: s.displayName || '' }));
      cache[item.property] = { web, account: item.account, accountName: item.accountName, displayName: item.displayName, at: Date.now() };
      novas++;
      if (novas % 200 === 0 && d.cache) d.cache.gravar(cache);
      if (!achada && casa(web)) achada = { ...item, como: `varredura dos data streams (${lidas} lidas)` };
    });
    if (novas && d.cache) d.cache.gravar(cache);
    if (lidas) push(`${lidas} propriedade(s) lidas na API${achada ? ' (parei ao achar)' : ''}; ficam no cache.`, 'info');
    return achada;
  }

  function dominioDeUri(uri) {
    if (!uri) return '';
    try { return new URL(String(uri).includes('://') ? uri : `https://${uri}`).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
  }

  // O G- que o container do Tag Manager dispara (tag do Google / GA4 config),
  // pela versão publicada. Container achado pelo ID público entre as contas
  // que a service account vê (lista uma vez por rodada).
  async function measurementIdDoContainer(publicId, push) {
    const auth = await d.authSa();
    const tagmanager = d.google.tagmanager('v2');
    if (!memo.containers) {
      memo.containers = new Map();
      push('GET contas e containers do Tag Manager', 'cmd');
      let pageToken;
      do {
        const res = await tagmanager.accounts.list({ pageToken, auth });
        for (const acc of res.data.account || []) {
          try {
            const cs = await tagmanager.accounts.containers.list({ parent: acc.path, auth });
            for (const c of cs.data.container || []) memo.containers.set(String(c.publicId || '').toUpperCase(), c.path);
          } catch (e) { push(`Tag Manager: não li os containers de ${acc.name} (${e.message}).`, 'warn'); }
        }
        pageToken = res.data.nextPageToken;
      } while (pageToken);
      push(`${memo.containers.size} container(s) visíveis.`, 'info');
    }
    const caminho = memo.containers.get(String(publicId).toUpperCase());
    if (!caminho) { push(`o container ${publicId} não está nas contas que a service account vê.`, 'warn'); return ''; }
    push(`GET versão publicada do container ${publicId}`, 'cmd');
    const live = await tagmanager.accounts.containers.versions.live({ parent: caminho, auth });
    const tags = live.data.tag || [];
    const vars = live.data.variable || [];
    const valorDe = (v) => {
      const s = texto(v);
      const m = s.match(/^\{\{(.+)\}\}$/);
      if (!m) return s;
      const vr = vars.find((x) => x.name === m[1]);
      const p = vr && (vr.parameter || []).find((x) => x.key === 'value');
      return p ? texto(p.value) : '';
    };
    for (const t of tags) {
      const par = (k) => { const p = (t.parameter || []).find((x) => x.key === k); return p ? valorDe(p.value) : ''; };
      let id = '';
      if (t.type === 'googtag') id = par('tagId');
      else if (t.type === 'gaawc') id = par('measurementId');
      if (/^G-[A-Z0-9]{5,}$/i.test(id)) return id.toUpperCase();
    }
    const texto2 = JSON.stringify(live.data);
    const m = texto2.match(/\bG-[A-Z0-9]{5,}\b/);
    return m ? m[0].toUpperCase() : '';
  }

  // Quem tem acesso à conta do GA4 (accessBindings), via service account. Só
  // a v1alpha da Admin API expõe os accessBindings (a v1beta não).
  async function usuariosDaConta(accountName, push) {
    if (memo.acessos.has(accountName)) return memo.acessos.get(accountName);
    const analyticsadmin = d.google.analyticsadmin('v1alpha');
    const listar = async (auth) => {
      const emails = [];
      let pageToken;
      do {
        const res = await analyticsadmin.accounts.accessBindings.list({ parent: accountName, pageSize: 200, pageToken, auth });
        for (const b of res.data.accessBindings || []) if (b.user) emails.push(String(b.user).toLowerCase());
        pageToken = res.data.nextPageToken;
      } while (pageToken);
      return [...new Set(emails)];
    };
    // Primeiro a service account; nas contas em que ela não administra, a
    // sessão principal do Google (quem usa o Hub), se estiver conectada.
    let emails = null;
    const erros = [];
    try { emails = await listar(await d.authSa()); } catch (e) { erros.push(`service account: ${e.message.slice(0, 80)}`); }
    if (!emails && typeof d.authPrincipal === 'function') {
      try {
        const auth = await d.authPrincipal();
        if (auth) emails = await listar(auth);
      } catch (e) { erros.push(`sessão principal: ${e.message.slice(0, 80)}`); }
    }
    if (!emails) push(`não li quem acessa ${accountName} (${erros.join('; ')}).`, 'warn');
    memo.acessos.set(accountName, emails);
    return emails;
  }

  const conhecidas = () => (d.contasConhecidas || []).map((e) => String(e || '').toLowerCase()).filter(Boolean);
  const pareceLoginDeRelatorio = (e) => /^(bcrelatorio|ferramentasmpi|relatorio)/i.test(String(e || ''));

  // Qual login enxerga a conta: pelos acessos da conta, senão pelas sessões
  // conectadas, senão o padrão da marca (dito como suposição).
  async function loginDaContaGa(item, empresa, push) {
    const emails = await usuariosDaConta(item.accountName, push);
    const lista = conhecidas();
    // A conta "BUSCA CLIENTE - MPI+" é operada pelo login da MPI+ (bcrelatoriotags), seja qual for a aba.
    const marca = /mpi\s*\+/i.test(String(item.account || '')) ? 'MPI+' : empresa;
    const preferido = (d.padraoMarca && d.padraoMarca[marca] && d.padraoMarca[marca].ga || d.padraoMarca && d.padraoMarca[empresa] && d.padraoMarca[empresa].ga || '').toLowerCase();
    if (emails && emails.length) {
      const entre = emails.filter((e) => lista.includes(e));
      const candidatos = entre.length ? entre : emails.filter(pareceLoginDeRelatorio);
      if (candidatos.length) {
        const esc = candidatos.includes(preferido) ? preferido : candidatos.sort()[0];
        return { conexao: esc, como: `tem acesso à conta ${item.account || item.accountName}${candidatos.length > 1 ? ` (também: ${candidatos.filter((x) => x !== esc).join(', ')})` : ''}` };
      }
    }
    for (const s of (d.slots || []).filter((x) => x.analytics)) {
      try {
        if (!memo.resumoPorSlot.has(s.slot)) {
          const auth = await d.authDoSlot(s.slot);
          if (!auth) { memo.resumoPorSlot.set(s.slot, null); continue; }
          const analyticsadmin = d.google.analyticsadmin('v1beta');
          const contas = new Set();
          let pageToken;
          do {
            const res = await analyticsadmin.accountSummaries.list({ pageSize: 200, pageToken, auth });
            for (const a of res.data.accountSummaries || []) contas.add(a.account);
            pageToken = res.data.nextPageToken;
          } while (pageToken);
          memo.resumoPorSlot.set(s.slot, contas);
        }
        const contas = memo.resumoPorSlot.get(s.slot);
        if (contas && contas.has(item.accountName)) return { conexao: s.email, como: `a sessão de ${s.email} vê a conta` };
      } catch (e) { push(`sessão de ${s.email}: ${e.message.slice(0, 100)}.`, 'warn'); memo.resumoPorSlot.set(s.slot, null); }
    }
    if (preferido) return { conexao: preferido, como: 'padrão da marca (não conferido: nenhum login conhecido aparece nos acessos da conta)' };
    return { conexao: '', como: 'nenhum login conhecido tem acesso à conta' };
  }

  // O site no Search Console de cada login conectado (sites.list, uma vez por
  // login por rodada): a URL como está lá e o login que a tem.
  async function siteNoSearchConsole(dominio, empresa, push) {
    const dom = R.limparDominio(dominio);
    const casa = (siteUrl) => {
      const s = String(siteUrl || '').toLowerCase();
      if (s.startsWith('sc-domain:')) return s.slice(10) === dom;
      return dominioDeUri(s) === dom;
    };
    const preferido = (d.padraoMarca && d.padraoMarca[empresa] && d.padraoMarca[empresa].gsc || '').toLowerCase();
    const achados = [];
    for (const s of (d.slots || []).filter((x) => x.searchConsole)) {
      try {
        if (!memo.sitesPorSlot.has(s.slot)) {
          const auth = await d.authDoSlot(s.slot);
          if (!auth) { memo.sitesPorSlot.set(s.slot, null); continue; }
          push(`GET sites do Search Console de ${s.email}`, 'cmd');
          const sc = d.google.searchconsole('v1');
          const res = await sc.sites.list({ auth });
          memo.sitesPorSlot.set(s.slot, (res.data.siteEntry || []).map((x) => ({ siteUrl: x.siteUrl, permissao: x.permissionLevel || '' })));
        }
        const sites = memo.sitesPorSlot.get(s.slot) || [];
        for (const x of sites) if (casa(x.siteUrl)) achados.push({ email: s.email, siteUrl: x.siteUrl, permissao: x.permissao });
      } catch (e) { push(`Search Console de ${s.email}: ${e.message.slice(0, 100)}.`, 'warn'); memo.sitesPorSlot.set(s.slot, null); }
    }
    if (!achados.length) {
      // Reserva: a service account é dona dos sites que o Hub verificou; ela
      // dá a URL como está no Search Console, e o login fica o padrão da
      // marca, dito como suposição.
      try {
        if (!memo.sitesPorSlot.has('sa')) {
          const auth = await d.authSa();
          push('GET sites do Search Console da service account', 'cmd');
          const res = await d.google.searchconsole('v1').sites.list({ auth });
          memo.sitesPorSlot.set('sa', (res.data.siteEntry || []).map((x) => ({ siteUrl: x.siteUrl, permissao: x.permissionLevel || '' })));
        }
        const sa = (memo.sitesPorSlot.get('sa') || []).filter((x) => casa(x.siteUrl));
        if (sa.length) {
          sa.sort((a, b) => (/^https:\/\/www\./i.test(b.siteUrl) ? 1 : 0) - (/^https:\/\/www\./i.test(a.siteUrl) ? 1 : 0));
          return { siteUrl: String(sa[0].siteUrl).replace(/\/+$/, ''), conexao: preferido, como: `a service account lista o site (${sa[0].permissao || 'sem nível'}); login = padrão da marca, não conferido (nenhuma sessão de login conectada o lista)` };
        }
      } catch (e) { push(`Search Console da service account: ${e.message.slice(0, 100)}.`, 'warn'); memo.sitesPorSlot.set('sa', null); }
      return { siteUrl: '', conexao: '', como: 'nenhum login conectado (nem a service account) lista o site no Search Console' };
    }
    const peso = (a) => (a.email.toLowerCase() === preferido ? 2 : 0) + (/owner/i.test(a.permissao) ? 1 : 0) + (/^https:\/\/www\./i.test(a.siteUrl) ? 0.5 : 0);
    achados.sort((a, b) => peso(b) - peso(a));
    const e = achados[0];
    return { siteUrl: String(e.siteUrl).replace(/\/+$/, ''), conexao: e.email, como: `listado no Search Console de ${e.email} (${e.permissao || 'sem nível'})${achados.length > 1 ? `; também em ${[...new Set(achados.slice(1).map((x) => x.email))].join(', ')}` : ''}` };
  }

  async function googleFn({ dominio, ga, gtm, empresa } = {}) {
    const logs = [];
    const push = (message, type = 'info') => logs.push({ message, type });
    const dom = R.limparDominio(dominio);
    const out = { ok: true, ga: { accountId: '', propertyId: '', measurementId: '', conexao: '', como: '' }, gsc: { siteUrl: '', conexao: '', como: '' }, log: logs };
    try {
      let measurementId = String((ga || [])[0] || '').toUpperCase();
      if (!measurementId && (gtm || []).length) {
        try { measurementId = await measurementIdDoContainer(gtm[0], push); } catch (e) { push(`Tag Manager: ${e.message.slice(0, 160)}`, 'warn'); }
        if (measurementId) push(`o container ${gtm[0]} dispara ${measurementId}.`, 'info');
      }
      const prop = await acharPropriedade({ measurementId, dominio: dom }, push);
      if (prop) {
        out.ga = { accountId: prop.accountId || '', propertyId: prop.property, measurementId, conta: prop.account || '', conexao: '', como: `${prop.account || prop.accountName} → ${prop.displayName || prop.property} (${measurementId ? 'pela tag ' + measurementId : 'pelo domínio no data stream'}; ${prop.como})` };
        const login = await loginDaContaGa(prop, empresa, push);
        out.ga.conexao = login.conexao;
        out.ga.como += `; login: ${login.como}`;
        push(`${dom}: GA4 ${prop.property} na conta ${prop.account || prop.accountName}; login ${login.conexao || '?'}.`, 'info');
      } else {
        out.ga.como = measurementId ? `nenhuma propriedade com o data stream ${measurementId}` : 'sem G- no site e nenhum data stream com o domínio';
        push(`${dom}: ${out.ga.como}.`, 'warn');
      }
      out.gsc = await siteNoSearchConsole(dom, empresa, push);
      push(`${dom}: Search Console ${out.gsc.siteUrl || 'não achado'}${out.gsc.conexao ? ` (${out.gsc.conexao})` : ''}.`, out.gsc.siteUrl ? 'info' : 'warn');
      return out;
    } catch (e) {
      push(`Google: ${e.message}`, 'error');
      return { ...out, ok: false, erro: e.message };
    }
  }

  return { salesforce, site, geralPhp, painelId, google: googleFn, baixar: baixarUrl };
}

module.exports = { criarFontes, baixar, emParalelo };
