<script lang="ts">
  import { onMount } from 'svelte';
  import { canEncode, exportImage, type ExportFormat } from '../core/export';
  import { outputSize } from '../core/geometry';
  import Icon from './Icon.svelte';
  import Segment from './Segment.svelte';
  import Slider from './Slider.svelte';
  import { reveal, rise } from './motion';
  import { engine, ui } from './state.svelte';

  const e = engine();
  const size = outputSize(e.doc.crop);

  const FORMATS: { value: ExportFormat; label: string; ext: string }[] = [
    { value: 'image/jpeg', label: 'JPG', ext: 'jpg' },
    { value: 'image/png', label: 'PNG', ext: 'png' },
    { value: 'image/webp', label: 'WebP', ext: 'webp' },
  ];

  let format = $state<ExportFormat>('image/jpeg');
  let quality = $state(92);
  let available = $state(FORMATS.slice(0, 2));
  let progress = $state(-1);
  let done = $state<{ file: File; ms: number } | null>(null);
  let failed = $state(false);

  const running = $derived(progress >= 0 && !done);
  const canShare = $derived(!!done && !!navigator.canShare?.({ files: [done.file] }));

  onMount(async () => {
    if (await canEncode('image/webp')) available = FORMATS;
  });

  function save(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function start() {
    failed = false;
    done = null;
    progress = 0;
    const started = performance.now();
    try {
      const blob = await exportImage(e, { format, quality: quality / 100 }, (f) => (progress = f));
      const ext = FORMATS.find((f) => f.value === format)!.ext;
      const file = new File([blob], `glowup-${Date.now().toString(36)}.${ext}`, { type: format });
      done = { file, ms: performance.now() - started };
      save(file);
    } catch (err) {
      console.error(err);
      failed = true;
      progress = -1;
    }
  }

  const close = () => {
    if (!running) ui.exportOpen = false;
  };

  const sizeLabel = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`);
</script>

<div class="scrim" role="presentation" onclick={close}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label="Exportar foto" transition:rise>
  <div class="head">
    <h2 class="serif">Levar a foto</h2>
    <button type="button" class="icon-btn" aria-label="Fechar" onclick={close} disabled={running}><Icon name="close" /></button>
  </div>

  {#if done}
    <div class="done" in:reveal>
      <p class="serif big">Prontinho. Tá na sua pasta.</p>
      <p class="meta">
        {size.w} × {size.h} px, {sizeLabel(done.file.size)}, em {(done.ms / 1000).toFixed(1)} s
      </p>
      <div class="actions">
        {#if canShare}
          <button type="button" class="btn primary" onclick={() => navigator.share({ files: [done!.file] }).catch(() => {})}>Compartilhar</button>
        {/if}
        <button type="button" class="btn" onclick={() => save(done!.file)}>Baixar de novo</button>
        <button type="button" class="btn" onclick={() => (ui.exportOpen = false)}>Voltar a editar</button>
      </div>
    </div>
  {:else}
    <Segment label="Formato" value={format} options={available} onchange={(v) => (format = v as ExportFormat)} />
    {#if format !== 'image/png'}
      <Slider label="Qualidade" value={quality} min={40} max={100} oninput={(v) => (quality = v)} />
    {/if}
    <p class="meta">{size.w} × {size.h} px, resolução total</p>
    {#if failed}
      <p class="meta error" role="alert">Não deu certo dessa vez. Tenta de novo, ou tenta PNG ou JPG.</p>
    {/if}
    <button type="button" class="btn primary wide" data-testid="export-go" onclick={start} disabled={running}>
      {#if running}
        <span class="bar" style:--p={progress}></span>
        <span class="label">Revelando… {Math.round(progress * 100)}%</span>
      {:else}
        Salvar no aparelho
      {/if}
    </button>
  {/if}
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.5);
    z-index: 40;
  }

  .sheet {
    position: fixed;
    left: 50%;
    bottom: 0;
    translate: -50% 0;
    width: min(460px, 100vw);
    padding: 16px 20px calc(20px + var(--safe-bottom));
    background: var(--ink-2);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 20px 20px 0 0;
    z-index: 41;
  }

  @media (min-width: 900px) {
    .sheet {
      bottom: 50%;
      translate: -50% 50%;
      border: 1px solid var(--line);
      border-radius: 20px;
    }
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  h2 {
    font-size: 28px;
  }

  .meta {
    font-size: 13px;
    color: var(--paper-2);
    margin: 8px 0 14px;
  }

  .error {
    color: var(--safe);
  }

  .wide {
    position: relative;
    width: 100%;
    overflow: hidden;
    min-height: 50px;
  }

  .bar {
    position: absolute;
    inset: 0;
    background: var(--safe);
    transform-origin: left;
    transform: scaleX(var(--p));
    transition: transform var(--t-mid) var(--ease-swift);
  }

  .label {
    position: relative;
  }

  .big {
    font-size: 30px;
    line-height: 1.1;
    margin: 6px 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
