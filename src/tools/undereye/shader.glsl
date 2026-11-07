// Under-eye correction. Compares the low frequencies under the brush with the surrounding skin
// (a membrane built from what is outside the mask) and moves toward it.
// Only low frequencies change, so pores and fine lines stay.
uniform sampler2D uLow;
uniform sampler2D uFill;
uniform float uLowLod;
uniform float uLight;
uniform float uTone;

vec3 tool(vec3 c, float m) {
  vec3 low = bicubicLod(uLow, vUv, uLowLod).rgb;
  vec4 f = bicubicLod(uFill, vUv, 0.0);
  vec3 target = f.rgb / max(f.a, 1e-3);

  vec3 labLow = rgbToLab(low);
  vec3 labTarget = rgbToLab(target);
  vec3 lab = rgbToLab(c);
  lab.x += max(labTarget.x - labLow.x, 0.0) * uLight * m;
  lab.yz += (labTarget.yz - labLow.yz) * uTone * m;
  return labToRgb(lab);
}
