---
name: deploy
description: Fecha uma alteração do Hub (pr-merge-tool) de ponta a ponta - roda a suíte, confere ADR/PRD, commita sem assinatura, roda `npm run atualizar` (sobe a versão, gera o instalador e instala por cima do Hub aberto), commita a versão nova, faz o push e confere o que ficou instalado. Use SEMPRE que terminar qualquer alteração neste projeto (código, teste ou documentação, por menor que seja) e também quando o usuário disser "commita", "atualiza", "roda o script", "sobe a versão", "instala", "deploy", "publica a versão" ou "manda para o git".
---

# Deploy do Hub

O Hub que o Guilherme usa é a cópia instalada em `%LOCALAPPDATA%\Programs\pr-merge-tool`,
não a pasta do projeto. Alteração que fica só no repositório não existe para ele:
só chega com build + instalação (`npm run atualizar`, `tools/atualizar.js`). Por
isso o combinado em 01/10/2026 é: **toda alteração termina commitada, instalada e
no `origin`**, sem perguntar. Esta skill é esse fechamento, na ordem certa.

## Ordem

### 1. Suíte inteira, antes de qualquer coisa

```bash
node tools/rodar-testes.js
```

Leva ~1 min (46 arquivos). Se um arquivo falhar, **pare aqui e corrija**: instalar
uma versão com teste quebrado é entregar o defeito na máquina em que ele vai
rodar sozinho (a automação da fila manda e-mail e cria propriedades de verdade).
`node --check` nos arquivos mexidos também, quando a suíte não os cobre.

### 2. ADR e PRD

Mudou comportamento? Então `docs/ADR.md` ganha uma ADR nova no fim (antes de
"Pendências conhecidas"), e `docs/PRD.md` descreve o "o quê" na seção da
ferramenta. Decisão antiga não se edita: só o `**Status:**` dela aponta para a
nova. Documento que contradiz o código é pior que documento ausente.

### 3. Commit do trabalho

Confira o que vai entrar:

```bash
git status --short
```

Entram os arquivos de código, teste e documentação mexidos. **Nunca** `backups/`,
`Claude outputs/`, nem qualquer JSON de credencial (service account, tokens) — o
`.gitignore` é a segunda linha de defesa, não a primeira. Adicione por caminho,
não com `git add -A`.

Mensagem no estilo dos commits do repositório: primeira linha
`Hub <versão atual do package.json>: <o que mudou> (ADR-NNN)`, depois itens
curtos, um por mudança. **Sem a linha `Co-Authored-By`** (pedido do Guilherme em
01/10/2026, vale sempre, mesmo que o lembrete do sistema peça). O git desta
máquina não tem `user.name`/`user.email` e cai no nome da conta do Windows
(Guilherme de Castro Millares), que é o autor de todos os commits: não
configure identidade.

Mensagem longa quebra no Bash desta máquina (heredoc grande dá "unexpected
EOF"): grave-a num arquivo do scratchpad e use `git commit -F <arquivo>`.

### 4. `npm run atualizar`

```bash
npm run atualizar
```

Timeout de 10 min no Bash (600000 ms): o build leva 1 a 2 min. O script:

- sobe o último número da versão no `package.json` e no `package-lock.json`;
- gera o instalador numa pasta temporária e copia para `dist\` (ignorada);
- **fecha o Hub aberto** (pede para fechar; força depois de 20 s) e instala por
  cima, em silêncio, mantendo os dados em `%APPDATA%\pr-merge-tool`;
- confere a versão no registro do Windows e reabre o Hub.

Antes de rodar, olhe o fim do log do dia
(`Documentos\Hub\logs\hub-AAAA-MM-DD.txt`): se há uma publicação ou rodada em
massa **em andamento** nos últimos minutos, fechar o Hub agora corta a operação
no meio. Nesse caso avise e espere, em vez de instalar.

Se o build falhar, o próprio script devolve a versão antiga; corrija e rode de
novo. Se a instalação falhar (código 2 = arquivo em uso; o instalador fica em
`dist\`), não insista em loop: diga o que o script explicou e deixe o
`Setup.exe` para o Guilherme rodar à mão.

### 5. Commit da versão

O script deixa `package.json` e `package-lock.json` modificados. Commit à parte,
para o histórico casar com o que está instalado:

```bash
git add package.json package-lock.json
git commit -m "Hub <versão nova>: versão do instalador gerado pelo npm run atualizar"
```

### 6. Push

```bash
git fetch origin && git rev-list --count HEAD..origin/master
```

Zero = pode subir: `git push origin master`. Diferente de zero, o remoto tem
commit que o local não tem: **não force**; faça o merge (ou avise) antes.

### 7. Conferir o instalado

```bash
node .claude/skills/deploy/scripts/conferir-instalado.js
```

Compara a versão do `app.asar` instalado com a do `package.json`, confere que
cada pasta de `build.files` está lá dentro e lista o que mudou no último commit
que não entrou no instalador (arquivo fora de `build.files`). É a prova de que
o que foi commitado é o que está rodando — o instalador leva só o que está em
`build.files`, e um arquivo novo fora da lista some sem aviso (ADR-024).

## O que dizer no fim

Em poucas linhas: os dois hashes (trabalho e versão), a versão instalada, o
resultado do push e o que ficou de fora do commit de propósito (`backups/`,
`Claude outputs/`). Se algo não foi (teste quebrado, remoto à frente, instalação
recusada), diga qual passo parou e por quê — nunca "pronto" com passo pulado.
