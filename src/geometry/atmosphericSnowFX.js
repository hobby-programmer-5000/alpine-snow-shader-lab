// ============================================================================
// Atmospheric Alpine Snow FX Pack (100% Zero External Textures!)
//   1. 2,600 GPU-Wrapped Airborne Snowflakes & Prismatic HDR Diamond-Dust Motes
//   2. 18 Summit Ridge Snow Banners (High-altitude wind-driven spindrift plumes)
// ============================================================================

import * as THREE from 'three';
import { evalAlpineHeight, getActiveDem, getCurrentDropCorridorXZ } from '../core/terrainMath.js';
import flakesVert from '../shaders/airborneFlakes.vert.glsl?raw';
import flakesFrag from '../shaders/airborneFlakes.frag.glsl?raw';
import bannerFrag from '../shaders/ridgeBanner.frag.glsl?raw';

const bannerVert = `
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export function createAtmosphericSnowFX(terrainUniforms, flakeCount = 2600) {
  const group = new THREE.Group();

  // --- 1. 2,600 Wrapping Airborne Snowflakes & Diamond Dust ---
  const positions = new Float32Array(flakeCount * 3);
  const seeds = new Float32Array(flakeCount);
  const kinds = new Float32Array(flakeCount);

  for (let i = 0; i < flakeCount; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 22.0;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 12.0;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 22.0;
    seeds[i] = Math.random();
    // 55% shimmering airborne diamond-dust motes, 45% soft snowflakes
    kinds[i] = i % 10 < 5 ? 1.0 : 0.0;
  }

  const flakeGeo = new THREE.BufferGeometry();
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  flakeGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  flakeGeo.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));

  const flakeMat = new THREE.ShaderMaterial({
    vertexShader: flakesVert,
    fragmentShader: flakesFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: terrainUniforms.uTime,
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uWindX: { value: 0.0 },
      uSquall: terrainUniforms.uSquallIntensity,
      uSunColor: terrainUniforms.uSunColor,
      uSkyHorizon: terrainUniforms.uSkyHorizon
    }
  });

  const flakeMesh = new THREE.Points(flakeGeo, flakeMat);
  flakeMesh.frustumCulled = false;
  flakeMesh.renderOrder = 6;
  group.add(flakeMesh);

  // --- 2. 18 Summit Ridge Snow Banners streaming downwind off high mountain crests! ---
  const bannerGroup = new THREE.Group();
  const bannerMat = new THREE.ShaderMaterial({
    vertexShader: bannerVert,
    fragmentShader: bannerFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: terrainUniforms.uTime,
      uSunDir: terrainUniforms.uSunDir,
      uSunColor: terrainUniforms.uSunColor,
      uShadowTint: terrainUniforms.uShadowTint,
      uFogColor: terrainUniforms.uFogColor,
      uFogDensity: terrainUniforms.uFogDensity
    }
  });

  const bannerGeo = new THREE.PlaneGeometry(78, 22, 6, 2);
  // Anchor u=0 directly at the mountain crest, extending 78m downwind along +X
  bannerGeo.translate(39, 8, 0);
  const banners = [];
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(bannerGeo, bannerMat);
    m.frustumCulled = false;
    bannerGroup.add(m);
    banners.push(m);
  }
  group.add(bannerGroup);

  function placeRidgeBanners(anchorX, anchorZ) {
    const dem = getActiveDem();
    // Orient banners cross-corridor so wind-blown spindrift plumes fan broadly across the skyline!
    const p0 = getCurrentDropCorridorXZ(anchorX, anchorZ, 0, 0);
    const p1 = getCurrentDropCorridorXZ(anchorX, anchorZ, 100, 0);
    const runYaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);

    for (let i = 0; i < banners.length; i++) {
      const m = banners[i];
      let bx, bz;
      if (dem && i < 4) {
        // Anchor lead snow banners right at the real Hallasan / Seoraksan summit crest!
        const [px, pz] = dem.meta.peakWorldXZ;
        bx = px + (i - 1.5) * 95;
        bz = pz + (i % 2 === 0 ? -50 : 65);
      } else {
        const along = 85 + i * 38;
        const side = i % 2 === 0 ? -1 : 1;
        const lat = 155 + (i % 4) * 65;
        const pt = getCurrentDropCorridorXZ(anchorX, anchorZ, along, side * lat);
        bx = pt.x;
        bz = pt.z;
      }
      const by = evalAlpineHeight(bx, bz);
      m.position.set(bx, by + 3.0, bz);
      m.rotation.set(0, runYaw + 0.25 + (i % 3) * 0.12, 0.05);
      const sc = 0.90 + (i % 4) * 0.30;
      m.scale.set(sc, sc * 0.78, 1);
    }
  }

  placeRidgeBanners(0, -18);

  return {
    group,
    placeRidgeBanners,
    setPixelRatio(dpr) {
      flakeMat.uniforms.uPixelRatio.value = dpr;
    },
    setWind(windX) {
      flakeMat.uniforms.uWindX.value = windX;
    }
  };
}
