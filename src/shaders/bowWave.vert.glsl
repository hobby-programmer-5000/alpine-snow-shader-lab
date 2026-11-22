// ============================================================================
// Ski Bow-Wave Snow-Curling Ribbon Vertex Shader
// Curls & lifts frothy powder wake ribbons along the front edges of carving skis!
// ============================================================================

uniform float uTime;
uniform float uSpeed;
uniform float uEdgeAngle;
uniform float uAirborne;

varying vec2 vUv;
varying float vCurl;

void main() {
  vUv = uv;
  vec3 pos = position;

  float speedNorm = clamp((uSpeed - 3.5) / 14.0, 0.0, 1.0);
  float groundMask = 1.0 - smoothstep(0.02, 0.14, uAirborne);
  float wakeActive = speedNorm * groundMask;

  // uv.x: 0 = ski tip -> 1 = ski tail; uv.y: 0 = snow base -> 1 = curling powder crest
  float arcProfile = sin(uv.x * 3.14159);
  float flutter = sin(uv.x * 16.0 - uTime * 22.0) * 0.025 + cos(uv.x * 9.0 - uTime * 15.0) * 0.018;

  // Lift & flare outward as carving speed increases
  float crestH = (0.14 + abs(uEdgeAngle) * 0.34) * wakeActive * arcProfile;
  pos.y *= (0.15 + crestH * 3.4);
  pos.y += flutter * uv.y * wakeActive;
  pos.x += sign(pos.x) * (uv.y * uv.y * (0.09 + abs(uEdgeAngle) * 0.22) * wakeActive * arcProfile);

  vCurl = uv.y * wakeActive;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
