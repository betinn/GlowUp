<script lang="ts">
  /**
   * A small ring on each spot that Manchas healed, while the automatic mode keeps the brush away. A tap
   * on a ring takes that one correction back and keeps the others, as one undo step.
   */
  import { scale } from 'svelte/transition';
  import type { HealOp } from '../core/doc';
  import { reducedMotion } from './motion';
  import { bump, engine, ui } from './state.svelte';

  /** A ring is never smaller than this on screen, so it can be seen. The button around it is a finger wide. */
  const MIN_RING = 14;
  const MIN_TARGET = 32;

  const e = engine();

  const rings = $derived.by(() => {
    void ui.rev;
    const { width, height } = e.doc;
    const long = Math.max(width, height);
    const k = e.cssPerImagePixel * long;
    return e.doc.heals.flatMap((op, i) => {
      if (op.dabs.length === 0) return [];
      const u = op.dabs.reduce((s, d) => s + d.u, 0) / op.dabs.length;
      const v = op.dabs.reduce((s, d) => s + d.v, 0) / op.dabs.length;
      const reach = Math.max(...op.dabs.map((d) => Math.hypot((d.u - u) * width, (d.v - v) * height) / long + d.r));
      const [x, y] = e.imageToCss(u, v);
      // A spot left out by the crop has no ring.
      const [s, t] = e.cssToOutput(x, y);
      if (s < 0 || s > 1 || t < 0 || t > 1) return [];
      const ring = Math.max(MIN_RING, reach * k * 2);
      return [{ op, n: i + 1, x, y, ring, target: Math.max(MIN_TARGET, ring) }];
    });
  });

  function remove(op: HealOp) {
    if (e.removeHeal(op)) bump();
  }

  const pop = (node: Element) => scale(node, { duration: reducedMotion() ? 0 : 220, start: 0.4 });
</script>

<div class="spots" role="group" aria-label="Manchas corrigidas">
  {#each rings as r (r.op)}
    <button
      type="button"
      class="spot"
      data-testid="heal-spot"
      aria-label="Tirar a correção {r.n} de {rings.length}"
      title="Tirar só esta correção"
      style:left="{r.x}px"
      style:top="{r.y}px"
      style:width="{r.target}px"
      style:height="{r.target}px"
      style:--ring="{r.ring}px"
      onclick={() => remove(r.op)}
      transition:pop
    ></button>
  {/each}
</div>

<style>
  .spots {
    position: absolute;
    inset: 0;
    z-index: 3;
    overflow: hidden;
    pointer-events: none;
  }

  .spot {
    position: absolute;
    translate: -50% -50%;
    border-radius: 50%;
    pointer-events: auto;
  }

  /* The ring itself, at the size of the healed spot. The button around it may be larger. */
  .spot::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--ring);
    height: var(--ring);
    translate: -50% -50%;
    border-radius: 50%;
    border: 1.5px solid rgb(255 255 255 / 0.7);
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.35),
      inset 0 0 0 1px rgb(0 0 0 / 0.2);
    transition:
      border-color var(--t-fast),
      background var(--t-fast),
      scale var(--t-fast) var(--ease-reveal);
  }

  /* A cross shows what a tap does. */
  .spot::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 10px;
    height: 10px;
    translate: -50% -50%;
    opacity: 0;
    background:
      linear-gradient(45deg, transparent 43%, var(--paper) 43% 57%, transparent 57%),
      linear-gradient(-45deg, transparent 43%, var(--paper) 43% 57%, transparent 57%);
    filter: drop-shadow(0 0 1px rgb(0 0 0 / 0.8));
    transition: opacity var(--t-fast);
  }

  .spot:hover::before,
  .spot:focus-visible::before {
    border-color: var(--safe);
    background: rgb(0 0 0 / 0.18);
    scale: 1.12;
  }

  .spot:hover::after,
  .spot:focus-visible::after {
    opacity: 1;
  }
</style>
