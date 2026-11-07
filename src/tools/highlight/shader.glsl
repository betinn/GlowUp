// Highlighter: a gentle dodge plus a warm glow that spreads past the brush.
// Both work on blurred versions of the mask, so the result never has a painted edge.
uniform float uIntensity;
uniform float uGlow;
uniform float uSoftLod;
uniform float uGlowLod;

vec3 tool(vec3 c, float m) {
  float soft = bicubicLod(uMask, imageUv(), uSoftLod).r;
  float halo = bicubicLod(uMask, imageUv(), uGlowLod).r;
  float l = luma(c);
  float k = soft * 0.7 + halo * 0.3;
  // Dodge lifts midtones most and leaves shadows and clipped highlights alone.
  float lift = k * uIntensity * 0.3 * smoothstep(0.03, 0.5, l) * (1.0 - 0.6 * l);
  vec3 dodged = c * (1.0 + lift) + lift * 0.06;
  // Screen blend of the wide mask gives the bloom.
  vec3 tint = vec3(1.0, 0.97, 0.93);
  vec3 bloom = tint * halo * uGlow * 0.17 * (0.4 + 0.6 * l);
  return 1.0 - (1.0 - clamp(dodged, 0.0, 1.0)) * (1.0 - bloom);
}
