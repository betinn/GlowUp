import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { chooseMode, expectNoErrors, imageRect, meanDiff, openEditor, paint, setSlider, settle, showSettled, skipIntro } from './helpers';

/** The dev server serves each module by address, so a test can read the document itself. */
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

/** Opens a tool of its menu and waits until the automatic mode is done, or the photo says it cannot be. */
async function openTool(page: Page, group: string, tool: string, state = 'on'): Promise<void> {
  await page.locator(`[data-group=${group}]`).click();
  const button = page.locator(`[data-tool=${tool}]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(page.locator(`[data-limit=${state}]`)).toHaveCount(1, { timeout: 60_000 });
  await showSettled(page);
  await settle(page, 300);
}

/** Only the photo: the panels around it change with the tool. Skips its top, where notes show over it. */
function photo(page: Page): Promise<Buffer> {
  const r = imageRect(page);
  return page.screenshot({ clip: { x: r.x, y: r.y + 60, width: r.w, height: r.h - 60 } });
}

const undoButton = (page: Page) => page.getByRole('button', { name: 'Desfazer' });
const undo = async (page: Page) => {
  await undoButton(page).click();
  await settle(page, 300);
};

/** The fixture portrait, one stop and a half too dark. */
async function openDark(page: Page): Promise<void> {
  await skipIntro(page);
  await page.goto('/');
  const base64 = readFileSync('tests/fixtures/portrait.png').toString('base64');
  const dark = await page.evaluate(async (png) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.filter = 'brightness(0.5)';
    g.drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  }, base64);
  await page.setInputFiles('[data-testid=file-input]', { name: 'escura.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(dark, 'base64') });
  await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
  await expect(page.getByTestId('opening')).toHaveCount(0);
  await settle(page);
}

test.describe('Liquify no Automático', () => {
  const field = (page: Page) =>
    inPage<{ has: boolean; amount: number | undefined; max: number; depth: number; label: string | null }>(
      page,
      `return { has: e.doc.hasField, amount: e.doc.shapeAmount, max: e.field?.maxDisplacement() ?? 0, depth: e.history.depth, label: e.history.undoLabel };`,
    );

  test('molda o rosto numa etapa, com força, e o pincel segue por cima', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await photo(page);
    await openTool(page, 'shape', 'liquify');
    await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'auto');
    await expect(page.locator('[data-tool=liquify]')).toHaveAttribute('data-effect', 'on');
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    await expect(page.getByText(/Aplicado no rosto que achei/)).toBeVisible();
    const first = await field(page);
    expect(first).toMatchObject({ has: true, amount: 50, depth: 1, label: 'Automático' });
    expect(first.max).toBeGreaterThan(0.001);
    // Subtle: well under 1% of the photo, on a face that takes about half of it.
    expect(first.max).toBeLessThan(0.01);
    expect(await meanDiff(page, plain, await photo(page))).toBeGreaterThan(0.02);

    // No brush while in Automático: a drag moves nothing.
    await expect(page.getByRole('radio', { name: 'Empurrar' })).toHaveCount(0);
    await paint(page, [[-0.29, 0.14], [-0.2, 0.14]]);
    expect((await field(page)).depth).toBe(1);

    // The strength replaces what was there, as one more step, and the undo brings it back.
    await setSlider(page, 'Intensidade', 100);
    await settle(page, 400);
    const strong = await field(page);
    expect(strong).toMatchObject({ amount: 100, depth: 2 });
    expect(strong.max / first.max).toBeCloseTo(2, 1);
    await undo(page);
    const back = await field(page);
    expect(back).toMatchObject({ amount: 50, depth: 1 });
    expect(back.max).toBeCloseTo(first.max, 4);
    await expect(page.getByRole('slider', { name: 'Intensidade' })).toHaveValue('50');

    // The brush works on top of it.
    await chooseMode(page, 'Manual');
    await expect(page.getByRole('slider', { name: 'Intensidade' })).toHaveCount(0);
    await paint(page, [[-0.29, 0.14], [-0.2, 0.14]]);
    const brushed = await field(page);
    expect(brushed).toMatchObject({ has: true, depth: 2, label: 'Liquify' });
    expect(brushed.max).toBeGreaterThan(first.max);
    await undo(page);
    expect((await field(page)).max).toBeCloseTo(first.max, 4);
    await page.getByRole('button', { name: 'Refazer' }).click();
    await settle(page, 300);

    // Automático again starts over from the photo, and the undo brings the stroke back.
    await chooseMode(page, 'Automático');
    await settle(page, 400);
    const again = await field(page);
    expect(again.max).toBeCloseTo(first.max, 4);
    expect(again.label).toBe('Automático');
    await undo(page);
    expect((await field(page)).max).toBeCloseTo(brushed.max, 4);
    expectNoErrors(errors);
  });

  test('o segundo toque tira, o terceiro aplica, e Zerar volta ao original', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await photo(page);
    await openTool(page, 'shape', 'liquify');
    const button = page.locator('[data-tool=liquify]');
    const { max } = await field(page);

    await button.click();
    await expect(button).toHaveAttribute('data-effect', 'off');
    await settle(page, 300);
    expect(await field(page)).toMatchObject({ has: false, max: 0, label: 'Limpar' });
    expect(await meanDiff(page, plain, await photo(page))).toBeLessThan(0.1);
    await expect(page.getByRole('slider', { name: 'Intensidade' })).toHaveCount(0);

    await button.click();
    await expect(button).toHaveAttribute('data-effect', 'on');
    await settle(page, 300);
    expect((await field(page)).max).toBeCloseTo(max, 4);

    await setSlider(page, 'Intensidade', 80);
    await settle(page, 300);
    await page.getByTestId('reset-group').click();
    await settle(page, 300);
    expect(await field(page)).toMatchObject({ has: false, max: 0, amount: undefined, label: 'Zerar Formato do rosto' });
    await expect(button).toHaveAttribute('data-effect', 'off');

    await undo(page);
    expect(await field(page)).toMatchObject({ has: true, amount: 80 });

    // Zerar forgets the strength, so the next time starts from the default.
    await page.getByTestId('reset-photo').click();
    await settle(page, 300);
    await page.getByTestId('auto-apply').click();
    await settle(page, 300);
    expect(await field(page)).toMatchObject({ has: true, amount: 50 });
    expectNoErrors(errors);
  });

  test('sem rosto, diz e deixa o pincel', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page, 'gradient.png');
    await openTool(page, 'shape', 'liquify', 'no-face');
    await expect(page.getByText('Não achei rosto nesta foto. O pincel está livre.')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Empurrar' })).toBeVisible();
    expect(await field(page)).toMatchObject({ has: false, depth: 0 });
    expectNoErrors(errors);
  });
});

test.describe('Ajustes no Automático', () => {
  const adjust = (page: Page) => inPage<Record<string, number>>(page, 'return e.doc.adjust;');
  const slider = (page: Page, name: string) => page.getByRole('slider', { name, exact: true });

  test('o tom vem da foto, cai nos controles e dá para refinar', async ({ page }) => {
    const errors = watch(page);
    await openDark(page);
    const plain = await photo(page);
    await openTool(page, 'light', 'adjust');
    await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'auto');
    await expect(page.getByText(/Tom acertado pela foto/)).toBeVisible();
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    const tone = await adjust(page);
    expect(tone.exposure).toBeGreaterThan(10);
    // The same numbers, on the same controls as by hand.
    await expect(slider(page, 'Exposição')).toHaveValue(String(tone.exposure));
    await expect(slider(page, 'Contraste')).toHaveValue(String(tone.contrast));
    await expect(slider(page, 'Temperatura')).toHaveValue(String(tone.temperature));
    await expect(slider(page, 'Tint')).toHaveValue(String(tone.tint));
    expect(await meanDiff(page, plain, await photo(page))).toBeGreaterThan(1);

    await setSlider(page, 'Saturação', 20);
    await settle(page, 300);
    expect(await adjust(page)).toEqual({ ...tone, saturation: 20 });
    await undo(page);
    expect(await adjust(page)).toEqual(tone);
    await undo(page);
    expect((await adjust(page)).exposure).toBe(0);
    await expect(slider(page, 'Exposição')).toHaveValue('0');
    await expect(page.locator('[data-tool=adjust]')).toHaveAttribute('data-effect', 'off');
    expectNoErrors(errors);
  });

  test('o segundo toque tira, o terceiro aplica, e Zerar volta ao original', async ({ page }) => {
    const errors = watch(page);
    await openDark(page);
    await openTool(page, 'light', 'adjust');
    const tone = await adjust(page);
    const button = page.locator('[data-tool=adjust]');

    await button.click();
    await expect(button).toHaveAttribute('data-effect', 'off');
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Limpar');
    expect((await adjust(page)).exposure).toBe(0);
    await button.click();
    await expect(button).toHaveAttribute('data-effect', 'on');
    expect(await adjust(page)).toEqual(tone);

    await page.getByTestId('reset-group').click();
    await settle(page, 300);
    await expect(button).toHaveAttribute('data-effect', 'off');
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Zerar Luz');
    expect((await adjust(page)).exposure).toBe(0);
    await undo(page);
    expect(await adjust(page)).toEqual(tone);
    expectNoErrors(errors);
  });

  test('no Manual o tom fica, e um projeto com ajustes não é trocado ao abrir', async ({ page }) => {
    const errors = watch(page);
    await openDark(page);
    await openTool(page, 'light', 'adjust');
    const tone = await adjust(page);
    await chooseMode(page, 'Manual');
    expect(await adjust(page)).toEqual(tone);
    await setSlider(page, 'Exposição', 5);
    await settle(page, 300);
    await page.locator('[data-tool=blur]').click();
    await settle(page, 300);
    await page.locator('[data-tool=adjust]').click();
    await settle(page, 500);
    await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'manual');
    expect((await adjust(page)).exposure).toBe(5);
    expectNoErrors(errors);
  });

  test('sem rosto, mede a foto toda', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page, 'gradient.png');
    await openTool(page, 'light', 'adjust');
    await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'auto');
    expectNoErrors(errors);
  });
});

test.describe('Desfoque no Automático', () => {
  const blur = (page: Page) => inPage<{ mode: string; cx: number; cy: number; focus: number; feather: number; strength: number }>(page, 'return e.doc.blur;');

  test('o foco vai para o rosto, e o círculo só se move no Manual', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page, 'group.png');
    await openTool(page, 'light', 'blur');
    await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'auto');
    await expect(page.getByText(/Foco no rosto que achei/)).toBeVisible();
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    const auto = await blur(page);
    expect(auto).toMatchObject({ mode: 'radial', strength: 35 });
    expect([auto.cx, auto.cy]).not.toEqual([0.5, 0.5]);
    await expect(page.getByRole('button', { name: 'Mover foco' })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Tilt-shift' })).toHaveCount(0);
    // The controls still refine it.
    await setSlider(page, 'Intensidade', 60);
    await settle(page, 300);
    expect((await blur(page)).strength).toBe(60);

    await chooseMode(page, 'Manual');
    await expect(page.getByRole('button', { name: 'Mover foco' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Tilt-shift' })).toBeVisible();
    expect(await blur(page)).toEqual({ ...auto, strength: 60, angle: 0 });
    expectNoErrors(errors);
  });

  test('o segundo toque tira, o terceiro aplica, e Zerar volta ao original', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await photo(page);
    await openTool(page, 'light', 'blur');
    const first = await blur(page);
    const button = page.locator('[data-tool=blur]');
    expect(await meanDiff(page, plain, await photo(page))).toBeGreaterThan(0.1);

    await button.click();
    await expect(button).toHaveAttribute('data-effect', 'off');
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Limpar');
    expect((await blur(page)).mode).toBe('off');
    await button.click();
    await expect(button).toHaveAttribute('data-effect', 'on');
    expect(await blur(page)).toMatchObject({ mode: 'radial', cx: first.cx, cy: first.cy });

    await page.getByTestId('reset-group').click();
    await settle(page, 300);
    expect(await blur(page)).toMatchObject({ mode: 'off', cx: 0.5, cy: 0.5 });
    await undo(page);
    expect(await blur(page)).toMatchObject({ mode: 'radial', cx: first.cx, cy: first.cy });
    expectNoErrors(errors);
  });

  test('sem rosto, nada muda, a tela diz, e o foco manual fica no centro', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page, 'gradient.png');
    await openTool(page, 'light', 'blur', 'no-face');
    await expect(page.getByText(/Não achei rosto nesta foto. O foco fica no centro/)).toBeVisible();
    expect((await blur(page)).mode).toBe('off');
    await page.getByRole('radio', { name: 'Radial' }).click();
    await settle(page, 300);
    expect(await blur(page)).toMatchObject({ mode: 'radial', cx: 0.5, cy: 0.5 });
    await expect(page.getByRole('button', { name: 'Mover foco' })).toBeVisible();
    expectNoErrors(errors);
  });
});
