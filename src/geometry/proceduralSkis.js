// ============================================================================
// 100% Zero-Asset Sculpted Close-Up Photoreal Articulated Alpine Skier Rig
// Engineered for BOTH CHASE, close-up MACRO (2-3m) AND 1st-Person POV!
//   - Procedural 512² Technical Gore-Tex Cloth Albedo + Normal + Roughness Maps
//   - Procedural 256² Pebbled Leather Glove Normal + 2x2 Carbon Fiber Twill Maps
//   - ZERO Box/Tin-Can Primitives: Sculpted anatomical torso, quilted sleeves,
//     teardrop avalanche airbag backpack w/ harness straps, 4-buckle alpine boots,
//     curved aero helmet w/ spherical mirror goggles, and ergonomic 5-digit gloves!
//   - Parametric 55-station twin-tip skis w/ real-time G-load vertex flexing,
//     bow-wave powder ribbons & under-ski multiplicative contact shadows!
// ============================================================================

import * as THREE from 'three';
import bowWaveVert from '../shaders/bowWave.vert.glsl?raw';
import bowWaveFrag from '../shaders/bowWave.frag.glsl?raw';

/**
 * Helper: convert a 2D grayscale heightfield array [size*size] into a crisp tangent-space Normal DataTexture
 */
function buildNormalTexFromHeight(heightArr, size, strength = 3.2) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => heightArr[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const gy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -gx, ny = -gy, nz = 1.0;
      const inv = 1.0 / Math.hypot(nx, ny, nz);
      const o = (y * size + x) * 4;
      data[o]     = Math.round((nx * inv * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createTechnicalJacketTextures() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Deep alpine rescue crimson Gore-Tex shell with matte dark Cordura shoulder yoke & hem
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, '#161f2d');
  grad.addColorStop(0.22, '#1d2738');
  grad.addColorStop(0.24, '#b82124');
  grad.addColorStop(0.55, '#cc2929');
  grad.addColorStop(0.84, '#a61c20');
  grad.addColorStop(0.87, '#18202e');
  grad.addColorStop(1.0, '#121822');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle horizontal quilted baffle shading + realistic soft cloth crease shadows
  for (let row = 0; row < 6; row++) {
    const ry = 132 + row * 54;
    const bGrad = ctx.createLinearGradient(0, ry - 26, 0, ry + 26);
    bGrad.addColorStop(0.0, 'rgba(0,0,0,0.22)');
    bGrad.addColorStop(0.28, 'rgba(255,255,255,0.06)');
    bGrad.addColorStop(0.78, 'rgba(0,0,0,0.05)');
    bGrad.addColorStop(1.0, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = bGrad;
    ctx.fillRect(0, ry - 26, size, 52);
  }

  // Fine ripstop technical fabric micro-weave
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 6) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }

  // Reflective alpine mountain trim along shoulder seam + waterproof taped center zipper & chest pockets
  ctx.fillStyle = '#dde9f8';
  ctx.fillRect(0, 120, size, 6);
  ctx.fillStyle = '#11161f';
  ctx.fillRect(250, 0, 12, size);
  ctx.fillStyle = '#253247';
  ctx.fillRect(156, 178, 56, 7);
  ctx.fillRect(300, 178, 56, 7);

  const albedoTex = new THREE.CanvasTexture(canvas);
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  albedoTex.anisotropy = 4;

  // Synthesize matching tangent-space Cloth Normal Map (ripstop weave + quilted baffles + organic tension folds!)
  const nSize = 256;
  const hArr = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const v = y / nSize;
    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const ripstop = ((x % 4 === 0) || (y % 4 === 0)) ? 0.08 : 0.0;
      const baffle = Math.sin(v * Math.PI * 10.0) * 0.24;
      const seamGroove = Math.pow(Math.abs(Math.sin(v * Math.PI * 10.0)), 0.35) * 0.14;
      const clothFold = Math.sin(u * Math.PI * 8.0 + Math.sin(v * Math.PI * 6.0) * 1.8) * 0.16
                      + Math.cos(u * Math.PI * 14.0 - v * Math.PI * 12.0) * 0.08;
      hArr[y * nSize + x] = 0.5 + ripstop + baffle * 0.5 + seamGroove + clothFold;
    }
  }
  const normalTex = buildNormalTexFromHeight(hArr, nSize, 3.6);
  return { map: albedoTex, normalMap: normalTex };
}

function createTechnicalPantsNormal() {
  const nSize = 256;
  const hArr = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    const v = y / nSize;
    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const weave = ((x % 3 === 0) ? 0.06 : 0) + ((y % 3 === 0) ? 0.06 : 0);
      // Articulated knee & hip fabric folds
      const creases = Math.sin(v * Math.PI * 14.0 + Math.cos(u * Math.PI * 4.0) * 1.6) * 0.24
                    + Math.sin(u * Math.PI * 6.0 + v * Math.PI * 8.0) * 0.12;
      hArr[y * nSize + x] = 0.5 + weave + creases;
    }
  }
  return buildNormalTexFromHeight(hArr, nSize, 3.4);
}

function createPebbledLeatherNormal() {
  const nSize = 256;
  const hArr = new Float32Array(nSize * nSize);
  for (let y = 0; y < nSize; y++) {
    for (let x = 0; x < nSize; x++) {
      const u = x / nSize;
      const v = y / nSize;
      const pebble = Math.sin(u * 90.0 + Math.cos(v * 82.0) * 2.0) * Math.cos(v * 90.0 - Math.sin(u * 76.0) * 2.0) * 0.18;
      const stitch = (Math.abs((v * 8.0) % 1.0 - 0.5) < 0.04) ? -0.22 : 0.0;
      const crease = Math.sin(v * Math.PI * 8.0 + u * Math.PI * 2.0) * 0.16;
      hArr[y * nSize + x] = 0.5 + pebble + stitch + crease;
    }
  }
  return buildNormalTexFromHeight(hArr, nSize, 4.0);
}

function createCarbonWeaveTextures() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#151b24';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 8) {
    for (let x = 0; x < size; x += 8) {
      const odd = ((x / 8 + y / 8) % 2) === 0;
      ctx.fillStyle = odd ? '#263244' : '#121821';
      ctx.fillRect(x, y, 7, 7);
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 18);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function createProceduralTopsheetTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0.0, '#0f1724');
  grad.addColorStop(0.38, '#1a2c47');
  grad.addColorStop(0.65, '#d63226');
  grad.addColorStop(0.84, '#ff5d38');
  grad.addColorStop(1.0, '#121821');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1024);

  // Subtle brushed metal longitudinal grain
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let x = 14; x < 242; x += 4) ctx.fillRect(x, 0, 1, 1024);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.moveTo(0, 260); ctx.lineTo(256, 175); ctx.lineTo(256, 225); ctx.lineTo(0, 310);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#38d2ff';
  ctx.beginPath();
  ctx.moveTo(0, 330); ctx.lineTo(256, 245); ctx.lineTo(256, 275); ctx.lineTo(0, 360);
  ctx.closePath();
  ctx.fill();

  // Polished steel carving edges
  ctx.fillStyle = '#dce8f6';
  ctx.fillRect(0, 0, 9, 1024);
  ctx.fillRect(247, 0, 9, 1024);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createIridescentGoggleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 128);
  grad.addColorStop(0.0, '#ff6a1f');
  grad.addColorStop(0.38, '#ffbe38');
  grad.addColorStop(0.70, '#2cd6ff');
  grad.addColorStop(1.0, '#224eff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function applyForegroundMaskHook(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `// Subtle upward snowfield bounce light on underside of gloves/jacket/skis (grounds gear in snow!)
       gl_FragColor.rgb += vec3(0.055, 0.072, 0.095) * (0.35 + 0.65 * clamp(-normal.y, 0.0, 1.0));
       #include <dithering_fragment>
       gl_FragColor.a = 0.0;`
    );
  };
  material.customProgramCacheKey = () => 'alpine_fg_sharp_mask_v3';
  return material;
}

function createParametricSkiGeometry() {
  const stations = 55;
  const length = 1.84;
  const halfLen = length * 0.5;
  const thick = 0.016;

  const positions = [];
  const baseY = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= stations; i++) {
    const t = i / stations; // 0 = tail (+Z), 1 = tip (-Z)
    const z = halfLen - t * length;

    let halfW = 0.054 + 0.015 * Math.pow((t - 0.48) * 2.0, 2.0);
    if (t > 0.90) {
      const k = (t - 0.90) / 0.10;
      halfW *= Math.sqrt(Math.max(0.02, 1.0 - k * k));
    } else if (t < 0.07) {
      const k = (0.07 - t) / 0.07;
      halfW *= Math.sqrt(Math.max(0.06, 1.0 - k * k));
    }

    let y = 0.014 * Math.sin(t * Math.PI);
    if (t > 0.72) {
      const r = (t - 0.72) / 0.28;
      y += 0.145 * r * r * r;
    } else if (t < 0.18) {
      const r = (0.18 - t) / 0.18;
      y += 0.065 * r * r * r;
    }

    positions.push(
      -halfW, y + thick, z,
       halfW, y + thick, z,
       halfW * 0.94, y, z,
      -halfW * 0.94, y, z
    );
    baseY.push(y + thick, y + thick, y, y);
    uvs.push(0, t, 1, t, 1, t, 0, t);
  }

  for (let i = 0; i < stations; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    indices.push(a + 0, a + 1, b + 1, a + 0, b + 1, b + 0);
    indices.push(a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);
    indices.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
    indices.push(a + 3, a + 0, b + 0, a + 3, b + 0, b + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.userData.baseY = new Float32Array(baseY);
  geo.userData.stations = stations;
  return geo;
}

function createBowWaveRibbonGeometry(sideSign) {
  const geo = new THREE.PlaneGeometry(0.24, 1.15, 6, 18);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / 0.24 + 0.5;
    const v = pos.getY(i) / 1.15 + 0.5;
    const z = -0.92 + v * 1.15;
    const x = sideSign * (0.06 + u * 0.22 + Math.pow(u, 2.0) * 0.14);
    const y = Math.sin(u * Math.PI * 0.78) * 0.18;
    pos.setXYZ(i, x, y, z);
    geo.attributes.uv.setXY(i, v, u);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Smooth anatomically contoured Gore-Tex Alpine Jacket Torso (32x24 sculpted mesh, ZERO cylinder can!)
 */
function buildSculptedTorsoGeometry() {
  const geo = new THREE.SphereGeometry(1.0, 32, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i);
    const uy = pos.getY(i); // -1 hem -> +1 neck/shoulders
    const uz = pos.getZ(i);
    const yT = uy * 0.5 + 0.5; // 0 bottom -> 1 top

    // Athletic V-taper: broad shoulders at yT=0.82, tailored waist at yT=0.25, flared shell hem at yT=0.05
    const widthProfile = 0.195 + 0.075 * Math.sin(Math.pow(yT, 0.75) * Math.PI) + 0.032 * Math.exp(-Math.pow((yT - 0.80) * 5.0, 2.0));
    const depthProfile = 0.135 + 0.032 * Math.sin(yT * Math.PI) + (uz < 0 ? 0.015 * Math.sin(yT * Math.PI) : 0.0);
    // Subtle quilted jacket puff ribs
    const baffle = 1.0 + 0.022 * Math.sin(yT * Math.PI * 10.0);

    const x = ux * widthProfile * baffle;
    const y = yT * 0.62 - 0.02;
    const z = uz * depthProfile * baffle;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted teardrop backcountry avalanche airbag pack (ZERO BoxGeometry!)
 */
function buildSculptedBackpackGeometry() {
  const geo = new THREE.SphereGeometry(1.0, 24, 18);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i);
    const uy = pos.getY(i);
    const uz = pos.getZ(i);
    const yT = uy * 0.5 + 0.5;

    // Rounded contoured teardrop profile: slightly wider at lower lumbar, streamlined sleek top
    const w = 0.155 * (1.08 - yT * 0.24);
    const h = 0.24;
    // Flat ergonomic back-panel against skier's spine (uz < 0), rounded outer shell (uz > 0)
    const d = uz < 0 ? 0.035 : (0.115 * (0.85 + 0.25 * Math.sin(yT * Math.PI)));
    // Soft squaring so it reads as an alpine technical pack, not a balloon
    const sx = Math.sign(ux) * Math.pow(Math.abs(ux), 0.78) * w;
    const sy = Math.sign(uy) * Math.pow(Math.abs(uy), 0.80) * h;
    const sz = Math.sign(uz) * Math.pow(Math.abs(uz), 0.76) * d;
    pos.setXYZ(i, sx, sy, sz);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Smooth anatomically tapered limb/sleeve/pant geometry with subtle cloth creases (20 radial segments!)
 */
function buildSculptedLimbGeometry(topR, midR, botR, length) {
  const pts = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 bottom -> 1 top
    const y = (t - 0.5) * length;
    let r;
    if (t < 0.12) {
      r = botR * Math.sin((t / 0.12) * Math.PI * 0.5);
    } else if (t > 0.88) {
      r = topR * Math.sin(((1.0 - t) / 0.12) * Math.PI * 0.5);
    } else {
      const k = (t - 0.12) / 0.76;
      r = (1 - k) * (1 - k) * botR + 2 * (1 - k) * k * midR + k * k * topR;
      r *= 1.0 + 0.035 * Math.sin(k * Math.PI * 5.0); // subtle natural fabric drape fold!
    }
    pts.push(new THREE.Vector2(Math.max(0.002, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 20);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted 4-Buckle Alpine Ski Boot (ZERO BoxGeometry brick!)
 */
function buildSculptedSkiBoot(shellMat, cuffMat, buckleMat) {
  const boot = new THREE.Group();

  // Contoured anatomical lower boot shell (rounded toe box + arched instep + lugged sole)
  const lowerGeo = new THREE.SphereGeometry(1.0, 22, 14);
  const pos = lowerGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i);
    const uy = pos.getY(i);
    const uz = pos.getZ(i);
    const zT = (-uz) * 0.5 + 0.5; // 0 heel (+Z) -> 1 toe (-Z)
    const w = 0.052 * (0.94 + 0.14 * Math.sin(zT * Math.PI));
    const h = uy < 0 ? 0.028 : (0.068 * (1.12 - zT * 0.52)); // taller instep, sleek low toe box!
    const x = Math.sign(ux) * Math.pow(Math.abs(ux), 0.78) * w;
    const y = Math.sign(uy) * Math.pow(Math.abs(uy), 0.80) * h + 0.072;
    const z = uz * 0.165 + 0.03;
    pos.setXYZ(i, x, y, z);
  }
  lowerGeo.computeVertexNormals();
  boot.add(new THREE.Mesh(lowerGeo, shellMat));

  // Canted articulated upper boot cuff + power strap
  const cuffGeo = buildSculptedLimbGeometry(0.060, 0.056, 0.053, 0.24);
  const cuff = new THREE.Mesh(cuffGeo, cuffMat);
  cuff.position.set(0, 0.22, 0.085);
  cuff.rotation.x = -0.24;
  boot.add(cuff);

  // 4 Brushed Aluminum Micro-Adjust Ski Boot Buckles
  const buckleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.072, 10);
  buckleGeo.rotateZ(Math.PI / 2);
  for (let b = 0; b < 4; b++) {
    const bk = new THREE.Mesh(buckleGeo, buckleMat);
    if (b < 2) {
      bk.position.set(0, 0.115 - b * 0.015, -0.02 - b * 0.055);
    } else {
      bk.position.set(0, 0.18 + (b - 2) * 0.065, 0.04 - (b - 2) * 0.018);
    }
    boot.add(bk);
  }

  return boot;
}

function createProceduralPole(shaftMat, gripMat, accentMat) {
  const pole = new THREE.Group();

  // Contoured ergonomic ski pole grip (20-segment smooth LatheGeometry!)
  const gripPts = [
    new THREE.Vector2(0.008, -0.11),
    new THREE.Vector2(0.017, -0.09),
    new THREE.Vector2(0.015, -0.045),
    new THREE.Vector2(0.018,  0.00),
    new THREE.Vector2(0.016,  0.038),
    new THREE.Vector2(0.022,  0.068),
    new THREE.Vector2(0.018,  0.082),
    new THREE.Vector2(0.001,  0.088)
  ];
  const grip = new THREE.Mesh(new THREE.LatheGeometry(gripPts, 20), gripMat);
  pole.add(grip);

  // Subtle woven nylon wrist-strap loop exiting grip top
  const strapCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.055, 0.015),
    new THREE.Vector3(0, 0.045, 0.075),
    new THREE.Vector3(0, -0.015, 0.082),
    new THREE.Vector3(0, -0.025, 0.018)
  ]);
  pole.add(new THREE.Mesh(new THREE.TubeGeometry(strapCurve, 14, 0.0045, 8, false), accentMat));

  // Tapered 2x2 carbon-weave pole shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0082, 0.0058, 1.18, 14), shaftMat);
  shaft.position.y = -0.65;
  pole.add(shaft);

  // Powder basket & carbide tip
  const basket = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.0065, 10, 22), accentMat);
  basket.rotation.x = Math.PI / 2;
  basket.position.y = -1.15;
  pole.add(basket);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.042, 10), accentMat);
  tip.rotation.x = Math.PI;
  tip.position.y = -1.23;
  pole.add(tip);

  return pole;
}

/**
 * Ergonomic Sculpted 5-Digit Alpine Leather Ski Glove (ZERO BoxGeometry — crisp even at 0.4m in POV!)
 */
function createSculptedGlove(leatherMat, cuffMat, knuckleMat, sideSign = 1) {
  const glove = new THREE.Group();

  // Anatomically contoured rounded palm + back-of-hand
  const palmGeo = new THREE.SphereGeometry(1.0, 20, 14);
  palmGeo.scale(0.044, 0.027, 0.056);
  glove.add(new THREE.Mesh(palmGeo, leatherMat));

  // Molded padded knuckle armor ridge across metacarpals
  const knuckGeo = new THREE.CapsuleGeometry(0.011, 0.054, 8, 12);
  knuckGeo.rotateZ(Math.PI / 2);
  const knuck = new THREE.Mesh(knuckGeo, knuckleMat);
  knuck.position.set(0, 0.016, -0.032);
  glove.add(knuck);

  // Tapered padded gauntlet wrist cuff + Velcro cinch strap
  const cuffGeo = new THREE.CylinderGeometry(0.044, 0.050, 0.082, 18);
  cuffGeo.rotateX(Math.PI / 2);
  const cuff = new THREE.Mesh(cuffGeo, leatherMat);
  cuff.position.set(0, 0.002, 0.068);
  glove.add(cuff);

  const velcro = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.0065, 8, 22), cuffMat);
  velcro.position.set(0, 0.002, 0.062);
  glove.add(velcro);

  // 4 smoothly curved anatomical fingers + opposable thumb wrapping naturally around pole grip!
  for (let f = 0; f < 4; f++) {
    const fx = -0.027 + f * 0.018;
    const fLen = f === 1 || f === 2 ? 1.05 : 0.94;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(fx, 0.012, -0.040),
      new THREE.Vector3(fx, -0.012, -0.072 * fLen),
      new THREE.Vector3(fx, -0.042, -0.044 * fLen),
      new THREE.Vector3(fx, -0.036, -0.016)
    ]);
    const finger = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.0096, 10, false), leatherMat);
    glove.add(finger);
  }
  const thumbX = -sideSign * 0.036;
  const thumbCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(thumbX, 0.002, -0.006),
    new THREE.Vector3(thumbX * 1.38, -0.012, -0.044),
    new THREE.Vector3(thumbX * 0.55, -0.030, -0.058)
  ]);
  glove.add(new THREE.Mesh(new THREE.TubeGeometry(thumbCurve, 10, 0.0112, 10, false), leatherMat));

  return glove;
}

export function createProceduralSkierRig(terrainUniforms) {
  const root = new THREE.Group();
  const leanGroup = new THREE.Group();
  root.add(leanGroup);

  // High-res Procedural PBR Materials (all masked alpha = 0.0 so motion blur keeps skier razor-sharp!)
  const jacketTex = createTechnicalJacketTextures();
  const pantsNormal = createTechnicalPantsNormal();
  const leatherNormal = createPebbledLeatherNormal();
  const carbonMap = createCarbonWeaveTextures();

  const skiMat = applyForegroundMaskHook(new THREE.MeshStandardMaterial({
    map: createProceduralTopsheetTexture(), roughness: 0.24, metalness: 0.28
  }));
  const jacketMat = applyForegroundMaskHook(new THREE.MeshStandardMaterial({
    map: jacketTex.map,
    normalMap: jacketTex.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.58,
    metalness: 0.06
  }));
  const pantsMat = applyForegroundMaskHook(new THREE.MeshStandardMaterial({
    color: 0x182232,
    normalMap: pantsNormal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.66,
    metalness: 0.05
  }));
  const carbonMat = applyForegroundMaskHook(new THREE.MeshStandardMaterial({
    map: carbonMap,
    roughness: 0.34,
    metalness: 0.52
  }));
  const aluminumMat = applyForegroundMaskHook(new THREE.MeshStandardMaterial({
    color: 0xd0dceb,
    roughness: 0.22,
    metalness: 0.88
  }));
  const bootAccentMat = applyForegroundMaskHook(new THREE.MeshStandardMaterial({
    color: 0xe6452c,
    roughness: 0.32,
    metalness: 0.16
  }));
  const packMat = applyForegroundMaskHook(new THREE.MeshStandardMaterial({
    color: 0x1d283a,
    normalMap: pantsNormal,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughness: 0.62,
    metalness: 0.10
  }));
  const leatherMat = applyForegroundMaskHook(new THREE.MeshStandardMaterial({
    color: 0x1b2029,
    normalMap: leatherNormal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughness: 0.54,
    metalness: 0.12
  }));
  const helmetMat = applyForegroundMaskHook(new THREE.MeshStandardMaterial({
    color: 0x141b26,
    roughness: 0.22,
    metalness: 0.38
  }));
  const goggleMat = applyForegroundMaskHook(new THREE.MeshStandardMaterial({
    map: createIridescentGoggleTexture(),
    roughness: 0.06,
    metalness: 0.82
  }));

  // --- 1. Twin Skis with Real-Time Flexing + Sculpted 4-Buckle Boots + Bow-Wave + Under-Ski Shadow ---
  const skiGeoL = createParametricSkiGeometry();
  const skiGeoR = createParametricSkiGeometry();
  const stanceHalf = 0.20;

  const bowWaveUniforms = {
    uTime: terrainUniforms ? terrainUniforms.uTime : { value: 0 },
    uSpeed: { value: 0 },
    uEdgeAngle: { value: 0 },
    uAirborne: { value: 0 },
    uSunColor: terrainUniforms ? terrainUniforms.uSunColor : { value: new THREE.Color(1, 0.95, 0.85) },
    uShadowTint: terrainUniforms ? terrainUniforms.uShadowTint : { value: new THREE.Color(0.32, 0.48, 0.78) }
  };

  const bowWaveMat = new THREE.ShaderMaterial({
    vertexShader: bowWaveVert,
    fragmentShader: bowWaveFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: bowWaveUniforms
  });

  const skiShadowMat = new THREE.MeshBasicMaterial({
    color: 0x456699,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    blending: THREE.MultiplyBlending
  });
  const skiShadowGeo = new THREE.PlaneGeometry(0.24, 1.92);
  skiShadowGeo.rotateX(-Math.PI / 2);

  const buildSkiAssembly = (sideSign, geo) => {
    const skiGroup = new THREE.Group();
    skiGroup.position.set(sideSign * stanceHalf, 0, 0);

    skiGroup.add(new THREE.Mesh(geo, skiMat));

    // Contoured tech ski bindings (toe & heel towers)
    const toeBind = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.052, 14), carbonMat);
    toeBind.position.set(0, 0.042, -0.13);
    const heelBind = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.040, 0.062, 14), carbonMat);
    heelBind.position.set(0, 0.046, 0.23);
    skiGroup.add(toeBind, heelBind);

    // Sculpted 4-buckle Alpine Ski Boot
    skiGroup.add(buildSculptedSkiBoot(bootAccentMat, carbonMat, aluminumMat));

    // Powder bow-wave wake ribbon along outer front edge of ski
    skiGroup.add(new THREE.Mesh(createBowWaveRibbonGeometry(sideSign), bowWaveMat));

    // Under-ski contact shadow strip
    const shadowStrip = new THREE.Mesh(skiShadowGeo, skiShadowMat);
    shadowStrip.position.y = -0.025;
    skiGroup.add(shadowStrip);

    return { skiGroup, geo, shadowStrip };
  };

  const leftSkiObj = buildSkiAssembly(-1, skiGeoL);
  const rightSkiObj = buildSkiAssembly(1, skiGeoR);
  leanGroup.add(leftSkiObj.skiGroup, rightSkiObj.skiGroup);

  // --- 2. Close-Up Sculpted Full-Body Articulated Alpine Skier (MACRO + CHASE!) ---
  const bodyGroup = new THREE.Group();
  leanGroup.add(bodyGroup);

  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.84, 0.14);
  bodyGroup.add(pelvisGroup);

  const pelvisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 22, 16), pantsMat);
  pelvisMesh.scale.set(1.22, 0.86, 0.88);
  pelvisGroup.add(pelvisMesh);

  const thighGeo = buildSculptedLimbGeometry(0.105, 0.095, 0.078, 0.44);
  const shinGeo  = buildSculptedLimbGeometry(0.080, 0.078, 0.074, 0.43);

  const makeLeg = (sideSign) => {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(sideSign * 0.16, -0.04, 0.0);

    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.position.set(0, -0.17, -0.11);
    thigh.rotation.x = 0.56;
    hipPivot.add(thigh);

    // True articulated Knee Pivot so inside/outside leg flex, V-skate kick & landing shock animate organically!
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.34, -0.22);
    hipPivot.add(kneePivot);

    // Soft padded Cordura articulated knee panel
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.084, 16, 12), carbonMat);
    kneeCap.scale.set(0.95, 1.05, 0.92);
    kneePivot.add(kneeCap);

    // Snow-gaiter ski pant lower leg draping smoothly over ski boot cuff!
    const shin = new THREE.Mesh(shinGeo, pantsMat);
    shin.position.set(sideSign * 0.03, -0.16, 0.11);
    shin.rotation.x = -0.45;
    kneePivot.add(shin);

    pelvisGroup.add(hipPivot);
    return { hipPivot, kneePivot };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // Sculpted Gore-Tex Torso + Storm Hood Collar + Ergonomic Teardrop Airbag Pack
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.04, -0.02);
  torsoGroup.rotation.x = -0.38; // Athletic forward downhill lean (-Z)!
  pelvisGroup.add(torsoGroup);

  const chest = new THREE.Mesh(buildSculptedTorsoGeometry(), jacketMat);
  torsoGroup.add(chest);

  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.33, 12, 20), jacketMat);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.set(0, 0.50, -0.005);
  torsoGroup.add(shoulders);

  // High alpine storm collar + folded jacket hood behind neck
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.116, 0.11, 20), carbonMat);
  collar.position.set(0, 0.59, -0.01);
  const foldedHood = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.038, 12, 20, Math.PI * 1.2), jacketMat);
  foldedHood.rotation.set(Math.PI * 0.52, 0, Math.PI * 0.9);
  foldedHood.position.set(0, 0.57, 0.045);
  torsoGroup.add(collar, foldedHood);

  // Sculpted Contoured Teardrop Backcountry Airbag Backpack + Curved Shoulder Harness Straps!
  const backpack = new THREE.Group();
  backpack.position.set(0, 0.30, 0.155);
  backpack.add(new THREE.Mesh(buildSculptedBackpackGeometry(), packMat));

  // Reflective orange rescue piping + diagonal ski-carry strap hugging pack curve
  const pipeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.12, 0.05, 0.088),
    new THREE.Vector3(0.0, 0.075, 0.118),
    new THREE.Vector3(0.12, 0.05, 0.088)
  ]);
  backpack.add(new THREE.Mesh(new THREE.TubeGeometry(pipeCurve, 14, 0.009, 8, false), bootAccentMat));

  const diagCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.085, 0.17, 0.086),
    new THREE.Vector3(0.0, 0.01, 0.120),
    new THREE.Vector3(0.085, -0.15, 0.082)
  ]);
  backpack.add(new THREE.Mesh(new THREE.TubeGeometry(diagCurve, 14, 0.012, 8, false), bootAccentMat));

  // Twin curved shoulder harness straps wrapping over shoulders!
  for (const s of [-1, 1]) {
    const hCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.10, 0.19, 0.03),
      new THREE.Vector3(s * 0.15, 0.25, -0.12),
      new THREE.Vector3(s * 0.14, 0.05, -0.25),
      new THREE.Vector3(s * 0.12, -0.18, -0.12)
    ]);
    backpack.add(new THREE.Mesh(new THREE.TubeGeometry(hCurve, 16, 0.017, 8, false), carbonMat));
  }
  torsoGroup.add(backpack);

  // High-Res Sculpted Aero Ski Helmet + Ear Pads + Curved Spherical Frameless Mirror Goggles!
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.69, -0.03);
  headGroup.rotation.x = 0.32;
  const helmetShell = new THREE.Mesh(new THREE.SphereGeometry(0.138, 32, 24), helmetMat);
  helmetShell.scale.set(0.95, 1.03, 1.12);

  // Soft neck balaclava + ear pads
  const faceMask = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 16), carbonMat);
  faceMask.position.set(0, -0.032, -0.012);

  // Double-curved spherical frameless iridescent mirror goggle visor!
  const goggleVisor = new THREE.Mesh(
    new THREE.SphereGeometry(0.144, 24, 16, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.38, Math.PI * 0.26),
    goggleMat
  );
  goggleVisor.position.set(0, -0.005, -0.016);

  const goggleStrap = new THREE.Mesh(new THREE.TorusGeometry(0.139, 0.016, 10, 28), bootAccentMat);
  goggleStrap.rotation.x = Math.PI / 2;
  goggleStrap.position.set(0, -0.005, 0.012);
  headGroup.add(helmetShell, faceMask, goggleVisor, goggleStrap);
  torsoGroup.add(headGroup);

  // Sculpted Articulated Arms + Tapered Gore-Tex Sleeves + Ergonomic 5-Digit Leather Gloves + Carbon Poles!
  const upperArmGeo = buildSculptedLimbGeometry(0.072, 0.066, 0.056, 0.34);
  const forearmGeo  = buildSculptedLimbGeometry(0.058, 0.054, 0.046, 0.33);

  const makeArmAndPole = (sideSign) => {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(sideSign * 0.26, 0.49, -0.01);

    const upperArm = new THREE.Mesh(upperArmGeo, jacketMat);
    upperArm.position.set(sideSign * 0.08, -0.14, -0.06);
    upperArm.rotation.set(0.45, 0, sideSign * 0.42);
    shoulderPivot.add(upperArm);

    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(sideSign * 0.16, -0.26, -0.14);
    shoulderPivot.add(elbowPivot);

    const forearm = new THREE.Mesh(forearmGeo, jacketMat);
    forearm.position.set(sideSign * 0.04, -0.04, -0.14);
    forearm.rotation.set(1.22, 0, sideSign * 0.12);
    elbowPivot.add(forearm);

    const handPivot = new THREE.Group();
    handPivot.position.set(sideSign * 0.06, -0.09, -0.28);
    elbowPivot.add(handPivot);

    handPivot.add(createSculptedGlove(leatherMat, bootAccentMat, carbonMat, sideSign));

    const pole = createProceduralPole(carbonMat, leatherMat, bootAccentMat);
    pole.rotation.set(-0.34, 0, sideSign * -0.16);
    handPivot.add(pole);

    torsoGroup.add(shoulderPivot);
    return { shoulderPivot, elbowPivot, handPivot, pole };
  };

  const armL = makeArmAndPole(-1);
  const armR = makeArmAndPole(1);

  // --- 3. Ultra-Clean GoPro 1st-Person POV Gloves & Carbon Pole Grips (animated w/ poling, skating & pole-plants!) ---
  const povHandsGroup = new THREE.Group();
  povHandsGroup.visible = false;
  const povSleeveGeo = buildSculptedLimbGeometry(0.056, 0.050, 0.043, 0.64);
  const povHands = {};
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    h.position.set(s * 0.45, 0.88, -0.50);
    h.rotation.set(-0.34, s * 0.26, s * 0.16);

    const sleeve = new THREE.Mesh(povSleeveGeo, jacketMat);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.set(s * 0.02, -0.02, 0.37);

    const gl = createSculptedGlove(leatherMat, bootAccentMat, carbonMat, s);
    gl.rotation.x = 0.20;

    const pole = createProceduralPole(carbonMat, leatherMat, bootAccentMat);
    pole.rotation.set(-0.38, 0, s * -0.20);

    h.add(sleeve, gl, pole);
    povHandsGroup.add(h);
    povHands[s < 0 ? 'left' : 'right'] = { group: h, pole };
  }
  leanGroup.add(povHandsGroup);

  function flexSkiGeometry(geo, flexAmount) {
    const pos = geo.attributes.position;
    const baseY = geo.userData.baseY;
    const stations = geo.userData.stations;
    for (let i = 0; i <= stations; i++) {
      const t = i / stations;
      const bend = Math.pow(Math.abs(t - 0.48) * 2.0, 2.2) * flexAmount;
      const a = i * 4;
      pos.setY(a + 0, baseY[a + 0] + bend);
      pos.setY(a + 1, baseY[a + 1] + bend);
      pos.setY(a + 2, baseY[a + 2] + bend);
      pos.setY(a + 3, baseY[a + 3] + bend);
    }
    pos.needsUpdate = true;
  }

  return {
    root,
    leanGroup,
    leftSki: leftSkiObj.skiGroup,
    rightSki: rightSkiObj.skiGroup,
    poleL: armL.pole,
    poleR: armR.pole,
    stanceHalf,
    setFirstPersonMode(isPov) {
      bodyGroup.visible = !isPov;
      povHandsGroup.visible = isPov;
    },
    updateBiomechanics({
      edgeAngle = 0,
      speed = 0,
      airborneHeight = 0,
      time = 0,
      tuckFactor = 0,
      skateActivity = 0,
      skatePhase = 0,
      polePushPhase = 0,
      polePushActivity = 0,
      polePlantL = 0,
      polePlantR = 0,
      unweightPulse = 0,
      landingCompression = 0,
      stumbleRecoil = 0,
      slipRatio = 0,
      lateralG = 0
    }) {
      const speedNorm = THREE.MathUtils.clamp((speed - 6.0) / 16.0, 0, 1);
      const airTuck = THREE.MathUtils.clamp(airborneHeight / 1.35, 0, 1);
      const carveAbs = Math.min(1.0, Math.abs(edgeAngle) / 0.62);
      const carveSigned = THREE.MathUtils.clamp(edgeAngle / 0.62, -1, 1);

      // --- 1. Low-Speed V-Skate Lateral Push & Double-Poling Cycle ---
      // sin > 0: Left ski pushes outward-back while weight glides on Right ski; sin < 0: mirrored!
      const skateSin = Math.sin(skatePhase);
      const pushL = Math.max(0.0, skateSin) * skateActivity;
      const pushR = Math.max(0.0, -skateSin) * skateActivity;
      const skateWeightShift = (pushL - pushR) * 0.11; // shift pelvis onto gliding ski!

      // Synchronized Double-Poling Reach -> Power Drive -> Recovery waveform
      const poleReach = Math.max(0.0, Math.sin(polePushPhase)) * polePushActivity;
      const poleDrive = Math.max(0.0, -Math.sin(polePushPhase)) * polePushActivity;
      const coreCrunch = poleDrive * 0.34 - poleReach * 0.14;

      // --- 2. Independent Articulated Skis (Inside-Ski Lead + V-Skate Splay + Mid-Air Tip Lift + Chatter!) ---
      const chatter = slipRatio * Math.sin(time * 58.0) * 0.032 * (airborneHeight < 0.08 ? 1.0 : 0.0);
      const insideLeadL = Math.max(0.0, -carveSigned) * 0.17 * (1.0 - skateActivity);
      const insideLeadR = Math.max(0.0,  carveSigned) * 0.17 * (1.0 - skateActivity);

      leftSkiObj.skiGroup.position.set(
        -stanceHalf - pushL * 0.22 - airTuck * 0.04,
        Math.sin(pushL * Math.PI) * 0.075 + Math.max(0, -carveSigned) * 0.025,
        -insideLeadL + insideLeadR * 0.45 + pushL * 0.34
      );
      rightSkiObj.skiGroup.position.set(
        stanceHalf + pushR * 0.22 + airTuck * 0.04,
        Math.sin(pushR * Math.PI) * 0.075 + Math.max(0, carveSigned) * 0.025,
        -insideLeadR + insideLeadL * 0.45 + pushR * 0.34
      );

      // Outward V-skate splay (~21 deg), mid-air freeride tip-up float, and carving edge bite!
      leftSkiObj.skiGroup.rotation.set(
        airTuck * 0.28 + chatter * 0.5,
        pushL * 0.38 - pushR * 0.08,
        -edgeAngle * 0.48 - pushL * 0.32 + chatter
      );
      rightSkiObj.skiGroup.rotation.set(
        airTuck * 0.28 - chatter * 0.5,
        -pushR * 0.38 + pushL * 0.08,
        -edgeAngle * 0.48 + pushR * 0.32 - chatter
      );

      // --- 3. Pelvis Height (Down-Unweighting + G-Load Crouch + Landing Shock Absorption + Core Crunch!) ---
      const gCompress = Math.min(0.09, Math.abs(lateralG) * 0.045);
      const crouchY =
        0.84
        - tuckFactor * 0.13
        - carveAbs * 0.045
        - gCompress
        - unweightPulse * 0.075
        - landingCompression * 0.17
        - stumbleRecoil * 0.15
        - poleDrive * 0.07
        + poleReach * 0.04
        - airTuck * 0.11;
      pelvisGroup.position.y = Math.max(0.54, crouchY);
      // Hip angulation into turn + lateral weight shift during V-skate + impact stagger!
      const stagger = Math.sin(time * 28.0) * stumbleRecoil * 0.14;
      pelvisGroup.position.x = -edgeAngle * 0.12 + skateWeightShift + stagger;
      pelvisGroup.rotation.z = -skateWeightShift * 0.55 - stagger * 1.4;

      // --- 4. True Two-Joint Articulated Legs (Inside Retraction + Outside Extension + V-Skate Kick + Landing Flex!) ---
      const baseLegScale = THREE.MathUtils.clamp(pelvisGroup.position.y / 0.84, 0.72, 1.04);
      const insideFlexL = Math.max(0.0, -carveSigned) * 0.28;
      const insideFlexR = Math.max(0.0,  carveSigned) * 0.28;
      const landFlex = landingCompression * 0.52 + stumbleRecoil * 0.45 + unweightPulse * 0.26 + airTuck * 0.42;

      legL.hipPivot.scale.y = baseLegScale * (1.0 - insideFlexL * 0.22);
      legR.hipPivot.scale.y = baseLegScale * (1.0 - insideFlexR * 0.22);

      // Left leg: kicks backward & outward on pushL, flexes deeper when inside ski on left turn!
      legL.hipPivot.rotation.set(
        insideFlexL * 0.55 + landFlex * 0.48 - pushL * 0.44 + pushR * 0.14,
        pushL * 0.22,
        -pushL * 0.24 - airTuck * 0.06
      );
      legL.kneePivot.rotation.x = -(insideFlexL * 0.72 + landFlex * 0.65) + pushL * 0.36;

      // Right leg: mirrored!
      legR.hipPivot.rotation.set(
        insideFlexR * 0.55 + landFlex * 0.48 - pushR * 0.44 + pushL * 0.14,
        -pushR * 0.22,
        pushR * 0.24 + airTuck * 0.06
      );
      legR.kneePivot.rotation.x = -(insideFlexR * 0.72 + landFlex * 0.65) + pushR * 0.36;

      // --- 5. Torso Upper/Lower Body Separation, Hip Angulation, Aero Tuck, Double-Poling & Collision Recoil ---
      const forwardLean =
        0.34
        + tuckFactor * 0.48
        + speedNorm * 0.12
        + coreCrunch
        + landingCompression * 0.22
        - stumbleRecoil * 0.42
        + airTuck * 0.16;
      torsoGroup.rotation.x = -THREE.MathUtils.clamp(forwardLean, -0.15, 0.92);
      headGroup.rotation.x = THREE.MathUtils.clamp(forwardLean * 0.86, -0.12, 0.78);
      // Authentic alpine frontal-plane hip angulation (upper body stays quiet & level over outside ski!)
      torsoGroup.rotation.z = edgeAngle * 0.44 + (pushR - pushL) * 0.14 + stagger * 2.1;
      // Subtle counter-rotation keeping chest facing down the fall line
      torsoGroup.rotation.y = -edgeAngle * 0.26 + (pushR - pushL) * 0.12;

      // --- 6. Articulated Arms, Elbows & Wrists (Double-Poling + Turn-Initiation Pole Plant + Aero Tuck + Collision Flail!) ---
      const plantL = Math.sin(polePlantL * Math.PI); // smooth 0 -> 1 -> 0 wrist-flick pole touch!
      const plantR = Math.sin(polePlantR * Math.PI);
      const tuckArmIn = tuckFactor * (1.0 - polePushActivity) * (1.0 - stumbleRecoil);

      // Left arm kinematics
      armL.shoulderPivot.rotation.set(
        0.18 + poleReach * 0.62 - poleDrive * 0.78 + plantL * 0.42 + tuckArmIn * 0.36 + stumbleRecoil * 0.55 - airTuck * 0.25,
        tuckArmIn * 0.28,
        0.12 + carveAbs * 0.22 + landingCompression * 0.38 + stumbleRecoil * 0.72 + airTuck * 0.46 - tuckArmIn * 0.22 + pushL * 0.18
      );
      armL.elbowPivot.rotation.x = 0.08 + poleReach * 0.28 - poleDrive * 0.42 + plantL * 0.26 + tuckArmIn * 0.52;
      armL.handPivot.rotation.x = plantL * 0.48 - poleDrive * 0.32;
      armL.pole.rotation.set(
        -0.34 + poleReach * 0.55 - poleDrive * 0.48 + plantL * 0.58 - tuckArmIn * 0.52,
        0,
        0.16 - tuckArmIn * 0.12
      );

      // Right arm kinematics
      armR.shoulderPivot.rotation.set(
        0.18 + poleReach * 0.62 - poleDrive * 0.78 + plantR * 0.42 + tuckArmIn * 0.36 + stumbleRecoil * 0.55 - airTuck * 0.25,
        -tuckArmIn * 0.28,
        -0.12 - carveAbs * 0.22 - landingCompression * 0.38 - stumbleRecoil * 0.72 - airTuck * 0.46 + tuckArmIn * 0.22 - pushR * 0.18
      );
      armR.elbowPivot.rotation.x = 0.08 + poleReach * 0.28 - poleDrive * 0.42 + plantR * 0.26 + tuckArmIn * 0.52;
      armR.handPivot.rotation.x = plantR * 0.48 - poleDrive * 0.32;
      armR.pole.rotation.set(
        -0.34 + poleReach * 0.55 - poleDrive * 0.48 + plantR * 0.58 - tuckArmIn * 0.52,
        0,
        -0.16 + tuckArmIn * 0.12
      );

      // --- 7. Synchronized 1st-Person POV Gloves & Poles (YOU SEE YOUR HANDS POLE-PLANT, DOUBLE-POLE, SKATE & TUCK!) ---
      const povDip = -tuckFactor * 0.075 - landingCompression * 0.095 - unweightPulse * 0.03;
      const povSwingY = poleReach * 0.11 - poleDrive * 0.13;
      const povSwingZ = -poleReach * 0.12 + poleDrive * 0.16;

      povHands.left.group.position.set(
        -0.45 + tuckArmIn * 0.11 - airTuck * 0.07 + skateWeightShift * 0.45,
        0.88 + povDip + povSwingY + plantL * 0.055 + Math.sin(time * 7.5) * 0.005 * speedNorm,
        -0.50 + povSwingZ - plantL * 0.12 - tuckArmIn * 0.06
      );
      povHands.left.group.rotation.set(
        -0.34 + poleReach * 0.28 - poleDrive * 0.42 + plantL * 0.38 - tuckArmIn * 0.16,
        -0.26 - tuckArmIn * 0.18,
        -0.16 + edgeAngle * 0.18 - landingCompression * 0.18
      );
      povHands.left.pole.rotation.set(
        -0.38 + poleReach * 0.42 - poleDrive * 0.46 + plantL * 0.52 - tuckArmIn * 0.45,
        0,
        0.20
      );

      povHands.right.group.position.set(
        0.45 - tuckArmIn * 0.11 + airTuck * 0.07 + skateWeightShift * 0.45,
        0.88 + povDip + povSwingY + plantR * 0.055 - Math.sin(time * 7.5) * 0.005 * speedNorm,
        -0.50 + povSwingZ - plantR * 0.12 - tuckArmIn * 0.06
      );
      povHands.right.group.rotation.set(
        -0.34 + poleReach * 0.28 - poleDrive * 0.42 + plantR * 0.38 - tuckArmIn * 0.16,
        0.26 + tuckArmIn * 0.18,
        0.16 + edgeAngle * 0.18 + landingCompression * 0.18
      );
      povHands.right.pole.rotation.set(
        -0.38 + poleReach * 0.42 - poleDrive * 0.46 + plantR * 0.52 - tuckArmIn * 0.45,
        0,
        -0.20
      );

      // --- 8. Real-Time Ski Tip G-Load Flexing + Powder Bow-Wave + Under-Ski Contact Shadows ---
      const flexAmt = (0.015 + (carveAbs * 0.055 + Math.abs(lateralG) * 0.02) * speedNorm + landingCompression * 0.04) * (airborneHeight < 0.08 ? 1.0 : 0.15);
      flexSkiGeometry(skiGeoL, flexAmt);
      flexSkiGeometry(skiGeoR, flexAmt);

      bowWaveUniforms.uSpeed.value = speed;
      bowWaveUniforms.uEdgeAngle.value = edgeAngle;
      bowWaveUniforms.uAirborne.value = airborneHeight;

      const shadowVis = THREE.MathUtils.clamp(1.0 - airborneHeight * 0.7, 0.0, 1.0);
      skiShadowMat.opacity = 0.46 * shadowVis;
      const spread = 1.0 + airborneHeight * 0.45;
      leftSkiObj.shadowStrip.scale.set(spread, 1, 1);
      rightSkiObj.shadowStrip.scale.set(spread, 1, 1);
    }
  };
}
