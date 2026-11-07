import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { hue: 0, saturation: 0, lightness: 10 };

export const controls: Control[] = [
  { type: 'slider', key: 'hue', label: 'Matiz', min: -100, max: 100, bipolar: true },
  { type: 'slider', key: 'saturation', label: 'Saturação', min: -100, max: 100, bipolar: true },
  { type: 'slider', key: 'lightness', label: 'Luminância', min: -100, max: 100, bipolar: true },
];
