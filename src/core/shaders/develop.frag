// Global color stage: applies the liquify warp, then every tone and color adjustment, then the LUT.
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uInput;
uniform sampler2D uLow;
uniform sampler2D uField;
uniform sampler3D uLut;
uniform vec4 uRegion;
uniform vec2 uTexel;
uniform bool uHasField;
uniform float uExposure;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uTemp;
uniform float uTint;
uniform float uSaturation;
uniform float uVibrance;
uniform float uSharpen;
uniform float uSharpenRadius;
uniform float uLutMix;
uniform float uLutSize;
uniform sampler2D uFilterMask;
uniform bool uFilterMasked;
uniform float uFilterLod;

const float SHADOW_GAIN = 2.0;

vec3 sCurve(vec3 x, float k) {
  vec3 s = x * x * (3.0 - 2.0 * x);
  return k >= 0.0 ? mix(x, s, k) : 0.5 + (x - 0.5) * (1.0 + 0.6 * k);
}

void main() {
  vec2 uv = vUv;
  if (uHasField) {
    vec2 iuv = uRegion.xy + vUv * uRegion.zw;
    vec2 d = texture(uField, iuv).xy;
    uv = (iuv + d - uRegion.xy) / uRegion.zw;
  }
  vec4 src = texture(uInput, uv);
  vec3 c = src.rgb;

  if (uSharpen > 0.0) {
    vec2 o = uTexel * uSharpenRadius;
    vec3 blur = (
      texture(uInput, uv + vec2(o.x, 0.0)).rgb + texture(uInput, uv - vec2(o.x, 0.0)).rgb +
      texture(uInput, uv + vec2(0.0, o.y)).rgb + texture(uInput, uv - vec2(0.0, o.y)).rgb +
      (texture(uInput, uv + o).rgb + texture(uInput, uv - o).rgb +
       texture(uInput, uv + vec2(o.x, -o.y)).rgb + texture(uInput, uv + vec2(-o.x, o.y)).rgb) * 0.5
    ) / 6.0;
    float detail = luma(c) - luma(blur);
    // Soft limit keeps edges from ringing.
    detail = detail / (1.0 + abs(detail) * 6.0);
    c += detail * uSharpen * 2.2;
  }

  if (uExposure != 0.0 || uTemp != 0.0 || uTint != 0.0) {
    vec3 lin = srgbToLinear(clamp(c, 0.0, 1.0)) * exp2(uExposure * 2.0);
    lin *= vec3(1.0 + 0.22 * uTemp + 0.06 * uTint, 1.0 - 0.12 * uTint, 1.0 - 0.22 * uTemp + 0.06 * uTint);
    c = linearToSrgb(lin);
  }

  if (uHighlights != 0.0 || uShadows != 0.0) {
    float low = luma(bicubicLod(uLow, uRegion.xy + uv * uRegion.zw, 0.0).rgb);
    float l = max(luma(c), 1e-3);
    float wh = smoothstep(0.4, 0.95, low);
    float ws = 1.0 - smoothstep(0.08, 0.6, low);
    float target = l + uShadows * 0.32 * ws * (1.0 - l) + uHighlights * 0.34 * wh * l;
    // Near black a large gain turns the color noise of the file into solid color, so past a limit the light comes in neutral.
    float gain = min(max(target, 0.0) / l, SHADOW_GAIN);
    c = c * gain + max(target - l * gain, 0.0);
  }

  if (uContrast != 0.0) c = sCurve(clamp(c, 0.0, 1.0), uContrast);

  if (uSaturation != 0.0 || uVibrance != 0.0) {
    float l = luma(c);
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float sat = mx - mn;
    // Vibrance favors muted colors and protects skin tones around orange.
    vec3 hsl = rgbToHsl(clamp(c, 0.0, 1.0));
    float skin = 1.0 - smoothstep(0.03, 0.09, abs(hsl.x - 0.07));
    float vib = uVibrance * (1.0 - sat) * (1.0 - 0.7 * skin);
    c = mix(vec3(l), c, 1.0 + uSaturation + vib);
  }

  c = clamp(c, 0.0, 1.0);
  // Alpha carries how much of the filter this pixel took, for the grain and vignette of the next stage.
  float share = 0.0;
  if (uLutMix > 0.0) {
    float m = 1.0;
    if (uFilterMasked) {
      // The mask lives on the photo as it was opened: the warped position keeps it on the face.
      vec2 muv = uRegion.xy + uv * uRegion.zw;
      m = uFilterLod > 0.0 ? bicubicLod(uFilterMask, muv, uFilterLod).r : textureLod(uFilterMask, muv, 0.0).r;
    }
    vec3 coord = c * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize;
    share = uLutMix * m;
    c = mix(c, texture(uLut, coord).rgb, share);
  }
  outColor = vec4(c, share);
}
