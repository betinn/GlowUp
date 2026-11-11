<script lang="ts">
  /**
   * The shelf of Luzes, inside Glow na Hora: one tap makes the light of the whole photo again. The first tap
   * looks for the person, and from then on each tile shows its light on this photo.
   */
  import { onDestroy, onMount, tick } from 'svelte';
  import { LIGHTS } from '../core/light/lights';
  import type { LightDef } from '../core/light/types';
  import { facePick } from './facepick.svelte';
  import { appliedLight, closeLights, commitLight, lightPick, setLightIntensity, syncLights, tapLight } from './lights.svelte';
  import { LightThumbs } from './lightthumbs';
  import ProgressCard from './ProgressCard.svelte';
  import Slider from './Slider.svelte';
  import { engine, ui } from './state.svelte';

  const e = engine();
  /** On a phone the wait floats over the photo and the words stay. On a desktop it takes their place. */
  const desktop = matchMedia('(min-width: 900px)').matches;
  const active = $derived((ui.rev, appliedLight(e)?.id ?? null));
  const intensity = $derived((ui.rev, Math.round((e.doc.light?.intensity ?? 1) * 100)));
  const shown = $derived(LIGHTS.find((l) => l.id === (lightPick.wearing ?? active)));
  const waiting = $derived(!!lightPick.task && !!lightPick.wearing);

  const thumbs = new LightThumbs(e);
  const canvases = new Map<string, HTMLCanvasElement>();
  let rendered = $state<Record<string, boolean>>({});
  let queue = Promise.resolve();
  let alive = true;

  function hold(canvas: HTMLCanvasElement, light: LightDef) {
    canvases.set(light.id, canvas);
    return { destroy: () => void canvases.delete(light.id) };
  }

  /** Draws every tile from the photo, one by one, once the photo has its scene. */
  function draw() {
    queue = queue.then(async () => {
      await tick();
      if (!alive || !thumbs.prepare()) return;
      for (const light of LIGHTS) {
        const canvas = canvases.get(light.id);
        if (!alive || !canvas) continue;
        await thumbs.render(light, canvas);
        rendered[light.id] = true;
        await new Promise((r) => setTimeout(r));
      }
    });
  }

  onMount(() => syncLights(e));

  $effect(() => {
    if (lightPick.state === 'ready') draw();
  });

  onDestroy(() => {
    alive = false;
    closeLights();
    void queue.then(() => thumbs.destroy());
  });
</script>

<div class="lights" data-testid="lights" data-state={lightPick.wearing ? 'wearing' : 'idle'} data-scene={lightPick.state}>
  {#if waiting && lightPick.task}
    <div class="wait">
      <ProgressCard task={lightPick.task} title="Procurando a pessoa" note={facePick.download} />
    </div>
  {/if}
  {#if !(waiting && desktop)}
    <p class="hint">{shown ? shown.note : 'Toque numa luz. Ela refaz a luz da foto inteira.'}</p>
  {/if}
  <div class="list scroll-x" role="toolbar" aria-label="Luzes">
    {#each LIGHTS as light (light.id)}
      <button type="button" class="light" class:on={active === light.id} class:wearing={lightPick.wearing === light.id} aria-pressed={active === light.id}
        data-light={light.id} title={active === light.id ? `${light.label}: toque de novo para tirar` : light.note} onclick={() => tapLight(light)}>
        <span class="tile" style:--a={light.swatch[0]} style:--b={light.swatch[1]}>
          <canvas use:hold={light} class:ready={rendered[light.id]} width="104" height="104"></canvas>
        </span>
        <span class="name">{light.label}</span>
      </button>
    {/each}
  </div>
  {#if active}
    <div class="strength">
      <Slider label="Intensidade" value={intensity} resetTo={100} oninput={setLightIntensity} onchange={commitLight} />
    </div>
  {/if}
</div>

<style>
  .lights {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
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

  .light {
    flex: none;
    display: grid;
    justify-items: center;
    gap: 5px;
    width: 96px;
    padding: 4px;
    border-radius: 14px;
    font-size: 12px;
    color: var(--paper-2);
    transition:
      color var(--t-fast),
      transform var(--t-fast) var(--ease-reveal);
  }

  .light:hover {
    color: var(--paper);
  }

  .light:active {
    transform: scale(0.96);
  }

  /* Before the photo has its scene, the tile says what the light does: the person on one side, the place on the other. */
  .tile {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 44%, var(--a) 0 24%, transparent 46%),
      var(--b);
    transition: box-shadow var(--t-fast);
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    opacity: 0;
    filter: blur(6px);
    transition:
      opacity var(--t-slow) var(--ease-reveal),
      filter var(--t-slow) var(--ease-reveal);
  }

  canvas.ready {
    opacity: 1;
    filter: none;
  }

  .light.on {
    color: var(--safe);
  }

  .light.on .tile {
    box-shadow: 0 0 0 2px var(--safe);
  }

  .light.wearing .tile {
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
    .light.wearing .tile {
      animation: none;
    }
  }

  @media (min-width: 900px) {
    .lights {
      height: 100%;
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

    .light {
      width: auto;
      font-size: 14px;
    }

    .strength {
      padding: 12px 18px 0;
    }
  }
</style>
