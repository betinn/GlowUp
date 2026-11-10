/**
 * Every sticker of Brincar, in the order of the grid of the menu, and the tabs of that grid. To add one, write
 * it in a file of its own in this folder, with art made for the project, and add one line here. See "Brincar"
 * in `docs/DESIGN.md`.
 */

import type { StickerDef, StickerGroup } from '../types';
import { aureola } from './aureola';
import { bigodeClassico } from './bigode-classico';
import { bigodeFininho } from './bigode-fininho';
import { bigodeGuidao } from './bigode-guidao';
import { bochechas } from './bochechas';
import { bone } from './bone';
import { brilhos } from './brilhos';
import { cartola } from './cartola';
import { chapeuFesta } from './chapeu-festa';
import { chifrinhos } from './chifrinhos';
import { coracoes } from './coracoes';
import { coroa } from './coroa';
import { estrelas } from './estrelas';
import { lagrima } from './lagrima';
import { narizPalhaco } from './nariz-palhaco';
import { oculosAviador } from './oculos-aviador';
import { oculosCoracao } from './oculos-coracao';
import { oculosEscuros } from './oculos-escuros';
import { oculosEstrela } from './oculos-estrela';
import { oculosNerd } from './oculos-nerd';
import { oculosRedondos } from './oculos-redondos';
import { orelhasCoelho } from './orelhas-coelho';
import { orelhasGato } from './orelhas-gato';
import { sardas } from './sardas';

export const STICKERS: readonly StickerDef[] = [
  oculosRedondos,
  oculosEscuros,
  oculosCoracao,
  oculosEstrela,
  oculosNerd,
  oculosAviador,
  coroa,
  chapeuFesta,
  cartola,
  bone,
  orelhasGato,
  orelhasCoelho,
  aureola,
  chifrinhos,
  bigodeClassico,
  bigodeGuidao,
  bigodeFininho,
  narizPalhaco,
  bochechas,
  lagrima,
  sardas,
  coracoes,
  estrelas,
  brilhos,
];

/** The tabs of the grid, in order, with their names in pt-BR. */
export const STICKER_GROUPS: readonly { id: StickerGroup; label: string }[] = [
  { id: 'oculos', label: 'Óculos' },
  { id: 'cabeca', label: 'Cabeça' },
  { id: 'rosto', label: 'Rosto' },
  { id: 'volta', label: 'Em volta' },
];

export const stickerById = (id: string) => STICKERS.find((s) => s.id === id);
