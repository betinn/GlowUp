/**
 * Posts in IndexedDB, beside the projects. A post keeps the order and the frame of its photos, and each photo is
 * a project of its own, so the editor opens it as any other. Nothing here leaves the device.
 */

import { createDoc } from '../doc';
import { deleteProject, InvalidProjectError, loadOriginal, loadProject, patchProject, POSTS, putProject, tx, type ProjectRecord } from '../project';
import { SourceImage } from '../source';
import { newPhoto, postProblem, type PostDoc, type PostKind, type PostPhoto } from './layout';

/** Posts kept. With up to ten photos each, they are what fills the storage of a phone. */
const MAX_POSTS = 4;

export interface PostSummary {
  id: string;
  name: string;
  updated: number;
  /** The first slide, small. Null until the post was seen once. */
  thumb: Blob | null;
  kind: PostKind;
  count: number;
}

export interface PostRecord {
  id: string;
  name: string;
  updated: number;
  thumb: Blob | null;
  doc: PostDoc;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** What came out of the store, once it is known to make sense. Throws `InvalidProjectError` when it does not. */
export function validPost(record: unknown): PostRecord {
  if (!isObject(record) || typeof record.id !== 'string' || typeof record.name !== 'string') throw new InvalidProjectError('no post');
  const problem = postProblem(record.doc);
  if (problem) throw new InvalidProjectError(`post ${problem}`);
  if (!(record.thumb === null || record.thumb instanceof Blob)) throw new InvalidProjectError('post thumb');
  return record as unknown as PostRecord;
}

export async function listPosts(): Promise<PostSummary[]> {
  const all = await tx<PostRecord[]>('readonly', (s) => s.getAll(), POSTS);
  return all
    .filter((p) => isObject(p) && isObject(p.doc) && Array.isArray(p.doc.photos))
    .map(({ id, name, updated, thumb, doc }) => ({ id, name, updated, thumb, kind: doc.kind, count: doc.photos.length }))
    .sort((a, b) => b.updated - a.updated);
}

export const loadPost = (id: string) => tx<PostRecord | undefined>('readonly', (s) => s.get(id), POSTS);

/** Takes the post off the device, with the photos that are only of it. */
export async function deletePost(id: string): Promise<void> {
  const record = await loadPost(id);
  for (const photo of record?.doc?.photos ?? []) await deleteProject(photo.id);
  await tx('readwrite', (s) => s.delete(id), POSTS);
}

export async function savePost(record: PostRecord): Promise<void> {
  await tx('readwrite', (s) => s.put(structuredClone({ ...record, updated: Date.now() })), POSTS);
  const list = await listPosts();
  for (const old of list.slice(MAX_POSTS)) await deletePost(old.id);
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * A photo joins a post: it becomes a project with no retouch, which the editor opens when the person wants to
 * work on it. Throws what `SourceImage.decode` throws when the file is not a photo this device can open.
 */
export async function importPhoto(file: Blob, name: string, post: string): Promise<PostPhoto> {
  const source = await SourceImage.decode(file);
  try {
    const id = newId('p');
    const record: ProjectRecord = {
      id,
      name,
      updated: Date.now(),
      width: source.w,
      height: source.h,
      thumb: await source.thumbnail(320),
      doc: createDoc(source.w, source.h),
      masks: {},
      field: null,
      post,
    };
    await putProject(record, file);
    return newPhoto(id, source.w, source.h);
  } finally {
    source.close();
  }
}

/** A photo edited on its own joins a post, with its retouch. Null when the project is gone. */
export async function adoptProject(id: string, post: string): Promise<PostPhoto | null> {
  const record = await loadProject(id);
  if (!record) return null;
  await patchProject(id, { post });
  return newPhoto(id, record.print?.w ?? record.width, record.print?.h ?? record.height);
}

/**
 * A photo leaves its post. One with retouch goes back to the photos edited on their own, so the work is not
 * lost; one with none is taken off the device. Returns true when it was kept.
 */
export async function releasePhoto(id: string): Promise<boolean> {
  const record = await loadProject(id);
  if (!record) return false;
  if (record.print || record.printStale) {
    await patchProject(id, { post: undefined, updated: Date.now() });
    return true;
  }
  await deleteProject(id);
  return false;
}

/** How long a photo may wait for its post before it counts as left behind. A post being made is not swept. */
const ORPHAN_AFTER = 10 * 60_000;

/**
 * Photos that name a post that is gone, or that no longer has them: a tab closed in the middle of a change
 * leaves them. They go the way of a photo taken out of a post.
 */
export async function sweepOrphans(now = Date.now()): Promise<void> {
  const [projects, posts] = await Promise.all([tx<ProjectRecord[]>('readonly', (s) => s.getAll()), tx<PostRecord[]>('readonly', (s) => s.getAll(), POSTS)]);
  const held = new Set(posts.flatMap((p) => (isObject(p) && isObject(p.doc) && Array.isArray(p.doc.photos) ? p.doc.photos.map((photo) => `${p.id}/${photo.id}`) : [])));
  for (const project of projects) {
    if (project.post && !held.has(`${project.post}/${project.id}`) && now - project.updated > ORPHAN_AFTER) await releasePhoto(project.id);
  }
}

export interface PhotoFile {
  /** The photo as it goes into the post: with its retouch when it has one, or the original. */
  blob: Blob;
  w: number;
  h: number;
  /** Small, for the row of photos. */
  thumb: Blob | null;
  /** The retouch changed after this picture was made. Opening the photo in the editor brings it up to date. */
  stale: boolean;
  /** The filter on the whole photo, if it has one. */
  filter: { id: string; intensity: number } | null;
}

/** The file of a photo of a post. Null when its project is gone. */
export async function photoFile(id: string): Promise<PhotoFile | null> {
  const record = await loadProject(id);
  if (!record) return null;
  const thumb = record.thumb instanceof Blob ? record.thumb : null;
  const { filter: f } = record.doc;
  const filter = f?.id && !f.masked ? { id: f.id, intensity: f.intensity } : null;
  const stale = !!record.printStale;
  if (record.print) return { blob: record.print.blob, w: record.print.w, h: record.print.h, thumb, stale, filter };
  const original = await loadOriginal(id);
  if (!(original instanceof Blob)) return null;
  return { blob: original, w: record.width, h: record.height, thumb, stale, filter };
}
