/**
 * A post: several photos that go out together. Three ways of putting them together, over the same photos in the
 * same order, so going from one to another loses nothing:
 *
 * - `carousel`: one photo a slide.
 * - `collage`: all the photos in one picture.
 * - `strip`: all the photos side by side in one long picture, cut into slides, so the picture goes on when the
 *   person swipes.
 *
 * Everything here is numbers: where each photo goes and what part of it shows. Nothing here draws.
 */

export type PostKind = 'carousel' | 'collage' | 'strip';

export interface Ratio {
  /** Goes into the saved post: never changes. */
  id: string;
  label: string;
  w: number;
  h: number;
}

/** The shapes of a slide. The first is where a new post starts: the tallest a feed shows whole. */
export const RATIOS: readonly Ratio[] = [
  { id: '4:5', label: 'Retrato', w: 4, h: 5 },
  { id: '1:1', label: 'Quadrado', w: 1, h: 1 },
  { id: '3:4', label: 'Clássico', w: 3, h: 4 },
  { id: '9:16', label: 'Story', w: 9, h: 16 },
  { id: '16:9', label: 'Paisagem', w: 16, h: 9 },
];

export const ratioById = (id: string): Ratio => RATIOS.find((r) => r.id === id) ?? RATIOS[0];

/** Most photos a post takes, and most slides a strip is cut into. */
export const MAX_PHOTOS = 10;
export const MAX_PAGES = 10;
export const MAX_ZOOM = 4;

/** A photo of the post: a project of its own, retouched in the editor, and what part of it shows in its place. */
export interface PostPhoto {
  /** The id of its project. */
  id: string;
  /** Its size as it comes out of the editor, crop included. */
  w: number;
  h: number;
  /** The point of the photo that sits in the middle of its place, 0 to 1. */
  x: number;
  y: number;
  /** 1 fills the place. More comes closer. */
  zoom: number;
  /** In a carousel: the whole photo shows, with the background around it. Left out: it fills the slide. */
  whole?: boolean;
}

export interface PostDoc {
  version: 1;
  kind: PostKind;
  ratio: string;
  photos: PostPhoto[];
  /** The arrangement of the collage and of the strip, from `collageTemplates` and `stripTemplates`. */
  collage: string;
  strip: string;
  /** Slides the strip is cut into. Left out: as many as suit the photos. */
  pages?: number;
  /** Space between the photos of a collage or a strip, 0 to 100. */
  gap: number;
  /** Roundness of their corners, 0 to 100. */
  radius: number;
  /** The color that shows where no photo is, as `#rrggbb`. */
  background: string;
  /** Behind a whole photo of a carousel goes the photo itself, out of focus, in place of the color. */
  blur: boolean;
}

/** The colors offered for the background. The first is where a new post starts. */
export const BACKGROUNDS: readonly { color: string; label: string }[] = [
  { color: '#ffffff', label: 'Branco' },
  { color: '#f4f1ec', label: 'Papel' },
  { color: '#0b0b0c', label: 'Preto' },
  { color: '#e9d8c8', label: 'Areia' },
  { color: '#c9d3c4', label: 'Sálvia' },
  { color: '#2b2f3a', label: 'Noite' },
];

export function createPost(photos: PostPhoto[]): PostDoc {
  return { version: 1, kind: 'carousel', ratio: RATIOS[0].id, photos, collage: '', strip: '', gap: 30, radius: 0, background: BACKGROUNDS[0].color, blur: true };
}

export const newPhoto = (id: string, w: number, h: number): PostPhoto => ({ id, w, h, x: 0.5, y: 0.5, zoom: 1 });

/** A place for a photo. `x` and `w` are in slides and `y` and `h` in heights of a slide, so a strip of 3 slides is 3 wide. */
export interface Cell {
  photo: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Template {
  id: string;
  /** In a square of side 1, whatever the shape of the slide. */
  rects: Rect[];
}

/** Rows of cells. A row of fewer cells is taller, so a photo alone in its row reads as the main one. */
function rows(counts: readonly number[]): Rect[] {
  const weights = counts.map((k) => 1 / Math.sqrt(k));
  const total = weights.reduce((a, b) => a + b, 0);
  let y = 0;
  return counts.flatMap((k, r) => {
    const h = weights[r] / total;
    const row = Array.from({ length: k }, (_, c) => ({ x: c / k, y, w: 1 / k, h }));
    y += h;
    return row;
  });
}

const turned = (rects: Rect[]): Rect[] => rects.map(({ x, y, w, h }) => ({ x: y, y: x, w: h, h: w }));

/** `n` split into `parts` as evenly as it goes, the larger parts last. */
function split(n: number, parts: number): number[] {
  const base = Math.floor(n / parts);
  const extra = n % parts;
  return Array.from({ length: parts }, (_, i) => base + (i >= parts - extra ? 1 : 0));
}

const signature = (rects: Rect[]) => rects.map((r) => [r.x, r.y, r.w, r.h].map((v) => v.toFixed(3)).join(',')).join(';');

/** A cell this much longer than wide, or wider than long, shows too little of a photo. */
const THIN = 3.2;

/**
 * The arrangements of a collage of `n` photos on a slide of this shape, the most even first. Rows and columns of
 * photos, and one large photo beside the rest. Those that would leave a sliver of a cell stay out.
 */
export function collageTemplates(n: number, ratio: Ratio): Template[] {
  if (n < 1) return [];
  const lists: number[][] = [];
  for (let parts = 1; parts <= Math.min(n, 4); parts++) {
    const even = split(n, parts);
    lists.push(even);
    const back = [...even].reverse();
    if (back.join() !== even.join()) lists.push(back);
  }
  if (n >= 3 && n <= 5) lists.push([1, n - 1], [n - 1, 1]);
  const aspect = ratio.w / ratio.h;
  const out: Template[] = [];
  const seen = new Set<string>();
  const add = (id: string, rects: Rect[]) => {
    const key = signature(rects);
    const fits = rects.every((r) => {
      const shape = (r.w * aspect) / r.h;
      return shape <= THIN && shape >= 1 / THIN;
    });
    if (seen.has(key) || !fits) return;
    seen.add(key);
    out.push({ id, rects });
  };
  for (const counts of lists) add(`r${counts.join('')}`, rows(counts));
  for (const counts of lists) add(`c${counts.join('')}`, turned(rows(counts)));
  // One photo always has a place, whatever the shape of the slide.
  if (!out.length) out.push({ id: `r${n}`, rects: rows([n]) });
  return out;
}

export interface StripTemplate {
  id: string;
  label: string;
  /** In a strip one slide wide and one slide tall: `x` and `w` are multiplied by the number of slides. */
  rects: Rect[];
}

/** Cells side by side, each as wide as its weight. */
function band(weights: readonly number[], y = 0, h = 1): Rect[] {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = 0;
  return weights.map((w) => {
    const rect = { x: x / total, y, w: w / total, h };
    x += w;
    return rect;
  });
}

/**
 * The arrangements of a strip of `n` photos. In all but `equal` the photos have different widths, so the cut
 * between two slides falls inside a photo and not between two: that is what makes the next slide go on.
 */
export function stripTemplates(n: number): StripTemplate[] {
  if (n < 1) return [];
  const equal: StripTemplate = { id: 'equal', label: 'Iguais', rects: band(Array.from({ length: n }, () => 1)) };
  if (n === 1) return [equal];
  // The first photo takes a slide and a half and the last takes half: every cut lands inside a photo.
  const lead: StripTemplate = { id: 'lead', label: 'Escada', rects: band(Array.from({ length: n }, (_, i) => (i === 0 ? 1.5 : i === n - 1 ? 0.5 : 1))) };
  // Wide and narrow in turns. Each photo ends a third or two thirds of a slide past a cut, never on one.
  const past = (k: number) => (k <= 0 || k >= n ? 0 : k % 2 ? 0.3 : 0.6);
  const wave: StripTemplate = { id: 'wave', label: 'Onda', rects: band(Array.from({ length: n }, (_, i) => 1 + past(i + 1) - past(i))) };
  const out = [lead, equal, wave];
  if (n >= 3) {
    // Two rows, laid as bricks: the joints of one row fall in the middle of the photos of the other.
    const top = Math.ceil(n / 2);
    const under = n - top;
    // With as many below as above, the row below starts with half a brick, or the joints would line up.
    const shifted = Array.from({ length: under }, (_, i) => (under === top && under > 1 ? (i === 0 ? 0.5 : i === under - 1 ? 1.5 : 1) : 1));
    out.push({ id: 'brick', label: 'Tijolos', rects: [...band(Array.from({ length: top }, () => 1), 0, 0.5), ...band(shifted, 0.5, 0.5)] });
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Slides a strip is cut into when the person has not said: what suits the photos, never fewer than two. */
export function autoPages(doc: PostDoc): number {
  const n = doc.photos.length;
  if (n !== 1) return clamp(n, 2, MAX_PAGES);
  const ratio = ratioById(doc.ratio);
  const photo = doc.photos[0];
  // One photo: as many slides as its shape fills, so a panorama is cut into what it shows whole.
  return clamp(Math.round(photo.w / photo.h / (ratio.w / ratio.h)), 2, MAX_PAGES);
}

/** Slides the post comes out as. */
export function pageCount(doc: PostDoc): number {
  if (doc.kind === 'carousel') return doc.photos.length;
  if (doc.kind === 'collage') return doc.photos.length ? 1 : 0;
  return doc.photos.length ? clamp(Math.round(doc.pages ?? autoPages(doc)), 1, MAX_PAGES) : 0;
}

/** The arrangement in use, which is the first of the list when the saved one does not suit the photos of now. */
export function collageOf(doc: PostDoc): Template | undefined {
  const list = collageTemplates(doc.photos.length, ratioById(doc.ratio));
  return list.find((t) => t.id === doc.collage) ?? list[0];
}

export function stripOf(doc: PostDoc): StripTemplate | undefined {
  const list = stripTemplates(doc.photos.length);
  return list.find((t) => t.id === doc.strip) ?? list[0];
}

/** A photo as its place takes it: only a slide of a carousel shows a photo whole. Anywhere else it fills. */
export function photoIn(doc: PostDoc, index: number): PostPhoto {
  const photo = doc.photos[index];
  return doc.kind === 'carousel' || !photo.whole ? photo : { ...photo, whole: false };
}

/** Where each photo goes, in the order of the photos. */
export function cellsOf(doc: PostDoc): Cell[] {
  if (doc.kind === 'carousel') return doc.photos.map((_, photo) => ({ photo, x: photo, y: 0, w: 1, h: 1 }));
  if (doc.kind === 'collage') return (collageOf(doc)?.rects ?? []).map((r, photo) => ({ photo, ...r }));
  const pages = pageCount(doc);
  return (stripOf(doc)?.rects ?? []).map((r, photo) => ({ photo, x: r.x * pages, y: r.y, w: r.w * pages, h: r.h }));
}

/** The slide where most of a photo shows. */
export function pageOfPhoto(doc: PostDoc, photo: number): number {
  const cell = cellsOf(doc)[photo];
  if (!cell) return 0;
  return clamp(Math.floor(cell.x + cell.w / 2), 0, Math.max(0, pageCount(doc) - 1));
}

/** Largest space between photos and largest corner, as shares of the width of a slide. */
const GAP_SPAN = 0.05;
const RADIUS_SPAN = 0.08;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CellBox extends Box {
  photo: number;
  radius: number;
}

/**
 * The cells that show on one slide, in pixels of that slide. A cell of a strip that crosses the cut comes out on
 * both slides, each with the part that is its own, so the two halves meet when the slides sit side by side. The
 * space between two photos is the same as between a photo and the edge of the picture. A carousel has neither
 * space nor corners: the photo is the slide.
 */
export function pageBoxes(doc: PostDoc, page: number, width: number, height: number): CellBox[] {
  const framed = doc.kind !== 'carousel';
  const gap = framed ? (doc.gap / 100) * GAP_SPAN * width : 0;
  const radius = framed ? (doc.radius / 100) * RADIUS_SPAN * width : 0;
  const pages = pageCount(doc);
  const edge = 1e-6;
  return cellsOf(doc)
    .filter((c) => c.x < page + 1 - edge && c.x + c.w > page + edge)
    .map((c) => {
      const left = c.x < edge ? gap : gap / 2;
      const right = c.x + c.w > pages - edge ? gap : gap / 2;
      const top = c.y < edge ? gap : gap / 2;
      const bottom = c.y + c.h > 1 - edge ? gap : gap / 2;
      const x = (c.x - page) * width + left;
      const y = c.y * height + top;
      return { photo: c.photo, x, y, w: Math.max(1, c.w * width - left - right), h: Math.max(1, c.h * height - top - bottom), radius };
    });
}

/** Where the whole photo lands, from the corner of its place, in the units of the place. */
export function place(photo: PostPhoto, cw: number, ch: number): Box {
  const whole = !!photo.whole;
  const scale = whole ? Math.min(cw / photo.w, ch / photo.h) : Math.max(cw / photo.w, ch / photo.h) * clamp(photo.zoom, 1, MAX_ZOOM);
  const w = photo.w * scale;
  const h = photo.h * scale;
  // The photo never leaves a gap in a place it fills: its edge stops at the edge of the place.
  const along = (focus: number, size: number, room: number) => (size > room ? clamp(room / 2 - focus * size, room - size, 0) : (room - size) / 2);
  return { x: along(photo.x, w, cw), y: along(photo.y, h, ch), w, h };
}

/** The point in the middle of the place, for a photo as it lands: what `x` and `y` are once the edges held. */
function focusOf(box: Box, cw: number, ch: number): { x: number; y: number } {
  return { x: clamp((cw / 2 - box.x) / box.w, 0, 1), y: clamp((ch / 2 - box.y) / box.h, 0, 1) };
}

/** The photo dragged by this much inside its place. The edges hold, and the next drag starts from where it stopped. */
export function panned(photo: PostPhoto, cw: number, ch: number, dx: number, dy: number): PostPhoto {
  if (photo.whole) return photo;
  const box = place(photo, cw, ch);
  const moved = { ...box, x: clamp(box.x + dx, Math.min(0, cw - box.w), 0), y: clamp(box.y + dy, Math.min(0, ch - box.h), 0) };
  return { ...photo, ...focusOf(moved, cw, ch) };
}

/**
 * The photo brought closer or farther, around a point of its place: the point under the fingers stays under
 * them. `ax` and `ay` are from the corner of the place.
 */
export function zoomed(photo: PostPhoto, cw: number, ch: number, factor: number, ax = cw / 2, ay = ch / 2): PostPhoto {
  if (photo.whole) return photo;
  const before = place(photo, cw, ch);
  const zoom = clamp(photo.zoom * factor, 1, MAX_ZOOM);
  const k = zoom / clamp(photo.zoom, 1, MAX_ZOOM);
  const next = { ...photo, zoom };
  const w = before.w * k;
  const h = before.h * k;
  const moved = { x: clamp(ax - (ax - before.x) * k, Math.min(0, cw - w), 0), y: clamp(ay - (ay - before.y) * k, Math.min(0, ch - h), 0), w, h };
  return { ...next, ...focusOf(moved, cw, ch) };
}

/** A photo moved to another place in the order. The places stay, and the photos change places. */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(clamp(to, 0, out.length), 0, item);
  return out;
}

/** The size of a slide in pixels, for a width. Even numbers, as encoders like. */
export function pageSize(ratio: Ratio, width: number): { w: number; h: number } {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  return { w: even(width), h: even((width * ratio.h) / ratio.w) };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const finite = (o: Record<string, unknown>, keys: readonly string[]) => keys.every((k) => Number.isFinite(o[k]));

/** Why a saved post cannot open, or null when it can. */
export function postProblem(doc: unknown): string | null {
  if (!isObject(doc)) return 'no document';
  if (doc.version !== 1) return 'version';
  if (!['carousel', 'collage', 'strip'].includes(doc.kind as string)) return 'kind';
  if (typeof doc.ratio !== 'string' || typeof doc.collage !== 'string' || typeof doc.strip !== 'string') return 'names';
  if (typeof doc.background !== 'string' || !/^#[0-9a-f]{6}$/i.test(doc.background) || typeof doc.blur !== 'boolean') return 'background';
  if (!finite(doc, ['gap', 'radius'])) return 'frame';
  if (!(doc.pages === undefined || Number.isFinite(doc.pages))) return 'pages';
  const photoOk = (p: unknown) => isObject(p) && typeof p.id === 'string' && finite(p, ['w', 'h', 'x', 'y', 'zoom']) && (p.w as number) >= 1 && (p.h as number) >= 1;
  if (!Array.isArray(doc.photos) || !doc.photos.length || doc.photos.length > MAX_PHOTOS || !doc.photos.every(photoOk)) return 'photos';
  return null;
}
