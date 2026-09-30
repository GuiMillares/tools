// ADR-105: ferramenta "bloquear contatos" no /doutor. Uma senha só, o e-mail
// escolhido pela marca, sem tentar senha nenhuma. Recorta as funções puras e
// os handlers de credencial do main.js, com fs/safeStorage simulados.
//
//     node tools/test-doutor.js

const fs = require('fs');
const path = require('path');
const Module = require('module');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const recorta = (a, b) => { const i = main.indexOf(a); const f = main.indexOf(b, i); if (i < 0 || f < 0) throw new Error('não achei ' + a); return main.slice(i, f); };

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// doutorEmailDaMarca é pura: dá para testar sozinha.
const emailDaMarca = new Function(`${recorta('function doutorEmailDaMarca(', '\nipcMain.handle(\'doutor:setCreds\'')} return doutorEmailDaMarca;`)();

console.log('\n=== O e-mail vem da marca; a senha é a mesma (sem adivinhar) ===');
{
  const creds = { senha: 'x', emailMpi: 'sig@mpisolutions.com.br', emailBusca: 'sig@buscacliente.com.br' };
  check('MPI usa o e-mail da MPI', emailDaMarca(creds, 'mpisolutions') === 'sig@mpisolutions.com.br');
  check('Busca usa o e-mail da Busca', emailDaMarca(creds, 'bc') === 'sig@buscacliente.com.br');
  check('marca desconhecida cai na MPI (padrão), não inventa e-mail', emailDaMarca(creds, 'zzz') === 'sig@mpisolutions.com.br');
  check('sem credencial, e-mail vazio', emailDaMarca(null, 'bc') === '');
  check('marca sem e-mail configurado devolve vazio', emailDaMarca({ senha: 'x', emailMpi: '', emailBusca: 'b@b' }, 'mpisolutions') === '');
}

console.log('\n=== Guardar e ler a credencial (uma senha, dois e-mails, criptografado) ===');
{
  // Pasta só deste teste no %TEMP%, apagada na saída mesmo que ele lance.
  const DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hub-doutor-'));
  process.on('exit', () => fs.rmSync(DIR, { recursive: true, force: true }));
  const handlers = {};
  const electron = {
    app: { getPath: () => DIR, whenReady: () => ({ then() {} }), on() {} },
    BrowserWindow: Object.assign(function () {}, { getAllWindows: () => [] }),
    ipcMain: { handle: (n, f) => { handlers[n] = f; } },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('E:' + s), decryptString: (b) => String(b).slice(2) },
    clipboard: { writeText() {} }, session: {},
  };
  const orig = Module._load;
  Module._load = (r, p, i) => (r === 'electron' ? electron : /[\\/]lib[\\/]google$/.test(r) ? { google: { options() {} } } : orig(r, p, i));
  const corpo = `
    const app = electron.app, safeStorage = electron.safeStorage, ipcMain = electron.ipcMain;
    const path = require('path'), fs = require('fs');
    ${recorta('const doutorCredsPath', "handleNoPainel('doutor:bloquear'")}
  `;
  new Function('electron', 'require', 'handlers', corpo)(electron, require, handlers);
  Module._load = orig;

  const set = (payload) => handlers['doutor:setCreds'](null, payload);
  const status = () => handlers['doutor:status'](null);

  check('recusa e-mail sem senha', set({ emailMpi: 'a@a', emailBusca: 'b@b' }).ok === false);
  check('recusa senha sem nenhum e-mail', set({ senha: 'x' }).ok === false);
  const r = set({ senha: 'Sig@Forte', emailMpi: 'sig@mpisolutions.com.br', emailBusca: 'sig@buscacliente.com.br' });
  check('grava com senha + e-mails', r.ok && r.configured);
  const st = status();
  check('status devolve os e-mails e diz que tem senha', st.emailMpi === 'sig@mpisolutions.com.br' && st.emailBusca === 'sig@buscacliente.com.br' && st.temSenha === true, JSON.stringify(st));
  check('status NUNCA devolve a senha', !('senha' in st) && JSON.stringify(st).indexOf('Sig@Forte') === -1, JSON.stringify(st));
  check('passou pelo safeStorage (não gravou em texto puro)', fs.readFileSync(path.join(DIR, 'doutor-creds.enc'), 'utf-8').startsWith('E:'));
  check('tudo vazio remove a credencial', set({}).configured === false && status().temSenha === false);
}

console.log('\n=== Escolher a empresa do cliente (a agência SIG fica de fora) ===');
{
  const fns = new Function(`
    ${recorta('function jsDoutorBloquearFetch(', "\nhandleNoPainel('doutor:bloquear'")}
    return { doutorEhAgencia, doutorNormalizarNome, doutorEscolherEmpresa, jsDoutorBloquearFetch };`)();
  check('reconhece a agência SIG - Busca Cliente', fns.doutorEhAgencia('SIG - Busca Cliente') && fns.doutorEhAgencia('SIG - MPI Solutions'));
  check('reconhece a agência antiga Doutores da Web', fns.doutorEhAgencia('Doutores da Web'));
  check('o cliente não é agência', !fns.doutorEhAgencia('Renovare') && !fns.doutorEhAgencia('Clima Gem Carpina'));

  const rows = [
    { nome: 'SIG - Busca Cliente', rel: '2', val: '2', bloqueado: false },
    { nome: 'Renovare', rel: '6', val: '2', bloqueado: false },
  ];
  const e1 = fns.doutorEscolherEmpresa(rows, 'renovareengseg.com.br');
  check('escolhe a empresa do cliente, não a agência', e1.alvo && e1.alvo.nome === 'Renovare' && e1.alvo.rel === '6', JSON.stringify(e1));

  const soAgencia = fns.doutorEscolherEmpresa([rows[0]], 'x.com.br');
  check('só a agência: não bloqueia nada', !!soAgencia.erro && /só tem a agência/.test(soAgencia.erro), JSON.stringify(soAgencia));

  const duasClientes = [rows[0], { nome: 'Alpha', rel: '3', val: '2' }, { nome: 'Beta', rel: '4', val: '2' }];
  const semCasar = fns.doutorEscolherEmpresa(duasClientes, 'gama.com.br');
  check('duas empresas e nenhuma casa com o domínio: não chuta, lista', !!semCasar.erro && /mais de uma empresa/.test(semCasar.erro), JSON.stringify(semCasar));
  const casou = fns.doutorEscolherEmpresa(duasClientes, 'alpha.com.br');
  check('duas empresas, uma casa com o domínio: escolhe ela', casou.alvo && casou.alvo.nome === 'Alpha', JSON.stringify(casou));
}

console.log('\n=== A listagem de empresas e o "Voltar" (inalterados) ===');
{
  const listar = recorta('const JS_DOUTOR_LISTAR', '\nconst JS_DOUTOR_VOLTAR');
  check('a listagem lê rel (id) e o nome do alt/title, e deduplica', /getAttribute\('rel'\)/.test(listar) && /img\[alt\]/.test(listar) && /vistos\.has/.test(listar));
  const voltar = recorta('const JS_DOUTOR_VOLTAR', '\nconst JS_DOUTOR_LINK_EMPRESAS');
  check('o "Voltar" confirma tanto SweetAlert v1 quanto v2', /swal2-confirm/.test(voltar) && /sweet-alert.*button\.confirm/.test(voltar));
}

console.log('\n=== O bloqueio censura os contatos com ##, e-mail principal = marca (ADR-118) ===');
{
  const fns = new Function(`
    ${recorta('const DOUTOR_FONE_CAMPOS', '\nfunction doutorEhAgencia(')}
    return { DOUTOR_FONE_CAMPOS, DOUTOR_EMAIL_CAMPOS, DOUTOR_REDES_CAMPOS, DOUTOR_ENDERECO_CAMPOS, DOUTOR_CENSURA, doutorEmailContato, JS_DOUTOR_LER_CONTATOS, jsDoutorBloquearSalvar, jsDoutorRestaurarSalvar };`)();
  check('conhece telefones, e-mails, redes e endereço', fns.DOUTOR_FONE_CAMPOS.includes('empresa_fone') && fns.DOUTOR_EMAIL_CAMPOS.includes('empresa_email') && fns.DOUTOR_REDES_CAMPOS.includes('empresa_instagram') && fns.DOUTOR_ENDERECO_CAMPOS.includes('empresa_endereco'));
  check('a censura é ##', fns.DOUTOR_CENSURA === '##');
  check('e-mail da marca: bc e mpi', fns.doutorEmailContato('bc') === 'contato@buscacliente.com.br' && fns.doutorEmailContato('mpisolutions') === 'contato@mpisolutions.com.br');
  check('ler contatos olha o maior form e diz se está bloqueado (## no fone)', /querySelectorAll\('form'\)/.test(fns.JS_DOUTOR_LER_CONTATOS) && /bloqueado/.test(fns.JS_DOUTOR_LER_CONTATOS) && /campos/.test(fns.JS_DOUTOR_LER_CONTATOS));
  const jsBloq = fns.jsDoutorBloquearSalvar('contato@buscacliente.com.br');
  check('bloquear monta o plano de censura (##) e clica no UpdateEmp', /plano/.test(jsBloq) && /##/.test(jsBloq) && /UpdateEmp/.test(jsBloq) && /btn\.click/.test(jsBloq));
  check('bloquear clona os inputs (dribla a máscara do telefone)', /cloneNode/.test(jsBloq));
  check('bloquear põe o e-mail da marca no empresa_email', /empresa_email/.test(jsBloq) && /contato@buscacliente\.com\.br/.test(jsBloq));
  check('bloquear censura também redes e endereço', /empresa_facebook|redes/.test(jsBloq) && /empresa_endereco|endereco/.test(jsBloq));
  check('bloquear cobre endereços extras de texto', /empresa_enderecos_extras/.test(jsBloq));
  check('bloquear devolve o que havia antes para o backup', /return \{ submetido: true, antes \}/.test(jsBloq));
  const js = fns.jsDoutorRestaurarSalvar({ empresa_fone: '(66) 99615-5710', empresa_email: 'cliente@x.com.br', empresa_instagram: 'insta/x' });
  check('restaurar clona o input e repõe telefone, e-mail e redes', /cloneNode/.test(js) && /99615-5710/.test(js) && /cliente@x\.com\.br/.test(js) && /insta\/x/.test(js) && /UpdateEmp/.test(js));
}

console.log('\n=== Backup criptografado dos contatos (bloquear guarda, desbloquear restaura) ===');
{
  const DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hub-doutor-ct-'));
  process.on('exit', () => fs.rmSync(DIR, { recursive: true, force: true }));
  const app = { getPath: () => DIR };
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('E:' + s), decryptString: (b) => String(b).slice(2) };
  const store = new Function('app', 'safeStorage', 'path', 'fs', `
    ${recorta('const doutorContatosPath', "\nipcMain.handle('doutor:setCreds'")}
    return { salvarDoutorContatos, readDoutorContatos, apagarDoutorContatos };
  `)(app, safeStorage, path, fs);
  const campos = { empresa_fone: '(66) 99615-5710', empresa_fone4: '(66) 99615-5710', empresa_email: 'cliente@renovareengseg.com.br' };
  check('grava o backup dos contatos', store.salvarDoutorContatos('renovareengseg.com.br', campos) === true);
  const lido = store.readDoutorContatos()['renovareengseg.com.br'];
  check('relê os mesmos contatos (telefone + e-mail)', !!lido && lido.campos.empresa_fone === '(66) 99615-5710' && lido.campos.empresa_email === 'cliente@renovareengseg.com.br', JSON.stringify(lido));
  check('guardou criptografado (não texto puro)', fs.readFileSync(path.join(DIR, 'doutor-contatos.enc'), 'utf-8').startsWith('E:'));
  check('domínio sem backup volta indefinido', store.readDoutorContatos()['naoexiste.com'] === undefined);
  // Apagar após o desbloqueio libera a memória.
  store.salvarDoutorContatos('outro.com.br', { empresa_fone: '1' });
  check('apaga só o domínio pedido', store.apagarDoutorContatos('renovareengseg.com.br') === true && store.readDoutorContatos()['renovareengseg.com.br'] === undefined && !!store.readDoutorContatos()['outro.com.br']);
  check('apagar o último remove o arquivo', store.apagarDoutorContatos('outro.com.br') === true && !fs.existsSync(path.join(DIR, 'doutor-contatos.enc')));
}

console.log('\n=== Decisão pelo estado real: ## no telefone = bloqueado ===');
{
  const decidir = (acao, bloqueado) => {
    const desbloquear = acao === 'desbloquear';
    if (desbloquear && !bloqueado) return { jaEstava: true };
    if (!desbloquear && bloqueado) return { jaEstava: true };
    return { agir: true };
  };
  check('bloquear quando não está censurado: age', decidir('bloquear', false).agir === true);
  check('bloquear quando já censurado: não mexe', decidir('bloquear', true).jaEstava === true);
  check('desbloquear quando censurado: age', decidir('desbloquear', true).agir === true);
  check('desbloquear quando já no ar: não mexe', decidir('desbloquear', false).jaEstava === true);
  const handler = recorta("handleNoPainel('doutor:bloquear'", '\nipcMain.handle(\'painel:clearSession\'');
  check('o handler abre o cadastro da empresa e confere relendo', /CMSemp\/update/.test(handler) && /JS_DOUTOR_LER_CONTATOS/.test(handler));
  check('guarda o backup ao bloquear e restaura ao desbloquear', /salvarDoutorContatos/.test(handler) && /readDoutorContatos/.test(handler) && /jsDoutorRestaurarSalvar/.test(handler));
  check('apaga o backup depois do desbloqueio confirmado', /apagarDoutorContatos/.test(handler));
  check('tolera o 504 (não falha no carregamento)', /aguardarCarregar\(win\)\.catch/.test(handler));
  check('aceita a ação desbloquear', /acao = 'bloquear'/.test(handler) && /desbloquear/.test(handler));
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
