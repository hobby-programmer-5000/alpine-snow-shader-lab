// ============================================================================
// Physically Meaningful UPSLOPE-CHASING Dynamic Slab Avalanche Simulation
//   - Rips open UPSLOPE BEHIND the skier (38m back) and surges DOWNHILL CHASING
//     the skier along the slope at 58–74 km/h!
//   - Real gameplay stakes & physics:
//       * Live gap telemetry (`gapMeters`, `inPath`, `engulfment`)
//       * If caught (`gapMeters < 3m` inside slab width): violent speed drag,
//         whiteout engulfment, camera slam, lateral shove & +3.0s race penalty!
//       * Outrun downhill (>48m lead) OR carve laterally outside the 16m slab
//         path -> awards +500 AVALANCHE ESCAPED survival bonus!
// ============================================================================

import * as THREE from 'three';
import { evalAlpineHeight, evalAlpineNormal } from './terrainMath.js';

export class AvalancheSystem {
  constructor(spraySystem, audioEngine) {
    this.spraySystem = spraySystem;
    this.audioEngine = audioEngine;

    this.active = 0.0;
    this.isRunning = false;
    this.elapsed = 0.0;
    this.origin = new THREE.Vector2(0, 0);
    this.dir = new THREE.Vector2(0, -1); // unit downhill surge direction
    this.front = 0.0;                    // meters traveled from crown line
    this.speed = 0.0;
    this.width = 16.5;                   // half-width of avalanche corridor (33m wide — dodgeable sideways!)
    this.proximity = 0.0;                // [0..1] closeness for rumble & shake
    this.faceShot = 0.0;                 // [0..1] powder whiteout mist
    this.shake = 0.0;                    // camera vibration amplitude

    // Live gameplay chase telemetry
    this.gapMeters = 999.0;              // >0 = meters behind skier; <=0 = overtaking skier!
    this.lateralDist = 999.0;            // sideways meters from avalanche centerline
    this.inPath = false;                 // true if skier is inside slab width
    this.engulfment = 0.0;               // [0..1] physical snow drag & shove intensity
    this.wasCaught = false;
    this.escaped = false;
    this._pendingEvent = null;           // 'caught' | 'escaped' | null
    this._safeOutrunTimer = 0.0;

    this._tmpN = new THREE.Vector3();
    this._emitPos = new THREE.Vector3();
    this._emitVel = new THREE.Vector3();
  }

  /**
   * Release a roaring slab avalanche UPSLOPE BEHIND the skier so it physically
   * chases them down the mountain and forces a sprint or lateral escape!
   */
  triggerNear(skierPos, fallbackFwdXZ) {
    const fwdX = fallbackFwdXZ.x;
    const fwdZ = fallbackFwdXZ.y;
    const rightX = -fwdZ;
    const rightZ = fwdX;

    // Inspect left vs right flank upslope behind the skier so the crown snaps on the steeper upper slope
    const backX = skierPos.x - fwdX * 26.0;
    const backZ = skierPos.z - fwdZ * 26.0;
    const leftH = evalAlpineHeight(backX - rightX * 12, backZ - rightZ * 12);
    const rightH = evalAlpineHeight(backX + rightX * 12, backZ + rightZ * 12);
    const highSide = leftH >= rightH ? -1 : 1;

    const crownX = backX + rightX * (highSide * 4.5);
    const crownZ = backZ + rightZ * (highSide * 4.5);
    this.origin.set(crownX, crownZ);

    // Surge downhill directly along the fall line chasing the skier!
    const n = evalAlpineNormal(crownX, crownZ, 2.2, this._tmpN);
    let dx = fwdX * 0.82 + n.x * 0.22 - rightX * highSide * 0.08;
    let dz = fwdZ * 0.82 + n.z * 0.22 - rightZ * highSide * 0.08;
    const len = Math.hypot(dx, dz) || 1;
    this.dir.set(dx / len, dz / len);

    this.front = 6.0;         // starts ~20m upslope behind skier — immediately visible closing in!
    this.speed = 16.2;        // ~58 km/h initial surge, accelerates to ~71 km/h!
    this.width = 16.5;        // 33m wide roaring wall (dodgeable laterally!)
    this.elapsed = 0.0;
    this.isRunning = true;
    this.active = 1.0;

    this.gapMeters = 20.0;
    this.lateralDist = 5.0;
    this.inPath = true;
    this.engulfment = 0.0;
    this.wasCaught = false;
    this.escaped = false;
    this._pendingEvent = null;
    this._safeOutrunTimer = 0.0;

    this.audioEngine?.playAvalancheCrack();

    // Immediate explosive upslope crown-fracture wall & towering flanking billows!
    const avyRightX = -this.dir.y;
    const avyRightZ = this.dir.x;
    for (let i = 0; i < 75; i++) {
      const lat = (Math.random() * 2 - 1) * this.width * 1.05;
      const wx = this.origin.x + avyRightX * lat + this.dir.x * (2.0 + Math.random() * 7.0);
      const wz = this.origin.y + avyRightZ * lat + this.dir.y * (2.0 + Math.random() * 7.0);
      const wy = evalAlpineHeight(wx, wz);
      this._emitPos.set(wx, wy + 1.0 + Math.random() * 2.5, wz);
      this._emitVel.set(
        this.dir.x * 16.0 + (Math.random() - 0.5) * 3.5,
        3.5 + Math.random() * 5.0,
        this.dir.y * 16.0 + (Math.random() - 0.5) * 3.5
      );
      this.spraySystem.emit(this._emitPos, this._emitVel, 4.2 + Math.random() * 3.4, 2.7, 1.0);
    }
  }

  consumeEvent() {
    const ev = this._pendingEvent;
    this._pendingEvent = null;
    return ev;
  }

  reset() {
    this.isRunning = false;
    this.active = 0.0;
    this.front = 0.0;
    this.proximity = 0.0;
    this.faceShot = 0.0;
    this.shake = 0.0;
    this.gapMeters = 999.0;
    this.lateralDist = 999.0;
    this.inPath = false;
    this.engulfment = 0.0;
    this.wasCaught = false;
    this.escaped = false;
    this._pendingEvent = null;
    this._safeOutrunTimer = 0.0;
  }

  /**
   * Physical snow-slab drag, lateral shove & impact slam when the chasing avalanche catches the skier!
   */
  applyPhysicsToSkier(dt, skier) {
    if (!this.isRunning || this.engulfment <= 0.03) return;

    // Dense rushing avalanche debris drags ski speed sharply and destabilizes carving edge!
    const drag = Math.exp(-1.85 * this.engulfment * dt);
    skier.speed = Math.max(3.8, skier.speed * drag);

    // Physical push downslope + turbulent lateral tumble!
    const rightX = -this.dir.y;
    const rightZ = this.dir.x;
    const sway = Math.sin(this.elapsed * 7.5) * 3.8 * this.engulfment;
    skier.pos.x += (this.dir.x * 2.4 * this.engulfment + rightX * sway) * dt;
    skier.pos.z += (this.dir.y * 2.4 * this.engulfment + rightZ * sway) * dt;
    skier.edgeAngle = THREE.MathUtils.clamp(
      skier.edgeAngle + Math.sin(this.elapsed * 11.0) * 1.4 * this.engulfment * dt,
      -0.68,
      0.68
    );

    // One-time slam impact when first overtaken deep inside the avalanche head!
    if (!this.wasCaught && this.engulfment > 0.60) {
      this.wasCaught = true;
      this._pendingEvent = 'caught';
      skier.speed = Math.max(4.0, skier.speed * 0.55);
      this.audioEngine?.playImpact();
    }
  }

  update(dt, skierPos, terrainUniforms) {
    if (!this.isRunning) {
      this.proximity *= Math.exp(-3.0 * dt);
      this.faceShot *= Math.exp(-3.5 * dt);
      this.shake *= Math.exp(-6.0 * dt);
      this.engulfment *= Math.exp(-4.0 * dt);
      this._syncUniforms(terrainUniforms);
      return;
    }

    this.elapsed += dt;

    // Gently steer avalanche chase vector slightly toward local terrain downhill fall line
    const headX = this.origin.x + this.dir.x * this.front;
    const headZ = this.origin.y + this.dir.y * this.front;
    const headN = evalAlpineNormal(headX, headZ, 2.5, this._tmpN);
    const nLen = Math.hypot(headN.x, headN.z);
    if (nLen > 0.05) {
      this.dir.x = THREE.MathUtils.lerp(this.dir.x, headN.x / nLen, Math.min(1, dt * 0.12));
      this.dir.y = THREE.MathUtils.lerp(this.dir.y, headN.z / nLen, Math.min(1, dt * 0.12));
      this.dir.normalize();
    }

    // Physically slope-coupled Voellmy surge pacing: ~63 km/h on 16° valley floors, up to ~73 km/h on 30°+ couloirs!
    // Cruising skiers still get overtaken & slammed, while deep aero-tuck racers genuinely outrun it!
    const slopeSin = THREE.MathUtils.clamp(nLen, 0.22, 0.58);
    const peakCruise = THREE.MathUtils.lerp(17.2, 20.2, (slopeSin - 0.22) / 0.36);
    const targetSpeed = this.front < 195.0
      ? peakCruise
      : Math.max(2.5, peakCruise * (1.0 - (this.front - 195.0) / 85.0));
    this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, Math.min(1.0, dt * 1.25));
    this.front += this.speed * dt;

    // Runout fade after 255m or 16.5 seconds
    if (this.front > 245.0 || this.elapsed > 16.5) {
      this.active = Math.max(0.0, this.active - dt * 0.55);
      if (this.active <= 0.001) {
        if (!this.wasCaught && !this.escaped && this.elapsed > 4.0) {
          this.escaped = true;
          this._pendingEvent = 'escaped';
        }
        this.isRunning = false;
      }
    }

    const rightX = -this.dir.y;
    const rightZ = this.dir.x;

    // Emit towering churning avalanche cloud wall + flanking side curtains right along the surging front!
    const billowRate = this.speed > 5.0 ? 14 : 4;
    for (let i = 0; i < billowRate; i++) {
      // Concentrate dramatic towering billows along both flanks & central surging tongue
      const spread = (Math.random() * 2 - 1) * this.width * (0.90 + Math.min(0.35, this.front * 0.002));
      const archLag = (spread * spread) / (this.width * this.width) * 4.5;
      const along = Math.max(1.0, this.front - archLag - Math.random() * 8.0);

      const wx = this.origin.x + this.dir.x * along + rightX * spread;
      const wz = this.origin.y + this.dir.y * along + rightZ * spread;
      const wy = evalAlpineHeight(wx, wz);

      this._emitPos.set(wx, wy + 0.9 + Math.random() * 2.8, wz);
      this._emitVel.set(
        this.dir.x * (this.speed * 0.78) + rightX * (Math.random() - 0.5) * 4.2,
        2.8 + Math.random() * 5.2,
        this.dir.y * (this.speed * 0.78) + rightZ * (Math.random() - 0.5) * 4.2
      );
      this.spraySystem.emit(this._emitPos, this._emitVel, 3.8 + Math.random() * 3.6, 2.55, 1.0);
    }

    // Compute exact skier-to-avalanche chase geometry!
    const relX = skierPos.x - this.origin.x;
    const relZ = skierPos.z - this.origin.y;
    const skierAlong = relX * this.dir.x + relZ * this.dir.y;
    const skierLat = Math.abs(relX * rightX + relZ * rightZ);

    this.gapMeters = skierAlong - this.front; // positive = avalanche is behind skier; <= 0 = overtaken!
    this.lateralDist = skierLat;
    this.inPath = skierLat < this.width * 1.05;

    const insideWidth = Math.max(0.0, 1.0 - skierLat / (this.width * 1.15));

    // Engulfment ramps intensely when avalanche front closes within 4m behind -> 14m past skier!
    const waveCover = this.gapMeters < 4.5 && this.gapMeters > -22.0
      ? THREE.MathUtils.clamp((4.5 - this.gapMeters) / 6.5, 0.0, 1.0) * THREE.MathUtils.clamp((this.gapMeters + 22.0) / 8.0, 0.0, 1.0)
      : 0.0;
    const targetEngulf = insideWidth * waveCover * this.active;
    this.engulfment = THREE.MathUtils.lerp(this.engulfment, targetEngulf, Math.min(1.0, dt * 4.5));

    // Check clean escape bonus (either opened > 46m downhill lead OR carved safely outside lateral corridor!)
    if (!this.wasCaught && !this.escaped && this.elapsed > 3.5) {
      const cleanlyOutran = this.gapMeters > 46.0;
      const dodgedSideways = !this.inPath && this.gapMeters < 10.0;
      if (cleanlyOutran || dodgedSideways) {
        this._safeOutrunTimer += dt;
        if (this._safeOutrunTimer > 1.4) {
          this.escaped = true;
          this._pendingEvent = 'escaped';
        }
      } else {
        this._safeOutrunTimer = 0.0;
      }
    }

    // Proximity audio rumble, ground tremor shake & face-shot whiteout mist
    const absGap = Math.abs(this.gapMeters);
    const frontProx = Math.exp(-Math.pow(absGap / 26.0, 2.0));
    const targetProx = Math.max(insideWidth * 0.85, 0.30) * frontProx * this.active;
    this.proximity = THREE.MathUtils.lerp(this.proximity, targetProx, Math.min(1.0, dt * 4.0));

    const targetFace = (this.engulfment * 0.78 + insideWidth * Math.exp(-Math.pow(absGap / 10.0, 2.0)) * 0.25) * this.active;
    this.faceShot = THREE.MathUtils.lerp(this.faceShot, Math.min(0.82, targetFace), Math.min(1.0, dt * 3.8));
    this.shake = this.proximity * (0.045 + this.engulfment * 0.085);

    this._syncUniforms(terrainUniforms);
  }

  getHudAlertText() {
    if (!this.isRunning) return '';
    const gap = Math.max(0, Math.round(this.gapMeters));
    if (this.engulfment > 0.35) {
      return '⚠ ENGULFED BY AVALANCHE! CARVE SIDEWAYS TO ESCAPE!';
    }
    if (!this.inPath) {
      return `AVALANCHE ROARING PAST FLANK (${gap}m) · SAFE LINE!`;
    }
    if (this.gapMeters < 15.0) {
      return `⚠ DANGER! AVALANCHE ${gap}m BEHIND — TUCK OR CUT SIDEWAYS!`;
    }
    return `⚠ AVALANCHE CHASING ${gap}m BEHIND — OUTRUN IT!`;
  }

  _syncUniforms(u) {
    if (!u) return;
    u.uAvyActive.value = this.active;
    u.uAvyOrigin.value.copy(this.origin);
    u.uAvyDir.value.copy(this.dir);
    u.uAvyFront.value = this.front;
    u.uAvyWidth.value = this.width;
  }
}
