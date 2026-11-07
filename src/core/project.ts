/**
 * Local projects in IndexedDB: the original file plus the edit stack.
 * Nothing here leaves the device.
 */

import type { EditDoc, LayerId } from './doc';
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

export async function unpack(blob: Blob): Promise<Uint8Array> {
  const header = new Uint8Array(await blob.slice(0, 1).arrayBuffer())[0];
  const body = blob.slice(1);
  if (header === 0) return new Uint8Array(await body.arrayBuffer());
  const stream = body.stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Saves the session in the background. Masks are read only when they changed. */
export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving = false;
  private again = false;
  private readonly savedRev = new Map<LayerId, number>();
  private masks: ProjectRecord['masks'] = {};
  private field: Blob | null = null;
  private thumb: Blob | null = null;
  private originalSaved = false;
  private savedFieldRev = -1;

  constructor(
    private readonly engine: Engine,
    readonly id: string,
    private readonly name: string,
    restored?: ProjectRecord,
  ) {
    if (restored) {
      this.masks = { ...restored.masks };
      this.field = restored.field;
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
    this.timer = setTimeout(() => void this.save(), 1500);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    await this.save();
  }

  private async save(): Promise<void> {
    if (this.saving) {
      this.again = true;
      return;
    }
    const { engine } = this;
    const { source, masks } = engine;
    if (!source || !masks || engine.stroking || engine.exporting) return;
    this.saving = true;
    try {
      for (const id of masks.ids()) {
        const rev = masks.rev(id);
        if (this.savedRev.get(id) === rev || !engine.doc.layers[id]) continue;
        const bytes = await masks.read(id);
        if (bytes) this.masks[id] = await pack(bytes);
        this.savedRev.set(id, rev);
      }
      if (this.savedFieldRev !== engine.fieldRev) {
        this.savedFieldRev = engine.fieldRev;
        const data = engine.field?.serialize();
        this.field = data && engine.doc.hasField ? await pack(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) : null;
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
      };
      await tx('readwrite', (s) => s.put(structuredClone(record)));
      await this.prune();
    } catch (err) {
      // Storage may be full or blocked in a private window. Editing continues without saving.
      console.warn('autosave', err);
    } finally {
      this.saving = false;
      if (this.again) {
        this.again = false;
        this.schedule();
      }
    }
  }

  private async prune(): Promise<void> {
    const list = await listProjects();
    for (const p of list.slice(MAX_PROJECTS)) await deleteProject(p.id);
  }
}
