/**
 * How big an upscaled photo may get. The whole result sits in memory a few times over before it becomes a file (the
 * pixels, the canvas, the encoder), so the cap is on its area, and lower on a phone, which has less memory and a
 * browser that refuses large canvases.
 */

/** Largest upscaled photo, in pixels, on a computer or a tablet: about 20 megapixels, 80 MB in memory. */
export const CAP_PIXELS = 20_000_000;
/** Largest upscaled photo on a phone: about 8 megapixels. */
export const PHONE_CAP_PIXELS = 8_000_000;
/** Longest side of an upscaled photo: it must open again in the editor, on any device. */
export const CAP_SIDE = 8192;

export type Scale = 2 | 4;
export const SCALES: readonly Scale[] = [2, 4];

export const capFor = (phone: boolean) => (phone ? PHONE_CAP_PIXELS : CAP_PIXELS);

/** The scales a photo of `w` by `h` can take under `cap`, smallest first. */
export function scalesFor(w: number, h: number, cap: number): Scale[] {
  return SCALES.filter((s) => w * s * h * s <= cap && Math.max(w, h) * s <= CAP_SIDE);
}

/** The scale to start with: the largest that fits, or null when even 2 times would pass the cap. */
export function pickScale(w: number, h: number, cap: number): Scale | null {
  const fit = scalesFor(w, h, cap);
  return fit.length ? fit[fit.length - 1] : null;
}

/** Megapixels in the words of the app: one decimal below 10, whole numbers above. */
export function megapixels(pixels: number): string {
  const mp = pixels / 1e6;
  return `${mp < 10 ? mp.toFixed(1).replace('.', ',') : Math.round(mp)} MP`;
}

/** Why a photo cannot grow, in plain words, or an empty string when it can. */
export function capNote(w: number, h: number, cap: number): string {
  const fit = scalesFor(w, h, cap);
  if (fit.length === SCALES.length) return '';
  const limit = megapixels(cap);
  if (!fit.length) return `A foto já tem ${megapixels(w * h)}. Dobrar o tamanho passaria do limite de ${limit} deste aparelho, que existe para a memória não acabar no meio.`;
  return `Só 2× cabe aqui: 4× daria ${megapixels(w * 4 * h * 4)}, além do limite de ${limit} deste aparelho, que existe para a memória não acabar no meio.`;
}
