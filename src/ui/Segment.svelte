<script lang="ts">
  interface Props {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onchange: (v: string) => void;
  }

  let { label, value, options, onchange }: Props = $props();
  const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));
</script>

<div class="segment" role="radiogroup" aria-label={label} style:--n={options.length} style:--i={index}>
  <span class="thumb"></span>
  {#each options as o (o.value)}
    <button type="button" role="radio" aria-checked={o.value === value} class:on={o.value === value} onclick={() => onchange(o.value)}>
      {o.label}
    </button>
  {/each}
</div>

<style>
  .segment {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    border-radius: 999px;
    background: var(--ink-3);
    padding: 3px;
    margin: 6px 0;
  }

  .thumb {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc((100% - 6px) / var(--n));
    border-radius: 999px;
    background: var(--paper);
    transform: translateX(calc(100% * var(--i)));
    transition: transform var(--t-mid) var(--ease-reveal);
  }

  button {
    position: relative;
    min-height: 38px;
    padding: 0 10px;
    font-size: 13px;
    color: var(--paper-2);
    border-radius: 999px;
    transition: color var(--t-mid) var(--ease-swift);
  }

  button.on {
    color: var(--ink);
    font-weight: 600;
  }
</style>
