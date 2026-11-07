import type { Control } from '../types';

export const controls: Control[] = [
  { type: 'slider', key: 'whiten', label: 'Tirar o amarelo', min: 0, max: 100 },
  { type: 'slider', key: 'bright', label: 'Clarear', min: 0, max: 100 },
];
