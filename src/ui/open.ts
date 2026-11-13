/** Starts opening a photo or a saved project, and owns the progress shown meanwhile. */

import type { Stage } from '../core/progress';
import { reducedMotion } from './motion';
import { autosave, closeEditor, toast, ui, type Point, type PostContext } from './state.svelte';
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

export const isPhoto = (file: File) => file.type.startsWith('image/') || /\.(jpe?g|jfif|png|webp|avif|heic|heif)$/i.test(file.name);

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
    ui.post = null;
  });
}

/** Opens a saved project. With `post`, it is a photo of that post, and the way back from the editor is the post. */
export function openProject(projectId: string, thumb: Blob, post: PostContext | null = null): void {
  if (ui.opening) return;
  // A damaged project may have no picture. It still has to reach the place that takes it off the list.
  const photo = thumb instanceof Blob ? URL.createObjectURL(thumb) : null;
  const task = new Task(stages(500, post ? 'Buscando a foto' : 'Buscando seu projeto', [{ id: 'retouch', label: 'Recolocando seus retoques', weight: 14 }]));
  begin(task, photo, null, () => {
    ui.pending = { projectId };
    ui.post = post;
  });
}

/** Most photos a post takes. The same number as `MAX_PHOTOS`, kept here so the first screen loads none of the post. */
const POST_PHOTOS = 10;

const nameOf = (file: File) => file.name.replace(/\.[^.]+$/, '') || 'foto';

/**
 * What was chosen or dropped, whatever it is: one photo opens in the editor, several become a post, and photos
 * that arrive while a post is on the table join it.
 */
export function openFiles(files: readonly File[], from: Point | null = null): void {
  if (ui.opening || !files.length) return;
  const photos = files.filter(isPhoto);
  if (ui.screen === 'post' || ui.post) {
    if (photos.length) void addToPost(photos);
    else toast('Não consegui abrir esse arquivo. Tenta um JPG, PNG ou WebP?');
  } else if (photos.length > 1) {
    void startPost(photos, from);
  } else {
    openFile(photos[0] ?? files[0], from);
  }
}

/** Photos join the post on the table. From the editor of one of its photos, the table comes back first. */
async function addToPost(photos: File[]): Promise<void> {
  if (ui.screen === 'post') {
    const { addPhotos } = await import('./post/studiostate.svelte');
    await addPhotos(photos);
    return;
  }
  ui.postAdds = photos;
  await closeEditor(() => {
    ui.screen = 'post';
  });
}

/** Opens the table of a saved post. */
export function openPost(id: string, thumb: Blob | null): void {
  if (ui.opening) return;
  const task = new Task([
    { id: 'load', label: 'Preparando a mesa', weight: 10, estimate: 400 },
    { id: 'photos', label: 'Buscando as fotos', weight: 90, estimate: 1500 },
  ]);
  ui.opening = { task, photo: thumb instanceof Blob ? URL.createObjectURL(thumb) : null, from: null };
  task.stage('load');
  void closeEditor(() => {
    ui.post = null;
    ui.postAdds = null;
    ui.postId = id;
    ui.screen = 'post';
  });
}

/**
 * Starts a post from several photos, and with `adopt` from the photo in the editor too, which goes first with
 * its retouch. Each photo is kept on the device as a project of its own, and the table opens when all are in.
 */
export async function startPost(files: readonly File[], from: Point | null = null, adopt: { id: string; name: string; thumb?: Blob | null } | null = null): Promise<void> {
  if (ui.opening) return;
  const room = POST_PHOTOS - (adopt ? 1 : 0);
  const list = files.filter(isPhoto).slice(0, room);
  if (!list.length && !adopt) {
    toast('Não consegui abrir esse arquivo. Tenta um JPG, PNG ou WebP?');
    return;
  }
  const task = new Task([
    { id: 'load', label: 'Preparando a mesa', weight: 6, estimate: 400 },
    { id: 'photos', label: 'Guardando as fotos', weight: 64 },
    { id: 'render', label: 'Montando', weight: 30, estimate: 1200 },
  ]);
  const cover = adopt?.thumb ?? list[0];
  ui.opening = { task, photo: cover ? URL.createObjectURL(cover) : null, from };
  task.stage('load');
  try {
    const store = await import('../core/post/store');
    const { createPost } = await import('../core/post/layout');
    const id = store.newId('post');
    // The photo in the editor is saved as a photo of the post, with a picture of its retouch.
    const live = autosave();
    if (adopt && live) live.post = id;
    await closeEditor(() => {
      ui.post = null;
      ui.postAdds = null;
      ui.postId = null;
      ui.screen = 'post';
    });
    task.stage('photos');
    const photos = [];
    const first = adopt ? await store.adoptProject(adopt.id, id) : null;
    if (first) photos.push(first);
    let failed = 0;
    for (const [i, file] of list.entries()) {
      try {
        photos.push(await store.importPhoto(file, nameOf(file), id));
      } catch (err) {
        console.error(err);
        failed++;
      }
      task.report((i + 1) / list.length, `${i + 1} de ${list.length}`);
    }
    if (!list.length) task.report(1);
    if (!photos.length) throw new Error('no-photo');
    const name = adopt?.name ?? nameOf(list[0]);
    await store.savePost({ id, name, updated: Date.now(), thumb: null, doc: createPost(photos) });
    task.stage('render');
    if (failed) toast(failed === 1 ? 'Um arquivo não abriu e ficou de fora.' : `${failed} arquivos não abriram e ficaram de fora.`);
    else if (files.filter(isPhoto).length > room) toast(`Uma montagem leva até ${POST_PHOTOS} fotos. Entraram as ${POST_PHOTOS} primeiras.`, 4600);
    // The table takes it from here, and ends the opening when the photos are on it.
    ui.postId = id;
  } catch (err) {
    console.error(err);
    clear();
    ui.screen = 'home';
    toast('Não consegui abrir essas fotos. Tenta JPG, PNG ou WebP?');
    // The photo that came from the editor goes back to being a photo on its own.
    if (adopt) void import('../core/project').then(({ patchProject }) => patchProject(adopt.id, { post: undefined })).catch(() => {});
  }
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

/**
 * Says what went wrong with an opening. A project is deleted only when it can never open. Any other
 * failure may pass, and the work stays on the list for another try.
 */
export async function reportOpenFailure(err: unknown, projectId: string | undefined): Promise<void> {
  if (!projectId) {
    const big = err instanceof Error && err.message === 'image-too-large';
    toast(big ? 'Essa foto é grande demais para este aparelho.' : 'Não consegui abrir esse arquivo. Tenta um JPG, PNG ou WebP?');
    return;
  }
  const { deleteProject, InvalidProjectError } = await import('../core/project');
  if (!(err instanceof InvalidProjectError)) {
    toast('Não consegui abrir esse projeto agora. Ele continua salvo. Tenta de novo daqui a pouco.');
    return;
  }
  try {
    await deleteProject(projectId);
    toast('Esse projeto está danificado e não abre mais. Tirei ele da lista.');
  } catch (deleting) {
    console.error(deleting);
    toast('Esse projeto está danificado e não abre mais.');
  }
}
