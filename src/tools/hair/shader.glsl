// Hair: recolor keeping the luminance structure, darken, or add depth between strands.
// Mode: 0 color, 1 darken, 2 depth.
uniform sampler2D uLow;
uniform float uLowLod;
uniform int uMode;
uniform vec3 uColor;
uniform float uAmount;

vec3 tool(vec3 c, float m) {
  vec3 lab = rgbToLab(c);
  float k = m * uAmount;
  if (uMode == 0) {
    vec3 t = rgbToLab(uColor);
    // Chroma scales with lightness so dark strands do not turn neon.
    vec2 ab = t.yz * (0.35 + 0.85 * clamp(lab.x / 45.0, 0.0, 1.0));
    lab.yz = mix(lab.yz, ab, k);
    // A small pull toward the target lightness lets dark hair take a lighter color.
    lab.x += (t.x - lab.x) * 0.22 * k;
    return labToRgb(lab);
  }
  if (uMode == 1) {
    lab.x *= 1.0 - 0.55 * k;
    lab.yz *= 1.0 - 0.2 * k;
    return labToRgb(lab);
  }
  float low = rgbToLab(bicubicLod(uLow, vUv, uLowLod).rgb).x;
  float strand = lab.x - low;
  lab.x += strand * 1.4 * k;
  lab.x -= 5.0 * k * (1.0 - smoothstep(20.0, 60.0, lab.x));
  lab.yz *= 1.0 + 0.15 * k;
  return labToRgb(lab);
}
