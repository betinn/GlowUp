<script lang="ts">
  /**
   * The table where several photos become one post: a carousel, a collage or a strip that goes on from slide
   * to slide. The slides are in the middle, drawn as the files will be. Under them, the photos in order, and
   * the controls of the way of putting them together, with the three ways as tabs, as in the editor.
   */
  import { onDestroy, onMount, untrack } from 'svelte';
  import { drawPage } from '../../core/post/draw';
  import {
    BACKGROUNDS,
    collageOf,
    collageTemplates,
    MAX_PAGES,
    MAX_ZOOM,
    pageBoxes,
    pageCount,
    panned,
    photoIn,
    RATIOS,
    ratioById,
    stripOf,
    stripTemplates,
    zoomed,
    type CellBox,
    type PostKind,
  } from '../../core/post/layout';
  import Icon from '../Icon.svelte';
  import ProgressCard from '../ProgressCard.svelte';
  import Segment from '../Segment.svelte';
  import Slider from '../Slider.svelte';
  import { reveal } from '../motion';
  import { cancelOpening, finishOpening } from '../open';
  import { toast, ui } from '../state.svelte';
  import PostExport from './PostExport.svelte';
  import PostPreview from './PostPreview.svelte';
  import {
    addPhotos,
    change,
    checkpoint,
    closeStudio,
    loadStudio,
    moveSelected,
    pictureOf,
    redo,
    removeSelected,
    retouch,
    room,
    select,
    showPage,
    spreadFilter,
    studio,
    touched,
    undo,
    unspreadFilter,
  } from './studiostate.svelte';

  const KINDS: { id: PostKind; label: string; icon: string; note: string }[] = [
    { id: 'carousel', label: 'Carrossel', icon: 'carousel', note: 'Cada foto é um slide. Toque na foto para enquadrar.' },
    { id: 'collage', label: 'Colagem', icon: 'collage', note: 'Todas as fotos numa imagem só. Arraste cada uma no seu lugar.' },
    { id: 'strip', label: 'Contínuo', icon: 'strip', note: 'Uma faixa só, cortada em slides: a foto continua no próximo.' },
  ];

  type SectionId = 'photo' | 'format' | 'fit' | 'layout' | 'frame';
  const SECTIONS: { id: SectionId; label: string; kinds: PostKind[] }[] = [
    { id: 'photo', label: 'Foto', kinds: ['carousel', 'collage', 'strip'] },
    { id: 'format', label: 'Formato', kinds: ['carousel', 'collage', 'strip'] },
    { id: 'fit', label: 'Encaixe', kinds: ['carousel'] },
    { id: 'layout', label: 'Modelo', kinds: ['collage', 'strip'] },
    { id: 'frame', label: 'Moldura', kinds: ['collage', 'strip'] },
  ];

  let w = $state(0);
  let stageW = $state(0);
  let stageH = $state(0);
  let track = $state<HTMLDivElement>();
  let section = $state<SectionId>('photo');
  let previewOpen = $state(false);
  /** The last touch on the slides was a finger, so the hint about the gestures is worth showing. */
  let byFinger = $state(false);
  const canvases: HTMLCanvasElement[] = $state([]);

  const desktop = $derived(w >= 900);
  const record = $derived(studio.record);
  const d = $derived(record?.doc);
  const kind = $derived(d?.kind ?? 'carousel');
  const pages = $derived((studio.rev, d ? pageCount(d) : 0));
  const ratio = $derived(ratioById(d?.ratio ?? ''));
  const sections = $derived(SECTIONS.filter((s) => s.kinds.includes(kind)));
  const shownSection = $derived(sections.some((s) => s.id === section) ? section : 'photo');
  const selected = $derived((studio.rev, d?.photos[studio.selected]));
  const note = $derived(KINDS.find((k) => k.id === kind)?.note ?? '');
  /** Slides of a carousel stand apart. Those of a strip touch, as they will when the person swipes. */
  const gap = $derived(kind === 'carousel' ? 12 : 0);
  const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);

  /** The size of a slide on the screen: as large as the stage takes, with a little of its neighbors in sight. */
  const size = $derived.by(() => {
    const pad = desktop ? 30 : 14;
    const peek = pages > 1 ? (desktop ? 64 : 30) : pad;
    const roomW = Math.max(40, stageW - 2 * peek);
    const roomH = Math.max(40, stageH - 2 * pad - (pages > 1 ? 30 : 0));
    const shape = ratio.w / ratio.h;
    const h = Math.min(roomH, roomW / shape);
    return { w: Math.max(20, Math.floor(h * shape)), h: Math.max(20, Math.floor(h)) };
  });
  const step = $derived(size.w + gap);

  const collageList = $derived((studio.rev, d ? collageTemplates(d.photos.length, ratio) : []));
  const collageOn = $derived((studio.rev, d ? collageOf(d)?.id : undefined));
  const stripList = $derived((studio.rev, d ? stripTemplates(d.photos.length) : []));
  const stripOn = $derived((studio.rev, d ? stripOf(d)?.id : undefined));
  const canAdd = $derived((studio.rev, room() > 0));

  /** Loads the post named by the app, each time it changes: a new one, or the same one back from the editor. */
  let loaded: string | null = null;
  $effect(() => {
    const id = ui.postId;
    if (!id || id === loaded) return;
    loaded = id;
    untrack(() => void open(id));
  });

  async function open(id: string) {
    // A saved post opened from the home screen: its photos are the wait. A new one is already past that.
    if (ui.opening?.task.label === 'Preparando a mesa') ui.opening.task.stage('photos');
    const ok = await loadStudio(id);
    if (!ok) {
      cancelOpening();
      toast('Não consegui abrir essa montagem. Ela saiu da lista.');
      const { deletePost } = await import('../../core/post/store');
      await deletePost(id).catch(() => {});
      ui.postId = null;
      ui.screen = 'home';
      return;
    }
    const adds = ui.postAdds;
    ui.postAdds = null;
    ui.post = null;
    if (ui.opening) await finishOpening();
    if (adds?.length) await addPhotos(adds);
  }

  onMount(() => {
    const el = track!;
    // The wheel brings the photo under the pointer closer, so the page must not scroll with it.
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  onDestroy(() => {
    ui.exportOpen = false;
    // The table of another post, or the home screen, takes over: this one is saved and put away.
    void closeStudio();
  });

  let frame = 0;
  function draw() {
    frame = 0;
    const doc = studio.record?.doc;
    if (!doc) return;
    const cw = Math.round(size.w * dpr);
    const ch = Math.round(size.h * dpr);
    const total = pageCount(doc);
    for (let page = 0; page < total; page++) {
      const canvas = canvases[page];
      // Only the slides in sight and their neighbors are drawn: the others are drawn when the person gets near.
      if (!canvas || Math.abs(page - studio.page) > 2) continue;
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      const c = canvas.getContext('2d');
      if (c) drawPage(c, doc, page, cw, ch, pictureOf, { outline: studio.framing ? studio.selected : undefined, outlineWidth: 2.5 * dpr });
    }
  }

  $effect(() => {
    void [studio.rev, studio.framing, studio.selected, size.w, size.h, pages];
    if (!frame) frame = requestAnimationFrame(draw);
  });

  /** The slide the stage is moving to by itself, so the scroll on the way there is not taken for the person's. */
  let heading = -1;
  let headingTimer: ReturnType<typeof setTimeout> | null = null;

  function scrollToPage(page: number, smooth: boolean) {
    if (!track) return;
    heading = page;
    if (headingTimer) clearTimeout(headingTimer);
    headingTimer = setTimeout(() => (heading = -1), 600);
    track.scrollTo({ left: page * step, behavior: smooth ? 'smooth' : 'auto' });
  }

  $effect(() => {
    const page = studio.page;
    void [step, pages];
    untrack(() => {
      if (track && Math.round(track.scrollLeft / step) !== page) scrollToPage(page, true);
    });
  });

  function scrolled() {
    if (!track) return;
    const page = Math.round(track.scrollLeft / step);
    if (heading >= 0) {
      if (page === heading) heading = -1;
      return;
    }
    if (page !== studio.page) showPage(page);
  }

  /** The place of a photo under a point of the screen, in pixels of the screen from the corner of its slide. */
  function hit(x: number, y: number): { page: number; box: CellBox; left: number; top: number } | null {
    const doc = studio.record?.doc;
    if (!doc) return null;
    for (let page = 0; page < pageCount(doc); page++) {
      const r = canvases[page]?.getBoundingClientRect();
      if (!r || x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const boxes = pageBoxes(doc, page, r.width, r.height);
      const box = boxes.findLast((b) => x - r.left >= b.x && x - r.left <= b.x + b.w && y - r.top >= b.y && y - r.top <= b.y + b.h);
      if (box) return { page, box, left: r.left, top: r.top };
    }
    return null;
  }

  /**
   * A drag moves the photo inside its place when nothing else could be meant: with a mouse, in a collage, or on
   * the photo that was tapped for framing. Anywhere else a finger slides the slides, as in the feed.
   */
  const direct = (photo: number, pointerType: string) => pointerType === 'mouse' || kind === 'collage' || (studio.framing && photo === studio.selected);
  /** The slides a finger moves the photo on, so the browser does not scroll them. */
  const held = (page: number) => {
    void studio.rev;
    if (!d) return false;
    if (kind === 'collage') return true;
    return studio.framing && pageBoxes(d, page, 100, 100).some((b) => b.photo === studio.selected);
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { photo: number; box: CellBox; left: number; top: number; moved: boolean; marked: boolean; wasFraming: boolean } | null = null;
  let tap: { photo: number; x: number; y: number } | null = null;

  function setPhoto(index: number, next: { x: number; y: number; zoom: number }) {
    const photo = studio.record?.doc.photos[index];
    if (!photo) return;
    photo.x = next.x;
    photo.y = next.y;
    photo.zoom = next.zoom;
    touched();
  }

  function down(ev: PointerEvent) {
    byFinger = ev.pointerType !== 'mouse';
    const at = hit(ev.clientX, ev.clientY);
    if (!at) {
      // A touch beside the slides lets go of the photo.
      studio.framing = false;
      return;
    }
    if (!direct(at.box.photo, ev.pointerType)) {
      tap = { photo: at.box.photo, x: ev.clientX, y: ev.clientY };
      return;
    }
    ev.preventDefault();
    track?.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 1) {
      drag = { photo: at.box.photo, box: at.box, left: at.left, top: at.top, moved: false, marked: false, wasFraming: studio.framing && studio.selected === at.box.photo };
      if (studio.selected !== at.box.photo) select(at.box.photo);
    }
  }

  function move(ev: PointerEvent) {
    const before = pointers.get(ev.pointerId);
    if (!drag || !before || !d) return;
    const now = { x: ev.clientX, y: ev.clientY };
    const photo = photoIn(d, drag.photo);
    const { box } = drag;
    if (pointers.size === 2) {
      // Two fingers: the photo comes closer around the point between them.
      const other = [...pointers.entries()].find(([id]) => id !== ev.pointerId)![1];
      const was = Math.hypot(before.x - other.x, before.y - other.y);
      const is = Math.hypot(now.x - other.x, now.y - other.y);
      if (was > 4 && is > 4) {
        mark();
        setPhoto(drag.photo, zoomed(photo, box.w, box.h, is / was, (now.x + other.x) / 2 - drag.left - box.x, (now.y + other.y) / 2 - drag.top - box.y));
      }
    } else {
      const dx = now.x - before.x;
      const dy = now.y - before.y;
      if (!drag.moved && Math.hypot(dx, dy) < 2) return;
      mark();
      setPhoto(drag.photo, panned(photo, box.w, box.h, dx, dy));
    }
    pointers.set(ev.pointerId, now);
  }

  /** The first movement of a gesture is where the undo goes back to. */
  function mark() {
    if (!drag) return;
    drag.moved = true;
    if (!drag.marked) checkpoint();
    drag.marked = true;
  }

  function up(ev: PointerEvent) {
    if (tap && Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) < 8 && ev.type === 'pointerup') {
      // A tap on a photo holds it: from now on a drag moves it inside its place.
      select(tap.photo);
      studio.framing = true;
    }
    tap = null;
    if (!pointers.delete(ev.pointerId) || !drag) return;
    if (pointers.size === 0) {
      // A tap with nothing dragged holds the photo, and a second tap of a finger lets it go.
      if (!drag.moved && ev.type === 'pointerup') studio.framing = ev.pointerType === 'mouse' || !drag.wasFraming;
      drag = null;
    }
  }

  let wheelMarked: ReturnType<typeof setTimeout> | null = null;
  function wheel(ev: WheelEvent) {
    if (Math.abs(ev.deltaY) < Math.abs(ev.deltaX) || !d) return;
    const at = hit(ev.clientX, ev.clientY);
    if (!at) return;
    ev.preventDefault();
    const photo = photoIn(d, at.box.photo);
    if (photo.whole) return;
    // One turn of the wheel, however many notches, is one step of the undo.
    if (!wheelMarked) checkpoint();
    else clearTimeout(wheelMarked);
    wheelMarked = setTimeout(() => (wheelMarked = null), 500);
    if (studio.selected !== at.box.photo) select(at.box.photo);
    setPhoto(at.box.photo, zoomed(photo, at.box.w, at.box.h, Math.exp(-ev.deltaY * 0.0016), ev.clientX - at.left - at.box.x, ev.clientY - at.top - at.box.y));
  }

  function keydown(ev: KeyboardEvent) {
    if (!record || ui.exportOpen || ui.opening) return;
    // The preview has the keys while it is up, but for the one that closes it.
    if (previewOpen) {
      if (ev.key === 'Escape') previewOpen = false;
      return;
    }
    const target = ev.target as HTMLElement;
    if (target instanceof HTMLInputElement) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const key = ev.key.toLowerCase();
    if (mod && key === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) redo();
      else undo();
    } else if (mod && key === 'y') {
      ev.preventDefault();
      redo();
    } else if (mod) {
      return;
    } else if (key === 'arrowleft') {
      showPage(studio.page - 1);
    } else if (key === 'arrowright') {
      showPage(studio.page + 1);
    } else if (key === 'escape') {
      studio.framing = false;
    }
  }

  function pickKind(id: PostKind) {
    if (!d || d.kind === id) return;
    change((doc) => {
      doc.kind = id;
    });
    studio.framing = false;
    select(studio.selected);
  }

  /** Home shows the post as it was left, so the post is saved before the screen changes. */
  async function leave() {
    await closeStudio();
    ui.postId = null;
    ui.post = null;
    ui.screen = 'home';
  }

  function picked(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    input.value = '';
    void addPhotos(files);
  }

  /** A slider marks the post once, when the knob is first moved, and lets it go when the finger does. */
  let sliding = false;
  function slide(apply: () => void) {
    if (!sliding) checkpoint();
    sliding = true;
    apply();
    touched();
  }
  const slid = () => {
    sliding = false;
  };

  function setWhole(whole: boolean, all = false) {
    change((doc) => {
      for (const [i, photo] of doc.photos.entries()) {
        if (!all && i !== studio.selected) continue;
        if (whole) photo.whole = true;
        else delete photo.whole;
      }
    });
  }

  /** A small drawing of an arrangement, in the shape of the slide. */
  function diagram(rects: { x: number; y: number; w: number; h: number }[], wide: number, tall: number): string {
    const pad = 1.4;
    return rects.map((r) => `M${(r.x * wide + pad).toFixed(1)} ${(r.y * tall + pad).toFixed(1)}h${(r.w * wide - 2 * pad).toFixed(1)}v${(r.h * tall - 2 * pad).toFixed(1)}h${(-(r.w * wide - 2 * pad)).toFixed(1)}Z`).join('');
  }
  const thumbBox = $derived({ w: ratio.w >= ratio.h ? 44 : Math.round((44 * ratio.w) / ratio.h), h: ratio.w >= ratio.h ? Math.round((44 * ratio.h) / ratio.w) : 44 });
</script>

<svelte:window bind:innerWidth={w} onkeydown={keydown} />

<div class="studio" class:ready={!!record} data-testid="studio" data-post-kind={kind} data-pages={pages} data-photos={d?.photos.length ?? 0} data-loading={studio.loading}>
  <header class="bar">
    <button type="button" class="icon-btn" aria-label="Voltar para o início" data-testid="post-back" onclick={leave}><Icon name="back" /></button>
    <span class="title serif">Montagem</span>
    <div class="grow"></div>
    <button type="button" class="icon-btn" aria-label="Desfazer" title="Desfazer" disabled={!studio.canUndo} onclick={undo}><Icon name="undo" /></button>
    <button type="button" class="icon-btn" aria-label="Refazer" title="Refazer" disabled={!studio.canRedo} onclick={redo}><Icon name="redo" /></button>
    <button type="button" class="btn see" data-testid="post-preview-open" disabled={!record || !pages} onclick={() => (previewOpen = true)}>
      <Icon name="eye" size={20} /><span class="label">Prévia</span>
    </button>
    <button type="button" class="btn primary export" data-testid="post-export-open" disabled={!record || !pages || studio.loading > 0} onclick={() => (ui.exportOpen = true)}>
      <Icon name="export" size={20} /><span class="label">Exportar</span>
    </button>
  </header>

  <!-- The slides, side by side as in the feed. A slide of a strip touches the next one, with a dashed line on the cut. -->
  <section class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH} aria-label="Slides">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="track" class:strip={kind === 'strip'} bind:this={track} style:--pw="{size.w}px" style:--ph="{size.h}px" style:--gap="{gap}px"
      onscroll={scrolled} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
      {#each { length: pages } as _, page (page)}
        <div class="page" class:on={page === studio.page} class:held={held(page)} data-page={page}>
          <canvas bind:this={canvases[page]} aria-label="Slide {page + 1} de {pages}"></canvas>
          {#if kind === 'strip' && pages > 1}
            <span class="number" aria-hidden="true">{page + 1}</span>
          {/if}
        </div>
      {/each}
    </div>

    {#if pages > 1}
      <div class="dots" role="tablist" aria-label="Slides">
        {#each { length: pages } as _, page (page)}
          <button type="button" role="tab" aria-selected={page === studio.page} aria-label="Slide {page + 1}" class:on={page === studio.page} data-testid="post-dot" onclick={() => showPage(page)}></button>
        {/each}
        <span class="count" data-testid="post-count">{studio.page + 1}/{pages}</span>
      </div>
    {/if}

    {#if studio.framing && byFinger && kind !== 'collage'}
      <div class="framing" role="status" data-testid="post-framing" in:reveal={{ duration: 200, y: -6 }}>
        <span>Arraste para enquadrar</span>
        <button type="button" onclick={() => (studio.framing = false)}>Pronto</button>
      </div>
    {/if}
  </section>

  {#if record && d}
    <div class="bottom">
      <aside class="side scroll" aria-label="Montagem">
        <p class="hint">{note}</p>

        <!-- The photos, in the order they go out. -->
        <div class="photos scroll-x" role="listbox" aria-label="Fotos, na ordem" data-testid="post-photos">
          {#each d.photos as photo, i (photo.id)}
            <button type="button" class="photo" class:on={i === studio.selected} role="option" aria-selected={i === studio.selected}
              aria-label="Foto {i + 1}{studio.stale[photo.id] ? ', com retoque por guardar' : ''}" data-testid="post-photo" data-photo={photo.id} onclick={() => select(i)}>
              {#if studio.thumbs[photo.id]}
                <img src={studio.thumbs[photo.id]} alt="" draggable="false" />
              {/if}
              <span class="order">{i + 1}</span>
            </button>
          {/each}
          {#if canAdd}
            <label class="photo add" title="Adicionar fotos">
              <Icon name="plus" size={22} />
              <span class="sr-only">Adicionar fotos</span>
              <input class="sr-only" data-testid="post-add" type="file" accept="image/*" multiple onchange={(e) => picked(e.currentTarget)} />
            </label>
          {/if}
        </div>

        <div class="sections">
          <section class="block" class:shown={shownSection === 'photo'} aria-label="Foto escolhida">
            <h3>Foto {studio.selected + 1} de {d.photos.length}</h3>
            <div class="row">
              <button type="button" class="btn primary retouch" data-testid="post-retouch" disabled={studio.loading > 0} onclick={() => retouch(studio.selected)}>
                <Icon name="brush" size={18} /> Retocar
              </button>
              <button type="button" class="icon-btn edge" aria-label="Mover para antes" title="Mover para antes" data-testid="post-earlier" disabled={studio.selected === 0} onclick={() => moveSelected(-1)}><Icon name="back" size={20} /></button>
              <button type="button" class="icon-btn edge" aria-label="Mover para depois" title="Mover para depois" data-testid="post-later" disabled={studio.selected >= d.photos.length - 1} onclick={() => moveSelected(1)}><Icon name="next" size={20} /></button>
              <button type="button" class="icon-btn edge" aria-label="Tirar da montagem" title="Tirar da montagem" data-testid="post-remove" disabled={d.photos.length <= 1} onclick={removeSelected}><Icon name="trash" size={20} /></button>
            </div>
            {#if studio.spreading}
              <ProgressCard task={studio.spreading} title="Passando o filtro para as outras fotos" note="Cada foto fica com o retoque que já tem." />
            {:else if d.photos.length > 1}
              {#if selected && studio.filters[selected.id]}
                <button type="button" class="link" data-testid="post-spread" disabled={studio.loading > 0} onclick={spreadFilter}>Usar o filtro desta foto em todas</button>
              {:else if !studio.canUnspread}
                <p class="tip">Um filtro posto nesta foto, em Retocar, pode ir para todas de uma vez.</p>
              {/if}
              {#if studio.canUnspread}
                <button type="button" class="link" data-testid="post-unspread" disabled={studio.loading > 0} onclick={unspreadFilter}>Desfazer o filtro em todas</button>
              {/if}
            {/if}
            {#if selected && !photoIn(d, studio.selected).whole}
              <Slider label="Aproximar" value={Math.round(selected.zoom * 100)} min={100} max={MAX_ZOOM * 100} resetTo={100} format={(v) => `${(v / 100).toFixed(1)}×`}
                oninput={(v) => slide(() => (selected.zoom = v / 100))} onchange={slid} />
            {/if}
          </section>

          <section class="block" class:shown={shownSection === 'format'} aria-label="Formato">
            <h3>Formato</h3>
            <div class="ratios scroll-x" role="radiogroup" aria-label="Formato do slide">
              {#each RATIOS as r (r.id)}
                <button type="button" class="ratio" class:on={d.ratio === r.id} role="radio" aria-checked={d.ratio === r.id} data-testid="post-ratio" data-ratio={r.id}
                  onclick={() => change((doc) => (doc.ratio = r.id))}>
                  <i style:width="{r.w >= r.h ? 26 : Math.round((26 * r.w) / r.h)}px" style:height="{r.w >= r.h ? Math.round((26 * r.h) / r.w) : 26}px"></i>
                  <span>{r.label}</span>
                  <small>{r.id}</small>
                </button>
              {/each}
            </div>
          </section>

          {#if kind === 'carousel'}
            <section class="block" class:shown={shownSection === 'fit'} aria-label="Encaixe">
              <h3>Encaixe</h3>
              <Segment label="Encaixe desta foto" value={selected?.whole ? 'whole' : 'fill'} options={[{ value: 'fill', label: 'Preencher' }, { value: 'whole', label: 'Foto inteira' }]}
                onchange={(v) => setWhole(v === 'whole')} />
              {#if d.photos.length > 1}
                <button type="button" class="link" data-testid="post-fit-all" onclick={() => setWhole(!!selected?.whole, true)}>
                  Usar em todas: {selected?.whole ? 'foto inteira' : 'preencher'}
                </button>
              {/if}
              {#if d.photos.some((p) => p.whole)}
                <div class="swatches" role="radiogroup" aria-label="Fundo da foto inteira">
                  <button type="button" class="swatch blur" class:on={d.blur} role="radio" aria-checked={d.blur} aria-label="A própria foto desfocada" title="A própria foto desfocada"
                    data-testid="post-blur" onclick={() => change((doc) => (doc.blur = true))}></button>
                  {#each BACKGROUNDS as b (b.color)}
                    <button type="button" class="swatch" class:on={!d.blur && d.background === b.color} role="radio" aria-checked={!d.blur && d.background === b.color} aria-label={b.label} title={b.label}
                      style:--c={b.color} data-testid="post-color" onclick={() => change((doc) => ((doc.blur = false), (doc.background = b.color)))}></button>
                  {/each}
                </div>
              {/if}
            </section>
          {:else}
            <section class="block" class:shown={shownSection === 'layout'} aria-label="Modelo">
              <h3>Modelo</h3>
              {#if kind === 'strip'}
                <div class="stepper" data-testid="post-pages">
                  <span>Slides</span>
                  <button type="button" class="icon-btn edge" aria-label="Menos um slide" disabled={pages <= 1} onclick={() => change((doc) => (doc.pages = pages - 1))}>−</button>
                  <output aria-live="polite">{pages}</output>
                  <button type="button" class="icon-btn edge" aria-label="Mais um slide" disabled={pages >= MAX_PAGES} onclick={() => change((doc) => (doc.pages = pages + 1))}>+</button>
                </div>
                <div class="models scroll-x" role="radiogroup" aria-label="Modelo da faixa">
                  {#each stripList as t (t.id)}
                    <button type="button" class="model wide" class:on={stripOn === t.id} role="radio" aria-checked={stripOn === t.id} aria-label={t.label} title={t.label} data-testid="post-model" data-model={t.id}
                      onclick={() => change((doc) => (doc.strip = t.id))}>
                      <svg viewBox="0 0 72 30" width="72" height="30" aria-hidden="true"><path d={diagram(t.rects, 72, 30)} /></svg>
                      <span>{t.label}</span>
                    </button>
                  {/each}
                </div>
              {:else}
                <div class="models scroll-x" role="radiogroup" aria-label="Modelo da colagem">
                  {#each collageList as t (t.id)}
                    <button type="button" class="model" class:on={collageOn === t.id} role="radio" aria-checked={collageOn === t.id} aria-label="Modelo {t.id}" data-testid="post-model" data-model={t.id}
                      onclick={() => change((doc) => (doc.collage = t.id))}>
                      <svg viewBox="0 0 {thumbBox.w} {thumbBox.h}" width={thumbBox.w} height={thumbBox.h} aria-hidden="true"><path d={diagram(t.rects, thumbBox.w, thumbBox.h)} /></svg>
                    </button>
                  {/each}
                </div>
              {/if}
            </section>

            <section class="block" class:shown={shownSection === 'frame'} aria-label="Moldura">
              <h3>Moldura</h3>
              <Slider label="Espaço" value={d.gap} oninput={(v) => slide(() => (d.gap = v))} onchange={slid} />
              <Slider label="Cantos" value={d.radius} oninput={(v) => slide(() => (d.radius = v))} onchange={slid} />
              <div class="swatches" role="radiogroup" aria-label="Cor do fundo">
                {#each BACKGROUNDS as b (b.color)}
                  <button type="button" class="swatch" class:on={d.background === b.color} role="radio" aria-checked={d.background === b.color} aria-label={b.label} title={b.label}
                    style:--c={b.color} data-testid="post-color" onclick={() => change((doc) => (doc.background = b.color))}></button>
                {/each}
              </div>
            </section>
          {/if}
        </div>

        <nav class="chips scroll-x" aria-label="Controles">
          {#each sections as s (s.id)}
            <button type="button" class="chip" class:on={shownSection === s.id} aria-pressed={shownSection === s.id} data-testid="post-section" data-section={s.id} onclick={() => (section = s.id)}>
              <span>{s.label}</span>
            </button>
          {/each}
        </nav>
      </aside>

      <nav class="tabs" aria-label="Jeitos de montar" data-testid="post-kinds">
        {#each KINDS as k (k.id)}
          <button type="button" class="tab" class:on={kind === k.id} aria-pressed={kind === k.id} data-kind={k.id} title={k.note} onclick={() => pickKind(k.id)}>
            <Icon name={k.icon} size={22} />
            <span>{k.label}</span>
          </button>
        {/each}
      </nav>
    </div>
  {/if}
</div>

{#if ui.exportOpen && d}
  <PostExport onclose={() => (ui.exportOpen = false)} />
{/if}
{#if previewOpen && d}
  <PostPreview onclose={() => (previewOpen = false)} />
{/if}

<style>
  .studio {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--ink);
    overflow: hidden;
  }

  .bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: var(--bar-h);
    padding: var(--safe-top) 8px 0;
  }

  .title {
    font-size: 22px;
    margin-left: 2px;
  }

  .grow {
    flex: 1;
  }

  .see,
  .export {
    min-height: 40px;
    padding: 0 12px;
    margin-left: 6px;
  }

  .see {
    border-color: transparent;
  }

  .see .label,
  .export .label {
    display: none;
  }

  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .track {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    gap: var(--gap);
    padding: 0 calc((100% - var(--pw)) / 2) 30px;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
    touch-action: pan-x;
  }

  .track::-webkit-scrollbar {
    display: none;
  }

  .page {
    position: relative;
    flex: none;
    width: var(--pw);
    height: var(--ph);
    scroll-snap-align: center;
    opacity: 0.45;
    transition: opacity var(--t-mid) var(--ease-swift);
    cursor: grab;
  }

  .page.on,
  .strip .page {
    opacity: 1;
  }

  /* A finger on this slide moves the photo, so the browser leaves the gesture alone. */
  .page.held {
    touch-action: none;
  }

  .page canvas {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 3px;
    box-shadow: 0 0 0 1px var(--line);
  }

  /* The cut between two slides of a strip. */
  .strip .page + .page::before {
    content: '';
    position: absolute;
    top: -8px;
    bottom: -8px;
    left: -1px;
    border-left: 1.5px dashed var(--safe);
    opacity: 0.8;
    pointer-events: none;
  }

  .strip .page canvas {
    border-radius: 0;
  }

  .number {
    position: absolute;
    top: 6px;
    left: 6px;
    min-width: 20px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgb(11 11 12 / 0.7);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    text-align: center;
    pointer-events: none;
  }

  .dots {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
  }

  /* A dot of 6 px inside a target a finger finds. */
  .dots button {
    display: grid;
    place-items: center;
    width: 18px;
    height: 28px;
  }

  .dots button::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--paper-3);
    transition:
      background var(--t-fast),
      scale var(--t-fast) var(--ease-reveal);
  }

  .dots button.on::before {
    background: var(--paper);
    scale: 1.35;
  }

  .count {
    margin-left: 8px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--paper-2);
  }

  .framing {
    position: absolute;
    left: 50%;
    top: 8px;
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px 2px 14px;
    border-radius: 999px;
    background: rgb(11 11 12 / 0.82);
    border: 1px solid var(--safe);
    font-size: 13px;
    white-space: nowrap;
  }

  .framing button {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    color: var(--safe);
  }

  .bottom {
    flex: none;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--line);
    padding-bottom: var(--safe-bottom);
  }

  .side {
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: 46dvh;
  }

  .hint {
    padding: 8px 16px 0;
    font-family: var(--serif);
    font-style: italic;
    font-size: 16px;
    line-height: 1.2;
    color: var(--paper-2);
  }

  .photos {
    flex: none;
    display: flex;
    gap: 8px;
    padding: 8px 12px 6px;
  }

  .photo {
    position: relative;
    flex: none;
    width: 52px;
    height: 52px;
    border-radius: 12px;
    overflow: hidden;
    background: var(--ink-3);
    box-shadow: 0 0 0 1px var(--line);
    transition:
      box-shadow var(--t-fast),
      transform var(--t-fast) var(--ease-reveal);
  }

  .photo:active {
    transform: scale(0.95);
  }

  .photo.on {
    box-shadow:
      0 0 0 2px var(--ink),
      0 0 0 4px var(--safe);
  }

  .photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .order {
    position: absolute;
    left: 3px;
    bottom: 3px;
    min-width: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: rgb(11 11 12 / 0.72);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
    line-height: 16px;
  }

  .add {
    display: grid;
    place-items: center;
    color: var(--paper-2);
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line-2);
    cursor: pointer;
  }

  .add:hover {
    color: var(--paper);
  }

  .add:has(input:focus-visible) {
    outline: 2px solid var(--safe);
    outline-offset: 2px;
  }

  .sections {
    min-height: 0;
    overflow-y: auto;
  }

  /* On a phone one block shows at a time, chosen on the row of words under it. */
  .block {
    display: none;
    padding: 4px 16px 6px;
  }

  .block.shown {
    display: block;
  }

  h3 {
    display: none;
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--paper-3);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0 4px;
  }

  .retouch {
    flex: 1;
    min-height: 44px;
  }

  .edge {
    flex: none;
    border: 1px solid var(--line-2);
    font-size: 20px;
  }

  .ratios,
  .models {
    display: flex;
    gap: 6px;
    padding: 2px;
    margin: 0 -2px;
  }

  .ratio {
    flex: none;
    display: grid;
    justify-items: center;
    align-content: end;
    gap: 2px;
    min-width: 64px;
    min-height: 68px;
    padding: 8px 8px 6px;
    border-radius: 14px;
    font-size: 12px;
    color: var(--paper-2);
    transition:
      color var(--t-fast),
      background var(--t-fast);
  }

  .ratio i {
    display: block;
    border: 1.5px solid currentColor;
    border-radius: 3px;
    margin-bottom: 3px;
  }

  .ratio small {
    font-size: 10.5px;
    color: var(--paper-3);
    font-variant-numeric: tabular-nums;
  }

  .ratio.on,
  .model.on {
    color: var(--safe);
    background: rgb(255 184 119 / 0.1);
  }

  .model {
    flex: none;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 3px;
    min-width: 58px;
    min-height: 60px;
    padding: 6px;
    border-radius: 14px;
    font-size: 11.5px;
    color: var(--paper-2);
    transition:
      color var(--t-fast),
      background var(--t-fast);
  }

  .model svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linejoin: round;
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--paper-2);
  }

  .stepper span {
    flex: 1;
  }

  .stepper output {
    min-width: 24px;
    text-align: center;
    font-size: 17px;
    color: var(--paper);
    font-variant-numeric: tabular-nums;
  }

  .link {
    min-height: 40px;
    padding: 0 4px;
    font-size: 13px;
    color: var(--paper-2);
    text-decoration: underline;
    text-decoration-color: var(--line-2);
    text-underline-offset: 3px;
  }

  .link:hover:not(:disabled) {
    color: var(--paper);
  }

  .link:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .tip {
    padding: 4px 4px 6px;
    font-size: 13px;
    line-height: 1.3;
    color: var(--paper-3);
  }

  .swatches {
    display: flex;
    flex-wrap: wrap;
    margin: 2px -6px 0;
  }

  /* A circle of 26 px inside a target of 44. */
  .swatch {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
  }

  .swatch::before {
    content: '';
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 0 1px var(--line-2);
    transition: box-shadow var(--t-fast);
  }

  .swatch.blur::before {
    background: radial-gradient(circle at 35% 35%, #c9a98c, #5d6a7a 60%, #23262d);
    filter: blur(1.2px);
  }

  .swatch.on::before {
    box-shadow:
      0 0 0 2px var(--ink),
      0 0 0 4px var(--safe);
  }

  .chips {
    flex: none;
    display: flex;
    gap: 2px;
    padding: 0 8px;
  }

  .chip {
    flex: 1 0 auto;
    display: grid;
    place-items: center;
    min-height: 44px;
    padding: 0 4px;
    font-size: 13.5px;
    color: var(--paper-2);
    transition: color var(--t-fast);
  }

  .chip > span {
    display: grid;
    place-items: center;
    min-height: 30px;
    padding: 0 12px;
    border-radius: 999px;
    transition: background var(--t-fast);
  }

  .chip.on {
    color: var(--paper);
  }

  .chip.on > span {
    background: rgb(255 255 255 / 0.1);
  }

  .tabs {
    flex: none;
    display: flex;
    border-top: 1px solid var(--line);
    padding: 2px 4px;
  }

  .tab {
    position: relative;
    flex: 1;
    display: grid;
    justify-items: center;
    gap: 3px;
    min-height: 50px;
    padding: 6px 0 4px;
    border-radius: 12px;
    font-size: 11.5px;
    color: var(--paper-2);
    transition:
      color var(--t-fast),
      background var(--t-fast),
      transform var(--t-fast) var(--ease-reveal);
  }

  .tab:hover,
  .chip:hover {
    color: var(--paper);
  }

  .tab:active {
    transform: scale(0.95);
  }

  .tab.on {
    color: var(--paper);
  }

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

  @media (min-width: 900px) {
    .studio {
      display: grid;
      grid-template: auto 1fr / 84px 1fr 340px;
    }

    .bar {
      grid-column: 1 / -1;
    }

    .title {
      font-size: 24px;
    }

    .see .label,
    .export .label {
      display: inline;
    }

    .see {
      border-color: var(--line-2);
    }

    .stage {
      grid-column: 2;
      grid-row: 2;
    }

    .bottom {
      display: contents;
    }

    .tabs {
      grid-column: 1;
      grid-row: 2;
      flex-direction: column;
      justify-content: flex-start;
      gap: 2px;
      padding: 10px 6px;
      border: 0;
      border-right: 1px solid var(--line);
    }

    .tab {
      flex: none;
      min-height: 62px;
      border-radius: 14px;
    }

    .tab.on {
      background: rgb(255 255 255 / 0.07);
    }

    .tab::before {
      display: none;
    }

    .side {
      grid-column: 3;
      grid-row: 2;
      max-height: none;
      border-left: 1px solid var(--line);
      overflow-y: auto;
    }

    .hint {
      padding: 16px 18px 4px;
      font-size: 17px;
    }

    .photos {
      flex-wrap: wrap;
      padding: 10px 18px;
      overflow: visible;
    }

    .sections {
      overflow: visible;
    }

    /* With room for all of them, every block shows, each under its name. */
    .block {
      display: block;
      padding: 10px 18px;
      border-top: 1px solid var(--line);
    }

    h3 {
      display: block;
    }

    .models {
      flex-wrap: wrap;
    }

    .ratios {
      gap: 2px;
    }

    .ratio {
      flex: 1;
      min-width: 0;
      padding: 8px 2px 6px;
    }

    .chips {
      display: none;
    }
  }
</style>
