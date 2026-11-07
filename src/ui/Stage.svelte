<script lang="ts">
  /** Pointer handling on the canvas: one finger paints, two fingers move and zoom. */
  import { onDestroy, onMount } from 'svelte';
  import { bump, engine, hasEngine, ui } from './state.svelte';

  let { canvas = $bindable() }: { canvas?: HTMLCanvasElement } = $props();

  type Mode = 'idle' | 'stroke' | 'pan' | 'pinch';

  const pointers = new Map<number, { x: number; y: number }>();
  let mode: Mode = 'idle';
  let spaceDown = false;
  let strokeStart = 0;
  let lastDist = 0;
  let lastMid: [number, number] = [0, 0];
  let lastPan: [number, number] = [0, 0];

  let cursorEl = $state<HTMLDivElement>();
  let cursorVisible = $state(false);
  let previewing = $state(false);
  let lastCursor: [number, number] = [0, 0];
  let hovering = false;

  const paintable = () => hasBrush() && !spaceDown;
  const showRing = $derived((ui.rev, ui.tool !== null && (cursorVisible || previewing) && hasBrush()));

  function hasBrush() {
    return hasEngine() && engine().mode !== 'none' && !engine().brushOff;
  }

  const paintCursor = $derived((ui.rev, ui.tool !== null && hasBrush()));

  const rel = (e: PointerEvent | WheelEvent): [number, number] => {
    const r = canvas!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const pressure = (e: PointerEvent) => (e.pointerType === 'pen' ? Math.max(e.pressure, 0.05) : 1);

  function placeCursor(x: number, y: number) {
    lastCursor = [x, y];
    if (!cursorEl) return;
    const e = engine();
    const r = Math.max(e.brushScreenRadius, 2);
    cursorEl.style.transform = `translate(${x}px, ${y}px)`;
    cursorEl.style.setProperty('--r', `${r}px`);
    cursorEl.style.setProperty('--inner', `${Math.max(e.brush.hardness, 0.04)}`);
  }

  function centerPreview() {
    if (!canvas) return;
    const e = engine();
    const vp = e.viewport;
    const dpr = e.dpr;
    placeCursor((vp.left + (vp.w - vp.left - vp.right) / 2) / dpr, (vp.top + (vp.h - vp.top - vp.bottom) / 2) / dpr);
  }

  function down(ev: PointerEvent) {
    const e = engine();
    if (!e.loaded) return;
    // A touch on the photo takes the view back from any flight.
    e.stopFlight();
    canvas!.setPointerCapture(ev.pointerId);
    const [x, y] = rel(ev);
    pointers.set(ev.pointerId, { x, y });
    if (pointers.size === 2) {
      if (mode === 'stroke') {
        // A second finger means the first touch was a gesture, not a stroke.
        if (performance.now() - strokeStart < 250) e.cancelStroke();
        else void e.endStroke();
        ui.painting = false;
      }
      mode = 'pinch';
      startPinch();
      return;
    }
    if (pointers.size > 2) return;
    if (ev.button === 1 || ev.button === 2 || spaceDown || !paintable()) {
      mode = 'pan';
      lastPan = [x, y];
      return;
    }
    mode = 'stroke';
    strokeStart = performance.now();
    e.beginStroke(x, y, pressure(ev));
    ui.painting = e.stroking;
    placeCursor(x, y);
    cursorVisible = true;
  }

  function startPinch() {
    const [a, b] = [...pointers.values()];
    lastDist = Math.hypot(a.x - b.x, a.y - b.y);
    lastMid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
  }

  function move(ev: PointerEvent) {
    const e = engine();
    const [x, y] = rel(ev);
    if (ev.pointerType === 'mouse' || ev.pointerType === 'pen' || mode === 'stroke') {
      placeCursor(x, y);
      hovering = true;
      if (ev.pointerType !== 'touch') cursorVisible = true;
    }
    const known = pointers.get(ev.pointerId);
    if (!known) return;
    known.x = x;
    known.y = y;
    if (mode === 'stroke') {
      const events = ev.getCoalescedEvents?.() ?? [];
      if (events.length > 1) {
        for (const c of events) {
          const [cx, cy] = rel(c);
          e.moveStroke(cx, cy, pressure(c));
        }
      } else {
        e.moveStroke(x, y, pressure(ev));
      }
    } else if (mode === 'pan') {
      e.panBy(x - lastPan[0], y - lastPan[1]);
      lastPan = [x, y];
    } else if (mode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid: [number, number] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (lastDist > 0) e.zoomBy(mid[0], mid[1], dist / lastDist);
      e.panBy(mid[0] - lastMid[0], mid[1] - lastMid[1]);
      lastDist = dist;
      lastMid = mid;
    }
  }

  function up(ev: PointerEvent) {
    const e = engine();
    pointers.delete(ev.pointerId);
    if (mode === 'stroke') {
      void e.endStroke().then(bump);
      ui.painting = false;
      if (ev.pointerType === 'touch') cursorVisible = false;
      mode = 'idle';
    } else if (mode === 'pinch') {
      if (pointers.size === 0) mode = 'idle';
      else if (pointers.size === 1) {
        // The remaining finger keeps moving the photo, never paints.
        const [p] = [...pointers.values()];
        lastPan = [p.x, p.y];
        mode = 'pan';
      }
    } else if (pointers.size === 0) {
      mode = 'idle';
    }
  }

  function wheel(ev: WheelEvent) {
    ev.preventDefault();
    const e = engine();
    const [x, y] = rel(ev);
    if (ev.ctrlKey || ev.metaKey || Math.abs(ev.deltaY) >= 40) {
      const k = ev.ctrlKey ? 0.012 : 0.0022;
      e.zoomBy(x, y, Math.exp(-ev.deltaY * k));
    } else {
      e.panBy(-ev.deltaX, -ev.deltaY);
    }
  }

  function dblclick(ev: MouseEvent) {
    const e = engine();
    if (e.mode !== 'none') return;
    if (e.view.zoom > 1.05) e.resetView();
    else e.zoomBy(ev.offsetX, ev.offsetY, 3);
  }

  function keydown(ev: KeyboardEvent) {
    // Space keeps its normal meaning on buttons and fields.
    const free = ev.target === document.body || ev.target === canvas;
    if (ev.code === 'Space' && free) {
      spaceDown = true;
      ev.preventDefault();
    }
  }

  function keyup(ev: KeyboardEvent) {
    if (ev.code === 'Space') spaceDown = false;
  }

  function preview(ev: Event) {
    const on = (ev as CustomEvent<boolean>).detail;
    previewing = on;
    if (on) centerPreview();
    else if (hovering) placeCursor(lastCursor[0], lastCursor[1]);
  }

  onMount(() => {
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('glowup:brush-preview', preview);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    window.removeEventListener('glowup:brush-preview', preview);
  });

  $effect(() => {
    void ui.rev;
    if (cursorEl) placeCursor(lastCursor[0], lastCursor[1]);
  });
</script>

<canvas
  bind:this={canvas}
  class:paint={paintCursor}
  aria-label="Foto em edição"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onpointerleave={() => {
    hovering = false;
    if (mode !== 'stroke') cursorVisible = false;
  }}
  onwheel={wheel}
  ondblclick={dblclick}
  oncontextmenu={(e) => e.preventDefault()}
></canvas>

{#if showRing}
  <div class="cursor" bind:this={cursorEl} class:live={ui.painting} aria-hidden="true">
    <span class="outer"></span>
    <span class="inner"></span>
  </div>
{/if}


<style>
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    cursor: grab;
  }

  canvas:active {
    cursor: grabbing;
  }

  canvas.paint {
    cursor: none;
  }

  .cursor {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 5;
  }

  .outer,
  .inner {
    position: absolute;
    left: 0;
    top: 0;
    border-radius: 50%;
    translate: -50% -50%;
    width: calc(var(--r, 20px) * 2);
    height: calc(var(--r, 20px) * 2);
    transition:
      opacity var(--t-fast),
      scale var(--t-fast) var(--ease-reveal);
  }

  .outer {
    border: 1.5px solid rgb(255 255 255 / 0.95);
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.45),
      inset 0 0 0 1px rgb(0 0 0 / 0.25);
  }

  .inner {
    border: 1px dashed rgb(255 255 255 / 0.55);
    scale: var(--inner, 0.5);
  }

  .live .outer {
    border-color: var(--safe);
  }
</style>
