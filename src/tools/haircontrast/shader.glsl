// Contrast of the hair at two sizes: each strand against its neighbors, and shine against shade across
// the hair. More gives volume, less makes the hair look soft. Amount goes from -1 to 1.
uniform sampler2D uLow;
uniform float uFineLod;
uniform float uBroadLod;
uniform float uAmount;

vec3 tool(vec3 c, float m) {
  vec3 lab = rgbToLab(c);
  float k = m * uAmount * (uAmount > 0.0 ? 1.0 : 0.7);
  float fine = rgbToLab(bicubicLod(uLow, vUv, uFineLod).rgb).x;
  float broad = rgbToLab(bicubicLod(uLow, vUv, uBroadLod).rgb).x;
  lab.x += (lab.x - fine) * 1.1 * k + (fine - broad) * 0.8 * k;
  lab.x = clamp(lab.x, 0.0, 100.0);
  lab.yz *= 1.0 + 0.1 * k;
  return labToRgb(lab);
}
