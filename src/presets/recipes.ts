/** Retouch presets: saved combinations of adjustments, a filter and tool settings. */

import { DEFAULT_ADJUST, type Adjustments, type EditDoc, type FilterState, type LayerId, type Params } from '../core/doc';

export interface RetouchPreset {
  id: string;
  name: string;
  note: string;
  adjust: Partial<Adjustments>;
  filter: FilterState;
  tools: Partial<Record<LayerId, Params>>;
  custom?: boolean;
}

export const BUILTIN_PRESETS: RetouchPreset[] = [
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
    },
  },
  {
    id: 'glow',
    name: 'Glow',
    note: 'Pele com luz própria.',
    adjust: { exposure: 6, shadows: 14, highlights: -10, vibrance: 10, temperature: 6 },
    filter: { id: 'mel', intensity: 0.35 },
    tools: {
      smooth: { mode: 'light', strength: 80, texture: 95 },
      highlight: { intensity: 70, glow: 65 },
      blush: { opacity: 30 },
    },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    note: 'Contraste seco, cara de capa.',
    adjust: { contrast: 18, highlights: -14, shadows: -6, saturation: -8, sharpen: 24, vignette: 14 },
    filter: { id: 'capa', intensity: 0.7 },
    tools: {
      smooth: { mode: 'strong', strength: 65, texture: 110 },
      contour: { opacity: 45 },
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
    id: 'festa',
    name: 'Festa',
    note: 'Olho aceso, make marcada.',
    adjust: { contrast: 12, vibrance: 16, sharpen: 16 },
    filter: { id: 'neon-baixo', intensity: 0.3 },
    tools: {
      sparkle: { contrast: 75, sharp: 65 },
      lips: { opacity: 70, shine: 45 },
      highlight: { intensity: 60, glow: 55 },
    },
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
  doc.filter = { ...preset.filter };
  for (const [id, params] of Object.entries(preset.tools) as [LayerId, Params][]) {
    const layer = doc.layers[id];
    if (layer) Object.assign(layer.params, params);
  }
}

/** Captures the current look as a new preset. */
export function presetFromDoc(doc: EditDoc, name: string): RetouchPreset {
  const tools: RetouchPreset['tools'] = {};
  for (const [id, layer] of Object.entries(doc.layers) as [LayerId, EditDoc['layers'][LayerId]][]) {
    if (layer) tools[id] = { ...layer.params };
  }
  return {
    id: `custom-${Date.now().toString(36)}`,
    name,
    note: 'Sua receita.',
    adjust: { ...doc.adjust },
    filter: { ...doc.filter },
    tools,
    custom: true,
  };
}
