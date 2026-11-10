/**
 * Full-resolution export. Runs the same pipeline as the preview, one tile at a time, at scale 1.
 * Tiles keep a margin so filters see their neighbors, and their origin is aligned to 256 pixels
 * so mip-based low-pass filters line up between tiles and leave no seams.
 */

import type { Engine } from './engine';
import type { Rect } from './gl/context';
import { outputSize, outputToImage, sourceBounds } from './geometry';
import { RenderContext } from './pipeline/context';
import { shader } from './pipeline/pipeline';
import { nextPaint } from './progress';
import EXPORT_FRAG from './shaders/export.frag?raw';

export type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ExportOptions {
  format: ExportFormat;
  /** 0..1, used by JPG and WebP. */
  quality: number;
}

export interface RenderEvents {
  /** A tile is finished. `canvas` holds the photo so far, and `rect` is the part that just arrived. */
  tile(done: number, total: number, canvas: OffscreenCanvas, rect: Rect): void;
}

export interface ExportEvents extends RenderEvents {
  /** All tiles are done and the file is being compressed. */
  encoding(): void;
}

const ALIGN = 256;

function tileSide(): number {
  // Tests force small tiles to prove that the result does not depend on the tile grid.
  const forced = Number(localStorage.getItem('glowup.tile'));
  if (forced > 0) return forced;
  return matchMedia('(pointer: coarse)').matches ? 1280 : 2048;
}

export async function exportImage(engine: Engine, options: ExportOptions, events: ExportEvents): Promise<Blob> {
  const canvas = await renderImage(engine, events);
  events.encoding();
  await nextPaint();
  return encodeImage(canvas, options);
}

export const encodeImage = (canvas: OffscreenCanvas, options: ExportOptions) => canvas.convertToBlob({ type: options.format, quality: options.quality });

/** The photo with every retouch, at full resolution, as the file will hold it. */
export async function renderImage(engine: Engine, events: RenderEvents): Promise<OffscreenCanvas> {
  const { glc, doc, source, pipeline } = engine;
  if (!source || !pipeline) throw new Error('no-image');
  engine.commit();
  const crop = doc.crop;
  const out = outputSize(crop);
  const side = Math.min(tileSide(), glc.caps.maxTexture >> 1);
  const cols = Math.ceil(out.w / side);
  const rows = Math.ceil(out.h / side);
  const long = Math.max(doc.width, doc.height);
  const blurPx = doc.blur.mode === 'off' ? 0 : (doc.blur.strength / 100) * 0.035 * long * 3;
  const fieldPx = doc.hasField && engine.field ? engine.field.maxDisplacement() * long : 0;
  const healPx = doc.heals.reduce((m, op) => {
    const reach = Math.hypot(op.du * doc.width, op.dv * doc.height);
    return Math.max(m, reach + Math.max(...op.dabs.map((d) => d.r * long)) * 3);
  }, 0);
  const margin = Math.ceil(Math.max(192, 0.05 * long) + blurPx + fieldPx + healPx);

  const canvas = new OffscreenCanvas(out.w, out.h);
  const c2d = canvas.getContext('2d', { alpha: false });
  if (!c2d) throw new Error('canvas-unavailable');

  const previousActive = pipeline.active;
  pipeline.active = null;
  engine.exporting = true;
  const toImage = outputToImage(crop, doc.width, doc.height);
  const program = glc.program(shader(EXPORT_FRAG));

  try {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = c * side;
        const py = r * side;
        const tw = Math.min(side, out.w - px);
        const th = Math.min(side, out.h - py);
        const s0 = px / out.w;
        const t0 = py / out.h;
        const s1 = (px + tw) / out.w;
        const t1 = (py + th) / out.h;
        const b = sourceBounds(crop, doc.width, doc.height, s0, t0, s1, t1);
        const x0 = Math.max(0, Math.floor((b.x0 - margin) / ALIGN) * ALIGN);
        const y0 = Math.max(0, Math.floor((b.y0 - margin) / ALIGN) * ALIGN);
        const x1 = Math.min(doc.width, Math.ceil(b.x1 + margin));
        const y1 = Math.min(doc.height, Math.ceil(b.y1 + margin));

        const tex = source.toTexture(glc, x0, y0, x1 - x0, y1 - y0, 1);
        const ctx = new RenderContext(glc, { x: x0, y: y0, w: x1 - x0, h: y1 - y0, scale: 1 }, doc.width, doc.height, tex);
        pipeline.update(ctx, doc);

        const tile = glc.acquire(tw, th, 'rgba8');
        glc.run(program, tile, {
          uInput: ctx.slot('final'),
          uToImage: toImage,
          uRegion: ctx.regionUv,
          uTile: [s0, t0, s1 - s0, t1 - t0],
        });
        const pixels = new Uint8ClampedArray(tw * th * 4);
        glc.readSync(tile, { x: 0, y: 0, w: tw, h: th }, pixels);
        c2d.putImageData(new ImageData(pixels, tw, th), px, py);
        glc.release(tile);
        ctx.destroy();

        events.tile(r * cols + c + 1, rows * cols, canvas, { x: px, y: py, w: tw, h: th });
        await nextPaint();
      }
    }
  } finally {
    engine.exporting = false;
    pipeline.active = previousActive;
    glc.drainPool();
    engine.ctx?.invalidate('prefix');
    engine.requestRender();
  }
  return canvas;
}

/** True when this browser can really encode the format. */
export async function canEncode(format: ExportFormat): Promise<boolean> {
  const canvas = new OffscreenCanvas(1, 1);
  canvas.getContext('2d');
  const blob = await canvas.convertToBlob({ type: format });
  return blob.type === format;
}
