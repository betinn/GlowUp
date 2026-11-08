/**
 * Runs MediaPipe Face Landmarker, and the Hair Segmenter for the hair tools, in the browser. The library,
 * the WebAssembly and the models are files of this site, and this module loads only on the first
 * request: picking a face or opening a tool for eyes, teeth or hair. The photo stays on the device. The
 * detector says where a face or hair is, never who it is.
 */

import { FaceLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import { nextPaint } from '../progress';
import type { SourceImage } from '../source';
import modelUrl from './face_landmarker.task?url';
import hairModelUrl from './hair_segmenter.tflite?url';
import type { HairCut } from './hair';
import type { Area } from './mask';
import { addFace, byPosition, keepScanning, readFace, SCAN_LEVELS, tileGrid, type Face } from './scan';

/** Sizes after decompression, for a real percentage even when the server sends brotli. */
export const WASM_BYTES = 14_603_354;
export const MODEL_BYTES = 3_758_596;
export const HAIR_MODEL_BYTES = 781_618;

/** Most faces read from one tile. */
const FACES_PER_TILE = 16;
const MIN_CONFIDENCE = 0.5;
/** Longest stretch of work before the page gets a chance to paint. */
const BUSY_LIMIT = 40;
/** Side of the square input of the hair segmenter. Larger crops are scaled down to it. */
const HAIR_INPUT = 512;

let landmarker: FaceLandmarker | null = null;
let segmenter: ImageSegmenter | null = null;
/** Compiled once and shared by both tasks, so the hair segmenter needs no second download. */
let runtime: WebAssembly.Module | null = null;

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
/** The job in `loading` also brings the hair segmenter. */
let loadingHair = false;

/**
 * Starts the detector once, and the hair segmenter the first time `hair` asks for it. A failed attempt
 * can be tried again.
 */
export function loadDetector(progress: (fraction: number) => void, starting: () => void, hair = false): Promise<void> {
  listener = { progress, starting };
  if (loading && (loadingHair || !hair)) return loading;
  const job = (loading ?? Promise.resolve()).catch(() => undefined).then(() => start(hair));
  loading = job;
  loadingHair = hair;
  job.catch(() => {
    if (loading !== job) return;
    loading = null;
    loadingHair = false;
  });
  return job;
}

/** Starts one task. The runtime gets the WebAssembly already compiled, through its own hook. */
function create<T>(make: () => Promise<T>): Promise<T> {
  const failed = new Promise<never>((_, reject) => {
    (self as unknown as { Module?: EmscriptenHooks }).Module = {
      instantiateWasm(imports, done) {
        WebAssembly.instantiate(runtime!, imports).then(done, reject);
        return {};
      },
    };
  });
  return Promise.race([make(), failed]);
}

/** Downloads what is missing with real byte counts, then starts what is not running yet. */
async function start(hair: boolean): Promise<void> {
  const wantHair = hair && !segmenter;
  if (landmarker && !wantHair) return;
  const total = (runtime ? 0 : WASM_BYTES) + (landmarker ? 0 : MODEL_BYTES) + (wantHair ? HAIR_MODEL_BYTES : 0);
  let received = 0;
  const count = (bytes: number) => {
    received += bytes;
    listener?.progress(received / total);
  };
  const [wasm, model, hairModel] = await Promise.all([
    runtime ? null : download(wasmUrl, count),
    landmarker ? null : download(modelUrl, count),
    wantHair ? download(hairModelUrl, count) : null,
  ]);
  listener?.starting();
  await nextPaint();
  if (wasm) runtime = await WebAssembly.compile(wasm);
  const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmUrl };
  if (model) {
    landmarker = await create(() =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: FACES_PER_TILE,
        minFaceDetectionConfidence: MIN_CONFIDENCE,
        minFacePresenceConfidence: MIN_CONFIDENCE,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      }),
    );
  }
  if (hairModel) {
    segmenter = await create(() =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: hairModel, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      }),
    );
  }
}

/**
 * How sure the segmenter is that each pixel of an area of the photo is hair. The area goes into the
 * square input whole, scaled to fit and centered, so a tall crop is not squeezed.
 */
export function segmentHair(source: SourceImage, area: Area): HairCut {
  const k = HAIR_INPUT / Math.max(area.w, area.h, 1);
  const dw = Math.max(1, Math.round(area.w * k));
  const dh = Math.max(1, Math.round(area.h * k));
  const ox = Math.floor((HAIR_INPUT - dw) / 2);
  const oy = Math.floor((HAIR_INPUT - dh) / 2);
  const canvas = new OffscreenCanvas(HAIR_INPUT, HAIR_INPUT);
  const c = canvas.getContext('2d', { alpha: false })!;
  c.fillStyle = '#808080';
  c.fillRect(0, 0, HAIR_INPUT, HAIR_INPUT);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(source.bitmap, area.x, area.y, area.w, area.h, ox, oy, dw, dh);
  const result = segmenter!.segment(canvas);
  try {
    const masks = result.confidenceMasks ?? [];
    // The model sees two classes, and hair is the last one.
    const mask = masks[masks.length - 1];
    if (!mask) return { data: new Float32Array(0), w: 0, h: 0 };
    const full = mask.getAsFloat32Array();
    const sx = mask.width / HAIR_INPUT;
    const sy = mask.height / HAIR_INPUT;
    const x0 = Math.floor(ox * sx);
    const y0 = Math.floor(oy * sy);
    const w = Math.max(1, Math.min(mask.width - x0, Math.round(dw * sx)));
    const h = Math.max(1, Math.min(mask.height - y0, Math.round(dh * sy)));
    const data = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const from = (y + y0) * mask.width + x0;
      data.set(full.subarray(from, from + w), y * w);
    }
    return { data, w, h };
  } finally {
    result.close();
  }
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
