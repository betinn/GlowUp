import { hexToRgb } from '../../core/color';
import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.011, hardness: 0.55, flow: 0.8 },
  pass: {
    id: 'eyecolor',
    fragment: FRAGMENT,
    uniforms(params) {
      return {
        uColor: hexToRgb(String(params.color)),
        uAmount: pct(params, 'amount'),
        uLift: pct(params, 'lift'),
      };
    },
  },
};

export default tool;
