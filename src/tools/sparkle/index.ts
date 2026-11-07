import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.011, hardness: 0.5, flow: 0.7 },
  pass: {
    id: 'sparkle',
    fragment: FRAGMENT,
    margin: (ctx) => 0.002 * ctx.longSide + 2,
    prepare({ ctx }) {
      return { uLow: ctx.slot('healed'), uLowLod: Math.max(0, Math.log2(0.006 * ctx.longSide)) };
    },
    uniforms(params, { ctx }) {
      return {
        uContrast: pct(params, 'contrast'),
        uSharp: pct(params, 'sharp'),
        uRadius: Math.max(1, 0.0009 * ctx.longSide),
      };
    },
  },
};

export default tool;
