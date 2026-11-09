<script lang="ts">
  /** The screen of choice, over the photo. It opens with each new photo, and again from the button of the bar. */
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { reveal, rise } from './motion';
  import { choosePath, PATHS } from './paths';
  import { closeEditor, ui } from './state.svelte';

  let list = $state<HTMLElement>();

  /** With a path behind it, this screen is a question that can go unanswered. Before that, the way out is home. */
  function back() {
    if (ui.path) ui.choosingPath = false;
    else void closeEditor(() => (ui.screen = 'home'));
  }

  onMount(() => list?.querySelector('button')?.focus({ preventScroll: true }));
</script>

<svelte:window onkeydown={(ev) => { if (ev.key === 'Escape') back(); }} />

<div class="choice" role="dialog" aria-modal="true" aria-labelledby="path-title" data-testid="path-choice">
  <button type="button" class="icon-btn out" aria-label={ui.path ? 'Continuar como está' : 'Voltar para o início'} data-testid="path-back" onclick={back}>
    <Icon name={ui.path ? 'close' : 'back'} />
  </button>
  <div class="sheet" in:rise={{ duration: 320, y: 20 }}>
    <h2 class="serif" id="path-title" in:reveal={{ duration: 420 }}>Como vai ser?</h2>
    <div class="paths" bind:this={list}>
      {#each PATHS as path (path.id)}
        <button type="button" class="path" class:on={ui.path === path.id} aria-pressed={ui.path === path.id} data-path={path.id} onclick={() => choosePath(path.id)}>
          <Icon name={path.icon} size={26} />
          <span class="serif name">{path.label}</span>
          <span class="note">{path.note}</span>
        </button>
      {/each}
    </div>
    {#if ui.path}
      <p class="safe">Tudo que você já fez continua na foto.</p>
    {/if}
  </div>
</div>

<style>
  /* The photo stays lit above the sheet, so the choice is about this photo. */
  .choice {
    position: absolute;
    inset: 0;
    z-index: 12;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: linear-gradient(rgb(11 11 12 / 0.12) 30%, rgb(11 11 12 / 0.86) 72%);
  }

  .out {
    position: absolute;
    top: calc(var(--safe-top) + 8px);
    left: 8px;
    background: rgb(11 11 12 / 0.6);
  }

  .sheet {
    width: min(640px, 100%);
    max-height: 100%;
    overflow-y: auto;
    padding: 16px 16px calc(var(--safe-bottom) + 18px);
  }

  h2 {
    font-size: 34px;
    line-height: 1.05;
    margin-bottom: 12px;
  }

  .paths {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 10px;
  }

  .path {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 12px;
    align-items: center;
    min-height: 88px;
    padding: 14px 16px;
    text-align: left;
    background: var(--ink-2);
    border: 1px solid var(--line);
    border-radius: 20px;
    transition:
      background var(--t-fast),
      border-color var(--t-fast),
      transform var(--t-fast) var(--ease-reveal);
  }

  .path:hover {
    background: var(--ink-3);
  }

  .path:active {
    transform: scale(0.98);
  }

  .path.on {
    border-color: var(--safe);
  }

  .name {
    font-size: 26px;
    line-height: 1.1;
  }

  .note {
    grid-column: 2;
    margin-top: 2px;
    font-size: 13.5px;
    color: var(--paper-2);
  }

  .path :global(svg) {
    grid-row: span 2;
    color: var(--safe);
  }

  .safe {
    margin-top: 10px;
    font-size: 13.5px;
    color: var(--paper-2);
  }

  @media (min-width: 900px) {
    .sheet {
      padding: 24px;
    }

    h2 {
      font-size: 42px;
      text-align: center;
      margin-bottom: 18px;
    }

    .safe {
      text-align: center;
    }
  }
</style>
