import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { amount: 40 };

export const controls: Control[] = [{ type: 'slider', key: 'amount', label: 'Contraste', min: -100, max: 100, bipolar: true }];
