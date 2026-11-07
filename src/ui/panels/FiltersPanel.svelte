<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { setFilter, syncFilter } from '../../presets/apply';
  import { LUT_CATEGORIES, LUTS, type LutRecipe } from '../../presets/luts';
  import { ThumbRenderer } from '../../presets/thumbs';
  import Icon from '../Icon.svelte';
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

  const thumbs = new ThumbRenderer(e);
  const pending = new Map<string, HTMLCanvasElement>();
  let queue = Promise.resolve();
  let alive = true;

  function thumb(canvas: HTMLCanvasElement, recipe: LutRecipe) {
    if (pending.has(recipe.id) && pending.get(recipe.id) === canvas) return;
    pending.set(recipe.id, canvas);
    queue = queue.then(async () => {
      if (!alive) return;
      await thumbs.render(recipe, canvas);
      await new Promise((r) => setTimeout(r));
    });
  }

  onMount(() => thumbs.prepare());

  onDestroy(() => {
    alive = false;
    void queue.then(() => thumbs.destroy());
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
{/if}

<div class="grid">
  {#each visible as l (l.id)}
    <div class="item" class:on={filter.id === l.id}>
      <button type="button" class="pick" aria-pressed={filter.id === l.id} data-filter={l.id} onclick={() => pick(l.id)}>
        <canvas use:thumb={l} width="104" height="104"></canvas>
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
    transition:
      transform var(--t-mid) var(--ease-reveal),
      box-shadow var(--t-mid) var(--ease-reveal);
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
