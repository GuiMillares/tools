// Triagem das tarefas da fila para a automação (ADR-119).
//
// Funções PURAS: recebem a tarefa (como o salesforce:tarefas devolve) e, para a
// marca, o(s) IP(s) para onde o domínio aponta. Sem efeito colateral, para o
// monitor decidir o que fazer e para o teste cobrir os casos reais.
//
// Tipos de tarefa que a automação trata hoje:
//   - Publicação MPI+  → publica sozinha pelo painel (o que o Hub já faz).
//   - Bloqueio de contatos → censura os contatos no /doutor e fecha.
// Busca One (Busca Cliente / MPI Solutions) na publicação é fase 2 (Bitbucket +
// Guacamole + propriedades), então fica marcada como não-elegível.

// Embrulhado numa IIFE para não vazar nomes no escopo global do renderer
// (dois <script> clássicos compartilham escopo). module.exports segue para Node.
(function () {
// A marca pelo IP do apontamento (validado com o Guilherme).
const IPS_MARCA = {
  mpisolutions: ['149.18.103.138'],
  mpiplus: ['149.18.102.39'],
  bc: ['149.18.103.98', '149.18.103.99', '149.18.103.100', '149.18.103.101', '149.18.103.102', '149.18.103.103', '149.18.103.104', '149.18.103.105', '149.18.103.106'],
};

function marcaPorIp(ip) {
  const s = String(ip || '').trim();
  for (const marca of Object.keys(IPS_MARCA)) if (IPS_MARCA[marca].includes(s)) return marca;
  return null;
}

// Dado o conjunto de IPs que o domínio resolve, devolve a primeira marca que
// casar (null se nenhum IP conhecido).
function marcaPorIps(ips) {
  for (const ip of ips || []) { const m = marcaPorIp(ip); if (m) return m; }
  return null;
}

// Normaliza um domínio: tira protocolo, www, porta, caminho e barra final.
function limparDominio(v) {
  let s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return s;
}

// Todos os hosts (domínios) que aparecem num texto.
function hostsDoTexto(txt) {
  const re = /[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}(?:\.[a-z]{2,})?/gi;
  return [...new Set(Array.from(String(txt || '').matchAll(re)).map((m) => m[0].toLowerCase().replace(/^www\./, '')))];
}

// O domínio final vem depois do último " - " do assunto.
function dominioDoAssunto(assunto) {
  const partes = String(assunto || '').split(/\s-\s/);
  return partes.length > 1 ? limparDominio(partes[partes.length - 1]) : '';
}

const RE_PUBLICACAO = /publica[çc][ãa]o\s*\(troca de dns\)/i;
const RE_BLOQUEIO = /(bloqueio de contatos|retirar contatos)/i;
const TEMP_MPI = 'mpitemporario.com.br';

// Temporários da Busca One (ADR-132): onde o site fica antes da publicação
// sugere de que empresa é o projeto — producao.mpitemporario é da MPI
// Solutions, deploy.buscacliente é da Busca Cliente. É só sugestão: quem
// decide é o caso da tarefa e, depois, a fila (ADR-123).
const TEMP_BUSCA_ONE = { 'producao.mpitemporario.com.br': 'mpisolutions', 'deploy.buscacliente.com.br': 'bc' };

// Hosts da nossa infraestrutura e de links que aparecem em tarefa (Bitbucket,
// Salesforce, Google) e nunca são o domínio do cliente.
const HOSTS_INFRA = ['mpitemporario.com.br', 'buscacliente.com.br', 'idealtrends.com.br', 'idealtrends.io', 'bitbucket.org', 'atlassian.net', 'salesforce.com', 'force.com', 'google.com', 'm3solutions.com.br'];

function ehHostInfra(h) {
  const s = String(h || '').toLowerCase();
  return HOSTS_INFRA.some((d) => s === d || s.endsWith('.' + d));
}

// "cliente.com.br", "cliente.com": pelo menos um ponto, só letras, dígitos e
// hífen. "Cliente XYZ" depois do " - " do assunto não é domínio.
function pareceDominio(s) {
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(String(s || ''));
}

// A empresa sugerida pelo temporário da Busca One, ou null.
function empresaPeloTemporario(host) {
  return TEMP_BUSCA_ONE[String(host || '').toLowerCase()] || null;
}

// O ID do painel do cliente ($idProjetoBusca) escrito na tarefa: "ID 1234",
// "ID: 1234", "Id do painel 1234". Nunca o "id=" de uma URL (precisa de um
// separador antes do "ID") nem o número de um caso (8 dígitos): 1 a 6 dígitos.
function idPainelDoTexto(txt) {
  const re = /(?:^|[\s(\[:;,.-])id\s*(?:do\s+painel\s*)?[:#=.-]?\s*(\d{1,6})(?!\d)/i;
  const m = re.exec(String(txt || ''));
  return m ? m[1] : '';
}

// É publicação? Duas plataformas:
//   - MPI+ (temporário *.mpitemporario.com.br com subdomínio de cliente, ou
//     "MPI+" no assunto): domínio final + temporário; o Hub publica inteiro.
//   - Busca One (Busca Cliente / MPI Solutions: temporário
//     producao.mpitemporario / deploy.buscacliente, ou "Apontado via
//     registro."): domínio final (assunto, senão comentário), temporário se
//     houver, o "ID xxxx" do painel e a empresa sugerida pelo temporário. O Hub
//     faz a parte automática (propriedades, geral.php, e-mail de vhost) e a
//     tarefa fica aberta para o resto (ADR-132).
function triarPublicacao(tarefa) {
  const assunto = tarefa.assunto || tarefa.Subject || '';
  if (!RE_PUBLICACAO.test(assunto)) return null;
  const descricao = tarefa.descricao || tarefa.Description || '';
  const texto = `${assunto}\n${descricao}`;
  const hosts = hostsDoTexto(texto);
  const temp = hosts.find((h) => h.endsWith('.' + TEMP_MPI) && h.split('.')[0] !== 'producao');
  const ehMpiMais = !!temp || /mpi\s*\+/i.test(assunto);
  const doAssunto = dominioDoAssunto(assunto);
  if (!ehMpiMais) {
    const tempBo = hosts.find((h) => empresaPeloTemporario(h)) || '';
    const dominio = doAssunto && pareceDominio(doAssunto) && !ehHostInfra(doAssunto)
      ? doAssunto
      : (hosts.find((h) => !ehHostInfra(h)) || '');
    const idPainel = idPainelDoTexto(descricao) || idPainelDoTexto(assunto);
    return {
      tipo: 'publicacao', plataforma: 'buscaone', marca: null, elegivel: !!dominio, dominio,
      temporario: tempBo, idPainel, empresaSugerida: empresaPeloTemporario(tempBo),
      motivo: dominio ? '' : 'não achei o domínio final no assunto nem no comentário',
    };
  }
  const dominio = doAssunto && !doAssunto.endsWith(TEMP_MPI)
    ? doAssunto
    : (hosts.find((h) => !h.endsWith(TEMP_MPI) && !h.endsWith('buscacliente.com.br')) || '');
  const elegivel = !!(dominio && temp);
  return { tipo: 'publicacao', plataforma: 'mpiplus', marca: 'mpiplus', elegivel, dominio, temporario: temp || '', idPainel: '', empresaSugerida: null, motivo: elegivel ? '' : 'faltou domínio final ou link temporário na tarefa' };
}

// É bloqueio de contatos? Devolve o domínio (do assunto). A marca é decidida
// depois, pelo IP do apontamento (marcaPorIps).
function triarBloqueio(tarefa) {
  const assunto = tarefa.assunto || tarefa.Subject || '';
  if (!RE_BLOQUEIO.test(assunto)) return null;
  const dominio = dominioDoAssunto(assunto) || (hostsDoTexto(assunto)[0] || '');
  return { tipo: 'bloqueio', dominio, elegivel: !!dominio, motivo: dominio ? '' : 'não achei o domínio no assunto' };
}

// Triagem geral de uma tarefa aberta.
function triar(tarefa) {
  if (!tarefa || tarefa.fechada) return { tipo: 'ignorar', motivo: 'fechada' };
  return triarPublicacao(tarefa) || triarBloqueio(tarefa) || { tipo: 'ignorar', motivo: 'não é publicação nem bloqueio' };
}

const _exports = {
  IPS_MARCA, marcaPorIp, marcaPorIps, limparDominio, hostsDoTexto, dominioDoAssunto,
  triarPublicacao, triarBloqueio, triar, RE_PUBLICACAO, RE_BLOQUEIO, TEMP_MPI,
  TEMP_BUSCA_ONE, HOSTS_INFRA, ehHostInfra, pareceDominio, empresaPeloTemporario, idPainelDoTexto,
};
// Dual: Node (main/testes) e navegador (renderer, via <script>).
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.Triagem = _exports;
})();
