// ============================================================================
// Post-FX Pass 2: 9-Tap Separable Vertical Gaussian Bloom Blur
// ============================================================================

precision highp float;

uniform sampler2D uBloomH;
uniform vec2 uTexel;

varying vec2 vUv;

void main() {
  vec3 sum = texture2D(uBloomH, vUv).rgb * 0.227027;
  sum += (texture2D(uBloomH, vUv + vec2(0.0, uTexel.y * 1.3846)).rgb +
          texture2D(uBloomH, vUv - vec2(0.0, uTexel.y * 1.3846)).rgb) * 0.316216;
  sum += (texture2D(uBloomH, vUv + vec2(0.0, uTexel.y * 3.2307)).rgb +
          texture2D(uBloomH, vUv - vec2(0.0, uTexel.y * 3.2307)).rgb) * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}
