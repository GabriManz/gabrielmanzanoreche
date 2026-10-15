/**
 * Concept D — EXCITABLE CITY
 * Barcelona's Eixample grid as a sheet of excitable cardiac tissue at night.
 * A Barkley excitable-media model runs on the CPU (see sim.ts); its field
 * drives the emissive light of every block, street lamp and the pseudo-ECG.
 * Illustrative model only — not a patient-specific simulation.
 */
import '@fontsource-variable/space-grotesk';
import { mountChapterNav } from '../../shared/chapters';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mountChrome, openPanel, createLoader } from '../../shared/chrome';
import { sections, research, about, type SectionKey } from '../../shared/content';
import { prefersReducedMotion, isTouch } from '../../shared/env';
import { Barkley } from './sim';
import { buildCity } from './city';
import { EcgStrip } from './ecg';
import { blockVert, blockFrag, groundVert, groundFrag } from './shaders';

const ok = mountChrome({
  concept: 'Excitable City',
  status: 'Concept D prototype — Barkley excitable-media model driving a stylised Eixample at night',
  needsWebGL: true,
});
mountChapterNav('wildcard', 'top');

if (ok) start();

function start() {
  const loader = createLoader('Mapping the grid');
  loader.progress(0.15);
  const params = new URLSearchParams(location.search);
  const reduced = prefersReducedMotion();
  const touch = isTouch();
  const portrait = window.innerWidth / window.innerHeight < 0.9;
  const C = portrait ? 5 : 6; // sim cells per block pitch
  const city = buildCity(portrait, C);
  const x0 = -city.nbx / 2, z0 = -city.nbz / 2;

  // ---------------------------------------------------------------- simulation
  const sim = new Barkley({ nx: city.nx, ny: city.ny, mask: city.mask });
  sim.D = 0.095 * (C / 6) ** 2; // keeps wave speed/wavelength constant in blocks
  // each block is a slightly different cell: mild heterogeneity in excitability
  sim.aMap = new Float32Array(city.nx * city.ny);
  for (let j = 0; j < city.ny; j++)
    for (let i = 0; i < city.nx; i++) {
      const bi = Math.floor(i / C), bj = Math.floor(j / C);
      let h = Math.imul((bi * 73856093) ^ (bj * 19349663), 2654435761) >>> 0;
      h = (h ^ (h >>> 15)) >>> 0;
      sim.aMap[j * city.nx + i] = 0.75 + 0.07 * (((h % 1000) / 1000) * 2 - 1)
        + 0.04 * Math.sin((i / C) * 0.3) * Math.cos((j / C) * 0.42);
    }
  const toGrid = (x: number, z: number): [number, number] => [(x - x0) * C - 0.5, (z - z0) * C - 0.5];
  const toWorld = (i: number, j: number): [number, number] => [x0 + (i + 0.5) / C, z0 + (j + 0.5) / C];
  const [saI, saJ] = toGrid(city.sa.x, city.sa.z);
  const SINUS_PERIOD = 560;           // sim steps between pacemaker beats ≙ 72 bpm
  const SINUS_BPM = 72;
  const STEPS_PER_SEC = reduced ? 120 : 300;
  const MAX_STEPS_PER_FRAME = 10;
  let stepCount = 0;
  let nextBeat = 0;
  let saPulse = 0;

  const pace = () => {
    sim.stimulate(saI, saJ, C * 0.7);
    saPulse = 1;
  };
  // heart-rate probe: upstrokes of a tissue cell near the centre
  const activations: number[] = [];
  const probeK = city.probe[1] * city.nx + city.probe[0];
  let probePrev = 0;
  const advance = (n: number) => {
    while (n > 0) {
      const c = Math.min(n, 4, Math.max(1, nextBeat - stepCount));
      sim.step(c);
      n -= c;
      stepCount += c;
      if (stepCount >= nextBeat) { pace(); nextBeat += SINUS_PERIOD; }
      const pu = sim.u[probeK];
      if (probePrev < 0.5 && pu >= 0.5) {
        activations.push(stepCount);
        if (activations.length > 5) activations.shift();
      }
      probePrev = pu;
    }
  };

  // initial state (and debug states for screenshots: ?seed=spiral | ?seed=chaos)
  const seed = params.get('seed');
  if (seed === 'spiral' || seed === 'chaos') {
    advance(SINUS_PERIOD + 20);
    const ci = Math.floor(city.nx * 0.5), cj = Math.floor(city.ny * 0.55);
    sim.seedBroken(ci, cj, 1, true);
    if (seed === 'chaos') {
      sim.seedBroken(Math.floor(city.nx * 0.25), Math.floor(city.ny * 0.75), -1, false);
      sim.seedBroken(Math.floor(city.nx * 0.78), Math.floor(city.ny * 0.3), 1, false);
    }
    advance(400);
  }
  // warm-up: pre-run so the first frame already shows waves and a filled ECG trace
  const preSamples: number[] = [];
  for (let k = 0, N = Math.round(SINUS_PERIOD * (seed ? 3.2 : 2.45)); k < N; k += 4) {
    advance(4);
    preSamples.push(sim.ecg());
  }
  loader.progress(0.4);

  // ---------------------------------------------------------------- renderer
  const root = document.createElement('div');
  root.className = 'ec-root';
  document.body.append(root);
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'ec-canvas';
  renderer.domElement.setAttribute('aria-label',
    'Night map of an excitable city. Click or tap to deliver a stimulus; press S to stimulate the centre, D to defibrillate.');
  renderer.domElement.setAttribute('role', 'img');
  root.append(renderer.domElement);

  const scene = new THREE.Scene();
  const FOG = new THREE.Color('#04060c');
  scene.background = FOG;
  const camera = new THREE.PerspectiveCamera(portrait ? 40 : 30, window.innerWidth / window.innerHeight, 0.1, 400);

  // field texture (R = u, G = v)
  const fieldData = new Uint8Array(city.nx * city.ny * 4);
  const fieldTex = new THREE.DataTexture(fieldData, city.nx, city.ny, THREE.RGBAFormat, THREE.UnsignedByteType);
  fieldTex.magFilter = THREE.LinearFilter;
  fieldTex.minFilter = THREE.LinearFilter;
  const uploadField = () => {
    const { u, v } = sim;
    for (let k = 0, o = 0; k < u.length; k++, o += 4) {
      fieldData[o] = u[k] * 255;
      fieldData[o + 1] = Math.min(1, v[k] / 0.95) * 255;
      fieldData[o + 3] = 255;
    }
    fieldTex.needsUpdate = true;
  };
  uploadField();

  const shared = {
    uField: { value: fieldTex },
    uCity: { value: new THREE.Vector4(x0, z0, city.nbx, city.nbz) },
    uTime: { value: 0 },
    uFogColor: { value: FOG },
    uFogDensity: { value: portrait ? 0.022 : 0.026 },
    uFlash: { value: 0 },
  };

  // ground + sea (one big shader plane)
  const coastA = city.coast(x0) - z0;
  const coastB = city.coast(x0 + city.nbx) - city.coast(x0);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      vertexShader: groundVert,
      fragmentShader: groundFrag,
      uniforms: {
        ...shared,
        uCoast: { value: new THREE.Vector2(coastA, coastB) },
        uPark: { value: new THREE.Vector4(city.park.x0, city.park.z0, city.park.x1, city.park.z1) },
        uDiag: { value: new THREE.Vector4(city.diag.ax, city.diag.az, city.diag.bx, city.diag.bz) },
      },
    }),
  );
  scene.add(ground);

  // chamfered Cerdà blocks with courtyards
  const oct = (s: number, c: number) => [
    [-s + c, -s], [s - c, -s], [s, -s + c], [s, s - c], [s - c, s], [-s + c, s], [-s, s - c], [-s, -s + c],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape(oct(0.425, 0.1));
  shape.holes.push(new THREE.Path(oct(0.2, 0.05).reverse()));
  const blockGeo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 1 });
  blockGeo.rotateX(-Math.PI / 2);
  const blockMat = new THREE.ShaderMaterial({ vertexShader: blockVert, fragmentShader: blockFrag, uniforms: shared });
  const blocks = new THREE.InstancedMesh(blockGeo, blockMat, city.blocks.length);
  const m4 = new THREE.Matrix4();
  city.blocks.forEach((b, i) => {
    m4.makeScale(1, b.h, 1).setPosition(b.x, 0, b.z);
    blocks.setMatrixAt(i, m4);
  });
  blocks.frustumCulled = false;
  scene.add(blocks);

  // round sprite texture for points
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const targetTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#fff';
    g.lineWidth = 5;
    g.beginPath(); g.arc(64, 64, 40, 0.25, Math.PI / 2 - 0.25); g.stroke();
    g.beginPath(); g.arc(64, 64, 40, Math.PI / 2 + 0.25, Math.PI - 0.25); g.stroke();
    g.beginPath(); g.arc(64, 64, 40, Math.PI + 0.25, 1.5 * Math.PI - 0.25); g.stroke();
    g.beginPath(); g.arc(64, 64, 40, 1.5 * Math.PI + 0.25, 2 * Math.PI - 0.25); g.stroke();
    g.lineWidth = 4;
    for (const [a, b, cc, d] of [[64, 4, 64, 22], [64, 106, 64, 124], [4, 64, 22, 64], [106, 64, 124, 64]]) {
      g.beginPath(); g.moveTo(a, b); g.lineTo(cc, d); g.stroke();
    }
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(64, 64, 5, 0, Math.PI * 2); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const ringTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 40, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const flatPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const addFlat = (tex: THREE.Texture, color: string) => {
    const m = new THREE.Mesh(flatPlane, new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    m.renderOrder = 2;
    scene.add(m);
    return m;
  };

  // pacemaker (SA node) plaza
  const saRing = addFlat(ringTex, '#7fe8ff');
  saRing.position.set(city.sa.x, 0.012, city.sa.z);
  const saWave = addFlat(ringTex, '#7fe8ff');
  saWave.position.copy(saRing.position);
  const saCore = addFlat(dotTex, '#c8f6ff');
  saCore.position.set(city.sa.x, 0.02, city.sa.z);
  saCore.scale.setScalar(0.7);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1.4, 6, 1, true).translate(0, 0.7, 0),
    new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.position.set(city.sa.x, 0, city.sa.z);
  scene.add(beam);

  // stimulus ripples & rotor markers (pools)
  const ripples = Array.from({ length: 6 }, () => {
    const m = addFlat(ringTex, '#ffffff');
    m.visible = false;
    return { m, t: 1 };
  });
  let rippleIdx = 0;
  const rotors = Array.from({ length: 10 }, () => {
    const m = addFlat(targetTex, '#ff4d7a');
    m.visible = false;
    m.scale.setScalar(1.7);
    (m.material as THREE.MeshBasicMaterial).depthTest = false;
    m.renderOrder = 5;
    return m;
  });

  // landmark pins
  const pinMat = new THREE.LineBasicMaterial({ color: '#f3efe6', transparent: true, opacity: 0.55 });
  for (const lm of city.landmarks) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(lm.x, lm.h, lm.z), new THREE.Vector3(lm.x, lm.h + 0.85, lm.z)]);
    scene.add(new THREE.Line(g, pinMat));
    const d = addFlat(dotTex, '#fff6e8');
    d.position.set(lm.x, lm.h + 0.86, lm.z);
    d.scale.setScalar(0.22);
  }

  // long-run loop (easter egg): dotted route + a runner whose cadence follows the heart rate
  const routePts: THREE.Vector3[] = [];
  const segLen: number[] = [];
  let routeLen = 0;
  for (let i = 0; i < city.route.length - 1; i++) {
    const [ax, az] = city.route[i], [bx, bz] = city.route[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    segLen.push(L);
    routeLen += L;
    const n = Math.round(L / 0.2);
    for (let k = 0; k < n; k++) routePts.push(new THREE.Vector3(ax + (bx - ax) * k / n, 0.03, az + (bz - az) * k / n));
  }
  const routeAt = (s: number, out: THREE.Vector3) => {
    s = ((s % routeLen) + routeLen) % routeLen;
    for (let i = 0; i < segLen.length; i++) {
      if (s <= segLen[i]) {
        const [ax, az] = city.route[i], [bx, bz] = city.route[i + 1];
        const t = s / segLen[i];
        return out.set(ax + (bx - ax) * t, 0.05, az + (bz - az) * t);
      }
      s -= segLen[i];
    }
    return out;
  };
  const route = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(routePts),
    new THREE.PointsMaterial({ color: '#d9f3ff', size: touch ? 2 : 2.2, sizeAttenuation: false, transparent: true, opacity: portrait ? 0.2 : 0.3, depthWrite: false }),
  );
  scene.add(route);
  const runner = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: '#eafcff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  runner.scale.setScalar(0.3);
  scene.add(runner);
  let runnerS = 0;

  // ---------------------------------------------------------------- post
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: touch ? 0 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.12);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------------------------------------------------------------- UI
  const ui = document.createElement('div');
  ui.className = 'ec-ui';
  ui.innerHTML = `
    <header class="ec-title">
      <p class="ec-kicker">Concept D · Eixample grid · 41.39° N, 2.16° E</p>
      <h1>Excitable City</h1>
      <p class="ec-caption">Each block is a cell. Each light, a wave of excitation. Tap to stimulate — time it badly and you'll create re-entry, the mechanism behind many arrhythmias.</p>
    </header>
    <aside class="ec-legend" aria-label="Map legend">
      <details ${portrait ? '' : 'open'}>
        <summary>Legend</summary>
        <div class="ec-ramp" aria-hidden="true"><i></i></div>
        <div class="ec-ramp-labels"><span>Resting</span><span>Wavefront</span><span>Refractory tail</span></div>
        <ul>
          <li><b class="sym sym-sa"></b>Sinus node · pacemaker plaza</li>
          <li><b class="sym sym-pin"></b>Landmark · content</li>
          <li><b class="sym sym-rotor"></b>Rotor tip (phase singularity)</li>
          <li><b class="sym sym-park"></b>Park · non-conducting</li>
          <li><b class="sym sym-run"></b>Long-run loop</li>
        </ul>
        <div class="ec-scale" aria-hidden="true"><span class="bar"><i></i><i></i></span><span>0 &nbsp;133 &nbsp;266 m · 1 block = 1 cell</span></div>
        <p class="ec-tip">Tip — tap just behind a passing wave, in its ember tail.</p>
      </details>
    </aside>
    <div class="ec-hotspots"></div>
    <div class="ec-maplabels" aria-hidden="true"></div>
    <div class="ec-toast" role="status" aria-live="polite"></div>
    <div class="ec-probe" aria-hidden="true"></div>
    <section class="ec-monitor" aria-label="Pseudo-ECG monitor">
      <div class="ec-readouts">
        <div class="ec-rhythm"><span class="k">Rhythm</span><strong data-rhythm>Sinus rhythm</strong></div>
        <div><span class="k">HR</span><strong data-hr>72</strong><span class="u">bpm</span></div>
        <div><span class="k">Rotors</span><strong data-ps>0</strong></div>
        <button class="ec-pace" type="button" data-pace title="${about[1].title}: ${about[1].body}"><span class="k">Pace</span><span data-zone>Zone 1 · easy jog</span></button>
      </div>
      <div class="ec-trace"><canvas aria-hidden="true"></canvas><span class="ec-lead">Pseudo-ECG · virtual electrode</span></div>
      <div class="ec-controls">
        <button type="button" class="ec-btn" data-stim><kbd>S</kbd> Stimulate</button>
        <button type="button" class="ec-btn ec-btn-defib" data-defib><kbd>D</kbd> Defibrillate</button>
      </div>
      <p class="ec-disclaimer">Illustrative excitable-media model (Barkley) — not a patient-specific simulation.</p>
    </section>`;
  root.append(ui);
  const $ = <T extends Element>(s: string) => ui.querySelector(s) as T;
  const rhythmEl = $<HTMLElement>('[data-rhythm]');
  const hrEl = $<HTMLElement>('[data-hr]');
  const psEl = $<HTMLElement>('[data-ps]');
  const zoneEl = $<HTMLElement>('[data-zone]');
  const toastEl = $<HTMLElement>('.ec-toast');
  const probeEl = $<HTMLElement>('.ec-probe');
  const monitor = $<HTMLElement>('.ec-monitor');
  const ecg = new EcgStrip($<HTMLCanvasElement>('.ec-trace canvas'));
  const prefillEcg = () => { for (const v of preSamples) ecg.push(v, 4); };

  // hotspot buttons (keyboard-focusable, positioned over the 3D pins)
  const subs: Record<SectionKey, string> = {
    research: research[0].title,
    projects: 'Tools & experiments',
    about: about[1].title,
    contact: 'GitHub · email',
  };
  const hotspots = city.landmarks.map((lm, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ec-hotspot';
    b.innerHTML = `<span class="no">0${i + 1}</span><span class="lbl">${sections[lm.key].label}</span><span class="sub">${subs[lm.key]}</span>`;
    b.title = subs[lm.key];
    b.setAttribute('aria-label', `${sections[lm.key].label} — open panel`);
    b.addEventListener('click', () => openPanel(lm.key));
    $('.ec-hotspots').append(b);
    return { el: b, p: new THREE.Vector3(lm.x, lm.h + 0.86, lm.z) };
  });
  const mapLabel = (text: string, cls = '') => {
    const s = document.createElement('span');
    s.className = 'ec-maplabel ' + cls;
    s.textContent = text;
    $('.ec-maplabels').append(s);
    return s;
  };
  const diagMid = new THREE.Vector3(
    (city.diag.ax + city.diag.bx) * 0.5 + (portrait ? -2.5 : -6), 0,
    0);
  diagMid.z = city.diag.az + (city.diag.bz - city.diag.az) * ((diagMid.x - city.diag.ax) / (city.diag.bx - city.diag.ax));
  const seaPt = new THREE.Vector3(x0 + 0.6, 0, city.coast(x0 + 0.6) - (portrait ? 1.6 : 2.6));
  const labels = [
    { el: mapLabel('Mar Mediterrània', 'sea'), p: seaPt },
    { el: mapLabel('Sinus node', 'sa'), p: new THREE.Vector3(city.sa.x, 0, city.sa.z + 0.62) },
    { el: mapLabel('Park · non-conducting', 'park'), p: new THREE.Vector3((city.park.x0 + city.park.x1) / 2, 0, (city.park.z0 + city.park.z1) / 2) },
    { el: mapLabel('Av. Diagonal', 'diag'), p: diagMid, dir: new THREE.Vector3(city.diag.bx - city.diag.ax, 0, city.diag.bz - city.diag.az).normalize() },
    { el: mapLabel('Long-run loop', 'run'), p: new THREE.Vector3(city.route[1][0] + 0.15, 0, (city.route[0][1] + city.route[1][1]) / 2) },
  ];

  let toastTimer = 0;
  const toast = (msg: string, tone: 'ok' | 'warn' | 'alert' = 'ok') => {
    toastEl.textContent = msg;
    toastEl.dataset.tone = tone;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('is-on'), 3600);
  };

  // ---------------------------------------------------------------- interaction
  let watchReentry = 0;
  const stimulateAt = (x: number, z: number) => {
    const [i, j] = toGrid(x, z);
    if (i < 0 || j < 0 || i >= city.nx || j >= city.ny) return;
    const k = Math.round(j) * city.nx + Math.round(i);
    if (!city.mask[k]) { toast('Nothing to excite there — that is not tissue.', 'warn'); return; }
    const frac = sim.stimulate(i, j, C * (touch ? 1.1 : 0.9));
    const r = ripples[rippleIdx++ % ripples.length];
    r.t = 0;
    r.m.visible = true;
    r.m.position.set(x, 0.02, z);
    if (frac < 0.12) {
      (r.m.material as THREE.MeshBasicMaterial).color.set('#ff7a3d');
      toast('Blocked — those cells are still refractory.', 'warn');
    } else if (frac > 0.93) {
      (r.m.material as THREE.MeshBasicMaterial).color.set('#7fe8ff');
      toast('Captured — a premature beat spreads outward.');
    } else {
      (r.m.material as THREE.MeshBasicMaterial).color.set('#ff4d7a');
      toast('Partial block — the wave can only escape one way…', 'alert');
    }
    watchReentry = 3.5;
  };
  const defibrillate = () => {
    sim.shock();
    shared.uFlash.value = reduced ? 0.4 : 1;
    nextBeat = stepCount + Math.round(SINUS_PERIOD * 0.75);
    activations.length = 0;
    toast('Shock delivered — every cell depolarised at once. Sinus rhythm restored.');
  };
  const stimulateCentre = () => stimulateAt(x0 + city.nbx * 0.5 + 0.5, z0 + city.nbz * 0.55 + 0.5);
  $<HTMLButtonElement>('[data-stim]').addEventListener('click', stimulateCentre);
  $<HTMLButtonElement>('[data-defib]').addEventListener('click', defibrillate);
  $<HTMLButtonElement>('[data-pace]').addEventListener('click', () => openPanel('about'));

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 's' || e.key === 'S') stimulateCentre();
    else if (e.key === 'd' || e.key === 'D') defibrillate();
  });

  const ray = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const pick = (cx: number, cy: number) => {
    ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(groundPlane, hit);
  };
  let down: { x: number; y: number } | null = null;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return; }
    down = null;
    const p = pick(e.clientX, e.clientY);
    if (p) stimulateAt(p.x, p.z);
  });
  let hover: { x: number; y: number } | null = null;
  cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') hover = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerleave', () => { hover = null; probeEl.classList.remove('is-on'); });

  // ---------------------------------------------------------------- camera framing
  const target = new THREE.Vector3(portrait ? 0 : 0.4, 0, portrait ? 0.6 : 0.5);
  const basePhi = portrait ? 0.7 : 0.98;   // from vertical
  const baseTheta = portrait ? -0.14 : -0.34;
  let radius = 30;
  const corners = [
    [x0, z0], [-x0, z0], [x0, -z0], [-x0, -z0],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const place = (phi: number, theta: number, r: number) => {
    camera.position.set(
      target.x + r * Math.sin(phi) * Math.sin(theta),
      target.y + r * Math.cos(phi),
      target.z + r * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  const fit = () => {
    const W = window.innerWidth, H = window.innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    // fit the grid between the title and the monitor strip
    camera.clearViewOffset();
    const xr = portrait ? 1.22 : 1.12;
    const yTop = portrait ? 0.44 : 0.62, yBot = portrait ? -0.4 : -0.62;
    let lo = 4, hi = 120;
    const v = new THREE.Vector3();
    const bounds = () => {
      let mnx = 9, mxx = -9, mny = 9, mxy = -9;
      for (const c of corners) {
        v.copy(c).project(camera);
        mnx = Math.min(mnx, v.x); mxx = Math.max(mxx, v.x); mny = Math.min(mny, v.y); mxy = Math.max(mxy, v.y);
      }
      return { mnx, mxx, mny, mxy };
    };
    for (let it = 0; it < 30; it++) {
      const r = (lo + hi) / 2;
      place(basePhi, baseTheta, r);
      const b = bounds();
      if (b.mxx - b.mnx <= 2 * xr && b.mxy - b.mny <= yTop - yBot) hi = r; else lo = r;
    }
    radius = hi;
    place(basePhi, baseTheta, radius);
    const b = bounds();
    const dx = -(b.mxx + b.mnx) / 2 + (portrait ? 0 : -0.04);
    const dy = (yTop + yBot) / 2 - (b.mxy + b.mny) / 2;
    camera.setViewOffset(W, H, -dx * W / 2, dy * H / 2, W, H);
  };
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloom.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
    fit();
    ecg.resize();
    ecg.setSpeed(Math.max(0.12, ecg_width() / (SINUS_PERIOD * 3.3)));
  };
  const ecg_width = () => ($<HTMLCanvasElement>('.ec-trace canvas').getBoundingClientRect().width || 600);
  window.addEventListener('resize', resize);
  resize();
  prefillEcg();
  loader.progress(0.8);

  // ---------------------------------------------------------------- rhythm analysis
  let psCount = 0, psSmooth = 0;
  const bpmNow = () => {
    if (activations.length < 2) return SINUS_BPM;
    if (stepCount - activations[activations.length - 1] > SINUS_PERIOD * 2.2) return 0;
    const iv = (activations[activations.length - 1] - activations[0]) / (activations.length - 1);
    return SINUS_BPM * SINUS_PERIOD / iv;
  };
  let hrShown = bpmNow();
  const analyse = () => {
    const ps = sim.phaseSingularities(2);
    psCount = ps.n;
    psSmooth = psSmooth * 0.5 + ps.n * 0.5;
    rotors.forEach((m, i) => {
      const t = ps.tips[i];
      m.visible = !!t;
      if (t) {
        const [wx, wz] = toWorld(t[0] + 1, t[1] + 1);
        m.position.set(wx, 0.9, wz);
      }
    });
    psEl.textContent = String(psCount);
    let label = 'Sinus rhythm', tone = 'ok';
    if (psCount >= 4) { label = 'Fibrillation-like'; tone = 'alert'; }
    else if (psCount > 0) { label = `Re-entry · ${psCount} rotor${psCount > 1 ? 's' : ''}`; tone = 'alert'; }
    else if (hrShown > 100) { label = 'Tachycardia'; tone = 'warn'; }
    if (rhythmEl.textContent !== label) rhythmEl.textContent = label;
    monitor.dataset.tone = tone;
    if (watchReentry > 0 && psCount > 0) {
      watchReentry = 0;
      toast('Re-entry! A rotor now drives the city faster than the sinus node. Press D to defibrillate.', 'alert');
    }
  };
  const zoneOf = (bpm: number) =>
    bpm < 100 ? 'Zone 1 · easy jog' : bpm < 130 ? 'Zone 2 · aerobic' : bpm < 155 ? 'Zone 3 · tempo'
      : bpm < 175 ? 'Zone 4 · threshold' : 'Zone 5+ · not a training run';

  // ---------------------------------------------------------------- loop
  const clock = new THREE.Clock();
  let stepAcc = 0;
  let frame = 0;
  let time = 0;
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const W = () => window.innerWidth, Hh = () => window.innerHeight;
  const project = (p: THREE.Vector3) => {
    tmp.copy(p).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * W(), y: (-tmp.y * 0.5 + 0.5) * Hh(), vis: tmp.z < 1 };
  };

  const tick = () => {
    const dt = Math.min(0.1, clock.getDelta());
    time += dt;
    shared.uTime.value = time;

    // simulation
    stepAcc += dt * STEPS_PER_SEC;
    let n = Math.min(MAX_STEPS_PER_FRAME, Math.floor(stepAcc));
    stepAcc = Math.min(stepAcc - n, 2);
    if (frame === 0) n = Math.max(n, 2);
    advance(n);
    hrShown += (bpmNow() - hrShown) * 0.2;
    if (frame % 6 === 0) {
      const hr = Math.round(hrShown);
      hrEl.textContent = hr > 0 ? String(hr) : '--';
      zoneEl.textContent = zoneOf(hr);
    }
    ecg.push(sim.ecg(), n);
    uploadField();
    if (frame % 10 === 0) analyse();
    if (watchReentry > 0) watchReentry -= dt;

    // markers
    saPulse = Math.max(0, saPulse - dt * 0.9);
    const sp = 1 - saPulse;
    saWave.scale.setScalar(0.6 + sp * 2.4);
    (saWave.material as THREE.MeshBasicMaterial).opacity = saPulse * 0.9;
    saRing.scale.setScalar(0.75 + Math.sin(time * 2) * 0.03);
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.25 + saPulse * 0.6;
    for (const r of ripples) {
      if (!r.m.visible) continue;
      r.t += dt / 1.1;
      r.m.scale.setScalar(0.5 + r.t * 3.2);
      (r.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - r.t);
      if (r.t >= 1) r.m.visible = false;
    }
    rotors.forEach((m, i) => { m.rotation.y = time * (i % 2 ? -1.6 : 1.6); });
    shared.uFlash.value = Math.max(0, shared.uFlash.value - dt * 1.6);
    runnerS += dt * (0.12 + 0.18 * Math.min(3, hrShown / SINUS_BPM)) * (reduced ? 0.5 : 1);
    routeAt(runnerS, runner.position);

    // camera drift
    const drift = reduced ? 0 : 1;
    place(basePhi + Math.sin(time * 0.05) * 0.035 * drift, baseTheta + Math.sin(time * 0.033) * 0.07 * drift,
      radius * (1 + Math.sin(time * 0.041) * 0.02 * drift));

    // HTML overlays
    for (const h of hotspots) {
      const s = project(h.p);
      h.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0)`;
    }
    for (const l of labels) {
      const s = project(l.p);
      let rot = 0;
      if (l.dir) {
        tmp2.copy(l.p).add(l.dir).project(camera);
        rot = Math.atan2(-(tmp2.y - tmp.y) * Hh(), (tmp2.x - tmp.x) * W());
        const s2 = project(l.p);
        l.el.style.transform = `translate3d(${s2.x.toFixed(1)}px, ${s2.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${rot.toFixed(3)}rad)`;
        continue;
      }
      l.el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
    if (hover) {
      const p = pick(hover.x, hover.y);
      let txt = '';
      if (p) {
        const [i, j] = toGrid(p.x, p.z);
        const ii = Math.round(i), jj = Math.round(j);
        if (ii >= 0 && jj >= 0 && ii < city.nx && jj < city.ny && city.mask[jj * city.nx + ii]) {
          const k = jj * city.nx + ii;
          const u = sim.u[k], v = sim.v[k];
          const state = u > 0.5 ? 'EXCITED' : v > 0.16 ? 'REFRACTORY' : v > 0.045 ? 'VULNERABLE' : 'EXCITABLE';
          txt = `${state}  u ${u.toFixed(2)}  v ${v.toFixed(2)}`;
          probeEl.dataset.state = state.toLowerCase();
        }
      }
      probeEl.textContent = txt;
      probeEl.classList.toggle('is-on', !!txt);
      probeEl.style.transform = `translate3d(${hover.x + 16}px, ${hover.y + 14}px, 0)`;
    }

    composer.render();
    ecg.draw(psCount > 0 ? '#ff6b8f' : '#7fe8ff');
    frame++;
    if (frame === 2) {
      loader.progress(1);
      loader.done();
      window.__conceptReady = true;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
