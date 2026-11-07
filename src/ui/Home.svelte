<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { reveal } from './motion';
  import { toast, ui } from './state.svelte';

  interface Recent {
    id: string;
    name: string;
    url: string;
  }

  let dragging = $state(false);
  let recents = $state<Recent[]>([]);
  let dragDepth = 0;
  const WORD = 'Glowup'.split('');

  onMount(async () => {
    try {
      const { listProjects } = await import('../core/project');
      const list = await listProjects();
      recents = list.map((p) => ({ id: p.id, name: p.name, url: URL.createObjectURL(p.thumb) }));
    } catch {
      recents = [];
    }
  });

  onDestroy(() => recents.forEach((r) => URL.revokeObjectURL(r.url)));

  function open(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name)) {
      toast('Não consegui abrir esse arquivo. Tenta um JPG, PNG ou WebP?');
      return;
    }
    ui.pending = { file };
    ui.screen = 'editor';
  }

  function drop(ev: DragEvent) {
    ev.preventDefault();
    dragging = false;
    dragDepth = 0;
    open(ev.dataTransfer?.files[0]);
  }

  async function forget(id: string) {
    const { deleteProject } = await import('../core/project');
    await deleteProject(id);
    recents = recents.filter((r) => r.id !== id);
  }
</script>

<svelte:window
  ondragenter={(e) => {
    e.preventDefault();
    dragDepth++;
    dragging = true;
  }}
  ondragover={(e) => e.preventDefault()}
  ondragleave={() => {
    dragDepth--;
    if (dragDepth <= 0) dragging = false;
  }}
  ondrop={drop}
/>

<main class="home" class:dragging>
  <div class="glow" aria-hidden="true"></div>

  <section class="hero">
    <h1 class="serif" aria-label="Glowup">
      {#each WORD as letter, i (i)}
        <span class="letter" aria-hidden="true" in:reveal={{ delay: 120 + i * 70, duration: 760, y: 18 }}>{letter}</span>
      {/each}
    </h1>
    <p class="serif lead" in:reveal={{ delay: 620 }}>{dragging ? 'Pode soltar.' : 'Solta a foto aqui.'}</p>
    <p class="sub" in:reveal={{ delay: 720 }}>Nada sai do seu aparelho. Nem um pixel.</p>

    <div class="actions" in:reveal={{ delay: 820 }}>
      <label class="btn primary">
        <Icon name="gallery" size={20} /> Escolher foto
        <input class="sr-only" data-testid="file-input" type="file" accept="image/*" onchange={(e) => open(e.currentTarget.files?.[0])} />
      </label>
      <label class="btn">
        <Icon name="camera" size={20} /> Tirar foto
        <input class="sr-only" type="file" accept="image/*" capture="user" onchange={(e) => open(e.currentTarget.files?.[0])} />
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
              onclick={() => {
                ui.pending = { projectId: r.id };
                ui.screen = 'editor';
              }}
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
    justify-content: center;
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

  .dragging .glow {
    opacity: 1;
    background: radial-gradient(closest-side, rgb(255 184 119 / 0.22), transparent 66%);
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

  .lead {
    font-size: clamp(30px, 7vw, 40px);
    margin-top: 20px;
    color: var(--paper);
  }

  .sub {
    margin-top: 4px;
    color: var(--paper-2);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 28px;
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
