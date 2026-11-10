/**
 * Finding faces, for the filter and for the tools that stay on a part of the face or on the hair. The detector code
 * loads here, on the first request. Faces and hair stay in memory for the open photo and never reach
 * the saved project.
 */

import type { Engine } from '../core/engine';
import type { FaceScan } from '../core/face/detector';
import { focusPoints } from '../core/face/focus';
import { faceShare } from '../core/face/makeup';
import { addHair, faceSize, hairCrop } from '../core/face/hair';
import { buildFaceMask, type MaskTarget, type Point } from '../core/face/mask';
import { buildRegionMask, type FaceRegion } from '../core/face/regions';
import { sliderById } from '../core/face/reshape';
import { CHIN, type Face } from '../core/face/scan';
import { faceSpan, skinArea, spotGuard } from '../core/face/skin';
import type { HealOp } from '../core/doc';
import { nextPaint, type Stage } from '../core/progress';
import { buildMouthMask } from '../core/face/makeup';
import { onPhone } from './device';
import { forgetFill, startFill } from './fill.svelte';
import { finishMattes, personConfidence } from '../core/face/person';
import { autoAction, type AutoAction, type AutoFound, type AutoWords } from '../tools/auto';
import { toolById } from '../tools/catalog';
import { reducedMotion } from './motion';
import type { SourceImage } from '../core/source';
import { showRegion, stopRegionShow } from './regionshow.svelte';
import { bump, engine, hasEngine, toast, ui } from './state.svelte';
import { Task } from './task.svelte';

/** Starting softness of the edge. Tuned on real photos with a black and white filter. */
const FACE_FEATHER = 25;

/** Size given to a hand-painted area, for the softness slider. */
const PAINTED_REACH = 0.25;

/** The effect of the automatic mode arrives over this long, so the person sees it come. */
const FILL_FADE_MS = 520;

/** Faces are searched for spots at this size, in pixels. Smaller ones are searched as they are. */
const SPOT_FACE = 640;
/** Below this face size, in pixels of the photo, a spot is a pixel or two: Manchas leaves the face alone. */
const SPOT_MIN_FACE = 140;
/** At most this many spots over the whole photo. */
const SPOT_LIMIT = 120;

/** Without a face, the hair segmenter looks at the whole photo as if the face took this share of it. */
const WHOLE_PHOTO_FACE = 0.3;

const SCAN: Stage = { id: 'scan', label: 'Procurando rostos', weight: 32 };
const HAIR: Stage = { id: 'hair', label: 'Achando os fios', weight: 30 };
const PERSON_LOAD: Stage = { id: 'personload', label: 'Baixando o separador de pessoa e fundo', weight: 40 };
const PERSON: Stage = { id: 'person', label: 'Separando a pessoa do fundo', weight: 24 };

/** The steps of a search. The downloads happen once, and each segmenter only for the tools that need it. */
function stagesFor(hair: boolean, person = false): Stage[] {
  const list: Stage[] = [];
  if (!detectorStarted) {
    list.push({ id: 'download', label: 'Baixando o detector', weight: 62 }, { id: 'start', label: 'Ligando o detector', weight: 6, estimate: 400 });
  } else if (hair && !hairStarted) {
    list.push(
      { id: 'download', label: 'Baixando o detector de cabelo', weight: 20 },
      { id: 'start', label: 'Ligando o detector de cabelo', weight: 6, estimate: 300 },
    );
  }
  list.push(SCAN);
  if (hair) list.push(HAIR);
  if (person && !personStarted) list.push(PERSON_LOAD);
  if (person) list.push(PERSON);
  return list;
}

/**
 * What the first search still has to download, in the words of the progress card. Empty when nothing is left to
 * download. The size is a warning for a phone, which may be on mobile data, and for nobody else.
 */
function downloadNote(hair: boolean, person = false): string {
  // Sizes on the wire, with brotli: detector 6 MB, hair 0.7 MB, person and background 15 MB.
  let size = '';
  if (person && !personStarted) size = !detectorStarted ? 'cerca de 22 MB' : hairStarted ? 'cerca de 15 MB' : 'cerca de 16 MB';
  else if (!detectorStarted) size = hair ? 'cerca de 7 MB' : 'cerca de 6 MB';
  else if (hair && !hairStarted) size = 'cerca de 1 MB';
  if (!size) return '';
  if (!onPhone()) return 'Só na primeira vez. A foto não sai do seu aparelho.';
  return `Só na primeira vez, ${size}: melhor no Wi-Fi. A foto não sai do seu aparelho.`;
}

export const facePick = $state({
  /** The job on screen, while there is one. */
  task: null as Task | null,
  /** How much the job downloads, for the progress card. Empty when nothing. */
  download: '',
  faces: [] as Face[],
  /** A finer search is still possible. */
  more: false,
});

const SKIN_WORDS = { name: 'Só na pele', finding: 'Procurando a pele', missing: 'Não achei pele de rosto nesta foto.' };
const BROW_WORDS = { name: 'Só nas sobrancelhas', finding: 'Procurando as sobrancelhas', missing: 'Não achei sobrancelhas nesta foto.' };
const LID_WORDS = { name: 'Só nas pálpebras', finding: 'Procurando os olhos', missing: 'Não achei olhos nesta foto.' };

/** Words of each limit: the switch, the wait, and the note when the photo does not show that region. */
export const LIMIT_WORDS: Record<FaceRegion, { name: string; finding: string; missing: string }> = {
  iris: { name: 'Só na íris', finding: 'Procurando os olhos', missing: 'Não achei olhos abertos nesta foto.' },
  sclera: { name: 'Só no branco do olho', finding: 'Procurando os olhos', missing: 'Não achei olhos abertos nesta foto.' },
  teeth: { name: 'Só nos dentes', finding: 'Procurando os dentes', missing: 'Não achei dentes à mostra nesta foto.' },
  hair: { name: 'Só no cabelo', finding: 'Procurando o cabelo', missing: 'Não achei cabelo nesta foto.' },
  skin: SKIN_WORDS,
  undereye: { name: 'Só nas olheiras', finding: 'Procurando os olhos', missing: 'Não achei olhos nesta foto.' },
  glow: SKIN_WORDS,
  lips: { name: 'Só nos lábios', finding: 'Procurando os lábios', missing: 'Não achei lábios nesta foto.' },
  brows: BROW_WORDS,
  browhair: BROW_WORDS,
  lids: LID_WORDS,
  shadow: LID_WORDS,
  cheeks: SKIN_WORDS,
  sculpt: SKIN_WORDS,
  sprinkle: SKIN_WORDS,
};

/** Where each region is, in the words of the panel. */
export const PLACES: Record<FaceRegion, string> = {
  iris: 'nas íris',
  sclera: 'no branco dos olhos',
  teeth: 'nos dentes',
  hair: 'no cabelo',
  skin: 'na pele',
  undereye: 'nas olheiras',
  glow: 'nos pontos de luz do rosto',
  lips: 'nos lábios',
  brows: 'nas sobrancelhas',
  browhair: 'nas sobrancelhas',
  lids: 'nas pálpebras',
  shadow: 'nas pálpebras',
  cheeks: 'nas maçãs do rosto',
  sculpt: 'nas áreas de contorno do rosto',
  sprinkle: 'no nariz e nas bochechas',
};

/** The words of the search of a tool: those of its region, or those its own action brings. */
export function limitWords(tool: string | null, region: FaceRegion | null): (typeof LIMIT_WORDS)[FaceRegion] | AutoWords | null {
  if (region) return LIMIT_WORDS[region];
  return (tool && autoAction(tool)?.words) || null;
}

/** Where the automatic mode of a tool goes, in the words of the panel. */
export function placeOf(tool: string | null): string {
  const action = tool ? autoAction(tool) : undefined;
  if (action) return action.words.place;
  const meta = tool ? toolById(tool) : undefined;
  if (meta?.kind === 'heal') return 'nas manchas';
  const region = meta?.fill ?? meta?.region;
  return region ? PLACES[region] : '';
}

/** The hint of the panel in the automatic mode, which has no brush to talk about. */
export function autoHint(): string | null {
  const { tool, mode, state } = toolLimit;
  if (!tool || mode !== 'auto' || !['searching', 'on', 'off'].includes(state)) return null;
  const action = autoAction(tool);
  if (action) return action.words.hint;
  if (toolById(tool)?.kind === 'heal') {
    const rings = ui.healRings ? ' Toque num círculo para desfazer só aquela.' : '';
    return `No Automático as manchas somem sozinhas, uma a uma.${rings} Para uma que ficou, use Manual.`;
  }
  return 'No Automático o efeito vai ' + placeOf(tool) + ' sozinho. Ajuste nos controles.';
}

/** Where the brush of the open tool stands. It waits while `searching`, stays on the region when `on`, and the rest leave it free. */
export type LimitState = 'searching' | 'on' | 'off' | 'no-face' | 'no-region' | 'failed';

/**
 * Automatic fills the mask from the region in one undo step and keeps the brush away. Manual is the
 * brush and the eraser, starting from whatever the mask holds.
 */
export type ToolMode = 'auto' | 'manual';

export const toolLimit = $state({
  /** The tool under this control. Any panel can show the selector while there is one. */
  tool: null as string | null,
  /** Null for a tool with an action of its own and no limit. */
  region: null as FaceRegion | null,
  state: 'off' as LimitState,
  /** A whole stroke fell outside, so a face may have been left out. */
  missed: false,
  mode: 'auto' as ToolMode,
});

const scans = new WeakMap<SourceImage, FaceScan>();
/** Tools the person set free on this photo. Going back to one keeps it free. */
const freed = new Set<string>();
/** Tools that already showed where the brush reaches on this photo. */
const shown = new Set<string>();
/** The mode each tool had on this photo, so going back to a tool keeps it. */
const modes = new Map<string, ToolMode>();
/** What the automatic mode of a tool does: fill its mask, heal spots, or run the action the tool declares. */
export type Fill =
  | { kind: 'mask'; mask: Uint8Array }
  | { kind: 'spots'; spots: HealOp['dabs'] }
  | { kind: 'custom'; action: AutoAction; found: AutoFound };
let regionFill: Fill | null = null;
let detectorStarted = false;
let hairStarted = false;
let personStarted = false;

/** The hair found on a photo, for one mask size and one list of faces. The five hair tools share it. */
interface HairFound {
  data: Uint8Array | null;
  spots: Point[][];
  faces: number;
  w: number;
}
const hairs = new WeakMap<SourceImage, HairFound>();
/** Changes to stop the search in progress. */
let current = 0;

function cancelSearch(): void {
  current++;
  facePick.task?.stop();
  facePick.task = null;
  ui.faceChoosing = false;
}

/** For the filter panel. A search that a brush tool started is not the panel's to stop. */
export function stopFaceSearch(): void {
  if (!toolLimit.tool) cancelSearch();
}

/** No face to choose: the person paints the area, starting from an empty mask. */
export async function paintArea(e: Engine): Promise<void> {
  ui.faceChoosing = false;
  await e.replaceFilterMask('Filtro', null, { masked: true, feather: 0, reach: PAINTED_REACH });
  bump();
}

export function openJob(hair = false, person = false): Task {
  const task = new Task(stagesFor(hair, person));
  facePick.task = task;
  facePick.download = downloadNote(hair, person);
  return task;
}

/**
 * Loads the detector if needed and goes through the photo. `hair` also loads the hair segmenter.
 * Returns null when the search was stopped.
 */
export async function scanPhoto(source: SourceImage, task: Task, deeper: boolean, stopped: () => boolean, hair = false): Promise<FaceScan | null> {
  // A load another tool began can still finish during this search, in a job with no steps for it.
  const loads = !detectorStarted || (hair && !hairStarted);
  if (loads) task.stage('download');
  const { FaceScan, loadDetector } = await import('../core/face/detector');
  await loadDetector(
    (fraction) => {
      if (loads) task.timed(fraction);
    },
    () => {
      if (loads) task.stage('start');
    },
    hair,
  );
  detectorStarted = true;
  if (hair) hairStarted = true;
  if (stopped()) return null;
  task.stage('scan');
  let scan = scans.get(source);
  if (!scan?.finished || deeper) {
    scan ??= new FaceScan(source);
    scans.set(source, scan);
    await scan.run((fraction) => task.timed(fraction), stopped);
  }
  if (stopped()) return null;
  facePick.faces = scan.list;
  facePick.more = scan.more;
  return scan;
}

/** Whether warps can keep the background of this photo. */
export type LockState = 'idle' | 'finding' | 'on' | 'none' | 'failed';

export const lockState = $state({ state: 'idle' as LockState });

/** What the search found on each photo, so it runs once. */
const locks = new WeakMap<SourceImage, 'on' | 'none'>();

/**
 * Separates the person from the background, once per photo, for every warp from here on. A photo with no
 * person, or a segmenter that does not load, leaves the warps as they always were, and the panel says so.
 * False when the search was stopped.
 */
export async function findLock(e: Engine, faces: readonly Face[], task: Task | null, stopped: () => boolean): Promise<boolean> {
  const { source, masks } = e;
  if (!source || !masks) return false;
  const known = locks.get(source);
  // The layers of a project saved before the body went along with the face are worked out again.
  if (known || (e.locking && e.following)) {
    lockState.state = known ?? 'on';
    if (e.locking) startFill(e, 'tool');
    return true;
  }
  lockState.state = 'finding';
  // A task made before the model came knows the step of its download.
  const loads = !personStarted;
  if (loads) task?.stage('personload');
  try {
    const { loadDetector, segmentHair, segmentParts } = await import('../core/face/detector');
    await loadDetector(
      (fraction) => {
        if (loads) task?.timed(fraction);
      },
      () => undefined,
      true,
      true,
    );
    hairStarted = true;
    personStarted = true;
    if (stopped()) return false;
    task?.stage('person');
    const seen = await personConfidence(
      { w: source.w, h: source.h },
      { w: masks.w, h: masks.h },
      faces,
      { parts: (area) => segmentParts(source, area), hair: (area) => segmentHair(source, area) },
      nextPaint,
      (fraction) => task?.timed(fraction),
      stopped,
    );
    if (!seen) return false;
    await nextPaint();
    const target = maskTarget(masks, source);
    const mattes = finishMattes(seen, faces, target);
    if (stopped()) return false;
    e.setLayers(mattes ? { ...mattes, mouth: buildMouthMask(faces, target) } : null);
    locks.set(source, mattes ? 'on' : 'none');
    lockState.state = mattes ? 'on' : 'none';
    if (mattes) startFill(e, 'tool');
    return true;
  } catch (err) {
    console.error(err);
    if (stopped()) return false;
    lockState.state = 'failed';
    return true;
  }
}

/** Runs the search for the lock on its own, for a brush that went free before it ended. */
export async function ensureLock(e: Engine): Promise<void> {
  const { source } = e;
  if (!source || ['finding', 'on', 'none'].includes(lockState.state)) return;
  const stopped = () => e.source !== source;
  lockState.state = 'finding';
  const task = new Task(stagesFor(false, true));
  try {
    const scan = await scanPhoto(source, task, false, stopped);
    if (scan) await findLock(e, scan.list, task, stopped);
  } catch (err) {
    console.error(err);
    if (!stopped()) lockState.state = 'failed';
  } finally {
    task.stop();
    bump();
  }
}

/** Forgets the state of the lock, for the next photo. */
export function resetLockState(e: Engine): void {
  lockState.state = e.locking ? 'on' : 'idle';
  forgetFill();
}

/** The photo as the mask grid sees it. */
function maskTarget(masks: NonNullable<Engine['masks']>, source: SourceImage): MaskTarget {
  const kx = source.w / masks.w;
  const ky = source.h / masks.h;
  return {
    w: masks.w,
    h: masks.h,
    luma: (a) => source.luma(a.x * kx, a.y * ky, a.w * kx, a.h * ky, a.w, a.h),
    color: (a) => source.draw(a.x * kx, a.y * ky, a.w * kx, a.h * ky, a.w, a.h).getContext('2d')!.getImageData(0, 0, a.w, a.h).data,
  };
}

/**
 * Looks for the spots Manchas heals on every face, inside the skin found for it. Each face is read from
 * the photo at a size where a spot still has some pixels. The spots come out in image UV, with the radius
 * as a share of the long side, as the healing brush keeps them. Null when the search was stopped.
 */
async function findSpots(
  source: SourceImage,
  masks: NonNullable<Engine['masks']>,
  faces: readonly Face[],
  skin: Uint8Array,
  stopped: () => boolean,
): Promise<HealOp['dabs'] | null> {
  const { findSkinSpots } = await import('../core/face/blemish');
  const target = { w: masks.w, h: masks.h };
  const kx = source.w / masks.w;
  const ky = source.h / masks.h;
  const long = Math.max(source.w, source.h);
  const found: (HealOp['dabs'][number] & { strength: number })[] = [];
  for (const face of faces) {
    await nextPaint();
    if (stopped()) return null;
    const area = skinArea(face, target);
    const size = faceSpan(face, target) * kx;
    if (area.w < 2 || area.h < 2 || size < SPOT_MIN_FACE) continue;
    const s = Math.min(1, SPOT_FACE / size);
    const sw = area.w * kx;
    const sh = area.h * ky;
    const ow = Math.max(2, Math.round(sw * s));
    const oh = Math.max(2, Math.round(sh * s));
    const rgba = source.draw(area.x * kx, area.y * ky, sw, sh, ow, oh).getContext('2d')!.getImageData(0, 0, ow, oh).data;
    const guard = spotGuard(face, target, area);
    const weights = new Float32Array(ow * oh);
    const leave = new Float32Array(ow * oh);
    for (let y = 0; y < oh; y++) {
      const ay = Math.min(area.h - 1, Math.floor(((y + 0.5) / oh) * area.h));
      for (let x = 0; x < ow; x++) {
        const ax = Math.min(area.w - 1, Math.floor(((x + 0.5) / ow) * area.w));
        weights[y * ow + x] = skin[(ay + area.y) * masks.w + ax + area.x] / 255;
        leave[y * ow + x] = guard[ay * area.w + ax];
      }
    }
    for (const spot of findSkinSpots(rgba, weights, ow, oh, size * s, leave)) {
      found.push({
        u: (area.x * kx + spot.x / s) / source.w,
        v: (area.y * ky + spot.y / s) / source.h,
        r: spot.r / s / long,
        strength: spot.strength,
      });
    }
  }
  found.sort((a, b) => b.strength - a.strength);
  // From the top of the photo down, so the spots go in an order the eye can follow.
  return found
    .slice(0, SPOT_LIMIT)
    .sort((a, b) => a.v - b.v || a.u - b.u)
    .map(({ u, v, r }) => ({ u, v, r }));
}

/**
 * Asks the hair segmenter about the square around each face, or about the whole photo when there is no
 * face, and joins the answers. Returns null when the search was stopped.
 */
async function findHair(
  source: SourceImage,
  masks: NonNullable<Engine['masks']>,
  faces: readonly Face[],
  task: Task,
  stopped: () => boolean,
): Promise<HairFound | null> {
  const known = hairs.get(source);
  if (known && known.faces === faces.length && known.w === masks.w) return known;
  task.stage('hair');
  const { segmentHair } = await import('../core/face/detector');
  const target = maskTarget(masks, source);
  const kx = target.w / source.w;
  const ky = target.h / source.h;
  const crops = faces.length
    ? faces.map((f) => ({ area: hairCrop(f.box, source.w, source.h), size: faceSize(f.box, target.w, target.h) }))
    : [{ area: { x: 0, y: 0, w: source.w, h: source.h }, size: Math.max(target.w, target.h) * WHOLE_PHOTO_FACE }];
  const out = new Uint8Array(target.w * target.h);
  const spots: Point[][] = [];
  for (const [i, crop] of crops.entries()) {
    await nextPaint();
    if (stopped()) return null;
    const cut = segmentHair(source, crop.area);
    const { x, y, w, h } = crop.area;
    const box = addHair(out, target, { x: x * kx, y: y * ky, w: w * kx, h: h * ky }, cut, crop.size);
    if (box) spots.push(box);
    task.report((i + 1) / crops.length);
  }
  const found: HairFound = { data: spots.length ? out : null, spots, faces: faces.length, w: masks.w };
  hairs.set(source, found);
  return found;
}

/** What a tool can hold on to on this photo. */
interface Found {
  /** The region the brush stays on, when the tool has one and the photo shows it. */
  data: Uint8Array | null;
  /** The points of each face to frame. */
  spots: Point[][];
  /** What the automatic mode does. */
  fill: Fill | null;
  /** The tool has something to work on. Without it the brush is the way. */
  reached: boolean;
}

/**
 * Works out what the automatic mode of a tool does on this photo, from a finished search. `scan` is null
 * only for an action that asked for no search. Null when the search was stopped.
 */
async function findFill(
  tool: string,
  region: FaceRegion | null,
  source: SourceImage,
  masks: NonNullable<Engine['masks']>,
  scan: FaceScan | null,
  target: MaskTarget,
  task: Task | null,
  stopped: () => boolean,
): Promise<Found | null> {
  const faces = scan?.list ?? [];
  let data: Uint8Array | null = null;
  let spots: Point[][] = [];
  if (region === 'hair') {
    const found = await findHair(source, masks, faces, task!, stopped);
    if (!found) return null;
    ({ data, spots } = found);
  } else if (region) {
    data = buildRegionMask(faces, region, target);
    spots = focusPoints(faces, region);
  }
  const action = autoAction(tool);
  if (action) {
    const reached = region ? !!data : action.faces !== 'required' || faces.length > 0;
    return { data, spots, reached, fill: reached ? { kind: 'custom', action, found: { faces, source } } : null };
  }
  // The automatic mode fills with the region, with its own shape, or for Manchas heals spots in it.
  let fill: Fill | null = data ? { kind: 'mask', mask: data } : null;
  const meta = toolById(tool);
  if (data && meta?.kind === 'heal') {
    const list = await findSpots(source, masks, faces, data, stopped);
    if (!list) return null;
    fill = { kind: 'spots', spots: list };
  } else if (data && meta?.fill && meta.fill !== region && meta.fill !== 'hair') {
    const shape = buildRegionMask(faces, meta.fill, target);
    fill = shape ? { kind: 'mask', mask: shape } : null;
  }
  return { data, spots, fill, reached: !!data };
}

/** Finds faces and shows the rings. With `deeper`, tries the next level of a finished search. */
export async function searchFaces(e: Engine, deeper = false): Promise<void> {
  const source = e.source;
  if (!source || facePick.task) return;
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  const task = openJob();
  ui.faceChoosing = false;
  try {
    const scan = await scanPhoto(source, task, deeper, stopped);
    if (!scan) return;
    if (scan.list.length) {
      ui.faceChoosing = true;
    } else {
      toast('Não achei rosto nesta foto. Pinte a área com o pincel.');
      await paintArea(e);
    }
  } catch (err) {
    console.error(err);
    if (stopped()) return;
    toast('O detector não carregou. Pinte a área com o pincel.');
    // An area chosen before stays as it was.
    if (!e.doc.filter.masked) await paintArea(e);
  } finally {
    task.stop();
    if (mine === current) facePick.task = null;
    bump();
  }
}

export async function chooseFace(e: Engine, face: Face): Promise<void> {
  const { masks, source, doc } = e;
  // The rings leave at once, so a double tap cannot choose twice.
  if (!masks || !source || !ui.faceChoosing) return;
  ui.faceChoosing = false;
  const data = buildFaceMask(face.outline, CHIN, maskTarget(masks, source));
  const reach = Math.max(face.box.w * doc.width, face.box.h * doc.height) / Math.max(doc.width, doc.height);
  await e.replaceFilterMask('Rosto', data, { masked: true, feather: FACE_FEATHER, reach });
  bump();
}

/** The mask a tool paints on. */
const layerOf = (tool: string) => toolById(tool)?.layer ?? null;

/** The tool already changed this photo: a mask with paint, healed spots for Manchas, or what its action says. */
export function hasWork(e: Engine, tool: string): boolean {
  const section = toolById(tool)?.section;
  if (section) {
    if (e.doc.shapesOff?.includes(section)) return false;
    return (e.doc.shapes ?? []).some((shape) => Object.entries(shape.values).some(([id, v]) => v !== 0 && sliderById(id)?.section === section));
  }
  const action = autoAction(tool);
  if (action) return action.hasWork(e);
  if (toolById(tool)?.kind === 'heal') return e.doc.heals.length > 0;
  const layer = layerOf(tool);
  return !!layer && !!e.doc.layers[layer]?.painted;
}

/** Takes the effect of a tool off the photo, as one undo step. */
export async function clearWork(e: Engine, tool: string): Promise<void> {
  const action = autoAction(tool);
  const meta = toolById(tool);
  if (action) await action.clear(e);
  else if (meta?.kind === 'heal') await e.healSpots([], 'Limpar');
  else if (meta?.layer) await e.clearLayer(meta.layer);
}

/** The person took this tool to the brush on this photo, so what its mask holds is theirs. */
export const handPainted = (tool: string) => freed.has(tool) || modes.get(tool) === 'manual';

/** Automatic, unless the person chose otherwise or the tool already holds work, as in a reopened project. */
function modeFor(e: Engine, tool: string): ToolMode {
  if (freed.has(tool)) return 'manual';
  const remembered = modes.get(tool);
  if (remembered) return remembered;
  return hasWork(e, tool) ? 'manual' : 'auto';
}

/**
 * Tells a tool how large the faces of this photo are, for what has a size on the skin. Only a number, and
 * it follows the photo, so it is no step of its own in the undo.
 */
function tellFaceSize(e: Engine, tool: string, source: SourceImage): void {
  const meta = toolById(tool);
  const layer = meta?.faceSized && meta.layer ? e.doc.layers[meta.layer] : undefined;
  const share = faceShare(facePick.faces, source.w, source.h);
  if (!layer || !share || layer.params.face === share) return;
  layer.params.face = share;
  e.ctx?.invalidate('prefix');
  e.requestRender();
}

/** Does what the automatic mode found for a tool, as one undo step. */
async function applyFill(e: Engine, tool: string, fill: Fill, label: string, fadeMs: number): Promise<void> {
  switch (fill.kind) {
    case 'spots': {
      const healed = await e.healSpots(fill.spots, label, async () => bump());
      if (healed === 0 && toolLimit.tool === tool) toast('Não achei manchas nesta pele. No Manual, toque na que quiser tirar.');
      return;
    }
    case 'mask': {
      const layer = layerOf(tool);
      if (!layer) return;
      if (e.source) tellFaceSize(e, tool, e.source);
      await e.fillLayer(layer, fill.mask, label, fadeMs);
      return;
    }
    case 'custom':
      try {
        await fill.action.apply(e, fill.found);
      } catch (err) {
        console.error(err);
        toast('Não consegui aplicar agora. Tenta de novo ou use o Manual.');
      }
  }
}

/** Fills the open tool from what was found, as one undo step. */
async function fillRegion(e: Engine, tool: string): Promise<void> {
  const fill = regionFill;
  if (!fill || toolLimit.tool !== tool || toolLimit.mode !== 'auto' || toolLimit.state !== 'on') return;
  await applyFill(e, tool, fill, 'Automático', reducedMotion() ? 0 : FILL_FADE_MS);
  bump();
}

/**
 * Keeps the brush of a tool on the part of the face it is made for. Strokes wait for the search, and
 * when it ends with nothing to hold on to, the brush is free: no photo gets stuck on the detector.
 * In the automatic mode the region also becomes the mask, once the view has shown it. `refill`
 * replaces work already in the mask, for when the person asks for the automatic mode.
 */
export async function limitTool(e: Engine, tool: string, region: FaceRegion | null, deeper = false, refill = false): Promise<void> {
  const { source, masks } = e;
  if (!source || !masks) return;
  cancelSearch();
  toolLimit.tool = tool;
  toolLimit.region = region;
  toolLimit.missed = false;
  toolLimit.mode = modeFor(e, tool);
  regionFill = null;
  e.brushOff = false;
  if (freed.has(tool)) {
    toolLimit.state = 'off';
    return;
  }
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  const hair = region === 'hair';
  // Only an action can do without the detector: a region is always looked for.
  const searching = !!region || !!autoAction(tool)?.faces;
  const wantsLock = !!autoAction(tool)?.person;
  const task = searching ? openJob(hair, wantsLock) : null;
  const moves = e.viewMoves;
  if (searching) {
    toolLimit.state = 'searching';
    e.holdStroke = `${limitWords(tool, region)?.finding}. O pincel já vem.`;
  }
  try {
    const scan = task ? await scanPhoto(source, task, deeper, stopped, hair) : null;
    if (task && !scan) return;
    if (scan && wantsLock && !(await findLock(e, scan.list, task, stopped))) return;
    // One target for the limit and the fill, so they share the skin they find.
    const found = await findFill(tool, region, source, masks, scan, maskTarget(masks, source), task, stopped);
    if (!found) return;
    tellFaceSize(e, tool, source);
    e.setPaintLimit(found.data);
    // The hair segmenter also looks at a photo without faces, so for hair the photo has none.
    toolLimit.state = found.reached ? 'on' : scan?.list.length || hair ? 'no-region' : 'no-face';
    if (found.reached) {
      regionFill = found.fill;
      const auto = toolLimit.mode === 'auto' && !!found.fill;
      if (!found.fill) toolLimit.mode = 'manual';
      const filling = auto && (refill || !hasWork(e, tool));
      e.brushOff = auto;
      // Without a limit there is nothing for the light to show.
      void showRegion(e, found.spots, e.viewMoves === moves, !!found.data && !shown.has(tool), filling ? () => fillRegion(e, tool) : undefined);
      shown.add(tool);
    } else {
      // Nothing to fill from: the brush is the way.
      toolLimit.mode = 'manual';
    }
  } catch (err) {
    console.error(err);
    if (!stopped()) {
      toolLimit.state = 'failed';
      toolLimit.mode = 'manual';
    }
  } finally {
    task?.stop();
    if (mine === current) {
      facePick.task = null;
      e.holdStroke = null;
    }
    bump();
  }
}

/** What the automatic mode of some tools found on this photo, ready to apply. */
export interface PreparedFills {
  fills: Map<string, Fill>;
  /** Tools the photo gave nothing to work on, as teeth in a closed mouth. */
  missed: string[];
  /** The detector did not load or failed. */
  failed: boolean;
  /** Another search or another photo took over. Nothing was found, and nothing should be applied. */
  stopped: boolean;
}

/**
 * Finds what the automatic mode of each tool would do, without opening any of them and without changing
 * the photo, so that the caller decides how it lands in the history. A tool holding work is left out,
 * unless `refill`. The open tool must be closed first: this search takes the place of its search.
 */
export async function prepareToolFills(e: Engine, tools: readonly string[], { refill = false } = {}): Promise<PreparedFills> {
  const out: PreparedFills = { fills: new Map(), missed: [], failed: false, stopped: false };
  const { source, masks } = e;
  if (!source || !masks) return { ...out, stopped: true };
  const wanted = tools.filter((tool) => refill || !hasWork(e, tool));
  if (!wanted.length) return out;
  cancelSearch();
  const mine = ++current;
  const stopped = () => mine !== current || e.source !== source;
  const hair = wanted.some((tool) => toolById(tool)?.region === 'hair');
  const task = openJob(hair);
  try {
    const scan = await scanPhoto(source, task, false, stopped, hair);
    if (!scan) return { ...out, stopped: true };
    // One target for all of them, so they share the skin they find.
    const target = maskTarget(masks, source);
    for (const tool of wanted) {
      await nextPaint();
      if (stopped()) return { ...out, stopped: true };
      const found = await findFill(tool, toolById(tool)?.region ?? null, source, masks, scan, target, task, stopped);
      if (!found) return { ...out, stopped: true };
      if (found.fill) out.fills.set(tool, found.fill);
      else out.missed.push(tool);
    }
  } catch (err) {
    console.error(err);
    if (stopped()) return { ...out, stopped: true };
    return { fills: new Map(), missed: [...wanted], failed: true, stopped: false };
  } finally {
    task.stop();
    if (mine === current) facePick.task = null;
    bump();
  }
  return out;
}

/**
 * Applies what `prepareToolFills` found, each tool as one undo step. To have them all as one step, call
 * it inside `history.group`. The masks arrive together, and the tools stay in Automático when opened.
 */
export async function applyToolFills(
  e: Engine,
  fills: ReadonlyMap<string, Fill>,
  { label = 'Automático', fadeMs = reducedMotion() ? 0 : FILL_FADE_MS }: { label?: string; fadeMs?: number } = {},
): Promise<void> {
  const all = [...fills];
  await Promise.all(all.filter(([, fill]) => fill.kind === 'mask').map(([tool, fill]) => applyFill(e, tool, fill, label, fadeMs)));
  for (const [tool, fill] of all) {
    if (fill.kind !== 'mask') await applyFill(e, tool, fill, label, fadeMs);
    modes.set(tool, 'auto');
  }
  bump();
}

/** The switch of the panel. Off means free painting on this tool, for as long as this photo is open. */
export function setToolLimit(e: Engine, on: boolean): void {
  const { tool, region } = toolLimit;
  if (!tool) return;
  if (on) {
    freed.delete(tool);
    // Turning the switch on is the moment to see what it does.
    shown.delete(tool);
    void limitTool(e, tool, region);
    return;
  }
  freed.add(tool);
  modes.set(tool, 'manual');
  toolLimit.mode = 'manual';
  cancelSearch();
  stopRegionShow(e);
  e.holdStroke = null;
  e.brushOff = false;
  e.setPaintLimit(null);
  toolLimit.state = 'off';
  bump();
}

/**
 * Automatic or manual, from the panel. Manual keeps the mask as it is and gives the brush back.
 * Automatic replaces the mask with the region, as one undo step, finding it first if needed.
 */
export function setToolMode(e: Engine, mode: ToolMode): void {
  const { tool, region } = toolLimit;
  if (!tool || toolLimit.mode === mode) return;
  modes.set(tool, mode);
  toolLimit.mode = mode;
  if (mode === 'manual') {
    e.brushOff = false;
  } else if (toolLimit.state === 'on' && regionFill) {
    e.brushOff = true;
    void fillRegion(e, tool);
  } else {
    freed.delete(tool);
    void limitTool(e, tool, region, false, true);
  }
  bump();
}

/** The automatic mode again, after an undo or "Apagar" emptied the mask. */
export function refillRegion(e: Engine): void {
  if (toolLimit.tool) void fillRegion(e, toolLimit.tool);
}

/** The open tool is closing. The engine drops the limit itself when the next tool arrives. */
export function dropToolLimit(): void {
  if (toolLimit.tool) {
    cancelSearch();
    stopRegionShow(hasEngine() ? engine() : null);
  }
  toolLimit.tool = null;
  toolLimit.region = null;
  toolLimit.state = 'off';
  regionFill = null;
}

export function forgetFreedTools(): void {
  freed.clear();
  shown.clear();
  modes.clear();
}

/** What the person reads when a whole stroke falls outside. */
export function strokeOutside(): string {
  toolLimit.missed = true;
  const words = toolLimit.region ? LIMIT_WORDS[toolLimit.region] : null;
  return words ? `Isso ficou fora. Para pintar aqui, desligue "${words.name}".` : '';
}
