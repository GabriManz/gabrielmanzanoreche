/**
 * Synthetic confocal line-scan generator + a small, real spark detector.
 *
 * Everything here is SYNTHETIC: the image is procedurally generated
 * (sarcomeric baseline, photobleaching, shot noise, Gaussian sparks with
 * rise/decay kinetics) and the detector measures it honestly:
 *   F0 (row median × line factor) → ΔF/F0 → separable smoothing →
 *   robust noise σ (MAD) → hysteresis threshold → connected components →
 *   amplitude, FWHM (space) and FDHM (time) from half-maximum crossings.
 */
import { rng } from '../../shared/env';

export const W = 720;   // time samples (lines)
export const H = 192;   // pixels along the scan line
export const DT = 1.0;  // ms per line
export const DX = 0.1;  // µm per pixel

export interface Truth { t: number; y: number; amp: number }
export interface Scan { seed: number; raw: Float32Array; truth: Truth[]; displayScale: number }
export interface Det {
  id: number; t0: number; t1: number; y0: number; y1: number;
  tp: number; yp: number; amp: number; fwhm: number; fdhm: number; matched: boolean;
}
export interface Result {
  dets: Det[]; sigma: number; lo: number; hi: number;
  found: number; injected: number; falsePos: number; missed: Truth[];
}

function gauss(r: () => number) {
  let u = 0;
  while (!u) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

function median(a: Float32Array | number[]) {
  const s = Float32Array.from(a).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function generate(seed: number): Scan {
  const r = rng(seed);
  const raw = new Float32Array(W * H);
  const sig = new Float32Array(W * H);
  const phase = r() * 6.283, per = 17 + r() * 3;

  // Inject sparks with a minimum separation so the demo stays readable.
  const truth: Truth[] = [];
  const n = 9 + Math.floor(r() * 4);
  let guard = 0;
  while (truth.length < n && guard++ < 400) {
    const faint = truth.length < 2;
    const amp = faint ? 0.1 + r() * 0.1 : 0.6 + r() * 1.5;
    const sx = 5.5 + r() * 4;            // spatial σ (px)
    const tr = 3 + r() * 5;              // rise τ (ms)
    const td = 14 + r() * 26;            // decay τ (ms)
    const t0 = 20 + r() * (W - 150);
    const y = 16 + r() * (H - 32);
    if (truth.some((s) => Math.abs(s.t - t0) < 70 && Math.abs(s.y - y) < 30)) continue;
    const tpk = tr * Math.log((tr + td) / tr);
    const norm = (1 - Math.exp(-tpk / tr)) * Math.exp(-tpk / td);
    truth.push({ t: t0 + tpk, y, amp });
    const ya = Math.max(0, Math.floor(y - 4 * sx)), yb = Math.min(H - 1, Math.ceil(y + 4 * sx));
    const ta = Math.max(0, Math.floor(t0)), tb = Math.min(W - 1, Math.ceil(t0 + 7 * td));
    for (let yy = ya; yy <= yb; yy++) {
      const gy = Math.exp(-((yy - y) ** 2) / (2 * sx * sx));
      for (let t = ta; t <= tb; t++) {
        const dt = t - t0;
        if (dt < 0) continue;
        sig[yy * W + t] += amp * gy * ((1 - Math.exp(-dt / tr)) * Math.exp(-dt / td)) / norm;
      }
    }
  }

  const lineJitter = new Float32Array(W);
  for (let t = 0; t < W; t++) lineJitter[t] = 1 + 0.015 * gauss(r);
  for (let y = 0; y < H; y++) {
    const f0 = 100 * (1 + 0.13 * Math.sin((2 * Math.PI * y) / per + phase) + 0.09 * Math.sin((2 * Math.PI * y) / (H * 0.8) + phase * 2));
    for (let t = 0; t < W; t++) {
      const bleach = 1 - 0.12 * (t / W);
      const F = f0 * bleach * lineJitter[t] * (1 + sig[y * W + t]);
      raw[y * W + t] = Math.max(0, F + Math.sqrt(F) * 1.25 * gauss(r));
    }
  }
  return { seed, raw, truth, displayScale: median(raw.filter((_, i) => i % 7 === 0)) };
}

function boxBlur(src: Float32Array, rx: number, rt: number) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < H; y++) {           // along time
    for (let t = 0; t < W; t++) {
      let s = 0, c = 0;
      for (let k = -rt; k <= rt; k++) { const tt = t + k; if (tt >= 0 && tt < W) { s += src[y * W + tt]; c++; } }
      tmp[y * W + t] = s / c;
    }
  }
  for (let t = 0; t < W; t++) {           // along space
    for (let y = 0; y < H; y++) {
      let s = 0, c = 0;
      for (let k = -rx; k <= rx; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s += tmp[yy * W + t]; c++; } }
      out[y * W + t] = s / c;
    }
  }
  return out;
}

/** Half-maximum width along a 1-D accessor, with linear interpolation. */
function halfWidth(get: (i: number) => number, p: number, n: number) {
  const half = get(p) / 2;
  let a = p, b = p;
  while (a > 0 && get(a - 1) > half) a--;
  while (b < n - 1 && get(b + 1) > half) b++;
  const left = a > 0 ? a - (get(a) - half) / (get(a) - get(a - 1)) : a;
  const right = b < n - 1 ? b + (get(b) - half) / (get(b) - get(b + 1)) : b;
  return right - left;
}

export function detect(scan: Scan): Result {
  const { raw } = scan;
  // 1. Baseline F0 = row median × per-line factor (handles bleaching & laser jitter).
  const rowMed = new Float32Array(H);
  for (let y = 0; y < H; y++) rowMed[y] = median(raw.subarray(y * W, (y + 1) * W));
  const dff = new Float32Array(W * H);
  const col = new Float32Array(H);
  for (let t = 0; t < W; t++) {
    for (let y = 0; y < H; y++) col[y] = raw[y * W + t] / rowMed[y];
    const f = median(col);
    for (let y = 0; y < H; y++) dff[y * W + t] = raw[y * W + t] / (rowMed[y] * f) - 1;
  }
  // 2. Smooth (two box passes ≈ Gaussian), 3. robust noise estimate.
  const s = boxBlur(boxBlur(dff, 2, 3), 2, 3);
  const m = median(s.filter((_, i) => i % 3 === 0));
  const sigma = 1.4826 * median(Float32Array.from(s.filter((_, i) => i % 3 === 0), (v) => Math.abs(v - m)));
  const lo = m + 3 * sigma, hi = m + 7 * sigma;

  // 4. Connected components (4-neighbour) on the low threshold, keep those that reach the high one.
  const lab = new Int32Array(W * H);
  const dets: Det[] = [];
  const stack: number[] = [];
  let next = 1;
  for (let i = 0; i < W * H; i++) {
    if (lab[i] || s[i] <= lo) continue;
    const id = next++;
    lab[i] = id; stack.push(i);
    let area = 0, peak = -Infinity, pi = i, t0 = W, t1 = 0, y0 = H, y1 = 0;
    while (stack.length) {
      const j = stack.pop()!;
      area++;
      const y = (j / W) | 0, t = j - y * W;
      if (s[j] > peak) { peak = s[j]; pi = j; }
      if (t < t0) t0 = t; if (t > t1) t1 = t; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const nb = [t > 0 ? j - 1 : -1, t < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1];
      for (const k of nb) if (k >= 0 && !lab[k] && s[k] > lo) { lab[k] = id; stack.push(k); }
    }
    if (peak < hi || area < 60) continue;
    const yp = (pi / W) | 0, tp = pi - yp * W;
    const fwhm = halfWidth((k) => s[k * W + tp], yp, H) * DX;
    const fdhm = halfWidth((k) => s[yp * W + k], tp, W) * DT;
    dets.push({ id: 0, t0, t1, y0, y1, tp, yp, amp: peak, fwhm, fdhm, matched: false });
  }
  dets.sort((a, b) => a.tp - b.tp).forEach((d, i) => (d.id = i + 1));

  // 5. Compare with the injected ground truth (only possible because the data is synthetic).
  let found = 0;
  const missed: Truth[] = [];
  for (const g of scan.truth) {
    const d = dets.find((d) => g.t >= d.t0 - 3 && g.t <= d.t1 + 3 && g.y >= d.y0 - 3 && g.y <= d.y1 + 3);
    if (d) { found++; d.matched = true; } else missed.push(g);
  }
  return { dets, sigma, lo, hi, found, injected: scan.truth.length, falsePos: dets.filter((d) => !d.matched).length, missed };
}

// ---- Look-up tables -------------------------------------------------------
type Stop = [number, string];
const LUTS: Record<string, Stop[]> = {
  green: [[0, '#020403'], [0.3, '#062b17'], [0.58, '#16944f'], [0.82, '#6bf5a2'], [1, '#f4fff7']],
  fire: [[0, '#000000'], [0.22, '#2e0a52'], [0.45, '#a3153f'], [0.66, '#f0571d'], [0.86, '#ffc53d'], [1, '#fffbe8']],
};
export type LutName = keyof typeof LUTS;
const lutCache: Record<string, Uint8Array> = {};
export function lut(name: string): Uint8Array {
  if (lutCache[name]) return lutCache[name];
  const stops = LUTS[name] ?? LUTS.green;
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const out = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0;
    while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [a, ca] = stops[k], [b, cb] = stops[k + 1];
    const f = (v - a) / (b - a || 1);
    const A = hex(ca), B = hex(cb);
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(A[c] + (B[c] - A[c]) * f);
  }
  return (lutCache[name] = out);
}

export function render(scan: Scan, ctx: CanvasRenderingContext2D, lutName: string) {
  const img = ctx.createImageData(W, H);
  const L = lut(lutName);
  const lo = 0.55, hi = 2.7;
  for (let i = 0; i < W * H; i++) {
    const v = Math.min(1, Math.max(0, (scan.raw[i] / scan.displayScale - lo) / (hi - lo)));
    const k = Math.round(Math.pow(v, 0.85) * 255) * 3;
    img.data[i * 4] = L[k]; img.data[i * 4 + 1] = L[k + 1]; img.data[i * 4 + 2] = L[k + 2]; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
