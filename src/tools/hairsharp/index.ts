import { HAIR_BRUSH, lowLod } from '../hair/low';
import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const tool: ToolModule = {
  defaults,
  controls,
  brush: HAIR_BRUSH,
  pass: {
    id: 'hairsharp',
    fragment: FRAGMENT,
    prepare({ ctx }) {
      return { uLow: ctx.slot('healed'), uLowLod: lowLod(ctx, 0.0012) };
    },
    uniforms: (params) => ({ uAmount: pct(params, 'amount') }),
  },
};

export default tool;
