import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { setSlider, settle } from './helpers';

/** The dev server, so that the page can read the document of the editor it is running. */
test.use({ baseURL: DEV_ORIGIN });

interface LightDoc {
  light: { id: string; intensity: number; stamp?: string } | null;
  scene: boolean;
  depth: number;
  label: string | null;
  look: string | null;
}

const lightDoc = (page: Page) =>
  page.evaluate(`(async () => {
    const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
    const { appliedLook } = await import(/* @vite-ignore */ '/src/presets/recipes.ts');
    const e = engine();
    return { light: e.doc.light ?? null, scene: !!e.scene, depth: e.history.depth, label: e.history.undoLabel, look: appliedLook(e.doc)?.id ?? null };
  })()`) as Promise<LightDoc>;

/**
 * The photo as the file will hold it, read in the page: the mean brightness of the background at the corners
 * and of the face, and a number that changes with every pixel.
 */
const measure = (page: Page, tile = 0) =>
  page.evaluate(
    `(async () => {
    const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
    const { renderImage } = await import(/* @vite-ignore */ '/src/core/export.ts');
    if (${tile}) localStorage.setItem('glowup.tile', '${tile}');
    const canvas = await renderImage(engine(), { tile() {} });
    localStorage.removeItem('glowup.tile');
    const { width: w, height: h } = canvas;
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const mean = (x0, y0, x1, y1) => {
      let sum = 0, n = 0;
      for (let y = Math.floor(y0 * h); y < y1 * h; y++) for (let x = Math.floor(x0 * w); x < x1 * w; x++) {
        const i = (y * w + x) * 4;
        sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        n++;
      }
      return sum / n;
    };
    window.__shots = window.__shots || [];
    window.__shots.push(data);
    return { back: (mean(0, 0, 0.12, 0.12) + mean(0.88, 0, 1, 0.12)) / 2, face: mean(0.42, 0.36, 0.58, 0.5), shot: window.__shots.length - 1 };
  })()`,
  ) as Promise<{ back: number; face: number; shot: number }>;

/** Mean difference between two photos measured before, on the scale of 0 to 255. */
const shotDiff = (page: Page, a: number, b: number) =>
  page.evaluate(
    ([i, j]) => {
      const shots = (window as unknown as { __shots: Uint8ClampedArray[] }).__shots;
      let sum = 0;
      for (let k = 0; k < shots[i].length; k++) sum += Math.abs(shots[i][k] - shots[j][k]);
      return sum / shots[i].length;
    },
    [a, b],
  );

async function openGlow(page: Page, fixture = 'portrait.png'): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('glowup.onboarded', 'true');
    // The completion of what warps uncover has nothing to do here.
    localStorage.setItem('glowup.fill', 'off');
  });
  await page.goto('/');
  await page.setInputFiles('[data-testid=file-input]', `tests/fixtures/${fixture}`);
  await page.getByTestId('path-choice').waitFor({ timeout: 90_000 });
  await expect(page.getByTestId('opening')).toHaveCount(0);
  await page.locator('[data-path=glow]').click();
  await page.getByTestId('looks').waitFor();
  await settle(page, 300);
}

async function openLights(page: Page): Promise<void> {
  await page.getByRole('radiogroup', { name: 'Prateleira' }).getByRole('radio', { name: 'Luzes' }).click();
  await page.getByTestId('lights').waitFor();
}

async function tapLight(page: Page, id: string): Promise<void> {
  await page.locator(`[data-light=${id}]`).click();
  await expect(page.getByTestId('lights')).toHaveAttribute('data-state', 'idle', { timeout: 120_000 });
  await settle(page, 300);
}

test.describe('Luzes', () => {
  test('a prateleira fica no Glow na Hora, ao lado dos looks, com as dez luzes', async ({ page }) => {
    await openGlow(page);
    await expect(page.locator('[data-look]').first()).toBeVisible();
    await expect(page.locator('[data-light]')).toHaveCount(0);

    await openLights(page);
    await expect(page.locator('[data-light]')).toHaveCount(10);
    await expect(page.locator('[data-look]')).toHaveCount(0);
    await expect(page.getByTestId('lights')).toHaveAttribute('data-scene', 'idle');
    // Nothing was looked for and nothing changed yet.
    expect(await lightDoc(page)).toMatchObject({ light: null, scene: false, depth: 0 });

    await page.getByRole('radiogroup', { name: 'Prateleira' }).getByRole('radio', { name: 'Looks' }).click();
    await expect(page.locator('[data-look]').first()).toBeVisible();
  });

  test('um toque acha a pessoa e refaz a luz, numa etapa do desfazer, e o segundo toque tira', async ({ page }) => {
    await openGlow(page);
    await openLights(page);
    const before = await measure(page);

    await tapLight(page, 'flash-direto');
    await expect(page.getByTestId('lights')).toHaveAttribute('data-scene', 'ready');
    await expect(page.locator('[data-light=flash-direto]')).toHaveAttribute('aria-pressed', 'true');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'flash-direto', intensity: 1 }, scene: true, depth: 1, label: 'Luz' });
    // The flash: what is behind goes dark and the face gets brighter.
    const lit = await measure(page);
    expect(lit.back).toBeLessThan(before.back * 0.5);
    expect(lit.face).toBeGreaterThan(before.face + 8);
    // Every tile now shows its light on this photo.
    await expect(page.locator('[data-light] canvas.ready')).toHaveCount(10, { timeout: 30_000 });

    // Another light takes the place of the first, with the scene already there.
    await tapLight(page, 'contraluz');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'contraluz' }, depth: 2 });
    const behind = await measure(page);
    expect(behind.face).toBeLessThan(before.face);

    await tapLight(page, 'contraluz');
    await expect(page.locator('[data-light=contraluz]')).toHaveAttribute('aria-pressed', 'false');
    expect(await lightDoc(page)).toMatchObject({ light: null, scene: true, depth: 3 });
    const off = await measure(page);
    expect(await shotDiff(page, before.shot, off.shot)).toBe(0);

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page, 300);
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'contraluz' }, depth: 2 });
    await expect(page.locator('[data-light=contraluz]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a intensidade vai de nada até a luz inteira, e solta numa etapa só', async ({ page }) => {
    await openGlow(page);
    await openLights(page);
    await expect(page.getByRole('slider', { name: 'Intensidade' })).toHaveCount(0);
    const before = await measure(page);
    await tapLight(page, 'entardecer');
    const full = await measure(page);

    await setSlider(page, 'Intensidade', 40);
    await settle(page, 300);
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'entardecer', intensity: 0.4 }, depth: 2, label: 'Luz' });
    const part = await measure(page);
    expect(part.back).toBeGreaterThan(full.back + 3);
    expect(part.back).toBeLessThan(before.back - 1);

    await setSlider(page, 'Intensidade', 0);
    await settle(page, 300);
    const none = await measure(page);
    expect(await shotDiff(page, before.shot, none.shot)).toBe(0);

    // The strength chosen stays for the next light.
    await setSlider(page, 'Intensidade', 60);
    await tapLight(page, 'neon');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'neon', intensity: 0.6 } });
  });

  test('uma luz e um look ficam juntos, e tirar o look deixa a luz', async ({ page }) => {
    await openGlow(page);
    await page.locator('[data-look]').first().click();
    await expect(page.getByTestId('looks')).toHaveAttribute('data-state', 'idle', { timeout: 120_000 });
    await settle(page, 300);
    const look = (await lightDoc(page)).look;
    expect(look).not.toBeNull();

    await openLights(page);
    await tapLight(page, 'luz-de-estudio');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'luz-de-estudio' }, look });

    await page.getByRole('radiogroup', { name: 'Prateleira' }).getByRole('radio', { name: 'Looks' }).click();
    await page.locator(`[data-look=${look}]`).click();
    await expect(page.getByTestId('looks')).toHaveAttribute('data-state', 'idle', { timeout: 120_000 });
    await settle(page, 300);
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'luz-de-estudio' }, look: null });
  });

  test('o arquivo sai igual em qualquer grade de tiles, com grão, poeira, vazamento e data', async ({ page }) => {
    await openGlow(page);
    await openLights(page);
    for (const id of ['analogica', 'flash-analogico', 'silhueta', 'neon']) {
      await tapLight(page, id);
      const whole = await measure(page);
      const tiled = await measure(page, 384);
      expect(await shotDiff(page, whole.shot, tiled.shot), id).toBeLessThan(0.6);
    }
    // The light that prints the date keeps the day it went on.
    await tapLight(page, 'analogica');
    expect((await lightDoc(page)).light?.stamp).toMatch(/^\d\d\/\d\d\/\d{4}$/);
  });

  test('o projeto salvo abre com a luz, na prateleira dela, sem baixar o detector', async ({ page }) => {
    await openGlow(page);
    await openLights(page);
    await tapLight(page, 'contraluz-dourado');
    const saved = await measure(page);

    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    const models: string[] = [];
    page.on('request', (request) => {
      if (/\.(task|tflite|onnx)(\?|$)/.test(request.url())) models.push(request.url());
    });
    await page.getByRole('button', { name: /Continuar/ }).first().click();
    await page.getByTestId('lights').waitFor({ timeout: 90_000 });
    await settle(page, 500);

    expect(await lightDoc(page)).toMatchObject({ light: { id: 'contraluz-dourado', intensity: 1 }, scene: true });
    await expect(page.locator('[data-light=contraluz-dourado]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('lights')).toHaveAttribute('data-scene', 'ready');
    const reopened = await measure(page);
    expect(await shotDiff(page, saved.shot, reopened.shot)).toBeLessThan(0.05);
    expect(models).toEqual([]);
  });

  test('foto sem ninguém: a luz não entra e a prateleira diz por quê', async ({ page }) => {
    await openGlow(page, 'gradient.png');
    await openLights(page);
    await tapLight(page, 'flash-direto');
    await expect(page.getByTestId('lights')).toHaveAttribute('data-scene', 'nobody');
    await expect(page.getByText('Não achei ninguém nesta foto')).toBeVisible();
    expect(await lightDoc(page)).toMatchObject({ light: null, scene: false, depth: 0 });
  });

  test('Voltar ao original tira a luz, e o desfazer traz de volta', async ({ page }) => {
    await openGlow(page);
    await openLights(page);
    await tapLight(page, 'neon');
    const reset = await page.evaluate(`(async () => {
      const { resetPhoto } = await import(/* @vite-ignore */ '/src/ui/reset.ts');
      await resetPhoto();
    })()`);
    expect(reset).toBeUndefined();
    await settle(page, 300);
    expect(await lightDoc(page)).toMatchObject({ light: null, scene: true });
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page, 300);
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'neon' } });
  });
});
