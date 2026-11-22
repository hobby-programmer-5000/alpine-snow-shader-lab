// ============================================================================
// 2,600 Wrapping Airborne Snowflakes & Prismatic Diamond-Dust Vertex Shader
// Wraps an infinite 3D snow volume purely on the GPU around cameraPosition!
// ============================================================================

attribute float aSeed;
attribute float aKind; // 0 = gentle drifting snowflake, 1 = HDR sparkling diamond-dust mote!

uniform float uTime;
uniform float uPixelRatio;
uniform float uWindX;
uniform float uSquall;

varying float vKind;
varying float vSeed;
varying float vTwinkle;
varying float vFade;

void main() {
  vKind = aKind;
  vSeed = aSeed;

  // Wrapping box centered on camera (22m x 12m x 22m for dense near-camera parallax!)
  vec3 boxSize = vec3(22.0, 12.0, 22.0);
  float fallSpeed = aKind > 0.5 ? (0.45 + aSeed * 0.35) : (1.15 + aSeed * 0.95);
  float windPush = (uWindX * 1.6 + uSquall * 5.5) * (0.7 + aSeed * 0.6);

  vec3 drift = vec3(
    uTime * windPush + sin(uTime * 1.3 + aSeed * 25.0) * 0.85,
    -uTime * fallSpeed,
    cos(uTime * 1.1 + aSeed * 19.0) * 0.75 - uTime * uSquall * 2.5
  );

  // Modulo wrap cleanly inside box centered on cameraPosition
  vec3 rel = mod(position + drift - cameraPosition, boxSize) - boxSize * 0.5;
  vec3 worldPos = cameraPosition + rel;

  vec4 mvPos = viewMatrix * vec4(worldPos, 1.0);
  float dist = max(-mvPos.z, 0.4);

  // Concentrate diamond dust smoothly inside 1.2m..15m sparkling air volume!
  float nearFade = smoothstep(0.75, 2.0, dist);
  float farFade = 1.0 - smoothstep(8.5, 16.5, dist);
  vFade = nearFade * farFade * (aKind > 0.5 ? 1.0 : (0.48 + uSquall * 0.52));

  // Sharp view-time ice-crystal twinkle for HDR diamond dust
  float phase = uTime * (4.5 + aSeed * 7.0) + aSeed * 62.0;
  vTwinkle = aKind > 0.5 ? pow(max(0.5 + 0.5 * sin(phase), 0.0001), 10.0) : 0.0;

  float basePx = aKind > 0.5 ? (1.4 + vTwinkle * 2.8) : (2.2 + aSeed * 2.4 + uSquall * 1.6);
  gl_PointSize = clamp((basePx * 10.5 * uPixelRatio) / dist, 1.0, 14.0);
  gl_Position = projectionMatrix * mvPos;
}
