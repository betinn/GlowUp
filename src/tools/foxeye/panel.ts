import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { color: '#1a1716', shade: '#8a5a44', opacity: 85, smoke: 75 };

export const controls: Control[] = [
  { type: 'color', key: 'color', label: 'Traço', palette: ['#1a1716', '#3b2a22', '#5a3a2a', '#1f2a44', '#4a2a44', '#2f3d2c'] },
  { type: 'slider', key: 'opacity', label: 'Força do traço', min: 0, max: 100 },
  { type: 'color', key: 'shade', label: 'Esfumado', palette: ['#8a5a44', '#a86e50', '#7a4a3e', '#9a6a5e', '#6a4e46', '#8e6a90', '#b07a6a', '#5f5868'] },
  { type: 'slider', key: 'smoke', label: 'Força do esfumado', min: 0, max: 100 },
];
