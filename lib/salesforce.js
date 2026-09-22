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
function ehSessaoInvalida(status, corpo) {
  if (status !== 401) return false;
  const texto = JSON.stringify(corpo || '');
  return /INVALID_SESSION_ID|Session expired or invalid/i.test(texto);
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
            { status: res.statusCode, corpo: json, sessaoInvalida: ehSessaoInvalida(res.statusCode, json) }
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

module.exports = { criarSalesforce, idDoLink, ehIdDeCaso, escaparSoql, mascararSegredos, SalesforceErro, VERSAO_PADRAO };
