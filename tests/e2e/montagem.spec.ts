import { expect, test, type Locator, type Page } from '@playwright/test';
import { inflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { settle } from './helpers';

const FIXTURES = ['portrait.png', 'group.png', 'gradient.png'].map((f) => `tests/fixtures/${f}`);

const shot = (name: string) => `docs/visual-checks/ui-${name}.png`;

/** The table with every photo on it. */
const table = (page: Page) => page.locator('[data-testid=studio].ready[data-loading="0"]');

async function quiet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('glowup.onboarded', 'true');
    localStorage.setItem('glowup.onboardedView', 'true');
    localStorage.setItem('glowup.fill', 'off');
  });
}

/** Chooses several photos on the home screen and waits for the table. */
async function openPost(page: Page, files = FIXTURES): Promise<void> {
  await quiet(page);
  await page.goto('/');
  await page.setInputFiles('[data-testid=files-input]', files);
  await table(page).waitFor({ timeout: 120_000 });
  await expect(page.getByTestId('opening')).toHaveCount(0);
  await settle(page, 400);
}

const kind = (page: Page, id: string) => page.locator(`[data-kind=${id}]`).click();

/** Opens a block of controls. On a wide screen all of them show, and there is no row to choose from. */
async function section(page: Page, id: string): Promise<void> {
  const chip = page.locator(`[data-section=${id}]`);
  if (await chip.isVisible()) await chip.click();
}

const order = (page: Page) => page.getByTestId('post-photo').evaluateAll((list) => list.map((el) => el.getAttribute('data-photo')));

/** Mean color of a slide as the table draws it, 0 to 255. */
async function slideColor(page: Page, index: number): Promise<[number, number, number]> {
  return page.locator('.page canvas').nth(index).evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += data[i + k];
    return sum.map((v) => v / (data.length / 4)) as [number, number, number];
  });
}

const slidePixels = (canvas: Locator) => canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());

/** The files inside a zip with no compression, as this app writes it. */
function unzip(bytes: Buffer): { name: string; data: Buffer }[] {
  const out: { name: string; data: Buffer }[] = [];
  let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    const method = bytes.readUInt16LE(at + 8);
    const size = bytes.readUInt32LE(at + 18);
    const nameLength = bytes.readUInt16LE(at + 26);
    const extra = bytes.readUInt16LE(at + 28);
    const start = at + 30 + nameLength + extra;
    const raw = bytes.subarray(start, start + size);
    out.push({ name: bytes.toString('utf8', at + 30, at + 30 + nameLength), data: method === 0 ? raw : inflateRawSync(raw) });
    at = start + size;
  }
  return out;
}

const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

test.describe('montagem de várias fotos', () => {
  test('várias fotos abrem como carrossel, uma foto por slide, com os três jeitos em abas', async ({ page }) => {
    await openPost(page);
    const studio = page.getByTestId('studio');
    await expect(studio).toHaveAttribute('data-post-kind', 'carousel');
    await expect(studio).toHaveAttribute('data-photos', '3');
    await expect(studio).toHaveAttribute('data-pages', '3');
    await expect(page.getByTestId('post-photo')).toHaveCount(3);
    await expect(page.getByTestId('post-dot')).toHaveCount(3);
    await expect(page.getByTestId('post-count')).toHaveText('1/3');
    await expect(page.locator('[data-kind]')).toHaveCount(3);
    await expect(page.locator('[data-kind=carousel]')).toHaveAttribute('aria-pressed', 'true');

    // A dot goes to its slide, and in a carousel the slide is the photo the buttons act on.
    await page.getByTestId('post-dot').nth(2).click();
    await expect(page.getByTestId('post-count')).toHaveText('3/3');
    await expect(page.getByTestId('post-photo').nth(2)).toHaveAttribute('aria-selected', 'true');
    // The arrows of the keyboard do the same.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('post-count')).toHaveText('2/3');

    // The same photos, in the same order, put together another way.
    await kind(page, 'collage');
    await expect(studio).toHaveAttribute('data-pages', '1');
    await expect(page.getByTestId('post-dot')).toHaveCount(0);
    await kind(page, 'strip');
    await expect(studio).toHaveAttribute('data-pages', '3');
    await section(page, 'layout');
    await page.getByRole('button', { name: 'Mais um slide' }).click();
    await expect(studio).toHaveAttribute('data-pages', '4');
    await expect(page.getByTestId('post-photo')).toHaveCount(3);
  });

  test('a ordem muda, uma foto sai, e desfazer traz de volta', async ({ page }) => {
    await openPost(page);
    const first = await order(page);
    await page.getByTestId('post-photo').nth(0).click();
    await section(page, 'photo');
    await expect(page.getByTestId('post-earlier')).toBeDisabled();
    await page.getByTestId('post-later').click();
    expect(await order(page)).toEqual([first[1], first[0], first[2]]);
    // The buttons stay on the photo that moved.
    await expect(page.getByTestId('post-photo').nth(1)).toHaveAttribute('aria-selected', 'true');

    await page.getByTestId('post-remove').click();
    expect(await order(page)).toEqual([first[1], first[2]]);
    await expect(page.getByTestId('studio')).toHaveAttribute('data-pages', '2');

    await page.getByRole('button', { name: 'Desfazer' }).click();
    expect(await order(page)).toEqual([first[1], first[0], first[2]]);
    await page.getByRole('button', { name: 'Desfazer' }).click();
    expect(await order(page)).toEqual(first);
    await page.getByRole('button', { name: 'Refazer' }).click();
    expect(await order(page)).toEqual([first[1], first[0], first[2]]);

    // The last photo of a post cannot leave it.
    await page.getByTestId('post-remove').click();
    await page.getByTestId('post-remove').click();
    await expect(page.getByTestId('post-photo')).toHaveCount(1);
    await expect(page.getByTestId('post-remove')).toBeDisabled();
  });

  test('a foto se arrasta dentro do slide e a roda aproxima, cada gesto uma etapa do desfazer', async ({ page }) => {
    await openPost(page);
    // The second photo is wider than the slide, so it has room to move sideways.
    await page.getByTestId('post-dot').nth(1).click();
    await settle(page, 600);
    const canvas = page.locator('.page canvas').nth(1);
    const before = await slidePixels(canvas);
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 60, cy, { steps: 6 });
    await page.mouse.up();
    await settle(page, 200);
    const dragged = await slidePixels(canvas);
    expect(dragged).not.toBe(before);

    await section(page, 'photo');
    const zoom = page.getByRole('slider', { name: 'Aproximar' });
    await expect(zoom).toHaveValue('100');
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -300);
    await settle(page, 200);
    expect(Number(await zoom.inputValue())).toBeGreaterThan(120);

    // The wheel is one step and the drag is another.
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect(zoom).toHaveValue('100');
    await settle(page, 200);
    expect(await slidePixels(canvas)).toBe(dragged);
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await settle(page, 200);
    expect(await slidePixels(canvas)).toBe(before);
  });

  test('a foto inteira ganha o fundo desfocado ou uma cor, e o formato muda o slide', async ({ page }) => {
    await openPost(page);
    await page.getByTestId('post-dot').nth(1).click();
    await settle(page, 500);
    const canvas = page.locator('.page canvas').nth(1);
    const filled = await slidePixels(canvas);
    await section(page, 'fit');
    await page.getByRole('radio', { name: 'Foto inteira' }).click();
    await settle(page, 200);
    const blurred = await slidePixels(canvas);
    expect(blurred).not.toBe(filled);
    await expect(page.getByTestId('post-blur')).toHaveAttribute('aria-checked', 'true');
    // White around a wide photo on a tall slide: the corner of the slide is white.
    await page.getByRole('radio', { name: 'Branco' }).click();
    await settle(page, 200);
    const corner = await canvas.evaluate((el) => [...(el as HTMLCanvasElement).getContext('2d')!.getImageData(4, 4, 1, 1).data]);
    expect(corner.slice(0, 3)).toEqual([255, 255, 255]);

    const tall = (await canvas.boundingBox())!;
    expect(tall.height / tall.width).toBeCloseTo(5 / 4, 1);
    await section(page, 'format');
    await page.locator('[data-ratio="1:1"]').click();
    await settle(page, 300);
    const square = (await canvas.boundingBox())!;
    expect(square.height / square.width).toBeCloseTo(1, 1);
  });

  test('os arquivos saem um por slide, numerados, num zip, no tamanho pedido', async ({ page }) => {
    await openPost(page);
    await page.getByTestId('post-export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    await expect(page.getByTestId('post-export-size')).toContainText('3 slides de 1080 × 1350 px');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('post-export-go').click()]);
    await expect(page.getByTestId('post-exported')).toHaveAttribute('data-files', '3', { timeout: 120_000 });
    expect(download.suggestedFilename()).toMatch(/^glowup-[a-z0-9]+\.zip$/);
    const files = unzip(readFileSync((await download.path())!));
    expect(files.map((f) => f.name.replace(/^glowup-[a-z0-9]+/, ''))).toEqual(['-01.png', '-02.png', '-03.png']);
    for (const file of files) expect(pngSize(file.data)).toEqual({ w: 1080, h: 1350 });

    // One slide alone comes down with a tap on it.
    const [single] = await Promise.all([page.waitForEvent('download'), page.getByTestId('post-file').nth(1).click()]);
    expect(single.suggestedFilename()).toMatch(/-02\.png$/);
    await page.getByRole('button', { name: 'Voltar a montar' }).click();

    // A collage is one file, with no zip around it, at the width asked for.
    await kind(page, 'collage');
    await page.getByTestId('post-export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    await page.getByRole('radio', { name: '1440 px' }).click();
    const [image] = await Promise.all([page.waitForEvent('download'), page.getByTestId('post-export-go').click()]);
    await expect(page.getByTestId('post-exported')).toHaveAttribute('data-files', '1', { timeout: 120_000 });
    expect(image.suggestedFilename()).toMatch(/^glowup-[a-z0-9]+\.png$/);
    expect(pngSize(readFileSync((await image.path())!))).toEqual({ w: 1440, h: 1800 });
  });

  test('a faixa contínua sai cortada em slides que, lado a lado, são a foto inteira', async ({ page }) => {
    // A photo twice as wide as the slide is tall: two slides hold it whole, with nothing cropped.
    await openPost(page, [FIXTURES[1]]);
    await kind(page, 'strip');
    await section(page, 'format');
    await page.locator('[data-ratio="4:5"]').click();
    await section(page, 'frame');
    await page.getByRole('slider', { name: 'Espaço' }).fill('0');
    const studio = page.getByTestId('studio');
    await expect(studio).toHaveAttribute('data-pages', '2');
    await page.getByTestId('post-export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('post-export-go').click()]);
    await expect(page.getByTestId('post-exported')).toHaveAttribute('data-files', '2', { timeout: 120_000 });
    const [left, right] = unzip(readFileSync((await download.path())!));
    expect(pngSize(left.data)).toEqual({ w: 1080, h: 1350 });
    // The two files side by side against the photo drawn once at the size of the strip: the same picture, with
    // no column missing, repeated or shifted where one slide ends and the next begins.
    const seam = await page.evaluate(
      async ([a, b, whole]) => {
        const load = async (s: string) => {
          const img = new Image();
          img.src = `data:image/png;base64,${s}`;
          await img.decode();
          return img;
        };
        const [l, r, photo] = await Promise.all([load(a), load(b), load(whole)]);
        const w = l.width;
        const h = l.height;
        const pixels = (draw: (g: OffscreenCanvasRenderingContext2D) => void) => {
          const g = new OffscreenCanvas(w * 2, h).getContext('2d')!;
          g.imageSmoothingQuality = 'high';
          draw(g);
          return g.getImageData(0, 0, w * 2, h).data;
        };
        const slides = pixels((g) => (g.drawImage(l, 0, 0), g.drawImage(r, w, 0)));
        const strip = pixels((g) => g.drawImage(photo, 0, 0, w * 2, h));
        const columns = (from: number, to: number) => {
          let sum = 0;
          let n = 0;
          for (let y = 0; y < h; y++) {
            for (let x = from; x < to; x++) {
              const i = (y * w * 2 + x) * 4;
              for (let k = 0; k < 3; k++) sum += Math.abs(slides[i + k] - strip[i + k]);
              n += 3;
            }
          }
          return sum / n;
        };
        return { all: columns(0, w * 2), cut: columns(w - 2, w + 2) };
      },
      [left.data.toString('base64'), right.data.toString('base64'), readFileSync(FIXTURES[1]).toString('base64')],
    );
    expect(seam.all).toBeLessThan(1);
    expect(seam.cut).toBeLessThan(1.5);
  });

  test('retocar uma foto leva ao editor e volta, com o retoque na montagem e a vizinha a um toque', async ({ page }) => {
    await openPost(page);
    const before = await slideColor(page, 0);
    expect(Math.abs(before[0] - before[2])).toBeGreaterThan(8);
    await page.getByTestId('post-photo').nth(0).click();
    await section(page, 'photo');
    await page.getByTestId('post-retouch').click();
    await page.getByTestId('tabs').waitFor({ timeout: 120_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    // The editor of a photo of a post goes back to the post, and shows where the photo is in it.
    await expect(page.getByTestId('post-pager')).toContainText('1/3');
    await expect(page.getByTestId('export-open')).toHaveCount(0);
    await page.locator('[data-path=filters]').click();
    await page.locator('[data-filter=prata]').click();
    await settle(page, 500);

    // The next photo of the post opens from here, and this one is saved on the way.
    await page.getByRole('button', { name: 'Próxima foto da montagem' }).click();
    await expect(page.getByTestId('post-pager')).toContainText('2/3', { timeout: 120_000 });
    await page.getByTestId('tabs').waitFor({ timeout: 120_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await page.getByTestId('post-done').click();
    await table(page).waitFor({ timeout: 120_000 });
    await settle(page, 600);
    // Back on the photo that was in the editor last.
    await expect(page.getByTestId('post-photo').nth(1)).toHaveAttribute('aria-selected', 'true');
    // The first slide is black and white now: the filter came with the photo.
    await page.getByTestId('post-dot').nth(0).click();
    await settle(page, 600);
    const after = await slideColor(page, 0);
    expect(Math.abs(after[0] - after[2])).toBeLessThan(Math.abs(before[0] - before[2]) / 4);

    // And it goes into the file.
    await page.getByTestId('post-export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('post-export-go').click()]);
    await expect(page.getByTestId('post-exported')).toBeVisible({ timeout: 120_000 });
    const [first] = unzip(readFileSync((await download.path())!));
    const gray = await page.evaluate(async (s) => {
      const img = new Image();
      img.src = `data:image/png;base64,${s}`;
      await img.decode();
      const c = new OffscreenCanvas(64, 80);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0, 64, 80);
      const { data } = g.getImageData(0, 0, 64, 80);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i] - data[i + 2];
      return Math.abs(sum / (data.length / 4));
    }, first.data.toString('base64'));
    expect(gray).toBeLessThan(Math.abs(before[0] - before[2]) / 4);
  });

  test('o filtro de uma foto vai para todas as outras, e dá para voltar atrás', async ({ page }) => {
    await openPost(page);
    /** How far from gray a slide is: the mean distance between red and blue. */
    const tint = async (index: number) => {
      await page.getByTestId('post-dot').nth(index).click();
      await settle(page, 500);
      const [r, , b] = await slideColor(page, index);
      return Math.abs(r - b);
    };
    const before = [await tint(1), await tint(2)];
    expect(before[0]).toBeGreaterThan(8);

    // With no filter on the photo, there is nothing to pass on, and the table says where a filter comes from.
    await page.getByTestId('post-photo').nth(0).click();
    await section(page, 'photo');
    await expect(page.getByTestId('post-spread')).toHaveCount(0);
    await expect(page.getByText('Um filtro posto nesta foto')).toBeVisible();

    await page.getByTestId('post-retouch').click();
    await page.getByTestId('tabs').waitFor({ timeout: 120_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await page.locator('[data-path=filters]').click();
    await page.locator('[data-filter=prata]').click();
    await settle(page, 500);
    await page.getByTestId('post-done').click();
    await table(page).waitFor({ timeout: 120_000 });
    await section(page, 'photo');

    await page.getByTestId('post-spread').click();
    await expect(page.getByRole('status')).toContainText('O filtro foi para as outras 2 fotos.', { timeout: 120_000 });
    await table(page).waitFor({ timeout: 120_000 });
    expect(await tint(1)).toBeLessThan(before[0] / 3);
    expect(await tint(2)).toBeLessThan(Math.max(1.5, before[1] / 3));

    // The photo that took the filter wears it in the editor too, as its own filter.
    await page.getByTestId('post-photo').nth(1).click();
    await section(page, 'photo');
    await expect(page.getByTestId('post-spread')).toBeVisible();

    await page.getByTestId('post-unspread').click();
    await expect(page.getByRole('status')).toContainText('voltaram a como estavam', { timeout: 60_000 });
    await table(page).waitFor({ timeout: 120_000 });
    expect(await tint(1)).toBeGreaterThan(before[0] * 0.8);
    await expect(page.getByTestId('post-unspread')).toHaveCount(0);
  });

  test('a montagem fica na tela inicial, como uma pilha, e abre de novo como foi deixada', async ({ page }) => {
    await openPost(page);
    await kind(page, 'collage');
    await section(page, 'layout');
    await page.getByTestId('post-model').nth(1).click();
    const model = await page.locator('[data-testid=post-model][aria-checked=true]').getAttribute('data-model');
    await page.getByTestId('post-back').click();

    const recent = page.getByTestId('recent-post');
    await expect(recent).toHaveCount(1);
    await expect(recent).toContainText('3');
    // The photos of a post are not on the list one by one.
    await expect(page.getByTestId('recent-photo')).toHaveCount(0);
    await recent.getByRole('button', { name: /^Continuar a montagem/ }).click();
    await table(page).waitFor({ timeout: 120_000 });
    await expect(page.getByTestId('studio')).toHaveAttribute('data-post-kind', 'collage');
    await expect(page.getByTestId('post-photo')).toHaveCount(3);
    await section(page, 'layout');
    await expect(page.locator('[data-testid=post-model][aria-checked=true]')).toHaveAttribute('data-model', model!);

    // Forgetting the post takes its photos with it.
    await page.getByTestId('post-back').click();
    await page.getByRole('button', { name: /^Esquecer/ }).click();
    await expect(page.getByTestId('recent-post')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('file-input')).toBeAttached();
    await expect(page.getByTestId('recent-photo')).toHaveCount(0);
    await expect(page.getByTestId('recent-post')).toHaveCount(0);
  });

  test('mais fotos entram pela fila, e a montagem para em dez', async ({ page }) => {
    await openPost(page, FIXTURES.slice(1));
    await page.setInputFiles('[data-testid=post-add]', [FIXTURES[2], FIXTURES[1]]);
    await expect(page.getByTestId('studio')).toHaveAttribute('data-photos', '4');
    await table(page).waitFor({ timeout: 120_000 });
    // The first of the new photos is the one the buttons act on.
    await expect(page.getByTestId('post-photo').nth(2)).toHaveAttribute('aria-selected', 'true');
    await page.setInputFiles('[data-testid=post-add]', Array.from({ length: 8 }, (_, i) => FIXTURES[1 + (i % 2)]));
    await expect(page.getByTestId('studio')).toHaveAttribute('data-photos', '10', { timeout: 120_000 });
    await table(page).waitFor({ timeout: 120_000 });
    await expect(page.getByTestId('post-add')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('até 10 fotos');
  });

  test('uma foto só também monta: do editor para a montagem, com o retoque, e cortada em slides', async ({ page }) => {
    await quiet(page);
    await page.addInitScript(() => localStorage.setItem('glowup.startPath', '"filters"'));
    await page.goto('/');
    await page.setInputFiles('[data-testid=file-input]', FIXTURES[2]);
    await page.getByTestId('filters-menu').waitFor({ timeout: 120_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await page.locator('[data-filter=prata]').click();
    await settle(page, 500);
    await page.getByTestId('export-open').click();
    await page.getByTestId('export-post').click();
    await table(page).waitFor({ timeout: 120_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await settle(page, 500);
    const studio = page.getByTestId('studio');
    await expect(studio).toHaveAttribute('data-photos', '1');
    // The retouch came along.
    const color = await slideColor(page, 0);
    expect(Math.abs(color[0] - color[2])).toBeLessThan(3);
    await kind(page, 'strip');
    await expect(studio).toHaveAttribute('data-pages', '2');

    // On the home screen it is a post now, and no longer a photo on its own.
    await page.getByTestId('post-back').click();
    await expect(page.getByTestId('recent-post')).toHaveCount(1);
    await expect(page.getByTestId('recent-photo')).toHaveCount(0);
  });

  test('a prévia mostra os slides como no feed, um por vez', async ({ page }) => {
    await openPost(page);
    await page.getByTestId('post-dot').nth(1).click();
    await page.getByTestId('post-preview-open').click();
    const preview = page.getByTestId('post-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('canvas')).toHaveCount(3);
    // It opens on the slide the person was looking at.
    await expect(page.getByTestId('post-preview-count')).toHaveText('2/3');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('post-preview-count')).toHaveText('3/3');
    await preview.getByRole('button', { name: 'Fechar' }).click();
    await expect(preview).toHaveCount(0);
  });

  test('telas da montagem', async ({ page }) => {
    await openPost(page);
    await page.screenshot({ path: shot('montagem-carrossel') });
    await kind(page, 'collage');
    await page.getByRole('slider', { name: 'Cantos' }).fill('45');
    await settle(page, 400);
    await page.screenshot({ path: shot('montagem-colagem') });
    await kind(page, 'strip');
    await settle(page, 600);
    await page.screenshot({ path: shot('montagem-continuo') });
    await page.getByTestId('post-preview-open').click();
    await settle(page, 600);
    await page.screenshot({ path: shot('montagem-previa') });
    await page.getByTestId('post-preview').getByRole('button', { name: 'Fechar' }).click();
    await page.getByTestId('post-export-open').click();
    await Promise.all([page.waitForEvent('download'), page.getByTestId('post-export-go').click()]);
    await expect(page.getByTestId('post-exported')).toBeVisible({ timeout: 120_000 });
    await settle(page, 1200);
    await page.screenshot({ path: shot('montagem-exportada') });
    await page.getByRole('button', { name: 'Voltar a montar' }).click();
    await kind(page, 'carousel');
    await page.getByTestId('post-retouch').click();
    await page.getByTestId('tabs').waitFor({ timeout: 120_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await settle(page, 2500);
    await page.screenshot({ path: shot('montagem-editor') });
  });

  test.describe('celular', () => {
    test.use({ viewport: { width: 375, height: 760 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    test('telas da montagem no celular', async ({ page }) => {
      await openPost(page);
      await page.screenshot({ path: shot('celular-montagem') });
      await page.locator('[data-kind=collage]').tap();
      await page.locator('[data-section=layout]').tap();
      await settle(page, 400);
      await page.screenshot({ path: shot('celular-montagem-colagem') });
      await page.locator('[data-kind=strip]').tap();
      await settle(page, 600);
      await page.screenshot({ path: shot('celular-montagem-continuo') });
    });

    test('tudo cabe na tela, e um toque na foto segura a foto para enquadrar', async ({ page }) => {
      await openPost(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const id of ['carousel', 'collage', 'strip']) {
        const tab = (await page.locator(`[data-kind=${id}]`).boundingBox())!;
        expect(tab.height).toBeGreaterThanOrEqual(44);
        expect(tab.y + tab.height).toBeLessThanOrEqual(760);
      }
      for (const chip of await page.getByTestId('post-section').all()) expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      const slide = (await page.locator('.page canvas').first().boundingBox())!;
      expect(slide.height).toBeGreaterThan(260);

      // A finger slides the slides until a tap holds a photo.
      await expect(page.getByTestId('post-framing')).toHaveCount(0);
      await page.touchscreen.tap(slide.x + slide.width / 2, slide.y + slide.height / 2);
      await expect(page.getByTestId('post-framing')).toBeVisible();
      await page.getByTestId('post-framing').getByRole('button', { name: 'Pronto' }).tap();
      await expect(page.getByTestId('post-framing')).toHaveCount(0);

      // Each block of controls is one tap away, one at a time.
      await page.locator('[data-section=format]').tap();
      await expect(page.locator('[data-ratio="4:5"]')).toBeVisible();
      await expect(page.getByTestId('post-retouch')).toBeHidden();
    });
  });
});
