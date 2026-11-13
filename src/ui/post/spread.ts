/**
 * One filter on every photo of a post, so the slides read as one set. Each photo is opened on an engine of its
 * own, away from the screen, with the retouch it has, takes the filter, and leaves a new picture of itself, as
 * it would on the way out of the editor.
 */

import { FILTER_MASK, type EditDoc, type FilterState } from '../../core/doc';
import { Engine } from '../../core/engine';
import { renderImage } from '../../core/export';
import { loadOriginal, loadProject, patchProject, validProject, type PhotoPrint, type ProjectRecord } from '../../core/project';
import { SourceImage } from '../../core/source';
import { syncFilter } from '../../presets/apply';
import { restoreProject } from '../restore';

/** What a photo had before the filter came, to put it back. */
export interface Before {
  id: string;
  filter: FilterState;
  mask: Blob | undefined;
  print: PhotoPrint | null | undefined;
  printStale: boolean | undefined;
}

export interface SpreadResult {
  /** The photos that took the filter, with what they had before. */
  changed: Before[];
  /** Photos left as they were: the shape of a face was changed in them, and only the editor draws that whole. */
  skipped: number;
  /** Photos that did not open. */
  failed: number;
}

/**
 * A photo with a face reshaped, or with Brincar on a face, uncovers background that a model completes in the
 * editor. Away from the editor that part would come out as a quick guess, so such a photo is left alone.
 */
const needsEditor = (doc: EditDoc) => doc.hasField || !!doc.shapes?.some((s) => Object.keys(s.values).length) || !!doc.fun?.faces?.length;

async function give(record: ProjectRecord, original: Blob, filter: { id: string; intensity: number }): Promise<void> {
  const engine = new Engine(document.createElement('canvas'));
  try {
    const source = await SourceImage.decode(original);
    try {
      await restoreProject(engine, record, source);
    } catch (err) {
      if (engine.source !== source) source.close();
      throw err;
    }
    // The filter goes on the whole photo: an area chosen for another filter would make no sense for this one.
    engine.doc.filter = { id: filter.id, intensity: filter.intensity };
    await syncFilter(engine);
    engine.ctx?.invalidate('healed');
    const canvas = await renderImage(engine, { tile: () => {} });
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.97 });
    const masks = { ...record.masks };
    delete masks[FILTER_MASK];
    await patchProject(record.id, { doc: structuredClone(engine.doc), masks, print: { blob, w: canvas.width, h: canvas.height }, printStale: false, updated: Date.now() });
  } finally {
    engine.destroy();
  }
}

/** Puts the filter on each of `ids`, one at a time. `each` runs before each photo, with how many are done. */
export async function spreadFilter(ids: readonly string[], filter: { id: string; intensity: number }, each: (done: number, total: number) => void): Promise<SpreadResult> {
  const result: SpreadResult = { changed: [], skipped: 0, failed: 0 };
  for (const [i, id] of ids.entries()) {
    each(i, ids.length);
    try {
      const { record, original } = validProject(await loadProject(id), await loadOriginal(id));
      if (needsEditor(record.doc)) {
        result.skipped++;
        continue;
      }
      const before: Before = { id, filter: structuredClone(record.doc.filter), mask: record.masks[FILTER_MASK], print: record.print, printStale: record.printStale };
      await give(record, original, filter);
      result.changed.push(before);
    } catch (err) {
      console.error(err);
      result.failed++;
    }
  }
  each(ids.length, ids.length);
  return result;
}

/** Each photo gets back the filter and the picture it had. Nothing is drawn again: the old picture was kept. */
export async function unspread(before: readonly Before[]): Promise<void> {
  for (const b of before) {
    const record = await loadProject(b.id);
    if (!record) continue;
    const masks = { ...record.masks };
    if (b.mask) masks[FILTER_MASK] = b.mask;
    await patchProject(b.id, { doc: { ...record.doc, filter: b.filter }, masks, print: b.print, printStale: b.printStale, updated: Date.now() });
  }
}
