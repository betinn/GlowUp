<script lang="ts">
  /**
   * Over the photo while Brincar is open: a frame on each sticker, to choose it and move it. One finger or the
   * mouse drags it. Two fingers, or the knob at its corner, turn it and change its size, and so does the wheel.
   * The photo draws the sticker itself; this only holds the frames, which never go into the export.
   */
  import { sourceAt } from '../core/fun/place';
  import { funPick, removeSelected } from './funpick.svelte';
  import Icon from './Icon.svelte';
  import { bump, engine, ui } from './state.svelte';

  const e = engine();

  interface Frame {
    id: number;
    cx: number;
    cy: number;
    w: number;
    h: number;
    /** Degrees, for CSS. */
    turn: number;
  }

  const frames = $derived.by((): Frame[] => {
    void ui.rev;
    return e.shownStickers().map(({ sticker, shown, aspect }) => {
      const { width, height } = e.doc;
      const long = Math.max(width, height);
      const kx = width / long;
      const ky = height / long;
      const half = shown.size / 2;
      const [cx, cy] = e.shownToCss(shown.x, shown.y);
      const [ax, ay] = e.shownToCss(shown.x + (Math.cos(shown.angle) * half) / kx, shown.y + (Math.sin(shown.angle) * half) / ky);
      const w = Math.hypot(ax - cx, ay - cy) * 2;
      return { id: sticker.id, cx, cy, w, h: w * aspect, turn: (Math.atan2(ay - cy, ax - cx) * 180) / Math.PI };
    });
  });

  /** A gesture on a sticker: where it started, and the pointers on it. */
  let gesture: {
    id: number;
    pointers: Map<number, [number, number]>;
    start: { x: number; y: number; size: number; angle: number };
    /** The pointers as they were when the gesture took its current shape. */
    from: Map<number, [number, number]>;
    /** The knob turns and sizes around the middle, as two fingers do. */
    knob: [number, number] | null;
  } | null = null;

  const rel = (ev: PointerEvent | WheelEvent): [number, number] => {
    const r = e.canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };

  const stickerOf = (id: number) => e.doc.fun?.stickers?.find((s) => s.id === id);

  function restart(id: number) {
    const s = stickerOf(id);
    if (!gesture || !s) return;
    gesture.start = { x: s.x, y: s.y, size: s.size, angle: s.angle };
    gesture.from = new Map(gesture.pointers);
  }

  function down(ev: PointerEvent, id: number, knob = false) {
    ev.stopPropagation();
    ev.preventDefault();
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    if (funPick.selected !== id) {
      funPick.selected = id;
      bump();
    }
    if (!gesture || gesture.id !== id) gesture = { id, pointers: new Map(), start: { x: 0, y: 0, size: 0, angle: 0 }, from: new Map(), knob: null };
    gesture.pointers.set(ev.pointerId, rel(ev));
    const f = frames.find((x) => x.id === id);
    gesture.knob = knob && f ? [f.cx, f.cy] : null;
    restart(id);
  }

  /** The middle of a sticker, moved by a drag on the screen, back on the photo as it was opened. */
  function placeAt(x: number, y: number): [number, number] {
    const shown = e.screenToImage(x, y);
    const lookup = e.headLookup();
    return lookup ? sourceAt(shown, lookup) : shown;
  }

  function move(ev: PointerEvent) {
    if (!gesture || !gesture.pointers.has(ev.pointerId)) return;
    ev.stopPropagation();
    gesture.pointers.set(ev.pointerId, rel(ev));
    const { id, start, from, pointers, knob } = gesture;
    const ids = [...pointers.keys()];
    const s = stickerOf(id);
    if (!s) return;
    if (knob || ids.length >= 2) {
      // Around the middle for the knob, around the two fingers for a pinch.
      const [a0, b0] = knob ? [knob, from.get(ids[0])!] : [from.get(ids[0])!, from.get(ids[1])!];
      const [a1, b1] = knob ? [knob, pointers.get(ids[0])!] : [pointers.get(ids[0])!, pointers.get(ids[1])!];
      const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]);
      const d1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
      if (d0 < 4) return;
      const turn = Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) - Math.atan2(b0[1] - a0[1], b0[0] - a0[0]);
      const patch: { size: number; angle: number; x?: number; y?: number } = {
        size: Math.min(2, Math.max(0.01, (start.size * d1) / d0)),
        angle: start.angle + turn,
      };
      if (!knob) {
        // The middle of the sticker goes with the middle of the fingers.
        const f = frames.find((x) => x.id === id);
        const mid0: [number, number] = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
        const mid1: [number, number] = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
        if (f) [patch.x, patch.y] = placeAt(f.cx + mid1[0] - mid0[0], f.cy + mid1[1] - mid0[1]);
        from.set(ids[0], pointers.get(ids[0])!);
        from.set(ids[1], pointers.get(ids[1])!);
        start.size = patch.size;
        start.angle = patch.angle;
      }
      e.changeSticker(id, patch);
      return;
    }
    const p0 = from.get(ids[0])!;
    const p1 = pointers.get(ids[0])!;
    const f = frames.find((x) => x.id === id);
    if (!f) return;
    const [x, y] = placeAt(f.cx + p1[0] - p0[0], f.cy + p1[1] - p0[1]);
    from.set(ids[0], p1);
    e.changeSticker(id, { x, y });
  }

  function up(ev: PointerEvent) {
    if (!gesture || !gesture.pointers.has(ev.pointerId)) return;
    ev.stopPropagation();
    gesture.pointers.delete(ev.pointerId);
    if (gesture.pointers.size) {
      gesture.knob = null;
      restart(gesture.id);
      return;
    }
    gesture = null;
    e.commit();
    bump();
  }

  function wheel(ev: WheelEvent, id: number) {
    ev.preventDefault();
    ev.stopPropagation();
    const s = stickerOf(id);
    if (!s) return;
    e.changeSticker(id, { size: Math.min(2, Math.max(0.01, s.size * Math.exp(-ev.deltaY * 0.0015))) });
    // A turn of the wheel is a gesture of its own, closed when it stops.
    clearTimeout(wheelEnd);
    wheelEnd = setTimeout(() => {
      e.commit();
      bump();
    }, 300);
  }
  let wheelEnd: ReturnType<typeof setTimeout> | undefined;

  function key(ev: KeyboardEvent, id: number) {
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      funPick.selected = id;
      removeSelected(e);
    }
  }
</script>

<div class="stickers" data-testid="sticker-frames">
  {#each frames as f (f.id)}
    <div
      class="frame"
      class:on={funPick.selected === f.id}
      role="button"
      tabindex="0"
      aria-label="Adesivo: arraste para mover, use dois dedos ou a alça para girar e mudar o tamanho"
      data-testid="sticker-frame"
      data-sticker={f.id}
      style:left="{f.cx}px"
      style:top="{f.cy}px"
      style:width="{Math.max(f.w, 24)}px"
      style:height="{Math.max(f.h, 24)}px"
      style:rotate="{f.turn}deg"
      onpointerdown={(ev) => down(ev, f.id)}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onwheel={(ev) => wheel(ev, f.id)}
      onkeydown={(ev) => key(ev, f.id)}
    >
      {#if funPick.selected === f.id}
        <span
          class="knob"
          role="presentation"
          data-testid="sticker-knob"
          onpointerdown={(ev) => down(ev, f.id, true)}
          onpointermove={move}
          onpointerup={up}
          onpointercancel={up}
        ></span>
        <button
          type="button"
          class="drop"
          aria-label="Tirar adesivo"
          data-testid="sticker-drop"
          onpointerdown={(ev) => ev.stopPropagation()}
          onclick={(ev) => {
            ev.stopPropagation();
            removeSelected(e);
          }}><Icon name="close" size={14} /></button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
  .stickers {
    position: absolute;
    inset: 0;
    z-index: 4;
    overflow: hidden;
    pointer-events: none;
  }

  .frame {
    position: absolute;
    translate: -50% -50%;
    border-radius: 6px;
    pointer-events: auto;
    touch-action: none;
    cursor: grab;
  }

  .frame:active {
    cursor: grabbing;
  }

  .frame.on {
    outline: 1.5px dashed rgb(255 255 255 / 0.75);
    outline-offset: 4px;
  }

  .frame:focus-visible {
    outline: 2px solid var(--safe);
    outline-offset: 4px;
  }

  .knob {
    position: absolute;
    right: -14px;
    bottom: -14px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--paper);
    border: 2px solid var(--ink);
    touch-action: none;
    cursor: nwse-resize;
  }

  .drop {
    position: absolute;
    right: -14px;
    top: -14px;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: var(--ink);
    background: var(--paper);
  }
</style>
