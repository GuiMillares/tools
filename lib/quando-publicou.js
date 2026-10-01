// Quando um site foi publicado (ADR-135).
//
// Para cada domínio, duas fontes, nesta ordem:
//   1. Salesforce: a tarefa de publicação ("Publicação (Troca de DNS)…",
//      "Publicação V1 -> V2"…) concluída. A busca é global (SOSL), que enxerga
//      o assunto e os comentários (ADR-097); sem tarefa que cite o domínio, a
//      reserva é a conta do cliente (acharContaPorDominio) e as tarefas de
//      publicação dos casos dela — serve para cliente que trocou de domínio.
//      A data é a de conclusão da tarefa (CompletedDateTime; sem o campo, a
//      última modificação).
//   2. Bitbucket: sem tarefa concluída, o repositório do domínio (slug =
//      domínio, PRD §9, nas workspaces das marcas) e o commit que mexeu no
//      geral.php ou no client.inc.php — de preferência o mais recente cuja
//      mensagem fala em publicação ("Ajustes para publicação"); senão, o mais
//      recente que mexeu neles.
//
// Resultado por domínio: { dominio, situacao, quando, fonte, detalhe, texto }
//   situacao: 'publicado' | 'sem repositório' | 'não encontrado' | 'erro'
//   texto:    a resposta numa linha ("publicado em 14/11/2025 (…)", "sem
//             repositório", "não encontrado").
//
// Puro no que importa: recebe o cliente do Salesforce (lib/salesforce.js) e um
// cliente do Bitbucket (criarBitbucket, abaixo, ou um falso nos testes).

const https = require('https');
const { escaparSoql, escaparSosl, acharContaPorDominio, textoTemDominio } = require('./salesforce');
const { limparDominio } = require('./triagem');

const ARQUIVOS = ['geral.php', 'client.inc.php'];
const RE_PUBLICACAO = /publica/i;
const CAMPOS_TAREFA = ['Id', 'Subject', 'Status', 'IsClosed', 'CompletedDateTime', 'LastModifiedDate', 'CreatedDate', 'WhatId', 'What.Name', 'Owner.Name', 'Description'];

function formatarData(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (isNaN(d.getTime())) return String(valor).slice(0, 10).split('-').reverse().join('/');
  const n = (x) => String(x).padStart(2, '0');
  return `${n(d.getDate())}/${n(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function dataDaTarefa(t) {
  return (t && (t.CompletedDateTime || t.LastModifiedDate || t.CreatedDate)) || '';
}

function ehTarefaDePublicacao(t) {
  return RE_PUBLICACAO.test((t && t.Subject) || '');
}

// Entre as tarefas achadas: a de publicação concluída mais recente, e as de
// publicação ainda abertas (para dizer que existe, mesmo sem data).
function escolherTarefa(tarefas) {
  const pub = (tarefas || []).filter(ehTarefaDePublicacao);
  const fechadas = pub.filter((t) => t.IsClosed).sort((a, b) => String(dataDaTarefa(b)).localeCompare(String(dataDaTarefa(a))));
  return { concluida: fechadas[0] || null, abertas: pub.filter((t) => !t.IsClosed) };
}

// Entre os commits que mexeram nos arquivos: o mais recente cuja mensagem
// fala em publicação; senão, o mais recente.
function escolherCommit(commits) {
  const lista = (commits || []).filter((c) => c && c.date);
  if (!lista.length) return null;
  const ordenados = [...lista].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return ordenados.find((c) => RE_PUBLICACAO.test(c.message || '')) || ordenados[0];
}

// A org tem CompletedDateTime na Tarefa? Descoberto na primeira consulta que
// falhar por causa dele, uma vez por processo.
let semCompletedDateTime = false;
function camposTarefa() {
  return semCompletedDateTime ? CAMPOS_TAREFA.filter((c) => c !== 'CompletedDateTime') : CAMPOS_TAREFA;
}
async function comCampos(fn) {
  try {
    return await fn(camposTarefa());
  } catch (e) {
    if (e && e.sessaoInvalida) throw e;
    if (!semCompletedDateTime && /CompletedDateTime/i.test(String(e && e.message))) {
      semCompletedDateTime = true;
      return fn(camposTarefa());
    }
    throw e;
  }
}

// Tarefas que citam o domínio (assunto ou comentários), pela busca global.
// A SOSL é aproximada: só vale o que cita o domínio de verdade.
async function tarefasPorDominio(sf, dominio, log = () => {}) {
  log(`SOSL tarefas que citam "${dominio}"`, 'cmd');
  const achadas = await comCampos((campos) => sf.buscar(`FIND {"${escaparSosl(dominio)}"} IN ALL FIELDS RETURNING Task(${campos.join(', ')} ORDER BY LastModifiedDate DESC LIMIT 100)`));
  return (achadas || []).filter((t) => textoTemDominio(t.Subject, dominio) || textoTemDominio(t.Description, dominio));
}

// Reserva: a conta do cliente e as tarefas de publicação dos casos dela.
async function tarefasPelaConta(sf, dominio, log = () => {}) {
  const r = await acharContaPorDominio(sf, dominio, log);
  if (!r.conta) return { conta: null, motivo: r.motivo, tarefas: [] };
  log(`SOQL casos da conta ${r.conta.Name} e suas tarefas de publicação`, 'cmd');
  const casos = await sf.consultar(`SELECT Id FROM Case WHERE AccountId = '${escaparSoql(r.conta.Id)}' LIMIT 200`);
  if (!casos.length) return { conta: r.conta, via: r.via, tarefas: [] };
  const ids = casos.map((c) => `'${escaparSoql(c.Id)}'`).join(', ');
  const tarefas = await comCampos((campos) => sf.consultar(`SELECT ${campos.join(', ')} FROM Task WHERE WhatId IN (${ids}) AND Subject LIKE '%ublica%' ORDER BY LastModifiedDate DESC LIMIT 100`));
  return { conta: r.conta, via: r.via, tarefas };
}

// ---------- Bitbucket ----------

function pedirBitbucket(creds) {
  return (method, url) => new Promise((resolve, reject) => {
    const u = new URL(url);
    if (u.hostname !== 'api.bitbucket.org') { reject(new Error(`Host inesperado: ${u.hostname}`)); return; }
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method,
      headers: { Authorization: 'Basic ' + Buffer.from(`${creds.email}:${creds.token}`).toString('base64'), Accept: 'application/json' },
    }, (res) => {
      let txt = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { txt += c; });
      res.on('end', () => {
        let json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, text: txt });
      });
    });
    req.on('error', (e) => reject(new Error(`Falha de rede no Bitbucket: ${e.message}`)));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('O Bitbucket não respondeu em 30s.')); });
    req.end();
  });
}

// O cliente: acha o repositório do domínio nas workspaces, os arquivos de
// configuração onde estiverem (até 3 níveis) e os commits que mexeram neles.
function criarBitbucket({ creds, workspaces, pedir } = {}) {
  const req = pedir || pedirBitbucket(creds || {});
  const lista = (workspaces || []).map((w) => String(w || '').trim()).filter(Boolean);
  const base = (repo) => `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repo)}`;

  async function acharRepo(slug) {
    const semPermissao = [];
    for (const ws of lista) {
      const r = await req('GET', `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(ws)}/${encodeURIComponent(slug)}?fields=slug,mainbranch.name,created_on`);
      if (r.status === 200) return { workspace: ws, repo: slug, mainBranch: (r.json && r.json.mainbranch && r.json.mainbranch.name) || 'master', criadoEm: (r.json && r.json.created_on) || '' };
      if (r.status === 404) continue;
      if (r.status === 401 || r.status === 403) { semPermissao.push(ws); continue; }
      throw new Error(`Bitbucket ${ws}/${slug} respondeu HTTP ${r.status}`);
    }
    if (semPermissao.length) throw new Error(`sem permissão para ler ${semPermissao.join(', ')} no Bitbucket`);
    return null;
  }

  async function acharArquivos(repo, nomes) {
    const achados = {};
    let url = `${base(repo)}/src/${encodeURIComponent(repo.mainBranch)}/?max_depth=3&pagelen=100&fields=values.path,values.type,next`;
    for (let p = 0; p < 10 && url; p++) {
      const r = await req('GET', url);
      if (r.status !== 200) break;
      for (const v of ((r.json && r.json.values) || [])) {
        if (v.type !== 'commit_file') continue;
        for (const nome of nomes) if (!achados[nome] && (v.path === nome || String(v.path).endsWith('/' + nome))) achados[nome] = v.path;
      }
      if (nomes.every((n) => achados[n])) break;
      url = (r.json && r.json.next) || null;
    }
    return achados;
  }

  async function commitsDoArquivo(repo, caminho, { maximo = 100 } = {}) {
    const out = [];
    let url = `${base(repo)}/commits?path=${encodeURIComponent(caminho)}&pagelen=50&fields=values.hash,values.date,values.message,values.author.raw,next`;
    for (let p = 0; p < 4 && url && out.length < maximo; p++) {
      const r = await req('GET', url);
      if (r.status !== 200) break;
      for (const c of ((r.json && r.json.values) || [])) {
        out.push({ hash: String(c.hash || ''), date: c.date || '', message: String(c.message || '').trim().split('\n')[0], autor: (c.author && c.author.raw) || '', arquivo: caminho });
      }
      url = (r.json && r.json.next) || null;
    }
    return out;
  }

  return { workspaces: lista, acharRepo, acharArquivos, commitsDoArquivo };
}

// ---------- A resposta de um domínio ----------

async function quandoPublicou(dominioBruto, { sf = null, bb = null, log = () => {} } = {}) {
  const dominio = limparDominio(dominioBruto);
  const r = { dominio, situacao: '', quando: '', fonte: '', detalhe: '', texto: '', tarefaAberta: '' };
  if (!dominio) { r.situacao = 'erro'; r.detalhe = 'domínio inválido'; r.texto = 'domínio inválido'; return r; }

  let abertas = [];
  if (sf) {
    const diretas = await tarefasPorDominio(sf, dominio, log);
    let { concluida, abertas: ab } = escolherTarefa(diretas);
    abertas = ab;
    let via = 'tarefa que cita o domínio';
    if (!concluida) {
      const pc = await tarefasPelaConta(sf, dominio, log);
      if (pc.conta) {
        const e2 = escolherTarefa(pc.tarefas);
        if (e2.concluida) { concluida = e2.concluida; via = `conta ${pc.conta.Name}, por ${pc.via}`; }
        for (const t of e2.abertas) if (!abertas.some((x) => x.Id === t.Id)) abertas.push(t);
      } else {
        log(`${dominio}: ${pc.motivo}.`, 'info');
      }
    }
    if (concluida) {
      r.situacao = 'publicado';
      r.fonte = 'salesforce';
      r.quando = formatarData(dataDaTarefa(concluida));
      r.detalhe = `tarefa "${concluida.Subject}" concluída em ${r.quando}${concluida.What && concluida.What.Name ? ' (' + concluida.What.Name + ')' : ''}; ${via}`;
      r.texto = `publicado em ${r.quando} (Salesforce: tarefa de publicação concluída)`;
      log(`${dominio}: ${r.texto}.`, 'success');
      return r;
    }
    if (abertas.length) {
      r.tarefaAberta = `tarefa de publicação aberta: "${abertas[0].Subject}" (${abertas[0].Status || 'aberta'}, criada em ${formatarData(abertas[0].CreatedDate)})`;
      log(`${dominio}: ${r.tarefaAberta}; procurando o commit no Bitbucket.`, 'info');
    } else {
      log(`${dominio}: nenhuma tarefa de publicação no Salesforce; procurando o commit no Bitbucket.`, 'info');
    }
  }

  if (bb) {
    log(`GET repositório ${dominio} (${bb.workspaces.join(', ')})`, 'cmd');
    const repo = await bb.acharRepo(dominio);
    if (!repo) {
      r.situacao = 'sem repositório';
      r.detalhe = `nenhum repositório "${dominio}" em ${bb.workspaces.join(', ')}` + (r.tarefaAberta ? `; ${r.tarefaAberta}` : '');
      r.texto = 'sem repositório';
      log(`${dominio}: ${r.detalhe}.`, 'warn');
      return r;
    }
    const caminhos = await bb.acharArquivos(repo, ARQUIVOS);
    const commits = [];
    for (const nome of ARQUIVOS) {
      if (!caminhos[nome]) continue;
      const lista = await bb.commitsDoArquivo(repo, caminhos[nome]);
      for (const c of lista || []) commits.push({ ...c, arquivo: c.arquivo || caminhos[nome] });
    }
    const c = escolherCommit(commits);
    if (c) {
      r.situacao = 'publicado';
      r.fonte = 'bitbucket';
      r.quando = formatarData(c.date);
      r.detalhe = `commit "${c.message}" em ${c.arquivo} (${repo.workspace}/${repo.repo} ${String(c.hash).slice(0, 7)}, ${commits.length} commit(s) nos arquivos)` + (r.tarefaAberta ? `; ${r.tarefaAberta}` : '');
      r.texto = `publicado em ${r.quando} (Bitbucket: commit em ${c.arquivo})`;
      log(`${dominio}: ${r.texto}.`, 'success');
      return r;
    }
    r.situacao = 'não encontrado';
    r.detalhe = `repositório ${repo.workspace}/${repo.repo} existe, ${Object.keys(caminhos).length ? 'mas sem commit em ' + Object.values(caminhos).join(' / ') : 'mas sem geral.php nem client.inc.php'}` + (r.tarefaAberta ? `; ${r.tarefaAberta}` : '');
    r.texto = 'não encontrado';
    log(`${dominio}: ${r.detalhe}.`, 'warn');
    return r;
  }

  r.situacao = 'não encontrado';
  r.detalhe = (sf ? 'sem tarefa de publicação concluída no Salesforce' : 'Salesforce fora') + '; Bitbucket não consultado' + (r.tarefaAberta ? `; ${r.tarefaAberta}` : '');
  r.texto = 'não encontrado';
  log(`${dominio}: ${r.detalhe}.`, 'warn');
  return r;
}

module.exports = { quandoPublicou, escolherTarefa, escolherCommit, formatarData, dataDaTarefa, criarBitbucket, tarefasPorDominio, tarefasPelaConta, ARQUIVOS, CAMPOS_TAREFA };
