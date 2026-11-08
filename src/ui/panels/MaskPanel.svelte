<script lang="ts">
  import type { LayerId } from '../../core/doc';
  import type { ToolModule } from '../../tools/types';
  import BrushControls from '../BrushControls.svelte';
  import ColorRow from '../ColorRow.svelte';
  import { toolLimit } from '../facepick.svelte';
  import RegionLimit from './RegionLimit.svelte';
  import Segment from '../Segment.svelte';
  import Slider from '../Slider.svelte';
  import { bump, engine, ui } from '../state.svelte';

  let { layer, tool }: { layer: LayerId; tool: ToolModule } = $props();

  const e = engine();
  const state = $derived.by(() => {
    void ui.rev;
    const l = e.doc.layers[layer];
    return l ? { ...l, params: { ...l.params } } : undefined;
  });

  function set(key: string, value: number | string) {
    e.setParam(layer, key, value);
    bump();
  }

  function setAndCommit(key: string, value: number | string) {
    set(key, value);
    e.commit();
  }

  /** The automatic mode has no brush: the detector draws the mask. */
  const brushShown = $derived(!toolLimit.region || toolLimit.mode === 'manual');

  /** Hair color hides the old modes, which only projects saved before the Cabelo group still use. */
  function visible(key: string) {
    if (layer !== 'hair') return true;
    const color = state?.params.mode === 'color';
    return key === 'mode' ? !color : key !== 'color' || color;
  }
</script>

{#if state}
  <!-- First in the panel: on a phone it is short, and this says where the brush stands. -->
  {#if toolLimit.region}
    <RegionLimit {layer} />
  {/if}
  {#each tool.controls as c (c.key)}
    {#if visible(c.key)}
      {#if c.type === 'slider'}
        <Slider
          label={c.label}
          min={c.min}
          max={c.max}
          step={c.step ?? 1}
          bipolar={c.bipolar}
          resetTo={Number(tool.defaults[c.key])}
          value={Number(state.params[c.key])}
          oninput={(v) => set(c.key, v)}
          onchange={() => e.commit()}
        />
      {:else if c.type === 'segment'}
        <Segment label={c.label} value={String(state.params[c.key] ?? tool.defaults[c.key])} options={c.options} onchange={(v) => setAndCommit(c.key, v)} />
      {:else}
        <ColorRow label={c.label} value={String(state.params[c.key])} palette={c.palette} onchange={(v) => setAndCommit(c.key, v)} />
      {/if}
    {/if}
  {/each}

  {#if brushShown}
    <hr />
    <BrushControls />
  {/if}

{/if}

<style>
  hr {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 10px 0;
  }

</style>
