/** Starts opening a photo or a saved project, and owns the progress shown meanwhile. */

import type { Stage } from '../core/progress';
import { reducedMotion } from './motion';
import { closeEditor, toast, ui, type Point } from './state.svelte';
import { Task } from './task.svelte';

/** How long the finished bar stays on screen, so the 100% can be read. */
const HOLD_DONE = 340;

const stages = (decodeEstimate: number, read: string, extra: Stage[] = []): Stage[] => [
  { id: 'load', label: 'Preparando o laboratório', weight: 8, estimate: 500 },
  { id: 'read', label: read, weight: 14 },
  { id: 'decode', label: 'Abrindo a foto', weight: 38, estimate: decodeEstimate },
  { id: 'upload', label: 'Preparando os pixels', weight: 14, estimate: 250 },
  ...extra,
  { id: 'render', label: 'Revelando', weight: 26, estimate: 400 },
];

export const isPhoto = (file: File) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name);

function begin(task: Task, photo: string | null, from: Point | null, next: () => void): void {
  ui.opening = { task, photo, from };
  task.stage('load');
  // A photo dropped on the editor replaces the current one, which is saved first.
  void closeEditor(() => {
    next();
    ui.session++;
    ui.screen = 'editor';
  });
}

export function openFile(file: File | null | undefined, from: Point | null = null): void {
  if (!file || ui.opening) return;
  if (!isPhoto(file)) {
    toast('Não consegui abrir esse arquivo. Tenta um JPG, PNG ou WebP?');
    return;
  }
  // About 20 MB of compressed photo per second on a common device.
  const task = new Task(stages(200 + file.size / 20_000, 'Lendo a foto'));
  begin(task, URL.createObjectURL(file), from, () => {
    ui.pending = { file };
  });
}

export function openProject(projectId: string, thumb: Blob): void {
  if (ui.opening) return;
  const task = new Task(stages(500, 'Buscando seu projeto', [{ id: 'retouch', label: 'Recolocando seus retoques', weight: 14 }]));
  begin(task, URL.createObjectURL(thumb), null, () => {
    ui.pending = { projectId };
  });
}

function clear(): void {
  const opening = ui.opening;
  ui.opening = null;
  opening?.task.stop();
  // The fading image still needs its address for a moment.
  if (opening?.photo) setTimeout(() => URL.revokeObjectURL(opening.photo!), 2000);
}

export async function finishOpening(): Promise<void> {
  ui.opening?.task.finish('Pronta');
  if (!reducedMotion()) await new Promise((r) => setTimeout(r, HOLD_DONE));
  clear();
}

export const cancelOpening = clear;
