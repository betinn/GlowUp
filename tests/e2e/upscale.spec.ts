import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectNoErrors, openEditor, pickTool, settle, skipIntro } from './helpers';

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
