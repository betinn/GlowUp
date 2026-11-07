/**
 * Healing brush. Each operation is resolution independent and is replayed by the pipeline:
 *  1. rasterize the stroke as a soft hole;
 *  2. fill the hole with a smooth membrane from the surroundings (pull-push, close to Poisson);
 *  3. add the fine texture of a nearby patch, chosen by `pickOffset`.
 * Low frequencies come from the border of the hole and detail comes from real skin,
 * so there is no color seam and no smooth patch.
 */

import type { HealController } from '../../core/engine';
import type { GLContext, Rect, Tex } from '../../core/gl/context';
import type { EditDoc, HealOp } from '../../core/doc';
import type { RenderContext } from '../../core/pipeline/context';
import { shader } from '../../core/pipeline/pipeline';
import { pullPush } from '../../core/pipeline/pullpush';
import { BLUR_FRAG, DAB_FRAG, REGION_FRAG } from '../../core/shaders/small';
import { findBlemish, pickOffset, type Patch } from './detect';

const SEED_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImage;
uniform sampler2D uHole;
uniform vec4 uRoi;
void main() {
  vec3 c = texture(uImage, uRoi.xy + vUv * uRoi.zw).rgb;
  float w = 1.0 - smoothstep(0.01, 0.2, texture(uHole, vUv).r);
  outColor = vec4(c * w, w);
}
`;

const BLEND_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImage;
uniform sampler2D uFill;
uniform sampler2D uPatch;
uniform sampler2D uPatchLow;
uniform sampler2D uHole;
uniform vec4 uRoi;
void main() {
  vec3 base = texture(uImage, uRoi.xy + vUv * uRoi.zw).rgb;
  vec4 f = texture(uFill, vUv);
  vec3 membrane = f.rgb / max(f.a, 1e-3);
  vec3 detail = texture(uPatch, vUv).rgb - texture(uPatchLow, vUv).rgb;
  float h = texture(uHole, vUv).r;
  outColor = vec4(mix(base, membrane + detail, h), 1.0);
}
`;

const PLACE_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;
uniform vec4 uRoi;
void main() { outColor = texture(uInput, (vUv - uRoi.xy) / uRoi.zw); }
`;

const roundUp = (v: number) => Math.ceil(v / 32) * 32;

/** Maps image UV to context pixels. */
function toContext(ctx: RenderContext, u: number, v: number): [number, number] {
  const r = ctx.region;
  return [(u * ctx.imageW - r.x) * r.scale, (v * ctx.imageH - r.y) * r.scale];
}

function applyOp(glc: GLContext, ctx: RenderContext, op: HealOp, target: Tex): Rect | null {
  const { gl } = glc;
  const long = ctx.longSide;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let maxR = 0;
  const dabs = op.dabs.map((d) => {
    const [x, y] = toContext(ctx, d.u, d.v);
    const r = Math.max(d.r * long, 0.75);
    maxR = Math.max(maxR, r);
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
    return { x, y, r };
  });
  const pad = Math.ceil(maxR * 2.5 + 8);
  const rx = Math.max(0, Math.floor(x0 - pad));
  const ry = Math.max(0, Math.floor(y0 - pad));
  const rw = Math.min(ctx.w, Math.ceil(x1 + pad)) - rx;
  const rh = Math.min(ctx.h, Math.ceil(y1 + pad)) - ry;
  if (rw <= 0 || rh <= 0) return null;

  // Pooled scratch textures come in rounded sizes; the ROI covers the rounded size too.
  const tw = roundUp(rw);
  const th = roundUp(rh);
  const format = glc.caps.work;
  const roi = [rx / ctx.w, ry / ctx.h, tw / ctx.w, th / ctx.h];

  const hole = glc.acquire(tw, th, format);
  glc.clear(hole);
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.MAX);
  const dab = glc.program(shader(DAB_FRAG));
  for (const d of dabs) {
    const r = d.r + 1;
    const lx = d.x - rx;
    const ly = d.y - ry;
    const sx = Math.max(0, Math.floor(lx - r));
    const sy = Math.max(0, Math.floor(ly - r));
    glc.run(
      dab,
      hole,
      { uDab: [lx, ly, d.r], uHardness: op.hardness, uFlow: 1 },
      { x: sx, y: sy, w: Math.ceil(2 * r) + 1, h: Math.ceil(2 * r) + 1 },
    );
  }
  gl.blendEquation(gl.FUNC_ADD);
  gl.disable(gl.BLEND);

  const seed = glc.acquire(tw, th, format);
  glc.run(glc.program(shader(SEED_FRAG)), seed, { uImage: target, uHole: hole, uRoi: roi });
  const fill = pullPush(glc, seed);
  glc.release(seed);

  // Texture source: the same window shifted by the chosen offset.
  const patch = glc.acquire(tw, th, format);
  const ou = (op.du * ctx.imageW * ctx.region.scale) / ctx.w;
  const ov = (op.dv * ctx.imageH * ctx.region.scale) / ctx.h;
  glc.run(glc.program(shader(REGION_FRAG)), patch, {
    uInput: target,
    uSrc: [roi[0] + ou, roi[1] + ov, roi[2], roi[3]],
    uLod: 0,
  });
  const tmp = glc.acquire(tw, th, format);
  const low = glc.acquire(tw, th, format);
  const blur = glc.program(shader(BLUR_FRAG));
  const step = Math.max(0.75, maxR * 0.22);
  glc.run(blur, tmp, { uInput: patch, uStep: [step / tw, 0] });
  glc.run(blur, low, { uInput: tmp, uStep: [0, step / th] });

  glc.run(glc.program(shader(BLEND_FRAG)), tmp, {
    uImage: target,
    uFill: fill,
    uPatch: patch,
    uPatchLow: low,
    uHole: hole,
    uRoi: roi,
  });
  const rect = { x: rx, y: ry, w: rw, h: rh };
  glc.run(glc.program(shader(PLACE_FRAG)), target, { uInput: tmp, uRoi: roi }, rect);

  for (const t of [hole, fill, patch, tmp, low]) glc.release(t);
  return rect;
}

/** Reads part of the healed image as a small RGBA patch. */
async function readPatch(glc: GLContext, ctx: RenderContext, cu: number, cv: number, halfPx: number, size: number): Promise<Patch> {
  const healed = ctx.slot('healed');
  const [cx, cy] = toContext(ctx, cu, cv);
  const target = glc.acquire(size, size, 'rgba8');
  const lod = Math.max(0, Math.log2((halfPx * 2) / size));
  glc.run(glc.program(shader(REGION_FRAG)), target, {
    uInput: healed,
    uSrc: [(cx - halfPx) / ctx.w, (cy - halfPx) / ctx.h, (halfPx * 2) / ctx.w, (halfPx * 2) / ctx.h],
    uLod: lod,
  });
  const { data } = await glc.readAsync(target, { x: 0, y: 0, w: size, h: size });
  glc.release(target);
  return { data, w: size, h: size };
}

let nextId = 1;

export function createHeal(glc: GLContext): HealController {
  return {
    healer: {
      apply(ctx: RenderContext, doc: EditDoc, target: Tex) {
        for (const op of doc.heals) applyOp(glc, ctx, op, target);
      },
      applyLast(ctx: RenderContext, doc: EditDoc, target: Tex) {
        const op = doc.heals.at(-1);
        return op ? applyOp(glc, ctx, op, target) : null;
      },
    },

    async commit(ctx, dabs, hardness, tap) {
      const long = ctx.longSide;
      let list = dabs;
      let edge = hardness;

      if (tap) {
        // One touch: look for the blemish under the finger and fit the spot to it.
        const first = dabs[0];
        const brushPx = first.r * long;
        const half = Math.max(brushPx * 2.6, 14);
        const size = 96;
        const patch = await readPatch(glc, ctx, first.u, first.v, half, size);
        const toPatch = size / (half * 2);
        const spot = findBlemish(patch, brushPx * toPatch * 1.1);
        if (spot) {
          edge = Math.min(hardness, 0.3);
          const px = (spot.x - size / 2 + 0.5) / toPatch;
          const py = (spot.y - size / 2 + 0.5) / toPatch;
          const scale = ctx.region.scale;
          list = [
            {
              u: first.u + px / scale / ctx.imageW,
              v: first.v + py / scale / ctx.imageH,
              r: Math.max(spot.r / toPatch, 2) / long,
            },
          ];
        }
      }

      // Thin the stroke: a dab every quarter radius is enough to describe the hole.
      const kept: HealOp['dabs'] = [];
      for (const d of list) {
        const prev = kept.at(-1);
        const px = prev ? Math.hypot((d.u - prev.u) * ctx.imageW, (d.v - prev.v) * ctx.imageH) / Math.max(ctx.imageW, ctx.imageH) : Infinity;
        if (!prev || px >= d.r * 0.25) kept.push(d);
      }

      // Bounds of the hole, then look around it for a calm patch of texture.
      let minU = Infinity;
      let minV = Infinity;
      let maxU = -Infinity;
      let maxV = -Infinity;
      for (const d of kept) {
        const ru = (d.r * Math.max(ctx.imageW, ctx.imageH)) / ctx.imageW;
        const rv = (d.r * Math.max(ctx.imageW, ctx.imageH)) / ctx.imageH;
        minU = Math.min(minU, d.u - ru);
        maxU = Math.max(maxU, d.u + ru);
        minV = Math.min(minV, d.v - rv);
        maxV = Math.max(maxV, d.v + rv);
      }
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const scale = ctx.region.scale;
      const radiusPx = (Math.max((maxU - minU) * ctx.imageW, (maxV - minV) * ctx.imageH) / 2) * scale;
      const half = Math.max(radiusPx * 4.6, 24);
      const size = 128;
      const patch = await readPatch(glc, ctx, cu, cv, half, size);
      const toPatch = size / (half * 2);
      const offset = pickOffset(patch, size / 2, size / 2, Math.max(radiusPx * toPatch, 2));
      return {
        id: nextId++,
        dabs: kept,
        hardness: edge,
        du: offset.dx / toPatch / scale / ctx.imageW,
        dv: offset.dy / toPatch / scale / ctx.imageH,
      };
    },
  };
}

export const defaults = { size: 0.012, hardness: 0.55, flow: 1 };
