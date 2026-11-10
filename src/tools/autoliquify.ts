/**
 * The automatic mode of Liquify: a subtle shaping of the faces in the photo, one step of the undo. Its strength
 * is a number in the document and the field is worked out from it, so moving the slider adds no error. The
 * person can brush on top of it in Manual. Going back to Automático starts the strokes over, as the tools with
 * a mask do, and the undo brings them back. The sliders of the face menu are not touched.
 */

import type { Engine } from '../core/engine';
import type { AutoAction } from './auto';
import { ensureField } from './activate';

/** The slider of the panel, on 0..100. */
export const SHAPE_MIN = 10;
export const SHAPE_DEFAULT = 50;

const STROKES = { layers: [], liquify: true };

/** The strength the panel shows. */
export const shapeAmount = (e: Engine): number => e.doc.shapeAmount ?? SHAPE_DEFAULT;

/** Follows the slider while it is held. `e.commit` closes the gesture as one step. */
export const previewShape = (e: Engine, amount: number): void => e.setShapeAmount(amount, true);

export const liquifyAction: AutoAction = {
  words: {
    finding: 'Procurando o rosto',
    missing: 'Não achei rosto nesta foto. O pincel está livre.',
    place: 'no rosto',
    hint: 'No Automático o rosto ganha um ajuste leve, no maxilar e nos olhos. Para mexer à mão, use Manual.',
  },
  faces: 'required',
  person: true,

  async apply(e, { faces }) {
    const amount = e.doc.shapeAmount ?? SHAPE_DEFAULT;
    await ensureField(e);
    e.shapeFaces = faces;
    await e.history.group('Automático', async () => {
      await e.resetParts('Automático', STROKES);
      e.applyPatch('Automático', (doc) => {
        doc.shapeAmount = amount;
      });
      e.syncShape();
    });
  },

  hasWork: (e) => e.doc.shapeAmount !== undefined || (!!e.field && !e.field.brushEmpty()),

  async clear(e) {
    await e.resetParts('Limpar', STROKES);
  },
};
