// ADR-149 / ADR-159: a tela do Escritório no renderer inteiro (index.html:
// app.js + terminais.js + automacao-ui.js + resumo.js + escritorio-ui.js) num
// Chromium, com window.api falso. Prova que o Asgard abre no Início com o
// Escritório logo abaixo na barra lateral (sem Three.js, sem canvas, sem tela
// cheia), que a tela desenha o snapshot (agentes, resumo, pendências, fila,
// concluídas; sem regras aprendidas, ADR-161), que cada botão chama o canal
// certo com o payload certo (encaminhar, tentar de novo), que o histórico abre, que a
// lista de espera vai para o processo principal, que a notificação clicada
// abre as pendências e que a aba "IA & Escritório" das Configurações salva.
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
  resumo: { hoje: { pelosAgentes: 2, pelaMao: 1, falhas: 0, ignoradas: 1, execucoes: 2, pendenciasCriadas: 2, pendenciasAbertas: 4, tempoMedioMin: 25, porAgente: { 'publicador-mpiplus': 2 } }, semana: { pelosAgentes: 5, pelaMao: 2, falhas: 1, ignoradas: 3, execucoes: 6, pendenciasCriadas: 4, pendenciasAbertas: 4, tempoMedioMin: 31, porAgente: { 'publicador-mpiplus': 4, bloqueador: 1 } }, calculadoEm: '2026-10-13T12:00:00.000Z' },
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
    { id: 'P-2', tipo: 'humano', padrao: 'escalada:00T9', pergunta: 'Thor (Publicador MPI+) falhou 3 vezes em "Publicação (Troca de DNS) - z.com.br": Trocar os nameservers no Registro.br falhou. Resolva a causa e use "Tentar de novo", ou faça à mão e marque como tratada.', agente: 'publicador-mpiplus', contexto: { origem: 'execucao', assuntoExemplo: 'Publicação (Troca de DNS) - z.com.br' }, tarefas: [], criadaEm: '2026-10-13T10:00:00.000Z', status: 'aberta', proposta: null },
    { id: 'P-3', tipo: 'retomar', padrao: 'retomar:z', pergunta: 'O Hub fechou enquanto…', agente: 'bloqueador', contexto: {}, tarefas: [], criadaEm: '2026-10-13T09:00:00.000Z', status: 'aberta', proposta: null },
    { id: 'P-4', tipo: 'humano', padrao: 'humano:ajuste site mpi - {dominio}:republicar-site-subdiretorio', pergunta: 'Precisa de você: Republicar o site em subdiretório que sumiu. Nenhum agente publica subdiretório. Marque como tratada quando fizer.', agente: null, contexto: { assuntoExemplo: 'Ajuste Site MPI - adetech.com.br', categoria: 'republicar-site-subdiretorio', trechoChave: 'republicar o site novamente' }, tarefas: ['00T6'], criadaEm: '2026-10-13T08:00:00.000Z', status: 'aberta', proposta: null },
    { id: 'P-0', tipo: 'pergunta', padrao: 'velha', pergunta: 'fechada', agente: null, contexto: {}, tarefas: [], criadaEm: '2026-10-12T09:00:00.000Z', status: 'fechada', proposta: null },
  ],
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
  respostas.onEscritorioAbrir = (cb) => { window.__abrir = cb; return () => {}; };
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
  try {
    await page.addInitScript(STUB);
    await page.goto('file://' + path.join(ROOT, 'renderer', 'index.html').replace(/\\/g, '/'));
    await page.waitForFunction(() => window.hubEscritorio && window.hubEscritorio.ui.snap && document.querySelector('#navList .nav-item'), { timeout: 8000 });

    check('index.html inteiro carrega sem erro de página', erros.length === 0, erros.join(' | '));
    check('o Asgard abre no Início, com o Escritório logo abaixo na barra lateral (ADR-159)', await page.evaluate(() => { const itens = [...document.querySelectorAll('#navList .nav-item')].map((b) => b.textContent.trim()); return state.view === 'home' && itens[0] === 'Início' && itens[1] === 'Escritório' && document.querySelector('#navList .nav-item.active').textContent.trim() === 'Início'; }), await page.evaluate(() => state.view + ' / ' + [...document.querySelectorAll('#navList .nav-item')].slice(0, 2).map((b) => b.textContent.trim()).join(', ')));
    check('sem Three.js, sem cena, sem mapa e sem tela cheia: a página só carrega o resumo e a tela (ADR-159)', await page.evaluate(() => typeof window.THREE === 'undefined' && !window.hubEscritorioCena && !window.Planta && !!window.EscritorioResumo && [...document.scripts].every((s) => !/three|escritorio-cena|escritorio-mapa|planta/.test(s.src)) && !document.querySelector('.app').classList.contains('esc-cheia')));
    await page.click('#navList .nav-item[data-mod="escritorio"]');
    await page.waitForFunction(() => state.view === 'escritorio' && document.querySelector('.esc-agentes'), { timeout: 8000 });
    check('o Escritório abre no painel da esquerda, com o menu e o topo no lugar e sem canvas', await page.evaluate(() => document.querySelector('#navList .nav-item.active').textContent.trim() === 'Escritório' && document.querySelector('.app-nav').getBoundingClientRect().left === 0 && document.querySelector('.topbar').getBoundingClientRect().top === 0 && !document.querySelector('#leftPanel canvas') && !document.querySelector('.esc-borda')));
    check('o resumo "Hoje e últimos 7 dias" (ADR-155) está na tela, por agente com o nome, e a frase do dia no título', await page.evaluate(() => { const linhas = [...document.querySelectorAll('#escResumo ~ .table-wrap tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()).join(' ')); return !!document.getElementById('escResumo') && /Hoje 2 1 0 1 2 25 min/.test(linhas[0] || '') && /7 dias 5 2 1 3 4 31 min/.test(linhas[1] || '') && /Thor 4 · Tyr 1/.test(document.getElementById('leftPanel').textContent) && /hoje: 2 pelos agentes · 1 à mão · 4 pendência\(s\)/.test(document.querySelector('.home-hi__sub').textContent); }), await page.evaluate(() => [...document.querySelectorAll('#escResumo ~ .table-wrap tbody tr')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()).join(' | ') + ' // ' + document.querySelector('.home-hi__sub').textContent));
    check('o chip no topo mostra o modo e as pendências', await page.evaluate(() => /ESCRITÓRIO · manual · 4 pend\./.test(document.getElementById('tbEscritorio').textContent.replace(/\s+/g, ' '))), await page.evaluate(() => document.getElementById('tbEscritorio').textContent));
    check('a lista de espera do app foi mandada para o processo principal', (await chamadas('escritorioEsperas')).length >= 1);
    check('cartões dos 4 agentes, com sala, nome nórdico, papel, módulos, estado e o interruptor só nos automáticos', await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.esc-agente')];
      const bl = document.querySelector('.esc-agente[data-agente="bloqueador"]');
      const rel = document.querySelector('.esc-agente[data-agente="relator"]');
      return cards.length === 4 && /02 \/ PUBLICAÇÃO/.test(cards[0].textContent) && /Thor/.test(cards[0].querySelector('.esc-agente-nome').textContent) && /Publicador MPI\+/.test(cards[0].querySelector('.esc-agente-papel').textContent) && /Publicar MPI\+ \/ Publicação em Massa/.test(cards[0].querySelector('.esc-agente-modulos').textContent) && bl.classList.contains('est-desligado') && !bl.querySelector('[data-agente-toggle]').checked && rel.classList.contains('standby') && !rel.querySelector('[data-agente-toggle]') && /standby/.test(rel.textContent);
    }));
    check('o cabeçalho apresenta Odin como orquestrador', await page.evaluate(() => /Odin, o orquestrador/.test(document.querySelector('.home-hi__sub').textContent)));
    check('o seletor de agente mostra nome · papel · módulos', await page.evaluate(() => [...document.querySelectorAll('[data-pend="P-1"] [data-agente-sel] option')].some((o) => o.textContent === 'Thor · Publicador MPI+ · Publicar MPI+ / Publicação em Massa')));
    check('a tela avisou que nasceu (as chamadas penduradas da ponte falham) e registrou a ponte', (await chamadas('escritorioRendererPronto')).length === 1 && await page.evaluate(() => typeof window.__ponte === 'function'));
    const ponte = await page.evaluate(async () => {
      window.hubPublicarTarefaAuto = async (p) => ({ ok: true, mensagem: 'publicado ' + p.dominio });
      const r = await window.__ponte({ id: 'ponte-7', driver: 'publicarMpiPlus', payload: { dominio: 'a.com.br', temporario: 'a.mpitemporario.com.br' } });
      const r2 = await window.__ponte({ id: 'ponte-8', driver: 'outro', payload: {} });
      return { r, r2, devolvidos: window.__calls.filter((c) => c.name === 'escritorioResultado').map((c) => c.args[0]) };
    });
    check('a ponte roda o driver do Publicar MPI+ e devolve o desfecho ao processo principal', ponte.r.ok && ponte.devolvidos.length === 2 && ponte.devolvidos[0].id === 'ponte-7' && ponte.devolvidos[0].resultado.mensagem === 'publicado a.com.br', JSON.stringify(ponte));
    check('driver desconhecido na ponte desiste com motivo, sem exceção', !ponte.r2.ok && ponte.r2.desistir && /driver desconhecido/.test(ponte.r2.motivo));
    check('a linha "Aguardando DNS" aparece quando a lista de espera tem alguém', await page.evaluate(() => { esperas = [{ dominio: 'w.com.br', status: 'esperando', cliente: true }]; window.hubEscritorio.desenhar(); const el = document.getElementById('escEsperas'); const ok = !!el && /o cliente apontar/.test(el.textContent) && /w\.com\.br/.test(el.textContent); esperas = []; window.hubEscritorio.desenhar(); return ok && !document.getElementById('escEsperas'); }));
    await page.click('#escFreio');
    check('o Freio desliga o modo automático', JSON.stringify(await ultima('escritorioLigar')) === '{"geral":false}');
    check('o comando mostra os contadores e a última varredura', await page.evaluate(() => /3/.test(document.querySelector('.esc-stat b').textContent) && /última varredura/.test(document.querySelector('.esc-comando .sec-meta').textContent)));
    check('as pendências abertas aparecem (4), a fechada não', await page.evaluate(() => document.querySelectorAll('.esc-pend').length === 4 && !document.querySelector('[data-pend="P-0"]')));
    check('a pendência "para você" mostra a leitura do comentário, a categoria e o botão de tratada', await page.evaluate(() => { const p = document.querySelector('[data-pend="P-4"]'); return p && p.classList.contains('tipo-humano') && /para você/.test(p.querySelector('.sec-title').textContent) && /republicar-site-subdiretorio/.test(p.querySelector('.sec-meta').textContent) && /Republicar o site em subdiretório que sumiu por conflito/.test(p.querySelector('.esc-leitura').textContent) && !!p.querySelector('[data-acao="tratada"]') && !!p.querySelector('[data-acao="tentar-de-novo"]') && !!p.querySelector('[data-acao="encaminhar"]') && !p.querySelector('[data-texto]'); }));
    await page.click('[data-pend="P-4"] [data-acao="tentar-de-novo"]');
    check('"Tentar de novo" manda a resposta certa', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-4","resposta":{"acao":"tentar-de-novo"}}');
    check('a pendência de falha do agente (P-2) aparece como "para você", com Tentar de novo e Encaminhar, sem formulário de regra', await page.evaluate(() => { const p = document.querySelector('[data-pend="P-2"]'); return p && p.classList.contains('tipo-humano') && /para você/.test(p.querySelector('.sec-title').textContent) && /falhou 3 vezes/.test(p.textContent) && !!p.querySelector('[data-acao="tentar-de-novo"]') && !!p.querySelector('[data-agente-sel]') && !p.querySelector('[data-form]'); }));
    check('a pergunta (P-1) tem Encaminhar, Marcar como tratada, Ignorar estas e Descartar, mais a dica do aprendizado pela ADR; nada de "sempre"', await page.evaluate(() => { const p = document.querySelector('[data-pend="P-1"]'); const acoes = [...p.querySelectorAll('[data-acao]')].map((b) => b.dataset.acao); return acoes.join() === 'encaminhar,tratada,ignorar-estas,descartar' && /ADR-161/.test(p.querySelector('.esc-aprender').textContent) && !p.querySelector('[data-texto]'); }), await page.evaluate(() => [...document.querySelectorAll('[data-pend="P-1"] [data-acao]')].map((b) => b.dataset.acao).join()));
    check('não há aba de regras: Pendências, Fila e Concluídas', await page.evaluate(() => [...document.querySelectorAll('.esc-tab')].map((b) => b.dataset.aba).join() === 'tudo,fila,historico'));
    await page.click('[data-pend="P-4"] [data-acao="tratada"]');
    check('"Marcar como tratada" na pendência para você', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-4","resposta":{"acao":"tratada"}}');
    check('a pendência agrupa as duas tarefas', await page.evaluate(() => document.querySelectorAll('[data-pend="P-1"] .esc-chip').length === 2));

    // Interruptores.
    await page.click('label:has(#escGeral)');
    check('ligar o modo automático chama escritorioLigar({ geral: true })', JSON.stringify(await ultima('escritorioLigar')) === '{"geral":true}');
    await page.click('label:has(#escObs)');
    check('desligar a observação chama escritorioLigar({ observacao: false })', JSON.stringify(await ultima('escritorioLigar')) === '{"observacao":false}');
    await page.click('.esc-agente[data-agente="bloqueador"] .esc-mini-switch');
    check('o interruptor do agente chama escritorioLigar({ agente, valor })', JSON.stringify(await ultima('escritorioLigar')) === '{"agente":"bloqueador","valor":true}');
    await page.click('#escRodar');
    check('"Rodar agora" chama escritorioRodar', (await chamadas('escritorioRodar')).length === 1);

    // Respostas da pendência.
    await page.click('[data-pend="P-1"] [data-acao="ignorar-estas"]');
    check('"Ignorar estas" manda a resposta certa', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-1","resposta":{"acao":"ignorar-estas"}}');
    check('o seletor oferece o Huginn com os dois presets, não o Huginn seco', await page.evaluate(() => { const vals = [...document.querySelectorAll('[data-pend="P-1"] [data-agente-sel] option')].map((o) => o.value); return vals.includes('hospedagem|ssl') && vals.includes('hospedagem|suspensao') && !vals.includes('hospedagem'); }));
    await page.selectOption('[data-pend="P-1"] [data-agente-sel]', 'hospedagem|ssl');
    await page.click('[data-pend="P-1"] [data-acao="encaminhar"]');
    check('"Encaminhar" chama escritorioEncaminhar com o agente e os parâmetros do preset', JSON.stringify(await ultima('escritorioEncaminhar')) === '{"id":"P-1","agente":"hospedagem","parametros":{"acao":"ssl"}}', JSON.stringify(await ultima('escritorioEncaminhar')));
    await page.selectOption('[data-pend="P-1"] [data-agente-sel]', 'hospedagem|suspensao');
    await page.click('[data-pend="P-1"] [data-acao="encaminhar"]');
    check('com o outro preset, leva acao=suspensao', JSON.stringify(await ultima('escritorioEncaminhar')) === '{"id":"P-1","agente":"hospedagem","parametros":{"acao":"suspensao"}}');
    check('o cartão do agente com módulo rodando pela mão mostra trabalhando e o módulo', await page.evaluate(() => { const c = document.querySelector('.esc-agente[data-agente="relator"]'); return c.classList.contains('est-trabalhando') && /Planilha do Relatório/.test(c.querySelector('.esc-agente-atividade').textContent); }));
    check('o interruptor do modelo começa desligado e diz que não custa', await page.evaluate(() => !document.getElementById('escModelo').checked && /sem custo/.test(document.querySelector('label:has(#escModelo)').textContent)));
    await page.click('label:has(#escModelo)');
    check('ligar o modelo chama iaUsarModelo({ ligar: true })', JSON.stringify(await ultima('iaUsarModelo')) === '{"ligar":true}');
    await page.evaluate(() => window.hubEscritorioAtividade('auditor', true, 'Quando publicou'));
    check('hubEscritorioAtividade manda a atividade do módulo ao processo principal', JSON.stringify(await ultima('escritorioAtividade')) === '{"agente":"auditor","ligado":true,"detalhe":"Quando publicou"}');
    await page.click('[data-pend="P-3"] [data-acao="retomar"]');
    check('"Retomar" na interrompida', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-3","resposta":{"acao":"retomar"}}');

    // Fila de tarefas e histórico.
    await page.click('.esc-tab[data-aba="fila"]');
    check('a fila lista as tarefas abertas (5), não a ignorada, com a leitura do comentário', await page.evaluate(() => document.querySelectorAll('#escCorpo .esc-tabela tbody tr').length === 5 && !document.querySelector('[data-tarefa="00T5"]') && /Republicar o site/.test(document.querySelector('[data-tarefa="00T6"] .esc-leitura').textContent)));
    check('tarefa aguardando confirmação tem o botão Executar', await page.evaluate(() => !!document.querySelector('[data-tarefa="00T4"] [data-confirmar]')));
    await page.click('[data-tarefa="00T4"] [data-confirmar]');
    check('Executar chama escritorioConfirmar', JSON.stringify(await ultima('escritorioConfirmar')) === '{"id":"00T4"}');
    await page.click('[data-tarefa="00T2"] [data-reanalisar]');
    check('reanalisar chama escritorioReanalisar', JSON.stringify(await ultima('escritorioReanalisar')) === '{"id":"00T2"}');
    await page.click('[data-tarefa="00T1"] [data-hist]');
    await page.waitForSelector('.esc-hist', { timeout: 3000 });
    check('o histórico abre com as linhas e a validação', await page.evaluate(() => document.querySelectorAll('.esc-hist-linha').length === 3 && /Domínio válido/.test(document.querySelector('.esc-hist-plano').textContent)));
    await page.click('#escHistFechar');
    check('o histórico fecha', await page.evaluate(() => !document.querySelector('.esc-hist')));
    await page.click('.esc-tab[data-aba="historico"]');
    check('a aba de concluídas e ignoradas lista a ignorada', await page.evaluate(() => !!document.querySelector('[data-tarefa="00T5"]')));

    // O log do processo principal chega ao terminal sem gravar de novo.
    await page.evaluate(() => { window.__gravadas = 0; const g = window.api.gravarLog; });
    const antes = (await chamadas('gravarLog')).length;
    await page.evaluate(() => log('linha do escritório', 'info', { arquivo: false }));
    await page.waitForTimeout(700);
    check('log(..., { arquivo: false }) mostra no terminal e não grava', (await chamadas('gravarLog')).length === antes && await page.evaluate(() => /linha do escritório/.test(document.getElementById('terminal').textContent)));

    // Configurações: aba IA & Escritório.
    await page.evaluate(() => openSettings('ia'));
    await page.waitForFunction(() => document.querySelector('[data-cfg-pane="ia"].active'), { timeout: 3000 });
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
    // A notificação do Windows clicada (ADR-155): sai das Configurações e abre as pendências.
    await page.evaluate(() => window.__abrir({ gaveta: 'pendencias' }));
    await page.waitForFunction(() => state.view === 'escritorio' && document.querySelector('.esc-pend'), { timeout: 3000 }).catch(() => {});
    check('a notificação clicada abre o Escritório na aba de pendências', await page.evaluate(() => state.view === 'escritorio' && window.hubEscritorio.ui.aba === 'tudo' && document.querySelectorAll('.esc-pend').length === 4 && document.querySelector('.esc-tab.active').dataset.aba === 'tudo'));
    check('o Comando conta as tarefas aguardando externo no lugar das regras', await page.evaluate(() => [...document.querySelectorAll('.esc-stat small')].some((s) => /aguardando externo/.test(s.textContent)) && ![...document.querySelectorAll('.esc-stat small')].some((s) => /regra/.test(s.textContent))));
    check('o e-mail de vhost editado foi para o hub-state (mailVhost)', hub.length >= 1 && hub[hub.length - 1].to === 'infra@m3.test' && await page.evaluate(() => state.mailVhost && state.mailVhost.to === 'infra@m3.test'), JSON.stringify(hub));
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
