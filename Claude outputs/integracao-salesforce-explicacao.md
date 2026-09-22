# Como o Hub conversa com o Salesforce

Explicação de como descobrimos o caminho, como a comunicação funciona por dentro,
e um prompt pronto para o Carlos entregar ao Claude dele reconstruir o mesmo no
hubber dele.

---

## Como conseguimos descobrir

O ponto de partida era um problema chato: não temos acesso à API do Salesforce
pela nossa conta, e o time não libera. Numa integração "de manual", o caminho
seria pedir a um admin para criar um *Connected App* (que gera um `client_id` /
`client_secret` próprio). Sem isso, parecia bloqueado.

A virada foi perceber que dá para entrar **pela mesma porta que a CLI oficial do
Salesforce usa**. Existe um cliente OAuth embutido em toda org, o `PlatformCLI`
— é o que o `sf` / `sfdx` usa quando um desenvolvedor roda `sf org login web`.
Como ele já existe em qualquer org, ninguém precisa criar Connected App nenhum.
Reaproveitamos exatamente esse fluxo: OAuth 2.0 *Authorization Code* com PKCE,
`client_id=PlatformCLI`, e o redirect voltando para
`http://localhost:1717/OauthRedirect` (loopback), que é o truque que a CLI usa
para receber o código no próprio computador.

A segunda descoberta importante foi de método, não de código: em vez de
*adivinhar* como a org está configurada, fizemos o Hub **ler a org e contar**. É
o "Conferir a conexão" (o diagnóstico). Foi ele que revelou, com valores reais,
cada coisa que não tínhamos como saber de fora:

- que "concluída" é o Status `Completed` (o Hub descobre isso perguntando qual
  `TaskStatus` tem `IsClosed = true`, não deixa fixo no código);
- que, para criar uma Tarefa, **só o Assunto é obrigatório de verdade** — o
  campo "Atualização Automática" parecia obrigatório mas é `defaultedOnCreate`,
  o Salesforce preenche sozinho;
- que o feed de um registro se lê em `/chatter/feeds/record/{id}/feed-elements`
  (a primeira tentativa, em `/chatter/feed-elements` sem termo de busca, tomou
  `400 MISSING_ARGUMENT`);
- e, o que só apareceu ao testar de verdade, que **a Tarefa não tem feed
  habilitado nessa org** — o `POST` no feed dela respondeu
  `400 INVALID_FIELD: Task is not enabled for feeds`. Quem tem feed é o **Caso**,
  e é lá que mora a linha "Tarefa criada" (um `CreateRecordEvent` cujo registro
  relacionado é o Id da tarefa). A captura do comentário no Lucas confirmou que o
  comentário certo é embaixo dessa linha.

Ou seja: metade veio de conhecer o truque do `PlatformCLI`, e a outra metade veio
de **ler a org e testar em tarefa real** em vez de supor. Cada erro (o do search
term, o do "Task not enabled for feeds") foi uma pista que apontou o caminho
certo.

---

## Como a comunicação funciona

Não tem SDK nem biblioteca do Salesforce. É Node puro fazendo requisições
`https` direto para a URL da instância da org, com o token no cabeçalho
`Authorization: Bearer ...` e tudo em JSON.

**Login.** O Hub abre o navegador na página de autorização da org
(`.../services/oauth2/authorize`) com `client_id=PlatformCLI`,
`response_type=code`, o `code_challenge` do PKCE e o redirect para
`localhost:1717`. Você faz login normalmente — com o seu SSO e o seu 2FA, o Hub
nunca toca nas suas credenciais — e clica em Permitir. O Salesforce devolve um
`code` para `http://localhost:1717/OauthRedirect`, onde um servidorzinho HTTP que
o Hub sobe na hora captura esse código e o troca (junto com o `code_verifier`)
por um `access_token` e um `refresh_token`. Os escopos pedidos são `api` e
`refresh_token`.

**Sessão.** Os tokens ficam guardados **criptografados** pelo `safeStorage` do
Electron, nunca em texto puro. O `refresh_token` do Salesforce não expira por
tempo, só se for revogado; então, quando uma chamada volta com
`401 INVALID_SESSION_ID`, o Hub renova a sessão uma vez e repete a chamada (é o
`sfComSessao`). Se falhar de novo, ele para e pede para reconectar, em vez de
insistir e esconder o motivo.

**API.** Com a sessão de pé, o Hub usa um punhado de rotas da API REST:

- SOQL (`/services/data/vXX/query`) para consultar;
- `describe` (`/sobjects/<obj>/describe`) para ler a configuração dos objetos;
- `GET` / `POST` / `PATCH` em `/sobjects/...` para ler, criar e atualizar
  registros;
- `composite/sobjects` para criar em lote (200 por chamada, com
  `allOrNone:false` para uma linha ruim não derrubar as outras);
- Chatter REST para o feed: ler em `/chatter/feeds/record/{id}/feed-elements`,
  postar em `/chatter/feed-elements`, e comentar embaixo de um item em
  `/chatter/feed-elements/{id}/capabilities/comments/items`.

**Fechamento da tarefa, passo a passo.** Pega o Id da tarefa a partir do link do
Lightning → lê a tarefa (dono, criador, caso relacionado) → dá `PATCH` no
`OwnerId` para passar a posse a você → resolve qual status é "concluída" pela
`TaskStatus` e dá `PATCH` no `Status` → abre o feed do **caso**, vira as páginas
procurando o `CreateRecordEvent` cujo registro relacionado é **aquela** tarefa
(um caso tem vários), e comenta embaixo dele marcando o criador. A marcação é
feita como segmento estruturado (`{type:'Mention', id:...}`), porque escrever
"@Fulano" como texto não notifica ninguém.

---

## O que o Carlos precisa saber para o hubber dele

Duas coisas são universais e ele deve reaproveitar: o truque do `PlatformCLI` +
PKCE + loopback (para não depender de um admin criar Connected App), e a
disciplina de **ler a org antes de escrever qualquer coisa**.

O resto — qual status significa concluída, quais campos são obrigatórios, se a
Tarefa tem feed, onde mora a linha "Tarefa criada" — **muda de org para org**. A
org do Carlos pode ter feed na Tarefa, pode exigir outros campos, pode chamar o
status de "Fechada" em vez de "Completed". Se ele copiar os nossos valores,
quebra. O diagnóstico é justamente o que impede isso.

### Prompt para o Claude do Carlos

Cole isto no Claude dele (Claude Code / Cowork):

```
Preciso integrar meu app Electron (chamo de "hubber") com o Salesforce para
fechar tarefas de publicação: assumir a tarefa no meu nome, marcar como
concluída e comentar no feed marcando quem criou a tarefa. Também quero, mais
para frente, criar tarefas em massa.

Restrição importante: eu NÃO tenho acesso de API pela minha conta e o time não
libera criação de Connected App. Então use o mesmo caminho que a CLI oficial do
Salesforce usa: OAuth 2.0 Authorization Code com PKCE, client_id = "PlatformCLI"
(o cliente embutido que existe em toda org), e redirect de loopback para
http://localhost:PORTA/OauthRedirect, com um pequeno servidor HTTP local que
captura o "code" e troca por access_token + refresh_token. Escopos: "api
refresh_token". O login tem que abrir o navegador e me deixar autenticar com meu
SSO e 2FA normalmente — o app NUNCA deve manusear minhas credenciais nem tentar
burlar 2FA/CAPTCHA. Guarde os tokens CRIPTOGRAFADOS (safeStorage do Electron),
nunca em texto puro. Se uma chamada voltar 401 INVALID_SESSION_ID, renove com o
refresh_token uma vez e repita; se falhar de novo, pare e me peça para reconectar.

A comunicação deve ser https puro para a URL da instância da org, com
Authorization: Bearer <token>, sem SDK. Use a API REST: SOQL em
/services/data/vXX/query, describe em /sobjects/<obj>/describe, GET/POST/PATCH em
/sobjects, composite/sobjects para lote (200 por chamada, allOrNone:false), e o
Chatter REST para o feed.

MUITO IMPORTANTE: antes de escrever qualquer lógica de escrita, construa um
"diagnóstico" que LÊ a minha org e me mostra os valores reais, porque cada org é
configurada diferente. O diagnóstico deve descobrir e me reportar:
- qual valor de Status significa concluída (consulte TaskStatus e ache o que tem
  IsClosed = true; não deixe "Completed" fixo no código);
- quais campos são REALMENTE obrigatórios para criar uma Task (regra:
  createable && !nillable && !defaultedOnCreate; ignore os que têm valor padrão
  na criação);
- os record types e as filas (queues) relevantes;
- e, dando o link de uma tarefa real, leia a tarefa (dono, criador via
  CreatedById, caso relacionado via WhatId) e leia o feed dela E o feed do caso
  em /chatter/feeds/record/{id}/feed-elements (NÃO use /chatter/feed-elements sem
  termo de busca, isso dá 400 MISSING_ARGUMENT). Me mostre, de cada item do feed,
  o tipo, o autor e o relatedRecordId.

Não assuma que a Task tem feed habilitado: em algumas orgs o POST no feed da
tarefa dá "400 INVALID_FIELD: Task is not enabled for feeds", e o feed vivo é o
do Caso. Descubra pelo diagnóstico onde vive a linha "Tarefa criada"
(um CreateRecordEvent cujo relatedRecordId é o Id da tarefa) e faça o comentário
EXATAMENTE embaixo dessa linha, virando as páginas do feed até achá-la (um caso
tem várias). A marcação da pessoa tem que ser um segmento estruturado
messageSegments [{type:'Mention', id:<userId>}, {type:'Text', text:' ...'}] —
escrever "@Nome" como texto não notifica ninguém. Se quem criou a tarefa for eu
mesmo, comente sem menção.

Comece me fazendo perguntas sobre a minha org e me entregando o diagnóstico
primeiro. Só depois que eu confirmar os valores reais é que você escreve o
fechamento da tarefa. E rode tudo com a rede simulada em teste antes de mexer em
tarefa de verdade.
```

Esse prompt já embute o que nos custou caro descobrir (o `PlatformCLI`, o
endpoint certo do feed, o "Task not enabled for feeds", a menção estruturada) e,
ao mesmo tempo, obriga o Claude dele a **conferir na org do Carlos** em vez de
copiar os nossos valores — que é o erro que ia quebrar na primeira execução.
