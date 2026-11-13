import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../../src/tools/catalog';
import { chooseMode, expectNoErrors, openEditor, openGroup, openTab, setSlider, settle, tap } from './helpers';

/**
 * Tools open in Manual and download nothing: a model comes only when the person asks for it. And in Manchas the
 * automatic mode and the brush share one set of spots, each with its ring, in both modes.
 */

const fixture = JSON.parse(readFileSync('tests/fixtures/portrait.json', 'utf8')) as { blemishes: { x: number; y: number; r: number }[] };

/** A model, or the runtime that runs one: the detector, the segmenters, ONNX and its WebAssembly. */
const MODEL = /\.(onnx|tflite|task|wasm|binarypb)(\?|$)/i;

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('XNNPACK')) errors.push(m.text());
  });
  return errors;
}

/** Every request for a model from here on. */
function models(page: Page): string[] {
  const seen: string[] = [];
  page.context().on('request', (r) => {
    if (MODEL.test(new URL(r.url()).pathname)) seen.push(r.url());
  });
  return seen;
}

const undoButton = (page: Page) => page.getByRole('button', { name: 'Desfazer' });
const healSpots = (page: Page) => page.getByTestId('heal-spot');

async function openHeal(page: Page): Promise<void> {
  await page.locator('[data-group=skin]').click();
  await page.locator('[data-tool=heal]').click();
  await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'manual');
  await settle(page, 300);
}

const goTab = async (page: Page, id: string) => {
  await openTab(page, id);
  await expect(page.locator(`[data-path=${id}]`)).toHaveAttribute('aria-pressed', 'true');
  await settle(page, 300);
};

test.describe('ferramentas sem download', () => {
  test('abrir cada ferramenta e cada menu não baixa nem roda modelo, e começa no Manual', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const asked = models(page);

    for (const tool of TOOLS) {
      await openGroup(page, tool.group);
      const button = page.locator(`[data-tool=${tool.id}]`);
      if (!(await button.count())) continue;
      if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
      await settle(page, 250);
      if (await page.locator('[data-limit]').count()) {
        await expect(page.locator('[data-limit]'), tool.id).toHaveAttribute('data-limit', 'off');
        await expect(page.getByTestId('tool-mode'), tool.id).toHaveAttribute('data-mode', 'manual');
      }
      if (tool.kind === 'shape') await expect(page.locator('[data-shape]'), tool.id).toHaveAttribute('data-shape', 'idle');
    }
    // A slider of the face menu waits for its face, with no download until it moves.
    await openGroup(page, 'shape');
    await page.locator('[data-tool=faceshape]').click();
    await expect(page.getByTestId('shape-idle')).toBeVisible();

    // The menus of the other tabs, Luzes included, read nothing either.
    await goTab(page, 'glow');
    await page.getByTestId('looks').waitFor();
    await goTab(page, 'fun');
    await expect(page.locator('[data-fun=idle]')).toHaveCount(1);
    await goTab(page, 'filters');
    await settle(page, 600);
    await page.getByRole('tab', { name: 'Luzes' }).click();
    await expect(page.locator('[data-light]')).toHaveCount(4);
    await settle(page, 300);

    expect(asked, asked.join('\n')).toEqual([]);
    expectNoErrors(errors);
  });

  test('a busca só começa com um toque: Automático, a chave do pincel ou um controle do rosto', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const asked = models(page);

    await page.locator('[data-group=makeup]').click();
    await page.locator('[data-tool=whiten]').click();
    await settle(page, 300);
    expect(asked).toEqual([]);
    // The switch that keeps the brush on the teeth is the tap that finds them.
    await page.getByTestId('limit-toggle').click();
    await expect(page.locator('[data-limit=on]')).toHaveCount(1, { timeout: 60_000 });
    expect(asked.length).toBeGreaterThan(0);
    await expect(page.getByTestId('tool-mode')).toHaveAttribute('data-mode', 'manual');

    // A slider of the face menu finds the face and the person, then its number lands.
    await page.locator('[data-group=shape]').click();
    await page.locator('[data-tool=faceshape]').click();
    await expect(page.locator('[data-shape=idle]')).toHaveCount(1);
    await setSlider(page, 'Linha da mandíbula', 40);
    await expect(page.locator('[data-shape=on]')).toHaveCount(1, { timeout: 90_000 });
    await settle(page);
    await expect(page.getByRole('slider', { name: 'Linha da mandíbula', exact: true })).toHaveValue('40');
    await expect(page.locator('[data-tool=faceshape]')).toHaveAttribute('data-effect', 'on');
    expectNoErrors(errors);
  });
});

test.describe('Manchas, automático e manual juntos', () => {
  test('Automático, Manual e Automático de novo guardam as manchas, e quem foi tirada fica fora', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openHeal(page);
    await expect(healSpots(page)).toHaveCount(0);

    await chooseMode(page, 'Automático');
    await expect(page.getByText(/Aplicado nas manchas que achei/)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-region-show=idle]')).toHaveCount(1, { timeout: 30_000 });
    await page.keyboard.press('0');
    await settle(page, 400);
    const count = await healSpots(page).count();
    expect(count).toBeGreaterThanOrEqual(15);
    const asked = models(page);

    // Manual keeps every spot and its ring, and a tap on a ring takes that one back.
    await chooseMode(page, 'Manual');
    await expect(healSpots(page)).toHaveCount(count);
    const ring = healSpots(page).nth(2);
    const box = (await ring.boundingBox())!;
    await ring.click();
    await settle(page, 300);
    await expect(healSpots(page)).toHaveCount(count - 1);
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Tirar correção');

    // Back in Automático nothing is searched again and nothing comes back.
    await chooseMode(page, 'Automático');
    await expect(page.locator('[data-limit=on]')).toHaveCount(1);
    await settle(page, 800);
    await expect(healSpots(page)).toHaveCount(count - 1);
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Tirar correção');

    // The brush heals a spot in Manual, and it joins the others.
    await chooseMode(page, 'Manual');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(2, 2);
    await settle(page, 600);
    await expect(healSpots(page)).toHaveCount(count);
    await expect(undoButton(page)).toHaveAttribute('title', 'Desfazer: Mancha');
    await chooseMode(page, 'Automático');
    await settle(page, 600);
    await expect(healSpots(page)).toHaveCount(count);

    // Undo steps back through it all, and redo forward again.
    await undoButton(page).click();
    await settle(page, 300);
    await expect(healSpots(page)).toHaveCount(count - 1);
    await undoButton(page).click();
    await settle(page, 300);
    await expect(healSpots(page)).toHaveCount(count);
    await page.getByRole('button', { name: 'Refazer' }).click();
    await settle(page, 300);
    await expect(healSpots(page)).toHaveCount(count - 1);

    expect(asked, asked.join('\n')).toEqual([]);
    expectNoErrors(errors);
  });

  test('no Manual, sem baixar nada, a mancha tocada ganha círculo e um toque nele tira a correção', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const asked = models(page);
    await openHeal(page);
    await expect(page.getByTestId('limit-toggle')).toHaveAttribute('aria-checked', 'false');

    const b = fixture.blemishes[0];
    await tap(page, b.x, b.y);
    await expect(healSpots(page)).toHaveCount(1);
    await expect(page.getByText('Toque num círculo para tirar só aquela correção.')).toBeVisible();
    await healSpots(page).first().click();
    await settle(page, 300);
    await expect(healSpots(page)).toHaveCount(0);
    await undoButton(page).click();
    await settle(page, 300);
    await expect(healSpots(page)).toHaveCount(1);

    expect(asked, asked.join('\n')).toEqual([]);
    expectNoErrors(errors);
  });

  test('o projeto salvo guarda as manchas e de onde cada uma veio', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    await openHeal(page);
    const b = fixture.blemishes[0];
    await tap(page, b.x, b.y);
    await chooseMode(page, 'Automático');
    await expect(page.getByText(/Aplicado nas manchas que achei/)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-region-show=idle]')).toHaveCount(1, { timeout: 30_000 });
    await page.keyboard.press('0');
    await settle(page, 400);
    const count = await healSpots(page).count();
    expect(count).toBeGreaterThan(5);

    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await expect(page.getByText('De onde parou')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /Continuar/ }).first().click();
    await page.locator('[data-group=skin]').waitFor();
    await settle(page, 800);
    const asked = models(page);
    await openHeal(page);
    await expect(healSpots(page)).toHaveCount(count);
    expect(asked, asked.join('\n')).toEqual([]);

    // The spots of the automatic mode are known as its own: Automático finds them on and adds no step.
    await chooseMode(page, 'Automático');
    await expect(page.locator('[data-limit=on]')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByText(/Aplicado nas manchas que achei/)).toBeVisible();
    await settle(page, 800);
    await expect(healSpots(page)).toHaveCount(count);
    await expect(undoButton(page)).toBeDisabled();
    expectNoErrors(errors);
  });
});
