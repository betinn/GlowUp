import { HAIR_BRUSH } from '../hair/low';
import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const tool: ToolModule = {
  defaults,
  controls,
  brush: HAIR_BRUSH,
  pass: {
    id: 'hairdark',
    fragment: FRAGMENT,
    uniforms: (params) => ({ uAmount: pct(params, 'amount') }),
  },
};

export default tool;
