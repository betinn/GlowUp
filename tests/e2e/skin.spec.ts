import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { chooseMode, expectNoErrors, facePoint, imageRect, meanDiff, openEditor, pickTool, settle, skipIntro, type Clip } from './helpers';

/** The real detector runs here, on the procedural portrait. */
const shot = (name: string) => `docs/visual-checks/${name}.png`;

const fixture = JSON.parse(readFileSync('tests/fixtures/portrait.json', 'utf8')) as { blemishes: { x: number; y: number; r: number }[] };

/** Points of the fixture portrait, in its own coordinates. */
const CHEEK: [number, number] = [-0.2, 0.16];
const UNDER_EYE: [number, number] = [-0.16, -0.012];
const CHEEKBONE: [number, number] = [-0.21, 0.02];
const BRIDGE: [number, number] = [0, 0.04];
const HAIR: [number, number] = [-0.33, 0.0];
const BACKGROUND: [number, number] = [-0.38, -0.44];
const SWEATER: [number, number] = [-0.3, 0.45];

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('XNNPACK')) errors.push(m.text());
  });
  return errors;
}

function around(page: Page, point: [number, number], half = 5): Clip {
  const [x, y] = facePoint(page, ...point);
  return { x: x - half, y: y - half, width: half * 2, height: half * 2 };
}

const undoButton = (page: Page) => page.getByRole('button', { name: 'Desfazer' });
const healTool = (page: Page) => page.locator('[data-tool=heal]');
const healSpots = (page: Page) => page.getByTestId('heal-spot');

/** The whole photo in view, once the flight and the fade are over. */
async function fitted(page: Page): Promise<Buffer> {
  await page.keyboard.press('0');
  await settle(page, 400);
  return page.screenshot();
}

/** Opens one skin tool in the automatic mode and returns the photo with the effect. */
async function applied(page: Page, tool: string): Promise<Buffer> {
  await pickTool(page, 'skin', tool, { auto: true });
  await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'auto');
  await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
  return fitted(page);
}

test.describe('pele', () => {
  test('Suavizar acha a pele, mostra onde e aplica só nela', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();
    await page.locator('[data-group=skin]').click();
    await page.locator('[data-tool=smooth]').click();
    await expect(page.locator('[data-limit=searching]')).toBeVisible();
    await expect(page.getByText(/Só na primeira vez, cerca de 6 MB/)).toBeVisible();
    await expect(page.locator('[data-limit=on]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-region-show=glow]')).toHaveCount(1, { timeout: 10_000 });
    await page.screenshot({ path: shot('ui-pele-brilho') });
    await expect(page.getByText(/Aplicado na pele que achei/)).toBeVisible({ timeout: 15_000 });
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    await expect(page.getByRole('button', { name: 'Borracha' })).toHaveCount(0);
    await expect(page.getByTestId('reach-chip')).toHaveCount(0, { timeout: 10_000 });
    const after = await fitted(page);
    await page.screenshot({ path: shot('ui-pele-auto') });

    expect(await meanDiff(page, plain, after, around(page, CHEEK))).toBeGreaterThan(0.3);
    expect(await meanDiff(page, plain, after, around(page, HAIR))).toBeLessThan(0.3);
    expect(await meanDiff(page, plain, after, around(page, BACKGROUND))).toBeLessThan(0.3);
    expect(await meanDiff(page, plain, after, around(page, SWEATER))).toBeLessThan(0.3);
    expectNoErrors(errors);
  });

  test('Manchas tira as manchas sozinho, numa etapa que dá para desfazer', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();
    await page.locator('[data-group=skin]').click();
    await page.locator('[data-tool=heal]').click();
    await expect(page.getByText(/Aplicado nas manchas que achei/)).toBeVisible({ timeout: 60_000 });
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    await expect(page.locator('[data-region-show=idle]')).toHaveCount(1, { timeout: 30_000 });
    await expect(healTool(page)).toHaveAttribute('data-effect', 'on');
    const count = await healSpots(page).count();
    expect(count).toBeGreaterThanOrEqual(15);
    const healed = await fitted(page);
    await page.screenshot({ path: shot('ui-manchas-auto') });

    // Most of the drawn spots are gone, and the skin between them did not move.
    let gone = 0;
    for (const b of fixture.blemishes) {
      if ((await meanDiff(page, plain, healed, around(page, [b.x, b.y], 3))) > 4) gone++;
    }
    expect(gone).toBeGreaterThanOrEqual(15);
    expect(await meanDiff(page, plain, healed, around(page, [0.0, 0.2], 4))).toBeLessThan(1);
    expect(await meanDiff(page, plain, healed, around(page, HAIR))).toBeLessThan(0.3);

    // One undo brings every spot back, and redo takes them away again.
    await undoButton(page).click();
    await settle(page, 400);
    const r = imageRect(page);
    const photo = { x: r.x, y: r.y, width: r.w, height: r.h };
    expect(await meanDiff(page, plain, await page.screenshot(), photo)).toBeLessThan(0.3);
    await expect(healTool(page)).toHaveAttribute('data-effect', 'off');
    await expect(page.getByRole('button', { name: 'Aplicar de novo' })).toBeVisible();
    await page.getByRole('button', { name: 'Refazer' }).click();
    await settle(page, 400);
    await expect(healTool(page)).toHaveAttribute('data-effect', 'on');
    await expect(healSpots(page)).toHaveCount(count);
    expectNoErrors(errors);
  });

  test('Manchas: um toque no círculo tira só aquela correção, e tocar de novo em Manchas limpa a foto na hora', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();
    await page.locator('[data-group=skin]').click();
    await page.locator('[data-tool=heal]').click();
    await expect(page.getByText(/Aplicado nas manchas que achei/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Toque num círculo para desfazer só aquela/)).toBeVisible();
    await expect(page.locator('[data-region-show=idle]')).toHaveCount(1, { timeout: 30_000 });
    const count = await healSpots(page).count();
    expect(count).toBeGreaterThanOrEqual(15);
    const healed = await fitted(page);

    // The ring of one spot: a tap brings that spot back and leaves the others healed.
    const ring = page.getByTestId('heal-spot').nth(3);
    const box = (await ring.boundingBox())!;
    const spot: Clip = { x: box.x + box.width / 2 - 3, y: box.y + box.height / 2 - 3, width: 6, height: 6 };
    await ring.hover();
    await settle(page, 300);
    await page.screenshot({ path: shot('ui-manchas-circulo') });
    await ring.click();
    await expect(page.getByTestId('heal-spot')).toHaveCount(count - 1);
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Tirar correção');
    await page.mouse.move(5, 5);
    await settle(page, 400);
    const one = await page.screenshot();
    expect(await meanDiff(page, healed, one, spot)).toBeGreaterThan(4);
    expect(await meanDiff(page, plain, one, spot)).toBeLessThan(1);
    const other = page.getByTestId('heal-spot').nth(0);
    const otherBox = (await other.boundingBox())!;
    const kept: Clip = { x: otherBox.x + otherBox.width / 2 - 3, y: otherBox.y + otherBox.height / 2 - 3, width: 6, height: 6 };
    expect(await meanDiff(page, healed, one, kept)).toBeLessThan(0.5);

    // Undo puts that one correction back.
    await undoButton(page).click();
    await expect(page.getByTestId('heal-spot')).toHaveCount(count);

    // The rings can be hidden, so the photo shows clean. The choice is kept on this device.
    await expect(page.getByTestId('heal-rings')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('heal-rings').click();
    await expect(page.getByTestId('heal-spot')).toHaveCount(0);
    await expect(page.getByTestId('heal-rings')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText(/Toque num círculo/)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('glowup.healRings'))).toBe('false');
    await page.getByTestId('heal-rings').click();
    await expect(page.getByTestId('heal-spot')).toHaveCount(count);

    // A second tap on the tool shows the photo as it was at once, with nothing else touched.
    await healTool(page).click();
    await expect(healTool(page)).toHaveAttribute('data-effect', 'off');
    await expect(page.getByTestId('heal-spot')).toHaveCount(0);
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Limpar');
    await settle(page, 400);
    const r = imageRect(page);
    expect(await meanDiff(page, plain, await page.screenshot(), { x: r.x, y: r.y, width: r.w, height: r.h })).toBeLessThan(0.3);

    // And one more tap heals the spots again.
    await healTool(page).click();
    await expect(healTool(page)).toHaveAttribute('data-effect', 'on', { timeout: 30_000 });
    await expect(page.locator('[data-region-show=idle]')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId('heal-spot')).toHaveCount(count);
    expectNoErrors(errors);
  });

  test('Manchas: "Tirar" também limpa a vista com zoom de uma foto grande', async ({ page }) => {
    const errors = watch(page);
    await skipIntro(page);
    await page.goto('/');
    // Twice the size of the portrait: past the preview, the zoomed view draws its own detail.
    const portrait = readFileSync('tests/fixtures/portrait.png').toString('base64');
    const big = await page.evaluate(async (data) => {
      const image = await createImageBitmap(new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(image.width * 2, image.height * 2);
      canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 })).arrayBuffer());
      let text = '';
      for (const b of bytes) text += String.fromCharCode(b);
      return btoa(text);
    }, portrait);
    await page.setInputFiles('[data-testid=file-input]', { name: 'grande.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(big, 'base64') });
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await settle(page);
    await page.locator('[data-tool=heal]').click();
    await expect(page.getByText(/Aplicado nas manchas que achei/)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-region-show=idle]')).toHaveCount(1, { timeout: 30_000 });
    await page.keyboard.press('0');
    for (let i = 0; i < 7; i++) await page.keyboard.press('+');
    await settle(page, 900);
    const vp = page.viewportSize()!;
    const middle: Clip = { x: vp.width / 2 - 260, y: vp.height / 2 - 220, width: 340, height: 440 };
    const healed = await page.screenshot();

    await healTool(page).click();
    await expect(healTool(page)).toHaveAttribute('data-effect', 'off');
    await settle(page, 900);
    const cleared = await page.screenshot();
    // Undo and redo draw the cleared photo from scratch: the view must already show it.
    await undoButton(page).click();
    await settle(page, 400);
    await page.getByRole('button', { name: 'Refazer' }).click();
    await settle(page, 900);
    const fresh = await page.screenshot();
    expect(await meanDiff(page, healed, fresh, middle)).toBeGreaterThan(0.3);
    expect(await meanDiff(page, cleared, fresh, middle)).toBeLessThan(0.1);
    expectNoErrors(errors);
  });

  test('tocar de novo na ferramenta tira o efeito, e mais uma vez aplica de novo', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();
    const smooth = page.locator('[data-tool=smooth]');
    const after = await applied(page, 'smooth');
    await expect(smooth).toHaveAttribute('data-effect', 'on');
    await expect(smooth.locator('.effect')).toBeVisible();
    // The panel has no trash button any more: the tool itself is the switch.
    await expect(page.getByText(/Tirar o efeito|Apagar o que pintei/)).toHaveCount(0);
    await page.screenshot({ path: shot('ui-ferramenta-ligada') });

    await smooth.click();
    await expect(smooth).toHaveAttribute('data-effect', 'off');
    await expect(smooth.locator('.effect')).toHaveCount(0);
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Limpar');
    const off = await fitted(page);
    expect(await meanDiff(page, plain, off, around(page, CHEEK))).toBeLessThan(0.3);

    await smooth.click();
    await expect(smooth).toHaveAttribute('data-effect', 'on');
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    const again = await fitted(page);
    expect(await meanDiff(page, after, again, around(page, CHEEK))).toBeLessThan(0.3);

    // Undo puts back what the taps took away.
    await undoButton(page).click();
    await expect(smooth).toHaveAttribute('data-effect', 'off');
    expectNoErrors(errors);
  });

  test('Olheiras, Tom de pele e Iluminador aplicam cada um no seu lugar', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();

    const under = await applied(page, 'undereye');
    expect(await meanDiff(page, plain, under, around(page, UNDER_EYE))).toBeGreaterThan(2);
    expect(await meanDiff(page, plain, under, around(page, CHEEK))).toBeLessThan(0.3);

    // The other tools reuse the faces found for this photo: no new search.
    const tone = await applied(page, 'skintone');
    expect(await meanDiff(page, under, tone, around(page, CHEEK))).toBeGreaterThan(1);
    expect(await meanDiff(page, under, tone, around(page, HAIR))).toBeLessThan(0.3);

    const light = await applied(page, 'highlight');
    expect(await meanDiff(page, tone, light, around(page, CHEEKBONE))).toBeGreaterThan(1);
    expect(await meanDiff(page, tone, light, around(page, BRIDGE))).toBeGreaterThan(1);
    expect(await meanDiff(page, tone, light, around(page, BACKGROUND))).toBeLessThan(0.3);
    expect(await meanDiff(page, tone, light, around(page, HAIR))).toBeLessThan(0.3);
    await page.screenshot({ path: shot('ui-pele-iluminador') });
    expectNoErrors(errors);
  });

  test('Manual devolve o pincel, preso à pele', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await pickTool(page, 'skin', 'smooth', { auto: true });
    await chooseMode(page, 'Manual');
    await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
    await expect(page.getByTestId('limit-toggle')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('limit-toggle')).toContainText('Só na pele');

    await pickTool(page, 'skin', 'heal', { auto: true });
    await chooseMode(page, 'Manual');
    await expect(page.getByRole('slider', { name: 'Tamanho' })).toBeVisible();
    await expect(page.getByTestId('limit-toggle')).toContainText('Só na pele');

    await pickTool(page, 'skin', 'undereye', { auto: true });
    await chooseMode(page, 'Manual');
    await expect(page.getByTestId('limit-toggle')).toContainText('Só nas olheiras');
    expectNoErrors(errors);
  });
});

test.describe('pele, celular', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('Suavizar aplica no Automático', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await page.locator('[data-tool=smooth]').tap();
    await expect(page.getByText(/Aplicado na pele que achei/)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-region-show=idle]')).toHaveCount(1, { timeout: 15_000 });
    await page.screenshot({ path: shot('ui-celular-pele') });
    expectNoErrors(errors);
  });
});
