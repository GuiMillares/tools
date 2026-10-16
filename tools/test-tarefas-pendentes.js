// ADR-093: 403 do Salesforce para na primeira e deixa o resto pendente; a ação
// de pendentes cria só essas, sem refazer a rodada. Recorta as funções do
// renderer e do main e roda com o window.api simulado.
//
//     node tools/test-tarefas-pendentes.js

const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');

function recorta(fonte, inicio, fim) {
  const i = fonte.indexOf(inicio);
  const f = fonte.indexOf(fim, i);
  if (i < 0 || f < 0) throw new Error(`não achei o trecho "${inicio}"`);
  return fonte.slice(i, f);
}

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// Monta um "módulo" com as duas funções do renderer e o estado que elas usam.
function montar(api) {
  const corpo = `
    let bulkSfPendentes = [], bulkSfCriadas = [], bulkRodando = false, bulkSfConectado = false;
    const logs = [];
    const log = (m, t) => logs.push({ m, t });
    const withBusy = (_r, fn) => fn();
    const renderBulkLista = () => {};
    const window = { api };
    ${recorta(app, 'async function criarTarefasSalesforce(linhas)', '\nfunction renderBulkLista() {')}
    return {
      criarTarefasSalesforce, criarTarefasPendentes, logs,
      get pendentes() { return bulkSfPendentes; }, get criadas() { return bulkSfCriadas; },
      get rodando() { return bulkRodando; },
    };`;
  return new Function('api', corpo)(api);
}

const linha = (d) => ({ dominio: d, caso: `https://x.lightning.force.com/lightning/r/Case/500bL00000cWRcEQA${d.length % 10}/view`, detalhe: 'publicado' });

(async () => {
  console.log('\n=== 403 para na primeira e guarda o resto como pendente ===');
  {
    const chamadas = [];
    const api = {
      salesforceCriarTarefaNoCaso: async ({ dominio }) => {
        chamadas.push(dominio);
        if (dominio === 'a.com.br') return { ok: true, casoNumero: '00001', log: [] };
        return { ok: false, precisaReconectar: true, error: 'O Salesforce recusou o acesso (403).', log: [] };
      },
    };
    const m = montar(api);
    const linhas = [linha('a.com.br'), linha('b.com.br'), linha('c.com.br'), linha('d.com.br')];
    await m.criarTarefasSalesforce(linhas);
    check('não repetiu o 403 em todas: parou na 2ª chamada', chamadas.length === 2, chamadas.join(','));
    check('a primeira foi criada', m.criadas.includes('a.com.br'));
    check('a do 403 e as seguintes ficaram pendentes', m.pendentes.map((r) => r.dominio).join(',') === 'b.com.br,c.com.br,d.com.br', m.pendentes.map((r) => r.dominio).join(','));
    check('a linha mostra "tarefa SF pendente"', /tarefa SF pendente$/.test(linhas[3].detalhe), linhas[3].detalhe);
    check('o aviso manda reconectar e usar a ação de pendentes', m.logs.some((l) => /Reconecte o Salesforce/.test(l.m) && /tarefas pendentes/.test(l.m)));

    console.log('\n=== A ação de pendentes cria só as pendentes ===');
    const chamadas2 = [];
    api.salesforceGetConfig = async () => ({ ok: true, conectado: true });
    api.salesforceCriarTarefaNoCaso = async ({ dominio }) => {
      chamadas2.push(dominio);
      return dominio === 'c.com.br' ? { ok: true, jaExistia: true, log: [] } : { ok: true, casoNumero: '0000X', log: [] };
    };
    await m.criarTarefasPendentes();
    check('tentou só as 3 pendentes', chamadas2.join(',') === 'b.com.br,c.com.br,d.com.br', chamadas2.join(','));
    check('não sobrou pendente', m.pendentes.length === 0);
    check('a que já existia não conta como criada', !m.criadas.includes('c.com.br') && m.criadas.includes('b.com.br'));
    check('o "pendente" some do detalhe quando sai', !/pendente/.test(linhas[1].detalhe) && /tarefa SF no caso/.test(linhas[1].detalhe), linhas[1].detalhe);
    check('a rodada não fica presa como em andamento', m.rodando === false);
  }

  console.log('\n=== Link errado não vira pendente (tentar de novo não muda nada) ===');
  {
    const m = montar({ salesforceCriarTarefaNoCaso: async () => ({ ok: false, linkInvalido: true, error: 'O link não é de um caso.', log: [] }) });
    const l = [linha('e.com.br')];
    await m.criarTarefasSalesforce(l);
    check('fora da lista de pendentes', m.pendentes.length === 0);
    check('a linha diz que o link do caso está errado', /link do caso errado/.test(l[0].detalhe), l[0].detalhe);
  }

  console.log('\n=== Caso não encontrado: não vira pendente e sai no resumo (ADR-097) ===');
  {
    const chamadas = [];
    const m = montar({ salesforceCriarTarefaNoCaso: async (p) => { chamadas.push(p); return p.dominio === 'semcaso.com.br'
      ? { ok: false, casoNaoEncontrado: true, error: 'não achei o caso: nenhuma conta chamada "X".', log: [] }
      : { ok: true, casoNumero: '1', log: [] }; } });
    const l = [{ ...linha('semcaso.com.br'), caso: '', razao: 'X' }, { ...linha('ok.com.br'), caso: '', razao: 'Y' }];
    await m.criarTarefasSalesforce(l);
    check('manda a razão social junto', chamadas[0].razao === 'X');
    check('não entra nas pendentes', m.pendentes.length === 0);
    check('a linha mostra "caso não encontrado"', /tarefa SF: caso não encontrado$/.test(l[0].detalhe), l[0].detalhe);
    check('o resumo lista o site e o motivo', m.logs.some((x) => /sem caso encontrado/.test(x.m)) && m.logs.some((x) => /semcaso\.com\.br: não achei o caso/.test(x.m)));
    check('seguiu e criou a outra', m.criadas.includes('ok.com.br'));
  }

  console.log('\n=== Erro de rede fica pendente, e o laço continua ===');
  {
    const chamadas = [];
    const m = montar({ salesforceCriarTarefaNoCaso: async ({ dominio }) => { chamadas.push(dominio); return dominio === 'f.com.br' ? { ok: false, error: 'Falha de rede', log: [] } : { ok: true, log: [] }; } });
    await m.criarTarefasSalesforce([linha('f.com.br'), linha('g.com.br')]);
    check('seguiu para a próxima', chamadas.length === 2);
    check('só a da rede ficou pendente', m.pendentes.map((r) => r.dominio).join(',') === 'f.com.br');
  }

  console.log('\n=== Sem Salesforce conectado, a ação de pendentes não tenta nada ===');
  {
    let tentou = false;
    const m = montar({ salesforceGetConfig: async () => ({ ok: true, conectado: false }), salesforceCriarTarefaNoCaso: async () => { tentou = true; return { ok: true, log: [] }; } });
    await m.criarTarefasSalesforce([]); // estado limpo
    // força uma pendente pelo caminho normal
    const m2 = montar({ salesforceCriarTarefaNoCaso: async () => ({ ok: false, precisaReconectar: true, error: '403', log: [] }), salesforceGetConfig: async () => ({ ok: true, conectado: false }) });
    await m2.criarTarefasSalesforce([linha('h.com.br')]);
    const antes = m2.pendentes.length;
    await m2.criarTarefasPendentes();
    check('mantém a pendente e avisa para conectar', m2.pendentes.length === antes && m2.logs.some((l) => /não está conectado/.test(l.m)));
    check('não chamou a criação', tentou === false);
  }

  console.log('\n=== main: quem conta como "precisa reconectar" ===');
  {
    const sfPrecisaReconectar = new Function('SalesforceErro', `${recorta(main, 'function sfPrecisaReconectar(', '\nasync function sfQuemSouEu')}\nreturn sfPrecisaReconectar;`);
    class SalesforceErro extends Error { constructor(m, o = {}) { super(m); this.status = o.status; } }
    const f = sfPrecisaReconectar(SalesforceErro);
    check('403 do Salesforce', f(new SalesforceErro('x', { status: 403 })));
    check('sessão que não renovou (reauth)', f(Object.assign(new Error('x'), { reauth: true })));
    check('400 não', !f(new SalesforceErro('x', { status: 400 })));
    check('erro de rede não', !f(new Error('ECONNRESET')));
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
