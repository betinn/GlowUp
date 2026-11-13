<script lang="ts">
  /**
   * The files of the post: one a slide, at the width the person chooses. The slides light up one by one as each
   * is drawn. On a phone the files go straight to the share sheet, in order; elsewhere they come down as one zip.
   */
  import { onDestroy, onMount, tick } from 'svelte';
  import { canEncode, type ExportFormat } from '../../core/export';
  import { pageCount, pageSize, ratioById, type PostDoc } from '../../core/post/layout';
  import Icon from '../Icon.svelte';
  import ProgressCard from '../ProgressCard.svelte';
  import Segment from '../Segment.svelte';
  import Slider from '../Slider.svelte';
  import { reveal, rise } from '../motion';
  import { Task } from '../task.svelte';
  import { exportPost, POST_WIDTHS, zipFiles } from './export';
  import { doc, save as savePost } from './studiostate.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const FORMATS: { value: ExportFormat; label: string }[] = [
    { value: 'image/jpeg', label: 'JPG' },
    { value: 'image/png', label: 'PNG' },
    { value: 'image/webp', label: 'WebP' },
  ];

  /** The post as it is when the sheet opens. */
  const d = $state.snapshot(doc()) as PostDoc;
  const total = pageCount(d);
  const ratio = ratioById(d.ratio);
  const MINI = 64;
  const mini = { w: ratio.w >= ratio.h ? MINI : Math.round((MINI * ratio.w) / ratio.h), h: ratio.w >= ratio.h ? Math.round((MINI * ratio.h) / ratio.w) : MINI };

  let format = $state<ExportFormat>('image/jpeg');
  let quality = $state(92);
  let width = $state<number>(POST_WIDTHS[0]);
  let available = $state(FORMATS.slice(0, 2));
  let job = $state<Task | null>(null);
  let done = $state<{ files: File[]; bundle: File | null; ms: number; saved: boolean } | null>(null);
  let failed = $state(false);
  /** Slides drawn so far. */
  let lit = $state(0);
  const minis: HTMLCanvasElement[] = $state([]);

  const size = $derived(pageSize(ratio, width));
  const running = $derived(!!job && !done);
  const canShare = $derived(!!done && !!navigator.canShare?.({ files: done.files }));
  const bytes = $derived(done ? done.files.reduce((sum, f) => sum + f.size, 0) : 0);

  onMount(async () => {
    if (await canEncode('image/webp')) available = FORMATS;
  });

  onDestroy(() => job?.stop());

  function download(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function saveAll() {
    if (!done) return;
    download(done.bundle ?? done.files[0]);
    done.saved = true;
    navigator.vibrate?.(18);
  }

  async function start() {
    const megapixels = (size.w * size.h) / 1e6;
    const task = new Task([
      { id: 'pages', label: total > 1 ? 'Montando os slides' : 'Montando a imagem', weight: 88 },
      { id: 'pack', label: 'Juntando os arquivos', weight: 12, estimate: 200 + megapixels * total * 12 },
    ]);
    failed = false;
    done = null;
    lit = 0;
    job = task;
    task.stage('pages');
    await tick();
    const started = performance.now();
    try {
      // The post on the device is the one that goes out.
      await savePost();
      const files = await exportPost(d, { format, quality: quality / 100, width }, {
        page(n, all, canvas) {
          task.report(n / all, all > 1 ? `slide ${n} de ${all}` : '');
          minis[n - 1]?.getContext('2d')?.drawImage(canvas, 0, 0, mini.w * 2, mini.h * 2);
          lit = n;
        },
      });
      task.stage('pack');
      const bundle = files.length > 1 ? await zipFiles(files) : null;
      task.finish('Pronta');
      done = { files, bundle, ms: performance.now() - started, saved: false };
      // Where the files can go straight to another app, the person chooses where. Elsewhere they come down now.
      await tick();
      if (!canShare) saveAll();
    } catch (err) {
      console.error(err);
      task.stop();
      failed = true;
      job = null;
    }
  }

  const close = () => {
    if (!running) onclose();
  };

  const sizeLabel = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
  const what = total > 1 ? `${total} slides` : '1 imagem';
</script>

<div class="scrim" role="presentation" onclick={close}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label="Exportar a montagem" data-testid="post-export" transition:rise>
  <div class="head">
    <h2 class="serif">Levar a montagem</h2>
    <button type="button" class="icon-btn" aria-label="Fechar" onclick={close} disabled={running}><Icon name="close" /></button>
  </div>

  {#if job}
    <div class="minis scroll-x" class:done={!!done} aria-label="Slides prontos">
      {#each { length: total } as _, page (page)}
        <button type="button" class="mini" class:lit={page < lit} disabled={!done} title={done ? `Baixar só o slide ${page + 1}` : ''} aria-label="Baixar só o slide {page + 1}"
          data-testid="post-file" style:--delay="{page * 60}ms" onclick={() => done && download(done.files[page])}>
          <canvas bind:this={minis[page]} width={mini.w * 2} height={mini.h * 2} style:width="{mini.w}px" style:height="{mini.h}px"></canvas>
          <span>{page + 1}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if job && !done}
    <ProgressCard task={job} title="Exportando a montagem" note="{what} de {size.w} × {size.h} px. Tudo acontece aqui, no seu aparelho." />
  {:else if done}
    <div class="done" in:reveal data-testid="post-exported" data-files={done.files.length}>
      <p class="serif big">{done.saved ? 'Prontinho. Tá na sua pasta.' : 'Prontinho. Para onde vai?'}</p>
      <p class="meta">{what} de {size.w} × {size.h} px, {sizeLabel(bytes)}, em {(done.ms / 1000).toFixed(1)} s</p>
      <div class="actions">
        {#if canShare}
          <button type="button" class="btn primary" data-testid="post-share" onclick={() => navigator.share({ files: done!.files }).catch(() => {})}>Compartilhar</button>
        {/if}
        <button type="button" class="btn" class:primary={!canShare} data-testid="post-download" onclick={saveAll}>
          {done.bundle ? (done.saved ? 'Baixar o .zip de novo' : 'Baixar tudo em .zip') : done.saved ? 'Baixar de novo' : 'Baixar'}
        </button>
        <button type="button" class="btn" onclick={onclose}>Voltar a montar</button>
      </div>
      {#if total > 1}
        <p class="meta tip">Os arquivos saem numerados, na ordem dos slides. Um toque num slide aí em cima baixa só ele.</p>
      {/if}
    </div>
  {:else}
    <Segment label="Formato" value={format} options={available} onchange={(v) => (format = v as ExportFormat)} />
    {#if format !== 'image/png'}
      <Slider label="Qualidade" value={quality} min={40} max={100} oninput={(v) => (quality = v)} />
    {/if}
    <Segment label="Largura do slide" value={String(width)} options={POST_WIDTHS.map((v) => ({ value: String(v), label: `${v} px` }))} onchange={(v) => (width = Number(v))} />
    <p class="meta" data-testid="post-export-size">
      {what} de {size.w} × {size.h} px. {width === POST_WIDTHS[0] ? 'É a largura que o feed mostra.' : 'Mais larga que o feed: guarda mais detalhe para o zoom.'}
    </p>
    {#if failed}
      <p class="meta error" role="alert" data-testid="post-export-failed">Não deu certo dessa vez. Tenta de novo, ou tenta uma largura menor.</p>
    {/if}
    <button type="button" class="btn primary wide" data-testid="post-export-go" onclick={start}>{total > 1 ? 'Exportar os slides' : 'Exportar a imagem'}</button>
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

  .tip {
    margin: 12px 0 0;
  }

  .error {
    color: var(--safe);
  }

  .wide {
    width: 100%;
    min-height: 50px;
  }

  .minis {
    display: flex;
    gap: 8px;
    padding: 6px 2px 12px;
  }

  /* A slide still to come is dim. It lights up when it is drawn, as a print coming up in the tray. */
  .mini {
    position: relative;
    flex: none;
    border-radius: 6px;
    overflow: hidden;
    background: var(--ink-3);
    box-shadow: 0 0 0 1px var(--line);
    opacity: 0.35;
    filter: blur(1.5px) brightness(0.7);
    transition:
      opacity var(--t-slow) var(--ease-reveal),
      filter var(--t-slow) var(--ease-reveal),
      transform var(--t-fast) var(--ease-reveal);
  }

  .mini.lit {
    opacity: 1;
    filter: none;
  }

  .minis.done .mini {
    animation: lift 0.7s var(--delay) var(--ease-reveal) both;
  }

  .minis.done .mini:hover {
    transform: translateY(-2px);
  }

  @keyframes lift {
    0% {
      box-shadow: 0 0 0 1px var(--line);
    }
    40% {
      transform: translateY(-5px);
      box-shadow:
        0 0 0 1px var(--safe),
        0 10px 24px -8px rgb(255 184 119 / 0.5);
    }
    100% {
      transform: none;
      box-shadow: 0 0 0 1px var(--line-2);
    }
  }

  .mini canvas {
    display: block;
  }

  .mini span {
    position: absolute;
    left: 3px;
    bottom: 3px;
    min-width: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: rgb(11 11 12 / 0.72);
    font-size: 10.5px;
    line-height: 16px;
    font-variant-numeric: tabular-nums;
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
