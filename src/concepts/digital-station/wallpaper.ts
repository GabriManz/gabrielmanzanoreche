/**
 * Generative wallpaper: faint, striated cardiomyocyte-like fluorescence with a
 * few bright "sparks", a microscope reticle and an illustrative action-potential
 * trace. Purely decorative and synthetic.
 */
import { rng } from '../../shared/env';

export function paintWallpaper(cv: HTMLCanvasElement, seed = 11) {
  const r = rng(seed);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const Wd = window.innerWidth, Hd = window.innerHeight;
  cv.width = Math.round(Wd * dpr); cv.height = Math.round(Hd * dpr);
  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bg = c.createRadialGradient(Wd * 0.62, Hd * 0.38, 0, Wd * 0.62, Hd * 0.38, Math.max(Wd, Hd) * 0.85);
  bg.addColorStop(0, '#1a201c');
  bg.addColorStop(0.6, '#121513');
  bg.addColorStop(1, '#0b0c0b');
  c.fillStyle = bg;
  c.fillRect(0, 0, Wd, Hd);

  // Cells — roughly aligned like tissue.
  const tilt = -0.18;
  const n = Math.round((Wd * Hd) / (Wd < 720 ? 40000 : 90000)) + 4;
  const off = document.createElement('canvas');
  off.width = cv.width; off.height = cv.height;
  const o = off.getContext('2d')!;
  o.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = 0; i < n; i++) {
    const k = Math.min(1, Math.max(0.55, Wd / 1300));
    const L = (260 + r() * 260) * k, w = (54 + r() * 46) * k;
    const x = r() * (Wd + 200) - 100, y = r() * (Hd + 100) - 50;
    o.save();
    o.translate(x, y);
    o.rotate(tilt + (r() - 0.5) * 0.25);
    o.beginPath();
    o.roundRect(-L / 2, -w / 2, L, w, [w * 0.5, w * 0.3, w * 0.5, w * 0.3]);
    o.save();
    o.clip();
    const glow = (Wd < 720 ? 0.018 : 0.026) + r() * 0.03;
    o.fillStyle = `rgba(54,215,127,${glow})`;
    o.fillRect(-L / 2, -w / 2, L, w);
    for (let s = -L / 2; s < L / 2; s += 6.2) {
      o.fillStyle = `rgba(107,245,162,${glow * (0.9 + 0.6 * Math.sin(s * 0.03 + i))})`;
      o.fillRect(s, -w / 2, 2.1, w);
    }
    // nuclei (dark)
    o.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 1 + (r() > 0.5 ? 1 : 0); k++) {
      o.beginPath();
      o.ellipse((r() - 0.5) * L * 0.3, (r() - 0.5) * w * 0.2, 20, 8, 0, 0, Math.PI * 2);
      o.fillStyle = 'rgba(0,0,0,.6)';
      o.fill();
    }
    o.globalCompositeOperation = 'source-over';
    o.restore();
    o.strokeStyle = `rgba(107,245,162,${glow * 1.3})`;
    o.lineWidth = 1;
    o.stroke();
    o.restore();
  }
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.filter = `blur(${1.2 * dpr}px)`;
  c.globalCompositeOperation = 'lighter';
  c.drawImage(off, 0, 0);
  c.restore();
  c.globalCompositeOperation = 'lighter';
  // Sparks
  for (let i = 0; i < 9; i++) {
    const x = r() * Wd, y = r() * Hd, rad = 8 + r() * 16;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(180,255,210,.28)');
    g.addColorStop(0.4, 'rgba(54,215,127,.12)');
    g.addColorStop(1, 'rgba(54,215,127,0)');
    c.fillStyle = g;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  c.globalCompositeOperation = 'source-over';

  // Reticle crosses
  c.strokeStyle = 'rgba(214,208,195,.07)';
  c.lineWidth = 1;
  for (let x = 60; x < Wd; x += 120) for (let y = 60; y < Hd; y += 120) {
    c.beginPath(); c.moveTo(x - 4, y + 0.5); c.lineTo(x + 4, y + 0.5); c.moveTo(x + 0.5, y - 4); c.lineTo(x + 0.5, y + 4); c.stroke();
  }

  // Action-potential trace (illustrative)
  const base = Hd - 120, amp = 54, period = 300;
  c.beginPath();
  for (let x = 0; x <= Wd; x += 1) {
    const p = (x + 40) % period;
    let v = 0;
    if (p < 4) v = p / 4;                                  // upstroke
    else if (p < 12) v = 1 - 0.18 * ((p - 4) / 8);         // notch
    else if (p < 120) v = 0.82 - 0.12 * ((p - 12) / 108);  // plateau
    else if (p < 170) v = 0.7 * (1 - (p - 120) / 50) ** 1.6; // repolarisation
    c.lineTo(x, base - v * amp);
  }
  c.strokeStyle = 'rgba(255,91,31,.38)';
  c.lineWidth = 1.25;
  c.stroke();
  c.setLineDash([2, 5]);
  c.beginPath(); c.moveTo(0, base + 0.5); c.lineTo(Wd, base + 0.5);
  c.strokeStyle = 'rgba(214,208,195,.12)'; c.stroke();
  c.setLineDash([]);
  c.font = '500 10px "IBM Plex Mono", monospace';
  c.fillStyle = 'rgba(214,208,195,.32)';
  c.fillText(Wd < 720 ? 'Vm — ILLUSTRATIVE ACTION POTENTIAL' : 'Vm — ILLUSTRATIVE CARDIAC ACTION POTENTIAL · WALLPAPER: GENERATIVE, SYNTHETIC FLUORESCENCE', 18, base + 18);
}
