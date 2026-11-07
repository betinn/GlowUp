<script lang="ts">
  /** Percentage, current step and a line of light that moves with the real progress. */
  import { onDestroy, onMount } from 'svelte';
  import { reducedMotion } from './motion';
  import type { Task } from './task.svelte';

  let { task, title, note = '' }: { task: Task; title: string; note?: string } = $props();

  let shown = $state(0);
  let frame = 0;
  let last = 0;

  /**
   * Number and bar glide together to the real value, so a jump between stages reads as a count.
   * The glide follows the clock, not the frames: after a blocking step it catches up at once.
   */
  function step(now: number) {
    const gap = task.value - shown;
    const close = Math.abs(gap) < 0.002;
    shown = close ? task.value : shown + gap * (1 - Math.exp((last - now) / (task.done ? 50 : 110)));
    last = now;
    frame = requestAnimationFrame(step);
  }

  const calm = reducedMotion();

  onMount(() => {
    if (calm) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  });

  onDestroy(() => cancelAnimationFrame(frame));

  const current = $derived(calm ? task.value : shown);
  const percent = $derived(Math.round(current * 100));
  const arrived = $derived(task.done && percent === 100);
  const stepLabel = $derived(arrived ? task.doneLabel : task.label);
  const message = $derived(task.slow ? 'Foto grande leva um tempinho. Tá tudo certo.' : note);
</script>

<div
  class="card"
  class:done={arrived}
  role="progressbar"
  aria-label={title}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={Math.round(task.value * 100)}
  aria-valuetext="{Math.round(task.value * 100)}%, {stepLabel}"
>
  <div class="head">
    <span class="serif percent"><span class="digits">{percent}</span><small>%</small></span>
    <span class="step">
      {#if arrived}
        <svg class="tick" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12.5 10 17.5 19 7" pathLength="1" />
        </svg>
      {/if}
      <span>{stepLabel}{#if task.detail}<span class="detail">, {task.detail}</span>{/if}</span>
    </span>
  </div>
  <div class="track" style:--p={current}>
    <div class="fill"><span class="sheen"></span></div>
    <div class="rail"><span class="spark"></span></div>
  </div>
  {#if message}
    <p class="note">{message}</p>
  {/if}
</div>

<style>
  .card {
    width: 100%;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
  }

  .percent {
    font-size: 56px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: var(--paper);
  }

  .percent small {
    font-size: 26px;
    margin-left: 2px;
    color: var(--paper-2);
  }

  .step {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    text-align: right;
    font-size: 14px;
    color: var(--paper-2);
  }

  .detail {
    color: var(--paper-3);
    font-variant-numeric: tabular-nums;
  }

  .done .step {
    color: var(--safe);
  }

  .tick path {
    stroke-dasharray: 1;
    animation: draw var(--t-mid) var(--ease-reveal) both;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  .track {
    position: relative;
    height: 3px;
    margin-top: 12px;
    border-radius: 999px;
    background: var(--ink-3);
  }

  .fill {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    background: linear-gradient(90deg, rgb(255 184 119 / 0.3), var(--safe));
    transform-origin: left;
    transform: scaleX(var(--p));
  }

  /* Keeps moving even if the percentage waits for a slow step: the job is alive. */
  .sheen {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.75), transparent);
    transform: translateX(-100%);
    animation: sheen 1.5s var(--ease-swift) infinite;
  }

  @keyframes sheen {
    to {
      transform: translateX(100%);
    }
  }

  .rail {
    position: absolute;
    inset: 0;
    transform: translateX(calc(var(--p) * 100%));
    pointer-events: none;
  }

  .spark {
    position: absolute;
    left: -4px;
    top: -2.5px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--paper);
    box-shadow:
      0 0 8px 2px var(--safe),
      0 0 22px 6px rgb(255 184 119 / 0.4);
    transition:
      scale var(--t-slow) var(--ease-reveal),
      opacity var(--t-slow) var(--ease-reveal);
  }

  .done .spark {
    scale: 2.6;
    opacity: 0;
  }

  .done .sheen {
    animation: none;
  }

  .note {
    margin-top: 12px;
    font-size: 13px;
    color: var(--paper-2);
  }
</style>
