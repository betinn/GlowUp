<script lang="ts">
  /** The button of the bar that goes back to the screen of choice. It names the path the person is on. */
  import { pathById } from './paths';
  import { ui } from './state.svelte';

  const label = $derived(pathById(ui.path)?.label ?? '');
</script>

<button type="button" class="switch" aria-label="Trocar o jeito de editar. Agora: {label}" data-testid="path-switch" onclick={() => (ui.choosingPath = true)}>
  <span class="name">{label}</span>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 9.5 12 15.5l6-6" />
  </svg>
</button>

<style>
  .switch {
    flex: 0 1 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    min-height: 44px;
    padding: 0 4px;
    border-radius: 12px;
    font-size: 12px;
    line-height: 1.1;
    text-align: left;
    color: var(--paper-2);
    transition:
      color var(--t-fast),
      background var(--t-fast);
  }

  .switch:hover {
    color: var(--paper);
    background: rgb(255 255 255 / 0.06);
  }

  /* On a phone the bar is full, so the name takes two lines. */
  .name {
    max-width: 52px;
  }

  svg {
    flex: none;
  }

  @media (min-width: 900px) {
    .switch {
      margin-left: 10px;
      padding: 0 10px;
      font-size: 14px;
    }

    .name {
      max-width: none;
    }
  }
</style>
