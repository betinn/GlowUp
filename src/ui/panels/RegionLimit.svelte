<script lang="ts">
  /**
   * Says where the brush stands: searching, kept on eyes, teeth or hair, or free and why. When the region
   * was found, it also offers the automatic mode, which fills the mask from it.
   */
  import type { LayerId } from '../../core/doc';
  import { facePick, hasWork, limitTool, LIMIT_WORDS, placeOf, refillRegion, setToolLimit, setToolMode, toolLimit, type ToolMode } from '../facepick.svelte';
  import ProgressCard from '../ProgressCard.svelte';
  import { regionShow } from '../regionshow.svelte';
  import Segment from '../Segment.svelte';
  import Switch from '../Switch.svelte';
  import { engine, ui } from '../state.svelte';

  /** Manchas has no layer: its work is the list of healed spots. */
  let { layer = null }: { layer?: LayerId | null } = $props();

  const e = engine();
  const words = $derived(toolLimit.region ? LIMIT_WORDS[toolLimit.region] : null);
  const on = $derived(toolLimit.state === 'on');
  const auto = $derived(toolLimit.mode === 'auto');
  const filled = $derived((ui.rev, toolLimit.tool ? hasWork(e, toolLimit.tool) : !!(layer && e.doc.layers[layer]?.painted)));
  const place = $derived(placeOf(toolLimit.tool));
  const MODES = [
    { value: 'auto', label: 'Automático' },
    { value: 'manual', label: 'Manual' },
  ];
  const note = $derived.by(() => {
    if (toolLimit.state === 'no-region') return `${words?.missing} O pincel está livre.`;
    if (toolLimit.state === 'no-face') return 'Não achei rosto nesta foto. O pincel está livre.';
    if (toolLimit.state === 'failed') return 'O detector não carregou. O pincel está livre.';
    return '';
  });

  function retry(deeper: boolean) {
    const { tool, region } = toolLimit;
    if (tool && region) void limitTool(e, tool, region, deeper);
  }
</script>

<div class="limit" data-limit={toolLimit.state}>
  {#if toolLimit.state === 'searching' && facePick.task}
    <ProgressCard
      task={facePick.task}
      title={words?.finding ?? ''}
      note={facePick.download}
    />
    <button type="button" class="btn" data-testid="limit-free" onclick={() => setToolLimit(e, false)}>Pintar livre</button>
  {:else if toolLimit.state === 'on' || toolLimit.state === 'off'}
    <div data-testid="tool-mode" data-mode={toolLimit.mode}>
      <Segment label="Modo" value={toolLimit.mode} options={MODES} onchange={(v) => setToolMode(e, v as ToolMode)} />
    </div>
    {#if auto}
      {#if filled}
        <p class="note" role="status">Aplicado {place} que achei. Para retocar à mão, use Manual.</p>
      {:else if regionShow.phase || !on}
        <p class="note" role="status">Já aplico {place}.</p>
      {:else}
        <button type="button" class="btn" data-testid="auto-apply" onclick={() => refillRegion(e)}>Aplicar de novo</button>
      {/if}
    {:else}
      <Switch label={words?.name ?? ''} checked={on} testid="limit-toggle" onchange={(v) => setToolLimit(e, v)} />
      {#if on && toolLimit.missed && facePick.more}
        <button type="button" class="btn" data-testid="limit-more" onclick={() => retry(true)}>Procurar mais rostos</button>
      {/if}
    {/if}
  {:else}
    <p class="note" role="status">{note}</p>
    {#if toolLimit.state === 'failed'}
      <button type="button" class="btn" data-testid="limit-retry" onclick={() => retry(false)}>Tentar de novo</button>
    {:else if facePick.more}
      <button type="button" class="btn" data-testid="limit-more" onclick={() => retry(true)}>Procurar mais rostos</button>
    {/if}
  {/if}
</div>

<style>
  .limit {
    display: grid;
    gap: 8px;
    margin-bottom: 8px;
  }

  .limit .btn {
    justify-self: start;
    font-size: 14px;
  }

  .note {
    font-size: 13px;
    line-height: 1.3;
    color: var(--paper-2);
  }

</style>
