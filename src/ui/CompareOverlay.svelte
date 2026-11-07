<script lang="ts">
  /** Draggable before/after divider, kept on the photo. It enters as a curtain that stops at the center. */
  import { onDestroy, onMount } from 'svelte';
  import { reducedMotion } from './motion';
  import { engine, ui } from './state.svelte';

  /** Room needed by a label beside the divider. */
  const TAG_ROOM = 96;

  const e = engine();
  let dragging = false;
  let raf = 0;

  /** The photo on screen, limited to the area left free by the panels. */
  function photoBox() {
    const [x0, y0] = e.outputToCss(0, 0);
    const [x1, y1] = e.outputToCss(1, 1);
    const vp = e.viewport;
    const dpr = e.dpr;
    const left = Math.max(x0, vp.left / dpr);
    const right = Math.min(x1, (vp.w - vp.right) / dpr);
    const top = Math.max(y0, vp.top / dpr);
    const bottom = Math.min(y1, (vp.h - vp.bottom) / dpr);
    return { left, right, top, bottom, width: vp.w / dpr };
  }

  const box = $derived((ui.rev, photoBox()));
  const lineX = $derived(ui.splitX * box.width);
  const beforeLabel = $derived(ui.compareScope === 'filter' ? 'Sem filtro' : 'Antes');
  const afterLabel = $derived(ui.compareScope === 'filter' ? ui.filterName : 'Depois');

  function set(v: number) {
    const b = photoBox();
    ui.splitX = Math.min(b.right / b.width, Math.max(b.left / b.width, v));
  }

  onMount(() => {
    const b = photoBox();
    const center = (b.left + b.right) / 2 / b.width;
    const edge = b.right / b.width;
    if (reducedMotion()) {
      set(center);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      set(edge + (center - edge) * (1 - (1 - t) ** 3));
      if (t < 1 && !dragging) raf = requestAnimationFrame(step);
    };
    set(edge);
    raf = requestAnimationFrame(step);
  });

  onDestroy(() => cancelAnimationFrame(raf));

  function down(ev: PointerEvent) {
    dragging = true;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  }

  function move(ev: PointerEvent) {
    if (!dragging) return;
    const r = e.canvas.getBoundingClientRect();
    set((ev.clientX - r.left) / r.width);
  }
</script>

<div class="line" data-testid="compare-line" style:left="{lineX}px" style:top="{box.top}px" style:height="{box.bottom - box.top}px">
  <span class="tag before" class:hidden={lineX - box.left < TAG_ROOM}>{beforeLabel}</span>
  <span class="tag after" class:hidden={box.right - lineX < TAG_ROOM}>{afterLabel}</span>
  <button
    type="button"
    class="handle"
    aria-label="Mover divisão antes e depois"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={() => (dragging = false)}
    onpointercancel={() => (dragging = false)}
    onkeydown={(ev) => {
      if (ev.key === 'ArrowLeft') set(ui.splitX - 0.02);
      if (ev.key === 'ArrowRight') set(ui.splitX + 0.02);
      if (ev.key === 'Escape') ui.splitOn = false;
    }}
  >
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />
    </svg>
  </button>
</div>

<style>
  .line {
    position: absolute;
    width: 1.5px;
    margin-left: -0.75px;
    background: var(--paper);
    box-shadow: 0 0 12px rgb(0 0 0 / 0.5);
    z-index: 4;
    pointer-events: none;
  }

  .handle {
    position: absolute;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--paper);
    color: var(--ink);
    pointer-events: auto;
    touch-action: none;
    cursor: ew-resize;
    transition: scale var(--t-fast) var(--ease-reveal);
  }

  .handle:active {
    scale: 1.1;
  }

  .tag {
    position: absolute;
    top: 10px;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgb(11 11 12 / 0.6);
    font-family: var(--serif);
    font-style: italic;
    font-size: 16px;
    white-space: nowrap;
    transition: opacity var(--t-fast);
  }

  .tag.hidden {
    opacity: 0;
  }

  .before {
    right: 10px;
  }

  .after {
    left: 10px;
  }
</style>
