// ADR-097: achar o caso da tarefa "Publicação V1 -> V2". A tarefa de publicação
// antiga dá a CONTA (pelo domínio); o caso é o do tipo "Ongoing CS" aberto dessa conta.
//
//     node tools/test-achar-caso.js

const path = require('path');
const { acharCasoDaPublicacao, criarSalesforce } = require(path.join(__dirname, '..', 'lib', 'salesforce'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// tarefas: busca global. casosAntigos: casos das tarefas antigas (com a conta).
// contas: busca por nome. casos: todos os casos, por conta (o LIKE 'Ongoing CS%' é simulado).
function sfFalso({ tarefas = [], casosAntigos = [], contas = [], casos = [], erroBusca = null, contasSosl = null } = {}) {
  const chamadas = [];
  return {
    chamadas,
    async buscar(q) {
      chamadas.push(['SOSL', q]);
      if (/RETURNING Account/.test(q)) return typeof contasSosl === 'function' ? contasSosl(q) : (contasSosl || []);
      if (erroBusca) throw erroBusca;
      return tarefas;
    },
    async consultar(q) {
      chamadas.push(['SOQL', q]);
      if (/FROM Account/.test(q)) return contas;
      if (/FROM Case WHERE Id IN/.test(q)) return casosAntigos.filter((c) => q.includes(`'${c.Id}'`));
      const m = q.match(/FROM Case WHERE AccountId = '([^']+)'/);
      if (m) return casos.filter((c) => c.AccountId === m[1]);
      return [];
    },
  };
}
const REUNIAO = { statusCasoApi: 'Reuniao_de_Nutricao', statusCasoRotulo: 'Reunião de Nutrição' };
const CS = (id, conta, status = 'Reuniao_de_Nutricao', fechado = false) => ({ Id: id, CaseNumber: id.slice(-5), AccountId: conta, Subject: `Ongoing CS - BC - ${conta}`, Status: status, IsClosed: fechado, RecordType: { Name: 'Ongoing CS', DeveloperName: 'Ongoing_CS' } });

(async () => {
  console.log('\n=== O print da LMARQUES: Ongoing CS é o TIPO do caso, o assunto vem vazio ===');
  {
    const sf = sfFalso({
      tarefas: [{ Id: '00T1', Subject: 'Publicação (Troca de DNS) - www.lmarquesrevestimentos.com.br', WhatId: '500bL00000XOM68' }],
      casosAntigos: [{ Id: '500bL00000XOM68', CaseNumber: '00081324', Subject: 'MPI+', IsClosed: true, AccountId: '001LM', Account: { Name: 'LMARQUES REVESTIMENTOS E PINTURAS LTDA' } }],
      casos: [
        { Id: '500OUV', CaseNumber: '00088689', AccountId: '001LM', Subject: 'Ouvidoria - LMARQUES REVESTIMENTOS E PINTURAS LTDA', Status: 'Concluido', IsClosed: true, RecordType: { Name: 'Ouvidoria' } },
        { Id: '500REC', CaseNumber: '00088428', AccountId: '001LM', Subject: null, Status: 'Triagem', IsClosed: false, RecordType: { Name: 'Reclamação Financeira' } },
        { Id: '500CS', CaseNumber: '00085674', AccountId: '001LM', Subject: null, Status: 'Reuniao_de_Nutricao', IsClosed: false, RecordType: { Name: 'Ongoing CS' } },
        { Id: '500bL00000XOM68', CaseNumber: '00081324', AccountId: '001LM', Subject: 'MPI+', Status: 'Fechado', IsClosed: true, RecordType: { Name: 'Onboarding' } },
      ],
    });
    const r = await acharCasoDaPublicacao(sf, { dominio: 'lmarquesrevestimentos.com.br', razao: 'LMARQUES REVESTIMENTOS E PINTURAS LTDA', ...REUNIAO });
    check('acha o 00085674 (tipo Ongoing CS, sem assunto)', r.casoId === '500CS' && !r.casoDaPublicacaoAntiga, JSON.stringify(r));
    check('diz que foi pelo Ongoing CS aberto', /caso 00085674 \(Ongoing CS aberto, em "Reuniao_de_Nutricao"\)/.test(r.como || ''), r.como);
    const qCaso = sf.chamadas.find(([, q]) => /AccountId = /.test(q))[1];
    check('lê o tipo de registro dos casos', /RecordType\.Name/.test(qCaso) && !/LIKE/.test(qCaso), qCaso);
  }

  console.log('\n=== Em Reunião de Nutrição mas sem ser do tipo Ongoing CS: não serve ===');
  {
    const sf = sfFalso({ contas: [{ Id: '001S', Name: 'S' }], casos: [
      { Id: '500SO', CaseNumber: '1', AccountId: '001S', Subject: null, Status: 'Reuniao_de_Nutricao', IsClosed: false, RecordType: null },
      { Id: '500GR', CaseNumber: '2', AccountId: '001S', Subject: null, Status: 'Reuniao_de_Nutricao', IsClosed: false, RecordType: { Name: 'Ongoing Growth' } },
    ] });
    const r = await acharCasoDaPublicacao(sf, { dominio: 's.com.br', razao: 'S', ...REUNIAO });
    check('nem o sem tipo nem o Growth: nenhum (e sem caso antigo, não cria)', r.casoId === null && /nenhum caso Ongoing CS aberto/.test(r.motivo), JSON.stringify(r));
  }

  console.log('\n=== Org sem tipo de registro no Caso: tenta de novo sem o campo ===');
  {
    let primeira = true;
    const sf = sfFalso({ contas: [{ Id: '001T', Name: 'T' }], casos: [CS('500T', '001T')] });
    const consultar = sf.consultar.bind(sf);
    sf.consultar = async (q) => {
      if (/RecordType/.test(q) && primeira) { primeira = false; throw Object.assign(new Error("INVALID_FIELD: No such relation 'RecordType'"), { status: 400 }); }
      return consultar(q);
    };
    const r = await acharCasoDaPublicacao(sf, { dominio: 't.com.br', razao: 'T', ...REUNIAO });
    check('achou mesmo assim', r.casoId === '500T', JSON.stringify(r));
  }

  console.log('\n=== Como no log: tarefa antiga no caso de implantação fechado ===');
  {
    const sf = sfFalso({
      tarefas: [{ Id: '00T1', Subject: 'Publicação (Troca de DNS) - www.lmarquesrevestimentos.com.br', Description: '', WhatId: '500IMPL00000001' }],
      casosAntigos: [{ Id: '500IMPL00000001', CaseNumber: '00081324', AccountId: '001LM', Account: { Name: 'LMARQUES REVESTIMENTOS E PINTURAS LTDA' } }],
      casos: [
        CS('500CSFECHADO001', '001LM', 'Encerrado', true),
        CS('500CSABERTO0001', '001LM'),
        { Id: '500GROWTH00001', AccountId: '001LM', Subject: 'Ongoing Growth - BC - LMARQUES', Status: 'Reuniao_de_Nutricao', IsClosed: false },
      ],
    });
    const r = await acharCasoDaPublicacao(sf, { dominio: 'lmarquesrevestimentos.com.br', razao: 'LMARQUES REVESTIMENTOS E PINTURAS LTDA', ...REUNIAO });
    check('vai para o Ongoing CS aberto da conta, não para o caso fechado da tarefa', r.casoId === '500CSABERTO0001', JSON.stringify(r));
    check('diz o caminho: tarefa → conta → Ongoing CS', /pela tarefa .* → conta LMARQUES .* → caso \S+ \(Ongoing CS aberto/.test(r.como || ''), r.como);
    check('a conta veio da tarefa, sem procurar pelo nome', !sf.chamadas.some(([t, q]) => t === 'SOQL' && /FROM Account/.test(q)));
  }

  console.log('\n=== Domínio só nos comentários da tarefa antiga ===');
  {
    const sf = sfFalso({
      tarefas: [
        { Id: '00T1', Subject: 'Publicação (Troca de DNS)', Description: 'domínio www.turbogerais.com.br\napontamento via registro', WhatId: '500IMPL00000002' },
        { Id: '00T2', Subject: 'Reunião de nutrição', Description: 'falamos do turbogerais.com.br', WhatId: '500OUTRO0000009' },   // não é publicação
        { Id: '00T3', Subject: 'Publicação (Troca de DNS)', Description: 'novoturbogerais.com.br', WhatId: '500OUTRO0000008' },  // outro domínio
      ],
      casosAntigos: [{ Id: '500IMPL00000002', AccountId: '001TG', Account: { Name: 'TURBO GERAIS COMERCIO LTDA' } }, { Id: '500OUTRO0000009', AccountId: '001ZZ', Account: { Name: 'OUTRA' } }],
      casos: [CS('500CSTG00000001', '001TG')],
    });
    const r = await acharCasoDaPublicacao(sf, { dominio: 'turbogerais.com.br', razao: 'TURBO GERAIS COMERCIO LTDA', ...REUNIAO });
    check('achou pelo comentário e ignorou as outras tarefas', r.casoId === '500CSTG00000001', JSON.stringify(r));
    const qIn = sf.chamadas.find(([t, q]) => /WHERE Id IN/.test(q))[1];
    check('só pergunta a conta do caso da tarefa certa', /'500IMPL00000002'/.test(qIn) && !/500OUTRO/.test(qIn), qIn);
  }

  console.log('\n=== Conta sem Ongoing CS aberto: registra no caso da publicação antiga ===');
  {
    const antigo = { Id: '500IMPL00000003', CaseNumber: '00078984', Subject: 'IMPLEMENTAÇÃO MPI SOLUTIONS - IMAX DIAGNOSTICO VETERINARIO LTDA', IsClosed: true, AccountId: '001IM', Account: { Name: 'IMAX DIAGNOSTICO VETERINARIO LTDA' } };
    const sf = sfFalso({
      tarefas: [{ Id: '00T1', Subject: 'Publicação (Troca de DNS)', Description: 'imax.vet.br', WhatId: antigo.Id }],
      casosAntigos: [antigo],
      casos: [CS('500CSIMAX000001', '001IM', 'Encerrado', true)],
    });
    const logs = [];
    const r = await acharCasoDaPublicacao(sf, { dominio: 'imax.vet.br', razao: 'IMAX DIAGNOSTICO VETERINARIO LTDA', ...REUNIAO }, (m, t) => logs.push({ m, t }));
    check('usa o caso da publicação antiga, mesmo fechado', r.casoId === antigo.Id && r.casoDaPublicacaoAntiga === true, JSON.stringify(r));
    check('explica por que (sem Ongoing CS aberto) e qual caso', /nenhum caso Ongoing CS aberto/.test(r.como) && /00078984/.test(r.como) && /\(fechado\)/.test(r.como), r.como);
    check('avisa no terminal', logs.some((l) => l.t === 'warn' && /caso da publicação antiga/.test(l.m)));

    const semCs = sfFalso({ tarefas: [{ Id: '00T9', Subject: 'Publicação (Troca de DNS) - y.com.br', WhatId: '500IMPL00000009' }], casosAntigos: [{ ...antigo, Id: '500IMPL00000009', AccountId: '001Y' }], casos: [] });
    const r2 = await acharCasoDaPublicacao(semCs, { dominio: 'y.com.br', razao: 'Y', ...REUNIAO });
    check('conta sem nenhum Ongoing CS: também vai no caso antigo', r2.casoId === '500IMPL00000009', JSON.stringify(r2));

    const doisAbertos = sfFalso({ tarefas: [{ Id: '00T8', Subject: 'Publicação (Troca de DNS) - z.com.br', WhatId: '500IMPL00000008' }], casosAntigos: [{ ...antigo, Id: '500IMPL00000008', AccountId: '001Z' }], casos: [CS('500Z1', '001Z'), CS('500Z2', '001Z')] });
    const r3 = await acharCasoDaPublicacao(doisAbertos, { dominio: 'z.com.br', razao: 'Z', ...REUNIAO });
    check('dois Ongoing CS em dúvida: vai no caso antigo em vez de chutar um deles', r3.casoId === '500IMPL00000008', JSON.stringify(r3));

    const duasTarefas = sfFalso({
      tarefas: [
        { Id: '00TN', Subject: 'Publicação (Troca de DNS) - w.com.br', WhatId: '500NOVO00000001' },
        { Id: '00TV', Subject: 'Publicação (Troca de DNS) - w.com.br', WhatId: '500VELHO0000001' },
      ],
      casosAntigos: [{ ...antigo, Id: '500NOVO00000001', CaseNumber: '2', AccountId: '001W' }, { ...antigo, Id: '500VELHO0000001', CaseNumber: '1', AccountId: '001W' }],
      casos: [],
    });
    const r4 = await acharCasoDaPublicacao(duasTarefas, { dominio: 'w.com.br', razao: 'W', ...REUNIAO });
    check('duas publicações antigas na mesma conta: a mais recente', r4.casoId === '500NOVO00000001', JSON.stringify(r4));
  }

  console.log('\n=== Razão social diferente do nome da conta: fica com a conta da tarefa ===');
  {
    const logs = [];
    const sf = sfFalso({
      tarefas: [{ Id: '00T1', Subject: 'Publicação (Troca de DNS)', Description: 'somaecontabilidade.com.br', WhatId: '500IMPL00000004' }],
      casosAntigos: [{ Id: '500IMPL00000004', AccountId: '001MR', Account: { Name: 'M RIBEIRO CONTABILIDADE' } }],
      casos: [CS('500CSMR00000001', '001MR')],
    });
    const r = await acharCasoDaPublicacao(sf, { dominio: 'somaecontabilidade.com.br', razao: 'SOMA E CONTABILIDADE', ...REUNIAO }, (m, t) => logs.push({ m, t }));
    check('usa a conta da tarefa', r.casoId === '500CSMR00000001', JSON.stringify(r));
    check('avisa que o nome não bate', logs.some((l) => l.t === 'warn' && /não é igual ao nome da conta/.test(l.m)));
  }

  console.log('\n=== Tarefas antigas em duas contas ===');
  {
    const base = {
      tarefas: [
        { Id: '00T1', Subject: 'Publicação (Troca de DNS)', Description: 'x.com.br', WhatId: '500A00000000001' },
        { Id: '00T2', Subject: 'Publicação (Troca de DNS)', Description: 'x.com.br', WhatId: '500B00000000002' },
      ],
      casosAntigos: [{ Id: '500A00000000001', AccountId: '001A', Account: { Name: 'EMPRESA A' } }, { Id: '500B00000000002', AccountId: '001B', Account: { Name: 'EMPRESA B' } }],
      casos: [CS('500CSA000000001', '001A'), CS('500CSB000000001', '001B')],
    };
    const r1 = await acharCasoDaPublicacao(sfFalso(base), { dominio: 'x.com.br', razao: 'Empresa B', ...REUNIAO });
    check('a razão social desempata', r1.casoId === '500CSB000000001', JSON.stringify(r1));
    const r2 = await acharCasoDaPublicacao(sfFalso(base), { dominio: 'x.com.br', razao: 'OUTRA', ...REUNIAO });
    check('sem desempate: não cria', r2.casoId === null && /2 contas diferentes/.test(r2.motivo), JSON.stringify(r2));
  }

  console.log('\n=== Sem tarefa antiga: pela razão social ===');
  {
    const sf = sfFalso({
      contas: [{ Id: '001R', Name: '47.047.591 RAFAEL MARTINS GALVAO' }],
      casos: [
        { Id: '500GROW00000001', AccountId: '001R', Subject: 'Ongoing Growth - BC - 47.047.591 RAFAEL MARTINS GALVAO', Status: 'Reuniao_de_Nutricao', IsClosed: false },
        CS('500CS0000000001', '001R'),
      ],
    });
    const r = await acharCasoDaPublicacao(sf, { dominio: 'promocionalbrindes.com.br', razao: '47.047.591  RAFAEL MARTINS GALVAO ', ...REUNIAO });
    check('o Ongoing CS, não o Growth', r.casoId === '500CS0000000001', JSON.stringify(r));
    const qConta = sf.chamadas.find(([t, q]) => /FROM Account/.test(q))[1];
    check('conta pelo nome exato, sem espaço sobrando', /Name = '47\.047\.591 RAFAEL MARTINS GALVAO'/.test(qConta), qConta);
    const qCaso = sf.chamadas.find(([t, q]) => /AccountId = /.test(q))[1];
    check('lê todos os casos da conta', /FROM Case WHERE AccountId = '001R'/.test(qCaso), qCaso);
  }

  console.log('\n=== O print da TURBO GERAIS: Ongoing CS aberto em "Kickoff/Selling Class" ===');
  {
    const sf = sfFalso({
      tarefas: [{ Id: '00TbL00000avlK5UAI', Subject: 'Publicação (Troca de DNS)', Description: 'www.turbogerais.com.br', WhatId: '500bL00000aKzKMQA0' }],
      casosAntigos: [{ Id: '500bL00000aKzKMQA0', CaseNumber: '00083641', Subject: 'IMPLEMENTAÇÃO MPI SOLUTIONS - TURBO GERAIS COMERCIO LTDA', IsClosed: true, AccountId: '001TG', Account: { Name: 'TURBO GERAIS COMERCIO LTDA' } }],
      casos: [
        { Id: '500GRW', CaseNumber: '00087547', AccountId: '001TG', Subject: 'Ongoing Growth', Status: '1a_Analise', IsClosed: false, RecordType: { Name: 'Ongoing Growth' } },
        { Id: '500CSK', CaseNumber: '00087546', AccountId: '001TG', Subject: 'Ongoing CS', Status: 'Kickoff/Selling Class', IsClosed: false, RecordType: { Name: 'Ongoing CS' } },
        { Id: '500bL00000aKzKMQA0', CaseNumber: '00083641', AccountId: '001TG', Subject: 'IMPLEMENTAÇÃO MPI SOLUTIONS - TURBO GERAIS COMERCIO LTDA', Status: 'Fechado', IsClosed: true, RecordType: { Name: 'Onboarding' } },
      ],
    });
    const r = await acharCasoDaPublicacao(sf, { dominio: 'turbogerais.com.br', razao: 'TURBO GERAIS COMERCIO LTDA', ...REUNIAO });
    check('acha o 00087546, mesmo sem estar em Reunião de Nutrição', r.casoId === '500CSK' && !r.casoDaPublicacaoAntiga, JSON.stringify(r));
    check('mostra o status em que estava', /00087546 \(Ongoing CS aberto, em "Kickoff\/Selling Class"\)/.test(r.como || ''), r.como);
  }

  console.log('\n=== Vale o tipo Ongoing CS aberto; o status só desempata ===');
  {
    const conta = { contas: [{ Id: '001R', Name: 'X' }] };
    const REC = { Name: 'Ongoing CS' };
    const r1 = await acharCasoDaPublicacao(sfFalso({ ...conta, casos: [CS('500A', '001R', 'Acompanhamento')] }), { dominio: 'x.com.br', razao: 'X', ...REUNIAO });
    check('um Ongoing CS aberto em outro status: serve', r1.casoId === '500A', JSON.stringify(r1));
    const r2 = await acharCasoDaPublicacao(sfFalso({ ...conta, casos: [CS('500A', '001R'), CS('500B', '001R')] }), { dominio: 'x.com.br', razao: 'X', ...REUNIAO });
    check('dois Ongoing CS em Reunião de Nutrição: não chuta', r2.casoId === null && /2 casos Ongoing CS abertos/.test(r2.motivo), JSON.stringify(r2));
    const r2b = await acharCasoDaPublicacao(sfFalso({ ...conta, casos: [CS('500A', '001R', 'Kickoff'), CS('500B', '001R', 'Acompanhamento')] }), { dominio: 'x.com.br', razao: 'X', ...REUNIAO });
    check('dois abertos, nenhum em Reunião de Nutrição: não chuta', r2b.casoId === null, JSON.stringify(r2b));
    const r3 = await acharCasoDaPublicacao(sfFalso({ ...conta, casos: [CS('500A', '001R', 'Reuniao_de_Nutricao', true)] }), { dominio: 'x.com.br', razao: 'X', ...REUNIAO });
    check('um fechado não conta', r3.casoId === null, JSON.stringify(r3));
    const r4 = await acharCasoDaPublicacao(sfFalso({ ...conta, casos: [
      { Id: '500V', CaseNumber: '9', AccountId: '001R', Subject: null, Status: 'Reuniao_de_Nutricao', IsClosed: false, RecordType: REC },
      CS('500A', '001R', 'Acompanhamento'),
    ] }), { dominio: 'x.com.br', razao: 'X', ...REUNIAO });
    check('dois abertos: Reunião de Nutrição desempata (assunto vazio não atrapalha)', r4.casoId === '500V' && /entre 2 abertos/.test(r4.como), JSON.stringify(r4));
    const r5 = await acharCasoDaPublicacao(sfFalso({ ...conta, casos: [{ ...CS('500L', '001R'), Status: 'Reunião de Nutrição' }, CS('500M', '001R', 'Kickoff')] }), { dominio: 'x.com.br', razao: 'X', statusCasoApi: null, statusCasoRotulo: 'Reunião de Nutrição' });
    check('desempate pelo rótulo quando não se sabe o valor da API', r5.casoId === '500L', JSON.stringify(r5));
  }

  console.log('\n=== ADIFER: a conta tem " - ME" no nome e a tarefa antiga tem o domínio escrito errado ===');
  {
    const logs = [];
    const sf = sfFalso({
      // A tarefa antiga cita "Adifertampeos", não "adifertampoes": não serve.
      tarefas: [{ Id: '00TA', Subject: 'Publicação (Troca de DNS) - Adifertampeos.com.br', WhatId: '500MPI' }],
      contas: [],
      contasSosl: [
        { Id: '001AD', Name: 'ADIFER MATERIAIS DE CONSTRUCAO LTDA - ME' },
        { Id: '001OU', Name: 'ADIFER MATERIAIS ELETRICOS LTDA' },
      ],
      casos: [
        { Id: '500CSAD', CaseNumber: '00085258', AccountId: '001AD', Subject: 'Ongoing CS', Status: 'Kickoff/Selling Class', IsClosed: false, RecordType: { Name: 'Ongoing CS' } },
        { Id: '500GRAD', CaseNumber: '00085259', AccountId: '001AD', Subject: 'Ongoing Growth', Status: '1a_Analise', IsClosed: false, RecordType: { Name: 'Ongoing Growth' } },
        { Id: '500BON', CaseNumber: '00083744', AccountId: '001AD', Subject: 'Bonificação - Categoria - MPI+', Status: 'Fechado', IsClosed: true, RecordType: { Name: 'Onboarding' } },
        { Id: '500MPI', CaseNumber: '00077843', AccountId: '001AD', Subject: 'MPI+', Status: 'Fechado', IsClosed: true, RecordType: { Name: 'Onboarding' } },
      ],
    });
    const r = await acharCasoDaPublicacao(sf, { dominio: 'adifertampoes.com.br', razao: 'ADIFER MATERIAIS DE CONSTRUCAO LTDA', ...REUNIAO }, (m, t) => logs.push({ m, t }));
    check('acha o Ongoing CS 00085258', r.casoId === '500CSAD', JSON.stringify(r));
    check('a conta veio do nome sem o " - ME"', /conta "ADIFER MATERIAIS DE CONSTRUCAO LTDA - ME"/.test(r.como || ''), r.como);
    check('não confunde com outra ADIFER', r.conta === 'ADIFER MATERIAIS DE CONSTRUCAO LTDA - ME');
    check('avisa que o nome da conta é diferente', logs.some((l) => l.t === 'warn' && /muda só o tipo da empresa/.test(l.m)));
    const q = sf.chamadas.find(([t, x]) => t === 'SOSL' && /Account/.test(x))[1];
    check('procura pelo nome sem o LTDA', /FIND \{"ADIFER MATERIAIS DE CONSTRUCAO"\} IN NAME FIELDS/.test(q), q);
  }

  console.log('\n=== Conta com acento que a planilha não tem ===');
  {
    const sf = sfFalso({
      contas: [],
      contasSosl: (q) => (/"/.test(q) ? [] : [{ Id: '001C', Name: 'CONSTRUÇÕES SÃO JOÃO LTDA' }, { Id: '001D', Name: 'CONSTRUCOES SAO JOAO NORTE LTDA' }]),
      casos: [CS('500C', '001C', 'Kickoff')],
    });
    const r = await acharCasoDaPublicacao(sf, { dominio: 'c.com.br', razao: 'CONSTRUCOES SAO JOAO LTDA', ...REUNIAO });
    check('a frase não bateu, a palavra mais longa trouxe, e o nome sem acento decide', r.casoId === '500C', JSON.stringify(r));
    check('usou a palavra mais longa', sf.chamadas.some(([t, q]) => t === 'SOSL' && /FIND \{construcoes\}/.test(q)), JSON.stringify(sf.chamadas));
  }

  console.log('\n=== Nome parecido, mas de outra empresa: não usa ===');
  {
    const sf = sfFalso({ contas: [], contasSosl: [{ Id: '001X', Name: 'ADIFER MATERIAIS DE CONSTRUCAO NORTE LTDA' }] });
    const r = await acharCasoDaPublicacao(sf, { dominio: 'x.com.br', razao: 'ADIFER MATERIAIS DE CONSTRUCAO LTDA', ...REUNIAO });
    check('não usa e mostra a parecida no motivo', r.casoId === null && /parecidas, mas com outro nome: "ADIFER MATERIAIS DE CONSTRUCAO NORTE LTDA"/.test(r.motivo), JSON.stringify(r));
    const dois = sfFalso({ contas: [], contasSosl: [{ Id: '1', Name: 'ACME LTDA - ME' }, { Id: '2', Name: 'ACME EPP' }] });
    const r2 = await acharCasoDaPublicacao(dois, { dominio: 'x.com.br', razao: 'ACME LTDA', ...REUNIAO });
    check('duas contas com o mesmo nome base: não chuta', r2.casoId === null && /2 contas chamadas/.test(r2.motivo), JSON.stringify(r2));
  }

  console.log('\n=== Não achou: não chuta ===');
  {
    const r1 = await acharCasoDaPublicacao(sfFalso(), { dominio: 'x.com.br', razao: 'NÃO EXISTE', ...REUNIAO });
    check('sem tarefa e sem conta', r1.casoId === null && /nenhuma conta chamada/.test(r1.motivo), JSON.stringify(r1));
    const r2 = await acharCasoDaPublicacao(sfFalso({ contas: [{ Id: '1', Name: 'X' }, { Id: '2', Name: 'X' }] }), { dominio: 'x.com.br', razao: 'X' });
    check('duas contas com o mesmo nome', r2.casoId === null && /2 contas/.test(r2.motivo), JSON.stringify(r2));
    const r3 = await acharCasoDaPublicacao(sfFalso({ contas: [{ Id: '001R', Name: 'X' }], casos: [{ Id: '500G', AccountId: '001R', Subject: 'Ongoing Growth - X', Status: 'Reuniao_de_Nutricao', IsClosed: false, RecordType: { Name: 'Ongoing Growth' } }] }), { dominio: 'x.com.br', razao: 'X', ...REUNIAO });
    check('pela razão social, só Ongoing Growth: não cria (não há caso antigo)', r3.casoId === null && /nenhum caso Ongoing CS aberto/.test(r3.motivo) && /não há tarefa de publicação antiga/.test(r3.motivo), JSON.stringify(r3));
    const r4 = await acharCasoDaPublicacao(sfFalso(), { dominio: 'x.com.br', razao: '' });
    check('sem tarefa e sem razão social', r4.casoId === null && /sem razão social/.test(r4.motivo));
  }

  console.log('\n=== Busca global: hífen escapado, falha não trava, 403 sobe ===');
  {
    const sf = sfFalso();
    await acharCasoDaPublicacao(sf, { dominio: 'https://www.grupo-x.com.br/', razao: '' });
    check('hífen escapado, sem https/www, entre aspas', /FIND \{"grupo\\-x\.com\.br"\} IN ALL FIELDS RETURNING Task\(/.test(sf.chamadas[0][1]), sf.chamadas[0][1]);
    const r = await acharCasoDaPublicacao(sfFalso({ erroBusca: new Error('timeout'), contas: [{ Id: '001R', Name: 'X' }], casos: [CS('500B', '001R')] }), { dominio: 'x.com.br', razao: 'X', ...REUNIAO });
    check('busca fora do ar: segue pela razão social', r.casoId === '500B');
    let erro = null;
    try { await acharCasoDaPublicacao(sfFalso({ erroBusca: Object.assign(new Error('403'), { status: 403 }) }), { dominio: 'x.com.br', razao: 'X' }); } catch (e) { erro = e; }
    check('403 sobe (para pedir reconexão)', erro && erro.status === 403);
  }

  console.log('\n=== buscar() chama a rota de busca global ===');
  {
    let caminho = '';
    const https = { request(o, cb) { caminho = o.path; const req = { on() { return req; }, setTimeout() { return req; }, write() {}, end() { const res = { statusCode: 200, setEncoding() {}, on(ev, fn) { if (ev === 'data') fn(JSON.stringify({ searchRecords: [{ Id: '00T' }] })); if (ev === 'end') setImmediate(fn); return res; } }; setImmediate(() => cb(res)); } }; return req; } };
    const r = await criarSalesforce('https://x.my.salesforce.com', 'T', { https }).buscar('FIND {"a.com.br"} IN ALL FIELDS RETURNING Task(Id)');
    check('GET /search?q=', /\/services\/data\/v\d+\.0\/search\?q=FIND/.test(caminho), caminho);
    check('devolve os registros', Array.isArray(r) && r[0].Id === '00T');
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
