import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { light: 70, tone: 75 };

export const controls: Control[] = [
  { type: 'slider', key: 'light', label: 'Clarear', min: 0, max: 100 },
  { type: 'slider', key: 'tone', label: 'Neutralizar tom', min: 0, max: 100 },
];
