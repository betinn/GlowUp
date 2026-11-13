// Fox eye: a sharp line over a smoked corner, from one mask. The automatic mode draws the smoke at half
// strength and the line at full, so the mask tells them apart: up to the middle it is smoke, past it the line.
uniform vec3 uColor;
uniform vec3 uShade;
uniform float uOpacity;
uniform float uSmoke;

vec3 tool(vec3 c, float m) {
  float smoke = smoothstep(0.0, 0.5, m) * uSmoke;
  vec3 r = mix(c, c * uShade, smoke);
  float line = smoothstep(0.55, 0.9, m) * uOpacity;
  return mix(r, c * uColor, line);
}
