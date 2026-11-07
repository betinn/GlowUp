import type { Params } from '../../core/doc';
import { makeupControls } from '../makeup/create';

export const defaults: Params = { color: '#c9ac97', opacity: 45, blend: 'multiply' };

export const controls = makeupControls(['#c9ac97', '#d6bda9', '#b8967e', '#cfae92', '#a98a78', '#c2a08e', '#b39079', '#94786a']);
