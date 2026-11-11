/** Turns the recipe of a light into the numbers its shader reads, for one photo. No browser APIs. */

import { SHADE_STOPS } from './scene';
import type { LightRecipe, Rgb, SceneStats } from './types';

type Numbers = Record<string, number | boolean | readonly number[]>;

const WHITE: Rgb = [1, 1, 1];
/** A recipe never follows a photo by more than this many stops, either way. */
const MAX_ADAPT = 3;
/** The matte of the person between these goes from the background's light to the person's. See `light.frag`. */
const EDGE_LOW = 0.6;
const EDGE_HIGH = 1;

/**
 * The stops a part of the photo takes. A recipe was made on one photo, where that part had the brightness
 * `level`. On a photo where it measures otherwise, the recipe moves with it by the share `adapt`: the part then
 * ends about as bright as it did on the photo of the recipe.
 */
export function adaptedEv(ev: number, level: number | undefined, adapt: number | undefined, measured: number): number {
  if (!adapt || !level) return ev;
  const follow = Math.min(MAX_ADAPT, Math.max(-MAX_ADAPT, Math.log2(level / Math.max(measured, 0.004))));
  return ev + follow * Math.min(1, Math.max(0, adapt));
}

/** The date as the eight figures of day, month and year. */
export function stampDigits(date: string | undefined): number[] {
  const digits = (date ?? '').replace(/\D/g, '');
  return Array.from({ length: 8 }, (_, i) => Number(digits[i] ?? 0));
}

/** Today as `DD/MM/YYYY`, for a light that prints the date. */
export function stampOf(day: Date): string {
  const two = (v: number) => String(v).padStart(2, '0');
  return `${two(day.getDate())}/${two(day.getMonth() + 1)}/${String(day.getFullYear()).padStart(4, '0')}`;
}

/**
 * The size of the face as the lamp measures with it. A face that fills the photo would put the lamp off the
 * frame and make its glow as big as the photo, so the measure stops growing at this share of the long side.
 */
const LAMP_FACE_MAX = 0.3;
const lampFace = (stats: SceneStats) => Math.min(LAMP_FACE_MAX, Math.max(stats.faceSize, 0.02));

/** A place given from the face, in sizes of the face, as the shader wants it: the long side of the photo is the unit. */
function lampAt(at: readonly [number, number], stats: SceneStats, size: { width: number; height: number }): [number, number] {
  const long = Math.max(size.width, size.height);
  const face = lampFace(stats);
  return [(stats.face[0] * size.width) / long + at[0] * face, (stats.face[1] * size.height) / long + at[1] * face];
}

/**
 * Everything the shader needs from the recipe. `size` is the photo, in pixels. `mix` is the intensity, 0 to 1.
 * The textures, the region and the frame come from whoever draws.
 */
export function lightUniforms(recipe: LightRecipe, stats: SceneStats, size: { width: number; height: number }, mix: number, stamp?: string): Numbers {
  const { fall = {}, far = {}, near = {}, skin = {}, lamp, film = {} } = recipe;
  const face = lampFace(stats);
  const lift = film.lift ?? 0;
  const liftTint = film.liftTint ?? WHITE;
  return {
    uMix: Math.min(1, Math.max(0, mix)),
    uFall: [fall.lo ?? 0.35, fall.hi ?? 0.85, EDGE_LOW, EDGE_HIGH],
    uEv: [adaptedEv(far.ev ?? 0, far.level, far.adapt, stats.backY), adaptedEv(near.ev ?? 0, near.level, near.adapt, stats.skinY), near.close ?? 0, far.keep ?? 0],
    uPart: [skin.ev ?? 0, near.hair ?? 0, (skin.fill ?? 0) * SHADE_STOPS, 0],
    uSat: [far.sat ?? 1, near.sat ?? 1, skin.sat ?? 1],
    uFarTint: far.tint ?? WHITE,
    uNearTint: near.tint ?? WHITE,
    uSkinTint: skin.tint ?? WHITE,
    uDuoLeft: far.duo?.left ?? WHITE,
    uDuoRight: far.duo?.right ?? WHITE,
    uDuo: far.duo?.amount ?? 0,
    uLamp: lamp ? [...lampAt(lamp.at, stats, size), Math.max(lamp.reach, 0.05) * face, Math.max(lamp.wide ?? 3, 0.1)] : [0, 0, 1, 1],
    uGlow: lamp ? [lamp.glow ?? 0, lamp.hug ?? 0, lamp.strands ?? 0, 1] : [0, 0, 0, 0],
    uGlowColor: lamp?.glowColor ?? WHITE,
    uStrandColor: lamp?.strandColor ?? lamp?.glowColor ?? WHITE,
    uCurve: [film.gamma ?? 1, film.pivot ?? 0.18, film.black ?? 0, film.knee ?? 1],
    uLift: [liftTint[0] * lift, liftTint[1] * lift, liftTint[2] * lift],
    uVignette: [film.vignette ?? 0, film.vignetteY ?? 0.5],
    uGrain: film.grain ?? 0,
    uLeak: film.leak ? [film.leak.x, film.leak.y, film.leak.size, film.leak.strength] : [0, 0, 1, 0],
    uLeakColor: film.leak ? [...film.leak.color, film.leak.tall ?? 2.4] : [1, 1, 1, 2.4],
    uStampOn: !!film.stamp,
    uStamp: stampDigits(stamp),
  };
}

/** The shader reads the blurred photo only for a lamp that picks out strands of hair. */
export const readsStrands = (recipe: LightRecipe) => !!recipe.lamp?.strands;
