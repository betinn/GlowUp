import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { contrast: 55, sharp: 50 };

export const controls: Control[] = [
  { type: 'slider', key: 'contrast', label: 'Contraste', min: 0, max: 100 },
  { type: 'slider', key: 'sharp', label: 'Nitidez', min: 0, max: 100 },
];
