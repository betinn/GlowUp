# Glowup

Editor de retoque de fotos que roda inteiro no navegador. Pincéis manuais, ajustes globais, filtros
e exportação em resolução total, tudo processado na GPU do aparelho de quem usa.

- **Nada sai do aparelho.** Não há backend, API nem upload. O servidor só entrega arquivos estáticos.
- **IA só para achar rostos e cabelo, no seu aparelho.** Quando você aplica um filtro em um rosto, ou
  abre uma ferramenta de pele, olhos, dentes ou cabelo, um detector roda no navegador e diz onde estão
  rostos, olhos, bocas e fios. Ele nunca diz quem é a pessoa, e nada disso é salvo. O resto é processamento de
  imagem clássico em shaders.
- **Não destrutivo.** A original fica intacta. Cada edição é uma operação que pode ser desfeita,
  ajustada ou apagada.

## Como rodar

Requer Node 22 ou mais recente.

```bash
npm install
npm run dev
```

| Comando | O que faz |
| --- | --- |
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build estático em `dist/`, com `.br`, `.gz` e service worker |
| `npm run preview` | serve o `dist/` com a mesma CSP do deploy |
| `npm run check` | lint, typecheck e testes de unidade |
| `npm run e2e` | fluxos, telas e validação visual, na GPU e em paralelo (precisa de `npm run build` antes) |
| `npm run fixtures` | regenera as imagens de teste procedurais |
| `npm run scan` | varredura de higiene do repositório, do histórico e do `dist/` |
| `npm run replicate` | cria um filtro a partir de fotos antes e depois, com relatório (veja [docs/DESIGN.md](docs/DESIGN.md)) |
| `npm run replicate:validate` | prova o script de réplica com filtros conhecidos, em uma pasta de fotos |

O e2e roda na GPU do aparelho e em 75% dos núcleos. `E2E_GPU=0` volta ao SwiftShader, para máquina
sem GPU, `E2E_PORT` troca a porta do preview, para duas cópias do repositório testarem ao mesmo tempo, e
`E2E_CHROME` aponta para um Chromium que já está na máquina. `DIST_COMPRESS=0 npm run build` pula os `.br` e `.gz`,
que o preview não usa: é o build rápido para rodar o e2e.

## Abas

O editor tem cinco abas sempre à vista, embaixo no celular e à esquerda no computador. A foto abre na última que
você usou, sem pergunta, e trocar de aba não perde nada.

| Aba | O que tem |
| --- | --- |
| Glow na Hora | looks de um toque no rosto todo |
| Do Meu Jeito | o rosto, ferramenta por ferramenta: Pele, Olhos, Make, Cabelo e Formato do rosto |
| Filtros | filtros de cor e as Luzes |
| Foto | Ajustes, Desfoque, Recorte e Aumentar resolução |
| Brincar | caretas e adesivos |

## Ferramentas

Com o efeito de uma ferramenta na foto, o botão dela mostra uma chavinha ligada. Tocar de novo na
ferramenta aberta tira o efeito, e mais um toque aplica de novo.

**Pele:** manchas (healing com toque único automático, e no Automático acha e tira as manchas sozinho),
suavizar (Leve e Intenso), olheiras, tom de pele, iluminador, cada um na pele que o detector achou.

**Olhos:** branco do olho, olho vermelho, cor dos olhos, brilho no olhar.

**Make:** batom nos lábios sem os dentes, dentes, blush nas maçãs, sombra nas pálpebras, sobrancelha nos fios,
contorno sob as maçãs e nas laterais do rosto e do nariz, sardas sobre nariz e bochechas, soltas e sem padrão, com tipo
e quantidade. Cada um acha
o lugar sozinho no Automático, e no Manual o pincel fica preso a ele.

**Cabelo:** cor, escurecer, clarear, contraste e nitidez, cada um só nos fios que o detector achou.

**Voltar ao original:** "Zerar" tira tudo de um menu, e o botão no topo tira tudo da foto. Os dois são uma
etapa do desfazer.

**Formato do rosto:** controles pelos pontos do rosto, cada um a partir do zero. Rosto (mandíbula, maxilar, queixo, maçãs,
têmporas, testa, comprimento, tamanho da cabeça e papada quando a foto mostra), Olhos (tamanho, ângulo, alongar, abrir e
fechar, pupilas, sobrancelhas) e Nariz e boca. Liquify (empurrar, inflar, contrair, restaurar), com o fundo travado por
padrão. A foto é separada em camadas no próprio aparelho: os controles movem só a cabeça, e pescoço, ombros e fundo
ficam onde estão. Os lábios deslizam sobre os dentes, que não esticam. O que a cabeça descobre ao diminuir é
completado por um modelo de preenchimento, em segundo plano, com progresso, tempo que falta e botão de cancelar.

**Filtros:** 40 filtros em 10 categorias, com intensidade, favoritos e uma sugestão pelo tom da foto. Cada filtro é um
arquivo de dados, com cor, grão, vinheta e ajustes, e nunca muda o desenho do rosto.

**Brincar:** caretas de brincadeira, cada uma num controle de 0 a 100 (Olhão e Olhinhos, Narigão e Narizinho, Bocão
e Boquinha, Sorrisão, Bochechas de esquilo, Cara de peixe, Queixão, Testão, Esticado, Achatado e Cabeção, que aumenta
a cabeça e deixa corpo e fundo onde estão), caretas prontas num toque (Caricatura, Bebê, Alien e Palhaço), e 24
adesivos desenhados no projeto, em quatro abas: Óculos, Cabeça (coroa, chapéus, orelhas, auréola, chifrinhos), Rosto
(bigodes, nariz de palhaço, bochechas, lágrima, sardas) e Em volta (corações, estrelas e brilhos em volta da cabeça).
Cada adesivo entra no seu lugar no rosto escolhido, segue a inclinação e as caretas, e se arrasta, gira e muda de
tamanho com o dedo ou o mouse. Vários ficam juntos na foto, o último por cima, e qualquer um pode vir para a frente.
Fica numa aba própria, longe do retoque: nada daqui mexe nos controles do Formato do rosto.

**Luzes:** quatro filtros que refazem a luz da cena, numa aba dos Filtros: Néon, Contraluz Dourado, Brasa e Flash
Analógico. A luz cai pela profundidade da foto, como uma luz de verdade: o que está na distância da pessoa acende,
o que está longe se apaga, e não há linha de recorte entre os dois. No primeiro toque numa luz o site baixa dois
modelos, 59 MB, que leem a profundidade da foto e o recorte da pessoa no próprio aparelho. Um toque põe a luz,
outro tira, e um controle dá a intensidade.

**Looks:** dez looks de um toque no Glow na Hora. Natural, Glow, Editorial, Domingo e Retrato P&B cuidam do rosto e
da cor. Retrato, Luz de Janela, Luz de Vela e Fim de Tarde também leem a profundidade da foto: clareiam um rosto
escuro, aliviam as sombras da pele e fazem o fundo recuar, só onde a foto pede. Olhar cuida só dos olhos.

**Foto:** 11 ajustes, desfoque radial e tilt-shift, recorte com rotação, espelho, endireitar e proporções,
antes/depois (segurar ou dividir, com a foto original ou só sem o filtro), exportação em JPG, PNG e WebP.

**Aumentar resolução:** dobra ou quadruplica o tamanho da foto com o Real-ESRGAN, que refaz detalhe de rosto, cabelo e
pele em vez de só esticar os pixels. Fica em dois lugares. A ferramenta, na aba Foto, aumenta a foto como ela está,
com os retoques, e abre a foto maior no editor como uma foto nova; o projeto de antes continua na lista. Na exportação é
uma chave, desligada por padrão, que aumenta só o arquivo salvo. O resultado tem no máximo 20 MP, ou 8 MP num celular,
e 8192 px no lado maior, para a memória não acabar no meio: o painel diz qual aumento cabe e por quê. Roda no aparelho,
na GPU com WebGPU ou no processador, com progresso, tempo que falta e botão de cancelar no download e no
processamento. O modelo baixa só no primeiro uso, cerca de 36 MB com o runtime.

## Montagem: várias fotos num post

Escolha "Várias fotos" na tela inicial, solte mais de uma foto na tela, ou toque em "Montar carrossel ou colagem com
esta foto" ao exportar. As fotos vão para a mesa, onde saem juntas de três jeitos, e trocar de jeito não perde nada:

- **Carrossel:** uma foto por slide. Cada uma preenche o slide ou aparece inteira, com a própria foto desfocada ou
  uma cor em volta.
- **Colagem:** todas numa imagem só, com modelos para 1 a 10 fotos, espaço, cantos e cor de fundo.
- **Contínuo:** uma faixa só, cortada em slides. A foto continua no slide seguinte, e uma panorâmica vira dois, três
  ou mais slides.

Formatos 4:5, 1:1, 3:4, 9:16 e 16:9. Cada foto se arrasta e se aproxima dentro do lugar dela, muda de ordem, e
abre no editor com todas as ferramentas: "Retocar" leva, "Pronto" traz de volta com o retoque, e as setas da barra
passam para a foto vizinha. O filtro de uma foto vai para todas as outras num toque, para o conjunto ter a mesma
cor. A prévia mostra os slides deslizando, como no feed. Na exportação os slides saem
numerados, em 1080, 1440 ou 2160 px de largura: pela folha de compartilhar do aparelho, ou num zip. A montagem
fica salva no aparelho, até 10 fotos por montagem.

Um filtro vale para a foto toda ou para um rosto escolhido: um anel aparece em cada rosto, um toque
escolhe, e pincel e borracha acertam a área. Sem rosto na foto, a área é pintada à mão.

As ferramentas de pele, olhos, dentes e cabelo ficam onde devem: o traço só marca a pele, a área das
olheiras, a íris, o branco do olho, os dentes ou os fios, em todos os rostos achados, e um interruptor
libera o pincel. Se o detector não acha
rosto, a boca está fechada ou o download falha, o pincel fica livre. O detector baixa só na primeira vez
que alguém abre uma dessas ferramentas ou escolhe um rosto, cerca de 6 MB, do próprio site. O de cabelo
soma menos de 1 MB, só na primeira ferramenta de cabelo. Na primeira ferramenta de Formato do rosto baixam o modelo
que separa cabeça, corpo e fundo, 15 MB, e o que completa o fundo, 29 MB com o seu runtime. Nada disso entra no
precache, e a foto continua no aparelho. Os cartões de download mostram quanto falta, e só num celular dizem o
tamanho, em todos os downloads do app.

Ao abrir uma delas, um brilho rápido mostra onde o pincel alcança, sem mexer no zoom nem
na posição da foto. No modo Automático, que vem ligado, a ferramenta já aplica em todos os rostos achados,
numa etapa só que dá para desfazer, e os controles ajustam o efeito: o efeito chega aos poucos, e em Manchas
cada mancha some por vez. Cada mancha corrigida fica marcada por um círculo, e um toque nele desfaz só
aquela correção. O Iluminador vai nas maçãs, na ponte do nariz, no meio da testa, no arco do
cupido e no queixo. No Manual voltam pincel e borracha, a partir do que o Automático fez.

Solte a foto em qualquer lugar da tela, inclusive no editor. Abrir e exportar mostram a porcentagem e o
passo atual, com a própria foto revelando na tela.

## Atalhos

| Tecla | Ação |
| --- | --- |
| `Ctrl+Z`, `Ctrl+Shift+Z` | desfazer, refazer |
| `[`, `]` | diminuir e aumentar o pincel |
| `Shift+[`, `Shift+]` | dureza |
| `B`, `E` | pincel, borracha |
| `M` | ligar e desligar a marca do pincel |
| `\` (segurar) | ver o antes |
| `Y` | dividir antes e depois |
| Espaço (segurar) | arrastar a foto |
| `0`, `+`, `-` | enquadrar, aproximar, afastar |
| `Esc` | fechar painel |
| `←`, `→` | na montagem, slide anterior e seguinte |

## Arquitetura

```text
                 arquivo do usuário (fica no aparelho)
                              │
                              ▼
   IndexedDB  ◄──────  SourceImage (original intacta)
 (original + pilha)           │
                              ▼
 ┌─────────────────────── RenderContext ───────────────────────┐
 │                                                             │
 │  original ─► manchas ─► camadas com máscara ─► develop ─► finish
 │              (ops)      (uma por ferramenta)   (liquify,   (blur,
 │                         R8 na GPU              ajustes,    vinheta,
 │                                                LUT 3D)     grão)
 └──────────────────────────────┬──────────────────────────────┘
                                ▼
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
        tela (preview)                  exportação em tiles
      zoom, antes/depois,               resolução total,
      detalhe sob demanda               canvas ─► JPG, PNG, WebP
```

| Pasta | Conteúdo |
| --- | --- |
| `src/core/gl` | contexto WebGL2, programas, texturas, leitura assíncrona |
| `src/core/pipeline` | contextos de render, cadeia de estágios, pull-push |
| `src/core/history` | pilha de desfazer e codec de tiles |
| `src/core` | documento, geometria, pincel, máscaras, exportação, projetos |
| `src/core/face` | busca de rostos em tiles, máscara do rosto, limites de pele, olhos, dentes e cabelo, busca de manchas e detector carregado sob demanda |
| `src/core/fun` | Brincar: campo próprio, caretas em `effects/` e adesivos em `stickers/`, um arquivo cada |
| `src/core/superres` | aumento de resolução: modelo, worker, tiles com emenda suave e limite de tamanho |
| `src/core/post` | montagem de várias fotos: layout em números, desenho de um slide, armazenamento e zip |
| `src/tools/<ferramenta>` | shader, lógica e painel de cada ferramenta, carregados sob demanda |
| `src/presets` | LUTs procedurais, looks e miniaturas |
| `src/ui` | interface em Svelte |
| `src/ui/post` | a mesa da montagem, a prévia e a exportação dos slides |
| `tests` | testes de unidade, fluxos e imagens de teste procedurais |
| `deploy` | exemplos de servidor estático |
| `docs` | plano, decisões, design e validação visual |

Algumas decisões do pipeline:

- O preview roda em até 2048 px no lado maior e só refaz o que mudou. Pinceladas atualizam apenas a
  área tocada. Ao aproximar além da resolução do preview, a área visível é renderizada a partir da
  original assim que a vista para de se mexer.
- Máscaras são texturas R8, criadas só quando uma ferramenta é usada. Cada pincelada guarda os tiles
  anteriores comprimidos, lidos de forma assíncrona, sem travar a interface.
- Manchas viram operações independentes de resolução: uma membrana suave preenche o buraco e a
  textura fina vem de uma área vizinha escolhida automaticamente.
- A exportação usa o mesmo pipeline, em tiles com margem, e não deixa emendas.
- O aumento de resolução roda num worker, em tiles que se sobrepõem: a borda de cada tile não conta, e no meio da
  sobreposição um passa para o outro aos poucos, com pesos que somam 1. Só uma fileira de tiles fica em ponto
  flutuante, então a memória cresce com a largura da foto e não com a área.
- Uma montagem não tem motor próprio: cada foto é um projeto, retocado no editor, que ao sair guarda uma cópia
  de si mesmo com o retoque. A mesa e os arquivos são desenhados em canvas 2D a partir dessas cópias, pelo mesmo
  código, um slide por vez.
- O filtro pode ter máscara própria, presa à foto original: ela acompanha o liquify e vale igual no
  preview, no zoom, na exportação e no projeto salvo.

O motivo de cada escolha está em [docs/DECISIONS.md](docs/DECISIONS.md), e a identidade visual em
[docs/DESIGN.md](docs/DESIGN.md).

## Deploy

O site é só o conteúdo de `dist/`. A máquina que hospeda não processa imagem nenhuma, então uma VM
bem básica dá conta.

1. Gere o build:

   ```bash
   npm run build
   ```

2. Copie `dist/` para a pasta do site na VM (por exemplo `/var/www/glowup`) com a ferramenta que preferir,
   como `rsync` ou `scp`.

3. Use um dos exemplos em [deploy/](deploy/):

   - [deploy/Caddyfile](deploy/Caddyfile): o mais simples, cuida do HTTPS sozinho.
   - [deploy/nginx.conf](deploy/nginx.conf) e [deploy/glowup-headers.conf](deploy/glowup-headers.conf).

   Troque `example.com` pelo seu domínio.

Os exemplos servem os arquivos pré-comprimidos (`.br`, `.gz`), dão cache longo aos arquivos com hash,
`no-cache` ao `index.html`, fazem o fallback de SPA e aplicam CSP sem origens externas. Em visitas
repetidas, o service worker responde pelos assets e a VM quase não é tocada.

## Compatibilidade

Precisa de WebGL2. Funciona nas versões atuais de Chrome, Edge, Firefox e Safari. WebP depende do
navegador saber codificar o formato: quando não sabe, a opção não aparece.

## Licença

Código sob [MIT](LICENSE). Fontes Instrument Serif e Instrument Sans sob SIL Open Font License,
distribuídas via Fontsource. A arte dos adesivos do Brincar foi desenhada no projeto, em SVG, e segue a licença do
código: nenhuma vem de banco de imagens, marca, personagem ou conjunto de emojis.

## Licenças de terceiros

O detector usa `@mediapipe/tasks-vision` e os modelos `face_landmarker.task`, `hair_segmenter.tflite` e
`selfie_multiclass.tflite`, todos sob Apache 2.0. O preenchimento usa `onnxruntime-web` e o modelo MI-GAN,
`migan_inpaint.onnx`, os dois sob MIT. O aumento de resolução usa o Real-ESRGAN, `realesrgan_x4plus.onnx`, sob
BSD de 3 cláusulas, convertido para ONNX por [`scripts/superres/convert.py`](scripts/superres/convert.py). As Luzes
e os looks com luz usam o Depth Anything V2 Small, `depth_anything_v2_small.onnx`, e o MODNet, `modnet.onnx`, os dois sob Apache 2.0.
Os avisos e os textos das licenças estão em
[`public/third-party.txt`](public/third-party.txt) e seguem junto com o site.
