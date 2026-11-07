import { hexToRgb } from '../../core/color';
import type { LayerId, Params } from '../../core/doc';
import type { BrushSettings } from '../../core/brush';
import { pct, type Control, type ToolModule } from '../types';
import FRAGMENT from './shader.glsl?raw';

const BLENDS: Record<string, number> = { multiply: 0, soft: 1, color: 2 };

export const BLEND_CONTROL: Control = {
  type: 'segment',
  key: 'blend',
  label: 'Mistura',
  options: [
    { value: 'color', label: 'Cor' },
    { value: 'soft', label: 'Suave' },
    { value: 'multiply', label: 'Multiplicar' },
  ],
};

export const makeupControls = (palette: string[], extra: Control[] = []): Control[] => [
  { type: 'color', key: 'color', label: 'Cor', palette },
  { type: 'slider', key: 'opacity', label: 'Opacidade', min: 0, max: 100 },
  BLEND_CONTROL,
  ...extra,
];

/** Builds a makeup tool. Each product differs only in palette, defaults and brush. */
export function createMakeup(id: LayerId, defaults: Params, controls: Control[], brush: Partial<BrushSettings>): ToolModule {
  return {
    defaults,
    controls,
    brush,
    pass: {
      id,
      fragment: FRAGMENT,
      uniforms(params) {
        return {
          uColor: hexToRgb(String(params.color)),
          uOpacity: pct(params, 'opacity'),
          uBlend: BLENDS[String(params.blend)] ?? 2,
          uShine: params.shine === undefined ? 0 : pct(params, 'shine'),
        };
      },
    },
  };
}
