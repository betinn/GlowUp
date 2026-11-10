<script lang="ts">
  import BrushControls from '../BrushControls.svelte';
  import Icon from '../Icon.svelte';
  import Slider from '../Slider.svelte';
  import { ensureLock, hasWork, lockState, toolLimit } from '../facepick.svelte';
  import FillCard from '../FillCard.svelte';
  import { bump, engine, ui } from '../state.svelte';
  import { previewShape, SHAPE_MIN, shapeAmount } from '../../tools/autoliquify';
  import Switch from '../Switch.svelte';
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

  const locked = $derived((ui.rev, !e.doc.unlocked));
  /** A brush that went free before the search ended still gets the lock. */
  const searched = $derived(toolLimit.state !== 'searching');

  $effect(() => {
    if (searched && lockState.state === 'idle') void ensureLock(e);
  });

  function pick(id: string) {
    e.liquifyMode = id;
    bump();
  }

  function setLock(on: boolean) {
    e.setBrushFree(!on);
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
        e.commit();
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
  <Switch label="Travar o fundo" checked={locked} testid="lock-toggle" onchange={setLock} />
{/if}

{#if lockState.state === 'on'}
  <FillCard />
{/if}

{#if lockState.state === 'none' || lockState.state === 'failed'}
  <p class="note warn" role="status" data-testid="lock-note">
    {lockState.state === 'failed' ? 'A separação do fundo não carregou' : 'Não achei uma pessoa para separar do fundo nesta foto'}. O pincel e o Automático mexem também no que estiver atrás.
  </p>
{:else if !auto && lockState.state === 'on'}
  <p class="note" role="status" data-testid="lock-note">
    {locked ? 'Com o fundo travado, o pincel só mexe na pessoa.' : 'Com o fundo solto, o pincel mexe em tudo. Os controles de Rosto, Olhos, Nariz e boca seguem sem mexer no fundo.'}
  </p>
{/if}

<style>
  .note {
    font-size: 13px;
    line-height: 1.3;
    color: var(--paper-2);
  }

  .warn {
    color: var(--safe);
  }

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
