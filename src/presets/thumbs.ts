/** Renders small previews of the current photo through each filter, one by one, off the main path. */

import type { Engine } from '../core/engine';
import type { Tex, Tex3D } from '../core/gl/context';
import { shader } from '../core/pipeline/pipeline';
import { COPY_FRAG, REGION_FRAG } from '../core/shaders/small';
import { buildLut, type FilterData } from './luts';

const LUT_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;
uniform sampler3D uLut;
uniform float uLutSize;
uniform float uVignette;
void main() {
  vec3 c = texture(uInput, vUv).rgb;
  vec3 coord = c * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize;
  c = texture(uLut, coord).rgb;
  float v = smoothstep(0.35, 1.45, length((vUv - 0.5) * 2.0));
  v = v * v * (3.0 - 2.0 * v);
  outColor = vec4(uVignette > 0.0 ? c * (1.0 - uVignette * 0.85 * v) : mix(c, vec3(1.0), -uVignette * 0.7 * v), 1.0);
}
`;

const SIZE = 104;
const LUT_SIZE = 17;

export class ThumbRenderer {
  private base: Tex | null = null;
  private lut: Tex3D | undefined;
  private target: Tex | null = null;

  constructor(private readonly engine: Engine) {}

  /** Grabs a centered square of the current image. */
  prepare(): void {
    const { glc, ctx } = this.engine;
    if (!ctx) return;
    this.base ??= glc.createTex(SIZE, SIZE, glc.caps.work);
    this.target ??= glc.createTex(SIZE, SIZE, 'rgba8');
    const side = Math.min(ctx.w, ctx.h);
    const lod = Math.max(0, Math.log2(side / SIZE));
    glc.run(glc.program(shader(REGION_FRAG)), this.base, {
      uInput: ctx.slot('healed'),
      uSrc: [(1 - side / ctx.w) / 2, Math.max(0, 0.32 - side / ctx.h / 2), side / ctx.w, side / ctx.h],
      uLod: lod,
    });
  }

  /** The square as plain RGBA bytes, for reading the tone of the photo. */
  async pixels(): Promise<Uint8Array | null> {
    const { glc } = this.engine;
    if (!this.base || !this.target) return null;
    glc.run(glc.program(shader(COPY_FRAG)), this.target, { uInput: this.base });
    return (await glc.readAsync(this.target, { x: 0, y: 0, w: SIZE, h: SIZE })).data;
  }

  async render(filter: FilterData, canvas: HTMLCanvasElement): Promise<void> {
    const { glc } = this.engine;
    if (!this.base || !this.target) return;
    this.lut = glc.createLut(LUT_SIZE, buildLut(filter, LUT_SIZE), this.lut);
    glc.run(glc.program(shader(LUT_FRAG)), this.target, {
      uInput: this.base,
      uLut: this.lut,
      uLutSize: LUT_SIZE,
      uVignette: (filter.vignette ?? 0) / 100,
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
    if (this.lut) glc.gl.deleteTexture(this.lut.tex3d);
    this.base = null;
    this.target = null;
  }
}
