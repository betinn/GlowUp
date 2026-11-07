/** The edit document: everything needed to rebuild the result from the original. */

import { defaultCrop, type Crop } from './geometry';

export type LayerId =
  | 'smooth'
  | 'undereye'
  | 'skintone'
  | 'highlight'
  | 'whiten'
  | 'redeye'
  | 'eyecolor'
  | 'sparkle'
  | 'lips'
  | 'blush'
  | 'eyeshadow'
  | 'brow'
  | 'contour'
  | 'hair'
  | 'freckles';

/** Render order of masked tools. Skin first, makeup after, so colors sit on clean skin. */
export const LAYER_ORDER: readonly LayerId[] = [
  'smooth',
  'undereye',
  'skintone',
  'contour',
  'blush',
  'highlight',
  'freckles',
  'whiten',
  'redeye',
  'eyecolor',
  'sparkle',
  'brow',
  'eyeshadow',
  'lips',
  'hair',
];

/** Mask key of a filter limited to part of the photo. It never joins the chain of tools. */
export const FILTER_MASK = 'filter' as unknown as LayerId;

export type ParamValue = number | string;
export type Params = Record<string, ParamValue>;

export interface LayerState {
  enabled: boolean;
  painted: boolean;
  params: Params;
}

export interface Adjustments {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
  sharpen: number;
  grain: number;
  vignette: number;
}

export const DEFAULT_ADJUST: Adjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  sharpen: 0,
  grain: 0,
  vignette: 0,
};

export interface BlurSettings {
  mode: 'off' | 'radial' | 'tilt';
  /** Focus center in output coordinates. */
  cx: number;
  cy: number;
  /** Radius of the sharp zone, as a fraction of the output long side. */
  focus: number;
  /** Width of the transition, same unit. */
  feather: number;
  /** Tilt-shift line angle, degrees. */
  angle: number;
  /** 0..100. */
  strength: number;
}

export const DEFAULT_BLUR: BlurSettings = {
  mode: 'off',
  cx: 0.5,
  cy: 0.5,
  focus: 0.22,
  feather: 0.25,
  angle: 0,
  strength: 50,
};

export interface FilterState {
  id: string | null;
  intensity: number;
  /** The filter stays inside its own mask. Older projects leave this out: the whole photo. */
  masked?: boolean;
  /** Softness of the mask edge, 0..100. Applied while rendering, so brush work gets it too. */
  feather?: number;
  /** Size of the masked area as a fraction of the long side. Softness is relative to it. */
  reach?: number;
}

/** One healing operation. Coordinates are image UV, radii are fractions of the long side. */
export interface HealOp {
  id: number;
  dabs: { u: number; v: number; r: number }[];
  hardness: number;
  /** Texture source offset in image UV. */
  du: number;
  dv: number;
}

export interface EditDoc {
  version: 1;
  width: number;
  height: number;
  adjust: Adjustments;
  filter: FilterState;
  blur: BlurSettings;
  crop: Crop;
  layers: Partial<Record<LayerId, LayerState>>;
  heals: HealOp[];
  hasField: boolean;
}

export function createDoc(width: number, height: number): EditDoc {
  return {
    version: 1,
    width,
    height,
    adjust: { ...DEFAULT_ADJUST },
    filter: { id: null, intensity: 1 },
    blur: { ...DEFAULT_BLUR },
    crop: defaultCrop(width, height),
    layers: {},
    heals: [],
    hasField: false,
  };
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
