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
- **Foto salva.** A cópia sobe para a luz com um brilho âmbar por baixo, um reflexo atravessa a foto e um
  selo âmbar carimba o canto, gira até o lugar, solta faíscas da luz de segurança e desenha um tique. Leva
  cerca de um segundo e se repete a cada "Baixar de novo". No celular, uma vibração curta. Com movimento
  reduzido, o selo aparece pronto, sem nada se mexer.
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

## A ferramenta é o interruptor

As ferramentas com efeito próprio, as de pincel, Manchas, Liquify, Ajustes e Desfoque, não têm botão de
lixeira no painel. A própria ferramenta liga e desliga: com o efeito na foto, o botão mostra uma chavinha
âmbar no canto, e um segundo toque na ferramenta aberta tira o efeito, numa etapa "Limpar" do desfazer. Mais
um toque aplica de novo no Automático. No celular, com o painel recolhido, o toque primeiro reabre o painel.
As outras ferramentas seguem recolhendo o painel no segundo toque.

## Forma e Luz

Liquify, Ajustes e Desfoque também abrem no Automático, como Pele e Make, com o mesmo seletor no topo do
painel e o mesmo desfazer. Foto que já tem ajuste, deslocamento ou desfoque abre no Manual, sem trocar nada.

- **Liquify.** Um ajuste leve em cada rosto achado: o maxilar vem um pouco para dentro, das maçãs ao queixo, e
  os olhos abrem um pouco. Testa, nariz e boca ficam como estão. Nariz fica de fora de propósito: mexer nele
  muda quem a pessoa é, e o Manual segue ali para quem quiser. "Intensidade" responde na hora enquanto o dedo
  anda e entra como uma etapa ao soltar. Sem rosto, o painel diz e o pincel fica livre. No Manual o pincel
  trabalha por cima. Voltar ao Automático começa de novo a partir da foto, e o desfazer traz os traços de volta.
- **Ajustes.** O tom vem da própria foto e cai nos controles de sempre, então dá para refinar sem trocar de
  modo. Só mexe em exposição, contraste, temperatura e tint. Foto já no ponto continua igual e ganha um aviso.
  Sem rosto, mede a foto toda.
- **Desfoque.** O foco vai para a cabeça, com o cabelo dentro do círculo, e o desfoque começa mais suave que o
  padrão do painel. Em foto de grupo o círculo abraça os rostos principais e deixa de fora os do fundo. O círculo
  aparece, mas só se move no Manual, que traz de volta Sem, Radial e Tilt-shift. Sem rosto nada muda, a foto segue
  sem desfoque, o painel diz que o foco fica no centro e a pessoa escolhe o tipo.

## Olhos e dentes

Cor dos olhos, Olho vermelho, Brilho no olhar, Branco do olho e Dentes ficam na sua região, em todos os
rostos achados.

- **Primeira vez.** Ao abrir a ferramenta, o cartão de progresso aparece no topo do painel com o aviso dos
  6 MB. O traço espera e um aviso explica. "Pintar livre" pula a espera.
- **Íris.** A íris sai da própria foto, não só do desenho do modelo: o que é escuro como o meio da íris, perto
  do círculo que o modelo dá, sem a pele, o branco, os cílios e o brilho da luz. A cor fica dentro da íris
  mesmo com a cabeça inclinada ou o olho virado de lado.
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

## Pele

Manchas, Suavizar, Olheiras, Tom de pele e Iluminador seguem o mesmo caminho dos olhos e dentes, com as
palavras da pele.

- **Busca.** O cartão diz "Procurando a pele", ou "Procurando os olhos" em Olheiras, com o aviso dos 6 MB
  na primeira vez. A pele de um rosto já achado sai na hora ao trocar de ferramenta.
- **Foco e brilho.** A vista vai até o rosto, ou até os olhos em Olheiras, quando eles não estão na tela, e a
  luz fria acende sobre a pele.
- **Automático.** O efeito chega em meio segundo, em vez de aparecer de uma vez, para a pessoa ver onde a
  foto mudou. Em Manchas cada mancha some por vez, de cima para baixo. Cada correção ganha um círculo fino sobre a foto: passar o mouse acende o círculo e
  mostra um X, e um toque tira só aquela correção, numa etapa "Tirar correção". Assim um erro entre muitos
  acertos não obriga a perder tudo. Os círculos somem no Manual e na comparação, e o interruptor "Círculos
  nas correções" esconde todos para ver a foto limpa; a escolha fica guardada no aparelho. Sem
  mancha achada, um aviso manda para o Manual.
- **Manual.** Suavizar, Tom de pele e Iluminador trazem pincel, borracha e "Só na pele". Olheiras traz "Só
  nas olheiras". Manchas traz o pincel de healing, também preso à pele.
- **Iluminador.** O limite é a pele, mas o Automático acende só os pontos onde a luz cai: maçãs, ponte do
  nariz, meio da testa, arco do cupido e queixo.

## Make

Batom, Dentes, Blush, Sombra, Sobrancelha, Contorno e Sardas seguem o mesmo caminho dos olhos e da pele, com as
palavras de cada uma. Sobrancelha fica aqui porque preenche e colore, como maquiagem; o menu Olhos age no globo
ocular.

- **Busca.** O cartão diz o que procura: "Procurando os lábios", "Procurando as sobrancelhas", "Procurando os
  olhos" em Sombra, "Procurando a pele" em Blush, Contorno e Sardas.
- **Foco e brilho.** A vista vai até a boca em Batom, até as sobrancelhas em Sobrancelha, até olhos e
  sobrancelhas em Sombra, e até o rosto nas ferramentas que ficam na pele. A luz fria acende onde o pincel alcança.
- **Automático.** O efeito chega em meio segundo, no lugar de cada produto. O botão da ferramenta é o
  interruptor, como no resto do app.
- **Manual.** Pincel, borracha e o interruptor do limite, que difere do que o Automático preenche quando a mão
  precisa de mais espaço:

| Ferramenta | O pincel fica em | O Automático preenche |
| --- | --- | --- |
| Batom | Só nos lábios | Os lábios, sem os dentes e o escuro da boca |
| Dentes | Só nos dentes | Os dentes. Boca fechada não tem região, e o pincel fica livre |
| Blush | Só na pele | As maçãs, subindo um pouco rumo à têmpora |
| Sombra | Só nas pálpebras, por igual | A pálpebra, mais forte nos cílios e sumindo para cima |
| Sobrancelha | Só nas sobrancelhas, com folga para engrossar ou alongar | Os fios, com as falhas preenchidas de leve |
| Contorno | Só na pele | Sob as maçãs, nas laterais do rosto e do nariz |
| Sardas | Só na pele | Nariz e alto das bochechas |

- **Foto real.** O contorno dos lábios é ajustado à cor da própria foto, numa linha limpa, e os fios vêm do brilho, porque
  o modelo escorrega em cabeça inclinada. Sem contraste, como batom da cor da pele, a forma volta a ser a do modelo.
- **Sardas.** Tipo (Finas, Naturais, Marcantes), Quantidade, Tamanho, Variação e Opacidade. Os pontos caem soltos, juntando
  em umas partes e rareando em outras, e cada um tem forma, tamanho e cor próprios. A máscara diz quantos pontos cabem ali,
  não o quanto eles escurecem, então passar o pincel de novo traz mais pontos. O tamanho segue o rosto da foto.
- **Sem rosto.** Sem rosto, sem a região ou sem o detector, um aviso diz por quê e o pincel fica livre.

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
- **Ícones.** Paleta, lua, nascer do sol, círculo meio riscado e losango, na mesma grade de 24 px.

## Voltar ao original

- **Por menu.** "Zerar" aparece no fim da fila de ferramentas quando o menu tem algo a tirar. Tira as máscaras e
  os controles das ferramentas do menu, e também o que é só dele: manchas em Pele, liquify em Forma, filtro e
  área em Filtros, ajustes e desfoque em Luz, recorte em Quadro. Um aviso diz que o desfazer traz de volta.
- **A foto toda.** Ícone no topo, ao lado do desfazer, apagado quando não há nada a tirar. Tira tudo num toque,
  sem pergunta: o desfazer, logo ao lado, traz tudo de volta se foi sem querer.

## Filtros

Um menu sério, no lugar de Looks. Filtro só mexe em cor, grão e vinheta. Nada aqui muda o desenho de um rosto, e o
que brinca com a forma fica para outro menu. Um filtro de cada vez.

- **Sugestão.** No topo, um filtro escolhido pelo tom da foto, com a miniatura e o motivo em uma frase. Ela só
  sugere: nada muda na foto até o toque, e a pessoa escolhe outro quando quiser. O motivo diz o que o filtro alivia
  de fato, então nunca promete o que ele não faz.
- **Categorias.** Em linha, com Todos e Favoritos na frente. A estrela de cada miniatura guarda o favorito.
- **Intensidade.** Aparece com o primeiro filtro e vale para tudo que ele traz: cor, grão e vinheta.
- **No celular.** Os filtros correm em uma linha logo abaixo da foto, com a intensidade em seguida. Com um filtro
  ligado, a sugestão sai para dar lugar à intensidade, e volta quando ele sai.

### Como adicionar um filtro

Basta um arquivo em `src/presets/filters/`, com qualquer nome, terminado em `.json`. Nenhum código muda, nem o de
render. Ele entra no menu, na exportação e na sugestão sozinho.

```json
{
  "id": "novo",
  "name": "Novo",
  "category": "Sol",
  "grain": 10,
  "vignette": 12,
  "adjust": { "vibrance": 15 },
  "lut": { "ops": [{ "op": "warm", "t": 0.2 }, { "op": "saturate", "k": 1.05 }] }
}
```

- `id` e `name` não se repetem. O nome é da casa: nunca o nome ou a marca de um filtro de outro app. Os testes
  conferem isso numa lista conhecida.
- `category`: uma nova entra no fim do menu. A ordem das conhecidas fica em `CATEGORY_ORDER`, em `presets/luts.ts`.
- `lut`: ou uma receita, com `ops` em ordem (`curve`, `rgbCurves`, `fade`, `saturate`, `warm`, `split`, `hueBand`,
  `mono`, descritas no tipo `OpData`), ou uma tabela medida, com `size` e `table`, que é o que o script de réplica
  escreve.
- `grain` (0 a 100) e `vignette` (-100 a 100) são opcionais e têm as escalas do painel Ajustes.
- `adjust` é opcional e tem as escalas do painel Ajustes, menos Nitidez, Granulação e Vinheta.
- `suggest: false` deixa o filtro fora da sugestão. Serve para visual forte, que é escolha da pessoa.

### Como replicar um filtro de fotos antes e depois

```bash
npm run replicate -- --pair antes.jpg depois.jpg --holdout antes2.jpg depois2.jpg --id novo --name "Novo" --category "Sol"
```

O script alinha as fotos, ajusta uma tabela 3D, mede curva de tom, grão e vinheta e testa o resultado no par separado.
Mais de um `--pair` cobre mais cores. Tudo roda na máquina. Por padrão ele escreve em `.tmp/replica/`, fora do
repositório, o arquivo do filtro e um relatório. Depois é ler o relatório e copiar o `.json` para
`src/presets/filters/`. Só esse arquivo entra no repositório: nunca as fotos.

- **Erro de cor.** Delta E 2000 nas fotos do ajuste e no par separado. O do par separado é o que vale. Até 2 é
  difícil de ver lado a lado.
- **Efeito local.** O relatório avisa quando parte da foto muda por conta própria: luz só no rosto, ou pele alisada.
  Uma tabela global não faz isso, e o filtro sai sem esse efeito. O par ainda serve, mas o resultado vai parecer mais
  fraco que o original.
- **Limites.** A tabela só aprende as cores que as fotos mostram. O resto é extrapolado, e o relatório diz quanto
  do cubo foi coberto. Luz local num rosto cuja cor não aparece em mais nenhum lugar da foto passa por efeito global.
  Grão fino não dá para separar da compressão se uma das fotos foi redimensionada, então ele pode sair menor que o
  real, e vinheta fraca em foto escura também.

`npm run replicate:validate -- <pasta de fotos>` repete a prova: aplica filtros conhecidos às fotos, entrega só os
resultados ao script e compara o que volta com o que entrou.

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

## Os caminhos

Depois de abrir, a foto pergunta "Como vai ser?". Cada caminho é uma entrada em `src/ui/paths.ts`, e todos
editam o mesmo documento, então trocar de caminho não perde nada. A pergunta aparece por cima da foto, que
continua acesa, e o botão com o nome do caminho, na barra, traz a pergunta de volta. Um projeto com edição
reabre sem perguntar: no Glow na Hora se está num look, nas ferramentas se não. Os cartões de gesto vêm
depois da escolha, e o caminho sem pincel não ensina a pintar.

- **Glow na Hora.** O menu mostra looks, não ferramentas. Um toque aplica no rosto todo, numa etapa do
  desfazer, e tira as máscaras que o automático pôs para o look anterior. O que foi pintado à mão fica. Um
  segundo toque tira o look. O look aceso é lido do documento, então acompanha o desfazer. Se os ajustes do
  look mudarem à mão, ele deixa de aparecer aceso.
- **Do Meu Jeito.** O menu de sempre, ferramenta por ferramenta.
- **Looks.** Natural, Glow, Editorial, Domingo e Retrato P&B. Precisam cair bem em qualquer rosto, então
  nenhum põe cor na boca. A miniatura mostra a cor do look nesta foto, na intensidade certa.
- **Avisos.** Boca fechada deixa Dentes de fora, e o aviso diz isso. Sem rosto ou sem detector, entra só a
  cor do look e o aviso diz por quê. Sem detector, um segundo toque tenta de novo em vez de tirar o look.

## Layout

Mobile primeiro. A tela é a foto.

- **Celular**: barra superior mínima (voltar, caminho, desfazer, refazer, comparar, exportar). Embaixo, uma
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
- Tom no lugar: "Esta foto já está com o tom no lugar. Os controles seguem à mão."

## Acessibilidade

- Contraste AA em todo texto. Foco visível com anel de 2px na cor `--safe`.
- Controles com rótulos, `role="slider"` nativo via `input[type=range]`, ordem de tabulação lógica.
- Alvos de toque de pelo menos 44px.
- Todas as ações principais têm atalho e são alcançáveis por teclado.
