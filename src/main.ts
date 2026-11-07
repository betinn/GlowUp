import { mount } from 'svelte';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource-variable/instrument-sans/wght.css';
import './app.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => void navigator.serviceWorker.register('./sw.js'));
}
