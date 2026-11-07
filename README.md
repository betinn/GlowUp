# Glowup

Editor de retoque de fotos que roda inteiro no navegador. Pincéis manuais, ajustes globais, filtros
e exportação em resolução total, tudo processado na GPU do aparelho de quem usa.

- **Nada sai do aparelho.** Não há backend, API nem upload. O servidor só entrega arquivos estáticos.
- **Sem IA.** Nada de modelos nem detecção facial: é processamento de imagem clássico em shaders.
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
| `npm run e2e` | fluxos, telas e validação visual (precisa de `npm run build` antes) |
| `npm run fixtures` | regenera as imagens de teste procedurais |
| `npm run scan` | varredura de higiene do repositório, do histórico e do `dist/` |

## Ferramentas

**Pele:** manchas (healing com toque único automático), suavizar (Leve e Intenso), olheiras, tom de
pele, iluminador.

**Olhos e dentes:** clarear, olho vermelho, cor dos olhos, brilho no olhar.

**Maquiagem e cabelo:** batom, blush, sombra, sobrancelha, contorno, cabelo (cor, escurecer,
profundidade), sardas procedurais.

**Forma:** liquify (empurrar, inflar, contrair, restaurar).

**Geral:** 40 filtros em 10 categorias com intensidade e favoritos, receitas prontas e suas,
11 ajustes, desfoque radial e tilt-shift, recorte com rotação, espelho, endireitar e proporções,
antes/depois (segurar ou dividir, com a foto original ou só sem o filtro), exportação em JPG, PNG e WebP.

Solte a foto em qualquer lugar da tela, inclusive no editor. Abrir e exportar mostram a porcentagem e o
passo atual, com a própria foto revelando na tela.

## Atalhos

| Tecla | Ação |
| --- | --- |
| `Ctrl+Z`, `Ctrl+Shift+Z` | desfazer, refazer |
| `[`, `]` | diminuir e aumentar o pincel |
| `Shift+[`, `Shift+]` | dureza |
| `B`, `E` | pincel, borracha |
| `M` | mostrar a área pintada |
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
