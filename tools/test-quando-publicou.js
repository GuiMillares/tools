// ADR-135: "Quando publicou" — tarefa de publicação concluída no Salesforce,
// senão o commit do geral.php / client.inc.php no Bitbucket. Com clientes
// falsos, sem rede.
//
//     node tools/test-quando-publicou.js

const path = require('path');
const Q = require(path.join(__dirname, '..', 'lib', 'quando-publicou'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const T = (over) => ({ attributes: { type: 'Task' }, Id: 'T1', Subject: 'Publicação (Troca de DNS) - x.com.br', Status: 'Completed', IsClosed: true, CompletedDateTime: '2025-11-14T18:22:10.000+0000', LastModifiedDate: '2025-11-20T10:00:00.000+0000', CreatedDate: '2025-11-10T10:00:00.000+0000', WhatId: '500A', What: { Name: '00012345' }, Description: '', ...over });

// Salesforce falso: o que a SOSL devolve, o que a SOQL devolve por trecho.
function fakeSf({ sosl = [], soql = () => [], falhaCompleted = false } = {}) {
  const chamadas = { buscar: [], consultar: [] };
  let jaFalhou = false;
  return {
    chamadas,
    async buscar(q) {
      chamadas.buscar.push(q);
      if (falhaCompleted && !jaFalhou && /CompletedDateTime/.test(q)) { jaFalhou = true; const e = new Error("No such column 'CompletedDateTime' on entity 'Task'"); throw e; }
      return typeof sosl === 'function' ? sosl(q) : sosl;
    },
    async consultar(q) { chamadas.consultar.push(q); return soql(q); },
  };
}

// Bitbucket falso. `diffs[hash]` é o diff daquele commit (vazio = sem chave).
function fakeBb({ repos = {}, arquivos = {}, commits = {}, diffs = {} } = {}) {
  const chamadas = { acharRepo: [], acharArquivos: [], commitsDoArquivo: [], diffDoCommit: [] };
  return {
    chamadas,
    workspaces: ['busca-clientes', 'mpi-solutions'],
    async acharRepo(slug) { chamadas.acharRepo.push(slug); return repos[slug] || null; },
    async acharArquivos(repo, nomes) { chamadas.acharArquivos.push(repo.repo); const a = arquivos[repo.repo] || {}; const out = {}; for (const n of nomes) if (a[n]) out[n] = a[n]; return out; },
    async commitsDoArquivo(repo, caminho) { chamadas.commitsDoArquivo.push(caminho); return (commits[repo.repo] || {})[caminho] || []; },
    async diffDoCommit(repo, hash) { chamadas.diffDoCommit.push(hash); return diffs[hash] || ''; },
  };
}

(async () => {
  console.log('\n=== Datas e escolhas ===');
  check('formatarData ISO → dd/mm/aaaa', Q.formatarData('2025-11-14T18:22:10.000+0000') === '14/11/2025', Q.formatarData('2025-11-14T18:22:10.000+0000'));
  check('formatarData vazio → vazio', Q.formatarData('') === '');
  check('dataDaTarefa prefere CompletedDateTime', Q.dataDaTarefa(T({})) === '2025-11-14T18:22:10.000+0000');
  check('dataDaTarefa sem CompletedDateTime usa LastModifiedDate', Q.dataDaTarefa(T({ CompletedDateTime: null })) === '2025-11-20T10:00:00.000+0000');
  {
    const e = Q.escolherTarefa([T({ Id: 'a', CompletedDateTime: '2025-01-01T00:00:00.000+0000' }), T({ Id: 'b', CompletedDateTime: '2025-06-01T00:00:00.000+0000' }), T({ Id: 'c', IsClosed: false, Status: 'Em andamento', CompletedDateTime: null }), T({ Id: 'd', Subject: 'Ligar para o cliente' })]);
    check('escolherTarefa: a concluída mais recente, as abertas à parte, outras tarefas fora', e.concluida.Id === 'b' && e.abertas.length === 1 && e.abertas[0].Id === 'c', JSON.stringify(e));
  }
  {
    const cs = [{ hash: '1', date: '2025-03-01T00:00:00+00:00', message: 'Template inicial', arquivo: 'geral.php' }, { hash: '2', date: '2025-03-25T12:00:00+00:00', message: 'Ajustes para publicação', arquivo: 'geral.php' }, { hash: '3', date: '2025-05-02T00:00:00+00:00', message: 'troca chave recaptcha', arquivo: 'geral.php' }, { hash: '4', date: '2026-09-22T00:00:00+00:00', message: 'feat: publicação da nova metrificação', arquivo: 'geral.php' }];
    check('escolherCommit: o MAIS ANTIGO que fala em publicação (não o de manutenção de 22/09)', Q.escolherCommit(cs).hash === '2' && Q.escolherCommit(cs).criterio === 'mensagem', JSON.stringify(Q.escolherCommit(cs)));
    const semMsg = cs.filter((c) => c.hash !== '2' && c.hash !== '4');
    check('escolherCommit sem mensagem de publicação: palpite = a primeira mudança depois da criação', Q.escolherCommit(semMsg).hash === '3' && Q.escolherCommit(semMsg).criterio === 'palpite');
    check('escolherCommit com um commit só: ele, como palpite', Q.escolherCommit([cs[0]]).hash === '1' && Q.escolherCommit([cs[0]]).criterio === 'palpite');
    check('escolherCommit vazio → null', Q.escolherCommit([]) === null);

    // Conteúdo manda: o commit que pôs as chaves vence a mensagem e a ordem.
    check('introduzChaves: linha adicionada com GTM-', Q.introduzChaves("--- a\n+++ b\n-$tagmanager = '';\n+$tagmanager = 'GTM-ABC123';"));
    check('introduzChaves: G- no idAnalytics', Q.introduzChaves("+$idAnalytics = 'G-7HQ2M4XKPL';"));
    check('introduzChaves: chave vazia ou removida não conta', !Q.introduzChaves("+$tagmanager = '';\n-$tagmanager = 'GTM-OLD';") && !Q.introduzChaves(''));
    check('introduzChaves: siteKey do reCAPTCHA conta (o caso soarestr, 14/11)', Q.introduzChaves("-$siteKey = '';\n+$siteKey = '6LfQ8wwsAAAAAPHJecfwxubSUuWc6Gw_IHZq7M4D';"));
    check('introduzChaves: token do Search Console conta', Q.introduzChaves("+$googleSearchConsole = 'XLZGe5GxJW4Da76ZBSt0EKlnadOiL4VmiF5AfJX7_zU';"));
    check('introduzChaves: siteKey curta/placeholder não conta', !Q.introduzChaves("+$siteKey = '6Lxxxx';") && !Q.introduzChaves("+$googleSearchConsole = 'xxxx';"));
    (async () => {})();
  }
  {
    const cs = [{ hash: '1', date: '2025-03-01T00:00:00+00:00', message: 'Template inicial', arquivo: 'geral.php' }, { hash: '2', date: '2025-03-25T12:00:00+00:00', message: 'configuração', arquivo: 'geral.php' }, { hash: '3', date: '2025-05-02T00:00:00+00:00', message: 'Ajustes para publicação (recaptcha)', arquivo: 'geral.php' }];
    const diffs = { 2: "+$tagmanager = 'GTM-XYZ';", 3: "+$siteKey = '6L';" };
    const lidos = [];
    const r = await Q.escolherCommitPorConteudo(cs, async (c) => { lidos.push(c.hash); return diffs[c.hash] || ''; });
    check('escolherCommitPorConteudo: o commit que pôs o GTM vence a mensagem "publicação" posterior', r.hash === '2' && r.criterio === 'chaves', JSON.stringify(r));
    check('  lê os diffs do mais antigo ao mais novo e para ao achar', lidos.join() === '1,2');
    const r2 = await Q.escolherCommitPorConteudo(cs, async () => '');
    check('  sem chave em nenhum diff: cai na regra da mensagem', r2.hash === '3' && r2.criterio === 'mensagem');
    const r3 = await Q.escolherCommitPorConteudo(cs, async () => { throw new Error('rede'); });
    check('  diff que falha conta como vazio', r3.hash === '3');
    check('  sem função de diff: regra da mensagem', (await Q.escolherCommitPorConteudo(cs, null)).hash === '3');
  }

  console.log('\n=== Salesforce: tarefa concluída ===');
  {
    const sf = fakeSf({ sosl: [T({})] });
    const bb = fakeBb();
    const r = await Q.quandoPublicou('https://www.x.com.br/', { sf, bb });
    check('publicado pela tarefa concluída, na data de conclusão', r.situacao === 'publicado' && r.fonte === 'salesforce' && r.quando === '14/11/2025' && /publicado em 14\/11\/2025/.test(r.texto), JSON.stringify(r));
    check('não vai ao Bitbucket quando o Salesforce responde', bb.chamadas.acharRepo.length === 0);
    check('a SOSL escapa o domínio e pede CompletedDateTime', /FIND \{"x\\\.com\\\.br"\}/.test(sf.chamadas.buscar[0]) === false && /FIND \{"x\.com\.br"\}/.test(sf.chamadas.buscar[0]) && /CompletedDateTime/.test(sf.chamadas.buscar[0]), sf.chamadas.buscar[0]);
    // Tarefa que NÃO cita o domínio (a busca global é aproximada) não vale.
    const sf2 = fakeSf({ sosl: [T({ Subject: 'Publicação (Troca de DNS) - outro.com.br' })] });
    const r2 = await Q.quandoPublicou('x.com.br', { sf: sf2, bb: fakeBb() });
    check('tarefa de outro domínio não conta', r2.situacao !== 'publicado' || r2.fonte !== 'salesforce', JSON.stringify(r2));
    // Domínio só nos comentários vale.
    const sf3 = fakeSf({ sosl: [T({ Subject: 'Publicação (Troca de DNS) - Cliente X', Description: 'site: https://www.x.com.br/' })] });
    const r3 = await Q.quandoPublicou('x.com.br', { sf: sf3, bb: fakeBb() });
    check('domínio só no comentário da tarefa vale', r3.situacao === 'publicado' && r3.fonte === 'salesforce');
  }

  console.log('\n=== Salesforce: org sem CompletedDateTime ===');
  {
    const sf = fakeSf({ sosl: [T({ CompletedDateTime: undefined })], falhaCompleted: true });
    const r = await Q.quandoPublicou('x.com.br', { sf, bb: fakeBb() });
    check('repete a busca sem o campo e usa LastModifiedDate', r.situacao === 'publicado' && r.quando === '20/11/2025' && sf.chamadas.buscar.length === 2 && !/CompletedDateTime/.test(sf.chamadas.buscar[1]), JSON.stringify({ r, q: sf.chamadas.buscar }));
  }

  console.log('\n=== Salesforce: reserva pela conta (cliente que trocou de domínio) ===');
  {
    // A SOSL do domínio não acha tarefa, mas acha a conta pelo Website; os
    // casos dela têm a tarefa de publicação concluída (com o domínio novo).
    const sf = fakeSf({
      sosl: (q) => (/RETURNING Task\(/.test(q) && !/Account\(/.test(q) ? [] : [{ attributes: { type: 'Account' }, Id: '001A', Name: 'SOLARIS REDES LTDA', Website: 'www.solarisredes.com.br' }]),
      soql: (q) => (/FROM Case WHERE AccountId/.test(q) ? [{ Id: '500X' }] : /FROM Task WHERE WhatId IN/.test(q) ? [T({ Subject: 'Publicação (Troca de DNS) - solarisredesportoalegre.com.br', CompletedDateTime: '2025-08-03T12:00:00.000+0000' })] : []),
    });
    const r = await Q.quandoPublicou('solarisredes.com.br', { sf, bb: fakeBb() });
    check('acha pela conta e pelas tarefas dos casos dela', r.situacao === 'publicado' && r.fonte === 'salesforce' && r.quando === '03/08/2025' && /conta SOLARIS REDES LTDA/.test(r.detalhe), JSON.stringify(r));
  }

  console.log('\n=== Bitbucket: sem tarefa concluída ===');
  {
    const repos = { 'y.com.br': { workspace: 'mpi-solutions', repo: 'y.com.br', mainBranch: 'main' } };
    const arquivos = { 'y.com.br': { 'geral.php': 'inc/geral.php', 'client.inc.php': 'inc/client.inc.php' } };
    const commits = { 'y.com.br': {
      'inc/geral.php': [{ hash: 'aaaaaaa1', date: '2025-12-03T14:00:00+00:00', message: 'Ajustes para publicação' }, { hash: 'aaaaaaa0', date: '2025-11-01T14:00:00+00:00', message: 'inicio' }],
      'inc/client.inc.php': [{ hash: 'bbbbbbb1', date: '2025-12-10T14:00:00+00:00', message: 'ajuste cor' }],
    } };
    const sf = fakeSf({ sosl: [T({ Subject: 'Publicação (Troca de DNS) - y.com.br', IsClosed: false, Status: 'Em andamento', CompletedDateTime: null })], soql: () => [] });
    const bb = fakeBb({ repos, arquivos, commits });
    const r = await Q.quandoPublicou('y.com.br', { sf, bb });
    check('publicado pelo commit "Ajustes para publicação" do geral.php (regra da mensagem, sem diff com chave)', r.situacao === 'publicado' && r.fonte === 'bitbucket' && r.quando === '03/12/2025' && /inc\/geral\.php/.test(r.texto) && r.criterio === 'mensagem', JSON.stringify(r));
    check('cita a tarefa aberta no detalhe', /tarefa de publicação aberta/.test(r.detalhe), r.detalhe);
    check('procurou os dois arquivos e leu os diffs', bb.chamadas.commitsDoArquivo.join() === 'inc/geral.php,inc/client.inc.php' && bb.chamadas.diffDoCommit.length === 3);
    // Sem mensagem de publicação: palpite = a primeira mudança depois da criação, dito como palpite.
    const bb2 = fakeBb({ repos, arquivos, commits: { 'y.com.br': { 'inc/geral.php': [commits['y.com.br']['inc/geral.php'][1]], 'inc/client.inc.php': commits['y.com.br']['inc/client.inc.php'] } } });
    const r2 = await Q.quandoPublicou('y.com.br', { sf: fakeSf({ soql: () => [] }), bb: bb2 });
    check('sem "publicação" na mensagem: palpite (primeira mudança depois da criação), marcado', r2.quando === '10/12/2025' && /client\.inc\.php, palpite/.test(r2.texto) && r2.criterio === 'palpite' && /PALPITE/.test(r2.detalhe), JSON.stringify(r2));
    // O caso real de 01/10: manutenção de 22/09/2026 por cima; o diff com GTM- é o que vale.
    const cs = { 'y.com.br': { 'inc/geral.php': [
      { hash: 'm1', date: '2026-09-22T10:00:00+00:00', message: 'feat: inclui nova lógica de metrificação dos leads no painel' },
      { hash: 'p1', date: '2026-03-25T10:00:00+00:00', message: 'config' },
      { hash: 'c0', date: '2026-03-01T10:00:00+00:00', message: 'inicio' },
    ] } };
    const bb3 = fakeBb({ repos, arquivos: { 'y.com.br': { 'geral.php': 'inc/geral.php' } }, commits: cs, diffs: { p1: "+$tagmanager = 'GTM-PERINI';\n+$idAnalytics = 'G-123';", m1: "+$leads = true;" } });
    const r3 = await Q.quandoPublicou('y.com.br', { sf: fakeSf({ soql: () => [] }), bb: bb3 });
    check('manutenção de 22/09 por cima: vale o commit que pôs o GTM (25/03)', r3.quando === '25/03/2026' && r3.criterio === 'chaves' && /pôs chave de verdade/.test(r3.detalhe), JSON.stringify(r3));
    check('  parou de ler diffs ao achar (c0, p1)', bb3.chamadas.diffDoCommit.join() === 'c0,p1', bb3.chamadas.diffDoCommit.join());
    // soarestr.com.br de verdade: "[Feat] Publicação" (14/11) pôs só a siteKey; o GTM veio em 27/11.
    const cs4 = { 'y.com.br': { 'inc/geral.php': [
      { hash: 'g1', date: '2025-11-27T10:00:00+00:00', message: 'geral.php edited online with Bitbucket' },
      { hash: 'f1', date: '2025-11-14T10:00:00+00:00', message: '[Feat] Publicação' },
      { hash: 'b0', date: '2025-10-13T10:00:00+00:00', message: 'feat: reposotorio temporario busca' },
    ] } };
    const bb4 = fakeBb({ repos, arquivos: { 'y.com.br': { 'geral.php': 'inc/geral.php' } }, commits: cs4, diffs: { b0: "+$tagmanager = '';\n+$siteKey = '';", f1: "-$siteKey = '';\n+$siteKey = '6LfQ8wwsAAAAAPHJecfwxubSUuWc6Gw_IHZq7M4D';", g1: "-$tagmanager = '';\n+$tagmanager = 'GTM-TD3FGHL5';" } });
    const r4 = await Q.quandoPublicou('y.com.br', { sf: fakeSf({ soql: () => [] }), bb: bb4 });
    check('soarestr: o commit da siteKey (14/11) é a publicação, não o do GTM (27/11)', r4.quando === '14/11/2025' && r4.criterio === 'chaves', JSON.stringify(r4));
  }

  console.log('\n=== Sem repositório / não encontrado ===');
  {
    const sf = fakeSf({ soql: () => [] });
    const r = await Q.quandoPublicou('z.com.br', { sf, bb: fakeBb() });
    check('sem repositório', r.situacao === 'sem repositório' && r.texto === 'sem repositório', JSON.stringify(r));
    const bb = fakeBb({ repos: { 'w.com.br': { workspace: 'busca-clientes', repo: 'w.com.br', mainBranch: 'master' } } });
    const r2 = await Q.quandoPublicou('w.com.br', { sf: fakeSf({ soql: () => [] }), bb });
    check('repositório sem os arquivos: não encontrado, dizendo o repositório', r2.situacao === 'não encontrado' && /busca-clientes\/w\.com\.br/.test(r2.detalhe), JSON.stringify(r2));
    const bb3 = fakeBb({ repos: { 'v.com.br': { workspace: 'busca-clientes', repo: 'v.com.br', mainBranch: 'master' } }, arquivos: { 'v.com.br': { 'geral.php': 'geral.php' } } });
    const r3 = await Q.quandoPublicou('v.com.br', { sf: fakeSf({ soql: () => [] }), bb: bb3 });
    check('arquivo sem commit: não encontrado', r3.situacao === 'não encontrado' && /sem commit em geral\.php/.test(r3.detalhe), JSON.stringify(r3));
    const r4 = await Q.quandoPublicou('u.com.br', { sf: null, bb: null });
    check('sem Salesforce nem Bitbucket: não encontrado, dizendo que nada foi consultado', r4.situacao === 'não encontrado' && /Salesforce fora/.test(r4.detalhe));
    const r5 = await Q.quandoPublicou('', { sf: null, bb: null });
    check('domínio vazio: erro', r5.situacao === 'erro');
  }

  console.log('\n=== Só Bitbucket (Salesforce fora) ===');
  {
    const bb = fakeBb({ repos: { 'k.com.br': { workspace: 'busca-clientes', repo: 'k.com.br', mainBranch: 'master' } }, arquivos: { 'k.com.br': { 'client.inc.php': 'client.inc.php' } }, commits: { 'k.com.br': { 'client.inc.php': [{ hash: 'c1', date: '2026-01-21T10:00:00+00:00', message: 'publicando' }] } } });
    const r = await Q.quandoPublicou('k.com.br', { sf: null, bb });
    check('Salesforce fora: acha pelo Bitbucket', r.situacao === 'publicado' && r.quando === '21/01/2026');
  }

  console.log('\n=== criarBitbucket com pedir() falso: repositório, arquivos e commits ===');
  {
    const pedidos = [];
    const pedir = async (m, url) => {
      pedidos.push(url);
      if (/repositories\/busca-clientes\/q\.com\.br\?/.test(url)) return { status: 404, json: null };
      if (/repositories\/mpi-solutions\/q\.com\.br\?/.test(url)) return { status: 200, json: { slug: 'q.com.br', mainbranch: { name: 'main' } } };
      if (/\/src\/main\/\?/.test(url)) return { status: 200, json: { values: [{ type: 'commit_directory', path: 'inc' }, { type: 'commit_file', path: 'inc/geral.php' }, { type: 'commit_file', path: 'index.php' }], next: null } };
      if (/\/commits\?path=inc%2Fgeral\.php/.test(url)) return { status: 200, json: { values: [{ hash: 'h1', date: '2025-02-01T00:00:00+00:00', message: 'Ajustes para publicação\n\ndetalhe', author: { raw: 'Ton <ton@x>' } }] } };
      if (/\/diff\/h1\?path=inc%2Fgeral\.php/.test(url)) return { status: 200, json: null, text: "--- a/inc/geral.php\n+++ b/inc/geral.php\n+$tagmanager = 'GTM-Q';" };
      return { status: 500, json: null };
    };
    const bb = Q.criarBitbucket({ workspaces: ['busca-clientes', 'mpi-solutions'], pedir });
    const repo = await bb.acharRepo('q.com.br');
    check('acha o repositório na segunda workspace, com a branch principal', repo && repo.workspace === 'mpi-solutions' && repo.mainBranch === 'main', JSON.stringify(repo));
    const arqs = await bb.acharArquivos(repo, ['geral.php', 'client.inc.php']);
    check('acha o geral.php na subpasta e não inventa o client.inc.php', arqs['geral.php'] === 'inc/geral.php' && !arqs['client.inc.php'], JSON.stringify(arqs));
    const cs = await bb.commitsDoArquivo(repo, 'inc/geral.php');
    check('lê os commits do arquivo (primeira linha da mensagem)', cs.length === 1 && cs[0].message === 'Ajustes para publicação' && cs[0].arquivo === 'inc/geral.php' && cs[0].autor === 'Ton <ton@x>', JSON.stringify(cs));
    const diff = await bb.diffDoCommit(repo, 'h1', 'inc/geral.php');
    check('lê o diff do commit no arquivo (texto)', /GTM-Q/.test(diff) && Q.introduzChaves(diff), diff);
    check('workspaces vazias são ignoradas', Q.criarBitbucket({ workspaces: ['', ' a '] , pedir }).workspaces.join() === 'a');
    let erro = null;
    try { await Q.criarBitbucket({ workspaces: ['x'], pedir: async () => ({ status: 403, json: null }) }).acharRepo('q.com.br'); } catch (e) { erro = e; }
    check('403 vira erro de permissão, não "sem repositório"', erro && /sem permissão/.test(erro.message));
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
