/**
 * Barkley excitable-media model on a CPU grid (illustrative, not patient-specific).
 *
 *   du/dt = (1/ε) u (1-u) (u - (v+b)/a) + D ∇²u
 *   dv/dt = u - v
 *
 * u = fast "voltage-like" excitation, v = slow recovery (refractoriness).
 * Reaction uses Barkley's semi-implicit update (unconditionally stable),
 * diffusion uses a 5-point Laplacian with no-flux walls around non-tissue
 * (sea, park). The grid is small enough (~10–25k cells) to run several
 * sub-steps per frame on the CPU, which is also far faster than a GPU
 * ping-pong under software WebGL.
 */

export interface SimOptions {
  nx: number;
  ny: number;
  mask: Uint8Array; // 1 = excitable tissue, 0 = non-conducting
}

export class Barkley {
  readonly nx: number;
  readonly ny: number;
  u: Float32Array;
  v: Float32Array;
  private un: Float32Array;
  readonly mask: Uint8Array;
  private nbr: Uint8Array; // bitmask of valid neighbours (L R D U)
  // parameters
  a = 0.75;
  b = 0.06;
  eps = 0.02;
  D = 0.17; // dimensionless diffusion number D·dt/h² (must stay < 0.25)
  dt = 0.02;
  t = 0;
  /** optional per-cell excitability `a` (tissue heterogeneity) */
  aMap: Float32Array | null = null;
  // pseudo-ECG electrode weights
  private wx: Float32Array;
  private wy: Float32Array;

  constructor(o: SimOptions) {
    this.nx = o.nx;
    this.ny = o.ny;
    const n = o.nx * o.ny;
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.un = new Float32Array(n);
    this.mask = o.mask;
    this.nbr = new Uint8Array(n);
    for (let j = 0; j < o.ny; j++)
      for (let i = 0; i < o.nx; i++) {
        const k = j * o.nx + i;
        if (!this.mask[k]) continue;
        let b = 0;
        if (i > 0 && this.mask[k - 1]) b |= 1;
        if (i < o.nx - 1 && this.mask[k + 1]) b |= 2;
        if (j > 0 && this.mask[k - o.nx]) b |= 4;
        if (j < o.ny - 1 && this.mask[k + o.nx]) b |= 8;
        this.nbr[k] = b;
      }
    this.wx = new Float32Array(n);
    this.wy = new Float32Array(n);
    this.setElectrodes([
      { x: o.nx * 0.55, y: o.ny * 0.55, z: o.ny * 0.035, gain: 1 },
      { x: o.nx * 0.75, y: o.ny * 0.7, z: o.ny * 0.3, gain: 0.3 },
    ]);
  }

  /**
   * Virtual electrodes (grid coords; z = height above the sheet). Each lead's
   * ∇(1/r) weights are normalised and blended: a near-field electrode gives a
   * sharp QRS-like deflection as a front passes beneath it, a distant one adds
   * the slow far-field component.
   */
  setElectrodes(list: { x: number; y: number; z: number; gain: number }[]) {
    const { nx, ny } = this;
    this.wx.fill(0);
    this.wy.fill(0);
    const tx = new Float32Array(nx * ny), ty = new Float32Array(nx * ny);
    for (const e of list) {
      let mx = 1e-9;
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          const dx = e.x - i, dy = e.y - j;
          const r3 = Math.pow(dx * dx + dy * dy + e.z * e.z, 1.5) + 1e-6;
          tx[k] = dx / r3;
          ty[k] = dy / r3;
          mx = Math.max(mx, Math.abs(tx[k]), Math.abs(ty[k]));
        }
      for (let k = 0; k < tx.length; k++) {
        this.wx[k] += (tx[k] / mx) * e.gain;
        this.wy[k] += (ty[k] / mx) * e.gain;
      }
    }
  }

  step(steps = 1) {
    const { nx, ny, mask, nbr } = this;
    const a0 = this.a, aMap = this.aMap, b = this.b, k1 = this.dt / this.eps, dD = this.D, dt = this.dt;
    let u = this.u, un = this.un;
    const v = this.v;
    for (let s = 0; s < steps; s++) {
      for (let j = 0; j < ny; j++) {
        const row = j * nx;
        for (let i = 0; i < nx; i++) {
          const k = row + i;
          if (!mask[k]) { un[k] = 0; continue; }
          const uk = u[k];
          const nb = nbr[k];
          let lap = 0;
          if (nb & 1) lap += u[k - 1] - uk;
          if (nb & 2) lap += u[k + 1] - uk;
          if (nb & 4) lap += u[k - nx] - uk;
          if (nb & 8) lap += u[k + nx] - uk;
          const vk = v[k];
          const uth = (vk + b) / (aMap ? aMap[k] : a0);
          let x = uk;
          if (x < 1e-4 && lap < 1e-5) {
            x = 0;
          } else if (x < uth) {
            x = x / (1 - k1 * (1 - x) * (x - uth));
          } else {
            const q = k1 * x * (x - uth);
            x = (x + q) / (1 + q);
          }
          x += dD * lap;
          un[k] = x < 0 ? 0 : x > 1 ? 1 : x;
          v[k] = vk + dt * (uk - vk);
        }
      }
      const tmp = u; u = un; un = tmp;
      this.t += dt;
    }
    this.u = u;
    this.un = un;
  }

  /** Square-wave stimulus on a disk; returns fraction of disk that was excitable. */
  stimulate(ci: number, cj: number, r: number): number {
    const { nx, ny, u, v, mask } = this;
    let tot = 0, ok = 0;
    const r2 = r * r;
    for (let j = Math.max(0, Math.floor(cj - r)); j <= Math.min(ny - 1, Math.ceil(cj + r)); j++)
      for (let i = Math.max(0, Math.floor(ci - r)); i <= Math.min(nx - 1, Math.ceil(ci + r)); i++) {
        const dx = i - ci, dy = j - cj;
        if (dx * dx + dy * dy > r2) continue;
        const k = j * nx + i;
        if (!mask[k]) continue;
        tot++;
        if ((v[k] + this.b) / this.a < 0.55) ok++;
        u[k] = 1;
      }
    return tot ? ok / tot : 0;
  }

  /** Excite a straight band (used to seed plane waves for debug states). */
  stimulateRect(i0: number, j0: number, i1: number, j1: number) {
    for (let j = Math.max(0, j0); j < Math.min(this.ny, j1); j++)
      for (let i = Math.max(0, i0); i < Math.min(this.nx, i1); i++) {
        const k = j * this.nx + i;
        if (this.mask[k]) this.u[k] = 1;
      }
  }

  /**
   * Seed a broken wavefront whose free end sits at (ci, cj): the classic
   * initial condition that curls into a single rotor (debug / demo states).
   * dir = +1 → front travels +i, refractory tail on −i side; front spans j < cj.
   */
  seedBroken(ci: number, cj: number, dir = 1, up = true, width = 3, tail = 14) {
    const { nx, ny, u, v, mask } = this;
    const j0 = up ? 0 : cj, j1 = up ? cj : ny;
    for (let j = Math.max(0, j0); j < Math.min(ny, j1); j++)
      for (let d = -tail; d <= width; d++) {
        const i = ci + d * dir;
        if (i < 0 || i >= nx) continue;
        const k = j * nx + i;
        if (!mask[k]) continue;
        if (d >= 0) { u[k] = 1; v[k] = 0.1; } else { u[k] = 0; v[k] = 0.75 * (1 + d / tail) + 0.25; }
      }
  }

  /** "Defibrillation": depolarise all tissue at once → uniform state, re-entry dies. */
  shock() {
    const { u, v, mask } = this;
    for (let k = 0; k < u.length; k++) if (mask[k]) { u[k] = 1; v[k] = 0; }
  }

  reset() {
    this.u.fill(0);
    this.v.fill(0);
  }

  /** Pseudo-ECG: Σ ∇u · ∇(1/r) (unipolar electrogram at a distant electrode). */
  ecg(): number {
    const { nx, ny, u, wx, wy, mask } = this;
    let s = 0;
    for (let j = 1; j < ny - 1; j += 1) {
      const row = j * nx;
      for (let i = 1; i < nx - 1; i += 1) {
        const k = row + i;
        if (!mask[k]) continue;
        const gx = (mask[k + 1] ? u[k + 1] : u[k]) - (mask[k - 1] ? u[k - 1] : u[k]);
        const gy = (mask[k + nx] ? u[k + nx] : u[k]) - (mask[k - nx] ? u[k - nx] : u[k]);
        s += gx * wx[k] + gy * wy[k];
      }
    }
    return s;
  }

  /** Count phase singularities (rotor tips) via winding of θ = atan2(v - v*, u - u*). */
  phaseSingularities(stride = 2): { n: number; tips: [number, number][] } {
    const { nx, ny, u, v, mask } = this;
    const us = 0.5, vs = 0.35;
    const tips: [number, number][] = [];
    const ph = (k: number) => Math.atan2(v[k] - vs, u[k] - us);
    const wrap = (d: number) => (d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d);
    for (let j = 0; j < ny - stride; j += stride)
      for (let i = 0; i < nx - stride; i += stride) {
        const k00 = j * nx + i, k10 = k00 + stride, k11 = k10 + stride * nx, k01 = k00 + stride * nx;
        if (!mask[k00] || !mask[k10] || !mask[k11] || !mask[k01]) continue;
        const p0 = ph(k00), p1 = ph(k10), p2 = ph(k11), p3 = ph(k01);
        const w = wrap(p1 - p0) + wrap(p2 - p1) + wrap(p3 - p2) + wrap(p0 - p3);
        if (Math.abs(w) > Math.PI) {
          // merge with nearby tips
          if (!tips.some(([a, b]) => Math.abs(a - i) < 6 && Math.abs(b - j) < 6)) tips.push([i, j]);
        }
      }
    return { n: tips.length, tips };
  }
}
