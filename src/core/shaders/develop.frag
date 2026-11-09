// Global color stage: applies the liquify warp, in layers when the photo has its mattes, then every tone and
// color adjustment, then the LUT.
//
// The layers, from the back: the background, the body, the head, and the inside of the mouth. Each one is read
// from where its own share of the warp says, and what a layer uncovers comes from a plate, the photo completed
// as if the layer in front were not there. The sliders of the face move the head alone. The brush moves the
// whole person, and the background too when its lock is off.
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uInput;
uniform sampler2D uLow;
uniform sampler2D uField;
uniform sampler3D uLut;
uniform vec4 uRegion;
uniform vec2 uTexel;
uniform bool uHasField;
uniform bool uLayered;
uniform sampler2D uPerson;
uniform sampler2D uHead;
uniform sampler2D uMouth;
uniform sampler2D uPlateBack;
uniform sampler2D uPlateHead;
uniform sampler2D uBrushField;
uniform sampler2D uLipField;
uniform bool uBrushFree;
uniform bool uHasLips;
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
// A matte at or below this holds none of its layer: such values only mark ground for the plates.
const float TRACE = 8.0 / 255.0;

float layerAt(sampler2D matte, vec2 at) {
  return max(0.0, (textureLod(matte, at, 0.0).r - TRACE) / (1.0 - TRACE));
}

vec3 sCurve(vec3 x, float k) {
  vec3 s = x * x * (3.0 - 2.0 * x);
  return k >= 0.0 ? mix(x, s, k) : 0.5 + (x - 0.5) * (1.0 + 0.6 * k);
}

void main() {
  vec2 uv = vUv;
  vec3 layered = vec3(0.0);
  bool composed = false;
  // The share of this pixel that is a guess of a plate: no detail of the photo around it belongs to it.
  float guess = 0.0;
  if (uHasField) {
    vec2 iuv = uRegion.xy + vUv * uRegion.zw;
    vec2 d = texture(uField, iuv).xy;
    uv = (iuv + d - uRegion.xy) / uRegion.zw;
    if (uLayered) {
      vec2 db = texture(uBrushField, iuv).xy;
      // Where each layer is read from: the head from the whole field, the body from the brush alone, and the
      // background from right here, unless the brush may move it too.
      vec2 sh = iuv + d;
      vec2 sy = iuv + db;
      vec2 sb = uBrushFree ? sy : iuv;
      // How much the sliders moved the head against the body here, and the brush the body against the background.
      // A plate only counts where something moved, so a warp at zero is the photo itself, down to the bit.
      float shapedBy = length((d - db) * uPixels);
      float heldBy = length(db * uPixels);
      float shaped = smoothstep(0.0, 1.5, shapedBy);
      float held = uBrushFree ? 0.0 : smoothstep(0.0, 1.5, heldBy);
      // Around a layer, a plate also covers ground the layer never stood on: the few cells its edge left a
      // trace of color on, and what loose ends of hair reach. That ground only needs replacing once the layer
      // has really gone from next to it, so a small move leaves the background as the photo has it.
      float longSide = max(uPixels.x, uPixels.y);
      float gone = smoothstep(longSide * 0.0012, longSide * 0.006, shapedBy);
      float goneHeld = uBrushFree ? 0.0 : smoothstep(longSide * 0.0012, longSide * 0.006, heldBy);
      vec3 top = texture(uInput, uv).rgb;
      float topGuess = 0.0;
      if (uHasLips) {
        // Lips that a slider shaped slide over the inside of the mouth, which is read without that share of
        // the field, so the teeth stay as they are. Past what the photo shows of it, the plate carries it on.
        vec2 dl = texture(uLipField, iuv).xy;
        float slid = smoothstep(0.0, 1.0, length(dl * uPixels));
        float open = slid > 0.0 ? textureLod(uMouth, sh, 0.0).r * slid : 0.0;
        if (open > 0.0) {
          vec2 si = sh - dl;
          float seen = textureLod(uMouth, si, 0.0).r;
          vec3 inner = mix(texture(uPlateHead, si).rgb, texture(uInput, (si - uRegion.xy) / uRegion.zw).rgb, seen);
          top = mix(top, inner, open);
          topGuess = open * (1.0 - seen);
        }
      }
      float head = layerAt(uHead, sh);
      if (head < 0.999 && shaped + held > 0.0) {
        vec2 yuv = (sy - uRegion.xy) / uRegion.zw;
        // The alpha of a plate says where its layer stood, and is zero on all the rest of the photo.
        vec4 plateHead = texture(uPlateHead, sy);
        float bodyGuess = plateHead.a * (layerAt(uHead, sy) > 0.0 ? shaped : gone);
        vec3 under = mix(texture(uInput, yuv).rgb, plateHead.rgb, bodyGuess);
        float underGuess = bodyGuess;
        vec2 below = yuv;
        if (held > 0.0) {
          // The brush moved the person and left the background: behind the body there is the other plate.
          float person = layerAt(uPerson, sy);
          vec2 buv = (sb - uRegion.xy) / uRegion.zw;
          vec4 plateBack = texture(uPlateBack, sb);
          float backGuess = plateBack.a * (layerAt(uPerson, sb) > 0.0 ? held : goneHeld);
          vec3 back = mix(texture(uInput, buv).rgb, plateBack.rgb, backGuess);
          float body = mix(1.0, person, held);
          under = mix(back, under, body);
          underGuess = mix(backGuess, bodyGuess, body);
          if (body < 0.5) below = buv;
        }
        layered = mix(under, top, head);
        guess = mix(underGuess, topGuess, head);
        composed = true;
        // What comes next reads around the same place, so it goes to the layer that is on top here.
        if (head < 0.5) uv = below;
      } else if (topGuess > 0.0 || uHasLips) {
        layered = top;
        guess = topGuess;
        composed = true;
      }
    }
  }
  vec4 src = texture(uInput, uv);
  vec3 c = composed ? layered : src.rgb;

  if (uSharpen > 0.0 && guess < 1.0) {
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
    c += detail * uSharpen * 2.2 * (1.0 - guess);
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
