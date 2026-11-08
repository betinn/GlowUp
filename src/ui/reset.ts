/** Putting a menu, or the whole photo, back to the original. Both are one step of the undo. */

import type { ResetScope } from '../core/engine';
import type { LayerId } from '../core/doc';
import { GROUPS, TOOLS, type GroupId } from '../tools/catalog';
import { bump, engine, toast } from './state.svelte';

const layersOf = (group: GroupId) => TOOLS.filter((t) => t.group === group && t.layer).map((t) => t.layer!);

/** What each menu owns besides the masks of its tools. */
const EXTRA: Partial<Record<GroupId, Omit<ResetScope, 'layers'>>> = {
  skin: { heals: true },
  shape: { field: true },
  looks: { filter: true },
  light: { adjust: true, blur: true },
  frame: { crop: true },
};

export function groupScope(group: GroupId): ResetScope {
  return { layers: layersOf(group), ...EXTRA[group] };
}

export function wholeScope(): ResetScope {
  const layers = Object.keys(engine().doc.layers) as LayerId[];
  return { layers, heals: true, field: true, adjust: true, filter: true, blur: true, crop: true };
}

const labelOf = (group: GroupId) => GROUPS.find((g) => g.id === group)?.label ?? '';

/** True when the menu has something to put back. */
export const groupChanged = (group: GroupId) => engine().changed(groupScope(group));

export const photoChanged = () => engine().changed(wholeScope());

export async function resetGroup(group: GroupId): Promise<void> {
  const label = labelOf(group);
  if (await engine().resetParts(`Zerar ${label}`, groupScope(group))) {
    toast(`${label} voltou ao original. Desfazer traz de volta.`);
  }
  bump();
}

export async function resetPhoto(): Promise<void> {
  if (await engine().resetParts('Voltar ao original', wholeScope())) {
    toast('A foto voltou ao original. Desfazer traz tudo de volta.');
  }
  bump();
}
