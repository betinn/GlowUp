/** The pieces a photo breaks into while it waits for a result. Pure logic. */

export interface Piece {
  /** Place and size, as fractions of the photo on screen. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Its diagonal, from the top left corner: pieces of one diagonal move together, as a wave. */
  wave: number;
  /** Where it slides to when its turn comes, in fractions of its own size, and how far it turns, in degrees. */
  dx: number;
  dy: number;
  turn: number;
}

/** Pieces across the short side of the photo. */
const SHORT = 4;
/** A very long photo stops here, so no piece becomes a sliver and no phone gets too many layers. */
const LONG_MAX = 7;

/** A number from 0 to 1 that depends only on the position, so the same piece always moves the same way. */
const scatter = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** The pieces of a photo of this shape, row by row: close to square, and the same count for the same shape. */
export function pieces(width: number, height: number): Piece[] {
  if (!(width > 0) || !(height > 0)) return [];
  const long = Math.min(LONG_MAX, Math.max(SHORT, Math.round((SHORT * Math.max(width, height)) / Math.min(width, height))));
  const cols = width <= height ? SHORT : long;
  const rows = width <= height ? long : SHORT;
  const list: Piece[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = r * cols + c;
      list.push({
        x: c / cols,
        y: r / rows,
        w: 1 / cols,
        h: 1 / rows,
        wave: c + r,
        dx: (scatter(n) - 0.5) * 0.3,
        dy: (scatter(n + 0.5) - 0.5) * 0.3,
        turn: (scatter(n + 0.25) - 0.5) * 12,
      });
    }
  }
  return list;
}

/** The last diagonal of a list of pieces. */
export const lastWave = (list: readonly Piece[]) => list.reduce((most, p) => Math.max(most, p.wave), 0);
