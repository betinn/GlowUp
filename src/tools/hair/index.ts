import { hexToRgb } from '../../core/color';
import { pct, type ToolModule } from '../types';
import { HAIR_BRUSH, lowLod } from './low';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const MODES: Record<string, number> = { color: 0, darken: 1, depth: 2 };

const tool: ToolModule = {
  defaults,
  controls,
  brush: HAIR_BRUSH,
  pass: {
    id: 'hair',
    fragment: FRAGMENT,
    prepare({ ctx }) {
      return { uLow: ctx.slot('healed'), uLowLod: lowLod(ctx, 0.008) };
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
