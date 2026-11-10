<script lang="ts">
  import { onDestroy, onMount, tick, untrack, type Component } from 'svelte';
  import { scale } from 'svelte/transition';
  import { Engine, type EngineEvents } from '../core/engine';
  import { Autosave, InvalidProjectError, loadOriginal, loadProject, unpack, validProject } from '../core/project';
  import { nextPaint } from '../core/progress';
  import { readFile, SourceImage } from '../core/source';
  import { FILTER_MASK, PHOTO_MASKS, type LayerId } from '../core/doc';
  import { startFill } from './fill.svelte';
  import { syncFilter } from '../presets/apply';
  import { ensureDocTools } from '../tools/activate';
  import { GROUPS, TOOLS, toolById, type GroupId } from '../tools/catalog';
  import CompareOverlay from './CompareOverlay.svelte';
  import ExportSheet from './ExportSheet.svelte';
  import Icon from './Icon.svelte';
  import Onboarding from './Onboarding.svelte';
  import PathChoice from './PathChoice.svelte';
  import PathSwitch from './PathSwitch.svelte';
  import Stage from './Stage.svelte';
  import { changeBrushSize, resetToolMemory, selectTool, switchable, toggleEffect, toggleMark } from './actions';
  import { comparePress, holdCompare, toggleCompare } from './compare';
  import { autoHint, dropToolLimit, hasWork, strokeOutside, toolLimit } from './facepick.svelte';
  import { reveal, rise } from './motion';
  import { regionShow } from './regionshow.svelte';
  import { groupChanged, photoChanged, resetGroup, resetPhoto } from './reset';
  import { cancelOpening, finishOpening, reportOpenFailure } from './open';
  import { pathById, startPaths } from './paths';
  import HealPanel from './panels/HealPanel.svelte';
  import MaskPanel from './panels/MaskPanel.svelte';
  import { autosave, bump, clearEditorCloser, closeEditor, engine, hasEngine, setAutosave, setEditorCloser, setEngine, toast, ui } from './state.svelte';

  /** Panels and overlays of the non-brush tools load on demand. */
  const PANELS: Record<string, () => Promise<{ default: Component }>> = {
    liquify: () => import('./panels/LiquifyPanel.svelte'),
    shape: () => import('./panels/ShapePanel.svelte'),
    adjust: () => import('./panels/AdjustPanel.svelte'),
    filters: () => import('./panels/FiltersPanel.svelte'),
    blur: () => import('./panels/BlurPanel.svelte'),
    crop: () => import('./panels/CropPanel.svelte'),
  };
  const loadCropOverlay = () => import('./CropOverlay.svelte');
  const loadBlurOverlay = () => import('./BlurOverlay.svelte');
  const loadFaceOverlay = () => import('./FaceOverlay.svelte');
  const loadHealOverlay = () => import('./HealOverlay.svelte');
  const loadShapeOverlay = () => import('./ShapeOverlay.svelte');

  let canvas = $state<HTMLCanvasElement>();
  let ready = $state(false);
  let failed = $state<string | null>(null);
  let panelOpen = $state(true);
  let w = $state(0);
  let h = $state(0);
  let bottomH = $state(0);
  let sideW = $state(0);
  let railW = $state(0);
  let barH = $state(0);

  const desktop = $derived(w >= 900);
  /** What the path shows in place of the groups and tools. */
  const pathMenu = $derived(pathById(ui.path)?.menu);
  const meta = $derived(ui.tool ? toolById(ui.tool) : undefined);
  const groupTools = $derived(TOOLS.filter((t) => t.group === ui.group));
  /** Tools of the group with their effect on the photo. Their button shows a small switch, turned on. */
  const lit = $derived.by(() => {
    void ui.rev;
    if (!ready) return new Set<string>();
    const e = engine();
    return new Set(groupTools.filter((t) => switchable(t.id) && hasWork(e, t.id)).map((t) => t.id));
  });
  /** In the automatic mode of Manchas each healed spot has a ring, to take it back alone, unless the person hid them. */
  const healRings = $derived(
    meta?.kind === 'heal' &&
      ui.healRings &&
      toolLimit.region !== null &&
      toolLimit.mode === 'auto' &&
      toolLimit.state === 'on' &&
      !ui.splitOn &&
      !ui.compareHold,
  );
  const canUndo = $derived((ui.rev, ready && engine().history.canUndo));
  const canRedo = $derived((ui.rev, ready && engine().history.canRedo));
  // The label changes with each step, so it follows every change, not only canUndo.
  const undoTitle = $derived((ui.rev, canUndo) ? `Desfazer: ${engine().history.undoLabel}` : 'Desfazer');
  const redoTitle = $derived((ui.rev, canRedo) ? `Refazer: ${engine().history.redoLabel}` : 'Refazer');
  /** For the tests, which cannot see the view itself. */
  const zoom = $derived((ui.rev, ready ? engine().view.zoom.toFixed(2) : '1.00'));
  const marking = $derived((ui.rev, ready && engine().showMask && engine().mode === 'mask'));
  const groupLabel = $derived(GROUPS.find((g) => g.id === ui.group)?.label ?? '');
  const groupDirty = $derived((ui.rev, ready && groupChanged(ui.group)));
  const photoDirty = $derived((ui.rev, ready && photoChanged()));

  /** The words under the light stay a little longer than the light, time enough to read them. */
  let reachNote = $state(false);
  let reachTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (regionShow.phase !== 'glow') return;
    reachNote = true;
    clearTimeout(reachTimer);
    reachTimer = setTimeout(() => (reachNote = false), 2600);
  });
  $effect(() => {
    void ui.tool;
    reachNote = false;
  });

  let off: (() => void) | null = null;

  /** Marks a stage and lets the screen show it before the next blocking step. */
  async function stage(id: string) {
    ui.opening?.task.stage(id);
    await nextPaint();
  }

  /** Draws the first frame, which also compiles the shaders. */
  async function firstFrame(e: Engine) {
    await stage('render');
    e.renderNow();
    await nextPaint();
  }

  async function openPending(e: Engine) {
    const pending = ui.pending;
    ui.pending = null;
    if (pending?.projectId) {
      await stage('read');
      const { record, original } = validProject(await loadProject(pending.projectId), await loadOriginal(pending.projectId));
      await stage('decode');
      const source = await SourceImage.decode(original);
      if (source.w !== record.doc.width || source.h !== record.doc.height) {
        source.close();
        throw new InvalidProjectError('the document is of another photo');
      }
      await stage('upload');
      await e.open(source, record.doc);
      await stage('retouch');
      await ensureDocTools(e);
      const masks = Object.entries(record.masks) as [LayerId, Blob][];
      for (const [i, [id, blob]] of masks.entries()) {
        const bytes = await unpack(blob);
        const store = e.masks!;
        // The mask of a tool that no longer exists stays out, so the next save drops it.
        if (id !== FILTER_MASK && !PHOTO_MASKS.includes(id) && !e.doc.layers[id]) continue;
        if (bytes.length === store.w * store.h) store.write(id, bytes);
        // A mask made for another screen size is lost, and a filter with no mask would just vanish.
        else if (id === FILTER_MASK) e.doc.filter = { ...e.doc.filter, masked: false, reach: undefined };
        ui.opening?.task.report((i + 1) / masks.length, `${i + 1} de ${masks.length}`);
      }
      if (record.field && e.field) {
        const bytes = await unpack(record.field);
        if (bytes.byteLength !== e.field.serialize().byteLength) throw new InvalidProjectError('field size');
        e.field.restore(new Float32Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength / 4));
      }
      if (record.shape && e.field) {
        const bytes = await unpack(record.shape);
        // The whole, and after it the shares of the lips and of the head, when the project has them.
        if (![1, 2, 3].includes(bytes.byteLength / e.field.serialize().byteLength)) throw new InvalidProjectError('field size');
        e.field.restoreShape(new Float32Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength / 4));
      }
      // Before this field, the automatic mode was written into the strokes, so there is no strength to move.
      if (record.shape === undefined) delete e.doc.shapeAmount;
      await e.refreshLock();
      startFill(e, 'project');
      await syncFilter(e);
      e.ctx?.invalidate('healed');
      await firstFrame(e);
      setAutosave(new Autosave(e, record.id, record.name, record));
      return;
    }
    if (!pending?.file) throw new Error('no-file');
    ui.opening?.task.stage('read');
    const blob = await readFile(pending.file, (f) => ui.opening?.task.report(f));
    await stage('decode');
    const source = await SourceImage.decode(blob);
    await stage('upload');
    await e.open(source);
    await firstFrame(e);
    const id = `p-${Date.now().toString(36)}`;
    const a = new Autosave(e, id, pending.file.name.replace(/\.[^.]+$/, '') || 'foto');
    setAutosave(a);
    a.schedule();
  }

  onMount(async () => {
    await tick();
    let e: Engine;
    try {
      e = new Engine(canvas!);
    } catch {
      cancelOpening();
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
      shaping: (pending) => (ui.shaping = pending),
      error: (message) => toast(message),
      outside: () => toast(strokeOutside()),
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
    // Taken here, because opening clears it.
    const projectId = ui.pending?.projectId;
    try {
      await openPending(e);
      resetToolMemory();
      ready = true;
      ui.group = 'skin';
      ui.tool = null;
      ui.toolModule = null;
      bump();
      startPaths(!!projectId);
      await finishOpening();
    } catch (err) {
      console.error(err);
      cancelOpening();
      await reportOpenFailure(err, projectId);
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
    clearEditorCloser(shutDown);
    dropToolLimit();
    ui.tool = null;
    ui.toolModule = null;
    ui.splitOn = false;
    ui.compareHold = false;
    ui.compareScope = 'all';
    ui.exportOpen = false;
    ui.painting = false;
    ui.faceChoosing = false;
    ui.path = null;
    ui.choosingPath = false;
    ui.onboarding = null;
  });

  function updateViewport() {
    if (!w || !h) return;
    const e = engine();
    const top = barH;
    if (desktop) {
      e.setViewport(w, h, { top: top + 8, right: sideW + 8, bottom: 12, left: (ui.path && !pathMenu ? railW : 0) + 8 });
    } else {
      e.setViewport(w, h, { top: top + 2, right: 0, bottom: bottomH + 2, left: 0 });
    }
  }

  $effect(() => {
    void [w, h, bottomH, sideW, railW, barH, desktop, ui.path];
    if (canvas && ready) untrack(updateViewport);
  });

  /** Sends the comparison state to the engine. */
  $effect(() => {
    if (!ready || !hasEngine()) return;
    const e = engine();
    const showing = ui.splitOn || ui.compareHold;
    e.setCompareBase(showing && ui.compareScope === 'filter' ? 'unfiltered' : 'original');
    e.setSplit(ui.compareHold ? 2 : ui.splitOn ? ui.splitX : -1);
  });

  async function shutDown(next: () => void) {
    if (ready) {
      engine().commit();
      await autosave()?.flush();
    }
    if (hasEngine()) engine().destroy();
    setEngine(null);
    next();
  }

  setEditorCloser(shutDown);

  const leave = () =>
    closeEditor(() => {
      ui.screen = 'home';
    });

  function pickGroup(id: GroupId) {
    ui.group = id;
    panelOpen = true;
    const list = TOOLS.filter((t) => t.group === id);
    void selectTool(list.length === 1 ? list[0].id : null);
  }

  /**
   * A tap on another tool opens it. On the open tool, a folded panel opens again first. Then, for the
   * tools with an effect of their own, the tap turns the effect off or back on; for the others it folds
   * the panel, as before.
   */
  function pickTool(id: string) {
    if (ui.tool !== id) {
      panelOpen = true;
      void selectTool(id);
    } else if (!panelOpen) {
      panelOpen = true;
    } else if (switchable(id)) {
      void toggleEffect(id);
    } else {
      panelOpen = false;
    }
  }

  function toolTitle(id: string, label: string): string {
    if (ui.tool !== id || !switchable(id)) return label;
    return lit.has(id) ? `${label}: toque de novo para tirar o efeito` : `${label}: toque de novo para aplicar`;
  }

  function keydown(ev: KeyboardEvent) {
    if (!ready || ui.choosingPath) return;
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
      toggleMark();
    } else if (key === 'y') {
      toggleCompare('all');
    } else if (key === '\\' && !ev.repeat) {
      holdCompare('all');
    } else if (key === '0') {
      e.resetView();
    } else if (key === '+' || key === '=') {
      e.zoomBy(e.canvas.clientWidth / 2, e.canvas.clientHeight / 2, 1.25);
    } else if (key === '-') {
      e.zoomBy(e.canvas.clientWidth / 2, e.canvas.clientHeight / 2, 0.8);
    } else if (key === 'escape') {
      if (ui.exportOpen) ui.exportOpen = false;
      else if (ui.faceChoosing) ui.faceChoosing = false;
      else if (ui.splitOn) ui.splitOn = false;
      else void selectTool(null);
    }
  }

  function keyup(ev: KeyboardEvent) {
    if (ready && ev.key === '\\') ui.compareHold = false;
  }
</script>

<svelte:window onkeydown={keydown} onkeyup={keyup} />

<div class="editor" class:painting={ui.painting} class:ready data-region-show={regionShow.phase ?? 'idle'}
  data-zoom={zoom} bind:clientWidth={w} bind:clientHeight={h}>
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
    {#if healRings}
      {#await loadHealOverlay() then { default: HealOverlay }}
        <HealOverlay />
      {/await}
    {/if}
    {#if ui.faceChoosing}
      {#await loadFaceOverlay() then { default: FaceOverlay }}
        <FaceOverlay />
      {/await}
    {/if}
    {#if meta?.kind === 'shape' && !ui.splitOn && !ui.compareHold}
      {#await loadShapeOverlay() then { default: ShapeOverlay }}
        <ShapeOverlay />
      {/await}
    {/if}
  {/if}

  <header class="bar" bind:clientHeight={barH}>
    <button type="button" class="icon-btn" aria-label="Voltar para o início" onclick={leave}><Icon name="back" /></button>
    <span class="brand serif">Glowup</span>
    {#if ready && ui.path}
      <PathSwitch />
    {/if}
    <div class="grow"></div>
    <button type="button" class="icon-btn" aria-label="Voltar ao original" title="Voltar ao original" data-testid="reset-photo"
      disabled={!photoDirty} onclick={() => void resetPhoto()}><Icon name="reset" /></button>
    <button type="button" class="icon-btn" aria-label="Desfazer" title={undoTitle} disabled={!canUndo} onclick={() => engine().undo()}><Icon name="undo" /></button>
    <button type="button" class="icon-btn" aria-label="Refazer" title={redoTitle} disabled={!canRedo} onclick={() => engine().redo()}><Icon name="redo" /></button>
    <button
      type="button"
      class="icon-btn"
      class:on={(ui.splitOn || ui.compareHold) && ui.compareScope === 'all'}
      aria-label="Comparar com a foto original. Toque para dividir, segure para ver o antes"
      aria-pressed={ui.splitOn && ui.compareScope === 'all'}
      data-testid="compare"
      disabled={!ready}
      use:comparePress={'all'}><Icon name="compare" /></button
    >
    <button type="button" class="btn primary export" data-testid="export-open" disabled={!ready} onclick={() => (ui.exportOpen = true)}>
      <Icon name="export" size={20} /><span class="label">Exportar</span>
    </button>
  </header>

  {#if ready && pathMenu}
    <div class="bottom" bind:clientHeight={bottomH}>
      <aside class="side" bind:clientWidth={sideW} aria-label="Menu">
        {#await pathMenu() then { default: Menu }}
          <Menu />
        {/await}
      </aside>
    </div>
  {:else if ready && ui.path}
    <div class="bottom" bind:clientHeight={bottomH}>
      <aside class="side" bind:clientWidth={sideW} aria-label="Ferramenta">
        <div class="tools scroll-x" role="toolbar" aria-label="Ferramentas">
          {#each groupTools as t (t.id)}
            <button type="button" class="tool" class:on={ui.tool === t.id} aria-pressed={ui.tool === t.id} data-tool={t.id}
              data-effect={switchable(t.id) ? (lit.has(t.id) ? 'on' : 'off') : null} title={toolTitle(t.id, t.label)}
              aria-label={lit.has(t.id) ? `${t.label}, efeito ligado` : undefined} onclick={() => pickTool(t.id)}>
              <Icon name={t.id} size={22} />
              <span>{t.label}</span>
              {#if lit.has(t.id)}
                <span class="effect" aria-hidden="true" transition:scale={{ duration: 160, start: 0.5 }}></span>
              {/if}
            </button>
          {/each}
          {#if groupDirty}
            <button type="button" class="tool zero" aria-label="Zerar tudo de {groupLabel}" title="Zerar tudo de {groupLabel}"
              data-testid="reset-group" in:reveal={{ duration: 200, y: 4 }} onclick={() => resetGroup(ui.group)}>
              <Icon name="reset" size={22} />
              <span>Zerar</span>
            </button>
          {/if}
        </div>

        {#if !meta && desktop}
          <p class="empty serif">Escolha uma ferramenta para começar.</p>
        {/if}

        {#if meta && panelOpen}
          <div class="panel scroll" in:rise={{ duration: 240, y: 14 }}>
            {#key meta.id}
              <div in:reveal={{ duration: 340, y: 6 }}>
                <div class="hint-row">
                  <p class="hint">{autoHint() ?? meta.hint}</p>
                  {#if !desktop}
                    <button type="button" class="icon-btn fold" aria-label="Recolher controles" onclick={() => (panelOpen = false)}>
                      <Icon name="close" size={18} />
                    </button>
                  {/if}
                </div>
                {#if meta.kind === 'mask' && ui.toolModule && meta.layer}
                  <MaskPanel layer={meta.layer} tool={ui.toolModule} />
                {:else if meta.kind === 'heal'}
                  <HealPanel />
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

  {#if marking}
    <div class="marking" data-testid="mark-chip" in:reveal={{ duration: 200, y: -6 }}>
      <span>Marca do pincel ligada</span>
      <button type="button" onclick={toggleMark}>Ver o resultado</button>
    </div>
  {/if}

  {#if reachNote && !marking}
    <div class="reach" role="status" data-testid="reach-chip" in:reveal={{ duration: 200, y: -6 }}>O brilho mostra onde o pincel alcança</div>
  {/if}

  {#if ready && ui.choosingPath}
    <PathChoice />
  {/if}

  {#if ui.shaping && ready}
    <!-- Only while the finished field is on its way. It shows a moment late, so a quick one never blinks. -->
    <div class="shaping" role="status" aria-label="Terminando o ajuste do rosto" data-testid="shape-pending" in:reveal={{ duration: 160, delay: 140, y: 4 }}>
      <span class="filament"></span>
    </div>
  {/if}

  {#if ui.busy}
    <div class="busy" role="status" in:reveal={{ duration: 200, delay: 220, y: -6 }}>
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
{#if ui.onboarding}
  <Onboarding cards={ui.onboarding} onclose={() => (ui.onboarding = null)} />
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

  .tool {
    position: relative;
  }

  /* A small switch, turned on: this tool has its effect on the photo. A second tap turns it off. */
  .effect {
    position: absolute;
    top: 5px;
    right: 7px;
    width: 18px;
    height: 10px;
    border-radius: 999px;
    background: var(--safe);
    box-shadow: 0 0 0 1.5px var(--ink-2);
  }

  .effect::after {
    content: '';
    position: absolute;
    top: 2px;
    right: 2px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink);
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

  /* Eight groups fit across a 375 px phone. A long name goes on two lines, with the others at the top. */
  .group {
    flex: 1;
    align-content: start;
    min-width: 44px;
    min-height: 50px;
    padding: 5px 0 3px;
    line-height: 1.1;
    text-align: center;
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

  /* The mark covers the result, so the photo says so too, even with the panel folded. */
  .marking {
    position: absolute;
    left: 50%;
    top: calc(var(--bar-h) + var(--safe-top) + 10px);
    translate: -50% 0;
    z-index: 15;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 4px 2px 14px;
    border-radius: 999px;
    background: rgb(11 11 12 / 0.82);
    border: 1px solid var(--safe);
    font-size: 13px;
    white-space: nowrap;
    transition: opacity var(--t-mid) var(--ease-swift);
  }

  .reach {
    position: absolute;
    left: 50%;
    top: calc(var(--bar-h) + var(--safe-top) + 10px);
    translate: -50% 0;
    z-index: 15;
    padding: 9px 14px;
    border-radius: 999px;
    background: rgb(11 11 12 / 0.82);
    border: 1px solid rgb(219 240 255 / 0.7);
    color: rgb(225 242 255);
    font-size: 13px;
    white-space: nowrap;
    pointer-events: none;
  }

  .marking button {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    color: var(--safe);
    font-size: 13px;
  }

  .zero {
    color: var(--paper-3);
  }

  .marking button:hover {
    background: rgb(255 184 119 / 0.12);
  }

  .painting .marking {
    opacity: 0.12;
    pointer-events: none;
  }

  /* Short jobs get a small note, and only if they last long enough to be noticed. */
  .busy {
    position: absolute;
    left: 50%;
    top: calc(var(--bar-h) + var(--safe-top) + 10px);
    translate: -50% 0;
    z-index: 20;
    padding: 6px 16px 8px;
    border-radius: 16px;
    background: rgb(11 11 12 / 0.78);
    text-align: center;
    pointer-events: none;
    font-size: 18px;
    white-space: nowrap;
  }

  /* A thread of light over the top of the photo: the slider is free, the photo is catching up. */
  .shaping {
    position: absolute;
    left: 50%;
    top: calc(var(--bar-h) + var(--safe-top) + 14px);
    translate: -50% 0;
    z-index: 6;
    width: 96px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgb(11 11 12 / 0.62);
    pointer-events: none;
  }

  .shaping .filament {
    margin-top: 0;
  }

  .filament {
    display: block;
    width: 100%;
    height: 1.5px;
    margin-top: 4px;
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
