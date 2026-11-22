// ============================================================================
// Physical Alpine Sky Dome Shader (Zero-Asset Rayleigh + Mie + 3-Tap Clouds)
// Outputs alpha = 1.0 so Post-FX identifies unobstructed sky for sun flare/god-rays.
// ============================================================================

precision highp float;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform float uTime;

varying vec3 vWorldDir;

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
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.04 + vec2(13.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vWorldDir);
  vec3 sunDir = normalize(uSunDir);

  // 1. Rayleigh Zenith-to-Horizon atmospheric gradient
  float elev = clamp(dir.y, 0.0, 1.0);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(elev, 0.52));

  // Subtle warm-silver Mie horizon scatter band toward sun azimuth
  float sunCos = max(dot(dir, sunDir), 0.0);
  float horizonBand = pow(1.0 - elev, 4.5);
  sky += uSunColor * horizonBand * (0.14 + 0.34 * pow(sunCos, 3.0));

  // 2. Physical angular solar disc + dual Mie forward-scattering corona
  float sunDisc = smoothstep(0.99945, 0.99985, sunCos);
  float mieInner = pow(sunCos, 96.0) * 0.85;
  float mieOuter = pow(sunCos, 10.0) * 0.24;
  sky += uSunColor * (sunDisc * 5.2 + mieInner + mieOuter);

  // 3. Procedural alpine orographic cirrus & cumulus billows with 3-tap self-shadowing
  if (dir.y > 0.02) {
    vec2 cloudUv = dir.xz / (dir.y + 0.16) * 1.15 + vec2(uTime * 0.008, -uTime * 0.005);
    float baseDensity = fbm(cloudUv);
    float detail = fbm(cloudUv * 2.7 + vec2(4.2, -3.1));
    float cloud = smoothstep(0.46, 0.78, baseDensity * 0.78 + detail * 0.28);
    cloud *= smoothstep(0.02, 0.18, dir.y);

    if (cloud > 0.005) {
      // 3-tap march toward sun azimuth for volumetric cloud self-shadowing
      vec2 sunStep = normalize(sunDir.xz + vec2(1e-5)) * 0.11;
      float occ = 0.0;
      occ += fbm(cloudUv + sunStep * 1.0);
      occ += fbm(cloudUv + sunStep * 2.2) * 0.7;
      occ += fbm(cloudUv + sunStep * 3.6) * 0.45;
      float lit = clamp(1.32 - occ * 0.68, 0.25, 1.0);

      vec3 cloudLit = mix(uSkyHorizon * 0.72, uSunColor * 1.12 + vec3(0.28), lit);
      // Forward silver-lining rim around sun
      cloudLit += uSunColor * pow(sunCos, 16.0) * (1.0 - cloud * 0.55) * 0.75;
      sky = mix(sky, cloudLit, cloud * 0.76);
    }
  }

  // Output alpha = 1.0 (unobstructed sky mask for Post-FX sun flare!)
  gl_FragColor = vec4(sky, 1.0);
}
