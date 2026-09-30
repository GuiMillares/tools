// ADR-101: a ativação do SSL de produção é decidida pelo certificado que o
// domínio entrega, não pela resposta do painel (que costuma dar 504 e ativar
// mesmo assim). Recorta do main.js e roda com o painel e o certificado simulados.
//
//     node tools/test-ssl-painel.js

const fs = require('fs');
const path = require('path');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const recorta = (a, b) => { const i = main.indexOf(a); const f = main.indexOf(b, i); if (i < 0 || f < 0) throw new Error('não achei ' + a); return main.slice(i, f); };

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const PAGINA_504 = '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN"> <html><head> <title>504 Gateway Timeout</title> </head><body> <h1>Gateway Timeout</h1> <p>The gateway did not receive a timely response from the upstream server or application.</p> </body></html>';
const CERT_SERVIDOR = { ok: false, erro: 'o certificado é de srv-wp-02.idealplus.idealtrends.io', nomes: ['srv-wp-02.idealplus.idealtrends.io'] };
const CERT_OK = { ok: true, emissor: "Let's Encrypt", ate: 'Dec 22 2026', nomes: ['srengenharia.seg.br', 'www.srengenharia.seg.br'] };

// certs: o que o domínio entrega a cada conferência; painel: o que o script devolve (ou lança).
function montar({ certs, painel }) {
  const corpo = `
    const JS_PUBLICACAO = '';
    let conferencias = 0;
    const certificadoDoDominio = async () => { const c = certs[Math.min(conferencias, certs.length - 1)]; conferencias++; return c; };
    const dormir = async () => {};
    const rodarNoPainel = async () => { if (painel instanceof Error) throw painel; return painel; };
    ${recorta('async function esperarCertificado(', '\n// Ativar o SSL de produção.')}
    ${recorta('async function painelAtivarSsl(', "\nhandleNoPainel('painel:publicar'")}
    return { painelAtivarSsl, get conferencias() { return conferencias; } };`;
  return new Function('certs', 'painel', corpo)(certs, painel);
}

(async () => {
  console.log('\n=== O painel responde 504 e ativa mesmo assim ===');
  {
    const log = [];
    const m = montar({ certs: [CERT_SERVIDOR, CERT_SERVIDOR, CERT_OK], painel: { ok: true, estado: { sslAtivo: false }, painelErro: PAGINA_504 } });
    const e = await m.painelAtivarSsl(null, (msg, t) => log.push({ msg, t }), 'srengenharia.seg.br');
    check('dá o SSL como ativo pelo certificado', e.sslAtivo === true && e.certificado.ok, JSON.stringify(e));
    check('mostra o erro do painel resumido, sem o HTML', log.some((l) => /respondeu erro ao ativar o SSL \(504 Gateway Timeout\)/.test(l.msg)) && !log.some((l) => /<html>/i.test(l.msg)), JSON.stringify(log));
    check('diz que o erro foi só na resposta', log.some((l) => l.t === 'success' && /O erro do painel foi só na resposta/.test(l.msg)));
    check('conferiu antes, e depois até aparecer', m.conferencias === 3, String(m.conferencias));
  }

  console.log('\n=== O painel lança exceção (a janela travou, por exemplo) ===');
  {
    const m = montar({ certs: [CERT_SERVIDOR, CERT_OK], painel: new Error('a janela oculta não respondeu em 180s') });
    const e = await m.painelAtivarSsl(null, () => {}, 'srengenharia.seg.br');
    check('confere o certificado mesmo assim', e.sslAtivo === true);
  }

  console.log('\n=== SSL já ativo: nem chama o painel ===');
  {
    let chamou = false;
    const m = montar({ certs: [CERT_OK], painel: { get ok() { chamou = true; return true; } } });
    const e = await m.painelAtivarSsl(null, () => {}, 'srengenharia.seg.br');
    check('já estava', e.jaEstava === true && e.sslAtivo === true && !chamou);
  }

  console.log('\n=== Não ativou de verdade: falha dizendo o que o domínio entrega ===');
  {
    const m = montar({ certs: [CERT_SERVIDOR], painel: { ok: true, estado: {}, painelErro: PAGINA_504 } });
    let erro = null;
    try { await m.painelAtivarSsl(null, () => {}, 'srengenharia.seg.br'); } catch (e) { erro = e.message; }
    check('falha', /o SSL não ficou ativo: srengenharia\.seg\.br ainda entrega o certificado é de srv-wp-02/.test(erro || ''), erro);
    check('e cita a resposta do painel', /504 Gateway Timeout/.test(erro || ''), erro);
  }

  console.log('\n=== O painel diz que ativou, mas o certificado demora ===');
  {
    const m = montar({ certs: [CERT_SERVIDOR, CERT_SERVIDOR, CERT_SERVIDOR, CERT_OK], painel: { ok: true, estado: { sslAtivo: true }, painelErro: null } });
    const e = await m.painelAtivarSsl(null, () => {}, 'srengenharia.seg.br');
    check('espera o certificado aparecer', e.sslAtivo === true && m.conferencias === 4, String(m.conferencias));
  }

  console.log('\n=== certificadoDoDominio contra um servidor TLS de verdade ===');
  {
    const { execFileSync } = require('child_process');
    const os = require('os');
    const tls = require('tls');
    let temOpenssl = true;
    let chaves = null;
    // A chave e o certificado só ficam em disco até serem lidos (o servidor usa
    // a cópia em memória), e o finally apaga a pasta mesmo que algo lance.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-tls-'));
    try {
      try {
        execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=srv-wp-02.idealplus.idealtrends.io', '-addext', 'subjectAltName=DNS:srv-wp-02.idealplus.idealtrends.io'], { stdio: 'ignore' });
      } catch (e) { temOpenssl = false; }
      if (temOpenssl) chaves = { key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    if (!temOpenssl) {
      console.log('  (sem openssl nesta máquina: pulei o servidor de verdade)');
    } else {
      const srv = tls.createServer(chaves, (s) => s.end());
      await new Promise((r) => srv.listen(0, '127.0.0.1', r));
      const porta = srv.address().port;
      // O mesmo código, apontado para a porta local.
      const f = new Function('tls', `${recorta('function certificadoDoDominio(', '\n// Confere o certificado a cada passoMs').replace('port: 443', 'port: PORTA').replace("host, port: PORTA", "host: '127.0.0.1', port: PORTA")} return certificadoDoDominio;`.replace(/PORTA/g, String(porta)))(tls);
      const r = await f('srengenharia.seg.br');
      srv.close();
      check('certificado do servidor no lugar do domínio: não serve, e diz de quem é', r.ok === false && /srv-wp-02\.idealplus\.idealtrends\.io/.test(r.erro), JSON.stringify(r));
    }
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
