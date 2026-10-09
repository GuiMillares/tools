// Comparação antes/depois do Hub nas publicações MPI+ (ADR-146).
//
// Puro: recebe as tarefas (como o salesforce:comparativoMpiPlus devolve), o
// dia de corte (quando o Hub passou a publicar MPI+) e "agora", e devolve os
// agregados de dois períodos de MESMA DURAÇÃO — o depois, do corte até agora,
// e o antes, com o mesmo número de dias terminando na véspera do corte — mais
// a série por mês para contexto. Nada aqui fala com a rede.
//
// Regras, as mesmas dos indicadores da tela inicial (ADR-138, ADR-143):
//   - concluída = fechada com status Concluído (cancelada não conta), pela data
//     de conclusão (CompletedDateTime; sem o campo, a última modificação);
//   - SLA = dias úteis da criação à conclusão, pela fórmula do relatório do
//     Salesforce (metricas.diasUteisEntre);
//   - publicação MPI+ = o critério da triagem da fila (triagem.triarPublicacao):
//     assunto "Publicação (Troca de DNS)…" e MPI+ no assunto ou temporário
//     *.mpitemporario.com.br no comentário. Publicação sem esse marcador é
//     contada à parte ("publicação sem marca") para a comparação dizer quando
//     o marcador faltou no histórico.
// Os períodos são definidos pelo corte, ANTES de olhar o resultado: a janela
// não é escolhida pelo número que dá.

(function () {
  'use strict';
  const { triarPublicacao } = (typeof require !== 'undefined' ? require('./triagem') : window.Triagem);
  const { diasUteisEntre, media, mediana } = (typeof require !== 'undefined' ? require('./metricas') : window.Metricas);

  const DIA_MS = 24 * 60 * 60 * 1000;
  const MES_DIAS = 365.25 / 12; // 30,44: "por mês" é por 30,44 dias

  // Data. "AAAA-MM-DD" é dia LOCAL: new Date('2026-09-22') seria meia-noite UTC,
  // que no Brasil é 21/09 às 21h, e o corte andaria um dia para trás.
  function data(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
    return isNaN(d) ? null : d;
  }
  function mesDe(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

  // Classifica uma tarefa: é publicação? é MPI+? está concluída (não cancelada)?
  function classificar(t) {
    const tri = triarPublicacao({ assunto: t.assunto || '', descricao: t.descricao || '' });
    const publicacao = !!tri;
    const mpiplus = !!(tri && tri.marca === 'mpiplus');
    const cancelada = !!t.cancelada || /cancel/i.test(String(t.status || ''));
    const criada = data(t.criada);
    const concluida = (t.fechada && !cancelada) ? data(t.concluida) : null;
    return { publicacao, mpiplus, semMarca: publicacao && !mpiplus && !tri.marca && !/busca|deploy\.buscaclientes|producao\.mpitemporario|apontado via registro/i.test(`${t.assunto || ''} ${t.descricao || ''}`), cancelada, criada, concluida };
  }

  function periodos(corte, agora) {
    const c = new Date(corte.getFullYear(), corte.getMonth(), corte.getDate());
    // Duração fracionária, igual nos dois lados: o depois vai do corte (00:00)
    // até agora; o antes tem EXATAMENTE a mesma duração, terminando no corte.
    const dias = Math.max(1, (agora - c) / DIA_MS);
    const antesInicio = new Date(c.getTime() - dias * DIA_MS);
    return {
      dias,
      meses: dias / MES_DIAS,
      antes: { inicio: antesInicio, fim: c, rotulo: `${fmt(antesInicio)} a ${fmt(new Date(c.getTime() - DIA_MS))}` },
      depois: { inicio: c, fim: agora, rotulo: `${fmt(c)} a ${fmt(agora)}` },
    };
  }
  function fmt(d) { return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }
  const dentro = (d, p) => d && d >= p.inicio && d < p.fim;

  // Agregados de um conjunto de tarefas classificadas num período.
  function agregarPeriodo(itens, p, euId) {
    const minhas = (x) => x.t.donoId === euId;
    const conclMpi = itens.filter((x) => x.c.mpiplus && dentro(x.c.concluida, p));
    const conclMpiMinhas = conclMpi.filter(minhas);
    const criadasMpi = itens.filter((x) => x.c.mpiplus && dentro(x.c.criada, p));
    const conclPub = itens.filter((x) => x.c.publicacao && dentro(x.c.concluida, p));
    const conclPubMinhas = conclPub.filter(minhas);
    const semMarca = itens.filter((x) => x.c.semMarca && dentro(x.c.concluida, p));
    const slas = (xs) => xs.map((x) => diasUteisEntre(x.c.criada, x.c.concluida)).filter((d) => d !== null && !isNaN(d));
    const sMinhas = slas(conclMpiMinhas);
    const sTodas = slas(conclMpi);
    const meses = Math.max(1 / MES_DIAS, (p.fim - p.inicio) / DIA_MS / MES_DIAS);
    return {
      dias: Math.round((p.fim - p.inicio) / DIA_MS),
      mpiplus: {
        concluidasMinhas: conclMpiMinhas.length,
        concluidasTodas: conclMpi.length,
        criadasTodas: criadasMpi.length,
        porMesMinhas: conclMpiMinhas.length / meses,
        porMesTodas: conclMpi.length / meses,
        criadasPorMes: criadasMpi.length / meses,
        slaMediaMinhas: media(sMinhas), slaMedianaMinhas: mediana(sMinhas), slaNMinhas: sMinhas.length,
        slaMediaTodas: media(sTodas), slaMedianaTodas: mediana(sTodas), slaNTodas: sTodas.length,
      },
      publicacoesQualquerMarca: { concluidasMinhas: conclPubMinhas.length, concluidasTodas: conclPub.length },
      publicacoesSemMarca: semMarca.length,
    };
  }

  function variacao(antes, depois) {
    if (antes === null || depois === null || antes === undefined || depois === undefined) return null;
    if (!antes) return depois ? null : 0;
    return ((depois - antes) / antes) * 100;
  }

  // A série por mês (YYYY-MM), do mês mais antigo pedido até o de "agora".
  function seriePorMes(itens, euId, inicio, agora) {
    const meses = [];
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    while (d <= agora) { meses.push(mesDe(d)); d.setMonth(d.getMonth() + 1); }
    const linha = () => ({ concluidasMpiMinhas: 0, concluidasMpiTodas: 0, criadasMpiTodas: 0, concluidasPubTodas: 0, semMarca: 0, slas: [] });
    const por = Object.fromEntries(meses.map((m) => [m, linha()]));
    for (const x of itens) {
      if (x.c.criada && x.c.mpiplus) { const m = mesDe(x.c.criada); if (por[m]) por[m].criadasMpiTodas++; }
      if (x.c.concluida) {
        const m = mesDe(x.c.concluida); if (!por[m]) continue;
        if (x.c.publicacao) por[m].concluidasPubTodas++;
        if (x.c.semMarca) por[m].semMarca++;
        if (x.c.mpiplus) {
          por[m].concluidasMpiTodas++;
          if (x.t.donoId === euId) { por[m].concluidasMpiMinhas++; const s = diasUteisEntre(x.c.criada, x.c.concluida); if (s !== null && !isNaN(s)) por[m].slas.push(s); }
        }
      }
    }
    return meses.map((m) => ({ mes: m, ...por[m], slaMediaMinhas: media(por[m].slas), slaN: por[m].slas.length, slas: undefined }));
  }

  // A comparação inteira. tarefas: [{ id, assunto, descricao, status, fechada,
  // cancelada, criada, concluida, donoId, donoTipo, criadoPorId }].
  function comparar(tarefas, { corte, agora = new Date(), euId, serieDesde } = {}) {
    const c = data(corte);
    if (!c) throw new Error('comparar: informe o dia de corte');
    const now = data(agora) || new Date();
    const itens = (tarefas || []).map((t) => ({ t, c: classificar(t) }));
    const p = periodos(c, now);
    const antes = agregarPeriodo(itens, p.antes, euId);
    const depois = agregarPeriodo(itens, p.depois, euId);
    const inicioSerie = data(serieDesde) || new Date(c.getFullYear() - 1, c.getMonth(), 1);
    return {
      corte: fmt(c), agora: fmt(now), diasPorPeriodo: p.dias, mesesPorPeriodo: p.meses,
      periodos: { antes: p.antes.rotulo, depois: p.depois.rotulo },
      antes, depois,
      melhora: {
        publicacoesPorMesMinhas: variacao(antes.mpiplus.porMesMinhas, depois.mpiplus.porMesMinhas),
        publicacoesPorMesTodas: variacao(antes.mpiplus.porMesTodas, depois.mpiplus.porMesTodas),
        criadasPorMes: variacao(antes.mpiplus.criadasPorMes, depois.mpiplus.criadasPorMes),
        // SLA: melhora é REDUÇÃO (positivo = ficou mais rápido)
        slaMinhas: antes.mpiplus.slaMediaMinhas && depois.mpiplus.slaMediaMinhas !== null ? -variacao(antes.mpiplus.slaMediaMinhas, depois.mpiplus.slaMediaMinhas) : null,
        slaTodas: antes.mpiplus.slaMediaTodas && depois.mpiplus.slaMediaTodas !== null ? -variacao(antes.mpiplus.slaMediaTodas, depois.mpiplus.slaMediaTodas) : null,
      },
      serie: seriePorMes(itens, euId, inicioSerie, now),
      totais: { tarefas: itens.length, publicacoes: itens.filter((x) => x.c.publicacao).length, mpiplus: itens.filter((x) => x.c.mpiplus).length, semMarca: itens.filter((x) => x.c.semMarca).length },
      // Para conferir a conta fora do Hub, sem nome de cliente: só datas e flags.
      linhas: itens.filter((x) => x.c.publicacao).map((x) => ({ id: x.t.id, mpiplus: x.c.mpiplus, semMarca: x.c.semMarca, minha: x.t.donoId === euId, criada: x.c.criada ? x.c.criada.toISOString() : null, concluida: x.c.concluida ? x.c.concluida.toISOString() : null, sla: x.c.concluida ? diasUteisEntre(x.c.criada, x.c.concluida) : null })),
    };
  }

  const _exports = { classificar, periodos, agregarPeriodo, comparar, seriePorMes, variacao, mesDe, MES_DIAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = _exports;
  if (typeof window !== 'undefined') window.Comparativo = _exports;
})();
