<script lang="ts">
  /** The post as whoever receives it will see it: one slide at a time, sliding sideways, with the dots under it. */
  import { drawPage } from '../../core/post/draw';
  import { pageCount, ratioById, type PostDoc } from '../../core/post/layout';
  import Icon from '../Icon.svelte';
  import { rise } from '../motion';
  import { doc, pictureOf, studio } from './studio.svelte';

  let { onclose }: { onclose: () => void } = $props();

  /** The post as it is when the preview opens. */
  const d = $state.snapshot(doc()) as PostDoc;
  const total = pageCount(d);
  const ratio = ratioById(d.ratio);
  const dpr = Math.min(2, devicePixelRatio || 1);

  let pager = $state<HTMLDivElement>();
  let width = $state(0);
  let at = $state(Math.min(studio.page, total - 1));
  const canvases: HTMLCanvasElement[] = $state([]);

  $effect(() => {
    if (!width) return;
    const cw = Math.round(width * dpr);
    const ch = Math.round(((width * ratio.h) / ratio.w) * dpr);
    for (const [page, canvas] of canvases.entries()) {
      if (!canvas) continue;
      canvas.width = cw;
      canvas.height = ch;
      const c = canvas.getContext('2d');
      if (c) drawPage(c, d, page, cw, ch, pictureOf);
    }
  });

  /** The pager is on the slide the person was looking at. Until then its scroll says nothing. */
  let placed = false;
  $effect(() => {
    if (!width || !pager || placed) return;
    pager.scrollLeft = at * width;
    placed = true;
  });

  const go = (page: number) => {
    if (placed) pager?.scrollTo({ left: page * width, behavior: 'smooth' });
  };

  function scrolled() {
    if (placed && pager) at = Math.round(pager.scrollLeft / Math.max(1, width));
  }
</script>

<svelte:window onkeydown={(ev) => { if (ev.key === 'ArrowRight') go(Math.min(total - 1, at + 1)); else if (ev.key === 'ArrowLeft') go(Math.max(0, at - 1)); }} />

<div class="scrim" role="presentation" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label="Prévia do post" data-testid="post-preview" transition:rise>
  <div class="head">
    <h2 class="serif">Prévia</h2>
    <button type="button" class="icon-btn" aria-label="Fechar" onclick={onclose}><Icon name="close" /></button>
  </div>
  <div class="card" style:--shape="{ratio.w} / {ratio.h}" style:--w={ratio.w} style:--h={ratio.h}>
    <div class="who" aria-hidden="true"><i></i><span>você</span></div>
    <div class="pager" bind:this={pager} bind:clientWidth={width} onscroll={scrolled}>
      {#each { length: total } as _, page (page)}
        <canvas bind:this={canvases[page]} aria-label="Slide {page + 1} de {total}"></canvas>
      {/each}
    </div>
    {#if total > 1}
      <div class="foot">
        <div class="dots" aria-hidden="true">
          {#each { length: total } as _, page (page)}
            <i class:on={page === at}></i>
          {/each}
        </div>
        <span class="count" data-testid="post-preview-count">{at + 1}/{total}</span>
      </div>
    {/if}
  </div>
  <p class="meta">{total > 1 ? 'Deslize para o lado, como no feed.' : 'Assim ela chega no feed.'}</p>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.6);
    z-index: 40;
  }

  .sheet {
    position: fixed;
    left: 50%;
    bottom: 0;
    translate: -50% 0;
    width: min(460px, 100vw);
    max-height: 100dvh;
    padding: 12px 16px calc(16px + var(--safe-bottom));
    background: var(--ink-2);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 20px 20px 0 0;
    z-index: 41;
  }

  @media (min-width: 900px) {
    .sheet {
      bottom: 50%;
      translate: -50% 50%;
      border: 1px solid var(--line);
      border-radius: 20px;
    }
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  h2 {
    font-size: 28px;
  }

  /* As wide as the sheet, unless a tall slide would not fit the screen: then as tall as fits. */
  .card {
    width: min(100%, calc((100dvh - 230px) * var(--w) / var(--h)));
    margin: 0 auto;
    border-radius: 14px;
    overflow: hidden;
    background: var(--ink);
    box-shadow: 0 0 0 1px var(--line);
  }

  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    font-size: 13px;
    font-weight: 600;
  }

  .who i {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--safe), #b4674a);
  }

  .pager {
    display: flex;
    aspect-ratio: var(--shape);
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }

  .pager::-webkit-scrollbar {
    display: none;
  }

  canvas {
    flex: none;
    display: block;
    width: 100%;
    height: 100%;
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }

  .foot {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 30px;
  }

  .dots {
    display: flex;
    gap: 5px;
  }

  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--paper-3);
    transition:
      background var(--t-fast),
      scale var(--t-fast);
  }

  .dots i.on {
    background: var(--safe);
    scale: 1.3;
  }

  .count {
    position: absolute;
    right: 10px;
    font-size: 12px;
    color: var(--paper-2);
    font-variant-numeric: tabular-nums;
  }

  .meta {
    margin-top: 10px;
    font-size: 13px;
    color: var(--paper-2);
    text-align: center;
  }
</style>
