// ============================================================================
// Instanced Ground Contact Shadow & Sunken Tree-Well Decal Vertex Shader
// Projects conical spruce shadows & boulder shadows along -uSunDir.xz and
// snaps every subdivided decal vertex directly onto real terrain height!
// ============================================================================

attribute vec4 aShadowData; // x = worldX, y = worldZ, z = crownRadius, w = objectHeight
attribute vec2 aShadowMeta; // x = type (0 = spruce tree-well + cone, 1 = boulder/serac), y = seed

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uShadowTint;

varying vec2 vLocalUV;
varying float vType;
varying float vSeed;
varying float vCastRatio;
varying float vLitFactor;
varying vec3 vShadowMult;

// TERRAIN_COMMON_INJECT

void main() {
  vec2 baseXZ = aShadowData.xy;
  float crownR = aShadowData.z;
  float objH = aShadowData.w;
  vType = aShadowMeta.x;
  vSeed = aShadowMeta.y;

  vec3 L = normalize(uSunDir);
  vec3 groundN = evalAlpineNormal(baseXZ, 0.8);
  float slopeLit = max(dot(groundN, L), 0.0);
  vLitFactor = smoothstep(0.04, 0.22, L.y) * smoothstep(0.02, 0.20, slopeLit);

  // Ray-ground cast length along -L.xz (clamped cleanly for grazing sunset angles)
  vec2 castDir = normalize(-L.xz + vec2(1e-5));
  vec2 sideDir = vec2(-castDir.y, castDir.x);
  float horizL = length(L.xz);
  float castLen = clamp((objH * max(0.35, groundN.y) / max(0.24, dot(groundN, L))) * horizL, crownR * 0.65, min(objH * 1.9, 20.0));

  // Local plane coordinates: position.x in [-0.5..+0.5], position.z in [-0.5..+0.5]
  // Stretch along castDir from -crownR*1.15 (behind trunk) to +castLen + crownR*0.6 (tip of shadow)
  float uAlong = position.z + 0.5; // [0..1]
  float lateral = position.x * (crownR * 3.1);
  float forward = mix(-crownR * 1.15, castLen + crownR * 0.55, uAlong);

  vec2 worldXZ = baseXZ + castDir * forward + sideDir * lateral;
  float terrainH = evalAlpineHeight(worldXZ);

  // Subtle distance-scaled lift prevents z-fighting on steep DEM slopes
  float camDist = length(cameraPosition - vec3(worldXZ.x, terrainH, worldXZ.y));
  float lift = 0.035 + clamp(camDist * 0.00055, 0.0, 0.14);

  vLocalUV = vec2(lateral / max(crownR, 0.1), forward / max(castLen, 0.1));
  vCastRatio = castLen / max(crownR, 0.1);

  // Calibrated cool cobalt-slate multiplicative tint (matches HDR shadow fill tone!)
  vShadowMult = mix(vec3(0.28, 0.42, 0.66), vec3(0.36, 0.44, 0.68), clamp(1.0 - L.y * 1.6, 0.0, 1.0));

  gl_Position = projectionMatrix * viewMatrix * vec4(worldXZ.x, terrainH + lift, worldXZ.y, 1.0);
}
