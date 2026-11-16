import { expect, test, type Page } from '@playwright/test';
import { noPickers, openEditor, settle } from './helpers';

/**
 * Stand-ins for the save dialogs of the browser: they answer as the person would, and keep what is written so
 * the test can read it. `cancel` closes the dialog instead.
 */
async function fakePickers(page: Page, { cancel = false } = {}): Promise<void> {
  await page.addInitScript((cancel) => {
    type Saved = { name: string; size: number; type: string; head: number[] };
    const w = window as unknown as { __saved: Saved[]; __asked: string[] } & Record<string, unknown>;
    w.__saved = [];
    w.__asked = [];
    const handle = (name: string) => ({
      kind: 'file',
      name,
      async createWritable() {
        const parts: Blob[] = [];
        return {
          async write(b: Blob) {
            parts.push(b);
          },
          async close() {
            const all = new Blob(parts);
            w.__saved.push({ name, size: all.size, type: parts[0]?.type ?? '', head: [...new Uint8Array(await all.slice(0, 4).arrayBuffer())] });
          },
        };
      },
    });
    const refuse = () => Promise.reject(new DOMException('closed', 'AbortError'));
    w.showSaveFilePicker = (o: { suggestedName: string }) => {
      w.__asked.push(`file:${o.suggestedName}`);
      return cancel ? refuse() : Promise.resolve(handle(o.suggestedName));
    };
    w.showDirectoryPicker = () => {
      w.__asked.push('folder');
      return cancel ? refuse() : Promise.resolve({ kind: 'directory', name: 'Fotos', getFileHandle: async (name: string) => handle(name) });
    };
  }, cancel);
}

const saved = (page: Page) => page.evaluate(() => (window as unknown as { __saved: { name: string; size: number; head: number[] }[] }).__saved);
const asked = (page: Page) => page.evaluate(() => (window as unknown as { __asked: string[] }).__asked);

test.describe('escolher onde salvar', () => {
  test('a foto pergunta onde salvar antes de exportar, e vai para lá sem download', async ({ page }) => {
    await noPickers(page);
    await fakePickers(page);
    await openEditor(page);
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.getByTestId('export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    await page.getByTestId('export-go').click();
    await expect(page.getByTestId('export-where')).toContainText('na pasta que você escolheu');
    expect(await asked(page)).toEqual([expect.stringMatching(/^file:glowup-[a-z0-9]+\.png$/)]);
    const [file] = await saved(page);
    expect(file.name).toMatch(/\.png$/);
    expect(file.head).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(file.size).toBeGreaterThan(10_000);
    expect(downloads).toBe(0);
  });

  test('fechar o diálogo não exporta nada e as opções ficam', async ({ page }) => {
    await noPickers(page);
    await fakePickers(page, { cancel: true });
    await openEditor(page);
    await page.getByTestId('export-open').click();
    await page.getByTestId('export-go').click();
    await settle(page, 500);
    await expect(page.getByTestId('export-go')).toBeVisible();
    expect(await saved(page)).toEqual([]);
  });

  test('os slides da montagem vão um por um para a pasta escolhida, sem zip', async ({ page }) => {
    await noPickers(page);
    await fakePickers(page);
    await page.addInitScript(() => {
      localStorage.setItem('glowup.onboarded', 'true');
      localStorage.setItem('glowup.onboardedView', 'true');
      localStorage.setItem('glowup.fill', 'off');
    });
    await page.goto('/');
    await page.setInputFiles('[data-testid=files-input]', ['portrait.png', 'group.png', 'gradient.png'].map((f) => `tests/fixtures/${f}`));
    await page.locator('[data-testid=studio].ready[data-loading="0"]').waitFor({ timeout: 120_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await page.getByTestId('post-export-open').click();
    await page.getByRole('radio', { name: 'PNG' }).click();
    await page.getByTestId('post-export-go').click();
    await expect(page.getByTestId('post-exported')).toHaveAttribute('data-files', '3', { timeout: 120_000 });
    await expect(page.getByTestId('post-where')).toContainText('Salvos na pasta Fotos');
    expect(await asked(page)).toEqual(['folder']);
    const files = await saved(page);
    expect(files.map((f) => f.name.replace(/^glowup-[a-z0-9]+/, ''))).toEqual(['-01.png', '-02.png', '-03.png']);
  });
});
