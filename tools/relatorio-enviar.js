// Envia a planilha do Relatório preenchida por e-mail, pela sessão Microsoft
// do Hub (Graph /me/sendMail, Mail.Send), com o .xlsx anexado. Só o que o
// usuário pediu em 09/10/2026: um e-mail, no nome dele, para um destinatário.
//
//     npx electron tools/relatorio-enviar.js --para alex@empresa.com.br --para outro@x.com --nome "Alex" --arquivo "C:\...\planilha.xlsx" --resumo "..."
//
// Precisa do Electron (o token está cifrado com o safeStorage). Anexo inline
// até 3,5 MB; acima disso, usa a sessão de upload do Graph (rascunho + upload
// em pedaços + envio).

const path = require('path');
const fs = require('fs');
const https = require('https');
const { app, safeStorage } = require('electron');

const args = process.argv.slice(2);
const opt = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : ''; };
app.setPath('userData', path.join(app.getPath('appData'), 'pr-merge-tool'));
const userData = () => app.getPath('userData');
const lerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch (e) { return null; } };
const lerCifrado = (f) => { try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(f))); } catch (e) { return null; } };

function pedir(method, url, { headers = {}, body, form, raw } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    let corpo = null;
    const h = { Accept: 'application/json', ...headers };
    if (form) { corpo = new URLSearchParams(form).toString(); h['Content-Type'] = 'application/x-www-form-urlencoded'; }
    else if (raw) { corpo = raw; }
    else if (body !== undefined) { corpo = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    if (corpo !== null) h['Content-Length'] = Buffer.byteLength(corpo);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers: h }, (res) => {
      let t = ''; res.setEncoding('utf8'); res.on('data', (c) => { t += c; });
      res.on('end', () => { let j = null; try { j = t ? JSON.parse(t) : {}; } catch (e) { j = { raw: t.slice(0, 300) }; } resolve({ status: res.statusCode, body: j, headers: res.headers }); });
    });
    req.on('error', reject); req.setTimeout(120000, () => { req.destroy(); reject(new Error('Graph não respondeu em 120s')); });
    if (corpo !== null) req.write(corpo); req.end();
  });
}

app.whenReady().then(async () => {
  const paraLista = args.map((a, i) => (a === '--para' ? args[i + 1] : null)).filter(Boolean).flatMap((s) => s.split(/[,;]+/)).map((s) => s.trim()).filter(Boolean);
  const para = paraLista[0] || '';
  const nome = opt('--nome') || para;
  const arquivo = opt('--arquivo');
  const resumo = opt('--resumo') || '';
  if (!para || !arquivo || !fs.existsSync(arquivo)) { console.error('Uso: --para <e-mail> --arquivo <xlsx> [--nome ...] [--resumo ...]'); app.exit(1); return; }

  const msCfg = lerJson(path.join(userData(), 'ms-config.json')) || {};
  const tokenPath = path.join(userData(), 'ms-token.enc');
  let token = lerCifrado(tokenPath);
  if (!msCfg.clientId || !token || !token.access_token) { console.error('Sem sessão da Microsoft no Hub.'); app.exit(1); return; }
  if (!(token.expiresAt && token.expiresAt > Date.now())) {
    const r = await pedir('POST', `https://login.microsoftonline.com/${msCfg.tenant || 'common'}/oauth2/v2.0/token`, { form: { client_id: msCfg.clientId, grant_type: 'refresh_token', refresh_token: token.refresh_token, scope: 'openid profile offline_access User.Read Mail.Send Files.ReadWrite' } });
    if (r.status !== 200 || !r.body.access_token) { console.error(`Não renovei a sessão da Microsoft (${r.status}): ${JSON.stringify(r.body).slice(0, 200)}`); app.exit(1); return; }
    token = { ...token, ...r.body, refresh_token: r.body.refresh_token || token.refresh_token, expiresAt: Date.now() + ((r.body.expires_in || 3600) - 60) * 1000 };
    try { fs.writeFileSync(tokenPath, safeStorage.encryptString(JSON.stringify(token))); } catch (e) { /* vale só agora */ }
  }
  const auth = { Authorization: `Bearer ${token.access_token}` };
  const eu = await pedir('GET', 'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', { headers: auth });
  const remetente = eu.status === 200 ? `${eu.body.displayName} <${eu.body.mail || eu.body.userPrincipalName}>` : '(não li quem sou)';
  console.log(`Remetente: ${remetente}`);

  const bytes = fs.readFileSync(arquivo);
  const nomeArquivo = path.basename(arquivo);
  const assunto = 'Planilha Domínios e Analytics preenchida';
  const texto = [
    `Olá, ${nome.split(' ')[0]}.`,
    '',
    'Segue a planilha "Domínios e Analytics" com as abas Busca e MPI preenchidas (Salesforce, site e Google), mais as abas Diagnóstico e Pendências com a origem de cada dado e o que faltou.',
    resumo ? '' : null,
    resumo || null,
    '',
    'Abraço,',
    eu.status === 200 ? eu.body.displayName : '',
  ].filter((l) => l !== null).join('\n');
  const mensagem = { subject: assunto, body: { contentType: 'Text', content: texto }, toRecipients: paraLista.map((address, i) => ({ emailAddress: i === 0 ? { address, name: nome } : { address } })) };

  const LIMITE_INLINE = 3.5 * 1024 * 1024;
  if (bytes.length <= LIMITE_INLINE) {
    mensagem.attachments = [{ '@odata.type': '#microsoft.graph.fileAttachment', name: nomeArquivo, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBytes: bytes.toString('base64') }];
    const r = await pedir('POST', 'https://graph.microsoft.com/v1.0/me/sendMail', { headers: auth, body: { message: mensagem, saveToSentItems: true } });
    if (r.status !== 202) { console.error(`sendMail respondeu ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`); app.exit(1); return; }
    console.log(`Enviado para ${paraLista.join(", ")} (${nomeArquivo}, ${Math.round(bytes.length / 1024)} KB, anexo inline).`);
    app.exit(0); return;
  }

  // Anexo grande: rascunho, sessão de upload em pedaços, envio.
  const d = await pedir('POST', 'https://graph.microsoft.com/v1.0/me/messages', { headers: auth, body: mensagem });
  if (d.status !== 201) { console.error(`rascunho: ${d.status} ${JSON.stringify(d.body).slice(0, 300)}`); app.exit(1); return; }
  const id = d.body.id;
  const s = await pedir('POST', `https://graph.microsoft.com/v1.0/me/messages/${id}/attachments/createUploadSession`, { headers: auth, body: { AttachmentItem: { attachmentType: 'file', name: nomeArquivo, size: bytes.length } } });
  if (s.status !== 201 || !s.body.uploadUrl) { console.error(`upload session: ${s.status} ${JSON.stringify(s.body).slice(0, 300)}`); app.exit(1); return; }
  const PEDACO = 3 * 1024 * 1024;
  for (let ini = 0; ini < bytes.length; ini += PEDACO) {
    const fim = Math.min(ini + PEDACO, bytes.length);
    const parte = bytes.subarray(ini, fim);
    const u = new URL(s.body.uploadUrl);
    const r = await new Promise((resolve, reject) => {
      const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': parte.length, 'Content-Range': `bytes ${ini}-${fim - 1}/${bytes.length}` } }, (res) => { let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, text: t })); });
      req.on('error', reject); req.write(parte); req.end();
    });
    if (![200, 201, 202].includes(r.status)) { console.error(`upload ${ini}-${fim}: ${r.status} ${r.text.slice(0, 200)}`); app.exit(1); return; }
  }
  const env = await pedir('POST', `https://graph.microsoft.com/v1.0/me/messages/${id}/send`, { headers: auth, raw: '' });
  if (env.status !== 202) { console.error(`send: ${env.status} ${JSON.stringify(env.body).slice(0, 300)}`); app.exit(1); return; }
  console.log(`Enviado para ${paraLista.join(", ")} (${nomeArquivo}, ${Math.round(bytes.length / 1024)} KB, por sessão de upload).`);
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
