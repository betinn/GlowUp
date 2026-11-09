<script lang="ts">
  /**
   * The completion of what a warp uncovers, as the panels of the face menu show it: progress with the time
   * left while it runs, a way to stop it, and a way to start it again.
   */
  import { cancelFill, fill, startFill } from './fill.svelte';
  import ProgressCard from './ProgressCard.svelte';
  import { engine } from './state.svelte';

  const e = engine();
  const busy = $derived(fill.state === 'download' || fill.state === 'running');
  const note = $derived(
    fill.state === 'download'
      ? 'Baixa uma vez, cerca de 29 MB, e fica no aparelho. Já dá para mexer nos controles.'
      : 'Já dá para mexer nos controles: o que aparece atrás melhora quando terminar.',
  );
</script>

<div class="fill" data-fill={fill.state} data-fill-backend={fill.backend}>
  {#if busy && fill.task}
    <ProgressCard task={fill.task} title="Completando o que fica atrás" {note} />
    <button type="button" class="btn" data-testid="fill-cancel" onclick={cancelFill}>Cancelar</button>
  {:else if fill.state === 'off'}
    <p class="note" role="status" data-testid="fill-note">Preenchimento rápido em uso: o que aparece atrás de quem se mexe fica liso.</p>
    <button type="button" class="btn" data-testid="fill-start" onclick={() => startFill(e, 'asked')}>Completar com mais qualidade</button>
  {:else if fill.state === 'failed'}
    <p class="note warn" role="status" data-testid="fill-note">O modelo de preenchimento não carregou. O que aparece atrás de quem se mexe fica liso.</p>
    <button type="button" class="btn" data-testid="fill-start" onclick={() => startFill(e, 'asked')}>Tentar de novo</button>
  {/if}
</div>

<style>
  .fill {
    display: grid;
    gap: 8px;
  }

  .fill:empty {
    display: none;
  }

  .note {
    font-size: 13px;
    line-height: 1.3;
    color: var(--paper-2);
  }

  .warn {
    color: var(--amber);
  }

  .btn {
    justify-self: start;
  }
</style>
