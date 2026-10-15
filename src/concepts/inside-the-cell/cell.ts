import * as THREE from 'three';
import { GLSL_FIRE, GLSL_STAIN, VOID, makeDust } from './fx';
import { CaSim } from './casim';
import type { Stop } from './stop';

/** Stop 2 — one cardiomyocyte with a live (toy) Ca²⁺ fluorescence field. 1 unit ≈ 5 µm. */

// Cell outline (stepped ends ≈ intercalated discs), in local units.
const OUTLINE: [number, number][] = [
  [-9.6, -2.5], [9.3, -2.5], [9.3, -0.7], [10.2, -0.7], [10.2, 1.5], [9.7, 1.5], [9.7, 2.5],
  [-10.3, 2.5], [-10.3, 0.9], [-9.6, 0.9],
];
const MINX = -10.3, MAXX = 10.2, MINY = -2.5, MAXY = 2.5;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  const dx = px - ax - t * vx, dy = py - ay - t * vy;
  return Math.hypot(dx, dy);
}
function inside(px: number, py: number) {
  let c = false;
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i], [xj, yj] = OUTLINE[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function buildCellGeometry(seg: number) {
  const W = 21.4, H = 5.8, cx = -0.05;
  const sx = Math.round(seg * 2), sy = Math.round(seg * 2 * H / W) + 4;
  const g = new THREE.PlaneGeometry(W, H, sx, sy);
  g.translate(cx, 0, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const n = pos.count;
  let d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    let m = Infinity;
    for (let a = 0, b = OUTLINE.length - 1; a < OUTLINE.length; b = a++) {
      m = Math.min(m, segDist(x, y, OUTLINE[a][0], OUTLINE[a][1], OUTLINE[b][0], OUTLINE[b][1]));
    }
    d[i] = inside(x, y) ? m : -m;
  }
  // blur the distance field a little → rounded corners
  const cols = sx + 1, rowsN = sy + 1;
  for (let pass = 0; pass < 3; pass++) {
    const o = new Float32Array(n);
    for (let y = 0; y < rowsN; y++) for (let x = 0; x < cols; x++) {
      let s = 0, k = 0;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        const xx = x + ox, yy = y + oy;
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rowsN) continue;
        s += d[yy * cols + xx]; k++;
      }
      o[y * cols + x] = s / k;
    }
    d = o;
  }
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const e = Math.max(0, d[i] - 0.04);
    const h = 1.05 * Math.pow(Math.min(1, e / 1.6), 0.55) * (0.9 + 0.1 * Math.cos(x * 0.6));
    pos.setZ(i, h);
    uv[i * 2] = (x - MINX) / (MAXX - MINX);
    uv[i * 2 + 1] = (y - MINY) / (MAXY - MINY);
  }
  g.setAttribute('aEdge', new THREE.BufferAttribute(d, 1));
  g.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export interface CellStop extends Stop {
  sim: CaSim;
  pacing: boolean;
  simSpeed: number;
  sparkAt(u: number, v: number): void;
  pick(ray: THREE.Raycaster): { u: number; v: number } | null;
}

export function createCell(mobile: boolean, reduced: boolean): CellStop {
  const scene = new THREE.Scene();
  scene.background = VOID;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
  const sim = new CaSim(200, 48);
  sim.load = 0.35;
  const data = new Uint8Array(sim.nx * sim.ny);
  const tex = new THREE.DataTexture(data, sim.nx, sim.ny, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  const geo = buildCellGeometry(mobile ? 120 : 170);
  const mkMat = (main: boolean) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: main,
    uniforms: {
      uField: { value: tex }, uTime: { value: 0 }, uCon: { value: 0 },
      uMain: { value: main ? 1 : 0 }, uFlat: { value: 0 }, uDim: { value: main ? 1 : 0.4 },
    },
    vertexShader: /* glsl */ `
      attribute float aEdge; attribute vec2 aUv;
      uniform float uCon;
      varying vec2 vUv; varying float vEdge; varying vec3 vN; varying vec3 vV;
      void main() {
        vec3 p = position;
        p.x *= 1.0 - 0.045 * uCon;
        p.y *= 1.0 + 0.03 * uCon;
        p.z *= 1.0 + 0.05 * uCon;
        vUv = aUv; vEdge = aEdge;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FIRE}
      ${GLSL_STAIN}
      uniform sampler2D uField; uniform float uTime, uMain, uFlat, uDim;
      varying vec2 vUv; varying float vEdge; varying vec3 vN; varying vec3 vV;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main() {
        float alpha = smoothstep(0.0, 0.12, vEdge);
        if (alpha <= 0.0) discard;
        vec3 n = normalize(vN), v = normalize(vV);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        float rim = pow(1.0 - ndv, 3.0);
        // sarcomeres: 50 Z-lines along the cell, aligned with the release-site lattice
        float s = vUv.x * 50.0 - 0.625 + vUv.y * 0.35 + (noise(vUv * vec2(4.0, 9.0)) - 0.5) * 0.25;
        float aa = fwidth(s);
        float dz = abs(fract(s + 0.5) - 0.5);
        float zl = 1.0 - smoothstep(0.03, 0.07 + aa, dz);
        float aband = smoothstep(0.16, 0.32, dz);
        // T-tubule mouths: puncta along each Z-line
        float tt = zl * smoothstep(0.55, 0.95, noise(vec2(s * 1.0, vUv.y * 70.0)));
        // nuclei (two, central, elongated)
        vec2 q1 = (vUv - vec2(0.43, 0.54)) / vec2(0.07, 0.15);
        vec2 q2 = (vUv - vec2(0.56, 0.46)) / vec2(0.065, 0.14);
        float l1 = length(q1), l2 = length(q2);
        float nuc = max(1.0 - smoothstep(0.8, 1.0, l1), 1.0 - smoothstep(0.8, 1.0, l2));
        float env = max(smoothstep(0.08, 0.0, abs(l1 - 0.9)), smoothstep(0.08, 0.0, abs(l2 - 0.9)));
        float chrom = noise(vUv * vec2(260.0, 60.0)) * 0.6 + noise(vUv * vec2(90.0, 22.0)) * 0.4;
        // calcium field
        float ca = texture2D(uField, vUv).r * 1.27 * uMain;
        ca = pow(ca, 1.5) * 1.3;   // contrast: keep wave fronts crisp, tails dark
        ca *= (1.0 - 0.55 * nuc);
        vec3 body = vec3(0.010, 0.008, 0.040) + STAIN_DEEP * 0.05 * ndv;
        vec3 structure = STAIN * (0.16 * zl + 0.35 * tt + 0.02 * aband) * (1.0 - nuc);
        vec3 nucleus = vec3(0.22, 0.30, 0.85) * nuc * (0.03 + 0.10 * chrom * chrom);
        vec3 rimc = STAIN * rim * 0.35 + vec3(0.4, 0.5, 1.0) * pow(1.0 - ndv, 8.0) * 0.2;
        float f0 = 0.10;                       // resting fluorescence
        float F = f0 + ca;
        vec3 fluo = fireLUT(F) * F * (0.8 + 0.4 * zl);
        vec3 col = body + vec3(0.3, 0.4, 1.0) * env * 0.12 + structure * (1.0 - 0.6 * smoothstep(0.1, 0.6, ca)) + nucleus + rimc + fluo * 0.8;
        col *= uDim;
        gl_FragColor = vec4(col, alpha * (uMain > 0.5 ? 1.0 : 0.55));
      }`,
  });

  const group = new THREE.Group();
  const mainMat = mkMat(true);
  const cell = new THREE.Mesh(geo, mainMat);
  cell.rotation.x = -Math.PI / 2;
  group.add(cell);
  // blurred neighbours, out of the focal plane
  const neighMat = mkMat(false);
  const n1 = new THREE.Mesh(geo, neighMat); n1.rotation.x = -Math.PI / 2; n1.position.set(14, -3.2, -9); n1.rotation.z = 0.08;
  const n2 = new THREE.Mesh(geo, neighMat); n2.rotation.x = -Math.PI / 2; n2.position.set(-17, -4.5, 8.5); n2.rotation.z = -0.05;
  const n3 = new THREE.Mesh(geo, neighMat); n3.rotation.x = -Math.PI / 2; n3.position.set(6, -6, 12); n3.rotation.z = 0.1;
  group.add(n1, n2, n3);
  group.rotation.y = 0.34;
  scene.add(group);
  scene.add(makeDust(mobile ? 120 : 240, new THREE.Vector3(60, 24, 50), 16, 9));
  const dust = scene.children[scene.children.length - 1] as THREE.Points;

  group.updateMatrixWorld(true);
  const uvWorld = (u: number, v: number, lift = 0.9) =>
    cell.localToWorld(new THREE.Vector3(MINX + u * (MAXX - MINX), MINY + v * (MAXY - MINY), lift));

  let beatClock = 1.0;
  const BEAT = 3.6;

  const stop: CellStop = {
    scene, camera, sim, pacing: true, simSpeed: 0.55,
    camPos: new THREE.Vector3(-4.6, 13.5, 16.5),
    camLook: new THREE.Vector3(-2.2, -1.6, 1.6),
    diveTarget: uvWorld(0.66, 0.36, 1.0),
    scale: { length: 2, label: '10 µm', at: uvWorld(0.5, 0.5) },
    anchors: [
      { id: 'c-z', label: 'Z-lines · T-tubules, every ~2 µm', pos: uvWorld(0.205, 0.86, 0.8), dx: -40, dy: -80, mobile: true },
      { id: 'c-nuc', label: 'Nuclei', pos: uvWorld(0.43, 0.62, 1.0), dx: -30, dy: -110 },
      { id: 'c-disc', label: 'Intercalated disc', pos: uvWorld(0.975, 0.55, 0.3), dx: 40, dy: 70 },
    ],
    pick(ray) {
      const hit = ray.intersectObject(cell, false)[0];
      if (!hit) return null;
      const l = cell.worldToLocal(hit.point.clone());
      if (!inside(l.x, l.y)) return null;
      return { u: (l.x - MINX) / (MAXX - MINX), v: (l.y - MINY) / (MAXY - MINY) };
    },
    sparkAt(u, v) {
      // nearest release site to (u,v)
      let best = 0, bd = Infinity;
      for (let i = 0; i < sim.siteCount; i++) {
        const du = sim.sx[i] / sim.nx - u, dv = (sim.sy[i] / sim.ny - v) * 0.25;
        const d = du * du + dv * dv;
        if (d < bd) { bd = d; best = i; }
      }
      sim.spark(best);
    },
    update(t, dt, active) {
      mainMat.uniforms.uTime.value = t;
      (dust.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      if (!active) return;
      const sdt = Math.min(dt, 1 / 30) * stop.simSpeed;
      if (stop.pacing) {
        beatClock += sdt;
        if (beatClock > BEAT * stop.simSpeed) { beatClock = 0; sim.beat(); }
      }
      sim.step(sdt);
      const c = sim.c;
      let mean = 0;
      for (let i = 0; i < c.length; i++) { const v = c[i]; data[i] = v > 1.27 ? 255 : v * 200; mean += v; }
      tex.needsUpdate = true;
      mean /= c.length;
      // contraction follows the mean Ca²⁺ (a lagging, smoothed proxy)
      const target = reduced ? 0 : Math.min(1, mean * 4.5);
      const con = mainMat.uniforms.uCon.value as number;
      mainMat.uniforms.uCon.value = con + (target - con) * Math.min(1, dt * 6);
      neighMat.uniforms.uCon.value = mainMat.uniforms.uCon.value;
    },
  };
  return stop;
}
