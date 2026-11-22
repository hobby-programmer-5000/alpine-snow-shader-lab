// ============================================================================
// Dual-Kind Procedural Powder Spray & Avalanche Billow Vertex Shader
//   aKind = 0.0: Carve rooster-tail spray | aKind = 1.0: Huge Slab Avalanche billows!
// ============================================================================

attribute float aAge;
attribute float aSize;
attribute float aSeed;
attribute float aKind;

uniform float uPixelRatio;

varying float vAge;
varying float vSeed;
varying float vKind;
varying float vCamFade;
varying vec3 vWorldPos;

void main() {
  vAge = aAge;
  vSeed = aSeed;
  vKind = aKind;

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;

  vec4 mvPos = viewMatrix * worldPos;
  float dist = max(-mvPos.z, 0.5);
  // Smooth near-camera proximity fade so billboards never pop harshly into the lens
  vCamFade = smoothstep(0.65, 2.4, dist);

  float expand = aKind > 0.5
    ? mix(0.65, 3.1, pow(clamp(aAge, 0.0, 1.0), 0.58))
    : mix(0.45, 2.25, pow(clamp(aAge, 0.0, 1.0), 0.65));

  float maxPx = aKind > 0.5 ? 280.0 : 140.0;
  float ptSize = (aSize * expand * 290.0 * uPixelRatio) / dist;

  gl_PointSize = (aAge >= 0.0 && aAge < 1.0) ? clamp(ptSize, 1.0, maxPx) : 0.0;
  gl_Position = projectionMatrix * mvPos;
}
