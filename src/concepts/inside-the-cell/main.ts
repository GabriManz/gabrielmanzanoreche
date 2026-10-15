import '@fontsource/instrument-serif/400.css';
import { mountChapterNav } from '../../shared/chapters';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import * as THREE from 'three';
import { mountChrome, createLoader, openPanel } from '../../shared/chrome';
import { person, research } from '../../shared/content';
import { prefersReducedMotion } from '../../shared/env';
import './style.css';
import { makePipeline } from './fx';
import { createTissue } from './tissue';
import { createCell } from './cell';
import { createDyad, TIME_STRETCH } from './dyad';
import { type Stop, clamp01, easeInCubic, easeOutCubic } from './stop';

const ok = mountChrome({
  concept: 'Inside the Cell',
  status: 'Concept C prototype — illustrative toy models and synthetic data, not validated physiology',
  needsWebGL: true,
});
mountChapterNav('inside-the-cell', 'top');

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const itemPanel = (i: number) => openPanel({ title: research[i].title, html: `<p>${esc(research[i].body)}</p>` });

const COPY = [
  {
    slug: 'tissue', kicker: '01 — Tissue · cardiac muscle', mag: '100 µm',
    title: person.name, sub: person.tagline, hero: true,
    body: 'Heart muscle is a branching network of cardiomyocytes, coupled end to end so that each electrical impulse makes them contract together. Underneath every beat is a calcium signal.',
    actions: [{ label: 'Dive into a cell', go: 1 }, { label: 'About', panel: 'about' }],
  },
  {
    slug: 'cell', kicker: '02 — Cell · one cardiomyocyte', mag: '10 µm',
    title: 'A cell that keeps time', sub: '', hero: false,
    body: 'Roughly 100 µm long and striped by sarcomeres. With each beat, an action potential triggers near-simultaneous Ca²⁺ release at thousands of sites along the Z-lines — the calcium transient that drives contraction. Raise the SR load and watch what happens between beats.',
    actions: [{ label: 'Research', panel: 'research' }, { label: 'Into the release unit', go: 2 }],
  },
  {
    slug: 'dyad', kicker: '03 — Dyad · calcium release unit', mag: '100 nm',
    title: 'Where a spark is born', sub: '', hero: false,
    body: 'A T-tubule meets the sarcoplasmic reticulum across a cleft of about 15 nm. A little Ca²⁺ entering through L-type channels opens clusters of ryanodine receptors (RyR2), which release far more from the SR store: a calcium spark. When this release fires on its own, it can seed arrhythmia.',
    actions: [{ label: 'Research', panel: 'research' }, { label: 'Imaging & analysis', item: 1 }],
  },
] as const;

if (ok) boot();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = '') {
  const e = document.createElement(tag);
  e.className = cls; e.innerHTML = html;
  return e;
}

function boot() {
  const reduced = prefersReducedMotion();
  const loader = createLoader('Preparing specimen');
  let mobile = innerWidth < 700;

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const dpr = () => Math.min(devicePixelRatio, mobile ? 1.5 : 2);
  renderer.setPixelRatio(dpr());
  renderer.setSize(innerWidth, innerHeight);
  renderer.domElement.className = 'itc-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  document.body.prepend(renderer.domElement);
  loader.progress(0.2);

  const tissue = createTissue(mobile, reduced);
  const cell = createCell(mobile, reduced);
  const dyad = createDyad(mobile, reduced);
  const stops: Stop[] = [tissue, cell, dyad];
  loader.progress(0.5);

  const { composer, renderPass, bloom, final } = makePipeline(renderer, innerWidth, innerHeight, mobile);

  // ------------------------------------------------------------------ UI
  const ui = el('div', 'itc-ui');
  ui.innerHTML = `
    <div class="itc-meta" aria-hidden="true">
      <span><i class="sw sw-fire"></i>CH1 · Ca²⁺ indicator</span>
      <span><i class="sw sw-stain"></i>CH2 · membrane</span>
      <span class="itc-tc">T+ 00:00.00</span>
      <span class="itc-keys">Scroll · swipe · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span>
    </div>
    <nav class="itc-ruler" aria-label="Scale">
      <span class="itc-ruler-line" aria-hidden="true"><i></i></span>
      ${COPY.map((c, i) => `<button data-go="${i}"><span class="n">0${i + 1}</span><span class="t">${c.slug}</span><span class="m">${c.mag}</span></button>`).join('')}
    </nav>
    <section class="itc-copy" aria-live="polite"></section>
    <div class="itc-callouts" aria-hidden="true"></div>
    <div class="itc-targets"></div>
    <div class="itc-panel itc-panel-cell" hidden>
      <div class="itc-ph"><span>SR Ca²⁺ load</span><span class="itc-chip" data-state="quiet">Quiet</span></div>
      <div class="itc-slider">
        <input type="range" min="0" max="100" value="35" aria-label="SR calcium load (illustrative)" />
        <span class="itc-thr" style="left:74%" title="Wave threshold in this toy model"></span>
        <div class="itc-scale"><span>low</span><span class="thr">threshold</span><span>high</span></div>
      </div>
      <div class="itc-stats"><span>Spontaneous events <b class="v-sp">0</b>/s</span><span>Recruited <b class="v-rc">0</b>/s</span></div>
      <figure class="itc-scan">
        <canvas class="itc-fs" width="300" height="72" role="img" aria-label="Frame scan: the current x–y frame of the model cell's calcium fluorescence, with a region of interest box"></canvas>
        <canvas class="itc-roi" width="300" height="46" role="img" aria-label="ΔF/F0 over time inside the region of interest"></canvas>
        <figcaption><span>Frame scan x–y · synthetic</span><span><i class="itc-roi-key"></i>ROI ΔF/F₀ · t →</span></figcaption>
      </figure>
      <div class="itc-row">
        <button class="itc-btn ghost" data-act="pace" aria-pressed="true">Pacing on</button>
        <button class="itc-btn ghost" data-act="spark">Trigger a spark</button>
      </div>
    </div>
    <div class="itc-panel itc-panel-dyad" hidden>
      <div class="itc-ph"><span>F/F₀ at the release unit</span><span class="itc-chip" data-state="quiet">synthetic</span></div>
      <figure class="itc-trace"><canvas width="300" height="90"></canvas></figure>
      <p class="itc-note">Time stretched ${TIME_STRETCH}× for visibility — a real spark rises in ~30 ms and decays in ~100 ms.</p>
      <p class="itc-hint-tap">Tap a cluster or press <kbd>Space</kbd></p>
    </div>
    <div class="itc-foot">
      <div class="itc-lut" aria-hidden="true"><i></i><span>F low</span><span>high</span></div>
      <div class="itc-scalebar" aria-hidden="true"><i></i><span></span></div>
    </div>
    <p class="itc-disclaimer">Illustrative toy model — not a validated physiological simulation.</p>
`;
  document.body.append(ui);

  const $ = <T extends Element>(s: string) => ui.querySelector(s) as T;
  const copyEl = $('.itc-copy') as HTMLElement;
  const callEl = $('.itc-callouts') as HTMLElement;
  const targetsEl = $('.itc-targets') as HTMLElement;
  const cellPanel = $('.itc-panel-cell') as HTMLElement;
  const dyadPanel = $('.itc-panel-dyad') as HTMLElement;
  const tcEl = $('.itc-tc') as HTMLElement;
  const barEl = $('.itc-scalebar i') as HTMLElement;
  const barLbl = $('.itc-scalebar span') as HTMLElement;
  const rulerBtns = [...ui.querySelectorAll<HTMLButtonElement>('.itc-ruler button')];
  const rulerDot = $('.itc-ruler-line i') as HTMLElement;

  function renderCopy(i: number) {
    const c = COPY[i];
    copyEl.dataset.stop = c.slug;
    copyEl.innerHTML = `
      <p class="itc-kicker">${c.kicker}</p>
      ${c.hero ? `<h1 class="itc-title hero">${esc(c.title)}</h1>` : `<h2 class="itc-title">${esc(c.title)}</h2>`}
      ${c.sub ? `<p class="itc-sub">${esc(c.sub)}</p>` : ''}
      <p class="itc-body">${esc(c.body)}</p>
      <div class="itc-row">${c.actions.map((a, k) => `<button class="itc-btn${k === 0 ? '' : ' ghost'}" data-k="${k}">${a.label}${'go' in a ? ' <span aria-hidden="true">↓</span>' : ''}</button>`).join('')}</div>`;
    copyEl.querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) => b.addEventListener('click', () => {
      const a = c.actions[Number(b.dataset.k)] as { go?: number; panel?: 'about' | 'research'; item?: number };
      if (a.go !== undefined) go(a.go);
      else if (a.panel) openPanel(a.panel);
      else if (a.item !== undefined) itemPanel(a.item);
    }));
    rulerBtns.forEach((b, k) => b.toggleAttribute('aria-current', k === i));
    rulerDot.style.setProperty('--p', String(i / 2));
    cellPanel.hidden = i !== 1;
    dyadPanel.hidden = i !== 2;
    document.body.dataset.stop = c.slug;
  }

  // callouts
  type Call = { stop: number; a: Stop['anchors'][number]; node: HTMLElement; line: SVGPolylineElement };
  const calls: Call[] = [];
  stops.forEach((s, si) => s.anchors.forEach((a) => {
    const node = el('div', `itc-call${a.mobile ? ' m' : ''}`, `<svg><polyline/></svg><span class="dot"></span><span class="lbl">${a.label}</span>`);
    callEl.append(node);
    calls.push({ stop: si, a, node, line: node.querySelector('polyline')! });
  }));

  // dyad cluster targets (keyboard-accessible proxies for 3D objects)
  const tBtns = dyad.clusters.map((c, k) => {
    const b = el('button', 'itc-target', `<span class="ring"></span><span class="tl">${String.fromCharCode(65 + k)}</span>`) as HTMLButtonElement;
    b.setAttribute('aria-label', `Trigger a calcium spark at release unit ${String.fromCharCode(65 + k)} (${c.size} RyR2 tetramers, illustrative)`);
    b.addEventListener('click', () => { userSpark(k); });
    b.addEventListener('pointerenter', () => (dyad.selected = k));
    b.addEventListener('focus', () => (dyad.selected = k));
    b.addEventListener('pointerleave', () => (dyad.selected = -1));
    b.addEventListener('blur', () => (dyad.selected = -1));
    targetsEl.append(b);
    return b;
  });
  let lastUser = -10;
  let nextCluster = 1;
  function userSpark(k?: number) {
    const idx = k ?? (dyad.selected >= 0 ? dyad.selected : nextCluster);
    nextCluster = (idx + 2) % dyad.clusters.length;
    dyad.trigger(idx);
    lastUser = clock;
  }

  // cell controls
  const range = $('.itc-panel-cell input') as HTMLInputElement;
  const chip = $('.itc-panel-cell .itc-chip') as HTMLElement;
  const vSp = $('.v-sp') as HTMLElement, vRc = $('.v-rc') as HTMLElement;
  range.addEventListener('input', () => (cell.sim.load = Number(range.value) / 100));
  const paceBtn = $('[data-act="pace"]') as HTMLButtonElement;
  paceBtn.addEventListener('click', () => {
    cell.pacing = !cell.pacing;
    paceBtn.setAttribute('aria-pressed', String(cell.pacing));
    paceBtn.textContent = cell.pacing ? 'Pacing on' : 'Pacing off';
  });
  $('[data-act="spark"]')!.addEventListener('click', () => cell.sim.spark());

  // frame-scan inset + trace canvases
  const LUT = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = (i / 255) * 1.3;
    const ss = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const r = 0.55 * ss(0, 0.25, v) + 0.75 * ss(0.15, 0.5, v) + 0.5 * ss(0.4, 0.8, v) + 0.6 * ss(0.75, 1.25, v);
    const g = 0.02 * ss(0, 0.25, v) + 0.16 * ss(0.15, 0.5, v) + 0.55 * ss(0.4, 0.8, v) + 0.7 * ss(0.75, 1.25, v);
    const b = 0.1 * ss(0, 0.25, v) + 0.05 * ss(0.4, 0.8, v) + 0.75 * ss(0.75, 1.25, v);
    const k = 0.6 + 1.6 * v;
    LUT[i * 3] = Math.min(255, Math.pow(r * k, 0.6) * 255);
    LUT[i * 3 + 1] = Math.min(255, Math.pow(g * k, 0.6) * 255);
    LUT[i * 3 + 2] = Math.min(255, Math.pow(b * k, 0.6) * 255);
  }
  // Frame-scan inset: each "frame" is the whole x–y fluorescence field of the toy cell model
  // (grid 200 × 48 ≈ 100 × 24 µm), plus the ΔF/F0 time course of one region of interest.
  const fsCv = $('.itc-fs') as HTMLCanvasElement;
  const fs = fsCv.getContext('2d')!;
  const roiCv = $('.itc-roi') as HTMLCanvasElement;
  const roiX = roiCv.getContext('2d')!;
  const { nx: FX, ny: FY } = cell.sim;
  const frameCv = document.createElement('canvas');
  frameCv.width = FX; frameCv.height = FY;
  const frameX = frameCv.getContext('2d')!;
  const frameImg = frameX.createImageData(FX, FY);
  const ROI = { x: 94, y: 18, w: 12, h: 12 };   // grid cells (≈ 6 × 6 µm)
  const F_REST = 0.15;                           // resting fluorescence offset of the toy field
  const roiHist = new Float32Array(300);
  // resting image for display: dim, with faint striation at the release-site columns (Z-lines, every ~2 µm)
  const restImg = new Float32Array(FX * FY);
  for (let y = 0; y < FY; y++) for (let x = 0; x < FX; x++) {
    const edge = Math.min(y, FY - 1 - y) < 2 ? 0.6 : 1;
    restImg[y * FX + x] = edge * (0.05 + 0.025 * (0.5 + 0.5 * Math.cos((2 * Math.PI * (x - 2)) / 4)));
  }
  let scanAcc = 0, traceAcc = 0, roiMax = 2;
  function drawScan(dt: number) {
    scanAcc += dt * 42;            // frames per second of the inset (time-based, frame-rate independent)
    const n = Math.min(60, Math.floor(scanAcc));
    if (n < 1) return;
    scanAcc -= n;
    const c = cell.sim.c;
    // ROI ΔF/F0 for this frame
    let acc = 0;
    for (let y = ROI.y; y < ROI.y + ROI.h; y++) for (let x = ROI.x; x < ROI.x + ROI.w; x++) acc += c[y * FX + x];
    const dff = acc / (ROI.w * ROI.h) / F_REST;
    roiHist.copyWithin(0, n);
    for (let k = 0; k < n; k++) roiHist[299 - k] = dff + (Math.random() - 0.5) * 0.08;
    if (!document.body.contains(fsCv) || cellPanel.hidden) return;
    // x–y frame with a little shot-noise-like grain
    const d = frameImg.data;
    for (let i = 0; i < FX * FY; i++) {
      const F = restImg[i] + c[i];
      const v = Math.max(0, F + (Math.random() - 0.5) * 0.16 * Math.sqrt(F));
      const li = Math.min(255, Math.floor(v * 190)) * 3;
      d[i * 4] = LUT[li]; d[i * 4 + 1] = LUT[li + 1]; d[i * 4 + 2] = LUT[li + 2]; d[i * 4 + 3] = 255;
    }
    frameX.putImageData(frameImg, 0, 0);
    const sx = fsCv.width / FX, sy = fsCv.height / FY;
    fs.imageSmoothingEnabled = true;
    fs.drawImage(frameCv, 0, 0, fsCv.width, fsCv.height);
    fs.strokeStyle = '#ffffff'; fs.lineWidth = 1;
    fs.strokeRect(ROI.x * sx + 0.5, ROI.y * sy + 0.5, ROI.w * sx, ROI.h * sy);
    fs.font = '8px "JetBrains Mono Variable", monospace';
    fs.fillStyle = 'rgba(255,255,255,.9)';
    fs.fillText('ROI', ROI.x * sx, ROI.y * sy - 3);
    fs.fillRect(fsCv.width - 6 - 20 * sx, fsCv.height - 6, 20 * sx, 2);   // 20 grid cells ≈ 10 µm
    fs.fillText('10 µm', fsCv.width - 6 - 20 * sx, fsCv.height - 10);
    // ROI trace
    let mx = 0;
    for (let i = 0; i < 300; i++) if (roiHist[i] > mx) mx = roiHist[i];
    roiMax += (Math.max(2, mx * 1.15) - roiMax) * 0.05;
    const H = roiCv.height, Y = (v: number) => H - 6 - (v / roiMax) * (H - 12);
    roiX.clearRect(0, 0, 300, H);
    roiX.strokeStyle = 'rgba(180,170,255,.14)'; roiX.lineWidth = 1;
    roiX.beginPath(); roiX.moveTo(0, Y(0) + 0.5); roiX.lineTo(300, Y(0) + 0.5); roiX.stroke();
    roiX.fillStyle = 'rgba(200,190,255,.5)'; roiX.font = '8px "JetBrains Mono Variable", monospace';
    roiX.fillText('0', 2, Y(0) - 2); roiX.fillText(roiMax.toFixed(1), 2, 9);
    roiX.strokeStyle = '#ffc23a'; roiX.lineWidth = 1.4;
    roiX.beginPath();
    for (let x = 0; x < 300; x++) { const y = Y(roiHist[x]); x ? roiX.lineTo(x, y) : roiX.moveTo(x, y); }
    roiX.stroke();
  }
  const trace = ($('.itc-trace canvas') as HTMLCanvasElement).getContext('2d')!;
  const tr = new Float32Array(300).fill(1);
  function drawTrace(dt: number) {
    traceAcc += dt * 60;
    const n = Math.min(120, Math.floor(traceAcc));
    if (n < 1) return;
    traceAcc -= n;
    tr.copyWithin(0, n);
    const v = 1 + dyad.signal() * 1.6;
    for (let k = 0; k < n; k++) tr[299 - k] = v + (Math.random() - 0.5) * 0.06;
    trace.clearRect(0, 0, 300, 90);
    trace.strokeStyle = 'rgba(180,170,255,.14)'; trace.lineWidth = 1;
    for (const y of [80, 55, 30]) { trace.beginPath(); trace.moveTo(0, y + 0.5); trace.lineTo(300, y + 0.5); trace.stroke(); }
    trace.fillStyle = 'rgba(200,190,255,.45)'; trace.font = '9px "JetBrains Mono Variable", monospace';
    trace.fillText('1.0', 2, 77); trace.fillText('2.0', 2, 52); trace.fillText('3.0', 2, 27);
    const grad = trace.createLinearGradient(0, 85, 0, 10);
    grad.addColorStop(0, '#7a0d1c'); grad.addColorStop(0.35, '#ff5a14'); grad.addColorStop(0.7, '#ffc23a'); grad.addColorStop(1, '#fff4dc');
    trace.strokeStyle = grad; trace.lineWidth = 1.6;
    trace.beginPath();
    for (let x = 0; x < 300; x++) { const y = 80 - (tr[x] - 1) * 25; x ? trace.lineTo(x, y) : trace.moveTo(x, y); }
    trace.stroke();
  }

  // ------------------------------------------------------------------ navigation
  const startHash = location.hash.replace('#', '');
  let cur = Math.max(0, COPY.findIndex((c) => c.slug === startHash));
  let trans: { from: number; to: number; t0: number; dur: number; swapped: boolean } | null = null;
  let clock = 0;
  let lastNav = -10;

  function go(to: number) {
    to = Math.max(0, Math.min(2, to));
    if (trans || to === cur) return;
    lastNav = clock;
    if (reduced) {
      cur = to; renderCopy(cur); arrive(cur);
      history.replaceState(null, '', '#' + COPY[cur].slug);
      return;
    }
    trans = { from: cur, to, t0: clock, dur: 2.4, swapped: false };
    copyEl.classList.add('is-out');
    document.body.classList.add('is-moving');
  }
  function arrive(i: number) {
    if (i === 2) { arrivedDyad = clock; }
    history.replaceState(null, '', '#' + COPY[i].slug);
  }
  let arrivedDyad = -10;

  rulerBtns.forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));

  const dialogOpen = () => !!document.querySelector('dialog[open]');
  addEventListener('keydown', (e) => {
    if (dialogOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    const inField = t.closest('input, textarea, select');
    if (e.key === '1' || e.key === '2' || e.key === '3') { go(Number(e.key) - 1); return; }
    if (inField) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(cur + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1); }
    else if (e.key === ' ' && !t.closest('button, a')) {
      e.preventDefault();
      if (cur === 2) userSpark(); else if (cur === 1) cell.sim.spark();
    }
  });
  let wheelAcc = 0;
  addEventListener('wheel', (e) => {
    if (dialogOpen() || (e.target as HTMLElement).closest('.itc-panel')) return;
    e.preventDefault();
    wheelAcc += e.deltaY;
    if (trans || clock - lastNav < 1.0) { wheelAcc = 0; return; }
    if (Math.abs(wheelAcc) > 70) { go(cur + Math.sign(wheelAcc)); wheelAcc = 0; }
  }, { passive: false });
  let touch: { x: number; y: number; t: number } | null = null;
  addEventListener('touchstart', (e) => {
    const t = e.target as HTMLElement;
    if (dialogOpen() || t.closest('input, button, .itc-panel, a')) { touch = null; return; }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() };
  }, { passive: true });
  addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
    if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.2) go(cur + (dy < 0 ? 1 : -1));
    touch = null;
  });

  // clicks in 3D
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', (e) => { pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = (e.clientY / innerHeight) * 2 - 1; });
  renderer.domElement.addEventListener('click', (e) => {
    if (trans) return;
    if (cur === 1) {
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, cell.camera);
      const hit = cell.pick(ray);
      if (hit) cell.sparkAt(hit.u, hit.v);
    } else if (cur === 2) {
      // nearest cluster on screen
      let best = -1, bd = 90 * 90;
      tBtns.forEach((b, k) => {
        const r = b.getBoundingClientRect();
        const d = (r.x + r.width / 2 - e.clientX) ** 2 + (r.y + r.height / 2 - e.clientY) ** 2;
        if (d < bd) { bd = d; best = k; }
      });
      if (best >= 0) userSpark(best);
    }
  });

  // ------------------------------------------------------------------ resize
  function resize() {
    mobile = innerWidth < 700;
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(dpr());
    renderer.setSize(w, h);
    composer.setPixelRatio(dpr());
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    final.uniforms.uAspect.value = w / h;
    stops.forEach((s) => { s.camera.aspect = w / h; s.camera.updateProjectionMatrix(); s.resize?.(w, h, mobile); });
    document.body.classList.toggle('is-mobile', mobile);
  }
  addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------------ camera rig
  const tmp = new THREE.Vector3(), tmpL = new THREE.Vector3();
  const portrait = () => innerWidth / innerHeight < 0.8;
  function fitFactor(s: Stop) {
    const a = innerWidth / innerHeight;
    if (s === tissue) return a < 1 ? 0.85 : 1;
    if (portrait()) return s === cell ? 1.05 : 1.9; // portrait: roll the camera instead of backing off
    return a < 1.3 ? 1.12 : 1;
  }
  /** mode: 0 rest, +k diving in (0..1), -k pulling out (0..1). */
  function placeCamera(s: Stop, mode: 'rest' | 'in' | 'out', k: number, t: number) {
    const f = fitFactor(s);
    tmpL.copy(s.camLook);
    tmp.copy(s.camPos).sub(s.camLook).multiplyScalar(f).add(s.camLook);
    if (!reduced) {
      const d = tmp.distanceTo(tmpL);
      tmp.x += (Math.sin(t * 0.11) * 0.025 + pointer.sx * 0.03) * d;
      tmp.y += (Math.sin(t * 0.083) * 0.015 - pointer.sy * 0.02) * d;
    }
    if (mode === 'in') {
      tmp.lerp(s.diveTarget, 0.93 * k);
      tmpL.lerp(s.diveTarget, Math.min(1, k * 1.4));
    } else if (mode === 'out') {
      tmp.sub(tmpL).multiplyScalar(1 + 4.5 * k).add(tmpL);
    }
    s.camera.position.copy(tmp);
    s.camera.lookAt(tmpL);
    // on tall screens, roll so the long cell / tubule runs down the diagonal
    if (portrait() && s !== tissue) s.camera.rotateZ(s === cell ? -0.95 : -0.8);
  }

  // ------------------------------------------------------------------ frame
  const proj = new THREE.Vector3(), right = new THREE.Vector3(), p2 = new THREE.Vector3();
  function projectPx(v: THREE.Vector3, cam: THREE.Camera) {
    proj.copy(v).project(cam);
    return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight, vis: proj.z < 1 && proj.z > -1 };
  }

  let shown = cur;
  let last = performance.now();
  let first = true;
  let tcLast = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 2);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 2);

    let fade = 0, zoom = 0;
    if (trans) {
      const p = clamp01((clock - trans.t0) / trans.dur);
      const deeper = trans.to > trans.from;
      if (p < 0.5) {
        const k = easeInCubic(p * 2);
        shown = trans.from;
        placeCamera(stops[shown], deeper ? 'in' : 'out', k, clock);
        fade = Math.pow(p * 2, 3); zoom = k;
      } else {
        if (!trans.swapped) { trans.swapped = true; renderCopy(trans.to); }
        const k = 1 - easeOutCubic((p - 0.5) * 2);
        shown = trans.to;
        placeCamera(stops[shown], deeper ? 'out' : 'in', k, clock);
        fade = Math.pow(k, 3); zoom = k;
      }
      if (p >= 1) {
        cur = trans.to; trans = null;
        copyEl.classList.remove('is-out');
        document.body.classList.remove('is-moving');
        arrive(cur);
      }
    } else {
      shown = cur;
      placeCamera(stops[cur], 'rest', 0, clock);
    }

    const s = stops[shown];
    stops.forEach((st, i) => st.update(clock, dt, i === shown));
    if (shown === 1) drawScan(dt);
    if (shown === 2) {
      drawTrace(dt);
      if (!trans && arrivedDyad > 0 && clock - arrivedDyad > 0.25) { arrivedDyad = -10; userSpark(1); lastUser = -10; }
      if (!trans && !reduced && clock - lastUser > 7 && Math.random() < dt / 3.5) dyad.trigger(Math.floor(Math.random() * dyad.clusters.length));
    }

    renderPass.scene = s.scene;
    renderPass.camera = s.camera;
    final.uniforms.uTime.value = clock % 100;
    final.uniforms.uFade.value = fade;
    final.uniforms.uZoom.value = zoom;
    composer.render(dt);

    // overlay: callouts, targets, scale bar
    const showCalls = !trans;
    s.root?.updateMatrixWorld();
    for (const c of calls) {
      const vis = showCalls && c.stop === shown && (!mobile || c.a.mobile);
      c.node.classList.toggle('on', vis);
      if (c.stop !== shown) continue;
      const wp = s.root ? s.root.localToWorld(p2.copy(c.a.pos)) : p2.copy(c.a.pos);
      const q = projectPx(wp, s.camera);
      const k = mobile ? 0.6 : 1;
      let dx = c.a.dx * k;
      const dy = c.a.dy * k;
      const lw = (c.node.querySelector('.lbl') as HTMLElement).offsetWidth + 30;
      const rightLimit = innerWidth - (mobile ? 12 : 190);
      if (dx > 0 && q.x + dx + lw > rightLimit) dx = -dx;
      else if (dx < 0 && q.x + dx - lw < 12) dx = -dx;
      if (!q.vis || q.x < 0 || q.x > innerWidth || q.y < 60 || q.y > innerHeight) c.node.classList.remove('on');
      c.node.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
      const ex = dx + (dx > 0 ? 24 : -24);
      c.line.setAttribute('points', `0,0 ${dx},${dy} ${ex},${dy}`);
      const lbl = c.node.querySelector('.lbl') as HTMLElement;
      lbl.style.transform = `translate(${(dx > 0 ? ex + 6 : ex - 6).toFixed(0)}px, ${dy}px) translate(${dx > 0 ? '0' : '-100%'}, -50%)`;
    }
    targetsEl.classList.toggle('on', shown === 2 && !trans);
    if (shown === 2) {
      dyad.clusters.forEach((c, k) => {
        const wp = dyad.root!.localToWorld(p2.copy(c.center));
        const q = projectPx(wp, dyad.camera);
        tBtns[k].style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
        const act = clock - c.fired;
        tBtns[k].classList.toggle('fire', act > 0 && act < 1.2);
      });
    }
    // live scale bar measured at the focal point
    right.setFromMatrixColumn(s.camera.matrixWorld, 0).multiplyScalar(s.scale.length);
    const a = projectPx(s.scale.at, s.camera), b = projectPx(p2.copy(s.scale.at).add(right), s.camera);
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    barEl.style.width = `${Math.max(8, Math.min(260, px)).toFixed(0)}px`;
    barLbl.textContent = s.scale.label;

    if (clock - tcLast > 0.05) {
      tcLast = clock;
      const m = Math.floor(clock / 60), sec = clock % 60;
      tcEl.textContent = `T+ ${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
      if (shown === 1) {
        const st = cell.sim.stats();
        vSp.textContent = String(st.spontaneous); vRc.textContent = String(st.recruited);
        const state = st.wave ? 'wave' : st.spontaneous + st.recruited > 2 ? 'sparks' : 'quiet';
        if (chip.dataset.state !== state) {
          chip.dataset.state = state;
          chip.textContent = state === 'wave' ? 'Propagating wave' : state === 'sparks' ? 'Sparks' : 'Quiet';
        }
      }
    }

    if (first) {
      first = false;
      loader.progress(1);
      loader.done();
      requestAnimationFrame(() => { window.__conceptReady = true; });
    }
    requestAnimationFrame(frame);
  }

  // test hook: advance the cell model quickly (headless captures run at ~1 fps)
  (window as unknown as { __itcAdvance: (s: number) => void }).__itcAdvance = (s: number) => {
    for (let i = 0; i < s * 60; i++) { cell.update(clock, 1 / 60, true); drawScan(1 / 60); }
  };
  // pre-roll the cell model a few seconds so the frame-scan ROI trace opens with history
  for (let i = 0; i < 430; i++) { cell.update(i / 60, 1 / 60, true); drawScan(1 / 60); }

  // warm up shaders, then go
  renderCopy(cur);
  stops.forEach((s) => { placeCamera(s, 'rest', 0, 0); renderer.compile(s.scene, s.camera); });
  loader.progress(0.85);
  if (cur === 2) arrivedDyad = 0.01;
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  requestAnimationFrame(frame);
}
