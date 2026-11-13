/** UI actions that coordinate the engine, tool chunks and shared state. */

import { DEFAULT_BRUSH, type BrushSettings } from '../core/brush';
import type { Engine } from '../core/engine';
import type { LayerId } from '../core/doc';
import { applyPreset } from '../presets/apply';
import type { RetouchPreset } from '../presets/recipes';
import { ensureField, ensureHeal, ensureLayerTool } from '../tools/activate';
import { autoAction } from '../tools/auto';
import { toolById, TOOLS, type ToolMeta } from '../tools/catalog';
import { applyToolFills, clearWork, dropToolLimit, forgetFreedTools, hasWork, limitTool, prepareToolFills, refillRegion, resetLockState, toolLimit } from './facepick.svelte';
import { dropShapeTool, forgetShapeFaces, openShapeTool, sectionHeld, setSectionOn } from './shapepick.svelte';
import { forgetFunFaces } from './funpick.svelte';
import { ensureScene } from './lights.svelte';
import { regionShow } from './regionshow.svelte';
import { bump, engine, toast, ui } from './state.svelte';
import { during } from './wait.svelte';

/** Brush settings are remembered per tool during the session. */
const brushes = new Map<string, BrushSettings>();

const HEAL_BRUSH: Partial<BrushSettings> = { size: 0.012, hardness: 0.55, flow: 1 };
const LIQUIFY_BRUSH: Partial<BrushSettings> = { size: 0.07, hardness: 0.5 };
const FILTER_BRUSH: Partial<BrushSettings> = { size: 0.04, hardness: 0.3, flow: 1 };

function brushFor(id: string, defaults: Partial<BrushSettings> | undefined): BrushSettings {
  let b = brushes.get(id);
  if (!b) {
    b = { ...DEFAULT_BRUSH, ...defaults };
    brushes.set(id, b);
  }
  return b;
}

/** The brush that touches up the area of a filter. */
export const filterBrush = () => brushFor('filter-area', FILTER_BRUSH);

export function resetToolMemory(): void {
  brushes.clear();
  forgetFreedTools();
  resetLockState(engine());
  forgetShapeFaces();
  forgetFunFaces();
}

export async function selectTool(id: string | null): Promise<void> {
  const e = engine();
  e.commit();
  const meta: ToolMeta | undefined = id ? toolById(id) : undefined;
  if (ui.tool === 'crop' && id !== 'crop') e.setCropEditing(false);
  dropToolLimit();
  dropShapeTool();
  e.showMatteLine = false;
  e.requestRender();
  ui.tool = id;
  ui.toolModule = null;
  ui.showHint = true;
  try {
    // The code of a tool comes on its first use, and its search starts before this wait ends, so the photo
    // shows one wait from the tap to the result.
    if (meta && LOADED_KINDS.has(meta.kind)) await during(`Abrindo ${meta.label}`, () => openTool(e, meta));
    else await openTool(e, meta);
  } catch (err) {
    console.error(err);
    toast('Essa ferramenta não carregou. Confere a conexão e tenta de novo.');
    ui.tool = null;
  }
  bump();
}

/** The kinds of tool whose code loads on demand. */
const LOADED_KINDS = new Set<string>(['mask', 'heal', 'liquify', 'shape']);

/** Gives the engine the tool the person chose. Stops when another tool was chosen meanwhile. */
async function openTool(e: Engine, meta: ToolMeta | undefined): Promise<void> {
  const id = meta?.id ?? null;
  switch (meta?.kind) {
    case 'mask': {
      const mod = await ensureLayerTool(e, meta.layer!);
      if (ui.tool !== id) return;
      e.brush = brushFor(meta.id, mod.brush);
      e.setTool('mask', meta.layer!);
      ui.toolModule = mod;
      break;
    }
    case 'heal':
      await ensureHeal(e);
      if (ui.tool !== id) return;
      e.brush = brushFor('heal', HEAL_BRUSH);
      e.setTool('heal');
      break;
    case 'liquify':
      await ensureField(e);
      if (ui.tool !== id) return;
      e.brush = brushFor('liquify', LIQUIFY_BRUSH);
      e.setTool('liquify');
      break;
    case 'shape':
      await ensureField(e);
      if (ui.tool !== id) return;
      e.setTool('none');
      openShapeTool(e);
      break;
    case 'crop':
      e.setTool('none');
      e.setCropEditing(true);
      break;
    default:
      e.setTool('none');
  }
  // Last, because opening a tool drops the limit of the one before.
  if (meta && (meta.region || autoAction(meta.id))) void limitTool(e, meta.id, meta.region ?? null);
}

/** Turns the mark of the touched area on or off. Only a brush with a mask has one. */
export function toggleMark(): void {
  const e = engine();
  if (e.mode !== 'mask') return;
  e.showMask = !e.showMask;
  e.requestRender();
  bump();
}

/** Brush slider range: exponential, so small sizes get fine control. */
export const SIZE_MIN = 0.002;
export const SIZE_MAX = 0.2;

export const sizeToSlider = (s: number) => (Math.log(s / SIZE_MIN) / Math.log(SIZE_MAX / SIZE_MIN)) * 100;
export const sliderToSize = (v: number) => SIZE_MIN * (SIZE_MAX / SIZE_MIN) ** (v / 100);

export function changeBrushSize(factor: number): void {
  const e = engine();
  e.brush.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, e.brush.size * factor));
  bump();
}

/** Tools with an effect of their own on the photo, so a second tap on the tool can turn it off. */
export const switchable = (id: string) => {
  const kind = toolById(id)?.kind;
  return kind === 'mask' || kind === 'heal' || kind === 'shape' || !!autoAction(id);
};

/**
 * A second tap on the open tool. With an effect on the photo, it takes it off, as one undo step, as the
 * trash button of the panel did. Without one, the automatic mode applies it again. While the detector
 * searches or the view shows the region, the tap waits for nothing and does nothing.
 */
export async function toggleEffect(id: string): Promise<void> {
  const e = engine();
  const meta = toolById(id);
  if (!meta || !switchable(id) || toolLimit.state === 'searching' || regionShow.phase || ui.painting) return;
  if (meta.section) {
    // Off keeps the numbers, so the next tap brings the same result back.
    if (hasWork(e, id)) setSectionOn(e, meta.section, false);
    else if (sectionHeld(e, meta.section)) setSectionOn(e, meta.section, true);
  } else if (hasWork(e, id)) {
    await during(`Tirando ${meta.label}`, () => clearWork(e, id));
  } else if (toolLimit.tool === id && toolLimit.mode === 'auto' && toolLimit.state === 'on') {
    refillRegion(e);
  }
  bump();
}

/** How a recipe landed on the photo. */
export interface RecipeOutcome {
  /** Tools the automatic mode filled. */
  filled: string[];
  /** Tools of the recipe the photo gave nothing to work on. Their settings are in the document all the same. */
  missed: string[];
  /** The detector did not load. The settings of the recipe were applied, with no mask. */
  failed: boolean;
  /** The recipe has a light, and the models that read the scene did not load. It went on without its light. */
  unlit: boolean;
  /** Another search or another photo took over, and nothing was applied. */
  stopped: boolean;
}

export interface RecipeOptions {
  /** Fill over the work a mask holds. */
  refill?: boolean;
  fadeMs?: number;
  /** Masks to empty in the same undo step, so a look can take the place of another. */
  clear?: LayerId[];
}

/**
 * Applies a recipe and fills the masks of its tools from the detector, all as one undo step, so one undo
 * takes the look off. The open tool closes first. A mask holding work keeps it, unless `refill`. A recipe
 * with a light reads the scene of the photo first, once per photo. The search shows on `facePick.task`, for
 * whoever wants a progress card. Throws when the code of a tool does not load, with the photo as it was.
 */
export async function applyRecipe(preset: RetouchPreset, { refill = false, fadeMs, clear = [] }: RecipeOptions = {}): Promise<RecipeOutcome> {
  const e = engine();
  await selectTool(null);
  const layers = Object.keys(preset.tools) as LayerId[];
  const tools = layers.flatMap((layer) => TOOLS.find((t) => t.layer === layer)?.id ?? []);
  const { fills, missed, failed, stopped } = await prepareToolFills(e, tools, { refill });
  const none = { filled: [], missed: [], failed: false, unlit: false };
  if (stopped) return { ...none, stopped: true };
  // A detector that failed leaves the scene for the next try: it needs the same detector.
  const scene = preset.light && !failed ? await ensureScene(e) : 'ready';
  if (scene === 'stopped') return { ...none, stopped: true };
  const lit = scene === 'ready' && !failed;
  await e.history.group('Look', async () => {
    // The settings first: when the code of a tool does not load, nothing was cleared yet.
    await applyPreset(e, preset, lit);
    if (clear.length) await e.resetParts('Look', { layers: clear });
    await applyToolFills(e, fills, { label: 'Look', fadeMs });
  });
  bump();
  return { filled: [...fills.keys()], missed, failed, unlit: !!preset.light && !lit && !failed, stopped: false };
}
