import { expect, test, type Page } from '@playwright/test';
import { DEV_ORIGIN } from '../../playwright.config';
import { expectNoErrors, openEditor, pickTool, PORTRAIT, setSlider, settle } from './helpers';

/** The dev server, so that the page can read the masks and the photo of the editor it is running. */
test.use({ baseURL: DEV_ORIGIN });

/** Points of the fixture portrait, in its own coordinates: see scripts/make-fixtures.mjs. */
const EYES: [number, number][] = [
  [-0.155, -0.06],
  [0.155, -0.06],
];
/** The glint of each eye sits up and to the left of its middle, and the pupil ends at 0.0105. */
const GLINT = { dx: -0.008, dy: -0.009, r: 0.0042 };
/** On the fibers of the iris, between the pupil and the edge, away from the glint. */
const FIBERS = { dx: 0.006, dy: 0.016 };
const IRIS_RADIUS = 0.0255;

/** Portrait coordinates (centered, y down, unit = image height) to image UV. */
const uv = ([x, y]: [number, number]): [number, number] => [0.5 + (x * PORTRAIT.h) / PORTRAIT.w, 0.5 + y];

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('XNNPACK')) errors.push(m.text());
  });
  return errors;
}

interface Spot {
  /** Least value of the mask over the spot, from 0 to 255. */
  mask: number;
  /** Mean color of the photo over the spot as the editor would save it, from 0 to 255. */
  rgb: [number, number, number];
}

/**
 * The mask of a tool and the saved photo, over discs given in image UV with the radius as a share of the
 * height. The code runs in the page, where the dev server serves each module by address.
 */
const read = (page: Page, tool: string, spots: [number, number, number][]) =>
  page.evaluate(`(async () => {
    const { engine } = await import(/* @vite-ignore */ '/src/ui/state.svelte.ts');
    const { exportImage } = await import(/* @vite-ignore */ '/src/core/export.ts');
    const e = engine();
    const mask = await e.masks.read(${JSON.stringify(tool)});
    const blob = await exportImage(e, { format: 'image/png', quality: 1 }, { tile() {}, encoding() {} });
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const c2d = canvas.getContext('2d');
    c2d.drawImage(bitmap, 0, 0);
    const photo = c2d.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const over = (w, h, [u, v, r], each) => {
      const reach = Math.max(1, r * h);
      for (let y = Math.floor(v * h - reach); y <= v * h + reach; y++) {
        for (let x = Math.floor(u * w - reach); x <= u * w + reach; x++) {
          if (Math.hypot(x + 0.5 - u * w, y + 0.5 - v * h) <= reach) each(y * w + x);
        }
      }
    };
    return ${JSON.stringify(spots)}.map((spot) => {
      let least = 255;
      if (mask) over(e.masks.w, e.masks.h, spot, (i) => (least = Math.min(least, mask[i])));
      const sum = [0, 0, 0];
      let n = 0;
      over(bitmap.width, bitmap.height, spot, (i) => {
        for (let c = 0; c < 3; c++) sum[c] += photo[i * 4 + c];
        n++;
      });
      return { mask: mask ? least : 0, rgb: sum.map((s) => s / n) };
    });
  })()`) as Promise<Spot[]>;

const spread = ([r, g, b]: number[]) => Math.max(r, g, b) - Math.min(r, g, b);

test.describe('o reflexo da luz no olho', () => {
  test('faz parte da íris, e fica branco em cima da cor nova', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const spots = EYES.flatMap((eye): [number, number, number][] => [
      [...uv([eye[0] + GLINT.dx, eye[1] + GLINT.dy]), GLINT.r * 0.6],
      // A ring around the glint, where the old mask left a patch of the old color.
      [...uv([eye[0] + GLINT.dx, eye[1] + GLINT.dy]), GLINT.r * 1.5],
      [...uv([eye[0] + FIBERS.dx, eye[1] + FIBERS.dy]), 0.003],
      // The white of the eye beside the iris.
      [...uv([eye[0] + IRIS_RADIUS * 1.35, eye[1]]), 0.003],
    ]);
    const before = await read(page, 'eyecolor', spots);
    await pickTool(page, 'eyes', 'eyecolor', { auto: true });
    await setSlider(page, 'Intensidade', 100);
    await settle(page, 400);
    const after = await read(page, 'eyecolor', spots);
    for (const [eye] of EYES.entries()) {
      const [glint, ring, fibers, white] = after.slice(eye * 4, eye * 4 + 4);
      const [glintWas, , fibersWas, whiteWas] = before.slice(eye * 4, eye * 4 + 4);
      // The whole glint and what is around it are inside the mask of the iris.
      expect(glint.mask).toBeGreaterThan(245);
      expect(ring.mask).toBeGreaterThan(245);
      expect(fibers.mask).toBeGreaterThan(245);
      expect(white.mask).toBe(0);
      // The glint is as bright as it was and has no color: neither the new one nor the old.
      expect(Math.min(...glint.rgb)).toBeGreaterThan(Math.min(...glintWas.rgb) - 6);
      expect(spread(glint.rgb)).toBeLessThan(12);
      // The fibers were brown and took the blue of the panel.
      expect(fibersWas.rgb[0]).toBeGreaterThan(fibersWas.rgb[2] + 20);
      expect(fibers.rgb[2]).toBeGreaterThan(fibers.rgb[0] + 20);
      // The white of the eye is as it was.
      for (let c = 0; c < 3; c++) expect(Math.abs(white.rgb[c] - whiteWas.rgb[c])).toBeLessThan(2);
    }
    expectNoErrors(errors);
  });

  test('Brilho no olhar e Olho vermelho também pegam o reflexo dentro da íris', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const spots = EYES.map((eye): [number, number, number] => [...uv([eye[0] + GLINT.dx, eye[1] + GLINT.dy]), GLINT.r * 0.6]);
    const before = await read(page, 'sparkle', spots);
    for (const tool of ['sparkle', 'redeye']) {
      await pickTool(page, 'eyes', tool, { auto: true });
      const after = await read(page, tool, spots);
      for (const [i, glint] of after.entries()) {
        expect(glint.mask).toBeGreaterThan(245);
        // The glint stays white: no darker, and with no color.
        expect(Math.min(...glint.rgb)).toBeGreaterThan(Math.min(...before[i].rgb) - 6);
        expect(spread(glint.rgb)).toBeLessThan(12);
      }
    }
    expectNoErrors(errors);
  });

  test('Branco do olho acaba onde a íris começa e não clareia o reflexo', async ({ page }) => {
    const errors = watch(page);
    await openEditor(page);
    const spots = EYES.flatMap((eye): [number, number, number][] => [
      [...uv([eye[0] + GLINT.dx, eye[1] + GLINT.dy]), GLINT.r],
      // Just inside the edge of the iris, then the white beside it.
      [...uv([eye[0] + IRIS_RADIUS * 0.85, eye[1]]), 0.002],
      [...uv([eye[0] + IRIS_RADIUS * 1.5, eye[1]]), 0.003],
    ]);
    await pickTool(page, 'eyes', 'sclera', { auto: true });
    const after = await read(page, 'sclera', spots);
    for (const [eye] of EYES.entries()) {
      const [glint, edge, white] = after.slice(eye * 3, eye * 3 + 3);
      expect(glint.mask).toBe(0);
      expect(edge.mask).toBe(0);
      expect(white.mask).toBeGreaterThan(200);
    }
    expectNoErrors(errors);
  });
});
