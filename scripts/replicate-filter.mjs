#!/usr/bin/env node
/**
 * Makes a filter file from before and after photos of the same scene. Everything runs on this machine, and only
 * the file of the filter and its report are written. See "Como adicionar um filtro" in docs/DESIGN.md.
 *
 * Usage:
 *   node scripts/replicate-filter.mjs --pair before.jpg after.jpg --id novo --name "Novo" --category "Sol"
 *     [--pair b.jpg a.jpg]...     more pairs of the same filter cover more colors
 *     [--holdout b.jpg a.jpg]...  pairs left out of the fit, to test the result
 *     [--out .tmp/replica]        where to write; the default stays out of the repo
 *     [--size 17]                 nodes per side of the table
 *     [--suggest]                 lets the automatic suggestion pick it
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { openDecoder } from './replicate/image.mjs';
import { replicate, reportMarkdown } from './replicate/replicate.mjs';

function parse(argv) {
  const options = { pairs: [], holdouts: [], out: '.tmp/replica', size: 17, suggest: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pair') options.pairs.push([argv[++i], argv[++i]]);
    else if (arg === '--holdout') options.holdouts.push([argv[++i], argv[++i]]);
    else if (arg === '--suggest') options.suggest = true;
    else if (arg === '--size') options.size = Number(argv[++i]);
    else if (['--id', '--name', '--category', '--out'].includes(arg)) options[arg.slice(2)] = argv[++i];
    else throw new Error(`Opção desconhecida: ${arg}`);
  }
  if (!options.pairs.length || !options.id || !options.name || !options.category) {
    throw new Error('Faltam opções. Use --pair antes depois --id --name --category.');
  }
  return options;
}

const options = parse(process.argv.slice(2));
const decoder = await openDecoder();
const load = async ([before, after]) => ({
  name: `${basename(before)} / ${basename(after)}`,
  before: await decoder.read(before),
  after: await decoder.read(after),
});
const pairs = [];
for (const pair of options.pairs) pairs.push(await load(pair));
const holdouts = [];
for (const pair of options.holdouts) holdouts.push(await load(pair));
await decoder.close();

const { filter, report } = replicate(pairs, holdouts, options, { size: options.size });
mkdirSync(options.out, { recursive: true });
writeFileSync(join(options.out, `${options.id}.json`), `${JSON.stringify(filter, null, 2)}\n`);
writeFileSync(join(options.out, `${options.id}.report.md`), reportMarkdown(report));
writeFileSync(join(options.out, `${options.id}.report.json`), `${JSON.stringify(report, null, 2)}\n`);

for (const p of report.pairs) console.log(`ajuste   ${p.name}: delta E médio ${p.error.mean}, p95 ${p.error.p95}, alinhamento ${p.alignment.score}`);
for (const p of report.holdouts) console.log(`separado ${p.name}: delta E médio ${p.error.mean}, p95 ${p.error.p95}, alinhamento ${p.alignment.score}`);
console.log(`Grão ${report.grain}, vinheta ${report.vignette}, cobertura ${Math.round(report.coverage * 100)}%.`);
if (report.localEffect) console.log('Efeito local detectado: uma tabela global não explica a foto toda. Leia o relatório.');
console.log(`Escrito em ${options.out}/${options.id}.json`);
