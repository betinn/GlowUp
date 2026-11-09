/** Static list of tools shown in the UI. Shaders and panels load on demand through `loaders`. */

import type { LayerId } from '../core/doc';
import type { FaceRegion } from '../core/face/regions';
import type { ToolModule } from './types';

export type ToolKind = 'mask' | 'heal' | 'liquify' | 'adjust' | 'filters' | 'blur' | 'crop';
export type GroupId = 'skin' | 'eyes' | 'makeup' | 'hair' | 'shape' | 'filters' | 'light' | 'frame';

export interface ToolMeta {
  id: string;
  label: string;
  group: GroupId;
  kind: ToolKind;
  layer?: LayerId;
  /** Part of the face the brush stays on, when the detector finds it. */
  region?: FaceRegion;
  /** Shape the automatic mode fills the mask with, when it is not the region itself. */
  fill?: FaceRegion;
  /** What it draws has a size on the skin, so it takes the size of the face found in the photo. */
  faceSized?: boolean;
  hint: string;
}

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'skin', label: 'Pele' },
  { id: 'eyes', label: 'Olhos' },
  { id: 'makeup', label: 'Make' },
  { id: 'hair', label: 'Cabelo' },
  { id: 'shape', label: 'Forma' },
  { id: 'filters', label: 'Filtros' },
  { id: 'light', label: 'Luz' },
  { id: 'frame', label: 'Quadro' },
];

export const TOOLS: ToolMeta[] = [
  { id: 'heal', label: 'Manchas', group: 'skin', kind: 'heal', region: 'skin', hint: 'Toque na mancha. Para áreas maiores, pinte por cima.' },
  { id: 'smooth', label: 'Suavizar', group: 'skin', kind: 'mask', layer: 'smooth', region: 'skin', hint: 'Pinte a pele. Os poros ficam.' },
  { id: 'undereye', label: 'Olheiras', group: 'skin', kind: 'mask', layer: 'undereye', region: 'undereye', hint: 'Pinte logo abaixo dos olhos, sem encostar nos cílios.' },
  { id: 'skintone', label: 'Tom de pele', group: 'skin', kind: 'mask', layer: 'skintone', region: 'skin', hint: 'Pinte a área e ajuste matiz, saturação e luz.' },
  { id: 'highlight', label: 'Iluminador', group: 'skin', kind: 'mask', layer: 'highlight', region: 'skin', fill: 'glow', hint: 'Passe nas maçãs, no nariz e no arco do cupido.' },

  { id: 'sclera', label: 'Branco do olho', group: 'eyes', kind: 'mask', layer: 'sclera', region: 'sclera', hint: 'Passe de leve no branco dos olhos, sem encostar na íris.' },
  { id: 'redeye', label: 'Olho vermelho', group: 'eyes', kind: 'mask', layer: 'redeye', region: 'iris', hint: 'Pinte sobre a pupila vermelha.' },
  { id: 'eyecolor', label: 'Cor dos olhos', group: 'eyes', kind: 'mask', layer: 'eyecolor', region: 'iris', hint: 'Pinte só a íris. A textura fica.' },
  { id: 'sparkle', label: 'Brilho no olhar', group: 'eyes', kind: 'mask', layer: 'sparkle', region: 'iris', hint: 'Passe de leve na íris.' },

  { id: 'lips', label: 'Batom', group: 'makeup', kind: 'mask', layer: 'lips', region: 'lips', hint: 'Pinte os lábios com calma. Dá para apagar as bordas.' },
  { id: 'whiten', label: 'Dentes', group: 'makeup', kind: 'mask', layer: 'whiten', region: 'teeth', hint: 'Passe nos dentes. O escuro da boca fica como está.' },
  { id: 'blush', label: 'Blush', group: 'makeup', kind: 'mask', layer: 'blush', region: 'skin', fill: 'cheeks', hint: 'Pincel grande e macio nas maçãs do rosto.' },
  { id: 'eyeshadow', label: 'Sombra', group: 'makeup', kind: 'mask', layer: 'eyeshadow', region: 'lids', fill: 'shadow', hint: 'Pinte a pálpebra, do cílio para cima.' },
  { id: 'brow', label: 'Sobrancelha', group: 'makeup', kind: 'mask', layer: 'brow', region: 'brows', fill: 'browhair', hint: 'Siga o desenho dos fios.' },
  { id: 'contour', label: 'Contorno', group: 'makeup', kind: 'mask', layer: 'contour', region: 'skin', fill: 'sculpt', hint: 'Abaixo das maçãs e nas laterais do rosto e do nariz.' },
  { id: 'freckles', label: 'Sardas', group: 'makeup', kind: 'mask', layer: 'freckles', region: 'skin', fill: 'sprinkle', faceSized: true, hint: 'Passe onde quer as sardas. Passar de novo traz mais.' },

  { id: 'haircolor', label: 'Cor', group: 'hair', kind: 'mask', layer: 'hair', region: 'hair', hint: 'Escolha a cor. O brilho e os fios ficam.' },
  { id: 'hairdark', label: 'Escurecer', group: 'hair', kind: 'mask', layer: 'hairdark', region: 'hair', hint: 'Escurece os fios sem apagar o brilho.' },
  { id: 'hairlight', label: 'Clarear', group: 'hair', kind: 'mask', layer: 'hairlight', region: 'hair', hint: 'Clareia os fios, puxando para o dourado.' },
  { id: 'haircontrast', label: 'Contraste', group: 'hair', kind: 'mask', layer: 'haircontrast', region: 'hair', hint: 'Mais contraste dá volume. Menos deixa macio.' },
  { id: 'hairsharp', label: 'Nitidez', group: 'hair', kind: 'mask', layer: 'hairsharp', region: 'hair', hint: 'Realça os fios um a um.' },

  { id: 'liquify', label: 'Liquify', group: 'shape', kind: 'liquify', hint: 'Empurre, infle ou contraia. Devagar fica mais natural.' },

  { id: 'filters', label: 'Filtros', group: 'filters', kind: 'filters', hint: 'Toque de novo no filtro para tirar.' },

  { id: 'adjust', label: 'Ajustes', group: 'light', kind: 'adjust', hint: 'Dois toques em um controle voltam ao zero.' },
  { id: 'blur', label: 'Desfoque', group: 'light', kind: 'blur', hint: 'Arraste o círculo para escolher o foco.' },

  { id: 'crop', label: 'Recorte', group: 'frame', kind: 'crop', hint: 'Arraste os cantos. A foto pode girar.' },
];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);

export const loaders: Record<LayerId, () => Promise<{ default: ToolModule }>> = {
  smooth: () => import('./smooth/index'),
  undereye: () => import('./undereye/index'),
  skintone: () => import('./skintone/index'),
  highlight: () => import('./highlight/index'),
  whiten: () => import('./whiten/index'),
  sclera: () => import('./sclera/index'),
  redeye: () => import('./redeye/index'),
  eyecolor: () => import('./eyecolor/index'),
  sparkle: () => import('./sparkle/index'),
  lips: () => import('./lips/index'),
  blush: () => import('./blush/index'),
  eyeshadow: () => import('./eyeshadow/index'),
  brow: () => import('./brow/index'),
  contour: () => import('./contour/index'),
  hair: () => import('./hair/index'),
  hairdark: () => import('./hairdark/index'),
  hairlight: () => import('./hairlight/index'),
  haircontrast: () => import('./haircontrast/index'),
  hairsharp: () => import('./hairsharp/index'),
  freckles: () => import('./freckles/index'),
};
