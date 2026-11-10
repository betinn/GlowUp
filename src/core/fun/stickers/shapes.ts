/**
 * Small shapes the art of several stickers is drawn with, as SVG path data. The art is written in this folder,
 * for the project, and these only save typing the same curve twice.
 */

const n = (v: number) => (Math.round(v * 10) / 10).toString();

/** A closed path through points. */
const closed = (points: readonly (readonly [number, number])[]) => `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;

/** A heart `w` wide, its box centred on `cx, cy`, turned by `turn` degrees. */
export function heart(cx: number, cy: number, w: number, turn = 0): string {
  // The classic curve: x = 16 sin^3 t, y = 13 cos t - 5 cos 2t - 2 cos 3t - cos 4t, about 32 wide and 29 high.
  const s = w / 32;
  const a = (turn * Math.PI) / 180;
  const points: [number, number][] = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3 * s;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.5) * s;
    points.push([cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
  }
  return closed(points);
}

/** A star with `tips` points, `r` from its middle to a tip, the inner corners at `inner` of that. */
export function star(cx: number, cy: number, r: number, tips = 5, inner = 0.46, turn = 0): string {
  const points: [number, number][] = [];
  for (let i = 0; i < tips * 2; i++) {
    const a = ((turn - 90) * Math.PI) / 180 + (i * Math.PI) / tips;
    const k = i % 2 ? r * inner : r;
    points.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k]);
  }
  return closed(points);
}

/** A sparkle: four tips with sides curved in, `r` from its middle to a tip, the side tips at `side` of that. */
export function sparkle(cx: number, cy: number, r: number, side = 0.62): string {
  const h = r * side;
  return `M${n(cx)} ${n(cy - r)}Q${n(cx)} ${n(cy)} ${n(cx + h)} ${n(cy)}Q${n(cx)} ${n(cy)} ${n(cx)} ${n(cy + r)}Q${n(cx)} ${n(cy)} ${n(cx - h)} ${n(cy)}Q${n(cx)} ${n(cy)} ${n(cx)} ${n(cy - r)}Z`;
}

/** The point at `deg` degrees (0 to the right, clockwise on the screen) on an ellipse round `cx, cy`. */
export function onRing(cx: number, cy: number, rx: number, ry: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
}

/** `art` as drawn, and again mirrored across the middle of a box `w` wide: for art with two equal sides. */
export const twice = (art: string, w: number) => `${art}<g transform="matrix(-1 0 0 1 ${w} 0)">${art}</g>`;

/** A few numbers that look scattered and come out the same every time, from 0 to 1. */
export function scatter(count: number, seed: number): number[] {
  let s = seed >>> 0;
  return Array.from({ length: count }, () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  });
}

/** The box of the stickers that go around the head, and the ring their little things sit on. */
export const RING = { w: 400, h: 330, cx: 200, cy: 235, rx: 170, ry: 185 } as const;

/**
 * Spots on the ring round the head, from low on the left over the top to low on the right: where each little
 * thing goes, how big it is, and a small turn, so they look tossed rather than lined up.
 */
export function ringSpots(): { x: number; y: number; size: number; turn: number }[] {
  const degs = [165, 186, 206, 226, 246, 270, 294, 314, 334, 354, 375];
  const sizes = [0.7, 1, 0.75, 1.1, 0.8, 1.2, 0.8, 1.1, 0.75, 1, 0.7];
  const turns = [-20, 12, -8, 16, -14, 0, 14, -16, 8, -12, 20];
  return degs.map((deg, i) => {
    const wobble = i % 2 ? 1.04 : 0.95;
    const [x, y] = onRing(RING.cx, RING.cy, RING.rx * wobble, RING.ry * wobble, deg);
    return { x, y, size: sizes[i], turn: turns[i] };
  });
}
