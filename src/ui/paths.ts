/**
 * The ways into a photo, offered after it opens. All of them edit the same document, so going from one to
 * another loses nothing. A new path is one more entry in `PATHS`.
 */

import type { Component } from 'svelte';
import { appliedLook } from '../presets/recipes';
import { selectTool } from './actions';
import { photoChanged, wholeScope } from './reset';
import { engine, prefs, ui } from './state.svelte';

export interface EditPath {
  id: string;
  label: string;
  note: string;
  /** A name known to `Icon`. */
  icon: string;
  /** What the path shows in place of the groups and tools of the editor. Without it, it shows them. */
  menu?: () => Promise<{ default: Component }>;
  /** Has a brush to learn, so the first visit also teaches painting. */
  paints?: boolean;
}

export const PATHS: EditPath[] = [
  {
    id: 'glow',
    label: 'Glow na Hora',
    note: 'Toque num look pronto e ele entra no rosto todo.',
    icon: 'highlight',
    menu: () => import('./LooksMenu.svelte'),
  },
  {
    id: 'manual',
    label: 'Do Meu Jeito',
    note: 'Ferramenta por ferramenta, no seu ritmo.',
    icon: 'brush',
    paints: true,
  },
  {
    id: 'filters',
    label: 'Filtros',
    note: 'Cor, clima e luz de cena na foto toda, sem mexer no rosto.',
    icon: 'filters',
    menu: () => import('./FiltersMenu.svelte'),
  },
  {
    id: 'fun',
    label: 'Brincar',
    note: 'Caretas e adesivos de brincadeira. O retoque fica de fora.',
    icon: 'fun',
    menu: () => import('./BrincarMenu.svelte'),
  },
];

export const pathById = (id: string | null) => PATHS.find((p) => p.id === id);

/** Holds a path to start in without asking, as `glowup.onboarded` holds the cards. */
export const START_PATH_KEY = 'glowup.startPath';
export const ONBOARDED_KEY = 'glowup.onboarded';
/** The cards about the view were seen, on a path with no brush. */
export const VIEW_ONBOARDED_KEY = 'glowup.onboardedView';

/** The cards the first visit to a path still owes. */
function offerCards(paints: boolean): void {
  if (prefs.read(ONBOARDED_KEY, false)) return;
  if (paints) ui.onboarding = prefs.read(VIEW_ONBOARDED_KEY, false) ? 'paint' : 'all';
  else if (!prefs.read(VIEW_ONBOARDED_KEY, false)) ui.onboarding = 'view';
}

function enterPath(path: EditPath): void {
  ui.path = path.id;
  ui.choosingPath = false;
  offerCards(!!path.paints);
}

/**
 * The path of a project opened again, with no question: the look it wears, or else the tools. With no
 * edit yet there is nothing to go back to, so the person still chooses.
 */
function pathOfProject(): EditPath | undefined {
  if (!photoChanged()) return undefined;
  // A photo with nothing but Brincar on it opens in Brincar.
  if (!engine().changed({ ...wholeScope(), fun: false })) return pathById('fun');
  if (appliedLook(engine().doc)) return pathById('glow');
  // A light of Luzes lives in Filtros.
  if (!engine().changed({ ...wholeScope(), light: false })) return pathById('filters');
  return pathById('manual');
}

/** The photo just opened. Either a path is already known, or the screen of choice shows. */
export function startPaths(reopened: boolean): void {
  const path = pathById(prefs.read<string | null>(START_PATH_KEY, null)) ?? (reopened ? pathOfProject() : undefined);
  if (path) enterPath(path);
  else ui.choosingPath = true;
}

/** Goes to a path from the screen of choice. An open tool closes when the menu around it goes away. */
export async function choosePath(id: string): Promise<void> {
  const path = pathById(id);
  if (!path) return;
  if (ui.path && ui.path !== id && ui.tool) await selectTool(null);
  enterPath(path);
}
