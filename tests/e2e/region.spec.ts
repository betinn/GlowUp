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

test.describe('olhos e dentes em foco', () => {
  test('abrir a ferramenta aproxima dos olhos e um brilho mostra onde o pincel alcança', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openTool(page, 'eyes', 'eyecolor');
    await show(page, 'fly').waitFor({ timeout: 60_000 });
    await show(page, 'glow').waitFor();
    // The light lasts about a second, and a screenshot here takes a good part of it.
    const lit = await page.screenshot({ path: shot('ui-regiao-brilho') });
    await expect(page.getByTestId('reach-chip')).toBeVisible();
    await showSettled(page);
    const zoom = await viewZoom(page);
    expect(zoom).toBeGreaterThan(1.5);
    expect(zoom).toBeLessThanOrEqual(8);
    await expect(page.getByTestId('reach-chip')).toHaveCount(0, { timeout: 5_000 });
    await settle(page, 300);
    const plain = await page.screenshot({ path: shot('ui-regiao-olhos') });
    // The light was on the photo, and it left nothing behind.
    expect(await meanDiff(page, lit, plain, stage(page))).toBeGreaterThan(0.05);
    await settle(page, 500);
    expect(await meanDiff(page, plain, await page.screenshot())).toBeLessThan(0.002);
    // The orange mark stays off: the light is not the mark.
    await expect(page.getByTestId('mark-chip')).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('Dentes aproxima da boca, e o brilho volta ao ligar o limite', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await pickTool(page, 'makeup', 'whiten', { keepView: true });
    const zoom = await viewZoom(page);
    expect(zoom).toBeGreaterThan(1.5);
    await page.screenshot({ path: shot('ui-regiao-dentes') });
    const toggle = page.getByTestId('limit-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(show(page, 'idle')).toHaveCount(1);
    await toggle.click();
    await show(page, 'glow').waitFor({ timeout: 30_000 });
    await showSettled(page);
    // Already in view: the switch lights the region without moving the photo.
    expect(await viewZoom(page)).toBeCloseTo(zoom, 1);
    expectNoErrors(errors);
  });

  test('uma volta do mouse durante o voo para na hora, e quem mexeu na vista fica com ela', async ({ page }) => {
    await openEditor(page);
    await openTool(page, 'eyes', 'sparkle');
    await show(page, 'fly').waitFor({ timeout: 60_000 });
    const clip = stage(page);
    await page.mouse.move(clip.x + clip.width / 2, clip.y + clip.height / 2);
    await page.mouse.wheel(0, -60);
    await expect(show(page, 'fly')).toHaveCount(0, { timeout: 1_000 });
    const after = await viewZoom(page);
    await showSettled(page);
    expect(await viewZoom(page)).toBeCloseTo(after, 2);

    // A view moved during the search stays as it is.
    await page.keyboard.press('0');
    await page.locator('[data-tool=eyecolor]').click();
    await chooseMode(page, 'Automático');
    await page.mouse.move(clip.x + clip.width * 0.3, clip.y + clip.height * 0.7);
    await page.mouse.wheel(0, -80);
    const chosen = await viewZoom(page);
    await expect(page.locator('[data-limit=on]')).toHaveCount(1, { timeout: 60_000 });
    await showSettled(page);
    expect(await viewZoom(page)).toBeCloseTo(chosen, 2);
  });

  test('em foto de grupo que pega a foto toda, a vista vai para um rosto', async ({ page }) => {
    await openEditor(page, 'group.png');
    await pickTool(page, 'eyes', 'sclera', { keepView: true });
    // Both faces together would be almost the whole photo, so one face fills the view.
    expect(await viewZoom(page)).toBeGreaterThan(2);
    await page.screenshot({ path: shot('ui-regiao-grupo') });
  });

  test('com movimento reduzido a vista salta e o brilho só acende e apaga', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openEditor(page);
    await openTool(page, 'eyes', 'redeye');
    await show(page, 'glow').waitFor({ timeout: 60_000 });
    expect(await viewZoom(page)).toBeGreaterThan(1.5);
    await showSettled(page);
  });
});
