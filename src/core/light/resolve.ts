/** Turns the recipe of a light into the numbers its shader reads, for one photo. No browser APIs. */

import { SCENE_SPAN } from './scene';
import type { LightRecipe, Rgb, SceneStats } from './types';

type Numbers = Record<string, number | boolean | readonly number[]>;

const WHITE: Rgb = [1, 1, 1];
/** A recipe never asks for more than this many stops from what it measured, either way. */
const MAX_ADAPT = 5;

/**
 * The stops a region takes. A recipe gives a fixed number, and may also say where the region should end, with
 * how much that counts: a background that is already dark is then not darkened as much as a bright one.
 */
export function adaptedEv(ev: number, level: number | undefined, adapt: number | undefined, measured: number): number {
  if (!adapt || !level) return ev;
  const wanted = Math.min(MAX_ADAPT, Math.max(-MAX_ADAPT, Math.log2(level / Math.max(measured, 0.004))));
  return ev + (wanted - ev) * Math.min(1, Math.max(0, adapt));
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

/** A place given from the face, in sizes of the face, as the shader wants it: the long side of the photo is the unit. */
function lampAt(at: readonly [number, number], stats: SceneStats, size: { width: number; height: number }): [number, number] {
  const long = Math.max(size.width, size.height);
  const face = Math.max(stats.faceSize, 0.02);
  return [(stats.face[0] * size.width) / long + at[0] * face, (stats.face[1] * size.height) / long + at[1] * face];
}

/**
 * Everything the shader needs from the recipe. `size` is the photo, in pixels. `mix` is the intensity, 0 to 1. The textures, the region and
 * the frame come from whoever draws.
 */
export function lightUniforms(recipe: LightRecipe, stats: SceneStats, size: { width: number; height: number }, mix: number, stamp?: string): Numbers {
  const { back = {}, person = {}, skin = {}, flash, rim, frame = {} } = recipe;
  const far = adaptedEv(back.ev ?? 0, back.level, back.adapt, stats.backY);
  // What is beside the person keeps its distance from what is far.
  const near = far + ((back.near ?? back.ev ?? 0) - (back.ev ?? 0));
  const skinEv = adaptedEv(skin.ev ?? 0, skin.level, skin.adapt, stats.skinY * 2 ** (person.ev ?? 0));
  const from = rim?.from;
  const length = from ? Math.hypot(from[0], from[1]) : 0;
  return {
    uMix: Math.min(1, Math.max(0, mix)),
    uSpan: SCENE_SPAN,
    uFace: stats.face,
    uFaceSize: Math.max(stats.faceSize, 0.02),
    uBack: [far, near, back.reach ?? 0.08, back.keep ?? 0],
    uBackSat: back.sat ?? 1,
    uBackTint: back.tint ?? WHITE,
    uBackSlope: [back.top ?? 0, back.bottom ?? 0],
    uDuoLeft: back.duo?.left ?? WHITE,
    uDuoRight: back.duo?.right ?? WHITE,
    uDuo: back.duo?.amount ?? 0,
    uGlows: [back.glows?.strength ?? 0, back.glows?.size ?? 0.02],
    uEv: [person.ev ?? 0, skinEv, person.hair ?? 0],
    uGamma: [person.gamma ?? 1, person.pivot ?? 0.3],
    uPersonSat: person.sat ?? 1,
    uPersonTint: person.tint ?? WHITE,
    uSkinSat: skin.sat ?? 1,
    uSkinTint: skin.tint ?? WHITE,
    uShade: [person.limb ?? 0, person.inner ?? 0, person.innerWidth ?? 0.3],
    uFlash: [flash?.ev ?? 0, flash?.radius ?? 1.5, flash?.knee ?? 1],
    uRim: [rim?.strength ?? 0, Math.max(rim?.width ?? 0.05, 1e-3), rim?.hair ?? 0, rim?.hair ? 1 : 0],
    uRimColor: rim?.color ?? WHITE,
    uRimFrom: length > 0 ? [from![0] / length, from![1] / length, 1] : [0, 0, 0],
    uRimLamp: rim?.lamp ? [...lampAt(rim.lamp.at, stats, size), rim.lamp.reach * Math.max(stats.faceSize, 0.02)] : [0, 0, 0],
    uHalo: [rim?.halo ?? 0, Math.max(rim?.haloWidth ?? 0.2, 1e-3)],
    uHaloColor: rim?.haloColor ?? rim?.color ?? WHITE,
    uVignette: frame.vignette ?? 0,
    uGrain: frame.grain ?? 0,
    uDust: frame.dust ?? 0,
    uFade: frame.fade ?? 0,
    uTone: frame.tone ?? WHITE,
    uLeak: frame.leak ? [frame.leak.x, frame.leak.y, frame.leak.size, frame.leak.strength] : [0, 0, 1, 0],
    uLeakColor: frame.leak?.color ?? WHITE,
    uStampOn: !!frame.stamp,
    uStamp: stampDigits(stamp),
  };
}

/** The shader reads the blurred photo only for a rim that picks out strands of hair. */
export const readsStrands = (recipe: LightRecipe) => !!recipe.rim?.hair;
