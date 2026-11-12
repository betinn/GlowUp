/** Retouch presets: saved combinations of adjustments, a filter and tool settings. */

import { DEFAULT_ADJUST, type Adjustments, type EditDoc, type FilterState, type LayerId, type LightState, type Params } from '../core/doc';
import { isLookLight } from '../core/light/lights';

export interface RetouchPreset {
  id: string;
  name: string;
  note: string;
  adjust: Partial<Adjustments>;
  filter: FilterState;
  tools: Partial<Record<LayerId, Params>>;
  /**
   * A light of `core/light/looklights.ts`, for a look that also works on the light of the face and on what is
   * behind the person. It reads the depth of the photo, so the first look with one downloads the two models
   * of the scene.
   */
  light?: LightState;
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
  {
    id: 'retrato',
    name: 'Retrato',
    note: 'Você em destaque: o fundo recua e a sombra do rosto alivia.',
    adjust: { contrast: 4, vibrance: 6, sharpen: 10 },
    filter: { id: 'pele-limpa', intensity: 0.3 },
    tools: {
      smooth: { mode: 'light', strength: 55, texture: 105 },
      undereye: { light: 45, tone: 55 },
      sclera: { whiten: 30, bright: 10 },
      sparkle: { contrast: 30, sharp: 35 },
    },
    light: { id: 'look-retrato', intensity: 1 },
  },
  {
    id: 'luz-de-janela',
    name: 'Luz de Janela',
    note: 'Luz macia no rosto, como perto de uma janela.',
    adjust: { highlights: -8, vibrance: 6 },
    filter: { id: 'pele-limpa', intensity: 0.4 },
    tools: {
      smooth: { mode: 'light', strength: 55, texture: 100 },
      undereye: { light: 50, tone: 60 },
      whiten: { whiten: 40, bright: 15 },
      sclera: { whiten: 35, bright: 12 },
    },
    light: { id: 'look-janela', intensity: 1 },
  },
  {
    id: 'luz-de-vela',
    name: 'Luz de Vela',
    note: 'O lugar baixa a luz e a pele fica com um brilho quente.',
    adjust: { highlights: -6, vibrance: 6 },
    filter: { id: 'mel', intensity: 0.25 },
    tools: {
      smooth: { mode: 'light', strength: 60, texture: 100 },
      undereye: { light: 40, tone: 50 },
      highlight: { intensity: 30, glow: 45 },
    },
    light: { id: 'look-vela', intensity: 1 },
  },
  {
    id: 'fim-de-tarde',
    name: 'Fim de Tarde',
    note: 'Sol baixo: a foto toda mais quente e dourada.',
    adjust: { contrast: 4, vibrance: 4 },
    filter: { id: 'bronze', intensity: 0.25 },
    tools: {
      smooth: { mode: 'light', strength: 55, texture: 100 },
      undereye: { light: 40, tone: 50 },
      sclera: { whiten: 30, bright: 10 },
    },
    light: { id: 'look-dourado', intensity: 1 },
  },
  {
    id: 'olhar',
    name: 'Olhar',
    note: 'Só os olhos: olheiras, branco e brilho.',
    adjust: { sharpen: 8 },
    filter: { id: 'pele-limpa', intensity: 0.2 },
    tools: {
      undereye: { light: 60, tone: 70 },
      sclera: { whiten: 45, bright: 18 },
      sparkle: { contrast: 35, sharp: 45 },
    },
  },
];

/** A look that reads the scene of the photo, so its first use downloads the two models of the scene. */
export const readsScene = (look: RetouchPreset): boolean => !!look.light;

/**
 * Applies a preset to the document. Unlisted adjustments go back to zero. The light of a look takes the place
 * of the light of the look before, and a look with none takes that one away. A light of Luzes stays under a
 * look that brings none. `lit` false leaves the light of the preset out, for a photo with no scene to light.
 */
export function applyPresetToDoc(doc: EditDoc, preset: RetouchPreset, lit = true): void {
  if (preset.light && lit) doc.light = { ...preset.light };
  else if (isLookLight(doc.light?.id)) delete doc.light;
  doc.adjust = { ...DEFAULT_ADJUST, ...preset.adjust };
  // A recipe says which filter, not where: the area chosen on this photo stays.
  doc.filter = { ...doc.filter, ...preset.filter };
  for (const [id, params] of Object.entries(preset.tools) as [LayerId, Params][]) {
    const layer = doc.layers[id];
    if (layer) Object.assign(layer.params, params);
  }
}

/**
 * The settings of a preset are in the document, untouched. Masks do not count: a mouth may hold no teeth. Of
 * the light only the name counts: its strength is the person's to choose.
 */
function wears(doc: EditDoc, preset: RetouchPreset): boolean {
  if (preset.light && doc.light?.id !== preset.light.id) return false;
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
