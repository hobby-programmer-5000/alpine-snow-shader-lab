// ============================================================================
// Ski Bow-Wave Snow-Curling Ribbon Fragment Shader (Zero Sprite Textures!)
// Renders turbulent FBM coldsmoke curls with deep blue shaded snow trough.
// ============================================================================

precision highp float;

uniform float uTime;
uniform float uSpeed;
uniform float uAirborne;
uniform vec3 uSunColor;
uniform vec3 uShadowTint;

varying vec2 vUv;
varying float vCurl;

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
  float speedNorm = clamp((uSpeed - 3.5) / 14.0, 0.0, 1.0);
  float groundMask = 1.0 - smoothstep(0.02, 0.14, uAirborne);
  if (speedNorm * groundMask < 0.03) discard;

  vec2 uv = vec2(vUv.x * 5.0 - uTime * 4.5, vUv.y * 2.6);
  float n = vnoise(uv) * 0.62 + vnoise(uv * 2.3 + 4.1) * 0.38;

  // Soft wispy crest silhouette & longitudinal fade at tip/tail
  float endFade = smoothstep(0.0, 0.22, vUv.x) * (1.0 - smoothstep(0.75, 1.0, vUv.x));
  float edgeBreak = smoothstep(1.0, 0.35, vUv.y + (n - 0.5) * 0.45);
  float alpha = endFade * edgeBreak * smoothstep(0.0, 0.25, vUv.y) * speedNorm * groundMask * 0.72;
  if (alpha < 0.02) discard;

  // Cobalt-blue shadowed trough near snow -> bright sunlit frothy crest
  vec3 troughCol = mix(uShadowTint * 0.92, vec3(0.55, 0.72, 0.94), 0.45);
  vec3 crestCol = mix(vec3(0.95, 0.97, 1.0), uSunColor * 1.18, 0.38);
  vec3 col = mix(troughCol, crestCol, smoothstep(0.15, 0.85, vUv.y + (n - 0.5) * 0.25));

  gl_FragColor = vec4(col, alpha);
}
