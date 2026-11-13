import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { imageRect, openEditor, openTab, settle } from './helpers';

/** The dev server, so that the page can start a wait of a known length on the editor it is running. */
test.use({ baseURL: DEV_ORIGIN });

const wait = (page: Page) => page.getByTestId('photo-wait');

/** Runs a job of `ms` inside the wait of the photo, and does not wait for it. */
const hold = (page: Page, label: string, ms: number) =>
  page.evaluate(
    `(async () => {
      const { during } = await import(/* @vite-ignore */ '/src/ui/wait.svelte.ts');
      window.heldJob = during(${JSON.stringify(label)}, () => new Promise((done) => setTimeout(done, ${ms})));
    })()`,
  );

test.describe('wait on the photo', () => {
  test('a look breaks the photo into pieces, says what it is doing, and the pieces leave when it lands', async ({ page }) => {
    await openEditor(page);
    await openTab(page, 'glow');
    await page.getByTestId('looks').waitFor();
    await settle(page, 300);

    await page.locator('[data-look=glow]').click();
    // The first look loads the detector, which takes long enough on any machine for the wait to show.
    await expect(wait(page)).toHaveAttribute('data-phase', 'on');
    await expect(wait(page)).toContainText('Vestindo o look Glow');
    // The portrait is 4 by 5: four pieces across, five down.
    await expect(wait(page)).toHaveAttribute('data-pieces', '20');
    await expect(wait(page).locator('.board')).toHaveCSS('opacity', '1');
    // The search says how far it got, on the photo.
    await expect(wait(page).locator('.percent')).toBeVisible();

    // The pieces sit on the photo, not on the screen.
    const box = (await wait(page).boundingBox())!;
    const photo = imageRect(page);
    expect(Math.abs(box.x - photo.x)).toBeLessThan(2);
    expect(Math.abs(box.y - photo.y)).toBeLessThan(2);
    expect(Math.abs(box.width - photo.w)).toBeLessThan(3);
    expect(Math.abs(box.height - photo.h)).toBeLessThan(3);

    await expect(page.getByTestId('looks')).toHaveAttribute('data-state', 'idle', { timeout: 90_000 });
    await expect(wait(page)).toHaveCount(0);
    await expect(page.locator('[data-look=glow]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the wait says so after a while, lets every touch through, and leaves diagonal by diagonal', async ({ page }) => {
    await openEditor(page);
    await hold(page, 'Aplicando Mel', 1500);
    await expect(wait(page)).toContainText('Aplicando Mel');
    await expect(wait(page).locator('.board')).toHaveCSS('opacity', '1');
    await expect(wait(page)).toHaveCSS('pointer-events', 'none');
    // Each piece holds its part of the photo, so none is an empty canvas.
    const drawn = await wait(page)
      .locator('canvas.piece')
      .evaluateAll((list) => list.every((c) => (c as HTMLCanvasElement).width > 8 && (c as HTMLCanvasElement).height > 8));
    expect(drawn).toBe(true);
    // What moves is an animation of the browser, which goes on when the page is held.
    const moving = await wait(page)
      .locator('canvas.piece')
      .first()
      .evaluate((c) => c.getAnimations().some((a) => a.playState === 'running'));
    expect(moving).toBe(true);

    await expect(wait(page)).toHaveAttribute('data-phase', 'out', { timeout: 5000 });
    await expect(wait(page)).toHaveCount(0);
    await page.evaluate('window.heldJob');
  });

  test('a result that comes at once shows nothing', async ({ page }) => {
    await openEditor(page);
    const seen = await page.evaluate(`(async () => {
      const { during } = await import(/* @vite-ignore */ '/src/ui/wait.svelte.ts');
      let most = 0;
      let on = true;
      const look = () => {
        const board = document.querySelector('[data-testid=photo-wait] .board');
        const card = document.querySelector('[data-testid=photo-wait] .card');
        if (board) most = Math.max(most, Number(getComputedStyle(board).opacity));
        if (card) most = Math.max(most, Number(getComputedStyle(card).opacity));
        if (on) requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
      await during('Aplicando Mel', async () => {});
      await new Promise((done) => setTimeout(done, 400));
      on = false;
      return most;
    })()`);
    expect(seen).toBe(0);
    await expect(wait(page)).toHaveCount(0);
  });

  test('a short job leaves the photo in sight, with a light around it and its name', async ({ page }) => {
    await openEditor(page);
    await page.evaluate(`(async () => {
      const { ui } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
      ui.busy = 'Acertando a mancha…';
    })()`);
    const note = page.getByTestId('photo-busy');
    await expect(note).toContainText('Acertando a mancha');
    await expect(note).toHaveCSS('opacity', '1');
    await expect(note).toHaveCSS('pointer-events', 'none');
    await expect(wait(page)).toHaveCount(0);
    await page.evaluate(`(async () => {
      const { ui } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
      ui.busy = null;
    })()`);
    await expect(note).toHaveCount(0);
  });
});
