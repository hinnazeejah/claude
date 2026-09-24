import { Effect, BlendFunction, EffectAttribute } from 'postprocessing';
import { Uniform } from 'three';

/**
 * Microscope field stop: a round, softly-edged field of view with a faint warm rim and slight
 * radial colour fringe, like looking down binocular eyepieces.
 */
const frag = /* glsl */ `
uniform float radius;
uniform float softness;
uniform float warmth;
uniform float focusDist;
uniform float depthFalloff;
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float d = length(p);
  float mask = 1.0 - smoothstep(radius - softness, radius, d);
  // lateral chromatic fringe towards the rim
  float edge = smoothstep(radius * 0.6, radius, d);
  vec2 dir = normalize(p + 1e-5) * edge * 0.0025;
  vec3 col = inputColor.rgb;
  col.r = texture2D(inputBuffer, uv + dir).r;
  col.b = texture2D(inputBuffer, uv - dir).b;
  // light falls off quickly into deep cisterns beyond the focal plane
  float viewZ = -perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  col *= mix(0.04, 1.0, exp(-max(0.0, viewZ - focusDist - 2.0) / depthFalloff));
  // warm tint of the halogen/xenon illumination
  col *= mix(vec3(1.0), vec3(1.05, 0.98, 0.9), warmth);
  // thin bright rim reflection of the field stop
  float rim = exp(-pow((d - radius + softness * 0.5) / (softness * 0.25), 2.0)) * 0.05;
  outputColor = vec4(col * mask + rim * vec3(1.0, 0.85, 0.7), inputColor.a);
}
`;

export class MicroscopeEffect extends Effect {
  constructor({ radius = 0.47, softness = 0.035, warmth = 1.0, focusDist = 250, depthFalloff = 7 } = {}) {
    super('MicroscopeEffect', frag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['radius', new Uniform(radius)],
        ['softness', new Uniform(softness)],
        ['warmth', new Uniform(warmth)],
        ['focusDist', new Uniform(focusDist)],
        ['depthFalloff', new Uniform(depthFalloff)],
      ]),
    });
  }
}
