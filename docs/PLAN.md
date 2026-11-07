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
