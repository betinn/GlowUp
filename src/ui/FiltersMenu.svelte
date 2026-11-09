<script lang="ts">
  /** The menu of the Filtros path: the filter panel alone, with no tools around it. */
  import { onMount } from 'svelte';
  import { selectTool } from './actions';
  import FiltersPanel from './panels/FiltersPanel.svelte';

  // The panel paints a filter's area through the open tool, as it does from the tool's button.
  onMount(() => void selectTool('filters'));
</script>

<div class="filters-menu" data-testid="filters-menu">
  <FiltersPanel />
</div>

<style>
  .filters-menu {
    padding: 12px 16px;
    overflow-y: auto;
    max-height: 100%;
  }
</style>
