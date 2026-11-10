/**
 * Every sticker of Brincar, in the order of the grid of the menu. To add one, write it in a file of its own in
 * this folder, with art made for the project, and add one line here. See "Brincar" in `docs/DESIGN.md`.
 */

import type { StickerDef } from '../types';
import { oculosRedondos } from './oculos-redondos';

export const STICKERS: readonly StickerDef[] = [
  oculosRedondos,
];

export const stickerById = (id: string) => STICKERS.find((s) => s.id === id);
