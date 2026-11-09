/** The automatic mode of Ajustes: the tone comes from the photo and lands on the normal sliders. */

import { DEFAULT_ADJUST } from '../core/doc';
import type { Engine } from '../core/engine';
import type { Face } from '../core/face/scan';
import type { ToneFaces } from '../core/tone';
import type { SourceImage } from '../core/source';
import { toast } from '../ui/state.svelte';
import type { AutoAction } from './auto';

/** The photo is read at this size. Enough to meter, and fast on a phone. */
const SIDE = 512;
/** The circle metered on a face, as a share of its height: cheeks and nose, little of the eyes. */
const SKIN_SPOT = 0.26;
/** The circle around a whole head, as a share of the larger side of the face. */
const HEAD_SPOT = 0.72;

function faceSpots(faces: readonly Face[], w: number, h: number): ToneFaces {
  const boxes = faces.map(({ box }) => ({ x: box.x * w, y: box.y * h, w: box.w * w, h: box.h * h }));
  return {
    // A little below the middle of the outline, because it starts at the forehead.
    skin: boxes.map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h * 0.58, r: Math.max(1, Math.min(b.w, b.h) * SKIN_SPOT) })),
    // Hair and ears are around the outline, and they are not part of the light either.
    heads: boxes.map((b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(b.w, b.h) * HEAD_SPOT })),
  };
}

function readPhoto(source: SourceImage) {
  const k = Math.min(1, SIDE / Math.max(source.w, source.h));
  const w = Math.max(1, Math.round(source.w * k));
  const h = Math.max(1, Math.round(source.h * k));
  const { data } = source.draw(0, 0, source.w, source.h, w, h).getContext('2d')!.getImageData(0, 0, w, h);
  return { data, w, h };
}

export const adjustAction: AutoAction = {
  words: {
    finding: 'Medindo a luz da foto',
    missing: '',
    place: 'na foto',
    hint: 'No Automático o tom vem da própria foto. Refine nos controles.',
    applied: 'Tom acertado pela foto, já nos controles. Para tirar, toque de novo na ferramenta.',
  },
  faces: 'optional',

  async apply(e, { faces, source }) {
    const { autoTone } = await import('../core/tone');
    const { data, w, h } = readPhoto(source);
    const tone = autoTone(data, w, h, faceSpots(faces, w, h));
    if (Object.values(tone).every((v) => v === 0)) {
      toast('Esta foto já está com o tom no lugar. Os controles seguem à mão.');
      return;
    }
    e.applyPatch('Automático', (doc) => {
      Object.assign(doc.adjust, tone);
    });
  },

  hasWork: (e) => Object.values(e.doc.adjust).some((v) => v !== 0),

  async clear(e: Engine) {
    e.applyPatch('Limpar', (doc) => {
      doc.adjust = { ...DEFAULT_ADJUST };
    });
  },
};
