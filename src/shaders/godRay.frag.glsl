// ============================================================================
// Post-FX Pass 3: Dedicated Half-Res Volumetric Screen-Space God-Rays
// Supports configurable GPU quality steps: 16 (Low), 22 (High), 32 (Ultra)!
// ============================================================================

precision highp float;

uniform sampler2D uScene;
uniform vec2 uSunUV;
uniform float uSunVis;
uniform vec3 uSunColor;
uniform float uGodRaySteps;
uniform float uTime;

varying vec2 vUv;

float ign(vec2 px) {
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}

void main() {
  if (uSunVis <= 0.005) {
    gl_FragColor = vec4(0.0);
    return;
  }

  int steps = int(clamp(uGodRaySteps, 12.0, 32.0));
  vec2 delta = (uSunUV - vUv) * (0.90 / float(steps));
  float jitter = ign(gl_FragCoord.xy + fract(uTime) * 19.0);
  vec2 sampleUv = vUv + delta * jitter;

  float illumDecay = 1.0;
  float decayFactor = mix(0.915, 0.955, clamp((uGodRaySteps - 16.0) / 16.0, 0.0, 1.0));
  vec3 accum = vec3(0.0);

  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;
    sampleUv += delta;
    if (sampleUv.x > 0.002 && sampleUv.x < 0.998 && sampleUv.y > 0.002 && sampleUv.y < 0.998) {
      vec4 s = texture2D(uScene, sampleUv);
      float skyMask = smoothstep(0.72, 0.96, s.a);
      float lum = clamp(dot(s.rgb, vec3(0.3, 0.5, 0.2)), 0.0, 2.5);
      accum += (uSunColor * 0.65 + s.rgb * 0.35) * skyMask * (0.45 + 0.55 * lum) * illumDecay;
    }
    illumDecay *= decayFactor;
  }

  vec3 shafts = (accum / float(steps)) * uSunVis * 0.78;
  gl_FragColor = vec4(shafts, 1.0);
}
