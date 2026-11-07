import type { Params } from '../../core/doc';
import { makeupControls } from '../makeup/create';

export const defaults: Params = { color: '#4a3528', opacity: 45, blend: 'multiply' };

export const controls = makeupControls(['#4a3528', '#2f2520', '#6a4f3a', '#8a6a4f', '#3a3030', '#a08060', '#5a3a2a', '#1f1a18']);
