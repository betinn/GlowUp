/** Wearing a look of Glow na Hora: one tap puts it on, in place of the look before. */

import type { LayerId } from '../core/doc';
import { appliedLook, type RetouchPreset } from '../presets/recipes';
import { TOOLS, toolById } from '../tools/catalog';
import { applyRecipe, type RecipeOutcome } from './actions';
import { handPainted } from './facepick.svelte';
import { bump, engine, toast, ui } from './state.svelte';

/** Long enough to read what was left out, with the look already on the photo. */
const NOTE_MS = 5200;

/** Changes with each tap, so that only the last one has something to say. */
let latest = 0;
/** The detector failed on this look. It looks applied, but another tap must try again, not take it off. */
let retry: string | null = null;

/** What the person reads after a look lands. Nothing, when it all went as expected. */
export function lookMessage(look: RetouchPreset, { filled, missed, failed, stopped }: RecipeOutcome): string | null {
  if (stopped) return 'Esse look não entrou. Toque nele de novo.';
  if (failed) return 'O detector não carregou, então entrou só a cor do look. Confere a conexão e toque nele de novo.';
  if (!missed.length) return null;
  if (!filled.length && missed.length === Object.keys(look.tools).length) return 'Não achei rosto nesta foto, então entrou só a cor do look.';
  const names = missed.map((tool) => toolById(tool)?.label.toLowerCase() ?? tool);
  return `Look ${look.name} na foto. Só ficou de fora: ${names.join(', ')}.`;
}

/** The masks that belong to a look and not to the person: every tool but `keep` and what was painted by hand. */
function looseLayers(keep: readonly string[]): LayerId[] {
  return TOOLS.flatMap((t) => (t.layer && !keep.includes(t.layer) && !handPainted(t.id) ? [t.layer] : []));
}

/** Takes off the look and what the automatic mode put on the masks, as one undo step. Work by hand stays. */
async function takeOff(): Promise<void> {
  await engine().resetParts('Tirar look', { layers: looseLayers([]), adjust: true, filter: true });
  toast('Look fora. Desfazer traz de volta.');
  bump();
}

/** A tap on a look. The look already on the photo comes off, as a second tap does on a tool. */
export async function tapLook(look: RetouchPreset): Promise<void> {
  const mine = ++latest;
  if (appliedLook(engine().doc)?.id === look.id && retry !== look.id) {
    await takeOff();
    return;
  }
  retry = null;
  try {
    const outcome = await applyRecipe(look, { clear: looseLayers(Object.keys(look.tools)) });
    if (mine !== latest) return;
    if (outcome.failed) retry = look.id;
    const message = lookMessage(look, outcome);
    if (message) toast(message, NOTE_MS);
    // The note of the look before has nothing to say about this one.
    else ui.toast = null;
  } catch (err) {
    console.error(err);
    if (mine === latest) toast('Esse look não carregou. Confere a conexão e tenta de novo.');
  }
}
