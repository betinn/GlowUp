import { hexToRgb } from '../../core/color';
import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

/** What each kind has: how much of the tiny, medium and large layers, their size, how they gather, how deep. */
const KINDS: Record<string, { layers: [number, number, number]; size: number; clump: number; deep: number }> = {
  fine: { layers: [0.9, 0.3, 0], size: 0.8, clump: 0.45, deep: 0.85 },
  natural: { layers: [0.65, 0.55, 0.22], size: 1, clump: 0.7, deep: 1 },
  bold: { layers: [0.2, 0.45, 0.6], size: 1.3, clump: 0.85, deep: 1.25 },
};

/** Share of the long side a face takes, for a photo where no face was found. */
const NO_FACE = 0.5;

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.05, hardness: 0.1, flow: 0.8 },
  pass: {
    id: 'freckles',
    fragment: FRAGMENT,
    uniforms(params, { ctx }) {
      const long = Math.max(ctx.imageW, ctx.imageH);
      const kind = KINDS[String(params.kind)] ?? KINDS.natural;
      // Freckles have a size on the skin, so they follow the size of the face, not of the photo.
      const face = Number(params.face) || NO_FACE;
      return {
        uAmount: pct(params, 'density'),
        uSize: face * (0.0014 + 0.0046 * pct(params, 'size')) * kind.size,
        uVariation: pct(params, 'variation'),
        uOpacity: pct(params, 'opacity'),
        uAspect: [ctx.imageW / long, ctx.imageH / long],
        uTint: hexToRgb(String(params.color)),
        uLayers: kind.layers,
        uClump: kind.clump,
        uDeep: kind.deep,
      };
    },
  },
};

export default tool;
