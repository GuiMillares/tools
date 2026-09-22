# Painel MPI+ — contrato das telas que a automação usa

Levantado em 15/09/2026 direto do DOM de
`https://idealplus.idealtrends.io/clientes/2775/hub?projeto=2851&tab=publicacao`.

**O painel é Alpine.js.** Isso muda tudo: os campos não têm `id`, mas têm
`x-model` apontando para o estado do componente. Preencher pelo estado é mais
confiável que digitar no input — digitar exigiria disparar os eventos certos
para o framework perceber, e errar isso produz campo preenchido na tela e vazio
no envio, que é a pior falha possível aqui (parece que deu certo).

Por isso a automação **lê e escreve o estado Alpine** e chama as mesmas funções
que os botões chamam, em vez de simular cliques.

## 1. Aba Configuração → bloco "5. Integrações"

Componente raiz: `mpiWpSiteConfigFactory`.

| O quê | Como chegar |
| --- | --- |
| Abrir o acordeão | `#hub-pub-config-accordion-trigger-integrations` |
| Abrir um bloco | `#hub-pub-config-block-trigger-integrations.<bloco>` |
| Raiz Alpine | `el.closest('[x-data]')` a partir de qualquer um desses ids |

Blocos: `recaptcha`, `google-tag-manager`, `google-analytics`,
`google-search-console`.

### Estado

```js
config.integrations['google-analytics'].key        // G-XXXXXXXXXX
config.integrations['google-tag-manager'].key      // GTM-XXXXXXX
config.integrations['google-search-console'].key   // conteúdo do arquivo HTML
config.integrations.recaptcha.enabled              // boolean
config.integrations.recaptcha.site_key
config.integrations.recaptcha.secret_key
```

### Sincronizar e conferir

```js
saveBlock('integrations', '<bloco>')          // o que o botão Sincronizar chama
blockSaving['integrations.<bloco>']           // true enquanto envia
blockFeedback['integrations.<bloco>'].ok      // mensagem VERDE  (.text-success)
blockFeedback['integrations.<bloco>'].error   // mensagem VERMELHA (.text-destructive)
```

O botão fica desabilitado quando
`!enabled || blockSaving[...] || !canSyncIntegrationsBlock('<bloco>')` — e no
reCAPTCHA ele nasce desabilitado com as duas chaves vazias, que são obrigatórias.

**A validação do sucesso é `blockFeedback[...].ok` virar texto não vazio.** Não
basta o `saveBlock` retornar: ele é assíncrono, e `.error` preenchido é falha
mesmo com a chamada tendo "funcionado".

## 2. Aba Relatório → "Conexão Relatório"

Componente raiz: `mpiHubRelatorioConexaoFactory`, recebe `projectId` (2851 no
exemplo — é o `?projeto=`, não o `/clientes/<id>`).

| Ação | Função |
| --- | --- |
| Trocar de sub-aba | `switchRelTab('conexao' \| 'boletim' \| 'leads')` |
| Abrir modal do Analytics | `openModal('ga')` |
| Abrir modal do Search Console | `openModal('gsc')` |
| Abrir modal do External ID | `openModal('leads')` |
| Salvar o modal aberto | `saveModal()` |
| Sincronizar | `salvarEValidarConexao()` |
| Só validar | `runHealthOnly()` |

### Como o formulário guarda os valores (importante)

São **dois** objetos, e confundi-los custou uma etapa inteira:

```js
draft   // cópia de trabalho do modal aberto
config  // o que vale; é ele que o painel valida e envia
```

`saveModal()` copia `draft → config` **só dos campos do modal aberto**, grava no
`localStorage` e fecha o modal. E começa assim:

```js
saveModal() {
  if (!this.modal) return;   // ← volta CALADO se nenhum modal está aberto
  ...
}
```

Salvar com o modal fechado não grava nada e não avisa. Quem automatiza tem que
conferir `d.modal` antes, e conferir `config` depois.

`salvarEValidarConexao()` lê **`config`**, nunca `draft`, e só passa com
`localReady === true`. Sem isso ele responde *"Preencha Analytics, Search
Console e demais campos obrigatórios"* — a mesma frase para qualquer um dos
motivos abaixo, que é por isso que ela não ajuda.

### O contrato chega depois, e troca o `config` inteiro (ADR-050)

`init()` dispara `loadRemoteContract()` em paralelo com a montagem da tela.
Quando a resposta volta:

```js
applyRemoteData(d) {
  const next = remoteToConfig(d);
  this.remotePayload = d;
  this.persistConfig(next);   // ← substitui this.config INTEIRO
}
```

Ou seja: gravar nos modais antes disso é escrever em algo que vai ser
descartado. Uma pessoa não percebe porque leva segundos clicando; a automação
grava em menos de um.

Como esperar:

```js
d.connectionOptions.length > 0   // prova que o init() rodou
d.loadingRemoteContract === false // e que o contrato já voltou
```

Nessa ordem — `loadingRemoteContract` começa `false`, então sozinho ele não
distingue "terminou" de "nem começou". Depois de gravar, vale reconferir: se os
campos sumiram, foi o servidor chegando por cima.

### `localReady`: o que ele exige de verdade

```js
get gaComplete()    { return Boolean(config.ga_connection_id && config.ga_account_key?.trim() && config.ga_property_id?.trim()); }
get gscComplete()   { return Boolean(config.gsc_connection_id && config.gsc_site_url?.trim()); }
get leadsComplete() { return Boolean(String(config.leads_external_id || '').trim()); }

get localReady() {
  if (!this.gaComplete || !this.gscComplete) return false;
  if (this.isClienteLegado && !this.leadsComplete) return false;   // ← o terceiro modal
  return true;
}
```

**São TRÊS cartões, não dois.** Quando `isClienteLegado` é verdadeiro, o painel
também exige `leads_external_id` — modal `openModal('leads')`, campo
`draft.leads_external_id`, rótulo na tela **"External ID (sistema legado)"**,
placeholder `ex.: cliente-123`. No servidor ele se chama `external_id`.

`isClienteLegado` vem do `x-data` do componente, junto de `projectId` e
`projectName`. Dá para ler antes de decidir o que preencher.

Cuidado com campo vazio: `saveModal` grava `''` sem reclamar, a conferência
"mandei X, ficou X" passa, e só `gaComplete` percebe — depois, com a frase
genérica. Valor vazio tem que ser recusado antes (ADR-048).

### Estado dos modais

```js
draft.ga_connection_id     // select: id da conexão OAuth
draft.ga_account_key       // ex.: 123456789
draft.ga_property_id       // properties/000000000
draft.gsc_connection_id    // select: id da conexão OAuth
draft.gsc_site_url         // placeholder sugere sc-domain:cliente.com.br
draft.leads_external_id    // só exigido quando isClienteLegado === true
```

### Resultado

```js
feedback.ok / feedback.error
integrationConnectionOk        // o selo "OK" / "Pendente"
gaLane() / gscLane() / leadsLane()   // 'ok' quando aquele trilho passou
lastError
```

### As conexões OAuth disponíveis

Estão no **estado** do componente, antes de qualquer modal abrir:

```js
d.connectionOptions   // [{ name: 'bcrelatoriotags@gmail.com', value: 12 }, …]
```

É daí que o `<select>` se monta (`:value="String(opt.value)"`,
`x-text="opt.name"`). Para escolher a conexão, leia daqui — não do DOM
(ADR-051). O id vai para `draft.ga_connection_id` / `draft.gsc_connection_id`
**como string**.

O `<select>` é por **id numérico**, e o id não é estável entre ambientes — a
automação casa pelo **rótulo** (o e-mail) e lê o `value` correspondente. No dia
do levantamento:

| Rótulo | value |
| --- | --- |
| `bcrelatorios@gmail.com` | 7 |
| `bcrelatorios2@gmail.com` … `bcrelatorios5@gmail.com` | 8, 9, 10, 11 |
| **`bcrelatoriotags@gmail.com`** | **12** |
| `ferramentasmpisolutions@gmail.com` | 13 |

Há outras (doutoresdaweb, webmastertools) que não interessam aqui.

## 3. Login

`https://idealplus.idealtrends.io` — formulário com **token CSRF escondido**
(`input[name=_token]`), campos `input[type=email]` e `input[type=password]`, e
uma caixa **"Manter conectado"**. O token é o motivo de a automação precisar de
um navegador de verdade em vez de um POST montado à mão; a caixa é o motivo de o
login não precisar acontecer toda vez.
