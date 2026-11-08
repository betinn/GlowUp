# Validação visual

Imagens geradas por `npm run e2e` sobre um retrato procedural (`scripts/make-fixtures.mjs`), que traz
de propósito manchas, olheiras, olho vermelho e dentes amarelados. Nenhuma pessoa real.

- `NN-*.png`: antes e depois de cada ferramenta.
- `ui-*.png`: telas da interface no desktop e no celular, incluindo soltar a foto (`ui-soltar*`),
  progresso (`ui-abrindo`, `ui-exportando`, `ui-exportado-selo` no meio do carimbo, `ui-exportado`), comparação de filtro (`*filtro-comparar`),
  filtro em um rosto (`ui-rosto-*`, `ui-celular-rosto`) e marca do pincel (`ui-marca-ligada`, `ui-celular-marca`).
- `20-filtro-rosto.png`: filtro em um dos dois rostos de `tests/fixtures/group.png`.
- `21-branco-do-olho.png`, `22-limite-dentes.png`: um traço largo que só muda a região da ferramenta.
- `ui-limite-*.png`, `ui-celular-limite*.png`: busca com o aviso dos 6 MB, interruptor, traço fora, foto
  em grupo e boca fechada.
- `ui-regiao-*.png`: a vista que voou até os olhos (`ui-regiao-olhos`), a boca (`ui-regiao-dentes`) e um rosto
  da foto em grupo (`ui-regiao-grupo`), e o brilho sobre o alcance do pincel (`ui-regiao-brilho`).
- `ui-auto-olhos.png`, `ui-manual-olhos.png`, `ui-celular-auto.png`: o seletor Automático e Manual, com a cor já
  aplicada pelo Automático e o pincel de volta no Manual.
- `12-cabelo.png` e `23-` a `26-cabelo-*.png`: as cinco ferramentas de cabelo no Automático. `ui-cabelo-brilho` e
  `ui-cabelo-auto` mostram a busca e o resultado, e `ui-celular-cabelo` a barra com os oito grupos no celular. O segmentador fica inseguro no meio do cabelo desenhado e
  deixa partes de fora: em foto real o cabelo é outro, e o pincel livre, no Manual, cobre o que faltar.

- `ui-pele-brilho`, `ui-pele-auto`, `ui-manchas-auto`, `ui-pele-iluminador` e `ui-celular-pele`: o menu Pele
  no Automático. `ui-manchas-circulo` mostra os círculos das correções, com o mouse sobre um deles, e
  `ui-ferramenta-ligada` a chavinha no botão de Suavizar com o efeito na foto. Manchas tira 20 das 26 manchas desenhadas; as que ficam encostam nos lábios, na sobrancelha
  ou no olho, onde a busca não olha.

Os anéis destas imagens vêm do detector real: o retrato procedural basta para ele. A borda e o pescoço
foram ajustados em fotos reais de domínio público, que ficaram fora do repositório.

O retrato é sintético, então estas imagens mostram o comportamento de cada ferramenta, não a aparência
final em uma foto real. Os traços vêm de um script: pequenos excessos de tinta fora dos lábios ou do
cabelo são da automação, não da ferramenta.
