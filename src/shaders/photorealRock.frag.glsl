// ============================================================================
// PHOTOREAL Triplanar PBR Alpine Granite & Glacial Serac Fragment Shader
// Eliminates polygonal low-poly appearance via:
//   - 2-Octave Whiteout/UDN Triplanar Rock Normal Mapping (uRockNormal + uRockDetail)
//   - Crevice AO darkening + mineral quartz/feldspar color variation + lichen accents
//   - Realistic snow accumulation in upward ledges & fracture crevices (terrain-matched!)
//   - Flared basal snow-drift skirt (vPart > 0.5) using exact terrain snow shading
//   - Glacial Serac mode (uIsSerac > 0.5): 2-octave Triplanar uIceNormal + deep cyan SSS
// ============================================================================

precision highp float;

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
uniform float uSquallIntensity;
uniform float uIsSerac;

uniform sampler2D uSnowNormal;
uniform sampler2D uSnowCavity;
uniform sampler2D uIceNormal;
uniform sampler2D uRockNormal;
uniform sampler2D uRockDetail;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vPart;
varying float vSeed;

// Whiteout Triplanar normal sampling (eliminates UV seams & polygon facets on arbitrary 3D rocks!)
vec3 sampleTriplanarNormal(sampler2D mapTex, vec3 p, vec3 n, float scale, float strength) {
  vec3 w = pow(max(abs(n), vec3(0.0001)), vec3(4.0));
  w /= max(w.x + w.y + w.z, 0.0001);

  vec3 nx = texture2D(mapTex, p.zy * scale).xyz * 2.0 - 1.0;
  vec3 ny = texture2D(mapTex, p.xz * scale).xyz * 2.0 - 1.0;
  vec3 nz = texture2D(mapTex, p.xy * scale).xyz * 2.0 - 1.0;

  nx.xy *= strength;
  ny.xy *= strength;
  nz.xy *= strength;

  vec3 wnX = vec3(n.x, n.y + nx.y, n.z + nx.x);
  vec3 wnY = vec3(n.x + ny.x, n.y, n.z + ny.y);
  vec3 wnZ = vec3(n.x + nz.x, n.y + nz.y, n.z);
  return normalize(wnX * w.x + wnY * w.y + wnZ * w.z + vec3(1e-5));
}

vec3 sampleTriplanarRGB(sampler2D mapTex, vec3 p, vec3 n, float scale) {
  vec3 w = pow(max(abs(n), vec3(0.0001)), vec3(4.0));
  w /= max(w.x + w.y + w.z, 0.0001);
  return texture2D(mapTex, p.zy * scale).rgb * w.x
       + texture2D(mapTex, p.xz * scale).rgb * w.y
       + texture2D(mapTex, p.xy * scale).rgb * w.z;
}

// Exact terrain-matched photoreal snow shading (seamless with terrain.frag.glsl!)
vec3 evalTerrainMatchedSnow(vec3 wp, vec3 geomN, vec3 L, vec3 V, float camDist) {
  vec2 uv1 = vec2(wp.x * 0.220 - wp.z * 0.090, wp.x * 0.090 + wp.z * 0.220);
  vec2 uv2 = vec2(wp.x * 0.920 + wp.z * 0.340, -wp.x * 0.340 + wp.z * 0.920);
  float fClose = 1.0 - smoothstep(10.0, 75.0, camDist);

  vec2 sn1 = (texture2D(uSnowNormal, uv1).xy * 2.0 - 1.0) * 0.30;
  vec2 sn2 = (texture2D(uSnowNormal, uv2).xy * 2.0 - 1.0) * 0.22 * fClose;
  vec3 sN = normalize(geomN + vec3(sn1.x + sn2.x, 0.0, sn1.y + sn2.y));

  vec3 cav1 = texture2D(uSnowCavity, uv1).rgb;
  vec3 cav2 = texture2D(uSnowCavity, uv2).rgb;
  float cavityAO = mix(1.0, cav1.r * 0.65 + cav2.r * 0.35, 0.75);
  float grain = cav2.b;

  float NdotL = max(dot(sN, L), 0.0);
  float wrapNdotL = clamp((dot(sN, L) + 0.06) / 1.06, 0.0, 1.0);
  float diff = wrapNdotL * 0.14 + NdotL * 0.86;

  vec3 albedo = vec3(0.91, 0.94, 0.98) * (0.94 + 0.10 * grain);
  vec3 direct = albedo * uSunColor * uSunIntensity * diff * cavityAO;

  float skyF = clamp(0.42 + 0.58 * sN.y, 0.16, 1.0);
  float shMicro = clamp(0.74 + 0.34 * dot(sN, normalize(vec3(-L.x, 0.72, -L.z))), 0.52, 1.24);
  vec3 ambSky = mix(uGroundBounce * 0.64, uShadowTint, skyF);
  vec3 indirect = albedo * ambSky * 0.64 * cavityAO * shMicro;

  vec3 H = normalize(L + V);
  float NdotH = max(dot(sN, H), 0.0001);
  float NdotV = max(dot(sN, V), 0.0);
  float fres = pow(max(1.0 - NdotV, 0.0001), 3.6);
  float spec = pow(NdotH, 16.0) * 0.20 * (0.35 + 0.65 * fres) + fres * 0.12 * (0.3 + 0.7 * NdotL);
  float backL = pow(max(clamp(dot(V, normalize(-L + sN * 0.42)), 0.0, 1.0), 0.0001), 3.0);
  vec3 sss = uSSSColor * (backL * 0.32 + fres * 0.14) * uSunColor;

  return direct + indirect + uSunColor * spec + sss;
}

void main() {
  vec3 geomN = normalize(vWorldNormal + vec3(1e-5));
  vec3 L = normalize(uSunDir + vec3(1e-5));
  vec3 V = normalize(cameraPosition - vWorldPos + vec3(1e-5));
  float camDist = length(cameraPosition - vWorldPos);

  vec3 snowCol = evalTerrainMatchedSnow(vWorldPos, geomN, L, V, camDist);
  vec3 col;

  if (vPart > 0.5) {
    // Seamless terrain-matched drifted snow collar anchoring rock/serac into the slope
    col = snowCol;
  } else if (uIsSerac > 0.5) {
    // --- PHOTOREAL FRACTURED GLACIAL SERAC ICEFALL ---
    vec3 pOff = vWorldPos + vec3(vSeed * 19.3, vSeed * 7.1, vSeed * 13.7);
    vec3 nMacro = sampleTriplanarNormal(uIceNormal, pOff, geomN, 0.24, 0.72);
    vec3 nFine  = sampleTriplanarNormal(uIceNormal, pOff, nMacro, 0.88, 0.45 * (1.0 - smoothstep(14.0, 90.0, camDist)));
    vec3 iN = normalize(nFine);

    vec3 det = sampleTriplanarRGB(uRockDetail, pOff, geomN, 0.32);
    float creaseAO = mix(0.42, 1.0, det.r);
    float strata = det.g;

    float NdotL = max(dot(iN, L), 0.0);
    float wrapL = clamp((dot(iN, L) + 0.22) / 1.22, 0.0, 1.0);
    float backSSS = pow(max(clamp(dot(V, -normalize(L + iN * 0.38)), 0.0, 1.0), 0.0001), 2.5);
    float fres = pow(max(1.0 - max(dot(iN, V), 0.0), 0.0001), 3.0);
    vec3 H = normalize(L + V);
    float iceSpec = pow(max(dot(iN, H), 0.0001), 96.0) * 1.15 + pow(max(dot(iN, H), 0.0001), 18.0) * 0.22;

    // Deep Vallée Blanche crevasse turquoise -> pale milky frost edges
    vec3 deepCyan  = vec3(0.05, 0.30, 0.58);
    vec3 midGlac   = vec3(0.28, 0.64, 0.88);
    vec3 frostEdge = vec3(0.76, 0.89, 0.98);
    vec3 iceAlbedo = mix(deepCyan, midGlac, clamp(strata * 0.75 + det.r * 0.35, 0.0, 1.0));
    iceAlbedo = mix(iceAlbedo, frostEdge, smoothstep(0.58, 0.88, det.g) * 0.52);

    vec3 skyRefl = mix(uSkyHorizon, uSkyZenith, clamp(iN.y * 0.5 + 0.5, 0.0, 1.0));
    vec3 iceLit = iceAlbedo * (uSunColor * uSunIntensity * (NdotL * 0.65 + wrapL * 0.35) * 0.65 + uShadowTint * 0.72) * creaseAO
                + vec3(0.14, 0.62, 0.98) * (backSSS * 0.78 + fres * 0.28) * uSunColor
                + skyRefl * fres * 0.42
                + uSunColor * iceSpec;

    // Natural wind-packed snow cornices on flatter upper shelves & fracture ledges
    float snowCap = smoothstep(0.50, 0.80, iN.y + (det.g - 0.5) * 0.28);
    col = mix(iceLit, snowCol, snowCap);
  } else {
    // --- PHOTOREAL TRIPLANAR ALPINE PROTOGINE GRANITE / VOLCANIC BASALT ---
    vec3 pOff = vWorldPos + vec3(vSeed * 23.1, vSeed * 11.7, vSeed * 17.9);
    float detailFade = 1.0 - smoothstep(10.0, 80.0, camDist);

    // 2-Octave Triplanar Normal Mapping completely removes any underlying polygon faceting!
    vec3 nMacro = sampleTriplanarNormal(uRockNormal, pOff, geomN, 0.42, 0.88);
    vec3 rN     = sampleTriplanarNormal(uRockNormal, pOff, nMacro, 1.75, 0.52 * detailFade);

    vec3 detM = sampleTriplanarRGB(uRockDetail, pOff, geomN, 0.42);
    vec3 detF = sampleTriplanarRGB(uRockDetail, pOff, geomN, 1.75);
    float rockAO = mix(0.28, 1.0, detM.r * 0.65 + detF.r * 0.35);
    float strata = detM.g * 0.62 + detF.g * 0.38;
    float grain  = detF.b;

    // Rich mineral palette: dark basalt fissures, cool slate granite faces, subtle warm quartz/ochre veins
    vec3 fissureDark = vec3(0.055, 0.062, 0.078);
    vec3 graniteMid  = mix(vec3(0.16, 0.175, 0.20), vec3(0.22, 0.21, 0.20), vSeed * 0.6);
    vec3 quartzLight = vec3(0.34, 0.345, 0.36);

    vec3 rockAlbedo = mix(fissureDark, graniteMid, smoothstep(0.18, 0.62, strata));
    rockAlbedo = mix(rockAlbedo, quartzLight, smoothstep(0.55, 0.88, grain) * 0.45);
    rockAlbedo *= (0.78 + 0.35 * detF.r);

    float NdotL = max(dot(rN, L), 0.0);
    float skyF = clamp(0.35 + 0.65 * rN.y, 0.12, 1.0);
    vec3 amb = mix(uGroundBounce * 0.52, uShadowTint * 0.82, skyF);

    // Subtle damp/frosted crystalline rock specular on fractured facets
    vec3 H = normalize(L + V);
    float rockSpec = pow(max(dot(rN, H), 0.0001), 28.0) * (0.08 + grain * 0.12) * NdotL;
    vec3 rockLit = rockAlbedo * (uSunColor * uSunIntensity * NdotL * 0.82 + amb * 0.58) * rockAO
                 + uSunColor * rockSpec * rockAO;

    // Natural snow accumulation: settles thickly on top ledges AND packs into windward horizontal cracks!
    float topMask = smoothstep(0.38, 0.72, rN.y + (strata - 0.5) * 0.34);
    float crackFrost = smoothstep(0.20, 0.55, rN.y) * smoothstep(0.58, 0.24, detM.r) * 0.55;
    float snowMask = clamp(max(topMask, crackFrost), 0.0, 1.0);

    col = mix(rockLit, snowCol, snowMask);
  }

  // Exact terrain Rayleigh/Mie aerial perspective fog
  float effFogDens = uFogDensity * (1.0 + uSquallIntensity * 3.8);
  float fogAmt = 1.0 - exp(-pow(max(camDist * effFogDens, 0.0001), 1.32));
  float sunScatter = pow(max(dot(-V, L), 0.0001), 4.0) * (1.0 - uSquallIntensity * 0.85);
  vec3 aerialColor = mix(uFogColor, uSunColor * 1.06, sunScatter * 0.48);
  col = mix(col, aerialColor, clamp(fogAmt, 0.0, 0.94));

  gl_FragColor = vec4(col, 0.55);
}
