import { hexToRgb } from '../../core/color';
import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const tool: ToolModule = {
  defaults,
  controls,
  // One pass of the brush is the smoke, a second one the line: see the shader.
  brush: { size: 0.006, hardness: 0.6, flow: 0.5, opacity: 0.5 },
  pass: {
    id: 'foxeye',
    fragment: FRAGMENT,
    uniforms(params) {
      return {
        uColor: hexToRgb(String(params.color)),
        uShade: hexToRgb(String(params.shade)),
        uOpacity: pct(params, 'opacity'),
        uSmoke: pct(params, 'smoke'),
      };
    },
  },
};

export default tool;
