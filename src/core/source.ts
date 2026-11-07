import type { GLContext, Tex } from './gl/context';

/** Largest side accepted for one decoded image. Bigger files are refused with a friendly message. */
export const MAX_SOURCE_SIDE = 16384;

/** The original photo, kept untouched. Decoded once; regions are read on demand. */
export class SourceImage {
  private constructor(
    readonly bitmap: ImageBitmap,
    readonly blob: Blob,
    readonly opaque: boolean,
  ) {}

  static async decode(blob: Blob): Promise<SourceImage> {
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: 'from-image',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'default',
    });
    if (Math.max(bitmap.width, bitmap.height) > MAX_SOURCE_SIDE) {
      bitmap.close();
      throw new Error('image-too-large');
    }
    return new SourceImage(bitmap, blob, blob.type === 'image/jpeg');
  }

  get w() {
    return this.bitmap.width;
  }

  get h() {
    return this.bitmap.height;
  }

  /** Draws part of the photo at the given output size. Transparency is flattened over white. */
  private draw(x: number, y: number, w: number, h: number, outW: number, outH: number): OffscreenCanvas {
    const canvas = new OffscreenCanvas(outW, outH);
    const c = canvas.getContext('2d', { alpha: false })!;
    c.fillStyle = '#fff';
    c.fillRect(0, 0, outW, outH);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.bitmap, x, y, w, h, 0, 0, outW, outH);
    return canvas;
  }

  /** Uploads a region as a new RGBA8 texture. */
  toTexture(glc: GLContext, x: number, y: number, w: number, h: number, scale: number): Tex {
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));
    const tex = glc.createTex(outW, outH, 'rgba8');
    glc.uploadImage(tex, this.draw(x, y, w, h, outW, outH));
    return tex;
  }

  /** Small preview for the home screen. */
  async thumbnail(maxSide: number): Promise<Blob> {
    const s = Math.min(1, maxSide / Math.max(this.w, this.h));
    const canvas = this.draw(0, 0, this.w, this.h, Math.round(this.w * s), Math.round(this.h * s));
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  }

  close(): void {
    this.bitmap.close();
  }
}
