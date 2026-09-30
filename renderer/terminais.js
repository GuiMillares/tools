// Os dois terminais do Hub (ADR-128): a Atividade, à direita (o log de tudo
// que o Hub faz, com a linha de comando), e o Git Bash, embaixo do painel do
// meio (um bash de verdade, com a moldura do terminal do Antigravity e as cores do Hub). Os dois
// minimizam e fecham. O estado da Atividade e a altura do Git Bash ficam
// guardados nesta máquina; o bash em si só abre quando você pede.
//
// Carrega depois do app.js e usa dele: el, log.

const ESC = String.fromCharCode(27);
const TERMINAIS_CHAVE = 'hub.terminais';
const BASH_ALTURA_MIN = 120;
const terminais = { atividade: 'aberto', bash: 'fechado', bashMax: false, bashAltura: 300 };

const tel = {
  corpo: document.querySelector('.app-body'),
  navAtividade: document.getElementById('navAtividadeBtn'),
  navAtividadeN: document.getElementById('navAtividadeN'),
  navBash: document.getElementById('navBashBtn'),
  navBashVivo: document.getElementById('navBashVivo'),
  trilho: document.getElementById('atividadeTrilho'),
  trilhoN: document.getElementById('atividadeTrilhoN'),
  atividadeMin: document.getElementById('atividadeMinBtn'),
  atividadeFechar: document.getElementById('atividadeFecharBtn'),
  dock: document.getElementById('bashDock'),
  arrasto: document.getElementById('bashArrasto'),
  head: document.getElementById('bashHead'),
  nome: document.getElementById('bashNome'),
  corpoBash: document.getElementById('bashCorpo'),
  novo: document.getElementById('bashNovo'),
  lixo: document.getElementById('bashLixo'),
  max: document.getElementById('bashMax'),
  min: document.getElementById('bashMin'),
  fechar: document.getElementById('bashFechar'),
};

function lerTerminais() {
  try {
    const salvo = JSON.parse(localStorage.getItem(TERMINAIS_CHAVE) || '{}');
    if (['aberto', 'minimizado', 'fechado'].includes(salvo.atividade)) terminais.atividade = salvo.atividade;
    if (Number.isFinite(salvo.bashAltura)) terminais.bashAltura = Math.max(BASH_ALTURA_MIN, Math.round(salvo.bashAltura));
  } catch (e) { /* sem armazenamento: fica o padrão */ }
}

function gravarTerminais() {
  try { localStorage.setItem(TERMINAIS_CHAVE, JSON.stringify({ atividade: terminais.atividade, bashAltura: terminais.bashAltura })); } catch (e) {}
}

// ---------- Atividade (o terminal da direita) ----------

// O que chegou enquanto ela estava escondida vira um número na barra lateral e
// no trilho; vermelho se veio erro.
let atividadeNovas = 0;
let atividadeErro = false;

function aplicarAtividade() {
  const estado = terminais.atividade;
  tel.corpo.classList.toggle('atividade-min', estado === 'minimizado');
  tel.corpo.classList.toggle('atividade-fechada', estado === 'fechado');
  tel.navAtividade.classList.toggle('aberto', estado === 'aberto');
  if (estado === 'aberto') {
    atividadeNovas = 0;
    atividadeErro = false;
    el.terminal.scrollTop = el.terminal.scrollHeight;
  }
  mostrarNovas();
  // O painel do meio mudou de largura: o Git Bash se reajusta.
  agendarAjusteBash();
}

function mudarAtividade(estado) {
  terminais.atividade = estado;
  gravarTerminais();
  aplicarAtividade();
}

// Uma pergunta no terminal espera resposta (ADR-064): a Atividade volta se
// estiver escondida.
function mostrarAtividade() {
  if (terminais.atividade !== 'aberto') mudarAtividade('aberto');
}

// Chamado pelo log() a cada linha.
function avisarLinhaNova(tipo) {
  if (terminais.atividade === 'aberto') return;
  atividadeNovas++;
  if (tipo === 'error') atividadeErro = true;
  mostrarNovas();
}

function mostrarNovas() {
  const texto = atividadeNovas > 99 ? '99+' : String(atividadeNovas);
  for (const n of [tel.navAtividadeN, tel.trilhoN]) {
    if (!n) continue;
    n.hidden = !atividadeNovas;
    n.textContent = texto;
    n.classList.toggle('erro', atividadeErro);
  }
}

// ---------- Git Bash (o terminal de baixo) ----------

let bashTerm = null;
let bashFit = null;
let bashVivo = false;
let bashAbrindo = null;
let xtermCarregando = null;
let ajusteBashPendente = false;

// A vista está "grudada" no fim (no prompt)? Muda só quando a pessoa rola (roda
// do mouse, barra, teclado). Quando o painel muda de altura, o navegador ajusta
// a rolagem sozinho antes de o xterm.js se encaixar, e o xterm.js arredonda a
// posição em meia linha; nada disso pode contar como a pessoa rolando (ADR-129).
let bashGrudado = true;
let bashAjustando = false;

// O xterm.js se ajusta ao painel a cada quadro, mas o bash só fica sabendo do
// tamanho novo quando ele para de mudar (ADR-129): cada aviso faz o ConPTY
// redesenhar a tela, e dezenas seguidas duplicavam e picavam as linhas.
// Arrastando a borda, o aviso espera a mão soltar (um aviso por arrasto); nos
// outros casos (a janela, a Atividade abrindo ou fechando), 150 ms parado.
const BASH_TAMANHO_ESPERA = 150;
let bashTamanhoTimer = null;
let bashTamanhoAvisado = ''; // "colunasxlinhas" que o bash já conhece
let bashArrastando = false;

function agendarTamanhoDoBash() {
  clearTimeout(bashTamanhoTimer);
  bashTamanhoTimer = null;
  if (bashArrastando) return; // avisa quando a mão soltar a borda
  bashTamanhoTimer = setTimeout(avisarTamanhoDoBash, BASH_TAMANHO_ESPERA);
}

function avisarTamanhoDoBash() {
  bashTamanhoTimer = null;
  if (!bashVivo || !bashTerm) return;
  const atual = `${bashTerm.cols}x${bashTerm.rows}`;
  if (atual === bashTamanhoAvisado) return;
  bashTamanhoAvisado = atual;
  Promise.resolve(window.api.bashTamanho({ cols: bashTerm.cols, rows: bashTerm.rows })).catch(() => {});
}

// As 16 cores ANSI na paleta do Hub (docs/design.md, "Git Bash"): o fundo é o
// recuado do app, o texto é o texto do app, e cada cor ANSI cai no papel mais
// próximo (vermelho = falhou, verde = resultado bom, amarelo = ressalva, ciano
// = luz secundária). Roxo e azul não existem na paleta: o magenta vira o
// cinza-verde secundário e o azul, um ciano mais fechado. O prompt do Git
// Bash (verde, magenta, amarelo, ciano) continua legível, só na cor do Hub.
const TEMA_BASH = {
  background: '#061210',
  foreground: '#e8f3ee',
  cursor: '#3ee97d',
  cursorAccent: '#061210',
  selectionBackground: 'rgba(62, 233, 125, 0.28)',
  selectionForeground: '#e8f3ee',
  black: '#0a1c17', red: '#ff6b6b', green: '#49dc7a', yellow: '#f2c155',
  blue: '#1e9e9c', magenta: '#93b5a7', cyan: '#22f2ef', white: '#d2e7df',
  brightBlack: '#4f7d69', brightRed: '#ff8a8a', brightGreen: '#3ee97d', brightYellow: '#f7d27a',
  brightBlue: '#22f2ef', brightMagenta: '#bbcbb9', brightCyan: '#98fffc', brightWhite: '#ffffff',
};

// O xterm.js (o mesmo terminal do VS Code e do Antigravity) só carrega na
// primeira vez que o Git Bash abre: quem não usa não paga os 290 KB na
// abertura do Hub.
function carregarXterm() {
  if (xtermCarregando) return xtermCarregando;
  const script = (src) => new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => falha(new Error(`não carregou ${src}`));
    document.head.appendChild(s);
  });
  if (!document.getElementById('xtermCss')) {
    const css = document.createElement('link');
    css.id = 'xtermCss';
    css.rel = 'stylesheet';
    css.href = '../node_modules/@xterm/xterm/css/xterm.css';
    document.head.appendChild(css);
  }
  xtermCarregando = script('../node_modules/@xterm/xterm/lib/xterm.js')
    .then(() => script('../node_modules/@xterm/addon-fit/lib/addon-fit.js'));
  xtermCarregando.catch(() => { xtermCarregando = null; });
  return xtermCarregando;
}

function criarTerminalBash() {
  bashTerm = new Terminal({
    fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
    fontSize: 13,
    lineHeight: 1.2,
    // Piscando, o cursor redesenharia o terminal o tempo todo (ADR-126).
    cursorBlink: false,
    scrollback: 5000,
    theme: TEMA_BASH,
  });
  bashFit = new FitAddon.FitAddon();
  bashTerm.loadAddon(bashFit);
  bashTerm.open(tel.corpoBash);
  // Tecla não espera a volta (a digitação não fica presa na ida e volta). Vai
  // sempre, mesmo antes de o bash ser dado como vivo: logo ao abrir, o ConPTY
  // pergunta quem é o terminal (ESC [ c) e a resposta do xterm.js não pode se
  // perder; sem ela, ele espera ~3 s (ADR-129). Sem bash, o processo principal
  // descarta.
  bashTerm.onData((d) => { Promise.resolve(window.api.bashEscrever(d)).catch(() => {}); });
  bashTerm.onResize(agendarTamanhoDoBash);
  // Quem decide se a vista sai do fim é a pessoa: a roda do mouse e a barra de
  // rolagem (que mexem na vista sem disparar o onScroll do xterm.js) e o
  // teclado (Shift+PgUp etc., que dispara). A vista andando sozinha (o painel
  // mudando de altura, o xterm.js acompanhando o conteúdo) não conta.
  const conferirGrudado = () => {
    if (bashAjustando) return;
    const vista = bashTerm.buffer.active;
    bashGrudado = vista.viewportY >= vista.baseY;
  };
  const depoisDeRolar = () => setTimeout(conferirGrudado, 60);
  tel.corpoBash.addEventListener('wheel', depoisDeRolar, { passive: true });
  const vistaEl = tel.corpoBash.querySelector('.xterm-viewport');
  if (vistaEl) {
    let pelaBarra = false;
    vistaEl.addEventListener('pointerdown', (e) => { if (e.target === vistaEl) pelaBarra = true; });
    window.addEventListener('pointerup', () => { if (pelaBarra) { pelaBarra = false; depoisDeRolar(); } });
  }
  bashTerm.onScroll(conferirGrudado);
  bashTerm.attachCustomKeyEventHandler(teclaNoBash);
  window.api.onBashDados((d) => bashTerm.write(d));
  window.api.onBashSaiu(({ codigo }) => {
    bashVivo = false;
    marcarBashVivo();
    bashTerm.write(`\r\n${ESC}[90m[o bash terminou${codigo ? ` com código ${codigo}` : ''}; o + abre outro]${ESC}[0m\r\n`);
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(agendarAjusteBash).observe(tel.corpoBash);
}

// Copiar e colar como no terminal do VS Code: Ctrl+C copia quando há texto
// selecionado (sem seleção, o ^C vai para o bash e interrompe o comando);
// Ctrl+V cola (o navegador cola e o xterm manda o texto). Os atalhos do Hub
// (Ctrl+` e Ctrl+Shift+') passam para o Hub.
function teclaNoBash(e) {
  if (e.type !== 'keydown' || !e.ctrlKey) return true;
  const tecla = String(e.key || '').toLowerCase();
  if (tecla === 'c' && (e.shiftKey || bashTerm.hasSelection())) {
    const texto = bashTerm.getSelection();
    if (texto) window.api.copyToClipboard(texto);
    bashTerm.clearSelection();
    e.preventDefault();
    return false;
  }
  if (tecla === 'v') return false;
  if (e.code === 'Backquote') return false;
  return true;
}

function marcarBashVivo() {
  if (tel.navBashVivo) tel.navBashVivo.hidden = !bashVivo;
  if (tel.nome) tel.nome.textContent = bashVivo ? 'bash' : 'bash (encerrado)';
}

function aplicarBash() {
  const estado = terminais.bash;
  tel.dock.classList.toggle('hidden', estado === 'fechado');
  tel.dock.classList.toggle('min', estado === 'minimizado');
  tel.corpo.classList.toggle('bash-max', estado === 'aberto' && terminais.bashMax);
  tel.dock.style.setProperty('--bash-altura', `${terminais.bashAltura}px`);
  tel.navBash.classList.toggle('aberto', estado !== 'fechado');
  tel.max.title = terminais.bashMax ? 'Restaurar o tamanho' : 'Maximizar';
  marcarBashVivo();
  if (estado === 'aberto') agendarAjusteBash();
}

function mudarBash(estado) {
  terminais.bash = estado;
  aplicarBash();
}

// Mostra o painel e, se não houver bash vivo, abre um. Chamado de novo
// enquanto abre, devolve a mesma abertura.
function abrirBash() {
  mudarBash('aberto');
  if (bashAbrindo) return bashAbrindo;
  bashAbrindo = (async () => {
    try {
      await carregarXterm();
      if (!bashTerm) criarTerminalBash();
      ajustarBash();
      if (!bashVivo) {
        const r = await window.api.bashAbrir({ cols: bashTerm.cols, rows: bashTerm.rows });
        if (!r || !r.ok) {
          const motivo = (r && r.error) || 'não abriu';
          bashTerm.write(`${ESC}[31mNão abri o Git Bash: ${motivo}${ESC}[0m\r\n`);
          log(`Git Bash: ${motivo}`, 'error');
          return;
        }
        bashVivo = true;
        if (r.build) bashTerm.options.windowsPty = { backend: 'conpty', buildNumber: r.build };
        // Aberto agora, o bash nasceu com este tamanho; se a página recarregou
        // com ele vivo, o tamanho dele é o de antes e precisa do novo.
        bashTamanhoAvisado = r.jaAberto ? '' : `${bashTerm.cols}x${bashTerm.rows}`;
        if (r.jaAberto) agendarTamanhoDoBash();
        if (r.conpty === 'windows') log(`Git Bash aberto com o ConPTY do Windows, porque o do node-pty não carregou (${r.conptyErro || 'sem motivo'}). Redimensionar pode duplicar linhas.`, 'warn');
        marcarBashVivo();
      }
      bashTerm.focus();
    } catch (e) {
      log(`Git Bash: ${e.message}`, 'error');
    } finally {
      bashAbrindo = null;
    }
  })();
  return bashAbrindo;
}

// A lixeira: encerra o bash e limpa a tela (o próximo começa do zero).
async function encerrarBash() {
  if (bashVivo) {
    bashVivo = false;
    try { await window.api.bashFechar(); } catch (e) { /* já tinha saído */ }
  }
  bashTamanhoAvisado = '';
  if (bashTerm) bashTerm.reset();
  marcarBashVivo();
}

// O botão da barra lateral e o Ctrl+Shift+': aberto, esconde (o bash continua
// vivo); escondido ou minimizado, mostra.
function alternarBash() {
  if (terminais.bash === 'aberto') mudarBash('fechado');
  else abrirBash();
}

function agendarAjusteBash() {
  if (ajusteBashPendente || !bashTerm) return;
  ajusteBashPendente = true;
  requestAnimationFrame(() => { ajusteBashPendente = false; ajustarBash(); });
}

// Encaixa colunas e linhas no tamanho do painel; o onResize avisa o bash.
// Quem estava vendo o fim (o prompt) continua vendo o fim: sem isso, a vista
// ficava presa umas linhas acima depois de redimensionar, e a saída nova não
// rolava mais sozinha (ADR-129). Quem rolou para ler o histórico fica onde estava.
function ajustarBash() {
  if (!bashTerm || !bashFit || terminais.bash !== 'aberto') return;
  if (!tel.corpoBash.clientWidth || !tel.corpoBash.clientHeight) return;
  const grudado = bashGrudado;
  bashAjustando = true;
  try { bashFit.fit(); } catch (e) { /* ainda sem tamanho */ } finally { bashAjustando = false; }
  if (grudado) { bashTerm.scrollToBottom(); bashGrudado = true; }
}

// A borda de cima do Git Bash muda a altura, como a do painel do Antigravity.
tel.arrasto.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  const y0 = e.clientY;
  const h0 = tel.dock.getBoundingClientRect().height;
  const maximo = Math.max(BASH_ALTURA_MIN, tel.corpo.getBoundingClientRect().height - 140);
  try { tel.arrasto.setPointerCapture(e.pointerId); } catch (x) { /* segue sem captura */ }
  tel.dock.classList.add('arrastando');
  bashArrastando = true;
  let ativo = true;
  // O fim do arrasto por qualquer caminho: soltar, cancelar, perder a captura,
  // a janela perder o foco (Alt+Tab no meio), ou um movimento já sem o botão
  // apertado. Se o fim se perdesse, o bash nunca mais saberia do tamanho.
  const soltar = () => {
    if (!ativo) return;
    ativo = false;
    for (const [tipo, fn] of eventos) tel.arrasto.removeEventListener(tipo, fn);
    window.removeEventListener('blur', soltar);
    tel.dock.classList.remove('arrastando');
    bashArrastando = false;
    agendarTamanhoDoBash(); // agora sim: um aviso só, com o tamanho final
    gravarTerminais();
  };
  const mover = (ev) => {
    if (ev.buttons === 0) { soltar(); return; }
    terminais.bashAltura = Math.round(Math.min(maximo, Math.max(BASH_ALTURA_MIN, h0 + (y0 - ev.clientY))));
    tel.dock.style.setProperty('--bash-altura', `${terminais.bashAltura}px`);
  };
  const eventos = [['pointermove', mover], ['pointerup', soltar], ['pointercancel', soltar], ['lostpointercapture', soltar]];
  for (const [tipo, fn] of eventos) tel.arrasto.addEventListener(tipo, fn);
  window.addEventListener('blur', soltar);
});

tel.navAtividade.addEventListener('click', () => mudarAtividade(terminais.atividade === 'aberto' ? 'fechado' : 'aberto'));
tel.trilho.addEventListener('click', () => mudarAtividade('aberto'));
tel.atividadeMin.addEventListener('click', () => mudarAtividade('minimizado'));
tel.atividadeFechar.addEventListener('click', () => mudarAtividade('fechado'));

tel.navBash.addEventListener('click', alternarBash);
tel.fechar.addEventListener('click', () => mudarBash('fechado'));
tel.min.addEventListener('click', () => mudarBash('minimizado'));
tel.max.addEventListener('click', () => {
  terminais.bashMax = !terminais.bashMax;
  if (terminais.bash === 'aberto') aplicarBash();
  else abrirBash();
});
tel.lixo.addEventListener('click', async () => { await encerrarBash(); mudarBash('fechado'); });
tel.novo.addEventListener('click', async () => { await encerrarBash(); abrirBash(); });
// Minimizado, a barra inteira (menos os botões) devolve o terminal.
tel.head.addEventListener('click', (e) => {
  if (terminais.bash === 'minimizado' && !e.target.closest('button')) abrirBash();
});

// Ctrl+Shift+' (a tecla à esquerda do 1): abre ou esconde o Git Bash.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.code === 'Backquote') { e.preventDefault(); alternarBash(); }
});

lerTerminais();
aplicarAtividade();
aplicarBash();
