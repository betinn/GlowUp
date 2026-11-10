/**
 * Every face effect of Brincar, in the order of the menu. To add one, write it in a file of its own in this
 * folder and add one line here. See "Brincar" in `docs/DESIGN.md`.
 */

import type { FunEffect } from '../types';
import { cabecao } from './cabecao';
import { olhao } from './olhao';

export const FUN_EFFECTS: readonly FunEffect[] = [
  olhao,
  cabecao,
];

export const funEffectById = (id: string) => FUN_EFFECTS.find((e) => e.id === id);
