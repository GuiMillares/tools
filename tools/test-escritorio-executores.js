// ADR-150: os executores dos agentes com ferramentas falsas (os canais do
// IPC registrados como funções). Tyr bloqueia pelo /doutor ou pelo painel e
// fecha a tarefa; Freyr resolve a empresa (temporário > caso > fila), cria
// as propriedades, commita o geral.php, manda o e-mail de vhost e move a
// tarefa; Thor vai pela ponte. Cada um devolve o contrato do orquestrador.
// Sem rede e sem Electron.
//
//     node tools/test-escritorio-executores.js

const path = require('path');
const { criarExecutores } = require(path.join(__dirname, '..', 'lib', 'escritorio', 'executores'));
const Catalogo = require(path.join(__dirname, '..', 'lib', 'escritorio', 'catalogo'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

function montar(over = {}) {
  const chamadas = [];
  const logs = [];
  const respostas = {
    'dns:marca': (p) => (p.dominio === 'mpi.com.br' ? { ok: true, marca: 'mpiplus', ips: ['149.18.102.60'] } : p.dominio === 'x.com.br' ? { ok: false, ips: ['1.2.3.4'] } : { ok: true, marca: 'bc', ips: ['149.18.103.98'] }),
    'doutor:bloquear': () => ({ ok: true, empresa: 'CLIENTE A', log: [{ message: 'doutor ok', type: 'info' }] }),
    'painel:bloquear': () => ({ ok: true, empresa: 'CLIENTE MPI', jaEstava: true }),
    'salesforce:fecharTarefa': () => ({ ok: true }),
    'salesforce:contexto': () => ({ ok: true, razao: 'CLIENTE X LTDA', empresa: 'mpisolutions', via: 'projeto do caso (MPI Solutions)', log: [] }),
    'google:createProject': (p) => ({ ok: true, log: [{ message: 'fake google ' + p.brand, type: 'info' }], result: { domain: p.domain, reaproveitados: [], faltando: [], idAnalytics: 'G-1', tagmanager: 'GTM-1', googleSearchConsole: 'sc', siteKey: 'sk', secretKey: 'sec' } }),
    'bitbucket:commitGeral': (p) => ({ ok: true, log: [], workspace: p.workspace, repo: p.repo, branch: 'main', applied: Object.keys(p.values) }),
    'mail:sendBatch': (p) => ({ ok: true, log: [], enviados: p.domains, falhas: [], total: 1 }),
    'salesforce:moverTarefa': () => ({ ok: true, log: [] }),
    'mail:sendBatch': (p) => ({ ok: true, log: [], enviados: p.domains, falhas: [], total: p.domains.length }),
    'pr:fetch': (p) => ({ ok: true, pr: { workspace: 'ws', repo: 'repo', id: '7', title: 'Ajuste', author: 'Ana', state: 'OPEN', sourceBranch: 'feat', destBranch: 'main', approvals: 1, buildState: 'SUCCESSFUL', url: p.url } }),
    'pr:merge': () => ({ ok: true, mergedHash: 'abcdef1234567890' }),
    ...(over.respostas || {}),
  };
  const ponteChamadas = [];
  const ex = criarExecutores({
    ferramentas: async (canal, payload) => { chamadas.push({ canal, payload }); const f = respostas[canal]; if (!f) throw new Error('canal desconhecido: ' + canal); return f(payload); },
    log: (m, t) => logs.push([String(m), t || 'info']),
    ponte: over.semPonte ? undefined : async (driver, payload) => { ponteChamadas.push({ driver, payload }); return over.ponte ? over.ponte(payload) : { ok: true, mensagem: 'publicação concluída' }; },
    parar: () => !!over.parar,
    config: {
      creds: () => (over.semCreds ? null : { email: 'eu@x.test', token: 'tok' }),
      hubState: () => ({ bitbucketWorkspaces: { bc: 'bcws', mpisolutions: 'mpiws' }, bitbucketWorkspace: 'padrao', ...(over.hubState || {}) }),
      saPath: () => (over.semSa ? '' : 'C:/sa.json'),
      msConectado: () => !over.semMs,
      emailVhost: () => over.emailVhost === undefined ? { to: 'infra@m3.test', cc: '' } : over.emailVhost,
    },
  });
  const nomes = () => chamadas.map((c) => c.canal);
  const arg = (canal) => (chamadas.find((c) => c.canal === canal) || { payload: {} }).payload;
  return { ex, chamadas, logs, ponteChamadas, nomes, arg };
}

(async () => {
  console.log('\n=== Catálogo: nomes nórdicos, papel e módulos ===');
  {
    const nomes = Object.fromEntries(Catalogo.AGENTES.map((a) => [a.id, a.nome]));
    check('Odin é o orquestrador', Catalogo.ORQUESTRADOR.nome === 'Odin' && Catalogo.ORQUESTRADOR.papel === 'Orquestrador');
    check('Thor, Freyr, Tyr, Huginn automáticos; Ratatoskr, Mímir, Heimdall, Bragi em standby', nomes['publicador-mpiplus'] === 'Thor' && nomes['publicador-buscaone'] === 'Freyr' && nomes.bloqueador === 'Tyr' && nomes.hospedagem === 'Huginn' && nomes.integrador === 'Ratatoskr' && nomes.auditor === 'Mímir' && nomes.conferente === 'Heimdall' && nomes.relator === 'Bragi', JSON.stringify(nomes));
    check('cada agente guarda o papel (o nome antigo) e os módulos por extenso', Catalogo.AGENTES.every((a) => a.papel && a.modulosNomes) && Catalogo.agentePorId('auditor').modulosNomes === 'Ouvidoria & Auditoria / Quando publicou');
    check('rotuloAgente: nome · papel · módulos', Catalogo.rotuloAgente(Catalogo.agentePorId('publicador-mpiplus')) === 'Thor · Publicador MPI+ · Publicar MPI+ / Publicação em Massa');
    check('o catálogo para o modelo leva papel e módulos', Catalogo.catalogoParaModelo().find((a) => a.id === 'relator').papel === 'Relator' && /Planilha do Relatório/.test(Catalogo.catalogoParaModelo().find((a) => a.id === 'relator').modulos));
    check('os ids não mudaram', Catalogo.AGENTES.map((a) => a.id).join() === 'publicador-mpiplus,publicador-buscaone,bloqueador,hospedagem,integrador,auditor,conferente,relator');
  }

  console.log('\n=== Tyr: bloqueio de contatos ===');
  {
    let m = montar();
    let r = await m.ex.executar({ agente: 'bloqueador', parametros: { dominio: 'https://www.a.com.br/', link: 'https://sf/Task/00T1/view' }, tarefa: { id: '00T1' } });
    check('Busca Cliente: marca pelo IP, /doutor com marca bc, tarefa fechada com "Contatos removidos"', r.ok && m.nomes().join() === 'dns:marca,doutor:bloquear,salesforce:fecharTarefa' && m.arg('doutor:bloquear').marca === 'bc' && m.arg('doutor:bloquear').dominio === 'a.com.br' && m.arg('salesforce:fecharTarefa').texto === 'Contatos removidos' && /tarefa fechada/.test(r.mensagem), JSON.stringify([r, m.nomes()]));
    check('o log do handler foi para o terminal', m.logs.some((l) => l[0] === 'doutor ok'));
    m = montar();
    r = await m.ex.executar({ agente: 'bloqueador', parametros: { dominio: 'mpi.com.br', link: 'https://sf/Task/00T2/view' }, tarefa: { id: '00T2' } });
    check('MPI+: vai pelo painel idealplus, não pelo /doutor; "já estava" vira ok', r.ok && m.nomes().join() === 'dns:marca,painel:bloquear,salesforce:fecharTarefa' && m.arg('painel:bloquear').acao === 'bloquear' && /painel MPI\+/.test(r.mensagem) && r.detalhe.jaEstava === true, JSON.stringify([r, m.nomes()]));
    m = montar();
    r = await m.ex.executar({ agente: 'bloqueador', parametros: { dominio: 'x.com.br' }, tarefa: { id: '00T3' } });
    check('IP desconhecido: desiste de primeira, sem tocar no /doutor nem na tarefa', !r.ok && r.desistir === true && /não descobri a marca/.test(r.motivo) && m.nomes().join() === 'dns:marca');
    m = montar({ respostas: { 'doutor:bloquear': () => ({ ok: false, error: 'incerto' }) } });
    r = await m.ex.executar({ agente: 'bloqueador', parametros: { dominio: 'a.com.br', link: 'https://sf/x' }, tarefa: { id: '00T4' } });
    check('/doutor não confirmou: erro comum (tenta de novo), tarefa não fechada', !r.ok && !r.desistir && /incerto/.test(r.motivo) && !m.nomes().includes('salesforce:fecharTarefa'));
    m = montar({ respostas: { 'salesforce:fecharTarefa': () => ({ ok: false, error: 'sem sessão' }) } });
    r = await m.ex.executar({ agente: 'bloqueador', parametros: { dominio: 'a.com.br', link: 'https://sf/x' }, tarefa: { id: '00T5' } });
    check('bloqueou mas não fechou a tarefa: ok com aviso na mensagem', r.ok && /a tarefa não fechou/.test(r.mensagem) && r.detalhe.tarefaFechada === false);
  }

  console.log('\n=== Freyr: publicação Busca One ===');
  {
    // Busca Cliente pelo temporário, com o caso dizendo MPI Solutions → o
    // temporário vence, com aviso (ADR-133); repositório do caminho.
    let m = montar();
    let r = await m.ex.executar({ agente: 'publicador-buscaone', parametros: { dominio: 'https://www.x.com.br/', repositorio: 'x.com', marca: 'bc', temporario: 'deploy.buscaclientes.com.br', idPainel: '12', link: 'https://sf/lightning/r/Task/00T1/view', empresaFila: 'mpisolutions' }, tarefa: { id: '00T1', assunto: 'Publicação (Troca de DNS) - x.com.br' } });
    check('BC: ok', r.ok === true, JSON.stringify(r));
    check('BC: ordem contexto → propriedades → commit → e-mail → mover (nada de comentário no Salesforce)', m.nomes().join() === 'salesforce:contexto,google:createProject,bitbucket:commitGeral,mail:sendBatch,salesforce:moverTarefa', m.nomes().join());
    const g = m.arg('google:createProject');
    check('BC: propriedades com o saPath da configuração, marca bc (o temporário vence o caso e a fila), domínio normalizado, 4 etapas', g.saPath === 'C:/sa.json' && g.brand === 'bc' && g.domain === 'x.com.br' && g.steps.join() === 'analytics,gtm,recaptcha,searchconsole', JSON.stringify(g));
    const c = m.arg('bitbucket:commitGeral');
    check('BC: commit no repositório do temporário, workspace da marca, credenciais do Bitbucket, $idProjetoBusca = 12', c.repo === 'x.com' && c.workspace === 'bcws' && c.creds.token === 'tok' && c.brand === 'bc' && c.values.idProjetoBusca === '12' && c.values.idAnalytics === 'G-1', JSON.stringify(c));
    const e = m.arg('mail:sendBatch');
    check('BC: e-mail para o destinatário configurado, modelo Busca Cliente, com o domínio real', e.to.join() === 'infra@m3.test' && e.cc.length === 0 && /Busca Cliente - \{dominio\}/.test(e.subjectTemplate) && e.domains.join() === 'x.com.br', JSON.stringify(e));
    const mv = m.arg('salesforce:moverTarefa');
    check('BC: tarefa movida para andamento', mv.id === '00T1' && mv.coluna === 'andamento');
    check('BC: avisou que o caso discorda do temporário e seguiu pelo temporário; o resumo com as chaves saiu no log', m.logs.some((l) => l[1] === 'warn' && /diz MPI Solutions, mas o temporário deploy\.buscaclientes\.com\.br é da Busca Cliente/.test(l[0])) && m.logs.some((l) => /Analytics \(GA4\): G-1/.test(l[0])) && m.logs.some((l) => /fake google bc/.test(l[0])));
    // Sem temporário: a empresa vem do caso (MPI Solutions), ID fixo 39.
    m = montar();
    r = await m.ex.executar({ agente: 'publicador-buscaone', parametros: { dominio: 'y.com.br', idPainel: '777', link: 'https://sf/lightning/r/Task/00T2/view' }, tarefa: { id: '00T2' } });
    check('MPI: empresa pelo caso, $idProjetoBusca = 39 fixo da marca (vence o 777 da tarefa), workspace mpiws, commit no domínio', r.ok && m.arg('bitbucket:commitGeral').repo === 'y.com.br' && m.arg('bitbucket:commitGeral').values.idProjetoBusca === '39' && m.arg('bitbucket:commitGeral').workspace === 'mpiws' && /- MPI - \{dominio\}/.test(m.arg('mail:sendBatch').subjectTemplate), JSON.stringify(r));
    // Sem caso nem temporário: a fila decide.
    m = montar({ respostas: { 'salesforce:contexto': () => ({ ok: true, razao: 'Z', empresa: '', log: [] }) } });
    r = await m.ex.executar({ agente: 'publicador-buscaone', parametros: { dominio: 'z.com.br', empresaFila: 'bc', link: 'https://sf/x' }, tarefa: { id: '00T3' } });
    check('sem temporário nem caso: a fila da tarefa decide', r.ok && m.arg('google:createProject').brand === 'bc' && m.logs.some((l) => /pelo fila da tarefa/.test(l[0])));
    // Nada diz a empresa: desiste de primeira sem efeito.
    m = montar({ respostas: { 'salesforce:contexto': () => ({ ok: true, razao: 'Z', empresa: '', log: [] }) } });
    r = await m.ex.executar({ agente: 'publicador-buscaone', parametros: { dominio: 'z.com.br', link: 'https://sf/x' }, tarefa: { id: '00T4' } });
    check('empresa desconhecida: desiste, nada criado', !r.ok && r.desistir && m.nomes().join() === 'salesforce:contexto');
    // Falta configuração: erro comum, nenhuma chamada.
    for (const [caso, over, re] of [['Microsoft', { semMs: true }, /Microsoft/], ['Bitbucket', { semCreds: true }, /Bitbucket/], ['service account', { semSa: true }, /service account/], ['destinatário', { emailVhost: { to: '', cc: '' } }, /destinatário/]]) {
      m = montar(over);
      r = await m.ex.executar({ agente: 'publicador-buscaone', parametros: { dominio: 'w.com.br', marca: 'bc' }, tarefa: { id: '00T5' } });
      check(`sem ${caso}: erro comum (tenta depois), nenhuma chamada feita`, !r.ok && !r.desistir && re.test(r.motivo) && m.chamadas.length === 0, JSON.stringify(r));
    }
    // Sem e-mail editado, o padrão da lib (suporte da M3).
    m = montar({ emailVhost: null });
    r = await m.ex.executar({ agente: 'publicador-buscaone', parametros: { dominio: 'w.com.br', marca: 'bc' }, tarefa: { id: '00T6' } });
    check('sem destinatário editado, usa o padrão da lib (suporte da M3 com cópia)', r.ok && m.arg('mail:sendBatch').to.join() === 'suporte@m3solutions.com.br' && m.arg('mail:sendBatch').cc.join() === 'everton.lima@buscacliente.com.br');
    // Salesforce pedindo reconexão: erro comum.
    m = montar({ respostas: { 'salesforce:contexto': () => ({ ok: false, reauth: true, error: 'x' }) } });
    r = await m.ex.executar({ agente: 'publicador-buscaone', parametros: { dominio: 'w.com.br', marca: 'bc', link: 'https://sf/x' }, tarefa: { id: '00T7' } });
    check('Salesforce pede reconexão: erro comum, nada criado', !r.ok && !r.desistir && /reconexão/.test(r.motivo) && m.nomes().join() === 'salesforce:contexto');
    // Freio puxado: pula sem efeito.
    m = montar({ parar: true });
    r = await m.ex.executar({ agente: 'publicador-buscaone', parametros: { dominio: 'w.com.br', marca: 'bc' }, tarefa: { id: '00T8' } });
    check('freio puxado: pula antes de qualquer chamada', !r.ok && r.pulou && m.chamadas.length === 0);
    // Host nosso como domínio: a trava da lib.
    m = montar();
    r = await m.ex.executar({ agente: 'publicador-buscaone', parametros: { dominio: 'deploy.buscaclientes.com.br', marca: 'bc' }, tarefa: { id: '00T9' } });
    check('host da infraestrutura como domínio: desiste (ADR-133)', !r.ok && r.desistir && /host nosso/.test(r.motivo));
  }

  console.log('\n=== Thor: pela ponte com o renderer ===');
  {
    let m = montar();
    let r = await m.ex.executar({ agente: 'publicador-mpiplus', parametros: { dominio: 'c.com.br', temporario: 'c.mpitemporario.com.br', link: 'https://sf/x', empresaFila: 'bc' }, tarefa: { id: '00T1' } });
    check('manda para o driver do renderer com domínio, temporário, link e empresa da fila', r.ok && m.ponteChamadas.length === 1 && m.ponteChamadas[0].driver === 'publicarMpiPlus' && JSON.stringify(m.ponteChamadas[0].payload) === '{"dominio":"c.com.br","temporario":"c.mpitemporario.com.br","link":"https://sf/x","empresa":"bc"}', JSON.stringify(m.ponteChamadas));
    m = montar({ ponte: () => ({ ok: false, aguardando: true, cliente: true, motivo: 'DNS do cliente' }) });
    r = await m.ex.executar({ agente: 'publicador-mpiplus', parametros: { dominio: 'c.com.br', temporario: 't' }, tarefa: {} });
    check('o desfecho do driver passa inteiro (aguardando o cliente)', !r.ok && r.aguardando && r.cliente === true);
    m = montar({ ponte: () => ({ ok: false, pulou: true, motivo: 'já há uma publicação em andamento no Hub' }) });
    r = await m.ex.executar({ agente: 'publicador-mpiplus', parametros: { dominio: 'c.com.br', temporario: 't' }, tarefa: {} });
    check('Hub ocupado: "pulou" (o orquestrador adia sem contar tentativa)', !r.ok && r.pulou === true);
    m = montar({ semPonte: true });
    r = await m.ex.executar({ agente: 'publicador-mpiplus', parametros: { dominio: 'c.com.br', temporario: 't' }, tarefa: {} });
    check('sem a janela: pula com motivo', !r.ok && r.pulou && /janela/.test(r.motivo));
  }

  console.log('\n=== Huginn: pedido de SSL e de suspensão ao suporte ===');
  {
    let m = montar();
    let r = await m.ex.executar({ agente: 'hospedagem', parametros: { acao: 'ssl', dominios: ['a.com.br', 'b.com.br'], empresaFila: 'mpisolutions' }, tarefa: { id: '00T1', historico: [] } });
    check('SSL: um e-mail por domínio, modelo do SSL com o projeto da fila, destinatário padrão', r.ok && m.nomes().join() === 'mail:sendBatch' && m.arg('mail:sendBatch').domains.join() === 'a.com.br,b.com.br' && m.arg('mail:sendBatch').subjectTemplate === 'Ativação SSL - MPI Solutions - {dominio}' && m.arg('mail:sendBatch').to.join() === 'suporte@m3solutions.com.br' && /enviado para a\.com\.br, b\.com\.br/.test(r.mensagem) && r.detalhe.enviados.join() === 'a.com.br,b.com.br', JSON.stringify([r, m.arg('mail:sendBatch')]));
    m = montar({ hubState: { mail: { to: 'outro@m3.test', cc: '', subject: 'Suspender {dominio}', body: 'corpo' } } });
    r = await m.ex.executar({ agente: 'hospedagem', parametros: { acao: 'suspensao', dominios: 'c.com.br' }, tarefa: { id: '00T2' } });
    check('suspensão: o modelo editado na tela (hub-state) vence o padrão', r.ok && m.arg('mail:sendBatch').subjectTemplate === 'Suspender {dominio}' && m.arg('mail:sendBatch').to.join() === 'outro@m3.test' && m.arg('mail:sendBatch').cc.length === 0, JSON.stringify(m.arg('mail:sendBatch')));
    m = montar();
    r = await m.ex.executar({ agente: 'hospedagem', parametros: { acao: 'ssl', dominios: ['a.com.br', 'b.com.br'] }, tarefa: { id: '00T3', historico: [{ tipo: 'execucao', detalhe: { enviados: ['a.com.br'] } }] } });
    check('o que esta tarefa já mandou não vai de novo', r.ok && m.arg('mail:sendBatch').domains.join() === 'b.com.br');
    r = await m.ex.executar({ agente: 'hospedagem', parametros: { acao: 'ssl', dominios: ['a.com.br'] }, tarefa: { id: '00T4', historico: [{ tipo: 'execucao', detalhe: { enviados: ['a.com.br'] } }] } });
    check('tudo já enviado: desiste com o motivo', !r.ok && r.desistir && /já enviado para a\.com\.br/.test(r.motivo));
    m = montar({ respostas: { 'mail:sendBatch': (p) => ({ ok: true, enviados: [p.domains[0]], falhas: [{ dominio: p.domains[1], erro: 'x' }], total: 2 }) } });
    r = await m.ex.executar({ agente: 'hospedagem', parametros: { acao: 'ssl', dominios: ['a.com.br', 'b.com.br'] }, tarefa: { id: '00T5' } });
    check('envio parcial: erro comum, com os enviados no detalhe (a próxima tentativa manda só o que faltou)', !r.ok && !r.desistir && /não foram b\.com\.br/.test(r.motivo) && r.detalhe.enviados.join() === 'a.com.br');
    m = montar({ semMs: true });
    r = await m.ex.executar({ agente: 'hospedagem', parametros: { acao: 'ssl', dominios: ['a.com.br'] }, tarefa: { id: '00T6' } });
    check('sem Microsoft: erro comum, nenhuma chamada', !r.ok && !r.desistir && /Microsoft/.test(r.motivo) && m.chamadas.length === 0);
    m = montar();
    r = await m.ex.executar({ agente: 'hospedagem', parametros: { acao: 'reiniciar', dominios: ['a.com.br'] }, tarefa: { id: '00T7' } });
    check('ação desconhecida: desiste', !r.ok && r.desistir && /desconhecida/.test(r.motivo));
    r = await m.ex.executar({ agente: 'hospedagem', parametros: { acao: 'ssl', dominios: ['deploy.buscaclientes.com.br'] }, tarefa: { id: '00T8' } });
    check('só host nosso: desiste, nada enviado', !r.ok && r.desistir && /sem domínio de cliente/.test(r.motivo));
  }

  console.log('\n=== Ratatoskr: merge do pull request ===');
  {
    let m = montar();
    let r = await m.ex.executar({ agente: 'integrador', parametros: { prUrl: 'https://bitbucket.org/ws/repo/pull-requests/7' }, tarefa: { id: '00T1' } });
    check('lê o PR e mergeia com merge_commit e fechando a branch, com as credenciais', r.ok && m.nomes().join() === 'pr:fetch,pr:merge' && m.arg('pr:merge').workspace === 'ws' && m.arg('pr:merge').id === '7' && m.arg('pr:merge').strategy === 'merge_commit' && m.arg('pr:merge').closeSourceBranch === true && m.arg('pr:merge').creds.token === 'tok' && /PR #7 de ws\/repo mergeado \(abcdef12/.test(r.mensagem), JSON.stringify([r, m.arg('pr:merge')]));
    m = montar({ hubState: { strategy: 'squash', closeSourceBranch: false } });
    r = await m.ex.executar({ agente: 'integrador', parametros: { prUrl: 'https://bitbucket.org/ws/repo/pull-requests/7' }, tarefa: {} });
    check('estratégia e fechar branch do hub-state', r.ok && m.arg('pr:merge').strategy === 'squash' && m.arg('pr:merge').closeSourceBranch === false);
    m = montar({ respostas: { 'pr:fetch': (p) => ({ ok: true, pr: { workspace: 'ws', repo: 'repo', id: '7', state: 'MERGED', url: p.url } }) } });
    r = await m.ex.executar({ agente: 'integrador', parametros: { prUrl: 'https://bitbucket.org/ws/repo/pull-requests/7' }, tarefa: {} });
    check('PR já mergeado: desiste sem tentar', !r.ok && r.desistir && /está MERGED/.test(r.motivo) && !m.nomes().includes('pr:merge'));
    m = montar({ respostas: { 'pr:merge': () => ({ ok: false, error: 'conflito' }) } });
    r = await m.ex.executar({ agente: 'integrador', parametros: { prUrl: 'https://bitbucket.org/ws/repo/pull-requests/7' }, tarefa: {} });
    check('merge recusado: erro comum com o motivo', !r.ok && !r.desistir && /conflito/.test(r.motivo));
    m = montar({ semCreds: true });
    r = await m.ex.executar({ agente: 'integrador', parametros: { prUrl: 'https://bitbucket.org/ws/repo/pull-requests/7' }, tarefa: {} });
    check('sem Bitbucket: erro comum, nenhuma chamada', !r.ok && !r.desistir && m.chamadas.length === 0);
    r = await montar().ex.executar({ agente: 'integrador', parametros: {}, tarefa: {} });
    check('sem link do PR: desiste', !r.ok && r.desistir && /sem link/.test(r.motivo));
  }

  console.log('\n=== Contrato geral ===');
  {
    const m = montar();
    const r = await m.ex.executar({ agente: 'relator', parametros: {}, tarefa: {} });
    check('agente sem executor nesta versão: desiste com motivo claro', !r.ok && r.desistir && /ainda não executa/.test(r.motivo));
    check('lista dos que executam', m.ex.agentesComExecutor.join() === 'bloqueador,publicador-buscaone,publicador-mpiplus,hospedagem,integrador');
    const m2 = montar({ respostas: { 'dns:marca': () => { throw new Error('estourou'); } } });
    const r2 = await m2.ex.executar({ agente: 'bloqueador', parametros: { dominio: 'a.com.br' }, tarefa: {} });
    check('exceção dentro do executor vira erro comum, não derruba o orquestrador', !r2.ok && !r2.desistir && /estourou/.test(r2.motivo));
  }

  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo ok.');
  process.exit(falhas ? 1 : 0);
})();
