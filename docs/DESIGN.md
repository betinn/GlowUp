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

## Espera

Quem espera precisa saber três coisas: que está andando, quanto falta e que a foto está segura.

- **Abrir.** A foto aparece na hora, escura e desfocada, e revela junto com a porcentagem. Isso é a
  revelação levada ao pé da letra: o progresso é a própria imagem assentando no banho.
- **Exportar.** Uma miniatura começa apagada e acende parte por parte, conforme cada tile fica pronto.
  O que aparece é o resultado real, não uma animação.
- **Barra.** Linha de 3px em âmbar com uma faísca na ponta. O brilho que corre dentro dela continua
  mesmo quando um passo demora: é o sinal de que nada travou. A faísca é o único brilho da interface
  e existe porque marca o que está ativo agora.
- **Número.** Serifa grande em `tabular-nums`, ao lado do passo atual em palavras. Barra e número
  andam juntos e nunca voltam.
- **Tranquilizar.** "Tudo acontece aqui, no seu aparelho." Depois de 7 segundos: "Foto grande leva um
  tempinho. Tá tudo certo."
- **Fim.** A barra chega a 100%, um tique se desenha e a palavra "Pronta" fica um instante na tela.
- **Trabalhos curtos**, como remover uma mancha, não merecem tela: só um aviso pequeno, e só se
  passarem de 220 ms. Miniaturas de filtro respiram até ficarem prontas, depois revelam.

## Soltar a foto

A tela inteira aceita a foto, na inicial e no editor. A bandeja da tela inicial é só o convite.

- **Por cima.** O fundo escurece, uma moldura âmbar se fecha nas bordas, os cantos respiram e uma luz
  segue o ponteiro. O texto diz "Pode soltar."
- **Arquivo errado.** A moldura perde a cor, o sinal balança e o texto avisa antes de a pessoa soltar.
- **Soltou.** Um anel se abre no ponto exato da queda e a foto viaja de lá até o centro, onde começa a
  revelar. Não há tela vazia entre soltar e ver a foto.
- **No editor.** O texto muda para "Solta para trocar de foto." e a edição atual é salva antes.

## Comparar

Duas comparações, cada uma com uma pergunta:

- O botão da barra superior responde "o que mudou desde a foto original?".
- O botão do painel de filtros responde "o que este filtro faz?". O antes é a foto com todos os
  retoques, só sem o filtro, e as etiquetas dizem "Original" e o nome do filtro.

Tocar divide a foto, segurar mostra o antes. A divisão fica enquanto a pessoa experimenta outros
filtros, para comparar sem perder o lugar. Ela nasce no centro da foto, não da tela, e não sai dela.

## Marca do pincel

A foto mostra sempre o resultado real. A marca laranja de onde se pintou é uma opção, com interruptor
rotulado no painel e tecla `M`. Ligada, ela cobre o resultado, então a própria foto avisa e oferece
"Ver o resultado", o que vale também com o painel recolhido no celular. Cada ferramenta abre com a marca
desligada.

## Olhos e dentes

Cor dos olhos, Olho vermelho, Brilho no olhar, Branco do olho e Dentes ficam na sua região, em todos os
rostos achados.

- **Primeira vez.** Ao abrir a ferramenta, o cartão de progresso aparece no topo do painel com o aviso dos
  6 MB. O traço espera e um aviso explica. "Pintar livre" pula a espera.
- **Interruptor.** "Só na íris", "Só no branco do olho" ou "Só nos dentes". Desligado vale para aquela
  ferramenta enquanto a foto estiver aberta.
- **Traço fora.** A parte de fora some sem erro. Se o traço inteiro cair fora, um aviso aponta o
  interruptor e "Procurar mais rostos" aparece, para o rosto que a primeira busca deixou de lado.
- **Nada a limitar.** Sem rosto, sem dentes à mostra ou sem detector, o painel diz o motivo e o pincel fica
  livre.
- **Foco.** Quando a região fica pronta, a vista voa até os olhos, ou até a boca em Dentes. Dois rostos
  próximos entram juntos; numa foto de grupo vai o maior. Qualquer gesto na foto para o voo, e quem mexeu na
  vista durante a busca fica com a vista que escolheu.
- **Brilho.** Em seguida uma luz fria acende sobre o que o pincel alcança, com borda clara e uma faixa que
  atravessa a tela, e apaga em pouco mais de um segundo. O aviso "O brilho mostra onde o pincel alcança"
  fica um pouco mais. A luz é fria para nunca ser confundida com a marca laranja, que é o que se pintou, e
  não aparece na exportação. Volta a tocar quando o interruptor liga.
- **Automático e Manual.** Seletor no topo do painel. O Automático vem ligado: depois do brilho, a
  ferramenta já aplica em todos os olhos ou dentes achados, numa etapa só, e os controles ajustam o efeito.
  Sem pincel, arrastar move a foto. Manual mostra pincel, borracha e o interruptor, e parte do que o
  Automático fez. Voltar ao Automático troca o que foi pintado pela região. Projeto reaberto com máscara
  abre no Manual, para não apagar trabalho.

## Cabelo

Menu próprio na barra de grupos, entre Make e Forma, com Cor, Escurecer, Clarear, Contraste e Nitidez.
Cada uma segue o mesmo caminho dos olhos e dentes, com as palavras do cabelo.

- **Busca.** O cartão diz "Procurando o cabelo" e, depois dos rostos, "Achando os fios". Na primeira vez
  avisa cerca de 7 MB, ou menos de 1 MB se o detector de rostos já veio.
- **Foco e brilho.** A vista voa até o cabelo do maior rosto quando ele não está na tela, e a luz fria
  acende sobre os fios. Num retrato o cabelo já está na tela, então só o brilho toca.
- **Automático e Manual.** O Automático aplica nos fios achados numa etapa. O Manual traz pincel, borracha
  e "Só no cabelo".
- **Controles.** Cor tem a paleta e a intensidade. Escurecer e Nitidez têm intensidade. Clarear tem
  intensidade e "Dourado", o tom quente que o cabelo escuro mostra quando clareia. Contraste vai de macio a
  marcado, com zero no meio.
- **Comprimento.** Sexta ferramenta. O Automático escolhe o cabelo ao lado do rosto e abaixo do queixo, nunca a
  franja, e o slider diz quanto ele desce, em altura de rosto. "Pontas" vai de corte reto a pontas desfiadas.
- **Ícones.** Paleta, lua, nascer do sol, círculo meio riscado, losango e cabelo com seta para baixo, na mesma
  grade de 24 px.

## Voltar ao original

- **Por menu.** "Zerar" aparece no fim da fila de ferramentas quando o menu tem algo a tirar. Tira as máscaras e
  os controles das ferramentas do menu, e também o que é só dele: manchas em Pele, liquify em Forma, filtro e
  área em Looks, ajustes e desfoque em Luz, recorte em Quadro. Um aviso diz que o desfazer traz de volta.
- **A foto toda.** Ícone no topo, ao lado do desfazer, apagado quando não há nada a tirar. Pede um segundo sim
  num aviso sobre a foto, porque sair do editor perde o desfazer. `Esc` cancela.

## Filtro em um rosto

Depois de escolher um filtro, o painel pergunta onde ele vale: "Foto toda" ou "Escolher rosto".

- **Primeira vez.** O cartão de progresso mostra o download real do detector e avisa que acontece uma
  vez só e que a foto não sai do aparelho. Nas seguintes, só "Procurando rostos".
- **Anéis.** Um anel oval em cada rosto, nunca menor que um dedo. Um toque escolhe. O filtro continua
  na foto toda até esse toque, e `Esc` volta atrás. Os anéis acompanham zoom, recorte, giro e liquify.
- **Retoque.** Escolhido o rosto, a foto passa a aceitar pincel e borracha, e "Borda" controla a
  suavidade. "Trocar rosto" mostra os anéis de novo.
- **Sem rosto, ou sem detector.** O aviso diz o que fazer e o pincel já está na mão. "Pintar a área"
  leva ao mesmo lugar quando o rosto certo não ganhou anel.

O detector erra de dois jeitos que a interface assume: pode pôr anel em uma mão, que a pessoa
simplesmente não toca, e pode deixar passar rosto de perfil, que ela pinta.

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
- Abrindo: "Preparando o laboratório", "Lendo a foto", "Abrindo a foto", "Revelando", "Pronta"
- Soltando: "Pode soltar." e "Isso não é uma foto."
- Exportação: "Prontinho. Tá na sua pasta."
- Erro de arquivo: "Não consegui abrir esse arquivo. Tenta um JPG, PNG ou WebP?"
- Sem WebGL2: "Este navegador não acende a luz: falta WebGL2."
- Escolher rosto: "Toque no rosto que recebe o filtro." e "Não achei rosto nesta foto. Pinte a área com o pincel."

## Acessibilidade

- Contraste AA em todo texto. Foco visível com anel de 2px na cor `--safe`.
- Controles com rótulos, `role="slider"` nativo via `input[type=range]`, ordem de tabulação lógica.
- Alvos de toque de pelo menos 44px.
- Todas as ações principais têm atalho e são alcançáveis por teclado.
