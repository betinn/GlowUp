/**
 * Caretas prontas: one tap sets several face effects at once, and every other effect of that face to zero. A
 * second tap on the one that is on takes it off. They are only numbers for the effects of `effects/index.ts`,
 * which stack in the order of that list, so a combo needs nothing of its own in the field.
 */

import type { FunEffect } from './types';
import { FUN_EFFECTS } from './effects/index';

export interface FunCombo {
  /** For tests and the page. Combos are not saved: the project keeps the numbers of the effects. */
  id: string;
  /** Its name on the button, in pt-BR. */
  label: string;
  /** The number of each effect it sets, 0..100. Effects it leaves out go to zero. */
  values: Readonly<Record<string, number>>;
}

export const FUN_COMBOS: readonly FunCombo[] = [
  { id: 'caricatura', label: 'Caricatura', values: { narigao: 70, bocao: 40, olhao: 30, queixao: 35, cabecao: 35 } },
  { id: 'bebe', label: 'Bebê', values: { olhao: 60, narizinho: 55, boquinha: 45, bochechas: 55, testao: 45 } },
  { id: 'alien', label: 'Alien', values: { olhao: 100, narizinho: 70, boquinha: 55, peixe: 60, testao: 80, esticado: 35 } },
  { id: 'palhaco', label: 'Palhaço', values: { narigao: 90, sorrisao: 90, olhinhos: 35, bochechas: 40 } },
];

/** The numbers a combo gives every effect, zero included. */
export function comboValues(combo: FunCombo, effects: readonly FunEffect[] = FUN_EFFECTS): Record<string, number> {
  return Object.fromEntries(effects.map((e) => [e.id, combo.values[e.id] ?? 0]));
}

/** The combo these numbers are, if any. */
export function comboOf(values: Readonly<Record<string, number>>, effects: readonly FunEffect[] = FUN_EFFECTS): FunCombo | null {
  return FUN_COMBOS.find((combo) => effects.every((e) => (values[e.id] ?? 0) === (combo.values[e.id] ?? 0))) ?? null;
}
