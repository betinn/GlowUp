import { describe, expect, it } from 'vitest';
import { boxOf, FOCUS_FILL, FOCUS_MAX_ZOOM, focusPoints, pickFocus } from '../../src/core/face/focus';
import type { Point } from '../../src/core/face/mask';
import { makeFace, type FaceParts } from '../../src/core/face/scan';
import { alreadyShown, blendViews, frameBox, outputToScreen, zoomToFit, type Box, type Viewport } from '../../src/core/view';

const VP: Viewport = { w: 1000, h: 800, top: 60, right: 100, bottom: 40, left: 100 };
const OUT = { w: 1500, h: 1875 };

function lens(cx: number, cy: number, halfW: number, halfH: number, count: number): Point[] {
  return Array.from({ length: count }, (_, i): Point => {
    const t = (i / count) * Math.PI * 2 + Math.PI;
    return [cx + Math.cos(t) * halfW, cy - Math.sin(t) * halfH];
  });
}

/** A face of width `size` centered at (x, y), with the mouth open by `gap` of its width. */
function face(x: number, y: number, size: number, gap = 0.3) {
  const s = size / 0.8;
  const parts: FaceParts = {
    eyes: [lens(x - 0.2 * s, y - 0.2 * s, 0.08 * s, 0.04 * s, 16), lens(x + 0.2 * s, y - 0.2 * s, 0.08 * s, 0.04 * s, 16)],
    irises: [],
    innerLips: lens(x, y + 0.2 * s, 0.12 * s, gap * 0.12 * s, 20),
    outerLips: lens(x, y + 0.2 * s, 0.15 * s, 0.08 * s, 20),
  };
  return makeFace(lens(x, y, 0.4 * s, 0.5 * s, 36), parts);
}

const fit = (b: Box) => zoomToFit(VP, OUT, b, FOCUS_FILL, FOCUS_MAX_ZOOM);

describe('where the view goes', () => {
  it('frames both eyes, or the mouth for the teeth', () => {
    const one = face(0.5, 0.4, 0.5);
    const [eyes] = focusPoints([one], 'iris');
    expect(eyes).toHaveLength(32);
    const box = boxOf(eyes);
    expect(box.x0).toBeCloseTo(0.5 - 0.28 * 0.625);
    const [mouth] = focusPoints([one], 'teeth');
    expect(boxOf(mouth).y0).toBeGreaterThan(box.y1);
  });

  it('leaves out a closed mouth', () => {
    expect(focusPoints([face(0.5, 0.4, 0.5, 0)], 'teeth')).toEqual([]);
    expect(focusPoints([face(0.5, 0.4, 0.5, 0)], 'sclera')).toHaveLength(1);
  });

  it('keeps two faces side by side in view', () => {
    const boxes = [face(0.35, 0.4, 0.25), face(0.65, 0.4, 0.22)].map((f) => boxOf(focusPoints([f], 'iris')[0]));
    const box = pickFocus(boxes, fit)!;
    expect(box.x0).toBeCloseTo(boxes[0].x0);
    expect(box.x1).toBeCloseTo(boxes[1].x1);
  });

  it('goes to the largest face when a group would need the whole photo', () => {
    const faces = [face(0.1, 0.2, 0.12), face(0.9, 0.8, 0.1), face(0.5, 0.5, 0.16), face(0.2, 0.85, 0.1)];
    const boxes = faces.map((f) => boxOf(focusPoints([f], 'iris')[0]));
    expect(pickFocus(boxes, fit)).toEqual(boxes[2]);
    expect(pickFocus([], fit)).toBeNull();
  });

  it('fills the free area with the box, within the limits of the zoom', () => {
    const box = { x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.45 };
    const view = frameBox(VP, OUT, box, 0.6, 8);
    const [x0] = outputToScreen(VP, OUT, view, box.x0, box.y0);
    const [x1] = outputToScreen(VP, OUT, view, box.x1, box.y1);
    expect((x1 - x0) / 800).toBeCloseTo(0.6);
    expect(zoomToFit(VP, OUT, { x0: 0.5, y0: 0.5, x1: 0.5001, y1: 0.5001 }, 0.6, 8)).toBe(8);
    expect(zoomToFit(VP, OUT, { x0: 0, y0: 0, x1: 1, y1: 1 }, 0.6, 8)).toBe(1);
  });

  it('stays put when the box is already in view, close enough', () => {
    const box = { x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.45 };
    const view = frameBox(VP, OUT, box, 0.6, 8);
    expect(alreadyShown(VP, OUT, view, box, view.zoom)).toBe(true);
    expect(alreadyShown(VP, OUT, { zoom: 1, cx: 0.5, cy: 0.5 }, box, view.zoom)).toBe(false);
    expect(alreadyShown(VP, OUT, { ...view, cx: 0.1 }, box, view.zoom)).toBe(false);
  });

  it('blends two views from end to end, with an even zoom', () => {
    const a = { zoom: 1, cx: 0.5, cy: 0.5 };
    const b = { zoom: 4, cx: 0.3, cy: 0.4 };
    expect(blendViews(a, b, 0)).toEqual(a);
    expect(blendViews(a, b, 1).zoom).toBeCloseTo(4);
    expect(blendViews(a, b, 1).cx).toBeCloseTo(0.3);
    expect(blendViews(a, b, 0.5).zoom).toBeCloseTo(2);
    expect(blendViews(a, { ...b, zoom: 1 }, 0.5).cx).toBeCloseTo(0.4);
  });
});
