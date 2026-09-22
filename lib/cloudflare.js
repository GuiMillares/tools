// Cliente mínimo da API v4 da Cloudflare (ADR-058). Só o que a publicação usa:
// achar ou criar a zona, listar e escrever registros, ler os nameservers.
//
// Recebe o `https` por injeção para o teste simular a rede sem tocar em nada.

const API = 'api.cloudflare.com';

function criarCloudflare(token, { https = require('https') } = {}) {
  if (!token) throw new Error('Sem token da Cloudflare.');

  function chamar(metodo, caminho, corpo) {
    return new Promise((resolve, reject) => {
      const dados = corpo ? JSON.stringify(corpo) : null;
      const req = https.request(
        {
          hostname: API,
          path: `/client/v4${caminho}`,
          method: metodo,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(dados ? { 'Content-Length': Buffer.byteLength(dados) } : {}),
          },
        },
        (res) => {
          let txt = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { txt += c; });
          res.on('end', () => {
            let json = {};
            try { json = JSON.parse(txt || '{}'); } catch (e) { json = {}; }
            if (res.statusCode >= 200 && res.statusCode < 300 && json.success !== false) {
              resolve(json);
              return;
            }
            const erros = (json.errors || []).map((e) => `${e.code ? e.code + ': ' : ''}${e.message}`).join('; ');
            const e = new Error(`Cloudflare ${metodo} ${caminho} respondeu ${res.statusCode}${erros ? ': ' + erros : ''}`);
            e.status = res.statusCode;
            e.cloudflare = json.errors || [];
            reject(e);
          });
        }
      );
      req.on('error', (e) => reject(new Error(`Falha de rede na Cloudflare: ${e.message}`)));
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Cloudflare não respondeu em 30s.')); });
      if (dados) req.write(dados);
      req.end();
    });
  }

  return {
    // Prova que o token vale e diz o que ele alcança.
    async verificarToken() {
      const r = await chamar('GET', '/user/tokens/verify');
      return r.result || {};
    },
    async contas() {
      const r = await chamar('GET', '/accounts?per_page=50');
      return r.result || [];
    },
    async acharZona(nome) {
      const r = await chamar('GET', `/zones?name=${encodeURIComponent(nome)}&per_page=5`);
      return (r.result || [])[0] || null;
    },
    async criarZona(nome, accountId) {
      const corpo = { name: nome, type: 'full' };
      if (accountId) corpo.account = { id: accountId };
      const r = await chamar('POST', '/zones', corpo);
      return r.result;
    },
    async listarRegistros(zoneId) {
      const todos = [];
      let pagina = 1;
      for (;;) {
        const r = await chamar('GET', `/zones/${zoneId}/dns_records?per_page=100&page=${pagina}`);
        todos.push(...(r.result || []));
        const info = r.result_info || {};
        if (!info.total_pages || pagina >= info.total_pages) break;
        pagina++;
      }
      return todos;
    },
    async criarRegistro(zoneId, reg) {
      const r = await chamar('POST', `/zones/${zoneId}/dns_records`, corpoRegistro(reg));
      return r.result;
    },
    async atualizarRegistro(zoneId, id, reg) {
      const r = await chamar('PUT', `/zones/${zoneId}/dns_records/${id}`, corpoRegistro(reg));
      return r.result;
    },
    async apagarRegistro(zoneId, id) {
      const r = await chamar('DELETE', `/zones/${zoneId}/dns_records/${id}`);
      return r.result;
    },
    // O scan da própria Cloudflare: ela pergunta pelos registros comuns do
    // domínio e já grava o que achar na zona. É o mesmo que o painel dela faz
    // ao adicionar um site (ADR-071). Devolve quantos entraram.
    async escanearRegistros(zoneId) {
      const r = await chamar('POST', `/zones/${zoneId}/dns_records/scan`, {});
      const res = r.result || {};
      return Number(res.recs_added ?? res.total_records_parsed ?? 0);
    },
    async zona(zoneId) {
      const r = await chamar('GET', `/zones/${zoneId}`);
      return r.result;
    },
  };
}

function corpoRegistro(reg) {
  const corpo = {
    type: reg.type,
    name: reg.name,
    content: reg.content,
    ttl: reg.ttl && reg.ttl > 0 ? reg.ttl : 1,
    proxied: false,
  };
  if (reg.type === 'MX' || reg.type === 'SRV') corpo.priority = Number(reg.priority ?? 10);
  // Só A, AAAA e CNAME podem ter proxy; nos outros o campo nem existe. Nos
  // três vai false explícito: a regra é DNS puro, sem a Cloudflare no meio.
  if (!['A', 'AAAA', 'CNAME'].includes(reg.type)) delete corpo.proxied;
  return corpo;
}

module.exports = { criarCloudflare, corpoRegistro };
