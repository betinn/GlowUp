import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { color: '#b98a68', density: 45, size: 35, variation: 70, opacity: 65 };

export const controls: Control[] = [
  { type: 'color', key: 'color', label: 'Pigmento', palette: ['#b98a68', '#c9a080', '#a87555', '#8f6348', '#d8b090', '#9a7a60'] },
  { type: 'slider', key: 'density', label: 'Densidade', min: 0, max: 100 },
  { type: 'slider', key: 'size', label: 'Tamanho', min: 0, max: 100 },
  { type: 'slider', key: 'variation', label: 'Variação', min: 0, max: 100 },
  { type: 'slider', key: 'opacity', label: 'Opacidade', min: 0, max: 100 },
];
