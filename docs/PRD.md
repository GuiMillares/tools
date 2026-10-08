# PRD — Hub

Documento de produto do Hub. Serve para responder, sem precisar ler o código,
três perguntas: **para que o app existe**, **o que cada ferramenta promete** e
**o que está deliberadamente fora**.

Decisões técnicas e o porquê delas moram na [ADR](./ADR.md). Aqui é o quê, lá é
o como.

---

## 1. O problema

Publicar o site de um cliente novo é uma sequência fixa de tarefas manuais,
espalhadas por cinco interfaces web diferentes, que ninguém lembra de cor e
onde errar sai caro:

1. Mergear o PR no Bitbucket, conferindo aprovação e build.
2. Criar propriedade GA4 + data stream no Google Analytics.
3. Criar container no Tag Manager, com a tag e a variável do Analytics, e
   publicar.
4. Criar a chave reCAPTCHA.
5. Pegar o token de verificação do Search Console.
6. Colar os cinco valores no `geral.php` do repositório e commitar.
7. Rodar o `git pull` no servidor, por um terminal web (Guacamole), sem SSH.

São ~20 minutos de clique repetitivo por projeto, com pontos onde um erro só
aparece semanas depois (propriedade criada na conta errada, container duplicado,
`geral.php` com variável vazia em produção).

Some-se a isso um bug conhecido do Google: a tela normal de "Adicionar funções e
restrições de dados" do Analytics às vezes rejeita e-mails de service account com
"Esse e-mail não corresponde a uma Conta do Google", mesmo sendo válido — o que
trava a automação antes dela começar.

## 2. Para quem

Um desenvolvedor de uma agência que publica sites de clientes. Uma pessoa, uma
máquina Windows, sem servidor e sem multiusuário. Já tem as credenciais e as
permissões nas mãos; o que não tem é paciência para a sequência de cliques.

Isso define o produto mais do que qualquer requisito funcional: **o Hub é uma
ferramenta de desenvolvedor, não um produto de consumo.** Rápido, denso, sem
onboarding, sem animação longa, sem confirmação desnecessária.

## 3. Princípios

1. **Nada trava o programa.** Etapa que falha vira aviso destacado e o resto
   continua. Resultado parcial é normal e a tela diz exatamente o que faltou.
2. **O app nunca mente sobre o que fez.** O terminal mostra cada chamada e cada
   resposta. Se uma etapa foi pulada, está lá.
3. **Nenhuma ação destrutiva silenciosa.** Sobrescrever valor existente, criar
   container duplicado, mergear sem aprovação — tudo avisa antes ou registra
   depois.
4. **O trabalho volta em texto.** Todo resultado dá para copiar; o app nunca é o
   único lugar onde o dado existe.
5. **Cor é informação.** Ver ADR-010.

## 4. Ferramentas

### 4.1 Mergear PRs — `git`

Cola o link de um PR do Bitbucket e mergeia sem passar pela interface web.

- Aceita vários links em sequência, formando uma fila.
- Cada card mostra repositório, título, autor, branch origem → destino,
  aprovações e status do build.
- Sem aprovação **ou** com build falhado, o botão de merge fica âmbar e o app
  confirma antes de prosseguir. Não bloqueia — avisa.
- Estratégia (merge commit / squash / fast forward) e "fechar branch de origem"
  vêm das configurações.
- Depois de mergeado, o card oferece o comando de deploy daquele domínio.

Aba **Histórico**: cada tentativa de merge fica registrada — inclusive as que
falharam, que são as mais úteis de consultar depois. Cada entrada guarda
repositório, PR, título, autor, branches, aprovações e build **no momento do
merge**, a estratégia usada, o hash resultante ou o erro, e o trecho do terminal
daquela operação (ver ADR-014). Dá para filtrar por repositório, título, autor
ou branch, copiar o log e tirar dali o comando de deploy do domínio. Limpar o
terminal não apaga nada do histórico.

### 4.2 Comando de deploy — `deploy`

Gera o comando de atualização do site e copia para a área de transferência, para
colar no terminal do Guacamole (não há SSH direto aos servidores).

Variantes: `git pull` simples · `git pull --no-rebase` (divergência) ·
`add + commit + pull + push` (quando há alteração local no servidor).

Formato: `cd web/DOMINIO/public_html && …`

### 4.3 Criar propriedades — `google`

Duas abas, porque projeto novo e reformulação são fluxos diferentes.

**Aba "Criar novo"** — dado um domínio e uma marca, cria o que estiver marcado
em **O que criar** (as quatro etapas vêm marcadas por padrão):

| Etapa | API | Bloqueante? |
| --- | --- | --- |
| Propriedade GA4 + data stream web | Analytics Admin v1beta | sim |
| Container GTM reproduzindo o template da marca, publicado | Tag Manager v2 | não |
| Chave reCAPTCHA v2 checkbox (+ secret legado) | reCAPTCHA Enterprise v1 | não |
| Token de verificação do Search Console | Site Verification v1 | não |

Ao final, monta o template do `geral.php` e — se a caixa estiver marcada —
commita direto no repositório do domínio com a mensagem
`Ajustes para publicação`.

**Painel do cliente:** `$idProjetoBusca` sai preenchido — fixo por marca quando
ela declara (MPI Solutions = 39, sem campo na tela) ou digitado num campo logo
abaixo do domínio (ADR-034). Em branco, a variável não entra no commit em vez de
apagar o que o repositório já tem.

**MPI+ não commita:** os projetos dela não têm repositório no Bitbucket, então a
caixa do commit fica desabilitada e o botão não aparece no resultado (ADR-033).
O template é gerado do mesmo jeito, para copiar à mão. E o MPI+ **não termina
aqui**: esta tela cria as propriedades e sincroniza as tags no painel; a
publicação inteira (Registro.br, Cloudflare, aprovar, publicar, SSL, planilha)
é o Publicar MPI+ (4.7), e o resultado tem um botão que leva para lá com os
dados preenchidos e começa (ADR-073).

A seleção existe porque nem todo caso é projeto novo: reformulação em que só
falta o reCAPTCHA, cliente que já tem Analytics, container a ser refeito
sozinho. **O container do GTM depende do GA4** e a caixa dele fica travada sem
ele — sem o Measurement ID a variável de medição sairia vazia e o container
ficaria com cara de pronto rastreando nada (ADR-027). Etapa não pedida aparece
como *não pedido* no resultado, nunca como falha.

A estrutura do container vem de um **modelo exportado do próprio Tag Manager**,
um por marca (ver ADR-015). A Busca Cliente usa o modelo mínimo — uma tag do
Google Tag disparando em todas as páginas. A MPI Solutions usa um modelo com 15
tags de evento de clique (telefone, WhatsApp, redes sociais, CTA de orçamento,
e-mail), seus 15 triggers e as variáveis embutidas que eles precisam. MPI+ ainda
não tem modelo próprio e usa o da Busca Cliente, avisando.

Atenção ao recorte das contas (ADR-017): no Analytics cada marca tem conta
própria, mas no Tag Manager **Busca Cliente e MPI+ dividem a conta "Busca
Cliente - Clientes"**. Por isso a checagem de container duplicado de um projeto
MPI+ enxerga os containers da Busca Cliente — é a mesma conta.

O container do modelo grande leva cerca de um minuto e meio para ficar pronto:
a API do Tag Manager limita ~30 chamadas por minuto e o modelo da MPI Solutions
são 38. O terminal avisa a estimativa antes de começar e mostra cada pausa
(ver ADR-019).

Logo depois de criar o container, a **conta do Google da marca** recebe acesso
de publicação nele (ADR-020, ADR-035) — sem isso o container criado pela service
account abre em somente leitura, e cada projeto novo viraria um ajuste manual de
permissão. Isso vale **mesmo quando a conta já é administradora da conta do
Tag Manager**: a permissão de container é separada da de conta (ADR-139).

**A conta depende da superfície** (ADR-067). Analytics e Search Console usam a
conta da marca; o Tag Manager pode usar outra, porque as tags nem sempre são
operadas pelo mesmo login:

| Marca | Analytics e Search Console | Tag Manager |
| --- | --- | --- |
| Busca Cliente | `bcrelatorios` | `bcrelatoriotags` |
| MPI Solutions | `ferramentasmpisolutions` | `ferramentasmpisolutions` |
| MPI+ | `bcrelatoriotags` | `bcrelatoriotags` |

E há um caso que depende do Registro.br: quando um projeto **MPI+** tem contato
técnico da MPI Solutions, só o Tag Manager muda de lugar — o container nasce na
conta "MPI Solutions" e o acesso vai para o login dela. Analytics e Search
Console continuam na conta da MPI+.

Avisa (sem impedir) quando já existe container com o mesmo nome. A verificação
do Search Console em si é um botão separado, para rodar **depois** do deploy,
quando a tag já está no ar — e é ele também que **passa a posse** da propriedade
para a conta da marca, porque quem verifica é a service account (ADR-028).

**Aba "Buscar existente"** — para reformulação de site, onde o Analytics e o
Tag Manager do cliente devem ser reaproveitados em vez de recriados. Recebe
domínio ou nome do cliente, varre as contas no escopo de busca da marca e mostra
Measurement IDs e GTM-IDs encontrados. Quando o resultado é único, já preenche o
`geral.php`; quando é ambíguo, deixa de fora e avisa — não chuta.

Duas coisas que essa aba faz diferente do resto (ADR-016): busca num escopo mais
largo que o de criação, porque muita coisa é anterior à convenção de contas; e
casa o termo pelo **domínio configurado no data stream**, não pelo nome da
propriedade — os nomes são slots genéricos ("Busca Cliente 01") que nunca viram
o domínio do cliente.

### 4.4 Conceder acesso — `google`

Contorna o bug do Google descrito na seção 1, que acontece igual no Analytics e
no Tag Manager. Um seletor escolhe **onde conceder**; o resto do fluxo é o
mesmo: login OAuth manual (uma vez por conta Google que administra as contas),
lista as contas da marca escolhida e concede acesso da service account em todas
de uma vez.

As duas são hierarquias separadas — conceder numa não concede na outra, então
rode uma vez para cada. No Tag Manager o papel padrão é Administrador, porque
criar container exige permissão no nível da conta (ver ADR-018).

A sessão se renova sozinha (ver ADR-013). Quando ela cai de vez — revogada, ou
consentimento removido — o app avisa em amarelo o que fazer e volta o cartão
para "não conectado", em vez de errar com a mensagem interna da biblioteca.

Cada conta é tratada isoladamente: falha numa não impede as demais. O papel
concedido é escolhível (Administrador é o padrão; Editor já basta para "Criar
propriedades" funcionar).

### 4.5 Suspender sites — `deploy`

Cola-se a lista de domínios, um por linha. O app **consulta o DNS de cada um**
e separa por onde o site está hospedado (ADR-025): a faixa da M3 Solutions vira
e-mail de suspensão para o suporte, a do Vesta vira uma lista para suspender à
mão no painel, e o que não aponta para nós fica de fora. Domínio que não
resolveu, ou que tem IPs em faixas diferentes, aparece em grupo próprio, para
alguém olhar.

O envio é pela sua própria caixa do Outlook (Microsoft Graph — ver ADR-023),
um e-mail por domínio, com `{dominio}` substituído no assunto e no corpo, salvo
em Itens Enviados como qualquer e-mail seu.

Destinatário, cópia e os modelos de assunto e corpo são editáveis e ficam
gravados. Só o grupo da M3 já vem marcado; qualquer domínio pode ser marcado ou
desmarcado à mão. Antes de enviar, a tela mostra a **prévia do primeiro e-mail
montado** e pede confirmação com a contagem — nomeando o que estiver marcado
fora da faixa da M3. É ação sem desfazer, e o botão é âmbar por isso.

Para os domínios que não estão com a gente, um botão consulta o **histórico de
DNS** (ADR-026) e mostra em que período o domínio esteve em nossas faixas. É
opcional, sob demanda, e depende de uma chave de API.

O formulário (Para, Cc, Assunto, Corpo, Domínios, "Verificar apontamento") é
uma coluna só, como o mockup da v2.4 (ADR-137); a de Ativar SSL (4.9) é a
mesma tela com o seletor de projeto.

### 4.6 Publicar em massa — `google`

Uma planilha de sites da MPI+ e, por site, as duas coisas na ordem que a
publicação exige: **publicar**, se ainda não estiver publicado, e **vincular**.

A planilha entra como a equipe a tem — `.xlsx`, `.csv` ou colada do Excel — com
**Domínio** (obrigatório), **Razão social** (necessária quando não há link do
painel), **Link do painel** (opcional: sem ele o Hub acha o contrato no painel
pela razão social e, não achando, por partes do domínio, e confirma pelo link
temporário da planilha ou pela URL de produção igual ao domínio; ADR-098 e
ADR-144), **Link temporário** (opcional) e **Link do caso** (opcional, do
Salesforce), em qualquer ordem e com ou sem cabeçalho. O app reconhece as
colunas pelo nome e pelo conteúdo e mostra uma prévia com um seletor por
coluna, para corrigir antes de rodar (ADR-053). Linha sem link do painel e sem
razão social fica na lista, marcada e fora da rodada.

Quando a linha tem **Link do caso** e o Salesforce está conectado, o Hub, ao
terminar aquele site, cria a tarefa de publicação **dentro daquele caso**, já
concluída, no nome de quem está logado, com o domínio nos comentários e **sem
marcar ninguém** no feed (ADR-090). Serve para registrar os que já foram
publicados — inclusive migrações V1→V2. Sem a coluna, ou com o Salesforce
desconectado, nada de tarefa é criado e a publicação segue igual.

Por site, na ordem:

1. Consulta o **contato técnico** no Registro.br. Ele responde duas coisas: se o
   DNS é nosso (ADR-061) e de que empresa é o projeto, que decide a aba da
   planilha (ADR-063).
2. **Se o DNS é nosso:** monta a zona na Cloudflare da empresa. Zona que **já
   existia** com registros: mostra-a com o A da raiz destacado e, se ele estiver
   **exatamente no IP antigo conhecido** (`149.18.102.58`, na configuração),
   pede confirmação **desse domínio** e troca só esse registro para o IP novo
   (`149.18.102.39`); o resto, inclusive o e-mail, fica como está, e nameserver
   não é mexido (ADR-067). Zona **nova**: a Cloudflare varre o DNS atual, o Hub
   completa com a fotografia dos autoritativos, replica tudo e troca só a raiz
   e o `www`, preservando o e-mail no IP antigo; pede confirmação, aplica e
   troca os nameservers no Registro.br (ADR-071). Se o DNS não é nosso, o passo
   é pulado e o domínio entra na **lista dos que não estão conosco**, que sai
   em `.xlsx` no fim da rodada para o atendimento pedir o contato técnico ao
   cliente (ADR-072).

3. Lê no painel se o site já está publicado. É só leitura.
4. Se não estiver: aprova, publica em produção e ativa o SSL — este último só
   quando o DNS já apontar (ver abaixo). Se já estiver, pula direto para o
   passo 5 — nada é republicado.
5. Procura Analytics, Tag Manager e reCAPTCHA. O que existe é reaproveitado,
   nunca duplicado; o que falta é criado, se a caixa **"Criar no Google o que
   não existir"** estiver marcada. Desmarcada, ele só relata o que falta.
6. Sincroniza o painel: Integrações, Search Console e Relatório.
7. Escreve a linha na **planilha de publicações**, na aba da empresa — `MPI` ou
   `Busca Cliente` — a menos que o domínio já esteja lá, e aí não duplica. O
   nome da aba não é fixo no código: o Hub lê as abas da planilha e casa por
   aproximação, porque a aba de busca já se chamou `BUSCA` (ADR-069). Quando a
   empresa não foi descoberta, o Hub pergunta no terminal e espera a resposta
   (ADR-064).

**O SSL espera o DNS.** O painel só emite o certificado depois que o domínio
resolve para o IP de produção; pedido antes disso, ele responde sempre "Não foi
possível ativar o SSL de produção", que não diz o que falta. Então o Hub
pergunta ao DNS primeiro — a raiz, não o `www` — e só pede o certificado quando
ela já aponta para cá. Quando não aponta, a etapa é pulada com o motivo dito por
extenso: ou o IP que está lá hoje, ou que o domínio ainda não resolve e a troca
no Registro.br leva **até 2 horas** para publicar. Nada disso interrompe a
rodada: o site é publicado, vinculado e registrado na planilha do mesmo jeito.

**No fim da rodada, o aviso.** Todos os sites que ficaram sem certificado saem
juntos no terminal, cada um com o motivo, e os domínios vão para a área de
transferência — é a lista do que ativar no painel depois que o DNS propagar
(ADR-069).

A ordem não é preferência. DNS primeiro porque o SSL só emite com o domínio
apontando para o servidor novo; e o vínculo depois de publicar porque a
verificação do Search Console só passa com o site no ar, e quem põe o arquivo lá
é o painel (ADR-038).

**Uma parada só, a do DNS**, uma por domínio cujo DNS vai mudar (ADR-072).
Não há confirmação de lista: o botão diz "Publicar e vincular N sites" e a lista
está na tela. Publicar em produção e reescrever zona não têm desfazer; a zona é
revisada, e a publicação é o que o botão promete. Um site por vez, e o botão de
parar interrompe **depois** do site atual, nunca no meio do painel.

**No fim, além do SSL, a planilha dos que não estão conosco.** Razão social,
domínio, o que o Registro.br respondeu e o link do painel, em `.xlsx`, para o
atendimento, salvo em `Músicas\apontamentos` sem perguntar (ADR-082); um botão
na lista salva de novo.

**A razão social é necessária** para a etapa da planilha, e vem da planilha de
entrada. Sem ela, só essa etapa é pulada, com aviso: publicar e vincular não
dependem dela.

### 4.7 Publicar MPI+ — `google`

Um projeto MPI+ do começo ao fim, com **um botão e uma parada** (ADR-058,
ADR-071, ADR-072). Entrada: empresa (ou "descobrir"), domínio, razão social,
link do painel e, opcionalmente, hosts do DNS que só aquele cliente usa.

Na ordem: contato técnico no Registro.br (as duas contas juntas; decide se o
DNS é nosso e de que empresa é o projeto); zona na Cloudflare da empresa, com a
varredura da própria Cloudflare completada pela fotografia dos autoritativos;
a zona final, tudo replicado e só o necessário trocado (raiz e `www` para o
servidor novo, e-mail preservado no antigo, AAAA e MX antigos saem, nada com
proxy). **Aqui o Hub para**, mostra o antes e o depois com o que muda, é novo,
fica e sai, e espera "Confirmar e aplicar o DNS". Depois segue sozinho:
nameservers no Registro.br, aprovar, publicar em produção, esperar o
apontamento, SSL (ou pendente, com aviso), tags e a linha na planilha.

**O servidor de produção é o que o painel lista** na hora de publicar
(ADR-140): um só, o Hub usa; dois ou mais, pergunta no terminal qual (na
rodada em massa, uma vez por rodada; na automática, desiste e deixa para a
mão). Não há mais servidor fixo nas Configurações. **O IP de produção do
DNS é o IP público desse servidor** (ADR-141): a raiz e o `www` da zona, a
espera da propagação e o SSL usam o que o painel informa; o IP das
Configurações é só reserva, para quando o painel não informa ou lista mais
de um servidor de produção.

Contato técnico do cliente: pula Cloudflare, Registro.br e SSL, faz o resto, e
pergunta a empresa no terminal antes da planilha (ADR-064).

A lista **"Aguardando a propagação"** (ADR-103) guarda o site publicado que só
espera o DNS, com o que falta (SSL, Search Console e relatório, fechar a
tarefa), e o vigia termina cada um quando o domínio aponta. Ela tem dois tipos
de entrada: a do Registro.br, com previsão e 30 min de folga; e a do **cliente**
(ADR-142), que a publicação automática cria quando o DNS não é nosso: sem
previsão nem prazo, conferida a cada 30 min, com "Conferir agora" para não
esperar. A lista sobrevive a fechar o Hub.

Falha para a publicação com "Tentar de novo". Conferência do contato e troca de
nameservers, quando falham, perguntam no terminal se pula. Não existe botão
"Pular" fixo, e não há confirmação antes de publicar nem antes da planilha.

### 4.8 Salesforce Kanban — `salesforce`

As tarefas das filas de deploy do Salesforce (as filas `Deploy …`) e as suas,
em três colunas: **A fazer**, **Em andamento** e **Concluído** (o que fechou
nos últimos 7 dias). As colunas são os status reais da org, lidos do
`TaskStatus`, não nomes fixos (ADR-115).

- A tela inicial lista as duas filas com as próximas tarefas de cada uma e o
  botão **Kanban**, que abre o quadro já filtrado naquela fila.
- Arrastar um cartão (ou usar as setas) troca o Status no Salesforce. Mover
  para "Em andamento" também assume a tarefa no seu nome.
- Só as filas da Busca Cliente e da MPI Solutions aparecem; as outras filas
  da org (Ideal Marketing, por exemplo) ficam de fora.
- Clicar no cartão abre a tarefa: título, comentário, autor, responsável,
  prazo e o registro relacionado, com botões para mover, copiar o link e
  abrir no Salesforce. Sem Salesforce conectado, a home diz isso e aponta
  para as Configurações; nada é inventado.

### 4.9 Superfícies compartilhadas

- **Tela inicial (Hub):** saudação com o nome de quem está logado e, em
  cima, três indicadores das **suas** tarefas do Salesforce (ADR-138), cada
  um com a granularidade no próprio cartão — uma coluna por **dia** (30
  dias), por **semana** (12), por **mês inteiro** (12) ou por **ano** (3):
  **SLA médio** (dias úteis da criação à conclusão, pela fórmula do
  relatório "Done – Deploy" do painel do Salesforce; dia, semana, mês),
  **Tarefas** (concluídas e criadas; dia, semana, mês, ano) e **Publicações
  feitas** (dia, semana, mês, ano). "Concluída" é só o status Concluído,
  como no relatório "Tarefas Concluídas por analista": tarefa cancelada
  conta como criada, não como concluída (ADR-143); com o filtro em Mês, os
  números são os do painel. O número grande é o **período corrente**
  da granularidade escolhida — Dia mostra **hoje**, Semana esta semana, Mês
  este mês, Ano este ano — e o total da janela (os 30 dias, as 12 semanas…)
  fica no texto ao lado; a coluna corrente sai destacada no gráfico e marcada
  na tabela. Gráfico de colunas com tooltip, e uma tabela no lugar do gráfico
  pelo botão do cartão. Abaixo, as filas de deploy e o resumo das suas
  tarefas (abertas, entregas em menos de 24h, sem prazo) (ADR-113, ADR-115).
  WHOIS/DNS não tem mais cartão: um domínio na busca do topo, ou `whois
  <domínio>` no terminal, responde no terminal da direita. As ferramentas
  ficam na barra lateral; a grade "Automações & scripts" saiu (ADR-127). O
  painel flutuante da automação da fila (4.10) aparece em todas as telas.
- **Terminal de atividade:** painel direito, presente em todas as
  ferramentas. É onde toda chamada de API e todo aviso aparecem. Ver ADR-011.
  Minimiza (vira um trilho fino que conta o que chegou, em vermelho se veio
  erro) e fecha (o meio fica com a largura toda); volta pelo "Atividade" da
  barra lateral, e sozinho quando o Hub pergunta algo (ADR-128).
  Mostra as últimas 3.000 linhas (vai até 3.300 antes de cortar); as mais
  antigas ficam no arquivo do dia, em Documentos\Hub\logs, e a primeira linha
  do terminal avisa quando o corte começou. Pergunta ainda sem resposta nunca
  sai da tela (ADR-096, ADR-109). Tem **linha de comando**: o que você digita
  roda no shell do Windows (nslookup, ping, curl, git…), com `dns`, `whois`,
  `limpar`, `parar` e `ajuda` do próprio Hub, e **atalhos** (`#dns`,
  `#whois`, `#testar-dns-todos`…) que já pegam o domínio da tela (ADR-115).
  "Copiar" copia o que está na tela.
- **Git Bash:** um bash de verdade (o do Git for Windows, com o seu perfil,
  prompt e cores), embaixo do painel do meio, com a cara do terminal do
  Antigravity. Abre pelo "Git Bash" da barra lateral ou Ctrl+Shift+'; a borda
  de cima muda a altura; `+` abre outro, a lixeira encerra, e ele maximiza,
  minimiza e fecha (fechado, o bash continua vivo até a lixeira). Ctrl+C copia
  a seleção (sem seleção, interrompe); Ctrl+V cola (ADR-128). Redimensionar
  não duplica nem pica linhas: o bash roda no ConPTY do Windows Terminal (que
  vem no node-pty) e só fica sabendo do tamanho novo quando a borda é solta
  (ADR-129).
- **Topo:** a busca (Ctrl+K: Enter abre o módulo pelo nome, sem ligar para
  acento, ou consulta o WHOIS se for um domínio, ADR-127), memória e CPU de
  verdade (soma dos processos do Electron) e quem está logado. Não há rodapé nem pílulas de sessão: o que
  está conectado e configurado (Bitbucket, Salesforce, Microsoft,
  Cloudflare, Registro.br, servidor Hestia) aparece na auditoria de
  credenciais das Configurações, que lê tudo ao abrir (ADR-126).
- **Configurações:** uma tela com seis abas: Geral & Git, Contas Google &
  Azure, Cloudflare & Registro.br, Salesforce & Servidores, Painéis & /Doutor
  e Conceder acesso (a ferramenta 4.4 mora aqui). Em cima, a auditoria de
  credenciais diz o que está gravado nesta máquina, sem revelar valor, e
  "Testar todas" confere as sessões no terminal. Ctrl+S salva.
- **Sessão do Salesforce:** conectada uma vez, renova-se sozinha enquanto o
  Hub estiver aberto, inclusive na primeira chamada da manhã (ADR-136); só
  pede reconexão se o Salesforce revogar o acesso.

### 4.10 Automação da fila — painel flutuante

Um monitor que lê a fila de deploy do Salesforce a cada 5 minutos e executa
sozinho o que já sabe fazer, uma tarefa por vez (ADR-119, ADR-120). Mora num
painel flutuante no canto da tela, com **três interruptores que começam sempre
desligados** — um automatizador não religa sozinho ao abrir o app —, "Rodar
agora" e o freio de emergência, que desliga tudo. Antes de agir, cada
varredura escreve a **anotação da fila** numa linha: quantas tarefas abertas,
os domínios por tipo (publicação MPI+, Busca One, bloqueio), quem está na
lista de espera e não será tocado, e quantas já foram tratadas na sessão
(ADR-142). Cada tarefa tem o desfecho no terminal (feito / aguardando, com o
motivo / pulei, com o motivo / erro), não só o resumo; erro comum tenta de novo
até três varreduras e aí deixa para a mão. O painel mostra, embaixo do status,
os domínios que **aguardam o cliente apontar** e os que aguardam a propagação,
lidos da lista de espera do Publicar MPI+ (sobrevive a reabrir o Hub).

| Interruptor | Tarefa da fila | O que o Hub faz | Como termina |
| --- | --- | --- | --- |
| Bloqueio de contatos | `BLOQUEIO DE CONTATOS - {domínio}` / `RETIRAR CONTATOS…` | descobre a marca pelo IP e censura os contatos no /doutor (Busca Cliente, MPI Solutions) ou no painel MPI+ (ADR-116, ADR-121) | fecha a tarefa comentando "Contatos removidos" |
| Publicação MPI+ | `Publicação (Troca de DNS) [MPI+] - {domínio}` com temporário `cliente.mpitemporario.com.br` | o Publicar MPI+ (4.7) inteiro, sem perguntar: backup do DNS do cliente no lugar da parada, empresa pelo caso/fila (ADR-122, ADR-123) | fecha a tarefa quando o site está no ar (SSL com o vigia, se o DNS demorar). **DNS do cliente**: publica, faz tags e planilha, e o site vai para a lista de espera como "aguardando o cliente" (ADR-142); a tarefa fica anotada e a fila segue para a próxima; o vigia confere a cada 30 min e termina SSL, Search Console e tarefa quando o cliente apontar |
| Publicação Busca One | `Publicação (Troca de DNS) - …` com o temporário `deploy.buscaclientes.com.br/{repo}/` (Busca Cliente) ou `producao.mpitemporario.com.br/{repo}/` (MPI Solutions) no comentário, ou "Apontado via registro." | a **parte automática** (ADR-132, ADR-133): cria ou acha as propriedades no Google na marca da empresa, commita o `geral.php` no repositório do Bitbucket com `$idProjetoBusca` = o "ID do painel xxxx" da tarefa (MPI Solutions: fixo 39) e manda o e-mail de criação de vhost e banco ao suporte, com o modelo da empresa | a tarefa vai para **Em andamento** no seu nome e **fica aberta**: vhost, clone no servidor e DNS são manuais. As chaves e o resumo saem no terminal, nunca em comentário no Salesforce (ADR-134) |

Na Busca One, tudo vem da própria tarefa, escrita no modelo combinado com o
atendimento:

```
- link temporário: https://deploy.buscaclientes.com.br/ecolifeambiental.eco.br/

ecolifeambiental.eco.br - domínio para ser usado
ID do painel 4521
```

O **temporário diz a empresa** (`deploy.buscaclientes` = Busca Cliente,
`producao.mpitemporario` = MPI Solutions); o que vem **depois da barra é o
repositório** do Bitbucket, que nem sempre coincide com o domínio; o
**domínio real é o outro domínio da tarefa** (título ou comentário, fora os
nossos hosts e os e-mails), e é ele que vai para as propriedades, o
`geral.php` e o e-mail. Sem temporário, a empresa vem do caso da tarefa e
depois da fila. O destinatário e a cópia do e-mail de vhost são editáveis no
painel e ficam gravados; o assunto ("Criação de Vhost e Banco - Busca
Cliente - {domínio}", ou "- MPI -") e o corpo são fixos, do jeito que a
equipe manda. Nada é enviado sem a conta Microsoft conectada, o Bitbucket
configurado e a service account do Google — e, faltando qualquer um, nada é
feito (nem as propriedades), para a tarefa ser retomada inteira depois.

### 4.11 Quando publicou — `hosting`

Uma lista de domínios (colada ou planilha) e, para cada um, **quando o site
foi publicado**, numa linha copiável (ADR-135):

1. **Salesforce**: a tarefa de publicação **concluída** que cita o domínio
   (assunto ou comentários), com a data de conclusão. Sem tarefa que cite o
   domínio, a conta do cliente e as tarefas de publicação dos casos dela,
   para quem trocou de domínio.
2. **Bitbucket**, sem tarefa concluída: o repositório com o nome do domínio e
   o commit que mexeu no `geral.php` ou no `client.inc.php`, de preferência o
   que fala em publicação.

Respostas: `publicado em dd/mm/aaaa (Salesforce: …)` ou `(Bitbucket: commit
em …)`, `sem repositório`, `não encontrado`. A tela mostra o detalhe (tarefa e
caso, conta, ou commit e hash), copia tudo como "domínio - resposta" e salva
`.xlsx`. Com o Salesforce desconectado, consulta só o Bitbucket e avisa. A
mesma consulta roda fora do Hub, sob o Electron, com
`tools/quando-publicou.js`.

### 4.12 Conferir vínculos — `google`

Uma lista de clientes MPI+ e, para cada um, **o que o painel MPI+ mostra
hoje** nas duas telas do vínculo, sem gravar nada (ADR-144):

- **Entrada.** Um botão lê a planilha de publicações (as abas MPI e Busca
  Cliente) e fica só com as linhas de Tipo **MPI+**; ou uma planilha / texto
  colado com razão social, domínio e, se houver, link do painel e link
  temporário, nas colunas que o Publicar em massa já reconhece.
- **Achar o contrato.** Linha sem link: busca no painel pela razão social e,
  não achando, por partes do domínio e pelas palavras fortes da razão social;
  com mais de um contrato, fica com o **publicado no domínio** da planilha (a
  URL de produção que o painel informa); com link temporário na lista, ele
  manda. Termo largo só abre projeto cujo nome cita o domínio, com teto de
  páginas por site. Não achando, a conta do Salesforce dá outro nome. Nada
  disso clica ou grava no painel.
- **Ler.** Depois de o painel se montar (o gancho da aba Publicação, o
  `enabled` da configuração, o contrato remoto do Relatório; vindo vazio, lê de
  novo): Configuração → 5. Integrações (Analytics `G-…`, Tag Manager `GTM-…`,
  Search Console, reCAPTCHA), Relatório → Conexão (propriedade GA4, site do
  Search Console, as contas e o selo OK/Pendente) e o estado da publicação. E,
  fora do painel, o **HTML do site**: as tags que estão de fato no ar
  (ADR-145).
- **Veredito.** *Vinculado*: as três tags nas Integrações e o Relatório com
  Analytics e Search Console preenchidos e conexão validada. *Incompleto*: o
  painel carregou e falta algo, dito pelo nome (inclusive Search Console do
  Relatório apontando para outro site), e o HTML do site concorda. *Não
  consegui ler*: o painel não carregou a tempo ou leu vazio com tag no ar
  (leitura suspeita); nunca vira pronto. *Não achei no painel*: com os termos
  tentados e os contratos vistos. O reCAPTCHA é observação, não falta.
- **504 e segunda passada.** Página do painel que responde 504 é repetida (20
  s, 40 s) e não derruba o cliente; no fim da rodada, quem ficou com erro
  passageiro ou leitura suspeita é conferido de novo.
- **Vincular os incompletos.** Um botão, com a caixa "Criar no Google o que não
  existir": para cada "Incompleto" ou "Não consegui ler" com link do painel,
  o mesmo caminho do Publicar MPI+: procura (ou cria) Analytics, Tag Manager,
  reCAPTCHA e Search Console, sincroniza Integrações e Relatório no painel e
  lê de novo; o veredito é a releitura, e a coluna "Ação do Hub" diz o que foi
  feito e o que não fechou. "Não achei" não entra: não há onde vincular.
- **Saída.** A lista na tela com um selo por cliente, "Copiar resultado" e
  **"Salvar planilha (.xlsx)"** com três abas: **Resumo** (totais e
  percentuais, por empresa, o que mais falta), **Clientes** (tudo, com o link
  do painel, as tags no HTML, se está publicado, a ação do Hub e como o
  contrato foi achado) e **Pendências** (só quem não está vinculado). A aba
  Clientes serve de entrada para a próxima conferência, sem procurar os
  contratos de novo.

Um cliente por vez; "Parar depois deste" interrompe sem perder o que já foi
lido. A conferência fica **salva em arquivo** a cada cliente: fechar o Hub não
perde nada, "Continuar" retoma de onde parou e "Descartar" limpa. A rodada
nunca para por um cliente não achado: ele vai para as Pendências e o próximo
começa.

### 4.13 Ouvidoria & Auditoria — `salesforce`

Uma planilha **só com domínios** (ou colados) vira uma auditoria por domínio
(ADR-111, ADR-117, ADR-147):

1. **A conta no Salesforce**, por confiança graduada: razão social (se a
   planilha trouxer) > Website da conta > domínio no assunto de um caso >
   contato com e-mail do domínio > tarefa de publicação. Só resolve com uma
   conta clara; senão marca revisar.
2. **Não achando, o AppSheet** ("Backup Informações Busca Cliente", view
   Informações Cliente): o Hub procura o domínio lá, lê a **razão social** e
   volta ao Salesforce por ela. O AppSheet pede login com o Google: na
   primeira vez a janela aparece para você entrar (ou "Entrar no AppSheet"
   antes); a sessão fica guardada na máquina. Dá para desligar essa reserva.
3. **Na conta**: a aba **Contratos** diz **Ativo** (qualquer contrato ativo)
   ou **Desativado**; o Hub anota o status, o detalhe de cada contrato com o
   período e o **link da conta**. E os casos de **Ouvidoria** (Definição,
   Data de Conclusão): Situação e "Ativar SSL?" (não se Cancelado/Jurídico).
4. **Saída**: .xlsx com Domínio, Razão Social, Contrato, Link da conta,
   Detalhe dos contratos, Como achou, Situação Ouvidoria, Ativar SSL? e
   Cliente; com a coluna cliente na entrada, só Busca Cliente e MPI Solutions
   são conferidos e o resto vai para a aba "Outros clientes".

## 5. Fora de escopo

Explicitamente **não** é objetivo do Hub, e um pedido nessa direção deve virar
conversa antes de virar código:

- Multiusuário, sincronização entre máquinas, backend próprio.
- Substituir a interface do Bitbucket para revisão de código (o Hub mergeia, não
  revisa diff).
- Rodar deploy sozinho — o comando é copiado, quem executa é o humano, no
  Guacamole.
- Editar arquivos do repositório além do `geral.php`.
- Relatórios, dashboards ou leitura de dados do Analytics.
- Gerenciar o ciclo de vida das propriedades (renomear, arquivar, excluir).
- Suporte a macOS/Linux. É um app Windows.

## 6. Requisitos não-funcionais

- **Plataforma:** Windows, Electron, Node 18+.
- **Segurança:** ver ADR-002 e ADR-004. Credenciais nunca saem da máquina, a não
  ser para as APIs do Bitbucket e do Google.
- **Desempenho:** a operação mais longa ("criar tudo") leva alguns segundos e
  mostra progresso ao vivo no terminal. Nada roda em silêncio. Na publicação, a
  janela do painel é reaproveitada entre as etapas e as esperas são por
  condição, não por tempo fixo (ADR-072); o que sobra de espera é o relógio
  dos outros: propagação de DNS, job de publicação, emissão do certificado.
- **Consumo medido** (ADR-106 a ADR-109, ADR-125 e ADR-126, i5 de 4 núcleos
  e 16 GB). **O Hub parado não desenha: 0,06% da máquina**, contra 3,8% na
  mesma tela (1366×720) e ~11% no monitor de 2560×1080 com o redesign v2.4 de
  29/09, que tinha pontos pulsando para sempre. Nada pulsa para sempre: o
  "ocupado" e o "pendente" piscam em degraus e só com a janela em foco (0,7%
  enquanto algo roda; esmaecendo seriam 2,2% a 4%). A janela desacelera em
  segundo plano, menos durante a rodada em massa, a automação e as etapas da
  publicação. Ao abrir, 1,35 s e ~390 MB somando os processos do Electron. O
  Google só é carregado na primeira ação que usa ele (~0,35 s a mais, uma vez
  por sessão). Abrir uma ferramenta leva ~26 ms (mediana), a lista de uma
  rodada de 32 sites ~60 ms (0,8 s com 3.000), e a tela do terminal guarda só
  as últimas linhas. Quem mexer em algo que pese mede antes e depois com `npm
  run medir` (com `--por-cima` para a medida não depender das outras janelas);
  consumo "visível" só vale com prova de que a janela desenhou, e o medidor
  traz a prova: conta os quadros antes do parado e do minimizado, anota se a
  janela estava minimizada e marca como inválido o parado com a janela
  minimizada ou escondida, ou mexida no meio (ADR-126, ADR-130). `npm test`
  roda a suíte inteira e `npm run bench` as partes locais.
- **Offline:** o app abre e navega sem rede; as operações falham com mensagem
  clara.
- **Acessibilidade:** anel de foco visível e consistente; navegação por teclado
  nos campos principais (Enter dispara a ação da tela).
- **Movimento:** abertura, troca de tela, hover e clique têm animação curta
  (nada passa de 400 ms) e `prefers-reduced-motion` desliga tudo (ADR-115).

## 7. Pré-requisitos de configuração

Sem isso o app abre mas não faz nada útil:

1. **Bitbucket:** API Token (não App Password — ver ADR-005) com
   `read:repository`, `read:pullrequest`, `write:pullrequest`, `read:workspace` e
   escrita no repositório. Configurar "Workspace do Bitbucket" é opcional mas
   recomendado: sem ela o app precisa varrer as workspaces para achar o
   repositório (ADR-021).
2. **Google Cloud:** projeto com Analytics Admin API, Tag Manager API, Site
   Verification API e reCAPTCHA Enterprise API ativadas.
3. **Service Account:** JSON baixado; e-mail adicionado como Editor nas contas do
   Analytics e com permissão de Gerenciar nas contas do Tag Manager. Para criar
   container é preciso ser Admin no nível de **conta** do GTM, não só do
   container.
4. **OAuth Client ID** do tipo "Aplicativo para computador", com a tela de
   consentimento configurada e cada e-mail administrador na lista de usuários de
   teste. Os escopos incluem Analytics e Tag Manager (ver ADR-018).
5. **Registro de aplicativo no Azure (Entra)**, para o envio de e-mail e para a
   planilha de publicações: cliente público, `http://localhost` cadastrado como
   "Aplicativos móveis e computador", e as permissões **delegadas**
   `User.Read`, `Mail.Send`, `offline_access` e `Files.ReadWrite`. A lista tem
   que bater com a constante `MS_SCOPES` do código: escopo que o app pede e o
   registro não declara falha na renovação da sessão com `AADSTS65001`, não na
   hora de usar (ver ADR-068).
6. **Git for Windows**, para o Git Bash dentro do Hub. A instalação por usuário
   (`AppData\Local\Programs\Git`) serve; sem ela, o resto do Hub funciona e o
   Git Bash diz o que instalar (ADR-128).

## 8. Como o produto cresce

Uma ferramenta nova é: uma entrada no array `TOOLS` (`renderer/app.js`), uma
função `renderNomeDaFerramenta()` que desenha o painel esquerdo, e — se precisar
de rede — um handler no `main.js` mais uma linha no `preload.js`.

A ferramenta nova herda de graça o terminal, as configurações, a busca e os
recentes. O que ela precisa respeitar são os princípios da seção 3, em especial
o primeiro.

## 9. Glossário

| Termo | Significado aqui |
| --- | --- |
| **Marca / projeto** | Busca Cliente, MPI Solutions ou MPI+. Decide em quais contas do Google o app mexe. Ver ADR-008. |
| **Busca One** | A plataforma dos sites da Busca Cliente e da MPI Solutions: repositório no Bitbucket, `geral.php`, vhost criado pelo suporte e deploy pelo Guacamole. O contrário de MPI+, que é publicado pelo painel. Ver ADR-132. |
| **`geral.php`** | Arquivo de configuração no repositório de cada site, onde ficam os IDs de Analytics, GTM, Search Console e as chaves do reCAPTCHA. |
| **Guacamole** | Terminal web usado para acessar os servidores. Não há SSH direto. |
| **Slug do repositório** | É sempre o domínio do site (`layoutcenografia.com.br`). |
| **Etapa bloqueante** | Etapa cuja falha interrompe a operação. Só o GA4 é. Ver ADR-007. |

## 10. Backlog conhecido

Nada aqui está prometido — é a lista do que já se sabe que falta.

- Renomear a identidade do app no `package.json` (ainda sai como "PR Merge
  Tool"; ver Pendências na ADR).
- Guardar o Client Secret do OAuth no `safeStorage`.
- Desfazer/limpar container GTM duplicado que o próprio app detectou.
- Escolher manualmente qual resultado usar quando a busca por tags existentes é
  ambígua (hoje só avisa e deixa de fora).
- Persistir a fila de PRs entre sessões.
- Exportar o histórico de merges (CSV/JSON) para relatório.
- Template de GTM próprio para MPI+ (hoje usa o da Busca Cliente).
- Mover o JSON da service account para fora da pasta do projeto.
