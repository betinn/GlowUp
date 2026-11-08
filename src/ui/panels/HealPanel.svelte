<script lang="ts">
  /**
   * Manchas. The automatic mode heals the spots found on the skin, one by one, as one undo step. Manual is
   * the healing brush, kept on the skin while the switch is on.
   */
  import BrushControls from '../BrushControls.svelte';
  import { toolLimit } from '../facepick.svelte';
  import RegionLimit from './RegionLimit.svelte';
  import Switch from '../Switch.svelte';
  import { engine, HEAL_RINGS_KEY, prefs, ui } from '../state.svelte';

  const e = engine();
  const healed = $derived((ui.rev, e.doc.heals.length));
  const brushShown = $derived(!toolLimit.region || toolLimit.mode === 'manual');
  const ringsOffered = $derived(healed > 0 && !!toolLimit.region && toolLimit.mode === 'auto' && toolLimit.state === 'on');

  function showRings(on: boolean) {
    ui.healRings = on;
    prefs.write(HEAL_RINGS_KEY, on);
  }
</script>

{#if toolLimit.region}
  <RegionLimit />
{/if}

{#if brushShown}
  <BrushControls erasable={false} full={false} />
{/if}

{#if ringsOffered}
  <Switch label="Círculos nas correções" checked={ui.healRings} testid="heal-rings" onchange={showRings} />
{/if}
