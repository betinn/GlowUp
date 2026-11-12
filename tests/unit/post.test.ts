import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  autoPages,
  cellsOf,
  collageTemplates,
  createPost,
  MAX_ZOOM,
  moved,
  newPhoto,
  pageBoxes,
  pageCount,
  pageOfPhoto,
  pageSize,
  panned,
  photoIn,
  place,
  postProblem,
  ratioById,
  RATIOS,
  stripTemplates,
  zoomed,
  type PostDoc,
} from '../../src/core/post/layout';
import { crc32, zip } from '../../src/core/post/zip';

const photos = (n: number, w = 3000, h = 4000) => Array.from({ length: n }, (_, i) => newPhoto(`p${i}`, w, h));
const post = (n: number, patch: Partial<PostDoc> = {}): PostDoc => ({ ...createPost(photos(n)), ...patch });
const area = (rects: { w: number; h: number }[]) => rects.reduce((sum, r) => sum + r.w * r.h, 0);

/** True when two rectangles share more than an edge. */
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

describe('the shapes of a slide', () => {
  it('each has its own id, and an unknown id falls back to the first', () => {
    expect(new Set(RATIOS.map((r) => r.id)).size).toBe(RATIOS.length);
    expect(ratioById('nope')).toBe(RATIOS[0]);
    expect(ratioById('1:1').w).toBe(1);
  });

  it('a slide has even sides in the shape asked for', () => {
    expect(pageSize(ratioById('4:5'), 1080)).toEqual({ w: 1080, h: 1350 });
    expect(pageSize(ratioById('9:16'), 1080)).toEqual({ w: 1080, h: 1920 });
    const odd = pageSize(ratioById('16:9'), 1081);
    expect(odd.w % 2).toBe(0);
    expect(odd.h % 2).toBe(0);
  });
});

describe('the collage', () => {
  it('has a place for every photo, from 1 to 10, on every shape, that covers the slide with no overlap', () => {
    for (const ratio of RATIOS) {
      for (let n = 1; n <= 10; n++) {
        const list = collageTemplates(n, ratio);
        expect(list.length, `${n} photos on ${ratio.id}`).toBeGreaterThan(0);
        expect(new Set(list.map((t) => t.id)).size).toBe(list.length);
        for (const t of list) {
          expect(t.rects).toHaveLength(n);
          expect(area(t.rects)).toBeCloseTo(1, 6);
          for (const [i, a] of t.rects.entries()) for (const b of t.rects.slice(i + 1)) expect(overlap(a, b)).toBe(false);
          for (const r of t.rects) {
            expect(r.x).toBeGreaterThanOrEqual(-1e-9);
            expect(r.y).toBeGreaterThanOrEqual(-1e-9);
            expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
            expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });

  it('leaves out an arrangement that would make a sliver of a cell', () => {
    const tall = ratioById('9:16');
    for (const t of collageTemplates(4, tall)) {
      for (const r of t.rects) {
        const shape = (r.w * (tall.w / tall.h)) / r.h;
        expect(shape).toBeGreaterThan(1 / 3.3);
        expect(shape).toBeLessThan(3.3);
      }
    }
    // Four in a row on a story would be four slivers, and four stacked is fine.
    expect(collageTemplates(4, tall).map((t) => t.id)).not.toContain('r4');
  });

  it('a photo alone in its row is the largest', () => {
    const [big, ...rest] = collageTemplates(3, ratioById('1:1')).find((t) => t.id === 'r12')!.rects;
    for (const r of rest) expect(big.w * big.h).toBeGreaterThan(r.w * r.h);
  });

  it('is one slide, and an arrangement that no longer suits the photos gives way to the first', () => {
    const doc = post(5, { kind: 'collage', collage: 'r12' });
    expect(pageCount(doc)).toBe(1);
    expect(cellsOf(doc)).toHaveLength(5);
    expect(cellsOf(doc)).toEqual(cellsOf({ ...doc, collage: '' }));
  });
});

describe('the strip', () => {
  it('covers every slide with no overlap, in every arrangement', () => {
    for (let n = 1; n <= 10; n++) {
      for (const t of stripTemplates(n)) {
        expect(t.rects).toHaveLength(n);
        expect(area(t.rects)).toBeCloseTo(1, 6);
        for (const [i, a] of t.rects.entries()) for (const b of t.rects.slice(i + 1)) expect(overlap(a, b)).toBe(false);
      }
    }
  });

  it('every cut between two slides falls inside a photo, except with equal widths', () => {
    for (let n = 2; n <= 10; n++) {
      for (const t of stripTemplates(n).filter((s) => s.id !== 'equal')) {
        const doc = post(n, { kind: 'strip', strip: t.id });
        const cells = cellsOf(doc);
        for (let cut = 1; cut < pageCount(doc); cut++) {
          const crossed = cells.some((c) => c.x < cut - 1e-6 && c.x + c.w > cut + 1e-6);
          expect(crossed, `${t.id} with ${n} photos, cut ${cut}`).toBe(true);
        }
      }
    }
  });

  it('one photo is cut into as many slides as its shape fills, and never fewer than two', () => {
    const wide = { ...createPost([newPhoto('a', 6000, 2000)]), kind: 'strip' as const };
    expect(autoPages(wide)).toBe(4);
    expect(pageCount(wide)).toBe(4);
    expect(pageCount({ ...createPost([newPhoto('a', 3000, 4000)]), kind: 'strip' })).toBe(2);
    expect(pageCount({ ...wide, pages: 3 })).toBe(3);
    expect(pageCount({ ...wide, pages: 99 })).toBe(10);
  });

  it('a cell that crosses a cut shows on both slides, and the halves meet', () => {
    const doc = post(1, { kind: 'strip', pages: 2, gap: 0 });
    const left = pageBoxes(doc, 0, 1000, 1250);
    const right = pageBoxes(doc, 1, 1000, 1250);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(left[0]).toMatchObject({ x: 0, w: 2000 });
    expect(right[0]).toMatchObject({ x: -1000, w: 2000 });
    expect(pageOfPhoto(doc, 0)).toBe(1);
  });
});

describe('the carousel', () => {
  it('is one photo a slide, in order, with no frame', () => {
    const doc = post(3, { gap: 100, radius: 100 });
    expect(pageCount(doc)).toBe(3);
    expect(cellsOf(doc).map((c) => c.x)).toEqual([0, 1, 2]);
    expect(pageBoxes(doc, 1, 1080, 1350)).toEqual([{ photo: 1, x: 0, y: 0, w: 1080, h: 1350, radius: 0 }]);
    expect(pageOfPhoto(doc, 2)).toBe(2);
  });
});

describe('the frame', () => {
  it('leaves the same space between two photos as between a photo and the edge', () => {
    const doc = post(2, { kind: 'collage', collage: 'r2', gap: 100, radius: 100 });
    const [a, b] = pageBoxes(doc, 0, 1000, 1000);
    const gap = a.x;
    expect(gap).toBeCloseTo(50, 6);
    expect(b.x - (a.x + a.w)).toBeCloseTo(gap, 6);
    expect(1000 - (b.x + b.w)).toBeCloseTo(gap, 6);
    expect(a.y).toBeCloseTo(gap, 6);
    expect(1000 - (a.y + a.h)).toBeCloseTo(gap, 6);
    expect(a.radius).toBeCloseTo(80, 6);
  });
});

describe('a photo in its place', () => {
  const photo = newPhoto('a', 4000, 2000);

  it('fills the place, centered, with no gap', () => {
    const box = place(photo, 500, 500);
    expect(box).toEqual({ x: -250, y: 0, w: 1000, h: 500 });
  });

  it('shows whole when asked, centered, with room around', () => {
    expect(place({ ...photo, whole: true }, 500, 500)).toEqual({ x: 0, y: 125, w: 500, h: 250 });
  });

  it('drags inside its place and stops at its edges, and the next drag starts from there', () => {
    const dragged = panned(photo, 500, 500, -1000, 40);
    expect(place(dragged, 500, 500).x).toBeCloseTo(-500, 6);
    expect(place(dragged, 500, 500).y).toBeCloseTo(0, 6);
    // Held at the edge: a drag back moves at once, with no dead travel.
    expect(place(panned(dragged, 500, 500, 10, 0), 500, 500).x).toBeCloseTo(-490, 6);
  });

  it('comes closer around a point, which stays where it was, and never past the limits', () => {
    const near = zoomed(photo, 500, 500, 2, 100, 400);
    const before = place(photo, 500, 500);
    const after = place(near, 500, 500);
    expect(near.zoom).toBe(2);
    // The point of the photo under (100, 400) is the same before and after.
    expect((100 - after.x) / after.w).toBeCloseTo((100 - before.x) / before.w, 6);
    expect((400 - after.y) / after.h).toBeCloseTo((400 - before.y) / before.h, 6);
    expect(zoomed(photo, 500, 500, 100).zoom).toBe(MAX_ZOOM);
    const back = zoomed(near, 500, 500, 0.01);
    expect(back.zoom).toBe(1);
    expect(place(back, 500, 500).x).toBeLessThanOrEqual(0);
    expect(place(back, 500, 500).x).toBeGreaterThanOrEqual(-500);
  });

  it('shows whole only on a slide of a carousel: in a collage or a strip it fills its place', () => {
    const doc = post(2);
    doc.photos[0].whole = true;
    expect(photoIn(doc, 0).whole).toBe(true);
    expect(photoIn({ ...doc, kind: 'collage' }, 0).whole).toBe(false);
    expect(photoIn({ ...doc, kind: 'strip' }, 0).whole).toBe(false);
    // The choice is kept for when the person goes back to the carousel.
    expect(doc.photos[0].whole).toBe(true);
  });

  it('a whole photo does not drag or zoom', () => {
    const whole = { ...photo, whole: true };
    expect(panned(whole, 500, 500, 50, 50)).toBe(whole);
    expect(zoomed(whole, 500, 500, 2)).toBe(whole);
  });
});

describe('the order', () => {
  it('moves one photo and keeps the others in line', () => {
    expect(moved(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moved(['a', 'b'], 1, 9)).toEqual(['a', 'b']);
    expect(moved(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});

describe('a saved post', () => {
  it('opens when it makes sense, and says why when it does not', () => {
    expect(postProblem(post(3))).toBeNull();
    expect(postProblem(null)).toBe('no document');
    expect(postProblem({ ...post(3), version: 2 })).toBe('version');
    expect(postProblem({ ...post(3), kind: 'video' })).toBe('kind');
    expect(postProblem({ ...post(3), photos: [] })).toBe('photos');
    expect(postProblem({ ...post(3), photos: [{ id: 'a', w: 0, h: 10, x: 0, y: 0, zoom: 1 }] })).toBe('photos');
    expect(postProblem({ ...post(11) })).toBe('photos');
    expect(postProblem({ ...post(3), gap: Number.NaN })).toBe('frame');
    expect(postProblem({ ...post(3), background: 'url(x)' })).toBe('background');
    expect(postProblem({ ...post(3), pages: 'three' })).toBe('pages');
  });
});

describe('the zip of the slides', () => {
  const bytes = (parts: Uint8Array[]) => Buffer.concat(parts.map((p) => Buffer.from(p)));

  it('checks a file as every zip reader does', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('holds every file whole, in order, with its name', () => {
    const files = [
      { name: 'glowup-01.jpg', data: new Uint8Array([1, 2, 3, 4, 5]) },
      { name: 'glowup-02 ação.jpg', data: new Uint8Array(1000).fill(7) },
    ];
    const out = bytes(zip(files, new Date(2026, 10, 12, 20, 30, 10)));
    // The end record: two files, and where the list of them starts.
    const end = out.length - 22;
    expect(out.readUInt32LE(end)).toBe(0x06054b50);
    expect(out.readUInt16LE(end + 10)).toBe(2);
    let at = 0;
    for (const file of files) {
      expect(out.readUInt32LE(at)).toBe(0x04034b50);
      // Stored, not compressed, and the name is UTF-8.
      expect(out.readUInt16LE(at + 8)).toBe(0);
      expect(out.readUInt16LE(at + 6) & 0x0800).toBe(0x0800);
      const size = out.readUInt32LE(at + 18);
      const nameLength = out.readUInt16LE(at + 26);
      expect(out.subarray(at + 30, at + 30 + nameLength).toString('utf8')).toBe(file.name);
      const data = out.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
      expect([...data]).toEqual([...file.data]);
      expect(out.readUInt32LE(at + 14)).toBe(crc32(file.data));
      at += 30 + nameLength + size;
    }
    // The list of files starts right after the last file, as the end record says.
    expect(out.readUInt32LE(end + 16)).toBe(at);
    expect(out.readUInt32LE(at)).toBe(0x02014b50);
    // The date of the files: 12 November 2026, 20:30:10.
    expect(out.readUInt16LE(12)).toBe(((2026 - 1980) << 9) | (11 << 5) | 12);
    expect(out.readUInt16LE(10)).toBe((20 << 11) | (30 << 5) | 5);
    // Node has no zip reader, and a stored file needs none: deflate is not involved.
    expect(() => inflateRawSync(Buffer.from([3, 0]))).not.toThrow();
  });
});
