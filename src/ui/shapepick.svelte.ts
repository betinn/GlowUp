/**
 * The sliders of the face menu: finding the faces and the person when a tool of the menu opens, and which face
 * the sliders work on. Faces stay in memory for the open photo and never reach the saved project.
 */

import type { Engine } from '../core/engine';
import { CHIN_WORDS, readChin, type ChinReading } from '../core/face/chin';
import { faceAt, sliderById, type ShapeSection } from '../core/face/reshape';
import type { Face } from '../core/face/scan';
import type { SourceImage } from '../core/source';
import { facePick, findLock, openJob, scanPhoto } from './facepick.svelte';
import type { Task } from './task.svelte';
import { bump } from './state.svelte';

export type ShapeState = 'idle' | 'searching' | 'on' | 'no-face' | 'failed';

export const shapePick = $state({
  state: 'idle' as ShapeState,
  task: null as Task | null,
  /** The position of the chosen face in the list. */
  chosen: 0,
  /** Draws what was detected over the photo. */
  showing: false,
  /** The list of faces, for the panel and the overlay. */
  faces: [] as Face[],
});

/** Why the double chin slider is not there, for each face. */
const chins = new WeakMap<Face, ChinReading>();

let current = 0;

/** How the face at this point looks for the slider of the double chin. */
function readChins(source: SourceImage, faces: readonly Face[]): void {
  // Enough pixels to see a fold, and no more: the read goes pixel by pixel.
  const side = Math.min(1, 1024 / Math.max(source.w, source.h));
  const w = Math.max(1, Math.round(source.w * side));
  const h = Math.max(1, Math.round(source.h * side));
  const { data } = source.draw(0, 0, source.w, source.h, w, h).getContext('2d')!.getImageData(0, 0, w, h);
  const pixel = (u: number, v: number): readonly [number, number, number] => {
    const at = (Math.min(h - 1, Math.floor(v * h)) * w + Math.min(w - 1, Math.floor(u * w))) * 4;
    return [data[at], data[at + 1], data[at + 2]];
  };
  for (const face of faces) {
    const reading = readChin(face, w, h, pixel);
    chins.set(face, reading);
    if (reading.seen) face.chin = reading.fold;
  }
}

/** The biggest face goes first: it is the one a person usually means. */
function biggest(faces: readonly Face[]): number {
  let best = 0;
  for (const [i, face] of faces.entries()) {
    if (face.box.w * face.box.h > faces[best].box.w * faces[best].box.h) best = i;
  }
  return best;
}

/** Finds what the sliders need, when a tool of the menu opens. */
export async function openShapeTool(e: Engine): Promise<void> {
  const { source } = e;
  if (!source) return;
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  const task = openJob(false, true);
  shapePick.task = task;
  shapePick.state = 'searching';
  try {
    const scan = await scanPhoto(source, task, false, stopped);
    if (!scan) return;
    const faces = scan.list;
    readChins(source, faces);
    if (!(await findLock(e, faces, task, stopped))) return;
    e.shapeFaces = faces;
    if (shapePick.faces !== faces) {
      shapePick.faces = faces;
      const held = e.doc.shapes?.[0];
      const face = held ? faceAt(faces, held.at) : null;
      shapePick.chosen = face ? faces.indexOf(face) : biggest(faces);
    }
    // Numbers saved in a project find their face now, and the field is worked out from them again.
    if (e.doc.shapes?.length) e.syncShape();
    shapePick.state = faces.length ? 'on' : 'no-face';
  } catch (err) {
    console.error(err);
    if (!stopped()) shapePick.state = 'failed';
  } finally {
    task.stop();
    if (mine === current) closeJob();
    bump();
  }
}

/** Looks through finer levels, when a face was left out. */
export async function searchMoreFaces(e: Engine): Promise<void> {
  const { source } = e;
  if (!source || shapePick.task) return;
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  const task = openJob(false, true);
  shapePick.task = task;
  shapePick.state = 'searching';
  try {
    const scan = await scanPhoto(source, task, true, stopped);
    if (!scan) return;
    readChins(source, scan.list);
    shapePick.faces = scan.list;
    e.shapeFaces = scan.list;
    shapePick.state = scan.list.length ? 'on' : 'no-face';
  } catch (err) {
    console.error(err);
    if (!stopped()) shapePick.state = 'failed';
  } finally {
    task.stop();
    if (mine === current) closeJob();
    bump();
  }
}

function closeJob(): void {
  if (facePick.task === shapePick.task) facePick.task = null;
  shapePick.task = null;
}

/** The open tool of the menu is closing. What it found stays for the next one. */
export function dropShapeTool(): void {
  current++;
  shapePick.task?.stop();
  closeJob();
  shapePick.state = 'idle';
  shapePick.showing = false;
}

export function forgetShapeFaces(): void {
  shapePick.faces = [];
  shapePick.chosen = 0;
}

/** Where the numbers of a face are kept: where they already are, or at the middle of the face. */
export function placeOf(e: Engine, face: Face): [number, number] {
  const held = e.doc.shapes?.find((shape) => faceAt(shapePick.faces, shape.at) === face);
  if (held) return held.at;
  return [face.box.x + face.box.w / 2, face.box.y + face.box.h / 2];
}

export function chosenFace(): Face | null {
  return shapePick.faces[shapePick.chosen] ?? null;
}

/** The number of a slider on the chosen face. */
export function valueOf(e: Engine, id: string): number {
  const face = chosenFace();
  if (!face) return 0;
  const [u, v] = placeOf(e, face);
  return e.doc.shapes?.find((shape) => shape.at[0] === u && shape.at[1] === v)?.values[id] ?? 0;
}

/** Why the slider of the double chin is not on the chosen face. Empty when it is. */
export function chinNote(): string {
  const face = chosenFace();
  if (!face) return '';
  const reading = chins.get(face);
  if (!reading) return CHIN_WORDS.none;
  return reading.seen ? '' : reading.why;
}

/** A section has numbers, whether it is on or off. */
export function sectionHeld(e: Engine, section: ShapeSection): boolean {
  return (e.doc.shapes ?? []).some((shape) => Object.entries(shape.values).some(([id, v]) => v !== 0 && sliderById(id)?.section === section));
}

export function setSectionOn(e: Engine, section: ShapeSection, on: boolean): void {
  e.setShapeSectionOff(section, !on);
  bump();
}
