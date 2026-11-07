/**
 * The editor core. Owns the GL context, document, masks, history and render loop.
 * The UI talks to it through plain methods and listens to `onChange`.
 */

import { GLContext, type Tex } from './gl/context';
import { DEFAULT_BRUSH, StrokeInterpolator, type BrushSettings, type Dab } from './brush';
import { clone, createDoc, type Adjustments, type BlurSettings, type EditDoc, type HealOp, type LayerId, type ParamValue } from './doc';
import { applyMat3, outputSize, outputToImage, rotatedBounds, type Crop } from './geometry';
import { History, type HistoryEntry } from './history/history';
import { MaskStore, type MaskTile } from './masks';
import { Pipeline, shader } from './pipeline/pipeline';
import { RenderContext } from './pipeline/context';
import type { ToolPass } from './pipeline/types';
import { SourceImage } from './source';
import { clampView, fitView, outputToScreen, panBy, screenToOutput, viewScale, zoomAt, type Size, type ViewState, type Viewport } from './view';
import VIEW_FRAG from './shaders/view.frag?raw';

/** Mask key of the healing brush. It is a scratch mask and never reaches the render chain. */
export const HEAL_MASK = 'heal' as unknown as LayerId;

export type ToolMode = 'none' | 'mask' | 'heal' | 'liquify';

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
  showMask = false;
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

  private readonly emptyField: Tex;
  /** Full-detail render of the visible area, used when zoomed past the preview resolution. */
  private roi: { ctx: RenderContext; key: string } | null = null;
  private roiTimer: ReturnType<typeof setTimeout> | null = null;
  private frame = 0;
  private needsRender = false;
  private stroke: {
    kind: ToolMode;
    interp: StrokeInterpolator | null;
    layer: LayerId | null;
    wasPainted: boolean;
    healDabs: HealOp['dabs'];
    start: [number, number];
    travelled: number;
    last: [number, number];
  } | null = null;
  private pendingParams: { label: string; before: EditDoc } | null = null;
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
    this.split = -1;
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
    if (this.pipeline) this.pipeline.active = layer;
    this.requestRender();
    this.emit('change');
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
    this.doc.filter = { id, intensity };
    if (this.pipeline) this.pipeline.lutMix = intensity;
    this.ctx?.invalidate('global');
    this.requestRender();
  }

  setCrop(crop: Crop): void {
    this.track('Recorte');
    this.doc.crop = crop;
    this.ctx?.invalidate('global');
    if (!this.cropEditing) this.view = fitView();
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
    if (!masks || this.stroke || this.mode === 'none') return;
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
      this.stroke = { ...common, interp: null, layer: null, wasPainted: false };
      this.moveStroke(x, y, pressure);
      if (this.liquifyMode !== 'push') requestAnimationFrame(this.holdTick);
      return;
    }
    if (!layer) return;
    const state = this.doc.layers[layer];
    const settings = this.mode === 'heal' ? { ...this.brush, erase: false, opacity: 1, flow: 1 } : this.brush;
    masks.beginStroke(layer, settings);
    const interp = new StrokeInterpolator(radius, settings.flow);
    this.stroke = { ...common, interp, layer, wasPainted: state?.painted ?? false };
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
    const rect = masks.paint(dabs, s.layer);
    if (s.kind === 'heal') {
      const long = Math.max(masks.w, masks.h);
      for (const d of dabs) s.healDabs.push({ u: d.x / masks.w, v: d.y / masks.h, r: d.radius / long });
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
    this.emit('busy', 'Revelando…');
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

  zoomBy(x: number, y: number, factor: number): void {
    const dpr = this.dpr;
    this.view = zoomAt(this.viewport, this.displaySize, this.view, x * dpr, y * dpr, factor);
    this.requestRender();
    this.emit('view');
  }

  panBy(dx: number, dy: number): void {
    const dpr = this.dpr;
    this.view = panBy(this.viewport, this.displaySize, this.view, dx * dpr, dy * dpr);
    this.requestRender();
    this.emit('view');
  }

  resetView(): void {
    this.view = fitView();
    this.requestRender();
    this.emit('view');
  }

  setSplit(value: number): void {
    this.split = value;
    this.requestRender();
  }

  setCropEditing(on: boolean): void {
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
    if (dirty.healed || dirty.prefix || dirty.local || dirty.global) this.dropRoi();
    pipeline.update(ctx, this.doc);
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
    glc.run(
      glc.program(shader(VIEW_FRAG)),
      null,
      {
        uFinal: ctx.slot('final'),
        uBefore: ctx.source,
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
        uRoiOn: !!this.roi,
        uRoi: this.roi?.ctx.regionUv ?? [0, 0, 1, 1],
        uRoiFinal: this.roi?.ctx.slot('final') ?? ctx.source,
        uRoiBefore: this.roi?.ctx.source ?? ctx.source,
      },
      null,
    );
  }
}
