// Roda todos os tools/test-*.js de uma vez e resume: quais passaram, quantas
// verificações, quanto tempo cada um levou. É a "eval" do Hub (ADR-106).
//
//     node tools/rodar-testes.js                 todos, vários ao mesmo tempo (ADR-156)
//     node tools/rodar-testes.js zona painel     só os que têm esses nomes
//     node tools/rodar-testes.js --serial        um de cada vez, como antes
//     node tools/rodar-testes.js --paralelo 2    quantos ao mesmo tempo
//     node tools/rodar-testes.js --json r.json   guarda o resultado em JSON
//
// Cada teste roda no próprio processo, como se fosse chamado à mão: um teste
// que troca Module._load ou chama process.exit não contamina o vizinho. Em
// paralelo, cada um usa a própria pasta temporária, então não se pisam. Sai
// com código 1 se qualquer um falhar, e aí mostra as linhas que falharam.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PRAZO_MS = 180000; // o mais lento hoje leva ~60 s; 3 min é travado, não lento

const args = process.argv.slice(2);
const iJson = args.indexOf('--json');
const saidaJson = iJson >= 0 ? args[iJson + 1] : '';
const iPar = args.indexOf('--paralelo');
const serial = args.includes('--serial');
const paralelo = serial ? 1 : iPar >= 0 ? Math.max(1, Number(args[iPar + 1]) || 1) : Math.max(1, Math.min(4, (os.cpus() || []).length - 1));
const valoresDeFlag = new Set([iJson >= 0 ? iJson + 1 : -1, iPar >= 0 ? iPar + 1 : -1]);
const filtros = args.filter((a, i) => !a.startsWith('--') && !valoresDeFlag.has(i));

// Quem mede tempo de resposta não pode dividir a CPU com os outros: roda
// sozinho, depois da leva em paralelo.
const SOZINHOS = ['test-git-bash.js'];

const arquivos = fs.readdirSync(__dirname)
  .filter((f) => /^test-.+\.js$/.test(f))
  .filter((f) => !filtros.length || filtros.some((x) => f.includes(x)))
  .sort();

if (!arquivos.length) {
  console.log(filtros.length ? `Nenhum teste com "${filtros.join('", "')}" no nome.` : 'Nenhum tools/test-*.js encontrado.');
  process.exit(1);
}

console.log(`\nRodando ${arquivos.length} teste(s) com ${process.execPath} (Node ${process.versions.node})${paralelo > 1 ? `, ${paralelo} ao mesmo tempo` : ', um de cada vez'}\n`);

// Um teste num processo próprio; devolve o resultado quando ele termina.
function rodar(arquivo) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const partes = [];
    let estourou = false;
    const filho = spawn(process.execPath, [path.join('tools', arquivo)], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    filho.stdout.on('data', (d) => partes.push(d));
    filho.stderr.on('data', (d) => partes.push(d));
    const prazo = setTimeout(() => { estourou = true; try { filho.kill(); } catch (e) { /* já morreu */ } }, PRAZO_MS);
    filho.on('close', (codigo) => {
      clearTimeout(prazo);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const saida = Buffer.concat(partes).toString('utf-8');
      const linhas = saida.split(/\r?\n/);
      const ok = linhas.filter((l) => /^\s+ok\b/.test(l)).length;
      const falhas = linhas.filter((l) => /FALHOU|^ FALHA /.test(l));
      const passou = !estourou && codigo === 0 && falhas.length === 0;
      resolve({
        arquivo,
        passou,
        codigo,
        ok,
        falhas: falhas.length,
        ms: Math.round(ms),
        motivo: estourou ? `passou de ${PRAZO_MS / 1000}s` : '',
        linhasFalhas: falhas.map((l) => l.trim()),
        // Quem saiu com erro sem nenhuma linha FALHOU quebrou antes de testar:
        // o fim da saída é o que explica.
        fimDaSaida: passou ? '' : linhas.filter(Boolean).slice(-8).join('\n'),
      });
    });
  });
}

(async () => {
  const inicio = Date.now();
  const resultados = new Array(arquivos.length);
  const mostrar = (res) => {
    const marca = res.passou ? 'ok    ' : 'FALHOU';
    console.log(`  ${marca} ${res.arquivo.padEnd(34)} ${String(res.ok).padStart(4)} verificações  ${String(res.ms).padStart(6)} ms${res.motivo ? `  (${res.motivo})` : ''}`);
  };
  const emParalelo = arquivos.map((a, i) => i).filter((i) => paralelo === 1 || !SOZINHOS.includes(arquivos[i]));
  const sozinhos = arquivos.map((a, i) => i).filter((i) => !emParalelo.includes(i));
  let proximo = 0;
  async function trabalhador() {
    while (proximo < emParalelo.length) {
      const i = emParalelo[proximo++];
      resultados[i] = await rodar(arquivos[i]);
      mostrar(resultados[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(paralelo, emParalelo.length) }, trabalhador));
  for (const i of sozinhos) { resultados[i] = await rodar(arquivos[i]); mostrar(resultados[i]); }

  const totalMs = Date.now() - inicio;
  const quebrados = resultados.filter((r) => !r.passou);
  const verificacoes = resultados.reduce((s, r) => s + r.ok, 0);
  const falhasTotal = resultados.reduce((s, r) => s + r.falhas, 0);
  const lentos = [...resultados].sort((a, b) => b.ms - a.ms).slice(0, 3);

  console.log(`\n${resultados.length - quebrados.length} de ${resultados.length} arquivo(s) passaram · ${verificacoes} verificações ok · ${falhasTotal} falha(s) · ${(totalMs / 1000).toFixed(1)} s no total`);
  console.log(`Mais lentos: ${lentos.map((r) => `${r.arquivo} (${(r.ms / 1000).toFixed(1)} s)`).join(', ')}`);

  for (const r of quebrados) {
    console.log(`\n--- ${r.arquivo} (código ${r.codigo}${r.motivo ? `, ${r.motivo}` : ''}) ---`);
    if (r.linhasFalhas.length) for (const l of r.linhasFalhas) console.log(`  ${l}`);
    else console.log(r.fimDaSaida);
  }

  if (saidaJson) {
    fs.writeFileSync(path.resolve(saidaJson), JSON.stringify({
      quando: new Date().toISOString(),
      node: process.versions.node,
      paralelo,
      totalMs,
      arquivos: resultados.length,
      passaram: resultados.length - quebrados.length,
      verificacoes,
      falhas: falhasTotal,
      resultados,
    }, null, 2));
    console.log(`\nResultado em ${path.resolve(saidaJson)}`);
  }

  console.log('');
  process.exit(quebrados.length ? 1 : 0);
})();
