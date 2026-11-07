<script lang="ts">
  /** On-photo control for the focus area. Drag the center to move it, the ring to resize. */
  import { bump, engine, ui } from './state.svelte';

  const e = engine();
  const blur = $derived((ui.rev, { ...e.doc.blur }));

  const geo = $derived.by(() => {
    void ui.rev;
    const [x, y] = e.outputToCss(blur.cx, blur.cy);
    const out = e.displaySize;
    const r = blur.focus * Math.max(out.w, out.h) * e.cssPerImagePixel;
    return { x, y, r };
  });

  let drag: 'center' | 'ring' | null = null;

  function down(ev: PointerEvent, kind: 'center' | 'ring') {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    drag = kind;
  }

  function move(ev: PointerEvent) {
    if (!drag) return;
    const rect = e.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (drag === 'center') {
      const [s, t] = e.cssToOutput(x, y);
      e.setBlur({ cx: Math.min(1, Math.max(0, s)), cy: Math.min(1, Math.max(0, t)) });
    } else {
      const out = e.displaySize;
      const px = Math.hypot(x - geo.x, y - geo.y);
      e.setBlur({ focus: Math.min(0.7, Math.max(0.01, px / e.cssPerImagePixel / Math.max(out.w, out.h))) });
    }
    bump();
  }

  function up() {
    drag = null;
    e.commit();
  }
</script>

{#if blur.mode !== 'off'}
  <div class="focus" class:tilt={blur.mode === 'tilt'} style:left="{geo.x}px" style:top="{geo.y}px" style:--r="{geo.r}px" style:--angle="{blur.angle}deg">
    <span class="shape"></span>
    <button
      type="button"
      class="ring"
      aria-label="Ajustar área em foco"
      onpointerdown={(ev) => down(ev, 'ring')}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    ></button>
    <button
      type="button"
      class="center"
      aria-label="Mover foco"
      onpointerdown={(ev) => down(ev, 'center')}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    ></button>
  </div>
{/if}

<style>
  .focus {
    position: absolute;
    width: 0;
    height: 0;
    z-index: 4;
    rotate: var(--angle, 0deg);
  }

  .focus:not(.tilt) {
    rotate: 0deg;
  }

  .shape {
    position: absolute;
    left: calc(var(--r) * -1);
    top: calc(var(--r) * -1);
    width: calc(var(--r) * 2);
    height: calc(var(--r) * 2);
    border-radius: 50%;
    border: 1px dashed rgb(255 255 255 / 0.7);
    pointer-events: none;
  }

  .tilt .shape {
    left: -150vmax;
    width: 300vmax;
    border-radius: 0;
    border-width: 1px 0;
  }

  .center {
    position: absolute;
    left: -22px;
    top: -22px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    touch-action: none;
    cursor: move;
  }

  .center::after {
    content: '';
    position: absolute;
    inset: 15px;
    border-radius: 50%;
    background: var(--paper);
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4);
  }

  .ring {
    position: absolute;
    left: calc(var(--r) - 22px);
    top: -22px;
    width: 44px;
    height: 44px;
    touch-action: none;
    cursor: ew-resize;
  }

  .tilt .ring {
    left: -22px;
    top: calc(var(--r) - 22px);
    cursor: ns-resize;
  }

  .ring::after {
    content: '';
    position: absolute;
    inset: 17px;
    border-radius: 50%;
    border: 1.5px solid var(--paper);
    background: var(--ink);
  }
</style>
