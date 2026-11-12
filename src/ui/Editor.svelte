<script lang="ts">
  import { onDestroy, onMount, tick, untrack, type Component } from 'svelte';
  import { scale } from 'svelte/transition';
  import { Engine, type EngineEvents } from '../core/engine';
  import { renderImage } from '../core/export';
  import { Autosave, loadOriginal, loadProject, validProject } from '../core/project';
  import { nextPaint } from '../core/progress';
  import { readFile, SourceImage } from '../core/source';
  import { fillSettled, startFill } from './fill.svelte';
  import { forgetGrow } from './upscaletool.svelte';
  import { syncFilter } from '../presets/apply';
  import { GROUPS, TOOLS, toolById, type GroupId } from '../tools/catalog';
  import CompareOverlay from './CompareOverlay.svelte';
  import ExportSheet from './ExportSheet.svelte';
  import Icon from './Icon.svelte';
  import Onboarding from './Onboarding.svelte';
  import Stage from './Stage.svelte';
  import { changeBrushSize, resetToolMemory, selectTool, switchable, toggleEffect, toggleMark } from './actions';
  import { comparePress, holdCompare, toggleCompare } from './compare';
  import { autoHint, dropToolLimit, hasWork, strokeOutside, toolLimit } from './facepick.svelte';
  import { reveal, rise } from './motion';
  import { regionShow } from './regionshow.svelte';
  import { restoreProject } from './restore';
  import { groupChanged, groupsChanged, photoChanged, resetGroups, resetPhoto } from './reset';
  import { cancelOpening, finishOpening, openProject, reportOpenFailure } from './open';
  import { choosePath, pathById, PATHS, startPaths } from './paths';
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
    upscale: () => import('./panels/UpscalePanel.svelte'),
  };
  const loadCropOverlay = () => import('./CropOverlay.svelte');
  const loadBlurOverlay = () => import('./BlurOverlay.svelte');
  const loadFaceOverlay = () => import('./FaceOverlay.svelte');
  const loadHealOverlay = () => import('./HealOverlay.svelte');
  const loadShapeOverlay = () => import('./ShapeOverlay.svelte');
  const loadStickerOverlay = () => import('./StickerOverlay.svelte');

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
  const path = $derived(pathById(ui.path));
  /** What the tab shows in place of tools. */
  const pathMenu = $derived(path?.menu);
  /** The menus of the tab, as a row to choose from. A tab of one menu, or of all side by side, has no row. */
  const chips = $derived(path?.groups && !path.flat && path.groups.length > 1 ? GROUPS.filter((g) => path.groups!.includes(g.id)) : []);
  /** The menus whose tools are in sight: the chosen one, or all of the tab. */
  const shownGroups = $derived<GroupId[]>(path?.flat ? (path.groups ?? []) : [ui.group]);
  const meta = $derived(ui.tool ? toolById(ui.tool) : undefined);
  const groupTools = $derived(TOOLS.filter((t) => shownGroups.includes(t.group)));
  /** Tools of the group with their effect on the photo. Their button shows a small switch, turned on. */
  const lit = $derived.by(() => {
    void ui.rev;
    if (!ready) return new Set<string>();
    const e = engine();
    return new Set(groupTools.filter((t) => switchable(t.id) && hasWork(e, t.id)).map((t) => t.id));
  });
  /**
   * In Manchas each healed spot has a ring, in Automático and in Manual, to take it back alone, whether the
   * automatic mode or the brush healed it, unless the person hid them.
   */
  const healRings = $derived(meta?.kind === 'heal' && ui.healRings && toolLimit.state !== 'searching' && !ui.splitOn && !ui.compareHold);
  const canUndo = $derived((ui.rev, ready && engine().history.canUndo));
  const canRedo = $derived((ui.rev, ready && engine().history.canRedo));
  // The label changes with each step, so it follows every change, not only canUndo.
  const undoTitle = $derived((ui.rev, canUndo) ? `Desfazer: ${engine().history.undoLabel}` : 'Desfazer');
  const redoTitle = $derived((ui.rev, canRedo) ? `Refazer: ${engine().history.redoLabel}` : 'Refazer');
  /** For the tests, which cannot see the view itself. */
  const zoom = $derived((ui.rev, ready ? engine().view.zoom.toFixed(2) : '1.00'));
  const marking = $derived((ui.rev, ready && engine().showMask && engine().mode === 'mask'));
  /** The name over the tools in sight: the menu, or the tab when it shows all of its menus. */
  const groupLabel = $derived(path?.flat ? path.label : (GROUPS.find((g) => g.id === ui.group)?.label ?? ''));
  const groupDirty = $derived((ui.rev, ready && groupsChanged(shownGroups)));
  /** Menus of the row with something of theirs on the photo. Their name shows a small dot. */
  const dirtyGroups = $derived.by(() => {
    void ui.rev;
    return new Set(ready ? chips.filter((g) => groupChanged(g.id)).map((g) => g.id) : []);
  });
  const photoDirty = $derived((ui.rev, ready && photoChanged()));

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
      await stage('upload');
      try {
        await restoreProject(e, record, source, {
          opened: () => stage('retouch'),
          mask: (done, total) => ui.opening?.task.report(done / total, `${done} de ${total}`),
        });
      } catch (err) {
        // A photo that never reached the engine is still open here.
        if (e.source !== source) source.close();
        throw err;
      }
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
      funShaping: (pending) => (ui.funShaping = pending),
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
    forgetGrow();
    ui.tool = null;
    ui.toolModule = null;
    ui.splitOn = false;
    ui.compareHold = false;
    ui.compareScope = 'all';
    ui.exportOpen = false;
    ui.painting = false;
    ui.faceChoosing = false;
    ui.path = null;
    ui.onboarding = null;
    ui.funShaping = false;
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

  /**
   * A photo of a post leaves the editor with a picture of itself as it is, at full size, which is what the post
   * shows and what goes into its files. A photo with no retouch needs none: the original is that picture.
   */
  async function keepPrint() {
    const a = autosave();
    if (!a?.post) return;
    if (!photoChanged()) {
      a.setPrint(null);
      return;
    }
    if (a.printFresh) return;
    ui.busy = 'Guardando o retoque';
    try {
      // A completion still running would leave its quick guess in the picture.
      await fillSettled();
      const canvas = await renderImage(engine(), { tile: () => {} });
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.97 });
      a.setPrint({ blob, w: canvas.width, h: canvas.height });
    } catch (err) {
      // The post keeps the picture it had, and says that the retouch is newer than it.
      console.error(err);
    } finally {
      ui.busy = null;
    }
  }

  async function shutDown(next: () => void) {
    if (ready) {
      engine().commit();
      await keepPrint();
      await autosave()?.flush();
    }
    if (hasEngine()) engine().destroy();
    setEngine(null);
    next();
  }

  setEditorCloser(shutDown);

  /** The way back: the table of the post, for a photo of one, and the home screen for the others. */
  const leave = () =>
    closeEditor(() => {
      ui.screen = ui.post ? 'post' : 'home';
    });

  /** Another photo of the same post takes the editor. This one is saved first, with its picture. */
  async function openSibling(delta: number) {
    const post = ui.post;
    const index = (post?.index ?? 0) + delta;
    const id = post?.ids[index];
    if (!post || !id || ui.opening) return;
    const project = await loadProject(id).catch(() => undefined);
    openProject(id, project?.thumb as Blob, { ...post, index });
  }

  /** A tap on another tab goes there. On the tab in sight, it opens a folded panel again. */
  function pickPath(id: string) {
    if (ui.path === id) panelOpen = true;
    else void choosePath(id);
  }

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
    {#if ui.path === 'fun' && !ui.splitOn && !ui.compareHold}
      {#await loadStickerOverlay() then { default: StickerOverlay }}
        <StickerOverlay />
      {/await}
    {/if}
  {/if}

  <header class="bar" bind:clientHeight={barH}>
    <button type="button" class="icon-btn" aria-label={ui.post ? 'Voltar para a montagem' : 'Voltar para o início'} onclick={leave}><Icon name="back" /></button>
    <span class="brand serif">Glowup</span>
    {#if ui.post && ui.post.ids.length > 1}
      <!-- The photo is one of a post: its neighbors are one tap away, with no trip to the table. -->
      <div class="pager" role="group" aria-label="Fotos da montagem" data-testid="post-pager">
        <button type="button" class="icon-btn" aria-label="Foto anterior da montagem" disabled={!ready || ui.post.index === 0} onclick={() => openSibling(-1)}><Icon name="back" size={18} /></button>
        <span aria-label="Foto {ui.post.index + 1} de {ui.post.ids.length}">{ui.post.index + 1}/{ui.post.ids.length}</span>
        <button type="button" class="icon-btn" aria-label="Próxima foto da montagem" disabled={!ready || ui.post.index >= ui.post.ids.length - 1} onclick={() => openSibling(1)}><Icon name="next" size={18} /></button>
      </div>
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
    {#if ui.post}
      <!-- The files are made at the table, from all the photos: here the photo just goes back to it. -->
      <button type="button" class="btn primary export" data-testid="post-done" disabled={!ready} aria-label="Pronto: voltar para a montagem" onclick={leave}>
        <Icon name="check" size={20} /><span class="label">Pronto</span>
      </button>
    {:else}
      <button type="button" class="btn primary export" data-testid="export-open" disabled={!ready} onclick={() => (ui.exportOpen = true)}>
        <Icon name="export" size={20} /><span class="label">Exportar</span>
      </button>
    {/if}
  </header>

  {#if ready && path}
    <div class="bottom" bind:clientHeight={bottomH}>
      <aside class="side" bind:clientWidth={sideW} aria-label={pathMenu ? 'Menu' : 'Ferramenta'}>
        {#if pathMenu}
          {#key path.id}
            {#await pathMenu() then { default: Menu }}
              <Menu />
            {/await}
          {/key}
        {:else}
          {#if chips.length}
            <nav class="groups scroll-x" aria-label="Categorias">
              {#each chips as g (g.id)}
                <button type="button" class="group" class:on={ui.group === g.id} aria-pressed={ui.group === g.id} data-group={g.id}
                  aria-label={dirtyGroups.has(g.id) ? `${g.label}, com retoque na foto` : g.label} title={g.label} onclick={() => pickGroup(g.id)}>
                  <span>{g.short ?? g.label}</span>
                  {#if dirtyGroups.has(g.id)}
                    <i class="dot" aria-hidden="true" transition:scale={{ duration: 160, start: 0.4 }}></i>
                  {/if}
                </button>
              {/each}
            </nav>
          {/if}

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
                data-testid="reset-group" in:reveal={{ duration: 200, y: 4 }} onclick={() => resetGroups(shownGroups, groupLabel)}>
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
        {/if}
      </aside>

      <!-- The tabs are always in sight: where the person is, and one tap to anywhere else. -->
      <nav class="tabs" bind:clientWidth={railW} aria-label="Jeitos de editar" data-testid="tabs">
        {#each PATHS as p (p.id)}
          <button type="button" class="tab" class:on={ui.path === p.id} aria-pressed={ui.path === p.id} data-path={p.id} title={p.note}
            onclick={() => pickPath(p.id)}>
            <Icon name={p.icon} size={22} />
            <span>{p.label}</span>
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

  {#if (ui.shaping || ui.funShaping) && ready}
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

  .pager {
    display: flex;
    align-items: center;
    margin-left: 2px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--paper-2);
  }

  .pager .icon-btn {
    width: 34px;
  }

  /* A narrow phone has the whole bar in use: the buttons give up a little width, never height. */
  @media (max-width: 420px) {
    .bar .icon-btn {
      width: 40px;
    }

    .pager .icon-btn {
      width: 30px;
    }
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
    padding: 6px 8px 2px;
  }

  .empty {
    padding: 18px;
    font-size: 20px;
    color: var(--paper-3);
  }

  .tool,
  .tab {
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
  .tab:hover,
  .group:hover {
    color: var(--paper);
  }

  .tool:active,
  .tab:active,
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

  /* The menus of the tab, as words: under the tools on a phone, so each row sits on the one that owns it. */
  .groups {
    order: 1;
    display: flex;
    gap: 2px;
    padding: 0 8px;
  }

  /* The word is a pill of 30 px inside a target of 44. */
  .group {
    position: relative;
    flex: 1 0 auto;
    display: grid;
    place-items: center;
    min-height: 44px;
    padding: 0 4px;
    font-size: 13.5px;
    color: var(--paper-2);
    white-space: nowrap;
    transition:
      color var(--t-fast),
      transform var(--t-fast) var(--ease-reveal);
  }

  .group > span {
    display: grid;
    place-items: center;
    min-height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    transition: background var(--t-fast);
  }

  .group.on {
    color: var(--paper);
  }

  .group.on > span {
    background: rgb(255 255 255 / 0.1);
  }

  /* Something of this menu is on the photo. */
  .dot {
    position: absolute;
    top: 9px;
    right: 8px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--safe);
  }

  /* The tabs: always the last row, the same on every tab, so the thumb finds them without looking. */
  .tabs {
    display: flex;
    border-top: 1px solid var(--line);
    padding: 2px 4px;
  }

  /* Each tab is as wide as its name and shares what is left, so a long name never touches its neighbor. */
  .tab {
    position: relative;
    flex: 1 0 auto;
    min-width: 0;
    min-height: 50px;
    padding: 6px 4px 4px;
    border-radius: 12px;
    white-space: nowrap;
  }

  .tab.on {
    color: var(--paper);
  }

  /* A short line of paper over the tab in sight. The amber is kept for the tool at work. */
  .tab::before {
    content: '';
    position: absolute;
    top: -2px;
    left: 50%;
    width: 22px;
    height: 2px;
    border-radius: 2px;
    translate: -50% 0;
    background: var(--paper);
    scale: 0 1;
    transition: scale var(--t-mid) var(--ease-reveal);
  }

  .tab.on::before {
    scale: 1 1;
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

    .tabs {
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

    .tab {
      flex: none;
      min-height: 62px;
      padding: 7px 2px 5px;
      border-radius: 14px;
      white-space: normal;
      line-height: 1.15;
      text-align: center;
    }

    .tab.on {
      background: rgb(255 255 255 / 0.07);
    }

    .tab::before {
      display: none;
    }

    .groups {
      order: 0;
      justify-content: space-between;
      gap: 0;
      padding: 10px 10px 0;
    }

    .group {
      flex: 0 0 auto;
      min-height: 36px;
      padding: 0;
      font-size: 13px;
    }

    .group > span {
      padding: 0 10px;
    }

    .dot {
      top: 5px;
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
      padding: 8px 10px 10px;
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
    .painting .tabs {
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
