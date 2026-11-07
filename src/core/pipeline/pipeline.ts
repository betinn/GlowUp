import { GLSL_HEADER, type GLContext, type Rect, type Tex, type Tex3D, type Uniforms } from '../gl/context';
import { LAYER_ORDER, type EditDoc, type LayerId } from '../doc';
import { imageToOutput, outputSize } from '../geometry';
import COLOR_GLSL from '../shaders/color.glsl?raw';
import DEVELOP_FRAG from '../shaders/develop.frag?raw';
import FINISH_FRAG from '../shaders/finish.frag?raw';
import { COPY_FRAG } from '../shaders/small';
import type { RenderContext } from './context';
import type { Healer, MaskProvider, PassEnv, ToolPass } from './types';

export const shader = (body: string) => `${GLSL_HEADER}${COLOR_GLSL}\n${body}`;

const TOOL_PRELUDE = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;
uniform sampler2D uMask;
uniform vec4 uRegion;
uniform vec2 uTexel;
vec2 imageUv() { return uRegion.xy + vUv * uRegion.zw; }
`;

const TOOL_MAIN = `
void main() {
  vec4 c = texture(uInput, vUv);
  float m = textureLod(uMask, imageUv(), 0.0).r;
#ifndef SPREADS
  if (m < 0.002) { outColor = c; return; }
#endif
  outColor = vec4(tool(c.rgb, m), c.a);
}
`;

export function toolShader(pass: ToolPass): string {
  const spreads = pass.spreads ? '#define SPREADS\n' : '';
  return shader(`${spreads}${TOOL_PRELUDE}${pass.fragment}${TOOL_MAIN}`);
}

export interface FieldSource {
  tex: Tex;
}

export class Pipeline {
  readonly tools = new Map<LayerId, ToolPass>();
  healer: Healer | null = null;
  field: FieldSource | null = null;
  lut: Tex3D;
  lutMix = 0;
  active: LayerId | null = null;

  constructor(
    private readonly glc: GLContext,
    private readonly masks: MaskProvider,
    private readonly emptyField: Tex,
  ) {
    const identity = new Float32Array(2 * 2 * 2 * 4);
    for (let i = 0; i < 8; i++) {
      identity.set([i & 1, (i >> 1) & 1, (i >> 2) & 1, 1], i * 4);
    }
    this.lut = glc.createLut(2, identity);
  }

  private stages(doc: EditDoc): LayerId[] {
    return LAYER_ORDER.filter((id) => {
      const layer = doc.layers[id];
      return layer?.enabled && layer.painted && this.tools.has(id) && this.masks.get(id);
    });
  }

  private runTool(ctx: RenderContext, doc: EditDoc, id: LayerId, input: Tex, output: Tex, rect: Rect | null) {
    const pass = this.tools.get(id)!;
    const mask = this.masks.get(id)!;
    const params = doc.layers[id]!.params;
    const env: PassEnv = { glc: this.glc, ctx, mask, params, maskRev: this.masks.rev(id), input };
    const extra = pass.prepare?.(env) ?? {};
    const values: Uniforms = {
      uInput: input,
      uMask: mask,
      uRegion: ctx.regionUv,
      uTexel: [1 / ctx.w, 1 / ctx.h],
      ...pass.uniforms(params, env),
      ...extra,
    };
    this.glc.run(this.glc.program(toolShader(pass)), output, values, rect);
  }

  /** Runs tools in order. With a rect, only that area is rewritten; `output` keeps the rest. */
  private chain(ctx: RenderContext, doc: EditDoc, ids: LayerId[], input: Tex, output: Tex, rect: Rect | null): Tex {
    if (ids.length === 0) return input;
    let src = input;
    ids.forEach((id, i) => {
      const last = i === ids.length - 1;
      const dst = last ? output : ctx.slot(i % 2 === 0 ? 'a' : 'b');
      const stageRect = rect ? inflate(rect, (ids.length - 1 - i) * 6, ctx) : null;
      this.runTool(ctx, doc, id, src, dst, stageRect);
      src = dst;
    });
    return output;
  }

  private buildHealed(ctx: RenderContext, doc: EditDoc): void {
    const healed = ctx.slot('healed');
    this.glc.run(this.glc.program(shader(COPY_FRAG)), healed, { uInput: ctx.source });
    if (doc.heals.length && this.healer) this.healer.apply(ctx, doc, healed);
    this.glc.generateMips(healed);
    ctx.clearCache();
  }

  /** Brings the context up to date with the document, redoing only what changed. */
  update(ctx: RenderContext, doc: EditDoc): void {
    const { dirty } = ctx;
    if (dirty.healed) {
      this.buildHealed(ctx, doc);
      dirty.healed = false;
    }
    const healed = ctx.slot('healed');

    const stages = this.stages(doc);
    const activeIndex = this.active ? stages.indexOf(this.active) : -1;
    const split = activeIndex >= 0 ? activeIndex : stages.length;
    const key = `${stages.join(',')}|${split}`;
    if (key !== ctx.stagesKey) {
      ctx.stagesKey = key;
      ctx.invalidate('prefix');
    }

    if (dirty.prefix) {
      const prefix = stages.slice(0, split);
      ctx.checkpointRef = this.chain(ctx, doc, prefix, healed, prefix.length ? ctx.slot('checkpoint') : healed, null);
      dirty.prefix = false;
      ctx.localRect = null;
      dirty.local = true;
    }

    let rect = ctx.localRect;
    if (dirty.local) {
      const suffix = stages.slice(split);
      if (rect) {
        const reach = Math.max(0, ...suffix.map((id) => this.tools.get(id)!.margin?.(ctx) ?? 0));
        rect = inflate(rect, Math.ceil(reach), ctx);
      }
      const input = ctx.checkpointRef!;
      ctx.retouchedRef = this.chain(ctx, doc, suffix, input, suffix.length ? ctx.slot('retouched') : input, rect);
      dirty.local = false;
      dirty.global = true;
    }
    ctx.localRect = null;

    if (dirty.global) {
      if (doc.hasField || doc.blur.mode !== 'off') rect = null;
      this.develop(ctx, doc, rect ? inflate(rect, 6, ctx) : null);
      dirty.global = false;
    }
  }

  private develop(ctx: RenderContext, doc: EditDoc, rect: Rect | null): void {
    const { glc } = this;
    const a = doc.adjust;
    const dev = ctx.slot('dev');
    const healed = ctx.slot('healed');
    const hasField = doc.hasField && !!this.field;
    glc.run(
      glc.program(shader(DEVELOP_FRAG)),
      dev,
      {
        uInput: ctx.retouchedRef!,
        uLow: healed,
        uField: hasField ? this.field!.tex : this.emptyField,
        uLut: this.lut,
        uRegion: ctx.regionUv,
        uTexel: [1 / ctx.w, 1 / ctx.h],
        uHasField: hasField,
        uExposure: a.exposure / 100,
        uContrast: a.contrast / 100,
        uHighlights: a.highlights / 100,
        uShadows: a.shadows / 100,
        uTemp: a.temperature / 100,
        uTint: a.tint / 100,
        uSaturation: a.saturation / 100,
        uVibrance: a.vibrance / 100,
        uSharpen: a.sharpen / 100,
        uSharpenRadius: Math.max(0.75, ctx.longSide / 2400),
        uLowLod: Math.max(0, Math.log2(ctx.longSide / 48)),
        uLutMix: doc.filter.id ? this.lutMix : 0,
        uLutSize: this.lut.size,
      },
      rect,
    );

    const b = doc.blur;
    const blurOn = b.mode !== 'off' && b.strength > 0;
    if (blurOn) glc.generateMips(dev);
    const out = outputSize(doc.crop);
    const maxBlurPx = (b.strength / 100) * 0.035 * ctx.longSide;
    const toOutput = imageToOutput(doc.crop, doc.width, doc.height);
    glc.run(
      glc.program(shader(FINISH_FRAG)),
      ctx.slot('final'),
      {
        uInput: dev,
        uRegion: ctx.regionUv,
        uToOutput: toOutput,
        uOutSize: [out.w, out.h],
        uBlurMode: !blurOn ? 0 : b.mode === 'radial' ? 1 : 2,
        uFocus: [b.cx, b.cy],
        uFocusRadius: b.focus,
        uFeather: Math.max(b.feather, 0.002),
        uAngle: (b.angle * Math.PI) / 180,
        uMaxLod: Math.log2(Math.max(maxBlurPx, 1)) + 0.6,
        uVignette: a.vignette / 100,
        uGrain: a.grain / 100,
        uGrainCells: 1500,
      },
      rect,
    );
  }
}

function inflate(r: Rect, by: number, ctx: RenderContext): Rect {
  const x = Math.max(0, r.x - by);
  const y = Math.max(0, r.y - by);
  return {
    x,
    y,
    w: Math.min(ctx.w, r.x + r.w + by) - x,
    h: Math.min(ctx.h, r.y + r.h + by) - y,
  };
}
