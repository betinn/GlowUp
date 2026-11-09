import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { compare, expectNoErrors, facePoint, imageRect, meanDiff, openEditor, pickTool, PORTRAIT, setSlider, settle, onSite } from './helpers';

/** The real detector runs in these tests: the procedural portraits are enough to trigger it. */
const GROUP = { w: 1200, h: 750 };
const GRADIENT = { w: 1024, h: 768 };
const shot = (name: string) => `docs/visual-checks/${name}.png`;

const isDetector = (url: string) => /\.(wasm|task)(\?|$)|vision_wasm_internal|\/detector-/.test(url);

function watch(page: Page) {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // The runtime prints this line at error level on every start.
    if (m.type() === 'error' && !m.text().includes('XNNPACK')) errors.push(m.text());
  });
  page.on('request', (r) => requests.push(r.url()));
  return { errors, requests };
}

async function chooseFilter(page: Page, id = 'prata'): Promise<void> {
  await pickTool(page, 'filters', 'filters');
  await page.locator(`[data-filter=${id}]`).click();
  await setSlider(page, 'Intensidade', 100);
  await page.mouse.move(2, 2);
  await settle(page, 400);
}

const askForFace = (page: Page) => page.getByRole('radio', { name: 'Escolher rosto' }).click();
const rings = (page: Page) => page.getByTestId('face-ring');

async function exportPng(page: Page): Promise<Buffer> {
  await page.getByTestId('export-open').click();
  await page.getByRole('radio', { name: 'PNG' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-go').click()]);
  const path = await download.path();
  await expect(page.getByText('Prontinho. Tá na sua pasta.')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar a editar' }).click();
  await expect(page.getByTestId('export-go')).toHaveCount(0);
  await settle(page, 300);
  return readFileSync(path);
}

/** Difference between the strongest and the weakest channel around points given in image UV. */
async function colorfulness(page: Page, png: Buffer, points: [number, number][]): Promise<number[]> {
  const other = await page.context().newPage();
  const result = await other.evaluate(
    async ([data, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data as string}`;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      return (list as [number, number][]).map(([u, v]) => {
        const r = 6;
        const d = g.getImageData(Math.round(u * img.width) - r, Math.round(v * img.height) - r, r * 2, r * 2).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
        return sum / (d.length / 4);
      });
    },
    [png.toString('base64'), points] as const,
  );
  await other.close();
  return result;
}

/** Face center and a point of the backdrop in the procedural portrait, in image UV. */
const FACE: [number, number] = [0.5, 0.45];
const BACKDROP: [number, number] = [0.06, 0.08];

test.describe('escolher rosto', () => {
  let seen: ReturnType<typeof watch>;

  test.beforeEach(({ page }) => {
    seen = watch(page);
  });

  test.afterEach(({ baseURL }) => {
    expectNoErrors(seen.errors);
    // Nothing leaves the device: every request stays on this site.
    expect(seen.requests.filter((u) => !onSite(u, baseURL!))).toEqual([]);
  });

  test('o detector só baixa quando pedem, e o rosto tocado recebe o filtro', async ({ page }) => {
    await openEditor(page, 'group.png');
    await chooseFilter(page);
    expect(seen.requests.filter(isDetector)).toEqual([]);
    const precache = await (await page.request.get('/sw.js')).text();
    expect(isDetector(precache)).toBe(false);

    const whole = await exportPng(page);
    await askForFace(page);
    await expect(page.getByRole('progressbar', { name: 'Procurando rostos' })).toBeVisible();
    await expect(rings(page)).toHaveCount(2, { timeout: 60_000 });
    await expect(page.getByText('Toque no rosto que recebe o filtro.')).toBeVisible();
    expect(seen.requests.filter((u) => /\.wasm/.test(u)).length).toBe(1);
    expect(seen.requests.filter((u) => /\.task/.test(u)).length).toBe(1);
    await page.screenshot({ path: shot('ui-rosto-aneis') });

    const box = (await rings(page).nth(1).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(rings(page)).toHaveCount(0);
    await page.mouse.move(2, 2);
    await settle(page, 600);
    await page.screenshot({ path: shot('ui-rosto-filtro') });

    const chosen = await exportPng(page);
    const [left, right] = await colorfulness(page, chosen, [
      [0.25, 0.47],
      [0.75, 0.47],
    ]);
    expect(right).toBeLessThan(6);
    expect(left).toBeGreaterThan(30);
    const [wholeLeft] = await colorfulness(page, whole, [[0.25, 0.47]]);
    expect(wholeLeft).toBeLessThan(6);
  });

  test('sem rosto na foto, o pincel marca a área', async ({ page }) => {
    await openEditor(page, 'gradient.png');
    await chooseFilter(page);
    await askForFace(page);
    await expect(page.getByText('Não achei rosto nesta foto. Pinte a área com o pincel.')).toBeVisible({ timeout: 60_000 });
    await expect(rings(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();

    const empty = await exportPng(page);
    const [before] = await colorfulness(page, empty, [[0.3, 0.62]]);
    expect(before).toBeGreaterThan(100);

    const r = imageRect(page, GRADIENT);
    await page.mouse.move(r.x + r.w * 0.2, r.y + r.h * 0.62);
    await page.mouse.down();
    await page.mouse.move(r.x + r.w * 0.4, r.y + r.h * 0.62, { steps: 12 });
    await page.mouse.up();
    await page.mouse.move(2, 2);
    await settle(page, 500);
    await page.screenshot({ path: shot('ui-rosto-pincel') });

    const painted = await exportPng(page);
    const [inside, outside] = await colorfulness(page, painted, [
      [0.3, 0.62],
      [0.7, 0.62],
    ]);
    expect(inside).toBeLessThan(8);
    expect(outside).toBeGreaterThan(100);
  });

  test('borracha tira o filtro e desfazer volta para a foto toda', async ({ page }) => {
    await openEditor(page);
    await chooseFilter(page);
    await askForFace(page);
    await expect(rings(page)).toHaveCount(1, { timeout: 60_000 });
    await rings(page).click();
    await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
    await page.mouse.move(2, 2);
    await settle(page, 500);
    const masked = await exportPng(page);
    const [face, backdrop] = await colorfulness(page, masked, [FACE, BACKDROP]);
    expect(face).toBeLessThan(6);
    expect(backdrop).toBeGreaterThan(10);

    await page.getByRole('button', { name: 'Borracha' }).click();
    const [x, y] = facePoint(page, 0, -0.05);
    await page.mouse.move(x - 30, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y, { steps: 8 });
    await page.mouse.up();
    await page.mouse.move(2, 2);
    await settle(page, 500);
    const erased = await exportPng(page);
    const [hole] = await colorfulness(page, erased, [FACE]);
    expect(hole).toBeGreaterThan(face + 10);

    await page.keyboard.press('Control+z');
    await settle(page, 400);
    const restored = await exportPng(page);
    expect(await meanDiff(page, restored, masked)).toBeLessThan(0.2);

    await page.keyboard.press('Control+z');
    await settle(page, 400);
    await expect(page.getByRole('radio', { name: 'Foto toda' })).toHaveAttribute('aria-checked', 'true');
    const whole = await exportPng(page);
    const [backdropWhole] = await colorfulness(page, whole, [BACKDROP]);
    expect(backdropWhole).toBeLessThan(6);
  });

  test('a máscara acompanha o liquify', async ({ page }) => {
    await openEditor(page);
    await chooseFilter(page);
    await askForFace(page);
    await expect(rings(page)).toHaveCount(1, { timeout: 60_000 });
    const ringBefore = (await rings(page).boundingBox())!;
    await rings(page).click();
    await page.mouse.move(2, 2);
    await settle(page, 500);
    const still = await exportPng(page);

    await pickTool(page, 'shape', 'liquify');
    await setSlider(page, 'Tamanho', 92);
    // A strong push moves the whole face to the side, and the gray must go with it.
    const from = facePoint(page, -0.02, 0.05);
    const to = facePoint(page, 0.2, 0.05);
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(...from);
      await page.mouse.down();
      await page.mouse.move(...to, { steps: 14 });
      await page.mouse.up();
    }
    await page.mouse.move(2, 2);
    await settle(page, 600);
    const pushed = await exportPng(page);

    const u = 0.5 + (0.27 * PORTRAIT.h) / PORTRAIT.w;
    const [wasColor] = await colorfulness(page, still, [[u, 0.55]]);
    const [nowGray] = await colorfulness(page, pushed, [[u, 0.55]]);
    expect(nowGray).toBeLessThan(wasColor - 10);

    // The ring goes where the face went.
    await pickTool(page, 'filters', 'filters');
    await page.getByTestId('face-swap').click();
    await expect(rings(page)).toHaveCount(1);
    await settle(page, 300);
    const ringAfter = (await rings(page).boundingBox())!;
    expect(ringAfter.x + ringAfter.width / 2).toBeGreaterThan(ringBefore.x + ringBefore.width / 2 + 15);
  });

  test('comparar, trocar a grade de tiles e reabrir respeitam a máscara', async ({ page }) => {
    await openEditor(page);
    await chooseFilter(page);
    const clip = (() => {
      const r = imageRect(page);
      return { x: r.x, y: r.y, width: r.w, height: r.h };
    })();
    const plain = await pickPlain(page, clip);
    await askForFace(page);
    await expect(rings(page)).toHaveCount(1, { timeout: 60_000 });
    await rings(page).click();
    await page.mouse.move(2, 2);
    await settle(page, 500);
    const filtered = await page.screenshot({ clip });

    // Holding shows the photo with no filter at all, and letting go brings the masked one back.
    const button = page.getByTestId('compare-filter');
    await button.hover();
    await page.mouse.down();
    await settle(page, 450);
    const held = await page.screenshot({ clip });
    await page.mouse.up();
    await page.mouse.move(2, 2);
    await settle(page, 350);
    expect(await meanDiff(page, held, plain)).toBeLessThan(1.5);
    expect(await meanDiff(page, await page.screenshot({ clip }), filtered)).toBeLessThan(0.2);

    await button.click();
    await page.mouse.move(2, 2);
    await settle(page, 1200);
    await page.screenshot({ path: shot('ui-rosto-comparar') });
    await button.click();
    await settle(page, 300);

    const reference = await exportPng(page);
    await page.evaluate(() => localStorage.setItem('glowup.tile', '300'));
    const tiled = await exportPng(page);
    expect(await meanDiff(page, reference, tiled)).toBeLessThan(0.6);
    await page.evaluate(() => localStorage.removeItem('glowup.tile'));

    await settle(page, 1800);
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await page.getByRole('button', { name: /^Continuar/ }).first().click();
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await settle(page);
    const reopened = await exportPng(page);
    expect(await meanDiff(page, reference, reopened)).toBeLessThan(0.05);

    await pickTool(page, 'filters', 'filters');
    await expect(page.getByRole('radio', { name: 'Escolher rosto' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('face-swap')).toBeVisible();
  });

  /** Removes the filter for a moment to record the plain photo. */
  async function pickPlain(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<Buffer> {
    await page.locator('[data-filter=prata]').click();
    await page.mouse.move(2, 2);
    await settle(page, 400);
    const plain = await page.screenshot({ clip });
    await page.locator('[data-filter=prata]').click();
    await page.mouse.move(2, 2);
    await settle(page, 400);
    return plain;
  }

  test('borda e troca de foto toda para rosto', async ({ page }) => {
    await openEditor(page);
    await chooseFilter(page);
    await askForFace(page);
    await expect(rings(page)).toHaveCount(1, { timeout: 60_000 });
    await rings(page).click();
    await page.mouse.move(2, 2);
    await settle(page, 500);
    const clip = (() => {
      const r = imageRect(page);
      return { x: r.x, y: r.y, width: r.w, height: r.h };
    })();
    const soft = await page.screenshot({ clip });
    await setSlider(page, 'Borda', 100);
    await settle(page, 500);
    expect(await meanDiff(page, soft, await page.screenshot({ clip }))).toBeGreaterThan(0.3);

    await page.getByRole('radio', { name: 'Foto toda' }).click();
    await settle(page, 400);
    await expect(page.getByRole('button', { name: 'Borracha' })).toHaveCount(0);
    await page.getByRole('radio', { name: 'Escolher rosto' }).click();
    await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
    await expect(rings(page)).toHaveCount(0);
  });

  test('sem o detector, a pessoa ainda pinta a área', async ({ page }) => {
    await page.route(/\.task$/, (route) => route.abort());
    await openEditor(page, 'group.png');
    await chooseFilter(page);
    await askForFace(page);
    await expect(page.getByText('O detector não carregou. Pinte a área com o pincel.')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
    // The failed download and its log line are what this test is about.
    seen.errors.length = 0;
  });

  test('foto girada mantém cada anel no seu rosto', async ({ page }) => {
    await openEditor(page, 'group.png');
    await pickTool(page, 'frame', 'crop');
    await page.getByRole('button', { name: 'Girar para a direita' }).click();
    await settle(page, 400);
    await chooseFilter(page);
    await askForFace(page);
    await expect(rings(page)).toHaveCount(2, { timeout: 60_000 });
    await settle(page, 300);
    const a = (await rings(page).nth(0).boundingBox())!;
    const b = (await rings(page).nth(1).boundingBox())!;
    // A quarter turn stacks the two faces.
    expect(Math.abs(a.x - b.x)).toBeLessThan(20);
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(100);
    const lower = a.y > b.y ? a : b;
    await page.mouse.click(lower.x + lower.width / 2, lower.y + lower.height / 2);
    await expect(rings(page)).toHaveCount(0);
    await page.mouse.move(2, 2);
    await settle(page, 500);
    const png = await exportPng(page);
    const [top, bottom] = await colorfulness(page, png, [
      [0.53, 0.25],
      [0.53, 0.75],
    ]);
    expect(bottom).toBeLessThan(6);
    expect(top).toBeGreaterThan(30);
  });

  test('uma busca interrompida recomeça do início', async ({ page }) => {
    await openEditor(page, 'group.png');
    await chooseFilter(page);
    await askForFace(page);
    await page.getByRole('radio', { name: 'Foto toda' }).click();
    await expect(rings(page)).toHaveCount(0);
    await askForFace(page);
    await expect(rings(page)).toHaveCount(2, { timeout: 60_000 });
    await expect(page.getByText('Não achei rosto nesta foto.')).toHaveCount(0);
  });

  test('sair dos filtros larga o pincel e os anéis', async ({ page }) => {
    await openEditor(page, 'group.png');
    await chooseFilter(page);
    await askForFace(page);
    await expect(rings(page)).toHaveCount(2, { timeout: 60_000 });
    await page.keyboard.press('Escape');
    await expect(rings(page)).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Foto toda' })).toHaveAttribute('aria-checked', 'true');

    await askForFace(page);
    await expect(rings(page)).toHaveCount(2);
    await pickTool(page, 'light', 'adjust');
    await expect(rings(page)).toHaveCount(0);
    const r = imageRect(page, GROUP);
    await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
    await expect(page.locator('.cursor')).toHaveCount(0);
  });
});

test.describe('escolher rosto, celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('toque escolhe, e o detalhe do zoom respeita a máscara', async ({ page }) => {
    const seen = watch(page);
    await openEditor(page, 'portrait.png');
    await page.locator('[data-group=filters]').tap();
    await page.locator('[data-tool=filters]').tap();
    await page.locator('[data-filter=prata]').tap();
    await setSlider(page, 'Intensidade', 100);
    await settle(page, 400);
    await page.getByRole('radio', { name: 'Escolher rosto' }).tap();
    await expect(rings(page)).toHaveCount(1, { timeout: 60_000 });
    await page.screenshot({ path: shot('ui-celular-rosto') });
    await rings(page).tap();
    await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
    await settle(page, 500);

    // Preview on touch is smaller than this photo, so zooming in renders the area in full detail.
    const canvas = page.locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height * 0.3;
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -160);
    await settle(page, 900);
    const shotBuffer = await page.screenshot({ clip: { x: cx - 60, y: cy - 60, width: 120, height: 120 } });
    const [zoomed] = await colorfulness(page, shotBuffer, [[0.5, 0.5]]);
    expect(zoomed).toBeLessThan(8);
    expectNoErrors(seen.errors);
  });
});

test('antes e depois do filtro em um rosto', async ({ page }) => {
  const seen = watch(page);
  await openEditor(page, 'group.png');
  const r = imageRect(page, GROUP);
  const clip = { x: r.x, y: r.y, width: r.w, height: r.h };
  await chooseFilter(page);
  await page.locator('[data-filter=prata]').click();
  await page.mouse.move(2, 2);
  await settle(page, 400);
  const before = await page.screenshot({ clip });
  await page.locator('[data-filter=prata]').click();
  await askForFace(page);
  await expect(rings(page)).toHaveCount(2, { timeout: 60_000 });
  await rings(page).nth(1).click();
  await page.mouse.move(2, 2);
  await settle(page, 600);
  await compare(page, '20-filtro-rosto', 'Filtro Prata só no rosto da direita, com a borda padrão', before, await page.screenshot({ clip }));
  expectNoErrors(seen.errors);
});
