// Luzes: the light of the scene made again, between the developed photo and the stickers. The person and the
// background change apart, by the scene of the photo: person in red, skin in green, hair in blue, and the
// distance to the edge of the person in alpha. What belongs to the scene follows the photo, and what belongs
// to the camera (vignette, leak, date) follows the frame after the crop.
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uInput;
uniform sampler2D uScene;
uniform vec4 uRegion;
uniform vec2 uPixels;
uniform mat3 uToOutput;
uniform vec2 uOutSize;
uniform float uMix;
// Share of the long side that the distance in the scene covers on each side of the edge.
uniform float uSpan;
uniform vec2 uFace;
uniform float uFaceSize;

// x far, y beside the person, z reach, w how much lamps keep.
uniform vec4 uBack;
uniform float uBackSat;
uniform vec3 uBackTint;
uniform vec2 uBackSlope;
uniform vec3 uDuoLeft;
uniform vec3 uDuoRight;
uniform float uDuo;
// x strength, y size.
uniform vec2 uGlows;

// x person, y skin, z hair.
uniform vec3 uEv;
// x power, y pivot.
uniform vec2 uGamma;
uniform float uPersonSat;
uniform vec3 uPersonTint;
uniform float uSkinSat;
uniform vec3 uSkinTint;
// x at the edge, y away from it, z how far in that is.
uniform vec3 uShade;
// x stops, y radius, z knee.
uniform vec3 uFlash;

// x strength, y width, z hair, w whether strands are read.
uniform vec4 uRim;
uniform vec3 uRimColor;
// xy where the light comes from, z how much that counts.
uniform vec3 uRimFrom;
// The lamp behind the person: xy where it is, with the long side of the photo as the unit, and z how far it
// reaches. With no reach, the light comes evenly from all around.
uniform vec3 uRimLamp;
// x strength, y width.
uniform vec2 uHalo;
uniform vec3 uHaloColor;

uniform float uVignette;
uniform float uGrain;
uniform float uDust;
uniform float uFade;
uniform vec3 uTone;
// xy place in the frame, z size, w strength.
uniform vec4 uLeak;
uniform vec3 uLeakColor;
// The level of the blurred photo that strands are read against: the same share of the photo at any size.
uniform float uStrandLod;
uniform bool uStampOn;
uniform float uStamp[8];

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// Distance to the lit bars of one figure of seven bars, in a box one wide and two tall.
float sdDigit(vec2 p, int digit) {
  const int BARS[10] = int[10](0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F);
  int bars = BARS[clamp(digit, 0, 9)];
  float d = 1e3;
  if ((bars & 1) != 0) d = min(d, sdSegment(p, vec2(0.12, 2.0), vec2(0.88, 2.0)));
  if ((bars & 2) != 0) d = min(d, sdSegment(p, vec2(1.0, 1.88), vec2(1.0, 1.12)));
  if ((bars & 4) != 0) d = min(d, sdSegment(p, vec2(1.0, 0.88), vec2(1.0, 0.12)));
  if ((bars & 8) != 0) d = min(d, sdSegment(p, vec2(0.12, 0.0), vec2(0.88, 0.0)));
  if ((bars & 16) != 0) d = min(d, sdSegment(p, vec2(0.0, 0.88), vec2(0.0, 0.12)));
  if ((bars & 32) != 0) d = min(d, sdSegment(p, vec2(0.0, 1.88), vec2(0.0, 1.12)));
  if ((bars & 64) != 0) d = min(d, sdSegment(p, vec2(0.12, 1.0), vec2(0.88, 1.0)));
  return d;
}

// The date as a camera prints it: day, month and year in figures of seven bars. `t` runs along the text, one
// unit a figure, and up the figure from 0 to 1. Returns how lit the point is.
float stamp(vec2 t) {
  if (t.x < -0.5 || t.x > 10.5 || t.y < -0.5 || t.y > 1.5) return 0.0;
  float d = 1e3;
  for (int k = -1; k <= 1; k++) {
    int i = int(floor(t.x)) + k;
    if (i < 0 || i > 9) continue;
    // Each figure takes six tenths of its place, and is twice as tall as wide.
    vec2 p = vec2((t.x - float(i) - 0.2) / 0.6, t.y * 2.0);
    if (i == 2 || i == 5) d = min(d, sdSegment(p, vec2(0.15, 0.0), vec2(0.85, 2.0)));
    else d = min(d, sdDigit(p, int(uStamp[i < 2 ? i : i < 5 ? i - 1 : i - 2] + 0.5)));
  }
  return smoothstep(0.17, 0.09, d) + 0.35 * exp(-d * 3.5);
}

// Lights above the knee roll off toward white instead of stopping at it.
vec3 shoulder(vec3 c, float knee) {
  if (knee >= 0.999) return c;
  vec3 over = max(c - knee, 0.0) / (1.0 - knee);
  return min(c, vec3(knee)) + (1.0 - knee) * (1.0 - exp(-over));
}

void main() {
  vec4 src = texture(uInput, vUv);
  if (uMix <= 0.0) {
    outColor = src;
    return;
  }
  vec2 iuv = uRegion.xy + vUv * uRegion.zw;
  float longSide = max(uPixels.x, uPixels.y);
  vec2 asp = uPixels / longSide;
  // The photo with its long side as the unit, so a distance means the same along both axes.
  vec2 q = iuv * asp;

  vec4 scene = texture(uScene, iuv);
  float person = scene.r;
  float skin = scene.g;
  float hair = scene.b;
  float dist = (scene.a * 2.0 - 1.0) * uSpan;
  float inside = max(dist, 0.0) / uFaceSize;
  float outside = max(-dist, 0.0);

  vec3 lin = srgbToLinear(clamp(src.rgb, 0.0, 1.0));
  // How much a point stands out from what is around it: a strand of hair does, and a flat wall does not.
  float strands = uRim.w > 0.0 ? luma(src.rgb) - luma(textureLod(uInput, vUv, uStrandLod).rgb) : 0.0;

  /* The background */
  vec3 back = lin;
  if (uBackSat != 1.0) back = max(mix(vec3(luma(back)), back, uBackSat), 0.0);
  back *= uBackTint;
  if (uDuo > 0.0) {
    vec3 duo = mix(uDuoLeft, uDuoRight, smoothstep(0.15, 0.85, iuv.x));
    back = mix(back, duo * (luma(back) / max(luma(duo), 0.04)), uDuo);
  }
  float backEv = mix(uBack.y, uBack.x, smoothstep(0.0, max(uBack.z, 1e-4), outside)) + mix(uBackSlope.x, uBackSlope.y, iuv.y);
  float lamp = smoothstep(0.6, 0.97, max(src.r, max(src.g, src.b)));
  backEv *= 1.0 - uBack.w * lamp;
  back *= exp2(backEv);

  if (uGlows.x > 0.0) {
    // Points of light on a grid of the photo, a few cells lit, each with a streak under it as on wet ground.
    const float CELLS = 6.0;
    vec2 cell = floor(q * CELLS);
    vec3 glow = vec3(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 id = cell + vec2(float(i), float(j));
        vec2 rnd = hash22(id + 7.3);
        if (rnd.x > 0.3) continue;
        vec2 at = (id + 0.2 + 0.6 * hash22(id + 31.7)) / CELLS;
        float size = uGlows.y * (0.45 + 0.9 * rnd.y);
        vec2 d = q - at;
        float point = exp(-dot(d, d) / (size * size)) + 0.35 * exp(-dot(d, d) / (size * size * 9.0));
        float streak = d.y > 0.0 ? 0.3 * exp(-d.x * d.x / (size * size * 0.5)) * exp(-d.y / (size * 9.0)) : 0.0;
        vec3 tint = mix(uDuoLeft, uDuoRight, smoothstep(0.15, 0.85, at.x / asp.x));
        glow += (point + streak) * (tint + 0.35 * point);
      }
    }
    back += glow * uGlows.x * smoothstep(0.62, 0.3, iuv.y) * (1.0 - person);
  }
  // How much of the lamp behind the person reaches this point.
  float reach = 1.0;
  if (uRimLamp.z > 0.0) {
    vec2 d = (q - uRimLamp.xy) / uRimLamp.z;
    reach = 0.12 + exp(-dot(d, d));
  }
  if (uHalo.x > 0.0) {
    // The glow lights what is there, in its own color, more than it paints over it.
    // It starts past the edge: where dark hair meets a dark wall the edge is soft, and a glow there would be a gray band on the hair.
    float glow = uHalo.x * reach * exp(-outside / (uFaceSize * uHalo.y)) * smoothstep(0.0, 0.006, outside);
    back = back * (1.0 + 6.0 * glow) + uHaloColor * glow * 0.5;
  }
  if (uRim.w > 0.0 && uRim.x > 0.0) {
    // Loose hairs past the edge of the person take the light too, where there is hair close by.
    float close = textureLod(uScene, iuv, 4.0).b * exp(-outside / (uFaceSize * 0.3)) * smoothstep(0.0, 0.006, outside);
    back += uRimColor * uRim.x * uRim.z * reach * close * min(abs(strands) * 9.0, 1.6);
  }

  /* The person */
  vec3 lit = lin;
  if (person > 0.002) {
    if (skin > 0.0) {
      vec3 tinted = max(mix(vec3(luma(lit)), lit, uSkinSat), 0.0) * uSkinTint;
      lit = mix(lit, tinted, skin);
    }
    if (uPersonSat != 1.0) lit = max(mix(vec3(luma(lit)), lit, uPersonSat), 0.0);
    lit *= uPersonTint;

    // The body as a rounded shape: flat in the middle and turning away at the edge.
    float turn = clamp(inside * 2.0, 0.0, 1.0);
    float away = 1.0 - sqrt(1.0 - (1.0 - turn) * (1.0 - turn));
    float ev = uEv.x + uEv.y * skin + uEv.z * hair - uShade.x * away - uShade.y * smoothstep(0.0, max(uShade.z, 1e-4), inside);
    if (uFlash.x != 0.0) {
      vec2 d = (q - uFace * asp) / (uFaceSize * uFlash.y);
      ev += uFlash.x * exp(-dot(d, d));
    }
    lit *= exp2(ev);
    if (uGamma.x != 1.0) {
      float y = max(luma(lit), 1e-4);
      lit *= uGamma.y * pow(y / uGamma.y, uGamma.x) / y;
    }
    lit = shoulder(lit, uFlash.z);
  }

  // The soft edge of the person holds some of the background too. It goes with the background, so a person
  // made brighter gets no pale line around them.
  vec3 c = mix(back, lit, smoothstep(0.3, 0.9, person));

  if (uRim.x > 0.0) {
    // Light from behind: a thin line along the edge of the person, a glow on what is around, and further in a
    // softer light that comes through what is thin. It is uneven along the edge, as light through hair is.
    float depth = dist / uFaceSize;
    float line = depth > 0.0 ? exp(-depth / (uRim.y * 0.5)) : 0.4 * exp(depth / (uRim.y * 1.2));
    float through = depth > 0.0 ? exp(-depth / (uRim.y * 3.0)) : 0.0;
    // The light is for hair and skin. An edge of clothes takes little of it: the segmenter is least sure there,
    // and a wrong edge would be drawn in light.
    vec4 around = textureLod(uScene, iuv, 4.0);
    float takes = (0.2 + 0.8 * clamp(around.b * 1.8 + around.g * 1.3, 0.0, 1.0)) * (0.55 + 0.9 * valueNoise(q * 14.0)) * reach;
    if (uRimFrom.z > 0.0) {
      vec2 e = vec2(0.006, 0.0);
      float gx = textureLod(uScene, iuv + e.xy / asp, 2.0).a - textureLod(uScene, iuv - e.xy / asp, 2.0).a;
      float gy = textureLod(uScene, iuv + e.yx / asp, 2.0).a - textureLod(uScene, iuv - e.yx / asp, 2.0).a;
      vec2 g = vec2(gx, gy);
      // The distance grows inward, so the edge faces the other way.
      float facing = dot(-g / max(length(g), 1e-5), uRimFrom.xy);
      takes *= mix(1.0, smoothstep(-0.35, 0.75, facing), uRimFrom.z);
    }
    // In hair the light catches the strands that stand out, and leaves the mass of it dark.
    float caught = mix(1.0, clamp(0.05 + strands * 14.0, 0.0, 4.0), uRim.z * hair * person);
    // What comes through has the color of what it came through.
    vec3 own = clamp(c / max(luma(c), 0.02), 0.0, 3.0);
    c = c * (1.0 + 1.5 * uRim.x * through * takes) + uRimColor * uRim.x * takes * (line + 0.45 * through * caught * mix(vec3(1.0), own, 0.75));
  }

  /* The camera */
  vec2 st = (vec3(iuv, 1.0) * uToOutput).xy;
  float outLong = max(uOutSize.x, uOutSize.y);
  vec2 frame = st * uOutSize / outLong;
  vec2 corner = uOutSize / outLong;
  c *= uTone;
  if (uFade > 0.0) c = mix(c, vec3(0.045), uFade * (1.0 - smoothstep(0.0, 0.5, luma(c))));
  if (uLeak.w > 0.0) {
    // Taller than wide, as light that comes in by the side of the film.
    vec2 d = (frame - uLeak.xy * corner) / (uLeak.z * vec2(1.0, 2.4));
    float leak = exp(-dot(d, d));
    c += uLeak.w * leak * mix(uLeakColor, vec3(1.0), leak * leak);
  }
  if (uVignette > 0.0) {
    float v = smoothstep(0.35, 1.45, length((st - 0.5) * 2.0));
    c *= 1.0 - uVignette * 0.9 * v * v * (3.0 - 2.0 * v);
  }

  vec3 o = linearToSrgb(clamp(c, 0.0, 1.0));
  if (uGrain > 0.0) {
    vec2 p = q * 1500.0;
    float n = valueNoise(p) * 0.6 + valueNoise(p * 2.13 + 17.0) * 0.4 - 0.5;
    float l = luma(o);
    o += n * uGrain * 0.22 * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));
  }
  if (uDust > 0.0) {
    vec2 p = q * 70.0;
    vec2 id = floor(p);
    vec2 rnd = hash22(id + 3.1);
    if (rnd.x < uDust * 0.16) {
      vec2 d = p - id - (0.25 + 0.5 * hash22(id + 19.4));
      float size = 0.035 + 0.075 * rnd.y;
      o += 0.55 * smoothstep(size, size * 0.4, length(d));
    }
  }
  if (uStampOn) {
    const float TALL = 0.024;
    const float WIDE = 0.0175;
    const float EDGE = 0.045;
    // A tall frame is a camera held on its side: the date runs down the left edge. A wide one has it at the bottom right.
    vec2 t = corner.y > corner.x
      ? vec2((frame.y - (corner.y - EDGE * 1.6 - 10.0 * WIDE)) / WIDE, (frame.x - EDGE) / TALL)
      : vec2((frame.x - (corner.x - EDGE - 10.0 * WIDE)) / WIDE, (corner.y - EDGE - frame.y) / TALL);
    o = mix(o, vec3(1.0, 0.58, 0.16), clamp(stamp(t), 0.0, 1.0) * 0.92);
  }

  outColor = vec4(mix(src.rgb, clamp(o, 0.0, 1.0), uMix), src.a);
}
