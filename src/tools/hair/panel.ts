import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { mode: 'color', color: '#7a3d28', amount: 65 };

export const controls: Control[] = [
  {
    type: 'segment',
    key: 'mode',
    label: 'Efeito',
    options: [
      { value: 'color', label: 'Cor' },
      { value: 'darken', label: 'Escurecer' },
      { value: 'depth', label: 'Profundidade' },
    ],
  },
  {
    type: 'color',
    key: 'color',
    label: 'Cor',
    palette: ['#7a3d28', '#3a2418', '#a0622f', '#c49a5a', '#8a2f2f', '#2f2a35', '#5a3a6a', '#3a5a6a'],
  },
  { type: 'slider', key: 'amount', label: 'Intensidade', min: 0, max: 100 },
];
