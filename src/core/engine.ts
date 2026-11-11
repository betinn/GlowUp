/**
 * The editor core. Owns the GL context, document, masks, history and render loop.
 * The UI talks to it through plain methods and listens to `onChange`.
 */

import { GLContext, type Tex } from './gl/context';
import { DEFAULT_BRUSH, StrokeInterpolator, type BrushSettings, type Dab } from './brush';
import type { SceneData } from './light/types';
import { clone, createDoc, DEFAULT_ADJUST, COVER_MASK, DEFAULT_BLUR, FILTER_MASK, HEAD_MASK, MOUTH_MASK, PERSON_MASK, PHOTO_MASKS, type Adjustments, type BlurSettings, type EditDoc, type FilterState, type HealOp, type LayerId, type ParamValue, type StickerState } from './doc';
import type { FunController } from './fun/controller';
import { shownSticker, type Lookup, type ShownSticker } from './fun/place';
import type { FunSource } from './fun/types';
import { createFieldJobs, type FieldWorkers } from './face/fieldpool';
import type { FieldFrame } from './face/fieldjobs';
import type { FieldGrids, ShapeSource } from './face/fieldwork';
import type { Face } from './face/scan';
import { applyMat3, defaultCrop, imageToOutput, outputSize, outputToImage, rotatedBounds, type Crop } from './geometry';
import { decodeTile, encodeTile } from './history/codec';
import { History, type HistoryEntry } from './history/history';
import { MaskStore, type MaskTile } from './masks';
import { Pipeline, shader, type StickerDraw } from './pipeline/pipeline';
import { coverWay } from './face/person';
import { buildPlate, extendMouth } from './face/plate';
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
  /** The strokes of the brush and the automatic mode, and the sliders stay. `field` takes all of it. */
  liquify?: boolean;
  /** Brincar: its effects and its stickers. */
  fun?: boolean;
  /** The filter, its area and the softness of the area. */
  filter?: boolean;
  /** The light of Luzes. */
  light?: boolean;
  blur?: boolean;
  crop?: boolean;
}

/** What the before side of the comparison shows. */
export type CompareBase = 'original' | 'unfiltered';

/** The mattes of a photo: the person, the heads inside it, and the opening of the mouths when one is open. */
export interface PhotoMattes {
  person: Uint8Array;
  head: Uint8Array;
  mouth: Uint8Array | null;
  /** How far each cell is from what covers the body. Null when nothing says, and the body then stays where it is. */
  cover: Uint8Array | null;
}

/** How far around a mouth its lips can move, as a share of the span of the heads. */
const MOUTH_REACH = 0.07;

/** A length that goes with the size of the heads of a photo, in cells: the side of a square with their area. */
export function headSpan(head: Uint8Array): number {
  let area = 0;
  for (let i = 0; i < head.length; i++) if (head[i] > 127) area++;
  return Math.sqrt(area);
}

/** A stroke from code, in the terms of a stroke of the person. */
export interface FieldStroke {
  /** push, bloat, pinch or restore. */
  mode: string;
  /** As the size of the brush: a share of the long side. */
  radius: number;
  /** 0..1. */
  strength: number;
  /** Points in image UV. A point repeated is one more dab where it stands, as holding the pointer still. */
  path: readonly (readonly [number, number])[];
}

/**
 * A displacement from code: strokes, or a function for what no stroke draws. `offset` gives, for a point
 * of the output in UV, how far away in UV to read the photo. It goes on top of what the field holds.
 */
export type FieldScript =
  | { strokes: readonly FieldStroke[] }
  | { offset(u: number, v: number): readonly [number, number]; area?: { u0: number; v0: number; u1: number; v1: number } };

export type { ShapeSource } from './face/fieldwork';

/** What the liquify module provides once loaded. */
export interface FieldController {
  tex: Tex;
  /** The brush alone: what may move a background, which no slider moves. */
  readonly brushTex: Tex;
  /** The share of the sliders that shapes the lips, while there is one. */
  readonly lipTex: Tex | null;
  /** The share of the sliders that moves a head alone, while there is one. A body is read without it. */
  readonly headTex: Tex | null;
  lookup(u: number, v: number): [number, number];
  begin(mode: string, radius: number, strength: number): void;
  stroke(u: number, v: number): void;
  end(): HistoryEntry | null;
  /** Runs a script at once and returns its undo step, or null when it changed nothing. Not during a stroke. */
  apply(script: FieldScript, label: string): HistoryEntry | null;
  isEmpty(): boolean;
  /** No stroke of the brush holds anything. */
  brushEmpty(): boolean;
  /** The strokes of the brush. */
  serialize(): Float32Array;
  restore(data: Float32Array): void;
  /** Works out again what the document asks for. Null takes it off. */
  setShape(source: ShapeSource | null): void;
  /** What the document asks for as it stands, for saving, so a project opens with no detector. */
  shapeData(): Float32Array | null;
  restoreShape(data: Float32Array | null): void;
  /** Puts a field worked out elsewhere in place of the shape. Null takes it off. */
  setShapeGrids(grids: FieldGrids | null): void;
  /** Shows a rough field on the GPU while the finished one is on its way. `setShapeGrids` or `setShape` follows. */
  showRoughGrids(grids: FieldGrids): void;
  /** The size of the grid, which a field worked out elsewhere must have. */
  readonly gridSize: { w: number; h: number };
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
  /** The finished field of a face slider is on its way, or no longer. The photo shows a rough one meanwhile. */
  shaping(pending: boolean): void;
  /** The same, for an effect of Brincar. */
  funShaping(pending: boolean): void;
}

/** Takes empty parts of Brincar out of the document, so a project with nothing playful left has no trace of it. */
function tidyFun(doc: EditDoc): void {
  const fun = doc.fun;
  if (!fun) return;
  if (fun.faces) {
    fun.faces = fun.faces.filter((f) => Object.keys(f.values).length);
    if (!fun.faces.length) delete fun.faces;
  }
  if (fun.stickers && !fun.stickers.length) delete fun.stickers;
  if (!fun.faces && !fun.stickers) delete doc.fun;
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
  /** Draws a thin line along the edge of the heads, the part the sliders move. Only the on-screen pass draws it. */
  showMatteLine = false;
  /** The mask of the open tool comes from the detector: a drag moves the photo and paints nothing. */
  brushOff = false;
  /** The automatic mode of Manchas is going over the spots. The healing brush waits for it. */
  private healingSpots = false;
  /** While set, strokes wait and the person reads this instead. */
  holdStroke: string | null = null;
  exporting = false;
  /** Changes whenever the liquify field changes, so autosave knows when to write it. */
  fieldRev = 0;
  /** The faces the sliders hold on to. Empty on a reopened project until the menu looks for them. */
  shapeFaces: readonly Face[] = [];
  /** The same faces as plain data, for a worker, and which list they were made from. */
  private plainFaces: { of: readonly Face[]; faces: Face[] } | null = null;
  /** The workers of the field of the face sliders. Null before the first live slider, or where none can run. */
  private shaper: FieldWorkers | null = null;
  /** No worker could start or one failed: the page works the field out by itself from here on. */
  private shaperOff = false;
  /** The finished field of a face slider is on its way, and the photo shows a rough one meanwhile. */
  shapePending = false;
  /** The newest field the workers gave, put in place on the next frame, so a frame never takes two. */
  private nextField: { frame: FieldFrame; raf: number } | null = null;
  /** The photo with nobody in it and with no head in it, while the mattes exist. */
  private plates: { w: number; h: number; span: number; back: { data: Uint8Array; tex: Tex }; head: { data: Uint8Array; tex: Tex }; way: Tex | null; mattes: { person: Uint8Array; head: Uint8Array } } | null = null;
  /** Counts the times the layers were set, so work done for older ones is not taken for these. */
  private layersRev = 0;
  /** Brincar: its own field and the art of its stickers. Null until its menu, or a project with it, loads it. */
  fun: FunController | null = null;
  /** The faces the effects of Brincar hold on to. Empty on a reopened project until the menu looks for them. */
  funFaces: readonly Face[] = [];
  /** Changes whenever the field of Brincar changes, so autosave knows when to write it. */
  funRev = 0;
  /** The finished field of an effect of Brincar is on its way. */
  funPending = false;
  /** The workers of the field of Brincar, apart from those of the face menu. */
  private funWorkers: FieldWorkers | null = null;
  private funWorkersOff = false;
  private nextFun: { frame: FieldFrame; raf: number } | null = null;
  private funPlain: { of: readonly Face[]; faces: Face[] } | null = null;
  /** Luzes: the scene of the photo, once something asked for it. It comes from the photo and no edit changes it. */
  scene: SceneData | null = null;
  private sceneTex: Tex | null = null;
  /** Changes whenever the scene does, so autosave knows when to write it. */
  sceneRev = 0;
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
    this.shaper?.jobs.cancel();
    this.dropNextField();
    this.funWorkers?.jobs.cancel();
    this.dropNextFun();
    this.fun?.destroy();
    this.fun = null;
    this.funFaces = [];
    this.stopFlight();
    this.stopReveal();
    cancelAnimationFrame(this.frame);
    this.needsRender = false;
    this.dropRoi();
    this.ctx?.destroy();
    this.dropPlate();
    if (this.sceneTex) this.glc.destroyTex(this.sceneTex);
    this.sceneTex = null;
    this.scene = null;
    this.masks?.destroy();
    this.field?.destroy();
    this.glc.drainPool();
    this.source?.close();
    this.ctx = null;
    this.masks = null;
    this.pipeline = null;
    this.source = null;
    this.field = null;
    this.shapeFaces = [];
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
    this.shaper?.destroy();
    this.shaper = null;
    this.funWorkers?.destroy();
    this.funWorkers = null;
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
    this.shaper?.jobs.cancel();
    this.dropNextField();
    this.field = field;
    if (this.pipeline) this.pipeline.field = field;
  }

  /** Something of Brincar arrived that the photo shows, as the art of a sticker: draw again. */
  refreshFun(): void {
    this.ctx?.invalidate('global');
    this.dropRoi();
    this.requestRender();
  }

  /** Brincar is loaded: from here on the develop stage reads its field and draws its stickers. */
  registerFun(fun: FunController): void {
    this.funWorkers?.jobs.cancel();
    this.dropNextFun();
    this.fun?.destroy();
    this.fun = fun;
    if (!this.pipeline) return;
    this.pipeline.fun = {
      get tex() {
        return fun.isEmpty() ? null : fun.tex;
      },
      get alone() {
        return !fun.isEmpty() && fun.alone;
      },
      draws: (ctx) => this.stickerDraws(ctx),
    };
  }

  /* The lock of the background */

  /**
   * The mattes of the photo came, or no person was found. From here on warps move each layer alone: the
   * sliders the head, the brush the person. The plates start as a quick guess, good enough to move a slider
   * right away, and `setPlate` brings the finished ones when the completion is done.
   */
  setLayers(mattes: PhotoMattes | null): void {
    const { masks, source, pipeline, glc } = this;
    if (!masks || !source || !pipeline) return;
    this.dropPlate();
    if (mattes) {
      const { w, h } = masks;
      masks.write(PERSON_MASK, mattes.person);
      masks.write(HEAD_MASK, mattes.head);
      if (mattes.mouth) masks.write(MOUTH_MASK, mattes.mouth);
      else masks.clear(MOUTH_MASK);
      if (mattes.cover) masks.write(COVER_MASK, mattes.cover);
      else masks.clear(COVER_MASK);
      const photo = source.draw(0, 0, source.w, source.h, w, h).getContext('2d')!.getImageData(0, 0, w, h).data;
      const back = buildPlate(photo, mattes.person, w, h);
      // Beside a head there is background, and under it a body, whose shadows are its own.
      const open = new Uint8Array(w * h);
      for (let i = 0; i < open.length; i++) open[i] = mattes.person[i] ? 0 : 1;
      const head = buildPlate(photo, mattes.head, w, h, open);
      const span = headSpan(mattes.head);
      if (mattes.mouth) extendMouth(head, photo, mattes.mouth, w, h, span * MOUTH_REACH);
      const tex = (data: Uint8Array) => {
        const t = glc.createTex(w, h, 'rgba8', { noTarget: true });
        glc.upload(t, { x: 0, y: 0, w, h }, data);
        return t;
      };
      // Which way what covers the body is. Worked out from its matte each time, so a project saves the matte alone.
      let way: Tex | null = null;
      if (mattes.cover) {
        way = glc.createTex(w, h, 'rg16f', { noTarget: true });
        glc.upload(way, { x: 0, y: 0, w, h }, coverWay(mattes.cover, w, h));
      }
      this.plates = { w, h, span, back: { data: back, tex: tex(back) }, head: { data: head, tex: tex(head) }, way, mattes: { person: mattes.person, head: mattes.head } };
      pipeline.lock = {
        person: masks.get(PERSON_MASK)!,
        head: masks.get(HEAD_MASK)!,
        mouth: mattes.mouth ? masks.get(MOUTH_MASK) : null,
        cover: mattes.cover ? masks.get(COVER_MASK) : null,
        coverWay: way,
        plateBack: this.plates.back.tex,
        plateHead: this.plates.head.tex,
      };
    } else {
      for (const id of PHOTO_MASKS) masks.clear(id);
    }
    this.layersRev++;
    this.ctx?.invalidate('global');
    this.requestRender();
    this.emit('change');
  }

  /** Builds the layers from the mattes in the store, as when a saved project opens. */
  async refreshLock(): Promise<void> {
    const { masks } = this;
    if (!masks?.get(PERSON_MASK)) return;
    const person = await masks.read(PERSON_MASK);
    if (!person || !person.some((v) => v > 0)) return;
    const head = masks.get(HEAD_MASK) ? await masks.read(HEAD_MASK) : null;
    const mouth = masks.get(MOUTH_MASK) ? await masks.read(MOUTH_MASK) : null;
    // A project saved before the body went along with the face has no such matte, and opens as it was saved.
    const cover = masks.get(COVER_MASK) ? await masks.read(COVER_MASK) : null;
    this.setLayers({ person, head: head ?? person, mouth: mouth?.some((v) => v > 0) ? mouth : null, cover });
  }

  /** The plates as they stand, for the completion to work on. Null when the photo has no layers. */
  plateData(): { w: number; h: number; span: number; back: Uint8Array; head: Uint8Array; personMatte: Uint8Array; headMatte: Uint8Array; rev: number } | null {
    const p = this.plates;
    return p ? { w: p.w, h: p.h, span: p.span, back: p.back.data, head: p.head.data, personMatte: p.mattes.person, headMatte: p.mattes.head, rev: this.layersRev } : null;
  }

  /** A plate changed: the completion finished a part of it. `rev` is what `plateData` gave, so a stale answer is dropped. */
  setPlate(which: 'back' | 'head', data: Uint8Array, rev: number): void {
    const p = this.plates;
    if (!p || rev !== this.layersRev) return;
    p[which].data = data;
    this.glc.upload(p[which].tex, { x: 0, y: 0, w: p.w, h: p.h }, data);
    this.ctx?.invalidate('global');
    this.dropRoi();
    this.requestRender();
  }

  private dropPlate(): void {
    if (this.plates) {
      this.glc.destroyTex(this.plates.back.tex);
      this.glc.destroyTex(this.plates.head.tex);
      if (this.plates.way) this.glc.destroyTex(this.plates.way);
    }
    this.plates = null;
    if (this.pipeline) this.pipeline.lock = null;
  }

  /** The matte is on, and warps leave the background where it is. */
  get locking(): boolean {
    return !!this.pipeline?.lock;
  }

  /** The layers know what of the body goes along with a face. False for the layers of an older project. */
  get following(): boolean {
    return !!this.pipeline?.lock?.cover;
  }

  /** The brush may move the background too, as one undo step. Takes effect at once, for what is already there. */
  setBrushFree(free: boolean): void {
    this.applyPatch('Fundo', (doc) => {
      if (free) doc.unlocked = true;
      else delete doc.unlocked;
    });
    this.ctx?.invalidate('global');
    this.requestRender();
  }

  /* The shape of the faces */

  /** Works out the field again from the numbers in the document, at once. The strokes of the brush stay on top. */
  syncShape(): void {
    const { field, doc } = this;
    if (!field) return;
    // Whatever the workers still had for an older value is dropped: this is the field now.
    this.shaper?.jobs.cancel();
    this.dropNextField();
    const source = this.shapeSource();
    if (source === null) {
      field.setShape(null);
    } else if (source) {
      field.setShape(source);
    }
    // A reopened project with no faces yet keeps what it saved, which is the same field.
    doc.hasField = !field.isEmpty();
    this.fieldRev++;
    this.ctx?.invalidate('global');
    this.requestRender();
  }

  /** What the document asks of the field. Null when nothing, undefined when the faces are not known yet. */
  private shapeSource(): ShapeSource | null | undefined {
    const { doc } = this;
    const shapes = (doc.shapes ?? []).filter((s) => Object.values(s.values).some((v) => v !== 0));
    if (doc.shapeAmount === undefined && !shapes.length) return null;
    if (!this.shapeFaces.length) return undefined;
    if (this.plainFaces?.of !== this.shapeFaces) this.plainFaces = { of: this.shapeFaces, faces: JSON.parse(JSON.stringify(this.shapeFaces)) as Face[] };
    return { amount: doc.shapeAmount, shapes: clone(shapes), off: [...(doc.shapesOff ?? [])], faces: this.plainFaces.faces, w: doc.width, h: doc.height };
  }

  /**
   * Works out the field again away from the page, while a slider moves. The photo shows a rough field at once
   * and the finished one when it is done; until then `shapePending` is set. A newer value drops what an older
   * one had left to do. Where no worker runs, this is `syncShape`.
   */
  private syncShapeLater(): void {
    const { field } = this;
    if (!field) return;
    const source = this.shapeSource();
    const jobs = source ? this.fieldJobs(field) : null;
    if (!source || !jobs) {
      this.syncShape();
      return;
    }
    jobs.request(source);
  }

  private fieldJobs(field: FieldController) {
    if (this.shaperOff) return null;
    this.shaper ??= createFieldJobs({
      show: (frame) => this.queueField(frame),
      busy: (pending) => {
        // The finished field is in hand once it is on the photo, not when the workers let it go.
        if (!pending && this.nextField) return;
        this.setShapePending(pending);
      },
      failed: () => {
        this.shaperOff = true;
        this.shaper?.destroy();
        this.shaper = null;
        this.syncShape();
      },
    });
    if (!this.shaper) {
      this.shaperOff = true;
      return null;
    }
    this.shaper.setGrid(field.gridSize.w, field.gridSize.h);
    return this.shaper.jobs;
  }

  private setShapePending(pending: boolean): void {
    if (this.shapePending === pending) return;
    this.shapePending = pending;
    this.emit('shaping', pending);
  }

  private queueField(frame: FieldFrame): void {
    if (this.nextField) {
      this.nextField.frame = frame;
      return;
    }
    this.nextField = { frame, raf: requestAnimationFrame(() => this.flushField()) };
  }

  private dropNextField(): void {
    if (!this.nextField) return;
    cancelAnimationFrame(this.nextField.raf);
    this.nextField = null;
    if (!this.shaper?.jobs.busy) this.setShapePending(false);
  }

  /** Puts the newest field from the workers on the photo now. */
  private flushField(): void {
    const next = this.nextField;
    if (!next) return;
    cancelAnimationFrame(next.raf);
    this.nextField = null;
    this.showField(next.frame);
    if (!next.frame.rough && !this.shaper?.jobs.busy) this.setShapePending(false);
  }

  private showField(frame: FieldFrame): void {
    const { field, doc } = this;
    if (!field) return;
    if (frame.rough && frame.grids) {
      field.showRoughGrids(frame.grids);
      doc.hasField = true;
    } else {
      field.setShapeGrids(frame.grids);
      doc.hasField = !field.isEmpty();
    }
    // Only the finished field counts as a change of the field, for autosave and for the undo.
    if (!frame.rough) this.fieldRev++;
    this.ctx?.invalidate('global');
    this.requestRender();
    if (!frame.rough) this.emit('change');
  }

  /** Resolves once the field shows what the document asks for, finished. */
  async shapeReady(): Promise<void> {
    await this.shaper?.jobs.idle();
    this.flushField();
  }

  /**
   * Change of a slider of a face. `live` while a finger is on it: the field follows away from the page, and the
   * photo shows a rough field meanwhile. Call `commit` when the gesture ends.
   */
  setShapeValue(at: readonly [number, number], id: string, value: number, live = false): void {
    this.track('Formato do rosto');
    const shapes = (this.doc.shapes ??= []);
    let shape = shapes.find((s) => s.at[0] === at[0] && s.at[1] === at[1]);
    if (!shape) {
      shape = { at: [at[0], at[1]], values: {} };
      shapes.push(shape);
    }
    if (value === 0) delete shape.values[id];
    else shape.values[id] = value;
    if (live) this.syncShapeLater();
    else this.syncShape();
    this.emit('change');
  }

  /** Change of the strength of the automatic mode, `live` as for `setShapeValue`. Call `commit` when the gesture ends. */
  setShapeAmount(amount: number, live = false): void {
    this.track('Automático');
    this.doc.shapeAmount = amount;
    if (live) this.syncShapeLater();
    else this.syncShape();
  }

  /** Turns a section of the sliders off or on, as one undo step. The numbers stay. */
  setShapeSectionOff(section: 'face' | 'eyes' | 'nose', off: boolean): void {
    this.applyPatch(off ? 'Limpar' : 'Formato do rosto', (doc) => {
      const list = (doc.shapesOff ?? []).filter((s) => s !== section);
      if (off) list.push(section);
      if (list.length) doc.shapesOff = list;
      else delete doc.shapesOff;
    });
    this.syncShape();
  }

  /* Brincar */

  /** What the document asks of the field of Brincar. Null when nothing, undefined when the faces are not known yet. */
  private funSource(): FunSource | null | undefined {
    const { doc } = this;
    const shapes = (doc.fun?.faces ?? []).filter((s) => Object.values(s.values).some((v) => v > 0));
    if (!shapes.length) return null;
    if (!this.funFaces.length) return undefined;
    if (this.funPlain?.of !== this.funFaces) this.funPlain = { of: this.funFaces, faces: JSON.parse(JSON.stringify(this.funFaces)) as Face[] };
    return { kind: 'fun', shapes: clone(shapes), faces: this.funPlain.faces, w: doc.width, h: doc.height };
  }

  /** Works the field of Brincar out again from the numbers in the document, at once. */
  syncFun(): void {
    const { fun } = this;
    if (!fun) return;
    this.funWorkers?.jobs.cancel();
    this.dropNextFun();
    const source = this.funSource();
    // A reopened project with no faces yet keeps the field it saved, which is the same.
    if (source !== undefined) fun.setSource(source);
    this.funRev++;
    this.ctx?.invalidate('global');
    this.dropRoi();
    this.requestRender();
  }

  /** As `syncShapeLater`, for Brincar: a rough field at once, the finished one from the workers. */
  private syncFunLater(): void {
    const { fun } = this;
    if (!fun) return;
    const source = this.funSource();
    const jobs = source ? this.funJobs(fun) : null;
    if (!source || !jobs) {
      this.syncFun();
      return;
    }
    jobs.request(source);
  }

  private funJobs(fun: FunController) {
    if (this.funWorkersOff) return null;
    this.funWorkers ??= createFieldJobs(
      {
        show: (frame) => {
          if (this.nextFun) this.nextFun.frame = frame;
          else this.nextFun = { frame, raf: requestAnimationFrame(() => this.flushFun()) };
        },
        busy: (pending) => {
          if (!pending && this.nextFun) return;
          this.setFunPending(pending);
        },
        failed: () => {
          this.funWorkersOff = true;
          this.funWorkers?.destroy();
          this.funWorkers = null;
          this.syncFun();
        },
      },
      2,
    );
    if (!this.funWorkers) {
      this.funWorkersOff = true;
      return null;
    }
    this.funWorkers.setGrid(fun.gridSize.w, fun.gridSize.h);
    return this.funWorkers.jobs;
  }

  private setFunPending(pending: boolean): void {
    if (this.funPending === pending) return;
    this.funPending = pending;
    this.emit('funShaping', pending);
  }

  private dropNextFun(): void {
    if (!this.nextFun) return;
    cancelAnimationFrame(this.nextFun.raf);
    this.nextFun = null;
    if (!this.funWorkers?.jobs.busy) this.setFunPending(false);
  }

  private flushFun(): void {
    const next = this.nextFun;
    if (!next) return;
    cancelAnimationFrame(next.raf);
    this.nextFun = null;
    this.fun?.setGrids(next.frame.grids);
    if (!next.frame.rough) this.funRev++;
    this.ctx?.invalidate('global');
    this.dropRoi();
    this.requestRender();
    if (!next.frame.rough) {
      if (!this.funWorkers?.jobs.busy) this.setFunPending(false);
      this.emit('change');
    }
  }

  /** Resolves once the field of Brincar shows what the document asks for, finished. */
  async funReady(): Promise<void> {
    await this.funWorkers?.jobs.idle();
    this.flushFun();
  }

  /** The strength of an effect of Brincar on a face, 0..100, `live` as for `setShapeValue`. Call `commit` when the gesture ends. */
  setFunValue(at: readonly [number, number], id: string, value: number, live = false): void {
    this.track('Brincar');
    const fun = (this.doc.fun ??= {});
    const faces = (fun.faces ??= []);
    let face = faces.find((s) => s.at[0] === at[0] && s.at[1] === at[1]);
    if (!face) {
      face = { at: [at[0], at[1]], values: {} };
      faces.push(face);
    }
    if (value > 0) face.values[id] = value;
    else delete face.values[id];
    tidyFun(this.doc);
    if (live) this.syncFunLater();
    else this.syncFun();
    this.emit('change');
  }

  /** Puts a sticker on the photo, as one undo step. Returns its id. */
  addSticker(sticker: Omit<StickerState, 'id'>): number {
    this.commit();
    this.track('Adesivo');
    const list = ((this.doc.fun ??= {}).stickers ??= []);
    const id = list.reduce((m, s) => Math.max(m, s.id), 0) + 1;
    list.push({ ...sticker, id });
    this.commit();
    this.ctx?.invalidate('global');
    this.requestRender();
    return id;
  }

  /** Moves, turns or resizes a sticker. A gesture is one undo step: call `commit` when it ends. */
  changeSticker(id: number, patch: Partial<Pick<StickerState, 'x' | 'y' | 'size' | 'angle'>>): void {
    const sticker = this.doc.fun?.stickers?.find((s) => s.id === id);
    if (!sticker) return;
    this.track('Adesivo');
    Object.assign(sticker, patch);
    this.ctx?.invalidate('global');
    this.dropRoi();
    this.requestRender();
    this.emit('change');
  }

  /** Takes a sticker off, as one undo step. */
  removeSticker(id: number): void {
    const list = this.doc.fun?.stickers;
    if (!list?.some((s) => s.id === id)) return;
    this.commit();
    this.track('Tirar adesivo');
    this.doc.fun!.stickers = list.filter((s) => s.id !== id);
    tidyFun(this.doc);
    this.commit();
    this.ctx?.invalidate('global');
    this.requestRender();
  }

  /** Puts a sticker over all the others, as one undo step. Stickers draw in the order of their list. */
  raiseSticker(id: number): void {
    const list = this.doc.fun?.stickers;
    const at = list?.findIndex((s) => s.id === id) ?? -1;
    if (!list || at < 0 || at === list.length - 1) return;
    this.commit();
    this.track('Trazer adesivo para frente');
    const [sticker] = list.splice(at, 1);
    list.push(sticker);
    this.commit();
    this.ctx?.invalidate('global');
    this.requestRender();
  }

  /** How far away a point shown at `u, v` reads the head under it: Brincar first, then the realistic field. */
  headLookup(): Lookup | null {
    const fun = this.fun && !this.fun.isEmpty() ? this.fun : null;
    const field = this.doc.hasField && this.field ? this.field : null;
    if (!fun && !field) return null;
    return (u, v) => {
      const [fu, fv] = fun ? fun.lookup(u, v) : [0, 0];
      const [du, dv] = field ? field.lookup(u + fu, v + fv) : [0, 0];
      return [fu + du, fv + dv];
    };
  }

  /** Every sticker where it shows now, after the warps, in the order they were put on. */
  shownStickers(): { sticker: StickerState; shown: ShownSticker; aspect: number }[] {
    const list = this.doc.fun?.stickers ?? [];
    if (!list.length) return [];
    const lookup = this.headLookup();
    const { width, height } = this.doc;
    return list.map((sticker) => ({ sticker, shown: shownSticker(sticker, width, height, lookup), aspect: this.fun?.aspectOf(sticker.kind) ?? 1 }));
  }

  /** The stickers on a context, for the develop stage: art at the size they have there, and their box. */
  private stickerDraws(ctx: RenderContext): StickerDraw[] {
    const fun = this.fun;
    if (!fun) return [];
    const { width, height } = this.doc;
    const long = Math.max(width, height);
    const kx = width / long;
    const ky = height / long;
    const [rx, ry, rw, rh] = ctx.regionUv;
    const draws: StickerDraw[] = [];
    for (const { sticker, shown, aspect } of this.shownStickers()) {
      const wide = shown.size * ctx.longSide;
      const art = fun.art(sticker.kind, aspect <= 1 ? wide : wide * aspect);
      if (!art || !(shown.size > 0)) continue;
      const c = Math.cos(shown.angle);
      const s = Math.sin(shown.angle);
      const sw = shown.size;
      const sh = shown.size * aspect;
      // From an offset in UV to the frame of the sticker, then to the UV of its art.
      const rowX: [number, number] = [(c * kx) / sw, (s * ky) / sw];
      const rowY: [number, number] = [(-s * kx) / sh, (c * ky) / sh];
      // The box, from the four corners, in pixels of the context, with a pixel to spare.
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as const) {
        const u = shown.x + (a * sw * c - b * sh * s) / kx;
        const v = shown.y + (a * sw * s + b * sh * c) / ky;
        const px = ((u - rx) / rw) * ctx.w;
        const py = ((v - ry) / rh) * ctx.h;
        x0 = Math.min(x0, px);
        y0 = Math.min(y0, py);
        x1 = Math.max(x1, px);
        y1 = Math.max(y1, py);
      }
      const bx = Math.max(0, Math.floor(x0) - 1);
      const by = Math.max(0, Math.floor(y0) - 1);
      const bx1 = Math.min(ctx.w, Math.ceil(x1) + 1);
      const by1 = Math.min(ctx.h, Math.ceil(y1) + 1);
      if (bx1 <= bx || by1 <= by) continue;
      draws.push({ art, center: [shown.x, shown.y], rowX, rowY, rect: { x: bx, y: by, w: bx1 - bx, h: by1 - by } });
    }
    return draws;
  }

  /** The art of every sticker at the size it has on a context of this scale, as the export needs it. */
  async stickersReady(scale: number): Promise<void> {
    const fun = this.fun;
    if (!fun) return;
    const long = Math.max(this.doc.width, this.doc.height) * scale;
    await fun.artReady(this.shownStickers().map(({ sticker, shown, aspect }) => ({ kind: sticker.kind, px: shown.size * long * Math.max(1, aspect) })));
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

  /* Luzes */

  /**
   * The scene of the photo came: where the person, the skin and the hair are. From here on a light of Luzes
   * has where to fall. Null takes the scene away.
   */
  setScene(scene: SceneData | null): void {
    const { glc, pipeline } = this;
    if (this.sceneTex) glc.destroyTex(this.sceneTex);
    this.sceneTex = null;
    this.scene = scene;
    if (scene) {
      this.sceneTex = glc.createTex(scene.w, scene.h, 'rgba8', { mips: true });
      glc.upload(this.sceneTex, { x: 0, y: 0, w: scene.w, h: scene.h }, scene.data);
      glc.generateMips(this.sceneTex);
    }
    if (pipeline) pipeline.scene = scene && this.sceneTex ? { tex: this.sceneTex, stats: scene.stats } : null;
    this.sceneRev++;
    this.ctx?.invalidate('global');
    this.dropRoi();
    this.requestRender();
    this.emit('change');
  }

  /**
   * Puts a light of Luzes on the photo, or takes it off with null. Live: call `commit` when the gesture ends.
   * A light that prints the date keeps the date it went on with.
   */
  setLight(id: string | null, intensity = 1, stamp?: string): void {
    this.track('Luz');
    if (id) this.doc.light = { id, intensity, ...(stamp ? { stamp } : {}) };
    else delete this.doc.light;
    this.ctx?.invalidate('global');
    this.dropRoi();
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
      (!!scope.field && (doc.hasField || !!doc.shapes?.some((s) => Object.keys(s.values).length))) ||
      (!!scope.liquify && (doc.shapeAmount !== undefined || (!!this.field && !this.field.brushEmpty()))) ||
      (!!scope.fun && !!(doc.fun?.faces?.length || doc.fun?.stickers?.length)) ||
      (!!scope.adjust && Object.values(doc.adjust).some((v) => v !== 0)) ||
      (!!scope.filter && (!!doc.filter.id || !!doc.filter.masked)) ||
      (!!scope.light && !!doc.light) ||
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
    const strokes = scope.field || scope.liquify;
    const field = strokes && this.field && !this.field.brushEmpty() ? this.field.serialize().slice() : null;
    // A reopened project has no faces yet, so the undo brings back what it opened with instead of working it out.
    const shapeField = strokes ? (this.field?.shapeData()?.slice() ?? null) : null;
    // As for the shape: what a reopened project opened with, for an undo before the faces are known.
    const funField = scope.fun ? (this.fun?.data()?.slice() ?? null) : null;
    const before = clone(this.doc);
    const after = clone(this.doc);
    if (scope.fun) delete after.fun;
    for (const id of ids) {
      after.layers[id] = { enabled: true, painted: false, params: { ...(this.toolDefaults.get(id) ?? after.layers[id]!.params) } };
    }
    if (scope.heals) after.heals = [];
    if (strokes) delete after.shapeAmount;
    if (scope.field) {
      after.hasField = false;
      delete after.shapes;
      delete after.shapesOff;
    }
    if (scope.adjust) after.adjust = { ...DEFAULT_ADJUST };
    if (scope.filter) after.filter = { id: null, intensity: 1 };
    if (scope.light) delete after.light;
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
      if (strokes && this.field) {
        this.field.restore(back && field ? field : new Float32Array(this.field.serialize().length));
        this.fieldRev++;
      }
      if (strokes) this.syncShape();
      if (strokes && back && shapeField && !this.shapeFaces.length) {
        this.field?.restoreShape(shapeField);
        this.doc.hasField = true;
      }
      if (scope.fun && this.fun) {
        if (!back) this.fun.restore(null);
        else if (this.funFaces.length) this.syncFun();
        else this.fun.restore(funField);
        this.funRev++;
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
      for (const id of Object.keys(current.layers) as LayerId[]) {
        const layer = next.layers[id];
        if (layer) layer.painted = current.layers[id]!.painted;
        else next.layers[id] = current.layers[id];
      }
      this.doc = next;
      // Numbers of the shape come from the snapshot, and the field follows them. So do those of Brincar.
      this.syncShape();
      this.syncFun();
      if (!this.field) next.hasField = current.hasField;
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

  /** A point of the photo as it shows, past every warp, in image UV, to CSS pixels on the canvas. */
  shownToCss(u: number, v: number): [number, number] {
    const [s, t] = applyMat3(imageToOutput(this.displayCrop(), this.doc.width, this.doc.height), u, v);
    return this.outputToCss(s, t);
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

  /**
   * Applies a displacement from code as one undo step, as a stroke of the person would. Needs the field
   * loaded (`ensureField`) and no stroke going on. False when there was nothing to do.
   */
  applyFieldScript(script: FieldScript, label = 'Liquify'): boolean {
    const field = this.field;
    if (!field || this.stroke) return false;
    this.commit();
    const entry = field.apply(script, label);
    if (!entry) return false;
    this.doc.hasField = !field.isEmpty();
    this.ctx?.invalidate('global');
    this.requestRender();
    this.history.push(this.withFieldFlags(entry));
    return true;
  }

  private withFieldFlags(entry: HistoryEntry): HistoryEntry {
    this.fieldRev++;
    const refresh = () => {
      this.fieldRev++;
      this.doc.hasField = !!this.field && !this.field.isEmpty();
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
      // The update above leaves nothing marked to redraw, so the detail kept for a zoomed view would
      // stay healed. With no spot to heal, or none that holds, the photo would keep showing them.
      this.dropRoi();
      this.unfilteredFresh = false;
      this.requestRender();
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

  /**
   * Takes one healed spot back to the photo, as one undo step, and keeps the others. False when it is
   * no longer there or the automatic mode is still healing. Ids may repeat after a project is reopened,
   * so the op itself says which one.
   */
  removeHeal(op: HealOp): boolean {
    if (this.healingSpots || this.stroke) return false;
    const before = this.doc.heals.slice();
    const after = before.filter((other) => other !== op);
    if (after.length === before.length) return false;
    this.commit();
    const set = (list: HealOp[]) => {
      this.doc.heals = list.slice();
      this.ctx?.invalidate('healed');
      this.requestRender();
    };
    set(after);
    this.history.push({
      label: 'Tirar correção',
      bytes: 128 + (before.length + after.length) * 96,
      undo: () => set(before),
      redo: () => set(after),
    });
    return true;
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
    const matte = this.showMatteLine ? masks.get(HEAD_MASK) : null;
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
        uMatteLine: !!matte,
        uMatte: matte ?? ctx.source,
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
