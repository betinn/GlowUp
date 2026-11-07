import type { Engine } from '../core/engine';
import type { Autosave } from '../core/project';
import type { GroupId } from '../tools/catalog';
import type { ToolModule } from '../tools/types';

export interface PendingOpen {
  file?: File;
  projectId?: string;
}

export const ui = $state({
  screen: 'home' as 'home' | 'editor',
  pending: null as PendingOpen | null,
  /** Incremented whenever engine state changes, so derived values refresh. */
  rev: 0,
  busy: null as string | null,
  toast: null as string | null,
  group: 'skin' as GroupId,
  tool: null as string | null,
  toolModule: null as ToolModule | null,
  painting: false,
  splitOn: false,
  exportOpen: false,
  showHint: true,
});

let engineRef: Engine | null = null;
let autosaveRef: Autosave | null = null;

export const setEngine = (e: Engine | null) => {
  engineRef = e;
};

export const engine = (): Engine => engineRef!;
export const hasEngine = () => !!engineRef;

export const setAutosave = (a: Autosave | null) => {
  autosaveRef = a;
};

export const autosave = () => autosaveRef;

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
