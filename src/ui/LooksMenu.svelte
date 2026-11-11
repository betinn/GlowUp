<script lang="ts">
  /**
   * The menu of Glow na Hora, in two shelves. Looks: one tap puts a look on the whole face. Luzes: one tap
   * makes the light of the whole photo again. One of each can be on at the same time.
   */
  import { onDestroy, onMount } from 'svelte';
  import { lutById } from '../presets/luts';
  import { appliedLook, LOOKS, type RetouchPreset } from '../presets/recipes';
  import { ThumbRenderer } from '../presets/thumbs';
  import { facePick } from './facepick.svelte';
  import LightsShelf from './LightsShelf.svelte';
  import { tapLook } from './looks';
  import ProgressCard from './ProgressCard.svelte';
  import Segment from './Segment.svelte';
  import { engine, ui } from './state.svelte';

  const e = engine();
  /** On a phone the wait floats over the photo and the words stay. On a desktop it takes their place. */
  const desktop = matchMedia('(min-width: 900px)').matches;
  const active = $derived((ui.rev, appliedLook(e.doc)?.id ?? null));

  const SHELVES = [
    { value: 'looks', label: 'Looks' },
    { value: 'lights', label: 'Luzes' },
  ];
  /** A photo that wears a light and no look opens on the lights. */
  let shelf = $state(e.doc.light && !appliedLook(e.doc) ? 'lights' : 'looks');

  /** The look on its way, until it lands. */
  let wearing = $state<string | null>(null);
  const shown = $derived(LOOKS.find((l) => l.id === (wearing ?? active)));

  async function tap(look: RetouchPreset) {
    wearing = look.id;
    await tapLook(look);
    if (wearing === look.id) wearing = null;
  }

  const thumbs = new ThumbRenderer(e);
  let rendered = $state<Record<string, boolean>>({});
  let queue = Promise.resolve();
  let alive = true;

  /** The previews show the color of each look on this photo, one by one. */
  function thumb(canvas: HTMLCanvasElement, look: RetouchPreset) {
    queue = queue.then(async () => {
      const recipe = look.filter.id ? lutById(look.filter.id) : undefined;
      if (!alive || !recipe) return;
      await thumbs.render(recipe, canvas, look.filter.intensity);
      rendered[look.id] = true;
      await new Promise((r) => setTimeout(r));
    });
  }

  onMount(() => thumbs.prepare());

  onDestroy(() => {
    alive = false;
    void queue.then(() => thumbs.destroy());
  });
</script>

<div class="looks" data-testid="looks" data-state={wearing ? 'wearing' : 'idle'} data-shelf={shelf}>
  <div class="shelves">
    <Segment label="Prateleira" value={shelf} options={SHELVES} onchange={(v) => (shelf = v)} />
  </div>
  {#if shelf === 'lights'}
    <LightsShelf />
  {:else}
  {#if facePick.task && wearing}
    <div class="wait">
      <ProgressCard task={facePick.task} title="Procurando o rosto" note={facePick.download} />
    </div>
  {/if}
  {#if !(facePick.task && wearing && desktop)}
    <p class="hint">{shown ? shown.note : 'Toque num look. Ele entra no rosto todo.'}</p>
  {/if}
  <div class="list scroll-x" role="toolbar" aria-label="Looks">
    {#each LOOKS as look (look.id)}
      <button type="button" class="look" class:on={active === look.id} class:wearing={wearing === look.id} aria-pressed={active === look.id}
        data-look={look.id} title={active === look.id ? `${look.name}: toque de novo para tirar` : look.note} onclick={() => tap(look)}>
        <canvas use:thumb={look} class:ready={rendered[look.id]} width="104" height="104"></canvas>
        <span class="name">{look.name}</span>
      </button>
    {/each}
  </div>
  {/if}
</div>

<style>
  .looks {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 10px 0 6px;
  }

  .shelves {
    padding: 0 16px 6px;
  }

  .hint {
    padding: 0 16px 8px;
    font-family: var(--serif);
    font-style: italic;
    font-size: 17px;
    line-height: 1.2;
    color: var(--paper-2);
  }

  /* It floats above the menu, so the photo does not jump when the wait comes and goes. */
  .wait {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100%;
    padding: 10px 16px;
    background: var(--ink);
    border-top: 1px solid var(--line);
  }

  .list {
    display: flex;
    gap: 8px;
    padding: 0 12px;
  }

  .look {
    flex: none;
    display: grid;
    justify-items: center;
    gap: 5px;
    width: 76px;
    padding: 4px;
    border-radius: 14px;
    font-size: 12.5px;
    color: var(--paper-2);
    transition:
      color var(--t-fast),
      transform var(--t-fast) var(--ease-reveal);
  }

  .look:hover {
    color: var(--paper);
  }

  .look:active {
    transform: scale(0.96);
  }

  canvas {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    background: var(--ink-3);
    opacity: 0;
    filter: blur(6px);
    transition:
      opacity var(--t-slow) var(--ease-reveal),
      filter var(--t-slow) var(--ease-reveal),
      box-shadow var(--t-fast);
  }

  canvas.ready {
    opacity: 1;
    filter: none;
  }

  .look.on {
    color: var(--safe);
  }

  .look.on canvas {
    box-shadow: 0 0 0 2px var(--safe);
  }

  .look.wearing canvas {
    animation: breathe 1.2s var(--ease-swift) infinite alternate;
  }

  .name {
    white-space: nowrap;
  }

  @keyframes breathe {
    to {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .look.wearing canvas {
      animation: none;
    }
  }

  @media (min-width: 900px) {
    .looks {
      height: 100%;
      padding: 16px 0;
    }

    .hint {
      padding: 0 18px 12px;
      min-height: 52px;
    }

    .wait {
      position: static;
      padding: 0 18px 12px;
      background: none;
      border: 0;
    }

    .list {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      padding: 0 14px;
      overflow: auto;
    }

    .look {
      width: auto;
      font-size: 14px;
    }
  }
</style>
