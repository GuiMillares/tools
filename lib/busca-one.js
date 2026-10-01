// Publicação Busca One automática — fase 2 da automação da fila (ADR-132).
//
// "Busca One" é a plataforma dos sites da Busca Cliente e da MPI Solutions: o
// site mora num repositório do Bitbucket (slug = domínio), lê as chaves no
// geral.php e é posto no ar por um humano (vhost e banco criados pelo suporte,
// git clone/pull pelo Guacamole, DNS). A tarefa no Salesforce é
// "Publicação (Troca de DNS) - {domínio}", com o temporário
// (producao.mpitemporario / deploy.buscacliente) e o "ID xxxx" do painel do
// cliente no comentário.
//
// O que dá para fazer sozinho, e é o que este módulo encadeia, nesta ordem:
//   1. criar — ou achar e reaproveitar — as propriedades no Google: GA4, GTM,
//      reCAPTCHA e o token do Search Console (o google:createProject do "Criar
//      propriedades", que já não duplica o que existe);
//   2. commitar as chaves no geral.php do repositório (bitbucket:commitGeral),
//      com $idProjetoBusca = o ID da tarefa (ou o fixo da marca: MPI Solutions
//      é sempre 39, ADR-034);
//   3. pedir o vhost e o banco ao suporte por e-mail (mail:sendBatch), com o
//      modelo da empresa — assunto e corpo abaixo, só o domínio muda;
//   4. registrar na tarefa o que foi feito e o que falta, e movê-la para
//      "Em andamento" no nome de quem está logado. A tarefa NÃO é concluída:
//      vhost, clone no servidor e DNS continuam manuais.
//
// Falha em 1 devolve erro (o motor tenta de novo; nada foi feito ainda).
// Falha em 2 vira pendência e o fluxo segue para o e-mail. Falha em 3 devolve
// erro: o e-mail ainda não saiu, e repetir 1 e 2 é idempotente (reaproveita e
// "já estava igual"). Falha em 4 é só aviso.
//
// Puro e injetável, como lib/automacao.js: recebe as chamadas (deps) e devolve
// { ok, mensagem | motivo, pendencias, feito }. A cola do renderer
// (automacao-ui.js) passa as funções reais (window.api.*).

(function () {
const ETAPAS_GOOGLE = ['analytics', 'gtm', 'recaptcha', 'searchconsole'];

// $idProjetoBusca fixo por marca (ADR-034). O renderer tem o mesmo em BRANDS e
// passa por deps.idPainelFixo; isto é a reserva para Node e testes.
const ID_PAINEL_FIXO = { mpisolutions: '39' };

// Os modelos do e-mail de vhost, por empresa, exatamente como a equipe manda.
// {dominio} é a única coisa que muda.
const EMAIL_VHOST = {
  bc: {
    empresa: 'Busca Cliente',
    assunto: 'Criação de Vhost e Banco - Busca Cliente - {dominio}',
    corpo: [
      'Bom dia, tudo bem ?',
      'Solicito a criação dos vhosts, banco de dados e conceder acesso para os seguinte projeto da empresa Busca Cliente:',
      '',
      '{dominio}',
      '',
      'Fornecer o acesso deste projetos para os seguintes usuários.',
      'Suporte / Deploy',
      '',
      'User: mateus.santos',
      'User: paulo.roberto',
      'User: everton.lima',
      'User: weverton.costa',
      'User: guilherme.millares',
      'User: carlos.almeida',
      'User: everton.lima',
    ].join('\n'),
  },
  mpisolutions: {
    empresa: 'MPI Solutions',
    assunto: 'Criação de Vhost e Banco - MPI - {dominio}',
    corpo: [
      'Bom dia, tudo bem ?',
      'Solicito a criação dos vhosts, banco de dados e conceder acesso para os seguinte projeto da empresa MPI Solutions:',
      '{dominio}',
      'Favor garantir acesso para os seguintes usuários:',
      '',
      '* carlos.almeida',
      '* mateus.santos',
      '* paulo.roberto',
      '* weverton.costa',
      '* Everton.lima',
      '* guilherme.millares',
    ].join('\n'),
  },
};

function nomeEmpresa(e) {
  return e === 'bc' ? 'Busca Cliente' : e === 'mpisolutions' ? 'MPI Solutions' : String(e || '?');
}

// A mesma substituição do mail:sendBatch (fillTemplate do main.js).
function preencher(texto, dominio) {
  return String(texto || '').replace(/\{\s*dom[ií]nio\s*\}/gi, dominio);
}

// "a@x.com; b@x.com" ou ['a@x.com'] → ['a@x.com', 'b@x.com'].
function listaEmails(v) {
  return (Array.isArray(v) ? v : String(v || '').split(/[;,\s]+/)).map((s) => String(s).trim()).filter(Boolean);
}

// O e-mail pronto (e os modelos, para o mail:sendBatch preencher de novo).
function montarEmailVhost(empresa, dominio) {
  const m = EMAIL_VHOST[empresa];
  if (!m) return null;
  return { empresa: m.empresa, assunto: preencher(m.assunto, dominio), corpo: preencher(m.corpo, dominio), assuntoModelo: m.assunto, corpoModelo: m.corpo };
}

// O que vai para o geral.php: o mesmo conjunto do geralValues() do renderer.
// $idProjetoBusca vazio não entra no commit (o applyGeralValues pula valor
// vazio), então o 'xxxx' do repositório fica para a mão.
function valoresGeral(idPainel, v) {
  const r = v || {};
  return {
    idProjetoBusca: String(idPainel || ''),
    idAnalytics: r.idAnalytics || '',
    tagmanager: r.tagmanager || '',
    googleSearchConsole: r.googleSearchConsole || '',
    siteKey: r.siteKey || '',
    secretKey: r.secretKey || '',
  };
}

function quandoTexto(d) {
  try { return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(d); }
}

// O registro que vai para a tarefa: o que foi feito (com as chaves públicas —
// nunca a secretKey do reCAPTCHA) e o que falta. Texto puro, sem markdown.
function textoDaTarefa(feito, pendencias, agora) {
  const f = feito || {};
  const p = f.propriedades || {};
  const marca = (nome) => ((p.reaproveitados || []).includes(nome) ? ' (já existia, reaproveitado)' : (p.faltando || []).includes(nome) ? ' (NÃO criado)' : '');
  const linhas = [`Publicação Busca One (${nomeEmpresa(f.empresa)}) — parte automática feita pelo Hub em ${quandoTexto(agora || new Date())}:`];
  linhas.push(`- Analytics (GA4): ${p.idAnalytics || 'não criado'}${marca('Analytics')}`);
  linhas.push(`- Tag Manager: ${p.tagmanager || 'não criado'}${marca('Tag Manager')}`);
  linhas.push(`- reCAPTCHA (site key): ${p.siteKey || 'não criada'}${marca('reCAPTCHA')}`);
  linhas.push(`- Search Console (token): ${p.googleSearchConsole || 'não gerado'}${marca('Search Console')}`);
  linhas.push(`- ID do painel ($idProjetoBusca): ${f.idPainel ? f.idPainel + (f.idPainelOrigem === 'fixo' ? ' (fixo da marca)' : ' (da tarefa)') : 'não estava na tarefa'}`);
  const c = f.commit;
  if (c && c.ok && !c.skipped) linhas.push(`- geral.php: commitado em ${c.workspace}/${c.repo} (branch ${c.branch}) — "Ajustes para publicação"`);
  else if (c && c.ok && c.skipped) linhas.push(`- geral.php: já estava com esses valores em ${c.workspace}/${c.repo}, nada a commitar`);
  else linhas.push(`- geral.php: NÃO commitado (${(c && c.error) || 'sem resposta'})`);
  const e = f.email;
  if (e && e.ok) linhas.push(`- E-mail "${e.assunto}" enviado para ${e.para.join(', ')}${e.cc.length ? ' (cc ' + e.cc.join(', ') + ')' : ''}`);
  if ((pendencias || []).length) {
    linhas.push('');
    linhas.push('Pendências:');
    for (const x of pendencias) linhas.push(`- ${x}`);
  }
  linhas.push('');
  linhas.push('Falta (manual): vhost e banco pelo suporte, clone/pull do repositório no servidor (Guacamole) e apontamento do DNS.');
  return linhas.join('\n');
}

// A publicação Busca One de UMA tarefa.
//
// entrada: { id, link, assunto, dominio, empresa ('bc' | 'mpisolutions' | null),
//            empresaSugerida, idPainel, temporario, razao }
// deps:    { log, email: { to, cc }, idPainelFixo(empresa),
//            criarPropriedades({ domain, brand, steps }),
//            commitGeral({ repo, brand, values }),
//            enviarEmail({ to, cc, subjectTemplate, bodyTemplate, domains }),
//            moverTarefa({ id, coluna }), comentarTarefa({ link, texto, ... }), agora() }
async function publicarBuscaOne(entrada, deps) {
  const d = deps || {};
  const log = d.log || (() => {});
  const e = entrada || {};
  const dominio = String(e.dominio || '').trim().toLowerCase();
  const empresa = e.empresa === 'bc' || e.empresa === 'mpisolutions' ? e.empresa
    : e.empresaSugerida === 'bc' || e.empresaSugerida === 'mpisolutions' ? e.empresaSugerida : null;
  const feito = { dominio, empresa, idPainel: '', idPainelOrigem: '', propriedades: null, commit: null, email: null, tarefa: null };

  // Tudo que pode faltar é conferido ANTES de qualquer efeito.
  if (!dominio) return { ok: false, desistir: true, motivo: 'sem domínio final na tarefa', feito };
  if (!empresa) return { ok: false, desistir: true, motivo: `não descobri a empresa de ${dominio} (nem pelo caso, nem pela fila, nem pelo temporário); publicar à mão`, feito };
  for (const fn of ['criarPropriedades', 'commitGeral', 'enviarEmail']) {
    if (typeof d[fn] !== 'function') return { ok: false, pulou: true, motivo: `driver ${fn} indisponível`, feito };
  }
  const para = listaEmails(d.email && d.email.to);
  const cc = listaEmails(d.email && d.email.cc);
  if (!para.length) return { ok: false, motivo: 'destinatário do e-mail de vhost em branco (painel da automação)', feito };
  const modelo = montarEmailVhost(empresa, dominio);
  if (!modelo) return { ok: false, desistir: true, motivo: `sem modelo de e-mail de vhost para ${nomeEmpresa(empresa)}`, feito };

  const fixo = typeof d.idPainelFixo === 'function' ? String(d.idPainelFixo(empresa) || '') : (ID_PAINEL_FIXO[empresa] || '');
  const idPainel = fixo || String(e.idPainel || '').trim();
  feito.idPainel = idPainel;
  feito.idPainelOrigem = fixo ? 'fixo' : idPainel ? 'tarefa' : '';
  const pendencias = [];
  if (!idPainel) {
    log(`${dominio}: a tarefa não traz o ID do painel ("ID 1234" no comentário); $idProjetoBusca fica como está no geral.php.`, 'warn');
    pendencias.push('ID do painel ($idProjetoBusca) não estava na tarefa: preencher à mão no geral.php');
  }

  // 1. Propriedades no Google (reaproveita o que existe, cria o que falta).
  log(`${dominio}: criando ou achando as propriedades no Google (${nomeEmpresa(empresa)}: GA4, GTM, reCAPTCHA, Search Console)…`, 'cmd');
  const props = await d.criarPropriedades({ domain: dominio, brand: empresa, steps: ETAPAS_GOOGLE.slice() });
  if (!(props && props.ok && props.result)) {
    return { ok: false, desistir: !!(props && props.saInvalida), motivo: `propriedades do Google: ${(props && props.error) || 'sem resposta'}`, feito };
  }
  const v = props.result;
  feito.propriedades = {
    idAnalytics: v.idAnalytics || '', tagmanager: v.tagmanager || '', siteKey: v.siteKey || '', googleSearchConsole: v.googleSearchConsole || '',
    reaproveitados: Array.isArray(v.reaproveitados) ? v.reaproveitados : [], faltando: Array.isArray(v.faltando) ? v.faltando : [],
  };
  for (const nome of feito.propriedades.faltando) pendencias.push(`${nome} não foi criado no Google (ver terminal)`);
  log(`${dominio}: GA ${v.idAnalytics || '?'}, GTM ${v.tagmanager || '?'}, reCAPTCHA ${v.siteKey ? 'ok' : '?'}, Search Console ${v.googleSearchConsole ? 'ok' : '?'}${feito.propriedades.reaproveitados.length ? ' (reaproveitados: ' + feito.propriedades.reaproveitados.join(', ') + ')' : ''}.`, 'success');

  // 2. geral.php no Bitbucket. Falhar aqui não impede o pedido de vhost: vira
  //    pendência para a mão.
  const values = valoresGeral(idPainel, v);
  log(`${dominio}: commitando o geral.php no repositório (${nomeEmpresa(empresa)})…`, 'cmd');
  const commit = await d.commitGeral({ repo: dominio, brand: empresa, values });
  feito.commit = commit || { ok: false, error: 'sem resposta' };
  if (commit && commit.ok && !commit.skipped) log(`${dominio}: geral.php atualizado em ${commit.workspace}/${commit.repo} (branch ${commit.branch}).`, 'success');
  else if (commit && commit.ok && commit.skipped) log(`${dominio}: o geral.php já estava com esses valores; nada a commitar.`, 'info');
  else {
    log(`${dominio}: o commit do geral.php falhou (${(commit && commit.error) || 'sem resposta'}); sigo com o e-mail e deixo o commit para a mão.`, 'warn');
    pendencias.push(`commit do geral.php falhou: ${(commit && commit.error) || 'sem resposta'}`);
  }

  // 3. E-mail de vhost e banco ao suporte, pela caixa de quem está logado.
  log(`${dominio}: enviando "${modelo.assunto}" para ${para.join(', ')}${cc.length ? ' (cc ' + cc.join(', ') + ')' : ''}…`, 'cmd');
  const mail = await d.enviarEmail({ to: para, cc, subjectTemplate: modelo.assuntoModelo, bodyTemplate: modelo.corpoModelo, domains: [dominio] });
  const falhouEmail = !(mail && mail.ok) || (Array.isArray(mail.falhas) && mail.falhas.length);
  if (falhouEmail) {
    const erro = (mail && (mail.error || (mail.falhas && mail.falhas[0] && mail.falhas[0].erro))) || 'sem resposta';
    feito.email = { ok: false, assunto: modelo.assunto, para, cc, erro };
    return {
      ok: false,
      motivo: `e-mail de vhost não saiu (${erro})${mail && mail.reauth ? '; reconecte a conta Microsoft nas Configurações' : ''}. Propriedades e geral.php já estão feitos; tento o e-mail de novo na próxima varredura`,
      feito, pendencias,
    };
  }
  feito.email = { ok: true, assunto: modelo.assunto, para, cc };
  log(`${dominio}: e-mail de vhost enviado.`, 'success');

  // 4. A tarefa: "Em andamento" no nome de quem está logado, e o registro do
  //    que foi feito. Falhar aqui é só aviso: o trabalho está feito.
  const agora = typeof d.agora === 'function' ? d.agora() : new Date();
  const texto = textoDaTarefa(feito, pendencias, agora);
  feito.tarefa = { texto, movida: false, comentada: false };
  if (e.id && typeof d.moverTarefa === 'function') {
    const mv = await d.moverTarefa({ id: e.id, coluna: 'andamento' });
    feito.tarefa.movida = !!(mv && mv.ok);
    if (!feito.tarefa.movida) log(`${dominio}: não consegui mover a tarefa para "Em andamento" (${(mv && mv.error) || 'sem resposta'}).`, 'warn');
  }
  if (e.link && typeof d.comentarTarefa === 'function') {
    const cm = await d.comentarTarefa({ link: e.link, texto, comentar: true, marcar: false, assumir: false, concluir: false });
    feito.tarefa.comentada = !!(cm && cm.ok);
    if (!feito.tarefa.comentada) log(`${dominio}: não consegui registrar na tarefa (${(cm && cm.error) || 'sem resposta'}); o registro está no terminal.`, 'warn');
  }

  const resumo = `propriedades ${feito.propriedades.reaproveitados.length === 4 ? 'reaproveitadas' : 'prontas'}, geral.php ${commit && commit.ok ? (commit.skipped ? 'já estava igual' : 'commitado') : 'NÃO commitado'}, e-mail de vhost enviado`;
  return {
    ok: true,
    mensagem: `${resumo}; a tarefa fica aberta${feito.tarefa.movida ? ' em "Em andamento"' : ''} — vhost, clone no servidor e DNS são manuais${pendencias.length ? ` (${pendencias.length} pendência(s), ver tarefa)` : ''}`,
    feito, pendencias,
  };
}

const _exports = { ETAPAS_GOOGLE, ID_PAINEL_FIXO, EMAIL_VHOST, nomeEmpresa, preencher, listaEmails, montarEmailVhost, valoresGeral, textoDaTarefa, publicarBuscaOne };
// Dual: Node (main/testes) e navegador (renderer, via <script>).
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.BuscaOne = _exports;
})();
