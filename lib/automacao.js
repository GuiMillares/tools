// Motor da automação da fila (ADR-120).
//
// Puro e injetável: recebe as dependências (as chamadas de IPC, o logger e os
// interruptores) para poder ser testado sem Electron. A cola do renderer passa
// as funções reais (window.api.*) e o driver de publicação.
//
// Tipos tratados: bloqueio de contatos (seguro, reaproveita o /doutor),
// publicação MPI+ (dirige o Publicar MPI+ ao vivo — só roda com o interruptor
// de publicação ligado) e publicação Busca One (propriedades + geral.php no
// Bitbucket + e-mail de vhost, interruptor próprio, ADR-132). Uma tarefa por
// vez, respeitando "parar" e o que já foi processado.

// IIFE para não vazar nomes no escopo global do renderer. module.exports p/ Node.
(function () {
const { triar } = (typeof require !== 'undefined' ? require('./triagem') : window.Triagem);

function nomeMarca(m) {
  return m === 'bc' ? 'Busca Cliente' : m === 'mpisolutions' ? 'MPI Solutions' : m === 'mpiplus' ? 'MPI+' : m || '?';
}

// Uma tarefa de BLOQUEIO de contatos: descobre a marca pelo IP, censura no
// /doutor e fecha a tarefa. Nunca chuta a marca; sem ela, pula e sinaliza.
async function processarBloqueio(tarefa, tri, deps) {
  const log = deps.log || (() => {});
  const dominio = tri.dominio;
  if (!dominio) return { ok: false, pulou: true, motivo: 'não achei o domínio na tarefa' };

  log(`Bloqueio ${dominio}: descobrindo a marca pelo apontamento…`, 'cmd');
  const m = await deps.resolverMarca({ dominio });
  const marca = m && m.ok ? m.marca : null;
  if (!marca) return { ok: false, pulou: true, motivo: `não descobri a marca de ${dominio} pelo IP (${((m && m.ips) || []).join(', ') || 'não resolveu'}); revisar à mão` };
  if (marca === 'mpiplus') {
    // MPI+ não tem /doutor: o bloqueio é no painel central (idealplus). Se o
    // driver do painel estiver ligado (deps.bloquearPainel), usa ele; senão,
    // pula avisando (precisa da URL/CNPJ do cliente para achar no painel).
    if (typeof deps.bloquearPainel === 'function') {
      log(`Bloqueio ${dominio}: MPI+; censurando os contatos no painel…`, 'cmd');
      const bp = await deps.bloquearPainel({ dominio, cnpj: tri.cnpj, url: tri.painelUrl, marca, acao: 'bloquear' });
      if (!(bp && bp.ok)) return { ok: false, dominio, motivo: (bp && bp.error) || 'o painel MPI+ não confirmou o bloqueio', detalhe: bp };
      let fechou = false;
      if (tarefa.link) {
        const f = await deps.fecharTarefa({ link: tarefa.link, texto: 'Contatos removidos', assumir: true, concluir: true, comentar: true });
        fechou = !!(f && f.ok);
        if (!fechou) log(`Bloqueio ${dominio}: contatos censurados no painel, mas não consegui fechar a tarefa (${(f && f.error) || 'ver log'}).`, 'warn');
      }
      return { ok: true, marca, dominio, empresa: bp.empresa, jaEstava: !!bp.jaEstava, tarefaFechada: fechou, via: 'painel' };
    }
    return { ok: false, pulou: true, dominio, motivo: `${dominio} é MPI+ — o bloqueio é no painel (fluxo ainda não integrado à automação); revisar à mão` };
  }

  log(`Bloqueio ${dominio}: ${nomeMarca(marca)}; censurando os contatos no /doutor…`, 'cmd');
  const b = await deps.bloquear({ dominio, marca, acao: 'bloquear' });
  if (!(b && b.ok)) return { ok: false, motivo: (b && b.error) || 'o /doutor não confirmou o bloqueio', detalhe: b };

  let tarefaFechada = false;
  if (tarefa.link) {
    const f = await deps.fecharTarefa({ link: tarefa.link, texto: 'Contatos removidos', assumir: true, concluir: true, comentar: true });
    tarefaFechada = !!(f && f.ok);
    if (!tarefaFechada) log(`Bloqueio ${dominio}: contatos censurados, mas não consegui fechar a tarefa (${(f && f.error) || 'ver log'}).`, 'warn');
  }
  return { ok: true, marca, empresa: b.empresa, jaEstava: !!b.jaEstava, tarefaFechada };
}

// Uma tarefa de PUBLICAÇÃO. Duas plataformas (a triagem diz qual):
//   - MPI+: dirige o Publicar MPI+ (deps.publicar), que faz o backup do DNS
//     antes de trocar e fecha a tarefa no fim.
//   - Busca One (Busca Cliente / MPI Solutions, ADR-132): deps.publicarBuscaOne
//     cria/acha as propriedades, commita o geral.php no Bitbucket e manda o
//     e-mail de vhost; a tarefa fica aberta para a parte manual.
// A elegibilidade já veio da triagem.
async function processarPublicacao(tarefa, tri, deps) {
  const log = deps.log || (() => {});
  if (!tri.elegivel) return { ok: false, pulou: true, motivo: tri.motivo || 'publicação não elegível' };
  // A empresa (Busca Cliente / MPI Solutions) pela FILA da tarefa: "Deploy
  // Busca Cliente" → bc, "Deploy MPI Solutions" → mpisolutions. É a reserva
  // para quando o Registro.br (MPI+) ou o caso (Busca One) não dizem.
  const empresa = tarefa.empresaFila || null;
  if (tri.plataforma === 'buscaone') {
    if (typeof deps.publicarBuscaOne !== 'function') return { ok: false, pulou: true, motivo: 'driver de publicação Busca One indisponível' };
    // O temporário diz a empresa (tri.marca) e o repositório (ADR-133); a
    // fila vai junto como reserva para tarefa sem temporário.
    log(`Publicação Busca One: ${tri.dominio}${tri.temporario ? ' (temporário ' + tri.temporario + (tri.marca ? ', ' + nomeMarca(tri.marca) : '') + ')' : ''}${tri.repositorio && tri.repositorio !== tri.dominio ? '; repositório ' + tri.repositorio : ''}${tri.idPainel ? '; ID do painel ' + tri.idPainel : ''}${empresa ? '; fila ' + nomeMarca(empresa) : ''}…`, 'cmd');
    const r = await deps.publicarBuscaOne({
      id: tarefa.id, assunto: tarefa.assunto, link: tarefa.link, empresa,
      dominio: tri.dominio, temporario: tri.temporario || '', repositorio: tri.repositorio || '', idPainel: tri.idPainel || '',
      empresaTemporario: tri.marca === 'bc' || tri.marca === 'mpisolutions' ? tri.marca : null,
    });
    return r || { ok: false, motivo: 'a publicação Busca One não retornou nada' };
  }
  if (typeof deps.publicar !== 'function') return { ok: false, pulou: true, motivo: 'driver de publicação indisponível' };
  log(`Publicação MPI+: ${tri.dominio} (temporário ${tri.temporario}${empresa ? '; fila ' + nomeMarca(empresa) : ''})…`, 'cmd');
  const r = await deps.publicar({ dominio: tri.dominio, temporario: tri.temporario, link: tarefa.link, empresa });
  return r || { ok: false, motivo: 'a publicação não retornou nada' };
}

// A marca da fila dona da tarefa (dados.filas vem do salesforce:tarefas com
// { id, nome, marca }). null quando a tarefa não está numa fila de marca.
function empresaDaFila(dados, t) {
  const filas = (dados && dados.filas) || [];
  const f = filas.find((x) => x && x.id && (x.id === t.fila || x.id === t.donoId));
  return f && (f.marca === 'bc' || f.marca === 'mpisolutions') ? f.marca : null;
}

function linkDaTarefa(dados, t) {
  if (t.link) return t.link;
  const base = String(dados.instancia || '').replace(/\/$/, '');
  return base ? `${base}/lightning/r/Task/${t.id}/view` : '';
}

// A anotação da fila (ADR-142): antes de agir, o motor lê a fila inteira e
// escreve numa linha o que há nela, domínio por domínio — publicações MPI+,
// Busca One, bloqueios, o que está na lista de espera (aguardando o cliente
// apontar ou a propagação do Registro.br) e o que já foi tratado nesta
// sessão. É o que dá para ver, de uma vez, por que cada tarefa foi ou não
// tocada. `emEspera(dominio)` é a consulta à lista de espera do app.
function resumirFila(dados, { processados = new Set(), emEspera } = {}) {
  const grupos = { mpiplus: [], buscaone: [], bloqueio: [] };
  const esperando = [];
  let abertas = 0, outras = 0, tratadas = 0;
  for (const t of (dados && dados.tarefas) || []) {
    if (!t || t.fechada) continue;
    abertas++;
    const tri = triar(t);
    if (tri.tipo === 'ignorar') { outras++; continue; }
    const rotulo = tri.dominio || t.assunto || t.id;
    const esp = tri.dominio && typeof emEspera === 'function' ? emEspera(tri.dominio) : null;
    if (esp) esperando.push(`${rotulo} (${esp.cliente ? 'cliente' : esp.pendencia ? 'pendência' : 'Registro.br'})`);
    else if (processados.has(t.id)) tratadas++;
    if (tri.tipo === 'bloqueio') grupos.bloqueio.push(rotulo);
    else if (tri.plataforma === 'buscaone') grupos.buscaone.push(rotulo);
    else grupos.mpiplus.push(rotulo);
  }
  const partes = [];
  if (grupos.mpiplus.length) partes.push(`publicação MPI+ ${grupos.mpiplus.length}: ${grupos.mpiplus.join(', ')}`);
  if (grupos.buscaone.length) partes.push(`Busca One ${grupos.buscaone.length}: ${grupos.buscaone.join(', ')}`);
  if (grupos.bloqueio.length) partes.push(`bloqueio ${grupos.bloqueio.length}: ${grupos.bloqueio.join(', ')}`);
  if (outras) partes.push(`${outras} outra(s)`);
  let texto = `Fila: ${abertas} aberta(s)${partes.length ? ' — ' + partes.join(' · ') : ''}.`;
  if (esperando.length) texto += ` Na lista de espera, não mexo: ${esperando.join(', ')}.`;
  if (tratadas) texto += ` Já tratada(s) nesta sessão: ${tratadas}.`;
  return texto;
}

// Varre a fila (o retorno do salesforce:tarefas) e executa as elegíveis, uma por
// vez. `estado`: { processados:Set, tentativas:Map, aguardando:Map,
// parar:()=>bool }. `deps.ligado`: quais tipos estão habilitados ({ bloqueio,
// publicacao, buscaone }). `deps.emEspera(dominio)`: a lista de espera do app
// (ADR-103/142) — domínio que está nela já foi publicado e só espera o DNS: a
// tarefa é anotada como "aguardando" e a varredura segue para a próxima.
// Quantas vezes uma tarefa pode falhar antes de a automação desistir dela (e
// deixar para revisão manual). Evita ficar batendo a cada varredura numa
// falha que não vai se resolver sozinha.
const MAX_TENTATIVAS = 3;

async function varrerFila(dados, deps, estado = {}) {
  const log = deps.log || (() => {});
  const processados = estado.processados || new Set();
  const tentativas = estado.tentativas || (estado.tentativas = new Map());
  const aguardando = estado.aguardando || (estado.aguardando = new Map());
  const parar = estado.parar || (() => false);
  const ligado = deps.ligado || {};
  const emEspera = typeof deps.emEspera === 'function' ? deps.emEspera : () => null;
  const resultados = [];

  log(resumirFila(dados, { processados, emEspera }), 'info');

  for (const t of (dados.tarefas || [])) {
    if (parar()) { log('Automação: parada solicitada; interrompendo a varredura.', 'warn'); break; }
    if (t.fechada || processados.has(t.id)) continue;
    const tri = triar(t);
    if (tri.tipo === 'ignorar') continue;

    const tarefa = { ...t, link: linkDaTarefa(dados, t), empresaFila: empresaDaFila(dados, t) };
    let res = null;

    if (tri.tipo === 'bloqueio') {
      if (!ligado.bloqueio) continue;
      res = await processarBloqueio(tarefa, tri, deps);
    } else if (tri.tipo === 'publicacao') {
      if (!tri.elegivel) {
        // Sem domínio (ou sem temporário, no MPI+): registra uma vez e não
        // tenta de novo.
        log(`${t.assunto}: ${tri.motivo}. Fica para revisão manual.`, 'info');
        processados.add(t.id);
        continue;
      }
      // Cada plataforma tem o seu interruptor: MPI+ é `publicacao`, Busca One
      // é `buscaone` (ADR-132). Desligado, a tarefa fica na fila para quando
      // ligar — não é marcada como processada.
      if (tri.plataforma === 'buscaone' ? !ligado.buscaone : !ligado.publicacao) continue;
      // Já publicado e na lista de espera (aguardando o cliente apontar, ou a
      // propagação do Registro.br, ADR-142): não é para publicar de novo —
      // anota e segue para a próxima tarefa. O vigia da lista termina SSL,
      // Search Console e a tarefa quando o DNS apontar.
      const esp = emEspera(tri.dominio);
      if (esp) res = { ok: false, aguardando: true, dominio: tri.dominio, motivo: esp.motivo || 'na lista de espera', cliente: !!esp.cliente };
      else res = await processarPublicacao(tarefa, tri, deps);
    }

    if (res) {
      resultados.push({ id: t.id, assunto: t.assunto, tipo: tri.tipo, ...res });
      // Deixa VISÍVEL o desfecho de cada tarefa — antes só o resumo aparecia, e
      // um pulo silencioso parecia "não fez nada".
      const rotulo = res.dominio || tri.dominio || t.assunto;
      if (res.ok) log(`${rotulo}: ${res.mensagem || (res.jaEstava ? 'já estava feito' : 'concluído')}.`, 'success');
      else if (res.aguardando) log(`${rotulo}: aguardando — ${res.motivo || 'na lista de espera'}. Sigo para a próxima tarefa.`, 'info');
      else if (res.pulou) log(`${rotulo}: pulei — ${res.motivo || 'motivo não informado'}.`, 'warn');
      else log(`${rotulo}: ERRO — ${res.motivo || res.error || 'sem detalhe'}.`, 'error');
      // Sucesso não repete. "Aguardando" (publicado; falta o DNS, que não
      // depende do Hub) também não: fica anotado e a lista de espera cuida do
      // resto. Pulo (ex.: marca ainda não resolvida) fica para reavaliar.
      // "desistir" é uma falha que não vai se resolver sozinha (contato
      // técnico do cliente, contrato não achado…): marca como processada e
      // deixa para revisão manual. Erro comum tenta de novo até MAX_TENTATIVAS
      // e aí desiste também.
      if (res.ok) processados.add(t.id);
      else if (res.aguardando) { processados.add(t.id); aguardando.set(t.id, { dominio: rotulo, motivo: res.motivo || '', cliente: !!res.cliente, desde: Date.now() }); }
      else if (res.desistir) { processados.add(t.id); log(`${rotulo}: deixando para revisão manual (não vou tentar de novo).`, 'warn'); }
      else if (!res.pulou) {
        const n = (tentativas.get(t.id) || 0) + 1;
        tentativas.set(t.id, n);
        if (n >= MAX_TENTATIVAS) { processados.add(t.id); log(`${rotulo}: ${n} falhas seguidas; desisti desta tarefa (revisar à mão).`, 'warn'); }
        else log(`${rotulo}: tentativa ${n} de ${MAX_TENTATIVAS}; tento de novo na próxima varredura.`, 'info');
      }
    }
  }
  return resultados;
}

const _exports = { processarBloqueio, processarPublicacao, varrerFila, resumirFila, linkDaTarefa, nomeMarca, empresaDaFila, MAX_TENTATIVAS };
// Dual: Node (main/testes) e navegador (renderer, via <script>).
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.Automacao = _exports;
})();
