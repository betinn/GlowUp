import { createMakeup } from '../makeup/create';
import { controls, defaults } from './panel';

export default createMakeup('blush', defaults, controls, { size: 0.05, hardness: 0, flow: 0.25 });
