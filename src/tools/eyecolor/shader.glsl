// Eye color: replaces hue and chroma in Lab and keeps the lightness, so iris fibers stay.
// Pupil and catchlights are left alone by their lightness.
uniform vec3 uColor;
uniform float uAmount;
uniform float uLift;

vec3 tool(vec3 c, float m) {
  vec3 lab = rgbToLab(c);
  vec3 t = rgbToLab(uColor);
  float iris = smoothstep(7.0, 20.0, lab.x) * (1.0 - smoothstep(80.0, 94.0, lab.x));
  float k = m * uAmount * iris;
  // Darker fibers take less chroma, like real pigment.
  vec2 ab = t.yz * (0.45 + 0.75 * clamp(lab.x / 55.0, 0.0, 1.0));
  lab.yz = mix(lab.yz, ab, k);
  lab.x += (t.x - lab.x) * 0.12 * k + uLift * 7.0 * k;
  return labToRgb(lab);
}
