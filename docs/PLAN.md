# Plano

## M0. Setup

- [x] Vite + TypeScript strict + Svelte 5
- [x] ESLint, svelte-check, Vitest, Playwright
- [x] `.gitignore`, scanner de higiene, identidade de commit neutra
- [x] `docs/DESIGN.md`, `docs/DECISIONS.md`, `docs/PLAN.md`

## M1. Núcleo

- [ ] Contexto WebGL2, programas, texturas, alvos, leitura assíncrona (PBO)
- [ ] Documento de edição e geometria (recorte, rotação, espelho)
- [ ] Pipeline não destrutivo com cache por estágio
- [ ] Máscaras em textura, motor de pincel (tamanho, dureza, opacidade, fluxo, borracha)
- [ ] Histórico por tiles com codec compacto

## M2. Ajustes globais

- [ ] Exposição, contraste, realces, sombras, temperatura, tint, saturação, vibrance, nitidez, granulação, vinheta

## M3. Pele

- [ ] Remover manchas (healing), toque único automático
- [ ] Suavização por separação de frequências + guided filter (Leve, Intenso)
- [ ] Olheiras, tom de pele, iluminador

## M4. Olhos e dentes

- [ ] Clarear, olho vermelho, cor dos olhos, brilho no olhar

## M5. Maquiagem e cabelo

- [ ] Batom, blush, sombra, sobrancelha, contorno
- [ ] Cabelo (cor, escurecer, profundidade), sardas procedurais

## M6. Forma

- [ ] Liquify: empurrar, inflar, contrair, restaurar

## M7. Filtros, presets, blur, recorte

- [ ] 30+ LUTs 3D procedurais em 10 categorias, intensidade, favoritos
- [ ] Presets de retoque (nativos e do usuário)
- [ ] Blur radial e tilt-shift
- [ ] Recorte, rotação, espelho, endireitar, proporções

## M8. Saída e persistência

- [ ] Antes/depois (segurar e slider dividido)
- [ ] Exportar JPG, PNG, WebP em resolução total, com tiling
- [ ] Projeto em IndexedDB
- [ ] Pré-compressão, config de deploy, PWA

## M9. UI e polimento

- [ ] Tela inicial, onboarding, transições, gestos, atalhos
- [ ] Acessibilidade e `prefers-reduced-motion`
- [ ] Validação visual em `docs/visual-checks/`
- [ ] Varredura final em repositório e `dist/`
- [ ] README
