#!/usr/bin/env node
/**
 * Shows that the replication works: applies known filters to real photos, gives the script only the results, and
 * compares what comes back with what went in. Photos stay on this machine, and only numbers are written.
 *
 * Usage: node scripts/replicate/validate.mjs <folder of photos> [--out .tmp/validate.md] [--filters a,b,c]
 */

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'vite';
import { grainNoise, GRAIN_GAIN, grainWeight, vignetteOn, vignetteShape } from './finish.mjs';
import { boxBlur, luma, median, openDecoder, sampleInto } from './image.mjs';
import { lookup } from './lut.mjs';
import { replicate } from './replicate.mjs';

const args = process.argv.slice(2);
const folder = args[0];
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const outFile = option('--out', '.tmp/validate.md');

/** The filter code of the app, loaded the way the app loads it, with its folder of files. */
const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error', optimizeDeps: { noDiscovery: true } });
const { FILTERS, buildLut } = await server.ssrLoadModule('/src/presets/luts.ts');
await server.close();

const pick = option('--filters', '');
const filters = pick ? FILTERS.filter((f) => pick.split(',').includes(f.id)) : FILTERS;

function tableOf(filter) {
  const size = 33;
  const rgba = buildLut(filter, size);
  const nodes = new Float32Array(size ** 3 * 3);
  for (let i = 0; i < size ** 3; i++) {
    for (let k = 0; k < 3; k++) nodes[i * 3 + k] = rgba[i * 4 + k];
  }
  return { size, nodes };
}

/** What the render does with a filter at full intensity. */
function applyFilter(img, filter) {
  const lut = tableOf(filter);
  const { w, h } = img;
  const rgb = new Float32Array(w * h * 3);
  const c = [0, 0, 0];
  const vignette = (filter.vignette ?? 0) / 100;
  const grain = (filter.grain ?? 0) / 100;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      lookup(lut, img.rgb[i * 3], img.rgb[i * 3 + 1], img.rgb[i * 3 + 2], c);
      if (vignette) {
        const s = vignetteShape((x + 0.5) / w, (y + 0.5) / h);
        for (let k = 0; k < 3; k++) c[k] = vignetteOn(c[k], vignette, s);
      }
      if (grain) {
        const n = grainNoise((x + 0.5) / w, (y + 0.5) / h) * grain * GRAIN_GAIN * grainWeight(luma(c[0], c[1], c[2]));
        for (let k = 0; k < 3; k++) c[k] += n;
      }
      rgb.set(c, i * 3);
    }
  }
  return { w, h, rgb };
}

/** Takes a crop, scales it and tilts it a little, as an export from another app may do. */
function reframe(img, { keep = 0.92, scale = 0.8, tilt = 0.3 } = {}) {
  const w = Math.round(img.w * keep * scale);
  const h = Math.round(img.h * keep * scale);
  const rgb = new Float32Array(w * h * 3);
  const angle = (tilt * Math.PI) / 180;
  const cos = Math.cos(angle) / scale;
  const sin = Math.sin(angle) / scale;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const sx = (img.w - 1) / 2 + img.w * 0.012;
  const sy = (img.h - 1) / 2 - img.h * 0.009;
  const out = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (sampleInto(img, cos * dx - sin * dy + sx, sin * dx + cos * dy + sy, out)) rgb.set(out, (y * w + x) * 3);
    }
  }
  return { w, h, rgb };
}

const faceMask = (u, v) => {
  const d = Math.hypot((u - 0.5) / 0.3, (v - 0.45) / 0.27);
  return Math.min(1, Math.max(0, (1.2 - d) / 0.4));
};

/** Light on the middle of the photo only, about where the face is. */
function faceLight(img, gain = 0.09) {
  const rgb = img.rgb.slice();
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const m = faceMask(x / img.w, y / img.h) * gain;
      if (m === 0) continue;
      const i = (y * img.w + x) * 3;
      for (let k = 0; k < 3; k++) rgb[i + k] = Math.min(1, rgb[i + k] + m * (k === 2 ? 0.7 : 1));
    }
  }
  return { w: img.w, h: img.h, rgb };
}

/** Fine detail smoothed away on the middle of the photo only, as skin smoothing does. */
function faceSmooth(img) {
  const radius = Math.max(3, Math.round(Math.max(img.w, img.h) / 200));
  const rgb = img.rgb.slice();
  for (let k = 0; k < 3; k++) {
    const channel = new Float32Array(img.w * img.h);
    for (let i = 0; i < channel.length; i++) channel[i] = img.rgb[i * 3 + k];
    const blur = boxBlur(boxBlur(channel, img.w, img.h, radius), img.w, img.h, radius);
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const i = y * img.w + x;
        const m = faceMask(x / img.w, y / img.h);
        rgb[i * 3 + k] = channel[i] + (blur[i] - channel[i]) * m;
      }
    }
  }
  return { w: img.w, h: img.h, rgb };
}

const decoder = await openDecoder();
const photos = [];
for (const name of readdirSync(folder)) {
  const img = await decoder.read(join(folder, name));
  photos.push(img);
  console.log(`foto ${photos.length}: ${img.w}x${img.h}`);
}

const rows = [];
async function run(label, filter, trainAt, { reshape = (a) => a, quality = 0.95, effect = (a) => a } = {}) {
  const started = performance.now();
  const holdAt = (trainAt + 1) % photos.length;
  const pair = async (photo, name) => ({
    name,
    before: photo,
    after: reshape(await decoder.jpeg(effect(applyFilter(photo, filter)), quality)),
  });
  const pairs = [await pair(photos[trainAt], `foto ${trainAt + 1}`)];
  const holdouts = [await pair(photos[holdAt], `foto ${holdAt + 1}`)];
  const { report } = replicate(pairs, holdouts, { id: 'x', name: 'x', category: 'x' });
  const row = {
    label,
    filter: filter.id,
    train: report.pairs[0].error.mean,
    trainP95: report.pairs[0].error.p95,
    hold: report.holdouts[0].error.mean,
    holdP95: report.holdouts[0].error.p95,
    grainTrue: filter.grain ?? 0,
    grain: report.grain,
    vignetteTrue: filter.vignette ?? 0,
    vignette: report.vignette,
    align: report.pairs[0].alignment.score,
    scale: report.pairs[0].alignment.scale,
    color: report.pairs[0].localColor.found,
    detail: report.pairs[0].localDetail.found,
  };
  rows.push(row);
  console.log(JSON.stringify(row), `${Math.round(performance.now() - started)} ms`);
}

const SAMPLE = new Set(['cinema-tarde', 'grao-quente', 'prata', 'mel', 'neblina', 'cruzado']);
const sampled = filters.filter((f) => SAMPLE.has(f.id));
for (const [i, filter] of filters.entries()) await run('direto', filter, i % photos.length);
for (const [i, filter] of sampled.entries()) await run('recorte', filter, i % photos.length, { reshape: (a) => reframe(a), quality: 0.85 });
for (const [i, filter] of sampled.entries()) await run('luz local', filter, i % photos.length, { effect: (a) => faceLight(a) });
for (const [i, filter] of sampled.entries()) await run('pele lisa', filter, i % photos.length, { effect: (a) => faceSmooth(a) });
await decoder.close();

const avg = (list, key) => list.reduce((s, r) => s + r[key], 0) / Math.max(list.length, 1);
const lines = ['| Caso | Filtro | ΔE ajuste | p95 | ΔE separado | p95 | Grão real | Grão medido | Vinheta real | Vinheta medida | Alinhamento | Cor local | Textura local |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
for (const r of rows) {
  lines.push(`| ${r.label} | ${r.filter} | ${r.train} | ${r.trainP95} | ${r.hold} | ${r.holdP95} | ${r.grainTrue} | ${r.grain} | ${r.vignetteTrue} | ${r.vignette} | ${r.align} | ${r.color ? 'sim' : 'não'} | ${r.detail ? 'sim' : 'não'} |`);
}
const summary = [];
for (const label of ['direto', 'recorte', 'luz local', 'pele lisa']) {
  const list = rows.filter((r) => r.label === label);
  if (!list.length) continue;
  const flagged = list.filter((r) => r.color || r.detail).length;
  summary.push(`- **${label}** (${list.length} casos): ΔE no ajuste ${avg(list, 'train').toFixed(2)}, no par separado ${avg(list, 'hold').toFixed(2)} (mediana ${median(list.map((r) => r.hold)).toFixed(2)}), p95 separado ${avg(list, 'holdP95').toFixed(2)}, efeito local apontado em ${flagged}.`);
}
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${summary.join('\n')}\n\n${lines.join('\n')}\n`);
console.log(summary.join('\n'));
process.exit(0);
