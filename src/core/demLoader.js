// ============================================================================
// Real Korean Mountain DEM Loader (Hallasan & Seoraksan — AWS Mapzen Terrarium)
// Decodes lossless 16-bit RG elevation + AO + 3-dir Northern-Hemisphere Horizon PNGs
// into exact CPU Float32Array + GPU NearestFilter DataTexture (ZERO contour spikes!).
// ============================================================================

import * as THREE from 'three';

function loadImageRGBA(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      resolve({ width: img.width, height: img.height, data: new Uint8Array(data.buffer) });
    };
    img.onerror = () => reject(new Error(`Failed to load DEM image: ${url}`));
    img.src = url;
  });
}

export class KoreanDemLibrary {
  constructor() {
    this.manifest = null;
    this.cache = new Map();
    this.dummyTex = this._makeDummyTexture();
  }

  _makeDummyTexture() {
    const data = new Uint8Array([0, 0, 255, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.flipY = false;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  async ensureManifest() {
    if (this.manifest) return this.manifest;
    const res = await fetch('/dem/dem_manifest.json');
    if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
    this.manifest = await res.json();
    return this.manifest;
  }

  async loadMountain(id) {
    if (this.cache.has(id)) return this.cache.get(id);

    const manifest = await this.ensureManifest();
    const meta = manifest.mountains[id];
    if (!meta) throw new Error(`Unknown mountain DEM: ${id}`);

    const [demImg, horImg] = await Promise.all([
      loadImageRGBA(meta.demUrl),
      loadImageRGBA(meta.horizonUrl)
    ]);

    const size = demImg.width;
    const elevGrid = new Float32Array(size * size);
    const maxElev = meta.maxElev;

    for (let i = 0; i < size * size; i++) {
      const o = i * 4;
      const elev16 = demImg.data[o] * 256 + demImg.data[o + 1];
      elevGrid[i] = (elev16 / 65535.0) * maxElev;
    }

    // Strict NearestFilter on 16-bit RG DEM so GLSL manual 4-tap bilinear has 0 contour spikes!
    const demTex = new THREE.DataTexture(demImg.data, size, size, THREE.RGBAFormat);
    demTex.flipY = false;
    demTex.minFilter = THREE.NearestFilter;
    demTex.magFilter = THREE.NearestFilter;
    demTex.wrapS = THREE.ClampToEdgeWrapping;
    demTex.wrapT = THREE.ClampToEdgeWrapping;
    demTex.needsUpdate = true;

    // LinearFilter is ideal for smooth precomputed Max (1988) horizon angles
    const horizonTex = new THREE.DataTexture(horImg.data, horImg.width, horImg.height, THREE.RGBAFormat);
    horizonTex.flipY = false;
    horizonTex.minFilter = THREE.LinearFilter;
    horizonTex.magFilter = THREE.LinearFilter;
    horizonTex.wrapS = THREE.ClampToEdgeWrapping;
    horizonTex.wrapT = THREE.ClampToEdgeWrapping;
    horizonTex.needsUpdate = true;

    const record = {
      id,
      meta,
      size,
      span: meta.spanMeters,
      maxElev,
      elevGrid,
      demTex,
      horizonTex,
      attribution: manifest.attribution
    };
    this.cache.set(id, record);
    return record;
  }
}
