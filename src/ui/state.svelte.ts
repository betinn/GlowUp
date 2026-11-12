import type { Engine } from '../core/engine';
import type { Autosave } from '../core/project';
import type { GroupId } from '../tools/catalog';
import type { ToolModule } from '../tools/types';
import type { Task } from './task.svelte';

export interface PendingOpen {
  file?: File;
  projectId?: string;
}

export interface Point {
  x: number;
  y: number;
}

/** A photo on its way to the editor. */
export interface Opening {
  task: Task;
  /** Address of the picture shown while it opens. */
  photo: string | null;
  /** Where the file was dropped, when it was. */
  from: Point | null;
}

/** The post a photo in the editor is part of: the way back from the editor is the post, and its other photos are a tap away. */
export interface PostContext {
  id: string;
  /** The projects of its photos, in order. */
  ids: string[];
  /** Which of them is in the editor. */
  index: number;
}

/** What the before side shows: the original photo, or the current edit without the filter. */
export type CompareScope = 'all' | 'filter';

/** Which cards to show: all of them, only the brush, or only what has no brush. */
export type OnboardingCards = 'all' | 'paint' | 'view';

export const ui = $state({
  screen: 'home' as 'home' | 'editor' | 'post',
  /** The post on the table of the montage, once it is saved. Null while its photos are still being brought in. */
  postId: null as string | null,
  /** The post of the photo in the editor, when the photo is part of one. */
  post: null as PostContext | null,
  /** Photos dropped on the editor of a photo of a post: they join the post when its table comes back. */
  postAdds: null as File[] | null,
  /** Incremented to open a new editor over the current one. */
  session: 0,
  pending: null as PendingOpen | null,
  opening: null as Opening | null,
  /** Incremented whenever engine state changes, so derived values refresh. */
  rev: 0,
  busy: null as string | null,
  /** The finished field of a face slider is on its way: the photo shows a rough one meanwhile. */
  shaping: false,
  /** The same, for an effect of Brincar. */
  funShaping: false,
  toast: null as string | null,
  /** The tab the person is on, from the list in `paths.ts`. Null until a photo is open. */
  path: null as string | null,
  /** The cards that teach the gestures, when they are due. */
  onboarding: null as OnboardingCards | null,
  group: 'skin' as GroupId,
  tool: null as string | null,
  toolModule: null as ToolModule | null,
  painting: false,
  splitOn: false,
  /** Divider position, as a fraction of the canvas width. */
  splitX: 0.5,
  compareHold: false,
  compareScope: 'all' as CompareScope,
  filterName: '',
  /** Rings are on the faces, waiting for a tap. */
  faceChoosing: false,
  exportOpen: false,
  showHint: true,
  /** Manchas marks each spot it healed with a ring. Off, the photo shows clean. Remembered on this device. */
  healRings: true,
});

let engineRef: Engine | null = null;
let autosaveRef: Autosave | null = null;
let closer: ((next: () => void) => Promise<void>) | null = null;

export const setEngine = (e: Engine | null) => {
  engineRef = e;
};

export const engine = (): Engine => engineRef!;
export const hasEngine = () => !!engineRef;

export const setAutosave = (a: Autosave | null) => {
  autosaveRef = a;
};

export const autosave = () => autosaveRef;

export const setEditorCloser = (close: NonNullable<typeof closer>) => {
  closer = close;
};

/** An editor replaced by a new one must not remove the closer of its successor. */
export const clearEditorCloser = (close: NonNullable<typeof closer>) => {
  if (closer === close) closer = null;
};

/** Saves and closes the open editor, if any, then runs `next` in the same tick as the teardown. */
export async function closeEditor(next: () => void): Promise<void> {
  if (closer) await closer(next);
  else next();
}

export const bump = () => {
  ui.rev++;
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function toast(message: string, ms = 3200): void {
  ui.toast = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast = null;
  }, ms);
}

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked. These are conveniences only.
  }
};

export const prefs = { read, write };

/** Where the choice of showing the rings of Manchas is kept. */
export const HEAL_RINGS_KEY = 'glowup.healRings';
ui.healRings = read(HEAL_RINGS_KEY, true);
