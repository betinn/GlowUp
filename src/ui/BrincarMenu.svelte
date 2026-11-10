<script lang="ts">
  /**
   * The menu of the Brincar path: face effects with a slider each, stickers in a grid, and a way to take it all
   * off. Everything here is playful and apart from the realistic tools: their numbers, their field and their
   * limits never meet these.
   */
  import { onDestroy, onMount } from 'svelte';
  import { FUN_EFFECTS } from '../core/fun/effects/index';
  import { STICKER_GROUPS, STICKERS, stickerById } from '../core/fun/stickers/index';
  import type { FunEffect, StickerGroup } from '../core/fun/types';
  import { selectTool } from './actions';
  import { lockState } from './facepick.svelte';
  import FillCard from './FillCard.svelte';
  import { closeFun, funHeld, funPick, funValueOf, openFun, putSticker, raiseSelected, removeSelected, resetFun, setFunValue } from './funpick.svelte';
  import Icon from './Icon.svelte';
  import ProgressCard from './ProgressCard.svelte';
  import Slider from './Slider.svelte';
  import { bump, engine, toast, ui } from './state.svelte';

  const e = engine();

  /** The art of each sticker for its button, as the file itself. */
  const thumbs = new Map(STICKERS.map((s) => [s.id, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}`]));

  const ready = $derived(funPick.state === 'on');
  const held = $derived((ui.rev, funHeld(e)));
  const layeredOn = $derived((ui.rev, FUN_EFFECTS.some((f) => f.layered && funValueOf(e, f.id) > 0)));
  const selected = $derived((ui.rev, funPick.selected !== null && !!e.doc.fun?.stickers?.some((s) => s.id === funPick.selected)));

  /** The tab of the grid of stickers. */
  let group = $state<StickerGroup>('oculos');
  const shelf = $derived(STICKERS.filter((s) => s.group === group));
  /** The stickers on the photo, from the one under all to the one on top. */
  const placed = $derived((ui.rev, [...(e.doc.fun?.stickers ?? [])]));
  const onTop = $derived(placed.length > 0 && placed[placed.length - 1].id === funPick.selected);

  function choose(id: number) {
    funPick.selected = id;
    bump();
  }

  onMount(() => {
    // A tool of another path closes: Brincar has none.
    void selectTool(null).then(() => openFun(e));
  });
  onDestroy(closeFun);

  function valueHere(id: string): number {
    void ui.rev;
    return funValueOf(e, id);
  }

  function done() {
    e.commit();
    bump();
  }

  async function reset() {
    if (await resetFun(e)) toast('Brincar voltou ao original. Desfazer traz de volta.');
  }

  const lockNote = (effect: FunEffect) => {
    if (!effect.layered || !layeredOn) return '';
    if (lockState.state === 'finding') return 'Separando a pessoa do fundo…';
    if (lockState.state === 'on') return '';
    if (lockState.state === 'none' || lockState.state === 'failed') return 'Não deu para separar a pessoa do fundo nesta foto: o que fica em volta da cabeça mexe junto.';
    return '';
  };
</script>

<div class="brincar" data-testid="brincar-menu" data-fun={funPick.state}>
  <p class="intro serif">Para rir. Nada daqui mexe no retoque de verdade.</p>

  {#if funPick.state === 'searching' && funPick.task}
    <ProgressCard task={funPick.task} title="Procurando os rostos" />
  {:else if funPick.state === 'no-face'}
    <p class="note" role="status">Não achei rosto nesta foto. As caretas precisam dele. Os adesivos vão para o meio da foto.</p>
  {:else if funPick.state === 'failed'}
    <p class="note" role="status">O detector não carregou. As caretas precisam dele. Os adesivos vão para o meio da foto.</p>
  {/if}

  {#if ready && funPick.faces.length > 1}
    <div class="faces" role="radiogroup" aria-label="Rosto">
      {#each funPick.faces as face, i (face)}
        <button type="button" role="radio" aria-checked={funPick.chosen === i} class:on={funPick.chosen === i} data-testid="fun-face"
          onclick={() => { funPick.chosen = i; bump(); }}>Rosto {i + 1}</button>
      {/each}
    </div>
  {/if}

  {#if ready}
    <h3>Caretas</h3>
    {#key funPick.chosen}
      {#each FUN_EFFECTS as effect (effect.id)}
        <div class="effect" data-effect={effect.id}>
          <Slider label={effect.label} value={valueHere(effect.id)} min={0} max={100} resetTo={0}
            oninput={(v) => setFunValue(e, effect.id, v, !!effect.layered)} onchange={done} />
          {#if lockNote(effect)}
            <p class="note" role="status" data-testid="fun-lock">{lockNote(effect)}</p>
          {:else if effect.note}
            <p class="note">{effect.note}</p>
          {/if}
        </div>
      {/each}
    {/key}
    {#if layeredOn && lockState.state === 'on'}
      <FillCard />
    {/if}
  {/if}

  {#if funPick.state !== 'searching' && funPick.state !== 'idle'}
    <h3>Adesivos</h3>
    <div class="tabs" role="tablist" aria-label="Tipos de adesivo">
      {#each STICKER_GROUPS as g (g.id)}
        <button type="button" role="tab" aria-selected={group === g.id} class:on={group === g.id} data-testid="sticker-group" data-tab={g.id}
          onclick={() => (group = g.id)}>{g.label}</button>
      {/each}
    </div>
    <div class="grid" role="tabpanel" aria-label="Adesivos">
      {#each shelf as sticker (sticker.id)}
        <button type="button" class="sticker" data-testid="sticker" data-kind={sticker.id} aria-label="Pôr {sticker.label}" title={sticker.label}
          onclick={() => putSticker(e, sticker)}>
          <img src={thumbs.get(sticker.id)} alt="" draggable="false" />
        </button>
      {/each}
    </div>
    {#if ready && funPick.faces.length > 1}
      <p class="note">Vai para o rosto escolhido lá em cima.</p>
    {/if}
    {#if placed.length}
      <h3>Na foto <span class="hint">· o último fica por cima</span></h3>
      <div class="placed" role="listbox" aria-label="Adesivos na foto, de baixo para cima">
        {#each placed as s (s.id)}
          {@const def = stickerById(s.kind)}
          <button type="button" role="option" aria-selected={funPick.selected === s.id} class:on={funPick.selected === s.id} data-testid="placed" data-sticker={s.id}
            aria-label={def?.label ?? 'Adesivo'} title={def?.label} onclick={() => choose(s.id)}>
            {#if thumbs.get(s.kind)}<img src={thumbs.get(s.kind)} alt="" draggable="false" />{/if}
          </button>
        {/each}
      </div>
    {/if}
    {#if selected}
      <p class="note">Arraste o adesivo na foto. Dois dedos, a alça do canto ou a rodinha do mouse giram e mudam o tamanho.</p>
      <div class="actions">
        <button type="button" class="btn" data-testid="sticker-raise" disabled={onTop} onclick={() => raiseSelected(e)}><Icon name="front" size={18} /> Trazer para frente</button>
        <button type="button" class="btn" data-testid="sticker-remove" onclick={() => removeSelected(e)}><Icon name="trash" size={18} /> Tirar adesivo</button>
      </div>
    {/if}
  {/if}

  {#if held}
    <button type="button" class="btn zero" data-testid="fun-reset" onclick={() => void reset()}><Icon name="reset" size={18} /> Zerar Brincar</button>
  {/if}
</div>

<style>
  .brincar {
    display: grid;
    gap: 4px;
    padding: 12px 16px;
    overflow-y: auto;
    max-height: 100%;
  }

  .intro {
    font-size: 17px;
    font-style: italic;
    line-height: 1.2;
    color: var(--paper-2);
    margin-bottom: 4px;
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

  .effect {
    display: grid;
    gap: 2px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 8px;
    margin: 4px 0;
  }

  .sticker {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 8px;
    border-radius: 14px;
    background: var(--paper-2);
    transition: transform var(--t-fast) var(--ease-reveal);
  }

  .sticker:active {
    transform: scale(0.94);
  }

  .sticker img {
    width: 100%;
    height: 100%;
    min-height: 0;
    object-fit: contain;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
  }

  .tabs button {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 13px;
    color: var(--paper-2);
    background: var(--ink-3);
  }

  .tabs button.on {
    color: var(--ink);
    background: var(--paper);
  }

  .hint {
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
  }

  .placed {
    display: flex;
    gap: 6px;
    min-height: 58px;
    overflow-x: auto;
    padding: 3px 3px 6px;
  }

  .placed button {
    flex: none;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    padding: 5px;
    border-radius: 10px;
    background: var(--paper-2);
    outline: 2px solid transparent;
    outline-offset: 1px;
  }

  .placed button.on {
    outline-color: var(--safe);
  }

  .placed img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .btn {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
  }

  .zero {
    margin-top: 10px;
  }

  /* On a phone the photo keeps most of the screen, and the menu scrolls under it. */
  @media (max-width: 899px) {
    .brincar {
      max-height: 38dvh;
    }

    .intro {
      font-size: 15px;
    }

    .grid {
      grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
    }
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
