// ADR-094: janela oculta que trava não pode prender a rodada para sempre.
// Recorta o rodarNoPainel do main.js e roda com uma janela de mentira.
//
//     node tools/test-janela-travada.js

const fs = require('fs');
const path = require('path');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');

function recorta(inicio, fim) {
  const i = main.indexOf(inicio);
  const f = main.indexOf(fim, i);
  if (i < 0 || f < 0) throw new Error(`não achei o trecho "${inicio}"`);
  return main.slice(i, f);
}

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const codigo = recorta('const JANELA_OCULTA_PRAZO_MS', '\n// Script injetado');
// A parada do ADR-102 entra no race do rodarNoPainel; aqui ela nunca é pedida.
const semParada = 'const promessaDeParada = () => ({ promessa: new Promise(() => {}), soltar: () => {} });';
const { rodarNoPainel, JANELA_OCULTA_PRAZO_MS } = new Function(`${semParada}\n${codigo}\nreturn { rodarNoPainel, JANELA_OCULTA_PRAZO_MS };`)();

function janela(comportamento) {
  const w = {
    destruida: false,
    isDestroyed() { return this.destruida; },
    destroy() { this.destruida = true; },
    webContents: { executeJavaScript: () => comportamento() },
  };
  return w;
}

(async () => {
  console.log('\n=== Página congelada: a etapa falha no prazo, não fica presa ===');
  {
    const w = janela(() => new Promise(() => {})); // nunca responde
    const t0 = Date.now();
    let erro = null;
    try { await rodarNoPainel(w, 'return 1', { prazoMs: 150 }); } catch (e) { erro = e; }
    check('devolveu erro em vez de ficar esperando', !!erro && Date.now() - t0 < 1000, String(erro && erro.message));
    check('o erro diz que a janela travou', erro && erro.detalhe && erro.detalhe.travou === true);
    check('a mensagem explica e diz que a rodada segue', erro && /não respondeu/.test(erro.message) && /próximo/.test(erro.message), erro && erro.message);
    check('a janela travada foi fechada', w.destruida === true);
  }

  console.log('\n=== Página normal: nada muda ===');
  {
    const w = janela(async () => ({ ok: true, valor: 42 }));
    const r = await rodarNoPainel(w, 'return 1', { prazoMs: 150 });
    check('devolve o resultado', r && r.valor === 42);
    check('não fecha a janela', w.destruida === false);
    await new Promise((res) => setTimeout(res, 250));
    check('e não fecha depois do prazo (o timer foi limpo)', w.destruida === false);
  }

  console.log('\n=== Erro do script continua virando exceção com detalhe ===');
  {
    const w = janela(async () => ({ erro: 'botão não achado', config: { x: 1 } }));
    let erro = null;
    try { await rodarNoPainel(w, 'return 1'); } catch (e) { erro = e; }
    check('lança com a mensagem do script', erro && erro.message === 'botão não achado');
    check('mantém o que o script viu', erro && erro.detalhe && erro.detalhe.config && erro.detalhe.config.x === 1);
  }

  console.log('\n=== O prazo padrão cobre o script mais longo (90s) ===');
  check('prazo padrão de 3 minutos', JANELA_OCULTA_PRAZO_MS === 180000, String(JANELA_OCULTA_PRAZO_MS));

  console.log('\n=== Janelas sem throttling e PC acordado na rodada ===');
  // As três ocultas (painel, /doutor, Registro.br) nunca desaceleram. A
  // principal desacelera, e só deixa de desacelerar enquanto algo roda (ADR-126).
  // /doutor, painel MPI+, Registro.br e AppSheet (ADR-147).
  check('as quatro janelas ocultas desligam o background throttling', (main.match(/backgroundThrottling: false/g) || []).length === 4, String((main.match(/backgroundThrottling: false/g) || []).length));
  const criarJanela = main.slice(main.indexOf('function createWindow('), main.indexOf("win.loadFile(path.join(__dirname, 'renderer'"));
  check('a janela principal desacelera em segundo plano (ADR-126)', criarJanela.length > 0 && !/backgroundThrottling/.test(criarJanela));
  check('o manterAcordado liga e desliga a desaceleração dela', /setBackgroundThrottling\(semDesacelerar\.size === 0\)/.test(main));
  check('o Google tem prazo por requisição', /google\.options\(\{ auth: client, timeout: 60000 \}\)/.test(main));
  check('existe o bloqueio de suspensão', /powerSaveBlocker\.start\('prevent-app-suspension'\)/.test(main));
  const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');
  const rodada = app.slice(app.indexOf('async function rodarBulk('), app.indexOf('Publicar em massa terminou:'));
  check('a rodada liga e desliga o bloqueio', /manterAcordado\(true\)/.test(rodada) && /manterAcordado\(false\)/.test(rodada));

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
