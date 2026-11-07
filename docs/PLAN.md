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

## Metas medidas

Foto gerada de 12 MP (4000 x 3000), Chromium com aceleração, em uma placa dedicada (`node scripts/perf.mjs`):

| Meta | Pedido | Medido |
| --- | --- | --- |
| Pincel em 12 MP | 60 fps | 57 fps, p95 de 17 ms |
| Liquify em 12 MP | 60 fps | 60 fps, p95 de 17 ms |
| Exportação JPG de 12 MP | menos de 3 s | 1,3 s |
| Abrir foto de 12 MP | sem meta | 0,4 s |

Notebook comum e celular médio não foram medidos: não havia esses aparelhos no ambiente de desenvolvimento.
