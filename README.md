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

O e2e roda na GPU do aparelho e em 75% dos núcleos. `E2E_GPU=0` volta ao SwiftShader, para máquina
sem GPU, e `E2E_PORT` troca a porta do preview, para duas cópias do repositório testarem ao mesmo tempo.

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

**Forma:** liquify (empurrar, inflar, contrair, restaurar).

**Geral:** 40 filtros em 10 categorias com intensidade e favoritos, receitas prontas e suas,
11 ajustes, desfoque radial e tilt-shift, recorte com rotação, espelho, endireitar e proporções,
antes/depois (segurar ou dividir, com a foto original ou só sem o filtro), exportação em JPG, PNG e WebP.

Um filtro vale para a foto toda ou para um rosto escolhido: um anel aparece em cada rosto, um toque
escolhe, e pincel e borracha acertam a área. Sem rosto na foto, a área é pintada à mão.

As ferramentas de pele, olhos, dentes e cabelo ficam onde devem: o traço só marca a pele, a área das
olheiras, a íris, o branco do olho, os dentes ou os fios, em todos os rostos achados, e um interruptor
libera o pincel. Se o detector não acha
rosto, a boca está fechada ou o download falha, o pincel fica livre. O detector baixa só na primeira vez
que alguém abre uma dessas ferramentas ou escolhe um rosto, cerca de 6 MB, do próprio site. O de cabelo
soma menos de 1 MB, só na primeira ferramenta de cabelo.

Ao abrir uma delas, a foto aproxima do rosto, dos olhos, da boca ou do cabelo e um brilho rápido mostra onde
o pincel alcança. No modo Automático, que vem ligado, a ferramenta já aplica em todos os rostos achados,
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
| `src/tools/<ferramenta>` | shader, lógica e painel de cada ferramenta, carregados sob demanda |
| `src/presets` | LUTs procedurais, receitas e miniaturas |
| `src/ui` | interface em Svelte |
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
distribuídas via Fontsource.

## Licenças de terceiros

O detector usa `@mediapipe/tasks-vision` e os modelos `face_landmarker.task` e `hair_segmenter.tflite`,
todos sob Apache 2.0. O aviso e o texto da licença estão em [`public/third-party.txt`](public/third-party.txt)
e seguem junto com o site.
