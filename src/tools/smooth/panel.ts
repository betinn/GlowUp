import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { mode: 'light', strength: 75, texture: 100 };

export const controls: Control[] = [
  {
    type: 'segment',
    key: 'mode',
    label: 'Modo',
    options: [
      { value: 'light', label: 'Leve' },
      { value: 'strong', label: 'Intenso' },
    ],
  },
  { type: 'slider', key: 'strength', label: 'Intensidade', min: 0, max: 100 },
  { type: 'slider', key: 'texture', label: 'Textura da pele', min: 0, max: 130 },
];
