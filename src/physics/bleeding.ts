import * as THREE from 'three';
import { SIM } from '../config/sim';
import { ANATOMY } from '../config/anatomy';
import { state } from '../core/state';
import { bus } from '../core/events';
import { arterialPulse } from '../core/pulse';
import { enhance, wetMaterial } from '../anatomy/shaders';
import type { AneurysmShape } from '../anatomy/aneurysm';
import type { FlowMap } from './flow';

interface Source {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  mlPerS: number;
  arterial: boolean;
}

const MAX_P = 2400;

/**
 * BLEEDING
 *  - Sources: oozing points (small vessels, pia), arterial injuries and an intraoperative rupture.
 *    Rates scale with arterial pressure and with the flow reaching that vessel, so a temporary
 *    clip visibly slows a rupture and a correct clip across the neck stops it.
 *  - Droplet particles show where the blood comes from (pulsatile jets for arterial sources).
 *  - Blood not removed by suction collects as a pool whose surface rises against gravity and
 *    floods the deep field first.
 */
export class Bleeding {
  group = new THREE.Group();
  /** Blood lying in the field (ml). */
  volume = 0;
  /** Current total inflow (ml/s). */
  rate = 0;
  private g = new THREE.Vector3(...SIM.bleed.gravity).normalize();
  private base: THREE.Vector3;
  private pool: THREE.Mesh;
  private points: THREE.Points;
  private pos = new Float32Array(MAX_P * 3);
  private vel = new Float32Array(MAX_P * 3);
  private life = new Float32Array(MAX_P);
  private size = new Float32Array(MAX_P);
  private head = 0;
  private emitAcc = 0;
  private rupture: { point: THREE.Vector3; normal: THREE.Vector3 } | null = null;
  private uniforms = { uScale: { value: 400 } };

  constructor(private shape: AneurysmShape) {
    this.group.name = 'bleeding';
    // pool: a glossy dark-red surface perpendicular to gravity
    this.base = new THREE.Vector3(...ANATOMY.microscope.target).addScaledVector(this.g, 13);
    const mat = enhance(
      wetMaterial('#4d0507', { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.9, sheen: 0 }),
      { pattern: 'blood', detailA: '#2a0203', bump: 0.35 },
    );
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(48, 72), mat);
    this.pool.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.g.clone().negate());
    this.pool.visible = false;
    this.pool.userData.kind = 'blood';
    this.pool.renderOrder = 1;
    this.group.add(this.pool);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(this.base, 80);
    const pmat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uScale; attribute float aLife; attribute float aSize; varying float vLife;
        void main() {
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aLife > 0.0 ? aSize * uScale / -mv.z : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        void main() {
          vec2 c = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(c, c);
          if (r2 > 1.0 || vLife <= 0.0) discard;
          vec3 n = vec3(c, sqrt(1.0 - r2));
          float lit = 0.35 + 0.65 * max(0.0, dot(n, normalize(vec3(-0.3, 0.5, 0.8))));
          float spec = pow(max(0.0, dot(n, normalize(vec3(-0.2, 0.3, 1.0)))), 40.0);
          vec3 col = mix(vec3(0.16, 0.0, 0.0), vec3(0.62, 0.03, 0.04), lit) + spec * 0.6;
          gl_FragColor = vec4(col, min(1.0, vLife * 3.0) * 0.95);
        }`,
    });
    this.points = new THREE.Points(geo, pmat);
    this.points.frustumCulled = false;
    this.points.userData.noPick = true;
    this.group.add(this.points);

    bus.on('rupture', ({ point }) => {
      const p = point ?? this.shape.blebCenter.clone();
      this.rupture = { point: p, normal: p.clone().sub(this.shape.domeCenter).normalize() };
    });
    bus.on('suction', ({ point, dt }) => this.suction(point, dt));
  }

  get poolLevelMm(): number {
    return Math.min(SIM.bleed.maxPoolMm, this.volume * SIM.bleed.mmPerMl);
  }

  private sources(map: number, flow: FlowMap): Source[] {
    const B = SIM.bleed;
    const p = map / SIM.vitals.baseMap;
    const eye = new THREE.Vector3(...ANATOMY.microscope.eyeDir).normalize();
    const out: Source[] = [];
    for (const inj of state.injuries) {
      if (inj.stopped) continue;
      const f = (flow as Record<string, number>)[inj.structure] ?? 1;
      const ml = inj.kind === 'arterial' ? B.arterialMlPerS * f * p : B.oozeMlPerS * (inj.rate / 0.3) * p;
      out.push({ point: inj.point, normal: eye, mlPerS: ml, arterial: inj.kind === 'arterial' });
    }
    if (this.rupture) {
      out.push({ ...this.rupture, mlPerS: B.ruptureMlPerS * flow.aneurysm * p, arterial: true });
    }
    return out;
  }

  /** Suction removes pooled blood when the tip is in (or just above) the pool, and droplets near it. */
  suction(tip: THREE.Vector3, dt: number): void {
    const surface = this.base.clone().addScaledVector(this.g, -this.poolLevelMm);
    const above = tip.clone().sub(surface).dot(this.g.clone().negate());
    if (this.volume > 0 && above < 2.0) this.volume = Math.max(0, this.volume - SIM.bleed.suctionMlPerS * dt);
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) continue;
      const dx = this.pos[3 * i] - tip.x, dy = this.pos[3 * i + 1] - tip.y, dz = this.pos[3 * i + 2] - tip.z;
      if (dx * dx + dy * dy + dz * dz < 9) this.life[i] = 0;
    }
  }

  update(dt: number, map: number, flow: FlowMap, heartPhase: number, camera: THREE.PerspectiveCamera, viewH: number): void {
    const src = this.sources(map, flow);
    this.rate = src.reduce((s, x) => s + x.mlPerS, 0);
    this.volume = Math.max(0, this.volume + (this.rate - SIM.bleed.drainMlPerS) * dt);
    if (this.rupture && flow.aneurysm === 0 && state.clips.length) {
      // sealed by the clip
      this.rupture = null;
      bus.emit('notice', { key: 'nBleedingControlled', level: 'info' });
    }

    // pool surface
    const h = this.poolLevelMm;
    this.pool.visible = h > 0.05;
    this.pool.position.copy(this.base).addScaledVector(this.g, -h);
    (this.pool.material as THREE.MeshPhysicalMaterial).opacity = 0.55 + 0.4 * THREE.MathUtils.smoothstep(h, 0, 3);

    // emit droplets
    const pulse = arterialPulse(heartPhase);
    for (const s of src) {
      this.emitAcc += s.mlPerS * dt * (s.arterial ? 120 : 60);
      while (this.emitAcc >= 1) {
        this.emitAcc -= 1;
        const i = this.head;
        this.head = (this.head + 1) % MAX_P;
        const speed = s.arterial ? 14 + 40 * pulse * Math.min(1, s.mlPerS) : 1.5 + Math.random() * 2;
        const spread = s.arterial ? 0.35 : 0.9;
        const v = s.normal.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread)).normalize().multiplyScalar(speed);
        this.pos.set([s.point.x, s.point.y, s.point.z], 3 * i);
        this.vel.set([v.x, v.y, v.z], 3 * i);
        this.life[i] = s.arterial ? 0.5 + Math.random() * 0.5 : 0.8 + Math.random() * 1.2;
        this.size[i] = (s.arterial ? 0.35 : 0.25) + Math.random() * 0.3;
      }
    }
    // integrate
    const acc = this.g.clone().multiplyScalar(140);
    for (let i = 0; i < MAX_P; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[3 * i] += acc.x * dt; this.vel[3 * i + 1] += acc.y * dt; this.vel[3 * i + 2] += acc.z * dt;
      const drag = Math.exp(-dt * 2.5);
      this.vel[3 * i] *= drag; this.vel[3 * i + 1] *= drag; this.vel[3 * i + 2] *= drag;
      this.pos[3 * i] += this.vel[3 * i] * dt; this.pos[3 * i + 1] += this.vel[3 * i + 1] * dt; this.pos[3 * i + 2] += this.vel[3 * i + 2] * dt;
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aLife.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    this.uniforms.uScale.value = (viewH * camera.projectionMatrix.elements[5]) / 2;
  }
}
