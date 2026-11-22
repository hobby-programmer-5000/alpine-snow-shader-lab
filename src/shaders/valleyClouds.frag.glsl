// ============================================================================
// Procedural Valley Sea-of-Clouds Shader (Zero External Textures!)
// Renders softly parting alpine cloud decks in low valleys + warm twilight
// upward village light-pollution underglow (inspired by Mont Blanc Chamonix mist).
// ============================================================================

precision highp float;

uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShadowTint;
uniform float uTwilight;
uniform float uCloudAlt;

varying vec3 vWorldPos;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.5);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.05 + vec2(9.1, 14.3);
    a *= 0.5;
  }
  return v;
}

void main() {
  float camDist = length(cameraPosition - vWorldPos);
  // Keep near ski slope completely unobstructed; sea of clouds settles in distant low valley
  float nearFade = smoothstep(85.0, 260.0, camDist);
  float farFade  = 1.0 - smoothstep(950.0, 1500.0, camDist);

  vec2 uv = vWorldPos.xz * 0.0028 + vec2(uTime * 0.006, -uTime * 0.004);
  float d1 = fbm(uv);
  float d2 = fbm(uv * 2.4 + vec2(3.7, -5.2));
  float density = smoothstep(0.36, 0.78, d1 * 0.72 + d2 * 0.35);

  // Part clouds softly at twilight so valley village lights glimmer through evening mist
  density *= mix(1.0, 0.72, uTwilight);
  float alpha = density * nearFade * farFade * 0.58;
  if (alpha < 0.01) discard;

  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float mie = pow(max(dot(-V, L), 0.0), 6.0);

  vec3 shadowCol = mix(uShadowTint * 0.85, vec3(0.24, 0.22, 0.42), uTwilight);
  vec3 litCol = mix(vec3(0.92, 0.95, 1.0), uSunColor * 1.15, 0.55);
  vec3 col = mix(shadowCol, litCol, smoothstep(0.32, 0.75, d1)) + uSunColor * mie * 0.45;

  // Warm upward light-pollution underglow illuminating evening valley mist!
  float townGlow = smoothstep(0.42, 0.78, fbm(vWorldPos.xz * 0.0018 + 2.3)) * uTwilight;
  col += vec3(1.0, 0.58, 0.24) * townGlow * 0.52;

  gl_FragColor = vec4(col, alpha);
}
