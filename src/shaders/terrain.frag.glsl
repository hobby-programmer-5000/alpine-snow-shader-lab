// ============================================================================
// PHOTOREAL Master Alpine Snow, Real Korean DEM & Live Slab Avalanche Shader
// Incorporates physically grounded techniques from:
//   - Multi-scale rotated procedural Snow Normal & Cavity maps (24m / 4.5m / 1.0m)
//   - Drifting Overhead Cloud Shadows (cloudShadowAt)
//   - Tight-Wrap (0.06) Direct Sun + Shadow-Side Micro-Sculpting (shadowMicro)
//   - Dual-Lobe crustPatch Snow Specular + Precision-Safe 2-Layer snowSparkle()
//   - 3D Parallax Glacial Crevasses (recessed cyan walls + overhanging snow lips)
//   - Up to 16-Step FBO Horizon-March Trench Self-Shadowing + Max (1988) DEM Horizon Map
//   - Live Slab Avalanche Crown Fracture Wall, Striated Ice Bed & Tumbled Chunks
//   - Procedural Twilight Valley Village Lights + Rayleigh/Mie Aerial Perspective
// ============================================================================

precision highp float;

uniform sampler2D uTrackTex;
uniform vec2 uTrackOrigin;
uniform float uTrackSpan;
uniform float uTrackRes;
uniform float uTrenchDepth;
uniform float uBermHeight;

uniform sampler2D uMacroTrackTex;
uniform vec2 uMacroTrackOrigin;
uniform float uMacroTrackSpan;

uniform sampler2D uHorizonTex;

// Seamless procedural PBR micro-textures (synthesized at startup, 0 external files!)
uniform sampler2D uSnowNormal;
uniform sampler2D uSnowCavity;
uniform sampler2D uIceNormal;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uShadowTint;
uniform vec3 uGroundBounce;
uniform vec3 uSSSColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uCloudShadowStrength;
uniform float uTwilight;
uniform float uValleyLightAlt;
uniform float uSquallIntensity;
uniform float uTime;

// Interactive Pass Toggles & Advanced GPU Quality Uniforms
uniform float uEnableTracks;
uniform float uEnableBerms;
uniform float uEnableSelfShadow;
uniform float uEnableSastrugi;
uniform float uEnableGlints;
uniform float uEnableGranite;
uniform float uEnableCrevasses;
uniform float uTrenchShadowSteps; // 8 (Low), 12 (High), 16 (Ultra)
uniform float uGlintIntensity;
uniform float uSastrugiStrength;
uniform float uViewMode;

// Skier dynamic soft ground contact shadow
uniform vec3 uSkierPos;
uniform vec2 uSkierDirXZ;
uniform float uSkierAirborne;

// Live Slab Avalanche uniforms
uniform float uAvyActive;
uniform vec2 uAvyOrigin;
uniform vec2 uAvyDir;
uniform float uAvyFront;
uniform float uAvyWidth;

varying vec3 vWorldPos;
varying vec2 vTrackUv;
varying float vTrackFade;
varying float vRingMask;
varying float vAvyBedMask;
varying float vAvyCrownMask;

// TERRAIN_COMMON_INJECT

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float vnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise2(p);
    p = rot * p * 2.03 + vec2(17.1, 31.7);
    a *= 0.5;
  }
  return v;
}

// --- 1. Drifting Overhead Alpine Cloud Shadows (adds huge photographic depth!) ---
float cloudShadowAt(vec2 xz, float t) {
  if (uCloudShadowStrength <= 0.01) return 0.0;
  vec2 p = xz * 0.0022 + vec2(t * 0.014, -t * 0.009);
  float n = vnoise2(p) * 0.62 + vnoise2(p * 2.15 + vec2(4.7, -3.1)) * 0.38;
  return smoothstep(0.49, 0.78, n) * uCloudShadowStrength;
}

float sampleTrackHeight(vec2 uv) {
  vec4 s = texture2D(uTrackTex, clamp(uv, 0.001, 0.999));
  return -s.r * uTrenchDepth * uEnableTracks + s.g * uBermHeight * uEnableBerms;
}

// --- 2. Up to 16-Step FBO Horizon-March Trench & Berm Self-Shadowing ---
float computeTrenchSelfShadow(vec2 trackUv, float centerH, vec3 sunDir) {
  if (uEnableSelfShadow < 0.5 || sunDir.y <= 0.025) return 1.0;

  vec2 horizDir = normalize(sunDir.xz + vec2(1e-5));
  float tanElev = sunDir.y / max(length(sunDir.xz), 0.001);
  float maxReach = 1.55;
  float shadow = 1.0;
  int maxSteps = int(clamp(uTrenchShadowSteps, 6.0, 16.0));

  for (int i = 1; i <= 16; i++) {
    if (i > maxSteps) break;
    float frac = (float(i) - 0.25) / float(maxSteps);
    float dist = frac * maxReach;
    vec2 sUv = trackUv + (horizDir * dist) / uTrackSpan;
    if (sUv.x < 0.01 || sUv.x > 0.99 || sUv.y < 0.01 || sUv.y > 0.99) break;

    float sampleH = sampleTrackHeight(sUv);
    float rayH = centerH + dist * tanElev;
    float occ = clamp((sampleH - rayH) / (0.040 + dist * 0.068), 0.0, 1.0);
    shadow = min(shadow, 1.0 - occ * 0.88);
  }
  return shadow;
}

// --- 3. Macro Mountain Horizon Shadow & Sky-View AO (Max 1988 on DEM / Raymarch on Procedural) ---
vec2 computeMacroShadowAndAO(vec3 worldPos, vec3 sunDir) {
  if (sunDir.y <= 0.02) return vec2(0.18, 0.85);

  if (uUseDem > 0.5) {
    vec2 demUv = clamp(worldPos.xz / uDemSpan + 0.5, 0.002, 0.998);
    float bakedAO = texture2D(uDemTex, demUv).b;
    vec3 hor = texture2D(uHorizonTex, demUv).rgb;

    vec2 hDir = normalize(sunDir.xz + vec2(1e-5));
    float wE = max(hDir.x, 0.0);
    float wW = max(-hDir.x, 0.0);
    float wS = max(hDir.y, 0.0);
    float horSin = (hor.r * wE + hor.g * wS + hor.b * wW) / (wE + wW + wS + 1e-4);
    float horShadow = smoothstep(horSin - 0.045, horSin + 0.048, sunDir.y);

    float localSh = 1.0;
    float dSteps[4];
    dSteps[0] = 10.0; dSteps[1] = 28.0; dSteps[2] = 65.0; dSteps[3] = 140.0;
    for (int i = 0; i < 4; i++) {
      float d = dSteps[i];
      vec3 p = worldPos + sunDir * d;
      float th = evalAlpineHeight(p.xz);
      float occ = clamp((th - p.y) / (2.2 + d * 0.085), 0.0, 1.0);
      localSh = min(localSh, 1.0 - occ * 0.78);
    }
    return vec2(min(mix(0.22, 1.0, horShadow), localSh), clamp(bakedAO, 0.25, 1.0));
  }

  float shadow = 1.0;
  float stepDists[6];
  stepDists[0] = 6.0; stepDists[1] = 16.0; stepDists[2] = 34.0;
  stepDists[3] = 68.0; stepDists[4] = 125.0; stepDists[5] = 210.0;

  for (int i = 0; i < 6; i++) {
    float d = stepDists[i];
    vec3 p = worldPos + sunDir * d;
    float terrainH = evalAlpineHeight(p.xz);
    float occ = clamp((terrainH - p.y) / (1.8 + d * 0.095), 0.0, 1.0);
    shadow = min(shadow, 1.0 - occ * 0.78);
  }
  return vec2(shadow, 0.92);
}

float computeSkierShadow(vec3 worldPos, vec3 sunDir) {
  if (sunDir.y <= 0.04) return 1.0;
  float heightDiff = (uSkierPos.y + 0.88) - worldPos.y;
  if (heightDiff < -0.25 || heightDiff > 4.2) return 1.0;

  float t = heightDiff / max(sunDir.y, 0.08);
  vec3 rayPt = worldPos + sunDir * t;
  vec2 delta = rayPt.xz - uSkierPos.xz;
  if (length(delta) > 2.2) return 1.0;

  vec2 fwd = normalize(uSkierDirXZ + vec2(1e-5));
  vec2 right = vec2(-fwd.y, fwd.x);
  vec2 local = vec2(dot(delta, right), dot(delta, fwd));

  float body = length(vec2(local.x / 0.34, (local.y - 0.05) / 0.52));
  float poleL = length(vec2((local.x + 0.52) / 0.09, (local.y - 0.22) / 0.65));
  float poleR = length(vec2((local.x - 0.52) / 0.09, (local.y - 0.22) / 0.65));
  float silhouette = min(body, min(poleL, poleR));

  float softness = 0.24 + uSkierAirborne * 0.45;
  return mix(0.44, 1.0, smoothstep(0.65, 0.65 + softness, silhouette));
}

// --- 4. Triplanar Stratified Alpine Protogine Granite (22 deg tectonic dip + snow ledges!) ---
void sampleProceduralTriplanarGranite(vec3 worldPos, vec3 worldN, out vec3 albedo, out vec3 perturbedN, out float ledgeSnow) {
  vec3 w = pow(abs(worldN), vec3(4.0));
  w /= max(w.x + w.y + w.z, 1e-5);

  mat2 rot22 = mat2(0.9272, -0.3746, 0.3746, 0.9272);
  vec2 uvX = rot22 * worldPos.zy * 0.14;
  vec2 uvY = rot22 * worldPos.xz * 0.14;
  vec2 uvZ = rot22 * worldPos.xy * 0.14;

  // 3 ridged fracture strata octaves + macro albedo modulation (eliminates cliff tiling!)
  float nX = fbm2(vec2(uvX.x * 1.35, uvX.y * 3.1));
  float nY = fbm2(vec2(uvY.x * 1.55, uvY.y * 1.55));
  float nZ = fbm2(vec2(uvZ.x * 1.35, uvZ.y * 3.1));
  float rockFbm = nX * w.x + nY * w.y + nZ * w.z;

  float ridge1 = 1.0 - abs(vnoise2(uvX * 2.8 + uvZ * 1.4) * 2.0 - 1.0);
  float ridge2 = 1.0 - abs(vnoise2(worldPos.xz * 0.19 + worldPos.y * 0.11) * 2.0 - 1.0);
  float cMacro = vnoise2(worldPos.xz * 0.012);

  vec3 darkGranite  = vec3(0.065, 0.075, 0.095);
  vec3 lightGranite = vec3(0.28, 0.295, 0.325);
  vec3 warmQuartz   = vec3(0.24, 0.215, 0.195);

  albedo = mix(darkGranite, lightGranite, clamp(rockFbm * 1.1 + ridge1 * 0.35, 0.0, 1.0));
  albedo = mix(warmQuartz, albedo, smoothstep(0.25, 0.65, ridge2));
  albedo *= (0.72 + 0.56 * cMacro);

  // Horizontal micro-ledges catch clinging windblown snow on steep cliffs!
  ledgeSnow = smoothstep(0.55, 0.85, ridge1 * 0.6 + worldN.y * 0.72);

  float eps = 0.16;
  float gx = fbm2((rot22 * (worldPos.zy + vec2(0.0, eps))) * 0.14) - nX;
  float gz = fbm2((rot22 * (worldPos.xy + vec2(eps, 0.0))) * 0.14) - nZ;
  perturbedN = normalize(worldN + vec3(gz, 0.0, gx) * 1.75);
}

// --- 5. Precision-Safe 2-Layer Irrational-Rotation Diamond-Dust Glints (No FP32 Striping!) ---
vec3 evalSnowSparkle(vec3 worldPos, vec3 N, vec3 V, vec3 L, float camDist) {
  if (uEnableGlints < 0.5 || camDist > 78.0) return vec3(0.0);

  vec3 H = normalize(L + V);

  // Wrap world coordinates cleanly before irrational rotation to guarantee zero moire/striping!
  vec2 w1 = mod(worldPos.xz, 32.0);
  vec2 warp = vec2(vnoise2(w1 * 0.85), vnoise2(w1 * 0.85 + 7.3)) * 0.22;
  vec2 p1 = mat2(0.848, -0.530, 0.530, 0.848) * (w1 + warp) * 26.0; // ~3.8 cm crystals
  vec2 c1 = floor(p1);
  vec3 r1 = hash33(vec3(c1, 1.7));
  vec3 m1 = normalize(N + (r1 - 0.5) * 0.66);
  float fade1 = 1.0 - smoothstep(24.0, 76.0, camDist);
  float sp1 = pow(max(dot(m1, H), 0.0), 88.0) * step(0.64, r1.z) * fade1;

  vec2 w2 = mod(worldPos.xz + vec2(11.3, 5.7), 16.0);
  vec2 p2 = mat2(0.616, -0.788, 0.788, 0.616) * (w2 + warp * 0.6) * 64.0; // ~1.5 cm fine glints
  vec2 c2 = floor(p2);
  vec3 r2 = hash33(vec3(c2, 5.3));
  vec3 m2 = normalize(N + (r2 - 0.5) * 0.58);
  float fade2 = 1.0 - smoothstep(8.0, 26.0, camDist);
  float sp2 = pow(max(dot(m2, H), 0.0), 108.0) * step(0.61, r2.x) * fade2;

  // Delicate prismatic crystal chromatic dispersion (gold / crisp white / ice cyan)
  vec3 tint1 = mix(vec3(0.76, 0.94, 1.0), vec3(1.0, 0.92, 0.76), r1.x);
  vec3 tint2 = mix(vec3(0.80, 0.95, 1.0), vec3(1.0, 0.86, 0.96), r2.y);

  return (tint1 * sp1 * 2.2 + tint2 * sp2 * 1.9) * uGlintIntensity;
}

// --- 6. Procedural Twilight Valley Village Lights ---
vec3 evalTwilightValleyLights(vec3 worldPos, vec3 macroN, float camDist) {
  if (uTwilight < 0.08 || camDist < 120.0) return vec3(0.0);
  float altMask = 1.0 - smoothstep(uValleyLightAlt - 180.0, uValleyLightAlt, worldPos.y);
  float flatMask = smoothstep(0.74, 0.92, macroN.y);
  float distMask = smoothstep(120.0, 320.0, camDist);
  float mask = altMask * flatMask * distMask * uTwilight;
  if (mask < 0.01) return vec3(0.0);

  vec2 g1 = floor(worldPos.xz / 44.0);
  vec2 f1 = fract(worldPos.xz / 44.0) - 0.5;
  float h1 = hash21(g1);
  float pt1 = smoothstep(0.16, 0.02, length(f1 - (vec2(h1, fract(h1 * 17.3)) - 0.5) * 0.45)) * step(0.58, h1);

  vec2 g2 = floor(worldPos.xz / 92.0);
  vec2 f2 = fract(worldPos.xz / 92.0) - 0.5;
  float h2 = hash21(g2 + 19.7);
  float pt2 = smoothstep(0.22, 0.03, length(f2)) * step(0.45, h2);

  float twinkle = 0.82 + 0.18 * sin(uTime * 2.8 + h1 * 40.0);
  vec3 warmCol = mix(vec3(1.0, 0.64, 0.24), vec3(1.0, 0.86, 0.55), fract(h1 * 9.1));
  return warmCol * (pt1 * 1.9 + pt2 * 2.6) * mask * twinkle;
}

void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  float camDist = length(cameraPosition - vWorldPos);
  vec3 L = normalize(uSunDir);

  // 1. Macro procedural or real DEM surface normal
  float baseEps = uUseDem > 0.5
    ? mix(1.3, 5.2, clamp(camDist / 650.0, 0.0, 1.0))
    : mix(0.22, 1.4, clamp(camDist / 260.0, 0.0, 1.0));
  vec3 macroN = evalAlpineNormal(vWorldPos.xz, baseEps);

  // 2. Dual-Tier Ping-Pong Track FBO (48m high-res + 240m macro descent ribbon)
  vec4 tr = vec4(0.0);
  vec3 trackNormalOffset = vec3(0.0);
  float trenchSelfShadow = 1.0;

  if (vTrackFade > 0.001) {
    tr = texture2D(uTrackTex, clamp(vTrackUv, 0.001, 0.999)) * vTrackFade;
    float texelUV = 1.0 / uTrackRes;
    float texelWorld = uTrackSpan / uTrackRes;

    float hL = sampleTrackHeight(vTrackUv - vec2(texelUV, 0.0));
    float hR = sampleTrackHeight(vTrackUv + vec2(texelUV, 0.0));
    float hD = sampleTrackHeight(vTrackUv - vec2(0.0, texelUV));
    float hU = sampleTrackHeight(vTrackUv + vec2(0.0, texelUV));

    float dHx = (hR - hL) / (2.0 * texelWorld);
    float dHz = (hU - hD) / (2.0 * texelWorld);
    trackNormalOffset = vec3(-dHx, 0.0, -dHz) * 1.38 * vTrackFade;

    float centerH = -tr.r * uTrenchDepth * uEnableTracks + tr.g * uBermHeight * uEnableBerms;
    trenchSelfShadow = computeTrenchSelfShadow(vTrackUv, centerH, L);
  }

  vec2 macroUv = (vWorldPos.xz - uMacroTrackOrigin) / uMacroTrackSpan + 0.5;
  vec2 mBorder = min(macroUv, 1.0 - macroUv);
  float macroFade = smoothstep(0.02, 0.12, min(mBorder.x, mBorder.y)) * (1.0 - vTrackFade);
  if (macroFade > 0.001 && uEnableTracks > 0.5) {
    vec4 mTr = texture2D(uMacroTrackTex, clamp(macroUv, 0.001, 0.999)) * macroFade;
    tr = max(tr, mTr);
    trenchSelfShadow = min(trenchSelfShadow, 1.0 - mTr.r * 0.44);
  }

  // 3. Multi-Scale Rotated Procedural Snow Normal + Cavity (24m / 4.5m / 1.0m — Zero Tiling!)
  vec3 sastrugiOffset = vec3(0.0);
  float microCavityAO = 1.0;
  float snowGrain = 0.5;
  if (uEnableSastrugi > 0.5) {
    vec2 wpXZ = vWorldPos.xz;
    vec2 windUV1 = vec2(wpXZ.x * 0.042 + wpXZ.y * 0.015, -wpXZ.x * 0.015 + wpXZ.y * 0.042); // ~24m macro drifts
    vec2 windUV2 = vec2(wpXZ.x * 0.220 - wpXZ.y * 0.090,  wpXZ.x * 0.090 + wpXZ.y * 0.220); // ~4.5m sastrugi
    vec2 windUV3 = vec2(wpXZ.x * 0.920 + wpXZ.y * 0.340, -wpXZ.x * 0.340 + wpXZ.y * 0.920); // ~1.0m fine wind-crust

    float f1 = 1.0 - smoothstep(140.0, 1200.0, camDist);
    float f2 = (1.0 - smoothstep(22.0, 210.0, camDist)) * (1.0 - clamp(tr.r * 0.58, 0.0, 0.58));
    float f3 = (1.0 - smoothstep(8.0, 54.0, camDist))  * (1.0 - clamp(tr.r * 0.78, 0.0, 0.78));

    vec2 n1 = (texture2D(uSnowNormal, windUV1).xy * 2.0 - 1.0) * 0.26 * f1;
    vec2 n2 = (texture2D(uSnowNormal, windUV2).xy * 2.0 - 1.0) * 0.34 * f2;
    vec2 n3 = (texture2D(uSnowNormal, windUV3).xy * 2.0 - 1.0) * 0.24 * f3;

    vec3 cav1 = texture2D(uSnowCavity, windUV1).rgb;
    vec3 cav2 = texture2D(uSnowCavity, windUV2).rgb;
    vec3 cav3 = texture2D(uSnowCavity, windUV3).rgb;
    microCavityAO = mix(1.0, cav1.r * 0.45 + cav2.r * 0.40 + cav3.r * 0.15, clamp((f1 + f2) * 0.65, 0.0, 1.0));
    snowGrain = cav3.b;

    vec2 totN = (n1 + n2 + n3) * uSastrugiStrength;
    sastrugiOffset = vec3(totN.x, 0.0, totN.y);
  }

  // 4. Dynamic Slab Avalanche Surface Perturbation
  vec3 avyNormalOffset = vec3(0.0);
  float avyBed = clamp(vAvyBedMask, 0.0, 1.0);
  float avyCrown = clamp(vAvyCrownMask, 0.0, 1.0);
  if (avyBed > 0.01 || avyCrown > 0.01) {
    vec2 right = vec2(-uAvyDir.y, uAvyDir.x);
    vec2 avyUv = vec2(dot(vWorldPos.xz, right) * 0.75, dot(vWorldPos.xz, uAvyDir) * 0.22);
    float scrape = fbm2(avyUv * 2.2) - 0.5;
    float chunks = pow(vnoise2(vWorldPos.xz * 1.85), 2.5) - 0.35;
    avyNormalOffset =
      vec3(right.x * scrape * 0.55 + uAvyDir.x * (avyCrown * 2.8 + chunks * 0.45),
           0.0,
           right.y * scrape * 0.55 + uAvyDir.y * (avyCrown * 2.8 + chunks * 0.45));
  }

  vec3 N = normalize(macroN + trackNormalOffset + sastrugiOffset + avyNormalOffset);

  // 5. 3D Parallax Glacial Crevasses on Steep Upper Snow Slopes (Mont Blanc signature!)
  float crevasseMask = 0.0;
  float crevasseLip = 0.0;
  vec3 crevasseCol = vec3(0.0);
  if (uEnableCrevasses > 0.5) {
    float slopeDeg = acos(clamp(macroN.y, 0.0, 1.0)) * 57.2958;
    float slopeGate = smoothstep(14.0, 21.0, slopeDeg) * (1.0 - smoothstep(38.0, 46.0, slopeDeg));
    float corridorExclude = uUseDem > 0.5 ? 1.0 : smoothstep(11.0, 26.0, abs(vWorldPos.x - valleyCenterX(vWorldPos.z)));
    float patchNoise = vnoise2(vWorldPos.xz * 0.011 + 3.1);
    float crevGate = slopeGate * corridorExclude * smoothstep(0.56, 0.74, patchNoise);

    if (crevGate > 0.02) {
      float iceNoise = vnoise2(vWorldPos.xz * 0.035);
      float outerWave = abs(sin(dot(vWorldPos.xz, vec2(0.032, 0.024)) + iceNoise * 4.8));
      crevasseMask = (1.0 - smoothstep(0.04, 0.13, outerWave)) * crevGate;
      crevasseLip = smoothstep(0.11, 0.16, outerWave) * (1.0 - smoothstep(0.16, 0.26, outerWave)) * crevGate;

      if (crevasseMask > 0.01) {
        // View-dependent parallax offset reveals deep recessed cyan glacial ice walls & abyssal navy chasm!
        vec2 crevPar = -V.xz / max(0.38, V.y) * 1.15;
        vec2 parXZ = vWorldPos.xz + crevPar;
        float innerWave = abs(sin(dot(parXZ, vec2(0.032, 0.024)) + vnoise2(parXZ * 0.035) * 4.8));
        float abyss = 1.0 - smoothstep(0.015, 0.085, innerWave);
        vec3 iceN = texture2D(uIceNormal, parXZ * 0.12).xyz * 2.0 - 1.0;
        vec3 cyanIceWall = vec3(0.06, 0.34, 0.58) * (0.75 + 0.55 * max(dot(normalize(N + iceN * 0.5), L), 0.0));
        vec3 abyssNavy = vec3(0.015, 0.055, 0.15);
        crevasseCol = mix(cyanIceWall, abyssNavy, abyss);
      }
    }
  }

  // 6. Slope-Adaptive Triplanar Granite Cliffs with Snow-Ledge Dusting
  float rockBlend = 0.0;
  vec3 rockAlbedo = vec3(0.2);
  vec3 rockN = N;
  float ledgeSnow = 0.0;
  if (uEnableGranite > 0.5) {
    float slope = 1.0 - macroN.y;
    float rockNoise = fbm2(vWorldPos.xz * 0.055) * 0.14;
    float corridorMask = uUseDem > 0.5
      ? 1.0
      : smoothstep(10.0, 34.0, abs(vWorldPos.x - valleyCenterX(vWorldPos.z)));
    float slopeLow = uUseDem > 0.5 ? 0.13 : 0.16;
    float slopeHigh = uUseDem > 0.5 ? 0.29 : 0.34;
    rockBlend = smoothstep(slopeLow, slopeHigh, slope + rockNoise - 0.04) * corridorMask;
    if (rockBlend > 0.01) {
      sampleProceduralTriplanarGranite(vWorldPos, macroN, rockAlbedo, rockN, ledgeSnow);
      // Ledge snow catches naturally in granite strata cracks
      rockBlend *= (1.0 - ledgeSnow * 0.42);
      N = normalize(mix(N, rockN, rockBlend));
    }
  }

  // --- Debug View Modes 1, 2, 3 ---
  if (uViewMode > 0.5 && uViewMode < 1.5) {
    float baseShade = 0.16 + 0.24 * max(dot(macroN, L), 0.0);
    vec3 dbg = vec3(baseShade * 0.68, baseShade * 0.78, baseShade * 0.95);
    float rVal = clamp(tr.r * 1.45, 0.0, 1.0);
    float gVal = clamp(tr.g * 1.35, 0.0, 1.0);
    float bVal = clamp(tr.b * 0.90, 0.0, 1.0);
    dbg = mix(dbg, vec3(0.06, 0.88, 0.44), gVal);
    dbg = mix(dbg, vec3(0.98, 0.14, 0.28), rVal);
    dbg += vec3(0.08, 0.42, 0.95) * bVal * 0.42 * (1.0 - gVal);
    dbg = mix(dbg, vec3(1.0, 0.76, 0.14), avyCrown * 0.9);
    gl_FragColor = vec4(dbg, 0.55);
    return;
  }
  if (uViewMode > 1.5 && uViewMode < 2.5) {
    gl_FragColor = vec4(N * 0.5 + 0.5, 0.55);
    return;
  }
  if (uViewMode > 2.5 && uViewMode < 3.5) {
    vec3 sCol = mix(vec3(0.06, 0.14, 0.36), vec3(0.96, 0.98, 1.0), trenchSelfShadow);
    sCol += vec3(0.18, 0.05, 0.0) * tr.g;
    gl_FragColor = vec4(sCol, 0.55);
    return;
  }

  // 7. Combined Shadowing (Mountain Horizon * Drifting Cloud Shadows * FBO Trench * Skier)
  vec2 macroShAO = computeMacroShadowAndAO(vWorldPos, L);
  float mtnShadow = mix(macroShAO.x, 0.34, uSquallIntensity * 0.78);
  float topoAO = macroShAO.y;
  float cloudSh = cloudShadowAt(vWorldPos.xz, uTime);
  float directVis = mtnShadow * (1.0 - cloudSh);
  float skierShadow = computeSkierShadow(vWorldPos, L);

  if (uViewMode > 5.5) {
    vec3 vis = mix(vec3(0.08, 0.18, 0.42), vec3(1.0, 0.95, 0.84), directVis) * topoAO * microCavityAO;
    gl_FragColor = vec4(vis, 0.55);
    return;
  }

  // 8. Photoreal Tight-Wrap Snow Lighting + Shadow-Side Micro-Sculpting + Dual-Lobe Specular!
  float NdotL = max(dot(N, L), 0.0);
  float wrapNdotL = clamp((dot(N, L) + 0.06) / 1.06, 0.0, 1.0); // Tight 0.06 wrap keeps crisp raking relief!
  float diffFactor = mix(wrapNdotL * 0.14 + NdotL * 0.86, NdotL, rockBlend);

  vec3 snowAlbedo = vec3(0.91, 0.94, 0.98) * (0.94 + 0.10 * snowGrain);
  snowAlbedo = mix(snowAlbedo, vec3(0.76, 0.85, 0.96), clamp(tr.r * 0.52 * uEnableTracks, 0.0, 0.52));
  snowAlbedo = mix(snowAlbedo, vec3(0.98, 0.99, 1.00), clamp(tr.g * 0.48 * uEnableBerms + crevasseLip * 0.7, 0.0, 0.65));
  snowAlbedo = mix(snowAlbedo, vec3(0.56, 0.73, 0.92), avyBed * 0.68);
  snowAlbedo = mix(snowAlbedo, vec3(0.30, 0.58, 0.88), avyCrown * 0.88);

  vec3 albedo = mix(snowAlbedo, rockAlbedo, rockBlend);

  float cavityAO = topoAO * microCavityAO * (1.0 - tr.r * 0.26 * uEnableTracks) * (1.0 - avyCrown * 0.36);
  vec3 directDiff = albedo * uSunColor * uSunIntensity * diffFactor * directVis * trenchSelfShadow * skierShadow * cavityAO;

  // Shadow-side sculpting (shadowMicro) keeps shaded snow slopes richly legible in cobalt blue!
  float skyFactor = clamp(0.42 + 0.58 * N.y, 0.16, 1.0);
  float shadowMicro = clamp(0.74 + 0.34 * dot(N, normalize(vec3(-L.x, 0.72, -L.z))), 0.52, 1.24);
  vec3 ambientSky = mix(uGroundBounce * 0.64, uShadowTint, skyFactor);
  vec3 indirectFill = albedo * ambientSky * 0.64 * cavityAO * shadowMicro;

  // Physically calibrated Snow Subsurface Scattering (trench walls, berms, crevasses, ridges!)
  vec3 sssContrib = vec3(0.0);
  if (uEnableGlints > 0.5) {
    float backLight = pow(clamp(dot(V, normalize(-L + N * 0.42)), 0.0, 1.0), 3.0);
    float rimFres = pow(1.0 - max(dot(N, V), 0.0), 3.2);
    float sssMask = (1.0 - rockBlend) * (0.32 + tr.g * 0.95 * uEnableBerms + tr.r * 0.95 * uEnableTracks + crevasseMask * 1.6 + avyCrown * 0.9);
    sssContrib = uSSSColor * (backLight * 0.42 + rimFres * 0.18) * sssMask * (0.24 + 0.76 * directVis) * uSunColor;
  }

  // Dual-Lobe Crust/Glaze Snow Specular + Forward Grazing Sheen
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);
  float NdotV = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - NdotV, 3.6);
  float crustPatch = clamp(vnoise2(vWorldPos.xz * 0.022) * 0.65 + vnoise2(vWorldPos.xz * 0.068) * 0.35, 0.0, 1.0);
  float fwdCone = pow(max(dot(-V, normalize(vec3(L.x, -L.y * 0.25, L.z))), 0.0), 3.0);

  float broadGlaze = pow(NdotH, mix(18.0, 10.0, crustPatch * 0.5)) * (0.24 + 0.52 * crustPatch + 0.34 * fwdCone) * (0.35 + 0.65 * fresnel);
  float tightGleam = pow(NdotH, mix(48.0, 132.0, clamp(tr.b + avyBed, 0.0, 1.0))) * (0.14 + tr.b * 1.55 * uEnableTracks + avyBed * 0.85);
  float sheenSpec = fresnel * (0.14 + 0.32 * fwdCone) * (0.28 + 0.72 * NdotL);
  vec3 specContrib = uSunColor * (broadGlaze * 0.32 + tightGleam * uGlintIntensity + sheenSpec * 0.22) * directVis * trenchSelfShadow * skierShadow * (1.0 - rockBlend * 0.85);

  // Precision-Safe 2-Layer Diamond-Dust Glints
  vec3 sparkle = evalSnowSparkle(vWorldPos, N, V, L, camDist) * uSunColor * directVis * trenchSelfShadow * skierShadow * (1.0 - rockBlend);

  if (uViewMode > 3.5 && uViewMode < 4.5) {
    vec3 iso = sssContrib * 1.8 + sparkle * 1.4 + specContrib * 1.3;
    gl_FragColor = vec4(iso, 0.55);
    return;
  }

  vec3 color = directDiff + indirectFill + sssContrib + specContrib + sparkle;

  // Blend recessed 3D Parallax Glacial Crevasse interior cleanly!
  if (crevasseMask > 0.01) {
    color = mix(color, crevasseCol, crevasseMask * (1.0 - rockBlend));
  }

  // Procedural Twilight Valley Village Lights
  color += evalTwilightValleyLights(vWorldPos, macroN, camDist);

  // Rayleigh / Mie Aerial Perspective + Dynamic Whiteout Squall Visibility Drop
  float effFogDens = uFogDensity * (1.0 + uSquallIntensity * 3.8);
  float fogAmt = 1.0 - exp(-pow(camDist * effFogDens, 1.32));
  float sunScatter = pow(max(dot(-V, L), 0.0), 4.0) * (1.0 - uSquallIntensity * 0.85);
  vec3 aerialColor = mix(uFogColor, uSunColor * 1.06, sunScatter * 0.48);
  color = mix(color, aerialColor, clamp(fogAmt, 0.0, 0.94));

  gl_FragColor = vec4(color, 0.55);
}
