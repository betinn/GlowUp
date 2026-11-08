/** UI actions that coordinate the engine, tool chunks and shared state. */

import { DEFAULT_BRUSH, type BrushSettings } from '../core/brush';
import { ensureField, ensureHeal, ensureLayerTool } from '../tools/activate';
import { toolById, type ToolMeta } from '../tools/catalog';
import { dropToolLimit, forgetFreedTools, limitTool } from './facepick.svelte';
import { bump, engine, toast, ui } from './state.svelte';

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
}

export async function selectTool(id: string | null): Promise<void> {
  const e = engine();
  e.commit();
  const meta: ToolMeta | undefined = id ? toolById(id) : undefined;
  if (ui.tool === 'crop' && id !== 'crop') e.setCropEditing(false);
  dropToolLimit();
  ui.tool = id;
  ui.toolModule = null;
  ui.showHint = true;
  try {
    switch (meta?.kind) {
      case 'mask': {
        const mod = await ensureLayerTool(e, meta.layer!);
        if (ui.tool !== id) return;
        e.brush = brushFor(meta.id, mod.brush);
        e.setTool('mask', meta.layer!);
        ui.toolModule = mod;
        if (meta.region) void limitTool(e, meta.id, meta.region);
        break;
      }
      case 'heal':
        await ensureHeal(e);
        if (ui.tool !== id) return;
        e.brush = brushFor('heal', HEAL_BRUSH);
        e.setTool('heal');
        if (meta.region) void limitTool(e, meta.id, meta.region);
        break;
      case 'liquify':
        await ensureField(e);
        e.brush = brushFor('liquify', LIQUIFY_BRUSH);
        e.setTool('liquify');
        break;
      case 'crop':
        e.setTool('none');
        e.setCropEditing(true);
        break;
      default:
        e.setTool('none');
    }
  } catch (err) {
    console.error(err);
    toast('Essa ferramenta não carregou. Confere a conexão e tenta de novo.');
    ui.tool = null;
  }
  bump();
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
