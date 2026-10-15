/** The workstation monitor: a live CanvasTexture (editor + synthetic Ca²⁺ trace). */
import * as THREE from 'three';
import { rng } from '../../shared/env';

const LINES = [
  ['# analysis/sparks.py', '#6c7a89'],
  ['import numpy as np', '#c792ea'],
  ['from skimage import filters, measure', '#c792ea'],
  ['', ''],
  ['def detect_sparks(linescan, k=3.8):', '#82aaff'],
  ['    f0 = np.median(linescan, axis=0)', '#d6deeb'],
  ['    dff = (linescan - f0) / f0', '#d6deeb'],
  ['    mask = dff > k * mad(dff)', '#d6deeb'],
  ['    return measure.label(mask)', '#d6deeb'],
  ['', ''],
  ['# synthetic demo data only', '#6c7a89'],
] as const;

export function createScreen() {
  const W = 1024, H = 594;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const r = rng(42);
  const trace: number[] = [];
  let phase = 0, last = 0;

  function sample() {
    // synthetic calcium transient train: fast upstroke, exponential decay + noise + rare sparks
    phase += 1 / 90;
    const t = phase % 1;
    const transient = t < 0.06 ? t / 0.06 : Math.exp(-(t - 0.06) * 5);
    const spark = r() < 0.01 ? 0.35 : 0;
    trace.push(0.15 + 0.7 * transient + spark + (r() - 0.5) * 0.05);
    if (trace.length > 300) trace.shift();
  }

  function draw(t: number) {
    g.fillStyle = '#0b1018';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#121a26';
    g.fillRect(0, 0, W, 34);
    g.font = '500 17px "IBM Plex Mono", monospace';
    g.fillStyle = '#8fa3b8';
    g.fillText('sparks.py — ~/research/calcium', 18, 23);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(W - 70 + i * 22, 17, 6, 0, 7); g.fill(); });
    g.font = '19px "IBM Plex Mono", monospace';
    LINES.forEach(([s, col], i) => {
      g.fillStyle = '#3b4a5c';
      g.fillText(String(i + 1).padStart(2), 16, 70 + i * 26);
      g.fillStyle = col || '#d6deeb';
      g.fillText(s, 58, 70 + i * 26);
    });
    if (Math.floor(t * 1.6) % 2 === 0) { g.fillStyle = '#ffb35c'; g.fillRect(58 + 9 * 11.4, 70 + 10 * 26 - 18, 11, 22); }
    // live trace panel
    const px = 600, py = 52, pw = 400, ph = 250;
    g.strokeStyle = '#1f2b3b'; g.lineWidth = 1;
    g.strokeRect(px, py, pw, ph);
    g.fillStyle = '#5c6f86'; g.font = '15px "IBM Plex Mono", monospace';
    g.fillText('ΔF/F₀ · synthetic', px + 10, py + 22);
    g.beginPath();
    trace.forEach((v, i) => {
      const x = px + (i / 300) * pw, y = py + ph - 20 - v * (ph - 50);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = '#7dffb0'; g.lineWidth = 2.5; g.shadowColor = '#7dffb0'; g.shadowBlur = 10;
    g.stroke(); g.shadowBlur = 0;
    // status bar
    g.fillStyle = '#ffb35c'; g.fillRect(0, H - 30, W, 30);
    g.fillStyle = '#1a1206'; g.font = '600 16px "IBM Plex Mono", monospace';
    g.fillText('● main   Python 3   github.com/GabriManz', 16, H - 10);
    texture.needsUpdate = true;
  }

  return {
    texture,
    update(t: number) {
      if (t - last < 1 / 30) return;
      last = t;
      sample();
      draw(t);
    },
  };
}
