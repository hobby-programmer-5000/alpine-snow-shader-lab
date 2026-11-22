// ============================================================================
// PHOTOREAL Terrain-Matched Sculpted Snow Kicker Ramp Fragment Shader
// Replaces the smooth untextured half-dome look with wind-sculpted sastrugi,
// packed take-off ski tracks, blue undercut lip shadow, SSS translucency &
// feathered perimeter dissolving seamlessly into the alpine terrain snowpack!
// ============================================================================

precision highp float;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uShadowTint;
uniform vec3 uGroundBounce;
uniform vec3 uSSSColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uSquallIntensity;

uniform sampler2D uSnowNormal;
uniform sampler2D uSnowCavity;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv; // x: lateral [0..1], y: entry (0) -> launch lip (0.82) -> dropoff (1)

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  // Smooth organic edge feathering so the sculpted snow ramp melts invisibly into the slope!
  float edgeX = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
  float edgeY = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
  float alpha = edgeX * edgeY;
  if (!(alpha > 0.015)) discard;

  vec3 geomN = normalize(vWorldNormal + vec3(1e-5));
  vec3 L = normalize(uSunDir + vec3(1e-5));
  vec3 V = normalize(cameraPosition - vWorldPos + vec3(1e-5));
  float camDist = length(cameraPosition - vWorldPos);

  // Multi-scale terrain-exact sastrugi snow normals + cavity AO
  vec2 wpXZ = vWorldPos.xz;
  vec2 uv1 = vec2(wpXZ.x * 0.220 - wpXZ.y * 0.090, wpXZ.x * 0.090 + wpXZ.y * 0.220);
  vec2 uv2 = vec2(wpXZ.x * 0.920 + wpXZ.y * 0.340, -wpXZ.x * 0.340 + wpXZ.y * 0.920);
  float fClose = 1.0 - smoothstep(8.0, 64.0, camDist);

  vec2 sn1 = (texture2D(uSnowNormal, uv1).xy * 2.0 - 1.0) * 0.32;
  vec2 sn2 = (texture2D(uSnowNormal, uv2).xy * 2.0 - 1.0) * 0.24 * fClose;

  // Subtle carved ski run-in tracks along the kicker take-off face!
  float trackWave = sin((vUv.x - 0.5) * 28.0) * 0.5 + 0.5;
  float takeOffMask = smoothstep(0.08, 0.35, vUv.y) * (1.0 - smoothstep(0.76, 0.84, vUv.y)) * smoothstep(0.42, 0.12, abs(vUv.x - 0.5));
  float grooveAO = 1.0 - trackWave * takeOffMask * 0.12;

  vec3 N = normalize(geomN + vec3(sn1.x + sn2.x, 0.0, sn1.y + sn2.y));
  vec3 cav1 = texture2D(uSnowCavity, uv1).rgb;
  vec3 cav2 = texture2D(uSnowCavity, uv2).rgb;
  float cavityAO = mix(1.0, cav1.r * 0.58 + cav2.r * 0.42, 0.78) * grooveAO;

  // Crisp compressed blue-white icy take-off lip & shadowed back face
  float lipBand = smoothstep(0.74, 0.83, vUv.y) * (1.0 - smoothstep(0.84, 0.94, vUv.y));
  float backDrop = smoothstep(0.82, 0.90, vUv.y);

  float NdotL = max(dot(N, L), 0.0);
  float wrapNdotL = clamp((dot(N, L) + 0.06) / 1.06, 0.0, 1.0);
  float diff = wrapNdotL * 0.14 + NdotL * 0.86;

  vec3 snowAlbedo = vec3(0.91, 0.94, 0.98) * (0.94 + 0.10 * cav2.b);
  snowAlbedo = mix(snowAlbedo, vec3(0.80, 0.90, 0.99), lipBand * 0.38);
  snowAlbedo = mix(snowAlbedo, vec3(0.68, 0.82, 0.96), backDrop * 0.35);

  vec3 direct = snowAlbedo * uSunColor * uSunIntensity * diff * cavityAO;
  float skyF = clamp(0.42 + 0.58 * N.y, 0.16, 1.0);
  float shMicro = clamp(0.74 + 0.34 * dot(N, normalize(vec3(-L.x, 0.72, -L.z))), 0.52, 1.24);
  vec3 indirect = snowAlbedo * mix(uGroundBounce * 0.64, uShadowTint, skyF) * 0.64 * cavityAO * shMicro;

  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0001);
  float NdotV = max(dot(N, V), 0.0);
  float fres = pow(max(1.0 - NdotV, 0.0001), 3.6);
  float spec = pow(NdotH, mix(18.0, 64.0, lipBand)) * (0.24 + lipBand * 0.45) * (0.35 + 0.65 * fres);
  float backL = pow(max(clamp(dot(V, normalize(-L + N * 0.42)), 0.0, 1.0), 0.0001), 3.0);
  vec3 sss = uSSSColor * (backL * 0.42 + fres * 0.18) * (0.35 + lipBand * 0.9) * uSunColor;

  // Fine sun glints on packed kicker lip
  vec2 gCell = floor(wpXZ * 7.5);
  float gh = hash21(gCell);
  float spark = step(0.96, gh) * pow(NdotH, 32.0) * (1.0 - smoothstep(10.0, 48.0, camDist)) * 1.4;

  vec3 col = direct + indirect + sss + uSunColor * (spec + spark);

  float effFogDens = uFogDensity * (1.0 + uSquallIntensity * 3.8);
  float fogAmt = 1.0 - exp(-pow(max(camDist * effFogDens, 0.0001), 1.32));
  float sunScatter = pow(max(dot(-V, L), 0.0001), 4.0) * (1.0 - uSquallIntensity * 0.85);
  col = mix(col, mix(uFogColor, uSunColor * 1.06, sunScatter * 0.48), clamp(fogAmt, 0.0, 0.94));

  gl_FragColor = vec4(col, alpha);
}
