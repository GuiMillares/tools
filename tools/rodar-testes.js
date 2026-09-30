// Roda todos os tools/test-*.js de uma vez e resume: quais passaram, quantas
// verificações, quanto tempo cada um levou. É a "eval" do Hub (ADR-106).
//
//     node tools/rodar-testes.js                 todos, um de cada vez
//     node tools/rodar-testes.js zona painel     só os que têm esses nomes
//     node tools/rodar-testes.js --json r.json   guarda o resultado em JSON
//
// Cada teste roda no próprio processo, como se fosse chamado à mão: um teste
// que troca Module._load ou chama process.exit não contamina o vizinho. Sai
// com código 1 se qualquer um falhar, e aí mostra as linhas que falharam.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PRAZO_MS = 180000; // o mais lento hoje leva ~5 s; 3 min é travado, não lento

const args = process.argv.slice(2);
const iJson = args.indexOf('--json');
const saidaJson = iJson >= 0 ? args[iJson + 1] : '';
const filtros = args.filter((a, i) => !a.startsWith('--') && (iJson < 0 || i !== iJson + 1));

const arquivos = fs.readdirSync(__dirname)
  .filter((f) => /^test-.+\.js$/.test(f))
  .filter((f) => !filtros.length || filtros.some((x) => f.includes(x)))
  .sort();

if (!arquivos.length) {
  console.log(filtros.length ? `Nenhum teste com "${filtros.join('", "')}" no nome.` : 'Nenhum tools/test-*.js encontrado.');
  process.exit(1);
}

console.log(`\nRodando ${arquivos.length} teste(s) com ${process.execPath} (Node ${process.versions.node})\n`);

const resultados = [];
const inicio = Date.now();
for (const arquivo of arquivos) {
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [path.join('tools', arquivo)], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: PRAZO_MS,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const saida = `${r.stdout || ''}${r.stderr || ''}`;
  const linhas = saida.split(/\r?\n/);
  const ok = linhas.filter((l) => /^\s+ok\b/.test(l)).length;
  const falhas = linhas.filter((l) => /FALHOU/.test(l));
  const estourou = r.error && r.error.code === 'ETIMEDOUT';
  const passou = !estourou && r.status === 0 && falhas.length === 0;
  const res = {
    arquivo,
    passou,
    codigo: r.status,
    ok,
    falhas: falhas.length,
    ms: Math.round(ms),
    motivo: estourou ? `passou de ${PRAZO_MS / 1000}s` : r.error ? r.error.message : '',
    linhasFalhas: falhas.map((l) => l.trim()),
    // Quem saiu com erro sem nenhuma linha FALHOU quebrou antes de testar:
    // o fim da saída é o que explica.
    fimDaSaida: passou ? '' : linhas.filter(Boolean).slice(-8).join('\n'),
  };
  resultados.push(res);
  const marca = passou ? 'ok    ' : 'FALHOU';
  console.log(`  ${marca} ${arquivo.padEnd(34)} ${String(ok).padStart(4)} verificações  ${String(res.ms).padStart(6)} ms${res.motivo ? `  (${res.motivo})` : ''}`);
}

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
