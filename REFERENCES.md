# References & Technical Citations

This document catalogs every external demonstration, open dataset, computer graphics paper, and skiing/avalanche physics publication referenced during the architecture, shader design, biomechanics modeling, and AI controller tuning of **Alpine Photoreal Ski Race & Custom Shader Lab**.

---

## 1. Architecture-to-Reference Mapping

### 1.1 Inspiration & Benchmark Demonstrations
- Zero-asset procedural alpine ski shader design and WebGL2 freeride showcase inspiration (Google AI Studio, 2026; Google DeepMind, 2026).

### 1.2 Terrain Geometry, Real DEM Data & Shadowing
- Nested regular-grid terrain clipmaps (`src/geometry/clipmapTerrain.js`, `src/shaders/terrain.vert.glsl`) follow GPU-friendly geometry clipmap principles (Asirvatham & Hoppe, 2005; Losasso & Hoppe, 2004).
- Real Hallasan and Seoraksan elevation tiles (`scripts/bake_korean_dem.py`, `src/core/demLoader.js`) are baked from AWS Open Data / Mapzen Terrarium elevation tiles (AWS Open Data Registry & Tilezen, 2017).
- Macro mountain self-shadowing (`public/dem/*_horizon.png`, `src/shaders/terrain.frag.glsl`) and real-time snow-trench horizon marching implement precomputed horizon mapping (Max, 1988).

### 1.3 Deformable Snow, Glints, Subsurface Scattering & Atmosphere
- Dual-resolution toroidal FBO heightfield stamping for persistent ski trenches, flanking berms, V-skate marks, and pole dimples (`src/core/trackFboSystem.js`, `src/shaders/trackStamp.frag.glsl`, `src/shaders/trackScroll.frag.glsl`) draws on deformable snow heightfield buffer techniques (Barré-Brisebois, 2014).
- View-dependent snow subsurface translucency (`src/shaders/terrain.frag.glsl`) builds on fast wrap/translucency subsurface scattering approximations (Barré-Brisebois & Bouchard, 2011).
- Multi-scale snow crystal micro-glints and procedural PBR surface detail (`src/core/proceduralPbrTextures.js`, `src/shaders/terrain.frag.glsl`) draw on high-resolution glint rendering and procedural microfacet glint BRDFs (Chermain et al., 2020; Yan et al., 2014).
- Physically inspired Rayleigh/Mie aerial perspective, sun-disc scattering, and altitude-dependent valley mist (`src/shaders/terrain.frag.glsl`, `src/shaders/sky.frag.glsl`, `src/shaders/valleyClouds.frag.glsl`) draw on precomputed and production sky-atmosphere scattering models and real-time volumetric cloudscapes (Bruneton & Neyret, 2008; Hillaire, 2020; Schneider & Vos, 2015).

### 1.4 HDR Post-Processing & Anti-Aliasing
- Half-resolution radial screen-space god-rays (`src/shaders/godRay.frag.glsl`, `src/core/postFxPipeline.js`) implement screen-space volumetric light scattering (Mitchell, 2007).
- Karis-weighted/energy-safe HDR bloom extraction and multi-pass blur (`src/shaders/bloomExtract.frag.glsl`, `src/shaders/bloomBlurV.frag.glsl`, `src/core/postFxPipeline.js`) follow modern anti-flicker HDR post-processing bloom principles (Jimenez, 2014).
- HDR-to-SDR filmic tone mapping and directional luma FXAA (`src/shaders/postComposite.frag.glsl`) use the fitted ACES filmic curve (Narkowicz, 2016) and Fast Approximate Anti-Aliasing (Lottes, 2011).

### 1.5 120 Hz Alpine Ski Physics, Biomechanics & Avalanche Dynamics
- Parabolic sidecut carving radius, inclined-slope gravity decomposition, kinetic snow friction, and tuck aerodynamic drag (`src/core/skierController.js`) follow classical alpine skiing mechanics (Lind & Sanders, 2004).
- Slope-coupled slab avalanche surge pacing (`src/core/avalancheSystem.js`) is modeled on classical Voellmy avalanche flow dynamics (Voellmy, 1955).

---

## References

- Asirvatham, A., & Hoppe, H. (2005). Terrain rendering using GPU-based geometry clipmaps. In M. Pharr (Ed.), *GPU Gems 2* (Chapter 2). Addison-Wesley / NVIDIA. https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry
- AWS Open Data Registry & Tilezen. (2017). *Terrain Tiles (Mapzen Terrarium global elevation dataset)* [Dataset]. Amazon Web Services Open Data Registry. https://registry.opendata.aws/terrain-tiles/ (Attribution & data sources: https://github.com/tilezen/joerd/blob/master/docs/attribution.md and https://github.com/tilezen/joerd/blob/master/docs/data-sources.md)
- Barré-Brisebois, C. (2014). *Deformable snow rendering in Batman: Arkham Origins* [Conference presentation]. Game Developers Conference (GDC 2014). https://www.gdcvault.com/play/1020177/Deformable-Snow-Rendering-in-Batman
- Barré-Brisebois, C., & Bouchard, M. (2011). *Approximating translucency for a fast, cheap and convincing subsurface scattering look* [Conference presentation]. Game Developers Conference (GDC 2011). https://colinbarrebrisebois.com/2011/03/07/gdc-2011-approximating-translucency-for-a-fast-cheap-and-convincing-subsurface-scattering-look/
- Bruneton, E., & Neyret, F. (2008). Precomputed atmospheric scattering. *Computer Graphics Forum*, *27*(4), 1079–1086. https://doi.org/10.1111/j.1467-8659.2008.01245.x
- Chermain, X., Sauvage, B., Dischler, J.-M., & Dachsbacher, C. (2020). Procedural physically based BRDF for real-time rendering of glints. *Computer Graphics Forum*, *39*(7), 243–253. https://doi.org/10.1111/cgf.14141
- Google AI Studio. (2026). *Chamonix Ski Sim* [WebGL interactive application]. https://aistudio.google.com/apps/bundled/chamonix_ski_sim
- Google DeepMind. (2026). *Mont Blanc freeride ski simulator built with custom shaders and zero pre-made 3D models* [Post]. X. https://x.com/GoogleDeepMind/status/2123826572385833119
- Hillaire, S. (2020). A scalable and production ready sky and atmosphere rendering technique. *Computer Graphics Forum*, *39*(4), 13–22. https://doi.org/10.1111/cgf.14050
- Jimenez, J. (2014). *Next generation post processing in Call of Duty: Advanced Warfare* [Course presentation]. ACM SIGGRAPH 2014 Advances in Real-Time Rendering in Games. https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/
- Lind, D. A., & Sanders, S. P. (2004). *The physics of skiing: Skiing at the triple point* (2nd ed.). Springer New York. https://doi.org/10.1007/978-1-4757-4345-6
- Losasso, F., & Hoppe, H. (2004). Geometry clipmaps: Terrain rendering using nested regular grids. *ACM Transactions on Graphics*, *23*(3), 769–776. https://doi.org/10.1145/1015706.1015799
- Lottes, T. (2011). *FXAA* [White paper; cover dated February 2009, PDF metadata February 2011]. NVIDIA. https://developer.download.nvidia.com/assets/gamedev/files/sdk/11/FXAA_WhitePaper.pdf
- Max, N. L. (1988). Horizon mapping: Shadows for bump-mapped surfaces. *The Visual Computer*, *4*(2), 109–117. https://doi.org/10.1007/BF01905562
- Mitchell, K. (2007). Volumetric light scattering as a post-process. In H. Nguyen (Ed.), *GPU Gems 3* (Chapter 13). Addison-Wesley / NVIDIA. https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process
- Narkowicz, K. (2016). *ACES filmic tone mapping curve* [Blog post, January 6, 2016]. Krzysztof Narkowicz Graphics Blog. https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
- Schneider, A., & Vos, N. (2015). *The real-time volumetric cloudscapes of Horizon: Zero Dawn* [Course presentation]. ACM SIGGRAPH 2015 Advances in Real-Time Rendering in Games. https://advances.realtimerendering.com/s2015/
- Voellmy, A. (1955). Über die Zerstörungskraft von Lawinen. *Schweizerische Bauzeitung*, *73*(15), 159–162 (and subsequent parts in issues 17, 19, and 20, pp. 212–217, 246–249, 280–285). https://doi.org/10.5169/seals-61891
- Yan, L.-Q., Hašan, M., Jakob, W., Lawrence, J., Marschner, S., & Ramamoorthi, R. (2014). Rendering glints on high-resolution normal-mapped specular surfaces. *ACM Transactions on Graphics*, *33*(4), 1–9. https://doi.org/10.1145/2601097.2601155
