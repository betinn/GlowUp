<script lang="ts">
  /** Three short cards, shown once. Each one shows the gesture instead of describing it at length. */
  import { reveal } from './motion';
  import { prefs } from './state.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const touch = matchMedia('(pointer: coarse)').matches;
  const STEPS = [
    { kind: 'paint', title: touch ? 'Um dedo pinta.' : 'Arraste para pintar.', text: 'Cada ferramenta age só onde você passar.' },
    {
      kind: 'pinch',
      title: touch ? 'Dois dedos movem.' : 'A roda dá zoom.',
      text: touch ? 'Pinça para aproximar, arraste para andar pela foto.' : 'Segure espaço para arrastar a foto.',
    },
    { kind: 'hold', title: 'Segure para ver o antes.', text: 'Nada é definitivo. A original fica intacta.' },
  ];

  let step = $state(0);
  const current = $derived(STEPS[step]);

  function finish() {
    prefs.write('glowup.onboarded', true);
    onclose();
  }
</script>

<div class="scrim" role="dialog" aria-modal="true" aria-label="Como usar">
  <div class="card">
    {#key step}
      <div class="demo {current.kind}" in:reveal={{ duration: 420 }} aria-hidden="true">
        <span class="dot a"></span>
        <span class="dot b"></span>
        <span class="trail"></span>
      </div>
      <h2 class="serif" in:reveal={{ delay: 80 }}>{current.title}</h2>
      <p in:reveal={{ delay: 140 }}>{current.text}</p>
    {/key}
    <div class="foot">
      <div class="pips" aria-hidden="true">
        {#each STEPS as s, i (s.kind)}
          <span class:on={i === step}></span>
        {/each}
      </div>
      <button type="button" class="skip" onclick={finish}>Pular</button>
      <button
        type="button"
        class="btn primary"
        data-testid="onboarding-next"
        onclick={() => {
          if (step < STEPS.length - 1) step++;
          else finish();
        }}
      >
        {step < STEPS.length - 1 ? 'Próximo' : 'Bora'}
      </button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgb(11 11 12 / 0.72);
    backdrop-filter: blur(6px);
  }

  .card {
    width: min(380px, 100%);
    padding: 22px;
    background: var(--ink-2);
    border: 1px solid var(--line);
    border-radius: 20px;
  }

  h2 {
    font-size: 32px;
    line-height: 1.05;
    margin-top: 14px;
  }

  p {
    color: var(--paper-2);
    margin-top: 6px;
    min-height: 42px;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
  }

  .pips {
    display: flex;
    gap: 6px;
    margin-right: auto;
  }

  .pips span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--line-2);
    transition: background var(--t-mid);
  }

  .pips .on {
    background: var(--safe);
  }

  .skip {
    min-height: 44px;
    padding: 0 8px;
    color: var(--paper-2);
    font-size: 14px;
  }

  .demo {
    position: relative;
    height: 132px;
    border-radius: 14px;
    background: radial-gradient(circle at 50% 40%, #3a3532, #171618 72%);
    overflow: hidden;
  }

  .dot {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 26px;
    height: 26px;
    margin: -13px;
    border-radius: 50%;
    border: 1.5px solid var(--paper);
    background: rgb(244 241 236 / 0.18);
  }

  .trail {
    position: absolute;
    left: 22%;
    right: 22%;
    top: 50%;
    height: 14px;
    margin-top: -7px;
    border-radius: 14px;
    background: var(--safe);
    opacity: 0;
    transform-origin: left;
  }

  .paint .b {
    display: none;
  }

  .paint .a {
    animation: sweep 2.2s var(--ease-swift) infinite;
  }

  .paint .trail {
    opacity: 0.4;
    animation: grow 2.2s var(--ease-swift) infinite;
  }

  .pinch .a {
    animation: pinch-a 2.2s var(--ease-swift) infinite;
  }

  .pinch .b {
    animation: pinch-b 2.2s var(--ease-swift) infinite;
  }

  .hold .b {
    display: none;
  }

  .hold .a {
    animation: press 2.2s var(--ease-reveal) infinite;
  }

  @keyframes sweep {
    0% {
      translate: -90px 0;
    }
    70%,
    100% {
      translate: 90px 0;
    }
  }

  @keyframes grow {
    0% {
      transform: scaleX(0);
    }
    70%,
    100% {
      transform: scaleX(1);
    }
  }

  @keyframes pinch-a {
    0%,
    100% {
      translate: -16px 16px;
    }
    50% {
      translate: -60px 40px;
    }
  }

  @keyframes pinch-b {
    0%,
    100% {
      translate: 16px -16px;
    }
    50% {
      translate: 60px -40px;
    }
  }

  @keyframes press {
    0%,
    100% {
      scale: 1;
      background: rgb(244 241 236 / 0.18);
    }
    40%,
    70% {
      scale: 0.82;
      background: var(--safe);
    }
  }
</style>
