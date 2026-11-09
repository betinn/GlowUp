// On-screen pass: zoom and pan, crop geometry, before/after split, mask overlay, the light over the
// reach of the brush, and dithering. Exports never run it.
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uFinal;
uniform sampler2D uBefore;
uniform sampler2D uOverlay;
uniform sampler2D uField;
uniform vec2 uCanvas;
uniform vec2 uOrigin;
uniform vec2 uPerPixel;
uniform mat3 uToImage;
uniform vec2 uImageTexels;
uniform float uSplit;
uniform float uSplitX;
uniform float uOverlayMix;
uniform bool uHasField;
uniform vec3 uBackground;
uniform vec3 uOverlayColor;
uniform bool uRoiOn;
uniform vec4 uRoi;
uniform sampler2D uRoiFinal;
uniform sampler2D uRoiBefore;
uniform sampler2D uLimit;
uniform bool uMatteLine;
uniform sampler2D uMatte;
uniform float uGlow;
uniform float uSweep;
uniform float uBand;

vec3 sampleTex(sampler2D t, vec2 uv, vec2 duv) {
  // Two-by-two supersampling while minifying.
  if (max(duv.x, duv.y) < 1.25) return texture(t, uv).rgb;
  vec2 o = duv * 0.25 / uImageTexels;
  return 0.25 * (
    texture(t, uv + vec2(o.x, o.y)).rgb + texture(t, uv + vec2(-o.x, o.y)).rgb +
    texture(t, uv + vec2(o.x, -o.y)).rgb + texture(t, uv + vec2(-o.x, -o.y)).rgb
  );
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 st = uOrigin + px * uPerPixel;
  vec2 uv = (vec3(st, 1.0) * uToImage).xy;
  bool insideOut = all(greaterThanEqual(st, vec2(0.0))) && all(lessThanEqual(st, vec2(1.0)));
  bool insideImg = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  if (!insideImg || !insideOut) {
    outColor = vec4(uBackground, 1.0);
    return;
  }
  vec2 duv = abs(fwidth(uv)) * uImageTexels;
  bool before = uSplit > 1.5 || (uSplit >= 0.0 && px.x < uSplitX);
  vec3 c;
  vec2 roiUv = (uv - uRoi.xy) / uRoi.zw;
  if (uRoiOn && all(greaterThanEqual(roiUv, vec2(0.0))) && all(lessThanEqual(roiUv, vec2(1.0)))) {
    // Sharp version of the visible area, rendered from the original at its real resolution.
    c = before ? texture(uRoiBefore, roiUv).rgb : texture(uRoiFinal, roiUv).rgb;
  } else {
    c = before ? sampleTex(uBefore, uv, duv) : sampleTex(uFinal, uv, duv);
  }
  vec2 muv = uv;
  if (uHasField) muv += texture(uField, uv).xy;
  if (uOverlayMix > 0.0 && !before) {
    float m = textureLod(uOverlay, muv, 0.0).r;
    c = mix(c, uOverlayColor, m * uOverlayMix);
  }
  if (uGlow > 0.0 && !before) {
    // Cool light, never the orange of the brush mark, with a band crossing the screen.
    float m = textureLod(uLimit, muv, 0.0).r;
    float d = (px.x + px.y) / (uCanvas.x + uCanvas.y);
    float band = exp(-pow((d - uSweep) / 0.07, 2.0)) * uBand;
    // Light is added, not mixed, so the colors under it stay readable. The soft edge of the limit
    // turns into a bright line around what the brush can reach.
    float rim = smoothstep(0.08, 0.3, m) * (1.0 - smoothstep(0.55, 0.9, m));
    vec3 cool = vec3(0.78, 0.9, 1.0);
    c += cool * m * uGlow * (0.22 + 0.55 * band);
    c = mix(c, vec3(0.93, 0.98, 1.0), min(1.0, rim * uGlow * 1.4));
  }
  if (uMatteLine && !before) {
    // A thin line along the edge of the person, on the photo as it was opened. It never reaches an export.
    float m = textureLod(uMatte, uv, 0.0).r;
    float w = fwidth(m);
    float line = 1.0 - smoothstep(0.0, max(w, 1e-4) * 1.2, abs(m - 0.5));
    c = mix(c, vec3(0.45, 0.95, 1.0), line * 0.9);
  }
  // Triangular dither hides banding from 16-bit buffers on an 8-bit display.
  float n = hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.yx + 7.0) - 1.0;
  outColor = vec4(c + n / 255.0, 1.0);
}
