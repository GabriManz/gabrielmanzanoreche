/**
 * "Look through the microscope": a circular field of view showing a synthetic
 * fluorescence image of a striated cell with stochastic calcium sparks.
 * Illustrative only — not real data.
 */
import { sectionHTML } from '../../shared/chrome';
import { prefersReducedMotion, rng } from '../../shared/env';
import { leave } from '../../shared/transition';
import { CHAPTERS, pageUrl } from '../../shared/chapters';

export function openEyepiece() {
  const wrap = document.createElement('div');
  wrap.className = 'sr-eyepiece';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', 'Microscope view');
  wrap.innerHTML = `
    <div class="sr-ep-view"><canvas width="300" height="300"></canvas><span class="sr-ep-scale">10 µm</span></div>
    <div class="sr-ep-text">
      <p class="sr-eyebrow">Through the eyepiece · synthetic fluorescence</p>
      ${sectionHTML('research')}
      <p class="sr-ep-note">Illustration: a cardiomyocyte with stochastic calcium sparks. Not experimental data.</p>
      <div class="sr-ep-actions">
        <button class="sr-ep-dive">Enter the cell · Chapter 1 →</button>
        <button class="sr-ep-close">Back to the desk <kbd>Esc</kbd></button>
      </div>
    </div>`;
  document.body.append(wrap);
  const btn = wrap.querySelector<HTMLButtonElement>('.sr-ep-close')!;
  btn.focus();

  const cv = wrap.querySelector('canvas')!;
  const g = cv.getContext('2d')!;
  const N = 300, r = rng(9), K = N / 560; // geometry authored at 560 px
  const sparks: { x: number; y: number; t: number }[] = [];
  const img = g.createImageData(N, N);
  const base = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // tilted elongated cell with sarcomeric striations (~ every 18 px)
    const u = ((x - N / 2) * 0.94 + (y - N / 2) * 0.34) / K, v = (-(x - N / 2) * 0.34 + (y - N / 2) * 0.94) / K;
    const cell = Math.exp(-Math.pow(v / 120, 6)) * Math.exp(-Math.pow(u / 330, 8));
    const stri = 0.75 + 0.25 * Math.cos((u / 18) * Math.PI * 2);
    base[y * N + x] = cell * stri * (0.22 + 0.06 * r());
  }
  let raf = 0, t = 0;
  const reduced = prefersReducedMotion();
  const frame = () => {
    t += 1;
    if (r() < 0.08) {
      const u = (r() - 0.5) * 560 * K, v = (r() - 0.5) * 200 * K;
      sparks.push({ x: N / 2 + u * 0.94 - v * 0.34, y: N / 2 + u * 0.34 + v * 0.94, t: 0 });
    }
    const d = img.data;
    for (let i = 0; i < N * N; i++) {
      let f = base[i];
      const x = i % N, y = (i / N) | 0;
      for (const s of sparks) {
        const dx = x - s.x, dy = y - s.y;
        const amp = s.t < 4 ? s.t / 4 : Math.exp(-(s.t - 4) / 12);
        const w = (9 + s.t * 0.6) * K;
        const q = (dx * dx + dy * dy) / (w * w);
        if (q < 9) f += amp * 1.1 * Math.exp(-q) * (base[i] > 0.05 ? 1 : 0.2);
      }
      f = Math.min(1, f + (r() - 0.5) * 0.04);
      // green fluorescence LUT
      d[i * 4] = f > 0.7 ? (f - 0.7) * 850 : 0;
      d[i * 4 + 1] = Math.min(255, f * 330);
      d[i * 4 + 2] = f * 80;
      d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (const s of sparks) s.t += 1;
    while (sparks.length && sparks[0].t > 60) sparks.shift();
    if (!reduced) raf = requestAnimationFrame(frame);
  };
  frame();

  const close = () => {
    cancelAnimationFrame(raf);
    wrap.remove();
    removeEventListener('keydown', onKey);
    dispatchEvent(new Event('sr:eyepiece-closed'));
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  btn.addEventListener('click', close);
  wrap.querySelector('.sr-ep-dive')!.addEventListener('click', () => {
    // close the iris onto the centre of the eyepiece: the field of view becomes the cell
    const r = wrap.querySelector('.sr-ep-view')!.getBoundingClientRect();
    leave(pageUrl(CHAPTERS[0].slug), { x: r.left + r.width / 2, y: r.top + r.height / 2, color: CHAPTERS[0].color });
  });
  addEventListener('keydown', onKey);
}
