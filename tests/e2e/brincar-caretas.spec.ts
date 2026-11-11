import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { expectNoErrors, imageRect, meanDiff, settle, skipIntro, findFunFaces } from './helpers';

/** The dev server serves each module by address, so a test can read the document. */
test.use({ baseURL: DEV_ORIGIN });

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('XNNPACK') && !m.text().includes('404')) errors.push(m.text());
  });
  return errors;
}

/** Opens the portrait straight on the Brincar path, with its faces found. */
async function openBrincar(page: Page): Promise<void> {
  await skipIntro(page);
  await page.addInitScript(() => localStorage.setItem('glowup.startPath', '"fun"'));
  await page.goto('/');
  await page.setInputFiles('[data-testid=file-input]', 'tests/fixtures/portrait.png');
  await findFunFaces(page);
  await expect(page.getByTestId('opening')).toHaveCount(0);
  await settle(page);
}

/** The numbers of the effects on the face, or null when there are none. */
const values = (page: Page) =>
  page.evaluate(`(async () => {
    const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
    return engine().doc.fun?.faces?.[0]?.values ?? null;
  })()`) as Promise<Record<string, number> | null>;

test.describe('as caretas do Brincar', () => {
  test('o menu traz cada careta com seu controle, e as prontas num toque, cada toque uma etapa', async ({ page }) => {
    const errors = watch(page);
    await openBrincar(page);
    for (const name of ['Olhão', 'Olhinhos', 'Narigão', 'Narizinho', 'Bocão', 'Boquinha', 'Sorrisão', 'Bochechas de esquilo', 'Cara de peixe', 'Queixão', 'Testão', 'Esticado', 'Achatado', 'Cabeção']) {
      await expect(page.getByRole('slider', { name })).toHaveCount(1);
    }
    const r = imageRect(page);
    const clip = { x: r.x, y: r.y, width: r.w, height: r.h };
    const plain = await page.screenshot({ clip });

    const baby = page.locator('[data-combo=bebe]');
    await baby.click();
    await settle(page, 400);
    expect(await values(page)).toEqual({ olhao: 60, narizinho: 55, boquinha: 45, bochechas: 55, testao: 45 });
    await expect(baby).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('slider', { name: 'Olhão' })).toHaveValue('60');
    const babyShot = await page.screenshot({ clip });
    expect(await meanDiff(page, plain, babyShot)).toBeGreaterThan(0.3);

    // Another one takes the place of the first, every effect it leaves out at zero.
    const alien = page.locator('[data-combo=alien]');
    await alien.click();
    await settle(page, 400);
    expect(await values(page)).toEqual({ olhao: 100, narizinho: 70, boquinha: 55, peixe: 60, testao: 80, esticado: 35 });
    await expect(baby).toHaveAttribute('aria-pressed', 'false');
    await expect(alien).toHaveAttribute('aria-pressed', 'true');

    // Undo goes back one tap at a time.
    const undo = page.getByRole('button', { name: 'Desfazer' });
    await undo.click();
    await settle(page, 400);
    expect(await values(page)).toEqual({ olhao: 60, narizinho: 55, boquinha: 45, bochechas: 55, testao: 45 });
    expect(await meanDiff(page, babyShot, await page.screenshot({ clip }))).toBeLessThan(0.15);
    await undo.click();
    await settle(page, 400);
    expect(await values(page)).toBeNull();
    expect(await meanDiff(page, plain, await page.screenshot({ clip }))).toBeLessThan(0.05);
    await page.getByRole('button', { name: 'Refazer' }).click();
    await settle(page, 400);
    await expect(baby).toHaveAttribute('aria-pressed', 'true');

    // A second tap on the one that is on takes it off.
    await baby.click();
    await settle(page, 400);
    expect(await values(page)).toBeNull();
    await expect(baby).toHaveAttribute('aria-pressed', 'false');
    expectNoErrors(errors);
  });

  test('uma pronta salva volta igual, e Zerar Brincar tira tudo', async ({ page }) => {
    const errors = watch(page);
    await openBrincar(page);
    await page.locator('[data-combo=caricatura]').click();
    await settle(page, 600);
    const saved = await values(page);
    expect(saved).toEqual({ narigao: 70, bocao: 40, olhao: 30, queixao: 35, cabecao: 35 });
    const r = imageRect(page);
    const clip = { x: r.x, y: r.y, width: r.w, height: r.h };
    const edited = await page.screenshot({ clip });
    await page.getByRole('button', { name: 'Voltar para o início' }).click();
    await expect(page.getByText('De onde parou')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /Continuar/ }).first().click();
    await expect(page.getByTestId('brincar-menu')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('opening')).toHaveCount(0);
    await settle(page, 1500);
    expect(await values(page)).toEqual(saved);
    await expect(page.locator('[data-combo=caricatura]')).toHaveAttribute('aria-pressed', 'true');
    expect(await meanDiff(page, edited, await page.screenshot({ clip }))).toBeLessThan(0.15);
    await page.getByTestId('fun-reset').click();
    await settle(page, 400);
    expect(await values(page)).toBeNull();
    expectNoErrors(errors);
  });
});
