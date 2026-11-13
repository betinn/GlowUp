<script lang="ts">
  /**
   * The menu of Glow na Hora: one tap puts a look on the whole face. Some looks also work on the light of the
   * face and on what is behind the person: those read the depth of the photo the first time one is used.
   */
  import { onDestroy, onMount } from 'svelte';
  import { lutById } from '../presets/luts';
  import { appliedLook, LOOKS, type RetouchPreset } from '../presets/recipes';
  import { ThumbRenderer } from '../presets/thumbs';
  import { facePick } from './facepick.svelte';
  import { commitLight, lightPick, setLightIntensity } from './lights.svelte';
  import { tapLook } from './looks';
  import ProgressCard from './ProgressCard.svelte';
  import Slider from './Slider.svelte';
  import { engine, ui } from './state.svelte';
  import { during } from './wait.svelte';

  const e = engine();
  /** On a phone the wait floats over the photo and the words stay. On a desktop it takes their place. */
  const desktop = matchMedia('(min-width: 900px)').matches;
  const worn = $derived((ui.rev, appliedLook(e.doc)));
  const active = $derived(worn?.id ?? null);
  /** How much of the light of the look shows, when the look on the photo has one. */
  const light = $derived((ui.rev, worn?.light && e.doc.light ? Math.round(e.doc.light.intensity * 100) : null));

  /** The look on its way, until it lands. */
  let wearing = $state<string | null>(null);
  const shown = $derived(LOOKS.find((l) => l.id === (wearing ?? active)));

  async function tap(look: RetouchPreset) {
    wearing = look.id;
    await during(active === look.id ? `Tirando o look ${look.name}` : `Vestindo o look ${look.name}`, () => tapLook(look));
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

<div class="looks" data-testid="looks" data-state={wearing ? 'wearing' : 'idle'}>
  {#if facePick.task && wearing}
    <div class="wait">
      <ProgressCard task={facePick.task} title={lightPick.task ? 'Lendo a luz da foto' : 'Procurando o rosto'} note={facePick.download} />
    </div>
  {/if}
  {#if !(facePick.task && wearing && desktop)}
    <p class="hint">{shown ? shown.note : 'Toque num look. Ele entra no rosto todo.'}</p>
  {/if}
  <div class="list scroll-x" role="toolbar" aria-label="Looks">
    {#each LOOKS as look (look.id)}
      <button type="button" class="look" class:on={active === look.id} class:wearing={wearing === look.id} aria-pressed={active === look.id}
        data-look={look.id} data-lit={look.light ? '' : undefined} title={active === look.id ? `${look.name}: toque de novo para tirar` : look.note} onclick={() => tap(look)}>
        <canvas use:thumb={look} class:ready={rendered[look.id]} width="104" height="104"></canvas>
        <span class="name">{look.name}</span>
      </button>
    {/each}
  </div>
  {#if light !== null && worn?.light}
    <div class="strength">
      <Slider label="Luz do look" value={light} resetTo={Math.round(worn.light.intensity * 100)} oninput={setLightIntensity} onchange={commitLight} />
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
    /* One column as wide as the tile, so a long name never widens its picture. */
    grid-template-columns: minmax(0, 1fr);
    gap: 5px;
    width: 88px;
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
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .strength {
    padding: 8px 16px 0;
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

    /* Three across, so the ten looks are in sight without scrolling. */
    .list {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px 6px;
      padding: 0 12px;
      overflow: auto;
    }

    .look {
      width: auto;
      font-size: 13px;
    }

    .strength {
      padding: 12px 18px 0;
    }
  }
</style>
