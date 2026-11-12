/** Decodes the photos of a post at the size each use needs: small for the table, full for the files. */

/**
 * A photo no larger than `side` on its long side. Not every browser shrinks while decoding, so there is a second
 * way, which decodes whole and shrinks after.
 */
export async function decodeAt(blob: Blob, w: number, h: number, side: number): Promise<ImageBitmap> {
  const k = Math.min(1, side / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * k));
  const th = Math.max(1, Math.round(h * k));
  if (k < 1) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' });
    } catch {
      // The second way, below.
    }
  }
  const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  if (k >= 1 || (full.width === tw && full.height === th)) return full;
  try {
    const canvas = new OffscreenCanvas(tw, th);
    const c = canvas.getContext('2d')!;
    c.imageSmoothingQuality = 'high';
    c.drawImage(full, 0, 0, tw, th);
    return canvas.transferToImageBitmap();
  } finally {
    full.close();
  }
}
