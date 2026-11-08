/**
 * Finding faces, for the filter and for the tools that stay on eyes, teeth or hair. The detector code
 * loads here, on the first request. Faces and hair stay in memory for the open photo and never reach
 * the saved project.
 */

import type { Params } from '../core/doc';
import type { Engine } from '../core/engine';
import type { FaceScan } from '../core/face/detector';
import { focusPoints } from '../core/face/focus';
import { addHair, faceSize, hairCrop, lengthenable } from '../core/face/hair';
import { buildFaceMask, type MaskTarget, type Point } from '../core/face/mask';
import { buildRegionMask, type FaceRegion } from '../core/face/regions';
import { CHIN, type Face } from '../core/face/scan';
import { nextPaint, type Stage } from '../core/progress';
import { toolById } from '../tools/catalog';
import type { SourceImage } from '../core/source';
import { showRegion, stopRegionShow } from './regionshow.svelte';
import { bump, engine, hasEngine, toast, ui } from './state.svelte';
import { Task } from './task.svelte';

/** Starting softness of the edge. Tuned on real photos with a black and white filter. */
const FACE_FEATHER = 25;

/** Size given to a hand-painted area, for the softness slider. */
const PAINTED_REACH = 0.25;

/** Without a face, the hair segmenter looks at the whole photo as if the face took this share of it. */
const WHOLE_PHOTO_FACE = 0.3;

const SCAN: Stage = { id: 'scan', label: 'Procurando rostos', weight: 32 };
const HAIR: Stage = { id: 'hair', label: 'Achando os fios', weight: 30 };

/** The steps of a search. The downloads happen once, and the hair segmenter only for the hair tools. */
function stagesFor(hair: boolean): Stage[] {
  const list: Stage[] = [];
  if (!detectorStarted) {
    list.push({ id: 'download', label: 'Baixando o detector', weight: 62 }, { id: 'start', label: 'Ligando o detector', weight: 6, estimate: 400 });
  } else if (hair && !hairStarted) {
    list.push(
      { id: 'download', label: 'Baixando o detector de cabelo', weight: 20 },
      { id: 'start', label: 'Ligando o detector de cabelo', weight: 6, estimate: 300 },
    );
  }
  list.push(SCAN);
  if (hair) list.push(HAIR);
  return list;
}

/** What the first search still has to download, in the words of the progress card. */
function downloadNote(hair: boolean): string {
  const size = !detectorStarted ? (hair ? 'cerca de 7 MB' : 'cerca de 6 MB') : hair && !hairStarted ? 'menos de 1 MB' : '';
  return size ? `Só na primeira vez, ${size}. A foto não sai do seu aparelho.` : '';
}

export const facePick = $state({
  /** The job on screen, while there is one. */
  task: null as Task | null,
  /** How much the job downloads, for the progress card. Empty when nothing. */
  download: '',
  faces: [] as Face[],
  /** A finer search is still possible. */
  more: false,
});

/** Words of each limit: the switch, the wait, and the note when the photo does not show that region. */
export const LIMIT_WORDS: Record<FaceRegion, { name: string; finding: string; missing: string }> = {
  iris: { name: 'Só na íris', finding: 'Procurando os olhos', missing: 'Não achei olhos abertos nesta foto.' },
  sclera: { name: 'Só no branco do olho', finding: 'Procurando os olhos', missing: 'Não achei olhos abertos nesta foto.' },
  teeth: { name: 'Só nos dentes', finding: 'Procurando os dentes', missing: 'Não achei dentes à mostra nesta foto.' },
  hair: { name: 'Só no cabelo', finding: 'Procurando o cabelo', missing: 'Não achei cabelo nesta foto.' },
};

/** Where each region is, in the words of the panel. */
export const PLACES: Record<FaceRegion, string> = { iris: 'nas íris', sclera: 'no branco dos olhos', teeth: 'nos dentes', hair: 'no cabelo' };

/** The hint of the panel in the automatic mode, which has no brush to talk about. */
export function autoHint(): string | null {
  const { region, mode, state } = toolLimit;
  if (!region || mode !== 'auto' || !['searching', 'on', 'off'].includes(state)) return null;
  return 'No Automático o efeito vai ' + PLACES[region] + ' sozinho. Ajuste nos controles.';
}

/** Where the brush of the open tool stands. It waits while `searching`, stays on the region when `on`, and the rest leave it free. */
export type LimitState = 'searching' | 'on' | 'off' | 'no-face' | 'no-region' | 'failed';

/**
 * Automatic fills the mask from the region in one undo step and keeps the brush away. Manual is the
 * brush and the eraser, starting from whatever the mask holds.
 */
export type ToolMode = 'auto' | 'manual';

export const toolLimit = $state({
  tool: null as string | null,
  region: null as FaceRegion | null,
  state: 'off' as LimitState,
  /** A whole stroke fell outside, so a face may have been left out. */
  missed: false,
  mode: 'auto' as ToolMode,
});

const scans = new WeakMap<SourceImage, FaceScan>();
/** Tools the person set free on this photo. Going back to one keeps it free. */
const freed = new Set<string>();
/** Tools that already showed where the brush reaches on this photo. */
const shown = new Set<string>();
/** The mode each tool had on this photo, so going back to a tool keeps it. */
const modes = new Map<string, ToolMode>();
/** The region of the open tool, kept to fill the mask with, and settings that come with it. */
let regionData: Uint8Array | null = null;
let regionParams: Params | undefined;
let detectorStarted = false;
let hairStarted = false;

/** The hair found on a photo, for one mask size and one list of faces. The five hair tools share it. */
interface HairFound {
  data: Uint8Array | null;
  spots: Point[][];
  faces: number;
  w: number;
}
const hairs = new WeakMap<SourceImage, HairFound>();
/** Changes to stop the search in progress. */
let current = 0;

function cancelSearch(): void {
  current++;
  facePick.task?.stop();
  facePick.task = null;
  ui.faceChoosing = false;
}

/** For the filter panel. A search that a brush tool started is not the panel's to stop. */
export function stopFaceSearch(): void {
  if (!toolLimit.region) cancelSearch();
}

/** No face to choose: the person paints the area, starting from an empty mask. */
export async function paintArea(e: Engine): Promise<void> {
  ui.faceChoosing = false;
  await e.replaceFilterMask('Filtro', null, { masked: true, feather: 0, reach: PAINTED_REACH });
  bump();
}

function openJob(hair = false): Task {
  const task = new Task(stagesFor(hair));
  facePick.task = task;
  facePick.download = downloadNote(hair);
  return task;
}

/**
 * Loads the detector if needed and goes through the photo. `hair` also loads the hair segmenter.
 * Returns null when the search was stopped.
 */
async function scanPhoto(source: SourceImage, task: Task, deeper: boolean, stopped: () => boolean, hair = false): Promise<FaceScan | null> {
  if (!detectorStarted || (hair && !hairStarted)) task.stage('download');
  const { FaceScan, loadDetector } = await import('../core/face/detector');
  await loadDetector(
    (fraction) => task.report(fraction),
    () => task.stage('start'),
    hair,
  );
  detectorStarted = true;
  if (hair) hairStarted = true;
  if (stopped()) return null;
  task.stage('scan');
  let scan = scans.get(source);
  if (!scan?.finished || deeper) {
    scan ??= new FaceScan(source);
    scans.set(source, scan);
    await scan.run((fraction) => task.report(fraction), stopped);
  }
  if (stopped()) return null;
  facePick.faces = scan.list;
  facePick.more = scan.more;
  return scan;
}

/** The photo as the mask grid sees it. */
function maskTarget(masks: NonNullable<Engine['masks']>, source: SourceImage): MaskTarget {
  const kx = source.w / masks.w;
  const ky = source.h / masks.h;
  return {
    w: masks.w,
    h: masks.h,
    luma: (a) => source.luma(a.x * kx, a.y * ky, a.w * kx, a.h * ky, a.w, a.h),
  };
}

/**
 * Asks the hair segmenter about the square around each face, or about the whole photo when there is no
 * face, and joins the answers. Returns null when the search was stopped.
 */
async function findHair(
  source: SourceImage,
  masks: NonNullable<Engine['masks']>,
  faces: readonly Face[],
  task: Task,
  stopped: () => boolean,
): Promise<HairFound | null> {
  const known = hairs.get(source);
  if (known && known.faces === faces.length && known.w === masks.w) return known;
  task.stage('hair');
  const { segmentHair } = await import('../core/face/detector');
  const target = maskTarget(masks, source);
  const kx = target.w / source.w;
  const ky = target.h / source.h;
  const crops = faces.length
    ? faces.map((f) => ({ area: hairCrop(f.box, source.w, source.h), size: faceSize(f.box, target.w, target.h) }))
    : [{ area: { x: 0, y: 0, w: source.w, h: source.h }, size: Math.max(target.w, target.h) * WHOLE_PHOTO_FACE }];
  const out = new Uint8Array(target.w * target.h);
  const spots: Point[][] = [];
  for (const [i, crop] of crops.entries()) {
    await nextPaint();
    if (stopped()) return null;
    const cut = segmentHair(source, crop.area);
    const { x, y, w, h } = crop.area;
    const box = addHair(out, target, { x: x * kx, y: y * ky, w: w * kx, h: h * ky }, cut, crop.size);
    if (box) spots.push(box);
    task.report((i + 1) / crops.length);
  }
  const found: HairFound = { data: spots.length ? out : null, spots, faces: faces.length, w: masks.w };
  hairs.set(source, found);
  return found;
}

/** Finds faces and shows the rings. With `deeper`, tries the next level of a finished search. */
export async function searchFaces(e: Engine, deeper = false): Promise<void> {
  const source = e.source;
  if (!source || facePick.task) return;
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  const task = openJob();
  ui.faceChoosing = false;
  try {
    const scan = await scanPhoto(source, task, deeper, stopped);
    if (!scan) return;
    if (scan.list.length) {
      ui.faceChoosing = true;
    } else {
      toast('Não achei rosto nesta foto. Pinte a área com o pincel.');
      await paintArea(e);
    }
  } catch (err) {
    console.error(err);
    if (stopped()) return;
    toast('O detector não carregou. Pinte a área com o pincel.');
    // An area chosen before stays as it was.
    if (!e.doc.filter.masked) await paintArea(e);
  } finally {
    task.stop();
    if (mine === current) facePick.task = null;
    bump();
  }
}

export async function chooseFace(e: Engine, face: Face): Promise<void> {
  const { masks, source, doc } = e;
  // The rings leave at once, so a double tap cannot choose twice.
  if (!masks || !source || !ui.faceChoosing) return;
  ui.faceChoosing = false;
  const data = buildFaceMask(face.outline, CHIN, maskTarget(masks, source));
  const reach = Math.max(face.box.w * doc.width, face.box.h * doc.height) / Math.max(doc.width, doc.height);
  await e.replaceFilterMask('Rosto', data, { masked: true, feather: FACE_FEATHER, reach });
  bump();
}

/**
 * What the automatic mode fills for each tool. Most fill the whole region. Longer hair skips the hair
 * over each face, and learns the face size, which sets how far the hair grows.
 */
function shapeFor(tool: string, data: Uint8Array, masks: NonNullable<Engine['masks']>, faces: readonly Face[]): { data: Uint8Array; params?: Params } {
  if (tool !== 'hairlength' || faces.length === 0) return { data };
  const reach = Math.max(...faces.map((f) => f.box.h));
  return { data: lengthenable(data, masks.w, masks.h, faces.map((f) => f.outline)), params: { reach } };
}

/** The mask a tool paints on. */
const layerOf = (tool: string) => toolById(tool)?.layer ?? null;

/** Automatic, unless the person chose otherwise or the mask already holds work, as in a reopened project. */
function modeFor(e: Engine, tool: string): ToolMode {
  if (freed.has(tool)) return 'manual';
  const remembered = modes.get(tool);
  if (remembered) return remembered;
  const layer = layerOf(tool);
  return layer && e.doc.layers[layer]?.painted ? 'manual' : 'auto';
}

/** Fills the mask of the open tool with its region, as one undo step. */
async function fillRegion(e: Engine, tool: string): Promise<void> {
  const layer = layerOf(tool);
  const data = regionData;
  if (!layer || !data || toolLimit.tool !== tool || toolLimit.mode !== 'auto' || toolLimit.state !== 'on') return;
  await e.fillLayer(layer, data, 'Automático', regionParams);
  bump();
}

/**
 * Keeps the brush of a tool on the part of the face it is made for. Strokes wait for the search, and
 * when it ends with nothing to hold on to, the brush is free: no photo gets stuck on the detector.
 * In the automatic mode the region also becomes the mask, once the view has shown it. `refill`
 * replaces work already in the mask, for when the person asks for the automatic mode.
 */
export async function limitTool(e: Engine, tool: string, region: FaceRegion, deeper = false, refill = false): Promise<void> {
  const { source, masks } = e;
  if (!source || !masks) return;
  cancelSearch();
  toolLimit.tool = tool;
  toolLimit.region = region;
  toolLimit.missed = false;
  toolLimit.mode = modeFor(e, tool);
  regionData = null;
  regionParams = undefined;
  e.brushOff = false;
  if (freed.has(tool)) {
    toolLimit.state = 'off';
    return;
  }
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  const hair = region === 'hair';
  const task = openJob(hair);
  const moves = e.viewMoves;
  toolLimit.state = 'searching';
  e.holdStroke = `${LIMIT_WORDS[region].finding}. O pincel já vem.`;
  try {
    const scan = await scanPhoto(source, task, deeper, stopped, hair);
    if (!scan) return;
    let data: Uint8Array | null;
    let spots: Point[][];
    if (region === 'hair') {
      const found = await findHair(source, masks, scan.list, task, stopped);
      if (!found) return;
      ({ data, spots } = found);
    } else {
      data = buildRegionMask(scan.list, region, maskTarget(masks, source));
      spots = focusPoints(scan.list, region);
    }
    e.setPaintLimit(data);
    // The hair segmenter also looks at a photo without faces, so for hair the photo has none.
    toolLimit.state = data ? 'on' : scan.list.length || hair ? 'no-region' : 'no-face';
    if (data) {
      ({ data: regionData, params: regionParams } = shapeFor(tool, data, masks, scan.list));
      const auto = toolLimit.mode === 'auto';
      const layer = layerOf(tool);
      const fill = auto && (refill || !(layer && e.doc.layers[layer]?.painted));
      e.brushOff = auto;
      void showRegion(e, spots, e.viewMoves === moves, !shown.has(tool), fill ? () => fillRegion(e, tool) : undefined);
      shown.add(tool);
    } else {
      // Nothing to fill from: the brush is the way.
      toolLimit.mode = 'manual';
    }
  } catch (err) {
    console.error(err);
    if (!stopped()) {
      toolLimit.state = 'failed';
      toolLimit.mode = 'manual';
    }
  } finally {
    task.stop();
    if (mine === current) {
      facePick.task = null;
      e.holdStroke = null;
    }
    bump();
  }
}

/** The switch of the panel. Off means free painting on this tool, for as long as this photo is open. */
export function setToolLimit(e: Engine, on: boolean): void {
  const { tool, region } = toolLimit;
  if (!tool || !region) return;
  if (on) {
    freed.delete(tool);
    // Turning the switch on is the moment to see what it does.
    shown.delete(tool);
    void limitTool(e, tool, region);
    return;
  }
  freed.add(tool);
  modes.set(tool, 'manual');
  toolLimit.mode = 'manual';
  cancelSearch();
  stopRegionShow(e);
  e.holdStroke = null;
  e.brushOff = false;
  e.setPaintLimit(null);
  toolLimit.state = 'off';
  bump();
}

/**
 * Automatic or manual, from the panel. Manual keeps the mask as it is and gives the brush back.
 * Automatic replaces the mask with the region, as one undo step, finding it first if needed.
 */
export function setToolMode(e: Engine, mode: ToolMode): void {
  const { tool, region } = toolLimit;
  if (!tool || !region || toolLimit.mode === mode) return;
  modes.set(tool, mode);
  toolLimit.mode = mode;
  if (mode === 'manual') {
    e.brushOff = false;
  } else if (toolLimit.state === 'on' && regionData) {
    e.brushOff = true;
    void fillRegion(e, tool);
  } else {
    freed.delete(tool);
    void limitTool(e, tool, region, false, true);
  }
  bump();
}

/** The automatic mode again, after an undo or "Apagar" emptied the mask. */
export function refillRegion(e: Engine): void {
  if (toolLimit.tool) void fillRegion(e, toolLimit.tool);
}

/** The open tool is closing. The engine drops the limit itself when the next tool arrives. */
export function dropToolLimit(): void {
  if (toolLimit.region) {
    cancelSearch();
    stopRegionShow(hasEngine() ? engine() : null);
  }
  toolLimit.tool = null;
  toolLimit.region = null;
  toolLimit.state = 'off';
  regionData = null;
  regionParams = undefined;
}

export function forgetFreedTools(): void {
  freed.clear();
  shown.clear();
  modes.clear();
}

/** What the person reads when a whole stroke falls outside. */
export function strokeOutside(): string {
  toolLimit.missed = true;
  const words = toolLimit.region ? LIMIT_WORDS[toolLimit.region] : null;
  return words ? `Isso ficou fora. Para pintar aqui, desligue "${words.name}".` : '';
}
