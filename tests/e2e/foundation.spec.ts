import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { chooseMode, meanDiff, openEditor, openTab, settle } from './helpers';

/**
 * The APIs here have no button yet, and the bundle of the preview hides its modules. The dev server
 * serves each module under its own address, so the page can import the very ones the editor is running.
 */
test.use({ baseURL: DEV_ORIGIN });

/** Imports a module of the app, from inside the page. */
const IMPORT = 'const use = (path) => import(/* @vite-ignore */ path);';

/** Runs a script in the page, with `use` and with the engine as `e`. */
function inPage<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(`(async () => {
    ${IMPORT}
    const { engine } = await use('/src/ui/state.svelte.ts');
    const e = engine();
    ${body}
  })()`) as Promise<T>;
}

test.describe('APIs chamadas por código', () => {
  test('uma receita preenche as máscaras das ferramentas numa etapa só do desfazer', async ({ page }) => {
    await openEditor(page);
    const plain = await page.screenshot();
    const outcome = await inPage<{ filled: string[]; missed: string[]; failed: boolean; stopped: boolean }>(
      page,
      `const { applyRecipe } = await use('/src/ui/actions.ts');
       const { LOOKS } = await use('/src/presets/recipes.ts');
       return applyRecipe(LOOKS.find((p) => p.id === 'glow'));`,
    );
    expect(outcome).toEqual({ filled: ['smooth', 'highlight', 'blush'], missed: [], failed: false, unlit: false, stopped: false });
    await settle(page);
    const applied = await page.screenshot();
    expect(await meanDiff(page, plain, applied)).toBeGreaterThan(0.5);

    const state = () =>
      inPage<{ depth: number; label: string | null; painted: string[]; exposure: number; filter: string | null }>(
        page,
        `return {
           depth: e.history.depth,
           label: e.history.undoLabel,
           painted: Object.keys(e.doc.layers).filter((id) => e.doc.layers[id].painted).sort(),
           exposure: e.doc.adjust.exposure,
           filter: e.doc.filter.id,
         };`,
      );
    expect(await state()).toEqual({ depth: 1, label: 'Look', painted: ['blush', 'highlight', 'smooth'], exposure: 6, filter: 'mel' });

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page);
    expect(await state()).toEqual({ depth: 0, label: null, painted: [], exposure: 0, filter: null });
    expect(await meanDiff(page, plain, await page.screenshot())).toBeLessThan(0.5);

    await page.getByRole('button', { name: 'Refazer' }).click();
    await settle(page);
    expect(await state()).toEqual({ depth: 1, label: 'Look', painted: ['blush', 'highlight', 'smooth'], exposure: 6, filter: 'mel' });

    // A tool filled by the recipe opens with what it has, in the automatic mode.
    await page.locator('[data-group=skin]').click();
    await page.locator('[data-tool=smooth]').click();
    await expect(page.locator('[data-limit=on]')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'auto');
    await expect(page.getByText(/Aplicado na pele que achei/)).toBeVisible();
    await expect(page.locator('[data-tool=smooth]')).toHaveAttribute('data-effect', 'on');
  });

  test('um deslocamento por código muda a foto, entra no desfazer e fica no projeto', async ({ page }) => {
    await openEditor(page);
    const plain = await page.screenshot();
    const applied = await inPage<boolean>(
      page,
      `const { ensureField } = await use('/src/tools/activate.ts');
       await ensureField(e);
       return e.applyFieldScript({ offset: (u) => [u > 0.3 && u < 0.7 ? 0.03 : 0, 0] }, 'Careta');`,
    );
    expect(applied).toBe(true);
    await settle(page);
    const warped = await page.screenshot();
    expect(await meanDiff(page, plain, warped)).toBeGreaterThan(0.5);
    await expect(page.getByRole('button', { name: 'Desfazer' })).toHaveAttribute('title', 'Desfazer: Careta');

    const hasField = () => inPage<boolean>(page, 'return e.doc.hasField;');
    expect(await hasField()).toBe(true);
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page);
    expect(await hasField()).toBe(false);
    expect(await meanDiff(page, plain, await page.screenshot())).toBeLessThan(0.5);

    await page.getByRole('button', { name: 'Refazer' }).click();
    await settle(page);
    expect(await hasField()).toBe(true);
    expect(await meanDiff(page, warped, await page.screenshot())).toBeLessThan(0.5);

    // Saved and opened again, the displacement is still there.
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await page.getByRole('button', { name: /^Continuar/ }).click();
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await settle(page, 1500);
    expect(await hasField()).toBe(true);
    expect(await meanDiff(page, warped, await page.screenshot())).toBeLessThan(0.5);
  });

  test('uma ferramenta declara uma ação própria e ganha modo, efeito e segundo toque', async ({ page }) => {
    await openEditor(page);
    await inPage<void>(
      page,
      `const { AUTO_ACTIONS } = await use('/src/tools/auto.ts');
       window.applied = 0;
       AUTO_ACTIONS.set('adjust', {
         words: { finding: 'Procurando o rosto', missing: 'Sem rosto.', place: 'na foto toda', hint: 'Sozinho.' },
         hasWork: (engine) => engine.doc.adjust.contrast !== 0,
         apply: async (engine) => {
           window.applied++;
           engine.setAdjust('contrast', 40);
           engine.commit();
         },
         clear: async (engine) => {
           engine.setAdjust('contrast', 0);
           engine.commit();
         },
       });`,
    );
    const contrast = () => inPage<number>(page, 'return e.doc.adjust.contrast;');
    await openTab(page, 'photo');
    const button = page.locator('[data-tool=adjust]');
    await button.click();
    // Tools open in Manual: the action runs when the person asks for it.
    expect(await contrast()).toBe(0);
    await chooseMode(page, 'Automático');
    await expect(button).toHaveAttribute('data-effect', 'on');
    expect(await contrast()).toBe(40);
    await expect(page.getByText('Sozinho.')).toBeVisible();

    // The second tap turns it off and the third brings it back, as in the tools with a mask.
    await button.click();
    await expect(button).toHaveAttribute('data-effect', 'off');
    expect(await contrast()).toBe(0);
    await button.click();
    await expect(button).toHaveAttribute('data-effect', 'on');
    expect(await inPage<number>(page, 'return window.applied;')).toBe(2);
  });
});
