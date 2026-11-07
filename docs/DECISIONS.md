# Decisões

Registro curto das decisões em aberto: o que foi escolhido e por quê.

| # | Decisão | Motivo |
| --- | --- | --- |
| 1 | UI em Svelte 5 (runes) | Runtime pequeno, transições nativas via Web Animations (compatível com CSP sem `unsafe-inline`). |
| 2 | Sem biblioteca de animação | CSS e `svelte/transition` cobrem tudo. Zero KB extras. |
| 3 | Fontes Instrument Serif e Instrument Sans via Fontsource (OFL) | Servidas pelo próprio site. CSP sem origens externas continua valendo. |
| 4 | Identidade de commit local no repositório (`Glowup`, domínio `.invalid`) | Repositório público: nenhum e-mail ou usuário pessoal no histórico. O trailer de coautoria usa um endereço genérico `noreply`. |
| 5 | Scanner de higiene próprio (`scripts/scan-repo.mjs`) com nomes de produtos em ROT13 | Permite procurar os termos proibidos sem escrevê-los em nenhum arquivo. |
