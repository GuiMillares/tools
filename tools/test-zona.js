// Regras da zona proposta para a Cloudflare (ADR-058). Pura, sem rede.
//
//     node tools/test-zona.js

const path = require('path');
const { montarZonaProposta, planejarAplicacao, unirRegistros, ehIpCloudflare } = require(path.join(__dirname, '..', 'lib', 'zona'));

let falhas = 0;
const check = (n, c, d) => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };
const acha = (z, type, name) => z.registros.filter((r) => r.type === type && r.name === name);

const NOVO = '149.18.102.39';
const ANTIGO = '200.1.1.1';

console.log('\n=== O exemplo combinado com o Everton ===');
{
  const z = montarZonaProposta({
    dominio: 'cliente.com.br', ipNovo: NOVO,
    snapshot: { registros: [
      { type: 'A', name: 'cliente.com.br', content: ANTIGO },
      { type: 'CNAME', name: 'www.cliente.com.br', content: 'cliente.com.br' },
      { type: 'CNAME', name: 'webmail.cliente.com.br', content: 'cliente.com.br' },
      { type: 'MX', name: 'cliente.com.br', content: 'cliente.com.br', priority: 10 },
      { type: 'TXT', name: 'cliente.com.br', content: 'v=spf1 a mx ~all' },
    ] },
  });
  check('IP antigo é o A da raiz', z.ipAntigo === ANTIGO, z.ipAntigo);
  check('raiz A vai para o servidor novo', acha(z, 'A', 'cliente.com.br')[0]?.content === NOVO);
  check('www é CNAME para a raiz', acha(z, 'CNAME', 'www.cliente.com.br')[0]?.content === 'cliente.com.br');
  check('webmail deixou de ser CNAME', acha(z, 'CNAME', 'webmail.cliente.com.br').length === 0);
  check('e virou A para o IP antigo', acha(z, 'A', 'webmail.cliente.com.br')[0]?.content === ANTIGO);
  check('MX saiu da raiz para mail.', acha(z, 'MX', 'cliente.com.br')[0]?.content === 'mail.cliente.com.br');
  check('e mail. tem A para o IP antigo', acha(z, 'A', 'mail.cliente.com.br')[0]?.content === ANTIGO);
  check('MX manteve a prioridade', acha(z, 'MX', 'cliente.com.br')[0]?.priority === 10);
  check('SPF copiado', acha(z, 'TXT', 'cliente.com.br')[0]?.content === 'v=spf1 a mx ~all');
  check('nada com proxy', z.registros.every((r) => r.proxied === false));
  check('sem avisos num caso limpo', z.avisos.length === 0, JSON.stringify(z.avisos));
}

console.log('\n=== MX de terceiros e host próprio ===');
{
  const z = montarZonaProposta({
    dominio: 'x.com.br', ipNovo: NOVO,
    snapshot: { registros: [
      { type: 'A', name: 'x.com.br', content: ANTIGO },
      { type: 'MX', name: 'x.com.br', content: 'aspmx.l.google.com', priority: 1 },
      { type: 'MX', name: 'x.com.br', content: 'mail.x.com.br', priority: 20 },
      { type: 'A', name: 'mail.x.com.br', content: '200.2.2.2' },
    ] },
  });
  check('MX do Google copiado como está', acha(z, 'MX', 'x.com.br').some((r) => r.content === 'aspmx.l.google.com'));
  check('MX para mail. copiado', acha(z, 'MX', 'x.com.br').some((r) => r.content === 'mail.x.com.br'));
  check('mail. com A próprio fica com o IP dele (MX não era a raiz)', acha(z, 'A', 'mail.x.com.br')[0]?.content === '200.2.2.2');
  check('não cria mail. em duplicata', acha(z, 'A', 'mail.x.com.br').length === 1);
}

console.log('\n=== MX para host da zona que não existe ===');
{
  const z = montarZonaProposta({
    dominio: 'y.com.br', ipNovo: NOVO,
    snapshot: { registros: [
      { type: 'A', name: 'y.com.br', content: ANTIGO },
      { type: 'MX', name: 'y.com.br', content: 'correio.y.com.br', priority: 10 },
    ] },
  });
  check('cria o host do MX para o IP antigo', acha(z, 'A', 'correio.y.com.br')[0]?.content === ANTIGO);
  check('e avisa', z.avisos.some((a) => /correio\.y\.com\.br/.test(a)), JSON.stringify(z.avisos));
}

console.log('\n=== Casos de borda ===');
{
  const z = montarZonaProposta({
    dominio: 'z.com.br', ipNovo: NOVO,
    snapshot: { registros: [
      { type: 'A', name: 'z.com.br', content: ANTIGO },
      { type: 'AAAA', name: 'z.com.br', content: '2001:db8::1' },
      { type: 'A', name: 'www.z.com.br', content: ANTIGO },
      { type: 'CNAME', name: 'loja.z.com.br', content: 'shops.myshopify.com' },
      { type: 'NS', name: 'z.com.br', content: 'ns1.antigo.com.br' },
      { type: 'TXT', name: '_dmarc.z.com.br', content: 'v=DMARC1; p=none' },
      { type: 'SRV', name: '_autodiscover._tcp.z.com.br', content: '0 443 autodiscover.z.com.br', priority: 0 },
    ] },
  });
  check('AAAA da raiz descartado com aviso', acha(z, 'AAAA', 'z.com.br').length === 0 && z.avisos.some((a) => /AAAA/.test(a)));
  check('www com A antigo vira CNAME para a raiz', acha(z, 'A', 'www.z.com.br').length === 0 && acha(z, 'CNAME', 'www.z.com.br').length === 1);
  check('CNAME para fora é copiado', acha(z, 'CNAME', 'loja.z.com.br')[0]?.content === 'shops.myshopify.com');
  check('NS da raiz não vai (a Cloudflare cuida)', acha(z, 'NS', 'z.com.br').length === 0);
  check('DMARC e SRV copiados', acha(z, 'TXT', '_dmarc.z.com.br').length === 1 && acha(z, 'SRV', '_autodiscover._tcp.z.com.br').length === 1);

  const semA = montarZonaProposta({ dominio: 'w.com.br', ipNovo: NOVO, snapshot: { registros: [
    { type: 'CNAME', name: 'webmail.w.com.br', content: 'w.com.br' },
  ] } });
  check('sem A na raiz, avisa que não há IP antigo', semA.ipAntigo === null && semA.avisos.some((a) => /IP antigo/.test(a)));
  check('e o CNAME que dependia dele não vira A inventado', acha(semA, 'A', 'webmail.w.com.br').length === 0);

  let erro = null;
  try { montarZonaProposta({ dominio: 'v.com.br', ipNovo: '192.168.3.143', snapshot: { registros: [] } }); } catch (e) { erro = e.message; }
  check('IP interno passa (é um IPv4 válido); a validação de "público" é de quem configura', erro === null, erro);
  try { montarZonaProposta({ dominio: 'v.com.br', ipNovo: 'abc', snapshot: { registros: [] } }); } catch (e) { erro = e.message; }
  check('IP inválido é recusado com instrução', /IP novo inválido/.test(erro || ''), erro);
}

console.log('\n=== Plano de aplicação contra uma zona que já existe ===');
{
  const existentes = [
    { id: 'a1', type: 'A', name: 'cliente.com.br', content: '1.2.3.4' },
    { id: 'c1', type: 'CNAME', name: 'www.cliente.com.br', content: 'algo.outro.com' },
    { id: 't1', type: 'TXT', name: 'cliente.com.br', content: 'v=spf1 a mx ~all' },
    { id: 'x1', type: 'A', name: 'antigo.cliente.com.br', content: '9.9.9.9' },
  ];
  const propostos = [
    { type: 'A', name: 'cliente.com.br', content: NOVO },
    { type: 'CNAME', name: 'www.cliente.com.br', content: 'cliente.com.br' },
    { type: 'TXT', name: 'cliente.com.br', content: 'v=spf1 a mx ~all' },
    { type: 'A', name: 'mail.cliente.com.br', content: ANTIGO },
  ];
  const p = planejarAplicacao(existentes, propostos);
  check('A da raiz é atualizado, não duplicado', p.atualizar.some((r) => r.id === 'a1' && r.content === NOVO));
  check('CNAME do www é atualizado', p.atualizar.some((r) => r.id === 'c1'));
  check('TXT igual é mantido', p.manter.some((r) => r.id === 't1'));
  check('mail. é criado', p.criar.some((r) => r.name === 'mail.cliente.com.br'));
  check('o que sobrou na zona é listado, não apagado', p.sobras.length === 1 && p.sobras[0].id === 'x1');
}

console.log('\n=== Zona montada pela Cloudflare: o que precisa SAIR (ADR-071) ===');
{
  // O scan da Cloudflare copiou a zona antiga inteira, inclusive o AAAA da
  // raiz e o MX que aponta para a própria raiz. A proposta troca os dois, e
  // por isso tem que dizer que os originais saem: senão ficam lado a lado.
  const snapshot = { registros: [
    { type: 'A', name: 'cliente.com.br', content: ANTIGO },
    { type: 'AAAA', name: 'cliente.com.br', content: '2001:db8::1' },
    { type: 'MX', name: 'cliente.com.br', content: 'cliente.com.br', priority: 10 },
    { type: 'MX', name: 'cliente.com.br', content: 'mx2.terceiro.com', priority: 20 },
    { type: 'TXT', name: 'cliente.com.br', content: 'v=spf1 a mx ~all' },
  ] };
  const z = montarZonaProposta({ dominio: 'cliente.com.br', snapshot, ipNovo: NOVO });
  check('AAAA da raiz está na lista de remoção', z.remover.some((r) => r.type === 'AAAA' && r.name === 'cliente.com.br'), JSON.stringify(z.remover));
  check('MX para a raiz está na lista de remoção', z.remover.some((r) => r.type === 'MX' && r.content === 'cliente.com.br'));
  check('MX de terceiro NÃO está na lista de remoção', !z.remover.some((r) => r.content === 'mx2.terceiro.com'));

  // A zona como a Cloudflare a tem depois do scan: ids e proxy.
  const existentes = [
    { id: 'a1', type: 'A', name: 'cliente.com.br', content: ANTIGO, proxied: true },
    { id: 'q1', type: 'AAAA', name: 'cliente.com.br', content: '2001:db8::1' },
    { id: 'm1', type: 'MX', name: 'cliente.com.br', content: 'cliente.com.br', priority: 10 },
    { id: 'm2', type: 'MX', name: 'cliente.com.br', content: 'mx2.terceiro.com', priority: 20 },
    { id: 't1', type: 'TXT', name: 'cliente.com.br', content: 'v=spf1 a mx ~all', proxied: false },
  ];
  const p = planejarAplicacao(existentes, z.registros, { remover: z.remover });
  check('A da raiz vira PUT para o IP novo', p.atualizar.some((r) => r.id === 'a1' && r.content === NOVO));
  check('AAAA da raiz sai', p.remover.some((r) => r.id === 'q1'));
  check('MX antigo para a raiz sai', p.remover.some((r) => r.id === 'm1'));
  check('MX de terceiro fica', p.manter.some((r) => r.id === 'm2') && !p.remover.some((r) => r.id === 'm2'));
  check('MX novo para mail.<dominio> é criado', p.criar.some((r) => r.type === 'MX' && r.content === 'mail.cliente.com.br'));
  check('mail A para o IP antigo é criado', p.criar.some((r) => r.type === 'A' && r.name === 'mail.cliente.com.br' && r.content === ANTIGO));
  check('TXT igual fica', p.manter.some((r) => r.id === 't1'));
  check('nada sobra sem decisão', p.sobras.length === 0, JSON.stringify(p.sobras));
}

console.log('\n=== Rodar de novo dá o mesmo resultado (raiz já no IP novo) ===');
{
  // A zona já aplicada uma vez: raiz no IP novo, MX em mail, mail no IP antigo.
  const snapshot = { registros: [
    { type: 'A', name: 'cliente.com.br', content: NOVO },
    { type: 'CNAME', name: 'www.cliente.com.br', content: 'cliente.com.br' },
    { type: 'MX', name: 'cliente.com.br', content: 'mail.cliente.com.br', priority: 10 },
    { type: 'A', name: 'mail.cliente.com.br', content: ANTIGO },
    { type: 'A', name: 'webmail.cliente.com.br', content: ANTIGO },
  ] };
  const z = montarZonaProposta({ dominio: 'cliente.com.br', snapshot, ipNovo: NOVO });
  check('IP antigo vem do mail, não da raiz nova', z.ipAntigo === ANTIGO, String(z.ipAntigo));
  check('mail continua no IP antigo', acha(z, 'A', 'mail.cliente.com.br')[0]?.content === ANTIGO);
  check('nada para remover', z.remover.length === 0, JSON.stringify(z.remover));
  check('sem aviso de raiz sem A', !z.avisos.some((a) => /não tem registro A/.test(a)), z.avisos.join(' | '));
  const existentes = snapshot.registros.map((r, i) => ({ id: 'e' + i, ...r, proxied: false }));
  const p = planejarAplicacao(existentes, z.registros, { remover: z.remover });
  check('plano vazio: nada muda, nada cria, nada sai', !p.atualizar.length && !p.criar.length && !p.remover.length, JSON.stringify(p));
}

console.log('\n=== O caso dclima: CNAME para a raiz vira A no MESMO registro (ADR-076) ===');
{
  // O scan trouxe ftp e mail como CNAME para a raiz. A regra os transforma em
  // A para o IP antigo; o plano tem que reescrever o CNAME, não criar ao lado
  // (a Cloudflare recusa A ao lado de CNAME, erro 81054).
  const D = 'dclima.com.br';
  const existentes = [
    { id: 'a1', type: 'A', name: D, content: '151.106.100.16', proxied: true },
    { id: 'c1', type: 'CNAME', name: `ftp.${D}`, content: D },
    { id: 'c2', type: 'CNAME', name: `mail.${D}`, content: D },
    { id: 'm1', type: 'MX', name: D, content: D, priority: 0 },
  ];
  const z = montarZonaProposta({ dominio: D, snapshot: { registros: existentes }, ipNovo: NOVO });
  check('ftp vira A para o IP antigo', acha(z, 'A', `ftp.${D}`)[0]?.content === '151.106.100.16');
  check('mail vira A para o IP antigo, uma vez só', acha(z, 'A', `mail.${D}`).length === 1 && acha(z, 'A', `mail.${D}`)[0].content === '151.106.100.16');
  const p = planejarAplicacao(existentes, z.registros, { remover: z.remover });
  const ftp = p.atualizar.find((r) => r.id === 'c1');
  const mail = p.atualizar.find((r) => r.id === 'c2');
  check('CNAME do ftp é reescrito como A (troca de tipo), não criado', ftp && ftp.type === 'A' && ftp.trocaTipo === true && !p.criar.some((r) => r.name === `ftp.${D}`), JSON.stringify(p.criar));
  check('CNAME do mail idem', mail && mail.type === 'A' && mail.trocaTipo === true);
  check('nada sobra: ftp e mail não ficam como "sem mexer"', p.sobras.length === 0, JSON.stringify(p.sobras));
  check('MX antigo sai, MX novo entra', p.remover.some((r) => r.id === 'm1') && p.criar.some((r) => r.type === 'MX' && r.content === `mail.${D}`));
}

console.log('\n=== O caso srengenharia: site que já estava atrás do proxy da Cloudflare (ADR-085) ===');
{
  const D = 'srengenharia.seg.br';
  const existentes = [
    { id: 'a1', type: 'A', name: D, content: '104.21.30.223' },
    { id: 'a2', type: 'A', name: D, content: '172.67.173.226' },
    { id: 'q1', type: 'AAAA', name: D, content: '2606:4700:3035::6815:1edf' },
    { id: 'w1', type: 'A', name: `www.${D}`, content: '104.21.30.223' },
    { id: 'w2', type: 'AAAA', name: `www.${D}`, content: '2606:4700:3035::6815:1edf' },
    { id: 'w3', type: 'AAAA', name: `www.${D}`, content: '2606:4700:3031::ac43:ade2' },
    { id: 't1', type: 'TXT', name: D, content: 'v=spf1 include:_spf.google.com ~all' },
  ];
  check('reconhece IP do proxy da Cloudflare', ehIpCloudflare('104.21.30.223') && ehIpCloudflare('172.67.173.226') && !ehIpCloudflare('151.106.100.16') && !ehIpCloudflare('149.18.102.39'));
  const z = montarZonaProposta({ dominio: D, snapshot: { registros: existentes }, ipNovo: NOVO });
  check('IP do proxy não vira "IP antigo"', z.ipAntigo === null, String(z.ipAntigo));
  check('avisa que o servidor antigo está escondido', z.avisos.some((a) => /proxy da Cloudflare/.test(a)), z.avisos.join(' | '));
  check('remove os dois A antigos da raiz e o AAAA', z.remover.filter((r) => r.name === D && r.type === 'A').length === 2 && z.remover.some((r) => r.name === D && r.type === 'AAAA'), JSON.stringify(z.remover));
  check('remove o A e os dois AAAA do www', z.remover.filter((r) => r.name === `www.${D}`).length === 3, JSON.stringify(z.remover));
  const p = planejarAplicacao(existentes, z.registros, { remover: z.remover });
  check('um A da raiz vira o IP novo (PUT), o outro sai', p.atualizar.some((r) => r.name === D && r.content === NOVO) && p.remover.some((r) => r.name === D && r.type === 'A'), JSON.stringify(p));
  check('o A do www vira CNAME (troca de tipo)', p.atualizar.some((r) => r.name === `www.${D}` && r.type === 'CNAME' && r.trocaTipo), JSON.stringify(p.atualizar));
  check('os AAAA do www e da raiz saem ANTES (conflitam por nome)', p.remover.filter((r) => r.type === 'AAAA').length === 3 && p.remover.filter((r) => r.type === 'AAAA').every((r) => r.antes === true), JSON.stringify(p.remover));
  check('TXT fica', p.manter.some((r) => r.id === 't1'));
  check('nada sobra', p.sobras.length === 0, JSON.stringify(p.sobras));
}

console.log('\n=== Proxy ligado no scan é desligado, não mantido ===');
{
  const existentes = [{ id: 'w1', type: 'CNAME', name: 'www.cliente.com.br', content: 'cliente.com.br', proxied: true }];
  const p = planejarAplicacao(existentes, [{ type: 'CNAME', name: 'www.cliente.com.br', content: 'cliente.com.br' }]);
  check('CNAME igual mas com proxy vira PUT', p.atualizar.length === 1 && p.atualizar[0].motivo === 'desligar o proxy' && p.manter.length === 0, JSON.stringify(p));
}

console.log('\n=== União do scan da Cloudflare com a fotografia ===');
{
  const scan = [
    { id: 'a1', type: 'A', name: 'cliente.com.br', content: ANTIGO },
    { id: 'e1', type: 'A', name: 'erp.cliente.com.br', content: '10.0.0.5' },
  ];
  const foto = [
    { type: 'A', name: 'cliente.com.br', content: ANTIGO },
    { type: 'TXT', name: 'default._domainkey.cliente.com.br', content: 'v=DKIM1; k=rsa; p=abc' },
    { type: 'txt', name: 'default._domainkey.cliente.com.br.', content: 'v=DKIM1; k=rsa; p=abc' },
  ];
  const u = unirRegistros(scan, foto);
  check('sem duplicata da raiz', u.filter((r) => r.type === 'A' && r.name === 'cliente.com.br').length === 1);
  check('o erp que só o scan viu entra', u.some((r) => r.name === 'erp.cliente.com.br'));
  check('o DKIM que só a fotografia viu entra, uma vez', u.filter((r) => r.type === 'TXT' && r.name === 'default._domainkey.cliente.com.br').length === 1, JSON.stringify(u));
  check('tipo em caixa alta e nome sem ponto final', u.every((r) => r.type === r.type.toUpperCase() && !r.name.endsWith('.')));
}

console.log('\n=== Subdomínio do cliente atrás do proxy da Cloudflare NÃO é copiado (ADR-091) ===');
{
  const { ehConteudoProxyCloudflare, ehIpCloudflareV6 } = require(path.join(__dirname, '..', 'lib', 'zona'));
  check('reconhece o proxy por IPv6 também', ehIpCloudflareV6('2606:4700:3035::6815:1edf') && !ehIpCloudflareV6('2800:3f0:4000::1'));
  check('conteúdo proxy pega v4 e v6', ehConteudoProxyCloudflare('104.21.30.223') && ehConteudoProxyCloudflare('2606:4700::1') && !ehConteudoProxyCloudflare('151.106.100.16'));

  const D = 'cliente-cf.com.br';
  const snapshot = { registros: [
    { type: 'A', name: D, content: '151.106.100.16' },                 // raiz no servidor real (não é proxy)
    { type: 'A', name: `loja.${D}`, content: '104.21.55.10' },          // subdomínio atrás do proxy
    { type: 'AAAA', name: `loja.${D}`, content: '2606:4700:3035::abcd' },// mesmo subdomínio, AAAA do proxy
    { type: 'A', name: `erp.${D}`, content: '200.100.50.25' },          // subdomínio no servidor real
    { type: 'CNAME', name: `blog.${D}`, content: 'destino.externo.com' },// CNAME não é afetado
  ] };
  const z = montarZonaProposta({ dominio: D, snapshot, ipNovo: NOVO });
  check('não copiou o A do subdomínio no proxy', !z.registros.some((r) => r.name === `loja.${D}` && r.type === 'A'), JSON.stringify(z.registros));
  check('nem o AAAA do subdomínio no proxy', !z.registros.some((r) => r.name === `loja.${D}` && r.type === 'AAAA'), JSON.stringify(z.registros));
  check('avisou sobre o subdomínio no proxy', z.avisos.some((a) => /loja\..*proxy da Cloudflare/.test(a)), z.avisos.join(' | '));
  check('copiou normalmente o subdomínio no servidor real', z.registros.some((r) => r.name === `erp.${D}` && r.content === '200.100.50.25'), JSON.stringify(z.registros));
  check('CNAME de subdomínio segue copiado', z.registros.some((r) => r.name === `blog.${D}` && r.type === 'CNAME'), JSON.stringify(z.registros));
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
