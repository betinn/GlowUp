// Longer hair. In each column of the photo the end of the hair is found in the mask, and the last
// stretch of hair above it is drawn stretched down past it, so the same strands, colors and shine
// carry on below. The new ends fade at a different height in each strand, as real tips do.
// Lengths are in image heights, and every lookup runs in image UV, so preview, zoom and export agree.
uniform float uGrow;
uniform float uBand;
uniform float uTips;
uniform vec2 uImage;

const int STEPS = 48;

float hairAt(float x, float y) {
  return textureLod(uMask, vec2(x, y), 0.0).r;
}

vec3 tool(vec3 c, float m) {
  if (uGrow <= 0.0) return c;
  vec2 p = imageUv();
  // An end at `tip` touches this pixel when the pixel lies between tip - band and tip + grow.
  float top = p.y - uGrow;
  float step = (uGrow + uBand) / float(STEPS);
  float tip = -1.0;
  float prev = hairAt(p.x, top);
  for (int i = 1; i <= STEPS; i++) {
    float y = top + step * float(i);
    float h = hairAt(p.x, y);
    // Hair above, none below: an end. The lowest one wins.
    if (prev >= 0.5 && h < 0.5) tip = y - step * (0.5 - h) / max(prev - h, 1e-3);
    prev = h;
  }
  if (tip < 0.0) return c;
  float from = tip - uBand;
  float s = (uBand + uGrow) / uBand;
  float y = from + (p.y - from) / s;
  float alpha = smoothstep(0.15, 0.7, hairAt(p.x, y));
  float past = (p.y - tip) / uGrow;
  if (past > 0.0) {
    // Strands about two pixels of the original photo wide, each with its own length.
    float strand = hash12(vec2(floor(p.x * uImage.x / 2.0), 17.0));
    float soft = mix(0.08, 0.6, uTips);
    float end = 1.0 - soft * strand;
    alpha *= 1.0 - smoothstep(end - soft, end, past);
  }
  vec2 src = (vec2(p.x, y) - uRegion.xy) / uRegion.zw;
  vec3 hair = texture(uInput, src).rgb;
  return mix(c, hair, alpha);
}
