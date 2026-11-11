import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, imageRect, meanDiff, openEditor, pickTool, settle, showSettled, viewZoom, chooseMode } from './helpers';

/** The real detector runs here: the procedural portraits are enough to trigger it. */
const shot = (name: string) => `docs/visual-checks/${name}.png`;
const show = (page: Page, phase: string) => page.locator(`[data-region-show=${phase}]`);

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('XNNPACK')) errors.push(m.text());
  });
  return errors;
}

/** The free area of the canvas, where the photo shows. */
function stage(page: Page) {
  const r = imageRect(page);
  const vp = page.viewportSize()!;
  // Below the words over the photo, which would count as a change on their own.
  return { x: 92, y: 120, width: vp.width - 92 - 348, height: r.y + r.h - 120 };
}

async function openTool(page: Page, group: string, tool: string): Promise<void> {
  await page.locator(`[data-group=${group}]`).click();
  await page.locator(`[data-tool=${tool}]`).click();
  await chooseMode(page, 'Automático');
}

test.describe('olhos e dentes em destaque', () => {
  test('abrir a ferramenta não mexe na vista, e um brilho mostra onde o pincel alcança', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await page.locator('[data-group=eyes]').click();
    await page.locator('[data-tool=eyecolor]').click();
    await settle(page, 300);
    // The tool opens in Manual, with nothing on the photo yet.
    const before = await page.screenshot();
    await page.getByRole('radiogroup', { name: 'Modo' }).getByRole('radio', { name: 'Automático' }).click();
    await show(page, 'glow').waitFor({ timeout: 60_000 });
    expect(await viewZoom(page)).toBe(1);
    // The light rises for about 0.3 s and lasts about a second, and a screenshot takes a good part of it.
    await page.waitForTimeout(250);
    const lit = await page.screenshot({ path: shot('ui-regiao-brilho') });
    // The light is on the photo before the new color is: over the whole photo the eyes are a small part,
    // and at its height the light moves the mean by about 0.17.
    expect(await meanDiff(page, before, lit, stage(page))).toBeGreaterThan(0.08);
    await expect(page.getByTestId('reach-chip')).toBeVisible();
    await showSettled(page);
    expect(await viewZoom(page)).toBe(1);
    await expect(page.getByTestId('reach-chip')).toHaveCount(0, { timeout: 5_000 });
    await settle(page, 300);
    const plain = await page.screenshot({ path: shot('ui-regiao-olhos') });
    // The light left nothing behind.
    await settle(page, 500);
    expect(await meanDiff(page, plain, await page.screenshot())).toBeLessThan(0.002);
    // The orange mark stays off: the light is not the mark.
    await expect(page.getByTestId('mark-chip')).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('Dentes fica na foto inteira, e o brilho volta ao ligar o limite', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await pickTool(page, 'makeup', 'whiten');
    expect(await viewZoom(page)).toBe(1);
    await page.screenshot({ path: shot('ui-regiao-dentes') });
    const toggle = page.getByTestId('limit-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(show(page, 'idle')).toHaveCount(1);
    await toggle.click();
    await show(page, 'glow').waitFor({ timeout: 30_000 });
    await showSettled(page);
    // The switch lights the region without moving the photo.
    expect(await viewZoom(page)).toBe(1);
    expectNoErrors(errors);
  });

  test('a vista que a pessoa escolheu fica, e o enquadrar volta à foto inteira', async ({ page }) => {
    await openEditor(page);
    const clip = stage(page);
    await page.mouse.move(clip.x + clip.width * 0.3, clip.y + clip.height * 0.7);
    await page.mouse.wheel(0, -80);
    await settle(page, 300);
    const chosen = await viewZoom(page);
    expect(chosen).toBeGreaterThan(1);
    await openTool(page, 'eyes', 'sparkle');
    await expect(page.locator('[data-limit=on]')).toHaveCount(1, { timeout: 60_000 });
    await showSettled(page);
    expect(await viewZoom(page)).toBeCloseTo(chosen, 2);
    // Another part keeps the view too.
    await page.locator('[data-tool=eyecolor]').click();
    await chooseMode(page, 'Automático');
    await expect(page.locator('[data-limit=on]')).toHaveCount(1, { timeout: 60_000 });
    await showSettled(page);
    expect(await viewZoom(page)).toBeCloseTo(chosen, 2);
    await page.keyboard.press('0');
    await settle(page, 300);
    expect(await viewZoom(page)).toBe(1);
  });

  test('em foto de grupo a vista fica na foto toda e o brilho cobre os rostos', async ({ page }) => {
    await openEditor(page, 'group.png');
    await openTool(page, 'eyes', 'sclera');
    await show(page, 'glow').waitFor({ timeout: 60_000 });
    expect(await viewZoom(page)).toBe(1);
    await page.screenshot({ path: shot('ui-regiao-grupo') });
    await showSettled(page);
  });

  test('com movimento reduzido o brilho só acende e apaga, e a vista fica', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openEditor(page);
    await openTool(page, 'eyes', 'redeye');
    await show(page, 'glow').waitFor({ timeout: 60_000 });
    expect(await viewZoom(page)).toBe(1);
    await showSettled(page);
  });
});
