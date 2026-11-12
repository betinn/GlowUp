/**
 * The lights of the Luzes tab of Filtros, in the order of the menu. To add one, write it in a file of its own in
 * this folder and add one line here. See "Luzes" in `docs/DESIGN.md`.
 */

import type { LightState } from '../../doc';
import { LOOK_LIGHTS } from '../looklights';
import type { LightDef, MenuLight } from '../types';
import { brasa } from './brasa';
import { contraluzDourado } from './contraluz-dourado';
import { flashAnalogico } from './flash-analogico';
import { neon } from './neon';

export const LIGHTS: readonly MenuLight[] = [neon, contraluzDourado, brasa, flashAnalogico];

/** A light of the menu. */
export const menuLightById = (id: string | null | undefined): MenuLight | undefined => LIGHTS.find((l) => l.id === id);

/** Any light a document can hold: one of the menu, or the light of a look of Glow na Hora. */
export const lightById = (id: string | null | undefined): LightDef | undefined => menuLightById(id) ?? LOOK_LIGHTS.find((l) => l.id === id);

/** The light came with a look, so it leaves with the look. */
export const isLookLight = (id: string | null | undefined): boolean => LOOK_LIGHTS.some((l) => l.id === id);

/**
 * The light of a saved project, as this version holds it. A light that left the menu is dropped, so the photo
 * opens with its own light, and what an older light kept besides its strength is left behind.
 */
export function keptLight(light: LightState | undefined): LightState | undefined {
  return light && lightById(light.id) ? { id: light.id, intensity: Math.min(1, Math.max(0, light.intensity)) } : undefined;
}
