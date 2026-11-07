import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { strength: 100, darken: 60 };

export const controls: Control[] = [
  { type: 'slider', key: 'strength', label: 'Correção', min: 0, max: 100 },
  { type: 'slider', key: 'darken', label: 'Escurecer pupila', min: 0, max: 100 },
];
