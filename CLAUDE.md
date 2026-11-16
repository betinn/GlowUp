# CLAUDE.md

## REGRA OBRIGATÓRIA: branch `deploy/*`

**Todo trabalho que vai para o `main` sai de um branch com nome `deploy/<descricao-curta>`.**

- O site só é publicado na VM quando um PR de um branch `deploy/…` **deste repositório** é mesclado no `main`
  ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)).
- Um PR de qualquer outro branch (`ccr-…`, `claude/…`, `feature/…`, `fix/…` etc.) entra no `main` **sem publicar
  nada**. O código fica no `main` e o site no ar continua na versão antiga.
- Isso vale também quando a sessão sugere ou cria outro nome de branch (ex.: o branch padrão de uma sessão do Claude
  Code). Antes do primeiro commit, crie ou renomeie o branch para `deploy/…`:
  `git checkout -b deploy/<descricao> origin/main`.
- Antes de abrir o PR, confira: `git branch --show-current` precisa começar com `deploy/`.
- Se um PR já entrou no `main` por um branch errado, o deploy não aconteceu: abra um novo PR a partir de um branch
  `deploy/…` (por exemplo, com uma mudança pequena) para publicar.

A esteira não roda testes. Eles rodam antes de abrir o PR: `npm run check` e os e2e de quem foi mexido
(`npm run e2e -- <spec> --trace off`).

## Testes e2e

- Os e2e geram capturas em `docs/visual-checks/`. Não faça commit dessas imagens quando foram reescritas só porque os
  testes rodaram.
- Os diálogos de salvar do navegador (`showSaveFilePicker`, `showDirectoryPicker`) são desligados no setup dos testes
  (`noPickers` em `tests/e2e/helpers.ts`), para o export seguir pelo download. Um teste do diálogo coloca um substituto
  depois do setup (veja `tests/e2e/salvar.spec.ts`).
