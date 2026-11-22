// ============================================================================
// PHOTOREAL Wind-Scoured Glacial Blue-Ice Slip Patch Fragment Shader
// Replaces the flat circular cyan disk with organic FBM-feathered glacier ice,
// dual-layer view-parallax internal fracture veins, uIceNormal micro-ripples,
// mirror Fresnel sky reflection & wind-blown snow-drift tongues!
// ============================================================================

precision highp float;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uShadowTint;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uSquallIntensity;

uniform sampler2D uIceNormal;
uniform sampler2D uSnowNormal;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv; // [0..1] across terrain-conformed patch

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
    p = p * 2.04 + vec2(9.2, 5.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  // 1. Domain-warped organic wind-scoured shoreline (completely erases circular polygon border!)
  vec2 centered = vUv * 2.0 - 1.0;
  vec2 wp = vWorldPos.xz;
  float edgeWarp = (fbm(wp * 0.24) - 0.5) * 0.62 + (vnoise(wp * 0.85) - 0.5) * 0.18;
  float dist = length(centered * vec2(0.94, 1.06)) + edgeWarp;

  // Soft crusty snow-frost transition margin around exposed glacier blue-ice core
  float iceAlpha = 1.0 - smoothstep(0.46, 0.86, dist);
  if (!(iceAlpha > 0.015)) discard;

  // Wind-blown snow tongues drifting partially across the ice surface
  float snowTongue = smoothstep(0.60, 0.82, fbm(vec2(wp.x * 0.28 + wp.y * 0.12, wp.y * 0.55)));
  iceAlpha *= (1.0 - snowTongue * 0.65);
  if (!(iceAlpha > 0.015)) discard;

  vec3 geomN = normalize(vWorldNormal + vec3(1e-5));
  vec3 L = normalize(uSunDir + vec3(1e-5));
  vec3 V = normalize(cameraPosition - vWorldPos + vec3(1e-5));
  float camDist = length(cameraPosition - vWorldPos);

  // 2. High-frequency fractured glacial ice normal + subtle wind scour ripples
  vec3 in1 = texture2D(uIceNormal, wp * 0.26).xyz * 2.0 - 1.0;
  vec3 in2 = texture2D(uIceNormal, wp * 0.92 + vec2(0.31, 0.17)).xyz * 2.0 - 1.0;
  vec3 N = normalize(geomN + vec3(in1.x * 0.24 + in2.x * 0.12, 0.0, in1.y * 0.24 + in2.y * 0.12));

  // 3. Dual-layer View-Parallax internal glacier cracks & trapped frost pockets!
  vec2 par1 = -V.xz / max(0.32, V.y) * 0.28;
  vec2 par2 = -V.xz / max(0.32, V.y) * 0.62;
  float crack1 = 1.0 - smoothstep(0.0, 0.09, abs(fbm((wp + par1) * 0.65) * 2.0 - 1.0));
  float crack2 = 1.0 - smoothstep(0.0, 0.12, abs(fbm((wp + par2) * 0.42 + 4.3) * 2.0 - 1.0));
  float bubbles = smoothstep(0.68, 0.92, vnoise((wp + par1 * 0.5) * 3.8));

  // Natural alpine wind-scoured glacier blue-ice (subtle desaturated glacial slate-blue, never neon!)
  vec3 deepIce   = vec3(0.11, 0.25, 0.42);
  vec3 midIce    = vec3(0.26, 0.46, 0.66);
  vec3 frostRim  = vec3(0.84, 0.89, 0.95);
  vec3 crackTint = vec3(0.66, 0.82, 0.95);

  float coreMask = smoothstep(0.14, 0.62, iceAlpha);
  float depthT = smoothstep(0.84, 0.24, dist);
  vec3 iceCol = mix(frostRim, mix(midIce, deepIce, depthT * 0.68), coreMask);
  iceCol += crackTint * (crack1 * 0.26 + crack2 * 0.16 + bubbles * 0.12) * coreMask;

  // 4. Natural grazing Fresnel sky sheen + crisp wet-ice sun specular (suppressed on frosty rim!)
  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.0);
  float fres = 0.04 + 0.96 * pow(max(1.0 - NdotV, 0.0001), 4.2);
  vec3 R = reflect(-V, N);
  vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, clamp(R.y * 1.4, 0.0, 1.0));

  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0001);
  float sharpSpec = pow(NdotH, 160.0) * 1.45 + pow(NdotH, 26.0) * 0.22;

  vec3 col = iceCol * (uSunColor * uSunIntensity * (0.28 + 0.72 * NdotL) * 0.56 + uShadowTint * 0.58)
           + skyRefl * fres * 0.34 * coreMask
           + uSunColor * sharpSpec * coreMask;

  float effFogDens = uFogDensity * (1.0 + uSquallIntensity * 3.8);
  float fogAmt = 1.0 - exp(-pow(max(camDist * effFogDens, 0.0001), 1.32));
  float sunScatter = pow(max(dot(-V, L), 0.0001), 4.0) * (1.0 - uSquallIntensity * 0.85);
  col = mix(col, mix(uFogColor, uSunColor * 1.06, sunScatter * 0.48), clamp(fogAmt, 0.0, 0.94));

  gl_FragColor = vec4(col, clamp(iceAlpha * 0.82, 0.0, 0.84));
}
