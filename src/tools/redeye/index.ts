import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.012, hardness: 0.6, flow: 1 },
  pass: {
    id: 'redeye',
    fragment: FRAGMENT,
    uniforms(params) {
      return { uStrength: pct(params, 'strength'), uDarken: pct(params, 'darken') };
    },
  },
};

export default tool;
