varying vec3 vWorldDir;

void main() {
  vWorldDir = normalize(position);
  vec4 clip = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = clip.xyww;
}
