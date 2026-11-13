import type { Params } from '../../core/doc';
import { makeupControls } from '../makeup/create';

export const defaults: Params = { color: '#1a1716', opacity: 85, blend: 'multiply' };

export const controls = makeupControls(['#1a1716', '#3b2a22', '#5a3a2a', '#1f2a44', '#2f3d2c', '#4a2a44', '#6b4a2e', '#7a7a80']);
