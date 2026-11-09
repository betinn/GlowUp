/**
 * From before and after photos to a filter: aligns each pair, fits a 3D table, measures grain, vignette and tone
 * curve, tries the result on held-out pairs and says where a global table cannot explain the photo.
 */

import { alignImages } from './align.mjs';
import { vignetteOff, vignetteOn, vignetteShape } from './finish.mjs';
import { boxBlur, lumaOf, median, sampleInto } from './image.mjs';
import { encodeLut, fitLut, lookup } from './lut.mjs';
import { colorError, findLocalColor, findLocalDetail, measureGrain, measureToneCurve, measureVignette, predictor, vignetteLeft } from './measure.mjs';

/** Long side, in samples, of the grid the table is fitted on. Averaging into it removes grain and compression. */
const GRID_SIDE = 400;
/** Near an edge, a resized photo mixes two colors and a small slip shows, neither of which a table can do. */
const EDGE_LIMIT = 0.035;
const EDGE_RADIUS = 2;
const VALID_MARGIN = 4;
/** Below these, on the scales of the panel, there is no vignette or grain worth keeping. */
const MIN_VIGNETTE = 1.5;
const MIN_GRAIN = 6;
const WEAK_ALIGNMENT = 0.9;
const SEEN_ENOUGH = 0.5;

const toFixed = (v, digits = 2) => Number(v.toFixed(digits));

/**
 * `before` seen through the map, on the grid of `after`. A slip of less than a pixel past the border still reads the
 * border. Pixels near what fell outside are not valid either, because every blur later on would reach across.
 */
function warpBefore(before, after, map) {
  const { w, h } = after;
  const rgb = new Float32Array(w * h * 3);
  const inside = new Float32Array(w * h);
  const out = [0, 0, 0];
  const lastX = before.w - 1;
  const lastY = before.h - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const bx = map[0] * x + map[1] * y + map[2];
      const by = map[3] * x + map[4] * y + map[5];
      if (bx < -1 || by < -1 || bx > lastX + 1 || by > lastY + 1) continue;
      sampleInto(before, Math.min(lastX, Math.max(0, bx)), Math.min(lastY, Math.max(0, by)), out);
      rgb[i * 3] = out[0];
      rgb[i * 3 + 1] = out[1];
      rgb[i * 3 + 2] = out[2];
      inside[i] = 1;
    }
  }
  const reach = boxBlur(inside, w, h, VALID_MARGIN);
  return { w, h, rgb, valid: Uint8Array.from(reach, (v) => (v > 0.999 ? 1 : 0)) };
}

/** Averages both photos into blocks, leaving out the blocks near an edge or off the before photo. */
function collectSamples(aligned, after) {
  const { w, h } = after;
  const block = Math.max(1, Math.round(Math.max(w, h) / GRID_SIDE));
  const gridW = Math.floor(w / block);
  const gridH = Math.floor(h / block);
  const input = new Float32Array(gridW * gridH * 3);
  const output = new Float32Array(gridW * gridH * 3);
  const shape = new Float32Array(gridW * gridH);
  const index = new Int32Array(gridW * gridH);
  const rough = edgeMap(aligned);
  let n = 0;
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const mean = [0, 0, 0, 0, 0, 0];
      let usable = true;
      for (let y = gy * block; usable && y < (gy + 1) * block; y++) {
        for (let x = gx * block; x < (gx + 1) * block; x++) {
          const i = y * w + x;
          if (!aligned.valid[i] || rough[i] > EDGE_LIMIT) {
            usable = false;
            break;
          }
          for (let k = 0; k < 3; k++) {
            mean[k] += aligned.rgb[i * 3 + k];
            mean[k + 3] += after.rgb[i * 3 + k];
          }
        }
      }
      if (!usable) continue;
      const count = block * block;
      for (let k = 0; k < 3; k++) {
        input[n * 3 + k] = mean[k] / count;
        output[n * 3 + k] = mean[k + 3] / count;
      }
      shape[n] = vignetteShape(((gx + 0.5) * block) / w, ((gy + 0.5) * block) / h);
      index[n] = gy * gridW + gx;
      n++;
    }
  }
  return { input: input.slice(0, n * 3), output: output.slice(0, n * 3), shape: shape.slice(0, n), index: index.slice(0, n), gridW, gridH };
}

/** How far each pixel strays from the mean of its surroundings. */
function edgeMap(img) {
  const { w, h } = img;
  const l = lumaOf(img);
  const squares = l.map((v) => v * v);
  const mean = boxBlur(l, w, h, EDGE_RADIUS);
  const meanSquare = boxBlur(squares, w, h, EDGE_RADIUS);
  return mean.map((m, i) => Math.sqrt(Math.max(0, meanSquare[i] - m * m)));
}

function preparePair(pair) {
  const { map, score } = alignImages(pair.before, pair.after);
  const aligned = warpBefore(pair.before, pair.after, map);
  return { ...pair, map, score, aligned, samples: collectSamples(aligned, pair.after) };
}

const describeMap = (map) => ({
  scale: toFixed(Math.sqrt(Math.abs(map[0] * map[4] - map[1] * map[3])), 4),
  rotation: toFixed((Math.atan2(map[3], map[0]) * 180) / Math.PI, 2),
  shiftX: toFixed(map[2], 1),
  shiftY: toFixed(map[5], 1),
});

/** Each pixel of `after` lands on a pixel of `before`, give or take a slip too small to matter. */
function onSameGrid({ map, after }) {
  const corners = [[0, 0], [after.w, 0], [0, after.h], [after.w, after.h]];
  return corners.every(([x, y]) => Math.hypot(map[0] * x + map[1] * y + map[2] - x, map[3] * x + map[4] * y + map[5] - y) < 0.4);
}

function predictSamples(samples, lut, vignette) {
  const out = new Float32Array(samples.input.length);
  const c = [0, 0, 0];
  for (let i = 0; i < samples.shape.length; i++) {
    lookup(lut, samples.input[i * 3], samples.input[i * 3 + 1], samples.input[i * 3 + 2], c);
    for (let k = 0; k < 3; k++) out[i * 3 + k] = vignette ? vignetteOn(c[k], vignette, samples.shape[i]) : c[k];
  }
  return out;
}

function concat(lists, key) {
  const out = new Float32Array(lists.reduce((sum, s) => sum + s[key].length, 0));
  let at = 0;
  for (const s of lists) {
    out.set(s[key], at);
    at += s[key].length;
  }
  return out;
}

/**
 * Replicates a filter. `pairs` and `holdouts` hold `{ name, before, after }`, and `meta` the `id`, `name` and
 * `category` of the new filter. Returns the data of the filter file and the numbers of the report.
 */
export function replicate(pairs, holdouts, meta, { size = 17 } = {}) {
  const train = pairs.map(preparePair);
  const all = train.map((p) => p.samples);
  const input = concat(all, 'input');
  const output = concat(all, 'output');
  const shape = concat(all, 'shape');

  const withoutVignette = (amount) => {
    const flat = output.slice();
    if (amount) {
      for (let i = 0; i < shape.length; i++) {
        for (let k = 0; k < 3; k++) flat[i * 3 + k] = vignetteOff(output[i * 3 + k], amount, shape[i]);
      }
    }
    return flat;
  };
  // The table is fitted once with the first reading, then that reading is corrected with what the table left over.
  const first = measureVignette(input, output, shape);
  const rough = fitLut(input, withoutVignette(first), { size, rounds: 1 });
  const measured = first + vignetteLeft(input, output, shape, rough, first);
  const vignette = Math.abs(measured) * 100 < MIN_VIGNETTE ? 0 : measured;
  const lut = fitLut(input, withoutVignette(vignette), { size });

  const pairReports = train.map((p) => {
    const predicted = predictSamples(p.samples, lut, vignette);
    const predictAt = predictor(p.aligned, lut, vignette);
    const { grain, sigma } = measureGrain(p.aligned, p.after, predictAt, onSameGrid(p));
    return {
      name: p.name,
      alignment: { score: toFixed(p.score, 4), ...describeMap(p.map) },
      samples: p.samples.shape.length,
      error: rounded(colorError(predicted, p.samples.output)),
      grain,
      sigma,
      localColor: roundedLocal(findLocalColor(p.samples, predicted)),
      localDetail: roundedLocal(findLocalDetail(p.aligned, p.after, sigma, predictAt)),
    };
  });

  const holdoutReports = holdouts.map(preparePair).map((p) => ({
    name: p.name,
    alignment: { score: toFixed(p.score, 4), ...describeMap(p.map) },
    samples: p.samples.shape.length,
    error: rounded(colorError(predictSamples(p.samples, lut, vignette), p.samples.output)),
  }));

  const grainValue = median(pairReports.map((p) => p.grain));
  const grain = grainValue < MIN_GRAIN ? 0 : grainValue;
  const filter = {
    id: meta.id,
    name: meta.name,
    category: meta.category,
    ...(meta.suggest ? {} : { suggest: false }),
    ...(grain ? { grain: toFixed(grain, 1) } : {}),
    ...(vignette ? { vignette: toFixed(vignette * 100, 1) } : {}),
    lut: { size, table: encodeLut(lut) },
  };

  const covered = lut.seen.reduce((sum, v) => sum + (v > SEEN_ENOUGH ? 1 : 0), 0) / lut.seen.length;
  const report = {
    id: meta.id,
    name: meta.name,
    size,
    grain: toFixed(grain, 1),
    vignette: toFixed(vignette * 100, 1),
    coverage: toFixed(covered, 3),
    toneCurve: measureToneCurve(input, output).map((b) => ({ ...b, in: toFixed(b.in, 3), out: toFixed(b.out, 3), r: toFixed(b.r, 3), g: toFixed(b.g, 3), b: toFixed(b.b, 3) })),
    pairs: pairReports.map(({ sigma: _sigma, grain: g, ...rest }) => ({ ...rest, grain: toFixed(g, 1) })),
    holdouts: holdoutReports,
    resized: train.filter((p) => !onSameGrid(p)).map((p) => p.name),
    weakAlignment: [...pairReports, ...holdoutReports].filter((p) => p.alignment.score < WEAK_ALIGNMENT).map((p) => p.name),
    localEffect: pairReports.some((p) => p.localColor.found || p.localDetail.found),
  };
  return { filter, report, lut, vignette };
}

function rounded(e) {
  return { mean: toFixed(e.mean), median: toFixed(e.median), p95: toFixed(e.p95), max: toFixed(e.max) };
}

function roundedLocal({ found, area, box, tooSmall }) {
  return {
    found,
    tooSmall,
    area: toFixed(area, 3),
    box: box && { left: toFixed(box.left), top: toFixed(box.top), right: toFixed(box.right), bottom: toFixed(box.bottom) },
  };
}

const pct = (v) => `${Math.round(v * 100)}%`;
const where = (box) => (box ? `de ${pct(box.left)} a ${pct(box.right)} na largura, de ${pct(box.top)} a ${pct(box.bottom)} na altura` : '');
const patchWords = (patch) => (patch.found ? `sim, em ${pct(patch.area)} da foto, ${where(patch.box)}` : 'não');

/** The report as text for people, in Portuguese like the rest of the docs. */
export function reportMarkdown(r) {
  const lines = [`# Réplica de filtro: ${r.name}`, ''];
  lines.push(r.localEffect ? '**Efeito local detectado.** Uma tabela global não explica a foto toda. Veja abaixo.' : 'Nenhum efeito local detectado: uma tabela global explica a foto.', '');
  if (r.weakAlignment.length) lines.push(`**Alinhamento fraco** em ${r.weakAlignment.join(', ')}. Os números abaixo valem pouco para esses pares.`, '');
  lines.push(`Tabela de ${r.size}³, com ${pct(r.coverage)} do cubo de cores coberto pelas fotos. O resto é extrapolado.`);
  lines.push(`Grão: ${r.grain}. Vinheta: ${r.vignette}. Mesmas escalas do painel Ajustes.`, '');
  if (r.resized.length) lines.push(`As fotos de ${r.resized.join(', ')} não têm os mesmos pixels: uma foi recortada ou redimensionada. Grão fino não dá para separar da compressão nesse caso, então o grão medido pode ficar abaixo do real.`, '');
  lines.push('## Erro de cor (delta E 2000)', '', '| Par | Uso | Médio | Mediana | p95 | Máximo | Alinhamento |', '| --- | --- | --- | --- | --- | --- | --- |');
  const row = (p, use) => `| ${p.name} | ${use} | ${p.error.mean} | ${p.error.median} | ${p.error.p95} | ${p.error.max} | ${p.alignment.score} |`;
  for (const p of r.pairs) lines.push(row(p, 'ajuste'));
  for (const p of r.holdouts) lines.push(row(p, 'separado'));
  lines.push('', 'Até 2 é difícil de ver lado a lado. Acima de 5 a diferença salta aos olhos.');
  if (!r.holdouts.length) lines.push('', 'Sem par separado: a tabela só foi conferida nas próprias fotos do ajuste, então o erro acima é otimista.');
  lines.push('', '## Efeitos locais', '');
  for (const p of r.pairs) {
    const texture = p.localDetail.tooSmall ? 'foto pequena demais para medir' : patchWords(p.localDetail);
    lines.push(`- **${p.name}.** Cor: ${patchWords(p.localColor)}. Textura: ${texture}.`);
  }
  lines.push('', 'Cor quer dizer luz ou tom mudando só numa parte, como um rosto iluminado à parte. Textura quer dizer detalhe sumindo só numa parte, como pele alisada. O filtro gerado não reproduz nada disso, e a tabela fica um pouco puxada por essas áreas.');
  lines.push('', '## Curva de tom', '', '| Entra | Sai | R | G | B | Amostras |', '| --- | --- | --- | --- | --- | --- |');
  for (const b of r.toneCurve) lines.push(`| ${b.in} | ${b.out} | ${b.r} | ${b.g} | ${b.b} | ${b.count} |`);
  return `${lines.join('\n')}\n`;
}
