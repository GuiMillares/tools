// ADR-113: WHOIS + DNS da tela inicial. Testa o parser do WHOIS (.br e
// genérico) e a derivação do nome do usuário pelo e-mail. Recorta do main.js e
// do renderer/app.js.
//
//     node tools/test-whois.js

const fs = require('fs');
const path = require('path');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');
const recorta = (fonte, a, b) => { const i = fonte.indexOf(a); const f = fonte.indexOf(b, i); if (i < 0 || f < 0) throw new Error('não achei ' + a); return fonte.slice(i, f); };

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const parseWhois = new Function(`${recorta(main, 'function parseWhois(', '\nasync function whoisConsulta(')} return parseWhois;`)();

console.log('\n=== WHOIS .br (registro.br) ===');
{
  const txt = [
    'domain:   cliente.com.br',
    'owner:    CLIENTE COMERCIO LTDA',
    'ownerid:  12.345.678/0001-90',
    'responsible: Fulano de Tal',
    'created:  20180312 #12345678',
    'changed:  20250312',
    'expires:  20260312',
    'status:   published',
    'nserver:  ns1.cloudflare.com',
    'nserver:  ns2.cloudflare.com',
  ].join('\n');
  const c = parseWhois(txt);
  check('titular (owner)', c.titular === 'CLIENTE COMERCIO LTDA', c.titular);
  check('criado', c.criado.startsWith('20180312'), c.criado);
  check('expira', c.expira.startsWith('20260312'), c.expira);
  check('status', c.status === 'published', c.status);
  check('nameservers (minúsculo, sem ponto final)', c.nameservers.join(',') === 'ns1.cloudflare.com,ns2.cloudflare.com', JSON.stringify(c.nameservers));
}

console.log('\n=== WHOIS genérico (.com) ===');
{
  const txt = [
    'Domain Name: EXEMPLO.COM',
    'Registrar: GoDaddy.com, LLC',
    'Creation Date: 2010-05-01T00:00:00Z',
    'Registry Expiry Date: 2027-05-01T00:00:00Z',
    'Domain Status: clientTransferProhibited',
    'Domain Status: clientDeleteProhibited',
    'Name Server: NS1.EXEMPLO.COM',
    'Name Server: NS2.EXEMPLO.COM',
    'Registrant Organization: Exemplo Inc',
  ].join('\n');
  const c = parseWhois(txt);
  check('registrador', c.registrador === 'GoDaddy.com, LLC', c.registrador);
  check('criado', c.criado === '2010-05-01T00:00:00Z', c.criado);
  check('expira', c.expira === '2027-05-01T00:00:00Z', c.expira);
  check('status junta os dois', /clientTransferProhibited/.test(c.status) && /clientDeleteProhibited/.test(c.status), c.status);
  check('nameservers em minúsculo', c.nameservers.join(',') === 'ns1.exemplo.com,ns2.exemplo.com', JSON.stringify(c.nameservers));
  check('titular pela organização do registrante', c.titular === 'Exemplo Inc', c.titular);
}

console.log('\n=== Texto vazio não quebra ===');
{
  const c = parseWhois('');
  check('tudo vazio', c.titular === '' && c.nameservers.length === 0);
}

console.log('\n=== Nome do usuário pelo e-mail (saudação) ===');
{
  const fns = new Function(`${recorta(app, 'function nomeDoEmailLocal(', '\nfunction renderHome(')} return { nomeDoEmailLocal, primeiroNome };`)();
  check('guilherme.millares vira Guilherme Millares', fns.nomeDoEmailLocal('guilherme.millares@buscacliente.com.br') === 'Guilherme Millares');
  check('separa por ponto, hífen e underscore', fns.nomeDoEmailLocal('ana-paula_souza@x.com') === 'Ana Paula Souza');
  check('primeiro nome', fns.primeiroNome('Guilherme Millares') === 'Guilherme');
  check('e-mail vazio não quebra', fns.nomeDoEmailLocal('') === '' && fns.primeiroNome('') === '');
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
