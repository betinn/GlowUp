<script lang="ts">
  /**
   * Automático or Manual, for the tool under `toolLimit`. It takes no props and shows nothing while the
   * mode has no meaning: no tool under that control, or a search still going or gone wrong.
   */
  import { engine } from '../state.svelte';
  import { setToolMode, toolLimit, type ToolMode } from '../facepick.svelte';
  import Segment from '../Segment.svelte';

  const MODES = [
    { value: 'auto', label: 'Automático' },
    { value: 'manual', label: 'Manual' },
  ];
  const shown = $derived(!!toolLimit.tool && (toolLimit.state === 'on' || toolLimit.state === 'off'));
</script>

{#if shown}
  <div data-testid="tool-mode" data-mode={toolLimit.mode}>
    <Segment label="Modo" value={toolLimit.mode} options={MODES} onchange={(v) => setToolMode(engine(), v as ToolMode)} />
  </div>
{/if}
