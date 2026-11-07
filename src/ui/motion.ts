import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const revealEase = (t: number) => 1 - (1 - t) ** 4;

/** Content settles like a print in the developer tray: from blurred and faint to sharp. */
export function reveal(_node: Element, { duration = 520, delay = 0, y = 10 } = {}): TransitionConfig {
  if (reducedMotion()) return { duration: 120, css: (t) => `opacity: ${t}` };
  return {
    duration,
    delay,
    easing: revealEase,
    css: (t, u) => `opacity: ${t}; filter: blur(${u * 8}px) brightness(${0.7 + 0.3 * t}); transform: translateY(${u * y}px)`,
  };
}

/** Bottom sheet or side panel entrance. */
export function rise(_node: Element, { duration = 280, y = 24 } = {}): TransitionConfig {
  if (reducedMotion()) return { duration: 100, css: (t) => `opacity: ${t}` };
  return {
    duration,
    easing: cubicOut,
    css: (t, u) => `opacity: ${t}; transform: translateY(${u * y}px)`,
  };
}
