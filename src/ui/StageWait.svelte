<script lang="ts">
  /**
   * The wait, on the photo itself. While a tap is on its way to the photo, the photo breaks into pieces that lift
   * and settle, wave after wave, with what is being done in words in the middle. When the result is in, the pieces
   * close and leave diagonal by diagonal, and the new photo is under them.
   *
   * Everything that moves here is a CSS animation of transform or opacity, which the browser runs away from the
   * page: a step that holds the page for a second leaves the pieces moving, and that is the whole point. The
   * delay before anything shows is also in the CSS, so a quick result never blinks.
   */
  import { onDestroy, untrack } from 'svelte';
  import { facePick, limitWords, toolLimit } from './facepick.svelte';
  import { reducedMotion } from './motion';
  import { engine, ui } from './state.svelte';
  import { waits } from './wait.svelte';
  import { lastWave, pieces, type Piece } from './waitgrid';

  /** A result this quick shows nothing. The same number is in the CSS below, as `--after`. */
  const SHOW_AFTER = 140;
  /** One diagonal leaves this long after the one before, and each takes `LEAVE` to go. */
  const STEP = 24;
  const LEAVE = 320;

  const e = engine();
  const calm = reducedMotion();

  const asked = $derived(waits.list.at(-1) ?? null);
  const task = $derived(facePick.task);
  /** A tap waits for its result. The photo is covered: there is nothing to do on it until the result lands. */
  const hard = $derived(!!asked || !!task);
  /** The photo catches up with a control, or a short job runs. The photo stays in sight and in use. */
  const soft = $derived(ui.shaping || ui.funShaping || !!ui.busy);
  const softLabel = $derived(ui.busy ?? 'Terminando o ajuste');

  const finding = $derived(toolLimit.state === 'searching' ? (limitWords(toolLimit.tool, toolLimit.region)?.finding ?? null) : null);
  const title = $derived(asked?.label ?? finding ?? task?.label ?? '');
  /** The step of a search, under what was asked for. A search with no other name is its own title. */
  const step = $derived.by(() => {
    if (!task) return '';
    const named = asked || finding;
    return [named ? task.label : '', task.detail].filter(Boolean).join(', ');
  });
  const percent = $derived(task ? Math.round(task.value * 100) : null);

  /** The words stay while the pieces leave, when what was asked for is already gone. */
  let held = $state('');
  $effect(() => {
    if (title) held = title;
  });

  let phase = $state<'off' | 'on' | 'out'>('off');
  let board = $state.raw<Piece[]>([]);
  /** Counts the waits, so the pieces of a new one start their moves from the beginning. */
  let run = $state(0);
  /** The photo as it was when the wait began, which is what the pieces show. */
  let shot: HTMLCanvasElement | null = null;
  let began = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** The photo on screen, limited to the area left free by the panels. */
  function photoBox() {
    const [x0, y0] = e.outputToCss(0, 0);
    const [x1, y1] = e.outputToCss(1, 1);
    const vp = e.viewport;
    const dpr = e.dpr;
    const left = Math.max(x0, vp.left / dpr);
    const top = Math.max(y0, vp.top / dpr);
    const right = Math.min(x1, (vp.w - vp.right) / dpr);
    const bottom = Math.min(y1, (vp.h - vp.bottom) / dpr);
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  const box = $derived((ui.rev, photoBox()));

  /**
   * Copies what the canvas shows of the photo, and says into which pieces it breaks. The canvas keeps its
   * picture only until the browser shows it, so it is drawn again first. No pieces when there is no picture
   * to take: the wait then shows as a veil over the photo.
   */
  function take(): Piece[] {
    shot = null;
    const b = photoBox();
    if (calm || e.exporting || b.width < 24 || b.height < 24) return [];
    const dpr = e.dpr;
    const k = Math.min(dpr, 2);
    const copy = document.createElement('canvas');
    copy.width = Math.round(b.width * k);
    copy.height = Math.round(b.height * k);
    // Kept in memory, not on the graphics card: the canvas is read once, and each piece then copies from here
    // at no cost, where a copy from one card surface to many small ones would be read back piece by piece.
    const g = copy.getContext('2d', { willReadFrequently: true });
    if (!g) return [];
    try {
      e.renderNow();
      g.drawImage(e.canvas, b.left * dpr, b.top * dpr, b.width * dpr, b.height * dpr, 0, 0, copy.width, copy.height);
    } catch {
      return [];
    }
    shot = copy;
    return pieces(b.width, b.height);
  }

  /** Draws the part of the photo a piece holds. */
  function paint(node: HTMLCanvasElement, p: Piece) {
    if (!shot) return;
    node.width = Math.max(1, Math.round(p.w * shot.width));
    node.height = Math.max(1, Math.round(p.h * shot.height));
    node.getContext('2d')?.drawImage(shot, p.x * shot.width, p.y * shot.height, p.w * shot.width, p.h * shot.height, 0, 0, node.width, node.height);
  }

  function start() {
    clearTimeout(timer);
    if (phase === 'on') return;
    began = performance.now();
    board = take();
    run++;
    phase = 'on';
  }

  function end() {
    clearTimeout(timer);
    phase = 'off';
    board = [];
    shot = null;
  }

  function stop() {
    if (phase !== 'on') return;
    // Nothing showed yet, so there is nothing to take away.
    if (performance.now() - began <= SHOW_AFTER) {
      end();
      return;
    }
    phase = 'out';
    timer = setTimeout(end, LEAVE + lastWave(board) * STEP + 60);
  }

  $effect(() => {
    if (hard) untrack(start);
    else untrack(stop);
  });

  onDestroy(() => clearTimeout(timer));

  const place = $derived(`left: ${box.left}px; top: ${box.top}px; width: ${box.width}px; height: ${box.height}px;`);
</script>

{#if soft}
  <!-- A light runs around the photo, which stays in use: the result of the last touch is on its way. -->
  <div class="edge" role="status" aria-label={softLabel} data-testid={ui.busy ? 'photo-busy' : 'shape-pending'} style={place}
    style:--span="{Math.ceil(Math.hypot(box.width, box.height)) + 12}px">
    <span class="beam" aria-hidden="true"><i></i></span>
    {#if phase === 'off'}
      <p class="note"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>{softLabel}</p>
    {/if}
  </div>
{/if}

{#if phase !== 'off'}
  <div class="wait" class:out={phase === 'out'} class:veil={!board.length} role="status" data-testid="photo-wait" data-phase={phase}
    data-pieces={board.length} style={place} style:--step="{STEP}ms" style:--leave="{LEAVE}ms">
    {#key run}
      <div class="board" aria-hidden="true">
        <span class="back"></span>
        {#each board as p (p)}
          <span class="cell" style:left="{p.x * 100}%" style:top="{p.y * 100}%" style:width="{p.w * 100}%" style:height="{p.h * 100}%"
            style:--i={p.wave} style:--dx="{p.dx * 100}%" style:--dy="{p.dy * 100}%" style:--turn="{p.turn}deg">
            <span class="lift"><canvas class="piece" use:paint={p}></canvas></span>
          </span>
        {/each}
        {#if board.length}
          <span class="shine"><i></i></span>
        {/if}
      </div>
      <div class="card">
        {#if percent !== null}
          <span class="serif percent">{percent}<small>%</small></span>
        {/if}
        <p class="serif title">{held}</p>
        <p class="sub">
          {#if task}
            <span>{step || 'Tudo acontece aqui, no seu aparelho.'}</span>
          {:else}
            <span class="first">A foto se monta em instantes.</span>
            <span class="later">Demora um pouco neste aparelho. Nada travou.</span>
          {/if}
        </p>
        <span class="track" style:--p={task ? task.value : 0} class:real={!!task}><i class="fill"></i><i class="runner"></i></span>
      </div>
    {/key}
  </div>
{/if}

<style>
  .wait,
  .edge {
    --after: 140ms;
    position: absolute;
    pointer-events: none;
  }

  .wait {
    z-index: 7;
  }

  .edge {
    z-index: 6;
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* The pieces. Until `--after` they are not in sight, and when they come they sit exactly on the photo. */

  .board {
    position: absolute;
    inset: 0;
    animation: appear 90ms linear var(--after) both;
  }

  .back {
    position: absolute;
    inset: -1px;
    background: var(--ink);
    transition: opacity 220ms var(--ease-swift);
  }

  .cell,
  .lift,
  .piece {
    position: absolute;
    display: block;
    will-change: transform, opacity;
  }

  .lift,
  .piece {
    inset: 0;
    width: 100%;
    height: 100%;
  }

  /* First the photo comes apart: each piece shrinks a little, and the dark shows between them. */
  .cell {
    animation: part 520ms var(--ease-reveal) both;
    animation-delay: calc(var(--after) + var(--i) * 45ms);
  }

  @keyframes part {
    from {
      scale: 1;
    }
    to {
      scale: 0.9;
    }
  }

  /* Then, wave after wave, each one lifts out of its place, turns, and fits back in. */
  .piece {
    border-radius: 9px;
    animation: refit 2.8s var(--ease-swift) infinite;
    animation-delay: calc(var(--after) + 420ms + var(--i) * 150ms);
  }

  @keyframes refit {
    0%,
    46%,
    100% {
      translate: 0 0;
      rotate: 0deg;
      scale: 1;
      opacity: 1;
    }
    16% {
      translate: var(--dx) var(--dy);
      rotate: var(--turn);
      scale: 1.07;
      opacity: 0.62;
    }
    34% {
      translate: 0 0;
      rotate: 0deg;
      scale: 1.02;
      opacity: 1;
    }
  }

  /* A warm light crosses the pieces, in step with the wave. */
  .shine {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .shine i {
    position: absolute;
    inset: -30% -60%;
    background: linear-gradient(115deg, transparent 44%, rgb(255 184 119 / 0.2) 50%, transparent 56%);
    will-change: transform;
    animation: cross 2.8s var(--ease-swift) infinite;
    animation-delay: calc(var(--after) + 420ms);
  }

  @keyframes cross {
    from {
      translate: -55% 0;
    }
    to {
      translate: 55% 0;
    }
  }

  /* The result is in: the dark goes, and the pieces close and leave, one diagonal after the other. */
  .out .back {
    opacity: 0;
  }

  .out .lift {
    animation: leave var(--leave) var(--ease-swift) both;
    animation-delay: calc(var(--i) * var(--step));
  }

  @keyframes leave {
    from {
      scale: 1;
      opacity: 1;
    }
    to {
      scale: 1.11;
      opacity: 0;
    }
  }

  .out .shine {
    display: none;
  }

  /* With no pieces, or for who asked for less motion, a veil dims the photo and the words do the rest. */
  .veil .back {
    opacity: 0.6;
  }

  .veil.out .back {
    opacity: 0;
  }

  /* What is being done, in the middle of the photo, large enough to read at arm's length. */

  .card {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    display: grid;
    justify-items: center;
    gap: 2px;
    width: max-content;
    max-width: min(92%, 320px);
    min-width: min(92%, 208px);
    padding: 14px 22px 18px;
    border-radius: 20px;
    border: 1px solid var(--line-2);
    background: rgb(11 11 12 / 0.9);
    text-align: center;
    animation: settle 300ms var(--ease-reveal) var(--after) both;
    transition: opacity 160ms var(--ease-swift);
  }

  @keyframes settle {
    from {
      opacity: 0;
      scale: 0.92;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }

  .out .card {
    opacity: 0;
    animation: none;
  }

  .percent {
    font-size: 46px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: var(--paper);
  }

  .percent small {
    font-size: 22px;
    margin-left: 2px;
    color: var(--paper-2);
  }

  .title {
    font-style: italic;
    font-size: 25px;
    line-height: 1.15;
    color: var(--paper);
    text-wrap: balance;
  }

  .sub {
    display: grid;
    font-size: 13px;
    line-height: 1.3;
    color: var(--paper-2);
    font-variant-numeric: tabular-nums;
    text-wrap: balance;
  }

  .sub > span {
    grid-area: 1 / 1;
  }

  /* After a while the line changes, with no help from the page, to say that the wait is normal. */
  .first {
    animation: appear 400ms linear 5.6s both reverse;
  }

  .later {
    animation: appear 400ms linear 6s both;
  }

  .track {
    position: relative;
    display: block;
    width: 100%;
    height: 3px;
    margin-top: 12px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--ink-3);
  }

  .fill,
  .runner {
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }

  /* A search fills the line as far as it got. A job with no count has only the light that runs. */
  .fill {
    background: linear-gradient(90deg, rgb(255 184 119 / 0.3), var(--safe));
    transform-origin: left;
    transform: scaleX(0);
  }

  .real .fill {
    transform: scaleX(var(--p));
  }

  .runner {
    background: linear-gradient(90deg, transparent, var(--safe) 45%, #fff 50%, var(--safe) 55%, transparent);
    will-change: transform;
    animation: run 1.3s var(--ease-swift) infinite;
  }

  .real .runner {
    background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.75), transparent);
  }

  @keyframes run {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(100%);
    }
  }

  /* The light around the photo. A ring cut out of a square of light that turns behind it. */

  .edge {
    animation: appear 160ms linear var(--after) both;
  }

  /* Inside the photo: on a phone the photo goes from one side of the screen to the other. */
  .beam {
    position: absolute;
    inset: 0;
    padding: 3px;
    overflow: hidden;
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    mask-composite: exclude;
  }

  .beam i {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--span);
    height: var(--span);
    margin: calc(var(--span) / -2);
    background: conic-gradient(from 0deg, transparent 0 62%, rgb(255 184 119 / 0.5) 80%, var(--safe) 92%, #fff 97%, transparent 100%);
    will-change: transform;
    animation: turn 1.5s linear infinite;
  }

  @keyframes turn {
    to {
      rotate: 1turn;
    }
  }

  .note {
    position: absolute;
    left: 50%;
    top: 12px;
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 92%;
    padding: 9px 16px 9px 14px;
    border-radius: 999px;
    border: 1px solid var(--line-2);
    background: rgb(11 11 12 / 0.86);
    font-size: 14.5px;
    white-space: nowrap;
  }

  .dots {
    display: flex;
    gap: 4px;
  }

  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--safe);
    will-change: transform, opacity;
    animation: hop 900ms var(--ease-swift) infinite;
  }

  .dots i:nth-child(2) {
    animation-delay: 150ms;
  }

  .dots i:nth-child(3) {
    animation-delay: 300ms;
  }

  @keyframes hop {
    0%,
    60%,
    100% {
      translate: 0 0;
      opacity: 0.45;
    }
    30% {
      translate: 0 -5px;
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .beam i,
    .dots i,
    .runner {
      animation: none;
    }

    .beam i {
      background: var(--safe);
      opacity: 0.7;
    }

    .runner {
      display: none;
    }

    .card {
      animation: appear 120ms linear var(--after) both;
    }
  }
</style>
