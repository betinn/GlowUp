import type { Params } from '../../core/doc';
import { makeupControls } from '../makeup/create';

export const defaults: Params = { color: '#e0705f', opacity: 35, blend: 'soft' };

export const controls = makeupControls(['#e0705f', '#e88a8a', '#d6587a', '#c96a4f', '#f09a78', '#b5546a', '#e8a07a', '#a84a55']);
