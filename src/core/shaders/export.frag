// Resamples the finished image into an output tile, with crop geometry and dithering.
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uInput;
uniform mat3 uToImage;
uniform vec4 uRegion;
uniform vec4 uTile;

void main() {
  vec2 st = uTile.xy + vUv * uTile.zw;
  vec2 iuv = (vec3(st, 1.0) * uToImage).xy;
  vec2 uv = (iuv - uRegion.xy) / uRegion.zw;
  vec3 c = texture(uInput, uv).rgb;
  float n = hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.yx + 7.0) - 1.0;
  outColor = vec4(c + n / 255.0, 1.0);
}
