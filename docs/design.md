# Design — cores do Hub

Só cores. Tipografia, espaçamento, raios e o resto do visual estão no
`renderer/style.css` e nas decisões que o construíram: [ADR-010](./ADR.md)
(o que a cor significa), ADR-054 (uma cor de destaque só), ADR-055 (a paleta
verde-petróleo e o vidro) e ADR-056 (verde vira o destaque).

Dois temas aqui: o **escuro**, que é o app hoje, com os valores extraídos do
CSS; e o **claro**, que ainda não existe e está proposto token a token, no
mesmo papel semântico.

---

## 1. O que a cor significa

Antes dos valores, a regra que decide qual usar. Ela vem da ADR-010 e sobreviveu
a todas as reformas:

| Papel | Cor | Onde |
| --- | --- | --- |
| **Interativo** | verde-destaque | botão primário, foco, seleção, hover, ícone dos cartões |
| **Resultado bom** | verde mais fechado | badge `ok`, borda do cartão de resultado, botão "copiado", linha `success` no terminal |
| **Ressalva** | âmbar | badge `warn`, cartão pendente, linha `warn` no terminal |
| **Falhou** | vermelho | badge `err`, botão `danger` no hover, linha `error` no terminal |
| **Luz secundária** | ciano | a marca na barra, comandos (`cmd`) no terminal, indicador de ocupado |
| **Nem estado nem ação** | cinza-verde | todo o resto, sem exceção |

Interativo e resultado são **o mesmo matiz separado por tom e por forma**, não
por cor. Um é chapado e clicável, o outro é uma barra de 2px, uma borda ou um
texto. Isso é deliberado (ADR-056), e tem uma consequência que precisa estar
escrita: **quem não distingue esses dois verdes não perde informação**, porque a
forma já diz. Nunca faça um estado depender só da diferença entre eles.

Categoria de ferramenta **não tem cor** desde a ADR-054. Virou rótulo em
monoespaçada.

---

## 2. Tema escuro (o app hoje)

Valores como estão em `renderer/style.css`.

### Superfícies

| Token | Valor | O que é |
| --- | --- | --- |
| `--bg` | `#040a0a` | fundo da janela, quase preto puxado para o verde |
| `--bg-2` | `#061210` | fundo recuado: campos, corpo de log dobrável |
| `--panel` | `rgba(7, 26, 21, 0.58)` | **vidro**: barra superior e painel de ações |
| `--panel-solid` | `#0a1c17` | cartões e linhas, chapados |
| `--panel-hi` | `#0f2922` | superfície um degrau acima: `code`, botões em repouso |
| `--panel-hi-2` | `#14362c` | hover de botão neutro |
| `--border` | `#143a2f` | separador de 1px, borda de cartão |
| `--border-hi` | `#1e5443` | borda acesa: hover, modal, scrollbar |
| `--edge` | `rgba(255, 255, 255, 0.05)` | fio de luz de 1px no topo das superfícies |

Três superfícies estão escritas direto no CSS, fora do sistema de tokens:

| Valor | Onde | Linha |
| --- | --- | --- |
| `rgba(4, 10, 9, 0.74)` | fundo do terminal | 703 |
| `rgba(3, 8, 7, 0.55)` | escurecedor atrás do modal | 782 |
| `rgba(10, 24, 21, 0.86)` | caixa do modal | 791 |

### Texto

| Token | Valor | O que é |
| --- | --- | --- |
| `--text` | `#e8f3ee` | texto normal |
| `--text-dim` | `#93b5a7` | secundário, descrições, linha `info` do terminal |
| `--text-faint` | `#4f7d69` | carimbo de hora, glifos, rótulos apagados |

### Cores com papel

| Token | Valor | Papel |
| --- | --- | --- |
| `--accent` | `#3ee97d` | **interativo** |
| `--accent-ink` | `#04200f` | texto sobre o botão primário |
| `--accent-soft` | `rgba(62, 233, 125, 0.10)` | fundo de seleção, halo do foco |
| `--accent-line` | `rgba(62, 233, 125, 0.40)` | borda do botão "copiar", campo em foco |
| `--green` | `#49dc7a` | **resultado bom** |
| `--green-soft` | `rgba(73, 220, 122, 0.10)` | fundo do badge `ok` |
| `--green-line` | `rgba(73, 220, 122, 0.35)` | borda do badge `ok` |
| `--cyan` | `#22f2ef` | **luz secundária** |
| `--cyan-soft` | `rgba(34, 242, 239, 0.10)` | fundo do indicador de ocupado |
| `--warning` | `#f2c155` | **ressalva** |
| `--warning-soft` | `rgba(242, 193, 85, 0.10)` | fundo da linha `warn` |
| `--warning-line` | `rgba(242, 193, 85, 0.35)` | borda do cartão pendente |
| `--error` | `#ff6b6b` | **falhou** |
| `--error-soft` | `rgba(255, 107, 107, 0.10)` | fundo da linha `error` |
| `--error-line` | `rgba(255, 107, 107, 0.35)` | borda do botão `danger` no hover |

| `--accent-hi` | `#62ef95` | hover do botão primário: o destaque um degrau mais claro |
| `--accent-2` | `#22f2ef` | o mesmo ciano, com `--accent-2-soft` e `--accent-2-line` (ADR-113) |

### Luz ambiente

Três manchas fixas em `body::before`, atrás de tudo, que nunca se movem. São o
"atrás" que o vidro desfoca — sem elas o `backdrop-filter` não teria função.

```css
background:
  radial-gradient(55% 50% at 10% 0%,   rgba(62, 233, 125, 0.20), transparent 70%),
  radial-gradient(40% 40% at 100% 100%, rgba(34, 242, 239, 0.12), transparent 70%),
  radial-gradient(60% 55% at 55% 60%,  rgba(12, 120, 84, 0.34),  transparent 72%),
  linear-gradient(180deg, #06130f, var(--bg));
```

### Git Bash (xterm.js)

O terminal de baixo (ADR-128) usa as mesmas cores, no `TEMA_BASH` de
`renderer/terminais.js`. Fundo `#061210` (`--bg-2`), texto `--text`, cursor e
seleção em `--accent`. As 16 cores ANSI caem no papel mais próximo; roxo e
azul não existem na paleta e viram o neutro secundário e um ciano fechado:

| ANSI | Normal | Brilhante | Papel |
| --- | --- | --- | --- |
| black | `#0a1c17` (`--panel-solid`) | `#4f7d69` (`--text-faint`) | superfície / apagado |
| red | `#ff6b6b` (`--error`) | `#ff8a8a` | falhou |
| green | `#49dc7a` (`--green`) | `#3ee97d` (`--accent`) | resultado bom / destaque |
| yellow | `#f2c155` (`--warning`) | `#f7d27a` | ressalva |
| blue | `#1e9e9c` | `#22f2ef` (`--cyan`) | ciano fechado |
| magenta | `#93b5a7` (`--text-dim`) | `#bbcbb9` | neutro secundário |
| cyan | `#22f2ef` (`--cyan`) | `#98fffc` | luz secundária |
| white | `#d2e7df` | `#ffffff` | texto |

A moldura do painel (`.bash-dock`) usa `--border`, `--text`, `--text-dim`,
`--accent` e `--accent-soft`; o único valor solto é o fundo, que tem que ser
igual ao do xterm.

---

## 3. Tema claro (proposta)

Não existe no app. Os valores abaixo são a tradução dos mesmos papéis para
fundo claro, com contraste medido (seção 4).

O que muda de princípio: no escuro o destaque é **mais claro** que o fundo; no
claro ele precisa ser **mais escuro**, senão some. Verde neon não sobrevive em
cima de branco — `#3ee97d` contra `#ffffff` dá 1,60:1, ilegível. Por isso os
verdes descem de luminosidade e sobem de saturação, mantendo o matiz.

### Superfícies

| Token | Valor | O que é |
| --- | --- | --- |
| `--bg` | `#f2f7f4` | fundo da janela, branco puxado para o verde |
| `--bg-2` | `#e8f0ec` | fundo recuado |
| `--panel` | `rgba(255, 255, 255, 0.72)` | **vidro** |
| `--panel-solid` | `#ffffff` | cartões e linhas |
| `--panel-hi` | `#edf4f0` | um degrau acima |
| `--panel-hi-2` | `#e2ebe6` | hover de botão neutro |
| `--border` | `#cadbd2` | separador de 1px |
| `--border-hi` | `#9dbcae` | borda acesa |
| `--edge` | `rgba(255, 255, 255, 0.9)` | ver a ressalva abaixo |

O `--edge` é um fio de luz branco no topo, e no claro ele fica invisível. Ou o
fio vira sombra — `inset 0 -1px 0 rgba(0,0,0,0.05)` na base, em vez de luz no
topo —, ou o efeito é abandonado no tema claro. Decisão de quem implementar; o
que não dá é manter branco sobre branco e achar que está lá.

Superfícies soltas, traduzidas:

| Escuro | Claro | Onde |
| --- | --- | --- |
| `rgba(4, 10, 9, 0.74)` | `rgba(247, 250, 248, 0.86)` | terminal |
| `rgba(3, 8, 7, 0.55)` | `rgba(11, 31, 23, 0.32)` | escurecedor do modal |
| `rgba(10, 24, 21, 0.86)` | `rgba(255, 255, 255, 0.92)` | caixa do modal |

### Texto

| Token | Valor | O que é |
| --- | --- | --- |
| `--text` | `#0b1f17` | texto normal |
| `--text-dim` | `#3d6153` | secundário |
| `--text-faint` | `#5f8375` | carimbo de hora, glifos |

### Cores com papel

| Token | Valor | Papel |
| --- | --- | --- |
| `--accent` | `#067a45` | **interativo** |
| `--accent-ink` | `#ffffff` | texto sobre o botão primário |
| `--accent-soft` | `rgba(6, 122, 69, 0.10)` | seleção, halo do foco |
| `--accent-line` | `rgba(6, 122, 69, 0.40)` | borda do "copiar", campo em foco |
| `--green` | `#0f7a41` | **resultado bom** |
| `--green-soft` | `rgba(15, 122, 65, 0.10)` | fundo do badge `ok` |
| `--green-line` | `rgba(15, 122, 65, 0.35)` | borda do badge `ok` |
| `--cyan` | `#0a6f6d` | **luz secundária** |
| `--cyan-soft` | `rgba(10, 111, 109, 0.10)` | indicador de ocupado |
| `--warning` | `#8a5a00` | **ressalva** |
| `--warning-soft` | `rgba(138, 90, 0, 0.10)` | fundo da linha `warn` |
| `--warning-line` | `rgba(138, 90, 0, 0.35)` | borda do cartão pendente |
| `--error` | `#c0272d` | **falhou** |
| `--error-soft` | `rgba(192, 39, 45, 0.10)` | fundo da linha `error` |
| `--error-line` | `rgba(192, 39, 45, 0.35)` | borda do `danger` no hover |

Hover do botão primário: `#056338` — no claro o hover **escurece**, o contrário
do escuro.

### Luz ambiente

Mesmas três manchas, muito mais fracas: em fundo claro elas sujam depressa.

```css
background:
  radial-gradient(55% 50% at 10% 0%,   rgba(62, 233, 125, 0.16), transparent 70%),
  radial-gradient(40% 40% at 100% 100%, rgba(34, 242, 239, 0.10), transparent 70%),
  radial-gradient(60% 55% at 55% 60%,  rgba(12, 120, 84, 0.07),  transparent 72%),
  linear-gradient(180deg, #ffffff, var(--bg));
```

---

## 4. Contraste medido

WCAG 2.1. Texto normal pede 4,5:1; texto grande e elementos de interface pedem
3:1. Medido com a fórmula de luminância relativa, não a olho.

### Escuro, sobre `#040a0a`

| Cor | Razão | |
| --- | --- | --- |
| `--text` | 17,56:1 | AAA |
| `--text-dim` | 8,93:1 | AAA |
| `--text-faint` | 4,25:1 | só texto grande |
| `--accent` | 12,49:1 | AAA |
| `--cyan` | 14,26:1 | AAA |
| `--green` | 11,21:1 | AAA |
| `--warning` | 11,90:1 | AAA |
| `--error` | 7,19:1 | AAA |
| `--accent-ink` sobre `--accent` | 10,80:1 | AAA |

Sobre o cartão (`#0a1c17`) tudo cai cerca de 12%, e o pior caso vira
`--text-faint` em 3,75:1 — ainda serve para carimbo de hora e glifo, que é onde
ele é usado, mas **não serve para texto que alguém precise ler**.

### Claro, sobre `#f2f7f4`

| Cor | Razão | |
| --- | --- | --- |
| `--text` | 15,86:1 | AAA |
| `--text-dim` | 6,39:1 | AA |
| `--text-faint` | 3,89:1 | só texto grande |
| `--accent` | 5,00:1 | AA |
| `--cyan` | 5,53:1 | AA |
| `--green` | 5,00:1 | AA |
| `--warning` | 5,47:1 | AA |
| `--error` | 5,43:1 | AA |
| `--accent-ink` sobre `--accent` | 5,42:1 | AA |

Sobre cartão branco todos sobem um pouco. O tema claro é mais apertado que o
escuro de propósito: em fundo claro não dá para ter AAA e manter a cor
reconhecível como verde-esmeralda. Ele passa em AA com folga pequena, então
**baixar a saturação desses valores quebra a acessibilidade** — se for ajustar,
meça de novo.

### As bordas

`--border` e `--border-hi` ficam muito abaixo de 3:1 nos dois temas, e isso é
intencional: são separadores decorativos de 1px, não elementos que carregam
informação. A regra de 3:1 vale para o que comunica estado — foco, campo ativo,
item selecionado — e essas usam `--accent`, que passa com folga nos dois temas.

---

## 5. O que estava fora do sistema (resolvido na ADR-115)

Encontrado ao inventariar o CSS e corrigido no redesign v2.4:

| Valor | Era | Virou |
| --- | --- | --- |
| `#34415a` | borda do hover de botão neutro, azul-acinzentado do tema anterior à ADR-055 | `--border-hi` |
| `#33405a` | hover da scrollbar, mesmo azul | `--accent-line` |
| `#e5484d` | `var(--err, #e5484d)`, variável que não existia | `--error` |
| `#62ef95` | hover do botão primário, verde legítimo sem token | `--accent-hi` |

O bloco "Redesign v2.4" e o de movimento no fim do `style.css` só usam
tokens. Os `rgba` de sombra (`rgba(0,0,0,…)` e o halo `rgba(62,233,125,…)` do
primário) são os únicos valores literais, e são preto e o próprio destaque.

---

## 6. Para implementar o tema claro

Este documento entrega as cores, não o interruptor. O que falta, quando for a
hora:

1. Mover o bloco `:root` de hoje para dentro de um seletor que o tema claro
   possa vencer, e declarar a paleta clara em `:root[data-theme="light"]` e em
   `@media (prefers-color-scheme: light)`.
2. ~~Trocar as cores soltas da seção 5 por tokens~~ — feito na ADR-115.
3. Resolver o `--edge` (seção 3).
4. Decidir o padrão. O Hub é uma ferramenta de terminal com identidade escura
   construída de propósito em três ADRs; o claro é uma opção, não o novo normal.
