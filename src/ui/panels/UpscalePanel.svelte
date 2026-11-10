<script lang="ts">
  /**
   * The tool "Aumentar resolução": how big the photo is, how big it can get on this device, and why not more.
   * While it runs: progress with the time left, and a way to stop it.
   */
  import { outputSize } from '../../core/geometry';
  import { timeLeft } from '../../core/progress';
  import { capFor, capNote, pickScale, scalesFor, type Scale } from '../../core/superres/size';
  import { onPhone } from '../device';
  import ProgressCard from '../ProgressCard.svelte';
  import Segment from '../Segment.svelte';
  import { engine, ui } from '../state.svelte';
  import { expectedMs, UPSCALE_DOWNLOAD_MB, upscaleReady } from '../upscale';
  import { cancelGrow, grow, startGrow } from '../upscaletool.svelte';

  const e = engine();
  const size = $derived((ui.rev, outputSize(e.doc.crop)));
  const cap = capFor(onPhone());
  const scales = $derived(scalesFor(size.w, size.h, cap));
  const why = $derived(capNote(size.w, size.h, cap));
  let picked = $state<Scale | null>(null);
  const scale = $derived(picked && scales.includes(picked) ? picked : pickScale(size.w, size.h, cap));
  const busy = $derived(grow.state === 'running' && !!grow.task);
  const note = $derived(
    !upscaleReady() && grow.task?.label.startsWith('Baixando')
      ? `Baixa uma vez${onPhone() ? `, cerca de ${UPSCALE_DOWNLOAD_MB} MB: melhor no Wi-Fi` : ''}, e fica no aparelho. Já dá para olhar a foto.`
      : 'Já dá para olhar a foto. O que mudar enquanto isso fica no projeto de agora.',
  );
</script>

<div class="grow" data-testid="upscale-panel" data-grow={grow.state}>
  {#if busy && grow.task}
    <ProgressCard task={grow.task} title="Aumentando a resolução" {note} />
    {#if grow.stoppable}
      <button type="button" class="btn" data-testid="upscale-cancel" onclick={cancelGrow}>Cancelar</button>
    {/if}
  {:else}
    <p class="meta" data-testid="upscale-size">Agora: {size.w} × {size.h} px{scale ? `. Fica: ${size.w * scale} × ${size.h * scale} px` : ''}.</p>
    {#if scales.length > 1}
      <Segment label="Quanto" value={String(scale)} options={scales.map((s) => ({ value: String(s), label: `${s}×` }))} onchange={(v) => (picked = Number(v) as Scale)} />
    {/if}
    {#if why}
      <p class="meta" data-testid="upscale-cap">{why}</p>
    {/if}
    {#if scale}
      <p class="meta">
        Um modelo refaz os detalhes de rosto, cabelo e pele aqui no aparelho{upscaleReady() ? '' : `, baixado uma vez${onPhone() ? `, cerca de ${UPSCALE_DOWNLOAD_MB} MB: melhor no Wi-Fi` : ''}`}. Deve levar
        {timeLeft(expectedMs(size.w * size.h))}. Seus retoques entram na foto nova, e o projeto de agora fica na lista.
      </p>
      {#if grow.stopped}
        <p class="meta" role="status" data-testid="upscale-stopped">Parou. A foto continua como estava.</p>
      {/if}
      <button type="button" class="btn primary" data-testid="upscale-go" onclick={() => startGrow(e, scale)}>Aumentar {scale}×</button>
    {/if}
  {/if}
</div>

<style>
  .grow {
    display: grid;
    gap: 10px;
  }

  .meta {
    font-size: 13px;
    line-height: 1.35;
    color: var(--paper-2);
  }

  .btn {
    justify-self: start;
  }
</style>
