/**
 * Luzes: filters that change the light of the scene, not only its color. Each one treats the person and the
 * background apart, so it needs to know where the person is. See "Luzes" in `docs/DESIGN.md`.
 *
 * A light is plain data: the numbers of a recipe. To add one, write it in a file of its own in `lights/` and
 * add one line to `lights/index.ts`.
 */

/** A color in linear light, each channel from 0 up. */
export type Rgb = readonly [number, number, number];

/** How the background changes. Every number left out leaves that part alone. */
export interface BackRecipe {
  /** Exposure far from the person, in stops. */
  ev?: number;
  /** Exposure right beside the person. Left out, it is the same as `ev`. */
  near?: number;
  /** How far `near` reaches before it becomes `ev`, as a share of the long side. */
  reach?: number;
  /** The mean brightness the background should end with, in linear light, and how much the recipe goes after it. */
  level?: number;
  adapt?: number;
  /** How much lamps and windows keep their own brightness, 0 to 1. */
  keep?: number;
  /** Saturation, where 1 leaves it as it is. */
  sat?: number;
  tint?: Rgb;
  /** Stops added at the top and at the bottom of the photo. */
  top?: number;
  bottom?: number;
  /** Two colors of light, one from each side, that take the place of the colors of the background. */
  duo?: { left: Rgb; right: Rgb; amount: number };
  /** Points of light scattered over the background, with a streak under each one. */
  glows?: { strength: number; size: number };
}

/** How the person changes, clothes and hair included. */
export interface PersonRecipe {
  ev?: number;
  /** Stops added to the hair alone. */
  hair?: number;
  /** Contrast as a power around `pivot`: above 1, shadows go down and lights stay. */
  gamma?: number;
  pivot?: number;
  sat?: number;
  tint?: Rgb;
  /** Stops lost at the edge of the body, as a light from the camera leaves it. */
  limb?: number;
  /** Stops lost away from the edge, as a light from behind leaves the front. */
  inner?: number;
  /** How far in from the edge `inner` is complete, in sizes of the face. */
  innerWidth?: number;
}

/** What happens to bare skin on top of the rest of the person. */
export interface SkinRecipe {
  ev?: number;
  /** The mean brightness skin should end with, in linear light, and how much the recipe goes after it. */
  level?: number;
  adapt?: number;
  sat?: number;
  tint?: Rgb;
}

/** A light at the camera: strongest on the face, weaker away from it. */
export interface FlashRecipe {
  ev: number;
  /** Where it falls to about a third, in sizes of the face. */
  radius: number;
  /** Where the lights start to roll off toward white, 0 to 1. Lower burns more. */
  knee?: number;
}

/** A light behind the person: a bright line along the edge and a glow on the background around it. */
export interface RimRecipe {
  strength: number;
  /** Width of the line, in sizes of the face. */
  width: number;
  color: Rgb;
  /** Where the light comes from on the photo, x to the right and y down. Left out, it comes from all around. */
  from?: readonly [number, number];
  /**
   * A lamp behind the person: where it is from the middle of the face, in sizes of the face, x to the right and
   * y down, and how far its light reaches. The line and the glow are strongest near it. Left out, they are even.
   */
  lamp?: { at: readonly [number, number]; reach: number };
  /** In hair, how much the light goes only to the strands that stand out, 0 to 1. Loose hairs past the edge take it too. */
  hair?: number;
  halo?: number;
  /** Reach of the glow, in sizes of the face. */
  haloWidth?: number;
  haloColor?: Rgb;
}

/** What goes over the whole frame, as a camera or a film would leave it. */
export interface FrameRecipe {
  vignette?: number;
  grain?: number;
  /** Specks of dust, 0 to 1. */
  dust?: number;
  /** Lifts black, 0 to 1. */
  fade?: number;
  tone?: Rgb;
  /** Light that got into the camera from one side. The place is in shares of the frame. */
  leak?: { x: number; y: number; size: number; strength: number; color: Rgb };
  /** The date in a corner, as cameras used to print it. */
  stamp?: boolean;
}

export interface LightRecipe {
  back?: BackRecipe;
  person?: PersonRecipe;
  skin?: SkinRecipe;
  flash?: FlashRecipe;
  rim?: RimRecipe;
  frame?: FrameRecipe;
}

export interface LightDef {
  /** Goes into saved projects: never rename one that shipped. */
  id: string;
  label: string;
  note: string;
  /** Two CSS colors for the tile of the menu, before the photo has its scene. */
  swatch: readonly [string, string];
  recipe: LightRecipe;
}

/** What the photo says about itself, measured once with the scene. */
export interface SceneStats {
  /** The middle of the main face, in image UV. With no face found, the top of the person. */
  face: [number, number];
  /** The size of that face, as a share of the long side. */
  faceSize: number;
  /** Mean brightness in linear light of the background, of the skin and of the whole person. */
  backY: number;
  skinY: number;
  personY: number;
}

/**
 * The scene of a photo on its own grid, four bytes a cell: how much of a person is there, how much of that is
 * bare skin, how much is hair, and how far the cell is from the edge of the person. See `sceneDistance`.
 */
export interface SceneData {
  w: number;
  h: number;
  data: Uint8Array;
  stats: SceneStats;
}
