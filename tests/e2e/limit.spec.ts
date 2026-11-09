import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectNoErrors, facePoint, imageRect, limitSettled, meanDiff, openEditor, paint, pickTool, PORTRAIT, scribble, setSlider, settle, skipIntro, onSite } from './helpers';

/** The real detector runs here too: the procedural portraits are enough to trigger it. */
const GROUP = { w: 1200, h: 750 };
const GRADIENT = { w: 1024, h: 768 };
const shot = (name: string) => `docs/visual-checks/${name}.png`;

/** Points of the fixture portrait, in its own coordinates. */
const IRIS: [number, number] = [-0.155, -0.06];
const SCLERA: [number, number] = [-0.11, -0.06];
const CHEEK: [number, number] = [-0.15, 0.12];

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

const limit = (page: Page, state: string) => page.locator(`[data-limit=${state}]`);
const toggle = (page: Page) => page.getByTestId('limit-toggle');
const canUndo = (page: Page) => page.getByRole('button', { name: 'Desfazer' }).isEnabled();

const photo = (page: Page, size = PORTRAIT) => {
  const r = imageRect(page, size);
  return { x: r.x, y: r.y, width: r.w, height: r.h };
};

/** Points on the screen of the photo, around one point in portrait coordinates. */
async function changeAt(page: Page, before: Buffer, after: Buffer, point: [number, number]): Promise<number> {
  const r = imageRect(page);
  const [x, y] = facePoint(page, ...point);
  const uv: [number, number] = [(x - r.x) / r.w, (y - r.y) / r.h];
  const other = await page.context().newPage();
  const result = await other.evaluate(
    async ([a, b, at]) => {
      const load = async (s: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${s}`;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const [u, v] = at as unknown as [number, number];
        return g.getImageData(Math.round(u * img.width) - 3, Math.round(v * img.height) - 3, 6, 6).data;
      };
      const [p, q] = await Promise.all([load(a as string), load(b as string)]);
      let sum = 0;
      for (let i = 0; i < p.length; i++) sum += Math.abs(p[i] - q[i]);
      return sum / p.length;
    },
    [before.toString('base64'), after.toString('base64'), uv] as const,
  );
  await other.close();
  return result;
}

/** Share of the pixels of the frame that changed, in each half. */
async function changedShare(page: Page, a: Buffer, b: Buffer): Promise<{ left: number; right: number }> {
  const other = await page.context().newPage();
  const result = await other.evaluate(
    async ([x, y]) => {
      const load = async (s: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${s}`;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
      };
      const [p, q] = await Promise.all([load(x), load(y)]);
      let left = 0;
      let right = 0;
      for (let i = 0; i < p.w * p.h; i++) {
        const delta = Math.abs(p.d[i * 4] - q.d[i * 4]) + Math.abs(p.d[i * 4 + 1] - q.d[i * 4 + 1]) + Math.abs(p.d[i * 4 + 2] - q.d[i * 4 + 2]);
        if (delta > 12) {
          if (i % p.w < p.w / 2) left++;
          else right++;
        }
      }
      return { left: left / (p.w * p.h), right: right / (p.w * p.h) };
    },
    [a.toString('base64'), b.toString('base64')],
  );
  await other.close();
  return result;
}

/** One big stroke from side to side of the frame. */
async function sweep(page: Page, clip: ReturnType<typeof photo>, v: number): Promise<void> {
  await page.mouse.move(clip.x + 4, clip.y + clip.height * v);
  await page.mouse.down();
  await page.mouse.move(clip.x + clip.width - 4, clip.y + clip.height * v, { steps: 24 });
  await page.mouse.up();
  await page.mouse.move(2, 2);
  await settle(page, 500);
}

/** The fixture portrait with its lips closed. */
async function closedMouth(page: Page): Promise<Buffer> {
  const data = readFileSync('tests/fixtures/portrait.png').toString('base64');
  const png = await page.evaluate(async (source) => {
    const img = new Image();
    img.src = `data:image/png;base64,${source}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const cx = img.width / 2;
    const cy = img.height * 0.745;
    const skin = g.getImageData(cx, img.height * 0.66, 1, 1).data;
    g.fillStyle = `rgb(${skin[0]} ${skin[1]} ${skin[2]})`;
    g.beginPath();
    g.ellipse(cx, cy, img.height * 0.135, img.height * 0.07, 0, 0, 7);
    g.fill();
    g.fillStyle = '#b4606a';
    g.beginPath();
    g.ellipse(cx, cy, img.height * 0.095, img.height * 0.03, 0, 0, 7);
    g.fill();
    g.strokeStyle = '#6e2f38';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx - img.height * 0.095, cy);
    g.quadraticCurveTo(cx, cy + 4, cx + img.height * 0.095, cy);
    g.stroke();
    return c.toDataURL('image/png').split(',')[1];
  }, data);
  return Buffer.from(png, 'base64');
}

test.describe('limite do pincel', () => {
  let seen: ReturnType<typeof watch>;

  test.beforeEach(({ page }) => {
    seen = watch(page);
  });

  test.afterEach(({ baseURL }) => {
    expectNoErrors(seen.errors);
    // Nothing leaves the device: every request stays on this site.
    expect(seen.requests.filter((u) => !onSite(u, baseURL!))).toEqual([]);
  });

  test('abrir a ferramenta baixa o detector, avisa, e o traço fica na íris', async ({ page }) => {
    // The model takes a moment, so the wait can be seen and tried.
    await page.route(/\.task$/, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await openEditor(page);
    const clip = photo(page);
    expect(seen.requests.filter(isDetector)).toEqual([]);

    await page.locator('[data-group=eyes]').click();
    await page.locator('[data-tool=eyecolor]').click();
    await expect(page.getByRole('progressbar', { name: 'Procurando os olhos' })).toBeVisible();
    await expect(page.getByText('Só na primeira vez, cerca de 6 MB. A foto não sai do seu aparelho.')).toBeVisible();
    await page.screenshot({ path: shot('ui-limite-procurando') });

    const [x, y] = facePoint(page, ...IRIS);
    await page.mouse.click(x, y);
    const held = page.getByText('Procurando os olhos. O pincel já vem.');
    await expect(held).toBeVisible();
    expect(await canUndo(page)).toBe(false);

    // The automatic mode would fill the iris: this test paints by hand.
    await limitSettled(page);
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await expect(toggle(page)).toContainText('Só na íris');
    expect(seen.requests.filter((u) => /\.wasm/.test(u)).length).toBe(1);
    expect(seen.requests.filter((u) => /\.task/.test(u)).length).toBe(1);
    await page.mouse.move(2, 2);
    await expect(held).toBeHidden();
    await settle(page, 300);
    await page.screenshot({ path: shot('ui-limite-olhos') });
    const plain = await page.screenshot({ clip });

    // A whole stroke away from the eyes shows nothing, says so and leaves nothing to undo.
    await paint(page, scribble(CHEEK[0], CHEEK[1], 0.05, 0.03, 3));
    const notice = page.getByText('Isso ficou fora. Para pintar aqui, desligue "Só na íris".');
    await expect(notice).toBeVisible();
    await page.screenshot({ path: shot('ui-limite-fora') });
    expect(await canUndo(page)).toBe(false);
    await expect(notice).toBeHidden();
    expect(await meanDiff(page, plain, await page.screenshot({ clip }))).toBeLessThan(0.002);

    // A stroke much wider than the iris changes only the iris.
    await setSlider(page, 'Tamanho', 75);
    await paint(page, [
      [IRIS[0] - 0.03, IRIS[1]],
      [IRIS[0] + 0.03, IRIS[1]],
    ]);
    const painted = await page.screenshot({ clip });
    expect(await changeAt(page, plain, painted, IRIS)).toBeGreaterThan(4);
    expect(await changeAt(page, plain, painted, SCLERA)).toBeLessThan(1);
    expect(await changeAt(page, plain, painted, CHEEK)).toBeLessThan(1);

    // With the switch off the same stroke goes where the person wants.
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await expect(toggle(page)).toContainText('Desligado');
    await paint(page, scribble(CHEEK[0], CHEEK[1], 0.05, 0.03, 3));
    const free = await page.screenshot({ clip });
    expect(await changeAt(page, painted, free, CHEEK)).toBeGreaterThan(2);

    // That choice belongs to this tool, and it stays while the photo is open.
    await pickTool(page, 'eyes', 'sparkle');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await pickTool(page, 'eyes', 'eyecolor');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');

    // The eraser is never held back, so paint from a free stroke can always go.
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Borracha' }).click();
    await paint(page, scribble(CHEEK[0], CHEEK[1], 0.08, 0.05, 5), 2);
    expect(await changeAt(page, free, await page.screenshot({ clip }), CHEEK)).toBeGreaterThan(2);
  });

  test('cada ferramenta fica no seu lugar, e um traço pela foto toda só muda ali', async ({ page }) => {
    await openEditor(page);
    const clip = photo(page);
    const plain = await page.screenshot({ clip });

    await pickTool(page, 'eyes', 'sclera');
    await expect(toggle(page)).toContainText('Só no branco do olho');
    await setSlider(page, 'Tamanho', 100);
    await sweep(page, clip, 0.44);
    const sclera = await page.screenshot({ clip });
    expect(await changeAt(page, plain, sclera, SCLERA)).toBeGreaterThan(1);
    expect(await changeAt(page, plain, sclera, IRIS)).toBeLessThan(1);
    expect(await changeAt(page, plain, sclera, CHEEK)).toBeLessThan(1);

    await pickTool(page, 'makeup', 'whiten');
    await expect(toggle(page)).toContainText('Só nos dentes');
    await setSlider(page, 'Tamanho', 100);
    await sweep(page, clip, 0.74);
    const teeth = await page.screenshot({ clip });
    expect(await changeAt(page, sclera, teeth, [0, 0.24])).toBeGreaterThan(4);
    expect(await changeAt(page, sclera, teeth, [0, 0.2])).toBeLessThan(1);
    expect(await changeAt(page, sclera, teeth, CHEEK)).toBeLessThan(1);
    const { left, right } = await changedShare(page, sclera, teeth);
    expect(left + right).toBeLessThan(0.02);
  });

  test('em foto com dois rostos o limite vale para os dois', async ({ page }) => {
    await openEditor(page, 'group.png');
    const clip = photo(page, GROUP);
    await pickTool(page, 'eyes', 'eyecolor');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    const plain = await page.screenshot({ clip });
    await setSlider(page, 'Tamanho', 100);
    await sweep(page, clip, 0.46);
    const after = await page.screenshot({ clip });
    await page.screenshot({ path: shot('ui-limite-grupo') });
    const { left, right } = await changedShare(page, plain, after);
    expect(left).toBeGreaterThan(0.001);
    expect(right).toBeGreaterThan(0.001);
    expect(left + right).toBeLessThan(0.03);

    // A stroke that lands nowhere may mean a face was left out, and a finer search is one tap away.
    await expect(page.getByTestId('limit-more')).toHaveCount(0);
    await page.mouse.move(clip.x + clip.width * 0.5, clip.y + clip.height * 0.05);
    await setSlider(page, 'Tamanho', 10);
    await page.mouse.move(clip.x + clip.width * 0.5, clip.y + clip.height * 0.05);
    await page.mouse.down();
    await page.mouse.up();
    await page.getByTestId('limit-more').click();
    await limitSettled(page);
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('boca fechada não tem dentes, e o pincel fica livre', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    const buffer = await closedMouth(page);
    await page.setInputFiles('[data-testid=file-input]', { name: 'boca-fechada.png', mimeType: 'image/png', buffer });
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await settle(page);
    const clip = photo(page);

    await pickTool(page, 'makeup', 'whiten');
    await expect(limit(page, 'no-region')).toBeVisible();
    await expect(page.getByText('Não achei dentes à mostra nesta foto. O pincel está livre.')).toBeVisible();
    await page.screenshot({ path: shot('ui-limite-boca-fechada') });
    const plain = await page.screenshot({ clip });
    await paint(page, scribble(0, 0.245, 0.06, 0.02, 3));
    expect(await changeAt(page, plain, await page.screenshot({ clip }), [0, 0.245])).toBeGreaterThan(2);

    // The eyes of the same photo are still there.
    await pickTool(page, 'eyes', 'eyecolor');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('sem rosto na foto, o pincel fica livre', async ({ page }) => {
    await openEditor(page, 'gradient.png');
    const clip = photo(page, GRADIENT);
    await pickTool(page, 'eyes', 'eyecolor');
    await expect(limit(page, 'no-face')).toBeVisible();
    await expect(page.getByText('Não achei rosto nesta foto. O pincel está livre.')).toBeVisible();
    const plain = await page.screenshot({ clip });
    await page.mouse.move(clip.x + clip.width * 0.2, clip.y + clip.height * 0.62);
    await page.mouse.down();
    await page.mouse.move(clip.x + clip.width * 0.4, clip.y + clip.height * 0.62, { steps: 10 });
    await page.mouse.up();
    await page.mouse.move(2, 2);
    await settle(page, 400);
    expect(await meanDiff(page, plain, await page.screenshot({ clip }))).toBeGreaterThan(0.02);
  });

  test('sem o detector, o pincel fica livre e dá para tentar de novo', async ({ page }) => {
    await page.route(/\.task$/, (route) => route.abort());
    await openEditor(page);
    const clip = photo(page);
    await pickTool(page, 'eyes', 'eyecolor');
    await expect(limit(page, 'failed')).toBeVisible();
    await expect(page.getByText('O detector não carregou. O pincel está livre.')).toBeVisible();
    const plain = await page.screenshot({ clip });
    await paint(page, scribble(CHEEK[0], CHEEK[1], 0.05, 0.03, 3));
    expect(await changeAt(page, plain, await page.screenshot({ clip }), CHEEK)).toBeGreaterThan(2);
    // The failed download and its log line are what this test is about.
    seen.errors.length = 0;

    await page.unroute(/\.task$/);
    await page.getByTestId('limit-retry').click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true', { timeout: 60_000 });
  });

  test('pintar livre não espera o detector', async ({ page }) => {
    await page.route(/\.task$/, async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    });
    await openEditor(page);
    const clip = photo(page);
    await page.locator('[data-group=eyes]').click();
    await page.locator('[data-tool=eyecolor]').click();
    await limit(page, 'searching').waitFor();
    const plain = await page.screenshot({ clip });
    await page.getByTestId('limit-free').click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await paint(page, scribble(CHEEK[0], CHEEK[1], 0.05, 0.03, 3));
    expect(await changeAt(page, plain, await page.screenshot({ clip }), CHEEK)).toBeGreaterThan(2);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true', { timeout: 60_000 });
  });

  test('sair dos filtros para uma ferramenta dos olhos não trava o pincel', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'filters', 'filters');
    await pickTool(page, 'eyes', 'eyecolor');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await pickTool(page, 'filters', 'filters');
    await expect(limit(page, 'on')).toHaveCount(0);
    await pickTool(page, 'eyes', 'sparkle');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
  });

  test('o projeto salvo não guarda rosto nem limite, e reabrir acha tudo de novo', async ({ page }) => {
    await openEditor(page);
    const clip = photo(page);
    await pickTool(page, 'eyes', 'eyecolor');
    await setSlider(page, 'Tamanho', 75);
    await paint(page, [
      [IRIS[0] - 0.03, IRIS[1]],
      [IRIS[0] + 0.03, IRIS[1]],
    ]);
    const painted = await page.screenshot({ clip });
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
    expect(saved.masks).toEqual(['eyecolor']);
    expect(saved.doc).not.toMatch(/outline|irises|innerLips|outerLips|landmark|region/i);

    await page.getByRole('button', { name: /^Continuar/ }).first().click();
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await settle(page);
    await pickTool(page, 'eyes', 'eyecolor');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await page.mouse.move(2, 2);
    await settle(page, 400);
    expect(await meanDiff(page, painted, await page.screenshot({ clip }))).toBeLessThan(0.05);
  });

  test('foto girada: o limite acompanha o olho', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'frame', 'crop');
    await page.getByRole('button', { name: 'Girar para a direita' }).click();
    await settle(page, 400);
    await pickTool(page, 'eyes', 'eyecolor');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    const size = { w: PORTRAIT.h, h: PORTRAIT.w };
    const r = imageRect(page, size);
    const clip = photo(page, size);
    // A quarter turn to the right takes a point at (x, y) from the center to (-y, x).
    const [ix, iy] = [-IRIS[1] * PORTRAIT.h * r.k, IRIS[0] * PORTRAIT.h * r.k];
    const x = r.x + r.w / 2 + ix;
    const y = r.y + r.h / 2 + iy;
    const plain = await page.screenshot({ clip });
    await setSlider(page, 'Tamanho', 75);
    await page.mouse.move(x, y - 10);
    await page.mouse.down();
    await page.mouse.move(x, y + 10, { steps: 6 });
    await page.mouse.up();
    await page.mouse.move(2, 2);
    await settle(page, 400);
    const { left, right } = await changedShare(page, plain, await page.screenshot({ clip }));
    expect(left + right).toBeGreaterThan(0.0005);
    expect(left + right).toBeLessThan(0.01);
  });
});

test.describe('limite do pincel, celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('o interruptor cabe no painel e o aviso aparece no toque', async ({ page }) => {
    const seen = watch(page);
    await openEditor(page);
    await page.locator('[data-group=eyes]').tap();
    await page.locator('[data-tool=eyecolor]').tap();
    await expect(page.getByText('Só na primeira vez, cerca de 6 MB. A foto não sai do seu aparelho.')).toBeInViewport();
    await expect(page.getByTestId('limit-free')).toBeInViewport();
    await page.screenshot({ path: shot('ui-celular-limite-procurando') });
    await limitSettled(page);
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await expect(toggle(page)).toBeInViewport();
    await settle(page, 400);
    await page.screenshot({ path: shot('ui-celular-limite') });
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(noOverflow).toBe(true);
    expectNoErrors(seen.errors);
  });
});
