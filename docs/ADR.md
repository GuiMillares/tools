# ADR — Hub

Registro das decisões de arquitetura do Hub. Cada entrada tem **Contexto** (o
problema real que apareceu), **Decisão** (o que foi feito) e **Consequências**
(o que isso custa e o que passa a ser proibido).

A ordem é cronológica. Uma decisão só muda de status quando outra ADR a
substitui — não se edita o texto de uma decisão antiga para "corrigir" o
passado.

**Status possíveis:** aceita · substituída por ADR-NN · revogada

---

## ADR-001 — Electron puro, sem framework de UI e sem build step

**Status:** aceita

**Contexto.** O Hub é uma ferramenta interna de uma pessoa/equipe pequena, que
cresce por acréscimo de ferramentas pequenas (uma por rotina chata). O custo
dominante não é a complexidade da tela — é o atrito de voltar ao projeto meses
depois e conseguir mexer.

**Decisão.** Electron com HTML/CSS/JS vanilla. Sem React/Vue, sem bundler, sem
TypeScript, sem passo de compilação. `npm start` roda o que está no disco.

**Consequências.**

- Editar um arquivo e reabrir o app é o ciclo de desenvolvimento inteiro.
- Não há tipagem nem checagem estática. O contrato entre `main.js` e o renderer
  é mantido à mão, e é por isso que a ADR-002 existe.
- O renderer monta HTML por template string. Toda interpolação de dado vindo de
  fora **tem que** passar por `escapeHtml()` — sem framework, não há escape
  automático.
- Quando uma tela exigir estado complexo de verdade (mais que o objeto `state`
  global), essa decisão precisa ser revisitada, não contornada com gambiarra.

---

## ADR-002 — Toda rede no processo principal; renderer só fala por IPC

**Status:** aceita

**Contexto.** As credenciais (API Token do Bitbucket, chave da service account,
Client Secret do OAuth) não podem circular pelo contexto do navegador, e o
`contextIsolation` está ligado justamente para isso.

**Decisão.** `nodeIntegration: false`, `contextIsolation: true`. Nenhuma chamada
HTTP sai do renderer. Cada operação é um `ipcMain.handle('dominio:acao', …)` no
`main.js`, exposto por `preload.js` como `window.api.nomeDaAcao`.

**Consequências.**

- Adicionar uma operação custa três edições: handler no `main.js`, linha no
  `preload.js`, chamada no `app.js`. É repetitivo de propósito — a lista do
  `preload.js` é a superfície de ataque do app, e ela fica visível numa tela.
- O renderer nunca vê um token; ele passa `state.creds` adiante como dado opaco.
- Handlers devolvem sempre `{ ok: boolean, … }` em vez de lançar exceção através
  do IPC, porque exceção atravessando IPC chega no renderer sem a mensagem útil.

---

## ADR-003 — Formato de retorno dos handlers: `{ ok, log[], … }`

**Status:** aceita

**Contexto.** Operações como "criar propriedades" fazem dez chamadas ao Google e
podem falhar no meio. O usuário precisa ver o que aconteceu passo a passo, e o
renderer não pode ficar inventando texto sobre o que o `main.js` fez.

**Decisão.** Handlers longos acumulam um array `log` de `{ message, type }` e o
devolvem junto com o resultado. O renderer só repassa: `for (const e of res.log)
log(e.message, e.type)`.

**Consequências.**

- A narrativa da operação mora ao lado do código que a executa.
- O terminal mostra a ordem real das chamadas, não uma reconstrução.
- `type` é do vocabulário fechado `info | cmd | success | warn | error` — o CSS
  depende disso (ADR-010).

---

## ADR-004 — Credenciais do Bitbucket criptografadas; config do Google em texto

**Status:** aceita

**Contexto.** O API Token do Bitbucket dá acesso de escrita aos repositórios dos
clientes. O caminho do JSON da service account e o Client ID do OAuth não são
segredo por si só — o segredo é o arquivo apontado e o Client Secret.

**Decisão.** E-mail + API Token vão para `credentials.enc` via `safeStorage` do
Electron (DPAPI no Windows). Caminhos e preferências vão para JSON simples em
`app.getPath('userData')`.

**Consequências.**

- Os arquivos ficam presos à máquina e ao usuário do Windows; copiar o
  `credentials.enc` para outro PC não funciona, e isso é o comportamento
  desejado.
- `safeStorage.isEncryptionAvailable()` pode ser falso: nesse caso o app recusa
  salvar em vez de cair para texto puro.
- **Pendência conhecida:** o `oauth-config.json` guarda o Client Secret em texto.
  Ele tem valor menor que o API Token (sozinho não abre nada), mas idealmente
  deveria ir para o `safeStorage` também.

---

## ADR-005 — Bitbucket via API Token, não App Password

**Status:** aceita

**Contexto.** Desde julho de 2026 o Bitbucket Cloud não aceita mais App
Password.

**Decisão.** Autenticação Basic com `e-mail:API Token`, criado em
`id.atlassian.com/manage-profile/security/api-tokens`. Escopos necessários:
`read:repository`, `read:pullrequest`, `write:pullrequest`, `read:workspace`, e
escrita no repositório para o commit do `geral.php`.

**Consequências.**

- O token expira na validade escolhida na criação. Quando as chamadas começarem
  a devolver 401 sem motivo aparente, é a primeira coisa a checar.
- Um token só serve para tudo que o app faz no Bitbucket.

---

## ADR-006 — Duas identidades no Google, com papéis separados

**Status:** aceita · o ponto sobre `access_type: 'online'` foi substituído pela ADR-013

**Contexto.** Quase tudo no Google pode ser feito por uma service account, que
não expira nem pede login. Mas conceder acesso a uma conta do Analytics em que a
service account **ainda não tem acesso** exige, por definição, um humano
autorizando.

**Decisão.** Duas credenciais com fronteira clara:

| Identidade | Usada em | Escopos |
| --- | --- | --- |
| Service Account (JSON) | Criar propriedades, buscar existentes, verificar Search Console | `analytics.edit`, `tagmanager.*`, `cloud-platform`, `siteverification` |
| OAuth de usuário (Desktop app + loopback) | Conceder acesso (GA) | `analytics.manage.users`, `analytics.readonly`, `userinfo.email` |

**Consequências.**

- O fluxo OAuth sobe um `http.createServer` em `127.0.0.1:0` (porta efêmera). O
  `redirect_uri` precisa ser **idêntico** na geração do link e na troca do
  código — por isso ele é guardado numa variável, já que `server.address()` vira
  `null` depois do `close()`.
- A credencial OAuth tem que ser do tipo **Aplicativo para computador**; a do
  tipo Web recusa retorno em `127.0.0.1`.
- ~~`access_type: 'online'`~~ — ver ADR-013. A premissa de que "usada em rajadas"
  tornava a expiração aceitável estava errada na prática.
- Cada conta Google diferente que administra Analytics exige um login próprio, e
  precisa estar na lista de usuários de teste da tela de consentimento.

---

## ADR-007 — Cada etapa da criação roda isolada; falha vira aviso, não parada

**Status:** aceita

**Contexto.** "Criar propriedades" faz quatro coisas independentes: GA4, GTM,
reCAPTCHA e Search Console. Na prática elas falham por motivos diferentes e
isolados — permissão faltando numa API, cota, projeto do GCP errado. Abortar
tudo porque o reCAPTCHA falhou desperdiça o que já deu certo e obriga a limpar
propriedade órfã à mão.

**Decisão.** GTM, reCAPTCHA e Search Console rodam cada um no seu `try/catch`.
Falha vira `push(…, 'warn')` e o fluxo continua. Só o GA4 é bloqueante — sem
Measurement ID as etapas seguintes não têm o que configurar.

**Consequências.**

- O resultado pode ser parcial, e a tela **não pode** mentir sobre isso: o
  título do card de resultado lista o que faltou ("Criado parcialmente … faltou
  Tag Manager").
- O mesmo princípio vale para o commit do `geral.php` e para o "Conceder acesso
  em várias contas": falha numa conta não impede as outras.
- Vale o mesmo para toda ferramenta nova: **nada trava o programa**.

---

## ADR-008 — A marca do projeto decide em quais contas do Google mexer

**Status:** aceita · os padrões concretos foram corrigidos pela ADR-017

**Contexto.** As contas do Google estão espalhadas por marca (Busca Cliente, MPI
Solutions, MPI+), e o Busca Cliente tem várias contas do Analytics numeradas
(`bcrelatorios`, `bcrelatorios2`…) porque cada conta tem limite de propriedades.
Criar no lugar errado é um erro caro de desfazer.

**Decisão.** A regra de "que contas pertencem a que marca" mora **só** no
`main.js`, no objeto `BRANDS`, como predicado sobre o nome normalizado da conta
(sem acento, sem pontuação, minúsculo). O renderer conhece apenas os rótulos. Ao
criar, entre as contas candidatas o app escolhe **a mais vazia**, e diz no
terminal qual escolheu.

**Consequências.**

- Marca nova = uma entrada no `BRANDS` do `main.js` e uma no array do `app.js`.
- `bcrelatoriotags` é MPI+, não Busca Cliente. O regex já não pegaria, e a
  exclusão explícita no predicado é redundância proposital.
- Trocar de marca na tela invalida resultado de busca e lista de IDs carregada —
  eram de outras contas.

---

## ADR-009 — Commit do `geral.php` pela API do Bitbucket, sem git local

**Status:** aceita · a descoberta do repositório foi corrigida pela ADR-021

**Contexto.** Depois de criar as propriedades, alguém tinha que colar os valores
no `geral.php` do repositório à mão. Automatizar via git exigiria git instalado,
clone local e credencial de push.

**Decisão.** `POST /2.0/repositories/{ws}/{repo}/src` com multipart form-data
(`{caminho}: conteúdo`, `message`, `branch`), reaproveitando o mesmo API Token
do merge. O conteúdo atual vem antes por `GET …/src/{branch}/{caminho}`.

Detalhes que a implementação assume:

- O slug do repositório **é o domínio** (`layoutcenografia.com.br`), mesma
  convenção do merge.
- O arquivo é procurado numa lista de caminhos usuais e, se não achar, por
  varredura de até 4 níveis do repositório.
- A reescrita é cirúrgica: um regex por variável, substituindo só o miolo das
  aspas. Variável que não existe no arquivo vira `warn`; valor que já existia e
  foi trocado também vira `warn`.
- Se nada mudou, não commita.

**Consequências.**

- O app precisa de um `httpRaw` separado do `httpRequest`: o endpoint `/src`
  responde texto, não JSON, e redireciona `{branch}` → `{commit}`. O
  redirecionamento é seguido **apenas dentro do Bitbucket** — o header de
  autenticação nunca pode vazar para outro host.
- O commit vai direto na branch principal, sem PR. É intencional para esse
  conteúdo específico (valores de configuração de publicação).
- Não há trava contra escrita concorrente. Se alguém commitar entre o GET e o
  POST, o Bitbucket recusa e o app avisa.

---

## ADR-010 — Dois eixos de cor, e só dois

**Status:** aceita

**Contexto.** O visual anterior tinha um azul único (`--accent: #5b8cff`) para
tudo, e a cor não carregava informação. O risco ao adicionar mais cor é ela
virar enfeite.

**Decisão.** Cor no Hub significa uma de duas coisas, nunca outra:

1. **Categoria** — que tipo de ferramenta é. Violeta = git/Bitbucket, verde =
   deploy e cópia, azul = Google. Vive no atributo `data-cat` do elemento e
   escorre pela variável `--cat`.
2. **Estado** — como a operação terminou. Verde = deu certo, âmbar = passou com
   ressalva, vermelho = falhou.

Gradiente só onde simula luz (topo mais claro que a base, como uma tecla física)
ou onde separa o app do resto da tela (o fio da topbar, o topo do modal).

**Consequências.**

- Um elemento que não é nem categoria nem estado é cinza. Sem exceção.
- Botões existem em cinco variantes com hover distinto: `primary` (acende e
  ganha halo), `copy` (verde vazado que preenche), `ghost` (barra azul à
  esquerda), `danger` (vira vermelho por inteiro), `caution` (âmbar sólido — PR
  sem aprovação ou com build quebrado).
- Tipografia segue uma escala de cinco degraus em variáveis (`--fs-micro` a
  `--fs-lg`). Tamanho fora da escala é bug.

---

## ADR-011 — O terminal é a superfície principal, não um rodapé de debug

**Status:** aceita — pela ADR-128 ele pode ser minimizado ou fechado, e volta sozinho quando o Hub pergunta algo

**Contexto.** O terminal ocupa mais da metade da janela e é onde o usuário
descobre o que o app fez. Tratado como log cru, virava um paredão de texto onde
linha quebrada voltava para a margem e o horário repetido pesava mais que a
mensagem.

**Decisão.** Cada linha é um grid de três colunas — glifo, horário, mensagem.
Glifo por tipo (`›` comando, `✓` sucesso, `!` aviso, `✕` erro, `·` info), para
dar para varrer a coluna da esquerda sem ler o texto. Horário fica apagado até o
mouse passar. Bloco novo de comando ganha respiro e um fio acima. O cabeçalho
mostra um indicador que pulsa enquanto há operação em voo.

**Consequências.**

- `log()` monta três `<span>`; mudar essa estrutura quebra o alinhamento.
- O indicador conta chamadas aninhadas (`busyDepth`), porque "criar propriedades"
  dispara o commit por dentro — só volta a "ocioso" quando a última termina.
- Toda operação assíncrona nova deve ser embrulhada em `withBusy('rótulo', …)`.

---

## ADR-012 — Verificação visual por screenshot no Chromium

**Status:** aceita

**Contexto.** Mexer no CSS sem abrir o app é chute, e abrir o Electron a cada
ajuste é lento. Além disso, várias telas (resultado da criação, cards de busca,
espera do OAuth) só existem depois de uma chamada de rede que não dá para
disparar de verdade a cada teste.

**Decisão.** `tools/preview.js` carrega `renderer/index.html` direto no Chromium
via Playwright, injeta um `window.api` falso, dirige cada tela com dados de
mentira e tira screenshot — inclusive dos hovers de cada variante de botão.
Falha se aparecer erro de console.

**Consequências.**

- Playwright é dependência **opcional de desenvolvimento** (`npm i -D
  playwright`), não entra no app empacotado.
- O harness só cobre o renderer. Nada que dependa de `main.js` de verdade é
  testado por ele.
- Como o `preload.js` real não roda, o stub do `window.api` precisa ser mantido
  em dia quando a API cresce — se um método novo faltar lá, a tela quebra no
  preview e não no app.

---

## ADR-013 — Sessão do OAuth com refresh token, e expiração legível

**Status:** aceita — substitui o `access_type: 'online'` da ADR-006

**Contexto.** A ADR-006 escolheu `access_type: 'online'` para não guardar um
refresh token em disco, apostando que uma sessão de ~1h bastaria porque a
ferramenta é usada em rajadas. Na prática o que aconteceu foi:

```
✕ Não consegui listar as contas: No refresh token is set.
```

Três problemas encadeados, e o menor deles era a expiração:

1. Sem `refresh_token`, o access token vence em ~1h e a `google-auth-library`
   tenta renovar assim mesmo — o erro que sai é sobre a mecânica interna dela,
   não sobre o que o usuário precisa fazer.
2. O `oauth:status` só checava se existia `access_token`, sem olhar
   `expiry_date`. A tela dizia **"Conectado como fulano"** enquanto o token
   estava morto, então nem dava pra desconfiar de onde vinha o erro.
3. O erro chegava como `error` vermelho e sem saída: reconectar exigia adivinhar
   que "Desconectar → Conectar" resolvia.

**Decisão.**

- Login passa a usar `access_type: 'offline'` com `prompt: 'consent
  select_account'`. O `consent` é obrigatório: sem ele o Google pula a tela
  quando já existe consentimento gravado e devolve o login **sem** refresh
  token.
- `saveOauthToken()` mescla com o que já estava em disco e **preserva o
  `refresh_token` anterior** quando a resposta nova não traz um — o Google só
  emite refresh na primeira autorização de um client para um usuário.
- `loadUserOauthClient()` é o único caminho para usar a sessão. Ele valida antes
  de chamar a API e registra `on('tokens')` para persistir o access token
  renovado.
- Sessão inutilizável (ausente, vencida sem refresh, revogada) vira
  `ReauthNeeded`. O `handleOauthFailure()` traduz também os erros que vêm do
  Google (`invalid_grant`, `token has been expired or revoked`, `No refresh
  token is set`), **apaga o token morto** e devolve `{ reauth: true }`.
- O renderer, ao ver `reauth`, atualiza o status e redesenha o card — que volta
  para "Nenhuma conta conectada" com o botão de conectar. A mensagem sai como
  `warn`, não `error`: é uma pendência do usuário, não um defeito.
- `oauth:status` passa a responder `connected` de verdade (refresh token **ou**
  access token ainda válido, com 60s de folga) e informa `durable`.

**Consequências.**

- **O refresh token agora fica em disco**, em texto, no `oauth-token.json`. É
  uma credencial de longa duração e a troca é consciente: sessão que não morre
  no meio do trabalho vale mais, aqui, do que a superfície extra. Ele deveria ir
  para o `safeStorage` junto com o Client Secret (ver ADR-004) — é a mesma
  dívida.
- Quem já estava conectado precisa conectar **uma vez** de novo: o token antigo
  não tem refresh e vai ser recusado e apagado no primeiro uso.
- Se mesmo assim o Google não emitir refresh (consentimento já gravado de um app
  anterior), o login avisa e sugere remover o acesso em
  `myaccount.google.com/permissions` antes de reconectar.
- No "Conceder acesso" em lote, sessão que morre no meio **interrompe** o laço
  em vez de repetir o mesmo erro em oitenta contas.

---

## ADR-014 — Histórico de merges com o recorte do terminal

**Status:** aceita

**Contexto.** O terminal é a única memória do que o app fez, e ele é volátil:
some ao fechar o Hub e ao clicar em "Limpar". Isso é aceitável para a maioria
das operações, mas não para merge — é a única ação do Hub que altera o
repositório de um cliente de forma difícil de reconstruir depois. Quando alguém
pergunta "quando esse PR entrou?" ou "por que aquele merge não passou na
sexta?", a resposta já foi embora.

**Decisão.** Toda tentativa de merge — a que deu certo **e** a que falhou — vira
uma entrada persistida, e cada entrada carrega o trecho do terminal daquela
operação.

- Arquivo próprio (`merge-history.json`), não o `hub-state.json`: ele cresce, e
  estado de UI não deve carregar registro histórico junto.
- O recorte é **exatamente** o que o merge produziu: `logMark()` antes de
  disparar, `logSince(marca)` depois. Não é a tela inteira nem uma janela
  arbitrária de linhas em volta.
- O `logBuffer` que sustenta isso indexa por `seq` monotônico, não por posição
  de array — o buffer descarta as linhas mais velhas e os índices andariam.
- "Limpar" continua limpando só a tela. O recorte já gravado é imune.
- Dois tetos: 300 entradas e 200 linhas de log por entrada, para o arquivo não
  virar dezenas de MB depois de um ano.
- Falha ao gravar o histórico vira `warn` e não contamina o resultado do merge
  (ADR-007: nada trava o programa).
- Fica como aba dentro de "Mergear PRs", não como ferramenta separada no Hub —
  mesmo padrão de "Criar novo / Buscar existente" na ferramenta do Google. Fila
  e histórico são a mesma matéria, em tempos diferentes.

**Consequências.**

- O card do histórico renderiza as linhas com o **mesmo** `logLineElement()` do
  terminal ao vivo: ficam idênticas, e o texto nunca entra por `innerHTML`.
- Guardar merge que falhou é deliberado — é a entrada mais útil do histórico,
  porque o erro do Bitbucket costuma ser específico e some rápido.
- O histórico é local a esta máquina, como todo o resto do app (PRD, seção 5:
  sem multiusuário, sem sincronização).
- Um efeito colateral achado ao testar isto: `item.id` na fila era ao mesmo
  tempo a chave da linha e o número do PR, porque o spread de `res.pr`
  sobrescrevia a chave local. Com dois PRs `#42` de repositórios diferentes na
  fila, mergear ou remover um acertava o outro — e o histórico registraria o PR
  errado. Agora a fila usa `localId` separado.

---

## ADR-015 — Container do GTM vem de um template exportado, por marca

**Status:** aceita

**Contexto.** `google:createProject` montava sempre a mesma estrutura fixa: uma
tag `googtag`, uma variável constante com o Measurement ID, disparando no
trigger embutido "All Pages". Isso basta para a Busca Cliente, mas a MPI
Solutions usa um container-modelo com 15 tags de evento (`gaawe`), 15 triggers
de clique e 10 variáveis embutidas. Codificar essa segunda estrutura à mão
significaria duas rotinas paralelas de criação — e uma terceira quando aparecer
a próxima marca.

**Decisão.** A estrutura do container deixa de morar no código e passa a vir de
um **arquivo de exportação do próprio Tag Manager**, versionado no projeto.

- `templates/gtm-busca-cliente.json` e `templates/gtm-mpi-solutions.json`, com
  o mapeamento em `GTM_TEMPLATES` ao lado de `BRANDS`.
- MPI+ não recebeu modelo próprio: usa o da Busca Cliente e o app **avisa**
  (`warn`) que está emprestado, em vez de fingir que é o modelo dela.
- `applyGtmTemplate()` reproduz o template na ordem: variáveis embutidas →
  variável do Measurement ID → demais variáveis → triggers → tags.
- O modelo antigo virou o caso mínimo do motor (1 tag, 0 triggers próprios, 0
  embutidas), não um caminho separado.

**Diferenças entre o formato de exportação e o que a API aceita** — o pedido era
documentar caso a caso:

| Achado | Tratamento |
| --- | --- |
| A exportação traz `accountId`, `containerId`, `fingerprint`, `path`, `tagId`, `triggerId`, `variableId` — todos atribuídos pelo servidor | Removidos antes do POST (`GTM_SERVER_FIELDS`) |
| Variável embutida **não** se cria por `variables.create` | Endpoint próprio: `workspaces.built_in_variables.create({ parent, type: [...] })`. Não é `updateBuiltInVariable` nem `enableBuiltInVariable` — esses não existem na v2 |
| `type` das embutidas é repetido na query, aceita lote | Manda em lote; se a API recusar o lote por causa de um tipo inválido, repete uma a uma para salvar as válidas |
| `firingTriggerId` do template aponta para IDs que não existem no container novo | Mapa `triggerId do template → triggerId novo`, preenchido conforme os triggers são criados |
| **Exceto** `2147479553` ("All Pages"), que é o mesmo número em todo container e não aparece no array `trigger` | Regra: traduz se estiver no mapa, senão passa direto. Vale também para `blockingTriggerId` |
| As tags referenciam a variável de medição pelo nome antigo (`{{G-WJDW3KZFT0}}`) | Substituição recursiva na árvore de parâmetros (que aninha em `list` e `map`), do nome antigo para o novo Measurement ID |
| Os filtros dos triggers referenciam variáveis embutidas por nome literal (`{{Click ID}}`) | Passam intactos — o nome não muda de container para container |
| A Site Verification API, com `verificationMethod: 'META'`, devolve a **tag `<meta>` inteira** no campo `token`, não o valor | `extractSiteVerificationToken()` tira o miolo do `content=`. Aplicado na origem **e** no caminho do commit, então o `geral.php` nunca recebe markup, venha o valor de onde vier |
| `parameter[].type` vem em caixa alta na exportação (`TEMPLATE`), enquanto o código antigo usava minúscula (`template`) | Passa o valor da exportação como está; a API aceita ambos, e o da exportação é o que ela própria emitiu |

**Consequências.**

- Marca nova = exportar o container-modelo pelo Tag Manager e acrescentar uma
  linha em `GTM_TEMPLATES`. Sem tocar no motor.
- Falha em um item vira `warn` e o motor segue (ADR-007). A exceção é a tag cujo
  trigger falhou: ela é **pulada**, não criada — criá-la com o ID do template
  apontaria para outra coisa qualquer no container novo, que é pior que não
  existir.
- O resultado do GTM pode ser parcial, e o card de resultado passa a dizer isso
  no título, junto com as outras etapas parciais.
- `templates/` precisa ir junto no empacotamento (`electron-builder` inclui por
  padrão o que não está excluído; se um dia houver lista explícita de `files`,
  essa pasta tem que entrar).
- `tools/test-gtm-template.js` cobre o motor contra uma API simulada: de-para de
  triggers, built-in passando sem tradução, substituição do nome da variável,
  remoção dos campos do servidor e tolerância a falha item a item.

---

## ADR-016 — Escopo de busca ≠ escopo de criação; e domínio mora no data stream

**Status:** aceita — ajusta o alcance da ADR-008 para o caso da busca

**Contexto.** Dois problemas achados numa sessão de debug, com a mesma raiz: a
busca por reformulação não encontrava o que existe.

1. **As propriedades do Analytics são slots genéricos e permanentes** — "Busca
   Cliente 01", "Busca Cliente 02". O nome nunca muda; o que muda, quando o slot
   é reaproveitado para um cliente novo, é o domínio configurado no data stream.
   `google:findExisting` comparava o termo buscado só com `property.displayName`,
   que por construção nunca é o domínio. A busca por domínio não podia funcionar.
2. **A regra de `BRANDS` (ADR-008) é boa para criar e péssima para buscar.**
   Muita coisa foi criada antes da convenção de contas existir, e ficava
   invisível. No Tag Manager era pior: a varredura usava o filtro errado.

**Decisão.**

- Nasce `SEARCH_SCOPE`, separado de `BRANDS` e usado **só** em
  `google:findExisting`:

  | Marca | Escopo de busca |
  | --- | --- |
  | Busca Cliente | toda conta, **exceto** `ferramentasmpisolutions` |
  | MPI Solutions | só `ferramentasmpisolutions` |
  | MPI+ | só `bcrelatoriotags` |

  Vale para o Analytics **e** para o Tag Manager.
- A busca no Analytics passa a ler o `webStreamData.defaultUri` de cada
  propriedade no escopo e casa por **nome da propriedade OU domínio do stream**.

**Consequências.**

- Custo: a Analytics Admin API não filtra `defaultUri` no servidor, então é
  **uma chamada por propriedade**. Roda com concorrência 8 e teto de 600
  propriedades; acima disso a busca avisa que truncou em vez de truncar calada.
- Propriedade que a service account não consegue ler (403) é contada e reportada
  no fim, não interrompe a varredura.
- `BRANDS` continua intocada e continua sendo a regra de criação e de concessão
  de acesso. Buscar numa conta **não** autoriza criar nela.
- Criar continua estrito de propósito: buscar frouxo mostra a mais, criar frouxo
  cria no lugar errado.

---

## ADR-017 — Os padrões de marca comparam com o nome da CONTA, nunca com o login

**Status:** aceita — corrige os padrões concretos da ADR-008 e da ADR-016

**Contexto.** `BRANDS` e `SEARCH_SCOPE` testam seus predicados contra o **nome de
exibição da conta** (`displayName` no Analytics, `account.name` no Tag Manager),
normalizado. Os padrões, porém, tinham sido escritos com os **e-mails de login
do Google** que administram essas contas — `bcrelatorios*`,
`ferramentasmpisolutions`, `bcrelatoriotags`. Esses nomes nunca aparecem como
nome de conta, então **nenhum predicado casava com nada**.

O sintoma escondia a causa. As mensagens eram:

- `Nenhuma conta do Analytics de "MPI Solutions" visível — confirme se a service
  account foi adicionada como Editor nessas contas.` — mas ela **tinha** acesso;
  era o filtro que descartava a conta.
- `Nenhuma conta de MPI Solutions apareceu na sua conta Google.` — com o login
  certo conectado e a conta visível na tela do Google.

Ou seja: "falta acesso" e "o padrão não bate com o nome real" produziam
exatamente a mesma mensagem, e a primeira é a hipótese que a pessoa investiga
primeiro. Foi uma sessão de debug inteira atrás disso.

**Decisão.** Os predicados passam a usar os nomes reais das contas, confirmados
em tela:

| Marca | Nome da conta | Normalizado | Padrão |
| --- | --- | --- | --- |
| Busca Cliente | "Busca Cliente 01" … "Busca Cliente 82" | `buscacliente01`… | `/^buscacliente\d+$/` |
| MPI Solutions | "MPI Solutions" | `mpisolutions` | `n === 'mpisolutions'` |
| MPI+ | "Busca Cliente - MPI+" | `buscaclientempi` | `/^buscaclientempi\d*$/` |

- O `\d+` da Busca Cliente é obrigatório de propósito: deixa de fora "Busca
  Cliente REDES" (`buscaclienteredes`) e "Busca Cliente - MPI+"
  (`buscaclientempi`), que não são slots de projeto novo.
- A normalização remove `+`, hífen e espaço, então "Busca Cliente - MPI+" e
  "Busca Cliente MPI" colidiriam. Não há conta com o segundo nome hoje; se
  aparecer, o padrão precisa ficar mais específico.
- O nome da MPI+ foi confirmado no **Analytics**. Se a conta do Tag Manager tiver
  outro nome, o diagnóstico abaixo mostra isso na primeira execução.
- **Regra permanente: e-mail de login não entra em predicado de conta.** Ele só
  existe no contexto do OAuth — qual humano autoriza a concessão de acesso.

**Analytics e Tag Manager podem ter nomes de conta diferentes.** Registrado
depois: o container do GTM da MPI Solutions é criado sob o login
`ferramentasmpisolutions`, e o da MPI+ sob `bcrelatoriotags` — enquanto as
contas do **Analytics** dessas marcas se chamam "MPI Solutions" e "Busca
Cliente - MPI+". São duas hierarquias separadas do Google e nada obriga a conta
a ter o mesmo nome nas duas.

Por isso `brandFilter()` e `searchScopeFilter()` aceitam uma **superfície**
(`'analytics'` — o padrão — ou `'gtm'`), e cada marca pode declarar um
`matchesGtm` próprio. Enquanto `matchesGtm` não existe, as duas superfícies
usam o mesmo padrão e o comportamento é idêntico ao de antes do parâmetro.

Confirmado depois, e o recorte é **diferente do Analytics**, não só o nome:

| Marca | Conta no Analytics | Conta no Tag Manager |
| --- | --- | --- |
| Busca Cliente | "Busca Cliente 01" … "Busca Cliente 82" | "Busca Cliente - Clientes" |
| MPI+ | "Busca Cliente - MPI+" | "Busca Cliente - Clientes" |
| MPI Solutions | "MPI Solutions" | "MPI Solutions" |

Ou seja: no Analytics a Busca Cliente tem 82 contas e a MPI+ tem a sua; no Tag
Manager as duas **dividem uma única conta**. Não é uma questão de grafia — é
recorte diferente, e nenhum padrão único poderia servir às duas superfícies.

A MPI Solutions coincide nas duas e por isso **não** declara `matchesGtm`:
duplicar o padrão criaria dois lugares para esquecer de atualizar.

**Diagnóstico, para essa classe de erro não voltar a ser invisível.** Nos quatro
pontos que filtram contas por marca (`google:createProject` no Analytics e no
Tag Manager, `analytics:listBrandAccounts`, `google:findExisting` nos dois),
quando **zero** contas casam, o terminal passa a listar o que a API devolveu:

```
Contas visíveis (1): "Busca Cliente - Clientes".
Se a conta certa ESTÁ nessa lista, o padrão da marca é que não bate com o nome dela.
Se NÃO está, a service account hub-bot@… não foi adicionada nela — é acesso que
falta, não filtro.
```

**Correção posterior, achada em uso.** A primeira versão da mensagem enunciava
só a hipótese "o padrão está errado". Quando o caso foi o outro — a conta "MPI
SOLUTIONS" simplesmente não aparecia na lista, porque a service account não
tinha sido adicionada nela — a mensagem apontou para o lugar errado, que é
exatamente o defeito que este diagnóstico existe para evitar.

Agora a mensagem enuncia **sempre as duas** hipóteses e nomeia a identidade que
precisa ser adicionada (a service account nos handlers que usam a chave, a conta
Google conectada em `analytics:listBrandAccounts`). Quem lê é quem sabe qual das
duas se aplica; o texto não pode escolher por ele.

**Consequências.**

- Marca nova ou conta renomeada quebra o filtro do mesmo jeito, mas agora custa
  uma execução para descobrir, não uma sessão de debug.
- `analytics:listBrandAccounts` passa a devolver `hint` junto com a lista vazia;
  o renderer repassa para o terminal.
- `tools/test-gtm-template.js` cobre os quatro cenários do relato: MPI Solutions
  aparecendo em "Conceder acesso" com o ID 331619898, criação caindo na conta
  certa, Busca Cliente trazendo só as numeradas (sem REDES e sem MPI+), e a
  busca varrendo tudo menos MPI Solutions. Mais um caso que garante que nenhum
  e-mail de login casa com nenhuma marca.
- Os testes de escopo escritos antes usavam nomes de conta fictícios que
  refletiam os padrões errados; foram atualizados para os nomes reais. Teste que
  passa com o padrão errado não é teste.
- Os testes cobrem a matriz marca × superfície inteira, incluindo o fato de
  Busca Cliente e MPI+ resolverem para a **mesma** conta de GTM e o fallback da
  MPI Solutions (sem `matchesGtm`) dar o mesmo resultado nas duas superfícies.
- Consequência prática: a checagem de container duplicado de um projeto MPI+
  enxerga os containers da Busca Cliente, e vice-versa. Está correto — é
  literalmente a mesma conta.

---

## ADR-018 — "Conceder acesso" cobre Tag Manager, não só Analytics

**Status:** aceita — estende a ADR-006

**Contexto.** O bug do Google que motivou a ferramenta (a tela de adicionar
usuário recusa e-mail de service account com "Esse e-mail não corresponde a uma
Conta do Google") **não é exclusivo do Analytics**. Ele acontece igual no Tag
Manager, e apareceu exatamente quando era preciso adicionar
`hub-bot@…iam.gserviceaccount.com` na conta "MPI SOLUTIONS" do GTM para o app
conseguir criar containers ali.

A ferramenta existia só para o Analytics, então o mesmo problema não tinha
solução do outro lado.

**Decisão.** A ferramenta ganha um seletor **"Onde conceder"** — Google
Analytics ou Tag Manager — e deixa de se chamar "Conceder acesso (GA)".

- `tagmanager:listBrandAccounts` lista as contas do GTM da marca, usando o
  **login do usuário** (a service account não enxerga uma conta em que ainda não
  foi adicionada — é o problema que se quer resolver).
- `tagmanager:grantAccessBulk` chama `accounts.user_permissions.create` com
  `{ emailAddress, accountAccess: { permission } }` em `accounts/{id}`.
- Papel padrão é `admin`, porque **criar container exige Administrador no nível
  da conta** — permissão de container, por mais alta, não basta.
- O filtro de contas usa a superfície `'gtm'` (ADR-017): no Tag Manager, Busca
  Cliente e MPI+ resolvem para a mesma conta.
- Escolha **única**, não "ambos": as numerações são independentes — o ID 123 do
  Analytics não é o 123 do GTM — então uma lista só de IDs não poderia servir às
  duas. Trocar de superfície limpa a lista carregada.

**Escopos novos, e o que isso obriga.** O login OAuth passa a pedir também
`tagmanager.manage.users` (conceder) e `tagmanager.manage.accounts` (listar).
Consequência incontornável: **quem já estava conectado precisa desconectar e
conectar de novo** — o token antigo é válido, mas não autoriza as chamadas
novas.

Isso produz um terceiro tipo de falha, diferente dos dois que a ADR-013 já
tratava. `scopeFailureMessage()` reconhece `ACCESS_TOKEN_SCOPE_INSUFFICIENT` e
manda reconectar dizendo **que é permissão nova**, não sessão vencida nem falta
de acesso na conta. Três causas, três mensagens: confundi-las é o erro que a
ADR-017 documenta ter custado uma sessão de debug.

**Consequências.**

- A tela de consentimento OAuth precisa permitir os escopos novos. Como o login
  já usa `prompt: 'consent'` (ADR-013), o novo consentimento é pedido sozinho.
- Analytics e Tag Manager continuam sendo hierarquias separadas: conceder numa
  não concede na outra. A dica na tela diz isso, porque é a pegadinha natural.
- Falha numa conta não impede as demais (ADR-007); falha de sessão ou de escopo
  interrompe o laço, porque erraria igual em todas.
- `tools/test-conceder-acesso.js` cobre o corpo da requisição, o recorte de
  contas do GTM, o padrão `admin`, a tolerância por conta e a distinção entre
  sessão expirada e escopo insuficiente.

---

## ADR-019 — Ritmo e backoff nas chamadas ao Tag Manager

**Status:** aceita

**Contexto.** A primeira criação real com o template da MPI Solutions falhou
pela metade:

```
Não consegui criar tag "Social - Clique - Threads": Quota exceeded for quota
metric 'Queries' and limit 'Queries per minute per user' of service
'tagmanager.googleapis.com'…
Template aplicado: 10 tag(s), 15 trigger(s), 1 variável(is), 10 embutida(s).
ETAPA DO TAG MANAGER FALHOU: Quota exceeded… (na publicação)
```

Não era defeito do motor — era **cota**. A API do Tag Manager limita
requisições **por minuto por usuário**, e o motor as disparava em rajada.

A aritmética fecha: 1 lote de embutidas + 1 variável + 15 triggers + 10 tags que
passaram = 27, mais 4 de preparação (listar contas, listar containers, criar
container, listar workspaces) = **31 chamadas antes da parede** — consistente
com um teto de 30/min. O template inteiro são 38 chamadas.

O sintoma foi pior do que "falhou": a tolerância a falha por item da ADR-007,
correta em qualquer outro cenário, aqui produziu um **container publicado pela
metade**. Cinco tags de evento faltando num container que o site vai usar é
rastreamento parcial que ninguém percebe.

**Decisão.** Duas defesas, porque nenhuma sozinha resolve:

1. **Intervalo mínimo** de 2100 ms entre chamadas (~28/min, logo abaixo do
   teto), contado por um `createGtmPacer()` **compartilhado pela etapa inteira**
   — listar, criar, aplicar template e publicar dividem a mesma cota. Contadores
   separados reiniciariam o relógio e a rajada voltaria na publicação, que foi
   exatamente onde a primeira tentativa morreu.
2. **Backoff longo** quando estoura mesmo assim: 20 s, 40 s, 60 s, 60 s, com
   jitter. A janela é de um minuto — esperar 2 s e repetir só gasta tentativa.

O intervalo é **adaptativo**: a cada estouro ele afrouxa 50 % para o resto da
operação, em vez de insistir num ritmo já provado rápido demais.

**Consequências.**

- O template da MPI passa a levar cerca de **1 min 20 s**. É o preço da cota,
  não há atalho: a API não tem criação em lote, e importar uma exportação de
  container é recurso só da interface.
- Por isso o motor **avisa a estimativa antes de começar** quando são mais de 10
  chamadas — parecer travado por um minuto é pior que demorar um minuto.
- O resumo informa quantas pausas por cota houve, para dar para perceber se o
  ritmo escolhido está apertado demais na prática.
- Quando ainda assim faltar item, o terminal diz o que fazer: **apagar o
  container e rodar de novo**, porque rodar a ferramenta outra vez cria um
  container NOVO — ela não completa o anterior. Deixar isso implícito era como o
  usuário acabaria com dois containers pela metade.
- `isQuotaError()` reconhece 429, `RESOURCE_EXHAUSTED`, `userRateLimitExceeded` e
  o texto "quota exceeded" — e o teste usa a mensagem exata que apareceu em
  produção, não uma aproximação.
- O teste injeta um pacer com intervalo zero. É **opt-out explícito**, não
  silencioso: com o ritmo real a suíte levaria mais de um minuto só nesse caso.

**Não resolvido.** Não existe forma de completar um container já criado — a
ferramenta só sabe criar do zero. Se a cota estourar além do backoff, a limpeza
é manual.

---

## ADR-020 — A conta principal recebe acesso ao container que a service account cria

**Status:** aceita

**Contexto.** Quem cria o container é a service account. Um humano que seja
membro da conta do Tag Manager em nível de **usuário** (e não admin) não herda
acesso ao container novo — abre e vê:

> Sua conta de usuário está configurada como somente leitura. Atualize as
> permissões para fazer mudanças.

Ou seja: cada projeto criado pelo Hub exigia ir no Tag Manager e ajustar
permissão à mão. A automação resolvia o container e devolvia trabalho manual no
lugar.

**Decisão.** Logo depois de criar o container — **antes** de aplicar o template
— o app concede acesso à conta principal configurada.

- Novo campo nas configurações: **E-mail da conta principal do Google**, salvo
  em `google-config.json` como `ownerEmail`. Sem ele, cai para o e-mail do login
  OAuth, se houver; sem nenhum dos dois, avisa e segue.
- No nível de container a permissão mais alta é `publish` — **não existe "admin"
  de container**. É `publish` que dá edição e publicação.
- Quem ainda não é membro entra como `user` da conta, com `publish` neste
  container. **Não promovemos ninguém a admin da conta automaticamente**: isso
  daria poder sobre todos os containers dela, incluindo os de outros clientes.
- Quem já é membro tem a permissão **atualizada**, não recriada — `create` com
  e-mail repetido é recusado pela API. E a lista `containerAccess` existente é
  preservada: sobrescrever tiraria o acesso da pessoa aos containers antigos.
- Quem já é **admin da conta** é detectado e pulado: admin enxerga tudo, não há
  o que conceder, e a chamada seria desperdício de cota (ADR-019).

**Por que antes do template, e não depois.** Se o template falhar no meio
(cota, permissão, tag inválida), a pessoa precisa conseguir **abrir o container
e terminar à mão**. Conceder o acesso depois deixaria justamente o caso ruim
sem saída.

**Consequências.**

- Custa 2 chamadas por container (listar permissões + criar/atualizar), que
  entram no mesmo pacer da ADR-019.
- Falha aqui é `warn`, não erro: o container já existe e é utilizável assim que
  a permissão for ajustada à mão (ADR-007).
- A comparação de e-mail é feita em minúsculas — o Google devolve a caixa que a
  pessoa digitou no cadastro, que não é necessariamente a que está configurada.
- **Alternativa não adotada:** tornar a conta principal admin da conta do Tag
  Manager, uma vez por conta. Resolveria para sempre e sem chamada nenhuma por
  projeto, mas dá acesso irrestrito a todos os containers da conta. Fica como
  escolha manual de quem administra, não como efeito colateral do Hub.

---

## ADR-021 — Descoberta de repositório sem a busca global do Bitbucket

**Status:** aceita — corrige a ADR-009

**Contexto.** O commit do `geral.php` falhou com:

```
Falha ao procurar o repositório "qualisoldamg.com.br":
CHANGE-2770 - Functionality has been deprecated
```

Quando não há workspace configurada, `resolveRepo()` caía numa **busca global**:
`GET /2.0/repositories?role=member&q=slug="…"`. O Bitbucket descontinuou esse
uso (CHANGE-2770): consulta a repositório agora exige a workspace no caminho.

**Decisão.** A busca global sai. Sem workspace configurada, o app lista as
workspaces de que a credencial é membro (`GET /2.0/workspaces`, paginado) e
tenta `GET /2.0/repositories/{ws}/{repo}` em cada uma até achar.

- Com workspace configurada nada muda: uma chamada direta, como sempre foi.
- 404 e 403 numa workspace são "não é aqui" — segue para a próxima. Só outro
  status vira erro.
- Quando acha procurando, o terminal **diz qual workspace era** e sugere
  configurá-la, para as próximas execuções pularem a busca.
- Erro de listagem aponta a saída: preencher "Workspace do Bitbucket".

**Consequências.**

- Custa 1 + N chamadas na primeira vez (N = workspaces), contra 1 antes. Por
  isso o convite a configurar a workspace deixou de ser detalhe e virou dica no
  terminal.
- `read:workspace` no API Token passa a ser realmente necessário no caminho sem
  workspace configurada — antes era só recomendado.
- `tools/test-bitbucket-repo.js` simula o módulo `https` e verifica, entre
  outras coisas, que **o endpoint descontinuado não é mais chamado**. Testar a
  ausência de uma chamada é o que impede a regressão silenciosa.

---

## ADR-022 — Escopos da service account e do login OAuth são listas distintas

**Status:** aceita — corrige uma omissão da ADR-018/ADR-020

**Contexto.** Dar acesso da conta principal ao container (ADR-020) falhou com
`Request had insufficient authentication scopes`, mesmo depois da ADR-018 ter
acrescentado `tagmanager.manage.users`.

O motivo: a ADR-018 acrescentou o escopo na lista do **login OAuth**, usada pela
ferramenta "Conceder acesso". Mas quem concede o acesso ao container é a
**service account**, dentro de `google:createProject`, e ela tem lista própria
(`GOOGLE_SCOPES`). Duas listas, e só uma foi atualizada.

**Decisão.** `tagmanager.manage.users` entra também em `GOOGLE_SCOPES`, com
comentário explicando por que ele existe nas duas.

**Consequências.**

- Escopo de service account **não precisa de novo consentimento**: vale assim
  que o app reinicia. Diferente do login OAuth, que exige reconectar (ADR-018) —
  e é por isso que a mensagem de erro nos dois casos não pode ser a mesma.
- O aviso de falha ao conceder acesso ao container passa a distinguir "faltou
  escopo na service account" de outras causas, e **não** manda reconectar a
  conta Google: ali quem chama não é o login.
- **Regra que fica:** ao acrescentar uma capacidade nova, verificar *qual das
  duas identidades* a executa (ADR-006) e mexer na lista certa. As duas listas
  ficam longe uma da outra no arquivo, e foi exatamente assim que passou.

---

## ADR-023 — Envio de e-mail pela caixa do usuário, via Microsoft Graph

**Status:** aceita

**Contexto.** Suspender um site exige mandar um pedido ao suporte do provedor,
um e-mail por domínio, sempre com o mesmo texto e a mesma cópia. Feito à mão é
copiar-colar N vezes, com o risco óbvio de trocar o domínio no assunto e não no
corpo.

Três caminhos foram considerados:

| Caminho | Custo de setup | Custo por e-mail |
| --- | --- | --- |
| `mailto:` / deeplink de composição do Outlook Web | zero | um clique em Enviar, por e-mail |
| SMTP | credencial dedicada | zero — mas a Microsoft desativou autenticação básica na maioria dos tenants |
| **Microsoft Graph `/me/sendMail`** | registrar um app no Azure AD | zero |

**Decisão.** Graph, escolhido pelo usuário: envio de verdade, sem clique.

- App **público** no Azure AD: sem client secret, autorização por código com
  **PKCE**, retorno em loopback. Mesmo desenho do login do Google (ADR-006), e
  pela mesma razão — não há onde guardar segredo num app que roda na máquina do
  usuário.
- Escopos: `Mail.Send`, `offline_access`, `User.Read`, `openid`, `profile`.
- O `state` é conferido no retorno: sem client secret, é ele que impede um
  código injetado por outra aba de ser aceito.
- Redirect cadastrado no Azure como `http://localhost` (plataforma "Aplicativos
  móveis e computador"), que aceita porta arbitrária — combina com a porta
  efêmera do servidor local.
- O tenant configurado é o **ID do diretório (locatário)**, não `common`: um
  registro single-tenant ("somente contas neste diretório organizacional")
  recusa a autoridade `common` com `AADSTS50194`. O campo aceita qualquer um dos
  dois, mas o padrão sugerido na tela é o ID.
- Cliente HTTPS **separado** do `httpRaw` do Bitbucket, com lista própria de
  hosts (`login.microsoftonline.com`, `graph.microsoft.com`). Cada cliente só
  sabe falar com o seu host: um bug num não vaza credencial pro outro.

**O token vai criptografado.** `Mail.Send` permite **enviar e-mail em seu nome**
— é a credencial mais perigosa do app. Vai para `ms-token.enc` via `safeStorage`,
o tratamento que a ADR-004 dá ao token do Bitbucket. É também o que o token do
Google deveria ter (segue como pendência): aqui a dívida não foi repetida.

**Salvaguardas, porque isto não tem desfazer.** Pedido de suspensão é ação com
consequência comercial, e o princípio 3 do PRD vale integralmente:

- Prévia do **primeiro e-mail montado**, sempre visível, com destinatário,
  cópia, assunto e corpo reais.
- `confirm()` com a contagem, o destinatário e o primeiro assunto.
- Botão na variante **`caution`** (âmbar), não `primary` — o mesmo tratamento do
  merge arriscado (ADR-010).
- Domínio repetido na lista vira aviso **antes** do envio, não depois.
- E-mail malformado em Para/Cc é recusado antes de qualquer chamada.

**Consequências.**

- Depende de registrar um app no Azure AD. Tenant que bloqueie registro, ou que
  exija consentimento de administrador para `Mail.Send`, trava esse caminho — e
  aí a alternativa é a composição pré-preenchida, que não foi implementada.
- O Graph limita ~30 mensagens por minuto por caixa. Lote grande é ritmado pelo
  mesmo pacer do Tag Manager, que por isso deixou de se chamar `createGtmPacer`
  e virou **`createApiPacer`**: o problema nunca foi do GTM, é de qualquer API
  com cota.
- Falha num domínio não impede os outros, e o resultado diz quais não foram.
- Os modelos de assunto e corpo ficam no `hub-state`, editáveis na tela. Os
  endereços do fluxo de hoje são só o valor inicial — nada fixo no código.
- A ferramenta entrou na categoria **`deploy`** (verde), não numa quarta cor:
  suspender é ação de ciclo de vida do site na infraestrutura, mesma família do
  comando de deploy. Uma quarta cor de categoria diluiria a leitura que a
  ADR-010 estabeleceu.

---

## ADR-024 — O que entra no pacote, e por que o build não sai daqui

**Status:** aceita

**Contexto.** Ao tentar automatizar o `npm run dist`, a inspeção do `app.asar`
gerado mostrou o que estava sendo empacotado:

```
/hub-automacao-189437b5726a.json      ← a chave privada da service account
/docs/…  /tools/…  /README.md         ← nada disso o app usa
/dist/PR Merge Tool Setup 1.0.0.exe   ← o instalador ANTERIOR, 80 MB, dentro do novo
```

Sem `files` declarado, o electron-builder empacota **a pasta inteira**. Três
consequências, em ordem de gravidade:

1. **A chave privada da service account foi para dentro do instalador.** O
   `asar` não é criptografia — é um arquivo empacotado, extraível com um
   comando. Qualquer cópia do `Setup.exe` carrega a chave. Confirmado no
   instalador existente: `-----BEGIN PRIVATE KEY-----` está lá dentro.
2. Cada build embutia o build anterior, então o pacote crescia sozinho.
3. `app.asar` de 188 MB, contra 30 MB do necessário.

**Decisão.** `build.files` passa a listar explicitamente o que o app precisa
para rodar: `main.js`, `preload.js`, `renderer/**`, `templates/**`,
`assets/**`, `package.json`. `node_modules` continua entrando sozinho, como o
electron-builder faz por padrão.

Lista de inclusão, não de exclusão: arquivo novo na raiz **não** entra no pacote
até alguém decidir que entra. O contrário — lembrar de excluir cada arquivo
sensível — é o que falhou aqui.

**Por que o build não é feito pelo assistente.** O shell disponível na máquina
do usuário é uma **VM Linux**, não o Windows. De lá:

- O alvo `dir` funciona e produz um `win-unpacked` válido…
- …mas o executável sai como **`electron.exe`, com o ícone padrão do Electron**:
  renomear e trocar ícone de um `.exe` exige `wine`, que não existe nessa VM.
- O alvo `nsis` (o instalador) não roda de jeito nenhum sem `wine`.

Ou seja: um build feito de lá não serve para fixar na barra de tarefas, que é
justamente o motivo de existir o build. **`npm run dist` continua sendo rodado
no Windows, pelo usuário.**

**Consequências.**

- Quem já instalou tem um app com a chave dentro. Trocar a chave resolve o
  futuro; o instalador antigo continua sendo um artefato a não compartilhar.
- O JSON da service account **não deve morar na pasta do projeto** — segue como
  pendência, e agora com uma segunda razão além do `.gitignore`.
- `npm run dist` falha com "Access is denied" se o app estiver aberto: o
  electron-builder limpa `dist/win-unpacked` antes de recriar, e o Windows não
  deixa apagar um `.exe` em execução. Fechar o app antes.
- O `productName` ainda é "PR Merge Tool". Renomear para "Hub" cria uma
  instalação **nova** e deixa a antiga na barra de tarefas — por isso continua
  como pendência, não como correção automática.

---

## ADR-025 — Triagem por apontamento de DNS antes de pedir suspensão

**Status:** aceita

**Contexto.** O pedido de suspensão era disparado para todo domínio colado na
lista. Só que "suspender" quer dizer coisas diferentes conforme onde o site
está hospedado, e para uma parte dos domínios não quer dizer nada:

| Faixa de IP | Onde está | O que fazer |
| --- | --- | --- |
| `149.18.103.x` | M3 Solutions | e-mail para `suporte@m3solutions.com.br` |
| `169.57.169.x`, `169.57.141.x` | Vesta | suspender à mão no painel |
| qualquer outra | não é nosso | nada |

Mandar e-mail de suspensão de um domínio que já saiu da M3 é pedir para o
suporte de outra empresa mexer num site que não é dele.

**Decisão.** A ferramenta ganhou uma etapa antes do envio: **Verificar
apontamento**. Ela resolve o registro `A` de cada domínio (`dns.Resolver`, no
processo principal, 8 em paralelo) e separa o resultado em cinco grupos —
M3, Vesta, IPs em faixas diferentes, não resolveu, não aponta para nós.

Detalhes que não são acidentais:

- **A comparação é por prefixo terminado em ponto.** `'169.57.14.10'` começa com
  `'169.57.14'`, mas não com `'169.57.141.'` — sem o ponto, um IP de terceiro
  entraria na faixa do Vesta. Tem teste para isso.
- **Vários registros `A` em faixas diferentes viram `misto`, não um palpite.**
  Ninguém decide sozinho o que fazer com um domínio meio aqui meio ali.
- **Timeout de DNS não vira "não aponta para nós".** Só `ENOTFOUND`/`ENODATA`
  fazem o app tentar o `www.` e, falhando, marcar como "não resolveu" —
  falha de rede é falta de resposta, não resposta negativa. Confundir os dois
  produziria e-mail de suspensão baseado em nada.
- **Só o grupo da M3 já vem marcado para envio.** Todo domínio tem caixinha e
  pode ser marcado à mão (IP misto, site fora do ar), mas o que não é da M3
  aparece nomeado na confirmação antes de sair.
- **A lista do Vesta sai com botão de copiar**, porque a ação ali é humana.

As faixas ficam em `HOSTING_GROUPS`, no `main.js`, e são a única fonte da
verdade: a tela mostra o que o processo principal devolve, não uma segunda
cópia da regra.

**Consequências.** Não dá mais para enviar sem verificar — o botão de envio só
existe depois da verificação. É de propósito: era exatamente o passo que
faltava.

---

## ADR-026 — Histórico de DNS pela DNS Chronicle (WhoisXML), sob demanda

**Status:** aceita (substitui a primeira versão, que usava o SecurityTrails)

**Contexto.** Para o domínio que hoje não aponta para nós, sobra a pergunta:
já apontou? Quando saiu? O DNS de agora não responde isso — só o histórico.

A primeira implementação usou o **SecurityTrails**, no pressuposto de que o
plano gratuito de algumas dezenas de consultas por mês ainda existia. **Não
existe.** Conferido antes de mandar o usuário criar conta: não há mais tier
gratuito público e o preço começa na casa dos US$ 500/mês. O pressuposto era
meu, não do usuário, e estava escrito no código e na documentação como se fosse
fato — por isso esta ADR corrige em vez de complementar.

**Decisão.** A fonte passa a ser a **DNS Chronicle API, da WhoisXML** — 500
créditos gratuitos, sem cartão. `POST https://dns-history.whoisxmlapi.com/api/v1`
com `{apiKey, searchType:'forward', recordType:'a', domainName}`.

A diferença que dá trabalho: **a API devolve uma observação por data**, não
janelas de "esteve aqui de X a Y". Quem agrupa é o `resumirHistorico`: ordena
por data, classifica cada observação pela faixa (`HOSTING_GROUPS`, o mesmo
mapa da ADR-025) e funde datas consecutivas do mesmo grupo numa janela só. Sem
isso a tela viraria uma lista de datas soltas, que não responde à pergunta.

- **Ordena antes de agrupar.** A ordem que a API devolve não é contrato; se
  duas observações vierem trocadas, a janela sairia invertida. Tem teste.
- **Sob demanda, nunca junto da verificação de DNS.** Cada domínio custa pelo
  menos um crédito. O terminal informa quantos a rodada gastou.
- **Teto de 3 páginas por domínio.** A paginação por cursor (`after`) poderia
  varrer um histórico enorme e queimar créditos calado; no teto, o app marca o
  resultado como truncado e avisa na tela.
- **`401`/`403`/`429` interrompem o lote.** Chave recusada, crédito esgotado ou
  excesso de chamadas não melhora no domínio seguinte. O texto do `403` cita as
  três causas possíveis (créditos, chave, allowlist de IP), porque a API não
  distingue.
- **A chave fica criptografada pelo `safeStorage`**, como a do Bitbucket, e
  **nunca volta para a tela** — `dnshist:status` responde só se existe. O campo
  nas configurações mostra "já configurada" e, vazio, não altera nada.

**Consequências.** Sem chave configurada a ferramenta segue inteira; só o botão
de histórico recusa, dizendo onde configurar. Nada aqui decide envio: o
histórico informa, quem marca é quem está olhando.

**Lição registrada.** "Plano gratuito" envelhece. Antes de mandar alguém criar
conta em serviço de terceiro, conferir o preço no dia — e não repetir de
memória o que era verdade um ano atrás.

---

## ADR-027 — Escolher o que criar, com a dependência do GTM explícita

**Status:** aceita

**Contexto.** A aba "Criar novo" tinha um botão só: *Criar tudo (GA + GTM +
reCAPTCHA + Search Console)*. Serve para projeto novo, que é o caso comum, e
não serve para nada mais: reformulação em que só falta a chave do reCAPTCHA,
cliente que já tem Analytics, container que precisa ser refeito sozinho. Nesses
casos a ferramenta criava coisa a mais, que depois alguém tinha que ir apagar
na mão.

**Decisão.** Uma lista de caixas — **O que criar** — com as quatro etapas, todas
marcadas por padrão. O rótulo do botão passa a dizer o que vai acontecer
(*Criar reCAPTCHA*, *Criar GA + GTM*, *Criar tudo (…)*), porque botão que promete
quatro coisas e faz uma é pior que botão sem rótulo.

A lista de etapas mora em `CREATE_STEPS`, no `main.js`, e é a mesma que a tela
usa — um lugar só para mexer quando entrar etapa nova.

**A dependência que não é opcional.** O container do GTM reproduz o modelo da
marca com a variável de medição apontando para o GA4 que acabou de ser criado.
GTM sem GA4 produziria um container com cara de pronto e a variável vazia —
rastreando nada, e ninguém percebe até alguém cobrar relatório. Então:

- na tela, a caixa do GTM fica **desabilitada** enquanto a do GA4 estiver
  desmarcada, dizendo `— precisa de "GA"`;
- no processo principal, a combinação é **recusada** com erro que nomeia as duas
  etapas, antes de qualquer chamada de API.

Os dois, não um: a tela evita o engano, o processo principal não confia na tela.

**Resultado parcial passa a ter dois significados.** Antes, campo vazio no
`geral.php` só podia ser falha, e o título dizia "faltou X". Agora etapa não
pedida também deixa campo vazio — e chamar isso de falha seria mentir sobre o
que aconteceu. O resultado devolve `steps`, a lista efetivamente pedida, e a
tela separa:

| Situação | O que a tela diz |
| --- | --- |
| pediu e criou | *Tudo criado para …* |
| pediu, criou o que pediu, deixou etapa de fora | *Criado o que você pediu para …* + `não pedido: …` |
| pediu e não veio | *Criado parcialmente — faltou …* |

**Compatibilidade.** `steps` ausente significa "roda tudo". Chamada antiga não
pode virar "não criou nada" calada — tem teste para isso.

**Consequências.** A seleção fica gravada no `hub-state`, então quem trabalha
sempre com o mesmo recorte não remarca todo dia. Na leitura, só as chaves
conhecidas e sempre como booleano: arquivo de estado antigo ou editado à mão não
injeta etapa que não existe. Lista vazia desabilita o botão, com o rótulo
*Selecione o que criar*.

---

## ADR-028 — A propriedade do Search Console precisa de dono humano, por marca

**Status:** aceita

**Contexto.** A propriedade nunca aparecia na conta de ninguém, e o motivo não
estava no `geral.php` — o token era gravado direito. Estava em quem verifica:

- `webResource.getToken` e `webResource.insert` rodam sob a **service account**;
- o token que vai para o site é o dela, então quem a verificação torna
  proprietário é `hub-bot@…iam.gserviceaccount.com`;
- service account não tem login de navegador. A propriedade existia para uma
  identidade em que ninguém consegue entrar.

Pior: se alguém adicionasse a propriedade à mão e escolhesse "tag HTML", o
Google emitiria **outro** token, e o que está no `geral.php` não validaria nada.

Três buracos, não um: nada no código passava a posse adiante (`webResource.update`
não era chamado), o campo "E-mail da conta principal do Google" existia mas era
lido só na etapa do container do GTM, e o dono certo **varia por marca** — cada
uma administra as suas.

**Decisão.** Depois do `insert`, o app chama `webResource.update` acrescentando o
e-mail da marca à lista de proprietários. A lista é substituída inteira, então
os donos atuais vão junto: mandar só o novo tentaria remover a service account,
e a API recusa isso enquanto o token dela estiver no site.

O dono é configurado por marca, em `scOwners` no `google-config.json`:

| Marca | Conta |
| --- | --- |
| Busca Cliente | `bcrelatorios…` |
| MPI Solutions | `ferramentasmpisolutions…` |
| MPI+ | `bcrelatoriostags…` |

É a mesma lógica do GTM (ADR-017): a marca decide em que conta o app mexe. E é
campo **separado** do "E-mail da conta principal" — quem recebe container e quem
recebe propriedade do Search Console não são a mesma conta.

**Por que na verificação e não na criação.** `update` exige site já verificado, e
a verificação só passa depois que a tag está no ar. Então a posse é passada no
botão "Verificar Search Console", não na criação. Na criação, se a marca não tem
dono configurado, o terminal já avisa — melhor descobrir ali que depois.

**Consequências.**

- Sem dono configurado, a verificação continua funcionando e o app avisa que a
  propriedade ficou só com a service account, dizendo onde preencher.
- Se o `update` falhar, a verificação já aconteceu e o log mostra isso — não é
  preciso refazer nada, só corrigir a permissão e clicar de novo.
- A comparação de "já é proprietário" ignora maiúsculas: e-mail do Google não
  diferencia, e repetir o `update` à toa é chamada perdida.
- Continua faltando o passo de *listar* a propriedade no Search Console
  (`searchconsole.sites.add`, outra API, outro escopo, não habilitada). Se ela
  não aparecer sozinha na lista da conta, adicionar o domínio por lá passa sem
  pedir tag nova — porque a conta já é proprietária. Fica registrado como
  pendência.

---

## ADR-029 — Erro do Bitbucket tem que dizer o que fazer

**Status:** aceita

**Contexto.** O commit do `geral.php` falhava e o terminal não dizia por quê. A
investigação achou três defeitos de diagnóstico, e os três apontavam para o
lugar errado:

1. **`resolveRepo` tratava 403 como 404.** Na varredura de workspaces,
   `if (res.status !== 404 && res.status !== 403) throw` fazia falta de
   permissão terminar em *"Nenhum repositório com o slug X"* — culpando o
   domínio quando o problema era a credencial.
2. **`bitbucketError` só lia `error.message`.** Resposta em qualquer outro
   formato virava `HTTP 403`, e era justamente o corpo que distinguia escopo
   faltando de restrição de branch.
3. **"Nada a commitar" era dito em duas situações opostas:** "os valores já
   estavam lá" e "não achei nenhuma das variáveis". A segunda não é nada a
   commitar — é arquivo em formato inesperado.

**A causa provável, que o diagnóstico escondia.** A documentação da Atlassian é
explícita: *escopo de pull request não implica escopo de repositório*, e
`write:repository` não implica `read:repository`. Um token criado para mergear
PRs lê e grava PR — e mais nada. O commit precisa de
`read:repository:bitbucket` e `write:repository:bitbucket`.

**Decisão.**

- 403/401 na varredura de workspaces vira erro próprio, dizendo que o
  repositório existe e a credencial não pode lê-lo.
- `bitbucketError` mostra o corpo da resposta (200 caracteres) quando não há
  `error.message`, e em 401/403 acrescenta quais escopos faltam.
- No commit recusado com 401/403, um aviso extra usa o que já se sabe: **ler o
  arquivo funcionou**, então leitura e slug estão certos, e sobram exatamente
  duas causas — `write:repository` ausente ou restrição de branch exigindo pull
  request. O aviso nomeia onde conferir cada uma.
- A frase "nada a commitar" passa a distinguir os dois casos.

**Consequências.** Nenhum comportamento mudou — só o que o app conta. Era o
mínimo para a próxima falha ser resolvível sem ninguém ler o código.

---

## ADR-030 — A propriedade do Search Console é a do `www`

**Status:** aceita

**Contexto.** Nenhuma propriedade aparecia no Search Console da conta certa, e
uma segunda causa se somava à da ADR-028: o app usava `https://dominio/` como
identificador. Propriedade de prefixo de URL é por **prefixo exato** — para o
Google, `https://nobrefrutas.com.br/` e `https://www.nobrefrutas.com.br/` são
duas propriedades distintas. Os sites respondem no `www`, então a propriedade
verificada era a do endereço em que ninguém entra.

**Decisão.** `searchConsoleSiteUrl(domain)` monta sempre `https://www.<domínio>/`,
e é ela que alimenta o `getToken`, o `insert` e o `update`. Normaliza de
quebra: tira `https://` colado, barra final, caminho, maiúsculas, e não duplica
o `www` quando o domínio já vem com ele.

O token do método META é da **conta**, não do site, então o mesmo valor no
`geral.php` serve para qualquer propriedade daquela identidade — trocar o
identificador não invalida nada que já esteja no ar.

**Consequências.** Só a propriedade do `www` é verificada. Se algum dia
precisarem também da raiz (redirecionamento apex → www costuma dispensar), é
uma segunda chamada com o outro identificador, não uma mudança de desenho.

Comportamento assumido e não desejado: um subdomínio (`loja.x.com.br`) também
receberia `www.` na frente. Separar isso de um domínio raiz exigiria lista de
sufixos públicos, e o app só recebe domínio raiz — que é o slug do repositório.
Fica registrado no teste.

---

## ADR-031 — Descobrir workspace do Bitbucket por duas rotas

**Status:** aceita (complementa a ADR-021 e a ADR-029)

**Contexto.** Numa execução real, o commit morreu antes de tocar no repositório:

```
GET repositório → nobrefrutas.com.br
Commit automático do geral.php falhou: Falha ao listar workspaces: Resource not found
```

`GET /2.0/workspaces` respondeu **404 "Resource not found"**. O Bitbucket usa
404 tanto para o que não existe quanto para o que a credencial não pode ver, e
o comentário no código dizia justamente a coisa errada ("403 aqui costuma ser
escopo faltando") — o 403 nunca chega.

**Decisão.** Duas rotas para a mesma pergunta, em ordem:

1. `GET /2.0/workspaces` — a direta;
2. `GET /2.0/user/permissions/workspaces` — a de associação do usuário, que
   responde em conta onde a primeira não responde.

Cada uma devolve o slug em lugar diferente do JSON, então o extrator vai junto
da URL em `WORKSPACE_ENDPOINTS`. A segunda só é chamada se a primeira falhar ou
vier vazia.

Falhando as duas, o erro deixa de ser um `Resource not found` sem dono e passa
a dizer o caminho curto — **preencher "Workspace do Bitbucket" nas
configurações, e este passo nem acontece** — antes de falar do escopo
`read:workspace:bitbucket`. Ele também cita os dois caminhos tentados, com o
status de cada um.

**Consequências.** Uma chamada extra apenas no caso de falha. E a lição que já
vale para o resto do arquivo: **no Bitbucket, 404 não prova ausência** — prova
que aquela credencial não vê aquilo.

---

## ADR-032 — Workspace do Bitbucket é por marca

**Status:** aceita (substitui o campo único da ADR-021)

**Contexto.** O campo "Workspace do Bitbucket" era um só, e não existe uma
workspace só: **`busca-clientes`** e **`mpi-solutions`** são separadas, e o
repositório de um projeto existe apenas na sua. Um campo único obriga a trocar
o valor a cada projeto de marca diferente — ou a deixar vazio e depender da
descoberta automática, que é justamente o passo que quebra quando o token não
tem `read:workspace` (ADR-031).

**Decisão.** Uma workspace por marca, no `hub-state`, com o campo antigo virando
**padrão**:

```
workspaceForBrand(marca) = workspaces[marca] || workspacePadrao || ''
```

Vazio nos dois, o processo principal ainda tenta descobrir — o caminho continua
existindo, só deixou de ser o caminho normal.

É o terceiro lugar onde a marca decide onde o app mexe, junto do Analytics/GTM
(ADR-017) e do proprietário do Search Console (ADR-028). O padrão do projeto é
esse: **marca é a chave de roteamento**, não configuração global.

**Consequências.**

- O terminal passa a dizer qual workspace usou e de onde ela veio — da marca ou
  do padrão — e avisa em amarelo quando não tem nenhuma e vai tentar descobrir.
  Sem isso, "repositório não encontrado" continuaria ambíguo.
- Quem já tinha o campo único preenchido não perde nada: ele segue valendo como
  padrão para as marcas em branco.
- A ferramenta "Mergear PRs" não é afetada: a workspace dela vem do link do PR.
- MPI+ não aparece na lista: ela não tem repositório no Bitbucket (ADR-033).

---

## ADR-033 — MPI+ não tem Bitbucket, e o app não finge que tem

**Status:** aceita

**Contexto.** Os projetos da MPI+ não têm repositório no Bitbucket. Com o commit
oferecido para todas as marcas, um projeto MPI+ caía num de dois lugares ruins:

- sem workspace da marca, o app usava o **padrão** e ia procurar
  `dominio.com.br` na workspace da Busca Cliente — e se existisse um
  repositório com aquele slug lá, o commit iria para o repositório **errado**;
- e quando não existisse, o erro seria "nenhum repositório com esse slug",
  sugerindo que o repositório deveria existir.

O segundo é ruim; o primeiro é grave. Silêncio na configuração não pode ser
interpretado como "procure em outro lugar".

**Decisão.** A marca declara que não tem Bitbucket, e isso desliga o commit em
todos os caminhos:

- `BRANDS.mpiplus.bitbucket = false` (no `main.js` e na lista da tela);
- a caixa "Commitar o geral.php" fica **desabilitada** e desmarcada, dizendo
  `— MPI+ não tem Bitbucket`;
- o botão "Commitar no Bitbucket" do resultado **não é renderizado**, e no lugar
  aparece a instrução de copiar o template;
- o commit automático pós-criação não roda;
- o processo principal **recusa** um commit dessa marca, mesmo que a chamada
  chegue de outro jeito.

Ausência da chave significa "tem" — o caso normal não declara nada, e marca
nova não precisa lembrar de habilitar.

**O template continua sendo gerado.** A MPI+ não commita, mas o `geral.php`
montado é o mesmo, e é dele que sai o copiar-e-colar. Não ter repositório não é
motivo para deixar de produzir o conteúdo.

**Consequências.** Trocar a marca no seletor redesenha a aba, porque a caixa do
commit depende dela — preservando o domínio já digitado. E a MPI+ sai da lista
de workspaces por marca: campo para uma coisa que não existe é convite a
preencher errado.

---

## ADR-034 — `$idProjetoBusca`: a marca fixa ou a tela pergunta

**Status:** aceita

**Contexto.** `$idProjetoBusca` é o painel do cliente, e era a única variável do
`geral.php` que ficava manual — o template saía com `'xxxx'` e alguém trocava
depois. Só que ela não é igual para todo mundo:

- **Busca Cliente**: número por cliente, ninguém tem como adivinhar;
- **MPI Solutions**: sempre `39`.

Perguntar sempre é fricção onde a resposta é fixa; não perguntar é chute onde
ela varia.

**Decisão.** A marca declara o valor quando ele é fixo (`idProjetoBusca: '39'`
em `BRANDS`), e a tela pergunta quando ela não declara. Com valor fixo, o campo
**não aparece** — uma linha diz qual é o número e de quem ele é. Sem valor fixo,
um campo logo abaixo do domínio, aceitando só dígito.

Ausência da chave significa "pergunta". Marca nova entra perguntando, que é o
lado seguro do erro.

**O que acontece com o campo vazio.** O template sai com `'xxxx'`, a variável
**não** entra no commit, e o terminal avisa em amarelo antes de começar. Escrever
`''` no lugar de um número apagaria o valor que o repositório já tem — e o
repositório de projeto novo costuma vir de um template com o painel de OUTRO
cliente dentro. Pular é o comportamento certo; avisar é o mínimo.

**Não é gravado no `hub-state`.** O painel é de um projeto só. Reaparecer
preenchido no projeto seguinte seria erro silencioso, e silencioso é o pior
tipo — o commit passaria com o número do cliente anterior.

**Consequências.**

- `GERAL_VARS` ganha `idProjetoBusca`, na posição em que ele aparece no arquivo,
  para o relatório do commit sair na ordem em que a pessoa lê.
- O valor antigo vira aviso de sobrescrita, como as outras variáveis — é
  informação, não erro: sobrescrever ali é justamente o objetivo.
- A aba "Buscar existente" não mexe nisso: ela só grava o que foi escolhido, e
  reformulação não troca o painel do cliente.
- **MPI+ pergunta**, como a Busca Cliente. Foi decisão por ausência de
  evidência: ela é conta separada no Analytics e não tem Bitbucket, e não havia
  como afirmar que o painel dela é 39. Se for, é uma linha em `BRANDS`.

---

## ADR-035 — Uma conta do Google por marca, não um campo global

**Status:** aceita (corrige a ADR-020 e amplia a ADR-028; a conta ganhou superfície na ADR-067)

**Contexto.** Num projeto de **MPI Solutions**, o terminal registrou:

```
✓ bcrelatorios@gmail.com adicionado na conta com acesso de publicação neste container.
```

A conta da Busca Cliente virou administradora de um container da MPI Solutions.
O container saiu certo; o dono saiu errado.

A causa é de desenho. O acesso ao container (ADR-020) lia o campo global
**"E-mail da conta principal do Google"**, e a posse do Search Console
(ADR-028) lia um campo **por marca**. Duas coisas que precisam exatamente da
mesma resposta — *qual conta humana opera esta marca?* — liam de lugares
diferentes, e só uma delas sabia da marca.

Pior: o campo por marca eu chamei de `scOwners`, como se fosse só do Search
Console. O nome escondeu que a pergunta era a mesma.

**Decisão.** Uma conta do Google **por marca**, usada pelas duas coisas:

| Marca | Conta |
| --- | --- |
| Busca Cliente | `bcrelatorios@gmail.com` |
| MPI Solutions | `ferramentasmpisolutions@gmail.com` |
| MPI+ | `bcrelatoriotags@gmail.com` |

`googleAccountFor(marca)` é a única fonte, e a ordem é
`conta da marca → conta principal → login OAuth`. Antes o global vinha
primeiro, que é exatamente o que produziu o erro.

O campo continua existindo como **padrão**, para marca sem conta própria.

**Renomeação com reserva.** A chave passou de `scOwners` para `brandAccounts`,
e a leitura aceita as duas — quem já tinha configurado não perde o valor por
causa de um nome melhor.

**O terminal passou a dizer de onde veio a conta**, antes de conceder:

```
· Conta que vai administrar o container: ferramentasmpisolutions@gmail.com (conta de MPI Solutions)
! Conta que vai administrar o container: dono@empresa.com.br (conta principal, padrão — a marca não tem conta configurada)
```

Amarelo quando é o padrão, porque padrão numa decisão que deveria ser por marca
é justamente o caso que passou despercebido. Ter essa linha desde o começo teria
mostrado o problema no primeiro projeto, em vez de você encontrar no log.

**Consequências.** É o quarto lugar onde a marca roteia — Analytics/GTM
(ADR-017), Search Console (ADR-028), workspace do Bitbucket (ADR-032) e agora a
conta do Google. Qualquer coisa nova que pergunte "de quem é isso?" deve nascer
por marca; global é a exceção, e precisa de justificativa.

**Não corrige o passado.** Os containers já criados continuam com a conta
errada como administradora — inclusive o `GTM-5BNC3FB8` do `carste.com.br`.
Ajuste na mão no Tag Manager, ou rode o "Conceder acesso" apontando para a conta
certa.

---

## ADR-036 — O que a MPI+ tem de diferente (e o que ainda falta)

**Status:** parcial — as três regras abaixo estão implementadas; a sincronização
no painel está em desenho.

**Contexto.** A MPI+ não segue o fluxo das outras marcas em nenhum dos pontos
finais: não tem repositório, não tem painel do cliente, e a publicação acontece
num painel web próprio em vez de num commit.

**Decisões já valendo.**

1. **`$idProjetoBusca` não existe** nos projetos dela. Diferente de "pergunta e
   ficou vazio": não há campo nem aviso, e a variável não entra no commit —
   `semPainel: true` na marca.
2. **A conta do Google é sempre a dela** (`bcrelatoriotags`). Sem conta
   configurada, o app **recusa** em vez de cair na conta principal ou no login
   OAuth (`contaObrigatoria: true`). Usar outra conta aqui é exatamente o erro
   que a ADR-035 corrigiu — nesta marca ele foi proibido em voz alta, então
   reserva silenciosa seria desobedecer.
3. **O link do projeto no painel é colado na tela**, não descoberto. Um campo
   "Link do painel do projeto" aparece só para ela, valida que o endereço é do
   host do painel, e — como o painel do cliente e o domínio — **não é gravado no
   `hub-state`**: é de um projeto só.

**Em desenho: a sincronização.** No lugar do commit, o projeto precisa ser
sincronizado em duas telas do painel (Integrações e Relatórios). Três coisas
precisam estar resolvidas antes de escrever isso:

- **Onde a automação roda.** Não é Playwright: o Hub já é Electron, e um
  `BrowserWindow` oculto é o mesmo Chromium, sem somar ~150 MB de binários a um
  instalador que já tem 80 MB (ver ADR-024). A sessão fica numa partition
  própria, então o login acontece uma vez.
- **O DOM real do painel.** Automação escrita a partir de screenshot é chute:
  sem os seletores de verdade, ela quebra na primeira execução.
- **Qual valor vai no campo do Search Console.** O app hoje gera token pelo
  método META; o painel pede o conteúdo de um arquivo HTML, que é o método
  FILE. São tokens diferentes, e adivinhar qual deles o campo espera não é uma
  decisão que o código possa tomar sozinho.

**Credenciais do painel.** O login vai ser guardado criptografado pelo
`safeStorage`, como o token do Bitbucket e o da Microsoft — não em arquivo de
texto. Senha em texto puro na pasta do app é a dívida que a ADR-024 já cobrou
uma vez.

---

## ADR-037 — Sincronizar a MPI+ no painel, pelo estado do Alpine

**Status:** aceita

**Contexto.** Os projetos da MPI+ não têm repositório: o lugar das chaves é o
painel (`idealplus.idealtrends.io`), em duas telas — Configuração → 5.
Integrações, e Relatório → Conexão Relatório. O contrato completo das duas está
em [`docs/painel-mpi.md`](./painel-mpi.md), levantado do DOM real.

**Onde a automação roda.** Numa `BrowserWindow` oculta, não no Playwright. O app
já é Electron: é o mesmo Chromium, sem somar ~150 MB de binários a um instalador
que já tem 80 (ADR-024). A janela usa `partition: 'persist:painel-mpi'`, então o
login vale para as próximas execuções; o formulário de login tem token CSRF, o
que descarta montar um POST à mão.

**Como ela preenche — e por que não digitando.** O painel é **Alpine.js**: os
campos não têm `id`, têm `x-model` apontando para o estado do componente. A
automação escreve no estado e chama as mesmas funções que os botões chamam
(`saveBlock`, `saveModal`, `salvarEValidarConexao`).

Simular digitação seria pior: num framework reativo, atribuir `input.value` sem
disparar os eventos certos deixa o campo **preenchido na tela e vazio no envio**.
É a falha que parece sucesso, e é exatamente a que não se pode ter aqui.

**O sucesso é a mensagem verde, não a chamada ter voltado.** Cada bloco só conta
como sincronizado quando `blockFeedback['integrations.<bloco>'].ok` vira texto;
`.error` preenchido é falha, mesmo com a chamada tendo "funcionado". A aba
Relatório usa `feedback.ok` e `integrationConnectionOk` do mesmo jeito.

**A conta OAuth casa pelo rótulo.** O `<select>` do painel é por id numérico
(`bcrelatoriotags@gmail.com` era 12 no dia do levantamento) e esse id não é
estável entre ambientes. A automação procura a opção cujo texto é o e-mail da
marca — id que muda de ambiente é a definição de seletor frágil.

**Guardas antes de abrir o navegador.** Endereço fora do
`idealplus.idealtrends.io`, login ausente e "nada para sincronizar" são
recusados antes de qualquer janela existir. Abrir navegador e logar para depois
descobrir que não havia o que mandar é trabalho e risco à toa — e a janela ainda
bloqueia `will-navigate` para fora do host, para não levar uma sessão logada
para a casa de terceiro.

**A senha fica criptografada** pelo `safeStorage`, como o token do Bitbucket e o
da Microsoft, e `painel:status` devolve só o e-mail — nunca a senha. "Remover
credenciais" apaga também a sessão do painel.

**Search Console da MPI+ é diferente em dois pontos** (ADR-030 continua valendo
para as outras marcas):

| | MPI+ | Busca Cliente e MPI Solutions |
| --- | --- | --- |
| Propriedade | `https://dominio/` (sem www) | `https://www.dominio/` |
| Método | `FILE` | `META` |

O valor que vai ao painel é a linha de dentro do arquivo
(`google-site-verification: google….html`), montada por
`buildFileVerificationValue`, que é idempotente: nome de arquivo ganha o
prefixo, valor já pronto passa direto. Não aposto num formato só — a API já
devolveu a tag inteira onde eu esperava o token uma vez (ADR-015).

**O que os testes cobrem, e o que não.** As guardas, o armazenamento da senha e
a montagem dos valores têm teste. O miolo — Alpine dentro de uma
`BrowserWindow` — **não tem**, e não vou fingir que tem: simular o painel aqui
testaria a minha imitação dele, não ele. Essa parte se valida rodando de
verdade, e é por isso que cada bloco reporta a mensagem do painel no terminal
em vez de um "ok" do app.

---

## ADR-038 — A ordem da publicação da MPI+

**Status:** aceita

**Contexto.** A primeira execução real sincronizou tudo e mesmo assim terminou
assim:

```
Painel: relatório — Contrato sincronizado e integrações verificadas. (conexão ainda pendente)
Painel: trilhos — Analytics ok · Search Console fail
✕ Erro: The necessary verification token could not be found on your site.
```

Nada aí é bug de código: é **ordem errada**. Na MPI+ a verificação é por
arquivo, e quem publica o arquivo no site é o painel. O app estava verificando
antes de o arquivo existir, e sincronizando o relatório antes de a propriedade
estar verificada — daí o trilho nascer `fail`.

**Decisão.** A publicação da MPI+ vira uma sequência com ordem obrigatória:

1. **Integrações no painel** — é isto que leva a chave e faz o arquivo ir ao ar;
2. **Verificar no Search Console** — só agora o arquivo existe;
3. **Sitemap** — `sites.add` e `sitemaps.submit`;
4. **Relatório no painel** — com a propriedade já verificada, o trilho passa.

Se o passo 2 falhar, o passo 4 **não roda**. Sincronizar o relatório sabendo
que ele vai dar `fail` é gastar tempo para registrar um erro previsível.

**Antes de verificar, o app busca o arquivo.** Um `GET` em
`https://dominio/googleXXXX.html` conferindo o conteúdo, com até cinco
tentativas espaçadas enquanto o site publica. O erro do Google não distingue
"arquivo ausente" de "conteúdo errado"; o `GET` distingue, e essa é a diferença
entre *"espere o deploy"* e *"o painel gravou outra coisa"* — duas ações
completamente diferentes para quem está lendo o terminal.

**Escopo e API novos.** Enviar sitemap e registrar propriedade são da **Search
Console API**, que não é a Site Verification API: escopo
`.../auth/webmasters` na lista da service account, e a API precisa ser
**habilitada no projeto do Google Cloud**. Era uma pendência registrada na
ADR-028; o sitemap a cobrou. Se ela não estiver habilitada, o passo do sitemap
avisa e o resto continua — verificar não depende dela.

**Isto vale só para a MPI+.** As outras marcas continuam com meta tag no
`geral.php`, que vai ao ar pelo commit, e sem painel nenhum no meio.

**Consequências.** O botão "Sincronizar no painel" refaz a sequência inteira,
não só o painel — é o que se quer quando algo falhou no meio. E o "Verificar
Search Console" da MPI+ passou a usar o mesmo caminho, com a checagem do
arquivo e o sitemap juntos, em vez de chamar o Google direto.

---

## ADR-039 — O campo "Key" do painel é meta tag, não arquivo

**Status:** aceita (corrige a ADR-037 e a ADR-038)

**Contexto.** Duas execuções seguidas falharam com o app dizendo que o arquivo
`googleed81e723ffa7d7c5.html` não estava no ar. Parecia atraso de publicação do
site. Não era. Buscando o HTML do `starexemergencias.com.br`:

```html
<meta name="google-site-verification"
      content="google-site-verification: googleed81e723ffa7d7c5.html">
```

O painel **injeta o valor do campo como conteúdo de uma meta tag**. Ele nunca
publicou arquivo nenhum — e nunca ia. O que fomos mandar para lá foi a linha de
dentro do arquivo, que virou o conteúdo da meta: lixo dos dois lados, e a
verificação não tinha como passar nem por FILE nem por META.

**O erro foi meu, e a evidência estava à vista.** Os outros dois campos do mesmo
bloco são `Key` também e recebem valor puro — `G-XXXXXXXXXX` no Analytics,
`GTM-XXXXXXX` no Tag Manager. Por analogia, o do Search Console recebe o token
puro. Eu aceitei a descrição do fluxo manual (baixar o arquivo, copiar o
conteúdo) como se fosse a descrição do que o campo espera, e não conferi.

**Decisão.** Um método só, para todas as marcas: **META**, com o token puro
(`extractSiteVerificationToken`). O que muda na MPI+ continua sendo só o
endereço da propriedade — sem `www` (ADR-030).

**A conferência prévia muda de alvo, não de ideia.** Em vez de buscar o
arquivo, o app baixa o começo do HTML do site e compara a meta tag que está no
ar com o token esperado. E o diagnóstico passa a distinguir três situações que
o erro do Google junta numa só:

| No ar | O app diz |
| --- | --- |
| nada | "não há meta tag de verificação na página" |
| valor diferente | `a tag no ar diz "X", e o token é "Y"` |
| valor certo | segue para a verificação |

Valor diferente **não espera**: se alguém gravou outra coisa, esperar não
conserta. Só a ausência justifica tentar de novo enquanto o site publica.

Essa checagem teria fechado o caso na primeira execução, em vez de na terceira —
e é a lição que fica: quando o erro de terceiro é ambíguo, o app tem que olhar
com os próprios olhos antes de repetir a frase dele.

---

## ADR-040 — A MPI+ verifica pelo Google Analytics

**Status:** aceita (fecha o assunto que a ADR-037, a 038 e a 039 tentaram)

**Contexto.** A tela de **Verificação de propriedade** do Search Console da
Starex, aberta na conta que realmente usa o site:

```
Métodos de verificação usados
  Google Analytics    ✓ A verificação foi concluída

Métodos adicionais de verificação
  Arquivo HTML · Tag HTML · Google Tag Manager · Provedor do nome de domínio
```

**Era o Analytics o tempo todo.** Arquivo e tag aparecem como *adicionais* —
disponíveis, nunca usados. O ritual de baixar o arquivo do Search Console e
colar o conteúdo no painel nunca verificou nada: o arquivo não vai para o site
(comprovado com 404 no arquivo da própria equipe), e o valor vira uma meta tag
inválida. O que validava era a tag do GA já publicada na página.

Três ADRs erradas em fila porque eu fui atrás do que o processo *dizia* fazer em
vez de olhar o que o Search Console *registrava* como feito. O print que fechou
o caso levou dez segundos para ser tirado, e eu poderia tê-lo pedido no primeiro
dia em vez de no terceiro.

**Decisão.** Separar duas perguntas que eu vinha tratando como uma:

| Pergunta | Resposta |
| --- | --- |
| Que **token** o app gera? | Sempre `META` — é ele que vai para o `geral.php` e para o campo "Key" do painel, que injeta uma meta tag com o que receber |
| Por qual **método** o Google verifica? | `ANALYTICS` na MPI+; `META` nas outras |

Na MPI+, quem criou a propriedade do GA4 foi a própria service account, e a tag
está no ar porque o painel a instalou. A verificação por Analytics é, portanto,
a que corresponde à realidade — e a única que não depende de publicar nada a
mais.

**A conferência prévia acompanha o método.** Para `ANALYTICS`, o app procura no
HTML a tag do GA4 ou o container do GTM antes de chamar o Google — o `G-` pode
não aparecer no HTML cru quando o GA entra pelo GTM, então achar qualquer um dos
dois já basta para valer a chamada. Para `META`, continua comparando o conteúdo
da meta com o token.

**Consequências.** O campo "Key" do Search Console no painel deixa de ser
caminho crítico: ele recebe o token META, o que produz uma meta tag válida e um
método adicional de verificação de brinde, mas a verificação não depende mais
dele. E a ordem da ADR-038 continua valendo pelo mesmo motivo de antes — a tag
do GA precisa estar no ar, e quem a publica é o painel.

---

## ADR-041 — Rodar de novo reaproveita, não duplica

**Status:** aceita

**Contexto.** "Posso mandar criar de novo que ele detecta o que já existe?" A
resposta era **não**, e o estrago não era pequeno:

| Etapa | Antes | Ao rodar de novo |
| --- | --- | --- |
| GA4 | `properties.create`, sem checagem | segunda propriedade, Measurement ID novo |
| GTM | detectava a duplicata e **avisava**, criando assim mesmo | segundo container, GTM-ID novo |
| reCAPTCHA | `keys.create`, sem checagem | terceira chave para o mesmo domínio |

O pior não eram as duplicatas: era o Hub mandar os **IDs novos** para o painel
ou para o `geral.php`. O site passaria a medir numa propriedade vazia e a que
vinha coletando viraria órfã — estrago que só aparece quando alguém abre o
relatório um mês depois.

**Decisão.** Cada etapa procura antes de criar. Achou um, reaproveita e diz
isso; não achou, cria como antes; achou mais de um, **para a etapa** — não
escolhe nem cria.

A busca é barata de propósito:

- **GA4**: o Hub batiza a propriedade com o domínio, então o `accountSummaries`
  que já era listado para escolher a conta **já traz a resposta** — nenhuma
  chamada a mais. Só o `dataStreams.list` do reaproveitamento é novo.
- **GTM**: a listagem de containers já existia para detectar duplicata. Agora o
  resultado dela é usado em vez de virar aviso.
- **reCAPTCHA**: um `keys.list` a mais.

**Container reaproveitado não recebe o template de novo** — aplicar as 15 tags
num container que já as tem produziria 30. Ele também não é republicado.

**Ambíguo para a etapa, e só ela.** Duas propriedades com o mesmo nome é sinal
de que alguém já fez algo à mão; escolher por conta própria seria o mesmo tipo
de palpite que a ADR-016 recusou na busca. O erro nomeia os candidatos e manda
apagar o que não serve.

**`PulaEtapa`.** "Já está pronto, pode seguir" e "deu erro" passaram a ter
caminhos diferentes. Antes os dois caíam no mesmo `catch`, e o terminal
anunciaria falha onde não houve nenhuma.

**Consequências.** Rodar de novo vira operação segura — que era o pedido. O fim
da execução lista o que foi reaproveitado, para a diferença entre "criei" e
"achei" nunca ficar implícita.

---

## ADR-042 — Esperar a lista carregar, e dizer o que veio nela

**Status:** aceita

**Contexto.**

```
Painel: A conta bcrelatoriotags@gmail.com não aparece na lista de conexões OAuth do painel.
```

A conta está lá — apareceu no levantamento e funcionou na execução anterior. O
que mudou foi a janela: desde a ADR-038 as integrações e o relatório são
chamadas separadas, cada uma com uma `BrowserWindow` nova. Antes, o relatório
rodava numa página que já estava aberta há um minuto; agora roda numa que acabou
de carregar.

E as opções daquele `<select>` vêm do servidor **depois** que o modal abre — o
painel tem `optionsError` no estado, justamente porque é um carregamento à
parte. Eu esperava 300 ms fixos e lia. Numa página fria, o que eu lia era só o
`"Selecione a conexão"`.

**Foi regressão minha**, introduzida ao dividir a sincronização em duas etapas.
A divisão continua certa; a espera fixa é que nunca esteve.

**Decisão.** Nada de espera fixa: o script aguarda até o `<select>` ter mais de
uma opção (a primeira é o placeholder), com teto de 20 s. O mesmo para o cartão
do Analytics, que também pode não existir ainda numa página fria.

**E o erro passa a mostrar a lista.** Antes ele afirmava uma ausência sem
provar:

```
a conta bcrelatoriotags@gmail.com não está entre as 13 conexões do painel:
bcrelatorios@gmail.com, bcrelatorios2@gmail.com, …
```

Agora dá para distinguir de relance três coisas que a frase antiga juntava:
a lista não carregou, a conta não existe mesmo, ou o e-mail configurado está
diferente do cadastrado no painel. É a mesma lição da ADR-039 — quando o app
afirma que algo não está lá, ele tem que dizer o que estava.

---

## ADR-043 — O campo do painel recebe o que a equipe manda hoje

**Status:** aceita

**Contexto.** A equipe cola no campo "Key" do Search Console do painel o
**conteúdo do arquivo** que o Search Console manda baixar
(`google-site-verification: google….html`). Eu tinha trocado isso pelo token da
meta, porque era o único valor que produzia uma tag válida.

Só que, depois da ADR-040, **esse campo deixou de ser caminho crítico**: a
verificação é pelo Analytics. O que vai ali não decide mais se a propriedade
verifica — e pode haver motivo do lado do painel para ele receber o valor que
sempre recebeu, que ninguém aqui consegue afirmar de fora.

**Decisão.** A marca declara o que mandar. A MPI+ manda a linha do arquivo; as
demais mandam o token da meta, que é o que faz sentido onde a verificação é por
meta tag.

Isso obriga o app a pedir **dois tokens** à API na MPI+ — o de arquivo e o de
meta. São emitidos separadamente e não dá para converter um no outro; isso
também já foi fonte de confusão (ADR-039).

**Três coisas que eu já confundi entre si**, e que agora têm nome e função
separados:

| | O quê | Onde |
| --- | --- | --- |
| `googleSearchConsole` | token da meta | `geral.php` das outras marcas |
| `searchConsolePainel` | linha do arquivo | campo "Key" do painel na MPI+ |
| `searchConsoleVerify` | método de verificação | chamada ao Google |

**Consequências.** A meta tag que o painel injeta na MPI+ volta a ficar
"estranha" (o conteúdo não é um token), e o terminal diz isso em voz alta junto
com o porquê de não quebrar nada. Se o teste mostrar que a integração do painel
também não precisava disso, é uma linha em `BRANDS` para voltar atrás.

---

## ADR-044 — Limpar o domínio na entrada, e ler de volta o que o painel guardou

**Status:** aceita

**Contexto.** Duas coisas no mesmo log:

```
Sincronizando http://starexemergencias.com.br/ no painel MPI+
Painel: Relatório: Preencha Analytics, Search Console e demais campos obrigatórios.
```

**A primeira é o domínio.** Alguém copiou o endereço da barra do navegador e
colou no campo. O app aceitou `http://starexemergencias.com.br/` como se fosse
um domínio, e isso vaza para tudo: nome da propriedade GA4, nome do container,
domínio permitido do reCAPTCHA, slug do repositório. Pior: o reaproveitamento
que entrou na ADR-041 compara pelo nome, então ele **não acha** o que já existe
e cria tudo de novo — exatamente o estrago que a ADR-041 foi escrita para
evitar.

**Decisão.** `normalizeDomain` tira protocolo, `www.`, caminho, query e barra
final, na tela (para a pessoa ver o valor corrigido antes de apertar o botão) e
no processo principal (que não confia na tela). O terminal registra a troca
quando ela acontece.

**A segunda é o painel recusando o relatório.** A mensagem dele diz o que falta
preencher, mas não diz o que ele tem — e eu não tinha como saber se o problema
era o que eu mandei, o que ele guardou, ou o momento em que eu li.

**Decisão.** Antes de chamar `salvarEValidarConexao()`, o script lê `draft` de
volta e confere campo a campo. Faltando algum, ele não sincroniza: devolve **os
dois lados** — o que mandou e o que o painel tem depois de salvar.

Isso não conserta a causa, porque a causa ainda não é conhecida. Conserta o
diagnóstico: na próxima execução o terminal vai dizer se o painel descartou os
valores, se `saveModal` não persistiu, ou se algum campo chegou vazio da
criação. É o mesmo remédio da ADR-039 e da ADR-042, e é a terceira vez que ele
aparece — o padrão já está claro o bastante para virar regra: **quando o app
depende de um sistema de terceiro, ele não repete a frase do terceiro; ele
mostra o que viu.**

---

## ADR-045 — `saveModal` volta calado, então o app confere depois

**Status:** aceita

**Contexto.** `Preencha Analytics, Search Console e demais campos obrigatórios`
vinha do painel com os dois modais aparentemente salvos. Lendo o código dele ao
vivo, a mecânica apareceu inteira:

```js
saveModal() {
  if (!this.modal) return;          // ← sai sem gravar e sem avisar
  const next = { ...this.config };
  if (this.modal === 'ga')  { next.ga_*  = this.draft.ga_*;  }
  if (this.modal === 'gsc') { next.gsc_* = this.draft.gsc_*; }
  this.persistConfig(next);
  this.modal = null;
}

salvarEValidarConexao() {
  if (!this.localReady) { feedback.error = "Preencha Analytics, Search Console…"; return; }
  // lê THIS.CONFIG, nunca this.draft
}
```

Três coisas que eu não sabia e que mudam a automação:

1. **`draft` é rascunho; `config` é o que vale.** Eu vinha conferindo `draft`.
2. **`saveModal` só grava os campos do modal aberto** — e volta em silêncio se
   nenhum estiver.
3. **`localReady`** é o portão, e exige Analytics *e* Search Console.

**Decisão.** A automação passa a conferir os três pontos:

- antes de salvar, que o modal certo está aberto (`d.modal === 'ga'`);
- depois de salvar, que **`config`** ficou com o que foi mandado, campo a campo;
- antes de sincronizar, que `localReady` virou `true`.

Falhando qualquer um, ela **não** chama `salvarEValidarConexao` e devolve o
estado do `config` junto do erro.

**Reproduzido no painel antes de escrever o código**, no projeto da Starex: a
sequência completa levou `localReady` a `true` e o `config` ficou íntegro — o
mecanismo está certo, o que faltava era a automação conferir em vez de supor.
Os valores de teste foram apagados depois (o `config` do cliente voltou vazio).

**Consequências.** `docs/painel-mpi.md` ganhou a seção sobre `draft` × `config`,
que é o tipo de coisa que ninguém adivinha lendo a tela. E some mais uma falha
silenciosa: antes, um `saveModal` que não gravou seguia adiante e só aparecia
como uma frase genérica do painel dois passos depois.

---

## ADR-046 — Casar a propriedade pelo domínio do data stream

**Status:** aceita

**Contexto.** A ADR-041 fez o app reaproveitar em vez de duplicar, mas o
reaproveitamento comparava o **nome** da propriedade com o domínio, exato. Só
que a convenção real da equipe não é essa: a maioria das propriedades antigas
se chama `dominio.com.br - GA4`. O `servicos2ems.com.br` provou isso — o Hub
criou tudo de novo mesmo já existindo dado lá dentro, porque
`"servicos2ems.com.br - GA4" !== "servicos2ems.com.br"`.

Nome é convenção; quem manda de verdade é o **data stream**, que guarda o
endereço do site em `webStreamData.defaultUri`. Duas propriedades podem ter
nomes diferentes para o mesmo site, mas o stream aponta para um lugar só.

**Decisão.** A busca por propriedade existente passa a ter dois degraus:

1. **Pelo nome, tolerante ao sufixo.** `nomeCasaComDominio` aceita o domínio
   puro e o domínio seguido de separador — ` - GA4`, `(antigo)`, `_v2`. Ponto
   **não** é separador, de propósito: `cliente.com.br.old` é outro domínio, não
   um apelido do mesmo.

2. **Pelo domínio do stream, quando o nome não acha nada.** Aí o app varre os
   data streams das propriedades da marca (`ANALYTICS_SCAN_LIMIT` = 600,
   `ANALYTICS_SCAN_CONCURRENCY` = 8) e compara o host de `defaultUri`,
   sem `www`, com o domínio normalizado da ADR-044.

O terminal diz qual dos dois achou, e o nome da propriedade que ele vai
reaproveitar — quem lê precisa poder discordar antes de o resto do escopo rodar
em cima da propriedade errada.

**Consequências.** O limite de 600 é um teto de custo, não um número mágico:
marca com mais propriedades que isso vai varrer só as primeiras e cair na
criação. Quando isso aparecer na prática, o caminho é filtrar por conta antes de
varrer, não subir o teto. E a varredura só roda quando o nome falhou — no
caminho comum ela nem acontece.

Isso também é o que destrava o vínculo em massa: com o casamento pelo stream,
uma planilha de domínios encontra as propriedades que já existem sem depender
de ninguém ter nomeado tudo igual.

---

## ADR-047 — Vincular em massa é o mesmo caminho, sem a parte que cria

**Status:** substituída por ADR-065

**Contexto.** Há uma leva de sites que já têm Analytics, Tag Manager e Search
Console prontos e só precisam ser ligados ao painel. Rodar o "Criar novo" neles,
um a um, faria duas coisas erradas: pediria atenção a cada domínio, e correria o
risco de criar recurso novo onde já existe um — foi exatamente assim que o
`servicos2ems.com.br` ganhou uma segunda propriedade (ADR-046).

Havia a tentação de escrever um caminho separado, mais curto, só para a massa.
É a tentação errada: dois caminhos que deviam fazer a mesma coisa divergem no
primeiro ajuste que alguém faz em só um deles.

**Decisão.** O vínculo em massa usa **o mesmo handler** do projeto avulso, com
uma chave a menos: `apenasExistentes: true`. Nesse modo o
`google:createProject` procura igual e **não cria nada** — nem propriedade, nem
data stream, nem container, nem chave do reCAPTCHA. O que não achou vai para
`faltando` e aparece no resumo da linha, com nome.

Depois disso a rodada faz o que a tela de um projeto só faz, na mesma ordem
(ADR-038): Configuração → Integrações, Search Console, Relatório → Conexão.
`sincronizarPainel` e `publicarMpiPlus` passaram a receber o link e a marca de
quem chama, em vez de lerem o estado da tela: em massa o link é de cada linha,
e o estado só sabe do projeto que está aberto.

O Tag Manager ganhou a mesma tolerância do Analytics: casa pelo nome com sufixo
e também pelos domínios que o próprio container declara.

**Entrada por planilha.** Duas colunas — domínio e link do painel. Cabeçalho é
opcional e a ordem das colunas não importa; `;` e `,` valem os dois, porque a
planilha brasileira exporta com ponto-e-vírgula. O domínio passa pelo
`normalizeDomain` da ADR-044 na leitura, não na hora de usar.

Linha sem link, ou com link que não é do `idealplus.idealtrends.io`, **continua
na lista**, marcada e fora da rodada. Sumir com ela seria a ferramenta decidindo
calada que aquele site não existe.

**Um site por vez, e parada limpa.** Nada de paralelismo: o painel é uma janela
só, e a mensagem verde de cada bloco é lida na tela. O botão de parar marca
para parar **depois** do site atual — cortar no meio deixaria o painel com um
bloco salvo e outro não, que é o pior estado possível.

**Consequências.** Quem quiser criar de verdade continua no "Criar novo": o modo
vincular nunca vira o caminho de criação por engano, porque quem liga a chave é
a ferramenta, não o usuário. E se um dia o fluxo do painel mudar, muda em um
lugar só — os dois caminhos passam pelas mesmas funções.

---

## ADR-048 — O painel tem um terceiro cartão, e ele é obrigatório no cliente legado

**Status:** aceita, com o diagnóstico corrigido pela ADR-050

> **Leia a ADR-051 antes desta.** O terceiro modal descrito aqui é real e
> continua sendo tratado, mas **não era a causa** da falha que motivou esta
> ADR — nem a corrida da ADR-050 era. A causa está na ADR-051.

**Contexto.** A aba Relatório passou a falhar sempre com
`localReady=false` mesmo com os dois modais salvos e conferidos. A frase era
nossa, e ainda assim não dizia nada: sabíamos que o painel não se considerava
pronto, não *por quê*.

Dessa vez fui ler o painel em vez de deduzir. `localReady` é um getter, e o
código-fonte dele responde tudo:

```js
get gaComplete()   { return Boolean(config.ga_connection_id && config.ga_account_key?.trim() && config.ga_property_id?.trim()); }
get gscComplete()  { return Boolean(config.gsc_connection_id && config.gsc_site_url?.trim()); }
get leadsComplete(){ return Boolean(String(config.leads_external_id || '').trim()); }
get localReady()   {
  if (!this.gaComplete || !this.gscComplete) return false;
  if (this.isClienteLegado && !this.leadsComplete) return false;
  return true;
}
```

Existe um **terceiro modal** — `openModal('leads')`, campo
`draft.leads_external_id`, rótulo "External ID (sistema legado)", que o painel
guarda como `external_id`. Ele só é exigido quando o projeto está marcado como
**cliente legado**, e a automação nunca soube que ele existia. Projeto comum
passava; projeto legado nunca ia passar.

**Decisão.** Três mudanças:

1. **Preencher o terceiro modal** quando `isClienteLegado` for verdadeiro. O
   valor vem de um campo novo no Hub ("External ID"), e de uma terceira coluna
   opcional na planilha do vínculo em massa. Sem valor, a automação para e diz
   exatamente isso — em vez de tentar e ouvir a frase genérica do painel.

2. **Dizer qual campo travou.** `gaComplete`, `gscComplete` e `leadsComplete`
   são lidos um a um, e o erro nomeia o que está faltando junto do `config` que
   o painel tinha na hora.

3. **Recusar campo vazio antes de abrir o painel.** A conferência da ADR-045
   comparava o que mandamos com o que ficou gravado — e passava quando
   mandávamos vazio, porque `'' === ''`. Um campo vazio salva "com sucesso" e
   derruba `gaComplete` depois. Agora falta de valor é recusada na entrada, com
   o nome do campo.

**Um detalhe que custou caro:** o `estadoDepois` que a ADR-045 mandou coletar
nunca chegava à tela. `rodarNoPainel` transformava o retorno em `throw new
Error(bruto.erro)` e jogava fora o resto do objeto. O diagnóstico existia e se
perdia dois níveis acima. Agora o erro carrega o objeto inteiro em `e.detalhe`.

**Consequências.** Vale a regra outra vez: **ler o que o outro lado faz, não o
que ele diz**. Três investigações seguidas nesta mesma tela terminaram assim, e
todas as três teriam sido curtas se eu tivesse aberto o código do painel antes
de escrever o meu.

---

## ADR-049 — Quem registra a propriedade é quem passa a enxergá-la

**Status:** aceita

**Contexto.** A propriedade saía "validada" mas não aparecia no Search Console
da `bcrelatoriotags`: toda vez alguém tinha que entrar e criá-la à mão, e aí ela
já estava verificada. Parecia bug; é a própria semântica da API.

São **duas coisas diferentes**, e nós só fazíamos uma e meia:

- `siteVerification.webResource.update` com `owners` torna a conta da marca
  **proprietária verificada**. É isso que fazia a propriedade nascer já validada
  quando a pessoa a criava.
- `searchconsole.sites.add` adiciona a propriedade **à lista de quem chama**
  ("adds a site to the set of the user's sites in Search Console"). Chamando com
  a service account, ela nascia na lista da *service account*. A conta da marca
  tinha a posse, mas não tinha a linha na tela.

Ser dono verificado e ter a propriedade na sua lista não são a mesma coisa, e
nenhuma API converte uma na outra. A única saída é chamar `sites.add`
**autenticado como a conta da marca** — e a service account não pode se passar
por uma conta `@gmail.com`.

**Decisão.** O login OAuth do app deixa de ser único e passa a ter **slots**:
a sessão principal (a do "Conceder acesso") continua no
`oauth-token.json`, e cada marca ganha `oauth-token-<marca>.json`. O login da
marca pede só o escopo `webmasters` — ela não mexe em usuário de ninguém.

No `searchconsole:prepare`, havendo sessão da marca, `sites.add` e
`sitemaps.submit` vão com ela; não havendo, seguem pela service account **e o
terminal diz, com todas as letras, que a propriedade não vai aparecer sozinha e
que conectar a conta resolve**. Degradar calado aqui era o problema.

Duas guardas que não são detalhe:

- **O login confere o e-mail.** Entrar com a conta errada gravaria a sessão de
  outra pessoa e mandaria as propriedades para o Search Console dela. Se o
  e-mail que voltou não é o configurado para a marca, a sessão não é gravada.
- **A sessão da marca não vira o `auth` global.** Ela é usada em chamadas
  pontuais no meio de um fluxo que roda pela service account; trocar o padrão
  global sequestraria o resto da etapa.

E, no fim, `sites.list` na conta da marca: "mandei" e "está lá" são afirmações
diferentes, e é exatamente aqui que já erramos três vezes (ADR-040). Se a
propriedade não aparecer na lista, o terminal avisa em vez de comemorar.

**Consequências.** São três logins a fazer uma vez (um por marca), nas
configurações. Sem eles nada quebra — volta a ser o que era, agora dizendo por
quê. E a sessão pode expirar: a tela mostra o estado de cada marca, incluindo o
caso chato em que o Google não devolve refresh token e a sessão vale uma hora.

---

## ADR-050 — O painel busca o contrato depois de abrir, e apaga o que você gravou

**Status:** aceita, com o diagnóstico corrigido pela ADR-051
**Corrige o diagnóstico da:** ADR-048

> **Leia a ADR-051 antes desta.** A corrida descrita aqui existe e a espera
> fica — mas a falha relatada tinha outra causa: um erro meu ao ler a opção do
> select (ADR-051).

**Contexto.** A ADR-048 atribuiu o `localReady=false` ao terceiro modal do
cliente legado. O terceiro modal existe e é obrigatório mesmo — aquela parte
segue válida — **mas não era a causa do erro relatado**. Quem apontou isso foi
o Everton, com a observação mais simples possível: *"esse External ID a gente
não coloca quando faz a publicação normal"*. Se o campo fosse o obstáculo, a
publicação manual travaria também. Não trava. Logo, não era ele.

Voltando ao código do painel, dessa vez no `init()`:

```js
init() {
  this.loadOAuthOptions();
  this.loadRemoteContract();   // ← assíncrono
  ...
},

applyRemoteData(d) {
  const next = remoteToConfig(d);
  this.remotePayload = d;
  this.persistConfig(next);    // ← TROCA this.config inteiro
},
```

O painel monta a tela com o `config` do `localStorage` e, **em paralelo**, busca
o contrato no servidor. Quando a resposta chega, `persistConfig` **substitui o
config inteiro** pela versão do servidor.

A automação é rápida demais: abre os dois modais, grava, confere (`config`
bate), e aí o contrato chega e apaga tudo. `localReady` vira false, e o painel
responde com a frase genérica de sempre. Uma pessoa nunca vê isso porque leva
alguns segundos clicando — tempo em que a requisição já terminou. E explica o
"antes funcionava": não mudou nada do nosso lado, mudou o tempo de resposta.

A janela do Hub ainda piora a corrida: ela usa uma partição própria
(`persist:painel-mpi`), com `localStorage` separado do navegador do usuário —
então ela quase sempre começa com o `config` vazio e depende inteiramente do
carregamento remoto.

**Decisão.** Esperar, e depois conferir:

1. **Antes de tocar em qualquer modal**, esperar `connectionOptions` encher (é a
   prova de que o `init()` rodou) e então `loadingRemoteContract === false`.
   Nessa ordem: sem a primeira, o `false` da segunda pode ser só "ainda nem
   começou".
2. **Depois de gravar**, esperar 600ms e reconferir os cinco campos. Se sumiram,
   o servidor chegou por cima: regrava uma vez e confere de novo. Persistindo,
   o erro diz isso com essas palavras, em vez de repetir a frase do painel.
3. Quando a regravação salva o dia, o terminal avisa — comportamento correto por
   acidente de tempo não pode passar por comportamento correto.

**Consequências.** A lição não é sobre Alpine: é que **estado que chega depois
não é estado ausente**. A ADR-042 já tinha aprendido isso com o select de
conexões OAuth, que carrega assíncrono, e eu apliquei a correção só naquele
campo em vez de perguntar o que mais na tela chega tarde. A pergunta certa,
diante de uma tela que se monta sozinha, é *o que ainda está em voo* — e a
resposta estava no `init()` o tempo todo.

Sobre a ADR-048: o terceiro modal continua sendo tratado, e a recusa de campo
vazio continua valendo (as duas coisas são reais e custam pouco). O que ela
errou foi a atribuição de causa — parei na primeira explicação que servia.

---

## ADR-051 — `op.value` num objeto que só tinha `v`: a causa era minha

**Status:** aceita
**Corrige o diagnóstico das:** ADR-048 e ADR-050

**Contexto.** Com o formulário impresso na hora da recusa (ADR-048), a
resposta finalmente ficou visível:

```
{"ga_connection_id":"", "ga_account_key":"389582297", "ga_property_id":"properties/554455768",
 "gsc_connection_id":"", "gsc_site_url":"https://clinicahumanizzi.com.br", ...}
Analytics: mandei ga_connection_id em branco
```

Os dois campos de conexão OAuth iam **em branco** — e tudo o mais chegava. A
função que escolhia a conexão, reescrita na ADR-042 para esperar o select
carregar, fazia isto:

```js
const opcoes = Array.from(sel.options).map(o => ({ v: o.value, t: … }));
const op = opcoes.find(o => o.t.toLowerCase() === conta);
return { valor: op.value };   // ← o objeto tem "v", não "value": undefined
```

Renomeei o campo para `v` na reescrita e mantive `op.value` na linha de baixo.
`undefined` virou `''`, o painel gravou `''` sem reclamar (ADR-045), a
conferência "mandei X, ficou X" passou porque `'' === ''`, e `gaComplete`
caiu. O relatório falhava **desde a ADR-042** — o que bate exatamente com o
"antes funcionava" do Everton, porque a única sincronização bem-sucedida foi
anterior a ela.

Nem o terceiro modal (ADR-048) nem a corrida com o contrato (ADR-050) eram a
causa. As duas mecânicas existem no painel e as duas defesas ficam — mas eu
atribuí a falha a elas sem ter o dado que as confirmasse, duas vezes seguidas.

**Decisão.**

1. A conexão sai do **estado** do componente (`connectionOptions`, uma lista
   de `{ name, value }`), não do `<select>`. É de onde o próprio select lê, e
   não depende de o modal estar montado, nem de timing do DOM.
2. A escolha virou uma função **pura, sem fechamento**, `escolherConexao`,
   serializada para dentro da página com `.toString()` e **testada aqui fora**.
   Um dos testes é literalmente "o id nunca vem vazio quando achou" — o caso
   que estava quebrado.
3. Conexão achada mas sem id é **erro**, não vazio: o painel guardaria vazio e
   a conferência passaria, de novo.

**Consequências.** Código que roda dentro de outra página não tinha teste
nenhum porque "não dá para simular o painel". Dava para separar a parte pura e
testá-la — e era justamente nela que o erro estava. Vale como regra: **o que vai
serializado para o painel entra como função nomeada e testada**, não como texto
solto dentro de um template string.

Sobre o registro: a ADR-048 e a ADR-050 ficam, com esta nota, porque o
raciocínio errado também é documentação — de como *não* diagnosticar. O que as
duas tinham em comum: eu achei uma mecânica real no painel e parei ali, sem
verificar que era *ela* que estava agindo. O que resolveu foi o dado bruto
impresso na tela, que só existe porque a ADR-048 mandou imprimi-lo.

---

## ADR-052 — Menos ferramentas, uma por intenção

**Status:** aceita

**Contexto.** O hub tinha "Comando de deploy" como ferramenta avulsa e "Buscar
existente" como aba dentro de "Criar propriedades". O primeiro duplicava algo
que o merge já entrega no cartão de cada PR mergeado. O segundo obrigava quem
chega para uma reformulação a passar por uma tela cujo botão principal cria
coisas novas, que é exatamente o que essa pessoa não quer.

**Decisão.** "Comando de deploy" sai. "Buscar propriedades" vira ferramenta
própria, ao lado de "Criar propriedades". A função `buildDeployCommand` fica,
porque o cartão do PR mergeado continua usando.

**Consequências.** Uma ferramenta por intenção: criar, buscar, vincular,
conceder, suspender, mergear. O nome da ferramenta diz o que vai acontecer ao
apertar o botão principal dela.

---

## ADR-053 — A planilha entra como ela é

**Status:** aceita

**Contexto.** A primeira versão do vínculo em massa pedia `dominio;link` numa
caixa de texto. A planilha real tem razão social, domínio e link do painel,
vem em .xlsx ou colada do Excel, e nem sempre na mesma ordem. Reformatar isso à
mão para caber no formato do app é trabalho manual que o app existe para
eliminar.

**Decisão.** Três mudanças:

1. **Formato.** O processo principal lê `.xlsx`, `.xls`, `.ods` (via `xlsx`,
   dependência nova), `.csv` e `.txt`, e o texto colado. Separador por
   detecção: tabulação ganha sempre que aparece (é o que Excel e Sheets colam),
   senão o que for mais frequente entre `;` e `,`. UTF-8 com recuo para
   Latin-1, porque o Excel brasileiro ainda exporta assim.
2. **Colunas por reconhecimento.** Cabeçalho, quando há, pelo nome ("Razão
   Social", "Cliente", "Domínio", "Site", "Painel", "Hub", e variações).
   Conteúdo, sempre: coluna cheia de links do `idealplus.idealtrends.io` é o
   painel; coluna que parece domínio é o domínio; o que sobra com texto é a
   razão social. Um papel por coluna, os inconfundíveis primeiro.
3. **Prévia com correção.** As quatro primeiras linhas aparecem numa tabela com
   um seletor no topo de cada coluna. Se o app errou, a pessoa troca ali e a
   lista se refaz. Nada roda antes de a prévia aparecer.

A razão social passa a ser o nome de cada linha na lista e no terminal, com o
domínio embaixo: é assim que a equipe identifica o cliente.

**Consequências.** O `xlsx` entra no `package.json`: quem for gerar o
instalador precisa rodar `npm install` antes. A leitura da planilha é testada
fora do app (`tools/test-vincular-massa.js`), incluindo o caso de colunas a
mais, sem cabeçalho e fora de ordem.

---

## ADR-054 — Um visual com uma cor de destaque só

**Status:** aceita

**Contexto.** O visual anterior tinha cor por categoria (violeta, verde, azul),
uma faixa em gradiente no topo, grade de cartões na tela inicial e tamanhos
generosos. O pedido foi outro: intencional, sem gradiente ou vidro, poucos
cartões, cantos pouco arredondados, ícones e não emojis, e a paleta que o
Guilherme usa quando não tem outra direção: fundo quase preto puxado para o
azul e ciano `#18c7ff` como destaque.

**Decisão.** `style.css` foi reescrito do zero, mantendo os nomes de classe.

- **Uma cor de destaque.** O ciano marca o que é interativo ou selecionado:
  botão primário, foco, item marcado, linha em execução. Verde, âmbar e
  vermelho ficam para resultado. Categoria deixa de ter cor e vira um rótulo
  em monoespaçada.
- **Superfícies, não cartões.** A tela inicial é uma lista de linhas separadas
  por 1px, não uma grade. Cartão só onde há um objeto com ações (um PR, um
  resultado). Estados de lote (vínculo em massa, sessões) são linhas com uma
  barra de 2px à esquerda.
- **Medidas.** Raio de 3px, bordas de 1px, tipografia de 10,5 a 15px, barra
  superior de 40px. Nenhuma sombra, nenhum gradiente.
- **Copy.** Sem travessão em nenhum texto do app: virou vírgula, dois-pontos ou
  frase separada. As reticências tipográficas viraram três pontos.

**Consequências.** `style-next.css` (a proposta cyberpunk) foi apagado: este é
o visual. O CSP ganhou `img-src 'self' data:` para a seta dos selects, que é um
SVG embutido. Os ADRs anteriores mantêm os travessões: são registro histórico, e
reescrevê-los mudaria o texto de decisões já tomadas.

---

## ADR-055 — Paleta verde-petróleo, e vidro só onde ele tem função

**Status:** aceita

**Contexto.** Depois da ADR-054 vieram quatro referências de glassmorphism. A
regra do Guilherme é clara: nada de vidro ou gradiente sem propósito. As
referências que ele destacou têm em comum uma luz ambiente forte atrás de
superfícies translúcidas; é a luz que dá sentido ao vidro. A paleta escolhida
foi a da terceira imagem, com os valores da quarta: `#22F2EF`, `#3EE97D`,
`#49DC7A`, `#040A0A`, `#FFFFFF`.

**Decisão.**

- **Luz ambiente fixa** (`body::before`): três manchas radiais, petróleo em
  cima à esquerda, verde embaixo à direita, uma terceira no meio. Nunca se
  movem. São o "atrás" que o vidro desfoca.
- **Vidro em três lugares**, os que flutuam sobre o resto: barra superior,
  painel de ações e o modal de configurações. `backdrop-filter: blur(18px)
  saturate(1.15)`, fundo a 56% e um fio de luz de 1px no topo. O terminal
  fica quase opaco: texto miúdo em cima de desfoque cansa.
- **Cartões chapados.** Fundo sólido, borda de 1px, o mesmo fio de luz no topo.
  Vidro empilhado sobre vidro vira lama; um nível basta.
- **Papéis das cores.** Ciano `#22F2EF` para o que é interativo ou selecionado
  (botão primário, foco, item marcado, linha em execução). Verde `#3EE97D` só
  para resultado bom. A terceira imagem usa verde no CTA, mas aqui o verde já
  significa "deu certo", e um botão verde diria isso antes da hora.
- **Raios**: 4px em controles, 6px em cartões e modal. Um pouco mais que a
  ADR-054, ainda longe de pílula.

**Consequências.** `backdrop-filter` tem custo de composição; limitado a três
superfícies grandes e estáticas, é imperceptível. A luz ambiente é a única
"decoração" do app, e ela existe para uma coisa só.

---

## ADR-056 — Verde é o destaque; cartões voltam, menores

**Status:** aceita (ajusta a ADR-055) — os cartões saíram da tela inicial na ADR-127; o verde como destaque continua

**Contexto.** Duas devoluções depois da ADR-055: a tela inicial em lista não
agradou (os cartões eram melhores, só grandes), e a paleta ainda lia como
ciano, não como o verde-esmeralda da referência.

**Decisão.**

- **Verde `#3EE97D` vira o destaque**: botão principal, seleção, foco, hover,
  ícone dos cartões. Resultado bom usa `#49DC7A`, um verde mais fechado, que
  não briga com ele. A distinção interativo/resultado que a ADR-054 fixou
  continua, só que dentro do mesmo matiz, separada por tom e por forma.
- **Ciano `#22F2EF` fica onde é luz, não onde é ação**: a marca na barra, os
  comandos no terminal e o indicador de "ocupado". Nada mais.
- **Luz ambiente esmeralda**: a mancha principal é verde-petróleo no centro,
  com um ponto verde em cima à esquerda e um traço de ciano no canto oposto.
- **Cartões de volta na tela inicial**, em duas colunas, com metade da altura
  de antes: ícone de 18px, nome de 12,5px, descrição de 10,5px e a categoria
  como rótulo no canto.

**Consequências.** O que a ADR-055 diz sobre vidro segue valendo. O que mudou
foi a resposta à pergunta "que cor a pessoa vê primeiro": agora é verde.

---

## ADR-057 — Ativar SSL é a suspensão com outro pedido

**Status:** aceita

**Contexto.** O pedido de ativação de SSL segue o mesmo caminho do pedido de
suspensão: consultar o DNS, separar por hospedagem, mandar e-mail para o
suporte da M3 sobre quem está lá e listar quem está no Vesta para fazer à mão.
Só o texto muda: `Ativação SSL - {projeto} - {dominio}` no assunto, com
`{projeto}` sendo "Busca Cliente" ou "MPI Solutions", e "Solicito ativação SSL
do projeto {dominio}" no corpo.

**Decisão.** Uma ferramenta nova no hub, "Ativar SSL", sobre o mesmo código de
"Suspender sites". O que era fixo virou um **modo** (`MAIL_MODOS`), escolhido
pela tela aberta: modelos padrão, texto da ação da M3 e do Vesta, rótulo do
botão, e se existe o seletor de projeto. Cada modo guarda as edições dos seus
modelos numa chave própria do hub-state (`mail` e `mailSsl`), então mudar o
assunto de um não mexe no outro.

`{projeto}` é resolvido **na tela**, uma vez, antes do envio. O processo
principal continua conhecendo só `{dominio}`, que é o que varia por e-mail. Sem
valor, `{projeto}` some em vez de ficar literal no assunto.

O resultado de uma verificação carrega o modo em que foi feita e é descartado
ao trocar de ferramenta: a marcação de quem recebe e-mail é a mesma, o pedido
não.

**Consequências.** Um terceiro pedido do mesmo tipo (renovar, migrar) é uma
entrada nova em `MAIL_MODOS`, sem tela nova. Testado em
`tools/test-ativar-ssl.js`.

---

## ADR-058 — Publicar MPI+ de ponta a ponta: DNS antes, painel no meio, tags no fim

**Status:** aceita (o Registro.br ficou automático na ADR-059)

**Contexto.** A publicação de um projeto MPI+ era uma sequência de cliques em
três lugares: painel (aprovar, publicar em produção, SSL), Cloudflare (zona e
registros) e Registro.br (nameservers), e só depois as tags. O pedido foi
fazer tudo isso a partir do Hub, com duas paradas: antes de aplicar o DNS e
antes de publicar.

O painel foi lido com a sessão do Guilherme, só leitura. A aba Publicação
expõe `window.__mpiHubPubPublication`, e cada passo é uma chamada:
`confirmSiteAprovar` (POST `wordpress-site/approve`), `validarDominioProducao`
+ `salvarPublicacaoProducao` (POST `validate-domain` e `enqueue` com `{domain,
server_id}`), job em três passos com polling, e `activateProductionSsl`. Erros
saem por `alert()`.

**Decisões.**

1. **Ordem por dependência.** DNS primeiro, porque o SSL só emite com o
   domínio apontando para o servidor novo e a propagação leva tempo; painel no
   meio; tags no fim, com a conta da MPI+ (a empresa do DNS não muda a conta
   do Google).
2. **Fotografia do DNS pelos autoritativos de hoje**, não pelo resolvedor da
   máquina. Não existe "listar tudo" (AXFR é fechado), então a lista é a dos
   hosts que costumam existir (www, mail, webmail, smtp, imap, ftp, cpanel,
   autodiscover e outros), DKIM e DMARC, SRV do Autodiscover, mais o que a
   pessoa acrescentar na tela.
3. **A regra de preservação em código puro** (`lib/zona.js`): raiz A para o
   IP novo; www CNAME para a raiz; qualquer outro CNAME que apontava para a
   raiz vira A para o IP antigo; MX na própria raiz vira `mail.<dominio>` com A
   para o IP antigo; TXT, SRV, CAA copiados; AAAA da raiz descartado com aviso;
   nada com proxy. O IP antigo é o A da raiz na hora da fotografia, e aparece
   no terminal. É a regra que impede o e-mail do cliente de parar.
4. **Cloudflare por API com token por empresa** (`lib/cloudflare.js`), Busca
   Cliente e MPI Solutions, criptografados. Zona reaproveitada quando existe;
   registros planejados contra o que a zona já tem (atualizar, criar, manter);
   o que a proposta não menciona fica na zona e é listado. Depois de escrever,
   a zona é relida e conferida.
5. **Painel sem cliques cegos.** `alert` é substituído por uma função que
   guarda a mensagem, senão a janela oculta travaria. Cada passo confere o
   estado depois (status `approved`, job `completed`, `wpProductionSslActive`).
   Publicação é acompanhada pelo `refreshWpInstallSnapshot` a cada 5s, com o
   nome do passo no terminal, até 20 minutos.
6. **Duas paradas com `confirm`**: antes da Cloudflare (com a zona proposta
   inteira no texto) e antes de publicar (domínio, servidor, painel). Domínio
   sempre sem www no painel; servidor padrão 192.168.3.143 (id 11), ajustável
   nas configurações; IP público 149.18.102.39.
7. **Registro.br**: sem API para titular. A automação pela janela oculta
   depende de mapear as telas com a conta logada, o que ainda não aconteceu.
   Até lá o passo é semiautomático: o Hub deixa os dois nameservers na área de
   transferência, diz onde colar e confere a troca pelo DNS quando você voltar.
   Login com 2FA ou CAPTCHA, quando existir, será resolvido por você numa
   janela visível; o Hub não contorna nenhum dos dois.

**Consequências.** `lib/` nasce como lugar de código puro e testável fora do
Electron (`tools/test-zona.js`, `tools/test-publicacao.js`). O fluxo pode ser
retomado de onde parou e cada etapa pode ser pulada de propósito, com aviso;
pular a propagação é a única que arrisca algo (o SSL). O que ainda não é
automático está dito na tela, não escondido.

---

## ADR-059 — Registro.br pela própria API interna do painel deles

**Status:** aceita

**Contexto.** A ADR-058 deixou o Registro.br semiautomático porque não havia
mapeamento. Com a conta da Busca Cliente logada no navegador do Claude, o
painel foi lido, só leitura, sem salvar nada:

- É uma SPA em Vue. Toda a informação vem de `/v2/ajax`, com o cabeçalho
  `X-XSRF-TOKEN` copiado do cookie `XSRF-TOKEN` (sem ele, 400).
- `GET /v2/ajax/domains` lista os 990 domínios da conta, com status e papel
  do contato (`OWNER`, `ADM`, `TEC`).
- `GET /v2/ajax/domain/<fqdn>` devolve `Hosts` (os servidores DNS atuais),
  `CanEditDNS`, `FreeDNSStatus` e os contatos. A página do domínio é
  `/painel/dominios/?dominio=<fqdn>`, direto, sem precisar da busca.
- O botão "Alterar servidores DNS" abre um formulário com até 6 servidores e
  2 DS; "Salvar alterações" abre um diálogo e o confirmar chama
  `POST /v2/ajax/domain/<fqdn>/dns` com `{ hosts: [{Hostname, IPv4, IPv6}],
  dsSet: [{keyTag, digest}] }`. Sucesso é "DNS atualizado"; erros vêm em
  `messages`, com códigos `hoststatus:*` por campo.
- O login é o formulário normal (`login.user`, `login.password`). A conta da
  Busca Cliente não tem segundo fator (`OTPID: 0`).

**Decisão.** O Hub abre o Registro.br numa janela oculta, por empresa
(partição `persist:registrobr-<empresa>`, sessão persistente), faz o login
com as credenciais criptografadas da empresa, e a partir daí conversa com o
`/v2/ajax` de dentro da página, com o cookie e o XSRF de verdade. Nada de
clicar em formulário: lê o domínio, confere `CanEditDNS`, grava os dois
nameservers da Cloudflare com `dsSet: []`, relê e compara.

Três guardas:

- **`CanEditDNS` falso** para com o nome do contato que teria que ser o nosso.
  A conta só edita o que o cliente delegou a ela.
- **DNSSEC.** Se o domínio tem DS do provedor antigo, ele é removido junto com
  a troca, com aviso: DS antigo com nameservers novos derruba o domínio.
  Quem quiser DNSSEC liga de novo na Cloudflare.
- **Segundo fator ou tela inesperada.** A janela é mostrada e o Hub espera a
  pessoa; não tenta adivinhar nem contornar.

**Consequências.** O passo do Registro.br fica automático quando a conta da
empresa está configurada e cai para o modo manual (nameservers na área de
transferência, conferência pelo DNS) quando não está ou quando a chamada falha,
com o motivo no terminal. A API interna deles não é contrato público: se
mudar, o sintoma é a chamada de leitura falhar, e o Hub volta ao manual em vez
de gravar errado.

---

## ADR-060 — O instalador só leva o que está na lista

**Status:** aceita

**Contexto.** O app instalado abriu com `Cannot find module '...\\resources\\app...\\zona'`.
A ADR-058 criou a pasta `lib/` e o `main.js` passou a requerê-la, mas
`package.json > build.files` é uma lista explícita do que entra no instalador,
e `lib/` não estava nela. `npm start` funciona (lê a pasta do projeto inteira);
o instalador não.

**Decisão.** `lib/**/*` entra na lista. E um teste, `tools/test-empacotamento.js`,
confere que todo `require` por caminho em `main.js` aponta para algo coberto
por `build.files`, e que as dependências de runtime (`googleapis`, `xlsx`) não
estão em `devDependencies`. Roda com as outras suítes.

**Consequências.** Pasta nova no projeto = linha nova em `build.files`, e o
teste avisa quando alguém esquecer. O erro só aparecia no app instalado, então
sem o teste ele passaria por qualquer verificação feita com `npm start`.

---

## ADR-061 — Só mexemos no DNS que é nosso

**Status:** aceita

**Contexto.** Nem todo cliente delega o contato técnico do domínio para nós.
Quando não delega, a Cloudflare e o Registro.br não são nossos para mexer, e
o SSL de produção só dá para ativar depois que o cliente apontar o domínio por
conta dele. Publicar e fazer as tags, porém, continua sendo nosso trabalho.

**Decisão.** A publicação começa com uma conferência no Registro.br, com a conta
da empresa: `GET /v2/ajax/domain/<fqdn>` e a pergunta é se o **contato
técnico** (`TecHandle`) é o handle da empresa (`BCTDL` para a Busca Cliente,
`MPSOL83` para a MPI Solutions; ficam na configuração da publicação, com esses
padrões). Só o técnico conta: é o que o cliente delega quando quer que a gente
cuide do DNS. Administrativo é outra relação e não entra na decisão.

- **É nosso**: o fluxo inteiro, DNS antes, painel no meio, tags no fim.
- **Não é nosso** (contato técnico de outro handle, ou domínio que nem está na
  conta): fotografia, Cloudflare, Registro.br, propagação e SSL são pulados em
  bloco, cada um com o motivo escrito na linha, e o fluxo vai direto para
  aprovar, publicar e tags. No fim a tela lembra de pedir o apontamento ao
  cliente e ativar o SSL depois.
- **Não deu para saber** (login do Registro.br não configurado, falha na
  consulta): a etapa falha com o motivo, e "Pular" trata o DNS como nosso, que
  é o comportamento anterior.

**Consequências.** A decisão "DNS é nosso ou do cliente" deixa de ser da pessoa
e passa a ser lida de onde ela mora, o Registro.br. O terminal imprime os dois
contatos e o titular antes de decidir, para dar para discordar.

---

## ADR-062 — Toda publicação vira uma linha na planilha

**Status:** aceita — a consequência prevista saiu errada na prática; ver ADR-068.

**Contexto.** A equipe registra cada site publicado numa planilha do SharePoint
(`Book.xlsx`, abas MPI e BUSCA, 26 colunas: data, domínio, razão social, tipo,
desenvolvedor, servidor, e as etapas como "Finalizado"). Publicar pelo Hub e
depois preencher isso à mão seria deixar metade do trabalho de fora.

**Decisão.** Uma última etapa em "Publicar MPI+", e um botão no resultado de
"Criar propriedades" para Busca Cliente e MPI Solutions. A escrita é pelo
Microsoft Graph com a mesma sessão do envio de e-mail, que ganhou o escopo
`Files.ReadWrite`. O link de compartilhamento vira o item do drive por
`/shares/{u!base64url}/driveItem`; na aba, se houver uma tabela a linha entra
nela (`tables/{id}/rows`), senão vai logo abaixo do intervalo usado
(`usedRange` e `PATCH range`) e é relida para conferir.

Regras da linha (`montarLinhaPlanilha`, pura, testada):

- Data de hoje em `dd/mm/aaaa`; domínio como `https://<dominio>/`; razão social
  do campo da tela; tipo `MPI+`, `MPI` ou `Busca` pela marca; desenvolvedor e
  servidor das configurações; "Chave Única" e "Rediect" em branco, como no
  exemplo.
- Validação do site: `NÃO CONTÉM ERROS`, o texto que a equipe usa.
- As 17 etapas como `Finalizado`. Exceção: quando o DNS é do cliente (ADR-061),
  Cloudflare e Registro.BR vão como `Não se aplica`. Escrever "Finalizado" no
  que o Hub não fez seria mentir para quem lê a planilha depois.
- Aba pela marca: MPI+ e MPI Solutions em MPI, Busca Cliente em BUSCA.

A linha inteira aparece num `confirm` antes de ir.

**Consequências.** Quem conectou a Microsoft antes desta versão tem um token
sem `Files.ReadWrite`; o Graph responde 403 e o app pede para desconectar e
conectar de novo, dizendo por quê. A API interna do Graph para Excel é
contrato público, ao contrário da do Registro.br.

---

## ADR-063 — O contato técnico também diz de que empresa é o projeto

**Status:** aceita (estende a ADR-061 e a ADR-062)

**Contexto.** Projetos MPI+ existem nas duas empresas. `asasys.com.br` e
`karollinefigueiredo.com.br` são os dois "MPI+" na planilha, mas o primeiro é
da MPI Solutions e o segundo da Busca Cliente, e o que separa os dois é o
contato técnico no Registro.br: `MPSOL83` num, `BCTDL` no outro. É isso que
decide a aba da planilha (MPI ou BUSCA) e, antes disso, qual conta da
Cloudflare e do Registro.br entra.

**Decisão.** O seletor de empresa ganha o padrão "Descobrir pelo contato
técnico no Registro.br". A etapa de conferência pergunta às duas contas, na
ordem Busca Cliente e MPI Solutions; a primeira em que o domínio aparece com o
contato técnico da própria conta define a empresa, e o seletor é atualizado
para mostrar a decisão. Daí em diante tudo segue como antes: conta da
Cloudflare e do Registro.br dessa empresa, aba `BUSCA` para Busca Cliente e
`MPI` para MPI Solutions, tipo `MPI+` na coluna Tipo.

Quando nenhuma conta tem o domínio como contato técnico, o DNS é do cliente
(ADR-061) e a empresa fica indefinida. As etapas de DNS são puladas; na hora da
planilha o Hub para e pede para escolher a empresa no seletor, porque essa
informação não está em lugar nenhum que ele consiga ler.

Escolher a empresa à mão continua possível e restringe a consulta a essa conta
só.

**Consequências.** A Busca Cliente é consultada primeiro por ser a conta com
mais domínios; um domínio da MPI Solutions custa uma consulta a mais. As duas
contas do Registro.br precisam estar configuradas para o modo descobrir
funcionar inteiro; com uma só, a outra falha com aviso e a decisão sai da que
respondeu.

---

## ADR-064 — Quando não dá para saber, pergunta no terminal

**Status:** aceita (fecha a ADR-063)

**Contexto.** Sem o contato técnico no Registro.br, não há lugar confiável
para ler de qual empresa é um projeto MPI+. O painel MPI+ tem um selo de
empresa por projeto, mas ele diz "Busca Cliente" para o `asasys.com.br`, que é
MPI Solutions; não serve. As duas empresas usam o mesmo servidor Hestia (143),
então o servidor também não separa. Cloudflare e a própria planilha só ajudam
em republicação. A decisão do Guilherme: perguntar.

**Decisão.** O terminal ganha um tipo de linha, a pergunta, com botões
(`perguntarNoTerminal`). Ela fica em destaque até ser respondida e a resposta
entra como linha logo abaixo, então a decisão fica registrada na mesma linha do
tempo do resto. Na etapa da planilha, quando a empresa não foi descoberta, o
Hub pergunta "De qual empresa é <domínio>?" com as duas opções, atualiza o
seletor com a resposta e segue para a escrita na aba certa.

**Consequências.** A pergunta é o último recurso, não o primeiro: só aparece
quando o Registro.br não respondeu. E é o único ponto do fluxo em que o app
depende de uma informação que não consegue verificar depois; por isso fica
escrito no terminal quem respondeu o quê.

---

## ADR-065 — "Publicar em massa": uma ferramenta que publica e vincula na mesma passada

**Status:** aceita (substitui a ADR-047; o ponto 5, DNS fora do lote, foi revertido pela ADR-066)

**Contexto.** A ADR-047 decidiu que o vínculo em massa **nunca cria**: era uma
leva de sites que já tinham tudo e só precisavam ser ligados ao painel, e criar
por engano era o risco a evitar (ADR-046). A leva mudou. Os sites que chegam
agora nem sempre têm Analytics, Tag Manager ou reCAPTCHA, e nem sempre estão
publicados — mandar cada um desses para o "Criar novo" e depois voltar para a
planilha é exatamente o trabalho manual que a ferramenta existe para eliminar.

A primeira tentativa foi acrescentar um segundo modo na mesma tela: "Vincular" e
"Publicar". Isso resolvia a função e quebrava a ADR-052, que diz que **o nome da
ferramenta tem que dizer o que acontece ao apertar o botão principal dela**. Uma
ferramenta chamada "Vincular em massa" cujo botão publica em produção é
exatamente o que aquela decisão proíbe.

**Decisão.** Os dois modos viram um fluxo só, e a ferramenta passa a se chamar
**Publicar em massa**.

1. **Ordem, por dependência, não por preferência.** Por site: lê no painel se já
   está publicado (só leitura); se não estiver, aprova, publica em produção e
   ativa o SSL; só então procura no Google e sincroniza o painel. A verificação
   do Search Console só passa com o site no ar, e quem põe o arquivo lá é o
   painel (ADR-038). Vincular antes de publicar seria registrar um `fail`
   previsível.
2. **Quem já está publicado é só vinculado.** O teste é o mesmo que o painel usa
   para responder "já estava" (`concluido && !falhou`), não um critério nosso.
3. **Criar deixa de ser proibido e vira uma caixa**, marcada por padrão. O
   `apenasExistentes` da ADR-047 continua existindo no handler: desmarcada, a
   caixa devolve exatamente o comportamento antigo, que segue útil para
   auditar uma planilha antes de mexer em qualquer coisa. O que torna criar
   seguro em lote é a guarda que já existia: achou mais de um candidato, o app
   recusa a linha em vez de escolher (ADR-041, ADR-046).
4. **Uma confirmação só, no início, com a lista dos domínios e o servidor.** A
   ADR-058 pede parada antes de publicar, e ela continua valendo: o que muda é
   que em lote ela é uma só, sobre a lista inteira, em vez de uma por site —
   confirmar trinta vezes seguidas não é revisar, é clicar.
5. **DNS, Cloudflare e Registro.br ficam de fora.** A planilha não traz essa
   informação, e essas etapas mexem em zona e nameserver de domínio de cliente:
   elas continuam no "Publicar MPI+", um projeto por vez, com a parada própria
   (ADR-058, ADR-061).

**Consequências.** "Vincular em massa" deixa de existir como nome e como
intenção separada; quem quer só vincular desmarca a caixa e publica nada, porque
o passo 2 não faz nada em site já publicado. O `id` da ferramenta continua
`bulk`, para não perder os recentes já gravados no hub-state.

No caminho apareceu uma fragilidade antiga: `sincronizarPainel` lia
`res.feitos.map(...)` sem guarda. Uma resposta `ok` sem essa lista virava
`TypeError` **depois** de o painel ter aceitado, e derrubava a rodada inteira em
vez de só aquela linha — o oposto do princípio 1 do PRD. Passou a ler as duas
listas com `|| []`.

---

## ADR-066 — O lote também mexe no DNS, com a revisão onde ela importa

**Status:** aceita (estende a ADR-065; o ponto 3, sem condição por IP de origem, foi revertido pela ADR-067)

**Contexto.** A ADR-065 deixou DNS, Cloudflare e Registro.br fora do lote, com
o argumento de que revisar zona a zona viraria trinta confirmações e que
confirmar trinta vezes seguidas não é revisar. O argumento estava certo sobre
*confirmar tudo*, e errado sobre o escopo: a planilha que chega é de sites que
ainda estão no servidor antigo, e sem DNS a publicação em massa para justo
antes do que importa.

A pergunta certa não era "confirma ou não confirma", e sim **onde** a parada
paga o seu preço. A resposta do Guilherme: a revisão por domínio é aceitável
quando é **só no DNS** — publicar, vincular e planilha seguem sem parar. A zona
é o único artefato do fluxo que é diferente em cada domínio e que carrega o
e-mail do cliente; o resto é o mesmo roteiro repetido.

**Decisão.**

1. **Contato técnico primeiro, por domínio.** Reusa a ADR-061 e a ADR-063 sem
   mudar nada: decide se o DNS é nosso e de que empresa é o projeto. Não sendo
   nosso, Cloudflare e Registro.br são pulados com o motivo no terminal e o
   resto da rodada continua.
2. **Antes e depois na tela, e um `confirm` por domínio, só no DNS.** O texto do
   confirm lista apenas o que muda (o que o `lib/zona.js` marca com `origem`
   diferente de "copiado"); a tabela ao lado mostra as duas zonas inteiras. É a
   parada da ADR-058 mantida no ponto em que ela serve.
3. **Sem condição por IP de origem.** O pedido veio como "se estiver no
   `149.18.102.58`, trocar para o `.39`". O `.58` não existe em código nem em
   ADR nenhuma: é o IP em que os sites estão hoje, não uma regra. A regra
   continua sendo a da ADR-058 — a raiz passa a apontar para o IP novo e o
   e-mail fica preservado no antigo — e quem barra o caso estranho é a revisão
   humana de cada zona, não uma comparação de string.
4. **Nameserver que não troca não desfaz a zona.** A troca no Registro.br falha
   com aviso e a rodada segue: a zona já está na Cloudflare e a troca pode ser
   feita depois.
5. **A conferência de duplicado da planilha mora dentro do
   `planilha:registrar`**, com o parâmetro `pularSeExistir`. Conferir de fora
   abriria uma janela entre ler e gravar, e em lote isso vira linha duplicada,
   que é exatamente o que se quer evitar. A comparação é pela coluna Domínio,
   normalizada (ADR-044), porque ela é gravada como `https://dominio/`.
6. **Razão social passa a ser necessária** para a etapa da planilha, e vem da
   planilha de entrada (ADR-053 já a reconhecia, como opcional). Sem ela, só
   essa etapa é pulada, com aviso — a publicação e o vínculo não dependem dela
   (princípio 1 do PRD).

**Consequências.** A rodada deixa de ser desacompanhada: há uma parada por
domínio cujo DNS é nosso, e a pergunta da ADR-064 pode travar o lote esperando
um clique quando a empresa não for descoberta. As duas coisas são deliberadas —
são os dois pontos em que o app não tem como saber sozinho e o erro é caro.

`planilha:registrar` ganhou um parâmetro e continua sendo o único caminho de
escrita na planilha, para o projeto avulso e para o lote.

---

## ADR-067 — No lote o DNS é só a troca do IP, e a conta do Tag Manager tem superfície

**Status:** aceita (ajusta a ADR-066 e desdobra a ADR-035) — a rota de login abriu um furo na própria ADR-035, fechado pela ADR-070.

**Contexto.** Duas coisas que o uso corrigiu.

A primeira: a ADR-066 mandou o lote reescrever a zona inteira com a regra de
preservação da ADR-058, tendo a revisão por domínio como proteção. Só que os
sites da planilha são todos MPI+ já no ar, no mesmo IP antigo, e precisam de uma
coisa só: passar a apontar para o servidor novo. Reescrever MX, CNAME e TXT de
quem não pediu é mexer no que está funcionando.

A segunda: um projeto Busca Cliente teve o container criado e o acesso concedido
a `bcrelatorios`, e as tags da Busca Cliente não moram nesse login — moram no
`bcrelatoriotags`, o mesmo da MPI+. E faz sentido: as duas marcas **dividem** a
conta "Busca Cliente - Clientes" no Tag Manager (ADR-017). A ADR-035 unificou
"qual conta humana opera esta marca?" numa resposta só; a pergunta era mais
fina, e **depende da superfície**.

**Decisão.**

1. **No lote, DNS é uma coisa só.** Se o A da raiz está exatamente em
   `ipAntigoMpiMassa` (`149.18.102.58`, na configuração), ele passa para
   `hestiaIpPublico` (`149.18.102.39`). Um registro, mandado sozinho ao
   aplicador, que deixa intacto tudo o que a proposta não menciona. Raiz em
   outro IP, ou sem A: o DNS daquele domínio não é tocado e a linha diz por quê.
   Nameserver não é mexido no lote.
2. **A regra cheia continua no "Publicar MPI+"**, um projeto por vez:
   fotografia, zona proposta, preservação de e-mail (CNAME que apontava para a
   raiz, MX virando `mail.<domínio>`), Cloudflare e Registro.br. É lá que mora o
   caso difícil, e lá a revisão paga o tempo que custa.
3. **Isto reverte o ponto 3 da ADR-066** ("sem condição por IP de origem"). O
   argumento de lá era que a revisão humana bastava — e bastava, para uma zona
   reescrita. Não basta para trinta domínios em que a única pergunta é "está no
   IP antigo?". A comparação de string não substitui a revisão: ela define o
   escopo, e a confirmação por domínio continua existindo.
4. **A conta do Google passa a ter superfície:**
   `googleAccountFor(marca, superficie)`. Analytics e Search Console usam a
   conta da marca; o Tag Manager usa `contaGtmDe` quando a marca declara. Só a
   Busca Cliente declara, apontando para a MPI+ — é o mesmo login abrindo a
   mesma conta compartilhada.
5. **MPI+ que é da MPI Solutions manda as tags para lá.** O contato técnico já
   diz de que empresa é o projeto (ADR-063); quando diz MPI Solutions, o
   container nasce na conta "MPI Solutions" e o acesso vai para o login dela.
   **Só o Tag Manager muda** — Analytics e Search Console seguem na conta da
   MPI+, que é de quem o projeto é.
6. **Login continua fora de predicado de conta** (ADR-017). `contaGtmDe` aponta
   para outra *marca*; o login sai de `brandAccounts`, como sempre.

**Consequências.** O acesso ao container da Busca Cliente passa a depender de a
conta da MPI+ estar configurada, porque é dela que o login sai. A sessão OAuth
por marca não muda: ela continua validando a conta padrão de cada marca, e a da
MPI+ já era exigida.

Os containers já criados com o login errado continuam como estão — a ADR-035 já
havia registrado que o passado não se corrige sozinho. Use o "Conceder acesso"
apontando para a conta certa.

---

## ADR-068 — Escopo novo mora em dois lugares, e o Entra é o que a gente esquece

**Status:** aceita (corrige uma consequência prevista na ADR-062)

**Contexto.** A ADR-062 acrescentou `Files.ReadWrite` para escrever na planilha
e previu a consequência: *"quem conectou a Microsoft antes desta versão tem um
token sem `Files.ReadWrite`; o Graph responde 403 e o app pede para desconectar
e conectar de novo"*. A previsão estava incompleta, e o erro real foi outro:

```
AADSTS65001: The user or administrator has not consented to use the
application with ID '…' named 'Hub'.
```

Não era 403 no Graph, era falha na **renovação do token**, antes de qualquer
chamada. A causa: o escopo entrou na constante `MS_SCOPES` do `main.js`, mas
nunca entrou na lista de **Permissões de API** do registro no Entra — e o
README, que é o roteiro de montagem, continuou mandando marcar só três
permissões. O app passou a pedir um escopo que ninguém tinha aprovado.

**Decisão.**

1. **Escopo da Microsoft mora em dois lugares**, e mexer num obriga a mexer no
   outro: a constante `MS_SCOPES` no código e a lista de permissões delegadas do
   registro no Entra. O §10.5 do README passa a listar os quatro, dizendo para
   que serve cada um.
2. **`AADSTS65001` deixa de ser tratado como sessão vencida.** A mensagem diz
   que é consentimento, nomeia o escopo provável e dá a ordem: acrescentar a
   permissão, conceder, e só então reconectar. "Conecte de novo" sozinho é
   mandar a pessoa repetir o que não funciona (ADR-029).
3. **Consentimento só acontece em autorização interativa.** Token antigo não
   ganha escopo em refresh, então reconectar é parte da receita, nunca
   alternativa a acrescentar a permissão.

**Consequências.** Todo escopo novo da Microsoft daqui em diante custa uma linha
no README e uma visita ao Entra de quem já usa o app. O Hub não tem como
conceder por conta própria: é cliente público, e o consentimento é do usuário ou
do administrador do tenant.

---

## ADR-069 — Perguntar ao lado de lá antes de agir: o SSL espera o DNS, e a aba vem da planilha

**Status:** aceita

**Contexto.** Uma rodada de "Publicar em massa" terminou com dois erros que são
o mesmo erro. O painel recusou o certificado:

```
Painel: o painel não ativou o SSL: Não foi possível ativar o SSL de produção.
```

E a planilha recusou a linha:

```
Planilha: A aba "BUSCA" não existe na planilha.
```

Nos dois casos o Hub agiu com base no que ele **achava** que era verdade do
outro lado. O certificado só é emitido depois que o domínio resolve para o
servidor de produção, e a troca de IP tinha acabado de ser feita — o DNS ainda
não tinha propagado, e no Registro.br a publicação de uma troca leva até duas
horas. A aba da Busca Cliente, por sua vez, se chama "Busca Cliente" na
planilha; "BUSCA" era o nome antigo, escrito dentro do código.

As duas mensagens de erro também não ajudavam: "Não foi possível ativar o SSL de
produção" não diz que falta DNS, e a aba inexistente não dizia quais existem.

**Decisão.**

1. **O SSL só é pedido depois de conferir o apontamento.** Um handler novo,
   `dns:apontando`, resolve a **raiz** do domínio e compara com o IP de
   produção. Só com ela apontando para cá o Hub pede o certificado. O `www` é
   consultado junto, mas não vale como resposta: o certificado é do domínio, e
   `www` certo com raiz errada continua sendo SSL que não sai.
2. **Não apontar não é erro, é espera.** A etapa é pulada, a publicação segue, e
   o motivo é dito por extenso: o IP que está lá hoje, ou que o domínio ainda
   não resolve e a troca no Registro.br leva até 2 horas. A etapa de propagação
   do "Publicar MPI+", que antes derrubava a publicação depois de 30 minutos,
   passa a fazer o mesmo: marca o SSL como pendente e deixa tags e planilha
   seguirem. Refazer a publicação inteira por causa de um passo que dá para
   refazer sozinho a qualquer hora é desperdício.
3. **Tudo que ficou sem certificado sai junto, no fim da rodada**, com o motivo
   de cada um, e os domínios vão para a área de transferência. Quem publica
   trinta sites não fica lendo o terminal linha por linha; o que vira tarefa
   para depois precisa estar num lugar só.
4. **O nome da aba vem da planilha.** Antes de escrever, o Hub lista as abas e
   casa a pedida por nome exato, apelido conhecido e começo do nome — acento e
   caixa não contam. "BUSCA" acha "Busca Cliente", e vice-versa. Quando não
   acha, o erro diz **quais abas existem**. Quem renomeia uma aba não tem como
   saber que o nome antigo estava escrito dentro do app.

**Consequências.** Cada publicação nova paga duas consultas de DNS antes do SSL,
o que é barato perto de um certificado que falha. Sites publicados com o DNS
ainda propagando terminam sem certificado **por decisão**, e a lista do fim é o
que garante que ninguém esqueça — é uma tarefa manual assumida, não um bug
silencioso. A escrita na planilha paga um `GET` a mais por linha. E o Hub passa
a tolerar renomeação de aba, mas não renomeação que mude o sentido: uma aba
nova, com outro nome, continua precisando entrar em `PLANILHA_ABAS`.

---

## ADR-070 — "Conta obrigatória" segue o login, não o projeto

**Status:** aceita (fecha um furo aberto pela ADR-067 na ADR-035)

**Contexto.** A ADR-035 proibiu a MPI+ de cair na conta principal: sem a conta
dela configurada, o Hub recusa em vez de usar outra. A ADR-067 mandou o Tag
Manager da Busca Cliente usar o login da MPI+ (`bcrelatoriotags`), porque as
duas marcas dividem a conta "Busca Cliente - Clientes".

As duas juntas deixaram um furo, que a suíte pegou: a pergunta "esta marca
aceita substituto?" continuou sendo feita para a marca do **projeto**. Num
container de Busca Cliente, ela respondia "aceita" — porque a proibição é da
MPI+, não da Busca Cliente —, e o login que ia de fato ser usado era o da MPI+.
Com `bcrelatoriotags` não configurado, o container ia para a conta principal:
exatamente o caso que a ADR-035 fechou, entrando por outra porta.

**Decisão.** A obrigatoriedade acompanha a marca **dona do login** que vai
administrar o container (`contaGtmDe`, quando existe), não a marca do projeto. E
o aviso passa a nomear as duas quando elas diferem: "O Tag Manager de Busca
Cliente é operado pelo login da MPI+, que só opera pela conta dela".

**Consequências.** Publicar Busca Cliente sem o login da MPI+ configurado deixa
o container sem administrador humano e avisa, em vez de dar administrador
errado. É a escolha certa: container sem dono se resolve abrindo o Tag Manager;
container com a conta errada como administradora foi o que a ADR-035 teve que ir
desfazer à mão. Toda superfície que apontar o login de uma marca para outra
precisa perguntar-se a mesma coisa: a regra é do projeto ou do login?

---

## ADR-071 — A zona nasce na Cloudflare: ela varre, nós completamos e trocamos só o necessário

**Status:** aceita (muda a fonte da zona da ADR-058; a regra de preservação continua a mesma)

**Contexto.** A ADR-058 montava a zona a partir da nossa fotografia dos
autoritativos, e a fotografia tem um limite que DNS não deixa contornar: não
existe "listar tudo", só perguntar por nomes conhecidos. Daí a lista fixa de
hosts e o campo "Outros hosts", que existia para a pessoa adivinhar o que a
lista não adivinha. Um `erp.cliente.com.br` que ninguém mencionou não entrava na
zona nova e caía na troca de nameserver.

A Cloudflare tem a mesma limitação, mas varre com uma lista muito maior e é o
que o painel dela faz ao adicionar um site: `POST
/zones/{id}/dns_records/scan` grava na zona o que encontrar. O pedido do
Guilherme foi exatamente esse: "replicar tudo que a Cloudflare pegou e mudar
apenas o necessário para não quebrar, mail, MX, essas coisas".

**Decisão.**

1. **A zona é criada primeiro e a Cloudflare varre.** `cloudflare:montarZona`
   acha ou cria a zona na conta da empresa e, quando ela está vazia, roda o
   scan. Numa zona que já tem registros o scan duplicaria o que está lá, então
   não roda.
2. **A fotografia dos autoritativos continua, como complemento.** O scan da
   Cloudflare não costuma trazer DKIM, DMARC, SRV nem o host que só aquele
   cliente usa; a fotografia traz, e o campo "Outros hosts" continua servindo a
   isso. `unirRegistros` junta os dois lados sem duplicata. Se a fotografia
   falhar (domínio sem delegação, autoritativo fora), a zona sai só do scan,
   com aviso.
3. **A regra de preservação roda em cima da união**, inalterada: raiz e `www`
   para o servidor novo, CNAME que apontava para a raiz vira A para o IP
   antigo, MX na raiz vira `mail.<domínio>` com A para o IP antigo, o resto
   copiado, nada com proxy.
4. **A proposta agora diz também o que SAI.** Copiados pelo scan, o AAAA da raiz
   e o MX que apontava para a própria raiz ficariam na zona ao lado do que os
   substitui, e o e-mail cairia em dois lugares. `montarZonaProposta` devolve
   `remover`, `planejarAplicacao` trata MX como conjunto (MX do mesmo nome que
   a proposta não pede, sai) e `cloudflare:aplicar` faz `DELETE`, sempre depois
   dos `POST`: se o MX novo falhar, o antigo continua lá.
5. **Proxy ligado pelo scan é desligado.** Registro igual mas `proxied: true`
   vira `PUT` com `proxied: false`. A regra é DNS puro (ADR-058), e o scan da
   Cloudflare liga o proxy por padrão em A e CNAME.
6. **Rodar de novo dá o mesmo resultado.** Se a raiz já está no IP novo (a etapa
   rodou uma segunda vez), o IP antigo é lido do A de `mail.<domínio>`, onde a
   regra o deixou. Sem isso, a segunda passada empurrava o e-mail para o
   servidor novo, que é o oposto do que a regra existe para evitar.

**Consequências.** Nada é escrito na Cloudflare na montagem além do que o scan
gravou; aplicar é a etapa seguinte, depois da revisão. A zona passa a existir na
Cloudflare antes da confirmação, o que é inofensivo: sem nameserver apontado
ela não responde por nada. O antes e o depois na tela passam a ser a união do
scan com a fotografia e a zona final com "muda", "novo", "fica" e "sai" por
linha. No lote (ADR-067), a zona que já existia continua sendo só a troca do IP
da raiz; a zona nova segue esta regra e ganha a troca de nameservers, porque uma
zona nova sem delegação não vale nada.

---

## ADR-072 — Um botão, uma parada: o Publicar MPI+ encadeia, e o lote não pede lista

**Status:** aceita (ajusta as paradas da ADR-058 e da ADR-065; remove o "Pular" da ADR-058)

**Contexto.** O Publicar MPI+ era um clique por etapa, com três `confirm`
(Cloudflare, publicar, planilha) e um botão "Pular" ao lado de cada etapa
pulável. Dois botões numa linha estreita criaram rolagem lateral no painel
esquerdo; três diálogos do sistema numa publicação que deveria ser automática
eram três interrupções, duas delas para confirmar o que a tela já dizia. O
pedido: "deixar apenas a confirmação do DNS após ele alterar os IPs", tirar o
"Pular", e a publicação mais rápida.

**Decisão.**

1. **Um botão.** "Publicar" roda as etapas em sequência (`pubRodarTudo`); ele
   vira "Rodando", "Confirmar e aplicar o DNS na Cloudflare" na parada, "Tentar
   de novo" na falha, "Continuar" quando já há etapas feitas. Nunca dois botões
   na mesma linha.
2. **Uma parada: a do DNS**, depois de a zona final estar montada, com o antes
   e o depois na tela. Publicar em produção e a planilha não pedem mais
   confirmação: o que vai acontecer é dito no terminal antes de acontecer, e a
   planilha usa `pularSeExistir`. No lote, a confirmação da lista inteira
   (ADR-065, ponto 4) também sai: o botão diz "Publicar e vincular N sites", a
   lista está na tela, e a única parada é a do DNS, uma por domínio. Quando a
   zona já está como a proposta, nem essa parada aparece: não há o que revisar.
3. **Sem botão "Pular".** Falha em etapa pulável (conferência do contato, troca
   de nameservers) vira pergunta no terminal, "Tentar de novo" ou "Pular esta
   etapa", só na hora da falha. Falha nas outras para a publicação com "Tentar
   de novo"; falha ao aplicar na Cloudflare volta para a montagem e pede a
   confirmação de novo, porque a zona pode ter mudado. O preview passa a
   contar rolagem lateral no painel esquerdo como erro.
4. **A janela do painel fica viva entre as etapas.** Estado, aprovar, publicar,
   SSL, integrações e relatório abriam cada um a sua `BrowserWindow`,
   carregavam a página e esperavam o Alpine: de 2 a 4 segundos, seis vezes por
   site. `abrirPainelLogado` passa a reaproveitar a janela enquanto a URL for a
   mesma e a última chamada tiver menos de 3 minutos; erro na etapa descarta a
   janela, porque o estado dela deixou de ser confiável. `painel:sync` usa a
   mesma função.
5. **Esperas fixas viram condições.** O `ate()` do painel consulta a cada 60 ms
   em vez de 200; "abrir modal" espera `d.modal` mudar em vez de 300 ms; a
   publicação é acompanhada a cada 2 s em vez de 5; o Registro.br espera o
   formulário ou o cookie de sessão em vez de 1,5 s fixos. As duas contas do
   Registro.br são consultadas juntas, e as consultas da raiz na fotografia
   também: são janelas e resolvedores independentes.
6. **Quem não está conosco sai em planilha.** No lote, domínio cujo contato
   técnico não é nosso entra numa lista com razão social, domínio, o que o
   Registro.br respondeu (titular, contato técnico encontrado, o esperado) e o
   link do painel; no fim da rodada o Hub pergunta onde salvar o `.xlsx`
   (`planilha:exportar`), e um botão na lista salva de novo. Falha de consulta
   não entra na lista: "não consegui consultar" não é "é do cliente".

**Consequências.** Uma publicação sem imprevistos é um clique para começar e
um para confirmar o DNS. O que era diálogo do sistema virou linha no terminal,
que fica no histórico; o `confirm` não ficava. A janela do painel viva por até 3
minutos é memória ocupada de propósito, e é destruída em qualquer erro. O
princípio 3 do PRD ("nenhuma ação destrutiva silenciosa") continua atendido
pela parada do DNS e pelo terminal dizendo o que vai fazer antes de fazer:
publicar em produção era o que o botão já prometia.

---

## ADR-073 — "Criar propriedades" entrega o MPI+ ao "Publicar MPI+", em vez de parecer o fim

**Status:** aceita

**Contexto.** Uma publicação de MPI+ foi feita pelo "Criar propriedades": as
chaves saíram, o painel sincronizou, o Search Console verificou, e nada de
Registro.br, Cloudflare ou planilha aconteceu. Não era regressão de código: essa
tela nunca fez isso, e a ADR-052 proíbe que uma ferramenta chamada "Criar
propriedades" troque nameserver. Mas para quem opera, a tela do MPI+ tinha
domínio, razão social, link do painel e um botão verde de "Sincronizar no
painel": parecia a publicação inteira, e terminava sem dizer que não era.

Duas mensagens do mesmo log também mentiam por omissão: "ETAPA DO TAG MANAGER
FALHOU: etapa pulada" quando o container foi reaproveitado (a saída por
`PulaEtapa` caía no mesmo `catch` do erro real), e "Painel sincronizado: ."
quando só o relatório rodou (a lista de blocos estava vazia).

**Decisão.**

1. **A tela diz o que não faz.** No MPI+, sob o link do painel, uma linha
   explica que ali só se criam as propriedades e se sincronizam as tags, e
   aponta o "Publicar MPI+" para a publicação inteira, com um atalho que leva
   domínio, razão social e link já preenchidos.
2. **O resultado entrega.** O cartão de chaves do MPI+ ganha um botão primário
   "Publicar do começo ao fim", que abre o "Publicar MPI+" com os mesmos dados
   e já começa. Nada se repete: contato técnico é consulta, a zona é montada
   sobre o que existe, aprovar e publicar respondem "já estava", as tags
   reaproveitam o que foi criado, e a planilha não duplica (`pularSeExistir`).
3. **Reaproveitar não é falhar.** Container do Tag Manager reaproveitado sai
   como sucesso, com a frase dizendo isso; o `catch` distingue `PulaEtapa` de
   erro. E o resumo do painel nomeia o relatório quando foi só ele.

**Consequências.** As duas ferramentas continuam separadas, como a ADR-052
pede; o que muda é que a que não publica agora aponta para a que publica, no
lugar em que a pessoa está quando percebe que falta o resto. Quem quiser só as
chaves segue usando o "Criar propriedades" como antes.

---

## ADR-074 — Logado não é sessão: o Registro.br é provado pela API antes de qualquer pergunta

**Status:** aceita (corrige a leitura do 403 da ADR-059 e da ADR-061)

**Contexto.** Um domínio que está na conta da MPI Solutions (visível no painel
do Registro.br, contato técnico MPSOL83) foi dado como "não aparece na conta",
e daí o Hub concluiu "DNS do cliente" e pulou Cloudflare e Registro.br. O log
tinha a causa escrita: `403: Por favor, informe a sessão`. O login acabara de
ser feito, e o `GET /v2/ajax/domain/...` foi disparado no mesmo segundo; a
sessão ainda não valia para a API. O código tratava qualquer 403 como
"domínio de outra conta", porque foi assim que a API respondeu no mapeamento
(ADR-059), feito com a sessão já aberta há tempo.

Pior: a conclusão errada era **silenciosa e consequente**. Uma consulta que não
enxergou a conta virava a mesma coisa que uma consulta que enxergou e não
achou, e a publicação seguia sem DNS, sem planilha na aba certa.

**Decisão.**

1. **A sessão é provada pela própria API antes da primeira pergunta.**
   `registrobrEsperarSessao` chama `GET /v2/ajax/domains` até receber 200, por
   até 20 s, recarregando o painel na metade do caminho. Vale para login recém
   feito e para sessão reaproveitada.
2. **403 que fala em sessão é erro, não resposta.** Só 403/404 sem essa mensagem
   significa "não está nesta conta".
3. **Uma consulta que falhou torna a rodada inconclusiva.** No Publicar MPI+,
   qualquer conta que não respondeu derruba a etapa do contato (e o terminal
   pergunta se tenta de novo ou pula); no lote, o domínio fica com "não
   consegui consultar", não mexe no DNS e não entra na planilha dos que não
   estão conosco. "Não está na conta A" mais "não consegui ver a conta B" nunca
   vira "é do cliente".

**Consequências.** A conferência do contato passa a custar um `GET` a mais e,
logo depois de um login, alguns segundos de espera. É o preço de não decidir
DNS de cliente com base num login lento. O mapeamento da ADR-059 continua
válido; o que mudou foi a leitura de um código de status que tem dois
significados.

---

## ADR-075 — Login no Registro.br: a prova é a API, e CAPTCHA é da pessoa

**Status:** aceita (completa a ADR-074; corrige a detecção de login da ADR-059)

**Contexto.** Depois da ADR-074, o mesmo domínio voltou com as duas contas em
`403 session:required` por 20 segundos, logo depois de "Login do Registro.br
aceito". Ou seja: o login não tinha acontecido. Lendo o formulário deles ao
vivo (`LoginForm`, `Turnstile`, `Login` do bundle): ao clicar em Avançar, o
formulário chama `GET /v2/ajax/checklogin?v=2`; se a resposta pede CAPTCHA,
mostra um Cloudflare Turnstile e só faz o `POST /v2/ajax/user/login/<usuário>`
depois de ele ser resolvido; se não pede, posta direto; e ainda pode voltar
`login:2fa-required`, `login:otp-required` ou `login:challenge-required`.
Enquanto consulta o `checklogin`, o formulário troca os campos por um
"carregando". O Hub olhava o DOM a cada segundo, viu o campo de senha sumir
nesse piscar e declarou "aceito". O CAPTCHA, invisível numa janela oculta,
nunca foi resolvido.

**Decisão.**

1. **Login pronto é `GET /v2/ajax/domains` respondendo 200.** Nenhuma leitura
   de DOM decide isso mais. A ADR-074 já provava a sessão antes de consultar;
   agora a própria espera do login usa a mesma prova.
2. **CAPTCHA ou segundo fator mostram a janela.** Turnstile na tela
   (`#turnstile-box iframe` ou a frase "preencha o Captcha") ou campo de TOTP,
   desafio ou código de recuperação: a janela oculta é exibida, o terminal diz
   o que fazer, e o Hub espera até 4 minutos pela API responder 200. O Hub não
   resolve CAPTCHA nem contorna segundo fator, nunca (ADR-058, ponto 7).
3. **Erro do formulário vira erro nomeado.** "Senha inválida", conta bloqueada,
   limite de tentativas: o texto deles sai no terminal e a etapa falha, em vez
   de esperar 40 segundos por nada.

**Consequências.** Com a sessão persistente por conta (`persist:registrobr-*`),
o CAPTCHA aparece só quando a sessão expira; nas outras vezes o Hub nem vê a
tela de login. A janela aparecendo no meio de uma publicação é deliberado: é o
único lugar em que uma pessoa é necessária, e a alternativa era fingir que
tinha entrado.

---

## ADR-076 — CNAME que vira A é o mesmo registro reescrito, nunca um ao lado do outro

**Status:** aceita (corrige o plano de aplicação da ADR-071)

**Contexto.** Primeira publicação real com a zona montada pela Cloudflare
(`dclima.com.br`): login, contato técnico, scan e fotografia funcionaram, a
zona final ficou certa, e a aplicação falhou duas vezes no mesmo ponto, num
loop de "tentar de novo, confirmar, erro". O scan trouxe `ftp` e `mail` como
CNAME para a raiz; a regra de preservação os transforma em A para o IP antigo
(ADR-058). O plano casava proposta com existente por `tipo|nome`: `A ftp` não
casava com `CNAME ftp`, então o CNAME ficava como "sobra, sem mexer" e o A ia
para `POST`, que a Cloudflare recusa com 81054, porque CNAME não convive com
nada no mesmo nome.

O detalhe grave: com o MX antigo já removido e o MX novo apontando para
`mail`, um `mail` ainda CNAME para a raiz (que já apontava para o servidor
novo) mandaria o e-mail do cliente para o servidor errado assim que os
nameservers trocassem. Foi exatamente o que a regra existe para evitar, e a
delegação ainda não ter acontecido é o que impediu o estrago.

**Decisão.**

1. **Conflito de tipo no mesmo nome é troca de tipo, no mesmo registro.** A
   proposto onde há CNAME, ou CNAME proposto onde há qualquer outro tipo: o
   registro existente entra em `atualizar` com `trocaTipo`, e o `PUT` reescreve
   tipo e conteúdo. Nunca vai para `criar`, nunca fica em `sobras`.
2. **Se o `PUT` com tipo novo for recusado, `DELETE` e depois `POST`**, nessa
   ordem, porque o `POST` antes do `DELETE` é justamente o 81054.
3. **O caso vira teste com o nome dele** (`dclima` em `test-zona.js` e
   `test-publicacao.js`): plano sem sobras, aplicação sem falhas, segunda
   passada sem nada a propor.

**Consequências.** A conferência pós-aplicação (que pegou o problema e impediu
a etapa de seguir) continua sendo a rede de segurança: a zona só é dada como
aplicada quando o que a Cloudflare tem bate com a proposta. Para o `dclima`,
basta rodar a etapa de novo: o plano agora diz "muda 2" para `ftp` e `mail`, e
a publicação segue para os nameservers.

---

## ADR-077 — A espera é pelo A da raiz; o NS se pergunta ao pai, não ao cache

**Status:** aceita (corrige a etapa de propagação da ADR-058)

**Contexto.** Zona aplicada, nameservers trocados no Registro.br, e a etapa
"Esperar o DNS apontar" ficou seis rodadas dizendo "NS antigos, A
149.18.102.39". Onze resolvedores públicos já respondiam o IP novo. O que
segurava era a conferência de nameservers, feita pelo resolvedor da própria
máquina, que guarda o NS antigo em cache pelo TTL inteiro; e a etapa exigia NS
e A ao mesmo tempo.

**Decisão.**

1. **A espera termina quando a raiz resolve para o servidor novo.** É o que o
   certificado precisa (ADR-069); o NS é informação, não condição. Se o NS
   ainda estiver em cache, a linha da etapa diz isso e segue.
2. **NS se pergunta ao pai.** `dns:conferirNs` acha os servidores da zona pai
   (`com.br`, ou `br`) e pergunta a eles a delegação do domínio, que não tem
   cache. Sem resposta do pai, cai no resolvedor da máquina e diz que a fonte
   pode estar em cache.

**Consequências.** A conferência do Registro.br (etapa 4) também passa a usar a
delegação do pai, então "trocou" aparece minutos antes. O único caso em que a
espera continua longa é o real: o A ainda não responde o servidor novo em lugar
nenhum.

---

## ADR-078 — A linha livre da planilha é por conteúdo, não pelo intervalo usado

**Status:** aceita (corrige a escrita da ADR-062)

**Contexto.** A primeira linha gravada pela publicação automática caiu na linha
600 e pouco da aba MPI, cujo último site está na 196 (e na aba Busca Cliente o
último está na 823). O Hub escrevia "abaixo do intervalo usado", e o intervalo
usado do Excel conta célula com formatação, validação de dados e fórmula
vazia. A planilha tem formatação arrastada bem além dos sites, e o Graph
respondeu isso como "usado", mesmo com `valuesOnly=true`.

**Decisão.**

1. **A linha livre é a seguinte à última que tem conteúdo** em Data, Domínio ou
   Razão Social (`proximaLinhaLivre`, pura e testada). O intervalo usado passa a
   ser lido só para trazer os valores, e o terminal diz quando o ignorou ("o
   intervalo usado ia até a 600, por formatação").
2. **Tabela só recebe a linha quando termina exatamente onde a linha livre
   começa.** Tabela com linhas em branco no fim, ou que acaba antes, não decide
   nada: a escrita é pelo endereço, na linha certa.
3. **Uma leitura só** do intervalo, com os valores, serve para conferir
   duplicado e para achar a linha: um `GET` a menos por registro.

**Consequências.** A linha que foi para a 600 precisa ser movida à mão para a
197 (e apagada de onde está), uma vez; daí em diante as próximas entram na
sequência. Se um dia alguém deixar uma linha em branco no meio dos sites, o Hub
escreve depois do último site, não no buraco: é o comportamento que a equipe
já tem ao preencher à mão.

---

## ADR-079 — Domínio fora do .br: sem Registro.br, confere o apontamento e avisa o analista

**Status:** aceita

**Contexto.** Um `.com` chegou ao Publicar MPI+ e as duas contas do Registro.br
responderam `400 Operação não autorizada`: o Registro.br só registra `.br`, e a
pergunta nem fazia sentido. Pulando a etapa, o Hub tratou o DNS como nosso e
travou na zona pedindo a empresa. A regra da equipe para `.com`: o cliente
costuma já ter feito o apontamento; quando não fez, quem pede é o analista.

**Decisão.**

1. **Domínio que não termina em `.br` não consulta o Registro.br** nem mexe em
   Cloudflare ou nameserver. O DNS é do cliente, por definição.
2. **Confere o apontamento da raiz** para o IP de produção (`dns:apontando`,
   ADR-069). Já aponta: segue direto para aprovar, publicar, SSL, tags e
   planilha, sem alarde. Não aponta: segue do mesmo jeito, mas o terminal e o
   cartão final dizem em destaque "avise o analista", com o IP que está lá
   hoje; o SSL fica pendente até o apontamento, como já fazia.
3. **No lote**, o `.com` que não aponta entra na planilha dos que não estão
   conosco (ADR-072), com o motivo "pedir o apontamento do A da raiz para
   149.18.102.39"; o que já aponta não entra, porque não há o que pedir.
4. **A empresa continua vindo do terminal** quando não há Registro.br para
   dizer (ADR-064).

**Consequências.** A conferência de contato deixa de falhar em `.com`, e a
pergunta "tentar de novo ou pular" desaparece nesse caso. O que a equipe faz à
mão hoje (olhar se apontou, cobrar o analista) vira uma linha no terminal e um
aviso no fim, sem parar a publicação.

---

## ADR-080 — Sair do DNS do Registro.br é transição de até 2h, e o Hub sabe esperar

**Status:** aceita (corrige a leitura da troca de nameservers da ADR-059)

**Contexto.** Um domínio que usava o DNS do próprio Registro.br
(`a.auto.dns.br`, `b.auto.dns.br`) recebeu a troca para a Cloudflare e o Hub
entrou em loop: relia o domínio, via os servidores antigos em `Hosts`, dava a
troca como não feita; na tentativa seguinte, `CanEditDNS=false` e uma mensagem
errada sobre contatos. O painel deles mostrava a verdade: "servidores DNS em
transição, delegados em aproximadamente 1h58m". Lendo o bundle do painel
(`Index`, `DomainHolder`), o JSON do domínio traz `FreednsTransition`,
`FreednsTransitionTime` e `FreednsHosts` (os servidores novos, pendentes),
enquanto `Hosts` segue com os antigos e `CanEditDNS` fica falso até publicar.

**Decisão.**

1. **A troca lê a transição.** Se o domínio está em transição para os nossos
   servidores, a etapa é dada como feita ("em transição, publica em ~1h58"),
   sem repetir o `POST`. Em transição para outros servidores, é erro claro:
   esperar. Só depois disso entra a regra de `CanEditDNS`, com mensagem que
   diz os contatos do domínio em vez de inventar uma exigência.
2. **A resposta ao `POST` também é lida assim**: `FreednsHosts` iguais aos
   nossos é sucesso, com o tempo previsto no terminal.
3. **Propagação e SSL são adiados quando a espera é conhecida e longa** (mais
   de 5 min): tags e planilha rodam primeiro, e no fim o Hub espera até o prazo
   do Registro.br mais 30 min de folga, conferindo a raiz a cada minuto e
   avisando a cada 10; quando aponta, pede o SSL. Se estourar, SSL pendente com
   o motivo, como já era.
4. **Quem é contato técnico manda os dois nossos e só eles.** O `POST` já
   substituía a lista inteira (`hosts` com os dois da Cloudflare, `dsSet`
   vazio); fica registrado que é isso mesmo, para quem vier de DNS do
   Registro.br, de provedor ou de qualquer outro.

**Consequências.** A publicação de um domínio que sai do DNS do Registro.br
fica "Rodando" por até 2h no fim, de propósito: é o único jeito de o SSL sair
sem alguém voltar depois. O terminal diz o prazo no começo e a cada 10 minutos.
Tags e planilha não esperam por isso.

---

## ADR-081 — "Operação não autorizada" é "não está nesta conta"

**Status:** aceita (completa a leitura de respostas da ADR-074)

**Contexto.** Um `.br` fora das nossas duas contas voltou com `400 Operação
não autorizada` em ambas, e o Hub disse "não consegui consultar", sem mexer no
DNS e sem afirmar que era do cliente. Cauteloso, mas errado: no bundle do
painel do Registro.br, o código `unauthorized-operation` é tratado voltando
para a lista de domínios, ou seja, é a resposta padrão para domínio que o
usuário logado não administra. A ADR-074 já havia separado o 403 de sessão do
403 de "não está aqui"; faltava o 400.

**Decisão.** `400` com código `unauthorized-operation` (ou a frase "Operação
não autorizada") é lido como "domínio não está nesta conta", igual ao 403/404
sem mensagem de sessão. Com as duas contas respondendo isso, o domínio é do
cliente: pula Cloudflare e Registro.br, entra na planilha dos que não estão
conosco (no lote) e pergunta a empresa no terminal antes da planilha.

**Consequências.** "Não consegui consultar" fica reservado para falha de
verdade (sessão, rede, resposta desconhecida), que é o que o aviso quer dizer.

---

## ADR-082 — A planilha dos que não estão conosco vai para Músicas\apontamentos, sem perguntar

**Status:** aceita (ajusta o ponto 6 da ADR-072)

**Contexto.** A ADR-072 salvava o `.xlsx` dos domínios fora de casa por um
diálogo "salvar como" no fim da rodada. Quem roda trinta sites não está na
frente da tela quando a rodada acaba, e um diálogo aberto esperando clique é
uma rodada que não terminou. O pedido foi um lugar fixo: a pasta Músicas do
Windows, dentro de `apontamentos`.

**Decisão.** `planilha:exportar` aceita `pasta`; com ela, grava em
`<Músicas>\<pasta>` (criando a pasta), sem diálogo, e nunca sobrescreve:
nome repetido ganha sufixo ` (2)`, ` (3)`. O lote usa `apontamentos`, com o
nome `dominios-fora-de-casa-AAAA-MM-DD.xlsx`; o caminho completo sai no
terminal. O botão "Salvar .xlsx" da lista grava no mesmo lugar. O diálogo
continua existindo para quem chamar sem `pasta`.

**Consequências.** A pasta Músicas é escolha da equipe, não do Hub; ela vem de
`app.getPath('music')`, então acompanha o usuário do Windows que está logado.

---

## ADR-083 — O painel nunca espera pelo Registro.br

**Status:** aceita (ajusta o ponto 3 da ADR-074)

**Contexto.** A ADR-074 fez uma consulta falha ao Registro.br derrubar a etapa
do contato no Publicar MPI+, com a pergunta "tentar de novo ou pular". A
intenção era não decidir "DNS do cliente" por um login lento. O efeito
colateral: um domínio que não estava em nenhuma das contas (400, ADR-081) ficou
sem aprovar, sem publicar e sem tags, esperando um clique. A regra da equipe é
outra: **a publicação no painel acontece sempre.** Com o DNS nosso, faz tudo, da
Cloudflare à sincronização; sem ele, pula Cloudflare e Registro.br e faz o
resto.

**Decisão.** Consulta que falha em qualquer conta não para nada: o DNS fica
sem tocar (nem "nosso", nem "do cliente"), as etapas de DNS são marcadas como
não feitas com o motivo, e a publicação segue para aprovar, publicar, tags e
planilha, perguntando a empresa no terminal. O terminal diz que, se o DNS for
nosso, basta rodar o Publicar MPI+ de novo depois para a parte da Cloudflare.
Na planilha, Cloudflare e Registro.br só saem como "Finalizado" quando o DNS
foi de fato feito por aqui.

**Consequências.** A pergunta "tentar de novo ou pular" some da etapa do
contato; fica só na troca de nameservers, onde pular tem consequência real. O
lote já se comportava assim ("sigo para o painel") e não muda.

---

## ADR-084 — Site que redireciona para www: o Hub segue, e a propriedade é o destino

**Status:** aceita (corrige a conferência da ADR-039)

**Contexto.** Uma publicação em massa terminou em "A verificação por Google
Analytics não vai passar: o site respondeu 301". O site estava no ar; a raiz
`https://dominio/` respondia um redirecionamento permanente para
`https://www.dominio/`, e a conferência do Hub, que baixa o começo da página
para achar a tag do Google antes de chamar a API, não seguia redirecionamento.
Ela lia o 301 como "site fora do ar", recusava a verificação, e o vínculo
inteiro do site era dado como falho.

**Decisão.**

1. **A conferência segue redirecionamentos** (301, 302, 303, 307, 308), até
   cinco, enquanto o destino for o mesmo site: o próprio host ou a variante
   com/sem `www`. Destino em outro domínio não é seguido, e o erro diz para
   onde o site mandou.
2. **O destino vira a propriedade.** Se a raiz manda para o `www`, a tag, a
   verificação, o registro no Search Console, o sitemap e o endereço do
   relatório no painel passam a usar `https://www.dominio/`, que é onde o site
   está. O terminal avisa, e o resultado devolve o endereço pedido e o adotado.
3. **Recusa continua sendo recusa** quando o destino não tem a tag ou não
   responde 200: o que muda é que o motivo agora é o de verdade.

**Consequências.** Site com redirecionamento para `www` deixa de derrubar o
vínculo. A propriedade com `www` é a que o Google aceita para esse site;
quem procurar `https://dominio/` no Search Console vai achar a versão `www`,
e o terminal diz isso na hora.

---

## ADR-085 — Raiz e www só ficam com o que a proposta pede; IP do proxy não é IP antigo

**Status:** aceita (completa a ADR-071 e a ADR-076)

**Contexto.** `srengenharia.seg.br` já estava atrás do proxy da Cloudflare em
outra conta: a raiz tinha dois A (`104.21.x`, `172.67.x`, IPs do proxy) e um
AAAA; o `www` tinha um A e dois AAAA, todos do proxy. A aplicação trocou um A
da raiz e deixou o outro como "sem mexer"; tentou transformar o A do `www` em
CNAME e a Cloudflare recusou (81053), porque os AAAA do `www` continuavam lá.
E o "IP antigo" escolhido foi `172.67.173.226`, que é o proxy, não o servidor
do cliente. Além do erro, havia a consequência que o Guilherme apontou: com
AAAA na raiz ou no `www`, o painel não emite o SSL.

**Decisão.**

1. **Raiz e `www` só ficam com o que a proposta pede.** Na raiz, o A para o
   servidor novo; no `www`, o CNAME para a raiz. Todo AAAA e todo A a mais nos
   dois nomes entra em `remover`, sempre, venha de scan, de fotografia ou de
   zona antiga.
2. **Remoções que conflitam por nome saem antes.** A/AAAA/CNAME em nome onde a
   proposta tem A/AAAA/CNAME são apagados antes dos PUT/POST; o resto (MX
   antigo) continua saindo depois de o substituto existir.
3. **IP do proxy da Cloudflare não é IP antigo.** As faixas públicas do proxy
   estão em `lib/zona.js`; um A da raiz nelas é descartado como referência, com
   aviso de que o servidor real está escondido e o e-mail precisa ser conferido
   à mão. Sem IP antigo, CNAME e MX para a raiz não são "preservados" para um
   endereço errado; ficam avisados.

**Consequências.** O caso virou teste (`srengenharia` em `test-zona.js`). Sites
que já estavam na Cloudflare de outra conta passam a ser tratados como o que
são: zona que se reescreve a partir do que se vê, com aviso honesto sobre o que
não se vê. A confirmação antes de aplicar continua sendo o lugar de ler esses
avisos.

---

## ADR-086 — Salesforce pelo aplicativo conectado que já existe, não pela tela

**Status:** aceita

**Contexto.** A integração com o Salesforce nasceu com o pior cenário
possível: o time de lá não cria aplicativo conectado para nós. O caminho
padrão (Connected App próprio, OAuth, API REST) estava fechado, e o que sobrava
parecia ser dirigir o Lightning por dentro, que é a técnica do painel MPI+ e do
Registro.br. Lightning é um alvo muito pior que aqueles dois: tela montada
dinamicamente, que muda três vezes por ano.

Antes de aceitar isso, quatro medições, todas na sessão logada do Guilherme:

1. `GET /services/data/v61.0/query` no domínio `my.salesforce.com`:
   `INVALID_SESSION_ID`. Não é `API_DISABLED_FOR_ORG`, ou seja, **a API está
   ligada na organização**; o que ela recusou foi a forma de autenticar.
2. O mesmo no domínio `lightning.force.com`, digitado na barra: mesmo erro.
3. O mesmo por `fetch` de dentro de uma página já carregada, mesma origem:
   401. Autenticação por cookie de sessão está desligada, e isso é decisão
   deles, não acaso. Morre aí a ideia de usar a sessão do navegador.
4. O aplicativo conectado que a própria Salesforce distribui com a ferramenta
   de linha de comando (`client_id=PlatformCLI`, retorno em
   `http://localhost:1717/OauthRedirect`) existe em toda organização e **não
   está bloqueado na deles**: a tela de autorização apareceu e devolveu um
   código.

**Decisão.**

1. **OAuth de verdade, pelo aplicativo da linha de comando da Salesforce.**
   Código de autorização com PKCE e retorno em loopback, o mesmo desenho do
   login do Google (ADR-013) e do Microsoft (ADR-023). Token criptografado no
   `safeStorage`; o refresh do Salesforce não expira por tempo, só se for
   revogado. Sessão vencida renova sozinha e a operação é repetida **uma** vez.
2. **A porta 1717 não é escolha nossa.** É o retorno que aquele aplicativo
   aceita. Porta ocupada vira erro que diz o motivo (a ferramenta deles rodando
   junto), em vez de um login que se perde.
3. **O preço, dito em voz alta:** o histórico de login do Salesforce registra
   "Salesforce CLI" como o aplicativo, não "Hub". Está no README e foi dito ao
   Guilherme antes de construir. Não é elevação de privilégio: ele entra com a
   conta dele, consente, e faz pela API o que já pode fazer pela tela.
4. **Marcação no feed é segmento, não texto.** `@Fulano` escrito no corpo vira
   texto e não notifica ninguém. A marcação de verdade é
   `messageSegments: [{type:'Mention', id}]` na API do Chatter. O teste garante
   que nenhum `@` é escrito no corpo.
5. **Senha de tarefa não entra no terminal.** O campo Comentários das tarefas
   de publicação tem login e senha de hospedagem em texto puro. `mascararSegredos`
   troca o valor por asteriscos antes de qualquer `push` no log, porque o
   terminal do Hub guarda o que imprime.
6. **O que o código não sabe, ele pergunta.** Um handler de diagnóstico lê o
   `describe` da Tarefa, a tabela `TaskStatus` (que diz qual valor significa
   concluída pelo `IsClosed`, em vez de "Concluído" escrito à mão), os tipos de
   registro, os campos próprios e as filas de Deploy. É a mesma disciplina da
   ADR-071 e da ADR-080.

**Consequências.** A integração fica em API documentada, testável com rede
simulada (`tools/test-salesforce.js`), e não quebra quando a Salesforce
redesenha a tela. Se um dia o administrador bloquear o aplicativo da linha de
comando, o login para de funcionar com erro claro, e aí a conversa volta a ser
pedir um aplicativo conectado próprio, que continua sendo o certo.

---

## ADR-087 — O lote não republica, e não refaz vínculo que já está feito

**Status:** aceita (ajusta a ADR-065)

**Contexto.** Com 76 sites na fila, o botão do "Publicar em massa" dizia
"Publicar e vincular 27 site(s)" mesmo depois de a conferência mostrar que só 5
faltavam publicar. E, para os já publicados, a rodada seguia procurando tudo no
Google e reescrevendo o painel, mesmo quando o vínculo já estava lá: minutos
por site, multiplicados por dezenas.

**Decisão.**

1. **O botão conta o que vai acontecer.** Depois da conferência ele passa a
   dizer "Publicar 5 e conferir 22 site(s)". Só sai da fila quem já terminou
   bem nesta sessão, e há um jeito explícito de trazer todos de volta.
2. **Quem já está publicado não é republicado** (isso a ADR-065 já garantia
   pelo teste do painel) **e agora também não é revinculado à toa**: antes de
   qualquer chamada ao Google, o Hub abre o painel e lê o que já está
   preenchido nas Integrações e o trilho do Relatório. Estando tudo lá, a linha
   termina como feita, sem gastar uma chamada sequer.
3. **Ler não é escrever.** A etapa `conferir` do `painel:sync` só lê. E "não
   consegui ler o relatório" nunca é tratado como "está pronto": na dúvida, ele
   sincroniza, que é o lado seguro do erro.

**Consequências.** Uma rodada de 76 sites em que a maioria já está publicada e
vinculada passa a custar uma leitura de painel por site, em vez de uma busca no
Google e quatro escritas. O risco assumido é confiar no que o painel mostra
preenchido: se alguém colocou lá um valor errado à mão, o Hub não corrige
sozinho, porque ele não tem como saber que está errado sem refazer tudo, que é
exatamente o que esta decisão evita.

---

## ADR-088 — Uma instância por pasta de dados

**Status:** aceita

**Contexto.** Pergunta do Guilherme: dá para abrir dois Hubs, um rodando o
Publicar em massa e outro o Publicar MPI+? Tecnicamente abria, porque o app
nunca pediu trava de instância. Só que duas cópias no mesmo perfil do Windows
dividem coisas que não suportam dois donos: o `hub-state.json`, os tokens
criptografados, a sessão de navegador em disco que o painel MPI+ e o
Registro.br usam, e a porta 1717, que é a única que o login do Salesforce
aceita. O resultado não seria lentidão, seria configuração sobrescrita e
sessão corrompida, e ainda por cima de forma silenciosa.

**Decisão.** `requestSingleInstanceLock()`: a segunda abertura traz para a
frente a janela que já existe, em vez de abrir uma cópia que atrapalha a
primeira. A trava do Electron é **por pasta de dados**, e isso é a parte boa:
quem precisar mesmo de duas rodando ao mesmo tempo abre a segunda com
`--user-data-dir` apontando para outra pasta, e as duas convivem, cada uma com
a sua configuração e a sua sessão. Nada é proibido, só deixa de acontecer por
acidente.

**Consequências.** Rodar dois fluxos ao mesmo tempo continua não sendo o
desenho do app dentro de uma instância só: os dois disputariam a mesma janela
oculta do painel (ADR-072) e o mesmo terminal. Quem quiser paralelismo de
verdade paga o preço de configurar um segundo perfil.

---

## ADR-089 — Fechar a tarefa do Salesforce: ler a tarefa real antes de escrever a etapa

**Status:** aceita (o teste isolado de fechamento está no ar; a etapa dentro do fluxo do Publicar MPI+ e a criação em massa vêm depois de o Guilherme rodar o teste)

**Contexto.** Com a conexão de pé (ADR-086), o "Conferir a conexão" leu a
organização e respondeu: concluída é o Status `Completed` (`IsClosed=true`); a
Tarefa tem só o tipo "Mestre"; as filas de Deploy são três, não duas (Busca
Cliente, MPI Solutions e **Ideal Marketing**).

Sobre o campo `Atualiza_o_Autom_tica__c` ("Atualização Automática"): a linha
"Campos próprios" do diagnóstico o marcava como OBRIGATÓRIO só porque é
`createable && !nillable`. Estava errado — ele é `defaultedOnCreate`, ou seja,
o Salesforce preenche sozinho na criação. A linha "Obrigatórios na criação",
que já descontava os `defaultedOnCreate`, dizia a verdade: **só o Assunto é
obrigatório** para criar uma Tarefa. O rótulo cosmético foi removido para não
assustar; a criação em massa não precisa preencher esse campo.

Faltava o que decide o comentário: onde vive o item "Tarefa criada". A tarefa
real de exemplo (`srengenharia.seg.br`, `00TbL00000ehh7YUAQ`, Caso `00085209`,
criada por **Julia Rocha**) mostrou a linha "Tarefa criada"
(`CreateRecordEvent`, rel = o Id da tarefa) tanto no feed da tarefa quanto no
feed do Caso. O primeiro palpite foi comentar no feed da própria tarefa.

**O teste derrubou esse palpite.** Fechar a `dufertubos.com.br`
(`00TbL00000epxWuUAI`, criada por Lucas Vieira) assumiu e concluiu sem
problema, mas o `POST` no feed da tarefa devolveu
`400 INVALID_FIELD: Task is not enabled for feeds`: **a Tarefa não tem feed
habilitado nesta org**. Ler o feed da tarefa até funciona (o endpoint agrega o
`CreateRecordEvent`), mas escrever não. Quem tem feed de verdade é o **Caso** —
os 13 itens do exemplo (e-mails, `ContentPost`, `ChangeStatusPost`) são todos
dele. É por isso que os prints do Guilherme mostravam o comentário no Caso.

**Decisão.**

1. **O comentário vai no feed do Caso, marcando o criador** (`CreatedById`). De
   preferência **embaixo da linha "Tarefa criada" desta tarefa** — acho no feed
   do caso o `CreateRecordEvent` com `relatedRecordId` = o Id da tarefa e
   comento nele (`comentarMarcando`), para o aviso ficar colado na tarefa. Se
   não achar a linha ou o Salesforce não deixar comentar nela, posto um
   `FeedItem` novo no feed do caso (`postarNoFeed`, `subjectId` = o caso) com o
   assunto no texto. Postar no feed da tarefa saiu de cena: a org não permite.
   Se o criador for você mesmo, comenta sem menção — marcar a si não avisa
   ninguém.
2. **O campo "Link da tarefa no Salesforce" entra no Publicar MPI+**, opcional.
   O fechamento assume a tarefa no nome de quem está logado (lido do
   `userinfo`, não fixo) e grava `Status = Completed` (resolvido em tempo de
   execução pela `TaskStatus.IsClosed`, não escrito no código).
3. **Teste isolado antes de ligar no fluxo.** Dois botões embaixo do campo do
   link, cada um roda um passo sozinho, sem publicar nada: "Assumir e concluir
   a tarefa" e "Comentar no feed (marca quem criou)". Separados de propósito —
   o do comentário é o único que cutuca colega, então roda só quando o
   Guilherme mandar, e não junto do assumir/concluir durante um teste.
4. **O feed de um registro se lê por `/chatter/feeds/record/{id}/feed-elements`.**
   A primeira tentativa usou `/chatter/feed-elements` sem termo de busca e o
   Salesforce respondeu 400 `MISSING_ARGUMENT: A search term is required`.
5. **A criação em massa fica para depois**, e não marca ninguém no feed — só o
   fechamento pelo Publicar MPI+ comenta. Ideal Marketing fica de fora: só
   Busca Cliente e MPI Solutions.

**Consequências.** O fechamento de tarefa existente sai primeiro, porque é o
que o Guilherme usa agora, e sai apontando para valores reais lidos da tarefa,
não chutados. A ligação dentro do fluxo (fechar sozinho ao fim da publicação)
só entra depois do teste isolado confirmar que assume, conclui e marca a pessoa
certa.

---

## ADR-090 — Criar a tarefa no caso certo pela coluna "Link do caso" da planilha

**Status:** aceita

**Contexto.** Além de fechar tarefa (ADR-089), o Guilherme precisa **registrar**
no Salesforce sites que já foram publicados — os da migração V1→V2, por exemplo:
mesmo assunto e domínio, mas é outra tarefa, e ela tem que nascer **dentro do
caso do cliente**, não solta (toda conta de cliente tem caso, e cada caso tem
suas tarefas). O "Publicar em massa" não mexia no Salesforce; por isso não criava
nada.

O que decide tudo é achar o caso certo de cada domínio. Adivinhar (procurar uma
tarefa antiga do domínio e usar o caso dela) funciona na maioria, mas erra quando
o domínio não tem tarefa antiga ou tem várias em casos diferentes — e criar
tarefa no caso errado é pior do que não criar. Conversando, ficou decidido que o
Guilherme põe o caso na mão: uma coluna nova na planilha com o **link do caso**.

**Decisão.**

1. **A planilha do Publicar em massa ganha a coluna opcional "Link do caso".**
   O detector reconhece pelo cabeçalho e pela cara do dado (link com `/r/Case/`
   ou Id que começa com `500`), e não a confunde com o link do painel (esse é do
   `idealplus`). Sem a coluna, ou com o Salesforce desconectado, a publicação
   corre igual e nenhuma tarefa é criada.
2. **Para cada linha com link do caso, o Hub cria uma Tarefa naquele caso**
   (`WhatId` = o caso), assunto `Publicação (Troca de DNS) - {domínio}`, o
   domínio no campo Comentários (Description), dona quem está logado, status
   concluída (resolvido pela `TaskStatus.IsClosed`), e **sem marcar ninguém no
   feed** — marcação é só no fechamento pelo Publicar MPI+ (ADR-089). Vale tanto
   para os recém-publicados quanto para os já publicados que entram na planilha
   só para registrar.
3. **O Id do caso sai do link recusando o que não for caso.** O `idDoLink` já
   pega o Id do caminho e ignora o segundo Id que vem no `ws=` (a conta); o
   `ehIdDeCaso` exige o prefixo `500`, então um link de tarefa (`00T`) ou de
   conta (`001`) colado nessa coluna é recusado com aviso, em vez de pendurar a
   tarefa no lugar errado.
4. **Criar tarefa no Salesforce nunca derruba a publicação.** É acessório: se o
   Salesforce falhar ou estiver desconectado, a linha segue publicada e o erro
   vira só um aviso. Quem sou eu e qual status é "concluída" são lidos uma vez e
   guardados na sessão, para 76 linhas não virarem 150 chamadas repetidas.

**Ajustes depois do primeiro uso.**

- O assunto passou a ser `Publicação V1 -> V2 - {domínio}`, para diferenciar a
  tarefa nova da que existia na V1. O padrão antigo que tinha vazado para o
  config de quem já usava se cura sozinho no `readSfConfig` (lista
  `SF_ASSUNTOS_ANTIGOS`), sem o Guilherme precisar mexer nas configurações.
- A tarefa nasce com `ActivityDate` = hoje, então fica datada do dia em que foi
  registrada.
- Não duplica: antes de criar, o Hub confere se já existe uma tarefa com aquele
  assunto naquele caso e, se existe, pula.
- **Sem botão: 100% automático no fim da rodada.** Depois de publicar todos os
  sites, o Publicar em massa cria sozinho a tarefa de cada linha que tenha link
  do caso — cobre os recém-publicados e os já publicados. Não cria para quem
  falhou na publicação (marcar como concluída uma tarefa de um site que não
  subiu seria mentira); esses saem num aviso. Se o Salesforce estiver
  desconectado, avisa e não cria nada.

**Consequências.** O Guilherme resolve os já publicados enchendo uma coluna a
mais na planilha e rodando o Publicar em massa como sempre; as tarefas nascem
sozinhas no fim, cada uma no caso certo porque foi ele quem apontou o caso, não
o Hub adivinhando. O fechamento com marcação continua sendo só do Publicar MPI+.

---

## ADR-091 — Não copiar para a nossa zona o subdomínio do cliente que está atrás do proxy da Cloudflare

**Status:** aceita

**Contexto.** Ontem um cliente subiu errado: o Hub pegou o IP do proxy da
Cloudflare, não o do apontamento real do cliente. A raiz já era tratada
(ADR-085): se o A da raiz cai numa faixa do proxy, o Hub avisa e não usa aquele
IP como "IP antigo". Mas a cópia dos **demais registros** tinha um buraco — o
`add(r, 'copiado')` genérico do `montarZonaProposta` copiava qualquer A/AAAA de
subdomínio como estava, inclusive um que apontava para o edge da Cloudflare
(`104.x`, `172.67.x`, `2606:4700::…`). Resultado: o subdomínio ia para a nossa
zona apontando para o proxy de outra conta, não para o servidor do cliente —
que, atrás do proxy, está escondido e não dá para descobrir de fora.

**Decisão.** Na cópia dos demais registros, um A ou AAAA cujo conteúdo é um IP
do proxy da Cloudflare **não é copiado**. Em vez disso, vai um aviso nomeando o
subdomínio e o IP, para o analista pegar o IP real do cliente e cadastrar à mão
se aquele subdomínio precisar continuar no ar. A detecção agora cobre IPv4
(faixas da ADR-085) e IPv6 (prefixos do proxy), porque um registro proxied tem
os dois e copiar só o AAAA deixaria o subdomínio resolvendo para o edge do mesmo
jeito.

**Consequências.** O Hub nunca mais leva o IP do proxy para a nossa zona: ou o
registro aponta para o servidor real do cliente e é copiado, ou está atrás do
proxy e vira aviso para conferência manual. É a mesma disciplina da raiz (ADR-085),
agora também nos subdomínios.

---

## ADR-092 — Chave do Google recusada e aba Publicação lenta não derrubam a rodada em massa

**Status:** aceita

**Contexto.** Numa rodada de 32 sites, dois problemas apareceram:

1. `invalid_grant: Invalid JWT Signature` em todo site que precisava do Google.
   É o Google recusando a chave da service account: a chave do arquivo
   configurado não existe mais no Google Cloud (revogada/apagada na troca das
   credenciais). O Hub tentava de novo a cada site, e pior, marcava a linha como
   **falhou** — inclusive sites que ele tinha acabado de publicar em produção
   (neuroclinicadepsicologia, ecorealambiental). Linha "falhou" não vai para a
   planilha e, pela ADR-090, não ganha tarefa no Salesforce: um site no ar
   ficava sem registro nenhum.
2. `o painel não expôs window.__mpiHubPubPublication; a aba Publicação mudou?`
   num site que já estava publicado (wselevadores). O script olhava o gancho
   uma vez só, logo no load, enquanto o botão logo abaixo era esperado por até
   20s. Página um pouco mais lenta = falha na hora, com uma pergunta que não
   ajudava.

**Decisão.**

1. **Erro de chave vira instrução.** `diagnosticoChaveSa` reconhece o
   `invalid_grant` do JWT da service account (também quando o motivo vem no
   corpo da resposta) e diz o que fazer: gerar chave nova, salvar fora da pasta
   do projeto, apontar nas configurações. "Invalid JWT" sem "Signature" aponta
   para o relógio do Windows. Login OAuth revogado não tem "JWT" e não cai aqui.
2. **Na rodada em massa, a primeira recusa da chave desliga o Google até o
   fim da rodada**, porque a chave é a mesma para todos. Publicação, DNS,
   planilha e Salesforce seguem.
3. **Publicado é publicado.** Quando `publicarSeNecessario` volta sem erro, a
   linha fica marcada como publicada. Daí em diante, falha no Google, falta de
   Measurement ID ou painel que não aceita o vínculo deixam a linha **parcial**,
   não falha: vai para a planilha, ganha a tarefa no Salesforce no fim, e volta
   para a fila na próxima rodada só para refazer o vínculo.
4. **A tarefa do Salesforce passa a depender de "publicado"**, não de "não
   falhou". Linha que não entrou na rodada ou em que não deu para confirmar a
   publicação sai num aviso, sem tarefa.
5. **A aba Publicação é esperada** (até 20s, como o botão) e, se ainda assim
   não carregar, a etapa de conferir o estado recarrega a página do zero uma vez
   antes de dar o site como falho.

**Consequências.** Chave vencida vira um aviso só e uma rodada que termina com
todos os sites publicados registrados; o vínculo é refeito numa segunda rodada
depois da chave nova, sem republicar nada. Página lenta do painel deixa de
derrubar site já publicado.

---

## ADR-093 — 403 do Salesforce pede reconexão, e as tarefas que não saíram ficam pendentes

**Status:** aceita

**Contexto.** No fim de uma rodada, as 17 tarefas do Salesforce falharam com
`GET /services/oauth2/userinfo respondeu 403`. Não era sessão expirada (essa
volta 401 e o Hub renova sozinho): o token guardado tinha deixado de valer, e
desconectar e conectar de novo resolveu. O Hub não reconhecia o 403 como
problema de sessão, repetia o mesmo erro linha a linha e a lista se perdia:
para criar as tarefas, só rodando a publicação inteira de novo.

**Decisão.**

1. **403 (ou sessão que não renovou) vira "reconecte o Salesforce".** O
   handler limpa o cache da sessão e devolve `precisaReconectar`, com a
   instrução de desconectar e conectar nas configurações. Vale para criar e
   para fechar tarefa.
2. **O laço para no primeiro 403**, porque o token é o mesmo para todas. A
   linha que tomou o 403 e as seguintes ficam **pendentes**, marcadas na lista.
3. **Falha que se resolve tentando de novo (rede, sessão) fica pendente; link
   do caso errado não fica**, porque tentar de novo não muda nada até a
   planilha ser corrigida e carregada outra vez.
4. **Ação "Criar as N tarefas pendentes"**, que só aparece quando sobrou alguma:
   cria só essas, sem refazer a rodada. A criação normal continua automática no
   fim da publicação (ADR-090). Como o main não duplica tarefa no mesmo caso,
   repetir é seguro. Planilha nova zera a lista.

**Consequências.** Token vencido vira um aviso só e um clique depois de
reconectar, em vez de 17 erros e uma rodada inteira de novo.

---

## ADR-094 — Rodada em massa não pode travar com a tela bloqueada

**Status:** aceita — o ponto 1 na janela principal foi substituído pela ADR-126: ela só deixa de desacelerar enquanto algo roda (rodada, automação, publicação); as janelas ocultas continuam como aqui

**Contexto.** O Publicar em massa às vezes parava e não avançava mais —
principalmente com a tela do Windows bloqueada, e depois de alguns sites. No
log, a última linha era o cabeçalho de um site e nem a primeira etapa (abrir o
Registro.br) aparecia: as mensagens de cada etapa só chegam quando ela termina,
então ele estava preso dentro dela. Duas causas somadas:

1. As janelas ocultas (painel e Registro.br) e a própria janela do Hub rodavam
   com o *background throttling* do Chromium ligado. Janela oculta com a tela
   bloqueada tem os timers segurados ou a página congelada, e os scripts do Hub
   esperam elementos com timers.
2. `rodarNoPainel` (o único ponto que roda script nessas janelas) não tinha
   prazo. Página congelada = promessa que nunca volta = rodada parada para
   sempre, sem erro nenhum.

**Decisão.**

1. `backgroundThrottling: false` na janela principal e nas duas ocultas.
2. `rodarNoPainel` com prazo de 3 minutos (o script mais longo espera 90s de
   propósito). Passou, a janela é fechada e a etapa falha com motivo; o site
   segue as regras normais (falhou ou parcial) e a rodada vai para o próximo.
3. Chamadas ao Google com prazo de 60s por requisição, pelo mesmo motivo.
4. Durante a rodada, `powerSaveBlocker('prevent-app-suspension')`: o Windows
   não suspende o app no meio. A tela continua bloqueando normalmente.

**Consequências.** Bloquear a tela no meio de uma rodada deixa de parar o Hub.
Se uma página travar mesmo assim, o pior caso é perder aquele site por 3
minutos, não a rodada inteira.

---

## ADR-095 — Procurar o domínio nas duas abas antes de perguntar a empresa

**Status:** aceita

**Contexto.** Quando o contato técnico no Registro.br não é nosso, o Registro.br
não diz de qual empresa é o site, e o Publicar em massa perguntava ("De qual
empresa é X?") para decidir a aba da planilha. Rodando de novo uma planilha de
sites já publicados, ele perguntava de novo para cada um desses — mesmo com
todos já registrados na planilha — e a rodada ficava parada esperando resposta.
Quem deixa a rodada correndo e vai embora volta e encontra ela no 2º site.

**Decisão.** Antes de perguntar, o Hub procura o domínio nas duas abas (MPI e
Busca Cliente) pelo `planilha:procurar`, só leitura. Achou: usa a aba de onde
ele está, não pergunta e não escreve de novo. Não achou em nenhuma: pergunta
como antes. A busca falhou (Graph fora, sessão da Microsoft): pergunta, em vez
de chutar a aba. Quando a empresa já é conhecida pelo contato técnico, nem
procura.

**Consequências.** Rodar de novo uma planilha de já publicados anda sozinho do
começo ao fim. A única parada que continua existindo é a confirmação do DNS de
quem precisa trocar IP, que é de propósito (ADR-072).

---

## ADR-096 — Log em arquivo e rodada em massa que sobrevive ao Windows fechar tudo

**Status:** aceita

**Contexto.** O Guilherme deixa o Publicar em massa rodando e vai embora. De
madrugada o Windows reinicia ou encerra a sessão (atualização, política da TI)
e fecha todos os programas, o Hub junto. O log e o progresso da rodada existiam
só na memória: de manhã não havia nem registro do que aconteceu, e as tarefas do
Salesforce — que saem no fim da rodada — nunca eram criadas. O Hub não tem como
impedir o Windows de reiniciar; o que ele pode é não perder nada quando isso
acontece.

**Decisão.**

1. **Todo log vai também para um arquivo**, um por dia, em
   `Documentos\Hub\logs\hub-AAAA-MM-DD.txt`. As linhas são juntadas por meio
   segundo antes de gravar. Botão "Abrir pasta de logs" no Publicar em massa.
2. **A rodada é salva em disco antes de cada site** (`rodada-em-massa.json` na
   pasta de dados do Hub): a planilha crua, o mapa de colunas, a marca e o
   estado de cada site (terminou, publicado, empresa), mais as listas do fim
   (SSL pendente, fora de casa, tarefas pendentes). Escrita atômica (grava num
   temporário e troca), para um desligamento no meio da gravação não deixar um
   arquivo pela metade.
3. **Ao abrir o Hub, se há rodada que não terminou, o terminal avisa, e o
   Publicar em massa mostra "Retomar de onde parou" / "Descartar".** Retomar
   remonta a lista como estava: quem terminou fica de fora da fila, quem estava
   rodando volta para ela, e a empresa já descoberta volta junto (não pergunta
   de novo). No fim, as tarefas do Salesforce saem para todos os publicados,
   inclusive os de antes do reinício, sem duplicar (ADR-090).
4. **Rodada que termina apaga o arquivo**; se sobraram tarefas pendentes do
   Salesforce, ele fica, e o botão das pendentes volta depois de um reinício.

**Consequências.** O Windows fechar o Hub no meio da noite custa só o tempo de
abrir de novo e clicar em Retomar. O Hub não abre sozinho depois do reinício nem
retoma sem alguém clicar: a rodada pode ter parada de DNS, e retomar sozinho
mexeria em produção sem ninguém olhando.

---

## ADR-097 — Achar o caso da tarefa V1 -> V2 pelo padrão, sem colar link

**Status:** aceita (a criação sozinha só depois do Guilherme validar a conferência)

**Contexto.** A ADR-090 pedia a coluna "Link do caso" em toda linha, porque
adivinhar o caso era arriscado. Na prática, colar 30 links à mão é o gargalo.
O Guilherme apontou dois padrões na org: toda publicação tem uma tarefa antiga
de "Publicação (troca de DNS)" pendurada no caso certo — mas as antigas não têm
o domínio no assunto, só nos comentários —, e todo cliente tem um caso cujo
assunto começa com "Ongoing CS" ("Ongoing CS - BC - <razão social>"), em geral
no status "Reunião de Nutrição", numa conta com a razão social exata como nome.
Existe também "Ongoing Growth", que não serve.

O campo Comentários (Description) da tarefa é texto longo, e o SOQL não deixa
filtrar texto longo. A busca global (SOSL), a mesma da barra de pesquisa do
Salesforce, procura nele.

**Decisão.**

A primeira conferência real (5 sites) mostrou que a tarefa antiga acerta o
cliente, mas o caso dela é o de implantação ("MPI+", "IMPLEMENTAÇÃO MPI
SOLUTIONS - …"), já fechado; as tarefas novas da operação vivem no Ongoing CS.

1. **A tarefa antiga dá a conta.** SOSL pelo domínio nas tarefas; ficam só as
   de assunto "Publicação…" penduradas num caso e que citam o domínio de
   verdade no assunto ou nos comentários (a SOSL é aproximada: `textoTemDominio`
   recusa "outrodominio.com.br" e "dominio.com.brasil"). A conta desses casos é
   a do cliente; se forem duas contas, a razão social desempata.
2. **Sem tarefa antiga, a conta pela razão social**: o nome exato primeiro;
   não havendo, uma busca pelo nome sem o tipo societário, ficando com a conta
   cujo nome, sem sufixo ("LTDA", "- ME", "EPP", "EIRELI"…) e sem acento, é o
   mesmo da planilha (ADIFER: a conta é "… LTDA - ME" e a tarefa antiga cita o
   domínio escrito errado, "adifertampeos"). Duas contas com o mesmo nome base,
   ou só nomes parecidos com outra palavra, não servem: o motivo mostra quais.
3. **O caso é o da operação: o ABERTO do tipo de registro "Ongoing CS".** O
   assunto não entra (às vezes vem vazio: LMARQUES, 00085674) e o status
   também não: ele anda com o cliente (TURBO GERAIS, 00087546, estava em
   "Kickoff/Selling Class" e a versão que exigia "Reunião de Nutrição" caiu no
   caso de implantação fechado). Com mais de um Ongoing CS aberto, o status
   "Reunião de Nutrição" desempata (valor lido da configuração do Caso, com o
   rótulo de reserva). Org sem tipo de registro no Caso: a consulta repete sem
   o campo e vale assunto "Ongoing CS" ou o status, fora o Ongoing Growth.
4. **Sem esse caso (ou com dois em dúvida), vai no caso da publicação
   antiga**, o mais recente, mesmo fechado: registrar o que foi feito vale mais
   que não registrar. O log diz que foi o plano B e por quê.
5. **Nada disso dando um caso, não cria**, e a linha sai no resumo do fim com o
   motivo (só acontece sem tarefa antiga, pela razão social). Tentar de novo
   não muda nada, então não vira pendente (ADR-093).
6. **O "Link do caso" continua mandando** quando preenchido.
7. **Opção lembrada** no Publicar em massa, desligada por padrão, para uma
   publicação comum não ganhar tarefa "V1 -> V2" sem querer.
8. **"Conferir os casos no Salesforce"**, só leitura: para cada linha diz qual
   caso usaria, como achou e se a tarefa já está lá. É o passo de validação
   antes de deixar criar sozinho, como foi com o fechamento de tarefa.

**Consequências.** A planilha volta a precisar só de razão social, domínio e
link do painel. Os poucos que o padrão não resolver aparecem nomeados, e só
esses pedem o link à mão.

---

## ADR-098 — Achar o link do painel pela razão social, confirmado pelo temporário

**Contexto.** Cada linha do Publicar em massa precisava do link do painel colado
na planilha. O painel dá para achar pela razão social, mas um cliente pode ter
vários projetos (um por site) e cada projeto seus contratos; escolher "o
primeiro" publicaria o site errado.

**Mapeamento (23/09/2026, só leitura, no painel logado).** A busca
`GET /clientes?busca=` acha pela razão social mesmo quando o nome do cliente é
outro ("confeccoeshp" ← "HP - CONFECCOES HUMBERTO PASCUINI LTDA"); por domínio
não acha. `/clientes/<c>` lista os projetos (`<h3>` com o nome, quase sempre o
domínio). `/clientes/<c>/hub?projeto=<p>` traz os cartões dos contratos
(`…&contrato=<k>`), mas é pesada (2 MB, ~20 s até o primeiro byte), então só o
começo é lido. `/clientes/<c>/projetos/<p>/contratos/<k>/wordpress-full-install/status`
devolve JSON com `wordpress_temporary_url`, que é o link do alto da aba
Publicação (`root.wordpressTemporaryUrl`). Detalhes em `lib/painel-achar.js`.

**Decisão.**

1. **Coluna nova "Link temporário"** (reconhecida pelo cabeçalho ou por
   terminar em `mpitemporario.com.br`; não é confundida com o domínio).
2. **Linha sem link do painel, com razão social, entra na rodada.** No começo
   do site, antes do DNS, o Hub busca a razão social, abre os projetos (os que
   têm o domínio no nome primeiro) e fica com o contrato cujo temporário é o da
   planilha. Achou, para de procurar.
3. **Sem temporário na planilha, só segue com um cliente e um contrato**, e
   avisa que não conferiu. Com mais de um, a linha falha listando os contratos
   e os temporários que viu, para preencher a coluna.
4. **Com link do painel e temporário, confere**: abre o link e compara o
   temporário do contrato aberto. Diferente, para sem mexer em nada.
5. **A publicação confere de novo** o temporário na leitura de estado que já
   fazia, antes de aprovar.
6. O link achado é guardado no arquivo da rodada: retomando, não procura de novo.
7. **O Publicar MPI+ faz o mesmo** antes da primeira etapa: campo "Link
   temporário", e o campo do link do painel saiu da tela. Não achando o
   contrato, o Hub pede o link no terminal (campo de texto na própria
   pergunta), confere pelo temporário e segue por ele; link de outro contrato
   é recusado e ele pede de novo; cancelar não começa nada. Trocar a razão
   social, o temporário ou o domínio descarta o link achado. E ganhou a última etapa, "Fechar a
   tarefa no Salesforce" (ADR-089): com o link da tarefa, assume, conclui e
   comenta "Site publicado" embaixo da "Tarefa criada" no caso, marcando quem
   criou. Sem link, pula; falhando (403, por exemplo), pergunta se tenta de
   novo ou pula, porque o site já está publicado.

**Consequências.** A planilha pode ter só razão social, domínio e link
temporário. Cada site procurado custa ~20 s por projeto aberto, uma vez. Tudo
é GET; o Hub não clica nem grava nada no painel para achar o contrato.

## ADR-099 — invalid_grant na sessão da conta da marca não é API desabilitada

**Contexto.** O Search Console é registrado e o sitemap é enviado com a sessão
OAuth da conta da marca (bcrelatoriotags@gmail.com, ADR-049). Quando o Google
recusa essa sessão, as três chamadas caem com `invalid_grant` e o log mandava
"habilitar a Google Search Console API", que já estava ativada. `invalid_grant`
aqui é o refresh token guardado não valer mais: revogado, senha trocada, ou o
app OAuth em modo "Teste" na Tela de consentimento, que derruba o token a cada
7 dias. API desabilitada é outro erro (SERVICE_DISABLED).

**Decisão.** Na primeira recusa, o Hub diz que é o login da conta, explica o
modo "Teste", apaga o token morto (Configurações passa a mostrar a conta
desconectada) e refaz a etapa pela service account, que já é dona do site.
A dica da API só aparece quando o erro é mesmo de API desabilitada.

**Consequências.** O sitemap não se perde por causa da sessão. A propriedade
registrada pela service account continua sem aparecer sozinha na conta da
marca até reconectar (limitação da ADR-049).

## ADR-100 — Search Console depois do SSL de produção

**Contexto.** No Publicar MPI+ as tags podem rodar antes do SSL (quando o SSL
fica para depois da propagação, ou é pulado). A verificação do Search Console
abria `https://dominio/`, o servidor respondia com o certificado dele
(`srv-wp-02.idealplus.idealtrends.io`), e a etapa falhava depois de quatro
esperas com "Sincronize as integrações no painel e publique o site": errado,
as integrações estavam no painel. A publicação parava ali, sem planilha e sem
fechar a tarefa.

**Decisão.** Erro de certificado na página não é retentado: vira "SSL de
produção não está ativo", com o nome do certificado que o servidor mandou. No
Publicar MPI+, com o SSL ainda não ativo, a etapa das tags põe as integrações
no painel e deixa o Search Console e o relatório para depois; quando a etapa
do SSL termina bem, eles rodam sozinhos. Se o SSL não sair, o fim da
publicação avisa para ativar o SSL e usar "Sincronizar no painel".

## ADR-101 — O SSL está ativo quando o certificado do domínio está no ar

**Contexto.** Ativar o SSL de produção no painel (`activateProductionSsl`)
quase sempre responde erro, 504 Gateway Timeout ou outro, e ativa mesmo
assim. O Hub acreditava na resposta: dava o SSL como não ativado, seguia, e a
verificação do Search Console caía no certificado do servidor
(`srv-wp-02.idealplus.idealtrends.io`). E a tarefa do Salesforce podia fechar
com o SSL e o Search Console pendentes.

**Decisão.**

1. **Quem decide é o certificado.** Antes de pedir, o Hub abre TLS na porta
   443 do domínio (com o nome do domínio no SNI): se o certificado já é dele e
   é confiável, o SSL já estava ativo e o painel nem é chamado. Depois do
   pedido, com ou sem erro do painel (o HTML do 504 vira só o título), confere
   a cada 15 s por até 5 min. Apareceu: SSL ativo, "o erro do painel foi só na
   resposta". Não apareceu: falha dizendo de quem é o certificado que o
   domínio entrega.
2. **A tarefa só fecha com tudo concluído.** Com o SSL esperando a
   propagação, a etapa do Salesforce fica para depois dele e roda sozinha no
   fim. Com o SSL ou o Search Console pendentes, ela tenta de novo o que falta
   (o SSL, se o domínio já aponta; depois o Search Console e o relatório) e
   só então fecha; se ainda faltar, falha dizendo o quê, e "Tentar de novo"
   repete a tentativa.

## ADR-102 — Parar no meio

**Contexto.** Com um dado errado na tela (domínio, razão social, link), a
única saída era fechar o app. O Publicar em massa só tinha "Parar depois
deste site".

**Decisão.** Botão "Parar agora" no Publicar MPI+ e no Publicar em massa. A
tela avisa o processo principal (`processo:parar`), que interrompe na hora
toda espera em andamento (`dormir`) e todo script na janela oculta do painel
(a janela é fechada: o estado dela deixou de ser confiável), e recusa as novas
até a tela terminar de parar (`processo:liberar`). As perguntas abertas no
terminal fecham, e as esperas da própria tela (propagação, SSL adiado) param.
Uma requisição que já saiu (um registro na Cloudflare, o PATCH de um campo)
termina: não se corta uma gravação no meio, corta-se o passo seguinte.

No Publicar MPI+, a etapa do meio fica "parado por você": "Continuar" retoma
dela, e "Descartar esta publicação" limpa a tela (sem desfazer o que já foi
feito). No Publicar em massa, o site do meio fica "parado por você", os
seguintes não começam, as tarefas do Salesforce não são criadas e a rodada
fica salva: "Retomar" continua dali e faz o fim.

**Consequência.** Um job que o painel já começou (a publicação em produção no
servidor, por exemplo) continua lá: parar interrompe o Hub esperando, não o
servidor.

## ADR-103 — Publicar outro site enquanto um espera a propagação

**Contexto.** Quando o Registro.br publica a troca de DNS só daqui a ~2 horas,
o Publicar MPI+ ficava esperando com a tela presa (ADR-080): não dava para
publicar outro site nesse tempo.

**Decisão.**

1. **O site sai da tela e vai para a lista "Aguardando a propagação"**, com o
   que falta: o SSL de produção, o Search Console e o relatório (quando
   ficaram para depois do SSL, ADR-100) e fechar a tarefa do Salesforce. As
   tags e a planilha já foram feitas antes. A tela volta vazia, com a mesma
   empresa, para o próximo site.
2. **Um vigia confere o DNS de todos a cada minuto.** Quando um aponta, ele
   termina esse site inteiro: SSL (pelo certificado, ADR-101), Search Console
   e relatório, e só então a tarefa. Com vários prontos, **um de cada vez,
   primeiro o de previsão mais cedo**. Enquanto o Publicar em massa roda, o
   vigia espera.
3. **O painel atende uma chamada por vez.** A janela oculta é uma só; um
   segundo site abrindo o painel fechava a janela do primeiro no meio. As
   chamadas `painel:publicar`, `painel:sync` e `painel:acharContrato` entram
   numa fila no processo principal.
4. **Não apontou até 30 min depois da previsão**: o site fica "falta algo",
   com "Tentar de novo" e "Remover" na lista. O mesmo quando o SSL, o Search
   Console ou a tarefa falham: nada é dado como feito sem estar.
5. **A lista sobrevive a fechar o app** (guardada na máquina, só com campos
   sem segredo: a chave secreta do reCAPTCHA não vai para o disco). Ao abrir,
   o vigia volta a conferir.

## ADR-104 — A espera do SSL olha o DNS público, e o vigia aparece no log

**Contexto.** Um site (climagemcarpina.com.br) ficou na lista "Aguardando a
propagação" (ADR-103) e o Hub não terminou depois da hora prevista, apesar de
o domínio já resolver para 149.18.102.39 em todos os resolvedores públicos (o
DNS Checker confirmou). Duas causas:

1. A conferência (`dns:apontando`) usava só o resolvedor da máquina, cujo cache
   ainda tinha o valor antigo. O mundo já via o IP novo; a máquina, não.
2. O vigia conferia calado. Sem nada no log, parecia que tinha parado.

**Decisão.**

1. **Conferir em local + públicos** (Google, Cloudflare, Quad9, OpenDNS) e
   considerar que aponta quando qualquer um vê o IP de produção; o log diz onde
   foi visto. É o SSL do servidor que segue o DNS público, não o cache local.
2. **O vigia fala**: aviso na primeira conferência, quando o motivo muda e a
   cada 10 min ("Aguardando X: … Confiro de novo em 1 min").
3. **Um erro numa espera não derruba o vigia** das outras: cada conferência é
   protegida, e a falha vira detalhe da linha, com nova tentativa no minuto
   seguinte.
4. O IP de produção passou a ter o mesmo padrão (149.18.102.39) na conferência,
   em vez de falhar calado quando o campo vinha vazio.

## ADR-105 — Ferramenta "Bloquear contatos" no /doutor

**Contexto.** Outra equipe do grupo bloqueia os contatos de um site pelo painel
`/doutor` (o telefone passa a aparecer como `##`). O script que eles usavam
testava uma LISTA de senhas em sequência até uma entrar — isso o Hub não faz.
Os painéis do grupo usam **uma senha só**, e o e-mail muda pela marca. Então a
automação aqui é do mesmo tipo que a do painel MPI+: uma credencial guardada,
login direto, sem adivinhar nada.

**Decisão.**

1. **Credencial em Configurações**, criptografada (safeStorage): uma senha e
   dois e-mails (MPI Solutions e Busca Cliente). O e-mail é escolhido pela
   marca; a senha é a mesma. Os e-mails são digitados pela equipe, o Hub não
   adivinha domínio. A senha nunca volta do processo; trocar só o e-mail pede
   a senha de novo.
2. **Ferramenta "Bloquear contatos"**: escolhe a marca, cola o domínio,
   confirma (guarda contra erro de digitação), e o Hub abre
   `https://<domínio>/doutor/` numa janela oculta, entra com a credencial da
   marca, acha a empresa do cliente (a linha que não é "Doutores da Web") e
   clica no cadeado se estiver verde (desbloqueado). Laranja (já bloqueado)
   não faz nada. A confirmação é lida pelo certificado do cadeado virar, não
   pela resposta.
3. **Correção sobre o script original**: este painel usa **SweetAlert2**
   (`.swal2-confirm`), não a v1 (`div.sweet-alert`/`button.confirm`) que o
   script deles esperava — com a v1 o modal de confirmação nunca aparecia.
4. **Entra na mesma fila do painel** (ADR-103): uma janela oculta por vez.

**A validar numa página real** (como foi com o painel MPI+): os seletores da
listagem e do cadeado foram lidos do `index.php`/`painel.php` de exemplo, mas o
clique e o modal precisam de uma execução de verdade para confirmar.

## ADR-106 — Medir antes de mexer: a suíte inteira, benchmark, CPU e memória

**Status:** aceita — desde 30/09/2026, teste que precisa de pasta em disco usa a sua, do `mkdtempSync` no %TEMP%, e a apaga no `exit`, mesmo que lance (o `tools/test-ssl-painel.js` apaga a dele logo depois de ler a chave TLS). Antes, cada `npm test` deixava uma `hub-tls-*` no %TEMP%, e 13 testes usavam pastas fixas em `C:\tmp`, quatro deles a mesma (`hub-test`)

**Contexto.** Pedido do Guilherme (25/09/2026): benchmark, eval, consumo de CPU
e de memória. Havia 27 testes em `tools/test-*.js`, cada um rodado à mão, e
nenhum número de desempenho: o PRD dizia só que a operação mais longa "leva
alguns segundos". Sem linha de base não dá para saber se uma mudança piorou
alguma coisa, nem onde está o gargalo. E quase tudo que o Hub faz é rede, cujo
tempo é do outro lado.

**Decisão.**

1. **`npm test` (`tools/rodar-testes.js`) é a eval.** Roda todos os
   `tools/test-*.js`, cada um no próprio processo (teste que troca
   `Module._load` ou chama `process.exit` não contamina o vizinho), resume por
   arquivo e sai com 1 se qualquer um falhar. O harness visual (ADR-012) fica à
   parte, porque depende do Playwright.
2. **`npm run bench` (`tools/bench.js`)** mede só o que roda na máquina:
   planilha (texto e .xlsx), reconhecer colunas, montar o lote, zona da
   Cloudflare, domínios. As funções são recortadas pelo mesmo marcador dos
   testes. Mede também o custo de carregar cada dependência, num processo novo
   a cada rodada. `--electron` roda no Node do Electron, que é o do app.
3. **`npm run medir` (`tools/medir-recursos.js`)** abre o Hub de verdade com
   `electron -r` e uma pasta de dados descartável (`--user-data-dir`, a saída
   da ADR-088). Documentos, Músicas e Downloads também vão para lá, e rede,
   área de transferência e `shell.openExternal` ficam bloqueados e contados:
   sem credencial e sem rede, nenhuma etapa alcança produção. Mede a abertura,
   o app parado, a navegação, o terminal cheio, o IPC e a planilha, por
   `app.getAppMetrics()` e pelo protocolo do DevTools. `--css` injeta um
   estilo para comparar antes e depois sem editar o app.
4. Duas armadilhas de medição ficam anotadas no código. O `percentCPUUsage` do
   Electron já vem dividido pelo número de núcleos (100% = a máquina, a mesma
   conta do Gerenciador de Tarefas; conferido contra o tempo de CPU). E o
   `HeapProfiler` do DevTools ligado o tempo todo deixa o layout ~40% mais
   lento com o terminal cheio, por isso ele só liga na hora do GC.

**Linha de base** (i5-10210U 4 núcleos/8 threads, 16 GB, Windows 11; Hub
1.0.36 com o código de 25/09/2026, 12:46):

| O quê | Medido |
| --- | --- |
| Suíte | 28 arquivos, 1.076 verificações, 0 falha, 17 s. Harness visual: 19 telas sem erro de console |
| Abertura até a tela inicial | 3,2 a 3,9 s com o perfil já usado (3,9 a 6,4 s com perfil novo). Só o `require('googleapis')`: 2,0 a 2,3 s e +57 MB de heap |
| Memória logo depois de abrir | ~425 MB de working set nos 4 processos (principal 170, GPU 120, janela 80, rede 55); ~265 MB de memória privada |
| Parado na tela inicial | 0,1% da máquina em 60 s, sem crescer memória |
| Abrir uma ferramenta | 13 a 18 ms (mediana), primeira vez até 0,2 s. Sem vazamento em 15 voltas: +5 KB de heap por volta, nós e listeners estáveis |
| IPC ida e volta | 1,4 ms (mediana), 1,7 ms (p99) |
| Planilha no Publicar em massa | 60 ms com 32 linhas; 0,8 s com 3.000 (1 s em .xlsx) |
| Terminal com 1.000 / 5.500 / 20.000 linhas | cada `log()` 93 ms / 490 ms / 1,6 s (sem o DevTools e com linhas mais curtas: 53 ms / 0,3 s / 1,3 s); a janela chega a 0,2 / 0,7 / 2,6 GB durante os `log()` |

**Consequências.**

- **O terminal é o gargalo, e a causa é CSS.** O `.layout` é um grid sem
  `grid-template-rows`: a linha implícita é `auto`, então cada linha nova no
  terminal obriga o Chromium a medir o terminal inteiro de novo, e o
  `scrollHeight` lido no `log()` força isso na hora. São ~55 a 80 µs por linha
  que já está lá, a cada `log()`, na mesma thread que roda a rodada em massa. O dia
  pesado de 23/09 teve 5.487 linhas no arquivo de log: nesse tamanho, cada
  linha nova custa de 0,3 a 0,5 s, conforme o comprimento das linhas. Medido
  pelo `--css`, com
  `.layout { grid-template-rows: minmax(0, 1fr); }`: 11 ms com 5.500 linhas e
  40 ms com 20.000 (40 vezes menos), e o pico de memória da rodada cai de
  3,0 GB para 0,8 GB. Não foi aplicado nesta mudança: mexe na tela, e havia
  outra frente editando `renderer/` ao mesmo tempo. Abrir ferramenta com o
  terminal cheio não é afetado (medido: 22 ms com 5.500 linhas, com e sem a
  correção).
- **Depois de "Limpar", a memória não volta inteira.** Com 20.000 linhas, a
  janela ficou com 1,5 GB de memória privada comprometida mesmo com o terminal
  limpo (323 MB com a correção). O Chromium guarda para reusar; para o Windows,
  continua ocupado.
- **A abertura é o `googleapis`.** A linha 7 do `main.js` carrega as 335 APIs
  do pacote para usar 6 (`tagmanager`, `analyticsadmin`, `siteVerification`,
  `searchconsole`, `recaptchaenterprise`, `oauth2`). Carregar só as 6 custa
  ~0,3 s e +3 a 5 MB de heap, contra 2,2 a 2,6 s e +50 a 61 MB. Não é troca de
  uma linha: `google.options({ auth })` é global no objeto do pacote, e cada
  API separada precisa receber a autenticação.
- O resto não pede nada. Parado não gasta CPU, IPC é ~1 ms, navegar não vaza, e
  o que é local na planilha e na zona fica em milissegundos (o pior caso, .xlsx
  de 3.000 linhas, 130 ms). O tempo das operações longas é o do outro lado
  (painel, Registro.br, Google, propagação), e o benchmark não mede isso de
  propósito.
- Limites: as janelas ocultas do painel e do Registro.br não entram, porque
  precisam de login. A medição roda na máquina de quem mede e varia com a carga
  dela: a abertura oscilou de 3,2 a 3,9 s entre rodadas iguais. Por isso a
  comparação que vale é antes e depois na mesma máquina, na mesma hora.

## ADR-107 — Só as 6 APIs do Google, carregadas no primeiro uso

**Status:** aceita

**Contexto.** A ADR-106 mediu que a linha 7 do `main.js`,
`require('googleapis')`, carregava as 335 APIs do pacote para o Hub usar 6:
2,2 s dos 3,5 s até a tela inicial e +55 MB de heap no processo principal, em
toda abertura, mesmo para quem só ia mergear PR. As saídas eram (a) carregar
só as 6 APIs, o que tira o custo de vez, ou (b) carregar o pacote inteiro no
primeiro uso, o que só adia: a primeira ação do Google de cada sessão pagaria
2 a 3 s, e a memória voltaria aos +50 MB depois dela. O Guilherme escolheu a
(a).

O ponto delicado era o `google.options()` global. A service account
(`buildGoogleAuthClient`) e o OAuth "global" (`loadUserOauthClient`) trocam a
autenticação de todos os clientes de uma vez, inclusive dos que já existem, e o
`options()` do pacote substitui as opções inteiras (o OAuth global derruba o
`timeout: 60000` da service account). Separadas, as APIs não enxergam nada
disso.

**Decisão.**

1. **`lib/google.js`** monta um `google` com a mesma cara do pacote:
   `google.auth.GoogleAuth`, `google.auth.OAuth2`, `google.options()` e uma
   função por API (`tagmanager`, `analyticsadmin`, `siteVerification`,
   `searchconsole`, `recaptchaenterprise`, `oauth2`). Cada API vem do próprio
   pacote, `googleapis/build/src/apis/<nome>`, e só no primeiro uso. No
   `main.js` muda só a linha do require; nenhuma chamada muda.
2. **O comportamento global é o mesmo por construção.** A função de cada API
   recebe esse objeto como contexto, e o googleapis-common lê
   `google._options` a cada requisição (`apirequest.js`). O `options()`
   substitui em vez de juntar, como o `GoogleApis.options()` do pacote. As
   classes de autenticação são as do próprio AuthPlus do googleapis: a mesma
   classe, não uma cópia.
3. **Nenhum pacote novo.** O `googleapis` continua em `dependencies`, e o
   pacote não tem campo `exports`, então o caminho interno é permitido. Os
   pacotes `@googleapis/<api>` fariam o mesmo por caminho público e deixariam o
   instalador menor, ao preço de 6 dependências novas; não foi preciso.
4. **`tools/test-google-leve.js`** roda o mesmo roteiro no pacote inteiro e no
   leve (service account com prazo, OAuth global trocando todos e tirando o
   prazo, cliente com autenticação própria) e exige as mesmas requisições, com
   a mesma autenticação e o mesmo prazo. Confere também que abrir o `main.js`
   não carrega nada do Google e que toda API que o `main.js` chama está na
   lista. Uma mutação de propósito (juntar as opções em vez de substituir) faz
   o teste falhar. Os 13 testes que trocavam o módulo `'googleapis'` por
   dublês passaram a trocar o `lib/google`.

**Consequências.** Medido antes e depois na mesma máquina, na mesma hora
(`npm run medir -- --so-abertura --aberturas 5` e
`npm run bench -- --electron`):

| | Antes | Depois |
| --- | --- | --- |
| Até a tela inicial, perfil já usado (mediana de 5) | 3,54 s (3,33 a 3,85) | 1,40 s (1,25 a 1,80) |
| Até a tela inicial, perfil novo | 4,73 s | 1,65 s |
| Topo do `main.js` | 2,20 s | 22 ms |
| Processo principal 3 s depois de abrir | 171 MB de working set, 55 MB de heap | 101 MB, 5,6 MB |
| Os 4 processos 3 s depois de abrir | 421 MB | 349 MB |
| Primeira ação do Google na sessão | nada a carregar | +0,35 s e +2,8 MB de heap |

- API nova no `main.js` precisa entrar na lista do `lib/google.js`; o teste
  falha dizendo qual falta.
- O caminho `googleapis/build/src/apis/<nome>` é interno ao pacote. Depois de
  atualizar o `googleapis`, `npm test` diz se ele mudou, antes do app.
- O instalador continua levando o `googleapis` inteiro; só a abertura deixou de
  pagar por ele.

## ADR-108 — A linha do grid tem a altura da tela, não a do terminal

**Status:** aceita

**Contexto.** A ADR-106 achou o gargalo do terminal. O `.layout` era um grid
sem `grid-template-rows`, e a linha implícita (`auto`) fazia a altura da linha
depender do conteúdo. Por isso, cada linha nova no terminal obrigava o Chromium
a medir o terminal inteiro de novo, e o `scrollHeight` que o `log()` lê para
rolar até o fim forçava essa medição na hora. O custo crescia com o que já
estava na tela, na mesma thread que roda a rodada em massa. O dia pesado de
23/09 teve 5.487 linhas no arquivo de log.

**Decisão.**

1. **`.layout { grid-template-rows: minmax(0, 1fr); }`**: a linha passa a ter
   a altura que sobra na tela, e o conteúdo de um painel deixa de entrar na
   conta. Nada mais mudou no terminal nem no `log()`.
2. **O harness visual voltou a rodar.** O dublê do `window.api` em
   `tools/preview.js` estava sem 12 métodos que o `preload.js` ganhou (os do
   `/doutor` da ADR-105, o parar da ADR-102, o achar contrato da ADR-098,
   entre outros), e o preview quebrava ao abrir as configurações. É o risco
   que a ADR-012 descreve; os 12 entraram no dublê.

**Consequências.** Medido antes e depois na mesma máquina, na mesma hora
(`npm run medir`, rodada completa):

| Linhas no terminal | Cada `log()` | Até aparecer na tela | Pico da janela durante os `log()` |
| --- | --- | --- | --- |
| 1.000 | 117 ms → 2,4 ms | 139 → 17 ms | 186 → 103 MB |
| 5.500 | 645 ms → 11 ms | 770 → 44 ms | 858 → 161 MB |
| 20.000 | 2,14 s → 47 ms | 2,30 s → 171 ms | 2,6 GB → 451 MB |

- Cada linha já mostrada encarece o próximo `log()` em 2,3 µs, contra 107 µs
  antes. O cenário do terminal gastou 16 s de CPU da janela, contra 111 s, para
  o mesmo trabalho. O pico de memória da rodada caiu de 2,8 GB para 722 MB, e a
  memória privada que ficava presa depois de "Limpar" caiu de 1,6 GB para
  319 MB.
- **Visual: nenhuma mudança de layout.** Com o horário do terminal fixo e a
  rolagem do painel zerada, 18 das 19 telas do harness saíram idênticas pixel a
  pixel com e sem a correção; a outra difere só na bolinha de status que pisca
  (animação `pulse`). A geometria de todos os painéis, em todas as cenas, é a
  mesma. Abrir ferramenta não mudou (mediana de 13 a 17 ms).
- Uma diferença de comportamento, a favor: sem a correção, o `log()` no meio
  de uma troca de tela forçava o layout do grid inteiro, e a ancoragem de
  rolagem do Chromium empurrava o painel esquerdo até o fim (no harness,
  abrindo o Publicar em massa depois de uma tela rolada). Agora o painel fica
  onde estava.
- O terminal continua guardando tudo no DOM: ~13,5 MB de RAM por mil linhas e
  +2,3 µs no `log()` por linha. Guardar na tela só as últimas 3.000 linhas (o
  mesmo tamanho do `LOG_BUFFER_MAX`, que já corta o buffer do recorte do
  histórico; o arquivo de log guarda tudo, ADR-096) deixaria o `log()` em
  ~7 ms e a janela em ~130 MB, por mais dias que o Hub fique aberto. É decisão
  de produto e fica como proposta ao Guilherme, não como dívida.

## ADR-109 — O terminal mostra as últimas 3.000 linhas; o arquivo do dia guarda todas

**Status:** aceita

**Contexto.** Depois da ADR-108 cada linha nova ficou barata, mas o terminal
ainda guardava tudo na tela: ~13,5 MB de RAM por mil linhas, e o `log()` um
pouco mais lento a cada linha, por quantos dias o Hub ficasse aberto (com
20.000 linhas, 76 ms por linha e 360 MB na janela). O buffer do recorte do
histórico (`LOG_BUFFER_MAX`, ADR-014) já parava em 3.000, e o arquivo do dia
(ADR-096) guarda tudo. O Guilherme aprovou mostrar só as últimas.

**Decisão.**

1. **A tela vai até 3.300 linhas e volta a 3.000 de uma vez**
   (`LOG_TELA_MAX = LOG_BUFFER_MAX`, `LOG_TELA_FOLGA = 300`). É em lote porque
   tirar uma linha do topo a cada `log()` obriga o Chromium a reposicionar
   todas as de baixo. Num experimento controlado, com 3.000 linhas: 33 a 42 ms
   por `log()` cortando uma por vez, contra 12 ms cortando em lote, o mesmo que
   só acrescentar (com um pico de ~60 ms a cada 300 linhas).
2. **Quando o corte começa, a primeira linha do terminal vira um aviso:** "As
   linhas mais antigas saíram da tela para ela não ficar lenta. O arquivo do
   dia, em Documentos\Hub\logs, tem todas." Aparece uma vez só; "Limpar" apaga
   o aviso, e ele volta no próximo corte.
3. **Pergunta sem resposta no terminal (ADR-064) nunca sai**: é por ela que a
   rodada está esperando. A já respondida sai como qualquer linha.
4. O corte roda nos três lugares que põem linha no terminal: o `log()` e as
   duas perguntas. O recorte do histórico e o arquivo do dia não mudam.

**Consequências.** Medido antes e depois (`npm run medir`, rodada curta):

| Linhas produzidas | Na tela | Cada `log()` | RAM da janela |
| --- | --- | --- | --- |
| 1.000 | 1.015 | 4,5 → 3,4 ms | 100 → 101 MB |
| 5.500 | 5.515 → 3.015 | 19 → 7,9 ms | 161 → 138 MB |
| 20.000 | 20.015 → 3.015 | 76 → 12 ms | 360 → 142 MB |

- Por mais que o Hub fique aberto, a janela fica em ~140 MB, e cada linha nova
  custa de 8 a 12 ms. Linha que saiu da tela se lê no arquivo do dia; o
  histórico de merges continua com o recorte de cada operação.
- **O corte conta os filhos uma vez só.** O `childElementCount` percorre os
  filhos, e perguntar a cada volta do laço deixava um corte grande quadrático:
  12,5 s para cortar 17 mil linhas de uma vez. No uso real entra uma linha por
  vez, mas o laço não depende disso.
- **Parecia vazamento e não era.** Depois de "Limpar", o DevTools às vezes
  seguia contando os nós das linhas apagadas. O GC pedido pelo DevTools nem
  sempre finaliza os nós soltos do DOM; com o `gc()` da própria janela, todas
  as variantes (inclusive sem corte nenhum) voltaram à contagem de base na
  hora. O `tools/medir-recursos.js` passou a chamar os dois.
- `tools/test-terminal-limite.js` cobre a folga, o aviso, a pergunta aberta, o
  "Limpar", o corte grande e os três lugares que põem linha. Duas mutações de
  propósito (tirar a proteção da pergunta; cortar linha a linha) fazem ele
  falhar.

## ADR-110 — /doutor: bloqueio pela chamada AJAX, mapeado ao vivo

**Contexto.** A primeira versão (ADR-105) foi montada a partir do PHP de
exemplo e de um script antigo, e errou o caminho: parava em "não achei a
listagem". Mapeando um /doutor real (renovareengseg) no navegador, o fluxo é:

1. Login (`user`/`pass`/`AdminLogin`).
2. O acesso cai no contexto da empresa do cliente (só "Informações Empresa").
   A lista de todas as empresas fica no contexto do **SIG** (a agência).
3. O botão **"Voltar"** (`button.j_view`) abre um aviso "Acessar empresa?" e,
   confirmado, troca para o SIG (recarrega).
4. Em Empresa → Listar (`painel.php?exe=CMSemp/index`) aparecem a agência
   ("SIG - Busca Cliente"/"SIG - MPI Solutions") e o cliente.
5. O cadeado (`button.j_AlteraStatus`) não abre "tem certeza?": o clique faz um
   `POST _cdn/ajax/functions.php {action:UpStatus, empresa_id (rel), empresa_status (val)}`
   e mostra um SweetAlert de resultado. `val="2"` é desbloqueado (alvo),
   `"1"` é bloqueado.

**Decisão.**

1. **O bloqueio é feito pela MESMA chamada AJAX** (`UpStatus`), não por clique.
   Assim não depende da versão do SweetAlert — e esta versão é a **v1**
   (`.sweet-alert`), não a v2 que a ADR-105 supôs; as duas convivem no grupo.
2. **A agência não é alvo**: fica de fora quem começa com "SIG" ou é "Doutores
   da Web". Sobrando uma empresa, é ela; sobrando várias, a que casa com o
   domínio; sem casar, lista e não chuta.
3. **Chegar na listagem**: tenta `CMSemp/index` direto; vazio, faz "Voltar" +
   confirmar (v1/v2) e tenta de novo; ainda vazio, procura o link "Listar" de
   Empresa da versão.
4. **Só bloqueia quem está desbloqueado** (`val="2"`); já bloqueado não faz
   nada. Se a chamada devolver "desbloqueada", avisa em vez de dar por feito.

**A validar:** rodar num /doutor de versão diferente (v2 do SweetAlert, ou
layout de listagem diferente) e ajustar os seletores se necessário.

## ADR-111 — Checador de Ouvidoria / SSL a partir de uma lista de domínios

**Contexto.** Antes de ativar SSL em massa, é preciso saber quais clientes têm
um caso de Ouvidoria que desaconselha (cancelamento, jurídico). A entrada é uma
planilha só com domínios (133, no primeiro uso).

**Decisão.** Ferramenta nova "Ouvidoria / SSL":

1. **Conta pelo domínio** (`acharContaPorDominio`, passo 1 do ADR-097 sem razão
   social): a tarefa de publicação que cita o domínio dá a conta. Uma conta →
   ela; nenhuma ou várias → "não encontrado", para revisão manual (sem Google,
   sem chutar — decisão do Guilherme).
2. **Campos pelo rótulo, via describe** (`sfCamposOuvidoria`): "Definição" e
   "Data de Conclusão" têm nome de API gerado; o Hub descobre pelo rótulo, uma
   vez por sessão, em vez de hardcodar.
3. **Casos de Ouvidoria** (RecordType contém "ouvidoria"; pode ter mais de um).
   **Situação** = o valor da Definição + a data de conclusão de cada um.
4. **Ativar SSL** = "não" quando alguma Ouvidoria estiver **Cancelado** ou
   **Jurídico**; "sim" no resto (inclusive sem caso de Ouvidoria). Jurídico é só
   anotado, para validar com financeiro/ouvidoria.
5. **Saída**: .xlsx com Razão Social, Domínio, Situação e Ativar SSL?.

**A validar num Salesforce real:** que os rótulos são exatamente "Definição" e
"Data de Conclusão" (se diferirem, a Situação sai vazia e o log avisa), e que o
RecordType de Ouvidoria casa com "ouvidoria".

## ADR-112 — /doutor: desbloquear também, e o nome pelo alt (não pela coluna)

**Contexto.** Dois problemas no /doutor:
1. Só existia bloquear. Sem a volta, um bloqueio errado não teria como ser
   desfeito pelo Hub.
2. Rodando na RENOVARE, deu "mais de uma empresa e nenhuma casou com o domínio:
   2, 6" — os ids no lugar dos nomes. A extração do nome pegava a primeira
   célula de texto não-numérica, que nesta versão da tabela caiu no id.

**Decisão.**
1. **Ação Bloquear / Desbloquear** na ferramenta. As duas usam a mesma chamada
   `UpStatus` (um toggle no servidor), mas o Hub só age quando o estado atual é
   o oposto do pedido: bloquear só desbloqueado, desbloquear só bloqueado. Já no
   estado pedido, não mexe — então não há risco de inverter por engano, e dá
   para desfazer. A resposta é conferida (`status==1` = liberado) e, se sair o
   contrário do pedido, avisa em vez de dar por feito.
2. **O nome vem do `alt`/`title` do avatar** (ou do `alt` do botão "ver"), que é
   confiável, com a coluna de texto só como último recurso. As linhas são
   deduplicadas por id (o FixedHeader/responsive do DataTables pode repetir a
   linha). Assim a agência ("SIG - …") é reconhecida e fica de fora, sobrando o
   cliente.

## ADR-113 — Tela inicial: saudação com o nome e WHOIS/DNS de um domínio

**Contexto.** Pedido do Guilherme: a home saudando pelo nome (nome e sobrenome
do usuário logado) e um WHOIS + "quais DNS o domínio usa" ali mesmo. O resto
das abas ele desenha. Paleta dada: Petroleum Glass & Terminal (primário
#5EE970, secundário/ciano #22F2EF, neutro #0A1C17, JetBrains Mono nos rótulos)
— que é essencialmente o tema que o Hub já tem; só faltava o ciano.

**Decisão.**

1. **Saudação com o nome** (`sistema:usuario`): prefere o nome do Salesforce
   (nome e sobrenome de verdade) quando conectado; senão deriva do e-mail
   (guilherme.millares → "Guilherme Millares"); senão o usuário do sistema. A
   home mostra o primeiro nome + a marca (ciano).
2. **WHOIS + DNS** (`dns:whois`): nameservers, A da raiz e MX pelo resolvedor,
   e WHOIS pela porta 43 (whois.registro.br para .br; para o resto, o referral
   do whois.iana.org). O parser puxa titular, registrador, criado, expira,
   status e nameservers, com o texto cru num "ver completo".
3. **Ciano** (`--accent-2`) somado aos tokens; o card e a saudação usam o tema
   existente, sem mexer nas outras telas.

**Fora do escopo (o Guilherme desenha):** as filas de deploy, o kanban e o
terminal ao vivo do mockup — não foram fabricados com dados de mentira.

**A validar na máquina real:** o WHOIS depende da porta 43 sair na rede da
empresa; se o firewall bloquear, o DNS ainda aparece e o WHOIS mostra
"indisponível".

## ADR-114 — A moldura v2.4: todas as telas na cara dos mockups

**Status:** aceita — as pílulas de status do topo e a statusbar saíram na ADR-126

**Contexto.** Depois da home (ADR-113), o Guilherme mandou os mockups das
telas (Hub v2.4 / Huber v2.0) e disse: "pode fazer as telas iguais as fotos,
o que for necessário pedir para retirar eu peço para você." Os mockups fixam
uma moldura única em volta de toda ferramenta — não é tela por tela, é um
esqueleto compartilhado que a ferramenta ativa preenche no centro.

**Decisão.** Uma moldura só (`renderChrome()` roda antes de qualquer tela),
com quatro regiões fixas e a paleta Petroleum Glass & Terminal:

1. **Topbar.** Marca "Hub v2.4", pílulas de status (Bitbucket / Salesforce,
   verde quando conectado via `hubSfConectado`), busca de ferramenta
   (`#tbSearch`, Enter cai na home e espelha no `#hubSearch`), MEM/CPU ao vivo
   e o usuário + marca (ciano). Sem `#topbarTitle` — o título saiu daqui e
   virou o breadcrumb de cada tela.
2. **Sidebar de módulos** (`.app-nav` / `#navList`). Lista fixa (`MODULES`)
   com ícone (`NAV_ICON`, SVG inline), item ativo destacado, e os que ainda
   não existem (Deploy, Salesforce Kanban) marcados "em breve" e roteados para
   `renderEmBreve` — nada de dado falso.
3. **Centro.** A ferramenta ativa, com um cabeçalho breadcrumb
   (`.tool-head`, `backButtonHtml()` reescrito): `← Hub / <nome> [MOD_<VIEW>]`,
   mantendo o `#backToHub`.
4. **Terminal / atividade** à direita (título por ferramenta via
   `#terminalTitle`) e **statusbar** no rodapé (`#sbState`,
   "Hub Engine v2.4.1 · Local · TLS 1.3 Seguro … READY").

**Ao vivo** (`iniciarTopbarLive()`): a MEM vem de `sistema:recursos`
(`process.memoryUsage`) e o estado das pílulas de `salesforceGetConfig`,
repolados a cada 15s. Sem inventar CPU — mostra "Ocioso"/estado real.

**Tokens.** Somados `--accent-2` (ciano #22F2EF) e `--accent-3` (#49DC7A) ao
`:root`; o bloco de CSS novo ("Moldura v2.4") traz a grade `.app-body`
(210px / 400px / 1fr), as pílulas, a nav, a statusbar e o breadcrumb, sem
mexer no corpo das ferramentas que já existiam.

**Preview.** Conferido no harness Playwright (`tools/preview.js`, com o
`window.api` stubado): home e telas de ferramenta renderam sem erro de
console e batendo com os mockups (sidebar, topbar, breadcrumb, terminal,
statusbar).

**Fora do escopo (o Guilherme pede para tirar o que sobrar):** os corpos de
cada ferramenta seguem como estavam; a moldura é que passou a existir em
volta de todas. As filas de deploy e o kanban continuam "em breve".


## ADR-115 — Redesign v2.4: cada tela na cara do mockup, kanban e terminal com comando

**Status:** aceita — pela ADR-126, saíram as pílulas do topo, o rodapé de status e o "CLI / READY" da sidebar; os pontos deixaram de pulsar para sempre, e as linhas do lote e os cartões do kanban deixaram de ter a animação de entrada. A grade de ferramentas da tela inicial saiu na ADR-127, e o terminal minimiza e fecha, com o Git Bash embaixo do meio (ADR-128)

**Contexto.** O Guilherme mandou os mockups de todas as telas (home, Bloquear
Contatos, Ouvidoria, Ativação SSL, Configurações, Publicar MPI+, Publicação em
Massa) e pediu: "faça igual as fotos; as únicas coisas que quero que tire são
coisas que não temos". Com duas exceções, que ele pediu para construir de
verdade: o **Salesforce Kanban** (a home lista as duas filas de deploy e o
Kanban move as tarefas entre a fazer / em andamento / concluído) e o
**terminal com linha de comando** ("para fazer teste direto dali"). Pediu ainda
que "Carlos" vire o nome de quem está logado, telemetria de memória e CPU de
verdade, o Conceder acesso como última aba das Configurações, e animações de
abertura, hover e clique nos botões.

**Decisão.**

1. **Moldura.** Topo com `Hub v2.4`, pílulas Bitbucket / SFDC / Graph, busca
   (Ctrl+K), `MEM` e `CPU` de verdade e o usuário (avatar com a inicial, nome
   completo e a marca). Sidebar só com módulo que existe, sem "em breve", e
   as **Configurações no pé**. Rodapé de status com o que o Hub sabe: CF API
   (token gravado), Registro.br (login gravado), Hestia node (servidor padrão),
   `Fila: N pendente(s)` (tarefas abertas nas filas do Salesforce).
2. **Telemetria de verdade** (`sistema:telemetria`): memória é a soma do
   working set de todos os processos do Electron (`app.getAppMetrics`), CPU é
   a soma do `percentCPUUsage` dividida pelos núcleos, como o Gerenciador de
   Tarefas. "Ocioso" abaixo de 5%, "Ativo" acima; nunca um número fixo.
3. **Nome de quem está logado** em todo lugar que o mockup dizia "Carlos":
   saudação, topo, prompt do terminal. Vem do `sistema:usuario` da ADR-113
   (Salesforce → e-mail → usuário do Windows).
4. **Home:** saudação, **Filas ativas de produção** (as filas `Deploy …` do
   Salesforce, `Group WHERE Type = 'Queue'`, com até 4 tarefas cada e o botão
   Kanban), **Tarefas do Salesforce** (abertas, entregas em menos de 24h, sem
   prazo, e as três de prazo mais perto), WHOIS/DNS e a grade de ferramentas.
   Sem Salesforce conectado o cartão diz isso e aponta para as Configurações;
   nada de dado inventado. Na home o centro é mais largo que o terminal.
5. **Salesforce Kanban** (`salesforce:tarefas`, `salesforce:moverTarefa`):
   três colunas mapeadas ao `TaskStatus` da org, não a valores chutados: "A
   fazer" é o status padrão, "Concluído" é o que tem `IsClosed`, "Em
   andamento" é qualquer outro aberto (prefere um cujo nome contenha
   andamento/progress). Filtro por fila, "Minhas" e "Todas". Arrastar ou usar
   as setas troca o Status; ir para "Em andamento" **assume a tarefa para
   você** (tarefa em andamento numa fila sem dono é ninguém fazendo).
   "Concluído" mostra o que fechou nos últimos 7 dias. **Só as filas das
   marcas do Hub** (nome com "Busca" ou "MPI") entram; as outras da org, como
   "Deploy - Ideal Marketing", são ignoradas com uma linha no log. Clicar no
   cartão (no quadro ou na home) **abre a tarefa** num cartão por cima:
   título, comentário inteiro, autor (`CreatedBy`), responsável, prazo,
   status, registro relacionado, e os botões de mover, copiar o link e abrir
   no Salesforce (`sistema:abrirLink`, só http(s)). O cache dura 60 s;
   `#recarregar-filas` força.
6. **Terminal com comando** (`terminal:executar`, `terminal:parar`): o que
   você digita roda no shell do Windows (um por vez, 120 s de limite, saída
   por evento linha a linha, 400 linhas no máximo na tela) e entra no mesmo
   `log()` de sempre, então vai para o arquivo do dia. `dns`, `whois`,
   `limpar`, `parar` e `ajuda` são do próprio Hub, porque o Windows não tem
   whois e o Hub já sabe consultar. **Atalhos** (`#dns`, `#whois`,
   `#nslookup`, `#ping`, e por tela `#testar-dns-todos`, `#abrir-doutor`,
   `#ns-no-pai`, `#recarregar-filas`, `#testar-credenciais`, `#git-version`)
   pegam o domínio do campo da tela e já executam. Setas navegam o histórico;
   Ctrl+` foca o campo. Uma pergunta aberta do Hub (ADR-064) continua nas
   linhas do terminal e não passa por aqui.
7. **Configurações viram tela**, não modal, com seis abas: Geral & Git,
   Contas Google & Azure, Cloudflare & Registro.br, Salesforce & Servidores,
   Painéis & /Doutor e **Conceder acesso** (a ferramenta inteira, movida para
   cá). Os campos continuam sendo os mesmos nós do HTML (ids e listeners do
   salvar não mudaram): o bloco mora escondido em `#settingsHost` e é movido
   para o painel central quando a tela abre, e de volta antes de qualquer
   outra tela sobrescrever o painel. Em cima, a **auditoria de credenciais**
   (`sistema:credenciais`): só "tem / não tem", sem revelar nada; "Testar
   todas" confere no terminal o que o Hub sabe conferir de verdade (sessões
   Google, Microsoft, Salesforce, painel MPI+, /doutor). Ctrl+S salva.
8. **Corpo das ferramentas no padrão dos mockups:** seções em cartão com
   título em mono, rótulo com tag à direita, botão principal grande com a
   linha `timeout / idempotente` embaixo, cartões de estado (credencial
   ativa, último estado, status do envio, última fila) e o texto longo de
   cada ferramenta numa caixa dobrável **"Como funciona essa automação"**,
   fechada por padrão. Publicar MPI+ ganhou as abas Parâmetros | Etapas
   (o "Continuar para validação de etapas" leva para a segunda); Propriedades
   Google, Criar novo | Buscar existente (a ferramenta "Buscar propriedades"
   virou essa aba); Mergear PRs, Fila | Histórico no cabeçalho.
9. **Movimento.** Abertura com fade, sidebar em escada, cada tela entra
   deslizando 6px em ~250ms com os cartões escalonados, linha do terminal
   desliza ao entrar e a de sucesso pisca um halo; todo botão sobe 1px e
   acende no hover, afunda no clique. Nada passa de 400ms, e
   `prefers-reduced-motion` desliga tudo.
10. **Cores fora do sistema** (design.md §5) resolvidas: os dois azuis viram
    `--border-hi` e `--accent-line`, o `--err` vira `--error`, e o hover do
    primário vira `--accent-hi`.

**O que saiu dos mockups por não existir:** Daemon PID inventado, "2
repositórios online", git-bash interativo no rodapé da home, "Safe-Revert" no
/doutor, "Modelo .xlsx" da Ouvidoria e os checkboxes de parâmetros de
auditoria são só ilustrativos (marcados e desabilitados: são a regra fixa da
ADR-111, não opções).

**Consequências.** `renderGrantAccessTool` desenha dentro de `#cfgGrant`, não
mais no painel; `openSettings(aba)` abre a tela e `closeSettings()` volta
para a tela anterior. `state.view === 'findproject'` e `'grantaccess'` ainda
funcionam, roteados para a aba certa. O preview (`tools/preview.js`) ganhou
as cenas `kanban`, `config-cloudflare` e `config-acesso`, tira os screenshots
em 1600×1000 e stuba as APIs novas; `npm test` segue 32/32.

**A validar na máquina real:** os nomes das filas de Deploy e os valores do
`TaskStatus` da org (o diagnóstico do Salesforce nas Configurações lista os
dois); tarefas cujo dono é uma fila só aparecem se a org permitir fila como
dono de Tarefa. Sem nenhuma fila, a home mostra "Minhas tarefas".


## ADR-116 — /doutor: bloquear é esvaziar os telefones e salvar (não o cadeado)

**Contexto.** O "bloquear contatos" marcava sucesso mas o telefone continuava no
site. Mapeei ao vivo no /doutor da RENOVARE (renovareengseg.com.br): o cadeado
da lista (`.j_AlteraStatus` → POST `UpStatus`) que a automação usava só
ativa/desativa a empresa — **nunca** mexe no contato. Prova: a empresa estava
"bloqueada" no painel e o telefone ainda aparecia no site.

**Decisão.** O bloqueio de verdade é no **cadastro da empresa**
(`CMSemp/update&id=<rel>`): esvaziar os campos de telefone/WhatsApp
(`empresa_fone`..`empresa_fone6`) e **Salvar**. O site regenera sem o contato
(comprovado: esvaziei e salvei, o telefone/WhatsApp sumiram; restaurei e
voltaram). Detalhes que a automação respeita:

1. **Backup criptografado** (`doutor-contatos.enc`, safeStorage) dos números
   antes de apagar, chaveado pelo domínio — é o que o **desbloquear** repõe.
2. **504 é esperado.** O Salvar responde `504 Gateway Timeout` e conclui mesmo
   assim; o Hub não trata a falha de carregamento como erro e **confirma
   relendo o cadastro** (telefones vazios = bloqueado; preenchidos = no ar), com
   algumas tentativas pela lentidão.
3. **Máscara (jmask).** Os campos têm máscara que apaga valor posto por script
   no blur; para restaurar, a automação **clona o input** (tira os listeners) e
   repõe o número, senão salvava vazio.
4. **Estado real** = telefones cheios/vazios, não o cadeado da lista.

**Fecho da tarefa.** Novo input opcional "Link da tarefa no Salesforce" na
ferramenta: ao concluir o bloqueio, o Hub conclui a tarefa e comenta
**"Contatos removidos"** ao autor (reaproveita `salesforce:fecharTarefa`).

**A validar na máquina real:** o /doutor tem versões diferentes por site; o
fluxo foi confirmado nesta (SIG). Em versão que use outro cadastro de contato,
me avise para mapear.


## ADR-117 — Ouvidoria: coluna cliente e busca da conta por confiança graduada

**Contexto.** A Ouvidoria achava a conta só pela **tarefa de "Publicação"** que
citasse o domínio — poucos dos 133 sites antigos têm essa tarefa, então sobrava
muita revisão. Validei ao vivo no Salesforce com 3 domínios que falharam:
`cirurgiaplastica-cnacional.com.br` (0 contas, 0 casos; as tarefas eram e-mail
solto de OUTRA conta — "KS Uniformes"), `topoag.com.br` (só um contato de
prospecção "cold"), `abcsatelite.com.br` (não existe no CRM). Ou seja: para
muitos domínios antigos o vínculo domínio→conta **não existe** de forma
confiável, e afrouxar a busca para "qualquer tarefa" traz **conta errada**.

**Decisão — busca por confiança graduada.** Uma SOSL só trazendo Conta, Caso,
Contato e Tarefa; resolve com o **sinal mais forte** e **uma única conta**,
senão marca revisar (não chuta). Do mais forte ao mais fraco:

0. **Razão social** exata, quando a planilha traz o nome (o mais confiável).
1. **Website da conta** contém o domínio.
2. **Caso** cujo assunto cita o domínio → a conta dele.
3. **Contato** com e-mail @domínio, fora prospecção (cold/lead) → a conta dele.
4. **Tarefa "Publicação…"** ligada a um caso que cita o domínio → a conta.

Isso sobe o acerto dos domínios bem cadastrados sem regredir nem trazer conta
errada (o e-mail solto da "KS Uniformes" não é tarefa de publicação, então não
vira conta).

**Coluna "cliente".** A planilha ganhou a coluna cliente. O Hub confere só
**Busca Cliente** e **MPI Solutions**; **Soluções Industriais**, **Doutores da
Web** e o resto (inclusive em branco) ficam de fora e saem na aba **"Outros
clientes"** do .xlsx final (aba "Resultado" + aba "Outros clientes"). Sem coluna
cliente (domínios colados), confere todos, como antes.


## ADR-118 — Backup dos contatos: apagado depois do desbloqueio confirmado

**Contexto.** O bloqueio no /doutor (ADR-116) guarda os contatos originais
(criptografado, por domínio) para o desbloqueio restaurar. O pedido: "após o
site ser desbloqueado ele pode apagar esse backup para liberar memória".

**Decisão.** O backup vive **até o desbloqueio ser confirmado** relendo o
cadastro; só então é apagado (`apagarDoutorContatos`). Sobrevive a reinícios do
PC no mesmo usuário/máquina (é o `safeStorage` do Electron); reinstalar, trocar
de usuário ou de máquina perde o backup — aí o desbloqueio avisa e pede reposição
à mão.


## ADR-119 — Triagem das tarefas da fila (publicação MPI+ e bloqueio) por regras validadas

**Contexto.** Para a automação decidir o que fazer com cada tarefa da fila do
Salesforce, os padrões foram validados em tarefas **reais**: assunto de
publicação `Publicação (Troca de DNS) [MPI+] - {domínio}`; temporário MPI+ é
`<cliente>.mpitemporario.com.br` (Busca One usa `producao.mpitemporario.com.br`,
`deploy.buscacliente.com.br` ou "Apontado via registro." — é manual, fase 2);
bloqueio é `BLOQUEIO DE CONTATOS - {domínio}` ou `RETIRAR CONTATOS, E-MAILS E
ENDEREÇO - {domínio}`.

**Decisão.** `lib/triagem.js` (puro, testado contra os casos reais) classifica
cada tarefa em publicação MPI+ (elegível), publicação Busca One (não elegível,
fase 2), bloqueio, ou ignorar. A **marca** de um bloqueio vem do **IP** para
onde o domínio aponta: `149.18.103.138` MPI Solutions, `149.18.102.39` MPI+,
`149.18.103.98–106` Busca Cliente. IP desconhecido não chuta: pula e avisa.


## ADR-120 — Monitor da fila em 2º plano (motor puro + painel flutuante)

**Decisão.** `lib/automacao.js` é o motor (puro, injetável, testado sem
Electron): varre a fila a cada 5 min, triagem, executa uma tarefa por vez,
respeita "parar" e o que já foi processado, e fecha a tarefa no Salesforce ao
concluir. `renderer/automacao-ui.js` injeta um painel flutuante com os
interruptores (**começam sempre desligados** — um automatizador não religa
sozinho ao abrir o app), "Rodar agora" e o freio de emergência. Bloqueio Busca
Cliente/MPI Solutions vai pelo /doutor (ADR-116). Cada tarefa tem o desfecho
logado (feito / pulei — motivo / erro), não só o resumo.


## ADR-121 — Bloqueio de contatos MPI+: no painel idealplus, pelas funções de salvar do próprio painel

**Contexto.** MPI+ **não tem /doutor**: os contatos ficam no painel central
(`idealplus.idealtrends.io`, Alpine.js + Livewire), em duas seções com
"Sincronizar" próprio: Configurações → Endereços da empresa (`addresses[]`:
endereço, redes, telefones, e-mails) e Integrações → WhatsApp
(`config.integrations.whatsapp.numbers[]`). Inspecionado ao vivo.

**Decisão.** O Hub abre o hub do cliente numa janela oculta (a mesma sessão da
publicação), **edita o estado Alpine e chama `saveSection('settings')` e
`saveBlock('integrations','whatsapp')`** — idêntico a clicar Sincronizar, sem
simular digitação. A censura fica em `lib/painel-mpiplus.js` (puro, testado
contra o modelo real da página e contra réplicas das validações do painel):

- Telefones e WhatsApp → `(00) 00000-0000`. O painel **recusa `##` em
  telefone** (exige dígitos: ≥1 no endereço, ≥10 no WhatsApp).
- E-mail → `contato@idealtrends.com.br` (é a marca do MPI+).
- Redes sociais e endereço → `##`. CEP/cidade/UF entram no `##` (modo A; o
  servidor aceitou ao vivo); há fallback B mantendo CEP/cidade/UF.
- Nome (label) do endereço e do número de WhatsApp não são contato: ficam.

**Ordem dos saves.** `saveSection` re-hidrata a config **inteira** com a
resposta do servidor (`applyLoadedConfig`), o que apagava um WhatsApp censurado
só em memória. Então o **WhatsApp é salvo primeiro** e cada estado é
re-aplicado logo antes do seu save. "Bloqueado" exige **os dois** blocos; um
bloqueio parcial é completado, e o backup (JSON fiel de `{addresses, whatsapp}`,
criptografado) **não é sobrescrito** quando os endereços já estão censurados.

**Achar o cliente.** A busca do painel (`/clientes?busca=`) é por nome/CNPJ, não
por domínio. O Hub usa a **razão social = nome da conta no Salesforce**
(`acharContaPorDominio`), com CNPJ de reserva, pega `/clientes/{id}` e o link
`hub?projeto={pid}`.

**Lição.** Os scripts injetados são strings: `node --check main.js` não vê um
`SyntaxError` dentro delas (redeclarar `const dados` que o `JS_HELPERS` já
declara derrubou o script inteiro com o genérico "Script failed to execute").
`tools/test-painel-scripts.js` monta cada script como o `rodarNoPainel` monta e
valida a sintaxe com `new Function`.


## ADR-122 — Publicação MPI+ automática: a mesma máquina de etapas, sem perguntar

**Contexto.** "Toda vez que detectar uma tarefa de publicação, se for MPI+ ele
já faz toda a publicação sozinho e fecha a tarefa." O "Publicar MPI+" manual já
faz tudo em 11 etapas (contato → DNS → Cloudflare → Registro.br → aprovar →
publicar → propagação → SSL → tags → planilha → Salesforce), com paradas e
perguntas no terminal que, em modo automático, ninguém responde.

**Decisão.** O driver (`window.hubPublicarTarefaAuto`, em `automacao-ui.js`)
**reaproveita a máquina de etapas do app.js** (script clássico: `pub`,
`pubNovo`, `pubRodarEtapa`, `PUB_ETAPAS` são globais), rodando **etapa por
etapa** em vez do `pubRodarTudo`, para que nada pergunte:

- razão social pelo Salesforce (`salesforce:contaPorDominio`) e link do painel
  por `acharContratoNoPainel` (razão + temporário) — sem achar, desiste;
- a parada "confirmar e aplicar o DNS" vira **backup obrigatório** do DNS atual
  do cliente em `Música/backup dns/{domínio}.txt` (registros + JSON completo) e
  segue; sem backup, **não aplica**;
- quando o Registro.br não diz a empresa (fora do .br, DNS do cliente ou
  consulta falhou), a **fila da tarefa** decide: "Deploy Busca Cliente" → Busca
  Cliente, "Deploy MPI Solutions" → MPI Solutions (`empresaDaFila`, do
  `salesforce:tarefas`). Nos `.br` o Registro.br continua mandando (é ele que
  diz de qual conta é o DNS), por isso a empresa fica `auto` na etapa do
  contato e a fila entra só como reserva depois. Assim o fluxo segue 100%
  (aprovar, publicar, tags, planilha, fechar); o DNS fica com o cliente e o
  SSL sai depois do apontamento — igual ao manual. Só desiste se a tarefa não
  estiver numa fila de marca;
- falha de etapa: não pergunta tentar/pular; o motor tenta de novo até
  `MAX_TENTATIVAS` (3) e aí desiste; `desistir: true` desiste de primeira.

Quem fecha a tarefa é a própria etapa "salesforce" (`pub.sfTarefa` = link da
tarefa). SSL adiado (Registro.br demora) entra na lista de espera do app, cujo
vigia termina SSL + tarefa. Nada no `app.js` foi alterado.


## ADR-123 — Conta e empresa pela tarefa → caso, não pelo domínio

**Contexto.** A publicação automática buscava a razão social por **domínio**
(SOSL) e falhou num caso real: a triagem leu `furryambulanciavet.com.br`, o
cadastro é `.com`, e a busca não achou nada — enquanto a **tarefa já estava
pendurada no caso 00087159**, que tem a conta (FURRY AMBULANCIA VETERINARIA
LTDA) **e** o campo "Projeto: Busca Cliente". O mesmo valia para o Publicar MPI+
manual e o em massa, que **perguntavam a empresa no terminal** nos `.com` e nos
DNS que não são nossos.

**Decisão.** Um resolvedor só, `salesforce:contexto({ tarefa | caso })`:
tarefa → `WhatId` (caso) → `Account.Name` (razão social) + campo do caso
"Sel. Projeto"/"Projeto" (descoberto pelo rótulo via describe; lookup vira
`Relacao__r.Name`) → empresa (`Busca Cliente` → bc, `MPI Solutions` →
mpisolutions), com a **fila da tarefa** como reserva. Link de caso colado no
campo da tarefa é aceito. Usado em três lugares:

- **Automático:** razão e empresa pelo contexto da tarefa; busca por domínio
  só como reserva.
- **Publicar MPI+ manual:** sem razão social mas com o link da tarefa, pega do
  caso (e guarda a empresa); na etapa da planilha, lê a empresa do caso/fila
  **antes** de perguntar — só pergunta se nada disser.
- **Publicar em massa:** com o "Link do caso" da planilha de entrada, a empresa
  (e a razão social, se faltar) vêm do caso; só pergunta se o caso não disser.

`tools/test-contexto.js` cobre o roteamento de link (tarefa x caso) e o mapa
texto → empresa, recortado do `main.js` para não divergir.


## ADR-124 — Esperar a previsão do Registro.br antes de conferir (2º plano leve)

**Contexto.** Numa troca de DNS no Registro.br a publicação leva ~2h. A etapa de
propagação já adiava o SSL e mandava o site para a lista de espera (ADR-103),
mas o **vigia** dessa lista conferia o DNS de todo site **a cada minuto**, sem
olhar a previsão — ~120 consultas inúteis por site, e a máquina ficava lenta.
E, a cada Ctrl+R, a lista de tarefas processadas da automação zerava; como a
tarefa de publicação segue aberta no Salesforce até o DNS propagar, o monitor
**rodava a publicação inteira de novo**.

**Decisão.**
- O vigia só confere quem **já passou da previsão** (`e.ate`, a `transicaoAte`
  do Registro.br) e **dorme até a previsão mais próxima** (teto de 30 min para
  reavaliar a lista); com algum site vencido, volta à cadência de 1 min até a
  folga de 30 min. Sem previsão (`ate` ausente) confere como antes. Avisa uma
  vez a hora da primeira conferência.
- O driver automático **não re-publica** um domínio que está na lista de espera
  (esperando/rodando): devolve "já publicado; esperando a propagação" e a
  tarefa é marcada como processada.
- A varredura do monitor **não roda** enquanto há uma publicação em andamento
  ou o Publicar em massa rodando — só empilharia consultas. Fora isso, o
  monitor a cada 5 min é leve (duas SOQL e triagem em memória); o custo real
  sempre foi a conferência de DNS por minuto.

`tools/test-vigia.js` recorta a decisão do vigia e prova as duas contas (0
conferências antes da previsão; ≤5 despertares em 2h).


## ADR-125 — O Hub parado gasta um núcleo: são as animações infinitas, não o DNS

**Status:** aceita (é o diagnóstico medido; a correção, e a medição com prova de que a janela desenhou, estão na ADR-126)

**Contexto.** Depois do redesign v2.4 (ADR-114, ADR-115), o Guilherme
reclamou que a máquina ficava lenta e travava. Medido em 29/09, só lendo os
processos: o Hub instalado (1.0.49), parado, gastava de 10 a 12% da máquina, ou
seja, ~1 núcleo, sendo 62% de um núcleo só no processo da GPU. Era de longe o
maior consumidor de CPU do Windows (o Firefox, segundo, gastava 1,9%). Em
25/09, antes do redesign, o mesmo Hub parado gastava 0%. A ADR-124 atribuiu o
peso à conferência de DNS por minuto do vigia; ela não explica o consumo com o
app parado, porque uma consulta de DNS por minuto é desprezível.

**Decisão (como medir e o que foi medido).**

1. **Consumo parado só se compara com a janela por cima**, ou com todos os
   estados no mesmo processo. Encoberta pelas janelas de quem está usando a
   máquina, a janela de teste desenha menos, e rodadas iguais deram de 1,2% a
   16%.
2. O `tools/medir-recursos.js` ganhou o cenário `minimizado` (no padrão) e as
   opções `--cenarios`, `--throttling` (religa a desaceleração do Chromium sem
   editar o app) e `--por-cima`.
3. Experimento controlado, na tela de 2560×1080, janela maximizada, 25 s por
   estado:

| Hub parado | CPU da máquina |
| --- | --- |
| Visível, como está | 10,8% (GPU 8,6) |
| Atrás de outra janela, como está | 10,5% |
| Atrás de outra janela, com a desaceleração religada | 10,6% |
| Visível, sem as animações infinitas | 0,12% |
| Visível, sem animação nenhuma | 0,66% |
| Visível, sem o vidro (`backdrop-filter`) mas com as animações | 12,2% |
| Atrás de outra janela, sem as infinitas | 1,0% |
| Atrás de outra janela, sem as infinitas e com a desaceleração | 0,28% |
| Minimizado | 0,32% |

**Consequências.**

- **A causa são os pontos que pulsam para sempre** (`animation: pulse …
  infinite`): `.tb-sys-dot`, `.sb-dot`, `.nav-dot`, `.stat-title .dot` e
  `.brand-dot`, sempre na tela, e os de "ocupado" (`.terminal-panel.busy`,
  `.nav-foot-state.busy`, `.card--status.pending`), que ficam ligados enquanto
  algo espera. Por menor que seja o ponto, uma animação infinita obriga o
  Chromium a gerar e apresentar a janela inteira 60 vezes por segundo. O vidro
  sozinho não pesa. O `backgroundThrottling: false` (ADR-094) mantém a janela
  desenhando mesmo atrás de outras; sem as animações infinitas, religar a
  desaceleração tira mais 0,7 ponto quando ela está encoberta.
- **No uso, as animações de entrada também custam** (medido com `--por-cima`,
  como está → sem animação): trocar de tela, 69 → 36 ms; cada linha do
  terminal com 3.000 na tela, 25 → 15 ms; a lista do Publicar em massa, que é
  redesenhada inteira a cada mudança de status e tem `popIn` em cada `.row`,
  221 → 62 ms com 32 linhas e 6,6 → 1,0 s com 3.000.
- **A máquina estava mais lenta, não o código.** Suíte: 38 de 38 arquivos,
  1.300 verificações, mas em 86 s (19 a 25 s em 25/09). Benchmark: as contas de
  CPU, com o mesmo código, 1,2 a 1,6× mais lentas; carregar módulo do disco, 2
  a 5×. Na hora, com o Hub queimando um núcleo, havia 2,6 GB de RAM livre e
  2,3 GB em paginação (o Firefox sozinho com 4,9 GB).
- **Em aberto:** o Hub instalado tinha 3 processos de janela oculta vivos
  (~330 MB), nascidos quando a automação abriu o painel (16:59 e 17:44), ainda
  vivos uma hora depois. O código devolve a janela ao cache com prazo de 3 min
  (`painelSoltarJanela`), então falta descobrir se são janelas que escaparam ou
  processos que o Chromium mantém para o site.

## ADR-126 — O Hub parado não desenha: nada pulsa para sempre, e a janela só deixa de desacelerar enquanto algo roda

**Status:** aceita — a prova de quadros do item 6, que era feita em experimentos à parte, passou para o `npm run medir` na ADR-130

**Contexto.** A ADR-125 achou a causa do Hub lento: com os pontos que pulsam
para sempre, o Chromium gera e apresenta a janela inteira 60 vezes por
segundo, visível ou atrás de outras, porque a desaceleração estava desligada
(ADR-094). Em 30/09 o Guilherme pediu, com fotos, para tirar do Hub as
pílulas do topo ("Bitbucket ativo", "SFDC conectado", "Graph pronto"), o
"CLI: v2.4.1 · READY" da barra lateral e o rodapé de status ("Hub Engine",
"CF API", "REGISTRO.BR", "HESTIA NODE"), e fazer o que tinha sido proposto:
pontos parados, o pulso de "ocupado" só com a janela em foco, sem animação de
entrada nas listas grandes, e a desaceleração desligada só durante a rodada e
a automação.

**Decisão.**

1. Saíram as pílulas do topo, o rodapé de status e o "CLI / READY" (HTML,
   CSS, o `atualizarStatusbar` e o `tickLento`, que relia as credenciais de
   minuto em minuto). A auditoria de credenciais das Configurações lê tudo
   quando a tela abre (`carregarCredenciaisDaAuditoria`).
2. **Nenhum ponto pulsa para sempre.** Só o "ocupado" (terminal) e o
   "pendente" (cartão de status) piscam, e só com a janela em foco
   (`html.sem-foco`, marcada por focus/blur). E piscam **em degraus**
   (`steps(1, end)`: aceso, meio apagado), não esmaecendo: esmaecendo, eles
   redesenham a janela 60 vezes por segundo; em degraus, só quando o ponto
   muda. O Guilherme escolheu o degrau depois de ver os números abaixo.
3. As linhas do lote (`.row`) e os cartões do kanban (`.kb-card`) entram sem
   animação: a lista inteira se redesenha a cada mudança de status.
4. A telemetria do topo (a cada 10 s) não trabalha com a janela escondida e
   volta na hora em que ela aparece.
5. A janela principal **desacelera em segundo plano como qualquer página**
   (saiu o `backgroundThrottling: false` da ADR-094). O
   `energia:manterAcordado` ganhou motivos: `rodada` (a rodada em massa, a
   única que também segura o PC acordado pelo `powerSaveBlocker`),
   `automacao` e `publicacao`. Com qualquer um ligado, a janela não desacelera
   (`setBackgroundThrottling(false)`); quando o último solta, ela volta a
   desacelerar. As janelas ocultas do painel, do /doutor e do Registro.br
   continuam sem desacelerar.
6. **Consumo "visível" só vale com prova de que a janela desenhou.** Antes dos
   25 s de CPU de cada estado, o experimento conta os quadros apresentados
   (`webContents.beginFrameSubscription`, 2 s) e anota se a janela estava
   minimizada. Sem essa prova, uma janela de teste que quem está usando a
   máquina minimizou mede ~0,2% em qualquer estado, e foi o que aconteceu em
   rodadas deste mesmo dia: o Hub de antes deu 6,4% numa e 0,2% na seguinte,
   no mesmo estado, e o pulso de "ocupado" pareceu custar 0,29%. A janela de
   teste abre por trás, sem roubar o foco, com a desaceleração desligada
   (como fica durante uma rodada, e como era na 1.0.49), e assim desenha mesmo
   encoberta ou com a tela bloqueada.
7. De passagem, o `test-esperas.js` quebrava desde a ADR-124 (o vigia agora
   dorme até a previsão); os casos passaram a usar previsões já vencidas.

**Consequências.** Medido em 30/09 (i5-10210U, tela de 1366×720, janela do
tamanho da área de trabalho, sem desaceleração, 25 s por estado, % da máquina
inteira):

| Estado | Antes (1.0.49) | Depois |
| --- | --- | --- |
| Parado | 3,8% e 3,5% (60 quadros em 2 s) | 0,06% (1 quadro) |
| Antes, sem os pulsos infinitos | 0,14% (1 quadro) | — |
| "Ocupado", com foco, esmaecendo | — | 2,2% a 4,1% (60 quadros) |
| "Ocupado", com foco, em degraus | — | 0,7% (4 quadros) |
| "Ocupado", sem foco | — | 0,2% (1 quadro) |

- O custo cresce com o tamanho da janela: os 3,8% daqui são os 10,8% da
  ADR-125 na tela de 2560×1080, que tem 2,8 vezes a área. No monitor grande, o
  "ocupado" esmaecendo passaria de 6% enquanto algo roda; em degraus, fica
  abaixo de 1%.
- No uso (`npm run medir -- --por-cima`, depois das mudanças, com a janela
  desenhando: a GPU trabalhou 9,8% na navegação): trocar de ferramenta, mediana
  de 21 a 30 ms (69 ms na ADR-125); a lista do Publicar em massa, 60 ms com 32
  linhas (221 ms) e 0,8 s com 3.000 (6,6 s); abrir o Hub, 1,35 s; 386 MB
  somando os processos. Parado por cima, 0,4%; minimizado, 0,1%.
- A ADR-125 estava certa ao dizer que qualquer animação infinita suave, por
  menor que seja, faz a janela inteira ser apresentada 60 vezes por segundo: a
  prova de quadros mostra os 60 quadros com um ponto de 6 px.
- Continua em aberto o que sobra de janela oculta do painel depois da
  automação (ADR-125).

## ADR-127 — Tela inicial sem a grade "Automações & scripts"; a busca do topo abre o módulo

**Status:** aceita (substitui, na tela inicial, os cartões da ADR-056)

**Contexto.** Pedido do Guilherme, com foto (30/09): tirar da tela inicial o
painel "Automações & scripts" (a busca "Pesquisar ferramenta", a contagem "10
ferramentas", os recentes e os cartões), porque os atalhos estão na barra
lateral.

**Decisão.**

- Saiu o bloco inteiro (`renderToolGrid`, `#toolGrid`, `#hubSearch`, os chips
  de "Recentes") e o CSS que só ele usava (`.tool-grid`, `.tool-card*`,
  `.chip*`, `.home-tools*`). A tela inicial fica com a saudação, as filas do
  Salesforce, o resumo das tarefas e o WHOIS/DNS.
- A busca do topo (Ctrl+K) filtrava essa grade: o Enter levava para a tela
  inicial e preenchia o `#hubSearch`. Agora o Enter abre direto o que bate com
  o texto, nesta ordem: o nome de um módulo da barra lateral, o nome de uma
  ferramenta (inclui "Buscar propriedades" e "Conceder acesso", que não têm
  atalho próprio na lateral: são uma aba de Propriedades Google e uma das
  Configurações) e as descrições. Sem acento conta igual. Se nada bater e o
  texto for um domínio, vai para a tela inicial e consulta o WHOIS/DNS; senão,
  avisa no terminal.
- O `medir-recursos.js` esperava a grade aparecer para saber que o Hub abriu;
  passou a esperar o campo do WHOIS.

**Consequências.** "Buscar propriedades" e "Conceder acesso" continuam a um
clique (a aba) ou pela busca. Os recentes ainda são gravados no hub-state, sem
uso na tela.

## ADR-128 — Git Bash dentro do Hub, e os dois terminais minimizam e fecham

**Status:** aceita — redimensionar sem duplicar linhas (o ConPTY do node-pty e um aviso de tamanho por arrasto) está na ADR-129

**Contexto.** Pedido do Guilherme (30/09), com foto do terminal do
Antigravity: pôr o Git Bash dele no Hub igual ao terminal de lá, e dar a opção
de fechar, ou pelo menos minimizar, os dois terminais: o Git Bash novo e o de
atividade, que continua à direita.

**Decisão.**

1. **Um bash de verdade.** O processo principal abre o `bash.exe` do Git for
   Windows (`--login -i`, como o próprio Git Bash) num pseudoterminal do
   Windows (ConPTY), pelo `node-pty` 1.1.0, que vem com o binário pronto
   (N-API) para Windows x64: não precisa compilar, e esta máquina não tem o
   compilador do Visual Studio. A tela é o `xterm.js` 5.5, o mesmo do VS Code e
   do Antigravity, carregado só na primeira vez que o bash abre (290 KB). O
   perfil do usuário roda igual: a citação e o prompt `usuário@máquina MINGW64
   pasta (branch)` saem com as cores de lá (a paleta ANSI do VS Code no tema
   escuro). Um bash por janela, que morre quando a janela ou o Hub fecham.
   - Onde está o bash: em `Arquivos de Programas\Git`, em
     `AppData\Local\Programs\Git` (a instalação desta máquina) e, se não, ao
     lado do `git` do PATH. Sem Git, a mensagem diz o que instalar.
   - Abre na pasta do usuário, com `TERM=xterm-256color`, `COLORTERM=truecolor`
     e `CHERE_INVOKING=1` (o `/etc/profile` do Git fica na pasta em que abriu).
   - A saída junta por 8 ms antes de ir para a janela. Tecla e tamanho vão por
     `invoke` e a página não espera a volta. Tudo é `ipcMain.handle`, como o
     resto do `main.js`: os testes carregam o arquivo com um `ipcMain` que só
     tem `handle`, e com `ipcMain.on` dez deles quebraram na carga.
   - Copiar e colar como no VS Code: Ctrl+C copia se houver texto selecionado
     (sem seleção, vai o ^C para o bash e interrompe); Ctrl+V cola. O cursor
     não pisca (ADR-126).
2. **Onde fica e como se mexe.** Embaixo do painel do meio, com a borda de
   cima arrastável (a altura fica guardada). A cara é a do painel do
   Antigravity: fundo escuro arroxeado, a aba "Terminal" em roxo e, à direita,
   `bash`, `+` (outro bash, encerrando o atual), a lixeira (encerra), maximizar
   (ocupa a coluna do meio inteira), minimizar (fica só a barra; clicar nela
   devolve) e `×` (esconde; o bash continua vivo, e a barra lateral mostra um
   ponto roxo). Abre pelo "Git Bash" da barra lateral ou por Ctrl+Shift+' (a
   tecla à esquerda do 1).
3. **A Atividade minimiza e fecha.** Minimizada, vira um trilho de 38 px à
   direita; fechada, a coluna some e o meio ocupa a largura. O que chega
   enquanto ela está escondida vira um número no trilho e no botão "Atividade"
   da barra lateral, vermelho se veio erro. Uma pergunta no terminal (ADR-064)
   traz a Atividade de volta sozinha, e o Ctrl+` também. O estado fica
   guardado nesta máquina (localStorage). Apertado, o título dela termina em
   reticências, e o PID ao lado some primeiro.
4. O CSS do log passou a ser do `#terminal`, não da classe `.terminal`: o
   xterm.js põe essa classe no elemento dele e herdava o recuo e a rolagem do
   log (o bash passava da largura, com barra de rolagem para o lado).
5. **Instalador:** `npmRebuild: false` (o electron-builder não tenta compilar o
   node-pty) e `asarUnpack` do node-pty (binário nativo não roda de dentro do
   app.asar), sem os `.pdb`, as outras plataformas e os fontes (~55 MB).
   Conferido num pacote de teste: o node-pty vai com 4,1 MB, o executável do Hub
   empacotado abre o bash por ele, e o pacote cresce 5 MB (327,6 MB).
6. O npm desta máquina não roda os scripts de instalação do node-pty sem
   aprovação (`allowScripts`). Eles não fazem falta: um confere que o binário
   pronto existe, o outro copia uma DLL do ConPTY que só é usada com
   `useConptyDll`.

**Atualização (30/09).** O Guilherme pediu o Git Bash "na mesma paleta de
cores que o programa usa". A moldura ficou a do Antigravity (aba, botões,
borda arrastável), mas as cores agora são as do Hub: fundo `#061210` (o
recuado do app), texto `--text`, aba ativa e ponto de "bash aberto" em
`--accent`, e as 16 cores ANSI mapeadas para os papéis da paleta (tabela em
`docs/design.md`, "Git Bash"). O que a paleta não tem (roxo e azul) virou o
cinza-verde secundário e um ciano mais fechado; o prompt continua com quatro
cores distintas. O fundo do xterm (`TEMA_BASH`) e o da moldura
(`--bash-fundo`) são o mesmo valor de propósito.

**Consequências.**

- Testes: `test-git-bash.js` (dublês do node-pty e da janela, e no fim um bash
  de verdade pelo node-pty desta máquina, sem o perfil) e
  `test-terminais-browser.js` (a página de verdade num Chromium, com o xterm.js
  de verdade). O `preview.js` ganhou os métodos do bash no dublê e as cenas dos
  terminais. Sete defeitos postos de propósito, os sete pegos.
- No Hub de verdade, o perfil do Guilherme levou de 17 a 44 s para mostrar o
  prompt: a citação do `.bashrc` busca na internet (zenquotes.io) sem prazo. No
  Antigravity é igual; não é do Hub.
- O Git Bash parado não gasta: sem cursor piscando, o xterm.js só desenha
  quando chega saída.
- O painel flutuante da automação (ADR-120) fica por cima do canto direito do
  Git Bash quando a Atividade está minimizada ou fechada; ele se minimiza.

## ADR-129 — Git Bash: redimensionar sem duplicar linhas, e a citação do terminal sem esperar a internet

**Status:** aceita

**Contexto.** O Guilherme (30/09): aumentando e diminuindo o Git Bash, ele
"sai duplicando as frases e pulando linha"; e que as frases (a citação que o
perfil dele mostra ao abrir o terminal) apareçam mais rápido, sem travar.

Reproduzido no Hub de verdade, numa pasta descartável: uma frase longa, a borda
arrastada para cima e para baixo como a mão faz, e a largura mudando. Com o
ConPTY do Windows e o tamanho avisado ao bash a cada passo (55 avisos num
arrasto), a frase apareceu 9 vezes (o certo são 2: o comando e a saída), com
pedaços soltos e a largura final errada (63 colunas em vez de 97). Num teste
mais duro, com 150 linhas saindo enquanto a borda mexe e a Atividade
minimiza, fecha e volta, 2 linhas saíram repetidas.

**Decisão.**

1. **O ConPTY do node-pty, não o do Windows** (`useConptyDll: true`: o
   `conpty.dll` e o `OpenConsole.exe` do Windows Terminal 1.23, que vêm no
   node-pty). Com ele, os dois testes saíram limpos mesmo com ~100 avisos de
   tamanho: 150 de 150 linhas, nenhuma repetida nem torta. Ele pergunta ao
   terminal quem ele é (`ESC [ c`) e espera a resposta por ~3 s; o xterm.js
   responde na hora, por isso tudo que o xterm manda vai para o bash sempre,
   mesmo antes de o Hub dá-lo como vivo. Respondido, abre tão rápido quanto o
   do Windows (~450 ms) e fecha mais rápido (0,6 s contra 1,5 s). Se o dll não
   carregar (faltando, ou com o caminho até ele passando de 260 caracteres:
   erro 206; o do Hub instalado tem 152), o bash abre com o ConPTY do Windows e
   a Atividade avisa o motivo.
2. **O bash só fica sabendo do tamanho quando ele para de mudar.** O xterm.js
   se ajusta ao painel a cada quadro, mas o aviso ao bash (cada um faz o ConPTY
   redesenhar a tela) espera a mão soltar a borda, um aviso por arrasto; nos
   outros casos (a janela, a Atividade abrindo ou fechando), 150 ms parado. O
   mesmo tamanho não é avisado duas vezes. O fim do arrasto vale por qualquer
   caminho: soltar, cancelar, perder a captura, a janela perder o foco (Alt+Tab
   no meio) ou um movimento já sem o botão. Se ele se perdesse, o bash nunca
   mais saberia do tamanho, e foi o que um arrasto simulado por
   `sendInputEvent` mostrou (o "soltar" não chegou).
3. **Quem via o fim continua vendo o fim.** Depois de mudar a altura, a vista
   do xterm.js ficava presa umas linhas acima do fim, e a saída nova não rolava
   mais (o prompt sumia embaixo): o navegador ajusta a rolagem do painel antes
   de o xterm.js se encaixar, e o xterm.js toma isso como a pessoa rolando. O
   Hub guarda se a vista está "grudada" no fim e só muda isso quando a pessoa
   rola de verdade: a roda do mouse e a barra de rolagem (que nem disparam o
   `onScroll` do xterm.js) e o teclado. Grudada, depois de cada ajuste ela volta
   ao fim; quem subiu para ler o histórico fica onde estava.
4. **A citação**, fora do repositório do Hub: no `citacoes.py` (repositório
   `guizao/python`) e no `.bashrc` do Guilherme. O script buscava no
   zenquotes.io e traduzia no MyMemory, sem prazo, antes do prompt; daqui, só
   conectar no zenquotes leva 15 s, e às vezes não conecta (de 4 a 21 s por
   terminal, ou travado). Agora a frase sai na hora, de uma reserva já
   traduzida (`~/.cache/citacoes/citacoes.json`). Quando ela fica abaixo de 8,
   o próprio terminal pega uma trava e abre um processo solto dele, que busca
   50 frases no zenquotes (ou, se ele não responder, na dummyjson.com, que
   responde em 0,2 s) e traduz 10 por vez no MyMemory, com prazo em cada
   chamada. O aviso de limite do zenquotes e o do limite do dia do MyMemory não
   viram frase; sem rede, repete uma já vista. No `.bashrc`, as 6 linhas da
   citação (subshell, ativar e desativar o venv) viraram uma chamada direta ao
   Python do venv com `-S` (a frase não precisa de pacote nenhum).

**Consequências.**

- No Hub de verdade, com o perfil do Guilherme, 9 arrastos de verdade (a 520,
  220 e 300 px, três vezes) e a Atividade minimizando, fechando e voltando: a
  citação aparece 1 vez, 60 de 60 linhas, nenhuma repetida ou torta, 97×14 no
  fim, e a vista no fim, mostrando o prompt (antes das mudanças, ela parava 16
  linhas acima); chegaram ao bash 10 avisos de tamanho (antes, ~100).
- O prompt com o perfil dele caiu de 10 a 44 s para 4,4 a 5,2 s. A citação
  leva ~0,3 a 0,5 s (o Python sozinho já leva ~0,25 s para abrir nesta
  máquina); o resto é do próprio Git (o `/etc/profile`, ~2,2 s) e do
  `ssh-agent` + `ssh-add` do `.bashrc` (~1,1 s).
- Testes: `test-git-bash.js` (o ConPTY do node-pty; a queda para o do Windows,
  com o motivo; um bash de verdade pelo conpty.dll desta máquina, respondendo
  à pergunta) e `test-terminais-browser.js` (nenhum aviso de tamanho no meio
  do arrasto e um no fim; o arrasto que termina com a janela perdendo o foco ou
  sem botão; a resposta à pergunta com a abertura pendente; nenhum aviso
  repetido ao abrir; a vista no fim depois de aumentar e diminuir, e parada no
  histórico para quem rolou com a roda do mouse). Dez defeitos postos de
  propósito, os dez pegos. O
  `citacoes.py` foi testado à parte, com a rede de mentira: primeira vez,
  reserva cheia e vazia, arquivo estragado, os limites dos dois serviços, as
  aspas que a tradução traz, duas buscas ao mesmo tempo.
- Pacote de teste: o `conpty.dll` e o `OpenConsole.exe` vão fora do app.asar,
  e o executável do Hub empacotado abre o bash por eles (0,73 s).


**Atualização (30/09): um ssh-agent por conta.** O `.bashrc` abria um
`ssh-agent` novo em todo terminal (e em cada `busca`, `mpi` e `doutor`) e
nenhum fechava: eram 28 abertos. E a chave que ele carregava na abertura,
`~/.ssh/bitbucket`, não existe: o agente ficava vazio, e o ssh usava a
`~/.ssh/id_rsa`. Agora a função `usar_agente` guarda o endereço do agente de
cada conta em `~/.ssh/agente-<conta>.env` e o reaproveita; se ele morreu (o
PC reiniciou), abre outro e carrega a chave. Cada conta segue com o seu
agente, só com a chave dela, que é o que faz `mpi` e `doutor` trocarem a
conta do Bitbucket no terminal; `busca` volta para o agente sem chave (a
`id_rsa`). Com o agente vivo, a abertura do terminal só usa comandos do
próprio bash (antes, ~1,1 s). Três terminais seguidos usaram o mesmo agente;
dos 29 abertos, os 22 que nenhum processo usava foram fechados, e ficaram 7,
todos de terminais abertos. Testado antes com uma chave descartável (o segundo
terminal usa o mesmo agente, a chave não é carregada duas vezes, cada conta
tem o seu, agente morto é reaberto).

## ADR-130 — O `npm run medir` só mostra o parado como consumo com prova de que a janela desenhou

**Status:** aceita

**Contexto.** A ADR-126 (item 6) mostrou que o consumo "visível" engana sem
prova de que a janela desenhou: minimizada por quem está usando a máquina, a
janela de teste mede ~0,2% com qualquer animação. A prova, contar os quadros
apresentados antes de cada janela de CPU (~60 em 2 s com uma animação infinita
suave, ~4 em degraus, 1 com a janela parada), foi feita em experimentos à
parte, e o `npm run medir` continuava sem ela: estava nas pendências.

**Decisão.**

1. **Prova de quadros antes do parado e do minimizado.** O
   `tools/medir-recursos.js` conta os quadros que a janela apresenta em 2 s
   (`webContents.beginFrameSubscription`, como nos experimentos) antes da
   janela de CPU do `ocioso` e do `minimizado`, nunca durante: a captura custa
   CPU, e cada quadro chega ao processo principal como uma imagem da janela
   inteira, por isso depois dela vêm um GC e meio segundo de folga. Anota
   também `isMinimized()`, `isVisible()`, `isFocused()`, o tamanho da janela e
   a tela em que ela está (`screen.getDisplayMatching`: tamanho, escala e
   `displayFrequency`). O relatório mostra tudo numa linha ("quadros em 2 s
   (antes da medida): 1 · minimizada: não · …").
2. **O minimizado minimiza antes da prova e só volta depois da janela de
   CPU.** Antes, minimizar, restaurar e o redesenho da volta entravam nos 60 s.
   Os nomes dos cenários e o método das outras medidas não mudaram.
3. **O que tira o valor** (`validadeDoCenario`, no relatório):
   - no parado, a janela minimizada ou escondida na hora da prova, com
     qualquer contagem. Minimizada, a janela entregou 1 quadro à captura nas
     duas rodadas de 30/09 (com a desaceleração ligada, o padrão desde a
     ADR-126), o mesmo da janela parada na tela: só a contagem não separa as
     duas;
   - no minimizado, a janela que não minimizou;
   - em qualquer cenário, a janela minimizada, restaurada, escondida ou
     mostrada, ou a tela bloqueada ou desbloqueada, entre o começo da prova e
     o fim da medida. A prova é só do começo; os eventos da janela e do
     `powerMonitor` cobrem o resto e não custam nada.

   O cenário sem valor sai como **INVÁLIDO**, com o motivo, e os números numa
   linha só ("o que se mediu assim"), não na tabela. Sem motivo conhecido, 0
   quadros com a janela na tela sai como **SEM PROVA** (outra janela por cima,
   ou a tela bloqueada antes), com o número e a sugestão de `--por-cima`. A
   tabela "CPU por cenário" marca os dois casos, e a "Segurança da medição" diz
   se mexeram na janela no meio de algum cenário, inclusive naquele em que a
   medição parou.
4. **Minimizada por fora no meio da navegação, do terminal ou da planilha, a
   medição para na hora** e diz por quê, como já fazia com a janela fechada.
   Esses três cenários esperam `requestAnimationFrame`, que não roda com a
   janela minimizada; o que começaria com ela minimizada também para. O
   `terminar()` grava uma vez só.
5. **JSON (`--json`):** cada cenário guarda a `prova`; o resultado bruto, os
   eventos (`janelaMudou`); o resumo do parado e do minimizado, `prova`,
   `valido`, `invalido` e `semProva`.

**Consequências.** Medido em 30/09 com `npm run medir -- --por-cima`
(i5-10210U, tela de 1366×768 a 60 Hz, janela de 1240×720; % da máquina
inteira):

| Rodada | Parado na tela | Minimizado |
| --- | --- | --- |
| 12:29, a janela de teste minimizada por fora aos 59 s do parado e no meio do terminal | 1 quadro, na tela, em foco; **inválido** ("minimizada aos 59 s"; mediu 0,5%) | 1 quadro, minimizada; 0,0% |
| 13:07, sem mexer | 1 quadro, na tela, em foco; 0,3% | 1 quadro, minimizada; 0,0% |

- A rodada das 12:29 foi o caso da pendência ao vivo: o parado saiu inválido,
  e não como consumo. Minimizada no terminal, ela ficou 17 min esperando um
  quadro até o prazo de 20 min, e o relatório ainda não dizia em que cenário;
  daí vieram o cenário que não terminou, no item 3, e o item 4. Numa rodada
  curta às 13:00, minimizada por fora no meio da navegação, a medição parou na
  hora, com o motivo.
- A das 13:07 terminou inteira (3,5 min), sem erro e sem nenhuma tentativa de
  rede; a GPU trabalhou 9,9% na navegação, com a janela desenhando.
- A rodada fica uns 6 s mais longa: a prova duas vezes, e minimizar antes da
  prova do minimizado.
- Testes: `test-medir-recursos.js` monta o relatório com resultados feitos à
  mão (na tela; minimizada antes, com 0 e com 1 quadro; escondida; 0 quadros
  sem motivo; 60 quadros; minimizada e tela bloqueada no meio; o minimizado
  que não minimizou; o cenário que não terminou) e confere no código do motor
  que a prova fica fora de todas as janelas de CPU e que a medição para.
  Quinze defeitos postos de propósito, os quinze pegos. Suíte: 43 arquivos,
  1.488 verificações, 0 falha.
- Continua sem evento outra janela cobrindo a de teste no meio da medida,
  quando ela não está `--por-cima`: a prova do começo só pega a janela que já
  estava coberta (0 quadros, "sem prova"). A medida limpa continua sendo com
  `--por-cima`.

## ADR-131 — Busca no Analytics: cache dos data streams, contas novas primeiro, para ao achar

**Status:** aceita — gravada em 30/09 como ADR-125, número que já era do diagnóstico do Hub lento; renumerada para 131

**Contexto.** As propriedades GA4 têm nome genérico ("Busca Cliente 01, 02…");
o domínio só está no `defaultUri` do data stream, que custa **uma chamada de
API por propriedade**. Com 4844 propriedades no escopo, a busca cortava em 600
e parava **em silêncio** — `polimentoalleanza.com.br`, na conta "Busca Cliente
18", nunca era achado ("0 propriedades correspondem"), embora existisse. A
conferência antes de criar propriedade (ADR-046) tinha o mesmo teto: podia
criar duplicada de quem estivesse depois da 600ª.

**Decisão.** Uma varredura só (`varrerDataStreams`), usada na busca e na
conferência de criação:
- **cache em disco** (`analytics-streams-cache.json`, userData) do que cada
  propriedade tem nos streams; propriedade já lida não gasta API (validade
  30 dias); o cache é gravado a cada 200 leituras para não perder o índice se
  a busca cair;
- as não lidas são varridas em **ordem inversa** — as contas de número maior
  são as mais novas e recebem os clientes novos, então o que se procura
  costuma estar no fim;
- **para no primeiro casamento** (`mapLimit` ganhou `parar()`): quem procura um
  domínio quer um cliente. Na criação também: uma existente já basta para não
  criar outra; duplicatas entre as já cacheadas aparecem de graça na passada
  do cache, e o cache só cresce;
- teto sobe para 6000 (o escopo inteiro), com aviso claro quando não achou.

`tools/test-analytics-scan.js` recorta a função real, monta 83 contas × 58
propriedades com API falsa e prova: acha o cliente da conta 18; lê ~ (total −
posição) e não o total; 2ª busca sem chamada; cache completa ao não achar.

**Atualização (30/09): o `test-gtm-template.js` (ADR-016) com o cache.** Com a
busca nova, 9 verificações da seção "Busca por domínio no Analytics" falhavam,
e não por defeito da busca: todos os casos do arquivo usam a mesma pasta de
dados, e o cache que um caso anterior deixou (as propriedades 1 e 2 lidas com
streams vazios) respondia pela busca seguinte, que então não achava nada e nem
chegava à API (o caso do 403 nunca era exercitado). O teste agora limpa o cache
antes da seção e antes dos casos que precisam da API (a busca sem o TLD e o
403), e confere o comportamento novo: o que foi lido fica no cache, e a mesma
busca de novo acha pelo cache sem chamar a API. As verificações antigas
(domínio pelo stream, escopo por marca, sem TLD, 403 com aviso) continuam
iguais. Quatro defeitos postos de propósito numa cópia (ignorar o cache, o 403
derrubar a busca, casar só pelo nome, não gravar o cache), os quatro pegos.

## ADR-132 — Publicação Busca One automática: propriedades, geral.php e e-mail de vhost; o resto fica escrito na tarefa

**Status:** aceita — verificada com dependências falsas (`test-busca-one`,
`test-automacao`, `test-triagem`), no Chromium sem o app.js
(`test-automacao-browser`) e no `index.html` inteiro com `window.api` falso
(`test-busca-one-browser`). A primeira rodada contra Google, Bitbucket, Graph
e Salesforce de verdade fica para o Guilherme ligar o interruptor com uma
tarefa real na fila. **Os itens 1 e 4 (como se lê o domínio e de onde vem a
empresa) foram substituídos pela ADR-133** no mesmo dia, e **o comentário na
tarefa (item 3.iv) pela ADR-134**: a tarefa só muda de status, as chaves
saem no terminal. A opção `marcar: false` do `salesforce:fecharTarefa`,
criada para esse comentário, foi removida com ele.

**Contexto.** A fase 1 da automação (ADR-119, 120, 122) publica sozinha as
tarefas MPI+ e deixava as de Busca One — `Publicação (Troca de DNS) -
{domínio}` com temporário `producao.mpitemporario.com.br` (MPI Solutions) ou
`deploy.buscacliente.com.br` (Busca Cliente), ou só "Apontado via registro." —
marcadas como "fase 2", sem fazer nada. Busca One é a plataforma dos sites da
Busca Cliente e da MPI Solutions: o site mora num repositório do Bitbucket
(slug = domínio), lê as chaves no `geral.php` e é posto no ar por um humano
depois que o suporte da hospedagem cria o vhost e o banco (clone/pull pelo
Guacamole, DNS). Pedido do Guilherme em 01/10/2026: quando a tarefa for Busca
One, **criar e/ou achar as propriedades** (Analytics, Tag Manager etc.),
**subir no Bitbucket** e **mandar o e-mail de criação de vhost e banco** —
dois modelos, um por empresa, em que só o domínio muda — e com isso "finalizar
a parte automática da publicação". O **ID do painel** (`$idProjetoBusca`) vem
do comentário da tarefa escrito `ID xxxx`; o **domínio**, do título e/ou do
comentário.

**Decisão.**

1. **Triagem** (`lib/triagem.js`): toda publicação ganha `plataforma`
   (`mpiplus` | `buscaone`). Busca One: o domínio é o que vem depois do último
   " - " do assunto, se parecer domínio e não for host nosso; senão, o primeiro
   host do comentário que não é da infraestrutura (mpitemporario,
   buscacliente, idealtrends, bitbucket, salesforce, google, m3solutions).
   `idPainel` por "ID 1234", "ID: 1234", "Id do painel 1234" — comentário
   antes do assunto, 1 a 6 dígitos, com separador antes do "ID" (nunca o `id=`
   de uma URL) e nunca 8 dígitos (número de caso). `empresaSugerida` pelo
   temporário. Elegível = tem domínio; sem domínio, registra uma vez e deixa
   para a mão, como antes.
2. **Interruptor próprio** no painel da automação ("Publicação Busca One
   automática (beta)"), desligado ao abrir como os outros (ADR-120).
   Desligado, a tarefa **fica na fila** (não é marcada como processada), para
   quando ligar. O freio de emergência desliga os três.
3. **Motor** (`lib/busca-one.js`, puro, injetável, testado), com os
   pré-requisitos conferidos **antes de qualquer efeito** (domínio, empresa,
   destinatário, drivers; no renderer também service account, credenciais do
   Bitbucket e conta Microsoft — o que falta aí é erro comum, que o motor
   repete até o teto, não "desistir"), e a ordem fixa:
   1. `google:createProject` com as 4 etapas na **marca da empresa** — o mesmo
      do "Criar propriedades", que reaproveita o que já existe e não duplica
      (ADR-046, ADR-131);
   2. `bitbucket:commitGeral` com as 6 chaves e `$idProjetoBusca` = o **fixo da
      marca** (MPI Solutions é 39, ADR-034; vem do `BRANDS` do renderer, com
      `ID_PAINEL_FIXO` da lib como reserva) ou o **ID da tarefa**. Sem ID, a
      variável não entra no commit (o `'xxxx'` do repositório fica) e vira
      pendência avisada;
   3. `mail:sendBatch` com o modelo da empresa, pela caixa de quem está
      logado, salvo em Itens Enviados;
   4. a tarefa vai para **"Em andamento"** (`salesforce:moverTarefa`, que a
      assume no nome de quem está logado) e recebe o **registro** do que foi
      feito (GA, GTM, site key, token do Search Console, ID do painel e sua
      origem, commit, e-mail) e do que falta, **sem marcar ninguém** — opção
      `marcar: false`, nova no `salesforce:fecharTarefa`, porque registro
      parcial não é notícia para o atendimento ("Site publicado" é, ADR-089).
      A tarefa **não é concluída**: vhost, clone no servidor e DNS continuam
      manuais, e isso está escrito nela. Alocar para quem está logado e pôr
      em andamento foi confirmado em 01/10/2026 ("pode alocar para mim e
      colocar em andamento"). A `secretKey` do reCAPTCHA nunca vai para o
      feed.
4. **Empresa**: caso da tarefa → fila → temporário (ADR-123). Quando o
   temporário discorda do caso, avisa e segue pelo caso. Sem nenhuma das três,
   desiste de primeira ("publicar à mão").
5. **Falhas**: propriedades → erro (o motor tenta de novo até 3 vezes; chave
   da service account inválida desiste); commit → **pendência**, e o fluxo
   segue para o e-mail (o pedido de vhost não depende do commit); e-mail →
   erro, porque ele ainda não saiu — repetir 1 e 2 é idempotente (reaproveita
   e "já estava com esses valores"); mover/comentar a tarefa → só aviso, o
   registro fica no terminal. O mesmo e-mail só sairia duas vezes por uma
   tarefa se a resposta do Graph se perdesse depois do envio.
6. **Destinatário e cópia** do e-mail ficam no painel da automação ("Vhost
   para" / "Cc"), gravados no hub-state (`mailVhost`); sem edição, valem os
   do e-mail de ativação de SSL (`suporte@m3solutions.com.br`, cópia
   `everton.lima@buscacliente.com.br`), confirmados em 01/10/2026: "mesma
   coisa do SSL".
   **Assunto e corpo são fixos** em `lib/busca-one.js`, exatamente como a
   equipe manda (`{dominio}` é a única variável): "Criação de Vhost e Banco -
   Busca Cliente - {domínio}" / "… - MPI - {domínio}".
7. **Testes**: `test-triagem` (casos Busca One: domínio do assunto ou do
   comentário, ID em cada lugar, `id=` e número de caso ignorados),
   `test-busca-one` (modelos, ordem, ID fixo/da tarefa/ausente, cada falha),
   `test-automacao` (roteamento por plataforma e interruptor),
   `test-automacao-browser` (toggle, campos, driver sem app.js) e
   `test-busca-one-browser` (renderer inteiro com `window.api` falso: state,
   workspace, ID fixo, mailVhost, ordem das chamadas).

**Consequências.** A parte automática de uma publicação Busca One sai sem
clique, e o que sobra está escrito na tarefa, que fica em "Em andamento" com
quem rodou o Hub. O Hub continua não executando deploy (PRD §5). Dois lugares
sabem o 39 da MPI Solutions (o `BRANDS` do renderer manda; a lib é reserva). O
corpo da Busca Cliente lista `everton.lima` duas vezes porque o modelo da
equipe veio assim. A automação não ouve o "ID xxxx" quando ele está só no caso
(não na tarefa); nesse caso o `geral.php` fica com `'xxxx'` e a pendência diz
isso.

---

## ADR-133 — Busca One: o temporário diz a empresa e o repositório; o domínio real é o outro domínio da tarefa

**Status:** aceita (substitui os itens 1 e 4 da ADR-132).

**Contexto.** A ADR-132 lia o domínio pelo assunto e tratava o temporário
como "sugestão" de empresa, abaixo do caso e da fila. Em 01/10/2026 o
Guilherme explicou como a tarefa de publicação Busca One é escrita: no
comentário há **dois domínios**, um é o **temporário com o caminho** —
`deploy.buscaclientes.com.br/{domínio}/` (Busca Cliente) ou
`producao.mpitemporario.com.br/{domínio}/` (MPI Solutions) —, e o que vem
**depois da barra é, na maioria das vezes, o repositório do Bitbucket**; o
**outro domínio** da tarefa é o que será usado de verdade. Ele vai padronizar
a abertura com o atendimento neste modelo:

```
- link temporário: https://deploy.buscaclientes.com.br/ecolifeambiental.eco.br/

ecolifeambiental.eco.br - domínio para ser usado
ID do painel xxxx
```

O host real é `deploy.buscaclientes.com.br` (com "s"; resolve para
`149.18.103.99`); `deploy.buscacliente.com.br`, a grafia da ADR-119, não
resolve. As duas valem na triagem, porque as duas aparecem em tarefa.

**Decisão.**

1. **Empresa pelo temporário, primeiro**: `deploy.buscaclientes` → Busca
   Cliente, `producao.mpitemporario` → MPI Solutions. O caso da tarefa e a
   fila (ADR-123) só decidem quando não há temporário ("Apontado via
   registro."). Se o caso ou a fila discordarem do temporário, o terminal
   avisa e o temporário manda.
2. **Repositório = o segmento depois da barra do temporário**, quando parece
   domínio (o slug do Bitbucket é o domínio, PRD §9); sem ele, o slug é o
   próprio domínio real. O commit do `geral.php` vai para esse repositório;
   propriedades, e-mail de vhost e registro usam o domínio real, e o registro
   na tarefa diz qual repositório recebeu (ou não recebeu) o commit quando
   difere.
3. **Domínio real = o outro domínio da tarefa**: o do assunto, depois os do
   comentário, tirando os hosts da infraestrutura e os e-mails
   (`joao@empresa.com.br` não é domínio); o primeiro que **não for o do
   caminho do temporário**. Só quando não há outro, é o mesmo do caminho.
   `.eco.br` e afins passam.
4. `ID do painel 4521` vale como `ID 4521`; `ID do painel xxxx` (o modelo sem
   preencher) é "sem ID", pendência.

**O que aconteceu em 01/10/2026, das 11:32 às 11:37, e as duas travas.** Com
o Hub 1.0.55 instalado (ADR-132, sem o "s" na lista de hosts nossos), o
interruptor foi ligado com a tarefa `00TbL00000fX8X7UAK` (caso 00017497,
ECOLIFE SERVICOS E NEGOCIOS AMBIENTAIS LTDA) na fila. O assunto não trazia
domínio e o primeiro host do comentário era `deploy.buscaclientes.com.br`,
que a triagem tomou por domínio do cliente. O freio de emergência foi
apertado 10 s depois, mas o fluxo estava dentro do `google:createProject`
(4,5 min varrendo 2.643 propriedades) e seguiu até o fim: criou a propriedade
GA4 `properties/556986609` (G-YC76NMLGS1, conta "Busca Cliente 16"), o
container GTM-NJHC88QT (conta "Busca Cliente - Clientes", publicado) e a
chave reCAPTCHA `6LezydgtAAAAAKCrJUfzqIXbEt7EoCaiNWm5WQp0`, todos com o nome
`deploy.buscaclientes.com.br`; o commit falhou (sem "Workspace do Bitbucket"
configurada, o token não lista workspaces); o **e-mail "Criação de Vhost e
Banco - Busca Cliente - deploy.buscaclientes.com.br" saiu** para o suporte da
M3 às 11:37:01; a tarefa foi para "Em andamento" com o registro disso no feed
do caso. Tudo está no `hub-2026-10-01.txt`. Duas travas, as duas testadas:

- **Host nosso nunca é domínio de cliente**: `publicarBuscaOne` desiste
  antes de qualquer efeito quando o domínio é um host da infraestrutura
  (`ehHostInfra`: mpitemporario, buscacliente(s), idealtrends, bitbucket,
  salesforce…), venha de onde vier.
- **O freio vale entre as etapas da tarefa**, não só entre tarefas:
  `deps.parar()` é conferido antes de começar, antes do commit e antes do
  e-mail; apertado, nada mais sai (ao religar, as propriedades são
  reaproveitadas). Depois do e-mail o registro na tarefa ainda é feito,
  porque o e-mail saiu e a tarefa tem que dizer.

A limpeza do que foi criado é manual (o Hub não gerencia o ciclo de vida das
propriedades, PRD §5): apagar ou renomear a propriedade, o container e a
chave; avisar a M3; apagar o comentário que foi parar no feed do caso; e
preencher a "Workspace do Bitbucket" da marca antes da próxima rodada.

**Consequências.** A tarefa escrita no modelo acima sai inteira pela triagem
(`test-triagem` tem o exemplo); tarefa antiga sem temporário continua
dependendo do caso/fila para a empresa. O domínio do assunto deixou de ser
soberano: se ele repetir o repositório e o comentário trouxer outro domínio,
o outro vence — é o que o modelo pede. Um terceiro domínio solto no
comentário (uma referência, por exemplo) poderia ser tomado por domínio real;
o terminal diz qual foi escolhido, e o modelo padronizado evita o caso.

---

## ADR-134 — Busca One: as chaves saem no terminal, não em comentário no Salesforce

**Status:** aceita (substitui o item 3.iv da ADR-132).

**Contexto.** A ADR-132 mandava, no fim da parte automática, um comentário
no feed do caso com o resumo (GA, GTM, site key, token, commit, e-mail).
Depois da rodada de 01/10/2026 (ADR-133), que deixou esse comentário com os
IDs errados no caso 00017497, o Guilherme foi direto: "por que ele comentou
as tags no Salesforce? Não é para fazer isso, as tags são apenas para eu ver
e colocar no código; no Salesforce não tem necessidade."

**Decisão.** A publicação Busca One **não escreve nada no Salesforce além do
status**: a tarefa vai para "Em andamento" no nome de quem está logado
(`salesforce:moverTarefa`, confirmado na ADR-132) e só. O resumo — chaves
públicas, ID do painel e origem, repositório e resultado do commit, e-mail
enviado, pendências e o que falta — sai **no terminal do Hub**, linha a
linha, e por isso também no arquivo de log do dia (ADR-096/109). O texto
continua em `feito.tarefa.texto` no resultado, para quem quiser usar. A
opção `marcar: false` do `salesforce:fecharTarefa` (ADR-132) saiu junto: não
tinha outro uso.

**Consequências.** Quem publica vê as chaves onde já olha (o terminal) e as
põe no código; o atendimento não recebe ruído no caso. O comentário de
fechamento "Site publicado" do Publicar MPI+ (ADR-089) não muda: aquele é
aviso, este era registro.

---

## ADR-135 — "Quando publicou": a data pela tarefa concluída no Salesforce, senão pelo commit do geral.php / client.inc.php

**Contexto.** Pedido de 01/10/2026, com uma lista de ~80 domínios: "preciso
descobrir pelo Salesforce e/ou Bitbucket quando foi publicado; pelo Salesforce
ele tem que achar a tarefa de publicação com status concluído; se não achar,
procurar no Bitbucket pelo domínio e pelo commit no geral.php e/ou
client.inc.php; ao achar um ou outro, 'publicado em'; sem repositório; não
encontrado". Parte da lista vinha anotada à mão ("domínio correto X dia
03/08", "trocou o domínio", "não achei tarefa"), o que diz duas coisas: o
domínio da tarefa nem sempre é o da lista (cliente trocou de domínio), e a
resposta tem que ser uma linha por domínio, copiável.

**Decisão.** Uma ferramenta nova, **Quando publicou** (`lib/quando-publicou.js`
puro; `publicacao:quando` no processo principal; tela de lista na sidebar), e
um executor de linha de comando (`tools/quando-publicou.js`) para rodar a
mesma consulta sem abrir o Hub:

1. **Salesforce primeiro.** Busca global (SOSL) pelo domínio — enxerga assunto
   e comentários (ADR-097) — e, entre as tarefas que citam o domínio de
   verdade (`textoTemDominio`), a de publicação (`/publica/i` no assunto)
   **concluída** mais recente. A data é `CompletedDateTime` (sem o campo, a
   última modificação). Sem tarefa que cite o domínio, a **reserva é a conta**
   (`acharContaPorDominio`, ADR-117) e as tarefas de publicação dos casos
   dela: foi assim que `vidracarianovaebenezer.com.br` achou a tarefa de
   `vidrosealuminios.com.br` (03/08/2026), exatamente a anotação à mão.
2. **Bitbucket depois.** Sem tarefa concluída: o repositório com o nome do
   domínio nas workspaces das marcas (`busca-clientes`, `mpi-solutions`, do
   hub-state), os arquivos `geral.php` e `client.inc.php` onde estiverem (até
   3 níveis) e os commits que mexeram neles (`/commits?path=`). Entre eles,
   **o que pôs as chaves de verdade no arquivo** — o diff do commit
   (`/diff/{hash}?path=`) com uma linha adicionada `$tagmanager = 'GTM-…'` ou
   `$idAnalytics = 'G-…'`/`'UA-…'` —, lido do mais antigo para o mais novo e
   parando no primeiro. Sem nenhum, o mais antigo cuja mensagem fala em
   publicação ("Ajustes para publicação", "[Feat] Publicação"); sem nenhum,
   um **palpite** (a primeira mudança no arquivo depois da criação), dito
   como palpite na resposta e no detalhe. Tarefa aberta no Salesforce entra
   no detalhe, não decide.

   *Atualização no mesmo dia:* a primeira versão pegava o commit **mais
   recente** com "publicação" na mensagem, senão o mais recente de todos. Na
   lista real, quatro sites caíram num commit de manutenção de 22/09/2026
   ("feat: inclui nova lógica de metrificação dos leads no painel") e um na
   troca do reCAPTCHA de 29/09/2026; `perinilocacoes.com.br`, anotado à mão
   como 25/03, saiu como 22/09. Daí a regra por conteúdo. O 429 do Bitbucket
   (cota por hora) espera o `Retry-After` e repete, até 3 vezes.
3. **Respostas**: `publicado em dd/mm/aaaa (Salesforce: tarefa de publicação
   concluída)`, `publicado em dd/mm/aaaa (Bitbucket: commit em inc/geral.php)`,
   `sem repositório` (nem tarefa concluída nem repositório) e `não encontrado`
   (repositório sem esses arquivos ou sem commit neles). A tela mostra uma
   linha por domínio com o detalhe (tarefa, caso, conta ou commit e hash),
   copia tudo como "domínio - resposta" e salva `.xlsx`.
4. **Fora do Hub.** As credenciais estão no `safeStorage`, que só o Electron
   abre: o executor roda sob o Electron (`node_modules\.bin\electron
   tools\quando-publicou.js lista.txt saida.xlsx`), num perfil temporário com
   a cópia do "Local State" (é de lá que o safeStorage tira a chave no
   Windows), sem tocar no perfil do Hub aberto; o token do Salesforce, se
   vencido, é renovado só na memória do processo.

**Consequências.** `test-quando-publicou` cobre as escolhas (tarefa concluída
x aberta, commit de publicação x mais recente, org sem CompletedDateTime,
reserva pela conta, sem repositório, não encontrado, 403 = permissão) e o
cliente do Bitbucket com `pedir()` falso. A lista de 01/10 (80 domínios)
rodou pelo executor: as anotações à mão bateram com o que o Hub achou. A
busca global é aproximada e o `textoTemDominio` é o filtro: tarefa de
"outrodominio.com.br" não conta. O Hub continua não gerenciando propriedades
nem repositórios; só lê.

---

## ADR-136 — Sessão do Salesforce: 403 no userinfo é token vencido, renova em vez de pedir reconexão

**Contexto.** "Enquanto o Hub estiver aberto ele não deslogar do Salesforce"
(01/10/2026). O log mostrou o que era o "deslogar": toda manhã, na primeira
chamada (`GET /services/oauth2/userinfo`, o "quem sou eu" da home e da fila),
`HTTP 403` e o aviso "reconecte nas configurações" — 30/09 às 08:25, 01/10 às
08:53, e uma rajada de 23 em 2 s em 28/09 às 16:11, depois de um tempo
parado. O Hub renova a sessão sozinho (`sfComSessao` → `sfRenovar` com o
refresh token) quando a API responde **401 INVALID_SESSION_ID**; mas o
endpoint `userinfo` responde **403 Bad_OAuth_Token** para o mesmo token
vencido, e 403 era tratado como "sem permissão, reconecte" (ADR-093). Nunca
chegava a renovar.

**Decisão.** `ehSessaoInvalida` (lib/salesforce.js) passa a considerar
sessão vencida também o **403 com `Bad_OAuth_Token` no corpo, ou qualquer 403
em `/services/oauth2/userinfo`**; 403 numa consulta REST continua sendo
permissão (não renova). Com isso o `sfComSessao` renova e repete, e a manhã
começa conectada. Não há temporizador de "manter vivo": a renovação sob
demanda já cobre, e um timer seria mais uma coisa rodando com o Hub parado
(ADR-126). Se um dia o refresh token for revogado, aí sim o Hub pede
reconexão, como antes.

**Consequências.** `test-salesforce` cobre os três casos (403
Bad_OAuth_Token no userinfo, 403 sem corpo no userinfo, 403 de permissão numa
consulta). A ADR-093 continua valendo para o 403 que não é token vencido.

---

## ADR-137 — Suspensão / Ativação SSL: o formulário em uma coluna, como o mockup

**Contexto.** 01/10/2026, com a tela aberta: "arruma isso também, ele está
quebrado". A tela de suspensão (e a de SSL, que é a mesma) estava com os
campos num grid de duas colunas (`grid-2`), com rótulos técnicos ("Destinatário
(Para) · dest", "Template de assunto · tags", "Corpo do e-mail · plain text"),
o campo de domínios espremido na coluna da esquerda com a da direita vazia, e
um botão "Verificar apontamento e preparar e-mails" com linha de "timeout /
safe dispatch". O mockup da v2.4 (`ssl-1.png`) é uma coluna só: Projeto, Para,
Cc, Assunto, Corpo, Domínios (grande) e "Verificar apontamento".

**Decisão.** O formulário segue o mockup: uma coluna, rótulos curtos (Para,
Cc, Assunto, Corpo, Domínios), domínios com 8 linhas, botão "Verificar
apontamento". Nada muda no comportamento (os ids dos campos e o fluxo são os
mesmos); o harness de preview (`tools/preview.js`) continua sem erro de
console nas duas telas.

---

## Pendências conhecidas (não são decisões — são dívidas)

- **Cache de data streams e slot reaproveitado** (ADR-131): o cache vale 30
  dias e, se ele acha, a busca nem vai à API. Quando um slot é reaproveitado
  para um cliente novo (ADR-016), por até 30 dias a busca pelo cliente novo
  acha 0 propriedades sem nenhuma chamada, e a do cliente antigo ainda devolve
  o slot com o domínio velho (reproduzido com a API falsa do
  `test-gtm-template.js`). A conferência antes de criar propriedade (ADR-046)
  usa a mesma varredura: pode deixar criar duplicada. Proposta: confirmar na
  API o que o cache achou (uma chamada) e, quando nada casar, reler também as
  do cache antes de dizer que não existe.

- `package.json` ainda se identifica como `pr-merge-tool` / `"PR Merge Tool"` /
  `com.castrotech.prmergetool`. O instalador sai com o nome antigo.
- `toolCategory()` em `app.js` é código morto — definido e nunca chamado.
- `oauth-config.json` guarda o Client Secret e `oauth-token.json` guarda o
  refresh token, ambos em texto (ver ADR-004 e ADR-013).
- **MPI+ não tem template de GTM próprio** — usa o da Busca Cliente (ADR-015).
- **Se o tenant do Azure bloquear registro de app**, a ferramenta de suspensão
  não tem plano B implementado (ADR-023).
- **Completar um container criado pela metade** não existe: a ferramenta só cria
  do zero (ADR-019). Rodar de novo gera um container novo.
- **Migrar containers entre contas do GTM** não é possível pela API nem pela
  interface — só recriar no destino, o que gera um `GTM-ID` novo e obriga a
  atualizar e republicar cada site. Ver a conversa sobre isso antes de tratar
  como tarefa simples.
- **Credencial dentro da pasta do projeto** — e, até a ADR-024, dentro do
  instalador também. Um JSON de service account com
  `private_key` e um `.txt` com o API Token do Bitbucket foram encontrados
  soltos na raiz, num zip. As duas credenciais foram revogadas e recriadas. O
  `.txt` já saiu; o JSON **ainda está na raiz** e precisa ser movido para fora
  do repositório — o campo "Caminho do arquivo da Service Account" nas
  configurações aceita qualquer caminho absoluto, justamente para o arquivo
  morar fora daqui. Não basta `.gitignore`: o certo é o arquivo não existir
  nesta pasta.
- O commit do `geral.php` não tem trava contra escrita concorrente (ver ADR-009).
- A **Search Console API** precisa ser habilitada no projeto do Google Cloud
  para o sitemap e o `sites.add` funcionarem (ADR-038). O escopo já está na
  lista da service account; habilitar a API é passo manual no console.
- **Janelas ocultas do painel que sobram depois da automação** (ADR-125): no
  Hub instalado, 3 processos (~330 MB), nascidos quando a automação abriu o
  painel, seguiam vivos uma hora depois, embora o código devolva a janela com
  prazo de 3 min (`painelSoltarJanela`). Falta descobrir se são janelas que
  escaparam do cache ou processos que o Chromium mantém para o site.
