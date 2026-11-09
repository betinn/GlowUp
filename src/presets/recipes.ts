/** Retouch presets: saved combinations of adjustments, a filter and tool settings. */

import { DEFAULT_ADJUST, type Adjustments, type EditDoc, type FilterState, type LayerId, type Params } from '../core/doc';

export interface RetouchPreset {
  id: string;
  name: string;
  note: string;
  adjust: Partial<Adjustments>;
  filter: FilterState;
  tools: Partial<Record<LayerId, Params>>;
}

/** The looks of Glow na Hora. They go on any face, so they stay on what flatters any face: no color on the lips. */
export const LOOKS: readonly RetouchPreset[] = [
  {
    id: 'natural',
    name: 'Natural',
    note: 'Só tira o cansaço da foto.',
    adjust: { contrast: 6, vibrance: 8, sharpen: 12 },
    filter: { id: 'pele-limpa', intensity: 0.5 },
    tools: {
      smooth: { mode: 'light', strength: 60, texture: 100 },
      undereye: { light: 55, tone: 65 },
      whiten: { whiten: 50, bright: 20 },
      sclera: { whiten: 40, bright: 15 },
    },
  },
  {
    id: 'glow',
    name: 'Glow',
    note: 'Pele com luz própria.',
    adjust: { exposure: 6, shadows: 14, highlights: -10, vibrance: 10, temperature: 6 },
    filter: { id: 'mel', intensity: 0.35 },
    tools: {
      smooth: { mode: 'light', strength: 65, texture: 95 },
      highlight: { intensity: 35, glow: 40 },
      blush: { opacity: 12 },
    },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    note: 'Contraste seco, cara de capa.',
    adjust: { contrast: 18, highlights: -14, shadows: -6, saturation: -8, sharpen: 24, vignette: 14 },
    filter: { id: 'capa', intensity: 0.7 },
    tools: {
      smooth: { mode: 'light', strength: 65, texture: 110 },
      contour: { opacity: 22 },
      sparkle: { contrast: 65, sharp: 60 },
    },
  },
  {
    id: 'domingo',
    name: 'Domingo',
    note: 'Quente, sem pressa.',
    adjust: { exposure: 4, contrast: -6, shadows: 18, temperature: 12, grain: 10 },
    filter: { id: 'verao-78', intensity: 0.45 },
    tools: { smooth: { mode: 'light', strength: 50, texture: 100 } },
  },
  {
    id: 'preto-e-branco',
    name: 'Retrato P&B',
    note: 'Foco no olhar.',
    adjust: { contrast: 14, shadows: 8, sharpen: 20, grain: 16, vignette: 18 },
    filter: { id: 'prata', intensity: 1 },
    tools: { smooth: { mode: 'light', strength: 55, texture: 115 } },
  },
];

/** Applies a preset to the document. Unlisted adjustments go back to zero. */
export function applyPresetToDoc(doc: EditDoc, preset: RetouchPreset): void {
  doc.adjust = { ...DEFAULT_ADJUST, ...preset.adjust };
  // A recipe says which filter, not where: the area chosen on this photo stays.
  doc.filter = { ...doc.filter, ...preset.filter };
  for (const [id, params] of Object.entries(preset.tools) as [LayerId, Params][]) {
    const layer = doc.layers[id];
    if (layer) Object.assign(layer.params, params);
  }
}

/** The settings of a preset are in the document, untouched. Masks do not count: a mouth may hold no teeth. */
function wears(doc: EditDoc, preset: RetouchPreset): boolean {
  const adjust: Adjustments = { ...DEFAULT_ADJUST, ...preset.adjust };
  if ((Object.keys(adjust) as (keyof Adjustments)[]).some((key) => doc.adjust[key] !== adjust[key])) return false;
  if (doc.filter.id !== preset.filter.id || doc.filter.intensity !== preset.filter.intensity) return false;
  return (Object.entries(preset.tools) as [LayerId, Params][]).every(([id, params]) => {
    const layer = doc.layers[id];
    return !!layer && Object.entries(params).every(([key, value]) => layer.params[key] === value);
  });
}

/**
 * The look the document wears. It is read from the document, so undo, redo and a project opened again
 * all tell the truth, and a look changed by hand no longer counts as that look.
 */
export const appliedLook = (doc: EditDoc): RetouchPreset | undefined => LOOKS.find((look) => wears(doc, look));
