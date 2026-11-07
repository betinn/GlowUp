import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { intensity: 55, glow: 45 };

export const controls: Control[] = [
  { type: 'slider', key: 'intensity', label: 'Intensidade', min: 0, max: 100 },
  { type: 'slider', key: 'glow', label: 'Glow', min: 0, max: 100 },
];
