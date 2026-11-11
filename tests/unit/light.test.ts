import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIGHTS, lightById } from '../../src/core/light/lights';
import { DEPTH_NORM, depthSize, MATTE_NORM, matteSize, resample, toPlanes } from '../../src/core/light/models';
import { adaptedEv, lightUniforms, readsStrands, stampDigits, stampOf } from '../../src/core/light/resolve';
import { buildScene, guidedByColor, packScene, sceneSize, unpackScene, type SceneSeen } from '../../src/core/light/scene';
import type { LightRecipe, SceneStats } from '../../src/core/light/types';

const STATS: SceneStats = { face: [0.5, 0.4], faceSize: 0.25, backY: 0.3, skinY: 0.2, personY: 0.15 };
const SIZE = { width: 800, height: 1000 };

/** Every number of a recipe, however deep. */
function numbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) numbers(v, out);
  return out;
}

/**
 * A photo of `w` by `h` with a person in the middle: a bright rectangle, near the camera, on a dark wall far
 * from it. The models saw it on grids half the size. The left half of the skin is in shade.
 */
function photo(w: number, h: number, somebody = true) {
  const n = w * h;
  const rgba = new Uint8ClampedArray(n * 4);
  const skin = new Float32Array(n);
  const hair = new Float32Array(n);
  const inside = (x: number, y: number) => somebody && x >= w * 0.3 && x < w * 0.7 && y >= h * 0.2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const lit = x >= w * 0.5 ? [200, 150, 120, 255] : [90, 66, 52, 255];
      rgba.set(inside(x, y) ? lit : [30, 40, 60, 255], i * 4);
      skin[i] = inside(x, y) && y >= h * 0.4 ? 0.9 : 0;
      hair[i] = inside(x, y) && y < h * 0.4 ? 0.9 : 0;
    }
  }
  const dw = w / 2;
  const dh = h / 2;
  const depth = new Float32Array(dw * dh);
  const matte = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const on = inside(x * 2 + 1, y * 2 + 1);
      // A disparity: the person at 4, the wall four times as far.
      depth[y * dw + x] = on ? 4 : 1;
      matte[y * dw + x] = on ? 1 : 0;
    }
  }
  const seen: SceneSeen = { depth, dw, dh, matte, mw: dw, mh: dh, skin, hair };
  return { rgba, seen };
}

describe('registro das luzes', () => {
  it('tem as dez luzes dos pares, cada uma com nome, nota e números que fazem sentido', () => {
    expect(LIGHTS).toHaveLength(10);
    const ids = LIGHTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const light of LIGHTS) {
      expect(light.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(light.label.length).toBeGreaterThan(2);
      expect(light.note.length).toBeGreaterThan(10);
      expect(light.swatch).toHaveLength(2);
      for (const v of numbers(light.recipe)) expect(Number.isFinite(v)).toBe(true);
      expect(lightById(light.id)).toBe(light);
    }
    expect(lightById('nao-existe')).toBeUndefined();
    expect(lightById(null)).toBeUndefined();
  });

  it('nenhum id que já saiu muda de nome', () => {
    expect(LIGHTS.map((l) => l.id).sort()).toEqual(
      ['analogica', 'contraluz', 'contraluz-dourado', 'entardecer', 'flash-analogico', 'flash-direto', 'luz-de-estudio', 'neon', 'noite-de-festa', 'silhueta'].sort(),
    );
  });

  it('cada luz vira números que o shader lê, sem nada de fora', () => {
    for (const light of LIGHTS) {
      const u = lightUniforms(light.recipe, STATS, SIZE, 1, '31/07/2026');
      for (const v of numbers(u)) expect(Number.isFinite(v)).toBe(true);
      expect(u.uMix).toBe(1);
      expect(u.uStamp).toHaveLength(8);
    }
  });

  it('toda luz diz o brilho que a foto da receita tinha, para seguir outra foto', () => {
    for (const light of LIGHTS) {
      const { far, near } = light.recipe;
      expect(far?.level).toBeGreaterThan(0);
      expect(far?.adapt).toBeGreaterThan(0);
      expect(near?.level).toBeGreaterThan(0);
      expect(near?.adapt).toBeGreaterThan(0);
    }
  });

  it('nenhuma luz tem poeira nem pontos de brilho soltos na foto', () => {
    const light = readFileSync('src/core/shaders/light.frag', 'utf8');
    expect(light).not.toMatch(/uDust|uGlows/);
  });
});

describe('receita ajustada à foto', () => {
  it('sem o brilho da foto da receita, a exposição é a da receita', () => {
    expect(adaptedEv(-2, undefined, undefined, 0.3)).toBe(-2);
    expect(adaptedEv(-2, 0.05, 0, 0.3)).toBe(-2);
  });

  it('na foto da receita nada muda, e um fundo claro escurece mais que um fundo já escuro', () => {
    expect(adaptedEv(-2, 0.1, 0.8, 0.1)).toBeCloseTo(-2, 5);
    const bright = adaptedEv(-2, 0.1, 0.8, 0.5);
    const dark = adaptedEv(-2, 0.1, 0.8, 0.03);
    expect(bright).toBeLessThan(-2);
    expect(dark).toBeGreaterThan(-2);
    // Following all the way, a part two stops brighter than on the photo of the recipe takes two stops less.
    expect(adaptedEv(-2, 0.1, 1, 0.4)).toBeCloseTo(-4, 5);
  });

  it('nunca segue a foto por mais que três pontos', () => {
    expect(adaptedEv(0, 0.0001, 1, 0.9)).toBe(-3);
    expect(adaptedEv(0, 1, 1, 0.004)).toBe(3);
  });

  it('o fundo segue o brilho do fundo, e a pessoa o brilho da pele', () => {
    const recipe: LightRecipe = { far: { ev: -3, level: 0.15, adapt: 1 }, near: { ev: 1, level: 0.1, adapt: 1 } };
    const u = lightUniforms(recipe, STATS, SIZE, 1) as { uEv: number[] };
    expect(u.uEv[0]).toBeCloseTo(-3 + Math.log2(0.15 / STATS.backY), 5);
    expect(u.uEv[1]).toBeCloseTo(1 + Math.log2(0.1 / STATS.skinY), 5);
  });

  it('a intensidade fica entre 0 e 1', () => {
    expect(lightUniforms({}, STATS, SIZE, 2).uMix).toBe(1);
    expect(lightUniforms({}, STATS, SIZE, -1).uMix).toBe(0);
  });

  it('uma receita vazia não muda nada', () => {
    const u = lightUniforms({}, STATS, SIZE, 1) as Record<string, number | number[] | boolean>;
    expect(u.uEv).toEqual([0, 0, 0, 0]);
    expect(u.uPart).toEqual([0, 0, 0, 0]);
    expect(u.uSat).toEqual([1, 1, 1]);
    expect(u.uFarTint).toEqual([1, 1, 1]);
    expect(u.uNearTint).toEqual([1, 1, 1]);
    expect(u.uGlow).toEqual([0, 0, 0, 0]);
    expect(u.uCurve).toEqual([1, 0.18, 0, 1]);
    expect(u.uLift).toEqual([0, 0, 0]);
    expect(u.uGrain).toBe(0);
    expect(u.uStampOn).toBe(false);
  });

  it('a lâmpada atrás da pessoa é medida a partir do rosto, em tamanhos de rosto', () => {
    const recipe: LightRecipe = { lamp: { at: [0, 1], reach: 2, glow: 1 } };
    const u = lightUniforms(recipe, STATS, SIZE, 1) as { uLamp: number[]; uGlow: number[] };
    // The long side is the unit: the face is at 0.4 of the width in x, and one face below 0.4 in y.
    expect(u.uLamp[0]).toBeCloseTo(0.4, 5);
    expect(u.uLamp[1]).toBeCloseTo(0.4 + 0.25, 5);
    expect(u.uLamp[2]).toBeCloseTo(0.5, 5);
    expect(u.uGlow[3]).toBe(1);
  });

  it('um rosto que enche a foto não leva a lâmpada para fora do quadro nem aumenta o clarão', () => {
    const recipe: LightRecipe = { lamp: { at: [-1, 0], reach: 1, glow: 1 } };
    const close = lightUniforms(recipe, { ...STATS, faceSize: 0.6 }, SIZE, 1) as { uLamp: number[] };
    // The measure stops growing at 0.3 of the long side.
    expect(close.uLamp[0]).toBeCloseTo(0.4 - 0.3, 5);
    expect(close.uLamp[2]).toBeCloseTo(0.3, 5);
  });

  it('a borda mole do recorte vai com o fundo: a luz da pessoa só começa acima de 0,6', () => {
    const u = lightUniforms({}, STATS, SIZE, 1) as { uFall: number[] };
    expect(u.uFall).toEqual([0.35, 0.85, 0.6, 1]);
  });

  it('só a lâmpada que acende fios lê a foto borrada', () => {
    expect(readsStrands({ lamp: { at: [0, 0], reach: 1, strands: 0.5 } })).toBe(true);
    expect(readsStrands({ lamp: { at: [0, 0], reach: 1, glow: 1 } })).toBe(false);
    expect(readsStrands({})).toBe(false);
  });
});

describe('carimbo de data', () => {
  it('a data vira oito algarismos', () => {
    expect(stampDigits('31/07/2026')).toEqual([3, 1, 0, 7, 2, 0, 2, 6]);
    expect(stampDigits(undefined)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(stampDigits('1/2')).toEqual([1, 2, 0, 0, 0, 0, 0, 0]);
  });

  it('o dia de hoje sai como dia, mês e ano', () => {
    expect(stampOf(new Date(2026, 10, 9))).toBe('09/11/2026');
  });
});

describe('modelos da cena', () => {
  it('a profundidade lê a foto com o lado maior em 518, em múltiplos de 14', () => {
    expect(depthSize(827, 1351)).toEqual({ w: 322, h: 518 });
    expect(depthSize(4000, 3000)).toEqual({ w: 518, h: 392 });
    expect(depthSize(10, 2000)).toEqual({ w: 14, h: 518 });
  });

  it('o recorte lê a foto com o lado menor em 512, em múltiplos de 32, sem passar de 1024', () => {
    expect(matteSize(827, 1351)).toEqual({ w: 512, h: 832 });
    expect(matteSize(4000, 3000)).toEqual({ w: 672, h: 512 });
    // A very long photo is held by its long side.
    expect(matteSize(500, 2000)).toEqual({ w: 256, h: 1024 });
  });

  it('a foto vira três planos de números, com a média e a escala de cada modelo', () => {
    const rgba = new Uint8Array([255, 0, 128, 255, 0, 255, 128, 255]);
    const matte = toPlanes(rgba, 2, 1, MATTE_NORM);
    expect(Array.from(matte.subarray(0, 4))).toEqual([1, -1, -1, 1]);
    expect(matte[4]).toBeCloseTo(128 / 255 / 0.5 - 1, 6);
    const depth = toPlanes(rgba, 2, 1, DEPTH_NORM);
    expect(depth[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(depth[3]).toBeCloseTo((1 - 0.456) / 0.224, 5);
  });

  it('um plano vai para outra grade lendo entre os vizinhos', () => {
    const src = new Float32Array([0, 1, 2, 3]);
    expect(resample(src, 2, 2, 2, 2)).toBe(src);
    const up = resample(src, 2, 2, 4, 4);
    expect(up[0]).toBe(0);
    expect(up[15]).toBe(3);
    expect(up[5]).toBeCloseTo(0.75, 5);
    for (const v of up) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of up) expect(v).toBeLessThanOrEqual(3);
  });
});

describe('cena da foto', () => {
  it('a grade tem o lado maior em 1024 e não cresce além da foto', () => {
    expect(sceneSize(4000, 3000)).toEqual({ w: 1024, h: 768 });
    expect(sceneSize(600, 800)).toEqual({ w: 600, h: 800 });
  });

  it('a borda mole da máscara vai para a borda de cor da foto', () => {
    const w = 60;
    const h = 20;
    const rgba = new Uint8ClampedArray(w * h * 4);
    const mask = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        // The photo changes at column 30, and the mask ramps from column 20 to 40.
        rgba.set(x < 30 ? [20, 20, 160, 255] : [220, 60, 40, 255], i * 4);
        mask[i] = Math.min(1, Math.max(0, (x - 20) / 20));
      }
    }
    const out = guidedByColor(rgba, mask, w, h, 8, 1e-4);
    const row = 10 * w;
    expect(out[row + 27]).toBeLessThan(0.3);
    expect(out[row + 32]).toBeGreaterThan(0.7);
    expect(out[row + 32] - out[row + 27]).toBeGreaterThan(mask[row + 32] - mask[row + 27]);
  });

  it('acha a pessoa, a pele, o cabelo e mede a luz de cada parte', () => {
    const w = 80;
    const h = 100;
    const { rgba, seen } = photo(w, h);
    const scene = buildScene(seen, [{ x: 0.4, y: 0.25, w: 0.2, h: 0.2 }], { w, h, rgba });
    const at = (x: number, y: number, c: number) => scene.data[(y * w + x) * 4 + c];
    expect(at(40, 60, 0)).toBe(255);
    expect(at(5, 60, 0)).toBe(0);
    expect(at(40, 60, 1)).toBeGreaterThan(200);
    expect(at(40, 30, 2)).toBeGreaterThan(200);
    const { stats } = scene;
    expect(stats.face[0]).toBeCloseTo(0.5, 5);
    expect(stats.face[1]).toBeCloseTo(0.35, 5);
    expect(stats.faceSize).toBeCloseTo(0.2, 5);
    expect(stats.personY).toBeGreaterThan(stats.backY * 5);
    expect(stats.skinY).toBeGreaterThan(0.1);
  });

  it('a profundidade fica em 1 na pessoa, e cada lado da borda guarda a sua', () => {
    const w = 320;
    const h = 400;
    const { rgba, seen } = photo(w, h);
    const scene = buildScene(seen, [{ x: 0.4, y: 0.25, w: 0.2, h: 0.2 }], { w, h, rgba });
    const front = (x: number, y: number) => scene.field[(y * w + x) * 4];
    const behind = (x: number, y: number) => scene.field[(y * w + x) * 4 + 1];
    // Deep in the person and far out on the wall, both sides say the depth of the point itself.
    expect(front(160, 240)).toBeCloseTo(1, 2);
    expect(behind(160, 240)).toBeCloseTo(1, 2);
    expect(front(16, 240)).toBeCloseTo(0.25, 2);
    expect(behind(16, 240)).toBeCloseTo(0.25, 2);
    // At the edge the two sides differ: the person's side is near and the wall's side is far, on both sides of
    // it, though the depth itself is a blend of the two there.
    for (const x of [94, 98]) {
      expect(front(x, 240)).toBeGreaterThan(0.95);
      expect(behind(x, 240)).toBeLessThan(0.3);
    }
  });

  it('o recorte borrado vai de 0 fora a 1 dentro, mais devagar no borrão largo', () => {
    const w = 160;
    const h = 200;
    const { rgba, seen } = photo(w, h);
    const scene = buildScene(seen, [], { w, h, rgba });
    const small = (x: number) => scene.field[(120 * w + x) * 4 + 2];
    const wide = (x: number) => scene.field[(120 * w + x) * 4 + 3];
    expect(small(10)).toBeCloseTo(0, 2);
    expect(wide(10)).toBeCloseTo(0, 2);
    expect(small(80)).toBeCloseTo(1, 2);
    expect(wide(80)).toBeCloseTo(1, 2);
    // Eight cells inside the edge, the small blur is done and the wide one is on its way.
    expect(small(56)).toBeGreaterThan(0.97);
    expect(wide(56)).toBeLessThan(0.9);
    expect(wide(56)).toBeGreaterThan(0.5);
  });

  it('a pele na sombra pede luz, e a pele no claro devolve', () => {
    const w = 80;
    const h = 100;
    const { rgba, seen } = photo(w, h);
    const scene = buildScene(seen, [], { w, h, rgba });
    const shade = (x: number, y: number) => scene.data[(y * w + x) * 4 + 3];
    expect(shade(28, 70)).toBeGreaterThan(140);
    expect(shade(52, 70)).toBeLessThan(120);
    // Far from any skin there is no shade to speak of.
    expect(shade(2, 5)).toBe(128);
  });

  it('sem rosto achado, o rosto fica perto do topo da pessoa', () => {
    const w = 80;
    const h = 100;
    const { rgba, seen } = photo(w, h);
    const scene = buildScene(seen, [], { w, h, rgba });
    expect(scene.stats.face[0]).toBeCloseTo(0.5, 1);
    expect(scene.stats.face[1]).toBeGreaterThan(0.2);
    expect(scene.stats.face[1]).toBeLessThan(0.45);
  });

  it('foto sem ninguém ainda tem cena: a luz cai no que está mais perto', () => {
    const w = 40;
    const h = 40;
    const { rgba, seen } = photo(w, h, false);
    // A floor: nearer at the bottom of the photo.
    for (let y = 0; y < seen.dh; y++) for (let x = 0; x < seen.dw; x++) seen.depth[y * seen.dw + x] = 1 + y / 4;
    const scene = buildScene(seen, [], { w, h, rgba });
    expect(scene.data[(20 * w + 20) * 4]).toBe(0);
    const depth = (y: number) => scene.field[(y * w + 20) * 4];
    expect(depth(38)).toBeGreaterThan(0.95);
    expect(depth(2)).toBeLessThan(0.3);
    expect(scene.stats.skinY).toBeCloseTo(scene.stats.backY, 5);
    expect(scene.stats.faceSize).toBeCloseTo(0.2, 5);
  });

  it('vai para o projeto salvo e volta igual, e bytes estranhos não viram cena', () => {
    const w = 40;
    const h = 50;
    const { rgba, seen } = photo(w, h);
    const scene = buildScene(seen, [], { w, h, rgba });
    const back = unpackScene(packScene(scene))!;
    expect(back.w).toBe(w);
    expect(back.h).toBe(h);
    expect(back.stats).toEqual(scene.stats);
    expect(back.data).toEqual(scene.data);
    expect(back.field).toHaveLength(scene.field.length);
    // The depths come back to sixteen bits, and the glows are made again from the matte, which comes back to eight.
    for (let i = 0; i < scene.field.length; i++) expect(Math.abs(back.field[i] - scene.field[i])).toBeLessThan(i % 4 < 2 ? 1e-3 : 0.01);
    expect(unpackScene(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(unpackScene(new Uint8Array(64))).toBeNull();
    const cut = packScene(scene).slice(0, -5);
    expect(unpackScene(cut)).toBeNull();
  });

  it('a cena de antes da profundidade não abre: a luz espera a foto ser lida de novo', () => {
    const head = new TextEncoder().encode(JSON.stringify({ w: 2, h: 2, stats: STATS }));
    const old = new Uint8Array(4 + head.length + 16);
    new DataView(old.buffer).setUint32(0, head.length);
    old.set(head, 4);
    expect(unpackScene(old)).toBeNull();
  });
});

describe('passe de luz', () => {
  const light = readFileSync('src/core/shaders/light.frag', 'utf8');
  const develop = readFileSync('src/core/shaders/develop.frag', 'utf8');
  const samplers = (source: string) => source.match(/^uniform sampler\w+ /gm)?.length ?? 0;

  it('lê a foto e as duas texturas da cena, e a revelação continua com os mesmos 16 amostradores', () => {
    expect(samplers(light)).toBe(3);
    expect(samplers(develop)).toBe(16);
  });

  it('todo uniforme que a receita manda existe no shader', () => {
    const sent = Object.keys(lightUniforms(LIGHTS[0].recipe, STATS, SIZE, 1));
    for (const name of sent) expect(light).toMatch(new RegExp(`uniform \\w+ ${name}\\b`));
  });
});
