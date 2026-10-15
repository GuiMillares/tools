// Zona proposta para a Cloudflare a partir da fotografia do DNS atual (ADR-058).
//
// Pura, sem rede: recebe o que os autoritativos de hoje respondem e devolve o
// que a zona nova deve ter. A regra que importa está toda aqui, e é a que
// impede o e-mail do cliente de parar quando o site troca de servidor:
//
//   - a raiz passa a apontar para o servidor novo;
//   - www acompanha a raiz (CNAME);
//   - qualquer OUTRO CNAME que apontava para a raiz vira A para o IP antigo,
//     senão passaria a cair no servidor novo junto com a raiz;
//   - MX na própria raiz vira MX em mail.<dominio>, com mail A para o IP antigo;
//   - TXT, SRV, CAA e o resto são copiados;
//   - nada com proxy da Cloudflare.

const TIPOS_COPIADOS = new Set(['TXT', 'SRV', 'CAA', 'A', 'AAAA', 'CNAME', 'MX', 'NS']);

function fqdn(nome) {
  return String(nome || '').trim().toLowerCase().replace(/\.+$/, '');
}

// Faixas IPv4 públicas do proxy da Cloudflare. Um A da raiz nelas quer dizer
// que o site já estava atrás do proxy: o IP do servidor real está escondido, e
// "preservar o IP antigo" preservaria o proxy de outra conta (ADR-085).
const FAIXAS_CLOUDFLARE = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];
function ipParaNumero(ip) {
  const p = String(ip || '').split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
function ehIpCloudflare(ip) {
  const n = ipParaNumero(ip);
  if (n === null) return false;
  return FAIXAS_CLOUDFLARE.some((cidr) => {
    const [base, bits] = cidr.split('/');
    const mascara = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return ((n & mascara) >>> 0) === ((ipParaNumero(base) & mascara) >>> 0);
  });
}

// Prefixos IPv6 do proxy da Cloudflare. Um AAAA proxied cai aqui pelo mesmo
// motivo do A: é o edge da Cloudflare, não o servidor do cliente (ADR-091).
const PREFIXOS_CLOUDFLARE_V6 = [
  '2400:cb00', '2606:4700', '2803:f800', '2405:b500', '2405:8100', '2c0f:f248',
  // 2a06:98c0::/29 = 2a06:98c0 .. 2a06:98c7
  '2a06:98c0', '2a06:98c1', '2a06:98c2', '2a06:98c3', '2a06:98c4', '2a06:98c5', '2a06:98c6', '2a06:98c7',
];
function ehIpCloudflareV6(ip) {
  const t = String(ip || '').trim().toLowerCase();
  if (!t.includes(':')) return false;
  return PREFIXOS_CLOUDFLARE_V6.some((p) => t === p || t.startsWith(p + ':'));
}

// O conteúdo (A ou AAAA) é um IP do proxy da Cloudflare? Serve para não copiar
// para a nossa zona um registro do cliente que na verdade é o edge da
// Cloudflare — o IP do servidor real está escondido atrás dele (ADR-091).
function ehConteudoProxyCloudflare(content) {
  return ehIpCloudflare(content) || ehIpCloudflareV6(content);
}

// O IP real do servidor quando a raiz está atrás do proxy da Cloudflare
// (ADR-163). A Cloudflare não proxia e-mail, FTP nem painel: o A de mail,
// smtp, pop, imap, webmail, ftp, cpanel (e dos demais hosts fora do proxy) é
// o servidor de verdade; o ip4: do SPF também diz. Cada evidência vota; o IP
// com mais pontos ganha, e só vale com pelo menos uma evidência FORTE (host
// de e-mail/acesso ou SPF): o A de um subdomínio qualquer não diz onde o
// site mora (ADR-085/091 continuam valendo para ele). Nunca um IP do proxy
// nem o servidor novo. Devolve { ip, pontos, evidencias } ou null.
const HOSTS_DE_ORIGEM = new Set(['mail', 'smtp', 'pop', 'pop3', 'imap', 'webmail', 'ftp', 'cpanel', 'whm', 'webdisk', 'direct', 'direct-connect', 'origin', 'server', 'srv', 'host', 'mx', 'mx1', 'mx2', 'email', 'correio', 'autodiscover', 'autoconfig']);
function descobrirIpOrigem(registros, dominio, ipNovo) {
  const votos = new Map();
  const votar = (ip, pontos, evidencia, forte) => {
    if (!ip || ip === ipNovo || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || ehIpCloudflare(ip)) return;
    const v = votos.get(ip) || { pontos: 0, evidencias: [], forte: false };
    v.pontos += pontos;
    v.evidencias.push(evidencia);
    if (forte) v.forte = true;
    votos.set(ip, v);
  };
  for (const r of registros || []) {
    if (r.type === 'A' && r.name !== dominio) {
      const rel = r.name.endsWith('.' + dominio) ? r.name.slice(0, -(dominio.length + 1)) : r.name;
      const forte = HOSTS_DE_ORIGEM.has(rel);
      votar(r.content, forte ? 3 : rel === 'www' ? 2 : 1, `A de ${r.name}`, forte);
    }
    if (r.type === 'TXT' && r.name === dominio && /^v=spf1/i.test(r.content)) {
      for (const m of String(r.content).matchAll(/ip4:(\d{1,3}(?:\.\d{1,3}){3})(?:\/32)?(?=\s|$)/g)) votar(m[1], 2, 'ip4 do SPF', true);
    }
  }
  let melhor = null;
  for (const [ip, v] of votos) if (v.forte && (!melhor || v.pontos > melhor.pontos)) melhor = { ip, pontos: v.pontos, evidencias: v.evidencias };
  return melhor;
}
const textoOrigem = (o) => `${o.ip} (${o.evidencias.join(', ')})`;

function ehRaiz(nome, dominio) {
  const n = fqdn(nome);
  return n === dominio || n === `www.${dominio}` || n === '@' || n === '';
}

// Site em SUBDOMÍNIO (ADR-151): a zona é a do domínio raiz do cliente, e só o
// host e o www dele vão para o servidor novo. O resto da zona é replicado
// como está, raiz e e-mail inclusive: nada de mover MX nem de trocar CNAME,
// porque a raiz não muda de lugar. O IP antigo é só informação (o A que o
// host tinha); o registro antigo do host sai, para não ficar ao lado do novo.
function montarZonaSubdominio({ dominio, host, norm, ipNovoLimpo }) {
  const avisos = [];
  const registros = [];
  const add = (r, origem) => registros.push({ ...r, ttl: r.ttl && r.ttl > 0 ? r.ttl : 1, proxied: false, origem });
  const www = `www.${host}`;
  const ehDoHost = (n) => n === host || n === www;

  const antigos = norm.filter((r) => r.type === 'A' && r.name === host && r.content !== ipNovoLimpo && !ehIpCloudflare(r.content)).map((r) => r.content);
  const origem = descobrirIpOrigem(norm, dominio, ipNovoLimpo);
  let ipAntigo = antigos[0] || null;
  if (antigos.length > 1) avisos.push(`${host} tem ${antigos.length} registros A (${antigos.join(', ')}); todos saem, fica só o servidor novo.`);
  if (!ipAntigo && origem) { ipAntigo = origem.ip; avisos.push(`IP real do servidor antigo descoberto fora do proxy da Cloudflare: ${textoOrigem(origem)}.`); }

  add({ type: 'A', name: host, content: ipNovoLimpo }, 'subdomínio para o servidor novo');
  add({ type: 'CNAME', name: www, content: host }, 'www do subdomínio acompanha o host');

  for (const r of norm) {
    if (ehDoHost(r.name) && (r.type === 'A' || r.type === 'AAAA' || r.type === 'CNAME')) {
      if (r.type === 'AAAA') avisos.push(`AAAA de ${r.name} (${r.content}) descartado: o servidor novo não foi cadastrado com IPv6.`);
      continue; // substituído acima
    }
    if (r.name === dominio && r.type === 'NS') continue; // a Cloudflare põe os dela
    if ((r.type === 'A' || r.type === 'AAAA') && ehConteudoProxyCloudflare(r.content)) {
      if (r.type === 'A' && origem) {
        add({ type: 'A', name: r.name, content: origem.ip }, 'estava atrás do proxy da Cloudflare; copiado com o IP real descoberto');
        avisos.push(`${r.name} apontava para o proxy da Cloudflare (${r.content}); copiei com o IP real descoberto ${textoOrigem(origem)}. Confira se esse host mora no mesmo servidor.`);
      } else {
        avisos.push(`${r.name} aponta para o proxy da Cloudflare (${r.content}): o IP real do servidor está escondido, então não copiei esse registro. Pegue o IP real do cliente e cadastre à mão se ele precisar continuar no ar.`);
      }
      continue;
    }
    add(r, 'copiado');
  }

  const vistos = new Set();
  const finais = registros.filter((r) => {
    const k = `${r.type}|${r.name}|${r.content}|${r.priority ?? ''}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  const remover = [];
  for (const r of norm.filter((x) => x.name === host && (x.type === 'AAAA' || x.type === 'CNAME' || (x.type === 'A' && x.content !== ipNovoLimpo)))) remover.push({ type: r.type, name: host, content: r.content });
  for (const r of norm.filter((x) => x.name === www && (x.type === 'A' || x.type === 'AAAA' || (x.type === 'CNAME' && fqdn(x.content) !== host)))) remover.push({ type: r.type, name: www, content: r.content });
  return { dominio, host, subdominio: true, ipAntigo, ipNovo: ipNovoLimpo, registros: finais, avisos, remover };
}

// { dominio: a zona (domínio raiz), host: o site, quando é subdomínio;
//   snapshot: { registros }; ipNovo }. Sem `host` (ou host = zona), a regra
// é a da raiz: raiz e www para o servidor novo, e-mail preservado.
function montarZonaProposta({ dominio: dominioBruto, host: hostBruto, snapshot, ipNovo }) {
  const dominio = fqdn(dominioBruto);
  const host = fqdn(hostBruto) || dominio;
  const ipNovoLimpo = String(ipNovo || '').trim();
  const avisos = [];
  const registros = [];
  const entrada = Array.isArray(snapshot?.registros) ? snapshot.registros : [];

  if (!dominio) throw new Error('Sem domínio para montar a zona.');
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ipNovoLimpo)) {
    throw new Error(`IP novo inválido: "${ipNovo}". Confira o IP público do servidor Hestia nas configurações.`);
  }
  if (host !== dominio && !host.endsWith(`.${dominio}`)) throw new Error(`${host} não está dentro da zona ${dominio}.`);

  const norm = entrada
    .map((r) => ({
      type: String(r.type || '').toUpperCase(),
      name: fqdn(r.name) || dominio,
      content: String(r.content ?? '').trim().replace(/\.+$/, ''),
      priority: r.priority,
      ttl: r.ttl,
    }))
    .filter((r) => TIPOS_COPIADOS.has(r.type) && r.content);

  if (host !== dominio) return montarZonaSubdominio({ dominio, host, norm, ipNovoLimpo });

  // O IP antigo é o A da raiz que NÃO é o servidor novo. Se a raiz já está no
  // IP novo (a zona foi aplicada antes e a etapa rodou de novo), o antigo é
  // lido do A de mail.<dominio>, que é onde a regra o deixou: assim rodar
  // duas vezes dá o mesmo resultado, em vez de empurrar o e-mail para o
  // servidor novo (ADR-071).
  const raizTodos = norm.filter((r) => r.type === 'A' && r.name === dominio && r.content !== ipNovoLimpo).map((r) => r.content);
  const raizProxy = raizTodos.filter(ehIpCloudflare);
  const raizA = raizTodos.filter((ip) => !ehIpCloudflare(ip));
  const origem = descobrirIpOrigem(norm, dominio, ipNovoLimpo);
  if (raizProxy.length) {
    avisos.push(origem
      ? `A raiz apontava para o proxy da Cloudflare (${raizProxy.join(', ')}); o IP real do servidor antigo foi descoberto fora do proxy: ${textoOrigem(origem)}. E-mail e CNAME são preservados por ele; confira o e-mail do cliente mesmo assim.`
      : `A raiz apontava para o proxy da Cloudflare (${raizProxy.join(', ')}): o IP do servidor antigo está escondido e nenhum host fora do proxy (mail, smtp, ftp, cpanel…) nem o SPF revelou o IP real. Não dá para preservar e-mail nem CNAME por ele. Confira o e-mail do cliente à mão.`);
  }
  const raizJaNova = norm.some((r) => r.type === 'A' && r.name === dominio && r.content === ipNovoLimpo);
  let ipAntigo = raizA[0] || null;
  if (!ipAntigo) {
    const mailA = norm.find((r) => r.type === 'A' && r.name === `mail.${dominio}` && r.content !== ipNovoLimpo && !ehIpCloudflare(r.content));
    if (mailA) {
      ipAntigo = mailA.content;
      if (!raizJaNova && !raizProxy.length) avisos.push(`A raiz não tem registro A hoje; usei o IP de mail.${dominio} (${ipAntigo}) como IP antigo.`);
    }
  }
  if (!ipAntigo && origem) {
    ipAntigo = origem.ip;
    if (!raizProxy.length) avisos.push(`IP real do servidor antigo descoberto fora do proxy da Cloudflare: ${textoOrigem(origem)}. Usei como IP antigo para preservar e-mail e CNAME.`);
  }
  if (!ipAntigo) {
    avisos.push(raizJaNova
      ? `A raiz já aponta para ${ipNovoLimpo} e não há mail.${dominio} para dizer qual era o IP antigo. CNAME e MX para a raiz não têm como ser preservados.`
      : 'A raiz não tem registro A hoje. Sem IP antigo, nenhum CNAME ou MX pode ser preservado; confira antes de aplicar.');
  }
  if (raizA.length > 1) {
    avisos.push(`A raiz tem ${raizA.length} registros A (${raizA.join(', ')}). Usei o primeiro como IP antigo.`);
  }

  const add = (r, origem) => registros.push({ ...r, ttl: r.ttl && r.ttl > 0 ? r.ttl : 1, proxied: false, origem });

  // 1. Raiz e www.
  add({ type: 'A', name: dominio, content: ipNovoLimpo }, 'raiz para o servidor novo');
  add({ type: 'CNAME', name: `www.${dominio}`, content: dominio }, 'www acompanha a raiz');
  for (const r of norm.filter((x) => x.type === 'AAAA' && x.name === dominio)) {
    avisos.push(`AAAA da raiz (${r.content}) descartado: o servidor novo não foi cadastrado com IPv6, e manter levaria parte do tráfego para o servidor antigo.`);
  }

  // 2. Demais registros.
  const mailHost = `mail.${dominio}`;
  let precisaMail = false;

  for (const r of norm) {
    if (r.name === dominio && (r.type === 'A' || r.type === 'AAAA' || r.type === 'NS')) continue;
    if (r.name === `www.${dominio}`) continue; // já decidido acima
    if (r.type === 'NS') { add(r, 'copiado'); continue; }

    if (r.type === 'CNAME') {
      if (ehRaiz(r.content, dominio)) {
        if (!ipAntigo) { avisos.push(`${r.name} era CNAME para a raiz e não pôde virar A: sem IP antigo.`); continue; }
        add({ type: 'A', name: r.name, content: ipAntigo }, 'era CNAME para a raiz, virou A para o IP antigo');
      } else {
        add(r, 'copiado');
      }
      continue;
    }

    // Subdomínio (ou qualquer A/AAAA fora da raiz) que aponta para o proxy da
    // Cloudflare: o conteúdo é o edge da Cloudflare, não o servidor do cliente.
    // Copiar isso levaria o subdomínio para o proxy de outra conta. Não copio;
    // aviso para o analista pegar o IP real do cliente à mão (ADR-091).
    if ((r.type === 'A' || r.type === 'AAAA') && ehConteudoProxyCloudflare(r.content)) {
      if (r.type === 'A' && origem) {
        // Com o IP real descoberto (ADR-163), o subdomínio proxiado vai para
        // ele, sem proxy: é o que mantém pop/smtp/imap e afins no ar.
        add({ type: 'A', name: r.name, content: origem.ip }, 'estava atrás do proxy da Cloudflare; copiado com o IP real descoberto');
        avisos.push(`${r.name} apontava para o proxy da Cloudflare (${r.content}); copiei com o IP real descoberto ${textoOrigem(origem)}. Confira se esse subdomínio mora no mesmo servidor.`);
      } else {
        avisos.push(`${r.name} aponta para o proxy da Cloudflare (${r.content}): o IP real do servidor está escondido, então não copiei esse registro. Pegue o IP real do cliente e cadastre à mão se esse subdomínio precisar continuar no ar.`);
      }
      continue;
    }

    if (r.type === 'MX') {
      const alvo = fqdn(r.content);
      if (ehRaiz(alvo, dominio)) {
        if (!ipAntigo) { avisos.push(`MX apontava para a raiz e não pôde ser preservado: sem IP antigo.`); add(r, 'copiado (confira)'); continue; }
        precisaMail = true;
        add({ ...r, content: mailHost }, 'MX era a raiz, virou mail.<dominio>');
      } else {
        // MX para um host da própria zona: ele precisa continuar resolvendo
        // para o servidor antigo. Se não houver registro dele, criamos.
        const dentro = alvo === dominio || alvo.endsWith(`.${dominio}`);
        if (dentro && !norm.some((x) => x.name === alvo && (x.type === 'A' || x.type === 'CNAME'))) {
          if (ipAntigo) {
            add({ type: 'A', name: alvo, content: ipAntigo }, 'host do MX sem registro, criado para o IP antigo');
            avisos.push(`${alvo} é destino do MX mas não tinha registro hoje. Criei A para o IP antigo.`);
          }
        }
        add(r, 'copiado');
      }
      continue;
    }

    add(r, 'copiado');
  }

  // 3. O host de e-mail, quando o MX pedia.
  if (precisaMail) {
    const jaTem = registros.find((x) => x.name === mailHost && (x.type === 'A' || x.type === 'CNAME'));
    if (!jaTem) {
      add({ type: 'A', name: mailHost, content: ipAntigo }, 'criado para o MX: IP antigo');
    } else if (jaTem.type === 'A' && ipAntigo && jaTem.content !== ipAntigo) {
      avisos.push(`mail.${dominio} já existia apontando para ${jaTem.content}; troquei para o IP antigo ${ipAntigo}, como o MX pede.`);
      jaTem.content = ipAntigo;
      jaTem.origem = 'A de mail ajustado para o IP antigo';
    }
  }

  // 4. Sem duplicatas exatas.
  const vistos = new Set();
  const finais = registros.filter((r) => {
    const k = `${r.type}|${r.name}|${r.content}|${r.priority ?? ''}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  // 5. O que a zona NÃO pode manter, quando já existe na Cloudflare (ADR-071):
  // o AAAA da raiz (descartado acima) e o MX que apontava para a própria raiz
  // (virou mail.<dominio>). Copiados pelo scan da Cloudflare, eles ficariam
  // na zona ao lado do que os substitui, e o e-mail cairia em dois lugares.
  const remover = [];
  // Raiz e www só podem ter o que a proposta pede: A da raiz para o servidor
  // novo e CNAME do www. Qualquer outro A, e todo AAAA, sai: IPv6 na raiz ou
  // no www manda parte do tráfego para outro lugar e impede o SSL (ADR-085).
  for (const r of norm.filter((x) => x.name === dominio && (x.type === 'AAAA' || (x.type === 'A' && x.content !== ipNovoLimpo)))) {
    remover.push({ type: r.type, name: dominio, content: r.content });
  }
  for (const r of norm.filter((x) => x.name === `www.${dominio}` && (x.type === 'A' || x.type === 'AAAA' || (x.type === 'CNAME' && fqdn(x.content) !== dominio)))) {
    remover.push({ type: r.type, name: `www.${dominio}`, content: r.content });
  }
  for (const r of norm.filter((x) => x.type === 'MX' && x.name === dominio && ehRaiz(x.content, dominio))) {
    if (ipAntigo) remover.push({ type: 'MX', name: dominio, content: r.content });
  }

  return { dominio, host: dominio, subdominio: false, ipAntigo, ipNovo: ipNovoLimpo, registros: finais, avisos, remover };
}

// Une o que a Cloudflare já tem na zona (o scan dela, ou registros antigos) com
// o que a fotografia dos autoritativos achou. Cada lado vê coisas que o outro
// não vê: o scan cobre nomes que a nossa lista não adivinha, a fotografia
// cobre DKIM, DMARC e SRV que o scan costuma ignorar. Sem duplicata exata.
function unirRegistros(...listas) {
  const vistos = new Set();
  const saida = [];
  for (const lista of listas) {
    for (const r of lista || []) {
      const type = String(r.type || '').toUpperCase();
      if (!type) continue;
      const k = `${type}|${fqdn(r.name)}|${fqdn(String(r.content ?? ''))}|${r.priority ?? ''}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      saida.push({ type, name: fqdn(r.name), content: String(r.content ?? '').trim(), priority: r.priority, ttl: r.ttl });
    }
  }
  return saida;
}

// Diferença entre o que a zona tem na Cloudflare e o que a proposta pede,
// para o terminal mostrar antes de aplicar e o aplicador saber o que fazer.
//
// `remover` da proposta vira DELETE. Registro igual mas com proxy ligado vira
// PUT, porque a regra é tudo sem proxy (ADR-058). MX é tratado como conjunto:
// se a proposta tem MX para um nome, MX daquele nome que ela não pede sai.
function planejarAplicacao(existentes, propostos, { remover: pedidos = [] } = {}) {
  const chave = (r) => `${String(r.type).toUpperCase()}|${fqdn(r.name)}`;
  const porChave = new Map();
  for (const e of existentes || []) {
    const k = chave(e);
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k).push(e);
  }
  const criar = [];
  const atualizar = [];
  const manter = [];
  const remover = [];
  const usados = new Set();

  for (const p of propostos) {
    const k = chave(p);
    const lista = porChave.get(k) || [];
    const igual = lista.find((e) => !usados.has(e.id) && fqdn(e.content) === fqdn(p.content) && (p.type !== 'MX' || Number(e.priority) === Number(p.priority)));
    if (igual) {
      usados.add(igual.id);
      if (igual.proxied === true) atualizar.push({ ...p, id: igual.id, antes: igual.content, motivo: 'desligar o proxy' });
      else manter.push({ ...p, id: igual.id });
      continue;
    }
    // Tipos de valor único (A da raiz, CNAME): substituir o que está lá.
    const substituivel = lista.find((e) => !usados.has(e.id) && (p.type === 'CNAME' || e.type === 'CNAME' || p.type === 'A' || p.type === 'AAAA'));
    if (substituivel) { atualizar.push({ ...p, id: substituivel.id, antes: substituivel.content }); usados.add(substituivel.id); continue; }

    // CNAME não convive com nada no mesmo nome. Um A proposto onde existe um
    // CNAME (o ftp e o mail que apontavam para a raiz e viram A para o IP
    // antigo), ou um CNAME proposto onde existe um A: o registro existente é
    // reescrito com o tipo novo, nunca criado ao lado (ADR-076).
    const tipoP = String(p.type).toUpperCase();
    const nomeP = fqdn(p.name);
    const conflito = (existentes || []).find((e) => {
      if (usados.has(e.id) || fqdn(e.name) !== nomeP) return false;
      const tipoE = String(e.type).toUpperCase();
      if (tipoE === 'NS') return false;
      return (tipoP === 'CNAME' && tipoE !== 'CNAME') || (tipoE === 'CNAME' && tipoP !== 'CNAME');
    });
    if (conflito) {
      atualizar.push({ ...p, id: conflito.id, antes: `${conflito.type} ${conflito.content}`, trocaTipo: true, motivo: `era ${conflito.type}, vira ${tipoP}` });
      usados.add(conflito.id);
      continue;
    }
    criar.push(p);
  }

  const nomesComMx = new Set(propostos.filter((p) => String(p.type).toUpperCase() === 'MX').map((p) => fqdn(p.name)));
  // Nomes em que a proposta tem A, AAAA ou CNAME: um DELETE ali tem que vir
  // ANTES do PUT/POST, senão a Cloudflare recusa (81053, ADR-085). Os demais
  // (MX antigo) saem depois, quando o substituto já existe.
  const nomesUnicos = new Set(propostos.filter((p) => ['A', 'AAAA', 'CNAME'].includes(String(p.type).toUpperCase())).map((p) => fqdn(p.name)));
  for (const e of existentes || []) {
    if (usados.has(e.id) || e.type === 'NS') continue;
    const pedido = pedidos.some((r) => String(r.type).toUpperCase() === String(e.type).toUpperCase() && fqdn(r.name) === fqdn(e.name) && (!r.content || fqdn(r.content) === fqdn(e.content)));
    const mxSubstituido = String(e.type).toUpperCase() === 'MX' && nomesComMx.has(fqdn(e.name));
    if (pedido || mxSubstituido) {
      const antes = ['A', 'AAAA', 'CNAME'].includes(String(e.type).toUpperCase()) && nomesUnicos.has(fqdn(e.name));
      remover.push({ ...e, motivo: pedido ? 'a proposta pede para sair' : 'MX substituído pela proposta', antes });
      usados.add(e.id);
    }
  }

  const sobras = (existentes || []).filter((e) => !usados.has(e.id) && e.type !== 'NS');
  return { criar, atualizar, manter, remover, sobras };
}

module.exports = { montarZonaProposta, planejarAplicacao, unirRegistros, fqdn, ehIpCloudflare, ehIpCloudflareV6, ehConteudoProxyCloudflare, descobrirIpOrigem };
