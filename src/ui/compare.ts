/** Before/after controls. The state lives in `ui`; the editor passes it on to the engine. */

import { ui, type CompareScope } from './state.svelte';

/** Presses shorter than this are taps. */
const HOLD_AFTER = 180;

export function toggleCompare(scope: CompareScope): void {
  if (ui.splitOn && ui.compareScope === scope) {
    ui.splitOn = false;
    return;
  }
  ui.compareScope = scope;
  ui.splitOn = true;
}

export function holdCompare(scope: CompareScope): void {
  if (!ui.splitOn) ui.compareScope = scope;
  ui.compareHold = true;
}

/** Svelte action for a compare button: a tap splits the photo, holding shows the before. */
export function comparePress(node: HTMLElement, scope: CompareScope) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const down = () => {
    timer = setTimeout(() => {
      timer = null;
      holdCompare(scope);
    }, HOLD_AFTER);
  };

  const up = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      toggleCompare(scope);
    } else {
      ui.compareHold = false;
    }
  };

  const leave = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    ui.compareHold = false;
  };

  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    toggleCompare(scope);
  };

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointerleave', leave);
  node.addEventListener('pointercancel', leave);
  node.addEventListener('keydown', key);
  return {
    destroy() {
      leave();
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointerleave', leave);
      node.removeEventListener('pointercancel', leave);
      node.removeEventListener('keydown', key);
    },
  };
}
