/** The automatic mode of Desfoque: the focus goes to the face. Without one nothing changes, and the panel says so. */

import { DEFAULT_BLUR } from '../core/doc';
import type { AutoAction } from './auto';

/** Softer than the default of the panel: the background goes, and the arms and the clothes still read. */
const AUTO_STRENGTH = 35;

export const blurAction: AutoAction = {
  words: {
    finding: 'Procurando o rosto',
    missing: 'Não achei rosto nesta foto. O foco fica no centro: escolha o tipo e arraste o círculo.',
    place: 'no rosto',
    hint: 'No Automático o foco fica no rosto. Para mover o círculo, use Manual.',
    applied: 'Foco no rosto que achei. Para tirar, toque de novo na ferramenta.',
  },
  faces: 'required',

  async apply(e, { faces }) {
    const { faceFocus } = await import('../core/face/facefocus');
    const { crop, width, height, blur } = e.doc;
    const focus = faceFocus(faces, crop, width, height);
    if (!focus) return;
    e.applyPatch('Automático', (doc) => {
      doc.blur = { ...blur, ...focus, mode: 'radial', strength: blur.mode === 'off' ? AUTO_STRENGTH : blur.strength };
    });
  },

  hasWork: (e) => e.doc.blur.mode !== 'off',

  async clear(e) {
    e.applyPatch('Limpar', (doc) => {
      doc.blur = { ...DEFAULT_BLUR };
    });
  },
};
