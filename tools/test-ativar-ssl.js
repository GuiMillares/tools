// Modelos da ferramenta "Ativar SSL" (ADR-057): o {projeto} é resolvido na
// tela, antes do envio, e o processo principal só vê {dominio}. Recorta as
// funções puras do renderer/app.js e do main.js.
//
//     node tools/test-ativar-ssl.js

const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');

function recorta(fonte, inicio, fim) {
  const i = fonte.indexOf(inicio);
  const f = fonte.indexOf(fim, i);
  if (i < 0 || f < 0) throw new Error(`não achei "${inicio}"`);
  return fonte.slice(i, f);
}

const R = new Function(
  [
    'const state = { view: "ssl", sslProjeto: "MPI Solutions", mail: null, mailSsl: null };',
    recorta(app, 'const MAIL_MODOS = {', '\nasync function refreshMsStatus('),
    'return { MAIL_MODOS, SSL_PROJETOS, mailModo, mailSettings, mailExtras, fillTemplate, state };',
  ].join('\n')
)();

const M = new Function(recorta(main, 'function fillTemplate(', '\n}') + '\n}\nreturn { fillTemplate };')();

let falhas = 0;
const check = (n, c, d) => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

console.log('\n=== Modelos padrão da ativação de SSL ===');
{
  const m = R.mailSettings();
  check('assunto pedido pelo Everton', m.subject === 'Ativação SSL - {projeto} - {dominio}', m.subject);
  check('corpo pedido pelo Everton', m.body === 'Solicito ativação SSL do projeto {dominio}', m.body);
  check('mesmo destino do suporte', m.to === 'suporte@m3solutions.com.br');
}

console.log('\n=== {projeto} resolvido na tela ===');
{
  const m = R.mailSettings();
  const assunto = R.fillTemplate(m.subject, '{dominio}', R.mailExtras());
  check('o projeto entra e o {dominio} fica para o envio', assunto === 'Ativação SSL - MPI Solutions - {dominio}', assunto);
  check('e o processo principal completa o domínio', M.fillTemplate(assunto, 'cliente.com.br') === 'Ativação SSL - MPI Solutions - cliente.com.br');

  R.state.sslProjeto = 'Busca Cliente';
  check('trocar o seletor troca o assunto', R.fillTemplate(m.subject, 'x.com.br', R.mailExtras()) === 'Ativação SSL - Busca Cliente - x.com.br');
  check('as duas opções são os nomes das marcas', R.SSL_PROJETOS.join('|') === 'Busca Cliente|MPI Solutions');
}

console.log('\n=== Os dois modos não se misturam ===');
{
  R.state.view = 'suspender';
  const m = R.mailSettings();
  check('suspender continua com o modelo dele', m.subject === 'Suspensão de site - {dominio}', m.subject);
  check('suspender não tem {projeto}', Object.keys(R.mailExtras()).length === 0);
  check('{projeto} sem valor some em vez de ficar literal', R.fillTemplate('a {projeto} b', 'x') === 'a  b');

  R.state.mailSsl = { subject: 'Meu assunto {projeto} {dominio}' };
  R.state.view = 'ssl';
  check('edição do SSL fica só no SSL', R.mailSettings().subject === 'Meu assunto {projeto} {dominio}');
  R.state.view = 'suspender';
  check('e não vaza para o suspender', R.mailSettings().subject === 'Suspensão de site - {dominio}');
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
