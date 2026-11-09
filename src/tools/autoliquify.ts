/**
 * The automatic mode of Liquify: a subtle shaping of the faces in the photo, one step of the undo. The
 * person can brush on top of it in Manual. Going back to Automático starts over from the photo, as the
 * tools with a mask do, and the undo brings the strokes back.
 */

import type { Engine } from '../core/engine';
import type { AutoAction } from './auto';
import { ensureField } from './activate';

/** The slider of the panel, on 0..100. Never zero: a field with nothing in it has nothing for the preview to scale. */
export const SHAPE_MIN = 10;
export const SHAPE_DEFAULT = 50;

const FIELD_ONLY = { layers: [], field: true };

/** The strength under the slider, while it is held. */
let held: { base: Float32Array; scaled: Float32Array; from: number; to: number } | null = null;
/** The strength the next `apply` uses. */
let wanted: number | null = null;

/** The strength the panel shows. */
export const shapeAmount = (e: Engine): number => held?.to ?? wanted ?? e.doc.shapeAmount ?? SHAPE_DEFAULT;

/**
 * Follows the slider while it is held. A shaping alone on the field scales in a straight line, so this
 * costs one texture upload and no new undo step.
 */
export function previewShape(e: Engine, amount: number): void {
  const { field } = e;
  if (!field) return;
  const base = held?.base ?? field.serialize().slice();
  held = { base, scaled: held?.scaled ?? new Float32Array(base.length), from: held?.from ?? shapeAmount(e), to: amount };
  const k = amount / held.from;
  for (let i = 0; i < base.length; i++) held.scaled[i] = base[i] * k;
  field.restore(held.scaled);
  e.ctx?.invalidate('global');
  e.requestRender();
}

/** The slider let go. Returns true when the person should see the shaping applied again at the new strength. */
export function releaseShape(e: Engine): boolean {
  if (!held) return false;
  const { base, from, to } = held;
  held = null;
  e.field?.restore(base);
  e.ctx?.invalidate('global');
  e.requestRender();
  if (to === from) return false;
  wanted = to;
  return true;
}

export const liquifyAction: AutoAction = {
  words: {
    finding: 'Procurando o rosto',
    missing: 'Não achei rosto nesta foto. O pincel está livre.',
    place: 'no rosto',
    hint: 'No Automático o rosto ganha um ajuste leve, no maxilar e nos olhos. Para mexer à mão, use Manual.',
  },
  faces: 'required',

  async apply(e, { faces, source }) {
    const amount = wanted ?? e.doc.shapeAmount ?? SHAPE_DEFAULT;
    wanted = null;
    await ensureField(e);
    const { shapeField } = await import('../core/face/shape');
    const script = shapeField(faces, source.w, source.h, amount / 100);
    await e.history.group('Automático', async () => {
      await e.resetParts('Automático', FIELD_ONLY);
      if (!e.applyFieldScript(script, 'Automático')) return;
      e.applyPatch('Automático', (doc) => {
        doc.shapeAmount = amount;
      });
    });
  },

  hasWork: (e) => e.doc.hasField,

  async clear(e) {
    await e.resetParts('Limpar', FIELD_ONLY);
  },
};
