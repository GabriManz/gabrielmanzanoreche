/**
 * Synthetic confocal FRAME-SCAN (x–y–t) generator + a real, compact spark detector.
 * Pure TypeScript, no DOM — shared by any concept that needs it.
 *
 * WHAT IS REAL AND WHAT IS NOT
 * - Acquisition parameters are matched to Gabriel's setup: Fluo-4, human atrial
 *   cardiomyocytes, native pixel size 0.060184 µm/px, frame interval 5.820 ms.
 * - Everything else is SYNTHETIC: the cell outline, its striation, the noise and
 *   every spark are procedurally generated from a seed. Spark characteristics
 *   are generic, textbook-plausible ranges (FWHM 1.5–2.5 µm, rise 10–20 ms,
 *   decay τ 20–40 ms, ΔF/F0 0.3–1.4, plus two faint ones near threshold).
 *   No measured values from any experiment are used or reproduced.
 *
 * Performance: the series is synthesised directly on a 2×2-binned grid
 * (0.120 µm/px). Shot noise is drawn for the summed photon count of each bin,
 * which is statistically equivalent to binning a 0.060 µm/px acquisition.
 *
 * Detector (see `detect`): cell mask (Otsu on the temporal mean) → F0 =
 * per-pixel temporal median → ΔF/F0 → mask-normalised spatial + temporal
 * smoothing → robust noise σ (MAD) → hysteresis threshold → 3-D (x, y, t)
 * connected components → per-spark amplitude, FWHM, FDHM, time to peak,
 * centroid, and a spark frequency normalised to the mask area.
 */
import { rng } from './env';

export const DX_NATIVE = 0.060184; // µm / px  (Gabriel's setup)
export const DT_FRAME = 5.82;      // ms / frame (Gabriel's setup)

export interface FrameScanOpts {
  bin?: number;      // spatial binning applied at synthesis (default 2)
  width?: number;    // binned px
  height?: number;   // binned px
  frames?: number;
  sparks?: number;   // regular sparks
  faint?: number;    // sparks near the detection threshold
}

export interface SparkTruth {
  x: number; y: number;  // px (binned grid)
  t0: number;            // onset, ms
  tPeak: number;         // ms
  amp: number;           // ΔF/F0 at the centre
  fwhm_um: number;
  rise_ms: number;
  tau_ms: number;
  faint: boolean;
}

export interface FrameSeries {
  seed: number;
  width: number; height: number; frames: number;
  /** frames × height × width, index = f·W·H + y·W + x (photon-count-like units) */
  data: Float32Array;
  dx: number;            // µm/px of `data` (binned)
  dxNative: number;      // µm/px of the modelled acquisition
  bin: number;
  dt: number;            // ms/frame
  /** ground-truth cell footprint used by the generator (detector derives its own) */
  cellMask: Uint8Array;
  truth: SparkTruth[];
  baseline: number;      // typical in-cell resting F (for display scaling)
}

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Temporal profile normalised to 1 at the peak (t in ms since onset). */
export function sparkKinetics(t: number, rise: number, tau: number): number {
  if (t <= 0) return 0;
  if (t < rise) return smooth01(t / rise);
  return Math.exp(-(t - rise) / tau);
}

export function generate(seed = 42, opts: FrameScanOpts = {}): FrameSeries {
  const bin = opts.bin ?? 2;
  const W = opts.width ?? 240, H = opts.height ?? 120, F = opts.frames ?? 160;
  const nSparks = opts.sparks ?? 12, nFaint = opts.faint ?? 2;
  const dx = DX_NATIVE * bin, dt = DT_FRAME;
  const r = rng(seed);
  // ---- cell footprint: a portion of an elongated myocyte with irregular edges and one rounded end
  const N = W * H;
  const lenUm = W * dx, hUm = H * dx;
  const tilt = (r() - 0.5) * 0.08;
  const bendA = 0.35 + r() * 0.5, bendP = r() * 6.28;
  const halfW = 4.6 + r() * 0.8;                       // µm
  const endX = lenUm * (0.84 + r() * 0.08);             // rounded end inside the field
  const edgeTop: number[] = [], edgeBot: number[] = [];
  const wob = (ph: number[], amps: number[], x: number) => amps.reduce((s, a, k) => s + a * Math.sin((x / lenUm) * 6.283 * (k + 1.3) + ph[k]), 0);
  const phT = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28], phB = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  const ampE = [0.35, 0.22, 0.12, 0.08];
  for (let x = 0; x < W; x++) {
    const xu = x * dx;
    const cy = hUm / 2 + tilt * (xu - lenUm / 2) + bendA * Math.sin((xu / lenUm) * 3.1 + bendP) * 0.6;
    let hw = halfW;
    const capStart = endX - halfW * 1.1;
    if (xu > capStart) hw *= Math.sqrt(Math.max(0, 1 - ((xu - capStart) / (endX - capStart)) ** 2));
    if (hw <= 0) { edgeTop.push(cy + 99); edgeBot.push(cy - 99); continue; } // beyond the cell end
    edgeTop.push(cy - hw - (hw > 0.5 ? wob(phT, ampE, xu) : 0));
    edgeBot.push(cy + hw + (hw > 0.5 ? wob(phB, ampE, xu) : 0));
  }
  // smooth in-cell texture (mitochondria / SR heterogeneity), fixed per seed
  const tex = new Float32Array(N);
  const blobs = Array.from({ length: 70 }, () => ({ x: r() * W, y: r() * H, s: 4 + r() * 14, a: (r() - 0.5) * 0.12 }));
  const period = (1.82 + r() * 0.16) / dx;             // striation ≈ sarcomere length, px
  const phase = r() * period;
  const occ = new Float32Array(N);                      // cell occupancy 0..1 (soft edge)
  const cellMask = new Uint8Array(N);
  const F0img = new Float32Array(N);
  const base = 110;                                     // resting in-cell counts per (binned) px
  for (let y = 0; y < H; y++) {
    const yu = y * dx;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = Math.min(yu - edgeTop[x], edgeBot[x] - yu); // µm inside the edge
      const o = smooth01((d + 0.25) / 0.5);
      occ[i] = o;
      cellMask[i] = d > 0 ? 1 : 0;
      let t = 0;
      for (const b of blobs) { const q = ((x - b.x) ** 2 + (y - b.y) ** 2) / (b.s * b.s); if (q < 9) t += b.a * Math.exp(-q); }
      tex[i] = t;
      // striation runs perpendicular to the long axis (slightly tilted with the cell)
      const s = Math.cos((6.283185 * (x - tilt * (y - H / 2) - phase)) / period);
      const edgeBright = 0.1 * Math.exp(-((d - 0.4) ** 2) / 0.3); // sarcolemmal rim slightly brighter
      F0img[i] = 6 + o * base * (1 + 0.11 * s + t + edgeBright);
    }
  }

  // ---- sparks at release sites on Z-lines (striation troughs), separated in space-time
  const truth: SparkTruth[] = [];
  const total = nSparks + nFaint;
  const durMs = F * dt;
  let guard = 0;
  while (truth.length < total && guard++ < 4000) {
    const faint = truth.length >= nSparks;
    const k = Math.floor(r() * (W / period));
    const xz = phase + (k + 0.5) * period + (r() - 0.5) * 0.25 / dx;
    const y = 4 + r() * (H - 8);
    const xi = Math.round(xz), yi = Math.round(y);
    if (xi < 6 || xi > W - 7) continue;
    // keep ≥ 1.2 µm away from the cell edge
    const din = Math.min(yi * dx - edgeTop[xi], edgeBot[xi] - yi * dx);
    if (din < 1.2) continue;
    const t0 = 25 + r() * (durMs - 25 - 180);
    const fwhm = 1.5 + r() * 1.0;
    const rise = 10 + r() * 10;
    const tau = 20 + r() * 20;
    const amp = faint ? 0.08 + r() * 0.06 : 0.35 + r() * 1.05;
    if (truth.some((s) => Math.hypot((s.x - xz) * dx, (s.y - y) * dx) < 6 && Math.abs(s.t0 - t0) < 150)) continue;
    truth.push({ x: xz, y, t0, tPeak: t0 + rise, amp, fwhm_um: fwhm, rise_ms: rise, tau_ms: tau, faint });
  }
  truth.sort((a, b) => a.tPeak - b.tPeak);

  // ---- render frames: F = F0 · (1 + Σ sparks) with shot noise (gain 2.6) + small read noise
  const data = new Float32Array(F * N);
  const sig = new Float32Array(N);
  const gain = 2.6;
  for (let f = 0; f < F; f++) {
    sig.fill(0);
    const t = f * dt;
    for (const s of truth) {
      const k = sparkKinetics(t - s.t0, s.rise_ms, s.tau_ms);
      if (k < 0.004) continue;
      const sg = s.fwhm_um / 2.3548 / dx;
      const R = Math.ceil(3.5 * sg);
      const xa = Math.max(0, Math.floor(s.x - R)), xb = Math.min(W - 1, Math.ceil(s.x + R));
      const ya = Math.max(0, Math.floor(s.y - R)), yb = Math.min(H - 1, Math.ceil(s.y + R));
      const a = s.amp * k, inv = 1 / (2 * sg * sg);
      for (let y = ya; y <= yb; y++) {
        const gy = Math.exp(-((y - s.y) ** 2) * inv);
        for (let x = xa; x <= xb; x++) sig[y * W + x] += a * gy * Math.exp(-((x - s.x) ** 2) * inv);
      }
    }
    const off = f * N;
    for (let i = 0; i < N; i++) {
      const mean = F0img[i] * (1 + sig[i] * occ[i]);
      // shot noise (variance gain·mean) + read noise (σ 1.5); Irwin–Hall(4) ≈ N(0,1), cheap and seeded
      const z = (r() + r() + r() + r() - 2) * 1.7320508;
      data[off + i] = Math.max(0, mean + Math.sqrt(gain * mean + 2.25) * z);
    }
  }
  return { seed, width: W, height: H, frames: F, data, dx, dxNative: DX_NATIVE, bin, dt, cellMask, truth, baseline: base };
}

// =============================================================== detection

export interface DetectOpts {
  kLow?: number;     // hysteresis low threshold, × σ   (default 2.5)
  kHigh?: number;    // hysteresis high threshold, × σ  (default 4.5)
  minVoxels?: number;
  roiHalf?: number;  // ROI half-size (px) for amplitude / kinetics traces
}

export interface SparkDet {
  id: number;
  x: number; y: number;          // centroid, px (binned grid)
  px: number; py: number;        // peak pixel = ROI centre (px)
  x_um: number; y_um: number;
  peakFrame: number;
  tPeak_ms: number;
  amp: number;                   // peak ΔF/F0 in the ROI trace
  fwhm_um: number;               // mean of x and y half-max widths at the peak frame
  fwhmX_um: number; fwhmY_um: number;
  fdhm_ms: number;
  ttp_ms: number;                // time to peak: 10 % crossing → peak
  f0: number; f1: number;        // first / last frame of the 3-D component
  bx0: number; bx1: number; by0: number; by1: number; // bounding box (px)
  voxels: number;
  trace: Float32Array;           // ROI ΔF/F0 for every frame (unsmoothed)
  matched: number;               // index into truth, −1 if none
}

export interface StepInfo {
  key: 'mask' | 'f0' | 'dff' | 'threshold' | 'components';
  label: string; detail: string; ms: number;
  /** intermediate products available after this stage (for progressive display) */
  partial: Partial<Detection>;
}

export interface Detection {
  mask: Uint8Array;
  maskArea_um2: number;
  meanImg: Float32Array;
  F0: Float32Array;
  /** smoothed ΔF/F0, frames × H × W (0 outside the mask) */
  dff: Float32Array;
  maxProj: Float32Array;
  /** per-pixel noise scale (shot noise ∝ 1/√F0, smoothing support near the outline) */
  noiseScale: Float32Array;
  /** detection region: mask eroded ~0.25 µm and away from the field border */
  core: Uint8Array;
  sigma: number; median: number; lo: number; hi: number;
  candidates: number;
  sparks: SparkDet[];
  frequency: number;             // sparks / (100 µm² · s)
  duration_s: number;
  steps: StepInfo[];
  // ground-truth comparison (possible only because the data is synthetic)
  injected: number; found: number; falsePos: number; missed: SparkTruth[];
}

function medianOf(a: Float32Array, n = a.length): number {
  const s = a.subarray(0, n).slice().sort();
  const m = n >> 1;
  return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 2-D box blur (radius r) of one W×H plane, in place via tmp. */
function box2D(src: Float32Array, dst: Float32Array, tmp: Float32Array, W: number, H: number, r: number) {
  for (let y = 0; y < H; y++) {
    const o = y * W;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[o + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[o + x] = acc;
      acc += src[o + Math.min(W - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
    }
  }
  const norm = 1 / ((2 * r + 1) * (2 * r + 1));
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      dst[y * W + x] = acc * norm;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
}

function otsu(v: Float32Array): number {
  let lo = Infinity, hi = -Infinity;
  for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x; }
  const B = 128, h = new Float64Array(B);
  for (const x of v) h[Math.min(B - 1, Math.floor(((x - lo) / (hi - lo || 1)) * B))]++;
  let sum = 0, tot = v.length;
  for (let i = 0; i < B; i++) sum += i * h[i];
  let sB = 0, wB = 0, best = 0, bi = 0;
  for (let i = 0; i < B; i++) {
    wB += h[i]; if (!wB) continue;
    const wF = tot - wB; if (!wF) break;
    sB += i * h[i];
    const d = sB / wB - (sum - sB) / wF;
    const between = wB * wF * d * d;
    if (between > best) { best = between; bi = i; }
  }
  return lo + ((bi + 1) / B) * (hi - lo);
}

/** Half-maximum width along a 1-D accessor with linear interpolation (baseline 0). */
function halfWidth(get: (i: number) => number, p: number, n: number): [number, number] {
  const half = get(p) / 2;
  let a = p, b = p;
  while (a > 0 && get(a - 1) > half) a--;
  while (b < n - 1 && get(b + 1) > half) b++;
  const left = a > 0 ? a - (get(a) - half) / (get(a) - get(a - 1) || 1) : a;
  const right = b < n - 1 ? b + (get(b) - half) / (get(b) - get(b + 1) || 1) : b;
  return [left, right];
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function detect(s: FrameSeries, o: DetectOpts = {}): Detection {
  const gen = detectSteps(s, o);
  let it = gen.next();
  while (!it.done) it = gen.next();
  return it.value;
}

/**
 * The detector as a generator: yields after each pipeline stage so a UI can
 * show progress honestly (the numbers shown are the ones being computed).
 */
export function* detectSteps(s: FrameSeries, o: DetectOpts = {}): Generator<StepInfo, Detection, void> {
  const { width: W, height: H, frames: F, data, dx, dt } = s;
  const N = W * H;
  const kLow = o.kLow ?? 2.5, kHigh = o.kHigh ?? 4.5, minVox = o.minVoxels ?? 40, rh = o.roiHalf ?? 2;
  const steps: StepInfo[] = [];
  const tmp = new Float32Array(N), tmp2 = new Float32Array(N);
  let t = now();
  const step = (key: StepInfo['key'], label: string, detail: string, partial: Partial<Detection> = {}) => {
    const st: StepInfo = { key, label, detail, ms: now() - t, partial };
    steps.push(st); t = now();
    return st;
  };

  // ---- 1. cell mask: Otsu threshold on the smoothed temporal mean, largest component, holes filled
  const meanImg = new Float32Array(N);
  for (let f = 0; f < F; f++) { const off = f * N; for (let i = 0; i < N; i++) meanImg[i] += data[off + i]; }
  for (let i = 0; i < N; i++) meanImg[i] /= F;
  const sm = new Float32Array(N);
  box2D(meanImg, sm, tmp, W, H, 2);
  const thr = otsu(sm);
  const raw = new Uint8Array(N);
  for (let i = 0; i < N; i++) raw[i] = sm[i] > thr ? 1 : 0;
  const lab2 = new Int32Array(N);
  let bestId = 0, bestN = 0, nid = 0;
  const st: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!raw[i] || lab2[i]) continue;
    const id = ++nid; let n = 0;
    lab2[i] = id; st.push(i);
    while (st.length) {
      const j = st.pop()!; n++;
      const x = j % W, y = (j / W) | 0;
      if (x > 0 && raw[j - 1] && !lab2[j - 1]) { lab2[j - 1] = id; st.push(j - 1); }
      if (x < W - 1 && raw[j + 1] && !lab2[j + 1]) { lab2[j + 1] = id; st.push(j + 1); }
      if (y > 0 && raw[j - W] && !lab2[j - W]) { lab2[j - W] = id; st.push(j - W); }
      if (y < H - 1 && raw[j + W] && !lab2[j + W]) { lab2[j + W] = id; st.push(j + W); }
    }
    if (n > bestN) { bestN = n; bestId = id; }
  }
  // fill holes: background = not-cell reachable from the border
  const mask = new Uint8Array(N);
  const outside = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && lab2[i] !== bestId && !outside[i]) { outside[i] = 1; st.push(i); }
  }
  while (st.length) {
    const j = st.pop()!;
    const x = j % W, y = (j / W) | 0;
    for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) {
      if (k >= 0 && !outside[k] && lab2[k] !== bestId) { outside[k] = 1; st.push(k); }
    }
  }
  let maskN = 0;
  for (let i = 0; i < N; i++) if (!outside[i]) { mask[i] = 1; maskN++; }
  const maskArea = maskN * dx * dx;
  yield step('mask', 'Cell mask', `Otsu on temporal mean · ${maskN.toLocaleString('en')} px · ${maskArea.toFixed(0)} µm²`, { mask, maskArea_um2: maskArea, meanImg });

  // ---- 2. F0: per-pixel temporal median of the 3×3-smoothed series
  const sp = new Float32Array(F * N);           // spatially smoothed raw (reused below)
  for (let f = 0; f < F; f++) {
    box2D(data.subarray(f * N, (f + 1) * N), tmp2, tmp, W, H, 1);
    sp.set(tmp2, f * N);
  }
  const F0 = new Float32Array(N);
  const col = new Float32Array(F);
  for (let i = 0; i < N; i++) {
    if (!mask[i]) continue;
    for (let f = 0; f < F; f++) col[f] = sp[f * N + i];
    F0[i] = Math.max(1, medianOf(col));
  }
  // Shot noise makes the relative noise of F/F0 scale as 1/√F0: dim pixels (cell rim) are noisier.
  // Normalise thresholds per pixel with that scale, and keep detection ~0.25 µm inside the outline.
  const f0s: number[] = [];
  for (let i = 0; i < N; i++) if (mask[i]) f0s.push(F0[i]);
  const F0ref = medianOf(Float32Array.from(f0s));
  const ns = new Float32Array(N);
  const core = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!mask[i]) continue;
    ns[i] = Math.sqrt(F0ref / F0[i]);
    const x = i % W, y = (i / W) | 0;
    let ok = x > 2 && y > 2 && x < W - 3 && y < H - 3 ? 1 : 0; // field border: smoothing is one-sided
    for (let k = -2; k <= 2 && ok; k++) {
      if (!mask[Math.min(H - 1, Math.max(0, y + k)) * W + x] || !mask[y * W + Math.min(W - 1, Math.max(0, x + k))]) ok = 0;
    }
    core[i] = ok;
  }
  yield step('f0', 'Baseline F₀', `per-pixel temporal median · ${F} frames`, { F0 });

  // ---- 3. ΔF/F0 + mask-normalised smoothing (space: 2× box r=2 ≈ σ 0.24 µm; time: [1 2 1]/4)
  const unsm = sp;                                // reuse buffer: unsmoothed ΔF/F0 (lightly 3×3) for ROI work
  const mS = new Float32Array(N), mf = new Float32Array(N);
  for (let i = 0; i < N; i++) mf[i] = mask[i];
  box2D(mf, tmp2, tmp, W, H, 2); box2D(tmp2, mS, tmp, W, H, 2);
  const plane = new Float32Array(N);
  const spatial = (f: number, out: Float32Array) => {
    const off = f * N;
    for (let i = 0; i < N; i++) {
      // F0 and F are both taken from the 3×3-smoothed series so that steep intensity
      // gradients (cell outline) do not leave a constant offset in ΔF/F0
      const v = mask[i] ? sp[off + i] / F0[i] - 1 : 0;
      unsm[off + i] = v; plane[i] = v;
    }
    box2D(plane, tmp2, tmp, W, H, 2); box2D(tmp2, out, tmp, W, H, 2);
    for (let i = 0; i < N; i++) out[i] = mask[i] && mS[i] > 0.05 ? out[i] / mS[i] : 0;
  };
  // rolling three-plane buffer for the temporal [1 2 1]/4 kernel (no full-size intermediate)
  const dff = new Float32Array(F * N);
  let pPrev = new Float32Array(N), pCur = new Float32Array(N), pNext = new Float32Array(N);
  spatial(0, pCur); pPrev.set(pCur);
  for (let f = 0; f < F; f++) {
    if (f < F - 1) spatial(f + 1, pNext); else pNext.set(pCur);
    const b = f * N;
    for (let i = 0; i < N; i++) dff[b + i] = 0.25 * pPrev[i] + 0.5 * pCur[i] + 0.25 * pNext[i];
    const r0 = pPrev; pPrev = pCur; pCur = pNext; pNext = r0;
  }
  yield step('dff', 'ΔF/F₀', 'F/F₀ − 1 · smoothed σxy ≈ 0.24 µm, σt ≈ 1 frame', { dff });

  // ---- 4. robust noise σ (MAD) inside the mask → hysteresis thresholds
  // the mask-normalised smoothing averages fewer pixels near the outline → noise grows as 1/√(support)
  for (let i = 0; i < N; i++) if (mask[i]) ns[i] /= Math.sqrt(Math.max(0.05, mS[i]));
  const sample: number[] = [];
  for (let f = 0; f < F; f += 3) for (let i = f % 5; i < N; i += 5) if (core[i]) sample.push(dff[f * N + i] / ns[i]);
  const sArr = Float32Array.from(sample);
  const med = medianOf(sArr);
  for (let i = 0; i < sArr.length; i++) sArr[i] = Math.abs(sArr[i] - med);
  const sigma = 1.4826 * medianOf(sArr);
  const lo = med + kLow * sigma, hi = med + kHigh * sigma;
  const loMap = new Float32Array(N).fill(Infinity);
  for (let i = 0; i < N; i++) if (core[i]) loMap[i] = med + kLow * sigma * ns[i];
  yield step('threshold', 'Threshold', `σ (MAD) = ${sigma.toFixed(3)} · hysteresis ${kLow}σ / ${kHigh}σ`, { sigma, median: med, lo, hi, noiseScale: ns, core });

  // ---- 5. 3-D connected components (6-connectivity) on dff > lo, keep those reaching hi
  const lab = new Int32Array(F * N);
  const stack: number[] = [];
  const sparks: SparkDet[] = [];
  let candidates = 0, next = 0;
  for (let v = 0; v < F * N; v++) {
    if (dff[v] <= 0 || lab[v] || dff[v] <= loMap[v % N]) continue;
    const id = ++next; candidates++;
    lab[v] = id; stack.push(v);
    let n = 0, peak = -Infinity, pz = -Infinity, pv = v, f0 = F, f1 = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (stack.length) {
      const j = stack.pop()!; n++;
      const f = (j / N) | 0, i = j - f * N, y = (i / W) | 0, x = i - y * W;
      const z = (dff[j] - med) / ns[i];
      if (z > pz) { pz = z; peak = dff[j]; pv = j; }
      if (f < f0) f0 = f; if (f > f1) f1 = f;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0) push(j - 1); if (x < W - 1) push(j + 1);
      if (y > 0) push(j - W); if (y < H - 1) push(j + W);
      if (f > 0) push(j - N); if (f < F - 1) push(j + N);
    }
    function push(k: number) { if (!lab[k] && dff[k] > loMap[k % N]) { lab[k] = id; stack.push(k); } }
    const fpk = (pv / N) | 0;
    // events peaking in the first/last frame are truncated (and one-sided smoothing is noisier): excluded
    if (pz < kHigh * sigma || n < minVox || f1 - f0 < 1 || peak <= 0 || fpk === 0 || fpk === F - 1) continue;

    const fp = (pv / N) | 0, ip = pv - fp * N, yp = (ip / W) | 0, xp = ip - yp * W;
    // centroid in the peak frame (weighted by smoothed ΔF/F0)
    let sw = 0, sx = 0, sy = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const j = fp * N + y * W + x;
      if (lab[j] === id) { const w = Math.max(0, dff[j]); sw += w; sx += w * x; sy += w * y; }
    }
    const cx = sw ? sx / sw : xp, cy = sw ? sy / sw : yp;
    // ROI trace (5×5 px ≈ 0.6 µm square at the peak pixel, 3×3-smoothed ΔF/F0, no temporal smoothing)
    const trace = new Float32Array(F);
    for (let f = 0; f < F; f++) {
      let a = 0, c = 0;
      for (let y = Math.max(0, yp - rh); y <= Math.min(H - 1, yp + rh); y++)
        for (let x = Math.max(0, xp - rh); x <= Math.min(W - 1, xp + rh); x++) {
          const i = y * W + x; if (mask[i]) { a += unsm[f * N + i]; c++; }
        }
      trace[f] = c ? a / c : 0;
    }
    let pf = fp;
    for (let f = Math.max(0, fp - 1); f <= Math.min(F - 1, fp + 1); f++) if (trace[f] > trace[pf]) pf = f;
    const amp = trace[pf];
    // spatial FWHM through the peak frame (rows/cols averaged over ±1 px)
    const pl = pf * N;
    const px = (k: number) => (unsm[pl + yp * W + k] + (yp > 0 ? unsm[pl + (yp - 1) * W + k] : 0) + (yp < H - 1 ? unsm[pl + (yp + 1) * W + k] : 0)) / 3;
    const py = (k: number) => (unsm[pl + k * W + xp] + (xp > 0 ? unsm[pl + k * W + xp - 1] : 0) + (xp < W - 1 ? unsm[pl + k * W + xp + 1] : 0)) / 3;
    const [ax, bx] = halfWidth(px, xp, W), [ay, by] = halfWidth(py, yp, H);
    const fwhmX = (bx - ax) * dx, fwhmY = (by - ay) * dx;
    // temporal: FDHM from half-max crossings of the ROI trace; TTP from 10 % crossing
    const [ta, tb] = halfWidth((k) => trace[k], pf, F);
    let k10 = pf;
    while (k10 > 0 && trace[k10 - 1] > 0.1 * amp) k10--;
    const t10 = k10 > 0 ? k10 - (trace[k10] - 0.1 * amp) / (trace[k10] - trace[k10 - 1] || 1) : k10;
    sparks.push({
      id: 0, x: cx, y: cy, px: xp, py: yp, x_um: cx * dx, y_um: cy * dx, peakFrame: pf, tPeak_ms: pf * dt, amp,
      fwhm_um: (fwhmX + fwhmY) / 2, fwhmX_um: fwhmX, fwhmY_um: fwhmY,
      fdhm_ms: (tb - ta) * dt, ttp_ms: (pf - t10) * dt,
      f0, f1, bx0: x0, bx1: x1, by0: y0, by1: y1, voxels: n, trace, matched: -1,
    });
  }
  sparks.sort((a, b) => a.peakFrame - b.peakFrame || a.x - b.x).forEach((d, i) => (d.id = i + 1));
  const duration_s = (F * dt) / 1000;
  const frequency = sparks.length / (maskArea / 100) / duration_s;

  const maxProj = new Float32Array(N);
  for (let f = 0; f < F; f++) { const off = f * N; for (let i = 0; i < N; i++) if (dff[off + i] > maxProj[i]) maxProj[i] = dff[off + i]; }

  // ---- ground-truth comparison: within 1.5 µm and ±4 frames of an injected spark's peak
  let found = 0;
  const missed: SparkTruth[] = [];
  s.truth.forEach((g, gi) => {
    let best: SparkDet | null = null, bd = Infinity;
    for (const d of sparks) {
      if (d.matched >= 0) continue;
      const dist = Math.hypot((d.x - g.x) * dx, (d.y - g.y) * dx);
      if (dist <= 1.5 && Math.abs(d.tPeak_ms - g.tPeak) <= 4 * dt && dist < bd) { bd = dist; best = d; }
    }
    if (best) { best.matched = gi; found++; } else missed.push(g);
  });
  yield step('components', '3-D components', `${candidates} candidates (x, y, t · 6-conn.) → ${sparks.length} sparks`);

  return {
    mask, maskArea_um2: maskArea, meanImg, F0, dff, maxProj, noiseScale: ns, core, sigma, median: med, lo, hi, candidates, sparks,
    frequency, duration_s, steps, injected: s.truth.length, found, falsePos: sparks.filter((d) => d.matched < 0).length, missed,
  };
}
