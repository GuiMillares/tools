// ADR-130: o `npm run medir` conta os quadros antes do parado e do minimizado,
// e o relatório não apresenta como consumo o parado de uma janela que não
// desenhou. Monta o relatório com resultados feitos à mão (sem abrir o
// Electron) e confere o texto e o resumo do JSON; o que o motor faz é
// conferido no próprio código.
//
//     node tools/test-medir-recursos.js

const fs = require('fs');
const path = require('path');
const { montarRelatorio, validadeDoCenario } = require('./medir-recursos');
const fonte = fs.readFileSync(path.join(__dirname, 'medir-recursos.js'), 'utf-8');

let falhas = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ok   ${n}`); else { falhas++; console.log(`  FALHOU  ${n}${d ? ` (${d})` : ''}`); } };

// O que o motor grava, só com o que o relatório lê: 60 s parado na tela e 60 s
// minimizado, uma amostra por segundo, a janela gastando `cpu` da máquina.
const TELA = { largura: 1366, altura: 768, escala: 1, hz: 60 };
function resultado({ ocioso, minimizado, cpu = 0.2 }) {
  const cenarios = [];
  const amostras = [];
  let t = 1e12;
  for (const [nome, prova] of [['ocioso', ocioso], ['minimizado', minimizado]]) {
    const t0 = t;
    t += 2500; // a prova de quadros vem antes da janela de CPU
    const inicio = t;
    for (let i = 0; i < 60; i++) {
      t += 1000;
      amostras.push({ t, dt: 1000, cenario: nome, procs: [{ tipo: 'Tab', nome: '', cpu, ws: 90 * 1024, priv: 70 * 1024 }, { tipo: 'Browser', nome: '', cpu: 0.03, ws: 160 * 1024, priv: 110 * 1024 }] });
    }
    cenarios.push({ nome, inicio, fim: t, ms: t - inicio, cpuPrincipalMs: 20, cpuJanelaMs: 100, scriptMs: 1, layoutMs: 0, layouts: 0, prova: prova && { t0, segundos: 2, foco: false, janela: { largura: 1240, altura: 800 }, tela: TELA, ...prova } });
    t += 1800; // entre os cenários, o motor minimiza e restaura
  }
  return { versoes: { electron: '31', chrome: '126', node: '20' }, cfg: {}, marcos: {}, requires: [], fotos: [], cenarios, amostras, bloqueios: [], erros: [], janelaMudou: [], gravadoNaPastaDescartavel: [] };
}
const secao = (texto, titulo) => { const i = texto.indexOf(`\n${titulo}`); if (i < 0) return ''; const f = texto.indexOf('\n\n', i + 1); return texto.slice(i + 1, f < 0 ? undefined : f); };
const linhaCpu = (texto, nome) => texto.split('\n').find((l) => l.startsWith(`  ${nome.padEnd(14)} `)) || '';
const naTela = { quadros: 1, minimizada: false, visivel: true };
const fora = { quadros: 0, minimizada: true, visivel: false };

console.log('\n=== Na tela e minimizada, como deve ser ===');
{
  const r = resultado({ ocioso: naTela, minimizado: fora });
  const m = r.cenarios[1];
  r.janelaMudou = [{ ev: 'minimize', t: m.prova.t0 - 1000, cenario: 'entre cenários' }, { ev: 'restore', t: m.fim + 200, cenario: 'entre cenários' }];
  const { texto, resumo } = montarRelatorio(r, []);
  const parado = secao(texto, 'PARADO NA TELA INICIAL');
  const minim = secao(texto, 'PARADO E MINIMIZADO');
  check('o parado mostra os quadros em 2 s e se a janela estava minimizada', /quadros em 2 s \(antes da medida\): 1 · minimizada: não · visível: sim/.test(parado), parado);
  check('e o tamanho da janela e a frequência da tela', /janela 1240×800 · tela 1366×768, 60 Hz/.test(parado), parado);
  check('e apresenta o consumo', /TOTAL\s+média\s+0\.2%/.test(parado) && !/INVÁLIDO|SEM PROVA/.test(parado), parado);
  check('o minimizado mostra 0 quadros, minimizada: sim, e o consumo', /quadros em 2 s \(antes da medida\): 0 · minimizada: sim/.test(minim) && /TOTAL/.test(minim) && !/INVÁLIDO/.test(minim), minim);
  check('minimizar e restaurar do próprio motor, entre os cenários, não conta', /no meio de um cenário: não/.test(texto) && resumo.janelaMudou.length === 0);
  check('o resumo do JSON guarda a prova e diz que vale', resumo.ocioso.valido === true && resumo.ocioso.prova.quadros === 1 && resumo.ocioso.prova.tela.hz === 60 && resumo.minimizado.valido === true && resumo.minimizado.prova.minimizada === true);
  check('a tabela de CPU por cenário não marca nada', !/inválido|sem prova/.test(linhaCpu(texto, 'ocioso') + linhaCpu(texto, 'minimizado')));
}

console.log('\n=== Alguém minimizou a janela de teste antes do parado ===');
{
  const { texto, resumo } = montarRelatorio(resultado({ ocioso: fora, minimizado: fora }), []);
  const parado = secao(texto, 'PARADO NA TELA INICIAL');
  check('o parado sai INVÁLIDO, com o motivo', /INVÁLIDO: 0 quadros em 2 s com a janela minimizada: ela não desenhou/.test(parado), parado);
  check('e o número não aparece como consumo (sem tabela nem TOTAL)', !/TOTAL|média|conferência/.test(parado), parado);
  check('mas fica anotado numa linha, para quem for investigar', /\(o que se mediu assim: janela 0\.2% · principal 0\.0% · total 0\.2%\)/.test(parado), parado);
  check('o resumo do JSON diz que não vale e por quê', resumo.ocioso.valido === false && /minimizada/.test(resumo.ocioso.invalido || ''));
  check('e a tabela de CPU por cenário marca o parado', /inválido$/.test(linhaCpu(texto, 'ocioso')), linhaCpu(texto, 'ocioso'));
}

console.log('\n=== Escondida, e 0 quadros sem motivo conhecido ===');
{
  let parado = secao(montarRelatorio(resultado({ ocioso: { quadros: 0, minimizada: false, visivel: false }, minimizado: fora }), []).texto, 'PARADO NA TELA INICIAL');
  check('escondida (não visível) com 0 quadros também é inválido', /INVÁLIDO: 0 quadros em 2 s com a janela escondida/.test(parado), parado);
  const { texto, resumo } = montarRelatorio(resultado({ ocioso: { quadros: 0, minimizada: false, visivel: true }, minimizado: fora }), []);
  parado = secao(texto, 'PARADO NA TELA INICIAL');
  check('0 quadros com a janela na tela sai como SEM PROVA, com o consumo', /SEM PROVA: 0 quadros em 2 s/.test(parado) && /--por-cima/.test(parado) && /TOTAL/.test(parado) && !/INVÁLIDO/.test(parado), parado);
  check('o resumo marca a falta de prova sem invalidar', resumo.ocioso.valido === true && /nada prova/.test(resumo.ocioso.semProva || ''));
  check('e a tabela de CPU por cenário também', /sem prova$/.test(linhaCpu(texto, 'ocioso')), linhaCpu(texto, 'ocioso'));
  parado = secao(montarRelatorio(resultado({ ocioso: { quadros: 60, minimizada: false, visivel: true }, minimizado: fora }), []).texto, 'PARADO NA TELA INICIAL');
  check('60 quadros (uma animação infinita) é consumo de verdade: vale', /antes da medida\): 60 ·/.test(parado) && /TOTAL/.test(parado) && !/INVÁLIDO|SEM PROVA/.test(parado), parado);
}

console.log('\n=== Mexeram na janela no meio da medida ===');
{
  const r = resultado({ ocioso: naTela, minimizado: fora });
  const o = r.cenarios[0];
  r.janelaMudou = [{ ev: 'minimize', t: o.inicio + 23000, cenario: 'ocioso' }, { ev: 'restore', t: o.inicio + 41000, cenario: 'ocioso' }];
  const { texto, resumo } = montarRelatorio(r, []);
  const parado = secao(texto, 'PARADO NA TELA INICIAL');
  check('a prova do começo valia, mas o parado sai INVÁLIDO', /INVÁLIDO: a janela mudou no meio da medida \(minimizada aos 23 s, restaurada aos 41 s\)/.test(parado), parado);
  check('e a segurança da medição diz em que cenário', /no meio de um cenário: minimizada \(ocioso\), restaurada \(ocioso\)/.test(texto) && resumo.janelaMudou.length === 2);
  const r2 = resultado({ ocioso: naTela, minimizado: fora });
  const bloqueio = [{ ev: 'lock-screen', t: r2.cenarios[0].prova.t0 + 500, cenario: 'entre cenários' }];
  check('tela bloqueada durante a prova de quadros também tira o valor', /tela bloqueada durante a prova de quadros/.test(validadeDoCenario(r2.cenarios[0], bloqueio).invalido || ''));
  const minim = secao(montarRelatorio(resultado({ ocioso: naTela, minimizado: { quadros: 1, minimizada: false, visivel: true } }), []).texto, 'PARADO E MINIMIZADO');
  check('o minimizado com a janela na tela sai INVÁLIDO', /INVÁLIDO: a janela não estava minimizada \(1 quadro em 2 s\)/.test(minim) && !/TOTAL/.test(minim), minim);
  // Medido em 30/09: minimizada, a janela entregou 1 quadro à captura. A
  // contagem sozinha não separa a janela parada da minimizada.
  const um = secao(montarRelatorio(resultado({ ocioso: { quadros: 1, minimizada: true, visivel: false }, minimizado: fora }), []).texto, 'PARADO NA TELA INICIAL');
  check('minimizada com 1 quadro também é inválido', /INVÁLIDO: a janela estava minimizada \(1 quadro em 2 s\)/.test(um) && !/TOTAL/.test(um), um);
  // A medição parou no meio do terminal: ele não chega a r.cenarios.
  const r4 = resultado({ ocioso: naTela, minimizado: fora });
  r4.marcos.pronto = r4.cenarios[0].prova.t0 - 3000;
  r4.janelaMudou = [{ ev: 'show', t: r4.marcos.pronto - 1000, cenario: 'abertura' }, { ev: 'minimize', t: r4.cenarios[1].fim + 30000, cenario: 'terminal' }];
  const t4 = montarRelatorio(r4, []).texto;
  check('o evento do cenário em que a medição parou aparece na segurança', /no meio de um cenário: minimizada \(terminal, que não terminou\)$/m.test(t4), t4.split('\n').find((l) => /no meio de um cenário/.test(l)));
}

console.log('\n=== O motor conta os quadros fora da janela de CPU ===');
{
  check('a captura liga e desliga dentro da prova, em 2 s', /wc\.beginFrameSubscription\(false, \(\) => \{ quadros\+\+; \}\);\s*await dormir\(2000\);\s*wc\.endFrameSubscription\(\);/.test(fonte));
  check('o parado conta antes de o cenário começar e guarda a prova nele', /const prova = await provaDeQuadros\(\);\s*await cenario\('ocioso', async \(\) => \{[\s\S]*?return \{ prova \};/.test(fonte));
  check('o minimizado minimiza, conta e só então começa; volta depois', /janela\.minimize\(\);\s*await dormir\(1000\);\s*const prova = await provaDeQuadros\(\);\s*await cenario\('minimizado', async \(\) => \{[\s\S]*?return \{ prova \};\s*\}\);\s*janela\.restore\(\);/.test(fonte));
  const blocos = [...fonte.matchAll(/\n( *)await cenario\('([a-z]+)', async \(\) => \{([\s\S]*?)\n\1\}\);/g)].map((m) => ({ nome: m[2], corpo: m[3] }));
  check(`nenhum cenário captura quadros dentro da própria janela de CPU (${blocos.map((b) => b.nome).join(', ')})`, blocos.length === 8 && blocos.every((b) => !/provaDeQuadros|beginFrameSubscription/.test(b.corpo)));
  check('a prova anota minimizada, visível, foco, tamanho e frequência da tela', /minimizada: janela\.isMinimized\(\)/.test(fonte) && /visivel: janela\.isVisible\(\)/.test(fonte) && /foco: janela\.isFocused\(\)/.test(fonte) && /screen\.getDisplayMatching\(b\)/.test(fonte) && /hz: tela\.displayFrequency/.test(fonte));
  check('os eventos da janela e da tela ficam anotados', /for \(const ev of \['minimize', 'restore', 'hide', 'show'\]\) w\.on\(ev/.test(fonte) && /for \(const ev of \['lock-screen', 'unlock-screen'\]\) powerMonitor\.on\(ev/.test(fonte));
  // Em 30/09, minimizada no meio do terminal, a rodada ficou 17 min parada
  // esperando um quadro, até o prazo.
  check('minimizada por fora num cenário que espera desenhar, a medição para e diz por quê', /const PRECISA_DESENHAR = new Set\(\['navegacao', 'terminal', 'planilha'\]\);/.test(fonte) && /w\.on\('minimize', \(\) => \{\s*if \(out\.marcos\.fim \|\| !PRECISA_DESENHAR\.has\(cenarioAtual\)\) return;\s*out\.erros\.push\([^\n]*a medição parou`\);\s*terminar\(1\);/.test(fonte));
  check('e o cenário que começaria com ela minimizada também para', /const cenario = async \(nome, fn\) => \{\s*if \(PRECISA_DESENHAR\.has\(nome\) && janela\.isMinimized\(\)\) \{\s*out\.erros\.push\([^\n]*a medição parou`\);\s*terminar\(1\);\s*return;/.test(fonte));
  check('o que o motor desenha espera: navegação, terminal e planilha usam requestAnimationFrame', ['umaVoltaDeNavegacao', 'rajadaNoTerminal', 'carregarPlanilhaNoLote'].every((f) => /requestAnimationFrame/.test(fonte.slice(fonte.indexOf(`async function ${f}(`), fonte.indexOf('\n}', fonte.indexOf(`async function ${f}(`))))));
  check('terminar grava uma vez só', /function terminar\(codigo = 0\) \{\s*if \(out\.marcos\.fim\) return;/.test(fonte));
}

console.log(falhas ? `\n${falhas} falha(s)\n` : '\nTudo passou.\n');
process.exit(falhas ? 1 : 0);
