import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_ORIGIN } from '../../playwright.config';
import { expectNoErrors, imageRect, meanDiff, pickTool, settle, skipIntro, findFunFaces } from './helpers';

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
  await findFunFaces(page);
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

  test('vários adesivos, em ordem, passam pela exportação aumentada e pela ferramenta Aumentar resolução', async ({ page }) => {
    // The model runs on the processor here, so the photo is cropped to a small square and the stickers are made
    // small enough to fit in it, one over the other.
    test.setTimeout(600_000);
    const errors = watch(page);
    await page.addInitScript(() => {
      localStorage.setItem('glowup.upscaleTile', '64');
      localStorage.setItem('glowup.upscaleGpu', 'off');
    });
    await openBrincar(page);
    const SIDE = 96;
    const rendered = () =>
      inPage<number[]>(
        page,
        `const { renderImage } = await import(/* @vite-ignore */ '/src/core/export.ts');
        const canvas = await renderImage(e, { tile() {} });
        return Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);`,
      );
    /** A PNG 4 times bigger, back to the size it had by the mean of each block of 4 by 4. */
    const shrunk = (png: Buffer) =>
      page.evaluate(async (b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
        c.drawImage(bitmap, 0, 0);
        const big = c.getImageData(0, 0, bitmap.width, bitmap.height).data;
        const w = bitmap.width / 4;
        const out = new Array<number>(w * (bitmap.height / 4) * 4).fill(0);
        for (let y = 0; y < bitmap.height; y++) {
          for (let x = 0; x < bitmap.width; x++) {
            const o = ((y >> 2) * w + (x >> 2)) * 4;
            const i = (y * bitmap.width + x) * 4;
            for (let k = 0; k < 4; k++) out[o + k] += big[i + k] / 16;
          }
        }
        return { w: bitmap.width, h: bitmap.height, px: out };
      }, png.toString('base64'));
    /** Mean difference in levels, over the color channels of the pixels kept by `only`. */
    const differ = (a: number[], b: number[], only?: boolean[]) => {
      let sum = 0;
      let n = 0;
      for (let p = 0; p < a.length / 4; p++) {
        if (only && !only[p]) continue;
        for (let k = 0; k < 3; k++) sum += Math.abs(a[p * 4 + k] - b[p * 4 + k]);
        n += 3;
      }
      return sum / n;
    };

    // A small square around the eyes, found by putting a pair of glasses on once.
    await put(page, 'oculos', 'oculos-escuros');
    const middle = await inPage<[number, number]>(
      page,
      `const s = e.doc.fun.stickers[0];
      const { width: w, height: h } = e.doc;
      e.removeSticker(s.id);
      e.setCrop({ angle: 0, quarter: 0, flipH: false, flipV: false, cx: s.x * w - w / 2, cy: s.y * h - h / 2, cw: ${SIDE}, ch: ${SIDE} });
      return [s.x, s.y];`,
    );
    await settle(page, 600);
    const plain = await rendered();
    expect(plain).toHaveLength(SIDE * SIDE * 4);

    // Four stickers of four tabs, piled in the square: hearts under, then a crown, glasses and a nose on top.
    for (const [group, kind] of [['volta', 'coracoes'], ['cabeca', 'coroa'], ['oculos', 'oculos-escuros'], ['rosto', 'nariz-palhaco']]) await put(page, group, kind);
    await inPage(
      page,
      `const [mx, my] = ${JSON.stringify(middle)};
      const { width: w, height: h } = e.doc;
      const long = Math.max(w, h);
      const spots = [[0, 0, 90], [0, -22, 60], [0, 4, 70], [8, 14, 34]];
      e.doc.fun.stickers.forEach((s, i) => {
        const [dx, dy, px] = spots[i];
        e.changeSticker(s.id, { x: mx + dx / w, y: my + dy / h, size: px / long, angle: 0.15 });
      });
      e.commit();`,
    );
    await settle(page, 800);
    expect(await kinds(page)).toEqual(['coracoes', 'coroa', 'oculos-escuros', 'nariz-palhaco']);
    const fun = await rendered();
    const changed: boolean[] = [];
    for (let p = 0; p < plain.length / 4; p++) {
      let d = 0;
      for (let k = 0; k < 3; k++) d += Math.abs(plain[p * 4 + k] - fun[p * 4 + k]);
      changed.push(d > 60);
    }
    expect(changed.filter(Boolean).length / changed.length).toBeGreaterThan(0.3);

    // The export with the option on: 4 times the square, with the stickers in it, in their order.
    await page.getByTestId('export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    await page.getByTestId('export-upscale-switch').click();
    await expect(page.getByTestId('export-size')).toHaveText(`${SIDE * 4} × ${SIDE * 4} px, aumentada 4×`);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 300_000 }), page.getByTestId('export-go').click()]);
    const fromExport = await shrunk(readFileSync((await download.path())!));
    expect([fromExport.w, fromExport.h]).toEqual([SIDE * 4, SIDE * 4]);
    expect(differ(fromExport.px, fun)).toBeLessThan(6);
    expect(differ(fromExport.px, fun, changed) * 3).toBeLessThan(differ(fromExport.px, plain, changed));
    await page.getByRole('button', { name: 'Fechar' }).click();

    // The tool: the bigger photo opens as a new one, with the stickers in its pixels and none left to draw again.
    await page.getByTestId('path-switch').click();
    await page.getByTestId('path-choice').locator('[data-path=manual]').click();
    await pickTool(page, 'frame', 'upscale');
    await page.getByTestId('upscale-go').click();
    await expect(page.getByTestId('opening')).toHaveCount(1, { timeout: 300_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0, { timeout: 60_000 });
    await settle(page);
    const grown = await inPage<{ w: number; h: number; stickers: number }>(page, 'return { w: e.doc.width, h: e.doc.height, stickers: e.doc.fun?.stickers?.length ?? 0 };');
    expect(grown).toEqual({ w: SIDE * 4, h: SIDE * 4, stickers: 0 });
    const png = await inPage<string>(
      page,
      `const { exportImage } = await import(/* @vite-ignore */ '/src/core/export.ts');
      const blob = await exportImage(e, { format: 'image/png', quality: 1 }, { tile() {}, encoding() {} });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s);`,
    );
    const fromTool = await shrunk(Buffer.from(png, 'base64'));
    expect(differ(fromTool.px, fun)).toBeLessThan(6);
    expect(differ(fromTool.px, fun, changed) * 3).toBeLessThan(differ(fromTool.px, plain, changed));
    expectNoErrors(errors);
  });
});
