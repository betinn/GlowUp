// Luzes: the light of the scene made again, between the developed photo and the stickers.
//
// The light falls by depth, as a real one does: what is at the depth of the subject takes it, what is far loses
// it, and there is no line between the two but the edges the photo itself has. `uScene` holds the matte of the
// person in red, their skin in green, their hair in blue and the shade of the skin in alpha. `uField` holds the
// depth on the person's side of their edge in red, the depth on the other side in green, and the matte blurred a
// little and blurred wide in blue and alpha. What belongs to the scene follows the photo, and what belongs to
// the camera (vignette, leak, grain, date) follows the frame after the crop.
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uInput;
uniform sampler2D uScene;
uniform sampler2D uField;
uniform vec4 uRegion;
uniform vec2 uPixels;
uniform mat3 uToOutput;
uniform vec2 uOutSize;
uniform float uMix;

// x and y: the depths between which the light arrives. z and w: the matte between which a point goes from the
// background's light to the person's.
uniform vec4 uFall;
// Stops: x far, y at the subject, z per unit of depth nearer than the subject. w: how much lamps keep.
uniform vec4 uEv;
// Stops: x on skin, y on hair, z for the whole of the shade of the skin.
uniform vec4 uPart;
// Saturation: x far, y at the subject, z of skin.
uniform vec3 uSat;
uniform vec3 uFarTint;
uniform vec3 uNearTint;
uniform vec3 uSkinTint;
uniform vec3 uDuoLeft;
uniform vec3 uDuoRight;
uniform float uDuo;

// The lamp behind the person: xy where it is, with the long side of the photo as the unit, z how far its core
// reaches, w how many of those reaches the strands still take light.
uniform vec4 uLamp;
// x core on what is around the person, y soft light that hugs them, z strands of hair, w whether there is a lamp.
uniform vec4 uGlow;
uniform vec3 uGlowColor;
uniform vec3 uStrandColor;
// The level of the blurred photo that strands are read against: the same share of the photo at any size.
uniform float uStrandLod;

// x contrast, y its pivot, z what falls to black, w where lights roll off.
uniform vec4 uCurve;
uniform vec3 uLift;
// x strength, y height of its middle in the frame.
uniform vec2 uVignette;
uniform float uGrain;
// xy place in the frame, z size, w strength.
uniform vec4 uLeak;
// rgb color, a how much taller than wide.
uniform vec4 uLeakColor;
uniform bool uStampOn;
uniform float uStamp[8];

// The byte of the shade of the skin, as a share of its range: -1 to 1.
float shadeOf(float a) {
  return (a * 255.0 - 127.5) / 127.5;
}

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

// The stops a point at this depth takes, and in y how much it is with the subject.
vec2 fall(float depth) {
  float near = smoothstep(uFall.x, uFall.y, depth);
  return vec2(mix(uEv.x, uEv.y, near) + uEv.z * clamp(depth - 1.0, 0.0, 1.0), near);
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
  vec4 field = texture(uField, iuv);
  float matte = scene.r;
  float skin = scene.g;
  float hair = scene.b;

  vec3 lin = srgbToLinear(clamp(src.rgb, 0.0, 1.0));
  float y = luma(lin);

  /* Where the light falls */
  vec2 front = fall(field.r);
  vec2 behind = fall(field.g);
  // The soft edge of the matte goes with the background: a strand lit a little less does not show, and a
  // background lit a little more is a halo around the person.
  float side = smoothstep(uFall.z, uFall.w, matte);
  float ev = mix(behind.x, front.x, side);
  float near = mix(behind.y, front.y, side);
  if (uEv.w > 0.0) {
    float lamp = smoothstep(0.8, 0.98, max(src.r, max(src.g, src.b))) * (1.0 - near);
    ev *= 1.0 - uEv.w * lamp;
  }
  ev += uPart.x * skin + uPart.y * hair + uPart.z * skin * shadeOf(scene.a);

  vec3 c = max(mix(vec3(y), lin, mix(uSat.x, uSat.y, near)), 0.0) * mix(uFarTint, uNearTint, near);
  if (uDuo > 0.0) {
    vec3 duo = mix(uDuoLeft, uDuoRight, smoothstep(0.15, 0.85, iuv.x));
    vec3 wash = duo * (luma(c) / max(luma(duo), 0.04));
    c = mix(c, wash, uDuo * (1.0 - 0.6 * near));
  }
  if (skin > 0.0) {
    vec3 toned = max(mix(vec3(luma(c)), c, uSat.z), 0.0) * uSkinTint;
    c = mix(c, toned, skin);
  }
  c *= exp2(ev);

  /* The lamp behind the person */
  if (uGlow.w > 0.0) {
    vec2 d = (q - uLamp.xy) / uLamp.z;
    float d2 = dot(d, d);
    float core = exp(-d2);
    float reach = exp(-d2 / (uLamp.w * uLamp.w));
    float wide = field.a;
    // Its light is one smooth field over the edge of the person: all of it on what is around them, fading a
    // little way into them, so no line shows where the matte ends.
    float over = 1.0 - smoothstep(0.5, 0.88, wide);
    float hug = (1.0 - smoothstep(0.3, 0.6, wide)) * clamp(wide * 5.0, 0.0, 1.0);
    float bloom = uGlow.x * core * over + uGlow.y * reach * hug;
    // Near the lamp the light burns whatever it falls on, a dark shadow as much as a pale wall.
    c = c * (1.0 + 4.0 * bloom) + uGlowColor * bloom * 2.0;
    if (uGlow.z > 0.0) {
      // In hair near the edge the strands that stand out take the light, and the gaps between them stay dark.
      float fine = luma(srgbToLinear(clamp(textureLod(uInput, vUv, max(uStrandLod - 3.0, 0.0)).rgb, 0.0, 1.0)));
      float local = luma(srgbToLinear(clamp(textureLod(uInput, vUv, uStrandLod).rgb, 0.0, 1.0)));
      float strand = clamp((fine / max(local, 0.01) - 0.75) * 2.5, 0.0, 1.6);
      // An edge of the matte counts only where it is an edge in depth too.
      float real = smoothstep(0.03, 0.2, field.r - field.g);
      float band = (1.0 - smoothstep(0.5, 0.82, wide)) * smoothstep(0.25, 0.5, wide);
      // What comes through has some of the color of what it came through.
      vec3 own = clamp(lin / max(y, 0.02), 0.0, 3.0);
      // Only what is surely the person: at the very edge a point is part background, and a bright wall there
      // would pass for a strand and draw a line around the person.
      float solid = smoothstep(0.75, 1.0, matte);
      c += uStrandColor * (0.5 + 0.5 * own) * (uGlow.z * reach * band * (0.1 + 0.9 * hair) * strand * real * solid);
    }
  }

  /* The film */
  if (uCurve.x != 1.0) {
    float yc = max(luma(c), 1e-5);
    c *= uCurve.y * pow(yc / uCurve.y, uCurve.x) / yc;
  }
  // A toe: what is darker than this falls away, and the rest hardly moves.
  if (uCurve.z > 0.0) c = c * c / (c + uCurve.z);
  // Lights above the knee roll off toward white instead of stopping at it.
  if (uCurve.w < 0.999) {
    vec3 over = max(c - uCurve.w, 0.0) / (1.0 - uCurve.w);
    c = min(c, vec3(uCurve.w)) + (1.0 - uCurve.w) * (1.0 - exp(-over));
  }
  c += uLift * (1.0 - smoothstep(0.0, 0.25, luma(c)));

  /* The camera */
  vec2 st = (vec3(iuv, 1.0) * uToOutput).xy;
  float outLong = max(uOutSize.x, uOutSize.y);
  vec2 frame = st * uOutSize / outLong;
  vec2 corner = uOutSize / outLong;
  if (uLeak.w > 0.0) {
    // Taller than wide, as light that comes in by the side of the film.
    vec2 d = (frame - uLeak.xy * corner) / (uLeak.z * vec2(1.0, uLeakColor.a));
    float leak = exp(-dot(d, d));
    c += uLeak.w * leak * mix(uLeakColor.rgb, vec3(1.0), leak * leak);
  }
  if (uVignette.x > 0.0) {
    float v = smoothstep(0.35, 1.45, length((st - vec2(0.5, uVignette.y)) * 2.0));
    c *= 1.0 - uVignette.x * 0.9 * v;
  }

  vec3 o = linearToSrgb(clamp(c, 0.0, 1.0));
  if (uGrain > 0.0) {
    // Grain the size of the frame, not of the pixel: the screen and the file get the same.
    vec2 p = frame * 1300.0;
    float n = valueNoise(p) * 0.6 + valueNoise(p * 2.13 + 17.0) * 0.4 - 0.5;
    float l = luma(o);
    o += n * uGrain * 0.28 * (0.4 + 0.6 * (1.0 - abs(l * 2.0 - 1.0)));
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
