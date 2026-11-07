/**
 * Runs MediaPipe Face Landmarker in the browser. The library, the WebAssembly and the model are
 * files of this site, and this module loads only on the first request: picking a face or opening a
 * tool for eyes or teeth. The photo stays on the device. The detector says where a face is, never
 * who it is.
 */

import { FaceLandmarker } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import { nextPaint } from '../progress';
import type { SourceImage } from '../source';
import modelUrl from './face_landmarker.task?url';
import { addFace, byPosition, keepScanning, readFace, SCAN_LEVELS, tileGrid, type Face } from './scan';

/** Sizes after decompression, for a real percentage even when the server sends brotli. */
export const WASM_BYTES = 14_603_354;
export const MODEL_BYTES = 3_758_596;

/** Most faces read from one tile. */
const FACES_PER_TILE = 16;
const MIN_CONFIDENCE = 0.5;
/** Longest stretch of work before the page gets a chance to paint. */
const BUSY_LIMIT = 40;

let landmarker: FaceLandmarker | null = null;

interface EmscriptenHooks {
  instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void): object;
}

async function download(url: string, onBytes: (count: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`download-failed: ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
    onBytes(value.byteLength);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return bytes;
}

/** Who hears about the download. A new search that finds one running takes it over. */
let listener: { progress(fraction: number): void; starting(): void } | null = null;
let loading: Promise<void> | null = null;

/** Starts the detector once. A failed attempt can be tried again. */
export function loadDetector(progress: (fraction: number) => void, starting: () => void): Promise<void> {
  listener = { progress, starting };
  loading ??= start().catch((err: unknown) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** Downloads the two large files with real byte counts, then starts the detector. */
async function start(): Promise<void> {
  let received = 0;
  const count = (bytes: number) => {
    received += bytes;
    listener?.progress(received / (WASM_BYTES + MODEL_BYTES));
  };
  const [wasm, model] = await Promise.all([download(wasmUrl, count), download(modelUrl, count)]);
  listener?.starting();
  await nextPaint();
  const failed = new Promise<never>((_, reject) => {
    // The bytes are already here, so the runtime gets them through its own hook instead of a new fetch.
    (self as unknown as { Module?: EmscriptenHooks }).Module = {
      instantiateWasm(imports, done) {
        WebAssembly.instantiate(wasm, imports).then((result) => done(result.instance), reject);
        return {};
      },
    };
  });
  landmarker = await Promise.race([
    FaceLandmarker.createFromOptions(
      { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmUrl },
      {
        baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: FACES_PER_TILE,
        minFaceDetectionConfidence: MIN_CONFIDENCE,
        minFacePresenceConfidence: MIN_CONFIDENCE,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      },
    ),
    failed,
  ]);
}

/** One search over one photo. It can stop after a level and go on later. */
export class FaceScan {
  readonly faces: Face[] = [];
  /** False after a search that was stopped halfway: its result does not count yet. */
  finished = false;
  private level = 0;

  constructor(private readonly source: SourceImage) {}

  /** True while finer levels are left to try. */
  get more(): boolean {
    return this.level < SCAN_LEVELS.length;
  }

  /** The faces in reading order. */
  get list(): Face[] {
    return [...this.faces].sort(byPosition);
  }

  /** Goes through at least one more level, then on until the rule says enough. */
  async run(onProgress: (fraction: number) => void, stopped: () => boolean): Promise<void> {
    const { source } = this;
    this.finished = false;
    let busySince = performance.now();
    const first = this.level;
    while (this.more) {
      const level = SCAN_LEVELS[this.level];
      const tiles = tileGrid(source.w, source.h, level);
      let added = 0;
      for (const [i, tile] of tiles.entries()) {
        if (stopped()) return;
        const k = Math.min(1, level.limit / Math.max(tile.w, tile.h));
        const outW = Math.max(1, Math.round(tile.w * k));
        const outH = Math.max(1, Math.round(tile.h * k));
        const found = landmarker!.detect(source.draw(tile.x, tile.y, tile.w, tile.h, outW, outH));
        for (const marks of found.faceLandmarks) {
          const face = readFace((index) => [(tile.x + marks[index].x * tile.w) / source.w, (tile.y + marks[index].y * tile.h) / source.h]);
          if (addFace(this.faces, face)) added++;
        }
        const span = SCAN_LEVELS.length - first;
        onProgress((this.level - first + (i + 1) / tiles.length) / span);
        if (performance.now() - busySince > BUSY_LIMIT) {
          await nextPaint();
          busySince = performance.now();
        }
      }
      this.level++;
      if (!keepScanning(this.faces.length, added)) break;
    }
    this.finished = true;
  }
}
