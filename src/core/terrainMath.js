// ============================================================================
// Unified CPU Alpine Terrain Heightfield (1:1 Parity with terrainCommon.glsl)
// Supports BOTH:
//   - Mode 0: 100% Zero-Asset Procedural Alpine Bowl (analytical math)
//   - Mode 1: Real Korean Mountain DEM (Hallasan / Seoraksan — exact 4-tap bilinear)
// ============================================================================

import * as THREE from 'three';

let activeDem = null; // null = procedural zero-asset mode

export function setActiveDem(demRecord) {
  activeDem = demRecord;
}

export function getActiveDem() {
  return activeDem;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function valleyCenterX(z) {
  return 22.0 * Math.sin(z * 0.0085) + 11.0 * Math.cos(z * 0.0041 + 0.7);
}

function smoothRidge(v) {
  return 1.0 - Math.sqrt(v * v + 0.012);
}

export function evalMicroDrift(x, z) {
  return 0.14 * Math.sin(x * 0.29 + z * 0.23) * Math.cos(x * 0.17 - z * 0.31);
}

function evalProceduralHeight(x, z) {
  const baseSlope = z * 0.275;
  const rollers =
    2.8 * Math.sin(x * 0.036 + z * 0.025) +
    1.6 * Math.cos(x * 0.072 - z * 0.052 + 1.1) +
    0.55 * Math.sin(x * 0.14 + z * 0.11 - 0.5);

  const cx = valleyCenterX(z);
  const distFromCenter = Math.abs(x - cx);
  const wallMask = smoothstep(14.0, 95.0, distFromCenter);
  const peakMask = smoothstep(32.0, 210.0, distFromCenter);

  const r1 = smoothRidge(Math.sin(x * 0.0115 + z * 0.0082 + 0.4));
  const r2 = smoothRidge(Math.sin(-x * 0.0094 + z * 0.0137 + 1.7));
  const r3 = smoothRidge(Math.sin(x * 0.023 - z * 0.019 + 2.5));
  const r4 = smoothRidge(Math.sin(x * 0.044 + z * 0.038 - 0.9));

  const ridgeMountains =
    (r1 * r2 * 138.0 + r3 * 38.0 + r4 * 12.0) * peakMask +
    wallMask * wallMask * 54.0;

  return baseSlope + rollers * (1.0 - 0.35 * wallMask) + ridgeMountains + evalMicroDrift(x, z);
}

function evalDemHeight(x, z, dem) {
  const u = Math.max(0, Math.min(1, x / dem.span + 0.5));
  const v = Math.max(0, Math.min(1, z / dem.span + 0.5));
  const maxIdx = dem.size - 1;
  const fx = u * maxIdx;
  const fy = v * maxIdx;
  const ix0 = Math.floor(fx);
  const iy0 = Math.floor(fy);
  const ix1 = Math.min(ix0 + 1, maxIdx);
  const iy1 = Math.min(iy0 + 1, maxIdx);
  const tx = fx - ix0;
  const ty = fy - iy0;

  const g = dem.elevGrid;
  const s = dem.size;
  const h00 = g[iy0 * s + ix0];
  const h10 = g[iy0 * s + ix1];
  const h01 = g[iy1 * s + ix0];
  const h11 = g[iy1 * s + ix1];

  const hx0 = h00 + (h10 - h00) * tx;
  const hx1 = h01 + (h11 - h01) * tx;
  return hx0 + (hx1 - hx0) * ty + evalMicroDrift(x, z);
}

export function evalAlpineHeight(x, z) {
  if (activeDem) return evalDemHeight(x, z, activeDem);
  return evalProceduralHeight(x, z);
}

export function evalAlpineNormal(x, z, eps = 0.25, out = new THREE.Vector3()) {
  const hL = evalAlpineHeight(x - eps, z);
  const hR = evalAlpineHeight(x + eps, z);
  const hD = evalAlpineHeight(x, z - eps);
  const hU = evalAlpineHeight(x, z + eps);
  return out.set(hL - hR, 2.0 * eps, hD - hU).normalize();
}

/**
 * Helper used by procedural spruces & boulders to place objects along the active ski corridor
 * whether running Procedural Mont-Style OR Real Hallasan/Seoraksan DEM fall-lines!
 */
export function getCurrentDropCorridorXZ(anchorX, anchorZ, alongMeters, lateralMeters) {
  if (!activeDem) {
    const z = anchorZ - alongMeters;
    const x = valleyCenterX(z) + lateralMeters;
    return { x, z };
  }
  const wps = activeDem.meta.fallLineWaypoints;
  const maxAlong = (wps.length - 1) * 9.5;
  const clamped = Math.max(0, Math.min(maxAlong - 0.1, alongMeters + 45.0));
  const f = clamped / 9.5;
  const i0 = Math.min(wps.length - 2, Math.floor(f));
  const t = f - i0;
  const cx = wps[i0][0] + (wps[i0 + 1][0] - wps[i0][0]) * t;
  const cz = wps[i0][1] + (wps[i0 + 1][1] - wps[i0][1]) * t;
  const dx = wps[i0 + 1][0] - wps[i0][0];
  const dz = wps[i0 + 1][1] - wps[i0][1];
  const len = Math.hypot(dx, dz) || 1;
  const rightX = -dz / len;
  const rightZ = dx / len;
  return { x: cx + rightX * lateralMeters, z: cz + rightZ * lateralMeters };
}

export function raycastAlpineTerrain(rayOrigin, rayDir, maxDist = 320) {
  let tPrev = 0.2;
  let prevDiff =
    rayOrigin.y +
    rayDir.y * tPrev -
    evalAlpineHeight(rayOrigin.x + rayDir.x * tPrev, rayOrigin.z + rayDir.z * tPrev);

  for (let t = 0.6; t <= maxDist; t += Math.max(0.35, t * 0.045)) {
    const px = rayOrigin.x + rayDir.x * t;
    const py = rayOrigin.y + rayDir.y * t;
    const pz = rayOrigin.z + rayDir.z * t;
    const diff = py - evalAlpineHeight(px, pz);

    if (diff <= 0 && prevDiff > 0) {
      let lo = tPrev;
      let hi = t;
      for (let i = 0; i < 8; i++) {
        const mid = 0.5 * (lo + hi);
        const mx = rayOrigin.x + rayDir.x * mid;
        const my = rayOrigin.y + rayDir.y * mid;
        const mz = rayOrigin.z + rayDir.z * mid;
        if (my - evalAlpineHeight(mx, mz) > 0) lo = mid;
        else hi = mid;
      }
      const hitT = 0.5 * (lo + hi);
      return new THREE.Vector3(
        rayOrigin.x + rayDir.x * hitT,
        rayOrigin.y + rayDir.y * hitT,
        rayOrigin.z + rayDir.z * hitT
      );
    }
    tPrev = t;
    prevDiff = diff;
  }
  return null;
}
