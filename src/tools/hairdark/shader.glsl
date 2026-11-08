// Darker hair. Shade and midtones go down more than the shine, so the hair keeps its gloss.
uniform float uAmount;

vec3 tool(vec3 c, float m) {
  vec3 lab = rgbToLab(c);
  float k = m * uAmount;
  float shine = smoothstep(45.0, 85.0, lab.x);
  lab.x *= 1.0 - k * mix(0.65, 0.35, shine);
  // Dark hair holds less color, or it would look dyed.
  lab.yz *= 1.0 - 0.25 * k;
  return labToRgb(lab);
}
