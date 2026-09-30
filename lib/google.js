// O pedaço do googleapis que o Hub usa (ADR-107).
//
// require('googleapis') carrega as 335 APIs do pacote: 2 a 3 s na abertura e
// ~57 MB de heap no processo principal (ADR-106), para usar 6. Aqui cada uma
// vem do próprio pacote (googleapis/build/src/apis/<nome>) e só no primeiro
// uso: abrir o Hub não carrega nada do Google.
//
// O objeto tem a mesma cara do `google` do pacote, para o main.js não mudar:
// google.auth.GoogleAuth, google.auth.OAuth2, google.options() e uma função
// por API. E o mesmo comportamento onde importa: o cliente de cada API recebe
// este objeto como contexto e lê google._options a cada requisição (é o que o
// googleapis-common faz, em apirequest.js). Por isso google.options() continua
// trocando a autenticação de todos os clientes de uma vez, inclusive dos que
// já existiam, e continua substituindo as opções inteiras em vez de juntar,
// como o GoogleApis.options() do pacote. tools/test-google-leve.js roda o
// mesmo roteiro aqui e no pacote inteiro e compara.
//
// API nova no main.js entra na lista abaixo; o teste falha se faltar.

const APIS = ['tagmanager', 'analyticsadmin', 'siteVerification', 'searchconsole', 'recaptchaenterprise', 'oauth2'];

const google = {
  _options: {},
  options(opcoes) {
    google._options = opcoes || {};
  },
};

// As classes de autenticação são as do google-auth-library que o próprio
// googleapis usa, tiradas do AuthPlus de um módulo de API: assim não dependem
// de o npm deixar o google-auth-library no topo do node_modules.
let authPlus = null;
const autenticacao = () => (authPlus ||= require('googleapis/build/src/apis/oauth2').auth);
google.auth = {
  get GoogleAuth() { return autenticacao().GoogleAuth; },
  get OAuth2() { return autenticacao().OAuth2; },
};

for (const nome of APIS) {
  // O `this` da função de cada módulo vira o contexto do cliente (getAPI, no
  // googleapis-common): é ele que liga o cliente ao google._options.
  google[nome] = (versaoOuOpcoes) => require(`googleapis/build/src/apis/${nome}`)[nome].call(google, versaoOuOpcoes);
}

module.exports = { google, APIS };
