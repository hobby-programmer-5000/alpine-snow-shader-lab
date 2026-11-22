// ============================================================================
// PHOTOREAL Jumpable 3D Parallax Glacial Crevasse Fissure Fragment Shader
// Replaces the rectangular solid-navy sticker with an organic jagged glacier
// crack, overhanging sunlit snow cornice lips & view-parallax cyan ice cavern!
// ============================================================================

precision highp float;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uShadowTint;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uSquallIntensity;

uniform sampler2D uIceNormal;
uniform sampler2D uSnowNormal;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv; // x: across width [0..1], y: across crack opening [0..1]

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.5);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.08 + vec2(3.7, 8.1);
    a *= 0.5;
  }
  return v;
}

void main() {
  // Organic jagged crevasse crack centerline tapering smoothly to sharp fracture tips at x=0 and x=1!
  float xCenter = (vUv.x - 0.5) * 2.0; // [-1..1]
  float tipTaper = max(0.0, 1.0 - xCenter * xCenter);
  float jag = (fbm(vec2(vUv.x * 7.5 + vWorldPos.x * 0.12, 1.3)) - 0.5) * 0.24
            + (vnoise(vec2(vUv.x * 22.0, 4.7)) - 0.5) * 0.07;

  float halfWidth = (0.28 * pow(max(tipTaper, 0.0001), 0.55)) * (0.78 + 0.44 * vnoise(vec2(vUv.x * 11.0, 2.1)));
  float dy = abs((vUv.y - 0.5) + jag);

  // Soft snow-collar fade outside the cracked lip
  float outerLip = 1.0 - smoothstep(halfWidth, halfWidth + 0.18, dy);
  if (!(outerLip > 0.015)) discard;

  vec3 geomN = normalize(vWorldNormal + vec3(1e-5));
  vec3 L = normalize(uSunDir + vec3(1e-5));
  vec3 V = normalize(cameraPosition - vWorldPos + vec3(1e-5));
  float camDist = length(cameraPosition - vWorldPos);

  float chasmMask = 1.0 - smoothstep(halfWidth * 0.72, halfWidth * 1.02, dy);

  // 3-Layer View-Parallax Glacier Ice Walls plunging down into abyss!
  vec2 wp = vWorldPos.xz;
  vec2 parStep = -V.xz / max(0.32, V.y);
  float wallNoise1 = fbm((wp + parStep * 0.45) * 0.9);
  float wallNoise2 = fbm((wp + parStep * 1.15) * 0.65 + 7.1);
  vec3 iceN = texture2D(uIceNormal, (wp + parStep * 0.55) * 0.35).xyz * 2.0 - 1.0;

  float innerAbyss = 1.0 - smoothstep(halfWidth * 0.22, halfWidth * 0.76, dy + (wallNoise1 - 0.5) * 0.08);
  vec3 upperIceWall = vec3(0.14, 0.56, 0.84) * (0.75 + 0.45 * max(dot(normalize(geomN + iceN * 0.5), L), 0.0));
  vec3 deepIceWall  = vec3(0.04, 0.22, 0.44) * (0.70 + 0.40 * wallNoise2);
  vec3 abyssCore    = vec3(0.008, 0.025, 0.075);

  vec3 cavernCol = mix(upperIceWall, deepIceWall, smoothstep(0.15, 0.65, innerAbyss));
  cavernCol = mix(cavernCol, abyssCore, smoothstep(0.55, 0.92, innerAbyss));

  // Overhanging wind-crusted snow cornice rim right along the fissure lip
  vec2 sn = (texture2D(uSnowNormal, wp * 0.45).xy * 2.0 - 1.0) * 0.35;
  vec3 rimN = normalize(geomN + vec3(sn.x, 0.0, sn.y));
  float NdotL = max(dot(rimN, L), 0.0);
  vec3 snowLipCol = vec3(0.84, 0.92, 0.99) * (uSunColor * uSunIntensity * NdotL * 0.78 + uShadowTint * 0.65);

  vec3 col = mix(snowLipCol, cavernCol, chasmMask);
  float alpha = max(chasmMask * 0.98, outerLip * 0.68);

  float effFogDens = uFogDensity * (1.0 + uSquallIntensity * 3.8);
  float fogAmt = 1.0 - exp(-pow(max(camDist * effFogDens, 0.0001), 1.32));
  col = mix(col, uFogColor, clamp(fogAmt, 0.0, 0.94));

  gl_FragColor = vec4(col, alpha);
}
