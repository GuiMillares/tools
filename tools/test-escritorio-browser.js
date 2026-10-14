// ADR-149/ADR-153: a tela do Escritório no renderer inteiro (index.html:
// app.js + terminais.js + automacao-ui.js + three.min.js + planta.js +
// escritorio-cena.js + escritorio-ui.js) num Chromium, com window.api falso.
// Prova que o Hub abre no Escritório de tela cheia (menu e topo recolhidos,
// voltando pela borda), que a cena 3D monta com uma figura por agente mais
// o Odin e os cartões presos a elas, que a gaveta mostra pendências, fila,
// regras e concluídas e que cada botão chama o canal certo com o payload
// certo, que o formulário de regra lê o que está nos campos, que o histórico
// abre, que quem muda de estado anda pela planta, que sair da tela para o
// laço de quadros, que a lista de espera vai para o processo principal e
// que a aba "IA & Escritório" das Configurações salva.
//
//     node tools/test-escritorio-browser.js

const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const SNAP = {
  ok: true,
  ligado: { geral: false, observacao: true, agentes: { bloqueador: false } },
  rodando: false,
  modelo: { configurado: false, temChave: true, ligado: false, orquestrador: 'gemini-3.1-pro-preview', agentes: 'gemini-3.8-flash' },
  contadores: { dia: '2026-10-13', chamadas: 3, tokensEntrada: 1200, tokensSaida: 300, tokensPensamento: 100 },
  ultimaVarredura: { quando: '2026-10-13T12:00:00.000Z', ok: true, lidas: 4 },
  salas: [],
  agentes: [
    { id: 'publicador-mpiplus', nome: 'Thor', papel: 'Publicador MPI+', modulosNomes: 'Publicar MPI+ / Publicação em Massa', funcao: 'PUBLICAÇÃO MPI+', modo: 'auto', modulos: ['publish'], sala: { numero: '02', nome: 'PUBLICAÇÃO' }, ligado: true, estado: 'ocioso', tarefas: 1 },
    { id: 'bloqueador', nome: 'Tyr', papel: 'Bloqueador de Contatos', modulosNomes: 'Bloquear Contatos', funcao: 'BLOQUEIO', modo: 'auto', modulos: ['doutor'], sala: { numero: '04', nome: 'CONTATOS' }, ligado: false, estado: 'desligado', tarefas: 0 },
    { id: 'hospedagem', nome: 'Huginn', papel: 'Hospedagem & E-mails', modulosNomes: 'Ativação SSL / E-mails / Suspensão & E-mails', funcao: 'SSL', modo: 'auto', modulos: ['ssl'], presets: [{ id: 'ssl', nome: 'Ativação de SSL', parametros: { acao: 'ssl' } }, { id: 'suspensao', nome: 'Suspensão', parametros: { acao: 'suspensao' } }], sala: { numero: '05', nome: 'HOSPEDAGEM' }, ligado: true, estado: 'aguardando', tarefas: 2 },
    { id: 'relator', nome: 'Bragi', papel: 'Relator', modulosNomes: 'Planilha do Relatório', funcao: 'PLANILHA', modo: 'standby', modulos: ['relatorio'], sala: { numero: '09', nome: 'RELATÓRIO' }, ligado: true, estado: 'trabalhando', atividade: 'Planilha do Relatório', tarefas: 0 },
  ],
  orquestrador: { id: 'orquestrador', nome: 'Odin', papel: 'Orquestrador' },
  tarefas: [
    { id: '00T1', assunto: 'Publicação (Troca de DNS) [MPI+] - cliente.com.br', link: 'https://sf/1', empresaFila: 'bc', estado: 'planejada', rotulo: 'planejada', tom: 'run', estadoDesde: '2026-10-13T12:00:00.000Z', agente: 'publicador-mpiplus', agenteNome: 'Publicador MPI+', pendenciaId: null, tentativas: 0, plano: { agente: 'publicador-mpiplus', origem: 'triagem', parametros: { dominio: 'cliente.com.br' }, etapas: [], validacao: { ok: true, resultados: [{ nome: 'Domínio válido', ok: true }] } }, ultimo: { quando: '2026-10-13T12:00:01.000Z', tipo: 'validacao', motivo: '' } },
    { id: '00T2', assunto: 'Ativação de SSL - a.com.br', link: 'https://sf/2', empresaFila: 'bc', estado: 'pendente', rotulo: 'pendente', tom: 'warn', estadoDesde: '2026-10-13T11:00:00.000Z', agente: null, agenteNome: '', pendenciaId: 'P-1', tentativas: 0, plano: null, ultimo: { quando: '2026-10-13T11:00:00.000Z', tipo: 'pendencia', motivo: 'q' } },
    { id: '00T3', assunto: 'Ativação de SSL - b.com.br', link: '', empresaFila: 'bc', estado: 'pendente', rotulo: 'pendente', tom: 'warn', estadoDesde: '2026-10-13T11:00:00.000Z', agente: null, agenteNome: '', pendenciaId: 'P-1', tentativas: 0, plano: null, ultimo: null },
    { id: '00T4', assunto: 'BLOQUEIO DE CONTATOS - x.com.br', link: '', empresaFila: null, estado: 'aguardando_confirmacao', rotulo: 'aguardando confirmação', tom: 'warn', estadoDesde: '2026-10-13T10:00:00.000Z', agente: 'bloqueador', agenteNome: 'Bloqueador de Contatos', pendenciaId: null, tentativas: 0, plano: { agente: 'bloqueador', origem: 'triagem', parametros: {}, etapas: [], validacao: null }, ultimo: null },
    { id: '00T5', assunto: 'Reunião', link: '', empresaFila: null, estado: 'ignorada', rotulo: 'ignorada', tom: 'neutral', estadoDesde: '2026-10-13T09:00:00.000Z', agente: null, agenteNome: '', pendenciaId: null, tentativas: 0, plano: null, ultimo: null },
    { id: '00T6', assunto: 'Ajuste Site MPI - adetech.com.br', link: 'https://sf/6', empresaFila: 'bc', estado: 'pendente', rotulo: 'pendente', tom: 'warn', estadoDesde: '2026-10-13T08:00:00.000Z', agente: null, agenteNome: '', pendenciaId: 'P-4', tentativas: 0, leitura: 'Republicar o site em subdiretório que sumiu por conflito com palavra bonificada', categoria: 'republicar-site-subdiretorio', plano: null, ultimo: null },
  ],
  pendencias: [
    { id: 'P-1', tipo: 'pergunta', padrao: 'ativacao de ssl - {dominio}', pergunta: 'Ativação de SSL vai para quem?', agente: null, contexto: { assuntoExemplo: 'Ativação de SSL - a.com.br' }, tarefas: ['00T2', '00T3'], criadaEm: '2026-10-13T11:00:00.000Z', status: 'aberta', proposta: null },
    { id: 'P-2', tipo: 'pergunta', padrao: 'x', pergunta: 'Pergunta respondida', agente: 'hospedagem', contexto: { assuntoExemplo: 'Suspensão - y.com.br' }, tarefas: [], criadaEm: '2026-10-13T10:00:00.000Z', status: 'respondida', proposta: { regra: { descricao: 'Suspensão → hospedagem', quando: [{ campo: 'assunto', op: 'comeca', valor: 'Suspensão' }], entao: { acao: 'encaminhar', agente: 'hospedagem', parametros: { acao: 'suspensao' } } }, erros: [], justificativa: 'o operador disse' } },
    { id: 'P-3', tipo: 'retomar', padrao: 'retomar:z', pergunta: 'O Hub fechou enquanto…', agente: 'bloqueador', contexto: {}, tarefas: [], criadaEm: '2026-10-13T09:00:00.000Z', status: 'aberta', proposta: null },
    { id: 'P-4', tipo: 'humano', padrao: 'humano:ajuste site mpi - {dominio}:republicar-site-subdiretorio', pergunta: 'Precisa de você: Republicar o site em subdiretório que sumiu. Nenhum agente publica subdiretório. Marque como tratada quando fizer.', agente: null, contexto: { assuntoExemplo: 'Ajuste Site MPI - adetech.com.br', categoria: 'republicar-site-subdiretorio', trechoChave: 'republicar o site novamente' }, tarefas: ['00T6'], criadaEm: '2026-10-13T08:00:00.000Z', status: 'aberta', proposta: null },
    { id: 'P-0', tipo: 'pergunta', padrao: 'velha', pergunta: 'fechada', agente: null, contexto: {}, tarefas: [], criadaEm: '2026-10-12T09:00:00.000Z', status: 'fechada', proposta: null },
  ],
  regras: [{ id: 'R-1', descricao: 'Quando assunto começa com "Cobrança" → ignorar', ativa: true, usos: 4, origem: 'pendência P-9', criadaEm: '2026-10-12T09:00:00.000Z', quando: [{ campo: 'assunto', op: 'comeca', valor: 'Cobrança' }], entao: { acao: 'ignorar', agente: '', parametros: {} } }],
};

const STUB = `
  window.__calls = [];
  window.__snap = ${JSON.stringify(SNAP)};
  window.__logs = [];
  const respostas = {
    getHubState: () => ({ ok: true, state: {} }),
    loadCreds: () => ({ ok: false }),
    getGoogleConfig: () => ({ ok: true, config: {} }),
    salesforceGetConfig: () => ({ ok: true, conectado: false }),
    getPublicacaoConfig: () => ({ ok: true, config: {}, empresas: {} }),
    salesforceTarefas: () => ({ ok: true, tarefas: [], filas: [], instancia: 'https://sf' }),
    usuarioLogado: () => ({ ok: true, nome: 'Teste', email: 'eu@x.test' }),
    escritorioEstado: () => window.__snap,
    escritorioTarefa: (p) => ({ ok: true, tarefa: { id: p.id, assunto: 'Publicação (Troca de DNS) [MPI+] - cliente.com.br', estado: 'planejada', agente: 'publicador-mpiplus', plano: { origem: 'triagem', parametros: { dominio: 'cliente.com.br' }, etapas: [], validacao: { quando: '2026-10-13T12:00:00.000Z', ok: true, resultados: [{ nome: 'Domínio válido', ok: true, motivo: '' }] } }, historico: [{ quando: '2026-10-13T12:00:00.000Z', tipo: 'fila', motivo: 'lida da fila' }, { quando: '2026-10-13T12:00:01.000Z', tipo: 'estado', de: 'na_fila', para: 'em_analise', motivo: 'analisando' }, { quando: '2026-10-13T12:00:02.000Z', tipo: 'decisao', origem: 'triagem', motivo: 'reconhecido' }] } }),
    iaGetConfig: () => ({ ok: true, config: { modeloOrquestrador: 'gemini-3.1-pro-preview', modeloAgentes: 'gemini-3.8-flash', nivelPensamento: 'HIGH', tetoChamadasDia: 200, temperatura: 0.2 }, temChave: false }),
    iaSetConfig: () => ({ ok: true, temChave: true }),
    iaModelos: () => ({ ok: true, modelos: [{ id: 'gemini-3.8-flash', nome: 'Gemini 3.8 Flash' }, { id: 'gemini-3.1-pro-preview', nome: 'Gemini 3.1 Pro' }] }),
  };
  respostas.onEscritorioExecutar = (cb) => { window.__ponte = cb; return () => {}; };
  window.api = new Proxy({}, { get: (t, name) => (...args) => {
    window.__calls.push({ name, args });
    if (String(name).startsWith('on')) return respostas[name] ? respostas[name](...args) : () => {};
    const r = respostas[name] ? respostas[name](...args) : { ok: true };
    return Promise.resolve(r);
  } });
`;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HUB_CHROME || undefined });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  const chamadas = (nome) => page.evaluate((n) => window.__calls.filter((c) => c.name === n), nome);
  const ultima = async (nome) => { const l = await chamadas(nome); return l.length ? l[l.length - 1].args[0] : null; };
  const gaveta = async (id) => { await page.click(`#escHudRodape [data-gaveta="${id}"]`); await page.waitForFunction((g) => window.hubEscritorio.ui.gaveta === g && !document.getElementById('escGaveta').hidden, id, { timeout: 3000 }); };
  const redesenhar = () => page.evaluate(() => window.hubEscritorio.carregar().then(() => window.hubEscritorio.desenhar()));
  try {
    await page.addInitScript(STUB);
    await page.goto('file://' + path.join(ROOT, 'renderer', 'index.html').replace(/\\/g, '/'));
    await page.mouse.move(700, 450);
    await page.waitForFunction(() => window.hubEscritorio && document.querySelector('#escCena') && document.querySelectorAll('#escOverlay .esc-agente').length === 5, { timeout: 10000 });

    console.log('\n=== Tela cheia: menu e topo pela borda ===');
    check('index.html inteiro carrega sem erro de página', erros.length === 0, erros.join(' | '));
    check('o Hub abre no Escritório, acima do Início na barra lateral, e a moldura entra em tela cheia', await page.evaluate(() => state.view === 'escritorio' && document.querySelector('.app').classList.contains('esc-cheia') && document.querySelector('#navList .nav-item').textContent.trim() === 'Escritório' && document.querySelector('#navList .nav-item.active').textContent.trim() === 'Escritório'));
    check('o menu e o topo ficam fora da tela; a cena ocupa a janela inteira', await page.evaluate(() => { const nav = document.querySelector('.app-nav').getBoundingClientRect(), topo = document.querySelector('.topbar').getBoundingClientRect(), cena = document.getElementById('escCena').getBoundingClientRect(); return nav.right <= 0 && topo.bottom <= 0 && cena.width >= innerWidth - 2 && cena.height >= innerHeight - 2; }), await page.evaluate(() => JSON.stringify([document.querySelector('.app-nav').getBoundingClientRect(), document.querySelector('.topbar').getBoundingClientRect()])));
    check('o terminal e o Git Bash não aparecem na tela cheia', await page.evaluate(() => getComputedStyle(document.querySelector('.terminal-panel')).display === 'none' && getComputedStyle(document.getElementById('bashDock')).display === 'none'));
    await page.mouse.move(3, 400);
    await page.waitForFunction(() => document.querySelector('.app').classList.contains('menu-aberto'), { timeout: 2000 });
    await page.waitForFunction(() => document.querySelector('.app-nav').getBoundingClientRect().left === 0, { timeout: 2000 }).catch(() => {});
    check('encostar o mouse na borda esquerda traz o menu (desliza até a borda)', await page.evaluate(() => document.querySelector('.app-nav').getBoundingClientRect().left === 0), await page.evaluate(() => getComputedStyle(document.querySelector('.app-nav')).transform));
    await page.mouse.move(120, 400);
    await page.mouse.move(700, 450);
    await page.waitForFunction(() => !document.querySelector('.app').classList.contains('menu-aberto'), { timeout: 2000 });
    check('sair do menu recolhe', true);
    await page.mouse.move(700, 2);
    await page.waitForFunction(() => document.querySelector('.app').classList.contains('topo-aberto'), { timeout: 2000 });
    await page.mouse.move(700, 450);
    await page.waitForFunction(() => !document.querySelector('.app').classList.contains('topo-aberto'), { timeout: 2000 });
    check('encostar na borda de cima traz o topo, e sair recolhe', true);
    await page.click('#escMenuBtn');
    check('o botão ☰ do HUD abre o menu', await page.evaluate(() => document.querySelector('.app').classList.contains('menu-aberto')));
    await page.keyboard.press('Escape');
    check('Esc fecha o menu', await page.evaluate(() => !document.querySelector('.app').classList.contains('menu-aberto')));
    check('o chip no topo mostra o modo e as pendências', await page.evaluate(() => /ESCRITÓRIO · manual · 4 pend\./.test(document.getElementById('tbEscritorio').textContent.replace(/\s+/g, ' '))), await page.evaluate(() => document.getElementById('tbEscritorio').textContent));
    check('a lista de espera do app foi mandada para o processo principal', (await chamadas('escritorioEsperas')).length >= 1);

    console.log('\n=== A cena ===');
    const cena = await page.evaluate(() => { const m = window.hubEscritorio.motor; const f = (id) => { const e = m.sim.figuras.get(id); return e ? { alvo: e.alvo.tipo, presente: e.presente, icone: e.icone, tela: e.tela } : null; }; return { tipo: m.tipo, canvas: !!document.querySelector('#escPalco canvas.esc-canvas'), figuras: [...m.sim.figuras.keys()], odin: f('orquestrador'), thor: f('publicador-mpiplus'), tyr: f('bloqueador'), huginn: f('hospedagem'), bragi: f('relator'), pacotes: [...m.sim.pacotes.values()].map((p) => [p.id, p.lugar]), rodando: m.rodando }; });
    check('o motor 3D monta com o canvas no palco', cena.tipo === '3d' && cena.canvas, JSON.stringify(cena));
    check('uma figura por agente mais o Odin', cena.figuras.length === 5 && cena.figuras.includes('orquestrador'));
    check('Odin está na reunião (pendência sem agente) com o ícone de pergunta; Huginn também (proposta de regra dele em aberto)', cena.odin.alvo === 'reuniao' && cena.odin.icone === 'pergunta' && cena.huginn.alvo === 'reuniao', JSON.stringify([cena.odin, cena.huginn]));
    check('Thor ocioso na mesa; Tyr desligado está ausente com a tela apagada; Bragi trabalhando com o ícone girando', cena.thor.alvo === 'mesa' && cena.thor.icone === null && !cena.tyr.presente && cena.tyr.tela === 'desligada' && cena.bragi.icone === 'trabalho' && cena.bragi.tela === 'trabalhando', JSON.stringify([cena.thor, cena.tyr, cena.bragi]));
    check('os pacotes: a planejada na mesa do Thor, as pendentes na mesa de reunião, a aguardando confirmação na mesa do Tyr', JSON.stringify(cena.pacotes.sort()) === JSON.stringify([['00T1', 'sala:02'], ['00T2', 'reuniao'], ['00T3', 'reuniao'], ['00T4', 'sala:04'], ['00T6', 'reuniao']]), JSON.stringify(cena.pacotes));
    check('o laço roda enquanto um ícone de trabalho gira', cena.rodando === true);
    check('cartões presos às figuras: Thor com nome e papel; Tyr desligado; Bragi em standby trabalhando com o módulo; Odin como orquestrador', await page.evaluate(() => {
      const c = (id) => document.querySelector(`#escOverlay .esc-agente[data-agente="${id}"]`);
      const thor = c('publicador-mpiplus'), tyr = c('bloqueador'), bragi = c('relator'), odin = c('orquestrador');
      const posto = (el) => /translate\(/.test(el.style.transform);
      return /Thor/.test(thor.querySelector('.esc-agente-nome').textContent) && /Publicador MPI\+/.test(thor.querySelector('.esc-agente-papel').textContent) && posto(thor) && tyr.classList.contains('est-desligado') && bragi.classList.contains('standby') && bragi.classList.contains('est-trabalhando') && /Planilha do Relatório/.test(bragi.querySelector('.esc-agente-atividade').textContent) && odin.classList.contains('orquestrador') && /Odin/.test(odin.textContent);
    }));
    check('os rótulos das 10 salas estão na cena', await page.evaluate(() => document.querySelectorAll('#escOverlay .esc-sala-rotulo').length === 10 && /01 \/ SALA DE COMANDO/.test(document.querySelector('[data-sala="01"]').textContent)));
    check('cada figura tem o losango com o ícone da função (ancorado); o do desligado não aparece; só o de quem trabalha flutua', await page.evaluate(() => {
      const l = (id) => document.querySelector(`#escOverlay .esc-losango[data-losango="${id}"]`);
      return document.querySelectorAll('#escOverlay .esc-losango').length === 5 && !!l('publicador-mpiplus').querySelector('svg') && !!l('orquestrador').querySelector('svg') && getComputedStyle(l('bloqueador')).display === 'none' && l('relator').classList.contains('est-trabalhando') && getComputedStyle(l('relator')).animationName === 'none' && /translate\(/.test(l('orquestrador').style.transform);
    }));
    const flutua = await page.evaluate(async () => {
      const l = document.querySelector('#escOverlay .esc-losango[data-losango="relator"]'), t = document.querySelector('#escOverlay .esc-losango[data-losango="publicador-mpiplus"]');
      const antes = l.style.transform, thorAntes = t.style.transform;
      const t0 = Date.now();
      while (l.style.transform === antes && Date.now() - t0 < 2500) await new Promise((r) => setTimeout(r, 50));
      return { antes, depois: l.style.transform, thorAntes, thorDepois: t.style.transform };
    });
    check('o losango de quem trabalha flutua pelo laço (o transform muda entre quadros); o do ocioso fica parado', flutua.antes !== flutua.depois && flutua.thorAntes === flutua.thorDepois, JSON.stringify(flutua));
    // Janela pequena: os cartões encolhem com a cena e viram compactos; o HUD se rearruma.
    await page.setViewportSize({ width: 1000, height: 640 });
    await page.waitForFunction(() => document.getElementById('escOverlay').classList.contains('compacto'), { timeout: 3000 }).catch(() => {});
    const pequena = await page.evaluate(() => {
      const c = document.querySelector('#escOverlay .esc-agente[data-agente="publicador-mpiplus"]');
      const m = /scale\(([\d.]+)\)/.exec(c.style.transform);
      const r = document.querySelector('#escOverlay .esc-sala-rotulo[data-sala="01"]');
      return { compacto: document.getElementById('escOverlay').classList.contains('compacto'), escala: m ? Number(m[1]) : null, papel: getComputedStyle(c.querySelector('.esc-agente-papel')).display, rotulo: /scale\(/.test(r.style.transform), comandoTop: document.getElementById('escHudComando').getBoundingClientRect().top };
    });
    check('em janela pequena os cartões encolhem com a cena, viram compactos (sem o papel), os rótulos encolhem junto e o Comando desce para baixo do título', pequena.compacto && pequena.escala != null && pequena.escala < 0.75 && pequena.papel === 'none' && pequena.rotulo && pequena.comandoTop > 50, JSON.stringify(pequena));
    check('nenhum cartão cobre outro nem cobre um rótulo de sala', await page.evaluate(() => {
      const caixas = [...document.querySelectorAll('#escOverlay .esc-agente, #escOverlay .esc-sala-rotulo')].filter((e) => e.style.display !== 'none' && getComputedStyle(e).display !== 'none').map((e) => ({ id: e.dataset.agente || e.dataset.sala, r: e.getBoundingClientRect() }));
      const cruza = (a, b) => a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2;
      const pares = [];
      for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) if (cruza(caixas[i].r, caixas[j].r)) pares.push(caixas[i].id + '×' + caixas[j].id);
      window.__cruzamentos = pares;
      return pares.length === 0;
    }), await page.evaluate(() => (window.__cruzamentos || []).join(', ')));
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForFunction(() => !document.getElementById('escOverlay').classList.contains('compacto'), { timeout: 3000 }).catch(() => {});
    check('de volta à janela grande, os cartões voltam ao tamanho cheio', await page.evaluate(() => !document.getElementById('escOverlay').classList.contains('compacto') && getComputedStyle(document.querySelector('#escOverlay .esc-agente[data-agente="publicador-mpiplus"] .esc-agente-papel')).display !== 'none'));
    check('sem selo de reunião nem câmera automática (pedido de 14/10)', await page.evaluate(() => !document.querySelector('.esc-selo.reuniao') && !/cam\.seguir|cam\.entrada/.test(String(window.hubEscritorioCena.criarCamera))));
    check('o cabeçalho apresenta Odin como orquestrador e a última varredura', await page.evaluate(() => /Odin, o orquestrador/.test(document.querySelector('.home-hi__sub').textContent) && /última varredura/i.test(document.querySelector('.home-hi__sub').textContent)));
    await page.click('#escPaineis');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#escOverlay .esc-agente')).opacity === '0', { timeout: 2000 }).catch(() => {});
    check('"Esconder painéis" some com os cartões e lembra a escolha', await page.evaluate(() => document.getElementById('escOverlay').classList.contains('sem-paineis') && getComputedStyle(document.querySelector('#escOverlay .esc-agente')).opacity === '0' && JSON.parse(localStorage.getItem('hub.escritorio.tela')).paineis === false));
    await page.click('#escPaineis');
    check('"Mostrar painéis" traz de volta', await page.evaluate(() => !document.getElementById('escOverlay').classList.contains('sem-paineis')));
    await page.click('#escOverlay .esc-agente[data-agente="hospedagem"]');
    check('clicar no cartão abre a gaveta do agente, com o cartão completo, as pendências dele e o interruptor', await page.evaluate(() => { const g = document.getElementById('escGaveta'); return !g.hidden && window.hubEscritorio.ui.gaveta === 'agente:hospedagem' && /Huginn/.test(g.querySelector('.esc-gaveta-head').textContent) && !!g.querySelector('.esc-agente-card[data-agente-card="hospedagem"] [data-agente-toggle]') && !!g.querySelector('[data-pend="P-2"]'); }));
    await page.keyboard.press('Escape');
    check('Esc fecha a gaveta', await page.evaluate(() => document.getElementById('escGaveta').hidden && window.hubEscritorio.ui.gaveta === null));
    await page.click('#escOverlay .esc-agente[data-agente="orquestrador"]');
    check('a gaveta do Odin mostra o que está na mesa dele e o botão de rodar', await page.evaluate(() => /Odin/.test(document.querySelector('#escGaveta .esc-gaveta-head').textContent) && !!document.getElementById('escRodar2') && /Na mesa dele/.test(document.getElementById('escGaveta').textContent)));
    await page.click('#escMotor');
    await page.waitForFunction(() => window.hubEscritorio.motor && window.hubEscritorio.motor.tipo === '2d', { timeout: 3000 });
    check('o botão 3D troca para a planta em 2D (canvas 2D) e lembra', await page.evaluate(() => !!document.querySelector('#escPalco canvas.esc-canvas-2d') && !document.querySelector('#escPalco canvas:not(.esc-canvas-2d)') && JSON.parse(localStorage.getItem('hub.escritorio.tela')).motor === '2d' && document.querySelectorAll('#escOverlay .esc-agente').length === 5));
    await page.click('#escMotor');
    await page.waitForFunction(() => window.hubEscritorio.motor && window.hubEscritorio.motor.tipo === '3d', { timeout: 3000 });
    check('e volta para o 3D', await page.evaluate(() => !document.querySelector('#escPalco canvas.esc-canvas-2d') && !!document.querySelector('#escPalco canvas.esc-canvas')));

    console.log('\n=== Quem muda de estado anda ===');
    await page.evaluate(() => { const s = window.__snap; s.pendencias.find((p) => p.id === 'P-2').status = 'fechada'; s.agentes.find((a) => a.id === 'hospedagem').estado = 'ocioso'; s.tarefas.find((t) => t.id === '00T1').estado = 'concluida'; s.tarefas.find((t) => t.id === '00T1').rotulo = 'concluída'; const t2 = s.tarefas.find((t) => t.id === '00T2'); t2.estado = 'planejada'; t2.rotulo = 'planejada'; t2.agente = 'publicador-mpiplus'; });
    await redesenhar();
    await page.waitForSelector('#escOverlay .esc-selo.viagem[data-pacote="00T2"]', { timeout: 3000 }).catch(() => {});
    check('a tarefa encaminhada viaja da mesa de reunião para a mesa do Thor com o selo dizendo o assunto e para quem vai', await page.evaluate(() => { const p = window.hubEscritorio.motor.sim.pacotes.get('00T2'); const selo = document.querySelector('#escOverlay .esc-selo.viagem[data-pacote="00T2"]'); return p && p.andando && p.lugar === 'sala:02' && !!selo && /Ativação de SSL - a\.com\.br → Thor/.test(selo.textContent) && /translate\(/.test(selo.style.transform); }), await page.evaluate(() => { const s = document.querySelector('#escOverlay .esc-selo.viagem'); return s ? s.textContent : 'sem selo'; }));
    const partiu = await page.evaluate(() => { const m = window.hubEscritorio.motor; const h = m.sim.figuras.get('hospedagem'); return { andando: h.andando, alvo: h.alvo.tipo, pos: { ...h.pos }, caminho: h.caminho.length, pops: m.sim.pops.length, pacote: m.sim.pacotes.has('00T1') }; });
    check('Huginn, sem pendência, sai da reunião andando para a mesa dele pelo corredor', partiu.andando && partiu.alvo === 'mesa' && partiu.caminho >= 6, JSON.stringify(partiu));
    check('a tarefa concluída sumiu da mesa e virou um "✓" subindo', !partiu.pacote && partiu.pops === 1, JSON.stringify(partiu));
    await page.waitForTimeout(900);
    const andou = await page.evaluate(() => { const h = window.hubEscritorio.motor.sim.figuras.get('hospedagem'); return { pos: { ...h.pos }, andando: h.andando, cartao: document.querySelector('#escOverlay .esc-agente[data-agente="hospedagem"]').style.transform }; });
    check('um segundo depois ele está em outro lugar, ainda andando, e o cartão foi junto', (andou.pos.x !== partiu.pos.x || andou.pos.z !== partiu.pos.z) && andou.andando && /translate\(/.test(andou.cartao), JSON.stringify([partiu.pos, andou.pos]));
    check('a atualização do snapshot não refez a cena (o mesmo canvas continua no palco)', await page.evaluate(() => document.querySelectorAll('#escPalco canvas').length === 1));

    console.log('\n=== Comando e gaveta ===');
    await page.click('#escFreio');
    check('o Freio desliga o modo automático', JSON.stringify(await ultima('escritorioLigar')) === '{"geral":false}');
    await page.click('#escHudComando label:has(#escGeral)');
    check('ligar o modo automático chama escritorioLigar({ geral: true })', JSON.stringify(await ultima('escritorioLigar')) === '{"geral":true}');
    await page.click('#escHudComando label:has(#escObs)');
    check('desligar a observação chama escritorioLigar({ observacao: false })', JSON.stringify(await ultima('escritorioLigar')) === '{"observacao":false}');
    check('o interruptor do modelo começa desligado e diz que não custa', await page.evaluate(() => !document.getElementById('escModelo').checked && /sem custo/.test(document.querySelector('#escHudComando label:has(#escModelo)').textContent)));
    await page.click('#escHudComando label:has(#escModelo)');
    check('ligar o modelo chama iaUsarModelo({ ligar: true })', JSON.stringify(await ultima('iaUsarModelo')) === '{"ligar":true}');
    await page.click('#escRodar');
    check('"Rodar agora" chama escritorioRodar', (await chamadas('escritorioRodar')).length === 1);
    await gaveta('comando');
    check('a gaveta Comando mostra os contadores, os cartões dos agentes e os interruptores grandes', await page.evaluate(() => /3/.test(document.querySelector('#escGaveta .esc-stat b').textContent) && document.querySelectorAll('#escGaveta .esc-agente-card').length === 4 && !!document.querySelector('#escGaveta [data-ligar="geral"]')));
    await page.click('#escGaveta .esc-agente-card[data-agente-card="bloqueador"] .esc-mini-switch');
    check('o interruptor do agente chama escritorioLigar({ agente, valor })', JSON.stringify(await ultima('escritorioLigar')) === '{"agente":"bloqueador","valor":true}');
    check('a linha "Aguardando DNS" aparece quando a lista de espera tem alguém', await page.evaluate(() => { esperas = [{ dominio: 'w.com.br', status: 'esperando', cliente: true }]; window.hubEscritorio.desenhar(); const el = document.getElementById('escEsperas'); const ok = !!el && /o cliente apontar/.test(el.textContent) && /w\.com\.br/.test(el.textContent); esperas = []; window.hubEscritorio.desenhar(); return ok && !document.getElementById('escEsperas'); }));
    check('a tela avisou que nasceu (as chamadas penduradas da ponte falham) e registrou a ponte', (await chamadas('escritorioRendererPronto')).length === 1 && await page.evaluate(() => typeof window.__ponte === 'function'));
    const ponte = await page.evaluate(async () => {
      window.hubPublicarTarefaAuto = async (p) => ({ ok: true, mensagem: 'publicado ' + p.dominio });
      const r = await window.__ponte({ id: 'ponte-7', driver: 'publicarMpiPlus', payload: { dominio: 'a.com.br', temporario: 'a.mpitemporario.com.br' } });
      const r2 = await window.__ponte({ id: 'ponte-8', driver: 'outro', payload: {} });
      return { r, r2, devolvidos: window.__calls.filter((c) => c.name === 'escritorioResultado').map((c) => c.args[0]) };
    });
    check('a ponte roda o driver do Publicar MPI+ e devolve o desfecho ao processo principal', ponte.r.ok && ponte.devolvidos.length === 2 && ponte.devolvidos[0].id === 'ponte-7' && ponte.devolvidos[0].resultado.mensagem === 'publicado a.com.br', JSON.stringify(ponte));
    check('driver desconhecido na ponte desiste com motivo, sem exceção', !ponte.r2.ok && ponte.r2.desistir && /driver desconhecido/.test(ponte.r2.motivo));

    await gaveta('pendencias');
    check('as pendências abertas aparecem (3, a respondida fechou), a fechada não, e o rodapé conta', await page.evaluate(() => document.querySelectorAll('#escGaveta .esc-pend').length === 3 && !document.querySelector('[data-pend="P-0"]') && !document.querySelector('[data-pend="P-2"]') && document.querySelector('#escHudRodape [data-gaveta="pendencias"] .n').textContent === '3'));
    check('a pendência "para você" mostra a leitura do comentário, a categoria e o botão de tratada', await page.evaluate(() => { const p = document.querySelector('[data-pend="P-4"]'); return p && p.classList.contains('tipo-humano') && /para você/.test(p.querySelector('.sec-title').textContent) && /republicar-site-subdiretorio/.test(p.querySelector('.sec-meta').textContent) && /Republicar o site em subdiretório que sumiu por conflito/.test(p.querySelector('.esc-leitura').textContent) && !!p.querySelector('[data-acao="tratada"]') && !!p.querySelector('[data-acao="avisar-sempre"]'); }));
    await page.click('[data-pend="P-4"] [data-acao="avisar-sempre"]');
    check('"Avisar sempre" manda a resposta certa', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-4","resposta":{"acao":"avisar-sempre"}}');
    await page.click('[data-pend="P-4"] [data-acao="tratada"]');
    check('"Marcar como tratada" na pendência para você', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-4","resposta":{"acao":"tratada"}}');
    check('a pendência agrupa as duas tarefas', await page.evaluate(() => document.querySelectorAll('[data-pend="P-1"] .esc-chip').length === 2));
    check('o seletor de agente mostra nome · papel · módulos', await page.evaluate(() => [...document.querySelectorAll('[data-pend="P-1"] [data-agente-sel] option')].some((o) => o.textContent === 'Thor · Publicador MPI+ · Publicar MPI+ / Publicação em Massa')));
    await page.fill('[data-pend="P-1"] [data-texto]', 'é sempre a hospedagem');
    await page.click('[data-pend="P-1"] [data-acao="texto"]');
    check('responder em texto manda a resposta certa', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-1","resposta":{"acao":"texto","texto":"é sempre a hospedagem"}}');
    await page.click('[data-pend="P-1"] [data-acao="ignorar-sempre"]');
    check('"Ignorar sempre"', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-1","resposta":{"acao":"ignorar-sempre"}}');
    check('o seletor oferece o Huginn com os dois presets, não o Huginn seco', await page.evaluate(() => { const vals = [...document.querySelectorAll('[data-pend="P-1"] [data-agente-sel] option')].map((o) => o.value); return vals.includes('hospedagem|ssl') && vals.includes('hospedagem|suspensao') && !vals.includes('hospedagem'); }));
    await page.selectOption('[data-pend="P-1"] [data-agente-sel]', 'hospedagem|ssl');
    await page.click('[data-pend="P-1"] [data-acao="encaminhar"]');
    check('"Encaminhar sempre" leva o agente e os parâmetros do preset', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-1","resposta":{"acao":"encaminhar","agente":"hospedagem","parametros":{"acao":"ssl"}}}', JSON.stringify(await ultima('escritorioResponder')));
    await page.selectOption('[data-pend="P-1"] [data-agente-sel]', 'hospedagem|suspensao');
    await page.click('[data-pend="P-1"] [data-acao="so-desta-vez"]');
    check('"Só desta vez" chama escritorioAplicarSemRegra com o preset', JSON.stringify(await ultima('escritorioAplicarSemRegra')) === '{"id":"P-1","agente":"hospedagem","parametros":{"acao":"suspensao"}}');
    await page.evaluate(() => window.hubEscritorioAtividade('auditor', true, 'Quando publicou'));
    check('hubEscritorioAtividade manda a atividade do módulo ao processo principal', JSON.stringify(await ultima('escritorioAtividade')) === '{"agente":"auditor","ligado":true,"detalhe":"Quando publicou"}');
    await page.click('[data-pend="P-3"] [data-acao="retomar"]');
    check('"Retomar" na interrompida', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-3","resposta":{"acao":"retomar"}}');

    // Proposta de regra: o formulário mostra a proposta; editar e aprovar
    // manda a regra lida dos campos.
    await page.evaluate(() => { window.__snap.pendencias.find((p) => p.id === 'P-2').status = 'respondida'; });
    await redesenhar();
    check('a pendência respondida mostra a proposta com a condição e o agente', await page.evaluate(() => {
      const f = document.querySelector('[data-pend="P-2"] [data-form]');
      return f && f.querySelector('[data-valor]').value === 'Suspensão' && f.querySelector('[data-op]').value === 'comeca' && f.querySelector('[data-agente-regra]').value === 'hospedagem' && /acao=suspensao/.test(f.querySelector('[data-params]').value);
    }));
    await page.fill('[data-pend="P-2"] [data-form] [data-descricao]', 'Suspensão vai para a hospedagem');
    await page.fill('[data-pend="P-2"] [data-form] [data-params]', 'acao=suspensao\nprojeto=Busca Cliente');
    await page.click('[data-pend="P-2"] [data-acao="aprovar-regra"]');
    const aprov = await ultima('escritorioAprovarRegra');
    check('aprovar manda a regra lida do formulário (condição, ação, agente, parâmetros, descrição)', aprov && aprov.id === 'P-2' && aprov.regra.quando[0].valor === 'Suspensão' && aprov.regra.entao.agente === 'hospedagem' && aprov.regra.entao.parametros.projeto === 'Busca Cliente' && aprov.regra.descricao === 'Suspensão vai para a hospedagem', JSON.stringify(aprov));

    // Fila de tarefas e histórico.
    await gaveta('fila');
    check('a fila lista as tarefas abertas (4), não a ignorada nem a concluída, com a leitura do comentário', await page.evaluate(() => document.querySelectorAll('#escGaveta .esc-tabela tbody tr').length === 4 && !document.querySelector('[data-tarefa="00T5"]') && !document.querySelector('[data-tarefa="00T1"]') && /Republicar o site/.test(document.querySelector('[data-tarefa="00T6"] .esc-leitura').textContent)));
    check('tarefa aguardando confirmação tem o botão Executar', await page.evaluate(() => !!document.querySelector('[data-tarefa="00T4"] [data-confirmar]')));
    await page.click('[data-tarefa="00T4"] [data-confirmar]');
    check('Executar chama escritorioConfirmar', JSON.stringify(await ultima('escritorioConfirmar')) === '{"id":"00T4"}');
    await page.click('[data-tarefa="00T2"] [data-reanalisar]');
    check('reanalisar chama escritorioReanalisar', JSON.stringify(await ultima('escritorioReanalisar')) === '{"id":"00T2"}');
    await gaveta('historico');
    check('a gaveta de concluídas e ignoradas lista a ignorada e a concluída', await page.evaluate(() => !!document.querySelector('[data-tarefa="00T5"]') && !!document.querySelector('[data-tarefa="00T1"]')));
    await page.click('[data-tarefa="00T1"] [data-hist]');
    await page.waitForSelector('.esc-hist', { timeout: 3000 });
    check('o histórico abre com as linhas e a validação', await page.evaluate(() => document.querySelectorAll('.esc-hist-linha').length === 3 && /Domínio válido/.test(document.querySelector('.esc-hist-plano').textContent)));
    await page.click('#escHistFechar');
    check('o histórico fecha', await page.evaluate(() => !document.querySelector('.esc-hist')));

    // Regras.
    await gaveta('regras');
    check('a gaveta de regras lista a regra com usos e origem', await page.evaluate(() => /Cobrança/.test(document.querySelector('[data-regra="R-1"]').textContent) && /pendência P-9/.test(document.querySelector('[data-regra="R-1"]').textContent)));
    await page.click('[data-regra="R-1"] .esc-mini-switch');
    const salva = await ultima('escritorioRegraSalvar');
    check('desligar a regra salva com ativa=false e o mesmo id', salva && salva.regra.id === 'R-1' && salva.regra.ativa === false);
    await page.click('[data-editar-regra="R-1"]');
    check('editar abre o formulário com a regra, e a ação tem "avisar"', await page.evaluate(() => { const f = document.querySelector('[data-form="regra"]'); return f && f.dataset.regraId === 'R-1' && f.querySelector('[data-valor]').value === 'Cobrança' && f.querySelector('[data-acao-sel]').value === 'ignorar' && [...f.querySelectorAll('[data-acao-sel] option')].some((o) => o.value === 'avisar'); }));
    await page.click('[data-form="regra"] [data-add-cond]');
    check('+ condição adiciona uma linha mantendo a primeira', await page.evaluate(() => document.querySelectorAll('[data-form="regra"] [data-cond]').length === 2 && document.querySelector('[data-form="regra"] [data-valor]').value === 'Cobrança'));
    await page.fill('[data-form="regra"] [data-cond="1"] [data-valor]', 'bc');
    await page.selectOption('[data-form="regra"] [data-cond="1"] [data-campo]', 'fila');
    await page.click('[data-acao="salvar-regra"]');
    const editada = await ultima('escritorioRegraSalvar');
    check('salvar manda a regra editada com as duas condições', editada && editada.regra.id === 'R-1' && editada.regra.quando.length === 2 && editada.regra.quando[1].campo === 'fila' && editada.regra.quando[1].valor === 'bc', JSON.stringify(editada));
    page.once('dialog', (d) => d.accept());
    await page.click('[data-apagar-regra="R-1"]');
    check('apagar pede confirmação e chama escritorioRegraApagar', JSON.stringify(await ultima('escritorioRegraApagar')) === '{"id":"R-1"}');
    await page.click('#escHudRodape [data-gaveta="regras"]');
    check('clicar de novo no botão do rodapé fecha a gaveta', await page.evaluate(() => document.getElementById('escGaveta').hidden));

    console.log('\n=== Terminal por cima, log e saída da tela ===');
    await page.click('#escTerminal');
    check('"Atividade" traz o terminal por cima da cena, à direita', await page.evaluate(() => { const r = document.querySelector('.terminal-panel').getBoundingClientRect(); return document.querySelector('.app').classList.contains('esc-terminal') && getComputedStyle(document.querySelector('.terminal-panel')).display !== 'none' && r.right >= innerWidth - 1 && r.left > innerWidth / 2; }));
    await page.click('#escTerminal');
    check('e de novo esconde', await page.evaluate(() => getComputedStyle(document.querySelector('.terminal-panel')).display === 'none'));
    const antes = (await chamadas('gravarLog')).length;
    await page.evaluate(() => log('linha do escritório', 'info', { arquivo: false }));
    await page.waitForTimeout(700);
    check('log(..., { arquivo: false }) mostra no terminal e não grava', (await chamadas('gravarLog')).length === antes && await page.evaluate(() => /linha do escritório/.test(document.getElementById('terminal').textContent)));

    // Configurações: aba IA & Escritório. Sair do Escritório desfaz a tela
    // cheia e para o laço; voltar reaproveita o mesmo canvas.
    await page.evaluate(() => openSettings('ia'));
    await page.waitForFunction(() => document.querySelector('[data-cfg-pane="ia"].active'), { timeout: 3000 });
    // A animação de entrada do topo (fadeUp, 0,35 s) roda de novo ao voltar à grade: espera assentar.
    await page.waitForFunction(() => document.querySelector('.topbar').getBoundingClientRect().top === 0 && document.querySelector('.app-nav').getBoundingClientRect().left === 0, { timeout: 3000 }).catch(() => {});
    const saida = await page.evaluate(() => ({ cheia: document.querySelector('.app').classList.contains('esc-cheia'), nav: document.querySelector('.app-nav').getBoundingClientRect().left, topo: document.querySelector('.topbar').getBoundingClientRect().top, rodando: window.hubEscritorio.motor.rodando }));
    check('sair do Escritório desfaz a tela cheia (menu e topo voltam à grade) e o laço de quadros para', !saida.cheia && saida.nav === 0 && saida.topo === 0 && saida.rodando === false, JSON.stringify(saida));
    check('a aba IA & Escritório abre com a configuração lida', await page.evaluate(() => document.getElementById('iaModeloOrqInput').value === 'gemini-3.1-pro-preview' && document.getElementById('iaNivelSelect').value === 'HIGH' && document.getElementById('iaTetoInput').value === '200' && /AIza/.test(document.getElementById('iaKeyInput').placeholder)));
    await page.click('#iaListarBtn');
    await page.waitForFunction(() => document.querySelectorAll('#iaModelosLista option').length === 2, { timeout: 3000 });
    check('listar modelos preenche a lista dos campos', true);
    check('a aba traz os campos do e-mail de vhost com o padrão (suporte da M3)', await page.evaluate(() => document.getElementById('vhostParaInput').value === 'suporte@m3solutions.com.br' && document.getElementById('vhostCcInput').value === 'everton.lima@buscacliente.com.br'), await page.evaluate(() => document.getElementById('vhostParaInput').value));
    await page.fill('#vhostParaInput', 'infra@m3.test');
    await page.fill('#iaKeyInput', 'AIza-teste');
    await page.fill('#iaModeloAgInput', 'gemini-3.8-flash');
    await page.selectOption('#iaNivelSelect', 'LOW');
    await page.click('#saveSettingsBtn');
    await page.waitForTimeout(300);
    const cfg = await ultima('iaSetConfig');
    check('salvar manda a chave e a configuração', cfg && cfg.apiKey === 'AIza-teste' && cfg.config.nivelPensamento === 'LOW' && cfg.config.modeloOrquestrador === 'gemini-3.1-pro-preview' && cfg.config.tetoChamadasDia === 200, JSON.stringify(cfg));
    check('a chave some do campo depois de salvar', await page.evaluate(() => document.getElementById('iaKeyInput').value === ''));
    const hub = (await chamadas('setHubState')).map((c) => c.args[0].mailVhost).filter(Boolean);
    check('o e-mail de vhost editado foi para o hub-state (mailVhost)', hub.length >= 1 && hub[hub.length - 1].to === 'infra@m3.test' && await page.evaluate(() => state.mailVhost && state.mailVhost.to === 'infra@m3.test'), JSON.stringify(hub));
    await page.evaluate(() => window.hubEscritorio.abrir());
    await page.waitForFunction(() => document.querySelector('#escCena') && document.querySelectorAll('#escOverlay .esc-agente').length === 5, { timeout: 5000 });
    check('voltar ao Escritório remonta a tela cheia com o mesmo canvas (um só, sem contexto novo)', await page.evaluate(() => document.querySelector('.app').classList.contains('esc-cheia') && document.querySelectorAll('#escPalco canvas').length === 1 && document.querySelectorAll('#escOverlay .esc-sala-rotulo').length === 10));
    check('sem erro de página no fim', erros.length === 0, erros.join(' | '));
  } catch (e) {
    falhas++;
    console.log(`  FALHOU  exceção: ${e.message}`);
  } finally {
    await browser.close();
  }
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo ok.');
  process.exit(falhas ? 1 : 0);
})();
