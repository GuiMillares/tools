// Cliente do Salesforce (ADR-086), com a rede simulada. Nada sai da máquina.
//
//     node tools/test-salesforce.js
//
// O que dá para testar com honestidade aqui: a montagem das chamadas, o
// tratamento de erro, a paginação, o lote de 200, a marcação no feed, e as
// funções puras (Id do link, escape de SOQL, máscara de senha).

const path = require('path');
const { criarSalesforce, idDoLink, escaparSoql, mascararSegredos, SalesforceErro } =
  require(path.join(__dirname, '..', 'lib', 'salesforce'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// https de mentira: guarda o que foi pedido e responde o que o teste mandar.
const rede = { chamadas: [], responder: () => ({ status: 200, json: {} }) };
const httpsStub = {
  request(options, cb) {
    let corpo = '';
    const req = {
      on() { return req; }, setTimeout() { return req; }, destroy() {},
      write(c) { corpo += c; },
      end() {
        const pedido = { metodo: options.method, caminho: options.path, host: options.hostname, headers: options.headers, corpo: corpo ? JSON.parse(corpo) : null };
        rede.chamadas.push(pedido);
        const r = rede.responder(pedido);
        const txt = JSON.stringify(r.json);
        const res = { statusCode: r.status, headers: {}, setEncoding() {}, resume() {}, on(ev, fn) { if (ev === 'data') fn(txt); if (ev === 'end') setImmediate(fn); return res; } };
        setImmediate(() => cb(res));
      },
    };
    return req;
  },
};

const sf = (token = 'TOKEN123') => criarSalesforce('https://grupo-ideal-trends.my.salesforce.com', token, { https: httpsStub });

(async () => {
  console.log('\n=== Id a partir do link ===');
  check('link do Lightning', idDoLink('https://grupo-ideal-trends.lightning.force.com/lightning/r/Task/00T5e00000ABCDEFGH/view') === '00T5e00000ABCDEFGH');
  check('Id colado puro (18)', idDoLink('00T5e00000ABCDEFGH') === '00T5e00000ABCDEFGH');
  check('Id de 15', idDoLink('00T5e00000ABCDE') === '00T5e00000ABCDE');
  check('Id tem 18 ou 15, nunca 19', idDoLink('00T5e00000ABCDEFGHI') === null);
  check('link antigo com ?id=', idDoLink('https://x.my.salesforce.com/?id=5005e00000ABCDEFGH') === '5005e00000ABCDEFGH');
  check('link curto', idDoLink('https://x.my.salesforce.com/00T5e00000ABCDEFGH') === '00T5e00000ABCDEFGH');
  check('lixo devolve nulo', idDoLink('não é link') === null);
  check('vazio devolve nulo', idDoLink('') === null);

  console.log('\n=== SOQL não se quebra com aspas ===');
  check("aspa simples vira escapada", escaparSoql("o'brien") === "o\\'brien");
  check('barra invertida também', escaparSoql('a\\b') === 'a\\\\b');

  console.log('\n=== Senha da tarefa não vaza para o terminal ===');
  const bruto = 'Site publicado na V1\nDominio: www.spvidas.com.br\nLOGIN: spvidas\nSENHA: 46mK7nxQfP8MEQzmthSz';
  const limpo = mascararSegredos(bruto);
  check('a senha some', !limpo.includes('46mK7nxQfP8MEQzmthSz'), limpo);
  check('o login some', !/LOGIN:\s*spvidas/.test(limpo), limpo);
  check('o domínio fica', limpo.includes('www.spvidas.com.br'));

  console.log('\n=== Token vai no cabeçalho, e só para o Salesforce ===');
  rede.chamadas.length = 0;
  rede.responder = () => ({ status: 200, json: { records: [] } });
  await sf().consultar('SELECT Id FROM Task');
  check('Bearer no header', rede.chamadas[0].headers.Authorization === 'Bearer TOKEN123');
  check('host da instância', rede.chamadas[0].host === 'grupo-ideal-trends.my.salesforce.com');
  check('SOQL vai escapada na URL', /SELECT\+Id\+FROM\+Task|SELECT%20Id/.test(rede.chamadas[0].caminho), rede.chamadas[0].caminho);
  let erro = null;
  try { criarSalesforce('https://evil.example.com', 'T', { https: httpsStub }); await sf().consultar('x'); } catch (e) { erro = e; }
  rede.responder = () => ({ status: 200, json: { records: [] } });
  try { await criarSalesforce('https://evil.example.com', 'T', { https: httpsStub }).consultar('SELECT Id FROM Task'); } catch (e) { erro = e; }
  check('host de fora é recusado antes de sair', erro && /Host inesperado/.test(erro.message), erro && erro.message);

  console.log('\n=== Paginação do SOQL ===');
  rede.chamadas.length = 0;
  let pagina = 0;
  rede.responder = () => {
    pagina++;
    return pagina === 1
      ? { status: 200, json: { records: [{ Id: 'a' }, { Id: 'b' }], nextRecordsUrl: '/services/data/v61.0/query/01g-2000' } }
      : { status: 200, json: { records: [{ Id: 'c' }] } };
  };
  const todos = await sf().consultar('SELECT Id FROM Task');
  check('junta as páginas', todos.length === 3 && todos[2].Id === 'c', JSON.stringify(todos));
  check('foram duas chamadas', rede.chamadas.length === 2);

  console.log('\n=== Erro do Salesforce vira frase legível ===');
  rede.responder = () => ({ status: 400, json: [{ errorCode: 'REQUIRED_FIELD_MISSING', message: 'Required fields are missing: [Subject]', fields: ['Subject'] }] });
  let e2 = null;
  try { await sf().criar('Task', {}); } catch (e) { e2 = e; }
  check('traz o código e o campo', e2 && /REQUIRED_FIELD_MISSING/.test(e2.message) && /Subject/.test(e2.message), e2 && e2.message);
  check('não é marcado como sessão inválida', e2 && e2.sessaoInvalida === false);

  rede.responder = () => ({ status: 401, json: [{ errorCode: 'INVALID_SESSION_ID', message: 'Session expired or invalid' }] });
  let e3 = null;
  try { await sf().consultar('SELECT Id FROM Task'); } catch (e) { e3 = e; }
  check('sessão vencida é reconhecida para renovar', e3 instanceof SalesforceErro && e3.sessaoInvalida === true, e3 && e3.message);

  console.log('\n=== Criação em lote: 200 por chamada, e uma linha ruim não derruba as outras ===');
  rede.chamadas.length = 0;
  rede.responder = (p) => ({ status: 200, json: (p.corpo.records || []).map((r, i) => (i === 1 ? { success: false, errors: [{ message: 'deu ruim' }] } : { id: 'T' + i, success: true })) });
  const registros = Array.from({ length: 205 }, (_, i) => ({ Subject: `Publicação (troca de DNS) - site${i}.com.br` }));
  const resultado = await sf().criarVarios('Task', registros);
  check('duas chamadas para 205', rede.chamadas.length === 2, String(rede.chamadas.length));
  check('primeira leva 200', rede.chamadas[0].corpo.records.length === 200);
  check('segunda leva 5', rede.chamadas[1].corpo.records.length === 5);
  check('allOrNone falso', rede.chamadas[0].corpo.allOrNone === false);
  check('tipo vai em cada registro', rede.chamadas[0].corpo.records[0].attributes.type === 'Task');
  check('devolve o resultado de cada uma', resultado.length === 205 && resultado[1].success === false, String(resultado.length));

  console.log('\n=== Comentário no feed marca de verdade ===');
  rede.chamadas.length = 0;
  rede.responder = () => ({ status: 201, json: { id: '0D7' } });
  await sf().comentarMarcando('0D5000000000001', '005000000000002', 'Site publicado');
  const corpo = rede.chamadas[0].corpo;
  check('vai para a rota de comentários do item', /feed-elements\/0D5000000000001\/capabilities\/comments\/items/.test(rede.chamadas[0].caminho), rede.chamadas[0].caminho);
  check('primeiro segmento é a menção com o Id', corpo.body.messageSegments[0].type === 'Mention' && corpo.body.messageSegments[0].id === '005000000000002', JSON.stringify(corpo));
  check('o texto vai como segmento de texto', corpo.body.messageSegments.some((x) => x.type === 'Text' && x.text === 'Site publicado'));
  check('não escreve "@" no texto', !JSON.stringify(corpo).includes('@'), JSON.stringify(corpo));

  rede.chamadas.length = 0;
  await sf().comentarMarcando('0D5000000000001', null, 'Só texto');
  check('sem pessoa, não inventa menção', !rede.chamadas[0].corpo.body.messageSegments.some((x) => x.type === 'Mention'));

  console.log('\n=== Postar no feed do registro marcando ===');
  rede.chamadas.length = 0;
  rede.responder = () => ({ status: 201, json: { id: '0D5novo' } });
  await sf().postarNoFeed('00T000000000001', '005000000000002', 'Site publicado');
  const cf = rede.chamadas[0];
  check('POST na rota geral de feed-elements', cf.metodo === 'POST' && /\/chatter\/feed-elements$/.test(cf.caminho), cf.caminho);
  check('é um FeedItem no registro (subjectId)', cf.corpo.feedElementType === 'FeedItem' && cf.corpo.subjectId === '00T000000000001', JSON.stringify(cf.corpo));
  check('marca a pessoa como menção com Id', cf.corpo.body.messageSegments[0].type === 'Mention' && cf.corpo.body.messageSegments[0].id === '005000000000002');
  check('o texto vai como segmento de texto', cf.corpo.body.messageSegments.some((x) => x.type === 'Text' && x.text === 'Site publicado'));

  rede.chamadas.length = 0;
  await sf().postarNoFeed('00T000000000001', null, 'Sem menção');
  check('sem pessoa, posta sem inventar menção', !rede.chamadas[0].corpo.body.messageSegments.some((x) => x.type === 'Mention'));

  console.log('\n=== Achar a linha da tarefa no feed do caso (vira página) ===');
  rede.chamadas.length = 0;
  // Página 1: só a linha de OUTRA tarefa. Página 2: a que eu quero. Prova que
  // vira a página e que casa pelo relatedRecordId, não pega qualquer criação.
  let pag = 0;
  rede.responder = () => {
    pag += 1;
    if (pag === 1) return { status: 200, json: { elements: [{ id: 'F1', type: 'CreateRecordEvent', relatedRecordId: '00Toutra000000001' }], nextPageUrl: '/services/data/v61.0/chatter/feeds/record/500caso/feed-elements?pageToken=2' } };
    return { status: 200, json: { elements: [{ id: 'F2', type: 'CreateRecordEvent', relatedRecordId: '00Tminha000000001' }], nextPageUrl: null } };
  };
  const achado = await sf().acharNoFeed('500caso', (it) => it.type === 'CreateRecordEvent' && it.relatedRecordId === '00Tminha000000001');
  check('achou a linha certa na 2a página', achado && achado.id === 'F2', JSON.stringify(achado));
  check('foram duas páginas', rede.chamadas.length === 2, String(rede.chamadas.length));
  check('a 2a chamada seguiu o nextPageUrl', /pageToken=2/.test(rede.chamadas[1].caminho), rede.chamadas[1].caminho);

  rede.chamadas.length = 0;
  pag = 0;
  rede.responder = () => ({ status: 200, json: { elements: [{ id: 'X', type: 'EmailMessageEvent', relatedRecordId: '500caso' }], nextPageUrl: null } });
  const semAchar = await sf().acharNoFeed('500caso', (it) => it.relatedRecordId === '00Tnaoexiste');
  check('não achando, devolve nulo sem inventar', semAchar === null);

  console.log('\n=== Atualizar manda PATCH ===');
  rede.chamadas.length = 0;
  rede.responder = () => ({ status: 204, json: null });
  await sf().atualizar('Task', '00T123', { Status: 'Concluído', OwnerId: '005abc' });
  check('método e caminho', rede.chamadas[0].metodo === 'PATCH' && /sobjects\/Task\/00T123$/.test(rede.chamadas[0].caminho), rede.chamadas[0].caminho);
  check('campos no corpo', rede.chamadas[0].corpo.Status === 'Concluído' && rede.chamadas[0].corpo.OwnerId === '005abc');

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
