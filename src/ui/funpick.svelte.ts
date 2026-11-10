/**
 * The menu of Brincar: finding the faces when it opens, which face the effects work on, which sticker is
 * chosen, and putting stickers on. Faces stay in memory for the open photo and never reach the saved project.
 */

import type { Engine } from '../core/engine';
import { placeOnFace } from '../core/fun/anchor';
import { comboOf, comboValues, type FunCombo } from '../core/fun/combos';
import { FUN_EFFECTS } from '../core/fun/effects/index';
import type { StickerDef } from '../core/fun/types';
import { faceAt } from '../core/face/reshape';
import type { Face } from '../core/face/scan';
import { ensureFun } from '../tools/activate';
import { ensureLock, facePick, lockState, openJob, scanPhoto } from './facepick.svelte';
import { bump } from './state.svelte';
import type { Task } from './task.svelte';

export type FunState = 'idle' | 'searching' | 'on' | 'no-face' | 'failed';

export const funPick = $state({
  state: 'idle' as FunState,
  task: null as Task | null,
  faces: [] as Face[],
  /** The position of the chosen face in the list. */
  chosen: 0,
  /** The sticker the handles are on, by its id. */
  selected: null as number | null,
});

let current = 0;

/** The biggest face goes first: it is the one a person usually means. */
function biggest(faces: readonly Face[]): number {
  let best = 0;
  for (const [i, face] of faces.entries()) {
    if (face.box.w * face.box.h > faces[best].box.w * faces[best].box.h) best = i;
  }
  return best;
}

/** Loads Brincar and finds the faces, when its menu opens. */
export async function openFun(e: Engine): Promise<void> {
  const { source } = e;
  if (!source) return;
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  await ensureFun(e);
  if (stopped()) return;
  if (funPick.faces.length && e.funFaces === funPick.faces) {
    funPick.state = 'on';
    bump();
    return;
  }
  const task = openJob(false, false);
  funPick.task = task;
  funPick.state = 'searching';
  bump();
  try {
    const scan = await scanPhoto(source, task, false, stopped);
    if (!scan) return;
    const faces = scan.list;
    e.funFaces = faces;
    funPick.faces = faces;
    const held = e.doc.fun?.faces?.[0];
    const face = held ? faceAt(faces, held.at) : null;
    funPick.chosen = face ? faces.indexOf(face) : biggest(faces);
    // Numbers saved in a project find their face now, and the field is worked out from them again.
    if (e.doc.fun?.faces?.length) e.syncFun();
    // A photo whose person was already found keeps that for an effect that moves a head alone.
    funPick.state = faces.length ? 'on' : 'no-face';
  } catch (err) {
    console.error(err);
    if (!stopped()) funPick.state = 'failed';
  } finally {
    task.stop();
    if (facePick.task === task) facePick.task = null;
    if (funPick.task === task) funPick.task = null;
    bump();
  }
}

/** The menu closes. What it found stays for the next time. */
export function closeFun(): void {
  current++;
  funPick.task?.stop();
  if (facePick.task === funPick.task) facePick.task = null;
  funPick.task = null;
  funPick.state = 'idle';
  funPick.selected = null;
}

/** For the next photo. */
export function forgetFunFaces(): void {
  funPick.faces = [];
  funPick.chosen = 0;
  funPick.selected = null;
}

export function chosenFunFace(): Face | null {
  return funPick.faces[funPick.chosen] ?? null;
}

/** Where the numbers of a face are kept: where they already are, or at the middle of the face. */
export function funPlaceOf(e: Engine, face: Face): [number, number] {
  const held = e.doc.fun?.faces?.find((shape) => faceAt(funPick.faces, shape.at) === face);
  if (held) return held.at;
  return [face.box.x + face.box.w / 2, face.box.y + face.box.h / 2];
}

/** The strength of an effect on the chosen face. */
export function funValueOf(e: Engine, id: string): number {
  const face = chosenFunFace();
  if (!face) return 0;
  const [u, v] = funPlaceOf(e, face);
  return e.doc.fun?.faces?.find((shape) => shape.at[0] === u && shape.at[1] === v)?.values[id] ?? 0;
}

/** Moves the slider of an effect on the chosen face. An effect that moves a head alone asks for the person apart. */
export function setFunValue(e: Engine, id: string, value: number, layered: boolean): void {
  const face = chosenFunFace();
  if (!face) return;
  e.setFunValue(funPlaceOf(e, face), id, value, true);
  if (layered && value > 0 && lockState.state === 'idle') void ensureLock(e).then(bump);
  bump();
}

/** The careta pronta the chosen face has on, if its numbers are exactly one. */
export function funComboOn(e: Engine): FunCombo | null {
  const face = chosenFunFace();
  if (!face) return null;
  const [u, v] = funPlaceOf(e, face);
  const values = e.doc.fun?.faces?.find((shape) => shape.at[0] === u && shape.at[1] === v)?.values;
  return values && Object.keys(values).length ? comboOf(values) : null;
}

/**
 * Puts a careta pronta on the chosen face, as one undo step: its numbers, and zero for every other effect. On the
 * face that already has it, it takes it off.
 */
export function applyCombo(e: Engine, combo: FunCombo): void {
  const face = chosenFunFace();
  if (!face) return;
  const off = funComboOn(e)?.id === combo.id;
  const values = comboValues(combo);
  const at = funPlaceOf(e, face);
  e.commit();
  for (const effect of FUN_EFFECTS) e.setFunValue(at, effect.id, off ? 0 : values[effect.id], true);
  e.commit();
  if (!off && FUN_EFFECTS.some((f) => f.layered && values[f.id] > 0) && lockState.state === 'idle') void ensureLock(e).then(bump);
  bump();
}

/** Puts a sticker on the chosen face, or in the middle of the photo when there is none, and chooses it. */
export function putSticker(e: Engine, def: StickerDef): void {
  const face = chosenFunFace();
  const { width, height } = e.doc;
  const place = face
    ? placeOnFace(def, face, width, height)
    : { x: 0.5, y: 0.5, size: 0.3, angle: 0 };
  const at: [number, number] | null = face ? funPlaceOf(e, face) : null;
  funPick.selected = e.addSticker({ kind: def.id, at, ...place });
  bump();
}

/** Takes the chosen sticker off. */
export function removeSelected(e: Engine): void {
  if (funPick.selected === null) return;
  e.removeSticker(funPick.selected);
  funPick.selected = null;
  bump();
}

/** Brincar has something on the photo. */
export const funHeld = (e: Engine) => !!(e.doc.fun?.faces?.length || e.doc.fun?.stickers?.length);

/** Takes everything of Brincar off, as one undo step. */
export async function resetFun(e: Engine): Promise<boolean> {
  funPick.selected = null;
  const done = await e.resetParts('Zerar Brincar', { layers: [], fun: true });
  bump();
  return done;
}
