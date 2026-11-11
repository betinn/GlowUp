/**
 * The tool "Aumentar resolução": the photo as it is now, with every retouch, made 2 or 4 times larger on this
 * device, and opened in the editor as a new photo. The project of now stays on the list as it was, so nothing is
 * lost and the larger photo is an ordinary photo from then on: it opens again with no model.
 *
 * The job lives here and not in the panel, so a look at another tool while it runs does not stop it.
 */

import type { Engine } from '../core/engine';
import { encodeImage, renderImage } from '../core/export';
import { nextPaint } from '../core/progress';
import type { Scale } from '../core/superres/size';
import { fillSettled } from './fill.svelte';
import { openFile } from './open';
import { autosave, bump, toast } from './state.svelte';
import { Task } from './task.svelte';
import { cancelUpscale, upscaleCanvas, upscaleFailure, upscaleReady } from './upscale';

export type GrowState = 'idle' | 'running' | 'failed';

export const grow = $state({
  state: 'idle' as GrowState,
  task: null as Task | null,
  /** The job may be stopped: true from the start until the larger photo starts to open. */
  stoppable: false,
  /** The last job was stopped, so the panel says that nothing changed. */
  stopped: false,
});

let job = 0;

/** The name of the new photo: the name of this project with the scale. */
function nameFor(scale: Scale): string {
  const base = autosave()?.name ?? 'foto';
  return `${base} ${scale}x.png`;
}

export async function startGrow(e: Engine, scale: Scale): Promise<void> {
  if (grow.state === 'running') return;
  const mine = ++job;
  const task = new Task([
    { id: 'tiles', label: 'Aplicando seus retoques', weight: 6 },
    ...(upscaleReady()
      ? []
      : [
          { id: 'download', label: 'Baixando o modelo de resolução', weight: 20 },
          { id: 'start', label: 'Ligando o modelo', weight: 4, estimate: 3000 },
        ]),
    { id: 'upscale', label: `Aumentando ${scale}×`, weight: 62 },
    // PNG keeps every pixel the model made. About 160 ms a megapixel, as the export measured.
    { id: 'encode', label: 'Guardando a foto nova', weight: 8, estimate: 1000 },
  ]);
  grow.task = task;
  grow.state = 'running';
  grow.stoppable = true;
  grow.stopped = false;
  bump();
  const live = () => mine === job;
  try {
    task.stage('tiles');
    // A completion still running would leave its quick guess in the photo.
    await fillSettled();
    if (!live()) return;
    const canvas = await renderImage(e, { tile: (n, total) => task.report(n / total) });
    if (!live()) return;
    const big = await upscaleCanvas(canvas, scale, {
      downloading: (fraction, left) => {
        task.stage('download');
        task.report(fraction, left);
      },
      starting: (left) => task.stage('start', left),
      running: (fraction, left) => {
        task.stage('upscale');
        task.report(fraction, left);
      },
    });
    if (!big || !live()) return;
    grow.stoppable = false;
    task.stage('encode');
    await nextPaint();
    const blob = await encodeImage(big, { format: 'image/png', quality: 1 });
    if (!live()) return;
    task.finish('Pronta');
    // The editor saves this project, closes, and opens the larger photo as a new one.
    openFile(new File([blob], nameFor(scale), { type: 'image/png' }));
    grow.state = 'idle';
  } catch (err) {
    console.error(err);
    if (live()) {
      grow.state = 'failed';
      toast(
        upscaleFailure(err) === 'download'
          ? 'Não deu para baixar o modelo que aumenta a resolução. Confere a internet e tenta de novo. A foto continua como estava.'
          : 'Não deu para aumentar a foto dessa vez. Ela continua como estava.',
      );
    }
  } finally {
    task.stop();
    if (live() && grow.state === 'running') grow.state = 'idle';
    if (live()) grow.stoppable = false;
    bump();
  }
}

/** Stops the job, on any step. The photo stays as it was. */
export function cancelGrow(): void {
  if (grow.state !== 'running' || !grow.stoppable) return;
  job++;
  cancelUpscale();
  grow.task?.stop();
  grow.state = 'idle';
  grow.stoppable = false;
  grow.stopped = true;
  bump();
}

/** The editor closes: a job of its photo has nowhere to go. */
export function forgetGrow(): void {
  if (grow.state === 'running' && grow.stoppable) cancelGrow();
  grow.stopped = false;
  if (grow.state === 'failed') grow.state = 'idle';
}
