/**
 * Luzes: filters that change the light of the scene, not only its color. A light falls by how far each point is
 * from the camera, so it needs the depth of the photo, and it treats the person, their skin and their hair
 * apart, so it needs to know where they are. See "Luzes" in `docs/DESIGN.md`.
 *
 * A light is plain data: the numbers of a recipe. To add one, write it in a file of its own in `lights/` and
 * add one line to `lights/index.ts`.
 */

/** A color in linear light, each channel from 0 up. */
export type Rgb = readonly [number, number, number];

/**
 * Where the light arrives, by depth. Depth is a disparity with the subject at 1: half is twice as far, and
 * above 1 is nearer than the subject. Below `lo` a point is far, above `hi` it is with the subject.
 */
export interface FallRecipe {
  lo?: number;
  hi?: number;
}

/** What is far from the camera: the background. Every number left out leaves that part alone. */
export interface FarRecipe {
  /** Exposure, in stops. */
  ev?: number;
  /**
   * The mean brightness the background had in the photo the recipe was made on, in linear light, and how much
   * the recipe follows a photo that differs: a background that is already dark is then not darkened as much.
   */
  level?: number;
  adapt?: number;
  /** How much lamps and windows keep their own brightness, 0 to 1. */
  keep?: number;
  /** Saturation, where 1 leaves it as it is. */
  sat?: number;
  tint?: Rgb;
  /** Two colors of light, one from each side, that take the place of the colors of the background. */
  duo?: { left: Rgb; right: Rgb; amount: number };
}

/** What is at the depth of the subject: the person, clothes and hair included, and whatever is beside them. */
export interface NearRecipe {
  ev?: number;
  /** Stops added per unit of depth nearer than the subject, as a flash burns a hand held out to the camera. */
  close?: number;
  /** Stops added to the hair alone. */
  hair?: number;
  /**
   * The mean brightness the skin had in the photo the recipe was made on, in linear light, and how much the
   * recipe follows a photo that differs, so a face ends as bright on a dark photo as on a bright one.
   */
  level?: number;
  adapt?: number;
  sat?: number;
  tint?: Rgb;
}

/** What happens to bare skin on top of the rest. */
export interface SkinRecipe {
  ev?: number;
  /** How much the shadows on the skin are filled, 0 to 1, as a light from the camera does. */
  fill?: number;
  sat?: number;
  tint?: Rgb;
}

/**
 * A lamp behind the person. Its light is one smooth field over the edge of the person: it burns what is around
 * them near the lamp, fades a little way into them, and catches the strands of hair that stand out.
 */
export interface LampRecipe {
  /** Where it is from the middle of the face, in sizes of the face, x to the right and y down. */
  at: readonly [number, number];
  /** How far the bright core reaches, in sizes of the face. */
  reach: number;
  /** Strength of the core on what is around the person. */
  glow?: number;
  /** Strength of a soft light that hugs the person all around. */
  hug?: number;
  glowColor?: Rgb;
  /** Strength of the light on the strands of hair near the edge. */
  strands?: number;
  strandColor?: Rgb;
  /** How far the strands still take light, in reaches of the core. */
  wide?: number;
}

/** What goes over the whole frame, as a camera or a film would leave it. */
export interface FilmRecipe {
  /** Contrast as a power around `pivot`: above 1, shadows go down and lights go up. */
  gamma?: number;
  pivot?: number;
  /** What is darker than this falls away to black. */
  black?: number;
  /** Where the lights start to roll off toward white, 0 to 1. Lower burns softer and sooner. */
  knee?: number;
  /** Light added to the shadows, as the base of a film. */
  lift?: number;
  liftTint?: Rgb;
  vignette?: number;
  /** The height of the middle of the vignette in the frame, 0 at the top. */
  vignetteY?: number;
  grain?: number;
  /** Light that got into the camera from one side. The place is in shares of the frame. */
  leak?: { x: number; y: number; size: number; strength: number; color: Rgb; tall?: number };
  /** The date in a corner, as cameras used to print it. */
  stamp?: boolean;
}

export interface LightRecipe {
  fall?: FallRecipe;
  far?: FarRecipe;
  near?: NearRecipe;
  skin?: SkinRecipe;
  lamp?: LampRecipe;
  film?: FilmRecipe;
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
 * The scene of a photo on its own grid.
 *
 * `data` holds four bytes a cell: how much of a person is there, how much of that is bare skin, how much is
 * hair, and how many stops the skin around the cell is from the mean of the skin (128 is none).
 *
 * `field` holds four floats a cell: the depth on the person's side of the edge, the depth on the other side,
 * and the matte of the person blurred a little and blurred wide. Depth is a disparity with the subject at 1.
 */
export interface SceneData {
  w: number;
  h: number;
  data: Uint8Array;
  field: Float32Array;
  stats: SceneStats;
}
