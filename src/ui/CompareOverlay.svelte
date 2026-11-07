<script lang="ts">
  /** Draggable before/after divider. It enters as a curtain that crosses the photo once. */
  import { onDestroy, onMount } from 'svelte';
  import { reducedMotion } from './motion';
  import { engine, ui } from './state.svelte';

  const e = engine();
  let x = $state(1);
  let dragging = false;
  let raf = 0;

  function set(v: number) {
    x = Math.min(1, Math.max(0, v));
    e.setSplit(x);
  }

  onMount(() => {
    if (reducedMotion()) {
      set(0.5);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - (1 - t) ** 3;
      set(1 - eased * 0.5);
      if (t < 1 && !dragging) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    e.setSplit(-1);
  });

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

<div class="line" style:left="{x * 100}%">
  <span class="tag before">Antes</span>
  <span class="tag after">Depois</span>
  <button
    type="button"
    class="handle"
    aria-label="Mover divisão antes e depois"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={() => (dragging = false)}
    onpointercancel={() => (dragging = false)}
    onkeydown={(ev) => {
      if (ev.key === 'ArrowLeft') set(x - 0.02);
      if (ev.key === 'ArrowRight') set(x + 0.02);
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
    top: 0;
    bottom: 0;
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
    top: calc(var(--bar-h) + var(--safe-top) + 12px);
    padding: 2px 10px;
    border-radius: 999px;
    background: rgb(11 11 12 / 0.6);
    font-family: var(--serif);
    font-style: italic;
    font-size: 16px;
    white-space: nowrap;
  }

  .before {
    right: 10px;
  }

  .after {
    left: 10px;
  }
</style>
