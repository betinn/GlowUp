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
- [x] Dentes pelo que a foto mostra: lábio, gengiva, língua e escuro da boca de fora, dente amarelo dentro. Nas 4 fotos reais com dentes a borda fica no dente; nas 14 de boca fechada a máscara fica vazia
- [x] Pincel livre sem rosto, sem região, sem detector ou pelo interruptor
- [x] Nada do rosto no projeto salvo

## M13. Foco, brilho e modo automático

- [x] Escolher uma parte não mexe na vista: o brilho mostra a região e o zoom fica com a pessoa (decisão 345, o voo animado saiu)
- [x] Brilho sobre o alcance do pincel, fora da exportação e diferente da marca do pincel
- [x] Automático e Manual, com o automático aplicado numa etapa e a máscara salva como pintada

## M14. Cabelo

- [x] Grupo Cabelo na barra, entre Make e Forma
- [x] Segmentador de cabelo no próprio site, baixado só na primeira ferramenta de cabelo
- [x] Cabelo achado ao redor de cada rosto, ou na foto toda quando não há rosto
- [x] Cor, Escurecer, Clarear, Contraste e Nitidez, com Automático e brilho como nos olhos

## M15. Voltar ao original

- [x] Zerar por menu e voltar a foto toda ao original, cada um numa etapa do desfazer

## M16. Make pelo detector

- [x] Batom, blush, sombra, sobrancelha, contorno e sardas com busca, brilho, Automático e Manual
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
- [x] Pares reais lidos e medidos: são de luz refeita, não de cor, e seguem no M24

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
- [ ] Separar a pessoa do fundo fora da página: o MediaPipe e a primeira placa ainda prendem a página por 0,2 a 0,5 s de cada vez, cerca de 2 s no total. Abrir o menu já não faz isso: a separação vem no primeiro controle que se mexe ou no primeiro traço do Liquify (M25)
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
- [x] S6: doze caretas novas, cada uma no seu arquivo: Olhinhos, Narigão, Narizinho, Bocão, Boquinha, Sorrisão,
  Bochechas de esquilo, Cara de peixe, Queixão, Testão, Esticado e Achatado
- [x] S6: caretas uma depois da outra, na ordem do menu, cada uma lendo o rosto como as de antes deixaram
- [x] S6: caretas prontas num toque (Caricatura, Bebê, Alien, Palhaço), uma etapa do desfazer, segundo toque tira
- [x] S6: teste de cada careta sem dobra, de frente e inclinada, e e2e das prontas com desfazer e projeto salvo
- [x] S6: conferido nas seis fotos reais, cada careta a 50 e a 100 e cada pronta, com barba, óculos e cabeça inclinada
- [x] S6: conferido nas seis fotos reais com coroa, óculos, bigode e estrelas: os adesivos seguem cada careta e cada
  pronta, e o Aumentar resolução leva caretas e adesivos, na ferramenta e na exportação
- [ ] Queixão e Testão esticam a pele do queixo e da testa até umas duas vezes: barba e espinhas ficam riscadas no
  comprido
- [ ] Achatado e Esticado não medem o cabelo: cabelo curto baixa um pouco e as placas preenchem, e cabelo muito
  volumoso dos lados encolhe junto com o rosto
- [ ] Prontas com a cabeça inteira levam até três vezes o tempo do Cabeção sozinho para refazer o campo (o rascunho
  fica em torno de 0,1 s num grid de 768 x 1024)
- [x] S7: catálogo de 24 adesivos em quatro abas (Óculos, Cabeça, Rosto, Em volta), cada um no seu arquivo, desenhados no projeto
- [x] S7: cada adesivo preso ao seu lugar no rosto (olhos, topo da cabeça, lábio, nariz, bochechas, em volta da cabeça), com a inclinação e o tamanho do rosto
- [x] S7: vários adesivos na foto, fila "Na foto" no menu para escolher cada um, o último por cima e "Trazer para frente"
- [x] S7: miniaturas da grade feitas do próprio SVG
- [x] S7: conferido nas seis fotos reais: cada adesivo, com cabeça inclinada, barba e óculos de verdade, com Cabeção e Olhão, na exportação em resolução total
- [x] S7: adesivos conferidos no Aumentar resolução, na ferramenta e na exportação, em 4× nas seis fotos reais e no e2e
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
- [x] Sem conexão com o site, o modelo não baixa e a exportação e a ferramenta dizem isso, em vez de sugerir outro formato; com a conexão de volta, funciona. Conferido em 2× e 4×, PNG, JPG e WebP, nas seis fotos reais, com WebGPU
- [ ] Sem WebGPU leva cerca de 40 min por megapixel: threads pediriam isolamento de origem no servidor
- [ ] A pele sai mais lisa que a da foto: o modelo tira o bloco do JPEG e junto um pouco do poro

## M24. Luzes

Os dez pares reais de antes e depois (B, c, D, E, F, H, I, J, K, L) não são filtros de cor. Em todos a luz da
cena foi refeita: o fundo escurece ou muda de cor enquanto a pessoa clareia, ou uma luz aparece atrás dela. Uma
tabela de cor trata os dois do mesmo jeito e não chega lá. Por isso eles ganham um passe próprio, o das Luzes.
Das dez luzes feitas aqui, quatro ficaram, e hoje moram nos Filtros: veja o M27.

A primeira entrega (PR 18) separava a pessoa do fundo com uma máscara e tratava cada lado como uma camada. Na
foto de quem usa, a pessoa parecia recortada e colada: borda dura com halo, roupa escura em blocos e pontos
brancos espalhados. Esta entrega refaz a luz como uma luz de verdade cai: pela profundidade da foto.

Três famílias, medidas nos pares:

| Família | Pares | O que muda |
| --- | --- | --- |
| Flash | B, c, D, F, H, I | A exposição cai de 1,2 a 4 pontos no que está longe e sobe até 3,5 pontos na pessoa. A passagem segue a profundidade: o chão perto da câmera fica aceso (par c) e a parede atrás some |
| Luz por trás | J, K, L | A pessoa cai de 0,3 a 1,3 ponto, o fundo de 0 a 3,6, e uma lâmpada atrás dela estoura o que está em volta e acende fios do cabelo |
| Cor de cena | E | O fundo cinza vira azul de um lado e magenta do outro, e a pessoa esfria |

- [x] Os alvos foram refeitos por um modelo generativo: fios, reflexos, rostos e fundos mudam de desenho. A meta é a luz e a cor de cada alvo, não o pixel
- [x] Cada alvo alinhado ao original (só deslocamento, escala 1,000) e medido na imagem inteira, sem a interface do print: SSIM, ΔE2000 e LPIPS
- [x] Profundidade da foto com o Depth Anything V2 Small (Apache 2.0, 49,6 MB), no WebGPU quando há e no WASM quando não
- [x] Recorte da pessoa com borda mole de cabelo, com o MODNet (Apache 2.0, 13 MB), levado para as cores da própria foto
- [x] Os dois modelos baixam do próprio site no primeiro toque numa luz, 59 MB no fio, e rodam num worker
- [x] Cena da foto, uma vez por foto: profundidade de cada lado da borda da pessoa, recorte, pele, cabelo e sombra da pele, em duas texturas
- [x] A luz cai pela profundidade, sem linha de corte: a borda da luz é a borda que a foto tem
- [x] Preenchimento das sombras da pele, como faz uma luz que vem da câmera
- [x] Lâmpada atrás da pessoa como um campo contínuo sobre a borda dela, sem linha desenhada
- [x] Curva de filme (contraste, pé e ombro), vinheta, vazamento de luz e grão medido nos alvos. Sem poeira e sem pontos de luz inventados
- [x] Uma luz é um arquivo de números, e uma lista registra todas: par novo, arquivo novo
- [x] A receita segue a foto: diz o brilho que o fundo e a pele tinham na foto do par e acompanha uma foto diferente
- [x] Flash: Flash Analógico (c) e Brasa (B), que saiu como Noite de Festa
- [x] Luz por trás: Contraluz Dourado (L)
- [x] Cor de cena: Néon (E)
- [x] Miniaturas na própria foto, um toque põe, outro tira, intensidade, uma etapa do desfazer
- [x] Soma com look, filtro, ajustes, desfoque e recorte, e "Voltar ao original" tira a luz
- [x] Projeto salvo guarda a cena e abre com a luz, sem baixar detector nem modelo
- [x] Foto sem ninguém também recebe luz: ela cai no que está mais perto
- [x] Conferido nos pares pelo app e nas seis fotos reais de teste
- [ ] Nenhuma luz chega a 95% do alvo. O SSIM fica entre 0,51 e 0,78 e o teto de qualquer filtro que guarda os pixels da foto fica entre 0,75 e 0,91 (tabela em Metas medidas). Igualar o alvo pede um modelo generativo de relight, de mais de 2 GB, que não cabe no site
- [ ] Luz por trás é a família mais longe do alvo: os alvos desenham fios soltos acesos que a foto não tem. A luz acende o que está em volta e alguns fios de dentro do cabelo, e não desenha fio novo
- [ ] Néon: sem os pontos de luz e sem o reflexo na água do alvo. Um ponto inventado não sabe onde fica o horizonte
- [ ] Nenhuma luz muda a direção da sombra no rosto: a pele é preenchida por igual
- [ ] A cena é da foto como foi aberta: depois de Formato do rosto, Liquify ou Brincar, a luz cai onde a pessoa estava
- [ ] O recorte roda só no processador: no WebGPU este runtime devolve um recorte errado para o MODNet, sem erro. Custa 2,2 s no computador
- [ ] Celular não foi medido: não havia aparelho. Pela conta do computador, de 7 a 9 s com WebGPU e de 15 a 20 s sem, uma vez por foto
- [ ] As miniaturas só mostram a foto depois da primeira leitura da cena. Antes disso mostram duas cores de cada luz
- [ ] A medição contra os pares roda em scripts fora do repositório, porque lê as fotos reais

## M25. Seletor de cor e Cor dos olhos

As cores prontas passavam da borda da tela e não havia como rolar até elas. E a Cor dos olhos, no Automático,
começava forte demais: o primeiro resultado já parecia um olho falso.

- [x] Um só seletor para todas as ferramentas de cor (olhos, cabelo, make e sardas), com as cores prontas quebrando em linhas, alcançáveis no celular e no computador
- [x] Cor própria por quadrado de saturação e brilho e faixa de matiz, com toque, mouse e setas do teclado, mais o código hex e a amostra da cor
- [x] A foto acompanha o arraste sem travar, e cada escolha é uma etapa do desfazer
- [x] As últimas cinco cores próprias guardadas por ferramenta, ao lado das prontas
- [x] Cor dos olhos começa em 50, escolhido nas fotos reais com azul, verde, mel e cinza; o controle ainda vai até a força de antes
- [x] A luz da íris muda pelo todo e não pixel a pixel: fibras e anel escuro da borda ficam
- [ ] A cor nova é uma só em toda a íris: não há o anel dourado em volta da pupila nem a variação de tom de um olho de verdade
- [ ] Atrás de lente clara ou com a borda da máscara passando pela sombra da pálpebra, a íris ainda pode sair como um disco em 100

## M26. Ferramentas sob demanda

- [x] Toda ferramenta abre no Manual, com o pincel livre, sem baixar nem rodar modelo (e2e olha a rede)
- [x] O modelo baixa no Automático, na chave "Só na…" ou no primeiro controle que precisa do rosto, com o cartão de progresso
- [x] Formato do rosto e Brincar esperam o primeiro controle, careta ou adesivo, e o número que se mexeu entra quando o rosto chega
- [x] Liquify separa o fundo no primeiro traço, e não ao abrir
- [x] Manchas: Automático e Manual no mesmo conjunto de correções, cada uma com a origem, no desfazer e no projeto salvo
- [x] Manchas: o Automático procura uma vez por foto, e voltar a ele não refaz nem devolve o que foi tirado
- [x] Manchas: círculos nos dois modos, e um toque tira a correção, do Automático ou do pincel
- [ ] Um projeto salvo não lembra quais manchas do Automático a pessoa tirou: se ela tirou todas, o Automático põe de novo ao reabrir
- [ ] No Manual, um círculo ocupa o lugar do toque do pincel: para tratar de novo bem em cima de uma correção, é preciso tirar o círculo antes

## M27. Luzes enxutas e looks com luz

Das dez luzes do M24, quatro deram certo. Quatro é pouco para uma prateleira, então elas foram morar nos Filtros,
e o Glow na Hora voltou a ser só de looks, agora com dez. Os looks novos usam o que os modelos do site acham na
foto: pele, olheiras, olhos, dentes, a luz do rosto e o que está atrás da pessoa.

- [x] Ficam Néon, Contraluz Dourado, Brasa e Flash Analógico. Saem Luz de Estúdio, Flash Direto, Analógica, Entardecer, Contraluz e Silhueta, com a data impressa que só a Analógica usava
- [x] Noite de Festa vira Brasa, com o mesmo id no projeto salvo
- [x] As quatro luzes numa aba Luzes dos Filtros, entre as categorias: no caminho Filtros e na ferramenta Filtros do Do Meu Jeito
- [x] Luz e filtro juntos, cada um com a sua intensidade, e um ponto na aba quando há luz na foto
- [x] Projeto salvo com uma luz que saiu abre sem luz; projeto só com luz reabre nos Filtros, na aba Luzes
- [x] Look com luz própria: a receita aponta para uma luz de `looklights.ts`, que só segue a foto num sentido e com limite
- [x] Cinco looks novos: Retrato, Luz de Janela, Luz de Vela, Fim de Tarde e Olhar
- [x] Luz de Vela no espírito da Brasa: o lugar baixa e esquenta, a pele com brilho quente
- [x] O look com luz baixa os modelos da cena só no toque, com o cartão de progresso; os outros looks não baixam nada a mais (e2e olha a rede)
- [x] A luz do look entra e sai com ele numa etapa do desfazer, troca com outro look, e tem o controle "Luz do look"
- [x] Sem o leitor de profundidade, o look entra sem a luz, com aviso, e outro toque tenta de novo
- [x] Conferido nas sete fotos reais de teste, os cinco looks novos em cada uma: foto inteira, rosto e borda da cabeça em tamanho de pixel
- [ ] A miniatura de um look com luz mostra só a cor dele: a luz pede a cena, que só é lida no toque
- [ ] Numa foto real de pouca resolução, contra parede clara, a borda clara da orelha aparece como uma linha fina quando o fundo desce (Luz de Vela e, mais fraca, Retrato). É a mesma borda que as Luzes mostram com o fundo muito mais escuro
- [ ] O fundo recua pela luz e pela cor, não por desfoque: um desfoque por profundidade ficou de fora
- [ ] Os looks novos não curam manchas (decisão 167) e não medem cada parte do rosto: olheiras, dentes e olhos entram com a mesma força em qualquer foto, e só a luz segue a foto
- [ ] Celular não foi medido nos looks com luz: vale a conta do M24, de 7 a 20 s na primeira leitura da cena

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

### Luzes

Cada alvo foi alinhado ao seu original (um deslocamento, achado por pontos em comum: a escala fica em 1,000) e a
luz do app entrou no original pela exportação do próprio app. A conta é na imagem inteira, sem a interface do
print (título, botões, ícones). A tabela guarda as quatro luzes que ficaram (M27):

- **SSIM**, de 0 a 1, onde 1 é igual.
- **ΔE2000** médio: a distância de cor que o olho vê. Abaixo de 2 quase não se nota.
- **LPIPS** (AlexNet): a distância que uma rede treinada com julgamentos de pessoas vê. Menor é mais perto.

"Sem luz" é o original contra o alvo. "Teto" é o melhor que um filtro pode fazer guardando os pixels da foto: em
volta de cada ponto, num raio de 24 px, o ganho e o deslocamento de cor que mais aproximam o original do alvo,
tirados do próprio alvo. Nenhum filtro de verdade passa dele, porque ele lê a resposta.

| Par | Luz | SSIM sem luz | SSIM com a luz | SSIM teto | ΔE sem luz | ΔE com a luz | ΔE teto | LPIPS sem luz | LPIPS com a luz | LPIPS teto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| c | Flash Analógico | 0,462 | 0,551 | 0,753 | 25,6 | 10,3 | 4,4 | 0,486 | 0,364 | 0,328 |
| B | Brasa | 0,616 | 0,648 | 0,913 | 16,8 | 4,3 | 2,3 | 0,328 | 0,218 | 0,147 |
| E | Néon | 0,620 | 0,699 | 0,906 | 26,4 | 6,0 | 2,1 | 0,411 | 0,232 | 0,138 |
| L | Contraluz Dourado | 0,547 | 0,740 | 0,874 | 21,7 | 9,2 | 3,3 | 0,398 | 0,309 | 0,203 |

- **Nenhuma luz chega à meta de 95%.** O SSIM pedido era 0,95. O teto fica entre 0,75 e 0,91: os alvos foram
  refeitos por um modelo generativo, que redesenha fios, pele, reflexos e fundo. Só passa de 0,95 quem copia o
  alvo quase ponto a ponto (o mesmo cálculo com raio de 2 px dá de 0,90 a 0,97).
- **Flash Analógico, Brasa e Néon** fecham a cor: o ΔE cai de 17 a 26 para 4 a 10.
- **Contraluz Dourado**, a luz por trás que ficou, é a mais longe em cor: ΔE 9,2. O alvo desenha fios soltos
  acesos em volta do cabelo, que a foto não tem.
- **Grão** medido nas partes lisas de cada alvo, depois de tirar um borrão pequeno: desvio de 0,6 a 2,5 em 255.
  As luzes ficam na mesma faixa, de 0,7 a 2,7.
- **Tempo de ler a cena**, com os modelos já baixados, numa foto de 800 x 1300 no computador (RTX 3070 Ti):
  profundidade 0,02 a 0,14 s no WebGPU e 2,8 s no WASM; recorte 2,2 s, sempre no WASM. Do toque até a luz numa
  página recém-aberta, com WebGPU e sem contar a rede, de 6,4 a 7,5 s: ligar o detector, os separadores e os dois
  modelos, e ler a foto.
- **Download**, no primeiro toque numa luz: 43,6 MB da profundidade, 11,3 MB do recorte e 4,3 MB do runtime, com
  brotli. O runtime já veio se a pessoa usou o preenchimento ou o aumento de resolução.
- A exportação em tiles de 384 px difere da exportação inteira em menos de 0,6 de 255 na média, com grão e
  vazamento (e2e).
- Nas seis fotos reais de teste, as luzes entram sem linha de corte e sem contorno desenhado. Numa selfie
  de rosto grande em parede clara o Flash Analógico estoura a pele mais do que no par.
- **Looks com luz** (M27), nas sete fotos reais: o fundo desce de 0,2 a 0,55 ponto no Retrato, de 0,5 a 1 ponto
  na Luz de Vela e de 0,25 a 0,65 no Fim de Tarde, conforme o brilho que ele tinha. O rosto sobe no máximo 0,6
  ponto no Retrato e 0,8 na Luz de Janela, e só quando a pele está abaixo do brilho da receita. Sem halo e sem
  linha de corte em cabelo contra parede clara.

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

O voo e os zooms de chegada desta tabela saíram com a decisão 345: a vista não se mexe ao escolher uma parte.

O brilho custa uma leitura de textura a mais por pixel, só enquanto toca. O detector continua fora do
precache e só baixa quando uma ferramenta de olhos ou dentes abre.
