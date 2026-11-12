import { GLSL_HEADER, type GLContext, type Rect, type Tex, type Tex3D, type Uniforms } from '../gl/context';
import { COVER_SPAN, FILTER_MASK, LAYER_ORDER, type EditDoc, type LayerId } from '../doc';
import { imageToOutput, outputSize } from '../geometry';
import COLOR_GLSL from '../shaders/color.glsl?raw';
import DEVELOP_FRAG from '../shaders/develop.frag?raw';
import FINISH_FRAG from '../shaders/finish.frag?raw';
import LIGHT_FRAG from '../shaders/light.frag?raw';
import STICKER_FRAG from '../shaders/sticker.frag?raw';
import { COPY_FRAG, REGION_FRAG } from '../shaders/small';
import { lightById } from '../light/lights';
import { lightUniforms, readsStrands } from '../light/resolve';
import type { SceneStats } from '../light/types';
import type { RenderContext } from './context';
import type { Healer, MaskProvider, PassEnv, ToolPass } from './types';

/** Long side of the shared low-pass image, in pixels. */
const LOW_SIDE = 96;

/** Softest edge of a masked filter, as a share of the size of the masked area. */
const MAX_FEATHER = 0.3;

/** Mip level that blurs a mask by the requested softness. Level zero means no extra blur. */
export function featherLod(feather: number, reach: number, maskSide: number): number {
  return Math.log2(Math.max((feather / 100) * MAX_FEATHER * reach * maskSide, 1));
}

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
  /** The brush alone. */
  readonly brushTex?: Tex | null;
  /** The share of the field that shapes the lips. */
  readonly lipTex?: Tex | null;
  /** The share of the field that moves a head alone. */
  readonly headTex?: Tex | null;
}

/** The mattes of the photo and the plates behind them, in image UV, for warps in layers. */
export interface Layers {
  person: Tex;
  head: Tex;
  /** The opening of the mouths. Null when every mouth is closed. */
  mouth: Tex | null;
  /** How far each point is from what covers the body. Null in a project saved before there was one: the body then stays. */
  cover: Tex | null;
  /** Which way that is, as the slope of the distance. See `coverWay` in `core/face/person.ts`. */
  coverWay: Tex | null;
  /** The photo with nobody in it, and with no head in it. */
  plateBack: Tex;
  plateHead: Tex;
}

/** One sticker to draw on a context: its art, where it is, and the box it covers in pixels of the context. */
export interface StickerDraw {
  art: Tex;
  /** The middle, in image UV. */
  center: readonly [number, number];
  /** Take an offset from the middle, in image UV, to the UV of the art. */
  rowX: readonly [number, number];
  rowY: readonly [number, number];
  rect: Rect;
}

/**
 * Brincar, as the develop stage reads it: a warp of its own, which goes before the realistic one, and the
 * stickers, which go over the developed photo. Kept apart from `field`, so nothing playful ever reaches it.
 */
export interface FunLayer {
  /** The whole playful warp in red and green, while it moves something, and the share of it that moves a head alone in blue and alpha. */
  readonly tex: Tex | null;
  /** There is a share that moves a head alone. */
  readonly alone: boolean;
  /** The stickers on a context, in the order they were put on. */
  draws(ctx: RenderContext): StickerDraw[];
}

/** The scene of the photo, as Luzes reads it: its two textures and what was measured with it. */
export interface SceneLayer {
  /** The matte of the person, their skin, their hair and the shade of the skin. */
  tex: Tex;
  /** The depth on each side of the edge of the person, and the matte blurred a little and blurred wide. */
  field: Tex;
  stats: SceneStats;
}

export class Pipeline {
  readonly tools = new Map<LayerId, ToolPass>();
  healer: Healer | null = null;
  field: FieldSource | null = null;
  /** Brincar, once its menu or a project with it loaded. */
  fun: FunLayer | null = null;
  /** Set while the photo has its mattes: warps then move each layer alone. */
  lock: Layers | null = null;
  /** Set once the photo has its scene: a light of Luzes then has where to fall. */
  scene: SceneLayer | null = null;
  lut: Tex3D;
  lutMix = 0;
  /** What the current filter adds to the last stage, on the scales of the Ajustes panel. */
  filterGrain = 0;
  filterVignette = 0;
  active: LayerId | null = null;
  /** Tiny low-pass of the whole photo, shared by every context so tiles agree on tone masks. */
  private globalLow: Tex | null = null;
  /** Revision of the filter mask whose mip levels are up to date. */
  private filterMipsRev = -1;

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
    if (ctx.region.w === ctx.imageW && ctx.region.h === ctx.imageH) this.refreshGlobalLow(ctx, healed);
  }

  /** Call after the healed base of a whole-image context changes. */
  refreshGlobalLow(ctx: RenderContext, healed: Tex): void {
    const { glc } = this;
    const k = LOW_SIDE / Math.max(ctx.w, ctx.h);
    const w = Math.max(2, Math.round(ctx.w * k));
    const h = Math.max(2, Math.round(ctx.h * k));
    if (this.globalLow && (this.globalLow.w !== w || this.globalLow.h !== h)) {
      glc.destroyTex(this.globalLow);
      this.globalLow = null;
    }
    this.globalLow ??= glc.createTex(w, h, glc.caps.work);
    glc.run(glc.program(shader(REGION_FRAG)), this.globalLow, {
      uInput: healed,
      uSrc: [0, 0, 1, 1],
      uLod: Math.log2(Math.max(ctx.w, ctx.h) / LOW_SIDE),
    });
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
      // A soft mask reaches past the brush, so a partial update would leave a seam.
      if (doc.hasField || doc.blur.mode !== 'off' || this.filterArea(doc)?.lod || (this.fun && (this.fun.tex || doc.fun?.stickers?.length)) || this.lightOn(doc)) rect = null;
      this.develop(ctx, doc, rect ? inflate(rect, 6, ctx) : null);
      dirty.global = false;
    }
  }

  /**
   * The current frame without the filter, for the before side of the filters panel. Reuses the
   * develop buffer: a later partial update only reads what it rewrites.
   */
  renderUnfiltered(ctx: RenderContext, doc: EditDoc): void {
    this.develop(ctx, doc, null, ctx.slot('unfiltered'), 0);
  }

  /** Mask of a filter limited to part of the photo, ready to sample. */
  private filterArea(doc: EditDoc): { mask: Tex; lod: number } | null {
    const mask = doc.filter.masked ? this.masks.get(FILTER_MASK) : null;
    if (!mask) return null;
    const lod = featherLod(doc.filter.feather ?? 0, doc.filter.reach ?? 0, Math.max(mask.w, mask.h));
    const rev = this.masks.rev(FILTER_MASK);
    if (lod > 0 && rev !== this.filterMipsRev) {
      this.glc.generateMips(mask);
      this.filterMipsRev = rev;
    }
    return { mask, lod };
  }

  /** The light of Luzes on the document, when the photo has a scene for it. */
  private lightOn(doc: EditDoc) {
    const light = doc.light && doc.light.intensity > 0 && this.scene ? lightById(doc.light.id) : undefined;
    return light ? { recipe: light.recipe, scene: this.scene!, state: doc.light! } : null;
  }

  private develop(ctx: RenderContext, doc: EditDoc, rect: Rect | null, target = ctx.slot('final'), lutMix = doc.filter.id ? this.lutMix : 0): void {
    const { glc } = this;
    const a = doc.adjust;
    let dev = ctx.slot('dev');
    const hasField = doc.hasField && !!this.field;
    const funTex = this.fun?.tex ?? null;
    const lock = hasField || funTex ? this.lock : null;
    const area = this.filterArea(doc);
    glc.run(
      glc.program(shader(DEVELOP_FRAG)),
      dev,
      {
        uInput: ctx.retouchedRef!,
        uLow: this.globalLow ?? ctx.slot('healed'),
        uField: hasField ? this.field!.tex : this.emptyField,
        uLut: this.lut,
        uRegion: ctx.regionUv,
        uTexel: [1 / ctx.w, 1 / ctx.h],
        uHasField: hasField,
        uHasFun: !!funTex,
        uFun: funTex ?? this.emptyField,
        uFunAlone: !!funTex && !!this.fun?.alone,
        uLayered: !!lock,
        uPerson: lock?.person ?? this.emptyField,
        uHead: lock?.head ?? this.emptyField,
        uMouth: lock?.mouth ?? this.emptyField,
        uPlateBack: lock?.plateBack ?? this.emptyField,
        uPlateHead: lock?.plateHead ?? this.emptyField,
        uBrushField: (lock && this.field?.brushTex) || this.emptyField,
        uLipField: (lock?.mouth && this.field?.lipTex) || this.emptyField,
        uHeadField: (lock && this.field?.headTex) || this.emptyField,
        uHeadAlone: !!(lock && this.field?.headTex),
        uCover: lock?.cover ?? this.emptyField,
        uCoverWay: lock?.coverWay ?? this.emptyField,
        uFollows: !!(lock?.cover && lock.coverWay),
        uCoverSpan: COVER_SPAN * Math.max(doc.width, doc.height),
        uBrushFree: !!doc.unlocked,
        uHasLips: !!(lock?.mouth && this.field?.lipTex),
        uPixels: [doc.width, doc.height],
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
        // A filter limited to a mask that was never painted has nowhere to show.
        uLutMix: doc.filter.masked && !area ? 0 : lutMix,
        uLutSize: this.lut.size,
        uFilterMask: area?.mask ?? this.emptyField,
        uFilterMasked: !!area,
        uFilterLod: area?.lod ?? 0,
      },
      rect,
    );
    const out = outputSize(doc.crop);
    const toOutput = imageToOutput(doc.crop, doc.width, doc.height);
    // The light falls on the developed photo and under the stickers, which are neither person nor background.
    const light = this.lightOn(doc);
    if (light) {
      if (readsStrands(light.recipe)) glc.generateMips(dev);
      const lit = ctx.slot('lit');
      glc.run(
        glc.program(shader(LIGHT_FRAG)),
        lit,
        {
          uInput: dev,
          uScene: light.scene.tex,
          uField: light.scene.field,
          uRegion: ctx.regionUv,
          uPixels: [doc.width, doc.height],
          uToOutput: toOutput,
          uOutSize: [out.w, out.h],
          // The screen and the file read strands at the same scale of the photo.
          uStrandLod: Math.max(0, Math.log2(ctx.longSide / 128)),
          ...lightUniforms(light.recipe, light.scene.stats, doc, light.state.intensity),
        },
        rect,
      );
      dev = lit;
    }
    if (this.fun && doc.fun?.stickers?.length) this.drawStickers(ctx, dev);

    const b = doc.blur;
    const blurOn = b.mode !== 'off' && b.strength > 0;
    if (blurOn) glc.generateMips(dev);
    const maxBlurPx = (b.strength / 100) * 0.035 * ctx.longSide;
    glc.run(
      glc.program(shader(FINISH_FRAG)),
      target,
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
        uFilterVignette: this.filterVignette / 100,
        uFilterGrain: this.filterGrain / 100,
      },
      rect,
    );
  }

  /** Draws the stickers over the developed photo, each over its own box. */
  private drawStickers(ctx: RenderContext, dev: Tex): void {
    const draws = this.fun!.draws(ctx);
    if (!draws.length) return;
    const { glc } = this;
    const below = ctx.slot('stick');
    glc.copy(dev, below);
    const program = glc.program(shader(STICKER_FRAG));
    draws.forEach((d, i) => {
      glc.run(program, dev, { uInput: below, uArt: d.art, uRegion: ctx.regionUv, uCenter: d.center, uRowX: d.rowX, uRowY: d.rowY }, d.rect);
      if (i < draws.length - 1) glc.copy(dev, below, d.rect);
    });
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
