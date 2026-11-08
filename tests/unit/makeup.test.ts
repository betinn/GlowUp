import { describe, expect, it } from 'vitest';
import { focusPoints } from '../../src/core/face/focus';
import { addBand, faceShare, fitContour, lidShape, lipsFromPhoto, reached, smoothLoop } from '../../src/core/face/makeup';
import type { Area, MaskTarget, Point } from '../../src/core/face/mask';
import { buildRegionMask, type LandmarkRegion } from '../../src/core/face/regions';
import { CHEEK_TOPS, CHEEKS, FACE_OVAL, HOLLOWS, makeFace, NOSE_SIDES, readFace, type Face, type FaceParts } from '../../src/core/face/scan';
import { TOOLS } from '../../src/tools/catalog';
import { LIMIT_WORDS, PLACES } from '../../src/ui/facepick.svelte';

const SIZE = 240;
const at = (mask: Uint8Array, u: number, v: number) => mask[Math.round(v * SIZE) * SIZE + Math.round(u * SIZE)];

function lens(cx: number, cy: number, halfW: number, halfH: number, count: number): Point[] {
  return Array.from({ length: count }, (_, i): Point => {
    const t = (i / count) * Math.PI * 2 + Math.PI;
    return [cx + Math.cos(t) * halfW, cy - Math.sin(t) * halfH];
  });
}

function oval(cx: number, cy: number, rx: number, ry: number): Point[] {
  return Array.from({ length: FACE_OVAL.length }, (_, i): Point => {
    const t = (i / FACE_OVAL.length) * Math.PI * 2;
    return [cx + Math.sin(t) * rx, cy - Math.cos(t) * ry];
  });
}

/** A brow in the order of the model: along the top from the outer end, then back along the bottom. */
function brow(cx: number, cy: number, halfW: number, halfH: number, outerAt: -1 | 1): Point[] {
  const xs = [1, 0.5, 0, -0.5, -1].map((k) => cx + k * outerAt * halfW);
  return [...xs.map((x): Point => [x, cy - halfH]), ...[...xs].reverse().map((x): Point => [x, cy + halfH])];
}

const parts: FaceParts = {
  eyes: [lens(0.37, 0.4, 0.06, 0.022, 16), lens(0.63, 0.4, 0.06, 0.022, 16)],
  irises: [],
  innerLips: lens(0.5, 0.68, 0.07, 0.015, 20),
  outerLips: lens(0.5, 0.68, 0.09, 0.035, 20),
  brows: [brow(0.37, 0.31, 0.07, 0.01, -1), brow(0.63, 0.31, 0.07, 0.01, 1)],
  midline: [
    [0.5, 0.22],
    [0.5, 0.38],
    [0.5, 0.42],
    [0.5, 0.46],
    [0.5, 0.5],
    [0.5, 0.53],
    [0.5, 0.55],
    [0.5, 0.57],
    [0.5, 0.78],
  ],
  cheeks: [
    [[0.36, 0.55], [0.32, 0.51], [0.28, 0.48]],
    [[0.64, 0.55], [0.68, 0.51], [0.72, 0.48]],
  ],
  hollows: [
    [[0.27, 0.56], [0.3, 0.6], [0.33, 0.63], [0.37, 0.65]],
    [[0.73, 0.56], [0.7, 0.6], [0.67, 0.63], [0.63, 0.65]],
  ],
  noseSides: [
    [[0.47, 0.42], [0.46, 0.47], [0.45, 0.52]],
    [[0.53, 0.42], [0.54, 0.47], [0.55, 0.52]],
  ],
  cheekTops: [
    [[0.3, 0.46], [0.34, 0.48], [0.38, 0.5], [0.43, 0.5]],
    [[0.7, 0.46], [0.66, 0.48], [0.62, 0.5], [0.57, 0.5]],
  ],
};
const face = (): Face => makeFace(oval(0.5, 0.5, 0.26, 0.36), parts);

const SKIN: [number, number, number] = [220, 168, 140];
const LIP: [number, number, number] = [190, 80, 85];
const TEETH: [number, number, number] = [235, 228, 210];
const HAIR: [number, number, number] = [60, 40, 26];
const BROW: [number, number, number] = [95, 65, 45];

type Paint = (u: number, v: number) => [number, number, number];

function photo(paint: Paint): MaskTarget {
  const read = (area: Area) => {
    const out = new Uint8ClampedArray(area.w * area.h * 4);
    for (let y = 0; y < area.h; y++) {
      for (let x = 0; x < area.w; x++) out.set([...paint((x + area.x + 0.5) / SIZE, (y + area.y + 0.5) / SIZE), 255], (y * area.w + x) * 4);
    }
    return out;
  };
  return {
    w: SIZE,
    h: SIZE,
    color: read,
    luma: (area) => {
      const rgba = read(area);
      const out = new Float32Array(area.w * area.h);
      for (let i = 0; i < out.length; i++) out[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
      return out;
    },
  };
}

const inLens = (u: number, v: number, cx: number, cy: number, a: number, b: number) => ((u - cx) / a) ** 2 + ((v - cy) / b) ** 2 < 1;

/** Skin all over, with hair at the top, and what `over` draws on top of it. */
const portrait = (over: (u: number, v: number) => [number, number, number] | null): MaskTarget =>
  photo((u, v) => over(u, v) ?? (v < 0.18 ? HAIR : SKIN));

/** The lips of the photo, with the mouth open. `dy` moves them away from where the model says they are. */
const smile = (dy = 0, lip = LIP): MaskTarget =>
  portrait((u, v) => {
    if (inLens(u, v, 0.5, 0.68 + dy, 0.07, 0.015)) return TEETH;
    if (inLens(u, v, 0.5, 0.68 + dy, 0.09, 0.035)) return lip;
    return null;
  });

describe('landmark lists of the makeup', () => {
  it('are read with the rest of the face, one line per side', () => {
    const f = readFace((i) => [i / 1000, i / 1000]);
    for (const [read, list] of [
      [f.parts.cheeks, CHEEKS],
      [f.parts.hollows, HOLLOWS],
      [f.parts.noseSides, NOSE_SIDES],
      [f.parts.cheekTops, CHEEK_TOPS],
    ] as const) {
      expect(read?.length).toBe(2);
      expect(read?.[1].length).toBe(list[1].length);
      expect(read?.[0][0][0]).toBeCloseTo(list[0][0] / 1000);
    }
  });
});

describe('lips', () => {
  it('cover the lips, without the teeth, the skin around them or the eyes', () => {
    const mask = buildRegionMask([face()], 'lips', smile())!;
    expect(at(mask, 0.5, 0.705)).toBeGreaterThan(220);
    expect(at(mask, 0.5, 0.655)).toBeGreaterThan(170);
    expect(at(mask, 0.5, 0.68)).toBe(0);
    expect(at(mask, 0.5, 0.74)).toBe(0);
    expect(at(mask, 0.35, 0.68)).toBe(0);
    expect(at(mask, 0.37, 0.4)).toBe(0);
  });

  it('follow the photo where the outline of the model slips, as on a tilted head', () => {
    const big = makeFace(oval(0.5, 0.5, 0.26, 0.36), { ...parts, innerLips: lens(0.5, 0.68, 0.1, 0.012, 20), outerLips: lens(0.5, 0.68, 0.14, 0.06, 20) });
    const slipped = portrait((u, v) => {
      if (inLens(u, v, 0.5, 0.692, 0.1, 0.012)) return TEETH;
      if (inLens(u, v, 0.5, 0.692, 0.14, 0.06)) return LIP;
      return null;
    });
    const mask = buildRegionMask([big], 'lips', slipped)!;
    // The lower lip of the photo, past the outer contour of the model.
    expect(at(mask, 0.5, 0.745)).toBeGreaterThan(170);
    // The skin the outline covers, above the upper lip of the photo.
    expect(at(mask, 0.5, 0.626)).toBeLessThan(30);
    expect(at(mask, 0.5, 0.65)).toBeGreaterThan(200);
  });

  it('close a glint on the lip', () => {
    const glinted = portrait((u, v) => {
      if (inLens(u, v, 0.5, 0.708, 0.025, 0.006)) return [245, 225, 225];
      if (inLens(u, v, 0.5, 0.68, 0.07, 0.015)) return TEETH;
      if (inLens(u, v, 0.5, 0.68, 0.09, 0.035)) return LIP;
      return null;
    });
    expect(at(buildRegionMask([face()], 'lips', glinted)!, 0.5, 0.708)).toBeGreaterThan(220);
  });

  it('keep a clean edge: no patch of redder skin near the mouth, no bite out of a washed-out lip', () => {
    const marked = portrait((u, v) => {
      if (inLens(u, v, 0.5, 0.68, 0.07, 0.015)) return TEETH;
      if (inLens(u, v, 0.5, 0.68, 0.09, 0.035)) return LIP;
      if (Math.hypot(u - 0.585, v - 0.64) < 0.006) return LIP;
      return null;
    });
    expect(at(buildRegionMask([face()], 'lips', marked)!, 0.585, 0.64)).toBeLessThan(30);
    // A band of the upper lip as bright as a glint, between the strong color and the edge.
    const washed = portrait((u, v) => {
      if (inLens(u, v, 0.5, 0.68, 0.07, 0.015)) return TEETH;
      if (inLens(u, v, 0.5, 0.68, 0.09, 0.035)) return v < 0.652 && u > 0.46 && u < 0.54 ? [250, 225, 215] : LIP;
      return null;
    });
    expect(at(buildRegionMask([face()], 'lips', washed)!, 0.5, 0.65)).toBeGreaterThan(200);
  });

  it('paint the line where the lips meet, and only leave out what is not lip in the opening', () => {
    const line = makeFace(oval(0.5, 0.5, 0.26, 0.36), { ...parts, innerLips: lens(0.5, 0.68, 0.08, 0.012, 20) });
    const parted = portrait((u, v) => {
      if (inLens(u, v, 0.5, 0.68, 0.03, 0.012)) return TEETH;
      if (inLens(u, v, 0.5, 0.68, 0.09, 0.035)) return LIP;
      return null;
    });
    const mask = buildRegionMask([line], 'lips', parted)!;
    expect(at(mask, 0.5, 0.68)).toBeLessThan(30);
    // Inside the contour of the model, but the color of the lips.
    expect(at(mask, 0.565, 0.68)).toBeGreaterThan(200);
  });

  it('reach a paler bow of the upper lip that rises past the contour of the model', () => {
    // A larger grid than the others, so the pale stretch has room between the two steps.
    const S = 720;
    const area = { x: 0, y: 0, w: S, h: S };
    const rgba = new Uint8ClampedArray(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      const u = ((i % S) + 0.5) / S;
      const v = (Math.floor(i / S) + 0.5) / S;
      let c: readonly number[] = SKIN;
      if (inLens(u, v, 0.5, 0.68, 0.1, 0.012)) c = TEETH;
      else if (inLens(u, v, 0.5, 0.68, 0.14, 0.06)) c = LIP;
      // Halfway between the color of the lip and the skin, as the top of a bow often is.
      else if (inLens(u, v, 0.5, 0.62, 0.05, 0.016)) c = [205, 124, 112];
      rgba.set([...c, 255], i * 4);
    }
    const grid = (points: Point[]) => points.map(([u, v]): Point => [u * S, v * S]);
    const inner = grid(lens(0.5, 0.68, 0.1, 0.012, 20));
    const mask = lipsFromPhoto(rgba, area, grid(lens(0.5, 0.68, 0.14, 0.06, 20)), inner, inner, 0.28 * S)!;
    const row = (v: number) => mask[Math.round(v * S) * S + S / 2];
    expect(row(0.609)).toBeGreaterThan(0.5);
    expect(row(0.595)).toBeLessThan(0.1);
  });

  it('come out as a smooth line, whatever the grain of the photo', () => {
    const grainy = portrait((u, v) => {
      if (inLens(u, v, 0.5, 0.68, 0.07, 0.015)) return TEETH;
      const n = (Math.round(u * SIZE) * 7 + Math.round(v * SIZE) * 13) % 5;
      if (inLens(u, v, 0.5, 0.68, 0.09, 0.035)) return [LIP[0] + n * 6, LIP[1] - n * 4, LIP[2] - n * 3];
      return [SKIN[0] + n * 3, SKIN[1] + n * 3, SKIN[2] + n * 3];
    });
    const mask = buildRegionMask([face()], 'lips', grainy)!;
    // Where the lower edge crosses half strength, column by column: it never jumps.
    const edges: number[] = [];
    for (let x = Math.round(0.44 * SIZE); x <= Math.round(0.56 * SIZE); x++) {
      let y = Math.round(0.75 * SIZE);
      while (y > 0 && mask[y * SIZE + x] < 128) y--;
      edges.push(y);
    }
    for (let i = 1; i < edges.length; i++) expect(Math.abs(edges[i] - edges[i - 1])).toBeLessThanOrEqual(1);
  });

  it('cover the whole mouth when it is closed', () => {
    const closed = makeFace(oval(0.5, 0.5, 0.26, 0.36), { ...parts, innerLips: lens(0.5, 0.68, 0.07, 0.001, 20) });
    const target = portrait((u, v) => (inLens(u, v, 0.5, 0.68, 0.09, 0.035) ? LIP : null));
    const mask = buildRegionMask([closed], 'lips', target)!;
    expect(at(mask, 0.5, 0.68)).toBeGreaterThan(200);
    expect(buildRegionMask([closed], 'teeth', target)).toBeNull();
  });

  it('go back to the outline when the photo shows no difference', () => {
    const mask = buildRegionMask([face()], 'lips', portrait(() => null))!;
    expect(at(mask, 0.5, 0.705)).toBeGreaterThan(200);
    expect(at(mask, 0.5, 0.68)).toBe(0);
    expect(at(mask, 0.5, 0.74)).toBe(0);
    const shape = buildRegionMask([face()], 'lips', { w: SIZE, h: SIZE })!;
    expect(at(shape, 0.5, 0.705)).toBeGreaterThan(200);
  });

  it('find nothing without a mouth', () => {
    expect(buildRegionMask([], 'lips', smile())).toBeNull();
    expect(buildRegionMask([makeFace(oval(0.5, 0.5, 0.26, 0.36))], 'lips', smile())).toBeNull();
  });
});

describe('brows', () => {
  /** A brow of the photo, lower than the model says. */
  const browed = (dy: number) => portrait((u, v) => (inLens(u, v, 0.37, 0.31 + dy, 0.075, 0.012) || inLens(u, v, 0.63, 0.31 + dy, 0.075, 0.012) ? BROW : null));

  it('fill with the hair the photo shows, and the limit gives some room around it', () => {
    const target = browed(0);
    const hair = buildRegionMask([face()], 'browhair', target)!;
    const reach = buildRegionMask([face()], 'brows', target)!;
    expect(at(hair, 0.37, 0.31)).toBeGreaterThan(200);
    expect(at(hair, 0.63, 0.31)).toBeGreaterThan(200);
    // Bare skin just above the brow: the brush may go there, the automatic mode does not.
    expect(at(reach, 0.37, 0.294)).toBeGreaterThan(100);
    expect(at(hair, 0.37, 0.285)).toBeLessThan(30);
    for (const mask of [hair, reach]) {
      expect(at(mask, 0.37, 0.25)).toBe(0);
      expect(at(mask, 0.5, 0.31)).toBe(0);
    }
  });

  it('follow the hair where the outline of the model slips', () => {
    const hair = buildRegionMask([face()], 'browhair', browed(0.01))!;
    expect(at(hair, 0.37, 0.325)).toBeGreaterThan(180);
    expect(at(hair, 0.37, 0.298)).toBeLessThan(40);
  });

  it('fill the gaps between the hairs softly', () => {
    const sparse = portrait((u, v) => (inLens(u, v, 0.37, 0.31, 0.075, 0.012) && Math.round(u * SIZE) % 6 < 3 ? BROW : null));
    const hair = buildRegionMask([face()], 'browhair', sparse)!;
    const row = Math.round(0.31 * SIZE);
    const values = Array.from({ length: 12 }, (_, i) => hair[row * SIZE + Math.round(0.35 * SIZE) + i]);
    expect(Math.min(...values)).toBeGreaterThan(30);
    expect(Math.max(...values)).toBeGreaterThan(Math.min(...values));
  });

  it('go back to the shape of the model when the photo shows no darker brow', () => {
    const hair = buildRegionMask([face()], 'browhair', portrait(() => null))!;
    expect(at(hair, 0.37, 0.31)).toBeGreaterThan(200);
    expect(at(hair, 0.37, 0.25)).toBe(0);
  });

  it('keep off the eye of a low brow', () => {
    const low = makeFace(oval(0.5, 0.5, 0.26, 0.36), { ...parts, brows: [brow(0.37, 0.37, 0.07, 0.01, -1)], eyes: parts.eyes.slice(0, 1) });
    expect(at(buildRegionMask([low], 'brows', portrait(() => null))!, 0.37, 0.4)).toBe(0);
  });

  it('find nothing on a face without them', () => {
    expect(buildRegionMask([makeFace(oval(0.5, 0.5, 0.26, 0.36), { ...parts, brows: undefined })], 'brows', portrait(() => null))).toBeNull();
  });
});

describe('lids', () => {
  /** Eyes of the photo: a white and an iris, under the lid of skin, and brows above. */
  const eyed = portrait((u, v) => {
    for (const cx of [0.37, 0.63]) {
      if (Math.hypot(u - cx, v - 0.4) < 0.018) return [70, 95, 105];
      if (inLens(u, v, cx, 0.4, 0.06, 0.022)) return [225, 220, 215];
      if (inLens(u, v, cx, 0.31, 0.075, 0.012)) return BROW;
    }
    return null;
  });

  it('lie between the lashes and the brow, off the eye and the brow', () => {
    for (const region of ['lids', 'shadow'] as const) {
      const mask = buildRegionMask([face()], region, eyed)!;
      expect(at(mask, 0.37, 0.365)).toBeGreaterThan(60);
      expect(at(mask, 0.63, 0.365)).toBeGreaterThan(60);
      expect(at(mask, 0.37, 0.4)).toBe(0);
      expect(at(mask, 0.31, 0.4)).toBeLessThan(10);
      expect(at(mask, 0.37, 0.31)).toBeLessThan(20);
      expect(at(mask, 0.37, 0.45)).toBe(0);
      expect(at(mask, 0.5, 0.37)).toBe(0);
    }
  });

  it('fade from the lashes up in the shadow, and stay even for the brush', () => {
    const shadow = buildRegionMask([face()], 'shadow', eyed)!;
    const lids = buildRegionMask([face()], 'lids', eyed)!;
    expect(at(shadow, 0.37, 0.37)).toBeGreaterThan(at(shadow, 0.37, 0.345) + 40);
    expect(Math.abs(at(lids, 0.37, 0.36) - at(lids, 0.37, 0.345))).toBeLessThan(30);
  });

  it('keep out of the white when the eye of the model slips', () => {
    const slipped = portrait((u, v) => {
      // The eye of the photo sits higher than the model says.
      if (inLens(u, v, 0.37, 0.385, 0.06, 0.022)) return [225, 220, 215];
      if (inLens(u, v, 0.37, 0.31, 0.075, 0.012)) return BROW;
      return null;
    });
    expect(at(buildRegionMask([face()], 'lids', slipped)!, 0.37, 0.372)).toBeLessThan(60);
  });

  it('have a shape without a brow, with a point past the outer corner', () => {
    const shape = lidShape(lens(100, 100, 30, 10, 16), undefined, 1);
    expect(Math.min(...shape.map((p) => p[1]))).toBeLessThan(90);
    expect(Math.min(...shape.map((p) => p[0]))).toBeLessThan(70);
    expect(Math.max(...shape.map((p) => p[1]))).toBeLessThanOrEqual(100);
  });
});

describe('blush, contour and freckles', () => {
  const plain = portrait(() => null);
  const mean = (mask: Uint8Array, u: number, v: number) => {
    let sum = 0;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) sum += at(mask, u + x / SIZE, v + y / SIZE);
    return sum / 25;
  };

  it('the blush falls on the apples of the cheeks, not on the nose, the lips or the forehead', () => {
    const mask = buildRegionMask([face()], 'cheeks', plain)!;
    expect(mean(mask, 0.33, 0.52)).toBeGreaterThan(150);
    expect(mean(mask, 0.67, 0.52)).toBeGreaterThan(150);
    expect(mean(mask, 0.5, 0.5)).toBeLessThan(5);
    expect(mean(mask, 0.5, 0.68)).toBe(0);
    expect(mean(mask, 0.5, 0.26)).toBe(0);
    expect(mean(mask, 0.05, 0.5)).toBe(0);
  });

  it('the contour falls under the cheekbones and along the sides of the face and the nose', () => {
    const mask = buildRegionMask([face()], 'sculpt', plain)!;
    expect(mean(mask, 0.32, 0.61)).toBeGreaterThan(120);
    expect(mean(mask, 0.68, 0.61)).toBeGreaterThan(120);
    expect(mean(mask, 0.46, 0.47)).toBeGreaterThan(60);
    expect(mean(mask, 0.54, 0.47)).toBeGreaterThan(60);
    const side = face().outline[FACE_OVAL.indexOf(93)];
    expect(mean(mask, side[0] + 0.03, side[1])).toBeGreaterThan(40);
    expect(mean(mask, 0.5, 0.45)).toBeLessThan(40);
    expect(mean(mask, 0.5, 0.3)).toBeLessThan(5);
    expect(mean(mask, 0.5, 0.82)).toBeLessThan(5);
  });

  it('the freckles fall over the nose and the top of the cheeks, not on the forehead, the mouth or the chin', () => {
    const mask = buildRegionMask([face()], 'sprinkle', plain)!;
    expect(mean(mask, 0.5, 0.47)).toBeGreaterThan(150);
    expect(mean(mask, 0.36, 0.49)).toBeGreaterThan(150);
    expect(mean(mask, 0.64, 0.49)).toBeGreaterThan(150);
    expect(mean(mask, 0.5, 0.28)).toBeLessThan(5);
    expect(mean(mask, 0.5, 0.68)).toBe(0);
    expect(mean(mask, 0.5, 0.78)).toBeLessThan(5);
  });

  it('stay on the skin: hair falling over the cheek stays out', () => {
    const lock = portrait((u) => (u < 0.34 ? HAIR : null));
    const mask = buildRegionMask([face()], 'cheeks', lock)!;
    expect(mean(mask, 0.31, 0.52)).toBeLessThan(15);
    expect(mean(mask, 0.67, 0.52)).toBeGreaterThan(150);
  });

  it('shrink on the side of the eye a turned head shrinks', () => {
    const turned = makeFace(oval(0.5, 0.5, 0.26, 0.36), { ...parts, eyes: [lens(0.37, 0.4, 0.03, 0.02, 16), parts.eyes[1]] });
    const mask = buildRegionMask([turned], 'cheeks', plain)!;
    // Same distance from each line: the far side has already faded.
    expect(mean(mask, 0.27, 0.55)).toBeLessThan(mean(mask, 0.73, 0.55) - 30);
  });

  it('find nothing on a face without those lines', () => {
    const bare = makeFace(oval(0.5, 0.5, 0.26, 0.36), { ...parts, cheeks: undefined, hollows: undefined, noseSides: undefined, cheekTops: undefined });
    for (const region of ['cheeks', 'sculpt', 'sprinkle'] as const) expect(buildRegionMask([bare], region, plain)).toBeNull();
    for (const region of ['cheeks', 'sculpt', 'sprinkle'] as const) expect(buildRegionMask([], region, plain)).toBeNull();
  });

  it('a band is strongest on its line and gone two radii away', () => {
    const area = { x: 0, y: 0, w: 100, h: 100 };
    const shape = new Float32Array(100 * 100);
    addBand(shape, area, [[20, 50], [80, 50]], 10, 0.8);
    expect(shape[50 * 100 + 50]).toBeCloseTo(0.8, 1);
    expect(shape[50 * 100 + 20]).toBeCloseTo(0.8, 1);
    expect(shape[25 * 100 + 50]).toBeLessThan(0.01);
  });
});

describe('the fit of a contour', () => {
  /** A map with a disc of radius 40 around (100, 100), on a grid of 200. */
  const area = { x: 0, y: 0, w: 200, h: 200 };
  const disc = (value: (x: number, y: number) => number) => Float32Array.from({ length: 200 * 200 }, (_, i) => value(i % 200, Math.floor(i / 200)));
  const circle = (radius: number) => Array.from({ length: 60 }, (_, i): Point => [100 + Math.cos((i / 60) * 6.2832) * radius, 100 + Math.sin((i / 60) * 6.2832) * radius]);
  const radii = (points: readonly Point[]) => points.map(([x, y]) => Math.hypot(x - 100, y - 100));

  it('moves onto the edge from either side', () => {
    const map = disc((x, y) => (Math.hypot(x - 100, y - 100) < 40 ? 1 : 0));
    for (const start of [37, 43]) {
      for (const r of radii(fitContour(circle(start), map, area, 100))) expect(Math.abs(r - 40)).toBeLessThan(1.5);
    }
  });

  it('stays where it is on a map with no edge', () => {
    const map = disc(() => 0.5);
    for (const r of radii(fitContour(circle(40), map, area, 100))) expect(r).toBeCloseTo(40, 3);
  });

  it('takes after the neighbors where one stretch has no edge', () => {
    // An edge all around, except a stretch of the disc as pale as the outside.
    const map = disc((x, y) => (Math.hypot(x - 100, y - 100) < 40 && !(x > 110 && Math.abs(y - 100) < 10) ? 1 : 0));
    const fitted = radii(fitContour(circle(38), map, area, 100));
    expect(Math.abs(fitted[0] - 40)).toBeLessThan(3);
  });

  it('runs a smooth loop through the points it was given', () => {
    const square: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const loop = smoothLoop(square, 4);
    expect(loop.length).toBe(16);
    expect(loop[0]).toEqual([0, 0]);
    expect(loop[4]).toEqual([10, 0]);
  });
});

describe('the size of a face', () => {
  it('is the largest face as a share of the long side, and zero without one', () => {
    const small = makeFace(oval(0.2, 0.2, 0.05, 0.05));
    const large = makeFace(oval(0.6, 0.6, 0.2, 0.3));
    expect(faceShare([small, large], 1000, 500)).toBeCloseTo(0.4, 1);
    expect(faceShare([], 1000, 500)).toBe(0);
  });
});

describe('reached', () => {
  it('goes through what is open and stops at the rest, without wrapping around the row', () => {
    const w = 4;
    const open = [1, 1, 0, 1, 0, 0, 0, 1];
    const seen = reached((i) => open[i] === 1, [0], w, 2);
    expect([...seen]).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
  });
});

describe('the Make group in the catalog', () => {
  const make = TOOLS.filter((t) => t.group === 'makeup');

  it('holds every tool on a region, with words for the switch, the wait and the panel', () => {
    expect(make.map((t) => t.id)).toEqual(['lips', 'whiten', 'blush', 'eyeshadow', 'brow', 'contour', 'freckles']);
    for (const tool of make) {
      expect(tool.region).toBeTruthy();
      expect(LIMIT_WORDS[tool.region!].name).toMatch(/^Só/);
      expect(PLACES[tool.fill ?? tool.region!]).toBeTruthy();
    }
  });

  it('fills the shape meant for each one', () => {
    const shape = (id: string) => {
      const t = make.find((m) => m.id === id)!;
      return [t.region, t.fill];
    };
    expect(shape('lips')).toEqual(['lips', undefined]);
    expect(shape('whiten')).toEqual(['teeth', undefined]);
    expect(shape('blush')).toEqual(['skin', 'cheeks']);
    expect(shape('eyeshadow')).toEqual(['lids', 'shadow']);
    expect(shape('brow')).toEqual(['brows', 'browhair']);
    expect(shape('contour')).toEqual(['skin', 'sculpt']);
    expect(shape('freckles')).toEqual(['skin', 'sprinkle']);
  });
});

describe('framing the makeup', () => {
  const top = (region: LandmarkRegion) => focusPoints([face()], region)[0];

  it('frames the mouth for the lips and the eyes with the brows for the lids', () => {
    expect(top('lips').length).toBe(20);
    const brows = top('brows');
    expect(Math.max(...brows.map((p) => p[1]))).toBeLessThan(0.33);
    const lids = top('lids');
    expect(Math.min(...lids.map((p) => p[1]))).toBeLessThan(0.31);
    expect(Math.max(...lids.map((p) => p[1]))).toBeGreaterThan(0.41);
  });

  it('frames the whole face for what lies on the skin', () => {
    for (const region of ['cheeks', 'sculpt', 'sprinkle'] as const) expect(top(region).length).toBe(FACE_OVAL.length);
  });

  it('leaves out a face that does not show the region', () => {
    expect(focusPoints([makeFace(oval(0.5, 0.5, 0.26, 0.36))], 'lips')).toEqual([]);
    expect(focusPoints([makeFace(oval(0.5, 0.5, 0.26, 0.36))], 'brows')).toEqual([]);
    expect(focusPoints([makeFace(oval(0.5, 0.5, 0.26, 0.36))], 'lids')).toEqual([]);
  });
});
