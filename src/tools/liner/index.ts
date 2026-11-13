import { createMakeup } from '../makeup/create';
import { controls, defaults } from './panel';

export default createMakeup('liner', defaults, controls, { size: 0.004, hardness: 0.75, flow: 0.9 });
