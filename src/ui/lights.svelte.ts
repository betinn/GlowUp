/**
 * Luzes, on the side of the page: finding the scene of the photo the first time a light is asked for, and
 * putting a light on and taking it off as one tap.
 */

import type { Engine } from '../core/engine';
import { lightById } from '../core/light/lights';
import { stampOf } from '../core/light/resolve';
import type { LightDef } from '../core/light/types';
import { facePick, findScene, openJob, scanPhoto } from './facepick.svelte';
import { bump, engine, toast } from './state.svelte';
import type { Task } from './task.svelte';

/** Long enough to read why a light did not go on. */
const NOTE_MS = 5200;

/** Where the search for the scene stands, for the shelf. */
export type SceneState = 'idle' | 'finding' | 'ready' | 'nobody' | 'failed';

export const lightPick = $state({
  state: 'idle' as SceneState,
  /** The search on screen, while there is one. */
  task: null as Task | null,
  /** The light on its way, until it lands. */
  wearing: null as string | null,
});

/** Photos already searched that show nobody, so a second tap does not search again. */
const empty = new WeakSet<object>();
/** Changes to stop the search in progress, and so that only the last tap has something to say. */
let current = 0;

/** The light on the document, when it is one this version knows. */
export const appliedLight = (e: Engine): LightDef | undefined => lightById(e.doc.light?.id);

/** What the shelf should show for the photo as it stands. */
export function syncLights(e: Engine): void {
  if (lightPick.state === 'finding') return;
  lightPick.state = e.scene ? 'ready' : e.source && empty.has(e.source) ? 'nobody' : 'idle';
}

/** Finds the scene of the photo, once. Resolves to where the search ended. */
export async function ensureScene(e: Engine): Promise<SceneState | 'stopped'> {
  const { source } = e;
  if (!source) return 'stopped';
  if (e.scene) return (lightPick.state = 'ready');
  if (empty.has(source)) return (lightPick.state = 'nobody');
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  const task = openJob(true, true);
  lightPick.task = task;
  lightPick.state = 'finding';
  try {
    const scan = await scanPhoto(source, task, false, stopped, true);
    if (!scan || !(await findScene(e, scan.list, task, stopped))) return 'stopped';
    if (!e.scene) empty.add(source);
    return (lightPick.state = e.scene ? 'ready' : 'nobody');
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

/** The shelf closes: a search under way stops, and what was found stays. */
export function closeLights(): void {
  current++;
  lightPick.task?.stop();
  if (facePick.task === lightPick.task) facePick.task = null;
  lightPick.task = null;
  lightPick.wearing = null;
  if (lightPick.state === 'finding') lightPick.state = 'idle';
}

/** A tap on a light. The one already on the photo comes off, as a second tap does on a look. */
export async function tapLight(light: LightDef): Promise<void> {
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
    if (found === 'nobody') toast('Não achei ninguém nesta foto. As luzes precisam de uma pessoa para iluminar.', NOTE_MS);
    else if (found === 'failed') toast('O detector não carregou. Confere a conexão e toque na luz de novo.', NOTE_MS);
    if (found !== 'ready') return;
    // The strength the person chose stays from one light to the next.
    e.setLight(light.id, e.doc.light?.intensity ?? 1, light.recipe.frame?.stamp ? stampOf(new Date()) : undefined);
    e.commit();
  } finally {
    if (lightPick.wearing === light.id) lightPick.wearing = null;
    bump();
  }
}

/** The slider of the shelf, while it moves. `commitLight` closes the gesture as one undo step. */
export function setLightIntensity(percent: number): void {
  const e = engine();
  const light = e.doc.light;
  if (!light) return;
  e.setLight(light.id, Math.min(1, Math.max(0, percent / 100)), light.stamp);
  bump();
}

export function commitLight(): void {
  engine().commit();
  bump();
}
