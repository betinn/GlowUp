import type { BrushSettings } from '../core/brush';
import type { Params } from '../core/doc';
import type { ToolPass } from '../core/pipeline/types';

export type Control =
  | {
      type: 'slider';
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      /** Center detent at zero. */
      bipolar?: boolean;
    }
  | { type: 'segment'; key: string; label: string; options: { value: string; label: string }[] }
  | { type: 'color'; key: string; label: string; palette: string[] };

/** Everything a masked tool ships in its chunk: GPU pass, defaults and panel description. */
export interface ToolModule {
  pass: ToolPass;
  defaults: Params;
  controls: Control[];
  brush?: Partial<BrushSettings>;
}

/** Reads a numeric parameter as 0..1 from a 0..100 slider. */
export const pct = (params: Params, key: string) => Number(params[key]) / 100;
