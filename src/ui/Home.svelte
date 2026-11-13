<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { reveal } from './motion';
  import { openFile, openPost, openProject, startPost } from './open';

  /** A photo edited on its own, or a post of several. */
  interface Recent {
    id: string;
    name: string;
    url: string;
    thumb: Blob | null;
    updated: number;
    /** Photos of a post. Left out for a photo on its own. */
    count?: number;
  }

  let recents = $state<Recent[]>([]);
  const WORD = 'Glowup'.split('');

  onMount(async () => {
    try {
      const [{ listProjects }, { listPosts, sweepOrphans }] = await Promise.all([import('../core/project'), import('../core/post/store')]);
      // A photo left behind by a post goes back to the list, or off the device, before the list is read.
      await sweepOrphans().catch(() => {});
      const [photos, posts] = await Promise.all([listProjects(), listPosts()]);
      // A damaged project may have no picture, and it must not take the rest of the list with it.
      const url = (thumb: unknown) => (thumb instanceof Blob ? URL.createObjectURL(thumb) : '');
      recents = [
        ...photos.map((p) => ({ id: p.id, name: p.name, thumb: p.thumb, url: url(p.thumb), updated: p.updated })),
        ...posts.map((p) => ({ id: p.id, name: p.name, thumb: p.thumb, url: url(p.thumb), updated: p.updated, count: p.count })),
      ].sort((a, b) => b.updated - a.updated);
    } catch {
      recents = [];
    }
  });

  onDestroy(() => recents.forEach((r) => URL.revokeObjectURL(r.url)));

  async function forget(recent: Recent) {
    if (recent.count === undefined) await (await import('../core/project')).deleteProject(recent.id);
    else await (await import('../core/post/store')).deletePost(recent.id);
    recents = recents.filter((r) => r !== recent);
  }

  function picked(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    input.value = '';
    // Whoever asked for several photos gets the table, even with one photo: more can join it there.
    if (files.length) void startPost(files);
  }
</script>

<main class="home">
  <div class="glow" aria-hidden="true"></div>

  <section class="hero">
    <h1 class="serif" aria-label="Glowup">
      {#each WORD as letter, i (i)}
        <span class="letter" aria-hidden="true" in:reveal={{ delay: 120 + i * 70, duration: 760, y: 18 }}>{letter}</span>
      {/each}
    </h1>
    <p class="sub" in:reveal={{ delay: 620 }}>Nada sai do seu aparelho. Nem um pixel.</p>

    <label class="tray" in:reveal={{ delay: 720 }}>
      <i class="corner tl"></i>
      <i class="corner tr"></i>
      <i class="corner bl"></i>
      <i class="corner br"></i>
      <span class="sign"><Icon name="gallery" size={26} /></span>
      <span class="serif lead with-mouse">Solta a foto aqui.</span>
      <span class="serif lead with-touch">Sua foto começa aqui.</span>
      <span class="btn primary pick">Escolher foto</span>
      <span class="hint">JPG, PNG ou WebP</span>
      <input class="sr-only" data-testid="file-input" type="file" accept="image/*" onchange={(e) => openFile(e.currentTarget.files?.[0])} />
    </label>

    <div class="actions" in:reveal={{ delay: 820 }}>
      <label class="btn">
        <Icon name="camera" size={20} /> Tirar foto
        <input class="sr-only" type="file" accept="image/*" capture="user" onchange={(e) => openFile(e.currentTarget.files?.[0])} />
      </label>
      <label class="btn">
        <Icon name="stack" size={20} /> Várias fotos
        <input class="sr-only" data-testid="files-input" type="file" accept="image/*" multiple onchange={(e) => picked(e.currentTarget)} />
      </label>
    </div>
    <p class="several" in:reveal={{ delay: 900 }}>Várias fotos viram carrossel, colagem ou uma faixa que continua de um slide para o outro.</p>
  </section>

  {#if recents.length}
    <section class="recents" in:reveal={{ delay: 300 }} aria-label="Fotos recentes">
      <h2 class="serif">De onde parou</h2>
      <div class="row scroll-x">
        {#each recents as r (r.id)}
          <div class="recent" class:post={r.count !== undefined} data-testid={r.count === undefined ? 'recent-photo' : 'recent-post'}>
            <button
              type="button"
              class="thumb"
              aria-label={r.count === undefined ? `Continuar ${r.name}` : `Continuar a montagem ${r.name}, com ${r.count} ${r.count === 1 ? 'foto' : 'fotos'}`}
              onclick={() => (r.count === undefined ? openProject(r.id, r.thumb as Blob) : openPost(r.id, r.thumb))}
            >
              {#if r.url}
                <img src={r.url} alt="" draggable="false" />
              {/if}
            </button>
            {#if r.count !== undefined}
              <span class="many" aria-hidden="true"><Icon name="stack" size={13} />{r.count}</span>
            {/if}
            <button type="button" class="forget" aria-label="Esquecer {r.name}" onclick={() => forget(r)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</main>

<style>
  .home {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: safe center;
    gap: 34px;
    padding: calc(24px + var(--safe-top)) 24px calc(24px + var(--safe-bottom));
    overflow: auto;
  }

  .glow {
    position: fixed;
    left: 50%;
    top: 45%;
    width: 130vmax;
    height: 130vmax;
    translate: -50% -50%;
    background: radial-gradient(closest-side, rgb(255 184 119 / 0.09), transparent 62%);
    opacity: 0.7;
    pointer-events: none;
    animation: breathe 9s ease-in-out infinite;
    transition: opacity var(--t-slow);
  }

  @keyframes breathe {
    0%,
    100% {
      scale: 1;
    }
    50% {
      scale: 1.14;
    }
  }

  .hero {
    position: relative;
    width: min(620px, 100%);
    margin: 0 auto;
  }

  h1 {
    font-size: clamp(88px, 24vw, 168px);
    line-height: 0.9;
    letter-spacing: -0.02em;
  }

  .letter {
    display: inline-block;
  }

  .sub {
    margin-top: 14px;
    color: var(--paper-2);
  }

  .tray {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 2px;
    margin-top: 22px;
    padding: 24px 20px 20px;
    border-radius: 20px;
    background: rgb(255 255 255 / 0.025);
    box-shadow: inset 0 0 0 1px var(--line);
    text-align: center;
    cursor: pointer;
    transition:
      background var(--t-mid) var(--ease-swift),
      box-shadow var(--t-mid) var(--ease-swift),
      transform var(--t-fast) var(--ease-swift);
  }

  .tray:hover {
    background: rgb(255 184 119 / 0.05);
    box-shadow: inset 0 0 0 1px rgb(255 184 119 / 0.35);
  }

  .tray:active {
    transform: scale(0.99);
  }

  .tray:has(input:focus-visible) {
    outline: 2px solid var(--safe);
    outline-offset: 2px;
  }

  .corner {
    position: absolute;
    width: 20px;
    height: 20px;
    border: 2px solid var(--paper-3);
    transition:
      border-color var(--t-mid) var(--ease-swift),
      transform var(--t-mid) var(--ease-reveal);
  }

  .tl {
    top: 10px;
    left: 10px;
    border-width: 2px 0 0 2px;
    border-top-left-radius: 8px;
  }

  .tr {
    top: 10px;
    right: 10px;
    border-width: 2px 2px 0 0;
    border-top-right-radius: 8px;
  }

  .bl {
    bottom: 10px;
    left: 10px;
    border-width: 0 0 2px 2px;
    border-bottom-left-radius: 8px;
  }

  .br {
    bottom: 10px;
    right: 10px;
    border-width: 0 2px 2px 0;
    border-bottom-right-radius: 8px;
  }

  .tray:hover .corner {
    border-color: var(--safe);
  }

  .tray:hover .tl {
    transform: translate(-3px, -3px);
  }

  .tray:hover .tr {
    transform: translate(3px, -3px);
  }

  .tray:hover .bl {
    transform: translate(-3px, 3px);
  }

  .tray:hover .br {
    transform: translate(3px, 3px);
  }

  .sign {
    color: var(--paper-2);
    margin-bottom: 6px;
    transition:
      color var(--t-mid) var(--ease-swift),
      transform var(--t-mid) var(--ease-reveal);
  }

  .tray:hover .sign {
    color: var(--safe);
    transform: translateY(-3px);
  }

  .lead {
    font-size: clamp(28px, 6.5vw, 36px);
    line-height: 1.1;
    color: var(--paper);
  }

  .pick {
    min-height: 46px;
    margin: 12px 0 8px;
    padding: 0 24px;
  }

  .hint {
    font-size: 13px;
    color: var(--paper-2);
  }

  .with-touch {
    display: none;
  }

  @media (hover: none) {
    .with-mouse {
      display: none;
    }

    .with-touch {
      display: block;
    }
  }

  .actions {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 14px;
  }

  .actions .btn {
    min-height: 50px;
    padding: 0 22px;
    cursor: pointer;
  }

  .actions .btn:has(input:focus-visible) {
    outline: 2px solid var(--safe);
    outline-offset: 2px;
  }

  .several {
    margin-top: 10px;
    font-size: 13px;
    color: var(--paper-2);
    text-align: center;
    text-wrap: balance;
  }

  .recents {
    position: relative;
    width: min(620px, 100%);
    margin: 0 auto;
  }

  .recents h2 {
    font-size: 22px;
    margin-bottom: 10px;
  }

  .row {
    display: flex;
    gap: 10px;
    padding: 4px;
    margin: -4px;
  }

  .recent {
    position: relative;
    flex: none;
  }

  .thumb {
    display: block;
    width: 92px;
    height: 116px;
    border-radius: 14px;
    overflow: hidden;
    background: var(--ink-3);
    transition: transform var(--t-mid) var(--ease-reveal);
  }

  .thumb:hover {
    transform: translateY(-3px);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* A post shows as a pile: two more sheets peek from behind the first slide. */
  .post .thumb {
    box-shadow:
      0 0 0 1.5px var(--ink),
      5px -4px 0 -1px #34343a,
      5px -4px 0 0.5px var(--ink),
      10px -8px 0 -2px #26262b;
    margin-right: 10px;
  }

  .many {
    position: absolute;
    left: 5px;
    bottom: 5px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 7px 1px 5px;
    border-radius: 999px;
    background: rgb(11 11 12 / 0.74);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }

  .post .forget {
    right: 13px;
  }

  .forget {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgb(11 11 12 / 0.7);
  }
</style>
