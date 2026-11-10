# Plano

## M0. Setup

- [x] Vite + TypeScript strict + Svelte 5
- [x] ESLint, svelte-check, Vitest, Playwright
- [x] `.gitignore`, scanner de higiene, identidade de commit neutra
- [x] `docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/PLAN.md`

## M1. Núcleo

- [x] Contexto WebGL2, programas, texturas, alvos, leitura assíncrona (PBO)
- [x] Documento de edição e geometria (recorte, rotação, espelho)
- [x] Pipeline não destrutivo com cache por estágio
- [x] Máscaras em textura, motor de pincel (tamanho, dureza, opacidade, fluxo, borracha)
- [x] Histórico por tiles com codec compacto

## M2. Ajustes globais

- [x] Exposição, contraste, realces, sombras, temperatura, tint, saturação, vibrance, nitidez, granulação, vinheta

## M3. Pele

- [x] Remover manchas (healing), toque único automático
- [x] Suavização por separação de frequências + guided filter (Leve, Intenso)
- [x] Olheiras, tom de pele, iluminador
- [x] Pele, olheiras e pontos de luz pelo detector, com Automático e Manual em todas as ferramentas do menu
- [x] Manchas no Automático: busca na pele, cura uma a uma, numa etapa do desfazer
- [x] Tirar uma correção só, com um toque no círculo dela
- [x] Manchas deixa de fora narinas, asas do nariz e a concha da orelha; a pele sobe até a linha do cabelo

## M4. Olhos e dentes

- [x] Clarear, olho vermelho, cor dos olhos, brilho no olhar

## M5. Maquiagem e cabelo

- [x] Batom, blush, sombra, sobrancelha, contorno
- [x] Cabelo (cor, escurecer, profundidade), sardas procedurais

## M6. Forma

- [x] Liquify: empurrar, inflar, contrair, restaurar

## M7. Filtros, presets, blur, recorte

- [x] 40 LUTs 3D procedurais em 10 categorias, intensidade, favoritos
- [x] Receitas de retoque (nativas e do usuário)
- [x] Blur radial e tilt-shift
- [x] Recorte, rotação, espelho, endireitar, proporções

## M8. Saída e persistência

- [x] Antes/depois (segurar e slider dividido)
- [x] Exportar JPG, PNG, WebP em resolução total, com tiling
- [x] Projeto em IndexedDB
- [x] Pré-compressão, config de deploy, PWA

## M9. UI e polimento

- [x] Tela inicial, onboarding, transições, gestos, atalhos
- [x] Acessibilidade e `prefers-reduced-motion`
- [x] Detalhe real ao aproximar além da resolução do preview
- [x] Validação visual em `docs/visual-checks/`
- [x] Varredura final em repositório e `dist/`
- [x] README

## M10. Resposta ao usuário

- [x] Progresso real ao abrir foto e projeto, com a foto revelando junto
- [x] Progresso da exportação por tile, com miniatura que acende por partes
- [x] Área de soltar na tela inteira, com reação ao passar, ao recusar e ao soltar
- [x] Soltar no editor troca a foto e salva a atual
- [x] Comparar com e sem filtro no painel de filtros
- [x] Divisão do antes e depois presa à foto, no celular e no desktop

## M11. Filtro em um rosto

- [x] Detector MediaPipe no próprio site, baixado só no primeiro pedido
- [x] CSP com `'wasm-unsafe-eval'` e `application/wasm` nos exemplos de deploy
- [x] Contador de uso do MediaPipe desligado: nem a tentativa de envio acontece
- [x] Busca em tiles para rostos pequenos, com anéis e escolha por toque
- [x] Máscara do rosto com borda suave, refino de contorno e desvanecer no pescoço
- [x] Pincel, borracha e borda sobre a máscara, e pintura à mão quando não há rosto
- [x] Máscara no develop, com liquify, comparação, zoom, exportação e projeto salvo

## M12. Olhos e dentes pelo detector

- [x] Clarear dividido em Dentes, em Make, e Branco do olho, em Olhos
- [x] Marca do pincel como opção, com estado claro, e foto sempre com o resultado real
- [x] Traço limitado à íris, ao branco do olho ou aos dentes, em todos os rostos achados
- [x] Íris como forma fechada, com o reflexo da luz dentro, e o reflexo branco em cima da cor nova
- [x] Pincel livre sem rosto, sem região, sem detector ou pelo interruptor
- [x] Nada do rosto no projeto salvo

## M13. Foco, brilho e modo automático

- [x] Voo animado até os olhos ou a boca, com escolha entre todos os rostos e o maior
- [x] Voo que cede a qualquer gesto, respeita movimento reduzido, recorte, giro e liquify
- [x] Brilho sobre o alcance do pincel, fora da exportação e diferente da marca do pincel
- [x] Automático e Manual, com o automático aplicado numa etapa e a máscara salva como pintada

## M14. Cabelo

- [x] Grupo Cabelo na barra, entre Make e Forma
- [x] Segmentador de cabelo no próprio site, baixado só na primeira ferramenta de cabelo
- [x] Cabelo achado ao redor de cada rosto, ou na foto toda quando não há rosto
- [x] Cor, Escurecer, Clarear, Contraste e Nitidez, com Automático, voo e brilho como nos olhos

## M15. Voltar ao original

- [x] Zerar por menu e voltar a foto toda ao original, cada um numa etapa do desfazer

## M16. Make pelo detector

- [x] Batom, blush, sombra, sobrancelha, contorno e sardas com busca, voo, brilho, Automático e Manual
- [x] Batom ajusta o contorno dos lábios à cor da foto, com linha limpa e sem os dentes
- [x] Sobrancelha lê os fios do brilho da foto
- [x] Sardas soltas, sem padrão, com tipo, quantidade e tamanho na escala do rosto
- [x] Sombra esmaece dos cílios para cima e fica fora do olho e da sobrancelha
- [x] Blush, contorno e sardas seguem pontos do modelo que giram com a cabeça, sempre sobre a pele
- [x] Sem rosto, sem região ou sem detector, pincel livre com aviso em todas as ferramentas do menu

## M17. Base do automático

- [x] Receita por código que também preenche as máscaras das ferramentas dela, numa etapa do desfazer
- [x] Ferramenta pode declarar uma ação automática própria, além de máscara e manchas
- [x] Seletor Automático e Manual sem props, para qualquer painel
- [x] Deslocamento do Liquify por código, em traços ou por função, com desfazer
- [x] Projeto salvo inválido sai da lista com aviso, e falha passageira avisa e mantém o projeto

## M18. Automático de Forma e Luz

- [x] Liquify no Automático: maxilar e olhos pelos pontos do rosto, numa etapa, com intensidade ao vivo
- [x] O pincel do Liquify segue funcionando por cima do Automático
- [x] Ajustes no Automático: exposição, contraste e balanço de branco lidos da foto, nos controles de sempre
- [x] Desfoque no Automático: foco na cabeça, e sem rosto a foto não muda e o painel diz
- [x] Chavinha, segundo toque, Zerar e desfazer como em Pele e Make
- [x] Conferido nas fotos reais e em cópias escurecidas, clareadas e com dominante de cor

## M19. Glow na Hora

- [x] Tela de escolha depois de abrir a foto, montada de uma lista: Glow na Hora e Do Meu Jeito
- [x] Botão na barra para trocar de caminho, sem perder o que já foi feito
- [x] Menu de looks: um toque aplica no rosto todo, tira as máscaras do look anterior e fica numa etapa do desfazer
- [x] Avisos para rosto não achado, detector que não baixa, código que não baixa e o que ficou de fora
- [x] Painel Receitas removido, e a lista revista nas fotos reais: Festa saiu e os outros ficaram mais leves
- [x] Sombras não transforma o ruído de cor do preto em mancha colorida
- [x] Arquivo `.jfif` abre, mesmo sem tipo declarado

## M20. Menu Filtros

- [x] Um arquivo de dados por filtro, com tabela, grão, vinheta e ajustes, sem mudar o render
- [x] Os 40 filtros migrados, com as mesmas tabelas
- [x] Filtros no lugar de Looks, com categorias e intensidade
- [x] Sugestão automática pelo tom da foto
- [x] Script de réplica a partir de fotos antes e depois, com relatório e aviso de efeito local
- [x] Entrada de Filtros na tela de escolha de caminho
- [ ] Filtros replicados dos pares reais

## M21. Formato do rosto

- [x] Grupo Forma vira Formato do rosto, com Rosto, Olhos, Nariz e boca, e Liquify
- [x] Pessoa separada do fundo no aparelho, com o Selfie Segmenter servido pelo site, lazy, e licença registrada
- [x] Toda deformação deste menu deixa o fundo parado, inclusive o Automático do Liquify
- [x] Chave "Travar o fundo" no pincel do Liquify, ligada por padrão, uma etapa do desfazer
- [x] O painel diz quando não dá para separar o fundo e o que acontece
- [x] Controles pelos pontos do rosto, no zero e para os dois lados, sem acumular erro
- [x] Rosto: mandíbula, maxilar, queixo, maçãs, têmporas, testa, comprimento, cabeça e papada quando dá para ver
- [x] Olhos: tamanho, ângulo, alongar, abrir e fechar, pupilas e sobrancelhas
- [x] Nariz e boca, sempre no zero: largura, ponte, comprimento, ponta; largura, volume, altura e cantos
- [x] Cabeça maior e menor, com o que aparece preenchido a partir do fundo
- [x] Traços do pincel e controles juntos, Zerar, interruptor, vários rostos e projeto salvo
- [x] Conferido nas quatro fotos reais, com linhas finas sobre a foto ampliada
- [x] Separação pelo Selfie Multiclass: cabeça, corpo e fundo, sem o travesseiro ao lado da mandíbula
- [x] Controles movem só a cabeça, com a sombra do queixo junto, e pescoço, ombros e fundo parados
- [x] Olhos, nariz e boca em zonas: a parte muda inteira, a vizinha não se mexe, e nada dobra
- [x] Lábios deslizam sobre os dentes, e a altura move a boca inteira
- [x] O que aparece atrás completado pelo MI-GAN, fundo e corpo cada um do seu tipo, em anéis
- [x] Cartão de progresso com tempo medido no aparelho, cancelar e retomar, e a exportação espera
- [x] Conferido nas sete fotos reais, cada controle nas duas pontas, com a contagem sem faixa de fora
- [x] Quem usa decidiu: ficam os dois modelos, cerca de 44 MB no primeiro uso do menu
- [x] Aviso do tamanho só no celular, e tempo que falta em todo download e em todo passo demorado
- [x] O aviso de 6 MB do detector, nas outras ferramentas, também só no celular
- [x] O pescoço acompanha a mandíbula e o queixo, sem degrau, e volta à largura que tinha; ombros ficam
- [x] Roupa, colar e cinto ficam parados, pixel por pixel, e a pele entre eles e o rosto absorve a diferença
- [x] Limites medidos nas seis fotos: mandíbula 9%, maxilar 10%, queixo e comprimento 6%, e o lado largo de um rosto virado contido
- [x] Preenchimento a partir de fundo limpo: sombra de contato e pontas de barba saem com a pessoa, e a faixa nova encontra a foto sem degrau de tom
- [x] Conferido nas seis fotos reais: mandíbula em -100, -50, +50 e +100 e queixo em -100, com linhas finas
- [x] Arrastar um controle não trava, nem a 6x de lentidão: rascunho na hora, resultado completo igual ao de antes, fio de luz enquanto ele não chega
- [x] O preenchimento em segundo plano cede a vez à página entre os passos pesados
- [ ] Separar a pessoa do fundo fora da página: ao abrir o menu, o MediaPipe e a primeira placa ainda prendem a página por 0,2 a 0,5 s de cada vez, cerca de 2 s no total
- [ ] Desfazer e refazer dos controles também pelos workers: hoje o campo é refeito na hora, 0,1 a 0,25 s num computador rápido
- [ ] Placa na resolução da foto: hoje ela tem a da prévia, e numa foto de 12 MP o que aparece atrás sai mais suave
- [ ] Retoques de pele chegarem à placa: o pescoço que aparece vem da foto sem Suavizar nem Tom de pele

## M22. Brincar

O que é de brincadeira, separado do retoque e dos filtros sérios. Três sessões: a base (S5), as caretas (S6) e os
adesivos (S7), que trabalham em paralelo, cada efeito e cada adesivo no seu arquivo.

- [x] S5: entrada Brincar na tela de escolha, ao lado de Filtros, com menu próprio
- [x] S5: campo próprio, antes do campo do retoque, nos workers com rascunho, no desfazer e no projeto salvo
- [x] S5: com o Brincar vazio, Formato do rosto e Liquify saem iguais, pixel por pixel (e2e)
- [x] S5: registro de caretas, com Olhão e Cabeção, este com a separação da pessoa e o preenchimento
- [x] S5: camada de adesivos na tela e na exportação em resolução total, presa ao rosto, com arrastar, dois dedos, alça e rodinha
- [x] S5: Óculos redondos, desenhados no projeto
- [x] S5: conferido nas seis fotos reais: cada careta, os óculos e tudo junto, na tela e na exportação
- [ ] S6: mais caretas (boca pequena, nariz, queixo, olhos de inseto e outras), cada uma no seu arquivo
- [x] S7: catálogo de 24 adesivos em quatro abas (Óculos, Cabeça, Rosto, Em volta), cada um no seu arquivo, desenhados no projeto
- [x] S7: cada adesivo preso ao seu lugar no rosto (olhos, topo da cabeça, lábio, nariz, bochechas, em volta da cabeça), com a inclinação e o tamanho do rosto
- [x] S7: vários adesivos na foto, fila "Na foto" no menu para escolher cada um, o último por cima e "Trazer para frente"
- [x] S7: miniaturas da grade feitas do próprio SVG
- [x] S7: conferido nas seis fotos reais: cada adesivo, com cabeça inclinada, barba e óculos de verdade, com Cabeção e Olhão, na exportação em resolução total
- [ ] Topo da cabeça estimado pelo rosto: com muito cabelo para cima, coroa e chapéus ficam um pouco dentro do cabelo; arrastar resolve
- [ ] Cabeção com uma mão na frente do rosto: a mão fica atrás da cabeça que cresce, porque a separação não diz o que está na frente
- [ ] Adesivo preso a um rosto ainda não mostra de qual rosto é, numa foto de grupo; ele vai para o rosto escolhido no menu. Nenhuma das seis fotos reais tem mais de um rosto: o grupo foi conferido só na foto gerada do e2e
- [ ] Moldura do adesivo pelo teclado: hoje Delete tira, e mover ou girar pede mouse ou toque

## M23. Aumentar resolução

- [x] Real-ESRGAN x4plus convertido para ONNX por script, em float16, medido contra o float32 nas seis fotos reais
- [x] Servido pelo site, baixado só no primeiro uso, fora do precache, com a licença registrada
- [x] Worker com WebGPU e, sem ele, o processador; tiles com emenda suave e memória por fileira de tiles
- [x] Ferramenta em Quadro: aumenta a foto com os retoques e abre a foto maior como foto nova
- [x] Chave na exportação, desligada por padrão, que aumenta só o arquivo
- [x] Limite de 20 MP, 8 MP no celular, e o painel diz em palavras o que cabe e por quê
- [x] Progresso com tempo que falta e cancelar, no download e no processamento; tamanho do download só no celular
- [x] Conferido nas seis fotos reais: sem emenda nos cruzamentos de tiles, borda, fio e cílio mais nítidos que o bicúbico
- [x] Com o Brincar: caretas e adesivos entram na foto maior, na ferramenta e na exportação, conferido nas seis fotos reais e no e2e
- [ ] Sem WebGPU leva cerca de 40 min por megapixel: threads pediriam isolamento de origem no servidor
- [ ] A pele sai mais lisa que a da foto: o modelo tira o bloco do JPEG e junto um pouco do poro

## Metas medidas

Foto gerada de 12 MP (4000 x 3000), Chromium com aceleração, em uma placa dedicada (`node scripts/perf.mjs`):

| Meta | Pedido | Medido |
| --- | --- | --- |
| Pincel em 12 MP | 60 fps | 60 fps, p95 de 17 ms |
| Liquify em 12 MP | 60 fps | 60 fps, p95 de 17 ms |
| Exportação JPG de 12 MP | menos de 3 s | 1,3 s |
| Abrir foto de 12 MP, até o primeiro quadro | sem meta | 1,1 s na primeira vez, 0,3 s depois |
| Pincel na área do filtro em 12 MP, com borda suave | 60 fps | 60 fps, p95 de 17 ms |
| Exportação JPG de 12 MP com filtro em máscara e liquify | menos de 3 s | 1,4 s |
| Ligar o detector e buscar em 12 MP sem rosto, o pior caso de tiles | sem meta | 2,1 s, sem contar a rede |

A primeira abertura é mais lenta porque compila os shaders. Pincel oscilou entre 57 e 60 fps entre medições.

Notebook comum e celular médio não foram medidos: não havia esses aparelhos no ambiente de desenvolvimento.

### Aumentar resolução

Seis fotos reais de 0,2 a 1,2 MP, aumentadas 4×, no Chrome com RTX 3070 Ti. Tempo do toque à foto nova aberta, com o
modelo já ligado; ligar leva de 2 a 3,5 s na primeira vez depois que a página abre.

| Caso | Medido |
| --- | --- |
| WebGPU, por megapixel de foto | 10 a 12 s |
| WebGPU, 0,2 MP (399 × 501 para 1596 × 2004) | 4,8 s na ferramenta, 5,4 s na exportação |
| WebGPU, 1,2 MP (774 × 1600 para 3096 × 6400) | 16,8 s na ferramenta, 16 s na exportação |
| WebGPU com o processador da página 4 vezes mais lento | 14 a 15 s por megapixel |
| 2× no lugar de 4× | o mesmo tempo: o modelo sempre faz 4× |
| Sem WebGPU, no processador, num fio só | cerca de 40 min por megapixel; 8,4 min para 0,2 MP |
| Maior intervalo entre quadros durante o aumento | 10 ms, 50 ms com o processador 4 vezes mais lento |

### Detector de rostos

Transferência medida na rede, com os arquivos `.br` do build:

| Item | Bytes |
| --- | --- |
| Primeira visita, JS de entrada em gzip | 27.265 (antes: 26.622) |
| Primeiro uso: modelo | 3.147.906 |
| Primeiro uso: WebAssembly | 2.872.642 |
| Primeiro uso: carregador e biblioteca | 106.573 |
| Primeiro uso: anéis, JS e CSS | 1.803 |
| Primeiro uso: total | 6.128.924 |

O build ficou mais lento: o brotli do WebAssembly leva a maior parte de cerca de 38 s.

Fotos reais de domínio público, usadas só localmente, com a mesma máquina da tabela acima. Rostos
contados a olho.

| Foto | Tamanho | Passada única | Com tiles | Falsos | Busca |
| --- | --- | --- | --- | --- | --- |
| Retrato, 1 pessoa | 2548 x 3558 | 1 de 1 | 1 de 1 | 0 | 0,1 s |
| Retrato, 1 pessoa | 2400 x 3000 | 1 de 1 | 1 de 1 | 0 | 0,3 s |
| Equipe, 6 pessoas | 4000 x 3200 | 0 de 6 | 6 de 6 | 0 | 1,6 s |
| Grupo, 10 pessoas | 7433 x 4955 | 0 de 10 | 10 de 10 | 0 | 3,4 s |
| Grupo, 23 pessoas | 8411 x 4731 | 0 de 23 | 23 de 23 | 0 | 3,0 s |
| Grupo, 24 pessoas | 4096 x 2722 | 0 de 24 | 24 de 24 | 1 (mão) | 3,7 s |
| Grupo antigo em preto e branco, 29 pessoas | 3000 x 2171 | 0 de 29 | 29 de 29 | 0 | 3,1 s |
| 3 pessoas, duas de perfil ou de costas | 2100 x 1500 | 0 de 3 | 1 de 3 | 0 | 0,4 s |
| 2 pessoas, uma olhando para baixo | 3000 x 1992 | 0 de 2 | 1 de 2 | 2 (mão, joelho) | 2,0 s |

Rosto de perfil, de costas ou olhando para baixo escapa. Nesses casos a pessoa pinta a área. Abaixo de
cerca de 1,2% do lado maior o rosto também escapa, por limite do tile mais fino. O total de fotos é
pequeno e a amostra de tons de pele também: isto é um teste de fumaça, não uma medida de precisão.

### Limite de olhos e dentes

Mesmas fotos da tabela acima, com a aceleração da GPU, em foto já aberta. Primeira ferramenta inclui ligar
o detector, sem o download. As seguintes reaproveitam a busca.

| Foto | Primeira ferramenta pronta | Próximas ferramentas |
| --- | --- | --- |
| Retrato, 1 pessoa, 2400 x 3000 | 1,2 s | menos de 0,1 s |
| Equipe, 6 pessoas, 4000 x 3200 | 2,3 s | cerca de 0,1 s |
| Grupo, 23 pessoas, 8411 x 4731 | 3,7 s | menos de 0,1 s |

Montar os três limites de uma foto levou de 17 a 81 ms. A primeira visita continua com 27,3 KB de JS em
gzip, e o detector continua fora do precache.

| O que foi olhado | Resultado |
| --- | --- |
| Olho e íris no lugar, 65 rostos a olho | 59 certos |
| Contorno interno dos lábios, 45 sorrisos | mais de 20% dos dentes de fora em 9 |
| Contorno levado 40% rumo ao externo, os mesmos 45 | mais de 20% dos dentes de fora em 5 |
| Bocas com abertura abaixo de 3%, 20 olhadas | nenhum dente à mostra |

| Reflexo da luz dentro da máscara da íris, os 4 olhos nítidos com reflexo, de 2 fotos reais | de 42% para 97% |
| Íris que a máscara deixava de fora, 6 olhos nítidos de 3 fotos reais | de 13% para 4% |
| Buracos dentro da máscara, os mesmos 6 | de 2,2% da íris para zero |

A íris foi medida contra um contorno feito à mão, certo a cerca de 1 px, que nesses olhos é 10% da área. Em
mais 4 olhos pequenos ou borrados o contorno à mão é só uma ideia. Ficam de fora do alcance: olho atrás de
óculos escuros, que recebe o círculo do modelo em cima da lente; cílios pretos por cima de uma íris castanha,
que entram até a folga do contorno; e um reflexo largo e pouco claro num close, que pega um pouco da cor.

A cobertura dos dentes usa uma estimativa por brilho e cor, não um contorno feito à mão. Rosto muito virado
leva o contorno do olho mais distante para fora do lugar. Isto também é teste de fumaça, com poucas fotos e
poucos tons de pele.

### Formato do rosto

As fotos reais da pasta de testes, na exportação inteira, pixel a pixel. Conta todo pixel fora da pessoa, sem deixar
faixa nenhuma de fora. O que muda é a borda que a cabeça e o pescoço deixaram, o que ela largava no chão ao lado,
como a sombra de contato, e o chão das pontas soltas do cabelo, completados pelo modelo. Entre parênteses, quantos
mudaram mais de 8 níveis. A mandíbula muda mais fundo do que na medida anterior porque agora o pescoço vai junto e
a borda dele também se afasta. Os limites são os da decisão 237.

| Foto | Pixels fora da pessoa | Cabeça em -100 | Mandíbula em -100 | Queixo em -100 |
| --- | --- | --- | --- | --- |
| Close na cama, travesseiro claro, 675 x 1200 | 272 mil | 14.286 (6.010) | 6.093 (2.408) | 641 (80) |
| Selfie na rua, asfalto, 827 x 1351 | 374 mil | 17.971 (6.496) | 86 (5) | 0 |
| Close no carro, 399 x 501 | 64 mil | 5.246 (2.988) | 1.319 (757) | 0 |
| Retrato com parede clara, 800 x 993 | 336 mil | 9.284 (2.719) | 2.768 (853) | 0 |
| Selfie de óculos, calçada, 774 x 1600 | 548 mil | 22.878 (9.782) | 5.948 (2.227) | 0 |
| Retrato com fundo claro e mão na cabeça, 758 x 1341 | 419 mil | 6.557 (1.366) | 1.238 (576) | 1.410 (345) |

No retrato gerado dos testes, de 1500 x 1875, com o palpite rápido: 8.243 de 1,14 milhão de pixels de fundo com a
cabeça em -100, 0,7%, e 5.922 com a mandíbula, todos a menos de 35% do comprimento do rosto da cabeça. No corpo,
só o que fica a menos disso: mais longe ele sai igual, pixel por pixel.

O pescoço, nas mesmas seis fotos, cada uma com a mandíbula em -100, -50, +50 e +100 e o queixo em -100, olhadas
ampliadas com os mattes em linhas finas. Deslize é quanto a cabeça escorrega sobre a pele do corpo no pior ponto,
onde uma gola não deixa a pele acompanhar: é o degrau que sobra.

| Foto | Rosto | Borda da mandíbula em -100 | Deslize, mandíbula em -100 | Deslize, queixo em -100 |
| --- | --- | --- | --- | --- |
| Close na cama, alça e corrente fina | 535 px | 16,0 px | 0 | 20,3 px |
| Selfie na rua, blusa escura | 428 px | 12,3 px | 7,7 px | 10,6 px |
| Close no carro, cinto encostado no queixo | 294 px | 9,1 px | 2,2 px | 17,5 px |
| Retrato com parede clara, gola logo abaixo | 512 px | 15,1 px | 6,0 px | 9,7 px |
| Selfie de óculos, corrente grossa | 476 px | 14,3 px | 7,1 px | 0 |
| Retrato com fundo claro, blusa preta | 341 px | 10,7 px | 2,5 px | 0 |

Arrastar um controle, no Chrome instalado, com o mouse de verdade a 60 movimentos por segundo durante 2,4 s, ida e
volta. A lentidão de 4x e 6x é a do DevTools, no lugar de um celular fraco: ela vale para a página e não para os
workers, e num celular os workers também andam devagar. "Até o controle" é do evento do mouse até o quadro seguinte
da página, que é quando o controle se move. A tarefa mais longa é a maior da página durante o arrasto. Antes, nas
duas fotos medidas na versão anterior. Depois, nas seis fotos reais, o pior caso entre elas.

| Controle | Lentidão | Tarefa mais longa, antes | Até o controle, antes (mediana / pior) | Tarefa mais longa, depois | Até o controle, depois (mediana / pior) |
| --- | --- | --- | --- | --- | --- |
| Linha da mandíbula | 1x | 140 ms | 104 / 138 ms | 123 ms, uma só | 1 / 15 ms |
| Linha da mandíbula | 4x | 858 ms | 508 / 853 ms | 105 ms, uma só | 2 / 23 ms |
| Linha da mandíbula | 6x | 3.034 ms | 898 / 3.023 ms | 102 ms, uma só | 3 / 29 ms |
| Queixo | 1x | 0 | 20 / 28 ms | 0 | 1 / 8 ms |
| Queixo | 4x | 313 ms | 139 / 309 ms | 0 | 4 / 9 ms |
| Queixo | 6x | 356 ms | 265 / 349 ms | 0 | 7 / 23 ms |

Antes, quase todo movimento era uma tarefa longa: 141 a 148 por arrasto. Depois sobra uma, no primeiro arrasto de
cada foto, que é o primeiro quadro com o campo na GPU, e o Queixo logo em seguida não tem nenhuma. O campo final,
depois de soltar, foi comparado com o que a página faz sozinha em todas as fotos e em todas as lentidões: zero
células diferentes. Com o preenchimento rodando e um controle arrastado sem parar, o preenchimento não passou de
67 ms por tarefa, e o controle de 4 ms até o quadro.

Download e tempo, medidos nesta máquina, com os arquivos `.br` do build:

| Item | Na rede | Tempo |
| --- | --- | --- |
| Selfie Multiclass | 14.955.395 bytes | 0,3 s por recorte, três por rosto |
| MI-GAN | 24.252.773 bytes | 0,1 s por bloco com WebGPU, 1,7 s em WebAssembly |
| ONNX Runtime Web, WebAssembly e worker | 4.349.039 bytes | cerca de 2,5 s para ligar |
| Preenchimento do close na cama, com WebGPU | | cerca de 5 s |
| Preenchimento do retrato dos testes, sem WebGPU | | 1,3 min |

O que ficou limitado, visto nas fotos: óculos na frente do nariz ou dos olhos entortam com os controles dessas
partes. Em fundo com textura, o chão das pontas soltas do cabelo volta com textura parecida e não igual. Com a
cabeça em -100, um ou outro risco fino pode aparecer no fundo liso ao lado do rosto, visto só com zoom.

No pescoço: com a gola encostada no canto da mandíbula, a pele não tem para onde ir e o rosto desliza sobre ela.
No limite isso é um pedaço de pescoço a mais ao lado da barba, sem corte. No close no carro o cinto passa por cima
do queixo, e ali o queixo sobe sobre o cinto, que fica. Com o queixo em -100 e uma alça a 30 px dele, a borda do
pescoço faz uma quina pequena logo abaixo do queixo, vista com zoom de 5 vezes. A faixa de fundo que aparece ao lado
do pescoço vem do modelo: num travesseiro com dobras ela continua as dobras parecidas, não iguais. Para ir além
disso seria preciso completar também a roupa atrás da pele, com um terceiro plano e outra passada do modelo, e
medir o pescoço como parte própria em vez de pele nua em geral.

### Automático de Forma e Luz

As quatro fotos reais da pasta de testes, e cópias delas alteradas. As fotos não entram no repositório.

| Foto | Exposição | Contraste | Temperatura | Tint | Maior deslocamento em 50 |
| --- | --- | --- | --- | --- | --- |
| Selfie na rua, ao entardecer | 0 | +16 | -4 | -4 | 0,49% do lado maior |
| Retrato com parede clara | 0 | 0 | -7 | +6 | 0,63% |
| Close no carro, teto bege | 0 | 0 | 0 | +6 | 1,00% |
| Close na cama, luz de abajur | 0 | +6 | -14 | +6 | 0,97% |

| Cópia alterada | Exposição | Contraste | Temperatura | Tint |
| --- | --- | --- | --- | --- |
| Retrato, valores de sRGB a 45% | +51 | +23 | -5 | +6 |
| Retrato, valores de sRGB a 150% | -25 | 0 | 0 | +6 |
| Retrato com sépia a 35% | 0 | 0 | -11 | +6 |
| Close no carro, contraste a 60% | 0 | +22 | +5 | +6 |

Quatro fotos é pouco, e nenhuma tem pele retinta. O limite que protege esse caso está em teste unitário com
pele desenhada, não em foto real. Sem foto de grupo real, o foco de vários rostos só rodou no retrato gerado.

### Foco, brilho e modo automático

SwiftShader no e2e, retrato procedural de 1500 x 1875, tela de 1280 x 800.

| O que foi medido | Resultado |
| --- | --- |
| Zoom de chegada, olhos | 1,9 vez, com os dois olhos em 60% da largura livre |
| Zoom de chegada, Dentes | 4,0 vezes |
| Foto com dois rostos que ocupam a foto inteira | vai para um rosto, 2,3 vezes |
| Voo e brilho | 650 ms e 1,1 s, aviso por 2,6 s |
| JS da primeira visita em gzip | 27,2 KB, eram 27,3 KB |
| Chunk do editor em gzip | 37,4 KB, eram 34,8 KB |

O brilho custa uma leitura de textura a mais por pixel, só enquanto toca. O detector continua fora do
precache e só baixa quando uma ferramenta de olhos ou dentes abre.
