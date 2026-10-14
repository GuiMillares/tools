// A planta do Escritório (ADR-153): onde fica cada sala, cada mesa, cada
// porta e por onde os agentes andam. É só geometria e decisão, sem desenho:
// a tela 3D (renderer/escritorio-cena.js) lê daqui o que colocar em cada
// lugar, e o teste (tools/test-escritorio-planta.js) prova sem navegador que
// a planta fecha (sala dentro do piso, mesa dentro da sala, caminho que não
// atravessa parede) e que cada estado do agente vai para o lugar certo.
//
// Coordenadas em "metros", no plano do piso: x cresce para a direita, z
// cresce para a frente (para a câmera). O corredor corre ao longo do x, em
// z ∈ [-2, 2]; as salas da frente ficam em z > 2, as do fundo em z < -2.
// Cada sala tem uma faixa livre (a "pista") à direita da mesa do ocupante,
// em x = cx + 1.7, que vai da cadeira até a porta: é por ela que se entra e
// se sai, sem passar por cima da mesa.
//
// `dirigir(snapshot)` é o diretor de cena: a partir do snapshot do
// orquestrador diz onde cada figura deve estar (na mesa, na sala de reunião,
// na sala de comando, ausente), que ícone flutua sobre ela, como está a tela
// do monitor e em que mesa está cada tarefa (os "pacotes"). Puro: a mesma
// entrada dá sempre a mesma saída; a animação (andar de um lugar ao outro)
// é da tela, que compara o alvo novo com a posição atual.
//
// Dual (Node e navegador), como lib/triagem.js.
(function () {
const PISO = { x0: -26, x1: 26, z0: -14, z1: 14 };
const CORREDOR = { z0: -2, z1: 2 };
const COLUNAS = [-26, -15.6, -5.2, 5.2, 15.6, 26]; // 5 colunas de 10.4
const PISTA = 1.7;        // a faixa livre, à direita do centro da sala
const PORTA_LARGURA = 2.2;
const MESA = { largura: 2.2, profundidade: 1.0, altura: 0.76 };
const MESA_COMANDO = { largura: 3.2, profundidade: 1.1, altura: 0.78 };
const REUNIAO_RAIO = 1.8;

// Sala de reunião: não tem ocupante; é para onde vai quem espera você.
const REUNIAO = '10';
const COMANDO = '01';
const ORQUESTRADOR = 'orquestrador';

function sala(numero, nome, coluna, fila, extra) {
  const x0 = COLUNAS[coluna], x1 = COLUNAS[coluna + 1];
  const frente = fila === 'frente';
  const z0 = frente ? CORREDOR.z1 : PISO.z0;
  const z1 = frente ? PISO.z1 : CORREDOR.z0;
  const cx = (x0 + x1) / 2;
  const zMesa = frente ? 8 : -8;          // a mesa do ocupante
  // A mesa do comando é mais larga: fica deslocada para a esquerda para a
  // pista (cx + 1.7) continuar livre.
  const xMesa = numero === COMANDO ? cx - 0.5 : cx;
  const zCadeira = frente ? 9.4 : -9.4;   // a cadeira, atrás da mesa (olhando para o corredor)
  return Object.assign({
    numero, nome, x0, x1, z0, z1, cx, frente,
    porta: { x: cx + PISTA, z: frente ? CORREDOR.z1 : CORREDOR.z0 },
    pista: cx + PISTA,
    mesa: { x: xMesa, z: zMesa, rot: frente ? 0 : Math.PI, ...(numero === COMANDO ? MESA_COMANDO : MESA) },
    cadeira: { x: xMesa, z: zCadeira, rot: frente ? 0 : Math.PI },
    monitor: { x: xMesa, z: frente ? zMesa - 0.32 : zMesa + 0.32, rot: frente ? 0 : Math.PI },
    // Mesas vazias de decoração, dos dois lados da do ocupante.
    mesasExtras: [{ x: cx - 3.4, z: zMesa, rot: frente ? 0 : Math.PI }, { x: cx + 3.4, z: zMesa, rot: frente ? 0 : Math.PI }],
    planta: { x: x0 + 0.9, z: frente ? z1 - 0.9 : z0 + 0.9 },
    rotulo: { x: x0 + 0.6, z: frente ? z0 + 0.7 : z1 - 0.7 },
  }, extra || {});
}

const SALAS = [
  sala(COMANDO, 'SALA DE COMANDO', 4, 'frente', { ocupante: ORQUESTRADOR }),
  sala('02', 'PUBLICAÇÃO', 3, 'frente'),
  sala('03', 'BUSCA ONE', 2, 'frente'),
  sala('04', 'CONTATOS', 1, 'frente'),
  sala('05', 'HOSPEDAGEM', 0, 'frente'),
  sala('06', 'INTEGRAÇÃO', 0, 'fundo'),
  sala('07', 'AUDITORIA', 1, 'fundo'),
  sala('08', 'VÍNCULOS', 2, 'fundo'),
  sala('09', 'RELATÓRIO', 3, 'fundo'),
  sala(REUNIAO, 'SALA DE REUNIÃO', 4, 'fundo'),
];
for (const s of SALAS) {
  if (s.numero === REUNIAO) {
    // Mesa redonda no meio, sem mesa de trabalho nem monitor; seis lugares,
    // três de frente para o corredor (os primeiros a encher) e três atrás.
    delete s.mesa; delete s.cadeira; delete s.monitor; s.mesasExtras = [];
    s.mesaReuniao = { x: s.cx, z: -8, raio: REUNIAO_RAIO };
    const zFrente = -8 + REUNIAO_RAIO + 0.9, zFundo = -8 - REUNIAO_RAIO - 0.9;
    s.lugares = [
      { x: s.cx - 1.4, z: zFrente, rot: Math.PI }, { x: s.cx, z: zFrente, rot: Math.PI }, { x: s.cx + 1.4, z: zFrente, rot: Math.PI },
      { x: s.cx - 1.4, z: zFundo, rot: 0 }, { x: s.cx, z: zFundo, rot: 0 }, { x: s.cx + 1.4, z: zFundo, rot: 0 },
    ];
    // Para chegar aos lugares do fundo sem atravessar a mesa: pela lateral direita.
    s.lateral = s.cx + 3.6;
  }
  if (s.numero === COMANDO) {
    // Onde fica quem vem reportar (tarefa escalada): de pé, perto da porta.
    s.postos = [-3.4, -2.2, -1.0, 0.2].map((dx) => ({ x: s.cx + dx, z: 4.4, rot: Math.PI }));
  }
}

function salaPorNumero(n) { return SALAS.find((s) => s.numero === String(n)) || null; }
function salaDoPonto(p) {
  return SALAS.find((s) => p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1) || null;
}
const dentroDoCorredor = (p) => p.z >= CORREDOR.z0 && p.z <= CORREDOR.z1 && p.x >= PISO.x0 && p.x <= PISO.x1;

// O caminho de um ponto a outro, por onde se anda: pela pista da sala até a
// porta, pelo corredor (z = 0) até a porta da outra sala, pela pista dela
// até o lugar. Na sala de reunião, os lugares do fundo entram pela lateral.
function caminho(de, para) {
  const sDe = salaDoPonto(de), sPara = salaDoPonto(para);
  const pts = [{ x: de.x, z: de.z }];
  const sairDaSala = (s, p) => {
    if (s.numero === REUNIAO && p.z < s.mesaReuniao.z) { pts.push({ x: s.lateral, z: p.z }); pts.push({ x: s.lateral, z: s.porta.z - 2.5 }); pts.push({ x: s.pista, z: s.porta.z - 2.5 }); }
    else pts.push({ x: s.pista, z: p.z });
    pts.push({ x: s.porta.x, z: s.porta.z });
  };
  const entrarNaSala = (s, p) => {
    pts.push({ x: s.porta.x, z: s.porta.z });
    if (s.numero === REUNIAO && p.z < s.mesaReuniao.z) { pts.push({ x: s.pista, z: s.porta.z - 2.5 }); pts.push({ x: s.lateral, z: s.porta.z - 2.5 }); pts.push({ x: s.lateral, z: p.z }); }
    else pts.push({ x: s.pista, z: p.z });
  };
  if (sDe && sPara && sDe.numero === sPara.numero) {
    // Dentro da mesma sala: pela pista, para não atravessar a mesa.
    pts.push({ x: sDe.pista, z: de.z }); pts.push({ x: sDe.pista, z: para.z });
  } else {
    if (sDe) { sairDaSala(sDe, de); pts.push({ x: sDe.porta.x, z: 0 }); }
    if (sPara) { pts.push({ x: sPara.porta.x, z: 0 }); entrarNaSala(sPara, para); }
  }
  pts.push({ x: para.x, z: para.z });
  // Sem pontos repetidos em sequência.
  return pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) > 1e-6 || Math.abs(p.z - pts[i - 1].z) > 1e-6);
}
function comprimento(pts) { let c = 0; for (let i = 1; i < pts.length; i++) c += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return c; }

// Onde ficam os pacotes (tarefas) em cima de uma mesa: uma grade pequena.
function lugaresNaMesa(mesa, n, max) {
  const teto = max || 6;
  const colunas = 3, passo = 0.5;
  const out = [];
  for (let i = 0; i < Math.min(n, teto); i++) {
    const c = i % colunas, l = Math.floor(i / colunas);
    const dx = (c - 1) * passo, dz = (l - 0.5) * passo * 0.8;
    out.push({ x: mesa.x + dx, z: mesa.z + dz, y: mesa.altura != null ? mesa.altura : 0.76 });
  }
  return out;
}

// ---------- o diretor de cena ----------
//
// Estados de agente do orquestrador: ocioso, standby, trabalhando,
// aguardando, erro, desligado. Estados de tarefa: ver estados.js.
const ABERTAS_NA_MESA = ['planejada', 'aguardando_confirmacao', 'executando', 'falhou', 'aguardando_externo'];
const NA_MESA_DO_ODIN = ['na_fila', 'em_analise', 'escalada'];
const NA_REUNIAO = ['pendente'];

function dirigir(snap) {
  const s = snap || {};
  const agentes = Array.isArray(s.agentes) ? s.agentes : [];
  const tarefas = Array.isArray(s.tarefas) ? s.tarefas : [];
  const pendencias = (Array.isArray(s.pendencias) ? s.pendencias : []).filter((p) => p && p.status !== 'fechada');
  const reuniao = salaPorNumero(REUNIAO), comando = salaPorNumero(COMANDO);
  const figuras = [];
  const avisos = [];

  // Quem espera você na sala de reunião: um agente com pendência ou tarefa
  // pendente/interrompida; Odin, quando a pendência não é de agente nenhum.
  const esperaReuniao = (id) => pendencias.some((p) => p.agente === id && p.tipo !== 'sugestao') || tarefas.some((t) => t.agente === id && (NA_REUNIAO.includes(t.estado) || t.estado === 'interrompida'));
  const odinEspera = pendencias.some((p) => !p.agente && p.tipo !== 'sugestao');
  const reporta = (id) => tarefas.some((t) => t.agente === id && t.estado === 'escalada');

  let lugarReuniao = 0, postoComando = 0;
  const proximoLugar = (lista, i) => (lista && lista.length ? lista[Math.min(i, lista.length - 1)] : null);

  // Odin primeiro: é quem tem prioridade no lugar da frente da reunião.
  const orq = s.orquestrador || { id: ORQUESTRADOR, nome: 'Odin', papel: 'Orquestrador' };
  const odinNaReuniao = odinEspera && reuniao && reuniao.lugares.length;
  figuras.push({
    id: ORQUESTRADOR, nome: orq.nome || 'Odin', papel: orq.papel || 'Orquestrador', sala: COMANDO, modo: 'orquestrador', presente: true,
    estado: s.rodando ? 'trabalhando' : odinEspera ? 'aguardando' : 'ocioso',
    atividade: s.rodando ? 'lendo a fila' : '',
    alvo: odinNaReuniao ? { tipo: 'reuniao', ...proximoLugar(reuniao.lugares, lugarReuniao++) } : { tipo: 'mesa', ...comando.cadeira },
    icone: s.rodando ? 'fila' : odinEspera ? 'pergunta' : null,
    tela: s.rodando ? 'trabalhando' : 'ligada',
  });

  for (const a of agentes) {
    const salaA = salaPorNumero(a.sala && a.sala.numero);
    if (!salaA) { avisos.push(`agente ${a.id} sem sala na planta`); continue; }
    const presente = a.estado !== 'desligado';
    let alvo;
    if (!presente) alvo = { tipo: 'ausente', ...salaA.cadeira };
    else if (esperaReuniao(a.id) && reuniao) alvo = { tipo: 'reuniao', ...proximoLugar(reuniao.lugares, lugarReuniao++) };
    else if (reporta(a.id) && comando) alvo = { tipo: 'comando', ...proximoLugar(comando.postos, postoComando++) };
    else alvo = { tipo: 'mesa', ...salaA.cadeira };
    const icone = a.estado === 'trabalhando' ? 'trabalho' : a.estado === 'aguardando' ? 'pergunta' : a.estado === 'erro' ? 'erro' : null;
    const tela = !presente ? 'desligada' : a.estado === 'trabalhando' ? 'trabalhando' : a.modo === 'standby' ? 'standby' : 'ligada';
    figuras.push({ id: a.id, nome: a.nome, papel: a.papel || '', sala: salaA.numero, modo: a.modo, presente, estado: a.estado, atividade: a.atividade || '', alvo, icone, tela, tarefas: a.tarefas || 0 });
  }

  // Os pacotes: cada tarefa aberta em cima de uma mesa.
  const porLugar = new Map();
  const empilhar = (chave, t) => { if (!porLugar.has(chave)) porLugar.set(chave, []); porLugar.get(chave).push(t); };
  const salaDoAgente = (id) => { const a = agentes.find((x) => x.id === id); return a ? salaPorNumero(a.sala && a.sala.numero) : null; };
  for (const t of tarefas) {
    if (!t || ['concluida', 'ignorada'].includes(t.estado)) continue;
    const sA = t.agente ? salaDoAgente(t.agente) : null;
    if (NA_REUNIAO.includes(t.estado) && reuniao) empilhar('reuniao', t);
    else if (ABERTAS_NA_MESA.includes(t.estado) && sA) empilhar('sala:' + sA.numero, t);
    else empilhar('comando', t); // na_fila, em_analise, escalada, interrompida e o que não tem sala
  }
  const pacotes = [];
  const lugares = [];
  for (const [chave, lista] of porLugar) {
    let mesa;
    if (chave === 'reuniao') mesa = { x: reuniao.mesaReuniao.x, z: reuniao.mesaReuniao.z, altura: 0.76 };
    else if (chave === 'comando') mesa = comando.mesa;
    else mesa = salaPorNumero(chave.slice(5)).mesa;
    const pos = lugaresNaMesa(mesa, lista.length);
    lista.forEach((t, i) => { if (i < pos.length) pacotes.push({ id: t.id, estado: t.estado, tom: t.tom || 'neutral', agente: t.agente || null, lugar: chave, x: pos[i].x, z: pos[i].z, y: pos[i].y, assunto: t.assunto || '' }); });
    lugares.push({ lugar: chave, total: lista.length, visiveis: Math.min(lista.length, pos.length), x: mesa.x, z: mesa.z, y: mesa.altura != null ? mesa.altura : 0.76 });
  }

  return {
    figuras, pacotes, lugares, avisos,
    reuniao: { ocupantes: figuras.filter((f) => f.alvo.tipo === 'reuniao').map((f) => f.id), pendencias: pendencias.length },
    rotulos: SALAS.map((sl) => ({ numero: sl.numero, nome: sl.nome, x: sl.rotulo.x, z: sl.rotulo.z })),
  };
}

const _exports = { PISO, CORREDOR, COLUNAS, PISTA, PORTA_LARGURA, MESA, MESA_COMANDO, REUNIAO_RAIO, REUNIAO, COMANDO, ORQUESTRADOR, SALAS, salaPorNumero, salaDoPonto, dentroDoCorredor, caminho, comprimento, lugaresNaMesa, dirigir };
if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
else window.Planta = _exports;
})();
