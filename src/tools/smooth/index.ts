import type { GLContext, Tex } from '../../core/gl/context';
import type { RenderContext } from '../../core/pipeline/context';
import { shader } from '../../core/pipeline/pipeline';
import { BLUR_FRAG, REGION_FRAG } from '../../core/shaders/small';
import { pct, type ToolModule } from '../types';
import { controls, defaults } from './panel';
import FRAGMENT from './shader.glsl?raw';

const SQUARE_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;
void main() { vec4 c = texture(uInput, vUv); outColor = vec4(c.rgb * c.rgb, 1.0); }
`;

const COEF_A_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uMean;
uniform sampler2D uMeanSq;
uniform float uEps;
void main() {
  vec3 mean = texture(uMean, vUv).rgb;
  vec3 variance = max(texture(uMeanSq, vUv).rgb - mean * mean, 0.0);
  outColor = vec4(variance / (variance + uEps), 1.0);
}
`;

const COEF_B_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uMean;
uniform sampler2D uA;
void main() {
  vec3 mean = texture(uMean, vUv).rgb;
  outColor = vec4(mean * (1.0 - texture(uA, vUv).rgb), 1.0);
}
`;

/** Filter radius (fraction of the long side) and edge threshold for each mode. */
const MODES: Record<string, { radius: number; eps: number }> = {
  light: { radius: 0.006, eps: 0.0012 },
  strong: { radius: 0.014, eps: 0.0065 },
};

function gaussian(glc: GLContext, src: Tex, radius: number): Tex {
  const blur = glc.program(shader(BLUR_FRAG));
  const tmp = glc.acquire(src.w, src.h, src.format);
  const out = glc.acquire(src.w, src.h, src.format);
  const step = radius / 4;
  glc.run(blur, tmp, { uInput: src, uStep: [step / src.w, 0] });
  glc.run(blur, out, { uInput: tmp, uStep: [0, step / src.h] });
  glc.release(tmp);
  return out;
}

/** Fast guided filter at reduced resolution. Returns the linear coefficients A and B. */
function buildGuide(glc: GLContext, ctx: RenderContext, mode: { radius: number; eps: number }): Tex[] {
  const radius = mode.radius * ctx.longSide;
  const lod = Math.max(0, Math.floor(Math.log2(Math.max(radius / 5, 1))));
  const f = 2 ** lod;
  const lw = Math.max(1, Math.ceil(ctx.w / f));
  const lh = Math.max(1, Math.ceil(ctx.h / f));
  const lowRadius = radius / f;
  const format = glc.caps.work;

  const image = glc.acquire(lw, lh, format);
  glc.run(glc.program(shader(REGION_FRAG)), image, { uInput: ctx.slot('healed'), uSrc: [0, 0, 1, 1], uLod: lod });
  const squared = glc.acquire(lw, lh, format);
  glc.run(glc.program(shader(SQUARE_FRAG)), squared, { uInput: image });

  const mean = gaussian(glc, image, lowRadius);
  const meanSq = gaussian(glc, squared, lowRadius);
  glc.release(image);
  glc.release(squared);

  const a = glc.acquire(lw, lh, format);
  glc.run(glc.program(shader(COEF_A_FRAG)), a, { uMean: mean, uMeanSq: meanSq, uEps: mode.eps });
  const b = glc.acquire(lw, lh, format);
  glc.run(glc.program(shader(COEF_B_FRAG)), b, { uMean: mean, uA: a });
  glc.release(mean);
  glc.release(meanSq);

  const meanA = gaussian(glc, a, lowRadius);
  const meanB = gaussian(glc, b, lowRadius);
  glc.release(a);
  glc.release(b);
  return [meanA, meanB];
}

const tool: ToolModule = {
  defaults,
  controls,
  brush: { size: 0.05, hardness: 0.2, flow: 0.6 },
  pass: {
    id: 'smooth',
    fragment: FRAGMENT,
    prepare({ glc, ctx, params }) {
      const key = String(params.mode);
      const mode = MODES[key] ?? MODES.light;
      const [a, b] = ctx.cached('smooth', key, () => buildGuide(glc, ctx, mode));
      return { uGuideA: a, uGuideB: b };
    },
    uniforms(params, { ctx }) {
      return {
        uStrength: pct(params, 'strength'),
        uTexture: pct(params, 'texture'),
        uDetailRadius: Math.max(0.8, 0.00065 * ctx.longSide),
      };
    },
  },
};

export default tool;
