import { createMakeup } from '../makeup/create';
import { controls, defaults } from './panel';

export default createMakeup('eyeshadow', defaults, controls, { size: 0.016, hardness: 0.1, flow: 0.4 });
