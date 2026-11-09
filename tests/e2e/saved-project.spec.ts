import { expect, test, type Page } from '@playwright/test';
import { openEditor, settle } from './helpers';

const continueButtons = (page: Page) => page.getByRole('button', { name: /^Continuar/ });

/** Opens a photo and goes back to the home screen, with the project saved. */
async function saveProject(page: Page): Promise<void> {
  await openEditor(page);
  await page.getByRole('button', { name: 'Voltar para o início' }).click();
  await expect(continueButtons(page)).toHaveCount(1);
}

/** Runs something on the two stores of the saved projects, and waits for it to land. */
async function changeStore(page: Page, change: 'version' | 'original' | 'mask'): Promise<void> {
  await page.evaluate(async (what) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('glowup');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(new Error('no database'));
    });
    const tx = db.transaction(['projects', 'originals'], 'readwrite');
    const projects = tx.objectStore('projects');
    const all = projects.getAll();
    await new Promise((resolve) => (all.onsuccess = resolve));
    for (const record of all.result as { id: string; doc: { version: number }; masks: Record<string, unknown> }[]) {
      if (what === 'original') {
        tx.objectStore('originals').delete(record.id);
      } else if (what === 'version') {
        record.doc.version = 99;
        projects.put(record);
      } else {
        record.masks = { smooth: new Blob([new Uint8Array([1, 9, 9, 9, 9])]) };
        projects.put(record);
      }
    }
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
  }, change);
}

/** How many records each store holds. */
async function stored(page: Page): Promise<{ projects: number; originals: number }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('glowup');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(new Error('no database'));
    });
    const count = (name: string) =>
      new Promise<number>((resolve) => {
        const req = db.transaction(name).objectStore(name).count();
        req.onsuccess = () => resolve(req.result);
      });
    const out = { projects: await count('projects'), originals: await count('originals') };
    db.close();
    return out;
  });
}

test.describe('projeto salvo que não abre', () => {
  for (const [name, change] of [
    ['de outra versão do documento', 'version'],
    ['sem a foto original', 'original'],
    ['com máscara danificada', 'mask'],
  ] as const) {
    test(`${name}: avisa, sai da lista e volta para o início`, async ({ page }) => {
      await saveProject(page);
      await changeStore(page, change);
      await page.reload();
      await continueButtons(page).click();
      await expect(page.getByText(/danificado.*Tirei ele da lista/)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('Solta a foto aqui.')).toBeVisible();
      await expect(continueButtons(page)).toHaveCount(0);
      await expect(page.getByTestId('opening')).toHaveCount(0);
      expect(await stored(page)).toEqual({ projects: 0, originals: 0 });
    });
  }

  test('erro de leitura do IndexedDB: avisa e o projeto fica, e abre na próxima vez', async ({ page }) => {
    await saveProject(page);
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.get;
      const w = window as unknown as { restoreGet: () => void };
      w.restoreGet = () => void (IDBObjectStore.prototype.get = original);
      IDBObjectStore.prototype.get = () => {
        throw new DOMException('read failed', 'UnknownError');
      };
    });
    await continueButtons(page).click();
    await expect(page.getByText(/continua salvo/)).toBeVisible({ timeout: 60_000 });
    await expect(continueButtons(page)).toHaveCount(1);
    await page.evaluate(() => (window as unknown as { restoreGet: () => void }).restoreGet());
    expect(await stored(page)).toEqual({ projects: 1, originals: 1 });

    // Nothing was wrong with the project.
    await settle(page, 200);
    await continueButtons(page).click();
    await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
  });

  test('foto que não decodifica agora: avisa e o projeto fica', async ({ page }) => {
    await saveProject(page);
    await page.evaluate(() => {
      window.createImageBitmap = () => Promise.reject(new DOMException('no memory', 'InvalidStateError'));
    });
    await continueButtons(page).click();
    await expect(page.getByText(/continua salvo/)).toBeVisible({ timeout: 60_000 });
    await expect(continueButtons(page)).toHaveCount(1);
    expect(await stored(page)).toEqual({ projects: 1, originals: 1 });
  });

  test('sem WebGL: avisa e o projeto fica', async ({ page }) => {
    await saveProject(page);
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
    await continueButtons(page).click();
    await expect(page.getByRole('alert')).toContainText('falta WebGL2');
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(continueButtons(page)).toHaveCount(1);
    expect(await stored(page)).toEqual({ projects: 1, originals: 1 });
  });

  test('um projeto sem miniatura não esconde os outros e também sai ao tentar abrir', async ({ page }) => {
    await saveProject(page);
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('glowup');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(new Error('no database'));
      });
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const all = store.getAll();
      await new Promise((resolve) => (all.onsuccess = resolve));
      const [record] = all.result as { id: string; name: string; updated: number; thumb: unknown }[];
      store.put({ ...record, id: 'sem-miniatura', name: 'sem miniatura', updated: record.updated + 1, thumb: null });
      await new Promise((resolve) => (tx.oncomplete = resolve));
      db.close();
    });
    await page.reload();
    await expect(continueButtons(page)).toHaveCount(2);
    await page.getByRole('button', { name: 'Continuar sem miniatura' }).click();
    await expect(page.getByText(/danificado.*Tirei ele da lista/)).toBeVisible({ timeout: 60_000 });
    await expect(continueButtons(page)).toHaveCount(1);
    expect((await stored(page)).projects).toBe(1);
  });
});
