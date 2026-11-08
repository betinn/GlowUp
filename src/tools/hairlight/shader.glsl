// Lighter hair. The local tone goes up by one amount, so every strand keeps its difference to its
// neighbors and the texture stays. Dark hair shows warm pigment when it lightens, as it does for real.
uniform sampler2D uLow;
uniform float uLowLod;
uniform float uAmount;
uniform float uWarmth;

vec3 tool(vec3 c, float m) {
  vec3 lab = rgbToLab(c);
  float k = m * uAmount;
  float low = clamp(rgbToLab(bicubicLod(uLow, vUv, uLowLod).rgb).x, 0.0, 96.0);
  lab.x = min(lab.x + (96.0 - low) * 0.5 * k, 99.0);
  float dark = 1.0 - clamp(low / 70.0, 0.0, 1.0);
  lab.y += 6.0 * k * dark * uWarmth;
  lab.z += 16.0 * k * dark * uWarmth;
  return labToRgb(lab);
}
