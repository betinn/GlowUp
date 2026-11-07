import { expect, test } from '@playwright/test';
import { openEditor, paint, pickTool, scribble, setSlider, settle } from './helpers';

const shot = (name: string) => `docs/visual-checks/ui-${name}.png`;

test.describe('telas, desktop', () => {
  test('onboarding', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('[data-testid=file-input]', 'tests/fixtures/portrait.png');
    await page.getByRole('dialog', { name: 'Como usar' }).waitFor();
    await settle(page, 900);
    await page.screenshot({ path: shot('onboarding') });
  });

  test('ferramenta com pincel', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'makeup', 'lips');
    await paint(page, scribble(0, 0.25, 0.08, 0.03, 4));
    await page.mouse.move(640, 420);
    await settle(page, 300);
    await page.screenshot({ path: shot('pincel') });
  });

  test('filtros', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'looks', 'filters');
    await page.locator('[data-filter=mel]').click();
    await settle(page, 2500);
    await page.screenshot({ path: shot('filtros') });
  });

  test('receitas', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'looks', 'presets');
    await settle(page, 400);
    await page.screenshot({ path: shot('receitas') });
  });

  test('recorte', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'frame', 'crop');
    await page.getByRole('radio', { name: '4:5' }).click();
    await setSlider(page, 'Endireitar', 6);
    await settle(page, 500);
    await page.screenshot({ path: shot('recorte') });
  });

  test('antes e depois', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'looks', 'filters');
    await page.locator('[data-filter=prata]').click();
    await page.getByTestId('compare').click();
    await settle(page, 1300);
    await page.screenshot({ path: shot('antes-depois') });
  });

  test('exportar', async ({ page }) => {
    await openEditor(page);
    await page.getByTestId('export-open').click();
    await expect(page.getByRole('dialog', { name: 'Exportar foto' })).toBeVisible();
    await settle(page, 500);
    await page.screenshot({ path: shot('exportar') });
  });
});

test.describe('telas, celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('editor', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-tool=smooth]').tap();
    await settle(page, 600);
    await page.screenshot({ path: shot('celular-suavizar') });
  });

  test('filtros', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-group=looks]').tap();
    await page.locator('[data-tool=filters]').tap();
    await settle(page, 2500);
    await page.screenshot({ path: shot('celular-filtros') });
  });
});
