// ADR-092: a chave da service account recusada pelo Google e a aba Publicação
// do painel que demora a carregar. Recorta do main.js só o que é puro e roda
// aqui fora, sem Electron.
//
//     node tools/test-chave-e-painel.js

const fs = require('fs');
const path = require('path');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');

function recorta(inicio, fim) {
  const i = fonte.indexOf(inicio);
  const f = fonte.indexOf(fim, i);
  if (i < 0 || f < 0) throw new Error(`não achei o trecho "${inicio}"`);
  return fonte.slice(i, f);
}

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

(async () => {
  console.log('\n=== Chave da service account recusada vira instrução, não "Erro" solto ===');
  const diagnosticoChaveSa = new Function(`${recorta('function diagnosticoChaveSa(', '\n// "cliente.com.br"')}\nreturn diagnosticoChaveSa;`)();

  const revogada = diagnosticoChaveSa(new Error('invalid_grant: Invalid JWT Signature.'));
  check('Invalid JWT Signature é reconhecida', !!revogada);
  check('diz que a chave foi revogada', /revogada/.test(revogada || ''), revogada);
  check('manda trocar o arquivo nas configurações', /Caminho do arquivo da Service Account/.test(revogada || ''), revogada);
  check('lembra de salvar fora da pasta do projeto', /FORA da pasta do projeto/.test(revogada || ''), revogada);

  const viaResposta = diagnosticoChaveSa({ message: 'Request failed', response: { data: { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' } } });
  check('também quando o motivo vem no corpo da resposta', !!viaResposta);

  const relogio = diagnosticoChaveSa(new Error('invalid_grant: Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable timeframe. Check your iat and exp values'));
  check('JWT fora de hora aponta para o relógio', /relógio/.test(relogio || ''), relogio);

  check('login OAuth revogado NÃO é confundido com a service account', diagnosticoChaveSa(new Error('invalid_grant: Token has been expired or revoked.')) === null);
  check('erro qualquer não é mexido', diagnosticoChaveSa(new Error('ECONNRESET')) === null);

  console.log('\n=== A aba Publicação é esperada, não olhada uma vez só ===');
  const helpers = recorta('const JS_HELPERS = `', '`;\n').replace('const JS_HELPERS = `', '');
  const publicacao = recorta('const JS_PUBLICACAO = `', 'const botaoRaiz');
  check('o script espera o gancho com ate()', /const P = await ate\(\(\) => window\.__mpiHubPubPublication, 20000\)/.test(publicacao), publicacao);
  check('o erro marca abaNaoCarregou para o main tentar de novo', /abaNaoCarregou: true/.test(publicacao));

  // O mesmo ate() do painel, com um window de mentira que só expõe o gancho
  // depois de 300ms, como uma página mais lenta.
  const fakeWindow = {};
  setTimeout(() => { fakeWindow.__mpiHubPubPublication = { ok: true }; }, 300);
  const achou = await new Function('window', `${helpers}\nreturn (async () => !!(await ate(() => window.__mpiHubPubPublication, 3000)))();`)(fakeWindow);
  check('gancho que aparece depois de 300ms é encontrado', achou === true);

  const nunca = await new Function('window', `${helpers}\nreturn (async () => !!(await ate(() => window.__mpiHubPubPublication, 200)))();`)({});
  check('gancho que nunca aparece devolve vazio no prazo', nunca === false);

  console.log('\n=== O main tenta de novo com a página recarregada ===');
  const handler = recorta("handleNoPainel('painel:publicar'", '// ----- Registro.br: trocar os servidores DNS');
  check('a etapa estado reabre a janela quando a aba não carregou', /abaNaoCarregou[\s\S]*painelDescartarJanela\(\)[\s\S]*abrirPainelLogado\(url, push\)[\s\S]*painelEstadoPublicacao\(win\)/.test(handler));

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
