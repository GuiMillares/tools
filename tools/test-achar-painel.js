// ADR-098: achar sozinho o link do painel pela razão social e confirmar o
// contrato pelo link temporário. Roda a lógica de lib/painel-achar.js com um
// painel falso (os scripts de dentro da página foram conferidos no painel de
// verdade em 23/09/2026) e recorta do renderer a leitura da planilha e a
// conferência antes do DNS.
//
//     node tools/test-achar-painel.js

const fs = require('fs');
const path = require('path');
const P = require(path.join(__dirname, '..', 'lib', 'painel-achar'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// Painel falso: responde cada script pelo que ele pede.
function painelFalso({ clientes = [], projetos = {}, contratos = {}, sites = {} }) {
  const chamadas = [];
  const rodar = async (script) => {
    let m;
    if ((m = script.match(/busca=' \+ encodeURIComponent\((".*?")\)/))) { chamadas.push(['busca', JSON.parse(m[1])]); return { ok: true, clientes }; }
    if ((m = script.match(/'\/projetos\/' \+ "(\d+)" \+ '\/contratos\/' \+ "(\d+)"/))) { chamadas.push(['site', m[2]]); return { ok: true, ...(sites[m[2]] || { temporario: '' }) }; }
    if ((m = script.match(/const p = "(\d+)"/))) { chamadas.push(['contratos', m[1]]); return { ok: true, contratos: contratos[m[1]] || [] }; }
    if ((m = script.match(/fetch\('\/clientes\/' \+ "(\d+)", /))) { chamadas.push(['projetos', m[1]]); return { ok: true, projetos: projetos[m[1]] || [] }; }
    throw new Error('script inesperado');
  };
  return { rodar, chamadas };
}

// O cliente "confeccoeshp" do painel: três projetos, um contrato cada.
const HP = {
  clientes: [{ id: '3155', empresa: 'confeccoeshp', cnpj: '54.825.237/0001-30', contratos: 3 }],
  projetos: { 3155: [
    { projeto: '3797', nome: 'camisas.confeccoeshp.com.br' },
    { projeto: '3798', nome: 'camisas.hpwork.com.br' },
    { projeto: '3799', nome: 'camisas.camisariahp.com.br' },
  ] },
  contratos: { 3797: ['3816'], 3798: ['3817'], 3799: ['3818'] },
  sites: {
    3816: { temporario: 'http://camisasconfeccoeshp.mpitemporario.com.br' },
    3817: { temporario: 'http://camisashpwork.mpitemporario.com.br' },
    3818: { temporario: '' },
  },
};

(async () => {
  console.log('\n=== Link temporário: normalizar e reconhecer ===');
  check('tira protocolo, barra e www', P.normalizarTemporario('http://www.TurboGerais-migra.mpitemporario.com.br/') === 'turbogerais-migra.mpitemporario.com.br');
  check('aceita só o host', P.normalizarTemporario('turbogerais-migra.mpitemporario.com.br') === 'turbogerais-migra.mpitemporario.com.br');
  check('lixo vira vazio', P.normalizarTemporario('não tem') === '' && P.normalizarTemporario('') === '');
  check('é temporário', P.pareceTemporario('https://x-migra.mpitemporario.com.br'));
  check('domínio do cliente não é', !P.pareceTemporario('turbogerais.com.br') && !P.pareceTemporario('mpitemporario.com.br.evil.com'));
  check('link do contrato', P.linkDoContrato({ cliente: '2635', projeto: '2696', contrato: '2710' }) === 'https://idealplus.idealtrends.io/clientes/2635/hub?projeto=2696&contrato=2710&tab=publicacao');

  console.log('\n=== Vários projetos: o temporário escolhe, e para de procurar quando acha ===');
  {
    const f = painelFalso(HP);
    const r = await P.acharContratoNoPainel(f.rodar, { razao: 'HP - CONFECCOES HUMBERTO PASCUINI LTDA', temporario: 'camisashpwork.mpitemporario.com.br', dominio: 'camisas.hpwork.com.br' });
    check('achou o contrato 3817', r.ok && r.contrato.contrato === '3817', JSON.stringify(r));
    check('link com projeto e contrato', r.url === 'https://idealplus.idealtrends.io/clientes/3155/hub?projeto=3798&contrato=3817&tab=publicacao', r.url);
    check('diz que foi conferido pelo temporário', r.conferidoPeloTemporario === true);
    check('abriu primeiro o projeto com o nome do domínio', f.chamadas.find((c) => c[0] === 'contratos')[1] === '3798', JSON.stringify(f.chamadas));
    check('não abriu os outros projetos (cada um custa ~20s)', f.chamadas.filter((c) => c[0] === 'contratos').length === 1, JSON.stringify(f.chamadas));
    check('buscou pela razão social', f.chamadas[0][1] === 'HP - CONFECCOES HUMBERTO PASCUINI LTDA');
  }

  console.log('\n=== Temporário que não bate com nenhum: não escolhe e lista o que viu ===');
  {
    const f = painelFalso(HP);
    const r = await P.acharContratoNoPainel(f.rodar, { razao: 'HP', temporario: 'outro.mpitemporario.com.br', dominio: 'x.com.br' });
    check('não achou', !r.ok && /nenhum contrato com o temporário outro\.mpitemporario\.com\.br/.test(r.erro), JSON.stringify(r));
    check('lista os três contratos com os temporários', r.lista.length === 3 && r.lista.some((l) => /3817: camisashpwork/.test(l)) && r.lista.some((l) => /3818: sem site temporário/.test(l)), JSON.stringify(r.lista));
  }

  console.log('\n=== Sem temporário na planilha ===');
  {
    const r = await P.acharContratoNoPainel(painelFalso(HP).rodar, { razao: 'HP', temporario: '', dominio: 'camisas.hpwork.com.br' });
    check('vários contratos: não chuta, pede o temporário', !r.ok && /3 contratos .* sem link temporário/.test(r.erro), JSON.stringify(r));
    const turbo = painelFalso({
      clientes: [{ id: '2635', empresa: 'TURBO GERAIS COMERCIO LTDA', contratos: 1 }],
      projetos: { 2635: [{ projeto: '2696', nome: 'TURBO GERAIS COMERCIO LTDA' }] },
      contratos: { 2696: ['2710'] },
      sites: { 2710: { temporario: 'http://turbogeraiscomerciol-migra.mpitemporario.com.br', producao: 'https://turbogerais.com.br' } },
    });
    const r2 = await P.acharContratoNoPainel(turbo.rodar, { razao: 'TURBO GERAIS COMERCIO LTDA', temporario: '', dominio: 'turbogerais.com.br' });
    check('um cliente, um contrato: usa, avisando que não conferiu', r2.ok && r2.contrato.contrato === '2710' && r2.conferidoPeloTemporario === false, JSON.stringify(r2));
  }

  console.log('\n=== Busca do cliente ===');
  {
    const r1 = await P.acharContratoNoPainel(painelFalso({ clientes: [] }).rodar, { razao: 'NINGUÉM LTDA', temporario: 'x.mpitemporario.com.br' });
    check('nenhum cliente', !r1.ok && /nenhum cliente no painel com "NINGUÉM LTDA"/.test(r1.erro));
    const muitos = Array.from({ length: 8 }, (_, i) => ({ id: String(i), empresa: `EMPRESA ${i}` }));
    const r2 = await P.acharContratoNoPainel(painelFalso({ clientes: muitos }).rodar, { razao: 'EMPRESA', temporario: 'x.mpitemporario.com.br' });
    check('busca larga demais: para e pede a razão social certa', !r2.ok && /trouxe 8 clientes/.test(r2.erro), JSON.stringify(r2));
    const dois = painelFalso({
      clientes: [{ id: '1', empresa: 'ACME LTDA' }, { id: '2', empresa: 'ACME LTDA ME' }],
      projetos: { 1: [{ projeto: '10', nome: 'acme.com.br' }], 2: [{ projeto: '20', nome: 'acme2.com.br' }] },
      contratos: { 10: ['100'], 20: ['200'] },
      sites: { 100: { temporario: 'acme.mpitemporario.com.br' }, 200: { temporario: 'acme2.mpitemporario.com.br' } },
    });
    const r3 = await P.acharContratoNoPainel(dois.rodar, { razao: 'acme ltda', temporario: '', dominio: 'acme.com.br' });
    check('nome idêntico desempata a busca', r3.ok && r3.contrato.contrato === '100', JSON.stringify(r3));
    const r4 = await P.acharContratoNoPainel(painelFalso({}).rodar, { razao: '  ', temporario: 'x' });
    check('sem razão social', !r4.ok && /sem razão social/.test(r4.erro));
  }

  console.log('\n=== Os scripts de dentro da página são JavaScript válido ===');
  {
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    for (const [nome, s] of [['busca', P.JS_BUSCAR_CLIENTES('A "B" \' C')], ['projetos', P.JS_PROJETOS_DO_CLIENTE('1')], ['contratos', P.JS_CONTRATOS_DO_PROJETO('1', '2')], ['site', P.JS_SITE_DO_CONTRATO('1', '2', '3')]]) {
      let ok = true;
      try { new AsyncFunction(s); } catch (e) { ok = false; }
      check(`script ${nome}`, ok);
    }
    const js = P.JS_CONTRATOS_DO_PROJETO('1', '3799');
    const re = new AsyncFunction(`${js.match(/const p = [^;]+;/)[0]} ${js.match(/const re = .*?'g'\);/)[0]} return re;`);
    const rx = await re();
    const html = '<a href="https://idealplus.idealtrends.io/clientes/1/hub?projeto=3799&amp;contrato=3818">';
    check('a regex dos contratos acha o link com &amp;', [...html.matchAll(rx)].map((m) => m[1]).join() === '3818');
  }

  console.log('\n=== Renderer: planilha com a coluna do temporário ===');
  const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');
  const recorta = (a, b) => { const i = app.indexOf(a); const f = app.indexOf(b, i); if (i < 0 || f < 0) throw new Error('não achei ' + a); return app.slice(i, f); };
  const A = new Function([
    `const PAINEL_MPI_HOST = 'idealplus.idealtrends.io';`,
    recorta('function normalizePainelUrl(', '\nfunction brandHasBitbucket('),
    recorta('function normalizeDomain(', '\nfunction panelIdForBrand('),
    recorta('const BULK_PAPEIS = {', '\n// Da planilha crua para a lista de sites'),
    'let bulkLinhas = [], bulkMapa = null, bulkTemCabecalho = false;',
    recorta('function bulkMontarLinhas()', '\nconst BULK_STATUS'),
    `return { montar: (l) => { bulkLinhas = l; bulkTemCabecalho = bulkDetectarCabecalho(l); bulkMapa = bulkDetectarColunas(l, bulkTemCabecalho); return { mapa: bulkMapa, ...bulkMontarLinhas() }; } };`,
  ].join('\n\n'))();
  {
    const r = A.montar([
      ['Razão social', 'Domínio', 'Link temporário'],
      ['TURBO GERAIS COMERCIO LTDA', 'turbogerais.com.br', 'http://turbogeraiscomerciol-migra.mpitemporario.com.br'],
      ['HP - CONFECCOES HUMBERTO PASCUINI LTDA', 'camisas.hpwork.com.br', 'camisashpwork.mpitemporario.com.br'],
    ]);
    check('reconhece a coluna do temporário e não a confunde com o domínio', r.mapa.temporario === 2 && r.mapa.dominio === 1, JSON.stringify(r.mapa));
    const t = r.rows[0];
    check('sem link do painel mas com razão social: vai procurar', t.painelAchar === true && t.painelOk === false && t.temporario === 'turbogeraiscomerciol-migra.mpitemporario.com.br', JSON.stringify(t));
    check('o detalhe diz que vai procurar e conferir', /procurar pela razão social e conferir o temporário/.test(t.detalhe), t.detalhe);
    const s = A.montar([['X LTDA', 'x.com.br', 'x-migra.mpitemporario.com.br'], ['Y LTDA', 'y.com.br', 'y-migra.mpitemporario.com.br']]);
    check('sem cabeçalho: acha o temporário pelo conteúdo', s.mapa.temporario === 2 && s.mapa.dominio === 1 && s.mapa.razao === 0, JSON.stringify(s.mapa));
    const sem = A.montar([['Domínio'], ['z.com.br']]);
    check('sem razão social e sem link: não procura', sem.rows[0].painelAchar === false && /sem razão social para procurar/.test(sem.rows[0].detalhe), JSON.stringify(sem.rows[0]));
  }

  console.log('\n=== Renderer: a planilha do print (23/09) ===');
  {
    const r = A.montar([
      ['Razão Social', 'Domínio', 'Link Temporario'],
      ['LMARQUES REVESTIMENTOS E PINTURAS LTDA', 'lmarquesrevestimentos.com.br', 'http://httplmarquesrevestimento-migra.mpitemporario.com.br/'],
      ['LIDAR TOPOGRAFIA E ESCANEAMENTO 3D LTDA', 'lidartopografia.com.br', 'http://lidartopografia-migra.mpitemporario.com.br/'],
      ['TURBO GERAIS COMERCIO LTDA', 'turbogerais.com.br', 'http://turbogeraiscomerciol-migra.mpitemporario.com.br/'],
      ['M RIBEIRO CONTABILIDADE', 'somaecontabilidade.mpitemporario.com.br', 'http://somaecontabilidade-migra.mpitemporario.com.br/'],
      ['V DOS S OLIVEIRA', 'neesquadriasdealuminio.com.br', 'https://neesquadriasdealuminio.com.br/sobre/'],
    ]);
    check('reconhece as três colunas, sem o link do painel', r.mapa.razao === 0 && r.mapa.dominio === 1 && r.mapa.temporario === 2 && r.mapa.painel === -1, JSON.stringify(r.mapa));
    check('as linhas boas vão procurar no painel', ['lidartopografia.com.br', 'turbogerais.com.br'].every((d) => r.rows.find((x) => x.dominio === d)?.painelAchar), JSON.stringify(r.rows.map((x) => x.dominio)));
    check('temporário na coluna do domínio: fica de fora e avisa', !r.rows.some((x) => /mpitemporario/.test(x.dominio)) && r.erros.some((e) => /linha 5: .*é o endereço temporário/.test(e)), JSON.stringify(r.erros));
    const nee = r.rows.find((x) => x.dominio === 'neesquadriasdealuminio.com.br');
    check('site do cliente na coluna do temporário: ignora e avisa', nee && nee.temporario === '' && r.erros.some((e) => /linha 6: .*não é um link temporário/.test(e)), JSON.stringify(r.erros));
    check('"httpl…" colado no temporário: avisa', r.erros.some((e) => /linha 2: .*"http" colado/.test(e)), JSON.stringify(r.erros));
    check('temporário normal não gera aviso', !r.erros.some((e) => /linha [34]:/.test(e)), JSON.stringify(r.erros));
  }

  console.log('\n=== Renderer: o contrato é conferido antes de mexer em qualquer coisa ===');
  {
    const montar = (api) => new Function('api', `
      const logs = []; const log = (m, t) => logs.push({ m, t }); const withBusy = (_r, fn) => fn();
      const window = { api }; const normalizePainelUrl = (u) => u;
      ${recorta('const DOMINIO_TEMPORARIO =', '\nconst pareceDominio')}
      ${recorta('async function garantirLinkDoPainel(row)', '\n// O site está publicado, mas o vínculo')}
      return { garantirLinkDoPainel, conferirTemporario, logs };`)(api);
    const achou = montar({ acharContratoNoPainel: async (p) => ({ ok: true, url: 'https://idealplus.idealtrends.io/clientes/1/hub?projeto=2&contrato=3&tab=publicacao', conferidoPeloTemporario: true, log: [], p }) });
    const row = { razao: 'X', dominio: 'x.com.br', temporario: 'x.mpitemporario.com.br', painelAchar: true, painelOk: false };
    await achou.garantirLinkDoPainel(row);
    check('guarda o link achado na linha', row.painelOk && /contrato=3/.test(row.painel) && row.painelAchado === row.painel && row.painelConferido);

    const naoAchou = montar({ acharContratoNoPainel: async () => ({ ok: false, error: 'nenhum contrato com o temporário x', log: [] }) });
    let erro = null;
    try { await naoAchou.garantirLinkDoPainel({ razao: 'X', painelAchar: true, painelOk: false }); } catch (e) { erro = e.message; }
    check('não achou: a linha falha (antes do DNS)', /painel: nenhum contrato/.test(erro || ''), erro);

    let lidos = 0;
    const comLink = montar({ publicarPainel: async () => { lidos++; return { ok: true, estado: { urlTemporaria: 'http://outro.mpitemporario.com.br' }, log: [] }; } });
    erro = null;
    try { await comLink.garantirLinkDoPainel({ dominio: 'x.com.br', painel: 'u', painelOk: true, temporario: 'x.mpitemporario.com.br' }); } catch (e) { erro = e.message; }
    check('link da planilha em outro contrato: para e explica', /outro\.mpitemporario\.com\.br.*planilha diz x\.mpitemporario\.com\.br/.test(erro || ''), erro);
    const certo = montar({ publicarPainel: async () => ({ ok: true, estado: { urlTemporaria: 'http://x.mpitemporario.com.br/' }, log: [] }) });
    const r2 = { dominio: 'x.com.br', painel: 'u', painelOk: true, temporario: 'x.mpitemporario.com.br' };
    await certo.garantirLinkDoPainel(r2);
    check('link da planilha no contrato certo: segue', r2.painelConferido === true);
    lidos = 0;
    await comLink.garantirLinkDoPainel({ dominio: 'x.com.br', painel: 'u', painelOk: true, temporario: '' });
    check('link sem temporário na planilha: nem abre para conferir', lidos === 0);
  }

  console.log('\n=== Publicar MPI+: acha o painel antes de começar, fecha a tarefa no fim ===');
  {
    const montarPub = (api, pub, respostas = []) => new Function('api', 'pub', 'respostas', `
      const logs = []; const log = (m, t) => logs.push({ m, t }); const withBusy = (_r, fn) => fn();
      const perguntas = [];
      const perguntarTextoNoTerminal = async (msg, o) => { perguntas.push({ msg, erro: respostas.length ? o.validar(respostas[0] || '') : '' }); return respostas.length ? respostas.shift() : null; };
      const logTudo = (res) => { if (res && res.log) for (const e of res.log) log(e.message, e.type); };
      const window = { api }; const document = { getElementById: () => null };
      const PAINEL_MPI_HOST = 'idealplus.idealtrends.io';
      ${recorta('function normalizePainelUrl(', '\nfunction brandHasBitbucket(')}
      ${recorta('const DOMINIO_TEMPORARIO =', '\nconst pareceDominio')}
      const avancos = [];
      const pubAvancar = (id, ok, detalhe, extra = {}) => avancos.push({ id, ok, detalhe, ...extra });
      const conferirApontamentoDeProducao = async () => (api.apontamento ? api.apontamento() : { pronto: true, ip: '149.18.102.39' });
      const pubVerificarScPendente = async () => { if (api.verificarSc) await api.verificarSc(pub); };
      ${recorta('async function pubGarantirPainel()', '\n// O encadeamento:')}
      ${recorta('async function pubEtapaSalesforce()', '\nasync function pubEtapaPlanilha()')}
      return { pubGarantirPainel, pubEtapaSalesforce, logs, avancos, pub, perguntas };`)(api, pub, respostas);

    let pedido = null;
    const m1 = montarPub({ acharContratoNoPainel: async (p) => { pedido = p; return { ok: true, url: 'https://idealplus.idealtrends.io/clientes/2600/hub?projeto=2656&contrato=2670&tab=publicacao', conferidoPeloTemporario: true, log: [] }; } },
      { dominio: 'lmarquesrevestimentos.com.br', razao: 'LMARQUES REVESTIMENTOS E PINTURAS LTDA', temporario: 'http://httplmarquesrevestimento-migra.mpitemporario.com.br', painelUrl: '' });
    check('sem link do painel: procura e guarda o link achado', (await m1.pubGarantirPainel()) === true && /contrato=2670/.test(m1.pub.painelUrl) && m1.pub.painelConferido === m1.pub.painelUrl);
    check('manda razão social, temporário e domínio', pedido.razao === 'LMARQUES REVESTIMENTOS E PINTURAS LTDA' && pedido.temporario === 'httplmarquesrevestimento-migra.mpitemporario.com.br' && pedido.dominio === 'lmarquesrevestimentos.com.br', JSON.stringify(pedido));
    let chamou = 0;
    m1.pub.painelConferido = m1.pub.painelUrl;
    const m1b = montarPub({ acharContratoNoPainel: async () => { chamou++; return { ok: false }; } }, m1.pub);
    check('continuando depois do DNS: não procura de novo', (await m1b.pubGarantirPainel()) === true && chamou === 0);

    const naoAcha = async () => ({ ok: false, error: 'nenhum contrato com o temporário x.mpitemporario.com.br', log: [] });
    const m2 = montarPub({ acharContratoNoPainel: naoAcha }, { dominio: 'x.com.br', razao: 'X', temporario: 'x.mpitemporario.com.br', painelUrl: '' });
    check('não achou: pede o link no terminal, com o motivo', (await m2.pubGarantirPainel()) === false && /Não achei o contrato de x\.com\.br no painel \(nenhum contrato com o temporário/.test(m2.perguntas[0]?.msg || ''), JSON.stringify(m2.perguntas));
    check('cancelou: não começa', m2.logs.some((l) => /não comecei nada/.test(l.m)));

    const LINK = 'https://idealplus.idealtrends.io/clientes/9/hub?projeto=8&contrato=7';
    const m2b = montarPub({ acharContratoNoPainel: naoAcha, publicarPainel: async () => ({ ok: true, estado: { urlTemporaria: 'http://x.mpitemporario.com.br' }, log: [] }) },
      { dominio: 'x.com.br', razao: 'X', temporario: 'x.mpitemporario.com.br', painelUrl: '' }, [LINK]);
    check('colou o link: confere o temporário e segue por ele', (await m2b.pubGarantirPainel()) === true && m2b.pub.painelUrl === LINK && m2b.pub.painelConferido === LINK && m2b.pub.painelAchado === false, JSON.stringify(m2b.pub));

    let leituras = 0;
    const m2c = montarPub({ acharContratoNoPainel: naoAcha, publicarPainel: async () => { leituras++; return { ok: true, estado: { urlTemporaria: leituras === 1 ? 'http://outro.mpitemporario.com.br' : 'http://x.mpitemporario.com.br' }, log: [] }; } },
      { dominio: 'x.com.br', razao: 'X', temporario: 'x.mpitemporario.com.br', painelUrl: '' }, [LINK, LINK.replace('contrato=7', 'contrato=6')]);
    check('link colado de outro contrato: pergunta de novo dizendo por quê', (await m2c.pubGarantirPainel()) === true && /Esse link não serve: .*outro\.mpitemporario/.test(m2c.perguntas[1]?.msg || '') && /contrato=6/.test(m2c.pub.painelUrl), JSON.stringify(m2c.perguntas));

    const m2d = montarPub({ acharContratoNoPainel: naoAcha }, { dominio: 'x.com.br', razao: 'X', temporario: '', painelUrl: '' }, ['https://outrosite.com/x']);
    const erroValidar = await (async () => { await m2d.pubGarantirPainel().catch(() => {}); return m2d.perguntas[0]?.erro; })();
    check('o campo recusa link que não é do painel', /não é do idealplus/.test(erroValidar || ''), erroValidar);

    const m3 = montarPub({}, { dominio: 'x.com.br', razao: '', temporario: '', painelUrl: '' });
    check('sem razão social: pede o link direto', (await m3.pubGarantirPainel()) === false && /sem razão social para procurar/.test(m3.perguntas[0]?.msg || ''), JSON.stringify(m3.perguntas));
    const m4 = montarPub({}, { dominio: 'x.com.br', razao: 'X', temporario: 'https://x.com.br/sobre', painelUrl: '' });
    check('temporário que não é do mpitemporario: recusa', (await m4.pubGarantirPainel()) === false && m4.logs.some((l) => /não é um link temporário/.test(l.m)));
    const m5 = montarPub({ acharContratoNoPainel: naoAcha, publicarPainel: async () => ({ ok: true, estado: { urlTemporaria: 'http://outro-migra.mpitemporario.com.br' }, log: [] }) }, { dominio: 'x.com.br', razao: 'X', temporario: 'x-migra.mpitemporario.com.br', painelUrl: 'https://idealplus.idealtrends.io/clientes/1/hub?projeto=2' });
    check('link que veio pronto, de outro contrato: não usa e pede outro', (await m5.pubGarantirPainel()) === false && m5.logs.some((l) => /é outro contrato/.test(l.m)) && m5.perguntas.length === 1);
    const m6 = montarPub({ publicarPainel: async () => ({ ok: true, estado: { urlTemporaria: 'http://x-migra.mpitemporario.com.br' }, log: [] }) }, { dominio: 'x.com.br', razao: 'X', temporario: 'x-migra.mpitemporario.com.br', painelUrl: 'https://idealplus.idealtrends.io/clientes/1/hub?projeto=2' });
    check('link colado do contrato certo: segue', (await m6.pubGarantirPainel()) === true);

    let opcoes = null;
    const s1 = montarPub({ salesforceFecharTarefa: async (o) => { opcoes = o; return { ok: true, assumido: 'sim', concluido: 'Completed', comentado: { pessoa: 'Rian Silva' }, log: [] }; } }, { sfTarefa: 'https://x.lightning.force.com/lightning/r/Task/00TbL00000avlK5UAI/view' });
    await s1.pubEtapaSalesforce();
    check('fecha a tarefa: assume, conclui e comenta', opcoes && opcoes.assumir && opcoes.concluir && opcoes.comentar && opcoes.texto === 'Site publicado', JSON.stringify(opcoes));
    check('a etapa diz o que fez', s1.avancos[0]?.ok && /assumida, concluída, comentário marcando Rian Silva/.test(s1.avancos[0].detalhe), JSON.stringify(s1.avancos));
    const s2 = montarPub({ salesforceFecharTarefa: async () => { throw new Error('não devia chamar'); } }, { sfTarefa: '' });
    await s2.pubEtapaSalesforce();
    check('sem link da tarefa: pula', s2.avancos[0]?.pulada === true);
    const s3 = montarPub({ salesforceFecharTarefa: async () => ({ ok: false, precisaReconectar: true, error: '403', log: [] }) }, { sfTarefa: 'link' });
    let e3 = null; try { await s3.pubEtapaSalesforce(); } catch (e) { e3 = e.message; }
    check('403: falha pedindo para reconectar (dá para tentar de novo)', /reconecte/.test(e3 || ''), e3);

    // ADR-101: a tarefa só fecha com tudo concluído.
    let fechou = false;
    const fechar = async () => { fechou = true; return { ok: true, assumido: 'sim', concluido: 'Completed', comentado: { pessoa: 'Julia Rocha' }, log: [] }; };
    const a1 = montarPub({ salesforceFecharTarefa: fechar }, { sfTarefa: 'link', sslAdiado: { ate: 1 }, feitas: {} });
    await a1.pubEtapaSalesforce();
    check('SSL esperando a propagação: não fecha, fica para depois dele', !fechou && a1.pub.sfAdiado === true && a1.avancos[0]?.pulada, JSON.stringify(a1.avancos));

    fechou = false;
    let pediuSsl = 0;
    const a2 = montarPub({ salesforceFecharTarefa: fechar, publicarPainel: async (o) => { pediuSsl++; return o.etapa === 'ssl' ? { ok: true, estado: { sslAtivo: true }, log: [] } : { ok: false }; }, verificarSc: async (p) => { p.scPendente = false; } },
      { sfTarefa: 'link', dominio: 'srengenharia.seg.br', painelUrl: 'https://idealplus.idealtrends.io/clientes/1/hub?projeto=2', sslPendente: 'o painel respondeu 504', scPendente: true, feitas: {} });
    await a2.pubEtapaSalesforce();
    check('SSL pendente e o domínio aponta: tenta o SSL, faz o Search Console e só então fecha', pediuSsl === 1 && a2.pub.sslPendente === null && a2.pub.scPendente === false && fechou, JSON.stringify({ pediuSsl, s: a2.pub.sslPendente, sc: a2.pub.scPendente, fechou }));

    fechou = false;
    const a3 = montarPub({ salesforceFecharTarefa: fechar, publicarPainel: async () => ({ ok: false, error: 'o SSL não ficou ativo: srengenharia.seg.br ainda entrega o certificado é de srv-wp-02', log: [] }) },
      { sfTarefa: 'link', dominio: 'srengenharia.seg.br', painelUrl: 'https://idealplus.idealtrends.io/clientes/1/hub?projeto=2', sslPendente: 'x', scPendente: true, feitas: {} });
    let e4 = null; try { await a3.pubEtapaSalesforce(); } catch (e) { e4 = e.message; }
    check('SSL continua sem sair: não fecha e diz o que falta', !fechou && /não fechei a tarefa: falta o SSL de produção \(o SSL não ficou ativo.*\) e a verificação do Search Console/.test(e4 || ''), e4);

    fechou = false;
    const a4 = montarPub({ salesforceFecharTarefa: fechar, apontamento: async () => ({ pronto: false, motivo: 'ainda aponta para 1.2.3.4' }) },
      { sfTarefa: 'link', dominio: 'x.com.br', sslPendente: 'x', feitas: {} });
    let e5 = null; try { await a4.pubEtapaSalesforce(); } catch (e) { e5 = e.message; }
    check('domínio ainda não aponta: nem pede o SSL, e não fecha', !fechou && /ainda aponta para 1\.2\.3\.4/.test(e5 || ''), e5);
  }

  console.log('\n=== Publicar MPI+: tags antes do SSL não travam (ADR-100) ===');
  {
    const montarTags = (pub, { verificar }) => new Function('pub', 'verificar', `
      const logs = []; const log = (m, t) => logs.push({ m, t }); const withBusy = (_r, fn) => fn();
      const logTudo = () => {}; const state = { googleSaPath: 'sa.json' };
      const normalizePainelUrl = (u) => u; const pubPrecisaPainel = () => true;
      const window = { api: { createGoogleProject: async () => ({ ok: true, result: { idAnalytics: 'G-1', tagmanager: 'GTM-1', siteUrl: 'https://x.com.br/' } }) } };
      const chamadas = [];
      const verificarScERelatorio = async () => { chamadas.push('verificar'); return verificar(); };
      const publicarMpiPlus = async (v, b, o) => { chamadas.push(o.semVerificar ? 'integracoes' : 'integracoes+verificar'); return o.semVerificar ? { ok: true, scAdiado: true } : verificar(); };
      const avancos = []; const pubAvancar = (id, ok, detalhe) => avancos.push({ id, ok, detalhe });
      ${recorta('async function pubEtapaTags()', '\n// Do "Criar propriedades"')}
      return { pubEtapaTags, pubVerificarScPendente, logs, avancos, chamadas, pub };`)(pub, verificar);

    const adiado = montarTags({ dominio: 'x.com.br', painelUrl: 'u', empresa: 'bc', feitas: { ssl: { ok: true, pulada: true } }, sslAdiado: { ate: 1 } }, { verificar: async () => ({ ok: true }) });
    await adiado.pubEtapaTags();
    check('SSL adiado: só as integrações, sem verificar', adiado.chamadas.join() === 'integracoes' && adiado.pub.scPendente === true, adiado.chamadas.join());
    check('a etapa das tags termina bem, avisando do Search Console', adiado.avancos[0]?.ok && /Search Console depois do SSL/.test(adiado.avancos[0].detalhe), JSON.stringify(adiado.avancos));
    await adiado.pubVerificarScPendente();
    check('depois do SSL: verifica e limpa a pendência', adiado.chamadas.join() === 'integracoes,verificar' && adiado.pub.scPendente === false, adiado.chamadas.join());

    const ativo = montarTags({ dominio: 'x.com.br', painelUrl: 'u', empresa: 'bc', feitas: { ssl: { ok: true } } }, { verificar: async () => ({ ok: false, sslPendente: true, error: 'o HTTPS ainda não tem o certificado' }) });
    await ativo.pubEtapaTags();
    check('SSL dado como ativo mas o certificado não saiu: não trava, fica pendente', ativo.avancos[0]?.ok && ativo.pub.scPendente === true, JSON.stringify(ativo.avancos));

    const outro = montarTags({ dominio: 'x.com.br', painelUrl: 'u', empresa: 'bc', feitas: { ssl: { ok: true } } }, { verificar: async () => ({ ok: false, error: 'não achei a tag' }) });
    let e = null; try { await outro.pubEtapaTags(); } catch (x) { e = x.message; }
    check('outro erro do Search Console continua parando a etapa', /não achei a tag/.test(e || ''), e);
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
