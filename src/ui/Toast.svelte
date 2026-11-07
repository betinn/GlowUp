<script lang="ts">
  import { rise } from './motion';
  import { ui } from './state.svelte';
</script>

{#if ui.toast}
  <div class="toast" role="status" transition:rise={{ y: 12 }}>{ui.toast}</div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    top: calc(var(--bar-h) + var(--safe-top) + 12px);
    translate: -50% 0;
    z-index: 60;
    max-width: min(420px, calc(100vw - 32px));
    padding: 10px 16px;
    border-radius: 16px;
    background: var(--paper);
    color: var(--ink);
    font-size: 14px;
    pointer-events: none;
  }
</style>
