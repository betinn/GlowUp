#!/usr/bin/env node
/**
 * Measures brush, liquify and export on a generated 12 MP photo, on this machine's GPU.
 * Needs a running preview server: npm run preview -- --port 4173
 * Usage: node scripts/perf.mjs
 */

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 4000;
const H = 3000;
const FILE = '.tmp/perf-12mp.png';

function makeImage() {
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(td.length + 8);
    out.writeUInt32BE(data.length, 0);
    td.copy(out, 4);
    out.writeUInt32BE(crc(td), td.length + 4);
    return out;
  };
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    for (let x = 0; x < W; x++) {
      const n = ((x * 2654435761 + y * 40503) >>> 24) / 16;
      raw[row + 1 + x * 3] = 200 - (y / H) * 80 + n;
      raw[row + 2 + x * 3] = 160 - (x / W) * 60 + n;
      raw[row + 3 + x * 3] = 140 + n;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  mkdirSync('.tmp', { recursive: true });
  writeFileSync(
    FILE,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 1 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

async function frames(page, run) {
  await page.evaluate(() => {
    window.__t = [];
    window.__on = true;
    const tick = (t) => {
      window.__t.push(t);
      if (window.__on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await run();
  return page.evaluate(() => {
    window.__on = false;
    const d = window.__t.slice(1).map((t, i) => t - window.__t[i]).sort((a, b) => a - b);
    const avg = d.reduce((a, b) => a + b, 0) / d.length;
    return { fps: Math.round(1000 / avg), p95: Math.round(d[Math.floor(d.length * 0.95)]) };
  });
}

async function stroke(page, loops = 8) {
  await page.mouse.move(400, 300);
  await page.mouse.down();
  for (let i = 0; i < loops * 40; i++) {
    const a = i / 12;
    await page.mouse.move(520 + Math.cos(a) * 180, 420 + Math.sin(a) * 180);
  }
  await page.mouse.up();
}

makeImage();
const args = process.argv.includes('--software')
  ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  : ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-gpu-vsync'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
await page.addInitScript(() => localStorage.setItem('glowup.onboarded', 'true'));
await page.goto('http://localhost:4173/');
const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log('renderer:', renderer);

let t = Date.now();
await page.setInputFiles('[data-testid=file-input]', FILE);
await page.locator('[data-group=skin]').waitFor({ timeout: 120000 });
console.log('open 12 MP:', Date.now() - t, 'ms');

await page.locator('[data-tool=smooth]').click();
await page.waitForTimeout(600);
console.log('brush (Suavizar):', await frames(page, () => stroke(page)));

await page.locator('[data-group=shape]').click();
await page.waitForTimeout(600);
console.log('liquify:', await frames(page, () => stroke(page)));

await page.getByTestId('export-open').click();
t = Date.now();
await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByTestId('export-go').click()]);
console.log('export JPG 12 MP:', Date.now() - t, 'ms');
await browser.close();
