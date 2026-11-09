<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { canEncode, exportImage, type ExportFormat } from '../core/export';
  import { fillSettled } from './fill.svelte';
  import { outputSize } from '../core/geometry';
  import Icon from './Icon.svelte';
  import ProgressCard from './ProgressCard.svelte';
  import Segment from './Segment.svelte';
  import Slider from './Slider.svelte';
  import { reveal, rise } from './motion';
  import { engine, ui } from './state.svelte';
  import { Task } from './task.svelte';

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
  let job = $state<Task | null>(null);
  let done = $state<{ file: File; ms: number } | null>(null);
  let failed = $state(false);
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
    const megapixels = (size.w * size.h) / 1e6;
    const task = new Task([
      { id: 'tiles', label: 'Aplicando seus retoques', weight: 78 },
      { id: 'encode', label: `Comprimindo em ${label}`, weight: 22, estimate: 150 + megapixels * (format === 'image/png' ? 160 : 50) },
    ]);
    failed = false;
    done = null;
    job = task;
    task.stage('tiles');
    await tick();
    const c = preview?.getContext('2d') ?? null;
    if (c) seedPreview(c);
    try {
      // A completion still running would leave its quick guess in the file.
      await fillSettled();
      const started = performance.now();
      const blob = await exportImage(
        e,
        { format, quality: quality / 100 },
        {
          tile(n, total, canvas, r) {
            task.report(n / total, total > 1 ? `parte ${n} de ${total}` : '');
            c?.drawImage(canvas, r.x, r.y, r.w, r.h, r.x * previewScale, r.y * previewScale, r.w * previewScale, r.h * previewScale);
          },
          encoding: () => task.stage('encode'),
        },
      );
      const file = new File([blob], `glowup-${Date.now().toString(36)}.${ext}`, { type: format });
      task.finish('Pronta');
      done = { file, ms: performance.now() - started };
      save(file);
    } catch (err) {
      console.error(err);
      task.stop();
      failed = true;
      job = null;
    }
  }

  onDestroy(() => job?.stop());

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
    <ProgressCard task={job} title="Exportando a foto" note="{size.w} × {size.h} px, resolução total. Pode deixar a aba aberta." />
  {:else if done}
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
    <button type="button" class="btn primary wide" data-testid="export-go" onclick={start}>Salvar no aparelho</button>
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
