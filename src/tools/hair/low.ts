import type { RenderContext } from '../../core/pipeline/context';

/** Brush of every hair tool: wide and soft, since the detector does the edge. */
export const HAIR_BRUSH = { size: 0.05, hardness: 0.3, flow: 0.6 };

/**
 * Mip level of the photo before any retouch that blurs it by `share` of the long side. The same share
 * on preview, zoom and export tiles, so what is seen is what is saved.
 */
export const lowLod = (ctx: RenderContext, share: number) => Math.max(0, Math.log2(share * ctx.longSide));
