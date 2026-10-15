import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../../shared/env';
import { GLSL_FIRE, VOID, makeDust } from './fx';
import type { Stop } from './stop';

/**
 * Stop 3 — the dyad (calcium release unit). 1 unit ≈ 10 nm.
 * T-tubule below, junctional SR above, RyR2 tetramer clusters in the ~15 nm cleft,
 * L-type Ca²⁺ channels on the tubule. Spark timing is stretched 10× for visibility.
 */
export const TIME_STRETCH = 10;
const RISE = 0.03 * TIME_STRETCH;   // ≈30 ms rise → 0.3 s on screen
const DECAY = 0.1 * TIME_STRETCH;   // ≈100 ms decay → 1.0 s on screen
const LIFE = RISE + DECAY * 3.2;

const TUBE_Y = -11.6, TUBE_R = 10;
const bend = (z: number) => TUBE_Y + Math.sqrt(Math.max(0, (TUBE_R + 1.6) ** 2 - z * z));

export interface Cluster { center: THREE.Vector3; size: number; fired: number; lt: number }

export interface DyadStop extends Stop {
  clusters: Cluster[];
  trigger(k: number): void;
  signal(): number;
  selected: number;
}

function membraneMat(color: THREE.Color, strength: number, rimPow: number) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color }, uK: { value: strength }, uTime: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vP;
      void main(){ vUv = uv; vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FIRE}
      uniform vec3 uColor; uniform float uK, uTime, uFlash;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        float ndv = abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(1.0 - ndv, ${rimPow.toFixed(1)});
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
        float speck = step(0.985, hash(floor(vP.xz * 2.2 + vP.y)));        // lipid/protein speckle
        float lines = 0.5 + 0.5 * sin(vP.x * 1.4 + sin(vP.z * 0.5) * 2.0);  // faint membrane texture
        vec3 col = uColor * (0.10 + rim * 1.1 + speck * 0.8 + lines * 0.05) * uK * edge;
        col += fireLUT(uFlash) * uFlash * 0.006 * edge * (0.3 + rim);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function createDyad(mobile: boolean, reduced: boolean): DyadStop {
  const scene = new THREE.Scene();
  scene.background = VOID;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
  const r = rng(23);
  const world = new THREE.Group();
  scene.add(world);

  // --- T-tubule
  const tubeGeo = new THREE.CylinderGeometry(TUBE_R, TUBE_R, 150, 64, 1, true);
  tubeGeo.rotateZ(Math.PI / 2);
  const tubeMat = membraneMat(new THREE.Color(0.1, 0.85, 0.7), 0.14, 2.6);
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  tube.position.y = TUBE_Y;
  world.add(tube);

  // --- junctional SR: two curved membranes hugging the tubule (lumen in between)
  const mkSheet = (lift: number) => {
    const g = new THREE.PlaneGeometry(84, 22, 84, 22);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, bend(p.getZ(i)) + lift);
    g.computeVertexNormals();
    return g;
  };
  const srMat = membraneMat(new THREE.Color(0.32, 0.36, 1.0), 0.12, 3.0);
  const srLow = new THREE.Mesh(mkSheet(0), srMat);
  const srHigh = new THREE.Mesh(mkSheet(3.2), srMat);
  world.add(srLow, srHigh);

  // calsequestrin-like specks in the SR lumen (the Ca²⁺ store)
  {
    const n = mobile ? 260 : 520;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = (r() - 0.5) * 70, z = (r() - 0.5) * 18;
      p.set([x, bend(z) + 0.6 + r() * 2.0, z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color: new THREE.Color(1.0, 0.55, 0.25), size: 0.35, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    world.add(new THREE.Points(g, m));
  }

  // --- RyR2 tetramer geometry: four lobes around a central pore
  const lobes: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[0.68, 0.68], [-0.68, 0.68], [0.68, -0.68], [-0.68, -0.68]]) {
    const s = new THREE.SphereGeometry(0.72, 10, 7); s.scale(1, 0.62, 1); s.translate(x, 0, z); lobes.push(s);
  }
  const stalk = new THREE.SphereGeometry(0.45, 8, 6); stalk.scale(1, 1.3, 1); stalk.translate(0, 0.45, 0); lobes.push(stalk);
  const ryrGeo = mergeGeometries(lobes)!;

  const sizes = [14, 26, 18, 8, 22];
  const xs = [-36, -16, 2, 17, 33];
  const clusters: Cluster[] = [];
  const ryrM: THREE.Matrix4[] = [], ryrC: number[] = [];
  const ltM: THREE.Matrix4[] = [], ltC: number[] = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  sizes.forEach((size, k) => {
    const cx = xs[k] + (r() - 0.5) * 2, cz = (r() - 0.5) * 3.5;
    // grow a compact-but-irregular cluster on a ~30 nm lattice
    const occ = new Set<string>(['0,0']);
    const cells: [number, number][] = [[0, 0]];
    while (cells.length < size) {
      const [bx, bz] = cells[Math.floor(r() * cells.length)];
      const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(r() * 4)];
      const key = `${bx + d[0]},${bz + d[1]}`;
      if (!occ.has(key) && Math.abs(bz + d[1]) < 4) { occ.add(key); cells.push([bx + d[0], bz + d[1]]); }
    }
    let mx = 0, mz = 0;
    for (const [gx, gz] of cells) {
      const x = cx + gx * 2.9 + (r() - 0.5) * 0.35, z = cz + gz * 2.9 + (gx % 2 ? 0.4 : 0) + (r() - 0.5) * 0.35;
      const y = bend(z) - 0.62;
      const slope = -z / Math.sqrt(Math.max(1, (TUBE_R + 1.6) ** 2 - z * z));
      e.set(-Math.atan(slope) * 0.9, (r() - 0.5) * 0.5, 0);
      q.setFromEuler(e);
      ryrM.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, -1, 1)));
      ryrC.push(k);
      mx += x; mz += z;
    }
    mx /= cells.length; mz /= cells.length;
    const center = new THREE.Vector3(mx, bend(mz) - 0.9, mz);
    clusters.push({ center, size, fired: -99, lt: -99 });
    // L-type channels across the cleft, fewer than RyRs
    const nl = Math.max(2, Math.round(size / 5));
    for (let i = 0; i < nl; i++) {
      const [gx, gz] = cells[Math.floor(r() * cells.length)];
      const x = cx + gx * 3.0 + (r() - 0.5) * 1.5, z = cz + gz * 3.0 + (r() - 0.5) * 1.5;
      const y = TUBE_Y + Math.sqrt(TUBE_R ** 2 - z * z) + 0.15;
      e.set(Math.asin(z / TUBE_R) * -1, 0, 0); q.setFromEuler(e);
      ltM.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, one));
      ltC.push(k);
    }
  });

  const protMat = (base: THREE.Color, lt: boolean) => new THREE.ShaderMaterial({
    uniforms: { uAct: { value: new Array(5).fill(0) }, uSel: { value: -1 }, uBase: { value: base } },
    vertexShader: /* glsl */ `
      attribute float aCluster; uniform float uAct[5]; uniform float uSel;
      varying vec3 vN; varying vec3 vV; varying float vAct; varying float vSel;
      void main(){
        int k = int(aCluster + 0.5);
        float a = 0.0;
        for (int i = 0; i < 5; i++) if (i == k) a = uAct[i];
        vAct = a; vSel = abs(aCluster - uSel) < 0.5 ? 1.0 : 0.0;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position * (1.0 + 0.12 * a), 1.0);
        vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FIRE}
      uniform vec3 uBase; varying vec3 vN; varying vec3 vV; varying float vAct; varying float vSel;
      void main(){
        float ndv = abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(1.0 - ndv, 2.0);
        vec3 n = normalize(vN);
        float key = max(dot(n, normalize(vec3(-0.4, 0.8, 0.5))), 0.0);
        vec3 col = uBase * (0.03 + 0.35 * key * key + 0.5 * rim) * (1.0 + 0.8 * vSel);
        col += fireLUT(vAct * 0.85) * vAct * (${lt ? '0.7' : '0.55'} + 0.6 * rim);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mkInst = (geo: THREE.BufferGeometry, ms: THREE.Matrix4[], cs: number[], mat: THREE.ShaderMaterial) => {
    const im = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((m, i) => im.setMatrixAt(i, m));
    geo.setAttribute('aCluster', new THREE.InstancedBufferAttribute(new Float32Array(cs), 1));
    im.frustumCulled = false;
    return im;
  };
  const ryrMat = protMat(new THREE.Color(0.25, 0.95, 0.85), false);
  const ltMat = protMat(new THREE.Color(1.0, 0.55, 0.2), true);
  world.add(mkInst(ryrGeo, ryrM, ryrC, ryrMat));
  const ltGeo = new THREE.CapsuleGeometry(0.42, 0.7, 3, 8);
  world.add(mkInst(ltGeo, ltM, ltC, ltMat));

  // --- spark particles (one draw call, ring buffer, animated in the vertex shader)
  const PER = mobile ? 260 : 600;
  const POOL = PER * (mobile ? 3 : 4);
  const pg = new THREE.BufferGeometry();
  const aStart = new Float32Array(POOL).fill(-100);
  const aCenter = new Float32Array(POOL * 3);
  const aSeed = new Float32Array(POOL * 4);
  for (let i = 0; i < POOL * 4; i++) aSeed[i] = r();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3));
  pg.setAttribute('aStart', new THREE.BufferAttribute(aStart, 1));
  pg.setAttribute('aCenter', new THREE.BufferAttribute(aCenter, 3));
  pg.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 4));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      ${GLSL_FIRE}
      attribute float aStart; attribute vec3 aCenter; attribute vec4 aSeed;
      uniform float uTime, uPx; varying vec3 vCol;
      void main(){
        float age = uTime - aStart - aSeed.w * ${RISE.toFixed(3)};
        if (age < 0.0 || age > ${LIFE.toFixed(3)}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); return; }
        vec3 dir = normalize(aSeed.xyz * 2.0 - 1.0 + vec3(0.0001));
        // confined to the cleft first (flat), then escaping into the cytosol (3D, downward/outward)
        float esc = smoothstep(0.1, 1.2, age);
        vec3 d = vec3(dir.x, dir.y * mix(0.05, 0.9, esc) - 0.25 * esc, dir.z);
        float rad = 15.0 * sqrt(age / ${LIFE.toFixed(3)}) * (0.35 + 0.65 * aSeed.y);
        vec3 jitter = vec3(sin(uTime * 3.0 + aSeed.x * 60.0), cos(uTime * 2.3 + aSeed.z * 50.0), sin(uTime * 2.7 + aSeed.y * 40.0)) * 0.25 * esc;
        vec3 p = aCenter + d * rad + jitter;
        float tt = uTime - aStart;
        float env = smoothstep(0.0, ${RISE.toFixed(3)}, tt) * exp(-max(tt - ${RISE.toFixed(3)}, 0.0) / ${DECAY.toFixed(3)});
        float near = 1.0 - smoothstep(0.0, 15.0, rad);
        float I = env * (0.35 + 0.9 * near);
        vCol = fireLUT(I) * I * 0.065;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uPx * (0.9 + 1.6 * aSeed.z) * 190.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q,q); if (d > 1.0) discard;
        gl_FragColor = vec4(vCol * exp(-d * 3.0) * 1.4, 1.0); }`,
  });
  const sparks = new THREE.Points(pg, pMat);
  sparks.frustumCulled = false;
  world.add(sparks);

  // soft glow halo per cluster (Points, size by activity)
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(clusters.flatMap((c) => [c.center.x, c.center.y - 0.6, c.center.z])), 3));
  hg.setAttribute('aCluster', new THREE.BufferAttribute(new Float32Array(clusters.map((_, i) => i)), 1));
  const hMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAct: { value: new Array(5).fill(0) }, uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      ${GLSL_FIRE}
      attribute float aCluster; uniform float uAct[5]; uniform float uPx; varying vec3 vCol;
      void main(){ int k = int(aCluster + 0.5); float a = 0.0;
        for (int i = 0; i < 5; i++) if (i == k) a = uAct[i];
        vCol = fireLUT(a) * a; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uPx * (1600.0 + 3200.0 * a) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `varying vec3 vCol; void main(){ vec2 q = gl_PointCoord*2.0-1.0; float d = dot(q,q);
      gl_FragColor = vec4(vCol * exp(-d * 4.5) * 0.3, 1.0); }`,
  });
  world.add(new THREE.Points(hg, hMat));

  const dust = makeDust(mobile ? 140 : 280, new THREE.Vector3(120, 60, 90), 50, 5, new THREE.Color('#7f8cff'));
  scene.add(dust);

  world.rotation.y = 0.18;
  world.updateMatrixWorld(true);
  const toWorld = (v: THREE.Vector3) => v.clone();

  let head = 0;
  let clock = 0;
  const stop: DyadStop = {
    scene, camera, clusters, selected: -1, root: world,
    camPos: new THREE.Vector3(-30, 33, 80),
    camLook: new THREE.Vector3(-8, -9.5, 2),
    diveTarget: toWorld(clusters[2].center),
    scale: { length: 10, label: '100 nm', at: toWorld(new THREE.Vector3(0, -1, 0)) },
    anchors: [
      { id: 'd-ryr', label: 'RyR2 cluster', pos: toWorld(clusters[1].center.clone().add(new THREE.Vector3(0, 0.8, -3))), dx: -70, dy: -60, mobile: true },
      { id: 'd-sr', label: 'Junctional SR · Ca²⁺ store', pos: toWorld(new THREE.Vector3(8, bend(-8) + 3.2, -8)), dx: 50, dy: -90 },
      { id: 'd-tt', label: 'T-tubule membrane', pos: toWorld(new THREE.Vector3(30, TUBE_Y + 2, TUBE_R - 0.2)), dx: 40, dy: 70, mobile: true },
      { id: 'd-lt', label: 'L-type Ca²⁺ channels', pos: toWorld(new THREE.Vector3(ltM[ltM.length - 1].elements[12], ltM[ltM.length - 1].elements[13], ltM[ltM.length - 1].elements[14])), dx: 60, dy: 40 },
    ],
    trigger(k) {
      const c = clusters[k];
      c.lt = clock;                       // L-type channels open first…
      c.fired = clock + 0.12;             // …then the RyR2 cluster releases (CICR)
      const n = Math.round(PER * (0.5 + c.size / 60));
      for (let i = 0; i < n; i++) {
        const j = head; head = (head + 1) % POOL;
        aStart[j] = clock + 0.12;
        aCenter[j * 3] = c.center.x + (aSeed[j * 4] - 0.5) * Math.sqrt(c.size) * 2.2;
        aCenter[j * 3 + 1] = c.center.y;
        aCenter[j * 3 + 2] = c.center.z + (aSeed[j * 4 + 2] - 0.5) * Math.sqrt(c.size) * 1.6;
      }
      (pg.attributes.aStart as THREE.BufferAttribute).needsUpdate = true;
      (pg.attributes.aCenter as THREE.BufferAttribute).needsUpdate = true;
    },
    signal() {
      let s = 0;
      for (const c of clusters) {
        const tt = clock - c.fired;
        if (tt > 0) s += (c.size / 30) * Math.min(1, tt / RISE) * Math.exp(-Math.max(0, tt - RISE) / DECAY);
      }
      return s;
    },
    update(t, dt) {
      clock += dt;
      pMat.uniforms.uTime.value = clock;
      (dust.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      tubeMat.uniforms.uTime.value = t;
      const act = ryrMat.uniforms.uAct.value as number[];
      const lact = ltMat.uniforms.uAct.value as number[];
      let total = 0;
      clusters.forEach((c, i) => {
        const tt = clock - c.fired;
        act[i] = tt > 0 ? Math.min(1, tt / RISE) * Math.exp(-Math.max(0, tt - RISE) / DECAY) * 1.15 : 0;
        const tl = clock - c.lt;
        lact[i] = tl > 0 ? Math.exp(-tl / 0.18) * 0.9 : 0;
        total += act[i];
      });
      hMat.uniforms.uAct.value = act;
      ryrMat.uniforms.uSel.value = stop.selected;
      ltMat.uniforms.uSel.value = stop.selected;
      srMat.uniforms.uFlash.value = Math.min(1, total * 0.6);
      if (!reduced) world.rotation.y = 0.18 + Math.sin(t * 0.06) * 0.06;
    },
    resize(_w, _h, m) {
      const px = Math.min(window.devicePixelRatio, 2) * (m ? 0.8 : 1);
      pMat.uniforms.uPx.value = px; hMat.uniforms.uPx.value = px;
    },
  };
  return stop;
}
