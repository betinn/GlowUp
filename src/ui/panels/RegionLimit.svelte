<script lang="ts">
  /**
   * Says where the brush stands: searching, kept on eyes or teeth, or free and why. When the region
   * was found, it also offers the automatic mode, which fills the mask from it.
   */
  import type { LayerId } from '../../core/doc';
  import { facePick, limitTool, LIMIT_WORDS, PLACES, refillRegion, setToolLimit, setToolMode, toolLimit, type ToolMode } from '../facepick.svelte';
  import ProgressCard from '../ProgressCard.svelte';
  import { regionShow } from '../regionshow.svelte';
  import Segment from '../Segment.svelte';
  import { engine, ui } from '../state.svelte';

  let { layer }: { layer: LayerId } = $props();

  const e = engine();
  const words = $derived(toolLimit.region ? LIMIT_WORDS[toolLimit.region] : null);
  const on = $derived(toolLimit.state === 'on');
  const auto = $derived(toolLimit.mode === 'auto');
  const filled = $derived((ui.rev, !!e.doc.layers[layer]?.painted));
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
      note={facePick.firstUse ? 'Só na primeira vez, cerca de 6 MB. A foto não sai do seu aparelho.' : ''}
    />
    <button type="button" class="btn" data-testid="limit-free" onclick={() => setToolLimit(e, false)}>Pintar livre</button>
  {:else if toolLimit.state === 'on' || toolLimit.state === 'off'}
    <div data-testid="tool-mode" data-mode={toolLimit.mode}>
      <Segment label="Modo" value={toolLimit.mode} options={MODES} onchange={(v) => setToolMode(e, v as ToolMode)} />
    </div>
    {#if auto}
      {#if filled}
        <p class="note" role="status">Aplicado {PLACES[toolLimit.region ?? 'iris']} que achei. Para retocar à mão, use Manual.</p>
      {:else if regionShow.phase || !on}
        <p class="note" role="status">Já aplico {PLACES[toolLimit.region ?? 'iris']}.</p>
      {:else}
        <button type="button" class="btn" data-testid="auto-apply" onclick={() => refillRegion(e)}>Aplicar de novo</button>
      {/if}
    {:else}
      <button type="button" class="switch" class:on role="switch" aria-checked={on} data-testid="limit-toggle" onclick={() => setToolLimit(e, !on)}>
        <span>{words?.name}</span>
        <span class="state">{on ? 'Ligado' : 'Desligado'}</span>
        <span class="track" aria-hidden="true"></span>
      </button>
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

  .switch {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    padding: 0 4px 0 12px;
    border-radius: 14px;
    color: var(--paper-2);
    font-size: 13px;
    transition:
      color var(--t-fast),
      background var(--t-fast);
  }

  .switch:hover {
    background: rgb(255 255 255 / 0.06);
  }

  .switch.on {
    color: var(--safe);
    background: rgb(255 184 119 / 0.1);
  }

  .state {
    margin-left: auto;
  }

  .track {
    position: relative;
    flex: none;
    width: 34px;
    height: 20px;
    margin-right: 8px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.16);
    transition: background var(--t-fast);
  }

  .track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--paper);
    transition: translate var(--t-fast) var(--ease-reveal);
  }

  .switch.on .track {
    background: var(--safe);
  }

  .switch.on .track::after {
    translate: 14px 0;
    background: var(--ink);
  }
</style>
