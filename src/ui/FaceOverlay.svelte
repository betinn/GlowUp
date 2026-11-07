<script lang="ts">
  /** One ring on each face found. A tap chooses the face that gets the filter. */
  import { chooseFace, facePick } from './facepick.svelte';
  import { engine, ui } from './state.svelte';

  /** Rings stay big enough for a finger, even on a small face. */
  const MIN_RING = 44;
  const PADDING = 1.3;

  const e = engine();

  const rings = $derived.by(() => {
    void ui.rev;
    return facePick.faces.flatMap((face) => {
      const { x, y, w, h } = face.box;
      const corners = [
        e.imageToCss(x, y),
        e.imageToCss(x + w, y),
        e.imageToCss(x, y + h),
        e.imageToCss(x + w, y + h),
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      // The center comes on its own: a local warp can move the face and leave the corners behind.
      const [cx, cy] = e.imageToCss(x + w / 2, y + h / 2);
      // A face left out by the crop has no ring.
      const [s, t] = e.cssToOutput(cx, cy);
      if (s < 0 || s > 1 || t < 0 || t > 1) return [];
      return [{ face, cx, cy, w: Math.max(width * PADDING, MIN_RING), h: Math.max(height * PADDING, MIN_RING) }];
    });
  });
</script>

<div class="faces" role="group" aria-label="Rostos encontrados">
  {#each rings as r, i (r.face)}
    <button
      type="button"
      class="ring"
      data-testid="face-ring"
      aria-label="Escolher rosto {i + 1} de {rings.length}"
      style:left="{r.cx}px"
      style:top="{r.cy}px"
      style:width="{r.w}px"
      style:height="{r.h}px"
      onclick={() => chooseFace(e, r.face)}
    ></button>
  {/each}
</div>

<style>
  .faces {
    position: absolute;
    inset: 0;
    z-index: 4;
    overflow: hidden;
    pointer-events: none;
  }

  .ring {
    position: absolute;
    translate: -50% -50%;
    border-radius: 50%;
    border: 2px solid var(--safe);
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.5),
      inset 0 0 0 1px rgb(0 0 0 / 0.3);
    pointer-events: auto;
    transition:
      background var(--t-fast),
      scale var(--t-fast) var(--ease-reveal);
  }

  .ring:hover,
  .ring:focus-visible {
    background: rgb(255 184 119 / 0.22);
    scale: 1.06;
  }
</style>
