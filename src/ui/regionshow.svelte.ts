/**
 * Once a tool with a region is ready, a short light shows the pixels the brush can reach. The view stays
 * where the person left it. A touch on the photo stops the light.
 */

import type { Engine } from '../core/engine';
import { reducedMotion } from './motion';

export const regionShow = $state({
  /** What plays on the photo now. */
  phase: null as 'glow' | 'fill' | null,
});

/** Changes to stop what plays. */
let current = 0;

/**
 * Plays the light. `glow` is false when this tool already showed its region. `fill` runs last, so the
 * automatic mode changes the photo once the person has seen where.
 */
export async function showRegion(e: Engine, glow: boolean, fill?: () => Promise<void>): Promise<void> {
  const mine = ++current;
  if (glow) {
    regionShow.phase = 'glow';
    await e.revealLimit(reducedMotion());
  }
  if (fill && mine === current) {
    regionShow.phase = 'fill';
    await fill();
  }
  if (mine === current) regionShow.phase = null;
}

export function stopRegionShow(e: Engine | null): void {
  current++;
  regionShow.phase = null;
  e?.stopReveal();
}
