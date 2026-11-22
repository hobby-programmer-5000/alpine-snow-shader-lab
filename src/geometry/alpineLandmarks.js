// ============================================================================
// Living Alpine Landmarks Pack (100% Zero External 3D Models!)
//   1. Animated Alpine Cable Car / Gondola System:
//      Twin lattice steel pylons, catenary sag steel cables & 2 red/glass gondola
//      cabins gliding back-and-forth high across the alpine sky with interior glow!
//   2. High-Ridge Mountain Observatory / Shelter:
//      Concrete plinth, snow-capped observation station, warm lit windows, steel
//      communications mast & blinking red aviation beacon!
//   3. Alpine Course Safety Trail Stakes (36 red/black striped poles + snow mounds)
// ============================================================================

import * as THREE from 'three';
import { evalAlpineHeight, getCurrentDropCorridorXZ } from '../core/terrainMath.js';

function applyWorldMaskHook(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       gl_FragColor.a = 0.55;`
    );
  };
  material.customProgramCacheKey = () => 'alpine_landmark_world_mask_v1';
  return material;
}

function buildLatticePylon(steelMat, height = 22.0) {
  const g = new THREE.Group();
  const baseHalf = 2.1;
  const topHalf = 0.72;

  // 4 inclined steel corner legs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p0 = new THREE.Vector3(sx * baseHalf, -1.5, sz * baseHalf);
      const p1 = new THREE.Vector3(sx * topHalf, height, sz * topHalf);
      const dir = new THREE.Vector3().subVectors(p1, p0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, dir.length(), 6), steelMat);
      leg.position.copy(p0).addScaledVector(dir, 0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      g.add(leg);
    }
  }

  // Horizontal steel truss rings
  for (let tier = 1; tier <= 5; tier++) {
    const f = tier / 5;
    const hw = THREE.MathUtils.lerp(baseHalf, topHalf, f);
    const y = f * height;
    const ring = new THREE.Mesh(new THREE.BoxGeometry(hw * 2.1, 0.16, hw * 2.1), steelMat);
    ring.position.y = y;
    g.add(ring);
  }

  // Wide cable-car cross-arm + twin sheave pulleys
  const crossArm = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.45, 0.55), steelMat);
  crossArm.position.y = height;
  g.add(crossArm);

  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.12, 8, 16), steelMat);
    wheel.position.set(s * 4.4, height + 0.1, 0);
    g.add(wheel);
  }

  return g;
}

function buildGondolaCabin(redMat, glassMat, steelMat, glowMat) {
  const cabin = new THREE.Group();

  // Bogie carriage + hanger neck
  const bogie = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 1.5), steelMat);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 3.1, 8), steelMat);
  arm.position.y = -1.55;
  cabin.add(bogie, arm);

  // Gondola body (crimson alpine lower hull + panoramic tinted glass + warm interior light + roof)
  const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.05, 3.2), redMat);
  lowerHull.position.y = -4.3;
  const glassMid = new THREE.Mesh(new THREE.BoxGeometry(2.24, 1.25, 3.12), glassMat);
  glassMid.position.y = -3.22;
  const innerLight = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 2.5), glowMat);
  innerLight.position.y = -3.28;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.24, 3.35), steelMat);
  roof.position.y = -2.52;

  cabin.add(lowerHull, glassMid, innerLight, roof);
  return cabin;
}

function buildSummitObservatory(concreteMat, darkMat, snowMat, windowGlowMat, beaconMat) {
  const g = new THREE.Group();

  // Deep concrete anchor plinth (extends -10m down into steep 35° volcanic slopes so it never floats!)
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 7.8, 12.5, 12), concreteMat);
  plinth.position.y = -3.7;
  g.add(plinth);

  // Main cylindrical alpine observation hall
  const hall = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.2, 5.4, 14), concreteMat);
  hall.position.y = 4.8;
  g.add(hall);

  // Panoramic warm-lit alpine shelter windows wrapping the observation deck
  const winBand = new THREE.Mesh(new THREE.CylinderGeometry(4.92, 4.92, 1.55, 14), windowGlowMat);
  winBand.position.y = 5.6;
  g.add(winBand);

  // Sloped snow-laden roof dome + viewing terrace railing
  const roofCap = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.8, 14), snowMat);
  roofCap.position.y = 8.9;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(6.1, 6.1, 0.35, 14), darkMat);
  deck.position.y = 2.6;
  g.add(roofCap, deck);

  // Tall steel alpine weather/radio mast + blinking aviation warning beacon!
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.32, 14.5, 8), darkMat);
  mast.position.y = 16.2;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), beaconMat);
  beacon.position.y = 23.6;
  g.add(mast, beacon);

  return { group: g, beacon };
}

export function createAlpineLandmarks() {
  const group = new THREE.Group();

  const steelMat = applyWorldMaskHook(new THREE.MeshStandardMaterial({ color: 0x2c3645, roughness: 0.42, metalness: 0.72 }));
  const concreteMat = applyWorldMaskHook(new THREE.MeshStandardMaterial({ color: 0x7c8694, roughness: 0.85, metalness: 0.08 }));
  const snowMat = applyWorldMaskHook(new THREE.MeshStandardMaterial({ color: 0xedf4ff, roughness: 0.55, metalness: 0.05 }));
  const redCabinMat = applyWorldMaskHook(new THREE.MeshStandardMaterial({ color: 0xd92929, roughness: 0.30, metalness: 0.25 }));
  const glassMat = applyWorldMaskHook(new THREE.MeshStandardMaterial({
    color: 0x1a3048, roughness: 0.12, metalness: 0.65, transparent: true, opacity: 0.72
  }));
  const glowMat = applyWorldMaskHook(new THREE.MeshBasicMaterial({ color: 0xffcc70 }));
  const beaconMat = applyWorldMaskHook(new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  const cableMat = new THREE.LineBasicMaterial({ color: 0x18202c });

  // 1. Cable Car System (Twin Pylons + 2 Catenary Lines + 2 Moving Gondola Cabins!)
  const pylonA = buildLatticePylon(steelMat, 22.0);
  const pylonB = buildLatticePylon(steelMat, 22.0);
  const cabinA = buildGondolaCabin(redCabinMat, glassMat, steelMat, glowMat);
  const cabinB = buildGondolaCabin(redCabinMat, glassMat, steelMat, glowMat);

  const cableGeoA = new THREE.BufferGeometry();
  const cableGeoB = new THREE.BufferGeometry();
  const cableLineA = new THREE.Line(cableGeoA, cableMat);
  const cableLineB = new THREE.Line(cableGeoB, cableMat);
  cableLineA.frustumCulled = false;
  cableLineB.frustumCulled = false;

  group.add(pylonA, pylonB, cabinA, cabinB, cableLineA, cableLineB);

  // 2. Summit Observatory / Mountain Shelter
  const obs = buildSummitObservatory(concreteMat, steelMat, snowMat, glowMat, beaconMat);
  group.add(obs.group);

  // 3. 36 Course Boundary Trail Stakes (Red/Black striped wooden stakes + drifted snow base)
  const stakeCount = 36;
  const stakeGeo = new THREE.CylinderGeometry(0.055, 0.065, 2.25, 7);
  stakeGeo.translate(0, 1.05, 0);
  const stakeMat = applyWorldMaskHook(new THREE.MeshStandardMaterial({ color: 0xff6b2b, roughness: 0.45 }));
  const stakeMesh = new THREE.InstancedMesh(stakeGeo, stakeMat, stakeCount);
  stakeMesh.frustumCulled = false;

  const moundGeo = new THREE.ConeGeometry(0.45, 0.28, 8);
  moundGeo.translate(0, 0.08, 0);
  const moundMesh = new THREE.InstancedMesh(moundGeo, snowMat, stakeCount);
  moundMesh.frustumCulled = false;
  group.add(stakeMesh, moundMesh);

  // Active catenary cable endpoints for gondola animation
  const catA0 = new THREE.Vector3();
  const catA1 = new THREE.Vector3();
  const catB0 = new THREE.Vector3();
  const catB1 = new THREE.Vector3();
  let cableSag = 16.0;
  let cableYaw = 0.0;

  function evalCatenary(p0, p1, sag, t, out = new THREE.Vector3()) {
    out.lerpVectors(p0, p1, t);
    out.y -= 4.0 * sag * t * (1.0 - t); // Smooth parabolic catenary sag
    return out;
  }

  function buildCableCurvePoints(p0, p1, sag) {
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      pts.push(evalCatenary(p0, p1, sag, i / 32));
    }
    return pts;
  }

  function repopulateAroundCourse(anchorX, anchorZ) {
    // Place Pylon A & Pylon B on opposing high flanks crossing ~205m down the ski run!
    const leftFlank = getCurrentDropCorridorXZ(anchorX, anchorZ, 175, -125);
    const rightFlank = getCurrentDropCorridorXZ(anchorX, anchorZ, 235, 125);
    const midPt = getCurrentDropCorridorXZ(anchorX, anchorZ, 205, 0);
    const yA = evalAlpineHeight(leftFlank.x, leftFlank.z);
    const yB = evalAlpineHeight(rightFlank.x, rightFlank.z);
    const yMid = evalAlpineHeight(midPt.x, midPt.z);

    // Ensure pylons & catenary cable always clear convex mountain ridges by at least 26m!
    const spanDist = Math.hypot(rightFlank.x - leftFlank.x, rightFlank.z - leftFlank.z);
    cableSag = Math.max(9.0, spanDist * 0.042);
    const minTopY = yMid + cableSag + 28.0;
    const hA = Math.max(22.0, minTopY - yA);
    const hB = Math.max(22.0, minTopY - yB);

    pylonA.position.set(leftFlank.x, yA, leftFlank.z);
    pylonB.position.set(rightFlank.x, yB, rightFlank.z);
    pylonA.scale.set(1, hA / 22.0, 1);
    pylonB.scale.set(1, hB / 22.0, 1);

    const spanDir = new THREE.Vector3(rightFlank.x - leftFlank.x, 0, rightFlank.z - leftFlank.z).normalize();
    cableYaw = Math.atan2(spanDir.x, spanDir.z);
    pylonA.rotation.y = cableYaw;
    pylonB.rotation.y = cableYaw;

    const sideOff = new THREE.Vector3(-spanDir.z, 0, spanDir.x).multiplyScalar(4.4);
    const topA = new THREE.Vector3(leftFlank.x, yA + hA, leftFlank.z);
    const topB = new THREE.Vector3(rightFlank.x, yB + hB, rightFlank.z);

    catA0.copy(topA).add(sideOff);
    catA1.copy(topB).add(sideOff);
    catB0.copy(topA).sub(sideOff);
    catB1.copy(topB).sub(sideOff);

    cableGeoA.setFromPoints(buildCableCurvePoints(catA0, catA1, cableSag));
    cableGeoB.setFromPoints(buildCableCurvePoints(catB0, catB1, cableSag));

    // Place Summit Observatory / Mountain Shelter prominently overlooking the run!
    const obsPt = getCurrentDropCorridorXZ(anchorX, anchorZ, 300, -95);
    obs.group.position.set(obsPt.x, evalAlpineHeight(obsPt.x, obsPt.z), obsPt.z);

    // Place 36 Alpine Safety Trail Stakes along both edges of the course corridor
    const dummy = new THREE.Object3D();
    for (let i = 0; i < stakeCount; i++) {
      const along = 18 + Math.floor(i / 2) * 26;
      const side = i % 2 === 0 ? -1 : 1;
      const pt = getCurrentDropCorridorXZ(anchorX, anchorZ, along, side * 12.2);
      const y = evalAlpineHeight(pt.x, pt.z);
      dummy.position.set(pt.x, y, pt.z);
      dummy.rotation.set((i % 3 - 1) * 0.06, i * 0.5, side * -0.05);
      dummy.scale.setScalar(1.0);
      dummy.updateMatrix();
      stakeMesh.setMatrixAt(i, dummy.matrix);
      moundMesh.setMatrixAt(i, dummy.matrix);
    }
    stakeMesh.instanceMatrix.needsUpdate = true;
    moundMesh.instanceMatrix.needsUpdate = true;
  }

  repopulateAroundCourse(0, -18);

  const tmpPos = new THREE.Vector3();

  return {
    group,
    repopulateAroundCourse,
    update(nowSec) {
      // Smooth continuous ping-pong gondola motion overhead + wind pendulum swing!
      const tA = 0.08 + 0.84 * (0.5 + 0.5 * Math.sin(nowSec * 0.14));
      const tB = 1.0 - tA;

      evalCatenary(catA0, catA1, cableSag, tA, tmpPos);
      cabinA.position.copy(tmpPos);
      cabinA.rotation.set(0, cableYaw, Math.sin(nowSec * 1.4) * 0.055);

      evalCatenary(catB0, catB1, cableSag, tB, tmpPos);
      cabinB.position.copy(tmpPos);
      cabinB.rotation.set(0, cableYaw, Math.cos(nowSec * 1.3 + 1.0) * 0.055);

      // Blinking red aviation warning beacon atop summit observatory mast
      const blink = Math.sin(nowSec * 3.8) > 0.25;
      beaconMat.color.setHex(blink ? 0xff3030 : 0x4a0b0b);
    }
  };
}
