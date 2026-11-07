import { shader } from '../../core/pipeline/pipeline';
import { pullPush } from '../../core/pipeline/pullpush';
import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

/** Keeps pixels outside the mask, ignoring dark ones (lashes, brows) as references. */
const SEED_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImage;
uniform sampler2D uMask;
uniform vec4 uRegion;
uniform float uLod;
void main() {
  vec3 c = textureLod(uImage, vUv, uLod).rgb;
  float m = textureLod(uMask, uRegion.xy + vUv * uRegion.zw, 0.0).r;
  float w = (1.0 - smoothstep(0.01, 0.2, m)) * (0.04 + 0.96 * smoothstep(0.08, 0.32, luma(c)));
  outColor = vec4(c * w, w);
}
`;

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.022, hardness: 0.15, flow: 0.55 },
  pass: {
    id: 'undereye',
    fragment: FRAGMENT,
    prepare({ glc, ctx, mask, maskRev }) {
      const lod = Math.max(0, Math.round(Math.log2(ctx.longSide / 320)));
      const f = 2 ** lod;
      const lw = Math.max(4, Math.ceil(ctx.w / f));
      const lh = Math.max(4, Math.ceil(ctx.h / f));
      const [fill] = ctx.cached('undereye', String(maskRev), () => {
        const seed = glc.acquire(lw, lh, glc.caps.work);
        glc.run(glc.program(shader(SEED_FRAG)), seed, {
          uImage: ctx.slot('healed'),
          uMask: mask,
          uRegion: ctx.regionUv,
          uLod: lod,
        });
        const result = pullPush(glc, seed);
        glc.release(seed);
        return [result];
      });
      return { uLow: ctx.slot('healed'), uFill: fill, uLowLod: lod };
    },
    uniforms(params) {
      return { uLight: pct(params, 'light'), uTone: pct(params, 'tone') };
    },
  },
};

export default tool;
