// ============================================================================
// PHOTOREAL Lush Snow-Laden Alpine Evergreen & Korean Fir (구상나무 상고대) Shader
//   - Deep volumetric evergreen foliage AO + 3-octave prickly needle micro-normals
//   - Species-adaptive Rime Frost (uRimeStrength: intense 상고대 on Hallasan Fir!)
//   - Soft frost-to-snow transition + terrain-exact 1:1 snow-cushion lighting
//   - Backlit chlorophyll needle translucency & NaN-safe HDR lighting
// ============================================================================

precision highp float;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uSkyZenith;
uniform vec3 uShadowTint;
uniform vec3 uGroundBounce;
uniform vec3 uSSSColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uSquallIntensity;
uniform float uRimeStrength;
uniform sampler2D uSnowNormal;
uniform sampler2D uSnowCavity;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vMat; // x: 0=bark, 1=needles, 2=snowPillow | y: coreAO | z: hNorm
varying float vTint;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

// Exact terrain-matched photoreal snow cushion shading
vec3 evalLushSnowCushion(vec3 wp, vec3 geomN, vec3 L, vec3 V, float coreAO, float camDist) {
  vec2 uv1 = vec2(wp.x * 0.32 - wp.z * 0.14, wp.x * 0.14 + wp.z * 0.32);
  vec2 uv2 = wp.xz * 1.15;
  float fClose = 1.0 - smoothstep(12.0, 80.0, camDist);

  vec2 sn1 = (texture2D(uSnowNormal, uv1).xy * 2.0 - 1.0) * 0.34;
  vec2 sn2 = (texture2D(uSnowNormal, uv2).xy * 2.0 - 1.0) * 0.22 * fClose;
  vec3 sN = normalize(geomN + vec3(sn1.x + sn2.x, 0.0, sn1.y + sn2.y) + vec3(1e-5));

  vec3 cav1 = texture2D(uSnowCavity, uv1).rgb;
  vec3 cav2 = texture2D(uSnowCavity, uv2).rgb;
  float cavAO = mix(1.0, cav1.r * 0.62 + cav2.r * 0.38, 0.72) * (0.64 + 0.36 * coreAO);

  float NdotL = max(dot(sN, L), 0.0);
  float wrapL = clamp((dot(sN, L) + 0.10) / 1.10, 0.0, 1.0);
  float diff = wrapL * 0.18 + NdotL * 0.82;

  vec3 snowAlbedo = vec3(0.92, 0.95, 0.99) * (0.94 + 0.10 * cav2.b);
  vec3 direct = snowAlbedo * uSunColor * uSunIntensity * diff * cavAO;

  float skyF = clamp(0.44 + 0.56 * sN.y, 0.18, 1.0);
  float shMicro = clamp(0.76 + 0.32 * dot(sN, normalize(vec3(-L.x, 0.72, -L.z))), 0.54, 1.22);
  vec3 indirect = snowAlbedo * mix(uGroundBounce * 0.66, uShadowTint, skyF) * 0.66 * cavAO * shMicro;

  vec3 H = normalize(L + V);
  float NdotH = max(dot(sN, H), 0.0001);
  float NdotV = max(dot(sN, V), 0.0);
  float fres = pow(max(1.0 - NdotV, 0.0001), 3.4);
  float spec = pow(NdotH, 18.0) * 0.20 * (0.35 + 0.65 * fres) + fres * 0.14 * (0.3 + 0.7 * NdotL);
  float backL = pow(max(clamp(dot(V, normalize(-L + sN * 0.42)), 0.0, 1.0), 0.0001), 2.8);
  vec3 sss = uSSSColor * (backL * 0.40 + fres * 0.16) * uSunColor;

  return direct + indirect + uSunColor * spec + sss;
}

void main() {
  vec3 N = normalize(vWorldNormal + vec3(1e-5));
  vec3 L = normalize(uSunDir + vec3(1e-5));
  vec3 V = normalize(cameraPosition - vWorldPos + vec3(1e-5));
  float camDist = length(cameraPosition - vWorldPos);

  vec3 wMod = mod(vWorldPos, 32.0);
  float coreAO = clamp(vMat.y, 0.18, 1.0);
  float hNorm = clamp(vMat.z, 0.0, 1.0);

  vec3 col;
  if (vMat.x < 0.5) {
    // 0: Rough weathered alpine fir/spruce bark with snow-dusted fissures
    float bGrain = vnoise3(wMod * vec3(5.5, 1.6, 5.5));
    float bFine  = vnoise3(wMod * vec3(14.0, 4.5, 14.0));
    vec3 bark = mix(vec3(0.06, 0.042, 0.032), vec3(0.15, 0.105, 0.08), bGrain * 0.7 + bFine * 0.3);
    // Subtle wind-blown frost clinging to bark ridges
    bark = mix(bark, vec3(0.78, 0.85, 0.94), smoothstep(0.66, 0.92, bGrain) * uRimeStrength * 0.35);
    float NdotL = max(dot(N, L), 0.0);
    col = bark * (uSunColor * uSunIntensity * NdotL * 0.65 + uShadowTint * 0.46) * (0.36 + 0.64 * coreAO);
  } else if (vMat.x < 1.5) {
    // 1: Rich Multi-Octave Evergreen Needles + Lush Hoarfrost / 상고대 Rime Ice Crystals!
    float n1 = vnoise3(wMod * 2.8);
    float n2 = vnoise3(wMod * 7.8);
    float n3 = vnoise3(wMod * 19.5);
    float clump = n1 * 0.48 + n2 * 0.34 + n3 * 0.18;

    // Strong prickly multi-frequency needle micro-normal erases smooth geometric planes!
    vec3 bN = normalize(N + vec3(n2 - 0.5, (n3 - 0.5) * 0.85, n1 - 0.5) * 0.92);
    float NdotL = max(dot(bN, L), 0.0);
    float wrap = clamp((dot(bN, L) + 0.28) / 1.28, 0.0, 1.0);

    // Rich deep-forest evergreen tones (deep shadowed cedar-green core -> mossy alpine pine tips)
    vec3 corePine   = vec3(0.012, 0.034, 0.020);
    vec3 midPine    = vec3(0.030, 0.068, 0.036);
    vec3 warmTip    = vec3(0.062, 0.105, 0.048);
    vec3 needleCol  = mix(corePine, midPine, clamp(coreAO * 0.85 + clump * 0.35, 0.0, 1.0));
    needleCol = mix(needleCol, warmTip, clamp((clump - 0.42) * 1.4 + vTint * 0.30, 0.0, 1.0) * 0.65);

    // Waxy needle specular + warm backlit translucent pine rim
    vec3 H = normalize(L + V);
    float waxySpec = pow(max(dot(bN, H), 0.0001), 24.0) * 0.14 * (0.3 + 0.7 * coreAO);
    float backlit = pow(max(clamp(dot(V, -normalize(L + bN * 0.25)), 0.0, 1.0), 0.0001), 2.4);
    vec3 trans = vec3(0.11, 0.26, 0.12) * backlit * uSunColor * 0.95 * (0.35 + 0.65 * coreAO);

    float crownAO = mix(0.22, 1.0, coreAO * (0.52 + 0.48 * hNorm));
    vec3 pineLit = needleCol * (uSunColor * uSunIntensity * (NdotL * 0.72 + wrap * 0.18) + uShadowTint * 0.56) * crownAO
                 + trans + uSunColor * waxySpec;

    // Iconic Winter Hoarfrost & 상고대 (Rime Ice) + Soft Snow Dusting on outer/upper needle clusters!
    float frostExposure = smoothstep(0.18, 0.84, bN.y + (clump - 0.48) * 0.55) * smoothstep(0.28, 0.78, coreAO);
    float snowDust = clamp(frostExposure * (0.28 + uRimeStrength * 0.68), 0.0, 0.86);
    vec3 snowCol = evalLushSnowCushion(vWorldPos, bN, L, V, coreAO, camDist);

    // Crisp sparkly rime-ice rim on backlit frozen needle tips
    float rimFrost = pow(max(1.0 - max(dot(bN, V), 0.0), 0.0001), 2.8) * uRimeStrength * coreAO * 0.38;
    col = mix(pineLit, snowCol, snowDust) + uSunColor * rimFrost * 0.45;
  } else {
    // 2: Plump 3D Snow-Flower Cushions ("소복한 눈꽃 덩어리") draped thickly atop every bough!
    col = evalLushSnowCushion(vWorldPos, N, L, V, coreAO, camDist);
  }

  // Exact terrain Rayleigh/Mie aerial perspective fog
  float effFogDens = uFogDensity * (1.0 + uSquallIntensity * 3.8);
  float fogAmt = 1.0 - exp(-pow(max(camDist * effFogDens, 0.0001), 1.32));
  float sunScatter = pow(max(dot(-V, L), 0.0001), 4.0) * (1.0 - uSquallIntensity * 0.85);
  vec3 aerialColor = mix(uFogColor, uSunColor * 1.06, sunScatter * 0.48);
  col = mix(col, aerialColor, clamp(fogAmt, 0.0, 0.94));

  gl_FragColor = vec4(col, 0.55);
}
