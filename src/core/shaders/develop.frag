// Global color stage: applies the liquify warp, in layers when the photo has its mattes, then every tone and
// color adjustment, then the LUT.
//
// The layers, from the back: the background, the body, the head, and the inside of the mouth. Each one is read
// from where its own share of the warp says, and what a layer uncovers comes from a plate, the photo completed
// as if the layer in front were not there. The sliders of the face move a head and the bare skin attached to
// it together, as one surface, so a neck goes where its jaw goes. What covers the body stays where it is, and
// so does the body under a head that changes size, but for the neck. The brush moves the whole person, and the
// background too when its lock is off.
//
// Brincar has a warp of its own, which never goes into the realistic field. It goes first: a point of the photo
// is read where the playful warp says, and from there where the realistic one says, so the playful warp bends
// the face as the realistic tools left it. Its share that moves a head alone sends the head one way and the
// body and the background the other, as the share of the sliders does. With no playful warp, every point is
// read as it always was, down to the bit.
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uInput;
uniform sampler2D uLow;
uniform sampler2D uField;
uniform sampler3D uLut;
uniform vec4 uRegion;
uniform vec2 uTexel;
uniform bool uHasField;
uniform bool uHasFun;
// The playful warp in red and green, and its share that moves a head alone in blue and alpha.
uniform sampler2D uFun;
uniform bool uFunAlone;
uniform bool uLayered;
uniform sampler2D uPerson;
uniform sampler2D uHead;
uniform sampler2D uMouth;
uniform sampler2D uPlateBack;
uniform sampler2D uPlateHead;
uniform sampler2D uBrushField;
uniform sampler2D uLipField;
uniform sampler2D uHeadField;
uniform sampler2D uCover;
uniform sampler2D uCoverWay;
uniform bool uBrushFree;
uniform bool uHasLips;
uniform bool uHeadAlone;
uniform bool uFollows;
uniform float uCoverSpan;
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
// Bare skin goes along with a face that moves, and a collar stays. The skin between the two takes up the
// difference over this many times the move, when the move goes toward the collar or away from it, so it is
// never squeezed to less than about half its size, and a neck with a collar close under the jaw still follows a
// small move whole.
const float ROOM_PER_MOVE = 3.0;
// A move along the edge of a collar squeezes nothing: the skin slides beside it, and needs much less room.
const float ROOM_PER_SLIDE = 1.5;

float layerAt(sampler2D matte, vec2 at) {
  return max(0.0, (textureLod(matte, at, 0.0).r - TRACE) / (1.0 - TRACE));
}

// How much of a plate shows at a point next to a layer, for a layer that moved `by` pixels away from what is
// under it. `first` and `gone` are that move as a share from 0 to 1: with the first move, and only once the layer
// has really gone from beside the point. Where the layer is most of the pixel, the plate comes with the first
// move. Where it is not, the plate still comes early if the photo is not what the plate has there, because that
// difference is the layer's own doing: the color of its edge, the line of its shadow. A move of less than a
// pixel leaves it, so the far reaches of a warp change no ground. Where photo and plate say the same, the photo
// stays for as long as it can. A trace is ground that loose ends reach, and it waits too: a hair that still
// floats near a head is still hair.
float shows(sampler2D matte, vec2 at, vec3 photo, vec3 plate, float by, float first, float gone) {
  float raw = textureLod(matte, at, 0.0).r;
  float trace = raw > 0.5 / 255.0 && raw <= TRACE ? 1.0 : 0.0;
  float differs = smoothstep(0.03, 0.1, distance(photo, plate)) * (1.0 - trace);
  float early = smoothstep(0.6, 2.0, by);
  return max(mix(gone, first, smoothstep(TRACE, 0.5, raw)), mix(gone, early, differs));
}

// How far a point is from what covers the body, in pixels of the photo. The matte keeps the square root.
float coverFar(vec2 at) {
  float far = textureLod(uCover, at, 0.0).r;
  return far * far * uCoverSpan;
}

// What the body takes of a move asked of it at a point, both in image UV: all of it with room enough, and
// less of it next to what covers the body, always the same way the move goes. See `ROOM_PER_MOVE`.
vec2 bodyMove(vec2 at, vec2 asked) {
  vec2 move = asked * uPixels;
  float moved = length(move);
  float far = coverFar(at);
  float least = max(uPixels.x, uPixels.y) * 0.002;
  // Which way the cover is: the distance grows away from it, by one for each pixel. Between two covers it
  // grows by less, and there no way is the way: the move then counts as one toward a cover.
  vec2 slope = textureLod(uCoverWay, at, 0.0).xy;
  float steep = length(slope);
  float sure = smoothstep(0.45, 0.8, steep);
  // How much of the move runs along the edge of the cover, from 0 to 1.
  float across = steep > 1e-4 ? dot(move, slope / steep) : moved;
  float beside = moved > 0.0 ? clamp(1.0 - (across * across) / (moved * moved), 0.0, 1.0) : 0.0;
  float room = moved * mix(ROOM_PER_MOVE, ROOM_PER_SLIDE, sure * beside);
  return asked * smoothstep(0.0, max(room, least), far);
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
  if (uHasField || uHasFun) {
    vec2 iuv = uRegion.xy + vUv * uRegion.zw;
    // Where the head is read from before the realistic field, and where the body and the background are.
    vec2 ph = iuv;
    if (uHasFun) {
      vec4 f = texture(uFun, iuv);
      ph = iuv + f.xy;
      iuv = uFunAlone ? ph - f.zw : ph;
    }
    vec2 d = texture(uField, iuv).xy;
    vec2 dh = uHasFun ? texture(uField, ph).xy : d;
    uv = (ph + dh - uRegion.xy) / uRegion.zw;
    if (uLayered) {
      vec2 db = texture(uBrushField, iuv).xy;
      float longSide = max(uPixels.x, uPixels.y);
      // Where each layer is read from. The head goes by the whole field. The body goes by the brush, and by
      // the rest but for the share that moves a head alone, as far as it has room: all of it on bare skin, less
      // next to what covers the body, and nothing on that. The background is read from right here, unless the
      // brush may move it too.
      vec2 da = uHeadAlone ? texture(uHeadField, iuv).xy : vec2(0.0);
      vec2 asked = d - db - da;
      vec2 sh = ph + dh;
      vec2 sy = iuv + db;
      if (uFollows && asked != vec2(0.0)) sy += bodyMove(sy, asked);
      vec2 sb = uBrushFree ? iuv + db : iuv;
      // How much the head moved against the body here, and the body against the background. A plate only
      // counts where something moved, so a warp at zero is the photo itself, down to the bit.
      float shapedBy = length((sh - sy) * uPixels);
      float heldBy = length((sy - sb) * uPixels);
      float shaped = smoothstep(0.0, 1.5, shapedBy);
      float held = smoothstep(0.0, 1.5, heldBy);
      // Around a layer, a plate also covers ground the layer never stood on: the few cells its edge left a
      // trace of color on, and what loose ends of hair reach. That ground only needs replacing once the layer
      // has really gone from next to it, so a small move leaves the background as the photo has it.
      float gone = smoothstep(longSide * 0.0012, longSide * 0.0035, shapedBy);
      float goneHeld = smoothstep(longSide * 0.0012, longSide * 0.0035, heldBy);
      vec3 top = texture(uInput, uv).rgb;
      float topGuess = 0.0;
      if (uHasLips) {
        // Lips that a slider shaped slide over the inside of the mouth, which is read without that share of
        // the field, so the teeth stay as they are. Past what the photo shows of it, the plate carries it on.
        vec2 dl = texture(uLipField, ph).xy;
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
        vec3 seen = texture(uInput, yuv).rgb;
        float bodyGuess = plateHead.a * shows(uHead, sy, seen, plateHead.rgb, shapedBy, shaped, gone);
        vec3 under = mix(seen, plateHead.rgb, bodyGuess);
        float underGuess = bodyGuess;
        vec2 below = yuv;
        if (held > 0.0) {
          // The person moved and the background stayed: behind the body there is the other plate.
          float person = layerAt(uPerson, sy);
          vec2 buv = (sb - uRegion.xy) / uRegion.zw;
          vec4 plateBack = texture(uPlateBack, sb);
          vec3 ground = texture(uInput, buv).rgb;
          float backGuess = plateBack.a * shows(uPerson, sb, ground, plateBack.rgb, heldBy, held, goneHeld);
          vec3 back = mix(ground, plateBack.rgb, backGuess);
          // Past the edge of the person there is only ground, read from where it is and never from where a warp
          // points: a warp fades out far beyond the person, and the ground there must come out as it was.
          under = mix(back, under, person);
          underGuess = mix(backGuess, bodyGuess, person);
          if (person < 0.5) below = buv;
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
