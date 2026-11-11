import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LIGHTS, lightById } from '../../src/core/light/lights';
import { adaptedEv, lightUniforms, readsStrands, stampDigits, stampOf } from '../../src/core/light/resolve';
import { buildScene, distanceByte, guidedByColor, packScene, SCENE_SPAN, sceneSize, signedDistance, unpackScene } from '../../src/core/light/scene';
import type { LightRecipe, SceneStats } from '../../src/core/light/types';

const STATS: SceneStats = { face: [0.5, 0.4], faceSize: 0.25, backY: 0.3, skinY: 0.2, personY: 0.15 };
const SIZE = { width: 800, height: 1000 };

/** Every number of a recipe, however deep. */
function numbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) numbers(v, out);
  return out;
}

/** A photo of `w` by `h` with a person in the middle: a bright rectangle on a dark wall. */
function photo(w: number, h: number) {
  const n = w * h;
  const rgba = new Uint8ClampedArray(n * 4);
  const person = new Float32Array(n);
  const skin = new Float32Array(n);
  const hair = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const inside = x >= w * 0.3 && x < w * 0.7 && y >= h * 0.2;
      rgba.set(inside ? [200, 150, 120, 255] : [30, 40, 60, 255], i * 4);
      person[i] = inside ? 0.95 : 0.03;
      skin[i] = inside && y >= h * 0.4 ? 0.9 : 0;
      hair[i] = inside && y < h * 0.4 ? 0.9 : 0;
    }
  }
  return { rgba, seen: { person, skin, hair } };
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
});

describe('receita ajustada à foto', () => {
  it('sem alvo, a exposição é a da receita', () => {
    expect(adaptedEv(-2, undefined, undefined, 0.3)).toBe(-2);
    expect(adaptedEv(-2, 0.05, 0, 0.3)).toBe(-2);
  });

  it('com alvo, um fundo claro escurece mais que um fundo já escuro', () => {
    const bright = adaptedEv(-2, 0.02, 0.8, 0.5);
    const dark = adaptedEv(-2, 0.02, 0.8, 0.03);
    expect(bright).toBeLessThan(dark);
    // With all of the weight on the target, the region ends on it.
    expect(adaptedEv(-2, 0.02, 1, 0.32)).toBeCloseTo(-4, 5);
  });

  it('nunca pede mais que cinco pontos da foto', () => {
    expect(adaptedEv(0, 0.0001, 1, 0.9)).toBe(-5);
    expect(adaptedEv(0, 1, 1, 0.004)).toBe(5);
  });

  it('o que fica ao lado da pessoa guarda a distância do que fica longe', () => {
    const recipe: LightRecipe = { back: { ev: -4, near: -1.5, level: 0.01, adapt: 0.5 } };
    const u = lightUniforms(recipe, STATS, SIZE, 1) as { uBack: number[] };
    expect(u.uBack[1] - u.uBack[0]).toBeCloseTo(2.5, 5);
  });

  it('a intensidade fica entre 0 e 1', () => {
    expect(lightUniforms({}, STATS, SIZE, 2).uMix).toBe(1);
    expect(lightUniforms({}, STATS, SIZE, -1).uMix).toBe(0);
  });

  it('uma receita vazia não muda nada', () => {
    const u = lightUniforms({}, STATS, SIZE, 1) as Record<string, number | number[] | boolean>;
    expect(u.uBack).toEqual([0, 0, 0.08, 0]);
    expect(u.uEv).toEqual([0, 0, 0]);
    expect(u.uBackSat).toBe(1);
    expect(u.uPersonTint).toEqual([1, 1, 1]);
    expect((u.uRim as number[])[0]).toBe(0);
    expect(u.uStampOn).toBe(false);
  });

  it('a lâmpada atrás da pessoa é medida a partir do rosto, em tamanhos de rosto', () => {
    const recipe: LightRecipe = { rim: { strength: 1, width: 0.03, color: [1, 1, 1], lamp: { at: [0, 1], reach: 2 } } };
    const u = lightUniforms(recipe, STATS, SIZE, 1) as { uRimLamp: number[] };
    // The long side is the unit: the face is at 0.4 of the width in x, and one face below 0.4 in y.
    expect(u.uRimLamp[0]).toBeCloseTo(0.4, 5);
    expect(u.uRimLamp[1]).toBeCloseTo(0.4 + 0.25, 5);
    expect(u.uRimLamp[2]).toBeCloseTo(0.5, 5);
  });

  it('só o contraluz que acende fios lê a foto borrada', () => {
    expect(readsStrands({ rim: { strength: 1, width: 0.03, color: [1, 1, 1], hair: 0.5 } })).toBe(true);
    expect(readsStrands({ rim: { strength: 1, width: 0.03, color: [1, 1, 1] } })).toBe(false);
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

describe('cena da foto', () => {
  it('a grade tem o lado maior em 1024 e não cresce além da foto', () => {
    expect(sceneSize(4000, 3000)).toEqual({ w: 1024, h: 768 });
    expect(sceneSize(600, 800)).toEqual({ w: 600, h: 800 });
  });

  it('a distância é positiva dentro, negativa fora, e conta as células até a borda', () => {
    const w = 21;
    const h = 21;
    const inside = new Uint8Array(w * h);
    for (let y = 5; y <= 15; y++) for (let x = 5; x <= 15; x++) inside[y * w + x] = 1;
    const d = signedDistance(inside, w, h);
    expect(d[10 * w + 10]).toBeCloseTo(5.5, 5);
    expect(d[10 * w + 5]).toBeCloseTo(0.5, 5);
    expect(d[10 * w + 4]).toBeCloseTo(-0.5, 5);
    expect(d[10 * w + 0]).toBeCloseTo(-4.5, 5);
    // Past a corner the distance goes along the diagonal.
    expect(d[2 * w + 2]).toBeCloseTo(-(Math.hypot(3, 3) - 0.5), 4);
  });

  it('o byte da distância tem a borda no meio e satura no alcance', () => {
    expect(distanceByte(0)).toBe(128);
    expect(distanceByte(SCENE_SPAN)).toBe(255);
    expect(distanceByte(-SCENE_SPAN * 3)).toBe(0);
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
    expect(scene).not.toBeNull();
    const at = (x: number, y: number, c: number) => scene!.data[(y * w + x) * 4 + c];
    expect(at(40, 60, 0)).toBe(255);
    expect(at(5, 60, 0)).toBe(0);
    expect(at(40, 60, 1)).toBeGreaterThan(200);
    expect(at(40, 30, 2)).toBeGreaterThan(200);
    expect(at(40, 60, 3)).toBeGreaterThan(128);
    expect(at(5, 60, 3)).toBeLessThan(128);
    const { stats } = scene!;
    expect(stats.face[0]).toBeCloseTo(0.5, 5);
    expect(stats.face[1]).toBeCloseTo(0.35, 5);
    expect(stats.faceSize).toBeCloseTo(0.2, 5);
    expect(stats.personY).toBeGreaterThan(stats.backY * 5);
    expect(stats.skinY).toBeGreaterThan(0.2);
  });

  it('sem rosto achado, o rosto fica perto do topo da pessoa', () => {
    const w = 80;
    const h = 100;
    const { rgba, seen } = photo(w, h);
    const scene = buildScene(seen, [], { w, h, rgba })!;
    expect(scene.stats.face[0]).toBeCloseTo(0.5, 1);
    expect(scene.stats.face[1]).toBeGreaterThan(0.2);
    expect(scene.stats.face[1]).toBeLessThan(0.45);
  });

  it('foto sem ninguém não tem cena', () => {
    const w = 40;
    const h = 40;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(90);
    const none = new Float32Array(w * h).fill(0.02);
    expect(buildScene({ person: none, skin: none, hair: none }, [], { w, h, rgba })).toBeNull();
  });

  it('uma mancha que o segmentador chama de pessoa, sem rosto, não conta', () => {
    const w = 50;
    const h = 50;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(90);
    const patch = new Float32Array(w * h).fill(0.02);
    // Seven by seven cells of fifty by fifty: 2% of the photo.
    for (let y = 10; y < 17; y++) for (let x = 10; x < 17; x++) patch[y * w + x] = 0.95;
    const empty = new Float32Array(w * h);
    expect(buildScene({ person: patch, skin: empty, hair: empty }, [], { w, h, rgba })).toBeNull();
    // The same patch with a face on it is somebody small and far away.
    expect(buildScene({ person: patch, skin: empty, hair: empty }, [{ x: 0.2, y: 0.2, w: 0.1, h: 0.1 }], { w, h, rgba })).not.toBeNull();
  });

  it('vai para o projeto salvo e volta igual, e bytes estranhos não viram cena', () => {
    const w = 40;
    const h = 50;
    const { rgba, seen } = photo(w, h);
    const scene = buildScene(seen, [], { w, h, rgba })!;
    const back = unpackScene(packScene(scene));
    expect(back).toEqual(scene);
    expect(unpackScene(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(unpackScene(new Uint8Array(64))).toBeNull();
    const cut = packScene(scene).slice(0, -5);
    expect(unpackScene(cut)).toBeNull();
  });
});

describe('passe de luz', () => {
  const light = readFileSync('src/core/shaders/light.frag', 'utf8');
  const develop = readFileSync('src/core/shaders/develop.frag', 'utf8');
  const samplers = (source: string) => source.match(/^uniform sampler\w+ /gm)?.length ?? 0;

  it('lê só a foto e a cena, e a revelação continua com os mesmos 16 amostradores', () => {
    expect(samplers(light)).toBe(2);
    expect(samplers(develop)).toBe(16);
  });

  it('todo uniforme que a receita manda existe no shader', () => {
    const sent = Object.keys(lightUniforms(LIGHTS[0].recipe, STATS, SIZE, 1));
    for (const name of sent) expect(light).toMatch(new RegExp(`uniform \\w+ ${name}\\b`));
  });
});
