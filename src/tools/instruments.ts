import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SIM } from '../config/sim';

/**
 * Procedural microsurgical instruments. Local frame of every instrument:
 *   origin = working tip, +Z = along the shaft towards the handle (out of the field),
 *   X = the axis along which jaws open. Shafts are long so they leave the field like real ones.
 */
export interface Instrument {
  group: THREE.Group;
  /** 0 = closed … 1 = fully open (jaws, blades, tines). */
  setOpen(t: number): void;
  /** Tip offset from the surface along the normal so the tip rests on tissue (mm). */
  tipClearance: number;
}

export const MATS = {
  steel: new THREE.MeshPhysicalMaterial({ color: '#c9cdd2', metalness: 0.85, roughness: 0.28, clearcoat: 0.3, envMapIntensity: 3 }),
  darkSteel: new THREE.MeshPhysicalMaterial({ color: '#8d9298', metalness: 0.8, roughness: 0.4, envMapIntensity: 2.5 }),
  coating: new THREE.MeshPhysicalMaterial({ color: '#2b3f5c', metalness: 0.1, roughness: 0.35, clearcoat: 0.8 }),
  black: new THREE.MeshPhysicalMaterial({ color: '#151719', metalness: 0.3, roughness: 0.45, clearcoat: 0.6 }),
  lens: new THREE.MeshPhysicalMaterial({ color: '#1d2f45', metalness: 0, roughness: 0.02, clearcoat: 1, transmission: 0.2 }),
  titanium: new THREE.MeshPhysicalMaterial({ color: '#b7bec8', metalness: 0.9, roughness: 0.22, envMapIntensity: 3.5, clearcoat: 0.4 }),
  gold: new THREE.MeshPhysicalMaterial({ color: '#d8b04a', metalness: 0.95, roughness: 0.25, envMapIntensity: 3.5 }),
  probeTip: new THREE.MeshPhysicalMaterial({ color: '#f2f2ee', metalness: 0, roughness: 0.3, clearcoat: 1 }),
};

const Z = new THREE.Vector3(0, 0, 1);

/** Cylinder from local point a to b. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material, seg = 20) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

function shaft(r: number, from: number, mat = MATS.steel) {
  return rod(new THREE.Vector3(0, 0, from), new THREE.Vector3(0, 0, 140), r, r * 1.6, mat);
}

/** Frazier-type suction tube with a visible lumen. */
export function suction(): Instrument {
  const g = new THREE.Group();
  const outer = new THREE.CylinderGeometry(1.0, 1.0, 140, 28, 1, true);
  outer.rotateX(Math.PI / 2).translate(0, 0, 70);
  g.add(new THREE.Mesh(outer, MATS.steel));
  const inner = new THREE.CylinderGeometry(0.72, 0.72, 6, 24, 1, true);
  inner.rotateX(Math.PI / 2).translate(0, 0, 3);
  g.add(new THREE.Mesh(inner, new THREE.MeshStandardMaterial({ color: '#0b0b0b', side: THREE.BackSide })));
  const rim = new THREE.RingGeometry(0.72, 1.0, 28);
  g.add(new THREE.Mesh(rim, MATS.steel));
  return { group: g, setOpen: () => {}, tipClearance: 0.4 };
}

/** Micro scissors: two slender, slightly curved blades on a tubular shaft. */
export function scissors(): Instrument {
  const g = new THREE.Group();
  const blades: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const geo = new THREE.BoxGeometry(0.28, 0.5, 7, 1, 1, 16);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) + 3.5; // 0 = tip … 7 = pivot
      const taper = 0.25 + 0.75 * (z / 7);
      p.setY(i, p.getY(i) * taper);
      p.setX(i, p.getX(i) + side * 0.12 + 0.18 * Math.pow(1 - z / 7, 2)); // gentle curve
      p.setZ(i, z - 7);
    }
    geo.computeVertexNormals();
    const pivot = new THREE.Group();
    pivot.position.z = 7;
    const blade = new THREE.Mesh(geo, MATS.steel);
    pivot.add(blade);
    pivot.userData.side = side;
    g.add(pivot);
    blades.push(blade);
  }
  g.add(shaft(0.55, 7));
  return {
    group: g,
    tipClearance: 0.3,
    setOpen: t => {
      g.children.forEach(c => {
        if (c.userData.side) c.rotation.y = c.userData.side * THREE.MathUtils.degToRad(11) * t;
      });
    },
  };
}

/** Bipolar forceps: two insulated tines with bare tips. */
export function bipolar(): Instrument {
  const g = new THREE.Group();
  const tines: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const t = new THREE.Group();
    t.add(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 3), 0.28, 0.4, MATS.steel));
    t.add(rod(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, 90), 0.42, 1.1, MATS.coating));
    t.userData.side = side;
    g.add(t);
    tines.push(t);
  }
  return {
    group: g,
    tipClearance: 0.35,
    setOpen: o => tines.forEach(t => {
      const gap = 0.15 + 1.1 * o;
      t.position.x = t.userData.side * gap / 2;
      t.rotation.y = -t.userData.side * Math.atan2(gap / 2, 90);
    }),
  };
}

/** Rhoton-type micro dissector: fine shaft with a small, angled round tip. */
export function dissector(): Instrument {
  const g = new THREE.Group();
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 12), MATS.steel);
  tip.scale.set(1, 0.45, 1.3);
  g.add(tip);
  g.add(rod(new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(0, 0.8, 3.5), 0.22, 0.4, MATS.steel));
  g.add(rod(new THREE.Vector3(0, 0.8, 3.5), new THREE.Vector3(0, 0.8, 140), 0.45, 1.3, MATS.steel));
  return { group: g, setOpen: () => {}, tipClearance: 0.35 };
}

/** Hand-held brain spatula (for adjusting retraction). */
export function spatula(): Instrument {
  const g = new THREE.Group();
  const geo = new RoundedBoxGeometry(5, 0.5, 90, 3, 0.22);
  geo.translate(0, 0, 44);
  g.add(new THREE.Mesh(geo, MATS.steel));
  return { group: g, setOpen: () => {}, tipClearance: 0.4 };
}

/** Thin Doppler probe with a white ceramic tip. */
export function doppler(): Instrument {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), MATS.probeTip));
  g.add(rod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 140), 0.5, 0.9, MATS.steel));
  return { group: g, setOpen: () => {}, tipClearance: 0.5 };
}

/** 2.7 mm rigid endoscope with a 30° lens. */
export function endoscope(): Instrument {
  const g = new THREE.Group();
  g.add(rod(new THREE.Vector3(0, 0, 0.4), new THREE.Vector3(0, 0, 140), 1.35, 1.6, MATS.black, 28));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(1.2, 28), MATS.lens);
  lens.rotation.x = THREE.MathUtils.degToRad(30);
  lens.position.z = 0.4;
  g.add(lens);
  return { group: g, setOpen: () => {}, tipClearance: 1.6 };
}

/** ICG: no instrument, just a small targeting reticle floating on the surface. */
export function reticle(): Instrument {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 40), new THREE.MeshBasicMaterial({ color: '#5fe0b8', transparent: true, opacity: 0.8, depthTest: false }));
  m.renderOrder = 10;
  g.add(m);
  return { group: g, setOpen: () => {}, tipClearance: 0.2 };
}

/* ------------------------------------------------------------------ clips */

export interface ClipModel {
  group: THREE.Group;
  /** Set blade gap at the tips (mm). */
  setGap(g: number): void;
  length: number;
}

/**
 * Aneurysm clip (Yasargil-type). Local frame: blades run along +X from the head (x=0) to the
 * tips (x=length); they close along Z; Y is blade width. Curved blades bend towards +Y.
 */
export function clipModel(kind: 'straight' | 'curved' | 'temporary', mat: THREE.Material): ClipModel {
  const C = kind === 'temporary' ? { ...SIM.clip, bladeLength: SIM.tempClip.bladeLength } : SIM.clip;
  const L = C.bladeLength;
  const g = new THREE.Group();
  const blades: THREE.Group[] = [];
  const bend = kind === 'curved' ? SIM.clip.curvedBend : 0;
  for (const side of [-1, 1]) {
    const geo = new THREE.BoxGeometry(L, C.bladeWidth, C.bladeThickness, 28, 1, 1);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + L / 2;
      const t = x / L;
      // rounded tip: narrow the last 15%
      const w = t > 0.85 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.85) / 0.15) ** 2)) : 1;
      let y = p.getY(i) * w;
      // curved clip: bend blades sideways (in-plane), leaving the closing plane intact
      const ang = bend * t;
      const R = bend > 0 ? L / bend : 0;
      let xx = x;
      if (bend > 0) {
        xx = (R - y) * Math.sin(ang);
        y = R - (R - y) * Math.cos(ang);
      }
      p.setXYZ(i, xx, y, p.getZ(i));
    }
    geo.computeVertexNormals();
    const pivot = new THREE.Group();
    const blade = new THREE.Mesh(geo, mat);
    blade.position.z = side * C.bladeThickness * 0.5;
    pivot.add(blade);
    pivot.userData.side = side;
    blades.push(pivot);
    g.add(pivot);
  }
  // spring coil at the head
  const coilPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * Math.PI * 2 * 2.5;
    coilPts.push(new THREE.Vector3(-1.1 + Math.cos(a) * 0.9, (i / 80 - 0.5) * 1.2, Math.sin(a) * 0.9));
  }
  const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPts), 120, 0.2, 8), mat);
  g.add(coil);
  g.add(rod(new THREE.Vector3(-0.3, 0, 0.3), new THREE.Vector3(-1.2, 0, 0.9), 0.2, 0.2, mat));
  g.add(rod(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(-1.2, 0, -0.9), 0.2, 0.2, mat));
  const setGap = (gap: number) => {
    // blades hinge at the head: tip separation = gap
    blades.forEach(b => (b.rotation.y = -b.userData.side * Math.atan2(gap / 2, L)));
  };
  setGap(C.openGap);
  g.traverse(o => ((o as THREE.Mesh).isMesh ? (o.userData.kind = 'clip') : null));
  return { group: g, setGap, length: L };
}

/** Clip applier jaws (shown holding the clip while placing). Local frame like other tools. */
export function applier(): Instrument {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    g.add(rod(new THREE.Vector3(side * 0.9, 0, 0), new THREE.Vector3(side * 1.4, 0, 12), 0.35, 0.55, MATS.darkSteel));
  }
  g.add(rod(new THREE.Vector3(0, 0, 12), new THREE.Vector3(0, 0, 140), 1.3, 2.2, MATS.darkSteel));
  return { group: g, setOpen: () => {}, tipClearance: 0 };
}

export function orientInstrument(obj: THREE.Object3D, tip: THREE.Vector3, shaftDir: THREE.Vector3, openAxis: THREE.Vector3): void {
  const z = shaftDir.clone().normalize();
  const x = openAxis.clone().projectOnPlane(z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  obj.matrix.makeBasis(x, y, z).setPosition(tip);
  obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
}

export { Z as SHAFT_AXIS };
