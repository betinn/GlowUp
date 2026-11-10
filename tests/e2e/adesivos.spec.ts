import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { expectNoErrors, imageRect, meanDiff, settle, skipIntro } from './helpers';

/** The dev server serves each module by address, so a test can read the document and the pixels. */
test.use({ baseURL: DEV_ORIGIN });

function inPage<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(`(async () => {
    const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
    const { funPick } = await import(/* @vite-ignore */ '/src/ui/funpick.svelte.ts');
    const e = engine();
    ${body}
  })()`) as Promise<T>;
}

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('XNNPACK') && !m.text().includes('404')) errors.push(m.text());
  });
  return errors;
}

/** Opens a photo straight on the Brincar path, with its faces found. */
async function openBrincar(page: Page, fixture = 'portrait.png'): Promise<void> {
  await skipIntro(page);
  await page.addInitScript(() => localStorage.setItem('glowup.startPath', '"fun"'));
  await page.goto('/');
  await page.setInputFiles('[data-testid=file-input]', `tests/fixtures/${fixture}`);
  await expect(page.locator('[data-fun=on]')).toHaveCount(1, { timeout: 90_000 });
  await expect(page.getByTestId('opening')).toHaveCount(0);
  await settle(page);
}

interface Sticker {
  id: number;
  kind: string;
  at: [number, number] | null;
  x: number;
  y: number;
  size: number;
  angle: number;
}

const stickers = (page: Page) => inPage<Sticker[]>(page, 'return JSON.parse(JSON.stringify(e.doc.fun?.stickers ?? []));');
const kinds = async (page: Page) => (await stickers(page)).map((s) => s.kind);

/** Opens a tab of the grid and puts one of its stickers on. */
async function put(page: Page, group: string, kind: string): Promise<void> {
  await page.locator(`[data-testid=sticker-group][data-tab=${group}]`).click();
  await page.locator(`[data-testid=sticker][data-kind=${kind}]`).click();
  await settle(page, 400);
}

/**
 * The exported file: its size, and the color at the left lens of a pair of glasses, where the lenses of two
 * pairs on the same eyes overlap.
 */
const LENS = `
  const { exportImage } = await import(/* @vite-ignore */ '/src/core/export.ts');
  async function lensColor(sticker) {
    const blob = await exportImage(e, { format: 'image/png', quality: 1 }, { tile() {}, encoding() {} });
    const bitmap = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = c.getContext('2d');
    g.drawImage(bitmap, 0, 0);
    const long = Math.max(bitmap.width, bitmap.height);
    // In the art of both pairs, 60 of 300 left of the middle and 7 down is inside the left lens, off the shine.
    const dx = -0.2 * sticker.size * long;
    const dy = (7 / 300) * sticker.size * long;
    const x = Math.round(sticker.x * bitmap.width + dx * Math.cos(sticker.angle) - dy * Math.sin(sticker.angle));
    const y = Math.round(sticker.y * bitmap.height + dx * Math.sin(sticker.angle) + dy * Math.cos(sticker.angle));
    const [r, gr, b] = g.getImageData(x, y, 1, 1).data;
    return { w: bitmap.width, h: bitmap.height, r, g: gr, b };
  }
`;

test.describe('os adesivos do Brincar', () => {
  test('a grade tem abas, e cada aba mostra a arte de cada adesivo', async ({ page }) => {
    const errors = watch(page);
    await openBrincar(page);
    const tabs = page.getByTestId('sticker-group');
    await expect(tabs).toHaveText(['Óculos', 'Cabeça', 'Rosto', 'Em volta']);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    for (const group of ['oculos', 'cabeca', 'rosto', 'volta']) {
      await page.locator(`[data-testid=sticker-group][data-tab=${group}]`).click();
      const shelf = page.getByTestId('sticker');
      expect(await shelf.count()).toBeGreaterThanOrEqual(3);
      // Every button has its art drawn from the SVG of the sticker.
      const drawn = await shelf.locator('img').evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0));
      expect(drawn.every(Boolean)).toBe(true);
    }
    expectNoErrors(errors);
  });

  test('vários adesivos, cada um no seu lugar do rosto, e o último por cima até trazer outro para frente', async ({ page }) => {
    const errors = watch(page);
    await openBrincar(page);
    await put(page, 'cabeca', 'coroa');
    await put(page, 'rosto', 'bigode-classico');
    await put(page, 'oculos', 'oculos-escuros');
    await put(page, 'oculos', 'oculos-coracao');
    await expect(page.getByTestId('sticker-frame')).toHaveCount(4);
    await expect(page.getByTestId('placed')).toHaveCount(4);
    expect(await kinds(page)).toEqual(['coroa', 'bigode-classico', 'oculos-escuros', 'oculos-coracao']);
    const [crown, mustache, dark, hearts] = await stickers(page);
    // Head over the eyes over the mouth, all on the same face.
    expect(crown.y).toBeLessThan(dark.y - 0.05);
    expect(mustache.y).toBeGreaterThan(dark.y + 0.05);
    expect(Math.abs(crown.x - dark.x)).toBeLessThan(0.05);
    expect(dark.x).toBeCloseTo(hearts.x, 2);
    expect(crown.at).toEqual(dark.at);
    // The one put last is chosen, and on top already.
    await expect(page.getByTestId('placed').last()).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('sticker-raise')).toBeDisabled();

    // The pink lenses are on top of the dark ones in the file, at full size.
    const top = await inPage<{ w: number; h: number; r: number; g: number; b: number }>(page, `${LENS} return lensColor(e.doc.fun.stickers[3]);`);
    expect(top.w).toBe(1500);
    expect(top.h).toBe(1875);
    expect(top.r - top.b).toBeGreaterThan(25);

    // The dark pair is chosen from the list on the menu and brought forward: now it covers the pink one.
    await page.getByTestId('placed').nth(2).click();
    await expect(page.getByTestId('placed').nth(2)).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('sticker-raise').click();
    await settle(page, 400);
    expect(await kinds(page)).toEqual(['coroa', 'bigode-classico', 'oculos-coracao', 'oculos-escuros']);
    await expect(page.getByTestId('sticker-raise')).toBeDisabled();
    const under = await inPage<{ r: number; g: number; b: number }>(page, `${LENS} return lensColor(e.doc.fun.stickers[3]);`);
    expect(under.r - under.b).toBeLessThan(10);
    expect(under.r + under.g + under.b).toBeLessThan(top.r + top.g + top.b - 60);

    // Bringing forward is one step: undo puts the order back, redo again.
    const undo = page.getByRole('button', { name: 'Desfazer' });
    await expect(undo).toHaveAttribute('title', 'Desfazer: Trazer adesivo para frente');
    await undo.click();
    await settle(page, 300);
    expect(await kinds(page)).toEqual(['coroa', 'bigode-classico', 'oculos-escuros', 'oculos-coracao']);
    await page.getByRole('button', { name: 'Refazer' }).click();
    await settle(page, 300);
    expect(await kinds(page)).toEqual(['coroa', 'bigode-classico', 'oculos-coracao', 'oculos-escuros']);

    // Each is chosen on the photo too, and comes off alone.
    await page.getByTestId('placed').first().click();
    await page.getByTestId('sticker-remove').click();
    await settle(page, 300);
    expect(await kinds(page)).toEqual(['bigode-classico', 'oculos-coracao', 'oculos-escuros']);
    await expect(page.getByTestId('sticker-frame')).toHaveCount(3);
    await undo.click();
    await settle(page, 300);
    expect(await kinds(page)).toEqual(['coroa', 'bigode-classico', 'oculos-coracao', 'oculos-escuros']);

    // Zerar takes all four off in one step.
    await page.getByTestId('fun-reset').click();
    await settle(page, 300);
    expect(await kinds(page)).toEqual([]);
    await expect(page.getByTestId('placed')).toHaveCount(0);
    await undo.click();
    await settle(page, 300);
    expect(await kinds(page)).toHaveLength(4);
    expectNoErrors(errors);
  });

  test('o projeto salvo com vários adesivos em ordem volta igual', async ({ page }) => {
    const errors = watch(page);
    await openBrincar(page);
    await put(page, 'volta', 'estrelas');
    await put(page, 'cabeca', 'orelhas-gato');
    await put(page, 'rosto', 'nariz-palhaco');
    await put(page, 'oculos', 'oculos-nerd');
    await page.getByTestId('placed').nth(1).click();
    await page.getByTestId('sticker-raise').click();
    await settle(page, 300);
    const saved = await stickers(page);
    expect(saved.map((s) => s.kind)).toEqual(['estrelas', 'nariz-palhaco', 'oculos-nerd', 'orelhas-gato']);
    const r = imageRect(page);
    const clip = { x: r.x, y: r.y, width: r.w, height: r.h };
    await inPage(page, 'funPick.selected = null; e.emit("change");');
    await settle(page, 300);
    // The frames stay off the picture: only the photo with its stickers.
    const frames = page.getByTestId('sticker-frames');
    await frames.evaluate((el) => ((el as HTMLElement).style.visibility = 'hidden'));
    const edited = await page.screenshot({ clip });
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await expect(page.getByText('De onde parou')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /Continuar/ }).first().click();
    await expect(page.getByTestId('brincar-menu')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await inPage(page, 'funPick.selected = null; e.emit("change");');
    await settle(page, 1500);
    expect(await stickers(page)).toEqual(saved);
    await expect(page.getByTestId('placed')).toHaveCount(4);
    await page.getByTestId('sticker-frames').evaluate((el) => ((el as HTMLElement).style.visibility = 'hidden'));
    expect(await meanDiff(page, edited, await page.screenshot({ clip }))).toBeLessThan(0.15);
    expectNoErrors(errors);
  });

  test('numa foto em grupo, o adesivo vai para o rosto escolhido', async ({ page }) => {
    const errors = watch(page);
    await openBrincar(page, 'group.png');
    const chips = page.getByTestId('fun-face');
    expect(await chips.count()).toBeGreaterThan(1);
    const faces = await inPage<{ x: number; y: number; w: number; h: number }[]>(page, 'return funPick.faces.map((f) => ({ ...f.box }));');
    for (let i = 0; i < 2; i++) {
      await chips.nth(i).click();
      await put(page, 'cabeca', 'coroa');
    }
    const [a, b] = await stickers(page);
    expect(a.at).not.toEqual(b.at);
    for (const [i, s] of [a, b].entries()) {
      const box = faces[i];
      // Over the middle of its face, above its eyes.
      expect(Math.abs(s.x - (box.x + box.w / 2))).toBeLessThan(box.w * 0.35);
      expect(s.y).toBeLessThan(box.y + box.h * 0.3);
      expect(s.y).toBeGreaterThan(box.y - box.h * 1.2);
    }
    expectNoErrors(errors);
  });
});
