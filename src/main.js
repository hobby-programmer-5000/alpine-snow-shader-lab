// ============================================================================
// Alpine Photoreal Ski Race & Custom Shader Lab — Main Orchestrator
//   - 3 Handcrafted Alpine Ski Race Stages (Start -> Slalom Gates -> Obstacles/Hazards -> Checkered FINISH ARCH!)
//   - Optional Free Sandbox Mode (Procedural / Hallasan DEM / Seoraksan DEM + Direct Brush)
//   - Graphics Quality Presets (LOW / HIGH / ULTRA ★ Photoreal) + Granular GPU Settings Panel
//   - 100% Procedural Seamless PBR Snow Normal/Cavity/Ice Textures + 3D Hierarchical Norway Spruces
//   - Ground Contact Shadow Decals + Cloud Shadows + 3D Parallax Crevasses + 4x MSAA + FXAA + Lens FX
// ============================================================================

import './style.css';
import * as THREE from 'three';
import { evalAlpineHeight, getActiveDem, raycastAlpineTerrain, setActiveDem } from './core/terrainMath.js';
import { KoreanDemLibrary } from './core/demLoader.js';
import { createProceduralPbrSnowTextures } from './core/proceduralPbrTextures.js';
import { TrackFboSystem } from './core/trackFboSystem.js';
import { SkierController } from './core/skierController.js';
import { AvalancheSystem } from './core/avalancheSystem.js';
import { AlpineAudioEngine } from './core/alpineAudio.js';
import { PostFxPipeline } from './core/postFxPipeline.js';
import { CourseManager, STAGE_DEFS } from './core/courseManager.js';
import { createClipmapTerrain } from './geometry/clipmapTerrain.js';
import { createProceduralSkierRig } from './geometry/proceduralSkis.js';
import { createProceduralAlpineForest } from './geometry/proceduralSpruce.js';
import { createProceduralRocksAndSeracs } from './geometry/proceduralBoulders.js';
import { createAtmosphericSnowFX } from './geometry/atmosphericSnowFX.js';
import { createAlpineLandmarks } from './geometry/alpineLandmarks.js';
import { PowderSpraySystem } from './geometry/powderSpraySystem.js';
import skyVert from './shaders/sky.vert.glsl?raw';
import skyFrag from './shaders/sky.frag.glsl?raw';
import valleyCloudsFrag from './shaders/valleyClouds.frag.glsl?raw';

// Physically calibrated HDR lighting palettes matching Mont Blanc exposure balance
const TOD_PRESETS = {
  bluebird: {
    elevDeg: 42,
    azimDeg: 118,
    sunColor: [1.0, 0.96, 0.90],
    sunIntensity: 2.15,
    skyZenith: [0.09, 0.30, 0.78],
    skyHorizon: [0.64, 0.83, 0.99],
    shadowTint: [0.28, 0.46, 0.82],
    groundBounce: [0.46, 0.56, 0.75],
    sssColor: [0.14, 0.50, 0.92],
    fogColor: [0.70, 0.85, 0.99],
    fogDensity: 0.00082,
    twilight: 0.0,
    exposure: 0.76
  },
  alpine: {
    elevDeg: 24,
    azimDeg: 52,
    sunColor: [1.0, 0.91, 0.78],
    sunIntensity: 2.10,
    skyZenith: [0.14, 0.37, 0.80],
    skyHorizon: [0.66, 0.80, 0.96],
    shadowTint: [0.32, 0.48, 0.78],
    groundBounce: [0.46, 0.56, 0.74],
    sssColor: [0.14, 0.48, 0.90],
    fogColor: [0.68, 0.81, 0.95],
    fogDensity: 0.00105,
    twilight: 0.0,
    exposure: 0.78
  },
  sunset: {
    elevDeg: 9,
    azimDeg: -58,
    sunColor: [1.0, 0.62, 0.34],
    sunIntensity: 2.25,
    skyZenith: [0.16, 0.19, 0.44],
    skyHorizon: [0.95, 0.56, 0.40],
    shadowTint: [0.34, 0.32, 0.62],
    groundBounce: [0.54, 0.42, 0.52],
    sssColor: [0.92, 0.44, 0.28],
    fogColor: [0.82, 0.56, 0.52],
    fogDensity: 0.00125,
    twilight: 1.0,
    exposure: 0.88
  }
};

// Graphics Quality Presets tailored from low-end laptops up to RTX 2070+ 8GB VRAM!
const QUALITY_PRESETS = {
  low: {
    dpr: 1.0,
    fboRes: 1024,
    clipmapSegs: 220,
    msaa: 0,
    trenchSteps: 8,
    godRaySteps: 16,
    cloudShadows: false,
    contactShadows: false,
    crevasses: false,
    fxaa: false,
    lensFx: false
  },
  high: {
    dpr: 1.5,
    fboRes: 1536,
    clipmapSegs: 280,
    msaa: 4,
    trenchSteps: 12,
    godRaySteps: 22,
    cloudShadows: true,
    contactShadows: true,
    crevasses: true,
    fxaa: true,
    lensFx: true
  },
  ultra: {
    dpr: 2.0,
    fboRes: 2048,
    clipmapSegs: 340,
    msaa: 4,
    trenchSteps: 16,
    godRaySteps: 32,
    cloudShadows: true,
    contactShadows: true,
    crevasses: true,
    fxaa: true,
    lensFx: true
  }
};

// --- 1. WebGL2 Renderer & Hardware GPU Detection ---
const canvas = document.getElementById('webgl-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // Handled cleanly via HDR MSAA RT + FXAA in PostFxPipeline
  powerPreference: 'high-performance',
  alpha: false
});
renderer.toneMapping = THREE.NoToneMapping;
renderer.autoClear = true;

function detectGpuRendererInfo() {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const raw = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const name = String(raw || 'WebGL2 GPU');
  const isSoftware = /swiftshader|llvmpipe|software|basic render/i.test(name);
  return { name, isSoftware };
}

const gpuInfo = detectGpuRendererInfo();
const initialQuality = gpuInfo.isSoftware ? 'high' : 'ultra';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.12, 2600);

const sunLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
const hemiLight = new THREE.HemisphereLight(0x9fc6ff, 0x3f5e8f, 1.15);
scene.add(sunLight, hemiLight);

// --- 2. Core Systems & Seamless Procedural PBR Micro-Textures ---
const demLib = new KoreanDemLibrary();
const pbrTextures = createProceduralPbrSnowTextures(512);
const audioEngine = new AlpineAudioEngine();
const trackSystem = new TrackFboSystem(renderer, {
  resolution: QUALITY_PRESETS[initialQuality].fboRes,
  spanMeters: 48.0,
  macroRes: 512,
  macroSpan: 240.0
});
const terrain = createClipmapTerrain(trackSystem, demLib.dummyTex, pbrTextures);
scene.add(terrain.group);

const skyMat = new THREE.ShaderMaterial({
  vertexShader: skyVert,
  fragmentShader: skyFrag,
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: true,
  uniforms: {
    uSunDir: terrain.sharedUniforms.uSunDir,
    uSunColor: terrain.sharedUniforms.uSunColor,
    uSkyZenith: terrain.sharedUniforms.uSkyZenith,
    uSkyHorizon: terrain.sharedUniforms.uSkyHorizon,
    uTime: terrain.sharedUniforms.uTime
  }
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), skyMat);
skyDome.frustumCulled = false;
skyDome.renderOrder = -10;
scene.add(skyDome);

const cloudDeckMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: valleyCloudsFrag,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: {
    uTime: terrain.sharedUniforms.uTime,
    uSunDir: terrain.sharedUniforms.uSunDir,
    uSunColor: terrain.sharedUniforms.uSunColor,
    uShadowTint: terrain.sharedUniforms.uShadowTint,
    uTwilight: terrain.sharedUniforms.uTwilight,
    uCloudAlt: { value: -95.0 }
  }
});
const cloudDeckGeo = new THREE.PlaneGeometry(3400, 3400, 1, 1);
cloudDeckGeo.rotateX(-Math.PI / 2);
const cloudDeck = new THREE.Mesh(cloudDeckGeo, cloudDeckMat);
cloudDeck.position.y = -95.0;
cloudDeck.frustumCulled = false;
scene.add(cloudDeck);

const skierRig = createProceduralSkierRig(terrain.sharedUniforms);
scene.add(skierRig.root);

const forest = createProceduralAlpineForest(terrain.sharedUniforms, pbrTextures, 240, 480);
scene.add(forest.group);

const rocksAndSeracs = createProceduralRocksAndSeracs(terrain.sharedUniforms, pbrTextures);
scene.add(rocksAndSeracs.group);

const atmosphericFX = createAtmosphericSnowFX(terrain.sharedUniforms, 2600);
scene.add(atmosphericFX.group);

const landmarks = createAlpineLandmarks();
scene.add(landmarks.group);

const spraySystem = new PowderSpraySystem(terrain.sharedUniforms, 2200);
scene.add(spraySystem.mesh);

const avalanche = new AvalancheSystem(spraySystem, audioEngine);
const skier = new SkierController(skierRig, trackSystem, spraySystem, audioEngine);
const course = new CourseManager(scene, audioEngine, avalanche, spraySystem, terrain.sharedUniforms, pbrTextures);

const initialDpr = Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[initialQuality].dpr);
renderer.setPixelRatio(initialDpr);
renderer.setSize(window.innerWidth, window.innerHeight, false);
const postFx = new PostFxPipeline(renderer, window.innerWidth * initialDpr, window.innerHeight * initialDpr, {
  msaaSamples: gpuInfo.isSoftware ? 0 : QUALITY_PRESETS[initialQuality].msaa
});

// --- 3. App State & Advanced GPU Quality Controller ---
const state = {
  stageId: 'stage1',
  terrainKey: 'hallasan',
  quality: initialQuality,
  dprCap: QUALITY_PRESETS[initialQuality].dpr,
  camMode: 'chase',
  tod: 'bluebird',
  sunElevDeg: 42,
  sunAzimDeg: 118,
  enablePostFX: true,
  showPiP: true,
  decay: 0.0,
  orbitYaw: -0.22,
  orbitPitch: 0.36,
  orbitDist: 8.6,
  macroYaw: -0.58,
  macroPitch: 0.48,
  macroDist: 3.4,
  brushAnchor: new THREE.Vector3(),
  isDraggingOrbit: false,
  isPaintingBrush: false,
  lastBrushXZ: null,
  lastMouseX: 0,
  lastMouseY: 0,
  loadingDem: false
};

document.getElementById('gpu-info-box').textContent =
  `Active GPU: ${gpuInfo.name} · Preset: ${initialQuality.toUpperCase()} (${postFx.msaaSamples}x MSAA)`;

function applyDpr(cap) {
  state.dprCap = cap;
  const effDpr = Math.min(window.devicePixelRatio || 1, cap);
  renderer.setPixelRatio(effDpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  postFx.resize(window.innerWidth * effDpr, window.innerHeight * effDpr);
  spraySystem.setPixelRatio(effDpr);
  atmosphericFX.setPixelRatio(effDpr);
}

function applyQualityPreset(key) {
  const q = QUALITY_PRESETS[key];
  if (!q) return;
  state.quality = key;

  document.querySelectorAll('#quality-pills .pill').forEach((b) => {
    b.classList.toggle('active', b.dataset.quality === key);
  });

  applyDpr(q.dpr);
  trackSystem.setNearResolution(q.fboRes);
  terrain.setInnerDensity(q.clipmapSegs);
  postFx.setMsaaSamples(gpuInfo.isSoftware ? 0 : q.msaa);

  terrain.sharedUniforms.uTrenchShadowSteps.value = q.trenchSteps;
  terrain.sharedUniforms.uCloudShadowStrength.value = q.cloudShadows ? 0.34 : 0.0;
  terrain.sharedUniforms.uEnableCrevasses.value = q.crevasses ? 1.0 : 0.0;
  forest.shadowUniforms.uEnableContactShadows.value = q.contactShadows ? 1.0 : 0.0;
  rocksAndSeracs.shadowUniforms.uEnableContactShadows.value = q.contactShadows ? 1.0 : 0.0;
  course.setContactShadowsEnabled(q.contactShadows);
  postFx.godRayMat.uniforms.uGodRaySteps.value = q.godRaySteps;
  postFx.compositeMat.uniforms.uEnableFXAA.value = q.fxaa ? 1.0 : 0.0;
  postFx.compositeMat.uniforms.uEnableLensFX.value = q.lensFx ? 1.0 : 0.0;

  // Sync Advanced GPU UI controls cleanly
  document.getElementById('adv-dpr').value = String(q.dpr);
  document.getElementById('adv-fbo').value = String(q.fboRes);
  document.getElementById('adv-clipmap').value = String(q.clipmapSegs);
  document.getElementById('adv-msaa').value = String(gpuInfo.isSoftware ? 0 : q.msaa);
  document.getElementById('adv-trenchsteps').value = String(q.trenchSteps);
  document.getElementById('adv-godrays').value = String(q.godRaySteps);
  document.getElementById('adv-cloudshadow').checked = q.cloudShadows;
  document.getElementById('adv-contactshadow').checked = q.contactShadows;
  document.getElementById('adv-crevasses').checked = q.crevasses;
  document.getElementById('adv-fxaa').checked = q.fxaa;
  document.getElementById('adv-lensfx').checked = q.lensFx;
  document.getElementById('pip-title').textContent = `DUAL FBO (${q.fboRes}²·48m + 512²·240m)`;
  document.getElementById('gpu-info-box').textContent =
    `Active GPU: ${gpuInfo.name} · Preset: ${key.toUpperCase()} (${postFx.msaaSamples}x MSAA)`;

  // Re-stamp entry track on resized FBO so snow tracks never vanish when switching quality!
  skier.hasPrevStamp = false;
  skier._prestampEntryIfNeeded?.();
}

function updateSunAndAtmosphere(presetKey = null) {
  if (presetKey && TOD_PRESETS[presetKey]) {
    const p = TOD_PRESETS[presetKey];
    state.tod = presetKey;
    state.sunElevDeg = p.elevDeg;
    state.sunAzimDeg = p.azimDeg;

    document.querySelectorAll('#tod-pills .pill').forEach((b) => {
      b.classList.toggle('active', b.dataset.tod === presetKey);
    });

    const u = terrain.sharedUniforms;
    u.uSunColor.value.setRGB(...p.sunColor);
    u.uSunIntensity.value = p.sunIntensity;
    u.uSkyZenith.value.setRGB(...p.skyZenith);
    u.uSkyHorizon.value.setRGB(...p.skyHorizon);
    u.uShadowTint.value.setRGB(...p.shadowTint);
    u.uGroundBounce.value.setRGB(...p.groundBounce);
    u.uSSSColor.value.setRGB(...p.sssColor);
    u.uFogColor.value.setRGB(...p.fogColor);
    u.uFogDensity.value = p.fogDensity;
    u.uTwilight.value = p.twilight;
    postFx.compositeMat.uniforms.uExposure.value = p.exposure;
    sunLight.color.setRGB(...p.sunColor);

    document.getElementById('sl-sunelev').value = String(p.elevDeg);
    document.getElementById('sl-sunazim').value = String(p.azimDeg);
    document.getElementById('val-sunelev').textContent = `${p.elevDeg}°`;
    document.getElementById('val-sunazim').textContent = `${p.azimDeg}°`;
  }

  const elev = THREE.MathUtils.degToRad(state.sunElevDeg);
  const azim = THREE.MathUtils.degToRad(state.sunAzimDeg);
  const sx = Math.cos(elev) * Math.sin(azim);
  const sy = Math.sin(elev);
  const sz = -Math.cos(elev) * Math.cos(azim);

  terrain.sharedUniforms.uSunDir.value.set(sx, sy, sz).normalize();
  sunLight.position.set(sx * 100, sy * 100, sz * 100);
}

// --- 4. Terrain & Stage Loader ---
const finishModal = document.getElementById('finish-modal');
const raceBar = document.getElementById('race-bar');

async function loadTerrainKey(terrainKey) {
  state.terrainKey = terrainKey;
  document.querySelectorAll('#sandbox-terrain-pills .pill').forEach((b) => {
    b.classList.toggle('active', b.dataset.terrain === terrainKey);
  });

  const badge = document.getElementById('badge-terrain-type');
  if (terrainKey === 'procedural') {
    setActiveDem(null);
    terrain.setDemRecord(null, demLib.dummyTex);
    badge.textContent = 'ZERO-ASSET GLSL';
    cloudDeck.position.y = -95.0;
  } else {
    state.loadingDem = true;
    badge.textContent = 'LOADING DEM...';
    try {
      const record = await demLib.loadMountain(terrainKey);
      setActiveDem(record);
      terrain.setDemRecord(record, demLib.dummyTex);
      badge.textContent = record.meta.koName;
      cloudDeck.position.y = record.meta.minElevObserved + 110.0;
    } catch (err) {
      console.error(err);
      setActiveDem(null);
      terrain.setDemRecord(null, demLib.dummyTex);
      badge.textContent = 'ZERO-ASSET GLSL';
    } finally {
      state.loadingDem = false;
    }
  }
}

async function selectStage(stageId) {
  if (state.loadingDem) return;
  state.stageId = stageId;
  finishModal.classList.add('hidden');

  document.querySelectorAll('#stage-pills .pill').forEach((b) => {
    b.classList.toggle('active', b.dataset.stage === stageId);
  });

  if (stageId === 'sandbox') {
    raceBar.classList.add('hidden');
    course.buildStage('sandbox');
  } else {
    const cfg = STAGE_DEFS[stageId];
    await loadTerrainKey(cfg.terrainKey);
    updateSunAndAtmosphere(cfg.tod);
    course.buildStage(stageId);
    raceBar.classList.remove('hidden');
  }

  avalanche.reset();
  spraySystem.clear();
  skier.reset();
  forest.repopulate(skier.pos.x, skier.pos.z);
  rocksAndSeracs.populateAroundAnchor(skier.pos.x, skier.pos.z);
  atmosphericFX.placeRidgeBanners(skier.pos.x, skier.pos.z);
  landmarks.repopulateAroundCourse(skier.pos.x, skier.pos.z);
  state.brushAnchor.copy(skier.pos);

  const fwd = skier.getForwardXZ(new THREE.Vector2());
  smoothCamPos.set(skier.pos.x - fwd.x * 8, skier.pos.y + 4.5, skier.pos.z - fwd.y * 8);
  smoothLookAt.copy(skier.pos);
  updateHintText();
}

// Show sleek Podium Modal upon crossing the Checkered FINISH ARCH!
course.onFinishCallback = (res) => {
  document.getElementById('finish-medal').textContent = `${res.medal} MEDAL`;
  document.getElementById('finish-title').textContent = `${res.stageTitle} COMPLETE!`;
  const mins = Math.floor(res.officialTime / 60);
  const secs = (res.officialTime % 60).toFixed(2).padStart(5, '0');
  document.getElementById('finish-time').textContent = `${String(mins).padStart(2, '0')}:${secs}`;
  document.getElementById('f-gates').textContent = `${res.gatesCleared} / ${res.totalGates}`;
  document.getElementById('f-penalties').textContent = `+${res.penaltiesSec.toFixed(1)}s`;
  document.getElementById('f-speed').textContent = `${res.topSpeedKmh} KM/H`;
  document.getElementById('f-nearmiss').textContent = String(res.nearMisses);
  document.getElementById('f-airtime').textContent = `${res.airtimeTotal.toFixed(1)}s`;
  document.getElementById('f-score').textContent = res.score.toLocaleString();

  const nextBtn = document.getElementById('btn-finish-next');
  nextBtn.textContent = res.stageId === 'stage3' ? 'REPLAY STAGE 1 →' : 'NEXT STAGE →';
  finishModal.classList.remove('hidden');
};

document.getElementById('btn-finish-retry').addEventListener('click', () => selectStage(state.stageId));
document.getElementById('btn-finish-next').addEventListener('click', () => {
  const order = ['stage1', 'stage2', 'stage3'];
  const next = order[(order.indexOf(state.stageId) + 1) % order.length];
  selectStage(next);
});

// --- 5. Pointer, Keyboard & HUD Binding ---
const ndcPointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

function pickTerrainXZ(clientX, clientY) {
  ndcPointer.x = (clientX / window.innerWidth) * 2 - 1;
  ndcPointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndcPointer, camera);
  const hit = raycastAlpineTerrain(raycaster.ray.origin, raycaster.ray.direction);
  return hit ? new THREE.Vector2(hit.x, hit.z) : null;
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  state.lastMouseX = e.clientX;
  state.lastMouseY = e.clientY;
  if (skier.mode === 'brush' && e.button === 0 && !e.shiftKey) {
    state.isPaintingBrush = true;
    const hit = pickTerrainXZ(e.clientX, e.clientY);
    if (hit) {
      trackSystem.stampBrush(hit, hit, 0.34, 0.95, 0.92, 0.85);
      state.lastBrushXZ = hit;
    }
  } else {
    state.isDraggingOrbit = true;
  }
});

window.addEventListener('pointermove', (e) => {
  const dx = e.clientX - state.lastMouseX;
  const dy = e.clientY - state.lastMouseY;
  state.lastMouseX = e.clientX;
  state.lastMouseY = e.clientY;

  if (state.isPaintingBrush && skier.mode === 'brush') {
    const hit = pickTerrainXZ(e.clientX, e.clientY);
    if (hit) {
      const prev = state.lastBrushXZ || hit;
      if (prev.distanceTo(hit) < 6.0) {
        trackSystem.stampBrush(prev, hit, 0.34, 0.95, 0.92, 0.85);
      }
      state.lastBrushXZ = hit;
    }
    return;
  }

  if (state.isDraggingOrbit) {
    if (state.camMode === 'macro') {
      state.macroYaw -= dx * 0.006;
      state.macroPitch = THREE.MathUtils.clamp(state.macroPitch + dy * 0.005, 0.14, 1.38);
    } else {
      state.orbitYaw -= dx * 0.006;
      state.orbitPitch = THREE.MathUtils.clamp(state.orbitPitch + dy * 0.005, 0.08, 1.35);
    }
  }
});

window.addEventListener('pointerup', () => {
  state.isDraggingOrbit = false;
  state.isPaintingBrush = false;
  state.lastBrushXZ = null;
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const factor = 1 + Math.sign(e.deltaY) * 0.09;
    if (state.camMode === 'macro') {
      state.macroDist = THREE.MathUtils.clamp(state.macroDist * factor, 1.1, 14.0);
    } else {
      state.orbitDist = THREE.MathUtils.clamp(state.orbitDist * factor, 2.2, 42.0);
    }
  },
  { passive: false }
);

function triggerSlabAvalanche() {
  const fwd = skier.getForwardXZ(new THREE.Vector2());
  avalanche.triggerNear(skier.pos, fwd);
  document.getElementById('btn-slab-avy').classList.add('active');
  if (course.activeStage) {
    course.setAlert('⚠ UPSLOPE AVALANCHE BEHIND YOU — SPRINT OR DODGE SIDEWAYS!', 2.0);
  }
}

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') skier.keys.w = true;
  if (k === 's' || k === 'arrowdown') skier.keys.s = true;
  if (k === 'a' || k === 'arrowleft') skier.keys.a = true;
  if (k === 'd' || k === 'arrowright') skier.keys.d = true;
  if (k === ' ' && skier.mode === 'ski') {
    e.preventDefault();
    skier.triggerJump();
  }
  if (k === 'e' && skier.mode === 'ski') skier.triggerPolePlant();
  if (k === 'g') triggerSlabAvalanche();
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') skier.keys.w = false;
  if (k === 's' || k === 'arrowdown') skier.keys.s = false;
  if (k === 'a' || k === 'arrowleft') skier.keys.a = false;
  if (k === 'd' || k === 'arrowright') skier.keys.d = false;
});

function updateHintText() {
  const hint = document.getElementById('hint-text');
  const dem = getActiveDem();
  const src = dem ? ` · DEM: ${dem.attribution}` : ' · 100% Procedural Photoreal GLSL';
  if (state.stageId !== 'sandbox') {
    const s = STAGE_DEFS[state.stageId];
    hint.textContent =
      skier.mode === 'ski'
        ? `${s.shortLabel} · WASD Carve · Space Jump Crevasse · E Pole · G Slab Avy · Clear Gates to FINISH!${src}`
        : `${s.shortLabel} · AI Racer active — click DRIVE (WASD) to race yourself to the Checkered FINISH Arch!${src}`;
  } else {
    hint.textContent =
      skier.mode === 'brush'
        ? `SANDBOX BRUSH · Left-Drag directly on snow to sculpt · Right-Drag to orbit${src}`
        : `FREE SANDBOX · Switch Procedural/한라산/설악산 · Press G for Slab Avalanche${src}`;
  }
}

document.querySelectorAll('#stage-pills .pill').forEach((btn) => {
  btn.addEventListener('click', () => selectStage(btn.dataset.stage));
});

document.querySelectorAll('#sandbox-terrain-pills .pill').forEach((btn) => {
  btn.addEventListener('click', async () => {
    await loadTerrainKey(btn.dataset.terrain);
    if (state.stageId !== 'sandbox') {
      state.stageId = 'sandbox';
      document.querySelectorAll('#stage-pills .pill').forEach((b) => b.classList.toggle('active', b.dataset.stage === 'sandbox'));
      raceBar.classList.add('hidden');
      course.buildStage('sandbox');
    }
    avalanche.reset();
    spraySystem.clear();
    skier.reset();
    forest.repopulate(skier.pos.x, skier.pos.z);
    rocksAndSeracs.populateAroundAnchor(skier.pos.x, skier.pos.z);
    atmosphericFX.placeRidgeBanners(skier.pos.x, skier.pos.z);
    landmarks.repopulateAroundCourse(skier.pos.x, skier.pos.z);
    updateHintText();
  });
});

document.querySelectorAll('#quality-pills .pill').forEach((btn) => {
  btn.addEventListener('click', () => applyQualityPreset(btn.dataset.quality));
});

document.querySelectorAll('#mode-pills .pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mode-pills .pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    skier.setMode(mode);
    if (mode === 'brush') {
      state.brushAnchor.copy(skier.pos);
      if (state.camMode === 'pov') setCameraMode('macro');
    }
    updateHintText();
  });
});

function setCameraMode(camMode) {
  state.camMode = camMode;
  document.querySelectorAll('#camera-pills .pill').forEach((b) => {
    b.classList.toggle('active', b.dataset.cam === camMode);
  });
}
document.querySelectorAll('#camera-pills .pill').forEach((btn) => {
  btn.addEventListener('click', () => setCameraMode(btn.dataset.cam));
});

document.querySelectorAll('#tod-pills .pill').forEach((btn) => {
  btn.addEventListener('click', () => updateSunAndAtmosphere(btn.dataset.tod));
});

// Right Panel Tab Switcher (SHADER LAB | GPU ULTRA)
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('tab-shader').classList.toggle('active', tab === 'shader');
    document.getElementById('tab-gpu').classList.toggle('active', tab === 'gpu');
  });
});

document.getElementById('btn-slab-avy').addEventListener('click', triggerSlabAvalanche);

const btnAudio = document.getElementById('btn-audio');
btnAudio.addEventListener('click', () => {
  const on = audioEngine.toggle();
  btnAudio.textContent = on ? 'AUDIO: ON' : 'AUDIO: OFF';
  btnAudio.classList.toggle('active', on);
});

const shaderPanel = document.getElementById('shader-panel');
const btnTogglePanel = document.getElementById('btn-toggle-panel');
btnTogglePanel.addEventListener('click', () => {
  const collapsed = shaderPanel.classList.toggle('collapsed');
  btnTogglePanel.textContent = collapsed ? 'SHOW LAB' : 'HIDE LAB';
});

const viewModeEl = document.getElementById('view-mode');
viewModeEl.addEventListener('change', () => {
  const v = Number(viewModeEl.value);
  terrain.sharedUniforms.uViewMode.value = v;
  terrain.setWireframe(v === 5);
});

const bindToggle = (id, fn) => {
  const el = document.getElementById(id);
  el.addEventListener('change', () => fn(el.checked));
};
bindToggle('tog-tracks', (on) => (terrain.sharedUniforms.uEnableTracks.value = on ? 1.0 : 0.0));
bindToggle('tog-berms', (on) => (terrain.sharedUniforms.uEnableBerms.value = on ? 1.0 : 0.0));
bindToggle('tog-selfshadow', (on) => (terrain.sharedUniforms.uEnableSelfShadow.value = on ? 1.0 : 0.0));
bindToggle('tog-sastrugi', (on) => (terrain.sharedUniforms.uEnableSastrugi.value = on ? 1.0 : 0.0));
bindToggle('tog-glints', (on) => (terrain.sharedUniforms.uEnableGlints.value = on ? 1.0 : 0.0));
bindToggle('tog-granite', (on) => (terrain.sharedUniforms.uEnableGranite.value = on ? 1.0 : 0.0));
bindToggle('tog-postfx', (on) => (state.enablePostFX = on));
bindToggle('tog-pip', (on) => {
  state.showPiP = on;
  document.getElementById('pip-container').classList.toggle('hidden', !on);
});

// Advanced GPU Controls Binding
document.getElementById('adv-dpr').addEventListener('change', (e) => applyDpr(Number(e.target.value)));
document.getElementById('adv-fbo').addEventListener('change', (e) => {
  const res = Number(e.target.value);
  trackSystem.setNearResolution(res);
  document.getElementById('pip-title').textContent = `DUAL FBO (${res}²·48m + 512²·240m)`;
});
document.getElementById('adv-clipmap').addEventListener('change', (e) => terrain.setInnerDensity(Number(e.target.value)));
document.getElementById('adv-msaa').addEventListener('change', (e) => postFx.setMsaaSamples(Number(e.target.value)));
document.getElementById('adv-trenchsteps').addEventListener('change', (e) => {
  terrain.sharedUniforms.uTrenchShadowSteps.value = Number(e.target.value);
});
document.getElementById('adv-godrays').addEventListener('change', (e) => {
  postFx.godRayMat.uniforms.uGodRaySteps.value = Number(e.target.value);
});
bindToggle('adv-cloudshadow', (on) => (terrain.sharedUniforms.uCloudShadowStrength.value = on ? 0.34 : 0.0));
bindToggle('adv-contactshadow', (on) => {
  forest.shadowUniforms.uEnableContactShadows.value = on ? 1.0 : 0.0;
  rocksAndSeracs.shadowUniforms.uEnableContactShadows.value = on ? 1.0 : 0.0;
  course.setContactShadowsEnabled(on);
});
bindToggle('adv-crevasses', (on) => (terrain.sharedUniforms.uEnableCrevasses.value = on ? 1.0 : 0.0));
bindToggle('adv-fxaa', (on) => (postFx.compositeMat.uniforms.uEnableFXAA.value = on ? 1.0 : 0.0));
bindToggle('adv-lensfx', (on) => (postFx.compositeMat.uniforms.uEnableLensFX.value = on ? 1.0 : 0.0));

const bindSlider = (id, valId, fmt, fn) => {
  const el = document.getElementById(id);
  const out = document.getElementById(valId);
  el.addEventListener('input', () => {
    const val = Number(el.value);
    out.textContent = fmt(val);
    fn(val);
  });
};
bindSlider('sl-trench', 'val-trench', (v) => `${v.toFixed(2)} m`, (v) => (terrain.sharedUniforms.uTrenchDepth.value = v));
bindSlider('sl-berm', 'val-berm', (v) => `${v.toFixed(2)} m`, (v) => (terrain.sharedUniforms.uBermHeight.value = v));
bindSlider('sl-sunelev', 'val-sunelev', (v) => `${v.toFixed(0)}°`, (v) => {
  state.sunElevDeg = v;
  updateSunAndAtmosphere(null);
});
bindSlider('sl-sunazim', 'val-sunazim', (v) => `${v.toFixed(0)}°`, (v) => {
  state.sunAzimDeg = v;
  updateSunAndAtmosphere(null);
});
bindSlider('sl-glint', 'val-glint', (v) => v.toFixed(2), (v) => (terrain.sharedUniforms.uGlintIntensity.value = v));
bindSlider('sl-sastrugi', 'val-sastrugi', (v) => v.toFixed(2), (v) => (terrain.sharedUniforms.uSastrugiStrength.value = v));
bindSlider('sl-decay', 'val-decay', (v) => v.toFixed(2), (v) => (state.decay = v));

document.getElementById('btn-clear-tracks').addEventListener('click', () => {
  trackSystem.clear(skier.pos.x, skier.pos.z);
  avalanche.reset();
});
document.getElementById('btn-reset-pos').addEventListener('click', () => selectStage(state.stageId));

// --- 6. Camera Placement & Resize ---
const smoothCamPos = new THREE.Vector3(-16, 1810, -264);
const smoothLookAt = new THREE.Vector3(-16, 1805, -280);
const skierFwd2 = new THREE.Vector2();

function updateCamera(dt, nowSec) {
  const anchor = skier.mode === 'brush' ? state.brushAnchor : skier.pos;
  const fwd = skier.getForwardXZ(skierFwd2);
  const rightX = -fwd.y;
  const rightZ = fwd.x;

  const totalShake = avalanche.shake + skier.impactShake;
  const shakeX = totalShake > 0.002 ? Math.sin(nowSec * 37.0) * totalShake : 0;
  const shakeY = totalShake > 0.002 ? Math.cos(nowSec * 43.0) * totalShake * 0.8 : 0;

  if (state.camMode === 'pov') {
    skierRig.setFirstPersonMode(true);
    // Physically couple POV camera height & lateral weight shift to skier's real crouch,
    // double-poling crunch, V-skate weight transfer, and jump landing shock absorption!
    const skateSway = Math.sin(skier.skatePhase) * skier.skateActivity * 0.10;
    const poleBob = Math.sin(skier.polePushPhase) * skier.polePushActivity * 0.055;
    const crouchDrop =
      skier.tuckFactor * 0.22
      + skier.landingCompression * 0.19
      + skier.unweightPulse * 0.05;

    const eyeX = skier.pos.x - fwd.x * 0.06 + rightX * skateSway + shakeX;
    const eyeZ = skier.pos.z - fwd.y * 0.06 + rightZ * skateSway;
    const eyeY = skier.pos.y + 1.44 - crouchDrop + poleBob + shakeY;
    const lookX = skier.pos.x + fwd.x * 9.5;
    const lookZ = skier.pos.z + fwd.y * 9.5;
    const lookY = evalAlpineHeight(lookX, lookZ) - 0.18;

    camera.position.set(eyeX, eyeY, eyeZ);
    camera.lookAt(lookX, lookY, lookZ);
    camera.rotateZ(-skier.edgeAngle * 0.24 - skateSway * 0.35);
    return;
  }

  skierRig.setFirstPersonMode(false);

  if (state.camMode === 'macro') {
    const targetX = anchor.x - fwd.x * 1.35;
    const targetZ = anchor.z - fwd.y * 1.35;
    const targetY = evalAlpineHeight(targetX, targetZ) + 0.15;

    const r = state.macroDist;
    const yaw = state.macroYaw + Math.atan2(-fwd.x, -fwd.y);
    const ox = Math.sin(yaw) * Math.cos(state.macroPitch) * r;
    const oy = Math.sin(state.macroPitch) * r;
    const oz = Math.cos(yaw) * Math.cos(state.macroPitch) * r;

    const desiredPos = new THREE.Vector3(
      targetX + ox + shakeX,
      Math.max(targetY + oy, evalAlpineHeight(targetX + ox, targetZ + oz) + 0.45) + shakeY,
      targetZ + oz
    );
    const desiredLook = new THREE.Vector3(targetX, targetY, targetZ);

    const k = Math.min(1.0, dt * 8.0);
    smoothCamPos.lerp(desiredPos, k);
    smoothLookAt.lerp(desiredLook, k);
    camera.position.copy(smoothCamPos);
    camera.lookAt(smoothLookAt);
    return;
  }

  const behindYaw = Math.atan2(-fwd.x, -fwd.y) + state.orbitYaw;
  const r = state.orbitDist;
  const ox = Math.sin(behindYaw) * Math.cos(state.orbitPitch) * r;
  const oy = Math.sin(state.orbitPitch) * r + 1.45;
  const oz = Math.cos(behindYaw) * Math.cos(state.orbitPitch) * r;

  const camX = anchor.x + ox;
  const camZ = anchor.z + oz;
  const minGround = evalAlpineHeight(camX, camZ) + 0.9;
  const desiredPos = new THREE.Vector3(camX + shakeX, Math.max(anchor.y + oy, minGround) + shakeY, camZ);
  const desiredLook = new THREE.Vector3(
    anchor.x + fwd.x * 3.2 + rightX * 0.9,
    anchor.y + 0.5,
    anchor.z + fwd.y * 3.2 + rightZ * 0.9
  );

  const k = Math.min(1.0, dt * 7.0);
  smoothCamPos.lerp(desiredPos, k);
  smoothLookAt.lerp(desiredLook, k);
  camera.position.copy(smoothCamPos);
  camera.lookAt(smoothLookAt);
}

window.addEventListener('resize', () => {
  applyDpr(state.dprCap);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// --- 7. Main Animation Loop ---
const pipViewport = document.getElementById('pip-viewport');
const statFps = document.getElementById('stat-fps');
const statSpeed = document.getElementById('stat-speed');
const statAlt = document.getElementById('stat-alt');
const statEdge = document.getElementById('stat-edge');
const statSlope = document.getElementById('stat-slope');
const statSurface = document.getElementById('stat-surface');
const statStance = document.getElementById('stat-stance');
const btnSlabAvy = document.getElementById('btn-slab-avy');
const raceClockEl = document.getElementById('race-clock');
const raceGatesEl = document.getElementById('race-gates');
const raceDistEl = document.getElementById('race-dist');
const raceWindEl = document.getElementById('race-wind');
const raceProgFill = document.getElementById('race-progress-fill');
const raceAlertEl = document.getElementById('race-alert');
const avyChaseBanner = document.getElementById('avy-chase-banner');
const avyChaseText = document.getElementById('avy-chase-text');
const avyChaseFill = document.getElementById('avy-chase-fill');

let prevTime = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let currentFps = 60;
let lensWetSmooth = 0.0;

window.__ALPINE_LAB__ = {
  selectStage,
  applyQualityPreset,
  triggerSlabAvalanche,
  setCameraMode,
  getTelemetry: () => {
    const plan = course.getAiNavigationPlan(skier.pos);
    const fz = course.finishZone;
    let finishLatOffset = null;
    if (fz) {
      const fRightX = -fz.fwdZ;
      const fRightZ = fz.fwdX;
      finishLatOffset = Number((((skier.pos.x - fz.x) * fRightX) + ((skier.pos.z - fz.z) * fRightZ)).toFixed(2));
    }
    return {
      stageId: course.activeStage?.id || 'sandbox',
      status: course.status,
      mode: skier.mode,
      x: Number(skier.pos.x.toFixed(2)),
      y: Number(skier.pos.y.toFixed(2)),
      z: Number(skier.pos.z.toFixed(2)),
      speedKmh: Math.round(skier.speed * 3.6),
      slopeDeg: Number(skier.slopeDeg.toFixed(1)),
      edgeDeg: Math.round(THREE.MathUtils.radToDeg(skier.edgeAngle)),
      stance: skier.stance,
      surface: skier.surfaceType,
      corridorLat: plan ? Number(plan.corridorLat.toFixed(2)) : null,
      curAlong: plan ? Number(plan.curAlong.toFixed(1)) : null,
      distToFinish: Number(course.distanceToFinish.toFixed(1)),
      finishLatOffset,
      archHalfW: fz ? 7.5 : null,
      gatesCleared: course.gatesCleared,
      gatesMissed: course.gatesMissed,
      totalGates: course.gates.length,
      collisions: course.collisions,
      penaltiesSec: Number(course.penaltiesSec.toFixed(1)),
      runTime: Number(course.runTime.toFixed(2)),
      avyActive: avalanche.isRunning,
      avyGap: avalanche.isRunning ? Number(avalanche.gapMeters.toFixed(1)) : null
    };
  }
};

function animate(now) {
  requestAnimationFrame(animate);

  const nowSec = now * 0.001;
  const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) * 0.001));
  prevTime = now;

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.35) {
    currentFps = Math.round(fpsFrames / fpsAccum);
    const displayAlt = getActiveDem() ? Math.round(skier.pos.y) : Math.round(2840 + skier.pos.y);
    statFps.textContent = `${currentFps} FPS`;
    statSpeed.textContent = `${String(Math.round(skier.speed * 3.6)).padStart(2, '0')} KM/H`;
    statAlt.textContent = `ALT ${displayAlt}m`;
    statEdge.textContent = `EDGE ${Math.round(THREE.MathUtils.radToDeg(Math.abs(skier.edgeAngle)))}°`;
    statSlope.textContent = `SLOPE ${Math.round(skier.slopeDeg)}°`;
    statSurface.textContent = skier.surfaceType;
    statStance.textContent = skier.stance;
    statStance.className = `stance-chip${skier.stance === 'STUMBLE' || skier.stance === 'SLIP' || skier.stance === 'SKATE' || skier.stance === 'POLE' ? ' warn' : skier.stance === 'AIR' || skier.stance === 'TUCK' ? ' air' : ''}`;
    btnSlabAvy.classList.toggle('active', avalanche.isRunning);
    fpsAccum = 0;
    fpsFrames = 0;
  }

  terrain.sharedUniforms.uTime.value = nowSec;
  skier.update(dt, state.decay, course, avalanche, [forest.colliders, rocksAndSeracs.colliders]);
  course.update(dt, skier, nowSec);
  avalanche.update(dt, skier.pos, terrain.sharedUniforms);
  spraySystem.update(dt);
  forest.updateAroundZ(skier.pos.z);
  landmarks.update(nowSec);
  atmosphericFX.setWind(course.windForceX);

  // Sync live race HUD strip (including real-time upslope avalanche chase gap telemetry!)
  if (course.activeStage) {
    const tTotal = course.runTime + course.penaltiesSec;
    const m = Math.floor(tTotal / 60);
    const s = (tTotal % 60).toFixed(2).padStart(5, '0');
    raceClockEl.textContent =
      course.penaltiesSec > 0
        ? `${String(m).padStart(2, '0')}:${s} (+${course.penaltiesSec.toFixed(0)}s)`
        : `${String(m).padStart(2, '0')}:${s}`;
    raceGatesEl.textContent = `GATE ${course.gatesCleared}/${course.gates.length}`;
    raceDistEl.textContent =
      course.status === 'finished' ? 'FINISHED!' : `${Math.round(course.distanceToFinish)}m TO FINISH`;
    const wKmh = course.windDisplayKmh;
    raceWindEl.textContent = wKmh === 0 ? 'WIND CALM' : `WIND ${wKmh > 0 ? '→' : '←'} ${Math.abs(wKmh)} km/h`;
    raceProgFill.style.width = `${Math.round(course.progress * 100)}%`;

    raceAlertEl.textContent = course.activeAlert;
    raceAlertEl.style.color = '';
  }

  // Dedicated always-visible live Upslope Avalanche Chase Threat Meter (works in Race & Sandbox!)
  if (avalanche.isRunning) {
    avyChaseBanner.classList.remove('hidden');
    avyChaseBanner.classList.toggle('safe', !avalanche.inPath);
    avyChaseText.textContent = avalanche.getHudAlertText();
    const dangerPct = THREE.MathUtils.clamp((1.0 - avalanche.gapMeters / 36.0) * 100.0, 6.0, 100.0);
    avyChaseFill.style.width = `${Math.round(dangerPct)}%`;
  } else {
    avyChaseBanner.classList.add('hidden');
  }

  audioEngine.update({
    speed: skier.speed,
    edgeAngle: skier.edgeAngle,
    airborne: skier.airborneHeight,
    avyActive: avalanche.active,
    avyProximity: avalanche.proximity,
    onBlueIce: course.onBlueIce,
    windGust: course.windForceX,
    paused: skier.mode === 'brush'
  });

  terrain.updateCenter(skier.pos.x, skier.pos.z);
  terrain.sharedUniforms.uSkierPos.value.copy(skier.pos);
  skier.getForwardXZ(terrain.sharedUniforms.uSkierDirXZ.value);
  terrain.sharedUniforms.uSkierAirborne.value = Math.min(1.0, skier.airborneHeight * 0.6);
  terrain.sharedUniforms.uSquallIntensity.value = course.squallIntensity;

  cloudDeck.position.x = skier.pos.x;
  cloudDeck.position.z = skier.pos.z;

  updateCamera(dt, nowSec);

  const vMode = terrain.sharedUniforms.uViewMode.value;
  const isDebugView = vMode > 0.5 && vMode !== 5;
  const speedNorm = skier.mode === 'brush' ? 0.0 : THREE.MathUtils.clamp((skier.speed - 6.0) / 18.0, 0.0, 1.0);

  // Accumulate optical lens snow-melt droplets during squalls, avalanches & deep powder carving!
  const targetWet = Math.min(1.0, course.squallIntensity * 0.95 + avalanche.proximity * 0.85);
  lensWetSmooth = THREE.MathUtils.lerp(lensWetSmooth, targetWet, Math.min(1, dt * (targetWet > lensWetSmooth ? 2.2 : 0.35)));

  postFx.render(scene, camera, {
    sunDir: terrain.sharedUniforms.uSunDir.value,
    sunColor: terrain.sharedUniforms.uSunColor.value,
    speedFactor: state.camMode === 'macro' || isDebugView ? 0.0 : speedNorm,
    faceShot: isDebugView ? 0.0 : Math.min(0.85, avalanche.faceShot + course.squallIntensity * 0.32),
    lensWet: isDebugView ? 0.0 : lensWetSmooth,
    stormStreaks: isDebugView ? 0.0 : Math.min(1.0, avalanche.proximity * 0.9 + course.squallIntensity * 0.85 + Math.abs(course.windForceX) * 0.14),
    time: nowSec,
    enablePostFX: state.enablePostFX && !isDebugView
  });

  if (state.showPiP) {
    trackSystem.renderPiP(pipViewport, terrain.sharedUniforms.uSunDir.value);
  }
}

// Launch straight into Stage 1 (Hallasan Real DEM Alpine Race) at optimal GPU preset!
applyQualityPreset(initialQuality);
selectStage('stage1');
requestAnimationFrame(animate);
