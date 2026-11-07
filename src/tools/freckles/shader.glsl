// Procedural freckles. Dots are placed on a jittered grid in image space, so they stay put at any
// resolution. The brush only says where they appear.
uniform float uDensity;
uniform float uSize;
uniform float uVariation;
uniform float uOpacity;
uniform vec2 uAspect;
uniform vec3 uTint;

float layer(vec2 p, float cell, float chance, float seed) {
  vec2 q = p / cell;
  vec2 id = floor(q);
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = id + vec2(float(x), float(y));
      vec2 h = hash22(c + seed);
      float alive = step(hash12(c * 1.7 + seed), chance);
      vec2 center = c + 0.15 + 0.7 * h;
      float pick = hash12(c + seed * 3.1);
      // Few big ones, many small ones.
      float size = uSize * mix(1.0, 0.45 + 1.1 * pick * pick, uVariation);
      vec2 d = (q - center) * cell;
      // Slight stretch and rotation so they do not look stamped.
      float ang = pick * 6.2831;
      d = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d * vec2(1.0, 1.0 + 0.5 * h.x);
      float dot1 = 1.0 - smoothstep(size * 0.35, size, length(d));
      float strength = mix(1.0, 0.35 + 0.65 * h.y, uVariation);
      sum = max(sum, dot1 * strength * alive);
    }
  }
  return sum;
}

vec3 tool(vec3 c, float m) {
  vec2 p = imageUv() * uAspect;
  float cell = uSize * 3.4;
  float f = layer(p, cell, uDensity, 11.0);
  f = max(f, layer(p + 0.37 * cell, cell * 1.6, uDensity * 0.45, 29.0) * 0.8);
  // Pigment darkens and warms, keeping the skin detail underneath.
  vec3 pigment = c * uTint;
  return mix(c, pigment, f * m * uOpacity);
}
