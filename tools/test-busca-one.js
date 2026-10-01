// ADR-132: a publicação Busca One automática (propriedades → geral.php →
// e-mail de vhost → registro na tarefa), com dependências falsas, sem Electron.
//
//     node tools/test-busca-one.js

const path = require('path');
const B = require(path.join(__dirname, '..', 'lib', 'busca-one'));

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

const RESULTADO_GOOGLE = {
  ok: true,
  result: {
    domain: 'x.com.br', reaproveitados: ['Analytics'], faltando: [],
    idAnalytics: 'G-ABC123', tagmanager: 'GTM-XYZ', googleSearchConsole: 'tok-sc', siteKey: '6Lsite', secretKey: '6Lsecret',
  },
};

// Fábrica de deps falsas, registrando as chamadas na ordem.
function fakeDeps(over = {}) {
  const ordem = [];
  const chamadas = { criarPropriedades: [], commitGeral: [], enviarEmail: [], moverTarefa: [], comentarTarefa: [] };
  const logs = [];
  const grava = (nome, p, r) => { ordem.push(nome); chamadas[nome].push(p); return r; };
  const deps = {
    log: (m, t) => logs.push([m, t]),
    email: over.email || { to: 'suporte@m3solutions.com.br', cc: 'everton.lima@buscacliente.com.br' },
    agora: () => new Date(2026, 9, 1, 14, 30),
    criarPropriedades: async (p) => grava('criarPropriedades', p, over.google || RESULTADO_GOOGLE),
    commitGeral: async (p) => grava('commitGeral', p, over.commit || { ok: true, workspace: 'bc', repo: p.repo, branch: 'main', applied: Object.keys(p.values) }),
    enviarEmail: async (p) => grava('enviarEmail', p, over.mail || { ok: true, enviados: p.domains, falhas: [], total: 1 }),
    moverTarefa: async (p) => grava('moverTarefa', p, over.mover || { ok: true }),
    comentarTarefa: async (p) => grava('comentarTarefa', p, over.comentar || { ok: true }),
    ...(over.deps || {}),
  };
  return { deps, chamadas, ordem, logs };
}

const TAREFA_BC = { id: '00T1', link: 'https://sf/lightning/r/Task/00T1/view', assunto: 'Publicação (Troca de DNS) - x.com.br', dominio: 'x.com.br', empresa: 'bc', idPainel: '1234', temporario: 'deploy.buscacliente.com.br' };

(async () => {
  console.log('\n=== Modelos do e-mail de vhost ===');
  {
    const bc = B.montarEmailVhost('bc', 'cliente.com.br');
    check('assunto Busca Cliente', bc.assunto === 'Criação de Vhost e Banco - Busca Cliente - cliente.com.br', bc.assunto);
    check('corpo Busca Cliente cita a empresa, o domínio e os usuários', /empresa Busca Cliente:/.test(bc.corpo) && /\ncliente\.com\.br\n/.test(bc.corpo) && /User: guilherme\.millares/.test(bc.corpo) && /Suporte \/ Deploy/.test(bc.corpo));
    const mpi = B.montarEmailVhost('mpisolutions', 'cliente.com.br');
    check('assunto MPI Solutions troca "Busca Cliente" por "MPI"', mpi.assunto === 'Criação de Vhost e Banco - MPI - cliente.com.br', mpi.assunto);
    check('corpo MPI Solutions cita a empresa, o domínio e os usuários com asterisco', /empresa MPI Solutions:\ncliente\.com\.br\n/.test(mpi.corpo) && /\* guilherme\.millares/.test(mpi.corpo) && !/User:/.test(mpi.corpo));
    check('os modelos usam {dominio} (o mail:sendBatch preenche de novo igual)', /\{dominio\}/.test(bc.assuntoModelo) && /\{dominio\}/.test(bc.corpoModelo));
    check('{domínio} com acento também é preenchido', B.preencher('a {domínio} b', 'z.com') === 'a z.com b');
    check('empresa desconhecida → null', B.montarEmailVhost('mpiplus', 'a.com') === null);
    check('listaEmails separa por ; , e espaço', JSON.stringify(B.listaEmails('a@x.com; b@x.com,c@x.com')) === JSON.stringify(['a@x.com', 'b@x.com', 'c@x.com']));
  }

  console.log('\n=== Busca Cliente: caminho feliz, na ordem ===');
  {
    const { deps, chamadas, ordem, logs } = fakeDeps();
    const r = await B.publicarBuscaOne(TAREFA_BC, deps);
    check('resultado ok com mensagem', r.ok === true && /e-mail de vhost enviado/.test(r.mensagem), JSON.stringify(r));
    check('ordem: propriedades → commit → e-mail → mover → comentar', ordem.join(',') === 'criarPropriedades,commitGeral,enviarEmail,moverTarefa,comentarTarefa', ordem.join(','));
    const g = chamadas.criarPropriedades[0];
    check('propriedades pedidas na marca bc, as 4 etapas', g.domain === 'x.com.br' && g.brand === 'bc' && g.steps.join() === 'analytics,gtm,recaptcha,searchconsole', JSON.stringify(g));
    const c = chamadas.commitGeral[0];
    check('commit no repositório = domínio, marca bc', c.repo === 'x.com.br' && c.brand === 'bc');
    check('commit leva as 6 chaves, com $idProjetoBusca = ID da tarefa', c.values.idProjetoBusca === '1234' && c.values.idAnalytics === 'G-ABC123' && c.values.tagmanager === 'GTM-XYZ' && c.values.googleSearchConsole === 'tok-sc' && c.values.siteKey === '6Lsite' && c.values.secretKey === '6Lsecret', JSON.stringify(c.values));
    const m = chamadas.enviarEmail[0];
    check('e-mail para o destinatário e cc configurados, 1 domínio', m.to.join() === 'suporte@m3solutions.com.br' && m.cc.join() === 'everton.lima@buscacliente.com.br' && m.domains.join() === 'x.com.br', JSON.stringify(m));
    check('e-mail com o modelo da Busca Cliente', /Busca Cliente - \{dominio\}/.test(m.subjectTemplate) && /empresa Busca Cliente/.test(m.bodyTemplate));
    check('tarefa movida para "Em andamento"', chamadas.moverTarefa[0].id === '00T1' && chamadas.moverTarefa[0].coluna === 'andamento');
    const t = chamadas.comentarTarefa[0];
    check('registro na tarefa: comenta sem marcar, não conclui', t.link === TAREFA_BC.link && t.comentar === true && t.marcar === false && t.concluir === false && t.assumir === false, JSON.stringify(t));
    check('o registro traz GA, GTM, ID do painel, commit e e-mail', /G-ABC123/.test(t.texto) && /GTM-XYZ/.test(t.texto) && /1234 \(da tarefa\)/.test(t.texto) && /commitado em bc\/x\.com\.br/.test(t.texto) && /Criação de Vhost e Banco - Busca Cliente - x\.com\.br/.test(t.texto), t.texto);
    check('o registro marca o Analytics como reaproveitado', /G-ABC123 \(já existia, reaproveitado\)/.test(t.texto));
    check('o registro NUNCA leva a secretKey do reCAPTCHA', !/6Lsecret/.test(t.texto));
    check('o registro diz o que falta (manual)', /Falta \(manual\): vhost e banco/.test(t.texto));
    check('sem pendências', r.pendencias.length === 0 && !/Pendências/.test(t.texto));
    check('nada de erro no log', !logs.some((l) => l[1] === 'error' || l[1] === 'warn'), JSON.stringify(logs.filter((l) => l[1] === 'warn' || l[1] === 'error')));
  }

  console.log('\n=== MPI Solutions: ID fixo 39 e modelo MPI ===');
  {
    const { deps, chamadas } = fakeDeps();
    const r = await B.publicarBuscaOne({ ...TAREFA_BC, empresa: 'mpisolutions', idPainel: '555' }, deps);
    check('ok', r.ok === true);
    check('o fixo da marca (39) vence o ID da tarefa', chamadas.commitGeral[0].values.idProjetoBusca === '39' && chamadas.commitGeral[0].brand === 'mpisolutions');
    check('e-mail com o modelo MPI', /- MPI - \{dominio\}/.test(chamadas.enviarEmail[0].subjectTemplate) && /empresa MPI Solutions/.test(chamadas.enviarEmail[0].bodyTemplate));
    check('registro diz "fixo da marca"', /39 \(fixo da marca\)/.test(chamadas.comentarTarefa[0].texto));

    // deps.idPainelFixo (o BRANDS do renderer) manda, quando vem.
    const f2 = fakeDeps({ deps: { idPainelFixo: (e) => (e === 'mpisolutions' ? '40' : '') } });
    await B.publicarBuscaOne({ ...TAREFA_BC, empresa: 'mpisolutions' }, f2.deps);
    check('idPainelFixo do renderer tem precedência sobre a constante', f2.chamadas.commitGeral[0].values.idProjetoBusca === '40');
  }

  console.log('\n=== Busca Cliente sem "ID xxxx" na tarefa ===');
  {
    const { deps, chamadas, logs } = fakeDeps();
    const r = await B.publicarBuscaOne({ ...TAREFA_BC, idPainel: '' }, deps);
    check('segue (ok) com pendência do ID', r.ok === true && r.pendencias.some((p) => /ID do painel/.test(p)), JSON.stringify(r.pendencias));
    check('$idProjetoBusca vai vazio (o commit não mexe nele)', chamadas.commitGeral[0].values.idProjetoBusca === '');
    check('avisa no terminal', logs.some((l) => l[1] === 'warn' && /ID do painel/.test(l[0])));
    check('o registro na tarefa diz que não estava', /não estava na tarefa/.test(chamadas.comentarTarefa[0].texto) && /Pendências:/.test(chamadas.comentarTarefa[0].texto));
  }

  console.log('\n=== Empresa: caso/fila, temporário como reserva, nada → desiste ===');
  {
    let f = fakeDeps();
    let r = await B.publicarBuscaOne({ ...TAREFA_BC, empresa: null, empresaSugerida: null }, f.deps);
    check('sem empresa: desiste sem fazer nada', r.ok === false && r.desistir === true && f.ordem.length === 0, JSON.stringify(r));
    f = fakeDeps();
    r = await B.publicarBuscaOne({ ...TAREFA_BC, empresa: null, empresaSugerida: 'mpisolutions' }, f.deps);
    check('só o temporário: usa a sugestão', r.ok === true && f.chamadas.criarPropriedades[0].brand === 'mpisolutions');
    f = fakeDeps();
    r = await B.publicarBuscaOne({ ...TAREFA_BC, empresa: 'bc', empresaSugerida: 'mpisolutions' }, f.deps);
    check('caso/fila vence o temporário', f.chamadas.criarPropriedades[0].brand === 'bc');
    f = fakeDeps();
    r = await B.publicarBuscaOne({ ...TAREFA_BC, dominio: '' }, f.deps);
    check('sem domínio: desiste sem fazer nada', r.ok === false && r.desistir === true && f.ordem.length === 0);
  }

  console.log('\n=== Pré-requisitos antes de qualquer efeito ===');
  {
    let f = fakeDeps({ email: { to: '', cc: 'x@y.com' } });
    let r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('sem destinatário: erro (tenta de novo), nada feito', r.ok === false && !r.desistir && /destinatário/.test(r.motivo) && f.ordem.length === 0, JSON.stringify(r));
    f = fakeDeps({ deps: { enviarEmail: undefined } });
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('sem driver de e-mail: pula, nada feito', r.ok === false && r.pulou === true && f.ordem.length === 0, JSON.stringify(r));
  }

  console.log('\n=== Falhas em cada etapa ===');
  {
    // Propriedades falham: nada mais roda (o motor tenta de novo).
    let f = fakeDeps({ google: { ok: false, error: 'Analytics ambíguo' } });
    let r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('propriedades falham: erro, sem commit nem e-mail', r.ok === false && !r.desistir && /Analytics ambíguo/.test(r.motivo) && f.ordem.join() === 'criarPropriedades', JSON.stringify(r));
    f = fakeDeps({ google: { ok: false, error: 'chave revogada', saInvalida: true } });
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('chave da service account inválida: desiste (não adianta repetir)', r.ok === false && r.desistir === true);

    // Commit falha: e-mail sai mesmo assim, pendência registrada.
    f = fakeDeps({ commit: { ok: false, error: 'Não encontrei o geral.php' } });
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('commit falha: segue, e-mail enviado, ok com pendência', r.ok === true && f.chamadas.enviarEmail.length === 1 && r.pendencias.some((p) => /commit do geral\.php/.test(p)), JSON.stringify(r));
    check('  o registro na tarefa diz NÃO commitado', /NÃO commitado \(Não encontrei o geral\.php\)/.test(f.chamadas.comentarTarefa[0].texto));
    check('  a mensagem diz NÃO commitado', /NÃO commitado/.test(r.mensagem));

    // Commit pulado (já estava igual): não é pendência.
    f = fakeDeps({ commit: { ok: true, skipped: true, workspace: 'bc', repo: 'x.com.br', branch: 'main' } });
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('geral.php já estava igual: ok, sem pendência', r.ok === true && r.pendencias.length === 0 && /já estava igual/.test(r.mensagem) && /já estava com esses valores/.test(f.chamadas.comentarTarefa[0].texto));

    // E-mail falha: erro (tenta de novo), sem mexer na tarefa.
    f = fakeDeps({ mail: { ok: false, error: 'sessão expirada', reauth: true } });
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('e-mail falha: erro, tarefa não é movida nem comentada', r.ok === false && !r.desistir && /e-mail de vhost não saiu/.test(r.motivo) && f.chamadas.moverTarefa.length === 0 && f.chamadas.comentarTarefa.length === 0, JSON.stringify(r));
    check('  reauth pede para reconectar a Microsoft', /reconecte a conta Microsoft/.test(r.motivo));
    check('  o que já foi feito vem no resultado', r.feito.propriedades && r.feito.commit && r.feito.commit.ok === true);
    f = fakeDeps({ mail: { ok: true, enviados: [], falhas: [{ dominio: 'x.com.br', erro: 'caixa cheia' }], total: 1 } });
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('e-mail com falha por domínio também é erro', r.ok === false && /caixa cheia/.test(r.motivo));

    // Tarefa falha: só aviso.
    f = fakeDeps({ mover: { ok: false, error: 'sem permissão' }, comentar: { ok: false, error: 'feed fechado' } });
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('mover/comentar falham: continua ok, com aviso', r.ok === true && f.logs.filter((l) => l[1] === 'warn').length === 2 && r.feito.tarefa.movida === false && r.feito.tarefa.comentada === false, JSON.stringify(f.logs));
    check('  a mensagem não promete "Em andamento"', !/Em andamento/.test(r.mensagem));

    // Sem id/link de tarefa: não tenta mover nem comentar, e é ok.
    f = fakeDeps();
    r = await B.publicarBuscaOne({ ...TAREFA_BC, id: '', link: '' }, f.deps);
    check('sem tarefa: não mexe no Salesforce', r.ok === true && f.chamadas.moverTarefa.length === 0 && f.chamadas.comentarTarefa.length === 0);
  }

  console.log('\n=== Propriedade que faltou vira pendência ===');
  {
    const google = { ok: true, result: { ...RESULTADO_GOOGLE.result, tagmanager: '', faltando: ['Tag Manager'], reaproveitados: [] } };
    const { deps, chamadas } = fakeDeps({ google });
    const r = await B.publicarBuscaOne(TAREFA_BC, deps);
    check('Tag Manager faltando: ok com pendência', r.ok === true && r.pendencias.some((p) => /Tag Manager/.test(p)));
    check('o registro diz "não criado"', /Tag Manager: não criado \(NÃO criado\)/.test(chamadas.comentarTarefa[0].texto), chamadas.comentarTarefa[0].texto);
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
