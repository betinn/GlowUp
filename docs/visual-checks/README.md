# Validação visual

Imagens geradas por `npm run e2e` sobre um retrato procedural (`scripts/make-fixtures.mjs`), que traz
de propósito manchas, olheiras, olho vermelho e dentes amarelados. Nenhuma pessoa real.

- `NN-*.png`: antes e depois de cada ferramenta.
- `ui-*.png`: telas da interface no desktop e no celular, incluindo soltar a foto (`ui-soltar*`),
  progresso (`ui-abrindo`, `ui-exportando`, `ui-exportado`), comparação de filtro (`*filtro-comparar`),
  filtro em um rosto (`ui-rosto-*`, `ui-celular-rosto`) e marca do pincel (`ui-marca-ligada`, `ui-celular-marca`).
- `20-filtro-rosto.png`: filtro em um dos dois rostos de `tests/fixtures/group.png`.

Os anéis destas imagens vêm do detector real: o retrato procedural basta para ele. A borda e o pescoço
foram ajustados em fotos reais de domínio público, que ficaram fora do repositório.

O retrato é sintético, então estas imagens mostram o comportamento de cada ferramenta, não a aparência
final em uma foto real. Os traços vêm de um script: pequenos excessos de tinta fora dos lábios ou do
cabelo são da automação, não da ferramenta.
