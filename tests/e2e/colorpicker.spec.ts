import { expect, test, type Page } from '@playwright/test';
import { expectNoErrors, imageRect, meanDiff, openEditor, pickTool, settle, type Clip } from './helpers';

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('XNNPACK')) errors.push(m.text());
  });
  return errors;
}

const picker = (page: Page) => page.getByRole('group', { name: 'Cor', exact: true });
const undo = (page: Page) => page.getByRole('button', { name: 'Desfazer' });

/** The photo on the desktop layout, without the panel. */
function photo(page: Page): Clip {
  const r = imageRect(page);
  return { x: r.x, y: r.y, width: r.w, height: r.h };
}

/** Every preset of every color tool, and the swatch that opens the full picker, are inside the screen. */
async function allReachable(page: Page) {
  const width = page.viewportSize()!.width;
  const group = picker(page);
  const swatches = group.locator('.swatch');
  const count = await swatches.count();
  expect(count).toBeGreaterThanOrEqual(6);
  const [scroll, client] = await group.locator('.swatches').evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(scroll).toBeLessThanOrEqual(client);
  for (const el of [...(await swatches.all()), group.getByRole('button', { name: 'Cor personalizada' })]) {
    await el.scrollIntoViewIfNeeded();
    const box = (await el.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await expect(el).toBeInViewport();
  }
  return swatches;
}

test.describe('seletor de cor, celular', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('toda cor pronta cabe na tela e se toca, em cada ferramenta de cor', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    for (const [group, tool] of [
      ['eyes', 'eyecolor'],
      ['hair', 'haircolor'],
      ['makeup', 'lips'],
      ['makeup', 'eyeshadow'],
    ] as const) {
      await page.locator(`[data-group=${group}]`).tap();
      await page.locator(`[data-tool=${tool}]`).tap();
      await expect(picker(page)).toBeVisible({ timeout: 60_000 });
      const swatches = await allReachable(page);
      const last = swatches.last();
      await last.tap();
      await expect(last).toHaveAttribute('aria-pressed', 'true');
    }
    // The full picker fits the panel too, with its knob at the far corner.
    await picker(page).getByRole('button', { name: 'Cor personalizada' }).tap();
    const square = picker(page).getByRole('slider', { name: 'Saturação e brilho' });
    await square.scrollIntoViewIfNeeded();
    const b = (await square.boundingBox())!;
    await page.mouse.click(b.x + b.width - 1, b.y + 1);
    const [scroll, client] = await page.locator('.panel').evaluate((el) => [el.scrollWidth, el.clientWidth]);
    expect(scroll).toBeLessThanOrEqual(client);
    for (const name of ['Matiz', 'Código da cor', 'Pronto']) {
      const box = (await picker(page).getByRole(name === 'Pronto' ? 'button' : name === 'Matiz' ? 'slider' : 'textbox', { name }).boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    // The freckles have their pigment under another name.
    await page.locator('[data-tool=freckles]').tap();
    await expect(page.getByRole('group', { name: 'Pigmento' })).toBeVisible();
    expectNoErrors(errors);
  });
});

test.describe('seletor de cor', () => {
  test('uma cor qualquer do quadrado vai para a foto, e volta com um só Desfazer', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await pickTool(page, 'hair', 'haircolor', { auto: true });
    const group = picker(page);
    const first = group.locator('.swatch').first();
    await first.click();
    await settle(page, 300);
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    const before = await page.screenshot();

    await group.getByRole('button', { name: 'Cor personalizada' }).click();
    const square = group.getByRole('slider', { name: 'Saturação e brilho' });
    const hue = group.getByRole('slider', { name: 'Matiz' });
    await expect(square).toBeVisible();
    const hex = group.getByRole('textbox', { name: 'Código da cor' });
    await expect(hex).toHaveValue(await first.getAttribute('aria-label').then((l) => l!.replace('Cor ', '')));

    // A hue near green, then a drag across the square: the color follows the pointer the whole way.
    const h = (await hue.boundingBox())!;
    await page.mouse.click(h.x + h.width * 0.33, h.y + h.height / 2);
    const s = (await square.boundingBox())!;
    await page.mouse.move(s.x + s.width * 0.3, s.y + s.height * 0.5);
    await page.mouse.down();
    const seen = new Set<string>();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(s.x + s.width * (0.3 + i * 0.1), s.y + s.height * (0.5 - i * 0.04));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      seen.add(await hex.inputValue());
    }
    await page.mouse.up();
    expect(seen.size).toBeGreaterThan(3);
    const picked = await hex.inputValue();
    expect(picked).toMatch(/^#[0-9a-f]{6}$/);
    // Green: the second byte leads.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(picked.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    await settle(page, 400);
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    const after = await page.screenshot();
    expect(await meanDiff(page, before, after, photo(page))).toBeGreaterThan(0.3);

    // The color is kept as one of yours, next to the presets.
    await expect(group.getByRole('button', { name: `Cor sua ${picked}` })).toBeVisible();

    // The hue click and the drag are two picks; each one is one step back.
    await expect(undo(page)).toHaveAttribute('title', 'Desfazer: Ajuste');
    await undo(page).click();
    await settle(page, 300);
    await expect(hex).not.toHaveValue(picked);
    await undo(page).click();
    await settle(page, 400);
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(await meanDiff(page, before, await page.screenshot(), photo(page))).toBeLessThan(0.3);

    // A code typed in the field is a color too.
    await hex.fill('#3366cc');
    await hex.press('Enter');
    await settle(page, 300);
    await expect(group.getByRole('button', { name: 'Cor sua #3366cc' })).toHaveAttribute('aria-pressed', 'true');
    expectNoErrors(errors);
  });
});
