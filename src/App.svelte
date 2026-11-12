<script lang="ts">
  import DropZone from './ui/DropZone.svelte';
  import Home from './ui/Home.svelte';
  import OpeningScreen from './ui/OpeningScreen.svelte';
  import Toast from './ui/Toast.svelte';
  import { ui } from './ui/state.svelte';

  /** The editor and everything GPU related load only after a photo is chosen. */
  const loadEditor = () => import('./ui/Editor.svelte');
  /** The table of a post of several photos loads only when there is one. */
  const loadStudio = () => import('./ui/post/Studio.svelte');
</script>

{#if ui.screen === 'home'}
  <Home />
{:else if ui.screen === 'post'}
  {#await loadStudio() then { default: Studio }}
    <Studio />
  {:catch}
    <div class="wait"><p class="serif">Não consegui carregar a montagem. Confere a conexão?</p></div>
  {/await}
{:else}
  {#await loadEditor() then { default: Editor }}
    {#key ui.session}
      <Editor />
    {/key}
  {:catch}
    <div class="wait"><p class="serif">Não consegui carregar o editor. Confere a conexão?</p></div>
  {/await}
{/if}
<DropZone />
{#if ui.opening}
  <OpeningScreen opening={ui.opening} />
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
