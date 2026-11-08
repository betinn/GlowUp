import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { amount: 45, warmth: 40 };

export const controls: Control[] = [
  { type: 'slider', key: 'amount', label: 'Intensidade', min: 0, max: 100 },
  { type: 'slider', key: 'warmth', label: 'Dourado', min: 0, max: 100 },
];
