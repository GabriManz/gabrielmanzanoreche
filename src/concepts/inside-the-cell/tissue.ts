import * as THREE from 'three';
import { rng } from '../../shared/env';
import { GLSL_FIRE, GLSL_STAIN, VOID, makeDust } from './fx';
import type { Stop } from './stop';

/** Stop 1 — a branching field of cardiomyocytes beating together. 1 unit ≈ 10 µm. */
export function createTissue(mobile: boolean, reduced: boolean): Stop {
  const scene = new THREE.Scene();
  scene.background = VOID;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  const r = rng(11);

  // ---- instance layout: parallel fibres in layers, brick-offset, with branches
  type Inst = { p: THREE.Vector3; ang: number; len: number; tilt: number };
  const list: Inst[] = [];
  const rows = mobile ? 7 : 9, layers = 3;
  for (let L = 0; L < layers; L++) {
    for (let j = 0; j < rows; j++) {
      const y = (j - (rows - 1) / 2) * 2.5 + (r() - 0.5) * 0.4;
      const z = -L * 3.4 + (r() - 0.5) * 0.6;
      let x = -40 + r() * 8;
      const wave = (r() - 0.5) * 0.08;
      while (x < 38) {
        const len = 8.5 + r() * 3.5;
        list.push({ p: new THREE.Vector3(x + len / 2, y + Math.sin(x * 0.05) * 0.6, z), ang: wave + (r() - 0.5) * 0.05, len, tilt: (r() - 0.5) * 0.1 });
        // occasional branch bridging to the next row
        if (r() < 0.16 && j < rows - 1) {
          const s = r() < 0.5 ? 1 : -1;
          list.push({ p: new THREE.Vector3(x + len * 0.8, y + 1.05, z), ang: s * 0.42, len: 5.5, tilt: 0 });
        }
        x += len + 0.25 + r() * 0.3;
      }
    }
  }
  // the focus cell at the origin (dive target)
  list.push({ p: new THREE.Vector3(0.5, 0.2, 2.2), ang: 0.02, len: 10, tilt: 0 });

  const geo = new THREE.CapsuleGeometry(1, 8, mobile ? 5 : 7, mobile ? 12 : 16);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMotion: { value: reduced ? 0 : 1 }, uFocus: { value: 30 } },
    vertexShader: /* glsl */ `
      attribute float aRand; attribute float aLen; attribute float aFocus;
      uniform float uTime, uMotion;
      varying vec3 vN; varying vec3 vV; varying vec3 vLocal; varying float vCa; varying float vRand; varying float vDepth; varying float vFocus;
      float transient(float t) { // Ca²⁺ transient: fast rise, slow decay (shape only)
        return t < 0.0 ? 0.0 : (1.0 - exp(-t / 0.05)) * exp(-t / 0.42);
      }
      void main() {
        vec3 p = position;
        // stretch the capsule's cylinder to this instance's length
        float hl = aLen * 0.5 - 1.0;
        p.y = sign(p.y) * (max(abs(p.y) - 4.0, 0.0) * 0.45 + hl * min(abs(p.y), 4.0) / 4.0); // blunt, disc-like ends
        vec4 origin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float period = 1.9;
        float delay = (origin.x + 40.0) / 80.0 * 0.32 + (p.y / aLen) * 0.05;
        float ph = mod(uTime - delay, period);
        float ca = transient(ph);
        float con = transient(ph - 0.09) * uMotion;
        // isovolumic-ish contraction: shorten along the axis, thicken across
        p.y *= 1.0 - 0.065 * con;
        p.xz *= 1.0 + 0.04 * con;
        // organic surface wobble
        p.xz *= (0.8 + 0.4 * aRand) * (1.0 + 0.07 * sin(p.y * 0.9 + aRand * 20.0));
        vCa = ca; vRand = aRand; vLocal = p; vFocus = aFocus;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        vV = -mv.xyz; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FIRE}
      ${GLSL_STAIN}
      uniform float uFocus;
      varying vec3 vN; varying vec3 vV; varying vec3 vLocal; varying float vCa; varying float vRand; varying float vDepth; varying float vFocus;
      void main() {
        float ndv = abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(1.0 - ndv, 2.4);
        float s = vLocal.y * 2.4 + vRand * 7.0;
        float aa = fwidth(s);
        float zl = 1.0 - smoothstep(0.0, 0.08 + aa * 1.5, abs(fract(s) - 0.5));
        zl *= 1.0 - smoothstep(0.25, 0.8, aa); // fade striations where they would alias
        float blur = clamp(abs(vDepth - uFocus) / uFocus, 0.0, 1.0);
        float core = ndv;
        vec3 structure = STAIN * (0.9 * rim + 0.35 * zl * core * (1.0 - blur)) + STAIN_DEEP * 0.04 * core;
        float ca = vCa * (0.55 + 0.45 * vRand);
        vec3 calcium = fireLUT(ca * 0.9) * ca * core * core * (0.6 + 0.4 * zl);
        float fog = exp(-max(vDepth - uFocus, 0.0) * 0.12);
        float nearFade = smoothstep(8.0, 20.0, vDepth);
        vec3 col = (structure * (0.2 + 0.35 * vFocus) + calcium * (0.22 + 0.3 * vFocus)) * fog * nearFade * (1.0 - 0.45 * blur);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const rand = new Float32Array(list.length);
  const foc = new Float32Array(list.length);
  foc[list.length - 1] = 1;
  const lens = new Float32Array(list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  list.forEach((it, i) => {
    e.set(it.tilt, 0, -Math.PI / 2 + it.ang);
    q.setFromEuler(e);
    m4.compose(it.p, q, new THREE.Vector3(1, 1, 0.68));
    mesh.setMatrixAt(i, m4);
    rand[i] = r(); lens[i] = it.len;
  });
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 1));
  geo.setAttribute('aLen', new THREE.InstancedBufferAttribute(lens, 1));
  geo.setAttribute('aFocus', new THREE.InstancedBufferAttribute(foc, 1));
  mesh.frustumCulled = false;

  const fibre = new THREE.Group();
  fibre.add(mesh);
  fibre.rotation.set(0.12, -0.5, 0.22);
  scene.add(fibre);

  const dust = makeDust(mobile ? 160 : 320, new THREE.Vector3(90, 40, 60), 22, 3);
  scene.add(dust);

  const focus = new THREE.Vector3(0.5, 0.2, 2.2);
  fibre.updateMatrixWorld(true);
  const stop: Stop = {
    scene, camera,
    camPos: new THREE.Vector3(-4, 4.5, 31),
    camLook: new THREE.Vector3(-1.2, 0.3, 0),
    diveTarget: fibre.localToWorld(focus.clone()),
    root: fibre,
    scale: { length: 10, label: '100 µm', at: fibre.localToWorld(focus.clone()) },
    anchors: [
      { id: 't-cell', label: 'One cardiomyocyte · ~100 µm', pos: focus.clone().add(new THREE.Vector3(2.2, 1.2, 0.4)), dx: 70, dy: -70, mobile: true },
      { id: 't-branch', label: 'Branching, end-to-end coupling', pos: new THREE.Vector3(14, -3.2, 0), dx: 60, dy: 60 },
    ],
    update(t) {
      mat.uniforms.uTime.value = t;
      (dust.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      if (!reduced) fibre.rotation.y = -0.5 + Math.sin(t * 0.05) * 0.03;
    },
    resize(_w, _h, m) {
      (dust.material as THREE.ShaderMaterial).uniforms.uScale.value = m ? 0.8 : 1;
    },
  };
  return stop;
}
