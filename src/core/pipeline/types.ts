import type { GLContext, Rect, Tex, Uniforms } from '../gl/context';
import type { EditDoc, LayerId, Params } from '../doc';
import type { RenderContext } from './context';

/** Inputs a masked tool receives on every pass. */
export interface PassEnv {
  glc: GLContext;
  ctx: RenderContext;
  mask: Tex;
  params: Params;
  /** Changes whenever this layer's mask changes. */
  maskRev: number;
  input: Tex;
}

/** GPU side of a masked tool. */
export interface ToolPass {
  id: LayerId;
  /** Body of the shader: must define `vec3 tool(vec3 c, float m)`. */
  fragment: string;
  /** Pixels of neighborhood the effect reaches around the mask, at the context resolution. */
  margin?(ctx: RenderContext): number;
  /** Tool runs even where the mask is empty, for effects that spread past the brush. */
  spreads?: boolean;
  /** Builds cached helper textures. Returns extra uniforms. */
  prepare?(env: PassEnv): Uniforms | void;
  uniforms(params: Params, env: PassEnv): Uniforms;
}

export interface MaskProvider {
  get(id: LayerId): Tex | null;
  rev(id: LayerId): number;
}

/** Applies the healing stack. Loaded on demand. */
export interface Healer {
  apply(ctx: RenderContext, doc: EditDoc, target: Tex): void;
  /** Applies only the newest op on top of the current result. */
  applyLast(ctx: RenderContext, doc: EditDoc, target: Tex): Rect | null;
}
