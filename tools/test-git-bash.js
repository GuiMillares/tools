// ADR-128: o Git Bash dentro do Hub. Recorta do main.js a busca do bash.exe e
// os handlers bash:* e roda com dublês (node-pty, janela, ipcMain); no fim,
// abre um Git Bash de verdade pelo node-pty desta máquina, sem o perfil do
// usuário, para provar que o pseudoterminal funciona aqui. Confere também a
// ponte do preload, a página e o empacotamento.
//
//     node tools/test-git-bash.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const raiz = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf-8');
const main = ler('main.js');
const preload = ler('preload.js');
const html = ler('renderer', 'index.html');
const pkg = JSON.parse(ler('package.json'));
const recorta = (fonte, a, b) => { const i = fonte.indexOf(a); const f = fonte.indexOf(b, i); if (i < 0 || f < 0) throw new Error('não achei ' + a); return fonte.slice(i, f + b.length); };

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const TRECHO = recorta(main, '// Onde está o bash.exe', "app.on('before-quit', () => { for (const id of [...bashes.keys()]) fecharBash(id); });");

// Carrega o trecho com dublês. `existe` diz quais arquivos existem; `semPty`
// faz o require('node-pty') falhar; `semDll` faz o node-pty não achar o
// conpty.dll (como num pacote sem ele).
function carregar({ existe = () => true, env = { ProgramFiles: 'C:\\PF' }, semPty = false, semDll = false } = {}) {
  const handlers = {};
  const ouvintes = {};
  const appHandlers = {};
  const criados = [];
  const ptyFalso = {
    spawn: (shell, args, opts) => {
      if (semDll && opts.useConptyDll) throw new Error('Cannot find conpty.dll at C:\\app\\conpty\\conpty.dll');
      const p = {
        shell, args, opts, pid: 1000 + criados.length, escrito: [], tamanhos: [], mortes: 0,
        aoDados: null, aoSair: null,
        onData(cb) { this.aoDados = cb; }, onExit(cb) { this.aoSair = cb; },
        write(d) { this.escrito.push(d); }, resize(c, r) { this.tamanhos.push([c, r]); }, kill() { this.mortes++; },
      };
      criados.push(p);
      return p;
    },
  };
  const fsFalso = { statSync: (p) => { if (!existe(p)) throw new Error('ENOENT'); return { isFile: () => true }; } };
  const exportados = new Function('ipcMain', 'app', 'require', 'fs', 'path', 'process', `${TRECHO}\nreturn { acharGitBash, fecharBash, bashes, buildDoWindows };`)(
    { handle: (n, f) => { handlers[n] = f; }, on: (n, f) => { ouvintes[n] = f; } },
    { on: (n, f) => { appHandlers[n] = f; } },
    (m) => { if (m === 'node-pty') { if (semPty) throw new Error('Cannot find module node-pty'); return ptyFalso; } return require(m); },
    fsFalso,
    path,
    { env },
  );
  return { handlers, ouvintes, appHandlers, criados, ...exportados };
}

function janela(id = 7) {
  return {
    id, destruida: false, enviados: [], eventos: {},
    isDestroyed() { return this.destruida; },
    send(canal, dados) { this.enviados.push([canal, dados]); },
    once(ev, cb) { this.eventos[ev] = cb; },
    removeListener(ev, cb) { if (this.eventos[ev] === cb) delete this.eventos[ev]; },
  };
}

(async () => {
  console.log('\n=== Onde está o Git Bash ===');
  {
    const { acharGitBash } = carregar();
    const so = (...caminhos) => (p) => caminhos.includes(p);
    check('acha em Arquivos de Programas', acharGitBash({ ProgramFiles: 'C:\\PF' }, so('C:\\PF\\Git\\bin\\bash.exe')) === 'C:\\PF\\Git\\bin\\bash.exe');
    check('acha na instalação do usuário (AppData\\Local\\Programs, a desta máquina)',
      acharGitBash({ LOCALAPPDATA: 'C:\\U\\AppData\\Local' }, so('C:\\U\\AppData\\Local\\Programs\\Git\\bin\\bash.exe')) === 'C:\\U\\AppData\\Local\\Programs\\Git\\bin\\bash.exe');
    check('acha ao lado do git do PATH (<Git>\\cmd -> <Git>\\bin\\bash.exe)',
      acharGitBash({ PATH: ['C:\\Windows', 'D:\\Ferramentas\\Git\\cmd\\'].join(path.delimiter) }, so('D:\\Ferramentas\\Git\\cmd\\git.exe', 'D:\\Ferramentas\\Git\\bin\\bash.exe')) === 'D:\\Ferramentas\\Git\\bin\\bash.exe');
    check('prefere a instalação da máquina à do PATH',
      acharGitBash({ ProgramFiles: 'C:\\PF', PATH: 'D:\\G\\cmd' }, so('C:\\PF\\Git\\bin\\bash.exe', 'D:\\G\\cmd\\git.exe', 'D:\\G\\bin\\bash.exe')) === 'C:\\PF\\Git\\bin\\bash.exe');
    check('sem Git nenhum, devolve null', acharGitBash({ ProgramFiles: 'C:\\PF', PATH: 'C:\\Windows' }, () => false) === null);
    check('o bash desta máquina é achado com o ambiente de verdade', !!acharGitBash(process.env, (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }));
  }

  console.log('\n=== Abrir, digitar, redimensionar ===');
  {
    const t = carregar();
    const w = janela();
    const abrir = (p) => t.handlers['bash:abrir']({ sender: w }, p);
    let r = await abrir({ cols: 120.7, rows: 33.2 });
    const p = t.criados[0];
    check('abre o bash.exe achado', r.ok && r.shell === 'C:\\PF\\Git\\bin\\bash.exe' && p.shell === r.shell, JSON.stringify(r));
    check('como login interativo (--login -i), igual ao Git Bash', JSON.stringify(p.args) === '["--login","-i"]');
    check('com terminal xterm-256color e cores', p.opts.name === 'xterm-256color' && p.opts.env.TERM === 'xterm-256color' && p.opts.env.COLORTERM === 'truecolor');
    check('na pasta do usuário, sem o /etc/profile trocar de pasta (CHERE_INVOKING)', p.opts.cwd === os.homedir() && p.opts.env.CHERE_INVOKING === '1');
    check('colunas e linhas inteiras', p.opts.cols === 120 && p.opts.rows === 33, `${p.opts.cols}x${p.opts.rows}`);
    check('devolve o build do Windows para o xterm', Number.isInteger(r.build) && r.build === t.buildDoWindows());
    // ADR-129: com o ConPTY do Windows, redimensionar duplicava e picava linhas.
    check('usa o ConPTY que vem com o node-pty (o do Windows Terminal), não o do Windows', p.opts.useConptyDll === true && r.conpty === 'node-pty', JSON.stringify({ dll: p.opts.useConptyDll, conpty: r.conpty }));
    r = await abrir({ cols: 50, rows: 10 });
    check('abrir de novo (página recarregada) segue o mesmo bash', r.ok && r.jaAberto === true && t.criados.length === 1);

    t.handlers['bash:escrever']({ sender: w }, 'ls -la\r');
    t.handlers['bash:escrever']({ sender: w }, { nao: 'texto' });
    check('tecla vai para o bash; o que não é texto, não', JSON.stringify(p.escrito) === '["ls -la\\r"]', JSON.stringify(p.escrito));
    t.handlers['bash:tamanho']({ sender: w }, { cols: 100.9, rows: 30 });
    t.handlers['bash:tamanho']({ sender: w }, { cols: 0, rows: 30 });
    t.handlers['bash:tamanho']({ sender: w }, { cols: 5000, rows: 30 });
    t.handlers['bash:tamanho']({ sender: w });
    check('redimensiona com inteiros e ignora tamanho absurdo', JSON.stringify(p.tamanhos) === '[[100,30]]', JSON.stringify(p.tamanhos));

    p.aoDados('\u001b[32mguilherme@PAT');
    p.aoDados(' MINGW64\u001b[0m\r\n$ ');
    check('a saída não sai pedaço por pedaço', w.enviados.length === 0);
    await dormir(40);
    check('sai junta, numa mensagem só', w.enviados.length === 1 && w.enviados[0][0] === 'bash:dados' && w.enviados[0][1] === '\u001b[32mguilherme@PAT MINGW64\u001b[0m\r\n$ ', JSON.stringify(w.enviados));

    p.aoDados('exit\r\n');
    p.aoSair({ exitCode: 3 });
    check('o bash saiu sozinho: o que faltava chega antes do aviso', w.enviados.length === 3 && w.enviados[1][1] === 'exit\r\n' && w.enviados[2][0] === 'bash:saiu' && w.enviados[2][1].codigo === 3, JSON.stringify(w.enviados.slice(1)));
    check('e a sessão acaba (tecla depois disso não vai para ninguém)', t.bashes.size === 0 && (t.handlers['bash:escrever']({ sender: w }, 'x'), p.escrito.length === 1));
    check('e solta o aviso de janela fechada', !w.eventos.destroyed);

    r = await abrir({ cols: 80, rows: 24 });
    const p2 = t.criados[1];
    check('depois de sair, abrir cria outro', r.ok && !r.jaAberto && t.criados.length === 2);
    r = await t.handlers['bash:fechar']({ sender: w });
    check('a lixeira encerra o bash', r.fechou === true && p2.mortes === 1 && t.bashes.size === 0);
    const antes = w.enviados.length;
    p2.aoSair({ exitCode: 1 });
    check('e o fim que o Hub pediu não vira aviso de "terminou"', w.enviados.length === antes);
    r = await t.handlers['bash:fechar']({ sender: w });
    check('encerrar o que já saiu não quebra', r.ok && r.fechou === false);

    await abrir({});
    const p3 = t.criados[2];
    check('sem tamanho, abre com 80x24', p3.opts.cols === 80 && p3.opts.rows === 24);
    const aoFecharJanela = w.eventos.destroyed;
    check('o Hub escuta o fechamento da janela', typeof aoFecharJanela === 'function');
    if (aoFecharJanela) aoFecharJanela();
    check('fechou a janela do Hub: o bash morre junto', p3.mortes === 1 && t.bashes.size === 0);

    const w2 = janela(8);
    const w3 = janela(9);
    await t.handlers['bash:abrir']({ sender: w2 }, {});
    await t.handlers['bash:abrir']({ sender: w3 }, {});
    t.appHandlers['before-quit']();
    check('o Hub fechando mata todos os bashes', t.criados[3].mortes === 1 && t.criados[4].mortes === 1 && t.bashes.size === 0);
  }

  console.log('\n=== Quando não dá para abrir ===');
  {
    const semGit = carregar({ existe: () => false, env: { ProgramFiles: 'C:\\PF', PATH: '' } });
    let r = await semGit.handlers['bash:abrir']({ sender: janela() }, {});
    check('sem Git: explica o que instalar', r.ok === false && /Git for Windows/.test(r.error) && semGit.criados.length === 0, r.error);
    const semPty = carregar({ semPty: true });
    r = await semPty.handlers['bash:abrir']({ sender: janela() }, {});
    check('node-pty faltando: diz qual peça', r.ok === false && /node-pty/.test(r.error), r.error);
    const semDll = carregar({ semDll: true });
    r = await semDll.handlers['bash:abrir']({ sender: janela() }, { cols: 90, rows: 20 });
    check('sem o conpty.dll, abre com o ConPTY do Windows em vez de falhar', r.ok === true && r.conpty === 'windows' && semDll.criados.length === 1 && !semDll.criados[0].opts.useConptyDll && semDll.criados[0].opts.cols === 90, JSON.stringify(r));
    check('e devolve o motivo, para a página avisar', /conpty\.dll/.test(r.conptyErro || ''), r.conptyErro);
    check('a página avisa na Atividade quando cai no ConPTY do Windows', /r\.conpty === 'windows'\) log\(/.test(ler('renderer', 'terminais.js')));
  }

  console.log('\n=== Um Git Bash de verdade, pelo node-pty desta máquina ===');
  {
    const { acharGitBash } = carregar();
    const bash = acharGitBash(process.env, (p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
    let pty = null;
    try { pty = require(path.join(raiz, 'node_modules', 'node-pty')); } catch (e) { check('o node-pty carrega (binário pronto, N-API)', false, e.message); }
    if (pty && bash) {
      check('o node-pty carrega (binário pronto, N-API)', true);
      // Sem o perfil do usuário (--noprofile --norc): só o pseudoterminal, com o
      // ConPTY que o Hub usa (o que vem no node-pty). Ele pergunta ao terminal
      // quem ele é (ESC [ c); aqui o teste responde como o xterm.js responde.
      const ESC = String.fromCharCode(27);
      const inicio = Date.now();
      const saida = await new Promise((resolve) => {
        let texto = '';
        let perguntou = false;
        const p = pty.spawn(bash, ['--noprofile', '--norc', '-c', 'echo "marca-$((6*7))"; tput cols; printf "a\\303\\247\\303\\243o\\n"'], { name: 'xterm-256color', cols: 77, rows: 20, cwd: os.homedir(), env: { ...process.env, TERM: 'xterm-256color' }, useConptyDll: true });
        const limite = setTimeout(() => { try { p.kill(); } catch (e) {} resolve({ texto, codigo: 'tempo esgotado', perguntou }); }, 30000);
        p.onData((d) => {
          texto += d;
          if (!perguntou && texto.includes(ESC + '[c')) { perguntou = true; p.write(ESC + '[?1;2c'); }
        });
        p.onExit(({ exitCode }) => { clearTimeout(limite); resolve({ texto, codigo: exitCode, perguntou }); });
      });
      const ms = Date.now() - inicio;
      check('o ConPTY do node-pty pergunta quem é o terminal (o xterm.js responde no Hub)', saida.perguntou === true);
      check('respondido, abre e fecha rápido (sem os ~3 s de espera)', ms < 2500, `${ms} ms`);
      const limpo = saida.texto.replace(/\u001b\[[0-9;?]*[A-Za-z]|\u001b\][^\u0007]*\u0007/g, '');
      check('o bash roda e sai com 0', saida.codigo === 0, String(saida.codigo));
      check('o comando chegou e voltou', /marca-42/.test(limpo), JSON.stringify(limpo.slice(0, 200)));
      check('o bash enxerga o tamanho do terminal (77 colunas)', /(^|\n)77\r?\n/.test(limpo), JSON.stringify(limpo.slice(0, 200)));
      check('acento passa inteiro (UTF-8)', /ação/.test(limpo), JSON.stringify(limpo.slice(0, 200)));
    } else if (!bash) {
      console.log('  --   sem Git Bash nesta máquina: a parte de verdade foi pulada');
    }
  }

  console.log('\n=== Ponte, página e instalador ===');
  for (const f of ['bashAbrir', 'bashEscrever', 'bashTamanho', 'bashFechar', 'onBashDados', 'onBashSaiu']) {
    check(`o preload expõe ${f}`, new RegExp(`\\b${f}:`).test(preload));
  }
  // handle/invoke, como o resto do main.js: os testes carregam o main.js com um
  // ipcMain de mentira que só tem handle. A página não espera a volta.
  check('tecla e tamanho vão pelo bash:escrever e bash:tamanho', /bashEscrever: \(dados\) => ipcRenderer\.invoke\('bash:escrever'/.test(preload) && /bashTamanho: \(payload\) => ipcRenderer\.invoke\('bash:tamanho'/.test(preload));
  check('o main.js só usa ipcMain.handle (carrega nos testes antigos)', !/ipcMain\.on\(/.test(main));
  const terminaisJs = ler('renderer', 'terminais.js');
  check('a página não espera a volta de cada tecla', /Promise\.resolve\(window\.api\.bashEscrever\(d\)\)\.catch/.test(terminaisJs) && !/await window\.api\.bashEscrever/.test(terminaisJs));
  // ADR-129: a resposta do xterm.js à pergunta do ConPTY não pode ficar presa
  // esperando o bash ser dado como vivo; e o tamanho só vai quando a mão para.
  check('o que o xterm.js manda vai sempre (inclusive a resposta ao ESC [ c)', !/if \(bashVivo\)[^\n]*bashEscrever/.test(terminaisJs));
  const espera = Number((/const BASH_TAMANHO_ESPERA = (\d+);/.exec(terminaisJs) || [])[1]);
  check('o bash só fica sabendo do tamanho depois que o arrasto para (100 a 300 ms)', espera >= 100 && espera <= 300 && /bashTerm\.onResize\(agendarTamanhoDoBash\)/.test(terminaisJs), String(espera));
  check('o conpty.dll e o OpenConsole.exe estão lá (vão no instalador)', ['conpty.dll', 'OpenConsole.exe'].every((f) => fs.existsSync(path.join(raiz, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty', f))));
  check('a página tem o painel do Git Bash e os botões', ['bashDock', 'bashCorpo', 'bashArrasto', 'bashNovo', 'bashLixo', 'bashMax', 'bashMin', 'bashFechar', 'navBashBtn'].every((id) => html.includes(`id="${id}"`)));
  check('a Atividade minimiza e fecha', ['atividadeMinBtn', 'atividadeFecharBtn', 'atividadeTrilho', 'navAtividadeBtn'].every((id) => html.includes(`id="${id}"`)));
  const ordem = ['src="app.js"', 'src="terminais.js"', 'src="automacao-ui.js"'].map((s) => html.indexOf(s));
  check('o terminais.js carrega depois do app.js (usa o log e o el dele)', ordem.every((i) => i > 0) && ordem[0] < ordem[1] && ordem[1] < ordem[2]);
  check('o xterm.js não carrega na abertura do Hub (só quando o bash abre)', !/<(script|link)\b[^>]*xterm/i.test(html));
  check('dependências: node-pty e xterm.js', !!pkg.dependencies['node-pty'] && !!pkg.dependencies['@xterm/xterm'] && !!pkg.dependencies['@xterm/addon-fit']);
  check('o instalador não recompila o node-pty (não há compilador nesta máquina)', pkg.build.npmRebuild === false);
  check('e leva o node-pty fora do app.asar (binário nativo não roda de dentro dele)', (pkg.build.asarUnpack || []).includes('node_modules/node-pty/**'));
  check('sem os .pdb e as outras plataformas (~55 MB)', ['!node_modules/node-pty/**/*.pdb', '!node_modules/node-pty/prebuilds/darwin-*/**', '!node_modules/node-pty/prebuilds/win32-arm64/**'].every((x) => pkg.build.files.includes(x)));
  check('o binário do Windows x64 está lá', fs.existsSync(path.join(raiz, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'pty.node')) && fs.existsSync(path.join(raiz, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64', 'conpty.node')));

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
