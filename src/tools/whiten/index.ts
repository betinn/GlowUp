import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.014, hardness: 0.5, flow: 0.8 },
  pass: {
    id: 'whiten',
    fragment: FRAGMENT,
    uniforms(params) {
      return { uWhiten: pct(params, 'whiten'), uBright: pct(params, 'bright') };
    },
  },
};

export default tool;
