<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { reveal } from './motion';
  import { openFile, openProject } from './open';

  interface Recent {
    id: string;
    name: string;
    url: string;
    thumb: Blob;
  }

  let recents = $state<Recent[]>([]);
  const WORD = 'Glowup'.split('');

  onMount(async () => {
    try {
      const { listProjects } = await import('../core/project');
      const list = await listProjects();
      recents = list.map((p) => ({ id: p.id, name: p.name, thumb: p.thumb, url: URL.createObjectURL(p.thumb) }));
    } catch {
      recents = [];
    }
  });

  onDestroy(() => recents.forEach((r) => URL.revokeObjectURL(r.url)));

  async function forget(id: string) {
    const { deleteProject } = await import('../core/project');
    await deleteProject(id);
    recents = recents.filter((r) => r.id !== id);
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
    </div>
  </section>

  {#if recents.length}
    <section class="recents" in:reveal={{ delay: 300 }} aria-label="Fotos recentes">
      <h2 class="serif">De onde parou</h2>
      <div class="row scroll-x">
        {#each recents as r (r.id)}
          <div class="recent">
            <button
              type="button"
              class="thumb"
              aria-label="Continuar {r.name}"
              onclick={() => openProject(r.id, r.thumb)}
            >
              <img src={r.url} alt="" draggable="false" />
            </button>
            <button type="button" class="forget" aria-label="Esquecer {r.name}" onclick={() => forget(r.id)}>
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
