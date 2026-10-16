// Planilha do Relatório (ADR-148) — a rodada de UMA linha.
//
// Recebe o item da planilha e as fontes (deps), e devolve a linha preenchida
// com o diagnóstico: de onde veio cada dado, o que faltou e por quê. Nunca
// lança: a rodada em massa não para por uma linha (ADR-144).
//
// deps (todas devolvem { ok, log: [{message,type}], ... } e não lançam):
//   salesforce({ empresa, cnpj, razao, numeroContrato, dominio })
//     → { achou, conta:{Id,Name,nomeFantasia,website}, comoAchou, contato,
//         contratos, escolhido:{numero,site,pacote,valor,projeto,status}, comoEscolheu, motivo }
//     (contrato escolhido desativado: a linha para aqui, pedido de 16/10/2026)
//   site({ dominio }) → { host, origin, ocultos, tags, achado, fontes, categoriasForaDoSite }
//   geralPhp({ dominio }) → { idProjetoBusca, idAnalytics, tagmanager, repo }   (opcional)
//   painelId({ razao, dominio }) → { cliente }                                  (opcional)
//   google({ dominio, ga, gtm, empresa }) → { ga:{accountId,propertyId,conexao,como}, gsc:{siteUrl,conexao,como} }
//   tipoFluxo({ dominio }) → { tipo }                                            (opcional)
//
// Puro no que importa: roda no renderer (deps = window.api), no processo
// principal e no script de amostra (tools/relatorio-amostra.js).

(function () {
  const R = typeof require !== 'undefined' ? require('./relatorio') : window.Relatorio;

  const agora = () => new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  async function chamar(deps, nome, payload, log) {
    const fn = deps && deps[nome];
    if (typeof fn !== 'function') return null;
    let r;
    try { r = await fn(payload); } catch (e) { r = { ok: false, erro: e && e.message ? e.message : String(e) }; }
    for (const e of (r && r.log) || []) log(e.message, e.type || 'info');
    return r || { ok: false, erro: 'sem resposta' };
  }

  async function preencherItem(item, deps, log = () => {}) {
    const it = item || {};
    const d = {
      contaId: '', contaNome: '', nomeFantasia: '', contato: null, numeroContrato: it.numeroContrato || '', site: '', pacote: '', valor: '',
      comoAchouConta: '', comoEscolheuContrato: '', contratosVistos: '', idProjeto: '', idOrigem: '', tags: { ga: [], gtm: [] },
      tipo: '', tipoOrigem: '', achado: null, palavras: '', fontesPalavras: '', ga: { accountId: '', propertyId: '', conexao: '', como: '' }, gsc: { siteUrl: '', conexao: '', como: '' },
      cnpj: it.cnpj || '', statusContrato: '', idDoSite: '',
    };
    const obs = [];
    const quem = it.razao || it.cnpj || it.numeroContrato || `${it.aba}!${it.linha}`;
    let erro = '';

    // 1. Salesforce: a conta, o contato, o contrato (com o site, o pacote e o valor).
    const sf = await chamar(deps, 'salesforce', { empresa: it.empresa, cnpj: it.cnpj, razao: it.razao, numeroContrato: it.numeroContrato, dominio: it.dominio || '' }, log);
    if (sf && sf.ok && sf.achou) {
      d.contaId = sf.conta.Id; d.contaNome = sf.conta.Name; d.nomeFantasia = sf.conta.nomeFantasia || ''; d.comoAchouConta = sf.comoAchou || '';
      if (sf.conta.cnpj) d.cnpj = sf.conta.cnpj;
      d.contato = sf.contato || null;
      const e = sf.escolhido || null;
      if (e) {
        d.numeroContrato = e.numero || d.numeroContrato; d.site = R.limparDominio(e.site) || d.site; d.pacote = e.pacote || ''; d.valor = e.valor;
        d.comoEscolheuContrato = sf.comoEscolheu || '';
      }
      d.contratosVistos = (sf.contratos || []).map((c) => `${c.numero}${c.status ? ' ' + c.status : ''}${c.site ? ' ' + c.site : ''}`).join('; ');
      if (!d.site) d.site = R.limparDominio(sf.conta.website) || '';
      if (!d.site && it.dominio) d.site = R.limparDominio(it.dominio);
      if (!e) obs.push(sf.motivo || 'conta sem contrato');
      else if (sf.aviso) obs.push(sf.aviso);
      d.statusContrato = (e && e.status) || '';
      // Contrato desativado: a linha só diz isso e a rodada pula o resto
      // (site, ID, Google, palavras), pedido de 16/10/2026.
      if (R.contratoDesativado(d)) {
        const outrosAtivos = (sf.contratos || []).filter((c) => c !== e && R.situacaoDoContrato(c.status) === 'Ativo');
        obs.push(`contrato ${d.numeroContrato} desativado no Salesforce: pulei site, ID, Google e palavras${outrosAtivos.length ? ` (a conta tem outro contrato ativo: ${outrosAtivos.map((c) => c.numero + (c.projeto ? ' ' + c.projeto : '')).join(', ')})` : ''}`);
        log(`${quem}: contrato ${d.numeroContrato} desativado; pulei o resto.`, 'info');
        return {
          aba: it.aba, empresa: it.empresa, linha: it.linha, razao: it.razao || d.contaNome, chave: R.chaveItem(it),
          dados: d, saida: R.linhaSaida(it, d), pendencias: R.pendenciasDaLinha(it, d), situacao: R.situacao(it, d), observacoes: obs, erro, preenchidoEm: agora(),
        };
      }
    } else {
      if (it.dominio) d.site = R.limparDominio(it.dominio);
      erro = sf ? (sf.erro || sf.motivo || 'conta não achada no Salesforce') : 'Salesforce indisponível';
      if (sf && sf.reauth) erro = sf.erro;
    }

    // 2. O site: campos ocultos, tags, categorias e palavras. O Site do
    // contrato às vezes é o domínio raiz (3rinformatica.com.br) enquanto o
    // Busca One mora num subdomínio (informatica.3rinformatica.com.br): os
    // candidatos são o domínio da linha, o do contrato, os citados nas
    // tarefas e casos da conta e o Website da conta; vale o primeiro que
    // responde com cara de Busca One, senão o primeiro que responde.
    let site = null;
    const candidatos = [];
    const addCand = (v) => { const x = R.limparDominio(v); if (x && !candidatos.includes(x)) candidatos.push(x); };
    addCand(it.dominio);
    addCand(d.site);
    const raiz = d.site ? R.limparDominio(d.site) : '';
    for (const c of (sf && sf.dominiosCitados) || []) if (!raiz || c === raiz || c.endsWith('.' + raiz) || raiz.endsWith('.' + c)) addCand(c);
    if (sf && sf.achou) addCand(sf.conta.website);
    let primeiroQueRespondeu = null;
    const errosSite = [];
    // O Site do contrato pode trazer a subpasta do tema ("site.com.br/aulas-de-tenis/").
    const caminhoContrato = sf && sf.escolhido ? R.caminhoDoSite(sf.escolhido.site) : '';
    const dominioContrato = sf && sf.escolhido ? R.limparDominio(sf.escolhido.site) : '';
    for (const cand of candidatos) {
      const r = await chamar(deps, 'site', { dominio: cand, empresa: it.empresa, caminho: cand === dominioContrato ? caminhoContrato : '' }, log);
      if (!(r && r.ok)) { errosSite.push(`${cand}: ${(r && r.erro) || 'não respondeu'}`); continue; }
      if (!primeiroQueRespondeu) primeiroQueRespondeu = { cand, r };
      if (r.ehBuscaOne) { site = r; d.site = cand; break; }
    }
    if (!site && primeiroQueRespondeu) { site = primeiroQueRespondeu.r; d.site = primeiroQueRespondeu.cand; obs.push(`${d.site} não tem cara de Busca One (sem campos ocultos, /categorias nem menu de categorias)`); }
    if (!site && !d.site && candidatos.length) d.site = candidatos[0];
    if (site && d.site !== candidatos[0]) obs.push(`site Busca One achado em ${d.site}, não em ${candidatos[0]} (candidatos: ${candidatos.join(', ')})`);
    if (d.site) {
      if (site && site.ok) {
        d.tags = site.tags || d.tags;
        d.achado = site.achado || null;
        d.fontesPalavras = (site.fontes || []).join(', ');
        if (site.categoriasForaDoSite && site.categoriasForaDoSite.length) obs.push(`o sitemap cita categoria(s) que /categorias não lista (ignoradas): ${site.categoriasForaDoSite.join(', ')}`);
        if (site.ocultos && site.ocultos.idProjeto) { d.idProjeto = site.ocultos.idProjeto; d.idOrigem = 'campo oculto idProjeto do site'; }
        // O formulário do BuscaZap/cotação às vezes vem copiado de outro
        // cliente (o mesmo 6339 em dois sites, 16/10/2026): fica por último,
        // depois do geral.php e do painel.
        d.idDoSite = (site.ocultos && site.ocultos.projeto) || '';
        if (site.ocultos && site.ocultos.urlProjeto) {
          const u = R.limparDominio(site.ocultos.urlProjeto);
          if (u && u !== d.site) obs.push(`o site diz que o seu domínio é ${u} (o contrato diz ${d.site})`);
        }
      } else {
        obs.push(`site: ${errosSite.join('; ') || 'nenhum candidato respondeu (' + candidatos.join(', ') + ')'}`);
      }
    }

    // 3. O tipo: o site diz, senão a planilha de fluxo, senão a estrutura.
    let tipoFluxo = '';
    if (d.site && deps.tipoFluxo) {
      const tf = await chamar(deps, 'tipoFluxo', { dominio: d.site }, log);
      tipoFluxo = (tf && tf.tipo) || '';
    }
    const tipo = R.decidirTipo({ tipoProjeto: site && site.ocultos && site.ocultos.tipoProjeto, tipoFluxo, achado: d.achado });
    d.tipo = tipo.tipo; d.tipoOrigem = tipo.origem;
    if (d.tipo === 'mpi+') obs.push('a planilha de fluxo diz MPI+: este site não é Busca One');

    // 4. O ID do cliente: o site, senão o geral.php, senão a busca no painel.
    // MPI+ não tem ID do painel da Busca Cliente (pedido de 16/10/2026).
    if (d.site && !d.idProjeto && deps.geralPhp && d.tipo !== 'mpi+') {
      const g = await chamar(deps, 'geralPhp', { dominio: d.site }, log);
      if (g && g.ok && g.idProjetoBusca && g.idProjetoBusca !== '39') { d.idProjeto = g.idProjetoBusca; d.idOrigem = `$idProjetoBusca do geral.php (${g.repo || 'Bitbucket'})`; }
      if (g && g.ok && !d.tags.ga.length && g.idAnalytics) d.tags = { ...d.tags, ga: [g.idAnalytics] };
      if (g && g.ok && !d.tags.gtm.length && g.tagmanager) d.tags = { ...d.tags, gtm: [g.tagmanager] };
    }
    if (d.site && !d.idProjeto && deps.painelId && d.tipo !== 'mpi+') {
      const p = await chamar(deps, 'painelId', { razao: d.contaNome || it.razao, dominio: d.site }, log);
      if (p && p.ok && p.cliente) { d.idProjeto = String(p.cliente); d.idOrigem = 'busca no painel idealplus (1ª coluna)'; }
    }
    if (!d.idProjeto && d.idDoSite && d.tipo !== 'mpi+' && d.idDoSite !== '39') { d.idProjeto = d.idDoSite; d.idOrigem = 'campo projeto do formulário do site (BuscaZap/cotação); conferir no painel'; }
    else if (d.idDoSite && d.idProjeto && d.idDoSite !== d.idProjeto) obs.push(`o formulário do site diz projeto ${d.idDoSite}, diferente do ID ${d.idProjeto} (${d.idOrigem})`);

    // 5. Google: a propriedade do GA4 pela tag do site, e quem enxerga; o Search Console.
    if (d.site) {
      const g = await chamar(deps, 'google', { dominio: d.site, ga: d.tags.ga, gtm: d.tags.gtm, empresa: it.empresa, subpasta: (site && site.subpasta) || '' }, log);
      if (g && g.ok) {
        d.ga = { ...d.ga, ...(g.ga || {}) };
        d.gsc = { ...d.gsc, ...(g.gsc || {}) };
        if (g.ga && g.ga.measurementId && !d.tags.ga.includes(g.ga.measurementId)) d.tags = { ...d.tags, ga: [...d.tags.ga, g.ga.measurementId] };
        // Site sem cara de Busca One cuja propriedade mora na conta da MPI+
        // ("BUSCA CLIENTE - MPI+"): é um site do painel idealplus, não Busca One.
        if (!(site && site.ehBuscaOne) && d.tipo !== 'mpi+' && /mpi\s*\+/i.test(String(g.ga && g.ga.conta || ''))) {
          d.tipo = 'mpi+'; d.tipoOrigem = `conta do GA4 "${g.ga.conta}"`;
          obs.push('site publicado pelo painel idealplus (MPI+), não Busca One: sem ID, tipo e palavras daqui');
        }
      } else if (g) {
        obs.push(`google: ${g.erro || 'sem resposta'}`);
      }
    }

    // 6. As palavras, pela regra do tipo. MPI+ fica sem palavras e sem ID.
    if (d.tipo === 'mpi+') {
      if (d.idProjeto) obs.push(`MPI+: o ID ${d.idProjeto} (${d.idOrigem}) não vai para a planilha`);
      d.idProjeto = ''; d.idOrigem = 'MPI+: sem ID do painel (não se aplica)';
    } else if (d.achado) {
      d.palavras = R.montarPalavras(d.tipo === 'hibrido' || d.tipo === 'plataforma' ? d.tipo : 'one', d.achado);
      const peloSlug = (d.achado.palavras || []).filter((p) => p.tituloPeloSlug).length;
      if (peloSlug) obs.push(`${peloSlug} palavra(s) só no sitemap, com o título pelo endereço`);
      if (d.tipo === 'one' && (d.achado.palavras || []).length) obs.push(`site One com ${d.achado.palavras.length} palavra(s) embaixo das categorias, fora da coluna pela regra`);
    }
    if (site && site.certificadoInvalido) obs.push(`o certificado SSL do site está inválido (${site.certificadoInvalido}); li mesmo assim`);
    if (site && site.subpasta) obs.push(`tema instalado na subpasta /${site.subpasta}/`);
    // O pacote só é comparável quando é uma contagem de palavras (150, 300…);
    // valores grandes são outra coisa (um valor em reais, por exemplo).
    const pacoteN = Number(String(d.pacote || '').replace(/\D/g, '')) || 0;
    const totalPal = d.palavras ? d.palavras.split('|').length : 0;
    if (pacoteN && pacoteN <= 2000 && totalPal && totalPal < pacoteN) obs.push(`achei ${totalPal} palavras de ${pacoteN} do pacote`);

    const pend = R.pendenciasDaLinha(it, d);
    const sit = R.situacao(it, d);
    return {
      aba: it.aba, empresa: it.empresa, linha: it.linha, razao: it.razao || d.contaNome, chave: R.chaveItem(it),
      dados: d, saida: R.linhaSaida(it, d), pendencias: pend, situacao: sit, observacoes: obs, erro, preenchidoEm: agora(),
    };
  }

  const _exports = { preencherItem };
  if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
  if (typeof window !== 'undefined') window.RelatorioRodada = _exports;
})();
