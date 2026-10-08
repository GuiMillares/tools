// ADR-147: a razão social a partir do que a página do AppSheet mostra (linhas
// da lista e folhas de texto do detalhe), sem DOM nem rede.
//
//     node tools/test-appsheet.js

const path = require('path');
const A = require(path.join(__dirname, '..', 'lib', 'appsheet'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

console.log('\n=== O app real: "Search Informações Cliente" e o campo "Cliente" (print de 08/10) ===');
{
  // O detalhe mostra ID Original / Cliente / CNPJ (rótulo em cima do valor) e
  // não necessariamente o site; a linha clicada na lista citava o domínio.
  const folhas = ['Backup Informações Sense Data', 'ID Original', '27-99-1', 'Cliente', 'MPR INDUSTRIA E COMERCIO DE DISPLAYS PROMOCIONAIS', 'CNPJ', '00.133.670/0001-86'];
  const r = A.acharRazaoNoAppSheet({ folhas, detalheDe: 'mprdisplays.com.br\nMPR INDUSTRIA E COMERCIO DE DISPLAYS PROMOCIONAIS' }, 'mprdisplays.com.br');
  check('razão social pelo campo "Cliente", com o detalhe aberto da linha do domínio', r.achou && r.razao === 'MPR INDUSTRIA E COMERCIO DE DISPLAYS PROMOCIONAIS' && /"Cliente"/.test(r.via), JSON.stringify(r));
  check('o mesmo detalhe sem a linha de origem e sem o site: não dá para confiar, cai na lista (vazia) e diz que não aparece', !A.acharRazaoNoAppSheet({ folhas }, 'mprdisplays.com.br').achou);
  check('detalhe de outro cliente aberto por engano (a linha não cita o domínio) não serve', !A.acharRazaoNoAppSheet({ folhas, detalheDe: 'outro.com.br\nOUTRA EMPRESA' }, 'mprdisplays.com.br').achou);
  check('"ID Original" e o CNPJ nunca viram razão social', A.acharRazaoNoAppSheet({ folhas: ['ID Original', '27-99-1', 'CNPJ', '00.133.670/0001-86', 'Site', 'mprdisplays.com.br'], detalheDe: 'mprdisplays.com.br' }, 'mprdisplays.com.br').achou === false);
}

console.log('\n=== Pela tela de detalhe (rótulo → valor) ===');
{
  const folhas = ['Informações Cliente', 'Domínio', 'www.alternativasolucoes.com.br', 'Razão Social', 'ALEX DANTAS DE SANTANA - ALTERNATIVA SOLUCOES SERV', 'CNPJ', '12.345.678/0001-90', 'Telefone', '(11) 99999-9999', 'E-mail', 'contato@alternativasolucoes.com.br'];
  const r = A.acharRazaoNoAppSheet({ folhas }, 'alternativasolucoes.com.br');
  check('acha a razão social pelo rótulo "Razão Social"', r.achou && r.razao === 'ALEX DANTAS DE SANTANA - ALTERNATIVA SOLUCOES SERV' && /Razão Social/.test(r.via), JSON.stringify(r));
  check('aceita o domínio com www e https na busca', A.acharRazaoNoAppSheet({ folhas }, 'https://www.alternativasolucoes.com.br/').razao === 'ALEX DANTAS DE SANTANA - ALTERNATIVA SOLUCOES SERV');
  check('rótulo e valor na mesma folha ("Razão Social: X")', A.acharRazaoNoAppSheet({ folhas: ['Site: acme.com.br', 'Razão Social: ACME COMERCIO LTDA'] }, 'acme.com.br').razao === 'ACME COMERCIO LTDA');
  check('o detalhe de OUTRO cliente (sem o domínio) não serve', !A.acharRazaoNoAppSheet({ folhas: ['Domínio', 'outro.com.br', 'Razão Social', 'OUTRA LTDA'] }, 'acme.com.br').achou);
  check('sem rótulo de razão social, cai na linha da lista', A.acharRazaoNoAppSheet({ folhas: ['Domínio', 'acme.com.br', 'Telefone', '11 4002-8922'], linhas: [{ texto: 'acme.com.br\nACME COMERCIO LTDA\n11 4002-8922' }] }, 'acme.com.br').razao === 'ACME COMERCIO LTDA');
  check('rótulo "Empresa" também vale', A.acharRazaoNoAppSheet({ folhas: ['Site', 'acme.com.br', 'Empresa', 'ACME COMERCIO LTDA'] }, 'acme.com.br').razao === 'ACME COMERCIO LTDA');
}

console.log('\n=== Pela linha da lista ===');
{
  const linhas = [
    { texto: 'outrocliente.com.br\nOUTRO CLIENTE ME\n(11) 1111-1111' },
    { texto: 'cliente.com.br\nCLIENTE SERVICOS LTDA\ncontato@cliente.com.br\n(11) 2222-2222\n01/02/2024' },
  ];
  const r = A.acharRazaoNoAppSheet({ linhas }, 'cliente.com.br');
  check('pega a linha do domínio certo (não "outrocliente.com.br") e o pedaço que termina em LTDA', r.achou && r.razao === 'CLIENTE SERVICOS LTDA' && r.via === 'linha da lista', JSON.stringify(r));
  check('e-mail, telefone, data e o próprio domínio não viram razão social', A.acharRazaoNoAppSheet({ linhas: [{ texto: 'cliente.com.br\ncontato@cliente.com.br\n(11) 2222-2222\n01/02/2024\nPadaria Central' }] }, 'cliente.com.br').razao === 'Padaria Central');
  check('sem sufixo de empresa, o primeiro pedaço que parece nome', A.acharRazaoNoAppSheet({ linhas: ['www.cliente.com.br\nClinica Sorriso\nSao Paulo'] }, 'cliente.com.br').razao === 'Clinica Sorriso');
  check('domínio presente mas só com dados que não são nome: não reconhece, e diz isso', (() => { const x = A.acharRazaoNoAppSheet({ linhas: ['cliente.com.br\n(11) 2222-2222'] }, 'cliente.com.br'); return !x.achou && /não reconheci/.test(x.motivo); })());
  check('domínio ausente: não aparece no AppSheet', (() => { const x = A.acharRazaoNoAppSheet({ linhas: ['outro.com.br\nOUTRO LTDA'] }, 'cliente.com.br'); return !x.achou && /não aparece/.test(x.motivo); })());
  check('vazio não quebra', !A.acharRazaoNoAppSheet({}, 'cliente.com.br').achou && !A.acharRazaoNoAppSheet(undefined, '').achou);
}

console.log('\n=== As linhas que o filtro da view deixou (casos vistos ao vivo em 08/10) ===');
{
  const L = (cliente, extra = {}) => ({ tabela: 'Busca Cliente', id: 'Table_RowElement_Base_Cliente_Busca_1', cliente, dominio: '', ftp: '', descricao: '', texto: '', ...extra });
  // casapersianas.com.br: uma linha só, sem o domínio em coluna visível (está na ação "Open Url").
  let r = A.escolherLinhaAppSheet([L('RAFAEL DE CARLO ROVERE DA SILVA 33602962814', { descricao: 'dicarlovidro - GRUPO DI CARLO' })], 'casapersianas.com.br');
  check('uma linha filtrada: é o cliente, mesmo sem o domínio visível', r.achou && r.razao === 'RAFAEL DE CARLO ROVERE DA SILVA 33602962814' && /linha do AppSheet \(Busca Cliente\)/.test(r.via), JSON.stringify(r));
  // mpr.com.br: três linhas (MPR e duas da ROMA); a coluna FTP "ftp.mpr.com.br" desempata.
  const mpr = [L('MPR INDUSTRIA E COMERCIO DE DISPLAYS PROMOCIONAIS', { ftp: 'ftp.mpr.com.br', descricao: 'mpr - MPR INDUSTRIA E COMERCIO' }), L('ROMA COMERCIO DE MATERIAL PROMOCIONAL LTDA', { ftp: 'ftp.romapdv.com.br' }), L('ROMA COMERCIO DE MATERIAL PROMOCIONAL LTDA', { tabela: 'Soluções Industriais', descricao: 'mpr - ROMA COMERCIO DE MATERIAL' })];
  r = A.escolherLinhaAppSheet(mpr, 'mpr.com.br');
  check('várias linhas de clientes diferentes: fica com a que cita o domínio numa coluna (FTP)', r.achou && r.razao === 'MPR INDUSTRIA E COMERCIO DE DISPLAYS PROMOCIONAIS' && /cita o domínio, entre 2 clientes/.test(r.via), JSON.stringify(r));
  check('"mpr - ROMA" na descrição não é citar o domínio (mpr ≠ mpr.com.br)', !A.textoCitaDominio('mpr - ROMA COMERCIO DE MATERIAL', 'mpr.com.br'));
  // Duas linhas do MESMO cliente (tabelas diferentes): é ele.
  r = A.escolherLinhaAppSheet([L('ACME LTDA'), L('ACME LTDA', { tabela: 'Soluções Industriais' })], 'acme.com.br');
  check('linhas repetidas do mesmo cliente: é ele, e a via diz quantas', r.achou && r.razao === 'ACME LTDA' && /2 linhas do AppSheet/.test(r.via), JSON.stringify(r));
  // Clientes diferentes e nenhum cita o domínio: ambíguo → revisar, com os nomes.
  r = A.escolherLinhaAppSheet([L('ACME LTDA'), L('BETA ME')], 'acme.com.br');
  check('clientes diferentes sem desempate: ambíguo, com os nomes, para revisar', !r.achou && r.ambiguo && /2 clientes \(ACME LTDA; BETA ME\)/.test(r.motivo) && r.candidatos.length === 2, JSON.stringify(r));
  check('nada filtrado: o domínio não aparece', (() => { const x = A.escolherLinhaAppSheet([], 'acme.com.br'); return !x.achou && /não aparece/.test(x.motivo); })());
  check('linha sem o campo Cliente: diz isso', (() => { const x = A.escolherLinhaAppSheet([L('')], 'acme.com.br'); return !x.achou && /sem o campo Cliente/.test(x.motivo); })());
  check('o script da página é uma função assíncrona válida e leva o domínio em minúsculas', (() => { const s = A.JS_BUSCAR('ACME.com.br'); try { new Function('return (async () => {' + s + '})')(); } catch (e) { return false; } return /"acme\.com\.br"/.test(s) && /TableViewRow/.test(s) && /Search|pesquis/.test(s); })());
}

console.log('\n=== Auxiliares ===');
{
  check('textoCitaDominio exige o domínio inteiro', A.textoCitaDominio('site: www.cliente.com.br', 'cliente.com.br') && !A.textoCitaDominio('outrocliente.com.br', 'cliente.com.br'));
  check('pareceRazaoSocial recusa URL, e-mail, CNPJ, número e rótulo', !A.pareceRazaoSocial('https://x.com', 'x.com') && !A.pareceRazaoSocial('a@b.com', 'x.com') && !A.pareceRazaoSocial('12.345.678/0001-90', 'x.com') && !A.pareceRazaoSocial('1234', 'x.com') && !A.pareceRazaoSocial('Razão Social:', 'x.com') && A.pareceRazaoSocial('ACME LTDA', 'x.com'));
  check('limparDominio tira protocolo, www e caminho', A.limparDominio('HTTPS://WWW.Acme.com.br/loja') === 'acme.com.br');
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
