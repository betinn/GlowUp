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
- [x] Busca em tiles para rostos pequenos, com anéis e escolha por toque
- [x] Máscara do rosto com borda suave, refino de contorno e desvanecer no pescoço
- [x] Pincel, borracha e borda sobre a máscara, e pintura à mão quando não há rosto
- [x] Máscara no develop, com liquify, comparação, zoom, exportação e projeto salvo

## M12. Olhos e dentes pelo detector

- [x] Clarear dividido em Dentes, em Make, e Branco do olho, em Olhos
- [x] Marca do pincel como opção, com estado claro, e foto sempre com o resultado real
- [x] Traço limitado à íris, ao branco do olho ou aos dentes, em todos os rostos achados
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
- [ ] Quem usa decide se o download de cerca de 44 MB no primeiro uso do menu fica
- [ ] Placa na resolução da foto: hoje ela tem a da prévia, e numa foto de 12 MP o que aparece atrás sai mais suave
- [ ] Retoques de pele chegarem à placa: o pescoço que aparece vem da foto sem Suavizar nem Tom de pele

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

A cobertura dos dentes usa uma estimativa por brilho e cor, não um contorno feito à mão. Rosto muito virado
leva o contorno do olho mais distante para fora do lugar. Isto também é teste de fumaça, com poucas fotos e
poucos tons de pele.

### Formato do rosto

As fotos reais da pasta de testes, na exportação inteira, pixel a pixel. Conta todo pixel fora da pessoa, sem deixar
faixa nenhuma de fora. A medida anterior deixava de fora uma faixa de 0,6% do lado maior e o que a pessoa cobria, e
por isso dava zero. O que muda é a borda que a cabeça deixou e o chão das pontas soltas do cabelo, completados pelo
modelo. Entre parênteses, quantos mudaram mais de 8 níveis.

| Foto | Pixels fora da pessoa | Mudaram com a cabeça em -100 | Mudaram com a mandíbula em -100 |
| --- | --- | --- | --- |
| Close na cama, travesseiro claro, 675 x 1200 | 272 mil | 8.643 (3.178) | 2.948 (808) |
| Selfie na rua, asfalto, 827 x 1351 | 374 mil | 13.469 (5.071) | 14 (0) |
| Close no carro, 399 x 501 | 64 mil | 3.596 (2.053) | 402 (211) |
| Retrato com parede clara, 800 x 993 | 336 mil | 5.090 (1.899) | 664 (179) |
| Selfie de óculos, calçada, 774 x 1600 | 548 mil | 14.575 (6.523) | 3.077 (1.193) |
| Retrato com fundo claro e mão na cabeça, 758 x 1341 | 419 mil | 3.018 (812) | 385 (91) |

No retrato gerado dos testes, de 1500 x 1875: até 4.176 de 1,14 milhão de pixels de fundo, 0,4%, todos a menos de
5% do lado maior da cabeça, e no corpo só os que encostam nela, a 7 células.

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
