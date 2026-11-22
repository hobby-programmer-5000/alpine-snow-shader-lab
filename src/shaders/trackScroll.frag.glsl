// ============================================================================
// Pass 1: World-Locked Ping-Pong FBO Scroll & Optional Wind Snow-Fill Decay
// Exact integer texel shift guarantees ZERO sub-texel bilinear smearing!
// Channels: R = Trench Depth, G = Flanking Berm Height, B = Compacted Ice Glint, A = Freshness
// ============================================================================

precision highp float;

uniform sampler2D uPrev;
uniform vec2 uShiftTexels; // Exact integer texel delta: (newOrigin - prevOrigin) / texelWorld
uniform float uTrackRes;   // 1024.0
uniform float uDecay;      // Wind snow-fill decay per frame (0.0 = permanent tracks)

void main() {
  // Exact source texel center prevents repeated resampling blur
  vec2 srcPx = floor(gl_FragCoord.xy) + uShiftTexels;

  // Border regions scrolled in from outside the previous FBO start pristine (0.0)
  if (srcPx.x < 0.0 || srcPx.x >= uTrackRes || srcPx.y < 0.0 || srcPx.y >= uTrackRes) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 srcUv = (srcPx + 0.5) / uTrackRes;
  vec4 prev = texture2D(uPrev, srcUv);

  // Smooth wind-blown snow refill decay (berms soften slightly faster than deep trenches)
  float keepTrench = max(0.0, 1.0 - uDecay * 0.0022);
  float keepBerm   = max(0.0, 1.0 - uDecay * 0.0032);
  float keepIce    = max(0.0, 1.0 - uDecay * 0.0040);

  gl_FragColor = vec4(
    prev.r * keepTrench,
    prev.g * keepBerm,
    prev.b * keepIce,
    prev.a * keepTrench
  );
}
