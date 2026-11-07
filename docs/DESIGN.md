# Glowup: design

## Conceito: quarto escuro

A foto é a única coisa acesa. Todo o resto é o escuro em volta dela, como num laboratório de
revelação. A interface não compete com a imagem: aparece quando precisa e volta para a sombra
quando a pessoa está pintando.

Dois gestos dão a identidade:

- **Revelação.** Tudo que entra na tela nasce como uma imagem no banho químico: começa desfocado
  e sem contraste, e assenta em nitidez. Serve para painéis, títulos, miniaturas e para o antes/depois.
- **Luz de segurança.** Um único acento âmbar, bem contido, marca apenas o que está ativo agora.
  Nunca decora. Se dois elementos parecem igualmente ativos, um deles está errado.

## Paleta

| Token | Valor | Uso |
| --- | --- | --- |
| `--ink` | `#0b0b0c` | fundo da aplicação |
| `--ink-2` | `#131315` | superfícies (painéis, folhas) |
| `--ink-3` | `#1d1d20` | superfície elevada, trilho de slider |
| `--line` | `rgb(255 255 255 / 0.1)` | divisórias finas |
| `--paper` | `#f4f1ec` | texto principal, ícones |
| `--paper-2` | `rgb(244 241 236 / 0.68)` | texto secundário (contraste AA sobre `--ink`) |
| `--safe` | `#ffb877` | acento único: estado ativo, foco, progresso |

Branco levemente quente, como papel de fotografia, em vez de branco puro. Não há modo claro:
num quarto escuro a luz acesa é a foto.

## Tipografia

- **Instrument Serif** (itálico): marca, títulos, frases de voz. É onde mora a personalidade.
- **Instrument Sans** (variável): rótulos e controles. Valores numéricos em `tabular-nums`.

Fontes servidas pelo próprio site (licença OFL), sem origem externa.

## Formas

Linhas finas de 1px, pílulas para escolhas, folhas com cantos de 20px. Sem sombras decorativas.
Ícones próprios em SVG, traço 1.5, pontas redondas, grade de 24px, sempre `currentColor`.

## Movimento

| Token | Valor | Uso |
| --- | --- | --- |
| `--ease-reveal` | `cubic-bezier(0.16, 1, 0.3, 1)` | entradas, folhas, revelações |
| `--ease-swift` | `cubic-bezier(0.3, 0, 0.1, 1)` | trocas rápidas de estado |
| `--t-fast` | `140ms` | toque, hover, foco |
| `--t-mid` | `260ms` | troca de ferramenta |
| `--t-slow` | `520ms` | revelação, onboarding |

Regras:

- Toda animação informa algo: de onde um painel veio, o que mudou, o que está ativo.
- Enquanto a pessoa pinta, a interface recua: painéis ficam transparentes e o cursor fica em primeiro plano.
- O slider responde ao toque: o botão cresce ao ser pego, o valor sobe para fora do dedo e a linha
  acende até o ponto escolhido. Ao passar pelo zero há um tique visual, e dois toques voltam ao padrão.
- O cursor do pincel mostra tamanho (anel externo) e dureza (anel interno). Ao mudar o tamanho,
  ele pulsa no centro da tela para dar a medida mesmo sem ponteiro.
- O antes/depois entra com uma cortina que atravessa a foto uma vez e para no meio.
- `prefers-reduced-motion`: revelações viram fade curto, sem deslocamento nem desfoque.

## Layout

Mobile primeiro. A tela é a foto.

- **Celular**: barra superior mínima (voltar, desfazer, refazer, comparar, exportar). Embaixo, uma
  doca com categorias roláveis; ao escolher uma ferramenta, sobe uma folha curta com os controles
  e a foto continua visível. Um dedo pinta, dois dedos movem e dão zoom.
- **Desktop (≥ 900px)**: categorias em um trilho à esquerda, painel de controles à direita. A foto
  fica no centro. Roda do mouse dá zoom, espaço arrasta, atalhos cobrem o restante.

## Voz

Português do Brasil, informal, frases curtas, um pouco de humor e nenhuma condescendência.
Fala de foto e de luz, não de "beleza" nem de defeitos da pessoa. Evita "corrigir seu rosto":
prefere "dar uma luz", "acertar", "deixar respirar".

Exemplos:

- Tela inicial: "Solta a foto aqui." e "Nada sai do seu aparelho. Nem um pixel."
- Carregando: "Revelando…"
- Exportação: "Prontinho. Tá na sua pasta."
- Erro de arquivo: "Não consegui abrir esse arquivo. Tenta um JPG, PNG ou WebP?"
- Sem WebGL2: "Este navegador não acende a luz: falta WebGL2."

## Acessibilidade

- Contraste AA em todo texto. Foco visível com anel de 2px na cor `--safe`.
- Controles com rótulos, `role="slider"` nativo via `input[type=range]`, ordem de tabulação lógica.
- Alvos de toque de pelo menos 44px.
- Todas as ações principais têm atalho e são alcançáveis por teclado.
