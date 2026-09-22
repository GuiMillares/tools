# Hub

App desktop (Windows) que reúne suas ferramentas de rotina numa tela só: uma tela inicial com busca e cards das ferramentas, cada uma abrindo no painel esquerdo, com um terminal de atividade fixo à direita.

Ferramentas disponíveis hoje:

- **Mergear PRs**: cola o link do PR do Bitbucket, confere aprovações e build, e mergeia. A aba **Histórico** guarda cada merge feito (e cada um que falhou) junto com o trecho do terminal daquele momento
- **Criar propriedades**: cria o que você marcar em **O que criar**: propriedade GA4 + data stream, container GTM reproduzindo o modelo da marca (`templates/`) já publicado, chave reCAPTCHA (compatível com o `siteverify` clássico) e token do Search Console, pra um domínio; gera o template pronto do `geral.php` e commita ele no repositório.
- **Buscar propriedades**: para reformulações. Acha o Analytics e o Tag Manager que o cliente já tem, com o ID pronto para copiar, em vez de criar novos.
- **Publicar MPI+**: o projeto do começo ao fim, com um botão e uma parada. Confere no Registro.br se o contato técnico é nosso (BCTDL ou MPSOL83, as duas contas consultadas juntas); se for, cria a zona na Cloudflare da empresa (Busca Cliente ou MPI Solutions), deixa a própria Cloudflare varrer o DNS atual, completa com a fotografia dos autoritativos (DKIM, DMARC, SRV, os hosts que você acrescentar) e monta a zona final: **tudo replicado**, só a raiz e o `www` vão para o servidor novo, e-mail preservado no antigo (CNAME para a raiz vira A para o IP antigo, MX na raiz vira `mail.` com A para o IP antigo, o MX e o AAAA antigos saem, nada com proxy). Aí para, mostra o antes e o depois, e espera o seu "Confirmar e aplicar o DNS". Depois segue sozinho: nameservers no Registro.br, aprovar, publicar em produção, SSL quando o domínio apontar (se ainda não apontar, marca como pendente e avisa), tags e a linha na planilha de publicações do SharePoint. Se o DNS for do cliente, pula Cloudflare, Registro.br e SSL e faz só aprovar, publicar, tags e planilha. Etapa que falha para a publicação com "Tentar de novo"; conferência do contato e troca de nameservers, quando falham, perguntam no terminal se pula. Não há mais confirmação antes de publicar nem antes da planilha: a única é a do DNS
- **Publicar em massa**: uma planilha de sites da MPI+, e por site o caminho inteiro, sem confirmação de lista: o botão diz o que faz. Confere no Registro.br se o contato técnico é nosso, o que decide duas coisas: se mexemos no DNS e de que empresa é o projeto. Sendo nosso, monta a zona na Cloudflare: se a zona **já existia** com registros, mostra-a com o A da raiz destacado e, se ele estiver no IP antigo conhecido (`149.18.102.58`), pede seu ok e troca **só esse registro** para `149.18.102.39`, sem mexer no resto nem em nameserver; se a zona é **nova**, a Cloudflare varre o DNS atual, o Hub completa com os autoritativos, replica tudo e troca só raiz e `www`, pede seu ok, aplica e troca os nameservers no Registro.br. Não sendo nosso, pula o DNS e guarda o domínio na lista dos **que não estão conosco**, que sai em `.xlsx` no fim da rodada (razão social, domínio, o que o Registro.br disse, link do painel), salvo sem perguntar em `Músicas\apontamentos` com o caminho no terminal, para o atendimento pedir o contato técnico ao cliente; o botão na lista salva de novo quando quiser. Depois lê no painel se o site já está publicado e, se não estiver, aprova e publica em produção (quem já estava publicado pula direto). O SSL só é pedido quando o domínio já resolve para o IP de produção; quem ficar sem certificado entra numa lista no fim da rodada. Em seguida procura Analytics, Tag Manager e reCAPTCHA (reaproveita o que existe, cria o que faltar se a caixa estiver marcada) e sincroniza o painel. Por fim escreve a linha na planilha de publicações, na aba da empresa, sem duplicar; quando a empresa não for descoberta, pergunta no terminal. A planilha de entrada vem como ela é (.xlsx, .csv ou colada do Excel, com **razão social, domínio e link do painel** em qualquer ordem, com ou sem cabeçalho): o app reconhece as colunas e mostra a prévia antes de rodar. A razão social é necessária para a etapa da planilha.
- **Salesforce (em construção)**: o Hub entra com a sua conta pelo aplicativo conectado que a própria Salesforce distribui com a ferramenta de linha de comando, porque a organização não cria aplicativo conectado para nós e a API recusa autenticação por cookie de sessão. É OAuth normal, com PKCE e retorno em `http://localhost:1717`, e o token fica criptografado nesta máquina. Duas consequências que você precisa saber: o histórico de login do Salesforce vai registrar **"Salesforce CLI"** como o aplicativo (não "Hub"), e tudo que ele fizer lá sai **no seu nome**. Configure o domínio da empresa em Configurações e use "Conferir a conexão" para o Hub ler os valores reais (status de concluída, tipos de registro, campos próprios e as filas de Deploy) em vez de chutar. Ver ADR-086
- **Ativar SSL**: o mesmo caminho da suspensão, com outro pedido. Consulta o DNS, e para quem está na **M3 Solutions** envia "Ativação SSL - Busca Cliente (ou MPI Solutions) - domínio" com o corpo "Solicito ativação SSL do projeto domínio"; quem está no **Vesta** aparece em lista para ativar à mão
- **Suspender sites**: cola a lista de domínios, o app consulta o DNS de cada um e separa por onde está hospedado: o que está na **M3 Solutions** vai por e-mail para o suporte (pela sua caixa do Outlook, com cópia fixa), o que está no **Vesta** aparece em lista para suspender à mão, e o que não aponta para nós fica de fora. Para esses últimos dá para consultar no histórico de DNS quando o domínio esteve em nossas faixas
- **Conceder acesso**: login manual único (sua conta, não a service account) e concede acesso da service account em várias contas de uma vez, no **Analytics ou no Tag Manager**, contorna um bug conhecido do Google onde a tela normal de "adicionar usuário" rejeita e-mails de service account com "Esse e-mail não corresponde a uma Conta do Google"

### Sessão do Google de cada marca

Nas configurações, cada marca tem um botão **Conectar**. Vale a pena fazer uma
vez por marca: registrar a propriedade no Search Console só a coloca na lista de
**quem chama a API**. Feito pela service account, ela nasce fora do Search
Console da marca, é por isso que ela aparecia já validada, mas alguém precisava
criá-la à mão. Com a sessão conectada, o Hub registra pela própria conta e a
propriedade nasce lá, e depois confere na lista dela se está mesmo.

O login usa o mesmo Client ID e Secret do OAuth, e confere o e-mail: se você
entrar com outra conta que não a configurada para aquela marca, a sessão não é
gravada.

## 8. Configurando a integração Google (ferramenta "Criar propriedades")

Essa ferramenta usa uma **Service Account** do Google Cloud (uma "conta robô", sem login manual, sem expirar). Resumo dos passos, se precisar do roteiro completo, é só perguntar:

1. Criar um projeto no [Google Cloud Console](https://console.cloud.google.com)
2. Ativar as APIs: Google Analytics Admin API, Tag Manager API, Google Site Verification API, reCAPTCHA Enterprise API e **Google Search Console API** (esta última é usada para registrar a propriedade e enviar o sitemap dos projetos MPI+)
3. Criar uma Service Account, baixar a chave em formato JSON
4. Adicionar o e-mail da service account como Editor na conta do Google Analytics, e com permissão de Gerenciar na conta do Tag Manager
5. Nas configurações do app (engrenagem), colar o caminho do arquivo JSON no campo "Caminho do arquivo da Service Account"
6. Preencher a **conta do Google de cada marca**. Quem cria o container do Tag Manager e quem verifica o site é a service account, que não tem login de navegador, essa conta é quem recebe o acesso de publicação no container e a posse da propriedade do Search Console:

   | Marca | Analytics e Search Console | Tag Manager |
   | --- | --- | --- |
   | Busca Cliente | `bcrelatorios@gmail.com` | `bcrelatoriotags@gmail.com` |
   | MPI Solutions | `ferramentasmpisolutions@gmail.com` | `ferramentasmpisolutions@gmail.com` |
   | MPI+ | `bcrelatoriotags@gmail.com` | `bcrelatoriotags@gmail.com` |

   O Tag Manager da Busca Cliente usa o login da MPI+ de propósito: as duas
   marcas dividem a conta "Busca Cliente - Clientes" no Tag Manager, e é nesse
   login que a equipe abre as tags. Por isso basta preencher os três e-mails
   acima; o da coluna do Tag Manager sai do que já está configurado (ADR-067).

   E quando um projeto **MPI+** tem contato técnico da MPI Solutions, só o Tag
   Manager muda: o container nasce na conta "MPI Solutions" e o acesso vai para
   o login dela.

7. O campo **"Conta principal do Google"** é só o padrão, usado quando a marca acima está em branco. O terminal diz de onde veio a conta a cada criação, em amarelo quando caiu no padrão

### Verificando o Search Console

A verificação é um botão separado, para rodar **depois** do deploy, quando a tag já está no ar. Ele faz duas coisas: verifica a propriedade e **passa a posse** dela para o e-mail configurado na marca. A ordem é obrigatória, a API só aceita adicionar proprietário em site já verificado.

Quem recebe a posse é a conta da marca (a mesma que administra o container do Tag Manager). A propriedade criada é a do **`www`**: `https://www.dominio.com.br/`. Propriedade de prefixo de URL no Search Console é por prefixo exato, verificar `https://dominio.com.br/` não produz nada em `https://www.dominio.com.br/`, são duas propriedades diferentes para o Google. O token do `geral.php` é da conta, não do endereço, então ele serve para as duas.

Se a propriedade não aparecer sozinha na lista do Search Console dessa conta, adicione o domínio por lá: como a conta já é proprietária, a verificação passa sem pedir tag nova.

### Painel do cliente

`$idProjetoBusca` é o painel do cliente, e agora sai preenchido:

| Marca | Como |
| --- | --- |
| Busca Cliente | campo logo abaixo do domínio, só dígitos |
| MPI Solutions | fixo em `39`, sem campo, a tela só informa |
| MPI+ | campo, como Busca Cliente |

Em branco, o template sai com `'xxxx'` e a variável não entra no commit, o app não apaga o que já está no repositório, e avisa em amarelo antes de começar. O valor não fica guardado entre projetos, de propósito: painel do cliente anterior indo junto no commit seguinte seria erro difícil de notar.

Para mudar o valor fixo de uma marca, é uma linha em `BRANDS`, no `renderer/app.js`.

### MPI+ é diferente em três pontos

Os projetos da MPI+ não têm repositório no Bitbucket: a caixa "Commitar o geral.php" fica desabilitada e o botão de commit não aparece no resultado, o template é gerado igual, para copiar e colar à mão.

Também não têm painel do cliente, então o campo `$idProjetoBusca` nem aparece. No lugar dele há o campo **"Link do painel do projeto"**, onde se cola o endereço do projeto no painel MPI+.

E a conta do Google é sempre a da marca (`bcrelatoriotags`): se ela não estiver configurada, o app recusa em vez de usar a conta principal.

### Sincronização no painel (MPI+)

Ao terminar de criar um projeto MPI+, o Hub executa uma sequência em que **a ordem importa**:

1. **Integrações no painel**, é isso que faz o arquivo de verificação ir ao ar no site
2. **Verificar no Search Console**, antes, o app baixa o HTML do site e confere se a tag do GA4 (ou o container do GTM) já está lá, tentando algumas vezes enquanto o site publica
3. **Sitemap**, registra a propriedade e envia `sitemap.xml`
4. **Relatório no painel**, com a propriedade verificada, o trilho do Search Console passa

Se o passo 2 falhar, o passo 4 não roda: sincronizar o relatório sabendo que ele vai dar `fail` só registra um erro previsível. Publique o site e use o botão **"Sincronizar no painel"**, que refaz a sequência inteira.

As duas telas do painel são:

1. **Configuração → 5. Integrações**: reCAPTCHA (site key + secret), Tag Manager, Analytics e Search Console. Cada bloco só conta como sincronizado quando a mensagem verde do painel aparece; o terminal mostra o texto que o painel devolveu.
2. **Relatório → Conexão Relatório**: conta OAuth (a da marca), ID da conta e da propriedade do Analytics, e a URL do site no Search Console. Depois, o Sincronizar que valida a conexão.

Para isso funcionar, preencha na engrenagem o **e-mail e a senha do painel**. A senha fica criptografada nesta máquina, como o token do Bitbucket, e a sessão do painel é reaproveitada, o login não acontece toda vez. O botão "Remover credenciais" apaga as duas coisas.

Se algum bloco falhar, o terminal diz qual e por quê, e o botão **"Sincronizar no painel"** no cartão de resultado repete a operação sem recriar nada no Google.

**O Search Console da MPI+ é diferente em três pontos:** a propriedade é o domínio **sem www**; a verificação é feita pelo **Google Analytics** (a tag do GA já está no ar porque o painel a instala, e quem criou a propriedade do GA4 foi a service account); e o campo "Key" do painel recebe o **conteúdo do arquivo** de verificação, `google-site-verification: google....html`, que é o que a equipe cola ali à mão. Esse campo não decide a verificação (ver ADR-040 e ADR-043).

### Rodar de novo é seguro

Cada etapa procura antes de criar: se já existir propriedade GA4, container do GTM ou chave do reCAPTCHA com o nome do domínio, o Hub **reaproveita** e diz isso no terminal, em vez de criar uma segunda. Container reaproveitado não recebe o template de novo nem é republicado.

Se achar **mais de um** candidato, ele para aquela etapa e lista os IDs, não escolhe nem cria. Duplicata é sinal de que alguém já mexeu à mão, e chutar qual é o bom sairia caro.

No fim, o terminal resume o que foi reaproveitado, para a diferença entre "criei" e "achei" nunca ficar implícita.

### Escolhendo o que criar

As quatro etapas vêm marcadas, o que atende projeto novo. Desmarque o que não precisa, reformulação em que só falta a chave do reCAPTCHA, cliente que já tem Analytics, container a ser refeito sozinho. O rótulo do botão acompanha a seleção (*Criar reCAPTCHA*, *Criar GA + GTM*, *Criar tudo (...)*), e a seleção fica gravada para a próxima vez.

**O container do GTM depende do GA4.** A caixa dele fica travada enquanto o Analytics estiver desmarcado, porque o container reproduz o modelo da marca com a variável de medição apontando para a propriedade recém-criada: sem o Measurement ID ele nasceria com cara de pronto e sem rastrear nada.

No resultado, etapa que você não pediu aparece como *não pedido*, não como falha. "Faltou" fica reservado para o que foi pedido e não veio.

O `$idCliente` do template continua manual, é interno, não vem do Google. O `$idProjetoBusca` passou a ser preenchido pela tela (ver acima).

**O JSON da service account não deve ficar dentro da pasta do projeto.** O campo de configuração aceita qualquer caminho absoluto, guarde o arquivo em outro lugar (por exemplo `%APPDATA%\\Hub\\`) e aponte o caminho para lá.

### Modelos de container do GTM

A estrutura do container criado vem de uma exportação do próprio Tag Manager, guardada em `templates/`, uma por marca, mapeada em `GTM_TEMPLATES` no `main.js`. Para trocar o que é criado, exporte o container-modelo pelo Tag Manager (Admin → Exportar container) e substitua o arquivo; não precisa mexer em código. MPI+ ainda usa o modelo da Busca Cliente, e o app avisa isso no terminal.

O commit do `geral.php` reaproveita a credencial do Bitbucket (a mesma do "Mergear PRs"), então o API Token precisa ter permissão de escrita no repositório, além de `write:pullrequest`. O repositório é o próprio domínio e o commit vai pra branch principal, com a mensagem `Ajustes para publicação`.

## 9. Configurando o login manual (ferramenta "Conceder acesso")

Além da Service Account, essa ferramenta precisa de um **OAuth Client ID** (tipo "Aplicativo para computador") no mesmo projeto do Google Cloud, porque conceder acesso a uma conta que a service account ainda não tem exige um humano autorizando. Resumo:

1. No Google Cloud Console, configurar a Tela de consentimento OAuth (Externo), e adicionar cada e-mail Google que administra as contas do Analytics como usuário de teste
2. Criar credencial do tipo "ID do cliente OAuth" → Aplicativo para computador
3. Colar o Client ID e o Client Secret gerados nas configurações do Hub
4. Na ferramenta, clicar em "Conectar com sua conta Google" (abre o navegador pra login), escolher **onde conceder** (Analytics ou Tag Manager), carregar ou colar os IDs numéricos das contas (um por linha) e clicar em conceder acesso

Analytics e Tag Manager são hierarquias separadas do Google: conceder numa não concede na outra. Rode uma vez para cada. No Tag Manager use **Administrador**, criar container exige permissão no nível da conta.

Se você conectou antes da versão que passou a cobrir o Tag Manager, o app vai avisar que falta permissão: é só desconectar e conectar de novo.

O login se renova sozinho: a autorização pede `access_type=offline`, então o app guarda um refresh token e não precisa reconectar todo dia. Se a sessão cair mesmo assim (acesso revogado em myaccount.google.com/permissions, ou consentimento removido), o Hub avisa em amarelo e o cartão volta pra "Nenhuma conta conectada", é só conectar de novo.

Se você já estava conectado numa versão anterior, vai precisar conectar uma vez: o token antigo não tem refresh, e o app descarta ele no primeiro uso.

## 1. Pré-requisitos

- Node.js instalado (18 ou mais recente): https://nodejs.org

## 2. Instalar

Abra um terminal (PowerShell) dentro da pasta `pr-merge-tool` e rode:

```
npm install
```

Rode de novo sempre que o `package.json` mudar. A leitura de planilhas `.xlsx`
(ferramenta "Publicar em massa") depende do pacote `xlsx`, que entra por aqui.

## 3. Rodar

```
npm start
```

## 4. Criar o API Token do Bitbucket

Desde julho de 2026 o Bitbucket Cloud não aceita mais App Password, é obrigatório usar API Token:

1. Acesse https://id.atlassian.com/manage-profile/security/api-tokens
2. Clique em **Create API token**, dê um nome como "pr-merge-tool" e defina uma validade (ex: 1 ano)
3. Copie o token gerado (ele só aparece uma vez)
4. No app, clique no ícone de engrenagem no canto superior direito e preencha:
   - **E-mail**: o e-mail da sua conta Atlassian/Bitbucket
   - **API Token**: o token que você acabou de copiar
5. Clique em **Salvar**

O token fica salvo só nessa máquina, criptografado pelo Windows (DPAPI), não é enviado a lugar nenhum além da API do Bitbucket.

### Escopos que o token precisa

O Bitbucket dá permissão por área, e **escopo de pull request não dá escopo de repositório**, nem `write` dá `read`. Um token criado só para mergear PRs não consegue commitar o `geral.php`:

| Escopo | Para quê |
| --- | --- |
| `read:pullrequest:bitbucket` · `write:pullrequest:bitbucket` | ler e mergear PRs |
| `read:repository:bitbucket` | ler o `geral.php` do repositório |
| `write:repository:bitbucket` | gravar o commit |
| `read:workspace:bitbucket` | descobrir a workspace, dispensável se você preencher a workspace da marca nas configurações |

### Workspace por marca

`busca-clientes` e `mpi-solutions` são workspaces diferentes, e o repositório de um projeto existe só na sua. Por isso a configuração é uma workspace **por marca**, com um campo "Padrão" usado quando a marca está em branco:

| Marca | Workspace |
| --- | --- |
| Busca Cliente | `busca-clientes` |
| MPI Solutions | `mpi-solutions` |
| MPI+ |, não tem repositório no Bitbucket |

Vazio nos dois, o app tenta descobrir a workspace, e aí vale o aviso: o Bitbucket responde **404 "Resource not found"**, não 403, para o que a credencial não tem permissão de ver. Se aparecer `Não consegui descobrir suas workspaces`, preencher a workspace da marca resolve na hora, porque esse passo deixa de acontecer.

O terminal diz qual workspace usou e de onde ela veio, para "repositório não encontrado" nunca ficar ambíguo.

Se o commit falhar depois de o app ter **lido** o arquivo, sobram só duas causas, e o terminal diz as duas: falta `write:repository:bitbucket`, ou a branch tem restrição em *Repository settings › Branch restrictions* exigindo pull request para qualquer mudança.

## 5. Usar

1. Cole o link do PR que a pessoa te mandou (ex: `https://bitbucket.org/workspace/repo/pull-requests/42`) e aperte Enter
2. O card mostra título, autor, branch de origem/destino, aprovações e status do build
3. Clique em **Mergear**. Se não houver aprovação ou o build tiver falhado, o app confirma antes de prosseguir
4. O painel direito mostra em tempo real cada chamada feita à API e o resultado

Pode colar vários links seguidos para montar uma fila e ir mergeando um a um.

Na aba **Histórico** ficam os merges já feitos. Cada card mostra o PR, as aprovações e o build como estavam na hora, a estratégia usada e o hash, ou o erro, quando não passou. O trecho do terminal daquele merge fica junto, dobrável, e dá pra copiar. Limpar o terminal não apaga o histórico; ele fica em `merge-history.json`, na pasta de dados do app.

## 6. Gerar um instalador

```
npm run dist
```

O instalador fica em `dist/`, e o app já montado em `dist/win-unpacked/`.

**Feche o app antes de rodar.** O electron-builder apaga `dist/win-unpacked` para recriá-la, e o Windows não deixa apagar um `.exe` em execução, o erro é `Access is denied` no `d3dcompiler_47.dll`.

Só entra no pacote o que está listado em `build.files` no `package.json`: `main.js`, `preload.js`, `renderer/`, `templates/`, `assets/` e o `package.json`. É lista de inclusão de propósito, arquivo novo na raiz não vai parar dentro do instalador sem alguém decidir que vai. Antes disso, a pasta inteira era empacotada, **incluindo o JSON da service account** (ver ADR-024).

Se você fixou o app na barra de tarefas, saiba de onde o atalho aponta: se for para `dist\win-unpacked\PR Merge Tool.exe`, o `npm run dist` já atualiza. Se for para a versão instalada pelo `Setup.exe`, é preciso rodar o instalador novo depois de cada build.

## 7. Adicionando novas ferramentas

Cada ferramenta é um item no array `TOOLS` no topo de `renderer/app.js`, com uma função `renderNomeDaFerramenta()` própria que desenha o painel esquerdo. Quando quiser adicionar uma nova (outro script, outro comando repetitivo), é só pedir, a estrutura já está pronta pra crescer.

## Sobre a estratégia de merge

Nas configurações dá pra escolher entre **Merge commit**, **Squash** e **Fast forward**, e se quer fechar a branch de origem automaticamente após o merge, mesmo comportamento que você configuraria manualmente na tela de merge do Bitbucket.

## 10. Configurando o envio de e-mail (ferramenta "Suspender sites")

O envio sai da **sua** caixa do Microsoft 365, pela API do Microsoft Graph. Para isso o Hub precisa de um registro de aplicativo no Microsoft Entra da empresa. É uma vez só.

### 10.1 Criar o registro

1. Abra o [Centro de administração do Microsoft Entra](https://entra.microsoft.com) e entre com a conta que vai enviar os e-mails
2. Menu **Registros do aplicativo** → **Novo registro**
3. **Nome**: `Hub` (ou o que quiser, é só rótulo)
4. **Tipos de conta com suporte**: *Contas somente neste diretório organizacional*
5. Deixe o **URI de Redirecionamento em branco** por enquanto, ele é configurado no passo 10.3, e ali com o tipo certo
6. **Registrar**

### 10.2 Copiar os dois IDs

Você cai na página **Visão geral** do registro. Ela mostra **três** GUIDs, e dois deles vão para o Hub:

| Campo na tela do Entra | Campo nas configurações do Hub |
| --- | --- |
| **ID do aplicativo (cliente)** | Client ID do Azure |
| **ID do diretório (locatário)** | Tenant do Azure |
| ID do objeto | ⚠️ **não use** |

O **ID do objeto** fica na mesma tela, tem a mesma cara de GUID e não serve para nada aqui. Colá-lo em qualquer um dos dois campos do Hub é o erro mais comum, e cada campo falha com uma mensagem diferente: no Client ID dá `AADSTS700016`, no Tenant dá `AADSTS90002` ("tenant not found"), citando o próprio ID do objeto.

Use o **ID do diretório**, não a palavra `common`: o registro do passo 10.1 é single-tenant, e `common` falha nele com `AADSTS50194`.

### 10.3 Configurar o retorno do login

1. Menu **Autenticação** → **Adicionar uma plataforma**
2. Escolher **Aplicativos móveis e computador**, **não** "Web"
3. Na lista de URIs de redirecionamento sugeridos, marcar **`http://localhost`**
4. **Configurar**

A escolha da plataforma é o que mais importa aqui. `http://localhost` cadastrado como **Web** faz o Entra tratar o app como cliente confidencial e exigir um client secret que não existe, o erro é `AADSTS7000218`.

`http://localhost` sem porta está certo: o Entra aceita qualquer porta no loopback, e o Hub sobe um servidor local numa porta livre a cada login.

### 10.4 Permitir fluxo de cliente público

1. Ainda em **Autenticação**, role até **Configurações avançadas**
2. **Permitir fluxos de cliente público** → **Sim**
3. **Salvar**

### 10.5 Dar a permissão de envio

1. Menu **Permissões de API** → **Adicionar uma permissão**
2. **Microsoft Graph** → **Permissões delegadas** (não "Permissões de aplicativo")
3. Marcar `Mail.Send`, `User.Read`, `offline_access` e **`Files.ReadWrite`**
4. **Adicionar permissões**

O `Files.ReadWrite` é o que permite escrever na **planilha de publicações** (ADR-062). Ele entrou depois dos outros três, então quem montou o registro antes precisa acrescentá-lo agora: sem ele, a renovação da sessão falha com `AADSTS65001` citando o app "Hub", e a planilha não é gravada.

A lista tem que bater com o que o app pede, que é uma constante só no código (`MS_SCOPES`, no `main.js`). Permissão faltando ali vira `AADSTS65001` na hora de renovar, não na hora de conectar.

Confira a coluna **Status**. Se aparecer *"Não concedido para \<sua empresa\>"*, um administrador de TI precisa clicar em **Conceder consentimento do administrador**. Você mesmo consegue se for admin do tenant. Sem isso o login até acontece, mas o envio falha com `AADSTS65001`.

Depois de acrescentar a permissão, **desconecte e conecte de novo** no Hub: consentimento só é pedido numa autorização interativa nova, e a sessão antiga não ganha escopo sozinha.

### 10.6 Ligar no Hub

1. No Hub, engrenagem → colar **Client ID do Azure** e **Tenant do Azure** → **Salvar**
2. Abrir **Suspender sites** → **Conectar com sua conta Microsoft**
3. O navegador abre; entre com a conta e aceite as permissões
4. De volta no Hub, o cartão deve mostrar *Conectado como você@empresa.com.br* e o terminal registrar a conexão

Não há client secret em lugar nenhum: é um app público, o login usa PKCE, e o token fica criptografado nesta máquina pelo Windows, como o do Bitbucket.

### 10.7 Se der erro

| Mensagem | O que faltou |
| --- | --- |
| `AADSTS50194` | O campo Tenant está como `common`. Use o ID do diretório (10.2) |
| `AADSTS90002` locatário não encontrado | Tenant errado, o GUID citado no erro costuma ser o **ID do objeto**. Use o ID do diretório (locatário) (10.2) |
| `AADSTS7000218` | O `http://localhost` foi cadastrado como plataforma **Web**. Apague e recadastre em "Aplicativos móveis e computador" (10.3), e confira o 10.4 |
| `AADSTS50011` redirect mismatch | Falta o `http://localhost` na plataforma (10.3) |
| `AADSTS65001` consentimento | Ou falta a permissão na lista do registro (o caso mais comum é o `Files.ReadWrite`, que entrou depois), ou ela está lá sem o consentimento do administrador (10.5). Acrescente, conceda, e reconecte no Hub |
| `AADSTS700016` aplicativo não encontrado | Client ID errado, provavelmente o **ID do objeto** no lugar do ID do aplicativo (10.2) |
| "insufficient scopes" ao enviar | Faltou `Mail.Send` nas permissões delegadas (10.5) |

Se a sua empresa não permitir registrar aplicativos, esse caminho não funciona, nesse caso peça a versão que abre cada e-mail já preenchido no Outlook Web para você clicar em Enviar.

## 11. Triagem por apontamento (ferramenta "Suspender sites")

Antes de enviar qualquer coisa, o Hub consulta o registro `A` de cada domínio da lista e separa por faixa de IP:

| Faixa | Grupo na tela | O que acontece |
| --- | --- | --- |
| `149.18.103.x` | M3 Solutions | já vem marcado, vira e-mail de suspensão para o suporte |
| `169.57.169.x` / `169.57.141.x` | Vesta | lista para copiar e suspender à mão no painel |
| outras | Não aponta para nós | fica de fora |
|, | Não resolveu | domínio sem registro `A`; pode já estar fora do ar |
| duas faixas ao mesmo tempo | IPs em faixas diferentes | você decide |

Toda linha tem caixa de seleção: dá para incluir ou tirar qualquer domínio do envio. O que for enviado sem ser da M3 aparece nomeado na confirmação, antes de sair.

Se o domínio não tiver registro no apex, o app tenta o `www.` antes de desistir, e diz na linha quando foi por aí que ele resolveu.

As faixas ficam em `HOSTING_GROUPS`, no `main.js`. Mudou faixa, muda ali, a tela só exibe o que o processo principal devolve.

### 11.1 Histórico de DNS (opcional)

Nos grupos "Não aponta para nós" e "Não resolveu" aparece o botão **Histórico de DNS**, que responde a pergunta seguinte: esse domínio já esteve com a gente, e quando saiu?

A API usada é a **DNS Chronicle, da WhoisXML**, 500 créditos grátis, sem cartão:

1. Criar conta em https://dns-history.whoisxmlapi.com/api
2. Pegar a chave em **My products → DNS Chronicle API**
3. No Hub, engrenagem → **Chave da API de histórico de DNS (WhoisXML)** → Salvar

O resultado aparece embaixo do domínio como `2022-05-10 → 2025-01-31  149.18.103.7  M3 Solutions`. Sem janela nenhuma, o app diz que o domínio nunca apareceu em nossas faixas.

A API devolve uma linha por data observada; quem junta datas seguidas na mesma faixa em "esteve aqui de X a Y" é o Hub.

A consulta é **sob demanda, nunca automática**: cada domínio gasta pelo menos um crédito, e verificar uma lista grande gastaria a cota sem ninguém pedir. O terminal mostra quantos créditos a rodada gastou. Histórico muito longo é truncado em 3 páginas (3 créditos) e o app avisa quando isso acontece.

Se a chave for recusada (`401`) ou os créditos acabarem (`403`), o lote para no primeiro erro em vez de queimar o resto. O `403` também aparece quando a conta tem allowlist de IP e o seu não está nela.

A chave fica criptografada nesta máquina, como a do Bitbucket, e nunca volta para a tela, o campo mostra apenas "já configurada". Para removê-la, use **Remover credenciais**.

> **Por que não o SecurityTrails.** Era o plano inicial, mas o serviço não tem mais plano gratuito público, o preço hoje começa na casa dos US$ 500/mês. A WhoisXML entrega a mesma resposta com 500 créditos grátis.
