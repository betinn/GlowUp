// Skin smoothing by frequency separation.
// The guided filter replaces low and mid frequencies with an edge-aware version.
// The finest band (pores) is measured separately and added back.
uniform sampler2D uGuideA;
uniform sampler2D uGuideB;
uniform float uStrength;
uniform float uTexture;
uniform float uDetailRadius;

vec3 tool(vec3 c, float m) {
  vec2 o = uTexel * uDetailRadius;
  vec3 blur = c * 0.25;
  blur += (texture(uInput, vUv + vec2(o.x, 0.0)).rgb + texture(uInput, vUv - vec2(o.x, 0.0)).rgb +
           texture(uInput, vUv + vec2(0.0, o.y)).rgb + texture(uInput, vUv - vec2(0.0, o.y)).rgb) * 0.125;
  blur += (texture(uInput, vUv + o).rgb + texture(uInput, vUv - o).rgb +
           texture(uInput, vUv + vec2(o.x, -o.y)).rgb + texture(uInput, vUv + vec2(-o.x, o.y)).rgb) * 0.0625;
  vec3 detail = c - blur;

  vec3 a = texture(uGuideA, vUv).rgb;
  vec3 b = texture(uGuideB, vUv).rgb;
  vec3 smoothed = a * c + b;
  // Where the filter already kept the pixel (edges), detail is in there; add only the removed part.
  vec3 result = smoothed + (1.0 - a) * detail * uTexture;
  return mix(c, result, m * uStrength);
}
