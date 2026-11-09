import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { expectNoErrors, meanDiff, openEditor, setSlider, settle, showSettled, imageRect, limitSettled } from './helpers';

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

/** Exports a PNG and compares it with one taken before, over the pixels that are background for sure. */
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
    const { PERSON_MASK } = await import(/* @vite-ignore */ '/src/core/doc.ts');
    const matte = await e.masks.read(PERSON_MASK);
    const mw = e.masks.w;
    const mh = e.masks.h;
    // A band around the person belongs to the plate. Past it, nothing may change.
    const room = Math.max(3, Math.round(Math.max(mw, mh) * 0.006)) + 4;
    const near = new Uint8Array(mw * mh);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (!matte || !matte[y * mw + x]) continue;
        const y0 = Math.max(0, y - room);
        const y1 = Math.min(mh - 1, y + room);
        const x0 = Math.max(0, x - room);
        const x1 = Math.min(mw - 1, x + room);
        for (const yy of [y0, y1]) near.fill(1, yy * mw + x0, yy * mw + x1 + 1);
        for (let yy = y0; yy <= y1; yy++) near.fill(1, yy * mw + x0, yy * mw + x1 + 1);
      }
    }
    let background = 0;
    let moved = 0;
    let person = 0;
    let personMoved = 0;
    // A person that grows over a pixel covers it. That is not the background moving, so those are left out.
    const covered = (u, v) => {
      const [du, dv] = e.field.lookup(u, v);
      const cx = Math.floor((u + du) * mw);
      const cy = Math.floor((v + dv) * mh);
      for (let yy = Math.max(0, cy - 2); yy <= Math.min(mh - 1, cy + 2); yy++) {
        for (let xx = Math.max(0, cx - 2); xx <= Math.min(mw - 1, cx + 2); xx++) if (matte && matte[yy * mw + xx]) return true;
      }
      return false;
    };
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const o = (y * a.width + x) * 4;
        const changed = a.data[o] !== b.data[o] || a.data[o + 1] !== b.data[o + 1] || a.data[o + 2] !== b.data[o + 2];
        const cell = Math.floor((y / a.height) * mh) * mw + Math.floor((x / a.width) * mw);
        if (near[cell] || covered((x + 0.5) / a.width, (y + 0.5) / a.height)) {
          person++;
          if (changed) personMoved++;
        } else {
          background++;
          if (changed) moved++;
        }
      }
    }
    return { background, moved, person, personMoved };
  }
`;

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
  test('um controle deixa cada pixel do fundo igual, e o rosto muda', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    await expect(page.getByTestId('lock-note')).toHaveText(/Fundo travado/);
    const result = await inPage<{ background: number; moved: number; person: number; personMoved: number }>(
      page,
      `${COMPARE}
      const before = await shot();
      const { placeOf, chosenFace } = await import(/* @vite-ignore */ '/src/ui/shapepick.svelte.ts');
      e.setShapeValue(placeOf(e, chosenFace()), 'jawline', -100);
      e.commit();
      const after = await shot();
      return compare(before, after);`,
    );
    expect(result.background).toBeGreaterThan(1000);
    expect(result.moved).toBe(0);
    expect(result.personMoved).toBeGreaterThan(100);
    expectNoErrors(errors);
  });

  test('diminuir a cabeça deixa o fundo igual, e a área revelada vem do fundo', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openShape(page);
    const result = await inPage<{ background: number; moved: number; personMoved: number }>(
      page,
      `${COMPARE}
      const before = await shot();
      const { placeOf, chosenFace } = await import(/* @vite-ignore */ '/src/ui/shapepick.svelte.ts');
      e.setShapeValue(placeOf(e, chosenFace()), 'head', -100);
      e.commit();
      const after = await shot();
      return compare(before, after);`,
    );
    expect(result.moved).toBe(0);
    expect(result.personMoved).toBeGreaterThan(1000);
    expectNoErrors(errors);
  });

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
    await page.route(/selfie_segmenter[^?]*\.tflite$/, (route) => route.abort());
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

test.describe('a troca de ferramenta', () => {
  test('sair de uma ferramenta enquanto o separador do fundo baixa não dá erro', async ({ page }) => {
    const errors = watch(page);
    // The file of the model arrives late, so the next tool starts its search while the load is still going.
    let asked: () => void = () => undefined;
    const reached = new Promise<void>((done) => (asked = done));
    await page.route(/selfie_segmenter[^?]*\.tflite$/, async (route) => {
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
