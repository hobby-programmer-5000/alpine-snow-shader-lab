// ============================================================================
// Adaptive Two-Ring Geometry Clipmap Terrain Builder (Dynamic Low/High/Ultra Density!)
//   - Inner Patch: 220x220 (Low) / 280x280 (High) / 340x340 (Ultra = 8.2cm vertex grid!)
//   - Outer Ring:  Seamless hollow 128x128 ring out to 720m / 1350m (Korean DEM)
// ============================================================================

import * as THREE from 'three';
import terrainCommon from '../shaders/terrainCommon.glsl?raw';
import terrainVertRaw from '../shaders/terrain.vert.glsl?raw';
import terrainFragRaw from '../shaders/terrain.frag.glsl?raw';

function createHollowOuterRingGeometry(segments = 128) {
  const halfSeg = segments / 2;
  const innerMin = segments / 4;
  const innerMax = (segments * 3) / 4;

  const positions = [];
  const indices = [];
  const stride = segments + 1;

  for (let iz = 0; iz <= segments; iz++) {
    const z = ((iz - halfSeg) / halfSeg) * 2.0;
    for (let ix = 0; ix <= segments; ix++) {
      const x = ((ix - halfSeg) / halfSeg) * 2.0;
      positions.push(x, 0, z);
    }
  }

  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      if (ix >= innerMin && ix < innerMax && iz >= innerMin && iz < innerMax) continue;
      const v00 = iz * stride + ix;
      const v10 = v00 + 1;
      const v01 = (iz + 1) * stride + ix;
      const v11 = v01 + 1;
      indices.push(v00, v01, v10);
      indices.push(v10, v01, v11);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

export function createClipmapTerrain(trackSystem, dummyTex, pbrTextures) {
  const innerSize = 28.0;
  let innerSegs = 280;
  let innerStep = innerSize / innerSegs;

  const vertShader = terrainVertRaw.replace('// TERRAIN_COMMON_INJECT', terrainCommon);
  const fragShader = terrainFragRaw.replace('// TERRAIN_COMMON_INJECT', terrainCommon);

  const sharedUniforms = {
    uSnapCenter: { value: new THREE.Vector2(0, 0) },
    uInnerHalf: { value: innerSize * 0.5 },

    uUseDem: { value: 0.0 },
    uDemTex: { value: dummyTex },
    uHorizonTex: { value: dummyTex },
    uDemSize: { value: 512.0 },
    uDemSpan: { value: 4096.0 },
    uDemMaxElev: { value: 2200.0 },

    uTrackTex: { value: trackSystem.texture },
    uTrackOrigin: { value: trackSystem.origin },
    uTrackSpan: { value: trackSystem.span },
    uTrackRes: { value: trackSystem.resolution },
    uMacroTrackTex: { value: trackSystem.macroTexture },
    uMacroTrackOrigin: { value: trackSystem.macroOrigin },
    uMacroTrackSpan: { value: trackSystem.macroSpan },
    uTrenchDepth: { value: 0.34 },
    uBermHeight: { value: 0.24 },

    // Procedural Seamless PBR Snow & Ice Micro-Textures
    uSnowNormal: { value: pbrTextures.snowNormalTex },
    uSnowCavity: { value: pbrTextures.snowCavityTex },
    uIceNormal: { value: pbrTextures.iceNormalTex },

    // Physically Calibrated Photoreal Alpine Lighting Palette (Mont Blanc balanced!)
    uSunDir: { value: new THREE.Vector3(0.7, 0.4, 0.5).normalize() },
    uSunColor: { value: new THREE.Color(1.0, 0.91, 0.78) },
    uSunIntensity: { value: 2.05 },
    uSkyZenith: { value: new THREE.Color(0.14, 0.37, 0.80) },
    uSkyHorizon: { value: new THREE.Color(0.66, 0.80, 0.96) },
    uShadowTint: { value: new THREE.Color(0.32, 0.48, 0.78) },
    uGroundBounce: { value: new THREE.Color(0.46, 0.56, 0.74) },
    uSSSColor: { value: new THREE.Color(0.14, 0.48, 0.90) },
    uFogColor: { value: new THREE.Color(0.68, 0.80, 0.94) },
    uFogDensity: { value: 0.00105 },
    uCloudShadowStrength: { value: 0.34 },
    uTwilight: { value: 0.0 },
    uValleyLightAlt: { value: -45.0 },
    uSquallIntensity: { value: 0.0 },
    uTime: { value: 0.0 },

    // Interactive Pass Toggles & Advanced Quality Uniforms
    uEnableTracks: { value: 1.0 },
    uEnableBerms: { value: 1.0 },
    uEnableSelfShadow: { value: 1.0 },
    uEnableSastrugi: { value: 1.0 },
    uEnableGlints: { value: 1.0 },
    uEnableGranite: { value: 1.0 },
    uEnableCrevasses: { value: 1.0 },
    uTrenchShadowSteps: { value: 12.0 },
    uGlintIntensity: { value: 1.25 },
    uSastrugiStrength: { value: 0.92 },
    uViewMode: { value: 0.0 },

    uSkierPos: { value: new THREE.Vector3(0, 0, 0) },
    uSkierDirXZ: { value: new THREE.Vector2(0, -1) },
    uSkierAirborne: { value: 0.0 },

    uAvyActive: { value: 0.0 },
    uAvyOrigin: { value: new THREE.Vector2(0, 0) },
    uAvyDir: { value: new THREE.Vector2(0, -1) },
    uAvyFront: { value: 0.0 },
    uAvyWidth: { value: 24.0 }
  };

  const innerMat = new THREE.ShaderMaterial({
    vertexShader: vertShader,
    fragmentShader: fragShader,
    uniforms: { ...sharedUniforms, uIsOuterRing: { value: 0.0 } }
  });

  const outerMat = new THREE.ShaderMaterial({
    vertexShader: vertShader,
    fragmentShader: fragShader,
    uniforms: { ...sharedUniforms, uIsOuterRing: { value: 1.0 } }
  });

  const buildInnerGeo = (segs) => {
    const g = new THREE.PlaneGeometry(innerSize, innerSize, segs, segs);
    g.rotateX(-Math.PI / 2);
    return g;
  };

  const innerMesh = new THREE.Mesh(buildInnerGeo(innerSegs), innerMat);
  innerMesh.frustumCulled = false;

  const outerGeo = createHollowOuterRingGeometry(128);
  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  outerMesh.frustumCulled = false;

  const group = new THREE.Group();
  group.add(innerMesh, outerMesh);

  return {
    group,
    innerMesh,
    outerMesh,
    sharedUniforms,
    setWireframe(enabled) {
      innerMat.wireframe = enabled;
      outerMat.wireframe = enabled;
    },
    setInnerDensity(segs) {
      if (segs === innerSegs) return;
      innerSegs = segs;
      innerStep = innerSize / innerSegs;
      innerMesh.geometry.dispose();
      innerMesh.geometry = buildInnerGeo(innerSegs);
    },
    setDemRecord(demRecord, fallbackTex) {
      if (demRecord) {
        sharedUniforms.uUseDem.value = 1.0;
        sharedUniforms.uDemTex.value = demRecord.demTex;
        sharedUniforms.uHorizonTex.value = demRecord.horizonTex;
        sharedUniforms.uDemSize.value = demRecord.size;
        sharedUniforms.uDemSpan.value = demRecord.span;
        sharedUniforms.uDemMaxElev.value = demRecord.maxElev;
        sharedUniforms.uValleyLightAlt.value = demRecord.meta.minElevObserved + 280.0;
      } else {
        sharedUniforms.uUseDem.value = 0.0;
        sharedUniforms.uDemTex.value = fallbackTex;
        sharedUniforms.uHorizonTex.value = fallbackTex;
        sharedUniforms.uValleyLightAlt.value = -55.0;
      }
    },
    updateCenter(worldX, worldZ) {
      const sx = Math.round(worldX / innerStep) * innerStep;
      const sz = Math.round(worldZ / innerStep) * innerStep;
      sharedUniforms.uSnapCenter.value.set(sx, sz);
      sharedUniforms.uTrackTex.value = trackSystem.texture;
      sharedUniforms.uTrackOrigin.value.copy(trackSystem.origin);
      sharedUniforms.uTrackRes.value = trackSystem.resolution;
      sharedUniforms.uMacroTrackTex.value = trackSystem.macroTexture;
      sharedUniforms.uMacroTrackOrigin.value.copy(trackSystem.macroOrigin);
    }
  };
}
