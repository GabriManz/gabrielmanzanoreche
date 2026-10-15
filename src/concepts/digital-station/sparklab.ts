/** SparkLab — the hero application: synthetic line-scan + real detection pass. */
import { W, H, DT, DX, generate, detect, render, type Scan, type Result } from './analysis';
import type { Ctx, AppInstance } from './wm';

export interface SparkLabApi extends AppInstance { run(animated?: boolean): void }

export function mountSparkLab(body: HTMLElement, ctx: Ctx): SparkLabApi {
  body.classList.add('sl');
  body.innerHTML = `
    <div class="sl-tools" role="toolbar" aria-label="SparkLab tools">
      <button class="btn btn-primary" data-act="run" type="button"><svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M2 1l7 4-7 4z" fill="currentColor"/></svg>Run detection</button>
      <button class="btn" data-act="regen" type="button"><svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M10 6a4 4 0 1 1-1.2-2.85M10 1.5v2.8H7.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>Regenerate</button>
      <span class="sl-sep" aria-hidden="true"></span>
      <div class="seg" role="radiogroup" aria-label="Look-up table">
        <button type="button" role="radio" aria-checked="true" data-lut="green">Green</button>
        <button type="button" role="radio" aria-checked="false" data-lut="fire">Fire</button>
      </div>
      <span class="sl-file mono" aria-live="polite"></span>
    </div>
    <p class="sl-honest"><span class="led" aria-hidden="true"></span><strong>Synthetic data</strong> — demonstration of an analysis workflow, not experimental results.</p>
    <figure class="sl-fig">
      <div class="sl-plot">
        <div class="sl-yax mono" aria-hidden="true"></div>
        <div class="sl-stage">
          <canvas class="sl-img" width="${W}" height="${H}" role="img" aria-label="Synthetic confocal line-scan image: space along the vertical axis, time along the horizontal axis, bright transient blobs are simulated calcium sparks."></canvas>
          <canvas class="sl-ovl" width="${W * 2}" height="${H * 2}" aria-hidden="true"></canvas>
          <span class="sl-bar-x mono" aria-hidden="true"><i></i>100 ms</span>
          <span class="sl-bar-y mono" aria-hidden="true"><i></i>2 µm</span>
        </div>
        <span></span>
        <div class="sl-xax mono" aria-hidden="true"></div>
      </div>
      <figcaption class="mono"><span>line-scan · x (µm) vs t (ms) · ${W} lines @ ${DT.toFixed(1)} ms · ${DX} µm/px</span>
        <span class="sl-legend"><i class="lg-box"></i>detected <i class="lg-miss"></i>missed (ground truth)</span></figcaption>
      <ol class="sl-pipe mono" aria-label="Detection pipeline">
        <li>F₀ (row × line median)</li><li>ΔF/F₀</li><li>smooth</li><li>σ via MAD</li><li>hysteresis 3σ/7σ</li><li>connected components</li><li>half-max widths</li>
      </ol>
    </figure>
    <div class="sl-results">
      <div class="sl-tablewrap well">
        <table class="sl-table">
          <caption class="vh">Detected sparks</caption>
          <thead><tr><th scope="col">#</th><th scope="col">t<sub>peak</sub> ms</th><th scope="col">x µm</th><th scope="col">ΔF/F₀</th><th scope="col">FWHM µm</th><th scope="col">FDHM ms</th><th scope="col">GT</th></tr></thead>
          <tbody></tbody>
        </table>
        <p class="sl-empty">Press <b>Run detection</b> to analyse the line-scan.</p>
      </div>
      <div class="sl-side">
        <dl class="sl-stats mono"></dl>
        <div class="sl-hist well"><div class="hist-bars" role="img" aria-label="Histogram of spark amplitudes"></div><div class="hist-ax mono" aria-hidden="true"><span>0</span><span>1</span><span>2</span><span>ΔF/F₀</span></div></div>
      </div>
    </div>
    <p class="vh" aria-live="polite" data-live></p>`;

  const $ = <T extends Element>(s: string) => body.querySelector(s) as T;
  const img = $<HTMLCanvasElement>('.sl-img').getContext('2d')!;
  const ovl = $<HTMLCanvasElement>('.sl-ovl').getContext('2d')!;
  const tbody = $<HTMLTableSectionElement>('tbody');
  const stats = $<HTMLDListElement>('.sl-stats');
  const hist = $<HTMLElement>('.hist-bars');
  const live = $<HTMLElement>('[data-live]');
  const runBtn = $<HTMLButtonElement>('[data-act="run"]');

  $<HTMLElement>('.sl-xax').innerHTML = [0, 100, 200, 300, 400, 500, 600, 700]
    .map((t) => `<span style="left:${(t / (W * DT)) * 100}%">${t}</span>`).join('');
  $<HTMLElement>('.sl-yax').innerHTML = [0, 5, 10, 15]
    .map((x) => `<span style="top:${(x / (H * DX)) * 100}%">${x}</span>`).join('');

  let seed = 42, lutName = 'green', scan: Scan, res: Result | null = null, raf = 0, hover = -1, revealT = W;

  const fmtSeed = () => `synthetic_${seed.toString(16).toUpperCase().padStart(4, '0')}.lsm`;

  function drawOverlay() {
    const S = 2;
    ovl.clearRect(0, 0, W * S, H * S);
    if (!res) return;
    ovl.lineWidth = 1.5;
    ovl.font = '600 15px "IBM Plex Mono", monospace';
    for (const d of res.dets) {
      if (d.t1 > revealT) continue;
      const on = d.id === hover;
      const x = (d.t0 - 2) * S, y = (d.y0 - 2) * S, w = (d.t1 - d.t0 + 4) * S, h = (d.y1 - d.y0 + 4) * S;
      ovl.strokeStyle = on ? '#ffffff' : d.matched ? '#ff6a2b' : '#ffd23d';
      ovl.setLineDash(d.matched ? [] : [5, 4]);
      ovl.strokeRect(x + 0.5, y + 0.5, w, h);
      // corner ticks
      ovl.setLineDash([]);
      const lx = x, ly = y > 22 ? y - 6 : y + h + 18;
      const label = String(d.id);
      const tw = ovl.measureText(label).width;
      ovl.fillStyle = on ? '#ffffff' : d.matched ? '#ff6a2b' : '#ffd23d';
      ovl.fillRect(lx, ly - 15, tw + 10, 19);
      ovl.fillStyle = '#111';
      ovl.fillText(label, lx + 5, ly);
      // peak marker
      ovl.beginPath();
      ovl.arc(d.tp * S, d.yp * S, on ? 4 : 2.5, 0, Math.PI * 2);
      ovl.fillStyle = on ? '#fff' : 'rgba(255,255,255,.85)';
      ovl.fill();
    }
    if (revealT >= W) {
      // Injected sparks the detector did not recover (known only because the data is synthetic).
      ovl.setLineDash([3, 3]);
      ovl.strokeStyle = 'rgba(255,255,255,.75)';
      ovl.fillStyle = 'rgba(255,255,255,.85)';
      ovl.font = '500 13px "IBM Plex Mono", monospace';
      for (const m of res.missed) {
        ovl.beginPath();
        ovl.arc(m.t * S, m.y * S, 16, 0, Math.PI * 2);
        ovl.stroke();
        ovl.fillText('missed', m.t * S + 20, m.y * S + 4);
      }
      ovl.setLineDash([]);
    }
    if (revealT < W) {
      const x = revealT * S;
      const g = ovl.createLinearGradient(x - 120, 0, x, 0);
      g.addColorStop(0, 'rgba(255,91,31,0)');
      g.addColorStop(1, 'rgba(255,91,31,.28)');
      ovl.fillStyle = g;
      ovl.fillRect(x - 120, 0, 120, H * S);
      ovl.fillStyle = '#ffb08c';
      ovl.fillRect(x - 1, 0, 2, H * S);
    }
  }

  function fill(upTo: number) {
    if (!res) return;
    const shown = res.dets.filter((d) => d.t1 <= upTo);
    tbody.innerHTML = shown.map((d) => `<tr data-id="${d.id}" tabindex="0">
      <td>${d.id}</td><td>${(d.tp * DT).toFixed(0)}</td><td>${(d.yp * DX).toFixed(1)}</td>
      <td><b>${d.amp.toFixed(2)}</b></td><td>${d.fwhm.toFixed(2)}</td><td>${d.fdhm.toFixed(0)}</td>
      <td>${d.matched ? '<span class="gt ok" title="Matches an injected spark">✓</span>' : '<span class="gt fp" title="No injected spark here: false positive">FP</span>'}</td></tr>`).join('');
    body.querySelector('.sl-empty')!.classList.toggle('is-hidden', shown.length > 0 || upTo < W);
    const done = upTo >= W;
    const mean = (f: (d: (typeof shown)[number]) => number) => shown.length ? shown.reduce((s, d) => s + f(d), 0) / shown.length : NaN;
    const n = (v: number, p: number) => (Number.isFinite(v) ? v.toFixed(p) : '—');
    stats.innerHTML = `
      <div class="big"><dt>sparks detected</dt><dd>${shown.length}</dd></div>
      <div class="big"><dt>recall vs injected</dt><dd>${done ? `${res.found}<small>/${res.injected}</small>` : '…'}</dd></div>
      <div><dt>mean ΔF/F₀</dt><dd>${n(mean((d) => d.amp), 2)}</dd></div>
      <div><dt>mean FWHM</dt><dd>${n(mean((d) => d.fwhm), 2)} µm</dd></div>
      <div><dt>mean FDHM</dt><dd>${n(mean((d) => d.fdhm), 0)} ms</dd></div>
      <div><dt>noise σ · FP</dt><dd>${res.sigma.toFixed(3)} · ${done ? res.falsePos : '…'}</dd></div>`;
    drawHist(shown.map((d) => d.amp));
  }

  function drawHist(a: number[]) {
    const bins = 14, max = 2.8;
    const c = new Array(bins).fill(0);
    for (const v of a) c[Math.min(bins - 1, Math.floor((v / max) * bins))]++;
    const top = Math.max(3, ...c);
    hist.innerHTML = c.map((k) => `<span style="height:${(k / top) * 100}%">${k ? `<b>${k}</b>` : ''}</span>`).join('');
    hist.setAttribute('aria-label', `Histogram of spark amplitudes, ${a.length} sparks, bins of ${(max / bins).toFixed(1)} ΔF/F0`);
  }

  function regenerate() {
    cancelAnimationFrame(raf);
    scan = generate(seed);
    render(scan, img, lutName);
    res = null; revealT = W;
    tbody.innerHTML = '';
    body.querySelector('.sl-empty')!.classList.remove('is-hidden');
    stats.innerHTML = `<div class="big"><dt>sparks detected</dt><dd>—</dd></div><div class="big"><dt>recall vs injected</dt><dd>—</dd></div>
      <div><dt>status</dt><dd>awaiting run</dd></div>`;
    drawHist([]);
    drawOverlay();
    $<HTMLElement>('.sl-file').textContent = fmtSeed();
  }

  function run(animated = !ctx.reduced) {
    cancelAnimationFrame(raf);
    res = detect(scan);
    runBtn.disabled = true;
    const finish = () => {
      revealT = W; drawOverlay(); fill(W); runBtn.disabled = false;
      live.textContent = `Detection complete: ${res!.dets.length} sparks detected, ${res!.found} of ${res!.injected} injected sparks recovered.`;
    };
    if (!animated) return finish();
    const t0 = performance.now(), dur = 1400;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      revealT = Math.floor(p * W);
      drawOverlay(); fill(revealT);
      if (p < 1) raf = requestAnimationFrame(step); else finish();
    };
    raf = requestAnimationFrame(step);
  }

  body.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button');
    if (!b) return;
    if (b.dataset.act === 'run') run();
    if (b.dataset.act === 'regen') { seed = (Math.random() * 0xffff) | 0; regenerate(); }
    if (b.dataset.lut) {
      lutName = b.dataset.lut;
      body.querySelectorAll('[data-lut]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      render(scan, img, lutName);
    }
  });
  const setHover = (e: Event) => {
    const tr = (e.target as Element).closest('tr[data-id]') as HTMLElement | null;
    hover = tr ? Number(tr.dataset.id) : -1;
    drawOverlay();
  };
  tbody.addEventListener('pointerover', setHover);
  tbody.addEventListener('focusin', setHover);
  tbody.addEventListener('pointerleave', () => { hover = -1; drawOverlay(); });
  tbody.addEventListener('focusout', () => { hover = -1; drawOverlay(); });

  regenerate();
  return { run, focusTarget: () => runBtn };
}
