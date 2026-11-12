/**
 * Draws a slide of a post on a canvas. The same code draws what the person sees while putting the post
 * together and what goes into the files, at any size, so one is the other.
 */

import { pageBoxes, pageCount, photoIn, place, type PostDoc } from './layout';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A photo ready to draw. */
export type Picture = ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

/** The color of a place whose photo has not come yet. */
const WAITING = '#1d1d20';
/** How much darker the photo out of focus is, so the photo in front of it stands out. */
const BACKDROP_SHADE = 0.3;
/** Width of the small copy the backdrop is made from. So few pixels, stretched, are a blur with no filter. */
const SOFT_SIDE = 36;

const softCopies = new WeakMap<Picture, OffscreenCanvas | HTMLCanvasElement>();

function canvasOf(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/**
 * The photo out of focus: shrunk to a few pixels and grown back in two steps. It needs no canvas filter, which
 * not every browser has, and it is the same in the preview and in the file.
 */
function softCopy(picture: Picture): OffscreenCanvas | HTMLCanvasElement {
  const kept = softCopies.get(picture);
  if (kept) return kept;
  const k = SOFT_SIDE / Math.max(picture.width, picture.height);
  const w = Math.max(2, Math.round(picture.width * k));
  const h = Math.max(2, Math.round(picture.height * k));
  const small = canvasOf(w, h);
  const sc = small.getContext('2d') as Ctx;
  sc.imageSmoothingEnabled = true;
  sc.imageSmoothingQuality = 'high';
  sc.drawImage(picture, 0, 0, w, h);
  const mid = canvasOf(w * 4, h * 4);
  const mc = mid.getContext('2d') as Ctx;
  mc.imageSmoothingEnabled = true;
  mc.imageSmoothingQuality = 'high';
  mc.drawImage(small, 0, 0, w * 4, h * 4);
  softCopies.set(picture, mid);
  return mid;
}

function roundedPath(c: Ctx, x: number, y: number, w: number, h: number, radius: number): void {
  const r = Math.min(radius, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

export interface DrawOptions {
  /** A photo to draw a line around: the one the person is framing. Only on the screen. */
  outline?: number;
  /** The color of that line, and its width in pixels of the canvas. */
  outlineColor?: string;
  outlineWidth?: number;
}

/** Draws one slide, `width` by `height` pixels. A photo that `picture` does not have yet leaves its place dark. */
export function drawPage(c: Ctx, doc: PostDoc, page: number, width: number, height: number, picture: (photo: number) => Picture | null, options: DrawOptions = {}): void {
  c.save();
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.fillStyle = doc.background;
  c.fillRect(0, 0, width, height);
  for (const box of pageBoxes(doc, page, width, height)) {
    const photo = photoIn(doc, box.photo);
    const pic = picture(box.photo);
    c.save();
    roundedPath(c, box.x, box.y, box.w, box.h, box.radius);
    c.clip();
    if (!pic) {
      c.fillStyle = WAITING;
      c.fillRect(box.x, box.y, box.w, box.h);
    } else {
      const fit = place(photo, box.w, box.h);
      if (photo.whole && doc.blur) {
        // The same photo fills the slide behind itself, out of focus and a little darker.
        const soft = softCopy(pic);
        const k = Math.max(box.w / soft.width, box.h / soft.height) * 1.08;
        c.drawImage(soft, box.x + (box.w - soft.width * k) / 2, box.y + (box.h - soft.height * k) / 2, soft.width * k, soft.height * k);
        c.fillStyle = `rgb(0 0 0 / ${BACKDROP_SHADE})`;
        c.fillRect(box.x, box.y, box.w, box.h);
      }
      // A photo with transparency sits on white, as it does in the editor.
      c.fillStyle = '#fff';
      c.fillRect(box.x + fit.x, box.y + fit.y, fit.w, fit.h);
      c.drawImage(pic, box.x + fit.x, box.y + fit.y, fit.w, fit.h);
    }
    c.restore();
    if (options.outline === box.photo) {
      const lw = options.outlineWidth ?? 2;
      roundedPath(c, box.x + lw / 2, box.y + lw / 2, box.w - lw, box.h - lw, Math.max(0, box.radius - lw / 2));
      c.lineWidth = lw;
      c.strokeStyle = options.outlineColor ?? '#ffb877';
      c.stroke();
    }
  }
  c.restore();
}

/** The photos that show on a slide. */
export const photosOnPage = (doc: PostDoc, page: number): number[] => pageBoxes(doc, page, 100, 100).map((b) => b.photo);

/**
 * How wide each photo is drawn on the slides of a post `width` pixels wide: the size worth decoding it at. A
 * photo is never asked for larger than it is.
 */
export function drawnWidths(doc: PostDoc, width: number, height: number): number[] {
  const need = doc.photos.map(() => 1);
  for (let page = 0; page < pageCount(doc); page++) {
    for (const box of pageBoxes(doc, page, width, height)) {
      const photo = photoIn(doc, box.photo);
      need[box.photo] = Math.max(need[box.photo], Math.min(photo.w, Math.ceil(place(photo, box.w, box.h).w)));
    }
  }
  return need;
}
