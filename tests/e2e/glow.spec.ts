import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { chooseMode, facePoint, openTab, paint, pickTool, setSlider, settle } from './helpers';

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

/** Opens a new photo up to the tabs, where it lands on the first one, with the cards out of the way unless asked. */
async function openToTabs(page: Page, fixture = 'portrait.png', cards = false): Promise<void> {
  if (!cards) await page.addInitScript(() => localStorage.setItem('glowup.onboarded', 'true'));
  await page.goto('/');
  await page.setInputFiles('[data-testid=file-input]', `tests/fixtures/${fixture}`);
  await page.getByTestId('tabs').waitFor({ timeout: 90_000 });
  await expect(page.getByTestId('opening')).toHaveCount(0);
}

async function openGlow(page: Page, fixture = 'portrait.png'): Promise<void> {
  await openToTabs(page, fixture);
  await openTab(page, 'glow');
  await page.getByTestId('looks').waitFor();
  await settle(page, 300);
}

async function tapLook(page: Page, id: string): Promise<void> {
  await page.locator(`[data-look=${id}]`).click();
  await expect(page.getByTestId('looks')).toHaveAttribute('data-state', 'idle', { timeout: 90_000 });
  await settle(page, 300);
}

/** The tab in sight, by the one that is pressed. */
const expectTab = async (page: Page, id: string) => {
  await expect(page.locator(`[data-path=${id}]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-path][aria-pressed=true]')).toHaveCount(1);
};

test.describe('abas', () => {
  test('a foto nova abre na primeira aba, sem pergunta, e cada aba traz o seu menu', async ({ page }) => {
    await openToTabs(page);
    // Five tabs in sight, in their order, and the photo already on the first: nothing asks where to go.
    const tabs = page.getByTestId('tabs').locator('[data-path]');
    await expect(tabs).toHaveCount(5);
    expect(await tabs.evaluateAll((list) => list.map((el) => el.getAttribute('data-path')))).toEqual(['glow', 'manual', 'filters', 'photo', 'fun']);
    await expect(page.locator('[data-path]')).toHaveCount(5);
    for (const tab of await tabs.all()) await expect(tab).toBeVisible();
    await expectTab(page, 'glow');
    await expect(page.getByTestId('looks')).toBeVisible();
    await expect(page.locator('[data-look]')).not.toHaveCount(0);
    await expect(page.locator('[data-group]')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await openTab(page, 'manual');
    await expectTab(page, 'manual');
    await expect(page.locator('[data-group=skin]')).toBeVisible();
    expect(await page.locator('[data-group]').evaluateAll((list) => list.map((el) => el.getAttribute('data-group')))).toEqual([
      'skin',
      'eyes',
      'makeup',
      'hair',
      'shape',
    ]);
    await expect(page.locator('[data-look]')).toHaveCount(0);
    // The tab in sight stays where it is when it is tapped again.
    await page.locator('[data-path=manual]').click();
    await expectTab(page, 'manual');
    await expect(page.locator('[data-group=skin]')).toBeVisible();

    // The filters have a tab of their own, and no tool of recipes beside them.
    await openTab(page, 'filters');
    await expectTab(page, 'filters');
    await expect(page.getByTestId('filters-menu')).toBeVisible();
    await expect(page.locator('[data-tool=presets]')).toHaveCount(0);
    await expect(page.locator('[data-group]')).toHaveCount(0);

    // The tools of the whole photo side by side, with no row of menus to choose from.
    await openTab(page, 'photo');
    await expectTab(page, 'photo');
    await expect(page.locator('[data-tool=adjust]')).toBeVisible();
    expect(await page.locator('[data-tool]').evaluateAll((list) => list.map((el) => el.getAttribute('data-tool')))).toEqual([
      'adjust',
      'blur',
      'crop',
      'upscale',
    ]);
    await expect(page.locator('[data-group]')).toHaveCount(0);

    await openTab(page, 'fun');
    await expectTab(page, 'fun');
    await expect(page.getByTestId('brincar-menu')).toBeVisible();
    await expect(page.locator('[data-group]')).toHaveCount(0);

    await openTab(page, 'glow');
    await expectTab(page, 'glow');
    await expect(page.locator('[data-look]')).not.toHaveCount(0);
    await expect(page.locator('[data-group]')).toHaveCount(0);
  });

  test('a aba Filtros mostra só os filtros, e o filtro segue na foto nas outras abas', async ({ page }) => {
    await openToTabs(page);
    await openTab(page, 'filters');
    await page.getByTestId('filters-menu').waitFor();
    await expect(page.locator('[data-group]')).toHaveCount(0);
    await page.locator('[data-filter=prata]').click();
    await settle(page, 400);
    expect((await docState(page)).filter).toBe('prata');
    // The tab of the tools has no menu of filters: they live only in their tab.
    await openTab(page, 'manual');
    await expect(page.locator('[data-group=skin]')).toBeVisible();
    await expect(page.locator('[data-group=filters]')).toHaveCount(0);
    expect((await docState(page)).filter).toBe('prata');
    await openTab(page, 'filters');
    await expect(page.locator('[data-filter=prata]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a última aba usada é onde a próxima foto nova começa', async ({ page }) => {
    await openToTabs(page);
    await expectTab(page, 'glow');
    await openTab(page, 'photo');
    await expect(page.locator('[data-tool=adjust]')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('glowup.lastPath'))).toBe('"photo"');

    // The way back to the start is the bar, and the next photo opens with no question.
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await expect(page.getByTestId('tabs')).toHaveCount(0);
    await page.setInputFiles('[data-testid=file-input]', 'tests/fixtures/gradient.png');
    await page.getByTestId('tabs').waitFor({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await expectTab(page, 'photo');
    await expect(page.locator('[data-tool=adjust]')).toBeVisible();
  });

  test('os cartões acompanham a aba: sem pincel, nada de ensinar a pintar', async ({ page }) => {
    await openToTabs(page, 'portrait.png', true);
    const cards = page.getByRole('dialog', { name: 'Como usar' });
    // The photo opens on the tab of the looks, which has no brush to teach.
    await expectTab(page, 'glow');
    await expect(cards).toBeVisible();
    await expect(cards).not.toContainText('pintar');
    for (let i = 0; i < 2; i++) await page.getByTestId('onboarding-next').click();
    await expect(cards).toHaveCount(0);

    // The tab with a brush owes only the card about painting, and the two together mean done.
    await openTab(page, 'manual');
    await expect(cards).toContainText('pintar');
    await page.getByTestId('onboarding-next').click();
    await expect(cards).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('glowup.onboarded'))).toBe('true');

    await openTab(page, 'glow');
    await expect(cards).toHaveCount(0);
  });

  test.describe('celular', () => {
    test.use({ viewport: { width: 375, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    test('as cinco abas cabem na tela, e os looks ficam ao alcance', async ({ page }) => {
      await openGlow(page);
      const nav = page.getByTestId('tabs');
      expect(await nav.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const boxes = await nav.locator('[data-path]').evaluateAll((list) =>
        list.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        }),
      );
      expect(boxes).toHaveLength(5);
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(375);
        expect(box.bottom).toBeLessThanOrEqual(760);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      const look = await page.locator('[data-look=natural]').boundingBox();
      expect(look!.y + look!.height).toBeLessThanOrEqual(760);
      expect(look!.height).toBeGreaterThanOrEqual(44);
      // The menu sits over the tabs, not under them.
      expect(look!.y + look!.height).toBeLessThanOrEqual(boxes[0].top + 0.5);
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

  test('trocar de aba não perde nada, e um look não apaga o que foi pintado à mão', async ({ page }) => {
    await openToTabs(page);
    await openTab(page, 'manual');
    await pickTool(page, 'makeup', 'freckles', { auto: true });
    await chooseMode(page, 'Manual');
    await paint(page, [[-0.1, 0.1], [0.1, 0.1]]);
    const painted = await docState(page);
    expect(painted.painted).toEqual(['freckles']);

    await openTab(page, 'glow');
    expect(await docState(page)).toEqual(painted);

    await tapLook(page, 'glow');
    expect((await docState(page)).painted).toEqual([...GLOW.slice(0, 1), 'freckles', ...GLOW.slice(1)]);
    await tapLook(page, 'editorial');
    expect((await docState(page)).painted).toEqual(['contour', 'freckles', 'smooth', 'sparkle']);

    await openTab(page, 'manual');
    await page.locator('[data-group=makeup]').click();
    await expect(page.locator('[data-tool=freckles]')).toHaveAttribute('data-effect', 'on');
    await expect(page.locator('[data-tool=contour]')).toHaveAttribute('data-effect', 'on');
    await page.locator('[data-group=skin]').click();
    await expect(page.locator('[data-tool=smooth]')).toHaveAttribute('data-effect', 'on');
  });

  test('um projeto volta para a aba do que ele tem', async ({ page }) => {
    await openGlow(page);
    await tapLook(page, 'domingo');
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await page.getByRole('button', { name: /^Continuar/ }).click();
    await page.getByTestId('looks').waitFor({ timeout: 90_000 });
    await expect(page.locator('[data-look=domingo]')).toHaveAttribute('aria-pressed', 'true');
    await expectTab(page, 'glow');

    // The look changed by hand is no longer that look: the project opens on the tools.
    await openTab(page, 'manual');
    await pickTool(page, 'light', 'adjust');
    await page.getByRole('slider', { name: 'Contraste' }).focus();
    await page.keyboard.press('ArrowRight');
    await settle(page, 400);
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await page.getByRole('button', { name: /^Continuar/ }).click();
    // Not on Foto, the tab the person was last on: the look is still on the face, under the contrast.
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await expectTab(page, 'manual');
  });

  test('um projeto só com ajustes da foto inteira volta na aba Foto, e só com filtro, na aba Filtros', async ({ page }) => {
    await openToTabs(page);
    await pickTool(page, 'light', 'adjust');
    await setSlider(page, 'Contraste', 40);
    await settle(page, 400);
    expect((await docState(page)).depth).toBe(1);
    // The person leaves from another tab, and the project still opens where its edits are.
    await openTab(page, 'fun');
    await page.getByTestId('brincar-menu').waitFor();
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await page.getByRole('button', { name: /^Continuar/ }).click();
    await page.locator('[data-tool=adjust]').waitFor({ timeout: 90_000 });
    await expectTab(page, 'photo');

    await page.getByTestId('reset-group').click();
    await settle(page, 400);
    await openTab(page, 'filters');
    await page.locator('[data-filter=prata]').click();
    await settle(page, 400);
    await openTab(page, 'glow');
    await page.getByTestId('looks').waitFor();
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await page.getByRole('button', { name: /^Continuar/ }).click();
    await page.getByTestId('filters-menu').waitFor({ timeout: 90_000 });
    await expectTab(page, 'filters');
    await expect(page.locator('[data-filter=prata]')).toHaveAttribute('aria-pressed', 'true');
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
    await expect(page.getByTestId('tabs')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('looks')).toBeVisible();
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
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
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
