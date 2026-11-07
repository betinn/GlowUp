import { pct, type ToolModule } from '../types';
import FRAGMENT from './shader.glsl?raw';
import { controls, defaults } from './panel';

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.06, hardness: 0.2, flow: 0.6 },
  pass: {
    id: 'skintone',
    fragment: FRAGMENT,
    uniforms(params) {
      return {
        uHue: pct(params, 'hue') * 0.45,
        uSaturation: pct(params, 'saturation') * 0.7,
        uLightness: pct(params, 'lightness'),
      };
    },
  },
};

export default tool;
