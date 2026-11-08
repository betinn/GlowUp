<script lang="ts">
  /**
   * Manchas. The automatic mode heals the spots found on the skin, one by one, as one undo step. Manual is
   * the healing brush, kept on the skin while the switch is on.
   */
  import BrushControls from '../BrushControls.svelte';
  import { toolLimit } from '../facepick.svelte';
  import Icon from '../Icon.svelte';
  import RegionLimit from './RegionLimit.svelte';
  import Switch from '../Switch.svelte';
  import { bump, engine, HEAL_RINGS_KEY, prefs, ui } from '../state.svelte';

  const e = engine();
  const healed = $derived((ui.rev, e.doc.heals.length));
  const brushShown = $derived(!toolLimit.region || toolLimit.mode === 'manual');
  const ringsOffered = $derived(healed > 0 && !!toolLimit.region && toolLimit.mode === 'auto' && toolLimit.state === 'on');

  function showRings(on: boolean) {
    ui.healRings = on;
    prefs.write(HEAL_RINGS_KEY, on);
  }

  async function clear() {
    await e.healSpots([], 'Limpar');
    bump();
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

{#if healed > 0}
  <button type="button" class="clear" data-testid="heal-clear" onclick={clear}>
    <Icon name="trash" size={18} /> {healed === 1 ? 'Tirar a correção' : `Tirar as ${healed} correções`}
  </button>
{/if}

<style>
  .clear {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    color: var(--paper-2);
    font-size: 13px;
  }

  .clear:hover {
    color: var(--paper);
  }
</style>
