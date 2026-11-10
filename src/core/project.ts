/**
 * Local projects in IndexedDB: the original file plus the edit stack.
 * Nothing here leaves the device.
 */

import { DEFAULT_ADJUST, FILTER_MASK, PHOTO_MASKS, type EditDoc, type LayerId } from './doc';
import type { Engine } from './engine';

const DB_NAME = 'glowup';
const STORE = 'projects';
const ORIGINALS = 'originals';
const MAX_PROJECTS = 6;

export interface ProjectSummary {
  id: string;
  name: string;
  updated: number;
  width: number;
  height: number;
  thumb: Blob;
}

export interface ProjectRecord extends ProjectSummary {
  doc: EditDoc;
  masks: Partial<Record<LayerId, Blob>>;
  field: Blob | null;
  /**
   * The field of the sliders and the automatic mode, so a project opens with no detector. Older projects leave
   * this out, and their automatic mode is inside `field`.
   */
  shape?: Blob | null;
  /** The field of Brincar, so a project opens with no detector. Older projects leave this out: nothing playful. */
  fun?: Blob | null;
}

/**
 * The project itself can never open: it is missing a part, or its data does not make sense. Only this
 * error deletes a project. Anything else, as a failed read or a lost GPU, may pass, and the project stays.
 */
export class InvalidProjectError extends Error {
  constructor(reason: string) {
    super(`invalid-project: ${reason}`);
    this.name = 'InvalidProjectError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const allNumbers = (o: Record<string, unknown>, keys: readonly string[]) => keys.every((k) => Number.isFinite(o[k]));

/** The playful part of a document makes sense: numbers per face, and stickers with a place. */
function funOk(fun: unknown): boolean {
  if (!isObject(fun)) return false;
  const { faces, stickers } = fun;
  const point = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  if (faces !== undefined && !(Array.isArray(faces) && faces.every((f) => isObject(f) && point(f.at) && isObject(f.values) && Object.values(f.values).every(Number.isFinite)))) return false;
  const stickerOk = (s: unknown) => isObject(s) && typeof s.kind === 'string' && Number.isInteger(s.id) && (s.at === null || point(s.at)) && allNumbers(s, ['x', 'y', 'size', 'angle']);
  return stickers === undefined || (Array.isArray(stickers) && stickers.every(stickerOk));
}

/** Why a document cannot open, or null when it can. */
function docProblem(doc: unknown): string | null {
  if (!isObject(doc)) return 'no document';
  if (doc.version !== 1) return 'version';
  const { width, height, adjust, filter, blur, crop, layers, heals } = doc;
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) < 1 || (height as number) < 1) return 'size';
  if (!isObject(adjust) || !allNumbers(adjust, Object.keys(DEFAULT_ADJUST))) return 'adjust';
  if (!isObject(filter) || !allNumbers(filter, ['intensity']) || !(filter.id === null || typeof filter.id === 'string')) return 'filter';
  if (!isObject(blur) || !['off', 'radial', 'tilt'].includes(blur.mode as string)) return 'blur';
  if (!allNumbers(blur, ['cx', 'cy', 'focus', 'feather', 'angle', 'strength'])) return 'blur';
  if (!isObject(crop) || !allNumbers(crop, ['angle', 'quarter', 'cx', 'cy', 'cw', 'ch'])) return 'crop';
  if (!isObject(layers) || !Object.values(layers).every((l) => isObject(l) && isObject(l.params))) return 'layers';
  if (!Array.isArray(heals)) return 'heals';
  if (doc.fun !== undefined && !funOk(doc.fun)) return 'fun';
  const healOk = (h: unknown) =>
    isObject(h) && allNumbers(h, ['hardness', 'du', 'dv']) && Array.isArray(h.dabs) && h.dabs.every((d) => isObject(d) && allNumbers(d, ['u', 'v', 'r']));
  if (!heals.every(healOk)) return 'heals';
  return typeof doc.hasField === 'boolean' ? null : 'field flag';
}

/** What came out of the store, once it is known to make sense. Throws `InvalidProjectError` when it does not. */
export function validProject(record: unknown, original: unknown): { record: ProjectRecord; original: Blob } {
  if (!isObject(record)) throw new InvalidProjectError('no record');
  if (!(original instanceof Blob) || original.size === 0) throw new InvalidProjectError('no original');
  const problem = docProblem(record.doc);
  if (problem) throw new InvalidProjectError(problem);
  const { masks, field, thumb } = record;
  if (!isObject(masks) || !Object.values(masks).every((m) => m instanceof Blob)) throw new InvalidProjectError('masks');
  if (!(field === null || field instanceof Blob)) throw new InvalidProjectError('field');
  if (!(record.shape === undefined || record.shape === null || record.shape instanceof Blob)) throw new InvalidProjectError('shape');
  if (!(record.fun === undefined || record.fun === null || record.fun instanceof Blob)) throw new InvalidProjectError('fun');
  if (!(thumb instanceof Blob)) throw new InvalidProjectError('thumb');
  return { record: record as unknown as ProjectRecord, original };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.result.createObjectStore(ORIGINALS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = t.onabort = () => {
      db.close();
      reject(t.error);
    };
  });
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await tx<ProjectRecord[]>('readonly', (s) => s.getAll());
  return all
    .map(({ id, name, updated, width, height, thumb }) => ({ id, name, updated, width, height, thumb }))
    .sort((a, b) => b.updated - a.updated);
}

export const loadProject = (id: string) => tx<ProjectRecord | undefined>('readonly', (s) => s.get(id));
export const loadOriginal = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id), ORIGINALS);

export async function deleteProject(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  await tx('readwrite', (s) => s.delete(id), ORIGINALS);
}

/** Deflates bytes when the browser can; a one-byte header says how they are stored. */
export async function pack(data: Uint8Array): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') return new Blob([new Uint8Array([0]), data as BlobPart]);
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  const packed = await new Response(stream).blob();
  return new Blob([new Uint8Array([1]), packed]);
}

/**
 * The bytes `pack` stored. A failed read stays an ordinary error, and so does running out of memory. Bytes
 * that are in hand and do not unpack can never open, so those are an `InvalidProjectError`.
 */
export async function unpack(blob: Blob): Promise<Uint8Array> {
  const stored = new Uint8Array(await blob.arrayBuffer());
  const header = stored[0];
  if (header === 0) return stored.slice(1);
  if (header !== 1) throw new InvalidProjectError('packed data');
  const stream = new Blob([stored.subarray(1)]).stream().pipeThrough(new DecompressionStream('deflate'));
  try {
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (err) {
    if (err instanceof RangeError) throw err;
    throw new InvalidProjectError('packed data');
  }
}

/** Saves the session in the background. Masks are read only when they changed. */
export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private readonly savedRev = new Map<LayerId, number>();
  private masks: ProjectRecord['masks'] = {};
  private field: Blob | null = null;
  private shape: Blob | null = null;
  private fun: Blob | null = null;
  private savedFunRev = -1;
  private thumb: Blob | null = null;
  private originalSaved = false;
  private savedFieldRev = -1;

  constructor(
    private readonly engine: Engine,
    readonly id: string,
    readonly name: string,
    restored?: ProjectRecord,
  ) {
    if (restored) {
      this.masks = { ...restored.masks };
      this.field = restored.field;
      this.shape = restored.shape ?? null;
      this.fun = restored.fun ?? null;
      this.savedFunRev = engine.funRev;
      this.thumb = restored.thumb;
      this.originalSaved = true;
      this.savedFieldRev = engine.fieldRev;
      for (const key of Object.keys(restored.masks) as LayerId[]) {
        this.savedRev.set(key, engine.masks?.rev(key) ?? 0);
      }
    }
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), 1500);
  }

  /** Waits for any save in progress, then writes the latest state. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    await this.running;
    await this.run();
  }

  private run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.save().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.schedule();
      }
    });
    return this.running;
  }

  private async save(): Promise<void> {
    const { engine } = this;
    const { source, masks } = engine;
    if (!source || !masks || engine.stroking || engine.exporting) return;
    try {
      for (const id of masks.ids()) {
        const rev = masks.rev(id);
        const kept = !!engine.doc.layers[id] || id === FILTER_MASK || PHOTO_MASKS.includes(id);
        if (this.savedRev.get(id) === rev || !kept) continue;
        const bytes = await masks.read(id);
        if (bytes) this.masks[id] = await pack(bytes);
        this.savedRev.set(id, rev);
      }
      // While a face slider has its finished field on the way, the photo shows a rough one: it waits for the next save.
      if (this.savedFieldRev !== engine.fieldRev && !engine.shapePending) {
        this.savedFieldRev = engine.fieldRev;
        const data = engine.field?.serialize();
        this.field = data && engine.doc.hasField && !engine.field?.brushEmpty() ? await pack(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) : null;
        const shape = engine.field?.shapeData();
        this.shape = shape && engine.doc.hasField ? await pack(new Uint8Array(shape.buffer, shape.byteOffset, shape.byteLength)) : null;
      }
      // The same for Brincar.
      if (this.savedFunRev !== engine.funRev && !engine.funPending) {
        this.savedFunRev = engine.funRev;
        const fun = engine.fun?.data();
        this.fun = fun ? await pack(new Uint8Array(fun.buffer, fun.byteOffset, fun.byteLength)) : null;
      }
      if (!this.originalSaved) {
        // The original is written once. Later saves touch only the small edit stack.
        await tx('readwrite', (s) => s.put(source.blob, this.id), ORIGINALS);
        this.originalSaved = true;
      }
      this.thumb ??= await source.thumbnail(320);
      const record: ProjectRecord = {
        id: this.id,
        name: this.name,
        updated: Date.now(),
        width: engine.doc.width,
        height: engine.doc.height,
        thumb: this.thumb,
        doc: engine.doc,
        masks: this.masks,
        field: this.field,
        shape: this.shape,
        fun: this.fun,
      };
      await tx('readwrite', (s) => s.put(structuredClone(record)));
      await this.prune();
    } catch (err) {
      // Storage may be full or blocked in a private window. Editing continues without saving.
      console.warn('autosave', err);
    }
  }

  private async prune(): Promise<void> {
    const list = await listProjects();
    for (const p of list.slice(MAX_PROJECTS)) await deleteProject(p.id);
  }
}
