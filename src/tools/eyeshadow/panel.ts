import type { Params } from '../../core/doc';
import { makeupControls } from '../makeup/create';

export const defaults: Params = { color: '#b58e7a', opacity: 50, blend: 'multiply' };

export const controls = makeupControls(['#b58e7a', '#c79a7f', '#9c7e9e', '#8294b0', '#94a37c', '#c9a877', '#b57e88', '#6f6878']);
