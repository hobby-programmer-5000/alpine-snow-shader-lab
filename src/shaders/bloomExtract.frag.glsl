// ============================================================================
// Post-FX Pass 1: HDR Bloom Bright Extract (> uThresh) + 9-Tap Horizontal Blur
// ============================================================================

precision highp float;

uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uThresh;

varying vec2 vUv;

vec3 sanitizeHDR(vec3 c) {
  return vec3(
    (c.r >= 0.0 && c.r < 64.0) ? c.r : 0.0,
    (c.g >= 0.0 && c.g < 64.0) ? c.g : 0.0,
    (c.b >= 0.0 && c.b < 64.0) ? c.b : 0.0
  );
}

vec3 extractBright(vec2 uv) {
  vec3 c = sanitizeHDR(texture2D(uScene, uv).rgb);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = smoothstep(uThresh * 0.78, uThresh * 1.45, lum);
  return c * knee;
}

void main() {
  vec3 sum = extractBright(vUv) * 0.227027;
  sum += (extractBright(vUv + vec2(uTexel.x * 1.3846, 0.0)) + extractBright(vUv - vec2(uTexel.x * 1.3846, 0.0))) * 0.316216;
  sum += (extractBright(vUv + vec2(uTexel.x * 3.2307, 0.0)) + extractBright(vUv - vec2(uTexel.x * 3.2307, 0.0))) * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}
