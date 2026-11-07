// Eye sparkle: local contrast and sharpening in the iris.
uniform sampler2D uLow;
uniform float uLowLod;
uniform float uContrast;
uniform float uSharp;
uniform float uRadius;

vec3 tool(vec3 c, float m) {
  vec2 o = uTexel * uRadius;
  vec3 blur = (texture(uInput, vUv + vec2(o.x, 0.0)).rgb + texture(uInput, vUv - vec2(o.x, 0.0)).rgb +
               texture(uInput, vUv + vec2(0.0, o.y)).rgb + texture(uInput, vUv - vec2(0.0, o.y)).rgb) * 0.25;
  float detail = luma(c) - luma(blur);
  float wide = luma(c) - luma(bicubicLod(uLow, vUv, uLowLod).rgb);
  float l = luma(c);
  float gain = detail * uSharp * 3.2 + wide * uContrast * 1.1;
  gain = gain / (1.0 + abs(gain) * 3.0);
  return c + vec3(gain + 0.05 * uContrast * smoothstep(0.1, 0.5, l)) * m;
}
