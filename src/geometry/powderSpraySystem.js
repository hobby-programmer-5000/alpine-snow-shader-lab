// ============================================================================
// Ring-Buffered Dual-Kind Particle System (1,800 Zero-Texture Procedural Puffs)
//   - kind = 0.0 : Carving rooster-tail powder spray
//   - kind = 1.0 : Massive churning Slab Avalanche billowing powder clouds!
// ============================================================================

import * as THREE from 'three';
import sprayVert from '../shaders/powderSpray.vert.glsl?raw';
import sprayFrag from '../shaders/powderSpray.frag.glsl?raw';

export class PowderSpraySystem {
  constructor(terrainUniforms, maxParticles = 1800) {
    this.max = maxParticles;
    this.cursor = 0;

    this.positions = new Float32Array(maxParticles * 3);
    this.velocities = new Float32Array(maxParticles * 3);
    this.ages = new Float32Array(maxParticles).fill(-1.0);
    this.lifetimes = new Float32Array(maxParticles).fill(1.0);
    this.sizes = new Float32Array(maxParticles).fill(0.5);
    this.seeds = new Float32Array(maxParticles);
    this.kinds = new Float32Array(maxParticles).fill(0.0);

    for (let i = 0; i < maxParticles; i++) {
      this.seeds[i] = Math.random();
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('aAge', new THREE.BufferAttribute(this.ages, 1));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1));
    this.geo.setAttribute('aKind', new THREE.BufferAttribute(this.kinds, 1));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: sprayVert,
      fragmentShader: sprayFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uSunDir: terrainUniforms.uSunDir,
        uSunColor: terrainUniforms.uSunColor,
        uShadowTint: terrainUniforms.uShadowTint
      }
    });

    this.mesh = new THREE.Points(this.geo, this.mat);
    this.mesh.frustumCulled = false;
  }

  emit(worldPos, velVec, size = 0.55, lifetime = 0.95, kind = 0.0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;

    const i3 = i * 3;
    const spread = kind > 0.5 ? 1.2 : 0.16;
    this.positions[i3] = worldPos.x + (Math.random() - 0.5) * spread;
    this.positions[i3 + 1] = worldPos.y + 0.08 + Math.random() * (kind > 0.5 ? 0.65 : 0.1);
    this.positions[i3 + 2] = worldPos.z + (Math.random() - 0.5) * spread;

    this.velocities[i3] = velVec.x + (Math.random() - 0.5) * (kind > 0.5 ? 2.8 : 1.4);
    this.velocities[i3 + 1] = velVec.y + 0.8 + Math.random() * (kind > 0.5 ? 2.4 : 1.4);
    this.velocities[i3 + 2] = velVec.z + (Math.random() - 0.5) * (kind > 0.5 ? 2.8 : 1.4);

    this.ages[i] = 0.0;
    this.lifetimes[i] = lifetime * (0.75 + Math.random() * 0.45);
    this.sizes[i] = size * (0.72 + Math.random() * 0.58);
    this.kinds[i] = kind;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.ages[i] < 0) continue;
      this.ages[i] += dt / this.lifetimes[i];
      if (this.ages[i] >= 1.0) {
        this.ages[i] = -1.0;
        continue;
      }
      const isAvy = this.kinds[i] > 0.5;
      const drag = Math.exp(-(isAvy ? 1.15 : 2.1) * dt);
      const grav = isAvy ? 1.85 : 3.6;

      const i3 = i * 3;
      this.velocities[i3] *= drag;
      this.velocities[i3 + 1] = (this.velocities[i3 + 1] - grav * dt) * drag;
      this.velocities[i3 + 2] *= drag;

      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAge.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aKind.needsUpdate = true;
  }

  clear() {
    this.ages.fill(-1.0);
    this.geo.attributes.aAge.needsUpdate = true;
  }

  setPixelRatio(dpr) {
    this.mat.uniforms.uPixelRatio.value = dpr;
  }
}
