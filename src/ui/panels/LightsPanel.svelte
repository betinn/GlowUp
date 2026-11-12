<script lang="ts">
  /**
   * The Luzes tab of Filtros: the filters that make the light of the whole scene again. The first tap looks for
   * the person and reads the depth of the photo, and from then on each tile shows its light on this photo.
   */
  import { onDestroy, onMount, tick } from 'svelte';
  import { LIGHTS } from '../../core/light/lights';
  import type { MenuLight } from '../../core/light/types';
  import { facePick } from '../facepick.svelte';
  import { appliedLight, closeLights, commitLight, dropLight, lightPick, lookLightOn, setLightIntensity, syncLights, tapLight } from '../lights.svelte';
  import { LightThumbs } from '../lightthumbs';
  import ProgressCard from '../ProgressCard.svelte';
  import Slider from '../Slider.svelte';
  import { engine, ui } from '../state.svelte';

  const e = engine();
  const active = $derived((ui.rev, appliedLight(e)?.id ?? null));
  /** The light of a look of Glow na Hora is on the photo, with no tile of its own here. */
  const ofLook = $derived((ui.rev, lookLightOn(e)));
  const intensity = $derived((ui.rev, Math.round((e.doc.light?.intensity ?? 1) * 100)));
  const shown = $derived(LIGHTS.find((l) => l.id === (lightPick.wearing ?? active)));
  const waiting = $derived(!!lightPick.task && !!lightPick.wearing);

  const thumbs = new LightThumbs(e);
  const canvases = new Map<string, HTMLCanvasElement>();
  let rendered = $state<Record<string, boolean>>({});
  let queue = Promise.resolve();
  let alive = true;

  function hold(canvas: HTMLCanvasElement, light: MenuLight) {
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
    <div class="job">
      <ProgressCard task={lightPick.task} title="Lendo a luz da foto" note={facePick.download} />
    </div>
  {:else}
    <p class="hint">{shown ? shown.note : 'Toque numa luz. Ela refaz a luz da foto inteira.'}</p>
  {/if}
  <div class="grid" role="toolbar" aria-label="Luzes">
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
  {#if active || ofLook}
    <div class="strength">
      {#if ofLook}
        <div class="of-look" data-testid="look-light">
          <span class="tip">Esta foto está com a luz de um look do Glow na Hora. Uma luz daqui entra no lugar dela.</span>
          <button type="button" class="btn" onclick={dropLight}>Tirar a luz</button>
        </div>
      {/if}
      <Slider label="Intensidade" value={intensity} resetTo={100} oninput={setLightIntensity} onchange={commitLight} />
    </div>
  {/if}
</div>

<style>
  .lights {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .hint {
    padding-bottom: 8px;
    font-family: var(--serif);
    font-style: italic;
    font-size: 16px;
    line-height: 1.2;
    color: var(--paper-2);
  }

  .job {
    margin-bottom: 10px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 10px;
  }

  .light {
    display: block;
    width: 100%;
    text-align: left;
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
    margin-bottom: 4px;
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
    color: var(--paper);
  }

  .light.on .tile {
    box-shadow: 0 0 0 2px var(--safe);
  }

  .light.wearing .tile {
    animation: breathe 1.2s var(--ease-swift) infinite alternate;
  }

  .name {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .strength {
    padding-top: 10px;
  }

  .of-look {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .of-look .btn {
    flex: none;
    font-size: 14px;
  }

  .tip {
    font-size: 12px;
    line-height: 1.25;
    color: var(--paper-2);
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

  /* On a phone the lights run in a line right under the photo, as the filters do. */
  @media (max-width: 899px) {
    .hint {
      padding-bottom: 4px;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .grid {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .grid::-webkit-scrollbar {
      display: none;
    }

    .light {
      flex: none;
      width: 78px;
    }

    .strength {
      padding-top: 8px;
    }
  }
</style>
