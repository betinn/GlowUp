import type { Params } from '../../core/doc';
import type { Control } from '../types';

/** Half strength looks like a real eye on first sight: at 75 the new color read as a painted disc. */
export const defaults: Params = { color: '#5c8fb0', amount: 50, lift: 20 };

export const controls: Control[] = [
  {
    type: 'color',
    key: 'color',
    label: 'Cor',
    palette: ['#5c8fb0', '#4f9c8a', '#6f8f4e', '#8a6a3d', '#6b4a2f', '#7a7f8c', '#7d6aa8', '#b58a4a'],
  },
  { type: 'slider', key: 'amount', label: 'Intensidade', min: 0, max: 100 },
  { type: 'slider', key: 'lift', label: 'Luz na íris', min: 0, max: 100 },
];
