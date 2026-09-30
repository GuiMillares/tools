// ADR-103: o site que espera a propagação do Registro.br sai da tela e vai
// para a lista de espera; o vigia termina um de cada vez, primeiro o de
// previsão mais cedo; o painel atende uma chamada por vez.
//
//     node tools/test-esperas.js

const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf-8');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');
const recorta = (fonte, a, b) => { const i = fonte.indexOf(a); const f = fonte.indexOf(b, i); if (i < 0 || f < 0) throw new Error('não achei ' + a); return fonte.slice(i, f); };

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

function montar({ apontamentos = {}, ssl = () => ({ ok: true, log: [] }), sc = () => ({ ok: true }), tarefa = () => ({ ok: true, comentado: { pessoa: 'Julia Rocha' }, log: [] }), pubInicial = null } = {}) {
  const ordem = [];
  const guardado = {};
  const corpo = `
    const logs = []; const log = (m, t) => logs.push({ m, t });
    const localStorage = { getItem: (k) => guardado[k] || null, setItem: (k, v) => { guardado[k] = v; } };
    const document = { getElementById: () => null };
    const state = { view: 'hub' };
    let bulkRodando = false;
    let pub = pubInicial;
    const pubNovo = () => ({ empresa: 'auto', dominio: '', feitas: {} });
    const renderPublishTool = () => {};
    const escapeHtml = (x) => String(x);
    const normalizePainelUrl = (u) => u;
    const conferirApontamentoDeProducao = async (d) => apontamentos[d] || { pronto: false, motivo: 'ainda não resolve' };
    const verificarScERelatorio = async () => { ordem.push('sc'); return sc(); };
    const window = { api: {
      publicarPainel: async (o) => { ordem.push('ssl:' + o.dominio); return ssl(o); },
      salesforceFecharTarefa: async (o) => { ordem.push('tarefa:' + o.link); return tarefa(o); },
    } };
    ${recorta(app, '// ----- Sites esperando a propagação (ADR-103) -----', '// A espera adiada: até o fim')}
    return {
      pubMandarParaEspera, vigiarEsperas, terminarEspera, carregarEsperas, vSemSegredos, logs,
      get esperas() { return esperas; }, set esperas(v) { esperas = v; }, get pub() { return pub; },
    };`;
  const M = new Function('apontamentos', 'ssl', 'sc', 'tarefa', 'ordem', 'guardado', 'pubInicial', corpo)(apontamentos, ssl, sc, tarefa, ordem, guardado, pubInicial);
  return { M, ordem, guardado };
}

(async () => {
  console.log('\n=== O site vai para a espera e a tela fica livre ===');
  {
    const pubEsperando = {
      empresa: 'bc', dominio: 'srengenharia.seg.br', painelUrl: 'https://idealplus.idealtrends.io/clientes/1/hub?projeto=2', sfTarefa: 'https://x/lightning/r/Task/00T/view',
      sslAdiado: { ate: Date.now() + 2 * 3600 * 1000 }, scPendente: true, feitas: {},
      v: { domain: 'srengenharia.seg.br', siteUrl: 'https://srengenharia.seg.br/', idAnalytics: 'G-1', siteKey: 'SITE', secretKey: 'SEGREDO-RECAPTCHA' },
    };
    const { M, guardado } = montar({ pubInicial: pubEsperando });
    M.pubMandarParaEspera();
    const e = M.esperas[0];
    check('entrou na lista com o que falta', e && e.dominio === 'srengenharia.seg.br' && e.falta.join(' | ') === 'o SSL de produção | o Search Console e o relatório do painel | fechar a tarefa do Salesforce', JSON.stringify(e && e.falta));
    check('a tela ficou livre para outro site (mesma empresa)', M.pub.dominio === '' && M.pub.empresa === 'bc');
    check('o log diz a hora prevista e que pode publicar outro', M.logs.some((l) => /lista de espera: o Registro\.br publica a troca de DNS por volta de .*Pode publicar outro site/.test(l.m)));
    const disco = JSON.stringify(guardado);
    check('guardou a lista para sobreviver a fechar o app', /srengenharia\.seg\.br/.test(disco));
    check('sem a chave secreta do reCAPTCHA no disco', !/SEGREDO-RECAPTCHA/.test(disco) && !/"siteKey"/.test(disco));
  }

  console.log('\n=== Dois esperando: termina primeiro o de previsão mais cedo, um de cada vez ===');
  {
    const agora = Date.now();
    const { M, ordem } = montar({ apontamentos: { 'a.com.br': { pronto: true, ip: '149.18.102.39' }, 'b.com.br': { pronto: true, ip: '149.18.102.39' } } });
    const nova = (dominio, ate) => ({ id: dominio, dominio, painelUrl: 'u', sfTarefa: `t-${dominio}`, ate, scPendente: false, sslFeito: false, v: null, falta: ['o SSL de produção', 'fechar a tarefa do Salesforce'], status: 'esperando', detalhe: '' });
    // Previsões já vencidas: desde a ADR-124 o vigia só confere quem passou da
    // previsão do Registro.br (antes disso ele dorme até ela).
    M.esperas = [nova('b.com.br', agora - 10 * 60000), nova('a.com.br', agora - 40 * 60000)];
    await M.vigiarEsperas();
    check('o de previsão mais cedo primeiro, e cada um inteiro antes do outro', ordem.join() === 'ssl:a.com.br,tarefa:t-a.com.br,ssl:b.com.br,tarefa:t-b.com.br', ordem.join());
    check('os dois concluídos', M.esperas.every((e) => e.status === 'concluido'), JSON.stringify(M.esperas.map((e) => e.status)));
  }

  console.log('\n=== Ainda não aponta: continua esperando, sem mexer em nada ===');
  {
    const { M, ordem } = montar();
    // Previsão vencida, para o vigia conferir (ADR-124) e achar o DNS ainda velho.
    const e = { id: 'c', dominio: 'c.com.br', ate: Date.now() - 60000, falta: ['o SSL de produção'], status: 'esperando', sfTarefa: '' };
    M.esperas = [e];
    const vigia = M.vigiarEsperas();
    await new Promise((r) => setTimeout(r, 20));
    check('nada foi chamado', ordem.length === 0 && e.status === 'esperando' && /ainda não resolve/.test(e.detalhe), JSON.stringify(e));
    e.status = 'concluido'; // encerra o vigia do teste
    await M.vigiarEsperas({ agora: true });
    await vigia;
  }

  console.log('\n=== A tarefa só fecha com tudo concluído (ADR-101) ===');
  {
    const { M, ordem } = montar({ ssl: () => ({ ok: false, error: 'o SSL não ficou ativo: ainda entrega o certificado de srv-wp-02' }) });
    const e = { dominio: 'd.com.br', painelUrl: 'u', sfTarefa: 'tarefa', falta: ['o SSL de produção', 'fechar a tarefa do Salesforce'], status: 'rodando', scPendente: false };
    const r = await M.terminarEspera(e, { ativarSsl: async () => ({ ok: false, error: 'ainda entrega o certificado de srv-wp-02' }), verificarSc: async () => ({ ok: true }), fecharTarefa: async () => { ordem.push('fechou'); return { ok: true }; } });
    check('SSL não saiu: não fecha a tarefa', !r.ok && e.status === 'falhou' && !ordem.includes('fechou') && /SSL não ficou ativo/.test(e.detalhe), e.detalhe);
    const r2 = await M.terminarEspera(e, { ativarSsl: async () => ({ ok: true }), verificarSc: async () => ({ ok: true }), fecharTarefa: async () => { ordem.push('fechou'); return { ok: true, comentado: { pessoa: 'Julia Rocha' } }; } });
    check('"Tentar de novo" com o SSL no ar: fecha', r2.ok && e.status === 'concluido' && ordem.includes('fechou') && /comentário marcando Julia Rocha/.test(e.detalhe), e.detalhe);

    const e2 = { dominio: 'e.com.br', sfTarefa: 'tarefa', falta: ['o SSL de produção', 'o Search Console e o relatório do painel', 'fechar a tarefa do Salesforce'], status: 'rodando', scPendente: true, v: { siteUrl: 'x' }, sslFeito: true };
    let fechou = false;
    await M.terminarEspera(e2, { ativarSsl: async () => { throw new Error('não devia pedir o SSL de novo'); }, verificarSc: async () => ({ ok: false, error: 'não achei a tag' }), fecharTarefa: async () => { fechou = true; return { ok: true }; } });
    check('SSL já feito não é pedido de novo; Search Console falhou: não fecha', !fechou && e2.status === 'falhou' && /Search Console não verificou: não achei a tag/.test(e2.detalhe), e2.detalhe);
  }

  console.log('\n=== Reabrindo o app: a lista volta ===');
  {
    const { M, guardado } = montar();
    guardado['hub.esperasPropagacao.v1'] = JSON.stringify([{ id: 'f', dominio: 'f.com.br', ate: Date.now() + 3600000, falta: ['o SSL de produção'], status: 'rodando', sfTarefa: '' }]);
    M.carregarEsperas();
    check('quem estava terminando volta a esperar', M.esperas[0].status === 'esperando');
    check('e avisa no terminal', M.logs.some((l) => /esperando a propagação: f\.com\.br/.test(l.m)));
    M.esperas[0].status = 'concluido';
    await M.vigiarEsperas({ agora: true });
  }

  console.log('\n=== main: o painel atende uma chamada por vez ===');
  {
    const handlers = {};
    const N = new Function('ipcMain', `${recorta(main, 'let filaDoPainel = Promise.resolve();', "\nipcMain.handle('painel:setCreds'")} return { naFilaDoPainel, handleNoPainel };`)({ handle: (n, f) => { handlers[n] = f; } });
    const linha = [];
    const tarefa = (nome, ms, falha) => async () => { linha.push(`início ${nome}`); await new Promise((r) => setTimeout(r, ms)); linha.push(`fim ${nome}`); if (falha) throw new Error('x'); return nome; };
    const a = N.naFilaDoPainel(tarefa('A', 30, true)).catch(() => 'A falhou');
    const b = N.naFilaDoPainel(tarefa('B', 5));
    await Promise.all([a, b]);
    check('B só começa quando A termina, mesmo A tendo falhado', linha.join(' | ') === 'início A | fim A | início B | fim B', linha.join(' | '));
    N.handleNoPainel('painel:teste', async (_e, p) => p.x * 2);
    check('o handler registrado passa pela fila e devolve o resultado', (await handlers['painel:teste']({}, { x: 21 })) === 42);
  }

  console.log('\n=== main: a conferência do apontamento olha o DNS público, não só o cache local (ADR-104) ===');
  {
    // dns falso: o resolvedor local ainda tem o IP antigo; os públicos já têm o novo.
    const porServidor = (servidores) => {
      const chave = servidores ? servidores[0] : 'local';
      const mapa = { local: ['200.1.1.9'], '8.8.8.8': ['149.18.102.39'], '1.1.1.1': ['149.18.102.39'], '9.9.9.9': ['149.18.102.39'], '208.67.222.222': ['149.18.102.39'] };
      return mapa[chave] || [];
    };
    class ResolverFake {
      constructor() { this.servidores = null; }
      setServers(s) { this.servidores = s; }
      async resolve4(host) { const ips = porServidor(this.servidores); if (!ips.length) { const e = new Error('NXDOMAIN'); e.code = 'ENOTFOUND'; throw e; } return ips; }
    }
    const fakeRequire = (m) => (m === 'dns' ? { promises: { Resolver: ResolverFake } } : require(m));
    const handlers = {};
    const corpo = `
      const DNS_TIMEOUT_MS = 5000;
      const require = fakeRequire;
      const ipcMain = { handle: (n, f) => { handlers[n] = f; } };
      const normalizeDomain = (d) => String(d || '').trim().toLowerCase();
      ${recorta(main, 'function resolveA(host) {', '\n// O domínio já aponta')}
      ${recorta(main, "ipcMain.handle('dns:apontando'", '\n// Resolve o domínio; se o apex')}
      return { handlers };`;
    new Function('fakeRequire', 'handlers', corpo)(fakeRequire, handlers);
    const r = await handlers['dns:apontando']({}, { dominio: 'climagemcarpina.com.br', ip: '149.18.102.39' });
    check('aponta, porque os públicos já veem o IP novo', r.ok && r.apontando === true, JSON.stringify(r).slice(0, 200));
    check('mostra que veio dos públicos, não do local', !r.vistoEm.includes('local') && r.vistoEm.includes('8.8.8.8'), JSON.stringify(r.vistoEm));
    check('junta os IPs de todas as fontes', r.raiz.includes('149.18.102.39') && r.raiz.includes('200.1.1.9'), JSON.stringify(r.raiz));
  }

  console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
  process.exit(falhas ? 1 : 0);
})();
