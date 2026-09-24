import * as THREE from 'three';
import { PULSE_GLSL } from '../core/pulse';

/** Uniforms shared by every tissue material (one object, updated once per frame). */
export const sharedUniforms = {
  uHeartPhase: { value: 0 },
  uTime: { value: 0 },
  /** 0 = normal white light, 1 = ICG near-infrared fluorescence view (used from M5). */
  uIcg: { value: 0 },
};

// 3D simplex noise — Ashima Arts / Stefan Gustavson (MIT).
export const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const BUMP_GLSL = /* glsl */ `
vec3 bumpNormal(vec3 surfPos, vec3 surfNorm, float h, float scale) {
  vec3 sx = dFdx(surfPos); vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm); vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h)) * scale;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

/** Surface pattern presets (GLSL that sets `col` and `hgt` from object-space `p`). */
export const PATTERNS = {
  /** Cortex: pink-cream pia with fine red arterioles and bluish venules. */
  brain: /* glsl */ `
    // domain-warped ridges give branching, meandering pial vessels; low-frequency masks keep
    // them sparse. fwidth() anti-aliases the thin lines at low magnification.
    vec3 w = vec3(snoise(p * 0.05), snoise(p * 0.05 + 5.2), snoise(p * 0.05 + 9.7)) * 2.2;
    float n1 = snoise(p * 0.07);
    float n2 = snoise(p * 0.9) * 0.5 + 0.5;
    float r1 = 1.0 - abs(snoise(p * 0.14 + w));
    float r2 = 1.0 - abs(snoise(p * 0.38 + w * 1.7 + 3.3));
    float r3 = 1.0 - abs(snoise(p * 0.075 + 11.0 + w * 0.5));
    float a1 = smoothstep(0.955 - fwidth(r1), 0.985, r1) * smoothstep(-0.35, 0.25, snoise(p * 0.035 + 2.0));
    float a2 = smoothstep(0.965 - fwidth(r2), 0.99, r2) * smoothstep(0.05, 0.55, snoise(p * 0.08 + 7.0));
    float ven = smoothstep(0.972 - fwidth(r3), 0.992, r3) * smoothstep(-0.2, 0.4, snoise(p * 0.03 + 4.0));
    col *= 0.9 + 0.12 * n1 + 0.05 * n2;
    col = mix(col, uDetailA, clamp(a1 + a2 * 0.75, 0.0, 1.0) * 0.85);
    col = mix(col, uDetailB, ven * 0.8);
    hgt = a1 * 0.7 + a2 * 0.35 + ven * 0.9 + n2 * 0.06;
  `,
  /** Arterial wall: faint mottling and vasa vasorum on large vessels. */
  artery: /* glsl */ `
    float n1 = snoise(p * 0.5);
    float rv = 1.0 - abs(snoise(p * 0.6 + 5.0));
    float vv = smoothstep(0.96 - fwidth(rv), 0.99, rv) * smoothstep(0.0, 0.5, snoise(p * 0.2));
    col *= 0.95 + 0.08 * n1;
    col = mix(col, uDetailA, vv * 0.35);
    hgt = vv * 0.2 + n1 * 0.04;
  `,
  /** Aneurysm sac: thin reddish wall with yellow atheromatous patches; the bleb is darker. */
  aneurysm: /* glsl */ `
    float n1 = snoise(p * 0.8);
    float ath = smoothstep(0.5, 0.85, snoise(p * 0.3 + 2.0));
    col *= 0.9 + 0.12 * n1;
    col = mix(col, uDetailB, ath * 0.35);
    col = mix(col, uDetailA, vThin * 0.85);
    hgt = n1 * 0.06 + ath * 0.08;
  `,
  /** Nerve: creamy white with longitudinal fascicle striations (uses tube uv when present). */
  nerve: /* glsl */ `
    float n1 = snoise(p * 0.6);
    float stri = 0.5 + 0.5 * sin(vUvDetail.x * 113.0 + n1 * 2.0);
    float rc = 1.0 - abs(snoise(p * 0.5 + 9.0 + snoise(p * 0.1) * 1.5));
    float cap = smoothstep(0.96 - fwidth(rc), 0.99, rc) * smoothstep(0.0, 0.5, snoise(p * 0.15 + 3.0));
    col *= 0.93 + 0.06 * n1 + 0.04 * stri;
    col = mix(col, uDetailA, cap * 0.45);
    hgt = stri * 0.04 + cap * 0.1;
  `,
  /** Dura / tentorium: grey-white fibrous sheet. */
  dura: /* glsl */ `
    float n1 = snoise(p * 0.25);
    float fib = 0.5 + 0.5 * sin(p.x * 3.0 + snoise(p * 0.4) * 6.0);
    float rv = 1.0 - abs(snoise(p * 0.12 + 1.0 + snoise(p * 0.04) * 2.0));
    float v = smoothstep(0.965 - fwidth(rv), 0.99, rv);
    col *= 0.9 + 0.1 * n1 + 0.05 * fib;
    col = mix(col, uDetailA, v * 0.45);
    hgt = fib * 0.03 + v * 0.1;
  `,
  none: /* glsl */ ``,
} as const;

export interface EnhanceOptions {
  pattern: keyof typeof PATTERNS;
  detailA?: THREE.ColorRepresentation;
  detailB?: THREE.ColorRepresentation;
  bump?: number;
  /** Uniform pulsation (mm) when the geometry has no aPulse attribute. */
  pulseMm?: number;
  /** Geometry supplies per-vertex aPulse (mm) and aDelay (cycle fraction). */
  pulseAttr?: boolean;
  /** Geometry supplies per-vertex aThin (0..1) for the aneurysm wall. */
  thinAttr?: boolean;
}

/**
 * Inject pulsation, procedural surface detail and a bump normal into a MeshPhysicalMaterial.
 * Geometry stays CPU-exact (important for picking); only the tiny pulsation is done on the GPU.
 */
export function enhance<M extends THREE.MeshPhysicalMaterial>(mat: M, o: EnhanceOptions): M {
  const uniforms = {
    uDetailA: { value: new THREE.Color(o.detailA ?? '#9b1f1f') },
    uDetailB: { value: new THREE.Color(o.detailB ?? '#5a3a6a') },
    uBump: { value: o.bump ?? 0.6 },
    uPulseMm: { value: o.pulseMm ?? 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, sharedUniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uHeartPhase; uniform float uPulseMm;
        varying vec3 vObjPos; varying vec2 vUvDetail; varying float vThin;
        ${o.pulseAttr ? 'attribute float aPulse; attribute float aDelay;' : ''}
        ${o.thinAttr ? 'attribute float aThin;' : ''}
        ${PULSE_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${o.pulseAttr
          ? 'transformed += objectNormal * aPulse * arterialPulse(uHeartPhase - aDelay);'
          : 'transformed += objectNormal * uPulseMm * arterialPulse(uHeartPhase - 0.1);'}
        vObjPos = position;
        #ifdef USE_UV
          vUvDetail = uv;
        #else
          vUvDetail = vec2(0.0);
        #endif
        vThin = ${o.thinAttr ? 'aThin' : '0.0'};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uDetailA; uniform vec3 uDetailB; uniform float uBump; uniform float uIcg;
        varying vec3 vObjPos; varying vec2 vUvDetail; varying float vThin;
        float gHgt = 0.0;
        ${NOISE_GLSL}
        ${BUMP_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 p = vObjPos; vec3 col = diffuseColor.rgb; float hgt = 0.0;
          ${PATTERNS[o.pattern]}
          diffuseColor.rgb = col; gHgt = hgt;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = bumpNormal(-vViewPosition, normal, gHgt, uBump);`,
      );
  };
  // Separate program cache per pattern / feature set.
  mat.customProgramCacheKey = () => `enh-${o.pattern}-${!!o.pulseAttr}-${!!o.thinAttr}`;
  return mat;
}

/** Wet tissue base material: diffuse body with a glossy clearcoat film (CSF / saline). */
export function wetMaterial(color: THREE.ColorRepresentation, extra: THREE.MeshPhysicalMaterialParameters = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    sheen: 0.3,
    sheenColor: new THREE.Color('#ffd9cc'),
    sheenRoughness: 0.5,
    ...extra,
  });
}
