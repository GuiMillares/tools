// ADR-096: log em arquivo e rodada em massa que sobrevive ao Windows fechar tudo.
//
//     node tools/test-retomar-rodada.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');

function recorta(fonte, inicio, fim) {
  const i = fonte.indexOf(inicio);
  const f = fonte.indexOf(fim, i);
  if (i < 0 || f < 0) throw new Error(`não achei o trecho "${inicio}"`);
  return fonte.slice(i, f);
}

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// ---- main, com pastas temporárias no lugar de Documentos e userData ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-rodada-'));
// Apagada na saída, mesmo que o teste lance.
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
const handlers = {};
new Function('app', 'ipcMain', 'fs', 'path', 'require', recorta(main, '// ---------- Log em arquivo e rodada em massa', '// Durante uma rodada em massa'))(
  { getPath: (q) => path.join(tmp, q) },
  { handle: (n, fn) => { handlers[n] = fn; } },
  fs, path, require
);
const chama = (n, arg) => handlers[n](null, arg);

// ---- renderer: leitura da planilha + salvar/restaurar a rodada ----
function montarRenderer() {
  const PAINEL_MPI_HOST = (app.match(/const PAINEL_MPI_HOST = '([^']+)'/) || [])[1];
  const corpo = `
    const PAINEL_MPI_HOST = '${PAINEL_MPI_HOST}';
    ${recorta(app, 'function normalizePainelUrl(', '\nfunction brandHasBitbucket(')}
    ${recorta(app, 'function normalizeDomain(', '\nfunction panelIdForBrand(')}
    ${recorta(app, 'const BULK_PAPEIS = {', '\n// Da planilha crua para a lista de sites')}
    let bulkLinhas = [], bulkMapa = null, bulkTemCabecalho = false, bulkOrigem = '', bulkCriar = true;
    let bulkRows = [], bulkSslPendentes = [], bulkSslAtivados = [], bulkForaDeCasa = [], bulkSfPendentes = [];
    const BULK_NADA_A_FAZER = ['ok'];
    function bulkFilaAtual() { return bulkRows.filter((r) => r.painelOk && !BULK_NADA_A_FAZER.includes(r.status)); }
    ${recorta(app, 'function bulkMontarLinhas()', '\nconst BULK_STATUS')}
    const state = { brand: 'bc' };
    const BRANDS = [{ id: 'bc' }, { id: 'mpiplus' }];
    let salvo = null;
    const window = { api: { salvarRodada: async (e) => { salvo = JSON.parse(JSON.stringify(e)); return { ok: true }; } } };
    ${recorta(app, 'function salvarRodada(fase)', 'async function fecharRodadaSalva()')}
    ${recorta(app, 'function resumoRodada(estado)', 'async function retomarRodada()')}
    return {
      carregar(linhas) { bulkLinhas = linhas; bulkTemCabecalho = bulkDetectarCabecalho(linhas); bulkMapa = bulkDetectarColunas(linhas, bulkTemCabecalho); bulkOrigem = 'Publicação em Massa.xlsx'; bulkRows = bulkMontarLinhas().rows; },
      get rows() { return bulkRows; }, set rows(v) { bulkRows = v; },
      get ssl() { return bulkSslPendentes; }, set ssl(v) { bulkSslPendentes = v; },
      set sfPend(v) { bulkSfPendentes = v; }, get sfPend() { return bulkSfPendentes; },
      set marca(v) { state.brand = v; }, get marca() { return state.brand; },
      salvarRodada, restaurarRodada, resumoRodada, bulkFilaAtual,
      get salvo() { return salvo; },
    };`;
  return new Function(corpo)();
}

(async () => {
  console.log('\n=== Log vai para um arquivo por dia, acumulando ===');
  {
    await chama('log:gravar', { linhas: [{ ts: '22/09/2026 16:35:43', type: 'cmd', message: 'Publicar e vincular: 32 site(s)' }] });
    await chama('log:gravar', { linhas: [{ ts: '22/09/2026 16:35:45', type: 'warn', message: 'linha com\nquebra' }] });
    const pasta = path.join(tmp, 'documents', 'Hub', 'logs');
    const arquivos = fs.existsSync(pasta) ? fs.readdirSync(pasta) : [];
    check('criou Documentos\\Hub\\logs com o arquivo do dia', arquivos.length === 1 && /^hub-\d{4}-\d{2}-\d{2}\.txt$/.test(arquivos[0]), arquivos.join(','));
    const texto = arquivos[0] ? fs.readFileSync(path.join(pasta, arquivos[0]), 'utf-8') : '';
    check('as duas gravações estão no arquivo', /32 site\(s\)/.test(texto) && /linha com quebra/.test(texto), texto);
    check('uma linha por mensagem (quebra de linha vira espaço)', texto.trim().split('\n').length === 2, texto);
  }

  console.log('\n=== Rodada salva: escreve, lê, não deixa temporário, apaga ===');
  {
    const r1 = await chama('rodada:salvar', { fase: 'publicando', sites: [{ dominio: 'a.com.br', status: 'ok' }] });
    check('salvou', r1.ok);
    const r2 = await chama('rodada:ler');
    check('lê de volta o que salvou, com a hora', r2.estado && r2.estado.fase === 'publicando' && r2.estado.sites[0].dominio === 'a.com.br' && !!r2.estado.salvoEm);
    check('não sobrou arquivo .tmp', !fs.readdirSync(path.join(tmp, 'userData')).some((f) => f.endsWith('.tmp')));
    fs.writeFileSync(path.join(tmp, 'userData', 'rodada-em-massa.json'), '{ quebrado');
    const r3 = await chama('rodada:ler');
    check('arquivo estragado não trava: volta sem rodada, com aviso', r3.ok && r3.estado === null && /não consegui ler/.test(r3.aviso || ''));
    await chama('rodada:apagar');
    const r4 = await chama('rodada:ler');
    check('apagar remove a rodada', r4.estado === null && !r4.aviso);
  }

  console.log('\n=== Renderer: salva a rodada e restaura igual depois de um reinício ===');
  {
    const P = 'https://idealplus.idealtrends.io/clientes/2775/hub?projeto=2851&tab=publicacao';
    const C = 'https://grupo-ideal-trends.lightning.force.com/lightning/r/Case/500bL00000cWRcEQAW/view';
    const planilha = [
      ['Razão Social', 'Domínio', 'Link do painel', 'Link do caso'],
      ['A', 'a.com.br', P, C], ['B', 'b.com.br', P, C], ['C', 'c.com.br', P, C], ['D', 'd.com.br', P, ''],
    ];
    const antes = montarRenderer();
    antes.carregar(planilha);
    antes.marca = 'mpiplus';
    const [a, b, c] = antes.rows;
    Object.assign(a, { status: 'ok', detalhe: 'já publicado e já vinculado', publicado: true, publicadoDetalhe: 'já estava publicado', empresa: 'bc' });
    Object.assign(b, { status: 'rodando', publicado: true, empresa: 'mpisolutions' });
    Object.assign(c, { status: 'parcial', detalhe: 'vínculo pendente', publicado: true });
    antes.ssl = [{ dominio: 'c.com.br', motivo: 'SSL não ativou' }];
    antes.sfPend = [c];
    await antes.salvarRodada('publicando');
    const estado = { ...antes.salvo, salvoEm: '2026-09-22T23:41:00.000Z' };
    check('salvou a planilha crua e o mapa de colunas', Array.isArray(estado.linhas) && estado.linhas.length === 5 && estado.mapa && estado.mapa.caso >= 0);
    check('salvou o estado de cada site', estado.sites.length === 4 && estado.sites[0].publicado === true);

    // "Reinício": outro renderer, zerado, lê o que foi salvo.
    const depois = montarRenderer();
    depois.restaurarRodada(estado);
    const porDominio = Object.fromEntries(depois.rows.map((r) => [r.dominio, r]));
    check('a marca volta', depois.marca === 'mpiplus');
    check('quem terminou continua terminado', porDominio['a.com.br'].status === 'ok' && porDominio['a.com.br'].publicado === true);
    check('quem estava rodando volta para a fila', porDominio['b.com.br'].status === 'pendente' && porDominio['b.com.br'].publicado === true);
    check('o link do caso volta junto (vem da planilha salva)', porDominio['a.com.br'].caso === C);
    check('a empresa descoberta volta (não pergunta de novo)', porDominio['b.com.br'].empresa === 'mpisolutions');
    check('a fila da retomada pula os que já terminaram', depois.bulkFilaAtual().map((r) => r.dominio).join(',') === 'b.com.br,c.com.br,d.com.br', depois.bulkFilaAtual().map((r) => r.dominio).join(','));
    check('a lista de SSL pendente volta', depois.ssl.length === 1 && depois.ssl[0].dominio === 'c.com.br');
    check('as tarefas pendentes voltam', depois.sfPend.map((r) => r.dominio).join(',') === 'c.com.br');
    const res = depois.resumoRodada(estado);
    check('resumo: 2 de 4 feitos (ok + parcial), 3 publicados', res.feitos === 2 && res.total === 4 && res.publicados === 3, JSON.stringify(res));
  }

  console.log('\n=== Os pontos de gravação estão na rodada ===');
  {
    const rodada = app.slice(app.indexOf('async function rodarBulk('), app.indexOf('const FORA_DE_CASA_COLUNAS'));
    check('salva antes de cada site', /for \(const row of fila\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*await salvarRodada\('publicando'\)/.test(rodada));
    check('salva antes das tarefas e fecha no fim', /salvarRodada\('tarefas'\)[\s\S]*criarTarefasSalesforceNoFim\(\)[\s\S]*fecharRodadaSalva\(\)/.test(rodada));
    check('retomando não zera SSL e fora de casa', /if \(!retomando\) \{\s*bulkSslPendentes = \[\];/.test(rodada));
    check('todo log vai para o arquivo', /logParaArquivo\(entry\)/.test(app));
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
