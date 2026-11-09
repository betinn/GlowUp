import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { DEV_ORIGIN } from '../../playwright.config';
import { expectNoErrors, imageRect, meanDiff, openEditor, pickTool, setSlider, settle } from './helpers';

test.use({ baseURL: DEV_ORIGIN });

async function exportPng(page: Page): Promise<Buffer> {
  await page.getByTestId('export-open').click();
  await page.getByRole('radio', { name: 'PNG' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-go').click()]);
  const path = await download.path();
  await expect(page.getByText('Prontinho. Tá na sua pasta.')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar a editar' }).click();
  await expect(page.getByTestId('export-go')).toHaveCount(0);
  await settle(page, 300);
  return readFileSync(path);
}

/** Mean light of a patch of a PNG, and how much it varies from pixel to pixel. Coordinates are image shares. */
async function patch(page: Page, png: Buffer, u: number, v: number): Promise<{ light: number; rough: number }> {
  const other = await page.context().newPage();
  const result = await other.evaluate(
    async ([data, x, y]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data as string}`;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const side = 40;
      const px = Math.min(img.width - side, Math.round((x as number) * img.width));
      const py = Math.min(img.height - side, Math.round((y as number) * img.height));
      const d = g.getImageData(px, py, side, side).data;
      let sum = 0;
      let rough = 0;
      for (let i = 0; i < d.length - 4; i += 4) {
        sum += d[i + 1];
        rough += Math.abs(d[i + 1] - d[i + 5]);
      }
      return { light: sum / (d.length / 4), rough: rough / (d.length / 4) };
    },
    [png.toString('base64'), u, v] as const,
  );
  await other.close();
  return result;
}

/** Runs a script in the page, with the app's modules at hand and the engine as `e`. */
function inPage<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(`(async () => {
    const use = (path) => import(/* @vite-ignore */ path);
    const { engine } = await use('/src/ui/state.svelte.ts');
    const e = engine();
    ${body}
  })()`) as Promise<T>;
}

test.describe('menu Filtros', () => {
  test('Filtros fica no lugar de Looks, com categorias e intensidade', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openEditor(page);
    await expect(page.locator('[data-group=looks]')).toHaveCount(0);
    await pickTool(page, 'filters', 'filters');
    await expect(page.getByRole('tab', { name: 'Todos' })).toHaveAttribute('aria-selected', 'true');
    // One button for each file in the folder of filters.
    const files = readdirSync('src/presets/filters').length;
    await expect(page.locator('[data-filter]')).toHaveCount(files);

    await page.getByRole('tab', { name: 'Mono' }).click();
    await expect(page.locator('[data-filter=prata]')).toBeVisible();
    await expect(page.locator('[data-filter=mel]')).toHaveCount(0);

    // One filter at a time: picking another takes the place of the first, and the intensity comes along.
    await page.locator('[data-filter=prata]').click();
    await setSlider(page, 'Intensidade', 40);
    await page.locator('[data-filter=carvao]').click();
    await expect(page.locator('[data-filter=prata]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-filter=carvao]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('slider', { name: 'Intensidade' })).toHaveValue('40');
    expectNoErrors(errors);
  });

  test('a sugestão vem do tom da foto e a pessoa pode trocar', async ({ page }) => {
    await openEditor(page);
    const plain = await page.screenshot();
    await pickTool(page, 'filters', 'filters');
    const suggestion = page.getByTestId('filter-suggestion');
    await expect(suggestion).toContainText('Sugestão para esta foto');
    const id = await suggestion.getAttribute('data-suggested');
    expect(id).toBeTruthy();
    // It only suggests: nothing changed on the photo until a tap.
    expect(await inPage<string | null>(page, 'return e.doc.filter.id;')).toBeNull();
    await expect(page.getByRole('button', { name: 'Desfazer' })).toBeDisabled();

    await suggestion.click();
    await settle(page, 500);
    expect(await inPage<string | null>(page, 'return e.doc.filter.id;')).toBe(id);
    expect(await meanDiff(page, plain, await page.screenshot())).toBeGreaterThan(0.5);

    const other = id === 'mel' ? 'gelo' : 'mel';
    await page.locator(`[data-filter=${other}]`).click();
    await settle(page, 300);
    expect(await inPage<string | null>(page, 'return e.doc.filter.id;')).toBe(other);
    await expect(suggestion).toHaveAttribute('aria-pressed', 'false');
  });

  test('o arquivo de um filtro novo funciona sem mudar o código de render', async ({ page }) => {
    await openEditor(page);
    // A filter made only of data, with a measured table, grain and vignette, as the replication script writes.
    const applied = await inPage<boolean>(
      page,
      `const { FILTERS } = await use('/src/presets/luts.ts');
       const { setFilter } = await use('/src/presets/apply.ts');
       const size = 3;
       const data = new Uint16Array(size ** 3 * 3);
       let i = 0;
       for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
         data[i++] = (b / 2) * 65535; data[i++] = (g / 2) * 65535; data[i++] = (r / 2) * 65535;
       }
       FILTERS.push({ id: 'teste-novo', name: 'Teste', category: 'Natural', grain: 40, vignette: 60,
         lut: { size, table: btoa(String.fromCharCode(...new Uint8Array(data.buffer))) } });
       await setFilter(e, 'teste-novo', 1);
       return e.loadedLut === 'teste-novo';`,
    );
    expect(applied).toBe(true);
    await settle(page, 400);
    const png = await exportPng(page);
    expect(await inPage<number>(page, 'return e.pipeline.filterGrain;')).toBe(40);
    const middle = await patch(page, png, 0.5, 0.5);
    const corner = await patch(page, png, 0, 0);
    // The table swaps red and blue, and the vignette darkens only the corners.
    expect(corner.light).toBeLessThan(middle.light);
    expect(middle.rough).toBeGreaterThan(0.5);
  });

  test('exporta o filtro com tudo que ele traz, e o limite de área vale para grão e vinheta', async ({ page }) => {
    await openEditor(page);
    const plain = await exportPng(page);
    await pickTool(page, 'filters', 'filters');
    await page.locator('[data-filter=cinema-tarde]').click();
    await setSlider(page, 'Intensidade', 100);
    await settle(page, 400);
    const filtered = await exportPng(page);
    expect(await meanDiff(page, plain, filtered)).toBeGreaterThan(2);
    // Same as the render: exports twice to the same result, grain included.
    expect(await meanDiff(page, filtered, await exportPng(page))).toBeLessThan(0.05);

    // At zero intensity, nothing the filter brings is left: no table, no grain, no vignette.
    await setSlider(page, 'Intensidade', 0);
    await settle(page, 400);
    expect(await meanDiff(page, plain, await exportPng(page))).toBeLessThan(0.05);

    // Limited to an area that is empty, the filter shows nowhere, not even in the corners.
    await setSlider(page, 'Intensidade', 100);
    await inPage(page, `e.setFilterArea({ masked: true }); e.commit();`);
    await settle(page, 400);
    expect(await meanDiff(page, plain, await exportPng(page))).toBeLessThan(0.05);
  });

  test('comparar sem filtro tira grão e vinheta do filtro também', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'filters', 'filters');
    await page.mouse.move(2, 2);
    await settle(page, 500);
    const r = imageRect(page);
    const clip = { x: r.x, y: r.y, width: r.w, height: r.h };
    const plain = await page.screenshot({ clip });
    await page.locator('[data-filter=cinema-tarde]').click();
    await setSlider(page, 'Intensidade', 100);
    await page.mouse.move(2, 2);
    await settle(page, 500);
    expect(await meanDiff(page, plain, await page.screenshot({ clip }))).toBeGreaterThan(2);
    await page.getByTestId('compare-filter').hover();
    await page.mouse.down();
    await settle(page, 450);
    const held = await page.screenshot({ clip });
    await page.mouse.up();
    expect(await meanDiff(page, plain, held)).toBeLessThan(0.5);
  });
});
