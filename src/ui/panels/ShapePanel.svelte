<script lang="ts">
  /**
   * The sliders of one section of the face menu. Each one is centered on no change, and the numbers go in the
   * document. Above them the panel says which face they work on and what happened with the background.
   */
  import { SHAPE_SLIDERS, type ShapeSlider } from '../../core/face/reshape';
  import { toolById } from '../../tools/catalog';
  import { ensureLock, facePick, lockState } from '../facepick.svelte';
  import FillCard from '../FillCard.svelte';
  import ProgressCard from '../ProgressCard.svelte';
  import { chinNote, chosenFace, placeOf, searchMoreFaces, shapePick, valueOf } from '../shapepick.svelte';
  import Slider from '../Slider.svelte';
  import { bump, engine, ui } from '../state.svelte';
  import Switch from '../Switch.svelte';

  const e = engine();
  const section = $derived(ui.tool ? toolById(ui.tool)?.section : undefined);
  const sliders = $derived(SHAPE_SLIDERS.filter((s) => s.section === section));
  const parts = $derived([...new Set(sliders.map((s) => s.part))]);
  const off = $derived((ui.rev, !!section && !!e.doc.shapesOff?.includes(section)));
  const canHead = $derived(lockState.state === 'on');

  function valueHere(id: string): number {
    void ui.rev;
    return valueOf(e, id);
  }

  function set(slider: ShapeSlider, value: number) {
    const face = chosenFace();
    if (!face) return;
    // A slider moved in a section that is off turns the section back on.
    if (off && section) e.setShapeSectionOff(section, false);
    e.setShapeValue(placeOf(e, face), slider.id, value);
    bump();
  }

  function done() {
    e.commit();
    bump();
  }

  function showDetected(on: boolean) {
    shapePick.showing = on;
    e.showMatteLine = on;
    e.requestRender();
    bump();
  }

  /** The head needs the lock, and the double chin needs a fold in the photo. */
  function shown(slider: ShapeSlider): boolean {
    if (slider.id === 'head') return canHead;
    if (slider.id === 'doubleChin') return !chinNote();
    return true;
  }
</script>

<div class="shape" data-shape={shapePick.state} data-lock={lockState.state}>
  {#if shapePick.state === 'searching' && shapePick.task}
    <ProgressCard task={shapePick.task} title="Procurando o rosto e o fundo" note={facePick.download} />
  {:else if shapePick.state === 'no-face'}
    <p class="note" role="status">Não achei rosto nesta foto. Estes controles precisam dele. O Liquify segue livre, com o pincel.</p>
    <button type="button" class="btn" data-testid="shape-more" onclick={() => void searchMoreFaces(e)}>Procurar mais rostos</button>
  {:else if shapePick.state === 'failed'}
    <p class="note" role="status">O detector não carregou. Estes controles precisam dele. O Liquify segue livre, com o pincel.</p>
  {:else if shapePick.state === 'on'}
    {#if shapePick.faces.length > 1}
      <div class="faces" role="radiogroup" aria-label="Rosto">
        {#each shapePick.faces as face, i (face)}
          <button type="button" role="radio" aria-checked={shapePick.chosen === i} class:on={shapePick.chosen === i} data-testid="shape-face" onclick={() => { shapePick.chosen = i; bump(); }}>
            Rosto {i + 1}
          </button>
        {/each}
      </div>
    {/if}

    {#if lockState.state === 'on'}
      <p class="note lock" role="status" data-testid="lock-note">Fundo travado: só a cabeça se mexe. Pescoço, ombros e fundo ficam onde estão.</p>
      <FillCard />
    {:else if lockState.state === 'finding'}
      <p class="note lock" role="status" data-testid="lock-note">Separando a pessoa do fundo…</p>
    {:else}
      <p class="note warn" role="status" data-testid="lock-note">
        {lockState.state === 'failed' ? 'A separação do fundo não carregou' : 'Não consegui separar a pessoa do fundo nesta foto'}. Os controles funcionam, mas o fundo perto do rosto mexe junto, e o tamanho da cabeça fica desligado.
      </p>
      {#if lockState.state === 'failed'}
        <button type="button" class="btn" data-testid="lock-retry" onclick={() => void ensureLock(e)}>Tentar de novo</button>
      {/if}
    {/if}

    {#if off}
      <p class="note" role="status">Esta parte está desligada. Toque de novo na ferramenta ou mexa num controle para ligar.</p>
    {/if}

    {#key shapePick.chosen}
      {#each parts as part (part)}
        <h3>{part}</h3>
        {#each sliders.filter((s) => s.part === part) as s (s.id)}
          {#if shown(s)}
            <Slider label={s.label} value={valueHere(s.id)} min={s.min} max={100} bipolar={s.min < 0} resetTo={0} oninput={(v) => set(s, v)} onchange={done} />
          {:else if s.id === 'doubleChin'}
            <p class="note" role="status" data-testid="chin-note">Papada: {chinNote()}</p>
          {/if}
        {/each}
      {/each}
    {/key}

    <h3>Detecção</h3>
    <Switch label="Mostrar o que foi detectado" checked={shapePick.showing} testid="detect-toggle" onchange={showDetected} />
    {#if facePick.more}
      <button type="button" class="btn more" data-testid="shape-more" onclick={() => void searchMoreFaces(e)}>Procurar mais rostos</button>
    {/if}
  {/if}
</div>

<style>
  .shape {
    display: grid;
    gap: 4px;
  }

  h3 {
    margin: 10px 0 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--paper-3);
  }

  .note {
    font-size: 13px;
    line-height: 1.3;
    color: var(--paper-2);
  }

  .warn {
    color: var(--safe);
  }

  .btn {
    justify-self: start;
    font-size: 14px;
  }

  .more {
    margin-top: 4px;
  }

  .faces {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .faces button {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 13px;
    color: var(--paper-2);
    background: var(--ink-3);
  }

  .faces button.on {
    color: var(--ink);
    background: var(--safe);
  }
</style>
