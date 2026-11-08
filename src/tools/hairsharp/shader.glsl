// Sharper strands: the fine detail of the photo, about one strand wide, added again on the lightness
// only, so edges get no colored halo. Tiny differences are grain and stay as they are.
uniform sampler2D uLow;
uniform float uLowLod;
uniform float uAmount;

vec3 tool(vec3 c, float m) {
  vec3 lab = rgbToLab(c);
  float k = m * uAmount;
  float detail = rgbToLab(texture(uLow, vUv).rgb).x - rgbToLab(bicubicLod(uLow, vUv, uLowLod).rgb).x;
  detail *= smoothstep(0.3, 1.2, abs(detail));
  lab.x = clamp(lab.x + detail * 2.2 * k, 0.0, 100.0);
  return labToRgb(lab);
}
