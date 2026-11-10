import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { expectNoErrors, imageRect, meanDiff, openEditor, setSlider, settle, skipIntro } from './helpers';

/** The dev server serves each module by address, so a test can read the document and the pixels. */
test.use({ baseURL: DEV_ORIGIN });

function inPage<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(`(async () => {
    const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
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

/** Opens the portrait straight on the Brincar path, with its faces found. */
async function openBrincar(page: Page): Promise<void> {
  await skipIntro(page);
  await page.addInitScript(() => localStorage.setItem('glowup.startPath', '"fun"'));
  await page.goto('/');
  await page.setInputFiles('[data-testid=file-input]', 'tests/fixtures/portrait.png');
  await expect(page.locator('[data-fun=on]')).toHaveCount(1, { timeout: 90_000 });
  await expect(page.getByTestId('opening')).toHaveCount(0);
  await settle(page);
}

/** The exported PNG as pixels, and a short sum of them. */
const SHOT = `
  async function shot() {
    const { exportImage } = await import(/* @vite-ignore */ '/src/core/export.ts');
    const blob = await exportImage(e, { format: 'image/png', quality: 1 }, { tile() {}, encoding() {} });
    const bitmap = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = c.getContext('2d');
    g.drawImage(bitmap, 0, 0);
    return g.getImageData(0, 0, bitmap.width, bitmap.height).data;
  }
  function differ(a, b) {
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
  }
`;

const doc = (page: Page) => inPage<{ fun?: { faces?: { values: Record<string, number> }[]; stickers?: { id: number; x: number; y: number; size: number; angle: number }[] } }>(page, 'return JSON.parse(JSON.stringify(e.doc));');

test.describe('o caminho Brincar', () => {
  test('fica ao lado de Filtros, e o menu traz caretas, adesivos e nada do retoque', async ({ page }) => {
    const errors = watch(page);
    await skipIntro(page);
    await page.addInitScript(() => localStorage.removeItem('glowup.startPath'));
    await page.goto('/');
    await page.setInputFiles('[data-testid=file-input]', 'tests/fixtures/portrait.png');
    const choice = page.getByTestId('path-choice');
    await expect(choice).toBeVisible({ timeout: 90_000 });
    const names = await choice.locator('[data-path]').evaluateAll((list) => list.map((el) => el.getAttribute('data-path')));
    expect(names.slice(-2)).toEqual(['filters', 'fun']);
    await choice.locator('[data-path=fun]').click();
    await expect(page.locator('[data-fun=on]')).toHaveCount(1, { timeout: 90_000 });
    await expect(page.getByRole('slider', { name: 'Olhão' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Cabeção' })).toBeVisible();
    await expect(page.getByTestId('sticker')).toHaveCount(1);
    // No tool, group or slider of the realistic retouching.
    await expect(page.locator('[data-group]')).toHaveCount(0);
    await expect(page.getByRole('slider', { name: 'Tamanho da cabeça' })).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('com o Brincar vazio, o Formato do rosto e o Liquify saem iguais, pixel por pixel', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await page.locator('[data-group=shape]').click();
    await page.locator('[data-tool=faceshape]').click();
    await expect(page.locator('[data-shape=on]')).toHaveCount(1, { timeout: 60_000 });
    await settle(page, 300);
    const changed = await inPage<{ before: number; after: number; sizes: boolean; fun: boolean }>(
      page,
      `${SHOT}
      const { placeOf, chosenFace } = await import(/* @vite-ignore */ '/src/ui/shapepick.svelte.ts');
      e.setShapeValue(placeOf(e, chosenFace()), 'head', -60);
      e.setShapeValue(placeOf(e, chosenFace()), 'jawline', -40);
      e.commit();
      e.applyFieldScript({ strokes: [{ mode: 'push', radius: 0.06, strength: 0.6, path: [[0.3, 0.6], [0.34, 0.62], [0.38, 0.6]] }] });
      const before = await shot();
      // Brincar loads, an effect goes up and back to zero, and a sticker goes on and comes off.
      const { ensureFun } = await import(/* @vite-ignore */ '/src/tools/activate.ts');
      await ensureFun(e);
      e.funFaces = e.shapeFaces;
      const at = placeOf(e, chosenFace());
      e.setFunValue(at, 'olhao', 70);
      e.setFunValue(at, 'cabecao', 50);
      e.commit();
      const moved = await shot();
      e.setFunValue(at, 'olhao', 0);
      e.setFunValue(at, 'cabecao', 0);
      e.commit();
      const id = e.addSticker({ kind: 'oculos-redondos', at, x: 0.5, y: 0.45, size: 0.3, angle: 0 });
      const stuck = await shot();
      e.removeSticker(id);
      const after = await shot();
      return { before: differ(before, moved) + differ(before, stuck) > 0 ? 1 : 0, after: differ(before, after), sizes: before.length === after.length, fun: !!e.fun && e.fun.isEmpty() && !e.doc.fun };`,
    );
    expect(changed.before).toBe(1);
    expect(changed.sizes).toBe(true);
    expect(changed.fun).toBe(true);
    expect(changed.after).toBe(0);
    expectNoErrors(errors);
  });

  test('as caretas e o adesivo aparecem na tela e na exportação, e desfazer e refazer passam por cada um', async ({ page }) => {
    const errors = watch(page);
    await openBrincar(page);
    const r = imageRect(page);
    const clip = { x: r.x, y: r.y, width: r.w, height: r.h };
    const plain = await page.screenshot({ clip });
    await setSlider(page, 'Olhão', 70);
    await settle(page, 300);
    const eyes = await page.screenshot({ clip });
    expect(await meanDiff(page, plain, eyes)).toBeGreaterThan(0.3);
    await setSlider(page, 'Cabeção', 50);
    await settle(page, 300);
    await page.getByTestId('sticker').first().click();
    await settle(page, 600);
    await expect(page.getByTestId('sticker-frame')).toHaveCount(1);
    const all = await page.screenshot({ clip });
    expect(await meanDiff(page, eyes, all)).toBeGreaterThan(0.3);
    const state = await doc(page);
    expect(state.fun?.faces?.[0].values).toEqual({ olhao: 70, cabecao: 50 });
    expect(state.fun?.stickers).toHaveLength(1);

    // The file has the sticker at full size, the same as the screen, in any grid of tiles.
    const tiles = await inPage<{ tiled: number }>(
      page,
      `${SHOT}
      const whole = await shot();
      localStorage.setItem('glowup.tile', '512');
      const tiled = await shot();
      localStorage.removeItem('glowup.tile');
      let sum = 0;
      for (let i = 0; i < whole.length; i++) sum += Math.abs(whole[i] - tiled[i]);
      return { tiled: sum / whole.length };`,
    );
    expect(tiles.tiled).toBeLessThan(0.6);

    const undo = page.getByRole('button', { name: 'Desfazer' });
    await expect(undo).toHaveAttribute('title', 'Desfazer: Adesivo');
    await undo.click();
    await settle(page, 300);
    expect((await doc(page)).fun?.stickers).toBeUndefined();
    await expect(page.getByTestId('sticker-frame')).toHaveCount(0);
    await undo.click();
    await settle(page, 300);
    expect((await doc(page)).fun?.faces?.[0].values).toEqual({ olhao: 70 });
    await undo.click();
    await settle(page, 300);
    expect((await doc(page)).fun).toBeUndefined();
    expect(await meanDiff(page, plain, await page.screenshot({ clip }))).toBeLessThan(0.05);
    const redo = page.getByRole('button', { name: 'Refazer' });
    for (let i = 0; i < 3; i++) {
      await redo.click();
      await settle(page, 300);
    }
    expect(await meanDiff(page, all, await page.screenshot({ clip }))).toBeLessThan(0.15);
    expect((await doc(page)).fun?.stickers).toHaveLength(1);

    // Zerar takes it all off in one step, and one undo brings it all back.
    await page.getByTestId('fun-reset').click();
    await settle(page, 300);
    expect((await doc(page)).fun).toBeUndefined();
    await undo.click();
    await settle(page, 300);
    expect((await doc(page)).fun?.stickers).toHaveLength(1);
    expectNoErrors(errors);
  });

  test('o adesivo se arrasta, e a alça gira e muda o tamanho, cada gesto uma etapa', async ({ page }) => {
    const errors = watch(page);
    await openBrincar(page);
    await page.getByTestId('sticker').first().click();
    await settle(page, 600);
    const frame = page.getByTestId('sticker-frame');
    const box = (await frame.boundingBox())!;
    const before = (await doc(page)).fun!.stickers![0];
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 8 });
    await page.mouse.up();
    await settle(page, 300);
    const moved = (await doc(page)).fun!.stickers![0];
    expect(moved.x).toBeGreaterThan(before.x + 0.01);
    expect(moved.y).toBeGreaterThan(before.y + 0.01);
    expect(moved.size).toBeCloseTo(before.size, 6);

    const knob = (await page.getByTestId('sticker-knob').boundingBox())!;
    const k = [knob.x + knob.width / 2, knob.y + knob.height / 2];
    await page.mouse.move(k[0], k[1]);
    await page.mouse.down();
    await page.mouse.move(k[0] + 60, k[1] + 70, { steps: 8 });
    await page.mouse.up();
    await settle(page, 300);
    const turned = (await doc(page)).fun!.stickers![0];
    expect(turned.size).toBeGreaterThan(moved.size * 1.1);
    expect(Math.abs(turned.angle - moved.angle)).toBeGreaterThan(0.02);
    expect(turned.x).toBeCloseTo(moved.x, 6);

    // Each gesture is one step.
    const undo = page.getByRole('button', { name: 'Desfazer' });
    await undo.click();
    await settle(page, 200);
    expect((await doc(page)).fun!.stickers![0]).toEqual(moved);
    await undo.click();
    await settle(page, 200);
    expect((await doc(page)).fun!.stickers![0]).toEqual(before);

    // The button on the frame takes it off.
    await page.getByTestId('sticker-frame').click();
    await page.getByTestId('sticker-drop').click();
    await settle(page, 200);
    expect((await doc(page)).fun).toBeUndefined();
    expectNoErrors(errors);
  });

  test('o projeto salvo volta igual, sem detector, com as caretas e o adesivo', async ({ page }) => {
    const errors = watch(page);
    await openBrincar(page);
    await setSlider(page, 'Olhão', 80);
    await settle(page, 300);
    await page.getByTestId('sticker').first().click();
    await settle(page, 600);
    const saved = await doc(page);
    // Off the photo, so the frame of the sticker is not in the picture.
    await page.mouse.click(5, 300);
    const r = imageRect(page);
    const clip = { x: r.x, y: r.y, width: r.w, height: r.h };
    await inPage(page, 'const { funPick } = await import(/* @vite-ignore */ "/src/ui/funpick.svelte.ts"); funPick.selected = null; e.emit("change");');
    await settle(page, 300);
    const edited = await page.screenshot({ clip });
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await expect(page.getByText('De onde parou')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /Continuar/ }).first().click();
    // A photo with only Brincar on it opens in Brincar.
    await expect(page.getByTestId('brincar-menu')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await inPage(page, 'const { funPick } = await import(/* @vite-ignore */ "/src/ui/funpick.svelte.ts"); funPick.selected = null; e.emit("change");');
    await settle(page, 1500);
    const back = await doc(page);
    expect(back.fun).toEqual(saved.fun);
    expect(await meanDiff(page, edited, await page.screenshot({ clip }))).toBeLessThan(0.15);
    await expect(page.getByRole('slider', { name: 'Olhão' })).toHaveValue('80');
    expectNoErrors(errors);
  });
});
