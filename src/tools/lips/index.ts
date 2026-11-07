import { createMakeup } from '../makeup/create';
import { controls, defaults } from './panel';

export default createMakeup('lips', defaults, controls, { size: 0.012, hardness: 0.55, flow: 0.7 });
