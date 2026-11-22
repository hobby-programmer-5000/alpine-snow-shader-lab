// ============================================================================
// Pass 2: Anti-Aliased Twin-Ski / Pole / Brush Snow Deformation Stamper
// Inspired by GDC 2014 Deformable Snow Heightfield Buffers & Nyquist-safe AA U-trenches.
// Writes to RGBA16F Ping-Pong Track FBO:
//   R = U-trench depression depth [0..1]
//   G = Flanking pushed-out snow berm height [0..1] (strictly outside trench walls + center ridge!)
//   B = Edge-carved compacted ice glint intensity [0..1]
//   A = Track rim crispness / freshness [0..1]
// ============================================================================

precision highp float;

uniform sampler2D uPrev;
uniform float uTrackRes;
uniform vec2 uLA;        // Left ski previous UV
uniform vec2 uLB;        // Left ski current UV
uniform vec2 uRA;        // Right ski previous UV
uniform vec2 uRB;        // Right ski current UV
uniform float uMode;     // 0 = Twin Skis, 1 = Single Brush/Pole Capsule, 2 = Pole Dimple Pair
uniform float uRadiusUV; // Half-width of ski trench in UV space
uniform float uDepth;    // Target carving depth [0..1]
uniform float uBerm;     // Flanking snow berm strength [0..1]
uniform float uIceGlint; // Edge compaction specular intensity [0..1]
uniform float uEdgeBias; // -1..+1 carving roll bias (outside edge builds taller berm!)

varying vec2 vUv;

// Returns: x = unsigned distance to segment, y = signed perpendicular side, z = signed overshoot outside [a, b]
vec3 evalCapsule(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float len2 = dot(ab, ab);
  float segLen = sqrt(max(len2, 1e-10));
  vec2 dir = ab / segLen;
  float along = dot(p - a, dir);
  float clampedAlong = clamp(along, 0.0, segLen);
  vec2 closest = a + dir * clampedAlong;
  vec2 diff = p - closest;
  float dist = length(diff);
  vec2 rightN = vec2(-dir.y, dir.x);
  float side = dot(diff, rightN);
  // Zero strictly along the segment [0..segLen], positive outside either endcap -> 100% seamless joint weld!
  float endOvershoot = max(-along, along - segLen);
  return vec3(dist, side, endOvershoot);
}

// Compute Nyquist-safe anti-aliased U-trench and flanking berm profile for one ski/capsule
// Returns vec3(trench, berm, iceGlint)
vec3 evalSkiProfile(vec3 cap, float radiusUV, float depth, float bermStrength, float iceStrength, float edgeBias) {
  float d = cap.x;
  float texelUV = 1.0 / uTrackRes;
  // Guarantee >= 2.35 texel edge feathering so diagonal carved curves never show stair-step scallops!
  float feather = max(radiusUV * 0.48, texelUV * 2.35);

  // 1. Deep smooth U-trench depression
  float normD = d / max(radiusUV, texelUV);
  float uWall = 1.0 - smoothstep(radiusUV - feather * 0.65, radiusUV + feather * 0.75, d);
  float bowlCurve = clamp(1.0 - 0.38 * normD * normD, 0.0, 1.0);
  float trench = uWall * mix(0.65, 1.0, bowlCurve) * depth;

  // 2. Continuous C1-welded flanking snow berm strictly alongside [a..b] (1.0 right up to joint, 0 past endcaps!)
  float bermCenter = radiusUV * 1.92 + feather * 0.55;
  float bermHalfW  = radiusUV * 1.35 + feather * 0.85;
  float bDist = abs(d - bermCenter) / max(bermHalfW, texelUV);
  float bermBell = max(0.0, 1.0 - bDist * bDist);
  bermBell = bermBell * bermBell * (3.0 - 2.0 * bermBell);

  float outsideMask = smoothstep(radiusUV * 0.85, radiusUV * 1.45, d);
  float seamMask = 1.0 - smoothstep(0.0, max(radiusUV * 0.35, texelUV * 2.5), cap.z);
  float sideSign = cap.y >= 0.0 ? 1.0 : -1.0;
  float asymGain = clamp(1.0 + sideSign * edgeBias * 0.58, 0.42, 1.65);
  float berm = bermBell * outsideMask * seamMask * bermStrength * asymGain;

  // 3. Compacted ice sheen along the sheared trench base & carved inner edge
  float iceBand = uWall * smoothstep(radiusUV * 1.05, radiusUV * 0.25, d);
  float ice = iceBand * iceStrength;

  return vec3(trench, berm, ice);
}

void main() {
  vec4 prev = texture2D(uPrev, vUv);

  vec3 resL = vec3(0.0);
  vec3 resR = vec3(0.0);

  if (uMode < 0.5) {
    // Mode 0: Twin carving skis
    vec3 capL = evalCapsule(vUv, uLA, uLB);
    vec3 capR = evalCapsule(vUv, uRA, uRB);
    resL = evalSkiProfile(capL, uRadiusUV, uDepth, uBerm, uIceGlint, uEdgeBias);
    resR = evalSkiProfile(capR, uRadiusUV, uDepth, uBerm, uIceGlint, uEdgeBias);

    // Center snow ridge between the two parallel skis piles slightly crisper where both inner berms meet
    float combinedTrench = max(resL.x, resR.x);
    float combinedBerm = clamp(resL.y + resR.y * 0.92, 0.0, 1.0);
    // Any active ski trench carves cleanly through overlapping berms (prevents cross-track mound artifacts)
    combinedBerm *= (1.0 - smoothstep(0.08, 0.35, combinedTrench));

    float combinedIce = max(resL.z, resR.z);

    // Merge into existing FBO state: new trench can carve right through old berms!
    float finalTrench = max(prev.r, combinedTrench);
    float oldBermCarved = prev.g * (1.0 - smoothstep(0.06, 0.38, combinedTrench));
    float finalBerm = clamp(max(oldBermCarved, combinedBerm), 0.0, 1.0);
    float finalIce = max(prev.b, combinedIce);
    float finalFresh = max(prev.a, max(combinedTrench, combinedBerm * 0.8));

    gl_FragColor = vec4(finalTrench, finalBerm, finalIce, finalFresh);
  } else if (uMode < 1.5) {
    // Mode 1: Single interactive mouse brush carve
    vec3 cap = evalCapsule(vUv, uLA, uLB);
    resL = evalSkiProfile(cap, uRadiusUV, uDepth, uBerm, uIceGlint, 0.0);

    float finalTrench = max(prev.r, resL.x);
    float oldBermCarved = prev.g * (1.0 - smoothstep(0.06, 0.38, resL.x));
    float finalBerm = clamp(max(oldBermCarved, resL.y), 0.0, 1.0);
    float finalIce = max(prev.b, resL.z);
    float finalFresh = max(prev.a, max(resL.x, resL.y));

    gl_FragColor = vec4(finalTrench, finalBerm, finalIce, finalFresh);
  } else {
    // Mode 2: Circular pole plant dimple
    float d = length(vUv - uLB);
    float texelUV = 1.0 / uTrackRes;
    float r = max(uRadiusUV, texelUV * 2.5);
    float dimple = (1.0 - smoothstep(r * 0.35, r * 1.35, d)) * uDepth;
    float ring = exp(-pow((d - r * 1.45) / (r * 0.65), 2.0)) * uBerm * 0.75;

    float finalTrench = max(prev.r, dimple);
    float finalBerm = clamp(max(prev.g * (1.0 - dimple * 0.8), ring), 0.0, 1.0);
    gl_FragColor = vec4(finalTrench, finalBerm, max(prev.b, dimple * 0.4), max(prev.a, dimple));
  }
}
