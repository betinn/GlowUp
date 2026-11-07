import type { BrushSettings } from '../../core/brush';
import type { LayerId, Params } from '../../core/doc';
import { pct, type ToolModule } from '../types';
import { controls } from './panel';
import FRAGMENT from './shader.glsl?raw';

/** Builds a whitening tool. Teeth and the white of the eyes differ only in defaults and brush. */
export function createWhiten(id: LayerId, defaults: Params, brush: Partial<BrushSettings>): ToolModule {
  return {
    defaults,
    controls,
    brush,
    pass: {
      id,
      fragment: FRAGMENT,
      uniforms(params) {
        return { uWhiten: pct(params, 'whiten'), uBright: pct(params, 'bright') };
      },
    },
  };
}
