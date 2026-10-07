// ADR-098: achar sozinho o link do painel MPI+ de um site da planilha.
//
// Mapeado em 23/09/2026 no painel, só leitura:
//   GET /clientes?busca=<razão social>  → tabela (ID, Empresa, CNPJ, …, Contratos).
//        A busca acha pela razão social mesmo quando o nome do cliente é outro
//        ("confeccoeshp" ← "HP - CONFECCOES HUMBERTO PASCUINI LTDA"). Domínio não acha.
//   GET /clientes/<c>                   → um cartão por projeto: <h3> com o nome
//        (quase sempre o domínio) e o link /clientes/<c>/hub?projeto=<p>.
//   GET /clientes/<c>/hub?projeto=<p>   → cartões dos contratos, links
//        …hub?projeto=<p>&contrato=<k>. A página é pesada (2 MB, ~20 s até o
//        primeiro byte), então só lemos o começo, até as abas.
//   GET /clientes/<c>/projetos/<p>/contratos/<k>/wordpress-full-install/status
//        → JSON com wordpress_temporary_url, wordpress_production_url,
//        wordpress_site_status. É o mesmo "link temporário" do alto da aba
//        Publicação (root.wordpressTemporaryUrl).
//
// O link temporário da planilha é o que confirma o contrato certo. Sem ele,
// vale a URL de produção do contrato (ADR-144): cliente com vários projetos
// ou contratos fica com o contrato publicado no domínio da planilha.

const PAINEL_HOST = 'idealplus.idealtrends.io';
const DOMINIO_TEMPORARIO = 'mpitemporario.com.br';
const MAX_CLIENTES = 5;

// "http://turbogeraiscomerciol-migra.mpitemporario.com.br/" → "turbogeraiscomerciol-migra.mpitemporario.com.br"
function normalizarTemporario(valor) {
  let s = String(valor || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '').replace(/^www\./, '');
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s) ? s : '';
}

// O host de uma URL de produção ("https://www.turbogerais.com.br/" →
// "turbogerais.com.br"). É a mesma limpeza do temporário; o nome separado é
// para o código dizer o que está comparando.
const normalizarProducao = normalizarTemporario;

// O contrato está publicado no domínio pedido? Compara os hosts limpos.
function producaoEh(contrato, dominio) {
  const d = normalizarProducao(dominio);
  return !!d && normalizarProducao(contrato && contrato.producao) === d;
}

function pareceTemporario(valor) {
  const h = normalizarTemporario(valor);
  return !!h && (h === DOMINIO_TEMPORARIO || h.endsWith(`.${DOMINIO_TEMPORARIO}`));
}

function linkDoContrato({ cliente, projeto, contrato }) {
  return `https://${PAINEL_HOST}/clientes/${cliente}/hub?projeto=${projeto}${contrato ? `&contrato=${contrato}` : ''}&tab=publicacao`;
}

// Projetos cujo nome cita o domínio vão primeiro: cada um custa ~20 s.
function ordenarProjetos(projetos, dominio) {
  const d = String(dominio || '').toLowerCase().replace(/^www\./, '');
  const cita = (p) => (d && String(p.nome || '').toLowerCase().replace(/^www\./, '') === d ? 0 : d && String(p.nome || '').toLowerCase().includes(d) ? 1 : 2);
  return [...projetos].sort((a, b) => cita(a) - cita(b));
}

// A decisão. contratos: [{ cliente, empresa, projeto, projetoNome, contrato, temporario, producao, status }]
//
// Na ordem: o temporário da planilha (quando ela tem), depois o contrato
// publicado no domínio da planilha (URL de produção, ADR-144), depois o único
// contrato do único cliente. Mais de um contrato e nenhum deles no domínio:
// não chuta, lista o que viu.
function escolherContrato({ contratos = [], temporario = '', nClientes = 0, dominio = '', contratosPrecisos = null }) {
  const alvo = normalizarTemporario(temporario);
  const dom = normalizarProducao(dominio);
  // "O único do cliente" só vale entre os contratos achados pela razão social
  // (os precisos); o que veio de termo largo só entra confirmado pela produção.
  const unicos = Array.isArray(contratosPrecisos) ? contratosPrecisos : contratos;
  const lista = contratos.map((c) =>
    `${c.empresa || c.cliente} / ${c.projetoNome || c.projeto} / contrato ${c.contrato}: ${normalizarTemporario(c.temporario) || 'sem site temporário'}` +
    ` · produção ${normalizarProducao(c.producao) || '(nenhuma)'}`
  );
  if (!contratos.length) return { erro: 'o cliente não tem contrato com projeto no painel' };
  if (alvo) {
    const iguais = contratos.filter((c) => normalizarTemporario(c.temporario) === alvo);
    if (iguais.length === 1) return { ok: true, contrato: iguais[0], url: linkDoContrato(iguais[0]), conferidoPeloTemporario: true, conferidoPelaProducao: false };
    if (iguais.length > 1) return { erro: `${iguais.length} contratos com o temporário ${alvo}`, lista };
  }
  if (dom) {
    const publicados = contratos.filter((c) => producaoEh(c, dom));
    if (publicados.length === 1) {
      return {
        ok: true, contrato: publicados[0], url: linkDoContrato(publicados[0]),
        conferidoPeloTemporario: false, conferidoPelaProducao: true,
        // O temporário da planilha não bateu com nenhum, mas o contrato está
        // publicado no domínio: a produção manda, e o aviso fica registrado.
        aviso: alvo ? `o temporário ${alvo} da planilha não bate com nenhum contrato; fiquei com o publicado em ${dom}` : '',
      };
    }
    if (publicados.length > 1) return { erro: `${publicados.length} contratos publicados em ${dom}`, lista };
  }
  if (alvo) return { erro: `nenhum contrato com o temporário ${alvo}${dom ? ` nem publicado em ${dom}` : ''}`, lista };
  if (nClientes === 1 && unicos.length === 1) {
    return { ok: true, contrato: unicos[0], url: linkDoContrato(unicos[0]), conferidoPeloTemporario: false, conferidoPelaProducao: false };
  }
  return {
    erro: `${contratos.length} contratos em ${nClientes} cliente(s), nenhum publicado em ${dom || '(domínio não informado)'} e sem link temporário na planilha para saber qual é o certo`,
    lista,
  };
}

// ----- Scripts que rodam dentro da janela do painel (logada). Só GET. -----

const JS_BUSCAR_CLIENTES = (razao) => `
  const r = await fetch('/clientes?per_page=50&busca=' + encodeURIComponent(${JSON.stringify(String(razao || ''))}), { credentials: 'same-origin' });
  if (/\\/login/.test(r.url)) return { erro: 'o painel pediu login de novo' };
  if (!r.ok) return { erro: 'a busca de clientes respondeu ' + r.status };
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  const clientes = [];
  for (const tr of doc.querySelectorAll('tbody tr')) {
    const tds = [...tr.querySelectorAll('td')].map((t) => t.textContent.replace(/\\s+/g, ' ').trim());
    const a = tr.querySelector('a[href*="/clientes/"]');
    const id = ((a && a.getAttribute('href')) || '').match(/\\/clientes\\/(\\d+)/);
    if (!id) continue;
    clientes.push({ id: id[1], empresa: tds[1] || '', cnpj: tds[2] || '', contratos: Number(tds[5]) || null, etapa: tds[7] || '' });
  }
  return { ok: true, clientes };
`;

const JS_PROJETOS_DO_CLIENTE = (cliente) => `
  const r = await fetch('/clientes/' + ${JSON.stringify(String(cliente))}, { credentials: 'same-origin' });
  if (!r.ok) return { erro: 'a página do cliente respondeu ' + r.status };
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  const vistos = new Set();
  const projetos = [];
  for (const a of doc.querySelectorAll('a[href*="hub?projeto="]')) {
    const m = (a.getAttribute('href') || '').match(/hub\\?projeto=(\\d+)/);
    if (!m || vistos.has(m[1])) continue;
    vistos.add(m[1]);
    let card = a;
    while (card.parentElement && !card.querySelector('h3')) card = card.parentElement;
    projetos.push({ projeto: m[1], nome: ((card.querySelector('h3') || {}).textContent || '').trim() });
  }
  return { ok: true, projetos };
`;

// Lê só até as abas (os contratos vêm antes), com prazo próprio.
const JS_CONTRATOS_DO_PROJETO = (cliente, projeto) => `
  const p = ${JSON.stringify(String(projeto))};
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 150000);
  let s = '';
  try {
    const r = await fetch('/clientes/' + ${JSON.stringify(String(cliente))} + '/hub?projeto=' + p, { credentials: 'same-origin', signal: ctl.signal });
    if (!r.ok) return { erro: 'a página do projeto respondeu ' + r.status };
    const rd = r.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await rd.read();
      if (done) break;
      s += dec.decode(value, { stream: true });
      if (s.indexOf("setHubTab(") > 0 && /contrato=\\d+/.test(s)) break;
    }
    rd.cancel().catch(() => {});
  } catch (e) {
    return { erro: 'a página do projeto não carregou em 150s' };
  } finally { clearTimeout(t); }
  const re = new RegExp('hub\\\\?projeto=' + p + '(?:&amp;|&)contrato=(\\\\d+)', 'g');
  let ks = [...new Set([...s.matchAll(re)].map((m) => m[1]))];
  if (!ks.length) ks = [...new Set([...s.matchAll(new RegExp('projetos\\\\\\\\?/' + p + '\\\\\\\\?/contratos\\\\\\\\?/(\\\\d+)', 'g'))].map((m) => m[1]))];
  return { ok: true, contratos: ks };
`;

const JS_SITE_DO_CONTRATO = (cliente, projeto, contrato) => `
  const r = await fetch('/clientes/' + ${JSON.stringify(String(cliente))} + '/projetos/' + ${JSON.stringify(String(projeto))} + '/contratos/' + ${JSON.stringify(String(contrato))} + '/wordpress-full-install/status', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!r.ok) return { erro: 'o status do contrato respondeu ' + r.status };
  const j = await r.json();
  return { ok: true, temporario: j.wordpress_temporary_url || '', producao: j.wordpress_production_url || '', status: j.wordpress_site_status || '' };
`;

// ----- Como achar o cliente quando a razão social não acha (ADR-144) -----
//
// A busca do painel é por nome ou CNPJ, e o nome do cliente no painel nem
// sempre é a razão social da planilha: às vezes é um apelido tirado do
// domínio ("confeccoeshp"). Então a busca sobe uma escada de termos, do mais
// certeiro ao mais largo, e quem confirma é a URL de produção do contrato (ou
// o temporário da planilha), nunca o termo que achou o cliente.

const MAX_CLIENTES_POR_TERMO = 25; // mais que isso é termo largo demais: pula
const MAX_PAGINAS_PESADAS = 8;     // páginas de projeto (20 a 50 s cada) por site
const MAX_TERMOS = 10;

const DIACRITICOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const semAcento = (s) => String(s == null ? '' : s).normalize('NFD').replace(DIACRITICOS, '');
const SUFIXOS_SOCIETARIOS = new Set(['ltda', 'limitada', 'me', 'mei', 'epp', 'eireli', 'sa', 's/a', 'ss', 'cia', 'companhia', 'sociedade', 'simples', 'individual', 'empresa', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com']);
const PALAVRAS_GENERICAS = new Set([
  'comercio', 'comercial', 'servicos', 'servico', 'industria', 'industrial', 'consultoria', 'representacoes', 'participacoes',
  'empreendimentos', 'solucoes', 'assessoria', 'construcoes', 'construtora', 'engenharia', 'distribuidora', 'distribuicao',
  'tecnologia', 'sistemas', 'clinica', 'consultorio', 'grupo', 'brasil', 'holding', 'administradora', 'administracao',
  'imobiliaria', 'transportes', 'transporte', 'logistica', 'produtos', 'equipamentos', 'materiais', 'pecas', 'alimentos',
  'medica', 'medico', 'odontologia', 'advogados', 'advocacia', 'contabilidade', 'contabil', 'marketing', 'digital',
  'informatica', 'instalacoes', 'manutencao', 'locacao', 'locacoes', 'eventos', 'treinamentos', 'centro', 'casa', 'loja',
  'mercado', 'ferramentas', 'maquinas', 'veiculos', 'moveis', 'metalurgica', 'textil', 'confeccoes', 'confeccao', 'saude',
  'estetica', 'seguranca', 'eletrica', 'energia', 'projetos', 'design', 'arquitetura', 'oficina', 'mecanica', 'reformas',
  'limpeza', 'gestao', 'negocios', 'seguros', 'corretora', 'imoveis', 'turismo', 'restaurante', 'associacao', 'instituto',
  'fundacao', 'cooperativa', 'nacional', 'internacional', 'geral', 'gerais', 'unidos', 'nova', 'novo', 'minas', 'paulista',
  'paulo', 'janeiro', 'santa', 'santo',
]);
// Sufixos de domínio com 4 letras ou mais (os de até 3, como com/net/br/eng,
// saem pelo tamanho).
const SUFIXOS_PUBLICOS = new Set(['info', 'blog', 'shop', 'site', 'store', 'cloud', 'online', 'page', 'digital', 'radio', 'coop', 'wiki', 'name', 'mobi']);

// "camisas.hpwork.com.br" → ["hpwork", "camisas"]: o rótulo registrável
// primeiro, depois os subdomínios; os sufixos (com.br, .net, .online) saem.
function rotulosDoDominio(dominio) {
  const d = normalizarProducao(dominio);
  if (!d) return [];
  const labels = d.split('.');
  while (labels.length > 1 && (labels[labels.length - 1].length <= 3 || SUFIXOS_PUBLICOS.has(labels[labels.length - 1]))) labels.pop();
  return [...new Set([labels[labels.length - 1], ...labels.slice(0, -1).reverse()])].filter(Boolean);
}

// As palavras da razão social que identificam a empresa (sem LTDA, sem
// "comércio", sem preposição): a base é a razão social sem sufixo societário,
// as fortes são as palavras que sobram, da maior para a menor.
function palavrasDaRazao(razao) {
  const brutos = String(razao || '').replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/).filter(Boolean);
  const chave = (t) => semAcento(t).toLowerCase();
  const semSufixo = brutos.filter((t) => !SUFIXOS_SOCIETARIOS.has(chave(t)));
  const fortes = semSufixo.map(chave).filter((t) => t.length >= 4 && !PALAVRAS_GENERICAS.has(t) && !/^\d+$/.test(t));
  return { base: semSufixo.join(' '), fortes: [...new Set(fortes)].sort((a, b) => b.length - a.length) };
}

// A escada: [{ termo, tipo }], do mais certeiro ao mais largo. tipo 'razao' é
// a razão social (inteira ou sem sufixo) e é o único que vale como certeiro;
// 'dominio' (rótulos do domínio) e 'palavra' (palavra forte da razão social)
// são largos e só confirmam pela produção.
function termosDeBusca({ razao, dominio }) {
  const termos = [];
  const chaveT = (t) => semAcento(t).toLowerCase();
  // A razão social inteira entra sempre (mesmo curta, como "HP"); os termos
  // derivados precisam de 3 letras para não virarem busca de tudo.
  const add = (termo, tipo, minimo = 3) => {
    const t = String(termo || '').trim().replace(/\s+/g, ' ');
    if (t.length < minimo || termos.some((x) => chaveT(x.termo) === chaveT(t))) return;
    termos.push({ termo: t, tipo });
  };
  const nome = String(razao || '').trim().replace(/\s+/g, ' ');
  if (nome) add(nome, 'razao', 1);
  const { base, fortes } = palavrasDaRazao(nome);
  if (base) add(base, 'razao');
  for (const lab of rotulosDoDominio(dominio)) {
    if (lab.length >= 4) add(lab, 'dominio');
    if (lab.includes('-')) {
      // "turbo-gerais" → "turbogerais", "turbo", "gerais": as partes já são a
      // busca por pedaço; o prefixo abaixo é só para rótulo colado.
      add(lab.replace(/-/g, ''), 'dominio');
      for (const p of lab.split('-')) if (p.length >= 4) add(p, 'dominio');
    } else if (lab.length >= 9) {
      // "turbogeraiscomercio" → "turbog": o nome do cliente no painel pode ser
      // só o começo do rótulo.
      add(lab.slice(0, 6), 'dominio');
    }
  }
  for (const w of fortes.slice(0, 4)) add(w, 'palavra');
  return termos.slice(0, MAX_TERMOS);
}

// O nome do projeto cita o domínio? É o filtro barato que decide se vale
// abrir a página pesada de um projeto achado por termo largo.
function projetoCitaDominio(nome, dominio) {
  const n = String(nome || '').toLowerCase().replace(/^www\./, '').trim();
  const d = normalizarProducao(dominio);
  if (!n || !d) return false;
  if (n === d || n.includes(d)) return true;
  const [rotulo] = rotulosDoDominio(d);
  return !!rotulo && rotulo.length >= 5 && n.replace(/[^a-z0-9]/g, '').includes(rotulo.replace(/-/g, ''));
}

// Orquestra. rodar(script) roda na janela logada e devolve o objeto (ou estoura).
//
// Sobe a escada de termos (ADR-144). Em cada termo, lista os clientes e, de
// cada um, os projetos (barato). A página pesada de um projeto só abre quando o
// termo é a razão social com poucos clientes, ou quando o nome do projeto cita
// o domínio; e abre no máximo MAX_PAGINAS_PESADAS por site. Quem decide é o
// temporário da planilha ou a URL de produção do contrato: ao bater, para.
async function acharContratoNoPainel(rodar, { razao, temporario, dominio }, push = () => {}) {
  const nome = String(razao || '').trim().replace(/\s+/g, ' ');
  const alvo = normalizarTemporario(temporario);
  const dom = normalizarProducao(dominio);
  const termos = termosDeBusca({ razao: nome, dominio: dom });
  if (!termos.length) return { erro: 'sem razão social nem domínio na planilha para buscar no painel' };

  const vistos = new Set();       // clientes já examinados (id)
  const contratos = [];           // tudo o que foi aberto
  const precisos = new Set();     // clientes achados pela razão social (poucos)
  const contratosPrecisos = [];
  const tentados = [];
  let precisoFeito = false;       // a primeira busca pela razão social que achou alguém define os precisos
  let pesadas = 0;
  let largaDemais = 0;            // a razão social trouxe mais clientes que MAX_CLIENTES
  let algumCliente = false;

  const decidir = (lista) => ({
    ...escolherContrato({ contratos: lista, temporario, nClientes: precisos.size, dominio: dom, contratosPrecisos }),
    contratos, termos: tentados,
  });

  for (const { termo, tipo } of termos) {
    const como = tipo === 'razao' ? '' : tipo === 'dominio' ? ' (parte do domínio)' : ' (palavra da razão social)';
    push(`Painel: buscando "${termo}"${como}`, 'cmd');
    tentados.push(termo);
    const busca = await rodar(JS_BUSCAR_CLIENTES(termo));
    let clientes = busca.clientes || [];
    if (!clientes.length) { push(`Painel: nenhum cliente com "${termo}".`, 'info'); continue; }
    algumCliente = true;
    // Várias respostas: fica a de nome idêntico, se houver.
    const identicos = clientes.filter((c) => String(c.empresa || '').trim().toLowerCase() === termo.toLowerCase());
    if (clientes.length > 1 && identicos.length === 1) clientes = identicos;
    const preciso = tipo === 'razao' && !precisoFeito && clientes.length <= MAX_CLIENTES;
    if (tipo === 'razao') { precisoFeito = true; if (clientes.length > MAX_CLIENTES) largaDemais = Math.max(largaDemais, clientes.length); }
    if (clientes.length > MAX_CLIENTES_POR_TERMO) { push(`Painel: "${termo}" trouxe ${clientes.length} clientes, largo demais; pulei.`, 'info'); continue; }
    const novos = clientes.filter((c) => !vistos.has(c.id));
    push(`Painel: ${clientes.length} cliente(s)${novos.length !== clientes.length ? `, ${novos.length} novo(s)` : ''}: ${novos.map((c) => `${c.empresa} (${c.id})`).join(', ') || 'nenhum novo'}`, 'info');

    for (const cli of novos) {
      vistos.add(cli.id);
      if (preciso) precisos.add(cli.id);
      const { projetos = [] } = await rodar(JS_PROJETOS_DO_CLIENTE(cli.id));
      for (const pj of ordenarProjetos(projetos, dom)) {
        // Termo largo: só vale abrir a página pesada se o projeto cita o domínio.
        if (!preciso && !projetoCitaDominio(pj.nome, dom)) { push(`Painel: ${cli.empresa} / ${pj.nome || pj.projeto} não cita ${dom || 'o domínio'}; não abri.`, 'info'); continue; }
        if (pesadas >= MAX_PAGINAS_PESADAS) { push(`Painel: já abri ${pesadas} projetos para este site; não abro mais.`, 'warn'); break; }
        pesadas++;
        push(`Painel: lendo os contratos do projeto ${pj.nome || pj.projeto} (a página do painel leva de 20 a 50s)`, 'cmd');
        const { contratos: ks = [] } = await rodar(JS_CONTRATOS_DO_PROJETO(cli.id, pj.projeto));
        for (const k of ks) {
          const site = await rodar(JS_SITE_DO_CONTRATO(cli.id, pj.projeto, k));
          const c = { cliente: cli.id, empresa: cli.empresa, projeto: pj.projeto, projetoNome: pj.nome, contrato: k, temporario: site.temporario, producao: site.producao, status: site.status, termo };
          contratos.push(c);
          if (preciso) contratosPrecisos.push(c);
          push(`Painel: ${pj.nome || pj.projeto} / contrato ${k}: temporário ${normalizarTemporario(site.temporario) || '(nenhum)'}, produção ${normalizarProducao(site.producao) || '(nenhuma)'}`, 'info');
          // Temporário bateu: é esse. Não precisa abrir os outros projetos.
          if (alvo && normalizarTemporario(site.temporario) === alvo) return decidir([c]);
          // Sem temporário na planilha, o contrato publicado no domínio é o
          // certo (ADR-144), e também não precisa abrir o resto.
          if (!alvo && producaoEh(c, dom)) return decidir([c]);
        }
      }
    }
  }

  if (!algumCliente) {
    const outros = tentados.slice(1).map((t) => `"${t}"`).join(', ');
    return { erro: `nenhum cliente no painel com "${nome || dom}"${outros ? ` (tentei também ${outros})` : ''}`, termos: tentados };
  }
  const r = decidir(contratos);
  if (r.ok) return r;
  if (largaDemais && !precisos.size) {
    return { ...r, erro: `a busca por "${nome}" trouxe ${largaDemais} clientes e nenhum projeto deles está publicado em ${dom || '(domínio não informado)'}; confira a razão social` };
  }
  if (!contratos.length && !precisos.size) {
    return { ...r, erro: `achei ${vistos.size} cliente(s) com ${tentados.map((t) => `"${t}"`).join(', ')}, mas nenhum projeto deles cita ${dom || 'o domínio'}; não abri nenhum` };
  }
  if (pesadas >= MAX_PAGINAS_PESADAS) r.erro += ` (parei em ${pesadas} projetos abertos)`;
  return r;
}

module.exports = {
  PAINEL_HOST, DOMINIO_TEMPORARIO, MAX_PAGINAS_PESADAS, normalizarTemporario, normalizarProducao, producaoEh, pareceTemporario, linkDoContrato, ordenarProjetos,
  rotulosDoDominio, palavrasDaRazao, termosDeBusca, projetoCitaDominio,
  escolherContrato, acharContratoNoPainel,
  JS_BUSCAR_CLIENTES, JS_PROJETOS_DO_CLIENTE, JS_CONTRATOS_DO_PROJETO, JS_SITE_DO_CONTRATO,
};
