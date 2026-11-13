<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { FILTER_MASK } from '../../core/doc';
  import { setFilter, syncFilter } from '../../presets/apply';
  import { FILTER_CATEGORIES, FILTERS, lutById, type FilterData } from '../../presets/luts';
  import { suggestFilter, type Fault, type Suggestion } from '../../presets/suggest';
  import { ThumbRenderer } from '../../presets/thumbs';
  import { filterBrush } from '../actions';
  import BrushControls from '../BrushControls.svelte';
  import { comparePress } from '../compare';
  import { facePick, paintArea, searchFaces, stopFaceSearch } from '../facepick.svelte';
  import Icon from '../Icon.svelte';
  import LightsPanel from './LightsPanel.svelte';
  import ProgressCard from '../ProgressCard.svelte';
  import Segment from '../Segment.svelte';
  import Slider from '../Slider.svelte';
  import { bump, engine, prefs, ui } from '../state.svelte';
  import { during } from '../wait.svelte';

  const e = engine();
  const filter = $derived((ui.rev, e.doc.filter));
  const FAV_KEY = 'glowup.favorites';
  let favorites = $state<string[]>(prefs.read(FAV_KEY, []));
  /**
   * Luzes sits among the categories: its filters make the light of the scene again, where the others change
   * its color. A filter and a light can be on together.
   */
  const LIGHTS_TAB = 'Luzes';
  /** A photo that wears a light and no filter opens on the lights. */
  let category = $state<string>(e.doc.light && !e.doc.filter.id ? LIGHTS_TAB : 'Todos');
  const categories = $derived(favorites.length ? ['Todos', LIGHTS_TAB, 'Favoritos', ...FILTER_CATEGORIES] : ['Todos', LIGHTS_TAB, ...FILTER_CATEGORIES]);
  /** The dot on the tab: a light is on the photo, whichever tab shows. */
  const lit = $derived((ui.rev, !!e.doc.light));

  const visible = $derived(
    FILTERS.filter((l) => (category === 'Todos' ? true : category === 'Favoritos' ? favorites.includes(l.id) : l.category === category)),
  );

  const comparing = $derived((ui.splitOn || ui.compareHold) && ui.compareScope === 'filter');

  /** The labels on the divider follow the chosen filter, and without a filter there is nothing to compare. */
  $effect(() => {
    ui.filterName = (filter.id && lutById(filter.id)?.name) || '';
    if (!filter.id && ui.compareScope === 'filter') closeCompare();
  });

  const AREAS = [
    { value: 'photo', label: 'Foto toda' },
    { value: 'face', label: 'Escolher rosto' },
  ];
  const searching = $derived(!!facePick.task);
  const area = $derived(filter.masked || ui.faceChoosing || searching ? 'face' : 'photo');

  /** With a chosen area the photo takes the brush, and the panel below controls it. */
  $effect(() => {
    if (!filter.id) untrack(stopFaceSearch);
    // The Luzes tab has no area to paint.
    const paint = !!filter.id && !!filter.masked && !ui.faceChoosing && !searching && category !== LIGHTS_TAB;
    untrack(() => {
      if (paint && e.activeLayer !== FILTER_MASK) {
        e.brush = filterBrush();
        e.setTool('mask', FILTER_MASK);
      } else if (!paint && e.activeLayer === FILTER_MASK) {
        e.setTool('none');
      }
    });
  });

  function setArea(value: string) {
    if (value === 'photo') {
      stopFaceSearch();
      e.setFilterArea({ masked: false });
      e.commit();
      bump();
    } else if (filter.reach !== undefined) {
      // This photo already has an area: going back keeps what was touched up.
      e.setFilterArea({ masked: true });
      e.commit();
      bump();
    } else {
      void searchFaces(e);
    }
  }

  function closeCompare() {
    ui.splitOn = false;
    ui.compareHold = false;
    ui.compareScope = 'all';
  }

  const thumbs = new ThumbRenderer(e);
  let rendered = $state<Record<string, boolean>>({});
  const pending = new Map<string, HTMLCanvasElement>();
  let alive = true;
  /** The suggestion comes first, so it never waits behind the miniatures of the whole list. */
  let startQueue: () => void = () => {};
  let queue = new Promise<void>((resolve) => (startQueue = resolve));

  function thumb(canvas: HTMLCanvasElement, item: FilterData) {
    if (pending.has(item.id) && pending.get(item.id) === canvas) return;
    pending.set(item.id, canvas);
    queue = queue.then(async () => {
      if (!alive) return;
      await thumbs.render(item, canvas);
      rendered[item.id] = true;
      await new Promise((r) => setTimeout(r));
    });
  }

  /** What the suggestion says it eases in the photo. */
  const FAULT_WORDS: Record<Fault, string> = {
    dark: 'A foto está escura, e este filtro abre a luz.',
    bright: 'A foto está muito clara, e este filtro assenta a luz.',
    flat: 'A foto está sem contraste, e este filtro dá corpo.',
    hard: 'A foto está dura, e este filtro alivia o contraste.',
    cold: 'A foto está fria, e este filtro aquece.',
    warm: 'A foto está muito quente, e este filtro equilibra.',
    dull: 'A foto está sem cor, e este filtro dá vida.',
    loud: 'A foto está com cor demais, e este filtro acalma.',
  };

  let suggestion = $state<Suggestion | null>(null);
  let suggestionCanvas = $state<HTMLCanvasElement>();
  let suggestionReady = $state(false);
  const suggested = $derived(suggestion ? lutById(suggestion.id) : undefined);

  /** Reads the photo once the panel has opened, so the tone never holds up the first frame of the panel. */
  async function readSuggestion() {
    const pixels = await thumbs.pixels();
    if (!alive || !pixels) return;
    suggestion = suggestFilter(pixels, FILTERS);
    await tick();
    if (!alive || !suggested || !suggestionCanvas) return;
    await thumbs.render(suggested, suggestionCanvas);
    suggestionReady = true;
  }

  onMount(() => {
    thumbs.prepare();
    void readSuggestion().finally(startQueue);
  });

  onDestroy(() => {
    alive = false;
    void queue.then(() => thumbs.destroy());
    if (ui.compareScope === 'filter') closeCompare();
    stopFaceSearch();
    if (e.activeLayer === FILTER_MASK) e.setTool('none');
  });

  /** A tap on a filter. The photo says so while the filter is on its way, which on a phone can take a moment. */
  async function pick(id: string) {
    const off = filter.id === id;
    await during(off ? 'Tirando o filtro' : `Aplicando ${lutById(id)?.name ?? 'o filtro'}`, async () => {
      await setFilter(e, off ? null : id, filter.id ? filter.intensity : 0.85);
      e.commit();
      bump();
    });
  }

  function toggleFavorite(id: string) {
    favorites = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    prefs.write(FAV_KEY, favorites);
  }
</script>

{#if suggested}
  <button type="button" class="suggestion" class:on={filter.id === suggested.id} class:chosen={!!filter.id} aria-pressed={filter.id === suggested.id}
    data-testid="filter-suggestion" data-suggested={suggested.id} onclick={() => pick(suggested.id)}>
    <canvas bind:this={suggestionCanvas} class:ready={suggestionReady} width="104" height="104"></canvas>
    <span class="words">
      <span class="label">Sugestão para esta foto</span>
      <strong>{suggested.name}</strong>
      <span class="why">{suggestion?.fault ? FAULT_WORDS[suggestion.fault] : 'Este filtro combina com o tom desta foto.'}</span>
    </span>
  </button>
{/if}

<div class="cats scroll-x" role="tablist" aria-label="Categorias">
  {#each categories as c (c)}
    <button type="button" role="tab" aria-selected={category === c} class:on={category === c} class:lit={c === LIGHTS_TAB && lit} data-category={c}
      onclick={() => (category = c)}>{c}</button>
  {/each}
</div>

{#if category === LIGHTS_TAB}
<LightsPanel />
{:else}
<div class="menu">
{#if filter.id}
  <div class="controls">
  <div class="compare">
    <button type="button" class="btn" class:on={comparing} aria-pressed={comparing} data-testid="compare-filter" use:comparePress={'filter'}>
      <Icon name="compare" size={20} />
      Comparar com original
    </button>
    <span class="tip">Toque divide a foto. Segure para ver o original.</span>
  </div>
  <Slider
    label="Intensidade"
    value={filter.intensity * 100}
    oninput={(v) => {
      e.setFilterState(filter.id, v / 100);
      void syncFilter(e);
      bump();
    }}
    onchange={() => e.commit()}
  />

  <Segment label="Aplicar em" value={area} options={AREAS} onchange={setArea} />

  {#if facePick.task}
    <div class="job">
      <ProgressCard
        task={facePick.task}
        title="Procurando rostos"
        note={facePick.download}
      />
    </div>
  {:else if ui.faceChoosing}
    <p class="tip choose">Toque no rosto que recebe o filtro.</p>
    <div class="row">
      {#if facePick.more}
        <button type="button" class="btn" data-testid="face-more" onclick={() => searchFaces(e, true)}>Procurar mais rostos</button>
      {/if}
      <button type="button" class="btn" data-testid="face-paint" onclick={() => paintArea(e)}>Pintar a área</button>
    </div>
  {:else if filter.masked}
    <BrushControls full={false} />
    <Slider
      label="Borda"
      value={filter.feather ?? 0}
      resetTo={0}
      oninput={(v) => {
        e.setFilterArea({ feather: v });
        bump();
      }}
      onchange={() => e.commit()}
    />
    <button type="button" class="btn swap" data-testid="face-swap" onclick={() => searchFaces(e)}>Trocar rosto</button>
  {/if}
  </div>
{/if}

<div class="grid">
  {#each visible as l (l.id)}
    <div class="item" class:on={filter.id === l.id}>
      <button type="button" class="pick" aria-pressed={filter.id === l.id} data-filter={l.id} onclick={() => pick(l.id)}>
        <canvas use:thumb={l} class:ready={rendered[l.id]} width="104" height="104"></canvas>
        <span>{l.name}</span>
      </button>
      <button
        type="button"
        class="fav"
        class:on={favorites.includes(l.id)}
        aria-label="Favoritar {l.name}"
        aria-pressed={favorites.includes(l.id)}
        onclick={() => toggleFavorite(l.id)}
      >
        <Icon name="star" size={15} filled={favorites.includes(l.id)} />
      </button>
    </div>
  {/each}
</div>
</div>
{/if}

<style>
  .suggestion {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    margin-bottom: 10px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 14px;
    text-align: left;
    transition: border-color var(--t-fast);
  }

  .suggestion.on {
    border-color: var(--safe);
  }

  .suggestion canvas {
    flex: none;
    width: 56px;
    margin: 0;
  }

  .words {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .label {
    font-size: 11.5px;
    color: var(--paper-3);
  }

  .words strong {
    font-size: 14px;
    font-weight: 600;
    color: var(--paper);
  }

  .why {
    font-size: 12px;
    line-height: 1.25;
    color: var(--paper-2);
  }

  .menu {
    display: flex;
    flex-direction: column;
  }

  .cats {
    display: flex;
    gap: 4px;
    padding-bottom: 8px;
  }

  .cats button {
    flex: none;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 13px;
    color: var(--paper-2);
    transition: color var(--t-fast);
  }

  .cats button.on {
    color: var(--safe);
  }

  /* A light is on the photo. */
  .cats button.lit::after {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-left: 6px;
    border-radius: 50%;
    background: var(--safe);
    vertical-align: middle;
  }

  .compare {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .compare .btn {
    flex: none;
    font-size: 14px;
    touch-action: none;
  }

  .compare .btn.on {
    color: var(--safe);
    border-color: var(--safe);
  }

  .job {
    margin: 10px 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 6px 0 10px;
  }

  .row .btn,
  .swap {
    font-size: 14px;
  }

  .swap {
    margin: 4px 0 10px;
  }

  .tip.choose {
    margin: 6px 0;
    font-size: 13px;
  }

  .tip {
    font-size: 12px;
    line-height: 1.25;
    color: var(--paper-2);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 10px;
    margin-top: 6px;
  }

  .item {
    position: relative;
  }

  .pick {
    display: block;
    width: 100%;
    text-align: left;
    font-size: 12px;
    color: var(--paper-2);
  }

  canvas {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    background: var(--ink-3);
    margin-bottom: 4px;
    animation: waiting 1.1s ease-in-out infinite alternate;
    transition:
      transform var(--t-mid) var(--ease-reveal),
      box-shadow var(--t-mid) var(--ease-reveal);
  }

  /* Until its miniature is ready a filter breathes, then it develops like everything else. */
  canvas.ready {
    animation: develop var(--t-slow) var(--ease-reveal);
  }

  @keyframes waiting {
    from {
      opacity: 0.35;
    }
    to {
      opacity: 0.8;
    }
  }

  @keyframes develop {
    from {
      opacity: 0.35;
      filter: blur(5px) brightness(0.6);
    }
  }

  .pick:hover canvas {
    transform: scale(1.03);
  }

  .item.on canvas {
    box-shadow: 0 0 0 2px var(--safe);
  }

  .item.on .pick {
    color: var(--paper);
  }

  .fav {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    color: rgb(255 255 255 / 0.75);
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.6));
  }

  .fav.on {
    color: var(--safe);
  }

  /* On a phone the filters run in a line right under the photo, then the intensity, all in sight. */
  @media (max-width: 899px) {
    .suggestion {
      gap: 10px;
      margin-bottom: 4px;
      padding: 4px 8px 4px 4px;
    }

    .suggestion canvas {
      width: 38px;
      border-radius: 10px;
    }

    .why {
      display: none;
    }

    /* With a filter on, the intensity needs the room. Taking the filter off brings the suggestion back. */
    .suggestion.chosen {
      display: none;
    }

    .words {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 8px;
    }

    .cats {
      padding-bottom: 2px;
    }

    .controls {
      order: 1;
      display: flex;
      flex-direction: column;
      margin-top: 8px;
    }

    .compare {
      order: 1;
      margin: 8px 0 0;
    }

    .compare .tip {
      display: none;
    }

    .grid {
      display: flex;
      gap: 8px;
      margin-top: 0;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .grid::-webkit-scrollbar {
      display: none;
    }

    .item {
      flex: none;
      width: 66px;
    }

    .pick {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
</style>
