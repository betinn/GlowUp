<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { FILTER_MASK } from '../../core/doc';
  import { setFilter, syncFilter } from '../../presets/apply';
  import { LUT_CATEGORIES, LUTS, type LutRecipe } from '../../presets/luts';
  import { ThumbRenderer } from '../../presets/thumbs';
  import { filterBrush } from '../actions';
  import BrushControls from '../BrushControls.svelte';
  import { comparePress } from '../compare';
  import { facePick, paintArea, searchFaces, stopFaceSearch } from '../facepick.svelte';
  import Icon from '../Icon.svelte';
  import ProgressCard from '../ProgressCard.svelte';
  import Segment from '../Segment.svelte';
  import Slider from '../Slider.svelte';
  import { bump, engine, prefs, ui } from '../state.svelte';

  const e = engine();
  const filter = $derived((ui.rev, e.doc.filter));
  const FAV_KEY = 'glowup.favorites';
  let favorites = $state<string[]>(prefs.read(FAV_KEY, []));
  let category = $state<string>('Todos');
  const categories = $derived(favorites.length ? ['Todos', 'Favoritos', ...LUT_CATEGORIES] : ['Todos', ...LUT_CATEGORIES]);

  const visible = $derived(
    LUTS.filter((l) => (category === 'Todos' ? true : category === 'Favoritos' ? favorites.includes(l.id) : l.category === category)),
  );

  const comparing = $derived((ui.splitOn || ui.compareHold) && ui.compareScope === 'filter');

  /** The labels on the divider follow the chosen filter, and without a filter there is nothing to compare. */
  $effect(() => {
    ui.filterName = LUTS.find((l) => l.id === filter.id)?.name ?? '';
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
    const paint = !!filter.id && !!filter.masked && !ui.faceChoosing && !searching;
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
  let queue = Promise.resolve();
  let alive = true;

  function thumb(canvas: HTMLCanvasElement, recipe: LutRecipe) {
    if (pending.has(recipe.id) && pending.get(recipe.id) === canvas) return;
    pending.set(recipe.id, canvas);
    queue = queue.then(async () => {
      if (!alive) return;
      await thumbs.render(recipe, canvas);
      rendered[recipe.id] = true;
      await new Promise((r) => setTimeout(r));
    });
  }

  onMount(() => thumbs.prepare());

  onDestroy(() => {
    alive = false;
    void queue.then(() => thumbs.destroy());
    if (ui.compareScope === 'filter') closeCompare();
    stopFaceSearch();
    if (e.activeLayer === FILTER_MASK) e.setTool('none');
  });

  async function pick(id: string) {
    await setFilter(e, filter.id === id ? null : id, filter.id ? filter.intensity : 0.85);
    e.commit();
    bump();
  }

  function toggleFavorite(id: string) {
    favorites = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    prefs.write(FAV_KEY, favorites);
  }
</script>

<div class="cats scroll-x" role="tablist" aria-label="Categorias">
  {#each categories as c (c)}
    <button type="button" role="tab" aria-selected={category === c} class:on={category === c} onclick={() => (category = c)}>{c}</button>
  {/each}
</div>

{#if filter.id}
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

<style>
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
</style>
