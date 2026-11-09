import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { chooseMode, facePoint, paint, pickTool, settle } from './helpers';

/** The dev server, so that the page can read the document of the editor it is running. */
test.use({ baseURL: DEV_ORIGIN });

interface DocState {
  depth: number;
  label: string | null;
  painted: string[];
  exposure: number;
  filter: string | null;
}

const docState = (page: Page) =>
  page.evaluate(`(async () => {
    const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
    const e = engine();
    return {
      depth: e.history.depth,
      label: e.history.undoLabel,
      painted: Object.keys(e.doc.layers).filter((id) => e.doc.layers[id].painted).sort(),
      exposure: e.doc.adjust.exposure,
      filter: e.doc.filter.id,
    };
  })()`) as Promise<DocState>;

const GLOW = ['blush', 'highlight', 'smooth'];
const EDITORIAL = ['contour', 'smooth', 'sparkle'];

/** Opens a photo up to the screen of choice, with the cards out of the way unless asked. */
async function openToChoice(page: Page, fixture = 'portrait.png', cards = false): Promise<void> {
  if (!cards) await page.addInitScript(() => localStorage.setItem('glowup.onboarded', 'true'));
  await page.goto('/');
  await page.setInputFiles('[data-testid=file-input]', `tests/fixtures/${fixture}`);
  await page.getByTestId('path-choice').waitFor({ timeout: 90_000 });
  await expect(page.getByTestId('opening')).toHaveCount(0);
}

async function openGlow(page: Page, fixture = 'portrait.png'): Promise<void> {
  await openToChoice(page, fixture);
  await page.locator('[data-path=glow]').click();
  await page.getByTestId('looks').waitFor();
  await settle(page, 300);
}

async function tapLook(page: Page, id: string): Promise<void> {
  await page.locator(`[data-look=${id}]`).click();
  await expect(page.getByTestId('looks')).toHaveAttribute('data-state', 'idle', { timeout: 90_000 });
  await settle(page, 300);
}

const switchPath = async (page: Page, id: string) => {
  await page.getByTestId('path-switch').click();
  await page.locator(`[data-path=${id}]`).click();
  await expect(page.getByTestId('path-choice')).toHaveCount(0);
};

test.describe('tela de escolha', () => {
  test('a foto abre na escolha, e cada caminho traz o seu menu', async ({ page }) => {
    await openToChoice(page);
    await expect(page.locator('[data-path]')).toHaveCount(2);
    await expect(page.locator('[data-group]')).toHaveCount(0);

    await page.locator('[data-path=manual]').click();
    await expect(page.getByTestId('path-choice')).toHaveCount(0);
    await expect(page.locator('[data-group=skin]')).toBeVisible();
    await expect(page.getByTestId('path-switch')).toContainText('Do Meu Jeito');
    await expect(page.locator('[data-look]')).toHaveCount(0);
    // The tool of recipes is gone with the look menu in its place.
    await page.locator('[data-group=looks]').click();
    await expect(page.locator('[data-tool=presets]')).toHaveCount(0);

    // A question that can go unanswered: Escape leaves everything as it was.
    await page.getByTestId('path-switch').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('path-choice')).toHaveCount(0);
    await expect(page.locator('[data-group=skin]')).toBeVisible();

    await switchPath(page, 'glow');
    await expect(page.getByTestId('path-switch')).toContainText('Glow na Hora');
    await expect(page.locator('[data-group]')).toHaveCount(0);
    await expect(page.locator('[data-look]')).not.toHaveCount(0);
  });

  test('voltar da escolha leva para o início', async ({ page }) => {
    await openToChoice(page);
    await page.getByTestId('path-back').click();
    await expect(page.getByTestId('file-input')).toBeAttached();
    await expect(page.getByTestId('path-choice')).toHaveCount(0);
  });

  test('os cartões acompanham o caminho: sem pincel, nada de ensinar a pintar', async ({ page }) => {
    await openToChoice(page, 'portrait.png', true);
    const cards = page.getByRole('dialog', { name: 'Como usar' });
    // The screen of choice comes first, with no card over it.
    await expect(cards).toHaveCount(0);

    await page.locator('[data-path=glow]').click();
    await expect(cards).toBeVisible();
    await expect(cards).not.toContainText('pintar');
    for (let i = 0; i < 2; i++) await page.getByTestId('onboarding-next').click();
    await expect(cards).toHaveCount(0);

    // The path with a brush owes only the card about painting, and the two together mean done.
    await switchPath(page, 'manual');
    await expect(cards).toContainText('pintar');
    await page.getByTestId('onboarding-next').click();
    await expect(cards).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('glowup.onboarded'))).toBe('true');

    await switchPath(page, 'glow');
    await expect(cards).toHaveCount(0);
  });

  test.describe('celular', () => {
    test.use({ viewport: { width: 375, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    test('o nome do caminho cabe na barra, e os looks ficam ao alcance', async ({ page }) => {
      await openGlow(page);
      const name = page.getByTestId('path-switch');
      expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const look = await page.locator('[data-look=natural]').boundingBox();
      expect(look!.y + look!.height).toBeLessThanOrEqual(760);
      expect(look!.height).toBeGreaterThanOrEqual(44);
    });
  });
});

test.describe('Glow na Hora', () => {
  test('um look entra numa etapa, a troca limpa o anterior e o segundo toque tira', async ({ page }) => {
    await openGlow(page);
    await tapLook(page, 'glow');
    expect(await docState(page)).toEqual({ depth: 1, label: 'Look', painted: GLOW, exposure: 6, filter: 'mel' });
    await expect(page.locator('[data-look=glow]')).toHaveAttribute('aria-pressed', 'true');

    // The blush and the highlight of the look before leave with it, in the same step.
    await tapLook(page, 'editorial');
    expect(await docState(page)).toEqual({ depth: 2, label: 'Look', painted: EDITORIAL, exposure: 0, filter: 'capa' });
    await expect(page.locator('[data-look=editorial]')).toHaveAttribute('aria-pressed', 'true');

    // The menu reads the document, so it follows the undo.
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page);
    expect(await docState(page)).toEqual({ depth: 1, label: 'Look', painted: GLOW, exposure: 6, filter: 'mel' });
    await expect(page.locator('[data-look=glow]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-look=editorial]')).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: 'Refazer' }).click();
    await settle(page);
    expect((await docState(page)).painted).toEqual(EDITORIAL);

    await tapLook(page, 'editorial');
    expect(await docState(page)).toEqual({ depth: 3, label: 'Tirar look', painted: [], exposure: 0, filter: null });
    await expect(page.locator('[data-look][aria-pressed=true]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page);
    expect((await docState(page)).painted).toEqual(EDITORIAL);
    await expect(page.locator('[data-look=editorial]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('trocar de caminho não perde nada, e um look não apaga o que foi pintado à mão', async ({ page }) => {
    await openToChoice(page);
    await page.locator('[data-path=manual]').click();
    await pickTool(page, 'makeup', 'freckles', { auto: true });
    await chooseMode(page, 'Manual');
    await paint(page, [[-0.1, 0.1], [0.1, 0.1]]);
    const painted = await docState(page);
    expect(painted.painted).toEqual(['freckles']);

    await switchPath(page, 'glow');
    expect(await docState(page)).toEqual(painted);

    await tapLook(page, 'glow');
    expect((await docState(page)).painted).toEqual([...GLOW.slice(0, 1), 'freckles', ...GLOW.slice(1)]);
    await tapLook(page, 'editorial');
    expect((await docState(page)).painted).toEqual(['contour', 'freckles', 'smooth', 'sparkle']);

    await switchPath(page, 'manual');
    await page.locator('[data-group=makeup]').click();
    await expect(page.locator('[data-tool=freckles]')).toHaveAttribute('data-effect', 'on');
    await expect(page.locator('[data-tool=contour]')).toHaveAttribute('data-effect', 'on');
    await page.locator('[data-group=skin]').click();
    await expect(page.locator('[data-tool=smooth]')).toHaveAttribute('data-effect', 'on');
  });

  test('um projeto volta para o caminho do que ele tem', async ({ page }) => {
    await openGlow(page);
    await tapLook(page, 'domingo');
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await page.getByRole('button', { name: /^Continuar/ }).click();
    await page.getByTestId('looks').waitFor({ timeout: 90_000 });
    await expect(page.locator('[data-look=domingo]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('path-choice')).toHaveCount(0);

    // The look changed by hand is no longer that look: the project opens on the tools.
    await switchPath(page, 'manual');
    await pickTool(page, 'light', 'adjust');
    await page.getByRole('slider', { name: 'Contraste' }).focus();
    await page.keyboard.press('ArrowRight');
    await settle(page, 400);
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await page.getByRole('button', { name: /^Continuar/ }).click();
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await expect(page.getByTestId('path-choice')).toHaveCount(0);
  });

  test('sem rosto, entra só a cor do look, e a foto avisa', async ({ page }) => {
    await openGlow(page, 'gradient.png');
    await tapLook(page, 'glow');
    await expect(page.getByText('Não achei rosto nesta foto, então entrou só a cor do look.')).toBeVisible();
    expect(await docState(page)).toEqual({ depth: 1, label: 'Look', painted: [], exposure: 6, filter: 'mel' });
    await expect(page.locator('[data-look=glow]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('sem detector, entra só a cor, e o segundo toque tenta de novo', async ({ page }) => {
    await page.route(/face_landmarker|vision_wasm/, (route) => route.abort());
    await openGlow(page);
    await tapLook(page, 'glow');
    await expect(page.getByText(/O detector não carregou, então entrou só a cor do look/)).toBeVisible();
    expect(await docState(page)).toEqual({ depth: 1, label: 'Look', painted: [], exposure: 6, filter: 'mel' });

    await page.unroute(/face_landmarker|vision_wasm/);
    await tapLook(page, 'glow');
    expect((await docState(page)).painted).toEqual(GLOW);
  });

  test('o código de uma ferramenta que não baixa deixa a foto como estava', async ({ page }) => {
    await page.route(/\/src\/tools\/highlight\//, (route) => route.abort());
    await openGlow(page);
    const before = await docState(page);
    await tapLook(page, 'glow');
    await expect(page.getByText('Esse look não carregou. Confere a conexão e tenta de novo.')).toBeVisible();
    expect(await docState(page)).toEqual(before);
  });
});

test.describe('fotos difíceis', () => {
  test('um arquivo .jfif abre, mesmo sem tipo declarado', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('glowup.onboarded', 'true'));
    await page.goto('/');
    await page.setInputFiles('[data-testid=file-input]', {
      name: 'foto.jfif',
      mimeType: '',
      buffer: readFileSync('tests/fixtures/gradient.png'),
    });
    await expect(page.getByTestId('path-choice')).toBeVisible({ timeout: 90_000 });
  });

  test('Sombras não faz o ruído de cor de um preto virar mancha colorida', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('glowup.onboarded', 'true');
      localStorage.setItem('glowup.startPath', '"manual"');
    });
    await page.goto('/');
    // Nearly black, with only a little blue, as the shadows of a compressed photo have.
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 400;
      const g = c.getContext('2d')!;
      g.fillStyle = 'rgb(0 0 10)';
      g.fillRect(0, 0, 400, 400);
      return c.toDataURL('image/png').split(',')[1];
    });
    await page.setInputFiles('[data-testid=file-input]', { name: 'preto.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.locator('[data-group=light]').waitFor({ timeout: 90_000 });
    await pickTool(page, 'light', 'adjust');
    const slider = page.getByRole('slider', { name: 'Sombras', exact: true });
    await slider.evaluate((el) => {
      const i = el as HTMLInputElement;
      i.value = '40';
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle(page, 400);
    const [x, y] = facePoint(page, 0, 0);
    const shot = await page.screenshot({ clip: { x: x - 4, y: y - 4, width: 8, height: 8 } });
    const [r, , b] = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      return [...g.getImageData(1, 1, 1, 1).data];
    }, shot.toString('base64'));
    expect(b - r).toBeLessThan(40);
  });
});
