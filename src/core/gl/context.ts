/**
 * Thin WebGL2 layer: capability probing, textures, render targets, programs, draws and readback.
 * Convention: texture row 0 is the top of the image. Render-to-texture keeps that orientation,
 * so `readPixels` returns rows top-down. Only the on-screen pass flips Y.
 */

export type TexFormat = 'rgba8' | 'rgba16f' | 'r8' | 'r16f' | 'rg16f';

export interface Tex {
  readonly tex: WebGLTexture;
  readonly fbo: WebGLFramebuffer | null;
  readonly w: number;
  readonly h: number;
  readonly format: TexFormat;
  readonly levels: number;
}

export interface Tex3D {
  readonly tex3d: WebGLTexture;
  readonly size: number;
}

export type UniformValue = number | boolean | readonly number[] | Float32Array | Tex | Tex3D;
export type Uniforms = Record<string, UniformValue>;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Caps {
  maxTexture: number;
  floatTargets: boolean;
  /** Best RGBA format for intermediate buffers on this device. */
  work: TexFormat;
  /** Best single-channel format for the stroke accumulation buffer. */
  stroke: TexFormat;
}

const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
`;

interface UniformInfo {
  loc: WebGLUniformLocation;
  type: number;
}

export class Program {
  readonly uniforms = new Map<string, UniformInfo>();

  constructor(
    readonly handle: WebGLProgram,
    gl: WebGL2RenderingContext,
  ) {
    const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(handle, i);
      if (!info) continue;
      const loc = gl.getUniformLocation(handle, info.name);
      if (loc) this.uniforms.set(info.name.replace(/\[0\]$/, ''), { loc, type: info.type });
    }
  }
}

interface FormatSpec {
  internal: number;
  format: number;
  type: number;
}

function formatSpec(gl: WebGL2RenderingContext, f: TexFormat): FormatSpec {
  switch (f) {
    case 'rgba8':
      return { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    case 'rgba16f':
      return { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };
    case 'r8':
      return { internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE };
    case 'r16f':
      return { internal: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT };
    case 'rg16f':
      return { internal: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT };
  }
}

export interface TexOptions {
  linear?: boolean;
  mips?: boolean;
  /** Skip framebuffer creation for textures that are only sampled. */
  noTarget?: boolean;
}

export class GLContext {
  readonly gl: WebGL2RenderingContext;
  readonly caps: Caps;
  private readonly programs = new Map<string, Program>();
  private readonly vao: WebGLVertexArrayObject;
  private readonly pool = new Map<string, Tex[]>();

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('webgl2-unavailable');
    this.gl = gl;

    const floatTargets = !!(
      gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')
    );
    gl.getExtension('OES_texture_float_linear');
    this.caps = {
      maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      floatTargets,
      work: floatTargets ? 'rgba16f' : 'rgba8',
      stroke: floatTargets ? 'r16f' : 'r8',
    };
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  }

  /** Compiles and links once per source; later calls return the cached program. */
  program(fragment: string): Program {
    const hit = this.programs.get(fragment);
    if (hit) return hit;
    const { gl } = this;
    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`shader: ${log}\n${src.slice(0, 400)}`);
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    const handle = gl.createProgram()!;
    gl.attachShader(handle, vs);
    gl.attachShader(handle, fs);
    gl.linkProgram(handle);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      throw new Error(`link: ${gl.getProgramInfoLog(handle)}`);
    }
    const program = new Program(handle, gl);
    this.programs.set(fragment, program);
    return program;
  }

  createTex(w: number, h: number, format: TexFormat, opts: TexOptions = {}): Tex {
    const { gl } = this;
    const { linear = true, mips = false, noTarget = false } = opts;
    const spec = formatSpec(gl, format);
    const levels = mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, levels, spec.internal, w, h);
    const mag = linear ? gl.LINEAR : gl.NEAREST;
    const min = mips ? gl.LINEAR_MIPMAP_LINEAR : mag;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let fbo: WebGLFramebuffer | null = null;
    if (!noTarget) {
      fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    return { tex, fbo, w, h, format, levels };
  }

  destroyTex(t: Tex): void {
    this.gl.deleteTexture(t.tex);
    if (t.fbo) this.gl.deleteFramebuffer(t.fbo);
  }

  /** Scratch texture from the pool. Pair with `release`. */
  acquire(w: number, h: number, format: TexFormat): Tex {
    const list = this.pool.get(`${w}x${h}:${format}`);
    return list?.pop() ?? this.createTex(w, h, format);
  }

  release(t: Tex): void {
    const key = `${t.w}x${t.h}:${t.format}`;
    const list = this.pool.get(key);
    if (list) list.push(t);
    else this.pool.set(key, [t]);
  }

  /** Frees every pooled scratch texture. */
  drainPool(): void {
    for (const list of this.pool.values()) list.forEach((t) => this.destroyTex(t));
    this.pool.clear();
  }

  private applyUniforms(p: Program, values: Uniforms): void {
    const { gl } = this;
    let unit = 0;
    for (const [name, value] of Object.entries(values)) {
      const u = p.uniforms.get(name);
      if (!u) continue;
      if (typeof value === 'number') {
        if (u.type === gl.INT || u.type === gl.BOOL) gl.uniform1i(u.loc, value);
        else gl.uniform1f(u.loc, value);
      } else if (typeof value === 'boolean') {
        gl.uniform1i(u.loc, value ? 1 : 0);
      } else if ('tex' in value) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, value.tex);
        gl.uniform1i(u.loc, unit++);
      } else if ('tex3d' in value) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_3D, value.tex3d);
        gl.uniform1i(u.loc, unit++);
      } else {
        const arr = value as readonly number[];
        switch (u.type) {
          case gl.FLOAT_VEC2:
            gl.uniform2fv(u.loc, arr as number[]);
            break;
          case gl.FLOAT_VEC3:
            gl.uniform3fv(u.loc, arr as number[]);
            break;
          case gl.FLOAT_VEC4:
            gl.uniform4fv(u.loc, arr as number[]);
            break;
          case gl.FLOAT_MAT3:
            gl.uniformMatrix3fv(u.loc, false, arr as number[]);
            break;
          default:
            gl.uniform1fv(u.loc, arr as number[]);
        }
      }
    }
  }

  /** Runs a fullscreen pass. `target = null` draws to the canvas. `rect` limits the write area. */
  run(p: Program, target: Tex | null, values: Uniforms, rect?: Rect | null): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    const w = target ? target.w : gl.drawingBufferWidth;
    const h = target ? target.h : gl.drawingBufferHeight;
    gl.viewport(0, 0, w, h);
    if (rect) {
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(rect.x, rect.y, rect.w, rect.h);
    } else {
      gl.disable(gl.SCISSOR_TEST);
    }
    gl.useProgram(p.handle);
    this.applyUniforms(p, values);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  clear(target: Tex, r = 0, g = 0, b = 0, a = 0): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  copy(src: Tex, dst: Tex, rect?: Rect): void {
    const { gl } = this;
    const r = rect ?? { x: 0, y: 0, w: Math.min(src.w, dst.w), h: Math.min(src.h, dst.h) };
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.fbo);
    gl.blitFramebuffer(r.x, r.y, r.x + r.w, r.y + r.h, r.x, r.y, r.x + r.w, r.y + r.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }

  generateMips(t: Tex): void {
    if (t.levels <= 1) return;
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /** Uploads rows into part of a texture. Data is tightly packed. */
  upload(t: Tex, rect: Rect, data: ArrayBufferView, rowLength = 0, skip = 0): void {
    const { gl } = this;
    const spec = formatSpec(gl, t.format);
    const type = data instanceof Float32Array ? gl.FLOAT : spec.type;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, rowLength);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, skip);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, rect.x, rect.y, rect.w, rect.h, spec.format, type, data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
  }

  uploadImage(t: Tex, source: TexImageSource): void {
    const { gl } = this;
    const spec = formatSpec(gl, t.format);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, t.w, t.h, spec.format, spec.type, source);
  }

  /**
   * Reads an 8-bit target without stalling the main thread: pixels go to a pack buffer and
   * the promise resolves after the GPU fence. Result has `channels` bytes per pixel.
   */
  async readAsync(t: Tex, rect: Rect): Promise<{ data: Uint8Array; channels: number }> {
    const { gl } = this;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.fbo);
    let format: number = gl.RGBA;
    let channels = 4;
    if (t.format === 'r8' && gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) === gl.RED) {
      format = gl.RED;
      channels = 1;
    }
    const size = rect.w * rect.h * channels;
    const pbo = gl.createBuffer()!;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);
    gl.readPixels(rect.x, rect.y, rect.w, rect.h, format, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    await new Promise<void>((resolve) => {
      const poll = () => {
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) setTimeout(poll, 1);
        else resolve();
      };
      poll();
    });
    gl.deleteSync(sync);
    const data = new Uint8Array(size);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, data);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.deleteBuffer(pbo);
    return { data, channels };
  }

  /** Blocking read of an RGBA8 target, used only for final export tiles. */
  readSync(t: Tex, rect: Rect, out: Uint8Array | Uint8ClampedArray): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.fbo);
    gl.readPixels(rect.x, rect.y, rect.w, rect.h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }

  createLut(size: number, data: Float32Array, existing?: Tex3D): Tex3D {
    const { gl } = this;
    const tex3d = existing?.size === size ? existing.tex3d : gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, tex3d);
    if (existing?.size !== size) {
      if (existing) gl.deleteTexture(existing.tex3d);
      gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RGBA16F, size, size, size);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
        gl.texParameteri(gl.TEXTURE_3D, wrap, gl.CLAMP_TO_EDGE);
      }
    }
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, size, size, size, gl.RGBA, gl.FLOAT, data);
    return { tex3d, size };
  }
}
