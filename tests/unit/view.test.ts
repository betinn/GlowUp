import { describe, expect, it } from 'vitest';
import { clampView, fitView, outputToScreen, panBy, screenToOutput, viewScale, zoomAt, type Viewport } from '../../src/core/view';

const VP: Viewport = { w: 1000, h: 800, top: 60, right: 100, bottom: 40, left: 100 };
const OUT = { w: 2000, h: 1000 };

describe('view', () => {
  it('fits the photo in the free area', () => {
    expect(viewScale(VP, OUT, fitView())).toBeCloseTo(0.4);
    const [x, y] = outputToScreen(VP, OUT, fitView(), 0.5, 0.5);
    expect(x).toBeCloseTo(500);
    expect(y).toBeCloseTo(410);
  });

  it('round-trips screen and output coordinates', () => {
    const v = { zoom: 2.5, cx: 0.3, cy: 0.6 };
    const [s, t] = screenToOutput(VP, OUT, v, 321, 456);
    const [x, y] = outputToScreen(VP, OUT, v, s, t);
    expect(x).toBeCloseTo(321);
    expect(y).toBeCloseTo(456);
  });

  it('keeps the point under the cursor while zooming', () => {
    const v = zoomAt(VP, OUT, { zoom: 3, cx: 0.5, cy: 0.5 }, 600, 300, 1.5);
    const before = screenToOutput(VP, OUT, { zoom: 3, cx: 0.5, cy: 0.5 }, 600, 300);
    const after = screenToOutput(VP, OUT, v, 600, 300);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it('centers the photo when it is smaller than the area', () => {
    expect(clampView(VP, OUT, { zoom: 1, cx: 0.9, cy: 0.1 })).toMatchObject({ cx: 0.5, cy: 0.5 });
  });

  it('does not pan past the photo', () => {
    const v = panBy(VP, OUT, { zoom: 4, cx: 0.5, cy: 0.5 }, 100000, 100000);
    const [s] = screenToOutput(VP, OUT, v, VP.left, VP.top);
    expect(s).toBeCloseTo(0);
  });
});
