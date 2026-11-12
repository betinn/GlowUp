/**
 * The post on the table: its photos, their order and their frame, with the pictures that draw them. The screen
 * reads this, and every change goes through here, so each one can be undone and each one is saved.
 */

import { drawPage, type Picture } from '../../core/post/draw';
import { cellsOf, MAX_PHOTOS, moved, pageCount, pageOfPhoto, pageSize, ratioById, type PostDoc, type PostPhoto } from '../../core/post/layout';
import { importPhoto, loadPost, photoFile, releasePhoto, savePost, validPost, type PostRecord } from '../../core/post/store';
import { loadProject } from '../../core/project';
import { onPhone } from '../device';
import { isPhoto, openProject } from '../open';
import { toast, ui } from '../state.svelte';
import { Task } from '../task.svelte';
import { decodeAt } from './pictures';
import type { Before } from './spread';

/** Long side of the pictures the table draws with. The files are made from the photos at full size. */
const PREVIEW_SIDE = onPhone() ? 1280 : 1920;
const SAVE_AFTER = 800;
const UNDO_STEPS = 60;

export const studio = $state({
  record: null as PostRecord | null,
  /** The photo the buttons act on. */
  selected: 0,
  /** The slide in the middle of the screen. */
  page: 0,
  /** The selected photo answers to the finger: a drag moves it inside its place. */
  framing: false,
  /** Goes up when a picture arrives or the post changes, so the slides are drawn again. */
  rev: 0,
  /** Photos still on their way to the table. */
  loading: 0,
  /** Addresses of the small pictures of the row of photos, by the id of the photo. */
  thumbs: {} as Record<string, string>,
  /** Photos whose retouch is newer than the picture the post has of them. */
  stale: {} as Record<string, boolean>,
  /** The filter each photo wears on the whole of it, by the id of the photo. */
  filters: {} as Record<string, { id: string; intensity: number } | null>,
  /** The filter of one photo is going to the others. */
  spreading: null as Task | null,
  /** The last filter that went to every photo can be taken back. */
  canUnspread: false,
  canUndo: false,
  canRedo: false,
});

const pictures = new Map<string, ImageBitmap>();
/** Every photo that was on the table. One that is no longer in the post when the table closes leaves it. */
const known = new Set<string>();
let past: string[] = [];
let future: string[] = [];
/** What the photos had before the last filter went to all of them. */
let spreadBack: Before[] | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> = Promise.resolve();
/** Counts the posts loaded, so a slow picture of a post already closed is dropped. */
let session = 0;
/** The table being put away. The next post waits for it, so the two never share the table. */
let closing: Promise<void> = Promise.resolve();

export const doc = (): PostDoc => studio.record!.doc;

/** The picture of a photo, when it has come. */
export const pictureOf = (index: number): Picture | null => pictures.get(studio.record?.doc.photos[index]?.id ?? '') ?? null;

/** Side of the small pictures of the row of photos, in pixels: twice what the row shows, for a sharp screen. */
const SMALL_SIDE = 112;

/** The middle square of a picture, small. */
function smallCopy(picture: ImageBitmap): Promise<Blob> {
  const canvas = new OffscreenCanvas(SMALL_SIDE, SMALL_SIDE);
  const c = canvas.getContext('2d')!;
  const side = Math.min(picture.width, picture.height);
  c.imageSmoothingQuality = 'high';
  c.drawImage(picture, (picture.width - side) / 2, (picture.height - side) / 2, side, side, 0, 0, SMALL_SIDE, SMALL_SIDE);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
}

/** Brings one photo to the table: its picture, its small picture and its size as it is now. False when it is gone. */
async function bring(photo: PostPhoto, mine: number): Promise<boolean> {
  const file = await photoFile(photo.id).catch(() => null);
  if (!file) return false;
  const picture = await decodeAt(file.blob, file.w, file.h, PREVIEW_SIDE);
  if (mine !== session) {
    picture.close();
    return true;
  }
  pictures.get(photo.id)?.close();
  pictures.set(photo.id, picture);
  known.add(photo.id);
  // The small picture of the row comes from the photo as it is now, so a retouch shows there too.
  const small = await smallCopy(picture).catch(() => file.thumb);
  if (mine !== session) return true;
  if (studio.thumbs[photo.id]) URL.revokeObjectURL(studio.thumbs[photo.id]);
  if (small) studio.thumbs[photo.id] = URL.createObjectURL(small);
  studio.stale[photo.id] = file.stale;
  studio.filters[photo.id] = file.filter;
  const live = studio.record?.doc.photos.find((p) => p.id === photo.id);
  // A crop in the editor changes the shape of the photo: the old frame no longer means the same part.
  if (live && (live.w !== file.w || live.h !== file.h)) Object.assign(live, { w: file.w, h: file.h, x: 0.5, y: 0.5, zoom: 1 });
  studio.rev++;
  return true;
}

/**
 * Puts a saved post on the table. The slides show as soon as the post is read, each photo filling in as its
 * picture comes. A photo whose project is gone leaves the post. Returns false when there is nothing to show.
 */
export async function loadStudio(id: string): Promise<boolean> {
  await closing;
  const mine = ++session;
  resetTable();
  let record: PostRecord;
  try {
    record = validPost(await loadPost(id));
  } catch (err) {
    console.error(err);
    return false;
  }
  if (mine !== session) return false;
  studio.record = record;
  const photos = [...record.doc.photos];
  studio.loading = photos.length;
  const gone: string[] = [];
  for (const photo of photos) {
    const here = await bring(photo, mine).catch((err) => (console.error(err), false));
    if (mine !== session) return false;
    if (!here) gone.push(photo.id);
    studio.loading--;
  }
  if (gone.length) {
    record = studio.record!;
    record.doc.photos = record.doc.photos.filter((p) => !gone.includes(p.id));
    if (!record.doc.photos.length) return false;
    toast(gone.length === 1 ? 'Uma foto desta montagem não está mais no aparelho e ficou de fora.' : `${gone.length} fotos desta montagem não estão mais no aparelho e ficaram de fora.`);
  }
  const last = studio.record!.doc.photos.length - 1;
  studio.selected = Math.min(Math.max(ui.post?.id === id ? ui.post.index : 0, 0), last);
  studio.page = pageOfPhoto(doc(), studio.selected);
  studio.rev++;
  if (Object.values(studio.stale).some(Boolean)) toast('Um retoque não chegou a ser guardado na montagem. Abra a foto e volte para atualizar.', 5200);
  scheduleSave();
  return true;
}

function resetTable(): void {
  for (const picture of pictures.values()) picture.close();
  pictures.clear();
  for (const url of Object.values(studio.thumbs)) URL.revokeObjectURL(url);
  known.clear();
  past = [];
  future = [];
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  spreadBack = null;
  studio.spreading?.stop();
  Object.assign(studio, { record: null, selected: 0, page: 0, framing: false, loading: 0, thumbs: {}, stale: {}, filters: {}, spreading: null, canUnspread: false, canUndo: false, canRedo: false });
}

/** The first slide, small, for the home screen. */
async function thumbnail(): Promise<Blob | null> {
  const d = doc();
  if (!pageCount(d)) return null;
  const { w, h } = pageSize(ratioById(d.ratio), 320);
  const canvas = new OffscreenCanvas(w, h);
  drawPage(canvas.getContext('2d')!, $state.snapshot(d) as PostDoc, 0, w, h, pictureOf);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), SAVE_AFTER);
}

/** Writes the post as it is. Saves run one after the other, so the last one written is the newest. */
export function save(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const record = studio.record;
  if (!record) return saving;
  saving = saving.then(async () => {
    try {
      const thumb = studio.loading ? record.thumb : ((await thumbnail()) ?? record.thumb);
      record.thumb = thumb;
      await savePost({ ...($state.snapshot(record) as PostRecord), thumb });
    } catch (err) {
      // Storage may be full or blocked. The post stays on the table.
      console.warn('post save', err);
    }
  });
  return saving;
}

/** The table closes: the post is saved, and the photos that left it leave the device or go back to the home list. */
export function closeStudio(): Promise<void> {
  const record = studio.record;
  if (!record) return closing;
  closing = (async () => {
    await save();
    const kept = new Set(record.doc.photos.map((p) => p.id));
    let returned = 0;
    for (const id of known) {
      if (!kept.has(id) && (await releasePhoto(id).catch(() => false))) returned++;
    }
    if (returned) toast(returned === 1 ? 'A foto que saiu da montagem tinha retoque: ela está em "De onde parou".' : 'As fotos que saíram da montagem tinham retoque: elas estão em "De onde parou".', 4600);
    session++;
    resetTable();
  })();
  return closing;
}

function syncHistory(): void {
  studio.canUndo = past.length > 0;
  studio.canRedo = future.length > 0;
}

/** Marks the post as it is, before a change, so one undo brings it back. A gesture marks once, at its start. */
export function checkpoint(): void {
  if (!studio.record) return;
  const now = JSON.stringify(doc());
  if (past[past.length - 1] === now) return;
  past.push(now);
  if (past.length > UNDO_STEPS) past.shift();
  future = [];
  syncHistory();
}

/** The post changed: the slides are drawn again and the post is saved soon. */
export function touched(): void {
  const d = doc();
  studio.selected = Math.min(studio.selected, Math.max(0, d.photos.length - 1));
  studio.page = Math.min(studio.page, Math.max(0, pageCount(d) - 1));
  studio.rev++;
  scheduleSave();
}

/** One change, as one step of the undo. */
export function change(apply: (doc: PostDoc) => void): void {
  if (!studio.record) return;
  checkpoint();
  apply(doc());
  touched();
}

function restore(json: string): void {
  const selected = doc().photos[studio.selected]?.id;
  studio.record!.doc = JSON.parse(json) as PostDoc;
  // The buttons stay on the same photo when it is still there.
  const at = doc().photos.findIndex((p) => p.id === selected);
  if (at >= 0) studio.selected = at;
  studio.framing = false;
  touched();
}

export function undo(): void {
  const json = past.pop();
  if (!json || !studio.record) return;
  future.push(JSON.stringify(doc()));
  restore(json);
  syncHistory();
}

export function redo(): void {
  const json = future.pop();
  if (!json || !studio.record) return;
  past.push(JSON.stringify(doc()));
  restore(json);
  syncHistory();
}

/** Chooses a photo, and brings its slide to the middle. */
export function select(index: number): void {
  if (!studio.record || index < 0 || index >= doc().photos.length) return;
  if (studio.selected !== index) studio.framing = false;
  studio.selected = index;
  studio.page = pageOfPhoto(doc(), index);
  studio.rev++;
}

/** Goes to a slide. In a carousel the slide is the photo, so the buttons follow. */
export function showPage(page: number): void {
  if (!studio.record) return;
  const d = doc();
  const next = Math.min(Math.max(page, 0), Math.max(0, pageCount(d) - 1));
  if (next === studio.page) return;
  studio.page = next;
  if (d.kind === 'carousel') {
    studio.selected = next;
    studio.framing = false;
  } else if (!cellsOf(d).some((c) => c.photo === studio.selected && c.x < next + 1 && c.x + c.w > next)) {
    // The selected photo is not on this slide: the buttons go to the first that is.
    const first = cellsOf(d).find((c) => c.x < next + 1 - 1e-6 && c.x + c.w > next + 1e-6);
    if (first) studio.selected = first.photo;
    studio.framing = false;
  }
  studio.rev++;
}

export function moveSelected(delta: number): void {
  const from = studio.selected;
  const to = from + delta;
  if (!studio.record || to < 0 || to >= doc().photos.length) return;
  change((d) => {
    d.photos = moved(d.photos, from, to);
  });
  select(to);
}

/** Takes the selected photo out of the post. It stays on the device until the table closes, so undo brings it back. */
export function removeSelected(): void {
  if (!studio.record || doc().photos.length <= 1) return;
  const at = studio.selected;
  change((d) => {
    d.photos.splice(at, 1);
  });
  studio.framing = false;
  select(Math.min(at, doc().photos.length - 1));
  toast('A foto saiu da montagem. Desfazer traz de volta.');
}

/** How many more photos the post takes. */
export const room = () => (studio.record ? MAX_PHOTOS - doc().photos.length : 0);

/** New photos join the post, after the ones that are there. */
export async function addPhotos(files: readonly File[]): Promise<void> {
  const record = studio.record;
  if (!record) return;
  const photos = files.filter(isPhoto);
  if (!photos.length) {
    if (files.length) toast('Não consegui abrir esse arquivo. Tenta um JPG, PNG ou WebP?');
    return;
  }
  const taken = photos.slice(0, Math.max(0, room()));
  if (!taken.length) {
    toast(`Uma montagem leva até ${MAX_PHOTOS} fotos.`);
    return;
  }
  const mine = session;
  studio.loading += taken.length;
  let failed = 0;
  let first = -1;
  for (const file of taken) {
    try {
      const photo = await importPhoto(file, file.name.replace(/\.[^.]+$/, '') || 'foto', record.id);
      if (mine !== session) return;
      checkpoint();
      doc().photos.push(photo);
      if (first < 0) first = doc().photos.length - 1;
      touched();
      await bring(photo, mine);
    } catch (err) {
      console.error(err);
      failed++;
    } finally {
      if (mine === session) studio.loading--;
    }
  }
  if (mine !== session) return;
  if (first >= 0) select(first);
  if (failed) toast(failed === 1 ? 'Um arquivo não abriu e ficou de fora.' : `${failed} arquivos não abriram e ficaram de fora.`);
  else if (taken.length < photos.length) toast(`Uma montagem leva até ${MAX_PHOTOS} fotos. Entraram as ${taken.length} primeiras.`);
}

/** Opens a photo of the post in the editor. The way back from there is the table. */
export async function retouch(index: number): Promise<void> {
  const record = studio.record;
  if (!record || ui.opening) return;
  const photo = record.doc.photos[index];
  if (!photo) return;
  await save();
  const project = await loadProject(photo.id).catch(() => undefined);
  openProject(photo.id, project?.thumb as Blob, { id: record.id, ids: record.doc.photos.map((p) => p.id), index });
}

/** The pictures of some photos changed away from the table: they are brought again. */
async function refresh(ids: readonly string[], mine: number): Promise<void> {
  for (const id of ids) {
    const photo = studio.record?.doc.photos.find((p) => p.id === id);
    if (photo && mine === session) await bring(photo, mine).catch((err) => console.error(err));
  }
}

/**
 * The filter of the selected photo goes to every other photo of the post, so the slides read as one set. Each
 * photo keeps its own retouch under it. What they had before is kept, to take the filter back.
 */
export async function spreadFilter(): Promise<void> {
  const record = studio.record;
  const from = record?.doc.photos[studio.selected];
  const filter = from ? studio.filters[from.id] : null;
  if (!record || !from || !filter || studio.spreading || studio.loading) return;
  const mine = session;
  const others = record.doc.photos.filter((p) => p.id !== from.id).map((p) => p.id);
  const task = new Task([{ id: 'spread', label: 'Passando o filtro', weight: 1 }]);
  task.stage('spread');
  studio.spreading = task;
  studio.loading++;
  try {
    const { spreadFilter: spread } = await import('./spread');
    const result = await spread(others, filter, (done, total) => task.report(done / total, done < total ? `foto ${done + 1} de ${total}` : ''));
    if (mine !== session) return;
    await refresh(result.changed.map((b) => b.id), mine);
    if (mine !== session) return;
    spreadBack = result.changed.length ? result.changed : null;
    studio.canUnspread = !!spreadBack;
    const n = result.changed.length;
    const words = [n === 0 ? 'O filtro não foi para nenhuma outra foto.' : n === 1 ? 'O filtro foi para a outra foto.' : `O filtro foi para as outras ${n} fotos.`];
    if (result.skipped) words.push(result.skipped === 1 ? 'Uma ficou como estava: tem o formato do rosto mexido, e o filtro dela se põe no editor.' : `${result.skipped} ficaram como estavam: têm o formato do rosto mexido, e o filtro delas se põe no editor.`);
    if (result.failed) words.push(result.failed === 1 ? 'Uma não abriu.' : `${result.failed} não abriram.`);
    toast(words.join(' '), 5200);
    scheduleSave();
  } catch (err) {
    console.error(err);
    if (mine === session) toast('Não consegui passar o filtro para as outras fotos. Elas continuam como estavam.');
  } finally {
    task.stop();
    if (mine === session) {
      studio.spreading = null;
      studio.loading--;
    }
  }
}

/** The photos get back what they had before the last filter went to all of them. */
export async function unspreadFilter(): Promise<void> {
  const back = spreadBack;
  if (!back || studio.spreading || studio.loading) return;
  const mine = session;
  spreadBack = null;
  studio.canUnspread = false;
  studio.loading++;
  try {
    const { unspread } = await import('./spread');
    await unspread(back);
    if (mine !== session) return;
    await refresh(back.map((b) => b.id), mine);
    if (mine === session) toast('As outras fotos voltaram a como estavam.');
    scheduleSave();
  } catch (err) {
    console.error(err);
  } finally {
    if (mine === session) studio.loading--;
  }
}
