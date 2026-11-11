/** Small previews of the current photo under each light of Luzes, around the face, one by one. */

import type { Engine } from '../core/engine';
import type { Tex } from '../core/gl/context';
import { lightUniforms } from '../core/light/resolve';
import type { LightDef } from '../core/light/types';
import { shader } from '../core/pipeline/pipeline';
import LIGHT_FRAG from '../core/shaders/light.frag?raw';
import { REGION_FRAG } from '../core/shaders/small';

const SIZE = 104;
/** The square shows this many faces across, so the background and the edge of the person are in it. */
const FACES_ACROSS = 3.2;

export class LightThumbs {
  private base: Tex | null = null;
  private target: Tex | null = null;
  /** The square of the photo the previews show, in image UV. */
  private crop: [number, number, number, number] = [0, 0, 1, 1];

  constructor(private readonly engine: Engine) {}

  /** Grabs a square of the photo around the main face. False when the photo has no scene yet. */
  prepare(): boolean {
    const { glc, ctx, scene, doc } = this.engine;
    if (!ctx || !scene) return false;
    this.base ??= glc.createTex(SIZE, SIZE, glc.caps.work);
    this.target ??= glc.createTex(SIZE, SIZE, 'rgba8');
    const long = Math.max(doc.width, doc.height);
    const side = Math.min(doc.width, doc.height, Math.max(scene.stats.faceSize * FACES_ACROSS * long, 0.3 * long));
    const w = side / doc.width;
    const h = side / doc.height;
    const x = Math.min(1 - w, Math.max(0, scene.stats.face[0] - w / 2));
    const y = Math.min(1 - h, Math.max(0, scene.stats.face[1] - h * 0.42));
    this.crop = [x, y, w, h];
    glc.run(glc.program(shader(REGION_FRAG)), this.base, {
      uInput: ctx.slot('healed'),
      uSrc: this.crop,
      uLod: Math.max(0, Math.log2((side * ctx.region.scale) / SIZE)),
    });
    return true;
  }

  async render(light: LightDef, canvas: HTMLCanvasElement): Promise<void> {
    const { glc, scene, pipeline, doc } = this.engine;
    if (!this.base || !this.target || !scene || !pipeline?.scene) return;
    const [x, y, w, h] = this.crop;
    glc.run(glc.program(shader(LIGHT_FRAG)), this.target, {
      uInput: this.base,
      uScene: pipeline.scene.tex,
      uField: pipeline.scene.field,
      uRegion: this.crop,
      uPixels: [doc.width, doc.height],
      // Image UV to the square, so what belongs to the camera sits in the preview as it will in the frame.
      uToOutput: [1 / w, 0, -x / w, 0, 1 / h, -y / h, 0, 0, 1],
      uOutSize: [SIZE, SIZE],
      // The square is too small a photo to have strands to read.
      uStrandLod: 0,
      ...lightUniforms(light.recipe, scene.stats, doc, 1, '01/01/2000'),
      // A date and grain at this size are only noise.
      uStampOn: false,
      uGrain: 0,
    });
    const { data } = await glc.readAsync(this.target, { x: 0, y: 0, w: SIZE, h: SIZE });
    canvas.width = SIZE;
    canvas.height = SIZE;
    canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer), SIZE, SIZE), 0, 0);
  }

  destroy(): void {
    const { glc } = this.engine;
    if (this.base) glc.destroyTex(this.base);
    if (this.target) glc.destroyTex(this.target);
    this.base = null;
    this.target = null;
  }
}
