/** Loads tool chunks on demand and registers them with the engine. */

import type { Engine } from '../core/engine';
import type { LayerId } from '../core/doc';
import { loaders } from './catalog';
import type { ToolModule } from './types';

const modules = new Map<LayerId, ToolModule>();

export async function ensureLayerTool(engine: Engine, id: LayerId): Promise<ToolModule> {
  let mod = modules.get(id);
  if (!mod) {
    mod = (await loaders[id]()).default;
    modules.set(id, mod);
  }
  engine.registerTool(mod.pass, mod.defaults);
  return mod;
}

export async function ensureHeal(engine: Engine): Promise<void> {
  if (engine.heal) return;
  const { createHeal } = await import('./heal/index');
  engine.registerHeal(createHeal(engine.glc));
}

export async function ensureField(engine: Engine): Promise<void> {
  if (engine.field) return;
  const { createField } = await import('./liquify/index');
  engine.registerField(createField(engine.glc, engine.doc.width, engine.doc.height));
}

/** Loads Brincar: its field and the art of its stickers. */
export async function ensureFun(engine: Engine): Promise<void> {
  if (engine.fun) return;
  const { createFun } = await import('../core/fun/controller');
  if (engine.fun || !engine.source) return;
  engine.registerFun(createFun(engine.glc, engine.doc.width, engine.doc.height, () => engine.refreshFun()));
}

/** Loads everything a saved document needs before its first render. */
export async function ensureDocTools(engine: Engine): Promise<void> {
  const { doc } = engine;
  const ids = Object.keys(doc.layers) as LayerId[];
  // A project may hold a tool that no longer exists, as the hair length that was tried and removed.
  for (const id of ids) if (!loaders[id]) delete doc.layers[id];
  await Promise.all(ids.filter((id) => loaders[id]).map((id) => ensureLayerTool(engine, id)));
  if (doc.heals.length) await ensureHeal(engine);
  if (doc.hasField) await ensureField(engine);
  if (doc.fun) await ensureFun(engine);
}
