import type { Params } from '../../core/doc';
import type { Control } from '../types';
import { DEFAULT_REACH } from './reach';

/** `reach` is the face height the detector found, in image heights. It has no control of its own. */
export const defaults: Params = { amount: 40, tips: 50, reach: DEFAULT_REACH };

export const controls: Control[] = [
  { type: 'slider', key: 'amount', label: 'Comprimento', min: 0, max: 100 },
  { type: 'slider', key: 'tips', label: 'Pontas', min: 0, max: 100 },
];
