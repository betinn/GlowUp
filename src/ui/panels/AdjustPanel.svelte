<script lang="ts">
  import type { Adjustments } from '../../core/doc';
  import Slider from '../Slider.svelte';
  import { bump, engine, ui } from '../state.svelte';

  const e = engine();
  const a = $derived((ui.rev, { ...e.doc.adjust }));

  const GROUPS: { title: string; items: { key: keyof Adjustments; label: string; bipolar?: boolean }[] }[] = [
    {
      title: 'Luz',
      items: [
        { key: 'exposure', label: 'Exposição', bipolar: true },
        { key: 'contrast', label: 'Contraste', bipolar: true },
        { key: 'highlights', label: 'Realces', bipolar: true },
        { key: 'shadows', label: 'Sombras', bipolar: true },
      ],
    },
    {
      title: 'Cor',
      items: [
        { key: 'temperature', label: 'Temperatura', bipolar: true },
        { key: 'tint', label: 'Tint', bipolar: true },
        { key: 'saturation', label: 'Saturação', bipolar: true },
        { key: 'vibrance', label: 'Vibrance', bipolar: true },
      ],
    },
    {
      title: 'Acabamento',
      items: [
        { key: 'sharpen', label: 'Nitidez' },
        { key: 'grain', label: 'Granulação' },
        { key: 'vignette', label: 'Vinheta', bipolar: true },
      ],
    },
  ];
</script>

{#each GROUPS as g (g.title)}
  <h3 class="serif">{g.title}</h3>
  {#each g.items as item (item.key)}
    <Slider
      label={item.label}
      min={item.bipolar ? -100 : 0}
      max={100}
      bipolar={item.bipolar}
      resetTo={0}
      value={a[item.key]}
      oninput={(v) => {
        e.setAdjust(item.key, v);
        bump();
      }}
      onchange={() => e.commit()}
    />
  {/each}
{/each}

<style>
  h3 {
    font-size: 20px;
    margin: 10px 0 2px;
  }

  h3:first-child {
    margin-top: 0;
  }
</style>
