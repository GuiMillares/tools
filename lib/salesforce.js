// Cliente da API REST do Salesforce (ADR-086). Só o que a integração usa:
// consultar, descrever, criar (uma ou em lote), atualizar e comentar no feed
// com marcação de verdade.
//
// Recebe o `https` por injeção para o teste simular a rede sem tocar em nada,
// igual ao lib/cloudflare.js.
//
// Nada aqui sabe de Electron, de token guardado ou de renovação de sessão:
// recebe o endereço da instância e um access token já válido. Quem cuida da
// sessão é o main.js, que é quem tem onde guardar segredo.

const VERSAO_PADRAO = 'v61.0';

// O token só pode sair para a instância do próprio Salesforce. Se um dia uma
// resposta vier com outro endereço dentro, não é para seguir cegamente.
function hostPermitido(hostname) {
  return /(^|\.)salesforce\.com$/i.test(hostname) || /(^|\.)force\.com$/i.test(hostname);
}

function mensagemDeErro(status, corpo) {
  if (Array.isArray(corpo) && corpo.length) {
    return corpo
      .map((e) => `${e.errorCode ? e.errorCode + ': ' : ''}${e.message || ''}${e.fields && e.fields.length ? ` (campos: ${e.fields.join(', ')})` : ''}`)
      .join(' | ');
  }
  if (corpo && typeof corpo === 'object') {
    if (corpo.error_description || corpo.error) return `${corpo.error || ''}${corpo.error_description ? ': ' + corpo.error_description : ''}`;
    if (corpo.message) return String(corpo.message);
  }
  return `HTTP ${status}`;
}

// Sessão vencida tem tratamento próprio lá em cima: renova e tenta de novo.
// A API REST responde 401 INVALID_SESSION_ID; o /services/oauth2/userinfo,
// que é a primeira chamada de toda manhã (quem sou eu), responde **403
// Bad_OAuth_Token** para o mesmo token vencido — e o Hub tratava 403 como
// "reconecte", em vez de renovar (ADR-136). Os dois são sessão vencida.
function ehSessaoInvalida(status, corpo, caminho = '') {
  const texto = JSON.stringify(corpo || '');
  if (status === 401) return /INVALID_SESSION_ID|Session expired or invalid/i.test(texto);
  if (status === 403) return /Bad_OAuth_Token|INVALID_SESSION_ID/i.test(texto) || /\/services\/oauth2\/userinfo/i.test(String(caminho || ''));
  return false;
}

class SalesforceErro extends Error {
  constructor(mensagem, { status, corpo, sessaoInvalida } = {}) {
    super(mensagem);
    this.name = 'SalesforceErro';
    this.status = status;
    this.corpo = corpo;
    this.sessaoInvalida = !!sessaoInvalida;
  }
}

function criarSalesforce(instanceUrl, accessToken, { https = require('https'), versao = VERSAO_PADRAO } = {}) {
  if (!instanceUrl) throw new Error('Sem endereço da instância do Salesforce.');
  if (!accessToken) throw new Error('Sem token de acesso do Salesforce.');
  const base = String(instanceUrl).replace(/\/+$/, '');

  function chamar(metodo, caminho, corpo) {
    return new Promise((resolve, reject) => {
      let u;
      try { u = new URL(caminho.startsWith('http') ? caminho : base + caminho); } catch (e) { reject(new Error(`Caminho inválido: ${caminho}`)); return; }
      if (!hostPermitido(u.hostname)) { reject(new Error(`Host inesperado numa chamada ao Salesforce: ${u.hostname}`)); return; }

      const dados = corpo === undefined ? null : JSON.stringify(corpo);
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(dados ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dados) } : {}),
      };

      const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: metodo, headers }, (res) => {
        let txt = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { txt += c; });
        res.on('end', () => {
          let json = null;
          try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = { raw: txt.slice(0, 400) }; }
          if (res.statusCode >= 200 && res.statusCode < 300) { resolve(json); return; }
          reject(new SalesforceErro(
            `Salesforce ${metodo} ${u.pathname} respondeu ${res.statusCode}: ${mensagemDeErro(res.statusCode, json)}`,
            { status: res.statusCode, corpo: json, sessaoInvalida: ehSessaoInvalida(res.statusCode, json, u.pathname) }
          ));
        });
      });
      req.on('error', (e) => reject(new Error(`Falha de rede no Salesforce: ${e.message}`)));
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('O Salesforce não respondeu em 30s.')); });
      if (dados) req.write(dados);
      req.end();
    });
  }

  const dados = `/services/data/${versao}`;

  return {
    versao,
    instanceUrl: base,

    // Quem está conectado. Serve de teste de sessão: é a chamada mais barata.
    async identidade() {
      const r = await chamar('GET', '/services/oauth2/userinfo');
      return { id: r.user_id, nome: r.name, email: r.email, usuario: r.preferred_username, organizacao: r.organization_id };
    },

    // SOQL. Pagina sozinho: 2000 por vez é o teto do Salesforce.
    async consultar(soql, { maximo = 4000 } = {}) {
      let r = await chamar('GET', `${dados}/query?q=${encodeURIComponent(soql)}`);
      const registros = [...(r.records || [])];
      while (r.nextRecordsUrl && registros.length < maximo) {
        r = await chamar('GET', r.nextRecordsUrl);
        registros.push(...(r.records || []));
      }
      return registros;
    },

    // SOSL: a busca global, a mesma da barra de pesquisa do Salesforce. É a
    // única que enxerga texto longo, como os Comentários da tarefa, que o SOQL
    // não deixa filtrar (ADR-097).
    async buscar(sosl) {
      const r = await chamar('GET', `${dados}/search?q=${encodeURIComponent(sosl)}`);
      return (r && r.searchRecords) || [];
    },

    async descrever(objeto) {
      return chamar('GET', `${dados}/sobjects/${encodeURIComponent(objeto)}/describe`);
    },

    async ler(objeto, id, campos) {
      const q = campos && campos.length ? `?fields=${encodeURIComponent(campos.join(','))}` : '';
      return chamar('GET', `${dados}/sobjects/${encodeURIComponent(objeto)}/${encodeURIComponent(id)}${q}`);
    },

    async criar(objeto, campos) {
      return chamar('POST', `${dados}/sobjects/${encodeURIComponent(objeto)}`, campos);
    },

    // Até 200 de uma vez. allOrNone falso de propósito: uma linha ruim não
    // pode derrubar as outras 75, ela volta com o motivo dela.
    async criarVarios(objeto, registros) {
      if (!registros.length) return [];
      const saida = [];
      for (let i = 0; i < registros.length; i += 200) {
        const lote = registros.slice(i, i + 200).map((r) => ({ attributes: { type: objeto }, ...r }));
        const r = await chamar('POST', `${dados}/composite/sobjects`, { allOrNone: false, records: lote });
        saida.push(...(Array.isArray(r) ? r : []));
      }
      return saida;
    },

    async atualizar(objeto, id, campos) {
      await chamar('PATCH', `${dados}/sobjects/${encodeURIComponent(objeto)}/${encodeURIComponent(id)}`, campos);
      return { ok: true };
    },

    // Os itens do feed de um registro, para achar onde comentar.
    async itensDeFeed(parentId, { limite = 50 } = {}) {
      // O feed de um registro é a rota /chatter/feeds/record/{id}/feed-elements.
      // A rota /chatter/feed-elements sem 'q' pede termo de busca e responde
      // 400 MISSING_ARGUMENT (ADR-089).
      const r = await chamar('GET', `${dados}/chatter/feeds/record/${encodeURIComponent(parentId)}/feed-elements?pageSize=${limite}`);
      return r.elements || [];
    },

    // Acha um item no feed de um registro virando páginas até achar ou
    // esgotar. O feed de um caso pode ser longo e ter vários "Tarefa criada";
    // preciso da linha de UMA tarefa específica, então não basta a 1a página.
    async acharNoFeed(parentId, teste, { maxPaginas = 10, pageSize = 100 } = {}) {
      let caminho = `${dados}/chatter/feeds/record/${encodeURIComponent(parentId)}/feed-elements?pageSize=${pageSize}`;
      for (let p = 0; p < maxPaginas && caminho; p++) {
        const r = await chamar('GET', caminho);
        const achado = (r.elements || []).find(teste);
        if (achado) return achado;
        // O nextPageUrl vem relativo (/services/data/...), que o chamar aceita.
        caminho = r.nextPageUrl || null;
      }
      return null;
    },

    // Posta um item NOVO no feed de um registro, marcando alguém. É o plano B
    // de quando não achamos o item "Tarefa criada" para comentar embaixo dele.
    async postarNoFeed(parentId, userId, texto) {
      const messageSegments = [];
      if (userId) { messageSegments.push({ type: 'Mention', id: userId }); messageSegments.push({ type: 'Text', text: ' ' }); }
      messageSegments.push({ type: 'Text', text: String(texto || '') });
      return chamar('POST', `${dados}/chatter/feed-elements`, { feedElementType: 'FeedItem', subjectId: parentId, body: { messageSegments } });
    },

    // Comentário com marcação DE VERDADE: o @fulano só notifica quando vai
    // como segmento de menção com o Id da pessoa. Escrever "@Fulano" no texto
    // vira texto e não avisa ninguém (ADR-086).
    async comentarMarcando(feedElementId, userId, texto) {
      const messageSegments = [];
      if (userId) {
        messageSegments.push({ type: 'Mention', id: userId });
        messageSegments.push({ type: 'Text', text: ' ' });
      }
      messageSegments.push({ type: 'Text', text: String(texto || '') });
      return chamar('POST', `${dados}/chatter/feed-elements/${encodeURIComponent(feedElementId)}/capabilities/comments/items`, { body: { messageSegments } });
    },
  };
}

// Id do registro a partir de um link do Lightning, ou do próprio Id colado.
// Aceita /lightning/r/Task/00T.../view, /00T..., ?id=00T... e o Id puro.
// O prefixo de 3 letras do Id diz o objeto: Caso é 500, Tarefa 00T, Conta 001.
// Serve para recusar, na coluna "Link do caso", um link que não é de caso —
// senão a tarefa nasceria pendurada no lugar errado (ADR-090).
function ehIdDeCaso(id) {
  return /^500[a-zA-Z0-9]{12,15}$/.test(String(id || ''));
}

function idDoLink(entrada) {
  const texto = String(entrada || '').trim();
  if (!texto) return null;
  if (/^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(texto)) return texto;
  const m =
    texto.match(/\/lightning\/r\/[^/]+\/([a-zA-Z0-9]{15,18})/) ||
    texto.match(/[?&]id=([a-zA-Z0-9]{15,18})/) ||
    texto.match(/\/([a-zA-Z0-9]{15,18})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

// Aspas simples e barras invertidas quebram (ou abrem) uma SOQL montada por
// concatenação. Todo valor que vem de fora passa por aqui.
function escaparSoql(valor) {
  return String(valor ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// O campo Comentários das tarefas tem senha de hospedagem em texto puro. O
// terminal do Hub guarda tudo que imprime, então isso é mascarado antes de
// sair (ADR-086).
function mascararSegredos(texto) {
  return String(texto ?? '').replace(
    /((?:senha|password|pass|pwd|login|usuario|usuário|user)\s*[:=]\s*)(\S+)/gi,
    (_, rotulo, valor) => `${rotulo}${'*'.repeat(Math.min(valor.length, 8))}`
  );
}

// Caracteres reservados da SOSL escapados com barra (o hífen de um domínio,
// por exemplo, senão vira operador).
function escaparSosl(texto) {
  return String(texto || '').replace(/[?&|!{}[\]()^~*:\\"'+-]/g, (c) => `\\${c}`);
}

function limparDominio(d) {
  return String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
}

// O texto cita esse domínio? Casa "dominio.com.br", "www.dominio.com.br" e
// "https://dominio.com.br/", mas não "outrodominio.com.br" nem
// "dominio.com.brasil" — a busca global é aproximada e não serve de prova.
function textoTemDominio(texto, dominio) {
  const t = String(texto || '').toLowerCase();
  const d = limparDominio(dominio);
  if (!t || !d) return false;
  const esc = d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9-])${esc}(?=$|[^a-z0-9.-]|\\.(?![a-z0-9]))`).test(t);
}

// Para comparar rótulos ("Reunião de Nutrição" x "reuniao de nutricao").
function normalizarTexto(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const ASSUNTO_CASO_CS = 'Ongoing CS';

// O nome da empresa sem o tipo societário do fim: "ADIFER MATERIAIS DE
// CONSTRUCAO LTDA - ME" e "ADIFER MATERIAIS DE CONSTRUÇÃO LTDA" dão o mesmo
// "adifer materiais de construcao". Só serve para comparar (ADR-097).
const SUFIXOS_EMPRESA = new Set(['me', 'epp', 'eireli', 'mei', 'ltda', 'limitada', 'sa', 'ss', 'slu', 'cia']);
function nomeBaseEmpresa(s) {
  const palavras = normalizarTexto(s).replace(/\./g, '').replace(/\bs\s*\/\s*a\b/g, 'sa').replace(/[^a-z0-9& ]+/g, ' ').split(/\s+/).filter(Boolean);
  while (palavras.length > 1 && SUFIXOS_EMPRESA.has(palavras[palavras.length - 1])) palavras.pop();
  return palavras.join(' ');
}

// Acha o caso onde a tarefa "Publicação V1 -> V2" tem que nascer (ADR-097).
//
// A tarefa nova vai no caso ABERTO do tipo de registro "Ongoing CS" da conta
// do cliente ("Ongoing Growth" fica de fora), qualquer que seja o status; com
// mais de um aberto, desempata o status "Reunião de Nutrição". Sem nenhum, vai
// no caso da tarefa de publicação antiga (implantação/MPI+), para registrar.
//
// O que a tarefa antiga dá é a CONTA, pelo domínio, que é o dado confiável:
//   1. busca global pelo domínio; ficam as tarefas de "Publicação…" penduradas
//      num caso que citam o domínio no assunto OU nos comentários (as antigas
//      não têm o domínio no assunto); a conta desses casos é a do cliente.
//   2. sem tarefa antiga, a conta com a razão social exata como nome.
// Nada disso dando exatamente uma conta e um caso, devolve casoId nulo e o
// motivo: criar tarefa no caso errado é pior do que não criar.
async function acharCasoDaPublicacao(sf, { dominio, razao, statusCasoApi = null, statusCasoRotulo = '' } = {}, push = () => {}) {
  const dom = limparDominio(dominio);
  if (!dom) return { casoId: null, motivo: 'sem domínio' };
  const nome = String(razao || '').trim().replace(/\s+/g, ' ');

  // 1. A conta pela tarefa de publicação antiga.
  let tarefas = [];
  push(`SOSL tarefas com "${dom}" (assunto ou comentários)`, 'cmd');
  try {
    tarefas = await sf.buscar(`FIND {"${escaparSosl(dom)}"} IN ALL FIELDS RETURNING Task(Id, Subject, Description, WhatId, CreatedDate ORDER BY CreatedDate DESC LIMIT 100)`);
  } catch (e) {
    if (e && (e.sessaoInvalida || e.status === 403)) throw e;
    push(`A busca global falhou (${e.message}); vou pela razão social.`, 'warn');
  }
  const daPublicacao = tarefas.filter((t) =>
    /publica[çc][ãa]o/i.test(t.Subject || '') &&
    String(t.WhatId || '').startsWith('500') &&
    (textoTemDominio(t.Subject, dom) || textoTemDominio(t.Description, dom))
  );

  let conta = null;
  let pela = '';
  // O caso da tarefa de publicação mais recente dessa conta: é o plano B
  // quando a conta não tem Ongoing CS aberto (registrar em algum lugar vale
  // mais do que não registrar).
  let casoAntigo = null;
  const guardarCasoAntigo = (casosAntigos, contaId) => {
    const doCaso = new Map(casosAntigos.map((c) => [c.Id, c]));
    const t = daPublicacao.find((x) => doCaso.get(x.WhatId)?.AccountId === contaId);
    if (t) casoAntigo = doCaso.get(t.WhatId);
  };
  if (daPublicacao.length) {
    const ids = [...new Set(daPublicacao.map((t) => t.WhatId))];
    push(`SOQL conta dos casos das tarefas de publicação`, 'cmd');
    const casosAntigos = await sf.consultar(`SELECT Id, CaseNumber, Subject, IsClosed, AccountId, Account.Name FROM Case WHERE Id IN (${ids.map((i) => `'${escaparSoql(i)}'`).join(', ')})`);
    const contas = new Map();
    for (const c of casosAntigos) if (c.AccountId) contas.set(c.AccountId, c.Account?.Name || c.AccountId);
    if (contas.size === 1) {
      const [id, nomeConta] = [...contas.entries()][0];
      conta = { Id: id, Name: nomeConta };
      pela = `pela tarefa "${daPublicacao[0].Subject}"`;
      guardarCasoAntigo(casosAntigos, id);
      push(`A tarefa "${daPublicacao[0].Subject}" [${daPublicacao[0].Id}] é da conta ${nomeConta}.`, 'info');
      if (nome && normalizarTexto(nome) !== normalizarTexto(nomeConta)) push(`A razão social da planilha ("${nome}") não é igual ao nome da conta; fico com a conta da tarefa.`, 'warn');
    } else if (contas.size > 1) {
      const achadaPeloNome = nome ? [...contas.entries()].find(([, n]) => normalizarTexto(n) === normalizarTexto(nome)) : null;
      if (achadaPeloNome) {
        conta = { Id: achadaPeloNome[0], Name: achadaPeloNome[1] };
        pela = 'pela tarefa de publicação e pela razão social';
        guardarCasoAntigo(casosAntigos, achadaPeloNome[0]);
      } else {
        return { casoId: null, motivo: `as tarefas de publicação de ${dom} estão em ${contas.size} contas diferentes (${[...contas.values()].join(', ')})` };
      }
    }
  }

  // 2. Sem tarefa antiga: a conta pela razão social.
  if (!conta) {
    push(daPublicacao.length ? 'As tarefas de publicação não têm conta; vou pela razão social.' : `Nenhuma tarefa de publicação cita ${dom}; vou pela razão social.`, 'info');
    if (!nome) return { casoId: null, motivo: 'nenhuma tarefa de publicação com o domínio, e sem razão social na planilha' };
    push(`SOQL conta "${nome}"`, 'cmd');
    let contas = await sf.consultar(`SELECT Id, Name FROM Account WHERE Name = '${escaparSoql(nome)}' LIMIT 5`);
    pela = 'pela razão social';
    if (!contas.length) {
      // O nome da conta pode ter o tipo societário diferente ("… LTDA - ME")
      // ou acento que a planilha não tem. Busca pelo nome sem o sufixo e fica
      // com a conta cujo nome, sem sufixo e sem acento, é o mesmo.
      const base = nomeBaseEmpresa(nome);
      const termo = String(nome).replace(/\s*[-–]?\s*\b(ME|EPP|EIRELI|MEI|LTDA|LIMITADA|S\/?A|SS|SLU)\b\.?\s*$/i, '').replace(/\s*[-–]?\s*\b(ME|EPP|EIRELI|MEI|LTDA|LIMITADA|S\/?A|SS|SLU)\b\.?\s*$/i, '').trim() || nome;
      push(`Nenhuma conta com o nome exato; SOSL contas parecidas com "${termo}"`, 'cmd');
      let achadas = [];
      const buscarContas = async (q, limite) => {
        try {
          return await sf.buscar(`FIND {${q}} IN NAME FIELDS RETURNING Account(Id, Name LIMIT ${limite})`);
        } catch (e) {
          if (e && (e.sessaoInvalida || e.status === 403)) throw e;
          push(`A busca de contas parecidas falhou (${e.message}).`, 'warn');
          return [];
        }
      };
      achadas = await buscarContas(`"${escaparSosl(termo)}"`, 20);
      contas = achadas.filter((c) => nomeBaseEmpresa(c.Name) === base);
      if (!contas.length) {
        // A frase inteira pode não bater por acento; a palavra mais longa do
        // nome traz a conta, e a comparação sem acento decide.
        const chave = base.split(' ').filter((w) => !/^\d+$/.test(w)).sort((x, y) => y.length - x.length)[0];
        if (chave && chave.length >= 4) {
          push(`SOSL contas com "${chave}"`, 'cmd');
          const mais = await buscarContas(escaparSosl(chave), 100);
          achadas = [...achadas, ...mais.filter((m) => !achadas.some((x) => x.Id === m.Id))];
          contas = achadas.filter((c) => nomeBaseEmpresa(c.Name) === base);
        }
      }
      if (contas.length === 1) {
        push(`A conta é "${contas[0].Name}" (o nome da planilha é "${nome}"; muda só o tipo da empresa ou o acento).`, 'warn');
        pela = `pela razão social (conta "${contas[0].Name}")`;
      }
      if (!contas.length) {
        const parecidas = achadas.slice(0, 5).map((c) => `"${c.Name}"`).join(', ');
        return { casoId: null, motivo: `nenhuma tarefa de publicação com o domínio e nenhuma conta chamada "${nome}"${parecidas ? ` (parecidas, mas com outro nome: ${parecidas})` : ''}` };
      }
    }
    if (contas.length > 1) return { casoId: null, motivo: `${contas.length} contas chamadas "${nome}": ${contas.map((c) => `"${c.Name}"`).join(', ')}` };
    conta = contas[0];
  }

  // 3. O caso da operação nessa conta; sem ele, o caso da publicação antiga.
  // O caso da operação é o ABERTO do tipo de registro "Ongoing CS". O assunto
  // não serve (às vezes vazio: LMARQUES, 00085674) e o status anda com o
  // cliente ("Kickoff/Selling Class", "Reunião de Nutrição"…: TURBO GERAIS,
  // 00087546). Só havendo mais de um aberto o status "Reunião de Nutrição"
  // desempata (ADR-097).
  push(`SOQL casos da conta ${conta.Name}`, 'cmd');
  let casos;
  let semTipo = false;
  try {
    casos = await sf.consultar(`SELECT Id, CaseNumber, Subject, Status, IsClosed, RecordType.Name, RecordType.DeveloperName FROM Case WHERE AccountId = '${escaparSoql(conta.Id)}' ORDER BY CreatedDate DESC LIMIT 100`);
  } catch (e) {
    if (e && (e.sessaoInvalida || e.status === 403)) throw e;
    // Org sem tipo de registro no Caso: vale o assunto "Ongoing CS" ou o status.
    semTipo = true;
    casos = await sf.consultar(`SELECT Id, CaseNumber, Subject, Status, IsClosed FROM Case WHERE AccountId = '${escaparSoql(conta.Id)}' ORDER BY CreatedDate DESC LIMIT 100`);
  }
  const rotulo = statusCasoRotulo || statusCasoApi || 'Reunião de Nutrição';
  const tipo = (c) => normalizarTexto(String(c.RecordType?.Name || c.RecordType?.DeveloperName || '').replace(/_/g, ' '));
  const alvoCs = normalizarTexto(ASSUNTO_CASO_CS);
  const noStatus = (c) => (statusCasoApi && c.Status === statusCasoApi) || normalizarTexto(c.Status) === normalizarTexto(rotulo);
  const ehCs = (c) => (semTipo
    ? (normalizarTexto(c.Subject).includes(alvoCs) || noStatus(c)) && !/growth/.test(normalizarTexto(c.Subject))
    : tipo(c) === alvoCs);
  const abertosCs = casos.filter((c) => !c.IsClosed && ehCs(c));
  let escolhido = null;
  let porque = '';
  if (abertosCs.length === 1) {
    escolhido = abertosCs[0];
    porque = `${ASSUNTO_CASO_CS} aberto, em "${escolhido.Status || '?'}"`;
  } else if (abertosCs.length > 1) {
    const noRotulo = abertosCs.filter(noStatus);
    if (noRotulo.length === 1) {
      escolhido = noRotulo[0];
      porque = `${ASSUNTO_CASO_CS} em "${rotulo}", entre ${abertosCs.length} abertos`;
    }
  }
  if (escolhido) {
    return { casoId: escolhido.Id, conta: conta.Name, como: `${pela} → conta ${conta.Name} → caso ${escolhido.CaseNumber || escolhido.Id} (${porque})` };
  }
  const motivo = abertosCs.length > 1
    ? `${abertosCs.length} casos ${ASSUNTO_CASO_CS} abertos na conta e nenhum (ou mais de um) em "${rotulo}" para desempatar`
    : `nenhum caso ${ASSUNTO_CASO_CS} aberto na conta`;

  if (casoAntigo) {
    push(`${conta.Name}: ${motivo}. Registro no caso da publicação antiga, ${casoAntigo.CaseNumber || casoAntigo.Id}.`, 'warn');
    return {
      casoId: casoAntigo.Id,
      conta: conta.Name,
      casoDaPublicacaoAntiga: true,
      como: `${pela} → conta ${conta.Name} → ${motivo}, então no caso da publicação antiga ${casoAntigo.CaseNumber || ''} "${casoAntigo.Subject || ''}"${casoAntigo.IsClosed ? ' (fechado)' : ''}`.replace(/\s+"/, ' "'),
    };
  }
  return { casoId: null, motivo: `${motivo} (conta "${conta.Name}"), e não há tarefa de publicação antiga para usar o caso dela` };
}

// ----- Checador de Ouvidoria / SSL (ADR-111) -----
//
// Recebe só domínios. Acha a conta pelo domínio (o passo 1 do ADR-097, a
// tarefa de publicação que cita o domínio), sem razão social: uma conta => ela;
// nenhuma ou várias => não achou, para revisão manual.
// Acha a conta do cliente pelo domínio, com CONFIANÇA GRADUADA (ADR-117).
// Validado ao vivo: para muitos sites antigos o domínio não está ligado à conta
// de forma confiável (não está no Website nem no assunto do caso; quando aparece
// em tarefa, costuma ser e-mail solto de OUTRA conta). Então só resolve com um
// sinal forte e uma única conta; senão devolve para revisão, em vez de chutar a
// conta errada. Do mais forte ao mais fraco:
//   0. razão social exata (quando a planilha traz o nome).
//   1. Website da conta contém o domínio.
//   2. Caso cujo assunto cita o domínio → a conta dele.
//   3. Contato com e-mail @domínio, fora prospecção → a conta dele.
//   4. Tarefa "Publicação…" ligada a um caso que cita o domínio → a conta.
async function contasDeIds(sf, ids) {
  const mapa = new Map();
  if (!ids || !ids.length) return mapa;
  const contas = await sf.consultar(`SELECT Id, Name FROM Account WHERE Id IN (${ids.map((i) => `'${escaparSoql(i)}'`).join(', ')})`);
  for (const c of contas) mapa.set(c.Id, c.Name);
  return mapa;
}

async function acharContaPorDominio(sf, dominio, push = () => {}, { razao = '' } = {}) {
  const dom = limparDominio(dominio);
  if (!dom) return { conta: null, motivo: 'domínio inválido' };

  const resolver = (mapa, via) => {
    if (mapa.size === 1) { const [id, n] = [...mapa.entries()][0]; return { conta: { Id: id, Name: n }, via }; }
    if (mapa.size > 1) return { conta: null, ambiguo: true, motivo: `${via}: o domínio casou com ${mapa.size} contas (${[...mapa.values()].join(', ')})` };
    return null;
  };

  // Tier 0: razão social, quando veio na planilha (o sinal mais confiável).
  if (razao && String(razao).trim()) {
    push(`SOSL conta pela razão social "${razao}"`, 'cmd');
    try {
      const base = nomeBaseEmpresa(razao);
      const achadas = await sf.buscar(`FIND {"${escaparSosl(String(razao).trim())}"} IN NAME FIELDS RETURNING Account(Id, Name LIMIT 20)`);
      const exatas = achadas.filter((a) => nomeBaseEmpresa(a.Name) === base);
      const cand = exatas.length ? exatas : achadas;
      const mapa = new Map(cand.map((a) => [a.Id, a.Name]));
      const r0 = resolver(mapa, 'razão social');
      if (r0) return r0;
    } catch (e) { if (e && (e.sessaoInvalida || e.status === 403)) throw e; }
  }

  // Uma busca global só, trazendo os quatro objetos.
  let achados = [];
  push(`SOSL "${dom}" (conta, caso, contato, tarefa)`, 'cmd');
  try {
    achados = await sf.buscar(`FIND {"${escaparSosl(dom)}"} IN ALL FIELDS RETURNING Account(Id, Name, Website), Case(Id, AccountId, Subject), Contact(Id, AccountId, Email, Name, LeadSource), Task(Id, Subject, Description, WhatId, CreatedDate ORDER BY CreatedDate DESC LIMIT 100)`);
  } catch (e) {
    if (e && (e.sessaoInvalida || e.status === 403)) throw e;
    return { conta: null, motivo: `a busca no Salesforce falhou (${e.message})` };
  }
  const tipo = (r) => (r && r.attributes && r.attributes.type) || '';
  const contasSF = achados.filter((r) => tipo(r) === 'Account');
  const casos = achados.filter((r) => tipo(r) === 'Case');
  const contatos = achados.filter((r) => tipo(r) === 'Contact');
  const tarefas = achados.filter((r) => tipo(r) === 'Task');

  // Tier 1: Website da conta contém o domínio.
  const porWebsite = new Map();
  for (const a of contasSF) if (textoTemDominio(a.Website, dom)) porWebsite.set(a.Id, a.Name);
  let r = resolver(porWebsite, 'Website da conta');
  if (r) return r;

  // Tier 2: caso cujo assunto cita o domínio.
  const idsCaso = casos.filter((c) => c.AccountId && textoTemDominio(c.Subject, dom)).map((c) => c.AccountId);
  r = resolver(await contasDeIds(sf, [...new Set(idsCaso)]), 'caso com o domínio no assunto');
  if (r) return r;

  // Tier 3: contato com e-mail @domínio, fora prospecção (cold e-mailing/lead).
  const ehProspec = (c) => /cold|prospec|lead/i.test(`${c.LeadSource || ''} ${c.Name || ''}`);
  const escDom = dom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reEmail = new RegExp(`@${escDom}$`, 'i');
  const idsCt = contatos.filter((c) => c.AccountId && !ehProspec(c) && reEmail.test(String(c.Email || ''))).map((c) => c.AccountId);
  r = resolver(await contasDeIds(sf, [...new Set(idsCt)]), 'contato com e-mail do domínio');
  if (r) return r;

  // Tier 4: tarefa de "Publicação…" ligada a um caso que cita o domínio.
  const daPublicacao = tarefas.filter((t) =>
    /publica[çc][ãa]o/i.test(t.Subject || '') &&
    String(t.WhatId || '').startsWith('500') &&
    (textoTemDominio(t.Subject, dom) || textoTemDominio(t.Description, dom))
  );
  const idsPub = [...new Set(daPublicacao.map((t) => t.WhatId))];
  if (idsPub.length) {
    const casosPub = await sf.consultar(`SELECT Id, AccountId, Account.Name FROM Case WHERE Id IN (${idsPub.map((i) => `'${escaparSoql(i)}'`).join(', ')})`);
    const mapa = new Map();
    for (const c of casosPub) if (c.AccountId) mapa.set(c.AccountId, c.Account?.Name || c.AccountId);
    r = resolver(mapa, 'tarefa de publicação');
    if (r) return r;
  }

  return { conta: null, motivo: 'o domínio não está ligado a uma conta no Salesforce (nem Website, nem assunto de caso, nem contato, nem tarefa de publicação)' };
}

// O nome interno (API) de um campo pelo seu rótulo na tela, a partir do
// describe. Assim o tool acha "Definição" e "Data de Conclusão" sem eu chutar
// o nome (que é gerado pelo Salesforce e varia).
function acharCampoPorRotulo(descricao, rotulo) {
  const alvo = normalizarTexto(rotulo);
  const f = (descricao.fields || []).find((x) => normalizarTexto(x.label) === alvo);
  return f ? f.name : null;
}

// Salesforce devolve data como "2026-08-05"; vira 05/08/2026.
function formatarDataBr(valor) {
  const m = String(valor || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valor || '');
}

// Dado os casos da conta e os nomes dos campos, separa os de Ouvidoria e decide
// a Situação e o Ativar SSL. Cancelado ou Jurídico => não ativar (ADR-111).
function avaliarOuvidoria(casos, { campoDef, campoData }) {
  const ehOuvidoria = (c) => /ouvidoria/.test(normalizarTexto(c.RecordType?.Name || c.RecordType?.DeveloperName || ''));
  const ouv = (casos || []).filter(ehOuvidoria);
  if (!ouv.length) return { temOuvidoria: false, situacao: 'sem caso de ouvidoria', ativarSsl: 'sim' };
  const partes = [];
  let bloqueia = false;
  for (const c of ouv) {
    const def = campoDef ? c[campoDef] : '';
    const data = campoData ? c[campoData] : '';
    const defN = normalizarTexto(def);
    if (defN === 'cancelado' || defN === 'juridico') bloqueia = true;
    partes.push(`${def || '(sem definição)'}${data ? ' — ' + formatarDataBr(data) : ''}${c.CaseNumber ? ' [' + c.CaseNumber + ']' : ''}`);
  }
  return { temOuvidoria: true, situacao: partes.join(' | '), ativarSsl: bloqueia ? 'não' : 'sim' };
}

module.exports = { criarSalesforce, idDoLink, ehIdDeCaso, escaparSoql, escaparSosl, textoTemDominio, normalizarTexto, nomeBaseEmpresa, acharCasoDaPublicacao, acharContaPorDominio, acharCampoPorRotulo, formatarDataBr, avaliarOuvidoria, ASSUNTO_CASO_CS, mascararSegredos, SalesforceErro, VERSAO_PADRAO };
