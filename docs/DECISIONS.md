# Decisões

Registro curto das decisões em aberto: o que foi escolhido e por quê.

## Base

| # | Decisão | Motivo |
| --- | --- | --- |
| 1 | UI em Svelte 5 (runes) | Runtime pequeno, transições nativas via Web Animations, compatíveis com CSP sem `unsafe-inline`. |
| 2 | Sem biblioteca de animação | CSS e `svelte/transition` cobrem tudo. Zero KB extras. |
| 3 | Fontes Instrument Serif e Instrument Sans via Fontsource (OFL) | Servidas pelo próprio site. A CSP sem origens externas continua valendo. |
| 4 | Identidade de commit local no repositório (`Glowup`, domínio `.invalid`) | Repositório público: nenhum e-mail ou usuário pessoal no histórico. O trailer de coautoria usa um endereço genérico `noreply`. |
| 5 | Scanner de higiene próprio com nomes de produtos em ROT13 | Permite procurar os termos proibidos sem escrevê-los em nenhum arquivo. |
| 6 | Interface e documentação em português do Brasil, código em inglês | O público fala português. Nomes em inglês seguem o ecossistema. |
| 7 | Sem modo claro | Num quarto escuro a luz acesa é a foto. Era opcional e não acrescenta. |

## Pipeline

| # | Decisão | Motivo |
| --- | --- | --- |
| 8 | Valores em sRGB codificado nos buffers, convertendo para linear ou Lab só onde importa | Curvas, LUTs e pincéis se comportam como o olho espera, e exposição e balanço de branco continuam corretos. |
| 9 | Buffers RGBA16F, com queda para RGBA8 | Dez estágios em 8 bits gerariam banding. |
| 10 | Máscara final em R8, acúmulo do traço em R16F | Fluxo baixo acumula sem degraus, e a máscara custa 1 byte por pixel e pode ser lida com rapidez. |
| 11 | Máscaras limitadas a 2048 px (1536 em toque) no lado maior | Máscaras são suaves. A 12 MP economizam 4 vezes a memória sem perda visível. |
| 12 | Preview com o mesmo teto, mais render sob demanda da área visível | O custo acompanha a tela, não a foto, e o zoom mostra o detalhe real. |
| 13 | Ordem fixa das ferramentas (`LAYER_ORDER`) | Pele antes de maquiagem dá resultado previsível e dispensa gestão de camadas. |
| 14 | Mesmo pipeline no preview e na exportação, parametrizado por região e escala | Raios em fração do lado maior: o que se vê é o que se exporta. |
| 15 | Passadas separadas por ferramenta, em vez de um shader gigante | Permite carregar cada ferramenta sob demanda, sem recompilar nada ao trocar. |
| 16 | Ferramentas antes da ferramenta ativa ficam em cache | Pintar refaz só a ferramenta ativa e as seguintes, e só na área tocada. |
| 17 | Transparência achatada sobre branco na entrada | Retoque de retrato não precisa de alfa, e isso simplifica todo o pipeline. |
| 18 | Tom de realces e sombras vem de uma imagem de 96 px compartilhada | Mips por tile saíam diferentes com tamanhos que não são potência de 2 e deixavam emendas na exportação. |

## Ferramentas

| # | Decisão | Motivo |
| --- | --- | --- |
| 19 | Healing por pull-push + textura de área vizinha, sem Poisson iterativo | Pull-push dá a membrana em cerca de 2 log(n) passadas curtas. O resultado é parecido e bem mais rápido, então o WASM permitido não foi necessário. |
| 20 | Manchas como operações vetoriais, não pixels | Independentes de resolução, pequenas no histórico e reaplicadas na exportação. |
| 21 | Detecção de mancha e escolha de amostra na CPU, sobre patches de 96 a 128 px | Lógica com ramificações é mais simples em TS, roda uma vez por toque e pode ser testada com Vitest. |
| 22 | Suavização com três bandas: guided filter rápido para baixas e médias, poros medidos à parte | Tira manchas de tom sem pele de plástico. |
| 23 | Olheiras comparam com a pele em volta da máscara (membrana em baixa resolução) | Corrige em relação à pele daquela pessoa, sem cor fixa, e só mexe em baixa frequência. |
| 24 | Liquify: campo editado na CPU em grade de até 1024 px, com warp no shader | A CPU dá consulta exata para mapear o pincel sobre a foto deformada, histórico por tile sem leitura da GPU, e uma dab custa menos de 1 ms. |
| 25 | Liquify aplicado depois das camadas | A maquiagem acompanha o rosto deformado. |
| 26 | Sardas procedurais no shader em vez de carimbos gravados | Densidade, tamanho e variação continuam ajustáveis depois de pintar. |
| 27 | Maquiagem compartilha um shader, com uma pasta por produto | Mesma matemática de mistura, com paletas e pincéis próprios. |
| 28 | Receitas guardam ajustes, filtro e parâmetros, sem máscara | Sem detecção facial não há onde pintar sozinho. Elas valem para o que já foi pintado e para o que vier. |

## Dados e entrega

| # | Decisão | Motivo |
| --- | --- | --- |
| 29 | Histórico sem limite de passos, com teto de 768 MB | Tiles comprimidos permitem milhares de passos. O teto evita derrubar a aba: acima dele os passos mais antigos saem. |
| 30 | Tiles com delta entre linhas + RLE | Máscaras suaves comprimem bem e o codec é síncrono, minúsculo e testável. |
| 31 | Histórico não é salvo no projeto | Salvar tudo custaria caro em disco. O estado atual é preservado por inteiro. |
| 32 | Original salva uma vez em store separado, e máscaras só quando mudam | O autosave fica leve mesmo com fotos grandes. |
| 33 | Exportação em tiles de 2048 px (1280 em toque), com origem alinhada a 256 px | Limita a memória de GPU em aparelhos simples. O alinhamento e a margem evitam emendas. |
| 34 | Service worker próprio, gerado no build | A precache de assets com hash não pede uma biblioteca. |
| 35 | CSP sem `unsafe-inline`, testada nos fluxos | `vite preview` serve a mesma política do deploy, então qualquer violação derruba os testes. |
| 36 | Validação visual versionada com retrato procedural, sem fotos de pessoas reais | O repositório é público, e o retrato traz manchas, olheiras, olho vermelho e dentes amarelados de propósito. |
| 37 | Naturalidade conferida também em um retrato fotográfico de domínio público, só localmente | Pele sintética não prova que os poros ficam. A foto não entra no repositório. |

## Resposta ao usuário

| # | Decisão | Motivo |
| --- | --- | --- |
| 38 | Porcentagem por etapas com pesos: real na leitura do arquivo, nos tiles e nas máscaras, estimada na decodificação e na compressão | Navegadores não informam progresso de `createImageBitmap` nem de `convertToBlob`. A estimativa para em 92% da etapa, então só o fim real completa a barra, e o valor nunca volta. |
| 39 | Arquivo lido em partes antes de decodificar | Dá progresso real quando a foto vem de um drive na nuvem ou de um cartão lento. O custo é uma cópia do arquivo comprimido em memória. |
| 40 | Foto mostrada com `<img>` enquanto abre | O maior alívio é ver a própria foto na hora. O navegador decodifica em separado, em tamanho pequeno. Formato que ele não mostra vira um retângulo vazio. |
| 41 | Barra e número movidos pelo relógio, não pelos quadros | Passos da GPU bloqueiam a página. Com a mesma fonte os dois nunca discordam, e o brilho em CSS segue animado no compositor durante o bloqueio. |
| 42 | Área de soltar global, fim do arraste detectado por silêncio de 600 ms | Sem isso, soltar no editor trocava a página pelo arquivo. `dragleave` não é confiável entre navegadores e não existe ao apertar Esc. |
| 43 | Comparar filtro renderiza o quadro sem filtro em um buffer extra, criado só enquanto a comparação está aberta | Comparar com o original misturaria retoques com o filtro. São 32 MB a mais em foto de 2048 px, pagos só durante o uso. |
