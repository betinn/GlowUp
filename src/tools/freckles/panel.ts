import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { kind: 'natural', color: '#b98a68', density: 45, size: 35, variation: 70, opacity: 55 };

export const controls: Control[] = [
  {
    type: 'segment',
    key: 'kind',
    label: 'Tipo',
    options: [
      { value: 'fine', label: 'Finas' },
      { value: 'natural', label: 'Naturais' },
      { value: 'bold', label: 'Marcantes' },
    ],
  },
  { type: 'color', key: 'color', label: 'Pigmento', palette: ['#b98a68', '#c9a080', '#a87555', '#8f6348', '#d8b090', '#9a7a60'] },
  { type: 'slider', key: 'density', label: 'Quantidade', min: 0, max: 100 },
  { type: 'slider', key: 'size', label: 'Tamanho', min: 0, max: 100 },
  { type: 'slider', key: 'variation', label: 'Variação', min: 0, max: 100 },
  { type: 'slider', key: 'opacity', label: 'Opacidade', min: 0, max: 100 },
];
