import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectNoErrors, facePoint, imageRect, openEditor, paint, pickTool, scribble, setSlider, settle } from './helpers';

/** Reads width and height from PNG or JPEG bytes. */
function imageSize(b: Buffer): { w: number; h: number; type: string } {
  if (b[0] === 0x89) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: 'png' };
  if (b[0] === 0xff) {
    let i = 2;
    while (i < b.length) {
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xc3) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), type: 'jpeg' };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString('ascii', 8, 12) === 'WEBP') return { w: 0, h: 0, type: 'webp' };
  throw new Error('unknown image');
}

async function exportFile(page: Page, label: string): Promise<Buffer> {
  await page.getByTestId('export-open').click();
  await page.getByRole('radio', { name: label }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-go').click()]);
  const path = await download.path();
  await expect(page.getByText('Prontinho. Tá na sua pasta.')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar a editar' }).click();
  return readFileSync(path);
}

/** Mean absolute difference between two PNGs, in 8-bit levels per channel. */
async function meanDiff(page: Page, a: Buffer, b: Buffer): Promise<number> {
  const other = await page.context().newPage();
  const diff = await other.evaluate(
    async ([x, y]) => {
      const load = async (s: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${s}`;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height).data;
      };
      const [p, q] = await Promise.all([load(x), load(y)]);
      let sum = 0;
      for (let i = 0; i < p.length; i++) sum += Math.abs(p[i] - q[i]);
      return sum / p.length;
    },
    [a.toString('base64'), b.toString('base64')],
  );
  await other.close();
  return diff;
}

/** Largest mean difference along any single row or column: a tile seam shows up here. */
async function worstLine(page: Page, a: Buffer, b: Buffer): Promise<number> {
  const other = await page.context().newPage();
  other.on('console', (m) => console.log(m.text()));
  const worst = await other.evaluate(
    async ([x, y]) => {
      const load = async (s: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${s}`;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        return { d: g.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
      };
      const [p, q] = await Promise.all([load(x), load(y)]);
      const rows = new Float64Array(p.h);
      const cols = new Float64Array(p.w);
      for (let j = 0; j < p.h; j++) {
        for (let i = 0; i < p.w; i++) {
          const k = (j * p.w + i) * 4;
          const v = (Math.abs(p.d[k] - q.d[k]) + Math.abs(p.d[k + 1] - q.d[k + 1]) + Math.abs(p.d[k + 2] - q.d[k + 2])) / 3;
          rows[j] += v / p.w;
          cols[i] += v / p.h;
        }
      }
      const r = rows.indexOf(Math.max(...rows));
      const c = cols.indexOf(Math.max(...cols));
      console.log(`worst row ${r}=${rows[r].toFixed(2)} col ${c}=${cols[c].toFixed(2)}`);
      return Math.max(rows[r], cols[c]);
    },
    [a.toString('base64'), b.toString('base64')],
  );
  await other.close();
  return worst;
}

/** Screenshot of the photo only: panels change on their own and do not matter here. */
const canvasShot = (page: Page) => {
  const r = imageRect(page);
  return page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
};

test.describe('fluxos', () => {
  let errors: string[];

  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
  });

  test.afterEach(() => expectNoErrors(errors));

  test('tela inicial com título e sem CSP quebrada', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Glowup');
    await expect(page.getByText('Solta a foto aqui.')).toBeVisible();
  });

  test('onboarding aparece uma vez', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('[data-testid=file-input]', 'tests/fixtures/gradient.png');
    await expect(page.getByRole('dialog', { name: 'Como usar' })).toBeVisible();
    for (let i = 0; i < 3; i++) await page.getByTestId('onboarding-next').click();
    await expect(page.getByRole('dialog', { name: 'Como usar' })).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('glowup.onboarded'))).toBe('true');
  });

  test('desfazer e refazer restauram os pixels exatos', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'makeup', 'blush');
    await page.mouse.move(2, 2);
    await settle(page, 300);
    const clean = await canvasShot(page);
    await paint(page, scribble(-0.15, 0.1, 0.08, 0.08, 6), 2);
    const painted = await canvasShot(page);
    expect(painted.equals(clean)).toBe(false);

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await page.mouse.move(2, 2);
    await settle(page, 500);
    expect((await canvasShot(page)).equals(clean)).toBe(true);

    await page.keyboard.press('Control+Shift+Z');
    await page.keyboard.press('Control+Shift+Z');
    await settle(page, 500);
    expect((await canvasShot(page)).equals(painted)).toBe(true);
  });

  test('borracha remove o que foi pintado', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'makeup', 'lips');
    await page.mouse.move(2, 2);
    await settle(page, 300);
    const clean = await canvasShot(page);
    await paint(page, [[-0.1, 0.1], [0.1, 0.1]]);
    await page.getByRole('button', { name: 'Borracha' }).click();
    await page.getByRole('slider', { name: 'Tamanho' }).fill('70');
    await paint(page, [[-0.12, 0.1], [0.12, 0.1]], 3);
    expect(await meanDiff(page, await canvasShot(page), clean)).toBeLessThan(0.15);
  });

  test('exporta PNG, JPG e WebP em resolução total', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'light', 'adjust');
    const png = imageSize(await exportFile(page, 'PNG'));
    expect(png).toMatchObject({ w: 1500, h: 1875, type: 'png' });
    const jpg = imageSize(await exportFile(page, 'JPG'));
    expect(jpg).toMatchObject({ w: 1500, h: 1875, type: 'jpeg' });
    const webp = imageSize(await exportFile(page, 'WebP'));
    expect(webp.type).toBe('webp');
  });

  test('recorte 1:1 muda o tamanho exportado', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'frame', 'crop');
    await page.getByRole('radio', { name: '1:1' }).click();
    await settle(page, 400);
    const size = imageSize(await exportFile(page, 'PNG'));
    expect(size).toMatchObject({ w: 1500, h: 1500 });
  });

  test('girar troca largura e altura', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'frame', 'crop');
    await page.getByRole('button', { name: 'Girar para a direita' }).click();
    await settle(page, 400);
    const size = imageSize(await exportFile(page, 'PNG'));
    expect(size).toMatchObject({ w: 1875, h: 1500 });
  });

  test('o projeto volta com as edições depois de recarregar', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'skin', 'heal');
    await pickTool(page, 'makeup', 'blush');
    await paint(page, scribble(-0.15, 0.1, 0.08, 0.08, 6), 3);
    await pickTool(page, 'shape', 'liquify');
    await paint(page, [[-0.29, 0.14], [-0.25, 0.14]]);
    await pickTool(page, 'light', 'adjust');
    await page.getByRole('slider', { name: 'Exposição' }).fill('30');
    await page.mouse.move(2, 2);
    await settle(page, 400);
    await page.locator('[data-group=light]').click();
    await page.mouse.move(2, 2);
    await settle(page, 300);
    const edited = await canvasShot(page);

    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await expect(page.getByText('De onde parou')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /Continuar/ }).first().click();
    await page.locator('[data-group=skin]').waitFor();
    await page.mouse.move(2, 2);
    await settle(page, 1500);
    expect((await canvasShot(page)).equals(edited)).toBe(true);
  });

  test('segurar compara, tocar divide', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'looks', 'filters');
    await page.locator('[data-filter=prata]').click();
    await page.mouse.move(2, 2);
    await settle(page, 500);
    const edited = await canvasShot(page);
    await page.keyboard.down('Backslash');
    await settle(page, 300);
    expect((await canvasShot(page)).equals(edited)).toBe(false);
    await page.keyboard.up('Backslash');
    await settle(page, 300);
    expect((await canvasShot(page)).equals(edited)).toBe(true);
    await page.getByTestId('compare').click();
    await expect(page.getByRole('button', { name: 'Mover divisão antes e depois' })).toBeVisible();
    await settle(page, 1100);
  });

  test('receita aplica ajustes e filtro, e pode ser criada', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'looks', 'presets');
    await page.locator('[data-preset=glow]').click();
    await settle(page, 600);
    await page.getByPlaceholder('Dar nome à edição atual').fill('Minha');
    await page.getByRole('button', { name: 'Salvar receita' }).click();
    await expect(page.getByRole('button', { name: 'Apagar receita Minha' })).toBeVisible();
    await pickTool(page, 'light', 'adjust');
    await expect(page.getByRole('slider', { name: 'Exposição' })).toHaveValue('6');
  });

  test('a grade de tiles não muda o resultado da exportação', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'skin', 'smooth');
    await paint(page, scribble(0, 0.05, 0.22, 0.25, 8));
    await pickTool(page, 'skin', 'undereye');
    await paint(page, [[-0.21, -0.012], [0.21, -0.012]]);
    await pickTool(page, 'skin', 'highlight');
    await paint(page, [[-0.1, 0.1], [0.1, 0.1]], 2);
    await pickTool(page, 'shape', 'liquify');
    await paint(page, [[-0.29, 0.14], [-0.24, 0.14]]);
    await pickTool(page, 'light', 'adjust');
    await setSlider(page, 'Sombras', 50);
    await setSlider(page, 'Realces', -40);
    await setSlider(page, 'Nitidez', 40);
    await setSlider(page, 'Granulação', 20);
    await pickTool(page, 'looks', 'filters');
    await page.locator('[data-filter=mel]').click();
    await settle(page, 400);
    const whole = await exportFile(page, 'PNG');
    await page.evaluate(() => localStorage.setItem('glowup.tile', '512'));
    const tiled = await exportFile(page, 'PNG');
    await page.evaluate(() => localStorage.removeItem('glowup.tile'));
    expect(await meanDiff(page, whole, tiled)).toBeLessThan(0.6);
    expect(await worstLine(page, whole, tiled)).toBeLessThan(2);
  });

  test('zoom mantém o pincel no lugar certo', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'makeup', 'lips');
    const [x, y] = facePoint(page, 0, 0.1);
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, -400);
    await settle(page, 400);
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.press('0');
    await page.mouse.move(2, 2);
    await settle(page, 400);
    await page.keyboard.press('m');
    await settle(page, 400);
    const clip = { x: x - 8, y: y - 8, width: 16, height: 16 };
    const center = await page.screenshot({ clip });
    await page.keyboard.press('m');
    await settle(page, 400);
    expect(center.equals(await page.screenshot({ clip }))).toBe(false);
  });
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('layout de toque com doca e folha', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openEditor(page);
    await page.locator('[data-group=makeup]').tap();
    await page.locator('[data-tool=whiten]').tap();
    await expect(page.getByRole('slider', { name: 'Tirar o amarelo' })).toBeAttached();
    await settle(page, 500);
    await page.screenshot({ path: 'docs/visual-checks/ui-celular-ferramenta.png' });
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(noOverflow).toBe(true);
    expectNoErrors(errors);
  });
});
