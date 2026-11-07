<script lang="ts">
  import Icon from './Icon.svelte';
  import Slider from './Slider.svelte';
  import { sizeToSlider, sliderToSize } from './actions';
  import { bump, engine, ui } from './state.svelte';

  let { erasable = true, full = true }: { erasable?: boolean; full?: boolean } = $props();

  const e = engine();
  const b = $derived((ui.rev, { ...e.brush }));

  const pulse = (value: boolean) => {
    window.dispatchEvent(new CustomEvent('glowup:brush-preview', { detail: value }));
  };

  function set<K extends 'size' | 'hardness' | 'opacity' | 'flow'>(key: K, v: number) {
    e.brush[key] = v;
    pulse(true);
    bump();
  }

  function setErase(v: boolean) {
    e.brush.erase = v;
    bump();
  }

  function toggleMask() {
    e.showMask = !e.showMask;
    e.requestRender();
    bump();
  }
</script>

{#if erasable}
  <div class="modes">
    <button type="button" class="mode" class:on={!b.erase} aria-pressed={!b.erase} onclick={() => setErase(false)}>
      <Icon name="brush" size={20} /> Pincel
    </button>
    <button type="button" class="mode" class:on={b.erase} aria-pressed={b.erase} onclick={() => setErase(true)}>
      <Icon name="eraser" size={20} /> Borracha
    </button>
    <button type="button" class="mode end" class:on={e.showMask} aria-pressed={e.showMask} onclick={toggleMask} title="Mostrar área pintada">
      <Icon name="eye" size={20} /> <span class="sr-only">Mostrar área pintada</span>
    </button>
  </div>
{/if}

<Slider
  label="Tamanho"
  value={sizeToSlider(b.size)}
  format={(v) => `${Math.round(v)}`}
  oninput={(v) => set('size', sliderToSize(v))}
  onchange={() => pulse(false)}
/>
{#if full}
  <Slider label="Dureza" value={b.hardness * 100} oninput={(v) => set('hardness', v / 100)} onchange={() => pulse(false)} />
  <Slider label="Opacidade" value={b.opacity * 100} oninput={(v) => set('opacity', v / 100)} onchange={() => pulse(false)} />
  <Slider label="Fluxo" value={b.flow * 100} oninput={(v) => set('flow', v / 100)} onchange={() => pulse(false)} />
{/if}

<style>
  .modes {
    display: flex;
    gap: 6px;
    margin: 4px 0 6px;
  }

  .mode {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 12px;
    border-radius: 999px;
    color: var(--paper-2);
    font-size: 13px;
    transition:
      color var(--t-fast),
      background var(--t-fast);
  }

  .mode:hover {
    background: rgb(255 255 255 / 0.06);
  }

  .mode.on {
    color: var(--safe);
    background: rgb(255 184 119 / 0.1);
  }

  .end {
    margin-left: auto;
  }
</style>
