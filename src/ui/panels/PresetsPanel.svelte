<script lang="ts">
  import { applyPreset } from '../../presets/apply';
  import { BUILTIN_PRESETS, presetFromDoc, type RetouchPreset } from '../../presets/recipes';
  import Icon from '../Icon.svelte';
  import { bump, engine, prefs, toast } from '../state.svelte';

  const e = engine();
  const KEY = 'glowup.presets';
  let custom = $state<RetouchPreset[]>(prefs.read(KEY, []));
  let name = $state('');
  let current = $state<string | null>(null);

  async function use(p: RetouchPreset) {
    current = p.id;
    await applyPreset(e, p);
    bump();
    toast(`Receita ${p.name} no ponto. As ferramentas pintadas seguem ela.`);
  }

  function save(event: SubmitEvent) {
    event.preventDefault();
    const label = name.trim();
    if (!label) return;
    custom = [...custom, presetFromDoc(e.doc, label)];
    prefs.write(KEY, custom);
    name = '';
    toast('Receita guardada.');
  }

  function remove(id: string) {
    custom = custom.filter((p) => p.id !== id);
    prefs.write(KEY, custom);
  }
</script>

<div class="list">
  {#each [...BUILTIN_PRESETS, ...custom] as p (p.id)}
    <div class="row" class:on={current === p.id}>
      <button type="button" class="pick" data-preset={p.id} onclick={() => use(p)}>
        <span class="serif name">{p.name}</span>
        <span class="note">{p.note}</span>
      </button>
      {#if p.custom}
        <button type="button" class="icon-btn" aria-label="Apagar receita {p.name}" onclick={() => remove(p.id)}>
          <Icon name="trash" size={18} />
        </button>
      {/if}
    </div>
  {/each}
</div>

<form onsubmit={save}>
  <label class="sr-only" for="preset-name">Nome da receita</label>
  <input id="preset-name" placeholder="Dar nome à edição atual" bind:value={name} maxlength="28" autocomplete="off" />
  <button type="submit" class="icon-btn" aria-label="Salvar receita" disabled={!name.trim()}><Icon name="plus" /></button>
</form>

<style>
  .list {
    display: grid;
    gap: 2px;
  }

  .row {
    display: flex;
    align-items: center;
    border-radius: 14px;
    transition: background var(--t-fast);
  }

  .row:hover {
    background: rgb(255 255 255 / 0.05);
  }

  .row.on .name {
    color: var(--safe);
  }

  .pick {
    flex: 1;
    display: grid;
    text-align: left;
    padding: 8px 10px;
  }

  .name {
    font-size: 22px;
    line-height: 1.1;
    transition: color var(--t-fast);
  }

  .note {
    font-size: 12.5px;
    color: var(--paper-2);
  }

  form {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }

  input {
    flex: 1;
    min-width: 0;
    height: 44px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--line-2);
    background: transparent;
    user-select: text;
    -webkit-user-select: text;
  }

  input::placeholder {
    color: var(--paper-3);
  }
</style>
