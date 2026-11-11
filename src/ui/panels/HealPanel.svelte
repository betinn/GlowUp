<script lang="ts">
  /**
   * Manchas. The automatic mode heals the spots found on the skin, one by one, as one undo step. Manual is
   * the healing brush, kept on the skin while the switch is on. Both share one set of spots, each with a ring.
   */
  import BrushControls from '../BrushControls.svelte';
  import { toolLimit } from '../facepick.svelte';
  import AutoMode from './AutoMode.svelte';
  import Switch from '../Switch.svelte';
  import { engine, HEAL_RINGS_KEY, prefs, ui } from '../state.svelte';

  const e = engine();
  const healed = $derived((ui.rev, e.doc.heals.length));
  const brushShown = $derived(!toolLimit.tool || toolLimit.mode === 'manual');
  const ringsOffered = $derived(healed > 0 && toolLimit.state !== 'searching');
  const manualRings = $derived(ringsOffered && ui.healRings && toolLimit.mode === 'manual');

  function showRings(on: boolean) {
    ui.healRings = on;
    prefs.write(HEAL_RINGS_KEY, on);
  }
</script>

<AutoMode />

{#if brushShown}
  <BrushControls erasable={false} full={false} />
{/if}

{#if manualRings}
  <p class="note" role="status">Toque num círculo para tirar só aquela correção.</p>
{/if}

{#if ringsOffered}
  <Switch label="Círculos nas correções" checked={ui.healRings} testid="heal-rings" onchange={showRings} />
{/if}

<style>
  .note {
    font-size: 13px;
    line-height: 1.3;
    color: var(--paper-2);
  }
</style>
