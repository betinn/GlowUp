import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, imageRect, meanDiff, openEditor, openGroup, paint, pickTool, scribble, setSlider, settle, limitSettled } from './helpers';

/** Only the photo, below the notes that show over its top: the panels around it change with the menu. */
async function photo(page: Page): Promise<Buffer> {
  const r = imageRect(page);
  return page.screenshot({ clip: { x: r.x, y: r.y + 60, width: r.w, height: r.h - 60 } });
}

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const undo = (page: Page) => page.getByRole('button', { name: 'Desfazer' });

test.describe('voltar ao original', () => {
  test('Zerar tira só o que é do menu, numa etapa que dá para desfazer', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await photo(page);
    await expect(page.getByTestId('reset-photo')).toBeDisabled();

    await pickTool(page, 'skin', 'smooth');
    await expect(page.getByTestId('reset-group')).toHaveCount(0);
    await expect(page.locator('[data-group=skin]')).toHaveAccessibleName('Pele');
    await paint(page, scribble(-0.15, 0.12, 0.11, 0.1, 10));
    await expect(page.getByTestId('reset-group')).toBeVisible();
    // The name of the menu says there is something of it on the photo, and only that one.
    await expect(page.locator('[data-group=skin]')).toHaveAccessibleName('Pele, com retoque na foto');
    await expect(page.locator('[data-group=eyes]')).toHaveAccessibleName('Olhos');
    await pickTool(page, 'light', 'adjust');
    await limitSettled(page);
    await expect(page.getByTestId('reset-group')).toHaveCount(0);
    await setSlider(page, 'Contraste', 40);
    await settle(page, 300);
    const edited = await photo(page);
    expect(await meanDiff(page, plain, edited)).toBeGreaterThan(1);
    // The blur is a tool of the same tab, so it goes with the adjustments.
    await pickTool(page, 'light', 'blur');
    await limitSettled(page);
    await page.getByRole('radio', { name: 'Radial' }).click();
    await settle(page, 300);
    await expect(page.locator('[data-tool=adjust]')).toHaveAttribute('data-effect', 'on');
    await expect(page.locator('[data-tool=blur]')).toHaveAttribute('data-effect', 'on');

    // Foto loses the adjustments and the blur together, in one step; the skin keeps its smoothing.
    await page.getByTestId('reset-group').click();
    await expect(page.getByText('Foto voltou ao original. Desfazer traz de volta.')).toBeVisible();
    await settle(page, 300);
    await expect(undo(page)).toHaveAttribute('title', 'Desfazer: Zerar Foto');
    await expect(page.getByTestId('reset-group')).toHaveCount(0);
    await expect(page.locator('[data-tool=adjust]')).toHaveAttribute('data-effect', 'off');
    await expect(page.locator('[data-tool=blur]')).toHaveAttribute('data-effect', 'off');
    await undo(page).click();
    await settle(page, 300);
    await expect(page.locator('[data-tool=adjust]')).toHaveAttribute('data-effect', 'on');
    await expect(page.locator('[data-tool=blur]')).toHaveAttribute('data-effect', 'on');
    await page.getByTestId('reset-group').click();
    await settle(page, 300);
    await expect(page.getByTestId('reset-group')).toHaveCount(0);

    await openGroup(page, 'skin');
    await expect(page.getByTestId('reset-group')).toBeVisible();
    await page.getByTestId('reset-group').click();
    await settle(page, 300);
    await expect(page.locator('[data-group=skin]')).toHaveAccessibleName('Pele');
    expect(await meanDiff(page, plain, await photo(page))).toBeLessThan(0.3);

    // Undo brings the smoothing back.
    await undo(page).click();
    await settle(page, 300);
    await expect(page.getByTestId('reset-group')).toBeVisible();
    await expect(page.locator('[data-group=skin]')).toHaveAccessibleName('Pele, com retoque na foto');
    expectNoErrors(errors);
  });

  test('Voltar ao original tira tudo num toque, e o desfazer devolve', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await photo(page);
    await pickTool(page, 'skin', 'smooth');
    await paint(page, scribble(-0.15, 0.12, 0.11, 0.1, 10));
    await pickTool(page, 'shape', 'liquify');
    await limitSettled(page);
    await paint(page, [[-0.29, 0.14], [-0.22, 0.14]]);
    await pickTool(page, 'filters', 'filters');
    await page.locator('[data-filter=prata]').click();
    await settle(page, 300);
    const edited = await photo(page);

    // No question first: the undo is right next to it.
    await page.getByTestId('reset-photo').click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await settle(page, 500);
    await expect(undo(page)).toHaveAttribute('title', 'Desfazer: Voltar ao original');
    await expect(page.getByTestId('reset-photo')).toBeDisabled();
    expect(await meanDiff(page, plain, await photo(page))).toBeLessThan(0.3);

    await undo(page).click();
    await settle(page, 500);
    expect(await meanDiff(page, edited, await photo(page))).toBeLessThan(0.3);
    expectNoErrors(errors);
  });
});
