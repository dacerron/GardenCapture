precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform bool  uHasBaseColorMap;
uniform sampler2D uBaseColorMap;
uniform vec3  uColor;
uniform float uTime;

void main() {
  vec3 base = uHasBaseColorMap
    ? texture(uBaseColorMap, vUv).rgb
    : uColor;

  float pulse = 0.5 + 0.5 * sin(uTime * 2.0);
  outColor = vec4(base * (0.75 + 0.25 * pulse), 1.0);
}
