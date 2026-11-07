import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../../src/tools/catalog';
import { expectNoErrors, facePoint, imageRect, limitSettled, meanDiff, openEditor, paint, pickTool, scribble, settle } from './helpers';

/** Iris of the left eye of the fixture portrait, in its own coordinates. */
const IRIS: [number, number] = [-0.155, -0.06];

const photo = (page: Page) => {
  const r = imageRect(page);
  return { x: r.x, y: r.y, width: r.w, height: r.h };
};

const toggle = (page: Page) => page.getByTestId('mark-toggle');
const chip = (page: Page) => page.getByTestId('mark-chip');

async function paintIris(page: Page): Promise<void> {
  await paint(page, scribble(IRIS[0], IRIS[1], 0.03, 0.03, 4));
}

/** The fixture portrait at twice its size, so zooming in takes the full-detail render of the view. */
async function largePortrait(page: Page): Promise<Buffer> {
  const data = readFileSync('tests/fixtures/portrait.png').toString('base64');
  const jpeg = await page.evaluate(async (png) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width * 2;
    c.height = img.height * 2;
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  }, data);
  return Buffer.from(jpeg, 'base64');
}

test.describe('marca do pincel', () => {
  let errors: string[];

  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
  });

  test.afterEach(() => expectNoErrors(errors));

  test('com qualquer pincel aberto, a foto já mostra o resultado', async ({ page }) => {
    await openEditor(page);
    const clip = photo(page);
    for (const t of TOOLS.filter((tool) => tool.kind === 'mask')) {
      await pickTool(page, t.group, t.id);
      const before = await page.screenshot({ clip });
      // Tools for eyes and teeth stay on their region, and the others can go anywhere.
      const [x, y, r] = t.region === 'teeth' ? [0, 0.245, 0.06] : t.region ? [IRIS[0], IRIS[1], 0.05] : [0, 0.05, 0.1];
      await paint(page, scribble(x, y, r, r * 0.6, 4));
      const open = await page.screenshot({ clip });
      await page.keyboard.press('Escape');
      await settle(page, 400);
      const closed = await page.screenshot({ clip });
      expect(await meanDiff(page, before, open), `${t.id} pintou`).toBeGreaterThan(0.003);
      expect(await meanDiff(page, open, closed), `${t.id} aberta e fechada`).toBeLessThan(0.002);
    }
  });

  test('a marca é uma opção com estado claro e não passa para a próxima ferramenta', async ({ page }) => {
    await openEditor(page);
    const clip = photo(page);
    await pickTool(page, 'eyes', 'eyecolor');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await expect(toggle(page)).toContainText('Desligada');
    await expect(chip(page)).toHaveCount(0);
    await paintIris(page);
    const result = await page.screenshot({ clip });

    await toggle(page).click();
    await page.mouse.move(2, 2);
    await settle(page, 300);
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await expect(toggle(page)).toContainText('Ligada');
    await expect(chip(page)).toBeVisible();
    await page.screenshot({ path: 'docs/visual-checks/ui-marca-ligada.png' });
    expect(await meanDiff(page, result, await page.screenshot({ clip }))).toBeGreaterThan(0.02);

    await pickTool(page, 'eyes', 'sparkle');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await expect(chip(page)).toHaveCount(0);
    expect(await meanDiff(page, result, await page.screenshot({ clip }))).toBeLessThan(0.002);

    await pickTool(page, 'eyes', 'eyecolor');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('m');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'true');
    await chip(page).getByRole('button', { name: 'Ver o resultado' }).click();
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
    await expect(chip(page)).toHaveCount(0);
    await page.mouse.move(2, 2);
    await settle(page, 300);
    expect(await meanDiff(page, result, await page.screenshot({ clip }))).toBeLessThan(0.002);

    // Without a brush the key has nothing to show, and it leaves nothing behind for the next tool.
    await pickTool(page, 'light', 'adjust');
    await page.keyboard.press('m');
    await expect(chip(page)).toHaveCount(0);
    await pickTool(page, 'eyes', 'eyecolor');
    await expect(toggle(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('com o zoom no detalhe real, aberta e fechada também batem', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('glowup.onboarded', 'true'));
    await page.goto('/');
    const buffer = await largePortrait(page);
    await page.setInputFiles('[data-testid=file-input]', { name: 'retrato-grande.jpg', mimeType: 'image/jpeg', buffer });
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await settle(page, 1200);
    await pickTool(page, 'eyes', 'eyecolor');
    const [x, y] = facePoint(page, ...IRIS);
    await page.mouse.move(x, y);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -160);
    await settle(page, 1200);
    await page.mouse.move(x - 60, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 10 });
    await page.mouse.up();
    await page.mouse.move(2, 2);
    await settle(page, 1200);
    const clip = { x: x - 150, y: y - 120, width: 300, height: 240 };
    const open = await page.screenshot({ clip });
    await page.keyboard.press('Escape');
    await settle(page, 1200);
    expect(await meanDiff(page, open, await page.screenshot({ clip }))).toBeLessThan(0.002);
  });
});

test.describe('marca do pincel, celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('com o painel recolhido, a própria foto avisa e desliga a marca', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-group=eyes]').tap();
    await page.locator('[data-tool=eyecolor]').tap();
    await limitSettled(page);
    await toggle(page).tap();
    await expect(chip(page)).toBeVisible();
    await page.getByRole('button', { name: 'Recolher controles' }).tap();
    await expect(toggle(page)).toHaveCount(0);
    await settle(page, 300);
    await page.screenshot({ path: 'docs/visual-checks/ui-celular-marca.png' });
    await chip(page).getByRole('button', { name: 'Ver o resultado' }).tap();
    await expect(chip(page)).toHaveCount(0);
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(noOverflow).toBe(true);
  });
});
