import { describe, expect, it } from 'vitest';
import type { Point } from '../../src/core/face/mask';
import { makeFace, type Face, type FaceParts } from '../../src/core/face/scan';
import { comboOf, comboValues, FUN_COMBOS } from '../../src/core/fun/combos';
import { FUN_EFFECTS, funEffectById } from '../../src/core/fun/effects/index';
import { funFieldFrom, shownThrough } from '../../src/core/fun/field';
import type { FunSource } from '../../src/core/fun/types';
import { ramp } from '../../src/core/fun/warps';
import { lens, oval } from './face-fixtures';

/** A face with every part the detector gives, looking at the camera in a square photo. */
function face(turn = 0, cx = 0.5, cy = 0.5, size = 1): Face {
  const c: Point = [cx, cy];
  const at = (p: Point): Point => {
    const x = (p[0] - 0.5) * size;
    const y = (p[1] - 0.5) * size;
    return [c[0] + x * Math.cos(turn) - y * Math.sin(turn), c[1] + x * Math.sin(turn) + y * Math.cos(turn)];
  };
  const all = (list: readonly Point[]) => list.map(at);
  const parts: FaceParts = {
    eyes: [lens(0.41, 0.44, 0.045, 0.015, 16), lens(0.59, 0.44, 0.045, 0.015, 16)].map(all),
    irises: [lens(0.41, 0.44, 0.012, 0.012, 4), lens(0.59, 0.44, 0.012, 0.012, 4)].map(all),
    innerLips: all(lens(0.5, 0.64, 0.045, 0.008, 20)),
    outerLips: all(lens(0.5, 0.64, 0.065, 0.022, 20)),
    brows: [lens(0.4, 0.395, 0.06, 0.008, 10), lens(0.6, 0.395, 0.06, 0.008, 10)].map(all),
    midline: all([[0.5, 0.36], [0.5, 0.43], [0.5, 0.47], [0.5, 0.5], [0.5, 0.53], [0.5, 0.55], [0.5, 0.565], [0.5, 0.57], [0.5, 0.72]]),
    marks: {
      jawCorners: all([[0.33, 0.66], [0.67, 0.66]]),
      cheekbones: all([[0.3, 0.5], [0.7, 0.5]]),
      temples: all([[0.31, 0.42], [0.69, 0.42]]),
      noseWings: all([[0.465, 0.565], [0.535, 0.565]]),
      bridge: at([0.5, 0.43]),
      bridgeMiddle: at([0.5, 0.48]),
      noseTip: at([0.5, 0.565]),
      noseBase: at([0.5, 0.585]),
    },
  };
  return makeFace(all(oval(0.5, 0.5, 0.2, 0.28)), parts);
}

const FRONT = face();
/** Tilted 20 degrees, off the middle and smaller, as a head leaning in a group photo. */
const TILTED = face(0.35, 0.45, 0.55, 0.8);

const source = (values: Record<string, number>, f: Face = FRONT): FunSource => {
  const { x, y, w, h } = f.box;
  return { kind: 'fun', shapes: [{ at: [x + w / 2, y + h / 2], values }], faces: [f], w: 1000, h: 1000 };
};

type Offset = (u: number, v: number) => readonly [number, number];

/** The smallest area a small square of the photo shows as, against its own: below zero the warp folds there. */
function leastStretch(offset: Offset, from = 0.08, to = 0.92, step = 0.004): number {
  const e = 2e-4;
  let least = Infinity;
  for (let v = from; v <= to; v += step) {
    for (let u = from; u <= to; u += step) {
      const [au, av] = offset(u - e, v);
      const [bu, bv] = offset(u + e, v);
      const [cu, cv] = offset(u, v - e);
      const [du, dv] = offset(u, v + e);
      const j00 = 1 + (bu - au) / (2 * e);
      const j10 = (bv - av) / (2 * e);
      const j01 = (du - cu) / (2 * e);
      const j11 = 1 + (dv - cv) / (2 * e);
      least = Math.min(least, j00 * j11 - j01 * j10);
    }
  }
  return least;
}

/** Where a point of the photo shows. */
const shown = (offset: Offset, p: Point) => shownThrough(p, offset);
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const NEW = ['olhinhos', 'narigao', 'narizinho', 'bocao', 'boquinha', 'sorrisao', 'bochechas', 'peixe', 'queixao', 'testao', 'esticado', 'achatado'];

describe('the caretas', () => {
  it('are in the registry once, with a name and a note in pt-BR, ten more than the two Brincar had', () => {
    for (const id of NEW) expect(funEffectById(id), id).toBeDefined();
    expect(FUN_EFFECTS.length).toBeGreaterThanOrEqual(12);
    for (const e of FUN_EFFECTS) expect(e.note?.length, e.id).toBeGreaterThan(0);
    // The whole head goes last, so what grows on a face grows with the head.
    expect(FUN_EFFECTS.at(-1)!.id).toBe('cabecao');
  });

  it('move nothing at zero', () => {
    for (const e of FUN_EFFECTS) expect(funFieldFrom(source({ [e.id]: 0 })), e.id).toBeNull();
  });

  for (const e of FUN_EFFECTS) {
    for (const [name, f] of [['de frente', FRONT], ['inclinado', TILTED]] as const) {
      it(`${e.label} never folds, at half and at the end of the slider, ${name}`, () => {
        for (const value of [50, 100]) {
          const field = funFieldFrom(source({ [e.id]: value }, f));
          expect(field, `${e.id} ${value}`).not.toBeNull();
          expect(leastStretch(field!.offset), `${e.id} ${value}`).toBeGreaterThan(0.05);
          if (field!.alone) {
            // The body, which goes by the field but for the share of the head, never folds either.
            const body: Offset = (u, v) => {
              const [du, dv] = field!.offset(u, v);
              const [au, av] = field!.alone!(u, v);
              return [du - au, dv - av];
            };
            expect(leastStretch(body), `${e.id} body ${value}`).toBeGreaterThan(0.05);
          }
        }
      });
    }

    it(`${e.label} moves more at the end of the slider than halfway, and only near the face`, () => {
      const half = funFieldFrom(source({ [e.id]: 50 }))!;
      const full = funFieldFrom(source({ [e.id]: 100 }))!;
      let most50 = 0;
      let most100 = 0;
      for (let v = 0.1; v <= 0.9; v += 0.02) {
        for (let u = 0.1; u <= 0.9; u += 0.02) {
          most50 = Math.max(most50, Math.hypot(...half.offset(u, v)));
          most100 = Math.max(most100, Math.hypot(...full.offset(u, v)));
        }
      }
      expect(most100).toBeGreaterThan(most50);
      expect(most100).toBeGreaterThan(0.004);
      // A whole head reaches far; a part of the face stays on it.
      if (!e.layered) expect(full.offset(0.02, 0.98)).toEqual([0, 0]);
    });
  }
});

describe('each careta moves the face the way its name says', () => {
  const lips = FRONT.parts.outerLips;
  const inner = FRONT.parts.innerLips;
  const marks = FRONT.parts.marks!;
  const eye = FRONT.parts.eyes[0];
  const top = FRONT.outline[0];
  const chin = FRONT.outline[18];
  const cheek = FRONT.outline[10];
  const at = (id: string, value = 100) => funFieldFrom(source({ [id]: value }))!.offset;

  it('Olhinhos shrinks the eyes', () => {
    const o = at('olhinhos');
    expect(dist(shown(o, eye[0]), shown(o, eye[8]))).toBeLessThan(dist(eye[0], eye[8]) * 0.85);
  });

  it('Narigão grows the nose and Narizinho shrinks it, and the eyes and the lips stay', () => {
    const [a, b] = marks.noseWings;
    const big = at('narigao');
    const small = at('narizinho');
    expect(dist(shown(big, a), shown(big, b))).toBeGreaterThan(dist(a, b) * 1.3);
    expect(dist(shown(small, a), shown(small, b))).toBeLessThan(dist(a, b) * 0.85);
    for (const o of [big, small]) {
      expect(dist(shown(o, eye[0]), eye[0])).toBeLessThan(0.003);
      expect(dist(shown(o, lips[5]), lips[5])).toBeLessThan(0.008);
    }
  });

  it('Bocão grows the mouth, the teeth with it the same both ways, and Boquinha shrinks it', () => {
    const big = at('bocao');
    const wide = dist(shown(big, inner[0]), shown(big, inner[10])) / dist(inner[0], inner[10]);
    const tall = dist(shown(big, inner[5]), shown(big, inner[15])) / dist(inner[5], inner[15]);
    expect(wide).toBeGreaterThan(1.5);
    // Teeth grow and never stretch: as much across as up and down.
    expect(Math.abs(wide - tall)).toBeLessThan(0.03);
    const small = at('boquinha');
    expect(dist(shown(small, lips[0]), shown(small, lips[10]))).toBeLessThan(dist(lips[0], lips[10]) * 0.85);
  });

  it('Sorrisão takes the corners of the mouth out and up', () => {
    const o = at('sorrisao');
    const [l, r] = [shown(o, lips[0]), shown(o, lips[10])];
    expect(l[0]).toBeLessThan(lips[0][0] - 0.01);
    expect(r[0]).toBeGreaterThan(lips[10][0] + 0.01);
    expect(l[1]).toBeLessThan(lips[0][1] - 0.005);
    expect(r[1]).toBeLessThan(lips[10][1] - 0.005);
  });

  it('Bochechas de esquilo takes the outline of the cheeks out, and Cara de peixe brings it in and the corners of the mouth together', () => {
    const puff = at('bochechas');
    const fish = at('peixe');
    const lower = FRONT.outline[11];
    expect(shown(puff, lower)[0]).toBeGreaterThan(lower[0] + 0.005);
    expect(shown(fish, lower)[0]).toBeLessThan(lower[0] - 0.003);
    expect(dist(shown(fish, lips[0]), shown(fish, lips[10]))).toBeLessThan(dist(lips[0], lips[10]) * 0.9);
  });

  it('Queixão takes the chin down and Testão the top of the forehead up, and the eyes and the lips stay', () => {
    const chinDown = at('queixao');
    const tall = at('testao');
    expect(shown(chinDown, chin)[1]).toBeGreaterThan(chin[1] + 0.05);
    expect(shown(tall, top)[1]).toBeLessThan(top[1] - 0.06);
    for (const o of [chinDown, tall]) {
      expect(dist(shown(o, eye[0]), eye[0])).toBeLessThan(0.004);
      expect(dist(shown(o, lips[15]), lips[15])).toBeLessThan(0.004);
    }
  });

  it('Esticado makes the head taller and narrower, and Achatado shorter and wider, around the neck', () => {
    const long = at('esticado');
    const flat = at('achatado');
    expect(shown(long, top)[1]).toBeLessThan(top[1] - 0.08);
    expect(shown(long, cheek)[0]).toBeLessThan(cheek[0]);
    expect(shown(flat, top)[1]).toBeGreaterThan(top[1] + 0.06);
    expect(shown(flat, cheek)[0]).toBeGreaterThan(cheek[0] + 0.01);
    // The chin stays close to the neck it sits on.
    expect(Math.abs(shown(long, chin)[1] - chin[1])).toBeLessThan(0.03);
  });

  it('the ramp of a longer face is smooth at both ends and never goes back', () => {
    let last = 0;
    for (let x = -0.1; x <= 1.1; x += 0.001) {
      const r = ramp(0, 1, x);
      expect(r).toBeGreaterThanOrEqual(last - 1e-12);
      last = r;
    }
    expect(ramp(0, 1, 0)).toBe(0);
    expect(ramp(0, 1, 1)).toBe(1);
    expect(ramp(0, 1, 0.5)).toBeCloseTo(0.5, 9);
  });
});

describe('caretas stacked', () => {
  it('go one after the other in the order of the menu: the eyes grow first, then the head grows with them', () => {
    const both = funFieldFrom(source({ olhao: 60, cabecao: 60 }))!;
    const eyes = funFieldFrom(source({ olhao: 60 }))!;
    const head = funFieldFrom(source({ cabecao: 60 }))!;
    for (const p of [[0.43, 0.44], [0.5, 0.3], [0.6, 0.6]] as const) {
      const h = head.offset(p[0], p[1]);
      const e = eyes.offset(p[0] + h[0], p[1] + h[1]);
      const sum = both.offset(p[0], p[1]);
      expect(sum[0]).toBeCloseTo(h[0] + e[0], 3);
      expect(sum[1]).toBeCloseTo(h[1] + e[1], 3);
    }
  });

  it('never fold, all of them at the end of the slider at once, on a straight and on a tilted face', () => {
    const all = Object.fromEntries(FUN_EFFECTS.map((e) => [e.id, 100]));
    for (const f of [FRONT, TILTED]) {
      const field = funFieldFrom(source(all, f))!;
      expect(leastStretch(field.offset, 0.08, 0.92, 0.006)).toBeGreaterThan(0.02);
    }
  });

  it('a later careta reads the face as the earlier ones left it: Cabeção grows the whole of the chin Queixão gave it', () => {
    const top = FRONT.outline[0];
    const chin = FRONT.outline[18];
    const chinDown = funFieldFrom(source({ queixao: 100 }))!.offset;
    const both = funFieldFrom(source({ queixao: 100, cabecao: 100 }))!.offset;
    const longer = dist(shown(chinDown, top), shown(chinDown, chin));
    const grown = dist(shown(both, top), shown(both, chin));
    // Cabeção makes a head 1.7 times as big: the longer face, chin and all.
    expect(grown / longer).toBeGreaterThan(1.62);
    expect(grown / longer).toBeLessThan(1.78);
  });
});

describe('caretas prontas', () => {
  it('each sets effects the registry has, and none folds, on a straight and on a tilted face', () => {
    expect(FUN_COMBOS.length).toBeGreaterThanOrEqual(3);
    for (const combo of FUN_COMBOS) {
      for (const id of Object.keys(combo.values)) expect(funEffectById(id), `${combo.id} ${id}`).toBeDefined();
      for (const f of [FRONT, TILTED]) {
        const field = funFieldFrom(source(combo.values, f));
        expect(field, combo.id).not.toBeNull();
        expect(leastStretch(field!.offset, 0.08, 0.92, 0.005), combo.id).toBeGreaterThan(0.05);
      }
    }
  });

  it('give every other effect zero, and are known again from their numbers', () => {
    const baby = FUN_COMBOS.find((c) => c.id === 'bebe')!;
    const values = comboValues(baby);
    expect(Object.keys(values).sort()).toEqual(FUN_EFFECTS.map((e) => e.id).sort());
    expect(values.cabecao).toBe(0);
    expect(comboOf(values)?.id).toBe('bebe');
    expect(comboOf({ ...values, olhao: 61 })).toBeNull();
    expect(comboOf({})).toBeNull();
  });
});
