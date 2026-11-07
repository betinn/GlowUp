import { createMakeup } from '../makeup/create';
import { controls, defaults } from './panel';

export default createMakeup('contour', defaults, controls, { size: 0.035, hardness: 0, flow: 0.3 });
