// Procedural freckles, scattered in image space, so they stay put at any resolution. Three layers of
// different sizes, each on its own turned grid with fully random positions and most cells empty, so no
// row or spacing shows. The mask does not fade the dots: it says how likely a dot is, read where the dot
// sits, so freckles thin out toward the edges of an area instead of turning pale.
uniform float uAmount;
uniform float uSize;
uniform float uVariation;
uniform float uOpacity;
uniform vec2 uAspect;
uniform vec3 uTint;
// How much of each layer this kind of freckle has: tiny, medium, large.
uniform vec3 uLayers;
uniform float uClump;
uniform float uDeep;

float blotches(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Patches where freckles gather and patches they skip, in two sizes.
float gather(vec2 at) {
  float scale = 1.0 / (uSize * 26.0);
  float n = blotches(at * scale + 3.7) * 0.65 + blotches(at * scale * 2.3 + 11.1) * 0.35;
  return mix(1.0, smoothstep(0.3, 0.68, n), uClump);
}

// Returns how much of a dot covers this point (x) and how deep its color is (y).
vec2 scatter(vec2 p, float cell, float angle, float chance, float size, float seed, float px) {
  float s = sin(angle);
  float k = cos(angle);
  mat2 turn = mat2(k, -s, s, k);
  mat2 back = mat2(k, s, -s, k);
  vec2 q = turn * p / cell;
  vec2 id = floor(q);
  vec2 best = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = id + vec2(float(x), float(y));
      vec2 h = hash22(c + seed);
      vec2 at = back * ((c + h) * cell);
      float here = textureLod(uMask, at / uAspect, 0.0).r;
      float likely = chance * smoothstep(0.02, 0.85, here) * gather(at);
      if (hash12(c * 1.7 + seed) >= likely) continue;
      float pick = hash12(c + seed * 3.1);
      float r = size * mix(1.0, 0.55 + 1.5 * pick * pick * pick, uVariation);
      vec2 d = p - at;
      float a = atan(d.y, d.x);
      // Not stamped: stretched, turned and with an uneven edge, each in its own way.
      float t = pick * 6.2831;
      vec2 e = mat2(cos(t), -sin(t), sin(t), cos(t)) * d;
      e.y *= 1.0 + 0.6 * h.x;
      float len = length(e) * (1.0 + 0.2 * sin(a * 3.0 + t) + 0.1 * sin(a * 5.0 + h.y * 6.2831));
      float dot1 = 1.0 - smoothstep(r * 0.15, r + px, len);
      // Smaller than a pixel, a dot darkens that pixel only a little.
      dot1 *= min(1.0, (r * r) / (px * px));
      float strength = dot1 * mix(0.85, 0.3 + 0.7 * h.y, uVariation);
      if (strength > best.x) best = vec2(strength, 0.65 + 0.7 * pick);
    }
  }
  return best;
}

vec3 tool(vec3 c, float m) {
  vec2 p = imageUv() * uAspect;
  float px = max(length(fwidth(p)) * 0.7, 1e-6);
  vec2 f = scatter(p, uSize * 3.6, 0.61, uAmount * uLayers.x, uSize * 0.5, 11.0, px);
  vec2 g = scatter(p, uSize * 6.3, 1.93, uAmount * uLayers.y, uSize, 29.0, px);
  if (g.x > f.x) f = g;
  g = scatter(p, uSize * 13.0, 2.71, uAmount * uLayers.z, uSize * 1.8, 47.0, px);
  if (g.x > f.x) f = g;
  // Pigment darkens and warms, keeping the skin detail underneath. Each dot has its own depth.
  vec3 pigment = c * pow(uTint, vec3(uDeep * f.y));
  return mix(c, pigment, f.x * smoothstep(0.0, 0.04, m) * uOpacity);
}
