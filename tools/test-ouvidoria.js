// ADR-111: checador de Ouvidoria / SSL. Acha a conta pelo domínio, lê o caso de
// Ouvidoria (Definição, Data de Conclusão) e decide Situação e Ativar SSL.
//
//     node tools/test-ouvidoria.js

const path = require('path');
const { acharContaPorDominio, acharCampoPorRotulo, formatarDataBr, avaliarOuvidoria } = require(path.join(__dirname, '..', 'lib', 'salesforce'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// Fake do Salesforce para a busca graduada (ADR-117). `search` é o resultado da
// SOSL (com attributes.type por registro); `contas` mapeia AccountId->Nome;
// `casos` são os casos lidos por Id (tier 4/tarefa).
function sfFalso({ search = [], nameSearch = null, contas = {}, casosPorConta = {}, casos = [] } = {}) {
  return {
    async buscar(q) {
      if (/IN NAME FIELDS/.test(q)) return nameSearch || search.filter((r) => r.attributes && r.attributes.type === 'Account');
      return search;
    },
    async consultar(q) {
      const ids = [...q.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      if (/FROM Account WHERE Id IN/.test(q)) return ids.filter((id) => contas[id]).map((id) => ({ Id: id, Name: contas[id] }));
      if (/FROM Case WHERE Id IN/.test(q)) return casos.filter((c) => ids.includes(c.Id));
      const m = q.match(/AccountId = '([^']+)'/);
      if (m) return casosPorConta[m[1]] || [];
      return [];
    },
  };
}
const acc = (Id, Name, Website) => ({ attributes: { type: 'Account' }, Id, Name, Website });
const caseR = (Id, AccountId, Subject) => ({ attributes: { type: 'Case' }, Id, AccountId, Subject });
const contato = (Id, AccountId, Email, Name, LeadSource) => ({ attributes: { type: 'Contact' }, Id, AccountId, Email, Name, LeadSource });
const task = (Id, Subject, Description, WhatId) => ({ attributes: { type: 'Task' }, Id, Subject, Description, WhatId });
const OUV = (num, def, data, extra = {}) => ({ Id: '500' + num, CaseNumber: num, RecordType: { Name: 'Ouvidoria' }, ...extra, ...(def !== undefined ? { Defini__c: def } : {}), ...(data !== undefined ? { Data_de_Conclusao__c: data } : {}) });

(async () => {
  console.log('\n=== Achar a conta pelo domínio, com confiança graduada (ADR-117) ===');
  {
    // Tier 1: Website da conta.
    const t1 = sfFalso({ search: [acc('001A', 'CLIENTE LTDA', 'https://cliente.com.br')] });
    const r1 = await acharContaPorDominio(t1, 'cliente.com.br');
    check('tier 1: Website da conta acha', r1.conta && r1.conta.Id === '001A' && r1.via === 'Website da conta', JSON.stringify(r1));

    // Tier 2: caso cujo assunto cita o domínio → a conta dele.
    const t2 = sfFalso({ search: [caseR('500A', '001B', 'Alt - Alta - cmrmedicina.com.br')], contas: { '001B': 'CMR MEDICINA' } });
    const r2 = await acharContaPorDominio(t2, 'cmrmedicina.com.br');
    check('tier 2: caso com o domínio no assunto acha', r2.conta && r2.conta.Name === 'CMR MEDICINA' && r2.via === 'caso com o domínio no assunto', JSON.stringify(r2));

    // Tier 3: contato com e-mail @domínio (fora prospecção).
    const t3 = sfFalso({ search: [contato('003A', '001C', 'contato@topoag.com.br', 'João', 'Indicação')], contas: { '001C': 'TOPOAG LTDA' } });
    const r3 = await acharContaPorDominio(t3, 'topoag.com.br');
    check('tier 3: contato com e-mail do domínio acha', r3.conta && r3.conta.Name === 'TOPOAG LTDA' && r3.via === 'contato com e-mail do domínio', JSON.stringify(r3));

    // Contato de prospecção (cold) NÃO conta.
    const cold = sfFalso({ search: [contato('003B', '001D', 'x@topoag.com.br', 'CONTATO COLD EMAILING', 'Cold Calling')], contas: { '001D': 'PROSPECT' } });
    const rCold = await acharContaPorDominio(cold, 'topoag.com.br');
    check('contato de prospecção (cold) é ignorado → revisar', !rCold.conta, JSON.stringify(rCold));

    // Tier 4: tarefa de "Publicação" ligada a um caso que cita o domínio.
    const t4 = sfFalso({ search: [task('00T1', 'Publicação (Troca de DNS) - cliente.com.br', '', '500A')], casos: [{ Id: '500A', AccountId: '001A', Account: { Name: 'CLIENTE LTDA' } }] });
    const r4 = await acharContaPorDominio(t4, 'cliente.com.br');
    check('tier 4: tarefa de publicação acha', r4.conta && r4.conta.Name === 'CLIENTE LTDA' && r4.via === 'tarefa de publicação', JSON.stringify(r4));

    // Ruído: tarefa que NÃO é de publicação (e-mail solto de outra conta) não conta.
    const ruido = sfFalso({ search: [task('00T2', 'E-mail - 13/10/23', 'menção solta a cirurgiaplastica-cnacional.com.br', '500X')], casos: [{ Id: '500X', AccountId: '001Z', Account: { Name: 'KS UNIFORMES LTDA' } }] });
    const rRuido = await acharContaPorDominio(ruido, 'cirurgiaplastica-cnacional.com.br');
    check('e-mail solto (não é tarefa de publicação) NÃO vira conta — evita a KS Uniformes', !rRuido.conta, JSON.stringify(rRuido));

    // Nada em lugar nenhum → revisar.
    const nada = sfFalso({ search: [] });
    const rNada = await acharContaPorDominio(nada, 'abcsatelite.com.br');
    check('domínio ausente do Salesforce: não acha, para revisão', !rNada.conta && /não está ligado a uma conta/.test(rNada.motivo), JSON.stringify(rNada));

    // Duas contas no mesmo tier (dois Websites) → ambíguo.
    const amb = sfFalso({ search: [acc('001A', 'A', 'a.com.br'), acc('001B', 'B', 'a.com.br')] });
    const rAmb = await acharContaPorDominio(amb, 'a.com.br');
    check('duas contas no mesmo sinal: ambíguo, não chuta', !rAmb.conta && rAmb.ambiguo === true, JSON.stringify(rAmb));

    // Tier 0: razão social vinda da planilha resolve na frente.
    const t0 = sfFalso({ nameSearch: [{ Id: '001R', Name: 'RENOVARE ENGENHARIA E SEGURANCA LTDA' }] });
    const r0 = await acharContaPorDominio(t0, 'renovareengseg.com.br', () => {}, { razao: 'Renovare Engenharia e Segurança Ltda' });
    check('tier 0: razão social acha direto', r0.conta && r0.conta.Id === '001R' && r0.via === 'razão social', JSON.stringify(r0));
  }

  console.log('\n=== Achar o campo pelo rótulo (sem acento atrapalhar) ===');
  {
    const desc = { fields: [{ label: 'Definição', name: 'Defini__c' }, { label: 'Data de Conclusão', name: 'Data_de_Conclusao__c' }, { label: 'Status', name: 'Status' }] };
    check('acha Definição', acharCampoPorRotulo(desc, 'Definição') === 'Defini__c');
    check('acha Data de Conclusão', acharCampoPorRotulo(desc, 'Data de Conclusão') === 'Data_de_Conclusao__c');
    check('rótulo inexistente: null', acharCampoPorRotulo(desc, 'Nada') === null);
  }

  console.log('\n=== Data BR ===');
  check('2026-08-05 vira 05/08/2026', formatarDataBr('2026-08-05') === '05/08/2026');
  check('datetime também', formatarDataBr('2026-08-05T13:00:00.000+0000') === '05/08/2026');
  check('vazio fica vazio', formatarDataBr('') === '');

  console.log('\n=== Avaliar Ouvidoria e decidir o SSL ===');
  {
    const campos = { campoDef: 'Defini__c', campoData: 'Data_de_Conclusao__c' };
    const cancelado = avaliarOuvidoria([OUV('00085674', 'Cancelado', '2026-08-05')], campos);
    check('Cancelado: SSL não, situação com a data', cancelado.ativarSsl === 'não' && /Cancelado — 05\/08\/2026/.test(cancelado.situacao) && cancelado.temOuvidoria, JSON.stringify(cancelado));

    const juridico = avaliarOuvidoria([OUV('1', 'Jurídico', '2026-07-01')], campos);
    check('Jurídico: SSL não', juridico.ativarSsl === 'não' && /Jur[ií]dico/.test(juridico.situacao), JSON.stringify(juridico));

    const outro = avaliarOuvidoria([OUV('2', 'Em análise', '')], campos);
    check('outra definição: SSL sim', outro.ativarSsl === 'sim' && /Em análise/.test(outro.situacao), JSON.stringify(outro));

    const semOuv = avaliarOuvidoria([{ Id: '500Z', CaseNumber: '9', RecordType: { Name: 'Ongoing CS' }, Defini__c: 'Cancelado' }], campos);
    check('sem caso de Ouvidoria: SSL sim, e ignora outros tipos de caso', semOuv.ativarSsl === 'sim' && semOuv.temOuvidoria === false, JSON.stringify(semOuv));

    const varios = avaliarOuvidoria([OUV('1', 'Resolvido', '2026-01-01'), OUV('2', 'Cancelado', '2026-08-05')], campos);
    check('mais de uma Ouvidoria: basta uma Cancelado/Jurídico para não ativar', varios.ativarSsl === 'não' && /Resolvido/.test(varios.situacao) && /Cancelado/.test(varios.situacao), JSON.stringify(varios));

    const acento = avaliarOuvidoria([OUV('3', 'CANCELADO', '2026-08-05')], campos);
    check('maiúsculas/acentos não enganam a regra', acento.ativarSsl === 'não');
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
