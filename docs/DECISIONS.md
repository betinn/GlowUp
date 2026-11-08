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

## Voltar ao original

| # | Decisão | Motivo |
| --- | --- | --- |
| 84 | Zerar e Voltar ao original são uma etapa só do desfazer, com máscaras, manchas, liquify, filtro, ajustes, desfoque e recorte guardados juntos | O desfazer traz tudo de uma vez. Ferramentas voltam aos controles de fábrica, como se nunca tivessem aberto. |
| 85 | Voltar ao original pede um segundo toque, Zerar não (trocada pela 105) | O histórico não vai para o projeto salvo: depois de sair do editor, tirar tudo não tem volta. Um menu só custa menos, e o aviso lembra do desfazer. |
| 86 | Comprimento do cabelo foi tentado e saiu | Esticar o último trecho de cada fio para baixo ficou artificial. Alongar de forma convincente pede um modelo generativo de 1 a 2 GB, lento no computador e inviável no celular, ou um servidor, que quebra a promessa de nada sair do aparelho. Projeto salvo durante o teste abre sem a ferramenta, e o próximo salvamento a descarta. |

## Pele

Medido no retrato procedural, com a GPU, como foi feito com o cabelo. Manchas também foi conferido numa
selfie real com acne enviada por quem usa, que ficou fora do repositório. Falta conferir em mais fotos
reais de domínio público, como foi feito com olhos e dentes.

| # | Decisão | Motivo |
| --- | --- | --- |
| 87 | As cinco ferramentas de Pele ganharam o mesmo caminho de Olhos e Cabelo: busca, voo, brilho, Automático e Manual | Pedido de quem usa. O código é o mesmo das outras regiões: cada ferramenta diz no catálogo qual região limita o pincel e, quando é outra, com que forma o Automático preenche. |
| 88 | Pele é o contorno do rosto, com o pescoço sumindo para baixo, menos olhos, sobrancelhas e lábios com folga, e só onde a cor parece a da pele | O contorno dos 478 pontos passa por cima da franja. A cor da pele vem dos pixels do fundo da forma, em croma sem brilho, então a sombra da bochecha continua pele e cabelo, olho, fundo e roupa saem. Puxar para o vermelho conta 4,5 vezes menos, porque espinha, mancha e rubor são pele. |
| 89 | Buracos pequenos na pele são fechados depois do refino de borda | O guided filter segue o brilho da foto e abria um buraco em cada espinha. Suavizar e Tom de pele deixavam a mancha de fora e Manchas não via metade delas. Pele dos dois lados fecha o buraco; a borda do rosto, com pele de um lado só, fica onde estava. |
| 90 | Olheiras é uma meia-lua sob cada olho, de 10% a 58% da largura do olho abaixo dos cílios, mais funda perto do canto interno | É onde a olheira escurece. A folga dos cílios evita escurecer a linha d'água, e a borda suave dá ao shader a pele de fora como referência. |
| 91 | O Iluminador fica preso à pele, mas o Automático acende só maçãs, ponte do nariz, meio da testa, arco do cupido e queixo | Iluminar a pele toda é só clarear. Os pontos saem da largura dos olhos e da linha do meio do rosto (151, 168 a 1 e 199 no modelo), e cada um é multiplicado pela pele, para não acender cabelo na testa. |
| 92 | Manchas no Automático procura pontos mais escuros ou mais vermelhos que a pele em volta, com o rosto lido a 640 px | O fundo é a média só da pele em volta, para olho e cabelo não contarem. Pico com menos de 3,5% de destaque é poro, crescer além de 3% do rosto é sombra ou traço, e as narinas ficam de fora. No retrato, 20 das 26 manchas desenhadas e nenhum falso positivo; as que ficaram encostam em lábio, olho ou sobrancelha. |
| 93 | Cada mancha achada passa pelo mesmo toque do pincel de Manchas, e todas viram uma etapa "Automático" | O toque reajusta o centro e escolhe a pele emprestada como sempre. Quando o toque vê um contorno, a mancha é curada no círculo achado, porque a busca já garantiu que ela fica dentro da pele. Mancha de rosto com menos de 140 px não é procurada. |
| 94 | O efeito do Automático chega em 520 ms, e as manchas somem uma a uma, de cima para baixo | Mostra onde a foto mudou sem precisar comparar. Só a máscara final entra no desfazer. Com movimento reduzido, o efeito aparece de uma vez. |
| 95 | Cada correção do Automático de Manchas ganha um círculo, e um toque nele tira só aquela, numa etapa "Tirar correção" | Pedido de quem usa: numa selfie com acne, 1 erro entre 17 acertos estragava a foto, e a escolha era tudo ou nada. O círculo marca também onde a foto mudou. Só no Automático, onde o pincel está parado, para o toque não virar pincelada. |
| 96 | Narinas e asas do nariz saem pelos pontos do modelo (237, 239, 79, 166, 59, 75, 60, 20, 242, 241, 238 e as asas 49, 48, 64, 98, 102, com o espelho de cada um do outro lado), e essa área fica de fora depois do fechamento de buracos | Na selfie, de cabeça virada e inclinada, a elipse calculada entre a ponta do nariz e a boca errava o lugar da narina, e o fechamento de buracos pequenos devolvia o que a elipse tirava. Os pontos foram conferidos sobre a própria foto. A asa entra porque a dobra entre asa e bochecha também parecia mancha. |
| 97 | Junto do contorno, nos pontos da orelha (454, 323, 361, 234, 93, 132), uma faixa fica de fora | De cabeça virada o contorno do modelo passa por cima da orelha, e a concha virou mancha. Só a faixa do contorno: no rosto de frente a bochecha logo ali dentro é pele, e o retrato perdia três manchas com um círculo inteiro. |
| 98 | Ponto com menos de 60% do brilho da pele em volta é buraco ou sombra funda e fica | Espinha e mancha vermelha mudam pouco o brilho. Narina, canto da boca e orelha ficam bem mais escuros. Pinta escura também fica, como antes. |
| 99 | Espinha forte, com 8% ou mais de destaque, pode ter até 4,5% do rosto, e quando a vermelhidão junta várias ela cresce de novo a 62% do pico | Na selfie a espinha inflamada da bochecha e as do queixo não saíam: grandes demais, ou juntas numa área só. Mancha fraca desse tamanho continua sendo sombra. Liberar o tamanho para todas trouxe sombras do canto do olho e da lateral do nariz. Na selfie foram de 17 manchas com 2 erros para 25 sem erro; no retrato continuam 20 das 26. |
| 100 | O topo do contorno sobe 10% do rosto, até a linha do cabelo, e a cor da pele corta no cabelo | O contorno do modelo para antes da linha do cabelo, e as espinhas do alto da testa ficavam de fora de Manchas, Suavizar e Tom de pele. Só a metade de cima sobe, mais no topo. |
| 101 | Tirar as correções redesenha a foto na hora, também com zoom numa foto grande | Atualizar o pipeline direto, como a busca faz, deixava nada marcado para redesenhar. Sem mancha nova para curar, a vista seguia com as manchas curadas, e com zoom numa foto acima de 2048 px o recorte de detalhe também. Agora o recorte é descartado e a vista pede um quadro novo. |
| 102 | Os círculos de Manchas têm um interruptor, ligado de início, e a escolha fica guardada no aparelho | Pedido de quem usa: os círculos atrapalham julgar se a foto ficou boa. Comparar mostra o antes, não o resultado limpo. Desligados, o aviso deixa de falar em tocar num círculo. |
| 103 | O botão de lixeira saiu dos painéis: um segundo toque na ferramenta aberta tira o efeito, e outro aplica de novo | Pedido de quem usa. O botão da ferramenta vira o interruptor e mostra uma chavinha âmbar enquanto o efeito está na foto, o que também diz, no menu, quais ferramentas mexeram na foto. Só nas ferramentas de pincel e em Manchas; nas outras o segundo toque segue recolhendo o painel. Com o painel recolhido no celular o toque reabre o painel antes, para ninguém apagar sem querer. |
| 104 | Salvar a foto termina num momento próprio: a cópia sobe, um reflexo passa e um selo com tique carimba o canto | Pedido de quem usa: o fim da exportação passava seco, e o cartão de progresso sumia antes do tique dele aparecer. Tudo em CSS sobre a miniatura que já estava na tela, sem custo de exportação. |
| 105 | Voltar ao original tira tudo num toque, sem pergunta, e a decisão 85 cai | Pedido de quem usa: o desfazer fica ao lado do botão e resolve um toque errado. A pergunta custava um toque a mais toda vez. Sair do editor ainda perde o desfazer, mas a edição fica salva no projeto até lá. |
| 106 | Cor dos olhos acha a íris na própria foto: o que é tão escuro quanto o meio da íris, contra a pele e o branco em volta, e não mais vermelho que ela | Na selfie enviada por quem usa, o contorno do olho do modelo cortava a íris de uma cabeça inclinada, e o círculo da íris ficava fora do lugar num olho que olha de lado. Alargar o contorno em 12% levava cor para a pele. Agora o círculo vai, até 40% do raio, para onde a íris está, e só entra o que tem o escuro da íris. Cílios e a sombra da pálpebra são escuros também, mas mais vermelhos, e ficam de fora. Pele e olho escuros, sem contraste, voltam ao desenho do modelo. |

## Make

Conferido no retrato procedural, com a GPU, e numa selfie real de cabeça inclinada e virada enviada por quem usa, que
ficou fora do repositório. Falta conferir em pele escura, barba, batom já aplicado e olhos fechados: esses casos só
passam pelos testes unitários, em fotos desenhadas.

| # | Decisão | Motivo |
| --- | --- | --- |
| 107 | Sobrancelha fica em Make, não em Olhos | O que ela faz é preencher e colorir, como maquiagem, e o menu Olhos age no globo ocular. Pedido de quem usa, que deixou a escolha em aberto. |
| 108 | As ferramentas de Make ganharam o mesmo caminho de Pele, Olhos e Cabelo: `region` e `fill` no catálogo | Pedido de quem usa. Busca, voo, brilho, efeito em 520 ms, Automático e Manual, interruptor no botão e queda para o pincel livre vêm do código que já existia. Dentes já seguia o padrão e só foi conferido. Código novo só onde é de maquiagem: `core/face/makeup.ts`. |
| 109 | Batom é limitado e preenchido pelos lábios como a foto mostra: o que fica no caminho entre a cor da pele em volta da boca e a cor do meio dos lábios | O contorno externo do modelo passava da boca no lábio de cima da selfie, e o interno era fino demais para confiar. Em cor sem brilho, a sombra não move a borda. Dentes ficam longe dessa cor, o escuro da boca é cortado pelo brilho. Dentro do contorno a exigência cai 20 pontos, porque o reflexo lava o lábio de cima; fora dele, até 6% da largura da boca, a foto precisa ter certeza. |
| 110 | Batom fecha o que os lábios cercam e larga o que não encosta neles | Um brilho no lábio ficava sem cor e uma mancha vermelha perto da boca ganhava batom. O que os lábios cercam é lábio, e o que não toca neles é pele. A abertura da boca conta como lado de fora, para os dentes não serem fechados. |
| 111 | Sem contraste com a pele, ou quando não há amostra, Batom volta à forma do modelo, com a mesma abertura de Dentes | Batom da cor da pele, ou pele vermelha demais, não dá para ler. As duas ferramentas se encontram sem vão. Boca fechada não tem abertura, e o batom pega a boca toda. |
| 112 | Sobrancelha preenche os fios lidos da foto, o que é mais escuro que a pele logo em volta, e o limite é a sobrancelha com folga de 45% da espessura | Na selfie o contorno do modelo passa da ponta interna em cerca de um terço, e o brilho na testa ao lado engana um limiar fixo. Comparar com a luz logo em volta resolve os dois. A folga deixa engrossar e alongar à mão. A forma do modelo volta quando o escuro não chega a 8%. |
| 113 | As falhas entre os fios ganham até 60% de força | Preencher é para que a sobrancelha serve na maquiagem. Só perto de fios de verdade, então o preenchimento segue a foto e não o contorno. |
| 114 | Sombra limita à pálpebra, dos cílios até 85% do caminho à sobrancelha, e o Automático preenche até 72%, mais forte nos cílios | É como uma sombra esfumada. O limite por igual não impede pintar forte à mão. A pálpebra afina junto do nariz e ganha uma ponta além do canto externo. A altura sai da sobrancelha do mesmo lado, então acompanha quem tem a pálpebra curta. |
| 115 | A cor da própria pálpebra tira o que não é pele | Se o olho do modelo escorrega, branco e íris cairiam na sombra. `skinLikeness` já tira branco, íris, cílios e fios, usando a pálpebra como referência, inclusive com sombra já na foto. |
| 116 | Blush, Contorno e Sardas ficam presos à pele, e o Automático preenche só onde cada produto vai | Como no Iluminador (decisão 91): a mão pode levar o produto para qualquer pele, e olhos, lábios, cabelo e fundo ficam de fora. O Automático também é multiplicado pela pele, então uma mecha na bochecha fica sem blush. |
| 117 | Esses lugares vêm de pontos do modelo, não de medidas a partir dos olhos | Os pontos da malha giram com a cabeça. Conferidos desenhados sobre o retrato e a selfie: maçãs 205, 50, 123 e 425, 280, 352; sob as maçãs 137, 147, 187, 207 e 366, 376, 411, 427; lateral do nariz 122, 174, 198 e 351, 399, 420; alto das bochechas 117, 118, 101, 100 e 346, 347, 330, 329; lateral do rosto 127, 234, 93, 132, 58, 172 e 356, 454, 323, 361, 288, 397. Linhas com mais pontos no nariz ficavam em zigue-zague na cabeça virada. |
| 118 | A largura de cada faixa segue o olho do mesmo lado | De cabeça virada o lado de longe encolhe, e a maquiagem precisa encolher com ele. A largura média deixaria um blush grande demais no lado de longe. |
| 119 | Contorno são três faixas, sob a maçã, na lateral do rosto e na lateral do nariz | É onde o produto escurece de verdade. A lateral entra 5% rumo ao centro, porque o contorno do modelo corre na borda, e passa pela orelha quando a cabeça vira; a pele e o esmaecer tiram o resto. |
| 120 | Sardas caem no alto das bochechas e na ponte do nariz, e os pontos continuam vindo do shader | É onde o sol marca. A máscara só diz onde os pontos aparecem, como antes, e continuam parados na foto em qualquer zoom. |
| 121 | A pele achada para o limite vale também para o que o Automático preenche, só enquanto a ferramenta abre | Blush, Contorno, Sardas e Iluminador calculavam a pele duas vezes, a parte mais lenta: cerca de 0,6 s na selfie de 675 × 1200, cada vez. A memória vive só nesse passo, ligada ao alvo do pedido, e nada fica guardado depois. |
| 122 | Testes de pincel de `flows.spec` passaram a pintar onde a ferramenta alcança | "Borracha" pintava batom na bochecha e "zoom" no nariz. Com Batom preso aos lábios, o traço cai fora e não pinta nada, como deve. A borracha agora usa Blush, e o zoom pinta o lábio. |
