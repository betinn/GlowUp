<script lang="ts">
  /**
   * The automatic mode of the open tool, for any panel: where it stands, the selector, and what to do when
   * the search finds nothing. A tool with a region also gets the switch that keeps the brush on it. It
   * takes no props and shows nothing while no tool is under `toolLimit`.
   */
  import { facePick, hasWork, limitTool, limitWords, placeOf, refillRegion, setToolLimit, toolLimit } from '../facepick.svelte';
  import ProgressCard from '../ProgressCard.svelte';
  import { regionShow } from '../regionshow.svelte';
  import Switch from '../Switch.svelte';
  import { engine, ui } from '../state.svelte';
  import ModeSelector from './ModeSelector.svelte';

  const e = engine();
  const words = $derived(limitWords(toolLimit.tool, toolLimit.region));
  const on = $derived(toolLimit.state === 'on');
  const auto = $derived(toolLimit.mode === 'auto');
  const filled = $derived((ui.rev, !!toolLimit.tool && hasWork(e, toolLimit.tool)));
  const place = $derived(placeOf(toolLimit.tool));
  const applied = $derived(words && 'applied' in words ? words.applied : undefined);
  /** Without a region there is no brush to promise, and the words of the tool say it all. */
  const note = $derived.by(() => {
    if (!toolLimit.region) {
      if (toolLimit.state === 'failed') return 'O detector não carregou.';
      return words?.missing ?? '';
    }
    if (toolLimit.state === 'no-region') return `${words?.missing} O pincel está livre.`;
    if (toolLimit.state === 'no-face') return 'Não achei rosto nesta foto. O pincel está livre.';
    if (toolLimit.state === 'failed') return 'O detector não carregou. O pincel está livre.';
    return '';
  });

  function retry(deeper: boolean) {
    const { tool, region } = toolLimit;
    if (tool) void limitTool(e, tool, region, deeper);
  }
</script>

{#if toolLimit.tool}
  <div class="limit" data-limit={toolLimit.state}>
    {#if toolLimit.state === 'searching' && facePick.task}
      <ProgressCard
        task={facePick.task}
        title={words?.finding ?? ''}
        note={facePick.download}
      />
      <button type="button" class="btn" data-testid="limit-free" onclick={() => setToolLimit(e, false)}>{toolLimit.region ? 'Pintar livre' : 'Fazer à mão'}</button>
    {:else if toolLimit.state === 'on' || toolLimit.state === 'off'}
      <ModeSelector />
      {#if auto}
        {#if filled}
          <p class="note" role="status">{applied ?? `Aplicado ${place} que achei. Para tirar, toque de novo na ferramenta. Para retocar à mão, use Manual.`}</p>
        {:else if regionShow.phase || !on}
          <p class="note" role="status">Já aplico {place}.</p>
        {:else}
          <button type="button" class="btn" data-testid="auto-apply" onclick={() => refillRegion(e)}>Aplicar de novo</button>
        {/if}
      {:else if toolLimit.region}
        <Switch label={words && 'name' in words ? words.name : ''} checked={on} testid="limit-toggle" onchange={(v) => setToolLimit(e, v)} />
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
{/if}

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
