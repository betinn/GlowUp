/**
 * Works out bands of the field of the face sliders, or of Brincar, away from the page, so a slider never waits on its field.
 * It reads the document and the faces and gives back numbers. It keeps the field of the last job it was asked
 * about, so the bands of one job build it once.
 */

import { funFieldFrom } from '../fun/field';
import { fieldFrom, fillRough, fillRows, gridArea, isFun, type AnySource, type FieldBand, type GridArea } from './fieldwork';
import type { ShapeField } from './shape';

export type FieldAsk =
  /** The whole area, read at every `step` cells. */
  | { id: number; job: number; kind: 'rough'; source: AnySource; w: number; h: number; step: number }
  /** Rows `y0` to `y1` of the area, every cell read. */
  | { id: number; job: number; kind: 'band'; source: AnySource; w: number; h: number; y0: number; y1: number };

export type FieldAnswer =
  | { id: number; kind: 'rough'; area: GridArea | null; band: FieldBand | null }
  | { id: number; kind: 'band'; area: GridArea | null; band: FieldBand | null }
  | { id: number; kind: 'failed'; message: string };

let kept: { job: number; field: ShapeField | null } | null = null;

function fieldOf(job: number, source: AnySource): ShapeField | null {
  if (kept?.job !== job) kept = { job, field: isFun(source) ? funFieldFrom(source) : fieldFrom(source) };
  return kept.field;
}

const transfers = (band: FieldBand | null): Transferable[] => (band ? [band.whole, band.over, band.alone].filter((a): a is Float32Array => !!a).map((a) => a.buffer) : []);

self.onmessage = (event: MessageEvent<FieldAsk>) => {
  const ask = event.data;
  const post = (answer: FieldAnswer, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(answer, transfer);
  try {
    const field = fieldOf(ask.job, ask.source);
    if (!field) {
      post({ id: ask.id, kind: ask.kind, area: null, band: null });
      return;
    }
    const area = gridArea(field, ask.w, ask.h);
    let band: FieldBand;
    if (ask.kind === 'rough') {
      const g = fillRough(field, ask.w, ask.h, ask.step);
      band = { y0: area.y0, y1: area.y1, whole: g.whole, over: g.over, alone: g.alone };
    } else {
      band = fillRows(field, area, ask.w, ask.h, ask.y0, ask.y1);
    }
    post({ id: ask.id, kind: ask.kind, area, band }, transfers(band));
  } catch (err) {
    post({ id: ask.id, kind: 'failed', message: err instanceof Error ? err.message : String(err) });
  }
};
