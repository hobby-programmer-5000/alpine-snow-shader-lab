// ============================================================================
// Dual-Tier World-Locked Ping-Pong RGBA16F Track FBO System
//   - Tier 1 (Near):  1024x1024 over 48m  (4.69 cm/px) -> razor-sharp 3D carving & self-shadowing
//   - Tier 2 (Macro):  512x512  over 240m (46.9 cm/px) -> long alpine descent S-turn ribbon!
// Both tiers snap strictly to integer texels -> ZERO bilinear scroll blur!
// ============================================================================

import * as THREE from 'three';
import fullscreenVert from '../shaders/fullscreen.vert.glsl?raw';
import trackScrollFrag from '../shaders/trackScroll.frag.glsl?raw';
import trackStampFrag from '../shaders/trackStamp.frag.glsl?raw';
import trackPipFrag from '../shaders/trackPip.frag.glsl?raw';

class PingPongTier {
  constructor(renderer, resolution, spanMeters, rtType) {
    this.renderer = renderer;
    this.resolution = resolution;
    this.span = spanMeters;
    this.texelWorld = spanMeters / resolution;
    this.origin = new THREE.Vector2(0, 0);

    const opts = {
      type: rtType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false
    };
    this.rtA = new THREE.WebGLRenderTarget(resolution, resolution, opts);
    this.rtB = new THREE.WebGLRenderTarget(resolution, resolution, opts);
    this.readRT = this.rtA;
    this.writeRT = this.rtB;
  }

  get texture() {
    return this.readRT.texture;
  }

  swap() {
    const tmp = this.readRT;
    this.readRT = this.writeRT;
    this.writeRT = tmp;
  }

  worldToUV(wx, wz, out = new THREE.Vector2()) {
    return out.set(
      (wx - this.origin.x) / this.span + 0.5,
      (wz - this.origin.y) / this.span + 0.5
    );
  }

  clear(centerX, centerZ) {
    this.origin.set(
      Math.round(centerX / this.texelWorld) * this.texelWorld,
      Math.round(centerZ / this.texelWorld) * this.texelWorld
    );
    const prevTarget = this.renderer.getRenderTarget();
    const prevColor = new THREE.Color();
    this.renderer.getClearColor(prevColor);
    const prevAlpha = this.renderer.getClearAlpha();

    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(this.rtA);
    this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(this.rtB);
    this.renderer.clear(true, false, false);

    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(prevColor, prevAlpha);
  }
}

export class TrackFboSystem {
  constructor(renderer, { resolution = 1024, spanMeters = 48.0, macroRes = 512, macroSpan = 240.0 } = {}) {
    this.renderer = renderer;
    this.resolution = resolution;
    this.span = spanMeters;
    this.macroSpan = macroSpan;

    const gl = renderer.getContext();
    const canHalfFloat =
      renderer.capabilities.isWebGL2 &&
      (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    const rtType = canHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;

    this.near = new PingPongTier(renderer, resolution, spanMeters, rtType);
    this.macro = new PingPongTier(renderer, macroRes, macroSpan, rtType);
    this.rtType = rtType;

    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.scrollMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: trackScrollFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: this.near.texture },
        uShiftTexels: { value: new THREE.Vector2(0, 0) },
        uTrackRes: { value: resolution },
        uDecay: { value: 0.0 }
      }
    });

    this.stampMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: trackStampFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: this.near.texture },
        uTrackRes: { value: resolution },
        uLA: { value: new THREE.Vector2(0.5, 0.5) },
        uLB: { value: new THREE.Vector2(0.5, 0.5) },
        uRA: { value: new THREE.Vector2(0.5, 0.5) },
        uRB: { value: new THREE.Vector2(0.5, 0.5) },
        uMode: { value: 0.0 },
        uRadiusUV: { value: 0.14 / spanMeters },
        uDepth: { value: 0.85 },
        uBerm: { value: 0.80 },
        uIceGlint: { value: 0.65 },
        uEdgeBias: { value: 0.0 }
      }
    });

    this.pipMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: trackPipFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTrackTex: { value: this.near.texture },
        uSunDirXZ: { value: new THREE.Vector2(0.7, 0.7) }
      }
    });

    this.quadMesh = new THREE.Mesh(this.quadGeo, this.scrollMat);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quadMesh);

    this.clear(0, 0);
  }

  get texture() {
    return this.near.texture;
  }

  get origin() {
    return this.near.origin;
  }

  get macroTexture() {
    return this.macro.texture;
  }

  get macroOrigin() {
    return this.macro.origin;
  }

  clear(centerX = this.near.origin.x, centerZ = this.near.origin.y) {
    this.near.clear(centerX, centerZ);
    this.macro.clear(centerX, centerZ);
  }

  /**
   * Dynamically switches Near Ping-Pong FBO resolution (1024 / 1536 / 2048) for GPU Quality Presets!
   */
  setNearResolution(newRes) {
    if (newRes === this.resolution) return;
    const prevOriginX = this.near.origin.x;
    const prevOriginZ = this.near.origin.y;
    this.near.rtA.dispose();
    this.near.rtB.dispose();
    this.resolution = newRes;
    this.near = new PingPongTier(this.renderer, newRes, this.span, this.rtType);
    this.near.clear(prevOriginX, prevOriginZ);
  }

  _scrollTier(tier, targetX, targetZ, decay) {
    const snappedX = Math.round(targetX / tier.texelWorld) * tier.texelWorld;
    const snappedZ = Math.round(targetZ / tier.texelWorld) * tier.texelWorld;
    const shiftX = Math.round((snappedX - tier.origin.x) / tier.texelWorld);
    const shiftZ = Math.round((snappedZ - tier.origin.y) / tier.texelWorld);

    if (shiftX === 0 && shiftZ === 0 && decay <= 0.0001) return;

    tier.origin.set(snappedX, snappedZ);
    const prevTarget = this.renderer.getRenderTarget();
    this.scrollMat.uniforms.uPrev.value = tier.texture;
    this.scrollMat.uniforms.uShiftTexels.value.set(shiftX, shiftZ);
    this.scrollMat.uniforms.uTrackRes.value = tier.resolution;
    this.scrollMat.uniforms.uDecay.value = decay;
    this.quadMesh.material = this.scrollMat;

    this.renderer.setRenderTarget(tier.writeRT);
    this.renderer.render(this.quadScene, this.orthoCam);
    this.renderer.setRenderTarget(prevTarget);
    tier.swap();
  }

  scrollTo(targetWorldX, targetWorldZ, decay = 0.0) {
    this._scrollTier(this.near, targetWorldX, targetWorldZ, decay);
    this._scrollTier(this.macro, targetWorldX, targetWorldZ, decay * 0.4);
  }

  _stampTierTwin(tier, lPrev, lCurr, rPrev, rCurr, params, radiusFloorMeters = 0.0) {
    const u = this.stampMat.uniforms;
    u.uPrev.value = tier.texture;
    u.uTrackRes.value = tier.resolution;
    tier.worldToUV(lPrev.x, lPrev.y, u.uLA.value);
    tier.worldToUV(lCurr.x, lCurr.y, u.uLB.value);
    tier.worldToUV(rPrev.x, rPrev.y, u.uRA.value);
    tier.worldToUV(rCurr.x, rCurr.y, u.uRB.value);
    u.uMode.value = 0.0;
    u.uRadiusUV.value = Math.max(params.radiusMeters, radiusFloorMeters) / tier.span;
    u.uDepth.value = params.depth;
    u.uBerm.value = params.berm;
    u.uIceGlint.value = params.iceGlint;
    u.uEdgeBias.value = params.edgeBias;

    const prevTarget = this.renderer.getRenderTarget();
    this.quadMesh.material = this.stampMat;
    this.renderer.setRenderTarget(tier.writeRT);
    this.renderer.render(this.quadScene, this.orthoCam);
    this.renderer.setRenderTarget(prevTarget);
    tier.swap();
  }

  stampTwinSkis(lPrev, lCurr, rPrev, rCurr, {
    radiusMeters = 0.145,
    depth = 0.85,
    berm = 0.82,
    iceGlint = 0.72,
    edgeBias = 0.0
  } = {}) {
    const p = { radiusMeters, depth, berm, iceGlint, edgeBias };
    this._stampTierTwin(this.near, lPrev, lCurr, rPrev, rCurr, p, 0.0);
    // Macro 240m tier uses slightly wider anti-aliased ribbon so distant alpine S-turns remain clearly readable!
    this._stampTierTwin(this.macro, lPrev, lCurr, rPrev, rCurr, p, 0.42);
  }

  stampBrush(prevXZ, currXZ, radiusMeters = 0.34, depth = 0.95, berm = 0.92, iceGlint = 0.8) {
    const stampOne = (tier, rFloor) => {
      const u = this.stampMat.uniforms;
      u.uPrev.value = tier.texture;
      u.uTrackRes.value = tier.resolution;
      tier.worldToUV(prevXZ.x, prevXZ.y, u.uLA.value);
      tier.worldToUV(currXZ.x, currXZ.y, u.uLB.value);
      u.uMode.value = 1.0;
      u.uRadiusUV.value = Math.max(radiusMeters, rFloor) / tier.span;
      u.uDepth.value = depth;
      u.uBerm.value = berm;
      u.uIceGlint.value = iceGlint;
      u.uEdgeBias.value = 0.0;

      const prevTarget = this.renderer.getRenderTarget();
      this.quadMesh.material = this.stampMat;
      this.renderer.setRenderTarget(tier.writeRT);
      this.renderer.render(this.quadScene, this.orthoCam);
      this.renderer.setRenderTarget(prevTarget);
      tier.swap();
    };
    stampOne(this.near, 0.0);
    stampOne(this.macro, 0.55);
  }

  stampPoleDimple(xz, radiusMeters = 0.14) {
    const u = this.stampMat.uniforms;
    u.uPrev.value = this.near.texture;
    u.uTrackRes.value = this.near.resolution;
    this.near.worldToUV(xz.x, xz.y, u.uLB.value);
    u.uMode.value = 2.0;
    u.uRadiusUV.value = radiusMeters / this.near.span;
    u.uDepth.value = 0.78;
    u.uBerm.value = 0.62;
    u.uIceGlint.value = 0.35;

    const prevTarget = this.renderer.getRenderTarget();
    this.quadMesh.material = this.stampMat;
    this.renderer.setRenderTarget(this.near.writeRT);
    this.renderer.render(this.quadScene, this.orthoCam);
    this.renderer.setRenderTarget(prevTarget);
    this.near.swap();
  }

  renderPiP(element, sunDir) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const canvasHeight = this.renderer.domElement.clientHeight;
    const x = Math.round(rect.left);
    const y = Math.round(canvasHeight - rect.bottom);
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);

    this.pipMat.uniforms.uTrackTex.value = this.near.texture;
    this.pipMat.uniforms.uSunDirXZ.value.set(sunDir.x, sunDir.z);
    this.quadMesh.material = this.pipMat;

    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(null);
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(x, y, w, h);
    this.renderer.setViewport(x, y, w, h);
    this.renderer.render(this.quadScene, this.orthoCam);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, this.renderer.domElement.clientWidth, canvasHeight);
    this.renderer.autoClear = prevAutoClear;
  }
}
