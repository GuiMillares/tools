// Guardas da sincronização no painel MPI+ (ADR-037).
//
//     node tools/test-painel.js
//
// O miolo da automação roda dentro de uma BrowserWindow, contra o Alpine do
// painel — isso não dá para simular aqui com honestidade, e um teste que finge
// testar é pior que teste nenhum. O que dá para cobrir, e é o que quebra na
// vida real, são as guardas ANTES de abrir o navegador: endereço errado, login
// ausente, nada para sincronizar, e o armazenamento da senha.

const path = require('path');
const Module = require('module');
const fs = require('fs');

const handlers = {};
let janelasCriadas = 0;

const cofre = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('enc:' + s),
  decryptString: (b) => String(b).replace(/^enc:/, ''),
};

const DIR = '/tmp/hub-painel';
const electronStub = {
  app: { getPath: () => DIR, whenReady: () => ({ then: () => ({}) }), on() {} },
  // Se alguma guarda deixar passar, a janela é criada e o teste percebe.
  BrowserWindow: Object.assign(
    function () { janelasCriadas++; throw new Error('não deveria ter aberto janela'); },
    { getAllWindows: () => [] }
  ),
  ipcMain: { handle(n, f) { handlers[n] = f; } },
  safeStorage: cofre,
  clipboard: { writeText() {} },
  session: { fromPartition: () => ({ clearStorageData: async () => {} }) },
};

const orig = Module._load;
Module._load = (r, p, i) =>
  r === 'electron' ? electronStub
  : r === 'googleapis' ? { google: { auth: { GoogleAuth: function () {}, OAuth2: function () {} }, options() {} } }
  : orig(r, p, i);

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const mod = { exports: {} };
new Function('require','module','exports','__dirname','__filename',
  src + ';module.exports={painelUrlValida,readPainelCreds,metaVerificacaoDaPagina,normalizeDomain,painelSincronizarRelatorio,escolherConexao,PAINEL_HOST};')
  (require, mod, mod.exports, path.join(__dirname, '..'), path.join(__dirname, '..', 'main.js'));
const M = mod.exports;

let falhas = 0;
const check = (n, c, d = '') => { if (!c) falhas++; console.log(`${c ? '  ok  ' : ' FALHA'} ${n}${!c && d ? ' → ' + d : ''}`); };

fs.mkdirSync(DIR, { recursive: true });
const arquivoCreds = path.join(DIR, 'painel-creds.enc');
try { fs.unlinkSync(arquivoCreds); } catch (e) {}

const URL_OK = 'https://idealplus.idealtrends.io/clientes/2775/hub?projeto=2851&tab=publicacao';
const valores = { analyticsKey: 'G-X', searchConsoleKey: 'google-site-verification: x.html' };

(async () => {
  console.log('\n=== O endereço tem que ser do painel ===');
  check('link do painel vale', M.painelUrlValida(URL_OK) === true);
  check('outro host não vale', M.painelUrlValida('https://idealplus.outro.com/clientes/1') === false);
  // O perigo aqui é levar uma sessão logada para um endereço de terceiro.
  check('subdomínio parecido não vale', M.painelUrlValida('https://idealplus.idealtrends.io.evil.com/x') === false);
  check('vazio não vale', M.painelUrlValida('') === false && M.painelUrlValida(null) === false);
  check('texto solto não vale', M.painelUrlValida('clientes/2775') === false);

  console.log('\n=== Guardas antes de abrir o navegador ===');
  let r = await handlers['painel:sync'](null, { url: 'https://outro.com/x', ...valores });
  check('endereço errado é recusado', r.ok === false && /idealplus/.test(r.error), r.error);
  check('e nenhuma janela foi aberta', janelasCriadas === 0);

  r = await handlers['painel:sync'](null, { url: URL_OK, ...valores });
  check('sem login configurado, recusa', r.ok === false && /não configurado/.test(r.error), r.error);
  check('e manda configurar', /configuraç/i.test(r.error), r.error);
  check('ainda sem janela', janelasCriadas === 0);

  console.log('\n=== Guarda da senha ===');
  r = await handlers['painel:setCreds'](null, { email: 'guilherme@idealtrends.com.br', senha: '' });
  check('e-mail sem senha é recusado', r.ok === false, JSON.stringify(r));
  r = await handlers['painel:setCreds'](null, { email: 'guilherme@idealtrends.com.br', senha: 'segredo123' });
  check('e-mail com senha grava', r.ok === true && r.configured === true);
  check('gravou criptografado', !fs.readFileSync(arquivoCreds).toString().startsWith('{'),
    fs.readFileSync(arquivoCreds).toString().slice(0, 12));

  const st = await handlers['painel:status']();
  check('status devolve o e-mail', st.email === 'guilherme@idealtrends.com.br');
  check('status NUNCA devolve a senha', !JSON.stringify(st).includes('segredo123'), JSON.stringify(st));

  console.log('\n=== Nada para sincronizar ===');
  r = await handlers['painel:sync'](null, { url: URL_OK });
  check('sem valor nenhum, recusa antes de navegar', r.ok === false, JSON.stringify(r).slice(0, 80));
  check('dizendo que não há o que mandar', /Nenhum valor|chave nenhuma/.test(r.error), r.error);

  console.log('\n=== Etapas do painel ===');
  await handlers['painel:setCreds'](null, { email: 'a@b.c', senha: 'x' });
  r = await handlers['painel:sync'](null, { url: URL_OK, etapas: [] , ...valores });
  check('lista vazia cai no padrão (as duas)', r.ok === false && !/etapa do painel/i.test(r.error || ''), r.error);
  r = await handlers['painel:sync'](null, { url: URL_OK, etapas: ['relatorio'] });
  // Só o relatório não precisa de chave nenhuma: a guarda de "nada a mandar"
  // não pode barrar essa etapa.
  check('só relatório não exige chaves', !/Nenhum valor/.test(r.error || ''), r.error);
  r = await handlers['painel:sync'](null, { url: URL_OK, etapas: ['nada'] });
  check('etapa desconhecida é recusada', /Nenhuma etapa/.test(r.error || ''), r.error);
  await handlers['painel:setCreds'](null, { email: '', senha: '' });

  console.log('\n=== Escolher a conexão OAuth pelo estado do painel (ADR-051) ===');
  {
    const E = M.escolherConexao;
    // Formato real do painel: connectionOptions = [{ name, value }], value numérico.
    const opcoes = [
      { name: 'bcrelatorios@gmail.com', value: 7 },
      { name: 'ferramentasmpisolutions@gmail.com', value: 10 },
      { name: 'bcrelatoriotags@gmail.com', value: 12 },
    ];
    let r = E(opcoes, 'bcrelatoriotags@gmail.com');
    check('acha pelo e-mail e devolve o id como string', r.valor === '12', JSON.stringify(r));
    check('o id NUNCA vem vazio quando achou', r.valor !== '' && r.valor !== 'undefined', JSON.stringify(r));
    r = E(opcoes, '  BCRelatorioTags@Gmail.com ');
    check('ignora maiúscula e espaço', r.valor === '12', JSON.stringify(r));
    r = E(opcoes, 'ninguem@gmail.com');
    check('conta ausente é erro', !!r.erro, JSON.stringify(r));
    check('e o erro lista as que existem', /bcrelatoriotags@gmail\.com/.test(r.erro) && /3 conexões/.test(r.erro), r.erro);
    r = E([{ name: 'x@y.z', value: null }], 'x@y.z');
    check('conexão sem id é erro, não vazio silencioso', /sem id/.test(r.erro || ''), JSON.stringify(r));
    r = E([], 'x@y.z');
    check('lista vazia é erro', /0 conexões/.test(r.erro || ''), JSON.stringify(r));
    r = E(opcoes, '');
    check('conta vazia é erro', !!r.erro, JSON.stringify(r));
    // Serializada para dentro da página: não pode depender de nada de fora.
    const fonte = E.toString();
    check('a função é autocontida (sem require/process/fs)', !/require\(|process\.|fs\./.test(fonte));
    const clone = new Function('return ' + fonte)();
    check('e roda igual depois de serializada', clone(opcoes, 'bcrelatorios@gmail.com').valor === '7');
  }

  console.log('\n=== Relatório: campo vazio é recusado antes do painel (ADR-048) ===');
  {
    const completo = {
      contaEmail: 'bcrelatoriotags@gmail.com',
      gaAccountKey: '312884706',
      gaPropertyId: 'properties/512883014',
      gscSiteUrl: 'https://teste.com.br',
    };
    const tentar = async (mudanca) => {
      const registros = [];
      try {
        // win = null de propósito: se a guarda deixar passar, estoura aqui —
        // e é isso que o teste quer provar que NÃO acontece.
        await M.painelSincronizarRelatorio(null, { ...completo, ...mudanca }, (m, t) => registros.push(m));
        return { erro: null, registros };
      } catch (e) {
        return { erro: e.message, registros };
      }
    };

    let t = await tentar({ gaAccountKey: '' });
    check('conta do Analytics vazia é recusada', /não vou abrir o painel/.test(t.erro || ''), t.erro);
    check('e o erro nomeia o campo', /ID da conta do Analytics/.test(t.erro || ''), t.erro);
    check('sem nem abrir a aba', t.registros.length === 0, t.registros.join(' | '));

    t = await tentar({ gaPropertyId: '   ' });
    check('só espaço também conta como vazio', /ID da propriedade/.test(t.erro || ''), t.erro);

    t = await tentar({ gscSiteUrl: '' });
    check('endereço do Search Console vazio é recusado', /endereço do site/.test(t.erro || ''), t.erro);

    t = await tentar({ contaEmail: '', gscSiteUrl: '' });
    check('erro lista os dois campos de uma vez',
      /conta do Google/.test(t.erro || '') && /endereço do site/.test(t.erro || ''), t.erro);

    t = await tentar({});
    check('com tudo preenchido, a guarda deixa seguir', !/não vou abrir o painel/.test(t.erro || ''), t.erro);
  }

  console.log('\n=== Ler a meta tag de verificação da página ===');
  const V = M.metaVerificacaoDaPagina;
  check('lê o content',
    V('<head><meta name="google-site-verification" content="AO85Byk"></head>') === 'AO85Byk');
  check('aceita aspas simples',
    V("<meta name='google-site-verification' content='AO85Byk'>") === 'AO85Byk');
  check('aceita a ordem invertida dos atributos',
    V('<meta content="AO85Byk" name="google-site-verification">') === 'AO85Byk');
  check('ignora outras metas', V('<meta name="description" content="nada">') === '');
  check('página sem tag devolve vazio', V('<html><head></head></html>') === '');
  // O caso real que custou duas execuções: o painel injetou a linha do arquivo
  // como se fosse o token (ADR-039). A tag existe, o valor é que está errado.
  check('devolve o valor errado em vez de fingir que não existe',
    V('<meta name="google-site-verification" content="google-site-verification: googleed81.html">')
      === 'google-site-verification: googleed81.html');

  console.log('\n=== Limpeza do domínio ===');
  const D = M.normalizeDomain;
  // O caso real: coleta-se o endereço da barra do navegador e cola-se no campo.
  check('tira protocolo e barra final', D('http://starexemergencias.com.br/') === 'starexemergencias.com.br', D('http://starexemergencias.com.br/'));
  check('tira https também', D('https://site.com.br') === 'site.com.br');
  check('tira www', D('www.site.com.br') === 'site.com.br');
  check('tira protocolo E www', D('https://www.site.com.br/') === 'site.com.br');
  check('tira caminho', D('site.com.br/pagina/interna') === 'site.com.br');
  check('tira query', D('site.com.br?utm=x') === 'site.com.br');
  check('normaliza maiúscula', D('SITE.COM.BR') === 'site.com.br');
  check('domínio limpo passa igual', D('site.com.br') === 'site.com.br');
  check('tira // solto', D('//site.com.br') === 'site.com.br', D('//site.com.br'));
  check('tira // com www', D('//www.site.com.br/') === 'site.com.br', D('//www.site.com.br/'));
  check('tira barra sobrando no começo', D('///site.com.br') === 'site.com.br', D('///site.com.br'));
  check('vazio devolve vazio', D('  ') === '');

  console.log('\n=== Remover credenciais ===');
  r = await handlers['painel:setCreds'](null, { email: '', senha: '' });
  check('apaga o arquivo', r.ok === true && r.configured === false && !fs.existsSync(arquivoCreds));
  check('e o status volta a "não configurado"', (await handlers['painel:status']()).configured === false);

  Module._load = orig;
  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
