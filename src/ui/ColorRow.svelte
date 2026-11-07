<script lang="ts">
  interface Props {
    label: string;
    value: string;
    palette: string[];
    onchange: (v: string) => void;
  }

  let { label, value, palette, onchange }: Props = $props();
</script>

<div class="row" role="group" aria-label={label}>
  <span class="label">{label}</span>
  <div class="swatches scroll-x">
    {#each palette as color (color)}
      <button
        type="button"
        class="swatch"
        class:on={color === value}
        style:--c={color}
        aria-label="Cor {color}"
        aria-pressed={color === value}
        onclick={() => onchange(color)}
      ></button>
    {/each}
    <label class="swatch picker" aria-label="Escolher outra cor">
      <input type="color" {value} oninput={(e) => onchange(e.currentTarget.value)} />
    </label>
  </div>
</div>

<style>
  .row {
    padding: 6px 0;
  }

  .label {
    font-size: 13px;
    color: var(--paper-2);
  }

  .swatches {
    display: flex;
    gap: 10px;
    padding: 8px 2px;
  }

  .swatch {
    position: relative;
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.18);
    transition: transform var(--t-fast) var(--ease-reveal);
  }

  .swatch:hover {
    transform: scale(1.08);
  }

  .swatch.on::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 1.5px solid var(--paper);
  }

  .picker {
    background: conic-gradient(#e27a7a, #e2c27a, #8fce86, #7ac8e2, #8f8ae2, #e27ad0, #e27a7a);
    overflow: hidden;
    cursor: pointer;
  }

  .picker input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
</style>
