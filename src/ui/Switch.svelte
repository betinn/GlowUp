<script lang="ts">
  /** A row that turns something on or off, with its name, the word for its state and a track. */
  let { label, checked, testid, onchange }: { label: string; checked: boolean; testid: string; onchange: (on: boolean) => void } = $props();
</script>

<button type="button" class="switch" class:on={checked} role="switch" aria-checked={checked} data-testid={testid} onclick={() => onchange(!checked)}>
  <span>{label}</span>
  <span class="state">{checked ? 'Ligado' : 'Desligado'}</span>
  <span class="track" aria-hidden="true"></span>
</button>

<style>
  .switch {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    padding: 0 4px 0 12px;
    border-radius: 14px;
    color: var(--paper-2);
    font-size: 13px;
    transition:
      color var(--t-fast),
      background var(--t-fast);
  }

  .switch:hover {
    background: rgb(255 255 255 / 0.06);
  }

  .switch.on {
    color: var(--safe);
    background: rgb(255 184 119 / 0.1);
  }

  .state {
    margin-left: auto;
  }

  .track {
    position: relative;
    flex: none;
    width: 34px;
    height: 20px;
    margin-right: 8px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.16);
    transition: background var(--t-fast);
  }

  .track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--paper);
    transition: translate var(--t-fast) var(--ease-reveal);
  }

  .switch.on .track {
    background: var(--safe);
  }

  .switch.on .track::after {
    translate: 14px 0;
    background: var(--ink);
  }
</style>
