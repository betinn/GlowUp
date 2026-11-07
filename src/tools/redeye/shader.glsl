// Red-eye: replaces the red channel where red clearly dominates, then deepens the pupil.
uniform float uStrength;
uniform float uDarken;

vec3 tool(vec3 c, float m) {
  float rest = (c.g + c.b) * 0.5;
  float excess = c.r - rest;
  float redness = smoothstep(0.03, 0.2, excess) * smoothstep(1.15, 1.6, c.r / max(rest, 0.02));
  float k = m * redness * uStrength;
  vec3 r = vec3(mix(c.r, rest, k), c.g, c.b);
  return r * (1.0 - k * uDarken * 0.65);
}
