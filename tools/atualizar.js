// npm run atualizar — sobe a versão, gera o instalador e instala por cima do
// Hub já instalado.
//
// O Hub instalado é uma cópia congelada em %LOCALAPPDATA%\Programs\pr-merge-tool:
// mudança no código só chega nele com build + reinstalação. Este script junta os
// passos e contorna dois tropeços conhecidos:
//  - o editor (Electron) segura dist\win-unpacked\resources\app.asar e o
//    electron-builder não consegue limpar a pasta. Por isso o build roda numa
//    pasta temporária fora do projeto, e só o instalador é copiado para dist\;
//  - a versão ficava sempre 1.0.0. Agora cada atualização sobe o último número,
//    que aparece no nome do instalador e em "Aplicativos instalados".
//
// Os dados do app (credenciais, histórico, configurações) ficam em
// %APPDATA%\pr-merge-tool e não são tocados.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const PKG_PATH = path.join(RAIZ, 'package.json');
const LOCK_PATH = path.join(RAIZ, 'package-lock.json');
const DIST = path.join(RAIZ, 'dist');
const CLI_BUILDER = path.join(RAIZ, 'node_modules', 'electron-builder', 'cli.js');

// Erro esperado, com mensagem pronta pra quem rodou. Qualquer outro erro é bug
// e sai com stack trace.
class Falha extends Error {}

function etapa(msg) {
  console.log(`\n> ${msg}`);
}

function aviso(msg) {
  console.log(`  ! ${msg}`);
}

function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Reescreve JSON mantendo o fim de linha do arquivo: gravar tudo em LF num
// arquivo CRLF viraria alteração em todas as linhas.
function lerJson(arquivo) {
  const texto = fs.readFileSync(arquivo, 'utf-8');
  return { texto, dados: JSON.parse(texto), eol: texto.includes('\r\n') ? '\r\n' : '\n' };
}

function gravarJson(arquivo, dados, eol) {
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2).replace(/\n/g, eol) + eol);
}

function proximaVersao(versao) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(versao);
  if (!m) {
    throw new Falha(`A versão "${versao}" do package.json não está no formato 1.2.3 — ajuste à mão e rode de novo.`);
  }
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

// -NoProfile: mais rápido e sem depender do que houver no perfil do usuário.
function powershell(comando) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando], {
    encoding: 'utf-8',
  });
  return (r.stdout || '').trim();
}

function versaoInstalada(productName) {
  const nome = productName.replace(/'/g, "''");
  return powershell(
    "(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | " +
      `Where-Object { $_.DisplayName -like '${nome}*' } | Select-Object -First 1).DisplayVersion`
  );
}

// Pede ao Hub aberto que feche sozinho, como clicar no X, pra não cortar uma
// operação no meio. Quem não sair é encerrado à força AQUI, antes de chamar o
// instalador: no modo --updated ele troca a pasta de forma atômica e, com um
// arquivo em uso, desfaz tudo e sai com código 2 — um número, sem explicação.
// Deixar o problema para ele é trocar uma mensagem clara por uma obscura.
//
// Só o processo principal tem janela; os outros (renderer, GPU, utility) caem
// junto quando ele sai. Por isso a contagem é da pasta inteira, não de um PID.
function fecharHubAberto(pastaInstalada) {
  const pasta = pastaInstalada.replace(/'/g, "''");
  const filtro = `Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith('${pasta}\\', 'OrdinalIgnoreCase') }`;
  const contar = () => Number(powershell(`@(${filtro}).Count`)) || 0;

  const quantos = contar();
  if (!quantos) return;

  etapa(`Fechando o Hub aberto (${quantos} processo(s))`);
  powershell(`${filtro} | ForEach-Object { [void]$_.CloseMainWindow() }`);
  for (let i = 0; i < 20; i++) {
    if (!contar()) return;
    esperar(1000);
  }

  aviso('O Hub não fechou em 20 s. Encerrando à força para o instalador poder trocar a pasta.');
  powershell(`${filtro} | Stop-Process -Force -ErrorAction SilentlyContinue`);
  for (let i = 0; i < 10; i++) {
    if (!contar()) return;
    esperar(1000);
  }

  throw new Falha(
    `Ainda há ${contar()} processo(s) do Hub rodando em ${pastaInstalada}, e não consegui encerrá-los. ` +
      'Feche o Hub pelo Gerenciador de Tarefas ("PR Merge Tool") e rode de novo — com a pasta em uso, ' +
      'o instalador desfaz tudo e sai com código 2.'
  );
}

// O que o número na saída do instalador quer dizer. Sem isso, um código 2 vira
// meia hora de investigação toda vez.
function explicarSaidaDoInstalador(codigo) {
  if (codigo === 2) {
    return (
      'código 2 é o instalador desistindo e desfazendo o que tinha feito — quase sempre porque algum ' +
      'arquivo da pasta instalada estava em uso (Hub aberto, antivírus varrendo, Explorer com a pasta aberta). ' +
      'A instalação anterior continua intacta.'
    );
  }
  if (codigo === 1) return 'código 1 é instalação cancelada.';
  if (codigo === 1223) return 'código 1223 é o pedido de elevação (UAC) recusado.';
  if (codigo === null) return 'o instalador nem chegou a rodar (veja se o antivírus bloqueou o arquivo).';
  return `código ${codigo}.`;
}

function main() {
  if (process.platform !== 'win32') {
    throw new Falha('Este script instala o Hub no Windows — rode no Windows.');
  }
  if (!fs.existsSync(CLI_BUILDER)) {
    throw new Falha('electron-builder não encontrado. Rode "npm install" antes.');
  }

  const pkg = lerJson(PKG_PATH);
  const lock = fs.existsSync(LOCK_PATH) ? lerJson(LOCK_PATH) : null;
  const productName = pkg.dados.build?.productName || pkg.dados.name;
  const pastaInstalada = path.join(process.env.LOCALAPPDATA || '', 'Programs', pkg.dados.name);

  const versaoAntiga = pkg.dados.version;
  const versaoNova = proximaVersao(versaoAntiga);
  const instaladaAntes = versaoInstalada(productName);

  console.log(
    `Hub ${versaoAntiga} → ${versaoNova}` +
      (instaladaAntes ? ` (instalado agora: ${instaladaAntes})` : ' (nenhuma instalação encontrada — vai instalar do zero)')
  );

  const restaurarVersao = () => {
    fs.writeFileSync(PKG_PATH, pkg.texto);
    if (lock) fs.writeFileSync(LOCK_PATH, lock.texto);
  };

  // 1. Versão — antes do build, porque ela vai para dentro do instalador.
  etapa(`Subindo a versão para ${versaoNova}`);
  pkg.dados.version = versaoNova;
  gravarJson(PKG_PATH, pkg.dados, pkg.eol);
  if (lock) {
    lock.dados.version = versaoNova;
    if (lock.dados.packages && lock.dados.packages['']) lock.dados.packages[''].version = versaoNova;
    gravarJson(LOCK_PATH, lock.dados, lock.eol);
  }

  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-build-'));
  try {
    const env = { ...process.env };
    // Herdada de terminal aberto dentro de um editor Electron, essa variável
    // faria o Hub reaberto pelo instalador subir como Node puro, sem janela.
    delete env.ELECTRON_RUN_AS_NODE;

    // 2. Build, fora do projeto.
    etapa('Gerando o instalador (leva 1 a 2 minutos)');
    const build = spawnSync(process.execPath, [CLI_BUILDER, '--win', `--config.directories.output=${saida}`], {
      cwd: RAIZ,
      stdio: 'inherit',
      env,
    });
    if (build.status !== 0) {
      restaurarVersao();
      throw new Falha(`O build falhou (veja a saída acima). A versão voltou para ${versaoAntiga}.`);
    }

    const nomeInstalador = `${productName} Setup ${versaoNova}.exe`;
    const instalador = path.join(saida, nomeInstalador);
    if (!fs.existsSync(instalador)) {
      restaurarVersao();
      throw new Falha(`O build terminou, mas não gerou "${nomeInstalador}". A versão voltou para ${versaoAntiga}.`);
    }

    // 3. Guarda o instalador em dist\. dist\win-unpacked fica como estava.
    etapa('Copiando o instalador para dist\\');
    try {
      fs.mkdirSync(DIST, { recursive: true });
      for (const nome of [nomeInstalador, `${nomeInstalador}.blockmap`]) {
        const origem = path.join(saida, nome);
        if (fs.existsSync(origem)) fs.copyFileSync(origem, path.join(DIST, nome));
      }
    } catch (e) {
      aviso(`Não consegui copiar para dist\\ (${e.message}) — a instalação segue mesmo assim.`);
    }

    // 4. Instala por cima.
    fecharHubAberto(pastaInstalada);

    etapa('Instalando por cima do Hub atual');
    // /S: sem telas.
    // --updated: modo atualização — mantém os atalhos, troca a pasta antiga de
    //   forma atômica (se algo estiver em uso, restaura e aborta) e nunca apaga
    //   os dados do app.
    // --force-run: em modo silencioso o instalador não reabre o Hub sozinho.
    const instalacao = spawnSync(instalador, ['/S', '--updated', '--force-run'], { stdio: 'ignore', env });
    if (instalacao.status !== 0) {
      throw new Falha(
        `A instalação não foi: ${explicarSaidaDoInstalador(instalacao.status)}\n` +
          `  O instalador está pronto em dist\\${nomeInstalador}. Feche o Hub e dê um duplo clique nele ` +
          '(clique normal, NÃO "executar como administrador": instalado no seu usuário, ele não precisa de elevação, ' +
          'e elevado ele grava atalho e registro no perfil do administrador).'
      );
    }

    // 5. Confere pelo registro do Windows, não pela palavra do instalador.
    const instaladaDepois = versaoInstalada(productName);
    if (instaladaDepois !== versaoNova) {
      throw new Falha(
        `O instalador terminou, mas o Windows registra a versão "${instaladaDepois || 'nenhuma'}" em vez de ${versaoNova}. ` +
          `Rode dist\\${nomeInstalador} à mão.`
      );
    }

    console.log(`\nPronto: Hub ${versaoNova} instalado e reaberto. Instalador guardado em dist\\${nomeInstalador}.`);
  } finally {
    try {
      fs.rmSync(saida, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch (e) {
      aviso(`Não consegui apagar a pasta temporária do build (${saida}): ${e.message}`);
    }
  }
}

try {
  main();
} catch (e) {
  if (e instanceof Falha) {
    console.error(`\nx ${e.message}`);
  } else {
    console.error(e);
  }
  process.exit(1);
}
