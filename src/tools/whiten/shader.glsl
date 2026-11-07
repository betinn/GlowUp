// Whitening: pulls the Lab b channel away from yellow and lifts lightness.
uniform float uWhiten;
uniform float uBright;

vec3 tool(vec3 c, float m) {
  vec3 lab = rgbToLab(c);
  // Shadows inside the mouth stay dark.
  float keep = smoothstep(12.0, 48.0, lab.x);
  float k = m * keep;
  lab.z -= max(lab.z, 0.0) * uWhiten * 0.72 * k;
  lab.y -= lab.y * uWhiten * 0.25 * k;
  lab.x += (100.0 - lab.x) * uBright * 0.4 * k;
  return labToRgb(lab);
}
