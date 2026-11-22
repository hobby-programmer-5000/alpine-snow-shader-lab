// ============================================================================
// PHOTOREAL Post-FX Pass 4: Master HDR Composite Shader (Full Mont Blanc Parity!)
//   - GoPro Barrel Distortion (barrelUV) + Refracted Optical Lens Droplets
//   - 5-Tap Directional Luma FXAA (Lottes 2011)
//   - Foreground Alpha-Masked (a=0.0 sharp skis vs a=0.55 world) Motion Blur + Radial CA
//   - 5-Tap God-Rays + 6/12-Point Sun Starburst + Polycarbonate Goggle Streak + 3 Chromatic Ghosts
//   - Avalanche/Squall Face-Shot Mist + Driving Snow Streaks + Vignette + ACES Film + IGN Dither
// ============================================================================

precision highp float;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uGodRays;
uniform vec2 uTexel;
uniform vec2 uHalfTexel;
uniform vec2 uSunUV;
uniform float uSunVis;
uniform vec3 uSunColor;
uniform float uSpeedFactor;
uniform float uFaceShot;
uniform float uLensWet;
uniform float uStormStreaks;
uniform float uBarrel;
uniform float uEnableFXAA;
uniform float uEnableLensFX;
uniform float uTime;
uniform float uEnablePostFX;
uniform float uExposure;
uniform float uAspect;

varying vec2 vUv;

vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float ign(vec2 px) {
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.5);
  return fract(p.x * p.y);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// Subtle GoPro alpine wide-angle barrel lens distortion
vec2 barrelUV(vec2 uv, float k) {
  if (k <= 0.0001) return uv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  return 0.5 + d * (1.0 + k * r2) * (1.0 - 0.25 * k);
}

// Refracted peripheral snow-melt droplets on goggle/camera lens during squalls & powder
vec2 lensDroplets(vec2 uv, float wet, float t) {
  if (wet <= 0.01) return vec2(0.0);
  float edgeMask = smoothstep(0.18, 0.52, length(uv - 0.5));
  if (edgeMask <= 0.01) return vec2(0.0);

  vec2 grid = uv * vec2(uAspect * 10.0, 10.0);
  grid.y += t * 0.25;
  vec2 id = floor(grid);
  vec2 f = fract(grid) - 0.5;
  float h = hash21(id);
  if (h < 0.74) return vec2(0.0);

  vec2 center = vec2(fract(h * 13.7) - 0.5, fract(h * 29.3) - 0.5) * 0.55;
  vec2 delta = f - center;
  float r = length(delta);
  float dropR = 0.11 + fract(h * 7.1) * 0.14;
  float mask = smoothstep(dropR, dropR * 0.25, r);
  return delta * mask * edgeMask * wet * 0.045;
}

// 5-Tap Directional Luma FXAA (Timothy Lottes 2011)
vec3 sampleFXAA(vec2 uv) {
  vec3 cM = texture2D(uScene, uv).rgb;
  if (uEnableFXAA < 0.5) return cM;

  vec3 cNW = texture2D(uScene, uv + vec2(-uTexel.x,  uTexel.y)).rgb;
  vec3 cNE = texture2D(uScene, uv + vec2( uTexel.x,  uTexel.y)).rgb;
  vec3 cSW = texture2D(uScene, uv + vec2(-uTexel.x, -uTexel.y)).rgb;
  vec3 cSE = texture2D(uScene, uv + vec2( uTexel.x, -uTexel.y)).rgb;

  float lM  = luma(cM);
  float lNW = luma(cNW), lNE = luma(cNE), lSW = luma(cSW), lSE = luma(cSE);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)) return cM;

  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float dirRed = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float invMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirRed);
  dir = clamp(dir * invMin, vec2(-4.0), vec2(4.0)) * uTexel;

  vec3 rA = 0.5 * (texture2D(uScene, uv + dir * (1.0/3.0 - 0.5)).rgb + texture2D(uScene, uv + dir * (2.0/3.0 - 0.5)).rgb);
  vec3 rB = rA * 0.5 + 0.25 * (texture2D(uScene, uv + dir * -0.5).rgb + texture2D(uScene, uv + dir * 0.5).rgb);
  float lB = luma(rB);
  return (lB < lMin || lB > lMax) ? rA : rB;
}

float drivingSnowLayer(vec2 uv, float t, float scale) {
  vec2 p = uv * vec2(uAspect * scale, scale * 0.45);
  p.x += p.y * 0.32 + t * 2.8;
  p.y -= t * 4.2;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = hash21(id);
  if (h < 0.86) return 0.0;
  return smoothstep(0.06, 0.0, abs(f.x)) * smoothstep(0.45, 0.05, abs(f.y)) * (h - 0.86) * 6.5;
}

// 5-Tap GPU Sun Occlusion + 6/12-Point Starburst + Polycarbonate Goggle Streak + 3 Chromatic Ghosts!
vec3 evalSunFlare(vec2 uv, vec2 sunUv, float vis, vec3 sunCol) {
  if (vis <= 0.01 || uEnableLensFX < 0.5) return vec3(0.0);

  // 5-tap sky-mask occlusion probe around sun center
  float occ = 0.0;
  vec2 o = uTexel * 6.0;
  occ += step(0.85, texture2D(uScene, clamp(sunUv, vec2(0.002), vec2(0.998))).a);
  occ += step(0.85, texture2D(uScene, clamp(sunUv + vec2(o.x, 0.0), vec2(0.002), vec2(0.998))).a);
  occ += step(0.85, texture2D(uScene, clamp(sunUv - vec2(o.x, 0.0), vec2(0.002), vec2(0.998))).a);
  occ += step(0.85, texture2D(uScene, clamp(sunUv + vec2(0.0, o.y), vec2(0.002), vec2(0.998))).a);
  occ += step(0.85, texture2D(uScene, clamp(sunUv - vec2(0.0, o.y), vec2(0.002), vec2(0.998))).a);
  float sunOpen = (occ * 0.2) * vis;
  if (sunOpen <= 0.01) return vec3(0.0);

  vec2 d = (uv - sunUv) * vec2(uAspect, 1.0);
  float r = length(d);
  float ang = atan(d.y, d.x);

  // Dual 6-point + 12-point aperture diffraction starburst + polycarbonate horizontal streak
  float rays6  = pow(abs(cos(ang * 3.0 + 0.26)), 18.0) * 0.52;
  float rays12 = pow(abs(cos(ang * 6.0)), 26.0) * 0.22;
  float starburst = (rays6 + rays12) * exp(-r * 8.2);
  float goggleStreak = exp(-abs(d.y) * 58.0) * exp(-abs(d.x) * 3.2) * 0.34;
  float veiling = exp(-r * 2.15) * 0.14;

  // 3 Chromatic Internal Lens Ghosts along opposite optical axis (0.5 - sunUv)
  vec2 axis = vec2(0.5) - sunUv;
  float g1 = exp(-pow(length((uv - (sunUv + axis * 0.48)) * vec2(uAspect, 1.0)) * 12.0, 2.0));
  float g2 = exp(-pow(length((uv - (sunUv + axis * 0.96)) * vec2(uAspect, 1.0)) * 16.0, 2.0));
  float g3d = length((uv - (sunUv + axis * 1.48)) * vec2(uAspect, 1.0));
  float g3 = exp(-pow((g3d - 0.085) * 34.0, 2.0));

  vec3 ghosts = vec3(1.0, 0.56, 0.22) * g1 * 0.14
              + vec3(0.28, 0.85, 1.0) * g2 * 0.11
              + vec3(1.0, 0.36, 0.72) * g3 * 0.09;

  return (sunCol * (starburst + goggleStreak + veiling) + ghosts) * sunOpen;
}

void main() {
  vec2 uv = uEnablePostFX > 0.5 && uEnableLensFX > 0.5 ? barrelUV(vUv, uBarrel) : vUv;
  if (uEnablePostFX > 0.5 && uEnableLensFX > 0.5) {
    uv = clamp(uv + lensDroplets(uv, uLensWet, uTime), vec2(0.002), vec2(0.998));
  }

  vec4 center = texture2D(uScene, uv);
  vec3 col = uEnablePostFX > 0.5 ? sampleFXAA(uv) : center.rgb;

  if (uEnablePostFX > 0.5) {
    // 1. Foreground-Protected Radial Motion Blur + Subtle Speed Chromatic Aberration
    float worldMask = smoothstep(0.18, 0.42, center.a);
    vec2 fromCenter = uv - vec2(0.5, 0.48);
    float edgeRadius = length(fromCenter);
    float blurAmt = uSpeedFactor * worldMask * smoothstep(0.18, 0.68, edgeRadius) * 0.020;

    if (blurAmt > 0.0005) {
      float j = ign(gl_FragCoord.xy);
      vec3 acc = col;
      float wSum = 1.0;
      for (int i = 1; i <= 6; i++) {
        float t = (float(i) - 0.4 + j * 0.4) / 6.0;
        vec2 sUv = clamp(uv - fromCenter * blurAmt * t, vec2(0.002), vec2(0.998));
        vec4 s = texture2D(uScene, sUv);
        float w = smoothstep(0.15, 0.40, s.a) * (1.0 - t * 0.42);
        acc += s.rgb * w;
        wSum += w;
      }
      col = acc / wSum;
    }

    // Subtle optical radial CA on peripheral edges at high speed
    if (uEnableLensFX > 0.5) {
      float caAmt = (0.0009 + uSpeedFactor * 0.0018) * edgeRadius * edgeRadius * worldMask;
      if (caAmt > 0.0001) {
        col.r = mix(col.r, texture2D(uScene, clamp(uv + fromCenter * caAmt, vec2(0.002), vec2(0.998))).r, 0.65);
        col.b = mix(col.b, texture2D(uScene, clamp(uv - fromCenter * caAmt, vec2(0.002), vec2(0.998))).b, 0.65);
      }
    }

    // 2. HDR Selective Bloom
    col += texture2D(uBloom, uv).rgb * 0.25;

    // 3. 5-Tap Volumetric God-Ray Gather (boosted over dark shadowed terrain & spruces!)
    if (uSunVis > 0.01) {
      vec3 gr = texture2D(uGodRays, uv).rgb * 0.40;
      gr += texture2D(uGodRays, uv + vec2( uHalfTexel.x,  uHalfTexel.y)).rgb * 0.15;
      gr += texture2D(uGodRays, uv + vec2(-uHalfTexel.x,  uHalfTexel.y)).rgb * 0.15;
      gr += texture2D(uGodRays, uv + vec2( uHalfTexel.x, -uHalfTexel.y)).rgb * 0.15;
      gr += texture2D(uGodRays, uv + vec2(-uHalfTexel.x, -uHalfTexel.y)).rgb * 0.15;
      float terrainBoost = mix(1.35, 0.30, smoothstep(0.70, 0.96, center.a));
      col += gr * 0.44 * terrainBoost;

      col += evalSunFlare(uv, uSunUV, uSunVis, uSunColor);
    }

    // 4. Avalanche / Whiteout Squall Face-Shot Mist & Driving Snow Streaks
    if (uFaceShot > 0.01 || uStormStreaks > 0.01) {
      float periph = smoothstep(0.18, 0.85, edgeRadius);
      vec3 mistCol = mix(vec3(0.76, 0.86, 0.98), uSunColor * 1.1, 0.35);
      col = mix(col, mistCol, clamp(uFaceShot * (0.35 + 0.65 * periph), 0.0, 0.72));

      float streaks = drivingSnowLayer(uv, uTime, 18.0) + drivingSnowLayer(uv + 0.37, uTime * 1.3, 28.0) * 0.6;
      col += vec3(0.92, 0.96, 1.0) * streaks * uStormStreaks * 0.48;
    }

    // 5. Radial Vignette + ACES Filmic Tone Mapping + Gamma + IGN Dither
    float vig = 1.0 - smoothstep(0.38, 0.92, edgeRadius) * 0.22;
    col = acesFilm(col * uExposure * vig);
    col = pow(col, vec3(1.0 / 2.2));
    col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  } else {
    col = pow(clamp(col * 0.85, 0.0, 1.0), vec3(1.0 / 2.2));
  }

  gl_FragColor = vec4(col, 1.0);
}
