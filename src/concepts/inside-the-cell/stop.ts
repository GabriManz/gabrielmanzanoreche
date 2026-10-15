import * as THREE from 'three';

export interface Anchor {
  id: string;
  label: string;
  pos: THREE.Vector3;       // world position
  dx: number; dy: number;   // label offset in px (desktop)
  mobile?: boolean;         // show on small screens
}

/** One scale stop: its own scene + camera rig. */
export interface Stop {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Rest pose. */
  camPos: THREE.Vector3;
  camLook: THREE.Vector3;
  /** Point the camera dives into when going one scale deeper. */
  diveTarget: THREE.Vector3;
  /** Scale bar: world length, label and the point where it is measured. */
  scale: { length: number; label: string; at: THREE.Vector3 };
  anchors: Anchor[];
  /** If set, anchor positions are local to this object (follows its animation). */
  root?: THREE.Object3D;
  update(t: number, dt: number, active: boolean): void;
  resize?(w: number, h: number, mobile: boolean): void;
}

export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeInCubic = (x: number) => x * x * x;
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
