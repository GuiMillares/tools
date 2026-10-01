// ADR-132/133/134: a publicação Busca One automática (propriedades → geral.php
// → e-mail de vhost → tarefa em andamento, resumo no terminal), com
// dependências falsas, sem Electron.
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

// Fábrica de deps falsas, registrando as chamadas na ordem e o log.
function fakeDeps(over = {}) {
  const ordem = [];
  const chamadas = { criarPropriedades: [], commitGeral: [], enviarEmail: [], moverTarefa: [] };
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
    ...(over.deps || {}),
  };
  return { deps, chamadas, ordem, logs };
}
// O resumo que o fluxo escreve no terminal (as linhas 'info' depois de
// "Publicação Busca One (…) — parte automática").
const resumoDoLog = (logs) => {
  const linhas = logs.map((l) => l[0]);
  const i = linhas.findIndex((l) => /parte automática feita pelo Hub/.test(l));
  return i < 0 ? '' : linhas.slice(i).join('\n');
};

const TAREFA_BC = { id: '00T1', link: 'https://sf/lightning/r/Task/00T1/view', assunto: 'Publicação (Troca de DNS) - x.com.br', dominio: 'x.com.br', empresa: 'bc', idPainel: '1234', temporario: 'deploy.buscaclientes.com.br' };

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
    check('ordem: propriedades → commit → e-mail → mover a tarefa', ordem.join(',') === 'criarPropriedades,commitGeral,enviarEmail,moverTarefa', ordem.join(','));
    const g = chamadas.criarPropriedades[0];
    check('propriedades pedidas na marca bc, as 4 etapas', g.domain === 'x.com.br' && g.brand === 'bc' && g.steps.join() === 'analytics,gtm,recaptcha,searchconsole', JSON.stringify(g));
    const c = chamadas.commitGeral[0];
    check('commit no repositório = domínio, marca bc', c.repo === 'x.com.br' && c.brand === 'bc');
    check('commit leva as 6 chaves, com $idProjetoBusca = ID da tarefa', c.values.idProjetoBusca === '1234' && c.values.idAnalytics === 'G-ABC123' && c.values.tagmanager === 'GTM-XYZ' && c.values.googleSearchConsole === 'tok-sc' && c.values.siteKey === '6Lsite' && c.values.secretKey === '6Lsecret', JSON.stringify(c.values));
    const m = chamadas.enviarEmail[0];
    check('e-mail para o destinatário e cc configurados, 1 domínio', m.to.join() === 'suporte@m3solutions.com.br' && m.cc.join() === 'everton.lima@buscacliente.com.br' && m.domains.join() === 'x.com.br', JSON.stringify(m));
    check('e-mail com o modelo da Busca Cliente', /Busca Cliente - \{dominio\}/.test(m.subjectTemplate) && /empresa Busca Cliente/.test(m.bodyTemplate));
    check('tarefa movida para "Em andamento" (e nada mais no Salesforce)', chamadas.moverTarefa[0].id === '00T1' && chamadas.moverTarefa[0].coluna === 'andamento' && !('comentarTarefa' in chamadas));
    const t = resumoDoLog(logs);
    check('o resumo no terminal traz GA, GTM, ID do painel, commit e e-mail', /G-ABC123/.test(t) && /GTM-XYZ/.test(t) && /1234 \(da tarefa\)/.test(t) && /commitado em bc\/x\.com\.br/.test(t) && /Criação de Vhost e Banco - Busca Cliente - x\.com\.br/.test(t), t);
    check('o resumo marca o Analytics como reaproveitado', /G-ABC123 \(já existia, reaproveitado\)/.test(t));
    check('o resumo NUNCA leva a secretKey do reCAPTCHA', !/6Lsecret/.test(t));
    check('o resumo diz o que falta (manual)', /Falta \(manual\): vhost e banco/.test(t));
    // No terminal as linhas em branco do texto não são logadas.
    check('o resumo é igual ao texto guardado em feito.tarefa.texto', r.feito.tarefa.texto.split('\n').filter((l) => l.trim()).join('\n') === t, t);
    check('sem pendências', r.pendencias.length === 0 && !/Pendências/.test(t));
    check('nada de erro nem aviso no log', !logs.some((l) => l[1] === 'error' || l[1] === 'warn'), JSON.stringify(logs.filter((l) => l[1] === 'warn' || l[1] === 'error')));
  }

  console.log('\n=== MPI Solutions: ID fixo 39 e modelo MPI ===');
  {
    const { deps, chamadas, logs } = fakeDeps();
    const r = await B.publicarBuscaOne({ ...TAREFA_BC, empresa: 'mpisolutions', idPainel: '555' }, deps);
    check('ok', r.ok === true);
    check('o fixo da marca (39) vence o ID da tarefa', chamadas.commitGeral[0].values.idProjetoBusca === '39' && chamadas.commitGeral[0].brand === 'mpisolutions');
    check('e-mail com o modelo MPI', /- MPI - \{dominio\}/.test(chamadas.enviarEmail[0].subjectTemplate) && /empresa MPI Solutions/.test(chamadas.enviarEmail[0].bodyTemplate));
    check('resumo diz "fixo da marca"', /39 \(fixo da marca\)/.test(resumoDoLog(logs)));

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
    check('o resumo diz que não estava', /não estava na tarefa/.test(resumoDoLog(logs)) && /Pendências:/.test(resumoDoLog(logs)));
  }

  console.log('\n=== Empresa: a resolvida pelo driver, o temporário como reserva, nada → desiste ===');
  {
    let f = fakeDeps();
    let r = await B.publicarBuscaOne({ ...TAREFA_BC, empresa: null, empresaTemporario: null }, f.deps);
    check('sem empresa: desiste sem fazer nada', r.ok === false && r.desistir === true && f.ordem.length === 0, JSON.stringify(r));
    f = fakeDeps();
    r = await B.publicarBuscaOne({ ...TAREFA_BC, empresa: null, empresaTemporario: 'mpisolutions' }, f.deps);
    check('só o temporário: usa ele', r.ok === true && f.chamadas.criarPropriedades[0].brand === 'mpisolutions');
    f = fakeDeps();
    r = await B.publicarBuscaOne({ ...TAREFA_BC, empresa: 'bc', empresaTemporario: 'mpisolutions' }, f.deps);
    check('a empresa já resolvida pelo driver vence a reserva', f.chamadas.criarPropriedades[0].brand === 'bc');
    f = fakeDeps();
    r = await B.publicarBuscaOne({ ...TAREFA_BC, dominio: '' }, f.deps);
    check('sem domínio: desiste sem fazer nada', r.ok === false && r.desistir === true && f.ordem.length === 0);
  }

  console.log('\n=== Repositório pelo caminho do temporário (ADR-133) ===');
  {
    // Repositório diferente do domínio real: o commit vai para o repositório;
    // propriedades, e-mail e resumo usam o domínio real.
    let f = fakeDeps();
    let r = await B.publicarBuscaOne({ ...TAREFA_BC, repositorio: 'x.com' }, f.deps);
    check('commit no repositório do temporário (x.com), marca bc', r.ok === true && f.chamadas.commitGeral[0].repo === 'x.com' && f.chamadas.commitGeral[0].brand === 'bc', JSON.stringify(f.chamadas.commitGeral));
    check('propriedades e e-mail com o domínio real (x.com.br)', f.chamadas.criarPropriedades[0].domain === 'x.com.br' && f.chamadas.enviarEmail[0].domains.join() === 'x.com.br');
    check('o resumo diz qual repositório recebeu o commit', /geral\.php \(repositório x\.com, do temporário\): commitado em bc\/x\.com/.test(resumoDoLog(f.logs)), resumoDoLog(f.logs));
    check('avisa no terminal que o repositório não é o domínio', f.logs.some((l) => /o repositório é x\.com \(do caminho do temporário\)/.test(l[0])));
    // Sem repositório na tarefa: o slug é o próprio domínio.
    f = fakeDeps();
    r = await B.publicarBuscaOne({ ...TAREFA_BC, repositorio: '' }, f.deps);
    check('sem repositório na tarefa: commit no domínio', f.chamadas.commitGeral[0].repo === 'x.com.br' && !/\(repositório/.test(resumoDoLog(f.logs)), resumoDoLog(f.logs));
    // Commit falha com repositório diferente: a linha diz onde tentou.
    f = fakeDeps({ commit: { ok: false, error: 'repositório não encontrado' } });
    r = await B.publicarBuscaOne({ ...TAREFA_BC, repositorio: 'x.com' }, f.deps);
    check('commit falha: o resumo diz o repositório tentado', /NÃO commitado em x\.com \(repositório não encontrado\)/.test(resumoDoLog(f.logs)), resumoDoLog(f.logs));
  }

  console.log('\n=== Pré-requisitos antes de qualquer efeito ===');
  {
    // O caso real de 01/10/2026: host nosso lido como domínio do cliente.
    for (const h of ['deploy.buscaclientes.com.br', 'deploy.buscacliente.com.br', 'producao.mpitemporario.com.br', 'x.mpitemporario.com.br']) {
      const f0 = fakeDeps();
      const r0 = await B.publicarBuscaOne({ ...TAREFA_BC, dominio: h }, f0.deps);
      check(`host nosso como domínio (${h}): desiste sem fazer nada`, r0.ok === false && r0.desistir === true && /host nosso/.test(r0.motivo) && f0.ordem.length === 0, JSON.stringify(r0));
    }
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
    check('  o resumo diz NÃO commitado', /NÃO commitado em x\.com\.br \(Não encontrei o geral\.php\)/.test(resumoDoLog(f.logs)), resumoDoLog(f.logs));
    check('  a mensagem diz NÃO commitado', /NÃO commitado/.test(r.mensagem));

    // Commit pulado (já estava igual): não é pendência.
    f = fakeDeps({ commit: { ok: true, skipped: true, workspace: 'bc', repo: 'x.com.br', branch: 'main' } });
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('geral.php já estava igual: ok, sem pendência', r.ok === true && r.pendencias.length === 0 && /já estava igual/.test(r.mensagem) && /já estava com esses valores/.test(resumoDoLog(f.logs)));

    // E-mail falha: erro (tenta de novo), sem mexer na tarefa.
    f = fakeDeps({ mail: { ok: false, error: 'sessão expirada', reauth: true } });
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('e-mail falha: erro, tarefa não é movida', r.ok === false && !r.desistir && /e-mail de vhost não saiu/.test(r.motivo) && f.chamadas.moverTarefa.length === 0, JSON.stringify(r));
    check('  reauth pede para reconectar a Microsoft', /reconecte a conta Microsoft/.test(r.motivo));
    check('  o que já foi feito vem no resultado', r.feito.propriedades && r.feito.commit && r.feito.commit.ok === true);
    f = fakeDeps({ mail: { ok: true, enviados: [], falhas: [{ dominio: 'x.com.br', erro: 'caixa cheia' }], total: 1 } });
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('e-mail com falha por domínio também é erro', r.ok === false && /caixa cheia/.test(r.motivo));

    // Mover a tarefa falha: só aviso, e o resumo sai do mesmo jeito.
    f = fakeDeps({ mover: { ok: false, error: 'sem permissão' } });
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('mover falha: continua ok, com aviso, resumo no terminal', r.ok === true && f.logs.filter((l) => l[1] === 'warn').length === 1 && r.feito.tarefa.movida === false && /G-ABC123/.test(resumoDoLog(f.logs)), JSON.stringify(f.logs.filter((l) => l[1] === 'warn')));
    check('  a mensagem não promete "Em andamento"', !/Em andamento/.test(r.mensagem));

    // Sem id de tarefa: não tenta mover, e é ok.
    f = fakeDeps();
    r = await B.publicarBuscaOne({ ...TAREFA_BC, id: '', link: '' }, f.deps);
    check('sem tarefa: não mexe no Salesforce', r.ok === true && f.chamadas.moverTarefa.length === 0);
  }

  console.log('\n=== Freio de emergência entre as etapas (ADR-133) ===');
  {
    // Apertado antes de começar: nada.
    let f = fakeDeps({ deps: { parar: () => true } });
    let r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('freio antes de começar: pula sem fazer nada', r.ok === false && r.pulou === true && f.ordem.length === 0, JSON.stringify(r));
    // Apertado enquanto as propriedades eram criadas (o caso de 01/10): sem
    // commit e, principalmente, SEM e-mail.
    f = fakeDeps();
    f.deps.parar = () => f.chamadas.criarPropriedades.length > 0;
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('freio durante as propriedades: nada commitado, nenhum e-mail, tarefa intocada', r.ok === false && r.pulou === true && f.ordem.join() === 'criarPropriedades' && /nenhum e-mail/.test(r.motivo), JSON.stringify({ r, ordem: f.ordem }));
    // Apertado depois do commit: o e-mail não sai, e o motivo diz que o commit foi.
    f = fakeDeps();
    f.deps.parar = () => f.chamadas.commitGeral.length > 0;
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('freio depois do commit: e-mail não sai, motivo avisa do commit', r.pulou === true && f.ordem.join() === 'criarPropriedades,commitGeral' && /geral\.php já foi commitado/.test(r.motivo), JSON.stringify({ r, ordem: f.ordem }));
    // Apertado depois do e-mail: a tarefa ainda é movida e o resumo sai (o e-mail saiu; tem que ficar dito).
    f = fakeDeps();
    f.deps.parar = () => f.chamadas.enviarEmail.length > 0;
    r = await B.publicarBuscaOne(TAREFA_BC, f.deps);
    check('freio depois do e-mail: a tarefa ainda é movida e o resumo sai', r.ok === true && f.chamadas.moverTarefa.length === 1 && /e-mail de vhost enviado/.test(r.mensagem) && /Criação de Vhost/.test(resumoDoLog(f.logs)), JSON.stringify(r));
  }

  console.log('\n=== Propriedade que faltou vira pendência ===');
  {
    const google = { ok: true, result: { ...RESULTADO_GOOGLE.result, tagmanager: '', faltando: ['Tag Manager'], reaproveitados: [] } };
    const { deps, logs } = fakeDeps({ google });
    const r = await B.publicarBuscaOne(TAREFA_BC, deps);
    check('Tag Manager faltando: ok com pendência', r.ok === true && r.pendencias.some((p) => /Tag Manager/.test(p)));
    check('o resumo diz "não criado"', /Tag Manager: não criado \(NÃO criado\)/.test(resumoDoLog(logs)), resumoDoLog(logs));
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
