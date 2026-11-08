/**
 * The editor core. Owns the GL context, document, masks, history and render loop.
 * The UI talks to it through plain methods and listens to `onChange`.
 */

import { GLContext, type Tex } from './gl/context';
import { DEFAULT_BRUSH, StrokeInterpolator, type BrushSettings, type Dab } from './brush';
import { clone, createDoc, DEFAULT_ADJUST, DEFAULT_BLUR, FILTER_MASK, type Adjustments, type BlurSettings, type EditDoc, type FilterState, type HealOp, type LayerId, type ParamValue } from './doc';
import { applyMat3, defaultCrop, imageToOutput, outputSize, outputToImage, rotatedBounds, type Crop } from './geometry';
import { decodeTile, encodeTile } from './history/codec';
import { History, type HistoryEntry } from './history/history';
import { MaskStore, type MaskTile } from './masks';
import { Pipeline, shader } from './pipeline/pipeline';
import { RenderContext } from './pipeline/context';
import type { ToolPass } from './pipeline/types';
import { SourceImage } from './source';
import { blendViews, clampView, fitView, outputToScreen, panBy, screenToOutput, viewScale, zoomAt, type Size, type ViewState, type Viewport } from './view';
import VIEW_FRAG from './shaders/view.frag?raw';

/** Mask key of the healing brush. It is a scratch mask and never reaches the render chain. */
export const HEAL_MASK = 'heal' as unknown as LayerId;

export type ToolMode = 'none' | 'mask' | 'heal' | 'liquify';

/** Edge of a heal placed by the automatic mode, as the hardness of the brush: soft, as for a touch. */
const AUTO_HEAL_EDGE = 0.3;

/** How long the light over the reach of the brush lasts, in milliseconds. */
export const REVEAL_MS = 1100;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * What a reset puts back to the original. Tools lose their mask and go back to their default settings,
 * as if never opened.
 */
export interface ResetScope {
  layers: readonly LayerId[];
  heals?: boolean;
  field?: boolean;
  adjust?: boolean;
  /** The filter, its area and the softness of the area. */
  filter?: boolean;
  blur?: boolean;
  crop?: boolean;
}

/** What the before side of the comparison shows. */
export type CompareBase = 'original' | 'unfiltered';

/** What the liquify module provides once loaded. */
export interface FieldController {
  tex: Tex;
  lookup(u: number, v: number): [number, number];
  begin(mode: string, radius: number, strength: number): void;
  stroke(u: number, v: number): void;
  end(): HistoryEntry | null;
  isEmpty(): boolean;
  serialize(): Float32Array;
  restore(data: Float32Array): void;
  maxDisplacement(): number;
  destroy(): void;
}

/** What the healing module provides once loaded. */
export interface HealController {
  healer: Pipeline['healer'];
  commit(ctx: RenderContext, dabs: HealOp['dabs'], hardness: number, tap: boolean): Promise<HealOp | null>;
}

export interface EngineEvents {
  change(): void;
  view(): void;
  busy(label: string | null): void;
  error(message: string): void;
  /** A whole stroke fell outside the limit of the brush. */
  outside(): void;
}

function previewSide(glc: GLContext): number {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return Math.min(glc.caps.maxTexture, coarse ? 1536 : 2048);
}

export class Engine {
  readonly glc: GLContext;
  doc: EditDoc = createDoc(1, 1);
  source: SourceImage | null = null;
  masks: MaskStore | null = null;
  pipeline: Pipeline | null = null;
  ctx: RenderContext | null = null;
  field: FieldController | null = null;
  heal: HealController | null = null;
  readonly history: History;

  mode: ToolMode = 'none';
  activeLayer: LayerId | null = null;
  brush: BrushSettings = { ...DEFAULT_BRUSH };
  liquifyMode = 'push';
  liquifyStrength = 0.6;
  /** Paints the mark of the touched area over the photo. Every tool opens with it off. */
  showMask = false;
  /** The mask of the open tool comes from the detector: a drag moves the photo and paints nothing. */
  brushOff = false;
  /** The automatic mode of Manchas is going over the spots. The healing brush waits for it. */
  private healingSpots = false;
  /** While set, strokes wait and the person reads this instead. */
  holdStroke: string | null = null;
  exporting = false;
  /** Changes whenever the liquify field changes, so autosave knows when to write it. */
  fieldRev = 0;
  /** Id of the filter whose LUT is on the GPU. */
  loadedLut: string | null = null;
  /** Re-uploads the LUT after an undo changes the filter. */
  onFilterRestore: (() => void) | null = null;

  view: ViewState = fitView();
  viewport: Viewport = { w: 1, h: 1, top: 0, right: 0, bottom: 0, left: 0 };
  /** Set while the crop tool is open: shows the whole rotated image. */
  cropEditing = false;
  /** -1 off, 0..1 split position over the canvas, 2 full before. */
  split = -1;
  compareBase: CompareBase = 'original';

  /** Counts the moves of the view the person made, so a flight never undoes one. */
  viewMoves = 0;
  private flight: { frame: number; done: () => void } | null = null;
  /** The light over the reach of the brush, while it plays. */
  private reveal: { start: number; still: boolean; frame: number; done: () => void } | null = null;

  private readonly emptyField: Tex;
  /** Full-detail render of the visible area, used when zoomed past the preview resolution. */
  private roi: { ctx: RenderContext; key: string } | null = null;
  private roiTimer: ReturnType<typeof setTimeout> | null = null;
  /** True while the unfiltered buffer matches the document. */
  private unfilteredFresh = false;
  private frame = 0;
  private needsRender = false;
  private stroke: {
    kind: ToolMode;
    interp: StrokeInterpolator | null;
    layer: LayerId | null;
    wasPainted: boolean;
    /** Something of the stroke fell inside the limit of the brush. */
    reached: boolean;
    healDabs: HealOp['dabs'];
    start: [number, number];
    travelled: number;
    last: [number, number];
  } | null = null;
  private pendingParams: { label: string; before: EditDoc } | null = null;
  /** Starting settings of each tool, for a reset. */
  private readonly toolDefaults = new Map<LayerId, Record<string, ParamValue>>();
  private readonly listeners: Partial<EngineEvents>[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    this.glc = new GLContext(canvas);
    this.history = new History(undefined, () => this.emit('change'));
    this.emptyField = this.glc.createTex(1, 1, 'rg16f', { noTarget: true });
    this.glc.upload(this.emptyField, { x: 0, y: 0, w: 1, h: 1 }, new Float32Array(2));
  }

  on(events: Partial<EngineEvents>): () => void {
    this.listeners.push(events);
    return () => {
      const i = this.listeners.indexOf(events);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  emit<K extends keyof EngineEvents>(name: K, ...args: Parameters<EngineEvents[K]>): void {
    for (const l of this.listeners) (l[name] as ((...a: unknown[]) => void) | undefined)?.(...args);
  }

  get loaded() {
    return !!this.source;
  }

  /** Crop used for display: the real one, or the full rotated frame while cropping. */
  private displayCrop(): Crop {
    const c = this.doc.crop;
    if (!this.cropEditing) return c;
    const b = rotatedBounds(this.doc.width, this.doc.height, c);
    return { ...c, cx: 0, cy: 0, cw: b.w, ch: b.h };
  }

  get displaySize(): Size {
    return outputSize(this.displayCrop());
  }

  async open(source: SourceImage, restored?: EditDoc): Promise<void> {
    this.close();
    this.source = source;
    this.doc = restored ?? createDoc(source.w, source.h);
    const side = previewSide(this.glc);
    const scale = Math.min(1, side / Math.max(source.w, source.h));
    this.masks = new MaskStore(this.glc, source.w, source.h, side);
    this.pipeline = new Pipeline(this.glc, this.masks, this.emptyField);
    const tex = source.toTexture(this.glc, 0, 0, source.w, source.h, scale);
    this.ctx = new RenderContext(this.glc, { x: 0, y: 0, w: source.w, h: source.h, scale }, source.w, source.h, tex);
    this.view = fitView();
    this.history.clear();
    this.requestRender();
    this.emit('change');
  }

  close(): void {
    this.stopFlight();
    this.stopReveal();
    cancelAnimationFrame(this.frame);
    this.needsRender = false;
    this.dropRoi();
    this.ctx?.destroy();
    this.masks?.destroy();
    this.field?.destroy();
    this.glc.drainPool();
    this.source?.close();
    this.ctx = null;
    this.masks = null;
    this.pipeline = null;
    this.source = null;
    this.field = null;
    this.heal = null;
    this.mode = 'none';
    this.activeLayer = null;
    this.showMask = false;
    this.split = -1;
    this.compareBase = 'original';
    this.unfilteredFresh = false;
    this.loadedLut = null;
    this.cropEditing = false;
  }

  /** Releases the GPU context. The engine cannot be used after this. */
  destroy(): void {
    this.close();
    this.history.clear();
    this.glc.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  /* Tools */

  registerTool(pass: ToolPass, defaults: Record<string, ParamValue>): void {
    if (!this.pipeline) return;
    this.pipeline.tools.set(pass.id, pass);
    this.toolDefaults.set(pass.id, { ...defaults });
    if (!this.doc.layers[pass.id]) {
      this.doc.layers[pass.id] = { enabled: true, painted: false, params: { ...defaults } };
    }
  }

  registerHeal(heal: HealController): void {
    this.heal = heal;
    if (this.pipeline) this.pipeline.healer = heal.healer;
  }

  registerField(field: FieldController): void {
    this.field = field;
    if (this.pipeline) this.pipeline.field = field;
  }

  setTool(mode: ToolMode, layer: LayerId | null = null): void {
    this.mode = mode;
    this.activeLayer = layer;
    this.showMask = false;
    this.brushOff = false;
    this.holdStroke = null;
    this.masks?.setLimit(null);
    this.stopReveal();
    if (this.pipeline) this.pipeline.active = layer;
    this.requestRender();
    this.emit('change');
  }

  /** Limits the brush of the open tool. The next tool starts free. */
  setPaintLimit(data: Uint8Array | null): void {
    this.masks?.setLimit(data);
    if (!data) this.stopReveal();
  }

  /**
   * Lights up, for about a second, the pixels the brush can reach. Only the on-screen pass draws it,
   * so exports never see it. `still` drops the moving band and keeps a plain fade. Resolves when it ends.
   */
  revealLimit(still: boolean): Promise<void> {
    this.stopReveal();
    if (!this.masks?.limitTex) return Promise.resolve();
    return new Promise((done) => {
      const tick = () => {
        const r = this.reveal;
        if (!r) return;
        this.requestRender();
        if (performance.now() - r.start >= REVEAL_MS) this.stopReveal();
        else r.frame = requestAnimationFrame(tick);
      };
      this.reveal = { start: performance.now(), still, frame: requestAnimationFrame(tick), done };
      this.requestRender();
    });
  }

  get revealing(): boolean {
    return !!this.reveal;
  }

  stopReveal(): void {
    const r = this.reveal;
    if (!r) return;
    this.reveal = null;
    cancelAnimationFrame(r.frame);
    this.requestRender();
    r.done();
  }

  /** Strength of the light and place of its band, from the time it started. */
  private revealState(): { glow: number; sweep: number; still: boolean } {
    const r = this.reveal;
    if (!r || !this.masks?.limitTex) return { glow: 0, sweep: 0, still: true };
    const t = Math.min(1, (performance.now() - r.start) / REVEAL_MS);
    return {
      glow: smooth(0, 0.15, t) * (1 - smooth(0.55, 1, t)),
      sweep: -0.25 + 1.5 * easeInOut(Math.min(1, t / 0.85)),
      still: r.still,
    };
  }

  /** Live change of a tool parameter. Call `commit` when the gesture ends. */
  setParam(id: LayerId, key: string, value: ParamValue): void {
    const layer = this.doc.layers[id];
    if (!layer) return;
    this.track('Ajuste');
    layer.params[key] = value;
    if (id === this.activeLayer) this.ctx?.invalidate('local');
    else this.ctx?.invalidate('prefix');
    this.requestRender();
  }

  /** Erases a whole layer. */
  async clearLayer(id: LayerId): Promise<void> {
    const layer = this.doc.layers[id];
    const masks = this.masks;
    if (!layer || !masks) return;
    const data = await masks.read(id);
    const before = clone(layer);
    masks.clear(id);
    layer.painted = false;
    this.ctx?.invalidate('prefix');
    this.requestRender();
    const after = clone(layer);
    this.history.push({
      label: 'Limpar',
      bytes: data?.length ?? 0,
      undo: () => {
        if (data) masks.write(id, data);
        this.doc.layers[id] = clone(before);
        this.ctx?.invalidate('prefix');
        this.requestRender();
      },
      redo: () => {
        masks.clear(id);
        this.doc.layers[id] = clone(after);
        this.ctx?.invalidate('prefix');
        this.requestRender();
      },
    });
  }

  /**
   * Replaces a whole layer mask with `data`, as one undo step. The result is a mask like any painted
   * one: brush, eraser, sliders and the saved project treat it the same.
   */
  async fillLayer(id: LayerId, data: Uint8Array, label: string, fadeMs = 0): Promise<void> {
    const layer = this.doc.layers[id];
    const masks = this.masks;
    if (!layer || !masks) return;
    this.commit();
    const { w, h } = masks;
    const previous = await masks.read(id);
    // Read before the fade, which marks the layer as painted while it plays.
    const before = { mask: previous ? encodeTile(previous, w, h) : null, painted: layer.painted };
    if (fadeMs > 0) await this.fadeMask(id, previous, data, fadeMs);
    if (this.masks !== masks || !this.doc.layers[id]) return;
    const after = { mask: encodeTile(data, w, h), painted: true };
    const apply = (state: typeof before) => {
      if (state.mask) masks.write(id, decodeTile(state.mask, w, h));
      else masks.clear(id);
      const current = this.doc.layers[id];
      if (current) current.painted = state.painted;
      this.ctx?.invalidate('prefix');
      this.requestRender();
    };
    apply(after);
    this.history.push({
      label,
      bytes: (before.mask?.length ?? 0) + after.mask.length + 64,
      undo: () => apply(before),
      redo: () => apply(after),
    });
  }

  /**
   * Shows the effect arriving: the mask goes from `from` to `to` over `ms`, frame by frame. Nothing of it
   * reaches the history; the caller writes the final mask. Stops early if the photo changes.
   */
  private async fadeMask(id: LayerId, from: Uint8Array | null, to: Uint8Array, ms: number): Promise<void> {
    const masks = this.masks;
    if (!masks) return;
    const step = new Uint8Array(to.length);
    const start = performance.now();
    for (;;) {
      await new Promise((done) => requestAnimationFrame(done));
      if (this.masks !== masks) return;
      const t = (performance.now() - start) / ms;
      if (t >= 1) return;
      const k = easeInOut(t);
      if (from) for (let i = 0; i < to.length; i++) step[i] = from[i] + (to[i] - from[i]) * k;
      else for (let i = 0; i < to.length; i++) step[i] = to[i] * k;
      masks.write(id, step);
      const current = this.doc.layers[id];
      if (current) current.painted = true;
      this.ctx?.invalidate('prefix');
      this.requestRender();
    }
  }

  setAdjust<K extends keyof Adjustments>(key: K, value: number): void {
    this.track('Ajuste');
    this.doc.adjust[key] = value;
    this.ctx?.invalidate('global');
    this.requestRender();
  }

  setBlur(patch: Partial<BlurSettings>): void {
    this.track('Desfoque');
    Object.assign(this.doc.blur, patch);
    this.ctx?.invalidate('global');
    this.requestRender();
  }

  setFilterState(id: string | null, intensity: number): void {
    this.track('Filtro');
    this.doc.filter = { ...this.doc.filter, id, intensity };
    if (this.pipeline) this.pipeline.lutMix = intensity;
    this.ctx?.invalidate('global');
    this.requestRender();
  }

  /** Live change of where the filter applies. Call `commit` when the gesture ends. */
  setFilterArea(patch: Pick<FilterState, 'masked' | 'feather'>): void {
    this.track('Filtro');
    this.doc.filter = { ...this.doc.filter, ...patch };
    this.ctx?.invalidate('global');
    this.requestRender();
  }

  /** Replaces the mask of the filter and its settings as one undo step. Without data the mask is empty. */
  async replaceFilterMask(label: string, data: Uint8Array | null, patch: Partial<FilterState>): Promise<void> {
    const masks = this.masks;
    if (!masks) return;
    this.commit();
    const { w, h } = masks;
    const filter = clone(this.doc.filter);
    const previous = await masks.read(FILTER_MASK);
    const pack = (bytes: Uint8Array | null) => (bytes ? encodeTile(bytes, w, h) : null);
    const before = { mask: pack(previous), filter };
    const after = { mask: pack(data), filter: { ...filter, ...patch } };
    const apply = (state: typeof before) => {
      if (state.mask) masks.write(FILTER_MASK, decodeTile(state.mask, w, h));
      else masks.clear(FILTER_MASK);
      this.doc.filter = clone(state.filter);
      this.ctx?.invalidate('global');
      this.requestRender();
    };
    apply(after);
    this.history.push({
      label,
      bytes: (before.mask?.length ?? 0) + (after.mask?.length ?? 0) + 256,
      undo: () => apply(before),
      redo: () => apply(after),
    });
  }

  setCrop(crop: Crop): void {
    this.track('Recorte');
    this.doc.crop = crop;
    this.ctx?.invalidate('global');
    if (!this.cropEditing) {
      this.stopFlight();
      this.view = fitView();
    }
    this.requestRender();
    this.emit('view');
  }

  /** Applies a change to several document fields at once, as one undo step. */
  applyPatch(label: string, patch: (doc: EditDoc) => void): void {
    this.track(label);
    patch(this.doc);
    this.ctx?.invalidate('prefix');
    this.commit();
    this.requestRender();
  }

  /** True when something in `scope` differs from the original photo. */
  changed(scope: ResetScope): boolean {
    const { doc } = this;
    const crop = defaultCrop(doc.width, doc.height);
    return (
      scope.layers.some((id) => doc.layers[id]?.painted) ||
      (!!scope.heals && doc.heals.length > 0) ||
      (!!scope.field && doc.hasField) ||
      (!!scope.adjust && Object.values(doc.adjust).some((v) => v !== 0)) ||
      (!!scope.filter && (!!doc.filter.id || !!doc.filter.masked)) ||
      (!!scope.blur && doc.blur.mode !== 'off') ||
      (!!scope.crop && JSON.stringify(doc.crop) !== JSON.stringify(crop))
    );
  }

  /**
   * Puts part of the edit, or all of it, back to the original photo, as one undo step. Masks, healing,
   * liquify, filter, adjustments, blur and crop each go back only when `scope` names them. Returns
   * false when there was nothing to put back.
   */
  async resetParts(label: string, scope: ResetScope): Promise<boolean> {
    const masks = this.masks;
    if (!masks || !this.changed(scope)) return false;
    this.commit();
    const { w, h } = masks;
    const ids = scope.layers.filter((id) => this.doc.layers[id]);
    const maskIds: LayerId[] = scope.filter ? [...ids, FILTER_MASK] : ids;
    const saved = new Map<LayerId, Uint8Array | null>();
    for (const id of maskIds) {
      const data = await masks.read(id);
      saved.set(id, data ? encodeTile(data, w, h) : null);
    }
    const field = scope.field && this.field && !this.field.isEmpty() ? this.field.serialize().slice() : null;
    const before = clone(this.doc);
    const after = clone(this.doc);
    for (const id of ids) {
      after.layers[id] = { enabled: true, painted: false, params: { ...(this.toolDefaults.get(id) ?? after.layers[id]!.params) } };
    }
    if (scope.heals) after.heals = [];
    if (scope.field) after.hasField = false;
    if (scope.adjust) after.adjust = { ...DEFAULT_ADJUST };
    if (scope.filter) after.filter = { id: null, intensity: 1 };
    if (scope.blur) after.blur = { ...DEFAULT_BLUR };
    if (scope.crop) after.crop = defaultCrop(after.width, after.height);

    const apply = (doc: EditDoc, back: boolean) => {
      const cropMoved = JSON.stringify(doc.crop) !== JSON.stringify(this.doc.crop);
      this.doc = clone(doc);
      for (const id of maskIds) {
        const packed = back ? saved.get(id) : null;
        if (packed) masks.write(id, decodeTile(packed, w, h));
        else masks.clear(id);
      }
      if (scope.field && this.field) {
        this.field.restore(back && field ? field : new Float32Array(this.field.serialize().length));
        this.fieldRev++;
      }
      if (this.pipeline) this.pipeline.lutMix = this.doc.filter.intensity;
      this.onFilterRestore?.();
      if (cropMoved && !this.cropEditing) {
        this.stopFlight();
        this.view = fitView();
      }
      this.ctx?.invalidate('healed');
      this.emit('view');
      this.requestRender();
    };
    apply(after, false);
    let bytes = 4096 + (field?.byteLength ?? 0);
    for (const packed of saved.values()) bytes += packed?.length ?? 0;
    this.history.push({ label, bytes, undo: () => apply(before, true), redo: () => apply(after, false) });
    return true;
  }

  /* Parameter history: a snapshot of the small document fields, taken at the first change. */

  private track(label: string): void {
    if (!this.pendingParams) this.pendingParams = { label, before: clone(this.doc) };
  }

  /** Closes the current slider gesture and adds one undo entry. */
  commit(): void {
    const pending = this.pendingParams;
    this.pendingParams = null;
    if (!pending) return;
    const after = clone(this.doc);
    if (JSON.stringify(after) === JSON.stringify(pending.before)) return;
    const restore = (d: EditDoc) => {
      // Masks, heals and the field have their own entries, so only settings come from the snapshot.
      const current = this.doc;
      const next = clone(d);
      next.heals = current.heals;
      next.hasField = current.hasField;
      for (const id of Object.keys(current.layers) as LayerId[]) {
        const layer = next.layers[id];
        if (layer) layer.painted = current.layers[id]!.painted;
        else next.layers[id] = current.layers[id];
      }
      this.doc = next;
      this.onFilterRestore?.();
      this.ctx?.invalidate('prefix');
      this.emit('view');
      this.requestRender();
    };
    this.history.push({
      label: pending.label,
      bytes: 2048,
      undo: () => restore(pending.before),
      redo: () => restore(after),
    });
    this.emit('change');
  }

  undo(): Promise<void> {
    this.commit();
    return this.history.undo();
  }

  redo(): Promise<void> {
    this.commit();
    return this.history.redo();
  }

  /* Coordinates */

  /** Screen pixel (CSS) to image UV, before the liquify warp. */
  screenToImage(x: number, y: number): [number, number] {
    const dpr = this.dpr;
    const crop = this.displayCrop();
    const [s, t] = screenToOutput(this.viewport, outputSize(crop), this.view, x * dpr, y * dpr);
    return applyMat3(outputToImage(crop, this.doc.width, this.doc.height), s, t);
  }

  /** Output coordinates (of the display crop) to CSS pixels on the canvas. */
  outputToCss(s: number, t: number): [number, number] {
    const [x, y] = outputToScreen(this.viewport, this.displaySize, this.view, s, t);
    return [x / this.dpr, y / this.dpr];
  }

  /** Point of the photo as it was opened to CSS pixels on the canvas, past crop and liquify. */
  imageToCss(u: number, v: number): [number, number] {
    const [s, t] = this.imageToShown(u, v);
    return this.outputToCss(s, t);
  }

  /** Point of the photo as it was opened to output coordinates of the display crop, past liquify. */
  imageToShown(u: number, v: number): [number, number] {
    let [x, y] = [u, v];
    if (this.field && this.doc.hasField) {
      // The field maps a shown position back to the photo. A few steps invert it closely enough.
      for (let i = 0; i < 4; i++) {
        const [du, dv] = this.field.lookup(x, y);
        x = u - du;
        y = v - dv;
      }
    }
    return applyMat3(imageToOutput(this.displayCrop(), this.doc.width, this.doc.height), x, y);
  }

  cssToOutput(x: number, y: number): [number, number] {
    const dpr = this.dpr;
    return screenToOutput(this.viewport, this.displaySize, this.view, x * dpr, y * dpr);
  }

  get dpr() {
    return this.canvas.width / Math.max(1, this.canvas.clientWidth);
  }

  /** Output pixels shown per CSS pixel at the current zoom. */
  get cssPerImagePixel(): number {
    return viewScale(this.viewport, this.displaySize, this.view) / this.dpr;
  }

  /** Radius of the brush on screen, in CSS pixels. */
  get brushScreenRadius(): number {
    return this.brush.size * Math.max(this.doc.width, this.doc.height) * this.cssPerImagePixel;
  }

  private maskPoint(x: number, y: number): [number, number] {
    const [u, v] = this.screenToImage(x, y);
    const [du, dv] = this.field && this.doc.hasField ? this.field.lookup(u, v) : [0, 0];
    return [u + du, v + dv];
  }

  /* Strokes */

  beginStroke(x: number, y: number, pressure = 1): void {
    const masks = this.masks;
    if (!masks || this.stroke || this.mode === 'none' || this.brushOff || (this.mode === 'heal' && this.healingSpots)) return;
    if (this.holdStroke) {
      this.emit('error', this.holdStroke);
      return;
    }
    this.commit();
    const longMask = Math.max(masks.w, masks.h);
    const radius = this.brush.size * longMask;
    const layer = this.mode === 'heal' ? HEAL_MASK : this.activeLayer;
    const common = {
      kind: this.mode,
      healDabs: [],
      start: [x, y] as [number, number],
      last: [x, y] as [number, number],
      travelled: 0,
    };
    if (this.mode === 'liquify') {
      const field = this.field;
      if (!field) return;
      field.begin(this.liquifyMode, this.brush.size, this.liquifyStrength);
      this.stroke = { ...common, interp: null, layer: null, wasPainted: false, reached: true };
      this.moveStroke(x, y, pressure);
      if (this.liquifyMode !== 'push') requestAnimationFrame(this.holdTick);
      return;
    }
    if (!layer) return;
    const state = this.doc.layers[layer];
    const settings = this.mode === 'heal' ? { ...this.brush, erase: false, opacity: 1, flow: 1 } : this.brush;
    masks.beginStroke(layer, settings);
    const interp = new StrokeInterpolator(radius, settings.flow);
    this.stroke = { ...common, interp, layer, wasPainted: state?.painted ?? false, reached: !masks.limited || settings.erase };
    if (state && !this.brush.erase) state.painted = true;
    this.moveStroke(x, y, pressure);
  }

  /** Bloat, pinch and restore keep working while the pointer rests. */
  private readonly holdTick = () => {
    const s = this.stroke;
    if (s?.kind !== 'liquify') return;
    this.moveStroke(s.last[0], s.last[1]);
    requestAnimationFrame(this.holdTick);
  };

  moveStroke(x: number, y: number, pressure = 1): void {
    const s = this.stroke;
    if (!s) return;
    s.travelled += Math.hypot(x - s.last[0], y - s.last[1]);
    s.last = [x, y];
    if (s.kind === 'liquify') {
      const [u, v] = this.screenToImage(x, y);
      this.field?.stroke(u, v);
      this.doc.hasField = true;
      this.ctx?.invalidate('global');
      this.requestRender();
      return;
    }
    const masks = this.masks!;
    const [u, v] = this.maskPoint(x, y);
    this.paintDabs(s.interp!.add({ x: u * masks.w, y: v * masks.h, pressure }));
  }

  private paintDabs(dabs: Dab[]): void {
    const s = this.stroke;
    const masks = this.masks;
    const ctx = this.ctx;
    if (!s || !masks || !ctx || !s.layer || dabs.length === 0) return;
    s.reached ||= masks.reaches(dabs);
    const rect = masks.paint(dabs, s.layer);
    if (s.kind === 'heal') {
      const long = Math.max(masks.w, masks.h);
      // With a limit, a dab that falls off the skin heals nothing.
      for (const d of dabs) if (masks.reaches([d])) s.healDabs.push({ u: d.x / masks.w, v: d.y / masks.h, r: d.radius / long });
    } else if (rect) {
      const k = ctx.w / masks.w;
      ctx.touch({
        x: Math.floor(rect.x * k) - 2,
        y: Math.floor(rect.y * k) - 2,
        w: Math.ceil(rect.w * k) + 4,
        h: Math.ceil(rect.h * k) + 4,
      });
    }
    this.requestRender();
  }

  /** Ends the stroke and records it in the history. */
  async endStroke(): Promise<void> {
    const s = this.stroke;
    if (!s) return;
    if (!s.reached) {
      // Nothing landed, so there is nothing to undo either.
      this.cancelStroke();
      this.emit('outside');
      return;
    }
    this.stroke = null;
    const masks = this.masks;
    if (!masks) return;
    if (s.kind === 'liquify') {
      const entry = this.field?.end();
      if (entry) this.history.push(this.withFieldFlags(entry));
      return;
    }
    if (!s.layer) return;
    const tiles = masks.endStroke();
    if (s.kind === 'heal') {
      await tiles;
      await this.finishHeal(s.healDabs, s.travelled < 6);
      return;
    }
    // A tool can read the whole mask, so what a stroke touched last is redone over the whole frame.
    this.ctx?.invalidate('local');
    this.requestRender();
    const layer = s.layer;
    const wasPainted = s.wasPainted;
    const entry: HistoryEntry & { tiles: MaskTile[] } = {
      label: 'Pincel',
      bytes: 256,
      tiles: [],
      undo: async () => {
        const previous = await masks.swapTiles(layer, await pendingTiles);
        pendingTiles = Promise.resolve(previous);
        const state = this.doc.layers[layer];
        if (state) state.painted = wasPainted;
        this.ctx?.invalidate('prefix');
        this.requestRender();
      },
      redo: async () => {
        const previous = await masks.swapTiles(layer, await pendingTiles);
        pendingTiles = Promise.resolve(previous);
        const state = this.doc.layers[layer];
        if (state) state.painted = true;
        this.ctx?.invalidate('prefix');
        this.requestRender();
      },
    };
    let pendingTiles = tiles;
    this.history.push(entry);
    const list = await tiles;
    this.history.grow(entry, list.reduce((n, t) => n + t.data.length + 48, 0));
  }

  cancelStroke(): void {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    if (s.kind === 'liquify') {
      const entry = this.field?.end();
      void entry?.undo();
      this.ctx?.invalidate('global');
    } else if (s.layer) {
      this.masks?.cancelStroke(s.layer);
      const state = this.doc.layers[s.layer];
      if (state) state.painted = s.wasPainted;
      this.ctx?.invalidate('prefix');
    }
    this.requestRender();
  }

  get stroking() {
    return !!this.stroke;
  }

  private withFieldFlags(entry: HistoryEntry): HistoryEntry {
    this.fieldRev++;
    const refresh = () => {
      this.fieldRev++;
      this.doc.hasField = !this.field?.isEmpty();
      this.ctx?.invalidate('global');
      this.requestRender();
    };
    return {
      ...entry,
      undo: async () => {
        await entry.undo();
        refresh();
      },
      redo: async () => {
        await entry.redo();
        refresh();
      },
    };
  }

  private async finishHeal(dabs: HealOp['dabs'], tap: boolean): Promise<void> {
    const { heal, ctx, masks } = this;
    if (!heal || !ctx || !masks || dabs.length === 0) return;
    this.emit('busy', 'Acertando a mancha…');
    const op = await heal.commit(ctx, dabs, this.brush.hardness, tap);
    masks.clear(HEAL_MASK);
    this.glc.drainPool();
    this.emit('busy', null);
    if (!op) {
      this.emit('error', 'Aqui tem um contorno. Aproxime e pinte só a mancha.');
      this.requestRender();
      return;
    }
    this.doc.heals.push(op);
    this.applyNewestHeal(ctx);
    this.requestRender();
    this.history.push({
      label: 'Mancha',
      bytes: 128 + op.dabs.length * 24,
      undo: () => {
        this.doc.heals.pop();
        this.ctx?.invalidate('healed');
        this.requestRender();
      },
      redo: () => {
        this.doc.heals.push(op);
        this.ctx?.invalidate('healed');
        this.requestRender();
      },
    });
  }

  /**
   * Replaces every healed spot with one heal at each of `spots`, as one undo step. Each spot is fitted
   * as a touch of the healing brush would be, and the photo shows them going one by one: `each` runs
   * after every spot. Returns how many were healed.
   */
  async healSpots(spots: HealOp['dabs'], label: string, each?: () => Promise<void>): Promise<number> {
    const { heal, ctx, pipeline } = this;
    if (!heal || !ctx || !pipeline || this.healingSpots) return 0;
    this.commit();
    this.healingSpots = true;
    const before = this.doc.heals.slice();
    const made: HealOp[] = [];
    try {
      this.doc.heals = [];
      ctx.invalidate('healed');
      pipeline.update(ctx, this.doc);
      for (const spot of spots) {
        // A touch refits the spot. When it sees a contour instead, the search already found a spot
        // that stays inside the skin, so its circle is healed as it is.
        const op = (await heal.commit(ctx, [spot], AUTO_HEAL_EDGE, true)) ?? (await heal.commit(ctx, [spot], AUTO_HEAL_EDGE, false));
        if (this.ctx !== ctx) return 0;
        if (!op) continue;
        this.doc.heals.push(op);
        made.push(op);
        this.applyNewestHeal(ctx);
        this.requestRender();
        await each?.();
      }
    } finally {
      this.healingSpots = false;
      this.glc.drainPool();
    }
    if (this.ctx !== ctx) return 0;
    const after = made;
    const set = (list: HealOp[]) => {
      this.doc.heals = list.slice();
      this.ctx?.invalidate('healed');
      this.requestRender();
    };
    if (made.length === 0 && before.length === 0) return 0;
    this.history.push({
      label,
      bytes: 128 + (before.length + after.length) * 96,
      undo: () => set(before),
      redo: () => set(after),
    });
    return made.length;
  }

  /** Adds the newest healing op on top of the cached result instead of replaying all of them. */
  private applyNewestHeal(ctx: RenderContext): void {
    const healer = this.pipeline?.healer;
    if (!healer || ctx.dirty.healed) {
      ctx.invalidate('healed');
      return;
    }
    const healed = ctx.slot('healed');
    healer.applyLast(ctx, this.doc, healed);
    this.glc.generateMips(healed);
    ctx.clearCache();
    this.pipeline?.refreshGlobalLow(ctx, healed);
    ctx.invalidate('prefix');
  }

  /* View */

  setViewport(w: number, h: number, insets: Pick<Viewport, 'top' | 'right' | 'bottom' | 'left'>): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cw = Math.max(1, Math.round(w * dpr));
    const ch = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.viewport = {
      w: cw,
      h: ch,
      top: insets.top * dpr,
      right: insets.right * dpr,
      bottom: insets.bottom * dpr,
      left: insets.left * dpr,
    };
    this.view = clampView(this.viewport, this.displaySize, this.view);
    this.requestRender();
    this.emit('view');
  }

  /** Moves the view smoothly to `target`. Any move of the person stops it where it is. */
  flyTo(target: ViewState, duration: number): Promise<void> {
    this.stopFlight();
    const from = { ...this.view };
    const to = clampView(this.viewport, this.displaySize, target);
    if (duration <= 0) {
      this.view = to;
      this.requestRender();
      this.emit('view');
      return Promise.resolve();
    }
    return new Promise((done) => {
      const start = performance.now();
      const tick = () => {
        const f = this.flight;
        if (!f) return;
        const t = Math.min(1, (performance.now() - start) / duration);
        this.view = clampView(this.viewport, this.displaySize, blendViews(from, to, easeInOut(t)));
        this.requestRender();
        this.emit('view');
        if (t >= 1) this.stopFlight();
        else f.frame = requestAnimationFrame(tick);
      };
      this.flight = { frame: requestAnimationFrame(tick), done };
    });
  }

  get flying(): boolean {
    return !!this.flight;
  }

  stopFlight(): void {
    const f = this.flight;
    if (!f) return;
    this.flight = null;
    cancelAnimationFrame(f.frame);
    f.done();
  }

  /** A move of the view by the person: it wins over any flight. */
  private moved(): void {
    this.stopFlight();
    this.viewMoves++;
  }

  zoomBy(x: number, y: number, factor: number): void {
    this.moved();
    const dpr = this.dpr;
    this.view = zoomAt(this.viewport, this.displaySize, this.view, x * dpr, y * dpr, factor);
    this.requestRender();
    this.emit('view');
  }

  panBy(dx: number, dy: number): void {
    this.moved();
    const dpr = this.dpr;
    this.view = panBy(this.viewport, this.displaySize, this.view, dx * dpr, dy * dpr);
    this.requestRender();
    this.emit('view');
  }

  resetView(): void {
    this.moved();
    this.view = fitView();
    this.requestRender();
    this.emit('view');
  }

  setSplit(value: number): void {
    this.split = value;
    this.requestRender();
  }

  /** Chooses the before side. The unfiltered frame costs one more buffer, so it exists only while in use. */
  setCompareBase(base: CompareBase): void {
    if (this.compareBase === base) return;
    this.compareBase = base;
    this.unfilteredFresh = false;
    this.dropRoi();
    if (base === 'original') this.ctx?.dropSlot('unfiltered');
    this.requestRender();
  }

  setCropEditing(on: boolean): void {
    this.stopFlight();
    this.cropEditing = on;
    this.view = fitView();
    this.requestRender();
    this.emit('view');
  }

  /* Rendering */

  requestRender(): void {
    if (this.needsRender) return;
    this.needsRender = true;
    this.frame = requestAnimationFrame(() => {
      this.needsRender = false;
      this.renderNow();
    });
  }

  renderNow(): void {
    const { ctx, pipeline, masks } = this;
    if (!ctx || !pipeline || !masks || this.exporting) return;
    const { dirty } = ctx;
    if (dirty.healed || dirty.prefix || dirty.local || dirty.global) {
      this.dropRoi();
      this.unfilteredFresh = false;
    }
    pipeline.update(ctx, this.doc);
    if (this.compareBase === 'unfiltered' && !this.unfilteredFresh) {
      pipeline.renderUnfiltered(ctx, this.doc);
      this.unfilteredFresh = true;
    }
    this.drawView(ctx, masks);
    if (this.roiTimer) clearTimeout(this.roiTimer);
    this.roiTimer = setTimeout(() => this.refreshRoi(), 220);
  }

  private dropRoi(): void {
    if (!this.roi) return;
    this.roi.ctx.destroy();
    this.roi = null;
    this.glc.drainPool();
  }

  /**
   * When the view shows more detail than the preview holds, renders just the visible area
   * from the original, once the view stops moving. The cost follows the screen, not the photo.
   */
  private refreshRoi(): void {
    const { ctx, pipeline, source, masks, doc, viewport: vp } = this;
    if (!ctx || !pipeline || !source || !masks || this.stroke || this.exporting) return;
    const crop = this.displayCrop();
    const out = outputSize(crop);
    const k = viewScale(vp, out, this.view);
    if (k <= ctx.region.scale * 1.2 || ctx.region.scale >= 1) {
      if (this.roi) {
        this.dropRoi();
        this.drawView(ctx, masks);
      }
      return;
    }
    const m = outputToImage(crop, doc.width, doc.height);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [cx, cy] of [
      [vp.left, vp.top],
      [vp.w - vp.right, vp.top],
      [vp.left, vp.h - vp.bottom],
      [vp.w - vp.right, vp.h - vp.bottom],
    ] as const) {
      const [s, t] = screenToOutput(vp, out, this.view, cx, cy);
      const [u, v] = applyMat3(m, s, t);
      x0 = Math.min(x0, u * doc.width);
      y0 = Math.min(y0, v * doc.height);
      x1 = Math.max(x1, u * doc.width);
      y1 = Math.max(y1, v * doc.height);
    }
    const pad = 192;
    const rx0 = Math.max(0, Math.floor((x0 - pad) / 256) * 256);
    const ry0 = Math.max(0, Math.floor((y0 - pad) / 256) * 256);
    const rx1 = Math.min(doc.width, Math.ceil(x1 + pad));
    const ry1 = Math.min(doc.height, Math.ceil(y1 + pad));
    if (rx1 <= rx0 || ry1 <= ry0) return;
    const limit = Math.min(this.glc.caps.maxTexture, 3072);
    const scale = Math.min(1, k, limit / Math.max(rx1 - rx0, ry1 - ry0));
    if (scale <= ctx.region.scale * 1.1) return;
    const key = [rx0, ry0, rx1, ry1, scale.toFixed(3)].join();
    if (this.roi?.key === key) return;
    this.dropRoi();
    const tex = source.toTexture(this.glc, rx0, ry0, rx1 - rx0, ry1 - ry0, scale);
    const roi = new RenderContext(this.glc, { x: rx0, y: ry0, w: rx1 - rx0, h: ry1 - ry0, scale }, doc.width, doc.height, tex);
    const active = pipeline.active;
    pipeline.active = null;
    pipeline.update(roi, doc);
    if (this.compareBase === 'unfiltered') pipeline.renderUnfiltered(roi, doc);
    pipeline.active = active;
    this.roi = { ctx: roi, key };
    this.drawView(ctx, masks);
  }

  private drawView(ctx: RenderContext, masks: MaskStore): void {
    const { glc, doc, viewport: vp } = this;
    const crop = this.displayCrop();
    const out = outputSize(crop);
    const k = viewScale(vp, out, this.view);
    const [ox, oy] = screenToOutput(vp, out, this.view, 0, 0);
    const overlayId = this.mode === 'heal' ? HEAL_MASK : this.activeLayer;
    const overlay = overlayId ? masks.get(overlayId) : null;
    const healing = this.mode === 'heal' && !!this.stroke;
    const showOverlay = !!overlay && (healing || (this.showMask && this.mode === 'mask'));
    const hasField = doc.hasField && !!this.field;
    const before = (c: RenderContext) => (this.compareBase === 'unfiltered' ? c.slot('unfiltered') : c.source);
    const light = this.revealState();
    glc.run(
      glc.program(shader(VIEW_FRAG)),
      null,
      {
        uFinal: ctx.slot('final'),
        uBefore: before(ctx),
        uOverlay: overlay ?? ctx.source,
        uField: hasField ? this.field!.tex : this.emptyField,
        uCanvas: [vp.w, vp.h],
        uOrigin: [ox, oy],
        uPerPixel: [1 / (k * out.w), 1 / (k * out.h)],
        uToImage: outputToImage(crop, doc.width, doc.height),
        uImageTexels: [ctx.w, ctx.h],
        uSplit: this.split,
        uSplitX: this.split * vp.w,
        uOverlayMix: showOverlay ? 0.55 : 0,
        uHasField: hasField,
        uBackground: [0.043, 0.043, 0.047],
        uOverlayColor: [1, 0.72, 0.47],
        uLimit: masks.limitTex ?? ctx.source,
        uGlow: light.glow,
        uSweep: light.sweep,
        uBand: light.still ? 0 : 1,
        uRoiOn: !!this.roi,
        uRoi: this.roi?.ctx.regionUv ?? [0, 0, 1, 1],
        uRoiFinal: this.roi?.ctx.slot('final') ?? ctx.source,
        uRoiBefore: this.roi ? before(this.roi.ctx) : ctx.source,
      },
      null,
    );
  }
}
