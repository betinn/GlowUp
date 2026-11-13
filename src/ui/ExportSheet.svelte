<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { canEncode, encodeImage, renderImage, type ExportFormat } from '../core/export';
  import { nextPaint, timeLeft } from '../core/progress';
  import { capFor, capNote, pickScale, scalesFor, type Scale } from '../core/superres/size';
  import { onPhone } from './device';
  import { fillSettled } from './fill.svelte';
  import { outputSize } from '../core/geometry';
  import Icon from './Icon.svelte';
  import ProgressCard from './ProgressCard.svelte';
  import Segment from './Segment.svelte';
  import Slider from './Slider.svelte';
  import Switch from './Switch.svelte';
  import { cancelUpscale, expectedMs, UPSCALE_DOWNLOAD_MB, upscaleCanvas, upscaleFailure, upscaleReady, type UpscaleFailure } from './upscale';
  import { grow as toolGrow } from './upscaletool.svelte';
  import { reveal, rise } from './motion';
  import { startPost } from './open';
  import { autosave, engine, ui } from './state.svelte';
  import { Task } from './task.svelte';

  const e = engine();
  const size = outputSize(e.doc.crop);

  const FORMATS: { value: ExportFormat; label: string; ext: string }[] = [
    { value: 'image/jpeg', label: 'JPG', ext: 'jpg' },
    { value: 'image/png', label: 'PNG', ext: 'png' },
    { value: 'image/webp', label: 'WebP', ext: 'webp' },
  ];

  /** The upscale is an option of the file, off unless asked for, within the cap of this device. */
  const cap = capFor(onPhone());
  const scales = scalesFor(size.w, size.h, cap);
  const capWords = capNote(size.w, size.h, cap);
  let grow = $state(false);
  let scale = $state<Scale>(pickScale(size.w, size.h, cap) ?? 2);
  /** The file will be upscaled: asked for, within the cap, and the model not busy with the tool. */
  const enlarge = $derived(grow && scales.length > 0 && toolGrow.state !== 'running');
  const outW = $derived(enlarge ? size.w * scale : size.w);
  const outH = $derived(enlarge ? size.h * scale : size.h);
  /** The upscale is running, and can be stopped. */
  let growing = $state(false);
  let stoppedNote = $state(false);

  let format = $state<ExportFormat>('image/jpeg');
  let quality = $state(92);
  let available = $state(FORMATS.slice(0, 2));
  let job = $state<Task | null>(null);
  let done = $state<{ file: File; ms: number } | null>(null);
  /** What went wrong with the last try, so the note says what to do about it. */
  let failed = $state<UpscaleFailure | 'file' | null>(null);
  /** The format of the last try. */
  let failedFormat = $state<ExportFormat>('image/jpeg');
  let preview = $state<HTMLCanvasElement>();
  /** The print plays its saved moment: it lifts into the light, a gleam crosses it and a seal stamps it. */
  let saved = $state(false);
  let frame = $state<HTMLDivElement>();

  /** Sparks around the seal, as angles in degrees. */
  const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

  /** Long side of the miniature that fills up while exporting. */
  const PREVIEW_SIDE = 300;
  const previewScale = PREVIEW_SIDE / Math.max(size.w, size.h);
  const previewW = Math.round(size.w * previewScale);
  const previewH = Math.round(size.h * previewScale);

  const running = $derived(!!job && !done);
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
    void celebrate();
  }

  /** Plays the saved moment again from the start, for each save. */
  async function celebrate() {
    saved = false;
    await tick();
    void frame?.offsetWidth;
    saved = true;
    navigator.vibrate?.(18);
  }

  /** Starts the miniature with a dim copy of what is on screen. Finished tiles light it up. */
  function seedPreview(c: CanvasRenderingContext2D) {
    e.renderNow();
    const [x0, y0] = e.outputToCss(0, 0);
    const [x1, y1] = e.outputToCss(1, 1);
    const k = e.dpr;
    c.fillStyle = '#1d1d20';
    c.fillRect(0, 0, previewW, previewH);
    c.globalAlpha = 0.3;
    c.drawImage(e.canvas, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, previewW, previewH);
    c.globalAlpha = 1;
  }

  async function start() {
    const { label, ext } = FORMATS.find((f) => f.value === format)!;
    const megapixels = (outW * outH) / 1e6;
    const upscaling = enlarge;
    const task = new Task([
      { id: 'tiles', label: 'Aplicando seus retoques', weight: upscaling ? 6 : 78 },
      ...(upscaling && !upscaleReady()
        ? [
            { id: 'download', label: 'Baixando o modelo de resolução', weight: 20 },
            { id: 'start', label: 'Ligando o modelo', weight: 4, estimate: 3000 },
          ]
        : []),
      ...(upscaling ? [{ id: 'upscale', label: `Aumentando ${scale}×`, weight: 60 }] : []),
      { id: 'encode', label: `Comprimindo em ${label}`, weight: upscaling ? 10 : 22, estimate: 150 + megapixels * (format === 'image/png' ? 160 : 50) },
    ]);
    failed = null;
    stoppedNote = false;
    done = null;
    job = task;
    task.stage('tiles');
    await tick();
    const c = preview?.getContext('2d') ?? null;
    if (c) seedPreview(c);
    /** The upscale is the step running, so a failure is told as one of the upscale. */
    let upscaleStep = false;
    try {
      // A completion still running would leave its quick guess in the file.
      await fillSettled();
      const started = performance.now();
      let canvas: OffscreenCanvas | null = await renderImage(e, {
        tile(n, total, canvas, r) {
          task.report(n / total, total > 1 ? `parte ${n} de ${total}` : '');
          c?.drawImage(canvas, r.x, r.y, r.w, r.h, r.x * previewScale, r.y * previewScale, r.w * previewScale, r.h * previewScale);
        },
      });
      if (upscaling) {
        growing = true;
        upscaleStep = true;
        canvas = await upscaleCanvas(canvas, scale, {
          downloading: (fraction, left) => {
            task.stage('download');
            task.report(fraction, left);
          },
          starting: (left) => task.stage('start', left),
          running: (fraction, left) => {
            task.stage('upscale');
            task.report(fraction, left);
          },
        });
        growing = false;
        upscaleStep = false;
        if (!canvas) {
          // Stopped: nothing is saved, and the options come back as they were.
          task.stop();
          job = null;
          stoppedNote = true;
          return;
        }
      }
      task.stage('encode');
      await nextPaint();
      const blob = await encodeImage(canvas, { format, quality: quality / 100 });
      const file = new File([blob], `glowup-${Date.now().toString(36)}.${ext}`, { type: format });
      task.finish('Pronta');
      done = { file, ms: performance.now() - started };
      save(file);
    } catch (err) {
      console.error(err);
      task.stop();
      failed = upscaleStep ? upscaleFailure(err) : 'file';
      failedFormat = format;
      job = null;
    } finally {
      growing = false;
    }
  }

  onDestroy(() => {
    job?.stop();
    if (growing) cancelUpscale();
  });

  const close = () => {
    if (!running) ui.exportOpen = false;
  };

  /**
   * The photo becomes the first of a post, with its retouch: a carousel, a collage or a strip cut into slides.
   * More photos join it there.
   */
  async function montage() {
    const a = autosave();
    if (!a || running) return;
    const thumb = await e.source?.thumbnail(320).catch(() => null);
    ui.exportOpen = false;
    void startPost([], null, { id: a.id, name: a.name, thumb });
  }

  /** What to say when saving failed: what happened, and what may work instead. */
  function failedWords(why: UpscaleFailure | 'file', was: ExportFormat): string {
    if (why === 'download') return 'Não deu para baixar o modelo que aumenta a resolução. Confere a internet e tenta de novo, ou desliga Aumentar resolução para salvar sem ele.';
    if (why === 'upscale') return 'O aumento de resolução não deu certo dessa vez. Tenta de novo, ou desliga Aumentar resolução para salvar sem ele.';
    const others = FORMATS.filter((f) => f.value !== was && f.value !== 'image/webp').map((f) => f.label);
    return `Não deu certo dessa vez. Tenta de novo, ou tenta ${others.join(' ou ')}.`;
  }

  const sizeLabel = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`);
</script>

<div class="scrim" role="presentation" onclick={close}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label="Exportar foto" transition:rise>
  <div class="head">
    <h2 class="serif">Levar a foto</h2>
    <button type="button" class="icon-btn" aria-label="Fechar" onclick={close} disabled={running}><Icon name="close" /></button>
  </div>

  {#if job}
    <div class="print">
      <div class="frame" class:saved bind:this={frame} data-saved={saved ? 'yes' : null}>
        <canvas bind:this={preview} width={previewW} height={previewH} data-testid="export-preview"></canvas>
        {#if done}
          <span class="gleam" aria-hidden="true"></span>
          <span class="seal" aria-hidden="true">
            {#each SPARKS as angle (angle)}
              <span class="spark" style:--angle="{angle}deg"></span>
            {/each}
            <svg viewBox="0 0 36 36" width="36" height="36">
              <circle cx="18" cy="18" r="17" />
              <path d="M11 18.5 16 23.5 25.5 13" pathLength="1" />
            </svg>
          </span>
        {/if}
      </div>
    </div>
  {/if}

  {#if job && !done}
    <ProgressCard
      task={job}
      title="Exportando a foto"
      note="{outW} × {outH} px{enlarge ? `, aumentada ${scale}× aqui no aparelho` : ', resolução total'}. Pode deixar a aba aberta."
    />
    {#if growing}
      <button type="button" class="btn wide stop" data-testid="export-upscale-cancel" onclick={cancelUpscale}>Cancelar</button>
    {/if}
  {:else if done}
    <div class="done" in:reveal>
      <p class="serif big">Prontinho. Tá na sua pasta.</p>
      <p class="meta">
        {outW} × {outH} px, {sizeLabel(done.file.size)}, em {(done.ms / 1000).toFixed(1)} s
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
    <div class="grow" data-testid="export-upscale" data-on={grow ? 'yes' : 'no'}>
      {#if toolGrow.state === 'running'}
        <p class="meta" data-testid="export-upscale-note">A ferramenta Aumentar resolução está trabalhando. Quando ela acabar, dá para aumentar aqui também.</p>
      {:else if scales.length}
        <Switch label="Aumentar resolução" checked={grow} testid="export-upscale-switch" onchange={(on) => (grow = on)} />
        {#if grow}
          {#if scales.length > 1}
            <Segment label="Quanto" value={String(scale)} options={scales.map((s) => ({ value: String(s), label: `${s}×` }))} onchange={(v) => (scale = Number(v) as Scale)} />
          {/if}
          <p class="meta" data-testid="export-upscale-note">
            Um modelo refaz os detalhes aqui no aparelho{upscaleReady() ? '' : `, baixado uma vez${onPhone() ? `, cerca de ${UPSCALE_DOWNLOAD_MB} MB: melhor no Wi-Fi` : ''}`}. Deve levar {timeLeft(expectedMs(size.w * size.h))}.
            {capWords}
          </p>
        {/if}
      {:else}
        <p class="meta" data-testid="export-upscale-note">{capWords}</p>
      {/if}
    </div>
    <p class="meta" data-testid="export-size">{outW} × {outH} px{enlarge ? `, aumentada ${scale}×` : ', resolução total'}</p>
    {#if stoppedNote}
      <p class="meta" role="status">Parou. Nada foi salvo.</p>
    {/if}
    {#if failed}
      <p class="meta error" role="alert" data-testid="export-failed" data-failed={failed}>{failedWords(failed, failedFormat)}</p>
    {/if}
    <button type="button" class="btn primary wide" data-testid="export-go" onclick={start}>Salvar no aparelho</button>
    <button type="button" class="montage" data-testid="export-post" onclick={montage}>
      <Icon name="stack" size={18} />
      <span>Montar carrossel ou colagem com esta foto</span>
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
    width: 100%;
    min-height: 50px;
  }

  .stop {
    margin-top: 12px;
  }

  /* A second way out of the editor, quieter than the first: the photo goes on to a post of several. */
  .montage {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 46px;
    margin-top: 6px;
    border-radius: 999px;
    font-size: 14px;
    color: var(--paper-2);
    transition:
      color var(--t-fast),
      background var(--t-fast);
  }

  .montage:hover {
    color: var(--paper);
    background: rgb(255 255 255 / 0.06);
  }

  .grow {
    display: grid;
    gap: 4px;
    margin-top: 8px;
  }

  .grow .meta {
    margin: 0 0 4px;
  }

  .print {
    display: grid;
    grid-template: 100% / 100%;
    place-items: center;
    height: min(240px, 34dvh);
    margin: 6px 0 16px;
  }

  .frame {
    position: relative;
    max-width: 100%;
    border-radius: 4px;
  }

  canvas {
    display: block;
    max-width: 100%;
    max-height: min(240px, 34dvh);
    border-radius: 4px;
    box-shadow: 0 0 0 1px var(--line);
  }

  /*
   * The saved moment, in the darkroom: the print lifts into the light, a gleam runs across it, and a seal
   * stamps its corner with a few sparks of the safelight.
   */
  .frame.saved {
    animation: lift 1s var(--ease-reveal) both;
  }

  @keyframes lift {
    0% {
      transform: none;
      box-shadow: 0 0 0 0 rgb(255 184 119 / 0);
    }
    35% {
      transform: translateY(-6px) scale(1.035);
      box-shadow: 0 14px 40px -8px rgb(255 184 119 / 0.45);
    }
    100% {
      transform: none;
      box-shadow: 0 8px 24px -10px rgb(255 184 119 / 0.25);
    }
  }

  .gleam {
    position: absolute;
    inset: 0;
    border-radius: 4px;
    overflow: hidden;
    pointer-events: none;
  }

  .gleam::before {
    content: '';
    position: absolute;
    inset: -20% auto -20% 0;
    width: 45%;
    background: linear-gradient(100deg, transparent, rgb(255 255 255 / 0.55) 50%, transparent);
    transform: translateX(-120%) skewX(-12deg);
    opacity: 0;
  }

  .saved .gleam::before {
    animation: gleam 0.75s 0.15s var(--ease-swift) both;
  }

  @keyframes gleam {
    0% {
      transform: translateX(-120%) skewX(-12deg);
      opacity: 1;
    }
    100% {
      transform: translateX(260%) skewX(-12deg);
      opacity: 1;
    }
  }

  .seal {
    position: absolute;
    right: -14px;
    bottom: -14px;
    width: 36px;
    height: 36px;
    transform: scale(0);
  }

  .saved .seal {
    animation: stamp 0.45s 0.45s var(--ease-reveal) both;
  }

  @keyframes stamp {
    0% {
      transform: scale(0) rotate(-30deg);
    }
    70% {
      transform: scale(1.18) rotate(4deg);
    }
    100% {
      transform: scale(1) rotate(0);
    }
  }

  .seal svg {
    position: relative;
    display: block;
    filter: drop-shadow(0 4px 10px rgb(0 0 0 / 0.5));
  }

  .seal circle {
    fill: var(--safe);
  }

  .seal path {
    fill: none;
    stroke: var(--ink);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
  }

  .saved .seal path {
    animation: draw 0.35s 0.7s ease-out both;
  }

  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }

  .spark {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5px;
    height: 5px;
    margin: -2.5px;
    border-radius: 50%;
    background: var(--safe);
    opacity: 0;
  }

  .saved .spark {
    animation: spark 0.6s 0.55s ease-out both;
  }

  @keyframes spark {
    0% {
      transform: rotate(var(--angle)) translateX(8px) scale(1);
      opacity: 1;
    }
    100% {
      transform: rotate(var(--angle)) translateX(30px) scale(0.3);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .frame.saved,
    .saved .gleam::before,
    .saved .spark {
      animation: none;
    }

    .saved .seal,
    .saved .seal path {
      animation: none;
      transform: none;
      stroke-dashoffset: 0;
    }
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
