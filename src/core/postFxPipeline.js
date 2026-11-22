// ============================================================================
// Custom 4-Pass HDR Post-Processing Pipeline (Supports 4x Hardware MSAA on RTX!)
//   Pass 1: Main Scene -> HDR Scene RT (alpha: 0.0 FG, 0.55 World, 1.0 Sky)
//   Pass 2: Half-Res Bloom Bright Extract (H) + Vertical Gaussian Blur (V)
//   Pass 3: Dedicated Half-Res 16/22/32-Step IGN Volumetric God-Rays
//   Pass 4: Master Composite (Barrel + Lens Droplets + FXAA + FG-Masked Motion Blur
//           + Radial CA + Bloom + God-Rays + Starburst/Ghosts + ACES Film)
// ============================================================================

import * as THREE from 'three';
import fullscreenVert from '../shaders/fullscreen.vert.glsl?raw';
import bloomExtractFrag from '../shaders/bloomExtract.frag.glsl?raw';
import bloomBlurVFrag from '../shaders/bloomBlurV.frag.glsl?raw';
import godRayFrag from '../shaders/godRay.frag.glsl?raw';
import postCompositeFrag from '../shaders/postComposite.frag.glsl?raw';

export class PostFxPipeline {
  constructor(renderer, width, height, { msaaSamples = 0 } = {}) {
    this.renderer = renderer;
    this.width = Math.max(2, Math.floor(width));
    this.height = Math.max(2, Math.floor(height));

    const gl = renderer.getContext();
    const canHalfFloat =
      renderer.capabilities.isWebGL2 &&
      (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.rtType = canHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.maxSamples = renderer.capabilities.isWebGL2 ? Math.min(4, renderer.capabilities.maxSamples || 0) : 0;
    this.msaaSamples = Math.min(msaaSamples, this.maxSamples);

    this.sceneRT = this._createSceneRT(this.width, this.height, this.msaaSamples);

    const bw = Math.max(2, Math.floor(this.width / 2));
    const bh = Math.max(2, Math.floor(this.height / 2));
    const halfOpts = {
      type: this.rtType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false
    };
    this.bloomA = new THREE.WebGLRenderTarget(bw, bh, halfOpts);
    this.bloomB = new THREE.WebGLRenderTarget(bw, bh, halfOpts);
    this.godRayRT = new THREE.WebGLRenderTarget(bw, bh, halfOpts);

    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.bloomExtractMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: bloomExtractFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.sceneRT.texture },
        uTexel: { value: new THREE.Vector2(1 / bw, 1 / bh) },
        uThresh: { value: 1.18 }
      }
    });

    this.bloomBlurVMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: bloomBlurVFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uBloomH: { value: this.bloomA.texture },
        uTexel: { value: new THREE.Vector2(1 / bw, 1 / bh) }
      }
    });

    this.godRayMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: godRayFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.sceneRT.texture },
        uSunUV: { value: new THREE.Vector2(0.5, 0.8) },
        uSunVis: { value: 0.0 },
        uSunColor: { value: new THREE.Color(1.0, 0.94, 0.84) },
        uGodRaySteps: { value: 22.0 },
        uTime: { value: 0.0 }
      }
    });

    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: postCompositeFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScene: { value: this.sceneRT.texture },
        uBloom: { value: this.bloomB.texture },
        uGodRays: { value: this.godRayRT.texture },
        uTexel: { value: new THREE.Vector2(1 / this.width, 1 / this.height) },
        uHalfTexel: { value: new THREE.Vector2(1 / bw, 1 / bh) },
        uSunUV: { value: new THREE.Vector2(0.5, 0.8) },
        uSunVis: { value: 1.0 },
        uSunColor: { value: new THREE.Color(1.0, 0.94, 0.84) },
        uSpeedFactor: { value: 0.4 },
        uFaceShot: { value: 0.0 },
        uLensWet: { value: 0.0 },
        uStormStreaks: { value: 0.0 },
        uBarrel: { value: 0.045 },
        uEnableFXAA: { value: 1.0 },
        uEnableLensFX: { value: 1.0 },
        uTime: { value: 0.0 },
        uEnablePostFX: { value: 1.0 },
        uExposure: { value: 0.78 },
        uAspect: { value: this.width / Math.max(1, this.height) }
      }
    });

    this.quadMesh = new THREE.Mesh(this.quadGeo, this.compositeMat);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quadMesh);
  }

  _createSceneRT(w, h, samples) {
    return new THREE.WebGLRenderTarget(w, h, {
      type: this.rtType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples
    });
  }

  setMsaaSamples(requested) {
    const target = Math.min(Math.max(0, requested), this.maxSamples);
    if (target === this.msaaSamples) return;
    this.msaaSamples = target;
    this.sceneRT.dispose();
    this.sceneRT = this._createSceneRT(this.width, this.height, this.msaaSamples);
  }

  resize(width, height) {
    this.width = Math.max(2, Math.floor(width));
    this.height = Math.max(2, Math.floor(height));
    const bw = Math.max(2, Math.floor(this.width / 2));
    const bh = Math.max(2, Math.floor(this.height / 2));

    this.sceneRT.setSize(this.width, this.height);
    this.bloomA.setSize(bw, bh);
    this.bloomB.setSize(bw, bh);
    this.godRayRT.setSize(bw, bh);

    this.bloomExtractMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
    this.bloomBlurVMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
    this.compositeMat.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
    this.compositeMat.uniforms.uHalfTexel.value.set(1 / bw, 1 / bh);
    this.compositeMat.uniforms.uAspect.value = this.width / this.height;
  }

  render(scene, camera, {
    sunDir,
    sunColor,
    speedFactor,
    faceShot = 0.0,
    lensWet = 0.0,
    stormStreaks = 0.0,
    time = 0.0,
    enablePostFX = true
  }) {
    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.clear(true, true, false);
    this.renderer.render(scene, camera);

    const sunWorld = camera.position.clone().addScaledVector(sunDir, 800.0);
    const sunNDC = sunWorld.project(camera);
    const inFront = sunNDC.z < 1.0 && sunDir.y > 0.02;
    const sunU = sunNDC.x * 0.5 + 0.5;
    const sunV = sunNDC.y * 0.5 + 0.5;
    const distFromFrame = Math.max(Math.abs(sunU - 0.5), Math.abs(sunV - 0.5));
    const sunVis = inFront ? THREE.MathUtils.clamp(1.0 - (distFromFrame - 0.45) * 1.45, 0.0, 1.0) : 0.0;

    if (enablePostFX) {
      this.bloomExtractMat.uniforms.uScene.value = this.sceneRT.texture;
      this.quadMesh.material = this.bloomExtractMat;
      this.renderer.setRenderTarget(this.bloomA);
      this.renderer.render(this.quadScene, this.orthoCam);

      this.bloomBlurVMat.uniforms.uBloomH.value = this.bloomA.texture;
      this.quadMesh.material = this.bloomBlurVMat;
      this.renderer.setRenderTarget(this.bloomB);
      this.renderer.render(this.quadScene, this.orthoCam);

      const gu = this.godRayMat.uniforms;
      gu.uScene.value = this.sceneRT.texture;
      gu.uSunUV.value.set(sunU, sunV);
      gu.uSunVis.value = sunVis;
      gu.uSunColor.value.copy(sunColor);
      gu.uTime.value = time;
      this.quadMesh.material = this.godRayMat;
      this.renderer.setRenderTarget(this.godRayRT);
      this.renderer.render(this.quadScene, this.orthoCam);
    }

    const cu = this.compositeMat.uniforms;
    cu.uScene.value = this.sceneRT.texture;
    cu.uBloom.value = this.bloomB.texture;
    cu.uGodRays.value = this.godRayRT.texture;
    cu.uSunUV.value.set(sunU, sunV);
    cu.uSunVis.value = sunVis;
    cu.uSunColor.value.copy(sunColor);
    cu.uSpeedFactor.value = speedFactor;
    cu.uFaceShot.value = faceShot;
    cu.uLensWet.value = lensWet;
    cu.uStormStreaks.value = stormStreaks;
    cu.uTime.value = time;
    cu.uEnablePostFX.value = enablePostFX ? 1.0 : 0.0;

    this.quadMesh.material = this.compositeMat;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.orthoCam);
  }
}
