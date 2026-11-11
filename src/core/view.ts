/** Pan and zoom math between screen pixels and output coordinates. Pure logic. */

export interface ViewState {
  /** 1 fits the photo in the free area. */
  zoom: number;
  /** Output coordinate shown at the center of the free area. */
  cx: number;
  cy: number;
}

export interface Viewport {
  w: number;
  h: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 24;

export const fitView = (): ViewState => ({ zoom: 1, cx: 0.5, cy: 0.5 });

function area(vp: Viewport) {
  return {
    w: Math.max(1, vp.w - vp.left - vp.right),
    h: Math.max(1, vp.h - vp.top - vp.bottom),
    x: vp.left + (vp.w - vp.left - vp.right) / 2,
    y: vp.top + (vp.h - vp.top - vp.bottom) / 2,
  };
}

/** Screen pixels per output pixel. */
export function viewScale(vp: Viewport, out: Size, view: ViewState): number {
  const a = area(vp);
  return Math.min(a.w / out.w, a.h / out.h) * view.zoom;
}

export function screenToOutput(vp: Viewport, out: Size, view: ViewState, x: number, y: number): [number, number] {
  const a = area(vp);
  const s = viewScale(vp, out, view);
  return [view.cx + (x - a.x) / (s * out.w), view.cy + (y - a.y) / (s * out.h)];
}

export function outputToScreen(vp: Viewport, out: Size, view: ViewState, s: number, t: number): [number, number] {
  const a = area(vp);
  const k = viewScale(vp, out, view);
  return [a.x + (s - view.cx) * k * out.w, a.y + (t - view.cy) * k * out.h];
}

/** Keeps the photo from leaving the free area. */
export function clampView(vp: Viewport, out: Size, view: ViewState): ViewState {
  const a = area(vp);
  const k = viewScale(vp, out, view);
  const halfW = a.w / (2 * k * out.w);
  const halfH = a.h / (2 * k * out.h);
  const limit = (c: number, half: number) => (half >= 0.5 ? 0.5 : Math.min(1 - half, Math.max(half, c)));
  return { zoom: view.zoom, cx: limit(view.cx, halfW), cy: limit(view.cy, halfH) };
}

/** Zooms keeping the output point under (x, y) in place. */
export function zoomAt(vp: Viewport, out: Size, view: ViewState, x: number, y: number, factor: number): ViewState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const [s, t] = screenToOutput(vp, out, view, x, y);
  const next = { ...view, zoom };
  const [s2, t2] = screenToOutput(vp, out, next, x, y);
  return clampView(vp, out, { zoom, cx: view.cx + s - s2, cy: view.cy + t - t2 });
}

export function panBy(vp: Viewport, out: Size, view: ViewState, dx: number, dy: number): ViewState {
  const k = viewScale(vp, out, view);
  return clampView(vp, out, { ...view, cx: view.cx - dx / (k * out.w), cy: view.cy - dy / (k * out.h) });
}
