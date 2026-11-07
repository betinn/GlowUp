/** Small utility shaders that do not deserve a file of their own. */

export const COPY_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;
void main() { outColor = texture(uInput, vUv); }
`;

/** Copies a region of a texture, optionally at a chosen mip level. */
export const REGION_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;
uniform vec4 uSrc;
uniform float uLod;
void main() { outColor = textureLod(uInput, uSrc.xy + vUv * uSrc.zw, uLod); }
`;

export const DAB_FRAG = `
out vec4 outColor;
uniform vec3 uDab;
uniform float uHardness;
uniform float uFlow;
void main() {
  float d = distance(gl_FragCoord.xy, uDab.xy) / uDab.z;
  float a = (1.0 - smoothstep(uHardness * 0.98, 1.0, d)) * uFlow;
  outColor = vec4(a, a, a, a);
}
`;

export const APPLY_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uBase;
uniform sampler2D uStroke;
uniform sampler2D uLimit;
uniform float uOpacity;
uniform bool uErase;
uniform bool uLimited;
void main() {
  float b = textureLod(uBase, vUv, 0.0).r;
  float s = texture(uStroke, vUv).r * uOpacity;
  if (uLimited && !uErase) s *= textureLod(uLimit, vUv, 0.0).r;
  float r = uErase ? b * (1.0 - s) : b + (1.0 - b) * s;
  outColor = vec4(r, r, r, 1.0);
}
`;

export const BLUR_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;
uniform vec2 uStep;
void main() {
  // Nine-tap gaussian. uStep is the distance between taps.
  vec4 s = texture(uInput, vUv) * 0.2042;
  s += (texture(uInput, vUv + uStep) + texture(uInput, vUv - uStep)) * 0.1802;
  s += (texture(uInput, vUv + uStep * 2.0) + texture(uInput, vUv - uStep * 2.0)) * 0.1238;
  s += (texture(uInput, vUv + uStep * 3.0) + texture(uInput, vUv - uStep * 3.0)) * 0.0663;
  s += (texture(uInput, vUv + uStep * 4.0) + texture(uInput, vUv - uStep * 4.0)) * 0.0276;
  outColor = s;
}
`;

/** Pull step of pull-push: weighted two-by-two average of premultiplied color. */
export const PULL_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;
uniform vec2 uTexel;
void main() {
  vec4 s = texture(uInput, vUv + uTexel * vec2(-0.5, -0.5)) + texture(uInput, vUv + uTexel * vec2(0.5, -0.5))
         + texture(uInput, vUv + uTexel * vec2(-0.5, 0.5)) + texture(uInput, vUv + uTexel * vec2(0.5, 0.5));
  s *= 0.25;
  // Weights saturate quickly so a few valid pixels are enough to fill a coarse cell.
  float w = min(s.a * 4.0, 1.0);
  outColor = s.a > 1e-5 ? vec4(s.rgb / s.a * w, w) : vec4(0.0);
}
`;

/** Push step: keeps known data and fills the rest from the coarser level. */
export const PUSH_FRAG = `
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uFine;
uniform sampler2D uCoarse;
void main() {
  vec4 f = texture(uFine, vUv);
  vec4 c = bicubicLod(uCoarse, vUv, 0.0);
  outColor = f + (1.0 - f.a) * c;
}
`;
