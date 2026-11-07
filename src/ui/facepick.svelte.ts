/**
 * Choosing a face for the filter. The detector code loads here, on the first request.
 * Faces stay in memory for the open photo and never reach the saved project.
 */

import type { Engine } from '../core/engine';
import type { FaceScan } from '../core/face/detector';
import { buildFaceMask } from '../core/face/mask';
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

const scans = new WeakMap<SourceImage, FaceScan>();
let detectorStarted = false;
/** Changes to stop the search in progress. */
let current = 0;

export function stopFaceSearch(): void {
  current++;
  facePick.task?.stop();
  facePick.task = null;
  ui.faceChoosing = false;
}

/** No face to choose: the person paints the area, starting from an empty mask. */
export async function paintArea(e: Engine): Promise<void> {
  ui.faceChoosing = false;
  await e.replaceFilterMask('Filtro', null, { masked: true, feather: 0, reach: PAINTED_REACH });
  bump();
}

/** Finds faces and shows the rings. With `deeper`, tries the next level of a finished search. */
export async function searchFaces(e: Engine, deeper = false): Promise<void> {
  const source = e.source;
  if (!source || facePick.task) return;
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  const task = new Task(detectorStarted ? NEXT_USE : FIRST_USE);
  facePick.task = task;
  facePick.firstUse = !detectorStarted;
  ui.faceChoosing = false;
  try {
    if (!detectorStarted) task.stage('download');
    const { FaceScan, loadDetector } = await import('../core/face/detector');
    await loadDetector(
      (fraction) => task.report(fraction),
      () => task.stage('start'),
    );
    detectorStarted = true;
    if (stopped()) return;
    task.stage('scan');
    let scan = scans.get(source);
    if (!scan?.finished || deeper) {
      scan ??= new FaceScan(source);
      scans.set(source, scan);
      await scan.run((fraction) => task.report(fraction), stopped);
    }
    if (stopped()) return;
    facePick.faces = scan.list;
    facePick.more = scan.more;
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
  const kx = source.w / masks.w;
  const ky = source.h / masks.h;
  const data = buildFaceMask(face.outline, CHIN, {
    w: masks.w,
    h: masks.h,
    luma: (a) => source.luma(a.x * kx, a.y * ky, a.w * kx, a.h * ky, a.w, a.h),
  });
  const reach = Math.max(face.box.w * doc.width, face.box.h * doc.height) / Math.max(doc.width, doc.height);
  await e.replaceFilterMask('Rosto', data, { masked: true, feather: FACE_FEATHER, reach });
  bump();
}
