# Third-Party Notices

This project (`alpine-snow-shader-lab`) is an original, clean-room procedural WebGL2 / Three.js implementation. All 3D meshes, procedural PBR normal/cavity textures, GLSL shaders, Web Audio synthesis, 120 Hz Newtonian ski physics, and 20 Hz MPC AI planner are authored from scratch without third-party 3D models or audio files.

The project incorporates or depends on the following third-party open-source software libraries and open elevation datasets. Their respective licenses and attribution requirements are preserved below.

---

## 1. Runtime Dependencies

### Three.js (`three` v0.170.0)
- **Website:** <https://threejs.org/>
- **License:** MIT License
- **Copyright:** `Copyright © 2010-2024 three.js authors`

```text
The MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## 2. Development & Build Toolchain (`devDependencies`)

### Vite (`vite` v6.4.6)
- **Website:** <https://vite.dev/>
- **License:** MIT License
- **Copyright:** `Copyright (c) 2019-present, VoidZero Inc. and Vite contributors`

```text
MIT License

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### Transitive Build Dependencies (from `package-lock.json`)
| Package | Version | License | Scope |
| :--- | :--- | :--- | :--- |
| `esbuild` (and platform binaries `@esbuild/*`) | `0.25.12` | MIT | dev |
| `rollup` (and platform binaries `@rollup/rollup-*`) | `4.68.8` | MIT | dev |
| `postcss` | `8.5.33` | MIT | dev |
| `fdir` | `6.5.0` | MIT | dev |
| `fsevents` | `2.3.3` | MIT | dev (optional, macOS) |
| `nanoid` | `3.3.20` | MIT | dev |
| `picocolors` | `1.1.1` | ISC | dev |
| `picomatch` | `4.0.7` | MIT | dev |
| `source-map-js` | `1.2.4` | BSD-3-Clause | dev |
| `tinyglobby` | `0.2.17` | MIT | dev |
| `@types/estree` | `1.0.10` | MIT | dev |

*(Vite also bundles internal helper libraries under Apache-2.0, BSD-2-Clause, CC0-1.0, ISC, and MIT licenses; full notices are included in `node_modules/vite/LICENSE.md` upon installation.)*

---

## 3. Offline DEM Preprocessing Script Tools (`scripts/bake_korean_dem.py`)

The optional offline terrain baking script (`scripts/bake_korean_dem.py`) uses standard Python ecosystem libraries when regenerating DEM PNG assets:
- **NumPy** — BSD 3-Clause License (<https://numpy.org/>)
- **Pillow (PIL Fork)** — MIT-CMU License (<https://python-pillow.org/>)

---

## 4. Open Elevation Datasets (`public/dem/*`)

The pre-baked Korean alpine elevation maps (`public/dem/hallasan_dem.png`, `public/dem/hallasan_horizon.png`, `public/dem/seoraksan_dem.png`, `public/dem/seoraksan_horizon.png`, and `public/dem/dem_manifest.json`) were generated from the **AWS Open Data Registry — Terrain Tiles (Mapzen / Tilezen Terrarium)** mosaic (`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`).

- **Dataset Registry:** <https://registry.opendata.aws/terrain-tiles/>
- **Upstream Attribution Specification:** <https://github.com/tilezen/joerd/blob/master/docs/attribution.md>
- **Upstream Data Sources List:** <https://github.com/tilezen/joerd/blob/master/docs/data-sources.md>

### Regional Note for Hallasan & Seoraksan (South Korea)
For the Hallasan (33.3617° N, 126.5292° E) and Seoraksan (38.1195° N, 128.4655° E) regions in South Korea, the Mapzen/Tilezen Terrarium mosaic relies on global public-domain elevation products provided by the U.S. Geological Survey (**SRTM** and **GMTED2010**). Per `scripts/bake_korean_dem.py`, raw Terrarium elevation values were cropped to 4,096 m × 4,096 m, resampled to 512 × 512, mildly 3×3 smoothed, packed into lossless 16-bit RG channels with precomputed Max (1988) horizon angles and sky-view ambient occlusion, and are **not suitable for navigation**.

### Mapzen / Tilezen Terrain Tiles Aggregate Attribution Notice
Per `tilezen/joerd/docs/attribution.md`, the aggregate attribution block for the Terrain Tiles dataset is preserved verbatim below:

```text
* ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and
  funded under National Science Foundation awards 1043681, 1559691, and 1542736;
* Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017;
* Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM)
  Österreich;
* Canada terrain data contains information licensed under the Open Government
  Licence – Canada;
* Europe terrain data produced using Copernicus data and information funded by the
  European Union - EU-DEM layers;
* Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration
* Mexico terrain data source: INEGI, Continental relief, 2016;
* New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New
  Zealand and the New Zealand Government (All rights reserved);
* Norway terrain data © Kartverket;
* United Kingdom terrain data © Environment Agency copyright and/or database right
  2015. All rights reserved;
* United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data
  courtesy of the U.S. Geological Survey.
```

> **U.S. Government Public-Domain Notice (17 U.S.C. § 403):** Global SRTM and GMTED2010 elevation data courtesy of the U.S. Geological Survey (USGS), and ETOPO1 data produced by NOAA NCEI, are U.S. Government works not subject to domestic U.S. copyright protection and are provided "as is" without warranty. Modifications applied in this repository (cropping, resampling, smoothing, and horizon-map precomputation) are independent of and not endorsed by the USGS or NOAA.

---

## 5. Inspiration & Clean-Room Disclaimer

This project is an independent clean-room educational/research implementation inspired by public real-time WebGL alpine skiing demonstrations from Google DeepMind and Google AI Studio (see `REFERENCES.md`), as well as published computer graphics and alpine skiing physics literature. No proprietary source code, textures, audio, or 3D assets from those demonstrations are redistributed in this repository.
