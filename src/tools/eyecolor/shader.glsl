// Eye color: replaces hue and chroma in Lab and keeps the lightness, so iris fibers stay.
// The mask holds the whole iris, with the pupil and the glints of light on it. A glint is light the eye
// reflects, not color of the iris: it shows as brighter than the iris around it, or as plain white. It
// stays as bright as it was and loses the old color with the rest, so it sits white on the new color.
uniform sampler2D uLow;
uniform float uLowLod;
uniform vec3 uColor;
uniform float uAmount;
uniform float uLift;

float lightnessAt(float lod) {
  return rgbToLab(bicubicLod(uLow, vUv, max(0.0, lod)).rgb).x;
}

vec3 tool(vec3 c, float m) {
  vec3 lab = rgbToLab(c);
  vec3 t = rgbToLab(uColor);
  // The iris around this pixel, at three sizes: a wide glint needs the widest, and in a small eye the widest
  // reaches the white of the eye. The darkest of them stands for the iris.
  float around = min(lightnessAt(uLowLod - 1.5), min(lightnessAt(uLowLod), lightnessAt(uLowLod + 1.5)));
  float glint = max(smoothstep(72.0, 94.0, lab.x), smoothstep(8.0, 26.0, lab.x - around));
  float k = m * uAmount;
  // What is lit enough to show a color. The pupil, lashes over the iris and the shadow of the lid are not:
  // they take no new color, and lose the old one, so no patch of it is left on the new iris.
  float lit = smoothstep(7.0, 20.0, lab.x) * (1.0 - glint);
  // Darker fibers take less chroma, like real pigment. Light a glint adds is not lightness of the fiber under it.
  float fiber = min(lab.x, around);
  lab.yz = mix(lab.yz, t.yz * (0.45 + 0.75 * clamp(fiber / 55.0, 0.0, 1.0)) * lit, k);
  lab.x += ((t.x - lab.x) * 0.26 + uLift * 7.0) * k * lit;
  return labToRgb(lab);
}
