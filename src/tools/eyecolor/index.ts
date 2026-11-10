import { hexToRgb } from '../../core/color';
import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

/** Size of the blur that stands for the iris around a glint, as a share of the long side of the photo. */
const GLINT_SPAN = 0.006;

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.011, hardness: 0.55, flow: 0.8 },
  pass: {
    id: 'eyecolor',
    fragment: FRAGMENT,
    // The photo blurred to about the size of a glint, to tell a glint from the iris around it.
    prepare({ ctx }) {
      return { uLow: ctx.slot('healed'), uLowLod: Math.max(0, Math.log2(GLINT_SPAN * ctx.longSide)) };
    },
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
