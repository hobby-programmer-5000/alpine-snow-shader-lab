// ============================================================================
// Shared Dual-Engine Alpine Terrain Library (1:1 CPU <-> GPU Parity)
//   - uUseDem < 0.5 : 100% Zero-Asset Procedural Alpine Massif
//   - uUseDem > 0.5 : Real Korean DEM (Hallasan / Seoraksan — manual 4-tap RG16)
// ============================================================================

uniform float uUseDem;
uniform sampler2D uDemTex;
uniform float uDemSize;
uniform float uDemSpan;
uniform float uDemMaxElev;

float valleyCenterX(float z) {
  return 22.0 * sin(z * 0.0085) + 11.0 * cos(z * 0.0041 + 0.7);
}

float smoothRidge(float v) {
  return 1.0 - sqrt(v * v + 0.012);
}

float evalMicroDrift(vec2 xz) {
  return 0.14 * sin(xz.x * 0.29 + xz.y * 0.23) * cos(xz.x * 0.17 - xz.y * 0.31);
}

float evalProceduralHeight(vec2 xz) {
  float x = xz.x;
  float z = xz.y;

  float baseSlope = z * 0.275;
  float rollers =
    2.8 * sin(x * 0.036 + z * 0.025) +
    1.6 * cos(x * 0.072 - z * 0.052 + 1.1) +
    0.55 * sin(x * 0.14 + z * 0.11 - 0.5);

  float cx = valleyCenterX(z);
  float distFromCenter = abs(x - cx);
  float wallMask = smoothstep(14.0, 95.0, distFromCenter);
  float peakMask = smoothstep(32.0, 210.0, distFromCenter);

  float r1 = smoothRidge(sin(x * 0.0115 + z * 0.0082 + 0.4));
  float r2 = smoothRidge(sin(-x * 0.0094 + z * 0.0137 + 1.7));
  float r3 = smoothRidge(sin(x * 0.023 - z * 0.019 + 2.5));
  float r4 = smoothRidge(sin(x * 0.044 + z * 0.038 - 0.9));

  float ridgeMountains =
    (r1 * r2 * 138.0 + r3 * 38.0 + r4 * 12.0) * peakMask +
    (wallMask * wallMask * 54.0);

  return baseSlope + rollers * (1.0 - 0.35 * wallMask) + ridgeMountains + evalMicroDrift(xz);
}

float decodeDemCorner(vec2 texelIdx, float invSize) {
  vec4 p = texture2D(uDemTex, (texelIdx + 0.5) * invSize);
  float hi = floor(p.r * 255.0 + 0.5);
  float lo = floor(p.g * 255.0 + 0.5);
  return ((hi * 256.0 + lo) / 65535.0) * uDemMaxElev;
}

// Manual 4-tap bilinear over NearestFilter 16-bit RG texture -> ZERO contour-line spikes & 1:1 CPU parity!
float evalDemHeight(vec2 xz) {
  vec2 uv = clamp(xz / uDemSpan + 0.5, 0.0, 1.0);
  float maxIdx = uDemSize - 1.0;
  float invSize = 1.0 / uDemSize;
  vec2 f = uv * maxIdx;
  vec2 i0 = floor(f);
  vec2 i1 = min(i0 + 1.0, vec2(maxIdx));
  vec2 t = f - i0;

  float h00 = decodeDemCorner(vec2(i0.x, i0.y), invSize);
  float h10 = decodeDemCorner(vec2(i1.x, i0.y), invSize);
  float h01 = decodeDemCorner(vec2(i0.x, i1.y), invSize);
  float h11 = decodeDemCorner(vec2(i1.x, i1.y), invSize);

  float hx0 = mix(h00, h10, t.x);
  float hx1 = mix(h01, h11, t.x);
  return mix(hx0, hx1, t.y) + evalMicroDrift(xz);
}

float evalAlpineHeight(vec2 xz) {
  if (uUseDem > 0.5) return evalDemHeight(xz);
  return evalProceduralHeight(xz);
}

vec3 evalAlpineNormal(vec2 xz, float eps) {
  float hL = evalAlpineHeight(xz - vec2(eps, 0.0));
  float hR = evalAlpineHeight(xz + vec2(eps, 0.0));
  float hD = evalAlpineHeight(xz - vec2(0.0, eps));
  float hU = evalAlpineHeight(xz + vec2(0.0, eps));
  return normalize(vec3(hL - hR, 2.0 * eps, hD - hU));
}

// Shared jagged crown-fracture displacement math for Live Slab Avalanche!
float avyCrownNoise(float lat) {
  return sin(lat * 0.24) * 2.1 + cos(lat * 0.57 + 1.2) * 0.95 + sin(lat * 1.15 - 0.6) * 0.42;
}
