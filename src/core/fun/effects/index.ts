/**
 * Every face effect of Brincar, in the order of the menu. To add one, write it in a file of its own in this
 * folder and add one line here. See "Brincar" in `docs/DESIGN.md`.
 *
 * This is also the order they stack in: each effect bends the photo as the ones above it left it, and reads the
 * face there. The small parts go first, then the cheeks, then the length of the face, and the whole head last, so
 * a big nose grows with the head it is on.
 */

import type { FunEffect } from '../types';
import { achatado } from './achatado';
import { bocao } from './bocao';
import { bochechas } from './bochechas';
import { boquinha } from './boquinha';
import { cabecao } from './cabecao';
import { esticado } from './esticado';
import { narigao } from './narigao';
import { narizinho } from './narizinho';
import { olhao } from './olhao';
import { olhinhos } from './olhinhos';
import { peixe } from './peixe';
import { queixao } from './queixao';
import { sorrisao } from './sorrisao';
import { testao } from './testao';

export const FUN_EFFECTS: readonly FunEffect[] = [
  olhao,
  olhinhos,
  narigao,
  narizinho,
  bocao,
  boquinha,
  sorrisao,
  bochechas,
  peixe,
  queixao,
  testao,
  esticado,
  achatado,
  cabecao,
];

export const funEffectById = (id: string) => FUN_EFFECTS.find((e) => e.id === id);
