<script lang="ts">
  /** The photo develops as it opens: from dark and blurred to sharp, in step with the real progress. */
  import type { TransitionConfig } from 'svelte/transition';
  import ProgressCard from './ProgressCard.svelte';
  import { reducedMotion, reveal } from './motion';
  import type { Opening } from './state.svelte';

  let { opening }: { opening: Opening } = $props();

  const task = $derived(opening.task);
  let broken = $state(false);

  /** A dropped photo travels from where it fell to the center of the screen. */
  function land(node: Element): TransitionConfig {
    const from = opening.from;
    if (!from || reducedMotion()) return reveal(node);
    const r = node.getBoundingClientRect();
    const dx = from.x - (r.left + r.width / 2);
    const dy = from.y - (r.top + r.height / 2);
    return {
      duration: 560,
      easing: (t) => 1 - (1 - t) ** 4,
      css: (t, u) => `opacity: ${Math.min(1, t * 2.5)}; transform: translate(${u * dx}px, ${u * dy}px) scale(${0.45 + 0.55 * t})`,
    };
  }
</script>

<div class="screen" class:done={task.done} data-testid="opening" out:reveal={{ duration: 320, y: 0 }}>
  <div class="glow" aria-hidden="true"></div>
  {#if opening.from}
    <span class="ring" style:left="{opening.from.x}px" style:top="{opening.from.y}px" aria-hidden="true"></span>
  {/if}
  <div class="stack">
    <div class="print" style:--p={task.value} in:land>
      {#if opening.photo && !broken}
        <img src={opening.photo} alt="" draggable="false" onerror={() => (broken = true)} />
      {:else}
        <span class="blank"></span>
      {/if}
    </div>
    <ProgressCard {task} title="Abrindo a foto" note="Tudo acontece aqui, no seu aparelho." />
  </div>
</div>

<style>
  .screen {
    position: fixed;
    inset: 0;
    z-index: 55;
    display: grid;
    place-items: center;
    padding: calc(24px + var(--safe-top)) 24px calc(24px + var(--safe-bottom));
    background: var(--ink);
  }

  .screen.done {
    pointer-events: none;
  }

  .glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(closest-side at 50% 42%, rgb(255 184 119 / 0.1), transparent 70%);
    pointer-events: none;
  }

  .ring {
    position: fixed;
    width: 64px;
    height: 64px;
    margin: -32px 0 0 -32px;
    border-radius: 50%;
    border: 1.5px solid var(--safe);
    opacity: 0;
    animation: ring 760ms var(--ease-reveal);
    pointer-events: none;
  }

  @keyframes ring {
    from {
      opacity: 0.9;
      transform: scale(0.2);
    }
    to {
      opacity: 0;
      transform: scale(6);
    }
  }

  .stack {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 26px;
    width: min(340px, 100%);
  }

  .print {
    display: grid;
    grid-template: 100% / 100%;
    place-items: center;
    width: 100%;
    height: min(320px, 42dvh);
  }

  img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    border-radius: 4px;
    box-shadow: 0 0 0 1px var(--line);
    filter: blur(calc((1 - var(--p)) * 16px)) brightness(calc(0.3 + 0.7 * var(--p))) saturate(calc(0.15 + 0.85 * var(--p)));
    transition: filter 420ms var(--ease-reveal);
  }

  .blank {
    width: 62%;
    height: 100%;
    border-radius: 4px;
    background: var(--ink-3);
    box-shadow: 0 0 0 1px var(--line);
  }
</style>
