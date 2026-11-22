// ============================================================================
// Instanced Ground Contact Shadow & Sunken Tree-Well Decal Fragment Shader
// Uses multiplicative blending (DstColor * Zero) to darken snow naturally into
// realistic cool cobalt-slate shadow tones + scalloped Norway spruce bough edges!
// ============================================================================

precision highp float;

uniform float uEnableContactShadows;

varying vec2 vLocalUV;   // x = lateral / crownR, y = forward / castLen
varying float vType;     // 0 = spruce (tree-well + scalloped cone), 1 = boulder/serac
varying float vSeed;
varying float vCastRatio;
varying float vLitFactor;
varying vec3 vShadowMult;

void main() {
  if (uEnableContactShadows < 0.5) discard;

  // 1. Always-present sunken Tree-Well / Base Contact AO Cavity
  vec2 wellPos = vec2(vLocalUV.x, vLocalUV.y * vCastRatio);
  float rWell = length(wellPos);
  float theta = atan(wellPos.y, wellPos.x);
  float wellPert = 1.0 + 0.13 * sin(5.0 * theta + vSeed * 6.28) + 0.08 * cos(9.0 * theta - vSeed * 4.0);
  float wellR = rWell / wellPert;

  float wellAO = 1.0;
  if (vType < 0.5) {
    // Sunken spruce tree-well + dark pine-needle litter ring right around trunk!
    float deepWell = exp(-wellR * wellR * 2.8) * 0.58;
    float litterCore = exp(-wellR * wellR * 12.0) * 0.32;
    wellAO = clamp(1.0 - deepWell - litterCore, 0.26, 1.0);
  } else {
    // Boulder/serac base drift contact shadow
    wellAO = clamp(1.0 - exp(-wellR * wellR * 2.1) * 0.62, 0.34, 1.0);
  }

  // 2. Directional Cast Shadow projected along -uSunDir.xz
  float dirMask = 0.0;
  if (vLitFactor > 0.01 && vLocalUV.y > -0.18 && vLocalUV.y < 1.12) {
    float hFrac = clamp(vLocalUV.y, 0.0, 1.0);
    if (vType < 0.5) {
      // Scalloped conical Norway spruce shadow profile with distance-widening penumbra
      float coneW = mix(1.08, 0.14, pow(hFrac, 0.85));
      float scallop = 1.0 + 0.11 * sin(hFrac * 21.0 + vSeed * 5.0) + 0.06 * cos(hFrac * 37.0);
      float halfW = coneW * scallop;
      float penumbra = 0.16 + 0.30 * hFrac;
      float latMask = 1.0 - smoothstep(halfW - penumbra * 0.5, halfW + penumbra, abs(vLocalUV.x));
      float lenMask = smoothstep(-0.15, 0.05, vLocalUV.y) * (1.0 - smoothstep(0.84, 1.06, vLocalUV.y));
      dirMask = latMask * lenMask * vLitFactor;
    } else {
      // Elliptical granite boulder / serac cast shadow
      vec2 ell = vec2(vLocalUV.x / 0.95, (vLocalUV.y - 0.42) / 0.58);
      dirMask = (1.0 - smoothstep(0.58, 1.08, length(ell))) * vLitFactor;
    }
  }

  vec3 multAO = mix(vec3(0.42, 0.52, 0.72), vec3(1.0), wellAO);
  vec3 multDir = mix(vec3(1.0), vShadowMult, dirMask * 0.82);
  vec3 finalMult = min(multAO, multDir);

  if (finalMult.r > 0.992 && finalMult.g > 0.992 && finalMult.b > 0.992) discard;

  gl_FragColor = vec4(finalMult, 1.0);
}
