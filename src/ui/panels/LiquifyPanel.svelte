<script lang="ts">
  import BrushControls from '../BrushControls.svelte';
  import Icon from '../Icon.svelte';
  import Slider from '../Slider.svelte';
  import { hasWork, refillRegion, toolLimit } from '../facepick.svelte';
  import { bump, engine, ui } from '../state.svelte';
  import { previewShape, releaseShape, SHAPE_MIN, shapeAmount } from '../../tools/autoliquify';
  import AutoMode from './AutoMode.svelte';

  const e = engine();
  const mode = $derived((ui.rev, e.liquifyMode));
  const strength = $derived((ui.rev, e.liquifyStrength));
  const auto = $derived(toolLimit.mode === 'auto');
  const filled = $derived((ui.rev, hasWork(e, 'liquify')));
  const amount = $derived((ui.rev, shapeAmount(e)));

  const MODES = [
    { id: 'push', label: 'Empurrar' },
    { id: 'bloat', label: 'Inflar' },
    { id: 'pinch', label: 'Contrair' },
    { id: 'restore', label: 'Restaurar' },
  ];

  function pick(id: string) {
    e.liquifyMode = id;
    bump();
  }
</script>

<AutoMode />

{#if auto}
  {#if filled && toolLimit.state === 'on'}
    <Slider
      label="Intensidade"
      value={amount}
      min={SHAPE_MIN}
      oninput={(v) => {
        previewShape(e, v);
        bump();
      }}
      onchange={() => {
        if (releaseShape(e)) refillRegion(e);
        bump();
      }}
    />
  {/if}
{:else}
  <div class="modes" role="radiogroup" aria-label="Pincel">
    {#each MODES as m (m.id)}
      <button type="button" role="radio" aria-checked={mode === m.id} class:on={mode === m.id} onclick={() => pick(m.id)}>
        <Icon name={m.id} size={22} />
        <span>{m.label}</span>
      </button>
    {/each}
  </div>

  <Slider
    label="Força"
    value={strength * 100}
    oninput={(v) => {
      e.liquifyStrength = v / 100;
      bump();
    }}
  />
  <BrushControls erasable={false} full={false} />
{/if}

<style>
  .modes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 6px;
  }

  button {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 10px 2px;
    border-radius: 14px;
    font-size: 12px;
    color: var(--paper-2);
    transition:
      color var(--t-fast),
      background var(--t-fast);
  }

  button:hover {
    background: rgb(255 255 255 / 0.05);
  }

  button.on {
    color: var(--safe);
    background: rgb(255 184 119 / 0.1);
  }
</style>
