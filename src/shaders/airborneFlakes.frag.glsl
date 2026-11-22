// ============================================================================
// Airborne Snowflakes & Prismatic HDR Diamond-Dust Fragment Shader
// ============================================================================

precision highp float;

uniform vec3 uSunColor;
uniform vec3 uSkyHorizon;

varying float vKind;
varying float vSeed;
varying float vTwinkle;
varying float vFade;

void main() {
  if (vFade < 0.015) discard;

  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float r = length(uv);
  if (r > 1.0) discard;

  if (vKind > 0.5) {
    // Delicate prismatic HDR diamond-dust ice mote (fires Bloom subtly on twinkle!)
    float core = exp(-r * r * 7.5);
    float crossSpark = (exp(-abs(uv.x) * 8.0) * exp(-abs(uv.y) * 2.0) +
                        exp(-abs(uv.y) * 8.0) * exp(-abs(uv.x) * 2.0)) * 0.35;
    vec3 prism = mix(vec3(0.78, 0.94, 1.0), vec3(1.0, 0.92, 0.78), fract(vSeed * 13.7));
    vec3 col = prism * uSunColor * (1.2 + vTwinkle * 3.2);
    float alpha = (core + crossSpark * vTwinkle) * vFade * (0.32 + vTwinkle * 0.68);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(col, alpha);
  } else {
    // Soft out-of-focus drifting alpine snowflake
    float disc = smoothstep(1.0, 0.15, r);
    vec3 col = mix(uSkyHorizon * 0.95, vec3(0.96, 0.98, 1.0), 0.72);
    gl_FragColor = vec4(col, disc * vFade * 0.56);
  }
}
