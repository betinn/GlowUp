import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addFace, byPosition, CHIN, FACE_OVAL, keepScanning, makeFace, SCAN_LEVELS, tileGrid, type Face } from '../../src/core/face/scan';
import type { Point } from '../../src/core/face/mask';

const square = (x: number, y: number, s: number): Point[] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

describe('tileGrid', () => {
  it('starts with the whole photo in one tile', () => {
    expect(tileGrid(4000, 3000, SCAN_LEVELS[0])).toEqual([{ x: 0, y: 0, w: 4000, h: 3000 }]);
  });

  it('halves the tile at each level', () => {
    for (let i = 1; i < SCAN_LEVELS.length; i++) expect(SCAN_LEVELS[i].side).toBeCloseTo(SCAN_LEVELS[i - 1].side / 2, 5);
  });

  it('keeps every tile inside the photo', () => {
    for (const level of SCAN_LEVELS) {
      for (const t of tileGrid(3000, 2171, level)) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.x + t.w).toBeLessThanOrEqual(3000);
        expect(t.y + t.h).toBeLessThanOrEqual(2171);
      }
    }
  });

  it('covers the whole photo at every level', () => {
    for (const level of SCAN_LEVELS) {
      const tiles = tileGrid(1000, 700, level);
      for (const [x, y] of [
        [0, 0],
        [999, 0],
        [0, 699],
        [999, 699],
        [500, 350],
      ]) {
        expect(tiles.some((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h)).toBe(true);
      }
    }
  });

  it('holds any face up to half a tile whole in some tile', () => {
    const level = SCAN_LEVELS[2];
    const tiles = tileGrid(4096, 2722, level);
    const face = Math.floor(tiles[0].w / 2);
    for (let x = 0; x + face <= 4096; x += 97) {
      for (let y = 0; y + face <= 2722; y += 89) {
        const whole = tiles.some((t) => x >= t.x && x + face <= t.x + t.w && y >= t.y && y + face <= t.y + t.h);
        expect(whole).toBe(true);
      }
    }
  });

  it('stays affordable on a large photo', () => {
    const total = SCAN_LEVELS.reduce((n, level) => n + tileGrid(8000, 6000, level).length, 0);
    expect(total).toBeLessThan(260);
  });
});

describe('addFace', () => {
  it('counts one face seen from two tiles once', () => {
    const faces: Face[] = [];
    expect(addFace(faces, makeFace(square(0.1, 0.1, 0.1)))).toBe(true);
    expect(addFace(faces, makeFace(square(0.11, 0.1, 0.1)))).toBe(false);
    expect(faces.length).toBe(1);
  });

  it('keeps the larger view of a face cut by a tile', () => {
    const faces: Face[] = [makeFace(square(0.1, 0.1, 0.08))];
    addFace(faces, makeFace(square(0.1, 0.1, 0.1)));
    expect(faces[0].box.w).toBeCloseTo(0.1, 5);
  });

  it('keeps neighbors apart', () => {
    const faces: Face[] = [];
    addFace(faces, makeFace(square(0.1, 0.1, 0.1)));
    addFace(faces, makeFace(square(0.21, 0.1, 0.1)));
    expect(faces.length).toBe(2);
  });
});

describe('keepScanning', () => {
  it('goes on while nothing was found', () => {
    expect(keepScanning(0, 0)).toBe(true);
  });

  it('goes on while a level brings new faces', () => {
    expect(keepScanning(13, 13)).toBe(true);
  });

  it('stops when a level adds nothing', () => {
    expect(keepScanning(1, 0)).toBe(false);
  });
});

describe('byPosition', () => {
  it('sorts from left to right', () => {
    const list = [makeFace(square(0.7, 0.1, 0.1)), makeFace(square(0.1, 0.5, 0.1))].sort(byPosition);
    expect(list[0].box.x).toBeCloseTo(0.1, 5);
  });
});

describe('MediaPipe contract', () => {
  it('walks the same silhouette as the library', async () => {
    const { FaceLandmarker } = await import('@mediapipe/tasks-vision');
    const links = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
    expect(links.length).toBe(FACE_OVAL.length);
    const next = new Map(links.map((c) => [c.start, c.end]));
    FACE_OVAL.forEach((index, i) => expect(next.get(index)).toBe(FACE_OVAL[(i + 1) % FACE_OVAL.length]));
    expect(FACE_OVAL[CHIN]).toBe(152);
    expect(FACE_OVAL[0]).toBe(10);
  });

  it('knows the real size of the files, for an honest percentage', () => {
    const source = readFileSync('src/core/face/detector.ts', 'utf8');
    const value = (name: string) => Number(new RegExp(`${name} = ([\\d_]+)`).exec(source)![1].replaceAll('_', ''));
    expect(value('WASM_BYTES')).toBe(statSync('node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm').size);
    expect(value('MODEL_BYTES')).toBe(statSync('src/core/face/face_landmarker.task').size);
  });
});
