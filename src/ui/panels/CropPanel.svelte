<script lang="ts">
  import { constrainCrop, defaultCrop, largestInscribed, type Crop } from '../../core/geometry';
  import Icon from '../Icon.svelte';
  import Slider from '../Slider.svelte';
  import { bump, engine, ui } from '../state.svelte';

  const e = engine();
  const crop = $derived((ui.rev, e.doc.crop));
  let aspect = $state<string>('free');

  const RATIOS: { id: string; label: string; value: number | null }[] = [
    { id: 'free', label: 'Livre', value: null },
    { id: 'orig', label: 'Original', value: 0 },
    { id: '1:1', label: '1:1', value: 1 },
    { id: '4:5', label: '4:5', value: 4 / 5 },
    { id: '9:16', label: '9:16', value: 9 / 16 },
  ];

  function apply(next: Crop) {
    e.setCrop(constrainCrop(next, e.doc.width, e.doc.height));
    bump();
  }

  /** Largest rectangle for the current rotation at the wanted ratio. */
  function refit(c: Crop, ratio: number): Crop {
    const fit = largestInscribed(e.doc.width, e.doc.height, c, ratio);
    return { ...c, cx: 0, cy: 0, cw: fit.cw, ch: fit.ch };
  }

  function pickRatio(id: string, value: number | null) {
    aspect = id;
    window.dispatchEvent(new CustomEvent('glowup:crop-aspect', { detail: id }));
    if (value === null) return;
    const odd = crop.quarter % 2 === 1;
    const original = odd ? e.doc.height / e.doc.width : e.doc.width / e.doc.height;
    apply(refit(crop, value === 0 ? original : value));
    e.commit();
  }

  function turn(by: number) {
    const quarter = (crop.quarter + by + 4) % 4;
    const next = { ...crop, quarter };
    apply(refit(next, crop.ch / crop.cw));
    e.commit();
  }

  function straighten(angle: number) {
    const next = { ...crop, angle };
    const ratio = crop.cw / crop.ch;
    const fit = largestInscribed(e.doc.width, e.doc.height, next, ratio);
    apply({ ...next, cw: Math.min(crop.cw, fit.cw), ch: Math.min(crop.ch, fit.ch) });
  }

  function reset() {
    aspect = 'free';
    window.dispatchEvent(new CustomEvent('glowup:crop-aspect', { detail: 'free' }));
    apply(defaultCrop(e.doc.width, e.doc.height));
    e.commit();
  }
</script>

<div class="ratios scroll-x" role="radiogroup" aria-label="Proporção">
  {#each RATIOS as r (r.id)}
    <button type="button" role="radio" aria-checked={aspect === r.id} class:on={aspect === r.id} onclick={() => pickRatio(r.id, r.value)}>
      {r.label}
    </button>
  {/each}
</div>

<Slider
  label="Endireitar"
  value={crop.angle}
  min={-45}
  max={45}
  step={0.1}
  bipolar
  resetTo={0}
  format={(v) => `${v.toFixed(1)}°`}
  oninput={straighten}
  onchange={() => e.commit()}
/>

<div class="actions">
  <button type="button" class="icon-btn" aria-label="Girar para a esquerda" onclick={() => turn(-1)}><Icon name="rotate" /></button>
  <button type="button" class="icon-btn" aria-label="Girar para a direita" onclick={() => turn(1)}><Icon name="rotateCw" /></button>
  <button
    type="button"
    class="icon-btn"
    class:on={crop.flipH}
    aria-label="Espelhar na horizontal"
    aria-pressed={crop.flipH}
    onclick={() => {
      apply({ ...crop, flipH: !crop.flipH, cx: -crop.cx });
      e.commit();
    }}><Icon name="flipH" /></button
  >
  <button
    type="button"
    class="icon-btn"
    class:on={crop.flipV}
    aria-label="Espelhar na vertical"
    aria-pressed={crop.flipV}
    onclick={() => {
      apply({ ...crop, flipV: !crop.flipV, cy: -crop.cy });
      e.commit();
    }}><Icon name="flipV" /></button
  >
  <button type="button" class="icon-btn" aria-label="Voltar ao original" onclick={reset}><Icon name="reset" /></button>
</div>

<style>
  .ratios {
    display: flex;
    gap: 6px;
    padding: 2px 2px 8px;
  }

  .ratios button {
    flex: none;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    font-size: 13px;
    color: var(--paper-2);
    transition:
      color var(--t-fast),
      border-color var(--t-fast);
  }

  .ratios button.on {
    color: var(--safe);
    border-color: var(--safe);
  }

  .actions {
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
  }
</style>
