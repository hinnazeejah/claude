import * as THREE from 'three';

export interface TubeOptions {
  /** Radius at start and end (mm), linearly tapered. */
  radius: [number, number];
  radialSegments?: number;
  /** Target length (mm) of each tubular segment. */
  segmentLength?: number;
  /** Pulsation amplitude as a fraction of radius → aPulse attribute. */
  pulse?: number;
  /** Pulse delay (fraction of cardiac cycle) → aDelay attribute. */
  delay?: number;
  /** Round both ends into hemispherical caps (by shrinking the radius over one radius length). */
  roundEnds?: boolean;
}

export interface Tube {
  geometry: THREE.BufferGeometry;
  curve: THREE.CatmullRomCurve3;
  length: number;
  /** Radius at arc-length fraction t (without end rounding). */
  radiusAt: (t: number) => number;
}

/**
 * Tube along a Catmull-Rom spline with a tapering radius. Unlike THREE.TubeGeometry this supports
 * variable radius, rounded ends and per-vertex pulsation attributes. uv.x = angle, uv.y = arc length (mm).
 */
export function buildTube(points: THREE.Vector3[], o: TubeOptions): Tube {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const length = curve.getLength();
  const radial = o.radialSegments ?? 24;
  const segs = Math.max(8, Math.ceil(length / (o.segmentLength ?? 0.3)));
  const frames = curve.computeFrenetFrames(segs, false);
  const radiusAt = (t: number) => o.radius[0] + (o.radius[1] - o.radius[0]) * t;

  const pos: number[] = [], nor: number[] = [], uv: number[] = [], pulse: number[] = [], delay: number[] = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    let r = radiusAt(t);
    let axial = 0; // normal tilt towards the axis on the rounded caps
    if (o.roundEnds) {
      const s = t * length, L = r;
      const d = Math.min(s, length - s);
      if (d < L) {
        const k = 1 - d / L;
        r *= Math.sqrt(Math.max(0.0025, 1 - k * k));
        axial = (s < length / 2 ? -1 : 1) * k;
      }
    }
    const T = frames.tangents[i], Nf = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      N.copy(Nf).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r);
      const n = N.clone().multiplyScalar(Math.sqrt(1 - axial * axial)).addScaledVector(T, axial).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(j / radial, t * length);
      pulse.push(r * (o.pulse ?? 0));
      delay.push(o.delay ?? 0);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aPulse', new THREE.Float32BufferAttribute(pulse, 1));
  g.setAttribute('aDelay', new THREE.Float32BufferAttribute(delay, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geometry: g, curve, length, radiusAt };
}
