import { hexToRgb } from '../../core/color';
import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const MODES: Record<string, number> = { color: 0, darken: 1, depth: 2 };

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.05, hardness: 0.3, flow: 0.6 },
  pass: {
    id: 'hair',
    fragment: FRAGMENT,
    prepare({ ctx }) {
      return { uLow: ctx.slot('healed'), uLowLod: Math.max(0, Math.log2(0.008 * ctx.longSide)) };
    },
    uniforms(params) {
      return {
        uMode: MODES[String(params.mode)] ?? 0,
        uColor: hexToRgb(String(params.color)),
        uAmount: pct(params, 'amount'),
      };
    },
  },
};

export default tool;
