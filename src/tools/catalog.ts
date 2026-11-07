/** Static list of tools shown in the UI. Shaders and panels load on demand through `loaders`. */

import type { LayerId } from '../core/doc';
import type { ToolModule } from './types';

export type ToolKind = 'mask' | 'heal' | 'liquify' | 'adjust' | 'filters' | 'presets' | 'blur' | 'crop';
export type GroupId = 'skin' | 'eyes' | 'makeup' | 'shape' | 'looks' | 'light' | 'frame';

export interface ToolMeta {
  id: string;
  label: string;
  group: GroupId;
  kind: ToolKind;
  layer?: LayerId;
  hint: string;
}

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'skin', label: 'Pele' },
  { id: 'eyes', label: 'Olhos' },
  { id: 'makeup', label: 'Make' },
  { id: 'shape', label: 'Forma' },
  { id: 'looks', label: 'Looks' },
  { id: 'light', label: 'Luz' },
  { id: 'frame', label: 'Quadro' },
];

export const TOOLS: ToolMeta[] = [
  { id: 'heal', label: 'Manchas', group: 'skin', kind: 'heal', hint: 'Toque na mancha. Para áreas maiores, pinte por cima.' },
  { id: 'smooth', label: 'Suavizar', group: 'skin', kind: 'mask', layer: 'smooth', hint: 'Pinte a pele. Os poros ficam.' },
  { id: 'undereye', label: 'Olheiras', group: 'skin', kind: 'mask', layer: 'undereye', hint: 'Pinte logo abaixo dos olhos, sem encostar nos cílios.' },
  { id: 'skintone', label: 'Tom de pele', group: 'skin', kind: 'mask', layer: 'skintone', hint: 'Pinte a área e ajuste matiz, saturação e luz.' },
  { id: 'highlight', label: 'Iluminador', group: 'skin', kind: 'mask', layer: 'highlight', hint: 'Passe nas maçãs, no nariz e no arco do cupido.' },

  { id: 'whiten', label: 'Clarear', group: 'eyes', kind: 'mask', layer: 'whiten', hint: 'Dentes ou branco dos olhos. Vale para qualquer área.' },
  { id: 'redeye', label: 'Olho vermelho', group: 'eyes', kind: 'mask', layer: 'redeye', hint: 'Pinte sobre a pupila vermelha.' },
  { id: 'eyecolor', label: 'Cor dos olhos', group: 'eyes', kind: 'mask', layer: 'eyecolor', hint: 'Pinte só a íris. A textura fica.' },
  { id: 'sparkle', label: 'Brilho no olhar', group: 'eyes', kind: 'mask', layer: 'sparkle', hint: 'Passe de leve na íris.' },

  { id: 'lips', label: 'Batom', group: 'makeup', kind: 'mask', layer: 'lips', hint: 'Pinte os lábios com calma. Dá para apagar as bordas.' },
  { id: 'blush', label: 'Blush', group: 'makeup', kind: 'mask', layer: 'blush', hint: 'Pincel grande e macio nas maçãs do rosto.' },
  { id: 'eyeshadow', label: 'Sombra', group: 'makeup', kind: 'mask', layer: 'eyeshadow', hint: 'Pinte a pálpebra.' },
  { id: 'brow', label: 'Sobrancelha', group: 'makeup', kind: 'mask', layer: 'brow', hint: 'Siga o desenho dos fios.' },
  { id: 'contour', label: 'Contorno', group: 'makeup', kind: 'mask', layer: 'contour', hint: 'Abaixo das maçãs e nas laterais do nariz.' },
  { id: 'hair', label: 'Cabelo', group: 'makeup', kind: 'mask', layer: 'hair', hint: 'Pinte os fios e escolha o efeito.' },
  { id: 'freckles', label: 'Sardas', group: 'makeup', kind: 'mask', layer: 'freckles', hint: 'Passe onde quer as sardas.' },

  { id: 'liquify', label: 'Liquify', group: 'shape', kind: 'liquify', hint: 'Empurre, infle ou contraia. Devagar fica mais natural.' },

  { id: 'presets', label: 'Receitas', group: 'looks', kind: 'presets', hint: 'Combinações prontas de ajustes e ferramentas.' },
  { id: 'filters', label: 'Filtros', group: 'looks', kind: 'filters', hint: 'Toque de novo no filtro para tirar.' },

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
  redeye: () => import('./redeye/index'),
  eyecolor: () => import('./eyecolor/index'),
  sparkle: () => import('./sparkle/index'),
  lips: () => import('./lips/index'),
  blush: () => import('./blush/index'),
  eyeshadow: () => import('./eyeshadow/index'),
  brow: () => import('./brow/index'),
  contour: () => import('./contour/index'),
  hair: () => import('./hair/index'),
  freckles: () => import('./freckles/index'),
};
