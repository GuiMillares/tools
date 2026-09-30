// ADR-095: antes de perguntar "de qual empresa é?", o Publicar em massa procura
// o domínio nas duas abas da planilha. Achou, não pergunta e não duplica.
//
//     node tools/test-procurar-planilha.js

const fs = require('fs');
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

// ---- main: o handler planilha:procurar com o Graph simulado ----
function montarMain(abasNaPlanilha) {
  const handlers = {};
  const chamadas = [];
  const corpo = `
    ${recorta(main, 'function normalizeDomain(', '\n}\n')}\n}
    ${recorta(main, 'const PLANILHA_ABAS', 'function proximaLinhaLivre(')}
    const readPublicacaoConfig = () => ({ planilhaUrl: 'https://empresa.sharepoint.com/:x:/s/abc' });
    const msAccessToken = async () => 'TOKEN';
    const msError = (r) => 'erro ' + r.status;
    const msRequest = async (metodo, url) => {
      chamadas.push(url);
      if (url.includes('/driveItem')) return { status: 200, body: { id: 'I', parentReference: { driveId: 'D' } } };
      if (url.endsWith('/worksheets?$select=name')) return { status: 200, body: { value: Object.keys(abas).map((name) => ({ name })) } };
      const m = url.match(/worksheets\\('([^']+)'\\)/);
      const nome = decodeURIComponent(m[1]);
      return { status: 200, body: { address: nome + '!A1:Z' + abas[nome].length, values: abas[nome] } };
    };
    const ipcMain = { handle: (n, fn) => { handlers[n] = fn; } };
    ${recorta(main, "ipcMain.handle('planilha:procurar'", "ipcMain.handle('planilha:registrar'")}
    return handlers['planilha:procurar'];`;
  const fn = new Function('abas', 'handlers', 'chamadas', corpo)(abasNaPlanilha, handlers, chamadas);
  return { procurar: (d) => fn(null, { dominio: d }), chamadas };
}

// ---- renderer: registrarLinhaDaPlanilha com a api simulada ----
function montarRenderer(api) {
  const corpo = `
    const logs = [];
    const log = (m, t) => logs.push({ m, t });
    const withBusy = (_r, fn) => fn();
    let perguntas = 0;
    const perguntarNoTerminal = async () => { perguntas++; return 'bc'; };
    const PLANILHA_ABA_POR_EMPRESA = { bc: 'Busca Cliente', mpisolutions: 'MPI' };
    const montarLinhaPlanilha = () => new Array(10).fill('');
    const window = { api };
    ${recorta(app, 'async function registrarLinhaDaPlanilha(row)', '\n// Dá para pedir o SSL agora?')}
    return { registrar: registrarLinhaDaPlanilha, logs, get perguntas() { return perguntas; } };`;
  return new Function('api', corpo)(api);
}

(async () => {
  console.log('\n=== main: acha o domínio na aba certa ===');
  {
    const m = montarMain({
      MPI: [['Data', 'Domínio'], ['01/09', 'https://spvidas.com.br/']],
      'Busca Cliente': [['Data', 'Domínio'], ['02/09', 'https://yydifm.com.br/'], ['03/09', 'https://artgramarevest.com.br/']],
    });
    const r1 = await m.procurar('spvidas.com.br');
    check('achou na MPI, linha 2', r1.ok && r1.achado && r1.achado.abaPedida === 'MPI' && r1.achado.linha === 2, JSON.stringify(r1.achado));
    const r2 = await m.procurar('www.artgramarevest.com.br');
    check('achou na Busca Cliente (domínio com www normalizado), linha 3', r2.achado && r2.achado.abaPedida === 'Busca Cliente' && r2.achado.linha === 3, JSON.stringify(r2.achado));
    const r3 = await m.procurar('naoexiste.com.br');
    check('não achando, devolve achado nulo', r3.ok && r3.achado === null);
    check('só leitura: nenhum PATCH', !m.chamadas.some((u) => /PATCH/.test(u)));
  }

  console.log('\n=== renderer: achou na planilha, não pergunta ===');
  {
    let registrou = false;
    const r = montarRenderer({
      procurarNaPlanilha: async () => ({ ok: true, log: [], achado: { aba: 'MPI', abaPedida: 'MPI', linha: 105, onde: 'MPI!105' } }),
      registrarPlanilha: async () => { registrou = true; return { ok: true }; },
      getPublicacaoConfig: async () => ({ config: {} }),
    });
    const row = { dominio: 'spvidas.com.br', razao: 'SP VIDAS', empresa: '' };
    const res = await r.registrar(row);
    check('não perguntou a empresa', r.perguntas === 0);
    check('não tentou escrever de novo', registrou === false);
    check('devolve como já existente, com o lugar', res.jaExistia === true && res.onde === 'MPI!105', JSON.stringify(res));
    check('a empresa da linha passa a ser a da aba', row.empresa === 'mpisolutions', row.empresa);
  }

  console.log('\n=== renderer: não achou, aí sim pergunta ===');
  {
    const r = montarRenderer({
      procurarNaPlanilha: async () => ({ ok: true, log: [], achado: null }),
      registrarPlanilha: async () => ({ ok: true, onde: 'Busca Cliente!900' }),
      getPublicacaoConfig: async () => ({ config: {} }),
    });
    await r.registrar({ dominio: 'novo.com.br', razao: 'NOVO', empresa: '' });
    check('perguntou uma vez', r.perguntas === 1);
  }

  console.log('\n=== renderer: busca falhou, pergunta em vez de chutar ===');
  {
    const r = montarRenderer({
      procurarNaPlanilha: async () => ({ ok: false, error: 'Graph fora' }),
      registrarPlanilha: async () => ({ ok: true }),
      getPublicacaoConfig: async () => ({ config: {} }),
    });
    await r.registrar({ dominio: 'x.com.br', razao: 'X', empresa: '' });
    check('perguntou', r.perguntas === 1);
    check('avisou que não conseguiu procurar', r.logs.some((l) => /Não consegui procurar/.test(l.m)));
  }

  console.log('\n=== renderer: contato técnico nosso nem procura ===');
  {
    let procurou = false;
    const r = montarRenderer({
      procurarNaPlanilha: async () => { procurou = true; return { ok: true, achado: null }; },
      registrarPlanilha: async () => ({ ok: true, jaExistia: true, onde: 'MPI!10' }),
      getPublicacaoConfig: async () => ({ config: {} }),
    });
    await r.registrar({ dominio: 'y.com.br', razao: 'Y', empresa: 'mpisolutions' });
    check('empresa já conhecida: não procura nem pergunta', procurou === false && r.perguntas === 0);
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
