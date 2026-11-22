// ============================================================================
// Summit Ridge Snow Banner Shader (High-Altitude Wind-Blown Spindrift Plumes!)
// u = 0 right at mountain peak crest -> u = 1 wispy spindrift fading downwind!
// ============================================================================

precision highp float;

uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShadowTint;
uniform vec3 uFogColor;
uniform float uFogDensity;

varying vec2 vUv;
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
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.06 + vec2(7.3, 11.9);
    a *= 0.5;
  }
  return v;
}

void main() {
  // Fast downwind streaming wisps off alpine summit crests
  vec2 p = vec2(vUv.x * 3.2 - uTime * 0.55, vUv.y * 2.4 + sin(vUv.x * 4.0 - uTime * 0.9) * 0.18);
  float n = fbm(p);
  float wisp = smoothstep(0.28, 0.78, n);

  // Dense at crest (u=0.05..0.25), feathery tail fading out downwind (u -> 1.0)
  // Guard all pow() bases >= 1e-4 to prevent D3D11/ANGLE NaN poisoning HDR bloom!
  float tailT = max(1.0 - clamp(vUv.x, 0.0, 1.0), 0.0001);
  float alongFade = smoothstep(0.0, 0.16, vUv.x) * pow(tailT, 1.45) * smoothstep(1.0, 0.88, vUv.x);
  float vertEnv = max(sin(clamp(vUv.y, 0.0, 1.0) * 3.14159), 0.0001);
  float vertFade = pow(vertEnv, 1.35) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);

  float alpha = wisp * alongFade * vertFade * 0.48;
  if (!(alpha > 0.015)) discard;

  vec3 V = normalize(cameraPosition - vWorldPos + vec3(1e-5));
  vec3 L = normalize(uSunDir + vec3(1e-5));
  float mie = pow(max(dot(-V, L), 0.0001), 4.0);

  vec3 col = mix(uShadowTint * 0.88, vec3(0.96, 0.98, 1.0), smoothstep(0.2, 0.85, vUv.y * 0.65 + n * 0.45));
  col += uSunColor * (0.24 + mie * 0.65);

  float camDist = length(cameraPosition - vWorldPos);
  float fogAmt = 1.0 - exp(-pow(max(camDist * uFogDensity * 0.7, 0.0001), 1.3));
  col = mix(col, uFogColor, clamp(fogAmt, 0.0, 0.85));

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
}
