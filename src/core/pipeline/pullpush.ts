import type { GLContext, Tex } from '../gl/context';
import { PULL_FRAG, PUSH_FRAG } from '../shaders/small';
import { shader } from './pipeline';

/**
 * Fills holes with a smooth membrane. Input holds premultiplied color with the weight in alpha.
 * Builds a pyramid of weighted averages, then pushes coarse values back into the unknown pixels.
 * Result is written to a new scratch texture, also premultiplied, that the caller releases.
 */
export function pullPush(glc: GLContext, input: Tex, format = glc.caps.work): Tex {
  const pull = glc.program(shader(PULL_FRAG));
  const push = glc.program(shader(PUSH_FRAG));

  const levels: Tex[] = [input];
  let w = input.w;
  let h = input.h;
  while (w > 2 || h > 2) {
    w = Math.max(1, Math.ceil(w / 2));
    h = Math.max(1, Math.ceil(h / 2));
    const next = glc.acquire(w, h, format);
    const prev = levels[levels.length - 1];
    glc.run(pull, next, { uInput: prev, uTexel: [1 / prev.w, 1 / prev.h] });
    levels.push(next);
  }

  let coarse = levels[levels.length - 1];
  for (let i = levels.length - 2; i >= 0; i--) {
    const fine = levels[i];
    const out = glc.acquire(fine.w, fine.h, format);
    glc.run(push, out, { uFine: fine, uCoarse: coarse });
    if (i < levels.length - 2) glc.release(coarse);
    coarse = out;
  }
  for (let i = 1; i < levels.length; i++) glc.release(levels[i]);
  return coarse;
}
