import { hexToRgb } from '../../core/color';
import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.05, hardness: 0.1, flow: 0.8 },
  pass: {
    id: 'freckles',
    fragment: FRAGMENT,
    uniforms(params, { ctx }) {
      const long = Math.max(ctx.imageW, ctx.imageH);
      return {
        uDensity: pct(params, 'density'),
        uSize: 0.00055 + 0.0018 * pct(params, 'size'),
        uVariation: pct(params, 'variation'),
        uOpacity: pct(params, 'opacity'),
        uAspect: [ctx.imageW / long, ctx.imageH / long],
        uTint: hexToRgb(String(params.color)),
      };
    },
  },
};

export default tool;
