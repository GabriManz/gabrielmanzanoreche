/** Sweeping monitor-style trace for the pseudo-ECG (Canvas 2D). */
export class EcgStrip {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private buf = new Float32Array(0);
  private head = 0;
  private acc = 0;
  private peak = 1e-6;

  constructor(private canvas: HTMLCanvasElement, private pxPerStep = 0.55) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(10, Math.round(r.width));
    const h = Math.max(10, Math.round(r.height));
    if (w === this.w && h === this.h) return;
    const old = this.buf;
    this.w = w; this.h = h;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.buf = new Float32Array(w).fill(NaN);
    this.buf.set(old.subarray(0, Math.min(old.length, w)));
    if (this.head >= w) this.head = 0;
  }

  setSpeed(pxPerStep: number) { this.pxPerStep = pxPerStep; }

  /** Push the latest sample after `steps` simulation steps. */
  push(value: number, steps: number) {
    // slow automatic gain control (like a monitor's auto-scale)
    this.peak = Math.max(Math.abs(value), this.peak * Math.pow(0.9995, steps));
    const y = value / Math.max(this.peak, 1e-6);
    this.acc += steps * this.pxPerStep;
    const n = Math.floor(this.acc);
    this.acc -= n;
    const prev = this.buf[(this.head - 1 + this.w) % this.w];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.buf[this.head] = Number.isNaN(prev) ? y : prev + (y - prev) * t;
      this.head = (this.head + 1) % this.w;
    }
  }

  draw(color: string, flatline = false) {
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // monitor paper grid
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0.5; x < w; x += 12) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = (h / 2) % 12 + 0.5; y < h; y += 12) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.12)';
    ctx.beginPath();
    for (let x = 0.5; x < w; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    ctx.stroke();

    const mid = h * 0.55, amp = h * 0.4;
    const gap = 26;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const pass = (lw: number, alpha: number) => {
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lw;
      ctx.beginPath();
      let pen = false;
      for (let x = 0; x < w; x++) {
        const ahead = (x - this.head + w) % w;
        const val = this.buf[x];
        if (ahead < gap || Number.isNaN(val)) { pen = false; continue; }
        const y = mid - Math.max(-1.3, Math.min(1.3, flatline ? 0 : val)) * amp;
        if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    pass(5, 0.12);
    pass(1.6, 1);
    ctx.globalAlpha = 1;
    // write head
    const hx = (this.head - 1 + w) % w;
    const hv = this.buf[hx];
    if (!Number.isNaN(hv)) {
      const y = mid - Math.max(-1.3, Math.min(1.3, hv)) * amp;
      const g = ctx.createRadialGradient(hx, y, 0, hx, y, 10);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(hx - 10, y - 10, 20, 20);
    }
  }
}
