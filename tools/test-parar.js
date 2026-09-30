// ADR-102: "Parar agora" interrompe as esperas e as janelas do painel no meio,
// e tudo volta ao normal quando a tela termina de parar. Recorta do main.js e
// do renderer/app.js.
//
//     node tools/test-parar.js

const fs = require('fs');
const path = require('path');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');
const recorta = (fonte, a, b) => { const i = fonte.indexOf(a); const f = fonte.indexOf(b, i); if (i < 0 || f < 0) throw new Error('não achei ' + a); return fonte.slice(i, f); };

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };
const resultado = (p) => p.then(() => 'ok', (e) => (e && e.parado ? 'parado' : `erro: ${e && e.message}`));

(async () => {
  console.log('\n=== main: a parada interrompe esperas e scripts do painel ===');
  const handlers = {};
  const M = new Function('ipcMain', `
    ${recorta(main, 'let paradaPedida = false;', "\n\n// ")}
    const JANELA_OCULTA_PRAZO_MS = 60000;
    ${recorta(main, 'async function rodarNoPainel(', '\n// Script injetado')}
    return { dormir, rodarNoPainel };`)({ handle: (n, f) => { handlers[n] = f; } });
  {
    const espera = resultado(M.dormir(60000));
    let destruida = false;
    const win = { isDestroyed: () => destruida, destroy: () => { destruida = true; }, webContents: { executeJavaScript: () => new Promise(() => {}) } };
    const script = resultado(M.rodarNoPainel(win, 'return 1'));
    await handlers['processo:parar']();
    check('a espera longa para na hora', (await espera) === 'parado');
    check('o script travado no painel para na hora', (await script) === 'parado');
    check('e a janela dele é fechada (estado desconhecido)', destruida);
    check('esperas novas durante a parada também param', (await resultado(M.dormir(10))) === 'parado');
    await handlers['processo:liberar']();
    check('depois de liberar, esperar volta ao normal', (await resultado(M.dormir(5))) === 'ok');
    const ok = { isDestroyed: () => false, destroy() {}, webContents: { executeJavaScript: async () => ({ v: 7 }) } };
    check('e o painel também', (await M.rodarNoPainel(ok, '')).v === 7);
  }

  console.log('\n=== tela: parar, esperas da tela e liberar ===');
  {
    const chamadas = [];
    const logs = [];
    const R = new Function('api', `
      const log = (m, t) => logs.push({ m, t }); const logs = [];
      const window = { api };
      ${recorta(app, 'let paradaAgora = false;', '\nfunction perguntarNoTerminal(')}
      return { pararAgora, pararTerminou, esperarOuParar, ehParada, perguntasAbertas, get parando() { return paradaAgora; }, logs };`)({
      pararProcesso: async () => chamadas.push('parar'), liberarProcesso: async () => chamadas.push('liberar'),
    });
    const espera = R.esperarOuParar(60000).then(() => 'ok', (e) => (R.ehParada(e) ? 'parado' : 'erro'));
    let perguntaFechada = false;
    R.perguntasAbertas.add(() => { perguntaFechada = true; });
    await R.pararAgora();
    check('avisa o processo principal', chamadas.join() === 'parar');
    check('a espera da tela (propagação do DNS) para', (await espera) === 'parado');
    check('a pergunta aberta no terminal é fechada', perguntaFechada);
    check('o log explica o que acontece com o que está no meio', R.logs.some((l) => /o passo seguinte não começa/.test(l.m)));
    await R.pararAgora();
    check('clicar de novo não repete', chamadas.join() === 'parar');
    await R.pararTerminou();
    check('ao terminar de parar, libera o processo principal', chamadas.join() === 'parar,liberar' && R.parando === false);
    check('e as esperas voltam ao normal', (await R.esperarOuParar(1).then(() => 'ok', () => 'parado')) === 'ok');
  }

  console.log('\n=== Publicar MPI+: a etapa do meio fica "parado por você", para retomar ===');
  {
    const R = new Function(`
      const logs = []; const log = (m, t) => logs.push({ m, t });
      const acordado = [];
      const window = { api: { manterAcordado: async (ligar, motivo) => { acordado.push([ligar, motivo]); } } };
      let paradaAgora = true;
      const ehParada = (e) => /parado por você/i.test(String((e && e.message) || e || ''));
      const PUB_ETAPAS = [{ id: 'publicar', nome: 'Publicar em produção' }];
      const pub = { rodando: false, feitas: {}, dominio: 'x.com.br' };
      const pubPrecisa = () => true; const renderPubEtapas = () => {};
      const pubAvancar = (id, ok, detalhe) => { pub.feitas[id] = { ok, detalhe }; };
      const pubEtapaPublicar = async () => { throw new Error('Painel: parado por você'); };
      ${recorta(app, 'async function pubRodarEtapa(id) {', '\nconst logTudo =')}
      return { pubRodarEtapa, pub, logs, acordado };`)();
    await R.pubRodarEtapa('publicar');
    check('a etapa fica como falhou com "parado por você" (o botão vira Tentar de novo)', R.pub.feitas.publicar && R.pub.feitas.publicar.ok === false && R.pub.feitas.publicar.detalhe === 'parado por você', JSON.stringify(R.pub.feitas));
    check('e o log é aviso, não erro', R.logs.some((l) => l.t === 'warn' && /parado por você/.test(l.m)));
    check('a janela fica sem desacelerar só enquanto a etapa roda, e solta mesmo parando (ADR-126)', JSON.stringify(R.acordado) === JSON.stringify([[true, 'publicacao'], [false, 'publicacao']]), JSON.stringify(R.acordado));
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
