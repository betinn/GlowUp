// Shared makeup blend: a color laid over the skin through the brush mask.
// 0 multiply, 1 soft light, 2 color (keeps lightness).
uniform vec3 uColor;
uniform float uOpacity;
uniform int uBlend;
uniform float uShine;

vec3 tool(vec3 c, float m) {
  vec3 b;
  if (uBlend == 0) {
    b = c * uColor;
  } else if (uBlend == 1) {
    b = softLight(c, uColor);
  } else {
    b = colorBlend(c, uColor);
  }
  vec3 r = mix(c, b, m * uOpacity);
  // Gloss for lips: keeps real highlights and lifts them a little.
  if (uShine > 0.0) {
    float l = luma(c);
    float spec = smoothstep(0.45, 0.92, l);
    r += spec * uShine * 0.3 * m;
  }
  return r;
}
