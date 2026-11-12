import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { setSlider, settle } from './helpers';

/** The dev server, so that the page can read the document of the editor it is running. */
test.use({ baseURL: DEV_ORIGIN });

interface LightDoc {
  light: { id: string; intensity: number } | null;
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

const shot = (name: string) => `docs/visual-checks/${name}.png`;

/** Opens a photo up to the screen of choice. */
async function openToChoice(page: Page, fixture = 'portrait.png'): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('glowup.onboarded', 'true');
    // The completion of what warps uncover has nothing to do here.
    localStorage.setItem('glowup.fill', 'off');
  });
  await page.goto('/');
  await page.setInputFiles('[data-testid=file-input]', `tests/fixtures/${fixture}`);
  await page.getByTestId('path-choice').waitFor({ timeout: 90_000 });
  await expect(page.getByTestId('opening')).toHaveCount(0);
}

/** The Luzes tab of the filters, among their categories. */
async function openLights(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Luzes' }).click();
  await page.getByTestId('lights').waitFor();
}

/** Opens a photo in the Filtros path, on the Luzes tab. */
async function openFilterLights(page: Page, fixture = 'portrait.png'): Promise<void> {
  await openToChoice(page, fixture);
  await page.locator('[data-path=filters]').click();
  await page.getByTestId('filters-menu').waitFor();
  await settle(page, 300);
  await openLights(page);
}

async function openGlow(page: Page): Promise<void> {
  await openToChoice(page);
  await page.locator('[data-path=glow]').click();
  await page.getByTestId('looks').waitFor();
  await settle(page, 300);
}

const switchPath = async (page: Page, id: string) => {
  await page.getByTestId('path-switch').click();
  await page.locator(`[data-path=${id}]`).click();
  await expect(page.getByTestId('path-choice')).toHaveCount(0);
};

async function tapLight(page: Page, id: string): Promise<void> {
  await page.locator(`[data-light=${id}]`).click();
  await expect(page.getByTestId('lights')).toHaveAttribute('data-state', 'idle', { timeout: 120_000 });
  await settle(page, 300);
}

async function tapLook(page: Page, id: string): Promise<void> {
  await page.locator(`[data-look=${id}]`).click();
  await expect(page.locator(`[data-look=${id}]`)).not.toHaveClass(/wearing/, { timeout: 120_000 });
  await expect(page.getByTestId('looks')).toHaveAttribute('data-state', 'idle', { timeout: 120_000 });
  await settle(page, 300);
}

/** The two models that read the scene, as the page asks for them. */
function watchSceneModels(page: Page): string[] {
  const models: string[] = [];
  page.on('request', (request) => {
    const name = /(depth_anything_v2_small|modnet)[^/]*\.onnx/.exec(request.url())?.[1];
    if (name) models.push(name);
  });
  return models;
}

test.describe('Luzes', () => {
  test('as quatro luzes ficam nos Filtros, numa aba ao lado das categorias, e o Glow na Hora só tem looks', async ({ page }) => {
    await openGlow(page);
    await expect(page.locator('[data-look]').first()).toBeVisible();
    await expect(page.locator('[data-light]')).toHaveCount(0);
    await expect(page.getByRole('radiogroup', { name: 'Prateleira' })).toHaveCount(0);

    await switchPath(page, 'filters');
    await page.getByTestId('filters-menu').waitFor();
    await expect(page.locator('[data-filter]').first()).toBeVisible();
    await expect(page.locator('[data-light]')).toHaveCount(0);

    await openLights(page);
    await expect(page.locator('[data-light]')).toHaveCount(4);
    await expect(page.locator('[data-light] .name')).toHaveText(['Néon', 'Contraluz Dourado', 'Brasa', 'Flash Analógico']);
    await expect(page.locator('[data-filter]')).toHaveCount(0);
    await expect(page.getByTestId('lights')).toHaveAttribute('data-scene', 'idle');
    // Nothing was looked for and nothing changed yet.
    expect(await lightDoc(page)).toMatchObject({ light: null, scene: false, depth: 0 });

    await page.getByRole('tab', { name: 'Todos' }).click();
    await expect(page.locator('[data-filter]').first()).toBeVisible();
    await expect(page.locator('[data-light]')).toHaveCount(0);

    // The same tab is in the filters of Do Meu Jeito.
    await switchPath(page, 'manual');
    await page.locator('[data-group=filters]').click();
    await openLights(page);
    await expect(page.locator('[data-light]')).toHaveCount(4);
  });

  test('um toque lê a cena e refaz a luz, numa etapa do desfazer, e o segundo toque tira', async ({ page }) => {
    await openFilterLights(page);
    const before = await measure(page);

    await tapLight(page, 'flash-analogico');
    await expect(page.getByTestId('lights')).toHaveAttribute('data-scene', 'ready');
    await expect(page.locator('[data-light=flash-analogico]')).toHaveAttribute('aria-pressed', 'true');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'flash-analogico', intensity: 1 }, scene: true, depth: 1, label: 'Luz' });
    // The flash: what is behind goes dark and the face gets brighter.
    const lit = await measure(page);
    expect(lit.back).toBeLessThan(before.back * 0.5);
    expect(lit.face).toBeGreaterThan(before.face + 8);
    // Every tile now shows its light on this photo.
    await expect(page.locator('[data-light] canvas.ready')).toHaveCount(4, { timeout: 30_000 });
    // The tab says a light is on, whichever tab shows.
    await expect(page.getByRole('tab', { name: 'Luzes' })).toHaveClass(/lit/);

    // Another light takes the place of the first, with the scene already there.
    await tapLight(page, 'contraluz-dourado');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'contraluz-dourado' }, depth: 2 });
    const behind = await measure(page);
    expect(behind.face).toBeLessThan(before.face);

    await tapLight(page, 'contraluz-dourado');
    await expect(page.locator('[data-light=contraluz-dourado]')).toHaveAttribute('aria-pressed', 'false');
    expect(await lightDoc(page)).toMatchObject({ light: null, scene: true, depth: 3 });
    const off = await measure(page);
    expect(await shotDiff(page, before.shot, off.shot)).toBe(0);
    await expect(page.getByRole('tab', { name: 'Luzes' })).not.toHaveClass(/lit/);

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page, 300);
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'contraluz-dourado' }, depth: 2 });
    await expect(page.locator('[data-light=contraluz-dourado]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a intensidade vai de nada até a luz inteira, e solta numa etapa só', async ({ page }) => {
    await openFilterLights(page);
    await expect(page.getByRole('slider', { name: 'Intensidade' })).toHaveCount(0);
    const before = await measure(page);
    await tapLight(page, 'noite-de-festa');
    const full = await measure(page);

    await setSlider(page, 'Intensidade', 40);
    await settle(page, 300);
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'noite-de-festa', intensity: 0.4 }, depth: 2, label: 'Luz' });
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

  test('uma luz e um filtro ficam juntos, cada um com a sua intensidade', async ({ page }) => {
    await openFilterLights(page);
    await tapLight(page, 'neon');
    await page.getByRole('tab', { name: 'Todos' }).click();
    await page.locator('[data-filter=prata]').click();
    await settle(page, 400);
    await setSlider(page, 'Intensidade', 50);
    await settle(page, 300);
    const doc = (await page.evaluate(`(async () => {
      const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
      const { light, filter } = engine().doc;
      return { light, filter: { id: filter.id, intensity: filter.intensity } };
    })()`)) as { light: unknown; filter: unknown };
    expect(doc).toEqual({ light: { id: 'neon', intensity: 1 }, filter: { id: 'prata', intensity: 0.5 } });
    // Taking the filter off leaves the light.
    await page.locator('[data-filter=prata]').click();
    await settle(page, 300);
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'neon', intensity: 1 } });
  });

  test('uma luz e um look ficam juntos, e tirar o look deixa a luz', async ({ page }) => {
    await openGlow(page);
    await tapLook(page, 'natural');
    expect((await lightDoc(page)).look).toBe('natural');

    await switchPath(page, 'filters');
    await openLights(page);
    await tapLight(page, 'neon');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'neon' }, look: 'natural' });

    await switchPath(page, 'glow');
    await expect(page.locator('[data-look=natural]')).toHaveAttribute('aria-pressed', 'true');
    // The light is of Luzes, not of the look, so the look shows no slider for it.
    await expect(page.getByRole('slider', { name: 'Luz do look' })).toHaveCount(0);
    await tapLook(page, 'natural');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'neon' }, look: null });
  });

  test('o arquivo sai igual em qualquer grade de tiles, com grão e vazamento', async ({ page }) => {
    await openFilterLights(page);
    for (const id of ['flash-analogico', 'contraluz-dourado', 'noite-de-festa', 'neon']) {
      await tapLight(page, id);
      const whole = await measure(page);
      const tiled = await measure(page, 384);
      expect(await shotDiff(page, whole.shot, tiled.shot), id).toBeLessThan(0.6);
    }
  });

  test('o projeto salvo abre com a luz, nos Filtros e na aba dela, sem baixar detector nem modelo', async ({ page }) => {
    await openFilterLights(page);
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

    await expect(page.getByTestId('path-switch')).toContainText('Filtros');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'contraluz-dourado', intensity: 1 }, scene: true });
    await expect(page.locator('[data-light=contraluz-dourado]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('lights')).toHaveAttribute('data-scene', 'ready');
    const reopened = await measure(page);
    expect(await shotDiff(page, saved.shot, reopened.shot)).toBeLessThan(0.05);
    expect(models).toEqual([]);
  });

  test('o projeto salvo com uma luz que saiu do menu abre sem luz', async ({ page }) => {
    await openFilterLights(page);
    await tapLight(page, 'neon');
    // A project of before: one of the six lights that left, with the date it printed.
    await page.evaluate(`(async () => {
      const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
      const e = engine();
      e.setLight('flash-direto', 0.8);
      e.doc.light.stamp = '31/07/2026';
      e.commit();
    })()`);
    await settle(page, 300);
    const before = await measure(page);

    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await page.getByRole('button', { name: /Continuar/ }).first().click();
    // With the light gone the project holds no edit, so the photo asks how to go on, as a new one does.
    await page.getByTestId('path-choice').waitFor({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await settle(page, 500);
    expect(await lightDoc(page)).toMatchObject({ light: null });
    const reopened = await measure(page);
    // A light the app does not know drew nothing before, and draws nothing now.
    expect(await shotDiff(page, before.shot, reopened.shot)).toBeLessThan(0.05);
  });

  test('foto sem ninguém: a luz entra mesmo assim, e cai no que a foto tem', async ({ page }) => {
    await openFilterLights(page, 'gradient.png');
    const before = await measure(page);
    await tapLight(page, 'flash-analogico');
    await expect(page.getByTestId('lights')).toHaveAttribute('data-scene', 'ready');
    await expect(page.getByText('Não achei ninguém nesta foto')).toHaveCount(0);
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'flash-analogico' }, scene: true, depth: 1 });
    const lit = await measure(page);
    expect(await shotDiff(page, before.shot, lit.shot)).toBeGreaterThan(1);
  });

  test('a cena lê a profundidade e o recorte da pessoa, com os dois modelos, e a luz não deixa pontos soltos', async ({ page }) => {
    const models = watchSceneModels(page);
    await openFilterLights(page);
    expect(models).toEqual([]);
    await tapLight(page, 'noite-de-festa');
    // The dev server asks for each file twice: once for its address and once for its bytes.
    expect([...new Set(models)].sort()).toEqual(['depth_anything_v2_small', 'modnet']);

    const scene = (await page.evaluate(`(async () => {
      const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
      const s = engine().scene;
      const at = (u, v) => (Math.floor(v * s.h) * s.w + Math.floor(u * s.w)) * 4;
      return {
        cells: s.w * s.h,
        bytes: s.data.length,
        floats: s.field.length,
        long: Math.max(s.w, s.h),
        faceMatte: s.data[at(0.5, 0.55)],
        cornerMatte: s.data[at(0.03, 0.03)],
        faceDepth: s.field[at(0.5, 0.55)],
        cornerFront: s.field[at(0.03, 0.03)],
        cornerBehind: s.field[at(0.03, 0.03) + 1],
        finite: s.field.every(Number.isFinite),
      };
    })()`)) as Record<string, number | boolean>;
    expect(scene.long).toBe(1024);
    expect(scene.bytes).toBe((scene.cells as number) * 4);
    expect(scene.floats).toBe((scene.cells as number) * 4);
    expect(scene.finite).toBe(true);
    // The person is the matte, and the light is aimed at their depth.
    expect(scene.faceMatte).toBe(255);
    expect(scene.cornerMatte).toBe(0);
    expect(scene.faceDepth as number).toBeGreaterThan(0.8);
    expect(scene.faceDepth as number).toBeLessThan(1.25);
    // The wall is farther than the face, on both sides of the edge.
    expect(scene.cornerFront as number).toBeLessThan(0.8);
    expect(scene.cornerBehind as number).toBeLessThan(0.8);

    // The dark background of a night is even: no point of it stands far above the rest, as a speck of dust would.
    const specks = (await page.evaluate(`(async () => {
      const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
      const { renderImage } = await import(/* @vite-ignore */ '/src/core/export.ts');
      const canvas = await renderImage(engine(), { tile() {} });
      const { width: w, height: h } = canvas;
      const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
      const lumas = [];
      for (let y = 0; y < h * 0.12; y++) for (let x = 0; x < w * 0.12; x++) {
        const i = (y * w + x) * 4;
        lumas.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      }
      lumas.sort((a, b) => a - b);
      return { median: lumas[lumas.length >> 1], top: lumas[lumas.length - 1] };
    })()`)) as { median: number; top: number };
    expect(specks.top - specks.median).toBeLessThan(24);
  });

  test('Voltar ao original tira a luz, e o desfazer traz de volta', async ({ page }) => {
    await openFilterLights(page);
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

test.describe('looks com luz', () => {
  test('o Glow na Hora tem dez looks, e um look sem luz não baixa os modelos da cena', async ({ page }) => {
    const models = watchSceneModels(page);
    await openGlow(page);
    await expect(page.locator('[data-look]')).toHaveCount(10);
    await expect(page.locator('[data-look][data-lit]')).toHaveCount(4);
    await tapLook(page, 'olhar');
    expect(await lightDoc(page)).toMatchObject({ light: null, scene: false, depth: 1, label: 'Look', look: 'olhar' });
    expect(models).toEqual([]);
  });

  test('um look com luz lê a cena no toque, entra numa etapa só, e o segundo toque tira o look e a luz dele', async ({ page }) => {
    const models = watchSceneModels(page);
    await openGlow(page);
    expect(models).toEqual([]);
    const before = await measure(page);

    await tapLook(page, 'retrato');
    expect([...new Set(models)].sort()).toEqual(['depth_anything_v2_small', 'modnet']);
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'look-retrato', intensity: 1 }, scene: true, depth: 1, label: 'Look', look: 'retrato' });
    await expect(page.locator('[data-look=retrato]')).toHaveAttribute('aria-pressed', 'true');
    // The background steps back a little, and no more than a little.
    const lit = await measure(page);
    expect(lit.back).toBeLessThan(before.back - 2);
    expect(lit.back).toBeGreaterThan(before.back * 0.6);

    // The light of the look has a strength of its own, and the look stays on while it moves.
    await setSlider(page, 'Luz do look', 0);
    await settle(page, 300);
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'look-retrato', intensity: 0 }, depth: 2, look: 'retrato' });
    const unlit = await measure(page);
    expect(unlit.back).toBeGreaterThan(lit.back + 2);
    await setSlider(page, 'Luz do look', 100);
    await settle(page, 300);

    await tapLook(page, 'retrato');
    await expect(page.locator('[data-look][aria-pressed=true]')).toHaveCount(0);
    expect(await lightDoc(page)).toMatchObject({ light: null, look: null });
    const off = await measure(page);
    expect(await shotDiff(page, before.shot, off.shot)).toBe(0);

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page, 300);
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'look-retrato' }, look: 'retrato' });
  });

  test('a luz troca com o look: outro look com luz põe a dele, e um look sem luz tira', async ({ page }) => {
    await openGlow(page);
    await tapLook(page, 'luz-de-vela');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'look-vela' }, look: 'luz-de-vela', depth: 1 });
    await expect(page.getByRole('slider', { name: 'Luz do look' })).toBeVisible();

    await tapLook(page, 'luz-de-janela');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'look-janela' }, look: 'luz-de-janela', depth: 2 });

    await tapLook(page, 'natural');
    expect(await lightDoc(page)).toMatchObject({ light: null, look: 'natural', depth: 3 });
    await expect(page.getByRole('slider', { name: 'Luz do look' })).toHaveCount(0);
  });

  test('o projeto salvo com um look de luz abre no Glow na Hora, com o look aceso e sem baixar modelo', async ({ page }) => {
    await openGlow(page);
    await tapLook(page, 'fim-de-tarde');
    const saved = await measure(page);

    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    const models: string[] = [];
    page.on('request', (request) => {
      if (/\.(task|tflite|onnx)(\?|$)/.test(request.url())) models.push(request.url());
    });
    await page.getByRole('button', { name: /Continuar/ }).first().click();
    await page.getByTestId('looks').waitFor({ timeout: 90_000 });
    await settle(page, 500);
    await expect(page.locator('[data-look=fim-de-tarde]')).toHaveAttribute('aria-pressed', 'true');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'look-dourado', intensity: 1 }, scene: true, look: 'fim-de-tarde' });
    const reopened = await measure(page);
    expect(await shotDiff(page, saved.shot, reopened.shot)).toBeLessThan(0.05);
    expect(models).toEqual([]);
  });

  test('nos Filtros, a aba Luzes diz que a luz é de um look, e deixa tirar ou trocar', async ({ page }) => {
    await openGlow(page);
    await tapLook(page, 'retrato');
    await switchPath(page, 'filters');
    await openLights(page);
    await expect(page.getByTestId('look-light')).toBeVisible();
    await expect(page.locator('[data-light][aria-pressed=true]')).toHaveCount(0);

    // A light of the menu takes the place of the light of the look, at full strength.
    await setSlider(page, 'Intensidade', 30);
    await settle(page, 300);
    await tapLight(page, 'neon');
    expect(await lightDoc(page)).toMatchObject({ light: { id: 'neon', intensity: 1 }, look: null });
    await expect(page.getByTestId('look-light')).toHaveCount(0);

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page, 300);
    await page.getByTestId('look-light').getByRole('button', { name: 'Tirar a luz' }).click();
    await settle(page, 300);
    expect(await lightDoc(page)).toMatchObject({ light: null });
  });
});

test.describe('telas das luzes e dos looks', () => {
  test('a aba Luzes dos Filtros e o look com luz, no computador', async ({ page }) => {
    await openFilterLights(page);
    await tapLight(page, 'noite-de-festa');
    await expect(page.locator('[data-light] canvas.ready')).toHaveCount(4, { timeout: 30_000 });
    await settle(page, 600);
    await page.screenshot({ path: shot('ui-filtros-luzes') });

    await page.locator('[data-light=noite-de-festa]').click();
    await settle(page, 300);
    await switchPath(page, 'glow');
    await page.getByTestId('looks').waitFor();
    await tapLook(page, 'luz-de-vela');
    await expect(page.getByRole('slider', { name: 'Luz do look' })).toBeVisible();
    await settle(page, 900);
    await page.screenshot({ path: shot('ui-looks-luz') });
  });

  test.describe('celular', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    test('as luzes e os looks cabem na tela, com a intensidade ao alcance', async ({ page }) => {
      await openFilterLights(page);
      await tapLight(page, 'neon');
      await expect(page.locator('[data-light] canvas.ready')).toHaveCount(4, { timeout: 30_000 });
      await settle(page, 600);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const slider = await page.getByRole('slider', { name: 'Intensidade' }).boundingBox();
      expect(slider!.y + slider!.height).toBeLessThanOrEqual(844);
      await page.screenshot({ path: shot('ui-celular-filtros-luzes') });

      await page.locator('[data-light=neon]').click();
      await settle(page, 300);
      await switchPath(page, 'glow');
      await page.getByTestId('looks').waitFor();
      await tapLook(page, 'retrato');
      await settle(page, 900);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const light = await page.getByRole('slider', { name: 'Luz do look' }).boundingBox();
      expect(light!.y + light!.height).toBeLessThanOrEqual(844);
      await page.screenshot({ path: shot('ui-celular-looks-luz') });
    });
  });
});
