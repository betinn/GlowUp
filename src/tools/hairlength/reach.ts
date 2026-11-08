/**
 * How far the longer hair reaches, in image heights. Plain math shared by the tool and the export,
 * which needs room above each tile for the hair that gets stretched into it.
 */

import type { Params } from '../../core/doc';

/** At 100% the hair grows by this many face heights. */
const LENGTH_SPAN = 1;
/** Face height assumed when the detector gave none. */
export const DEFAULT_REACH = 0.25;

/** How far the hair grows below its end, and the stretch of hair above the end that fills it. */
export function lengthReach(params: Params): { grow: number; band: number } {
  const reach = Number(params.reach) || DEFAULT_REACH;
  const grow = (Number(params.amount) / 100) * LENGTH_SPAN * reach;
  // A band longer than the growth keeps the stretch under 2x, so strands stay strands.
  return { grow, band: Math.max(grow * 1.2, 0.02) };
}
