<script lang="ts">
  import Segment from '../Segment.svelte';
  import Slider from '../Slider.svelte';
  import { toolLimit } from '../facepick.svelte';
  import { bump, engine, ui } from '../state.svelte';
  import AutoMode from './AutoMode.svelte';

  const e = engine();
  const b = $derived((ui.rev, { ...e.doc.blur }));

  function set(patch: Partial<typeof b>) {
    e.setBlur(patch);
    bump();
  }
</script>

<AutoMode />

{#if toolLimit.mode !== 'auto'}
  <Segment
    label="Tipo de desfoque"
    value={b.mode}
    options={[
      { value: 'off', label: 'Sem' },
      { value: 'radial', label: 'Radial' },
      { value: 'tilt', label: 'Tilt-shift' },
    ]}
    onchange={(v) => {
      set({ mode: v as typeof b.mode });
      e.commit();
    }}
  />
{/if}

{#if b.mode !== 'off'}
  <Slider label="Intensidade" value={b.strength} oninput={(v) => set({ strength: v })} onchange={() => e.commit()} />
  <Slider label="Área em foco" value={b.focus * 100} max={70} oninput={(v) => set({ focus: v / 100 })} onchange={() => e.commit()} />
  <Slider label="Transição" value={b.feather * 100} min={1} max={70} oninput={(v) => set({ feather: v / 100 })} onchange={() => e.commit()} />
  {#if b.mode === 'tilt'}
    <Slider
      label="Ângulo"
      value={b.angle}
      min={-90}
      max={90}
      bipolar
      resetTo={0}
      format={(v) => `${Math.round(v)}°`}
      oninput={(v) => set({ angle: v })}
      onchange={() => e.commit()}
    />
  {/if}
{/if}
