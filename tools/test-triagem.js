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

  // cuidarecia: Busca Cliente apontada via registro (sem temporário) → não é MPI+.
  const t3 = {
    assunto: 'Publicação (Troca de DNS) - www.cuidarecia.com.br',
    descricao: 'Apontado via registro.',
  };
  const r3 = T.triar(t3);
  check('cuidarecia = publicação, mas NÃO MPI+ (é Busca One)', r3.tipo === 'publicacao' && r3.plataforma === 'buscaone' && r3.marca === null, JSON.stringify(r3));

  // Busca One MPI Solutions: producao.mpitemporario → não é MPI+.
  const t4 = {
    assunto: 'Publicação (Troca de DNS) - exemplo.com.br',
    descricao: 'link temporário - http://producao.mpitemporario.com.br/',
  };
  const r4 = T.triar(t4);
  check('producao.mpitemporario = NÃO é MPI+ (é Busca One)', r4.tipo === 'publicacao' && r4.plataforma === 'buscaone', JSON.stringify(r4));
  check('as MPI+ vêm com plataforma mpiplus', r1.plataforma === 'mpiplus' && r2.plataforma === 'mpiplus');
}

console.log('\n=== Publicação Busca One (fase 2, ADR-132/133) ===');
{
  // Apontado via registro: domínio no assunto, sem temporário, sem ID, sem empresa.
  const r3 = T.triar({ assunto: 'Publicação (Troca de DNS) - www.cuidarecia.com.br', descricao: 'Apontado via registro.' });
  check('"Apontado via registro." = Busca One elegível', r3.plataforma === 'buscaone' && r3.elegivel === true, JSON.stringify(r3));
  check('  domínio do assunto (sem www)', r3.dominio === 'cuidarecia.com.br', r3.dominio);
  check('  sem temporário, sem repositório, sem ID, sem empresa', r3.temporario === '' && r3.repositorio === '' && r3.idPainel === '' && r3.marca === null, JSON.stringify(r3));

  // O modelo combinado com o atendimento (01/10/2026): temporário com o
  // caminho, o domínio a usar e "ID do painel".
  const r4 = T.triar({ assunto: 'Publicação (Troca de DNS) - Ecolife Ambiental', descricao: '- link temporário: https://deploy.buscaclientes.com.br/ecolifeambiental.eco.br/\n\necolifeambiental.eco.br - domínio para ser usado\nID do painel 4521' });
  check('modelo padrão: temporário deploy.buscaclientes = Busca Cliente', r4.elegivel === true && r4.marca === 'bc' && r4.temporario === 'deploy.buscaclientes.com.br', JSON.stringify(r4));
  check('  repositório = o que vem depois da barra do temporário', r4.repositorio === 'ecolifeambiental.eco.br', r4.repositorio);
  check('  domínio .eco.br do comentário (o assunto não tem domínio)', r4.dominio === 'ecolifeambiental.eco.br', r4.dominio);
  check('  "ID do painel 4521" lido', r4.idPainel === '4521', r4.idPainel);
  check('  "ID do painel xxxx" (modelo sem preencher) = sem ID', T.triar({ assunto: 'Publicação (Troca de DNS) - a.com.br', descricao: 'ID do painel xxxx' }).idPainel === '');

  // producao.mpitemporario → MPI Solutions; "ID 1234"; repositório diferente
  // do domínio real; e-mail no comentário não é domínio.
  const r5 = T.triar({ assunto: 'Publicação (Troca de DNS) - clientex.com.br', descricao: 'link temporário - http://producao.mpitemporario.com.br/clientex.com/\nDomínio: https://www.clientex.com.br/\nID 1234\ncontato: joao@empresaqualquer.com.br' });
  check('producao.mpitemporario = MPI Solutions', r5.marca === 'mpisolutions' && r5.temporario === 'producao.mpitemporario.com.br', JSON.stringify(r5));
  check('  repositório clientex.com (do caminho); domínio real clientex.com.br (o outro)', r5.repositorio === 'clientex.com' && r5.dominio === 'clientex.com.br', JSON.stringify(r5));
  check('  "ID 1234" lido do comentário', r5.idPainel === '1234', r5.idPainel);
  check('  e-mail no comentário não vira domínio', r5.dominio !== 'empresaqualquer.com.br');

  // Assunto repete o repositório e o comentário traz o domínio real: o outro vence.
  const r6 = T.triar({ assunto: 'Publicação (Troca de DNS) - antigo.com.br', descricao: 'http://deploy.buscacliente.com.br/antigo.com.br/ https://www.novo.com.br/' });
  check('assunto = repositório e o comentário tem outro: o outro é o domínio real', r6.repositorio === 'antigo.com.br' && r6.dominio === 'novo.com.br' && r6.marca === 'bc', JSON.stringify(r6));
  check('  grafia sem "s" (deploy.buscacliente) também vale', r6.temporario === 'deploy.buscacliente.com.br');

  // Só um domínio, igual ao repositório: é ele.
  const r7 = T.triar({ assunto: 'Publicação (Troca de DNS) - x.com.br', descricao: 'http://deploy.buscaclientes.com.br/x.com.br/ https://www.x.com.br/' });
  check('único domínio = repositório: usa ele', r7.dominio === 'x.com.br' && r7.repositorio === 'x.com.br', JSON.stringify(r7));

  // Caminho que não parece domínio, ou temporário sem caminho: sem repositório
  // (o commit vai para o domínio).
  const r8 = T.triar({ assunto: 'Publicação (Troca de DNS) - y.com.br', descricao: 'http://deploy.buscaclientes.com.br/pasta/ https://y.com.br' });
  check('caminho que não parece domínio: repositório vazio', r8.repositorio === '' && r8.dominio === 'y.com.br' && r8.marca === 'bc', JSON.stringify(r8));
  const r9 = T.triar({ assunto: 'Publicação (Troca de DNS) - exemplo.com.br', descricao: 'link temporário - http://producao.mpitemporario.com.br/' });
  check('temporário sem caminho: empresa sim, repositório não', r9.marca === 'mpisolutions' && r9.repositorio === '' && r9.dominio === 'exemplo.com.br', JSON.stringify(r9));

  // ID no assunto; "id=" de URL, número de caso e links de infra não enganam.
  const r10 = T.triar({ assunto: 'Publicação (Troca de DNS) ID 42 - loja.com', descricao: 'Caso 00087159 https://x.lightning.force.com/lightning/r/Case/500bL000/view?id=999 https://bitbucket.org/bc/loja.com' });
  check('ID do assunto vale quando o comentário não tem', r10.idPainel === '42', r10.idPainel);
  check('  domínio .com do assunto; links de infra ignorados', r10.dominio === 'loja.com', r10.dominio);

  // Comentário primeiro: o ID do comentário vence o do assunto.
  const r11 = T.triar({ assunto: 'Publicação (Troca de DNS) ID 1 - a.com.br', descricao: 'ID 2' });
  check('ID do comentário tem prioridade sobre o do assunto', r11.idPainel === '2', r11.idPainel);

  // Sem domínio em lugar nenhum → não elegível, com motivo.
  const r12 = T.triar({ assunto: 'Publicação (Troca de DNS) - Padaria do Zé', descricao: 'ID 10' });
  check('sem domínio = Busca One não elegível, com motivo', r12.plataforma === 'buscaone' && r12.elegivel === false && /domínio/.test(r12.motivo), JSON.stringify(r12));

  check('idPainelDoTexto: "Id do painel: 77"', T.idPainelDoTexto('Id do painel: 77') === '77');
  check('idPainelDoTexto: "ID#9"', T.idPainelDoTexto('ID#9') === '9');
  check('idPainelDoTexto ignora id= de URL', T.idPainelDoTexto('https://a.com/?id=123') === '');
  check('idPainelDoTexto ignora número de caso (8 dígitos)', T.idPainelDoTexto('ID 00087159') === '');
  check('idPainelDoTexto ignora "ID xxxx" sem número', T.idPainelDoTexto('ID xxxx') === '');
  check('idPainelDoTexto não casa "id" dentro de palavra', T.idPainelDoTexto('Valid 123') === '');
  check('pareceDominio', T.pareceDominio('a.com') && T.pareceDominio('a.com.br') && T.pareceDominio('ecolifeambiental.eco.br') && !T.pareceDominio('cliente novo ltda') && !T.pareceDominio('semponto'));
  check('ehHostInfra', T.ehHostInfra('deploy.buscaclientes.com.br') && T.ehHostInfra('deploy.buscacliente.com.br') && T.ehHostInfra('bitbucket.org') && !T.ehHostInfra('cliente.com.br'));
  check('empresaPeloTemporario', T.empresaPeloTemporario('deploy.buscaclientes.com.br') === 'bc' && T.empresaPeloTemporario('producao.mpitemporario.com.br') === 'mpisolutions' && T.empresaPeloTemporario('x.mpitemporario.com.br') === null);
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
