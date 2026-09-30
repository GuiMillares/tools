// ADR-121: os scripts do painel MPI+ são STRINGS injetadas na página pelo
// rodarNoPainel. `node --check main.js` valida o main.js, não essas strings —
// um SyntaxError dentro delas (ex.: redeclarar um `const` que o JS_HELPERS já
// declara) só aparece em produção como o genérico "Script failed to execute".
// Este teste extrai os construtores do main.js, monta cada script exatamente
// como o rodarNoPainel monta, e valida a sintaxe com new Function.
//
//     node tools/test-painel-scripts.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// Pega `const NOME = \`...\`;` (template cru, com as ${} ainda dentro).
function template(nome) {
  const m = src.match(new RegExp('const ' + nome + ' = `([\\s\\S]*?)`;'));
  if (!m) throw new Error('não achei ' + nome + ' no main.js');
  return m[1];
}
// Pega o corpo de uma função declarada `function nome(...) {...}` até a chave que fecha no nível 0.
function funcao(nome) {
  let ini = src.indexOf('function ' + nome + '(');
  if (ini < 0) throw new Error('não achei function ' + nome);
  // Preserva o `async ` que vem antes (senão o await dentro vira SyntaxError).
  if (src.slice(ini - 6, ini) === 'async ') ini -= 6;
  const abre = src.indexOf('{', ini);
  let n = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '{') n++;
    else if (src[i] === '}') { n--; if (n === 0) return src.slice(ini, i + 1); }
  }
  throw new Error('função ' + nome + ' sem fechamento');
}

// Monta como o rodarNoPainel monta e só PARSEIA (não executa nada).
function sintaxeOk(script) {
  try { new Function(`(async () => { try { ${script} } catch (e) { return { erro: String(e && e.message || e) }; } })`); return null; }
  catch (e) { return e.message; }
}

// Sandbox com os pedaços puros do main.js (sem Electron): os templates viram
// strings de verdade aqui, com as interpolações resolvidas.
const ctx = { JSON, String, Array, Object, RegExp, PAINEL_HOST: 'idealplus.idealtrends.io' };
vm.createContext(ctx);
vm.runInContext('JS_HELPERS = `' + template('JS_HELPERS') + '`;', ctx);
vm.runInContext('JS_ACHAR_MESTRE_PAINEL = `' + template('JS_ACHAR_MESTRE_PAINEL') + '`;', ctx);
vm.runInContext('JS_PAINEL_LER_CONTATOS = `' + template('JS_PAINEL_LER_CONTATOS') + '`;', ctx);
vm.runInContext(funcao('jsPainelEscreverSalvar'), ctx);
// resolverPainelUrl: captura o script que ele manda para o rodarNoPainel.
vm.runInContext('capturado = null; rodarNoPainel = async (w, s) => { capturado = s; return { id: "1", hub: "https://x/clientes/1/hub?projeto=2" }; };', ctx);
vm.runInContext(funcao('resolverPainelUrl'), ctx);

(async () => {
  console.log('\n=== Sintaxe dos scripts injetados no painel MPI+ ===');

  const erroLer = sintaxeOk(ctx.JS_PAINEL_LER_CONTATOS);
  check('JS_PAINEL_LER_CONTATOS parseia', erroLer === null, erroLer || '');

  // Um estado realista (com aspas, acento e barra) para o JSON embutido.
  const dados = {
    addresses: [{ id: 'a-1', cep: '##', logradouro: "Rua d'Água \"x\" \\ /", phones: [{ numero: '(00) 00000-0000' }], emails: [{ email: 'contato@idealtrends.com.br' }] }],
    whatsapp: { numbers: [{ label: '.', number: '(00) 00000-0000', whatsapp_message: 'Olá! ##' }] },
  };
  const scriptSalvar = ctx.jsPainelEscreverSalvar(dados);
  const erroSalvar = sintaxeOk(scriptSalvar);
  check('jsPainelEscreverSalvar(dados) parseia (sem redeclarar nomes do JS_HELPERS)', erroSalvar === null, erroSalvar || '');
  check('script de salvar não redeclara "const dados" do JS_HELPERS', !/\n\s*const dados = \{/.test(scriptSalvar));
  // saveSection re-hidrata a config inteira (applyLoadedConfig) e desfaria um
  // WhatsApp censurado só em memória: o WhatsApp tem que ser salvo ANTES.
  const iWa = scriptSalvar.indexOf("saveBlock('integrations', 'whatsapp')");
  const iSet = scriptSalvar.indexOf("saveSection('settings')");
  check('salva o WhatsApp ANTES dos endereços (saveSection re-hidrata a config)', iWa >= 0 && iSet >= 0 && iWa < iSet, `whatsapp@${iWa} settings@${iSet}`);
  // e re-aplica m.addresses logo antes do saveSection (depois do save do whatsapp)
  const iAddr = scriptSalvar.indexOf('m.addresses = novoEstado.addresses');
  check('re-aplica os endereços depois do save do WhatsApp e antes do saveSection', iAddr > iWa && iAddr < iSet);

  await ctx.resolverPainelUrl(null, { razao: "Empresa d'Ouro LTDA", cnpj: '49.564.975/0001-31' });
  const erroResolver = sintaxeOk(ctx.capturado);
  check('script do resolverPainelUrl parseia (razão com apóstrofo + CNPJ)', erroResolver === null, erroResolver || '');
  check('resolverPainelUrl busca pela razão antes do CNPJ', /"Empresa d'Ouro LTDA"/.test(ctx.capturado) && ctx.capturado.indexOf("Empresa d'Ouro") < ctx.capturado.indexOf('49564975'));

  // Nomes que o JS_HELPERS reserva: nenhum script pode redeclará-los.
  const reservados = ['raizDe', 'dados', 'espera', 'ate', 'acharMestre'];
  for (const s of [['LER', ctx.JS_PAINEL_LER_CONTATOS], ['SALVAR', scriptSalvar]]) {
    // Tira os helpers e os comentários de linha (um comentário que CITA
    // "const dados" não é uma declaração).
    const corpo = s[1].replace(ctx.JS_HELPERS, '').replace(ctx.JS_ACHAR_MESTRE_PAINEL, '').replace(/^\s*\/\/.*$/gm, '');
    const colide = reservados.filter((r) => new RegExp('\\b(const|let|var)\\s+' + r + '\\b').test(corpo));
    check(`${s[0]} não redeclara nomes reservados`, colide.length === 0, colide.join(', '));
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
