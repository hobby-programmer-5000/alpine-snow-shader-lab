// ============================================================================
// 2-LOD Lush Snow-Laden Alpine Evergreen & Korean Fir (구상나무) Forest (720 Trees!)
// Eliminates spindly/bare skeleton silhouettes via:
//   - Sculpted Multi-Tiered Volumetric Inner Needle Core (zero see-through trunk gaps!)
//   - 15 Tightly Shingled Golden-Angle Overlapping Wide Drooping Bough Fans + Sub-Fronds
//   - Plump Overhanging 3D Snow-Flower Cushions ("눈꽃 케이크") + Snow-Capped Apex Hood
//   - Species-Adaptive Silhouettes & Rime Frost (상고대):
//       * Hallasan  : Broad snow-heavy Korean Fir (구상나무) + altitude timberline tapering
//       * Seoraksan : Rugged dense Subalpine Fir (분비나무/잣나무)
//       * Procedural: Full-skirted Alpine Norway Spruce (가문비나무)
// ============================================================================

import * as THREE from 'three';
import { evalAlpineHeight, getActiveDem, getCurrentDropCorridorXZ, valleyCenterX } from '../core/terrainMath.js';
import terrainCommon from '../shaders/terrainCommon.glsl?raw';
import spruceVert from '../shaders/spruce.vert.glsl?raw';
import spruceFrag from '../shaders/spruce.frag.glsl?raw';
import contactShadowVertRaw from '../shaders/contactShadows.vert.glsl?raw';
import contactShadowFrag from '../shaders/contactShadows.frag.glsl?raw';

function pushTri(data, p0, p1, p2, matType, coreAO, hNorm) {
  const e1 = new THREE.Vector3().subVectors(p1, p0);
  const e2 = new THREE.Vector3().subVectors(p2, p0);
  const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
  const base = data.positions.length / 3;

  data.positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
  data.normals.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
  data.mats.push(matType, coreAO, hNorm, matType, coreAO, hNorm, matType, coreAO, hNorm);
  data.indices.push(base, base + 1, base + 2);
}

/**
 * Adds a sculpted undulating inner foliage core cone so there are ZERO bare gaps
 * between bough tiers — provides rich deep-pine internal shadow volume on both Near & Far LOD!
 */
function addVolumetricInnerCore(data, totalH, baseR, radialSegs = 10, rings = 8, startY = 1.15) {
  const ringVerts = [];
  for (let r = 0; r <= rings; r++) {
    const f = r / rings;
    const y = startY + f * (totalH - startY - 0.15);
    // Broad lush bell-pyramidal inner evergreen core
    const radius = baseR * Math.pow(Math.max(0.0, 1.0 - f * 0.96), 0.78) * (1.0 + 0.14 * Math.sin(f * Math.PI * 5.0));
    const row = [];
    for (let k = 0; k < radialSegs; k++) {
      const ang = (k / radialSegs) * Math.PI * 2 + r * 0.35;
      const lobe = 1.0 + 0.18 * Math.cos(ang * 4.0 + r * 1.1) + 0.10 * Math.sin(ang * 7.0);
      const rad = Math.max(0.04, radius * lobe);
      row.push({
        pos: new THREE.Vector3(Math.cos(ang) * rad, y - (lobe - 1.0) * 0.22, Math.sin(ang) * rad),
        hNorm: Math.min(1, y / totalH),
        ao: 0.24 + f * 0.36
      });
    }
    ringVerts.push(row);
  }

  for (let r = 0; r < rings; r++) {
    const aRow = ringVerts[r];
    const bRow = ringVerts[r + 1];
    for (let k = 0; k < radialSegs; k++) {
      const kn = (k + 1) % radialSegs;
      const a0 = aRow[k];
      const a1 = aRow[kn];
      const b0 = bRow[k];
      const b1 = bRow[kn];
      const ao = (a0.ao + b0.ao) * 0.5;
      const hn = (a0.hNorm + b0.hNorm) * 0.5;
      // Outward-facing CCW winding (since ang increases clockwise in XZ around +Y)
      pushTri(data, a0.pos, b1.pos, a1.pos, 1, ao, hn);
      pushTri(data, a0.pos, b0.pos, b1.pos, 1, ao, hn);
    }
  }
}

/**
 * Adds a wide, plump, snow-draped evergreen bough fan ("소복한 눈꽃 가지")
 * with thick drooping pine foliage underside and overhanging pillowy snow cushion on top!
 */
function addLushSnowBough(data, origin, dirXZ, length, width, sag, hNorm, totalH, segs = 3, addSnowPillow = true) {
  const fwd = new THREE.Vector3(dirXZ.x, 0, dirXZ.y).normalize();
  const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const up = new THREE.Vector3(0, 1, 0);

  const rings = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const dist = t * length;
    // Heavy snow-laden drooping arch with soft upturned tip curl
    const yOff = -sag * Math.pow(t, 1.32) + Math.pow(t, 2.8) * sag * 0.22;
    // Broad rounded evergreen fan envelope (stays wide through mid-frond, rounds off gently at tip!)
    const fanEnv = Math.sin(Math.pow(t, 0.72) * Math.PI * 0.88) * 0.85 + (1.0 - t) * 0.38;
    const w = width * Math.max(0.14, fanEnv);
    const thick = w * 0.34 + 0.08;

    const center = origin.clone().addScaledVector(fwd, dist).addScaledVector(up, yOff);
    rings.push({
      top: center.clone().addScaledVector(up, thick * 0.72),
      bot: center.clone().addScaledVector(up, -thick * 0.85),
      left: center.clone().addScaledVector(side, -w).addScaledVector(up, -thick * 0.22),
      right: center.clone().addScaledVector(side, w).addScaledVector(up, -thick * 0.22),
      center, t, w, thick
    });
  }

  for (let i = 0; i < segs; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    const ao = 0.28 + 0.72 * ((a.t + b.t) * 0.5);
    const hn = Math.max(0, Math.min(1, (a.center.y + b.center.y) * 0.5 / totalH));

    // Lush thick drooping evergreen needle fan (verified outward-facing CCW winding!)
    pushTri(data, a.top, b.left, a.left, 1, ao, hn);
    pushTri(data, a.top, b.top, b.left, 1, ao, hn);
    pushTri(data, a.top, a.right, b.right, 1, ao, hn);
    pushTri(data, a.top, b.right, b.top, 1, ao, hn);
    pushTri(data, a.left, b.bot, a.bot, 1, ao * 0.52, hn);
    pushTri(data, a.left, b.left, b.bot, 1, ao * 0.52, hn);
    pushTri(data, a.bot, b.right, a.right, 1, ao * 0.52, hn);
    pushTri(data, a.bot, b.bot, b.right, 1, ao * 0.52, hn);

    // Thick domed 3D snow-flower pillow blanketing upper bough while letting dark evergreen needle fringes peek around edges!
    if (addSnowPillow) {
      const domeA = a.thick * 1.18 + 0.09;
      const domeB = b.thick * (i === segs - 1 ? 0.72 : 1.14) + 0.07;
      const sTopA = a.center.clone().addScaledVector(up, domeA);
      const sTopB = b.center.clone().addScaledVector(up, domeB);
      const sLA = a.center.clone().addScaledVector(side, -a.w * 0.84).addScaledVector(up, a.thick * 0.16);
      const sRA = a.center.clone().addScaledVector(side,  a.w * 0.84).addScaledVector(up, a.thick * 0.16);
      const sLB = b.center.clone().addScaledVector(side, -b.w * 0.82).addScaledVector(up, b.thick * 0.14);
      const sRB = b.center.clone().addScaledVector(side,  b.w * 0.82).addScaledVector(up, b.thick * 0.14);

      pushTri(data, sTopA, sLB, sLA, 2, ao, hn);
      pushTri(data, sTopA, sTopB, sLB, 2, ao, hn);
      pushTri(data, sTopA, sRA, sRB, 2, ao, hn);
      pushTri(data, sTopA, sRB, sTopB, 2, ao, hn);
    }
  }

  // Cap drooping outer tip with soft snow-laden frond nose (verified outward-facing CCW winding!)
  const tip = rings[segs];
  const nose = tip.center.clone().addScaledVector(fwd, length * 0.16).addScaledVector(up, -0.08);
  const sNose = tip.center.clone().addScaledVector(fwd, length * 0.11).addScaledVector(up, tip.thick * 0.36);
  pushTri(data, tip.top, nose, tip.left, 1, 0.95, hNorm);
  pushTri(data, tip.top, tip.right, nose, 1, 0.95, hNorm);
  if (addSnowPillow) {
    const sTop = tip.center.clone().addScaledVector(up, tip.thick * 0.72 + 0.07);
    const sL = tip.center.clone().addScaledVector(side, -tip.w * 0.82).addScaledVector(up, tip.thick * 0.14);
    const sR = tip.center.clone().addScaledVector(side,  tip.w * 0.82).addScaledVector(up, tip.thick * 0.14);
    pushTri(data, sTop, sNose, sL, 2, 0.98, hNorm);
    pushTri(data, sTop, sR, sNose, 2, 0.98, hNorm);
  }
}

function buildLushEvergreenGeometry({ isNear = true } = {}) {
  const GOLDEN_ANGLE = 2.39996323;
  const totalH = 10.6;
  const data = { positions: [], normals: [], mats: [], indices: [] };

  // 1. Grounded trunk anchor (extends -2.0m underground so trees NEVER float on steep slopes!)
  const trunk = new THREE.CylinderGeometry(0.08, 0.34, totalH * 0.72 + 2.0, 7, 3);
  trunk.translate(0, totalH * 0.36 - 1.0, 0);
  const tp = trunk.attributes.position;
  const tn = trunk.attributes.normal;
  const ti = trunk.index;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    const sway = Math.sin(Math.max(0, y) * 0.32) * 0.07;
    data.positions.push(tp.getX(i) + sway, y, tp.getZ(i));
    data.normals.push(tn.getX(i), tn.getY(i), tn.getZ(i));
    data.mats.push(0, 0.30, Math.max(0, Math.min(1, y / totalH)));
  }
  for (let i = 0; i < ti.count; i++) data.indices.push(ti.getX(i));
  trunk.dispose();

  // 2. Volumetric Multi-Tiered Inner Needle Core (100% eliminates bare see-through fishbone gaps!)
  addVolumetricInnerCore(
    data,
    totalH,
    isNear ? 1.55 : 1.85,
    isNear ? 10 : 8,
    isNear ? 8 : 6,
    0.95
  );

  // 3. Tightly Shingled Golden-Angle Overlapping Snow-Draped Bough Whorls!
  const whorls = isNear ? 15 : 9;
  const segs = isNear ? 3 : 2;
  let angleAcc = 0.35;

  for (let w = 0; w < whorls; w++) {
    const frac = w / (whorls - 1);
    const y = 1.05 + frac * (totalH - 1.75);
    const boughCount = isNear ? (frac < 0.65 ? 6 : 5) : (frac < 0.6 ? 5 : 4);

    // Broad, full-skirted snow-heavy pyramidal silhouette (Korean Fir / Alpine Spruce!)
    const crownRadius = (1.0 - Math.pow(frac, 0.86) * 0.80) * 2.95;
    const boughWidth = (1.0 - frac * 0.60) * (isNear ? 1.02 : 1.38);
    const sag = (1.0 - frac * 0.58) * 1.12;

    for (let b = 0; b < boughCount; b++) {
      const az = angleAcc + (b / boughCount) * Math.PI * 2 + (w % 2) * 0.22;
      const dx = Math.cos(az);
      const dz = Math.sin(az);
      const len = crownRadius * (0.88 + 0.22 * Math.sin(az * 2.7 + w * 1.3));
      const origin = new THREE.Vector3(dx * 0.14, y + (b % 2) * 0.16, dz * 0.14);

      addLushSnowBough(data, origin, new THREE.Vector2(dx, dz), len, boughWidth, sag, frac, totalH, segs, true);

      // Fanned secondary lateral branchlets on lower/mid Near canopy for lush shingled volume!
      if (isNear && frac < 0.72 && (b % 2 === 0)) {
        for (const sSign of [-1, 1]) {
          const subAz = az + sSign * 0.46;
          const subOrigin = origin.clone().add(new THREE.Vector3(dx * len * 0.30, -sag * 0.20, dz * len * 0.30));
          addLushSnowBough(
            data, subOrigin, new THREE.Vector2(Math.cos(subAz), Math.sin(subAz)),
            len * 0.62, boughWidth * 0.74, sag * 0.52, frac, totalH, 2, true
          );
        }
      }
    }
    angleAcc += GOLDEN_ANGLE;
  }

  // 4. Organic Tapered Snow-Draped Conifer Crown Spire (natural pointed evergreen tip, never a round ball!)
  const tipOrigin = new THREE.Vector3(0, totalH - 0.85, 0);
  for (let k = 0; k < 5; k++) {
    const a = k * ((Math.PI * 2) / 5) + 0.2;
    addLushSnowBough(data, tipOrigin, new THREE.Vector2(Math.cos(a), Math.sin(a)), 0.86, 0.44, 0.22, 1.0, totalH, 2, true);
  }
  const spire = new THREE.ConeGeometry(0.42, 1.38, 7, 3);
  const sp = spire.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const y = sp.getY(i);
    const z = sp.getZ(i);
    const ang = Math.atan2(z, x);
    const ruff = 1.0 + 0.16 * Math.cos(ang * 3.0 + y * 4.0);
    sp.setXYZ(i, x * ruff, y + totalH - 0.12, z * ruff);
  }
  spire.computeVertexNormals();
  const sn = spire.attributes.normal;
  const si = spire.index;
  const sBase = data.positions.length / 3;
  for (let i = 0; i < sp.count; i++) {
    const yFrac = Math.max(0, Math.min(1, (sp.getY(i) - (totalH - 0.80)) / 1.38));
    // Lower skirt needles -> snow-frosted conical apex!
    data.positions.push(sp.getX(i), sp.getY(i), sp.getZ(i));
    data.normals.push(sn.getX(i), sn.getY(i), sn.getZ(i));
    data.mats.push(yFrac > 0.35 ? 2 : 1, 0.88 + yFrac * 0.12, 1.0);
  }
  for (let i = 0; i < si.count; i++) data.indices.push(sBase + si.getX(i));
  spire.dispose();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  geo.setAttribute('aMat', new THREE.Float32BufferAttribute(data.mats, 3));
  geo.setIndex(data.indices);
  return geo;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createProceduralAlpineForest(terrainUniforms, pbrTextures, nearCount = 240, farCount = 480) {
  const nearGeo = buildLushEvergreenGeometry({ isNear: true });
  const farGeo  = buildLushEvergreenGeometry({ isNear: false });

  const rand = mulberry32(20261122);
  const nearTints = new Float32Array(nearCount);
  for (let i = 0; i < nearCount; i++) nearTints[i] = rand();
  nearGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(nearTints, 1));

  const farTints = new Float32Array(farCount);
  for (let i = 0; i < farCount; i++) farTints[i] = rand();
  farGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(farTints, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: spruceVert,
    fragmentShader: spruceFrag,
    uniforms: {
      uTime: terrainUniforms.uTime,
      uSunDir: terrainUniforms.uSunDir,
      uSunColor: terrainUniforms.uSunColor,
      uSunIntensity: terrainUniforms.uSunIntensity,
      uSkyZenith: terrainUniforms.uSkyZenith,
      uShadowTint: terrainUniforms.uShadowTint,
      uGroundBounce: terrainUniforms.uGroundBounce,
      uSSSColor: terrainUniforms.uSSSColor,
      uFogColor: terrainUniforms.uFogColor,
      uFogDensity: terrainUniforms.uFogDensity,
      uSquallIntensity: terrainUniforms.uSquallIntensity,
      uRimeStrength: { value: 0.72 },
      uSnowNormal: { value: pbrTextures.snowNormalTex },
      uSnowCavity: { value: pbrTextures.snowCavityTex }
    }
  });

  const nearMesh = new THREE.InstancedMesh(nearGeo, mat, nearCount);
  const farMesh  = new THREE.InstancedMesh(farGeo, mat, farCount);
  nearMesh.frustumCulled = false;
  farMesh.frustumCulled = false;

  // Ground Contact Shadow & Tree-Well Decals for all 240 Near High-Detail Evergreens
  const decalGeo = new THREE.PlaneGeometry(1, 1, 4, 8);
  decalGeo.rotateX(-Math.PI / 2);
  const shadowDataArr = new Float32Array(nearCount * 4);
  const shadowMetaArr = new Float32Array(nearCount * 2);
  const shadowDataAttr = new THREE.InstancedBufferAttribute(shadowDataArr, 4);
  const shadowMetaAttr = new THREE.InstancedBufferAttribute(shadowMetaArr, 2);
  decalGeo.setAttribute('aShadowData', shadowDataAttr);
  decalGeo.setAttribute('aShadowMeta', shadowMetaAttr);

  const shadowMat = new THREE.ShaderMaterial({
    vertexShader: contactShadowVertRaw.replace('// TERRAIN_COMMON_INJECT', terrainCommon),
    fragmentShader: contactShadowFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor,
    blendDst: THREE.ZeroFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2.5,
    uniforms: {
      uUseDem: terrainUniforms.uUseDem,
      uDemTex: terrainUniforms.uDemTex,
      uDemSize: terrainUniforms.uDemSize,
      uDemSpan: terrainUniforms.uDemSpan,
      uDemMaxElev: terrainUniforms.uDemMaxElev,
      uSunDir: terrainUniforms.uSunDir,
      uSunColor: terrainUniforms.uSunColor,
      uShadowTint: terrainUniforms.uShadowTint,
      uEnableContactShadows: { value: 1.0 }
    }
  });

  const shadowMesh = new THREE.InstancedMesh(decalGeo, shadowMat, nearCount);
  shadowMesh.frustumCulled = false;
  shadowMesh.renderOrder = 2;

  const group = new THREE.Group();
  group.add(nearMesh, farMesh, shadowMesh);

  const dummy = new THREE.Object3D();
  const idMat = new THREE.Matrix4();
  const nearPlacements = [];
  const farPlacements = [];
  const colliders = [];

  function syncNear(i, p) {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.leanX, p.rotY, p.leanZ);
    dummy.scale.set(p.scaleXZ, p.scaleY, p.scaleXZ);
    dummy.updateMatrix();
    nearMesh.setMatrixAt(i, dummy.matrix);
    shadowMesh.setMatrixAt(i, idMat);

    shadowDataArr[i * 4 + 0] = p.x;
    shadowDataArr[i * 4 + 1] = p.z;
    shadowDataArr[i * 4 + 2] = 2.95 * p.scaleXZ;
    shadowDataArr[i * 4 + 3] = 9.8 * p.scaleY;
    shadowMetaArr[i * 2 + 0] = 0.0;
    shadowMetaArr[i * 2 + 1] = p.seed;

    // Solid trunk + dense lower-bough collider for 120 Hz hard-body physics!
    const col = colliders[i];
    if (col) {
      col.x = p.x;
      col.z = p.z;
      col.radius = 0.85 * p.scaleXZ;
      col.height = 8.5 * p.scaleY;
    } else {
      colliders[i] = { x: p.x, z: p.z, radius: 0.85 * p.scaleXZ, height: 8.5 * p.scaleY, type: 'tree' };
    }
  }

  function syncFar(i, p) {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.leanX, p.rotY, p.leanZ);
    dummy.scale.set(p.scaleXZ, p.scaleY, p.scaleXZ);
    dummy.updateMatrix();
    farMesh.setMatrixAt(i, dummy.matrix);
  }

  function repopulate(anchorX = 0, anchorZ = -18) {
    nearPlacements.length = 0;
    farPlacements.length = 0;
    const r = mulberry32(20261122);
    const dem = getActiveDem();
    const isDem = Boolean(dem);
    const mtnId = dem ? dem.id : 'procedural';

    // Species-authentic silhouette & hoarfrost/상고대 tuning per mountain!
    //   Hallasan  -> Korean Fir (구상나무): broader, sturdier, snow-flower & rime-ice laden!
    //   Seoraksan -> Korean Subalpine Fir (분비나무/잣나무): dense dark-green snow-laden crown!
    //   Procedural-> Alpine Norway Spruce (가문비나무): lush full-skirted snow-heavy spruce!
    const widthMult = mtnId === 'hallasan' ? 1.24 : mtnId === 'seoraksan' ? 1.14 : 1.08;
    const heightMult = mtnId === 'hallasan' ? 0.80 : mtnId === 'seoraksan' ? 0.90 : 1.00;
    mat.uniforms.uRimeStrength.value = mtnId === 'hallasan' ? 0.78 : mtnId === 'seoraksan' ? 0.50 : 0.38;

    // 240 Near High-Detail Corridor Evergreens (13m..52m from run centerline)
    for (let i = 0; i < nearCount; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const offset = 13.5 + Math.pow(r(), 1.2) * 38.0;
      let x, z;
      if (isDem) {
        const pt = getCurrentDropCorridorXZ(anchorX, anchorZ, r() * 540.0 - 40.0, side * offset);
        x = pt.x; z = pt.z;
      } else {
        z = 40 - r() * 760;
        x = valleyCenterX(z) + side * offset;
      }
      const rawY = evalAlpineHeight(x, z);
      // Subalpine altitude dwarfing on high Hallasan crater slopes (more wind-sculpted near peak!)
      const altFactor = mtnId === 'hallasan'
        ? THREE.MathUtils.clamp(1.12 - Math.max(0, rawY - 140) * 0.0016, 0.62, 1.05)
        : 1.0;
      const baseScale = (0.72 + r() * 0.72) * altFactor;
      const p = {
        x, y: rawY - 0.95, z, side, offset,
        scaleXZ: baseScale * widthMult * (0.92 + r() * 0.16),
        scaleY: baseScale * heightMult * (0.90 + r() * 0.20),
        rotY: r() * Math.PI * 2,
        leanX: (r() - 0.5) * 0.08, leanZ: (r() - 0.5) * 0.08, seed: r()
      };
      nearPlacements.push(p);
      syncNear(i, p);
    }

    // 480 Distant Timberline Flank Evergreens (48m..250m blanketing mountain slopes!)
    for (let i = 0; i < farCount; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const offset = 48.0 + Math.pow(r(), 1.15) * (isDem ? 220.0 : 125.0);
      let x, z;
      if (isDem) {
        const pt = getCurrentDropCorridorXZ(anchorX, anchorZ, r() * 680.0 - 80.0, side * offset);
        x = pt.x; z = pt.z;
      } else {
        z = 70 - r() * 880;
        x = valleyCenterX(z) + side * offset;
      }
      const rawY = evalAlpineHeight(x, z);
      const altFactor = mtnId === 'hallasan'
        ? THREE.MathUtils.clamp(1.10 - Math.max(0, rawY - 140) * 0.0018, 0.54, 1.05)
        : 1.0;
      const baseScale = (0.85 + r() * 1.05) * altFactor;
      const p = {
        x, y: rawY - 1.25, z, side, offset,
        scaleXZ: baseScale * widthMult * (0.94 + r() * 0.16),
        scaleY: baseScale * heightMult * (0.90 + r() * 0.20),
        rotY: r() * Math.PI * 2,
        leanX: (r() - 0.5) * 0.07, leanZ: (r() - 0.5) * 0.07, seed: r()
      };
      farPlacements.push(p);
      syncFar(i, p);
    }

    nearMesh.instanceMatrix.needsUpdate = true;
    farMesh.instanceMatrix.needsUpdate = true;
    shadowMesh.instanceMatrix.needsUpdate = true;
    shadowDataAttr.needsUpdate = true;
    shadowMetaAttr.needsUpdate = true;
  }

  repopulate();

  return {
    group,
    nearMesh,
    farMesh,
    colliders,
    shadowUniforms: shadowMat.uniforms,
    repopulate,
    updateAroundZ(skierZ) {
      if (getActiveDem()) return;
      let dirtyN = false;
      for (let i = 0; i < nearCount; i++) {
        const p = nearPlacements[i];
        if (p.z > skierZ + 75) {
          p.z -= 760; p.x = valleyCenterX(p.z) + p.side * p.offset; p.y = evalAlpineHeight(p.x, p.z) - 0.95;
          syncNear(i, p); dirtyN = true;
        } else if (p.z < skierZ - 685) {
          p.z += 760; p.x = valleyCenterX(p.z) + p.side * p.offset; p.y = evalAlpineHeight(p.x, p.z) - 0.95;
          syncNear(i, p); dirtyN = true;
        }
      }
      if (dirtyN) {
        nearMesh.instanceMatrix.needsUpdate = true;
        shadowDataAttr.needsUpdate = true;
      }

      let dirtyF = false;
      for (let i = 0; i < farCount; i++) {
        const p = farPlacements[i];
        if (p.z > skierZ + 110) {
          p.z -= 880; p.x = valleyCenterX(p.z) + p.side * p.offset; p.y = evalAlpineHeight(p.x, p.z) - 1.25;
          syncFar(i, p); dirtyF = true;
        } else if (p.z < skierZ - 770) {
          p.z += 880; p.x = valleyCenterX(p.z) + p.side * p.offset; p.y = evalAlpineHeight(p.x, p.z) - 1.25;
          syncFar(i, p); dirtyF = true;
        }
      }
      if (dirtyF) farMesh.instanceMatrix.needsUpdate = true;
    }
  };
}
