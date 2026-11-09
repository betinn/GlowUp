import { expect, test, type JSHandle, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectNoErrors, imageRect, openEditor, pickTool, setSlider, settle, skipIntro } from './helpers';

const shot = (name: string) => `docs/visual-checks/ui-${name}.png`;

/** A DataTransfer holding real bytes, as the browser builds for a file dragged from the system. */
function dragged(page: Page, name: string, type: string, bytes: Buffer, copies = 1): Promise<JSHandle<DataTransfer>> {
  return page.evaluateHandle(
    ([fileName, fileType, data, count]) => {
      const raw = Uint8Array.from(atob(data as string), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      for (let i = 0; i < (count as number); i++) transfer.items.add(new File([raw], fileName as string, { type: fileType as string }));
      return transfer;
    },
    [name, type, bytes.toString('base64'), copies] as const,
  );
}

const portrait = () => readFileSync('tests/fixtures/portrait.png');
const gradient = () => readFileSync('tests/fixtures/gradient.png');

/** Records what the progress bar says during a job. */
async function watchProgress(page: Page) {
  await page.addInitScript(() => {
    const seen: { value: number; text: string }[] = [];
    (window as unknown as { progressLog: typeof seen }).progressLog = seen;
    const look = () => {
      const bar = document.querySelector('[role=progressbar]');
      if (bar) seen.push({ value: Number(bar.getAttribute('aria-valuenow')), text: bar.getAttribute('aria-valuetext') ?? '' });
      requestAnimationFrame(look);
    };
    const backup = () => {
      const bar = document.querySelector('[role=progressbar]');
      if (bar) seen.push({ value: Number(bar.getAttribute('aria-valuenow')), text: bar.getAttribute('aria-valuetext') ?? '' });
    };
    requestAnimationFrame(look);
    setInterval(backup, 15);
  });
}

const progressLog = (page: Page) => page.evaluate(() => (window as unknown as { progressLog: { value: number; text: string }[] }).progressLog);

function expectRises(log: { value: number }[]) {
  expect(log.length).toBeGreaterThan(3);
  for (let i = 1; i < log.length; i++) expect(log[i].value).toBeGreaterThanOrEqual(log[i - 1].value);
  expect(log.at(-1)!.value).toBe(100);
}

/** Mean difference between the same region of two screenshots, in 8-bit levels. */
async function regionDiff(page: Page, a: Buffer, b: Buffer, x0: number, x1: number): Promise<number> {
  const other = await page.context().newPage();
  const diff = await other.evaluate(
    async ([p, q, from, to]) => {
      const load = async (s: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${s}`;
        await img.decode();
        const c = new OffscreenCanvas(img.width, img.height);
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        const left = Math.round(img.width * (from as number));
        const width = Math.round(img.width * ((to as number) - (from as number)));
        // The top of the photo holds the labels of the divider.
        const top = Math.round(img.height * 0.12);
        return g.getImageData(left, top, width, img.height - top).data;
      };
      const [m, n] = await Promise.all([load(p as string), load(q as string)]);
      let sum = 0;
      for (let i = 0; i < m.length; i++) sum += Math.abs(m[i] - n[i]);
      return sum / m.length;
    },
    [a.toString('base64'), b.toString('base64'), x0, x1] as const,
  );
  await other.close();
  return diff;
}

const photoShot = (page: Page) => {
  const r = imageRect(page);
  return page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
};

test.describe('resposta ao usuário', () => {
  let errors: string[];

  test.beforeEach(({ page }) => {
    errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
  });

  test.afterEach(() => expectNoErrors(errors));

  test('a tela reage ao arquivo por cima, recusa o que não é foto e abre ao soltar', async ({ page }) => {
    await skipIntro(page);
    await page.goto('/');
    await settle(page, 1200);
    await page.screenshot({ path: shot('inicial') });

    const photo = await dragged(page, 'retrato.png', 'image/png', portrait());
    await page.dispatchEvent('html', 'dragenter', { dataTransfer: photo, clientX: 860, clientY: 300 });
    await expect(page.getByText('Pode soltar.')).toBeVisible();
    await settle(page, 300);
    await page.dispatchEvent('html', 'dragover', { dataTransfer: photo, clientX: 860, clientY: 300 });
    await page.waitForTimeout(150);
    await page.screenshot({ path: shot('soltar') });

    const pdf = await dragged(page, 'nota.pdf', 'application/pdf', Buffer.from('%PDF-1.7'));
    await page.dispatchEvent('html', 'dragover', { dataTransfer: pdf, clientX: 400, clientY: 300 });
    await expect(page.getByText('Isso não é uma foto.')).toBeVisible();
    await page.waitForTimeout(350);
    await page.dispatchEvent('html', 'dragover', { dataTransfer: pdf, clientX: 400, clientY: 300 });
    await page.waitForTimeout(100);
    await page.screenshot({ path: shot('soltar-recusado') });

    // Leaving the window sends no reliable event, so the screen clears on its own.
    await expect(page.getByTestId('drop-zone')).toHaveCount(0);

    const many = await dragged(page, 'retrato.png', 'image/png', portrait(), 2);
    await page.dispatchEvent('html', 'dragover', { dataTransfer: many, clientX: 500, clientY: 300 });
    await expect(page.getByText('Uma por vez: abro a primeira.')).toBeVisible();

    await page.dispatchEvent('html', 'drop', { dataTransfer: photo, clientX: 860, clientY: 300 });
    await expect(page.getByTestId('drop-zone')).toHaveCount(0);
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
  });

  test('a bandeja abre o seletor de arquivos', async ({ page }) => {
    await page.goto('/');
    await settle(page, 1200);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Solta a foto aqui.').click()]);
    expect(chooser.isMultiple()).toBe(false);
  });

  test('soltar no editor troca a foto e guarda a anterior', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'light', 'adjust');
    await setSlider(page, 'Exposição', 30);
    await settle(page, 300);
    const url = page.url();

    const other = await dragged(page, 'degrade.png', 'image/png', gradient());
    await page.dispatchEvent('html', 'dragover', { dataTransfer: other, clientX: 600, clientY: 300 });
    await expect(page.getByText('Solta para trocar de foto.')).toBeVisible();
    await page.dispatchEvent('html', 'drop', { dataTransfer: other, clientX: 600, clientY: 300 });
    await expect(page.getByTestId('opening')).toBeVisible();
    await expect(page.getByTestId('opening')).toHaveCount(0, { timeout: 90_000 });
    await settle(page, 600);
    expect(page.url()).toBe(url);

    // A second swap proves that the replaced editor left the new one working.
    const again = await dragged(page, 'retrato.png', 'image/png', portrait());
    await page.dispatchEvent('html', 'drop', { dataTransfer: again, clientX: 600, clientY: 300 });
    await expect(page.getByTestId('opening')).toBeVisible();
    await expect(page.getByTestId('opening')).toHaveCount(0, { timeout: 90_000 });
    await settle(page, 600);

    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await expect(page.getByRole('button', { name: /Continuar/ })).toHaveCount(3);
  });

  test('abrir uma foto mostra a porcentagem subindo até 100', async ({ page }) => {
    await watchProgress(page);
    await skipIntro(page);
    await page.goto('/');
    await page.setInputFiles('[data-testid=file-input]', 'tests/fixtures/portrait.png');
    await page.waitForFunction(() => Number(document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')) >= 60);
    await page.screenshot({ path: shot('abrindo') });
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    const log = await progressLog(page);
    expectRises(log);
    const steps = new Set(log.map((l) => l.text.replace(/^\d+%, /, '')));
    for (const step of ['Lendo a foto', 'Abrindo a foto', 'Revelando', 'Pronta']) expect(steps).toContain(step);
  });

  test('voltar a um projeto recoloca os retoques com progresso', async ({ page }) => {
    await watchProgress(page);
    await openEditor(page);
    await pickTool(page, 'light', 'adjust');
    await setSlider(page, 'Exposição', 20);
    await settle(page, 300);
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await page.getByRole('button', { name: /Continuar/ }).first().click();
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    const steps = new Set((await progressLog(page)).map((l) => l.text.replace(/^\d+%, /, '')));
    expect(steps).toContain('Buscando seu projeto');
  });

  test('exportar mostra as partes prontas e termina em 100', async ({ page }) => {
    await watchProgress(page);
    await openEditor(page);
    await page.evaluate(() => localStorage.setItem('glowup.tile', '512'));
    await page.getByTestId('export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    await page.evaluate(() => ((window as unknown as { progressLog: unknown[] }).progressLog.length = 0));
    const download = page.waitForEvent('download');
    await page.getByTestId('export-go').click();
    await expect(page.getByText(/parte \d+ de 12/)).toBeVisible();
    await page.waitForFunction(() => Number(document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')) >= 40);
    await page.screenshot({ path: shot('exportando') });
    await download;
    await expect(page.getByText('Prontinho. Tá na sua pasta.')).toBeVisible();
    // The saved moment: the print lifts, a gleam crosses it and a seal with a tick stamps its corner.
    await expect(page.locator('[data-saved=yes]')).toHaveCount(1);
    await page.waitForTimeout(650);
    await page.screenshot({ path: shot('exportado-selo') });
    await settle(page, 900);
    await page.screenshot({ path: shot('exportado') });
    const seal = await page.locator('.seal').evaluate((el) => {
      const box = el.getBoundingClientRect();
      const tick = getComputedStyle(el.querySelector('path')!).strokeDashoffset;
      return { w: box.width, tick };
    });
    expect(seal.w).toBeGreaterThan(30);
    expect(parseFloat(seal.tick)).toBeLessThan(0.05);
    const log = await progressLog(page);
    const rises = log.filter((l) => l.value > 0);
    for (let i = 1; i < rises.length; i++) expect(rises[i].value).toBeGreaterThanOrEqual(rises[i - 1].value);
    const steps = new Set(log.map((l) => l.text.replace(/^\d+%, /, '')));
    expect(steps).toContain('Aplicando seus retoques');
    expect(steps).toContain('Comprimindo em PNG');
  });

  test('comparar sem filtro mostra a foto retocada de um lado e o filtro do outro', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'light', 'adjust');
    await setSlider(page, 'Exposição', 30);
    await pickTool(page, 'looks', 'filters');
    await page.mouse.move(2, 2);
    await settle(page, 500);
    const plain = await photoShot(page);
    await expect(page.getByTestId('compare-filter')).toHaveCount(0);

    await page.locator('[data-filter=prata]').click();
    await page.mouse.move(2, 2);
    await settle(page, 500);
    const filtered = await photoShot(page);

    // Holding shows the photo without the filter, and letting go brings the filter back.
    const button = page.getByTestId('compare-filter');
    await button.hover();
    await page.mouse.down();
    await settle(page, 450);
    expect(await regionDiff(page, await photoShot(page), plain, 0, 1)).toBeLessThan(1.5);
    await page.mouse.up();
    await page.mouse.move(2, 2);
    await settle(page, 350);
    expect((await photoShot(page)).equals(filtered)).toBe(true);

    await button.click();
    await page.mouse.move(2, 2);
    await settle(page, 1200);
    await expect(page.getByTestId('compare-line')).toContainText('Original');
    await expect(page.getByTestId('compare-line')).toContainText('Prata');
    const split = await photoShot(page);
    expect(await regionDiff(page, split, plain, 0, 0.42)).toBeLessThan(1.5);
    expect(await regionDiff(page, split, filtered, 0.58, 1)).toBeLessThan(1.5);
    expect(await regionDiff(page, split, filtered, 0, 0.42)).toBeGreaterThan(3);
    await page.screenshot({ path: shot('filtro-comparar') });

    // The divider stays while the person tries other filters.
    await page.locator('[data-filter=mel]').click();
    await expect(page.getByTestId('compare-line')).toContainText('Mel');
    await page.mouse.move(2, 2);
    await settle(page, 500);
    const other = await photoShot(page);
    expect(await regionDiff(page, other, plain, 0, 0.42)).toBeLessThan(1.5);
    expect(await regionDiff(page, other, split, 0.58, 1)).toBeGreaterThan(3);

    // The top button always compares with the original, which has no exposure change.
    await page.getByTestId('compare').click();
    await page.mouse.move(2, 2);
    await settle(page, 500);
    await expect(page.getByTestId('compare-line')).toContainText('Antes');
    expect(await regionDiff(page, await photoShot(page), plain, 0, 0.42)).toBeGreaterThan(3);

    // Removing the filter ends the comparison that depends on it.
    await button.click();
    await expect(page.getByTestId('compare-line')).toContainText('Original');
    await page.locator('[data-filter=mel]').click();
    await expect(page.getByTestId('compare-line')).toHaveCount(0);
  });

  test('sair dos filtros encerra a comparação do filtro', async ({ page }) => {
    await openEditor(page);
    await pickTool(page, 'looks', 'filters');
    await page.locator('[data-filter=prata]').click();
    await page.getByTestId('compare-filter').click();
    await expect(page.getByTestId('compare-line')).toBeVisible();
    await pickTool(page, 'light', 'adjust');
    await expect(page.getByTestId('compare-line')).toHaveCount(0);
  });
});

test('arquivo quebrado volta para o início com um aviso', async ({ page }) => {
  await skipIntro(page);
  await page.goto('/');
  await page.setInputFiles('[data-testid=file-input]', { name: 'quebrada.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('nada de foto') });
  await expect(page.getByText('Não consegui abrir esse arquivo. Tenta um JPG, PNG ou WebP?')).toBeVisible();
  await expect(page.getByTestId('opening')).toHaveCount(0);
  await expect(page.getByText('Solta a foto aqui.')).toBeVisible();
});

test.describe('resposta ao usuário, celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('a divisão do filtro fica sobre a foto, fora do painel', async ({ page }) => {
    await openEditor(page);
    await page.locator('[data-group=looks]').tap();
    await page.locator('[data-filter=prata]').tap();
    await page.getByTestId('compare-filter').tap();
    await settle(page, 1300);
    const free = await page.evaluate(() => {
      const handle = document.querySelector('[aria-label="Mover divisão antes e depois"]')!;
      const r = handle.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return handle === top || handle.contains(top);
    });
    expect(free).toBe(true);
    await page.screenshot({ path: shot('celular-filtro-comparar') });
  });

  test('tela inicial convida a tocar', async ({ page }) => {
    await page.goto('/');
    await settle(page, 1500);
    await expect(page.getByText('Sua foto começa aqui.')).toBeVisible();
    await page.screenshot({ path: shot('celular-inicial') });
  });
});
