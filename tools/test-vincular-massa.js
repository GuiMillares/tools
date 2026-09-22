// Leitura da planilha do "Vincular em massa" (ADR-047, ADR-053). Não abre o
// app: recorta do renderer/app.js e do main.js só as funções puras e roda em
// cima delas, que é o que dá para testar sem Electron.
//
//     node tools/test-vincular-massa.js

const fs = require('fs');
const path = require('path');

const fonteApp = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');
const fonteMain = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');

// Recorta por marcador: se alguém renomear a função, o teste morre aqui em vez
// de passar em cima de uma cópia velha colada no teste.
function recorta(fonte, inicio, fim) {
  const i = fonte.indexOf(inicio);
  const f = fonte.indexOf(fim, i);
  if (i < 0 || f < 0) throw new Error(`não achei o trecho "${inicio}"`);
  return fonte.slice(i, f);
}

const trechosApp = [
  `const PAINEL_MPI_HOST = '${(fonteApp.match(/const PAINEL_MPI_HOST = '([^']+)'/) || [])[1]}';`,
  recorta(fonteApp, 'function normalizePainelUrl(', '\nfunction brandHasBitbucket('),
  recorta(fonteApp, 'function normalizeDomain(', '\nfunction panelIdForBrand('),
  recorta(fonteApp, 'const BULK_PAPEIS = {', '\n// Da planilha crua para a lista de sites'),
  // bulkMontarLinhas lê variáveis de módulo; aqui viram parâmetros via wrapper.
  'let bulkLinhas = [], bulkMapa = null, bulkTemCabecalho = false;',
  recorta(fonteApp, 'function bulkMontarLinhas()', '\nconst BULK_STATUS'),
  `return {
    bulkDetectarCabecalho, bulkDetectarColunas,
    montar: (linhas) => { bulkLinhas = linhas; bulkTemCabecalho = bulkDetectarCabecalho(linhas); bulkMapa = bulkDetectarColunas(linhas, bulkTemCabecalho); return { mapa: bulkMapa, cabecalho: bulkTemCabecalho, ...bulkMontarLinhas() }; },
  };`,
].join('\n\n');
const A = new Function(trechosApp)();

const trechosMain = [
  recorta(fonteMain, 'function separadorDeTexto(', '\nfunction lerPlanilhaBinaria('),
  'return { lerTextoTabular, separadorDeTexto };',
].join('\n\n');
const M = new Function(trechosMain)();

let falhas = 0;
const check = (nome, cond, extra) => {
  if (cond) console.log(`  ok   ${nome}`);
  else { falhas++; console.log(`  FALHOU  ${nome}${extra ? ` (${extra})` : ''}`); }
};

const PAINEL = 'https://idealplus.idealtrends.io/clientes/2775/hub?projeto=2851&tab=publicacao';

console.log('\n=== Texto vira linhas e colunas (main.js) ===');
{
  const t1 = M.lerTextoTabular(`Razão Social;Domínio;Painel\nClínica X;clinicax.com.br;${PAINEL}`);
  check('ponto-e-vírgula', t1.length === 2 && t1[1][1] === 'clinicax.com.br', JSON.stringify(t1));
  const t2 = M.lerTextoTabular(`Clínica X\tclinicax.com.br\t${PAINEL}`);
  check('tabulação (colado do Excel)', t2[0].length === 3 && t2[0][2] === PAINEL, JSON.stringify(t2));
  const t3 = M.lerTextoTabular(`"Empresa, Ltda","empresa.com.br","${PAINEL}"`);
  check('vírgula com aspas, e vírgula dentro do nome', t3[0][0] === 'Empresa, Ltda' && t3[0][1] === 'empresa.com.br', JSON.stringify(t3));
  const t4 = M.lerTextoTabular(`﻿a;b\n\n\nc;d\n`);
  check('ignora BOM e linhas vazias', t4.length === 2 && t4[0][0] === 'a', JSON.stringify(t4));
  check('vazio devolve vazio', M.lerTextoTabular('  \n ').length === 0);
}

console.log('\n=== Reconhecer as colunas pelo cabeçalho ===');
{
  const r = A.montar([
    ['Razão Social', 'Domínio', 'Link do painel'],
    ['Clínica Humanizzi', 'clinicahumanizzi.com.br', PAINEL],
    ['Starex', 'https://www.starexemergencias.com.br/', PAINEL],
  ]);
  check('detecta cabeçalho', r.cabecalho === true);
  check('razão social na coluna 0', r.mapa.razao === 0, JSON.stringify(r.mapa));
  check('domínio na 1', r.mapa.dominio === 1, JSON.stringify(r.mapa));
  check('painel na 2', r.mapa.painel === 2, JSON.stringify(r.mapa));
  check('duas linhas prontas', r.rows.length === 2 && r.rows.every((x) => x.painelOk));
  check('razão social vai junto', r.rows[0].razao === 'Clínica Humanizzi');
  check('domínio entra normalizado', r.rows[1].dominio === 'starexemergencias.com.br', r.rows[1].dominio);
}

console.log('\n=== Reconhecer as colunas pelo conteúdo, sem cabeçalho e fora de ordem ===');
{
  const r = A.montar([
    [PAINEL, 'Clínica Humanizzi', 'clinicahumanizzi.com.br'],
    [PAINEL, 'Padaria do Bairro Ltda', 'padariadobairro.com.br'],
  ]);
  check('sem cabeçalho', r.cabecalho === false);
  check('painel achado pela URL', r.mapa.painel === 0, JSON.stringify(r.mapa));
  check('domínio achado pelo formato', r.mapa.dominio === 2, JSON.stringify(r.mapa));
  check('razão social é o que sobrou com texto', r.mapa.razao === 1, JSON.stringify(r.mapa));
  check('todas as linhas prontas', r.rows.length === 2 && r.rows.every((x) => x.painelOk));
}

console.log('\n=== Planilha com colunas a mais ===');
{
  const r = A.montar([
    ['ID', 'Cliente', 'Contato', 'Site', 'Hub', 'Obs'],
    ['12', 'Clínica X', 'joao@x.com', 'clinicax.com.br', PAINEL, 'ok'],
    ['13', 'Empresa Y', 'ana@y.com', 'empresay.com.br', PAINEL, ''],
  ]);
  check('ignora ID, contato e observação', r.mapa.dominio === 3 && r.mapa.painel === 4, JSON.stringify(r.mapa));
  check('razão social pelo cabeçalho "Cliente"', r.mapa.razao === 1, JSON.stringify(r.mapa));
  check('e-mail não vira domínio', r.rows.every((x) => !x.dominio.includes('@')));
}

console.log('\n=== O que não dá para rodar fica marcado, não some ===');
{
  const r = A.montar([
    ['dominio', 'painel'],
    ['cliente.com.br', PAINEL],
    ['semlink.com.br', ''],
    ['errado.com.br', 'https://outrolugar.com/painel'],
    ['cliente.com.br', PAINEL],
  ]);
  const por = Object.fromEntries(r.rows.map((x) => [x.dominio, x]));
  check('a linha boa fica pronta', por['cliente.com.br']?.status === 'pendente');
  check('sem link continua na lista, marcada', por['semlink.com.br']?.painelOk === false && /sem link/.test(por['semlink.com.br']?.detalhe));
  check('link de outro site é recusado', por['errado.com.br']?.status === 'invalido');
  check('repetido conta uma vez e avisa', r.rows.filter((x) => x.dominio === 'cliente.com.br').length === 1 && r.erros.some((e) => /repetido/.test(e)));
}

console.log('\n=== Sem coluna de domínio, nada roda ===');
{
  const r = A.montar([['Cliente', 'Contato'], ['X', 'a@b.c']]);
  check('domínio não encontrado', r.mapa.dominio === -1, JSON.stringify(r.mapa));
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
