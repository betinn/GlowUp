import type { Params } from '../../core/doc';
import { makeupControls } from '../makeup/create';

export const defaults: Params = { color: '#b0304a', opacity: 55, blend: 'color', shine: 25 };

export const controls = makeupControls(
  ['#b0304a', '#8e2438', '#d0555f', '#c97a6d', '#a8554c', '#7a2f3f', '#e07a8f', '#5a1f2e'],
  [{ type: 'slider', key: 'shine', label: 'Brilho', min: 0, max: 100 }],
);
