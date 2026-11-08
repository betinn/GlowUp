import type { Params } from '../../core/doc';
import type { Control } from '../types';

export const defaults: Params = { amount: 50 };

export const controls: Control[] = [{ type: 'slider', key: 'amount', label: 'Intensidade', min: 0, max: 100 }];
