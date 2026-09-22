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
permissão.

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

### 4.6 Publicar em massa — `google`

Uma planilha de sites da MPI+ e, por site, as duas coisas na ordem que a
publicação exige: **publicar**, se ainda não estiver publicado, e **vincular**.

A planilha entra como a equipe a tem — `.xlsx`, `.csv` ou colada do Excel — com
**Domínio** (obrigatório), **Link do painel** (obrigatório), **Razão social**
(opcional) e **Link do caso** (opcional, do Salesforce), em qualquer ordem e com
ou sem cabeçalho. O app reconhece as colunas pelo nome e pelo conteúdo e mostra
uma prévia com um seletor por coluna, para corrigir antes de rodar (ADR-053).
Linha sem link válido do painel fica na lista, marcada e fora da rodada.

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

Contato técnico do cliente: pula Cloudflare, Registro.br e SSL, faz o resto, e
pergunta a empresa no terminal antes da planilha (ADR-064).

Falha para a publicação com "Tentar de novo". Conferência do contato e troca de
nameservers, quando falham, perguntam no terminal se pula. Não existe botão
"Pular" fixo, e não há confirmação antes de publicar nem antes da planilha.

### 4.8 Superfícies compartilhadas

- **Tela inicial (Hub):** busca, ferramentas recentes e grid de cards por
  categoria.
- **Terminal de atividade:** painel direito fixo, presente em todas as
  ferramentas. É onde toda chamada de API e todo aviso aparecem. Ver ADR-011.
- **Configurações (engrenagem):** credenciais do Bitbucket, estratégia de merge,
  workspace, caminho da service account, credenciais OAuth, registro do Azure e
  chave da API de histórico de DNS.

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
- **Offline:** o app abre e navega sem rede; as operações falham com mensagem
  clara.
- **Acessibilidade:** anel de foco visível e consistente; navegação por teclado
  nos campos principais (Enter dispara a ação da tela).

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
