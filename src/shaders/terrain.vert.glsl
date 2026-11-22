// ============================================================================
// Master Alpine Terrain Vertex Shader
//   - Dual-Engine Terrain (Procedural Zero-Asset OR Real Hallasan/Seoraksan DEM)
//   - 2-Ring Adaptive Geometry Clipmap (10cm inner patch + 1400m outer massif!)
//   - 5-Tap Smoothed Ping-Pong FBO Carved Track + Berm Displacement
//   - Dynamic Slab Avalanche Crown Fracture Wall & Advancing Surge Wave Displacement!
// ============================================================================

uniform vec2 uSnapCenter;
uniform float uInnerHalf;
uniform float uIsOuterRing;

uniform sampler2D uTrackTex;
uniform vec2 uTrackOrigin;
uniform float uTrackSpan;
uniform float uTrackRes;
uniform float uTrenchDepth;
uniform float uBermHeight;
uniform float uEnableTracks;
uniform float uEnableBerms;

// Live Dynamic Slab Avalanche uniforms
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

float sampleSmoothTrackDisp(vec2 uv) {
  // Resolution-independent 9-tap isotropic Gaussian pre-filter (~13cm world radius) matches
  // the clipmap vertex Nyquist limit at 1024/1536/2048 FBO alike -> ZERO diagonal quad sawtooth!
  // Meanwhile terrain.frag.glsl keeps full 2.34cm/px FBO micro-normal & 16-step shadow sharpness!
  float stepUv = 0.135 / uTrackSpan;
  vec4 c00 = texture2D(uTrackTex, clamp(uv + vec2(-stepUv, -stepUv), 0.002, 0.998));
  vec4 c10 = texture2D(uTrackTex, clamp(uv + vec2(    0.0, -stepUv), 0.002, 0.998));
  vec4 c20 = texture2D(uTrackTex, clamp(uv + vec2( stepUv, -stepUv), 0.002, 0.998));
  vec4 c01 = texture2D(uTrackTex, clamp(uv + vec2(-stepUv,     0.0), 0.002, 0.998));
  vec4 c11 = texture2D(uTrackTex, clamp(uv,                          0.002, 0.998));
  vec4 c21 = texture2D(uTrackTex, clamp(uv + vec2( stepUv,     0.0), 0.002, 0.998));
  vec4 c02 = texture2D(uTrackTex, clamp(uv + vec2(-stepUv,  stepUv), 0.002, 0.998));
  vec4 c12 = texture2D(uTrackTex, clamp(uv + vec2(    0.0,  stepUv), 0.002, 0.998));
  vec4 c22 = texture2D(uTrackTex, clamp(uv + vec2( stepUv,  stepUv), 0.002, 0.998));

  vec4 tr = (c11 * 4.0 + (c10 + c01 + c21 + c12) * 2.0 + (c00 + c20 + c02 + c22)) / 16.0;
  return -tr.r * uTrenchDepth * uEnableTracks + tr.g * uBermHeight * uEnableBerms;
}

void main() {
  vec2 localXZ = position.xz;

  // Outer ring extends out to 1350m on real Korean DEM so whole Hallasan/Seoraksan massif renders!
  float outerMax = uUseDem > 0.5 ? 1350.0 : 720.0;
  if (uIsOuterRing > 0.5) {
    float maxAxis = max(abs(localXZ.x), abs(localXZ.y));
    float t = clamp(maxAxis - 1.0, 0.0, 1.0);
    float radial = mix(uInnerHalf - 0.30, outerMax, pow(t, 2.7));
    vec2 dir = localXZ / max(maxAxis, 1e-5);
    localXZ = dir * radial;
  }

  vec2 worldXZ = uSnapCenter + localXZ;
  float baseH = evalAlpineHeight(worldXZ);

  // 1. World-locked Ping-Pong Carved Snow FBO displacement
  vec2 trackUv = (worldXZ - uTrackOrigin) / uTrackSpan + 0.5;
  vec2 borderDist = min(trackUv, 1.0 - trackUv);
  float trackFade = smoothstep(0.015, 0.09, min(borderDist.x, borderDist.y));

  float disp = 0.0;
  if (trackFade > 0.001 && uIsOuterRing < 0.5) {
    float innerEdge = smoothstep(uInnerHalf, uInnerHalf - 2.2, max(abs(localXZ.x), abs(localXZ.y)));
    disp = sampleSmoothTrackDisp(trackUv) * trackFade * innerEdge;
  }

  // 2. Dynamic Slab Avalanche geometric deformation (Crown Drop + Scraped Bed + Surging Wave!)
  float avyBed = 0.0;
  float avyCrown = 0.0;
  if (uAvyActive > 0.01) {
    vec2 rel = worldXZ - uAvyOrigin;
    vec2 right = vec2(-uAvyDir.y, uAvyDir.x);
    float lat = dot(rel, right);
    float crownJitter = avyCrownNoise(lat);
    float along = dot(rel, uAvyDir) - crownJitter;

    float halfW = uAvyWidth * (0.85 + clamp(along * 0.004, 0.0, 0.55));
    float latMask = 1.0 - smoothstep(halfW * 0.72, halfW * 1.05, abs(lat));
    float archFront = uAvyFront - (lat * lat) / max(halfW * halfW, 1.0) * 5.2;

    float pastCrown = smoothstep(-0.6, 1.1, along);
    float behindFront = 1.0 - smoothstep(archFront - 5.5, archFront + 1.5, along);
    avyBed = pastCrown * behindFront * latMask * uAvyActive;

    // Exposed vertical fracture wall right at along ~ 0
    avyCrown = exp(-pow(along / 1.15, 2.0)) * latMask * smoothstep(0.5, 4.0, uAvyFront) * uAvyActive;

    // Leading surging slab wave piling up right at archFront!
    float surgeWave = exp(-pow((along - archFront + 2.2) / 3.8, 2.0)) * latMask * uAvyActive;

    // Carve scraped slab bed down by -0.68m, raise surging powder wave crest by +0.72m!
    disp += (-avyBed * 0.68 + surgeWave * 0.72);
  }

  vec3 worldPos = vec3(worldXZ.x, baseH + disp, worldXZ.y);
  vWorldPos = worldPos;
  vTrackUv = trackUv;
  vTrackFade = trackFade;
  vRingMask = uIsOuterRing;
  vAvyBedMask = avyBed;
  vAvyCrownMask = avyCrown;

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
