import { describe, expect, it } from 'vitest';
import { createDoc, type EditDoc } from '../../src/core/doc';
import { isFun, type AnySource } from '../../src/core/face/fieldwork';
import { makeFace, type Face } from '../../src/core/face/scan';
import { placeOnFace } from '../../src/core/fun/anchor';
import { FUN_EFFECTS, funEffectById } from '../../src/core/fun/effects/index';
import { funFieldFrom } from '../../src/core/fun/field';
import { readFace } from '../../src/core/fun/kit';
import { shownAt, shownSticker, sourceAt } from '../../src/core/fun/place';
import { STICKERS, stickerById } from '../../src/core/fun/stickers/index';
import type { FunSource } from '../../src/core/fun/types';
import { InvalidProjectError, validProject } from '../../src/core/project';
import { lens, oval } from './face-fixtures';

/** A face looking at the camera, in the middle of a square photo. */
const FRONT: Face = makeFace(oval(0.5, 0.5, 0.22, 0.3), {
  eyes: [lens(0.4, 0.42, 0.05, 0.02, 16), lens(0.6, 0.42, 0.05, 0.02, 16)],
  irises: [lens(0.4, 0.42, 0.012, 0.012, 4), lens(0.6, 0.42, 0.012, 0.012, 4)],
  innerLips: lens(0.5, 0.65, 0.05, 0.01, 20),
  outerLips: lens(0.5, 0.65, 0.07, 0.02, 20),
  midline: [[0.5, 0.3], [0.5, 0.4], [0.5, 0.5], [0.5, 0.6], [0.5, 0.7]],
});

const source = (values: Record<string, number>): FunSource => ({ kind: 'fun', shapes: [{ at: [0.5, 0.5], values }], faces: [FRONT], w: 1000, h: 1000 });

/** Along a line through `c`, the point read moves forward as the point shown does: the warp never folds. */
function neverFolds(offset: (u: number, v: number) => readonly [number, number], c: readonly [number, number], dir: readonly [number, number]): boolean {
  let last = -Infinity;
  for (let t = -0.45; t <= 0.45; t += 0.002) {
    const u = c[0] + dir[0] * t;
    const v = c[1] + dir[1] * t;
    const [du, dv] = offset(u, v);
    const along = (u + du - c[0]) * dir[0] + (v + dv - c[1]) * dir[1];
    if (along < last - 1e-9) return false;
    last = along;
  }
  return true;
}

describe('the registry of Brincar', () => {
  it('has each effect and each sticker once, with a name', () => {
    expect(new Set(FUN_EFFECTS.map((e) => e.id)).size).toBe(FUN_EFFECTS.length);
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
    for (const e of FUN_EFFECTS) expect(e.label.length).toBeGreaterThan(0);
    for (const s of STICKERS) expect(s.label.length).toBeGreaterThan(0);
    expect(funEffectById('olhao')?.label).toBe('Olhão');
    expect(funEffectById('cabecao')?.layered).toBe(true);
    expect(stickerById('oculos-redondos')).toBeDefined();
  });

  it('ships stickers made in the project: plain SVG, nothing from outside, the shape its viewBox says', () => {
    for (const s of STICKERS) {
      expect(s.svg.startsWith('<svg ')).toBe(true);
      // No text, no fonts, no pictures inside, no scripts, and no address but the name of SVG itself. A url() may
      // only name a gradient of the same file, and an href only a part of it.
      expect(s.svg).not.toMatch(/<text|<image|<script|<foreignObject|<style|@import|url\((?!#)|href="(?!#)/i);
      expect(s.svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:/);
      const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(s.svg);
      expect(box).not.toBeNull();
      expect(s.aspect).toBeCloseTo(Number(box![2]) / Number(box![1]), 6);
    }
  });
});

describe('the field of Brincar', () => {
  it('is nothing with every effect at zero, an effect it does not know, or no face', () => {
    expect(funFieldFrom(source({}))).toBeNull();
    expect(funFieldFrom(source({ olhao: 0, cabecao: 0 }))).toBeNull();
    expect(funFieldFrom(source({ nada: 80 }))).toBeNull();
    expect(funFieldFrom({ ...source({ olhao: 80 }), faces: [] })).toBeNull();
  });

  it('Olhão grows each eye around its middle, and leaves the rest of the photo', () => {
    const field = funFieldFrom(source({ olhao: 100 }))!;
    expect(field.alone).toBeUndefined();
    // Beside the middle of the left eye, the photo is read from closer to the middle: the eye shows bigger.
    const [du, dv] = field.offset(0.43, 0.42);
    expect(du).toBeLessThan(-0.005);
    expect(Math.abs(dv)).toBeLessThan(1e-6);
    const middle = field.offset(0.4, 0.42);
    expect(Math.hypot(middle[0], middle[1])).toBeLessThan(1e-9);
    expect(field.offset(0.5, 0.8)).toEqual([0, 0]);
    expect(field.offset(0.05, 0.05)).toEqual([0, 0]);
    for (const dir of [[1, 0], [0, 1], [Math.SQRT1_2, Math.SQRT1_2]] as const) expect(neverFolds(field.offset, [0.4, 0.42], dir)).toBe(true);
  });

  it('a stronger Olhão grows the eyes more', () => {
    const weak = funFieldFrom(source({ olhao: 30 }))!.offset(0.43, 0.42)[0];
    const strong = funFieldFrom(source({ olhao: 90 }))!.offset(0.43, 0.42)[0];
    expect(strong).toBeLessThan(weak);
  });

  it('Cabeção grows the head over the body: the share the body does not take is there, and it never folds', () => {
    const field = funFieldFrom(source({ cabecao: 100 }))!;
    expect(field.alone).toBeDefined();
    // The forehead shows what was lower, closer to the neck: the head grows up and out.
    const [, dv] = field.offset(0.5, 0.25);
    expect(dv).toBeGreaterThan(0.02);
    // Above the head the body has nothing, and the whole move is the head's own.
    const share = field.alone!(0.5, 0.25);
    expect(share[1]).toBeCloseTo(dv, 6);
    // Down at the shoulders the body takes none of it.
    expect(field.alone!(0.2, 0.95)).toEqual(field.offset(0.2, 0.95));
    for (const dir of [[0, 1], [1, 0], [Math.SQRT1_2, -Math.SQRT1_2]] as const) expect(neverFolds(field.offset, [0.5, 0.86], dir)).toBe(true);
  });

  it('effects stack, each one on its own face only', () => {
    const both = funFieldFrom(source({ olhao: 60, cabecao: 60 }))!;
    const eyes = funFieldFrom(source({ olhao: 60 }))!;
    const head = funFieldFrom(source({ cabecao: 60 }))!;
    // The head grows last, over eyes grown first: see "Brincar" in docs/DESIGN.md.
    const b = head.offset(0.43, 0.42);
    const a = eyes.offset(0.43 + b[0], 0.42 + b[1]);
    const sum = both.offset(0.43, 0.42);
    expect(sum[0]).toBeCloseTo(a[0] + b[0], 3);
    expect(sum[1]).toBeCloseTo(a[1] + b[1], 3);
    // Numbers kept for a place where no face is move nothing.
    expect(funFieldFrom({ ...source({ olhao: 60 }), shapes: [{ at: [0.05, 0.05], values: { olhao: 60 } }] })).toBeNull();
  });

  it('a worker tells its source from one of the face menu', () => {
    const fun: AnySource = source({ olhao: 10 });
    const shape: AnySource = { amount: undefined, shapes: [], off: [], faces: [], w: 1, h: 1 };
    expect(isFun(fun)).toBe(true);
    expect(isFun(shape)).toBe(false);
  });
});

describe('the stickers', () => {
  it('the round glasses sit on the line of the eyes, as wide as the eyes need', () => {
    const glasses = stickerById('oculos-redondos')!;
    const place = placeOnFace(glasses, FRONT, 1000, 1000);
    expect(place.x).toBeCloseTo(0.5, 6);
    expect(place.y).toBeCloseTo(0.42, 3);
    expect(place.angle).toBeCloseTo(0, 6);
    // The lenses are half the art apart, so the art is twice as wide as the eyes are apart.
    expect(place.size).toBeCloseTo(0.4, 3);
  });

  it('turn with a tilted face', () => {
    const glasses = stickerById('oculos-redondos')!;
    const tilted = makeFace(oval(0.5, 0.5, 0.22, 0.3), { ...FRONT.parts, eyes: [lens(0.4, 0.4, 0.05, 0.02, 16), lens(0.6, 0.44, 0.05, 0.02, 16)] });
    expect(placeOnFace(glasses, tilted, 1000, 1000).angle).toBeCloseTo(Math.atan2(0.04, 0.2), 3);
  });

  it('go to the middle of a face with no eyes', () => {
    const plain = makeFace(oval(0.5, 0.5, 0.2, 0.25));
    const place = placeOnFace(stickerById('oculos-redondos')!, plain, 1000, 1000);
    expect(place.x).toBeCloseTo(0.5, 2);
    expect(place.y).toBeCloseTo(0.5, 2);
  });

  it('follow the warps: where a point shows is where the warp reads it from', () => {
    // A warp that grows everything around the middle by a quarter.
    const lookup = (u: number, v: number) => [(0.5 - u) * 0.2, (0.5 - v) * 0.2] as const;
    const p: [number, number] = [0.6, 0.3];
    const q = shownAt(p, lookup);
    const back = sourceAt(q, lookup);
    expect(back[0]).toBeCloseTo(p[0], 6);
    expect(back[1]).toBeCloseTo(p[1], 6);
    const shown = shownSticker({ x: 0.6, y: 0.3, size: 0.2, angle: 0.3 }, 1000, 1000, lookup);
    expect(shown.size).toBeCloseTo(0.25, 4);
    expect(shown.angle).toBeCloseTo(0.3, 6);
    expect(shown.x).toBeCloseTo(0.625, 4);
    expect(shownSticker({ x: 0.6, y: 0.3, size: 0.2, angle: 0.3 }, 1000, 1000, null)).toEqual({ x: 0.6, y: 0.3, size: 0.2, angle: 0.3 });
  });

  it('a face frame is there for a face with an outline', () => {
    expect(readFace(FRONT, 1, 1)).not.toBeNull();
  });
});

describe('a saved project with Brincar', () => {
  const blob = new Blob(['x']);
  const record = (doc: EditDoc, extra: Record<string, unknown> = {}) => ({ id: 'p', name: 'p', updated: 1, width: doc.width, height: doc.height, thumb: blob, doc, masks: {}, field: null, ...extra });

  it('opens with its numbers and stickers, and an older one opens with none', () => {
    const doc = createDoc(100, 80);
    expect(validProject(record(doc), blob).record.doc.fun).toBeUndefined();
    doc.fun = { faces: [{ at: [0.5, 0.5], values: { olhao: 40 } }], stickers: [{ id: 1, kind: 'oculos-redondos', at: null, x: 0.5, y: 0.4, size: 0.3, angle: 0 }] };
    expect(validProject(record(doc, { fun: blob }), blob).record.doc.fun).toEqual(doc.fun);
  });

  it('does not open with a part of Brincar that makes no sense', () => {
    const bad = (fun: unknown) => {
      const doc = { ...createDoc(100, 80), fun } as unknown as EditDoc;
      return () => validProject(record(doc), blob);
    };
    expect(bad('olhão')).toThrow(InvalidProjectError);
    expect(bad({ faces: [{ at: [0.5], values: {} }] })).toThrow(InvalidProjectError);
    expect(bad({ stickers: [{ id: 1, kind: 'x', at: null, x: 'meio', y: 0, size: 1, angle: 0 }] })).toThrow(InvalidProjectError);
    expect(() => validProject(record(createDoc(10, 10), { fun: 'campo' }), blob)).toThrow(InvalidProjectError);
  });
});
