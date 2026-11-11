<script lang="ts">
  /**
   * The one color control of every tool: the preset swatches wrap to as many lines as they need, so each
   * one shows on a phone too, then the custom colors this tool kept, then a swatch that opens a full picker
   * (a saturation and brightness square under a hue slider, and the hex code). Dragging shows the color on
   * the photo as it goes; the color is one undo step when the finger or the mouse lets go.
   */
  import { untrack } from 'svelte';
  import { hexToHsv, hsvToHex, keepRecent, parseHex, readRecent, type HSV } from './colorpick';

  interface Props {
    label: string;
    value: string;
    palette: string[];
    /** Names the custom colors kept for this tool. */
    id: string;
    /** Live change, while a drag goes on. */
    oninput: (v: string) => void;
    /** The pick is over: one undo step. */
    onchange: () => void;
  }

  let { label, value, palette, id, oninput, onchange }: Props = $props();

  let open = $state(false);
  let hsv = $state<HSV>({ h: 0, s: 0, v: 0 });
  let dragging = $state(false);
  let hexText = $state('');
  /** The custom colors this tool kept; a new pick puts itself first. */
  let recent = $derived(readRecent(id));

  const current = $derived(hsvToHex(hsv));
  const hueColor = $derived(hsvToHex({ h: hsv.h, s: 1, v: 1 }));
  const custom = $derived(!palette.includes(value) && !recent.includes(value));

  // Follows the color from outside (a preset, undo) while no drag is changing it here.
  $effect(() => {
    const v = value;
    if (dragging) return;
    untrack(() => {
      if (v !== hsvToHex(hsv)) hsv = hexToHsv(v, hsv.h);
      hexText = v;
    });
  });

  /** The engine draws once a frame: more than one move a frame would only queue work. */
  let frame = 0;
  let pending: string | null = null;
  /** The last color sent to the tool. */
  let sent = '';
  function emit(color: string) {
    sent = color;
    oninput(color);
  }
  function send(color: string) {
    pending = color;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (pending) emit(pending);
      pending = null;
    });
  }

  function flush() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (pending) emit(pending);
    pending = null;
  }

  function finish() {
    flush();
    onchange();
    if (sent) recent = keepRecent(id, sent, palette);
    sent = '';
  }

  function pick(color: string) {
    oninput(color);
    onchange();
  }

  function moveTo(next: HSV) {
    hsv = next;
    hexText = hsvToHex(next);
    send(hexText);
  }

  /** Drag on an element: `at` turns the pointer into a color, as a share of its width and height. */
  function drag(at: (x: number, y: number) => HSV) {
    return (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      dragging = true;
      const r = el.getBoundingClientRect();
      const go = (ev: PointerEvent) => {
        const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
        moveTo(at(x, y));
      };
      const end = () => {
        el.removeEventListener('pointermove', go);
        el.removeEventListener('pointerup', end);
        el.removeEventListener('pointercancel', end);
        dragging = false;
        finish();
      };
      el.addEventListener('pointermove', go);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      e.preventDefault();
      go(e);
    };
  }

  const dragSquare = drag((x, y) => ({ h: hsv.h, s: x, v: 1 - y }));
  const dragHue = drag((x) => ({ ...hsv, h: Math.min(359.9, x * 360) }));

  /** Arrow keys move the knob a step; the color is one undo step when the key goes up. */
  function keys(change: (k: string, big: boolean) => HSV | null) {
    return (e: KeyboardEvent) => {
      const next = change(e.key, e.shiftKey);
      if (!next) return;
      e.preventDefault();
      moveTo(next);
    };
  }

  const step = (big: boolean) => (big ? 0.1 : 0.02);
  const squareKeys = keys((k, big) => {
    const d = step(big);
    const c = (x: number) => Math.min(1, Math.max(0, x));
    if (k === 'ArrowLeft') return { ...hsv, s: c(hsv.s - d) };
    if (k === 'ArrowRight') return { ...hsv, s: c(hsv.s + d) };
    if (k === 'ArrowUp') return { ...hsv, v: c(hsv.v + d) };
    if (k === 'ArrowDown') return { ...hsv, v: c(hsv.v - d) };
    return null;
  });
  const hueKeys = keys((k, big) => {
    const d = big ? 30 : 4;
    if (k === 'ArrowLeft' || k === 'ArrowDown') return { ...hsv, h: (hsv.h - d + 360) % 360 };
    if (k === 'ArrowRight' || k === 'ArrowUp') return { ...hsv, h: (hsv.h + d) % 360 };
    return null;
  });

  function keyUp(e: KeyboardEvent) {
    if (e.key.startsWith('Arrow')) finish();
  }

  function typed() {
    const color = parseHex(hexText);
    if (!color) {
      hexText = value;
      return;
    }
    if (color === value) return;
    hsv = hexToHsv(color, hsv.h);
    emit(color);
    finish();
  }
</script>

<div class="color" role="group" aria-label={label}>
  <span class="label">{label}</span>
  <div class="swatches">
    {#each palette as color (color)}
      <button
        type="button"
        class="swatch"
        class:on={color === value}
        style:--c={color}
        aria-label="Cor {color}"
        aria-pressed={color === value}
        onclick={() => pick(color)}
      ></button>
    {/each}
    {#each recent as color (color)}
      <button
        type="button"
        class="kept"
        class:on={color === value}
        style:--c={color}
        aria-label="Cor sua {color}"
        aria-pressed={color === value}
        onclick={() => pick(color)}
      ></button>
    {/each}
    <button
      type="button"
      class="more"
      class:on={custom || open}
      style:--c={custom ? value : null}
      aria-label="Cor personalizada"
      aria-expanded={open}
      title="Escolher qualquer cor"
      onclick={() => (open = !open)}
    ></button>
  </div>

  {#if open}
    <div class="custom" data-testid="color-custom">
      <div
        class="square"
        style:--hue={hueColor}
        role="slider"
        tabindex="0"
        aria-label="Saturação e brilho"
        aria-valuetext="saturação {Math.round(hsv.s * 100)}%, brilho {Math.round(hsv.v * 100)}%"
        aria-valuenow={Math.round(hsv.s * 100)}
        onpointerdown={dragSquare}
        onkeydown={squareKeys}
        onkeyup={keyUp}
      >
        <span class="knob" style:left="{hsv.s * 100}%" style:top="{(1 - hsv.v) * 100}%" style:--c={current}></span>
      </div>
      <div
        class="hue"
        role="slider"
        tabindex="0"
        aria-label="Matiz"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onpointerdown={dragHue}
        onkeydown={hueKeys}
        onkeyup={keyUp}
      >
        <span class="knob" style:left="{(hsv.h / 360) * 100}%" style:--c={hueColor}></span>
      </div>
      <div class="foot">
        <span class="preview" style:--c={current} aria-hidden="true"></span>
        <input
          class="hex"
          type="text"
          inputmode="text"
          autocomplete="off"
          spellcheck="false"
          maxlength="7"
          size="7"
          aria-label="Código da cor"
          bind:value={hexText}
          onchange={typed}
          onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        <button type="button" class="btn done" onclick={() => (open = false)}>Pronto</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .color {
    padding: 6px 0;
  }

  .label {
    font-size: 13px;
    color: var(--paper-2);
  }

  /* Wraps rather than scrolls: a row that runs off the panel hid the last colors, with nothing to say so. */
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 8px 4px;
  }

  .swatch,
  .kept,
  .more {
    position: relative;
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.18);
    transition: transform var(--t-fast) var(--ease-reveal);
  }

  /* A color of your own reads apart from the presets: a square with round corners. */
  .kept {
    border-radius: 9px;
  }

  .swatch:hover,
  .kept:hover,
  .more:hover {
    transform: scale(1.08);
  }

  .on::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: inherit;
    border: 1.5px solid var(--paper);
  }

  .kept.on::after {
    border-radius: 12px;
  }

  /* The wheel, or the custom color with a rim of the wheel around it. */
  .more {
    background:
      radial-gradient(circle, var(--c, transparent) 0 58%, transparent 60%),
      conic-gradient(#e27a7a, #e2c27a, #8fce86, #7ac8e2, #8f8ae2, #e27ad0, #e27a7a);
  }

  /* The side room holds half a knob at the ends, so the panel never scrolls sideways. */
  .custom {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    padding: 4px 12px 8px;
  }

  .square {
    position: relative;
    height: 132px;
    border-radius: 12px;
    background:
      linear-gradient(to top, #000, transparent),
      linear-gradient(to right, #fff, var(--hue));
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
    touch-action: none;
    cursor: crosshair;
  }

  .hue {
    position: relative;
    height: 22px;
    border-radius: 999px;
    background: linear-gradient(to right, #f00, #ff0 16.7%, #0f0 33.3%, #0ff 50%, #00f 66.7%, #f0f 83.3%, #f00);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
    touch-action: none;
    cursor: pointer;
  }

  .knob {
    position: absolute;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--c);
    border: 2px solid #fff;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.5);
    translate: -50% -50%;
    pointer-events: none;
  }

  .hue .knob {
    top: 50%;
  }

  .square:focus-visible,
  .hue:focus-visible {
    outline: 2px solid var(--paper);
    outline-offset: 3px;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .preview {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.18);
  }

  .hex {
    flex: 1;
    width: 100%;
    min-width: 0;
    height: 40px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--line-2);
    background: var(--ink-2);
    color: var(--paper);
    font: 15px/1 ui-monospace, 'Cascadia Mono', Menlo, monospace;
    text-transform: lowercase;
  }

  .hex:focus {
    outline: none;
    border-color: var(--paper-3);
  }

  .done {
    flex: none;
    min-height: 40px;
    padding: 0 14px;
  }
</style>
