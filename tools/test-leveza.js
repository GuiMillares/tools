// ADR-126: o Hub parado não gasta CPU. Nada pulsa para sempre (só o "ocupado"
// e o "pendente" piscam, em degraus, e só com a janela em foco), as listas que
// se redesenham não reanimam, a moldura perdeu as pílulas, o rodapé de status e o "CLI / READY",
// e a janela principal só deixa de desacelerar em segundo plano enquanto algo
// roda sozinho. Recorta o handler do main.js e roda com dublês; o resto é
// conferido no próprio CSS, HTML e JS.
//
//     node tools/test-leveza.js

const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf-8');
const main = ler('main.js');
const app = ler('renderer', 'app.js');
const css = ler('renderer', 'style.css');
const html = ler('renderer', 'index.html');
const auto = ler('renderer', 'automacao-ui.js');
const recorta = (fonte, a, b) => { const i = fonte.indexOf(a); const f = fonte.indexOf(b, i); if (i < 0 || f < 0) throw new Error('não achei ' + a); return fonte.slice(i, f + b.length); };

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

(async () => {
  console.log('\n=== Janela principal: desacelera, a não ser que algo esteja rodando ===');
  {
    const handlers = {};
    let bloqueios = 0;
    const iniciados = new Set();
    const powerSaveBlocker = {
      start: () => { bloqueios++; iniciados.add(bloqueios); return bloqueios; },
      stop: (id) => { iniciados.delete(id); },
      isStarted: (id) => iniciados.has(id),
    };
    new Function('ipcMain', 'require', recorta(main, '// Durante uma rodada em massa, o Windows não pode suspender', "return { ok: true, ativo: bloqueioEnergia !== null, semDesacelerar: [...semDesacelerar] };\n});"))(
      { handle: (n, f) => { handlers[n] = f; } },
      (m) => (m === 'electron' ? { powerSaveBlocker } : require(m)),
    );
    const janela = { throttling: null, destruida: false, isDestroyed() { return this.destruida; }, setBackgroundThrottling(v) { this.throttling = v; } };
    const pedir = (ligar, motivo) => handlers['energia:manterAcordado']({ sender: janela }, motivo === undefined ? { ligar } : { ligar, motivo });

    let r = await pedir(true);
    check('a rodada em massa (sem motivo, como sempre foi) não desacelera', janela.throttling === false && r.semDesacelerar.join() === 'rodada', JSON.stringify(r));
    check('e segura o PC acordado', r.ativo === true && iniciados.size === 1);
    r = await pedir(true, 'automacao');
    check('a automação ligada junto continua sem desacelerar', janela.throttling === false && r.semDesacelerar.length === 2);
    r = await pedir(false);
    check('a rodada acabou: solta o PC', r.ativo === false && iniciados.size === 0);
    check('mas a automação ainda ligada segura a janela', janela.throttling === false && r.semDesacelerar.join() === 'automacao', JSON.stringify(r));
    r = await pedir(false, 'automacao');
    check('nada rodando: a janela volta a desacelerar', janela.throttling === true && r.semDesacelerar.length === 0);
    r = await pedir(true, 'publicacao');
    check('uma etapa da publicação não desacelera', janela.throttling === false);
    check('e não mexe no bloqueio de suspensão, que é só da rodada', r.ativo === false && iniciados.size === 0 && bloqueios === 1);
    await pedir(false, 'publicacao');
    check('etapa acabou: desacelera de novo', janela.throttling === true);
    await pedir(false, 'publicacao');
    check('soltar duas vezes não quebra', janela.throttling === true);
    janela.destruida = true;
    let erro = null;
    try { await pedir(true, 'automacao'); } catch (e) { erro = e; }
    check('janela já fechada não derruba o pedido', !erro, erro && erro.message);
  }
  // /doutor, painel MPI+, Registro.br e AppSheet (ADR-147).
  check('as quatro janelas ocultas continuam sem desacelerar', (main.match(/backgroundThrottling: false/g) || []).length === 4, String((main.match(/backgroundThrottling: false/g) || []).length));

  console.log('\n=== Quem segura a janela ===');
  const rodada = app.slice(app.indexOf('async function rodarBulk('), app.indexOf('Publicar em massa terminou:'));
  check('a rodada em massa liga e desliga', /manterAcordado\(true\)/.test(rodada) && /manterAcordado\(false\)/.test(rodada));
  const etapa = recorta(app, 'async function pubRodarEtapa(', '\n}');
  check("a etapa da publicação segura como 'publicacao' e solta no finally", /manterAcordado\(true, 'publicacao'\)/.test(etapa) && /finally \{[\s\S]*manterAcordado\(false, 'publicacao'\)/.test(etapa));
  check("a automação segura como 'automacao' ao ligar e solta ao desligar", /function ligarTimer\(\)[\s\S]*?manterAcordado\(true, 'automacao'\)[\s\S]*?function desligarTimer\(\)[\s\S]*?manterAcordado\(false, 'automacao'\)/.test(auto));

  console.log('\n=== Nada pulsa para sempre ===');
  const infinitas = [...css.matchAll(/^([^{}\n]+)\{[^}]*animation:[^;}]*infinite/gm)].map((m) => m[1].trim());
  const permitidas = (s) => /\.busy\b/.test(s) || /\.pending\b/.test(s);
  check(`só "ocupado" e "pendente" têm animação infinita (${infinitas.length})`, infinitas.length > 0 && infinitas.every(permitidas), infinitas.filter((s) => !permitidas(s)).join(' | '));
  // Suave (ease, linear), ela redesenha a janela 60 vezes por segundo; em
  // degraus, só quando o valor muda (4 quadros a cada 2 s, medido).
  const valores = [...css.matchAll(/^[^{}\n]+\{[^}]*animation:([^;}]*infinite[^;}]*)/gm)].map((m) => m[1].trim());
  check('e todas elas piscam em degraus (steps), sem redesenhar a janela 60 vezes por segundo', valores.length === infinitas.length && valores.every((v) => /\bsteps\(/.test(v)), valores.filter((v) => !/\bsteps\(/.test(v)).join(' | '));
  const semFoco = css.slice(css.indexOf('html.sem-foco'));
  check('e todas elas param com a janela sem foco', infinitas.every((s) => s.split(',').every((parte) => semFoco.includes(`html.sem-foco ${parte.trim()}`))), infinitas.join(' | '));
  check('o app.js marca a janela sem foco', /classList\.toggle\('sem-foco', !document\.hasFocus\(\)\)/.test(app) && /addEventListener\('blur', marcarFoco\)/.test(app) && /addEventListener\('focus', marcarFoco\)/.test(app));

  console.log('\n=== Listas que se redesenham não reanimam ===');
  const listaDe = (animacao) => [...css.matchAll(new RegExp(`^([^{}\\n]+)\\{\\s*animation:\\s*${animacao}\\b`, 'gm'))].map((m) => m[1]);
  const entrada = [...listaDe('popIn'), ...listaDe('fadeUp')].join(',');
  check('as linhas (.row: lote, lista de espera) entram sem animação', !/(^|,)\s*\.row\s*(,|$)/.test(entrada), entrada);
  check('os cartões do kanban (.kb-card) entram sem animação', !/(^|,)\s*\.kb-card\s*(,|$)/.test(entrada), entrada);

  console.log('\n=== Saíram as pílulas do topo, o rodapé de status e o "CLI / READY" ===');
  check('index.html sem o rodapé de status', !/class="statusbar"/.test(html) && !/id="sb(Cf|Rbr|Hestia|Fila|State)"/.test(html));
  check('index.html sem as pílulas do topo', !/id="tbStatus"/.test(html));
  check('index.html sem o "CLI / READY" da sidebar', !/nav-foot/.test(html) && !/id="navState"/.test(html));
  check('o app.js não procura mais esses elementos', !/getElementById\('(sbCf|sbRbr|sbHestia|sbFila|sbState|navState|tbStatus)'\)/.test(app) && !/atualizarStatusbar/.test(app));
  check('nem relê as credenciais de minuto em minuto', !/tickLento/.test(app) && !/setInterval\([^)]*statusCredenciais/.test(app));
  check('a auditoria das Configurações busca as credenciais ao abrir', /function carregarCredenciaisDaAuditoria\(/.test(app) && /if \(!c\) carregarCredenciaisDaAuditoria\(\)/.test(app));
  check('a telemetria do topo não trabalha com a janela escondida', /if \(document\.visibilityState === 'hidden'\) return;/.test(recorta(app, 'function iniciarTopbarLive(', '\n}')));
  check('o CSS também saiu', !/\.tb-pill|\.statusbar|\.nav-foot|\.sb-dot/.test(css));

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
