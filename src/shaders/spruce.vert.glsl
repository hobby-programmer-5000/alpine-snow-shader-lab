// ============================================================================
// Photorealistic 3D Hierarchical Norway Spruce Vertex Shader
// aMat: x = matType (0=bark, 1=needles, 2=snowPillow), y = coreAO, z = hNorm [0..1]
// ============================================================================

attribute vec3 aMat;
attribute float aTint;

uniform float uTime;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vMat;
varying float vTint;

void main() {
  vec4 instOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float phase = instOrigin.x * 0.37 + instOrigin.z * 0.29;

  // Elastic cantilever wind sway + subtle bough-tip flutter (exact physics pattern!)
  float h = clamp(aMat.z, 0.0, 1.0);
  float bend = pow(h, 1.65);
  float tipMask = smoothstep(0.35, 1.0, aMat.y);
  float swayX = sin(uTime * 1.55 + phase) * 0.24 * bend + sin(uTime * 4.6 + position.y * 2.2 + phase) * 0.032 * tipMask;
  float swayZ = cos(uTime * 1.28 + phase * 1.3) * 0.16 * bend;

  vec3 displaced = position + vec3(swayX, 0.0, swayZ);
  vec4 worldPos = modelMatrix * instanceMatrix * vec4(displaced, 1.0);

  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vMat = aMat;
  vTint = aTint;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
