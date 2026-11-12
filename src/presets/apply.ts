/** Connects filters and presets to the engine. LUT data is built on demand. */

import type { Engine } from '../core/engine';
import type { LayerId } from '../core/doc';
import { ensureLayerTool } from '../tools/activate';
import { applyPresetToDoc, type RetouchPreset } from './recipes';

/** Uploads the table of the current document filter, and hands over its grain and vignette. */
export async function syncFilter(engine: Engine): Promise<void> {
  const { pipeline, doc } = engine;
  if (!pipeline) return;
  pipeline.lutMix = doc.filter.intensity;
  const id = doc.filter.id;
  if (id && engine.loadedLut !== id) {
    const { buildLut, lutById } = await import('./luts');
    const filter = lutById(id);
    if (!filter) return;
    pipeline.lut = engine.glc.createLut(33, buildLut(filter, 33), pipeline.lut);
    pipeline.filterGrain = filter.grain ?? 0;
    pipeline.filterVignette = filter.vignette ?? 0;
    engine.loadedLut = id;
  }
  engine.ctx?.invalidate('global');
  engine.requestRender();
}

export async function setFilter(engine: Engine, id: string | null, intensity: number): Promise<void> {
  engine.setFilterState(id, intensity);
  await syncFilter(engine);
}

/** `lit` false leaves the light of the preset out, for a photo with no scene to light. */
export async function applyPreset(engine: Engine, preset: RetouchPreset, lit = true): Promise<void> {
  await Promise.all((Object.keys(preset.tools) as LayerId[]).map((id) => ensureLayerTool(engine, id)));
  engine.applyPatch('Receita', (doc) => applyPresetToDoc(doc, preset, lit));
  await syncFilter(engine);
}
