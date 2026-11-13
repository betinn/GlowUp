<script lang="ts">
  /**
   * The whole window accepts a photo, on the home screen and in the editor. While a file is over the
   * window the screen dims, a frame lights up and a light follows the pointer. Files that are not
   * photos are refused before they are dropped.
   */
  import Icon from './Icon.svelte';
  import { reveal } from './motion';
  import { openFiles } from './open';
  import { ui } from './state.svelte';

  /** Browsers report no "drag ended" when the file leaves the window, so silence ends the drag. */
  const SILENCE = 600;

  type Over = 'none' | 'photo' | 'other';

  let over = $state<Over>('none');
  let many = $state(false);
  let x = $state(0);
  let y = $state(0);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const blocked = () => !!ui.opening || ui.exportOpen;
  const carriesFiles = (ev: DragEvent) => !!ev.dataTransfer?.types.includes('Files');

  /** Types are known while dragging, except for formats the system has no name for. */
  function read(ev: DragEvent): Over {
    const items = [...(ev.dataTransfer?.items ?? [])].filter((i) => i.kind === 'file');
    many = items.length > 1;
    const refused = items.length > 0 && items.every((i) => i.type !== '' && !i.type.startsWith('image/'));
    return refused ? 'other' : 'photo';
  }

  function stop() {
    over = 'none';
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function track(ev: DragEvent) {
    if (!carriesFiles(ev)) return;
    // Always handled here: otherwise the browser leaves the app to show the file.
    ev.preventDefault();
    if (blocked()) {
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'none';
      return;
    }
    over = read(ev);
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = over === 'photo' ? 'copy' : 'none';
    x = ev.clientX;
    y = ev.clientY;
    if (timer) clearTimeout(timer);
    timer = setTimeout(stop, SILENCE);
  }

  function leave(ev: DragEvent) {
    const outside = ev.clientX <= 0 || ev.clientY <= 0 || ev.clientX >= innerWidth || ev.clientY >= innerHeight;
    if (!ev.relatedTarget && outside) stop();
  }

  function drop(ev: DragEvent) {
    if (!carriesFiles(ev)) return;
    ev.preventDefault();
    stop();
    if (blocked()) return;
    openFiles([...(ev.dataTransfer?.files ?? [])], { x: ev.clientX, y: ev.clientY });
  }

  const editing = $derived(ui.screen === 'editor');
  /** A post is on the table, or the photo in the editor is part of one: what drops joins the post. */
  const posting = $derived(ui.screen === 'post' || !!ui.post);
  const title = $derived(
    over === 'other' ? 'Isso não é uma foto.' : posting ? 'Solta para pôr na montagem.' : many ? 'Solta para montar.' : editing ? 'Solta para trocar de foto.' : 'Pode soltar.',
  );
  const sub = $derived(
    over === 'other'
      ? 'Funciona com JPG, PNG ou WebP.'
      : posting
        ? 'Entra depois das fotos que já estão lá.'
        : many
          ? 'Várias fotos viram carrossel, colagem ou uma faixa contínua.'
          : editing
            ? 'A edição atual fica salva.'
            : 'Ela abre aqui mesmo. Nada sai do seu aparelho.',
  );
</script>

<svelte:window ondragenter={track} ondragover={track} ondragleave={leave} ondrop={drop} />

{#if over !== 'none'}
  <div class="zone" class:refused={over === 'other'} data-testid="drop-zone" aria-hidden="true" transition:reveal={{ duration: 200, y: 0 }}>
    <span class="light" style:transform="translate({x}px, {y}px)"></span>
    <div class="frame">
      <i class="corner tl"></i>
      <i class="corner tr"></i>
      <i class="corner bl"></i>
      <i class="corner br"></i>
    </div>
    <div class="copy">
      <span class="sign"><Icon name={over === 'other' ? 'close' : 'gallery'} size={30} /></span>
      <p class="serif title">{title}</p>
      <p class="sub">{sub}</p>
    </div>
  </div>
{/if}

<style>
  .zone {
    --mark: var(--safe);
    position: fixed;
    inset: 0;
    z-index: 54;
    display: grid;
    place-items: center;
    overflow: hidden;
    text-align: center;
    background: rgb(11 11 12 / 0.92);
    pointer-events: none;
  }

  .zone.refused {
    --mark: var(--paper-3);
  }

  .light {
    position: absolute;
    left: -45vmax;
    top: -45vmax;
    width: 90vmax;
    height: 90vmax;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgb(255 184 119 / 0.2), transparent);
    transition: opacity var(--t-mid);
  }

  .refused .light {
    opacity: 0;
  }

  .frame {
    position: absolute;
    inset: calc(14px + var(--safe-top)) 14px calc(14px + var(--safe-bottom));
    border-radius: 22px;
    border: 1.5px solid var(--mark);
    opacity: 0.9;
    animation: settle 420ms var(--ease-reveal) both;
    transition: border-color var(--t-mid);
  }

  @keyframes settle {
    from {
      opacity: 0;
      transform: scale(0.965);
    }
  }

  .corner {
    position: absolute;
    width: 30px;
    height: 30px;
    border: 3px solid var(--mark);
    transition: border-color var(--t-mid);
    animation: breathe 1.5s ease-in-out infinite;
  }

  .tl {
    --dx: 6px;
    --dy: 6px;
    top: 14px;
    left: 14px;
    border-width: 3px 0 0 3px;
    border-top-left-radius: 10px;
  }

  .tr {
    --dx: -6px;
    --dy: 6px;
    top: 14px;
    right: 14px;
    border-width: 3px 3px 0 0;
    border-top-right-radius: 10px;
  }

  .bl {
    --dx: 6px;
    --dy: -6px;
    bottom: 14px;
    left: 14px;
    border-width: 0 0 3px 3px;
    border-bottom-left-radius: 10px;
  }

  .br {
    --dx: -6px;
    --dy: -6px;
    bottom: 14px;
    right: 14px;
    border-width: 0 3px 3px 0;
    border-bottom-right-radius: 10px;
  }

  @keyframes breathe {
    50% {
      transform: translate(var(--dx), var(--dy));
    }
  }

  .refused .corner {
    animation: none;
  }

  .copy {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 24px;
  }

  .sign {
    display: grid;
    place-items: center;
    width: 68px;
    height: 68px;
    margin-bottom: 10px;
    border-radius: 50%;
    color: var(--mark);
    box-shadow: inset 0 0 0 1.5px var(--mark);
    animation: bob 1.5s ease-in-out infinite;
  }

  .refused .sign {
    animation: refuse 320ms var(--ease-swift);
  }

  @keyframes bob {
    50% {
      transform: translateY(7px);
    }
  }

  @keyframes refuse {
    25% {
      transform: translateX(-6px);
    }
    75% {
      transform: translateX(6px);
    }
  }

  .title {
    font-size: clamp(38px, 8vw, 60px);
    line-height: 1.05;
  }

  .sub {
    color: var(--paper-2);
  }
</style>
