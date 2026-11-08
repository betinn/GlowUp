import { expect, test, type Page } from '@playwright/test';
import { chooseMode, expectNoErrors, facePoint, fitPhoto, meanDiff, openEditor, paint, pickTool, settle, showSettled, type Clip } from './helpers';

/** The real detector runs here, on the procedural portrait. */
const shot = (name: string) => `docs/visual-checks/${name}.png`;

type Spot = [number, number];

/** Points of the fixture portrait, in its own coordinates. */
const UPPER_LIP: Spot = [0, 0.214];
const LOWER_LIP: Spot = [0, 0.28];
const TEETH: Spot = [0, 0.24];
const BROW: Spot = [-0.14, -0.142];
const LID: Spot = [-0.155, -0.104];
const LID_RIGHT: Spot = [0.155, -0.104];
const WHITE: Spot = [-0.21, -0.06];
const IRIS: Spot = [-0.155, -0.06];
const APPLE: Spot = [-0.18, 0.1];
const APPLE_RIGHT: Spot = [0.185, 0.1];
const HOLLOW: Spot = [-0.222, 0.134];
const FACE_SIDE: Spot = [-0.262, 0.05];
const NOSE_SIDE: Spot = [-0.035, 0.028];
const CHEEK_TOP: Spot = [-0.15, 0.05];
const BRIDGE: Spot = [0.008, 0.03];
const FOREHEAD: Spot = [0, -0.2];
const CHIN: Spot = [0, 0.37];
const MIDDLE_CHEEK: Spot = [-0.1, 0.17];
const HAIR: Spot = [-0.33, 0];
const BACKGROUND: Spot = [-0.38, -0.44];

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('XNNPACK')) errors.push(m.text());
  });
  return errors;
}

function around(page: Page, point: Spot, half = 3): Clip {
  const [x, y] = facePoint(page, ...point);
  return { x: x - half, y: y - half, width: half * 2, height: half * 2 };
}

const undoButton = (page: Page) => page.getByRole('button', { name: 'Desfazer' });
const toolButton = (page: Page, tool: string) => page.locator(`[data-tool=${tool}]`);

async function fitted(page: Page): Promise<Buffer> {
  await fitPhoto(page);
  await settle(page, 300);
  return page.screenshot();
}

/** Opens one tool in the automatic mode and returns the photo with the effect. */
async function applied(page: Page, tool: string): Promise<Buffer> {
  await pickTool(page, 'makeup', tool, { auto: true });
  await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'auto');
  await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
  await expect(toolButton(page, tool)).toHaveAttribute('data-effect', 'on');
  return fitted(page);
}

interface Case {
  tool: string;
  name: string;
  /** Words the panel uses for where the effect went. */
  place: RegExp;
  /** Words of the switch in the manual mode. */
  limit: string;
  hits: Spot[];
  misses: Spot[];
  /** Where the effect is too weak to see. */
  faint?: Spot[];
  /** A stroke the brush keeps out of, in the manual mode. */
  outside: [Spot, Spot];
  /** A stroke on the region. */
  inside: [Spot, Spot];
}

const CASES: Case[] = [
  {
    tool: 'lips',
    name: 'Batom cai nos lábios, sem os dentes',
    place: /Aplicado nos lábios que achei/,
    limit: 'Só nos lábios',
    hits: [UPPER_LIP, LOWER_LIP],
    misses: [TEETH, MIDDLE_CHEEK, CHIN, FOREHEAD, HAIR, BACKGROUND],
    outside: [[-0.2, 0.2], [-0.13, 0.2]],
    inside: [[-0.03, 0.28], [0.03, 0.28]],
  },
  {
    tool: 'blush',
    name: 'Blush cai nas maçãs, na pele',
    place: /Aplicado nas maçãs do rosto que achei/,
    limit: 'Só na pele',
    hits: [APPLE, APPLE_RIGHT],
    misses: [BRIDGE, UPPER_LIP, FOREHEAD, CHIN, HAIR, BACKGROUND],
    outside: [[-0.37, -0.4], [-0.3, -0.4]],
    inside: [[-0.03, -0.2], [0.03, -0.2]],
  },
  {
    tool: 'eyeshadow',
    name: 'Sombra cai nas pálpebras, fora do olho e da sobrancelha',
    place: /Aplicado nas pálpebras que achei/,
    limit: 'Só nas pálpebras',
    hits: [LID, LID_RIGHT],
    misses: [IRIS, BROW, APPLE, FOREHEAD, BRIDGE, HAIR],
    // The outer corner of the model falls short of the drawn eye, so the soft edge of the shadow just touches it.
    faint: [WHITE],
    outside: [[-0.03, 0.15], [0.03, 0.15]],
    inside: [[-0.17, -0.104], [-0.14, -0.104]],
  },
  {
    tool: 'brow',
    name: 'Sobrancelha cai nos fios',
    place: /Aplicado nas sobrancelhas que achei/,
    limit: 'Só nas sobrancelhas',
    hits: [BROW],
    misses: [LID, IRIS, FOREHEAD, APPLE, UPPER_LIP, BACKGROUND],
    outside: [[-0.03, 0.15], [0.03, 0.15]],
    inside: [[-0.16, -0.142], [-0.12, -0.142]],
  },
  {
    tool: 'contour',
    name: 'Contorno cai sob as maçãs e nas laterais do rosto e do nariz',
    place: /Aplicado nas áreas de contorno do rosto que achei/,
    limit: 'Só na pele',
    hits: [HOLLOW, FACE_SIDE, NOSE_SIDE],
    misses: [BRIDGE, FOREHEAD, UPPER_LIP, CHIN, BACKGROUND],
    outside: [[-0.37, -0.4], [-0.3, -0.4]],
    inside: [[-0.03, -0.2], [0.03, -0.2]],
  },
  {
    tool: 'freckles',
    name: 'Sardas caem sobre o nariz e as bochechas',
    place: /Aplicado no nariz e nas bochechas que achei/,
    limit: 'Só na pele',
    hits: [],
    misses: [FOREHEAD, UPPER_LIP, CHIN, HAIR, BACKGROUND],
    outside: [[-0.37, -0.4], [-0.3, -0.4]],
    inside: [[-0.03, -0.2], [0.03, -0.2]],
  },
];

test.describe('make', () => {
  for (const c of CASES) {
    test(c.name, async ({ page }) => {
      const errors = watch(page);
      await openEditor(page);
      const plain = await page.screenshot();
      const after = await applied(page, c.tool);
      await expect(page.getByText(c.place)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Borracha' })).toHaveCount(0);
      for (const spot of c.hits) expect(await meanDiff(page, plain, after, around(page, spot)), `no efeito ${spot}`).toBeGreaterThan(1);
      for (const spot of c.misses) expect(await meanDiff(page, plain, after, around(page, spot)), `fora do efeito ${spot}`).toBeLessThan(0.4);
      for (const spot of c.faint ?? []) expect(await meanDiff(page, plain, after, around(page, spot)), `quase fora do efeito ${spot}`).toBeLessThan(1);
      expectNoErrors(errors);
    });

    test(`${c.tool}: Manual devolve o pincel preso à região`, async ({ page }) => {
      const errors = watch(page);
      await openEditor(page);
      await pickTool(page, 'makeup', c.tool);
      await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
      await expect(page.getByTestId('limit-toggle')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('limit-toggle')).toContainText(c.limit);
      await page.mouse.move(2, 2);
      await settle(page, 300);
      const clean = await page.screenshot();

      // A stroke that falls all outside does nothing and says why.
      await paint(page, c.outside, 2);
      await expect(page.getByText(`Para pintar aqui, desligue "${c.limit}"`)).toBeVisible();
      expect(await meanDiff(page, clean, await page.screenshot(), around(page, [(c.outside[0][0] + c.outside[1][0]) / 2, c.outside[0][1]]))).toBeLessThan(0.3);

      // On the region it paints.
      await paint(page, c.inside, 3);
      const painted = await page.screenshot();
      if (c.tool !== 'freckles') {
        expect(await meanDiff(page, clean, painted, around(page, [(c.inside[0][0] + c.inside[1][0]) / 2, c.inside[0][1]]))).toBeGreaterThan(0.5);
      }
      await expect(toolButton(page, c.tool)).toHaveAttribute('data-effect', 'on');
      expectNoErrors(errors);
    });
  }

  test('Sardas pintam pontos no nariz e nas bochechas', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();
    const after = await applied(page, 'freckles');
    // The dots are sparse, so a wider area tells more than a small one.
    for (const spot of [CHEEK_TOP, BRIDGE]) expect(await meanDiff(page, plain, after, around(page, spot, 16))).toBeGreaterThan(0.25);
    expect(await meanDiff(page, plain, after, around(page, FOREHEAD, 16))).toBeLessThan(0.1);
    await page.screenshot({ path: shot('ui-make-sardas') });
    expectNoErrors(errors);
  });

  test('Dentes segue o padrão: acha, voa, aplica e tira no botão', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();
    const after = await applied(page, 'whiten');
    await expect(page.getByText(/Aplicado nos dentes que achei/)).toBeVisible();
    expect(await meanDiff(page, plain, after, around(page, TEETH))).toBeGreaterThan(1);
    expect(await meanDiff(page, plain, after, around(page, [0, 0.289]))).toBeLessThan(0.4);
    await toolButton(page, 'whiten').click();
    await expect(toolButton(page, 'whiten')).toHaveAttribute('data-effect', 'off');
    await chooseMode(page, 'Manual');
    await expect(page.getByTestId('limit-toggle')).toContainText('Só nos dentes');
    expectNoErrors(errors);
  });

  test('Batom mostra a região antes: voa até a boca, acende e o efeito chega aos poucos', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await page.locator('[data-group=makeup]').click();
    await page.locator('[data-tool=lips]').click();
    await expect(page.locator('[data-limit=searching]')).toBeVisible();
    await expect(page.getByText(/Só na primeira vez, cerca de 6 MB/)).toBeVisible();
    await expect(page.locator('[data-limit=on]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-region-show=glow]')).toHaveCount(1, { timeout: 10_000 });
    await page.screenshot({ path: shot('ui-make-brilho') });
    expect(Number(await page.locator('[data-zoom]').getAttribute('data-zoom'))).toBeGreaterThan(1.5);
    // While the fade runs the undo step is not there yet, and it comes as one step.
    await expect(page.locator('[data-region-show=fill]')).toHaveCount(1, { timeout: 10_000 });
    const during = await page.screenshot();
    await showSettled(page);
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    const done = await page.screenshot();
    expect(await meanDiff(page, during, done)).toBeGreaterThan(0.001);
    await page.screenshot({ path: shot('ui-make-batom') });
    expectNoErrors(errors);
  });

  test('tocar de novo na ferramenta tira o efeito, e mais uma vez aplica de novo', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const plain = await page.screenshot();
    const blush = toolButton(page, 'blush');
    const after = await applied(page, 'blush');
    await blush.click();
    await expect(blush).toHaveAttribute('data-effect', 'off');
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Limpar');
    const off = await fitted(page);
    expect(await meanDiff(page, plain, off, around(page, APPLE))).toBeLessThan(0.3);
    await blush.click();
    await expect(blush).toHaveAttribute('data-effect', 'on');
    const again = await fitted(page);
    expect(await meanDiff(page, after, again, around(page, APPLE))).toBeLessThan(0.3);
    await undoButton(page).click();
    await expect(blush).toHaveAttribute('data-effect', 'off');
    expectNoErrors(errors);
  });

  test('todas juntas compõem a maquiagem, e o Manual parte do que o Automático fez', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    for (const tool of ['lips', 'blush', 'eyeshadow', 'brow', 'contour', 'freckles', 'whiten']) await applied(page, tool);
    await settle(page, 300);
    await page.screenshot({ path: shot('ui-make-auto') });
    await pickTool(page, 'makeup', 'lips', { auto: true });
    await chooseMode(page, 'Manual');
    await expect(toolButton(page, 'lips')).toHaveAttribute('data-effect', 'on');
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Automático');
    await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
    expectNoErrors(errors);
  });

  test('numa foto de grupo, aplica em todos os rostos sem erro', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page, 'group.png');
    for (const tool of ['lips', 'blush', 'brow']) {
      await pickTool(page, 'makeup', tool, { auto: true });
      await expect(toolButton(page, tool)).toHaveAttribute('data-effect', 'on');
    }
    expectNoErrors(errors);
  });

  test('sem rosto, cada ferramenta cai no pincel livre e diz por quê', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page, 'gradient.png');
    for (const tool of ['lips', 'whiten', 'blush', 'eyeshadow', 'brow', 'contour', 'freckles']) {
      await page.locator('[data-group=makeup]').click();
      await toolButton(page, tool).click();
      await expect(page.locator('[data-limit=no-face]')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('Não achei rosto nesta foto. O pincel está livre.')).toBeVisible();
      await expect(page.getByTestId('tool-mode')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
    }
    expectNoErrors(errors);
  });

  test('sem o detector, cai no pincel livre com aviso', async ({ page }) => {
    await page.route(/face_landmarker|vision_wasm/, (route) => route.abort());
    await openEditor(page);
    await page.locator('[data-group=makeup]').click();
    await toolButton(page, 'lips').click();
    await expect(page.locator('[data-limit=failed]')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('O detector não carregou. O pincel está livre.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Borracha' })).toBeVisible();
  });
});

test.describe('make, celular', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('Batom aplica no Automático', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await page.locator('[data-group=makeup]').tap();
    await page.locator('[data-tool=lips]').tap();
    await expect(page.getByText(/Aplicado nos lábios que achei/)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-region-show=idle]')).toHaveCount(1, { timeout: 15_000 });
    await page.screenshot({ path: shot('ui-celular-make') });
    expectNoErrors(errors);
  });
});
