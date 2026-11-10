import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { expectNoErrors, meanDiff, openEditor, PORTRAIT, setSlider, settle, showSettled, imageRect, limitSettled } from './helpers';

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

async function openShape(page: Page, tool = 'faceshape'): Promise<void> {
  await page.locator('[data-group=shape]').click();
  await page.locator(`[data-tool=${tool}]`).click();
  await expect(page.locator('[data-shape=on]')).toHaveCount(1, { timeout: 60_000 });
  await showSettled(page);
  await settle(page, 300);
}

/**
 * Exports a PNG and compares it with one taken before. Every pixel outside the person counts, with no band left
 * out: the result says how many of them changed, how far from the head the farthest one is, and how many of
 * the changed ones the head now covers, which is the head growing and not the background moving. Distances
 * come with the length of the face, because what goes along with a face is measured in faces.
 */
const COMPARE = `
  async function shot() {
    const { exportImage } = await import(/* @vite-ignore */ '/src/core/export.ts');
    const blob = await exportImage(e, { format: 'image/png', quality: 1 }, { tile() {}, encoding() {} });
    const bitmap = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = c.getContext('2d');
    g.drawImage(bitmap, 0, 0);
    return g.getImageData(0, 0, bitmap.width, bitmap.height);
  }
  async function compare(a, b) {
    const { PERSON_MASK, HEAD_MASK } = await import(/* @vite-ignore */ '/src/core/doc.ts');
    const { distanceTo } = await import(/* @vite-ignore */ '/src/core/face/complete.ts');
    const person = await e.masks.read(PERSON_MASK);
    const head = await e.masks.read(HEAD_MASK);
    const mw = e.masks.w;
    const mh = e.masks.h;
    const solid = new Uint8Array(mw * mh);
    for (let i = 0; i < solid.length; i++) solid[i] = head[i] > 127 ? 1 : 0;
    const toHead = distanceTo(solid, mw, mh);
    // Where the head ends up over a pixel, the pixel is covered: read the matte where the field reads the photo,
    // and the cells around, because the edge of the head covers a pixel in part.
    const covered = (u, v) => {
      const [du, dv] = e.field.lookup(u, v);
      const cx = Math.floor((u + du) * mw);
      const cy = Math.floor((v + dv) * mh);
      for (let y = Math.max(0, cy - 2); y <= Math.min(mh - 1, cy + 2); y++) {
        for (let x = Math.max(0, cx - 2); x <= Math.min(mw - 1, cx + 2); x++) if (head[y * mw + x] > 8) return true;
      }
      return false;
    };
    const { chosenFace: faceNow } = await import(/* @vite-ignore */ '/src/ui/shapepick.svelte.ts');
    const { CHIN } = await import(/* @vite-ignore */ '/src/core/face/scan.ts');
    const outline = faceNow().outline;
    const face = Math.hypot((outline[CHIN][0] - outline[0][0]) * a.width, (outline[CHIN][1] - outline[0][1]) * a.height);
    const out = { background: 0, changed: 0, coveredByHead: 0, farthest: 0, body: 0, bodyChanged: 0, bodyFarthest: 0, headChanged: 0, face };
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const o = (y * a.width + x) * 4;
        const changed = a.data[o] !== b.data[o] || a.data[o + 1] !== b.data[o + 1] || a.data[o + 2] !== b.data[o + 2];
        const u = (x + 0.5) / a.width;
        const v = (y + 0.5) / a.height;
        const cell = Math.floor(v * mh) * mw + Math.floor(u * mw);
        if (person[cell] <= 8) {
          out.background++;
          if (!changed) continue;
          if (covered(u, v)) out.coveredByHead++;
          else {
            out.changed++;
            out.farthest = Math.max(out.farthest, toHead[cell] * (a.width / mw));
          }
        } else if (head[cell] === 0) {
          out.body++;
          if (changed && !covered(u, v)) {
            out.bodyChanged++;
            out.bodyFarthest = Math.max(out.bodyFarthest, toHead[cell] * (a.width / mw));
          }
        } else if (changed) {
          out.headChanged++;
        }
      }
    }
    return out;
  }
`;

interface Compared {
  background: number;
  changed: number;
  coveredByHead: number;
  farthest: number;
  body: number;
  bodyChanged: number;
  bodyFarthest: number;
  headChanged: number;
  face: number;
}

test.describe('o menu Formato do rosto', () => {
  test('tem nome inteiro na barra e quatro ferramentas', async ({ page }) => {
    await openEditor(page);
    const group = page.locator('[data-group=shape]');
    await expect(group).toHaveText('Formato do rosto');
    await group.click();
    for (const [tool, label] of [['faceshape', 'Rosto'], ['eyeshape', 'Olhos'], ['noseshape', 'Nariz e boca'], ['liquify', 'Liquify']]) {
      await expect(page.locator(`[data-tool=${tool}]`)).toHaveText(label);
    }
    const fits = async () => group.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(await fits()).toBe(true);
    await page.setViewportSize({ width: 375, height: 760 });
    await settle(page, 300);
    expect(await fits()).toBe(true);
    const box = (await group.boundingBox())!;
    expect(box.width).toBeGreaterThan(40);
    expect(box.height).toBeLessThan(70);
  });
});

test.describe('o fundo travado', () => {
  for (const [name, id, value] of [
    ['alargar a mandíbula', 'jawline', 100],
    ['estreitar a mandíbula', 'jawline', -100],
    ['subir o queixo', 'chin', -100],
    ['diminuir a cabeça', 'head', -100],
    ['aumentar a cabeça', 'head', 100],
  ] as const) {
    test(`${name} mexe na cabeça e no que vai com ela: o fundo e o corpo mais longe ficam, pixel por pixel`, async ({ page }) => {
      const errors = watch(page);
      await openEditor(page);
      await openShape(page);
      await expect(page.getByTestId('lock-note')).toHaveText(/Fundo travado/);
      const result = await inPage<Compared>(
        page,
        `${COMPARE}
        const before = await shot();
        const { placeOf, chosenFace } = await import(/* @vite-ignore */ '/src/ui/shapepick.svelte.ts');
        e.setShapeValue(placeOf(e, chosenFace()), '${id}', ${value});
        e.commit();
        const after = await shot();
        return compare(before, after);`,
      );
      expect(result.background).toBeGreaterThan(1000);
      expect(result.headChanged).toBeGreaterThan(100);
      // No band is left out of the count. What changes outside the person is the edge the head left, around
      // hair the ground its loose ends reach, and beside the neck what its edge covers or uncovers when it goes
      // along with the jaw. None of it is further from the head than a neck follows, and it is little.
      expect(result.face).toBeGreaterThan(PORTRAIT.h * 0.3);
      expect(result.farthest).toBeLessThan(result.face * 0.35);
      expect(result.changed).toBeLessThan(result.background * 0.03);
      // Past where a neck goes along with a face, a third of a face from the head, the body is where it was,
      // to the pixel. The fixture has bare shoulders right under the jaw, and most of them are past that.
      expect(result.body).toBeGreaterThan(1000);
      expect(result.bodyFarthest).toBeLessThan(result.face * 0.35);
      expect(result.bodyChanged).toBeLessThan(result.body * 0.08);
      expectNoErrors(errors);
    });
  }

  test('o pincel do Liquify traz a chave ligada: no fundo não mexe, com ela desligada mexe', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await page.locator('[data-group=shape]').click();
    await page.locator('[data-tool=liquify]').click();
    await limitSettled(page);
    const toggle = page.getByTestId('lock-toggle');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('lock-note')).toHaveText(/o pincel só mexe na pessoa/);

    // A corner of the photo, far from the person.
    const r = imageRect(page);
    const stroke = async () => {
      await page.mouse.move(r.x + 10, r.y + 12);
      await page.mouse.down();
      await page.mouse.move(r.x + 50, r.y + 30, { steps: 10 });
      await page.mouse.up();
      await page.mouse.move(2, 2);
      await settle(page, 400);
    };
    const clip = { x: r.x + 4, y: r.y + 4, width: 70, height: 40 };
    const before = await page.screenshot({ clip });
    await stroke();
    expect(await meanDiff(page, before, await page.screenshot({ clip }))).toBeLessThan(0.02);
    expect(await inPage<boolean>(page, 'return e.field.brushEmpty();')).toBe(false);

    // The same stroke, already in the field, now shows.
    await toggle.click();
    await settle(page, 300);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('lock-note')).toHaveText(/o pincel mexe em tudo/);
    expect(await inPage<boolean | undefined>(page, 'return e.doc.unlocked;')).toBe(true);
    expect(await meanDiff(page, before, await page.screenshot({ clip }))).toBeGreaterThan(0.05);

    // One step of the undo.
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page, 300);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expectNoErrors(errors);
  });

  test('sem pessoa na foto, o painel diz e o pincel continua livre', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page, 'gradient.png');
    await page.locator('[data-group=shape]').click();
    await page.locator('[data-tool=liquify]').click();
    await expect(page.locator('[data-limit=no-face]')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByTestId('lock-note')).toHaveText(/Não achei uma pessoa/);
    expect(await inPage<boolean>(page, 'return e.locking;')).toBe(false);
    expectNoErrors(errors);
  });

  test('sem separar o fundo, o painel diz o que acontece, e o tamanho da cabeça sai', async ({ page }) => {
    const errors = watch(page);
    // Only the model itself: on the dev server the address of the file is a module of the same name.
    await page.route(/selfie_multiclass[^?]*\.tflite$/, (route) => route.abort());
    await openEditor(page);
    await openShape(page);
    await expect(page.getByTestId('lock-note')).toHaveText(/não carregou.*o fundo perto do rosto mexe junto.*cabeça fica desligado/);
    await expect(page.getByRole('slider', { name: 'Tamanho da cabeça' })).toHaveCount(0);
    // The others still work, on a plain warp.
    await setSlider(page, 'Linha da mandíbula', -50);
    await settle(page, 200);
    expect(await inPage<boolean>(page, 'return e.doc.hasField;')).toBe(true);
    await expect(page.getByTestId('lock-retry')).toBeVisible();
    // The console error of the aborted file is the point of this test.
    expect(errors.filter((text) => !text.includes('download-failed') && !text.includes('Failed to fetch') && !text.includes('ERR_FAILED'))).toEqual([]);
  });
});

/**
 * Reported on real photos: a narrower jaw left the neck at its old width, with a step where the two meet. The
 * fixture has no neck to show, so these tests say which part of it is one: the lower part of the face becomes
 * bare skin of the body, and the layers are built from that.
 */
test.describe('o pescoço acompanha o rosto', () => {
  /** Builds the layers by hand: the person as found, a head that ends at a row of the face, and what covers the body from another row down. */
  const LAYERS = `
    let chosen;
    async function layers(headUntil, coveredFrom) {
      const { PERSON_MASK } = await import(/* @vite-ignore */ '/src/core/doc.ts');
      const { coverMatte } = await import(/* @vite-ignore */ '/src/core/face/person.ts');
      const { chosenFace } = await import(/* @vite-ignore */ '/src/ui/shapepick.svelte.ts');
      chosen = chosenFace;
      const person = await e.masks.read(PERSON_MASK);
      const w = e.masks.w;
      const h = e.masks.h;
      const box = chosenFace().box;
      const row = (share) => Math.round((box.y + box.h * share) * h);
      const head = new Uint8Array(w * h);
      const covered = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const at = y * w + x;
          if (y < row(headUntil)) head[at] = person[at];
          if (coveredFrom !== null && y >= row(coveredFrom) && person[at] > 127) covered[at] = 1;
        }
      }
      e.setLayers({ person, head, mouth: null, cover: coverMatte(person, head, covered, w, h) });
      return { w, h, rows: [row(headUntil), coveredFrom === null ? h : row(coveredFrom)], box };
    }
    /**
     * The largest difference between two pictures over some rows, and how many pixels differ at all. Only the
     * middle half of the face counts: skin from side to side, away from the edge of the person, where a soft
     * matte and the ground behind it have a say of their own.
     */
    function apart(a, b, y0, y1) {
      const box = chosen().box;
      const x0 = Math.round((box.x + box.w * 0.25) * a.width);
      const x1 = Math.round((box.x + box.w * 0.75) * a.width);
      let most = 0;
      let count = 0;
      for (let y = Math.max(0, y0); y < Math.min(a.height, y1); y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * a.width + x) * 4;
          const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]));
          if (d > most) most = d;
          if (d > 0) count++;
        }
      }
      return { most, count };
    }
  `;

  for (const [name, value] of [['mais estreita', -100], ['mais larga', 100]] as const) {
    test(`com a mandíbula ${name}, a pele do corpo logo abaixo vai junto, sem degrau entre as duas`, async ({ page }) => {
      const errors = watch(page);
      await openEditor(page);
      await openShape(page);
      const result = await inPage<{ seam: { most: number; count: number }; moved: { most: number; count: number }; head: boolean }>(
        page,
        `${COMPARE}${LAYERS}
        const { placeOf, chosenFace } = await import(/* @vite-ignore */ '/src/ui/shapepick.svelte.ts');
        const before = await shot();
        const at = placeOf(e, chosenFace());
        // The head ends above the jaw, and all below it is bare skin of the body.
        const { h, rows } = await layers(0.7, null);
        e.setShapeValue(at, 'jawline', ${value});
        e.commit();
        const split = await shot();
        const head = !!e.field.headTex;
        await e.undo();
        // The same move with the whole person as one head: what no layer could tear.
        await layers(2, null);
        e.setShapeValue(at, 'jawline', ${value});
        e.commit();
        const whole = await shot();
        const k = before.height / h;
        const y0 = Math.round((rows[0] - 40) * k);
        const y1 = Math.round((rows[0] + 220) * k);
        return { seam: apart(split, whole, y0, y1), moved: apart(split, before, y0, y1), head };`,
      );
      // The jaw moved there, a lot of it.
      expect(result.moved.count).toBeGreaterThan(5000);
      expect(result.moved.most).toBeGreaterThan(40);
      // And where the head ends and the body starts, the picture is what it would be with no line between them.
      expect(result.seam.most).toBeLessThanOrEqual(2);
      // The jaw asks for no share of its own: head and body read the same field.
      expect(result.head).toBe(false);
      expectNoErrors(errors);
    });
  }

  test('o que cobre o corpo fica onde está, pixel por pixel, e a pele acima dele acompanha', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    const result = await inPage<{ covered: { most: number; count: number }; skin: { most: number; count: number }; follows: boolean }>(
      page,
      `${COMPARE}${LAYERS}
      const { placeOf, chosenFace } = await import(/* @vite-ignore */ '/src/ui/shapepick.svelte.ts');
      const before = await shot();
      // A collar across the lower face: skin of the body above it, and cloth from there down.
      const { h, rows } = await layers(0.7, 0.88);
      e.setShapeValue(placeOf(e, chosenFace()), 'jawline', -100);
      e.commit();
      const after = await shot();
      const k = before.height / h;
      // A few cells into the collar, past its soft edge.
      return {
        covered: apart(after, before, Math.round((rows[1] + 4) * k), before.height),
        skin: apart(after, before, Math.round(rows[0] * k), Math.round((rows[1] - 30) * k)),
        follows: e.following,
      };`,
    );
    expect(result.follows).toBe(true);
    expect(result.covered.count).toBe(0);
    expect(result.skin.count).toBeGreaterThan(2000);
    expectNoErrors(errors);
  });

  test('o tamanho da cabeça mexe só na cabeça, e leva o pescoço onde ele encosta nela', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    const result = await inPage<{ head: boolean; far: { most: number; count: number }; near: { most: number; count: number } }>(
      page,
      `${COMPARE}${LAYERS}
      const { placeOf, chosenFace } = await import(/* @vite-ignore */ '/src/ui/shapepick.svelte.ts');
      const before = await shot();
      const { h, rows, box } = await layers(0.7, null);
      e.setShapeValue(placeOf(e, chosenFace()), 'head', -100);
      e.commit();
      const after = await shot();
      const k = before.height / h;
      // Just under where the head ends the body goes along. A face further down it is where it was.
      const below = Math.round((box.y + box.h * 1.45) * before.height);
      return { head: !!e.field.headTex, near: apart(after, before, Math.round(rows[0] * k), Math.round((rows[0] + 60) * k)), far: apart(after, before, below, before.height) };`,
    );
    expect(result.head).toBe(true);
    expect(result.near.count).toBeGreaterThan(2000);
    expect(result.far.count).toBe(0);
    expectNoErrors(errors);
  });
});

test.describe('a troca de ferramenta', () => {
  test('sair de uma ferramenta enquanto o separador do fundo baixa não dá erro', async ({ page }) => {
    const errors = watch(page);
    // The file of the model arrives late, so the next tool starts its search while the load is still going.
    let asked: () => void = () => undefined;
    const reached = new Promise<void>((done) => (asked = done));
    await page.route(/selfie_multiclass[^?]*\.tflite$/, async (route) => {
      asked();
      await new Promise((done) => setTimeout(done, 1500));
      await route.continue();
    });
    await openEditor(page);
    await page.locator('[data-group=shape]').click();
    await page.locator('[data-tool=liquify]').click();
    await reached;
    await page.locator('[data-group=light]').click();
    await page.locator('[data-tool=adjust]').click();
    await expect(page.locator('[data-limit=on]')).toHaveCount(1, { timeout: 60_000 });
    await settle(page, 2500);
    expectNoErrors(errors);
  });
});

test.describe('os controles', () => {
  const doc = (page: Page) =>
    inPage<{ shapes: { at: number[]; values: Record<string, number> }[] | undefined; has: boolean; max: number; depth: number; label: string | null; off: string[] | undefined }>(
      page,
      `return { shapes: e.doc.shapes, has: e.doc.hasField, max: e.field?.maxDisplacement() ?? 0, depth: e.history.depth, label: e.history.undoLabel, off: e.doc.shapesOff };`,
    );

  test('cada gesto é uma etapa, e mover várias vezes não acumula erro', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    await setSlider(page, 'Linha da mandíbula', 40);
    await settle(page, 200);
    const first = await doc(page);
    expect(first).toMatchObject({ has: true, depth: 1, label: 'Formato do rosto' });
    expect(first.shapes![0].values).toEqual({ jawline: 40 });
    const pixels = () => inPage<number[]>(page, 'return Array.from(e.field.serialize().slice(0, 4)).concat(e.field.lookup(0.3, 0.6), e.field.lookup(0.7, 0.6));');
    const looks = await pixels();

    for (const v of [90, -70, 5]) await setSlider(page, 'Linha da mandíbula', v);
    await setSlider(page, 'Linha da mandíbula', 40);
    await settle(page, 200);
    expect(await pixels()).toEqual(looks);

    await setSlider(page, 'Linha da mandíbula', 80);
    await settle(page, 200);
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page, 300);
    expect(await pixels()).toEqual(looks);
    await expect(page.getByRole('slider', { name: 'Linha da mandíbula' })).toHaveValue('40');
    expectNoErrors(errors);
  });

  /** The field as it stands, and the field the page works out by itself at once from the same numbers. */
  const fieldAgainstPage = (page: Page) =>
    inPage<{ same: boolean; cells: number; pending: boolean }>(
      page,
      `const a = e.field.shapeData()?.slice() ?? null;
      const pending = e.shapePending;
      e.syncShape();
      const b = e.field.shapeData();
      let diff = 0;
      if (a && b) for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
      return { same: (!a && !b) || (!!a && !!b && a.length === b.length && diff === 0), cells: a?.length ?? 0, pending };`,
    );

  test('arrastar não trava: o controle segue o mouse, a foto mostra um rascunho, e o resultado final é o mesmo', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    await inPage(page, `window.__seen = []; e.on({ shaping: (p) => window.__seen.push(p) });`);
    // A slow processor, so values come faster than their fields.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const input = page.getByRole('slider', { name: 'Linha da mandíbula', exact: true });
    const box = (await input.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    for (let k = 1; k <= 24; k++) await page.mouse.move(box.x + box.width / 2 + (box.width * 0.4 * k) / 24, y);
    // The thumb is where the mouse is the moment the move is taken, whatever the field is doing.
    const value = Number(await input.inputValue());
    expect(value).toBeGreaterThan(60);
    await page.mouse.up();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await settle(page, 200);

    const seen = await page.evaluate(() => (window as unknown as { __seen: boolean[] }).__seen);
    expect(seen[0]).toBe(true);
    expect(seen[seen.length - 1]).toBe(false);
    await expect(page.getByTestId('shape-pending')).toHaveCount(0);
    // A burst of values within one frame, as a fast finger gives: those that came while the workers were busy
    // are dropped, and only the latest is worked out in full.
    const { started, bands, slots } = await inPage<{ started: number; bands: number; slots: number }>(
      page,
      `const jobs = e.shaper.jobs;
      const from = jobs.started;
      const el = document.querySelector('input[aria-label="Linha da mandíbula"]');
      for (let v = 20; v <= 80; v += 2) {
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      await e.shapeReady();
      return { started: jobs.started - from, bands: jobs.o.bands, slots: jobs.o.slots };`,
    );
    // One rough task on each worker that was free, and the latest value with its bands. Nothing else.
    expect(started).toBeLessThanOrEqual(slots + bands + 1);
    await settle(page, 200);
    const after = await fieldAgainstPage(page);
    expect(after).toMatchObject({ same: true, pending: false });
    expect(after.cells).toBeGreaterThan(0);
    expect((await inPage<{ jawline: number }>(page, 'return e.doc.shapes[0].values;')).jawline).toBe(80);
    expectNoErrors(errors);
  });

  test('desfazer com o campo a caminho deixa o que o desfazer pede, sem resto do valor antigo', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    await setSlider(page, 'Linha da mandíbula', 30);
    await settle(page, 200);
    const before = await inPage<number[]>(page, 'return e.field.lookup(0.3, 0.6).concat(e.field.lookup(0.7, 0.6));');
    // A new value, and the undo before its field is in: the workers' late answers must not come back.
    await setSlider(page, 'Linha da mandíbula', -90);
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page, 400);
    expect(await inPage<number[]>(page, 'return e.field.lookup(0.3, 0.6).concat(e.field.lookup(0.7, 0.6));')).toEqual(before);
    expect(await fieldAgainstPage(page)).toMatchObject({ same: true, pending: false });
    await expect(page.getByRole('slider', { name: 'Linha da mandíbula' })).toHaveValue('30');
    expectNoErrors(errors);
  });

  test('o pincel continua por cima, e um controle não apaga o traço', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    await setSlider(page, 'Linha da mandíbula', 60);
    await settle(page, 200);
    await inPage(page, `e.applyFieldScript({ strokes: [{ mode: 'push', radius: 0.05, strength: 0.8, path: [[0.45, 0.5], [0.55, 0.5]] }] }, 'Liquify');`);
    const strokes = () => inPage<number[]>(page, 'return Array.from(e.field.serialize().subarray(0, 8)).concat([e.field.serialize().reduce((a, b) => a + Math.abs(b), 0)]);');
    const held = await strokes();
    expect(held[8]).toBeGreaterThan(0);
    await setSlider(page, 'Linha da mandíbula', -60);
    await settle(page, 200);
    expect(await strokes()).toEqual(held);
    expectNoErrors(errors);
  });

  test('o segundo toque desliga, o terceiro liga igual, e Zerar volta ao original', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page, 'eyeshape');
    const button = page.locator('[data-tool=eyeshape]');
    await expect(button).toHaveAttribute('data-effect', 'off');
    await setSlider(page, 'Tamanho', 70);
    await settle(page, 200);
    await expect(button).toHaveAttribute('data-effect', 'on');
    const on = await doc(page);

    await button.click();
    await settle(page, 200);
    await expect(button).toHaveAttribute('data-effect', 'off');
    const off = await doc(page);
    expect(off.off).toEqual(['eyes']);
    expect(off.has).toBe(false);
    // The number stays, for the next tap.
    expect(off.shapes![0].values.eyeSize).toBe(70);
    await expect(page.getByRole('slider', { name: 'Tamanho' })).toHaveValue('70');

    await button.click();
    await settle(page, 200);
    await expect(button).toHaveAttribute('data-effect', 'on');
    expect((await doc(page)).max).toBeCloseTo(on.max, 5);

    await page.getByTestId('reset-group').click();
    await settle(page, 300);
    expect(await doc(page)).toMatchObject({ has: false, max: 0, label: 'Zerar Formato do rosto' });
    expect((await doc(page)).shapes).toBeUndefined();
    await expect(page.getByRole('slider', { name: 'Tamanho' })).toHaveValue('0');

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page, 300);
    expect((await doc(page)).max).toBeCloseTo(on.max, 5);
    await expect(page.getByRole('slider', { name: 'Tamanho' })).toHaveValue('70');
    expectNoErrors(errors);
  });

  test('o nariz não entra sozinho: tudo no zero, e só mexe se a pessoa mexer', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page, 'noseshape');
    for (const name of ['Largura do nariz', 'Ponte do nariz', 'Comprimento do nariz', 'Ponta do nariz']) {
      await expect(page.getByRole('slider', { name })).toHaveValue('0');
    }
    expect((await doc(page)).has).toBe(false);
    expectNoErrors(errors);
  });

  test('em foto de grupo cada rosto tem seus números, e só o escolhido mexe', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page, 'group.png');
    await openShape(page);
    const chips = page.getByTestId('shape-face');
    const count = await chips.count();
    expect(count).toBeGreaterThan(1);
    await chips.nth(0).click();
    await setSlider(page, 'Tamanho da cabeça', 80);
    await settle(page, 200);
    await chips.nth(1).click();
    await settle(page, 200);
    await expect(page.getByRole('slider', { name: 'Tamanho da cabeça' })).toHaveValue('0');
    await setSlider(page, 'Linha da mandíbula', -80);
    await settle(page, 200);
    const { shapes } = await doc(page);
    expect(shapes).toHaveLength(2);
    expect(shapes![0].values).toEqual({ head: 80 });
    expect(shapes![1].values).toEqual({ jawline: -80 });
    await chips.nth(0).click();
    await expect(page.getByRole('slider', { name: 'Tamanho da cabeça' })).toHaveValue('80');
    expectNoErrors(errors);
  });

  test('a papada aparece só quando dá para ver, e a tela diz por quê', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    const slider = await page.getByRole('slider', { name: 'Papada' }).count();
    const note = await page.getByTestId('chin-note').count();
    expect(slider + note).toBe(1);
    if (note) await expect(page.getByTestId('chin-note')).toHaveText(/Papada: /);
    expectNoErrors(errors);
  });

  test('sem rosto, o painel diz e o Liquify segue', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page, 'gradient.png');
    await page.locator('[data-group=shape]').click();
    await page.locator('[data-tool=faceshape]').click();
    await expect(page.locator('[data-shape=no-face]')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByText(/Não achei rosto nesta foto. Estes controles precisam dele/)).toBeVisible();
    expectNoErrors(errors);
  });

  test('a detecção desenha linhas finas, e nada disso vai para a exportação', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    await page.getByTestId('detect-toggle').click();
    await expect(page.getByTestId('detect-lines')).toBeVisible();
    expect(await inPage<boolean>(page, 'return e.showMatteLine;')).toBe(true);
    const same = await inPage<boolean>(
      page,
      `${COMPARE}
      const on = await shot();
      e.showMatteLine = false;
      const off = await shot();
      e.showMatteLine = true;
      return on.data.every((v, i) => v === off.data[i]);`,
    );
    expect(same).toBe(true);
    // Another tool ends it.
    await page.locator('[data-tool=eyeshape]').click();
    await settle(page, 300);
    expect(await inPage<boolean>(page, 'return e.showMatteLine;')).toBe(false);
    expectNoErrors(errors);
  });

  test('a exportação mostra o que a tela mostra, em qualquer grade de tiles', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    const compared = await inPage<number>(
      page,
      `${COMPARE}
      const { placeOf, chosenFace } = await import(/* @vite-ignore */ '/src/ui/shapepick.svelte.ts');
      e.setShapeValue(placeOf(e, chosenFace()), 'head', -70);
      e.setShapeValue(placeOf(e, chosenFace()), 'jawline', -40);
      e.commit();
      const whole = await shot();
      localStorage.setItem('glowup.tile', '512');
      const tiled = await shot();
      localStorage.removeItem('glowup.tile');
      let sum = 0;
      for (let i = 0; i < whole.data.length; i++) sum += Math.abs(whole.data[i] - tiled.data[i]);
      return sum / whole.data.length;`,
    );
    // The same limit as the test of the tile grid with every tool on.
    expect(compared).toBeLessThan(0.6);
    expectNoErrors(errors);
  });

  test('o projeto salvo volta igual, sem detector, com os números e o fundo travado', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    await setSlider(page, 'Tamanho da cabeça', -80);
    await settle(page, 300);
    const saved = await doc(page);
    await page.keyboard.press('Escape');
    await settle(page, 300);
    const r = imageRect(page);
    const clip = { x: r.x, y: r.y, width: r.w, height: r.h };
    const edited = await page.screenshot({ clip });
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await expect(page.getByText('De onde parou')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /Continuar/ }).first().click();
    await page.locator('[data-group=skin]').waitFor();
    await settle(page, 1500);
    expect(await meanDiff(page, edited, await page.screenshot({ clip }))).toBeLessThan(0.15);
    const back = await doc(page);
    expect(back.shapes).toEqual(saved.shapes);
    expect(back.has).toBe(true);
    expect(back.max).toBeCloseTo(saved.max, 4);
    expect(await inPage<boolean>(page, 'return e.locking;')).toBe(true);

    // Opening the menu finds the face again, and the same number keeps the same result.
    await openShape(page);
    await expect(page.getByRole('slider', { name: 'Tamanho da cabeça' })).toHaveValue('-80');
    expect((await doc(page)).max).toBeCloseTo(saved.max, 4);
    expectNoErrors(errors);
  });
});

test.describe('o que fica atrás de quem se mexe', () => {
  test('é completado em segundo plano, com progresso e tempo, e dá para cancelar e retomar', async ({ page }) => {
    test.setTimeout(480_000);
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    // The tests hold it back. The panel then says the quick guess is in use and offers the real thing.
    await expect(page.locator('[data-fill=off]')).toHaveCount(1);
    await expect(page.getByTestId('fill-note')).toHaveText(/Preenchimento rápido/);
    const quick = await inPage<number[]>(page, 'return Array.from(e.plateData().head.slice(0, 4000000));');
    await page.getByTestId('fill-start').click();
    const card = page.locator('[data-fill] [role=progressbar]');
    await expect(card).toBeVisible({ timeout: 120_000 });
    // Nobody waits for it: a slider moves while the model works.
    await setSlider(page, 'Linha da mandíbula', 60);
    expect(await inPage<boolean>(page, 'return e.doc.hasField;')).toBe(true);
    await expect(page.locator('[data-fill=running]')).toHaveCount(1, { timeout: 240_000 });
    await expect(card).toContainText(/cerca de \d+ (s|min)/, { timeout: 120_000 });
    await page.getByTestId('fill-cancel').click();
    await expect(page.locator('[data-fill=off]')).toHaveCount(1);
    await settle(page, 500);
    // Stopped halfway, the plate is still the quick guess.
    const stopped = await inPage<number[]>(page, 'return Array.from(e.plateData().head.slice(0, 4000000));');
    expect(stopped).toEqual(quick);
    await page.getByTestId('fill-start').click();
    await expect(page.locator('[data-fill=done]')).toHaveCount(1, { timeout: 420_000 });
    const result = await inPage<{ changed: number; outside: number }>(
      page,
      `const data = e.plateData();
      const quick = ${JSON.stringify([])};
      void quick;
      let changed = 0;
      let outside = 0;
      const { HEAD_MASK } = await import(/* @vite-ignore */ '/src/core/doc.ts');
      const head = await e.masks.read(HEAD_MASK);
      const { source } = e;
      const photo = source.draw(0, 0, source.w, source.h, data.w, data.h).getContext('2d').getImageData(0, 0, data.w, data.h).data;
      for (let i = 0; i < data.w * data.h; i++) {
        const same = data.head[i * 4] === photo[i * 4] && data.head[i * 4 + 1] === photo[i * 4 + 1] && data.head[i * 4 + 2] === photo[i * 4 + 2];
        if (data.head[i * 4 + 3] === 0) {
          // Where no layer was, the finished plate is the photo, to the bit.
          if (!same) outside++;
        } else if (head[i] > 127 && !same) {
          changed++;
        }
      }
      return { changed, outside };`,
    );
    expect(result.outside).toBe(0);
    expect(result.changed).toBeGreaterThan(1000);
    const done = await inPage<number[]>(page, 'return Array.from(e.plateData().head.slice(0, 4000000));');
    expect(done).not.toEqual(quick);
    expectNoErrors(errors);
  });
});

test.describe('o aviso do tamanho do download', () => {
  /** A network of about 6 MB per second, so a download lasts long enough to say how long it will take. */
  const slowNetwork = async (page: Page) => {
    const session = await page.context().newCDPSession(page);
    await session.send('Network.emulateNetworkConditions', { offline: false, latency: 10, downloadThroughput: 6_000_000, uploadThroughput: 6_000_000 });
  };

  for (const [device, userAgent, sized] of [
    ['no celular diz o tamanho', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', true],
    ['no computador não fala em tamanho', '', false],
  ] as const) {
    test.describe(device, () => {
      // The hint of the browser goes with the user agent, as on a real phone.
      if (userAgent) test.use({ userAgent, isMobile: true });

      test('ao separar a pessoa do fundo e ao baixar o modelo de preenchimento, e o tempo que falta aparece', async ({ page }) => {
        test.setTimeout(300_000);
        const errors = watch(page);
        await openEditor(page);
        await slowNetwork(page);
        await page.locator('[data-group=shape]').click();
        await page.locator('[data-tool=faceshape]').click();
        const search = page.locator('[data-shape=searching]');
        await expect(search.locator('[role=progressbar]')).toBeVisible({ timeout: 60_000 });
        await expect(search).toContainText('A foto não sai do seu aparelho');
        if (sized) await expect(search).toContainText(/cerca de 22 MB: melhor no Wi-Fi/);
        else await expect(search).not.toContainText('MB');
        // Nobody waits blind: a download says how long it still takes, from the speed it has had.
        await expect(search).toContainText(/Baixando [^,]+, cerca de \d+ (s|min)/, { timeout: 60_000 });
        await expect(page.locator('[data-shape=on]')).toHaveCount(1, { timeout: 120_000 });
        await page.getByTestId('fill-start').click();
        const card = page.locator('[data-fill=download]');
        await expect(card).toHaveCount(1, { timeout: 30_000 });
        await expect(card).toContainText('Baixa uma vez');
        if (sized) await expect(card).toContainText(/cerca de 29 MB: melhor no Wi-Fi/);
        else await expect(card).not.toContainText('MB');
        await expect(card).toContainText(/Baixando o modelo de preenchimento, cerca de \d+ (s|min)/, { timeout: 60_000 });
        // Starting the model has no count of its own, so it says how long it took before.
        await expect(card).toContainText(/Ligando o modelo, cerca de \d+ s/, { timeout: 120_000 });
        await page.getByTestId('fill-cancel').click();
        await expect(page.locator('[data-fill=off]')).toHaveCount(1);
        expectNoErrors(errors);
      });
    });
  }
});
