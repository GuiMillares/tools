// Teste do motor de template do GTM (ADR-015) contra uma API do Tag Manager
// simulada. Não toca em rede: carrega o main.js num contexto onde `electron` e
// `googleapis` são dublês, e chama applyGtmTemplate direto.
//
//     node tools/test-gtm-template.js
//
// Verifica o que só dá pra errar em silêncio: o de-para de triggers, o
// built-in "All Pages" passando sem tradução, a troca do nome da variável de
// medição dentro dos parâmetros, os campos do servidor sendo removidos, e a
// tolerância a falha item a item.

const path = require('path');
const Module = require('module');

// ---------- dublês ----------

const handlers = {};

const electronStub = {
  app: { getPath: () => '/tmp/hub-test', whenReady: () => ({ then: () => ({}) }), on() {} },
  BrowserWindow: Object.assign(function () {}, { getAllWindows: () => [] }),
  ipcMain: { handle(nome, fn) { handlers[nome] = fn; } },
  safeStorage: { isEncryptionAvailable: () => false },
  clipboard: { writeText() {} },
};

// O google é um dublê mutável: cada teste injeta as respostas que quer.
const googleFake = {
  auth: {
    GoogleAuth: function () {
      this.getClient = async () => ({});
    },
    OAuth2: function () {
      this.setCredentials = () => {};
      this.on = () => {};
      this.generateAuthUrl = () => 'https://exemplo';
      this.getToken = async () => ({ tokens: {} });
    },
  },
  options() {},
  analyticsadmin: () => googleFake._analyticsadmin,
  tagmanager: () => googleFake._tagmanager,
  _analyticsadmin: null,
  _tagmanager: null,
};
const googleStub = { google: googleFake };

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronStub;
  if (request === 'googleapis') return googleStub;
  return originalLoad(request, parent, isMain);
};

// O main.js registra handlers e não exporta nada — carregamos e pescamos as
// funções pelo escopo do módulo via reexecução controlada.
const fs = require('fs');
const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const factory = new Function(
  'require', 'module', 'exports', '__dirname', '__filename',
  src + `
  ;module.exports = { applyGtmTemplate, loadGtmTemplate, findMeasurementVariable, stripGtmServerFields, remapGtmParameters, SEARCH_SCOPE, searchScopeFilter, GTM_TEMPLATES, BRANDS, brandFilter, describeVisibleAccounts, normalizeName, extractSiteVerificationToken, applyGeralValues, createApiPacer, isQuotaError };`
);
const mod = { exports: {} };
factory(require, mod, mod.exports, path.join(__dirname, '..'), path.join(__dirname, '..', 'main.js'));
const M = mod.exports;

// ---------- API simulada ----------

function makeFakeTagManager(opts = {}) {
  const chamadas = { builtIn: [], variables: [], triggers: [], tags: [] };
  let proximoTriggerId = 100;
  let contadorCota = 0;

  const ws = {
    built_in_variables: {
      create: async ({ parent, type }) => {
        if (opts.builtInLoteFalha && type.length > 1) throw new Error('lote recusado');
        for (const t of type) {
          if (opts.builtInInvalido === t) throw new Error(`tipo inválido: ${t}`);
          chamadas.builtIn.push({ parent, type: t });
        }
        return { data: {} };
      },
    },
    variables: {
      create: async ({ parent, requestBody }) => {
        chamadas.variables.push(requestBody);
        return { data: { ...requestBody, variableId: '900' } };
      },
    },
    triggers: {
      create: async ({ parent, requestBody }) => {
        if (opts.triggerQueFalha && requestBody.name === opts.triggerQueFalha) {
          throw new Error('trigger recusado pela API');
        }
        chamadas.triggers.push(requestBody);
        return { data: { ...requestBody, triggerId: String(proximoTriggerId++) } };
      },
    },
    tags: {
      create: async ({ parent, requestBody }) => {
        if (opts.tagQueFalha && requestBody.name === opts.tagQueFalha) {
          throw new Error('tag recusada pela API');
        }
        // Simula o teto por minuto: as N primeiras passam, as seguintes
        // estouram até o "minuto virar" (aqui, até a contagem ser zerada).
        if (opts.cotaApos !== undefined) {
          contadorCota++;
          if (contadorCota > opts.cotaApos) {
            if (opts.cotaLibera) { contadorCota = 0; opts.cotaApos = Infinity; }
            const e = new Error(
              "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute per user' " +
                "of service 'tagmanager.googleapis.com' for consumer 'project_number:966008109207'."
            );
            e.code = 429;
            throw e;
          }
        }
        chamadas.tags.push(requestBody);
        return { data: { ...requestBody, tagId: '800' } };
      },
    },
  };

  return { api: { accounts: { containers: { workspaces: ws } } }, chamadas };
}

// ---------- utilidades ----------

let falhas = 0;
function check(nome, condicao, detalhe = '') {
  const ok = !!condicao;
  if (!ok) falhas++;
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${nome}${detalhe && !ok ? ' → ' + detalhe : ''}`);
}

async function roda(brand, opts = {}, measurementId = 'G-NOVO123ABC') {
  const { api, chamadas } = makeFakeTagManager(opts);
  const logs = [];
  const push = (message, type = 'info') => logs.push({ message, type });
  const modelo = M.loadGtmTemplate(brand);
  const resumo = await M.applyGtmTemplate({
    tagmanager: api,
    workspacePath: 'accounts/1/containers/2/workspaces/3',
    containerVersion: modelo.containerVersion,
    measurementId,
    push,
    // Sem espera no teste — opt-out explícito, não silencioso. Com o ritmo
    // real, as 32 chamadas da MPI levariam mais de um minuto aqui.
    paced: M.createApiPacer(push, { minIntervalMs: 0, backoff: opts.backoff || [] }),
  });
  return { resumo, chamadas, logs, modelo };
}

// ---------- casos ----------

(async () => {
  console.log('\n=== Busca Cliente (caso mínimo: 1 tag, 0 triggers próprios) ===');
  {
    const { resumo, chamadas } = await roda('bc');
    check('1 tag criada', chamadas.tags.length === 1, `veio ${chamadas.tags.length}`);
    check('nenhum trigger próprio', chamadas.triggers.length === 0);
    check('1 variável criada', chamadas.variables.length === 1);
    check('nenhuma embutida', chamadas.builtIn.length === 0);

    const v = chamadas.variables[0];
    check('variável renomeada para o Measurement ID novo', v.name === 'G-NOVO123ABC', v.name);
    check('valor da variável é o ID novo', v.parameter.find((p) => p.key === 'value').value === 'G-NOVO123ABC');

    const tag = chamadas.tags[0];
    check(
      'tagId da tag aponta para a variável nova',
      tag.parameter.find((p) => p.key === 'tagId').value === '{{G-NOVO123ABC}}',
      tag.parameter.find((p) => p.key === 'tagId').value
    );
    check(
      'trigger built-in All Pages preservado sem tradução',
      JSON.stringify(tag.firingTriggerId) === JSON.stringify(['2147479553']),
      JSON.stringify(tag.firingTriggerId)
    );
    check('campos do servidor removidos da tag', !('tagId' in tag) && !('fingerprint' in tag) && !('accountId' in tag));
    check('campos do servidor removidos da variável', !('variableId' in v) && !('fingerprint' in v));
    check('sem falhas', resumo.falhas.length === 0, resumo.falhas.join('; '));
  }

  console.log('\n=== MPI Solutions (15 tags, 15 triggers, 10 embutidas) ===');
  {
    const { resumo, chamadas, modelo } = await roda('mpisolutions');
    const cv = modelo.containerVersion;
    check('10 variáveis embutidas habilitadas', chamadas.builtIn.length === 10, String(chamadas.builtIn.length));
    check('CLICK_ID entre as embutidas', chamadas.builtIn.some((b) => b.type === 'CLICK_ID'));
    check('15 triggers criados', chamadas.triggers.length === 15, String(chamadas.triggers.length));
    check('15 tags criadas', chamadas.tags.length === 15, String(chamadas.tags.length));
    check('1 variável criada', chamadas.variables.length === 1);

    // nenhum firingTriggerId pode ter sobrado com um ID do template
    const idsDoTemplate = new Set((cv.trigger || []).map((t) => String(t.triggerId)));
    const vazamento = chamadas.tags.flatMap((t) => t.firingTriggerId || []).filter((id) => idsDoTemplate.has(String(id)));
    check('nenhum ID de trigger do template vazou para as tags', vazamento.length === 0, vazamento.join(','));

    // todos os IDs usados são os novos (>=100) ou o built-in
    const usados = [...new Set(chamadas.tags.flatMap((t) => t.firingTriggerId || []))];
    const validos = usados.every((id) => id === '2147479553' || Number(id) >= 100);
    check('IDs usados são os novos ou o built-in', validos, usados.join(','));

    // a tag com dois triggers ("WhatsApp - Clique - Botão": 20 e 33)
    const doisTriggers = chamadas.tags.find((t) => (t.firingTriggerId || []).length === 2);
    check('tag com dois triggers preservou os dois', !!doisTriggers, 'não achei');

    // nenhuma referência ao nome antigo da variável sobrou
    const antigo = JSON.stringify(chamadas.tags).includes('G-WJDW3KZFT0');
    check('nenhuma referência ao Measurement ID antigo nas tags', !antigo);
    const todosApontam = chamadas.tags
      .filter((t) => t.type === 'gaawe')
      .every((t) => t.parameter.some((p) => p.key === 'measurementIdOverride' && p.value === '{{G-NOVO123ABC}}'));
    check('todo gaawe aponta measurementIdOverride pra variável nova', todosApontam);

    // filtros com {{Click ID}} passam intactos
    const filtro = chamadas.triggers.find((t) => t.name === 'Clique - Telefone').filter[0];
    check(
      'filtro preservado ({{Click ID}} CONTAINS clique_tel)',
      filtro.type === 'CONTAINS' &&
        filtro.parameter[0].value === '{{Click ID}}' &&
        filtro.parameter[1].value === 'clique_tel'
    );
    check('sem falhas', resumo.falhas.length === 0, resumo.falhas.join('; '));
  }

  console.log('\n=== Tolerância a falha (ADR-007: nada trava o programa) ===');
  {
    const { resumo, chamadas, logs } = await roda('mpisolutions', { tagQueFalha: 'Email - Clique' });
    check('as outras 14 tags foram criadas', chamadas.tags.length === 14, String(chamadas.tags.length));
    check('a falha foi registrada', resumo.falhas.some((f) => f.includes('Email - Clique')));
    check('avisada como warn', logs.some((l) => l.type === 'warn' && l.message.includes('Email - Clique')));
  }
  {
    const { resumo, chamadas, logs } = await roda('mpisolutions', { triggerQueFalha: 'Clique - Telefone' });
    check('14 triggers criados', chamadas.triggers.length === 14, String(chamadas.triggers.length));
    check(
      'a tag órfã foi pulada, não criada com ID errado',
      chamadas.tags.length === 14 && !chamadas.tags.some((t) => t.name === 'Telefone - Clique'),
      String(chamadas.tags.length)
    );
    check('o pulo foi avisado', logs.some((l) => l.type === 'warn' && l.message.includes('Telefone - Clique')));
    check('as outras tags seguiram', chamadas.tags.some((t) => t.name === 'Email - Clique'));
  }
  {
    const { chamadas, logs } = await roda('mpisolutions', { builtInLoteFalha: true, builtInInvalido: 'CLICK_URL' });
    check('lote recusado → tenta uma a uma', chamadas.builtIn.length === 9, String(chamadas.builtIn.length));
    check('a inválida foi avisada', logs.some((l) => l.type === 'warn' && l.message.includes('CLICK_URL')));
  }

  console.log('\n=== Filtro de CRIAÇÃO por marca (ADR-017 — nomes reais de conta) ===');
  {
    // Os nomes aqui são os displayName reais confirmados em tela. Nenhum
    // e-mail de login (bcrelatorios*, ferramentasmpisolutions) pode aparecer
    // como nome de conta — era esse o bug.
    const casos = [
      ['bc', 'Busca Cliente 01', true],
      ['bc', 'Busca Cliente 82', true],
      ['bc', 'Busca Cliente REDES', false],       // sem dígito: não é slot de projeto
      ['bc', 'Busca Cliente - MPI+', false],      // é MPI+, não Busca Cliente
      ['bc', 'MPI Solutions', false],
      ['mpisolutions', 'MPI Solutions', true],
      ['mpisolutions', 'Busca Cliente 01', false],
      ['mpisolutions', 'Busca Cliente - MPI+', false],
      ['mpiplus', 'Busca Cliente - MPI+', true],
      ['mpiplus', 'Busca Cliente - MPI+ 02', true],
      ['mpiplus', 'Busca Cliente 01', false],
      ['mpiplus', 'MPI Solutions', false],
    ];
    for (const [marca, conta, esperado] of casos) {
      const f = M.brandFilter(marca);
      check(`criar/${marca}: "${conta}" ${esperado ? 'entra' : 'fica fora'}`, f(conta) === esperado);
    }

    // Nenhum e-mail de login pode casar com nada.
    const logins = ['bcrelatorios', 'bcrelatorios2', 'ferramentasmpisolutions', 'bcrelatoriotags'];
    for (const marca of ['bc', 'mpisolutions', 'mpiplus']) {
      const f = M.brandFilter(marca);
      check(`criar/${marca}: nenhum e-mail de login casa`, logins.every((l) => !f(l)), logins.filter((l) => f(l)).join(','));
    }
  }

  console.log('\n=== Escopo de BUSCA por marca (ADR-016 + ADR-017) ===');
  {
    const casos = [
      ['bc', 'Busca Cliente 01', true],
      ['bc', 'Busca Cliente REDES', true],        // busca é frouxa de propósito
      ['bc', 'Busca Cliente - MPI+', true],
      ['bc', 'Cliente Antigo Ltda', true],
      ['bc', 'MPI Solutions', false],             // única exclusão
      ['mpisolutions', 'MPI Solutions', true],
      ['mpisolutions', 'Busca Cliente 01', false],
      ['mpiplus', 'Busca Cliente - MPI+', true],
      ['mpiplus', 'Busca Cliente 01', false],
      ['mpiplus', 'MPI Solutions', false],
    ];
    for (const [marca, conta, esperado] of casos) {
      const f = M.searchScopeFilter(marca);
      check(`buscar/${marca}: "${conta}" ${esperado ? 'dentro' : 'fora'}`, f(conta) === esperado);
    }
  }

  console.log('\n=== Cota por minuto do Tag Manager (ADR-019) ===');
  {
    const Q = M.isQuotaError;
    const erroReal = new Error(
      "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute per user' " +
        "of service 'tagmanager.googleapis.com' for consumer 'project_number:966008109207'."
    );
    check('reconhece o erro exato que apareceu em produção', Q(erroReal));
    check('reconhece 429', Q(Object.assign(new Error('x'), { code: 429 })));
    check('reconhece RESOURCE_EXHAUSTED', Q({ response: { data: { error: { status: 'RESOURCE_EXHAUSTED' } } }, message: '' }));
    check('não confunde com erro comum', !Q(new Error('403 sem permissão nessa conta')));

    // Estoura depois de 10 tags e libera na retentativa: tem que completar as 15.
    const { resumo, chamadas, logs } = await roda('mpisolutions', {
      cotaApos: 10, cotaLibera: true, backoff: [0],
    });
    check('todas as 15 tags entraram após a pausa', chamadas.tags.length === 15, String(chamadas.tags.length));
    check('nenhuma falha no resumo', resumo.falhas.length === 0, resumo.falhas.join('; '));
    check('a pausa foi avisada', logs.some((l) => l.type === 'warn' && /Cota do Tag Manager estourada/.test(l.message)));
    check('e contada no resumo', resumo.esperasDeCota === 1, String(resumo.esperasDeCota));

    // Sem backoff disponível, a tag falha — mas as outras seguem (ADR-007).
    const semRetry = await roda('mpisolutions', { cotaApos: 10, backoff: [] });
    check('esgotadas as tentativas, vira falha por item', semRetry.chamadas.tags.length === 10, String(semRetry.chamadas.tags.length));
    check('e o container não é abortado', semRetry.resumo.triggers === 15);

    // O aviso de duração aparece só em template grande.
    const grande = await roda('mpisolutions');
    check('avisa quanto tempo vai levar', grande.logs.some((l) => /32 chamadas a fazer/.test(l.message)));
    const pequeno = await roda('bc');
    check('template pequeno não avisa', !pequeno.logs.some((l) => /chamadas a fazer/.test(l.message)));

    // O ritmo real existe e é o seguro por padrão.
    const semOpts = M.createApiPacer(() => {});
    check('pacer padrão tem intervalo seguro (>2s)', semOpts.stats().intervalo >= 2000, String(semOpts.stats().intervalo));
  }

  console.log('\n=== Conta do Tag Manager: recorte diferente do Analytics ===');
  {
    // No Analytics cada marca tem conta própria. No Tag Manager, Busca Cliente
    // e MPI+ DIVIDEM a conta "Busca Cliente - Clientes". É o caso que justifica
    // a superfície existir.
    const casos = [
      // [marca, conta, analytics, gtm]
      ['bc', 'Busca Cliente 01', true, false],
      ['bc', 'Busca Cliente - Clientes', false, true],
      ['bc', 'MPI Solutions', false, false],
      ['mpiplus', 'Busca Cliente - MPI+', true, false],
      ['mpiplus', 'Busca Cliente - Clientes', false, true],
      ['mpiplus', 'Busca Cliente 01', false, false],
      ['mpisolutions', 'MPI Solutions', true, true],
      ['mpisolutions', 'Busca Cliente - Clientes', false, false],
    ];
    for (const [marca, conta, esperadoGa, esperadoGtm] of casos) {
      check(`criar/${marca} · analytics · "${conta}" ${esperadoGa ? 'entra' : 'fora'}`,
        M.brandFilter(marca)(conta) === esperadoGa);
      check(`criar/${marca} · gtm · "${conta}" ${esperadoGtm ? 'entra' : 'fora'}`,
        M.brandFilter(marca, 'gtm')(conta) === esperadoGtm);
    }

    // Busca Cliente e MPI+ resolvem para a MESMA conta de GTM.
    check('bc e mpiplus apontam para a mesma conta no GTM',
      M.brandFilter('bc', 'gtm')('Busca Cliente - Clientes') && M.brandFilter('mpiplus', 'gtm')('Busca Cliente - Clientes'));

    // MPI Solutions não define matchesGtm — o fallback tem que dar o mesmo padrão.
    check('sem matchesGtm, gtm cai no padrão do analytics',
      M.brandFilter('mpisolutions', 'gtm')('MPI Solutions') === M.brandFilter('mpisolutions')('MPI Solutions'));

    // Escopo de busca no GTM
    check('buscar/mpiplus · gtm · acha "Busca Cliente - Clientes"', M.searchScopeFilter('mpiplus', 'gtm')('Busca Cliente - Clientes'));
    check('buscar/mpiplus · analytics · NÃO acha "Busca Cliente - Clientes"', !M.searchScopeFilter('mpiplus')('Busca Cliente - Clientes'));
    check('buscar/bc · gtm · exclui só a MPI Solutions', M.searchScopeFilter('bc', 'gtm')('Busca Cliente - Clientes') && !M.searchScopeFilter('bc', 'gtm')('MPI Solutions'));

    // Nenhum e-mail de login pode casar em nenhuma superfície.
    const logins = ['ferramentasmpisolutions', 'bcrelatoriotags', 'bcrelatorios', 'bcrelatorios2'];
    for (const marca of ['bc', 'mpisolutions', 'mpiplus']) {
      check(`${marca}: login não casa em nenhuma superfície`,
        logins.every((l) => !M.brandFilter(marca)(l) && !M.brandFilter(marca, 'gtm')(l)));
    }
  }

  console.log('\n=== Token do Search Console entra limpo no geral.php ===');
  {
    const T = M.extractSiteVerificationToken;
    const valor = 'sJM3ayPdMd9HBEq8bmUn1p0tVyzlDzaaLxOrmm37Mz0';

    check('tag completa → só o content',
      T(`<meta name="google-site-verification" content="${valor}" />`) === valor);
    check('sem a barra final', T(`<meta name="google-site-verification" content="${valor}">`) === valor);
    check('aspas simples', T(`<meta name='google-site-verification' content='${valor}'>`) === valor);
    check('atributos fora de ordem',
      T(`<meta content="${valor}" name="google-site-verification"/>`) === valor);
    check('espaços em volta do =', T(`<meta name="x" content = "${valor}" />`) === valor);
    check('idempotente: valor já limpo passa direto', T(valor) === valor);
    check('com espaço em volta', T(`  ${valor}  `) === valor);
    check('vazio continua vazio', T('') === '' && T(null) === '' && T(undefined) === '');
    check('markup sem content= não vira lixo no PHP', T('<meta name="google-site-verification" />') === '');

    // e o que realmente importa: o que sai no arquivo
    const php = "$idAnalytics = '';\n$tagmanager = '';\n$googleSearchConsole = '';\n";
    const r = M.applyGeralValues(php, {
      idAnalytics: 'G-DBPWP5G627',
      tagmanager: 'GTM-M5HNVNTZ',
      googleSearchConsole: `<meta name="google-site-verification" content="${valor}" />`,
    });
    check('o geral.php recebe só o valor', r.content.includes(`$googleSearchConsole = '${valor}';`), r.content);
    check('nenhum markup foi parar no PHP', !/<meta|content=|name=/.test(r.content), r.content);
    check('as outras variáveis seguem intactas',
      r.content.includes("$idAnalytics = 'G-DBPWP5G627';") && r.content.includes("$tagmanager = 'GTM-M5HNVNTZ';"));
  }

  console.log('\n=== Painel do cliente ($idProjetoBusca) ===');
  {
    // Trecho fiel ao geral.php real: o painel já vem preenchido do template do
    // repositório, e o valor antigo é de OUTRO cliente — sobrescrever é o certo.
    const php = [
      '// INTERNO',
      "$idProjetoBusca = '24';",
      "$idCliente = '';",
      '',
      '// GOOGLE',
      "$idAnalytics = '';",
      "$tagmanager = '';",
    ].join('\n');

    let r = M.applyGeralValues(php, { idProjetoBusca: '39', idAnalytics: 'G-X' });
    check('grava o painel', r.content.includes("$idProjetoBusca = '39';"), r.content);
    check('conta como sobrescrita', r.overwritten.some((o) => o.key === 'idProjetoBusca' && o.previous === '24'),
      JSON.stringify(r.overwritten));
    check('não encosta no $idCliente', r.content.includes("$idCliente = '';"));

    // Painel em branco: a variável é pulada, e o valor que estava lá fica.
    r = M.applyGeralValues(php, { idProjetoBusca: '', idAnalytics: 'G-X' });
    check('painel vazio não apaga o que existe', r.content.includes("$idProjetoBusca = '24';"), r.content);
    check('e não aparece como aplicada', !r.applied.includes('idProjetoBusca'), r.applied.join());
    check('as outras seguem', r.applied.includes('idAnalytics'));

    // Ordem do relatório: igual à do arquivo, para o log do commit ser legível.
    r = M.applyGeralValues(php, { idProjetoBusca: '39', idAnalytics: 'G-X', tagmanager: 'GTM-Y' });
    check('relatório na ordem do arquivo', r.applied.join() === 'idProjetoBusca,idAnalytics,tagmanager', r.applied.join());
  }

  console.log('\n=== Diagnóstico de "nenhuma conta casou" ===');
  {
    const texto = M.describeVisibleAccounts(['MPI Solutions', 'Busca Cliente 01', 'Busca Cliente REDES']);
    check('lista os nomes reais', texto.includes('"MPI Solutions"') && texto.includes('"Busca Cliente 01"'));
    check('diz quantas são', texto.includes('(3)'));

    // O caso real que a versão anterior errava: a conta procurada NÃO está na
    // lista, e a mensagem só falava do padrão. Tem que enunciar as DUAS
    // hipóteses, sempre, porque quem lê é quem sabe qual delas se aplica.
    check('hipótese 1: padrão errado', /ESTÁ nessa lista.*padrão da marca/is.test(texto));
    check('hipótese 2: falta acesso', /NÃO está.*acesso que falta/is.test(texto));

    const comEmail = M.describeVisibleAccounts(['Busca Cliente - Clientes'], 'a service account hub-bot@x.iam.gserviceaccount.com');
    check('diz QUAL identidade precisa ser adicionada', comEmail.includes('hub-bot@x.iam.gserviceaccount.com'));

    const muitas = M.describeVisibleAccounts(Array.from({ length: 30 }, (_, i) => `Busca Cliente ${i + 1}`));
    check('trunca em 15 e diz quantas sobraram', muitas.includes('e mais 15'), muitas.slice(-40));

    const nenhuma = M.describeVisibleAccounts([], 'a service account hub-bot@x');
    check('sem conta nenhuma → acesso, e nomeia a identidade', /não tem acesso a nada/i.test(nenhuma) && nenhuma.includes('hub-bot@x'));
  }

  console.log('\n=== Verificação ponta a ponta: os 4 cenários do relato ===');
  {
    const saFake = '/tmp/hub-test-sa.json';
    require('fs').writeFileSync(saFake, JSON.stringify({ project_id: 'x', client_email: 'y' }));

    // Contas como o Google realmente devolve.
    const contasReais = [
      { displayName: 'Busca Cliente 01', account: 'accounts/1', name: 'accounts/1', propertySummaries: [{ property: 'properties/1', displayName: 'Busca Cliente 01' }] },
      { displayName: 'Busca Cliente 02', account: 'accounts/2', name: 'accounts/2', propertySummaries: [{ property: 'properties/2', displayName: 'Busca Cliente 02' }] },
      { displayName: 'Busca Cliente REDES', account: 'accounts/3', name: 'accounts/3', propertySummaries: [] },
      { displayName: 'MPI Solutions', account: 'accounts/331619898', name: 'accounts/331619898', propertySummaries: [{ property: 'properties/9', displayName: 'MPI 01' }] },
      { displayName: 'Busca Cliente - MPI+', account: 'accounts/4', name: 'accounts/4', propertySummaries: [] },
    ];

    // (1) Conceder acesso com projeto MPI Solutions lista a conta certa.
    googleFake._analyticsadmin = {
      accounts: { list: async () => ({ data: { accounts: contasReais.map((c) => ({ name: c.name, displayName: c.displayName })) } }) },
    };
    require('fs').writeFileSync('/tmp/hub-test/oauth-token.json', JSON.stringify({ access_token: 'a', refresh_token: 'r', email: 'ferramentasmpisolutions@x' }));
    const r1 = await handlers['analytics:listBrandAccounts'](null, { brand: 'mpisolutions', clientId: 'c', clientSecret: 's' });
    check('(1) MPI Solutions aparece em "Conceder acesso"', r1.ok && r1.accounts.length === 1, JSON.stringify(r1.accounts || r1.error));
    check('(1) com o ID 331619898', r1.accounts?.[0]?.id === '331619898', r1.accounts?.[0]?.id);

    // (3) Busca Cliente traz só as numeradas — sem REDES, sem MPI+.
    const r3 = await handlers['analytics:listBrandAccounts'](null, { brand: 'bc', clientId: 'c', clientSecret: 's' });
    check('(3) só as "Busca Cliente NN"', r3.accounts.length === 2, JSON.stringify(r3.accounts.map((a) => a.displayName)));
    check('(3) sem REDES nem MPI+', !r3.accounts.some((a) => /REDES|MPI/.test(a.displayName)));

    // marca que não casa → devolve a lista de contas visíveis
    const antigo = M.BRANDS.bc.matches;
    M.BRANDS.bc.matches = () => false;
    const r0 = await handlers['analytics:listBrandAccounts'](null, { brand: 'bc', clientId: 'c', clientSecret: 's' });
    check('filtro que não casa devolve hint com os nomes reais', !!r0.hint && r0.hint.includes('"MPI Solutions"'), r0.hint);
    check('e o hint nomeia o login conectado', !!r0.hint && /conta Google conectada/.test(r0.hint), r0.hint);
    M.BRANDS.bc.matches = antigo;

    // (2) Criar propriedades com MPI Solutions acha a conta.
    let criadaEm = null;
    googleFake._analyticsadmin = {
      accountSummaries: { list: async () => ({ data: { accountSummaries: contasReais } }) },
      properties: {
        create: async ({ requestBody }) => { criadaEm = requestBody.parent; return { data: { name: 'properties/999' } }; },
        dataStreams: {
          create: async () => ({ data: { webStreamData: { measurementId: 'G-NOVO' } } }),
          list: async () => ({ data: { dataStreams: [] } }),
        },
      },
    };
    googleFake._tagmanager = { accounts: { list: async () => ({ data: { account: [] } }) } };
    googleFake.recaptchaenterprise = () => ({ projects: { keys: { create: async () => { throw new Error('sem recaptcha no teste'); } } } });
    googleFake.siteVerification = () => ({ webResource: { getToken: async () => { throw new Error('sem sc no teste'); } } });

    const r2 = await handlers['google:createProject'](null, { domain: 'novocliente.com.br', saPath: saFake, brand: 'mpisolutions' });
    check('(2) criar com MPI Solutions não falha no filtro', r2.ok, r2.error);
    check('(2) criou na conta MPI Solutions', criadaEm === 'accounts/331619898', String(criadaEm));

    // (4) Busca varre tudo menos MPI Solutions.
    const varridas = [];
    googleFake._analyticsadmin = {
      accountSummaries: { list: async () => ({ data: { accountSummaries: contasReais } }) },
      properties: { dataStreams: { list: async ({ parent }) => { varridas.push(parent); return { data: { dataStreams: [] } }; } } },
    };
    googleFake._tagmanager = {
      accounts: { list: async () => ({ data: { account: contasReais.map((c) => ({ name: c.displayName, path: c.name })) } }),
        containers: { list: async () => ({ data: { container: [] } }) } },
    };
    await handlers['google:findExisting'](null, { query: 'algumcliente.com.br', saPath: saFake, brand: 'bc' });
    check('(4) varreu Busca Cliente 01 e 02', varridas.includes('properties/1') && varridas.includes('properties/2'));
    check('(4) NÃO varreu a propriedade da MPI Solutions', !varridas.includes('properties/9'), varridas.join(','));
  }

  console.log('\n=== Mapeamento marca → template ===');
  check('bc → busca-cliente', M.GTM_TEMPLATES.bc === 'gtm-busca-cliente.json');
  check('mpisolutions → mpi-solutions', M.GTM_TEMPLATES.mpisolutions === 'gtm-mpi-solutions.json');
  check('mpiplus emprestado, e avisado', M.loadGtmTemplate('mpiplus').borrowedFrom === 'bc');

  console.log('\n=== Busca por domínio no Analytics (ADR-016) ===');
  {
    // Slots genéricos: o NOME nunca é o domínio. Quem carrega o domínio é o
    // defaultUri do data stream — que é exatamente o que o bug antigo ignorava.
    const contas = [
      { displayName: 'Busca Cliente 07', propertySummaries: [
        { property: 'properties/1', displayName: 'Busca Cliente 01' },
        { property: 'properties/2', displayName: 'Busca Cliente 02' },
        { property: 'properties/3', displayName: 'Busca Cliente 03' },
      ]},
      { displayName: 'MPI Solutions', propertySummaries: [
        { property: 'properties/9', displayName: 'MPI 01' },
      ]},
    ];
    const streams = {
      'properties/1': [{ webStreamData: { measurementId: 'G-AAA', defaultUri: 'https://outrocliente.com.br' } }],
      'properties/2': [{ webStreamData: { measurementId: 'G-BBB', defaultUri: 'https://www.clinicasaovicente.com.br' } }],
      'properties/3': [],
      'properties/9': [{ webStreamData: { measurementId: 'G-MPI', defaultUri: 'https://clinicasaovicente.com.br' } }],
    };
    let listadas = 0;
    googleFake._analyticsadmin = {
      accountSummaries: { list: async () => ({ data: { accountSummaries: contas } }) },
      properties: { dataStreams: { list: async ({ parent }) => { listadas++; return { data: { dataStreams: streams[parent] || [] } }; } } },
    };
    googleFake._tagmanager = {
      accounts: {
        list: async () => ({ data: { account: [
          { name: 'Busca Cliente 07', path: 'accounts/1' },
          { name: 'MPI Solutions', path: 'accounts/9' },
        ]}}),
        containers: { list: async ({ parent }) => ({ data: { container: parent === 'accounts/1'
          ? [{ name: 'clinicasaovicente.com.br', publicId: 'GTM-BC1', path: 'p', domainName: [] }]
          : [{ name: 'clinicasaovicente.com.br', publicId: 'GTM-MPI', path: 'p', domainName: [] }] } }) },
      },
    };

    const saFake = '/tmp/hub-test-sa.json';
    require('fs').mkdirSync('/tmp', { recursive: true });
    require('fs').writeFileSync(saFake, JSON.stringify({ project_id: 'x', client_email: 'y' }));

    const r = await handlers['google:findExisting'](null, { query: 'clinicasaovicente.com.br', saPath: saFake, brand: 'bc' });
    check('a busca respondeu ok', r.ok, r.error);
    check('achou pelo domínio do data stream, não pelo nome', r.analytics.length === 1, JSON.stringify(r.analytics.map(a=>a.displayName)));
    check('é a propriedade certa (G-BBB)', r.analytics[0]?.measurementIds[0]?.measurementId === 'G-BBB');
    check('o nome da propriedade é o slot genérico', r.analytics[0]?.displayName === 'Busca Cliente 02');
    check('varreu os data streams das contas no escopo', listadas === 3, String(listadas));
    check('propriedade da MPI ficou fora do escopo do bc', !r.analytics.some((a) => a.account.includes('MPI')));
    check('GTM só da conta no escopo', r.gtm.length === 1 && r.gtm[0].publicId === 'GTM-BC1', JSON.stringify(r.gtm.map(g=>g.publicId)));

    // mesma busca com a marca MPI Solutions: agora só a conta dela
    listadas = 0;
    const r2 = await handlers['google:findExisting'](null, { query: 'clinicasaovicente.com.br', saPath: saFake, brand: 'mpisolutions' });
    check('MPI Solutions varre só a conta dela', listadas === 1, String(listadas));
    check('MPI Solutions acha o G-MPI', r2.analytics[0]?.measurementIds[0]?.measurementId === 'G-MPI');
    check('MPI Solutions acha o GTM dela', r2.gtm.length === 1 && r2.gtm[0].publicId === 'GTM-MPI');

    // busca por pedaço do nome, sem TLD
    const r3 = await handlers['google:findExisting'](null, { query: 'clinicasaovicente', saPath: saFake, brand: 'bc' });
    check('busca sem o TLD também casa', r3.analytics.length === 1);

    // propriedade sem permissão não derruba a busca
    googleFake._analyticsadmin.properties.dataStreams.list = async ({ parent }) => {
      if (parent === 'properties/1') throw new Error('403 sem permissão');
      return { data: { dataStreams: streams[parent] || [] } };
    };
    const r4 = await handlers['google:findExisting'](null, { query: 'clinicasaovicente.com.br', saPath: saFake, brand: 'bc' });
    check('403 numa propriedade não derruba a busca', r4.ok && r4.analytics.length === 1);
    check('e é avisado', r4.log.some((l) => l.type === 'warn' && l.message.includes('sem permissão')));
  }

  console.log(falhas ? `\n${falhas} verificação(ões) falharam\n` : '\nTodas as verificações passaram\n');
  process.exitCode = falhas ? 1 : 0;
})();
