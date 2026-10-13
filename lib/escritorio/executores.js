// Os executores dos agentes (ADR-150, fase 2): o que cada agente FAZ quando
// o orquestrador manda, reaproveitando as rotinas que o Hub já tem como
// ferramentas (os handlers do IPC, por `invocarLocal`). Nada aqui decide se
// pode: a validação de execução (catálogo) já passou quando isto roda.
//
//   Tyr   (bloqueador)          lib/automacao.js → processarBloqueio, com as
//                               ferramentas dns:marca, doutor:bloquear,
//                               painel:bloquear e salesforce:fecharTarefa.
//   Freyr (publicador-buscaone) lib/busca-one.js → publicarBuscaOne, com
//                               google:createProject, bitbucket:commitGeral,
//                               mail:sendBatch e salesforce:moverTarefa; a
//                               empresa e a razão social vêm de
//                               salesforce:contexto (ADR-123/133). Roda inteiro
//                               no processo principal: sobrevive ao Ctrl+R.
//   Thor  (publicador-mpiplus)  a máquina de etapas do Publicar MPI+ mora no
//                               renderer (ADR-122): vai pela ponte
//                               (deps.ponte) até window.hubPublicarTarefaAuto.
//
// Puro e injetável: recebe `ferramentas(canal, payload)`, os leitores de
// configuração e a ponte. Cada executor devolve o contrato do orquestrador:
// { ok, mensagem } | { ok:false, motivo, aguardando? | pulou? | desistir? }.
const Automacao = require('../automacao');
const BuscaOne = require('../busca-one');
const Triagem = require('../triagem');
const Hospedagem = require('../hospedagem');

function nomeEmpresa(e) { return BuscaOne.nomeEmpresa(e); }

// criarExecutores({ ferramentas, log, ponte, parar, config })
//   ferramentas(canal, payload) → Promise (o invocarLocal do main)
//   log(mensagem, tipo)
//   ponte(driver, payload) → Promise (executa no renderer; Thor)
//   parar() → bool (o freio do Hub, ADR-102)
//   config: { creds() → { email, token } | null, hubState() → {}, saPath() → '',
//             msConectado() → bool, emailVhost() → { to, cc } }
function criarExecutores(deps = {}) {
  const ferramentas = deps.ferramentas;
  if (typeof ferramentas !== 'function') throw new Error('criarExecutores: sem ferramentas');
  const log = typeof deps.log === 'function' ? deps.log : () => {};
  const parar = typeof deps.parar === 'function' ? deps.parar : () => false;
  const cfg = deps.config || {};
  const ler = (nome, padrao) => { try { const v = typeof cfg[nome] === 'function' ? cfg[nome]() : undefined; return v == null ? padrao : v; } catch (e) { return padrao; } };

  // As respostas dos handlers trazem o log de cada chamada: vai para o
  // terminal, como nas ferramentas manuais.
  const encaminha = (r) => { if (r && Array.isArray(r.log)) for (const l of r.log) log(l.message, l.type); return r; };
  const chamar = async (canal, payload) => encaminha(await ferramentas(canal, payload));

  // ---------- Tyr: bloqueio de contatos ----------
  async function bloqueador({ parametros = {}, tarefa = {} } = {}) {
    const dominio = Triagem.limparDominio(parametros.dominio);
    const t = { id: tarefa.id, link: parametros.link || tarefa.link || '', assunto: tarefa.assunto || '' };
    const tri = { dominio, cnpj: parametros.cnpj, painelUrl: parametros.painelUrl };
    const r = await Automacao.processarBloqueio(t, tri, {
      log,
      resolverMarca: (p) => chamar('dns:marca', p),
      bloquear: (p) => chamar('doutor:bloquear', p),
      bloquearPainel: (p) => chamar('painel:bloquear', p),
      fecharTarefa: (p) => chamar('salesforce:fecharTarefa', p),
    });
    if (!r) return { ok: false, motivo: 'o bloqueio não devolveu nada' };
    if (r.ok) return { ok: true, mensagem: `contatos ${r.jaEstava ? 'já estavam' : ''} censurados${r.via === 'painel' ? ' no painel MPI+' : ' no /doutor'}${r.empresa ? ' (' + r.empresa + ')' : ''}${r.tarefaFechada ? '; tarefa fechada' : '; a tarefa não fechou (ver terminal)'}`, detalhe: { marca: r.marca, empresa: r.empresa, jaEstava: !!r.jaEstava, tarefaFechada: !!r.tarefaFechada } };
    // "pulou" do motor antigo é "não dá para fazer sozinho" (marca não
    // resolvida, painel sem driver): deixa para a mão de primeira.
    if (r.pulou) return { ok: false, desistir: true, motivo: r.motivo || 'não deu para bloquear sozinho' };
    return { ok: false, motivo: r.motivo || (r.detalhe && r.detalhe.error) || 'o bloqueio falhou' };
  }

  // ---------- Freyr: publicação Busca One (a parte automática) ----------
  async function publicadorBuscaOne({ parametros = {}, tarefa = {} } = {}) {
    const dominio = Triagem.limparDominio(parametros.dominio);
    if (!dominio) return { ok: false, desistir: true, motivo: 'sem domínio final na tarefa' };
    // O que pode faltar é conferido ANTES de qualquer efeito (as regras de
    // execução já olharam as credenciais; aqui é a última barreira).
    const saPath = ler('saPath', '');
    const creds = ler('creds', null);
    if (!saPath) return { ok: false, motivo: 'service account do Google não configurada (Configurações); as propriedades precisam dela' };
    if (!creds || !creds.email || !creds.token) return { ok: false, motivo: 'Bitbucket não configurado (e-mail e API token, Configurações); o geral.php é commitado lá' };
    if (!ler('msConectado', false)) return { ok: false, motivo: 'conta Microsoft não conectada (Configurações); o e-mail de vhost sai pela sua caixa' };
    const email = ler('emailVhost', null) || BuscaOne.EMAIL_VHOST_PADRAO;
    if (!BuscaOne.listaEmails(email.to).length) return { ok: false, motivo: 'destinatário do e-mail de vhost em branco (Configurações › Escritório & IA)' };
    const hub = ler('hubState', {}) || {};
    const workspaceDe = (marca) => (hub.bitbucketWorkspaces && hub.bitbucketWorkspaces[marca]) || hub.bitbucketWorkspace || '';

    // A empresa é a do TEMPORÁRIO (ADR-133); sem temporário, o caso da tarefa
    // (ADR-123) e depois a fila. A razão social vem do caso de qualquer jeito.
    const link = parametros.link || tarefa.link || '';
    let empresa = null, razao = '', via = '', doCaso = null, viaCaso = '';
    if (link) {
      const ctx = await chamar('salesforce:contexto', { tarefa: link }).catch((e) => ({ ok: false, error: e.message }));
      if (ctx && ctx.ok) {
        razao = ctx.razao || '';
        if (ctx.empresa) { doCaso = ctx.empresa; viaCaso = ctx.via || 'caso da tarefa'; }
      } else if (ctx && ctx.reauth) {
        return { ok: false, motivo: 'Salesforce pede reconexão (Configurações); tento de novo depois' };
      }
    }
    const marcaTemp = parametros.marca === 'bc' || parametros.marca === 'mpisolutions' ? parametros.marca : null;
    if (marcaTemp) { empresa = marcaTemp; via = 'temporário ' + (parametros.temporario || ''); }
    if (!empresa && doCaso) { empresa = doCaso; via = viaCaso; }
    if (!empresa && (parametros.empresaFila === 'bc' || parametros.empresaFila === 'mpisolutions')) { empresa = parametros.empresaFila; via = 'fila da tarefa'; }
    if (empresa) {
      log(`${dominio}: empresa ${nomeEmpresa(empresa)} (pelo ${via})${razao ? '; razão social ' + razao : ''}${parametros.repositorio && parametros.repositorio !== dominio ? '; repositório ' + parametros.repositorio : ''}.`, 'info');
      const outra = doCaso && doCaso !== empresa ? `o ${viaCaso} diz ${nomeEmpresa(doCaso)}` : (parametros.empresaFila && parametros.empresaFila !== empresa ? `a fila da tarefa diz ${nomeEmpresa(parametros.empresaFila)}` : '');
      if (outra) log(`${dominio}: ${outra}, mas o ${via} é da ${nomeEmpresa(empresa)}; seguindo pelo ${via}.`, 'warn');
    }

    return BuscaOne.publicarBuscaOne({
      id: tarefa.id, assunto: tarefa.assunto, link, dominio, empresa, razao,
      temporario: parametros.temporario || '', repositorio: parametros.repositorio || '', idPainel: parametros.idPainel || '',
      empresaTemporario: marcaTemp,
    }, {
      log, email, parar,
      idPainelFixo: (emp) => BuscaOne.ID_PAINEL_FIXO[emp] || '',
      criarPropriedades: (q) => chamar('google:createProject', { domain: q.domain, saPath, brand: q.brand, steps: q.steps }),
      commitGeral: (q) => chamar('bitbucket:commitGeral', { repo: q.repo, brand: q.brand, workspace: workspaceDe(q.brand), values: q.values, creds }),
      enviarEmail: (q) => chamar('mail:sendBatch', q),
      moverTarefa: (q) => chamar('salesforce:moverTarefa', q),
    });
  }

  // ---------- Thor: publicação MPI+ (no renderer, pela ponte) ----------
  async function publicadorMpiPlus({ parametros = {}, tarefa = {} } = {}) {
    if (typeof deps.ponte !== 'function') return { ok: false, pulou: true, motivo: 'a janela do Hub não está disponível para a publicação MPI+' };
    const r = await deps.ponte('publicarMpiPlus', {
      dominio: parametros.dominio, temporario: parametros.temporario, link: parametros.link || tarefa.link || '',
      empresa: parametros.empresaFila || null,
    });
    return r || { ok: false, motivo: 'a publicação não devolveu nada' };
  }

  // ---------- Huginn: pedido de SSL ou de suspensão ao suporte (ADR-152) ----------
  // O mesmo e-mail da tela "Suspender sites / Ativar SSL", pela sua caixa,
  // um por domínio; o que esta tarefa já mandou não vai de novo. Nada é
  // escrito no Salesforce (a tarefa é sua para fechar quando o suporte fizer).
  async function hospedagem({ parametros = {}, tarefa = {} } = {}) {
    const acao = Hospedagem.acaoNormalizada(parametros.acao);
    if (!acao) return { ok: false, desistir: true, motivo: `ação "${parametros.acao || ''}" desconhecida (ssl ou suspensao)` };
    if (!ler('msConectado', false)) return { ok: false, motivo: 'conta Microsoft não conectada (Configurações); o e-mail sai pela sua caixa' };
    const pedido = Hospedagem.montarPedido({ acao, projeto: parametros.projeto || parametros.empresaFila || '', cfg: ler('hubState', {}) || {} });
    if (!pedido || !pedido.to.length) return { ok: false, motivo: 'destinatário do pedido em branco (tela Suspender sites / Ativar SSL)' };
    const jaForam = Hospedagem.jaEnviados(tarefa);
    const lista = Hospedagem.listaDominios(parametros.dominios).filter((d) => !jaForam.includes(d));
    if (!lista.length) return { ok: false, desistir: true, motivo: jaForam.length ? `já enviado para ${jaForam.join(', ')} por esta tarefa` : 'sem domínio de cliente no pedido' };
    log(`${lista.join(', ')}: enviando ${pedido.rotulo}${pedido.projeto ? ' (' + pedido.projeto + ')' : ''} para ${pedido.to.join(', ')}${pedido.cc.length ? ' (cc ' + pedido.cc.join(', ') + ')' : ''}…`, 'cmd');
    const r = await chamar('mail:sendBatch', { to: pedido.to, cc: pedido.cc, subjectTemplate: pedido.subjectTemplate, bodyTemplate: pedido.bodyTemplate, domains: lista });
    if (!r || !r.ok) return { ok: false, motivo: `${pedido.rotulo} não saiu (${(r && r.error) || 'sem resposta'})${r && r.reauth ? '; reconecte a conta Microsoft nas Configurações' : ''}` };
    const enviados = Array.isArray(r.enviados) ? r.enviados : [];
    const falhas = Array.isArray(r.falhas) ? r.falhas : [];
    if (falhas.length) return { ok: false, motivo: `${pedido.rotulo}: não foram ${falhas.map((f) => f.dominio || f).join(', ')}${enviados.length ? ' (já foram: ' + enviados.join(', ') + ')' : ''}`, detalhe: { enviados, para: pedido.to } };
    return { ok: true, mensagem: `${pedido.rotulo} enviado para ${enviados.join(', ')} (${pedido.to.join(', ')}); a tarefa fica com você para fechar quando o suporte fizer`, detalhe: { enviados, para: pedido.to, acao } };
  }

  // ---------- Ratatoskr: merge do pull request (ADR-152) ----------
  // As regras de execução (PR aberto, aprovado, build verde) já passaram; aqui
  // é o mesmo POST do "Mergear PRs", com a estratégia do hub-state (merge
  // commit por padrão) e fechando a branch de origem como a tela faz.
  async function integrador({ parametros = {} } = {}) {
    const creds = ler('creds', null);
    if (!creds || !creds.email || !creds.token) return { ok: false, motivo: 'Bitbucket não configurado (e-mail e API token, Configurações)' };
    if (!parametros.prUrl) return { ok: false, desistir: true, motivo: 'sem link do pull request na tarefa' };
    const r = await chamar('pr:fetch', { url: parametros.prUrl, creds });
    if (!r || !r.ok || !r.pr) return { ok: false, motivo: (r && r.error) || 'não consegui ler o PR' };
    const pr = r.pr;
    if (String(pr.state || '').toUpperCase() !== 'OPEN') return { ok: false, desistir: true, motivo: `o PR #${pr.id} está ${pr.state}` };
    const hub = ler('hubState', {}) || {};
    const strategy = ['merge_commit', 'squash', 'fast_forward'].includes(hub.strategy) ? hub.strategy : 'merge_commit';
    const closeSourceBranch = hub.closeSourceBranch !== false;
    log(`POST merge → ${pr.workspace}/${pr.repo} #${pr.id} (${strategy}): "${pr.title}" de ${pr.author}, ${pr.sourceBranch} → ${pr.destBranch}, ${pr.approvals} aprovação(ões), build ${pr.buildState}`, 'cmd');
    const m = await chamar('pr:merge', { workspace: pr.workspace, repo: pr.repo, id: pr.id, strategy, closeSourceBranch, creds });
    if (!m || !m.ok) return { ok: false, motivo: `o merge do PR #${pr.id} falhou: ${(m && m.error) || 'sem resposta'}` };
    return { ok: true, mensagem: `PR #${pr.id} de ${pr.workspace}/${pr.repo} mergeado (${(m.mergedHash || '').slice(0, 8) || 'ok'}, ${strategy})`, detalhe: { hash: m.mergedHash || '', workspace: pr.workspace, repo: pr.repo, id: pr.id } };
  }

  const porAgente = { bloqueador, 'publicador-buscaone': publicadorBuscaOne, 'publicador-mpiplus': publicadorMpiPlus, hospedagem, integrador };

  async function executar({ agente, parametros, tarefa } = {}) {
    const fn = porAgente[agente];
    if (!fn) return { ok: false, desistir: true, motivo: `o agente ${agente} ainda não executa nesta versão` };
    if (parar()) return { ok: false, pulou: true, motivo: 'o freio do Hub está puxado' };
    try {
      return await fn({ parametros: parametros || {}, tarefa: tarefa || {} });
    } catch (e) {
      return { ok: false, motivo: e && e.message ? e.message : String(e) };
    }
  }

  return { executar, bloqueador, publicadorBuscaOne, publicadorMpiPlus, hospedagem, integrador, agentesComExecutor: Object.keys(porAgente) };
}

module.exports = { criarExecutores };
