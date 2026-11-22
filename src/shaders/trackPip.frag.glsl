// ============================================================================
// Live Picture-in-Picture Ping-Pong Track FBO Visualizer
// R = Carved Trench (Red/Magenta), G = Flanking Berm (Emerald), B = Ice Glint (Cyan)
// ============================================================================

precision highp float;

uniform sampler2D uTrackTex;
uniform vec2 uSunDirXZ;
varying vec2 vUv;

void main() {
  vec4 t = texture2D(uTrackTex, vUv);

  // Subtle dark slate grid background for spatial scale reading (every 4m)
  vec2 grid = abs(fract(vUv * 12.0 - 0.5) - 0.5) / 0.04;
  float gridLine = 1.0 - min(min(grid.x, grid.y), 1.0);
  vec3 bg = vec3(0.055, 0.085, 0.135) + vec3(0.045, 0.075, 0.12) * gridLine;

  // Vivid channel-separated FBO visualization (easy to read at a glance!)
  vec3 col = bg;
  float rVal = clamp(t.r * 1.65, 0.0, 1.0);
  float gVal = clamp(t.g * 1.55, 0.0, 1.0);
  float bVal = clamp(t.b * 1.15, 0.0, 1.0);
  col = mix(col, vec3(0.10, 0.96, 0.52), gVal * 0.92);                 // G: Flanking berms
  col = mix(col, vec3(1.00, 0.20, 0.34), rVal * 0.95);                 // R: Carved trenches
  col += vec3(0.22, 0.76, 1.00) * bVal * 0.38 * (1.0 - gVal * 0.5);    // B: Compacted ice glint

  // Center crosshair showing skier / world-locked FBO origin
  vec2 c = abs(vUv - 0.5);
  float crossH = step(c.y, 0.006) * step(c.x, 0.045);
  float crossV = step(c.x, 0.006) * step(c.y, 0.045);
  col = mix(col, vec3(1.0, 0.92, 0.35), max(crossH, crossV) * 0.9);

  // Small sun azimuth direction needle in top-right corner of PiP
  vec2 sunOrigin = vec2(0.84, 0.84);
  vec2 rel = vUv - sunOrigin;
  float rSun = length(rel);
  if (rSun < 0.11) {
    vec2 dir = normalize(uSunDirXZ + vec2(1e-5));
    float proj = dot(rel, dir);
    float perp = abs(dot(rel, vec2(-dir.y, dir.x)));
    float arrow = step(0.0, proj) * step(proj, 0.09) * (1.0 - smoothstep(0.006, 0.014, perp));
    float ring = 1.0 - smoothstep(0.005, 0.012, abs(rSun - 0.095));
    col = mix(col, vec3(1.0, 0.82, 0.38), max(arrow, ring * 0.5));
  }

  gl_FragColor = vec4(col, 1.0);
}
