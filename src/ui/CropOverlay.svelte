<script lang="ts">
  /** Crop frame over the full rotated photo. Corners resize, the inside moves. */
  import { onDestroy, onMount } from 'svelte';
  import { constrainCrop, rotatedBounds, type Crop } from '../core/geometry';
  import { bump, engine, ui } from './state.svelte';

  const e = engine();
  const crop = $derived((ui.rev, e.doc.crop));
  let ratio = $state<number | null>(null);

  const bounds = $derived(rotatedBounds(e.doc.width, e.doc.height, crop));

  /** Crop rectangle in CSS pixels. */
  const box = $derived.by(() => {
    void ui.rev;
    const b = bounds;
    const s0 = (crop.cx - crop.cw / 2 + b.w / 2) / b.w;
    const t0 = (crop.cy - crop.ch / 2 + b.h / 2) / b.h;
    const s1 = (crop.cx + crop.cw / 2 + b.w / 2) / b.w;
    const t1 = (crop.cy + crop.ch / 2 + b.h / 2) / b.h;
    const [x0, y0] = e.outputToCss(s0, t0);
    const [x1, y1] = e.outputToCss(s1, t1);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });

  type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
  let drag: { handle: Handle; start: Crop; x: number; y: number } | null = null;

  function aspectChange(ev: Event) {
    const id = (ev as CustomEvent<string>).detail;
    ratio = id === 'free' ? null : crop.cw / crop.ch;
  }

  onMount(() => window.addEventListener('glowup:crop-aspect', aspectChange));
  onDestroy(() => window.removeEventListener('glowup:crop-aspect', aspectChange));

  function down(ev: PointerEvent, handle: Handle) {
    ev.stopPropagation();
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    drag = { handle, start: { ...crop }, x: ev.clientX, y: ev.clientY };
  }

  function move(ev: PointerEvent) {
    if (!drag) return;
    const b = bounds;
    const [a0, b0] = e.cssToOutput(drag.x, drag.y);
    const [a1, b1] = e.cssToOutput(ev.clientX, ev.clientY);
    const dx = (a1 - a0) * b.w;
    const dy = (b1 - b0) * b.h;
    const s = drag.start;
    let next: Crop;
    if (drag.handle === 'move') {
      next = { ...s, cx: s.cx + dx, cy: s.cy + dy };
    } else {
      const west = drag.handle.includes('w');
      const north = drag.handle.includes('n');
      let w = s.cw + (west ? -dx : dx);
      let h = s.ch + (north ? -dy : dy);
      const min = Math.max(e.doc.width, e.doc.height) * 0.04;
      w = Math.max(min, w);
      h = Math.max(min, h);
      if (ratio) {
        if (w / h > ratio) h = w / ratio;
        else w = h * ratio;
      }
      const fixedX = s.cx + (west ? s.cw / 2 : -s.cw / 2);
      const fixedY = s.cy + (north ? s.ch / 2 : -s.ch / 2);
      next = { ...s, cw: w, ch: h, cx: fixedX + (west ? -w / 2 : w / 2), cy: fixedY + (north ? -h / 2 : h / 2) };
    }
    e.setCrop(constrainCrop(next, e.doc.width, e.doc.height));
    bump();
  }

  function up() {
    drag = null;
    e.commit();
  }
</script>

<div class="frame" style:left="{box.x}px" style:top="{box.y}px" style:width="{box.w}px" style:height="{box.h}px">
  <button
    type="button"
    class="body"
    aria-label="Mover recorte"
    onpointerdown={(ev) => down(ev, 'move')}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  ></button>
  <span class="grid"></span>
  {#each ['nw', 'ne', 'sw', 'se'] as const as h (h)}
    <button
      type="button"
      class="corner {h}"
      aria-label="Redimensionar recorte"
      onpointerdown={(ev) => down(ev, h)}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    ></button>
  {/each}
</div>

<style>
  .frame {
    position: absolute;
    z-index: 4;
    box-shadow: 0 0 0 100vmax rgb(11 11 12 / 0.62);
    outline: 1px solid var(--paper);
    pointer-events: none;
  }

  .body {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: auto;
    touch-action: none;
    cursor: move;
  }

  .grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(to right, transparent calc(33.33% - 0.5px), rgb(255 255 255 / 0.35) 33.33%, transparent calc(33.33% + 0.5px)),
      linear-gradient(to right, transparent calc(66.66% - 0.5px), rgb(255 255 255 / 0.35) 66.66%, transparent calc(66.66% + 0.5px)),
      linear-gradient(to bottom, transparent calc(33.33% - 0.5px), rgb(255 255 255 / 0.35) 33.33%, transparent calc(33.33% + 0.5px)),
      linear-gradient(to bottom, transparent calc(66.66% - 0.5px), rgb(255 255 255 / 0.35) 66.66%, transparent calc(66.66% + 0.5px));
  }

  .corner {
    position: absolute;
    width: 44px;
    height: 44px;
    pointer-events: auto;
    touch-action: none;
  }

  .corner::after {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    border: 0 solid var(--paper);
  }

  .nw {
    left: -22px;
    top: -22px;
    cursor: nwse-resize;
  }

  .nw::after {
    left: 21px;
    top: 21px;
    border-width: 3px 0 0 3px;
  }

  .ne {
    right: -22px;
    top: -22px;
    cursor: nesw-resize;
  }

  .ne::after {
    right: 21px;
    top: 21px;
    border-width: 3px 3px 0 0;
  }

  .sw {
    left: -22px;
    bottom: -22px;
    cursor: nesw-resize;
  }

  .sw::after {
    left: 21px;
    bottom: 21px;
    border-width: 0 0 3px 3px;
  }

  .se {
    right: -22px;
    bottom: -22px;
    cursor: nwse-resize;
  }

  .se::after {
    right: 21px;
    bottom: 21px;
    border-width: 0 3px 3px 0;
  }
</style>
