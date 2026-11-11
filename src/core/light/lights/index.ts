/**
 * Every light of Luzes, in the order of the menu. To add one, write it in a file of its own in this folder and
 * add one line here. See "Luzes" in `docs/DESIGN.md`.
 */

import type { LightDef } from '../types';
import { analogica } from './analogica';
import { contraluz } from './contraluz';
import { contraluzDourado } from './contraluz-dourado';
import { entardecer } from './entardecer';
import { flashAnalogico } from './flash-analogico';
import { flashDireto } from './flash-direto';
import { luzDeEstudio } from './luz-de-estudio';
import { neon } from './neon';
import { noiteDeFesta } from './noite-de-festa';
import { silhueta } from './silhueta';

export const LIGHTS: readonly LightDef[] = [luzDeEstudio, flashDireto, flashAnalogico, analogica, entardecer, noiteDeFesta, contraluz, contraluzDourado, silhueta, neon];

export const lightById = (id: string | null | undefined): LightDef | undefined => LIGHTS.find((l) => l.id === id);
