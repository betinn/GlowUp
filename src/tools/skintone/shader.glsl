// Skin tone: hue, saturation and lightness in Lab, limited to the mask.
uniform float uHue;
uniform float uSaturation;
uniform float uLightness;

vec3 tool(vec3 c, float m) {
  vec3 lab = rgbToLab(c);
  float ca = cos(uHue);
  float sa = sin(uHue);
  vec2 ab = vec2(lab.y * ca - lab.z * sa, lab.y * sa + lab.z * ca) * (1.0 + uSaturation);
  float l = lab.x + uLightness * 16.0 * (1.0 - abs(lab.x / 50.0 - 1.0) * 0.6);
  return mix(c, labToRgb(vec3(l, ab)), m);
}
