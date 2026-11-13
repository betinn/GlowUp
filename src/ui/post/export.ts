/**
 * The files of a post: one a slide, drawn from the photos at full size by the same code that draws the table.
 * One slide is in memory at a time, and each photo is decoded no larger than it is drawn.
 */

import type { ExportFormat } from '../../core/export';
import { drawnWidths, drawPage, photosOnPage } from '../../core/post/draw';
import { pageCount, pageSize, ratioById, type PostDoc } from '../../core/post/layout';
import { photoFile } from '../../core/post/store';
import { zip } from '../../core/post/zip';
import { nextPaint } from '../../core/progress';
import { decodeAt } from './pictures';

export interface PostExportOptions {
  format: ExportFormat;
  /** 0..1, used by JPG and WebP. */
  quality: number;
  /** Width of a slide in pixels. The height follows the shape of the post. */
  width: number;
}

export interface PostExportEvents {
  /** A slide is drawn. `canvas` holds it until the next one starts. */
  page(done: number, total: number, canvas: OffscreenCanvas): void;
}

const EXT: Record<ExportFormat, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Widths offered for a slide. The first is what the feeds show; the others keep more for a zoom or a print. */
export const POST_WIDTHS = [1080, 1440, 2160] as const;

/** One file a slide, in order. The names sort in the order of the slides. */
export async function exportPost(doc: PostDoc, options: PostExportOptions, events: PostExportEvents): Promise<File[]> {
  const total = pageCount(doc);
  const { w, h } = pageSize(ratioById(doc.ratio), options.width);
  const need = drawnWidths(doc, w, h);
  const stamp = Date.now().toString(36);
  const held = new Map<number, ImageBitmap>();
  const files: File[] = [];
  try {
    for (let page = 0; page < total; page++) {
      const here = photosOnPage(doc, page);
      // A photo that no later slide shows gives its memory back.
      for (const [index, picture] of held) {
        if (!here.includes(index)) {
          picture.close();
          held.delete(index);
        }
      }
      for (const index of here) {
        if (held.has(index)) continue;
        const photo = doc.photos[index];
        const file = await photoFile(photo.id);
        if (!file) throw new Error('photo-gone');
        held.set(index, await decodeAt(file.blob, file.w, file.h, (need[index] * Math.max(file.w, file.h)) / file.w));
      }
      const canvas = new OffscreenCanvas(w, h);
      const c = canvas.getContext('2d', { alpha: false });
      if (!c) throw new Error('canvas-unavailable');
      drawPage(c, doc, page, w, h, (index) => held.get(index) ?? null);
      const blob = await canvas.convertToBlob({ type: options.format, quality: options.quality });
      const number = total > 1 ? `-${String(page + 1).padStart(2, '0')}` : '';
      files.push(new File([blob], `glowup-${stamp}${number}.${EXT[options.format]}`, { type: options.format }));
      events.page(page + 1, total, canvas);
      await nextPaint();
    }
  } finally {
    for (const picture of held.values()) picture.close();
  }
  return files;
}

/** Every slide in one file, for a download that asks once. */
export async function zipFiles(files: readonly File[]): Promise<File> {
  const entries = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
  const name = files[0].name.replace(/-\d+\.[a-z]+$/, '');
  return new File(zip(entries) as BlobPart[], `${name}.zip`, { type: 'application/zip' });
}
