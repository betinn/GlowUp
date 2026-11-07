import { expect, test, type Page } from '@playwright/test';
import {
  chooseMode,
  expectNoErrors,
  facePoint,
  imageRect,
  meanDiff,
  openEditor,
  paint,
  pickTool,
  setSlider,
  settle,
  showSettled,
  viewZoom,
  type Clip,
} from './helpers';

/** The real detector runs here: the procedural portraits are enough to trigger it. */
const shot = (name: string) => `docs/visual-checks/${name}.png`;

/** Points of the fixture portrait, in its own coordinates. */
const IRIS: [number, number] = [-0.155, -0.06];
/** On the colored ring of the other iris: its pupil is black and keeps no color. */
const OTHER_IRIS: [number, number] = [0.17, -0.06];
const CHEEK: [number, number] = [-0.15, 0.12];
const TEETH: [number, number] = [0, 0.245];

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('XNNPACK')) errors.push(m.text());
  });
  return errors;
}

/** A few pixels around a point of the portrait, on the whole-photo view. */
function around(page: Page, point: [number, number]): Clip {
  const [x, y] = facePoint(page, ...point);
  return { x: x - 3, y: y - 3, width: 6, height: 6 };
}

const undoButton = (page: Page) => page.getByRole('button', { name: 'Desfazer' });
const fit = async (page: Page) => {
  await page.keyboard.press('0');
  await settle(page, 400);
};

test.describe('automático e manual', () => {
  test('Automático aplica sozinho nas íris, numa etapa que dá para desfazer', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();
    await pickTool(page, 'eyes', 'eyecolor', { auto: true, keepView: true });
    await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'auto');
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    await expect(page.getByText(/Aplicado nas íris que achei/)).toBeVisible();
    // The brush and the eraser are for the manual mode.
    await expect(page.getByRole('button', { name: 'Borracha' })).toHaveCount(0);
    await page.screenshot({ path: shot('ui-auto-olhos') });

    await fit(page);
    const applied = await page.screenshot();
    const change = await meanDiff(page, plain, applied, around(page, IRIS));
    expect(change).toBeGreaterThan(8);
    expect(await meanDiff(page, plain, applied, around(page, OTHER_IRIS))).toBeGreaterThan(8);
    expect(await meanDiff(page, plain, applied, around(page, CHEEK))).toBeLessThan(1);

    // A drag over the photo moves it and paints nothing.
    await page.keyboard.press('+');
    await settle(page, 300);
    const zoomed = await viewZoom(page);
    const r = imageRect(page);
    await page.mouse.move(r.x + r.w * 0.5, r.y + r.h * 0.6);
    await page.mouse.down();
    await page.mouse.move(r.x + r.w * 0.3, r.y + r.h * 0.5, { steps: 8 });
    await page.mouse.up();
    await settle(page, 300);
    expect(await viewZoom(page)).toBeCloseTo(zoomed, 2);
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    await fit(page);

    // The sliders work on what the automatic mode made.
    await setSlider(page, 'Intensidade', 0);
    await page.getByRole('slider', { name: 'Intensidade', exact: true }).dispatchEvent('change');
    await settle(page, 400);
    const none = await page.screenshot();
    expect(await meanDiff(page, plain, none, around(page, IRIS))).toBeLessThan(change / 2);
    await page.keyboard.press('Control+z');
    await settle(page, 400);

    // Undo takes the whole fill back, and one tap applies it again.
    await page.keyboard.press('Control+z');
    await settle(page, 400);
    expect(await meanDiff(page, plain, await page.screenshot(), around(page, IRIS))).toBeLessThan(2);
    await page.getByTestId('auto-apply').click();
    await settle(page, 400);
    expect(await meanDiff(page, plain, await page.screenshot(), around(page, IRIS))).toBeGreaterThan(8);
    expectNoErrors(errors);
  });

  test('Manual mostra pincel e borracha e parte do que o automático fez', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();
    await pickTool(page, 'eyes', 'eyecolor', { auto: true });
    await chooseMode(page, 'Manual');
    await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'manual');
    await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
    await expect(page.getByTestId('limit-toggle')).toHaveAttribute('aria-checked', 'true');
    await page.screenshot({ path: shot('ui-manual-olhos') });

    // The eraser takes one eye out, and the other keeps the color.
    await page.getByRole('button', { name: 'Borracha' }).click();
    await setSlider(page, 'Tamanho', 70);
    await paint(page, [
      [IRIS[0] - 0.03, IRIS[1]],
      [IRIS[0] + 0.03, IRIS[1]],
    ]);
    const erased = await page.screenshot();
    expect(await meanDiff(page, plain, erased, around(page, IRIS))).toBeLessThan(3);
    expect(await meanDiff(page, plain, erased, around(page, OTHER_IRIS))).toBeGreaterThan(8);
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Pincel');

    // Back to automatic: the region again, as one step.
    await chooseMode(page, 'Automático');
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    expect(await meanDiff(page, plain, await page.screenshot(), around(page, IRIS))).toBeGreaterThan(8);

    // The tool remembers the mode on this photo.
    await pickTool(page, 'eyes', 'sparkle');
    await chooseMode(page, 'Automático');
    await pickTool(page, 'eyes', 'eyecolor', { auto: true });
    await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'auto');
    expectNoErrors(errors);
  });

  test('Dentes no automático clareia só os dentes', async ({ page }) => {
    await openEditor(page);
    const plain = await page.screenshot();
    await pickTool(page, 'makeup', 'whiten', { auto: true });
    await expect(page.getByText(/Aplicado nos dentes que achei/)).toBeVisible();
    const applied = await page.screenshot();
    expect(await meanDiff(page, plain, applied, around(page, TEETH))).toBeGreaterThan(4);
    expect(await meanDiff(page, plain, applied, around(page, CHEEK))).toBeLessThan(1);
    expect(await meanDiff(page, plain, applied, around(page, IRIS))).toBeLessThan(1);
  });

  test('o automático vira máscara comum no projeto, e reabrir vai para o manual', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'eyes', 'sclera', { auto: true });
    await settle(page, 1800);
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await page.getByRole('button', { name: /^Continuar/ }).first().waitFor();
    const saved = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('glowup');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(new Error('no database'));
      });
      const records = await new Promise<{ doc: unknown; masks: Record<string, Blob> }[]>((resolve, reject) => {
        const all = db.transaction('projects').objectStore('projects').getAll();
        all.onsuccess = () => resolve(all.result as { doc: unknown; masks: Record<string, Blob> }[]);
        all.onerror = () => reject(new Error('no projects'));
      });
      db.close();
      return { doc: JSON.stringify(records.map((r) => r.doc)), masks: records.flatMap((r) => Object.keys(r.masks)) };
    });
    expect(saved.masks).toEqual(['sclera']);
    expect(saved.doc).not.toMatch(/outline|irises|innerLips|outerLips|landmark|region|auto/i);

    await page.getByRole('button', { name: /^Continuar/ }).first().click();
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await settle(page);
    // The mask holds work now, so the tool opens on the brush and leaves it as it is.
    await pickTool(page, 'eyes', 'sclera', { auto: true });
    await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'manual');
    await expect(undoButton(page)).toBeDisabled();
  });

  test('sem rosto não há automático, e o pincel fica', async ({ page }) => {
    await openEditor(page, 'gradient.png');
    await pickTool(page, 'eyes', 'eyecolor', { auto: true });
    await expect(page.locator('[data-limit=no-face]')).toBeVisible();
    await expect(page.getByTestId('tool-mode')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
  });

  test('no celular o seletor cabe no painel', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page);
    await page.locator('[data-group=eyes]').click();
    await page.locator('[data-tool=redeye]').click();
    await expect(page.locator('[data-limit=on]')).toHaveCount(1, { timeout: 60_000 });
    await showSettled(page);
    await expect(page.getByTestId('tool-mode')).toBeVisible();
    await page.screenshot({ path: shot('ui-celular-auto') });
  });
});
