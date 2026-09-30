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

// É publicação? Se for MPI+ (temporário *.mpitemporario.com.br com subdomínio de
// cliente, ou "MPI+" no assunto), devolve domínio final + temporário e elegível.
// Busca One (producao.mpitemporario / deploy.buscacliente / "apontado via
// registro") entra como não-elegível (fase 2).
function triarPublicacao(tarefa) {
  const assunto = tarefa.assunto || tarefa.Subject || '';
  if (!RE_PUBLICACAO.test(assunto)) return null;
  const texto = `${assunto}\n${tarefa.descricao || tarefa.Description || ''}`;
  const hosts = hostsDoTexto(texto);
  const temp = hosts.find((h) => h.endsWith('.' + TEMP_MPI) && h.split('.')[0] !== 'producao');
  const ehMpiMais = !!temp || /mpi\s*\+/i.test(assunto);
  if (!ehMpiMais) return { tipo: 'publicacao', marca: null, elegivel: false, motivo: 'Busca One (Bitbucket/Guacamole) — fase 2' };
  const doAssunto = dominioDoAssunto(assunto);
  const dominio = doAssunto && !doAssunto.endsWith(TEMP_MPI)
    ? doAssunto
    : (hosts.find((h) => !h.endsWith(TEMP_MPI) && !h.endsWith('buscacliente.com.br')) || '');
  const elegivel = !!(dominio && temp);
  return { tipo: 'publicacao', marca: 'mpiplus', elegivel, dominio, temporario: temp || '', motivo: elegivel ? '' : 'faltou domínio final ou link temporário na tarefa' };
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
};
// Dual: Node (main/testes) e navegador (renderer, via <script>).
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.Triagem = _exports;
})();
