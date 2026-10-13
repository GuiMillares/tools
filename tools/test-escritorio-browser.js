// ADR-149: a tela do Escritório no renderer inteiro (index.html: app.js +
// terminais.js + automacao-ui.js + escritorio-ui.js) num Chromium, com
// window.api falso. Prova que o Hub abre no Escritório, que a tela desenha o
// snapshot (agentes, pendências, fila, regras), que cada botão chama o canal
// certo com o payload certo, que o formulário de regra lê o que está nos
// campos, que o histórico abre, que a lista de espera vai para o processo
// principal e que a aba "IA & Escritório" das Configurações salva.
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
  try {
    await page.addInitScript(STUB);
    await page.goto('file://' + path.join(ROOT, 'renderer', 'index.html').replace(/\\/g, '/'));
    await page.waitForFunction(() => window.hubEscritorio && document.querySelector('.esc-agentes'), { timeout: 8000 });

    check('index.html inteiro carrega sem erro de página', erros.length === 0, erros.join(' | '));
    check('o Hub abre no Escritório, acima do Início na barra lateral', await page.evaluate(() => state.view === 'escritorio' && document.querySelector('#navList .nav-item').textContent.trim() === 'Escritório' && document.querySelector('#navList .nav-item.active').textContent.trim() === 'Escritório'));
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
    check('a pendência "para você" mostra a leitura do comentário, a categoria e o botão de tratada', await page.evaluate(() => { const p = document.querySelector('[data-pend="P-4"]'); return p && p.classList.contains('tipo-humano') && /para você/.test(p.querySelector('.sec-title').textContent) && /republicar-site-subdiretorio/.test(p.querySelector('.sec-meta').textContent) && /Republicar o site em subdiretório que sumiu por conflito/.test(p.querySelector('.esc-leitura').textContent) && !!p.querySelector('[data-acao="tratada"]') && !!p.querySelector('[data-acao="avisar-sempre"]'); }));
    await page.click('[data-pend="P-4"] [data-acao="avisar-sempre"]');
    check('"Avisar sempre" manda a resposta certa', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-4","resposta":{"acao":"avisar-sempre"}}');
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
    check('o cartão do agente com módulo rodando pela mão mostra trabalhando e o módulo', await page.evaluate(() => { const c = document.querySelector('.esc-agente[data-agente="relator"]'); return c.classList.contains('est-trabalhando') && /Planilha do Relatório/.test(c.querySelector('.esc-agente-atividade').textContent); }));
    check('o interruptor do modelo começa desligado e diz que não custa', await page.evaluate(() => !document.getElementById('escModelo').checked && /sem custo/.test(document.querySelector('label:has(#escModelo)').textContent)));
    await page.click('label:has(#escModelo)');
    check('ligar o modelo chama iaUsarModelo({ ligar: true })', JSON.stringify(await ultima('iaUsarModelo')) === '{"ligar":true}');
    await page.evaluate(() => window.hubEscritorioAtividade('auditor', true, 'Quando publicou'));
    check('hubEscritorioAtividade manda a atividade do módulo ao processo principal', JSON.stringify(await ultima('escritorioAtividade')) === '{"agente":"auditor","ligado":true,"detalhe":"Quando publicou"}');
    await page.click('[data-pend="P-3"] [data-acao="retomar"]');
    check('"Retomar" na interrompida', JSON.stringify(await ultima('escritorioResponder')) === '{"id":"P-3","resposta":{"acao":"retomar"}}');

    // Proposta de regra: o formulário mostra a proposta; editar e aprovar
    // manda a regra lida dos campos.
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
    await page.click('.esc-tab[data-aba="fila"]');
    check('a fila lista as tarefas abertas (5), não a ignorada, com a leitura do comentário', await page.evaluate(() => document.querySelectorAll('.esc-tabela tbody tr').length === 5 && !document.querySelector('[data-tarefa="00T5"]') && /Republicar o site/.test(document.querySelector('[data-tarefa="00T6"] .esc-leitura').textContent)));
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

    // Regras.
    await page.click('.esc-tab[data-aba="regras"]');
    check('a aba de regras lista a regra com usos e origem', await page.evaluate(() => /Cobrança/.test(document.querySelector('[data-regra="R-1"]').textContent) && /pendência P-9/.test(document.querySelector('[data-regra="R-1"]').textContent)));
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
