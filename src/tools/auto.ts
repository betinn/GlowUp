/**
 * Automatic behaviour declared by a tool whose effect is neither a mask nor healed spots. The tool adds
 * its action to `AUTO_ACTIONS` and gets what the mask tools have: the search, Automático and Manual, the
 * second tap that turns the effect off, and the mark on its button. The table sits with the editor, so
 * each action keeps its math behind a dynamic import.
 */

import type { Engine } from '../core/engine';
import type { Face } from '../core/face/scan';
import type { SourceImage } from '../core/source';
import { adjustAction } from './autoadjust';
import { blurAction } from './autoblur';
import { liquifyAction } from './autoliquify';

/** What the search left for the action. `faces` is empty when the action asked for no search. */
export interface AutoFound {
  faces: readonly Face[];
  source: SourceImage;
}

/** The words of the panel. A tool with a region in the catalog reads `LIMIT_WORDS` for the search instead. */
export interface AutoWords {
  /** Shown during the search, as in "Procurando o rosto". */
  finding: string;
  /** Shown when the search ends with nothing to work on. */
  missing: string;
  /** Where the effect goes, as in "no rosto". */
  place: string;
  /** Replaces the hint of the tool while in Automático. */
  hint: string;
  /** Replaces the note that says the effect is on, for an action that does not go on a place it found. */
  applied?: string;
}

export interface AutoAction {
  words: AutoWords;
  /**
   * Whether it needs the detector first. `required` without a face leaves the tool in Manual, `optional`
   * runs with an empty list, and leaving it out runs at once, with no search and no progress card.
   */
  faces?: 'required' | 'optional';
  /** It warps the photo, so the background has to be told apart first. */
  person?: boolean;
  /** Applies the effect, replacing what the action applied before, as one undo step. */
  apply(e: Engine, found: AutoFound): Promise<void>;
  /** The effect is on this photo. */
  hasWork(e: Engine): boolean;
  /** Takes the effect off, as one undo step. */
  clear(e: Engine): Promise<void>;
}

/** The actions, by tool id. */
export const AUTO_ACTIONS = new Map<string, AutoAction>([
  ['liquify', liquifyAction],
  ['adjust', adjustAction],
  ['blur', blurAction],
]);

export const autoAction = (tool: string): AutoAction | undefined => AUTO_ACTIONS.get(tool);
