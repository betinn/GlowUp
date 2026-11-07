<script lang="ts">
  /** A line of light: the track lights up to the chosen value and the knob grows while held. */
  interface Props {
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    bipolar?: boolean;
    resetTo?: number;
    format?: (v: number) => string;
    oninput: (v: number) => void;
    onchange?: () => void;
  }

  let { label, value, min = 0, max = 100, step = 1, bipolar = false, resetTo, format, oninput, onchange }: Props = $props();

  let held = $state(false);
  let lastTap = 0;

  const zero = $derived(bipolar ? ((0 - min) / (max - min)) * 100 : 0);
  const pos = $derived(((value - min) / (max - min)) * 100);
  const from = $derived(Math.min(zero, pos));
  const to = $derived(Math.max(zero, pos));
  const shown = $derived(format ? format(value) : `${bipolar && value > 0 ? '+' : ''}${Math.round(value)}`);

  function handle(e: Event) {
    let v = Number((e.currentTarget as HTMLInputElement).value);
    // Gentle detent at zero.
    if (bipolar && Math.abs(v) < (max - min) * 0.012) v = 0;
    oninput(v);
  }

  function down() {
    held = true;
    const now = performance.now();
    if (now - lastTap < 280 && resetTo !== undefined) {
      oninput(resetTo);
      onchange?.();
    }
    lastTap = now;
  }

  function up() {
    held = false;
    onchange?.();
  }
</script>

<label class="slider" class:held>
  <span class="row">
    <span class="label">{label}</span>
    <span class="value">{shown}</span>
  </span>
  <span class="track" style:--from="{from}%" style:--to="{to}%" style:--pos="{pos}%">
    <span class="rail"></span>
    <span class="fill"></span>
    {#if bipolar}<span class="zero" style:left="{zero}%"></span>{/if}
    <span class="knob"></span>
    <input
      type="range"
      {min}
      {max}
      {step}
      {value}
      aria-label={label}
      oninput={handle}
      onpointerdown={down}
      onpointerup={up}
      onpointercancel={up}
      onkeyup={() => onchange?.()}
    />
  </span>
</label>

<style>
  .slider {
    display: block;
    padding: 6px 0;
  }

  .row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--paper-2);
    transition: color var(--t-fast);
  }

  .held .row,
  .slider:hover .row {
    color: var(--paper);
  }

  .value {
    font-variant-numeric: tabular-nums;
    transition: transform var(--t-fast) var(--ease-reveal);
  }

  .held .value {
    transform: translateY(-2px) scale(1.08);
    color: var(--safe);
  }

  .track {
    position: relative;
    display: block;
    height: 32px;
  }

  .rail,
  .fill {
    position: absolute;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    border-radius: 2px;
  }

  .rail {
    left: 0;
    right: 0;
    background: var(--line-2);
  }

  .fill {
    left: var(--from);
    width: calc(var(--to) - var(--from));
    background: var(--paper);
    transition: background var(--t-fast);
  }

  .held .fill {
    background: var(--safe);
  }

  .zero {
    position: absolute;
    top: 50%;
    width: 2px;
    height: 8px;
    margin: -4px 0 0 -1px;
    background: var(--paper-3);
  }

  .knob {
    position: absolute;
    left: var(--pos);
    top: 50%;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border-radius: 50%;
    background: var(--paper);
    transition:
      transform var(--t-fast) var(--ease-reveal),
      background var(--t-fast);
  }

  .held .knob {
    transform: scale(1.5);
    background: var(--safe);
  }

  input {
    position: absolute;
    inset: 0;
    width: calc(100% + 14px);
    left: -7px;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: grab;
    touch-action: pan-y;
  }

  input:active {
    cursor: grabbing;
  }

  .track:has(input:focus-visible) .knob {
    outline: 2px solid var(--safe);
    outline-offset: 2px;
  }
</style>
