// Global color stage: applies the liquify warp, with the background held in place when there is a matte of
// the person, then every tone and color adjustment, then the LUT.
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uInput;
uniform sampler2D uLow;
uniform sampler2D uField;
uniform sampler3D uLut;
uniform vec4 uRegion;
uniform vec2 uTexel;
uniform bool uHasField;
uniform bool uLocked;
uniform sampler2D uMatte;
uniform sampler2D uPlate;
uniform sampler2D uBackField;
uniform vec2 uPixels;
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
  vec3 layered = vec3(0.0);
  bool composed = false;
  if (uHasField) {
    vec2 iuv = uRegion.xy + vUv * uRegion.zw;
    vec2 d = texture(uField, iuv).xy;
    uv = (iuv + d - uRegion.xy) / uRegion.zw;
    if (uLocked) {
      // Two layers. The person is read from where the field says. The background is read from right here,
      // or from where the brush says when it may move the background too, and it is not warped.
      float person = textureLod(uMatte, iuv + d, 0.0).r;
      vec2 back = iuv + texture(uBackField, iuv).xy;
      vec2 buv = (back - uRegion.xy) / uRegion.zw;
      if (person < 0.999) {
        // Where a person stood and left, nothing knows the photo: the plate takes over. Only where something
        // moved, so a warp at zero is the photo itself, down to the bit.
        float moved = smoothstep(0.0, 1.5, length(d * uPixels));
        // The alpha of the plate says where a person stood, and is zero on all the rest of the photo.
        vec4 plate = texture(uPlate, back);
        vec3 behind = mix(texture(uInput, buv).rgb, plate.rgb, plate.a * moved);
        layered = mix(behind, texture(uInput, uv).rgb, person);
        composed = true;
        // What comes next reads around the same place, so it goes to the layer that is on top here.
        if (person < 0.5) uv = buv;
      }
    }
  }
  vec4 src = texture(uInput, uv);
  vec3 c = composed ? layered : src.rgb;

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
