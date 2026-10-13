// Catálogo dos agentes do Escritório (ADR-149): quem existe, de que sala é,
// que módulos do Hub cobre, que canais pode chamar, que parâmetros um plano
// precisa trazer e as REGRAS DE EXECUÇÃO, que são pré-condições em código,
// com nome legível, conferidas antes de qualquer ação. O modelo lê este
// catálogo (nome, descrição, parâmetros) para encaminhar; as regras ele nunca
// avalia, só o código.
//
// `modo`: 'auto' executa sozinho quando o modo automático e o próprio agente
// estão ligados; 'standby' só roda quando você aciona pelo Hub (o orquestrador
// pode sugerir, nunca acionar).
//
// Dual (Node e navegador): a tela lê nomes e salas daqui.
(function () {
const Triagem = (typeof require !== 'undefined' ? require('../triagem') : window.Triagem);

// Os nomes vêm da mitologia nórdica (pedido de 13/10/2026); o papel (o que
// cada um faz) e os módulos do Hub ficam ao lado em toda tela. Os `id`s não
// mudam: são o que a loja e as regras guardam.
const ORQUESTRADOR = { id: 'orquestrador', nome: 'Odin', papel: 'Orquestrador', descricao: 'Lê a fila, decide e distribui; vê tudo da Sala de Comando.' };

// Nome de cada módulo do Hub, para o rótulo dos agentes (o mesmo da barra lateral).
const MODULOS = { merge: 'Mergear PRs', publish: 'Publicar MPI+', bulk: 'Publicação em Massa', vinculos: 'Conferir Vínculos', relatorio: 'Planilha do Relatório', newproject: 'Propriedades Google', ouvidoria: 'Ouvidoria & Auditoria', quando: 'Quando publicou', doutor: 'Bloquear Contatos', ssl: 'Ativação SSL / E-mails', suspender: 'Suspensão & E-mails' };
const rotuloModulos = (ids) => (ids || []).map((m) => MODULOS[m] || m).join(' / ');

const SALAS = [
  { numero: '01', nome: 'SALA DE COMANDO', ocupante: 'orquestrador' },
  { numero: '02', nome: 'PUBLICAÇÃO', ocupante: 'publicador-mpiplus' },
  { numero: '03', nome: 'BUSCA ONE', ocupante: 'publicador-buscaone' },
  { numero: '04', nome: 'CONTATOS', ocupante: 'bloqueador' },
  { numero: '05', nome: 'HOSPEDAGEM', ocupante: 'hospedagem' },
  { numero: '06', nome: 'INTEGRAÇÃO', ocupante: 'integrador' },
  { numero: '07', nome: 'AUDITORIA', ocupante: 'auditor' },
  { numero: '08', nome: 'VÍNCULOS', ocupante: 'conferente' },
  { numero: '09', nome: 'RELATÓRIO', ocupante: 'relator' },
];

// ---------- regras de execução reutilizáveis ----------
//
// Cada regra: { id, nome, descricao, testar(params, ctx) → { ok, motivo } }.
// `ctx` é o que o processo principal oferece para a verificação:
//   configurado(id)          → bool (os ids da auditoria de credenciais)
//   emEspera(dominio)        → entrada da lista de espera do DNS, ou null
//   marcaDoDominio(dominio)  → Promise<'bc'|'mpisolutions'|'mpiplus'|null>
//   tarefasComDominio(dom)   → tarefas do Escritório (outras) com esse domínio
// Verificação que o contexto não oferece não passa: fica barrada com o
// motivo "verificação indisponível", nunca aprovada no escuro.
function regra(id, nome, descricao, testar) { return { id, nome, descricao, testar }; }

const dominioValido = regra('dominio-valido', 'Domínio válido',
  'O domínio do plano tem cara de domínio e não é host da nossa infraestrutura.',
  (p) => {
    const d = Triagem.limparDominio(p.dominio);
    if (!d || !Triagem.pareceDominio(d)) return { ok: false, motivo: `domínio inválido: "${p.dominio || ''}"` };
    if (Triagem.ehHostInfra(d)) return { ok: false, motivo: `${d} é host da infraestrutura, não de cliente` };
    return { ok: true };
  });

const naoDuplicada = regra('nao-duplicada', 'Sem duplicidade',
  'Nenhuma outra tarefa do Escritório com o mesmo domínio está executando ou já foi concluída por este agente.',
  (p, ctx, agente) => {
    if (typeof ctx.tarefasComDominio !== 'function') return { ok: false, motivo: 'verificação indisponível (sem acesso às tarefas)' };
    const d = Triagem.limparDominio(p.dominio);
    const outras = (ctx.tarefasComDominio(d) || []).filter((t) => t && t.id !== p.tarefaId && t.agente === agente.id);
    const ativa = outras.find((t) => t.estado === 'executando');
    if (ativa) return { ok: false, motivo: `a tarefa ${ativa.id} já está executando para ${d}` };
    const feita = outras.find((t) => t.estado === 'concluida');
    if (feita) return { ok: false, motivo: `a tarefa ${feita.id} já concluiu ${d} com este agente; se for refazer, confirme à mão` };
    return { ok: true };
  });

const configurado = (id, nome) => regra(`config-${id}`, nome,
  `A credencial "${nome}" está gravada nesta máquina.`,
  (p, ctx) => {
    if (typeof ctx.configurado !== 'function') return { ok: false, motivo: 'verificação indisponível (sem auditoria de credenciais)' };
    return ctx.configurado(id) ? { ok: true } : { ok: false, motivo: `${nome} não configurado (Configurações)` };
  });

const naoEmEspera = regra('nao-em-espera', 'Fora da lista de espera',
  'O domínio não está na lista "Aguardando a propagação / o cliente" do Publicar MPI+ (ADR-103, ADR-142).',
  (p, ctx) => {
    if (typeof ctx.emEspera !== 'function') return { ok: false, motivo: 'verificação indisponível (lista de espera não recebida do Hub)' };
    const e = ctx.emEspera(Triagem.limparDominio(p.dominio));
    return e ? { ok: false, motivo: `${p.dominio} já foi publicado e está na lista de espera (${e.motivo || 'aguardando o DNS'})` } : { ok: true };
  });

const temporarioMpiPlus = regra('temporario-mpiplus', 'Temporário MPI+',
  'O link temporário é cliente.mpitemporario.com.br, que é onde um site MPI+ fica antes de publicar.',
  (p) => {
    const t = Triagem.limparDominio(p.temporario);
    if (!t) return { ok: false, motivo: 'sem link temporário na tarefa' };
    if (!t.endsWith('.' + Triagem.TEMP_MPI) || t.split('.')[0] === 'producao') return { ok: false, motivo: `${t} não é um temporário MPI+` };
    return { ok: true };
  });

const empresaDeterminada = regra('empresa-determinada', 'Empresa determinada',
  'A empresa (Busca Cliente ou MPI Solutions) vem do temporário, do caso da tarefa ou da fila.',
  (p) => {
    if (p.marca === 'bc' || p.marca === 'mpisolutions') return { ok: true };
    if (p.empresaFila === 'bc' || p.empresaFila === 'mpisolutions') return { ok: true };
    if (p.link) return { ok: true }; // o caso da tarefa diz (ADR-123); o driver confere
    return { ok: false, motivo: 'nem o temporário, nem a fila, nem um caso dizem de que empresa é o projeto' };
  });

const marcaPeloIp = regra('marca-pelo-ip', 'Marca pelo apontamento',
  'O domínio aponta para um IP conhecido de uma das marcas; IP desconhecido não chuta (ADR-119).',
  async (p, ctx) => {
    if (typeof ctx.marcaDoDominio !== 'function') return { ok: false, motivo: 'verificação indisponível (sem resolução de DNS)' };
    const r = await ctx.marcaDoDominio(Triagem.limparDominio(p.dominio));
    const marca = r && typeof r === 'object' ? r.marca : r;
    if (!marca) return { ok: false, motivo: `não descobri a marca de ${p.dominio} pelo IP${r && r.ips && r.ips.length ? ` (${r.ips.join(', ')})` : ''}` };
    return { ok: true, detalhe: marca };
  });

const credencialDaMarca = regra('credencial-da-marca', 'Credencial do painel da marca',
  'Busca Cliente e MPI Solutions usam o /doutor; MPI+ usa o painel idealplus (ADR-116, ADR-121).',
  async (p, ctx) => {
    if (typeof ctx.configurado !== 'function') return { ok: false, motivo: 'verificação indisponível' };
    const marca = p.marca || (typeof ctx.marcaDoDominio === 'function' ? (await ctx.marcaDoDominio(Triagem.limparDominio(p.dominio)) || {}).marca : null);
    if (marca === 'mpiplus') return ctx.configurado('painel') ? { ok: true } : { ok: false, motivo: 'painel MPI+ sem login (Configurações)' };
    if (marca === 'bc' || marca === 'mpisolutions') return ctx.configurado('doutor') ? { ok: true } : { ok: false, motivo: '/doutor sem senha (Configurações)' };
    return { ok: false, motivo: 'marca desconhecida' };
  });

const verificacaoFase = (id, nome, descricao) => regra(id, nome, descricao, () => ({ ok: false, motivo: 'verificação ainda não implementada (fase 3)' }));

// ---------- os agentes ----------
const AGENTES = [
  {
    id: 'publicador-mpiplus', nome: 'Thor', papel: 'Publicador MPI+', funcao: 'PUBLICAÇÃO MPI+', sala: '02', modo: 'auto',
    modulos: ['publish', 'bulk'],
    descricao: 'Publica um site MPI+ do começo ao fim: contato técnico no Registro.br, zona na Cloudflare, nameservers, aprovar e publicar no painel, SSL, propriedades do Google e planilha, e fecha a tarefa. Também roda a Publicação em Massa quando você aciona.',
    tipos: [{ tipo: 'publicacao', plataforma: 'mpiplus' }],
    parametros: { obrigatorios: ['dominio', 'temporario'], opcionais: ['link', 'empresaFila', 'razao'] },
    ferramentas: ['salesforce:contexto', 'salesforce:contaPorDominio', 'painel:acharContrato', 'painel:publicar', 'painel:sync', 'painel:servidores', 'dns:fotografar', 'dns:backup', 'dns:apontando', 'cloudflare:montarZona', 'cloudflare:aplicar', 'registrobr:consultar', 'registrobr:trocarNs', 'google:createProject', 'planilha:registrar', 'salesforce:fecharTarefa'],
    regrasExecucao: [dominioValido, temporarioMpiPlus, naoEmEspera, naoDuplicada, configurado('google_sa', 'Google Service Account'), configurado('painel', 'Painel MPI+'), configurado('salesforce', 'Salesforce')],
  },
  {
    id: 'publicador-buscaone', nome: 'Freyr', papel: 'Publicador Busca One', funcao: 'PROPRIEDADES E GERAL.PHP', sala: '03', modo: 'auto',
    modulos: ['newproject'],
    descricao: 'A parte automática de uma publicação Busca One (Busca Cliente ou MPI Solutions): cria ou acha as propriedades no Google, commita o geral.php no Bitbucket e manda o e-mail de vhost; a tarefa vai para Em andamento e fica aberta.',
    tipos: [{ tipo: 'publicacao', plataforma: 'buscaone' }],
    parametros: { obrigatorios: ['dominio'], opcionais: ['temporario', 'repositorio', 'idPainel', 'marca', 'link', 'empresaFila'] },
    ferramentas: ['salesforce:contexto', 'google:createProject', 'bitbucket:commitGeral', 'mail:sendBatch', 'salesforce:moverTarefa'],
    regrasExecucao: [dominioValido, empresaDeterminada, naoDuplicada, configurado('google_sa', 'Google Service Account'), configurado('bitbucket', 'Bitbucket API'), configurado('microsoft', 'Microsoft Graph')],
  },
  {
    id: 'bloqueador', nome: 'Tyr', papel: 'Bloqueador de Contatos', funcao: 'BLOQUEIO DE CONTATOS', sala: '04', modo: 'auto',
    modulos: ['doutor'],
    descricao: 'Censura os contatos do site de um cliente: no /doutor (Busca Cliente, MPI Solutions) ou no painel MPI+, e fecha a tarefa comentando "Contatos removidos".',
    tipos: [{ tipo: 'bloqueio' }],
    parametros: { obrigatorios: ['dominio'], opcionais: ['link', 'marca'] },
    ferramentas: ['dns:marca', 'doutor:bloquear', 'painel:bloquear', 'salesforce:fecharTarefa'],
    regrasExecucao: [dominioValido, marcaPeloIp, credencialDaMarca, naoDuplicada, configurado('salesforce', 'Salesforce')],
  },
  {
    id: 'hospedagem', nome: 'Huginn', papel: 'Hospedagem & E-mails', funcao: 'SSL E SUSPENSÃO', sala: '05', modo: 'auto',
    modulos: ['ssl', 'suspender'],
    descricao: 'Confere para onde cada domínio aponta e manda ao suporte da M3 o pedido de ativação de SSL ou de suspensão, pela sua caixa do Outlook. Ação sem desfazer: só com os domínios na faixa da M3.',
    tipos: [{ tipo: 'ssl' }, { tipo: 'suspensao' }],
    parametros: { obrigatorios: ['dominios', 'acao'], opcionais: ['link', 'projeto'] },
    ferramentas: ['dns:checkBatch', 'mail:sendBatch', 'salesforce:fecharTarefa'],
    regrasExecucao: [configurado('microsoft', 'Microsoft Graph'), verificacaoFase('dominios-na-m3', 'Domínios na faixa da M3', 'Todos os domínios do pedido apontam para a faixa da M3 (ADR-025).'), verificacaoFase('email-nao-repetido', 'E-mail não repetido', 'Nenhum e-mail já saiu para o mesmo domínio por esta tarefa.')],
  },
  {
    id: 'integrador', nome: 'Ratatoskr', papel: 'Integrador', funcao: 'MERGE DE PRS', sala: '06', modo: 'standby',
    modulos: ['merge'],
    descricao: 'Mergeia um pull request do Bitbucket. Só sozinho com aprovação e build verde; sem isso, pede confirmação.',
    tipos: [{ tipo: 'merge' }],
    parametros: { obrigatorios: ['prUrl'], opcionais: ['link'] },
    ferramentas: ['pr:fetch', 'pr:merge'],
    regrasExecucao: [configurado('bitbucket', 'Bitbucket API'), verificacaoFase('pr-aprovado', 'PR aprovado', 'O PR tem ao menos uma aprovação.'), verificacaoFase('build-verde', 'Build verde', 'O último build do PR passou.')],
  },
  {
    id: 'auditor', nome: 'Mímir', papel: 'Auditor', funcao: 'OUVIDORIA E DATAS', sala: '07', modo: 'standby',
    modulos: ['ouvidoria', 'quando'],
    descricao: 'Ouvidoria & Auditoria e Quando publicou: a partir de uma planilha ou lista sua. Só roda quando você aciona.',
    tipos: [], parametros: { obrigatorios: [], opcionais: [] }, ferramentas: ['salesforce:ouvidoria', 'publicacao:quando', 'appsheet:buscar'], regrasExecucao: [],
  },
  {
    id: 'conferente', nome: 'Heimdall', papel: 'Conferente de Vínculos', funcao: 'VÍNCULOS NO PAINEL', sala: '08', modo: 'standby',
    modulos: ['vinculos'],
    descricao: 'Conferir Vínculos: lê no painel MPI+ as Integrações e a Conexão do Relatório de cada cliente. Só roda quando você aciona.',
    tipos: [], parametros: { obrigatorios: [], opcionais: [] }, ferramentas: ['planilha:listar', 'painel:acharContrato', 'site:tags'], regrasExecucao: [],
  },
  {
    id: 'relator', nome: 'Bragi', papel: 'Relator', funcao: 'PLANILHA DO RELATÓRIO', sala: '09', modo: 'standby',
    modulos: ['relatorio'],
    descricao: 'Planilha do Relatório: as 19 colunas do painel preenchidas pelo Salesforce, pelo site e pelo Google. Só roda quando você aciona.',
    tipos: [], parametros: { obrigatorios: [], opcionais: [] }, ferramentas: ['relatorio:salesforce', 'relatorio:site', 'relatorio:geralPhp', 'relatorio:google'], regrasExecucao: [],
  },
];

for (const a of AGENTES) a.modulosNomes = rotuloModulos(a.modulos);

function agentePorId(id) { return AGENTES.find((a) => a.id === id) || null; }
// "Thor · Publicador MPI+ · Publicar MPI+ / Publicação em Massa": o nome, o
// papel e os módulos, para seletores e cartões.
function rotuloAgente(a) { return a ? `${a.nome} · ${a.papel} · ${a.modulosNomes}` : ''; }
function salaDe(agenteId) { return SALAS.find((s) => s.ocupante === agenteId) || null; }

// O agente que a triagem determinística (lib/triagem.js) já sabe escolher, e
// os parâmetros do plano. null quando a triagem não reconhece a tarefa.
function agentePorTriagem(tri) {
  if (!tri || tri.tipo === 'ignorar') return null;
  const a = AGENTES.find((ag) => (ag.tipos || []).some((t) => t.tipo === tri.tipo && (!t.plataforma || t.plataforma === tri.plataforma)));
  return a || null;
}

function parametrosDaTriagem(tri, tarefa) {
  const p = { dominio: tri.dominio || '' };
  if (tri.temporario) p.temporario = tri.temporario;
  if (tri.repositorio) p.repositorio = tri.repositorio;
  if (tri.idPainel) p.idPainel = tri.idPainel;
  if (tri.marca && tri.tipo === 'publicacao') p.marca = tri.marca;
  if (tarefa && tarefa.link) p.link = tarefa.link;
  if (tarefa && tarefa.empresaFila) p.empresaFila = tarefa.empresaFila;
  return p;
}

// O catálogo como o modelo vê: sem funções, sem canais.
function catalogoParaModelo() {
  return AGENTES.map((a) => ({
    id: a.id, nome: a.nome, papel: a.papel, modulos: a.modulosNomes, modo: a.modo, descricao: a.descricao,
    parametros: a.parametros,
    regras: (a.regrasExecucao || []).map((r) => r.nome),
  }));
}

const _exports = { ORQUESTRADOR, MODULOS, SALAS, AGENTES, agentePorId, rotuloAgente, rotuloModulos, salaDe, agentePorTriagem, parametrosDaTriagem, catalogoParaModelo, REGRAS_BASE: { dominioValido, naoDuplicada, naoEmEspera, temporarioMpiPlus, empresaDeterminada, marcaPeloIp, credencialDaMarca, configurado } };
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
if (typeof window !== 'undefined') window.EscritorioCatalogo = _exports;
})();
