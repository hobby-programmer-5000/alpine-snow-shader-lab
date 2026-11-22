// ============================================================================
// 100% Procedural Seamless Tileable PBR Alpine Micro-Texture Synthesizer
// Synthesizes zero-external-file linear DataTextures on startup (~35ms):
//   1. snowNormalTex : Anisotropic wind-carved sastrugi tangent-space normal map
//   2. snowCavityTex : Packed (R = cavityAO, G = height, B = fine crystalline grain)
//   3. iceNormalTex  : Fractured glacial blue-ice normal map
// Inspired by Google Mont Blanc snow_normal/snow_cavity + Chermain (2020) micro-detail.
// ============================================================================

import * as THREE from 'three';

// Deterministic tileable integer hash over period (px, py)
function tileHash(x, y, px, py, seed) {
  const ix = ((x % px) + px) % px;
  const iy = ((y % py) + py) % py;
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function tileVNoise(u, v, px, py, seed) {
  const fx = u * px;
  const fy = v * py;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const a = tileHash(x0, y0, px, py, seed);
  const b = tileHash(x0 + 1, y0, px, py, seed);
  const c = tileHash(x0, y0 + 1, px, py, seed);
  const d = tileHash(x0 + 1, y0 + 1, px, py, seed);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

function tileAnisoFbm(u, v, basePx, basePy, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = basePx;
  let py = basePy;
  for (let i = 0; i < octaves; i++) {
    sum += tileVNoise(u, v, px, py, seed + i * 31) * amp;
    norm += amp;
    px *= 2;
    py *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

export function createProceduralPbrSnowTextures(size = 512) {
  const count = size * size;
  const heightField = new Float32Array(count);
  const grainField = new Float32Array(count);
  const iceHeight = new Float32Array(count);
  const rockHeight = new Float32Array(count);
  const rockGrain = new Float32Array(count);

  // 1. Synthesize anisotropic domain-warped wind-carved sastrugi + glacial ice + alpine granite rock!
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Domain warp breaks linear streak repetition
      const wu = (tileAnisoFbm(u, v, 4, 4, 3, 11) - 0.5) * 0.14;
      const wv = (tileAnisoFbm(u, v, 4, 4, 3, 29) - 0.5) * 0.08;

      // Primary elongated sastrugi flutes + sharper wind-sculpted lips
      const macroFlute = tileAnisoFbm(u + wu, v + wv, 14, 3, 4, 101);
      const sharpLip = Math.pow(Math.max(0, 1.0 - Math.abs(macroFlute * 2.0 - 1.0)), 1.65);
      const medRipple = tileAnisoFbm(u + wu * 0.5, v + wv * 0.5, 28, 8, 3, 211);
      const fineGrain = tileAnisoFbm(u, v, 64, 64, 2, 307);

      const idx = y * size + x;
      heightField[idx] = macroFlute * 0.52 + sharpLip * 0.28 + medRipple * 0.14 + fineGrain * 0.06;
      grainField[idx] = fineGrain;

      // Fractured glacial ice facets (ridged multi-octave + crisp crystal micro-cracks)
      const i1 = 1.0 - Math.abs(tileAnisoFbm(u, v, 8, 8, 4, 503) * 2.0 - 1.0);
      const i2 = 1.0 - Math.abs(tileAnisoFbm(u + 0.17, v - 0.23, 24, 12, 3, 619) * 2.0 - 1.0);
      iceHeight[idx] = i1 * i1 * 0.65 + i2 * 0.35;

      // Alpine Protogine Granite / Basalt: stratified rock ledges + deep tectonic cracks + mineral grain!
      const rwu = (tileAnisoFbm(u, v, 6, 6, 3, 701) - 0.5) * 0.12;
      const rwv = (tileAnisoFbm(u, v, 6, 6, 3, 757) - 0.5) * 0.12;
      const strata = tileAnisoFbm(u + rwu, v + rwv, 6, 18, 4, 809);
      const crackA = Math.pow(Math.max(0, 1.0 - Math.abs(tileAnisoFbm(u + rwu * 0.7, v + rwv * 0.7, 10, 10, 4, 877) * 2.0 - 1.0)), 2.2);
      const crackB = Math.pow(Math.max(0, 1.0 - Math.abs(tileAnisoFbm(u - rwv, v + rwu, 24, 24, 3, 941) * 2.0 - 1.0)), 2.0);
      const microRock = tileAnisoFbm(u, v, 64, 64, 2, 991);
      // Deep crevices carve downward while faceted mineral planes stay proud
      rockHeight[idx] = Math.max(0, Math.min(1, strata * 0.58 + (1.0 - crackA) * 0.24 + (1.0 - crackB) * 0.12 + microRock * 0.06));
      rockGrain[idx] = microRock;
    }
  }

  // 2. Compute tangent-space normals + micro-cavity AO into packed RGBA DataTextures
  const snowNormalData = new Uint8Array(count * 4);
  const snowCavityData = new Uint8Array(count * 4);
  const iceNormalData = new Uint8Array(count * 4);
  const rockNormalData = new Uint8Array(count * 4);
  const rockDetailData = new Uint8Array(count * 4);

  const sampleWrap = (arr, x, y) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return arr[wy * size + wx];
  };

  const normalStrength = 4.6;
  const iceStrength = 6.2;
  const rockStrength = 7.4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const o = idx * 4;

      // 3x3 Sobel gradient for crisp, noise-free snow sastrugi tangent normals
      const tl = sampleWrap(heightField, x - 1, y - 1);
      const t  = sampleWrap(heightField, x,     y - 1);
      const tr = sampleWrap(heightField, x + 1, y - 1);
      const l  = sampleWrap(heightField, x - 1, y);
      const c  = heightField[idx];
      const r  = sampleWrap(heightField, x + 1, y);
      const bl = sampleWrap(heightField, x - 1, y + 1);
      const b  = sampleWrap(heightField, x,     y + 1);
      const br = sampleWrap(heightField, x + 1, y + 1);

      const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -gx * normalStrength;
      let ny = -gy * normalStrength;
      let nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      snowNormalData[o]     = Math.round((nx * 0.5 + 0.5) * 255);
      snowNormalData[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      snowNormalData[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      snowNormalData[o + 3] = 255;

      // Multi-radius Laplacian micro-cavity AO: concave sastrugi troughs darken softly!
      const avgNear = (t + b + l + r) * 0.25;
      const avgWide = (
        sampleWrap(heightField, x - 4, y) +
        sampleWrap(heightField, x + 4, y) +
        sampleWrap(heightField, x, y - 4) +
        sampleWrap(heightField, x, y + 4)
      ) * 0.25;
      const concavity = (c - avgNear) * 2.5 + (c - avgWide) * 1.8;
      const cavityAO = Math.max(0.28, Math.min(1.0, 0.78 + concavity * 1.45));

      snowCavityData[o]     = Math.round(cavityAO * 255);             // R: cavity AO
      snowCavityData[o + 1] = Math.round(Math.min(1, c) * 255);       // G: normalized height
      snowCavityData[o + 2] = Math.round(grainField[idx] * 255);      // B: micro-grain
      snowCavityData[o + 3] = 255;

      // Fractured glacial ice normal map
      const igx = sampleWrap(iceHeight, x + 1, y) - sampleWrap(iceHeight, x - 1, y);
      const igy = sampleWrap(iceHeight, x, y + 1) - sampleWrap(iceHeight, x, y - 1);
      let inx = -igx * iceStrength;
      let iny = -igy * iceStrength;
      let inz = 1.0;
      const iInv = 1.0 / Math.hypot(inx, iny, inz);
      iceNormalData[o]     = Math.round((inx * iInv * 0.5 + 0.5) * 255);
      iceNormalData[o + 1] = Math.round((iny * iInv * 0.5 + 0.5) * 255);
      iceNormalData[o + 2] = Math.round((inz * iInv * 0.5 + 0.5) * 255);
      iceNormalData[o + 3] = 255;

      // 3x3 Sobel gradient for fractured alpine granite rock normal + crevice AO detail!
      const rtl = sampleWrap(rockHeight, x - 1, y - 1);
      const rt  = sampleWrap(rockHeight, x,     y - 1);
      const rtr = sampleWrap(rockHeight, x + 1, y - 1);
      const rl  = sampleWrap(rockHeight, x - 1, y);
      const rc  = rockHeight[idx];
      const rr  = sampleWrap(rockHeight, x + 1, y);
      const rbl = sampleWrap(rockHeight, x - 1, y + 1);
      const rb  = sampleWrap(rockHeight, x,     y + 1);
      const rbr = sampleWrap(rockHeight, x + 1, y + 1);

      const rgx = (rtr + 2 * rr + rbr) - (rtl + 2 * rl + rbl);
      const rgy = (rbl + 2 * rb + rbr) - (rtl + 2 * rt + rtr);
      let rnx = -rgx * rockStrength;
      let rny = -rgy * rockStrength;
      let rnz = 1.0;
      const rInv = 1.0 / Math.hypot(rnx, rny, rnz);
      rockNormalData[o]     = Math.round((rnx * rInv * 0.5 + 0.5) * 255);
      rockNormalData[o + 1] = Math.round((rny * rInv * 0.5 + 0.5) * 255);
      rockNormalData[o + 2] = Math.round((rnz * rInv * 0.5 + 0.5) * 255);
      rockNormalData[o + 3] = 255;

      const rAvgNear = (rt + rb + rl + rr) * 0.25;
      const rAvgWide = (
        sampleWrap(rockHeight, x - 5, y) +
        sampleWrap(rockHeight, x + 5, y) +
        sampleWrap(rockHeight, x, y - 5) +
        sampleWrap(rockHeight, x, y + 5)
      ) * 0.25;
      const rConcav = (rc - rAvgNear) * 3.0 + (rc - rAvgWide) * 2.2;
      const rAO = Math.max(0.18, Math.min(1.0, 0.72 + rConcav * 1.8));
      rockDetailData[o]     = Math.round(rAO * 255);                     // R: rock crevice AO
      rockDetailData[o + 1] = Math.round(Math.min(1, rc) * 255);         // G: strata height
      rockDetailData[o + 2] = Math.round(rockGrain[idx] * 255);          // B: mineral crystal grain
      rockDetailData[o + 3] = 255;
    }
  }

  const makeWrapLinearTex = (data) => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    snowNormalTex: makeWrapLinearTex(snowNormalData),
    snowCavityTex: makeWrapLinearTex(snowCavityData),
    iceNormalTex: makeWrapLinearTex(iceNormalData),
    rockNormalTex: makeWrapLinearTex(rockNormalData),
    rockDetailTex: makeWrapLinearTex(rockDetailData),
    size
  };
}
