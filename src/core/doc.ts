/** The edit document: everything needed to rebuild the result from the original. */

import { defaultCrop, type Crop } from './geometry';

export type LayerId =
  | 'smooth'
  | 'undereye'
  | 'skintone'
  | 'highlight'
  | 'whiten'
  | 'sclera'
  | 'redeye'
  | 'eyecolor'
  | 'sparkle'
  | 'lips'
  | 'blush'
  | 'eyeshadow'
  | 'brow'
  | 'contour'
  | 'hair'
  | 'hairdark'
  | 'hairlight'
  | 'haircontrast'
  | 'hairsharp'
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
  'sclera',
  'redeye',
  'eyecolor',
  'sparkle',
  'brow',
  'eyeshadow',
  'lips',
  // Color first, then light and contrast on the new color, and sharpness on everything.
  'hair',
  'hairdark',
  'hairlight',
  'haircontrast',
  'hairsharp',
];

/** Mask key of a filter limited to part of the photo. It never joins the chain of tools. */
export const FILTER_MASK = 'filter' as unknown as LayerId;

/** Mask key of the person, for the lock of the background. It comes from the photo and no edit changes it. */
export const PERSON_MASK = 'person' as unknown as LayerId;
/** Mask key of the heads: hair, face and what is worn on them. The sliders of the face move this and nothing else. */
export const HEAD_MASK = 'head' as unknown as LayerId;
/** Mask key of the opening of the mouths, which lips shaped by a slider slide over. */
export const MOUTH_MASK = 'mouth' as unknown as LayerId;
/** The masks that come from the photo. No edit changes them, and they go into a saved project. */
export const PHOTO_MASKS: readonly LayerId[] = [PERSON_MASK, HEAD_MASK, MOUTH_MASK];

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

/** The sliders of the face menu on one face: where the face is, so they find it again, and their numbers. */
export interface FaceShape {
  at: [number, number];
  values: Record<string, number>;
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
  /** Strength of the automatic Liquify, 0..100, when it is on. Older projects leave this out. */
  shapeAmount?: number;
  /** The sliders of the face menu, per face. Older projects leave this out. */
  shapes?: FaceShape[];
  /** Sections of the face menu switched off. Their numbers stay. */
  shapesOff?: ('face' | 'eyes' | 'nose')[];
  /** The brush of Liquify moves the background too. Older projects leave this out: the background stays. */
  unlocked?: boolean;
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
