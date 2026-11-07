// Shared color helpers. Pipeline values are gamma-encoded sRGB in 0..1.

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((max(c, 0.0) + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}

vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(0.0031308, c));
}

float labF(float t) { return t > 0.008856 ? pow(t, 1.0 / 3.0) : 7.787 * t + 16.0 / 116.0; }
float labInv(float t) { float c = t * t * t; return c > 0.008856 ? c : (t - 16.0 / 116.0) / 7.787; }

vec3 rgbToLab(vec3 c) {
  vec3 l = srgbToLinear(clamp(c, 0.0, 1.0));
  float x = dot(l, vec3(0.4124564, 0.3575761, 0.1804375)) / 0.95047;
  float y = dot(l, vec3(0.2126729, 0.7151522, 0.0721750));
  float z = dot(l, vec3(0.0193339, 0.1191920, 0.9503041)) / 1.08883;
  float fx = labF(x), fy = labF(y), fz = labF(z);
  return vec3(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz));
}

vec3 labToRgb(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  float fx = fy + lab.y / 500.0;
  float fz = fy - lab.z / 200.0;
  float x = labInv(fx) * 0.95047;
  float y = labInv(fy);
  float z = labInv(fz) * 1.08883;
  vec3 l = vec3(
    dot(vec3(x, y, z), vec3(3.2404542, -1.5371385, -0.4985314)),
    dot(vec3(x, y, z), vec3(-0.9692660, 1.8760108, 0.0415560)),
    dot(vec3(x, y, z), vec3(0.0556434, -0.2040259, 1.0572252))
  );
  return linearToSrgb(clamp(l, 0.0, 1.0));
}

vec3 rgbToHsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  if (d < 1e-5) return vec3(0.0, 0.0, l);
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h;
  if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  return vec3(h / 6.0, s, l);
}

float hueToRgb(float p, float q, float t) {
  t = fract(t);
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hslToRgb(vec3 c) {
  if (c.y < 1e-5) return vec3(c.z);
  float q = c.z < 0.5 ? c.z * (1.0 + c.y) : c.z + c.y - c.z * c.y;
  float p = 2.0 * c.z - q;
  return vec3(hueToRgb(p, q, c.x + 1.0 / 3.0), hueToRgb(p, q, c.x), hueToRgb(p, q, c.x - 1.0 / 3.0));
}

vec3 softLight(vec3 a, vec3 b) {
  vec3 d = mix(sqrt(a), ((16.0 * a - 12.0) * a + 4.0) * a, step(a, vec3(0.25)));
  return mix(a + (2.0 * b - 1.0) * (d - a), a - (1.0 - 2.0 * b) * a * (1.0 - a), step(b, vec3(0.5)));
}

// Recolors a pixel with the hue and chroma of `tint` while keeping its lightness.
vec3 colorBlend(vec3 base, vec3 tint) {
  vec3 b = rgbToLab(base);
  vec3 t = rgbToLab(tint);
  return labToRgb(vec3(b.x, t.y, t.z));
}

// Smooth bicubic sampling of a mip level with four bilinear taps: hides box-filter blockiness.
vec4 bicubicLod(sampler2D tex, vec2 uv, float lod) {
  vec2 size = vec2(textureSize(tex, int(ceil(lod))));
  vec2 st = uv * size - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f * f - 3.0 * f * f * f) / 6.0;
  vec2 w3 = f * f * f / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / size + 0.5 / size;
  vec2 h1 = (i + 1.5 + w3 / g1) / size + 0.5 / size;
  return g0.y * (g0.x * textureLod(tex, h0, lod) + g1.x * textureLod(tex, vec2(h1.x, h0.y), lod))
       + g1.y * (g0.x * textureLod(tex, vec2(h0.x, h1.y), lod) + g1.x * textureLod(tex, h1, lod));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
