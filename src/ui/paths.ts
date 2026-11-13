/**
 * The ways into a photo, as the tabs of the editor. All of them edit the same document, so going from one to
 * another loses nothing. A new tab is one more entry in `PATHS`.
 */

import type { Component } from 'svelte';
import { appliedLook } from '../presets/recipes';
import type { GroupId } from '../tools/catalog';
import { selectTool } from './actions';
import { photoChanged, wholeScope } from './reset';
import { engine, prefs, ui } from './state.svelte';

export interface EditPath {
  id: string;
  /** The word under the icon of the tab. */
  label: string;
  /** What the tab is for, in one line, for whoever asks. */
  note: string;
  /** A name known to `Icon`. */
  icon: string;
  /** What the tab shows in place of tools. Without it, it shows the tools of `groups`. */
  menu?: () => Promise<{ default: Component }>;
  /** The groups of tools of the tab. More than one shows a row to choose from, unless `flat`. */
  groups?: GroupId[];
  /** The tools of every group side by side, with no row of groups. */
  flat?: boolean;
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
    note: 'Pele, olhos, make, cabelo e formato do rosto, ferramenta por ferramenta, no seu ritmo.',
    icon: 'brush',
    groups: ['skin', 'eyes', 'makeup', 'hair', 'shape'],
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
    id: 'photo',
    label: 'Foto',
    note: 'Luz, cor, desfoque, recorte e tamanho da foto inteira.',
    icon: 'adjust',
    groups: ['light', 'frame'],
    flat: true,
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

/** The tab that holds a group of tools. */
export const pathOfGroup = (group: GroupId) => PATHS.find((p) => p.groups?.includes(group));

/** Holds a tab every photo starts in, whatever it wears. Nothing in the app writes it. */
export const START_PATH_KEY = 'glowup.startPath';
/** The tab the person was last on, where the next new photo starts. */
export const LAST_PATH_KEY = 'glowup.lastPath';
/** Where a first photo starts: one tap there already changes the photo. */
const FIRST_PATH = 'glow';
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
  // A tab of tools opens on a group of its own.
  if (path.groups && !path.groups.includes(ui.group)) ui.group = path.groups[0];
  offerCards(!!path.paints);
}

/**
 * The tab of a project opened again: the look it wears, or else where its edits are. With no edit yet
 * there is nothing to go back to.
 */
function pathOfProject(): EditPath | undefined {
  if (!photoChanged()) return undefined;
  const only = (scope: Partial<ReturnType<typeof wholeScope>>) => !engine().changed({ ...wholeScope(), ...scope });
  // A photo with nothing but Brincar on it opens in Brincar.
  if (only({ fun: false })) return pathById('fun');
  if (appliedLook(engine().doc)) return pathById('glow');
  // A light of Luzes lives in Filtros, beside the filter.
  if (only({ light: false, filter: false })) return pathById('filters');
  if (only({ adjust: false, blur: false, crop: false })) return pathById('photo');
  return pathById('manual');
}

/** The photo just opened: it starts on the tab of its edits, or on the one the person was last on. */
export function startPaths(reopened: boolean): void {
  const forced = pathById(prefs.read<string | null>(START_PATH_KEY, null));
  const last = pathById(prefs.read<string | null>(LAST_PATH_KEY, null));
  enterPath(forced ?? (reopened ? pathOfProject() : undefined) ?? last ?? pathById(FIRST_PATH)!);
}

/** Goes to a tab. An open tool closes when the menu around it goes away. */
export async function choosePath(id: string): Promise<void> {
  const path = pathById(id);
  if (!path || ui.path === id) return;
  if (ui.tool) await selectTool(null);
  enterPath(path);
  prefs.write(LAST_PATH_KEY, id);
}
