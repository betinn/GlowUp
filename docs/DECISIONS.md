# Decisões

Registro curto das decisões em aberto: o que foi escolhido e por quê.

## Base

| # | Decisão | Motivo |
| --- | --- | --- |
| 1 | UI em Svelte 5 (runes) | Runtime pequeno, transições nativas via Web Animations, compatíveis com CSP sem `unsafe-inline`. |
| 2 | Sem biblioteca de animação | CSS e `svelte/transition` cobrem tudo. Zero KB extras. |
| 3 | Fontes Instrument Serif e Instrument Sans via Fontsource (OFL) | Servidas pelo próprio site. A CSP sem origens externas continua valendo. |
| 4 | Commits com a conta do dono do repositório, pelo e-mail `noreply` do GitHub | Quem faz o commit é o autor, como em qualquer projeto. O endereço `noreply` liga o commit à conta sem expor o e-mail pessoal. Os commits até `ec760a9` saíram com a identidade genérica `Glowup`, de uma regra anterior que foi abandonada. |
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
| 28 | Receitas guardam ajustes, filtro e parâmetros, sem máscara | A detecção limita onde o filtro e o pincel de olhos e dentes valem, mas nunca pinta retoques sozinha: quem pinta é a pessoa. Receitas valem para o que já foi pintado e para o que vier. Aplicar uma receita troca o filtro e mantém a área escolhida, e uma receita salva nunca leva a área de uma foto. |

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

## Filtro em um rosto

| # | Decisão | Motivo |
| --- | --- | --- |
| 44 | Detecção de rosto com MediaPipe Face Landmarker, para limitar o filtro e o pincel de olhos e dentes | A regra era sem IA e sem detecção. Ela mudou primeiro para o filtro, porque filtro em um rosto de foto com várias pessoas pede saber onde cada rosto está. Mudou de novo para as ferramentas de olhos e dentes, a pedido de quem usa, para elas não pintarem onde não há olhos nem dentes (decisões 58 a 63). Continua sem pintar nada sozinha. `picojs` foi recusado por não declarar licença. Detecção em servidor quebraria a promessa de nada sair do aparelho. |
| 45 | Dizer que há um rosto e onde, nunca de quem é | Nenhum descritor, nenhuma comparação entre rostos. Os contornos de rosto, olhos e lábios ficam em memória, só para a foto aberta. O projeto guarda apenas as máscaras, que são áreas como as pintadas à mão. |
| 46 | Biblioteca, WebAssembly e modelo servidos pelo próprio site | Nada de CDN: a CSP continua sem origens externas e a foto não depende de terceiros. O custo é `'wasm-unsafe-eval'` em `script-src`. Os três cartões de modelo e a biblioteca são Apache 2.0, com aviso em `public/third-party.txt`. |
| 47 | Detector baixa só no primeiro pedido e fica fora do precache | Pedido é escolher um rosto ou abrir uma ferramenta de olhos ou dentes. A primeira visita continua leve: 27,3 KB de JS em gzip, contra 26,6 KB antes. O primeiro uso transfere 6,13 MB com brotli, medidos na rede. Sem brotli no servidor, cerca de 7,6 MB em gzip. |
| 48 | Busca em tiles: foto toda, depois 1/2, 1/4 e 1/8 do lado maior, com metade de sobreposição | O detector olha a imagem em 128 px e foi feito para rosto perto da câmera. Em 7 fotos reais de grupo, a passada única achou 0 rosto. Com tiles achou 24 de 24, 29 de 29 e 23 de 23. |
| 49 | A busca desce um nível enquanto nada foi achado ou o nível trouxe rosto novo | Selfie termina em 0,3 s sem pagar pelos tiles finos. O botão "Procurar mais rostos" cobre rosto pequeno ao lado de rosto grande. |
| 50 | Detector na thread principal, com delegate CPU | Um tile leva cerca de 20 ms e a página pinta entre tiles, então um worker traria complexidade sem ganho visível. CPU evita disputar a GPU com o editor. O delegate GPU não foi medido. |
| 51 | WebAssembly baixado pelo Glowup e entregue ao runtime pelo hook `instantiateWasm` | Dá porcentagem real em bytes e um único download. O hook `wasmBinary` não existe neste build. Sem compilação em streaming, que aqui custou menos de 0,5 s. Versão fixada em 1.2.2 porque isso depende do runtime. |
| 52 | Máscara do filtro em R8, no espaço da foto original, lida na posição já deformada | O shader lê a máscara em `iuv + d`, o mesmo ponto de onde vem a cor, então ela acompanha o liquify de graça. Por usar UV da imagem, preview, zoom e tiles de exportação leem o mesmo valor. |
| 53 | Máscara do rosto: `FACE_OVAL` preenchido, leve desvanecer pescoço abaixo, desfoque e guided filter em CPU | Roda uma vez por toque, sobre o recorte do rosto, e pode ser testada com Vitest. O guided filter cola a borda no contorno real da foto. O desvanecer segue a direção da testa ao queixo e evita o corte duro no pescoço com filtro preto e branco. |
| 54 | Borda ajustada na hora de renderizar, por níveis de mip | Vale também para o que foi pintado à mão, responde na hora e não exige guardar o contorno no projeto. É relativa ao tamanho da área, para não apagar um rosto pequeno. |

## Olhos, dentes e a marca do pincel

| # | Decisão | Motivo |
| --- | --- | --- |
| 55 | `Clarear` virou duas ferramentas: `Dentes` em Make, ao lado do batom, e `Branco do olho` em Olhos | Dente dentro de "Olhos" não tinha rótulo honesto que coubesse na barra de grupos no celular. Cada ferramenta passa a ter um alvo só. A camada nova `sclera` usa o mesmo shader, para sliders e "Apagar o que pintei" não misturarem boca e olhos. Projetos antigos seguem em `whiten`, que agora se chama Dentes. |
| 56 | Marca do pincel desligada por padrão, com interruptor rotulado, aviso sobre a foto e volta a desligar a cada troca de ferramenta | A "mancha" relatada era a marca laranja: ligada pelo olho ou pela tecla `M`, ela seguia ligada de ferramenta em ferramenta e cobria o resultado. A marca era o único jeito de o quadro diferir: sem ela, ferramenta aberta e fechada deram diferença máxima 0 em SwiftShader e em GPU real, com e sem zoom de detalhe. O aviso sobre a foto cobre o celular, onde o painel pode estar recolhido. |
| 57 | Soltar o traço refaz a ferramenta ativa no quadro todo | Durante o traço só a área tocada é refeita, mas Olheiras lê a máscara inteira. Sobrava diferença de 0,012 nível em média entre aberta e fechada. Custa uma passada por traço, e o quadro aberto fica igual ao fechado por construção. |

## Olhos e dentes pelo detector

Medido em 9 fotos reais de domínio público, fora do repositório, com 99 rostos achados, ao menos 3 deles falsos. Olhos conferidos a olho em 65 rostos de 5 fotos, em recortes ampliados: não há gabarito.

| # | Decisão | Motivo |
| --- | --- | --- |
| 58 | O limite entra no passo que aplica o traço à máscara, não no render | A máscara continua sendo só o que foi pintado, então histórico, projeto, exportação e receitas não mudam. Por isso nenhum ponto do rosto precisa ser salvo: o limite é uma textura em memória, refeita ao abrir a ferramenta. A borracha nunca é limitada. |
| 59 | Fora da região o traço é recortado, e um traço que cai todo fora avisa e não vira passo no desfazer | Escolha de quem usa, entre recortar, bloquear o traço e só guiar. O recorte perdoa um traço que começa na pálpebra. O aviso aponta o interruptor, que resolve rosto errado ou perdido. |
| 60 | O detector começa sozinho ao abrir a ferramenta, com os 6 MB ditos no cartão de progresso | Escolha de quem usa, entre isso e perguntar antes. Enquanto ele carrega, o traço espera e um aviso explica, senão a pintura sairia sem limite. "Pintar livre" pula a espera. |
| 61 | Íris é o círculo dos 4 pontos do modelo, cortado pelo contorno do olho com folga de 12%. Branco do olho é o contorno menos a íris | Certo em 59 de 65 rostos. Erraram 6: dois com a cabeça inclinada, um atrás de óculos com os olhos fechados, os outros olhando para cima ou para baixo. Sem filtro de borda: a pálpebra já corta o círculo. |
| 62 | Dentes são o contorno interno dos lábios levado 40% rumo ao externo, com a borda puxada pela foto e cortada pelo externo. Abertura abaixo de 5% da largura é boca fechada | O contorno interno sozinho deixou mais de 20% dos dentes de fora em 9 de 45 sorrisos. Com 40% foram 5, em medida aproximada por brilho e cor, e o guided filter tira de volta o que passou para o lábio. As 31 bocas com abertura abaixo de 3% não mostram dentes nas 20 que deu para olhar. Em rosto pequeno de foto antiga, com bigode, o modelo chega a ver boca aberta onde não há dente: a região abre à toa, sem prejuízo, porque o shader deixa o escuro como está. |
| 63 | Todo caminho sem limite deixa o pincel livre e diz por quê | Sem rosto, sem olhos ou dentes à mostra, download que falha e interruptor desligado. O detector perde perfil, rosto olhando para baixo e rosto pequeno, e isso não pode prender ninguém. "Procurar mais rostos" só aparece depois de um traço cair todo fora. Anel falso em mão ou joelho só abre uma região a mais, sem prejuízo. |

## Foco, brilho e modo automático

| # | Decisão | Motivo |
| --- | --- | --- |
| 64 | Quando a região fica pronta, a vista voa até os olhos, ou até a boca em Dentes, em 650 ms | Olho e dente são pequenos na foto inteira, e a pessoa ia dar zoom de qualquer jeito. O voo usa a matemática de `view.ts` sobre os pontos já passados por recorte, giro e liquify, então chega ao lugar certo em foto girada ou deformada. O zoom cresce em ritmo constante e o centro anda junto, para não parecer que a foto escorrega. |
| 65 | Com vários rostos, a vista mostra todos se isso ainda aproximar 1,6 vez ou mais, ou custar menos de 40% do zoom de um rosto só. Senão vai para o maior rosto | Duas pessoas numa selfie cabem juntas e ficam grandes. Numa foto de grupo, todos os olhos juntos são a foto inteira, e aproximar o maior rosto é o que dá para retocar. Rosto cortado pelo recorte fica de fora da conta. |
| 66 | O voo nunca briga com a pessoa | Qualquer roda, pinça, arrasto, tecla de zoom ou toque na foto para o voo onde ele está. Se a pessoa mexeu na vista durante a busca, o voo nem começa. Se a região já está na tela com zoom parecido, a vista fica. Com movimento reduzido, a vista salta direto. |
| 67 | Um brilho frio de 1,1 s mostra os pixels que o pincel alcança, com borda clara e uma faixa que atravessa a tela | Explica para que serve o interruptor sem texto longo. A luz é somada e não misturada, para não parecer cor nova na íris, e é fria para não ser confundida com a marca laranja. Toca na primeira vez que a ferramenta fica pronta na foto e sempre que o interruptor liga. Com movimento reduzido fica só o acender e apagar, sem a faixa. |
| 68 | O brilho mora só no passo que desenha a tela, lendo a textura do limite | A exportação usa outro shader e nem vê o brilho. Lido na mesma posição deformada da marca do pincel, ele acompanha o liquify. Fora dos 1,1 s o ramo do shader não roda. |
| 69 | Um aviso "O brilho mostra onde o pincel alcança" fica 2,6 s, mais que o brilho | Tempo de ler a frase. Some se a marca do pincel estiver ligada, para não haver dois avisos no mesmo lugar. |
| 70 | "Automático \| Manual" no topo do painel. O Automático vem ligado e aplica sozinho, depois do voo e do brilho | Escolha de quem usa, entre aplicar sozinho, esperar um toque em "Aplicar" e manter o Manual como padrão. Aplicar depois de mostrar a região faz a pessoa ver onde a foto mudou. Um seletor de dois lados deixa claro de onde vem a máscara, melhor que um interruptor que só revela o pincel. |
| 71 | O Automático preenche a máscara da ferramenta com a mesma forma do limite, em uma etapa "Automático" no desfazer | A máscara fica igual a uma pintada à mão: sliders, comparar, exportar, receitas e projeto salvo não mudam, e nenhum ponto do rosto vai para o projeto. No Automático o pincel some e arrastar move a foto. Desfazer ou "Tirar o efeito" deixam "Aplicar de novo". |
| 72 | Manual parte do que o Automático fez, com pincel, borracha e o interruptor de limite. Voltar ao Automático troca a máscara pela região, também em uma etapa | Refinar o automático com a borracha é o uso mais comum. Trocar a máscara inteira ao voltar é previsível, e o desfazer devolve o trabalho à mão. |
| 73 | O modo fica guardado por ferramenta enquanto a foto está aberta. Máscara que já tem trabalho, como num projeto reaberto, abre no Manual | O Automático nunca apaga trabalho que a pessoa não viu acontecer. Sem rosto, sem região ou sem detector, o seletor não aparece e o pincel fica, como antes. |

## Testes

| # | Decisão | Motivo |
| --- | --- | --- |
| 74 | e2e na GPU real e em paralelo, com SwiftShader como opção | Os 81 testes levavam 14 min um por vez em SwiftShader, que roda os shaders na CPU. Na GPU e em 6 processos, 96 testes (o teste das 15 ferramentas virou um por ferramenta) levam 2,4 a 2,7 min, verdes em 3 rodadas seguidas. Os testes comparam quadros da mesma rodada, então a troca de GPU não muda os limites. Cada teste abre o próprio contexto do navegador, e nada é compartilhado entre eles. |

## Cabelo

| # | Decisão | Motivo |
| --- | --- | --- |
| 75 | Cabelo virou um grupo da barra, entre Make e Forma, com Cor, Escurecer, Clarear, Contraste e Nitidez | Pedido de quem usa, no mesmo modelo de Olhos: uma ferramenta por efeito, cada uma com máscara, Automático e desfazer próprios. Uma ferramenta só com vários sliders misturaria efeitos numa máscara e não deixaria limpar um sem os outros. |
| 76 | Cabelo vem do MediaPipe Hair Segmenter, não dos pontos do rosto | Os 478 pontos param na testa e não dizem onde o cabelo termina. O modelo é Apache 2.0, roda no mesmo runtime de 1.2.2, pesa 782 KB (680 KB em brotli) e fica fora do precache, como o detector de rostos. O seletor de selfie com classe de cabelo pesava 16 MB. |
| 77 | O WebAssembly é compilado uma vez e entregue às duas tarefas pelo hook `instantiateWasm` | O segmentador não baixa o runtime de novo. A primeira ferramenta de cabelo, com o detector de rostos já ligado, baixa só o modelo. |
| 78 | O segmentador olha um quadrado de 3,2 vezes o tamanho de cada rosto, um pouco abaixo dele, e sem rosto olha a foto toda | Ele foi feito para selfie, com a cabeça enchendo os 512 px de entrada. Numa foto de grupo a foto inteira mostraria cabeças minúsculas. O quadrado desce para pegar cabelo comprido, e a área vai inteira para a entrada, com borda cinza, sem ser achatada. Cabelo de costas ou sem rosto achado ainda tem chance pela foto toda. |
| 79 | Confiança de 0,3 a 0,6 vira a borda suave, e a borda refinada não passa de onde o modelo deu 0,1 | O guided filter colava a borda nos fios, mas em cabelo escuro sobre fundo escuro o brilho dos dois lados é igual e ele espalhava um halo claro com Clarear. O teto pela confiança tirou o halo. |
| 80 | Onde o modelo fica inseguro, o pixel com o brilho do cabelo certo, ou um pouco mais escuro, conta como cabelo | No retrato procedural o modelo deixava manchas no topo da cabeça. A regra usa o brilho dos pixels de que o modelo tem certeza, então pele e fundo claro ficam de fora, e a sombra entre fios entra. Fica limitada ao alcance do item 79. |
| 81 | As cinco ferramentas dividem o cabelo achado em uma foto, enquanto a lista de rostos e o tamanho da máscara não mudam | Trocar de Cor para Nitidez não roda o segmentador de novo. |
| 82 | Escurecer, Clarear, Contraste e Nitidez mexem só na luminosidade em Lab, lida da foto antes dos retoques | Cor de cabelo é delicada: mexer em RGB tinge as bordas. Clarear sobe o tom local por igual e cada fio mantém sua diferença, e soma um dourado que cai a zero no cabelo claro. Contraste age em duas escalas, fio contra fio e brilho contra sombra. Nitidez ignora diferenças mínimas, que são grão. |
| 83 | Cor manteve a camada `hair` e os modos antigos, mostrados só em projeto salvo com um deles | Projeto antigo com Escurecer ou Profundidade abre igual, e dá para voltar a Cor. Nos novos, esses efeitos são ferramentas próprias. |

Medido só no retrato procedural, com a GPU: o cabelo de um retrato fica pronto junto com a busca de rostos,
e trocar de ferramenta reaproveita o resultado. Falta conferir em fotos reais de domínio público, como foi
feito com olhos e dentes.
