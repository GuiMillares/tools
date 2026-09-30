// ADR-119: triagem das tarefas da fila para a automação. Casos tirados de
// tarefas reais do Salesforce do Guilherme.
//
//     node tools/test-triagem.js

const path = require('path');
const T = require(path.join(__dirname, '..', 'lib', 'triagem'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

console.log('\n=== Marca pelo IP do apontamento ===');
check('149.18.103.138 = MPI Solutions', T.marcaPorIp('149.18.103.138') === 'mpisolutions');
check('149.18.102.39 = MPI+', T.marcaPorIp('149.18.102.39') === 'mpiplus');
check('149.18.103.98 = Busca Cliente', T.marcaPorIp('149.18.103.98') === 'bc');
check('149.18.103.106 = Busca Cliente', T.marcaPorIp('149.18.103.106') === 'bc');
check('IP desconhecido = null', T.marcaPorIp('8.8.8.8') === null);
check('marcaPorIps pega o primeiro conhecido', T.marcaPorIps(['1.2.3.4', '149.18.103.138']) === 'mpisolutions');

console.log('\n=== Normalização de domínio ===');
check('tira https/www/barra', T.limparDominio('https://www.cuidarecia.com.br/') === 'cuidarecia.com.br');
check('já limpo continua', T.limparDominio('embratecbombas.com.br') === 'embratecbombas.com.br');

console.log('\n=== Publicação MPI+ (tarefas reais) ===');
{
  // rrdesentupidora: assunto com URL completa, comentário com rótulos.
  const t1 = {
    assunto: 'Publicação (Troca de DNS) - https://www.rrdesentupidoraehidrojato.com.br/',
    descricao: 'link temporário - http://rrdesentupidora.mpitemporario.com.br/ Domínio: https://www.rrdesentupidoraehidrojato.com.br/',
  };
  const r1 = T.triar(t1);
  check('rrdesentupidora = publicação MPI+ elegível', r1.tipo === 'publicacao' && r1.marca === 'mpiplus' && r1.elegivel === true, JSON.stringify(r1));
  check('  domínio final correto', r1.dominio === 'rrdesentupidoraehidrojato.com.br', r1.dominio);
  check('  temporário correto', r1.temporario === 'rrdesentupidora.mpitemporario.com.br', r1.temporario);

  // embratecbombas: assunto com "MPI+", comentário solto.
  const t2 = {
    assunto: 'Publicação (Troca de DNS) MPI+ - embratecbombas.com.br',
    descricao: 'Favor seguir com a publicação do projeto. https://embratecbombas.com.br/ http://embratecbombas.mpitemporario.com.br/',
  };
  const r2 = T.triar(t2);
  check('embratecbombas = publicação MPI+ elegível', r2.tipo === 'publicacao' && r2.marca === 'mpiplus' && r2.elegivel === true, JSON.stringify(r2));
  check('  domínio final correto', r2.dominio === 'embratecbombas.com.br', r2.dominio);
  check('  temporário correto', r2.temporario === 'embratecbombas.mpitemporario.com.br', r2.temporario);

  // cuidarecia: Busca Cliente apontada via registro (sem temporário) → pula.
  const t3 = {
    assunto: 'Publicação (Troca de DNS) - www.cuidarecia.com.br',
    descricao: 'Apontado via registro.',
  };
  const r3 = T.triar(t3);
  check('cuidarecia = publicação NÃO elegível (Busca One, fase 2)', r3.tipo === 'publicacao' && r3.elegivel === false, JSON.stringify(r3));

  // Busca One MPI Solutions: producao.mpitemporario → não é MPI+.
  const t4 = {
    assunto: 'Publicação (Troca de DNS) - exemplo.com.br',
    descricao: 'link temporário - http://producao.mpitemporario.com.br/',
  };
  const r4 = T.triar(t4);
  check('producao.mpitemporario = NÃO elegível (MPI Solutions)', r4.tipo === 'publicacao' && r4.elegivel === false, JSON.stringify(r4));
}

console.log('\n=== Bloqueio de contatos (tarefas reais) ===');
{
  const b1 = { assunto: 'BLOQUEIO DE CONTATOS - https://dgosolucoesemesquadrias.com.br/', descricao: 'BLOQUEIO DEVIDO INADIMPLENCIA E FALTA DE RETORNO' };
  const r1 = T.triar(b1);
  check('BLOQUEIO DE CONTATOS reconhecido', r1.tipo === 'bloqueio' && r1.elegivel === true, JSON.stringify(r1));
  check('  domínio correto', r1.dominio === 'dgosolucoesemesquadrias.com.br', r1.dominio);

  const b2 = { assunto: 'RETIRAR CONTATOS, E-MAILS E ENDEREÇO - fabricadeplasticoscuritiba.com.br', descricao: 'e-mail ... telefone ... whatsapp ...' };
  const r2 = T.triar(b2);
  check('RETIRAR CONTATOS reconhecido', r2.tipo === 'bloqueio' && r2.elegivel === true, JSON.stringify(r2));
  check('  domínio correto', r2.dominio === 'fabricadeplasticoscuritiba.com.br', r2.dominio);
}

console.log('\n=== Ignora o que não é publicação nem bloqueio ===');
check('outra tarefa = ignorar', T.triar({ assunto: 'Ligar para o cliente', descricao: '' }).tipo === 'ignorar');
check('tarefa fechada = ignorar', T.triar({ assunto: 'BLOQUEIO DE CONTATOS - x.com.br', fechada: true }).tipo === 'ignorar');

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
