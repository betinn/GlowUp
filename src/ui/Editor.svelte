<script lang="ts">
  import { onDestroy, onMount, tick, untrack, type Component } from 'svelte';
  import { Engine, type EngineEvents } from '../core/engine';
  import { Autosave, loadOriginal, loadProject, unpack } from '../core/project';
  import { SourceImage } from '../core/source';
  import type { LayerId } from '../core/doc';
  import { syncFilter } from '../presets/apply';
  import { ensureDocTools } from '../tools/activate';
  import { GROUPS, TOOLS, toolById, type GroupId } from '../tools/catalog';
  import CompareOverlay from './CompareOverlay.svelte';
  import ExportSheet from './ExportSheet.svelte';
  import Icon from './Icon.svelte';
  import Onboarding from './Onboarding.svelte';
  import Stage from './Stage.svelte';
  import { changeBrushSize, resetToolMemory, selectTool } from './actions';
  import { reveal, rise } from './motion';
  import MaskPanel from './panels/MaskPanel.svelte';
  import BrushControls from './BrushControls.svelte';
  import { autosave, bump, engine, prefs, setAutosave, setEngine, toast, ui } from './state.svelte';

  /** Panels and overlays of the non-brush tools load on demand. */
  const PANELS: Record<string, () => Promise<{ default: Component }>> = {
    liquify: () => import('./panels/LiquifyPanel.svelte'),
    adjust: () => import('./panels/AdjustPanel.svelte'),
    filters: () => import('./panels/FiltersPanel.svelte'),
    presets: () => import('./panels/PresetsPanel.svelte'),
    blur: () => import('./panels/BlurPanel.svelte'),
    crop: () => import('./panels/CropPanel.svelte'),
  };
  const loadCropOverlay = () => import('./CropOverlay.svelte');
  const loadBlurOverlay = () => import('./BlurOverlay.svelte');

  let canvas = $state<HTMLCanvasElement>();
  let ready = $state(false);
  let failed = $state<string | null>(null);
  let onboarding = $state(false);
  let panelOpen = $state(true);
  let w = $state(0);
  let h = $state(0);
  let bottomH = $state(0);
  let sideW = $state(0);
  let railW = $state(0);
  let barH = $state(0);
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let holding = $state(false);

  const desktop = $derived(w >= 900);
  const meta = $derived(ui.tool ? toolById(ui.tool) : undefined);
  const groupTools = $derived(TOOLS.filter((t) => t.group === ui.group));
  const canUndo = $derived((ui.rev, ready && engine().history.canUndo));
  const canRedo = $derived((ui.rev, ready && engine().history.canRedo));
  const undoTitle = $derived(canUndo ? `Desfazer: ${engine().history.undoLabel}` : 'Desfazer');
  const redoTitle = $derived(canRedo ? `Refazer: ${engine().history.redoLabel}` : 'Refazer');

  let off: (() => void) | null = null;

  async function openPending(e: Engine) {
    const pending = ui.pending;
    ui.pending = null;
    if (pending?.projectId) {
      const record = await loadProject(pending.projectId);
      const original = await loadOriginal(pending.projectId);
      if (!record || !original) throw new Error('project-missing');
      const source = await SourceImage.decode(original);
      await e.open(source, record.doc);
      await ensureDocTools(e);
      for (const [id, blob] of Object.entries(record.masks) as [LayerId, Blob][]) {
        const bytes = await unpack(blob);
        const masks = e.masks!;
        if (bytes.length === masks.w * masks.h) masks.write(id, bytes);
      }
      if (record.field && e.field) {
        const bytes = await unpack(record.field);
        e.field.restore(new Float32Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength / 4));
      }
      await syncFilter(e);
      e.ctx?.invalidate('healed');
      e.requestRender();
      setAutosave(new Autosave(e, record.id, record.name, record));
      return;
    }
    if (!pending?.file) throw new Error('no-file');
    const source = await SourceImage.decode(pending.file);
    await e.open(source);
    const id = `p-${Date.now().toString(36)}`;
    const a = new Autosave(e, id, pending.file.name.replace(/\.[^.]+$/, '') || 'foto');
    setAutosave(a);
    a.schedule();
  }

  onMount(async () => {
    ui.busy = 'Revelando…';
    await tick();
    let e: Engine;
    try {
      e = new Engine(canvas!);
    } catch {
      ui.busy = null;
      failed = 'Este navegador não acende a luz: falta WebGL2.';
      return;
    }
    setEngine(e);
    const events: Partial<EngineEvents> = {
      change: () => {
        bump();
        autosave()?.schedule();
      },
      view: bump,
      busy: (label) => (ui.busy = label),
      error: (message) => toast(message),
    };
    off = e.on(events);
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', saveNow);
    e.onFilterRestore = () => void syncFilter(e);
    canvas!.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      if (ready) failed = 'O navegador apagou a luz para poupar memória. Volte e reabra a foto: o projeto está salvo.';
    });
    updateViewport();
    try {
      await openPending(e);
      resetToolMemory();
      ready = true;
      ui.busy = null;
      ui.group = 'skin';
      ui.tool = null;
      ui.toolModule = null;
      bump();
      if (!prefs.read('glowup.onboarded', false)) onboarding = true;
    } catch (err) {
      console.error(err);
      ui.busy = null;
      const big = err instanceof Error && err.message === 'image-too-large';
      toast(big ? 'Essa foto é grande demais para este aparelho.' : 'Não consegui abrir esse arquivo. Tenta um JPG, PNG ou WebP?');
      await leave();
    }
  });

  function saveNow() {
    if (document.visibilityState === 'hidden') void autosave()?.flush();
  }

  onDestroy(() => {
    off?.();
    window.removeEventListener('pagehide', saveNow);
    document.removeEventListener('visibilitychange', saveNow);
    setAutosave(null);
    ui.tool = null;
    ui.toolModule = null;
    ui.splitOn = false;
    ui.exportOpen = false;
    ui.painting = false;
  });

  function updateViewport() {
    if (!w || !h) return;
    const e = engine();
    const top = barH;
    if (desktop) {
      e.setViewport(w, h, { top: top + 8, right: sideW + 8, bottom: 12, left: railW + 8 });
    } else {
      e.setViewport(w, h, { top: top + 2, right: 0, bottom: bottomH + 2, left: 0 });
    }
  }

  $effect(() => {
    void [w, h, bottomH, sideW, railW, barH, desktop];
    if (canvas && ready) untrack(updateViewport);
  });

  async function leave() {
    if (ready) {
      engine().commit();
      await autosave()?.flush();
    }
    if (canvas) engine()?.destroy();
    setEngine(null);
    ui.screen = 'home';
  }

  function pickGroup(id: GroupId) {
    ui.group = id;
    panelOpen = true;
    const list = TOOLS.filter((t) => t.group === id);
    void selectTool(list.length === 1 ? list[0].id : null);
  }

  function pickTool(id: string) {
    if (ui.tool === id) {
      panelOpen = !panelOpen;
      return;
    }
    panelOpen = true;
    void selectTool(id);
  }

  function compareDown() {
    holdTimer = setTimeout(() => {
      holding = true;
      engine().setSplit(2);
    }, 180);
  }

  function compareUp() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    if (holding) {
      holding = false;
      engine().setSplit(ui.splitOn ? 0.5 : -1);
    } else {
      ui.splitOn = !ui.splitOn;
    }
  }

  function keydown(ev: KeyboardEvent) {
    if (!ready) return;
    const t = ev.target as HTMLElement;
    if (t instanceof HTMLInputElement && t.type !== 'range') return;
    const e = engine();
    const mod = ev.ctrlKey || ev.metaKey;
    const key = ev.key.toLowerCase();
    if (mod && key === 'z') {
      ev.preventDefault();
      void (ev.shiftKey ? e.redo() : e.undo());
    } else if (mod && key === 'y') {
      ev.preventDefault();
      void e.redo();
    } else if (mod) {
      return;
    } else if (key === '[') {
      if (ev.shiftKey) e.brush.hardness = Math.max(0, e.brush.hardness - 0.1);
      else changeBrushSize(1 / 1.15);
      bump();
    } else if (key === ']') {
      if (ev.shiftKey) e.brush.hardness = Math.min(1, e.brush.hardness + 0.1);
      else changeBrushSize(1.15);
      bump();
    } else if (key === '{') {
      e.brush.hardness = Math.max(0, e.brush.hardness - 0.1);
      bump();
    } else if (key === '}') {
      e.brush.hardness = Math.min(1, e.brush.hardness + 0.1);
      bump();
    } else if (key === 'e') {
      e.brush.erase = true;
      bump();
    } else if (key === 'b') {
      e.brush.erase = false;
      bump();
    } else if (key === 'm') {
      e.showMask = !e.showMask;
      e.requestRender();
      bump();
    } else if (key === 'y') {
      ui.splitOn = !ui.splitOn;
    } else if (key === '\\' && !ev.repeat) {
      e.setSplit(2);
    } else if (key === '0') {
      e.resetView();
    } else if (key === '+' || key === '=') {
      e.zoomBy(e.canvas.clientWidth / 2, e.canvas.clientHeight / 2, 1.25);
    } else if (key === '-') {
      e.zoomBy(e.canvas.clientWidth / 2, e.canvas.clientHeight / 2, 0.8);
    } else if (key === 'escape') {
      if (ui.exportOpen) ui.exportOpen = false;
      else if (ui.splitOn) ui.splitOn = false;
      else void selectTool(null);
    }
  }

  function keyup(ev: KeyboardEvent) {
    if (ready && ev.key === '\\') engine().setSplit(ui.splitOn ? 0.5 : -1);
  }
</script>

<svelte:window onkeydown={keydown} onkeyup={keyup} />

<div class="editor" class:painting={ui.painting} class:ready bind:clientWidth={w} bind:clientHeight={h}>
  <Stage bind:canvas />

  {#if ready}
    {#if ui.splitOn}
      <CompareOverlay />
    {/if}
    {#if ui.tool === 'crop'}
      {#await loadCropOverlay() then { default: CropOverlay }}
        <CropOverlay />
      {/await}
    {/if}
    {#if ui.tool === 'blur'}
      {#await loadBlurOverlay() then { default: BlurOverlay }}
        <BlurOverlay />
      {/await}
    {/if}
  {/if}

  <header class="bar" bind:clientHeight={barH}>
    <button type="button" class="icon-btn" aria-label="Voltar para o início" onclick={leave}><Icon name="back" /></button>
    <span class="brand serif">Glowup</span>
    <div class="grow"></div>
    <button type="button" class="icon-btn" aria-label="Desfazer" title={undoTitle} disabled={!canUndo} onclick={() => engine().undo()}><Icon name="undo" /></button>
    <button type="button" class="icon-btn" aria-label="Refazer" title={redoTitle} disabled={!canRedo} onclick={() => engine().redo()}><Icon name="redo" /></button>
    <button
      type="button"
      class="icon-btn"
      class:on={ui.splitOn || holding}
      aria-label="Comparar antes e depois. Toque para dividir, segure para ver o antes"
      aria-pressed={ui.splitOn}
      data-testid="compare"
      disabled={!ready}
      onpointerdown={compareDown}
      onpointerup={compareUp}
      onpointerleave={() => {
        if (holding) compareUp();
        else if (holdTimer) clearTimeout(holdTimer);
      }}
      onkeydown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          ui.splitOn = !ui.splitOn;
        }
      }}><Icon name="compare" /></button
    >
    <button type="button" class="btn primary export" data-testid="export-open" disabled={!ready} onclick={() => (ui.exportOpen = true)}>
      <Icon name="export" size={20} /><span class="label">Exportar</span>
    </button>
  </header>

  {#if ready}
    <div class="bottom" bind:clientHeight={bottomH}>
      <aside class="side" bind:clientWidth={sideW} aria-label="Ferramenta">
        <div class="tools scroll-x" role="toolbar" aria-label="Ferramentas">
          {#each groupTools as t (t.id)}
            <button type="button" class="tool" class:on={ui.tool === t.id} aria-pressed={ui.tool === t.id} data-tool={t.id} onclick={() => pickTool(t.id)}>
              <Icon name={t.id} size={22} />
              <span>{t.label}</span>
            </button>
          {/each}
        </div>

        {#if !meta && desktop}
          <p class="empty serif">Escolha uma ferramenta para começar.</p>
        {/if}

        {#if meta && panelOpen}
          <div class="panel scroll" in:rise={{ duration: 240, y: 14 }}>
            {#key meta.id}
              <div in:reveal={{ duration: 340, y: 6 }}>
                <div class="hint-row">
                  <p class="hint">{meta.hint}</p>
                  {#if !desktop}
                    <button type="button" class="icon-btn fold" aria-label="Recolher controles" onclick={() => (panelOpen = false)}>
                      <Icon name="close" size={18} />
                    </button>
                  {/if}
                </div>
                {#if meta.kind === 'mask' && ui.toolModule && meta.layer}
                  <MaskPanel layer={meta.layer} tool={ui.toolModule} />
                {:else if meta.kind === 'heal'}
                  <BrushControls erasable={false} full={false} />
                {:else if PANELS[meta.kind]}
                  {#await PANELS[meta.kind]() then { default: Panel }}
                    <Panel />
                  {/await}
                {/if}
              </div>
            {/key}
          </div>
        {/if}
      </aside>

      <nav class="groups" bind:clientWidth={railW} aria-label="Categorias">
        {#each GROUPS as g (g.id)}
          <button type="button" class="group" class:on={ui.group === g.id} aria-pressed={ui.group === g.id} data-group={g.id} onclick={() => pickGroup(g.id)}>
            <Icon name={g.id} size={22} />
            <span>{g.label}</span>
          </button>
        {/each}
      </nav>
    </div>
  {/if}

  {#if ui.busy}
    <div class="busy" role="status" transition:reveal={{ duration: 240 }}>
      <p class="serif">{ui.busy}</p>
      <span class="filament"></span>
    </div>
  {/if}

  {#if failed}
    <div class="failed" role="alert">
      <p class="serif">{failed}</p>
      <button type="button" class="btn" onclick={() => (ui.screen = 'home')}>Voltar</button>
    </div>
  {/if}
</div>

{#if ui.exportOpen}
  <ExportSheet />
{/if}
{#if onboarding}
  <Onboarding onclose={() => (onboarding = false)} />
{/if}

<style>
  .editor {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: var(--ink);
  }

  .bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: var(--bar-h);
    padding: var(--safe-top) 8px 0;
    background: linear-gradient(rgb(11 11 12 / 0.92), rgb(11 11 12 / 0.75));
    z-index: 10;
    transition: opacity var(--t-mid) var(--ease-swift);
  }

  .brand {
    font-size: 24px;
    margin-left: 2px;
    display: none;
  }

  .grow {
    flex: 1;
  }

  .export {
    min-height: 40px;
    padding: 0 14px;
    margin-left: 6px;
  }

  .export .label {
    display: none;
  }

  .bottom {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    background: var(--ink);
    border-top: 1px solid var(--line);
    padding-bottom: var(--safe-bottom);
    z-index: 10;
    transition: opacity var(--t-mid) var(--ease-swift);
  }

  .side {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .panel {
    order: -1;
    max-height: 34dvh;
    padding: 12px 16px 6px;
    border-bottom: 1px solid var(--line);
  }

  .hint-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
  }

  .fold {
    flex: none;
    width: 36px;
    height: 36px;
    margin: -6px -8px 0 0;
    color: var(--paper-2);
  }

  .hint {
    font-family: var(--serif);
    font-style: italic;
    font-size: 17px;
    line-height: 1.2;
    color: var(--paper-2);
    margin-bottom: 8px;
  }

  .tools {
    display: flex;
    gap: 2px;
    padding: 6px 8px;
  }

  .empty {
    padding: 18px;
    font-size: 20px;
    color: var(--paper-3);
  }

  .tool,
  .group {
    flex: none;
    display: grid;
    justify-items: center;
    gap: 3px;
    min-width: 72px;
    min-height: 54px;
    padding: 7px 8px 5px;
    border-radius: 14px;
    font-size: 11.5px;
    color: var(--paper-2);
    transition:
      color var(--t-fast),
      background var(--t-fast),
      transform var(--t-fast) var(--ease-reveal);
  }

  .tool:hover,
  .group:hover {
    color: var(--paper);
  }

  .tool:active,
  .group:active {
    transform: scale(0.95);
  }

  .tool.on {
    color: var(--safe);
    background: rgb(255 184 119 / 0.1);
  }

  .groups {
    display: flex;
    justify-content: space-between;
    overflow-x: auto;
    scrollbar-width: none;
    border-top: 1px solid var(--line);
    padding: 2px 4px;
  }

  .groups::-webkit-scrollbar {
    display: none;
  }

  .group {
    flex: 1;
    min-width: 46px;
    min-height: 50px;
    padding: 5px 0 3px;
  }

  .group.on {
    color: var(--paper);
  }

  /* While painting the interface steps back. */
  .painting .bar,
  .painting .bottom {
    opacity: 0.12;
    pointer-events: none;
  }

  @media (min-width: 900px) {
    .brand {
      display: block;
    }

    .export .label {
      display: inline;
    }

    .bottom {
      position: static;
      display: contents;
    }

    .groups {
      position: absolute;
      left: 0;
      top: var(--bar-h);
      bottom: 0;
      width: 84px;
      flex-direction: column;
      justify-content: flex-start;
      gap: 2px;
      padding: 10px 6px;
      border: 0;
      border-right: 1px solid var(--line);
      background: var(--ink);
      z-index: 10;
      transition: opacity var(--t-mid) var(--ease-swift);
    }

    .group {
      flex: none;
      min-height: 62px;
    }

    .group.on {
      background: rgb(255 255 255 / 0.07);
    }

    .side {
      position: absolute;
      right: 0;
      top: var(--bar-h);
      bottom: 0;
      width: 340px;
      background: var(--ink);
      border-left: 1px solid var(--line);
      z-index: 10;
      transition: opacity var(--t-mid) var(--ease-swift);
    }

    .tools {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      padding: 10px;
      border-bottom: 1px solid var(--line);
      overflow: visible;
    }

    .tool {
      min-width: 0;
      min-height: 64px;
    }

    .panel {
      order: 0;
      flex: 1;
      max-height: none;
      padding: 16px 18px;
      border: 0;
    }

    .painting .side,
    .painting .groups {
      opacity: 0.25;
      pointer-events: none;
    }
  }

  .busy {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    z-index: 20;
    text-align: center;
    pointer-events: none;
    font-size: 30px;
  }

  .filament {
    display: block;
    width: 140px;
    height: 1.5px;
    margin: 12px auto 0;
    background: linear-gradient(90deg, transparent, var(--safe), transparent);
    background-size: 50% 100%;
    background-repeat: no-repeat;
    animation: filament 1.2s var(--ease-swift) infinite;
  }

  @keyframes filament {
    from {
      background-position: -60% 0;
    }
    to {
      background-position: 160% 0;
    }
  }

  .failed {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 16px;
    text-align: center;
    padding: 24px;
    background: var(--ink);
    font-size: 26px;
  }
</style>
