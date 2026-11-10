/**
 * Runs MediaPipe Face Landmarker, and the segmenters of hair and of people when a tool asks, in the browser.
 * The library, the WebAssembly and the models are files of this site, and this module loads only on the
 * first request: picking a face or opening a tool for eyes, teeth, hair or the shape of the face. The photo
 * stays on the device. The detector says where a face, hair or a person is, never who it is.
 */

import { FaceLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import { nextPaint } from '../progress';
import type { SourceImage } from '../source';
import modelUrl from './face_landmarker.task?url';
import hairModelUrl from './hair_segmenter.tflite?url';
import personModelUrl from './selfie_multiclass.tflite?url';
import type { HairCut } from './hair';
import type { PartsCut } from './person';
import type { Area } from './mask';
import { addFace, byPosition, keepScanning, readFace, SCAN_LEVELS, tileGrid, type Face } from './scan';

/** Sizes after decompression, for a real percentage even when the server sends brotli. */
export const WASM_BYTES = 14_603_354;
export const MODEL_BYTES = 3_758_596;
export const HAIR_MODEL_BYTES = 781_618;
export const PERSON_MODEL_BYTES = 16_371_837;

/** Most faces read from one tile. */
const FACES_PER_TILE = 16;
const MIN_CONFIDENCE = 0.5;
/** Longest stretch of work before the page gets a chance to paint. */
const BUSY_LIMIT = 40;
/** Side of the square input of the hair segmenter. Larger crops are scaled down to it. */
const HAIR_INPUT = 512;
/** Side of the square input of the person segmenter. */
const PERSON_INPUT = 256;

let landmarker: FaceLandmarker | null = null;
let segmenter: ImageSegmenter | null = null;
let personSegmenter: ImageSegmenter | null = null;
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
/** What the job in `loading` brings besides the detector. */
let loadingHair = false;
let loadingPerson = false;

/**
 * Starts the detector once, and each segmenter the first time something asks for it. A failed attempt can
 * be tried again.
 */
export function loadDetector(progress: (fraction: number) => void, starting: () => void, hair = false, person = false): Promise<void> {
  // What is running needs no wait, not even for a segmenter of another tool that is still on its way.
  if (landmarker && (!hair || segmenter) && (!person || personSegmenter)) return Promise.resolve();
  listener = { progress, starting };
  if (loading && (loadingHair || !hair) && (loadingPerson || !person)) return loading;
  const job = (loading ?? Promise.resolve()).catch(() => undefined).then(() => start(hair, person));
  loading = job;
  loadingHair = hair;
  loadingPerson = person;
  job.catch(() => {
    if (loading !== job) return;
    loading = null;
    loadingHair = false;
    loadingPerson = false;
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
async function start(hair: boolean, person: boolean): Promise<void> {
  const wantHair = hair && !segmenter;
  const wantPerson = person && !personSegmenter;
  if (landmarker && !wantHair && !wantPerson) return;
  const total = (runtime ? 0 : WASM_BYTES) + (landmarker ? 0 : MODEL_BYTES) + (wantHair ? HAIR_MODEL_BYTES : 0) + (wantPerson ? PERSON_MODEL_BYTES : 0);
  let received = 0;
  const count = (bytes: number) => {
    received += bytes;
    listener?.progress(received / total);
  };
  const [wasm, model, hairModel, personModel] = await Promise.all([
    runtime ? null : download(wasmUrl, count),
    landmarker ? null : download(modelUrl, count),
    wantHair ? download(hairModelUrl, count) : null,
    wantPerson ? download(personModelUrl, count) : null,
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
  const segment = (buffer: Uint8Array<ArrayBuffer>) =>
    create(() =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: buffer, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      }),
    );
  if (hairModel) segmenter = await segment(hairModel);
  if (personModel) personSegmenter = await segment(personModel);
}

/**
 * How sure a segmenter is that each pixel of an area of the photo is of each of its classes. The area goes
 * into the square input whole, scaled to fit and centered, so a tall crop is not squeezed.
 */
function segmentClasses(model: ImageSegmenter, input: number, source: SourceImage, area: Area): { data: Float32Array[]; w: number; h: number } {
  const k = input / Math.max(area.w, area.h, 1);
  const dw = Math.max(1, Math.round(area.w * k));
  const dh = Math.max(1, Math.round(area.h * k));
  const ox = Math.floor((input - dw) / 2);
  const oy = Math.floor((input - dh) / 2);
  const canvas = new OffscreenCanvas(input, input);
  const c = canvas.getContext('2d', { alpha: false })!;
  c.fillStyle = '#808080';
  c.fillRect(0, 0, input, input);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(source.bitmap, area.x, area.y, area.w, area.h, ox, oy, dw, dh);
  const result = model.segment(canvas);
  try {
    const masks = result.confidenceMasks ?? [];
    const first = masks[0];
    if (!first) return { data: [], w: 0, h: 0 };
    const sx = first.width / input;
    const sy = first.height / input;
    const x0 = Math.floor(ox * sx);
    const y0 = Math.floor(oy * sy);
    const w = Math.max(1, Math.min(first.width - x0, Math.round(dw * sx)));
    const h = Math.max(1, Math.min(first.height - y0, Math.round(dh * sy)));
    const data = masks.map((mask) => {
      const full = mask.getAsFloat32Array();
      const cut = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        const from = (y + y0) * mask.width + x0;
        cut.set(full.subarray(from, from + w), y * w);
      }
      return cut;
    });
    return { data, w, h };
  } finally {
    result.close();
  }
}

/** The hair segmenter sees two classes, and hair is the last one. */
export function segmentHair(source: SourceImage, area: Area): HairCut {
  const { data, w, h } = segmentClasses(segmenter!, HAIR_INPUT, source, area);
  return { data: data[data.length - 1] ?? new Float32Array(0), w, h };
}

/** The classes of the person segmenter, in the order of the model: background, hair, body skin, face skin, clothes, others. */
export function segmentParts(source: SourceImage, area: Area): PartsCut {
  const { data, w, h } = segmentClasses(personSegmenter!, PERSON_INPUT, source, area);
  const none = new Float32Array(w * h);
  return { w, h, back: data[0] ?? none, hair: data[1] ?? none, body: data[2] ?? none, face: data[3] ?? none, clothes: data[4] ?? none, other: data[5] ?? none };
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
