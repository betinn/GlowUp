<script lang="ts">
  import Home from './ui/Home.svelte';
  import Toast from './ui/Toast.svelte';
  import { ui } from './ui/state.svelte';

  /** The editor and everything GPU related load only after a photo is chosen. */
  const loadEditor = () => import('./ui/Editor.svelte');
</script>

{#if ui.screen === 'home'}
  <Home />
{:else}
  {#await loadEditor()}
    <div class="wait"><p class="serif">Revelando…</p></div>
  {:then { default: Editor }}
    <Editor />
  {:catch}
    <div class="wait"><p class="serif">Não consegui carregar o editor. Confere a conexão?</p></div>
  {/await}
{/if}
<Toast />

<style>
  .wait {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    text-align: center;
    padding: 24px;
    font-size: 26px;
  }
</style>
