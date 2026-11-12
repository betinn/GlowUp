/**
 * Luzes, on the side of the page: reading the scene of the photo the first time a light is asked for, by a
 * tile of the Luzes tab of Filtros or by a look of Glow na Hora, and putting a light on and taking it off as
 * one tap.
 */

import type { Engine } from '../core/engine';
import { isLookLight, menuLightById } from '../core/light/lights';
import type { MenuLight } from '../core/light/types';
import { facePick, findScene, openJob, scanPhoto } from './facepick.svelte';
import { bump, engine, toast } from './state.svelte';
import type { Task } from './task.svelte';

/** Long enough to read why a light did not go on. */
const NOTE_MS = 5200;

/** Where the reading of the scene stands, for the menu. */
export type SceneState = 'idle' | 'finding' | 'ready' | 'failed';

export const lightPick = $state({
  state: 'idle' as SceneState,
  /** The search on screen, while there is one. */
  task: null as Task | null,
  /** The light on its way, until it lands. */
  wearing: null as string | null,
});

/** Changes to stop the search in progress, and so that only the last tap has something to say. */
let current = 0;

/** The light of the menu on the document. The light of a look is not one of them. */
export const appliedLight = (e: Engine): MenuLight | undefined => menuLightById(e.doc.light?.id);

/** The document holds the light of a look of Glow na Hora. */
export const lookLightOn = (e: Engine): boolean => isLookLight(e.doc.light?.id);

/** What the menu should show for the photo as it stands. */
export function syncLights(e: Engine): void {
  if (lightPick.state === 'finding') return;
  lightPick.state = e.scene ? 'ready' : 'idle';
}

/** Reads the scene of the photo, once: its depth, the person, their skin and hair. Resolves to where it ended. */
export async function ensureScene(e: Engine): Promise<SceneState | 'stopped'> {
  const { source } = e;
  if (!source) return 'stopped';
  if (e.scene) return (lightPick.state = 'ready');
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  const task = openJob(true, true, true);
  lightPick.task = task;
  lightPick.state = 'finding';
  try {
    const scan = await scanPhoto(source, task, false, stopped, true);
    if (!scan || !(await findScene(e, scan.list, task, stopped)) || !e.scene) return 'stopped';
    return (lightPick.state = 'ready');
  } catch (err) {
    console.error(err);
    if (stopped()) return 'stopped';
    return (lightPick.state = 'failed');
  } finally {
    task.stop();
    if (facePick.task === task) facePick.task = null;
    if (lightPick.task === task) lightPick.task = null;
    if (lightPick.state === 'finding') lightPick.state = 'idle';
    bump();
  }
}

/** The menu closes: a search under way stops, and what was found stays. */
export function closeLights(): void {
  current++;
  lightPick.task?.stop();
  if (facePick.task === lightPick.task) facePick.task = null;
  lightPick.task = null;
  lightPick.wearing = null;
  if (lightPick.state === 'finding') lightPick.state = 'idle';
}

/** A tap on a light. The one already on the photo comes off, as a second tap does on a look. */
export async function tapLight(light: MenuLight): Promise<void> {
  const e = engine();
  if (appliedLight(e)?.id === light.id) {
    e.setLight(null);
    e.commit();
    toast('Luz fora. Desfazer traz de volta.');
    bump();
    return;
  }
  lightPick.wearing = light.id;
  bump();
  try {
    const found = await ensureScene(e);
    if (lightPick.wearing !== light.id) return;
    if (found === 'failed') toast('O leitor de profundidade não carregou. Confere a conexão e toque na luz de novo.', NOTE_MS);
    if (found !== 'ready') return;
    // The strength the person chose stays from one light of the menu to the next. The one of a look is the look's.
    e.setLight(light.id, appliedLight(e) ? e.doc.light!.intensity : 1);
    e.commit();
  } finally {
    if (lightPick.wearing === light.id) lightPick.wearing = null;
    bump();
  }
}

/** Takes off whatever light the photo holds, as one undo step. */
export function dropLight(): void {
  const e = engine();
  if (!e.doc.light) return;
  e.setLight(null);
  e.commit();
  toast('Luz fora. Desfazer traz de volta.');
  bump();
}

/** The slider of the light, while it moves. `commitLight` closes the gesture as one undo step. */
export function setLightIntensity(percent: number): void {
  const e = engine();
  const light = e.doc.light;
  if (!light) return;
  e.setLight(light.id, Math.min(1, Math.max(0, percent / 100)));
  bump();
}

export function commitLight(): void {
  engine().commit();
  bump();
}
