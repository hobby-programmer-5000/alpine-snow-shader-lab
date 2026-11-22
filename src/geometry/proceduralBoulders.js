// ============================================================================
// PHOTOREAL Triplanar PBR Granite Outcrops (w/ Smooth Normals + Snow Skirts)
// + Sculpted 8-Pillar Fractured Glacial Serac Icefalls + 176 Contact Shadows!
// Eliminates flat polygonal triangle facets via:
//   - Indexed Smooth-Normal Sphere/Cylinder Geometry (NEVER flat toNonIndexed!)
//   - Multi-Octave 3D Ridged Granite & Glacial Flute Vertex Displacement
//   - 2-Octave Whiteout Triplanar Normal Mapping (uRockNormal, uRockDetail, uIceNormal)
//   - Terrain-Exact Snow Accumulation & Basal Drift Skirts
// ============================================================================

import * as THREE from 'three';
import { evalAlpineHeight, getCurrentDropCorridorXZ } from '../core/terrainMath.js';
import terrainCommon from '../shaders/terrainCommon.glsl?raw';
import photorealRockFrag from '../shaders/photorealRock.frag.glsl?raw';
import contactShadowVertRaw from '../shaders/contactShadows.vert.glsl?raw';
import contactShadowFrag from '../shaders/contactShadows.frag.glsl?raw';

const instancedRockVert = `
attribute float aPart; // 0.0 = rock/serac core, 1.0 = drifted snow base collar/skirt
attribute float aSeed;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vPart;
varying float vSeed;

void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vPart = aPart;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// Smooth deterministic 3D organic rock displacement (pure function of unit direction -> seamless poles & seams!)
function evalOrganicGraniteRadius(dx, dy, dz, seed) {
  const w1 = Math.sin(dx * 2.7 + dy * 1.9 + seed) * Math.cos(dz * 2.5 - dy * 2.1 + seed * 0.7);
  const w2 = Math.sin(dx * 5.3 - dz * 4.8 + seed * 1.9) * Math.sin(dy * 4.9 + dx * 3.1);
  // Ridged tectonic ledge creases (sharp yet smooth across vertices!)
  const ridge = 1.0 - Math.abs(Math.sin(dx * 3.6 + dz * 3.1 + dy * 4.4 + seed * 1.3));
  const strata = Math.sin(dy * 7.5 + w1 * 1.6 + seed) * 0.065;
  return 1.0 + w1 * 0.19 + w2 * 0.095 + (ridge - 0.5) * 0.14 + strata;
}

/**
 * Append an INDEXED geometry with SMOOTH computed vertex normals (ZERO flat triangle faceting!)
 */
function appendSmoothIndexedGeo(target, geo, partId) {
  geo.computeVertexNormals();
  const baseVertex = target.positions.length / 3;
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const idx = geo.index;

  for (let i = 0; i < pos.count; i++) {
    target.positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    target.normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    target.parts.push(partId);
  }
  if (idx) {
    for (let i = 0; i < idx.count; i++) {
      target.indices.push(baseVertex + idx.getX(i));
    }
  } else {
    for (let i = 0; i < pos.count; i++) {
      target.indices.push(baseVertex + i);
    }
  }
}

function makeOrganicGraniteLobe(rx, ry, rz, ox, oy, oz, seed, segW = 24, segH = 18) {
  // Indexed SphereGeometry preserves smooth welded vertex normals everywhere!
  const geo = new THREE.SphereGeometry(1.0, segW, segH);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i);
    const uy = pos.getY(i);
    const uz = pos.getZ(i);
    const f = evalOrganicGraniteRadius(ux, uy, uz, seed);

    // Subtle organic boulder blockiness (gentle superellipsoid squash + broad seated base)
    const bx = Math.sign(ux) * Math.pow(Math.abs(ux), 0.88) * rx * f;
    const by = (uy > 0 ? Math.pow(uy, 0.92) : uy * 0.58) * ry * f;
    const bz = Math.sign(uz) * Math.pow(Math.abs(uz), 0.88) * rz * f;

    pos.setXYZ(i, bx + ox, by + oy, bz + oz);
  }
  return geo;
}

function makeSmoothSnowSkirt(outerR, height, seed, radialSegs = 28) {
  // Smooth organic wind-drifted snow mound anchoring boulder/serac seamlessly beneath the snowpack
  const geo = new THREE.SphereGeometry(1.0, radialSegs, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i);
    const uy = Math.max(0.0, pos.getY(i)); // strictly [0..1]
    const uz = pos.getZ(i);
    const ang = Math.atan2(uz, ux);
    const ripple = 1.0 + 0.14 * Math.sin(ang * 3.0 + seed) + 0.08 * Math.cos(ang * 5.0 - seed * 1.4);
    const flare = Math.pow(1.0 - uy, 0.72);
    const x = ux * outerR * ripple * (0.72 + 0.36 * flare);
    const z = uz * outerR * ripple * 0.92 * (0.72 + 0.36 * flare);
    // Smooth concave drift apron: peaks softly around rock base and buries -0.22m into slope at outer rim!
    const y = Math.pow(uy, 1.85) * height - 0.22;
    pos.setXYZ(i, x, y, z);
  }
  return geo;
}

/**
 * High-Detail Smooth-Normal Multi-Lobe Alpine Granite Outcrop + Organic Drifted Snow Apron!
 * Exported so CourseManager obstacle boulders share the exact same photoreal rock geometry.
 */
export function buildPhotorealGraniteClusterGeo(highDetail = false) {
  const data = { positions: [], normals: [], parts: [], indices: [] };
  const segW = highDetail ? 30 : 22;
  const segH = highDetail ? 22 : 16;

  const mainLobe  = makeOrganicGraniteLobe(1.22, 0.88, 1.06,  0.00, 0.24,  0.00, 1.3, segW, segH);
  const sideLobeA = makeOrganicGraniteLobe(0.86, 0.64, 0.80,  0.84, 0.06,  0.38, 4.1, segW - 4, segH - 4);
  const sideLobeB = makeOrganicGraniteLobe(0.76, 0.56, 0.86, -0.74, 0.04, -0.34, 7.6, segW - 4, segH - 4);
  appendSmoothIndexedGeo(data, mainLobe, 0.0);
  appendSmoothIndexedGeo(data, sideLobeA, 0.0);
  appendSmoothIndexedGeo(data, sideLobeB, 0.0);
  mainLobe.dispose();
  sideLobeA.dispose();
  sideLobeB.dispose();

  const skirt = makeSmoothSnowSkirt(1.92, 0.62, 2.2, highDetail ? 32 : 24);
  appendSmoothIndexedGeo(data, skirt, 1.0);
  skirt.dispose();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(data.parts, 1));
  geo.setIndex(data.indices);
  return geo;
}

/**
 * 8-Pillar Sculpted Fractured Glacial Serac Icefall Cluster + Organic Basal Snow Collar!
 * Uses smooth-normal fluted glacial ice columns (no harsh 90-degree flat box edges!).
 */
function buildEightPillarSeracClusterGeo() {
  const data = { positions: [], normals: [], parts: [], indices: [] };

  const pillarSpecs = [
    { x:  0.00, z:  0.00, r: 0.72, h: 4.9, leanX:  0.14, leanZ: -0.08, rotY: 0.2, seed: 1.1 },
    { x:  0.94, z:  0.34, r: 0.56, h: 4.0, leanX:  0.22, leanZ:  0.11, rotY: 0.8, seed: 2.7 },
    { x: -0.86, z:  0.26, r: 0.58, h: 3.7, leanX: -0.18, leanZ:  0.06, rotY: 1.5, seed: 4.3 },
    { x:  0.34, z: -0.80, r: 0.54, h: 4.3, leanX:  0.08, leanZ: -0.20, rotY: 2.1, seed: 5.9 },
    { x: -0.44, z: -0.74, r: 0.48, h: 3.2, leanX: -0.15, leanZ: -0.14, rotY: 2.7, seed: 7.4 },
    { x:  1.42, z: -0.24, r: 0.44, h: 2.7, leanX:  0.26, leanZ: -0.05, rotY: 0.5, seed: 8.8 },
    { x: -1.32, z: -0.18, r: 0.46, h: 2.5, leanX: -0.24, leanZ:  0.09, rotY: 1.2, seed: 10.2 },
    { x:  0.12, z:  0.90, r: 0.50, h: 3.0, leanX:  0.06, leanZ:  0.22, rotY: 1.9, seed: 11.6 }
  ];

  for (let p = 0; p < pillarSpecs.length; p++) {
    const s = pillarSpecs[p];
    // Indexed fluted glacial spire (14 radial x 8 height segments -> organic ice ridges + beveled crest!)
    const colGeo = new THREE.CylinderGeometry(s.r * 0.72, s.r * 1.16, s.h, 14, 8, false);
    const pos = colGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const yFrac = Math.max(0, Math.min(1, (y + s.h * 0.5) / s.h));
      const ang = Math.atan2(z, x);

      // Glacial vertical ice flutes + horizontal pressure-shear strata
      const flute = 1.0 + 0.16 * Math.cos(ang * 4.0 + s.seed) + 0.09 * Math.sin(ang * 7.0 - yFrac * 5.0);
      const strata = 1.0 + 0.11 * Math.sin(yFrac * 13.0 + s.seed * 1.7);
      // Calved diagonal shear cliff top
      const topShear = Math.pow(yFrac, 3.0) * (x * 0.48 - z * 0.32);

      x = x * flute * strata + yFrac * s.h * s.leanX;
      z = z * flute * strata + yFrac * s.h * s.leanZ;
      y = y + s.h * 0.42 + topShear;
      pos.setXYZ(i, x, y, z);
    }
    colGeo.rotateY(s.rotY);
    colGeo.translate(s.x, 0, s.z);
    appendSmoothIndexedGeo(data, colGeo, 0.0);
    colGeo.dispose();
  }

  // Smooth organic basal snow-drift collar wrapping the icefall into the glacier
  const collar = makeSmoothSnowSkirt(2.45, 0.88, 5.1, 28);
  appendSmoothIndexedGeo(data, collar, 1.0);
  collar.dispose();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(data.parts, 1));
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

export function createProceduralRocksAndSeracs(terrainUniforms, pbrTextures) {
  const boulderCount = 140;
  const seracCount = 36;
  const totalShadows = boulderCount + seracCount;

  const boulderGeo = buildPhotorealGraniteClusterGeo(false);
  const seracGeo = buildEightPillarSeracClusterGeo();

  const rand = mulberry32(991122);
  const bSeeds = new Float32Array(boulderCount);
  for (let i = 0; i < boulderCount; i++) bSeeds[i] = rand();
  boulderGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(bSeeds, 1));

  const sSeeds = new Float32Array(seracCount);
  for (let i = 0; i < seracCount; i++) sSeeds[i] = rand();
  seracGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sSeeds, 1));

  const makeMat = (isSerac) =>
    new THREE.ShaderMaterial({
      vertexShader: instancedRockVert,
      fragmentShader: photorealRockFrag,
      uniforms: {
        uSunDir: terrainUniforms.uSunDir,
        uSunColor: terrainUniforms.uSunColor,
        uSunIntensity: terrainUniforms.uSunIntensity,
        uSkyZenith: terrainUniforms.uSkyZenith,
        uSkyHorizon: terrainUniforms.uSkyHorizon,
        uShadowTint: terrainUniforms.uShadowTint,
        uGroundBounce: terrainUniforms.uGroundBounce,
        uSSSColor: terrainUniforms.uSSSColor,
        uFogColor: terrainUniforms.uFogColor,
        uFogDensity: terrainUniforms.uFogDensity,
        uSquallIntensity: terrainUniforms.uSquallIntensity,
        uIsSerac: { value: isSerac ? 1.0 : 0.0 },
        uSnowNormal: { value: pbrTextures.snowNormalTex },
        uSnowCavity: { value: pbrTextures.snowCavityTex },
        uIceNormal: { value: pbrTextures.iceNormalTex },
        uRockNormal: { value: pbrTextures.rockNormalTex },
        uRockDetail: { value: pbrTextures.rockDetailTex }
      }
    });

  const boulderMesh = new THREE.InstancedMesh(boulderGeo, makeMat(false), boulderCount);
  const seracMesh = new THREE.InstancedMesh(seracGeo, makeMat(true), seracCount);
  boulderMesh.frustumCulled = false;
  seracMesh.frustumCulled = false;

  // Instanced Ground Contact Shadow Decals for ALL 176 Granite Outcrops & Glacial Seracs!
  const decalGeo = new THREE.PlaneGeometry(1, 1, 4, 6);
  decalGeo.rotateX(-Math.PI / 2);
  const shadowDataArr = new Float32Array(totalShadows * 4);
  const shadowMetaArr = new Float32Array(totalShadows * 2);
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
    polygonOffsetFactor: -2.4,
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

  const shadowMesh = new THREE.InstancedMesh(decalGeo, shadowMat, totalShadows);
  shadowMesh.frustumCulled = false;
  shadowMesh.renderOrder = 2;

  const group = new THREE.Group();
  group.add(boulderMesh, seracMesh, shadowMesh);

  const dummy = new THREE.Object3D();
  const idMat = new THREE.Matrix4();
  const colliders = [];

  function populateAroundAnchor(anchorX, anchorZ) {
    const r = mulberry32(773311);
    colliders.length = 0;
    let shIdx = 0;

    for (let i = 0; i < boulderCount; i++) {
      const along = (r() - 0.10) * 560 - 40;
      const side = r() < 0.5 ? -1 : 1;
      const lat = 12.5 + Math.pow(r(), 1.2) * 85.0;
      const pt = getCurrentDropCorridorXZ(anchorX, anchorZ, along, side * lat);
      const y = evalAlpineHeight(pt.x, pt.z) - 0.35;
      const sx = 0.9 + r() * 2.2;
      const sy = 0.8 + r() * 1.7;
      const sz = 0.9 + r() * 2.1;

      dummy.position.set(pt.x, y, pt.z);
      dummy.rotation.set((r() - 0.5) * 0.25, r() * Math.PI * 2, (r() - 0.5) * 0.25);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      boulderMesh.setMatrixAt(i, dummy.matrix);

      colliders.push({ x: pt.x, z: pt.z, radius: 1.52 * Math.max(sx, sz), height: 1.65 * sy, type: 'boulder' });

      shadowMesh.setMatrixAt(shIdx, idMat);
      shadowDataArr[shIdx * 4 + 0] = pt.x;
      shadowDataArr[shIdx * 4 + 1] = pt.z;
      shadowDataArr[shIdx * 4 + 2] = 1.9 * Math.max(sx, sz);
      shadowDataArr[shIdx * 4 + 3] = 2.1 * sy;
      shadowMetaArr[shIdx * 2 + 0] = 1.0;
      shadowMetaArr[shIdx * 2 + 1] = r();
      shIdx++;
    }
    boulderMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < seracCount; i++) {
      const along = (r() - 0.08) * 520 - 30;
      const side = r() < 0.5 ? -1 : 1;
      const lat = 20.0 + r() * 72.0;
      const pt = getCurrentDropCorridorXZ(anchorX, anchorZ, along, side * lat);
      const y = evalAlpineHeight(pt.x, pt.z) - 0.45;
      const scale = 0.95 + r() * 1.65;

      dummy.position.set(pt.x, y, pt.z);
      dummy.rotation.set((r() - 0.5) * 0.18, r() * Math.PI * 2, (r() - 0.5) * 0.18);
      dummy.scale.set(scale, scale * (0.95 + r() * 0.45), scale);
      dummy.updateMatrix();
      seracMesh.setMatrixAt(i, dummy.matrix);

      colliders.push({ x: pt.x, z: pt.z, radius: 2.15 * scale, height: 5.2 * scale, type: 'serac' });

      shadowMesh.setMatrixAt(shIdx, idMat);
      shadowDataArr[shIdx * 4 + 0] = pt.x;
      shadowDataArr[shIdx * 4 + 1] = pt.z;
      shadowDataArr[shIdx * 4 + 2] = 2.6 * scale;
      shadowDataArr[shIdx * 4 + 3] = 5.4 * scale;
      shadowMetaArr[shIdx * 2 + 0] = 1.0;
      shadowMetaArr[shIdx * 2 + 1] = r();
      shIdx++;
    }
    seracMesh.instanceMatrix.needsUpdate = true;
    shadowMesh.instanceMatrix.needsUpdate = true;
    shadowDataAttr.needsUpdate = true;
    shadowMetaAttr.needsUpdate = true;
  }

  return {
    group,
    colliders,
    shadowUniforms: shadowMat.uniforms,
    populateAroundAnchor
  };
}
