// Planilha de publicações no SharePoint (ADR-062), com o Microsoft Graph
// simulado. Nada de rede.
//
//     node tools/test-planilha.js

const path = require('path');
const Module = require('module');
const fs = require('fs');

const handlers = {};
const DIR = '/tmp/hub-planilha';
const cofre = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('enc:' + s), decryptString: (b) => String(b).replace(/^enc:/, '') };
const electronStub = {
  app: { getPath: () => DIR, whenReady: () => ({ then: () => ({}) }), on() {} },
  BrowserWindow: Object.assign(function () { throw new Error('não deveria abrir janela'); }, { getAllWindows: () => [] }),
  ipcMain: { handle(n, f) { handlers[n] = f; } },
  safeStorage: cofre,
  clipboard: { writeText() {} },
  session: { fromPartition: () => ({ clearStorageData: async () => {} }) },
};

// Graph de mentira.
// A aba como a real: cabeçalho, 196 sites, e formatação arrastada até a 600,
// que o intervalo usado do Excel conta como usada (ADR-078).
const valoresDaAba = (sites, ateLinha) => {
  const v = [['Data', 'Domínio', 'Razão Social']];
  for (let i = 1; i <= sites; i++) v.push([`0${(i % 9) + 1}/01/2026`, `https://site${i}.com.br/`, `SITE ${i} LTDA`]);
  while (v.length < ateLinha) v.push(['', '', '']);
  return v;
};
const graph = { abas: [{ name: 'MPI' }, { name: 'Busca Cliente' }], tabelas: [], usado: 'MPI!A1:Z600', valores: valoresDaAba(196, 600), faixaTabela: null, escritas: [], linhasTabela: [], chamadas: [], recusar403: false };
const responder = (method, p, body) => {
  graph.chamadas.push(`${method} ${p.replace(/\?.*$/, '')}`);
  if (graph.recusar403) return { status: 403, json: { error: { code: 'accessDenied', message: 'Access denied' } } };
  if (p.startsWith('/v1.0/shares/')) return { status: 200, json: { id: 'ITEM1', name: 'Book.xlsx', webUrl: 'https://x/Book.xlsx', parentReference: { driveId: 'DRIVE1' } } };
  if (/\/worksheets\?/.test(p)) return { status: 200, json: { value: graph.abas } };
  if (/\/tables\?/.test(p) || /\/tables$/.test(p)) return { status: 200, json: { value: graph.tabelas } };
  if (/\/tables\/[^/]+\/rows$/.test(p) && method === 'POST') { graph.linhasTabela.push(body.values[0]); return { status: 201, json: { index: graph.linhasTabela.length - 1 } }; }
  if (/usedRange/.test(p)) return { status: 200, json: { address: graph.usado, rowCount: graph.valores.length, values: graph.valores } };
  if (/\/tables\/[^/]+\/range/.test(p)) return { status: 200, json: { address: graph.faixaTabela || 'MPI!A1:Z197' } };
  if (/\/range\(address='([^']+)'\)/.test(p) && method === 'PATCH') { graph.escritas.push({ endereco: p.match(/address='([^']+)'/)[1], valores: body.values[0] }); return { status: 200, json: {} }; }
  if (/\/range\(address='([^']+)'\)/.test(p) && method === 'GET') { const u = graph.escritas[graph.escritas.length - 1]; return { status: 200, json: { values: [u ? u.valores : []] } }; }
  return { status: 404, json: { error: { message: 'rota desconhecida no fake: ' + method + ' ' + p } } };
};
const httpsStub = {
  request(options, cb) {
    let corpo = '';
    const req = {
      on() { return req; }, setTimeout() { return req; }, destroy() {},
      write(c) { corpo += c; },
      end() {
        const r = responder(options.method, options.path, corpo ? JSON.parse(corpo) : null);
        const txt = JSON.stringify(r.json);
        const res = { statusCode: r.status, headers: { 'content-type': 'application/json' }, setEncoding() {}, resume() {}, on(ev, fn) { if (ev === 'data') fn(txt); if (ev === 'end') setImmediate(fn); return res; } };
        setImmediate(() => cb(res));
      },
    };
    return req;
  },
};

const orig = Module._load;
Module._load = (r, p, i) =>
  r === 'electron' ? electronStub
  : r === 'googleapis' ? { google: { auth: { GoogleAuth: function () {}, OAuth2: function () {} }, options() {} } }
  : r === 'https' ? httpsStub
  : orig(r, p, i);

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });
// Sessão da Microsoft já conectada e válida, e a planilha configurada.
fs.writeFileSync(path.join(DIR, 'ms-config.json'), JSON.stringify({ clientId: 'cid', tenant: 'tid' }));
fs.writeFileSync(path.join(DIR, 'ms-token.enc'), 'enc:' + JSON.stringify({ access_token: 'tok', refresh_token: 'r', expiresAt: Date.now() + 3600e3, email: 'g@x' }));
fs.writeFileSync(path.join(DIR, 'publicacao-config.json'), JSON.stringify({ planilhaUrl: 'https://buscacliente-my.sharepoint.com/:x:/r/personal/g/Doc.aspx?sourcedoc=%7BABC%7D&file=Book.xlsx' }));

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const mod = { exports: {} };
new Function('require','module','exports','__dirname','__filename', src + ';module.exports={shareIdDoLink,linhasDoEndereco,colunaLetra,PLANILHA_COLUNAS,escolherAba,PLANILHA_ABAS,proximaLinhaLivre};')
  (require, mod, mod.exports, path.join(__dirname, '..'), path.join(__dirname, '..', 'main.js'));
const M = mod.exports;

// A linha, do renderer.
const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');
const rec = (a, b) => { const i = app.indexOf(a); const f = app.indexOf(b, i); if (i < 0 || f < 0) throw new Error('não achei ' + a); return app.slice(i, f); };
const R = new Function([
  rec('const PLANILHA_ABA_POR_MARCA', '\nasync function pubEtapaPlanilha('),
  'return { montarLinhaPlanilha, PLANILHA_ABA_POR_MARCA, PLANILHA_TIPO_POR_MARCA, dataHojeBr };',
].join('\n'))();

let falhas = 0;
const check = (n, c, d = '') => { if (!c) falhas++; console.log(`${c ? '  ok  ' : ' FALHA'} ${n}${!c && d ? ' → ' + d : ''}`); };
const texto = (r) => (r.log || []).map((l) => l.message).join(' | ');

(async () => {
  console.log('\n=== Utilitários ===');
  check('link vira id de share com prefixo u!', M.shareIdDoLink('https://a/b?c=1').startsWith('u!') && !/[=+/]/.test(M.shareIdDoLink('https://a/b?c=1')));
  check('lê a última linha do endereço com aba', M.linhasDoEndereco('MPI!A1:Z57').ultimaLinha === 57);
  check('endereço de uma célula só', M.linhasDoEndereco('A1').ultimaLinha === 1);
  check('26 colunas viram Z', M.colunaLetra(26) === 'Z' && M.colunaLetra(27) === 'AA');
  check('a planilha tem 26 colunas', M.PLANILHA_COLUNAS.length === 26);

  console.log('\n=== A linha, no formato do exemplo ===');
  const linha = R.montarLinhaPlanilha({ dominio: 'karollinefigueiredo.com.br', razao: 'KAROLLINE FIGUEIREDO DERMATOLOGIA LTDA', marca: 'mpiplus', desenvolvedor: 'Caique Coelho', servidor: 'Hestia 192.168.3.143', dnsNosso: true });
  check('26 valores', linha.length === 26, String(linha.length));
  check('data de hoje em dd/mm/aaaa', /^\d{2}\/\d{2}\/\d{4}$/.test(linha[0]) && linha[0] === R.dataHojeBr());
  check('domínio com https e barra', linha[1] === 'https://karollinefigueiredo.com.br/');
  check('razão social', linha[2] === 'KAROLLINE FIGUEIREDO DERMATOLOGIA LTDA');
  check('chave única e redirect vazios', linha[3] === '' && linha[5] === '');
  check('tipo MPI+', linha[4] === 'MPI+');
  check('desenvolvedor', linha[6] === 'Caique Coelho');
  check('validação padrão', linha[8] === 'NÃO CONTÉM ERROS');
  check('as 17 etapas como Finalizado', linha.slice(9).every((v) => v === 'Finalizado'), JSON.stringify(linha.slice(9)));
  const cliente = R.montarLinhaPlanilha({ dominio: 'x.com.br', razao: 'X', marca: 'mpiplus', dnsNosso: false });
  check('DNS do cliente: Cloudflare e Registro.BR como "Não se aplica", o resto Finalizado', cliente[22] === 'Não se aplica' && cliente[23] === 'Não se aplica' && cliente[21] === 'Finalizado' && cliente[24] === 'Finalizado');
  check('aba por marca', R.PLANILHA_ABA_POR_MARCA.bc === 'Busca Cliente' && R.PLANILHA_ABA_POR_MARCA.mpiplus === 'MPI' && R.PLANILHA_ABA_POR_MARCA.mpisolutions === 'MPI');

  console.log('\n=== Linha livre é por conteúdo, não pelo intervalo usado (ADR-078) ===');
  check('196 sites com cabeçalho: próxima é a 198', M.proximaLinhaLivre(valoresDaAba(196, 600), 1).proxima === 198);
  check('aba só com cabeçalho: próxima é a 2', M.proximaLinhaLivre(valoresDaAba(0, 50), 1).proxima === 2);
  check('aba vazia: começa na primeira linha do intervalo', M.proximaLinhaLivre([], 1).proxima === 1);
  check('intervalo que começa na linha 3', M.proximaLinhaLivre([['Data'], ['x', 'y', 'z']], 3).proxima === 5);
  check('linha só com espaços não conta', M.proximaLinhaLivre([['Data'], ['a'], ['  ', '', ' ']], 1).proxima === 3);
  check('conteúdo só na coluna D não conta como site', M.proximaLinhaLivre([['Data'], ['a'], ['', '', '', 'Finalizado']], 1).proxima === 3);

  console.log('\n=== Escrita sem tabela: logo abaixo do último site ===');
  r = await handlers['planilha:registrar'](null, { aba: 'MPI', linha });
  check('registra', r.ok === true, r.error || texto(r));
  check('na linha 198 (196 sites + cabeçalho + 1), não na 601', graph.escritas[0]?.endereco === 'A198:Z198', JSON.stringify(graph.escritas[0]?.endereco));
  check('com os 26 valores', graph.escritas[0]?.valores.length === 26);
  check('e conferiu depois', /Conferido/.test(texto(r)), texto(r).slice(-200));
  check('diz que ignorou a formatação até a 600', /ia até a 600/.test(texto(r)), texto(r));
  check('devolve onde ficou', r.onde === 'MPI!A198:Z198', r.onde);

  console.log('\n=== Com tabela ===');
  graph.tabelas = [{ id: '{T1}', name: 'TabelaMPI' }];
  graph.faixaTabela = 'MPI!A1:Z197';
  r = await handlers['planilha:registrar'](null, { aba: 'MPI', linha });
  check('tabela termina na 197 e a livre é a 198: entra pela tabela', r.ok === true && graph.linhasTabela.length === 1, r.error || texto(r));
  check('sem escrever por range', graph.escritas.length === 1);
  graph.faixaTabela = 'MPI!A1:Z600';
  r = await handlers['planilha:registrar'](null, { aba: 'MPI', linha });
  check('tabela com linhas em branco até a 600: escreve pelo endereço na 198', r.ok === true && graph.linhasTabela.length === 1 && graph.escritas[1]?.endereco === 'A198:Z198', r.error || JSON.stringify(graph.escritas.map((e) => e.endereco)));
  graph.tabelas = [];
  graph.faixaTabela = null;

  console.log('\n=== O nome da aba vem da planilha, nao do codigo ===');
  check('nome exato', M.escolherAba('Busca Cliente', ['MPI', 'Busca Cliente']) === 'Busca Cliente');
  check('o nome antigo "BUSCA" ainda encontra a aba', M.escolherAba('BUSCA', M.PLANILHA_ABAS) === 'Busca Cliente');
  check('a planilha ainda com o nome antigo e encontrada', M.escolherAba('Busca Cliente', ['MPI', 'BUSCA']) === 'BUSCA');
  check('caixa e acento nao importam', M.escolherAba('Busca Cliente', ['MPI', 'busca cliente']) === 'busca cliente');
  check('sufixo no nome nao atrapalha', M.escolherAba('Busca Cliente', ['MPI', 'Busca Cliente 2025']) === 'Busca Cliente 2025');
  check('MPI nao casa com a aba de busca', M.escolherAba('MPI', ['Busca Cliente']) === null);
  check('aba inventada nao casa', M.escolherAba('OUTRA', M.PLANILHA_ABAS) === null);

  graph.escritas = [];
  graph.chamadas = [];
  r = await handlers['planilha:registrar'](null, { aba: 'Busca Cliente', linha });
  check('escreve na aba "Busca Cliente"', r.ok === true && r.onde === 'Busca Cliente!A198:Z198', r.error || r.onde);
  check('e pediu as abas antes de escrever', graph.chamadas.some((c) => /workbook\/worksheets$/.test(c)), graph.chamadas.join(' . '));
  graph.abas = [{ name: 'MPI' }];
  r = await handlers['planilha:registrar'](null, { aba: 'Busca Cliente', linha });
  check('aba que nao existe na planilha diz quais existem', r.ok === false && /nao existe na planilha|não existe na planilha/.test(r.error) && /MPI/.test(r.error), r.error);
  graph.abas = [{ name: 'MPI' }, { name: 'Busca Cliente' }];

  console.log('\n=== Recusas ===');
  r = await handlers['planilha:registrar'](null, { aba: 'OUTRA', linha });
  check('aba fora de MPI/Busca Cliente é recusada', r.ok === false && /MPI ou Busca Cliente/.test(r.error), r.error);
  r = await handlers['planilha:registrar'](null, { aba: 'MPI', linha: linha.slice(0, 5) });
  check('linha com menos colunas é recusada', r.ok === false && /26 colunas/.test(r.error), r.error);
  graph.recusar403 = true;
  r = await handlers['planilha:registrar'](null, { aba: 'MPI', linha });
  check('403 pede reconexão e explica o escopo novo', r.ok === false && r.reauth === true && /Files\.ReadWrite/.test(r.error), r.error);
  graph.recusar403 = false;
  fs.writeFileSync(path.join(DIR, 'publicacao-config.json'), JSON.stringify({}));
  r = await handlers['planilha:registrar'](null, { aba: 'MPI', linha });
  check('sem link configurado, diz onde configurar', r.ok === false && /configurações/.test(r.error), r.error);

  Module._load = orig;
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
