// One sticker of Brincar over the developed photo, before the last stage. The art comes with its color already
// multiplied by its cover, so its soft edges blend with no dark line. Only the box of the sticker is written.
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uInput;
uniform sampler2D uArt;
uniform vec4 uRegion;
// The middle of the sticker in image UV, and the two rows that take an offset from it to the UV of the art.
uniform vec2 uCenter;
uniform vec2 uRowX;
uniform vec2 uRowY;

void main() {
  vec4 c = texture(uInput, vUv);
  vec2 d = uRegion.xy + vUv * uRegion.zw - uCenter;
  vec2 a = vec2(dot(uRowX, d), dot(uRowY, d)) + 0.5;
  if (a.x < 0.0 || a.y < 0.0 || a.x > 1.0 || a.y > 1.0) {
    outColor = c;
    return;
  }
  vec4 s = texture(uArt, a);
  // The alpha of this stage says how much of the filter the pixel took, and a sticker takes none.
  outColor = vec4(s.rgb + c.rgb * (1.0 - s.a), c.a * (1.0 - s.a));
}
