// ============================================================================
// Dual-Kind Procedural Powder & Avalanche Billow Fragment Shader (Zero Sprites!)
// Implements sculpted belly-to-crest shading (deep cobalt shadowed underbelly on
// churning avalanche billows + warm golden Mie forward-scattering silver-lining!)
// ============================================================================

precision highp float;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShadowTint;

varying float vAge;
varying float vSeed;
varying float vKind;
varying float vCamFade;
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

void main() {
  if (vAge < 0.0 || vAge >= 1.0) discard;

  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  if (r > 1.0) discard;

  float spin = vKind > 0.5 ? 2.1 : 1.4;
  float ang = vSeed * 6.2831 + vAge * spin * (vSeed > 0.5 ? 1.0 : -1.0);
  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 p = rot * uv * (vKind > 0.5 ? 2.9 : 2.4) + vec2(vSeed * 19.3, vSeed * 7.1);
  float n = vnoise(p) * 0.62 + vnoise(p * 2.35 + 3.1) * 0.38;

  float radial = smoothstep(1.0, 0.16, r + (n - 0.5) * 0.44);
  float lifeFade = smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.38, 1.0, vAge));
  float density = vKind > 0.5 ? 0.84 : 0.62;
  float alpha = radial * lifeFade * density * vCamFade;
  if (alpha < 0.015) discard;

  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunDir);
  float mie = pow(max(dot(-V, L), 0.0), 4.5);
  float crest = clamp(0.55 - uv.y * 0.52 + (n - 0.5) * 0.38, 0.0, 1.0);

  // Rich sculpted cobalt-blue shadowed underbelly vs crisp sunlit crown on churning avalanche clouds!
  vec3 bellyColor = vKind > 0.5 ? vec3(0.16, 0.30, 0.58) : uShadowTint * 0.95;
  vec3 crestColor = mix(vec3(0.95, 0.97, 1.0), uSunColor * 1.25, 0.52);
  vec3 col = mix(bellyColor, crestColor, smoothstep(0.24, 0.84, crest));

  // Directional Mie forward scattering silver/golden halo when backlit by alpine sun
  col += uSunColor * mie * (vKind > 0.5 ? 0.85 : 0.60) * (1.0 - radial * 0.35);

  gl_FragColor = vec4(col, alpha);
}
