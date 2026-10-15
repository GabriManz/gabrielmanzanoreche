/**
 * Stochastic calcium-induced calcium release (CICR) toy model on a 2D grid.
 *
 * ILLUSTRATIVE ONLY — this is a visual toy, not a validated physiological
 * model. Parameters are tuned for legibility on screen, not fitted to data.
 *
 * - `c`     cytosolic Ca²⁺ field (arbitrary units, ~0..1.5) on an NX×NY grid,
 *           explicit diffusion + first-order uptake (a stand-in for SERCA).
 * - sites   release units (RyR2 clusters) on a lattice aligned with Z-lines.
 *           Each has a local SR content `rec` that is depleted when it fires
 *           and refills towards the global "SR load" slider value.
 *           Firing probability = spontaneous term (rises steeply with load)
 *           + a CICR term (local Ca²⁺ above a load-dependent threshold).
 *           Above a load threshold neighbours recruit each other → waves.
 */
import { rng } from '../../shared/env';

export interface SimStats {
  spontaneous: number; // spontaneous (non-paced) release events in the last ~1 s
  recruited: number;   // CICR-recruited events in the last ~1 s
  wave: boolean;
}

export class CaSim {
  readonly nx: number;
  readonly ny: number;
  readonly c: Float32Array;
  private tmp: Float32Array;
  readonly sx: Int16Array;
  readonly sy: Int16Array;
  readonly rel: Float32Array;   // remaining release time (s)
  readonly amp: Float32Array;   // amplitude of current release
  readonly rec: Float32Array;   // local SR content 0..1
  readonly pending: Float32Array; // paced firing scheduled after delay (s), -1 = none
  load = 0.3;
  private rand: () => number;
  private log: { t: number; kind: 0 | 1 }[] = [];
  time = 0;

  constructor(nx = 200, ny = 48, pitchX = 4, pitchY = 4, seed = 7) {
    this.nx = nx; this.ny = ny;
    this.c = new Float32Array(nx * ny);
    this.tmp = new Float32Array(nx * ny);
    const xs: number[] = []; const ys: number[] = [];
    this.rand = rng(seed);
    for (let y = 2; y < ny - 1; y += pitchY) {
      for (let x = 2; x < nx - 1; x += pitchX) {
        // small jitter across the Z-line (y) keeps the lattice organic
        xs.push(x); ys.push(Math.min(ny - 2, Math.max(1, y + Math.round((this.rand() - 0.5) * 2))));
      }
    }
    const n = xs.length;
    this.sx = Int16Array.from(xs); this.sy = Int16Array.from(ys);
    this.rel = new Float32Array(n);
    this.amp = new Float32Array(n);
    this.rec = new Float32Array(n).fill(0.8);
    this.pending = new Float32Array(n).fill(-1);
  }

  get siteCount() { return this.sx.length; }

  /** Spontaneous release rate per site (1/s), steep in load. */
  private spont(L: number) { return 0.0006 * Math.exp(4.6 * L); }
  /** CICR threshold of local Ca²⁺, falls with load. */
  private thr(L: number) { return 0.3 - 0.29 * L; }

  private fire(i: number, a: number, kind: 0 | 1 | 2) {
    this.rel[i] = 0.03;
    this.amp[i] = a * (0.55 + 0.45 * this.rec[i]);
    this.rec[i] *= 0.08;
    if (kind !== 2) this.log.push({ t: this.time, kind });
  }

  /** Paced beat: near-synchronous release at every recovered site. */
  beat() {
    for (let i = 0; i < this.siteCount; i++) {
      if (this.rec[i] > 0.25 && this.rel[i] <= 0) this.pending[i] = this.rand() * 0.018;
    }
  }

  /** Force a single spark at site i (or a random one). */
  spark(i = Math.floor(this.rand() * this.siteCount)) {
    this.fire(i, 1.1, 0);
    this.rec[i] = 0.08;
  }

  step(dt: number) {
    const sub = 3;
    const h = dt / sub;
    const { nx, ny, c } = this;
    const L = this.load;
    const spont = this.spont(L), thr = this.thr(L), w = 0.007;
    const k = 0.2;
    const decay = Math.exp(-h / 0.11);
    const recTarget = 0.3 + 0.7 * L;
    const recRate = 1 - Math.exp(-h / 1.0);
    for (let s = 0; s < sub; s++) {
      this.time += h;
      // --- release sites
      for (let i = 0; i < this.siteCount; i++) {
        const idx = this.sy[i] * nx + this.sx[i];
        if (this.pending[i] >= 0) {
          this.pending[i] -= h;
          if (this.pending[i] < 0) { this.pending[i] = -1; this.fire(i, 1.0, 2); }
        }
        if (this.rel[i] > 0) {
          this.rel[i] -= h;
          const src = this.amp[i] * h * 120;
          c[idx] += src;
          c[idx - 1] += src * 0.5; c[idx + 1] += src * 0.5;
          c[idx - nx] += src * 0.5; c[idx + nx] += src * 0.5;
        } else {
          this.rec[i] += (recTarget - this.rec[i]) * recRate;
          const r = this.rec[i];
          const loc = c[idx];
          const x = (loc - thr) / w;
          const cicr = 500 / (1 + Math.exp(-x));
          const ex = Math.min(1, Math.max(0, (r - 0.42) / 0.4)); // refractoriness: needs a refilled store
          const p = (spont + cicr) * ex * ex * (3 - 2 * ex) * h;
          if (this.rand() < p) this.fire(i, 1.0, x > -1.5 ? 1 : 0);
        }
      }
      // --- diffusion + uptake (no-flux boundaries)
      const t = this.tmp;
      for (let y = 0; y < ny; y++) {
        const ym = y > 0 ? -nx : 0, yp = y < ny - 1 ? nx : 0;
        const row = y * nx;
        for (let x = 0; x < nx; x++) {
          const i = row + x;
          const v = c[i];
          const l = x > 0 ? c[i - 1] : v, r = x < nx - 1 ? c[i + 1] : v;
          const lap = l + r + c[i + ym] + c[i + yp] - 4 * v;
          t[i] = (v + k * lap) * decay;
        }
      }
      c.set(t);
    }
    // trim event log to the last second
    while (this.log.length && this.log[0].t < this.time - 1) this.log.shift();
  }

  stats(): SimStats {
    let sp = 0, rc = 0;
    for (const e of this.log) e.kind === 0 ? sp++ : rc++;
    return { spontaneous: sp, recruited: rc, wave: rc > 25 };
  }
}
