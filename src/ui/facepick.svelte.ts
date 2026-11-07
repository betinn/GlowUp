/**
 * Finding faces, for the filter and for the tools that stay on eyes or teeth. The detector code loads
 * here, on the first request. Faces stay in memory for the open photo and never reach the saved project.
 */

import type { Engine } from '../core/engine';
import type { FaceScan } from '../core/face/detector';
import { buildFaceMask, type MaskTarget } from '../core/face/mask';
import { buildRegionMask, type FaceRegion } from '../core/face/regions';
import { CHIN, type Face } from '../core/face/scan';
import type { Stage } from '../core/progress';
import type { SourceImage } from '../core/source';
import { bump, toast, ui } from './state.svelte';
import { Task } from './task.svelte';

/** Starting softness of the edge. Tuned on real photos with a black and white filter. */
const FACE_FEATHER = 25;

/** Size given to a hand-painted area, for the softness slider. */
const PAINTED_REACH = 0.25;

const FIRST_USE: Stage[] = [
  { id: 'download', label: 'Baixando o detector', weight: 62 },
  { id: 'start', label: 'Ligando o detector', weight: 6, estimate: 400 },
  { id: 'scan', label: 'Procurando rostos', weight: 32 },
];

const NEXT_USE: Stage[] = [{ id: 'scan', label: 'Procurando rostos', weight: 1 }];

export const facePick = $state({
  /** The job on screen, while there is one. */
  task: null as Task | null,
  /** True while the detector downloads, which happens once. */
  firstUse: false,
  faces: [] as Face[],
  /** A finer search is still possible. */
  more: false,
});

/** Words of each limit: the switch, the wait, and the note when the photo does not show that region. */
export const LIMIT_WORDS: Record<FaceRegion, { name: string; finding: string; missing: string }> = {
  iris: { name: 'Só na íris', finding: 'Procurando os olhos', missing: 'Não achei olhos abertos nesta foto.' },
  sclera: { name: 'Só no branco do olho', finding: 'Procurando os olhos', missing: 'Não achei olhos abertos nesta foto.' },
  teeth: { name: 'Só nos dentes', finding: 'Procurando os dentes', missing: 'Não achei dentes à mostra nesta foto.' },
};

/** Where the brush of the open tool stands. It waits while `searching`, stays on the region when `on`, and the rest leave it free. */
export type LimitState = 'searching' | 'on' | 'off' | 'no-face' | 'no-region' | 'failed';

export const toolLimit = $state({
  tool: null as string | null,
  region: null as FaceRegion | null,
  state: 'off' as LimitState,
  /** A whole stroke fell outside, so a face may have been left out. */
  missed: false,
});

const scans = new WeakMap<SourceImage, FaceScan>();
/** Tools the person set free on this photo. Going back to one keeps it free. */
const freed = new Set<string>();
let detectorStarted = false;
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

function openJob(): Task {
  const task = new Task(detectorStarted ? NEXT_USE : FIRST_USE);
  facePick.task = task;
  facePick.firstUse = !detectorStarted;
  return task;
}

/** Loads the detector if needed and goes through the photo. Returns null when the search was stopped. */
async function scanPhoto(source: SourceImage, task: Task, deeper: boolean, stopped: () => boolean): Promise<FaceScan | null> {
  if (!detectorStarted) task.stage('download');
  const { FaceScan, loadDetector } = await import('../core/face/detector');
  await loadDetector(
    (fraction) => task.report(fraction),
    () => task.stage('start'),
  );
  detectorStarted = true;
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
 * Keeps the brush of a tool on the part of the face it is made for. Strokes wait for the search, and
 * when it ends with nothing to hold on to, the brush is free: no photo gets stuck on the detector.
 */
export async function limitTool(e: Engine, tool: string, region: FaceRegion, deeper = false): Promise<void> {
  const { source, masks } = e;
  if (!source || !masks) return;
  cancelSearch();
  toolLimit.tool = tool;
  toolLimit.region = region;
  toolLimit.missed = false;
  if (freed.has(tool)) {
    toolLimit.state = 'off';
    return;
  }
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  const task = openJob();
  toolLimit.state = 'searching';
  e.holdStroke = `${LIMIT_WORDS[region].finding}. O pincel já vem.`;
  try {
    const scan = await scanPhoto(source, task, deeper, stopped);
    if (!scan) return;
    const data = buildRegionMask(scan.list, region, maskTarget(masks, source));
    e.setPaintLimit(data);
    toolLimit.state = data ? 'on' : scan.list.length ? 'no-region' : 'no-face';
  } catch (err) {
    console.error(err);
    if (!stopped()) toolLimit.state = 'failed';
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
    void limitTool(e, tool, region);
    return;
  }
  freed.add(tool);
  cancelSearch();
  e.holdStroke = null;
  e.setPaintLimit(null);
  toolLimit.state = 'off';
  bump();
}

/** The open tool is closing. The engine drops the limit itself when the next tool arrives. */
export function dropToolLimit(): void {
  if (toolLimit.region) cancelSearch();
  toolLimit.tool = null;
  toolLimit.region = null;
  toolLimit.state = 'off';
}

export function forgetFreedTools(): void {
  freed.clear();
}

/** What the person reads when a whole stroke falls outside. */
export function strokeOutside(): string {
  toolLimit.missed = true;
  const words = toolLimit.region ? LIMIT_WORDS[toolLimit.region] : null;
  return words ? `Isso ficou fora. Para pintar aqui, desligue "${words.name}".` : '';
}
