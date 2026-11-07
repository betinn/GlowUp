import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.03, hardness: 0, flow: 0.35 },
  pass: {
    id: 'highlight',
    fragment: FRAGMENT,
    spreads: true,
    margin: (ctx) => 0.05 * ctx.longSide,
    prepare({ glc, mask }) {
      glc.generateMips(mask);
    },
    uniforms(params, { mask }) {
      return {
        uIntensity: pct(params, 'intensity'),
        uGlow: pct(params, 'glow'),
        uSoftLod: Math.log2(Math.max(0.004 * Math.max(mask.w, mask.h), 1)),
        uGlowLod: Math.log2(Math.max(0.016 * Math.max(mask.w, mask.h), 1)),
      };
    },
  },
};

export default tool;
