/**
 * Puts a saved project back on an engine: the document, the masks, the fields and the scene. The editor opens a
 * project with it, and so does whatever needs the photo with its retouch away from the editor.
 */

import { FILTER_MASK, PHOTO_MASKS, type LayerId } from '../core/doc';
import type { Engine } from '../core/engine';
import { keptLight } from '../core/light/lights';
import { unpackScene } from '../core/light/scene';
import { InvalidProjectError, unpack, type ProjectRecord } from '../core/project';
import type { SourceImage } from '../core/source';
import { ensureDocTools } from '../tools/activate';

export interface RestoreHooks {
  /** The photo is on the engine, and the retouch is about to go back on it. */
  opened?(): Promise<void>;
  /** A mask went back, of so many. */
  mask?(done: number, total: number): void;
}

/**
 * Throws `InvalidProjectError` when the project can never open, and whatever else went wrong otherwise. The
 * record is changed where the project holds what the app no longer has.
 */
export async function restoreProject(e: Engine, record: ProjectRecord, source: SourceImage, hooks: RestoreHooks = {}): Promise<void> {
  if (source.w !== record.doc.width || source.h !== record.doc.height) throw new InvalidProjectError('the document is of another photo');
  // A light that left the menu is dropped: the photo opens with its own light.
  const light = keptLight(record.doc.light);
  if (light) record.doc.light = light;
  else delete record.doc.light;
  await e.open(source, record.doc);
  await hooks.opened?.();
  await ensureDocTools(e);
  const masks = Object.entries(record.masks) as [LayerId, Blob][];
  for (const [i, [id, blob]] of masks.entries()) {
    const bytes = await unpack(blob);
    const store = e.masks!;
    // The mask of a tool that no longer exists stays out, so the next save drops it.
    if (id !== FILTER_MASK && !PHOTO_MASKS.includes(id) && !e.doc.layers[id]) continue;
    if (bytes.length === store.w * store.h) store.write(id, bytes);
    // A mask made for another screen size is lost, and a filter with no mask would just vanish.
    else if (id === FILTER_MASK) e.doc.filter = { ...e.doc.filter, masked: false, reach: undefined };
    hooks.mask?.(i + 1, masks.length);
  }
  if (record.field && e.field) {
    const bytes = await unpack(record.field);
    if (bytes.byteLength !== e.field.serialize().byteLength) throw new InvalidProjectError('field size');
    e.field.restore(new Float32Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength / 4));
  }
  if (record.shape && e.field) {
    const bytes = await unpack(record.shape);
    // The whole, and after it the shares of the lips and of the head, when the project has them.
    if (![1, 2, 3].includes(bytes.byteLength / e.field.serialize().byteLength)) throw new InvalidProjectError('field size');
    e.field.restoreShape(new Float32Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength / 4));
  }
  if (record.fun && e.fun) {
    const bytes = await unpack(record.fun);
    // The whole, and after it the share of the head, when the project has one.
    const size = e.fun.gridSize.w * e.fun.gridSize.h * 8;
    if (![1, 2].includes(bytes.byteLength / size)) throw new InvalidProjectError('fun size');
    e.fun.restore(new Float32Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength / 4));
  }
  if (record.scene) {
    // A scene that does not read is left out, and the light waits for the menu to look at the photo again.
    e.setScene(unpackScene(await unpack(record.scene)));
  }
  // Before this field, the automatic mode was written into the strokes, so there is no strength to move.
  if (record.shape === undefined) delete e.doc.shapeAmount;
  await e.refreshLock();
}
