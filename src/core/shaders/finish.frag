// Last stage in image space: selective blur, vignette and grain.
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uInput;
uniform vec4 uRegion;
uniform mat3 uToOutput;
uniform vec2 uOutSize;
uniform int uBlurMode;
uniform vec2 uFocus;
uniform float uFocusRadius;
uniform float uFeather;
uniform float uAngle;
uniform float uMaxLod;
uniform float uVignette;
uniform float uGrain;
uniform float uGrainCells;
uniform float uFilterVignette;
uniform float uFilterGrain;

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 iuv = uRegion.xy + vUv * uRegion.zw;
  // Column-major upload of a row-major matrix: multiply on the left.
  vec2 st = (vec3(iuv, 1.0) * uToOutput).xy;
  float longSide = max(uOutSize.x, uOutSize.y);
  vec2 rel = (st - uFocus) * uOutSize / longSide;

  vec3 c;
  if (uBlurMode == 0) {
    c = texture(uInput, vUv).rgb;
  } else {
    float d;
    if (uBlurMode == 1) {
      d = length(rel);
    } else {
      vec2 n = vec2(-sin(uAngle), cos(uAngle));
      d = abs(dot(rel, n));
    }
    float a = smoothstep(uFocusRadius, uFocusRadius + uFeather, d);
    float lod = a * uMaxLod;
    c = lod < 0.02 ? texture(uInput, vUv).rgb : bicubicLod(uInput, vUv, lod).rgb;
  }

  // The filter's own grain and vignette reach only as far as the filter does, as develop wrote in alpha.
  float share = texture(uInput, vUv).a;
  float vignette = clamp(uVignette + share * uFilterVignette, -1.0, 1.0);
  float grain = uGrain + share * uFilterGrain;

  if (vignette != 0.0) {
    vec2 q = (st - 0.5) * 2.0;
    float v = smoothstep(0.35, 1.45, length(q));
    v = v * v * (3.0 - 2.0 * v);
    c = vignette > 0.0 ? c * (1.0 - vignette * 0.85 * v) : mix(c, vec3(1.0), -vignette * 0.7 * v);
  }

  if (grain > 0.0) {
    vec2 p = iuv * vec2(uGrainCells);
    float n = valueNoise(p) * 0.6 + valueNoise(p * 2.13 + 17.0) * 0.4 - 0.5;
    float l = luma(c);
    float weight = 0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0));
    c += n * grain * 0.22 * weight;
  }

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
