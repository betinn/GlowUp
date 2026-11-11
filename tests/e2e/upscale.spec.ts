import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEV_ORIGIN } from '../../playwright.config';
import { expectNoErrors, openEditor, pickTool, setSlider, settle, skipIntro, findFunFaces } from './helpers';

/**
 * "Aumentar resolução", as a tool and as an option of the export. The bundled Chromium has no WebGPU, so the model
 * runs on the processor here: the photos that really go through it are small, and the tiles are forced small too,
 * so a photo of a hundred pixels still has seams to hide.
 */

/** A small photo with edges and gradients, made in the page. */
async function smallPhoto(page: Page, w: number, h: number): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#e9b7a0');
      grad.addColorStop(1, '#5a3a2c');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#20140f';
      g.beginPath();
      g.arc(w * 0.35, h * 0.45, h * 0.18, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#f4efe8';
      g.lineWidth = 2;
      for (let x = 6; x < w; x += 9) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + h * 0.3, h);
        g.stroke();
      }
      return c.toDataURL('image/png').split(',')[1];
    },
    [w, h],
  );
  return Buffer.from(b64, 'base64');
}

async function openSmall(page: Page, w: number, h: number): Promise<void> {
  await skipIntro(page);
  await page.addInitScript(() => {
    localStorage.setItem('glowup.upscaleTile', '64');
    localStorage.setItem('glowup.upscaleGpu', 'off');
  });
  await page.goto('/');
  const buffer = await smallPhoto(page, w, h);
  await page.setInputFiles('[data-testid=file-input]', { name: 'pequena.png', mimeType: 'image/png', buffer });
  await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
  await expect(page.getByTestId('opening')).toHaveCount(0);
  await settle(page);
}

function pngSize(b: Buffer): { w: number; h: number } {
  expect(b[0]).toBe(0x89);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test.describe('Aumentar resolução', () => {
  let errors: string[];

  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('XNNPACK')) errors.push(m.text());
    });
  });

  test.afterEach(() => expectNoErrors(errors));

  test('na exportação vem desligado, e ligado diz o tamanho e o limite', async ({ page }) => {
    await openEditor(page);
    await page.getByTestId('export-open').click();
    const sw = page.getByTestId('export-upscale-switch');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('export-size')).toHaveText('1500 × 1875 px, resolução total');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    // 2.8 MP: 4 times would be 45 MP, past the cap of 20 MP. Only 2 times is offered, and the note says why.
    await expect(page.getByTestId('export-size')).toHaveText('3000 × 3750 px, aumentada 2×');
    await expect(page.getByTestId('export-upscale-note')).toContainText('Só 2× cabe aqui');
    await expect(page.getByTestId('export-upscale-note')).toContainText('20 MP');
    await expect(page.getByRole('radio', { name: '4×' })).toHaveCount(0);
  });

  test('a ferramenta explica o limite e oferece 2× e 4× quando cabem', async ({ page }) => {
    await openEditor(page, 'gradient.png');
    await pickTool(page, 'frame', 'upscale');
    await expect(page.getByTestId('upscale-size')).toHaveText('Agora: 1024 × 768 px. Fica: 4096 × 3072 px.');
    await expect(page.getByRole('radio', { name: '2×' })).toBeVisible();
    await page.getByRole('radio', { name: '2×' }).click();
    await expect(page.getByTestId('upscale-size')).toHaveText('Agora: 1024 × 768 px. Fica: 2048 × 1536 px.');
    await expect(page.getByTestId('upscale-cap')).toHaveCount(0);
  });

  test('a ferramenta aumenta a foto, e o editor segue na foto maior', async ({ page }) => {
    await openSmall(page, 100, 60);
    await pickTool(page, 'frame', 'upscale');
    await expect(page.getByTestId('upscale-size')).toHaveText('Agora: 100 × 60 px. Fica: 400 × 240 px.');
    await page.getByTestId('upscale-go').click();
    // The card shows while the model downloads and works, with a way out.
    await expect(page.getByRole('progressbar', { name: 'Aumentando a resolução' })).toBeVisible();
    await expect(page.getByTestId('upscale-cancel')).toBeVisible();
    // The larger photo opens as a new one, in place of this.
    await expect(page.getByTestId('opening')).toHaveCount(1, { timeout: 170_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0, { timeout: 60_000 });
    await settle(page);
    await pickTool(page, 'frame', 'upscale');
    await expect(page.getByTestId('upscale-size')).toContainText('Agora: 400 × 240 px');
    // The project of before stays on the list, next to the new one.
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await expect(page.getByRole('button', { name: 'Continuar pequena 4x' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Continuar pequena', exact: true })).toBeVisible();
  });

  test('cancelar a ferramenta deixa a foto como estava', async ({ page }) => {
    await openSmall(page, 400, 300);
    await pickTool(page, 'frame', 'upscale');
    await page.getByTestId('upscale-go').click();
    const card = page.getByRole('progressbar', { name: 'Aumentando a resolução' });
    await expect(card).toBeVisible();
    // Stopped on the model itself, past the download, with a few tiles of a slow processor still to go.
    await expect(card).toHaveAttribute('aria-valuetext', /Aumentando 4×/, { timeout: 120_000 });
    // It says how long it still needs.
    await expect(card).toContainText(/cerca de \d+ (s|min)/, { timeout: 30_000 });
    await page.getByTestId('upscale-cancel').click();
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId('upscale-stopped')).toBeVisible();
    await expect(page.getByTestId('upscale-size')).toHaveText('Agora: 400 × 300 px. Fica: 1600 × 1200 px.');
    // Nothing opens later from the job that was stopped.
    await page.waitForTimeout(3000);
    await expect(page.getByTestId('opening')).toHaveCount(0);
  });

  test('a exportação com o aumento ligado salva a foto maior', async ({ page }) => {
    await openSmall(page, 100, 60);
    await page.getByTestId('export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    await page.getByTestId('export-upscale-switch').click();
    await expect(page.getByTestId('export-size')).toHaveText('400 × 240 px, aumentada 4×');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 170_000 }), page.getByTestId('export-go').click()]);
    const size = pngSize(readFileSync((await download.path())!));
    expect(size).toEqual({ w: 400, h: 240 });
    await expect(page.getByText('Prontinho. Tá na sua pasta.')).toBeVisible();
  });

  test('sem conexão, a exportação e a ferramenta dizem que o modelo não baixou, e a exportação volta com ela', async ({ page, context }) => {
    // The case the person met: the server of the site went away with the editor open, so the model could not come.
    await openSmall(page, 100, 60);
    // The panel of the tool comes while online: only the model is missing.
    await pickTool(page, 'frame', 'upscale');
    await context.setOffline(true);
    await page.getByTestId('export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    await page.getByTestId('export-upscale-switch').click();
    let saved = false;
    page.on('download', () => (saved = true));
    await page.getByTestId('export-go').click();
    const failed = page.getByTestId('export-failed');
    await expect(failed).toHaveAttribute('data-failed', 'download');
    await expect(failed).toContainText('Não deu para baixar o modelo');
    await expect(failed).toContainText('Confere a internet');
    // Not the advice of a format that failed to encode: PNG is the one chosen.
    await expect(failed).not.toContainText('tenta PNG');
    expect(saved).toBe(false);
    await page.getByRole('button', { name: 'Fechar' }).click();

    await page.getByTestId('upscale-go').click();
    await expect(page.getByText('Não deu para baixar o modelo que aumenta a resolução. Confere a internet e tenta de novo.')).toBeVisible();
    await expect(page.getByTestId('upscale-size')).toHaveText('Agora: 100 × 60 px. Fica: 400 × 240 px.');

    // Back online, the same export downloads the model and saves the larger photo.
    await context.setOffline(false);
    await page.getByTestId('export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    await page.getByTestId('export-upscale-switch').click();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 170_000 }), page.getByTestId('export-go').click()]);
    expect(pngSize(readFileSync((await download.path())!))).toEqual({ w: 400, h: 240 });
    // What failed while offline was logged; nothing else was.
    errors = errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|model-download/.test(e));
  });

  test('cancelar no download, na exportação, não salva nada e volta às opções', async ({ page }) => {
    await openSmall(page, 100, 60);
    // A slow network, so the download of the model takes long enough to be stopped.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: 1_000_000, uploadThroughput: 1_000_000 });
    await page.getByTestId('export-open').click();
    await page.getByTestId('export-upscale-switch').click();
    let saved = false;
    page.on('download', () => (saved = true));
    await page.getByTestId('export-go').click();
    const card = page.getByRole('progressbar', { name: 'Exportando a foto' });
    await expect(card).toHaveAttribute('aria-valuetext', /Baixando o modelo de resolução/, { timeout: 30_000 });
    // The download says how long it still needs, from the speed it has had.
    await expect(card).toContainText(/cerca de \d+ (s|min)/, { timeout: 30_000 });
    await page.getByTestId('export-upscale-cancel').click();
    await expect(card).toHaveCount(0);
    await expect(page.getByText('Parou. Nada foi salvo.')).toBeVisible();
    await expect(page.getByTestId('export-go')).toBeVisible();
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.waitForTimeout(1500);
    expect(saved).toBe(false);
  });
});

/**
 * With Brincar on the photo, both ways of upscaling take the photo as it shows: the faces it pulls and the stickers.
 * The portrait is cropped to a small square at the sticker, so the processor gets through it in the test.
 */
test.describe('Aumentar resolução com o Brincar', () => {
  test.use({ baseURL: DEV_ORIGIN });

  const SIDE = 96;

  /** The photo with every retouch, as the file holds it, in the pixels of the page. */
  const rendered = (page: Page): Promise<number[]> =>
    page.evaluate(`(async () => {
      const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
      const { renderImage } = await import(/* @vite-ignore */ '/src/core/export.ts');
      const canvas = await renderImage(engine(), { tile() {} });
      return Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
    })()`) as Promise<number[]>;

  /** The current photo as a PNG, as the export makes it without the option. */
  const exported = async (page: Page): Promise<Buffer> =>
    Buffer.from(
      (await page.evaluate(`(async () => {
        const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
        const { exportImage } = await import(/* @vite-ignore */ '/src/core/export.ts');
        const blob = await exportImage(engine(), { format: 'image/png', quality: 1 }, { tile() {}, encoding() {} });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
      })()`)) as string,
      'base64',
    );

  /** A PNG made 4 times bigger, brought back to the size it had by the mean of each block of 4 by 4. */
  const shrunk = (page: Page, png: Buffer): Promise<number[]> =>
    page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
      c.drawImage(bitmap, 0, 0);
      const big = c.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const w = bitmap.width / 4;
      const out = new Array<number>(w * (bitmap.height / 4) * 4).fill(0);
      for (let y = 0; y < bitmap.height; y++) {
        for (let x = 0; x < bitmap.width; x++) {
          const o = ((y >> 2) * w + (x >> 2)) * 4;
          const i = (y * bitmap.width + x) * 4;
          for (let k = 0; k < 4; k++) out[o + k] += big[i + k] / 16;
        }
      }
      return out;
    }, png.toString('base64'));

  /** Mean difference in levels of 0 to 255, over the color channels of the pixels kept by `only`. */
  function differ(a: number[], b: number[], only?: boolean[]): number {
    let sum = 0;
    let n = 0;
    for (let p = 0; p < a.length / 4; p++) {
      if (only && !only[p]) continue;
      for (let k = 0; k < 3; k++) sum += Math.abs(a[p * 4 + k] - b[p * 4 + k]);
      n += 3;
    }
    return sum / n;
  }

  /** The pixels Brincar moved by more than 20 levels on average. */
  function changedBy(plain: number[], fun: number[]): boolean[] {
    const out: boolean[] = [];
    for (let p = 0; p < plain.length / 4; p++) {
      let d = 0;
      for (let k = 0; k < 3; k++) d += Math.abs(plain[p * 4 + k] - fun[p * 4 + k]);
      out.push(d > 60);
    }
    return out;
  }

  test('a ferramenta e a exportação levam as caretas e o adesivo para a foto maior', async ({ page }) => {
    test.setTimeout(480_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('XNNPACK') && !m.text().includes('404')) errors.push(m.text());
    });
    await skipIntro(page);
    await page.addInitScript(() => {
      localStorage.setItem('glowup.startPath', '"fun"');
      localStorage.setItem('glowup.upscaleTile', '64');
      localStorage.setItem('glowup.upscaleGpu', 'off');
    });
    await page.goto('/');
    await page.setInputFiles('[data-testid=file-input]', 'tests/fixtures/portrait.png');
    await findFunFaces(page);
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await settle(page);

    // Where the sticker goes, found by putting it on once; then a small square around it, without Brincar.
    await page.getByTestId('sticker').first().click();
    await settle(page, 600);
    await page.evaluate(`(async () => {
      const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
      const e = engine();
      const s = e.doc.fun.stickers[0];
      const { width: w, height: h } = e.doc;
      await e.undo();
      e.setCrop({ angle: 0, quarter: 0, flipH: false, flipV: false, cx: s.x * w - w / 2, cy: s.y * h - h / 2, cw: ${SIDE}, ch: ${SIDE} });
    })()`);
    await settle(page, 600);
    const plain = await rendered(page);
    expect(plain).toHaveLength(SIDE * SIDE * 4);

    await setSlider(page, 'Olhão', 70);
    await settle(page, 300);
    await setSlider(page, 'Cabeção', 50);
    await settle(page, 300);
    await page.getByTestId('sticker').first().click();
    await settle(page, 600);
    const fun = await rendered(page);
    // The square really changes with Brincar, so a result without it would show.
    const changed = changedBy(plain, fun);
    const share = changed.filter(Boolean).length / changed.length;
    expect(share).toBeGreaterThan(0.02);

    // The export, with the option on.
    await page.getByTestId('export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    await page.getByTestId('export-upscale-switch').click();
    await expect(page.getByTestId('export-size')).toHaveText(`${SIDE * 4} × ${SIDE * 4} px, aumentada 4×`);
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 240_000 }), page.getByTestId('export-go').click()]);
    const file = readFileSync((await download.path())!);
    expect(pngSize(file)).toEqual({ w: SIDE * 4, h: SIDE * 4 });
    const fromExport = await shrunk(page, file);
    // Brought back to the size it had, the bigger photo is close to the photo with Brincar, and far from the one
    // without it where Brincar changed it.
    const exportFun = differ(fromExport, fun, changed);
    const exportPlain = differ(fromExport, plain, changed);
    console.log(`changed ${(share * 100).toFixed(0)}%; export to fun ${differ(fromExport, fun).toFixed(2)} overall, ${exportFun.toFixed(2)} where changed, to plain ${exportPlain.toFixed(2)}`);
    expect(differ(fromExport, fun)).toBeLessThan(6);
    expect(exportFun * 3).toBeLessThan(exportPlain);
    await page.getByRole('button', { name: 'Fechar' }).click();

    // The tool, from the path with the tools. The bigger photo opens as a new one.
    await page.getByTestId('path-switch').click();
    await page.getByTestId('path-choice').locator('[data-path=manual]').click();
    await pickTool(page, 'frame', 'upscale');
    await expect(page.getByTestId('upscale-size')).toHaveText(`Agora: ${SIDE} × ${SIDE} px. Fica: ${SIDE * 4} × ${SIDE * 4} px.`);
    await page.getByTestId('upscale-go').click();
    await expect(page.getByTestId('opening')).toHaveCount(1, { timeout: 240_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0, { timeout: 60_000 });
    await settle(page);
    const grown = await page.evaluate(`(async () => {
      const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
      const e = engine();
      return { w: e.doc.width, h: e.doc.height, fun: !!(e.doc.fun?.faces?.length || e.doc.fun?.stickers?.length) };
    })()`);
    // The new photo holds Brincar in its pixels, with nothing of it left to apply again.
    expect(grown).toEqual({ w: SIDE * 4, h: SIDE * 4, fun: false });
    const fromTool = await shrunk(page, await exported(page));
    const toolFun = differ(fromTool, fun, changed);
    const toolPlain = differ(fromTool, plain, changed);
    console.log(`tool to fun ${differ(fromTool, fun).toFixed(2)} overall, ${toolFun.toFixed(2)} where changed, to plain ${toolPlain.toFixed(2)}`);
    expect(differ(fromTool, fun)).toBeLessThan(6);
    expect(toolFun * 3).toBeLessThan(toolPlain);
    expectNoErrors(errors);
  });
});
