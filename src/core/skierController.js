// ============================================================================
// 120 Hz Classical-Mechanics Alpine Ski Physics & Full Biomechanics Controller
// Grounded in real alpine skiing physics & sports biomechanics:
//   - 120 Hz fixed-step integration: slope gravity (g sin θ), snow kinetic friction
//     (μ g cos θ), aero drag (½ ρ CdA v² w/ live tuck CdA reduction)
//   - Parabolic sidecut carving (R = R_sc cos φ) vs static/dynamic edge-grip
//     breakdown (real sideways SLIP drift + edge chatter on Blue Ice & hard turns!)
//   - Low-speed muscular propulsion: V-Skate lateral leg push-offs (16–24° splay,
//     angled V-tracks stamped in FBO!) + synchronized Double-Poling arm/core thrusts
//   - Turn-transition inside-hand wrist-flick Pole Plant + Down-Unweighting pulse
//   - Jump landing knee shock absorption + live Stance & Surface telemetry!
// ============================================================================

import * as THREE from 'three';
import { evalAlpineHeight, evalAlpineNormal, getActiveDem, valleyCenterX } from './terrainMath.js';

const FIXED_DT = 1 / 120;
const GRAVITY = 9.81;
const SKIER_MASS = 78.0;
const AIR_RHO = 1.02;      // Alpine altitude air density (~1800m)
const SIDECUT_R = 16.5;    // Modern freeride/GS parabolic sidecut radius (m)

export class SkierController {
  constructor(rig, trackSystem, spraySystem, audioEngine = null) {
    this.rig = rig;
    this.trackSystem = trackSystem;
    this.spraySystem = spraySystem;
    this.audioEngine = audioEngine;

    this.mode = 'auto'; // 'auto' | 'ski' | 'brush'
    this.pos = new THREE.Vector3(0, 0, 0);
    this.velX = 0.0;
    this.velZ = 0.0;
    this.heading = 0.0;
    this.speed = 3.2;
    this.edgeAngle = 0.0;
    this.vy = 0.0;
    this.airborneHeight = 0.0;
    this.autoTime = 0.0;
    this.demAlong = 34.0;
    this._physAccum = 0.0;

    // Live biomechanical & physical telemetry states
    this.tuckFactor = 0.0;
    this.skateActivity = 0.0;
    this.skatePhase = 0.0;
    this.polePushActivity = 0.0;
    this.polePushPhase = 0.0;
    this.manualPoleTimer = 0.0;
    this.polePlantL = 0.0;
    this.polePlantR = 0.0;
    this.polePlantCooldown = 0.0;
    this.unweightPulse = 0.0;
    this.landingCompression = 0.0;
    this.stumbleRecoil = 0.0;
    this.impactShake = 0.0;
    this.slipRatio = 0.0;
    this.lateralG = 0.0;
    this.slopeDeg = 18.0;
    this.stance = 'SKATE';       // 'SKATE' | 'POLE' | 'GLIDE' | 'CARVE' | 'SLIP' | 'TUCK' | 'AIR' | 'LAND'
    this.surfaceType = 'COLD POWDER';
    this._prevEdgeSign = 0;
    this._prevPoleSinSign = 1;
    this._maxAirInJump = 0.0;
    this._mpcStepCounter = 0;
    this._mpcCache = { targetEdge: 0.0, wantTuck: 0.0, wantBrake: 0.0, urgent: false };

    this.prevLeft = new THREE.Vector2();
    this.prevRight = new THREE.Vector2();
    this.currLeft = new THREE.Vector2();
    this.currRight = new THREE.Vector2();
    this.hasPrevStamp = false;

    this.keys = { w: false, s: false, a: false, d: false, space: false };

    this._tmpNormal = new THREE.Vector3();
    this._tmpFwd = new THREE.Vector3();
    this._tmpRight = new THREE.Vector3();
    this._tmpUp = new THREE.Vector3();
    this._tmpMat = new THREE.Matrix4();
    this._sprayPos = new THREE.Vector3();
    this._sprayVel = new THREE.Vector3();

    this.reset();
  }

  _sampleDemFallLine(alongMeters) {
    const dem = getActiveDem();
    const wps = dem.meta.fallLineWaypoints;
    const stepM = 9.5;
    const maxM = (wps.length - 1) * stepM;
    const clamped = THREE.MathUtils.clamp(alongMeters, 0, maxM - 0.1);
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
    return { x, z, fwdX, fwdZ, rightX: -fwdZ, rightZ: fwdX, maxM };
  }

  reset() {
    this.autoTime = 0.0;
    this.vy = 0.0;
    this.airborneHeight = 0.0;
    this.hasPrevStamp = false;
    this._physAccum = 0.0;

    // Reset biomechanical states — start from authentic start-gate speed (~12 km/h)
    // so the skier bursts out with visible V-skate leg pushes & double-poling strokes!
    this.tuckFactor = 0.0;
    this.skateActivity = 0.9;
    this.skatePhase = 0.4;
    this.polePushActivity = 0.9;
    this.polePushPhase = 0.4;
    this.manualPoleTimer = 0.0;
    this.polePlantL = 0.0;
    this.polePlantR = 0.0;
    this.polePlantCooldown = 0.25;
    this.unweightPulse = 0.0;
    this.landingCompression = 0.0;
    this.stumbleRecoil = 0.0;
    this.impactShake = 0.0;
    this.slipRatio = 0.0;
    this.lateralG = 0.0;
    this.stance = 'SKATE';
    this._prevEdgeSign = 0;
    this._prevPoleSinSign = 1;
    this._maxAirInJump = 0.0;
    this._mpcStepCounter = 0;
    this._mpcCache = { targetEdge: 0.0, wantTuck: 0.0, wantBrake: 0.0, urgent: false };

    const startSpeed = 3.4; // ~12 km/h start gate push-off!

    const dem = getActiveDem();
    if (dem) {
      this.demAlong = 34.0;
      const pt = this._sampleDemFallLine(this.demAlong);
      const startY = evalAlpineHeight(pt.x, pt.z);
      this.pos.set(pt.x, startY, pt.z);
      this.heading = Math.atan2(pt.fwdX, -pt.fwdZ);
      this.speed = startSpeed;
      this.velX = pt.fwdX * startSpeed;
      this.velZ = pt.fwdZ * startSpeed;
      this.edgeAngle = 0.0;

      this.trackSystem.clear(pt.x, pt.z);
      this._prestampDemEntryCarve(this.demAlong);
    } else {
      const startZ = -18.0;
      const startX = valleyCenterX(startZ);
      const startY = evalAlpineHeight(startX, startZ);
      this.pos.set(startX, startY, startZ);
      this.heading = 0.06;
      this.speed = startSpeed;
      this.velX = Math.sin(this.heading) * startSpeed;
      this.velZ = -Math.cos(this.heading) * startSpeed;
      this.edgeAngle = 0.0;

      this.trackSystem.clear(startX, startZ);
      this._prestampProceduralEntryCarve(startZ);
    }

    this._syncRigTransform();
  }

  _prestampEntryIfNeeded() {
    if (this.hasPrevStamp) return;
    if (getActiveDem()) {
      this._prestampDemEntryCarve(this.demAlong);
    } else {
      this._prestampProceduralEntryCarve(this.pos.z);
    }
  }

  _prestampDemEntryCarve(endAlong) {
    const steps = 36;
    const startAlong = Math.max(6.0, endAlong - 16.0);
    let pL = null;
    let pR = null;

    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const along = THREE.MathUtils.lerp(startAlong, endAlong, f);
      const pt = this._sampleDemFallLine(along);
      const phase = (along - endAlong) * 0.16;
      const lat = Math.sin(phase) * 1.4 * (1.0 - f);
      const x = pt.x + pt.rightX * lat;
      const z = pt.z + pt.rightZ * lat;
      const half = this.rig.stanceHalf;
      const cL = new THREE.Vector2(x - pt.rightX * half, z - pt.rightZ * half);
      const cR = new THREE.Vector2(x + pt.rightX * half, z + pt.rightZ * half);

      if (pL && pR) {
        this.trackSystem.stampTwinSkis(pL, cL, pR, cR, {
          radiusMeters: 0.14, depth: 0.80, berm: 0.78, iceGlint: 0.65, edgeBias: Math.cos(phase) * 0.4
        });
      }
      pL = cL;
      pR = cR;
    }
    if (pL && pR) {
      this.prevLeft.copy(pL);
      this.prevRight.copy(pR);
      this.hasPrevStamp = true;
    }
  }

  _prestampProceduralEntryCarve(endZ) {
    const steps = 36;
    const startZ = endZ + 16.0;
    let pL = null;
    let pR = null;

    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const z = THREE.MathUtils.lerp(startZ, endZ, f);
      const x = valleyCenterX(z);
      const nextZ = z - 0.25;
      const nextX = valleyCenterX(nextZ);
      const dx = nextX - x;
      const dz = nextZ - z;
      const len = Math.hypot(dx, dz) || 1;
      const rightX = -dz / len;
      const rightZ = dx / len;
      const half = this.rig.stanceHalf;
      const cL = new THREE.Vector2(x - rightX * half, z - rightZ * half);
      const cR = new THREE.Vector2(x + rightX * half, z + rightZ * half);

      if (pL && pR) {
        this.trackSystem.stampTwinSkis(pL, cL, pR, cR, {
          radiusMeters: 0.14, depth: 0.80, berm: 0.78, iceGlint: 0.65, edgeBias: 0.0
        });
      }
      pL = cL;
      pR = cR;
    }
    if (pL && pR) {
      this.prevLeft.copy(pL);
      this.prevRight.copy(pR);
      this.hasPrevStamp = true;
    }
  }

  /**
   * Manual Double-Pole Push (`E` key): visibly swings both arms & poles forward -> thrusts back
   * and imparts a crisp real muscular acceleration impulse!
   */
  triggerPolePlant() {
    if (this.airborneHeight > 0.12) return;
    this.manualPoleTimer = 0.82;
    this.polePushPhase = 0.25; // start at high forward pole-reach so full swing -> thrust plays cleanly!
    const fwdX = Math.sin(this.heading);
    const fwdZ = -Math.cos(this.heading);
    this.velX += fwdX * 2.2;
    this.velZ += fwdZ * 2.2;
    this.speed = Math.hypot(this.velX, this.velZ);
    this._stampDoublePoleDimples(fwdX, fwdZ);
    this.audioEngine?.playPolePlant();
  }

  _stampDoublePoleDimples(fwdX, fwdZ) {
    const rightX = -fwdZ;
    const rightZ = fwdX;
    for (const side of [-1, 1]) {
      const px = this.pos.x + rightX * side * 0.56 + fwdX * 0.28;
      const pz = this.pos.z + rightZ * side * 0.56 + fwdZ * 0.28;
      this.trackSystem.stampPoleDimple(new THREE.Vector2(px, pz), 0.13);
    }
  }

  _stampSinglePoleDimple(side, fwdX, fwdZ) {
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const px = this.pos.x + rightX * side * 0.60 + fwdX * 0.42;
    const pz = this.pos.z + rightZ * side * 0.60 + fwdZ * 0.42;
    this.trackSystem.stampPoleDimple(new THREE.Vector2(px, pz), 0.12);
  }

  triggerJump() {
    if (this.airborneHeight <= 0.06) {
      this.vy = 5.4;
      this.airborneHeight = 0.08;
      this.unweightPulse = 0.8;
      this.audioEngine?.playJumpPop();
    }
  }

  triggerStumble(strength = 0.85) {
    this.stumbleRecoil = Math.max(this.stumbleRecoil, THREE.MathUtils.clamp(strength, 0.35, 1.0));
    this.impactShake = Math.max(this.impactShake, 0.14 * strength);
    // Burst of impact snow debris around the skier!
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this._sprayPos.set(this.pos.x + Math.cos(ang) * 0.45, this.pos.y + 0.25, this.pos.z + Math.sin(ang) * 0.45);
      this._sprayVel.set(Math.cos(ang) * (2.6 + Math.random() * 2.4), 1.6 + Math.random() * 2.2, Math.sin(ang) * (2.6 + Math.random() * 2.4));
      this.spraySystem.emit(this._sprayPos, this._sprayVel, 0.65 + Math.random() * 0.5, 0.95, 0.0);
    }
  }

  setMode(newMode) {
    this.mode = newMode;
    this.hasPrevStamp = false;
  }

  update(dt, decayStrength = 0.0, course = null, avalanche = null, worldColliderGroups = null) {
    if (this.mode === 'brush') {
      if (decayStrength > 0.0001) {
        this.trackSystem.scrollTo(this.trackSystem.origin.x, this.trackSystem.origin.y, decayStrength);
      }
      this._syncRigTransform();
      return;
    }

    // Celebratory carved hockey-stop glide after crossing the Finish Line!
    if (course && course.status === 'finished') {
      this.autoTime += dt;
      this.velX *= Math.exp(-2.8 * dt);
      this.velZ *= Math.exp(-2.8 * dt);
      this.speed = Math.hypot(this.velX, this.velZ);
      this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, 0.42, Math.min(1, dt * 3.5));
      this.tuckFactor *= Math.exp(-5 * dt);
      this.skateActivity *= Math.exp(-5 * dt);
      this.polePushActivity *= Math.exp(-5 * dt);
      this.stumbleRecoil *= Math.exp(-5 * dt);
      this.impactShake *= Math.exp(-7 * dt);
      this.pos.x += this.velX * dt;
      this.pos.z += this.velZ * dt;
      this.pos.y = evalAlpineHeight(this.pos.x, this.pos.z);
      this.airborneHeight = 0;
      this.stance = this.speed > 1.2 ? 'CARVE' : 'GLIDE';
      this.trackSystem.scrollTo(this.pos.x, this.pos.z, decayStrength);
      this._stampAndSpray(dt);
      this._syncRigTransform();
      return;
    }

    const windForceX = course ? course.windForceX : 0.0;
    const surfaceGrip = course ? course.surfaceGrip : 1.0;
    const onBlueIce = course ? course.onBlueIce : false;

    // 120 Hz fixed-step accumulator for rock-solid framerate-independent ski physics & hard collisions!
    this._physAccum = Math.min(0.065, this._physAccum + dt);
    let steps = 0;
    while (this._physAccum >= FIXED_DT && steps < 8) {
      this._stepPhysics120Hz(FIXED_DT, course, avalanche, windForceX, surfaceGrip, onBlueIce, worldColliderGroups);
      this._physAccum -= FIXED_DT;
      steps++;
    }

    this.trackSystem.scrollTo(this.pos.x, this.pos.z, decayStrength);
    this._stampAndSpray(dt);
    this._syncRigTransform();
  }

  /**
   * Unconditional 120 Hz Hard-Body Solid Collision Solver against ALL Course Boulders,
   * 240 Near Spruce Trunks, 140 Flank Granite Outcrops & 36 Glacial Seracs!
   * Guarantees zero clipping / phasing through ANY obstacle at any speed.
   */
  _resolveSolidCollisions(course, worldColliderGroups) {
    const skierR = 0.54;
    const checkList = (list) => {
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const minDist = c.radius + skierR;
        const dx = this.pos.x - c.x;
        const dz = this.pos.z - c.z;
        const distSq = dx * dx + dz * dz;
        if (distSq >= minDist * minDist) continue;
        // Allow jumping cleanly OVER low boulders if high enough in mid-air
        if (this.airborneHeight > (c.height || 1.75)) continue;

        const dist = Math.sqrt(distSq) || 0.001;
        const nx = dx / dist;
        const nz = dz / dist;

        // 1. UNCONDITIONAL hard positional push-out strictly outside solid geometry!
        this.pos.x = c.x + nx * (minDist + 0.025);
        this.pos.z = c.z + nz * (minDist + 0.025);

        // 2. True inelastic impact reflection + glancing tangential deflection!
        const vIn = -(this.velX * nx + this.velZ * nz);
        if (vIn > 0.0) {
          const tx = -nz;
          const tz = nx;
          const vTan = this.velX * tx + this.velZ * tz;
          const vTotal = Math.max(0.1, Math.hypot(this.velX, this.velZ));
          const directness = vIn / vTotal;

          if (vIn > 3.2) {
            // Heavy solid collision: rebound outward, kill forward speed, trigger stumble recoil & penalty!
            const vOut = Math.min(4.8, vIn * 0.34);
            const tanKeep = THREE.MathUtils.lerp(0.68, 0.28, directness);
            this.velX = nx * vOut + tx * (vTan * tanKeep);
            this.velZ = nz * vOut + tz * (vTan * tanKeep);
            this.speed = Math.hypot(this.velX, this.velZ);

            // Deflect ski heading away from obstacle wall so skier glances around instead of wedging!
            if (this.speed > 0.8) {
              const bounceH = Math.atan2(this.velX, -this.velZ);
              let hDiff = bounceH - this.heading;
              while (hDiff > Math.PI) hDiff -= Math.PI * 2;
              while (hDiff < -Math.PI) hDiff += Math.PI * 2;
              this.heading += THREE.MathUtils.clamp(hDiff, -0.55, 0.55);
            }

            this.triggerStumble(THREE.MathUtils.clamp(vIn / 9.5, 0.48, 1.0));
            course?.registerSolidImpact?.(c, vIn);
          } else {
            // Glancing scrape off obstacle shoulder: slide cleanly along tangent & align skis around flank!
            const vOut = vIn * 0.16;
            const slideSign = vTan >= 0 ? 1 : -1;
            const minSlide = Math.max(Math.abs(vTan) * 0.88, 1.8);
            this.velX = nx * vOut + tx * (slideSign * minSlide);
            this.velZ = nz * vOut + tz * (slideSign * minSlide);
            this.speed = Math.hypot(this.velX, this.velZ);
            const tanH = Math.atan2(tx * slideSign, -(tz * slideSign));
            let hDiff = tanH - this.heading;
            while (hDiff > Math.PI) hDiff -= Math.PI * 2;
            while (hDiff < -Math.PI) hDiff += Math.PI * 2;
            this.heading += THREE.MathUtils.clamp(hDiff, -0.25, 0.25);
          }
        }
      }
    };

    if (course) checkList(course.hazards);
    if (worldColliderGroups) {
      for (let g = 0; g < worldColliderGroups.length; g++) {
        checkList(worldColliderGroups[g]);
      }
    }
  }

  /**
   * World-Cup Real-Time Model Predictive Control (MPC) Forward-Rollout Ski Planner!
   * Simulates 15 curved 2-phase Newtonian carving trajectories (~1.9s / ~36m ahead) against:
   *  - Exact real-world boulders, flank trees, rocks & seracs (0-collision hard barrier!)
   *  - Both upcoming gate wp1 AND next gate wp2 (or dead-center Finish Arch!)
   *  - Live slope gravity, crosswind gusts, Blue-Ice slip patches & Kicker ballistic flight
   * Automatically selects the mathematically optimal carving edge + pre-braking / full-tuck sprint!
   */
  _computeMpcRaceControl(plan, course, avalanche, windForceX, surfaceGrip, onBlueIce, worldColliderGroups) {
    const wp1 = plan.wp1;
    const wp2 = plan.wp2;
    const isFinish = Boolean(wp1.isFinish);
    const avyChase = Boolean(avalanche && avalanche.isRunning && avalanche.inPath && avalanche.gapMeters < 52.0);
    const courseHeading = Math.atan2(plan.corridorFwdX, -plan.corridorFwdZ);

    // 1. Gather only local obstacles & ice patches within 56m (ultra-fast inner rollout loop)
    const localObs = [];
    const maxRangeSq = 56.0 * 56.0;
    const gatherObs = (list) => {
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const dx = c.x - this.pos.x;
        const dz = c.z - this.pos.z;
        if (dx * dx + dz * dz < maxRangeSq) localObs.push(c);
      }
    };
    gatherObs(course.hazards);
    if (worldColliderGroups) {
      for (let g = 0; g < worldColliderGroups.length; g++) gatherObs(worldColliderGroups[g]);
    }

    const localIce = [];
    for (let i = 0; i < course.icePatches.length; i++) {
      const p = course.icePatches[i];
      const dx = p.x - this.pos.x;
      const dz = p.z - this.pos.z;
      if (dx * dx + dz * dz < maxRangeSq) localIce.push(p);
    }

    const localKickers = [];
    for (let i = 0; i < course.kickers.length; i++) {
      const k = course.kickers[i];
      const dx = k.x - this.pos.x;
      const dz = k.z - this.pos.z;
      if (dx * dx + dz * dz < 48.0 * 48.0) localKickers.push(k);
    }

    const localCrevasses = [];
    for (let i = 0; i < course.crevasses.length; i++) {
      const cr = course.crevasses[i];
      if (cr.cleared || cr.hit) continue;
      const dx = cr.x - this.pos.x;
      const dz = cr.z - this.pos.z;
      if (dx * dx + dz * dz < 48.0 * 48.0) localCrevasses.push(cr);
    }

    // Pre-sample terrain downhill gravity & exact curved centerline at 4 stations (+0, +13, +26, +39m) ONCE per MPC tick!
    // (36x faster than calling evalAlpineNormal inside every candidate step, while accurately tracking curved DEM courses!)
    const gSamplesX = [0, 0, 0, 0];
    const gSamplesZ = [0, 0, 0, 0];
    const nySamples = [0.92, 0.92, 0.92, 0.92];
    const cPosX = [0, 0, 0, 0];
    const cPosZ = [0, 0, 0, 0];
    const cRightX = [0, 0, 0, 0];
    const cRightZ = [0, 0, 0, 0];
    const cLen = course.activeStage.lengthMeters;
    for (let k = 0; k < 4; k++) {
      const sp = course.sampleCoursePoint(Math.min(plan.curAlong + k * 13.0, cLen));
      cPosX[k] = sp.x;
      cPosZ[k] = sp.z;
      cRightX[k] = sp.rightX;
      cRightZ[k] = sp.rightZ;
      const sx = k === 0 ? this.pos.x : sp.x;
      const sz = k === 0 ? this.pos.z : sp.z;
      const tn = evalAlpineNormal(sx, sz, 0.8, this._tmpNormal);
      gSamplesX[k] = GRAVITY * tn.x * tn.y;
      gSamplesZ[k] = GRAVITY * tn.z * tn.y;
      nySamples[k] = Math.max(0.25, tn.y);
    }

    // Precompute Finish Arch centerline convergence point along the ACTUAL curved course centerline!
    // (Never extrapolate backward tangent on curved DEMs like Hallasan — follow sampleCoursePoint directly into Arch center!)
    let finAimX = wp1.x;
    let finAimZ = wp1.z;
    if (isFinish) {
      const finAlongToGo = (wp1.x - this.pos.x) * wp1.fwdX + (wp1.z - this.pos.z) * wp1.fwdZ;
      if (finAlongToGo > 24.0) {
        const ptAhead = course.sampleCoursePoint(Math.min(plan.curAlong + 22.0, cLen));
        finAimX = ptAhead.x;
        finAimZ = ptAhead.z;
      } else if (finAlongToGo > 8.0) {
        finAimX = wp1.x;
        finAimZ = wp1.z;
      } else {
        finAimX = wp1.x + wp1.fwdX * 14.0;
        finAimZ = wp1.z + wp1.fwdZ * 14.0;
      }
    }

    // Helper to evaluate a single (edgeCand, brakeCmd, tuckCmd) 2-phase curved rollout (~2.1s / ~40m horizon)
    const STEPS = 24;
    const DT = 0.088;
    const HOLD_STEPS = 5; // ~0.44s initial carving maneuver before closed-loop waypoint tracking
    const skierR = 0.54;

    const evalCandidate = (edgeCand, brakeCmd, tuckCmd) => {
      let px = this.pos.x;
      let pz = this.pos.z;
      let vx = this.velX;
      let vz = this.velZ;
      let h = this.heading;
      let edge = this.edgeAngle;
      let airH = this.airborneHeight;
      let airV = this.verticalVel;

      let prevWp1Rel = (px - wp1.x) * wp1.fwdX + (pz - wp1.z) * wp1.fwdZ;
      let passedWp1 = false;
      let wp1CrossLat = 0.0;
      let prevWp2Rel = wp2 ? (px - wp2.x) * (wp2.fwdX ?? wp1.fwdX) + (pz - wp2.z) * (wp2.fwdZ ?? wp1.fwdZ) : -999;
      let passedWp2 = false;

      let cost = Math.abs(edgeCand - this.edgeAngle) * 4.5 + brakeCmd * 32.0;
      let minObsClearance = 99.0;
      let hadCollision = false;

      for (let s = 0; s < STEPS; s++) {
        const frac = s / STEPS;
        const gIdx = Math.min(2, Math.floor(frac * 3.0));
        const gT = frac * 3.0 - gIdx;
        const gx = gSamplesX[gIdx] + (gSamplesX[gIdx + 1] - gSamplesX[gIdx]) * gT;
        const gz = gSamplesZ[gIdx] + (gSamplesZ[gIdx + 1] - gSamplesZ[gIdx]) * gT;
        const ny = nySamples[gIdx] + (nySamples[gIdx + 1] - nySamples[gIdx]) * gT;

        const fx = Math.sin(h);
        const fz = -Math.cos(h);
        const rx = -fz;
        const rz = fx;

        // Determine desired edge at step s:
        // Phase 1 (s < HOLD_STEPS): hold candidate carving edge (or release early once wp1 is crossed!)
        // Phase 2: closed-loop carve toward active gate (wp1 until crossed, then wp2!) with local obstacle repel
        let stepTargetEdge = edgeCand;
        if (s >= HOLD_STEPS || passedWp1) {
          let tx = isFinish ? finAimX : wp1.x;
          let tz = isFinish ? finAimZ : wp1.z;
          if (passedWp1 && wp2) {
            tx = wp2.x;
            tz = wp2.z;
          } else if (!passedWp1 && !isFinish && wp2) {
            const lat2 = (wp2.x - wp1.x) * wp1.rightX + (wp2.z - wp1.z) * wp1.rightZ;
            const bias = THREE.MathUtils.clamp(lat2 * 0.14, -wp1.halfW * 0.36, wp1.halfW * 0.36);
            tx += wp1.rightX * bias;
            tz += wp1.rightZ * bias;
          }

          let desH = Math.atan2(tx - px, -(tz - pz));
          let relC = desH - courseHeading;
          while (relC > Math.PI) relC -= Math.PI * 2;
          while (relC < -Math.PI) relC += Math.PI * 2;
          desH = courseHeading + THREE.MathUtils.clamp(relC, -0.90, 0.90);

          // Velocity-blended closed-loop heading in Phase 2 (accurately tracks curved/crosswind gates!)
          const vm = Math.hypot(vx, vz);
          let effH = h;
          if (vm > 5.0) {
            let vhd = Math.atan2(vx, -vz) - h;
            while (vhd > Math.PI) vhd -= Math.PI * 2;
            while (vhd < -Math.PI) vhd += Math.PI * 2;
            effH = h + THREE.MathUtils.clamp(vhd, -0.55, 0.55) * 0.45;
          }
          let dh = desH - effH;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;

          // Subtle Phase-2 obstacle repulsion so post-gate boulders (e.g. B10@350m) deflect smoothly in rollout!
          let repel = 0.0;
          for (let oi = 0; oi < localObs.length; oi++) {
            const o = localObs[oi];
            const odx = o.x - px;
            const odz = o.z - pz;
            const al = odx * fx + odz * fz;
            if (al > 0.5 && al < 14.0) {
              const lt = odx * rx + odz * rz;
              const safeR = o.radius + 2.4;
              if (Math.abs(lt) < safeR) {
                const pushSign = lt >= 0 ? -1 : 1;
                repel += pushSign * (1.0 - al / 14.0) * 0.48;
              }
            }
          }
          stepTargetEdge = THREE.MathUtils.clamp(dh * 2.15 + repel, -0.76, 0.76);
        }

        const resp = airH > 0.08 ? 3.5 : 9.2;
        edge += (stepTargetEdge - edge) * Math.min(1.0, DT * resp);

        // Check predicted Blue Ice surface grip
        let stepGrip = 1.0;
        let stepIce = false;
        if (airH <= 0.12) {
          for (let ii = 0; ii < localIce.length; ii++) {
            const p = localIce[ii];
            const idx = px - p.x;
            const idz = pz - p.z;
            if (idx * idx + idz * idz < p.radius * p.radius) {
              stepGrip = 0.34;
              stepIce = true;
              break;
            }
          }
        }

        // Exact Newtonian acceleration (gravity + crosswind + aero drag + snow friction/braking)
        let ax = gx + rx * windForceX * 0.35;
        let az = gz + rz * windForceX * 0.35;
        const vMag = Math.hypot(vx, vz);
        if (vMag > 0.1) {
          const stepTuck = s < HOLD_STEPS ? tuckCmd : (avyChase ? 1.0 : tuckCmd * 0.6);
          const cdA = THREE.MathUtils.lerp(0.88, 0.42, stepTuck);
          const drag = (0.5 * AIR_RHO * cdA * vMag * vMag) / SKIER_MASS;
          const mu = stepIce ? 0.020 : 0.050;
          const fric = airH <= 0.08 ? mu * GRAVITY * ny + brakeCmd * 9.5 * (0.35 + 0.65 * stepGrip) : 0.0;
          const tot = drag + fric;
          ax -= (vx / vMag) * tot;
          az -= (vz / vMag) * tot;
        }
        vx += ax * DT;
        vz += az * DT;

        let vf = vx * fx + vz * fz;
        let vl = vx * rx + vz * rz;

        if (airH <= 0.08) {
          const phi = Math.abs(edge);
          const cosPhi = Math.max(0.45, Math.cos(phi));
          const kappa = (Math.sin(phi) / (SIDECUT_R * cosPhi * cosPhi)) * Math.sign(edge);
          const lowPivot = edge * 0.95 * (1.0 - THREE.MathUtils.clamp(vf / 12.0, 0, 1));
          const omegaId = vf * kappa + lowPivot;
          const aLatReq = Math.abs(vf * omegaId);
          const aLatMax = (0.55 + 2.05 * Math.sin(phi)) * GRAVITY * ny * stepGrip;
          let actualOmega = omegaId;
          let slip = 0.0;
          if (aLatReq > aLatMax && vf > 2.0) {
            actualOmega = omegaId * (0.48 + 0.52 * (aLatMax / aLatReq));
            slip = THREE.MathUtils.clamp((aLatReq - aLatMax) / Math.max(aLatMax, 1.5), 0.15, 1.0);
            vf *= Math.exp(-0.55 * slip * DT);
          }
          h += actualOmega * DT;
          const nfx = Math.sin(h);
          const nfz = -Math.cos(h);
          const nrx = -nfz;
          const nrz = nfx;
          const latDamp = THREE.MathUtils.lerp(13.5, 2.2, slip) * (0.35 + 0.65 * stepGrip);
          vl *= Math.exp(-latDamp * DT);
          vf = Math.min(26.5, Math.max(0.0, vf - phi * 0.55 * stepGrip * DT));
          vx = nfx * vf + nrx * vl;
          vz = nfz * vf + nrz * vl;
        } else {
          h += edge * 0.45 * DT;
          airV -= 14.5 * DT;
          airH = Math.max(0.0, airH + airV * DT);
        }

        px += vx * DT;
        pz += vz * DT;

        // Predict BOTH kicker launches AND crevasse auto-jumps so MPC pre-aims takeoff angle before flight!
        if (airH <= 0.08 && vf > 4.8) {
          let jumped = false;
          for (let ki = 0; ki < localKickers.length; ki++) {
            const k = localKickers[ki];
            const krx = px - k.x;
            const krz = pz - k.z;
            const kal = krx * k.fwdX + krz * k.fwdZ;
            const klat = Math.abs(krx * k.rightX + krz * k.rightZ);
            if (kal > 1.0 && kal < 3.4 && klat < k.width * 0.44) {
              airV = Math.min(9.5, 4.6 + vf * 0.24);
              airH = 0.28;
              jumped = true;
              break;
            }
          }
          if (!jumped && localCrevasses.length > 0) {
            const leadMax = THREE.MathUtils.clamp(vf * 0.36, 2.2, 7.6);
            const leadMin = Math.max(1.0, leadMax - 2.6);
            for (let ci = 0; ci < localCrevasses.length; ci++) {
              const cr = localCrevasses[ci];
              const crx = cr.x - px;
              const crz = cr.z - pz;
              const cal = crx * fx + crz * fz;
              const clat = Math.abs(crx * rx + crz * rz);
              if (cal > leadMin && cal < leadMax && clat < cr.halfW + 1.1) {
                airV = 5.45;
                airH = 0.14;
                break;
              }
            }
          }
        }

        // ---- COST 1: Hard Obstacle Collision + Smooth Safety Clearance Barrier (fast squared-dist reject!) ----
        const timeWeight = 1.0 - 0.30 * frac;
        for (let oi = 0; oi < localObs.length; oi++) {
          const o = localObs[oi];
          if (airH > (o.height || 1.75)) continue;
          const odx = px - o.x;
          const odz = pz - o.z;
          const warnR = o.radius + skierR + 2.20;
          const dSq = odx * odx + odz * odz;
          if (dSq >= warnR * warnR) continue;
          const clear = Math.sqrt(dSq) - (o.radius + skierR);
          if (clear < minObsClearance) minObsClearance = clear;
          if (clear < 0.28) {
            hadCollision = true;
            cost += (16000.0 + (0.28 - clear) * 6500.0) * timeWeight;
          } else {
            const pen = (2.20 - clear) / 1.92;
            cost += pen * pen * 640.0 * timeWeight;
          }
        }

        // ---- COST 2: Exact Gate wp1 Crossing Evaluation ----
        const wp1Rel = (px - wp1.x) * wp1.fwdX + (pz - wp1.z) * wp1.fwdZ;
        if (!passedWp1 && prevWp1Rel < 0.0 && wp1Rel >= 0.0) {
          passedWp1 = true;
          const tCross = -prevWp1Rel / Math.max(0.001, wp1Rel - prevWp1Rel);
          const cx = px - vx * DT * (1.0 - tCross);
          const cz = pz - vz * DT * (1.0 - tCross);
          const latCross = (cx - wp1.x) * wp1.rightX + (cz - wp1.z) * wp1.rightZ;
          wp1CrossLat = latCross;

          if (isFinish) {
            cost -= 820.0;
            cost += Math.abs(latCross) * 165.0 + latCross * latCross * 24.0;
          } else {
            const safeW = wp1.halfW * 0.82;
            const hardW = wp1.halfW + 0.30;
            const absLat = Math.abs(latCross);
            if (absLat <= safeW) {
              cost -= 750.0;
              if (wp2) {
                const wantSign = Math.sign((wp2.x - wp1.x) * wp1.rightX + (wp2.z - wp1.z) * wp1.rightZ);
                cost -= THREE.MathUtils.clamp(latCross * wantSign, -safeW, safeW) * 26.0;
              }
            } else if (absLat <= hardW) {
              cost -= 180.0;
              cost += (absLat - safeW) * 380.0;
            } else {
              cost += 7500.0 + (absLat - hardW) * 1100.0;
            }
          }
        }
        prevWp1Rel = wp1Rel;

        // ---- COST 3: Lookahead Gate wp2 Crossing Evaluation (2-Gate Chaining!) ----
        if (wp2) {
          const w2fx = wp2.fwdX ?? wp1.fwdX;
          const w2fz = wp2.fwdZ ?? wp1.fwdZ;
          const w2rx = wp2.rightX ?? -w2fz;
          const w2rz = wp2.rightZ ?? w2fx;
          const wp2Rel = (px - wp2.x) * w2fx + (pz - wp2.z) * w2fz;
          if (!passedWp2 && prevWp2Rel < 0.0 && wp2Rel >= 0.0) {
            passedWp2 = true;
            const lat2 = Math.abs((px - wp2.x) * w2rx + (pz - wp2.z) * w2rz);
            const hw2 = wp2.halfW ?? 4.2;
            if (lat2 <= hw2 * 0.88) {
              cost -= 480.0;
            } else {
              cost += 2200.0 + (lat2 - hw2 * 0.88) * 420.0;
            }
          }
          prevWp2Rel = wp2Rel;
        }

        // ---- COST 4: True Curved-Centerline Corridor Guardrail & Downhill Tuck-Line Efficiency ----
        const cxRef = cPosX[gIdx] + (cPosX[gIdx + 1] - cPosX[gIdx]) * gT;
        const czRef = cPosZ[gIdx] + (cPosZ[gIdx + 1] - cPosZ[gIdx]) * gT;
        const crxRef = cRightX[gIdx] + (cRightX[gIdx + 1] - cRightX[gIdx]) * gT;
        const crzRef = cRightZ[gIdx] + (cRightZ[gIdx + 1] - cRightZ[gIdx]) * gT;
        const corLat = Math.abs((px - cxRef) * crxRef + (pz - czRef) * crzRef);
        if (corLat > 10.2) {
          const ex = corLat - 10.2;
          cost += ex * ex * 34.0;
        }
        const cosDown = Math.sin(h) * plan.corridorFwdX + (-Math.cos(h)) * plan.corridorFwdZ;
        if (cosDown < 0.62) {
          cost += (0.62 - cosDown) * 950.0;
        }
        // During Avalanche Escape, favor straighter low-edge downhill tuck lines to maximize glide speed!
        if (avyChase) cost += Math.abs(edge) * 14.0;
        if (stepIce) cost += 5.0;
      }

      // ---- TERMINAL GUIDANCE + ANTI-PROCRASTINATION GATE EXTRAPOLATION ----
      if (!passedWp1) {
        if (isFinish) {
          const latFin = Math.abs((px - wp1.x) * wp1.rightX + (pz - wp1.z) * wp1.rightZ);
          cost += Math.hypot(px - finAimX, pz - finAimZ) * 14.0 + latFin * 54.0;
        } else {
          // Extrapolate terminal velocity ray to wp1 plane so MPC can NEVER procrastinate a gate miss!
          const remAlong = (wp1.x - px) * wp1.fwdX + (wp1.z - pz) * wp1.fwdZ;
          const vAlong = Math.max(3.5, vx * wp1.fwdX + vz * wp1.fwdZ);
          const vRight = vx * wp1.rightX + vz * wp1.rightZ;
          const tRem = THREE.MathUtils.clamp(remAlong / vAlong, 0.0, 2.0);
          const projLat = Math.abs(((px - wp1.x) * wp1.rightX + (pz - wp1.z) * wp1.rightZ) + vRight * tRem);
          const endDist = Math.hypot(px - wp1.x, pz - wp1.z);
          cost += endDist * 18.0 + projLat * 48.0;
          if (projLat > wp1.halfW * 0.92) {
            cost += 3800.0 + (projLat - wp1.halfW * 0.92) * 520.0;
          }
        }
      } else if (wp2 && !passedWp2) {
        const w2rx = wp2.rightX ?? -(wp2.fwdZ ?? wp1.fwdZ);
        const w2rz = wp2.rightZ ?? (wp2.fwdX ?? wp1.fwdX);
        const endLat2 = Math.abs((px - wp2.x) * w2rx + (pz - wp2.z) * w2rz);
        const endDist2 = Math.hypot(px - wp2.x, pz - wp2.z);
        cost += endDist2 * 13.0 + endLat2 * 34.0;
      }

      // Bonus for maintaining race speed (stronger during Avalanche Escape so AI outruns the 71 km/h slab!)
      const endSpd = Math.hypot(vx, vz);
      cost -= endSpd * (avyChase ? 36.0 : 5.5);

      return { cost, edgeCand, brakeCmd, tuckCmd, minObsClearance, hadCollision, passedWp1, wp1CrossLat };
    };

    // 2. Sweep 13 steering candidates at target cruise/sprint speed!
    const EDGE_CANDS = [-0.76, -0.62, -0.48, -0.35, -0.22, -0.11, 0.0, 0.11, 0.22, 0.35, 0.48, 0.62, 0.76];
    let best = null;
    for (let i = 0; i < EDGE_CANDS.length; i++) {
      const e = EDGE_CANDS[i];
      // During Avalanche Chase, hold full downhill egg tuck through sweeping GS carves!
      const tCmd = avyChase
        ? (Math.abs(e) < 0.56 ? 1.0 : 0.72)
        : (Math.abs(e) < 0.24 ? 0.78 : 0.0);
      const res = evalCandidate(e, 0.0, tCmd);
      if (!best || res.cost < best.cost) best = res;
    }

    // 3. If the best unbraked line has tight clearance, collision risk, or high gate error,
    //    also evaluate active pre-braking candidates so the AI slows cleanly into tight chicanes!
    const curSpeed = Math.hypot(this.velX, this.velZ);
    const needBrakeCheck = avyChase
      ? (best.hadCollision || best.minObsClearance < 1.10)
      : (best.hadCollision || best.minObsClearance < 1.50 || best.cost > 220.0);
    if (curSpeed > 12.5 && needBrakeCheck) {
      const BRAKE_CANDS = [-0.76, -0.52, -0.28, 0.0, 0.28, 0.52, 0.76];
      for (let i = 0; i < BRAKE_CANDS.length; i++) {
        const res = evalCandidate(BRAKE_CANDS[i], avyChase ? 0.42 : 0.60, 0.0);
        if (res.cost < best.cost) best = res;
      }
    }

    // 4. Final speed ceiling: cruise briskly (~69–74 km/h), FULL AERO TUCK (~85+ km/h) during Avalanche Chase!
    let wantBrake = best.brakeCmd;
    let wantTuck = best.tuckCmd;
    const maxSafe = avyChase ? 25.4 : isFinish ? 21.0 : 19.2;
    if (curSpeed > maxSafe + 0.8 && wantBrake < 0.25) {
      wantBrake = THREE.MathUtils.clamp((curSpeed - maxSafe) * 0.22, 0.18, 0.62);
      wantTuck = 0.0;
    }
    if (onBlueIce && curSpeed > (avyChase ? 19.2 : 14.5) && Math.abs(best.edgeCand) > 0.26) {
      wantBrake = Math.max(wantBrake, 0.34);
      wantTuck = 0.0;
    }
    if (!avyChase && best.minObsClearance < 1.4) wantTuck = 0.0;

    return {
      targetEdge: best.edgeCand,
      wantTuck,
      wantBrake,
      urgent: best.hadCollision || best.minObsClearance < 1.6
    };
  }

  /**
   * Sandbox-mode obstacle avoidance & universal speed-adaptive Crevasse Auto-Jump!
   */
  _checkCrevasseAutoJump(course, fwdX, fwdZ, rightX, rightZ) {
    if (course && this.airborneHeight <= 0.08 && this.speed > 4.8) {
      const leadMax = THREE.MathUtils.clamp(this.speed * 0.36, 2.2, 7.6);
      const leadMin = Math.max(1.0, leadMax - 2.6);
      for (const cr of course.crevasses) {
        if (cr.cleared || cr.hit) continue;
        const rx = cr.x - this.pos.x;
        const rz = cr.z - this.pos.z;
        const along = rx * fwdX + rz * fwdZ;
        const lat = Math.abs(rx * rightX + rz * rightZ);
        if (along > leadMin && along < leadMax && lat < cr.halfW + 1.1) {
          this.triggerJump();
          break;
        }
      }
    }
  }

  /**
   * World-Cup Pro AI Corridor-Safe Obstacle Avoidance (used for Free Sandbox mode!)
   */
  _computeSmartAiTarget(baseAimX, baseAimZ, plan, fwdX, fwdZ, rightX, rightZ, course, worldColliderGroups) {
    let aimX = baseAimX;
    let aimZ = baseAimZ;
    const isFinishFinal = plan?.wp1?.isFinish && Math.hypot(baseAimX - this.pos.x, baseAimZ - this.pos.z) < 28.0;

    // 1. Obstacle-Aware Gate Entry Shift:
    //    If a boulder sits just before or just behind an upcoming gate (e.g. B10 right behind Stage 3 Gate 8!),
    //    pre-shift the gate entry point to the safe inner side of the gate so we exit cleanly clear of it!
    if (plan?.wp1 && !plan.wp1.isFinish && course) {
      const wp1 = plan.wp1;
      const distWp1 = Math.hypot(wp1.x - this.pos.x, wp1.z - this.pos.z);
      if (distWp1 < 44.0) {
        let gateShift = 0.0;
        for (let i = 0; i < course.hazards.length; i++) {
          const h = course.hazards[i];
          const hx = h.x - wp1.x;
          const hz = h.z - wp1.z;
          const hAlong = hx * wp1.fwdX + hz * wp1.fwdZ;
          // Threat sitting within [-12m before, +18m behind] the gate threshold
          if (hAlong < -12.0 || hAlong > 18.0) continue;
          const hLat = hx * wp1.rightX + hz * wp1.rightZ;
          const safeSpan = h.radius + 2.85;
          const curAimLat = (aimX - wp1.x) * wp1.rightX + (aimZ - wp1.z) * wp1.rightZ;
          if (Math.abs(curAimLat - hLat) < safeSpan) {
            // Push gate aim away from the boulder while staying comfortably inside the gate width!
            const awaySign = hLat >= 0 ? -1 : 1;
            const desiredLat = hLat + awaySign * safeSpan;
            const maxSafeGateLat = wp1.halfW * 0.76;
            const clampedLat = THREE.MathUtils.clamp(desiredLat, -maxSafeGateLat, maxSafeGateLat);
            gateShift = clampedLat - curAimLat;
          }
        }
        if (Math.abs(gateShift) > 0.05) {
          aimX += wp1.rightX * gateShift;
          aimZ += wp1.rightZ * gateShift;
        }
      }
    }

    // Direction toward (possibly pre-shifted) aim point
    const toAimDx = aimX - this.pos.x;
    const toAimDz = aimZ - this.pos.z;
    const toAimDist = Math.hypot(toAimDx, toAimDz) || 1.0;
    const dirX = toAimDx / toAimDist;
    const dirZ = toAimDz / toAimDist;
    const dirRightX = -dirZ;
    const dirRightZ = dirX;

    // Actual travel velocity unit vector (prevents blind-spot collisions when carving across a chord!)
    const vMag = Math.hypot(this.velX, this.velZ);
    const vDirX = vMag > 2.5 ? this.velX / vMag : dirX;
    const vDirZ = vMag > 2.5 ? this.velZ / vMag : dirZ;
    const vRightX = -vDirZ;
    const vRightZ = vDirX;

    // Full speed-scaled lookahead — NEVER truncated behind a nearby gate!
    const maxLook = THREE.MathUtils.clamp(this.speed * 1.85, 24.0, 36.0);

    // Find the most urgent threatening obstacle along EITHER aim ray OR velocity ray
    let bestThreat = null;
    let bestScore = Infinity;
    let urgentThreat = false;

    const scanList = (list) => {
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const rx = c.x - this.pos.x;
        const rz = c.z - this.pos.z;

        // Ignore far out-of-corridor trees/seracs when comfortably inside the ski lane
        if (plan) {
          const cCorridorLat = Math.abs((c.x - plan.corridorX) * plan.corridorRightX + (c.z - plan.corridorZ) * plan.corridorRightZ);
          if (cCorridorLat > 16.5 && Math.abs(plan.corridorLat) < 10.5) continue;
        }

        // Ray 1: Aim-chord projection
        const alongAim = rx * dirX + rz * dirZ;
        const latAim = rx * dirRightX + rz * dirRightZ;
        // Ray 2: Current velocity-vector projection
        const alongVel = rx * vDirX + rz * vDirZ;
        const latVel = rx * vRightX + rz * vRightZ;

        const basePad = isFinishFinal ? 1.45 : 2.35;
        const marginAim = c.radius + basePad;
        const marginVel = c.radius + (isFinishFinal ? 1.35 : 2.10);

        const hitAim = alongAim > -0.6 && alongAim < maxLook && Math.abs(latAim) < marginAim;
        const hitVel = alongVel > -0.8 && alongVel < Math.min(maxLook, 26.0) && Math.abs(latVel) < marginVel;

        if (hitAim || hitVel) {
          const dist = Math.hypot(rx, rz);
          // Prioritize obstacles strictly closest to immediate collision
          const score = Math.max(0.1, dist - c.radius);
          if (score < bestScore) {
            bestScore = score;
            bestThreat = c;
            urgentThreat = score < 13.0;
          }
        }
      }
    };

    if (course) scanList(course.hazards);
    if (worldColliderGroups) {
      for (let g = 0; g < worldColliderGroups.length; g++) scanList(worldColliderGroups[g]);
    }

    if (bestThreat) {
      const bypassDist = bestThreat.radius + (isFinishFinal ? 2.45 : 3.25);
      // Use course downhill right vector when available so left/right bypasses stay cleanly inside the valley!
      const refFwdX = plan ? plan.corridorFwdX : dirX;
      const refFwdZ = plan ? plan.corridorFwdZ : dirZ;
      const refRightX = -refFwdZ;
      const refRightZ = refFwdX;

      let bestCandX = aimX;
      let bestCandZ = aimZ;
      let bestCandCost = Infinity;

      for (const side of [-1, 1]) {
        // Place bypass waypoint slightly forward of obstacle center so carving curve arcs smoothly around!
        const cx = bestThreat.x + refRightX * (side * bypassDist) + refFwdX * 1.4;
        const cz = bestThreat.z + refRightZ * (side * bypassDist) + refFwdZ * 1.4;

        // Cost 1: Strong in-corridor preference (NEVER dodge outward into forest trees or canyon sidewalls!)
        let corridorCost = 0.0;
        if (plan) {
          const latFromCenter = Math.abs((cx - plan.corridorX) * plan.corridorRightX + (cz - plan.corridorZ) * plan.corridorRightZ);
          corridorCost = latFromCenter * 1.35 + Math.max(0, latFromCenter - 9.2) * 6.5;
        }
        // Cost 2: Alignment toward next gate & lookahead gate wp2
        let gateCost = Math.hypot(cx - aimX, cz - aimZ) * 0.58;
        if (plan?.wp2) {
          gateCost += Math.hypot(cx - plan.wp2.x, cz - plan.wp2.z) * 0.14;
        }
        // Cost 3: Momentum smoothness (avoid crossing directly in front of a close boulder!)
        const curLat = (this.pos.x - bestThreat.x) * refRightX + (this.pos.z - bestThreat.z) * refRightZ;
        const distToThreat = Math.hypot(bestThreat.x - this.pos.x, bestThreat.z - this.pos.z);
        const crossPenalty = distToThreat < 11.0 ? 8.5 : 2.6;
        const crossCost = (side * curLat < -0.4) ? crossPenalty : 0.0;

        // Cost 4: Secondary clearance against BOTH course hazards AND flank trees/rocks/seracs!
        let secondaryCost = 0.0;
        const checkSecondary = (list) => {
          if (!list) return;
          for (let i = 0; i < list.length; i++) {
            const h = list[i];
            if (h === bestThreat) continue;
            const d2 = Math.hypot(cx - h.x, cz - h.z);
            if (d2 < h.radius + 3.0) secondaryCost += 28.0;
          }
        };
        if (course) checkSecondary(course.hazards);
        if (worldColliderGroups) {
          for (let g = 0; g < worldColliderGroups.length; g++) checkSecondary(worldColliderGroups[g]);
        }

        const totalCost = corridorCost + gateCost + crossCost + secondaryCost;
        if (totalCost < bestCandCost) {
          bestCandCost = totalCost;
          bestCandX = cx;
          bestCandZ = cz;
        }
      }
      aimX = bestCandX;
      aimZ = bestCandZ;
    }

    // Proactively pop a speed-adaptive jump right before an un-cleared Glacial Crevasse fissure!
    if (course && this.airborneHeight <= 0.08 && this.speed > 5.0) {
      const leadMax = THREE.MathUtils.clamp(this.speed * 0.36, 2.2, 7.6);
      const leadMin = Math.max(1.0, leadMax - 2.6);
      for (const cr of course.crevasses) {
        if (cr.cleared || cr.hit) continue;
        const rx = cr.x - this.pos.x;
        const rz = cr.z - this.pos.z;
        const along = rx * fwdX + rz * fwdZ;
        const lat = Math.abs(rx * rightX + rz * rightZ);
        if (along > leadMin && along < leadMax && lat < cr.halfW + 1.1) {
          this.triggerJump();
          break;
        }
      }
    }

    return { aimX, aimZ, avoiding: Boolean(bestThreat), urgentThreat };
  }

  /**
   * Single 120 Hz Newtonian Alpine Ski Physics + Human Biomechanical Propulsion Step!
   */
  _stepPhysics120Hz(dt, course, avalanche, windForceX, surfaceGrip, onBlueIce, worldColliderGroups) {
    this.autoTime += dt;

    // 1. Decay transient biomechanical animation pulses
    this.polePlantL = Math.max(0, this.polePlantL - dt * 2.45);
    this.polePlantR = Math.max(0, this.polePlantR - dt * 2.45);
    this.polePlantCooldown = Math.max(0, this.polePlantCooldown - dt);
    this.unweightPulse = Math.max(0, this.unweightPulse - dt * 2.8);
    this.landingCompression *= Math.exp(-5.4 * dt);
    this.stumbleRecoil *= Math.exp(-3.8 * dt);
    this.impactShake *= Math.exp(-8.5 * dt);
    this.manualPoleTimer = Math.max(0, this.manualPoleTimer - dt);

    // 2. Determine Skier Control Intent (AI Racer vs Interactive WASD)
    let targetEdge = 0.0;
    let wantTuck = 0.0;
    let wantBrake = 0.0;
    let wantSkatePush = false;

    const fwdX = Math.sin(this.heading);
    const fwdZ = -Math.cos(this.heading);
    const rightX = -fwdZ;
    const rightZ = fwdX;

    // Keep velocity synchronized if an external collision modified `this.speed`
    const curVelMag = Math.hypot(this.velX, this.velZ);
    if (Math.abs(curVelMag - this.speed) > 1.2 && curVelMag > 0.1) {
      const ratio = this.speed / curVelMag;
      this.velX *= ratio;
      this.velZ *= ratio;
    }

    let vFwd = this.velX * fwdX + this.velZ * fwdZ;
    let vLat = this.velX * rightX + this.velZ * rightZ;

    if (this.mode === 'auto') {
      const plan = course ? course.getAiNavigationPlan(this.pos) : null;

      if (plan && plan.wp1) {
        // ---- WORLD-CUP MPC FORWARD-ROLLOUT RACE PLANNER (20 Hz update, 120 Hz physics!) ----
        this._checkCrevasseAutoJump(course, fwdX, fwdZ, rightX, rightZ);
        if (this._mpcStepCounter % 6 === 0) {
          this._mpcCache = this._computeMpcRaceControl(
            plan, course, avalanche, windForceX, surfaceGrip, onBlueIce, worldColliderGroups
          );
        }
        this._mpcStepCounter++;

        targetEdge = this._mpcCache.targetEdge;
        wantTuck = this._mpcCache.wantTuck;
        wantBrake = this._mpcCache.wantBrake;
        // V-skate & double-pole strictly at low speed (< 10.2 m/s = 37 km/h) so it NEVER cancels Aero Tuck!
        wantSkatePush = vFwd < 10.2;
      } else {
        // ---- FREE SANDBOX MODE (DEM Fall-Line or Procedural S-Carve Slalom) ----
        let baseAimX, baseAimZ;
        let courseFwdX = fwdX;
        let courseFwdZ = fwdZ;

        if (getActiveDem()) {
          this.demAlong += Math.max(4.0, vFwd) * dt;
          const pt = this._sampleDemFallLine(this.demAlong + 14.0);
          if (this.demAlong > pt.maxM - 35.0) {
            this.reset();
            return;
          }
          courseFwdX = pt.fwdX;
          courseFwdZ = pt.fwdZ;
          const latWave = Math.sin((this.demAlong - 34.0) * 0.12) * 5.2;
          baseAimX = pt.x + pt.rightX * latWave;
          baseAimZ = pt.z + pt.rightZ * latWave;
        } else {
          if (this.pos.z < -580) {
            this.reset();
            return;
          }
          const lookZ = this.pos.z - 16.0;
          const nextZ = lookZ - 4.0;
          const cdx = valleyCenterX(nextZ) - valleyCenterX(lookZ);
          const clen = Math.hypot(cdx, -4.0) || 1;
          courseFwdX = cdx / clen;
          courseFwdZ = -4.0 / clen;
          baseAimX = valleyCenterX(lookZ) + Math.sin((lookZ + 18.0) * 0.13) * 6.0;
          baseAimZ = lookZ;
        }

        const nav = this._computeSmartAiTarget(baseAimX, baseAimZ, null, fwdX, fwdZ, rightX, rightZ, course, worldColliderGroups);
        const dx = nav.aimX - this.pos.x;
        const dz = nav.aimZ - this.pos.z;
        let desiredHeading = Math.atan2(dx, -dz);
        const courseHeading = Math.atan2(courseFwdX, -courseFwdZ);
        let relToCourse = desiredHeading - courseHeading;
        while (relToCourse > Math.PI) relToCourse -= Math.PI * 2;
        while (relToCourse < -Math.PI) relToCourse += Math.PI * 2;
        desiredHeading = courseHeading + THREE.MathUtils.clamp(relToCourse, -0.90, 0.90);

        let diff = desiredHeading - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        targetEdge = THREE.MathUtils.clamp(diff * 1.95 - vLat * 0.075, -0.74, 0.74);
        wantTuck = vFwd < 17.0 && Math.abs(diff) < 0.22 && !nav.avoiding ? 0.75 : 0.0;
        if (vFwd > 19.5) wantBrake = THREE.MathUtils.clamp((vFwd - 19.5) * 0.22, 0.15, 0.60);
        wantSkatePush = vFwd < 10.2;
      }
    } else {
      // Interactive Player Controls (WASD + Space Jump + E Pole)
      const steer = (this.keys.a ? -1 : 0) + (this.keys.d ? 1 : 0);
      targetEdge = steer * 0.72;
      wantTuck = this.keys.w ? 1.0 : 0.0;
      wantBrake = this.keys.s ? 1.0 : 0.0;
      // Low-speed skating/poling triggers when accelerating from low speed (W) or slowing below 7.5 m/s!
      wantSkatePush = (this.keys.w && vFwd < 10.2) || (!this.keys.s && vFwd < 6.5);
    }

    // Smooth anatomical edge transition speed
    const edgeResp = this.airborneHeight > 0.08 ? 3.5 : 9.2;
    this.edgeAngle = THREE.MathUtils.lerp(this.edgeAngle, targetEdge, Math.min(1, dt * edgeResp));

    // 3. Detect Turn Transition (Left <-> Right Edge Changeover) -> Inside Pole-Plant + Down-Unweighting!
    const curEdgeSign = Math.abs(this.edgeAngle) > 0.16 ? Math.sign(this.edgeAngle) : 0;
    if (
      curEdgeSign !== 0 &&
      this._prevEdgeSign !== 0 &&
      curEdgeSign !== this._prevEdgeSign &&
      this.airborneHeight <= 0.08 &&
      vFwd > 7.5 &&
      this.polePlantCooldown <= 0
    ) {
      if (curEdgeSign < 0) {
        this.polePlantL = 1.0;
        this._stampSinglePoleDimple(-1, fwdX, fwdZ);
      } else {
        this.polePlantR = 1.0;
        this._stampSinglePoleDimple(1, fwdX, fwdZ);
      }
      this.unweightPulse = 1.0;
      this.polePlantCooldown = 0.55;
      this.audioEngine?.playPolePlant();
    }
    if (curEdgeSign !== 0) this._prevEdgeSign = curEdgeSign;

    // 4. Sample Real Terrain Slope Normal & Surface Properties
    const n = evalAlpineNormal(this.pos.x, this.pos.z, 0.5, this._tmpNormal);
    this.slopeDeg = Math.acos(THREE.MathUtils.clamp(n.y, 0.0, 1.0)) * 57.2958;
    const grounded = this.airborneHeight <= 0.08;

    this.surfaceType = onBlueIce ? 'BLUE ICE' : this.slopeDeg > 23.0 ? 'WIND PACK' : 'COLD POWDER';
    const muSnow = onBlueIce ? 0.020 : this.slopeDeg > 23.0 ? 0.044 : 0.058;

    // 5. Low-Speed V-Skate Leg Strides + Double-Poling Muscular Propulsion!
    const targetSkate = grounded && wantSkatePush && Math.abs(this.edgeAngle) < 0.42
      ? THREE.MathUtils.clamp((10.5 - vFwd) / 5.2, 0.25, 1.0)
      : 0.0;
    const targetPoleAct = grounded && (targetSkate > 0.08 || this.manualPoleTimer > 0)
      ? Math.max(targetSkate, this.manualPoleTimer > 0 ? 1.0 : 0.0)
      : 0.0;

    this.skateActivity = THREE.MathUtils.lerp(this.skateActivity, targetSkate, Math.min(1, dt * 6.5));
    this.polePushActivity = THREE.MathUtils.lerp(this.polePushActivity, targetPoleAct, Math.min(1, dt * 7.5));
    this.tuckFactor = THREE.MathUtils.lerp(
      this.tuckFactor,
      grounded && this.skateActivity < 0.25 ? wantTuck : 0.0,
      Math.min(1, dt * 5.0)
    );

    let propulsiveAccel = 0.0;
    let skateLateralSway = 0.0;
    if (this.skateActivity > 0.04 || this.polePushActivity > 0.04) {
      const cadence = 4.6 + this.skateActivity * 1.6; // ~1.0 Hz realistic skate/double-pole rhythm!
      this.skatePhase += cadence * dt;
      this.polePushPhase += cadence * dt;

      // V-Skate leg push impulse peaks during each left/right ski push-off
      const legKick = Math.abs(Math.sin(this.skatePhase));
      propulsiveAccel += this.skateActivity * legKick * 4.4;
      skateLateralSway = Math.sin(this.skatePhase) * this.skateActivity * 0.55;

      // Double-Poling arm/core power drive peaks when -sin(polePushPhase) > 0
      const sinP = Math.sin(this.polePushPhase);
      const poleDrive = Math.max(0.0, -sinP);
      propulsiveAccel += this.polePushActivity * poleDrive * 5.2;

      // Stamp twin pole dimples & crisp snow click right as poles plant at transition from reach -> drive!
      const curSign = sinP >= 0 ? 1 : -1;
      if (this._prevPoleSinSign > 0 && curSign < 0 && this.polePushActivity > 0.35) {
        this._stampDoublePoleDimples(fwdX, fwdZ);
        this.audioEngine?.playPolePlant();
      }
      this._prevPoleSinSign = curSign;
    }

    // 6. Newton's 2nd Law Force Integration on Inclined Slope!
    // Exact gravity projection tangent to terrain surface: a_g = (g n_x n_y, g n_z n_y)
    let ax = GRAVITY * n.x * n.y;
    let az = GRAVITY * n.z * n.y;

    // Gentle minimum fall-line assist on super-flat DEM benches so races never stall awkwardly
    const downDot = n.x * fwdX + n.z * fwdZ;
    if (grounded && downDot < 0.14 && this.mode === 'auto') {
      ax += fwdX * 1.4;
      az += fwdZ * 1.4;
    }

    // Add muscular V-skate + double-poling forward thrust & slight lateral stride rhythm
    ax += fwdX * propulsiveAccel + rightX * skateLateralSway;
    az += fwdZ * propulsiveAccel + rightZ * skateLateralSway;

    // Crosswind gust lateral force
    const windScale = this.mode === 'auto' ? 0.35 : 0.72;
    ax += rightX * windForceX * windScale;
    az += rightZ * windForceX * windScale;

    // Aerodynamic Drag: F_d / m = 0.5 * rho * CdA * v^2 / m (tucking slashes drag!)
    const vMag = Math.hypot(this.velX, this.velZ);
    const cdA = THREE.MathUtils.lerp(0.88, 0.42, this.tuckFactor);
    if (vMag > 0.05) {
      const dragMag = (0.5 * AIR_RHO * cdA * vMag * vMag) / SKIER_MASS;
      ax -= (this.velX / vMag) * dragMag;
      az -= (this.velZ / vMag) * dragMag;
    }

    // Snow Base Kinetic Friction + Hockey-Stop Braking Drag (S key)
    if (grounded && vMag > 0.05) {
      const baseFric = muSnow * GRAVITY * Math.max(0.25, n.y);
      const brakeFric = wantBrake * 9.5 * (0.35 + 0.65 * surfaceGrip);
      const totFric = baseFric + brakeFric;
      ax -= (this.velX / vMag) * totFric;
      az -= (this.velZ / vMag) * totFric;
    }

    this.velX += ax * dt;
    this.velZ += az * dt;

    // 7. Parabolic Sidecut Carving (R = R_sc cos φ) vs Static/Dynamic Edge-Grip SLIP!
    vFwd = this.velX * fwdX + this.velZ * fwdZ;
    vLat = this.velX * rightX + this.velZ * rightZ;

    if (grounded) {
      const phi = Math.abs(this.edgeAngle);
      const cosPhi = Math.max(0.45, Math.cos(phi));
      // Parabolic carving turn curvature + low-speed rotational pivot blend
      const carveKappa = (Math.sin(phi) / (SIDECUT_R * cosPhi * cosPhi)) * Math.sign(this.edgeAngle);
      const lowSpeedPivot = this.edgeAngle * 0.95 * (1.0 - THREE.MathUtils.clamp(vFwd / 12.0, 0, 1));
      const omegaIdeal = vFwd * carveKappa + lowSpeedPivot;

      // Compare centripetal demand (v^2 / R) against maximum static snow edge bite!
      const aLatReq = Math.abs(vFwd * omegaIdeal);
      const aLatMax = (0.55 + 2.05 * Math.sin(phi)) * GRAVITY * Math.max(0.25, n.y) * surfaceGrip;

      let actualOmega = omegaIdeal;
      if (aLatReq > aLatMax && vFwd > 2.0) {
        // Edge grip breaks loose -> genuine sideways SKID/SLIP drift + energy dissipation!
        const gripRatio = aLatMax / aLatReq;
        actualOmega = omegaIdeal * (0.48 + 0.52 * gripRatio);
        this.slipRatio = THREE.MathUtils.lerp(
          this.slipRatio,
          THREE.MathUtils.clamp((aLatReq - aLatMax) / Math.max(aLatMax, 1.5), 0.15, 1.0),
          Math.min(1, dt * 10.0)
        );
        // Skidding scrubs forward speed into displaced snow spray!
        vFwd *= Math.exp(-0.55 * this.slipRatio * dt);
      } else {
        this.slipRatio = THREE.MathUtils.lerp(this.slipRatio, onBlueIce && phi > 0.25 ? 0.35 : 0.0, Math.min(1, dt * 8.0));
      }

      this.heading += actualOmega * dt;
      this.lateralG = THREE.MathUtils.lerp(this.lateralG, (vFwd * actualOmega) / GRAVITY, Math.min(1, dt * 8.0));

      // Re-project velocity onto new ski heading: clean carve kills sideways slip, skidding retains lateral drift!
      const newFwdX = Math.sin(this.heading);
      const newFwdZ = -Math.cos(this.heading);
      const newRightX = -newFwdZ;
      const newRightZ = newFwdX;

      const latDamp = THREE.MathUtils.lerp(13.5, 2.2, this.slipRatio) * (0.35 + 0.65 * surfaceGrip);
      vLat *= Math.exp(-latDamp * dt);
      // Slight carve edge energy scrub proportional to edge bite
      vFwd = Math.max(0.0, vFwd - Math.abs(this.edgeAngle) * 0.55 * surfaceGrip * dt);

      // Clamp to realistic alpine freeride max speed (~95 km/h = 26.5 m/s)
      vFwd = Math.min(26.5, vFwd);
      this.velX = newFwdX * vFwd + newRightX * vLat;
      this.velZ = newFwdZ * vFwd + newRightZ * vLat;
    } else {
      // Mid-air subtle yaw control
      this.heading += this.edgeAngle * 0.45 * dt;
      this.lateralG *= Math.exp(-6.0 * dt);
      this.slipRatio = 0.0;
    }

    // Apply physical avalanche engulfment drag, lateral shove & impact slam!
    if (avalanche && avalanche.engulfment > 0.03) {
      const beforeSpeed = Math.hypot(this.velX, this.velZ);
      this.speed = beforeSpeed;
      avalanche.applyPhysicsToSkier(dt, this);
      if (beforeSpeed > 0.1) {
        const sRatio = this.speed / beforeSpeed;
        this.velX *= sRatio;
        this.velZ *= sRatio;
      }
    }

    // 8. Integrate World Position, Resolve Hard-Body Solid Collisions & Soft Terrain Bounds!
    this.pos.x += this.velX * dt;
    this.pos.z += this.velZ * dt;
    this._resolveSolidCollisions(course, worldColliderGroups);
    this.speed = Math.hypot(this.velX, this.velZ);

    const dem = getActiveDem();
    if (dem) {
      const bound = dem.span * 0.44;
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -bound, bound);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, -bound, bound);
    } else {
      // Keep both player and AI cleanly inside the alpine valley floor (never climbing 60m up canyon walls!)
      const maxLat = this.mode === 'auto' ? 22.0 : 38.0;
      const cx = valleyCenterX(this.pos.z);
      if (Math.abs(this.pos.x - cx) > maxLat) {
        this.pos.x = cx + Math.sign(this.pos.x - cx) * maxLat;
        // Redirect outward lateral velocity back into the valley
        if (Math.sign(this.velX) === Math.sign(this.pos.x - cx)) {
          this.velX *= -0.25;
        }
      }
    }

    // 9. Solid Kicker Ramp Surface Riding, Vertical Jump Physics & Landing Shock Absorption!
    this._stepVerticalAirborne(dt, course);

    // 10. Classify Live Biomechanical Stance Label for HUD
    if (this.stumbleRecoil > 0.28) {
      this.stance = 'STUMBLE';
    } else if (this.airborneHeight > 0.14) {
      this.stance = 'AIR';
    } else if (this.landingCompression > 0.32) {
      this.stance = 'LAND';
    } else if (this.skateActivity > 0.28) {
      this.stance = 'SKATE';
    } else if (this.polePushActivity > 0.30) {
      this.stance = 'POLE';
    } else if (this.slipRatio > 0.25) {
      this.stance = 'SLIP';
    } else if (this.tuckFactor > 0.45) {
      this.stance = 'TUCK';
    } else if (Math.abs(this.edgeAngle) > 0.22) {
      this.stance = 'CARVE';
    } else {
      this.stance = 'GLIDE';
    }
  }

  _stepVerticalAirborne(dt, course = null) {
    const kickerInfo = course?.getKickerSurfaceAt?.(this.pos.x, this.pos.z);
    const groundY = evalAlpineHeight(this.pos.x, this.pos.z) + (kickerInfo ? kickerInfo.lift : 0.0);

    // Ride solidly up sculpted snow kicker ramp and launch cleanly off the top lip!
    if (kickerInfo?.launchKicker && this.airborneHeight <= 0.22 && this.speed > 4.8) {
      this.vy = Math.max(this.vy, 5.2 + this.speed * 0.22);
      this.airborneHeight = Math.max(this.airborneHeight, 0.14);
      this.unweightPulse = 0.85;
      course.triggerKickerBonus(kickerInfo.launchKicker);
    }

    if (this.airborneHeight > 0.001 || this.vy > 0) {
      this._maxAirInJump = Math.max(this._maxAirInJump, this.airborneHeight);
      this.vy -= 13.2 * dt;
      this.airborneHeight += this.vy * dt;
      if (this.airborneHeight <= 0) {
        // Trigger biomechanical knee/hip landing shock absorption + powder landing burst!
        if (this._maxAirInJump > 0.25) {
          this.landingCompression = THREE.MathUtils.clamp(Math.abs(this.vy) / 7.2, 0.42, 1.0);
          for (let i = 0; i < 14; i++) {
            const ang = (i / 14) * Math.PI * 2;
            this._sprayPos.set(this.pos.x + Math.cos(ang) * 0.4, groundY + 0.08, this.pos.z + Math.sin(ang) * 0.4);
            this._sprayVel.set(Math.cos(ang) * 3.2, 1.4 + Math.random() * 1.4, Math.sin(ang) * 3.2);
            this.spraySystem.emit(this._sprayPos, this._sprayVel, 0.55 + Math.random() * 0.4, 0.85, 0.0);
          }
          this.audioEngine?.playPolePlant();
        }
        this.airborneHeight = 0;
        this.vy = 0;
        this._maxAirInJump = 0;
      }
    }
    this.pos.y = groundY + this.airborneHeight;
  }

  _stampAndSpray(dt) {
    const fwdX = Math.sin(this.heading);
    const fwdZ = -Math.cos(this.heading);
    const rightX = -fwdZ;
    const rightZ = fwdX;

    // Incorporate live V-skate lateral leg push into actual FBO ski track positions
    // so low-speed skating stamps genuine herringbone/V-skate tracks into the snow!
    const skateSin = Math.sin(this.skatePhase);
    const pushL = Math.max(0.0, skateSin) * this.skateActivity;
    const pushR = Math.max(0.0, -skateSin) * this.skateActivity;

    const half = this.rig.stanceHalf;
    const offL = half + pushL * 0.22;
    const offR = half + pushR * 0.22;

    this.currLeft.set(this.pos.x - rightX * offL - fwdX * pushL * 0.24, this.pos.z - rightZ * offL - fwdZ * pushL * 0.24);
    this.currRight.set(this.pos.x + rightX * offR - fwdX * pushR * 0.24, this.pos.z + rightZ * offR - fwdZ * pushR * 0.24);

    if (this.airborneHeight <= 0.06 && this.hasPrevStamp) {
      const stepDist = this.currLeft.distanceTo(this.prevLeft);
      if (stepDist > 0.015 && stepDist < 5.0) {
        const carveIntensity = Math.min(1.0, Math.abs(this.edgeAngle) / 0.58 + this.slipRatio * 0.5);
        const speedNorm = Math.min(1.0, this.speed / 15.0);

        this.trackSystem.stampTwinSkis(
          this.prevLeft,
          this.currLeft,
          this.prevRight,
          this.currRight,
          {
            radiusMeters: 0.135 + carveIntensity * 0.036 + this.landingCompression * 0.04,
            depth: 0.72 + carveIntensity * 0.28 + this.landingCompression * 0.25,
            berm: 0.65 + carveIntensity * 0.35,
            iceGlint: 0.48 + carveIntensity * 0.52,
            edgeBias: Math.max(-1, Math.min(1, this.edgeAngle / 0.52))
          }
        );

        // Heavier rooster-tail spray during aggressive carving, SLIP skidding, or V-skate kicks!
        const sprayRate = (0.35 + carveIntensity * 2.4 + this.slipRatio * 2.8 + this.skateActivity * 0.8) * Math.max(0.25, speedNorm);
        const count = Math.floor(sprayRate) + (Math.random() < (sprayRate % 1) ? 1 : 0);
        const outSign = this.edgeAngle >= 0 ? -1 : 1;

        for (let i = 0; i < count; i++) {
          const sx = this.pos.x - fwdX * 0.55 + rightX * (outSign * 0.28);
          const sz = this.pos.z - fwdZ * 0.55 + rightZ * (outSign * 0.28);
          this._sprayPos.set(sx, this.pos.y + 0.04, sz);
          this._sprayVel.set(
            rightX * outSign * (1.8 + carveIntensity * 4.0) - fwdX * (this.speed * 0.22),
            1.1 + carveIntensity * 2.5,
            rightZ * outSign * (1.8 + carveIntensity * 4.0) - fwdZ * (this.speed * 0.22)
          );
          this.spraySystem.emit(this._sprayPos, this._sprayVel, 0.38 + carveIntensity * 0.48, 0.78, 0.0);
        }
      }
    }

    this.prevLeft.copy(this.currLeft);
    this.prevRight.copy(this.currRight);
    this.hasPrevStamp = this.airborneHeight <= 0.06;
  }

  _syncRigTransform() {
    // 4-point terrain slope alignment (tips vs tails pitch + cross-slope normal)
    const n = evalAlpineNormal(this.pos.x, this.pos.z, 0.45, this._tmpNormal);
    const fwdRaw = this._tmpFwd.set(Math.sin(this.heading), 0, -Math.cos(this.heading));
    const fwd = fwdRaw.addScaledVector(n, -fwdRaw.dot(n)).normalize();
    const right = this._tmpRight.crossVectors(fwd, n).normalize();
    const up = this._tmpUp.crossVectors(right, fwd).normalize();

    this.rig.root.position.set(this.pos.x, this.pos.y + 0.085, this.pos.z);
    this._tmpMat.makeBasis(right, up, fwd.clone().negate());
    this.rig.root.quaternion.setFromRotationMatrix(this._tmpMat);

    // Physical centripetal lean inclination: tan(θ_lean) = v^2 / (g R) = lateralG!
    const gLean = Math.atan(THREE.MathUtils.clamp(this.lateralG * 0.85, -0.75, 0.75));
    const targetLean = -(this.edgeAngle * 0.42 + gLean * 0.32);
    this.rig.leanGroup.rotation.z = targetLean;

    // Drive full multi-joint human ski biomechanics (V-skate, double-poling, pole-plant,
    // inside-ski lead, down-unweighting, aero egg-tuck, landing shock absorption & POV hands!)
    this.rig.updateBiomechanics?.({
      edgeAngle: this.edgeAngle,
      speed: this.speed,
      airborneHeight: this.airborneHeight,
      time: this.autoTime,
      tuckFactor: this.tuckFactor,
      skateActivity: this.skateActivity,
      skatePhase: this.skatePhase,
      polePushPhase: this.polePushPhase,
      polePushActivity: this.polePushActivity,
      polePlantL: this.polePlantL,
      polePlantR: this.polePlantR,
      unweightPulse: this.unweightPulse,
      landingCompression: this.landingCompression,
      stumbleRecoil: this.stumbleRecoil,
      slipRatio: this.slipRatio,
      lateralG: this.lateralG
    });
  }

  getForwardXZ(out = new THREE.Vector2()) {
    return out.set(Math.sin(this.heading), -Math.cos(this.heading));
  }
}
