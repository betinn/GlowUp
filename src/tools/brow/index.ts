import { createMakeup } from '../makeup/create';
import { controls, defaults } from './panel';

export default createMakeup('brow', defaults, controls, { size: 0.008, hardness: 0.4, flow: 0.5 });
