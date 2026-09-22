// O SSL só é pedido depois que o domínio aponta para o servidor de produção
// (ADR-069). Aqui roda o código de verdade — o handler dns:apontando do main e
// o passo de publicação do renderer — com DNS e painel de mentira.
//
//     node tools/test-ssl-apontamento.js

const path = require('path');
const Module = require('module');
const fs = require('fs');

const handlers = {};
const DIR = '/tmp/hub-ssl';
const electronStub = {
  app: { getPath: () => DIR, whenReady: () => ({ then: () => ({}) }), on() {} },
  BrowserWindow: Object.assign(function () { throw new Error('não deveria abrir janela'); }, { getAllWindows: () => [] }),
  ipcMain: { handle(n, f) { handlers[n] = f; } },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => String(b) },
  clipboard: { writeText() {} },
  session: { fromPartition: () => ({ clearStorageData: async () => {} }) },
};

// DNS de mentira: zona[host] = ips, ou um código de erro para "não resolve".
const zona = {};
const dnsStub = {
  promises: {
    Resolver: function () {
      this.resolve4 = async (host) => {
        const v = zona[host];
        if (!v) { const e = new Error('queryA ENOTFOUND'); e.code = 'ENOTFOUND'; throw e; }
        if (typeof v === 'string') { const e = new Error(v); e.code = v; throw e; }
        return v;
      };
    },
    resolveNs: async () => [],
    resolve4: async (h) => zona[h] || [],
  },
};

const orig = Module._load;
Module._load = (r, p, i) =>
  r === 'electron' ? electronStub
  : r === 'googleapis' ? { google: { auth: { GoogleAuth: function () {}, OAuth2: function () {} }, options() {} } }
  : r === 'dns' ? dnsStub
  : orig(r, p, i);

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'main.js'), 'utf-8');
const mod = { exports: {} };
new Function('require', 'module', 'exports', '__dirname', '__filename', src)
  (require, mod, mod.exports, raiz, path.join(raiz, 'main.js'));

// O pedaço do renderer que decide sobre o SSL, com as dependências trocadas.
const app = fs.readFileSync(path.join(raiz, 'renderer', 'app.js'), 'utf-8');
const recorte = (a, b) => {
  const i = app.indexOf(a);
  const f = app.indexOf(b, i);
  if (i < 0 || f < 0) throw new Error('não achei o trecho: ' + a);
  return app.slice(i, f);
};
const trecho = recorte('// Dá para pedir o SSL agora?', '// ---------- Ferramenta: Publicar MPI+');

const linhas = [];
const R = new Function('window', 'log', 'withBusy', 'normalizePainelUrl', 'bulkSslPendentes', 'bulkSslAtivados',
  trecho + '\nreturn { conferirApontamentoDeProducao, publicarSeNecessario };');

let falhas = 0;
const check = (n, c, d = '') => { if (!c) falhas++; console.log(`${c ? '  ok  ' : ' FALHA'} ${n}${!c && d ? ' → ' + d : ''}`); };

// Monta um cenário: o que o DNS responde e o que o painel responde.
function montar({ painel }) {
  const pendentes = [];
  const ativados = [];
  const chamadas = [];
  const api = {
    getPublicacaoConfig: async () => ({ config: { hestiaIpPublico: '149.18.102.39' } }),
    conferirApontamento: async (payload) => handlers['dns:apontando'](null, payload),
    publicarPainel: async ({ etapa }) => { chamadas.push(etapa); return painel(etapa); },
  };
  const r = R({ api }, (m) => linhas.push(m), (rotulo, fn) => fn(), (u) => u, pendentes, ativados);
  return { ...r, pendentes, ativados, chamadas };
}

const painelFeliz = (etapa) => {
  if (etapa === 'estado') return { ok: true, estado: { concluido: false, falhou: false } };
  if (etapa === 'ssl') return { ok: true, estado: { sslAtivo: true } };
  return { ok: true, estado: { urlProducao: 'http://x.com.br' } };
};

(async () => {
  console.log('\n=== O handler do DNS responde a pergunta certa ===');
  zona['x.com.br'] = ['149.18.102.39'];
  zona['www.x.com.br'] = ['149.18.102.39'];
  let r = await handlers['dns:apontando'](null, { dominio: 'x.com.br', ip: '149.18.102.39' });
  check('apontando quando a raiz tem o IP', r.ok === true && r.apontando === true, JSON.stringify(r));

  zona['x.com.br'] = ['149.18.102.58'];
  r = await handlers['dns:apontando'](null, { dominio: 'x.com.br', ip: '149.18.102.39' });
  check('não apontando quando a raiz tem outro IP', r.apontando === false && r.resolveu === true && r.raiz[0] === '149.18.102.58');

  delete zona['x.com.br'];
  r = await handlers['dns:apontando'](null, { dominio: 'x.com.br', ip: '149.18.102.39' });
  check('não resolveu é diferente de apontar errado', r.apontando === false && r.resolveu === false, JSON.stringify(r));

  zona['x.com.br'] = ['149.18.102.58'];
  zona['www.x.com.br'] = ['149.18.102.39'];
  r = await handlers['dns:apontando'](null, { dominio: 'x.com.br', ip: '149.18.102.39' });
  check('www certo com raiz errada não vale', r.apontando === false && r.wwwApontando === true);
  r = await handlers['dns:apontando'](null, { dominio: 'x.com.br', ip: '' });
  check('sem IP de comparação, recusa em vez de chutar', r.ok === false, JSON.stringify(r));

  console.log('\n=== Publicação em lote: o SSL espera o DNS ===');
  zona['x.com.br'] = ['149.18.102.39'];
  let c = montar({ painel: painelFeliz });
  let res = await c.publicarSeNecessario({ dominio: 'x.com.br', painel: 'https://p/x' }, '11');
  check('com o DNS de pé, pede o SSL', c.chamadas.includes('ssl'), c.chamadas.join(','));
  check('e conta como ativado', c.ativados.length === 1 && c.pendentes.length === 0);
  check('sem "pendente" no resumo da linha', !/pendente/.test(res.detalhe), res.detalhe);

  zona['x.com.br'] = ['149.18.102.58'];
  c = montar({ painel: painelFeliz });
  res = await c.publicarSeNecessario({ dominio: 'x.com.br', painel: 'https://p/x' }, '11');
  check('com o IP antigo, NÃO pede o SSL', !c.chamadas.includes('ssl'), c.chamadas.join(','));
  check('publicou assim mesmo', c.chamadas.includes('publicar'));
  check('anota o pendente com o IP visto', c.pendentes.length === 1 && /149\.18\.102\.58/.test(c.pendentes[0].motivo), JSON.stringify(c.pendentes));
  check('o resumo da linha diz SSL pendente', /SSL pendente/.test(res.detalhe), res.detalhe);

  delete zona['x.com.br'];
  c = montar({ painel: painelFeliz });
  await c.publicarSeNecessario({ dominio: 'x.com.br', painel: 'https://p/x' }, '11');
  check('sem resolver, o motivo fala das 2 horas do Registro.br', /2 horas/.test(c.pendentes[0]?.motivo || ''), JSON.stringify(c.pendentes));

  console.log('\n=== Quando o painel é que recusa ===');
  zona['x.com.br'] = ['149.18.102.39'];
  c = montar({
    painel: (etapa) => (etapa === 'ssl'
      ? { ok: true, estado: { sslAtivo: false, sslErro: 'Não foi possível ativar o SSL de produção.' } }
      : painelFeliz(etapa)),
  });
  res = await c.publicarSeNecessario({ dominio: 'x.com.br', painel: 'https://p/x' }, '11');
  check('o erro do painel vira pendente, com a mensagem dele', /Não foi possível ativar/.test(c.pendentes[0]?.motivo || ''), JSON.stringify(c.pendentes));
  check('e não conta como ativado', c.ativados.length === 0);
  check('a publicação continua valendo', /publicado|x\.com\.br/.test(res.detalhe), res.detalhe);

  c = montar({ painel: (etapa) => (etapa === 'ssl' ? { ok: false, error: 'painel fora do ar' } : painelFeliz(etapa)) });
  res = await c.publicarSeNecessario({ dominio: 'x.com.br', painel: 'https://p/x' }, '11');
  check('SSL que estoura não derruba a linha', res.jaEstava === false && /SSL falhou/.test(res.detalhe), res.detalhe);
  check('e também vai para o resumo do fim', c.pendentes.length === 1, JSON.stringify(c.pendentes));

  console.log('\n=== Quem já estava publicado não mexe no SSL ===');
  c = montar({ painel: (etapa) => (etapa === 'estado' ? { ok: true, estado: { concluido: true, falhou: false, urlProducao: 'http://x' } } : painelFeliz(etapa)) });
  res = await c.publicarSeNecessario({ dominio: 'x.com.br', painel: 'https://p/x' }, '11');
  check('nem publica nem pede SSL', res.jaEstava === true && c.chamadas.length === 1 && c.pendentes.length === 0, c.chamadas.join(','));

  Module._load = orig;
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
