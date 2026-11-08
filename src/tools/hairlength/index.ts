import { HAIR_BRUSH } from '../hair/low';
import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import { lengthReach } from './reach';
import FRAGMENT from './shader.glsl?raw';

const tool: ToolModule = {
  defaults,
  controls,
  brush: HAIR_BRUSH,
  pass: {
    id: 'hairlength',
    fragment: FRAGMENT,
    // The longer hair lands below the mask, so the pass runs everywhere and a stroke redoes the frame.
    spreads: true,
    margin: (ctx) => ctx.longSide,
    uniforms(params, { ctx }) {
      const { grow, band } = lengthReach(params);
      return { uGrow: grow, uBand: band, uTips: pct(params, 'tips'), uImage: [ctx.imageW, ctx.imageH] };
    },
  },
};

export default tool;
