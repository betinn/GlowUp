import { expect, test, type Page } from '@playwright/test';
import { chooseMode, expectNoErrors, facePoint, meanDiff, openEditor, pickTool, setSlider, settle, type Clip } from './helpers';

/** The real detector and the real hair segmenter run here, on the procedural portrait. */
const shot = (name: string) => `docs/visual-checks/${name}.png`;

/** Points of the fixture portrait, in its own coordinates. */
// The segmenter is sure of the sides and the top right of the drawn hair, less of its middle.
const CROWN: [number, number] = [0.2, -0.33];
const SIDE: [number, number] = [-0.33, 0.0];
const CHEEK: [number, number] = [-0.15, 0.12];
const BACKGROUND: [number, number] = [-0.38, -0.44];

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('XNNPACK')) errors.push(m.text());
  });
  return errors;
}

function around(page: Page, point: [number, number]): Clip {
  const [x, y] = facePoint(page, ...point);
  return { x: x - 4, y: y - 4, width: 8, height: 8 };
}

const undoButton = (page: Page) => page.getByRole('button', { name: 'Desfazer' });

/** Opens one hair tool in the automatic mode and returns the photo with the effect, the whole photo in view. */
async function applied(page: Page, tool: string): Promise<Buffer> {
  await pickTool(page, 'hair', tool, { auto: true });
  await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'auto');
  await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
  return page.screenshot();
}

test.describe('cabelo', () => {
  test('Cabelo tem menu próprio, entre Make e Formato do rosto, com cinco ferramentas', async ({ page }) => {
    await openEditor(page);
    const groups = await page.locator('[data-group]').evaluateAll((list) => list.map((b) => b.getAttribute('data-group')));
    expect(groups.indexOf('hair')).toBe(groups.indexOf('makeup') + 1);
    await page.locator('[data-group=makeup]').click();
    await expect(page.locator('[data-tool=haircolor]')).toHaveCount(0);
    await page.locator('[data-group=hair]').click();
    for (const tool of ['haircolor', 'hairdark', 'hairlight', 'haircontrast', 'hairsharp']) {
      await expect(page.locator(`[data-tool=${tool}]`)).toBeVisible();
    }
  });

  test('Cor acha o cabelo, mostra onde e aplica só nos fios', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();
    await page.locator('[data-group=hair]').click();
    await page.locator('[data-tool=haircolor]').click();
    await chooseMode(page, 'Automático');
    // The search says what it looks for, and the first time that it downloads. The size is only said on a phone.
    await expect(page.locator('[data-limit=searching]')).toBeVisible();
    await expect(page.getByText('Só na primeira vez. A foto não sai do seu aparelho.')).toBeVisible();
    await expect(page.locator('[data-limit=on]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-region-show=glow]')).toHaveCount(1, { timeout: 10_000 });
    await page.screenshot({ path: shot('ui-cabelo-brilho') });
    await expect(page.getByText(/Aplicado no cabelo que achei/)).toBeVisible({ timeout: 15_000 });
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    await expect(page.getByRole('button', { name: 'Borracha' })).toHaveCount(0);
    await page.keyboard.press('0');
    await settle(page, 400);
    await page.screenshot({ path: shot('ui-cabelo-auto') });

    const after = await page.screenshot();
    expect(await meanDiff(page, plain, after, around(page, CROWN))).toBeGreaterThan(3);
    expect(await meanDiff(page, plain, after, around(page, SIDE))).toBeGreaterThan(3);
    expect(await meanDiff(page, plain, after, around(page, CHEEK))).toBeLessThan(1);
    expect(await meanDiff(page, plain, after, around(page, BACKGROUND))).toBeLessThan(1);

    // The old modes of the color tool belong to the other tools now.
    await expect(page.getByRole('radiogroup', { name: 'Efeito' })).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('Escurecer, Clarear, Contraste e Nitidez mudam os fios e deixam a pele', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();
    const dark = await applied(page, 'hairdark');
    expect(await meanDiff(page, plain, dark, around(page, CROWN))).toBeGreaterThan(4);
    expect(await meanDiff(page, plain, dark, around(page, CHEEK))).toBeLessThan(1);

    // The other tools reuse the hair found for this photo: no new search.
    const light = await applied(page, 'hairlight');
    expect(await meanDiff(page, dark, light, around(page, CROWN))).toBeGreaterThan(4);
    expect(await meanDiff(page, dark, light, around(page, CHEEK))).toBeLessThan(1);

    const contrast = await applied(page, 'haircontrast');
    await setSlider(page, 'Contraste', 100);
    await settle(page, 300);
    const more = await page.screenshot();
    expect(await meanDiff(page, light, more, around(page, SIDE))).toBeGreaterThan(1);
    expect(await meanDiff(page, light, contrast, around(page, CHEEK))).toBeLessThan(1);

    const sharp = await applied(page, 'hairsharp');
    await setSlider(page, 'Intensidade', 100);
    await settle(page, 300);
    const sharper = await page.screenshot();
    expect(await meanDiff(page, sharp, sharper, around(page, SIDE))).toBeGreaterThan(0.3);
    expect(await meanDiff(page, more, sharper, around(page, CHEEK))).toBeLessThan(1);
    expectNoErrors(errors);
  });

  test('Manual devolve o pincel, preso ao cabelo', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await pickTool(page, 'hair', 'hairlight', { auto: true });
    await chooseMode(page, 'Manual');
    await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
    await expect(page.getByTestId('limit-toggle')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('limit-toggle')).toContainText('Só no cabelo');
    expectNoErrors(errors);
  });
});

test.describe('cabelo, celular', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('os oito grupos cabem na barra sem rolar, e Cabelo aplica no Automático', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const bar = page.getByRole('navigation', { name: 'Categorias' });
    const [scroll, width] = await bar.evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scroll).toBeLessThanOrEqual(width);
    await page.locator('[data-group=hair]').tap();
    await page.locator('[data-tool=haircolor]').tap();
    await chooseMode(page, 'Automático');
    await expect(page.getByText(/Aplicado no cabelo que achei/)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-region-show=idle]')).toHaveCount(1, { timeout: 15_000 });
    await page.screenshot({ path: shot('ui-celular-cabelo') });
    expectNoErrors(errors);
  });
});
