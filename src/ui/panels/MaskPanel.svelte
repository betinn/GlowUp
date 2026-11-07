<script lang="ts">
  import type { LayerId } from '../../core/doc';
  import type { ToolModule } from '../../tools/types';
  import BrushControls from '../BrushControls.svelte';
  import ColorRow from '../ColorRow.svelte';
  import Icon from '../Icon.svelte';
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

  function visible(key: string) {
    return !(layer === 'hair' && key === 'color' && state?.params.mode !== 'color');
  }
</script>

{#if state}
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
        <Segment label={c.label} value={String(state.params[c.key])} options={c.options} onchange={(v) => setAndCommit(c.key, v)} />
      {:else}
        <ColorRow label={c.label} value={String(state.params[c.key])} palette={c.palette} onchange={(v) => setAndCommit(c.key, v)} />
      {/if}
    {/if}
  {/each}

  <hr />
  <BrushControls />

  {#if state.painted}
    <button type="button" class="clear" onclick={() => e.clearLayer(layer).then(bump)}>
      <Icon name="trash" size={18} /> Apagar o que pintei
    </button>
  {/if}
{/if}

<style>
  hr {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 10px 0;
  }

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
