/**
 * SparkLab data layer: the synthetic frame-scan (x–y–t) series and its
 * detector live in `src/shared/framescan.ts` (pure TS, no DOM). This file only
 * caches series per seed and turns planes into pixels with microscopy LUTs.
 *
 * Everything shown in SparkLab is SYNTHETIC — only the acquisition parameters
 * (Fluo-4, DX 0.060184 µm/px, DT 5.82 ms) are matched to Gabriel's setup.
 */
import { generate, type FrameSeries } from '../../shared/framescan';

export const DEFAULT_SEED = 0x2a;

const cache = new Map<number, FrameSeries>();
export function series(seed: number): FrameSeries {
  let s = cache.get(seed);
  if (!s) {
    if (cache.size > 2) cache.clear();
    s = generate(seed);
    cache.set(seed, s);
  }
  return s;
}

export const fileName = (seed: number) => `synthetic_${seed.toString(16).toUpperCase().padStart(4, '0')}_xyt.tif`;

// ---- Look-up tables -------------------------------------------------------
type Stop = [number, string];
const LUTS: Record<string, Stop[]> = {
  green: [[0, '#010302'], [0.28, '#05301a'], [0.55, '#14984f'], [0.8, '#6bf5a2'], [1, '#f4fff7']],
  fire: [[0, '#000000'], [0.22, '#2e0a52'], [0.45, '#a3153f'], [0.66, '#f0571d'], [0.86, '#ffc53d'], [1, '#fffbe8']],
};
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

const imgCache = new WeakMap<CanvasRenderingContext2D, ImageData>();
/** Paint one W×H plane (values mapped lo→hi through a LUT, with gamma) into ctx at 1:1. */
export function paintPlane(ctx: CanvasRenderingContext2D, plane: ArrayLike<number>, W: number, H: number, lo: number, hi: number, lutName: string, gamma = 0.85) {
  let img = imgCache.get(ctx);
  if (!img || img.width !== W || img.height !== H) { img = ctx.createImageData(W, H); imgCache.set(ctx, img); }
  const L = lut(lutName), d = img.data, k = 1 / (hi - lo);
  for (let i = 0; i < W * H; i++) {
    const v = Math.min(1, Math.max(0, (plane[i] - lo) * k));
    const j = Math.round(Math.pow(v, gamma) * 255) * 3;
    d[i * 4] = L[j]; d[i * 4 + 1] = L[j + 1]; d[i * 4 + 2] = L[j + 2]; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Raw frame f of a series, scaled to its resting in-cell level. */
export function paintRaw(ctx: CanvasRenderingContext2D, s: FrameSeries, f: number, lutName: string) {
  const N = s.width * s.height;
  paintPlane(ctx, s.data.subarray(f * N, (f + 1) * N), s.width, s.height, s.baseline * 0.45, s.baseline * 2.3, lutName, 1.15);
}

/** Frame index of the strongest injected spark's peak (a representative still for previews). */
export function heroFrame(s: FrameSeries): number {
  const t = s.truth.reduce((a, b) => (b.amp > a.amp ? b : a), s.truth[0]);
  return t ? Math.min(s.frames - 1, Math.round(t.tPeak / s.dt)) : 0;
}
