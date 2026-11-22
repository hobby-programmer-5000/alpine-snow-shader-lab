// ============================================================================
// Structured Alpine Ski Race Level Design & Dynamic Hazard Manager
// Eliminates endless-mode fatigue with 3 handcrafted courses + Finish Line Arch,
// Slalom Checkpoint Gates, Snow Kicker Ramps, Blue-Ice Slip Patches, Jumpable
// Glacial Crevasse Gaps, Boulder/Serac Collisions, Crosswind Gusts & Squalls!
// ============================================================================

import * as THREE from 'three';
import { evalAlpineHeight, evalAlpineNormal, getActiveDem, valleyCenterX } from './terrainMath.js';
import { buildPhotorealGraniteClusterGeo } from '../geometry/proceduralBoulders.js';
import terrainCommon from '../shaders/terrainCommon.glsl?raw';
import photorealRockFrag from '../shaders/photorealRock.frag.glsl?raw';
import kickerSnowFrag from '../shaders/kickerSnow.frag.glsl?raw';
import blueIcePatchFrag from '../shaders/blueIcePatch.frag.glsl?raw';
import crevasseFissureFrag from '../shaders/crevasseFissure.frag.glsl?raw';
import contactShadowVertRaw from '../shaders/contactShadows.vert.glsl?raw';
import contactShadowFrag from '../shaders/contactShadows.frag.glsl?raw';

const worldSurfaceVert = `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const singleRockVert = `
attribute float aPart;
uniform float uSeed;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vPart;
varying float vSeed;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vPart = aPart;
  vSeed = uSeed;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const gateDyeFrag = `
precision highp float;
uniform vec3 uColor;
uniform sampler2D uSnowCavity;
varying vec3 vWorldPos;
varying vec2 vUv;

void main() {
  // World Cup granular snow-dye spray line (feathered & stippled onto real snow crystals!)
  float grain = texture2D(uSnowCavity, vWorldPos.xz * 1.1).b;
  float edgeX = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  float edgeY = smoothstep(0.0, 0.32, vUv.y) * smoothstep(1.0, 0.68, vUv.y);
  float stipple = 0.58 + 0.42 * smoothstep(0.22, 0.78, grain);
  float alpha = edgeX * edgeY * stipple * 0.58;
  if (!(alpha > 0.02)) discard;
  gl_FragColor = vec4(uColor * (0.85 + 0.30 * grain), alpha);
}
`;

export const STAGE_DEFS = {
  stage1: {
    id: 'stage1',
    shortLabel: 'STAGE 1 · 한라산',
    title: 'STAGE 1 · 한라산 백록담 슬라롬',
    subtitle: 'Real Hallasan DEM · Bluebird Morning · Slalom Gates & Kickers',
    terrainKey: 'hallasan',
    tod: 'bluebird',
    lengthMeters: 440,
    gateCount: 8,
    gateWidth: 9.2,
    kickerCount: 3,
    icePatchCount: 2,
    crevasseCount: 0,
    boulderCount: 10,
    windMax: 2.2,
    squallProb: 0.0,
    scriptedAvyAt: -1,
    medals: { gold: 34.0, silver: 43.0, bronze: 56.0 }
  },
  stage2: {
    id: 'stage2',
    shortLabel: 'STAGE 2 · 설악산',
    title: 'STAGE 2 · 설악산 공룡능선 쿨루아르',
    subtitle: 'Real Seoraksan DEM · Blue-Ice Patches, Crevasse Jumps & Squalls',
    terrainKey: 'seoraksan',
    tod: 'alpine',
    lengthMeters: 460,
    gateCount: 10,
    gateWidth: 8.6,
    kickerCount: 3,
    icePatchCount: 4,
    crevasseCount: 2,
    boulderCount: 14,
    windMax: 3.1,
    squallProb: 0.45,
    scriptedAvyAt: 0.52,
    medals: { gold: 38.0, silver: 49.0, bronze: 64.0 }
  },
  stage3: {
    id: 'stage3',
    shortLabel: 'STAGE 3 · 눈사태 파이널',
    title: 'STAGE 3 · 알파인 일몰 눈사태 파이널',
    subtitle: 'Golden Hour Sunset · Slab Avalanche Chase, Crosswind Shear & Super-G',
    terrainKey: 'procedural',
    tod: 'sunset',
    lengthMeters: 560,
    gateCount: 12,
    gateWidth: 8.8,
    kickerCount: 4,
    icePatchCount: 4,
    crevasseCount: 3,
    boulderCount: 16,
    windMax: 3.8,
    squallProb: 0.35,
    scriptedAvyAt: 0.28,
    medals: { gold: 45.0, silver: 56.0, bronze: 72.0 }
  }
};

function createCheckeredFinishBannerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Crisp red-and-white racing header background
  ctx.fillStyle = '#0f1726';
  ctx.fillRect(0, 0, 1024, 256);

  // Top & bottom checkered alpine finish stripes
  const sq = 32;
  for (let x = 0; x < 1024; x += sq) {
    const even = ((x / sq) | 0) % 2 === 0;
    ctx.fillStyle = even ? '#ffffff' : '#e62e3d';
    ctx.fillRect(x, 0, sq, 44);
    ctx.fillStyle = even ? '#e62e3d' : '#ffffff';
    ctx.fillRect(x, 212, sq, 44);
  }

  // Bold high-contrast FINISH lettering
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 108px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FINISH', 512, 128);

  // Accent chevrons flanking FINISH
  ctx.fillStyle = '#ff4b5c';
  ctx.fillRect(96, 112, 130, 32);
  ctx.fillRect(798, 112, 130, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function createGateFlagTexture(colorHex, numberStr) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, 256, 192);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, 236, 172);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 104px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(numberStr, 128, 102);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build a high-res terrain-conformed freeride snow kicker ramp directly in world space
 * so its perimeter sits 100% flush with the mountain slope (zero marshmallow bulge or floating seam!).
 */
function buildTerrainConformedKickerGeo(kx, kz, pt, width = 5.4, length = 8.4, height = 1.18) {
  const segX = 24;
  const segZ = 32;
  const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i); // [-width/2 .. +width/2]
    const lz = pos.getZ(i); // +length/2 = entry, -length/2 = exit beyond lip
    const uAlong = (length * 0.5 - lz) / length; // 0 entry -> 1 exit
    const uLat = lx / width + 0.5;               // 0 left -> 1 right
    uv.setXY(i, uLat, uAlong);

    const wx = kx + pt.rightX * lx + pt.fwdX * (-lz);
    const wz = kz + pt.rightZ * lx + pt.fwdZ * (-lz);
    const baseH = evalAlpineHeight(wx, wz);

    // Smooth aerodynamic ski-jump transition up to crisp launch lip at u=0.80, clean steep dropoff behind
    const latNorm = Math.min(1.0, Math.abs(lx) / (width * 0.5));
    const latProfile = Math.pow(Math.cos(latNorm * Math.PI * 0.5), 1.35);

    let rampH;
    if (uAlong < 0.80) {
      const t = uAlong / 0.80;
      // Smooth concave launch curve (tangent-flat at entry so skier glides seamlessly onto ramp!)
      rampH = Math.pow(t, 2.15) * height;
    } else {
      const t = (uAlong - 0.80) / 0.20;
      rampH = Math.cos(t * Math.PI * 0.5) * height;
    }

    pos.setXYZ(i, wx, baseH + rampH * latProfile - 0.025, wz);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build a subdivided terrain-conformed surface decal directly in world space for organic
 * Blue-Ice Patches, Jumpable Glacial Crevasses & FIS Snow-Dye Gate Lines.
 */
function buildTerrainConformedSurfaceGeo(cx, cz, pt, width, length, segX, segZ, lift = 0.045) {
  const geo = new THREE.PlaneGeometry(width, length, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    uv.setXY(i, lx / width + 0.5, (length * 0.5 - lz) / length);

    const wx = cx + pt.rightX * lx + pt.fwdX * (-lz);
    const wz = cz + pt.rightZ * lx + pt.fwdZ * (-lz);
    const wy = evalAlpineHeight(wx, wz) + lift;
    pos.setXYZ(i, wx, wy, wz);
  }
  geo.computeVertexNormals();
  return geo;
}

export class CourseManager {
  constructor(scene, audioEngine, avalancheSystem, spraySystem, terrainUniforms = null, pbrTextures = null) {
    this.scene = scene;
    this.audioEngine = audioEngine;
    this.avalancheSystem = avalancheSystem;
    this.spraySystem = spraySystem;
    this.terrainUniforms = terrainUniforms;
    this.pbrTextures = pbrTextures;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.activeStage = null; // null = Free Sandbox
    this.status = 'sandbox'; // 'sandbox' | 'racing' | 'finished'

    // Course geometry & interactive entities
    this.gates = [];
    this.kickers = [];
    this.icePatches = [];
    this.crevasses = [];
    this.hazards = []; // boulders + course seracs
    this.finishZone = null;
    this.flarePositions = [];
    this.contactShadowUniforms = null;
    this.contactShadowsEnabled = true;

    // Live Run Stats & Dynamic Environmental Variables
    this.runTime = 0.0;
    this.penaltiesSec = 0.0;
    this.gatesCleared = 0;
    this.gatesMissed = 0;
    this.nearMisses = 0;
    this.collisions = 0;
    this.airtimeTotal = 0.0;
    this.topSpeedKmh = 0;
    this.score = 0;
    this.progress = 0.0;
    this.distanceToFinish = 0.0;
    this.scriptedAvyTriggered = false;

    // Active dynamic disruptors affecting SkierController & Post-FX every frame
    this.windForceX = 0.0;      // lateral gust acceleration (m/s^2)
    this.windDisplayKmh = 0;
    this.squallIntensity = 0.0; // [0..1] whiteout visibility drop & lens snow
    this.surfaceGrip = 1.0;     // 1.0 normal snow, 0.34 on blue-ice patch!
    this.onBlueIce = false;
    this.activeAlert = '';
    this.alertTimer = 0.0;
    this.hitCooldown = 0.0;
    this.flareEmitAccum = 0.0;

    this.onFinishCallback = null;

    this.finishBannerTex = createCheckeredFinishBannerTexture();
    // High-detail smooth-normal multi-lobe granite outcrop + drifted snow skirt!
    this.hazardRockGeo = buildPhotorealGraniteClusterGeo(true);
    this.sharedMaterials = this._createSharedMaterials();
  }

  setContactShadowsEnabled(enabled) {
    this.contactShadowsEnabled = !!enabled;
    if (this.contactShadowUniforms) {
      this.contactShadowUniforms.uEnableContactShadows.value = enabled ? 1.0 : 0.0;
    }
  }

  _createTerrainPreserveAlphaBlend() {
    // Blends RGB smoothly over the snow while preserving the HDR destination alpha (0.55 terrain mask)!
    return {
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor
    };
  }

  _createSharedMaterials() {
    const tu = this.terrainUniforms;
    const pbr = this.pbrTextures;
    const preserveAlphaBlend = this._createTerrainPreserveAlphaBlend();

    const makeMat = (opts) => {
      const m = new THREE.MeshStandardMaterial(opts);
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           gl_FragColor.a = 0.55;`
        );
      };
      m.customProgramCacheKey = () => 'alpine_course_world_mask_v2';
      return m;
    };

    const sharedEnvUniforms = () => ({
      uSunDir: tu.uSunDir,
      uSunColor: tu.uSunColor,
      uSunIntensity: tu.uSunIntensity,
      uSkyZenith: tu.uSkyZenith,
      uSkyHorizon: tu.uSkyHorizon,
      uShadowTint: tu.uShadowTint,
      uGroundBounce: tu.uGroundBounce,
      uSSSColor: tu.uSSSColor,
      uFogColor: tu.uFogColor,
      uFogDensity: tu.uFogDensity,
      uSquallIntensity: tu.uSquallIntensity
    });

    return {
      poleRed: makeMat({ color: 0xe62e3d, roughness: 0.32, metalness: 0.15 }),
      poleBlue: makeMat({ color: 0x1d7ef2, roughness: 0.32, metalness: 0.15 }),
      poleCleared: makeMat({ color: 0x2de89c, emissive: 0x106b45, roughness: 0.3 }),
      poleMissed: makeMat({ color: 0xff9b26, emissive: 0x6b3a05, roughness: 0.4 }),
      trussDark: makeMat({ color: 0x1a2333, roughness: 0.4, metalness: 0.7 }),
      finishBanner: new THREE.MeshStandardMaterial({
        map: this.finishBannerTex,
        emissiveMap: this.finishBannerTex,
        emissive: new THREE.Color(0x444444),
        roughness: 0.42
      }),
      kickerSnow: new THREE.ShaderMaterial({
        vertexShader: worldSurfaceVert,
        fragmentShader: kickerSnowFrag,
        ...preserveAlphaBlend,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: -1.5,
        uniforms: {
          ...sharedEnvUniforms(),
          uSnowNormal: { value: pbr.snowNormalTex },
          uSnowCavity: { value: pbr.snowCavityTex }
        }
      }),
      makeHazardRockMat: (seedVal) =>
        new THREE.ShaderMaterial({
          vertexShader: singleRockVert,
          fragmentShader: photorealRockFrag,
          uniforms: {
            ...sharedEnvUniforms(),
            uIsSerac: { value: 0.0 },
            uSeed: { value: seedVal },
            uSnowNormal: { value: pbr.snowNormalTex },
            uSnowCavity: { value: pbr.snowCavityTex },
            uIceNormal: { value: pbr.iceNormalTex },
            uRockNormal: { value: pbr.rockNormalTex },
            uRockDetail: { value: pbr.rockDetailTex }
          }
        }),
      blueIce: new THREE.ShaderMaterial({
        vertexShader: worldSurfaceVert,
        fragmentShader: blueIcePatchFrag,
        ...preserveAlphaBlend,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2.5,
        uniforms: {
          ...sharedEnvUniforms(),
          uIceNormal: { value: pbr.iceNormalTex },
          uSnowNormal: { value: pbr.snowNormalTex }
        }
      }),
      crevasseFissure: new THREE.ShaderMaterial({
        vertexShader: worldSurfaceVert,
        fragmentShader: crevasseFissureFrag,
        ...preserveAlphaBlend,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3.0,
        uniforms: {
          ...sharedEnvUniforms(),
          uIceNormal: { value: pbr.iceNormalTex },
          uSnowNormal: { value: pbr.snowNormalTex }
        }
      }),
      makeGateDyeMat: (hexColor) => {
        const uColor = { value: new THREE.Color(hexColor) };
        const m = new THREE.ShaderMaterial({
          vertexShader: worldSurfaceVert,
          fragmentShader: gateDyeFrag,
          ...preserveAlphaBlend,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2.0,
          uniforms: {
            uColor,
            uSnowCavity: { value: pbr.snowCavityTex }
          }
        });
        // Expose `.color` alias so existing gate clear/miss updates stay seamlessly compatible!
        m.color = uColor.value;
        return m;
      }
    };
  }

  /**
   * Sample centerline (x, z, fwdX, fwdZ, rightX, rightZ) along the active course at `alongMeters`
   */
  sampleCoursePoint(alongMeters) {
    const dem = getActiveDem();
    if (dem) {
      const wps = dem.meta.fallLineWaypoints;
      const startAlong = 34.0 + alongMeters;
      const stepM = 9.5;
      const maxM = (wps.length - 1) * stepM;
      const clamped = THREE.MathUtils.clamp(startAlong, 0, maxM - 0.1);
      const f = clamped / stepM;
      const i0 = Math.min(wps.length - 2, Math.floor(f));
      const t = f - i0;
      const x = wps[i0][0] + (wps[i0 + 1][0] - wps[i0][0]) * t;
      const z = wps[i0][1] + (wps[i0 + 1][1] - wps[i0][1]) * t;
      const dx = wps[i0 + 1][0] - wps[i0][0];
      const dz = wps[i0 + 1][1] - wps[i0][1];
      const len = Math.hypot(dx, dz) || 1;
      const fwdX = dx / len;
      const fwdZ = dz / len;
      return { x, z, fwdX, fwdZ, rightX: -fwdZ, rightZ: fwdX };
    }

    const z = -18.0 - alongMeters;
    const x = valleyCenterX(z);
    const nextZ = z - 1.0;
    const nextX = valleyCenterX(nextZ);
    const dx = nextX - x;
    const dz = nextZ - z;
    const len = Math.hypot(dx, dz) || 1;
    const fwdX = dx / len;
    const fwdZ = dz / len;
    return { x, z, fwdX, fwdZ, rightX: -fwdZ, rightZ: fwdX };
  }

  clearCourse() {
    while (this.group.children.length > 0) {
      const c = this.group.children[0];
      this.group.remove(c);
    }
    this.gates = [];
    this.kickers = [];
    this.icePatches = [];
    this.crevasses = [];
    this.hazards = [];
    this.finishZone = null;
    this.flarePositions = [];
    this.contactShadowUniforms = null;
    this.windForceX = 0;
    this.windDisplayKmh = 0;
    this.squallIntensity = 0;
    this.surfaceGrip = 1.0;
    this.onBlueIce = false;
    this.activeAlert = '';
  }

  buildStage(stageId) {
    this.clearCourse();

    if (!stageId || stageId === 'sandbox' || !STAGE_DEFS[stageId]) {
      this.activeStage = null;
      this.status = 'sandbox';
      return;
    }

    const cfg = STAGE_DEFS[stageId];
    this.activeStage = cfg;
    this.resetRunMetrics();

    const len = cfg.lengthMeters;

    // 1. Slalom Checkpoint Gates (alternating Red / Blue swinging across the fall line)
    for (let i = 0; i < cfg.gateCount; i++) {
      const frac = (i + 1) / (cfg.gateCount + 1);
      const along = frac * (len - 45) + 26;
      const pt = this.sampleCoursePoint(along);
      const lat = (i % 2 === 0 ? -1 : 1) * (4.4 + (i % 3) * 1.2);
      const gx = pt.x + pt.rightX * lat;
      const gz = pt.z + pt.rightZ * lat;
      const gy = evalAlpineHeight(gx, gz);
      const halfW = cfg.gateWidth * 0.5;
      const isRed = i % 2 === 0;

      const gateGroup = new THREE.Group();
      const poleGeo = new THREE.CylinderGeometry(0.055, 0.065, 2.8, 8);
      const poleMat = (isRed ? this.sharedMaterials.poleRed : this.sharedMaterials.poleBlue).clone();
      const flagTex = createGateFlagTexture(isRed ? '#e62e3d' : '#1d7ef2', String(i + 1));
      const flagMat = new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.45 });

      for (const s of [-1, 1]) {
        const px = gx + pt.rightX * (s * halfW);
        const pz = gz + pt.rightZ * (s * halfW);
        const py = evalAlpineHeight(px, pz);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(px, py + 1.35, pz);
        gateGroup.add(pole);

        // Twin inner slalom panel flag facing directly toward the approaching skier
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.68), flagMat);
        flag.position.set(px - pt.rightX * (s * 0.48), py + 2.15, pz - pt.rightZ * (s * 0.48));
        flag.rotation.y = Math.atan2(-pt.fwdX, -pt.fwdZ);
        gateGroup.add(flag);
      }

      // Realistic FIS World Cup granular snow-dye threshold line conformed cleanly to slope!
      const stripGeo = buildTerrainConformedSurfaceGeo(gx, gz, pt, cfg.gateWidth, 0.56, 12, 2, 0.045);
      const stripMat = this.sharedMaterials.makeGateDyeMat(isRed ? 0xe83b4d : 0x2d8cf0);
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.renderOrder = 3;
      gateGroup.add(strip);

      this.group.add(gateGroup);
      this.gates.push({
        index: i,
        along,
        x: gx,
        z: gz,
        fwdX: pt.fwdX,
        fwdZ: pt.fwdZ,
        rightX: pt.rightX,
        rightZ: pt.rightZ,
        halfW,
        state: 'pending', // 'pending' | 'cleared' | 'missed'
        poleMat,
        stripMat
      });
    }

    // 2. Terrain-Conformed Photoreal Sculpted Snow Kicker Ramps (+ 3D Parallax Glacial Crevasses!)
    for (let i = 0; i < cfg.kickerCount; i++) {
      const along = 62 + ((i + 0.5) / cfg.kickerCount) * (len - 135);
      const pt = this.sampleCoursePoint(along);
      const lat = (i % 2 === 0 ? 1 : -1) * 1.4;
      const kx = pt.x + pt.rightX * lat;
      const kz = pt.z + pt.rightZ * lat;

      const rampGeo = buildTerrainConformedKickerGeo(kx, kz, pt, 5.4, 8.4, 1.18);
      const ramp = new THREE.Mesh(rampGeo, this.sharedMaterials.kickerSnow);
      ramp.renderOrder = 3;
      this.group.add(ramp);

      // Pair twin orange alpine marker poles on launch lip edges
      for (const s of [-1, 1]) {
        const mx = kx + pt.rightX * (s * 2.55) + pt.fwdX * 2.55;
        const mz = kz + pt.rightZ * (s * 2.55) + pt.fwdZ * 2.55;
        const stick = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.045, 1.85, 8),
          this.sharedMaterials.poleMissed
        );
        stick.position.set(mx, evalAlpineHeight(mx, mz) + 0.85, mz);
        this.group.add(stick);
      }

      this.kickers.push({
        x: kx, z: kz,
        fwdX: pt.fwdX, fwdZ: pt.fwdZ,
        rightX: pt.rightX, rightZ: pt.rightZ,
        width: 5.4, length: 8.4, height: 1.18,
        cooldown: 0
      });

      // Place a photoreal organic 3D-parallax Glacial Crevasse fissure 9.2m downslope of the kicker lip!
      if (i < cfg.crevasseCount) {
        const cAlong = along + 9.2;
        const cpt = this.sampleCoursePoint(cAlong);
        const cx = cpt.x + cpt.rightX * lat;
        const cz = cpt.z + cpt.rightZ * lat;

        const cWidth = 12.6;
        const cDepthLen = 4.0;
        const crevGeo = buildTerrainConformedSurfaceGeo(cx, cz, cpt, cWidth, cDepthLen, 18, 10, 0.05);
        const crevMesh = new THREE.Mesh(crevGeo, this.sharedMaterials.crevasseFissure);
        crevMesh.renderOrder = 3;
        this.group.add(crevMesh);

        this.crevasses.push({
          x: cx,
          z: cz,
          fwdX: cpt.fwdX,
          fwdZ: cpt.fwdZ,
          rightX: cpt.rightX,
          rightZ: cpt.rightZ,
          halfW: cWidth * 0.44,
          halfLen: cDepthLen * 0.42,
          cleared: false,
          hit: false
        });
      }
    }

    // 3. Organic Wind-Scoured Glacial Blue-Ice Slip Patches (65% grip reduction!)
    for (let i = 0; i < cfg.icePatchCount; i++) {
      const along = 52 + ((i + 0.35) / cfg.icePatchCount) * (len - 110);
      const pt = this.sampleCoursePoint(along);
      const lat = (i % 2 === 0 ? -1 : 1) * 2.6;
      const ix = pt.x + pt.rightX * lat;
      const iz = pt.z + pt.rightZ * lat;
      const rad = 5.4;

      const patchGeo = buildTerrainConformedSurfaceGeo(ix, iz, pt, rad * 2.55, rad * 2.55, 16, 16, 0.045);
      const patch = new THREE.Mesh(patchGeo, this.sharedMaterials.blueIce);
      patch.renderOrder = 3;
      this.group.add(patch);

      this.icePatches.push({ x: ix, z: iz, radius: rad });
    }

    // 4. Photoreal Triplanar Multi-Lobe Granite Boulder Obstacles + Ground Contact Shadow Decals!
    const rockShadowSpecs = [];
    for (let i = 0; i < cfg.boulderCount; i++) {
      const along = 44 + ((i + 0.4) / cfg.boulderCount) * (len - 90);
      const pt = this.sampleCoursePoint(along);
      const side = i % 2 === 0 ? 1 : -1;
      const lat = side * (3.2 + (i % 4) * 2.3);
      const bx = pt.x + pt.rightX * lat;
      const bz = pt.z + pt.rightZ * lat;

      // Ensure no boulder blocks inside a gate threshold or the final Finish Arch sprint funnel
      if (along > len - 28) continue;
      let tooCloseToGate = false;
      for (const g of this.gates) {
        if (Math.hypot(bx - g.x, bz - g.z) < g.halfW + 2.2) {
          tooCloseToGate = true;
          break;
        }
      }
      if (tooCloseToGate) continue;

      const by = evalAlpineHeight(bx, bz);
      const scale = 1.08 + (i % 3) * 0.42;
      const sx = scale * (0.94 + (i % 2) * 0.14);
      const sy = scale * 0.84;
      const sz = scale * 1.06;
      const seed = (i * 0.371) % 1.0;

      const rock = new THREE.Mesh(this.hazardRockGeo, this.sharedMaterials.makeHazardRockMat(seed));
      rock.position.set(bx, by - 0.24, bz);
      rock.scale.set(sx, sy, sz);
      rock.rotation.set(((i % 5) - 2) * 0.06, i * 1.73, (((i + 2) % 5) - 2) * 0.06);
      this.group.add(rock);

      rockShadowSpecs.push({ x: bx, z: bz, crownR: 1.85 * Math.max(sx, sz), h: 2.0 * sy, seed });
      // True full visual solid granite radius (impossible to clip into multi-lobe outcrop!)
      this.hazards.push({
        x: bx, z: bz,
        radius: 1.66 * Math.max(sx, sz),
        height: 1.72 * sy,
        nearMissed: false, hit: false, type: 'boulder'
      });
    }

    // Ground Contact Shadow Decals physically anchoring EVERY course hazard boulder into the snow!
    if (rockShadowSpecs.length > 0 && this.terrainUniforms) {
      const cnt = rockShadowSpecs.length;
      const decalGeo = new THREE.PlaneGeometry(1, 1, 4, 6);
      decalGeo.rotateX(-Math.PI / 2);
      const shData = new Float32Array(cnt * 4);
      const shMeta = new Float32Array(cnt * 2);
      for (let i = 0; i < cnt; i++) {
        const sp = rockShadowSpecs[i];
        shData[i * 4 + 0] = sp.x;
        shData[i * 4 + 1] = sp.z;
        shData[i * 4 + 2] = sp.crownR;
        shData[i * 4 + 3] = sp.h;
        shMeta[i * 2 + 0] = 1.0;
        shMeta[i * 2 + 1] = sp.seed;
      }
      decalGeo.setAttribute('aShadowData', new THREE.InstancedBufferAttribute(shData, 4));
      decalGeo.setAttribute('aShadowMeta', new THREE.InstancedBufferAttribute(shMeta, 2));

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
          uUseDem: this.terrainUniforms.uUseDem,
          uDemTex: this.terrainUniforms.uDemTex,
          uDemSize: this.terrainUniforms.uDemSize,
          uDemSpan: this.terrainUniforms.uDemSpan,
          uDemMaxElev: this.terrainUniforms.uDemMaxElev,
          uSunDir: this.terrainUniforms.uSunDir,
          uSunColor: this.terrainUniforms.uSunColor,
          uShadowTint: this.terrainUniforms.uShadowTint,
          uEnableContactShadows: { value: this.contactShadowsEnabled ? 1.0 : 0.0 }
        }
      });
      this.contactShadowUniforms = shadowMat.uniforms;

      const shMesh = new THREE.InstancedMesh(decalGeo, shadowMat, cnt);
      const idMat = new THREE.Matrix4();
      for (let i = 0; i < cnt; i++) shMesh.setMatrixAt(i, idMat);
      shMesh.instanceMatrix.needsUpdate = true;
      shMesh.frustumCulled = false;
      shMesh.renderOrder = 2;
      this.group.add(shMesh);
    }

    // 5. Grand Checkered FINISH ARCH + Twin Alpine Towers + Glowing Flare Beacons!
    const fPt = this.sampleCoursePoint(len);
    const fy = evalAlpineHeight(fPt.x, fPt.z);
    const archHalfW = 7.5;
    const archH = 6.2;
    const archGroup = new THREE.Group();

    const towerGeo = new THREE.BoxGeometry(0.65, archH, 0.65);
    const beaconGeo = new THREE.SphereGeometry(0.32, 12, 10);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4538 });

    for (const s of [-1, 1]) {
      const tx = fPt.x + fPt.rightX * (s * archHalfW);
      const tz = fPt.z + fPt.rightZ * (s * archHalfW);
      const ty = evalAlpineHeight(tx, tz);

      const tower = new THREE.Mesh(towerGeo, this.sharedMaterials.trussDark);
      tower.position.set(tx, ty + archH * 0.5 - 0.3, tz);
      archGroup.add(tower);

      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(tx, ty + archH + 0.1, tz);
      archGroup.add(beacon);

      // Save ground flare emitters on both sides of Finish Line
      this.flarePositions.push(new THREE.Vector3(tx, ty + 0.35, tz));
    }

    // Overhead Checkered FINISH Banner spanning between both towers
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(archHalfW * 2 + 0.8, 1.85, 0.35),
      this.sharedMaterials.finishBanner
    );
    banner.position.set(fPt.x, fy + archH - 0.85, fPt.z);
    banner.rotation.y = Math.atan2(fPt.fwdX, fPt.fwdZ);
    archGroup.add(banner);

    // Bright checkered finish-line paint strip on the snow
    const fLineGeo = new THREE.PlaneGeometry(archHalfW * 2.1, 1.15);
    fLineGeo.rotateX(-Math.PI / 2);
    const fLine = new THREE.Mesh(fLineGeo, this.sharedMaterials.finishBanner);
    fLine.position.set(fPt.x, fy + 0.08, fPt.z);
    fLine.rotation.y = Math.atan2(fPt.fwdX, fPt.fwdZ);
    archGroup.add(fLine);

    this.group.add(archGroup);

    this.finishZone = {
      along: len,
      x: fPt.x,
      z: fPt.z,
      fwdX: fPt.fwdX,
      fwdZ: fPt.fwdZ,
      halfW: archHalfW * 1.45
    };
  }

  resetRunMetrics() {
    this.status = this.activeStage ? 'racing' : 'sandbox';
    this.runTime = 0.0;
    this.penaltiesSec = 0.0;
    this.gatesCleared = 0;
    this.gatesMissed = 0;
    this.nearMisses = 0;
    this.collisions = 0;
    this.airtimeTotal = 0.0;
    this.topSpeedKmh = 0;
    this.score = 0;
    this.progress = 0.0;
    this.distanceToFinish = this.activeStage ? this.activeStage.lengthMeters : 0;
    this.scriptedAvyTriggered = false;
    this.windForceX = 0;
    this.squallIntensity = 0;
    this.surfaceGrip = 1.0;
    this.onBlueIce = false;
    this.activeAlert = '';
    this.alertTimer = 0;
    this.hitCooldown = 0;

    for (const g of this.gates) {
      g.state = 'pending';
      const isRed = g.index % 2 === 0;
      g.poleMat.color.setHex(isRed ? 0xe62e3d : 0x1d7ef2);
      g.poleMat.emissive.setHex(0x000000);
      g.stripMat.color.setHex(isRed ? 0xff4054 : 0x3ba0ff);
    }
    for (const h of this.hazards) {
      h.nearMissed = false;
      h.hit = false;
    }
    for (const c of this.crevasses) {
      c.cleared = false;
      c.hit = false;
    }
  }

  setAlert(text, duration = 2.0) {
    this.activeAlert = text;
    this.alertTimer = duration;
  }

  /**
   * Evaluate exact 3D sculpted snow kicker surface elevation above base terrain at (x, z),
   * matching `buildTerrainConformedKickerGeo` 1:1 so skis ride SOLIDLY up the ramp & launch off the lip!
   */
  getKickerSurfaceAt(x, z) {
    let bestLift = 0.0;
    let launchKicker = null;
    for (const k of this.kickers) {
      const rx = x - k.x;
      const rz = z - k.z;
      const lx = rx * k.rightX + rz * k.rightZ;
      const along = rx * k.fwdX + rz * k.fwdZ; // -length/2 (entry) -> +length/2 (exit)
      const halfW = k.width * 0.5;
      const halfL = k.length * 0.5;
      if (Math.abs(lx) >= halfW || Math.abs(along) >= halfL) continue;

      const uAlong = (along + halfL) / k.length; // 0 entry -> 0.80 lip -> 1 exit
      const latNorm = Math.min(1.0, Math.abs(lx) / halfW);
      const latProfile = Math.pow(Math.cos(latNorm * Math.PI * 0.5), 1.35);

      let rampH;
      if (uAlong < 0.80) {
        const t = uAlong / 0.80;
        rampH = Math.pow(t, 2.15) * k.height;
      } else {
        const t = (uAlong - 0.80) / 0.20;
        rampH = Math.cos(t * Math.PI * 0.5) * k.height;
      }
      const lift = Math.max(0.0, rampH * latProfile);
      if (lift > bestLift) bestLift = lift;

      if (uAlong >= 0.68 && uAlong <= 0.86 && latNorm < 0.72 && k.cooldown <= 0) {
        launchKicker = k;
      }
    }
    return { lift: bestLift, launchKicker };
  }

  /**
   * Triggered by the 120 Hz hard-body physics engine when a solid boulder/tree/serac impact occurs.
   * Solid push-out & velocity reflection ALWAYS happen in SkierController; this handles penalties & alerts!
   */
  registerSolidImpact(col, impactSpeed) {
    if (this.hitCooldown > 0) return;
    this.hitCooldown = 0.90;
    if (col) col.hit = true;
    this.collisions++;
    if (this.status === 'racing') {
      this.penaltiesSec += 1.5;
    }
    this.audioEngine?.playImpact();
    const label =
      col?.type === 'tree' ? 'TREE COLLISION' :
      col?.type === 'serac' ? 'GLACIAL SERAC IMPACT' : 'BOULDER IMPACT';
    const penText = this.status === 'racing' ? ' · +1.5s PENALTY' : ' · SPEED LOST';
    this.setAlert(`${label}!${penText}`, 1.8);
  }

  triggerKickerBonus(kicker) {
    if (!kicker || kicker.cooldown > 0) return;
    kicker.cooldown = 1.8;
    this.score += 180;
    this.audioEngine?.playJumpPop();
    this.setAlert('BIG AIR KICKER LAUNCH! +180', 1.5);
  }

  /**
   * Used by AUTO CARVE AI to steer smoothly through the upcoming race gates right to the FINISH ARCH!
   */
  getNextTargetWaypoint(skierPos) {
    const plan = this.getAiNavigationPlan(skierPos);
    return plan ? plan.wp1 : null;
  }

  /**
   * World-Cup Pro Race Navigation Plan for AI Racer:
   *  - Projects skier onto exact course centerline (gives true downhill vector & corridor lateral offset)
   *  - Selects next STRICTLY DOWNHILL pending gate (never turns uphill!) + lookahead gate wp2
   *  - Locks dead-center onto the Checkered FINISH Arch during the final approach!
   */
  getAiNavigationPlan(skierPos) {
    if (!this.activeStage || this.status !== 'racing') return null;

    const len = this.activeStage.lengthMeters;
    // Project skier onto exact course centerline via 2-step Gauss-Newton refinement
    let curAlong = THREE.MathUtils.clamp(this.progress * len, 0, len);
    let cPt = this.sampleCoursePoint(curAlong);
    for (let it = 0; it < 2; it++) {
      const rx = skierPos.x - cPt.x;
      const rz = skierPos.z - cPt.z;
      const dAlong = rx * cPt.fwdX + rz * cPt.fwdZ;
      curAlong = THREE.MathUtils.clamp(curAlong + dAlong, 0, len);
      cPt = this.sampleCoursePoint(curAlong);
    }
    const corridorLat = (skierPos.x - cPt.x) * cPt.rightX + (skierPos.z - cPt.z) * cPt.rightZ;

    // Pick the first pending gate that is STILL ahead along the course (never chase a gate behind!)
    let wp1 = null;
    let wp2 = null;
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      if (g.state !== 'pending') continue;
      const alongRel = (skierPos.x - g.x) * g.fwdX + (skierPos.z - g.z) * g.fwdZ;
      // Stay committed to the gate until crossing its plane (MPC handles smooth pre-turn into wp2!)
      if (alongRel < -0.25) {
        wp1 = { x: g.x, z: g.z, fwdX: g.fwdX, fwdZ: g.fwdZ, rightX: g.rightX, rightZ: g.rightZ, halfW: g.halfW, isFinish: false, along: g.along };
        if (i + 1 < this.gates.length) {
          const g2 = this.gates[i + 1];
          wp2 = { x: g2.x, z: g2.z, fwdX: g2.fwdX, fwdZ: g2.fwdZ, rightX: g2.rightX, rightZ: g2.rightZ, halfW: g2.halfW, isFinish: false, along: g2.along };
        } else if (this.finishZone) {
          const fz = this.finishZone;
          wp2 = { x: fz.x, z: fz.z, fwdX: fz.fwdX, fwdZ: fz.fwdZ, rightX: -fz.fwdZ, rightZ: fz.fwdX, halfW: fz.halfW * 0.45, isFinish: true, along: fz.along };
        }
        break;
      }
    }

    if (!wp1 && this.finishZone) {
      const fz = this.finishZone;
      wp1 = {
        x: fz.x,
        z: fz.z,
        fwdX: fz.fwdX,
        fwdZ: fz.fwdZ,
        rightX: -fz.fwdZ,
        rightZ: fz.fwdX,
        halfW: fz.halfW * 0.45,
        isFinish: true,
        along: fz.along
      };
      // Aim 20m PAST the finish line center so the skier blasts straight through dead center of the arch!
      wp2 = {
        x: fz.x + fz.fwdX * 20.0,
        z: fz.z + fz.fwdZ * 20.0,
        isFinish: true
      };
    }

    return {
      curAlong,
      corridorX: cPt.x,
      corridorZ: cPt.z,
      corridorFwdX: cPt.fwdX,
      corridorFwdZ: cPt.fwdZ,
      corridorRightX: cPt.rightX,
      corridorRightZ: cPt.rightZ,
      corridorLat,
      wp1,
      wp2
    };
  }

  update(dt, skier, nowSec) {
    if (!this.activeStage) return;

    // Emit celebratory smoke plumes from Finish Arch beacons
    if (this.flarePositions.length > 0 && this.spraySystem) {
      this.flareEmitAccum += dt;
      if (this.flareEmitAccum > 0.14) {
        this.flareEmitAccum = 0;
        for (const fp of this.flarePositions) {
          this.spraySystem.emit(fp, new THREE.Vector3((Math.random() - 0.5) * 1.2, 3.4, (Math.random() - 0.5) * 1.2), 1.05, 1.5, 0.0);
        }
      }
    }

    if (this.alertTimer > 0) {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) this.activeAlert = '';
    }
    if (this.hitCooldown > 0) this.hitCooldown -= dt;

    if (this.status !== 'racing') {
      this.windForceX *= Math.exp(-3 * dt);
      this.squallIntensity *= Math.exp(-2 * dt);
      return;
    }

    this.runTime += dt;
    const kmh = Math.round(skier.speed * 3.6);
    if (kmh > this.topSpeedKmh) this.topSpeedKmh = kmh;
    if (skier.airborneHeight > 0.12) this.airtimeTotal += dt;

    // 1. Dynamic Environmental Disruptors: Crosswind Gusts & Whiteout Squall Waves!
    const gustWave = Math.sin(nowSec * 0.42) * Math.sin(nowSec * 1.15 + 0.7);
    const gustActive = Math.abs(gustWave) > 0.55;
    this.windForceX = gustActive ? Math.sign(gustWave) * this.activeStage.windMax * ((Math.abs(gustWave) - 0.55) / 0.45) : 0.0;
    this.windDisplayKmh = Math.round(this.windForceX * 14.5);

    if (this.activeStage.squallProb > 0) {
      const sqWave = Math.sin(nowSec * 0.34 + 1.4);
      const targetSq = sqWave > (1.0 - this.activeStage.squallProb) ? (sqWave - (1.0 - this.activeStage.squallProb)) / this.activeStage.squallProb : 0.0;
      this.squallIntensity = THREE.MathUtils.lerp(this.squallIntensity, targetSq * 0.85, Math.min(1, dt * 1.8));
      if (this.squallIntensity > 0.45 && this.alertTimer <= 0.1) {
        this.setAlert('WHITEOUT SQUALL · VISIBILITY LOW!', 1.2);
      }
    } else {
      this.squallIntensity = 0;
    }

    // 2. Track Distance to Finish & Scripted Mid-Course Slab Avalanche!
    const fz = this.finishZone;
    const relFinX = skier.pos.x - fz.x;
    const relFinZ = skier.pos.z - fz.z;
    const signedToFinish = -(relFinX * fz.fwdX + relFinZ * fz.fwdZ); // > 0 before finish, <= 0 crossed finish!
    this.distanceToFinish = Math.max(0, signedToFinish);
    this.progress = THREE.MathUtils.clamp(1.0 - signedToFinish / this.activeStage.lengthMeters, 0.0, 1.0);

    if (
      this.activeStage.scriptedAvyAt > 0 &&
      !this.scriptedAvyTriggered &&
      this.progress >= this.activeStage.scriptedAvyAt
    ) {
      this.scriptedAvyTriggered = true;
      this.avalancheSystem.triggerNear(skier.pos, skier.getForwardXZ(new THREE.Vector2()));
      this.setAlert('⚠ UPSLOPE AVALANCHE RELEASED BEHIND YOU — OUTRUN IT!', 3.0);
    }

    // Consume meaningful avalanche chase outcome events (Engulfed Penalty vs Escaped Survival Bonus!)
    const avyEvent = this.avalancheSystem?.consumeEvent?.();
    if (avyEvent === 'caught') {
      this.collisions++;
      this.penaltiesSec += 3.0;
      this.setAlert('CAUGHT IN AVALANCHE! +3.0s PENALTY · PUSH OUT!', 3.2);
    } else if (avyEvent === 'escaped') {
      this.score += 500;
      this.audioEngine?.playGateClear();
      this.setAlert('AVALANCHE ESCAPED! +500 SURVIVAL BONUS', 2.8);
    }

    // 3. Evaluate Slalom Checkpoint Gates (Pass vs Miss +2.0s Penalty!)
    for (const g of this.gates) {
      if (g.state !== 'pending') continue;
      const rx = skier.pos.x - g.x;
      const rz = skier.pos.z - g.z;
      const alongRel = rx * g.fwdX + rz * g.fwdZ;
      if (alongRel >= 0.0) {
        const latDist = Math.abs(rx * g.rightX + rz * g.rightZ);
        if (latDist <= g.halfW + 0.75) {
          g.state = 'cleared';
          g.poleMat.color.setHex(0x2de89c);
          g.poleMat.emissive.setHex(0x0f6b44);
          g.stripMat.color.setHex(0x2de89c);
          this.gatesCleared++;
          this.score += 200;
          this.audioEngine?.playGateClear();
          this.setAlert(`GATE ${g.index + 1}/${this.gates.length} CLEARED! +200`, 1.4);
        } else {
          g.state = 'missed';
          g.poleMat.color.setHex(0xff9b26);
          g.poleMat.emissive.setHex(0x6b3a05);
          g.stripMat.color.setHex(0xff9b26);
          this.gatesMissed++;
          this.penaltiesSec += 2.0;
          this.audioEngine?.playGateMiss();
          this.setAlert(`GATE ${g.index + 1} MISSED · +2.0s PENALTY`, 1.8);
        }
      }
    }

    // 4. Sculpted Snow Kicker Cooldowns (solid 3D ramp riding & lip launch handled in 120 Hz SkierController!)
    for (const k of this.kickers) {
      if (k.cooldown > 0) k.cooldown = Math.max(0, k.cooldown - dt);
    }

    // 5. Glossy Blue-Ice Slip Patches (65% Grip Drop!)
    this.onBlueIce = false;
    for (const p of this.icePatches) {
      if (Math.hypot(skier.pos.x - p.x, skier.pos.z - p.z) < p.radius && skier.airborneHeight <= 0.12) {
        this.onBlueIce = true;
        break;
      }
    }
    this.surfaceGrip = this.onBlueIce ? 0.34 : 1.0;
    if (this.onBlueIce && this.alertTimer <= 0.15) {
      this.setAlert('BLUE ICE PATCH · LOW GRIP!', 0.8);
    }

    // 6. Jumpable Glacial Crevasse Gaps (Hard Pitfall Penalty if not jumped!)
    for (const c of this.crevasses) {
      if (c.cleared || c.hit) continue;
      const rx = skier.pos.x - c.x;
      const rz = skier.pos.z - c.z;
      const alongD = Math.abs(rx * c.fwdX + rz * c.fwdZ);
      const latD = Math.abs(rx * c.rightX + rz * c.rightZ);
      if (alongD < c.halfLen && latD < c.halfW) {
        if (skier.airborneHeight > 0.32) {
          c.cleared = true;
          this.score += 300;
          this.audioEngine?.playGateClear();
          this.setAlert('CREVASSE GAP CLEARED! +300', 1.8);
        } else {
          c.hit = true;
          this.collisions++;
          this.penaltiesSec += 2.0;
          skier.velX *= 0.25;
          skier.velZ *= 0.25;
          skier.speed = Math.hypot(skier.velX, skier.velZ);
          skier.triggerStumble?.(1.0);
          this.audioEngine?.playImpact();
          this.setAlert('CREVASSE IMPACT! +2.0s PENALTY · SKATE OUT!', 2.2);
        }
      }
    }

    // 7. Close-Call Near-Miss Bonus (Hard-body solid boulder/tree/serac collisions run every 120 Hz substep!)
    for (const h of this.hazards) {
      const dist = Math.hypot(skier.pos.x - h.x, skier.pos.z - h.z);
      if (!h.hit && !h.nearMissed && dist > h.radius + 0.60 && dist < h.radius + 2.35 && skier.speed > 9.0) {
        h.nearMissed = true;
        this.nearMisses++;
        this.score += 150;
        this.setAlert('CLOSE CALL NEAR MISS! +150', 1.2);
      }
    }

    // 8. FINISH LINE CROSSING CHECK!
    if (signedToFinish <= 0.0) {
      this.status = 'finished';
      const totalTime = this.runTime + this.penaltiesSec;
      const m = this.activeStage.medals;
      const medal =
        totalTime <= m.gold ? 'GOLD' :
        totalTime <= m.silver ? 'SILVER' :
        totalTime <= m.bronze ? 'BRONZE' : 'FINISHER';

      this.audioEngine?.playFinishFanfare();
      this.setAlert(`FINISH! ${totalTime.toFixed(2)}s · ${medal} MEDAL`, 4.0);

      if (this.onFinishCallback) {
        this.onFinishCallback({
          stageId: this.activeStage.id,
          stageTitle: this.activeStage.title,
          rawTime: this.runTime,
          penaltiesSec: this.penaltiesSec,
          officialTime: totalTime,
          gatesCleared: this.gatesCleared,
          totalGates: this.gates.length,
          topSpeedKmh: this.topSpeedKmh,
          nearMisses: this.nearMisses,
          airtimeTotal: this.airtimeTotal,
          collisions: this.collisions,
          score: this.score,
          medal
        });
      }
    }
  }
}
