/**
 * Once a tool for eyes or teeth is ready, the view flies to the region and a short light shows the
 * pixels the brush can reach. Both give way to the person: a touch on the photo stops them.
 */

import type { Engine } from '../core/engine';
import { boxOf, FOCUS_FILL, FOCUS_MAX_ZOOM, focusPoints, pickFocus } from '../core/face/focus';
import type { FaceRegion } from '../core/face/regions';
import type { Face } from '../core/face/scan';
import { alreadyShown, frameBox, zoomToFit, type Box, type ViewState } from '../core/view';
import { reducedMotion } from './motion';

/** Long enough to follow where the view goes, short enough not to wait for it. */
export const FLY_MS = 650;

export const regionShow = $state({
  /** What plays on the photo now. */
  phase: null as 'fly' | 'glow' | 'fill' | null,
});

/** Changes to stop what plays. */
let current = 0;

/** The view that frames the region, or null when there is nothing to frame or it is already in view. */
export function focusView(e: Engine, faces: readonly Face[], region: FaceRegion): ViewState | null {
  const out = e.displaySize;
  const vp = e.viewport;
  const fit = (b: Box) => zoomToFit(vp, out, b, FOCUS_FILL, FOCUS_MAX_ZOOM);
  const boxes = focusPoints(faces, region)
    .map((points) => boxOf(points.map(([u, v]) => e.imageToShown(u, v))))
    // A face the crop left out has nothing to show.
    .filter((b) => b.x1 > 0 && b.y1 > 0 && b.x0 < 1 && b.y0 < 1);
  const box = pickFocus(boxes, fit);
  if (!box || alreadyShown(vp, out, e.view, box, fit(box))) return null;
  return frameBox(vp, out, box, FOCUS_FILL, FOCUS_MAX_ZOOM);
}

/**
 * Plays the flight, then the light. `fly` is false when the person moved the view while the detector
 * worked: the view they chose stays. `glow` is false when this tool already showed its region. `fill`
 * runs last, so the automatic mode changes the photo once the person has seen where.
 */
export async function showRegion(
  e: Engine,
  faces: readonly Face[],
  region: FaceRegion,
  fly: boolean,
  glow: boolean,
  fill?: () => Promise<void>,
): Promise<void> {
  const mine = ++current;
  const still = reducedMotion();
  const target = fly ? focusView(e, faces, region) : null;
  if (target) {
    regionShow.phase = 'fly';
    await e.flyTo(target, still ? 0 : FLY_MS);
  }
  if (mine !== current) return;
  if (glow) {
    regionShow.phase = 'glow';
    await e.revealLimit(still);
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
  e?.stopFlight();
  e?.stopReveal();
}
