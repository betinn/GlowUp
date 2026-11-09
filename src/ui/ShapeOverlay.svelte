<script lang="ts">
  /**
   * Over the photo while a tool of the face menu is open: a ring on each face when there are several, and on
   * request thin lines over what the detector found. Thin on purpose: a tint would hide the real edge. The
   * lines follow the warp, so they show what the sliders move.
   */
  import type { Point } from '../core/face/mask';
  import { shapePick } from './shapepick.svelte';
  import { bump, engine, ui } from './state.svelte';

  const e = engine();

  const toCss = ([u, v]: Point) => e.imageToCss(u, v).join(',');
  const line = (points: readonly Point[], closed = false) => points.map(toCss).join(' ') + (closed && points.length ? ` ${toCss(points[0])}` : '');

  const drawing = $derived.by(() => {
    void ui.rev;
    if (!shapePick.showing) return [];
    return shapePick.faces.flatMap((face) => [
      line(face.outline, true),
      ...face.parts.eyes.map((eye) => line(eye, true)),
      ...face.parts.irises.map((ring) => line(ring, true)),
      ...(face.parts.brows ?? []).map((brow) => line(brow, true)),
      line(face.parts.outerLips, true),
      line(face.parts.midline ?? []),
    ]);
  });

  const rings = $derived.by(() => {
    void ui.rev;
    if (shapePick.faces.length < 2 || shapePick.state !== 'on') return [];
    return shapePick.faces.map((face, i) => {
      const { x, y, w, h } = face.box;
      const [cx, cy] = e.imageToCss(x + w / 2, y + h / 2);
      const [lx, ly] = e.imageToCss(x, y);
      const [rx, ry] = e.imageToCss(x + w, y + h);
      return { i, cx, cy, w: Math.max(Math.abs(rx - lx) * 1.3, 44), h: Math.max(Math.abs(ry - ly) * 1.3, 44) };
    });
  });
</script>

{#if drawing.length}
  <svg class="lines" aria-hidden="true" data-testid="detect-lines">
    {#each drawing as points, i (i)}
      <polyline {points} />
    {/each}
  </svg>
{/if}

{#if rings.length}
  <div class="faces" role="group" aria-label="Rostos encontrados">
    {#each rings as r (r.i)}
      <button
        type="button"
        class="ring"
        class:on={shapePick.chosen === r.i}
        aria-label="Mexer no rosto {r.i + 1} de {rings.length}"
        style:left="{r.cx}px"
        style:top="{r.cy}px"
        style:width="{r.w}px"
        style:height="{r.h}px"
        onclick={() => {
          shapePick.chosen = r.i;
          bump();
        }}
      ></button>
    {/each}
  </div>
{/if}

<style>
  .lines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 4;
    pointer-events: none;
  }

  polyline {
    fill: none;
    stroke: rgb(115 242 255);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

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
    border: 1.5px solid rgb(255 255 255 / 0.55);
    pointer-events: auto;
  }

  .ring.on {
    border-color: var(--safe);
  }
</style>
