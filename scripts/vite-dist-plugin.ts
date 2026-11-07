import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

const COMPRESSIBLE = /\.(js|mjs|css|html|svg|json|webmanifest|txt|wasm|task)$/;
/** The face detector downloads only when someone asks for it, so it stays out of the precache. */
const ON_DEMAND = /(^|\/)(detector-|vision_wasm_internal|face_landmarker)/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * Runs after the bundle is written:
 * 1. writes `sw.js` with the precache list of hashed assets;
 * 2. writes `.br` and `.gz` siblings so the static host never compresses at runtime.
 */
export function glowupDist(): Plugin {
  let outDir = 'dist';
  return {
    name: 'glowup-dist',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = walk(outDir).filter((f) => !/\.(br|gz)$/.test(f));
      const urls = files
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.woff') && !ON_DEMAND.test(f));
      const version = createHash('sha256').update(urls.join('|')).digest('hex').slice(0, 12);
      const template = readFileSync('scripts/sw-template.js', 'utf8');
      writeFileSync(
        join(outDir, 'sw.js'),
        template.replace('__VERSION__', version).replace('"__PRECACHE__"', JSON.stringify(urls)),
      );
      for (const file of walk(outDir)) {
        if (!COMPRESSIBLE.test(file)) continue;
        const raw = readFileSync(file);
        const br = brotliCompressSync(raw, {
          params: {
            [constants.BROTLI_PARAM_QUALITY]: 11,
            [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
          },
        });
        const gz = gzipSync(raw, { level: 9 });
        if (br.length < raw.length) writeFileSync(`${file}.br`, br);
        if (gz.length < raw.length) writeFileSync(`${file}.gz`, gz);
      }
    },
  };
}
