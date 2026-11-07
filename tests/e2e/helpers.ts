import { expect, type Page } from '@playwright/test';

/** Size of the fixture portrait. Coordinates below match scripts/make-fixtures.mjs. */
export const PORTRAIT = { w: 1500, h: 1875 };

export async function openEditor(page: Page, fixture = 'portrait.png'): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('glowup.onboarded', 'true'));
  await page.goto('/');
  await page.setInputFiles('[data-testid=file-input]', `tests/fixtures/${fixture}`);
  await page.locator('[data-group=skin]').waitFor({ timeout: 90_000 });
  await expect(page.getByTestId('opening')).toHaveCount(0);
  await settle(page);
}

export async function settle(page: Page, ms = 700): Promise<void> {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(ms);
}

/** Free area on the desktop layout: rail on the left, panel on the right. */
function area(page: Page) {
  const vp = page.viewportSize()!;
  const left = 92;
  const right = 348;
  const top = 64;
  const bottom = 12;
  return { x: left, y: top, w: vp.width - left - right, h: vp.height - top - bottom };
}

export function imageRect(page: Page, size = PORTRAIT) {
  const a = area(page);
  const k = Math.min(a.w / size.w, a.h / size.h);
  const w = size.w * k;
  const h = size.h * k;
  return { x: a.x + (a.w - w) / 2, y: a.y + (a.h - h) / 2, w, h, k };
}

/** Portrait coordinates (centered, y down, unit = image height) to screen pixels. */
export function facePoint(page: Page, x: number, y: number): [number, number] {
  const r = imageRect(page);
  return [r.x + r.w / 2 + x * r.h, r.y + r.h / 2 + y * r.h];
}

export async function pickTool(page: Page, group: string, tool: string): Promise<void> {
  await page.locator(`[data-group=${group}]`).click();
  const button = page.locator(`[data-tool=${tool}]`);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await settle(page, 300);
}

export async function setSlider(page: Page, label: string, value: number): Promise<void> {
  const input = page.getByRole('slider', { name: label, exact: true });
  await input.evaluate((el, v) => {
    const i = el as HTMLInputElement;
    i.value = String(v);
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }, value);
}

/** Paints a polyline given in portrait coordinates. */
export async function paint(page: Page, points: [number, number][], passes = 1): Promise<void> {
  for (let pass = 0; pass < passes; pass++) {
    const [sx, sy] = facePoint(page, ...points[0]);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i < points.length; i++) {
      const [a, b] = facePoint(page, ...points[i]);
      await page.mouse.move(a, b, { steps: 6 });
    }
    await page.mouse.up();
  }
  await page.mouse.move(2, 2);
  await settle(page, 350);
}

export async function tap(page: Page, x: number, y: number): Promise<void> {
  const [sx, sy] = facePoint(page, x, y);
  await page.mouse.click(sx, sy);
  await page.mouse.move(2, 2);
  await settle(page, 400);
}

/** Fills an ellipse with a zig-zag stroke. */
export function scribble(cx: number, cy: number, rx: number, ry: number, rows = 8): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= rows; i++) {
    const t = (i / rows) * 2 - 1;
    const half = Math.sqrt(Math.max(0, 1 - t * t)) * rx;
    const y = cy + t * ry;
    if (i % 2 === 0) pts.push([cx - half, y], [cx + half, y]);
    else pts.push([cx + half, y], [cx - half, y]);
  }
  return pts;
}

/** Writes a side-by-side comparison image into docs/visual-checks. */
export async function compare(page: Page, name: string, title: string, before: Buffer, after: Buffer): Promise<void> {
  const other = await page.context().newPage();
  const src = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;
  await other.setContent(`<!doctype html><body style="margin:0;background:#0b0b0c;color:#f4f1ec;font:15px system-ui">
    <div id="c" style="display:inline-block;padding:14px">
      <div style="margin-bottom:10px">${title}</div>
      <div style="display:flex;gap:10px">
        <figure style="margin:0"><img src="${src(before)}" style="display:block"><figcaption style="margin-top:6px">Antes</figcaption></figure>
        <figure style="margin:0"><img src="${src(after)}" style="display:block"><figcaption style="margin-top:6px">Depois</figcaption></figure>
      </div>
    </div></body>`);
  await other.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  await other.locator('#c').screenshot({ path: `docs/visual-checks/${name}.png` });
  await other.close();
}

export function expectNoErrors(errors: string[]): void {
  expect(errors, errors.join('\n')).toEqual([]);
}
